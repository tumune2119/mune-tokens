import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import { getSettings, projectRoot } from "@/lib/settings";
import { hasApiKey } from "@/lib/ai/provider-api";
import { findClaudeCli } from "@/lib/ai/provider-cli";
import { getDbPath } from "@/lib/db";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = getSettings();
  return (
    <SettingsForm
      initial={{ settings, hasApiKey: hasApiKey(), cliPath: await findClaudeCli(settings.cliPath), dbPath: getDbPath(), projectRoot: projectRoot(settings) }}
    />
  );
}
