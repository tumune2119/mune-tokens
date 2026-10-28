import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { settings } from "./db/schema";
import type { AppSettings } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export const DEFAULT_SETTINGS: AppSettings = {
  provider: "auto",
  model: DEFAULT_MODEL,
  effort: "medium",
  cliPath: "",
  defaultSteps: "11",
  defaultContrast: "AA",
  defaultModes: "both",
  projectRoot: "",
};

export function getSettings(): AppSettings {
  const row = getDb().select().from(settings).where(eq(settings.key, "app")).get();
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(next: AppSettings) {
  const value = JSON.stringify(next);
  getDb()
    .insert(settings)
    .values({ key: "app", value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

/** The user's Documents folder (OneDrive moves it on many Windows PCs). */
function documentsDir() {
  const home = os.homedir();
  const candidates = [path.join(home, "OneDrive", "Documents"), path.join(home, "Documents")];
  return candidates.find((p) => fs.existsSync(p)) ?? home;
}

export function projectRoot(s: AppSettings = getSettings()) {
  return s.projectRoot.trim() || path.join(documentsDir(), "MUNE Tokens");
}
