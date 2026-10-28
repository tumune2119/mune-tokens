import { z } from "zod";
import { streamAiJob } from "@/lib/ai/ndjson";
import { generateStructured } from "@/lib/ai/generate";
import { generationGroups, generationUserMessage, systemPromptFor } from "@/lib/ai/prompts";
import { generationSchema } from "@/lib/ai/token-schemas";
import { SystemSettingsSchema } from "@/lib/tokens/schema";

const MAX_ATTACHMENT_CHARS = 400_000;

const Body = z.object({
  brief: z.string().trim().min(1, "Describe the product first."),
  settings: SystemSettingsSchema,
  files: z.array(z.object({ name: z.string(), size: z.number(), text: z.string() })).default([]),
});

/** New system: streams a token set for the brief (validated, retried once). */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const { brief, settings, files } = parsed.data;
  if (!settings.scope.length) return Response.json({ error: "Tick at least one thing to generate." }, { status: 400 });
  const chars = files.reduce((a, f) => a + f.text.length, 0);
  if (chars > MAX_ATTACHMENT_CHARS) {
    return Response.json(
      { error: `Attachments are too large (${Math.round(chars / 1000)}k characters, limit ${MAX_ATTACHMENT_CHARS / 1000}k).` },
      { status: 413 },
    );
  }

  return streamAiJob(request, ({ provider, signal, onText, onRetry }) =>
    generateStructured({
      system: systemPromptFor(generationGroups(settings.scope)),
      user: generationUserMessage(brief, settings, files),
      schema: generationSchema(settings.steps),
      track: { kind: "system" },
      provider,
      signal,
      onText,
      onRetry,
    }),
  );
}
