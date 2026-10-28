import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

let dbPath: string | null = null;
/** Resolved on first use (not at import), so builds never touch the database. */
export function getDbPath(): string {
  dbPath ??= process.env.MUNE_TOKENS_DB_PATH
    ? path.resolve(/*turbopackIgnore: true*/ process.env.MUNE_TOKENS_DB_PATH)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "mune-tokens.db");
  return dbPath;
}

// Idempotent schema; runs on every start so a fresh ./data folder just works.
const DDL = `
CREATE TABLE IF NOT EXISTS systems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL,
  tokens_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  exported_at INTEGER,
  ui_config_hash TEXT,
  folder TEXT,
  folder_error TEXT
);
CREATE TABLE IF NOT EXISTS export_events (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS export_events_created_idx ON export_events(created_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_id TEXT,
  system_name TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage(created_at);
CREATE TABLE IF NOT EXISTS project_ideas (
  system_id TEXT PRIMARY KEY,
  idea TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  plan_json TEXT NOT NULL DEFAULT '{}',
  spec_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS components_system_idx ON components(system_id);
CREATE TABLE IF NOT EXISTS system_versions (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  tokens_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS system_versions_idx ON system_versions(system_id, version);
`;

function open(): DB {
  const file = getDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __muneTokensDb?: DB };

export function getDb(): DB {
  if (!g.__muneTokensDb) g.__muneTokensDb = open();
  return g.__muneTokensDb;
}
