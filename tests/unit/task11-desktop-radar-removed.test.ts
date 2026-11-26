import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Task 11 boundary guard: desktop/Electron, PWA, MITM/TPROXY, AgentBridge,
 * TrafficInspector, OmniCopilot/plugin OpenCode and Radar must be gone, while
 * the web dashboard and the inference API keep their retained surfaces.
 *
 * The module/route assertions were written against the pre-removal tree (RED)
 * and then satisfied by deleting code, not by stubbing it out.
 */
const REMOVED_PATHS = [
  "electron",
  "src/mitm",
  "src/lib/copilot",
  "src/lib/radar",
  "src/lib/db/radar.ts",
  "src/lib/db/agentBridgeBypass.ts",
  "src/lib/db/agentBridgeMappings.ts",
  "src/lib/db/agentBridgeState.ts",
  "src/lib/db/inspectorCustomHosts.ts",
  "src/lib/db/inspectorSessions.ts",
  "src/lib/db/_rowTypes.ts",
  "src/shared/schemas/agentBridge.ts",
  "src/shared/schemas/inspector.ts",
  "src/shared/hooks/useElectron.ts",
  "src/shared/components/PwaRegister.tsx",
  "src/shared/constants/pwaThemeColors.ts",
  "public/sw.js",
  "public/icon-192.svg",
  "public/icon-512.png",
  "public/apple-touch-icon.png",
  "src/app/offline",
  "src/app/api/radar",
  "src/app/api/copilot/chat",
  "src/app/api/settings/mitm",
  "src/app/api/settings/proxies/traffic",
  "src/app/api/tools/agent-bridge",
  "src/app/api/tools/traffic-inspector",
  "src/app/(dashboard)/dashboard/radar",
  "src/app/(dashboard)/dashboard/system/mitm-proxy",
  "src/app/(dashboard)/dashboard/system/1proxy",
  "src/app/(dashboard)/dashboard/tools/agent-bridge",
  "src/app/(dashboard)/dashboard/tools/traffic-inspector",
  "src/app/(dashboard)/dashboard/VscodeCopilotBanner.tsx",
  "scripts/dev/smoke-electron-packaged.mjs",
  "scripts/build/buildMitm.mjs",
  "scripts/build/mitm-stub-flag.mjs",
  "scripts/build/build-tproxy-native.mjs",
  "scripts/build/prepare-electron-standalone.mjs",
  "tests/launch-smoke",
  "tests/e2e/traffic-inspector.spec.ts",
  "tests/e2e/agent-bridge-traffic-cross.spec.ts",
  "tests/unit/PwaRegister.test.tsx",
  "tests/unit/service-worker-navigation-fallback.test.ts",
  "tests/unit/inspector-types.test.ts",
  "tests/unit/inspector-har-export.test.ts",
  "tests/unit/shared-schemas.test.ts",
  "tests/unit/traffic-filter-live.test.ts",
  "tests/unit/tproxy-capture-api.test.ts",
];

const RETAINED_PATHS = [
  "src/app/api/v1/vscode/[token]/api/tags/route.ts",
  "src/app/api/v1/vscode/raw/[token]/api/tags/route.ts",
  "src/app/api/v1/vscode/combos/[token]/[[...slug]]/route.ts",
  "src/app/api/v1/web/fetch/route.ts",
  "src/app/api/v1/web/map/route.ts",
  "src/app/api/internal/codex-responses-ws/route.ts",
  "scripts/dev/responses-ws-proxy.mjs",
  "scripts/dev/run-next.mjs",
  "scripts/dev/standalone-server-ws.mjs",
  "tests/unit/cursor-models-route-spawn-gate-15159.test.ts",
  "tests/unit/v1-retained-routes-parity.test.ts",
  "tests/unit/radar-intel-supporter-hook.test.ts",
  "src/lib/arenaEloSync.ts",
  "src/app/(dashboard)/dashboard/discovery/page.tsx",
  "src/app/(dashboard)/dashboard/settings/ai/page.tsx",
  "src/app/(dashboard)/dashboard/settings/modality-bridge/page.tsx",
];

const SIDEBAR_FILES = [
  "src/shared/constants/sidebarVisibility/sections.ts",
  "src/shared/constants/sidebarVisibility/types.ts",
  "src/shared/constants/sidebarVisibility.ts",
  "src/shared/constants/sidebarGroupVisibility.ts",
];

const FORBIDDEN_IMPORTS =
  /(?:from\s*|import\s*|require\s*\()\s*["'][^"']*(?:@\/mitm\/|(?:\.\.\/)+mitm\/|@\/lib\/radar|@\/lib\/db\/radar|@\/lib\/copilot|@\/lib\/inspector|@\/lib\/db\/agentBridge|@\/lib\/db\/inspector|@\/shared\/hooks\/useElectron|@\/shared\/components\/PwaRegister|@\/shared\/constants\/pwaThemeColors|src\/mitm\/|src\/lib\/radar\/)/;

function exists(file: string): boolean {
  return fs.existsSync(file);
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx|mjs|cjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("Task 11 removed production and test surfaces stay absent", () => {
  for (const file of REMOVED_PATHS) {
    assert.equal(exists(file), false, `${file} must not exist`);
  }
});

test("Task 11 retained inference and dashboard surfaces stay present", () => {
  for (const file of RETAINED_PATHS) {
    assert.equal(exists(file), true, `${file} must exist`);
  }
});

test("Task 11 removed flags, nav IDs and local-only classifications stay absent", () => {
  for (const file of [
    "src/shared/constants/featureFlagDefinitions.ts",
    "src/shared/constants/protectedFeatureFlags.ts",
  ]) {
    for (const flag of ["RADAR_ENABLED", "MITM_DISABLE_TLS_VERIFY"]) {
      assert.equal(read(file).includes(flag), false, `${file} must not contain ${flag}`);
    }
  }

  const sidebarSources = SIDEBAR_FILES.map(read).join("\n");
  for (const file of SIDEBAR_FILES) {
    for (const id of ["radar", "radar-admin", "traffic-inspector", "agent-bridge"]) {
      assert.equal(
        read(file).includes(`"${id}"`) || read(file).includes(`'${id}'`),
        false,
        `${file} must not contain nav id ${id}`
      );
    }
  }
  for (const id of ["discovery", "settings-ai", "settings-modality-bridge"]) {
    assert.ok(
      sidebarSources.includes(`"${id}"`) || sidebarSources.includes(`'${id}'`),
      `sidebar registries must retain nav id ${id}`
    );
  }

  for (const file of [
    "src/server/authz/routeGuard.ts",
    "src/shared/constants/spawnCapablePrefixes.ts",
  ]) {
    for (const route of [
      "/api/tools/agent-bridge/",
      "/api/settings/mitm",
      "/api/cli-tools/antigravity-mitm",
      "/api/tools/traffic-inspector/",
    ]) {
      assert.equal(read(file).includes(route), false, `${file} must not classify ${route}`);
    }
  }
});

test("Task 11 retained code has no imports of removed modules", () => {
  for (const dir of ["src", "open-sse", "bin", "scripts"]) {
    for (const file of walk(dir)) {
      if (file.endsWith("task11-desktop-radar-removed.test.ts")) continue;
      assert.doesNotMatch(read(file), FORBIDDEN_IMPORTS, `${file} imports a removed module`);
    }
  }
});

test("Task 11 retained server-owned supporter hook and Arena ELO stay intact", () => {
  const testSource = read("tests/unit/radar-intel-supporter-hook.test.ts");
  assert.match(testSource, /recognizeSupporter/);
  assert.match(testSource, /radar:\[a-f0-9\]\{64\}/);
  assert.match(read("src/shared/constants/featureFlagDefinitions.ts"), /ARENA_ELO_SYNC_ENABLED/);
});
