/**
 * NineRouterExecutor — routes requests to a locally-managed 9router instance.
 *
 * 9router exposes both OpenAI-compatible (/v1/chat/completions) and
 * Anthropic-compatible (/v1/messages) endpoints. The executor detects the
 * wire shape from the request body and selects the matching endpoint so the
 * response format is always consistent with what the upstream client expects.
 *
 * Auth: the 9router API key (nr_xxx) is supplied through the normal provider
 * credentials (or NINEROUTER_API_KEY-compatible connection fields) and passed as
 * a Bearer token. The embedded service supervisor was removed (Task 8); the base
 * URL now comes from NINEROUTER_HOST / NINEROUTER_PORT only.
 *
 * G-02: a failed dispatch keeps the X-Omni-Fallback-Hint contract so
 * accountFallback.ts applies a short cooldown without tripping the provider
 * circuit breaker.
 */

import { stripInternalBodyFields } from "../config/cliFingerprints.ts";
import { FETCH_TIMEOUT_MS } from "../config/constants.ts";
import {
  clampToLearned,
  getLearnedReasoningEffort,
} from "../services/learnedReasoningEffortCaps.ts";
import { buildErrorBody } from "../utils/error.ts";
import {
  BaseExecutor,
  mergeUpstreamExtraHeaders,
  mergeAbortSignals,
  type ProviderCredentials,
  type ExecuteInput,
} from "./base.ts";
import { applyFieldDowngradeRecovery } from "./base/fieldDowngradeRecovery.ts";
import { readBodyReasoningEffort, writeBodyReasoningEffort } from "./base/reasoningEffort.ts";
import { applyReasoningEffortRecovery } from "./base/reasoningEffortRecovery.ts";

const DEFAULT_PORT = 20130;
const DEFAULT_HOST = "127.0.0.1";
const HEALTH_CHECK_TIMEOUT_MS = 3_000;

/** Fallback hint header value that tells accountFallback.ts to use 5s cooldown, no breaker trip. */
export const NINEROUTER_FALLBACK_HINT = "connection_cooldown";
export const NINEROUTER_FALLBACK_HINT_HEADER = "X-Omni-Fallback-Hint";

export function resolveNineRouterBaseUrl(): string {
  const host = process.env.NINEROUTER_HOST || DEFAULT_HOST;
  const port = parseInt(process.env.NINEROUTER_PORT || String(DEFAULT_PORT), 10);
  return `http://${host}:${port}`;
}

export class NineRouterExecutor extends BaseExecutor {
  private readonly upstreamBaseUrl: string;

  constructor(baseUrl?: string) {
    const effectiveBase = baseUrl ?? resolveNineRouterBaseUrl();
    super("9router", {
      id: "9router",
      baseUrl: `${effectiveBase}/v1/chat/completions`,
      headers: { "Content-Type": "application/json" },
    });
    this.upstreamBaseUrl = effectiveBase;
  }

  buildUrl(
    _model: string,
    _stream: boolean,
    _urlIndex = 0,
    _credentials: ProviderCredentials | null = null
  ): string {
    return `${this.upstreamBaseUrl}/v1/chat/completions`;
  }

  /** Keep the account-fallback cooldown contract on local 9router outages. */
  private withFallbackHint(response: Response): Response {
    if (
      response.status !== 503 ||
      response.headers.get(NINEROUTER_FALLBACK_HINT_HEADER) === NINEROUTER_FALLBACK_HINT
    ) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set(NINEROUTER_FALLBACK_HINT_HEADER, NINEROUTER_FALLBACK_HINT);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  private buildUnavailableResponse(): Response {
    const body = buildErrorBody(503, "9router is unreachable", undefined, {
      code: "service_not_running",
    });
    return new Response(JSON.stringify(body), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        [NINEROUTER_FALLBACK_HINT_HEADER]: NINEROUTER_FALLBACK_HINT,
      },
    });
  }

  /**
   * True when the body matches the Anthropic Messages wire shape.
   * The same heuristic used by CliproxyapiExecutor — see comments there for
   * the reasoning behind each signal.
   */
  private isAnthropicShape(body: unknown): boolean {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    if (b.system !== undefined) return true;
    if (b.thinking !== undefined) return true;
    if (
      b.metadata &&
      typeof b.metadata === "object" &&
      (b.metadata as Record<string, unknown>).user_id !== undefined
    )
      return true;
    const msgs = b.messages;
    if (Array.isArray(msgs) && msgs.length > 0) {
      const first = msgs[0] as Record<string, unknown>;
      if (Array.isArray(first?.content)) return true;
    }
    return false;
  }

  private selectEndpoint(body: unknown): "/v1/messages" | "/v1/chat/completions" {
    return this.isAnthropicShape(body) ? "/v1/messages" : "/v1/chat/completions";
  }

  buildHeaders(credentials: ProviderCredentials | null, stream = true): Record<string, string> {
    const key = credentials?.apiKey ?? credentials?.accessToken;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;
    if (stream) headers["Accept"] = "text/event-stream";
    return headers;
  }

  transformRequest(
    model: string,
    body: unknown,
    _stream: boolean,
    _credentials: ProviderCredentials | null
  ): unknown {
    if (!body || typeof body !== "object") return body;
    const transformed = { ...(body as Record<string, unknown>) };
    if (transformed.model !== model) transformed.model = model;
    return transformed;
  }

  async execute(input: ExecuteInput) {
    const dynamicBaseUrl = this.upstreamBaseUrl;
    const dynamicCredentials: ProviderCredentials | null = input.credentials;

    // Strip the "9router/" prefix before forwarding to upstream.
    const innerModel = input.model.replace(/^9router\//, "");

    const endpoint = this.selectEndpoint(input.body);
    const url = `${dynamicBaseUrl}${endpoint}`;
    const shape = endpoint === "/v1/messages" ? "anthropic" : "openai";
    const headers = this.buildHeaders(dynamicCredentials, input.stream);
    let transformedBody = this.transformRequest(
      innerModel,
      input.body,
      input.stream,
      dynamicCredentials
    );
    mergeUpstreamExtraHeaders(headers, input.upstreamExtraHeaders ?? null);
    stripInternalBodyFields(transformedBody);

    // Preserve transparent first attempts: only clamp capabilities observed for this wire model.
    const learnedEfforts = getLearnedReasoningEffort(this.provider, innerModel);
    const requestedEffort = readBodyReasoningEffort(transformedBody);
    const learnedEffort =
      learnedEfforts && requestedEffort
        ? clampToLearned(requestedEffort.toLowerCase(), learnedEfforts)
        : null;
    if (learnedEffort) {
      transformedBody = writeBodyReasoningEffort(transformedBody, learnedEffort);
    }

    const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const combinedSignal = input.signal
      ? mergeAbortSignals(input.signal, timeoutSignal)
      : timeoutSignal;

    input.log?.info?.("9ROUTER", `→ ${url} (model: ${innerModel}, shape: ${shape})`);

    const fetchOptions = { method: "POST", headers, signal: combinedSignal };
    const dispatch = async (u: string, o: RequestInit): Promise<Response> => {
      try {
        return this.withFallbackHint(await this.dispatchRequest(u, o, input.credentials));
      } catch (err) {
        if (input.signal?.aborted) throw err;
        input.log?.warn?.("9ROUTER", "local 9router dispatch failed");
        return this.buildUnavailableResponse();
      }
    };
    let response = await dispatch(url, { ...fetchOptions, body: JSON.stringify(transformedBody) });

    // #14629: this override never calls super.execute(), so wire the same
    // reactive reasoning_effort 400 clamp-and-retry BaseExecutor applies.
    const recovery = await applyReasoningEffortRecovery({
      response,
      url,
      provider: this.provider,
      model: innerModel,
      body: transformedBody,
      fetchOptions,
      fetchFn: dispatch,
      log: input.log,
    });

    transformedBody = recovery.body;
    response = await applyFieldDowngradeRecovery({
      response: recovery.response,
      url,
      provider: this.provider,
      model: innerModel,
      body: transformedBody,
      fetchOptions,
      fetchFn: dispatch,
      serializeBody: (body) => JSON.stringify(body),
      strippedFields: new Set<string>(),
      log: input.log,
    });

    return { response, url, headers, transformedBody };
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.upstreamBaseUrl}/api/health`, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        ...(!res.ok ? { error: `HTTP ${res.status}` } : {}),
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export default NineRouterExecutor;
