/** Launcher health check: is MUNE TOKENS (not some other app) answering on this port? */
export function GET() {
  return Response.json({ app: "mune-tokens" });
}
