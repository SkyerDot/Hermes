"use client";

import { useCallback, useState } from "react";
import {
  compressionEventToModel,
  stepEventsToRunModel,
  type CompressionRunModel,
  type InFlightCompressionRun,
} from "@/app/(dashboard)/dashboard/compression/studio/compressionFlowModel";
import type { CompressionCompletedPayload } from "@/lib/events/types";

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_RUNS = 100;

// ── Accumulator (pure reducer — exported for unit tests) ─────────────────

/**
 * Pure accumulator: prepend the new run and cap at `maxRuns`.
 * Most-recent-first order.
 */
export function accumulateRun(
  prev: CompressionRunModel[],
  payload: CompressionCompletedPayload,
  maxRuns = MAX_RUNS
): CompressionRunModel[] {
  const model = compressionEventToModel(payload);
  return [model, ...prev].slice(0, maxRuns);
}

// ── useLiveCompression hook ───────────────────────────────────────────────

export interface UseLiveCompressionReturn {
  /** All accumulated runs, most-recent-first. */
  runs: CompressionRunModel[];
  /** The most recently received run, or null. */
  lastRun: CompressionRunModel | null;
  /** Quick lookup by requestId. */
  getRunById: (requestId: string) => CompressionRunModel | undefined;
  isConnected: boolean;
  reconnect: () => void;
}

/**
 * Live WS removed; local empty state until Task 12.
 */
export function useLiveCompression(): UseLiveCompressionReturn {
  const [runs] = useState<CompressionRunModel[]>([]);
  const [inFlight] = useState<InFlightCompressionRun | null>(null);

  const getRunById = useCallback(
    (requestId: string) => runs.find((r) => r.requestId === requestId),
    [runs]
  );

  const inFlightRun =
    inFlight && inFlight.steps.length > 0 ? stepEventsToRunModel(inFlight.steps) : null;

  return {
    runs,
    // Prefer the live in-flight run so the studio shows engines as they stream in (F3.3),
    // falling back to the latest completed run.
    lastRun: inFlightRun ?? runs[0] ?? null,
    getRunById,
    isConnected: false,
    reconnect: () => {},
  };
}
