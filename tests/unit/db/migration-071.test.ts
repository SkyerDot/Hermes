/**
 * Migration 071 remains in the SQL history even though the embedded-services runtime
 * is gone. These checks pin the migration's schema and seed behavior without relying
 * on the removed versionManager.ts module.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-migration-071-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.NODE_ENV = "test";
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const core = await import("../../../src/lib/db/core.ts");

type ServiceRow = {
  tool: string;
  status: string;
  port: number;
  auto_start: number;
  auto_update: number;
  provider_expose: number;
  pid: number | null;
  logs_buffer_path: string | null;
  last_sync_at: string | null;
};

function getServiceRow(tool: string): ServiceRow | undefined {
  return core.getDbInstance().prepare("SELECT * FROM version_manager WHERE tool = ?").get(tool) as
    ServiceRow | undefined;
}

async function resetDb() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetDb();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("migration 071 — adds 3 new columns to version_manager", async () => {
  const db = core.getDbInstance();
  const columns = (
    db.prepare("PRAGMA table_info(version_manager)").all() as Array<{ name: string }>
  ).map((c) => c.name);

  assert.ok(columns.includes("logs_buffer_path"), "logs_buffer_path column missing");
  assert.ok(columns.includes("provider_expose"), "provider_expose column missing");
  assert.ok(columns.includes("last_sync_at"), "last_sync_at column missing");
});

test("migration 071 — seeds 9router row with expected defaults", async () => {
  const row = getServiceRow("9router");

  assert.ok(row !== null, "9router row should exist after migration");
  assert.equal(row?.tool, "9router");
  assert.equal(row?.status, "not_installed");
  assert.equal(row?.port, 20130);
  assert.equal(row?.auto_start, 0);
  assert.equal(row?.auto_update, 1);
  assert.equal(row?.provider_expose, 1);
  assert.equal(row?.pid, null);
  assert.equal(row?.logs_buffer_path, null);
  assert.equal(row?.last_sync_at, null);
});

test("migration 071 — idempotent: applying the seed twice produces no duplicate", async () => {
  const db = core.getDbInstance();

  assert.doesNotThrow(() => {
    db.exec(`INSERT OR IGNORE INTO version_manager
      (tool, status, port, auto_start, auto_update, provider_expose)
    VALUES
      ('9router', 'not_installed', 20130, 0, 1, 1)`);
  });

  const rows = db
    .prepare("SELECT * FROM version_manager WHERE tool = '9router'")
    .all() as unknown[];
  assert.equal(rows.length, 1, "Should be exactly 1 9router row after double-seed attempt");
});

test("migration 071 — existing CLIProxyAPI data survives the migration", async () => {
  const db = core.getDbInstance();

  db.prepare(
    `INSERT OR IGNORE INTO version_manager (tool, status, port, auto_start, auto_update)
     VALUES ('cliproxyapi', 'stopped', 8317, 1, 1)`
  ).run();

  const row = getServiceRow("cliproxyapi");
  assert.ok(row !== null, "cliproxyapi row should still exist");
  assert.equal(row?.status, "stopped");
  assert.equal(row?.port, 8317);
  assert.equal(row?.provider_expose, 0, "CLIProxyAPI provider_expose should default to 0");
});
