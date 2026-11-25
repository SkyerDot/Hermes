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

// 118 retained v1 routes from surface-map.md "Rotas v1 obrigatórias a preservar"
// This is the single source of truth for the retained route count.
// Derived from: all 124 route.ts files under src/app/api/v1 minus 6 discarded:
// ws/route.ts, agents/credentials/route.ts, agents/health/route.ts,
// agents/tasks/route.ts, agents/tasks/[id]/route.ts, provider-plugin-manifest/route.ts
const RETAINED_V1_ROUTES = [
  "route.ts",
  "[...omnirouteCatchAll]/route.ts",
  "accounts/[id]/limits/route.ts",
  "alpha/search/route.ts",
  "antigravity/route.ts",
  "api/chat/route.ts",
  "audio/speech/route.ts",
  "audio/transcriptions/route.ts",
  "audio/translations/route.ts",
  "auto-combo/[channel]/candidates/route.ts",
  "batches/route.ts",
  "batches/[id]/route.ts",
  "batches/[id]/cancel/route.ts",
  "batches/delete-completed/route.ts",
  "chat/completions/route.ts",
  "classify/route.ts",
  "combos/route.ts",
  "completions/route.ts",
  "decisions/route.ts",
  "embeddings/route.ts",
  "explain/routing/route.ts",
  "fal/jobs/[id]/route.ts",
  "fal/models/route.ts",
  "fal/run/route.ts",
  "files/route.ts",
  "files/[id]/route.ts",
  "files/[id]/content/route.ts",
  "images/edits/route.ts",
  "images/generations/route.ts",
  "images/upscale/route.ts",
  "issues/report/route.ts",
  "management/proxies/route.ts",
  "management/proxies/assignments/route.ts",
  "management/proxies/bulk-assign/route.ts",
  "management/proxies/health/route.ts",
  "management/proxy-subscriptions/route.ts",
  "management/proxy-subscriptions/[id]/route.ts",
  "management/proxy-subscriptions/[id]/nodes/route.ts",
  "management/proxy-subscriptions/[id]/refresh/route.ts",
  "me/quota/[provider]/route.ts",
  "me/sessions/route.ts",
  "me/sessions/[id]/route.ts",
  "me/sessions/[id]/messages/route.ts",
  "me/status/route.ts",
  "me/usage/route.ts",
  "media/[id]/route.ts",
  "messages/count_tokens/route.ts",
  "messages/route.ts",
  "models/route.ts",
  "models/[...model]/route.ts",
  "models/health/route.ts",
  "models/query/route.ts",
  "moderations/route.ts",
  "multimodal-embeddings/route.ts",
  "muse-code/models/route.ts",
  "music/route.ts",
  "music/detailed/route.ts",
  "music/detailed/stream/route.ts",
  "music/generations/route.ts",
  "music/plan/route.ts",
  "music/stream/route.ts",
  "ocr/route.ts",
  "providers/[provider]/chat/completions/route.ts",
  "providers/[provider]/embeddings/route.ts",
  "providers/[provider]/images/generations/route.ts",
  "providers/[provider]/limits/route.ts",
  "providers/[provider]/models/route.ts",
  "providers/[provider]/voices/route.ts",
  "providers/[provider]/voices/[voiceId]/route.ts",
  "providers/suggested-models/route.ts",
  "quota-recoveries/[id]/route.ts",
  "quotas/check/route.ts",
  "registered-keys/route.ts",
  "registered-keys/[id]/route.ts",
  "registered-keys/[id]/revoke/route.ts",
  "relay/chat/completions/route.ts",
  "relay/chat/completions/bifrost/route.ts",
  "rerank/route.ts",
  "responses/route.ts",
  "responses/[...path]/route.ts",
  "responses/input_tokens/route.ts",
  "search/route.ts",
  "search/analytics/route.ts",
  "segment/route.ts",
  "session-leases/route.ts",
  "sound-generation/route.ts",
  "speech-to-text/route.ts",
  "systemone/route.ts",
  "systemone/models/route.ts",
  "text-to-speech/[voiceId]/route.ts",
  "video-bridge/drilldown/route.ts",
  "videos/generations/route.ts",
  "voices/route.ts",
  "vscode/[token]/route.ts",
  "vscode/raw/[token]/route.ts",
  "vscode/combos/[token]/[[...slug]]/route.ts",
  "vscode/[token]/chat/completions/route.ts",
  "vscode/[token]/combos/route.ts",
  "vscode/[token]/models/route.ts",
  "vscode/[token]/responses/route.ts",
  "vscode/raw/[token]/chat/completions/route.ts",
  "vscode/raw/[token]/combos/route.ts",
  "vscode/raw/[token]/models/route.ts",
  "vscode/raw/[token]/responses/route.ts",
  "vscode/[token]/api/chat/route.ts",
  "vscode/[token]/api/show/route.ts",
  "vscode/[token]/api/tags/route.ts",
  "vscode/[token]/api/version/route.ts",
  "vscode/raw/[token]/api/chat/route.ts",
  "vscode/raw/[token]/api/show/route.ts",
  "vscode/raw/[token]/api/tags/route.ts",
  "vscode/raw/[token]/api/version/route.ts",
  "vscode/[token]/v1/chat/completions/route.ts",
  "vscode/[token]/v1/models/route.ts",
  "vscode/raw/[token]/v1/chat/completions/route.ts",
  "vscode/raw/[token]/v1/models/route.ts",
  "web/fetch/route.ts",
  "web/map/route.ts",
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

test("v1 retained routes parity — all 118 retained routes from surface-map.md exist", () => {
  for (const route of RETAINED_V1_ROUTES) {
    const fullPath = path.join(V1_ROUTES_DIR, route);
    assert.ok(fs.existsSync(fullPath), `Retained route must exist: ${route}`);
  }
});

test("v1 retained routes parity — count matches 118 from surface-map.md", () => {
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
  // 118 retained per surface-map.md (124 total - 6 discarded)
  assert.ok(
    totalRouteFiles >= 118,
    `Total v1 route.ts files should be >= 118 (118 retained + 6 discarded = 124 baseline), got ${totalRouteFiles}`
  );
  assert.strictEqual(
    RETAINED_V1_ROUTES.length,
    118,
    "RETAINED_V1_ROUTES list must have 118 entries"
  );
});
