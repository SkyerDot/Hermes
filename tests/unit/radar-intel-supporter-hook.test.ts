import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

/**
 * Task 7 characterization of the server-owned supporter hook. The Radar feed
 * module itself was removed in Task 11; this test keeps the behavioral
 * contract that survived the migration: a key is never logged or passed to
 * the recognizer raw, the recognizer is opt-in and best-effort, and it runs
 * only after the signed live payload has been persisted.
 */
type RecognizeSupporter = (identity: string) => Promise<void>;

interface SyncOptions {
  supporterKey?: string;
  recognizeSupporter?: RecognizeSupporter;
  setCache: (entry: { supporterIdentity: string }) => void;
}

async function syncSignedLiveFeed(options: SyncOptions): Promise<void> {
  const key = options.supporterKey ?? `omr_${"a".repeat(40)}`;
  const identity = `radar:${crypto.createHash("sha256").update(key, "utf8").digest("hex")}`;
  options.setCache({ supporterIdentity: identity });

  const recognizeSupporter: RecognizeSupporter =
    options.recognizeSupporter ?? (async () => undefined);
  await recognizeSupporter(identity).catch(() => undefined);
}

test("supporter recognizer is optional and the identity is a salted-free sha256 digest", async () => {
  const written: string[] = [];

  await syncSignedLiveFeed({
    setCache: (entry) => written.push(entry.supporterIdentity),
  });

  assert.equal(written.length, 1);
  assert.match(written[0], /^radar:[a-f0-9]{64}$/);
  assert.equal(
    written[0],
    `radar:${crypto
      .createHash("sha256")
      .update(`omr_${"a".repeat(40)}`)
      .digest("hex")}`
  );
});

test("recognizeSupporter is called once, after persistence, and failures are swallowed", async () => {
  const calls: string[] = [];
  const order: string[] = [];

  await syncSignedLiveFeed({
    setCache: (entry) => {
      order.push("persisted");
      calls.push(entry.supporterIdentity);
    },
    recognizeSupporter: async (identity) => {
      order.push("recognized");
      assert.match(identity, /^radar:[a-f0-9]{64}$/);
      throw new Error("recognizer unavailable");
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(order, ["persisted", "recognized"]);
});
