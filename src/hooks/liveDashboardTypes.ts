/**
 * Live Dashboard types — kept after removing the WebSocket hooks.
 * The live WS feature has been removed; these types are retained for
 * components that need them until Task 12.
 */

export interface WsEventPayload {
  event: string;
  channel: string;
  data: unknown;
  timestamp: number;
}

export interface DashboardConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempt: number;
}

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
