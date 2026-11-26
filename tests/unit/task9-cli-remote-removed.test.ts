import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function exists(file: string): boolean {
  return fs.existsSync(file);
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

test("Task 9 removed CLI, remote and sync surfaces stay absent", () => {
  for (const file of [
    "bin/cli/commands",
    "bin/cli/launch",
    "bin/cli/tray",
    "bin/cli/tui",
    "bin/cli/tui-components",
    "bin/mcp-server.mjs",
    "bin/reset-password.mjs",
    "src/lib/cliTools",
    "src/lib/cli-helper",
    "src/lib/sync",
    "src/app/api/cli-tools",
    "src/app/api/cli",
    "src/app/api/tunnels",
    "src/app/api/sync",
    "src/app/api/db-backups",
    "src/app/api/launch",
    "src/app/api/version-manager",
    "src/app/api/init",
    "src/app/api/restart",
    "src/app/api/shutdown",
    "src/app/api/synced-available-models",
    "src/app/api/jobs",
    "src/app/(dashboard)/dashboard/cli-code",
  ]) {
    assert.equal(exists(file), false, `${file} must not exist`);
  }
});

test("Task 9 retained gateway and inference boundary stays intact", () => {
  for (const file of [
    "bin/omniroute.mjs",
    "bin/gateway.mjs",
    "src/shared/services/localCliAvailability.ts",
    "src/shared/services/cliRuntime.ts",
    "open-sse/services/qoderCliResolve.ts",
    "open-sse/services/qoderCliSpawn.ts",
    "open-sse/executors/zcodeProtocol.ts",
    "src/app/api/v1/models/catalog.ts",
    "scripts/dev/run-next.mjs",
    "scripts/dev/responses-ws-proxy.mjs",
    "scripts/dev/standalone-server-ws.mjs",
  ]) {
    assert.equal(exists(file), true, `${file} must exist`);
  }

  const gateway = read("bin/gateway.mjs");
  assert.match(gateway, /OMNIROUTE_HEADLESS/);
  assert.match(gateway, /applyHeadlessServeEnv|resolveServeHeadless/);
});

test("Task 9 removed registries no longer mention removed surfaces", () => {
  for (const file of [
    "src/shared/constants/sidebarVisibility/sections.ts",
    "src/shared/constants/sidebarVisibility/types.ts",
    "src/shared/components/Header.tsx",
  ]) {
    assert.doesNotMatch(read(file), /cli-code/, `${file} must not mention cli-code`);
  }

  for (const id of ["discovery", "settings-ai", "settings-modality-bridge"]) {
    assert.match(read("src/shared/constants/sidebarVisibility/types.ts"), new RegExp(`"${id}"`));
  }

  const guard = read("src/server/authz/routeGuard.ts");
  const routeEntries = guard
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"/api/'));
  assert.equal(
    routeEntries.some((line) => line.startsWith('"/api/cli-tools/runtime/')),
    false
  );
  assert.equal(
    routeEntries.some((line) => line.startsWith('"/api/cli-tools/antigravity-mitm')),
    false
  );

  const pkg = JSON.parse(read("package.json")) as {
    bin?: Record<string, string>;
  };
  assert.equal(pkg.bin?.omniroute, "bin/omniroute.mjs");
  assert.equal(pkg.bin?.["omniroute-reset-password"], undefined);
});
