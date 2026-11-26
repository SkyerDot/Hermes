// CodeQL js/path-injection #1371/#1372/#1373 (GHSA-7pq4-8pvv-rx7r): the
// host-filesystem root guard is a shared security helper. The two endpoints that
// used to expose a caller-chosen root (/api/settings/local-corpus and
// /api/settings/obsidian/webdav) were removed with the context sources, but the
// helper itself stays and must keep refusing system/root directories.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-path-roots-home-"));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = FAKE_HOME;

const ORDINARY_VAULT = path.join(FAKE_HOME, "Documents", "vault");
fs.mkdirSync(ORDINARY_VAULT, { recursive: true });

test.after(() => {
  if (ORIGINAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;
  fs.rmSync(FAKE_HOME, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("isDeniedRootDirectory: system directories and their children, root and home itself", async () => {
  const { isDeniedRootDirectory } = await import("../../src/lib/deniedRootDirectories.ts");
  for (const denied of ["/", FAKE_HOME, `${FAKE_HOME}/`, "/etc", "/etc/ssh", "/usr/local/bin"]) {
    assert.equal(isDeniedRootDirectory(denied), true, denied);
  }
  for (const allowed of [ORDINARY_VAULT, path.join(FAKE_HOME, "Documents")]) {
    assert.equal(isDeniedRootDirectory(allowed), false, allowed);
  }
});
