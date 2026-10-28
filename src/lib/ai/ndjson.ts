import "server-only";
import type { AiEvent } from "./events";
import { resolveProvider, type ResolvedProvider, type UsageSummary } from "./generate";

/**
 * Runs an AI job and streams its progress to the browser as newline-delimited JSON.
 * The job receives the resolved provider plus callbacks wired to the stream.
 */
export function streamAiJob<T>(
  request: Request,
  job: (ctx: {
    provider: ResolvedProvider;
    signal: AbortSignal;
    onText: (d: string) => void;
    onRetry: (reason: string) => void;
  }) => Promise<{ data: T; usage: UsageSummary }>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (ev: AiEvent<T>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        const provider = await resolveProvider();
        send({ type: "meta", label: provider.label });
        const { data, usage } = await job({
          provider,
          signal: request.signal,
          onText: (text) => send({ type: "text", text }),
          onRetry: (reason) => send({ type: "retry", reason }),
        });
        send({ type: "done", data, usage });
      } catch (err) {
        send({ type: "error", message: (err as Error).message || String(err) });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
