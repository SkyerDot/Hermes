/**
 * Server-owned tool loop state machine (spec §5.5).
 *
 * Handles the complete lifecycle:
 * 1. Classify ownership of tool calls
 * 2. Execute server-owned tools
 * 3. Serialize results within UTF-8 byte budgets
 * 4. Build accumulated transcript and resume upstream
 * 5. Terminate on any boundary condition
 */

import type {
  ServerOwnedToolLoopOptions,
  ServerOwnedToolLoopResult,
  NonStreamingProviderLegResult,
  ProviderLegUsage,
  ProviderLegReceipt,
  ChatCoreErrorResult,
  ExecutedToolResult,
  BoundedToolResult,
  BuildFollowUpTranscriptInput,
  ToolCall,
} from "./toolLoopTypes.ts";
import {
  classifyServerOwnedCalls,
  extractToolCalls,
  formatEscapeHatchResponse,
  ServerOwnedExecutionError,
} from "./interception.ts";
import { createErrorResult } from "@omniroute/open-sse/utils/error.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_FOLLOW_UPS = 3;
export const LOOP_BUDGET_MS = 120_000;
export const MIN_REMAINING_FOR_FOLLOW_UP_MS = 10_000;

// ─── Usage aggregation ────────────────────────────────────────────────────────

export function aggregateProviderLegUsage(
  usages: Array<ProviderLegUsage | null>
): ProviderLegUsage {
  let prompt_tokens = 0;
  let completion_tokens = 0;
  let cached_tokens: number | undefined;
  let cache_read_input_tokens: number | undefined;
  let cache_creation_input_tokens: number | undefined;
  let reasoning_tokens: number | undefined;
  let cost_in_usd_ticks: number | undefined;

  for (const u of usages) {
    if (!u) continue;
    prompt_tokens += u.prompt_tokens;
    completion_tokens += u.completion_tokens;
    if (u.cached_tokens !== undefined) {
      cached_tokens = (cached_tokens ?? 0) + u.cached_tokens;
    }
    if (u.cache_read_input_tokens !== undefined) {
      cache_read_input_tokens = (cache_read_input_tokens ?? 0) + u.cache_read_input_tokens;
    }
    if (u.cache_creation_input_tokens !== undefined) {
      cache_creation_input_tokens =
        (cache_creation_input_tokens ?? 0) + u.cache_creation_input_tokens;
    }
    if (u.reasoning_tokens !== undefined) {
      reasoning_tokens = (reasoning_tokens ?? 0) + u.reasoning_tokens;
    }
    if (u.cost_in_usd_ticks !== undefined) {
      cost_in_usd_ticks = (cost_in_usd_ticks ?? 0) + u.cost_in_usd_ticks;
    }
  }

  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
    ...(cached_tokens !== undefined ? { cached_tokens } : {}),
    ...(cache_read_input_tokens !== undefined ? { cache_read_input_tokens } : {}),
    ...(cache_creation_input_tokens !== undefined ? { cache_creation_input_tokens } : {}),
    ...(reasoning_tokens !== undefined ? { reasoning_tokens } : {}),
    ...(cost_in_usd_ticks !== undefined ? { cost_in_usd_ticks } : {}),
  };
}

function aggregateUsageOrNull(usages: Array<ProviderLegUsage | null>): ProviderLegUsage | null {
  const hasNonNull = usages.some((u) => u !== null);
  if (!hasNonNull) return null;
  return aggregateProviderLegUsage(usages);
}

// ─── Execution error → errorResult mapping ────────────────────────────────────

function mapExecutionError(err: ServerOwnedExecutionError): ChatCoreErrorResult {
  return createErrorResult(
    err.httpStatus,
    err.message,
    null,
    err.code,
    "server_tool_execution_error"
  ) as unknown as ChatCoreErrorResult;
}

// ─── State machine ────────────────────────────────────────────────────────────

export async function runServerOwnedToolLoop(
  options: ServerOwnedToolLoopOptions
): Promise<ServerOwnedToolLoopResult> {
  const now = options.now ?? performance.now.bind(performance);
  const loopStartedAtMs = now();
  const loopDeadlineAtMs = Math.min(options.deadlineAtMs, loopStartedAtMs + LOOP_BUDGET_MS);

  const maxFollowUps = options.maxFollowUps ?? MAX_FOLLOW_UPS;
  const maxResultBytes = options.maxResultBytes ?? MAX_RESULT_BYTES_PER_TOOL;
  const maxTotalResultBytes = options.maxTotalResultBytes ?? MAX_RESULT_BYTES_TOTAL;

  // State
  let currentSourceBody = options.sourceBody;
  let currentLeg: NonStreamingProviderLegResult = options.initialLeg;
  let cumulativeOutputBytes = 0;
  let followUps = 0;
  const receipts: ProviderLegReceipt[] = [options.initialLeg.receipt];
  const usages: Array<ProviderLegUsage | null> = [options.initialLeg.usage];

  // Accumulate initial leg receipt cost
  let totalCostUsd = options.initialLeg.receipt.computedCostUsd ?? 0;

  const errorResult: (msg: string, status?: number, code?: string) => ServerOwnedToolLoopResult = (
    msg,
    status = 500,
    code = "internal_error"
  ) => ({
    kind: "error",
    upstreamHttpSelection: null,
    errorResult: createErrorResult(status, msg, null, code) as unknown as ChatCoreErrorResult,
    cumulativeUsage: aggregateUsageOrNull(usages),
    totalCostUsd,
    receipts,
    followUps,
    termination: "provider_error",
  });

  // Main loop
  while (true) {
    // Extract tool calls from current leg response
    const response = currentLeg.kind === "ok" ? currentLeg.response : undefined;
    if (!response) {
      return errorResult("No response from provider leg");
    }

    // Extract tool calls by actual source format, not model alias heuristic
    const toolCalls = extractToolCalls(response, options.sourceFormat);

    // Classify ownership
    const { serverOwned, clientNative } = await classifyServerOwnedCalls(
      toolCalls,
      options.executionContext
    );

    // No server-owned calls → done
    if (serverOwned.length === 0) {
      const termination = clientNative.length > 0 ? "client_tools" : "completed";
      return {
        kind: "ok",
        upstreamHttpSelection: currentLeg.upstreamHttpSelection ?? null,
        response: currentLeg.kind === "ok" ? currentLeg.response : undefined,
        responseForMemoryExtraction:
          currentLeg.kind === "ok" ? currentLeg.responseForMemoryExtraction : undefined,
        finalProviderBody: currentLeg.kind === "ok" ? currentLeg.providerBody : undefined,
        finalProviderRequest: currentLeg.kind === "ok" ? currentLeg.providerRequest : undefined,
        cumulativeUsage: aggregateUsageOrNull(usages),
        totalCostUsd,
        receipts,
        followUps,
        termination,
      };
    }

    // Mixed tools → escape hatch, no follow-up
    if (clientNative.length > 0) {
      // Check abort before execute
      if (options.abortSignal?.aborted) {
        return {
          kind: "error",
          upstreamHttpSelection: null,
          errorResult: createErrorResult(
            499,
            "Client closed request",
            null,
            "client_closed_request",
            "invalid_request_error"
          ) as unknown as ChatCoreErrorResult,
          cumulativeUsage: aggregateUsageOrNull(usages),
          totalCostUsd,
          receipts,
          followUps,
          termination: "client_abort",
        };
      }

      // Execute server calls, then format with bounded serialization
      const execResults = await options.executeServerOwned(serverOwned, options.executionContext);

      // Build serialized text map using bounded serialization
      const serMap = new Map<string, string>();
      let remainingBytes = maxTotalResultBytes;
      for (const r of execResults) {
        const itemMaxBytes = Math.min(maxResultBytes, remainingBytes);
        const bounded = serializeBoundedToolResult(r.result, itemMaxBytes);
        serMap.set(r.id, bounded.text);
        remainingBytes -= Buffer.byteLength(bounded.text, "utf8");
      }

      const formatted = formatEscapeHatchResponse(
        response,
        serverOwned,
        execResults,
        clientNative,
        options.sourceFormat,
        serMap
      );

      return {
        kind: "ok",
        upstreamHttpSelection: currentLeg.upstreamHttpSelection ?? null,
        response: formatted,
        responseForMemoryExtraction:
          currentLeg.kind === "ok" ? currentLeg.responseForMemoryExtraction : undefined,
        finalProviderBody: currentLeg.kind === "ok" ? currentLeg.providerBody : undefined,
        finalProviderRequest: currentLeg.kind === "ok" ? currentLeg.providerRequest : undefined,
        cumulativeUsage: aggregateUsageOrNull(usages),
        totalCostUsd,
        receipts,
        followUps,
        termination: "mixed_tools",
      };
    }

    // All server-owned: check abort before execute
    if (options.abortSignal?.aborted) {
      return {
        kind: "error",
        upstreamHttpSelection: null,
        errorResult: createErrorResult(
          499,
          "Client closed request",
          null,
          "client_closed_request",
          "invalid_request_error"
        ) as unknown as ChatCoreErrorResult,
        cumulativeUsage: aggregateUsageOrNull(usages),
        totalCostUsd,
        receipts,
        followUps,
        termination: "client_abort",
      };
    }

    // Execute server-owned calls
    let execResults: ExecutedToolResult[];
    try {
      execResults = await options.executeServerOwned(serverOwned, options.executionContext);
    } catch (err: unknown) {
      if (err instanceof ServerOwnedExecutionError) {
        const termMap: Record<string, ServerOwnedToolLoopResult["termination"]> = {
          TOOL_IN_PROGRESS: "execution_in_progress",
          TOOL_STATE_UNKNOWN: "execution_unknown",
          IDENTITY_CONFLICT: "execution_identity_conflict",
          TOOL_EXECUTION_ERROR: "execution_error",
          TOOL_EXECUTION_TIMEOUT: "execution_timeout",
        };
        const termination = termMap[err.code] ?? "execution_error";
        return {
          kind: "error",
          upstreamHttpSelection: null,
          errorResult: mapExecutionError(err),
          cumulativeUsage: aggregateUsageOrNull(usages),
          totalCostUsd,
          receipts,
          followUps,
          termination,
        };
      }
      throw err;
    }

    // Serialize results with cumulative UTF-8 budget
    const serMap = new Map<string, string>();
    let anyTruncated = false;
    let remainingBytes = maxTotalResultBytes - cumulativeOutputBytes;
    if (remainingBytes < 0) remainingBytes = 0;

    for (const r of execResults) {
      const itemMaxBytes = Math.min(maxResultBytes, remainingBytes);
      const bounded = serializeBoundedToolResult(r.result, itemMaxBytes);
      serMap.set(r.id, bounded.text);
      const bytes = Buffer.byteLength(bounded.text, "utf8");
      cumulativeOutputBytes += bytes;
      remainingBytes -= bytes;
      if (bounded.truncated) {
        anyTruncated = true;
      }
    }

    const finishBoundary = (
      termination: "tool_output_budget" | "max_followups" | "deadline"
    ): ServerOwnedToolLoopResult => {
      const formatted = formatEscapeHatchResponse(
        response,
        serverOwned,
        execResults,
        [],
        options.sourceFormat,
        serMap
      );

      return {
        kind: "ok",
        upstreamHttpSelection: currentLeg.upstreamHttpSelection ?? null,
        response: formatted,
        responseForMemoryExtraction:
          currentLeg.kind === "ok" ? currentLeg.responseForMemoryExtraction : undefined,
        finalProviderBody: currentLeg.kind === "ok" ? currentLeg.providerBody : undefined,
        finalProviderRequest: currentLeg.kind === "ok" ? currentLeg.providerRequest : undefined,
        cumulativeUsage: aggregateUsageOrNull(usages),
        totalCostUsd,
        receipts,
        followUps,
        termination,
      };
    };

    // Preserve boundary precedence and avoid reading the clock for earlier limits.
    if (anyTruncated || cumulativeOutputBytes >= maxTotalResultBytes) {
      return finishBoundary("tool_output_budget");
    }
    if (followUps >= maxFollowUps) {
      return finishBoundary("max_followups");
    }
    const remainingMs = loopDeadlineAtMs - now();
    if (remainingMs < MIN_REMAINING_FOR_FOLLOW_UP_MS) {
      return finishBoundary("deadline");
    }

    // Check abort before resume
    if (options.abortSignal?.aborted) {
      return {
        kind: "error",
        upstreamHttpSelection: null,
        errorResult: createErrorResult(
          499,
          "Client closed request",
          null,
          "client_closed_request",
          "invalid_request_error"
        ) as unknown as ChatCoreErrorResult,
        cumulativeUsage: aggregateUsageOrNull(usages),
        totalCostUsd,
        receipts,
        followUps,
        termination: "client_abort",
      };
    }

    // Build accumulated transcript
    const nextSourceBody = buildFollowUpSourceBody({
      sourceBody: currentSourceBody,
      previousResponse: response,
      toolCalls: serverOwned,
      results: execResults,
      sourceFormat: options.sourceFormat,
      maxResultBytes,
      maxTotalResultBytes: maxTotalResultBytes - cumulativeOutputBytes,
      serializedResultTextById: serMap,
    });

    // Resume upstream
    const nextLeg = await options.resumeUpstream(
      nextSourceBody,
      options.initialLeg.connectionId,
      loopDeadlineAtMs
    );

    // Provider error → preserve identity
    if (nextLeg.kind === "error") {
      receipts.push(nextLeg.receipt);
      usages.push(nextLeg.usage);
      totalCostUsd += nextLeg.receipt.computedCostUsd ?? 0;

      return {
        kind: "error",
        upstreamHttpSelection: nextLeg.upstreamHttpSelection ?? null,
        errorResult: nextLeg.result,
        cumulativeUsage: aggregateUsageOrNull(usages),
        totalCostUsd,
        receipts,
        followUps: followUps + 1,
        termination: "provider_error",
      };
    }

    // Connection mismatch check
    if (nextLeg.connectionId !== options.initialLeg.connectionId) {
      receipts.push(nextLeg.receipt);
      usages.push(nextLeg.usage);
      totalCostUsd += nextLeg.receipt.computedCostUsd ?? 0;

      return {
        kind: "error",
        upstreamHttpSelection: null,
        errorResult: createErrorResult(
          409,
          "Follow-up connection does not match initial connection",
          null,
          "LEASE_CONNECTION_MISMATCH",
          "lease_error"
        ) as unknown as ChatCoreErrorResult,
        cumulativeUsage: aggregateUsageOrNull(usages),
        totalCostUsd,
        receipts,
        followUps: followUps + 1,
        termination: "connection_mismatch",
      };
    }

    // Update state for next iteration
    currentSourceBody = nextSourceBody;
    currentLeg = nextLeg;
    followUps++;
    receipts.push(nextLeg.receipt);
    usages.push(nextLeg.usage);
    totalCostUsd += nextLeg.receipt.computedCostUsd ?? 0;
  }
}

// ─── Inlined follow-up transcript helpers (surface removed from Hermes) ────

export const MAX_RESULT_BYTES_PER_TOOL = 32_768;
export const MAX_RESULT_BYTES_TOTAL = 65_536;

const NON_SERIALIZABLE_ERROR = "Tool result is not JSON-serializable";

function assertValidBudget(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite integer, got ${value}`);
  }
}

function markerFor(droppedBytes: number): string {
  return `[TRUNCATED ${droppedBytes} BYTES BY OMNIROUTE]`;
}

/**
 * Returns the longest code-point-aligned prefix of `text` whose UTF-8 byte
 * length does not exceed `maxBytes`. Iterating `for...of` over a string yields
 * full code points, so surrogate pairs (astral CJK, emoji) are never split and
 * the result is always valid UTF-8.
 */
function truncateToCodePointBoundary(text: string, maxBytes: number): string {
  let out = "";
  let bytes = 0;
  for (const codePoint of text) {
    const codePointBytes = Buffer.byteLength(codePoint, "utf8");
    if (bytes + codePointBytes > maxBytes) break;
    out += codePoint;
    bytes += codePointBytes;
  }
  return out;
}

function projectSerializable(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Error) return { error: value.message };
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function serializeBoundedToolResult(value: unknown, maxBytes: number): BoundedToolResult {
  assertValidBudget("maxBytes", maxBytes);

  const projected = projectSerializable(value);

  let serialized: string | undefined;
  try {
    const raw = JSON.stringify(projected);
    serialized = typeof raw === "string" ? raw : undefined;
  } catch {
    serialized = undefined;
  }

  // Top-level function/symbol (JSON.stringify returns undefined, not a string)
  // and serialization exceptions (cycles, nested BigInt, exotic objects) all
  // resolve to the fixed non-serializable error shape.
  if (serialized === undefined) {
    serialized = JSON.stringify({ error: NON_SERIALIZABLE_ERROR });
  }

  const originalBytes = Buffer.byteLength(serialized, "utf8");
  if (originalBytes <= maxBytes) {
    return { text: serialized, truncated: false, originalBytes };
  }

  const fullMarker = markerFor(originalBytes);
  const fullMarkerBytes = Buffer.byteLength(fullMarker, "utf8");

  // The full marker alone does not fit: return its code-point-safe UTF-8 prefix
  // (maxBytes 0 yields the empty string).
  if (maxBytes <= fullMarkerBytes) {
    return {
      text: truncateToCodePointBoundary(fullMarker, maxBytes),
      truncated: true,
      originalBytes,
    };
  }

  // Reserve marker space first, then take the longest valid prefix of the text.
  // `dropped <= originalBytes` so markerFor(dropped) is never longer than the
  // reserved marker; the total therefore stays within maxBytes.
  const prefixBudget = maxBytes - fullMarkerBytes;
  const prefix = truncateToCodePointBoundary(serialized, prefixBudget);
  const droppedBytes = originalBytes - Buffer.byteLength(prefix, "utf8");

  return {
    text: prefix + markerFor(droppedBytes),
    truncated: true,
    originalBytes,
  };
}

function safeStringifyArguments(value: Record<string, unknown>): string {
  try {
    const raw = JSON.stringify(value);
    return typeof raw === "string" ? raw : "{}";
  } catch {
    return "{}";
  }
}

function validateCallsAndResults(toolCalls: ToolCall[], results: ExecutedToolResult[]): void {
  if (toolCalls.length !== results.length) {
    throw new Error(
      `buildFollowUpSourceBody requires toolCalls (${toolCalls.length}) and results (${results.length}) to have the same length`
    );
  }

  const callIds = toolCalls.map((call) => call.id);
  const resultIds = results.map((result) => result.id);

  if (new Set(callIds).size !== callIds.length) {
    throw new Error("buildFollowUpSourceBody requires unique tool call ids");
  }
  if (new Set(resultIds).size !== resultIds.length) {
    throw new Error("buildFollowUpSourceBody requires unique tool result ids");
  }

  const resultIdSet = new Set(resultIds);
  for (const id of callIds) {
    if (!resultIdSet.has(id)) {
      throw new Error(
        `buildFollowUpSourceBody requires every tool call to have a matching result (missing: ${id})`
      );
    }
  }

  for (const result of results) {
    const call = toolCalls.find((c) => c.id === result.id);
    if (call && call.name !== result.name) {
      throw new Error(
        `buildFollowUpSourceBody: result name "${result.name}" for id "${result.id}" does not match tool call name "${call.name}"`
      );
    }
  }
}

function extractOpenAIMessage(response: Record<string, unknown>): Record<string, unknown> | null {
  const choice = Array.isArray(response.choices) ? (response.choices[0] as unknown) : null;
  if (choice && typeof choice === "object") {
    const message = (choice as Record<string, unknown>).message;
    if (message && typeof message === "object" && !Array.isArray(message)) {
      return message as Record<string, unknown>;
    }
  }
  if (
    response.message &&
    typeof response.message === "object" &&
    !Array.isArray(response.message)
  ) {
    return response.message as Record<string, unknown>;
  }
  return null;
}

/**
 * Returns the assistant tool_calls exactly as the previous response carried
 * them (provenance preserved), restricted to calls with a matching result.
 * Falls back to reconstructing the OpenAI wire shape from the parsed
 * `toolCalls` when the response has no tool_calls of its own.
 *
 * When the previous response does carry tool_calls, validates that each
 * call ID appears exactly once with the correct name (fails closed on
 * partial, duplicate, or mismatched entries).
 */
function resolveOpenAIAssistantToolCalls(
  previousResponse: Record<string, unknown>,
  toolCalls: ToolCall[],
  matchedIds: Set<string>
): unknown[] {
  let originalToolCalls: unknown[] = [];
  const prevMessage = extractOpenAIMessage(previousResponse);
  if (prevMessage && Array.isArray(prevMessage.tool_calls)) {
    originalToolCalls = prevMessage.tool_calls as unknown[];
  }
  if (originalToolCalls.length === 0 && toolCalls.length > 0) {
    originalToolCalls = toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: safeStringifyArguments(call.arguments) },
    }));
  }

  // Validate when previous response carries its own tool_calls.
  const hasOwnToolCalls =
    prevMessage && Array.isArray(prevMessage.tool_calls) && prevMessage.tool_calls.length > 0;
  if (hasOwnToolCalls) {
    const idCounts = new Map<string, number>();
    const idNames = new Map<string, string>();
    for (const raw of originalToolCalls) {
      if (!raw || typeof raw !== "object") continue;
      const rec = raw as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : undefined;
      if (id === undefined) continue;
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      if (idNames.has(id)) continue;
      const fn = rec.function;
      if (
        fn &&
        typeof fn === "object" &&
        typeof (fn as Record<string, unknown>).name === "string"
      ) {
        idNames.set(id, (fn as Record<string, unknown>).name as string);
      }
    }
    for (const call of toolCalls) {
      if (!matchedIds.has(call.id)) continue;
      const count = idCounts.get(call.id) ?? 0;
      if (count !== 1) {
        throw new Error(
          `buildFollowUpSourceBody: previous response tool_calls must contain exactly one match per call ID (id "${call.id}" has ${count})`
        );
      }
      const prevName = idNames.get(call.id);
      if (prevName !== undefined && prevName !== call.name) {
        throw new Error(
          `buildFollowUpSourceBody: previous response tool_call "${call.id}" name "${prevName}" does not match tool call name "${call.name}"`
        );
      }
    }
  }

  return originalToolCalls.filter((call) => {
    if (!call || typeof call !== "object") return false;
    const record = call as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : record.call_id;
    return typeof id === "string" && matchedIds.has(id);
  });
}

/**
 * Resolves tool_use blocks from the Claude previous response. When content
 * blocks are present, validates that each call ID appears exactly once with
 * the correct name (fails closed on partial, duplicate, or mismatched).
 * Non-tool content blocks (text, thinking, reasoning) are preserved in their
 * original order; only tool_use blocks are filtered to matched IDs.
 */
function resolveClaudeToolUseBlocks(
  previousResponse: Record<string, unknown>,
  toolCalls: ToolCall[],
  matchedIds: Set<string>
): unknown[] {
  if (Array.isArray(previousResponse.content)) {
    const blocks = previousResponse.content as unknown[];

    // Validate when content has tool_use blocks for matched IDs.
    const idCounts = new Map<string, number>();
    const idNames = new Map<string, string>();
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const rec = block as Record<string, unknown>;
      if (rec.type !== "tool_use" || typeof rec.id !== "string") continue;
      if (!matchedIds.has(rec.id)) continue;
      idCounts.set(rec.id, (idCounts.get(rec.id) ?? 0) + 1);
      if (idNames.has(rec.id)) continue;
      if (typeof rec.name === "string") {
        idNames.set(rec.id, rec.name);
      }
    }
    for (const call of toolCalls) {
      if (!matchedIds.has(call.id)) continue;
      const count = idCounts.get(call.id) ?? 0;
      if (count !== 1) {
        throw new Error(
          `buildFollowUpSourceBody: previous response content must contain exactly one tool_use match per call ID (id "${call.id}" has ${count})`
        );
      }
      const prevName = idNames.get(call.id);
      if (prevName !== undefined && prevName !== call.name) {
        throw new Error(
          `buildFollowUpSourceBody: previous response tool_use "${call.id}" name "${prevName}" does not match tool call name "${call.name}"`
        );
      }
    }

    // Match prepareClaudeRequest: keep all thinking/signature blocks, keep
    // ordinary content only before the first tool_use, and retain only the
    // tool_use blocks whose results are being replayed.
    let foundToolUse = false;
    const replayBlocks: unknown[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const rec = block as Record<string, unknown>;
      if (rec.type === "tool_use") {
        foundToolUse = true;
        if (typeof rec.id === "string" && matchedIds.has(rec.id)) replayBlocks.push(block);
        continue;
      }
      if (rec.type === "thinking" || rec.type === "redacted_thinking" || !foundToolUse) {
        replayBlocks.push(block);
      }
    }
    return replayBlocks;
  }

  return toolCalls.map((call) => ({
    type: "tool_use",
    id: call.id,
    name: call.name,
    input: call.arguments,
  }));
}

export function buildFollowUpSourceBody(
  input: BuildFollowUpTranscriptInput
): Record<string, unknown> {
  const { sourceBody, previousResponse, toolCalls, results, sourceFormat } = input;
  const maxResultBytes = input.maxResultBytes ?? MAX_RESULT_BYTES_PER_TOOL;
  const maxTotalResultBytes = input.maxTotalResultBytes ?? MAX_RESULT_BYTES_TOTAL;

  if (sourceFormat !== "openai" && sourceFormat !== "claude") {
    throw new Error('sourceFormat must be "openai" or "claude"');
  }

  assertValidBudget("maxResultBytes", maxResultBytes);
  assertValidBudget("maxTotalResultBytes", maxTotalResultBytes);

  if (!Array.isArray(sourceBody.messages)) {
    throw new Error("buildFollowUpSourceBody requires sourceBody.messages array");
  }

  validateCallsAndResults(toolCalls, results);

  // When a pre-serialized map is provided (from the loop's own budget pass),
  // use its text verbatim instead of re-serializing. Otherwise serialize with
  // the standard budget logic.
  const serializedResultTextById = input.serializedResultTextById;
  let boundedResults: BoundedToolResult[];
  if (serializedResultTextById) {
    boundedResults = results.map((result) => {
      const text = serializedResultTextById.get(result.id) ?? "";
      return { text, truncated: false, originalBytes: Buffer.byteLength(text, "utf8") };
    });
  } else {
    let remainingBytes = maxTotalResultBytes;
    boundedResults = results.map((result) => {
      const itemMaxBytes = Math.min(maxResultBytes, remainingBytes);
      const bounded = serializeBoundedToolResult(result.result, itemMaxBytes);
      remainingBytes -= Buffer.byteLength(bounded.text, "utf8");
      return bounded;
    });
  }

  const matchedIds = new Set(results.map((result) => result.id));
  const messages = [...(sourceBody.messages as unknown[])];

  if (sourceFormat === "openai") {
    const prevMessage = extractOpenAIMessage(previousResponse);
    const previousContent = prevMessage && "content" in prevMessage ? prevMessage.content : null;

    const assistantMessage: Record<string, unknown> = {
      role: "assistant",
      content: previousContent ?? null,
    };
    const assistantToolCalls = resolveOpenAIAssistantToolCalls(
      previousResponse,
      toolCalls,
      matchedIds
    );
    if (assistantToolCalls.length > 0) {
      assistantMessage.tool_calls = assistantToolCalls;
    }
    messages.push(assistantMessage);

    boundedResults.forEach((bounded, index) => {
      messages.push({
        role: "tool",
        tool_call_id: results[index].id,
        content: bounded.text,
      });
    });

    return { ...sourceBody, messages, stream: false };
  }

  // Claude Messages: the original assistant tool_use turn, then a separate
  // user tool_result message. A tool_result must never share the assistant
  // content — Anthropic rejects it (openai-to-claude.ts:323).
  const toolUseBlocks = resolveClaudeToolUseBlocks(previousResponse, toolCalls, matchedIds);
  messages.push({ role: "assistant", content: toolUseBlocks });
  messages.push({
    role: "user",
    content: boundedResults.map((bounded, index) => ({
      type: "tool_result",
      tool_use_id: results[index].id,
      content: bounded.text,
    })),
  });

  return { ...sourceBody, messages };
}
