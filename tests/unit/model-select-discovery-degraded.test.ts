// The model picker survives the A2A/MCP removal: src/shared/components/modelSelectDiscovery.ts
// is still imported by ModelSelectModal.tsx. These cases restore the picker half of the original
// discovery-degraded-consumers test (the sync-models half lives in model-discovery-diagnostics.test.ts).
import test from "node:test";
import assert from "node:assert/strict";

const { fetchProviderModels } = await import("../../src/shared/components/modelSelectDiscovery.ts");

const originalFetch = globalThis.fetch;
test.after(() => {
  globalThis.fetch = originalFetch;
});

test("picker asks for no catalog when the connection carries no usable id", async () => {
  const asked: string[] = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return Response.json({ models: [{ id: "live-model", name: "Live Model" }] });
  };

  const discovery = await fetchProviderModels("openrouter", 0);

  assert.deepEqual(discovery.models, []);
  assert.deepEqual(asked, []);
  assert.equal(discovery.degraded, false);
});

test("picker flags a local-catalog fallback with the published cause", async () => {
  globalThis.fetch = async () =>
    Response.json({
      models: [{ id: "gpt-4.1", name: "GPT" }],
      source: "local_catalog",
      warning: "API unavailable — using local catalog",
      error: "HTTP 503",
    });

  const discovery = await fetchProviderModels("openrouter", 42);

  assert.equal(discovery.degraded, true);
  assert.equal(discovery.cause, "HTTP 503");
});

test("picker keeps a healthy catalog unflagged but forwards the published cause", async () => {
  globalThis.fetch = async () =>
    Response.json({ models: [{ id: "live-model" }], source: "live", error: "ignored" });

  const discovery = await fetchProviderModels("openrouter", "conn-1");

  assert.deepEqual(discovery.models, [{ id: "live-model" }]);
  assert.equal(discovery.degraded, false);
  // readDiscoveryDegradation publishes the reason independently of the flag;
  // the picker must not invent an empty cause nor hide a published one.
  assert.equal(discovery.cause, "ignored");
});
