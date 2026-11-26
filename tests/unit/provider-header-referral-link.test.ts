/**
 * tests/unit/provider-header-referral-link.test.ts
 *
 * Regression guard for the provider-name link rendered by ProviderPageHeader.
 * Task 11 removed the Radar referral source, so `resolveProviderHeaderLink`
 * now always returns the static catalog `website` with `isReferralLink=false`.
 * The optional second argument is accepted only for call-site compatibility.
 *
 * Preserved assertions:
 *  (a) no referral / no static website => byte-identical catalog behaviour,
 *  (b) an empty (falsy) referral has no effect,
 *  (c) providerPageUtils.ts imports NO @/lib/radar or @/lib/db/* symbol —
 *      source inspection prevents reintroducing a DB-touching import into a
 *      module a "use client" component depends on.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveProviderHeaderLink } from "../../src/app/(dashboard)/dashboard/providers/providerPageUtils.ts";

test("resolveProviderHeaderLink: no referral => keeps the static website, isReferralLink=false", () => {
  const result = resolveProviderHeaderLink("https://groq.com", null);
  assert.deepEqual(result, { website: "https://groq.com", isReferralLink: false });
});

test("resolveProviderHeaderLink: no referral, no static website => website undefined (today's no-link case)", () => {
  const result = resolveProviderHeaderLink(undefined, null);
  assert.deepEqual(result, { website: undefined, isReferralLink: false });
});

test("resolveProviderHeaderLink: a legacy referral argument is ignored", () => {
  const result = resolveProviderHeaderLink("https://groq.com", "https://groq.com/?ref=omniroute");
  assert.deepEqual(result, { website: "https://groq.com", isReferralLink: false });
});

// ---------------------------------------------------------------------------
// Loose coupling — providerPageUtils.ts must not depend on the Radar/DB
// modules to compute this (requirement (c) — see file docblock above).
// ---------------------------------------------------------------------------

test("providerPageUtils.ts does not import @/lib/radar or @/lib/db/* (loose coupling — D28)", () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/(dashboard)/dashboard/providers/providerPageUtils.ts"),
    "utf-8"
  );
  const importLines = src.split("\n").filter((line) => /^\s*import\b/.test(line));
  assert.ok(
    !importLines.some((line) => line.includes("@/lib/radar")),
    "providerPageUtils.ts must not import @/lib/radar"
  );
  assert.ok(
    !importLines.some((line) => line.includes("@/lib/db/")),
    "providerPageUtils.ts must not import @/lib/db/*"
  );
});
