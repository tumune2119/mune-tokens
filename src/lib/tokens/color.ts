import { clampChroma, converter, formatHex, formatHex8, parse, wcagContrast } from "culori";
import type { ContrastTarget, Mode, Ramp, TokenSet } from "./schema";

const toOklch = converter("oklch");

/** Target OKLCH lightness per step; the ramp is bent so the base colour lands exactly on its nearest step. */
const L_TARGETS: Record<number, number> = {
  50: 0.975,
  100: 0.945,
  200: 0.89,
  300: 0.82,
  400: 0.72,
  500: 0.63,
  600: 0.545,
  700: 0.465,
  800: 0.385,
  900: 0.305,
  950: 0.225,
};

/** Relative chroma by lightness: fullest in the middle, tapering towards white and black. */
function chromaShape(l: number) {
  return Math.max(0.12, 1 - ((l - 0.58) / 0.48) ** 2);
}

export function isHex(v: string) {
  return /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
}

export function oklchOf(hex: string) {
  const c = toOklch(parse(hex));
  return { l: c?.l ?? 0, c: c?.c ?? 0, h: c?.h ?? 0 };
}

/** "oklch(62.3% 0.142 250.1)" — shown next to hex values. */
export function oklchLabel(hex: string) {
  const { l, c, h } = oklchOf(hex);
  return `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${c < 0.002 ? 0 : h.toFixed(1)})`;
}

export function oklchToHex(l: number, c: number, h: number) {
  return formatHex(clampChroma({ mode: "oklch", l, c, h }, "oklch"))!;
}

/** Builds an evenly-stepped ramp in OKLCH. The base colour is kept exactly on its nearest step. */
export function generateRamp(base: string, steps: readonly number[]): Record<string, string> {
  const b = oklchOf(base);
  const targets = steps.map((s) => L_TARGETS[s] ?? 0.5);
  let anchor = 0;
  targets.forEach((t, i) => {
    if (Math.abs(t - b.l) < Math.abs(targets[anchor] - b.l)) anchor = i;
  });
  const delta = b.l - targets[anchor];
  const first = targets[0];
  const last = targets[targets.length - 1];
  const baseShape = chromaShape(b.l);

  const out: Record<string, string> = {};
  steps.forEach((step, i) => {
    if (i === anchor) {
      out[String(step)] = formatHex(parse(base))!;
      return;
    }
    const t = targets[i];
    // 1 at the anchor, 0 at the lightest/darkest step, so the ends stay fixed.
    const w =
      i < anchor
        ? anchor === 0 ? 0 : (t - first) / (targets[anchor] - first)
        : anchor === targets.length - 1 ? 0 : (t - last) / (targets[anchor] - last);
    const l = Math.min(0.99, Math.max(0.08, t + delta * w));
    const c = Math.min(0.37, (b.c * chromaShape(l)) / baseShape);
    out[String(step)] = oklchToHex(l, c, b.h);
  });
  return out;
}

export function makeRamp(name: string, base: string, steps: readonly number[]): Ramp {
  return { name, base, steps: generateRamp(base, steps) };
}

/** Resolves a primitive path or hex to a hex value, or null if it points nowhere. */
export function resolveRef(set: TokenSet, ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (isHex(ref)) return ref.toLowerCase();
  const [root, ramp, step] = ref.split("/");
  if (root !== "color") return null;
  return set.ramps.find((r) => r.name === ramp)?.steps[step] ?? null;
}

export function resolveSemantic(set: TokenSet, path: string, mode: Mode): string | null {
  const token = set.semantic.find((s) => s.path === path);
  return token ? resolveRef(set, token[mode]) : null;
}

/** Composites a translucent colour over a background so contrast can be measured. */
function flatten(fg: string, bg: string) {
  const f = parse(fg);
  if (!f || f.alpha === undefined || f.alpha >= 1) return fg;
  const b = parse(bg)!;
  const toRgb = converter("rgb");
  const fr = toRgb(f)!;
  const br = toRgb(b)!;
  const a = f.alpha;
  return formatHex({ mode: "rgb", r: fr.r * a + br.r * (1 - a), g: fr.g * a + br.g * (1 - a), b: fr.b * a + br.b * (1 - a) })!;
}

export function contrastRatio(fg: string, bg: string): number {
  return wcagContrast(flatten(fg, bg), bg);
}

export type ContrastGrade = "AAA" | "AA" | "AA Large" | "Fail";

export function gradeContrast(ratio: number): ContrastGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

export function passesTarget(ratio: number, target: ContrastTarget, large = false) {
  const need = target === "AAA" ? (large ? 4.5 : 7) : large ? 3 : 4.5;
  return ratio >= need;
}

export interface ContrastPair {
  fg: string;
  bg: string;
  mode: Mode;
  fgHex: string;
  bgHex: string;
  ratio: number;
  grade: ContrastGrade;
  /** Borders and focus rings only need 3:1 (WCAG 1.4.11). */
  nonText: boolean;
}

const isNonText = (p: string) => /\/(border|focus|ring|divider|outline)(\/|$)/.test(p);

/**
 * Pairs to check: every semantic colour with an explicit `on` background, plus text/icon colours
 * without one against color/bg/default.
 */
export function contrastPairs(set: TokenSet, modes: Mode[]): ContrastPair[] {
  const out: ContrastPair[] = [];
  const defaultBg = set.semantic.find((s) => s.path === "color/bg/default")?.path;
  for (const s of set.semantic) {
    const bg = s.on || (/\/(text|icon|fg)(\/|$)/.test(s.path) ? defaultBg : undefined);
    if (!bg || bg === s.path) continue;
    for (const mode of modes) {
      const fgHex = resolveRef(set, s[mode]);
      const bgHex = resolveSemantic(set, bg, mode);
      if (!fgHex || !bgHex) continue;
      const ratio = contrastRatio(fgHex, bgHex);
      out.push({ fg: s.path, bg, mode, fgHex, bgHex, ratio, grade: gradeContrast(ratio), nonText: isNonText(s.path) });
    }
  }
  return out;
}

export function pairPasses(p: ContrastPair, target: ContrastTarget) {
  return p.nonText ? p.ratio >= 3 : passesTarget(p.ratio, target);
}

/** Readable text colour (black/white) on a swatch. */
export function inkOn(hex: string) {
  return contrastRatio("#000000", hex) >= contrastRatio("#ffffff", hex) ? "#000000" : "#ffffff";
}

export function hexWithAlpha(hex: string, alpha: number) {
  const c = parse(hex);
  if (!c) return hex;
  return formatHex8({ ...c, alpha: Math.max(0, Math.min(1, alpha)) })!;
}

/** "rgba(0, 0, 0, 0.12)" for CSS output of 8-digit hex. */
export function cssColor(hex: string) {
  if (hex.length !== 9) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >>> 24) & 255;
  const g = (n >>> 16) & 255;
  const b = (n >>> 8) & 255;
  const a = (n & 255) / 255;
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}
