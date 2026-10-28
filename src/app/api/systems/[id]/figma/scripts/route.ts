import { getSystem } from "@/lib/systems";
import { readyComponents } from "@/lib/components/store";
import { buildScripts } from "@/lib/figma-auto/scripts";

/** The Figma scripts "Build in Figma" would run, without running them (for checking and support). */
export async function GET(_req: Request, ctx: RouteContext<"/api/systems/[id]/figma/scripts">) {
  const { id } = await ctx.params;
  const rec = getSystem(id);
  if (!rec) return Response.json({ error: "System not found" }, { status: 404 });
  try {
    const plan = buildScripts(rec, readyComponents(id).map((c) => c.spec!));
    return Response.json({ ...plan, sizes: plan.scripts.map((s) => [s.label, s.code.length]) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
