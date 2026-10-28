import { z } from "zod";
import { buildInFigma, type BuildEvent } from "@/lib/figma-auto/run";
import { readyComponents } from "@/lib/components/store";
import { getSystem, setFigmaUrl } from "@/lib/systems";

const Body = z.object({
  /** "new" creates a file in the chosen team; "update" reuses the system's Figma file. */
  mode: z.enum(["new", "update"]),
  planKey: z.string().regex(/^(team|organization)::\d+$/).optional(),
});

/**
 * Builds the project's Figma file with Claude Code + the Figma MCP server. Streams NDJSON:
 * plan, step (running/ok/error), file, then done (with the check) or error.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/systems/[id]/figma/build">) {
  const { id } = await ctx.params;
  const rec = getSystem(id);
  if (!rec) return Response.json({ error: "System not found" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { mode, planKey } = parsed.data;
  if (mode === "update" && !rec.settings.figmaUrl) return Response.json({ error: "This system has no Figma file yet." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (ev: BuildEvent | { type: "done"; [k: string]: unknown } | { type: "error"; message: string }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        const result = await buildInFigma(rec, readyComponents(id).map((c) => c.spec!), {
          planKey,
          fileUrl: mode === "update" ? rec.settings.figmaUrl : undefined,
          signal: request.signal,
          onEvent: send,
        });
        await setFigmaUrl(id, result.fileUrl);
        send({ type: "done", ...result });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
