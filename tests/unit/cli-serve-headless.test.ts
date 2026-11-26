/**
 * R0.1 headless mode (rail 3.8.53): `omniroute serve --headless` must hand the
 * server process `OMNIROUTE_HEADLESS=1`, the same way `--port` reaches it
 * through the child env built in bin/gateway-serve.mjs.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyHeadlessServeEnv, resolveServeHeadless } from "../../bin/gateway.mjs";

const GATEWAY_SOURCE = fs.readFileSync(
  path.resolve(import.meta.dirname, "../../bin/gateway-serve.mjs"),
  "utf8"
);

test("serve --headless: the gateway propagates the flag to the child env", () => {
  assert.match(GATEWAY_SOURCE, /--headless/);
  assert.match(GATEWAY_SOURCE, /OMNIROUTE_HEADLESS/);
});

test("applyHeadlessServeEnv: --headless sets OMNIROUTE_HEADLESS=1 on the child env", () => {
  const env = { PORT: "20128", PATH: "/usr/bin" };
  const out = applyHeadlessServeEnv(env, { headless: true });
  assert.equal(out.OMNIROUTE_HEADLESS, "1");
  assert.equal(out.PORT, "20128");
  assert.equal(env.OMNIROUTE_HEADLESS, undefined, "input env must not be mutated");
});

test("applyHeadlessServeEnv: without --headless the env is passed through unchanged", () => {
  const env = { PORT: "20128" };
  assert.deepEqual(applyHeadlessServeEnv(env, {}), env);
  // An operator-exported OMNIROUTE_HEADLESS still reaches the child untouched.
  assert.equal(
    applyHeadlessServeEnv({ OMNIROUTE_HEADLESS: "true" }, {}).OMNIROUTE_HEADLESS,
    "true"
  );
});

test("runServe builds the child env through applyHeadlessServeEnv", () => {
  assert.match(GATEWAY_SOURCE, /const env = applyHeadlessServeEnv\(\s*\{/);
});

test("resolveServeHeadless: flag or truthy env var", () => {
  assert.equal(resolveServeHeadless({ headless: true }, {}), true);
  assert.equal(resolveServeHeadless({}, { OMNIROUTE_HEADLESS: "1" }), true);
  assert.equal(resolveServeHeadless({}, { OMNIROUTE_HEADLESS: "on" }), true);
  assert.equal(resolveServeHeadless({}, { OMNIROUTE_HEADLESS: "0" }), false);
  assert.equal(resolveServeHeadless({}, {}), false);
});
