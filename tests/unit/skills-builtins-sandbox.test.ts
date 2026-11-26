/**
 * Task 10: the executable skill sandbox surface is removed. This file is kept
 * as the contract guard for the retained builtin handler map: every builtin is
 * a disabled no-op, and memory builtins delegate only through the opt-in
 * OpenChamber bridge (no local child process, file, or network by default).
 */
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { builtinSkills, registerBuiltinSkills } from "../../src/lib/skills/builtins.ts";
import type { SkillHandler } from "../../src/lib/skills/types.ts";
import {
  MEMORY_BUILTIN_TOOL_NAMES,
  memoryBuiltinHandlers,
} from "../../src/lib/skills/memoryBuiltins.ts";

const ORIGINAL_URL = process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) delete process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
  else process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL = ORIGINAL_URL;
});

test("registerBuiltinSkills registers every retained disabled handler", () => {
  const registered = new Map<string, SkillHandler>();
  registerBuiltinSkills({
    registerHandler(name: string, handler: SkillHandler) {
      registered.set(name, handler);
    },
  });
  assert.deepEqual([...registered.keys()].sort(), Object.keys(builtinSkills).sort());
  for (const [name, registeredHandler] of registered) {
    assert.equal(registeredHandler, builtinSkills[name]);
  }
});

test("disabled builtins never touch the network and report the disabled contract", async () => {
  delete process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("builtins must not call the network");
  };

  for (const [name, handler] of Object.entries(builtinSkills)) {
    const result = await handler(
      { path: "/tmp/example" },
      { apiKeyId: "owner-1", sessionId: "session-1" }
    );
    assert.equal(result.success, false, name);
    assert.equal(result.error, `Skill builtin ${name} is disabled in Hermes`);
    assert.equal((result as { context?: string }).context, "owner-1");
  }
  assert.equal(fetchCalls, 0);
});

test("memory builtins keep a stable delegated result without a configured bridge", async () => {
  delete process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("memory builtins must not call the network by default");
  };

  for (const name of MEMORY_BUILTIN_TOOL_NAMES) {
    const result = await memoryBuiltinHandlers[name](
      { query: "hello" },
      { apiKeyId: "owner-2", sessionId: "session-2", provider: "openai", model: "gpt-4o-mini" }
    );
    assert.deepEqual(result, {
      success: true,
      delegated: true,
      tool: name,
      context: "owner-2",
    });
  }
  assert.equal(fetchCalls, 0);
});
