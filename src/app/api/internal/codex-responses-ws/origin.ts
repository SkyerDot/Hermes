/**
 * Origin check for the preserved internal Codex Responses-WS bridge. Scoped copy of the
 * upgrade-handshake Origin semantics that were shared with the removed public WS surface.
 */
import { resolveAllowedOrigin } from "@/server/cors/origins";
import { getPublicOriginCandidates, normalizeOrigin } from "@/server/origin/publicOrigin";

/**
 * Browsers do not apply CORS to WebSocket: any page can open a socket to the inference
 * endpoint and read every frame. Verdict:
 *   - no `Origin` header → allowed (Codex CLI and SDKs do not send one);
 *   - `Origin` admitted by the CORS allowlist → allowed;
 *   - `Origin` equal to one of OmniRoute's own public origins → allowed;
 *   - anything else, including `null` and non-http(s) origins → rejected.
 *
 * The `request-url` candidate is skipped: the bridge builds the request URL itself, so it
 * says nothing about where the browser page came from. `request` must carry the handshake's
 * `Origin`, `Host`, forwarding headers and the peer stamp forwarded by the WS front.
 */
export function isWebSocketOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  if (resolveAllowedOrigin(origin) !== null) return true;

  let normalizedOrigin: string;
  try {
    normalizedOrigin = normalizeOrigin(origin);
  } catch {
    return false;
  }

  return getPublicOriginCandidates(request).some(
    (candidate) => candidate.source !== "request-url" && candidate.origin === normalizedOrigin
  );
}

/**
 * Upgrade-request headers the WS front forwards for the Origin check. Sender:
 * `getHandshakeOriginHeaders` in `scripts/dev/responses-ws-proxy.mjs`. Change both lists
 * together.
 */
export const WS_HANDSHAKE_ORIGIN_HEADERS = [
  "host",
  "x-forwarded-host",
  "x-forwarded-proto",
  "forwarded",
  "x-omniroute-peer-ip",
] as const;

/**
 * Rebuild a Request carrying the forwarded handshake headers plus `origin`, for
 * `isWebSocketOriginAllowed`. Unknown keys and non-string values are dropped. The URL is a
 * placeholder: the check ignores the request-url candidate.
 */
export function buildHandshakeOriginRequest(handshake: unknown, origin: string | null): Request {
  const record =
    handshake && typeof handshake === "object" && !Array.isArray(handshake)
      ? (handshake as Record<string, unknown>)
      : {};
  const headers = new Headers();
  for (const name of WS_HANDSHAKE_ORIGIN_HEADERS) {
    const value = record[name];
    if (typeof value === "string") headers.set(name, value);
  }
  if (origin !== null) headers.set("origin", origin);
  const scheme = process.env.OMNIROUTE_INTERNAL_SCHEME === "https" ? "https" : "http";
  return new Request(`${scheme}://omniroute.invalid/`, { headers });
}
