"use client";

import { useEffect, useMemo, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DiffSummary, DiffView } from "./diff-view";
import { diffTokens } from "@/lib/tokens/diff";
import { relativeTime } from "@/lib/format";
import type { SystemSettings, TokenSet } from "@/lib/tokens/schema";
import { cn } from "@/lib/utils";

interface VersionMeta {
  version: number;
  name: string;
  createdAt: number;
  tokenCount: number;
}
interface VersionFull {
  version: number;
  name: string;
  settings: SystemSettings;
  tokens: TokenSet;
}

/**
 * Every saved version, with a diff against the current draft. Restoring loads that version into
 * the draft (nothing is saved until Save system, which makes it the newest version).
 */
export function HistoryDialog({
  open,
  onOpenChange,
  systemId,
  current,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  systemId: string;
  current: TokenSet;
  onRestore: (v: VersionFull) => void;
}) {
  const [list, setList] = useState<VersionMeta[] | null>(null);
  const [selected, setSelected] = useState<VersionFull | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/systems/${systemId}/versions`)
      .then((r) => r.json())
      .then((l: VersionMeta[]) => {
        if (!live) return;
        setList(l);
        if (l[1]) load(l[1].version);
        else if (l[0]) load(l[0].version);
      })
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, systemId]);

  async function load(version: number) {
    const res = await fetch(`/api/systems/${systemId}/versions/${version}`);
    if (res.ok) setSelected(await res.json());
  }

  // What restoring the selected version would change in the current draft.
  const diff = useMemo(() => (selected ? diffTokens(current, selected.tokens) : null), [selected, current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" /> Version history
          </DialogTitle>
          <DialogDescription>Each save keeps a snapshot. Pick one to see what restoring it would change in your draft.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <ul className="max-h-[60dvh] space-y-0.5 overflow-y-auto rounded-xl border p-1.5">
            {list === null && <li className="shimmer h-10 rounded-lg" />}
            {list?.map((v) => (
              <li key={v.version}>
                <button
                  onClick={() => load(v.version)}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    selected?.version === v.version ? "bg-white text-black" : "hover:bg-surface-2",
                  )}
                >
                  <span className="flex justify-between font-mono text-xs">
                    <span>v{v.version}</span>
                    <span className="opacity-70" suppressHydrationWarning>
                      {relativeTime(v.createdAt)}
                    </span>
                  </span>
                  <span className="block truncate text-xs opacity-70">
                    {v.name} · {v.tokenCount} tokens
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 space-y-3">
            {selected && diff ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    Draft → <span className="font-mono">v{selected.version}</span> <DiffSummary diff={diff} />
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      onRestore(selected);
                      onOpenChange(false);
                      toast(`v${selected.version} loaded into the draft. Save to keep it.`);
                    }}
                  >
                    <RotateCcw /> Restore into draft
                  </Button>
                </div>
                <DiffView diff={diff} empty="This version matches your draft." />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Pick a version.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
