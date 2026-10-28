import { z } from "zod";
import { addComponents, listComponents, reorderComponents } from "@/lib/components/store";
import { LEVELS } from "@/lib/components/schema";
import { getSystem } from "@/lib/systems";

export async function GET(_req: Request, ctx: RouteContext<"/api/systems/[id]/components">) {
  const { id } = await ctx.params;
  return Response.json(listComponents(id));
}

const Add = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        level: z.enum(LEVELS),
        reason: z.string().max(400).default(""),
        usedIn: z.array(z.string().max(80)).max(12).default([]),
        variants: z.array(z.string().max(60)).max(12).default([]),
        states: z.array(z.string().max(30)).max(8).default([]),
      }),
    )
    .min(1)
    .max(60),
});

/** Step 2a: the ticked inventory items become library entries (specs are written one by one after). */
export async function POST(request: Request, ctx: RouteContext<"/api/systems/[id]/components">) {
  const { id } = await ctx.params;
  if (!getSystem(id)) return Response.json({ error: "System not found" }, { status: 404 });
  const parsed = Add.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  return Response.json(addComponents(id, parsed.data.items), { status: 201 });
}

const Reorder = z.object({ ids: z.array(z.string().min(1)).max(500) });

export async function PUT(request: Request, ctx: RouteContext<"/api/systems/[id]/components">) {
  const { id } = await ctx.params;
  const parsed = Reorder.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  reorderComponents(id, parsed.data.ids);
  return Response.json(listComponents(id));
}
