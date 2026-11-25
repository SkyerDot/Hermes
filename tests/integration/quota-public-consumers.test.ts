import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Complements the structural extraction checks in integration-wiring.test.ts.
// Exercise the exported A2A quotaManagement skill directly (MCP server removed).
describe("Quota — public A2A consumers", () => {
  it("serializes the quota API response through the real A2A skill", async () => {
    const { exerciseQuotaWiring } = await import("../helpers/quotaWiring.ts");
    const { a2a, requests } = await exerciseQuotaWiring();
    assert.equal(a2a.metadata.providerCount, 1);
    assert.match(a2a.artifacts[0].content, /\*\*quota-fixture:\*\* 20 \/ 100 \(valid\)/);
    assert.deepEqual(requests, ["/api/usage/quota", "/api/combos"]);
  });

  it("degrades gracefully when the quota API fails", async () => {
    const { exerciseQuotaWiring } = await import("../helpers/quotaWiring.ts");
    const { a2a, requests } = await exerciseQuotaWiring(503);
    // The A2A skill degrades to empty data on upstream failure (Promise.allSettled)
    assert.match(a2a.artifacts[0].content, /0 providers/);
    assert.ok(requests.includes("/api/usage/quota"));
  });
});
