/**
 * chatCore plugin onResponse/onStreamComplete compatibility seams.
 *
 * The plugin runtime was removed (Task 8). These hooks stay no-ops so the
 * handler's fire-and-forget call sites and payload contracts are unchanged.
 */

/** Payload passed to plugin onResponse hooks from chatCore success paths. */
export type PluginOnResponsePayload = {
  status: number;
  /** Client-facing JSON body (non-streaming only). */
  data?: unknown;
  /** True when the handler returns an SSE stream whose body is not yet available. */
  streamed?: boolean;
};

export async function runPluginOnResponseHook(args: {
  requestId: string;
  body: unknown;
  model: string | null | undefined;
  provider: string | null | undefined;
  apiKeyInfo: unknown;
  headers?: Record<string, string | string[] | undefined>;
  response: PluginOnResponsePayload;
}): Promise<void> {
  void args;
}

/** Payload passed to plugin onStreamComplete hooks after a streaming response is consumed. */
export type PluginOnStreamCompletePayload = {
  status: number;
  requestId?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  timing?: {
    latencyMs: number;
    ttft?: number;
  };
  model?: string;
  provider?: string;
  errorCode?: string;
};

export async function runPluginOnStreamCompleteHook(args: {
  status: number;
  usage?: Record<string, unknown>;
  ttft?: number;
  model: string | null | undefined;
  provider: string | null | undefined;
  errorCode?: string | null | undefined;
  startTime: number;
  requestId?: string;
}): Promise<void> {
  void args;
}
