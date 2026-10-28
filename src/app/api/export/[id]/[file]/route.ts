import { strToU8, zipSync } from "fflate";
import { getSystem } from "@/lib/systems";
import { exportPagesFor, filesFor, slugify } from "@/lib/project-files";

const TYPES: Record<string, string> = {
  "tokens.json": "application/json; charset=utf-8",
  "tokens.css": "text/css; charset=utf-8",
  "tailwind.css": "text/css; charset=utf-8",
  "UI-CONFIG.md": "text/markdown; charset=utf-8",
};

/** Downloads: tokens.json, tokens.css, tailwind.css, UI-CONFIG.md, or all.zip (files + every export page). */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/[id]/[file]">) {
  const { id, file } = await ctx.params;
  const rec = getSystem(id);
  if (!rec) return Response.json({ error: "System not found" }, { status: 404 });
  const files = filesFor(rec);
  const slug = slugify(rec.name);

  if (file === "all.zip") {
    const pages = await exportPagesFor(rec);
    const entries: Record<string, Uint8Array> = {};
    for (const [name, text] of Object.entries(files)) entries[`${slug}/${name}`] = strToU8(text);
    for (const [name, text] of Object.entries(pages)) entries[`${slug}/export/${name}`] = strToU8(text);
    const zip = zipSync(entries, { level: 6 });
    return new Response(zip as unknown as BodyInit, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}.zip"` },
    });
  }

  if (!(file in files)) return Response.json({ error: "Unknown file" }, { status: 404 });
  return new Response(files[file as keyof typeof files], {
    headers: { "Content-Type": TYPES[file], "Content-Disposition": `attachment; filename="${file}"` },
  });
}
