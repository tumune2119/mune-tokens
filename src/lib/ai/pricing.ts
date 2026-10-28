import type { TokenUsage } from "./types";

/** USD per million tokens (Anthropic list prices). Cache writes use the 5-minute rate (1.25× input). */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

/** Returns null for models without a known price. */
export function estimateCostUsd(model: string, u: Omit<TokenUsage, "costUsd">): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead +
      u.cacheWriteTokens * p.input * 1.25) /
    1_000_000
  );
}
