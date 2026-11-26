import { describe, it, before, afterEach } from "node:test";
import assert from "node:assert/strict";

// The embedded-service supervisor is gone; the executor is configured through
// NINEROUTER_HOST / NINEROUTER_PORT (or an explicit base URL) and normal provider
// credentials. These tests pin that retained dispatch contract.

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function restoreEnv(key: string) {
  if (originalEnv[key] === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = originalEnv[key];
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("NINEROUTER_HOST");
  restoreEnv("NINEROUTER_PORT");
});

describe("NineRouterExecutor", () => {
  let NineRouterExecutor: typeof import("../../open-sse/executors/ninerouter.ts").NineRouterExecutor;
  let resolveNineRouterBaseUrl: typeof import("../../open-sse/executors/ninerouter.ts").resolveNineRouterBaseUrl;
  let NINEROUTER_FALLBACK_HINT: string;
  let NINEROUTER_FALLBACK_HINT_HEADER: string;

  before(async () => {
    process.env.NINEROUTER_HOST = "";
    process.env.NINEROUTER_PORT = "";
    const mod = await import("../../open-sse/executors/ninerouter.ts");
    NineRouterExecutor = mod.NineRouterExecutor;
    resolveNineRouterBaseUrl = mod.resolveNineRouterBaseUrl;
    NINEROUTER_FALLBACK_HINT = mod.NINEROUTER_FALLBACK_HINT;
    NINEROUTER_FALLBACK_HINT_HEADER = mod.NINEROUTER_FALLBACK_HINT_HEADER;
  });

  describe("constructor / provider", () => {
    it("exposes provider name '9router'", () => {
      const exec = new NineRouterExecutor();
      assert.equal(exec.getProvider(), "9router");
    });

    it("accepts explicit base URL", () => {
      const exec = new NineRouterExecutor("http://10.0.0.1:9999");
      const url = exec.buildUrl("model", true);
      assert.equal(url, "http://10.0.0.1:9999/v1/chat/completions");
    });
  });

  describe("buildUrl", () => {
    it("defaults to 127.0.0.1:20130", () => {
      const exec = new NineRouterExecutor();
      const url = exec.buildUrl("any-model", true);
      assert.equal(url, "http://127.0.0.1:20130/v1/chat/completions");
    });

    it("respects NINEROUTER_HOST and NINEROUTER_PORT env vars", () => {
      process.env.NINEROUTER_HOST = "10.0.0.2";
      process.env.NINEROUTER_PORT = "29999";
      assert.equal(resolveNineRouterBaseUrl(), "http://10.0.0.2:29999");
      const exec = new NineRouterExecutor();
      const url = exec.buildUrl("model", true);
      assert.equal(url, "http://10.0.0.2:29999/v1/chat/completions");
    });
  });

  describe("buildHeaders", () => {
    it("returns Content-Type only when no credentials given", () => {
      const exec = new NineRouterExecutor();
      const headers = exec.buildHeaders({});
      assert.equal(headers["Content-Type"], "application/json");
      assert.equal(headers["Authorization"], undefined);
    });

    it("adds Authorization from apiKey", () => {
      const exec = new NineRouterExecutor();
      const headers = exec.buildHeaders({ apiKey: "nr_abc123" });
      assert.equal(headers["Authorization"], "Bearer nr_abc123");
    });

    it("falls back to accessToken when no apiKey", () => {
      const exec = new NineRouterExecutor();
      const headers = exec.buildHeaders({ accessToken: "tok_xyz" });
      assert.equal(headers["Authorization"], "Bearer tok_xyz");
    });

    it("prefers apiKey over accessToken", () => {
      const exec = new NineRouterExecutor();
      const headers = exec.buildHeaders({ apiKey: "nr_key", accessToken: "tok" });
      assert.equal(headers["Authorization"], "Bearer nr_key");
    });

    it("sets Accept: text/event-stream for streaming", () => {
      const exec = new NineRouterExecutor();
      const headers = exec.buildHeaders({}, true);
      assert.equal(headers["Accept"], "text/event-stream");
    });

    it("omits Accept for non-streaming", () => {
      const exec = new NineRouterExecutor();
      const headers = exec.buildHeaders({}, false);
      assert.equal(headers["Accept"], undefined);
    });
  });

  describe("transformRequest", () => {
    it("copies model into body when different", () => {
      const exec = new NineRouterExecutor();
      const result = exec.transformRequest(
        "new-model",
        { model: "old", messages: [] },
        true,
        {}
      ) as Record<string, unknown>;
      assert.equal(result.model, "new-model");
      assert.deepEqual(result.messages, []);
    });

    it("passes body unchanged when model already matches", () => {
      const exec = new NineRouterExecutor();
      const result = exec.transformRequest(
        "same",
        { model: "same", messages: [] },
        true,
        {}
      ) as Record<string, unknown>;
      assert.equal(result.model, "same");
    });

    it("returns non-object body as-is", () => {
      const exec = new NineRouterExecutor();
      assert.equal(exec.transformRequest("m", "raw-string", true, {}), "raw-string");
    });

    it("returns null as-is", () => {
      const exec = new NineRouterExecutor();
      assert.equal(exec.transformRequest("m", null, true, {}), null);
    });
  });

  describe("Anthropic-shape detection → endpoint selection", () => {
    async function captureUrl(body: unknown) {
      let capturedUrl = "";
      globalThis.fetch = async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return new Response("{}", { status: 200 });
      };
      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      await exec.execute({ model: "m", body, stream: true, credentials: {} });
      return capturedUrl;
    }

    it("uses /v1/messages for Anthropic shape (top-level system)", async () => {
      const url = await captureUrl({
        model: "claude-opus-4-7",
        system: [{ type: "text", text: "be helpful" }],
        messages: [{ role: "user", content: "hi" }],
      });
      assert.equal(url, "http://127.0.0.1:20130/v1/messages");
    });

    it("uses /v1/messages for Anthropic shape (content array in messages)", async () => {
      const url = await captureUrl({
        model: "claude-opus-4-7",
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      });
      assert.equal(url, "http://127.0.0.1:20130/v1/messages");
    });

    it("uses /v1/messages for Anthropic shape (top-level thinking)", async () => {
      const url = await captureUrl({
        model: "claude-opus-4-7",
        thinking: { type: "enabled", budget_tokens: 5000 },
        messages: [{ role: "user", content: "hi" }],
      });
      assert.equal(url, "http://127.0.0.1:20130/v1/messages");
    });

    it("uses /v1/chat/completions for OpenAI shape (string content)", async () => {
      const url = await captureUrl({
        model: "gpt-5",
        messages: [{ role: "user", content: "hi" }],
      });
      assert.equal(url, "http://127.0.0.1:20130/v1/chat/completions");
    });
  });

  describe("execute — dispatch contract", () => {
    it("keeps the fallback-hint constants used by account fallback", () => {
      assert.equal(NINEROUTER_FALLBACK_HINT, "connection_cooldown");
      assert.equal(NINEROUTER_FALLBACK_HINT_HEADER, "X-Omni-Fallback-Hint");
    });

    it("adds the fallback hint to 503 responses from the local 9router endpoint", async () => {
      globalThis.fetch = async () => new Response("{}", { status: 503 });
      const result = await new NineRouterExecutor("http://127.0.0.1:20130").execute({
        model: "9router/vendor/model",
        body: { messages: [] },
        stream: false,
        credentials: {},
      });
      assert.equal(result.response.status, 503);
      assert.equal(
        result.response.headers.get(NINEROUTER_FALLBACK_HINT_HEADER),
        NINEROUTER_FALLBACK_HINT
      );
    });

    it("returns a sanitized 503 with the fallback hint when dispatch fails", async () => {
      globalThis.fetch = (async () => {
        throw new Error("secret stack detail");
      }) as typeof globalThis.fetch;
      const result = await new NineRouterExecutor("http://127.0.0.1:20130").execute({
        model: "9router/vendor/model",
        body: { messages: [] },
        stream: false,
        credentials: {},
      });
      assert.equal(result.response.status, 503);
      assert.equal(
        result.response.headers.get(NINEROUTER_FALLBACK_HINT_HEADER),
        NINEROUTER_FALLBACK_HINT
      );
      const text = await result.response.text();
      assert.ok(!text.includes("secret stack detail"), "raw dispatch error leaked to the caller");
    });

    it("strips 9router/ prefix from model id before sending upstream", async () => {
      let capturedBody: Record<string, unknown> = {};
      globalThis.fetch = async (_url: string | URL | Request, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return new Response("{}", { status: 200 });
      };
      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      await exec.execute({
        model: "9router/cx/gpt-5-mini",
        body: { messages: [{ role: "user", content: "hi" }] },
        stream: false,
        credentials: {},
      });
      assert.equal(capturedBody.model, "cx/gpt-5-mini");
    });

    it("model without 9router/ prefix is sent as-is", async () => {
      let capturedBody: Record<string, unknown> = {};
      globalThis.fetch = async (_url: string | URL | Request, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return new Response("{}", { status: 200 });
      };
      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      await exec.execute({
        model: "cx/gpt-5-mini",
        body: { messages: [{ role: "user", content: "hi" }] },
        stream: false,
        credentials: {},
      });
      assert.equal(capturedBody.model, "cx/gpt-5-mini");
    });

    it("uses credentials from each execute call", async () => {
      const capturedAuthHeaders: string[] = [];
      globalThis.fetch = async (_url: string | URL | Request, opts: RequestInit) => {
        const h = opts.headers as Record<string, string>;
        capturedAuthHeaders.push(h["Authorization"] ?? "");
        return new Response("{}", { status: 200 });
      };
      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      await exec.execute({
        model: "m",
        body: { messages: [] },
        stream: false,
        credentials: { apiKey: "nr_first" },
      });
      await exec.execute({
        model: "m",
        body: { messages: [] },
        stream: false,
        credentials: { accessToken: "nr_second" },
      });
      assert.deepEqual(capturedAuthHeaders, ["Bearer nr_first", "Bearer nr_second"]);
    });

    it("sends correct method, headers, and body", async () => {
      let capturedUrl = "",
        capturedOptions: RequestInit = {};
      globalThis.fetch = async (url: string | URL | Request, opts: RequestInit) => {
        capturedUrl = String(url);
        capturedOptions = opts;
        return new Response("{}", { status: 200 });
      };

      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      await exec.execute({
        model: "test-model",
        body: { messages: [{ role: "user", content: "hello" }] },
        stream: true,
        credentials: { apiKey: "nr_secret" },
      });

      assert.equal(capturedUrl, "http://127.0.0.1:20130/v1/chat/completions");
      assert.equal(capturedOptions.method, "POST");
      assert.ok(capturedOptions.signal);
      const headers = capturedOptions.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer nr_secret");
      const body = JSON.parse(capturedOptions.body as string);
      assert.equal(body.messages[0].content, "hello");
    });

    it("merges upstreamExtraHeaders", async () => {
      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = async (_url: string | URL | Request, opts: RequestInit) => {
        capturedHeaders = opts.headers as Record<string, string>;
        return new Response("{}", { status: 200 });
      };

      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      await exec.execute({
        model: "m",
        body: {},
        stream: false,
        credentials: {},
        upstreamExtraHeaders: { "X-Custom-Header": "yes" },
      });

      assert.equal(capturedHeaders["X-Custom-Header"], "yes");
    });

    it("returns { response, url, headers, transformedBody }", async () => {
      globalThis.fetch = async () => new Response("{}", { status: 200 });

      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      const result = await exec.execute({
        model: "m",
        body: { messages: [] },
        stream: true,
        credentials: {},
      });

      assert.ok(result.response);
      assert.ok(result.url);
      assert.ok(result.headers);
      assert.ok(result.transformedBody !== undefined);
    });
  });

  describe("healthCheck", () => {
    it("probes /api/health and returns ok:true on 200", async () => {
      let capturedUrl = "";
      globalThis.fetch = async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return new Response("{}", { status: 200 });
      };

      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      const result = await exec.healthCheck();

      assert.equal(capturedUrl, "http://127.0.0.1:20130/api/health");
      assert.equal(result.ok, true);
      assert.equal(result.error, undefined);
      assert.ok(result.latencyMs >= 0);
    });

    it("returns ok:false with error message on non-2xx", async () => {
      globalThis.fetch = async () => new Response("", { status: 503 });

      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      const result = await exec.healthCheck();

      assert.equal(result.ok, false);
      assert.equal(result.error, "HTTP 503");
    });

    it("returns ok:false with error message on network failure", async () => {
      globalThis.fetch = async () => {
        throw new Error("ECONNREFUSED");
      };

      const exec = new NineRouterExecutor("http://127.0.0.1:20130");
      const result = await exec.healthCheck();

      assert.equal(result.ok, false);
      assert.ok(result.error?.includes("ECONNREFUSED"));
    });
  });

  describe("getExecutor registration", () => {
    it("getExecutor('9router') returns a NineRouterExecutor", async () => {
      const { getExecutor } = await import("../../open-sse/executors/index.ts");
      const exec = await getExecutor("9router");
      assert.equal(exec.getProvider(), "9router");
    });

    it("getExecutor('nr') alias resolves to NineRouterExecutor", async () => {
      const { getExecutor } = await import("../../open-sse/executors/index.ts");
      const exec = await getExecutor("nr");
      assert.equal(exec.getProvider(), "9router");
    });
  });
});
