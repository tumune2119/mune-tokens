import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { aiUsage } from "./db/schema";
import type { TokenUsage } from "./ai/types";

export type UsageKind = "system" | "regenerate" | "test";

export interface UsageRecordInput {
  kind: UsageKind;
  provider: "api" | "cli";
  model: string;
  systemId?: string | null;
  systemName?: string | null;
  usage: TokenUsage;
  durationMs: number;
  attempts: number;
  status: "ok" | "error";
  error?: string | null;
}

export function recordUsage(r: UsageRecordInput): string {
  const id = nanoid(12);
  getDb()
    .insert(aiUsage)
    .values({
      id,
      createdAt: Date.now(),
      kind: r.kind,
      provider: r.provider,
      model: r.model,
      systemId: r.systemId ?? null,
      systemName: r.systemName ?? null,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      cacheReadTokens: r.usage.cacheReadTokens,
      cacheWriteTokens: r.usage.cacheWriteTokens,
      costUsd: r.usage.costUsd,
      durationMs: r.durationMs,
      attempts: r.attempts,
      status: r.status,
      error: r.error ?? null,
    })
    .run();
  return id;
}

/** A system is generated before it exists; attach the call once it is saved. */
export function linkUsageToSystem(usageId: string, systemId: string, systemName: string) {
  getDb()
    .update(aiUsage)
    .set({ systemId, systemName })
    .where(and(eq(aiUsage.id, usageId), isNull(aiUsage.systemId)))
    .run();
}

export interface UsageTotals {
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  durationMs: number;
}

const TOTALS = {
  calls: sql<number>`COUNT(*)`,
  failed: sql<number>`COALESCE(SUM(CASE WHEN ${aiUsage.status} = 'error' THEN 1 ELSE 0 END), 0)`,
  inputTokens: sql<number>`COALESCE(SUM(${aiUsage.inputTokens}), 0)`,
  outputTokens: sql<number>`COALESCE(SUM(${aiUsage.outputTokens}), 0)`,
  cacheReadTokens: sql<number>`COALESCE(SUM(${aiUsage.cacheReadTokens}), 0)`,
  cacheWriteTokens: sql<number>`COALESCE(SUM(${aiUsage.cacheWriteTokens}), 0)`,
  costUsd: sql<number>`COALESCE(SUM(${aiUsage.costUsd}), 0)`,
  durationMs: sql<number>`COALESCE(SUM(${aiUsage.durationMs}), 0)`,
};

export type UsageRow = typeof aiUsage.$inferSelect;

export interface UsageReport {
  sinceDays: number;
  totals: UsageTotals;
  allTime: UsageTotals;
  /** One entry per local calendar day in the range, oldest first (empty days included). */
  daily: { day: string; calls: number; tokens: number; costUsd: number }[];
  byKind: ({ kind: UsageKind } & UsageTotals)[];
  byModel: ({ model: string; provider: "api" | "cli" } & UsageTotals)[];
  bySystem: ({ systemId: string | null; systemName: string | null } & UsageTotals)[];
  recent: UsageRow[];
}

function dayKey(ts: number) {
  return new Date(ts).toLocaleDateString("sv-SE"); // YYYY-MM-DD, local time
}

export function getUsageReport(sinceDays = 30): UsageReport {
  const db = getDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (sinceDays - 1));
  const since = start.getTime();
  const inRange = gte(aiUsage.createdAt, since);

  const totals = db.select(TOTALS).from(aiUsage).where(inRange).get()!;
  const allTime = db.select(TOTALS).from(aiUsage).get()!;

  // Bucket by local day in JS (SQLite has no notion of the user's timezone).
  const rows = db
    .select({
      createdAt: aiUsage.createdAt,
      tokens: sql<number>`${aiUsage.inputTokens} + ${aiUsage.outputTokens} + ${aiUsage.cacheReadTokens} + ${aiUsage.cacheWriteTokens}`,
      costUsd: aiUsage.costUsd,
    })
    .from(aiUsage)
    .where(inRange)
    .all();
  const days = new Map<string, { day: string; calls: number; tokens: number; costUsd: number }>();
  for (let i = 0; i < sinceDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d.getTime());
    days.set(key, { day: key, calls: 0, tokens: 0, costUsd: 0 });
  }
  for (const r of rows) {
    const b = days.get(dayKey(r.createdAt));
    if (!b) continue;
    b.calls++;
    b.tokens += r.tokens;
    b.costUsd += r.costUsd;
  }

  const byKind = db
    .select({ kind: aiUsage.kind, ...TOTALS })
    .from(aiUsage)
    .where(inRange)
    .groupBy(aiUsage.kind)
    .orderBy(desc(TOTALS.costUsd))
    .all();
  const byModel = db
    .select({ model: aiUsage.model, provider: aiUsage.provider, ...TOTALS })
    .from(aiUsage)
    .where(inRange)
    .groupBy(aiUsage.model, aiUsage.provider)
    .orderBy(desc(TOTALS.costUsd))
    .all();
  const bySystem = db
    .select({
      systemId: aiUsage.systemId,
      systemName: sql<string | null>`MAX(${aiUsage.systemName})`,
      ...TOTALS,
    })
    .from(aiUsage)
    .where(inRange)
    .groupBy(aiUsage.systemId)
    .orderBy(desc(TOTALS.costUsd))
    .all();
  const recent = db.select().from(aiUsage).orderBy(desc(aiUsage.createdAt)).limit(50).all();

  return { sinceDays, totals, allTime, daily: [...days.values()], byKind, byModel, bySystem, recent };
}

export function getSystemUsage(systemId: string): UsageTotals {
  return getDb().select(TOTALS).from(aiUsage).where(eq(aiUsage.systemId, systemId)).get()!;
}
