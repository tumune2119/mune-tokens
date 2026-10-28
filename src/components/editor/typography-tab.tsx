"use client";

import { useEffect, useState } from "react";
import { Check, CircleHelp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommitInput, NumberInput, SectionHead, validPath, validSegment } from "./controls";
import { useGoogleFonts } from "./use-google-fonts";
import type { FontToken, TokenSet } from "@/lib/tokens/schema";
import type { Update } from "./system-editor";

type FontStatus = "google" | "missing" | "unknown" | "checking";

const fontCache = new Map<string, FontStatus>();

function useFontStatus(family: string): FontStatus {
  const [result, setResult] = useState<{ family: string; status: FontStatus } | null>(null);
  useEffect(() => {
    if (fontCache.has(family)) return;
    let live = true;
    fetch(`/api/fonts/check?family=${encodeURIComponent(family)}`)
      .then((r) => r.json())
      .then((d: { status: FontStatus }) => {
        fontCache.set(family, d.status);
        if (live) setResult({ family, status: d.status });
      })
      .catch(() => live && setResult({ family, status: "unknown" }));
    return () => {
      live = false;
    };
  }, [family]);
  return fontCache.get(family) ?? (result?.family === family ? result.status : "checking");
}

function FontBadge({ family }: { family: string }) {
  const s = useFontStatus(family);
  if (s === "checking") return <span className="text-xs text-subtle-foreground">Checking…</span>;
  if (s === "google")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3.5" /> On Google Fonts
      </span>
    );
  if (s === "missing")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-xs text-black" title="Export pages load fonts from Google Fonts so they exist in Figma. Install this font locally in Figma, or pick a Google font.">
        <TriangleAlert className="size-3.5" /> Not on Google Fonts
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-subtle-foreground" title="Couldn't reach Google Fonts (offline?)">
      <CircleHelp className="size-3.5" /> Unknown
    </span>
  );
}

const stack = (f?: FontToken) => (f ? `"${f.family}", ${f.fallback}` : undefined);

export function TypographyTab({ tokens, update }: { tokens: TokenSet; update: Update }) {
  useGoogleFonts(tokens.fonts.map((f) => f.family));
  const fontKeys = tokens.fonts.map((f) => f.key);

  return (
    <div className="space-y-10">
      <section>
        <SectionHead
          title="Fonts"
          description="Families from Google Fonts import into Figma cleanly; others need to be installed locally."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                update((d) => {
                  const key = ["display", "serif", "mono", "sans"].find((k) => !d.fonts.some((f) => f.key === k)) ?? `font-${d.fonts.length + 1}`;
                  d.fonts.push({ key, family: "Inter", fallback: "system-ui, sans-serif" });
                })
              }
            >
              <Plus /> Add font
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {tokens.fonts.map((f, i) => (
            <div key={i} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-4xl leading-tight" style={{ fontFamily: stack(f) }}>
                  {f.family}
                </p>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete font ${f.key}`}
                  disabled={tokens.typeScale.some((t) => t.font === f.key)}
                  title={tokens.typeScale.some((t) => t.font === f.key) ? "Text styles use this font" : undefined}
                  onClick={() => update((d) => void d.fonts.splice(i, 1))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-[110px_1fr] gap-2">
                <CommitInput
                  value={f.key}
                  mono
                  aria-label="Font key"
                  validate={(v) => validSegment(v) ?? (fontKeys.some((k, j) => j !== i && k === v) ? "Key in use" : null)}
                  onCommit={(v) =>
                    update((d) => {
                      const old = d.fonts[i].key;
                      d.fonts[i].key = v;
                      for (const t of d.typeScale) if (t.font === old) t.font = v;
                    })
                  }
                />
                <CommitInput value={f.family} aria-label="Family" validate={(v) => (v ? null : "Required")} onCommit={(v) => update((d) => void (d.fonts[i].family = v))} />
              </div>
              <CommitInput value={f.fallback} mono className="mt-2" aria-label="Fallback stack" onCommit={(v) => update((d) => void (d.fonts[i].fallback = v))} />
              <div className="mt-2">
                <FontBadge family={f.family} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHead
          title="Type scale"
          description="Size and line height in px, letter spacing in em. Each style becomes a Figma text style."
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                update((d) => {
                  let n = d.typeScale.length + 1;
                  while (d.typeScale.some((t) => t.name === `style-${n}`)) n++;
                  d.typeScale.push({ name: `style-${n}`, font: d.fonts[0]?.key ?? "sans", size: 16, lineHeight: 24, weight: 400, letterSpacing: 0 });
                })
              }
            >
              <Plus /> Add style
            </Button>
          }
        />
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-40 px-3 py-2 font-medium">Style</th>
                <th className="w-28 px-3 py-2 font-medium">Font</th>
                <th className="w-20 px-3 py-2 font-medium">Size</th>
                <th className="w-20 px-3 py-2 font-medium">Line</th>
                <th className="w-20 px-3 py-2 font-medium">Weight</th>
                <th className="w-24 px-3 py-2 font-medium">Tracking</th>
                <th className="px-3 py-2 font-medium">Sample</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {tokens.typeScale.map((t, i) => {
                const font = tokens.fonts.find((f) => f.key === t.font);
                return (
                  <tr key={i} className="border-b align-middle last:border-0">
                    <td className="px-3 py-1.5">
                      <CommitInput
                        value={t.name}
                        mono
                        aria-label="Style name"
                        validate={(v) => validPath(v) ?? (tokens.typeScale.some((x, j) => j !== i && x.name === v) ? "Name in use" : null)}
                        onCommit={(v) => update((d) => void (d.typeScale[i].name = v))}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Select value={t.font} onValueChange={(v) => update((d) => void (d.typeScale[i].font = v))}>
                        <SelectTrigger size="sm" className="h-8 w-full rounded-lg bg-surface-2 font-mono text-xs" aria-label="Font">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tokens.fonts.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.key} · {f.family}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput value={t.size} min={1} max={400} step={1} onCommit={(v) => update((d) => void (d.typeScale[i].size = v))} aria-label="Size" />
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput value={t.lineHeight} min={1} max={600} step={1} onCommit={(v) => update((d) => void (d.typeScale[i].lineHeight = v))} aria-label="Line height" />
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput value={t.weight} min={100} max={950} step={1} onCommit={(v) => update((d) => void (d.typeScale[i].weight = v))} aria-label="Weight" />
                    </td>
                    <td className="px-3 py-1.5">
                      <NumberInput value={t.letterSpacing} min={-0.5} max={1} suffix="em" onCommit={(v) => update((d) => void (d.typeScale[i].letterSpacing = v))} aria-label="Letter spacing" />
                    </td>
                    <td className="max-w-0 px-3 py-1.5">
                      <p
                        className="truncate"
                        style={{
                          fontFamily: stack(font),
                          fontSize: Math.min(t.size, 72),
                          lineHeight: `${Math.min(t.lineHeight, 80)}px`,
                          fontWeight: t.weight,
                          letterSpacing: `${t.letterSpacing}em`,
                        }}
                        title={t.size > 72 ? `Preview capped at 72px (real size ${t.size}px)` : undefined}
                      >
                        The quick brown fox jumps over the lazy dog
                      </p>
                    </td>
                    <td className="px-2">
                      <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => update((d) => void d.typeScale.splice(i, 1))}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
