/**
 * Optional OpenChamber bridge for the Hermes inference pipeline.
 *
 * Hermes no longer owns a skills/memory surface. When an operator explicitly
 * configures OMNIROUTE_OPENCHAMBER_BRIDGE_URL, the retained pipeline consumers
 * ask OpenChamber for injection data and fact extraction over HTTP. With no
 * URL configured (the default) every export is a contract-preserving no-op:
 * no network call, no body change, no durable state.
 */

import { z } from "zod";
import { sanitizeErrorMessage } from "../utils/error.ts";

const injectionRequestSchema = z.object({
  body: z.record(z.string(), z.unknown()),
  memoryOwnerId: z.string(),
  provider: z.string(),
  model: z.string(),
  sourceFormat: z.string(),
  targetFormat: z.string(),
  backgroundReason: z.string().nullable(),
});

const injectionResponseSchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
  injectedTools: z.array(z.unknown()).optional(),
  memorySettings: z
    .object({
      enabled: z.boolean(),
      skillsEnabled: z.boolean(),
      maxTokens: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  builtinToolNames: z.array(z.string()).optional(),
  injectedCustomSkillNames: z.array(z.string()).optional(),
});

const memoryTextResponseSchema = z.object({
  text: z.string().optional(),
  memories: z.array(z.object({ content: z.string() })).optional(),
});

const factRequestSchema = z.object({
  text: z.string().min(1),
  memoryOwnerId: z.string(),
  sessionId: z.string(),
});

type InjectionRequest = z.infer<typeof injectionRequestSchema>;

export interface OpenChamberInjection {
  body?: Record<string, unknown>;
  injectedTools?: unknown[];
  memorySettings?: { enabled: boolean; skillsEnabled: boolean; maxTokens: number } | null;
  builtinToolNames?: string[];
  injectedCustomSkillNames?: string[];
}

function bridgeUrl(): string | null {
  const raw = process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function bridgeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.OMNIROUTE_OPENCHAMBER_BRIDGE_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function warn(message: string, error: unknown): void {
  process.emitWarning(`${message}: ${sanitizeErrorMessage(error)}`, {
    code: "OMNIROUTE_OPENCHAMBER_BRIDGE",
  });
}

export function isOpenChamberBridgeEnabled(): boolean {
  return bridgeUrl() !== null;
}

export async function requestOpenChamberInjection(
  input: InjectionRequest
): Promise<OpenChamberInjection | null> {
  const base = bridgeUrl();
  if (!base) return null;

  const parsedRequest = injectionRequestSchema.safeParse(input);
  if (!parsedRequest.success) return null;

  try {
    const response = await fetch(`${base}/v1/inference/injection`, {
      method: "POST",
      headers: bridgeHeaders(),
      body: JSON.stringify(parsedRequest.data),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      warn("OpenChamber injection bridge returned a non-OK status", response.status);
      return null;
    }
    const parsed = injectionResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      warn("OpenChamber injection bridge returned an invalid payload", parsed.error);
      return null;
    }
    return parsed.data;
  } catch (error) {
    warn("OpenChamber injection bridge failed", error);
    return null;
  }
}

export async function retrieveOpenChamberMemoryText(
  memoryOwnerId: string,
  query: string
): Promise<string> {
  const base = bridgeUrl();
  if (!base || !memoryOwnerId || !query) return "";

  try {
    const url = new URL(`${base}/v1/inference/memory`);
    url.searchParams.set("owner", memoryOwnerId);
    url.searchParams.set("query", query);
    const response = await fetch(url, {
      method: "GET",
      headers: bridgeHeaders(),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      warn("OpenChamber memory bridge returned a non-OK status", response.status);
      return "";
    }
    const parsed = memoryTextResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      warn("OpenChamber memory bridge returned an invalid payload", parsed.error);
      return "";
    }
    if (parsed.data.text) return parsed.data.text;
    return (parsed.data.memories ?? [])
      .map((memory) => memory.content.trim())
      .filter(Boolean)
      .join("\n");
  } catch (error) {
    warn("OpenChamber memory bridge failed", error);
    return "";
  }
}

export async function extractFactsViaOpenChamber(
  text: string,
  memoryOwnerId: string,
  sessionId: string
): Promise<void> {
  const base = bridgeUrl();
  if (!base || !text || !memoryOwnerId) return;

  const parsedRequest = factRequestSchema.safeParse({ text, memoryOwnerId, sessionId });
  if (!parsedRequest.success) return;

  try {
    const response = await fetch(`${base}/v1/inference/memory/facts`, {
      method: "POST",
      headers: bridgeHeaders(),
      body: JSON.stringify(parsedRequest.data),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      warn("OpenChamber fact bridge returned a non-OK status", response.status);
    }
  } catch (error) {
    warn("OpenChamber fact bridge failed", error);
  }
}
