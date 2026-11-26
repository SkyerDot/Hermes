import test from "node:test";
import assert from "node:assert/strict";

const fs = await import("node:fs");
const path = await import("node:path");

const gatewayPath = path.resolve(import.meta.dirname, "../../bin/gateway-serve.mjs");
const gatewaySource = fs.readFileSync(gatewayPath, "utf-8");

test("serve startup time uses monotonic performance.now()", () => {
  assert.match(gatewaySource, /performance\.now\(\)/);
  assert.match(gatewaySource, /typeof startedAt === "number"/);
});

test("serve startup banner includes started in elapsed time", () => {
  assert.match(gatewaySource, /started in/);
});

test("serve gateway records startedAt before the supervisor run", () => {
  assert.match(gatewaySource, /const startedAt = performance\.now\(\);/);
  assert.match(gatewaySource, /runWithSupervisor\([\s\S]*?startedAt,[\s\S]*?readyTimeoutMs/);
});
