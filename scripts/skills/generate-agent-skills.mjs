#!/usr/bin/env node
/**
 * generate-agent-skills.mjs — retired generator adapter.
 *
 * Hermes no longer owns the agent-skills catalog or generator. The npm alias
 * (`check:agent-skills-sync`) and the release refresh keep calling this command,
 * so it stays as an explicit no-op with the same JSON report shape: no network,
 * no writes, no generated drift. The already-published SKILL.md files are
 * frozen generated artifacts and are not regenerated from this checkout.
 *
 * Usage:
 *   node scripts/skills/generate-agent-skills.mjs [--json] [legacy flags]
 *
 * Exit codes: 0 always (nothing is generated, so nothing can be stale).
 */

import process from "node:process";

const jsonOutput = process.argv.slice(2).includes("--json");

const report = Object.freeze({
  generated: [],
  unchanged: [],
  pruned: [],
  orphansDetected: [],
  errors: [],
});

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("[agent-skills-sync] generator retired in Hermes scope; no-op (0 generated).");
}

process.exit(0);
