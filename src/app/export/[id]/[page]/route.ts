import { getSystem } from "@/lib/systems";
import { EXPORT_PAGES, renderExportPage, type ExportPage } from "@/lib/export/pages";
import { fontLinksFor } from "@/lib/export/fonts";
import { modesOf, type Mode } from "@/lib/tokens/schema";
import { slugify } from "@/lib/project-files";
import { readyComponents } from "@/lib/components/store";

/**
 * Standalone export page for html.to.design: /export/<systemId>/<page>?mode=light|dark[&download=1].
 * Plain server-rendered HTML with no scripts, so a capture sees exactly what loads.
 */
export async function GET(request: Request, ctx: RouteContext<"/export/[id]/[page]">) {
  const { id, page } = await ctx.params;
  const rec = getSystem(id);
  if (!rec) return new Response("System not found", { status: 404 });
  if (!(EXPORT_PAGES as readonly string[]).includes(page)) {
    return new Response(`Unknown page. Try one of: ${EXPORT_PAGES.join(", ")}`, { status: 404 });
  }
  const url = new URL(request.url);
  const modes = modesOf(rec.settings);
  const asked = url.searchParams.get("mode") as Mode | null;
  const mode: Mode = asked && modes.includes(asked) ? asked : modes[0];

  const html = renderExportPage(rec.tokens, page as ExportPage, mode, {
    name: rec.name,
    version: rec.version,
    settings: rec.settings,
    fontLinks: await fontLinksFor(rec.tokens),
    components: page === "components" ? readyComponents(id).map((c) => c.spec!) : [],
  });
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  if (url.searchParams.get("download") === "1") {
    headers["Content-Disposition"] = `attachment; filename="${slugify(rec.name)}-${page}-${mode}.html"`;
  }
  return new Response(html, { headers });
}
