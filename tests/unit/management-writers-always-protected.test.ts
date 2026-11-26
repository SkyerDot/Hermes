// With login disabled (requireLogin=false, the "local-first" mode `omniroute setup` and the
// onboarding "skip" write), every MANAGEMENT route is anonymous unless it is in
// ALWAYS_PROTECTED_API_PATHS. Log-export destinations can ship call logs to a caller-chosen
// BigQuery project, so they stay authenticated in every mode.
//
// Anonymous calls send an invalid JSON body: before the fix they passed the auth gate and
// stopped at the 400 "invalid JSON" branch, so the RED run has no side effects.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeManagementSessionRequest } from "../helpers/managementSession.ts";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-mgmt-writers-"));
const ORIGINAL_ENV = {
  DATA_DIR: process.env.DATA_DIR,
  API_KEY_SECRET: process.env.API_KEY_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
};
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "mgmt-writers-api-key-secret";
process.env.JWT_SECRET = "mgmt-writers-jwt-secret";

const core = await import("../../src/lib/db/core.ts");
const { updateSettings } = await import("../../src/lib/db/settings.ts");
const { isAlwaysProtectedPath } = await import("../../src/server/authz/routeGuard.ts");
const destinationsRoute = await import("../../src/app/api/log-export/destinations/route.ts");
const runRoute = await import("../../src/app/api/log-export/destinations/[id]/run/route.ts");
const statusRoute = await import("../../src/app/api/log-export/status/route.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const BASE = "http://localhost:20128";
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function anonymous(pathname: string, method = "GET"): Request {
  return new Request(`${BASE}${pathname}`, {
    method,
    headers: method === "GET" ? {} : { "content-type": "application/json" },
    body: method === "GET" ? undefined : "not-json",
  });
}

async function assertUnauthenticated(label: string, response: Response): Promise<void> {
  const text = await response.text();
  assert.equal(response.status, 401, `${label}: expected 401, got ${response.status}: ${text}`);
  assert.ok(!text.includes("at /"), `${label}: 401 body must not leak a stack trace`);
}

async function withLoginDisabled(run: () => Promise<void>): Promise<void> {
  await updateSettings({ requireLogin: false, setupComplete: true });
  try {
    await run();
  } finally {
    await updateSettings({ requireLogin: true });
  }
}

test("the central route guard always protects the log-export routes", () => {
  for (const p of [
    "/api/log-export/destinations",
    "/api/log-export/destinations/dest-1/run",
    "/api/log-export/destinations/dest-1/test",
    "/api/log-export/status",
  ]) {
    assert.equal(isAlwaysProtectedPath(p), true, `${p} must be ALWAYS_PROTECTED`);
  }
  // The bulk log-export sibling was already protected before this fix.
  assert.equal(isAlwaysProtectedPath("/api/logs/export"), true);
});

test("with login disabled, anonymous callers cannot configure or run a log export", async () => {
  await withLoginDisabled(async () => {
    await assertUnauthenticated(
      "GET /api/log-export/destinations",
      await destinationsRoute.GET(anonymous("/api/log-export/destinations"))
    );
    await assertUnauthenticated(
      "POST /api/log-export/destinations",
      await destinationsRoute.POST(anonymous("/api/log-export/destinations", "POST"))
    );
    await assertUnauthenticated(
      "POST /api/log-export/destinations/[id]/run",
      await runRoute.POST(
        anonymous("/api/log-export/destinations/missing/run", "POST"),
        idCtx("missing")
      )
    );
    await assertUnauthenticated(
      "GET /api/log-export/status",
      await statusRoute.GET(anonymous("/api/log-export/status"))
    );
  });
});

test("with login disabled, a dashboard session keeps using these routes", async () => {
  await withLoginDisabled(async () => {
    const list = await destinationsRoute.GET(
      await makeManagementSessionRequest(`${BASE}/api/log-export/destinations`)
    );
    assert.equal(list.status, 200, await list.clone().text());
  });
});
