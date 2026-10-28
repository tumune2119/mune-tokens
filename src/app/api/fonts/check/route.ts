import { checkFont } from "@/lib/export/fonts";

/** Is this family on Google Fonts? Export pages load fonts from there so they exist in Figma. */
export async function GET(request: Request) {
  const family = new URL(request.url).searchParams.get("family")?.trim();
  if (!family) return Response.json({ error: "family is required" }, { status: 400 });
  return Response.json({ family, status: await checkFont(family) });
}
