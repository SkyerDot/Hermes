/**
 * Regression: when OMNIROUTE_BUILD_PROFILE=minimal is the resolved build
 * profile, the remaining stub modules throw FeatureDisabledError instead of
 * performing their privileged operations.
 * See docs/security/SOCKET_DEV_FINDINGS.md.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

test("featureDisabledError carries the featureName", async () => {
  const mod = await import("../../../src/lib/build-profile/featureDisabled.ts");
  const err = mod.featureDisabledError("my-feature");
  assert.equal(err.featureName, "my-feature");
  assert.match(err.message, /my-feature/);
  assert.match(err.message, /minimal/);
  assert.equal("OMNIROUTE_BUILD_PROFILE" in mod, false);
  assert.equal("IS_MINIMAL_BUILD" in mod, false);
});

test("keychain-reader.stub.ts: discoverZedCredentials / getZedCredential throw", async () => {
  const stub = await import("../../../src/lib/zed-oauth/keychain-reader.stub.ts");
  await assert.rejects(() => stub.discoverZedCredentials(), /zed-keychain-import/);
  await assert.rejects(() => stub.getZedCredential("openai"), /zed-keychain-import/);
  assert.equal(await stub.isZedInstalled(), false);
});

test("cloudSync.stub.ts: syncToCloud soft-fails with feature-disabled message", async () => {
  const stub = await import("../../../src/lib/cloudSync.stub.ts");
  const result = await stub.syncToCloud("machine-id");
  assert.deepEqual(result, {
    error: "Cloud Sync is disabled in this build (minimal profile)",
  });
  assert.equal(stub.CLOUD_SYNC_SECRETS_ENABLED, false);
  await assert.rejects(() => stub.fetchWithTimeout(), /cloud-sync/);
});
