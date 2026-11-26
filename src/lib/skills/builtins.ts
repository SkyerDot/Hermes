import type { SkillHandler } from "./types";

/**
 * Hermes no longer ships executable skill builtins. The retained executor and
 * execution fence still need a stable handler map for pipeline compatibility,
 * but every handler is an explicit no-op that reports disabled rather than
 * touching files, the network, or a child process.
 */

const DISABLED_BUILTIN_NAMES = [
  "file_read",
  "file_write",
  "http_request",
  "web_search",
  "web_fetch",
  "eval_code",
  "execute_command",
] as const;

function disabledHandler(name: string): SkillHandler {
  return async (_input, context) => ({
    success: false,
    error: `Skill builtin ${name} is disabled in Hermes`,
    context: context.apiKeyId,
  });
}

export const builtinSkills: Record<string, SkillHandler> = Object.fromEntries(
  DISABLED_BUILTIN_NAMES.map((name) => [name, disabledHandler(name)])
);

export function registerBuiltinSkills(executor: {
  registerHandler(name: string, handler: SkillHandler): void;
}): void {
  for (const [name, handler] of Object.entries(builtinSkills)) {
    executor.registerHandler(name, handler);
  }
}
