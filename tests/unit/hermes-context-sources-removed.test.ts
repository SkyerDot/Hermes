import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Task 6 boundary guard: Notion / Obsidian / local-corpus are context sources and
 * must not exist in Hermes. The retained `notion-web` inference provider, its
 * services, and the `/api/context/**` compression routes are a different surface
 * and must stay.
 */

function source(relativePath: string): string {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function exists(relativePath: string): boolean {
  return fs.existsSync(new URL(`../../${relativePath}`, import.meta.url));
}

const REMOVED_FILES = [
  "src/lib/notion/api.ts",
  "src/lib/obsidian/api.ts",
  "src/lib/localCorpus/index.ts",
  "src/lib/localCorpus/configured.ts",
  "src/lib/db/localCorpus.ts",
  "src/lib/db/notion.ts",
  "src/lib/db/obsidian.ts",
  "src/lib/obsidianSync.ts",
  "src/lib/memory/obsidianBackend.ts",
  "src/app/api/settings/notion/route.ts",
  "src/app/api/settings/obsidian/route.ts",
  "src/app/api/settings/obsidian/webdav/route.ts",
  "src/app/api/settings/local-corpus/route.ts",
  "src/app/(dashboard)/dashboard/endpoint/components/NotionSourceCard.tsx",
  "src/app/(dashboard)/dashboard/endpoint/components/ObsidianSourceCard.tsx",
];

const RETAINED_FILES = [
  "open-sse/executors/notion-web.ts",
  "open-sse/config/providers/registry/notion-web/index.ts",
  "open-sse/services/notionTlsClient.ts",
  "open-sse/services/notionStreamParser.ts",
  "open-sse/services/notionTranscriptBuilder.ts",
  "open-sse/services/notionWebModels.ts",
  "open-sse/services/notionWebFallbackModels.ts",
  "open-sse/services/notionThreadSessions.ts",
  "tests/unit/sanitize-notion-assistant-text.test.ts",
  "tests/unit/executor-notion-web.test.ts",
  "tests/unit/executor-notion-web-thread-sessions.test.ts",
  "tests/unit/compression/eval-corpus.test.ts",
  "tests/unit/compression/eval-seed-corpus.test.ts",
  "tests/unit/heap-benchmark-corpus.test.ts",
];

test("context source modules, routes and cards no longer exist", () => {
  for (const relativePath of REMOVED_FILES) {
    assert.ok(!exists(relativePath), `${relativePath} must be removed`);
  }
});

test("no orphan context-source route classification or endpoint tab", () => {
  assert.ok(
    !source("src/server/authz/routeGuard.ts").includes('"/api/settings/obsidian"'),
    "routeGuard must not keep an /api/settings/obsidian entry after the route is gone"
  );
  const endpointPage = source("src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.tsx");
  for (const stale of ["context-sources", "NotionSourceCard", "ObsidianSourceCard"]) {
    assert.ok(!endpointPage.includes(stale), `endpoint page must not reference ${stale}`);
  }
});

test("notion-web inference provider and context compression stay", () => {
  for (const relativePath of RETAINED_FILES) {
    assert.ok(exists(relativePath), `${relativePath} is a retained surface`);
  }
  const contextRoutes = fs.readdirSync(new URL("../../src/app/api/context", import.meta.url), {
    withFileTypes: true,
  });
  const routeFiles: string[] = [];
  function collect(directory: URL): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = new URL(`${entry.name}/`, directory);
      if (entry.isDirectory()) collect(child);
      else if (entry.name === "route.ts") routeFiles.push(child.pathname);
    }
  }
  collect(new URL("../../src/app/api/context/", import.meta.url));
  assert.equal(routeFiles.length, 14, `${contextRoutes.length} dirs; all 14 context routes stay`);
});
