// Task 13 guard: scaffolding left behind by the Hermes inference-scope prune
// must not keep referencing surfaces that no longer exist.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf-8");
const list = (dir: string) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((name) => name.startsWith("compression") && name.endsWith(".test.tsx"))
    .map((name) => `${dir}/${name}`);

test("compression UI tests do not mock the removed mcp-accessibility endpoint", () => {
  const offenders = list("tests/unit/ui").filter((file) =>
    read(file).includes("mcp-accessibility")
  );
  assert.deepEqual(offenders, []);
});

test("integration wiring has no skipped test asserting on removed log UI files", () => {
  const source = read("tests/integration/integration-wiring.test.ts");
  const skipped = [...source.matchAll(/it\.skip\([\s\S]*?\n  \}\);/g)].map((m) => m[0]);
  const dead = skipped.filter(
    (block) => block.includes("RequestLoggerV2.tsx") || block.includes("dashboard/logs/page.tsx")
  );
  assert.deepEqual(dead, []);
});

test("integration wiring has no assertion on the removed MemorySkillsTab", () => {
  const source = read("tests/integration/integration-wiring.test.ts");
  assert.equal(source.includes("MemorySkillsTab"), false);
});

test("progress-bar exception list has no entry for the deleted SkillPreviewPane", () => {
  const source = read("tests/unit/progress-bars-have-semantics.test.ts");
  assert.equal(source.includes("SkillPreviewPane.tsx"), false);
});

test("ENVIRONMENT.md does not describe the removed live WebSocket port", () => {
  const source = read("docs/reference/ENVIRONMENT.md");
  assert.equal(source.includes("live WebSocket port"), false);
  const quotaRow = source.split("\n").find((line) => line.includes("`QUOTA_PANEL_PORT`"));
  assert.ok(quotaRow);
  assert.equal(quotaRow?.includes("dashboard, API or live WebSocket port"), false);
});
