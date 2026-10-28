import { z } from "zod";
import { reportPresence } from "@/lib/app-lifetime";

const Body = z.object({ id: z.string().min(1).max(64), status: z.enum(["alive", "bye"]) });

/** App windows check in here; see src/lib/app-lifetime.ts. Also receives navigator.sendBeacon on close. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid presence report" }, { status: 400 });
  reportPresence(parsed.data.id, parsed.data.status);
  return new Response(null, { status: 204 });
}
