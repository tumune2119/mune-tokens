"use client";

import { Minus, Pencil, Plus } from "lucide-react";
import { diffSize, type FlatToken, type TokenDiff } from "@/lib/tokens/diff";

function Value({ t }: { t: FlatToken }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {t.swatch && <span className="size-3.5 shrink-0 rounded ring-1 ring-white/20" style={{ background: t.swatch }} />}
      <span className="truncate" title={t.value}>
        {t.value}
      </span>
    </span>
  );
}

/** Token-level changes: added / removed / changed, each marked by icon and word (not colour). */
export function DiffView({ diff, empty = "No differences." }: { diff: TokenDiff; empty?: string }) {
  if (!diffSize(diff)) return <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted-foreground">{empty}</p>;
  const row = "grid grid-cols-[16px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b px-3 py-1.5 font-mono text-[0.7rem] last:border-0";
  return (
    <div className="max-h-[50dvh] overflow-y-auto rounded-xl border">
      <div className={`${row} sticky top-0 bg-popover text-[0.65rem] tracking-wide text-muted-foreground uppercase`}>
        <span />
        <span>Token</span>
        <span>Before</span>
        <span>After</span>
      </div>
      {diff.changed.map((c) => (
        <div key={c.path} className={row}>
          <Pencil className="size-3" aria-label="changed" />
          <span className="truncate">{c.path}</span>
          <Value t={c.before} />
          <Value t={c.after} />
        </div>
      ))}
      {diff.added.map((c) => (
        <div key={c.path} className={row}>
          <Plus className="size-3" aria-label="added" />
          <span className="truncate">{c.path}</span>
          <span className="text-subtle-foreground">—</span>
          <Value t={c.after} />
        </div>
      ))}
      {diff.removed.map((c) => (
        <div key={c.path} className={row}>
          <Minus className="size-3" aria-label="removed" />
          <span className="truncate">{c.path}</span>
          <Value t={c.before} />
          <span className="text-subtle-foreground">removed</span>
        </div>
      ))}
    </div>
  );
}

export function DiffSummary({ diff }: { diff: TokenDiff }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {diff.changed.length} changed · {diff.added.length} added · {diff.removed.length} removed
    </span>
  );
}
