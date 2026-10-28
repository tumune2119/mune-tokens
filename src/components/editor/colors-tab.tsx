"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmButton } from "@/components/confirm-button";
import { CommitInput, SectionHead, normHex, validHex, validSegment } from "./controls";
import { contrastRatio, generateRamp, inkOn, oklchLabel, oklchOf, oklchToHex } from "@/lib/tokens/color";
import { STEP_SETS, type Ramp, type SystemSettings, type TokenSet } from "@/lib/tokens/schema";
import type { Update } from "./system-editor";

export function ColorsTab({ tokens, settings, update }: { tokens: TokenSet; settings: SystemSettings; update: Update }) {
  const [newName, setNewName] = useState("");
  const [newBase, setNewBase] = useState("#7c3aed");
  const steps = STEP_SETS[settings.steps];

  const addRamp = () => {
    const name = newName.trim().toLowerCase();
    if (validSegment(name) || tokens.ramps.some((r) => r.name === name)) return;
    update((d) => {
      d.ramps.push({ name, base: newBase, steps: generateRamp(newBase, steps) });
    });
    setNewName("");
  };

  return (
    <div>
      <SectionHead
        title="Colour ramps"
        description="Primitives. Steps are built in OKLCH from the base so they're perceptually even; click any step to adjust it."
      />
      <div className="space-y-4">
        {tokens.ramps.map((r, i) => (
          <RampRow key={i} ramp={r} index={i} tokens={tokens} settings={settings} update={update} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed p-4">
        <span className="text-sm text-muted-foreground">Add ramp</span>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addRamp()}
          placeholder="name, e.g. accent"
          className="h-8 w-40 rounded-lg bg-surface-2 font-mono text-xs"
        />
        <input type="color" value={newBase} onChange={(e) => setNewBase(e.target.value)} aria-label="Base colour" className="h-8 w-10 cursor-pointer rounded-lg bg-transparent" />
        <span className="font-mono text-xs text-muted-foreground">{newBase}</span>
        <Button size="sm" variant="outline" onClick={addRamp} disabled={!!validSegment(newName.trim().toLowerCase()) || tokens.ramps.some((r) => r.name === newName.trim().toLowerCase())}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}

function RampRow({ ramp, index, tokens, settings, update }: { ramp: Ramp; index: number; tokens: TokenSet; settings: SystemSettings; update: Update }) {
  const reduce = useReducedMotion();
  const steps = STEP_SETS[settings.steps];
  const users = tokens.semantic.filter((s) => [s.light, s.dark].some((ref) => ref.split("/")[1] === ramp.name)).length;

  const rebuild = (base: string) =>
    update((d) => {
      d.ramps[index] = { ...d.ramps[index], base, steps: generateRamp(base, steps) };
    });

  const rename = (name: string) =>
    update((d) => {
      const old = d.ramps[index].name;
      d.ramps[index].name = name;
      const fix = (ref: string) => (ref.split("/")[1] === old ? ref.replace(`color/${old}/`, `color/${name}/`) : ref);
      for (const s of d.semantic) {
        s.light = fix(s.light);
        s.dark = fix(s.dark);
      }
    });

  const generated = generateRamp(ramp.base, steps);
  const edited = Object.entries(ramp.steps).filter(([k, v]) => generated[k] && generated[k] !== v).length;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <CommitInput
          value={ramp.name}
          aria-label="Ramp name"
          mono
          className="w-36"
          validate={(v) => validSegment(v) ?? (tokens.ramps.some((r, j) => j !== index && r.name === v) ? "Name in use" : null)}
          onCommit={rename}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Base
          <input type="color" value={ramp.base.slice(0, 7)} onChange={(e) => rebuild(e.target.value)} aria-label={`${ramp.name} base colour`} className="h-8 w-10 cursor-pointer rounded-lg bg-transparent" />
        </label>
        <CommitInput value={ramp.base} aria-label="Base hex" mono className="w-24" validate={validHex} onCommit={(v) => rebuild(normHex(v))} />
        <span className="hidden font-mono text-[0.68rem] text-subtle-foreground xl:inline">{oklchLabel(ramp.base)}</span>
        <div className="ml-auto flex items-center gap-1">
          {edited > 0 && (
            <Button size="sm" variant="ghost" onClick={() => rebuild(ramp.base)} title="Discard hand edits and rebuild from the base">
              <RefreshCw /> Reset {edited} edited step{edited === 1 ? "" : "s"}
            </Button>
          )}
          <ConfirmButton
            title={`Delete ramp "${ramp.name}"?`}
            description={users ? `${users} semantic colour${users === 1 ? "" : "s"} use it and will show as broken until you repoint them.` : "No semantic colours use it."}
            confirmLabel="Delete ramp"
            destructive
            onConfirm={() => update((d) => void d.ramps.splice(index, 1))}
          >
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ramp ${ramp.name}`}>
              <Trash2 />
            </Button>
          </ConfirmButton>
        </div>
      </div>
      <div className="flex gap-1.5">
        {Object.entries(ramp.steps).map(([step, hex], i) => (
          <motion.div
            key={`${step}`}
            className="flex-1"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02, type: "spring", stiffness: 380, damping: 26 }}
          >
            <StepEditor ramp={ramp} step={step} hex={hex} generated={generated[step]} onChange={(h) => update((d) => void (d.ramps[index].steps[step] = h))} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function StepEditor({ ramp, step, hex, generated, onChange }: { ramp: Ramp; step: string; hex: string; generated?: string; onChange: (hex: string) => void }) {
  const { l, c, h } = oklchOf(hex);
  const edited = generated && generated !== hex;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          data-token-item
          className="group flex w-full flex-col overflow-hidden rounded-xl ring-1 ring-white/10 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white"
          aria-label={`color/${ramp.name}/${step} ${hex}${edited ? ", edited" : ""}`}
        >
          <span className="flex h-14 items-start justify-end p-1.5" style={{ background: hex, color: inkOn(hex) }}>
            {edited && <span className="size-1.5 rounded-full bg-current" title="Edited by hand" />}
            {hex === ramp.base && <span className="text-[0.6rem] font-semibold">BASE</span>}
          </span>
          <span className="bg-surface-2 px-1.5 py-1 text-left">
            <span className="block font-mono text-[0.65rem] text-foreground">{step}</span>
            <span className="block font-mono text-[0.6rem] text-subtle-foreground uppercase">{hex.slice(1)}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 rounded-2xl p-4" align="start">
        <p className="font-mono text-xs">color/{ramp.name}/{step}</p>
        <div className="mt-3 h-16 rounded-xl ring-1 ring-white/10" style={{ background: hex }} />
        <div className="mt-3 flex items-center gap-2">
          <input type="color" value={hex.slice(0, 7)} onChange={(e) => onChange(e.target.value)} aria-label="Pick colour" className="h-8 w-10 cursor-pointer rounded-lg bg-transparent" />
          <CommitInput value={hex} mono validate={validHex} onCommit={(v) => onChange(normHex(v))} aria-label="Hex" />
        </div>
        <div className="mt-3 space-y-2">
          <Slider label="L" value={l} min={0} max={1} step={0.005} onChange={(v) => onChange(oklchToHex(v, c, h))} format={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider label="C" value={c} min={0} max={0.37} step={0.002} onChange={(v) => onChange(oklchToHex(l, v, h))} format={(v) => v.toFixed(3)} />
          <Slider label="H" value={h} min={0} max={360} step={1} onChange={(v) => onChange(oklchToHex(l, c, v))} format={(v) => v.toFixed(0)} />
        </div>
        <p className="mt-3 font-mono text-[0.65rem] text-muted-foreground">{oklchLabel(hex)}</p>
        <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
          vs white {contrastRatio(hex, "#ffffff").toFixed(2)} · vs black {contrastRatio(hex, "#000000").toFixed(2)}
        </p>
        {edited && (
          <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => onChange(generated!)}>
            <RefreshCw /> Reset to generated
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-3 font-mono text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-white"
        aria-label={`OKLCH ${label}`}
      />
      <span className="w-12 text-right font-mono text-[0.65rem] text-muted-foreground">{format(value)}</span>
    </label>
  );
}
