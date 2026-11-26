import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function readSource(relativePath: string) {
  return readFileSync(new URL("../../" + relativePath, import.meta.url), "utf8");
}

test("the pruned analytics tab shell stays gone (combo health lives under combos)", () => {
  assert.equal(
    existsSync(new URL("../../src/app/(dashboard)/dashboard/analytics/page.tsx", import.meta.url)),
    false
  );
});

test("settings root redirects to section pages instead of rendering a tab shell", () => {
  const pageSource = readSource("src/app/(dashboard)/dashboard/settings/page.tsx");

  assert.ok(pageSource.includes('import { redirect } from "next/navigation"'));
  assert.ok(pageSource.includes('general: "/dashboard/settings/general"'));
  assert.ok(pageSource.includes('resilience: "/dashboard/settings/resilience"'));
  assert.ok(pageSource.includes("redirect(resolveSettingsRoute(tab))"));
});

test("provider limit status chips use localized current availability labels", () => {
  const source = readSource(
    "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.tsx"
  );

  const stats = readSource(
    "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/HealthStats.tsx"
  );
  const display = readSource(
    "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/availabilityDisplay.ts"
  );
  assert.ok(source.includes("<HealthStats"));
  assert.ok(stats.includes("all(DISPLAY_LABELS[kind])"));
  for (const key of ["healthAvailable", "healthCd5", "healthCdw", "healthAction"])
    assert.ok(display.includes(`usage.${key}`));
  assert.ok(display.includes('paused: "common.paused"'));
  assert.doesNotMatch(source, /Crítico|Alerta|Saudável/);
});

test("provider limits collapsed rows show quota resets and progress bars inline", () => {
  const source = readSource(
    "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.tsx"
  );

  assert.ok(source.includes("const renderInlineQuotaSummary = (quotas: any[]) =>"));
  assert.ok(source.includes("const cd = formatCountdown(q.resetAt, clockNow)"));
  assert.ok(source.includes("`⏱ ${cd}`"));
  assert.ok(source.includes("h-1 w-14 rounded-sm"));
  assert.ok(source.includes("getQuotaBarWidthClass(pct)"));
  assert.ok(source.includes("getQuotaToneClasses(pct)"));
  assert.ok(source.includes("renderInlineQuotaSummary(quota.quotas)"));
});
