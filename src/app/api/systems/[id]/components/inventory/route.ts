import { z } from "zod";
import { streamAiJob } from "@/lib/ai/ndjson";
import { generateStructured } from "@/lib/ai/generate";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { inventorySystemPrompt, inventoryUserMessage } from "@/lib/components/prompts";
import { InventorySchema, type InventoryItem } from "@/lib/components/schema";
import { saveIdea } from "@/lib/components/store";
import { getSystem } from "@/lib/systems";

const Body = z.object({
  idea: z.string().trim().min(1, "Describe the product first.").max(20000),
  files: z.array(z.object({ name: z.string(), size: z.number(), text: z.string() })).max(10).default([]),
});

/**
 * Step 1: the component checklist for a product idea (streamed). Nothing is created; the user
 * ticks what they want first. Each item carries a rough cost estimate for writing its spec.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/systems/[id]/components/inventory">) {
  const { id } = await ctx.params;
  const rec = getSystem(id);
  if (!rec) return Response.json({ error: "System not found" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { idea, files } = parsed.data;
  if (files.reduce((n, f) => n + f.text.length, 0) > 300_000) return Response.json({ error: "Attachments are too large." }, { status: 413 });
  saveIdea(id, idea, files);

  return streamAiJob(request, async ({ provider, signal, onText, onRetry }) => {
    const { data, usage } = await generateStructured({
      system: inventorySystemPrompt(),
      user: inventoryUserMessage(idea, rec.brief, rec.tokens, files),
      schema: InventorySchema,
      track: { kind: "inventory", systemId: id, systemName: rec.name },
      provider,
      signal,
      onText,
      onRetry,
    });
    // A spec is roughly 3k tokens in (prompt + tokens) and grows with the variant count.
    const items: InventoryItem[] = data.items.map((it) => ({
      ...it,
      estimateUsd: estimateCostUsd(provider.model, {
        inputTokens: 3000,
        outputTokens: 1800 + 120 * (it.variants.length + it.states.length),
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }) ?? undefined,
    }));
    return { data: { items }, usage };
  });
}
