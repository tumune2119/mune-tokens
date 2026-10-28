import { z } from "zod";
import { NotFoundError, deleteSystem, getSystem, parseSaveInput, saveSystem, setStatus } from "@/lib/systems";

export async function GET(_req: Request, ctx: RouteContext<"/api/systems/[id]">) {
  const { id } = await ctx.params;
  const rec = getSystem(id);
  if (!rec) return Response.json({ error: "System not found" }, { status: 404 });
  return Response.json(rec);
}

/** "Save system": replaces the token set, bumps the version and rewrites the project folder. */
export async function PUT(request: Request, ctx: RouteContext<"/api/systems/[id]">) {
  const { id } = await ctx.params;
  try {
    return Response.json(await saveSystem(id, parseSaveInput(await request.json().catch(() => null))));
  } catch (err) {
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    const msg = err instanceof z.ZodError ? (err.issues[0]?.message ?? "Invalid tokens") : (err as Error).message;
    return Response.json({ error: msg }, { status: 400 });
  }
}

const Patch = z.object({ status: z.enum(["active", "archived"]) });

export async function PATCH(request: Request, ctx: RouteContext<"/api/systems/[id]">) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (!getSystem(id)) return Response.json({ error: "System not found" }, { status: 404 });
  setStatus(id, parsed.data.status);
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/systems/[id]">) {
  const { id } = await ctx.params;
  deleteSystem(id);
  return new Response(null, { status: 204 });
}
