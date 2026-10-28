import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getSystem } from "@/lib/systems";
import { projectRoot } from "@/lib/settings";

const Body = z.union([
  z.object({ url: z.string().url() }),
  z.object({ folder: z.literal("system"), systemId: z.string().min(1) }),
  z.object({ folder: z.literal("root") }),
]);

function launch(cmd: string, args: string[]) {
  spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

/**
 * "Open in browser" (outside the app window, so the html.to.design extension can capture the page)
 * and "Open folder". Only this server's own export pages and the project folders can be opened.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  if ("url" in body) {
    const target = new URL(body.url);
    const self = new URL(request.url);
    if (target.host !== self.host || !target.pathname.startsWith("/export/")) {
      return Response.json({ error: "Only export pages can be opened." }, { status: 400 });
    }
    // The default browser's protocol handler; avoids cmd.exe quoting of "&" in URLs.
    launch("rundll32.exe", ["url.dll,FileProtocolHandler", target.toString()]);
    return Response.json({ ok: true });
  }

  let dir: string;
  if (body.folder === "root") {
    dir = projectRoot();
  } else {
    const rec = getSystem(body.systemId);
    if (!rec) return Response.json({ error: "System not found" }, { status: 404 });
    dir = rec.folder ?? path.join(projectRoot(), rec.slug);
  }
  if (!fs.existsSync(dir)) return Response.json({ error: `Folder doesn't exist yet: ${dir}` }, { status: 404 });
  launch("explorer.exe", [dir]);
  return Response.json({ ok: true, path: dir });
}
