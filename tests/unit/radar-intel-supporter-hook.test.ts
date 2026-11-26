import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
process.env.RADAR_FEED_PUBKEY = publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64");

const intelSync = await import("../../src/lib/radar/intelSync.ts");

const bytes = await readFile(new URL("../fixtures/radar-intel-canonical.json", import.meta.url));
const signature = crypto.sign(null, bytes, privateKey).toString("base64");

function response(): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      "x-omniroute-feed-signature": signature,
      "x-omniroute-feed-tier": "live",
    }),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as Response;
}

test("Radar Intel sync succeeds without a supporter recognizer", async () => {
  const written: intelSync.RadarIntelCacheEntry[] = [];
  const result = await intelSync.syncRadarIntel({
    getFlag: () => true,
    getSettings: () => ({ optIn: true, supporterKey: `omr_${"a".repeat(40)}` }),
    getCache: () => null,
    setCache: (entry) => written.push(entry),
    fetch: (async () => response()) as typeof fetch,
  });

  assert.deepEqual(result, { status: "updated", version: "2026.08.09.1" });
  assert.equal(written.length, 1);
  assert.match(written[0].supporterIdentity, /^radar:[a-f0-9]{64}$/);
});

test("Radar Intel still calls an injected supporter recognizer once", async () => {
  const identities: string[] = [];
  const result = await intelSync.syncRadarIntel({
    getFlag: () => true,
    getSettings: () => ({ optIn: true, supporterKey: `omr_${"a".repeat(40)}` }),
    getCache: () => null,
    setCache: () => undefined,
    recognizeSupporter: async (identity) => identities.push(identity),
    fetch: (async () => response()) as typeof fetch,
  });

  assert.equal(result.status, "updated");
  assert.equal(identities.length, 1);
  assert.match(identities[0], /^radar:[a-f0-9]{64}$/);
});
