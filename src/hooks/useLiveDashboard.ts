/**
 * useLiveDashboard — React hooks for real-time dashboard WebSocket (stub)
 *
 * The live dashboard WebSocket server and handshake endpoint have been removed.
 * These hooks are kept as no-op stubs so dashboard components that import them
 * continue to compile and render without live data.
 *
 * Usage:
 *   const { requests, isConnected } = useLiveRequests();
 *   const { comboEvents, lastComboEvent } = useLiveComboStatus();
 */

"use client";

import { useState, useCallback } from "react";
import type { DashboardChannel } from "@/lib/events/types";

// ── Types ─────────────────────────────────────────────────────────────────

export interface WsEventPayload {
  event: string;
  channel: DashboardChannel;
  data: unknown;
  timestamp: number;
}

export interface DashboardConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempt: number;
}

export interface UseLiveDashboardOptions {
  /** Whether the WebSocket connection should be active (default: false — feature removed) */
  enabled?: boolean;
  /** Channels to subscribe to (ignored) */
  channels?: DashboardChannel[];
  /** Event callback (never called) */
  onEvent?: (payload: WsEventPayload) => void;
}

/**
 * Core WebSocket connection hook — stub that returns disconnected state.
 * The live dashboard WebSocket feature has been removed.
 */
export function useLiveDashboard({
  enabled: _enabled,
  channels: _channels,
  onEvent: _onEvent,
}: UseLiveDashboardOptions = {}) {
  const [connection] = useState<DashboardConnectionState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempt: 0,
  });

  const [events] = useState<WsEventPayload[]>([]);

  const reconnect = useCallback(() => {
    // No-op: live WS feature removed
  }, []);

  return {
    connection,
    events,
    reconnect,
    /** Filter events by channel */
    getEventsByChannel: useCallback(
      (channel: DashboardChannel) => events.filter((e) => e.channel === channel),
      [events]
    ),
    /** Filter events by name */
    getEventsByName: useCallback(
      (eventName: string) => events.filter((e) => e.event === eventName),
      [events]
    ),
    /** Clear event history */
    clearEvents: useCallback(() => {}, []),
  };
}

// ── Request Monitoring Hook ───────────────────────────────────────────────

export interface LiveRequest {
  id: string;
  model: string;
  provider: string;
  timestamp: number;
  status: "pending" | "running" | "success" | "error";
  tokensInput?: number;
  tokensOutput?: number;
  latencyMs?: number;
  error?: string;
  comboName?: string;
}

/**
 * Hook for monitoring live requests — stub that returns empty data.
 * The live dashboard WebSocket feature has been removed.
 */
export function useLiveRequests(_options?: UseLiveDashboardOptions) {
  const [requestState] = useState<{
    active: Map<string, LiveRequest>;
    completed: LiveRequest[];
  }>({
    active: new Map(),
    completed: [],
  });

  const reconnect = useCallback(() => {
    // No-op: live WS feature removed
  }, []);

  return {
    activeRequests: Array.from(requestState.active.values()),
    completedRequests: requestState.completed,
    activeCount: requestState.active.size,
    isConnected: false,
    reconnect,
  };
}

// ── Combo Status Hook ─────────────────────────────────────────────────────

export interface LiveComboEvent {
  comboName: string;
  targetIndex: number;
  provider: string;
  model: string;
  type: "attempt" | "succeeded" | "failed";
  /** Routing strategy, carried on the attempt payload (used by the Combo Studio). */
  strategy?: string;
  latencyMs?: number;
  error?: string;
  timestamp: number;
  /** The account that served or attempted this target, when known. */
  connectionId?: string;
}

/**
 * Map one `combo` channel WS frame to the event the Combo Studio reducer consumes.
 * Returns null for any other event.
 */
export function toLiveComboEvent(_event: WsEventPayload): LiveComboEvent | null {
  return null;
}

/**
 * Hook for monitoring live combo cascade status — stub that returns empty data.
 * The live dashboard WebSocket feature has been removed.
 */
export function useLiveComboStatus(_options?: UseLiveDashboardOptions) {
  const [comboEvents] = useState<LiveComboEvent[]>([]);

  const reconnect = useCallback(() => {
    // No-op: live WS feature removed
  }, []);

  /** Get events for a specific combo */
  const getComboHistory = useCallback(
    (comboName: string) => comboEvents.filter((e) => e.comboName === comboName),
    [comboEvents]
  );

  /** Get the last event for a specific combo */
  const getLastComboEvent = useCallback(
    (comboName: string) => comboEvents.find((e) => e.comboName === comboName),
    [comboEvents]
  );

  return {
    comboEvents,
    activeCombos: new Set(comboEvents.map((e) => e.comboName)),
    isConnected: false,
    getComboHistory,
    getLastComboEvent,
    reconnect,
  };
}

// ── Connection Status Hook ────────────────────────────────────────────────

/**
 * Hook for checking connection status only (no events) — stub.
 * The live dashboard WebSocket feature has been removed.
 */
export function useLiveConnectionStatus(_options?: UseLiveDashboardOptions) {
  return {
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempt: 0,
    reconnect: () => {},
  };
}
