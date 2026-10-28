import { testConnection } from "@/lib/ai/generate";

/** Settings → "Test connection": one tiny round-trip through the configured provider. */
export async function POST() {
  const started = Date.now();
  try {
    const r = await testConnection();
    return Response.json({ ok: true, label: r.label, reply: r.reply, usage: r.usage, ms: Date.now() - started });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message, ms: Date.now() - started });
  }
}
