import { z } from "zod";
import { streamAiJob } from "@/lib/ai/ndjson";
import { generateStructured } from "@/lib/ai/generate";
import { regenerateSystemPrompt, regenerateUserMessage } from "@/lib/ai/prompts";
import { groupSchema, type GroupResult } from "@/lib/ai/token-schemas";
import { SystemSettingsSchema, TokenSetSchema } from "@/lib/tokens/schema";

const Body = z.object({
  systemId: z.string().nullish(),
  systemName: z.string().nullish(),
  group: z.enum(["ramps", "semantic", "typography", "spacing", "radius", "shadows", "breakpoints"]),
  guidance: z.string().max(2000).default(""),
  brief: z.string().max(20000).default(""),
  settings: SystemSettingsSchema,
  tokens: TokenSetSchema,
});

/** "Regenerate this group": returns the whole group for a preview; nothing is applied server-side. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const b = parsed.data;
  const schema = groupSchema(b.group, b.settings.steps, b.tokens.ramps.map((r) => r.name)) as z.ZodType<GroupResult>;
  return streamAiJob(request, ({ provider, signal, onText, onRetry }) =>
    generateStructured({
      system: regenerateSystemPrompt(b.group),
      user: regenerateUserMessage({ group: b.group, set: b.tokens, settings: b.settings, brief: b.brief, guidance: b.guidance }),
      schema,
      track: { kind: "regenerate", systemId: b.systemId ?? null, systemName: b.systemName ?? null },
      provider,
      signal,
      onText,
      onRetry,
    }),
  );
}
