/** What one AI request used; sent with the final stream event. */
export interface UsageInfo {
  id: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  durationMs: number;
  attempts: number;
}

/** Events streamed (as NDJSON) from the /api/ai/* routes to the browser. */
export type AiEvent<T = unknown> =
  | { type: "meta"; label: string }
  | { type: "text"; text: string }
  | { type: "retry"; reason: string }
  | { type: "done"; data: T; usage: UsageInfo }
  | { type: "error"; message: string };
