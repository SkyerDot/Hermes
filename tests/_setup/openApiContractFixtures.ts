/**
 * Retained contract fixtures for tests that used to import the retired
 * retired src/lib/agentSkills generator/parser. These are deliberately small and local
 * to tests: they pin the published OpenAPI/curl examples without reintroducing
 * a generator surface in Hermes.
 */

import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";

const BASE_URL = "http://localhost:20128";
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

interface OperationFixture {
  method: string;
  path: string;
}

/** Parses docs/openapi.yaml into the "METHOD /path" → summary map the tests need. */
export function parseOpenapiPaths(): Map<string, string> {
  const document = yaml.load(readFileSync("docs/openapi.yaml", "utf8")) as {
    paths?: Record<
      string,
      Record<string, { summary?: unknown; "x-agent-skill-excluded"?: unknown } | undefined>
    >;
  } | null;

  if (!document || typeof document !== "object") {
    throw new Error("openApiContractFixtures: parsed OpenAPI document is not an object");
  }

  const paths = new Map<string, string>();
  for (const [urlPath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = pathItem?.[method];
      if (!operation || operation["x-agent-skill-excluded"] === true) continue;
      paths.set(
        `${method.toUpperCase()} ${urlPath}`,
        typeof operation.summary === "string" ? operation.summary : ""
      );
    }
  }
  return paths;
}

/** Minimal replacement for the retired example builder, covering the tested routes. */
export function buildApiOperationExample(operation: OperationFixture): string[] {
  const { method, path } = operation;

  if (path === "/api/keys/import" && method === "POST") {
    return [
      ': "${IMPORTED_API_KEY:?Set the caller-supplied sk- key to import}"',
      `curl -X POST ${BASE_URL}${path} \\`,
      '  -H "Authorization: Bearer <YOUR_TOKEN>" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d "{\\"name\\":\\"Imported key\\",\\"key\\":\\"$IMPORTED_API_KEY\\"}"',
    ];
  }

  if (path === "/api/keys/{id}/self-service" && method === "PUT") {
    return [
      `curl -X PUT ${BASE_URL}${path} \\`,
      '  -H "Authorization: Bearer $OMNIROUTE_TOKEN" \\',
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"anthropicRateLimitHeaders":"auto"}\'',
    ];
  }

  if (path === "/api/v1/video-bridge/drilldown" && ["GET", "DELETE"].includes(method)) {
    const curlMethod = method === "GET" ? "" : `-X ${method} `;
    return [
      "# Set OMNIROUTE_VIDEO_HANDLE to one handle from the chat response's",
      "# x-omniroute-video-drilldown header, obtained with the same API key.",
      `curl --get ${curlMethod}${BASE_URL}${path} \\`,
      '  -H "Authorization: Bearer $OMNIROUTE_TOKEN" \\',
      '  --data-urlencode "handle=$OMNIROUTE_VIDEO_HANDLE"',
    ];
  }

  const curlMethod = method === "GET" ? "" : `-X ${method} `;
  return [
    `curl ${curlMethod}${BASE_URL}${path} \\`,
    '  -H "Authorization: Bearer $OMNIROUTE_TOKEN"',
  ];
}
