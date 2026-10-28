import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { exportEvents, systemVersions, systems } from "./db/schema";
import { projectRoot } from "./settings";
import { checkUiConfig, slugify, writeProjectFiles } from "./project-files";
import { linkUsageToSystem } from "./usage";
import { deleteSystemComponents, readyComponents } from "./components/store";
import { countTokens, SystemSettingsSchema, TokenSetSchema, type SystemSettings, type TokenSet } from "./tokens/schema";
import { resolveSemantic } from "./tokens/color";
import type { DashboardStats, SystemRecord, SystemStatus, SystemSummary } from "./types";

export class NotFoundError extends Error {}

type Row = typeof systems.$inferSelect;

function toRecord(row: Row): SystemRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brief: row.brief,
    settings: SystemSettingsSchema.parse(JSON.parse(row.settings)),
    tokens: TokenSetSchema.parse(JSON.parse(row.tokens)),
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    exportedAt: row.exportedAt,
    folder: row.folder,
    folderError: row.folderError,
  };
}

function paletteOf(set: TokenSet): string[] {
  const out: string[] = [];
  for (const r of set.ramps) {
    const steps = Object.keys(r.steps);
    const mid = r.steps[steps[Math.floor(steps.length / 2)]];
    if (mid) out.push(r.base ?? mid);
  }
  const bg = resolveSemantic(set, "color/bg/default", "light");
  if (bg && out.length < 8) out.unshift(bg);
  return out.slice(0, 8);
}

export function listSystemSummaries(): SystemSummary[] {
  return getDb()
    .select()
    .from(systems)
    .orderBy(desc(systems.updatedAt))
    .all()
    .map((row) => {
      const tokens = TokenSetSchema.safeParse(JSON.parse(row.tokens));
      const set = tokens.success ? tokens.data : null;
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
        palette: set ? paletteOf(set) : [],
        fonts: set ? set.fonts.map((f) => f.family) : [],
        tokenCount: set ? countTokens(set) : 0,
      };
    });
}

export function getSystem(id: string): SystemRecord | null {
  const row = getDb().select().from(systems).where(eq(systems.id, id)).get();
  return row ? toRecord(row) : null;
}

export function dashboardStats(list = listSystemSummaries()): DashboardStats {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60_000;
  const exports = getDb()
    .select({ n: sql<number>`COUNT(*)` })
    .from(exportEvents)
    .where(gte(exportEvents.createdAt, weekAgo))
    .get();
  return {
    systems: list.filter((s) => s.status === "active").length,
    tokens: list.reduce((n, s) => n + s.tokenCount, 0),
    exportsThisWeek: exports?.n ?? 0,
  };
}

function uniqueSlug(name: string) {
  const root = projectRoot();
  const taken = new Set(getDb().select({ slug: systems.slug }).from(systems).all().map((r) => r.slug));
  const base = slugify(name);
  let slug = base;
  for (let i = 2; taken.has(slug) || fs.existsSync(path.join(root, slug)); i++) slug = `${base}-${i}`;
  return slug;
}

/** Writes the project folder and records the result; a failure is stored, not thrown (the save itself worked). */
async function syncFolder(rec: SystemRecord) {
  const folder = path.join(projectRoot(), rec.slug);
  try {
    const hash = await writeProjectFiles(rec, folder, readyComponents(rec.id).map((c) => c.spec!));
    getDb().update(systems).set({ uiConfigHash: hash, folder, folderError: null }).where(eq(systems.id, rec.id)).run();
  } catch (err) {
    getDb()
      .update(systems)
      .set({ folder, folderError: (err as Error).message })
      .where(eq(systems.id, rec.id))
      .run();
  }
}

export interface SaveInput {
  name: string;
  brief: string;
  settings: SystemSettings;
  tokens: TokenSet;
}

export async function createSystem(input: SaveInput & { usageIds?: string[] }): Promise<SystemRecord> {
  const now = Date.now();
  const id = nanoid(10);
  getDb()
    .insert(systems)
    .values({
      id,
      name: input.name,
      slug: uniqueSlug(input.name),
      brief: input.brief,
      settings: JSON.stringify(input.settings),
      tokens: JSON.stringify(input.tokens),
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  for (const u of input.usageIds ?? []) linkUsageToSystem(u, id, input.name);
  const rec = getSystem(id)!;
  snapshot(rec);
  await syncFolder(rec);
  return getSystem(id)!;
}

export async function saveSystem(id: string, input: SaveInput): Promise<SystemRecord> {
  const prev = getSystem(id);
  if (!prev) throw new NotFoundError("System not found");
  getDb()
    .update(systems)
    .set({
      name: input.name,
      brief: input.brief,
      settings: JSON.stringify(input.settings),
      tokens: JSON.stringify(input.tokens),
      version: prev.version + 1,
      updatedAt: Date.now(),
    })
    .where(eq(systems.id, id))
    .run();
  const rec = getSystem(id)!;
  snapshot(rec);
  await syncFolder(rec);
  return getSystem(id)!;
}

/** Rewrites the project folder from the database without bumping the version. */
export async function rewriteFolder(id: string) {
  const rec = getSystem(id);
  if (!rec) throw new NotFoundError("System not found");
  await syncFolder(rec);
  return getSystem(id)!;
}

export function setStatus(id: string, status: SystemStatus) {
  getDb().update(systems).set({ status, updatedAt: Date.now() }).where(eq(systems.id, id)).run();
}

/** Removes the system from the app. Its project folder on disk is left alone. */
export function deleteSystem(id: string) {
  getDb().delete(systems).where(eq(systems.id, id)).run();
  deleteSystemComponents(id);
  getDb().delete(systemVersions).where(eq(systemVersions.systemId, id)).run();
}

export function uiConfigState(rec: SystemRecord) {
  const row = getDb().select({ hash: systems.uiConfigHash }).from(systems).where(eq(systems.id, rec.id)).get();
  return checkUiConfig(rec.folder, row?.hash ?? null);
}

/** Logs an export; returns true the first time this system is exported. */
export function logExport(id: string, kind: string): boolean {
  const db = getDb();
  const row = db.select({ exportedAt: systems.exportedAt }).from(systems).where(eq(systems.id, id)).get();
  if (!row) return false;
  db.insert(exportEvents).values({ id: nanoid(12), systemId: id, kind, createdAt: Date.now() }).run();
  if (row.exportedAt) return false;
  db.update(systems).set({ exportedAt: Date.now() }).where(eq(systems.id, id)).run();
  return true;
}

export function parseSaveInput(v: unknown): SaveInput {
  const o = (v ?? {}) as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  if (!name) throw new Error("Give the system a name.");
  return {
    name: name.slice(0, 80),
    brief: String(o.brief ?? "").slice(0, 20000),
    settings: SystemSettingsSchema.parse(o.settings ?? {}),
    tokens: TokenSetSchema.parse(o.tokens),
  };
}

// ---------------------------------------------------------------------------
// Version history

function snapshot(rec: SystemRecord) {
  getDb()
    .insert(systemVersions)
    .values({
      id: nanoid(12),
      systemId: rec.id,
      version: rec.version,
      name: rec.name,
      settings: JSON.stringify(rec.settings),
      tokens: JSON.stringify(rec.tokens),
      createdAt: Date.now(),
    })
    .run();
}

export interface VersionMeta {
  version: number;
  name: string;
  createdAt: number;
  tokenCount: number;
}

export function listVersions(systemId: string): VersionMeta[] {
  return getDb()
    .select()
    .from(systemVersions)
    .where(eq(systemVersions.systemId, systemId))
    .orderBy(desc(systemVersions.version))
    .all()
    .map((r) => {
      const t = TokenSetSchema.safeParse(JSON.parse(r.tokens));
      return { version: r.version, name: r.name, createdAt: r.createdAt, tokenCount: t.success ? countTokens(t.data) : 0 };
    });
}

export function getVersion(systemId: string, version: number) {
  const r = getDb()
    .select()
    .from(systemVersions)
    .where(and(eq(systemVersions.systemId, systemId), eq(systemVersions.version, version)))
    .orderBy(desc(systemVersions.createdAt))
    .get();
  if (!r) return null;
  return {
    version: r.version,
    name: r.name,
    createdAt: r.createdAt,
    settings: SystemSettingsSchema.parse(JSON.parse(r.settings)),
    tokens: TokenSetSchema.parse(JSON.parse(r.tokens)),
  };
}

/** Systems saved before history existed get their current state as the first entry. */
export function ensureBaseline(systemId: string) {
  const rec = getSystem(systemId);
  if (rec && !listVersions(systemId).length) snapshot(rec);
}
