import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function exists(file: string): boolean {
  return fs.existsSync(file);
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

const REMOVED_MODULES = [
  "src/lib/memory",
  "src/lib/agentSkills",
  "src/shared/schemas/memory.ts",
  "src/shared/constants/agentSkills.ts",
  "src/lib/skills/custom.ts",
  "src/lib/skills/hybrid.ts",
  "src/lib/skills/providerSettings.ts",
  "src/lib/skills/sandbox.ts",
  "src/lib/skills/schemas.ts",
  "src/lib/skills/skillssh.ts",
  "src/lib/skills/webFetchExecution.ts",
  "src/lib/skills/followUpTranscript.ts",
  "src/lib/skills/githubCollector.ts",
  "src/lib/skills/builtin/browser.ts",
  "src/lib/skills/a2a.ts",
];

const REMOVED_ROUTES = [
  "src/app/api/memory",
  "src/app/api/skills",
  "src/app/api/agent-skills",
  "src/app/api/github-skills",
  "src/app/api/settings/memory",
  "src/app/api/settings/qdrant",
  "src/app/(dashboard)/dashboard/memory",
  "src/app/(dashboard)/dashboard/agent-skills",
  "src/app/(dashboard)/dashboard/omni-skills",
];

const REMOVED_SETTINGS_UI = [
  "src/app/(dashboard)/dashboard/settings/components/MemorySkillsTab.tsx",
];

const RETAINED_LIBRARY = [
  "src/lib/skills/interception.ts",
  "src/lib/skills/executor.ts",
  "src/lib/skills/registry.ts",
  "src/lib/skills/builtins.ts",
  "src/lib/skills/memoryBuiltins.ts",
  "src/lib/skills/injection.ts",
  "src/lib/skills/toolLoopTypes.ts",
  "src/lib/skills/serverOwnedToolLoop.ts",
  "src/lib/skills/stableJson.ts",
  "src/lib/skills/toolExecutionFence.ts",
  "src/lib/skills/types.ts",
];

const CHATCORE_FILES = [
  "open-sse/handlers/chatCore.ts",
  "open-sse/handlers/chatCore/memorySkillsInjection.ts",
  "open-sse/handlers/chatCore/nonStreamingResponse.ts",
  "open-sse/handlers/chatCore/streamingTail.ts",
  "open-sse/handlers/chatCore/memoryExtraction.ts",
  "open-sse/handlers/chatCore/serverOwnedToolLoopWire.ts",
];

test("Task 10 removed skills/memory production surface stays absent", () => {
  for (const file of [...REMOVED_MODULES, ...REMOVED_ROUTES, ...REMOVED_SETTINGS_UI]) {
    assert.equal(exists(file), false, `${file} must not exist`);
  }
});

test("Task 10 retained (iii) skills library and OpenChamber bridge stay present", () => {
  for (const file of [
    ...RETAINED_LIBRARY,
    "open-sse/handlers/chatCore/injectedToolHelpers.ts",
    "open-sse/services/openChamberBridge.ts",
  ]) {
    assert.equal(exists(file), true, `${file} must exist`);
  }
  const bridge = read("open-sse/services/openChamberBridge.ts");
  assert.match(bridge, /OMNIROUTE_OPENCHAMBER_BRIDGE_URL/);
  assert.match(bridge, /sanitizeErrorMessage/);
  assert.match(bridge, /z\.object/);
});

test("Task 10 retained chatCore has no imports of removed modules", () => {
  const forbidden =
    /@\/lib\/memory|@\/lib\/agentSkills|lib\/skills\/(custom|hybrid|providerSettings|sandbox|schemas|skillssh|webFetchExecution|followUpTranscript|githubCollector|a2a)\b|lib\/skills\/builtin\/browser/;
  for (const file of CHATCORE_FILES) {
    assert.doesNotMatch(read(file), forbidden, `${file} must not import removed modules`);
  }
});

test("Task 10 removed nav IDs and settings flags stay absent", () => {
  for (const file of [
    "src/shared/constants/sidebarVisibility/sections.ts",
    "src/shared/constants/sidebarVisibility/types.ts",
    "src/shared/constants/sidebarVisibility.ts",
    "src/shared/constants/sidebarGroupVisibility.ts",
  ]) {
    for (const id of ["memory", "agent-skills", "skills"]) {
      assert.equal(
        read(file).includes(`"${id}"`) || read(file).includes(`'${id}'`),
        false,
        `${file} must not contain nav id ${id}`
      );
    }
  }

  for (const flag of [
    "SKILLS_SANDBOX_NETWORK_ENABLED",
    "MEMORY_TYPED_DECAY_ENABLED",
    "skillsEnabled",
    "memoryEnabled",
    "memoryTransformersEnabled",
    "memoryStaticEnabled",
    "memoryRerankEnabled",
  ]) {
    for (const file of [
      "src/shared/constants/featureFlagDefinitions.ts",
      "src/shared/constants/protectedFeatureFlags.ts",
    ]) {
      assert.equal(read(file).includes(flag), false, `${file} must not contain ${flag}`);
    }
  }

  // The server-owned tool loop is pipeline infrastructure (iii), not a skills route.
  assert.match(
    read("src/shared/constants/featureFlagDefinitions.ts"),
    /SERVER_OWNED_TOOL_LOOP_ENABLED/
  );
});

test("Task 10 no orphaned local-only classifications for removed routes", () => {
  const guard = read("src/server/authz/routeGuard.ts");
  for (const route of ["/api/acp/agents", "/api/skills/install", "/api/skills/executions"]) {
    assert.equal(guard.includes(route), false, `routeGuard.ts must not mention ${route}`);
  }
  const spawnPrefixes = read("src/shared/constants/spawnCapablePrefixes.ts");
  for (const route of ["/api/skills/install", "/api/skills/executions"]) {
    assert.equal(
      spawnPrefixes.includes(route),
      false,
      `spawnCapablePrefixes.ts must not mention ${route}`
    );
  }
});
