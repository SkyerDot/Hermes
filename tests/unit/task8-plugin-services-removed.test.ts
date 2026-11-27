import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function exists(file: string): boolean {
  return fs.existsSync(file);
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

test("Task 8 removed modules and routes stay absent", () => {
  for (const file of [
    "src/lib/plugins",
    "src/lib/services/ServiceSupervisor.ts",
    "src/lib/services/bootstrap.ts",
    "src/lib/services/registry.ts",
    "src/lib/services/installers",
    "src/lib/db/plugins.ts",
    "src/lib/db/pluginMetrics.ts",
    "src/lib/db/serviceModels.ts",
    "src/app/api/services",
    "src/app/api/plugins",
    "src/app/api/settings/oneproxy",
    "src/app/api/settings/proxy/cloudflare-deploy",
    "src/app/api/v1/provider-plugin-manifest",
    "src/app/(dashboard)/dashboard/plugins",
    "src/app/(dashboard)/dashboard/providers/services",
    "src/shared/constants/featureFlagDefinitionsPlugins.ts",
  ]) {
    assert.equal(exists(file), false, `${file} must not exist`);
  }
});

test("the plugin onRequest gate and its empty seam are gone from chatCore", () => {
  for (const file of [
    "open-sse/handlers/chatCore/pluginRequestGate.ts",
    "open-sse/handlers/chatCore/pluginOnRequest.ts",
  ]) {
    assert.equal(exists(file), false, `${file} must not exist`);
  }
  const chatCore = read("open-sse/handlers/chatCore.ts");
  assert.ok(!chatCore.includes("runPluginRequestGate"), "chatCore must not call a removed gate");
  assert.ok(!chatCore.includes("runPluginOnRequestHook"), "no empty hook call may remain");
});

test("Task 8 removed nav ids and flag are gone from retained registries", () => {
  const sections = read("src/shared/constants/sidebarVisibility/sections.ts");
  const types = read("src/shared/constants/sidebarVisibility/types.ts");
  for (const file of [sections, types]) {
    assert.ok(!file.includes('"embedded-services"'), "embedded-services nav id must be absent");
    assert.ok(!file.includes('"plugins"'), "plugins nav id must be absent");
  }
  const flags = read("src/shared/constants/featureFlagDefinitions.ts");
  assert.ok(!flags.includes("PLUGIN_PERMISSION_MODEL_ENABLED"), "plugin flag must be absent");
});

test("Task 8 cloudflare relay deploy UI and schema are gone", () => {
  assert.equal(
    exists("src/app/(dashboard)/dashboard/settings/components/proxy/CloudflareRelayModal.tsx"),
    false
  );
  assert.ok(
    !read("src/shared/validation/freeProxySchemas.ts").includes("cloudflareDeploySchema"),
    "removed deploy schema must stay absent"
  );
  for (const file of [
    "src/app/(dashboard)/dashboard/settings/components/proxy/ProxyPoolTab.tsx",
    "src/app/(dashboard)/dashboard/settings/components/ProxyRegistryManager.tsx",
    "src/app/(dashboard)/dashboard/settings/components/proxyRegistryConstants.ts",
  ]) {
    assert.ok(!read(file).includes("CloudflareRelay"), `${file} must not expose relay deploy`);
  }
});

test("Task 8 retained inference consumers no longer import removed local machinery", () => {
  for (const file of [
    "open-sse/handlers/chatCore/pluginOnResponse.ts",
    "open-sse/handlers/chatCore/requestTranslationError.ts",
    "src/shared/services/bifrost/bifrostRouting.ts",
    "open-sse/executors/ninerouter.ts",
    "open-sse/services/combo/executeTargetGates.ts",
    "src/lib/usage/usageHistory.ts",
  ]) {
    const src = read(file);
    assert.ok(!src.includes("@/lib/plugins"), `${file} must not import plugins`);
    assert.ok(!src.includes("@/lib/services/"), `${file} must not import embedded services`);
  }
});
