import { streamAiJob } from "@/lib/ai/ndjson";
import { generateStructured } from "@/lib/ai/generate";
import { specSystemPrompt, specUserMessage } from "@/lib/components/prompts";
import { specSchemaFor, type ComponentSpec } from "@/lib/components/schema";
import { getComponent, getIdea, updateComponent } from "@/lib/components/store";
import { getSystem } from "@/lib/systems";
import type { z } from "zod";

/**
 * Step 2b: writes one component's spec (one call per component, so a bad answer only retries
 * that component). Token references are checked; failures are fed back on the retry.
 * The spec is saved as soon as it validates; the component stays Draft.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/systems/[id]/components/[cid]/generate">) {
  const { id, cid } = await ctx.params;
  const rec = getSystem(id);
  const comp = rec && getComponent(id, cid);
  if (!rec || !comp) return Response.json({ error: "Component not found" }, { status: 404 });
  const idea = getIdea(id)?.idea ?? "";

  return streamAiJob(request, async ({ provider, signal, onText, onRetry }) => {
    const { data, usage } = await generateStructured({
      system: specSystemPrompt(),
      user: specUserMessage({ name: comp.name, level: comp.level, reason: comp.reason, plan: comp.plan, idea, set: rec.tokens }),
      schema: specSchemaFor(rec.tokens) as unknown as z.ZodType<ComponentSpec>,
      track: { kind: "component", systemId: id, systemName: rec.name },
      provider,
      signal,
      onText,
      onRetry,
    });
    // Keep the library's name and level; the spec is the detail.
    const saved = updateComponent(id, cid, { spec: { ...data, name: comp.name, level: comp.level } });
    return { data: saved, usage };
  });
}
