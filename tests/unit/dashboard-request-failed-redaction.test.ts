import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { RequestFailedPayload } from "../../src/lib/events/types.ts";
import { DEFAULT_CODEX_CLIENT_VERSION } from "../../src/shared/constants/codexClient.ts";
import { nativeCoverageArgs } from "../_helpers/nativeCoverageArgs.ts";

const RESULT_PREFIX = "DASHBOARD_FAILURE_PROBE_RESULT=";
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const probePath = fileURLToPath(
  new URL("../fixtures/dashboard-request-failed-redaction-probe.ts", import.meta.url)
);

type ProbeResult = {
  delivered: RequestFailedPayload;
  replayMatches: boolean;
  internalLogRedacted: boolean;
  writerDrained: boolean;
};

function runProbe(env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [...nativeCoverageArgs(), "--import", "tsx/esm", probePath],
      {
        cwd: repoRoot,
        env,
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `dashboard failure probe exited unsuccessfully: ${error.message}\n` +
                `stdout:\n${stdout}\nstderr:\n${stderr}`
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

test("persistAttemptLogs redacts request.failed delivery/replay but keeps its internal log", async () => {
  const isolationRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "omniroute-dashboard-failure-redaction-")
  );
  const dataDir = path.join(isolationRoot, "data");
  const pluginsDir = path.join(isolationRoot, "plugins");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(pluginsDir, { recursive: true });

  try {
    // The subprocess receives only process/runtime basics plus synthetic OmniRoute settings: no
    // provider credentials are inherited and no parent singleton/env/global state is mutated.
    const { stdout, stderr } = await runProbe({
      PATH: process.env.PATH,
      NODE_PATH: process.env.NODE_PATH,
      LANG: process.env.LANG,
      LC_ALL: process.env.LC_ALL,
      TZ: process.env.TZ,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: "test",
      DATA_DIR: dataDir,
      OMNIROUTE_PLUGINS_DIR: pluginsDir,
      API_KEY_SECRET: "test-dashboard-failure-redaction-secret",
      // The subprocess is not a node:test worker. Pin this unrelated identity
      // so importing the real pipeline cannot start an npm registry refresh.
      GITHUB_COPILOT_CLI_VERSION: "1.0.91",
      CODEX_CLIENT_VERSION: DEFAULT_CODEX_CLIENT_VERSION,
      PII_RESPONSE_SANITIZATION: "false",
    });

    assert.doesNotMatch(stderr, /sk-live-dashboard-secret|\/srv\/omniroute/);
    const resultLine = stdout.split(/\r?\n/).find((line) => line.startsWith(RESULT_PREFIX));
    assert.ok(resultLine, `probe did not emit its result marker; stdout:\n${stdout}`);
    const result = JSON.parse(resultLine.slice(RESULT_PREFIX.length)) as ProbeResult;

    assert.equal(result.delivered.id, "trace-dashboard-redaction");
    assert.equal(result.delivered.statusCode, 502);
    assert.equal(result.delivered.model, "private-model");
    assert.equal(result.delivered.provider, "private-provider");
    assert.equal(
      result.delivered.error,
      "Error: Provider failed in <path> with api_key='[REDACTED]'"
    );
    assert.equal(result.replayMatches, true);
    assert.equal(result.internalLogRedacted, true);
    assert.equal(result.writerDrained, true);
  } finally {
    // The probe exits only after draining/closing its writer and resetting its DB singleton.
    fs.rmSync(isolationRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
