// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeProviderTopologySection } from "@/app/(dashboard)/dashboard/HomeProviderTopologySection";

// Mock next/dynamic to return a simple component
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="provider-topology" />,
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      home: {
        providerTopology: "Provider Topology",
        activeError: "Active: {active}, Errors: {errors}",
        topologyLegendActive: "Active",
        topologyLegendRecent: "Recent",
        topologyLegendError: "Error",
      },
    };
    return (key: string, values?: Record<string, number>) => {
      let str = translations[namespace]?.[key] ?? key;
      if (values) {
        Object.entries(values).forEach(([k, v]) => {
          str = str.replace(`{${k}}`, String(v));
        });
      }
      return str;
    };
  },
}));

// Mock shared components
vi.mock("@/shared/components", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
}));

// Mock topologyUtils
vi.mock("@/app/(dashboard)/dashboard/home/topologyUtils", () => ({
  selectActiveRequests: () => [],
}));

describe("home topology hidden networking (#4596)", () => {
  const websocketMock = vi.fn();
  let root: ReturnType<typeof createRoot> | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    websocketMock.mockClear();
    // WebSocket should never be created since live WS feature was removed
    vi.stubGlobal(
      "WebSocket",
      class WebSocketMock {
        static OPEN = 1;
        readyState = 0;
        onopen: (() => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;

        constructor(url: string) {
          websocketMock(url);
        }

        send() {}
        close() {}
      }
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  it("renders the topology section without opening a WebSocket", () => {
    act(() => {
      root!.render(
        <HomeProviderTopologySection
          providers={[{ id: "1", provider: "openai", name: "OpenAI" }]}
          lastProvider="openai"
          errorProvider=""
        />
      );
    });

    // The component renders without opening any WebSocket
    expect(websocketMock).not.toHaveBeenCalled();

    // Verify the component content
    expect(container?.querySelector("[data-testid=card]")).not.toBeNull();
    expect(container?.querySelector("[data-testid=provider-topology]")).not.toBeNull();
  });
});
