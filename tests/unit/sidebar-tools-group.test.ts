import test from "node:test";
import assert from "node:assert/strict";

const sidebarVisibility = await import("../../src/shared/constants/sidebarVisibility.ts");

function getToolsGroup() {
  const omniProxySection = sidebarVisibility.SIDEBAR_SECTIONS.find(
    (section) => section.id === "omni-proxy"
  );
  assert.ok(omniProxySection, "expected omni-proxy section to exist");

  const toolsGroup = omniProxySection.children.find(
    (
      child
    ): child is (typeof sidebarVisibility.SIDEBAR_SECTIONS)[number]["children"][number] & {
      type: "group";
    } =>
      "type" in child &&
      (child as { type: string }).type === "group" &&
      (child as { id: string }).id === "tools"
  );
  assert.ok(toolsGroup, "expected tools group to exist in omni-proxy section");
  return toolsGroup as {
    type: "group";
    id: string;
    items: readonly { id: string; href: string; i18nKey: string }[];
  };
}

test("TOOLS_GROUP items follow plan 14 order: cli-code → agent-bridge → traffic-inspector → discovery", () => {
  const toolsGroup = getToolsGroup();
  const itemIds = toolsGroup.items.map((item) => item.id);
  // cli-code from plan 14 (#2839); agent-bridge/traffic-inspector from plans 11/12 (#2858); discovery from #5939.
  assert.deepEqual(
    itemIds,
    ["cli-code", "agent-bridge", "traffic-inspector", "discovery"],
    "TOOLS_GROUP items order must be cli-code, agent-bridge, traffic-inspector, discovery"
  );
});

test("TOOLS_GROUP cli-code item has correct href and i18nKey", () => {
  const toolsGroup = getToolsGroup();
  const cliCode = toolsGroup.items.find((item) => item.id === "cli-code");
  assert.ok(cliCode, "expected cli-code in TOOLS_GROUP");
  assert.equal(cliCode.href, "/dashboard/cli-code");
  assert.equal(cliCode.i18nKey, "cliCode");
});

test("TOOLS_GROUP does NOT contain legacy cli-tools or agents entries", () => {
  const toolsGroup = getToolsGroup();
  const legacyIds = toolsGroup.items
    .map((item) => item.id)
    .filter((id) => id === "cli-tools" || id === "agents");
  assert.deepEqual(
    legacyIds,
    [],
    "TOOLS_GROUP must not contain legacy 'cli-tools' or 'agents' entries"
  );
});
