---
title: "Webhooks"
version: 3.8.40
lastUpdated: 2026-06-28
---

# Webhooks

> **Historical reference.** The Hermes inference-scope prune removed the webhook
> dispatcher, management routes and dashboard page. The design below is retained
> for operators migrating old configuration; none of it is a live surface.
>
> **Last updated:** 2026-06-28 — v3.8.40

OmniRoute could fire HTTP webhooks on platform events, for example to notify
Slack, PagerDuty, Datadog, internal alerting services, or any HTTP receiver.

The dispatcher signed each delivery with HMAC-SHA256, retried on transient
failures, tracked delivery health per webhook, and auto-disabled endpoints that
kept failing.

## Supported Events

| Event                     | Fired when                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `request.completed`       | A proxied request completes successfully                                                 |
| `request.failed`          | A proxied request fails after all retries/fallback                                       |
| `quota.exceeded`          | An API key crosses a budget/quota threshold                                              |
| `proxy.set_aside`         | A proxy pool member is set aside after repeated refusals (transition only)               |
| `proxy.pool.exhausted`    | Every member of a proxy pool scope is set aside                                          |
| `provider.reset_redeemed` | Auto-apply banked resets redeemed a reset credit or the Claude weekly session reset      |
| `provider.exhausted`      | Every account of a provider is cooling down (at most once per provider every 10 minutes) |
| `test.ping`               | Synthetic event used by the test endpoint                                                |

Subscriptions accepted the literal `"*"` to receive every event. Unknown event
names in `events` were ignored at dispatch time.

> Note: only some non-`test.ping` events had production call sites; the
> dispatcher and its management UI have since been removed.

## Architecture

```
Caller (handler, service, monitor)
  dispatchEvent(event, data)            [removed dispatcher]
    -> getEnabledWebhooks()             [removed DB module]
    -> filter by webhook.events
    -> for each match (in parallel):
       deliverWebhook(url, payload, secret)
         build payload { event, timestamp, data }
         sign body with HMAC-SHA256 (if secret present)
         POST with 10s timeout
         retry up to 3 times on 5xx / network error
       recordWebhookDelivery(id, status, success)
    -> disableWebhooksWithHighFailures(10)
```

Dispatch was fire-and-forget: `Promise.allSettled` swallowed per-webhook errors
so one bad receiver could not block the others.

## HMAC Signing

When a webhook had a `secret`, OmniRoute signed the JSON body and sent:

```
Content-Type: application/json
User-Agent: OmniRoute-Webhook/1.0
X-Webhook-Event: <event>
X-Webhook-Timestamp: <ISO-8601>
X-Webhook-Signature: sha256=<hex HMAC-SHA256(secret, body)>
```

> Header names use the `X-Webhook-*` prefix (not `X-OmniRoute-*`). The signature
> value is `sha256=<hex>` — verify the full prefix.

If `createWebhook` was called without a secret, the DB module generated one
(`whsec_<48 hex>`), so all webhooks were signed by default.

### Verifying on the receiver

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, signature: string, secret: string) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Always verify against the **raw** request body, before any JSON parsing.

## Retry & Failure Policy

`deliverWebhook(url, payload, secret, maxRetries = 3)` used to:

- Apply a 10 second timeout per attempt (`AbortController`).
- Count HTTP 2xx as success.
- Treat HTTP 3xx/4xx as a non-retryable final status — recorded as delivered
  with `success = res.ok`.
- Retry HTTP 5xx and network errors with exponential backoff:
  `2^attempt * 1000 ms` (1s, 2s, 4s).
- Record the delivery as failed after `maxRetries`.
- Update `last_triggered_at`, `last_status`, and either reset or increment
  `failure_count` on each delivery.
- Call `disableWebhooksWithHighFailures(10)` after each fan-out, so any webhook
  with `failure_count >= 10` was automatically disabled.

## Database

The historical table `webhooks` (migration `011_webhooks.sql`):

| Column              | Type    | Notes                                         |
| ------------------- | ------- | --------------------------------------------- |
| `id`                | TEXT PK | UUID                                          |
| `url`               | TEXT    | Destination URL                               |
| `events`            | TEXT    | JSON array; default `["*"]`                   |
| `secret`            | TEXT    | HMAC secret (auto-generated if not given)     |
| `enabled`           | INT     | 0/1; defaults to 1                            |
| `description`       | TEXT    | Optional human label                          |
| `created_at`        | TEXT    | `datetime('now')`                             |
| `last_triggered_at` | TEXT    | Updated on every delivery attempt             |
| `last_status`       | INT     | HTTP status of the last attempt (0 = network) |
| `failure_count`     | INT     | Resets to 0 on success, +1 on failure         |

Delivery history was persisted in the dedicated `webhook_deliveries` table
(migration `069_webhook_deliveries.sql`) in addition to the aggregate counters on
the `webhooks` row. Kind metadata (Slack / Discord / Telegram / custom payload
transformers) was added by `070_webhooks_kind_metadata.sql`.

## Payload Examples

### request.completed

```json
{
  "event": "request.completed",
  "timestamp": "2026-05-13T20:30:00.123Z",
  "data": {
    "trace_id": "...",
    "api_key_id": "...",
    "provider": "openai",
    "model": "gpt-5",
    "status": 200,
    "tokens_in": 142,
    "tokens_out": 350,
    "cost_usd": 0.0042
  }
}
```

### test.ping

```json
{
  "event": "test.ping",
  "timestamp": "2026-05-13T20:32:00.000Z",
  "data": {
    "message": "Test webhook delivery from OmniRoute",
    "webhookId": "<uuid>"
  }
}
```

Field shapes for non-`test.ping` events are defined by the call sites that emit
them; treat the `data` object as forward-compatible (add fields, don't depend on
absence).

## Best Practices

- **Verify the signature on every delivery** against the raw body — this
  prevented spoofed POSTs from anyone who guessed a webhook URL.
- **Respond 2xx within ~5 seconds** — the dispatcher timed out at 10 s; slow
  receivers consumed retries and inflated `failure_count`.
- **Make handlers idempotent** — retries and at-least-once delivery semantics
  meant duplicates were possible.
- **Subscribe minimally** — `"*"` added cost on receivers you do not control.
- **Watch `failure_count`** — endpoints were auto-disabled at 10 failures and
  had to be re-enabled after fixing the receiver.
- **Rotate secrets periodically** — update the stored `secret`, deploy the new
  value to the receiver, and confirm with a test delivery.

## See Also

- [API_REFERENCE.md](../reference/API_REFERENCE.md) — retained API surface; webhook management routes were removed
- [RESILIENCE_GUIDE.md](../architecture/RESILIENCE_GUIDE.md) — circuit breaker / cooldown
  semantics behind provider failures surfaced via `request.failed`
