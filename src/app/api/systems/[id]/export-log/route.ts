import { z } from "zod";
import { logExport } from "@/lib/systems";

const Body = z.object({ kind: z.string().trim().min(1).max(60) });

/** Records an export (page opened, file downloaded). `first` drives the one-off confetti. */
export async function POST(request: Request, ctx: RouteContext<"/api/systems/[id]/export-log">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  return Response.json({ first: logExport(id, parsed.data.kind) });
}
