import { z } from "zod";
import { getSettings, projectRoot, saveSettings } from "@/lib/settings";
import { hasApiKey } from "@/lib/ai/provider-api";
import { findClaudeCli } from "@/lib/ai/provider-cli";
import { getDbPath } from "@/lib/db";
import type { SettingsStatus } from "@/lib/types";

async function status(): Promise<SettingsStatus> {
  const settings = getSettings();
  return {
    settings,
    hasApiKey: hasApiKey(),
    cliPath: await findClaudeCli(settings.cliPath),
    dbPath: getDbPath(),
    projectRoot: projectRoot(settings),
  };
}

export async function GET() {
  return Response.json(await status());
}

const Body = z.object({
  provider: z.enum(["auto", "api", "cli"]),
  model: z.string().trim().min(1).max(100),
  effort: z.enum(["low", "medium", "high"]),
  cliPath: z.string().trim().max(500).default(""),
  defaultSteps: z.enum(["11", "9"]),
  defaultContrast: z.enum(["AA", "AAA"]),
  defaultModes: z.enum(["light", "dark", "both"]),
  projectRoot: z.string().trim().max(500).default(""),
});

export async function PUT(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  saveSettings(parsed.data);
  return Response.json(await status());
}
