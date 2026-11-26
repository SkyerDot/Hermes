import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "./dataDir.mjs";

const BUILTIN_DEFAULT_SALT = "omniroute-cli-auth-v1";
const SALT_FILE_NAME = "cli-token-salt.json";
const PERSISTED_SALT_RE = /^[0-9a-f]{64}$/;
export const CLI_TOKEN_HEADER = "x-omniroute-cli-token";

let _cached = null;
let _cachedSalt = null;
let _cachedActiveSalt = null;

function isTestContext() {
  return (
    process.env.NODE_ENV === "test" ||
    !!process.env.VITEST ||
    !!process.env.NODE_TEST_CONTEXT ||
    process.execArgv.includes("--test") ||
    process.argv.includes("--test")
  );
}

function saltFilePath(dataDir) {
  return path.join(dataDir, SALT_FILE_NAME);
}

function readPersistedSalt(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const salt = parsed && typeof parsed === "object" ? parsed.salt : undefined;
    if (typeof salt === "string" && PERSISTED_SALT_RE.test(salt)) return salt;
  } catch {
    // Missing, unreadable, or corrupt — fall through to (re)generation.
  }
  return null;
}

function establishPersistedSalt(dataDir) {
  const filePath = saltFilePath(dataDir);
  const existing = readPersistedSalt(filePath);
  if (existing) return existing;

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ salt: generated }), { flag: "wx", mode: 0o600 });
    return generated;
  } catch (err) {
    if (err && err.code === "EEXIST") return readPersistedSalt(filePath);
    return null;
  }
}

function getActiveSalt() {
  const envSalt = process.env.OMNIROUTE_CLI_SALT;
  if (envSalt) return envSalt;

  if (_cachedActiveSalt) return _cachedActiveSalt;

  const hasExplicitDataDir = !!(process.env.DATA_DIR && process.env.DATA_DIR.trim());
  if (!hasExplicitDataDir && isTestContext()) {
    _cachedActiveSalt = BUILTIN_DEFAULT_SALT;
    return _cachedActiveSalt;
  }

  const dataDir = resolveDataDir();
  const persisted = establishPersistedSalt(dataDir);
  if (!persisted) {
    console.warn(
      "[CLI_TOKEN] Could not persist a private CLI salt in DATA_DIR; using the compatibility fallback. Fix DATA_DIR permissions or set OMNIROUTE_CLI_SALT."
    );
  }
  _cachedActiveSalt = persisted || BUILTIN_DEFAULT_SALT;
  return _cachedActiveSalt;
}

export function deriveCliToken(machineIdModule, salt) {
  try {
    const machineIdSync = machineIdModule?.machineIdSync || machineIdModule?.default?.machineIdSync;
    if (typeof machineIdSync !== "function") return "";
    const rawId = machineIdSync(true);
    if (!rawId) return "";
    return crypto.createHmac("sha256", rawId).update(salt).digest("hex");
  } catch {
    return "";
  }
}

export async function getCliToken() {
  const salt = getActiveSalt();
  if (_cached !== null && _cachedSalt === salt) return _cached;
  try {
    const imported = await import("node-machine-id");
    const token = deriveCliToken(imported, salt);
    if (!token) {
      console.debug("[CLI_TOKEN] machine-id resolution failed, CLI auth disabled");
    }
    _cached = token;
  } catch (e) {
    console.debug("[CLI_TOKEN] machine-id resolution failed, CLI auth disabled:", e);
    _cached = "";
  }
  _cachedSalt = salt;
  return _cached;
}
