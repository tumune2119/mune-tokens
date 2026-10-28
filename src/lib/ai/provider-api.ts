import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { estimateCostUsd } from "./pricing";
import type { CompletionRequest, CompletionResult } from "./types";

// Models that accept the server-side refusal fallback ("default" routing) on the Claude API.
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function hasApiKey() {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export async function completeWithApi(req: CompletionRequest): Promise<CompletionResult> {
  try {
    return await run(req, FALLBACK_MODELS.has(req.model));
  } catch (err) {
    // If the fallback beta is rejected for this account/model, retry once without it.
    if (err instanceof Anthropic.BadRequestError && FALLBACK_MODELS.has(req.model) && !req.signal?.aborted) {
      return run(req, false);
    }
    throw err;
  }
}

async function run(req: CompletionRequest, withFallback: boolean): Promise<CompletionResult> {
  const stream = getClient().beta.messages.stream(
    {
      model: req.model,
      max_tokens: 64000,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: { effort: req.effort },
      ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal: req.signal },
  );

  let text = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
      req.onText?.(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error(
      `Claude declined this request${final.stop_details?.explanation ? `: ${final.stop_details.explanation}` : "."}`,
    );
  }
  if (final.stop_reason === "max_tokens") {
    throw new Error("The response hit the output limit before finishing. Try a lower detail level or fewer items.");
  }
  const u = final.usage;
  const tokens = {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  // final.model is the model that actually answered (it differs if a refusal fallback ran).
  return { text, usage: { ...tokens, costUsd: estimateCostUsd(final.model, tokens) ?? 0 } };
}

export function describeApiError(err: unknown): string | null {
  if (err instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to that model.";
  if (err instanceof Anthropic.NotFoundError) return "Model not found. Check the model name in Settings.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the API. Wait a moment and try again.";
  if (err instanceof Anthropic.BadRequestError) return `The API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API. Check your internet connection.";
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ""}: ${err.message}`;
  return null;
}
