---
title: "Plugin Marketplace"
version: 3.8.40
lastUpdated: 2026-06-28
---

# Plugin Marketplace

> **Source of truth:** `src/lib/plugins/` (`marketplace.ts`, `manager.ts`, `manifest.ts`,
> `scanner.ts`, `loader.ts`), `src/app/api/plugins/`, and
> `src/app/(dashboard)/dashboard/plugins/`
> **Last updated:** 2026-06-28 — v3.8.40

OmniRoute ships a WordPress-style plugin system. Plugins are self-contained
directories — each with a `plugin.json` manifest and an entry file — that hook
into the request pipeline (`onRequest` / `onResponse` / `onError`) and into
lifecycle events (`onInstall` / `onActivate` / `onDeactivate` / `onUninstall`).

The **Plugin Marketplace** is the discovery layer on top of that system. It
exposes a browsable catalog of installable plugins. By default the catalog is a
small built-in seed registry; an operator can point it at a custom remote
registry URL, in which case the fetch is hardened by a DNS-resolving SSRF guard
(see [Security](#security)).

Every plugin route is **loopback-only** (Tier 1 — `LOCAL_ONLY`): plugins load
and execute code in child processes, so the routes are unreachable from a
non-loopback origin regardless of auth. See
[`docs/security/ROUTE_GUARD_TIERS.md`](../security/ROUTE_GUARD_TIERS.md).

## How It Fits Together

```
Dashboard (/dashboard/plugins)
  ├─ "Installed" tab  → GET /api/plugins            (listPlugins)
  │                     POST /api/plugins/scan      (pluginManager.scan)
  │                     POST /api/plugins/{name}/activate|deactivate
  │                     DELETE /api/plugins/{name}   (uninstall)
  └─ "Marketplace" tab → GET /api/plugins/marketplace
                          → listMarketplacePlugins()
                            ├─ no custom URL → built-in SEED_REGISTRY
                            └─ custom URL → isSafeMarketplaceUrl() SSRF guard
                                          → safeOutboundFetch(guard:"public-only")
```

## Marketplace Catalog

`MarketplaceEntry` objects:

| Field         | Type     | Notes                                |
| ------------- | -------- | ------------------------------------ |
| `name`        | string   | kebab-case plugin name               |
| `version`     | string   | semver                               |
| `description` | string   | Short summary                        |
| `author`      | string   | Author / org                         |
| `license`     | string   | SPDX-style license id                |
| `downloadUrl` | string   | Source download URL (may be empty)   |
| `repository`  | string?  | Optional repository URL              |
| `tags`        | string[] | Search/filter tags                   |
| `downloads`   | number   | Download count                       |
| `rating`      | number   | 0–5                                  |
| `verified`    | boolean  | Whether the entry is marked verified |
| `lastUpdated` | string   | ISO-ish date string                  |

When no custom registry URL is configured, the catalog uses the built-in seed
list. A configured remote registry that is unreachable, returns a non-`200`
status, or returns an unrecognized body falls back to that seed list.

## Configuration

### Plugin directory

Plugins live under the OmniRoute data directory:

```
~/.omniroute/plugins/<plugin-name>/
  ├─ plugin.json
  └─ index.js          # (or whatever manifest.main points to)
```

three steps:

1. **`OMNIROUTE_PLUGINS_DIR`**, when set — used verbatim, whatever `HOME` says. This is
   the explicit knob for Docker/K8s, where the plugin tree is bind-mounted at a path
   that usually has nothing to do with the container's home directory (#11827).
2. `<home>/.omniroute/plugins`, where `<home>` comes from the `HOME` / `USERPROFILE`
   environment variables.
3. `/tmp/.omniroute/plugins`, when the process exports no home at all.

The resolved directory is logged once at startup as `scanner.dir_resolved`, naming the
input that won (`OMNIROUTE_PLUGINS_DIR`, `home`, or `no-home-fallback`) — so an image
that silently lands on step 3 says so, instead of only reporting an empty plugin list.
`plugin.json` and registers it; the same directory is the root that
`pluginManager.install()` copies plugins into, so an override moves discovery and
installation together.

> **`OMNIROUTE_PLUGINS_DIR` is not `OMNIROUTE_PLUGIN_PATH`.** The latter is read only by
> packages that add `omniroute` subcommands — it has no effect on the runtime scanner
> described here. See [PLUGINS.md](./PLUGINS.md) for that side.

### Custom marketplace registry URL

The marketplace catalog source is read from the `pluginMarketplaceUrl` setting
set to an `http(s)` URL, `listMarketplacePlugins()` fetches that URL and accepts
either a top-level JSON array of entries or an object with a `plugins` array;
entries without a string `name` are filtered out. When unset (or when the fetch
fails the SSRF guard / returns a bad response), the built-in seed registry is
used.

The dashboard "Marketplace" tab exposes a field for this URL (read back from
`GET /api/settings`).

> Implementation note: the dashboard "Save" action sends
> `pluginMarketplaceUrl` to `PATCH /api/settings`. At the time of writing this
> key is not declared in `updateSettingsSchema`
> (`src/shared/validation/settingsSchemas.ts`), so verify persistence in your
> release before relying on it — the **read** path (`getSettings()` →
> `listMarketplacePlugins()`) honors the key once it is present in the settings
> store.

## Security

### Route tier — loopback only

surface is classified `LOCAL_ONLY` (Tier 1). Loopback enforcement runs
unconditionally **before** any auth check, so a leaked management token reaching
the box over a tunnel still cannot install, activate, or uninstall a plugin.
See [`docs/security/ROUTE_GUARD_TIERS.md`](../security/ROUTE_GUARD_TIERS.md) and
Hard Rules #15 / #17.

### Marketplace registry SSRF guard

A custom registry URL is attacker-influenceable configuration, so before
fetching it `listMarketplacePlugins()` runs it through two layers:

2. **`safeOutboundFetch(url, { guard: "public-only", timeoutMs: 5000 })`**
   (`src/shared/network/safeOutboundFetch.ts`): re-applies the public-only URL
   guard at fetch time and **blocks redirects** (no public → private `30x`
   pivot).

A URL that fails either layer does not abort the request — the marketplace
silently falls back to the built-in seed registry and logs a warning.

> This guard was hardened in PR #3774 specifically to resolve A + AAAA and use
> the canonical `isPrivateHost` instead of an IPv4-only check.

### Plugin execution isolation

> **Plugins are not sandboxed by default.** The child is an ordinary Node.js
> process running as the OmniRoute user, with no VM context and no Node.js
> permission flags, so plugin code can read and write any file that user can,
> run programs and reach the network. `requires.permissions` only decides which
> environment variables the child receives; the other permissions are not
> default) runs each plugin under the Node.js permission model built from those
> permissions, except `network`, which Node.js cannot restrict (see
> [`PLUGIN_SDK.md`](./PLUGIN_SDK.md#permission-system)). Install only plugins
> you trust. The process boundary below contains crashes and hangs; it is not a
> security boundary.

- **Env allowlist** — the child receives only an allowlisted set of environment
  variables; the broader set is only granted when the manifest requests the
  `env` permission.
- **Path containment** — install/upgrade/uninstall assert that the plugin
  directory and `manifest.main` resolve **within** the managed plugin root
  before any copy or recursive delete (guards against tampered DB paths and
  `../` traversal in `manifest.main`). Activation resolves symlinks via
  `realpath` and refuses to load an entry point that escapes the plugin
  directory.
- **Optional integrity pin** — a manifest may declare an `integrity`
  (`sha256-<base64>`, SRI format) field. When present, the loader verifies the
  entry file hash at load time and refuses to activate on mismatch. It is
  opt-in tamper-detection, **not** a security boundary: it does not limit what
  a loaded plugin can do.
- **No client credentials in hooks** — the context passed to `onRequest`,
  `onResponse` and `onError` has the `authorization`, `x-api-key`,
  `proxy-authorization` and `cookie` headers removed.

## Manifest (`plugin.json`)

| Field              | Type      | Notes                                                       |
| ------------------ | --------- | ----------------------------------------------------------- |
| `name`             | string    | Required; kebab-case (`^[a-z0-9-]+$`), 1–100 chars          |
| `version`          | string    | Required; semver (`MAJOR.MINOR.PATCH`)                      |
| `description`      | string?   | ≤ 500 chars                                                 |
| `author`           | string?   | ≤ 200 chars                                                 |
| `license`          | string?   | Defaults to `MIT`                                           |
| `main`             | string?   | Entry file; defaults to `index.js`                          |
| `source`           | enum?     | `local` \| `marketplace` (defaults to `local`)              |
| `tags`             | string[]? | Search tags                                                 |
| `requires`         | object?   | `{ omniroute?, permissions[] }`                             |
| `hooks`            | object?   | Booleans declaring which hooks the plugin implements        |
| `skills`           | object[]? | Optional skill definitions                                  |
| `enabledByDefault` | boolean?  | Auto-activate on install                                    |
| `configSchema`     | object?   | Map of config fields (`string`/`number`/`boolean`/`select`) |
| `integrity`        | string?   | Optional `sha256-<base64>` entry-file pin                   |

Permissions are drawn from the enum
`network` / `file-read` / `file-write` / `env` / `exec`. Only `env` has a
runtime effect (a slightly larger environment-variable allowlist for the
child); the others are declarations and are not enforced.

## Lifecycle Flow

```
install (POST /api/plugins, path)
  → scan/validate manifest → copy to staging → assert main within dir
  → atomic rename into ~/.omniroute/plugins/<name> → insert DB row
  → fire onInstall → if enabledByDefault: activate

activate (POST /api/plugins/{name}/activate)
  → realpath containment check → loadPlugin() (spawn child process)
  → register declared hooks → status = "active" → fire onActivate

deactivate (POST /api/plugins/{name}/deactivate)
  → fire onDeactivate (BEFORE unregister) → unregister hooks
  → kill child process → status = "inactive"

uninstall (DELETE /api/plugins/{name})
  → deactivate if active → fire onUninstall
  → containment-checked recursive delete of plugin dir → delete DB row
```

Re-running `install` against a directory whose manifest version is **strictly
newer** than the installed version auto-upgrades (clean reinstall; config resets
to defaults). A same-or-older version is rejected.

## Database

Table `plugins` (migration `076_create_plugins.sql`):

| Column          | Type    | Notes                                            |
| --------------- | ------- | ------------------------------------------------ |
| `id`            | TEXT PK | UUID                                             |
| `name`          | TEXT    | Unique                                           |
| `version`       | TEXT    | semver; default `1.0.0`                          |
| `description`   | TEXT    | Optional                                         |
| `author`        | TEXT    | Optional                                         |
| `license`       | TEXT    | Default `MIT`                                    |
| `main`          | TEXT    | Entry file; default `index.js`                   |
| `source`        | TEXT    | Default `local`                                  |
| `tags`          | TEXT    | JSON array; default `[]`                         |
| `status`        | TEXT    | `installed` \| `active` \| `inactive` \| `error` |
| `enabled`       | INT     | 0/1; default 0                                   |
| `manifest`      | TEXT    | Full manifest JSON                               |
| `config`        | TEXT    | JSON; default `{}`                               |
| `config_schema` | TEXT    | JSON; default `{}`                               |
| `hooks`         | TEXT    | JSON array of declared hook names; default `[]`  |
| `permissions`   | TEXT    | JSON array; default `[]`                         |
| `plugin_dir`    | TEXT    | Absolute install directory                       |
| `error_message` | TEXT    | Set when `status = "error"`                      |
| `installed_at`  | TEXT    | `datetime('now')`                                |
| `updated_at`    | TEXT    | `datetime('now')`                                |
| `activated_at`  | TEXT    | Set on activation                                |

Plugin metrics/analytics are tracked in additional tables
(`090_plugin_metrics.sql`, `091_plugin_analytics.sql`).

## Dashboard

The dashboard page at `/dashboard/plugins`
(`src/app/(dashboard)/dashboard/plugins/page.tsx`) provides two tabs:

- **Installed** — lists installed plugins with their declared hooks, an
  activate/deactivate toggle and an uninstall button.

The page always shows a warning that plugins run with the full privileges of
the OmniRoute process.

A per-plugin config page lives at `/dashboard/plugins/[name]/config`
(`src/app/(dashboard)/dashboard/plugins/[name]/config/page.tsx`).

## See Also

- [`docs/security/ROUTE_GUARD_TIERS.md`](../security/ROUTE_GUARD_TIERS.md) —
- [`docs/frameworks/SKILLS.md`](./SKILLS.md) — the related skills framework
  (`src/lib/skills/`); plugins may declare skills in their manifest
- [`docs/frameworks/WEBHOOKS.md`](./WEBHOOKS.md) — event-driven outbound
  integrations
- [`docs/security/ERROR_SANITIZATION.md`](../security/ERROR_SANITIZATION.md) —
  the `buildErrorBody()` pattern every plugin route uses for error responses
