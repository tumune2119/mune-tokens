import { AUTO_EXIT, quitSoon } from "@/lib/app-lifetime";

/** "Quit MUNE TOKENS" in the sidebar. Only stops servers started by the desktop launcher. */
export async function POST() {
  if (!AUTO_EXIT) {
    return Response.json({ error: "Quit only works when MUNE TOKENS was started from the desktop launcher." }, { status: 409 });
  }
  quitSoon("Quit was clicked");
  return Response.json({ ok: true });
}
