"use client";

import { useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import { CommitInput, SectionHead, normHex, validHex, validSegment } from "./controls";
import { generateRamp } from "@/lib/tokens/color";
import { STEP_SETS, type SystemSettings, type TokenSet } from "@/lib/tokens/schema";
import type { Update } from "./system-editor";

/**
 * Extra brands: each overrides some ramps (usually just "brand"/"accent"); semantic colours,
 * type and spacing are shared. Exported as data-brand CSS and as Primitives modes in Figma.
 */
export function BrandsPanel({ tokens, settings, update }: { tokens: TokenSet; settings: SystemSettings; update: Update }) {
  const [name, setName] = useState("");
  const steps = STEP_SETS[settings.steps];
  const valid = !validSegment(name) && name !== "default" && !tokens.brands.some((b) => b.name === name);

  return (
    <section className="mt-10">
      <SectionHead
        title="Brands"
        description="Alternative brands share every semantic mapping, type and spacing; they only swap the ramps you override. Switch with data-brand on <html>; in Figma they're modes of Primitives."
      />
      <div className="space-y-3">
        {tokens.brands.map((b, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <CommitInput
                value={b.name}
                mono
                className="w-40"
                aria-label="Brand name"
                validate={(v) => validSegment(v) ?? (v === "default" ? "Reserved" : tokens.brands.some((x, j) => j !== i && x.name === v) ? "Name in use" : null)}
                onCommit={(v) => update((d) => void (d.brands[i].name = v))}
              />
              <span className="text-xs text-muted-foreground">
                {b.ramps.length ? `overrides ${b.ramps.map((r) => r.name).join(", ")}` : "no overrides yet — same as default"}
              </span>
              <ConfirmButton title={`Delete brand ${b.name}?`} description="Its ramp overrides are removed." confirmLabel="Delete brand" destructive onConfirm={() => update((d) => void d.brands.splice(i, 1))}>
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`Delete brand ${b.name}`}>
                  <Trash2 />
                </Button>
              </ConfirmButton>
            </div>
            <div className="space-y-2">
              {tokens.ramps.map((main) => {
                const o = b.ramps.find((r) => r.name === main.name);
                const shown = o ?? main;
                return (
                  <div key={main.name} className="flex items-center gap-3" data-token-item>
                    <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">{main.name}</span>
                    <input
                      type="color"
                      value={shown.base.slice(0, 7)}
                      aria-label={`${b.name} ${main.name} base`}
                      className="h-7 w-9 shrink-0 cursor-pointer rounded-md bg-transparent"
                      onChange={(e) =>
                        update((d) => {
                          const brand = d.brands[i];
                          const ramp = { name: main.name, base: e.target.value, steps: generateRamp(e.target.value, steps) };
                          const j = brand.ramps.findIndex((r) => r.name === main.name);
                          if (j === -1) brand.ramps.push(ramp);
                          else brand.ramps[j] = ramp;
                        })
                      }
                    />
                    {o ? (
                      <CommitInput
                        value={o.base}
                        mono
                        className="w-24"
                        aria-label="Base hex"
                        validate={validHex}
                        onCommit={(v) =>
                          update((d) => {
                            const r = d.brands[i].ramps.find((x) => x.name === main.name)!;
                            r.base = normHex(v);
                            r.steps = generateRamp(r.base, steps);
                          })
                        }
                      />
                    ) : (
                      <span className="w-24 font-mono text-xs text-subtle-foreground">default</span>
                    )}
                    <div className={o ? "flex flex-1 gap-0.5" : "flex flex-1 gap-0.5 opacity-40"}>
                      {Object.entries(shown.steps).map(([s, h]) => (
                        <span key={s} className="h-6 flex-1 rounded-sm" style={{ background: h }} title={`${s} ${h}`} />
                      ))}
                    </div>
                    {o && (
                      <Button size="icon-sm" variant="ghost" aria-label="Use default" title="Use the default brand's ramp" onClick={() => update((d) => void (d.brands[i].ramps = d.brands[i].ramps.filter((r) => r.name !== main.name)))}>
                        <RotateCcw />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed p-4">
          <span className="text-sm text-muted-foreground">Add brand</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            onKeyDown={(e) => e.key === "Enter" && valid && (update((d) => void d.brands.push({ name, ramps: [] })), setName(""))}
            placeholder="e.g. sub-brand"
            className="h-8 w-44 rounded-lg bg-surface-2 font-mono text-xs"
          />
          <Button size="sm" variant="outline" disabled={!valid} onClick={() => (update((d) => void d.brands.push({ name, ramps: [] })), setName(""))}>
            <Plus /> Add
          </Button>
        </div>
      </div>
    </section>
  );
}
