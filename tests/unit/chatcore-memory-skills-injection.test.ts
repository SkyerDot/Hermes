import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  injectMemoryAndSkills,
  getSkillsProviderForFormat,
  mergeInjectedFallbackOwnerNames,
  sortToolsByName,
} from "../../open-sse/handlers/chatCore/memorySkillsInjection.ts";
import {
  orderToolsForCaching,
  shapeInjectedTools,
} from "../../open-sse/handlers/chatCore/injectedToolHelpers.ts";
import { FORMATS } from "../../open-sse/translator/formats.ts";

const ORIGINAL_URL = process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
const ORIGINAL_TOKEN = process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_TOKEN;
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) delete process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
  else process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL = ORIGINAL_URL;
  if (ORIGINAL_TOKEN === undefined) delete process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_TOKEN;
  else process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_TOKEN = ORIGINAL_TOKEN;
});

function inject(
  body: Record<string, unknown> = {},
  memoryOwnerId: string | null = null,
  sourceFormat: string = FORMATS.OPENAI
) {
  return injectMemoryAndSkills({
    body,
    memoryOwnerId,
    provider: "openai",
    effectiveModel: "gpt-4o-mini",
    sourceFormat,
    targetFormat: FORMATS.OPENAI,
    backgroundReason: null,
    log: null,
  });
}

test("getSkillsProviderForFormat maps formats to the retained provider names", () => {
  assert.equal(getSkillsProviderForFormat(FORMATS.CLAUDE), "anthropic");
  assert.equal(getSkillsProviderForFormat(FORMATS.GEMINI), "google");
  assert.equal(getSkillsProviderForFormat(FORMATS.OPENAI), "openai");
  assert.equal(getSkillsProviderForFormat("unrecognized"), "openai");
});

test("sortToolsByName sorts deterministically by Chat or Responses function name", () => {
  const tools = [{ function: { name: "zulu" } }, { name: "alpha" }, { function: { name: "mike" } }];
  assert.deepEqual(
    sortToolsByName(tools).map((tool) =>
      "name" in tool ? tool.name : (tool as { function: { name: string } }).function.name
    ),
    ["alpha", "mike", "zulu"]
  );
});

test("orderToolsForCaching keeps client tools in order and sorts only injected tools", () => {
  const tools = [
    { name: "client_b" },
    { name: "injected_z" },
    { name: "client_a" },
    { name: "injected_a" },
  ];
  const ordered = orderToolsForCaching(tools, new Set(["client_a", "client_b"]));
  assert.deepEqual(
    ordered.map((tool) => (tool as { name: string }).name),
    ["client_b", "client_a", "injected_a", "injected_z"]
  );
});

test("mergeInjectedFallbackOwnerNames adds only enabled, converted, non-colliding names", () => {
  const result = { builtinToolNames: ["existing"] };
  const merged = mergeInjectedFallbackOwnerNames(
    result,
    [
      { enabled: true, toolName: "omniroute_web_search", convertedToolCount: 1 },
      { enabled: false, toolName: "disabled", convertedToolCount: 1 },
      { enabled: true, toolName: "zero", convertedToolCount: 0 },
      { enabled: true, toolName: null, convertedToolCount: 1 },
      { enabled: true, toolName: "existing", convertedToolCount: 1 },
    ],
    ["client_tool"]
  );
  assert.deepEqual(merged.builtinToolNames, ["existing", "omniroute_web_search"]);
  assert.deepEqual(result.builtinToolNames, ["existing"]);
});

test("no memory owner leaves the body and result shape untouched without network", async () => {
  delete process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("bridge must not be called");
  };

  const body = { model: "gpt-4o-mini", messages: [{ role: "user", content: "hello" }] };
  const result = await inject(body, null);
  assert.equal(result.body, body);
  assert.equal(result.memorySettings, null);
  assert.deepEqual(result.builtinToolNames, []);
  assert.deepEqual(result.injectedCustomSkillNames, []);
  assert.equal(fetchCalls, 0);
});

test("owner without configured bridge is an explicit disabled no-op", async () => {
  delete process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("bridge must not be called");
  };

  const body = { model: "gpt-4o-mini" };
  const result = await inject(body, "owner-1");
  assert.equal(result.body, body);
  assert.deepEqual(result.memorySettings, {
    enabled: false,
    skillsEnabled: false,
    maxTokens: 0,
  });
  assert.equal(fetchCalls, 0);
});

test("opt-in bridge injects tools in prompt-cache-stable order and preserves metadata", async () => {
  process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL = "http://127.0.0.1:21999/";
  process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_TOKEN = "test-token";
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:21999/v1/inference/injection");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-token");
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        injectedTools: [
          { type: "function", function: { name: "injected_z" } },
          { type: "function", function: { name: "injected_a" } },
        ],
        memorySettings: { enabled: true, skillsEnabled: true, maxTokens: 1024 },
        builtinToolNames: ["memory_search"],
        injectedCustomSkillNames: ["lookup@1.0.0"],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const body = {
    model: "gpt-4o-mini",
    tools: [{ type: "function", function: { name: "client_tool" } }],
  };
  const result = await inject(body, "owner-2");

  assert.equal(requestBody?.memoryOwnerId, "owner-2");
  assert.equal(requestBody?.provider, "openai");
  assert.equal(requestBody?.model, "gpt-4o-mini");
  const tools = result.body.tools as Array<{ function: { name: string } }>;
  assert.deepEqual(
    tools.map((tool) => tool.function.name),
    ["client_tool", "injected_a", "injected_z"]
  );
  assert.deepEqual(result.memorySettings, { enabled: true, skillsEnabled: true, maxTokens: 1024 });
  assert.deepEqual(result.builtinToolNames, ["memory_search"]);
  assert.deepEqual(result.injectedCustomSkillNames, ["lookup@1.0.0"]);
});

test("Responses-format bridge tools are reshaped without changing the original body", async () => {
  process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL = "http://127.0.0.1:21999";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        injectedTools: [
          { type: "function", function: { name: "injected", parameters: { type: "object" } } },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  const body = { model: "gpt-4o-mini", input: "hello" };
  const result = await inject(body, "owner-3", FORMATS.OPENAI_RESPONSES);
  const tools = result.body.tools as Array<Record<string, unknown>>;
  assert.equal(tools.length, 1);
  assert.equal(tools[0].type, "function");
  assert.equal(tools[0].name, "injected");
  assert.deepEqual(Object.keys(tools[0]).sort(), ["name", "parameters", "strict", "type"]);
  assert.equal(body.tools, undefined);
  assert.deepEqual(shapeInjectedTools([{ name: "already_responses" }], FORMATS.OPENAI_RESPONSES), [
    { name: "already_responses" },
  ]);
});
