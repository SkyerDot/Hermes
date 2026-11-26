---
title: "OmniRoute A2A Server Documentation"
version: 3.8.40
lastUpdated: 2026-06-28
---

# OmniRoute A2A Server Documentation

> Agent-to-Agent Protocol v0.3 — OmniRoute as an intelligent routing agent

The A2A surface has two faces:

## Agent Discovery

```bash
curl http://localhost:20128/.well-known/agent.json
```

Returns the Agent Card describing OmniRoute's capabilities, skills, and authentication requirements.

---

## Authentication

All `/a2a` requests require an API key via the `Authorization` header:

```
Authorization: Bearer YOUR_OMNIROUTE_API_KEY
```

If no API key is configured on the server, authentication is bypassed.

## Enablement

A2A is controlled by the **Endpoints → A2A** toggle and is disabled by default. When disabled,
`POST /a2a` return HTTP 503 with JSON-RPC error code `-32000`.

---

## JSON-RPC 2.0 Methods

### `message/send` — Synchronous Execution

Sends a message to a skill and waits for the complete response.

```bash
curl -X POST http://localhost:20128/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "message/send",
    "params": {
      "skill": "smart-routing",
      "messages": [{"role": "user", "content": "Write a hello world in Python"}],
      "metadata": {"model": "auto", "combo": "fast-coding"}
    }
  }'
```

For `smart-routing`, `metadata.combo` is an explicit override of
`metadata.model` for the gateway request; it is sent as the real `model`,
not as an ignored `x-combo` JSON field. The gateway's normal API-key and
per-target authorization still applies. An invalid or empty combo is rejected.

The result exposes `requested_combo` (caller intent), `dispatched_model`
(the actual gateway request), `response_model` (gateway response) and
`confirmed_combo`. The last field is `null` unless the gateway explicitly
identifies a combo. A2A decision logs attribute execution only to a
confirmed combo, retaining an unconfirmed request as `requestedCombo`.

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "task": { "id": "uuid", "state": "completed" },
    "artifacts": [{ "type": "text", "content": "..." }],
    "metadata": {
      "routing_explanation": "Selected claude-sonnet via provider \"anthropic\" (latency: 1200ms, cost: $0.003)",
      "requested_combo": "fast-coding",
      "confirmed_combo": null,
      "dispatched_model": "fast-coding",
      "response_model": "claude-sonnet",
      "cost_envelope": { "estimated": 0.005, "actual": 0.003, "currency": "USD" },
      "resilience_trace": [
        { "event": "primary_selected", "provider": "anthropic", "timestamp": "..." }
      ],
      "policy_verdict": { "allowed": true, "reason": "within budget and quota limits" }
    }
  }
}
```

### `message/stream` — SSE Streaming

Same as `message/send` but returns Server-Sent Events for real-time streaming.

```bash
curl -N -X POST http://localhost:20128/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "message/stream",
    "params": {
      "skill": "smart-routing",
      "messages": [{"role": "user", "content": "Explain quantum computing"}]
    }
  }'
```

**SSE Events:**

```
data: {"jsonrpc":"2.0","method":"message/stream","params":{"task":{"id":"...","state":"working"},"chunk":{"type":"text","content":"..."}}}

: heartbeat 2026-03-03T17:00:00Z

data: {"jsonrpc":"2.0","method":"message/stream","params":{"task":{"id":"...","state":"completed"},"metadata":{...}}}
```

### `tasks/get` — Query Task Status

```bash
curl -X POST http://localhost:20128/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":"2","method":"tasks/get","params":{"taskId":"TASK_UUID"}}'
```

### `tasks/cancel` — Cancel a Task

```bash
curl -X POST http://localhost:20128/a2a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":"3","method":"tasks/cancel","params":{"taskId":"TASK_UUID"}}'
```

---

## Available Skills

| Skill              | ID                   | Description                                                                                                                                  | Tags                       | Examples                               |
| :----------------- | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------- | :------------------------------------- |
| Smart Routing      | `smart-routing`      | Routes a prompt through the optimal provider/combo using OmniRoute's combo engine + scoring                                                  | routing, providers         | "Route this prompt via the best model" |
| Quota Management   | `quota-management`   | Reports per-provider quota state, helps callers decide when to throttle/switch                                                               | quota, providers           | "Check quota for anthropic"            |
| Provider Discovery | `provider-discovery` | Lists installed providers with capabilities, free-tier flags, OAuth status                                                                   | providers, discovery       | "What providers are available?"        |
| Cost Analysis      | `cost-analysis`      | Estimates cost of a request/conversation given the catalog + recent usage                                                                    | cost, usage                | "Estimate cost for this conversation"  |
| Health Report      | `health-report`      | Aggregates circuit breaker, cooldown, lockout state per provider                                                                             | health, resilience         | "Show health status of all providers"  |
| List Capabilities  | `list-capabilities`  | Returns the full 45-entry Agent Skills catalog (23 API + 21 CLI + 1 config) as a markdown table with raw SKILL.md URLs for context injection | catalog, discovery, skills | "List all OmniRoute capabilities"      |

> The Agent Card should be kept aligned with the live 394-provider catalog; provider counts and free/no-auth metadata are sourced from the runtime registry.

### `list-capabilities` Skill Detail

The `list-capabilities` skill is particularly useful for external agents that need to discover what OmniRoute exposes before sending API calls. It returns a structured markdown table artifact:

```
| ID | Name | Category | Area | Endpoints/Commands | Raw URL |
| --- | --- | --- | --- | --- | --- |
| omni-auth | Auth & Sessions | api | auth | POST /api/auth/login, ... | https://raw.githubusercontent.com/... |
...
```

---

## REST API (auxiliary)

The JSON-RPC endpoint `/a2a` is the canonical A2A entry point. The REST endpoints below provide auxiliary access for dashboards and external tooling:

| Endpoint                  | Method | Description                | Auth                   |
| :------------------------ | :----- | :------------------------- | :--------------------- |
| `/.well-known/agent.json` | GET    | Agent Card (A2A discovery) | (public, cached 3600s) |

- `requireLogin=true` (default): the middleware only admits management credentials (dashboard session, `manage`-scope API key, `oma_` access token) and `OMNIROUTE_API_KEY`. A plain inference key gets `403`. In the `Authorization` header the middleware only takes `OMNIROUTE_API_KEY` as `Bearer <key>`; a bare key or a tab after `Bearer` gets `401`.
- `requireLogin=false`, or the loopback window before onboarding: with `REQUIRE_API_KEY=true` any valid OmniRoute API key or management credential is accepted and anonymous callers get `401`; with `REQUIRE_API_KEY` off the routes are open.

Where a credential is required, a `read`-scope `oma_` token only works for `GET`.

---

## Adding a New Skill

1. **Create skill file:** `src/lib/a2a/skills/<your-skill>.ts`

   ```typescript
   export const A2A_SKILL_HANDLERS = {
     // ...existing skills
     "your-skill": async (task, caller) => {
       const skillModule = await import("./skills/yourSkill");
       return skillModule.executeYourSkill(task, caller);
     },
   };
   ```

   ```json
   {
     "id": "your-skill",
     "name": "Your Skill",
     "description": "Brief, intent-focused description",
     "tags": ["routing", "quota"],
     "examples": ["Sample natural-language invocation"]
   }
   ```

2. **Write tests:** `tests/unit/a2a-<your-skill>.test.ts`. Cover happy path + error path.

3. **Document** the new skill in this file's `Available Skills` table.

---

## Task TTL

---

## Task Lifecycle

```
submitted → working → completed
                    → failed
                    → cancelled
```

- Tasks expire after 5 minutes by default (see [Task TTL](#task-ttl))
- Terminal states: `completed`, `failed`, `cancelled`
- Event log tracks every state transition

---

## Error Codes

| Code   | Meaning                        |
| :----- | :----------------------------- |
| -32700 | Parse error (invalid JSON)     |
| -32600 | Invalid request / Unauthorized |
| -32601 | Method or skill not found      |
| -32602 | Invalid params                 |
| -32603 | Internal error                 |
| -32000 | A2A endpoint is disabled       |

---

## Integration Examples

### Python (requests)

```python
import requests

resp = requests.post("http://localhost:20128/a2a", json={
    "jsonrpc": "2.0", "id": "1",
    "method": "message/send",
    "params": {
        "skill": "smart-routing",
        "messages": [{"role": "user", "content": "Hello"}]
    }
}, headers={"Authorization": "Bearer YOUR_KEY"})

result = resp.json()["result"]
print(result["artifacts"][0]["content"])
print(result["metadata"]["routing_explanation"])
```

### TypeScript (fetch)

```typescript
const resp = await fetch("http://localhost:20128/a2a", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer YOUR_KEY",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "1",
    method: "message/send",
    params: {
      skill: "smart-routing",
      messages: [{ role: "user", content: "Hello" }],
    },
  }),
});
const { result } = await resp.json();
console.log(result.metadata.routing_explanation);
```
