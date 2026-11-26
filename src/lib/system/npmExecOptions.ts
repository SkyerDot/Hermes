/**
 * Safe `execFile` options for npm invocations that (on Windows) run under a shell.
 *
 * Hard Rule #13: never string-interpolate runtime values into shell commands. All
 * npm calls through this helper use an explicit args array; the install prefix is
 * exported as `npm_config_prefix` instead of appearing in argv, and any caller
 * supplying a version must validate it with {@link SERVICE_VERSION_PATTERN}.
 */

export interface NpmExecOptions {
  cwd?: string;
  timeout: number;
  env: NodeJS.ProcessEnv;
  maxBuffer: number;
  shell?: boolean;
  windowsHide: boolean;
}

/**
 * Accepts npm dist-tags and semver (including pre-release/build suffixes). The
 * charset excludes shell metacharacters so a validated value can safely be used
 * in an argv entry under the Windows shell.
 */
export const SERVICE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * Builds `execFile` options for npm. On Windows npm is `npm.cmd`, which Node 24
 * refuses to exec without a shell (nodejs/node#52554, issue #5379); enable the
 * shell on win32 only. With the shell enabled the shell splits the command line,
 * so no runtime value may be interpolated into argv (Hard Rule #13).
 */
export function buildNpmExecOptions(
  platform: NodeJS.Platform,
  options: { cwd?: string; timeoutMs: number; prefix?: string }
): NpmExecOptions {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.prefix) {
    env.npm_config_prefix = options.prefix;
  }
  const execOptions: NpmExecOptions = {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    env,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  };
  if (platform === "win32") {
    execOptions.shell = true;
  }
  return execOptions;
}
