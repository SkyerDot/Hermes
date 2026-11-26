/**
 * Injection seam for the retained inference pipeline.
 *
 * Hermes no longer owns durable Memory or a skill registry. The bridge is an
 * explicitly configured, best-effort HTTP call to OpenChamber; without that
 * configuration this is a no-op that preserves the request body and the result
 * shape consumed by chatCore.ts.
 */

import { getToolName, orderToolsForCaching, shapeInjectedTools } from "./injectedToolHelpers.ts";
import { requestOpenChamberInjection } from "../../services/openChamberBridge.ts";

export {
  getSkillsProviderForFormat,
  mergeInjectedFallbackOwnerNames,
  sortToolsByName,
} from "./injectedToolHelpers.ts";

type MemorySkillsLogger = { debug?: (...args: unknown[]) => void } | null | undefined;

export interface MemorySkillsInjectionResult {
  body: Record<string, unknown>;
  memorySettings: { enabled: boolean; skillsEnabled: boolean; maxTokens: number } | null;
  builtinToolNames: string[];
  injectedCustomSkillNames: string[];
}

const DISABLED_MEMORY_SETTINGS = Object.freeze({
  enabled: false,
  skillsEnabled: false,
  maxTokens: 0,
});

export async function injectMemoryAndSkills({
  body,
  memoryOwnerId,
  provider,
  effectiveModel,
  sourceFormat,
  targetFormat,
  backgroundReason,
  log,
}: {
  body: Record<string, unknown>;
  memoryOwnerId: string | null;
  provider: string;
  effectiveModel: string;
  sourceFormat: string;
  targetFormat: string;
  backgroundReason: string | null;
  log: MemorySkillsLogger;
}): Promise<MemorySkillsInjectionResult> {
  const clientToolNames = new Set(
    Array.isArray(body.tools) ? body.tools.map((tool) => getToolName(tool)) : []
  );

  const remote = memoryOwnerId
    ? await requestOpenChamberInjection({
        body,
        memoryOwnerId,
        provider,
        model: effectiveModel,
        sourceFormat,
        targetFormat,
        backgroundReason,
      })
    : null;

  if (!remote) {
    if (memoryOwnerId) {
      log?.debug?.("MEMORY", "OpenChamber bridge disabled; skills/memory injection skipped");
    }
    return {
      body,
      memorySettings: memoryOwnerId ? { ...DISABLED_MEMORY_SETTINGS } : null,
      builtinToolNames: [],
      injectedCustomSkillNames: [],
    };
  }

  let injectedBody = remote.body ? { ...remote.body } : body;
  const builtinToolNames: string[] = [...(remote.builtinToolNames ?? [])];
  const injectedCustomSkillNames: string[] = [...(remote.injectedCustomSkillNames ?? [])];

  if (Array.isArray(remote.injectedTools) && remote.injectedTools.length > 0) {
    const existingTools = Array.isArray(injectedBody.tools) ? injectedBody.tools : [];
    const existingToolNames = new Set(existingTools.map((tool) => getToolName(tool)));
    const additions = shapeInjectedTools(remote.injectedTools, sourceFormat).filter((tool) => {
      const name = getToolName(tool);
      return Boolean(name) && !existingToolNames.has(name);
    });
    if (additions.length > 0) {
      injectedBody = { ...injectedBody, tools: [...existingTools, ...additions] };
      log?.debug?.("SKILLS", `Injected ${additions.length} tool(s) from OpenChamber`);
    }
  }

  if (Array.isArray(injectedBody.tools) && injectedBody.tools.length > 1) {
    injectedBody = {
      ...injectedBody,
      tools: orderToolsForCaching(injectedBody.tools, clientToolNames),
    };
  }

  return {
    body: injectedBody,
    memorySettings: remote.memorySettings ?? { ...DISABLED_MEMORY_SETTINGS },
    builtinToolNames,
    injectedCustomSkillNames,
  };
}
