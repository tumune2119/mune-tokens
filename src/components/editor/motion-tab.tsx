"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommitInput, NumberInput, SectionHead, validSegment } from "./controls";
import { bezier } from "@/lib/export/css";
import type { Easing, TokenSet } from "@/lib/tokens/schema";
import { DEFAULT_MOTION } from "@/lib/tokens/defaults";
import type { Update } from "./system-editor";

/** The curve, drawn statically; hover the box to play it (skipped under reduced motion). */
function Curve({ e, duration }: { e: Easing; duration: number }) {
  const [x1, y1, x2, y2] = e.value;
  const P = (x: number, y: number) => `${(8 + x * 64).toFixed(1)} ${(76 - y * 64).toFixed(1)}`;
  return (
    <div className="group flex items-center gap-3">
      <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0 overflow-visible rounded-lg bg-surface-2" aria-hidden>
        <path d={`M${P(0, 0)} L${P(1, 1)}`} stroke="#3f3f3f" strokeDasharray="3 3" fill="none" />
        <path d={`M${P(0, 0)} C${P(x1, y1)} ${P(x2, y2)} ${P(1, 1)}`} stroke="#fff" strokeWidth="2" fill="none" />
      </svg>
      <div className="relative h-8 w-40 rounded-lg bg-surface-2" title="Hover to preview">
        <span
          className="absolute top-1 left-1 size-6 rounded-md bg-white group-hover:left-[calc(100%-1.75rem)] motion-reduce:transition-none"
          style={{ transitionProperty: "left", transitionDuration: `${duration}ms`, transitionTimingFunction: bezier(e.value) }}
        />
      </div>
    </div>
  );
}

export function MotionTab({ tokens, update }: { tokens: TokenSet; update: Update }) {
  const { durations, easings } = tokens.motion;
  const preview = durations.find((d) => d.name === "base")?.value ?? durations[Math.floor(durations.length / 2)]?.value ?? 240;
  if (!durations.length && !easings.length) {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed py-16 text-center">
        <p className="font-medium">No motion tokens yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Start from a standard set of durations and easings, or regenerate this group with Claude (G).</p>
        <Button className="mt-5" onClick={() => update((d) => void (d.motion = structuredClone(DEFAULT_MOTION)))}>
          <Plus /> Add a starter set
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          title="Durations"
          description="Milliseconds. Keep a short ladder; components pick from it."
          actions={
            <Button size="sm" variant="outline" onClick={() => update((d) => void d.motion.durations.push({ name: `d${d.motion.durations.length + 1}`, value: 300 }))}>
              <Plus /> Add
            </Button>
          }
        />
        <div className="space-y-1.5 rounded-2xl border bg-card p-3">
          {durations.map((d, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-surface-2" data-token-item>
              <span className="w-32 shrink-0 font-mono text-xs text-subtle-foreground">motion/duration/</span>
              <CommitInput
                value={d.name}
                mono
                className="w-28"
                aria-label="Name"
                validate={(v) => validSegment(v) ?? (durations.some((x, j) => j !== i && x.name === v) ? "Name in use" : null)}
                onCommit={(v) => update((t) => void (t.motion.durations[i].name = v))}
              />
              <NumberInput value={d.value} min={0} max={10000} step={1} suffix="ms" className="w-28" aria-label="Duration" onCommit={(v) => update((t) => void (t.motion.durations[i].value = v))} />
              <span className="h-3 rounded-full bg-white/85" style={{ width: Math.max(2, Math.min(d.value, 1000) / 2) }} aria-hidden />
              <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Delete ${d.name}`} onClick={() => update((t) => void t.motion.durations.splice(i, 1))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {!durations.length && <p className="p-3 text-sm text-muted-foreground">None yet.</p>}
        </div>
      </section>

      <section>
        <SectionHead
          title="Easings"
          description="cubic-bezier(x1, y1, x2, y2). Hover a track to play it at the base duration."
          actions={
            <Button size="sm" variant="outline" onClick={() => update((d) => void d.motion.easings.push({ name: `ease-${d.motion.easings.length + 1}`, value: [0.4, 0, 0.2, 1] }))}>
              <Plus /> Add
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {easings.map((e, i) => (
            <div key={i} className="space-y-3 rounded-2xl border bg-card p-4" data-token-item>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-subtle-foreground">motion/easing/</span>
                <CommitInput
                  value={e.name}
                  mono
                  className="w-36"
                  aria-label="Name"
                  validate={(v) => validSegment(v) ?? (easings.some((x, j) => j !== i && x.name === v) ? "Name in use" : null)}
                  onCommit={(v) => update((t) => void (t.motion.easings[i].name = v))}
                />
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Delete ${e.name}`} onClick={() => update((t) => void t.motion.easings.splice(i, 1))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(["x1", "y1", "x2", "y2"] as const).map((label, k) => (
                  <NumberInput
                    key={label}
                    value={e.value[k]}
                    min={k % 2 === 0 ? 0 : -2}
                    max={k % 2 === 0 ? 1 : 3}
                    aria-label={label}
                    onCommit={(v) =>
                      update((t) => {
                        const next = [...t.motion.easings[i].value] as Easing["value"];
                        next[k] = v;
                        t.motion.easings[i].value = next;
                      })
                    }
                  />
                ))}
              </div>
              <Curve e={e} duration={preview} />
            </div>
          ))}
        </div>
        {!easings.length && <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No easings yet.</p>}
      </section>
    </div>
  );
}
