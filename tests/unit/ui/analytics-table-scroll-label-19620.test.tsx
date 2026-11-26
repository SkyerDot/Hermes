// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Kit 0.0.114 (keak-ai/cheaper-inference-ui-kit#192, #19620 axe `scrollable-region-focusable` on
// /dashboard/analytics at 390 px): an overflowing kit Table container joins the tab order, and it
// becomes a named `region` only when it has a name (`scrollLabel`, a caption, or the table's
// aria-label). `scrollbarLabel` names the persistent scrollbar, not the container, so without
// `scrollLabel` the analytics tables would be focusable but unnamed.

const translate = (key: string) => key;
translate.has = () => true;

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => translate,
}));

// The kit charts that draw with recharts stay out of this test (they load through next/dynamic).
vi.mock("@omniroute/ui-kit/reporting-charts", () => ({
  StackedBarChart: () => <div data-testid="chart-loading" />,
  StackedAreaChart: () => <div data-testid="chart-loading" />,
  Sparkline: () => <div data-testid="chart-loading" />,
}));

const { ApiKeyTable, ProviderTable } = await import("@/shared/components/analytics/charts");
const { ModelTable } = await import("@/shared/components/analytics/ModelTable");
const { default: RequestCountTable } =
  await import("@/shared/components/analytics/RequestCountTable");

const row = { requests: 3, promptTokens: 100, completionTokens: 50, totalTokens: 150, cost: 1 };

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout: make every box report a table wider than its container (phone width).
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(358);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(ui: React.ReactElement) {
  act(() => root.render(ui));
  const scroller = container.querySelector<HTMLElement>("[data-slot='table-container']");
  expect(scroller).not.toBeNull();
  return scroller!;
}

function expectNamedScrollRegion(scroller: HTMLElement, name: string) {
  expect(scroller.dataset.overflowing).toBe("true");
  expect(scroller.tabIndex).toBe(0);
  expect(scroller.getAttribute("role")).toBe("region");
  expect(scroller.getAttribute("aria-label")).toBe(name);
}

describe("analytics tables name their overflowing scroll container", () => {
  it("model breakdown", () => {
    const scroller = render(
      <ModelTable byModel={[{ model: "m", ...row }]} summary={{ totalTokens: 150 }} />
    );
    expectNamedScrollRegion(scroller, "chartModelBreakdown");
  });

  it("API key breakdown", () => {
    const scroller = render(
      <ApiKeyTable byApiKey={[{ apiKeyId: "k", apiKeyName: "Key", ...row }]} />
    );
    expectNamedScrollRegion(scroller, "chartApiKeyBreakdown");
  });

  it("provider breakdown", () => {
    const scroller = render(<ProviderTable byProvider={[{ provider: "openai", ...row }]} />);
    expectNamedScrollRegion(scroller, "chartProviderBreakdown");
  });

  it("requests by provider and date", () => {
    const scroller = render(
      <RequestCountTable
        rows={[{ date: "2026-11-13", provider: "openai", ...row }]}
        sortBy="date"
        sortOrder="desc"
        onToggleSort={() => {}}
        tableLabel="Requests by provider and date"
        dateLabel="Date"
        providerLabel="Provider"
        requestsLabel="Requests"
        totalLabel="Total"
      />
    );
    expectNamedScrollRegion(scroller, "Requests by provider and date");
  });

  it("falls back to the requests column label when no table label is given", () => {
    const scroller = render(
      <RequestCountTable
        rows={[{ date: "2026-11-13", provider: "openai", ...row }]}
        sortBy="date"
        sortOrder="desc"
        onToggleSort={() => {}}
        dateLabel="Date"
        providerLabel="Provider"
        requestsLabel="Requests"
        totalLabel="Total"
      />
    );
    expectNamedScrollRegion(scroller, "Requests");
  });
});
