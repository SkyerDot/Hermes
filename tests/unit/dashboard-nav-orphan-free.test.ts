import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Dashboard navigation orphan-free test (Task 1 baseline — RED expected).
 * Verifies that no discarded nav IDs appear in sidebar visibility configs.
 * These IDs are clearly discardable per surface-map.md.
 * IDs `discovery`, `settings-ai`, `settings-modality-bridge` are FRONTEIRA — NOT included.
 */

const DISCARDED_NAV_IDS = [
  // G2 MCP
  "mcp",
  "audit-mcp",
  // G3 A2A + Conductor
  "a2a",
  "conductor",
  "orchestration",
  "audit-a2a",
  // G4 ACP + Cloud Agents
  "acp-agents",
  "cloud-agents",
  "cli-agents",
  // G5 Skills + Memory
  "memory",
  "agent-skills",
  "skills",
  // G7 Gamification / Evals / Webhooks
  "leaderboard",
  "profile",
  "tokens",
  "gamification-admin",
  "analytics-evals",
  "webhooks",
  // G8 Plugins / Services
  "embedded-services",
  "plugins",
  "cli-code",
  // G10 Radar / Traffic / Agent Bridge
  "radar",
  "traffic-inspector",
  "agent-bridge",
];

// FRONTEIRA — explicitly NOT included (per task brief)
const FRONTEIRA_NAV_IDS = ["discovery", "settings-ai", "settings-modality-bridge"];

const SIDEBAR_VISIBILITY_FILES = [
  "src/shared/constants/sidebarVisibility/sections.ts",
  "src/shared/constants/sidebarVisibility/types.ts",
  "src/shared/constants/sidebarVisibility.ts",
  "src/shared/constants/sidebarGroupVisibility.ts",
];

function readFile(file: string): string {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Sidebar file not found: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function extractAllIdsFromSidebar(content: string): string[] {
  const ids = new Set<string>();
  // Match id: "value" or id: 'value' in object literals
  const idRegex = /id:\s*["']([^"']+)["']/g;
  let match;
  while ((match = idRegex.exec(content)) !== null) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}

test("dashboard nav orphan-free — no discarded IDs in sidebarVisibility configs (RED baseline)", async (t) => {
  for (const file of SIDEBAR_VISIBILITY_FILES) {
    await t.test(`${file} contains no discarded nav IDs`, () => {
      const content = readFile(file);
      const allIds = extractAllIdsFromSidebar(content);
      const foundDiscarded = DISCARDED_NAV_IDS.filter((id) => allIds.includes(id));
      assert.strictEqual(
        foundDiscarded.length,
        0,
        `${file} must not contain discarded nav IDs. Found: ${foundDiscarded.join(", ")} (RED baseline — will be GREEN after Tasks 2-12)`
      );
    });
  }
});

test("dashboard nav orphan-free — fronteira IDs are documented but NOT asserted absent", () => {
  // This test documents which IDs are fronteira (decision pending) and should NOT be asserted.
  // They appear in the configs currently; that is expected.
  for (const file of SIDEBAR_VISIBILITY_FILES) {
    const content = readFile(file);
    const allIds = extractAllIdsFromSidebar(content);
    const foundFronteira = FRONTEIRA_NAV_IDS.filter((id) => allIds.includes(id));
    // Just log — no assertion. These are fronteira per task brief.
    if (foundFronteira.length > 0) {
      console.log(
        `[FRONTEIRA] ${file} contains fronteira IDs (expected): ${foundFronteira.join(", ")}`
      );
    }
  }
  // Always passes — documents the fronteira
  assert.ok(
    true,
    "Fronteira IDs documented (not asserted absent): discovery, settings-ai, settings-modality-bridge"
  );
});
