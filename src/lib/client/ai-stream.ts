"use client";

import { parse as parsePartial, Allow } from "partial-json";
import type { AiEvent, UsageInfo } from "../ai/events";

export interface StreamHandlers {
  onMeta?: (label: string) => void;
  onText?: (delta: string) => void;
  onRetry?: (reason: string) => void;
}

/** POSTs to an /api/ai/* route and consumes its NDJSON event stream. Resolves with the validated result and its usage. */
export async function streamAi<T>(
  url: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<{ data: T; usage: UsageInfo }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let result: { data: T; usage: UsageInfo } | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const ev = JSON.parse(line) as AiEvent<T>;
    switch (ev.type) {
      case "meta":
        handlers.onMeta?.(ev.label);
        break;
      case "text":
        handlers.onText?.(ev.text);
        break;
      case "retry":
        handlers.onRetry?.(ev.reason);
        break;
      case "done":
        result = { data: ev.data, usage: ev.usage };
        break;
      case "error":
        throw new Error(ev.message);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      handle(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  handle(buf);
  if (!result) throw new Error("The stream ended without a result.");
  return result;
}

/** Best-effort parse of an incomplete JSON response, for live previews while streaming. */
export function parsePartialJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  try {
    return parsePartial(text.slice(start), Allow.ALL) as T;
  } catch {
    return null;
  }
}
