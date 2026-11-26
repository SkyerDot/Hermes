---
title: "Evaluations (Evals)"
version: 3.8.40
lastUpdated: 2026-06-28
---

# Evaluations (Evals)

> **Historical reference.** The Hermes inference-scope prune removed the eval
> runtime and its management/dashboard surfaces. The document is retained for
> operators reading older run records; the SQLite persistence layer is the only
> part that still exists in this tree.
>
> **Source of truth:** `src/lib/db/evals.ts`
> **Last updated:** 2026-06-28 — v3.8.40

OmniRoute shipped a generic evaluation framework for benchmarking routing
configurations, single providers/models, or the bundled "golden set" suites.

The framework was implemented as:

- A persistence layer (`src/lib/db/evals.ts`) for custom (user-defined) suites
  and historical runs in SQLite.
- A dashboard surface at `Dashboard → Usage → Evals` (`EvalsTab.tsx`), now removed.

## Concepts

### Suite

A suite was a named collection of test cases with a `description` and one or
more cases. Suites came from two sources:

| Source     | Where defined                                 | Mutability                       |
| ---------- | --------------------------------------------- | -------------------------------- |
| `built-in` | Was registered at boot by the removed runner  | Was code-defined                 |
| `custom`   | Stored in SQLite `eval_suites` + `eval_cases` | Formerly editable via the UI/API |

- `golden-set` — 10 baseline cases across greeting/math/translation/safety
- `coding-proficiency` — Python/JS/SQL/TS/bug detection
- `reasoning-logic` — syllogisms, word problems, pattern recognition
- `multilingual` — translation and language detection
- `safety-guardrails` — PII, jailbreak, refusal, bias awareness
- `instruction-following` — JSON-only, numbered lists, language constraints
- `codex-comparison` — head-to-head coding tasks intended for compare mode

### Case

Each case carried:

| Field      | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| `id`       | Stable identifier (used to key outputs and metrics)          |
| `name`     | Human-readable label                                         |
| `model`    | Default model when the run uses `suite-default` targeting    |
| `input`    | `{ messages, max_tokens? }` — sent to `/v1/chat/completions` |
| `expected` | `{ strategy, value }` — scoring rubric (see below)           |
| `tags`     | Optional labels (e.g. `safety`, `pii`, `jailbreak`)          |

### Target

The same suite could be run against different targets. The historical target
schema (`evalTargetSchema`, removed with the runtime) was:

| Target type     | `id`       | Behavior                                                        |
| --------------- | ---------- | --------------------------------------------------------------- |
| `suite-default` | `null`     | Each case uses its built-in `model` field                       |
| `model`         | model name | Force every case through one direct model (e.g. `gpt-4o`)       |
| `combo`         | combo name | Run every case through one combo (exercises the routing engine) |

For `model` and `combo`, the `id` field was required (enforced by Zod
`superRefine`). When `compareTarget` was provided, both targets had to differ —
the runner persisted both runs under the same `runGroupId` for A/B comparison.

## Scoring Rubrics

Was implemented in `evaluateCase()` in the removed eval runner:

| Strategy   | Pass when…                                                           |
| ---------- | -------------------------------------------------------------------- |
| `exact`    | `actualOutput === expected.value`                                    |
| `contains` | `actualOutput.toLowerCase().includes(expected.value.toLowerCase())`  |
| `regex`    | `new RegExp(expected.value).test(actualOutput)` is truthy            |
| `custom`   | `expected.fn(actualOutput, evalCase)` returns truthy (built-in only) |

**Note:** Custom-function scoring was reserved for code-defined (built-in)
suites because functions could not be serialized through the retired API. The
`evalCaseBuilderSchema` only accepted `contains | exact | regex` for
user-created suites.

There was no LLM-as-judge or embedding-based similarity scorer.

## Database Schema

Three tables (migrations `030_create_eval_runs.sql` and
`031_create_eval_suites.sql`):

| Table         | Purpose                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `eval_suites` | Custom suite metadata (`id`, `name`, `description`)                                                                          |
| `eval_cases`  | Cases per suite — `input_json`, `expected_*`, `tags_json`                                                                    |
| `eval_runs`   | Historical runs — `pass_rate`, `total`, `passed`, `failed`, `avg_latency_ms`, `summary_json`, `results_json`, `outputs_json` |

Built-in suites were **not** stored in the DB. They lived in memory and were
re-registered whenever the removed runner loaded.

## Dispatch Pipeline (historical)

1. Resolved the suite (built-in or custom).
2. For each case, built a `Request` to `/v1/chat/completions` with the case's
   `messages`, the resolved `model`, `stream: false`, and `max_tokens: 512`
   (or the case override).
3. Called the chat handler directly (in-process — no extra HTTP hop).
4. Captured latency and extracted text from either `choices[0].message.content`
   or the Responses-API `output[]` payload.
5. Scored all outputs via `runSuite()`, then persisted via `saveEvalRun()`.

Cases ran **sequentially**; no concurrency flag existed.

## Dashboard (removed)

The UI was at `Dashboard → Usage → Evals` (`EvalsTab.tsx`). It allowed operators
to:

- Browse built-in and custom suites with case-by-case preview.
- Create/edit/delete custom suites with the case builder.
- Pick a target (suite defaults / model / combo), optionally a second
  `compareTarget`, optionally an API key, then run on demand.
- Inspect run history, per-case pass/fail, latency, and captured outputs.
- See the rolling scorecard aggregated across the latest run per
  `(suite, target)` scope.

That page and its management API were removed with the eval runtime.

## Relationship with the Auto-Assessment RFC

A separate, narrower assessment subsystem lives at `src/domain/assessment/`
(see also [AUTO-COMBO.md](../routing/AUTO-COMBO.md) for the live scoring engine).
That subsystem targets the Auto Combo engine — automatically scoring providers and
models so combos can self-heal when upstreams fail. It uses its own runner,
its own categorizer, and its own scoring logic.

The Evals framework documented here was the **broader, general-purpose testing
surface**, used for arbitrary regression suites, A/B comparisons and per-release
smoke tests. It has been removed; the Auto-Assessment subsystem remains the
live mechanism for real-time provider health that influences routing decisions.

## CI Integration (historical)

No dedicated `eval:ci` script existed, and no CI path survives the prune. The
former in-process pattern imported `runEvalSuiteAgainstTarget()` from the now
removed `@/lib/evals/runtime`, ran it against a test DB and checked the returned
`PersistedEvalRun.summary`.

## See Also

- [USER_GUIDE.md](../guides/USER_GUIDE.md) — overall product walkthrough
- [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — request pipeline reference
- [AUTO-COMBO.md](../routing/AUTO-COMBO.md) — Auto Combo scoring engine (live runtime)
- Surviving source: `src/lib/db/evals.ts` (runtime, API and `EvalsTab.tsx` removed)
