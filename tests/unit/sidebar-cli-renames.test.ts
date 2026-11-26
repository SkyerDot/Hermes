import test from "node:test";
import assert from "node:assert/strict";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

test("HIDEABLE_SIDEBAR_ITEM_IDS includes cli-code (plan 14 rename)", () => {
  assert.ok(
    (sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS as readonly string[]).includes("cli-code"),
    "expected 'cli-code' in HIDEABLE_SIDEBAR_ITEM_IDS"
  );
});

test("HIDEABLE_SIDEBAR_ITEM_IDS no longer exposes the removed agent tabs", () => {
  const ids = sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS as readonly string[];
  for (const id of ["cli-agents", "acp-agents", "cloud-agents"]) {
    assert.equal(
      ids.includes(id),
      false,
      `expected '${id}' to be removed from HIDEABLE_SIDEBAR_ITEM_IDS`
    );
  }
});

test("HIDEABLE_SIDEBAR_ITEM_IDS does NOT include legacy cli-tools", () => {
  assert.equal(
    (sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS as readonly string[]).includes("cli-tools"),
    false,
    "expected 'cli-tools' to be removed from HIDEABLE_SIDEBAR_ITEM_IDS (plan 14 rename to cli-code)"
  );
});

test("HIDEABLE_SIDEBAR_ITEM_IDS does NOT include legacy agents", () => {
  assert.equal(
    (sidebarVisibility.HIDEABLE_SIDEBAR_ITEM_IDS as readonly string[]).includes("agents"),
    false,
    "expected 'agents' to be removed from HIDEABLE_SIDEBAR_ITEM_IDS (agent tabs removed)"
  );
});
