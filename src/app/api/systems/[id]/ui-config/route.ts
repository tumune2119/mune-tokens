import { z } from "zod";
import { applyUiConfig } from "@/lib/export/ui-config";
import { NotFoundError, getSystem, rewriteFolder, saveSystem, uiConfigState } from "@/lib/systems";
import { findProblems } from "@/lib/tokens/schema";

const Body = z.object({ action: z.enum(["keep", "overwrite"]) });

/**
 * UI-CONFIG.md was edited by hand. "keep" reads the edits into the system (new version);
 * "overwrite" rewrites the folder from the app.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/systems/[id]/ui-config">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const rec = getSystem(id);
  if (!rec) return Response.json({ error: "System not found" }, { status: 404 });

  try {
    if (parsed.data.action === "overwrite") return Response.json({ system: await rewriteFolder(id), changes: 0 });

    const state = uiConfigState(rec);
    if (state.state !== "edited") return Response.json({ system: rec, changes: 0 });
    const { set, changes } = applyUiConfig(rec.tokens, state.text, rec.settings);
    const problems = findProblems(set);
    if (problems.length) {
      return Response.json({ error: `The edited file has problems: ${problems.slice(0, 3).join(" ")}` }, { status: 400 });
    }
    const system = await saveSystem(id, { name: rec.name, brief: rec.brief, settings: rec.settings, tokens: set });
    return Response.json({ system, changes });
  } catch (err) {
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
