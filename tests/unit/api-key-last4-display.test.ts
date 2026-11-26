import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatApiKeyLast4, maskStoredApiKey } from "@/shared/utils/apiKeyMask";
import { formatApiKeyLast4 as formatApiKeyLast4ReExport } from "@/lib/apiKeyExposure";

describe("API Key Last 4 Masking and Display (#19982)", () => {
  describe("formatApiKeyLast4", () => {
    it("returns null for non-string, empty, or whitespace values", () => {
      assert.equal(formatApiKeyLast4(null), null);
      assert.equal(formatApiKeyLast4(undefined), null);
      assert.equal(formatApiKeyLast4(12345), null);
      assert.equal(formatApiKeyLast4(""), null);
      assert.equal(formatApiKeyLast4("   "), null);
    });

    it("formats standard OpenAI-style keys preserving prefix and last 4 chars", () => {
      const plainKey = "sk-proj-abc1234567890defghijklmn-a82f";
      const masked = formatApiKeyLast4(plainKey);
      assert.equal(masked, "sk-••••••••a82f");
      assert.ok(!masked?.includes("abc1234567890defghijklmn"));
    });

    it("formats service keys with custom prefixes", () => {
      assert.equal(formatApiKeyLast4("nr_1234567890abcdefa82f"), "nr_••••••••a82f");
      assert.equal(formatApiKeyLast4("mx_sec1234567890abcdef9b1c"), "mx_••••••••9b1c");
      assert.equal(formatApiKeyLast4("da_adm1234567890abcdef7788"), "da_••••••••7788");
      assert.equal(formatApiKeyLast4("gsk_key1234567890abcdef3322"), "gsk_••••••••3322");
    });

    it("formats bare keys without prefix by displaying bullets followed by last 4 chars", () => {
      const bareKey = "AIzaSyD1234567890abcdef1234";
      assert.equal(formatApiKeyLast4(bareKey), "••••••••1234");
    });

    it("keeps short keys wholly masked instead of showing them as their last 4", () => {
      assert.equal(formatApiKeyLast4("sk-1"), "••••••••");
      assert.equal(formatApiKeyLast4("abcd"), "••••••••");
      assert.equal(formatApiKeyLast4("abcdefg"), "••••••••");
      // The dashboard receives the stored mask: a head shorter than 8 is the whole key.
      assert.equal(formatApiKeyLast4(maskStoredApiKey("abcd")), "••••••••");
      assert.equal(formatApiKeyLast4(maskStoredApiKey("abcdefg")), "••••••••");
      assert.equal(formatApiKeyLast4("abcdefgh"), "••••••••efgh");
    });

    it("formats already stored masked keys consistently", () => {
      const stored = maskStoredApiKey("sk-proj-1234567890abcdefa82f");
      assert.ok(stored);
      assert.equal(formatApiKeyLast4(stored), "sk-••••••••a82f");
    });

    it("is re-exported from apiKeyExposure", () => {
      assert.equal(typeof formatApiKeyLast4ReExport, "function");
      assert.equal(formatApiKeyLast4ReExport("sk-test12345678a82f"), "sk-••••••••a82f");
    });
  });
});
