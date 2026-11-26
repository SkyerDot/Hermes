/**
 * Pure helpers for injected tool shaping and prompt-cache-stable ordering.
 * Kept separate from the OpenChamber bridge so the inference contract stays
 * testable without a network or database.
 */

import { FORMATS } from "../../translator/formats.ts";
import { chatStrictForResponses } from "../../translator/helpers/toolStrict.ts";

export interface FallbackPlan {
  enabled: boolean;
  toolName: string | null;
  convertedToolCount: number;
}

export function getToolName(tool: unknown): string {
  if (!tool || typeof tool !== "object") return "";
  const record = tool as Record<string, unknown>;
  if (typeof record.name === "string") return record.name;
  if (record.function && typeof record.function === "object") {
    const fn = record.function as Record<string, unknown>;
    if (typeof fn.name === "string") return fn.name;
  }
  return "";
}

export function sortToolsByName<T>(tools: T[]): T[] {
  if (!Array.isArray(tools) || tools.length <= 1) return tools;
  return [...tools].sort((a, b) => getToolName(a).localeCompare(getToolName(b)));
}

/** Client tools keep their order; only injected tools are sorted deterministically. */
export function orderToolsForCaching<T>(tools: T[], clientToolNames: Set<string>): T[] {
  const fromClient = tools.filter((tool) => clientToolNames.has(getToolName(tool)));
  const injected = tools.filter((tool) => !clientToolNames.has(getToolName(tool)));
  return [...fromClient, ...sortToolsByName(injected)];
}

function toResponsesFunctionTool(tool: unknown): unknown {
  if (!tool || typeof tool !== "object") return tool;
  const record = tool as Record<string, unknown>;
  const fn = record.function;
  if (record.type !== "function" || !fn || typeof fn !== "object") return tool;
  const fnRecord = fn as Record<string, unknown>;
  return {
    type: "function",
    name: fnRecord.name,
    ...(typeof fnRecord.description === "string" ? { description: fnRecord.description } : {}),
    parameters: fnRecord.parameters ?? { type: "object", properties: {} },
    strict: chatStrictForResponses(fnRecord),
  };
}

export function shapeInjectedTools(tools: unknown[], sourceFormat: string): unknown[] {
  return sourceFormat === FORMATS.OPENAI_RESPONSES ? tools.map(toResponsesFunctionTool) : tools;
}

export function getSkillsProviderForFormat(
  format: string
): "openai" | "anthropic" | "google" | "other" {
  switch (format) {
    case FORMATS.CLAUDE:
      return "anthropic";
    case FORMATS.GEMINI:
      return "google";
    default:
      return "openai";
  }
}

export function mergeInjectedFallbackOwnerNames(
  injectionResult: { builtinToolNames: string[] },
  plans: FallbackPlan[],
  preConversionClientToolNames?: string[]
): { builtinToolNames: string[] } {
  const existing = new Set(injectionResult.builtinToolNames);
  if (preConversionClientToolNames) {
    for (const name of preConversionClientToolNames) existing.add(name);
  }
  const extraNames: string[] = [];
  for (const plan of plans) {
    if (
      plan.enabled &&
      plan.convertedToolCount > 0 &&
      plan.toolName &&
      !existing.has(plan.toolName)
    ) {
      extraNames.push(plan.toolName);
      existing.add(plan.toolName);
    }
  }
  return { builtinToolNames: [...injectionResult.builtinToolNames, ...extraNames] };
}
