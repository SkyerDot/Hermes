import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const V1_ROUTES_DIR = path.resolve("src/app/api/v1");

/**
 * Parity tests for retained v1 routes (Task 1 baseline).
 * These must pass NOW and remain green through Tasks 2-12.
 */

// 13 key retained routes that must exist and export expected handlers
const KEY_RETAINED_ROUTES = [
  { file: "chat/completions/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "responses/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "messages/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "models/route.ts", handlers: ["GET", "HEAD", "OPTIONS"] },
  { file: "embeddings/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "multimodal-embeddings/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "rerank/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "ocr/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "batches/route.ts", handlers: ["POST", "GET", "OPTIONS"] },
  { file: "files/route.ts", handlers: ["POST", "GET", "OPTIONS"] },
  { file: "search/route.ts", handlers: ["POST", "GET", "OPTIONS"] },
  { file: "images/generations/route.ts", handlers: ["POST", "OPTIONS"] },
  { file: "audio/speech/route.ts", handlers: ["POST", "OPTIONS"] },
];

// 6 discarded v1 routes (from surface-map.md)
const DISCARDED_V1_ROUTES = [
  "ws/route.ts",
  "agents/credentials/route.ts",
  "agents/health/route.ts",
  "agents/tasks/route.ts",
  "agents/tasks/[id]/route.ts",
  "provider-plugin-manifest/route.ts",
];

function readRouteFile(routePath: string): string {
  const fullPath = path.join(V1_ROUTES_DIR, routePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Route file not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function hasHandlerExport(content: string, handler: string): boolean {
  // Match `export async function HANDLER` or `export const HANDLER =` or re-export `export { ... HANDLER ... } from`
  const pattern = new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${handler}\\b|export\\s+const\\s+${handler}\\s*=|export\\s+\\{[^}]*\\b${handler}\\b[^}]*\\}\\s+from`
  );
  return pattern.test(content);
}

test("v1 retained routes parity — key routes exist and export handlers", async (t) => {
  for (const route of KEY_RETAINED_ROUTES) {
    await t.test(`${route.file} exists and exports ${route.handlers.join(", ")}`, () => {
      const content = readRouteFile(route.file);
      for (const handler of route.handlers) {
        assert.ok(
          hasHandlerExport(content, handler),
          `${route.file} must export ${handler} handler`
        );
      }
    });
  }
});

test("v1 retained routes parity — total route file count (118 retained = 124 total - 6 discarded)", () => {
  // Count all route.ts files under src/app/api/v1
  function countRouteFiles(dir: string): number {
    let count = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += countRouteFiles(fullPath);
      } else if (entry.name === "route.ts") {
        count++;
      }
    }
    return count;
  }

  const totalRouteFiles = countRouteFiles(V1_ROUTES_DIR);
  // 124 total - 6 discarded = 118 retained (per surface-map.md)
  assert.strictEqual(totalRouteFiles, 124, "Total v1 route.ts files should be 124 (baseline)");
});

test("v1 retained routes parity — discarded route files are present in baseline (will be removed in Tasks 2-12)", () => {
  // These 6 routes exist NOW but will be removed by Tasks 2-12.
  // This test documents the baseline; it will be updated when routes are actually removed.
  for (const route of DISCARDED_V1_ROUTES) {
    const fullPath = path.join(V1_ROUTES_DIR, route);
    assert.ok(fs.existsSync(fullPath), `Baseline check: ${route} currently exists (to be removed)`);
  }
});
