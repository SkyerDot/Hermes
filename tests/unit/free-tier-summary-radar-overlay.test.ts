/**
 * tests/unit/free-tier-summary-radar-overlay.test.ts
 *
 * GET /api/free-tier/summary answers from the shipped, release-frozen baseline
 * catalog only. Decision surfaces (`src/shared/utils/freeModels.ts`) read the
 * same baseline, so the public count can never disagree with the verdict.
 *
 * The response still publishes which catalog answered (`catalogSource`) and
 * the curation date of what it actually served (`catalogUpdatedAt`). The
 * operator-specific usage fields stay authenticated-only because this route
 * carries an unconditional wildcard CORS header.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-free-tier-summary-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.STORAGE_ENCRYPTION_KEY = "test-encryption-key-for-free-tier-summary-tests-32b";
process.env.JWT_SECRET = "test-jwt-secret-for-free-tier-summary-tests";
process.env.INITIAL_PASSWORD = "test-bootstrap-password-for-free-tier-summary-tests";

const core = await import("../../src/lib/db/core.ts");
const { GET } = await import("../../src/app/api/free-tier/summary/route.ts");
const { computeFreeModelTotals } = await import("../../open-sse/config/freeModelCatalog.ts");
const { FREE_CATALOG_CURATED_AT, FREE_MODEL_BUDGETS } =
  await import("../../open-sse/config/freeModelCatalog.data.ts");
const { listNoCredentialProviders } =
  await import("../../src/shared/utils/providerCredentialRequirement.ts");

async function authCookieHeader(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return `auth_token=${token}`;
}

async function getBody(authenticated = false, query = ""): Promise<Record<string, unknown>> {
  const res = await GET(
    new Request(`https://omni.test/api/free-tier/summary${query}`, {
      headers: authenticated ? { Cookie: await authCookieHeader() } : {},
    })
  );
  assert.equal(res.status, 200);
  return (await res.json()) as Record<string, unknown>;
}

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("baseline catalog answers with the honest source tag and curation date", async () => {
  const body = await getBody();
  const expected = computeFreeModelTotals();

  assert.equal(body.catalogSource, "baseline");
  assert.equal(body.catalogUpdatedAt, FREE_CATALOG_CURATED_AT);
  assert.equal(body.steadyRecurringTokens, expected.steadyRecurringTokens);
  assert.equal(body.gatedRecurringTokens, expected.gatedRecurringTokens);
  assert.equal(body.modelCount, expected.modelCount);
  assert.deepEqual(body.noCredentialProviders, listNoCredentialProviders());
});

test("excludeTosAvoid still filters the shipped catalog", async () => {
  const body = await getBody(false, "?excludeTosAvoid=1");
  const expected = computeFreeModelTotals({ excludeTosAvoid: true });

  assert.equal(body.catalogSource, "baseline");
  assert.equal(body.catalogUpdatedAt, FREE_CATALOG_CURATED_AT);
  assert.equal(body.steadyRecurringTokens, expected.steadyRecurringTokens);
  assert.equal(body.gatedRecurringTokens, expected.gatedRecurringTokens);
});

test("hardStopGuaranteed comes from the baseline entry", async () => {
  const target = FREE_MODEL_BUDGETS.find((m) => m.hardStopGuaranteed !== undefined);
  assert.ok(target, "the shipped catalog must carry at least one hard-stop guarantee");

  const body = await getBody();
  const perModel = body.perModel as Array<{
    provider: string;
    modelId: string;
    hardStopGuaranteed?: boolean;
  }>;
  const served = perModel.find(
    (m) => m.provider === target.provider && m.modelId === target.modelId
  );

  assert.equal(served?.hardStopGuaranteed, target.hardStopGuaranteed);
});

test("anonymous callers never receive the operator's usage fields", async () => {
  const body = await getBody(false);

  assert.equal(body.usedThisMonth, null);
  assert.equal(body.remaining, null);
});

test("authenticated callers receive the operator's usage fields", async () => {
  const body = await getBody(true);

  assert.equal(typeof body.usedThisMonth, "number");
  assert.equal(typeof body.remaining, "number");
  assert.equal(body.catalogSource, "baseline");
});

test("CORS preflight is answered without touching the catalog", async () => {
  const res = await GET(
    new Request("https://omni.test/api/free-tier/summary", { method: "OPTIONS" })
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
});
