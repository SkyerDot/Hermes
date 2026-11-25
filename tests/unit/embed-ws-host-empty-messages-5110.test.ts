import test from "node:test";
import assert from "node:assert/strict";

import { createChatPipelineHarness } from "../integration/_chatPipelineHarness.ts";

// Regression tests for #5110 — Issue 4:
// A request with `messages: []` (empty array) was forwarded upstream,
// which Anthropic rejects with a raw "[400]: messages: at least one
// message is required". OmniRoute now rejects it early with a clear
// OmniRoute-level 400 before any upstream call.

const harness = await createChatPipelineHarness("chat-empty-messages-5110");
const { handleChat, buildRequest, resetStorage, seedConnection } = harness;

test.beforeEach(async () => {
  await resetStorage();
});

test.after(async () => {
  await harness.cleanup();
});

test("#5110-4: an empty messages array is rejected with a clear 400 before hitting upstream", async () => {
  await seedConnection("anthropic", { apiKey: "sk-ant" });

  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  const response = await handleChat(
    buildRequest({
      url: "http://localhost/v1/messages",
      body: {
        model: "anthropic/claude-haiku-4-5",
        max_tokens: 100,
        system: "You are helpful.",
        messages: [],
      },
    })
  );

  assert.equal(
    response.status,
    400,
    "empty messages must be a 400, not a forwarded upstream error"
  );
  const body = (await response.json()) as { error?: { message?: string } };
  assert.match(
    body.error?.message ?? "",
    /at least one message is required/i,
    "error should clearly state messages must be non-empty"
  );
  assert.equal(upstreamCalled, false, "must not forward an empty-messages request upstream");
});

test("#5110-4: a non-empty messages array still routes normally (guard is not over-broad)", async () => {
  await seedConnection("openai", { apiKey: "sk-openai" });

  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return Response.json({
      id: "x",
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
    });
  };

  const response = await handleChat(
    buildRequest({
      body: {
        model: "openai/gpt-4.1",
        stream: false,
        messages: [{ role: "user", content: "Hello" }],
      },
    })
  );

  assert.notEqual(response.status, 400, "a valid request must not be caught by the empty guard");
  assert.equal(upstreamCalled, true, "a valid request must still reach upstream");
});
