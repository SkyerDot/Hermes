// Characterization tests for the retained, surface-free skills library.
//
// Task 10 removed the executable skills/memory surface. The eleven modules kept
// under src/lib/skills/** are inference-pipeline plumbing: tool-name encoding,
// prompt-cache identities, tool descriptors, the execution fence and the
// server-owned tool loop. This file pins their remaining public contract.
import test from "node:test";
import assert from "node:assert/strict";

import { builtinSkills, registerBuiltinSkills } from "../../src/lib/skills/builtins.ts";
import {
  MEMORY_BUILTIN_TOOL_NAMES,
  buildMemoryClaudeTools,
  buildMemoryGeminiTools,
  buildMemoryOpenAITools,
  buildMemoryToolsForProvider,
  memoryBuiltinHandlers,
} from "../../src/lib/skills/memoryBuiltins.ts";
import { decodeSkillToolName, encodeSkillToolName } from "../../src/lib/skills/injection.ts";
import { skillExecutor } from "../../src/lib/skills/executor.ts";
import { skillRegistry } from "../../src/lib/skills/registry.ts";
import {
  MAX_FOLLOW_UPS,
  LOOP_BUDGET_MS,
  MIN_REMAINING_FOR_FOLLOW_UP_MS,
} from "../../src/lib/skills/serverOwnedToolLoop.ts";
import {
  canonicalJson,
  canonicalJsonSha256,
  deriveToolRequestIdentity,
} from "../../src/lib/skills/stableJson.ts";
import { SkillMode, SkillStatus } from "../../src/lib/skills/types.ts";
import type { SkillHandler } from "../../src/lib/skills/types.ts";

test("retained singleton services keep their export surface", () => {
  assert.equal(typeof skillRegistry.register, "function");
  assert.equal(typeof skillRegistry.loadFromDatabase, "function");
  assert.equal(typeof skillExecutor.execute, "function");
  assert.equal(typeof skillExecutor.registerHandler, "function");
});

test("every retained builtin is an explicit disabled handler", async () => {
  assert.deepEqual(Object.keys(builtinSkills).sort(), [
    "eval_code",
    "execute_command",
    "file_read",
    "file_write",
    "http_request",
    "web_fetch",
    "web_search",
  ]);

  const registered: string[] = [];
  registerBuiltinSkills({
    registerHandler(name: string, _handler: SkillHandler) {
      registered.push(name);
    },
  });
  assert.deepEqual(registered.sort(), Object.keys(builtinSkills).sort());

  for (const [name, handler] of Object.entries(builtinSkills)) {
    const result = await handler({}, { apiKeyId: "owner-1", sessionId: "session-1" });
    assert.equal(result.success, false);
    assert.match(String(result.error), new RegExp(`Skill builtin ${name} is disabled`));
  }
});

test("memory tool descriptors keep the four-name provider contract", () => {
  assert.deepEqual(
    [...MEMORY_BUILTIN_TOOL_NAMES],
    ["memory_save", "memory_update", "memory_search", "memory_delete"]
  );
  assert.deepEqual(
    Object.keys(memoryBuiltinHandlers).sort(),
    [...MEMORY_BUILTIN_TOOL_NAMES].sort()
  );

  const openai = buildMemoryOpenAITools() as Array<{ function: { name: string } }>;
  const claude = buildMemoryClaudeTools() as Array<{ name: string; input_schema: unknown }>;
  const gemini = buildMemoryGeminiTools() as Array<{ name: string; parameters: unknown }>;
  assert.deepEqual(
    openai.map((tool) => tool.function.name),
    [...MEMORY_BUILTIN_TOOL_NAMES]
  );
  assert.deepEqual(
    claude.map((tool) => tool.name),
    [...MEMORY_BUILTIN_TOOL_NAMES]
  );
  assert.deepEqual(
    gemini.map((tool) => tool.name),
    [...MEMORY_BUILTIN_TOOL_NAMES]
  );
  assert.ok(claude.every((tool) => tool.input_schema));
  assert.ok(gemini.every((tool) => tool.parameters));
  assert.deepEqual(buildMemoryToolsForProvider("anthropic"), claude);
  assert.deepEqual(buildMemoryToolsForProvider("google"), gemini);
  assert.deepEqual(buildMemoryToolsForProvider("openai"), openai);
});

test("skill tool names round-trip safely through the provider-safe encoding", () => {
  const plain = encodeSkillToolName("lookup", "1");
  assert.match(plain, /^omr_skill_/);
  assert.equal(decodeSkillToolName(plain), "lookup@1");

  const encoded = encodeSkillToolName("lookup@team", "1.0.0");
  assert.match(encoded, /^omr_skill_/);
  assert.match(encoded, /^[a-zA-Z0-9_-]+$/);
  assert.equal(decodeSkillToolName(encoded), "lookup@team@1.0.0");
  assert.equal(decodeSkillToolName("unknown_tool"), "unknown_tool");
});

test("canonical JSON and tool identity are stable across key insertion order", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJsonSha256({ b: 1, a: 2 }), canonicalJsonSha256({ a: 2, b: 1 }));

  const identity = deriveToolRequestIdentity({
    apiKeyId: "owner-1",
    stableClientRequestId: "client-1",
    skillRequestId: "skill-1",
    postInjectionBody: { b: 1, a: 2 },
  });
  assert.match(identity, /^owner-1:client-1:[0-9a-f]{64}$/);
});

test("server-owned tool loop constants and enums stay pinned", () => {
  assert.equal(MAX_FOLLOW_UPS, 3);
  assert.equal(LOOP_BUDGET_MS, 120_000);
  assert.equal(MIN_REMAINING_FOR_FOLLOW_UP_MS, 10_000);
  assert.equal(SkillStatus.SUCCESS, "success");
  assert.equal(SkillMode.AUTO, "auto");
});
