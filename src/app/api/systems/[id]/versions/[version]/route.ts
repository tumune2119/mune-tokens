import { getVersion } from "@/lib/systems";

/** One saved version in full (name, settings, tokens), for diffing and restoring into the draft. */
export async function GET(_req: Request, ctx: RouteContext<"/api/systems/[id]/versions/[version]">) {
  const { id, version } = await ctx.params;
  const v = getVersion(id, Number(version));
  if (!v) return Response.json({ error: "Version not found" }, { status: 404 });
  return Response.json(v);
}
