import { ensureBaseline, getSystem, listVersions } from "@/lib/systems";

/** Saved versions of a system, newest first (snapshots start with the first save after this feature). */
export async function GET(_req: Request, ctx: RouteContext<"/api/systems/[id]/versions">) {
  const { id } = await ctx.params;
  if (!getSystem(id)) return Response.json({ error: "System not found" }, { status: 404 });
  ensureBaseline(id);
  return Response.json(listVersions(id));
}
