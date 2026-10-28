import type { z } from "zod";

/** Pulls the JSON object out of a model response (tolerates code fences / stray prose). */
export function extractJsonText(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in the response.");
  return t.slice(start, end + 1);
}

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}
