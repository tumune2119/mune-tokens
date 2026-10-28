import { z } from "zod";
import { createSystem, listSystemSummaries, parseSaveInput } from "@/lib/systems";

export async function GET() {
  return Response.json(listSystemSummaries());
}

/** Save a new system (from a generated draft, a blank start or an import). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  try {
    const input = parseSaveInput(body);
    const usageIds = z.array(z.string().max(40)).max(50).catch([]).parse(body?.usageIds);
    const rec = await createSystem({ ...input, usageIds });
    return Response.json(rec, { status: 201 });
  } catch (err) {
    const msg = err instanceof z.ZodError ? (err.issues[0]?.message ?? "Invalid tokens") : (err as Error).message;
    return Response.json({ error: msg }, { status: 400 });
  }
}
