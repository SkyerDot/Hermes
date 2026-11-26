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
  // G7 Gamification / Evals / Webhooks (including the empty group)
  "leaderboard",
  "profile",
  "tokens",
  "gamification-admin",
  "analytics-evals",
  "webhooks",
  "gamification",
  // G8 Plugins / Services
  "embedded-services",
  "plugins",
  "cli-code",
  // G10 Radar / Traffic / Agent Bridge
  "radar",
  "traffic-inspector",
  "agent-bridge",
];

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

function containsDiscardedId(content: string, discardedId: string): boolean {
  // Check if discardedId appears as a string literal (double or single quoted)
  // This catches: "mcp", 'mcp', id: "mcp", "mcp" in arrays/Sets, etc.
  const doubleQuoted = `"${discardedId}"`;
  const singleQuoted = `'${discardedId}'`;
  return content.includes(doubleQuoted) || content.includes(singleQuoted);
}

function findDiscardedIdsInContent(content: string): string[] {
  return DISCARDED_NAV_IDS.filter((id) => containsDiscardedId(content, id));
}

test("dashboard nav orphan-free — no discarded IDs in sidebarVisibility configs (RED baseline)", async (t) => {
  for (const file of SIDEBAR_VISIBILITY_FILES) {
    await t.test(`${file} contains no discarded nav IDs`, () => {
      const content = readFile(file);
      const foundDiscarded = findDiscardedIdsInContent(content);
      assert.strictEqual(
        foundDiscarded.length,
        0,
        `${file} must not contain discarded nav IDs. Found: ${foundDiscarded.join(", ")} (RED baseline — will be GREEN after Tasks 2-12)`
      );
    });
  }
});
