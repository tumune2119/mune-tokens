"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { generateRamp } from "@/lib/tokens/color";
import { STEP_SETS, type SystemSettings } from "@/lib/tokens/schema";
import type { Generation } from "@/lib/ai/token-schemas";
import { useGoogleFonts } from "@/components/editor/use-google-fonts";

const HEX = /^#?[0-9a-f]{6}$/i;

/** What Claude has written so far, drawn as it streams (partial JSON, parsed tolerantly). */
export function LivePreview({
  partial,
  settings,
  busy,
  status,
  chars,
}: {
  partial: Partial<Generation> | null;
  settings: SystemSettings;
  busy: boolean;
  status: string;
  chars: number;
}) {
  const reduce = useReducedMotion();
  const ramps = (partial?.ramps ?? []).filter((r) => r?.name && typeof r.base === "string" && HEX.test(r.base));
  const fonts = (partial?.fonts ?? []).filter((f) => f?.family);
  const scale = (partial?.typeScale ?? []).filter((t) => t?.name && t.size && t.lineHeight);
  useGoogleFonts(fonts.map((f) => f.family));

  if (!busy && !partial) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-dashed text-center">
        <div className="max-w-sm px-6 py-16">
          <p className="font-medium">Live preview</p>
          <p className="mt-1 text-sm text-muted-foreground">Swatches and type samples appear here as Claude writes them.</p>
        </div>
      </div>
    );
  }

  const pop = reduce ? {} : { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 } };

  return (
    <div className="space-y-8" aria-live="polite">
      <div className="flex items-center gap-3">
        {busy && <span className="size-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" />}
        <p className="text-sm text-muted-foreground">
          {busy ? status : "Done"} <span className="font-mono text-subtle-foreground">· {chars.toLocaleString()} chars</span>
        </p>
      </div>
      {partial?.name && (
        <div>
          <h2 className="text-xl font-semibold">{partial.name}</h2>
          {partial.summary && <p className="mt-1 text-sm text-muted-foreground">{partial.summary}</p>}
        </div>
      )}

      {ramps.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Colour ramps</h3>
          <AnimatePresence>
            {ramps.map((r) => {
              const steps = generateRamp(r.base.startsWith("#") ? r.base : `#${r.base}`, STEP_SETS[settings.steps]);
              return (
                <motion.div key={r.name} layout className="flex items-center gap-3" {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 } })}>
                  <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">{r.name}</span>
                  <div className="flex flex-1 gap-1">
                    {Object.entries(steps).map(([step, hex], i) => (
                      <motion.span
                        key={step}
                        {...pop}
                        transition={{ delay: i * 0.025, type: "spring", stiffness: 400, damping: 28 }}
                        className="h-10 flex-1 rounded-md ring-1 ring-white/10"
                        style={{ background: hex }}
                        title={`color/${r.name}/${step} ${hex}`}
                      />
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </section>
      )}

      {(partial?.semantic?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Semantic colours · {partial!.semantic!.length}</h3>
          <div className="flex flex-wrap gap-1.5">
            {partial!.semantic!.filter((s) => s?.path).map((s) => (
              <span key={s.path} className="rounded-md bg-surface-2 px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
                {s.path}
              </span>
            ))}
          </div>
        </section>
      )}

      {(fonts.length > 0 || scale.length > 0) && (
        <section className="space-y-3">
          <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Typography</h3>
          {fonts.length > 0 && <p className="text-sm text-muted-foreground">{fonts.map((f) => f.family).join(" · ")}</p>}
          <div className="space-y-2">
            {scale.map((t) => {
              const family = fonts.find((f) => f.key === t.font)?.family;
              return (
                <motion.div key={t.name} {...(reduce ? {} : { initial: { opacity: 0, x: -6 }, animate: { opacity: 1, x: 0 } })} className="flex items-baseline gap-4">
                  <span className="w-28 shrink-0 font-mono text-xs text-subtle-foreground">{t.name}</span>
                  <span
                    className="truncate"
                    style={{
                      fontFamily: family ? `"${family}", system-ui` : undefined,
                      fontSize: Math.min(Number(t.size), 64),
                      lineHeight: `${Math.min(Number(t.lineHeight), 72)}px`,
                      fontWeight: t.weight,
                      letterSpacing: `${t.letterSpacing ?? 0}em`,
                    }}
                  >
                    The quick brown fox
                  </span>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {(partial?.spacing?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Spacing</h3>
          <div className="flex items-end gap-2">
            {partial!.spacing!.filter((d) => d?.value !== undefined).map((d) => (
              <span key={d.name} title={`space/${d.name} ${d.value}px`} className="w-3 rounded-sm bg-white/80" style={{ height: Math.max(2, Math.min(Number(d.value), 120)) }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
