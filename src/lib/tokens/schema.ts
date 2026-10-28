import { z } from "zod";

/** Step sets for colour ramps. */
export const STEP_SETS = {
  "11": [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  "9": [100, 200, 300, 400, 500, 600, 700, 800, 900],
} as const;
export type StepSet = keyof typeof STEP_SETS;

export const SCOPES = ["colors", "typography", "spacing", "radius", "shadows", "breakpoints", "motion"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE_LABELS: Record<Scope, string> = {
  colors: "Colours",
  typography: "Typography",
  spacing: "Spacing",
  radius: "Radius",
  shadows: "Shadows / effects",
  breakpoints: "Breakpoints",
  motion: "Motion",
};

export type ModeSetting = "light" | "dark" | "both";
export type Mode = "light" | "dark";
export type ContrastTarget = "AA" | "AAA";

/** Lower-case #rrggbb (or #rrggbbaa). Accepts #rgb and missing "#". */
export const hexSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  let s = v.trim().toLowerCase();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  if (/^#[0-9a-f]{8}$/.test(s) && s.endsWith("ff")) s = s.slice(0, 7);
  return s;
}, z.string().regex(/^#([0-9a-f]{6}|[0-9a-f]{8})$/, "must be a hex colour like #1a2b3c"));

/** A name segment: lower-case letters, digits and dashes ("brand", "on-brand", "2xl"). */
const segment = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "use lower-case letters, digits and dashes");

/** Slash-separated path ("color/bg/default"). */
const path = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/, 'use a slash path like "color/bg/default"');

const px = (max: number) => z.coerce.number().min(0).max(max);

export const RampSchema = z.object({
  name: segment,
  base: hexSchema,
  /** Step → hex. Filled from `base` by the app; individual steps can be edited by hand. */
  steps: z.record(z.string(), hexSchema),
});

/** A semantic colour points at a primitive ("color/neutral/50") or, rarely, a raw hex. */
export const SemanticSchema = z.object({
  path,
  light: z.string().trim(),
  dark: z.string().trim(),
  /** Background this colour is meant to sit on (for the contrast checker), e.g. "color/bg/default". */
  on: z.string().trim().nullish(),
  description: z.string().trim().max(300).nullish(),
});

export const FontSchema = z.object({
  key: segment,
  family: z.string().trim().min(1).max(80),
  fallback: z.string().trim().max(200).default("system-ui, sans-serif"),
});

export const TypeStyleSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/, 'use a name like "body/md"'),
  font: segment,
  size: px(400),
  lineHeight: px(600),
  weight: z.coerce.number().int().min(100).max(950),
  /** Letter spacing in em (-0.02 = -2%). */
  letterSpacing: z.coerce.number().min(-0.5).max(1).default(0),
});

export const DimensionSchema = z.object({ name: segment, value: px(100000) });

export const ShadowLayerSchema = z.object({
  x: z.coerce.number().min(-200).max(200),
  y: z.coerce.number().min(-200).max(200),
  blur: px(400),
  spread: z.coerce.number().min(-200).max(200),
  color: hexSchema,
  inset: z.boolean().optional(),
});
export const ShadowSchema = z.object({ name: segment, layers: z.array(ShadowLayerSchema).min(1).max(6) });

/** Duration in milliseconds. */
export const DurationSchema = z.object({ name: segment, value: z.coerce.number().min(0).max(10000) });
/** cubic-bezier(x1, y1, x2, y2); x values must stay within 0–1. */
export const EasingSchema = z.object({
  name: segment,
  value: z.tuple([z.coerce.number().min(0).max(1), z.coerce.number().min(-2).max(3), z.coerce.number().min(0).max(1), z.coerce.number().min(-2).max(3)]),
});
export const MotionSchema = z.object({ durations: z.array(DurationSchema).default([]), easings: z.array(EasingSchema).default([]) });

/**
 * An alternative brand: overrides some ramps' colours; everything else (semantic mapping, type,
 * spacing) is shared. In Figma each brand is a mode of the Primitives collection.
 */
export const BrandSchema = z.object({
  name: segment.refine((n) => n !== "default", 'reserved for the main brand'),
  ramps: z.array(RampSchema).default([]),
});

export const TokenSetSchema = z.object({
  ramps: z.array(RampSchema),
  semantic: z.array(SemanticSchema),
  fonts: z.array(FontSchema),
  typeScale: z.array(TypeStyleSchema),
  spacing: z.array(DimensionSchema),
  radius: z.array(DimensionSchema),
  shadows: z.array(ShadowSchema),
  breakpoints: z.array(DimensionSchema),
  // Added after the first release; defaults keep older systems valid.
  motion: MotionSchema.default({ durations: [], easings: [] }),
  brands: z.array(BrandSchema).default([]),
});

export const SystemSettingsSchema = z.object({
  steps: z.enum(["11", "9"]).default("11"),
  modes: z.enum(["light", "dark", "both"]).default("both"),
  contrast: z.enum(["AA", "AAA"]).default("AA"),
  scope: z.array(z.enum(SCOPES)).default([...SCOPES]),
  /** What UI-CONFIG.md includes. */
  uiConfig: z.enum(["tokens", "tokens+rules"]).default("tokens+rules"),
  figmaUrl: z.string().trim().max(500).default(""),
});

export type Ramp = z.infer<typeof RampSchema>;
export type SemanticToken = z.infer<typeof SemanticSchema>;
export type FontToken = z.infer<typeof FontSchema>;
export type TypeStyle = z.infer<typeof TypeStyleSchema>;
export type Dimension = z.infer<typeof DimensionSchema>;
export type ShadowLayer = z.infer<typeof ShadowLayerSchema>;
export type ShadowToken = z.infer<typeof ShadowSchema>;
export type TokenSet = z.infer<typeof TokenSetSchema>;
export type SystemSettings = z.infer<typeof SystemSettingsSchema>;
export type Duration = z.infer<typeof DurationSchema>;
export type Easing = z.infer<typeof EasingSchema>;
export type Motion = z.infer<typeof MotionSchema>;
export type Brand = z.infer<typeof BrandSchema>;

export type GroupKey = "ramps" | "semantic" | "typography" | "spacing" | "radius" | "shadows" | "breakpoints" | "motion";
export const GROUP_LABELS: Record<GroupKey, string> = {
  ramps: "Colour ramps",
  semantic: "Semantic colours",
  typography: "Typography",
  spacing: "Spacing",
  radius: "Radius",
  shadows: "Shadows",
  breakpoints: "Breakpoints",
  motion: "Motion",
};

export function emptyTokenSet(): TokenSet {
  return { ramps: [], semantic: [], fonts: [], typeScale: [], spacing: [], radius: [], shadows: [], breakpoints: [], motion: { durations: [], easings: [] }, brands: [] };
}

export function modesOf(settings: Pick<SystemSettings, "modes">): Mode[] {
  return settings.modes === "both" ? ["light", "dark"] : [settings.modes];
}

/** "color/bg/default" → "--color-bg-default". */
export function cssVar(p: string) {
  return `--${p.replace(/\//g, "-")}`;
}

/** Problems that make a token set unusable for export (broken references, duplicates). */
export function findProblems(set: TokenSet): string[] {
  const out: string[] = [];
  const ramps = new Map(set.ramps.map((r) => [r.name, r]));
  const dup = <T>(items: T[], key: (t: T) => string, what: string) => {
    const seen = new Set<string>();
    for (const i of items) {
      const k = key(i);
      if (seen.has(k)) out.push(`Duplicate ${what} "${k}".`);
      seen.add(k);
    }
  };
  dup(set.ramps, (r) => r.name, "ramp");
  dup(set.semantic, (s) => s.path, "semantic colour");
  dup(set.fonts, (f) => f.key, "font");
  dup(set.typeScale, (t) => t.name, "text style");
  dup(set.spacing, (d) => d.name, "spacing token");
  dup(set.radius, (d) => d.name, "radius token");
  dup(set.shadows, (d) => d.name, "shadow");
  dup(set.breakpoints, (d) => d.name, "breakpoint");
  dup(set.motion.durations, (d) => d.name, "duration");
  dup(set.motion.easings, (d) => d.name, "easing");
  dup(set.brands, (b) => b.name, "brand");
  for (const b of set.brands) {
    for (const r of b.ramps) {
      const main = ramps.get(r.name);
      if (!main) out.push(`Brand ${b.name}: ramp "${r.name}" doesn't exist in the main brand.`);
      else if (Object.keys(main.steps).join() !== Object.keys(r.steps).join()) out.push(`Brand ${b.name}: ramp "${r.name}" has different steps; rebuild it.`);
    }
  }

  const semanticPaths = new Set(set.semantic.map((s) => s.path));
  for (const s of set.semantic) {
    if (!s.path.startsWith("color/")) out.push(`${s.path}: semantic colours must start with "color/".`);
    if (ramps.has(s.path.split("/")[1])) out.push(`${s.path}: "${s.path.split("/")[1]}" is also a ramp name; pick another group name.`);
    for (const mode of ["light", "dark"] as const) {
      const ref = s[mode];
      if (/^#/.test(ref)) {
        if (!hexSchema.safeParse(ref).success) out.push(`${s.path} (${mode}): "${ref}" is not a valid hex colour.`);
        continue;
      }
      const [root, ramp, step] = ref.split("/");
      if (root !== "color" || !ramps.has(ramp) || !(step in ramps.get(ramp)!.steps)) {
        out.push(`${s.path} (${mode}): "${ref}" is not an existing primitive like "color/neutral/500".`);
      }
    }
    if (s.on && !semanticPaths.has(s.on)) out.push(`${s.path}: "on" points at "${s.on}", which is not a semantic colour.`);
  }
  const fonts = new Set(set.fonts.map((f) => f.key));
  for (const t of set.typeScale) if (!fonts.has(t.font)) out.push(`Text style ${t.name}: unknown font "${t.font}".`);
  return out;
}

export function countTokens(set: TokenSet): number {
  return (
    set.ramps.reduce((n, r) => n + Object.keys(r.steps).length, 0) +
    set.semantic.length +
    set.fonts.length +
    set.typeScale.length +
    set.spacing.length +
    set.radius.length +
    set.shadows.length +
    set.breakpoints.length +
    set.motion.durations.length +
    set.motion.easings.length +
    set.brands.reduce((n, b) => n + b.ramps.reduce((m, r) => m + Object.keys(r.steps).length, 0), 0)
  );
}

/** The token set as seen with one brand applied (its ramps replace the main ones). */
export function withBrand(set: TokenSet, brand: string | null | undefined): TokenSet {
  const b = brand && brand !== "default" ? set.brands.find((x) => x.name === brand) : null;
  if (!b) return set;
  return { ...set, ramps: set.ramps.map((r) => b.ramps.find((x) => x.name === r.name) ?? r) };
}
