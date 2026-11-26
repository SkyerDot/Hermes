/**
 * Guard for the preserved internal Codex Responses-WS bridge: it must keep importing
 * helpers that actually exist inside its own boundary (the public `/v1/ws` surface was
 * pruned and its old helper modules are gone), and those scoped helpers must preserve
 * the auth/origin semantics the bridge relies on.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-codex-ws-helpers-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "codex-ws-helpers-api-key-secret";
process.env.JWT_SECRET = "codex-ws-helpers-jwt-secret-0123456789abcdef";
process.env.OMNIROUTE_PEER_STAMP_TOKEN = "codex-ws-helpers-peer-token";

const ENV_KEYS = [
  "REQUIRE_API_KEY",
  "CORS_ALLOW_ALL",
  "CORS_ALLOWED_ORIGINS",
  "CORS_ORIGIN",
  "OMNIROUTE_PUBLIC_BASE_URL",
  "OMNIROUTE_TRUST_PROXY",
] as const;

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BOUNDARY = path.join(ROOT, "src/app/api/internal/codex-responses-ws");

const coreDb = await import("../../src/lib/db/core.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const sessionToken = await import("../../src/shared/utils/dashboardSessionToken.ts");

const LOOPBACK_STAMP = `${process.env.OMNIROUTE_PEER_STAMP_TOKEN}|127.0.0.1`;

const authModule = () => import("../../src/app/api/internal/codex-responses-ws/auth.ts");
const originModule = () => import("../../src/app/api/internal/codex-responses-ws/origin.ts");

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

test.beforeEach(() => {
  apiKeysDb.resetApiKeyState();
  coreDb.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  setEnv({});
});

test.after(() => {
  setEnv({});
  apiKeysDb.resetApiKeyState();
  coreDb.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

function readInternalImports(file: string): string[] {
  const source = fs.readFileSync(path.join(BOUNDARY, file), "utf8");
  return [...source.matchAll(/\bfrom\s+["'](@\/[^"']+)["']/g)].map((match) => match[1]);
}

function resolvesInsideWorktree(specifier: string): boolean {
  const base = path.join(ROOT, "src", specifier.slice(2));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts")].some(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  );
}

test("every @/ import in the preserved Codex-WS boundary exists in this worktree", () => {
  const missing: string[] = [];
  for (const file of ["route.ts", "history.ts", "auth.ts", "origin.ts"]) {
    for (const specifier of readInternalImports(file)) {
      if (!resolvesInsideWorktree(specifier)) missing.push(`${file}: ${specifier}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("token extraction keeps Bearer and all three query keys, and fails closed otherwise", async () => {
  const { extractWsTokenFromRequest, extractWsTokenFromUrl } = await authModule();
  for (const key of ["api_key", "token", "access_token"]) {
    const request = new Request(`http://omniroute.local/v1/responses?${key}=%20sk-query%20`);
    assert.equal(extractWsTokenFromRequest(request), "sk-query");
    assert.equal(extractWsTokenFromUrl(request.url), "sk-query");
  }
  const bearer = new Request("http://omniroute.local/v1/responses", {
    headers: { authorization: "Bearer sk-bearer" },
  });
  assert.equal(extractWsTokenFromRequest(bearer), "sk-bearer");
  assert.equal(
    extractWsTokenFromRequest(new Request("http://omniroute.local/?api_key=%20%20")),
    null
  );
});

test("wsAuth off without requireAuth stays open; a valid API key authenticates as api_key", async () => {
  const { authorizeWebSocketHandshake } = await authModule();
  const plain = await authorizeWebSocketHandshake(new Request("http://omniroute.local/"));
  assert.deepEqual(plain, {
    wsAuth: false,
    authorized: true,
    authenticated: false,
    authType: "none",
    hasCredential: false,
  });

  const key = await apiKeysDb.createApiKey("codex ws helper key", "machine-codex-ws-helper");
  const request = new Request("http://omniroute.local/", {
    headers: { authorization: `Bearer ${key.key}` },
  });
  const result = await authorizeWebSocketHandshake(request);
  assert.equal(result.authorized, true);
  assert.equal(result.authenticated, true);
  assert.equal(result.authType, "api_key");
  assert.equal(result.hasCredential, true);
  assert.equal(result.wsAuth, false);
});

test("persisted wsAuth=true refuses an unauthenticated handshake", async () => {
  const { authorizeWebSocketHandshake } = await authModule();
  await settingsDb.updateSettings({ wsAuth: true });
  const result = await authorizeWebSocketHandshake(new Request("http://omniroute.local/"));
  assert.equal(result.wsAuth, true);
  assert.equal(result.authorized, false);
  assert.deepEqual(
    {
      authenticated: result.authenticated,
      authType: result.authType,
      hasCredential: result.hasCredential,
    },
    { authenticated: false, authType: "none", hasCredential: false }
  );
});

test("requireAuth honours REQUIRE_API_KEY: missing/invalid keys fail, valid key or session passes", async () => {
  const { authorizeWebSocketHandshake } = await authModule();
  const missing = await authorizeWebSocketHandshake(new Request("http://omniroute.local/"), {
    requireAuth: true,
  });
  assert.deepEqual(
    {
      authorized: missing.authorized,
      authType: missing.authType,
      hasCredential: missing.hasCredential,
    },
    { authorized: false, authType: "none", hasCredential: false }
  );

  const invalid = await authorizeWebSocketHandshake(
    new Request("http://omniroute.local/?api_key=sk-not-a-real-key"),
    { requireAuth: true }
  );
  assert.deepEqual(
    {
      authorized: invalid.authorized,
      authType: invalid.authType,
      hasCredential: invalid.hasCredential,
    },
    { authorized: false, authType: "none", hasCredential: true }
  );

  const key = await apiKeysDb.createApiKey("codex ws require key", "machine-codex-ws-require");
  const valid = await authorizeWebSocketHandshake(
    new Request("http://omniroute.local/", { headers: { authorization: `Bearer ${key.key}` } }),
    { requireAuth: true }
  );
  assert.deepEqual(
    { authorized: valid.authorized, authenticated: valid.authenticated, authType: valid.authType },
    { authorized: true, authenticated: true, authType: "api_key" }
  );

  const secret = sessionToken.getDashboardJwtSecret();
  assert.ok(secret, "JWT secret must be configured for this test");
  const token = await sessionToken.mintDashboardSessionToken(secret);
  const session = await authorizeWebSocketHandshake(
    new Request("http://omniroute.local/", {
      headers: { cookie: `${sessionToken.DASHBOARD_SESSION_COOKIE}=${token}` },
    }),
    { requireAuth: true }
  );
  assert.deepEqual(
    {
      authorized: session.authorized,
      authenticated: session.authenticated,
      authType: session.authType,
      hasCredential: session.hasCredential,
    },
    { authorized: true, authenticated: true, authType: "session", hasCredential: false }
  );
});

test("origin check admits no Origin, same-origin loopback and CORS allowlist; refuses foreign origins", async () => {
  const { buildHandshakeOriginRequest, isWebSocketOriginAllowed } = await originModule();
  const handshake = { host: "127.0.0.1:20128", "x-omniroute-peer-ip": LOOPBACK_STAMP };

  assert.equal(isWebSocketOriginAllowed(buildHandshakeOriginRequest(handshake, null)), true);
  assert.equal(
    isWebSocketOriginAllowed(buildHandshakeOriginRequest(handshake, "http://127.0.0.1:20128")),
    true
  );
  assert.equal(
    isWebSocketOriginAllowed(buildHandshakeOriginRequest(handshake, "https://evil.example")),
    false
  );
  assert.equal(isWebSocketOriginAllowed(buildHandshakeOriginRequest(handshake, "null")), false);

  setEnv({ CORS_ALLOWED_ORIGINS: "https://app.example" });
  assert.equal(
    isWebSocketOriginAllowed(buildHandshakeOriginRequest(handshake, "https://app.example")),
    true
  );
});

test("handshake request reconstruction ignores the request-url candidate and untrusted fields", async () => {
  const { buildHandshakeOriginRequest, isWebSocketOriginAllowed } = await originModule();
  const request = buildHandshakeOriginRequest(
    {
      host: "omniroute.invalid",
      "x-forwarded-proto": "https",
      "x-omniroute-peer-ip": LOOPBACK_STAMP,
      origin: "https://smuggled.example",
      extra: "ignored",
      "x-forwarded-host": 42,
    },
    "https://smuggled.example"
  );

  assert.equal(request.headers.get("host"), "omniroute.invalid");
  assert.equal(request.headers.get("x-forwarded-proto"), "https");
  assert.equal(request.headers.get("x-omniroute-peer-ip"), LOOPBACK_STAMP);
  assert.equal(request.headers.get("origin"), "https://smuggled.example");
  assert.equal(request.headers.get("extra"), null);
  assert.equal(request.headers.get("x-forwarded-host"), null);
  assert.equal(new URL(request.url).hostname, "omniroute.invalid");
  // The URL is a placeholder: a matching request-url candidate must not grant access.
  assert.equal(isWebSocketOriginAllowed(request), false);
});
