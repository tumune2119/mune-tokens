import "server-only";
import { z } from "zod";
import { getDb } from "./db";
import { exportEvents, systems } from "./db/schema";
import { SystemSettingsSchema, TokenSetSchema } from "./tokens/schema";

export const BackupSchema = z.object({
  app: z.literal("mune-tokens"),
  version: z.literal(1),
  exportedAt: z.number().optional(),
  systems: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      slug: z.string().min(1),
      brief: z.string().default(""),
      settings: SystemSettingsSchema,
      tokens: TokenSetSchema,
      status: z.enum(["active", "archived"]).default("active"),
      version: z.number().int().min(1).default(1),
      createdAt: z.number(),
      updatedAt: z.number(),
      exportedAt: z.number().nullish(),
    }),
  ),
});
export type BackupFile = z.infer<typeof BackupSchema>;

export function exportAll(): BackupFile {
  const rows = getDb().select().from(systems).all();
  return {
    app: "mune-tokens",
    version: 1,
    exportedAt: Date.now(),
    systems: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      brief: r.brief,
      settings: SystemSettingsSchema.parse(JSON.parse(r.settings)),
      tokens: TokenSetSchema.parse(JSON.parse(r.tokens)),
      status: r.status,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      exportedAt: r.exportedAt,
    })),
  };
}

/** Merge adds systems that aren't here yet (same id = skipped); Replace swaps everything. Returns systems written. */
export function importBackup(data: BackupFile, mode: "merge" | "replace"): number {
  const db = getDb();
  return db.transaction((tx) => {
    if (mode === "replace") {
      tx.delete(systems).run();
      tx.delete(exportEvents).run();
    }
    const existing = new Set(tx.select({ id: systems.id }).from(systems).all().map((r) => r.id));
    let n = 0;
    for (const s of data.systems) {
      if (existing.has(s.id)) continue;
      tx.insert(systems)
        .values({
          id: s.id,
          name: s.name,
          slug: s.slug,
          brief: s.brief,
          settings: JSON.stringify(s.settings),
          tokens: JSON.stringify(s.tokens),
          status: s.status,
          version: s.version,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          exportedAt: s.exportedAt ?? null,
        })
        .run();
      n++;
    }
    return n;
  });
}
