"use client";

import { useRef, useState } from "react";
import { Check, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { costLine } from "@/components/new-system/new-system";
import { useGoogleFonts } from "./use-google-fonts";
import { streamAi } from "@/lib/client/ai-stream";
import { buildTokenSet, type GroupResult } from "@/lib/ai/token-schemas";
import { shadowCss } from "@/lib/export/css";
import { resolveRef } from "@/lib/tokens/color";
import { GROUP_LABELS, modesOf, type GroupKey, type SystemSettings, type TokenSet } from "@/lib/tokens/schema";
import type { UsageInfo } from "@/lib/ai/events";

export interface RegenerateContext {
  systemId: string | null;
  name: string;
  brief: string;
  settings: SystemSettings;
  tokens: TokenSet;
}

/** "Regenerate this group": guidance → streamed result → preview with its cost → apply only on confirm. */
export function RegenerateDialog({
  group,
  onOpenChange,
  ctx,
  onApply,
}: {
  group: GroupKey | null;
  onOpenChange: (open: boolean) => void;
  ctx: RegenerateContext;
  onApply: (next: TokenSet, usageId: string) => void;
}) {
  const [guidance, setGuidance] = useState("");
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [result, setResult] = useState<{ next: TokenSet; usage: UsageInfo } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = (open: boolean) => {
    if (open) return;
    abortRef.current?.abort();
    setResult(null);
    setChars(0);
    onOpenChange(false);
  };

  async function run() {
    if (!group) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setResult(null);
    setChars(0);
    try {
      const { data, usage } = await streamAi<GroupResult>(
        "/api/ai/regenerate",
        { systemId: ctx.systemId, systemName: ctx.name, group, guidance, brief: ctx.brief, settings: ctx.settings, tokens: ctx.tokens },
        { onText: (d) => setChars((c) => c + d.length), onRetry: () => setChars(0) },
        ctrl.signal,
      );
      setResult({ next: buildTokenSet(data, ctx.settings, ctx.tokens), usage });
    } catch (err) {
      if (!ctrl.signal.aborted) toast.error((err as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <Dialog open={group !== null} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Regenerate {group ? GROUP_LABELS[group].toLowerCase() : ""}</DialogTitle>
          <DialogDescription>Claude rewrites this group only. You&apos;ll see the result and its cost before anything changes.</DialogDescription>
        </DialogHeader>

        <Textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy && run()}
          placeholder={group === "ramps" ? "warmer neutrals, a more saturated brand" : group === "typography" ? "tighter type scale, a serif for headings" : "optional guidance"}
          rows={3}
          disabled={busy}
          className="rounded-xl bg-surface-2"
        />

        {busy && (
          <div className="space-y-2">
            <div className="shimmer h-16 rounded-xl" />
            <p className="font-mono text-xs text-muted-foreground">Writing… {chars.toLocaleString()} chars</p>
          </div>
        )}

        {result && group && (
          <div className="space-y-3">
            <p className="font-mono text-xs text-muted-foreground">
              {(result.usage.durationMs / 1000).toFixed(1)}s · {costLine(result.usage)}
            </p>
            <GroupPreview group={group} set={result.next} settings={ctx.settings} />
          </div>
        )}

        <DialogFooter>
          {busy ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              <Square className="fill-current" /> Cancel
            </Button>
          ) : result ? (
            <>
              <Button variant="outline" onClick={run}>
                <Sparkles /> Try again
              </Button>
              <Button
                onClick={() => {
                  onApply(result.next, result.usage.id);
                  close(false);
                }}
              >
                <Check /> Apply to draft
              </Button>
            </>
          ) : (
            <Button onClick={run}>
              <Sparkles /> Generate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupPreview({ group, set, settings }: { group: GroupKey; set: TokenSet; settings: SystemSettings }) {
  useGoogleFonts(group === "typography" ? set.fonts.map((f) => f.family) : []);
  if (group === "ramps") {
    return (
      <div className="space-y-2">
        {set.ramps.map((r) => (
          <div key={r.name} className="flex items-center gap-2">
            <span className="w-20 truncate font-mono text-xs text-muted-foreground">{r.name}</span>
            <div className="flex flex-1 gap-0.5">
              {Object.entries(r.steps).map(([s, h]) => (
                <span key={s} className="h-8 flex-1 rounded ring-1 ring-white/10" style={{ background: h }} title={`${s} ${h}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (group === "semantic") {
    const modes = modesOf(settings);
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {set.semantic.map((s) => (
          <div key={s.path} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1">
            {modes.map((m) => (
              <span key={m} className="size-4 shrink-0 rounded ring-1 ring-white/15" style={{ background: resolveRef(set, s[m]) ?? "transparent" }} />
            ))}
            <span className="truncate font-mono text-[0.7rem]">{s.path}</span>
          </div>
        ))}
      </div>
    );
  }
  if (group === "typography") {
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">{set.fonts.map((f) => `${f.key}: ${f.family}`).join(" · ")}</p>
        {set.typeScale.map((t) => {
          const f = set.fonts.find((x) => x.key === t.font);
          return (
            <div key={t.name} className="flex items-baseline gap-3">
              <span className="w-24 shrink-0 font-mono text-[0.7rem] text-subtle-foreground">{t.name}</span>
              <span className="w-24 shrink-0 font-mono text-[0.7rem] text-subtle-foreground">
                {t.size}/{t.lineHeight} {t.weight}
              </span>
              <span className="truncate" style={{ fontFamily: f ? `"${f.family}", ${f.fallback}` : undefined, fontSize: Math.min(t.size, 48), fontWeight: t.weight, letterSpacing: `${t.letterSpacing}em` }}>
                The quick brown fox
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  if (group === "shadows") {
    return (
      <div className="flex flex-wrap gap-6 rounded-xl bg-[#f5f5f5] p-6">
        {set.shadows.map((s) => (
          <div key={s.name} className="grid h-16 w-28 place-items-center rounded-xl bg-white font-mono text-xs text-black" style={{ boxShadow: shadowCss(s) }}>
            {s.name}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {set[group].map((d) => (
        <span key={d.name} className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs">
          {d.name}: {d.value}px
        </span>
      ))}
    </div>
  );
}
