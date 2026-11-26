#!/usr/bin/env node
/**
 * Post-install hook retained for the published package contract.
 *
 * The old CLI runtime warm-up was removed with the operation CLI. Native
 * SQLite resolution now happens lazily on first database access, and the main
 * `scripts/build/postinstall.mjs` hook still handles binary preparation.
 */

if (
  process.env.OMNIROUTE_SKIP_POSTINSTALL === "1" ||
  process.env.CI === "true" ||
  process.env.CI === "1"
) {
  process.exit(0);
}
