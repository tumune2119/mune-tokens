import { z } from "zod";
import { getIdea, saveIdea } from "@/lib/components/store";
import { getSystem } from "@/lib/systems";

export async function GET(_req: Request, ctx: RouteContext<"/api/systems/[id]/idea">) {
  const { id } = await ctx.params;
  return Response.json(getIdea(id) ?? { idea: "", files: [] });
}

const Body = z.object({
  idea: z.string().max(20000),
  files: z.array(z.object({ name: z.string(), size: z.number(), text: z.string() })).max(10).default([]),
});

export async function PUT(request: Request, ctx: RouteContext<"/api/systems/[id]/idea">) {
  const { id } = await ctx.params;
  if (!getSystem(id)) return Response.json({ error: "System not found" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  saveIdea(id, parsed.data.idea, parsed.data.files);
  return new Response(null, { status: 204 });
}
