import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocket } from "ws";

const { createNextUpgradeRelay } = await import("../../scripts/dev/next-upgrade-relay.mjs");
const { createResponsesWsProxy } = await import("../../scripts/dev/responses-ws-proxy.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

type NextApp = ReturnType<typeof next> & {
  init?: unknown;
  getRequestHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
};

/**
 * A real NextCustomServer (its own setupWebSocketHandler decides where the listener goes) with
 * prepare() replaced by a stand-in init, since unit tests have no `next build` output. The
 * stand-in upgrade handler does what router-server.js does for a matched app route (/v1/* is
 * rewritten to the /api/v1 routes): resolve the route asynchronously, then `socket.end()`.
 */
function createNextStandIn(httpServer?: unknown) {
  const app = next({ dev: false, dir: root, ...(httpServer ? { httpServer } : {}) } as never);
  const upgrades: string[] = [];
  let standInUpgradeHandler: ((req: http.IncomingMessage, socket: Duplex) => Promise<void>) | null =
    null;
  (app as NextApp).init = {
    requestHandler: async (_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.end("ok");
    },
    upgradeHandler: async (req: http.IncomingMessage, socket: Duplex) => {
      upgrades.push(req.url ?? "");
      await new Promise((r) => setTimeout(r, 5));
      // router-server.js ends matched app routes; the stand-in ends everything else too (it has
      // no HMR server to hand /_next/hmr to), which keeps the half-open socket from lingering.
      socket.end();
    },
  };
  // Expose the stand-in upgrade handler for tests
  (app as NextApp).getStandInUpgradeHandler = () => standInUpgradeHandler;
  return { app: app as NextApp, upgrades };
}

async function startServer(withRelay: boolean, withResponsesProxy: boolean) {
  const relay = withRelay ? createNextUpgradeRelay() : null;
  const { app, upgrades } = createNextStandIn(relay?.target);
  const requestHandler = app.getRequestHandler();
  const standInUpgradeHandler =
    (
      app as NextApp & {
        getStandInUpgradeHandler?: () =>
          ((req: http.IncomingMessage, socket: Duplex) => Promise<void>) | null;
      }
    ).getStandInUpgradeHandler?.() ?? null;
  const responsesWsProxy = withResponsesProxy
    ? createResponsesWsProxy({
        baseUrl: "http://127.0.0.1:20128",
        bridgeSecret: "test-secret",
      })
    : null;
  const server = http.createServer((req, res) => void requestHandler(req, res));
  // Same dispatch order as scripts/dev/run-next.mjs.
  server.on("upgrade", async (req, socket, head) => {
    if (relay?.forward(req, socket, head)) return;
    if (responsesWsProxy) {
      const handled = await responsesWsProxy.handleUpgrade(req, socket, head);
      if (handled) return;
    }
    if (standInUpgradeHandler) {
      await standInUpgradeHandler(req, socket);
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  // Any HTTP request makes Next attach its upgrade listener (dashboard load, health check, …).
  const res = await fetch(`http://127.0.0.1:${port}/api/monitoring/health`);
  assert.equal(await res.text(), "ok");
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  };
  return { server, port, upgrades, stop, responsesWsProxy };
}

type Held = { opened: boolean; code: number; closedBy: "client" | "server" };

/** Opens a WebSocket, holds it `holdMs`, then closes with 1000; reports who ended it. */
function holdSession(port: number, wsPath: string, holdMs = 300): Promise<Held> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
    let opened = false;
    let clientClosed = false;
    ws.on("open", () => {
      opened = true;
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        clientClosed = true;
        ws.close(1000);
      }, holdMs);
    });
    ws.on("close", (code) =>
      resolve({ opened, code, closedBy: clientClosed ? "client" : "server" })
    );
    ws.on("error", () => {}); // "socket hang up" when ended before the 101; close follows
  });
}

test("control: Next's auto-attached upgrade listener ends unclaimed upgrade sockets", async () => {
  const { server, port, upgrades, stop } = await startServer(false, true);
  try {
    assert.equal(server.listenerCount("upgrade"), 2, "next() attached a second upgrade listener");
    for (const wsPath of ["/v1/responses"]) {
      const r = await holdSession(port, wsPath);
      assert.equal(r.closedBy, "server", `${wsPath} was cut before the client closed it`);
      assert.equal(r.code, 1006, `${wsPath}: abnormal closure, no close frame`);
    }
    assert.deepEqual(upgrades, ["/v1/responses"], "Next saw the claimed upgrades");
  } finally {
    await stop();
  }
});

test("with the relay and responsesWsProxy, /v1/responses is claimed by the proxy (handleUpgrade returns true)", async () => {
  const { _server, _port, upgrades, stop, responsesWsProxy } = await startServer(true, true);
  try {
    assert.ok(responsesWsProxy, "responsesWsProxy should be created");
    // Create a mock upgrade request for /v1/responses
    const mockReq = {
      url: "/v1/responses",
      headers: {
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as http.IncomingMessage;
    const mockSocket = {
      writable: true,
      destroyed: false,
      write: () => true,
      end: () => {},
      destroy: () => {},
      on: () => {},
    } as unknown as Duplex;
    const mockHead = Buffer.alloc(0);

    const handled = await responsesWsProxy!.handleUpgrade(mockReq, mockSocket, mockHead);
    assert.equal(handled, true, "responsesWsProxy should claim /v1/responses upgrades");
    assert.deepEqual(upgrades, [], "Next should not see the upgrade when proxy claims it");
  } finally {
    await stop();
  }
});

test("/v1/ws is NOT claimed by responsesWsProxy (goes to Next via relay)", async () => {
  const { port, upgrades, stop } = await startServer(true, true);
  try {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`);
      ws.on("error", () => {});
      ws.on("close", () => resolve());
    });
    assert.deepEqual(upgrades, ["/v1/ws"], "Next saw the upgrade via relay");
  } finally {
    await stop();
  }
});

test("the relay still forwards upgrades nobody claimed to Next (dev HMR)", async () => {
  const { port, upgrades, stop } = await startServer(true, true);
  try {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/_next/hmr`);
      ws.on("error", () => {});
      ws.on("close", () => resolve());
    });
    assert.deepEqual(upgrades, ["/_next/hmr"]);
  } finally {
    await stop();
  }
});

test("relay.forward reports false before Next attached its listener", () => {
  const relay = createNextUpgradeRelay();
  assert.equal(relay.forward({}, {}, Buffer.alloc(0)), false);
});

test("run-next.mjs hands next() the relay, responsesWsProxy, and forwards only unclaimed upgrades through relay", () => {
  const src = fs.readFileSync(path.join(root, "scripts/dev/run-next.mjs"), "utf8");
  const createApp = src.slice(src.indexOf("function createNextApp()"));
  assert.match(
    createApp.slice(0, createApp.indexOf("\n}")),
    /httpServer: nextUpgradeRelay\.target/
  );
  const forward = src.indexOf("if (nextUpgradeRelay.forward(req, socket, head)) return;");
  assert.ok(forward > 0, "Next only gets upgrades after the relay is set up");
  // responsesWsProxy.handleUpgrade is called before the relay
  const proxyIdx = src.indexOf("responsesWsProxy.handleUpgrade");
  const relayIdx = src.indexOf("nextUpgradeRelay.forward");
  assert.ok(proxyIdx > 0 && proxyIdx < relayIdx, "responsesWsProxy runs before relay");
});

const MOVED =
  "Next's upgrade handling changed — re-check that next() still attaches its upgrade listener to options.httpServer || req.socket.server and that router-server still ends app-route upgrades";

test("Next still attaches to httpServer || req.socket.server and ends app-route upgrades", () => {
  const nextSrc = fs.readFileSync(path.join(root, "node_modules/next/dist/server/next.js"), "utf8");
  assert.match(
    nextSrc,
    /customServer = customServer \|\| \(_req == null \? void 0 : \(_req_socket = _req\.socket\) == null \? void 0 : _req_socket\.server\);/,
    MOVED
  );
  assert.match(nextSrc, /this\.setupWebSocketHandler\(this\.options\.httpServer, req\);/, MOVED);
  const routerSrc = fs.readFileSync(
    path.join(root, "node_modules/next/dist/server/lib/router-server.js"),
    "utf8"
  );
  assert.match(routerSrc, /if \(matchedOutput\) \{\s*return socket\.end\(\);\s*\}/, MOVED);
});
