import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-provider-exhaustion-"));
process.env.DATA_DIR = dataDir;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const fallback = await import("../../open-sse/services/accountFallback.ts");
const { getProviderCredentials } = await import("../../src/sse/services/auth.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const future = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();

async function seed(provider: string, name: string, cooling: boolean, key?: string) {
  const created = await providersDb.createProviderConnection({
    provider,
    authType: "apikey",
    name,
    apiKey: key ?? `sk-synthetic-${name}`,
    isActive: true,
    testStatus: "active",
    rateLimitedUntil: cooling ? future() : null,
  });
  assert.ok(created?.id);
  return created.id as string;
}

test("a provider with every account cooling reports allRateLimited on every request", async () => {
  await seed("openai", "a1", true);
  await seed("openai", "a2", true);

  const first = (await getProviderCredentials("openai")) as Record<string, unknown>;
  const repeat = (await getProviderCredentials("openai")) as Record<string, unknown>;
  assert.equal(first.allRateLimited, true);
  assert.equal(repeat.allRateLimited, true);
  assert.equal(typeof first.retryAfter, "string");
});

test("one cooling provider does not change another provider's result", async () => {
  await seed("groq", "g1", true);
  const other = (await getProviderCredentials("groq")) as Record<string, unknown>;
  assert.equal(other.allRateLimited, true);
  assert.equal((await getProviderCredentials("openai")).allRateLimited, true);
});

test("the provider still serves requests while one account is usable", async () => {
  await seed("anthropic", "b1", true);
  await seed("anthropic", "b2", false);
  const picked = (await getProviderCredentials("anthropic")) as Record<string, unknown>;
  assert.equal(picked.allRateLimited, undefined);
});

test("a key policy that narrows the pool to cooling accounts reports allRateLimited", async () => {
  const cooling = await seed("deepseek", "c1", true);
  await seed("deepseek", "c2", false);
  const narrowed = (await getProviderCredentials("deepseek", null, [cooling])) as Record<
    string,
    unknown
  >;
  assert.equal(narrowed.allRateLimited, true);
});

test("the tool-capability filter can narrow the pool to cooling accounts", async () => {
  await seed("qoder", "q-http", true, "http-synthetic-q");
  await seed("qoder", "q-pat", false, "pt-synthetic-q");
  const result = (await getProviderCredentials("qoder", null, null, null, {
    requireToolCalling: true,
  })) as Record<string, unknown>;
  assert.equal(result.allRateLimited, true);
});

test("the retry hint follows the earliest retryable cooldown, including a model lock", async () => {
  const id = await seed("mistral", "m1", true);
  fallback.recordModelLockoutFailure("mistral", id, "mistral-large", "rate_limited", 429, 0, null, {
    exactCooldownMs: 5 * 60 * 1000,
    exactCooldownIsUpstreamReset: true,
  });
  const result = (await getProviderCredentials("mistral", null, null, "mistral-large")) as Record<
    string,
    unknown
  >;
  assert.equal(result.allRateLimited, true);
  const remainingMs = Date.parse(String(result.retryAfter)) - Date.now();
  assert.ok(
    remainingMs > 3 * 60 * 1000 && remainingMs < 10 * 60 * 1000,
    `retryAfter ${result.retryAfter} must follow the 5 min retryable model lock`
  );
});
