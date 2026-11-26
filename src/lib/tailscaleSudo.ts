/**
 * Local sudo/password primitives retained for the Tailscale tunnel. They used
 * to live under src/mitm/*; Tailscale is the only remaining consumer, so the
 * security-sensitive behavior lives here with no stale MITM module.
 *
 * GHSA-cqwr-7mqw-chr9: the operator's sudo password must never reach the stdin
 * of the elevated command. argv stays split (Hard Rule #13); no runtime value
 * is interpolated into a shell.
 */
import { execFileSync, spawn } from "node:child_process";
import os from "node:os";

let cachedSudoPassword: string | null = null;

export function getCachedPassword(): string | null {
  return cachedSudoPassword;
}

export function setCachedPassword(password: string | null | undefined): void {
  cachedSudoPassword = password || null;
}

export function clearCachedPassword(): void {
  cachedSudoPassword = null;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isRoot(): boolean {
  try {
    return !!(process.getuid && process.getuid() === 0);
  } catch {
    return false;
  }
}

/** Probe whether sudo is discoverable on PATH. Returns false on Windows. */
export function isSudoAvailable(): boolean {
  if (os.platform() === "win32") return false;
  try {
    execFileSync("sh", ["-c", "command -v sudo"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Truthy check for OMNIROUTE_NO_SUDO: 1|true|yes|on, case-insensitive, trimmed. */
export function isNoSudoEnv(): boolean {
  const value = process.env.OMNIROUTE_NO_SUDO;
  return typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim());
}

export interface ResolvedSpawn {
  finalCommand: string;
  finalArgs: string[];
  stripSudo: boolean;
  needsPassword: boolean;
}

type SudoOverrides = { root?: boolean; sudoAvailable?: boolean; noSudo?: boolean };

/** Pure resolver so tests can assert argv without spawning a real sudo. */
export function resolveSudoSpawn(
  command: string,
  args: string[],
  overrides: SudoOverrides = {}
): ResolvedSpawn {
  const root = overrides.root ?? isRoot();
  const sudoAvailable = overrides.sudoAvailable ?? isSudoAvailable();
  const noSudo = overrides.noSudo ?? isNoSudoEnv();
  const stripSudo = command === "sudo" && (root || !sudoAvailable || noSudo);
  const needsPassword = !stripSudo && command === "sudo";
  let finalCommand = command;
  let finalArgs = args;

  if (stripSudo) {
    const realCmdIndex = args.findIndex((arg) => !arg.startsWith("-"));
    if (realCmdIndex !== -1) {
      finalCommand = args[realCmdIndex];
      finalArgs = args.slice(realCmdIndex + 1);
    }
  }

  return { finalCommand, finalArgs, stripSudo, needsPassword };
}

/** One process to spawn: argv plus exactly what is written to its stdin. */
export interface SudoStep {
  command: string;
  args: string[];
  stdin: string;
}

type SpawnLike = typeof spawn;

/**
 * The password goes only to `sudo -S -v` (validate, runs no command); the
 * elevated command runs as `sudo -n <cmd>` with only its own data on stdin.
 * When sudo is stripped (root / no sudo / OMNIROUTE_NO_SUDO) there is one plain
 * step. The fallback covers hosts with `timestamp_timeout=0`, where sudo is
 * certain to prompt and consumes the password line itself.
 */
export function planSudoSteps(
  command: string,
  args: string[],
  password: string,
  stdinAfterPassword = "",
  overrides: SudoOverrides = {}
): { steps: SudoStep[]; fallback: SudoStep | null } {
  const { finalCommand, finalArgs, needsPassword } = resolveSudoSpawn(command, args, overrides);
  if (!needsPassword) {
    return {
      steps: [{ command: finalCommand, args: finalArgs, stdin: stdinAfterPassword || "" }],
      fallback: null,
    };
  }
  let firstReal = 0;
  while (firstReal < args.length && args[firstReal] === "-S") firstReal++;
  const commandArgs = args.slice(firstReal);
  return {
    steps: [
      { command: "sudo", args: ["-S", "-p", "", "-v"], stdin: `${password}\n` },
      { command: "sudo", args: ["-n", ...commandArgs], stdin: stdinAfterPassword || "" },
    ],
    fallback: {
      command: "sudo",
      args: ["-S", ...commandArgs],
      stdin: `${password}\n${stdinAfterPassword}`,
    },
  };
}

function runStep(
  step: SudoStep,
  spawnImpl: SpawnLike
): Promise<{ code: number | null; stdout: string; stderr: string; error: Error | null }> {
  return new Promise((resolve) => {
    const child = spawnImpl(step.command, step.args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (code: number | null, error: Error | null) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr, error });
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: Error) => settle(null, error));
    child.on("close", (code: number | null) => settle(code, null));
    if (step.stdin) child.stdin?.write(step.stdin);
    child.stdin?.end();
  });
}

const SUDO_PASSWORD_REQUIRED = /a password is required/i;
type StepResult = Awaited<ReturnType<typeof runStep>>;

function stepOutputOrThrow(result: StepResult): string {
  if (result.error) {
    throw new Error(`Command failed: ${getErrorMessage(result.error)}\n${result.stderr}`);
  }
  if (result.code !== 0) {
    throw new Error(`Command failed with code ${result.code}\n${result.stderr}`);
  }
  return result.stdout;
}

export async function execFileWithPassword(
  command: string,
  args: string[],
  password: string,
  stdinAfterPassword = "",
  deps: {
    spawnImpl?: SpawnLike;
    sudoOverrides?: SudoOverrides;
  } = {}
): Promise<string> {
  const spawnImpl = deps.spawnImpl ?? spawn;
  const { steps, fallback } = planSudoSteps(
    command,
    args,
    password,
    stdinAfterPassword,
    deps.sudoOverrides
  );
  let stdout = "";
  for (let i = 0; i < steps.length; i++) {
    const result = await runStep(steps[i], spawnImpl);
    const canFallBack = i === steps.length - 1 && fallback !== null;
    if (
      canFallBack &&
      !result.error &&
      result.code !== 0 &&
      SUDO_PASSWORD_REQUIRED.test(result.stderr)
    ) {
      return stepOutputOrThrow(await runStep(fallback, spawnImpl));
    }
    stdout = stepOutputOrThrow(result);
  }
  return stdout;
}
