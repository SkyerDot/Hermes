/**
 * Memory tool descriptors retained only for inference-contract compatibility.
 * Hermes does not execute memory tools locally; OpenChamber does when the
 * optional bridge is configured. Without it these handlers are explicit no-ops.
 */

import type { SkillHandler } from "./types";
import { requestOpenChamberInjection } from "../../../open-sse/services/openChamberBridge.ts";

export const MEMORY_SAVE_TOOL_NAME = "memory_save";
export const MEMORY_UPDATE_TOOL_NAME = "memory_update";
export const MEMORY_SEARCH_TOOL_NAME = "memory_search";
export const MEMORY_DELETE_TOOL_NAME = "memory_delete";

export const MEMORY_BUILTIN_TOOL_NAMES = [
  MEMORY_SAVE_TOOL_NAME,
  MEMORY_UPDATE_TOOL_NAME,
  MEMORY_SEARCH_TOOL_NAME,
  MEMORY_DELETE_TOOL_NAME,
] as const;

const MEMORY_TYPE_SCHEMA = {
  type: "string",
  enum: ["factual", "episodic", "procedural", "semantic"],
  description:
    "Memory category: factual (facts/preferences), episodic (events), procedural (how-to), semantic (knowledge).",
};

const memorySaveParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    key: { type: "string", description: "Unique key for the memory entry." },
    content: { type: "string", description: "The memory content to store." },
    type: MEMORY_TYPE_SCHEMA,
    metadata: { type: "object", description: "Optional structured metadata." },
  },
  required: ["key", "content"],
};

const memoryUpdateParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Memory entry id." },
    type: MEMORY_TYPE_SCHEMA,
    key: { type: "string", description: "New key for the entry." },
    content: { type: "string", description: "New content for the entry." },
    metadata: { type: "object", description: "Replacement metadata." },
  },
  required: ["id"],
};

const memorySearchParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: { type: "string", description: "Search query text." },
    type: MEMORY_TYPE_SCHEMA,
    limit: { type: "integer", minimum: 1, maximum: 50 },
    maxTokens: { type: "integer", minimum: 1, maximum: 8000 },
  },
};

const memoryDeleteParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Memory entry id." },
  },
  required: ["id"],
};

const DESCRIPTIONS: Record<string, string> = {
  [MEMORY_SAVE_TOOL_NAME]: "Save a memory entry through the configured OpenChamber bridge.",
  [MEMORY_UPDATE_TOOL_NAME]: "Update a memory entry through the configured OpenChamber bridge.",
  [MEMORY_SEARCH_TOOL_NAME]: "Search memory entries through the configured OpenChamber bridge.",
  [MEMORY_DELETE_TOOL_NAME]: "Delete a memory entry through the configured OpenChamber bridge.",
};

const PARAMETERS: Record<string, Record<string, unknown>> = {
  [MEMORY_SAVE_TOOL_NAME]: memorySaveParameters,
  [MEMORY_UPDATE_TOOL_NAME]: memoryUpdateParameters,
  [MEMORY_SEARCH_TOOL_NAME]: memorySearchParameters,
  [MEMORY_DELETE_TOOL_NAME]: memoryDeleteParameters,
};

function memoryHandler(toolName: string): SkillHandler {
  return async (input, context) => {
    // Zod validation and sanitized error handling live in the bridge. A missing
    // URL is a no-op; the result shape stays stable for the retained pipeline.
    await requestOpenChamberInjection({
      body: { tool: toolName, input },
      memoryOwnerId: context.apiKeyId,
      provider: context.provider ?? "openai",
      model: context.model ?? "unknown",
      sourceFormat: "openai",
      targetFormat: "openai",
      backgroundReason: null,
    });
    return { success: true, delegated: true, tool: toolName, context: context.apiKeyId };
  };
}

export const memoryBuiltinHandlers: Record<string, SkillHandler> = Object.fromEntries(
  MEMORY_BUILTIN_TOOL_NAMES.map((name) => [name, memoryHandler(name)])
);

export function buildMemoryOpenAITools(): unknown[] {
  return MEMORY_BUILTIN_TOOL_NAMES.map((name) => ({
    type: "function",
    function: { name, description: DESCRIPTIONS[name], parameters: PARAMETERS[name] },
  }));
}

export function buildMemoryClaudeTools(): unknown[] {
  return MEMORY_BUILTIN_TOOL_NAMES.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    input_schema: PARAMETERS[name],
  }));
}

export function buildMemoryGeminiTools(): unknown[] {
  return MEMORY_BUILTIN_TOOL_NAMES.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    parameters: PARAMETERS[name],
  }));
}

export function buildMemoryToolsForProvider(
  provider: "openai" | "anthropic" | "google" | "other"
): unknown[] {
  switch (provider) {
    case "anthropic":
      return buildMemoryClaudeTools();
    case "google":
      return buildMemoryGeminiTools();
    default:
      return buildMemoryOpenAITools();
  }
}
