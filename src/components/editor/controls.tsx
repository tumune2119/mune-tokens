"use client";

import { useState } from "react";
import { Check, CircleAlert, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { gradeContrast, isHex, resolveRef, type ContrastGrade } from "@/lib/tokens/color";
import { hexSchema, type TokenSet } from "@/lib/tokens/schema";
import { cn } from "@/lib/utils";

/** Text input that keeps local state and commits on blur / Enter (Escape reverts). */
export function CommitInput({
  value,
  onCommit,
  validate,
  className,
  mono,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  /** Return an error message to reject the value. */
  validate?: (v: string) => string | null;
  className?: string;
  mono?: boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // Follow outside changes (undo, regenerate) without an effect.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setLocal(value);
    setError(null);
  }
  const commit = () => {
    const v = local.trim();
    if (v === value) return setError(null);
    const err = validate?.(v) ?? null;
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onCommit(v);
  };
  return (
    <Input
      {...rest}
      value={local}
      aria-invalid={!!error || undefined}
      title={error ?? rest.title}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setLocal(value);
          setError(null);
        }
      }}
      className={cn("h-8 rounded-lg bg-surface-2", mono && "font-mono text-xs", className)}
    />
  );
}

export function NumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  className,
  suffix,
  ...rest
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "min" | "max" | "step">) {
  return (
    <div className={cn("relative", className)}>
      <CommitInput
        {...rest}
        value={String(value)}
        inputMode="decimal"
        mono
        className={cn("w-full tabular-nums", suffix && "pr-7")}
        validate={(v) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return "Enter a number";
          if (min !== undefined && n < min) return `Min ${min}`;
          if (max !== undefined && n > max) return `Max ${max}`;
          return null;
        }}
        onCommit={(v) => onCommit(step && step >= 1 ? Math.round(Number(v)) : Number(v))}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.65rem] text-subtle-foreground">{suffix}</span>}
    </div>
  );
}

export const validSegment = (v: string) => (/^[a-z0-9][a-z0-9-]*$/.test(v) ? null : "Lower-case letters, digits and dashes");
export const validPath = (v: string) => (/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(v) ? null : 'Use a path like "body/md"');
export const validHex = (v: string) => (hexSchema.safeParse(v).success ? null : "Hex like #1a2b3c");
export const normHex = (v: string) => hexSchema.parse(v) as string;

export function Swatch({ hex, className, title }: { hex: string | null; className?: string; title?: string }) {
  return (
    <span className={cn("checker inline-block overflow-hidden rounded-md ring-1 ring-white/15", className)} title={title}>
      <span className="block size-full" style={{ background: hex ?? "transparent" }} />
      {!hex && <span className="sr-only">missing</span>}
    </span>
  );
}

/** Picks a primitive ("color/neutral/50") or a raw hex for a semantic colour. */
export function RefPicker({ set, value, onChange, label }: { set: TokenSet; value: string; onChange: (v: string) => void; label: string }) {
  const hex = resolveRef(set, value);
  const [custom, setCustom] = useState(isHex(value) ? value : "");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`${label}: ${value}`}
          className={cn(
            "flex h-8 w-full min-w-0 items-center gap-2 rounded-lg bg-surface-2 px-2 text-left font-mono text-xs transition-colors hover:bg-surface-3",
            !hex && "ring-1 ring-white/40",
          )}
        >
          <Swatch hex={hex} className="size-4 shrink-0" />
          <span className="truncate">{value.replace(/^color\//, "")}</span>
          {!hex && <TriangleAlert className="ml-auto size-3.5 shrink-0" aria-label="Broken reference" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[560px] rounded-2xl p-3" align="start">
        <div className="space-y-1.5">
          {set.ramps.map((r) => (
            <div key={r.name} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate font-mono text-[0.65rem] text-muted-foreground">{r.name}</span>
              <div className="flex gap-1">
                {Object.entries(r.steps).map(([step, h]) => {
                  const ref = `color/${r.name}/${step}`;
                  return (
                    <button
                      key={step}
                      onClick={() => onChange(ref)}
                      title={`${ref} ${h}`}
                      aria-label={ref}
                      aria-pressed={ref === value}
                      className={cn("size-7 rounded-md ring-1 ring-white/10 transition-transform hover:scale-110", ref === value && "ring-2 ring-white ring-offset-2 ring-offset-popover")}
                      style={{ background: h }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Raw hex</span>
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !validHex(custom)) onChange(normHex(custom));
            }}
            placeholder="#ffffff"
            className="h-7 w-28 rounded-md bg-surface-2 font-mono text-xs"
          />
          <span className="text-[0.65rem] text-subtle-foreground">Enter to use. Prefer primitives so Figma keeps the alias.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Ratio + grade in text and icon, never colour alone. */
export function ContrastBadge({ ratio, pass, className }: { ratio: number; pass: boolean; className?: string }) {
  const grade: ContrastGrade = gradeContrast(ratio);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[0.68rem] whitespace-nowrap",
        pass ? "bg-surface-3 text-foreground" : "bg-white text-black",
        className,
      )}
      title={pass ? "Meets the target" : "Below the target"}
    >
      {pass ? <Check className="size-3" aria-hidden /> : <CircleAlert className="size-3" aria-hidden />}
      {ratio.toFixed(2)} · {grade}
      <span className="sr-only">{pass ? "passes" : "fails"}</span>
    </span>
  );
}

export function SectionHead({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
