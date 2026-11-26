import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SIDEBAR_SECTIONS, getSectionItems } from "../../src/shared/constants/sidebarVisibility";

/**
 * Dashboard navigation orphan-free test (Task 1 baseline — RED expected).
 * Verifies that no discarded nav IDs appear in sidebar visibility configs.
 * These IDs are clearly discardable per surface-map.md.
 * IDs `discovery`, `settings-ai`, `settings-modality-bridge` are FRONTEIRA — NOT included.
 *
 * Task 12 adds the final sweep: the retained inference path keeps only providers,
 * combos, compression/context, health/resilience, media/search, translator,
 * cache, limited settings, themes/i18n and help. Analytics, costs, request logs
 * and audit have no sidebar entry, and every remaining entry must resolve to a page.
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
  // Task 12 — analytics (combo-health stays reachable from /dashboard/combos)
  "analytics",
  "analytics-combo-health",
  "analytics-utilization",
  "analytics-compression",
  "analytics-search",
  "provider-stats",
  // Task 12 — costs (quota share included: provider quota lives at /dashboard/quota)
  "costs",
  "costs-pricing",
  "costs-teams",
  "costs-budget",
  "costs-free-tiers",
  "costs-quota-share",
  "free-provider-rankings",
  // Task 12 — request logs and conversations (call-log UI was removed with RequestLogger*)
  "logs",
  "logs-proxy",
  "logs-console",
  "logs-timeline",
  "logs-activity",
  "conversations",
  // Task 12 — audit UI (audit API/log export stay; the tab is gone)
  "audit",
  // Task 12 — removed MITM/proxy-tool pages were still listed as hideable
  "mitm-proxy",
  "1proxy",
];

const REMOVED_NAV_GROUP_IDS = ["gamification", "audit"];

const SIDEBAR_VISIBILITY_FILES = [
  "src/shared/constants/sidebarVisibility/sections.ts",
  "src/shared/constants/sidebarVisibility/types.ts",
  "src/shared/constants/sidebarVisibility.ts",
  "src/shared/constants/sidebarGroupVisibility.ts",
];

const REMOVED_DASHBOARD_PATHS = [
  "src/app/(dashboard)/dashboard/analytics/page.tsx",
  "src/app/(dashboard)/dashboard/analytics/utilization/page.tsx",
  "src/app/(dashboard)/dashboard/analytics/compression/page.tsx",
  "src/app/(dashboard)/dashboard/analytics/search/page.tsx",
  "src/app/(dashboard)/dashboard/costs",
  "src/app/(dashboard)/dashboard/audit",
  "src/app/(dashboard)/dashboard/logs",
  "src/app/(dashboard)/dashboard/conversations",
  "src/app/(dashboard)/dashboard/settings/pricing",
  "src/shared/components/RequestLoggerDetail.tsx",
  "src/shared/components/RequestLoggerDetail.sections.tsx",
  "src/shared/components/RequestLoggerV2.tsx",
  "src/shared/components/RequestTimeline.tsx",
  "src/app/api/settings/compression/mcp-accessibility/route.ts",
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

test("Task 12: no discarded nav group IDs survive in the coupled visibility lists", () => {
  for (const file of SIDEBAR_VISIBILITY_FILES) {
    const content = readFile(file);
    const found = REMOVED_NAV_GROUP_IDS.filter((id) => containsDiscardedId(content, id));
    assert.deepEqual(found, [], `${file} still contains removed nav group IDs`);
  }
});

test("Task 12: every sidebar entry resolves to a dashboard page", () => {
  const appRoot = path.resolve("src/app/(dashboard)");
  const missing: string[] = [];
  for (const section of SIDEBAR_SECTIONS) {
    for (const item of getSectionItems(section)) {
      if (item.external) continue;
      const candidate = path.join(appRoot, item.href, "page.tsx");
      if (!fs.existsSync(candidate)) {
        missing.push(`${section.id}/${item.id} → ${item.href}`);
      }
    }
  }
  assert.deepEqual(missing, [], "sidebar entries must not link to pages that do not exist");
});

test("Task 12: orphaned dashboard surfaces removed together with their nav entries", () => {
  const surviving = REMOVED_DASHBOARD_PATHS.filter((entry) => fs.existsSync(path.resolve(entry)));
  assert.deepEqual(surviving, [], "removed dashboard surfaces must not survive on disk");
});
