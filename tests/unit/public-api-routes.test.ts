import test from "node:test";
import assert from "node:assert/strict";

import { isPublicApiRoute } from "../../src/shared/constants/publicApiRoutes.ts";

test("isPublicApiRoute allows public management prefixes", () => {
  assert.equal(isPublicApiRoute("/api/auth/login"), true);
  assert.equal(isPublicApiRoute("/api/v1/chat/completions"), true);
  assert.equal(isPublicApiRoute("/api/oauth/cursor/callback"), true);
});

test("isPublicApiRoute no longer exposes the removed cloud routes", () => {
  for (const [path, method] of [
    ["/api/cloud/auth", "POST"],
    ["/api/cloud/model/resolve", "POST"],
    ["/api/cloud/models/alias", "GET"],
    ["/api/cloud/credentials/update", "PUT"],
    ["/api/cloud/models/alias", "PUT"],
    ["/api/cloud/unknown", "GET"],
  ] as const) {
    assert.equal(isPublicApiRoute(path, method), false, `${method} ${path} must not be public`);
  }
});

test("isPublicApiRoute allows readonly health and require-login bootstrap routes", () => {
  assert.equal(isPublicApiRoute("/api/health/ping", "GET"), true);
  assert.equal(isPublicApiRoute("/api/health/ping", "HEAD"), true);
  assert.equal(isPublicApiRoute("/api/health/ping", "OPTIONS"), true);
  assert.equal(isPublicApiRoute("/api/health/ping", "DELETE"), false);

  assert.equal(isPublicApiRoute("/api/monitoring/health", "GET"), true);
  assert.equal(isPublicApiRoute("/api/monitoring/health", "HEAD"), true);
  assert.equal(isPublicApiRoute("/api/monitoring/health", "OPTIONS"), true);
  assert.equal(isPublicApiRoute("/api/monitoring/health", "DELETE"), false);

  assert.equal(isPublicApiRoute("/api/settings/require-login", "GET"), true);
  assert.equal(isPublicApiRoute("/api/settings/require-login", "HEAD"), true);
  assert.equal(isPublicApiRoute("/api/settings/require-login", "OPTIONS"), true);
  assert.equal(isPublicApiRoute("/api/settings/require-login", "POST"), false);
});

test("isPublicApiRoute rejects non-public management routes", () => {
  assert.equal(isPublicApiRoute("/api/settings"), false);
  assert.equal(isPublicApiRoute("/api/providers"), false);
});

test("isPublicApiRoute allows /api/usage/om-usage (handler enforces its own API key auth)", () => {
  assert.equal(isPublicApiRoute("/api/usage/om-usage"), true);
  assert.equal(isPublicApiRoute("/api/usage/om-usage", "GET"), true);
  assert.equal(isPublicApiRoute("/api/usage/om-usage", "OPTIONS"), true);
});
test("isPublicApiRoute allows OIDC dashboard login routes (auth gate replacement)", () => {
  assert.equal(isPublicApiRoute("/api/auth/oidc/login"), true);
  assert.equal(isPublicApiRoute("/api/auth/oidc/callback"), true);
  assert.equal(isPublicApiRoute("/api/auth/oidc/login", "GET"), true);
  assert.equal(isPublicApiRoute("/api/auth/oidc/callback", "GET"), true);
  // The prefix is in PUBLIC_API_ROUTE_PREFIXES, so all methods on the subtree are public (the handlers decide what they accept).
  // This mirrors how /api/auth/login works.
  assert.equal(isPublicApiRoute("/api/auth/oidc/callback", "POST"), true);
});
