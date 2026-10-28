import { BackupSchema, exportAll, importBackup } from "@/lib/backup";

export async function GET() {
  const stamp = new Date().toLocaleDateString("sv-SE"); // local YYYY-MM-DD
  return new Response(JSON.stringify(exportAll(), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mune-tokens-backup-${stamp}.json"`,
    },
  });
}

export async function POST(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") === "replace" ? "replace" : "merge";
  const parsed = BackupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "That file isn't a valid MUNE TOKENS backup." }, { status: 400 });
  return Response.json({ imported: importBackup(parsed.data, mode), mode });
}
