/**
 * chatCore plugin onRequest compatibility seam.
 *
 * The plugin/marketplace runtime was removed (Task 8). The seam stays so the
 * handler's fail-open contract and call signature are unchanged: requests are
 * never blocked or rewritten by a hook.
 */

type LoggerLike =
  { info?: (...args: unknown[]) => void; debug?: (...args: unknown[]) => void } | null | undefined;

export type PluginOnRequestGate =
  { blocked: true; response: Response } | { blocked: false; body?: unknown };

export async function runPluginOnRequestHook(args: {
  requestId: string;
  body: unknown;
  model: string | null | undefined;
  provider: string | null | undefined;
  apiKeyInfo: unknown;
  headers?: Record<string, string | string[] | undefined>;
  log?: LoggerLike;
}): Promise<PluginOnRequestGate> {
  void args;
  return { blocked: false };
}
