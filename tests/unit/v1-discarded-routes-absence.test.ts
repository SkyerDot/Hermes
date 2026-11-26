import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const V1_ROUTES_DIR = path.resolve("src/app/api/v1");
const API_ROUTES_DIR = path.resolve("src/app/api");

/**
 * Absence tests for discarded routes (Task 1 baseline — RED expected).
 * These 6 v1 routes + all listed API routes MUST NOT EXIST after Tasks 2-12.
 * They currently exist, so this test fails (RED) — that is the expected baseline.
 */

// 6 discarded v1 routes (surface-map.md: "Rotas v1 descartadas (6)")
const DISCARDED_V1_ROUTES = [
  "ws/route.ts",
  "agents/credentials/route.ts",
  "agents/health/route.ts",
  "agents/tasks/route.ts",
  "agents/tasks/[id]/route.ts",
  "provider-plugin-manifest/route.ts",
];

// Discarded API route prefixes (surface-map.md sections G2-G10)
const DISCARDED_API_ROUTE_PREFIXES = [
  "mcp/",
  "a2a/",
  "conductor/",
  "acp/agents/", // G4: /api/acp/agents only (not all acp/*)
  "services/",
  "plugins",
  "memory/",
  "skills/",
  "agent-skills/",
  "radar/",
  "tools/agent-bridge/",
  "tools/traffic-inspector/",
  "cli-tools/runtime/",
  "cli-tools/antigravity-mitm", // G9/G10: CLI tools + antigravity-mitm
  "tunnels/",
  "sync/",
  "version-manager/",
];

function anyRouteUnderPrefix(prefix: string): boolean {
  const fullDir = path.join(API_ROUTES_DIR, prefix);
  if (!fs.existsSync(fullDir)) return false;
  // Check for any route.ts file under this prefix
  function hasRouteTs(dir: string): boolean {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (hasRouteTs(fullPath)) return true;
      } else if (entry.name === "route.ts") {
        return true;
      }
    }
    return false;
  }
  return hasRouteTs(fullDir);
}

test("v1 discarded routes — 6 routes must not exist (RED baseline)", async (t) => {
  for (const route of DISCARDED_V1_ROUTES) {
    await t.test(`${route} must not exist`, () => {
      const fullPath = path.join(V1_ROUTES_DIR, route);
      assert.ok(
        !fs.existsSync(fullPath),
        `${route} must be removed (currently exists — RED baseline)`
      );
    });
  }
});

test("discarded API routes — all prefixes must not exist (RED baseline)", async (t) => {
  for (const prefix of DISCARDED_API_ROUTE_PREFIXES) {
    await t.test(`api/${prefix}* must not exist`, () => {
      const exists = anyRouteUnderPrefix(prefix);
      assert.ok(
        !exists,
        `Routes under api/${prefix} must be removed (currently exist — RED baseline)`
      );
    });
  }
});
