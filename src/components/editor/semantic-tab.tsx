"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommitInput, ContrastBadge, RefPicker, SectionHead, Swatch } from "./controls";
import { contrastPairs, pairPasses, resolveRef } from "@/lib/tokens/color";
import { modesOf, type SystemSettings, type TokenSet } from "@/lib/tokens/schema";
import type { Update } from "./system-editor";

const NONE = "__none";

export function SemanticTab({ tokens, settings, update }: { tokens: TokenSet; settings: SystemSettings; update: Update }) {
  const modes = modesOf(settings);
  const [newPath, setNewPath] = useState("");
  const pairs = useMemo(() => contrastPairs(tokens, modes), [tokens, modes]);
  const failing = pairs.filter((p) => !pairPasses(p, settings.contrast));
  const paths = tokens.semantic.map((s) => s.path);

  const validNewPath = /^color(\/[a-z0-9][a-z0-9-]*){2,}$/.test(newPath.trim()) && !paths.includes(newPath.trim());
  const add = () => {
    if (!validNewPath) return;
    const fallback = tokens.ramps[0] ? `color/${tokens.ramps[0].name}/${Object.keys(tokens.ramps[0].steps)[0]}` : "#000000";
    update((d) => void d.semantic.push({ path: newPath.trim(), light: fallback, dark: fallback, on: null, description: null }));
    setNewPath("");
  };

  return (
    <div className="space-y-8">
      <section>
        <SectionHead
          title="Contrast checker"
          description={`Target WCAG ${settings.contrast}: ${settings.contrast === "AAA" ? "7:1" : "4.5:1"} for text, 3:1 for borders and focus rings. Pairs come from each colour's "On" background.`}
        />
        {pairs.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            No pairs to check. Set an &ldquo;On&rdquo; background on text colours, or add color/bg/default.
          </p>
        ) : (
          <div className="rounded-2xl border bg-card p-4">
            <p className="mb-3 text-sm">
              <span className="font-mono">{pairs.length - failing.length}</span> of <span className="font-mono">{pairs.length}</span> pairs pass
              {failing.length > 0 && <span className="text-muted-foreground"> · {failing.length} below target, listed first</span>}
            </p>
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              {[...failing, ...pairs.filter((p) => pairPasses(p, settings.contrast))].map((p) => (
                <div key={`${p.fg}-${p.mode}`} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                  <span className="grid h-9 w-14 shrink-0 place-items-center rounded-md text-sm font-semibold ring-1 ring-white/10" style={{ background: p.bgHex, color: p.fgHex }}>
                    Aa
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{p.fg}</span>
                    <span className="block truncate font-mono text-[0.65rem] text-subtle-foreground">
                      on {p.bg} · {p.mode}
                      {p.nonText && " · UI (3:1)"}
                    </span>
                  </span>
                  <ContrastBadge ratio={p.ratio} pass={pairPasses(p, settings.contrast)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <SectionHead title="Semantic colours" description="What UI code uses. Each points at a primitive per mode, so Figma keeps the alias." />
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Token</th>
                {modes.map((m) => (
                  <th key={m} className="w-48 px-3 py-2 font-medium capitalize">
                    {m}
                  </th>
                ))}
                <th className="w-52 px-3 py-2 font-medium">On (for contrast)</th>
                <th className="px-3 py-2 font-medium">Use</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {tokens.semantic.map((s, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex shrink-0 gap-0.5">
                        {modes.map((m) => (
                          <Swatch key={m} hex={resolveRef(tokens, s[m])} className="size-5" title={`${m}: ${resolveRef(tokens, s[m]) ?? "broken"}`} />
                        ))}
                      </span>
                      <CommitInput
                        value={s.path}
                        mono
                        aria-label="Token path"
                        validate={(v) =>
                          !/^color(\/[a-z0-9][a-z0-9-]*){2,}$/.test(v) ? 'Use "color/<group>/<name>"' : paths.some((p, j) => j !== i && p === v) ? "Already exists" : null
                        }
                        onCommit={(v) =>
                          update((d) => {
                            const old = d.semantic[i].path;
                            d.semantic[i].path = v;
                            for (const t of d.semantic) if (t.on === old) t.on = v;
                          })
                        }
                      />
                    </div>
                  </td>
                  {modes.map((m) => (
                    <td key={m} className="px-3 py-1.5">
                      <RefPicker
                        set={tokens}
                        value={s[m]}
                        label={`${s.path} ${m}`}
                        onChange={(v) =>
                          update((d) => {
                            d.semantic[i][m] = v;
                            // Single-mode systems keep both values equal.
                            if (modes.length === 1) d.semantic[i][m === "light" ? "dark" : "light"] = v;
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <Select value={s.on ?? NONE} onValueChange={(v) => update((d) => void (d.semantic[i].on = v === NONE ? null : v))}>
                      <SelectTrigger size="sm" className="h-8 w-full rounded-lg bg-surface-2 font-mono text-xs" aria-label={`${s.path} background`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— none</SelectItem>
                        {paths
                          .filter((p) => p !== s.path)
                          .map((p) => (
                            <SelectItem key={p} value={p} className="font-mono text-xs">
                              {p}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    <CommitInput
                      value={s.description ?? ""}
                      placeholder="What it's for"
                      aria-label="Description"
                      onCommit={(v) => update((d) => void (d.semantic[i].description = v || null))}
                    />
                  </td>
                  <td className="px-2">
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${s.path}`} onClick={() => update((d) => void d.semantic.splice(i, 1))}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value.toLowerCase())}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="color/status/success"
            className="h-8 w-72 rounded-lg bg-surface-2 font-mono text-xs"
            aria-label="New semantic colour path"
          />
          <Button size="sm" variant="outline" onClick={add} disabled={!validNewPath}>
            <Plus /> Add colour
          </Button>
        </div>
      </section>
    </div>
  );
}
