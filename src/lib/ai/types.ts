import type { Effort } from "../types";

export interface CompletionRequest {
  system: string;
  user: string;
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
