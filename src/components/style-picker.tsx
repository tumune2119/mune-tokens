"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MAX_STYLES, STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Visual style picker: up to two styles from the library (the first is the base, the second an accent
 * layer), plus the "avoid the generic AI look" switch. Both steer every Claude prompt for the system.
 */
export function StylePicker({
  value,
  onChange,
  distinctive,
  onDistinctive,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  distinctive: boolean;
  onDistinctive: (v: boolean) => void;
  disabled?: boolean;
}) {
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id].slice(-MAX_STYLES));
  };
  const names = value.map((id) => STYLES.find((s) => s.id === id)?.name).filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="max-h-72 overflow-y-auto rounded-xl bg-surface-2 p-2">
        <div role="group" aria-label="Visual styles" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STYLES.map((s) => {
            const at = value.indexOf(s.id);
            const [bg, fg, a1, a2] = s.swatch;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                aria-pressed={at >= 0}
                title={s.blurb}
                onClick={() => toggle(s.id)}
                className={cn(
                  "relative flex flex-col gap-1.5 rounded-lg p-1.5 text-left ring-1 ring-white/10 transition-colors hover:bg-white/5 disabled:opacity-50",
                  at >= 0 && "bg-white/10 ring-2 ring-white",
                )}
              >
                <span className="flex h-10 items-center gap-1.5 px-2" style={{ background: bg, borderRadius: Math.min(s.radius, 14) }}>
                  <span className="text-sm font-bold" style={{ color: fg }}>
                    Aa
                  </span>
                  <span className="ml-auto size-3 rounded-full" style={{ background: a1 }} />
                  <span className="size-3 rounded-full" style={{ background: a2 }} />
                </span>
                <span className="truncate px-0.5 text-xs">{s.name}</span>
                {at >= 0 && (
                  <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-white font-mono text-[0.6rem] text-black">{at + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-subtle-foreground">
        {names.length === 0
          ? "Optional. Pick one, or two to blend (the first is the base)."
          : names.length === 1
            ? `${names[0]}. Pick a second to blend it in, or click again to clear.`
            : `${names[0]} as the base, ${names[1]} as the accent.`}
      </p>
      <div className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
        <Switch id="distinctive" checked={distinctive} onCheckedChange={onDistinctive} disabled={disabled} className="mt-0.5" />
        <div>
          <Label htmlFor="distinctive">Avoid the generic AI look</Label>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            No Inter/Geist, purple-on-black, glow orbs, sparkle icons, three-card rows, fake testimonials or em-dash copy. A style you pick wins where they overlap.
          </p>
        </div>
      </div>
    </div>
  );
}
