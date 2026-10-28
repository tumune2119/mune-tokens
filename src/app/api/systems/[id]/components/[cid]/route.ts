import { z } from "zod";
import { deleteComponent, getComponent, updateComponent } from "@/lib/components/store";
import { LEVELS, STATUSES, specProblems, ComponentSpecSchema } from "@/lib/components/schema";
import { getSystem, rewriteFolder } from "@/lib/systems";

const Patch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  level: z.enum(LEVELS).optional(),
  status: z.enum(STATUSES).optional(),
  reason: z.string().max(400).optional(),
  spec: z.unknown().optional(),
});

/** Rename, change level/status, or replace the spec (hand edit or an applied AI revision). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/systems/[id]/components/[cid]">) {
  const { id, cid } = await ctx.params;
  const rec = getSystem(id);
  if (!rec || !getComponent(id, cid)) return Response.json({ error: "Component not found" }, { status: 404 });
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const patch = parsed.data;
  if (patch.spec !== undefined) {
    const spec = ComponentSpecSchema.safeParse(patch.spec);
    if (!spec.success) {
      const i = spec.error.issues[0];
      return Response.json({ error: `${i?.path.join(".") || "spec"}: ${i?.message}` }, { status: 400 });
    }
    const problems = specProblems(spec.data, rec.tokens);
    if (problems.length) return Response.json({ error: problems.slice(0, 4).join(" · ") }, { status: 400 });
  }
  const current = getComponent(id, cid)!;
  if (patch.status && patch.status !== "draft" && !current.spec && patch.spec === undefined) {
    return Response.json({ error: "Write the spec before marking it ready." }, { status: 400 });
  }
  const next = updateComponent(id, cid, patch);
  // Ready components are part of UI-CONFIG.md and the export pages: keep the project folder current.
  if (current.status !== "draft" || next?.status !== "draft") await rewriteFolder(id);
  return Response.json(next);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/systems/[id]/components/[cid]">) {
  const { id, cid } = await ctx.params;
  const was = getComponent(id, cid);
  deleteComponent(id, cid);
  if (was && was.status !== "draft" && getSystem(id)) await rewriteFolder(id);
  return new Response(null, { status: 204 });
}
