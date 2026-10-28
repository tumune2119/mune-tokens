import { z } from "zod";

/** Images and PDFs attached to a brief or project idea (base64, no data: prefix). */
export const MediaSchema = z
  .array(
    z.object({
      name: z.string().max(200),
      mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]),
      data: z.string().max(14_000_000),
    }),
  )
  .max(6)
  .default([])
  .refine((list) => list.reduce((n, m) => n + m.data.length, 0) <= 28_000_000, "Attachments are too large (about 20 MB in total).");

export function mediaNote(media: { name: string; mediaType: string }[], purpose: "brand" | "product") {
  if (!media.length) return "";
  const names = media.map((m) => `${m.name} (${m.mediaType === "application/pdf" ? "PDF" : "image"})`).join(", ");
  return purpose === "brand"
    ? `\n\nAttached images/PDFs: ${names}. Use them: take the brand colour(s) from the logo or screenshots (exact hex where you can read it), match the typography and mood you see, and follow any brand guidelines in the PDF.`
    : `\n\nAttached images/PDFs: ${names}. Use them: list the components you can see in the screenshots and the flows described in documents.`;
}
