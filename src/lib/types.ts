import type { StepSet, ContrastTarget, ModeSetting, SystemSettings, TokenSet } from "./tokens/schema";

export type ProviderMode = "auto" | "api" | "cli";
export type Effort = "low" | "medium" | "high";
export type SystemStatus = "active" | "archived";

export interface AppSettings {
  provider: ProviderMode;
  model: string;
  effort: Effort;
  cliPath: string;
  defaultSteps: StepSet;
  defaultContrast: ContrastTarget;
  defaultModes: ModeSetting;
  /** Where project folders (UI-CONFIG.md, tokens.*) are written. Empty = Documents\MUNE Tokens. */
  projectRoot: string;
}

export interface SettingsStatus {
  settings: AppSettings;
  hasApiKey: boolean;
  cliPath: string | null;
  dbPath: string;
  projectRoot: string;
}

export interface SystemSummary {
  id: string;
  name: string;
  status: SystemStatus;
  updatedAt: number;
  createdAt: number;
  /** Up to 8 colours for the card strip. */
  palette: string[];
  fonts: string[];
  tokenCount: number;
}

export interface SystemRecord {
  id: string;
  name: string;
  slug: string;
  brief: string;
  settings: SystemSettings;
  tokens: TokenSet;
  status: SystemStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
  exportedAt: number | null;
  folder: string | null;
  folderError: string | null;
}

export interface DashboardStats {
  systems: number;
  tokens: number;
  exportsThisWeek: number;
}

/** A text attachment read in the browser and sent with the brief. */
export interface BriefFile {
  name: string;
  size: number;
  text: string;
}
