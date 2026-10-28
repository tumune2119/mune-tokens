import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { components, projectIdeas } from "../db/schema";
import { ComponentSpecSchema, type ComponentRecord, type ComponentStatus, type InventoryItem, type Level } from "./schema";
import type { BriefFile } from "../types";

type Row = typeof components.$inferSelect;

export interface ComponentPlan {
  usedIn?: string[];
  variants?: string[];
  states?: string[];
}

function toRecord(row: Row): ComponentRecord & { plan: ComponentPlan } {
  let spec = null;
  if (row.spec) {
    const parsed = ComponentSpecSchema.safeParse(JSON.parse(row.spec));
    spec = parsed.success ? parsed.data : null;
  }
  return {
    id: row.id,
    systemId: row.systemId,
    name: row.name,
    level: row.level,
    reason: row.reason,
    spec,
    status: row.status,
    order: row.order,
    updatedAt: row.updatedAt,
    plan: JSON.parse(row.plan || "{}"),
  };
}

export type StoredComponent = ReturnType<typeof toRecord>;

export function listComponents(systemId: string): StoredComponent[] {
  return getDb().select().from(components).where(eq(components.systemId, systemId)).orderBy(asc(components.order)).all().map(toRecord);
}

export function getComponent(systemId: string, id: string): StoredComponent | null {
  const row = getDb()
    .select()
    .from(components)
    .where(and(eq(components.systemId, systemId), eq(components.id, id)))
    .get();
  return row ? toRecord(row) : null;
}

/** Adds confirmed inventory items (no spec yet) to the end of the library. */
export function addComponents(systemId: string, items: (Pick<InventoryItem, "name" | "level" | "reason"> & ComponentPlan)[]): StoredComponent[] {
  const db = getDb();
  const max = db.select({ n: sql<number>`COALESCE(MAX(${components.order}), -1)` }).from(components).where(eq(components.systemId, systemId)).get()?.n ?? -1;
  const now = Date.now();
  const ids: string[] = [];
  db.transaction((tx) => {
    items.forEach((it, i) => {
      const id = nanoid(10);
      ids.push(id);
      tx.insert(components)
        .values({
          id,
          systemId,
          name: it.name,
          level: it.level,
          reason: it.reason ?? "",
          plan: JSON.stringify({ usedIn: it.usedIn ?? [], variants: it.variants ?? [], states: it.states ?? [] }),
          order: max + 1 + i,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
  });
  return getDb().select().from(components).where(inArray(components.id, ids)).orderBy(asc(components.order)).all().map(toRecord);
}

export function updateComponent(
  systemId: string,
  id: string,
  patch: { name?: string; level?: Level; status?: ComponentStatus; spec?: unknown; reason?: string },
): StoredComponent | null {
  const set: Partial<typeof components.$inferInsert> = { updatedAt: Date.now() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.level !== undefined) set.level = patch.level;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.reason !== undefined) set.reason = patch.reason;
  if (patch.spec !== undefined) {
    const spec = ComponentSpecSchema.parse(patch.spec);
    set.spec = JSON.stringify(spec);
    set.name = patch.name ?? spec.name;
    set.level = patch.level ?? spec.level;
  }
  getDb()
    .update(components)
    .set(set)
    .where(and(eq(components.systemId, systemId), eq(components.id, id)))
    .run();
  return getComponent(systemId, id);
}

export function deleteComponent(systemId: string, id: string) {
  getDb()
    .delete(components)
    .where(and(eq(components.systemId, systemId), eq(components.id, id)))
    .run();
}

export function reorderComponents(systemId: string, ids: string[]) {
  getDb().transaction((tx) => {
    ids.forEach((id, i) =>
      tx
        .update(components)
        .set({ order: i })
        .where(and(eq(components.systemId, systemId), eq(components.id, id)))
        .run(),
    );
  });
}

export function deleteSystemComponents(systemId: string) {
  getDb().delete(components).where(eq(components.systemId, systemId)).run();
  getDb().delete(projectIdeas).where(eq(projectIdeas.systemId, systemId)).run();
}

export function getIdea(systemId: string): { idea: string; files: BriefFile[] } | null {
  const row = getDb().select().from(projectIdeas).where(eq(projectIdeas.systemId, systemId)).get();
  return row ? { idea: row.idea, files: JSON.parse(row.attachments) } : null;
}

export function saveIdea(systemId: string, idea: string, files: BriefFile[]) {
  const value = { idea, attachments: JSON.stringify(files), updatedAt: Date.now() };
  getDb()
    .insert(projectIdeas)
    .values({ systemId, ...value })
    .onConflictDoUpdate({ target: projectIdeas.systemId, set: value })
    .run();
}

/** Components with a finished spec marked Ready (or already exported) — what goes into UI-CONFIG.md and Figma. */
export function readyComponents(systemId: string) {
  return listComponents(systemId).filter((c) => c.spec && c.status !== "draft");
}
