import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, totalmem } from "node:os";
import {
  writePidFile,
  cleanupPidFile,
  waitForServer,
  findListeningPids,
  probePortFree,
  resolveReadyTimeoutMs,
} from "./cli/utils/pid.mjs";
import { ServerSupervisor, BUN_PRELOAD_PATH } from "./cli/runtime/processSupervisor.mjs";
import { isTermux } from "../scripts/build/postinstallSupport.mjs";
import {
  ensureAndroidCacheDir,
  isFatalInstrumentationHookFailure,
  formatAndroidInstrumentationFailureHint,
} from "./cli/utils/ensureAndroidCacheDir.mjs";
import { resolveServerHost, resolveExposureWarning } from "./cli/utils/serverHost.mjs";
import {
  resolveMaxOldSpaceMb,
  calibrateHeapFallbackMb,
  buildServerNodeOptions,
  buildNodeHeapArgs,
} from "../scripts/build/runtime-env.mjs";
import { resolveTlsOptions } from "../scripts/dev/tls-options.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const _pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

// URL scheme for the "OmniRoute is running" banner — flipped to https when
// opt-in TLS (#5242) is active. Process-scoped: one `serve` run = one scheme.
let urlScheme = "http";
// Headless mode (R0.1): one `serve` run = one mode. Drives the ready banner and
// suppresses the automatic browser open (the dashboard answers 404 headless).
let serveHeadless = false;
const ROOT = join(__dirname, "..");
// The standalone bundle ships in `dist/` (since the build-output-isolation
// refactor). Fall back to the legacy `app/` location so an upgrade over a
// partially-replaced install — or a package built before the rename — still
// boots. Backward-compatible by design: every deployed runtime keeps its path.
const APP_DIR = existsSync(join(ROOT, "dist", "server.js"))
  ? join(ROOT, "dist")
  : join(ROOT, "app");

/**
 * Headless mode (R0.1, rail 3.8.53): `--headless` hands the server process
 * `OMNIROUTE_HEADLESS=1` through the same child env that carries `--port`.
 * Returns a new object; the input env is never mutated. Exported for tests.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{ headless?: boolean }} [opts]
 */
export function applyHeadlessServeEnv(env, opts = {}) {
  if (opts.headless !== true) return env;
  return { ...env, OMNIROUTE_HEADLESS: "1" };
}

/**
 * True when this `serve` run is headless: the `--headless` flag or a truthy
 * `OMNIROUTE_HEADLESS` (1/true/yes/on — same values as src/lib/system/headless.ts).
 * Exported for tests.
 */
export function resolveServeHeadless(opts = {}, env = process.env) {
  if (opts.headless === true) return true;
  return /^(1|true|yes|on)$/i.test(String(env.OMNIROUTE_HEADLESS ?? "").trim());
}

function parsePort(value, fallback) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

/** Once-per-process guard so the Android/Termux cache hint is not spammed. */
let instrumentationFailureHintPrinted = false;

/**
 * If child output looks like Next.js failed to load its instrumentation hook
 * on Android/Termux, print a clear operator-facing fix hint.
 * Exported for unit tests.
 *
 * @param {string} text
 * @returns {boolean} true when a hint was printed
 */
export function maybeReportInstrumentationHookFailure(text) {
  if (instrumentationFailureHintPrinted) return false;
  if (!isFatalInstrumentationHookFailure(text)) return false;
  instrumentationFailureHintPrinted = true;
  process.stderr.write(formatAndroidInstrumentationFailureHint(process.env.XDG_CACHE_HOME));
  return true;
}

/** Test-only reset for the once-per-process hint guard. */
export function resetInstrumentationFailureHintForTests() {
  instrumentationFailureHintPrinted = false;
}

/** Explicit launch modes override the saved desktop default without modifying it. */
export function resolveServeTrayOptions(opts = {}) {
  // Operation/tray surfaces were removed in Task 9; only the gateway remains.
  return { ...opts, tray: false };
}

/** The server entry point `runServe` starts: the WebSocket-capable one when present. */
function resolveServerJs(appDir = APP_DIR) {
  const serverWsJs = join(appDir, "server-ws.mjs");
  return existsSync(serverWsJs) ? serverWsJs : join(appDir, "server.js");
}

export async function runServe(opts = {}) {
  opts = resolveServeTrayOptions(opts);
  const startedAt = performance.now();

  // Same prep as bin/omniroute.mjs — keep it here so a direct `runServe()` call
  // (tests / programmatic) still gets a writable Next.js cache dir before spawn.
  ensureAndroidCacheDir({ env: process.env });

  const { isNativeBinaryCompatible } = await import("../scripts/build/native-binary-compat.mjs");
  const { getNodeRuntimeSupport, getNodeRuntimeWarning } = await import("./nodeRuntimeSupport.mjs");

  const port = parsePort(opts.port ?? process.env.PORT ?? "20128", 20128);
  const apiPort = parsePort(process.env.API_PORT ?? String(port), port);
  const dashboardPort = parsePort(process.env.DASHBOARD_PORT ?? String(port), port);
  serveHeadless = resolveServeHeadless(opts);
  const noOpen = opts.open === false || serveHeadless;

  console.log(`
\x1b[36m   ____                  _ ____              _
   / __ \\                (_) __ \\            | |
  | |  | |_ __ ___  _ __ _| |__) |___  _   _| |_ ___
  | |  | | '_ \` _ \\| '_ \\ |  _  // _ \\| | | | __/ _ \\
  | |__| | | | | | | | | | | | \\ \\ (_) | |_| | ||  __/
   \\____/|_| |_| |_|_| |_|_|_|  \\_\\___/ \\__,_|\\__\\___|
\x1b[0m`);
  console.log(`\x1b[2m  v${_pkg.version}\x1b[0m\n`);

  const nodeSupport = getNodeRuntimeSupport();
  if (!nodeSupport.nodeCompatible) {
    const runtimeWarning = getNodeRuntimeWarning() || "Unsupported Node.js runtime detected.";
    console.warn(`\x1b[33m  ⚠  Warning: You are running Node.js ${process.versions.node}.
     ${runtimeWarning}

     Supported secure runtimes: ${nodeSupport.supportedDisplay}
     Recommended: use Node.js ${nodeSupport.recommendedVersion} or newer on the 22.x LTS line.
     Workaround:  npm rebuild better-sqlite3\x1b[0m
`);
  }

  // GHSA-wmgv-ph3p-rv57: the default posture (all interfaces + no API key) is a
  // deliberate local-first choice, but it must be loud at startup — an operator
  // on an untrusted network learns the two escape hatches here, not after a
  // surprise quota bill.
  const exposureWarning = resolveExposureWarning();
  if (exposureWarning) {
    console.warn(`\x1b[33m  ⚠  ${exposureWarning}\x1b[0m\n`);
  }

  const serverJs = resolveServerJs();

  if (!existsSync(serverJs)) {
    console.error("\x1b[31m✖ Server not found at:\x1b[0m", serverJs);
    console.error("  The package may not have been built correctly.");
    console.error("");
    const nodeExec = process.execPath || "";
    const isMise = nodeExec.includes("mise") || nodeExec.includes(".local/share/mise");
    const isNvm = nodeExec.includes(".nvm") || nodeExec.includes("nvm");
    if (isMise) {
      console.error(
        "  \x1b[33m⚠ mise detected:\x1b[0m If you installed via `npm install -g omniroute`,"
      );
      console.error("    try: \x1b[36mnpx omniroute@latest\x1b[0m  (downloads a fresh copy)");
      console.error("    or:  \x1b[36mmise exec -- npx omniroute\x1b[0m");
    } else if (isNvm) {
      console.error(
        "  \x1b[33m⚠ nvm detected:\x1b[0m Try reinstalling after loading the correct Node version:"
      );
      console.error("    \x1b[36mnvm use --lts && npm install -g omniroute\x1b[0m");
    } else {
      console.error("  Try: \x1b[36mnpm install -g omniroute\x1b[0m  (reinstall)");
      console.error("  Or:  \x1b[36mnpx omniroute@latest\x1b[0m");
    }
    process.exit(1);
  }

  const sqliteBinary = join(
    APP_DIR,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );
  if (
    !process.versions.bun &&
    existsSync(sqliteBinary) &&
    !isNativeBinaryCompatible(sqliteBinary)
  ) {
    console.error(
      "\x1b[31m✖ better-sqlite3 native module is incompatible with this platform.\x1b[0m"
    );
    console.error(`  Run: cd ${APP_DIR} && npm rebuild better-sqlite3`);
    if (platform() === "darwin") {
      console.error("  If build tools are missing: xcode-select --install");
    }
    process.exit(1);
  }

  // Refuse to start a second instance on a port something else already owns,
  // BEFORE any pid file is written or any child is spawned. Otherwise the
  // doomed child's EADDRINUSE arrives only after this process has rewritten
  // the pid files of the healthy instance that actually owns the port.
  const serverHost = resolveServerHost();
  const busyPids = await resolveServeBusyPids(dashboardPort, { host: serverHost });
  if (busyPids.length > 0) {
    reportPortInUse(dashboardPort, busyPids);
    process.exit(1);
  }

  console.log(`  \x1b[2m⏳ Starting server...\x1b[0m\n`);

  // #5172/#5160/#5152: default the V8 heap to ~35% of physical RAM (clamped
  // [512, 4096]) instead of a fixed 512MB, which OOM-crashed boxes with plenty
  // of RAM under load. An explicit OMNIROUTE_MEMORY_MB still wins.
  const memoryLimit = resolveMaxOldSpaceMb(
    process.env.OMNIROUTE_MEMORY_MB,
    calibrateHeapFallbackMb(totalmem())
  );

  // #5242: opt-in native HTTPS. CLI flags take precedence over env; the child
  // server (server-ws.mjs) reads these and terminates TLS on the same listener.
  const tlsCert = opts.tlsCert ?? process.env.OMNIROUTE_TLS_CERT;
  const tlsKey = opts.tlsKey ?? process.env.OMNIROUTE_TLS_KEY;

  const env = applyHeadlessServeEnv(
    {
      ...process.env,
      OMNIROUTE_PORT: String(port),
      PORT: String(dashboardPort),
      DASHBOARD_PORT: String(dashboardPort),
      API_PORT: String(apiPort),
      // #10492: HOSTNAME is standard shell state on Unix-like systems, not an
      // OmniRoute bind setting. The resolver only keeps its legacy meaning on
      // Windows; OMNIROUTE_SERVER_HOST is the cross-platform explicit setting.
      HOSTNAME: serverHost,
      NODE_ENV: "production",
      // #5238: preserve a user-set NODE_OPTIONS (incl. their own
      // `--max-old-space-size=…`) instead of clobbering it with the calibrated
      // default — mirror the Electron/standalone launchers.
      NODE_OPTIONS: buildServerNodeOptions(process.env, memoryLimit),
      ...(tlsCert ? { OMNIROUTE_TLS_CERT: tlsCert } : {}),
      ...(tlsKey ? { OMNIROUTE_TLS_KEY: tlsKey } : {}),
    },
    opts
  );

  // Validate the TLS pair up front so the operator sees a clear warning in the
  // CLI (the child re-validates authoritatively). Drives the banner scheme;
  // when null we fall through to identical plain-HTTP behavior as before.
  urlScheme = resolveTlsOptions(env) ? "https" : "http";

  // Commander stores `--no-recovery` as `recovery === false`, never as `noRecovery`.
  if (opts.recovery === false || opts.noRecovery === true) {
    return runWithoutRecovery(
      serverJs,
      env,
      memoryLimit,
      dashboardPort,
      apiPort,
      noOpen,
      startedAt
    );
  }

  return runWithSupervisor(
    serverJs,
    env,
    memoryLimit,
    dashboardPort,
    apiPort,
    noOpen,
    opts.log === true,
    opts.maxRestarts ?? 2,
    startedAt,
    { readyTimeoutMs: resolveReadyTimeoutMs({ timeoutMs: opts.readyTimeout }) }
  );
}

/**
 * Listeners blocking `serve` on `port`. Discovery returning null means the
 * tool is missing (#14518); the bind probe then decides. A free port is an
 * empty list — leaving null throws on the caller's `.length` (#14800).
 *
 * @param {number} port
 * @param {object} [deps]
 * @param {typeof findListeningPids} [deps.findListeningPids]
 * @param {typeof probePortFree} [deps.probePortFree]
 * @returns {Promise<Array<number|null>>}
 */
export async function resolveServeBusyPids(port, deps = {}) {
  const discover = deps.findListeningPids ?? findListeningPids;
  const probe = deps.probePortFree ?? probePortFree;
  // findListeningPids() returning null means the discovery tool itself is
  // missing or unusable (Termux, slim containers, #14518) — fall back to a
  // bind probe so the guard still answers before spawning the doomed child.
  let busyPids = await discover(port, { host: deps.host });
  if (busyPids === null) {
    // Discovery tool missing/unusable (#14518): the bind probe is the guard.
    if (!(await probe(port, { host: deps.host }))) busyPids = [null];
    else busyPids = [];
  } else if (busyPids.length === 0) {
    // Discovery ran and saw nothing, but that window can race a starting
    // instance; a bind probe costs nothing and doubles as confirmation.
    if (!(await probe(port, { host: deps.host }))) busyPids = [null];
  }
  return busyPids;
}

/**
 * Explain a port conflict in terms the operator can act on: who owns the port,
 * and the two ways out. Exported for unit tests.
 */
export function reportPortInUse(port, pids = []) {
  const known = pids.filter((pid) => Number.isFinite(pid) && pid > 0);
  const owner =
    known.length === 0
      ? "an unknown process"
      : known.length === 1
        ? `PID ${known[0]}`
        : `PIDs ${known.join(", ")}`;
  console.error(`\n\x1b[31m✖ Port ${port} is already in use by ${owner}.\x1b[0m`);
  console.error(
    `  Another OmniRoute is most likely already serving there, so open` +
      ` ${urlScheme}://localhost:${port} before starting a second one.`
  );
  console.error(`  To run alongside: \x1b[36momniroute serve --port <other-port>\x1b[0m\n`);
}

function runWithoutRecovery(serverJs, env, memoryLimit, dashboardPort, apiPort, noOpen, startedAt) {
  // #5238: skip the explicit CLI --max-old-space-size when the user pinned the
  // heap via NODE_OPTIONS (a CLI arg would shadow/override their value).
  const server = spawn(
    process.execPath,
    [
      ...(process.versions.bun
        ? ["--preload", BUN_PRELOAD_PATH]
        : buildNodeHeapArgs(process.env, memoryLimit)),
      serverJs,
    ],
    {
      cwd: APP_DIR,
      env,
      stdio: "pipe",
    }
  );

  writePidFile("server", server.pid);

  let started = false;

  server.stdout.on("data", (data) => {
    const text = data.toString();
    process.stdout.write(text);
    maybeReportInstrumentationHookFailure(text);
    if (
      !started &&
      (text.includes("Ready") || text.includes("started") || text.includes("listening"))
    ) {
      started = true;
      onReady(dashboardPort, apiPort, noOpen, startedAt);
    }
  });

  server.stderr.on("data", (data) => {
    const text = data.toString();
    process.stderr.write(text);
    maybeReportInstrumentationHookFailure(text);
  });

  server.on("error", (err) => {
    console.error("\x1b[31m✖ Failed to start server:\x1b[0m", err.message);
    process.exit(1);
  });

  server.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\x1b[31m✖ Server exited with code ${code}\x1b[0m`);
    }
    process.exit(code ?? 0);
  });

  const shutdown = () => {
    console.log("\n\x1b[33m⏹ Shutting down OmniRoute...\x1b[0m");
    cleanupPidFile("server");
    server.kill("SIGTERM");
    setTimeout(() => {
      server.kill("SIGKILL");
      process.exit(0);
    }, 5000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  setTimeout(() => {
    if (!started) {
      started = true;
      onReady(dashboardPort, apiPort, noOpen, startedAt);
    }
  }, 15000);
}

async function runWithSupervisor(
  serverJs,
  env,
  memoryLimit,
  dashboardPort,
  apiPort,
  noOpen,
  showLog,
  maxRestarts,
  startedAt,
  { readyTimeoutMs = resolveReadyTimeoutMs() } = {}
) {
  if (showLog) process.env.OMNIROUTE_SHOW_LOG = "1";
  writePidFile("supervisor", process.pid);

  const supervisor = new ServerSupervisor({
    serverPath: serverJs,
    env,
    memoryLimit,
    maxRestarts,
  });

  supervisor.start();

  process.on("SIGINT", () => {
    cleanupPidFile("supervisor");
    supervisor.stop();
  });
  process.on("SIGTERM", () => {
    cleanupPidFile("supervisor");
    supervisor.stop();
  });

  if (!showLog) {
    let lastProbeOutcome = null;
    waitForServer(dashboardPort, readyTimeoutMs, {
      onOutcome: (outcome) => {
        lastProbeOutcome = outcome;
      },
    }).then(async (up) => {
      if (up) {
        onReady(dashboardPort, apiPort, noOpen, startedAt);
      } else {
        reportReadinessTimeout(dashboardPort, supervisor, lastProbeOutcome);
      }
    });
  }
}

// #6321: waitForServer resolving `false` used to fall through silently — the CLI
// printed the banner + "⏳ Starting server..." and then produced ZERO further
// output forever, even though the child process may well have crashed or be
// stuck (issue reports show the server sometimes actually comes up later, or is
// reachable directly while the CLI still looks hung). Surface a clear diagnostic
// plus whatever stdout/stderr the child buffered instead of going silent.
export function reportReadinessTimeout(dashboardPort, supervisor, lastProbeOutcome = null) {
  const readyTimeoutMs = resolveReadyTimeoutMs();
  const seconds = Math.round(readyTimeoutMs / 1000);
  console.error(
    `\n\x1b[33m⚠ Server did not respond within ${seconds}s.\x1b[0m It may still be starting, or may` +
      ` have failed silently.`
  );
  // The last probe classification separates a real boot failure (nothing ever
  // bound the port, so the buffered output below is the reason) from a server
  // that IS listening and merely did not answer the health route in time:
  // very likely usable already, with only the readiness signal timed out.
  if (lastProbeOutcome === "hanging" || lastProbeOutcome === "fast-reject") {
    console.error(
      `  Port ${dashboardPort} IS accepting connections, so the server is probably up and` +
        ` still warming up. Check the dashboard before restarting it.`
    );
  } else if (lastProbeOutcome === "not-listening") {
    console.error(
      `  Nothing is listening on port ${dashboardPort}, so the server never bound it and the` +
        ` output below is the reason.`
    );
  }
  console.error(
    `  Tip:  set OMNIROUTE_READY_TIMEOUT_MS=${readyTimeoutMs * 2} or --ready-timeout ${readyTimeoutMs * 2} for slower cold starts.`
  );
  console.error(`  Try:  curl -I http://localhost:${dashboardPort}/api/monitoring/health`);
  console.error(`  Or:   rerun with \x1b[36m--log\x1b[0m to see live server output.\n`);

  const recentLog = supervisor?.getRecentLog?.() ?? [];
  if (recentLog.length) {
    console.error("--- Recent server output ---");
    recentLog.forEach((l) => console.error(l));
    console.error("--- End recent output ---\n");
    // If the buffered log already shows the Android instrumentation failure,
    // print the actionable hint even when --log was off (default).
    maybeReportInstrumentationHookFailure(recentLog.join("\n"));
  }
}

async function onReady(dashboardPort, apiPort, noOpen, startedAt) {
  const dashboardUrl = `${urlScheme}://localhost:${dashboardPort}`;
  const apiUrl = `${urlScheme}://localhost:${apiPort}`;
  const elapsed =
    typeof startedAt === "number" && Number.isFinite(startedAt)
      ? ((performance.now() - startedAt) / 1000).toFixed(1)
      : "0.0";

  console.log(`
  \x1b[32m✔ OmniRoute is running!\x1b[0m \x1b[2m(started in ${elapsed}s)\x1b[0m

  \x1b[1m  Dashboard:\x1b[0m  ${serveHeadless ? "disabled (headless)" : dashboardUrl}
  \x1b[1m  API Base:\x1b[0m   ${apiUrl}/v1

  \x1b[2m  Point your CLI tool (Cursor, Cline, Codex) to:\x1b[0m
  \x1b[33m  ${apiUrl}/v1\x1b[0m

  \x1b[2m  Press Ctrl+C to stop\x1b[0m
  `);

  if (!noOpen && !isTermux()) {
    try {
      const open = await import("open");
      await open.default(dashboardUrl);
    } catch {
      // open is optional — skip if unavailable
    }
  }
}
