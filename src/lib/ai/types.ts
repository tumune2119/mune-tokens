import type { Effort } from "../types";

/** An image or PDF sent alongside the prompt (base64, no data: prefix). */
export interface MediaPart {
  name: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf";
  data: string;
}

export interface CompletionRequest {
  system: string;
  user: string;
  media?: MediaPart[];
  model: string;
  effort: Effort;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** API: computed from list prices. CLI: Claude Code's own figure (API-equivalent; subscriptions aren't billed per call). */
  costUsd: number;
}

export interface CompletionResult {
  text: string;
  usage: TokenUsage;
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

/** Anthropic content blocks: media first, then the text prompt (works for the API and the CLI's stream-json input). */
export function contentBlocks(user: string, media: MediaPart[] = []) {
  return [
    ...media.map((m) =>
      m.mediaType === "application/pdf"
        ? { type: "document" as const, source: { type: "base64" as const, media_type: m.mediaType, data: m.data }, title: m.name }
        : { type: "image" as const, source: { type: "base64" as const, media_type: m.mediaType, data: m.data } },
    ),
    { type: "text" as const, text: user },
  ];
}
