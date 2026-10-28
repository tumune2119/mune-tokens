import "server-only";
import type { z } from "zod";
import { getSettings } from "../settings";
import { extractJsonText, formatZodError } from "./json";
import { recordUsage, type UsageKind } from "../usage";
import { completeWithApi, describeApiError, hasApiKey } from "./provider-api";
import { completeWithCli, findClaudeCli } from "./provider-cli";
import { ZERO_USAGE, addUsage, type CompletionResult, type MediaPart, type TokenUsage } from "./types";

export interface ResolvedProvider {
  kind: "api" | "cli";
  model: string;
  label: string;
  run: (system: string, user: string, onText?: (d: string) => void, signal?: AbortSignal, media?: MediaPart[]) => Promise<CompletionResult>;
}

export async function resolveProvider(): Promise<ResolvedProvider> {
  const s = getSettings();
  const useApi = s.provider === "api" || (s.provider === "auto" && hasApiKey());

  if (useApi) {
    if (!hasApiKey()) {
      throw new Error("No API key found. Add ANTHROPIC_API_KEY to .env.local (then restart), or switch to Claude Code CLI in Settings.");
    }
    return {
      kind: "api",
      model: s.model,
      label: `API · ${s.model}`,
      run: (system, user, onText, signal, media) =>
        completeWithApi({ system, user, media, model: s.model, effort: s.effort, onText, signal }),
    };
  }

  const cli = await findClaudeCli(s.cliPath);
  if (!cli) {
    throw new Error(
      s.provider === "cli"
        ? "Claude Code CLI not found. Install it (or set its path in Settings)."
        : "No API key and no Claude Code CLI found. Add ANTHROPIC_API_KEY to .env.local, or install Claude Code.",
    );
  }
  return {
    kind: "cli",
    model: s.model,
    label: `Claude Code CLI · ${s.model}`,
    run: (system, user, onText, signal, media) =>
      completeWithCli({ system, user, media, model: s.model, effort: s.effort, onText, signal }, cli),
  };
}

/** What a call cost, sent back to the browser alongside the result. */
export interface UsageSummary extends TokenUsage {
  id: string;
  durationMs: number;
  attempts: number;
}

export interface UsageTag {
  kind: UsageKind;
  systemId?: string | null;
  systemName?: string | null;
}

export interface StructuredOptions<T> {
  system: string;
  user: string;
  /** Images/PDFs sent with every attempt. */
  media?: MediaPart[];
  schema: z.ZodType<T>;
  track: UsageTag;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  /** Called before the single retry, with a human-readable reason. */
  onRetry?: (reason: string) => void;
  provider?: ResolvedProvider;
}

function validate<T>(schema: z.ZodType<T>, text: string): { ok: true; data: T } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonText(text));
  } catch (e) {
    return { ok: false, reason: `Invalid JSON: ${(e as Error).message}` };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `JSON does not match the schema:\n${formatZodError(parsed.error)}` };
  return { ok: true, data: parsed.data };
}

/**
 * Asks Claude for JSON, validates it with Zod and retries once with the validation errors.
 * Every call (including failures) is written to the usage log.
 */
export async function generateStructured<T>(opts: StructuredOptions<T>): Promise<{ data: T; usage: UsageSummary }> {
  const provider = opts.provider ?? (await resolveProvider());
  const started = Date.now();
  let usage: TokenUsage = ZERO_USAGE;
  let attempts = 0;

  const attempt = async (user: string) => {
    attempts++;
    const res = await provider.run(opts.system, user, opts.onText, opts.signal, opts.media);
    usage = addUsage(usage, res.usage);
    return res.text;
  };
  const record = (status: "ok" | "error", error?: string) =>
    recordUsage({
      ...opts.track,
      provider: provider.kind,
      model: provider.model,
      usage,
      durationMs: Date.now() - started,
      attempts,
      status,
      error,
    });

  try {
    const first = await attempt(opts.user);
    let v = validate(opts.schema, first);
    if (!v.ok) {
      opts.onRetry?.(v.reason);
      const retryUser = `${opts.user}

---
Your previous response could not be used.
${v.reason}

Previous response (for reference):
${first.slice(0, 20000)}

Reply again with ONLY a valid JSON object in the required shape.`;
      v = validate(opts.schema, await attempt(retryUser));
      if (!v.ok) throw new Error(`Claude returned unusable tokens twice. ${v.reason}`);
    }
    const id = record("ok");
    return { data: v.data, usage: { ...usage, id, durationMs: Date.now() - started, attempts } };
  } catch (err) {
    const message = opts.signal?.aborted
      ? "Cancelled."
      : (describeApiError(err) ?? (err as Error).message ?? String(err));
    record("error", message);
    throw new Error(message);
  }
}

/** Settings → "Test connection": one tiny round-trip, also logged. */
export async function testConnection() {
  const provider = await resolveProvider();
  const started = Date.now();
  try {
    const res = await provider.run("Reply with exactly the word: OK", "Connection test.");
    recordUsage({ kind: "test", provider: provider.kind, model: provider.model, usage: res.usage, durationMs: Date.now() - started, attempts: 1, status: "ok" });
    return { label: provider.label, reply: res.text.trim().slice(0, 200), usage: res.usage };
  } catch (err) {
    const message = describeApiError(err) ?? (err as Error).message;
    recordUsage({ kind: "test", provider: provider.kind, model: provider.model, usage: ZERO_USAGE, durationMs: Date.now() - started, attempts: 1, status: "error", error: message });
    throw new Error(message);
  }
}
