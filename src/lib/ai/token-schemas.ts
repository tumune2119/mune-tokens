import { z } from "zod";
import { makeRamp } from "../tokens/color";
import { blankTokenSet, nearestStep } from "../tokens/defaults";
import {
  DimensionSchema,
  FontSchema,
  SemanticSchema,
  ShadowSchema,
  STEP_SETS,
  TypeStyleSchema,
  hexSchema,
  type GroupKey,
  type StepSet,
  type SystemSettings,
  type TokenSet,
} from "../tokens/schema";

/** The model only picks a base per ramp; the app builds the steps in OKLCH. */
const AiRampSchema = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]*$/, "lower-case letters, digits, dashes"),
  base: hexSchema,
});

const AiSemanticSchema = SemanticSchema.extend({
  // Models sometimes write "neutral/50" or "color.neutral.50"; normalise to "color/neutral/50".
  light: z.string().transform(normaliseRef),
  dark: z.string().transform(normaliseRef),
});

export function normaliseRef(v: string) {
  const s = v.trim().toLowerCase().replace(/^\{|\}$/g, "").replace(/\./g, "/");
  if (s.startsWith("#")) return s;
  return s.startsWith("color/") ? s : `color/${s}`;
}

const groupShapes = {
  ramps: { ramps: z.array(AiRampSchema).min(1).max(12) },
  semantic: { semantic: z.array(AiSemanticSchema).min(1).max(80) },
  typography: { fonts: z.array(FontSchema).min(1).max(4), typeScale: z.array(TypeStyleSchema).min(3).max(30) },
  spacing: { spacing: z.array(DimensionSchema).min(3).max(30) },
  radius: { radius: z.array(DimensionSchema).min(2).max(12) },
  shadows: { shadows: z.array(ShadowSchema).min(1).max(10) },
  breakpoints: { breakpoints: z.array(DimensionSchema).min(2).max(8) },
} as const;

/** Semantic references must point at ramps that exist and steps the ramp has. */
function checkRefs(
  semantic: { path: string; light: string; dark: string }[] | undefined,
  rampNames: string[],
  steps: StepSet,
  ctx: z.RefinementCtx,
) {
  if (!semantic) return;
  const valid = new Set<string>(STEP_SETS[steps].map(String));
  const names = new Set(rampNames);
  semantic.forEach((s, i) => {
    if (!s.path.startsWith("color/")) ctx.addIssue({ code: "custom", path: ["semantic", i, "path"], message: 'must start with "color/"' });
    if (names.has(s.path.split("/")[1])) {
      ctx.addIssue({ code: "custom", path: ["semantic", i, "path"], message: `second segment clashes with ramp "${s.path.split("/")[1]}"` });
    }
    for (const mode of ["light", "dark"] as const) {
      const ref = s[mode];
      if (ref.startsWith("#")) continue;
      const [, ramp, step] = ref.split("/");
      if (!names.has(ramp) || !valid.has(step)) {
        ctx.addIssue({
          code: "custom",
          path: ["semantic", i, mode],
          message: `"${ref}" is not a primitive. Ramps: ${rampNames.join(", ")}; steps: ${[...valid].join(", ")}`,
        });
      }
    }
  });
}

export function generationSchema(steps: StepSet) {
  return z
    .object({
      name: z.string().trim().min(1).max(60),
      summary: z.string().trim().max(400).nullish(),
      ...groupShapes.ramps,
      ...groupShapes.semantic,
      ...groupShapes.typography,
      ...groupShapes.spacing,
      ...groupShapes.radius,
      ...groupShapes.shadows,
      ...groupShapes.breakpoints,
    })
    .partial({ ramps: true, semantic: true, fonts: true, typeScale: true, spacing: true, radius: true, shadows: true, breakpoints: true, summary: true })
    .superRefine((v, ctx) => checkRefs(v.semantic, (v.ramps ?? []).map((r) => r.name), steps, ctx));
}
export type Generation = z.infer<ReturnType<typeof generationSchema>>;

export function groupSchema(group: GroupKey, steps: StepSet, rampNames: string[]) {
  const base = z.object(groupShapes[group] as z.ZodRawShape);
  if (group !== "semantic") return base;
  return base.superRefine((v, ctx) => checkRefs((v as { semantic?: Generation["semantic"] }).semantic, rampNames, steps, ctx));
}
export type GroupResult = Partial<Omit<Generation, "name" | "summary">>;

/** Turns model output into a full token set; groups outside the scope come from the starter set. */
export function buildTokenSet(gen: GroupResult, settings: Pick<SystemSettings, "steps">, base?: TokenSet): TokenSet {
  const start = base ? structuredClone(base) : blankTokenSet(settings);
  const out: TokenSet = { ...start };
  if (gen.ramps?.length) {
    out.ramps = gen.ramps.map((r) => {
      const prev = start.ramps.find((p) => p.name === r.name);
      // Keep hand-edited steps when the base didn't change.
      return prev && prev.base === r.base ? prev : makeRamp(r.name, r.base, STEP_SETS[settings.steps]);
    });
  }
  if (gen.semantic?.length) out.semantic = gen.semantic.map((s) => ({ ...s, on: s.on || null, description: s.description || null }));
  if (gen.fonts?.length) out.fonts = gen.fonts;
  if (gen.typeScale?.length) out.typeScale = gen.typeScale;
  if (gen.spacing?.length) out.spacing = gen.spacing;
  if (gen.radius?.length) out.radius = gen.radius;
  if (gen.shadows?.length) out.shadows = gen.shadows;
  if (gen.breakpoints?.length) out.breakpoints = gen.breakpoints;
  // Starter semantics reference neutral/brand; if the model renamed ramps, those refs would dangle.
  if (!gen.semantic?.length && gen.ramps?.length) {
    const names = new Set(out.ramps.map((r) => r.name));
    out.semantic = out.semantic.filter((s) => [s.light, s.dark].every((ref) => ref.startsWith("#") || names.has(ref.split("/")[1])));
  }
  return out;
}

export { nearestStep };
