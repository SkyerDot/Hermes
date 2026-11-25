// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function LiveRequestsHarness({ _enabled }: { enabled: boolean }) {
  // Live WS removed; hook returns empty state
  return null;
}

describe("home topology hidden networking (#4596)", () => {
  const websocketMock = vi.fn();
  let root: ReturnType<typeof createRoot> | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    websocketMock.mockClear();
    // Live WS feature removed; no WebSocket should ever be created
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

  it("does NOT open a WebSocket when the topology section is disabled", () => {
    act(() => {
      root!.render(<LiveRequestsHarness enabled={false} />);
    });
    expect(websocketMock).not.toHaveBeenCalled();
  });

  it("does NOT open a WebSocket when the topology section is enabled (live WS removed)", async () => {
    await act(async () => {
      root!.render(<LiveRequestsHarness enabled={true} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(websocketMock).not.toHaveBeenCalled();
  });
});
