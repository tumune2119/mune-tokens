import { generateRamp, makeRamp } from "./color";
import {
  STEP_SETS,
  type Dimension,
  type FontToken,
  type Ramp,
  type SemanticToken,
  type ShadowToken,
  type StepSet,
  type SystemSettings,
  type TokenSet,
  type TypeStyle,
} from "./schema";

/** Nearest available step, so references work for both 50–950 and 100–900 ramps. */
export function nearestStep(step: number, steps: StepSet) {
  const list = STEP_SETS[steps] as readonly number[];
  return list.reduce((best, s) => (Math.abs(s - step) < Math.abs(best - step) ? s : best), list[0]);
}

const ref = (ramp: string, step: number, steps: StepSet) => `color/${ramp}/${nearestStep(step, steps)}`;

export function defaultSemantic(steps: StepSet, brand = "brand", neutral = "neutral"): SemanticToken[] {
  const n = (s: number) => ref(neutral, s, steps);
  const b = (s: number) => ref(brand, s, steps);
  const t = (path: string, light: string, dark: string, description: string, on?: string): SemanticToken => ({
    path,
    light,
    dark,
    description,
    on: on ?? null,
  });
  return [
    t("color/bg/default", n(50), n(950), "Page background"),
    t("color/bg/subtle", n(100), n(900), "Subtle sections, table stripes"),
    t("color/bg/surface", "#ffffff", n(900), "Cards, popovers"),
    t("color/text/default", n(900), n(50), "Body text"),
    t("color/text/muted", n(700), n(400), "Secondary text"),
    t("color/text/on-action", "#ffffff", "#ffffff", "Text on primary buttons", "color/action/primary/default"),
    t("color/border/default", n(200), n(800), "Hairline borders"),
    t("color/border/strong", n(400), n(600), "Inputs, dividers that matter"),
    t("color/action/primary/default", b(600), b(600), "Primary button"),
    t("color/action/primary/hover", b(700), b(500), "Primary button hover"),
    t("color/focus/ring", b(500), b(400), "Focus ring"),
  ];
}

export const DEFAULT_FONTS: FontToken[] = [
  { key: "sans", family: "Inter", fallback: "ui-sans-serif, system-ui, sans-serif" },
  { key: "mono", family: "JetBrains Mono", fallback: "ui-monospace, monospace" },
];

const ts = (name: string, size: number, lineHeight: number, weight: number, letterSpacing = 0, font = "sans"): TypeStyle => ({
  name,
  font,
  size,
  lineHeight,
  weight,
  letterSpacing,
});

export const DEFAULT_TYPE_SCALE: TypeStyle[] = [
  ts("display/lg", 56, 64, 700, -0.02),
  ts("display/md", 44, 52, 700, -0.02),
  ts("heading/xl", 32, 40, 600, -0.01),
  ts("heading/lg", 24, 32, 600, -0.01),
  ts("heading/md", 20, 28, 600),
  ts("body/lg", 18, 28, 400),
  ts("body/md", 16, 24, 400),
  ts("body/sm", 14, 20, 400),
  ts("label/md", 14, 20, 500),
  ts("caption", 12, 16, 400, 0.01),
  ts("code/md", 14, 20, 400, 0, "mono"),
];

const dims = (pairs: [string, number][]): Dimension[] => pairs.map(([name, value]) => ({ name, value }));

export const DEFAULT_SPACING = dims([
  ["0", 0], ["1", 4], ["2", 8], ["3", 12], ["4", 16], ["5", 20], ["6", 24], ["8", 32], ["10", 40], ["12", 48], ["16", 64], ["20", 80],
]);
export const DEFAULT_RADIUS = dims([["none", 0], ["sm", 4], ["md", 8], ["lg", 12], ["xl", 16], ["2xl", 24], ["full", 9999]]);
export const DEFAULT_BREAKPOINTS = dims([["sm", 640], ["md", 768], ["lg", 1024], ["xl", 1280], ["2xl", 1536]]);
export const DEFAULT_SHADOWS: ShadowToken[] = [
  { name: "sm", layers: [{ x: 0, y: 1, blur: 2, spread: 0, color: "#0000000f" }] },
  { name: "md", layers: [{ x: 0, y: 2, blur: 4, spread: -1, color: "#0000000f" }, { x: 0, y: 4, blur: 8, spread: -2, color: "#0000001a" }] },
  { name: "lg", layers: [{ x: 0, y: 4, blur: 6, spread: -2, color: "#0000000d" }, { x: 0, y: 12, blur: 16, spread: -4, color: "#0000001f" }] },
  { name: "xl", layers: [{ x: 0, y: 8, blur: 8, spread: -4, color: "#0000000a" }, { x: 0, y: 20, blur: 24, spread: -4, color: "#00000024" }] },
];

export function defaultRamps(steps: StepSet): Ramp[] {
  const list = STEP_SETS[steps];
  return [makeRamp("neutral", "#737373", list), makeRamp("brand", "#2563eb", list)];
}

/** "Start blank": a small, sensible system to edit from. */
export function blankTokenSet(settings: Pick<SystemSettings, "steps">): TokenSet {
  return {
    ramps: defaultRamps(settings.steps),
    semantic: defaultSemantic(settings.steps),
    fonts: structuredClone(DEFAULT_FONTS),
    typeScale: structuredClone(DEFAULT_TYPE_SCALE),
    spacing: structuredClone(DEFAULT_SPACING),
    radius: structuredClone(DEFAULT_RADIUS),
    shadows: structuredClone(DEFAULT_SHADOWS),
    breakpoints: structuredClone(DEFAULT_BREAKPOINTS),
  };
}

/** Rebuilds every ramp's steps for a different step set (keeps bases). */
export function restep(ramps: Ramp[], steps: StepSet): Ramp[] {
  return ramps.map((r) => ({ ...r, steps: generateRamp(r.base, STEP_SETS[steps]) }));
}
