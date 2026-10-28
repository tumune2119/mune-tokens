import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A design system. The token set is stored as one validated JSON document (TokenSetSchema):
 * the editor works on a draft of the whole set and "Save system" replaces it in one write.
 */
export const systems = sqliteTable("systems", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Folder name under the project root; fixed at creation so renames don't move files. */
  slug: text("slug").notNull(),
  brief: text("brief").notNull().default(""),
  settings: text("settings_json").notNull(),
  tokens: text("tokens_json").notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  /** First time a page or file was exported (drives the one-off confetti). */
  exportedAt: integer("exported_at"),
  /** sha1 of the UI-CONFIG.md we last wrote, to spot hand edits. */
  uiConfigHash: text("ui_config_hash"),
  /** Last folder the files were written to. */
  folder: text("folder"),
  /** Last error writing the project folder, shown on the system page. */
  folderError: text("folder_error"),
});

export const exportEvents = sqliteTable("export_events", {
  id: text("id").primaryKey(),
  systemId: text("system_id").notNull(),
  kind: text("kind").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const aiUsage = sqliteTable("ai_usage", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  kind: text("kind", { enum: ["system", "regenerate", "inventory", "component", "revise", "test"] }).notNull(),
  provider: text("provider", { enum: ["api", "cli"] }).notNull(),
  model: text("model").notNull(),
  systemId: text("system_id"),
  systemName: text("system_name"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  attempts: integer("attempts").notNull().default(1),
  status: text("status", { enum: ["ok", "error"] }).notNull(),
  error: text("error"),
});

/** The product idea a component library is planned from (one per system). */
export const projectIdeas = sqliteTable("project_ideas", {
  systemId: text("system_id").primaryKey(),
  idea: text("idea").notNull(),
  attachments: text("attachments_json").notNull().default("[]"),
  updatedAt: integer("updated_at").notNull(),
});

/** A component in a system's library; spec_json is a ComponentSpec (null until generated). */
export const components = sqliteTable("components", {
  id: text("id").primaryKey(),
  systemId: text("system_id").notNull(),
  name: text("name").notNull(),
  level: text("level", { enum: ["foundation", "primitive", "composite", "product"] }).notNull(),
  reason: text("reason").notNull().default(""),
  /** Inventory notes (variants/states the inventory suggested), used to write the spec. */
  plan: text("plan_json").notNull().default("{}"),
  spec: text("spec_json"),
  status: text("status", { enum: ["draft", "ready", "exported"] }).notNull().default("draft"),
  order: integer("position").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
