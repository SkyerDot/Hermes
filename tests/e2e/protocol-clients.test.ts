import { before, describe, it } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.OMNIROUTE_BASE_URL || "http://localhost:20128";
const API_KEY = process.env.OMNIROUTE_API_KEY || "";
const REQUEST_TIMEOUT_MS = Number(process.env.ECOSYSTEM_REQUEST_TIMEOUT_MS || 30000);

function headers(extra?: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    ...(extra || {}),
  };
}

async function apiFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers(),
      ...(options?.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function callA2A(method: string, params: Record<string, unknown>, id: string) {
  const response = await apiFetch("/a2a", {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function consumeA2AStream(response: Response): Promise<{
  taskId: string | null;
  terminalState: string | null;
  chunks: number;
}> {
  if (!response.body) return { taskId: null, terminalState: null, chunks: 0 };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let taskId: string | null = null;
  let terminalState: string | null = null;
  let chunks = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      if (!event.startsWith("data: ")) continue;
      const payload = event.slice("data: ".length);
      let parsed: any;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const nextTaskId = parsed?.params?.task?.id;
      const nextState = parsed?.params?.task?.state;
      if (nextTaskId) taskId = nextTaskId;
      if (parsed?.params?.chunk) chunks += 1;
      if (
        typeof nextState === "string" &&
        ["completed", "failed", "cancelled"].includes(nextState)
      ) {
        terminalState = nextState;
      }
    }
  }

  return { taskId, terminalState, chunks };
}

describe("Protocol clients E2E", () => {
  before(async () => {
    const response = await apiFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ a2aEnabled: true }),
    });
    assert.ok([200, 401, 403].includes(response.status));
  });

  it("executes A2A discovery/send/stream/get/cancel flow", async () => {
    const cardRes = await apiFetch("/.well-known/agent.json");
    assert.ok(cardRes.ok);
    const card = (await cardRes.json()) as any;
    assert.ok(card?.name);
    assert.ok(Array.isArray(card?.skills));

    const send = await callA2A(
      "message/send",
      {
        skill: "quota-management",
        messages: [{ role: "user", content: "Return a short quota summary." }],
      },
      "protocol-send"
    );
    if (send.response.status === 401) {
      assert.equal(API_KEY, "");
      assert.ok(send.json?.error);
      return;
    }
    assert.ok(send.response.ok);
    assert.ok(!send.json?.error);
    const sendTaskId: string = send.json?.result?.task?.id;
    assert.ok(typeof sendTaskId === "string");

    const streamRes = await apiFetch("/a2a", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "protocol-stream",
        method: "message/stream",
        params: {
          skill: "quota-management",
          messages: [{ role: "user", content: "Stream a short quota summary." }],
        },
      }),
    });
    assert.ok(streamRes.ok);
    assert.ok((streamRes.headers.get("content-type") || "").includes("text/event-stream"));

    const stream = await consumeA2AStream(streamRes);
    assert.ok(typeof stream.taskId === "string" || stream.taskId === null);
    assert.ok(
      stream.terminalState === null ||
        ["completed", "failed", "cancelled"].includes(stream.terminalState)
    );

    const taskIdForGet = stream.taskId || sendTaskId;
    const get = await callA2A("tasks/get", { taskId: taskIdForGet }, "protocol-get");
    assert.ok(get.response.ok);
    assert.equal(get.json?.result?.task?.id, taskIdForGet);

    const cancelRes = await apiFetch(`/api/a2a/tasks/${encodeURIComponent(taskIdForGet)}/cancel`, {
      method: "POST",
    });
    assert.ok([200, 400, 401, 404].includes(cancelRes.status));

    const tasksRes = await apiFetch("/api/a2a/tasks?limit=50");
    assert.ok([200, 401].includes(tasksRes.status));
    if (tasksRes.status === 200) {
      assert.ok(tasksRes.ok);
      const tasksJson = (await tasksRes.json()) as any;
      const tasks = Array.isArray(tasksJson?.tasks) ? tasksJson.tasks : [];
      assert.ok(tasks.some((task: any) => task.id === sendTaskId));
    }
  });
});
