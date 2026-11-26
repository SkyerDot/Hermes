/**
 * The old logs/activity redirect was pruned with the logs surface; the retained
 * activity page is /dashboard/activity. These guards keep the dead redirect from
 * coming back and check the live activity client's API contract.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const fromRepoRoot = (relative: string) =>
  resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "../../..", relative);

test("logs/activity/page.tsx stays removed (activity lives at /dashboard/activity)", () => {
  assert.equal(
    existsSync(fromRepoRoot("src/app/(dashboard)/dashboard/logs/activity/page.tsx")),
    false
  );
});

test("AuditLogTab.tsx no longer exists (deleted by F4)", () => {
  const AUDIT_LOG_TAB_PATH = fromRepoRoot("src/app/(dashboard)/dashboard/logs/AuditLogTab.tsx");
  let exists = false;
  try {
    readFileSync(AUDIT_LOG_TAB_PATH);
    exists = true;
  } catch {
    exists = false;
  }
  assert.ok(!exists, "AuditLogTab.tsx must have been deleted");
});

// Also confirm ActivityFeedClient exists
test("activity/ActivityFeedClient.tsx exists", () => {
  const CLIENT_PATH = fromRepoRoot("src/app/(dashboard)/dashboard/activity/ActivityFeedClient.tsx");
  let src: string;
  try {
    src = readFileSync(CLIENT_PATH, "utf-8");
  } catch {
    assert.fail("ActivityFeedClient.tsx does not exist");
    return;
  }
  assert.ok(src.includes("/api/compliance/audit-log"), "Client must fetch from audit-log endpoint");
  // The client sets level: "high" in URLSearchParams (produces level=high in the query string)
  assert.ok(
    src.includes('level: "high"') || src.includes("level=high"),
    "Client must request level=high"
  );
});
