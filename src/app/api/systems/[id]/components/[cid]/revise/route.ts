import { z } from "zod";
import { streamAiJob } from "@/lib/ai/ndjson";
import { directionBlock } from "@/lib/styles";
import { generateStructured } from "@/lib/ai/generate";
import { reviseUserMessage, specSystemPrompt } from "@/lib/components/prompts";
import { specSchemaFor, type ComponentSpec } from "@/lib/components/schema";
import { getComponent } from "@/lib/components/store";
import { getSystem } from "@/lib/systems";

const Body = z.object({ instruction: z.string().trim().min(1, "Say what to change.").max(2000) });

/** "Add a destructive variant", "denser padding"…: returns a revised spec for preview; nothing is saved. */
export async function POST(request: Request, ctx: RouteContext<"/api/systems/[id]/components/[cid]/revise">) {
  const { id, cid } = await ctx.params;
  const rec = getSystem(id);
  const comp = rec && getComponent(id, cid);
  if (!rec || !comp?.spec) return Response.json({ error: "Component spec not found" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const spec = comp.spec;

  return streamAiJob(request, ({ provider, signal, onText, onRetry }) =>
    generateStructured({
      system: specSystemPrompt(),
      user: reviseUserMessage(spec, parsed.data.instruction, rec.tokens, directionBlock(rec.settings, "all")),
      schema: specSchemaFor(rec.tokens) as unknown as z.ZodType<ComponentSpec>,
      track: { kind: "revise", systemId: id, systemName: rec.name },
      provider,
      signal,
      onText,
      onRetry,
    }),
  );
}
