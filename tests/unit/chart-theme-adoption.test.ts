import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The usage charts are the kit StackedBarChart and StackedAreaChart: the kit applies its own
// theme, and no chart in this retained surface may hand-roll recharts containers.
test("the usage charts are the kit StackedBarChart and StackedAreaChart, with no recharts of their own", () => {
  const source = readFileSync("src/shared/components/analytics/rechartsUsageCharts.tsx", "utf8");
  assert.match(source, /<StackedBarChart\b/);
  assert.match(source, /lineSeries=/);
  assert.match(source, /<StackedAreaChart\b/);
  assert.doesNotMatch(source, /\bComposedChart\b|\bAreaChart\b|ResponsiveContainer|useRecharts/);
  assert.doesNotMatch(source, /chartTheme/, "the kit chart applies its own theme");
});
