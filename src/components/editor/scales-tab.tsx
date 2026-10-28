"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommitInput, NumberInput, SectionHead, normHex, validHex, validSegment } from "./controls";
import { shadowCss } from "@/lib/export/css";
import { cssColor, hexWithAlpha } from "@/lib/tokens/color";
import type { TokenSet } from "@/lib/tokens/schema";
import type { Update } from "./system-editor";

type DimKey = "spacing" | "radius" | "breakpoints";

const META: Record<DimKey, { title: string; prefix: string; description: string; max: number }> = {
  spacing: { title: "Spacing", prefix: "space", description: "Padding, gaps and margins in px. Names are usually multipliers of a 4px base.", max: 2000 },
  radius: { title: "Radius", prefix: "radius", description: "Corner radii in px. Use 9999 for fully rounded.", max: 9999 },
  breakpoints: { title: "Breakpoints", prefix: "breakpoint", description: "Minimum viewport widths in px.", max: 10000 },
};

export function DimensionTab({ kind, tokens, update }: { kind: DimKey; tokens: TokenSet; update: Update }) {
  const meta = META[kind];
  const items = tokens[kind];
  const maxValue = Math.max(1, ...items.map((d) => d.value));

  return (
    <div>
      <SectionHead
        title={meta.title}
        description={meta.description}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              update((d) => {
                let n = d[kind].length + 1;
                while (d[kind].some((x) => x.name === String(n))) n++;
                const last = d[kind][d[kind].length - 1]?.value ?? 0;
                d[kind].push({ name: String(n), value: kind === "radius" ? last + 4 : last + 8 });
              })
            }
          >
            <Plus /> Add
          </Button>
        }
      />
      <div className="space-y-1.5 rounded-2xl border bg-card p-3">
        {items.map((d, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-surface-2">
            <span className="w-24 shrink-0 font-mono text-xs text-subtle-foreground">{meta.prefix}/</span>
            <CommitInput
              value={d.name}
              mono
              className="w-24"
              aria-label="Name"
              validate={(v) => validSegment(v) ?? (items.some((x, j) => j !== i && x.name === v) ? "Name in use" : null)}
              onCommit={(v) => update((t) => void (t[kind][i].name = v))}
            />
            <NumberInput value={d.value} min={0} max={meta.max} suffix="px" className="w-24" onCommit={(v) => update((t) => void (t[kind][i].value = v))} aria-label="Value" />
            <div className="flex min-w-0 flex-1 items-center">
              {kind === "radius" ? (
                <span className="size-12 border-2 border-white/80 bg-surface-3" style={{ borderRadius: Math.min(d.value, 9999) }} aria-hidden />
              ) : kind === "spacing" ? (
                <span className="h-4 rounded-sm bg-white/85" style={{ width: Math.min(d.value, 800) }} aria-hidden />
              ) : (
                <span className="h-3 rounded-sm border border-white/60" style={{ width: `${(d.value / maxValue) * 100}%` }} aria-hidden />
              )}
            </div>
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${meta.prefix}/${d.name}`} onClick={() => update((t) => void t[kind].splice(i, 1))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="p-3 text-sm text-muted-foreground">None yet.</p>}
      </div>
    </div>
  );
}

const alphaOf = (hex: string) => (hex.length === 9 ? Math.round((parseInt(hex.slice(7), 16) / 255) * 100) : 100);

export function ShadowsTab({ tokens, update }: { tokens: TokenSet; update: Update }) {
  return (
    <div>
      <SectionHead
        title="Shadows"
        description="Each shadow can stack several layers. Colour is hex plus opacity; becomes a Figma effect style."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              update((d) => {
                let n = d.shadows.length + 1;
                while (d.shadows.some((s) => s.name === `shadow-${n}`)) n++;
                d.shadows.push({ name: `shadow-${n}`, layers: [{ x: 0, y: 4, blur: 12, spread: -2, color: "#0000001f" }] });
              })
            }
          >
            <Plus /> Add shadow
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {tokens.shadows.map((s, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-subtle-foreground">shadow/</span>
              <CommitInput
                value={s.name}
                mono
                className="w-32"
                aria-label="Shadow name"
                validate={(v) => validSegment(v) ?? (tokens.shadows.some((x, j) => j !== i && x.name === v) ? "Name in use" : null)}
                onCommit={(v) => update((d) => void (d.shadows[i].name = v))}
              />
              <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Delete shadow ${s.name}`} onClick={() => update((d) => void d.shadows.splice(i, 1))}>
                <Trash2 />
              </Button>
            </div>
            {/* Previewed on white so dark shadows are visible regardless of the app chrome. */}
            <div className="mt-4 grid h-36 place-items-center rounded-xl bg-[#f5f5f5]">
              <div className="h-20 w-40 rounded-xl bg-white" style={{ boxShadow: shadowCss(s) }} />
            </div>
            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-[repeat(4,1fr)_1.6fr_0.9fr_auto] gap-1.5 text-[0.65rem] text-subtle-foreground">
                <span>X</span>
                <span>Y</span>
                <span>Blur</span>
                <span>Spread</span>
                <span>Colour</span>
                <span>Opacity</span>
                <span className="w-7" />
              </div>
              {s.layers.map((l, j) => (
                <div key={j} className="grid grid-cols-[repeat(4,1fr)_1.6fr_0.9fr_auto] items-center gap-1.5">
                  {(["x", "y", "blur", "spread"] as const).map((k) => (
                    <NumberInput
                      key={k}
                      value={l[k]}
                      min={k === "blur" ? 0 : -200}
                      max={k === "blur" ? 400 : 200}
                      onCommit={(v) => update((d) => void (d.shadows[i].layers[j][k] = v))}
                      aria-label={k}
                    />
                  ))}
                  <CommitInput
                    value={l.color.slice(0, 7)}
                    mono
                    aria-label="Colour"
                    validate={validHex}
                    onCommit={(v) => update((d) => void (d.shadows[i].layers[j].color = hexWithAlpha(normHex(v).slice(0, 7), alphaOf(l.color) / 100)))}
                  />
                  <NumberInput
                    value={alphaOf(l.color)}
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    aria-label="Opacity"
                    onCommit={(v) => update((d) => void (d.shadows[i].layers[j].color = hexWithAlpha(l.color.slice(0, 7), v / 100)))}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove layer"
                    disabled={s.layers.length === 1}
                    onClick={() => update((d) => void d.shadows[i].layers.splice(j, 1))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  className="-ml-2"
                  disabled={s.layers.length >= 6}
                  onClick={() => update((d) => void d.shadows[i].layers.push({ x: 0, y: 8, blur: 16, spread: -4, color: "#0000001a" }))}
                >
                  <Plus /> Layer
                </Button>
                <span className="truncate pl-4 font-mono text-[0.65rem] text-subtle-foreground" title={shadowCss(s)}>
                  {s.layers.map((l) => cssColor(l.color)).join(" · ")}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {tokens.shadows.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No shadows yet.</p>}
    </div>
  );
}
