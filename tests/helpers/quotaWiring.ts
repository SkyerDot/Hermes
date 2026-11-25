import type { A2ATask } from "../../src/lib/a2a/taskManager.ts";

// Test helper that exercises the A2A quotaManagement skill directly
// without MCP server (which has been removed).
export async function exerciseQuotaWiring(quotaStatus = 200) {
  const envKeys = ["OMNIROUTE_BASE_URL", "OMNIROUTE_API_KEY"];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  process.env.OMNIROUTE_BASE_URL = "http://localhost:20128";
  process.env.OMNIROUTE_API_KEY = "quality-fixture-key";

  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const fixtureFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== "http://localhost:20128") throw new Error("unexpected external request");
    requests.push(url.pathname + url.search);
    let body: unknown;
    let status = 200;
    switch (url.pathname) {
      case "/api/usage/quota":
        status = quotaStatus;
        body = {
          providers: [
            {
              provider: "quota-fixture",
              name: "Quota Fixture",
              connectionId: "fixture-connection",
              quotaUsed: 20,
              quotaTotal: 100,
              percentRemaining: 80,
              tokenStatus: "valid",
              resetAt: "2026-10-11T00:00:00Z",
            },
          ],
        };
        break;
      case "/api/combos":
        body = { combos: [] };
        break;
      default:
        throw new Error(`unexpected management request: ${url.pathname}`);
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  globalThis.fetch = fixtureFetch;
  let resetDb: (() => void) | undefined;
  try {
    const { executeQuotaManagement } = await import("../../src/lib/a2a/skills/quotaManagement.ts");
    const { resetDbInstance } = await import("../../src/lib/db/core.ts");
    resetDb = resetDbInstance;
    globalThis.fetch = fixtureFetch;

    const now = "2026-10-10T00:00:00Z";
    const task: A2ATask = {
      id: "quota-wiring",
      skill: "quota-management",
      state: "working",
      input: { skill: "quota-management", messages: [{ role: "user", content: "quota summary" }] },
      artifacts: [],
      events: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
      expiresAt: now,
    };
    const a2a = await executeQuotaManagement(task);
    return { a2a, requests };
  } finally {
    try {
      resetDb?.();
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
}
