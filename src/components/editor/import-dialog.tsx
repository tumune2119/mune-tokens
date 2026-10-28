"use client";

import { useRef, useState } from "react";
import { Check, FileJson } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DiffSummary, DiffView } from "./diff-view";
import { importDtcg } from "@/lib/tokens/import";
import { diffTokens } from "@/lib/tokens/diff";
import type { TokenSet } from "@/lib/tokens/schema";

/**
 * Round trip: a tokens JSON (e.g. exported from Figma by the MUNE Tokens Importer plugin, or any
 * W3C tokens file) replaces the groups it contains; groups it doesn't have are kept. Preview first.
 */
export function ImportDialog({ open, onOpenChange, current, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; current: TokenSet; onApply: (next: TokenSet) => void }) {
  const [next, setNext] = useState<{ set: TokenSet; file: string; groups: string[]; skipped: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function read(file: File | undefined) {
    if (!file) return;
    try {
      const { set, skipped } = importDtcg(JSON.parse(await file.text()));
      const merged: TokenSet = structuredClone(current);
      const groups: string[] = [];
      const take = <K extends keyof TokenSet>(key: K, label: string, present: boolean) => {
        if (!present) return;
        merged[key] = set[key];
        groups.push(label);
      };
      take("ramps", "colour ramps", set.ramps.length > 0);
      take("semantic", "semantic colours", set.semantic.length > 0);
      take("fonts", "fonts", set.fonts.length > 0);
      take("typeScale", "type scale", set.typeScale.length > 0);
      take("spacing", "spacing", set.spacing.length > 0);
      take("radius", "radius", set.radius.length > 0);
      take("breakpoints", "breakpoints", set.breakpoints.length > 0);
      take("shadows", "shadows", set.shadows.length > 0);
      take("motion", "motion", set.motion.durations.length + set.motion.easings.length > 0);
      take("brands", "brands", set.brands.length > 0);
      if (!groups.length) return toast.error("No design tokens found in that file.");
      setNext({ set: merged, file: file.name, groups, skipped });
    } catch (err) {
      toast.error(`Couldn't read that file: ${(err as Error).message}`);
    }
  }

  const diff = next ? diffTokens(current, next.set) : null;
  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), !o && setNext(null))}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import tokens into this system</DialogTitle>
          <DialogDescription>
            From Figma (MUNE Tokens Importer → <span className="text-foreground">Export from Figma</span>) or any W3C tokens JSON. Groups in the file replace the same groups in your draft; the rest stays.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => input.current?.click()}>
            <FileJson /> Choose JSON…
          </Button>
          <input ref={input} type="file" hidden accept=".json,application/json" onChange={(e) => (read(e.target.files?.[0]), (e.target.value = ""))} />
          {next && (
            <span className="text-sm text-muted-foreground">
              <span className="font-mono">{next.file}</span> · {next.groups.join(", ")}
              {next.skipped > 0 && ` · ${next.skipped} unsupported skipped`}
            </span>
          )}
        </div>
        {diff && (
          <div className="space-y-2">
            <DiffSummary diff={diff} />
            <DiffView diff={diff} empty="The file matches your draft." />
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!next}
            onClick={() => {
              if (!next) return;
              onApply(next.set);
              onOpenChange(false);
              setNext(null);
              toast("Imported into the draft. Review, then save.");
            }}
          >
            <Check /> Apply to draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
