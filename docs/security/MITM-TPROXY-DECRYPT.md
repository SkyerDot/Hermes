---
title: "MITM TPROXY Transparent Decrypt"
version: 3.8.40
lastUpdated: 2026-06-28
---

# MITM TPROXY Transparent Decrypt

TPROXY transparent decrypt was OmniRoute's **5th capture mode** for the
[Traffic Inspector](../frameworks/TRAFFIC_INSPECTOR.md) / [AgentBridge](../frameworks/AGENTBRIDGE.md)
MITM stack. The Hermes inference-scope prune removed its source tree, API route
and dashboard toggle; this page is kept as a design/security reference, not as a
live setup guide. It intercepted and **decrypted** local outbound HTTPS traffic on Linux
using kernel TPROXY + policy routing — **without** spoofing `/etc/hosts` and
**without** mutating OS-wide system-proxy settings. It was headless-friendly
(no DNS edits to clean up) and the firewall rules auto-flushed on reboot.

Unlike the other capture modes, TPROXY needed no per-host setup: it transparently
intercepted **arbitrary** destination hosts on a target port, terminated TLS with
a leaf certificate issued on the fly per SNI hostname, captured the decrypted
exchange, and re-encrypted the request to the original destination.

> **Linux-only, root-only, opt-in.** This mode required Linux, a native addon
> built with a C toolchain, and the **CAP_NET_ADMIN** capability (typically root). It was gated
> behind a loopback-only AgentBridge API and disabled by default. A trusted
> MITM CA that can sign any host is a powerful capability — see [§6 Security](#6-security).

**Former source:** `src/mitm/tproxy/`
**See also:** [`docs/frameworks/TRAFFIC_INSPECTOR.md`](../frameworks/TRAFFIC_INSPECTOR.md),
[`docs/frameworks/AGENTBRIDGE.md`](../frameworks/AGENTBRIDGE.md)

---

## §1 What it is and when to use it

The other four capture modes each have a limitation:

| Mode              | How traffic is steered                     | Limitation                             |
| ----------------- | ------------------------------------------ | -------------------------------------- |
| AgentBridge       | `/etc/hosts` DNS spoof of a fixed host set | only the registered IDE-agent hosts    |
| Custom Hosts      | `/etc/hosts` DNS spoof per host            | one entry per host; sudo to edit hosts |
| HTTP_PROXY        | `HTTP_PROXY`/`HTTPS_PROXY` env             | only apps that honor the env var       |
| System-wide proxy | OS proxy settings                          | mutates global state; needs revert     |

TPROXY transparent decrypt steers traffic at the **kernel** layer instead. It
marks new local outbound TCP connections to a target port (default `443`) in the
`mangle OUTPUT` chain, an `ip rule` reroutes the marked packets to local delivery,
and on re-entry the `mangle PREROUTING` `TPROXY` target hands them to an
**IP_TRANSPARENT** listener — which then terminates TLS and captures the plaintext.

Use it when you want to capture and decrypt traffic from a process that:

- talks to a host AgentBridge does not register, and
- does not honor `HTTP_PROXY`, and
- you do not want to disturb with a system-wide proxy change.

Because interception happened in the kernel, the originating process needed **no
configuration change** — but the process had to trust the dynamic CA that the
capture mode installed (see [§4](#4-the-per-sni-dynamic-ca-and-trust-store-installer)).

---

## §2 Requirements

| Requirement        | Detail                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OS**             | Linux only — **IP_TRANSPARENT** is a Linux-only socket option. The loader returns "unavailable" on every other platform.                          |
| **Privilege**      | The **CAP_NET_ADMIN** capability to create the transparent socket and apply `iptables`/`ip` rules — in practice, run as root.                     |
| **Native addon**   | A tiny N-API addon (`src/mitm/tproxy/native/transparent.c`) must be built or shipped as a prebuild. See [§3](#3-the-native-ip_transparent-addon). |
| **Kernel modules** | `iptables` with the `TPROXY`, `mangle`, and `mark` match support (validated against kernel 6.8.0).                                                |

**Graceful degradation:** if any requirement was missing (non-Linux, no toolchain,
or no built addon), the addon loader returned `null` rather than throwing. The
capture-mode status then reported `available: false`, the toggle stayed disabled
with the tooltip "TPROXY decrypt requires Linux + root + the native addon", and
the rest of OmniRoute kept working.

---

## §3 The native IP_TRANSPARENT addon

Node's `net` module cannot `setsockopt(IP_TRANSPARENT)` _before_ `bind()`, which
TPROXY requires (otherwise the kernel drops the redirected packets). The addon
(`src/mitm/tproxy/native/transparent.c`, built via `binding.gyp`) is a small N-API
module exposing three functions, consumed through `transparentSocket.ts`:

| Addon function                        | Socket work                                                                                    | Used for                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `createTransparentListener(ip, port)` | `socket()` + **SO_REUSEADDR** + **IP_TRANSPARENT** + `bind()` + `listen()`, returns the raw fd | the transparent capture listener (Node adopts the fd via `server.listen({ fd })`) |
| `setSocketMark(fd, mark)`             | `setsockopt` **SO_MARK** on an existing fd                                                     | anti-loop (mark the proxy's own sockets)                                          |
| `connectMarked(ip, port, mark)`       | `socket()` + **SO_MARK** **before** a non-blocking `connect()`, returns fd                     | the re-encrypted upstream forward (the SYN carries the mark)                      |

The original destination is read from `socket.localAddress`/`localPort` — TPROXY
preserves it, so there is no **SO_ORIGINAL_DST**/NAT lookup.

### Building the addon (removed)

```bash
# historical: cd src/mitm/tproxy/native && node-gyp rebuild
                                 # -> native/build/Release/transparent.node
```

- The build ran `node-gyp rebuild` as a **Linux-only, non-fatal** step — a missing
  toolchain just left the capture mode unavailable.
- `assembleStandalone.mjs` copied `build/Release/transparent.node` into the
  standalone bundle; `transparentSocket.ts` resolved it both module-relative and
  cwd-relative (`<cwd>/src/mitm/tproxy/native/...`).
- `build/` and `prebuilds/` are git-ignored — the binary is **built, never
  committed**.

The loader probes, in priority order:
`native/build/Release/transparent.node`, then `native/prebuilds/transparent.node`
(both module-relative and under `<cwd>/src/mitm/tproxy/`).

---

## §4 The per-SNI dynamic CA and trust-store installer

The listener terminated TLS with a leaf signed on demand for the client's SNI.
The dynamic CA key stayed in memory (`DynamicCertStore`) and its certificate was
installed under the dedicated `omniroute-tproxy-ca.crt` trust-store slot only
while the capture mode was active.

> **AgentBridge and the dynamic CA.** AgentBridge shares this CA/leaf architecture
> pattern instead of a single static self-signed leaf. It uses a distinct CA
> instance installed under the pre-existing `omniroute-mitm.crt` trust-store slot,
> kept separate from TPROXY's own `omniroute-tproxy-ca.crt` slot below. A trusted
> MITM CA that can sign a leaf for any host is materially more powerful than the
> old fixed-SAN leaf, so the switch was never silent for an already-trusted install.

Historically, the static AgentBridge MITM certificate worked only because AgentBridge
DNS-spoofed a **fixed** host set. TPROXY intercepted **arbitrary** hosts, so its
listener had to present a valid leaf for whatever SNI the client requested — the
same requirement AgentBridge later adopted for antigravity hosts.

---

## §5 How decrypt and capture work

The historical pipeline (all under the removed `src/mitm/tproxy/`):

```
local app  ──TCP/443──▶  mangle OUTPUT marks the conn (fwmark)
                          ip rule → local route table → lo
                          mangle PREROUTING TPROXY → IP_TRANSPARENT listener (port 8443)
                              │  captureMode.ts: reads orig dest from socket.localAddress
                              ▼
                          tlsCapture.ts:
                            1. TLS-terminate the CLIENT with a per-SNI leaf (dynamicCert)
                            2. internal http.Server parses the decrypted plaintext
                            3. capture → globalTrafficBuffer.push() with source: "tproxy"
                               (sanitizeHeaders + maskSecret applied)
                            4. forward RE-encrypted to the original destination
                               over a bypass-marked socket (connectMarked, anti-loop)
                              │
                              ▼
                          original upstream (api.example.com)
```

- **TLS termination** (`createTlsCaptureServer`): wraps the raw intercepted
  socket in a server-side `tls.TLSSocket` using the dynamic CA's SNI callback,
  then hands the decrypted stream to an internal `http.Server` (the standard MITM
  termination trick). Socket lifetimes are bounded by `MITM_IDLE_TIMEOUT_MS` so a
  hung tunnel cannot exhaust file descriptors.
- **Capture** (`handleDecryptedRequest`): pushes an `InterceptedRequest` with
  `source: "tproxy"`, status starting `"in-flight"`, headers run through
  `sanitizeHeaders()` and bodies through `maskSecret()` before they enter the
  buffer. The entry is then updated with the response, sizes, and latency.
- **Re-encrypted forward** (`createForward` / `realForward`): re-encrypts to the
  original destination. `rejectUnauthorized` defaults to **`true`** (secure by
  default) — the upstream cert is verified against the SNI/Host the client
  requested, so the proxy rejects exactly what the original client would.

### Anti-loop (SO_MARK)

Because the rules mark new local outbound connections, the proxy's **own**
re-encrypted forward would normally be re-intercepted — an infinite loop. The
forward path defends against this with a bypass socket mark (**SO_MARK**):

- `realForward` opens its upstream socket via `connectMarked(ip, port, DEFAULT_BYPASS_MARK)`
  — `DEFAULT_BYPASS_MARK = 0x539` — which sets the **SO_MARK** **before** `connect()`,
  so the forward's SYN carries the bypass mark.
- The `mangle OUTPUT` rule excludes connections already carrying the bypass mark
  (`-m mark ! --mark <bypassMark>`), so the proxy's forward is **not** re-marked
  and does not re-enter TPROXY.

> Implementation note: the bypass-marked socket must be installed on the agent's
> `createConnection` (`https.request({ createConnection })` is silently ignored
> when an agent is present), or the forward would open an unmarked socket and the
> loop would return. This was the e2e-validated anti-loop fix.

---

## §6 Security

| Control                          | Detail                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Dedicated CA slot**            | The dynamic CA installed to `omniroute-tproxy-ca.crt`, never clobbering the static MITM cert.                       |
| **CA key never leaves the host** | `DynamicCertStore` held the CA key in memory; it was not exported.                                                  |
| **Secret masking**               | `maskSecret()` on bodies and `sanitizeHeaders()` on headers ran **before** `globalTrafficBuffer.push()`.            |
| **No shell interpolation**       | All `iptables`/`ip`/trust-store commands ran via `execFile`/`execFileWithPassword` with arg arrays (Hard Rule #13). |
| **Upstream cert verification**   | The re-encrypted forward verified the upstream cert by default (`rejectUnauthorized: true`).                        |
| **Error sanitization**           | Route error responses went through `sanitizeErrorMessage()` (Hard Rule #12).                                        |

**The MITM CA is a powerful capability.** A CA trusted by the OS that can sign any
host means anything the proxy intercepts can be decrypted. The mode was gated
behind an explicit, local-only opt-in, off by default, and the trust-store entry
was removed when the mode stopped.

---

## §7 Transactional firewall apply / revert

The design ensured a crash never left a `mangle` rule or stale route behind: the
command builder's **revert was the exact inverse of apply, in reverse order**.

`applyTproxy(cfg)` ran the apply commands in order; on **any** failure it ran a
best-effort full `revertTproxy(cfg)` and rethrew — so the firewall was either
fully applied or fully reverted, never half-applied. `revertTproxy(cfg)` ran the
inverse commands in reverse order and swallowed failures (idempotent).

`validateTproxyConfig(cfg)` ran before any command: ports had to be `1–65535`,
`mark`/`routeTable`/`bypassMark` must be positive integers, and `bypassMark` must
differ from `mark` (anti-loop).

### Apply commands (in order)

```bash
ip rule add fwmark <mark> lookup <routeTable>
ip route add local 0.0.0.0/0 dev lo table <routeTable>
iptables -t mangle -A OUTPUT -p tcp --dport <dport> -m mark ! --mark <bypassMark> -j MARK --set-mark <mark>
iptables -t mangle -A PREROUTING -p tcp --dport <dport> -m mark --mark <mark> -j TPROXY --on-port <onPort> --tproxy-mark <mark>
```

Revert deletes them in reverse: `PREROUTING -D`, `OUTPUT -D`, `ip route del`, `ip rule del`.

> The recipe is **OUTPUT-based** because the MITM use case is _local_ outbound
> traffic (apps on the same host), which TPROXY in `PREROUTING` alone does not
> see — `PREROUTING` only sees forwarded traffic. The `OUTPUT` chain marks new
> local connections, the `ip rule` reroutes them to local delivery (`lo`), and
> `PREROUTING` then assigns them to the transparent listener.

---

## §8 Configuration

The removed start endpoint accepted the fields below, validated by the
removed `StartTproxyBodySchema`. All were optional and fell back to their
defaults:

| Field            | Type               | Default  | Notes                                                                                                           |
| ---------------- | ------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| **dport**        | int (1–65535)      | `443`    | Destination TCP port to transparently intercept                                                                 |
| **mark**         | int (≥1)           | `0x2333` | Firewall mark set on `OUTPUT`, matched by the `ip rule` + `PREROUTING`                                          |
| **onPort**       | int (1–65535)      | `8443`   | Port the transparent (**IP_TRANSPARENT**) listener binds                                                        |
| **routeTable**   | int (≥1)           | `233`    | Policy-routing table id holding the `local 0.0.0.0/0` route                                                     |
| **bypassMark**   | int (≥1, ≠ `mark`) | `0x539`  | The bypass socket mark (**SO_MARK**) the proxy sets on its own upstream conns; excluded in `OUTPUT` (anti-loop) |
| **sudoPassword** | string             | —        | Non-root desktops only: authorizes the trust-store install; ignored when root                                   |

There were **no environment variables** for TPROXY — configuration came from the
POST body or the defaults above.

---

## §9 Enabling from the Traffic Inspector (removed)

The Traffic Inspector toolbar once exposed a **"TPROXY Decrypt"** ⚠ toggle that
reported running / available / intercept count / listener port. Intercepted
requests appeared in the request list with `source: "tproxy"`; starting the mode
twice returned "TPROXY capture mode is already running". That control and its
status endpoint were removed with the TPROXY source tree.

---

## §10 Troubleshooting (historical)

### Toggle was disabled

The native addon was not loadable: the host had to be Linux, with the addon built
and `transparent.node` loadable by the process. Status reported
`available: false` when the addon was missing.

### Nothing is captured

- Confirm the intercepted process actually connects to the configured `dport`
  (default `443`).
- Confirm the process trusts the dynamic CA. The CA is installed under
  `omniroute-tproxy-ca.crt`; apps with their own trust store (Firefox/Chrome NSS)
  may need the cert added there too.
- Run the AgentBridge **Diagnose** self-test (see
  [`AGENTBRIDGE.md`](../frameworks/AGENTBRIDGE.md)) for cert-trusted / server
  health checks.

### Stale firewall rules after a crash

`revertTproxy()` is the exact inverse of apply and is idempotent. Stopping the
mode reverts the rules; if OmniRoute was killed mid-session, use the AgentBridge
state (DNS spoof, root CA, system proxy). The TPROXY `mangle` rules and route also
flush automatically on reboot.

### Infinite loop / the proxy intercepts its own forward

This is the anti-loop case. Confirm `bypassMark` differs from `mark` (validation
enforces this) and that the forward uses `connectMarked` (it does in `realForward`).
See [§5 Anti-loop](#anti-loop-so_mark).

---

## §11 Source map

| File                                   | Responsibility                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/mitm/tproxy/native/transparent.c` | N-API addon: `createTransparentListener` (IP_TRANSPARENT), `setSocketMark`, `connectMarked` |
| `src/mitm/tproxy/native/binding.gyp`   | node-gyp build manifest                                                                     |
