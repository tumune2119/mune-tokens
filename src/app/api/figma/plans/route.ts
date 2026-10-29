import { z } from "zod";
import { figmaPlans } from "@/lib/figma-auto/run";
import { getSettings, saveSettings } from "@/lib/settings";

/** Lists the Figma teams the user can create files in (`?force=1` asks Figma again). */
export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    return Response.json({ plans: await figmaPlans(force), selected: getSettings().figmaPlanKey });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

const Body = z.object({ key: z.string().regex(/^(team|organization)::\d+$/), name: z.string().max(200) });

/** Remembers the chosen team for future builds. */
export async function PUT(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid team" }, { status: 400 });
  saveSettings({ ...getSettings(), figmaPlanKey: parsed.data.key, figmaPlanName: parsed.data.name });
  return new Response(null, { status: 204 });
}
