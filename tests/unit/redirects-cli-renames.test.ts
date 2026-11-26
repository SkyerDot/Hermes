import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "../..");
const configSource = await readFile(join(repoRoot, "next.config.mjs"), "utf8");

test("next.config.mjs no longer redirects to the removed CLI dashboard", () => {
  assert.equal(configSource.includes('destination: "/dashboard/cli-code"'), false);
  assert.equal(configSource.includes('source: "/dashboard/cli-tools"'), false);
  assert.equal(configSource.includes('source: "/dashboard/cli-tools/:path*"'), false);
});

test("next.config.mjs no longer redirects to removed agent tabs", () => {
  assert.equal(configSource.includes('destination: "/dashboard/acp-agents"'), false);
  assert.equal(configSource.includes('source: "/dashboard/agents"'), false);
});

test("next.config.mjs has permanent redirect from /dashboard/providers/freepik to /dashboard/providers/magnific", () => {
  assert.ok(
    configSource.includes('source: "/dashboard/providers/freepik"') &&
      configSource.includes('destination: "/dashboard/providers/magnific"'),
    "expected /dashboard/providers/freepik → /dashboard/providers/magnific redirect in next.config.mjs"
  );
});
