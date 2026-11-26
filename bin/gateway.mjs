/**
 * Public gateway surface retained by the inference-scope build.
 *
 * Task 9 removed every CLI operation, remote, sync, tunnel, backup and launcher
 * surface. This module is the single supported entry point for starting the
 * local HTTP gateway, including the headless form (`serve --headless`), which
 * propagates `OMNIROUTE_HEADLESS=1` to the server child process.
 */
import { resolveServeHeadless as resolveServeHeadlessFlag } from "./gateway-serve.mjs";

/** `--headless` always propagates as `OMNIROUTE_HEADLESS=1`; input env is immutable. */
export function applyHeadlessServeEnv(env, opts = {}) {
  if (opts.headless !== true) return env;
  return { ...env, OMNIROUTE_HEADLESS: "1" };
}

/** True for `--headless` or any truthy `OMNIROUTE_HEADLESS` value. */
export function resolveServeHeadless(opts = {}, env = process.env) {
  return resolveServeHeadlessFlag(opts, env);
}

export {
  resolveServeBusyPids,
  reportPortInUse,
  reportReadinessTimeout,
  runServe,
} from "./gateway-serve.mjs";
