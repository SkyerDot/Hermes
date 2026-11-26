---
title: "OmniRoute MCP Server Documentation"
version: 3.8.51
lastUpdated: 2026-09-22
---

# OmniRoute MCP Server Documentation

> Model Context Protocol server with 110 tools across routing, cache, compression, memory, skills, proxy, pool, Radar, and context source operations.

## Installation

OmniRoute MCP is built-in. Start it with:

```bash
omniroute --mcp
```

Or via the open-sse transport:

```bash
# Streamable HTTP transport (default port 20128, in-process on the dashboard server)
omniroute                                          # start the dashboard server
omniroute mcp enable --transport streamable-http   # from another shell; HTTP is off by default
# Client endpoint: http://localhost:20128/api/mcp/stream
# stdio: omniroute --mcp
```

The HTTP transports (`sse` / `streamable-http`, served in-process by the dashboard server) are
off by default and were previously toggleable only from the `/dashboard/mcp` page. As of v3.8.51
the CLI has parity:

```bash
omniroute mcp status                                  # enabled/online, transport, tool count
omniroute mcp enable [--transport stdio|sse|streamable-http]
omniroute mcp disable
omniroute mcp restart                                 # resets active sse/streamable-http sessions
```

`mcp enable`/`mcp disable` PATCH the same `mcpEnabled` (and optionally `mcpTransport`) setting
down active `sse`/`streamable-http` sessions so the next request re-initializes cleanly, returns
`409` if MCP is disabled, and `501` for the `stdio` transport (stdio clients own their own
subprocess — there is no in-process handle to restart).

## Transports

The MCP server exposes three transports, all backed by the same `createMcpServer()` factory:

| Transport         | Where                                       | When to use                                          |
| :---------------- | :------------------------------------------ | :--------------------------------------------------- |
| `sse`             | `POST/GET /api/mcp/sse` via `httpTransport` | Browser/agent clients that need an event stream      |
| `streamable-http` | `POST/GET/DELETE /api/mcp/stream`           | Multi-session HTTP clients (`mcp-session-id` header) |

The active HTTP transport (`sse` or `streamable-http`) is selected by the `mcpTransport` setting. Switching transports closes existing sessions on the other transport.

### Remote access (manage-scope bypass)

```bash
# Grant manage scope: open the dashboard API Keys page and toggle
# "Management Access" on the key, or POST scopes:["manage"] when creating.

# Then connect from a remote MCP client:
curl -i \
  -H "Host: your-public-host.example" \
  -H "Authorization: Bearer sk-…" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"my-client","version":"0"}}}' \
  https://your-public-host.example/api/mcp/stream
```

### Origin validation

- **No `Origin` header** → allowed. The OmniRoute CLI, SDK and IDE clients do not send one.
- **Allowed `Origin`** → `localhost`, `127.0.0.1` or `[::1]` on any port, or OmniRoute's own public origin: `OMNIROUTE_PUBLIC_BASE_URL` / `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_APP_URL`, a trusted reverse proxy's forwarded origin (`OMNIROUTE_TRUST_PROXY`, only when no base URL is set), or a direct loopback/LAN IP host. The `Host` header alone never makes an origin trusted.
- **Any other `Origin`, including `null`** → `403` with a JSON-RPC error body: `id: null`, `error.code: -32000`, `error.data.code: "INVALID_ORIGIN"`. A dashboard session that presents a valid CSRF token is still accepted, as for other dashboard writes.

A browser MCP client served behind a reverse proxy needs `OMNIROUTE_PUBLIC_BASE_URL`; there is no allow-list for other origins. CORS preflight (`OPTIONS`) is not Origin-checked; the request that follows is.

## IDE Configuration

See [MCP Client Configuration](../guides/SETUP_GUIDE.md#mcp-client-configuration) for Claude Desktop,
Cursor, Cline, and compatible MCP client setup.

---

## Essential Tools (14) — Phase 1

| Tool                            | Scopes                | Description                                                                                                                    |
| :------------------------------ | :-------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `omniroute_get_health`          | `read:health`         | Uptime, memory, circuit breakers, rate limits, cache stats                                                                     |
| `omniroute_list_combos`         | `read:combos`         | All configured combos with strategies (optional metrics)                                                                       |
| `omniroute_get_combo_metrics`   | `read:combos`         | Performance metrics for a specific combo                                                                                       |
| `omniroute_switch_combo`        | `write:combos`        | Activate or deactivate a combo                                                                                                 |
| `omniroute_create_combo`        | `write:combos`        | Create a validated combo through the existing combo API                                                                        |
| `omniroute_check_quota`         | `read:quota`          | Quota used/total, percent remaining, reset time, token health                                                                  |
| `omniroute_route_request`       | `execute:completions` | Send a chat completion through OmniRoute routing                                                                               |
| `omniroute_cost_report`         | `read:usage`          | Cost report by period (session/day/week/month)                                                                                 |
| `omniroute_list_models_catalog` | `read:models`         | Full model catalog with capabilities, status, pricing                                                                          |
| `omniroute_radar_catalog`       | `read:radar`          | Local signed Radar catalog; optional provider/family filters                                                                   |
| `omniroute_tool_search`         | `read:tools`          | Discover tools from the registered MCP catalog                                                                                 |
| `omniroute_web_search`          | `execute:search`      | Web search through the configured search providers. Not X/Twitter.                                                             |
| `omniroute_x_search`            | `execute:search`      | Search X through xAI/SuperGrok, or choose `xquik-search` for Xquik API results. Requires credentials for the selected backend. |
| `omniroute_web_fetch`           | `execute:search`      | Fetch web content through the configured fetch providers                                                                       |

## Advanced Tools (11) — Phase 2

| Tool                               | Scopes                               | Description                                                                               |
| :--------------------------------- | :----------------------------------- | :---------------------------------------------------------------------------------------- |
| `omniroute_simulate_route`         | `read:health`, `read:combos`         | Dry-run routing simulation with fallback tree                                             |
| `omniroute_set_budget_guard`       | `write:budget`                       | Session budget with degrade/block/alert action                                            |
| `omniroute_set_routing_strategy`   | `write:combos`                       | Update combo strategy at runtime (priority/weighted/auto/etc.)                            |
| `omniroute_set_resilience_profile` | `write:resilience`                   | Apply `aggressive` / `balanced` / `conservative` resilience preset                        |
| `omniroute_test_combo`             | `execute:completions`, `read:combos` | Live test of every provider in a combo using a real upstream call                         |
| `omniroute_get_provider_metrics`   | `read:health`                        | Per-provider metrics with p50/p95/p99 latency and circuit breaker state                   |
| `omniroute_best_combo_for_task`    | `read:combos`, `read:health`         | Recommend combo by task type with budget/latency constraints                              |
| `omniroute_explain_route`          | `read:health`, `read:usage`          | Explain why a request was routed to a provider (scoring factors + fallbacks)              |
| `omniroute_get_session_snapshot`   | `read:usage`                         | Full session snapshot: cost, tokens, top models/providers, errors, budget guard           |
| `omniroute_db_health_check`        | `read:health`, `write:resilience`    | Diagnose (and optionally auto-repair) database drift like broken combo refs / orphan rows |
| `omniroute_sync_pricing`           | `pricing:write`                      | Sync pricing data from external sources (LiteLLM); supports `dryRun`                      |

## Cache Tools (2)

| Tool                    | Scopes        | Description                                         |
| :---------------------- | :------------ | :-------------------------------------------------- |
| `omniroute_cache_stats` | `read:cache`  | Semantic cache, prompt-cache, and idempotency stats |
| `omniroute_cache_flush` | `write:cache` | Flush cache globally or by signature/model          |

## Compression Tools (13)

| Tool                                | Scopes              | Description                                                                                                              |
| :---------------------------------- | :------------------ | :----------------------------------------------------------------------------------------------------------------------- |
| `omniroute_compression_status`      | `read:compression`  | Compression settings, analytics summary, and cache-aware stats (includes `analytics.mcpDescriptionCompression` metadata) |
| `omniroute_compression_configure`   | `write:compression` | Configure compression mode, threshold, target ratio, system-prompt preservation, MCP description compression toggle      |
| `omniroute_set_compression_engine`  | `write:compression` | Pick the active engine (off/caveman/rtk/stacked) and Caveman/RTK intensity                                               |
| `omniroute_list_compression_combos` | `read:compression`  | List named compression combos and their engine pipelines                                                                 |
| `omniroute_compression_combo_stats` | `read:compression`  | Analytics grouped by compression combo and engine                                                                        |
| `omniroute_ccr_store`               | `write:compression` | Store caller-isolated content in the bounded in-memory CCR store and return a marker plus `ccr://` reference             |
| `omniroute_ccr_retrieve`            | `read:compression`  | Retrieve CCR content in full or with head, tail, lines, grep, and stats modes                                            |
| `omniroute_ccr_inspect`             | `read:compression`  | Inspect caller-owned CCR metadata without returning content                                                              |
| `omniroute_ccr_list`                | `read:compression`  | List paginated metadata for caller-owned CCR blocks                                                                      |
| `omniroute_ccr_delete`              | `write:compression` | Delete a caller-owned CCR block                                                                                          |
| `omniroute_ccr_stats`               | `read:compression`  | Report caller-scoped memory usage, lifecycle counters, and store limits                                                  |
| `omniroute_rtk_discover`            | `read:compression`  | Discover recurring noise in opt-in RTK output samples                                                                    |
| `omniroute_rtk_learn`               | `read:compression`  | Generate a reviewable RTK filter draft from opt-in samples                                                               |

CCR entries use a two-tier store: a hot in-memory tier backed, on local non-cloud runtimes, by a durable SQLite tier (`ccr_blocks`, on by default) so a block survives eviction or a restart until its TTL runs out — except blocks over 512 KB, cloud runtimes and `COMPRESSION_CCR_DURABLE_STORE=false`, which stay memory-only. The durable write is best effort: it is dropped while 1,000 writes are already pending, and a failed SQLite write is logged, not retried, so that block is lost on restart. Each block is limited to 2 MiB, each
principal to 16 MiB, and the global store to 64 MiB. Entries default to a 24-hour TTL (maximum
seven days). Full MCP retrieval is limited to 256 KiB; larger blocks remain available through the
ranged and grep modes. Storage, retrieval, listing, inspection, deletion, and stats are isolated by
the authenticated API-key principal. Audit records contain hashes and size metadata, never content.
Operator-facing details (the two markers, client prerequisites, `codemode:false`, per-tool scopes,
pagination, and a diagnostic matrix) live in
[Compression Engines → Prerequisites / operator guide](../compression/COMPRESSION_ENGINES.md#prerequisites--operator-guide-ccr--session-dedup).

`omniroute_compression_status` reports MCP description compression separately under
`analytics.mcpDescriptionCompression`. Those values are metadata-size estimates for MCP listable
descriptions (`tools`, `prompts`, `resources`, and `resourceTemplates`); they are not provider usage
receipts and are marked with `source: "mcp_metadata_estimate"`.

### MCP Accessibility Tree Filter (v3.8.0)

Separate from the compression tools above, OmniRoute includes a post-execution filter that
compresses the **tool results** of MCP browser/accessibility tools before they are returned to the
agent. This filter is not itself a tool — it runs transparently on any tool result that contains
verbose accessibility-tree or browser-snapshot text (≥2000 chars).

Key behaviors:

- Collapses ≥30 consecutive repeated sibling lines into head + tail summary
- Preserves `[ref=eXX]` anchors required by Playwright/computer-use
- Hard-truncates oversized text (>50,000 chars) with a navigation hint
- Expected savings: **60–80%** on browser snapshot payloads

Configuration: `compression.mcpAccessibility` in global settings (migration 056).
Implementation: `open-sse/services/compression/engines/mcpAccessibility/`.
Full docs: [Compression Engines — MCP Accessibility Tree Filter](../compression/COMPRESSION_ENGINES.md#mcp-accessibility-tree-filter).

See [Compression Engines](../compression/COMPRESSION_ENGINES.md) and [RTK Compression](../compression/RTK_COMPRESSION.md) for
the runtime compression model behind these tools.

## 1Proxy Tools (3)

| Tool                        | Scopes         | Description                                                                             |
| :-------------------------- | :------------- | :-------------------------------------------------------------------------------------- |
| `omniroute_oneproxy_fetch`  | `read:proxies` | Fetch free proxies from the 1proxy marketplace (protocol/country/quality/limit filters) |
| `omniroute_oneproxy_rotate` | `read:proxies` | Get the next available proxy by strategy (`random` / `quality` / `sequential`)          |
| `omniroute_oneproxy_stats`  | `read:proxies` | Pool stats, sync status, distribution by protocol and country                           |

## Memory Tools (3)

| Tool                      | Scopes         | Description                                                                         |
| :------------------------ | :------------- | :---------------------------------------------------------------------------------- |
| `omniroute_memory_search` | `read:memory`  | Search memories by query / type / API key with token-budget enforcement             |
| `omniroute_memory_add`    | `write:memory` | Add a new memory entry (`factual` / `episodic` / `procedural` / `semantic`)         |
| `omniroute_memory_clear`  | `write:memory` | Clear memories for an API key, optionally filtered by type or `olderThan` timestamp |

## Skill Tools (4)

| Tool                          | Scopes           | Description                                                                       |
| :---------------------------- | :--------------- | :-------------------------------------------------------------------------------- |
| `omniroute_skills_list`       | `read:skills`    | List registered skills with optional filtering by API key, name, or enabled state |
| `omniroute_skills_enable`     | `write:skills`   | Enable or disable a specific skill by ID                                          |
| `omniroute_skills_execute`    | `execute:skills` | Execute a skill with provided input and return the execution record               |
| `omniroute_skills_executions` | `read:skills`    | List recent skill execution history                                               |

## Notion Context Source (6)

Configure your Notion integration token from the **Context Sources** tab in the Endpoint dashboard, or via the REST API:

```bash
# Set token
curl -X POST http://localhost:20128/api/settings/notion \
  -H "Content-Type: application/json" \
  -d '{"token": "ntn_..."}'

# Check status
curl http://localhost:20128/api/settings/notion

# Disconnect
curl -X DELETE http://localhost:20128/api/settings/notion
```

| Tool                         | Scopes         | Description                                                    |
| :--------------------------- | :------------- | :------------------------------------------------------------- |
| `notion_search`              | `read:notion`  | Full-text search across all pages and databases                |
| `notion_get_page`            | `read:notion`  | Get a page by ID with its properties                           |
| `notion_list_block_children` | `read:notion`  | List the child blocks of a page or block                       |
| `notion_query_database`      | `read:notion`  | Query a database with filters, sorts, and pagination           |
| `notion_get_database`        | `read:notion`  | Get database schema by ID                                      |
| `notion_append_blocks`       | `write:notion` | Append children blocks to a parent block (max 100 per request) |

## Agent Skill Catalog Tools (3)

| Tool                              | Scopes         | Description                                                                                                                |
| :-------------------------------- | :------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `omniroute_agent_skills_list`     | `read:catalog` | List all 45 agent skills with optional `category` (api\|cli) and `area` filters; returns metadata + coverage               |
| `omniroute_agent_skills_get`      | `read:catalog` | Get full metadata + SKILL.md content for a single skill by canonical `id`                                                  |
| `omniroute_agent_skills_coverage` | `read:catalog` | Coverage stats: how many of the 23 API, 21 CLI and 1 config skills have SKILL.md files on the filesystem vs catalog totals |

See [AGENT-SKILLS.md](./AGENT-SKILLS.md) for the full catalog and how external agents consume it.

## Related Frameworks (v3.8.0)

The MCP tool inventory above (110 unique tools, computed by `countUniqueMcpTools()`) is intentionally
scoped to runtime routing/cache/compression/memory/skills/proxy/context-source operations. Two adjacent
frameworks ship alongside the MCP server in v3.8.0 and are documented separately:

### Cloud Agents

Cloud Agents are out-of-process AI coding agents (codex-cloud, cursor-cloud, devin, jules) wired into
OmniRoute through the same connection model used for LLM providers. They are exposed via
their own REST surface (`/api/v1/agents/*`) and are **not** part of the MCP tool catalog
— calling a Cloud Agent does not consume an MCP scope.

- Implementation: `src/lib/cloudAgent/` (`registry.ts`, `agents/codex.ts`, `agents/cursor.ts`, `agents/devin.ts`, `agents/jules.ts`).
- Lifecycle: `createTask`, `getStatus`, `approvePlan`, `sendMessage`, `listSources`.
- Documentation: [docs/frameworks/CLOUD_AGENT.md](./CLOUD_AGENT.md).

### Guardrails

Guardrails are pre/post-execution filters (vision-bridge, pii-masker, prompt-injection)
applied inside the chat pipeline. They run before the MCP tool/route layer is reached
and emit structured violations to the audit pipeline; they are not invoked as MCP tools.

- Implementation: `src/lib/guardrails/`.
- Documentation: [docs/security/GUARDRAILS.md](../security/GUARDRAILS.md).

When debugging an MCP call that appears blocked, check both the MCP audit log
(`scope_denied:*` entries) and the guardrails audit trail — a request may be rejected by
a guardrail **before** it ever reaches the MCP scope enforcement layer.

---

## REST API Endpoints

| Endpoint          | Method                | Description                                                                         | Auth             |
| :---------------- | :-------------------- | :---------------------------------------------------------------------------------- | :--------------- |
| `/api/mcp/sse`    | `GET` / `POST`        | SSE transport endpoint (gated by `mcpEnabled` + `mcpTransport === "sse"`)           | API key + scopes |
| `/api/mcp/stream` | `POST`/`GET`/`DELETE` | Streamable HTTP transport (uses `mcp-session-id` header; `DELETE` ends the session) | API key + scopes |

Source files: `src/app/api/mcp/{status,tools,sse,stream,audit,audit/stats}/route.ts`.

Both SSE and Streamable HTTP transports are blocked until the MCP server is enabled in Settings (`mcpEnabled`) and the appropriate `mcpTransport` is selected. If the wrong transport is configured the route returns HTTP 400 with a hint to switch settings.

---

## Authentication & Scopes

MCP tool calls read scope strings from the caller. That check is one of three
independent namespaces. A pass from one checker is not a pass from the others.
The rules are [Three scope namespaces](#three-scope-namespaces).
The tool catalog is [MCP tool scopes](#mcp-tool-scopes).

### Three scope namespaces

`manage` on an API key, `read:compression` on an MCP tool, and `read` on an
`oma_live_…` access token are three different grants. Callers who send a `read`
access token to a mutating management route get HTTP 403
`Access token scope 'read' is insufficient; 'write' required.`
That rank is `scopeSatisfies`. It does not consult the MCP table, and the MCP
matcher does not consult it.

| Namespace          | Credential                                                                | Checker                | A pass allows                                                |
| :----------------- | :------------------------------------------------------------------------ | :--------------------- | :----------------------------------------------------------- |
| API-key management | `api_keys.scopes`                                                         | `hasManageScope`       | Management REST for that Bearer key                          |
| API-key additive   | same array, one exact string                                              | the helper named below | Only that one capability                                     |
| MCP tool scopes    | same array, else MCP `_meta` (HTTP/SSE only), else `OMNIROUTE_MCP_SCOPES` | `scopeMatches`         | That tool, once enforcement is on                            |
| Access token       | `oma_live_…`                                                              | `scopeSatisfies`       | The management route whose method and path require that rank |

Minting each credential is covered in
[Management Authentication](../guides/MANAGEMENT-AUTH.md).

#### API-key scopes

One `api_keys.scopes` array feeds two jobs. They use different functions.

**Management REST.** `manage` and `admin` are the members of
`MANAGEMENT_API_KEY_SCOPES` (`src/shared/constants/managementScopes.ts`).
`hasManageScope` is what authorizes management routes for that key. `admin` is
management-capable on those routes. The word `admin` here is not the
access-token rank and it does not expand into MCP tool scopes.

**Additive strings.** Each one is an exact membership test, and each one stays
outside `MANAGEMENT_API_KEY_SCOPES`.

| Scope                          | A pass allows                                                                                                                                                   |
| :----------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `self:usage`                   | `GET /api/v1/me/status` for this key (`src/app/api/v1/me/status/route.ts`). `POST /api/keys` adds this scope on create (`normalizeSelfServiceScopesForCreate`). |
| `self:account-quota`           | Upstream account quotas inside that status payload (`src/lib/usage/apiKeySelfService.ts`). The status route still requires `self:usage`.                        |
| `policy:bypass-provider-quota` | This key's inference calls skip the provider-quota policy (`hasProviderQuotaBypassScope` in `src/sse/handlers/chat.ts`).                                        |

#### Matching

The catalog is the table under [MCP tool scopes](#mcp-tool-scopes). Do not
it is the original typed subset. Later tools declare further scopes beside it
(`read:notion`, `read:skills`, `read:local-corpus`, and the rest of the table).

when every required scope matches some granted scope:

- `*` matches every required scope.
- A granted scope that ends in `*` matches a required scope that starts with
  the prefix before the star. `read:*` matches `read:compression`.
- Every other granted scope matches only the identical required string.

A key whose scopes are `["manage"]` fails `scopeMatches` for `read:compression`.
The same call fails for `admin`, `mcp:connect`, `read`, and `write` when those
are the only granted strings. There is no hierarchy among MCP tool scopes
beyond the trailing `*`.

Enforcement is off unless `OMNIROUTE_MCP_ENFORCE_SCOPES=true` (default
`false`). While it is off, `evaluateToolScopes` allows the call and skips the
catalog. While it is on, HTTP uses the Bearer key's `api_keys.scopes` as
`authInfo` (see [Per-key HTTP scope binding](#per-key-http-scope-binding-7895)).
When no key scopes resolve, the granted set falls through to MCP `_meta` (honored only
for HTTP/SSE callers, inside an HTTP auth context; a stdio caller's `_meta` is ignored
because the client controls it and it carries no per-caller identity), then
`OMNIROUTE_MCP_SCOPES`.

#### Access-token scopes

`oma_live_…` tokens (`src/lib/accessTokens/scopes.ts`) carry `read`, `write`,
or `admin`. `scopeSatisfies` is a rank: `admin` covers `write` and `read`, and
`write` covers `read`. Unknown scopes cover nothing.

`evaluateAccessTokenAuth` (`src/server/authz/accessTokenAuth.ts`) compares that
rank with `inferRequiredScope` (`src/server/authz/accessScopes.ts`):

- `GET`, `HEAD`, and `OPTIONS` require `read`.
- Every other method requires `write`.
- Paths in `ADMIN_MUTATION_PREFIXES` require `admin` only for mutations.
- Paths in `ADMIN_MUTATION_EXACT_PATHS` (`/api/settings`,
  `/api/settings/require-login`) require `admin` only for mutations, and only on
  that exact path — other `/api/settings/*` sub-routes keep `write`.

`PATCH /api/keys/{id}` is a mutation and is not on those admin lists, so a
`read` token receives 403
`Access token scope 'read' is insufficient; 'write' required.`
A `write` or `admin` access token satisfies that route. A dashboard JWT, the
loopback CLI machine-id token, and an API key with `manage` or `admin` take
other branches and are not narrowed by this rank.

management gate only. Tool calls still run `scopeMatches` against API-key
scopes. The access-token rank is not an input to `scopeMatches`.

### MCP tool scopes

Each tool requires specific scopes:

| Scope                 | Tools                                                                                                                                                                        |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read:health`         | `get_health`, `get_provider_metrics`, `simulate_route`, `explain_route`, `best_combo_for_task`, `db_health_check`                                                            |
| `read:combos`         | `list_combos`, `get_combo_metrics`, `simulate_route`, `best_combo_for_task`, `test_combo`                                                                                    |
| `write:combos`        | `switch_combo`, `set_routing_strategy`                                                                                                                                       |
| `read:quota`          | `check_quota`                                                                                                                                                                |
| `read:usage`          | `cost_report`, `get_session_snapshot`, `explain_route`                                                                                                                       |
| `read:models`         | `list_models_catalog`                                                                                                                                                        |
| `execute:completions` | `route_request`, `test_combo`                                                                                                                                                |
| `execute:search`      | `web_search`, `x_search`, `web_fetch`                                                                                                                                        |
| `write:budget`        | `set_budget_guard`                                                                                                                                                           |
| `write:resilience`    | `set_resilience_profile`, `db_health_check`                                                                                                                                  |
| `pricing:write`       | `sync_pricing`                                                                                                                                                               |
| `read:cache`          | `cache_stats`                                                                                                                                                                |
| `write:cache`         | `cache_flush`                                                                                                                                                                |
| `read:compression`    | `compression_status`, `list_compression_combos`, `compression_combo_stats`                                                                                                   |
| `write:compression`   | `compression_configure`, `set_compression_engine`                                                                                                                            |
| `read:proxies`        | `oneproxy_fetch`, `oneproxy_rotate`, `oneproxy_stats`                                                                                                                        |
| `read:notion`         | `notion_search`, `notion_get_page`, `notion_list_block_children`, `notion_query_database`, `notion_get_database`                                                             |
| `write:notion`        | `notion_append_blocks`                                                                                                                                                       |
| `read:memory`         | `memory_search`                                                                                                                                                              |
| `write:memory`        | `memory_add`, `memory_clear`                                                                                                                                                 |
| `read:skills`         | `skills_list`, `skills_executions`                                                                                                                                           |
| `write:skills`        | `skills_enable`                                                                                                                                                              |
| `execute:skills`      | `skills_execute`                                                                                                                                                             |
| `read:catalog`        | `agent_skills_list`, `agent_skills_get`, `agent_skills_coverage`                                                                                                             |
| `read:tools`          | `omniroute_tool_search`                                                                                                                                                      |
| `read:radar`          | `omniroute_radar_catalog`                                                                                                                                                    |
| `read:gamification`   | `gamification_profile`, `gamification_rank`, `gamification_leaderboard`, `gamification_badges`, `gamification_servers`, `gamification_anomalies`                             |
| `write:gamification`  | `gamification_invite`, `gamification_transfer`                                                                                                                               |
| `read:plugins`        | `plugin_list`, `plugin_executions`                                                                                                                                           |
| `write:plugins`       | `plugin_scan`, `plugin_install`, `plugin_uninstall`, `plugin_activate`, `plugin_deactivate`, `plugin_configure`                                                              |
| `read:obsidian`       | 13 read tools — `obsidian_list_vault`, `obsidian_read_note`, `obsidian_search_simple`, `obsidian_search_structured`, `obsidian_get_periodic_note`, `obsidian_sync_status`, … |
| `write:obsidian`      | 9 write tools — `obsidian_write_note`, `obsidian_append_note`, `obsidian_patch_note`, `obsidian_move_note`, `obsidian_delete_note`, `obsidian_sync_trigger`, …               |
| `read:local-corpus`   | `local_corpus_search`, `local_corpus_read`, `local_corpus_status`                                                                                                            |

Wildcard scopes are supported: `read:*` grants all read-scopes, `*` grants full access.

### `mcp:connect` — narrow route capability (#7895)

that carve-out only accepted a full `manage`/`admin`-scope API key — too broad for a
caller that only needs to talk MCP. `src/shared/constants/managementScopes.ts` now
exports `MCP_CONNECT_SCOPE = "mcp:connect"`: an additive, narrow scope (same precedent as
`src/server/authz/policies/management.ts` — it grants no other management-route access
and is deliberately kept OUT of `MANAGEMENT_API_KEY_SCOPES`. A key holding `manage`/`admin`
still passes the carve-out unchanged; `mcp:connect` is a lower-privilege alternative for
remote MCP-only callers, checked via `hasMcpConnectOrManageScope()`.

### Per-key HTTP scope binding (#7895)

and passes it to the MCP SDK's `transport.handleRequest(req, { authInfo })`, so
`extra.authInfo.scopes` reaching each tool call reflects the Bearer key's own scopes.
`scopeEnforcement.ts`'s `resolveCallerScopeContext()` already prioritized `authInfo` over
the `_meta` and `OMNIROUTE_MCP_SCOPES` env fallback — this only populates that first,
highest-priority source, which was previously unfed over HTTP. When no API key resolves
(no header, invalid key), `authInfo` stays `undefined` and resolution falls through to the
existing `meta`/env chain unchanged. stdio has no per-caller identity (see
`mcpCallerIdentity.ts`) and is unaffected by per-key binding — it skips the `_meta` step
(`_meta` is honored only inside an HTTP auth context, #15159) and resolves from the
`OMNIROUTE_MCP_SCOPES` env key alone.

**Enforcement is forced on for narrow-scoped HTTP/SSE callers regardless of
`OMNIROUTE_MCP_ENFORCE_SCOPES`.** `OMNIROUTE_MCP_ENFORCE_SCOPES` defaulting to `false` is only
safe for the local/stdio single-operator flow, where there is no per-caller identity to scope
enforcement on unconditionally (`shouldForceScopeEnforcement()` in `scopeEnforcement.ts`)
whenever `resolveCallerScopeContext()` resolved
`source === "authInfo"` (i.e. a real per-key HTTP Authorization header, HTTP/SSE-only) AND that
key does not hold full `manage`/`admin` scope. This closes the gap where a key holding ONLY
the narrow `mcp:connect` bypass scope — documented above as authorizing nothing but the
enabled remote/non-loopback MCP access, simply because `OMNIROUTE_MCP_ENFORCE_SCOPES` ships
`false` by default. A full `manage`/`admin` key over HTTP, and every stdio/local caller, keep
the existing `OMNIROUTE_MCP_ENFORCE_SCOPES`-gated behavior unchanged.

---

## Environment Variables

| Variable                                | Default                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :-------------------------------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OMNIROUTE_BASE_URL`                    | `http://localhost:20128`           | Base URL the MCP server uses when calling OmniRoute internal APIs                                                                                                                                                                                                                                                                                                                                                                                                    |
| `OMNIROUTE_API_KEY`                     | (empty)                            | API key forwarded as `Authorization: Bearer` to internal API calls                                                                                                                                                                                                                                                                                                                                                                                                   |
| `OMNIROUTE_MCP_ENFORCE_SCOPES`          | `false` (only `"true"` enables it) | When enabled, missing scopes deny tool calls and log `scope_denied:<reason>` in audit log. Enforcement is ALSO forced on regardless of this flag for any HTTP/SSE caller resolved from a per-key Authorization header (`source === "authInfo"`) that lacks full `manage`/`admin` scope — e.g. a key holding only the narrow `mcp:connect` bypass scope — so this default is safe only for the local/stdio single-operator flow, never for remote non-loopback access |
| `OMNIROUTE_MCP_SCOPES`                  | (empty)                            | Comma-separated allowlist of scopes considered "available" by default (used when caller does not provide its own scopes)                                                                                                                                                                                                                                                                                                                                             |
| `OMNIROUTE_MCP_COMPRESS_DESCRIPTIONS`   | (unset = on)                       | When set to `0/false/off/no`, disables MCP description compression at registration time                                                                                                                                                                                                                                                                                                                                                                              |
| `OMNIROUTE_MCP_DESCRIPTION_COMPRESSION` | (unset = on)                       | Alternate alias for the same toggle as above                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `OMNIROUTE_MCP_FETCH_TIMEOUT_MS`        | `10000`                            | Abort budget for internal management reads (health, resilience, combos, quota, usage)                                                                                                                                                                                                                                                                                                                                                                                |
| `OMNIROUTE_MCP_UPSTREAM_TIMEOUT_MS`     | `60000`                            | Abort budget for hops that wait on a provider (`route_request`, `web_search`, `web_fetch`)                                                                                                                                                                                                                                                                                                                                                                           |
| `DATA_DIR`                              | `~/.omniroute`                     | Heartbeat file is written to `${DATA_DIR}/runtime/mcp-heartbeat.json`                                                                                                                                                                                                                                                                                                                                                                                                |

---

## Description Compression

- Compression runs over the description text using the Caveman ruleset (`getRulesForContext("all", "full")`) with preserved-block extraction (code spans, fenced blocks, etc.) so structural content is not altered.
- Toggle per-deployment via the `compression.mcpDescriptionCompressionEnabled` value in the `key_value` settings table (default: enabled) — exposed in the UI as **Analytics → MCP description compression**.
- Toggle process-wide via either `OMNIROUTE_MCP_COMPRESS_DESCRIPTIONS=false` or `OMNIROUTE_MCP_DESCRIPTION_COMPRESSION=false`.
- Realtime stats are surfaced via `omniroute_compression_status` under `analytics.mcpDescriptionCompression` and tagged `source: "mcp_metadata_estimate"` to disambiguate from real provider usage receipts.

---

## Tool Cardinality Reduction (F4.3)

**Opt-in, off by default.** The filter only runs when at least one of two environment variables is set; with neither set, all 110 tools are announced unchanged.

| Variable | Mode |
| :------- | :--- |

`deny` takes priority over `allow`. Names are comma-separated, trimmed, and empty entries are ignored. Examples:

```bash
# Drop two tools from the catalog
MCP_TOOL_DENY="omniroute_get_health,omniroute_list_combos" omniroute --mcp

# Announce only the routing + quota tools (allow-list mode)
MCP_TOOL_ALLOW="omniroute_route_request,omniroute_check_quota" omniroute --mcp
```

**How filtered tools are removed:** registration always succeeds; a tool the profile rejects is then `.disable()`d on the MCP SDK handle, so it never appears in `tools/list` but the wiring stays intact (clean enable/disable, no re-registration). The profile parser is `readMcpToolProfileFromEnv(process.env)`, which returns `null` (no filtering) when both vars are empty.

The richer `ToolProfile` shape behind `reduceToolManifest` also supports scope-intersection filtering (`allowScopes`, with `read:*`-style wildcard matching) and a deterministic `maxTools` cap, but those two knobs need the full manifest at registration time and are **not** exposed through the environment variables today (a `tools/list`-level hook is a tracked follow-up). `estimateManifestTokens()` is available to compare the manifest token cost before and after reduction.

---

## Runtime Heartbeat

The heartbeat snapshot contains:

```json
{
  "pid": 12345,
  "startedAt": "2026-05-13T12:34:56.000Z",
  "lastHeartbeatAt": "2026-05-13T12:35:01.000Z",
  "version": "1.8.1",
  "transport": "stdio",
  "scopesEnforced": false,
  "allowedScopes": [],
  "toolCount": 110
}
```

---

## Audit Logging

- Tool name, arguments (hashed/truncated as per-tool `auditLevel`), result
- Duration in ms, success/failure flag, error message (when applicable)
- API key hash, timestamp
- Scope denials are logged as `scope_denied:<reason>` with the missing scope list

---

## Files

| File                                                                     | Purpose                    |
| :----------------------------------------------------------------------- | :------------------------- |
| `src/app/(dashboard)/dashboard/endpoint/components/NotionSourceCard.tsx` | Notion token management UI |
