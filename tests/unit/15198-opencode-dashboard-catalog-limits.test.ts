import test from "node:test";
import assert from "node:assert/strict";

const { buildOpenCodeProviderConfig, buildOpenCodeConfigDocument } =
  await import("../../src/shared/services/opencodeConfig.ts");

const KNOWN = {
  id: "cx/known-model",
  context_length: 200_000,
  max_output_tokens: 32_000,
  capabilities: { reasoning: true },
};

test("dashboard writer copies a known catalog limit and capability (#15198)", () => {
  const config = buildOpenCodeProviderConfig({
    baseUrl: "http://localhost:20128/v1",
    apiKey: "sk_test",
    models: [KNOWN.id, "unknown/model"],
    catalog: [KNOWN],
  });

  const known = config.models[KNOWN.id];
  assert.equal(known.limit.context, 200_000);
  assert.equal(known.limit.output, 32_000);
  assert.equal(known.reasoning, true);
  assert.notEqual(known.limit.context, 128_000);
  assert.notEqual(known.limit.output, 8_192);

  const unknown = config.models["unknown/model"];
  assert.equal(unknown.limit.context, 128_000);
  assert.equal(unknown.limit.output, 8_192);
  assert.equal(unknown.reasoning, undefined);
});

test("OpenCode config document uses the supplied catalog and falls back when absent (#15406)", () => {
  // Base URL, key, selected models, labels, and the /v1/models catalog.
  const doc = buildOpenCodeConfigDocument({
    baseUrl: "http://localhost:20128/v1",
    apiKey: "sk_test",
    models: [KNOWN.id, "unknown/model"],
    model: KNOWN.id,
    modelLabels: { [KNOWN.id]: "Known model" },
    catalog: [KNOWN],
  });

  const knownV1 = doc.provider.omniroute.models[KNOWN.id];
  const knownV2 = doc.providers.omniroute.models[KNOWN.id];
  assert.equal(knownV1.limit.context, 200_000);
  assert.equal(knownV1.limit.output, 32_000);
  assert.notEqual(knownV1.limit.context, 128_000);
  assert.notEqual(knownV1.limit.output, 8_192);
  assert.equal(knownV2.limit.context, 200_000);
  assert.equal(knownV2.limit.output, 32_000);

  const unknownV1 = doc.provider.omniroute.models["unknown/model"];
  const unknownV2 = doc.providers.omniroute.models["unknown/model"];
  assert.equal(unknownV1.limit.context, 128_000);
  assert.equal(unknownV1.limit.output, 8_192);
  assert.equal(unknownV1.reasoning, undefined);
  assert.equal(unknownV2.limit.context, 128_000);
  assert.equal(unknownV2.limit.output, 8_192);
});
