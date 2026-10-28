import { getSystem } from "@/lib/systems";
import { readyComponents } from "@/lib/components/store";
import { figmaPayload } from "@/lib/components/figma";

/**
 * What the MUNE Tokens Importer Figma plugin reads: the DTCG tokens plus every Ready component
 * as pre-resolved variant trees (token refs kept so the plugin can bind variables).
 * Figma plugin UIs run in a sandboxed iframe with Origin "null"; only that origin gets CORS access.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/figma/[id]">) {
  const { id } = await ctx.params;
  const rec = getSystem(id);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") === "null") headers["Access-Control-Allow-Origin"] = "null";
  if (!rec) return Response.json({ error: "System not found" }, { status: 404, headers });
  const comps = new URL(request.url).searchParams.get("components") !== "0" ? readyComponents(id) : [];
  return Response.json(figmaPayload(rec, comps.map((c) => c.spec!)), { headers });
}
