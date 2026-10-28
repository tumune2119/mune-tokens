import { shadowCss } from "../export/css";
import { resolveRef } from "./color";
import type { TokenSet } from "./schema";

export interface FlatToken {
  /** Readable value ("#0d9488", "16px", "Inter 16/24 500", "→ color/neutral/50 (#fafafa) / …"). */
  value: string;
  /** Colour to show next to it, if any. */
  swatch?: string;
}

/** Every token as path → display value, so two versions can be compared name by name. */
export function flattenTokens(set: TokenSet): Map<string, FlatToken> {
  const out = new Map<string, FlatToken>();
  for (const r of set.ramps) for (const [step, hex] of Object.entries(r.steps)) out.set(`color/${r.name}/${step}`, { value: hex, swatch: hex });
  for (const s of set.semantic) {
    const l = resolveRef(set, s.light);
    const d = resolveRef(set, s.dark);
    out.set(s.path, { value: `light ${s.light}${l && !s.light.startsWith("#") ? ` (${l})` : ""} · dark ${s.dark}${d && !s.dark.startsWith("#") ? ` (${d})` : ""}${s.on ? ` · on ${s.on}` : ""}`, swatch: l ?? undefined });
  }
  for (const f of set.fonts) out.set(`font/${f.key}`, { value: `${f.family} · ${f.fallback}` });
  for (const t of set.typeScale) out.set(`text/${t.name}`, { value: `font/${t.font} ${t.size}/${t.lineHeight} ${t.weight} ${t.letterSpacing}em` });
  for (const d of set.spacing) out.set(`space/${d.name}`, { value: `${d.value}px` });
  for (const d of set.radius) out.set(`radius/${d.name}`, { value: `${d.value}px` });
  for (const d of set.breakpoints) out.set(`breakpoint/${d.name}`, { value: `${d.value}px` });
  for (const s of set.shadows) out.set(`shadow/${s.name}`, { value: shadowCss(s) });
  for (const d of set.motion.durations) out.set(`motion/duration/${d.name}`, { value: `${d.value}ms` });
  for (const e of set.motion.easings) out.set(`motion/easing/${e.name}`, { value: `cubic-bezier(${e.value.join(", ")})` });
  for (const b of set.brands) for (const r of b.ramps) for (const [step, hex] of Object.entries(r.steps)) out.set(`brand/${b.name}/color/${r.name}/${step}`, { value: hex, swatch: hex });
  return out;
}

export interface TokenDiff {
  added: { path: string; after: FlatToken }[];
  removed: { path: string; before: FlatToken }[];
  changed: { path: string; before: FlatToken; after: FlatToken }[];
}

/** What changed going from `from` to `to`. */
export function diffTokens(from: TokenSet, to: TokenSet): TokenDiff {
  const a = flattenTokens(from);
  const b = flattenTokens(to);
  const diff: TokenDiff = { added: [], removed: [], changed: [] };
  for (const [path, after] of b) {
    const before = a.get(path);
    if (!before) diff.added.push({ path, after });
    else if (before.value !== after.value) diff.changed.push({ path, before, after });
  }
  for (const [path, before] of a) if (!b.has(path)) diff.removed.push({ path, before });
  return diff;
}

export const diffSize = (d: TokenDiff) => d.added.length + d.removed.length + d.changed.length;
