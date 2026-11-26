import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Task 7 consumer guard: the retained inference path must not keep a pending
 * webhook/gamification notification after the G7 surface is deleted. Internal
 * event-bus alerts and audit rows stay — only the outbound notification calls go.
 */
function source(relativePath: string): string {
  return readFileSync(new URL("../../" + relativePath, import.meta.url), "utf8");
}

const WEBHOOK_IMPORT = /webhookDispatcher|notifyWebhookEvent|dispatchEvent/;
const GAMIFICATION_IMPORT = /gamification|emitRequestGamificationEvent/;

test("retained request-path consumers no longer import the removed webhook dispatcher", () => {
  const files = [
    "src/sse/services/auth.ts",
    "src/lib/usage/bankedResetAudit.ts",
    "src/lib/quota/enforce.ts",
    "src/lib/proxyEvents/proxyTransitionBridge.ts",
    "open-sse/services/combo/executeTargetAttempt.ts",
    "open-sse/services/combo/comboAttemptLoop.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(source(file), WEBHOOK_IMPORT, `${file} still imports a webhook sink`);
  }
});

test("retained request-path consumers no longer emit gamification events", () => {
  const files = [
    "open-sse/handlers/chatCore.ts",
    "open-sse/handlers/chatCore/nonStreamingResponse.ts",
    "open-sse/handlers/chatCore/streamingTail.ts",
    "src/lib/radar/intelSync.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(source(file), GAMIFICATION_IMPORT, `${file} still emits gamification`);
  }
});

test("retained proxy bridge still emits its internal event-bus alerts", () => {
  const bridge = source("src/lib/proxyEvents/proxyTransitionBridge.ts");
  assert.match(bridge, /emit\("proxy\.set_aside", payload\)/);
  assert.match(bridge, /emit\("proxy\.pool\.exhausted", event\)/);
});

test("shared config no longer exports webhook or evals surface symbols", () => {
  assert.doesNotMatch(source("src/shared/constants/formLimits.ts"), /WEBHOOK_/);
  assert.doesNotMatch(
    source("src/shared/validation/schemas.ts"),
    /schemas\/evals|evalSuite(Save|Draft)Schema/
  );
  assert.doesNotMatch(source("src/shared/network/outboundUrlGuardPolicy.ts"), /Webhook/);
});

test("analytics shell no longer renders the evals tab", () => {
  const page = source("src/app/(dashboard)/dashboard/analytics/page.tsx");
  assert.doesNotMatch(page, /EvalsTab|"evals"|analyticsEvals/);
});
