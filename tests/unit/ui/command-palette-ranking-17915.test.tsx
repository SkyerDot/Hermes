// @vitest-environment jsdom
// #17915: the palette kept sidebar order for every match, so a broad query put unrelated
// substring hits before the closer prefix match. Results are now ranked: exact label, then
// label prefix or a word prefix, then a label substring, then matches in the subtitle or
// section names. The kit Command still decides which rows show; ranking only orders them.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_OMNIROUTE_E2E_MODE = "1";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/dashboard",
}));

// Real English copy, as in the global mock, with a few strings a test can localize. They are
// pinned here instead of read from a locale file, so a translation wave cannot change the case.
const sidebarOverrides = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock("next-intl", async () => {
  const { createTranslator } = await import("use-intl/core");
  const { default: en } = await import("../../../src/i18n/messages/en.json");
  const translators = new Map<string, ReturnType<typeof createTranslator>>();
  return {
    useTranslations: (namespace?: string) => {
      // One translator per message set: the palette keeps `t` in its dependency arrays.
      const cacheKey = `${namespace}:${JSON.stringify(sidebarOverrides.current)}`;
      let t = translators.get(cacheKey);
      if (!t) {
        t = createTranslator({
          locale: "en",
          messages: { ...en, sidebar: { ...en.sidebar, ...sidebarOverrides.current } },
          namespace,
          onError: () => {},
          getMessageFallback: ({ key }) => key,
        });
        translators.set(cacheKey, t);
      }
      return t;
    },
    useLocale: () => "en",
  };
});

const { default: CommandPalette } = await import("@/shared/components/CommandPalette");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } }))
  );
});

afterEach(() => {
  cleanup();
  push.mockClear();
  sidebarOverrides.current = {};
  vi.unstubAllGlobals();
});

async function openPalette(): Promise<HTMLElement> {
  render(<CommandPalette isOpen onClose={vi.fn()} />);
  return screen.findByRole("combobox");
}

async function optionsFor(input: HTMLElement, query: string): Promise<HTMLElement[]> {
  fireEvent.change(input, { target: { value: query } });
  return screen.findAllByRole("option");
}

function labelOf(option: HTMLElement): string {
  return option.querySelector(".ci-command__label")?.textContent?.trim() ?? "";
}

describe("CommandPalette ranking (#17915)", () => {
  it(
    "puts the closest label match first for a broad query and the exact match first for a specific one",
    { timeout: 20_000 },
    async () => {
      const input = await openPalette();

      const expectations: Array<[string, string]> = [
        ["log", "Log export"],
        ["log export", "Log export"],
        ["changelog", "Changelog"],
        ["cache", "Cache"],
      ];
      for (const [query, first] of expectations) {
        const options = await optionsFor(input, query);
        expect(labelOf(options[0]), `first result for "${query}"`).toBe(first);
        // Weaker matches stay available, they just come later.
        if (query === "log") {
          const labels = options.map(labelOf);
          expect(labels).toContain("Changelog");
          expect(labels.indexOf("Log export")).toBeLessThan(labels.indexOf("Changelog"));
        }
      }
    }
  );

  it(
    "selects the first displayed row, and the arrows and Enter walk the displayed order",
    { timeout: 20_000 },
    async () => {
      const input = await openPalette();
      const options = await optionsFor(input, "log");
      const labels = options.map(labelOf);
      expect(labels.slice(0, 2)).toEqual(["Log export", "Changelog"]);

      // The exact query still selects the prefix match, ahead of the substring hit.
      const exact = await optionsFor(input, "log export");
      expect(labelOf(exact[0])).toBe("Log export");

      const again = await optionsFor(input, "log");
      expect(again[0].getAttribute("aria-selected")).toBe("true");
      expect(input.getAttribute("aria-activedescendant")).toBe(again[0].id);

      fireEvent.keyDown(input, { key: "ArrowDown" });
      expect(input.getAttribute("aria-activedescendant")).toBe(again[1].id);
      fireEvent.keyDown(input, { key: "Enter" });
      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenLastCalledWith("/dashboard/changelog");
    }
  );

  it("ranks a label typed without its accents above a subtitle match", async () => {
    sidebarOverrides.current = {
      modelCatalog: "Catálogo de modelos",
      settingsCacheSubtitle: "Catálogo de modelos e cache de respostas",
    };
    const input = await openPalette();
    const labels = (await optionsFor(input, "catalogo")).map(labelOf);
    expect(labels).toEqual(["Catálogo de modelos", "Cache"]);
  });

  it("returns to the sidebar order when the query is cleared", async () => {
    const input = await openPalette();
    const sidebarOrder = (await screen.findAllByRole("option")).map(labelOf);
    await optionsFor(input, "log");
    const cleared = (await optionsFor(input, "")).map(labelOf);
    expect(cleared).toEqual(sidebarOrder);
  });
});
