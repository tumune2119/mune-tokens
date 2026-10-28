import { z } from "zod";
import { isHex } from "../tokens/color";
import type { TokenSet } from "../tokens/schema";

/**
 * A component spec: named parts (anatomy), variant properties, states, and style rules that bind
 * each part to tokens. The same spec drives the in-app preview, the export page and the Figma
 * importer, so components only ever use token values.
 */
export const LEVELS = ["foundation", "primitive", "composite", "product"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = {
  foundation: "Foundations",
  primitive: "Primitives",
  composite: "Composites",
  product: "Product-specific",
};

export const STATUSES = ["draft", "ready", "exported"] as const;
export type ComponentStatus = (typeof STATUSES)[number];

export const PART_KINDS = ["container", "text", "icon", "input", "divider", "spacer"] as const;

export const COLOR_KEYS = ["background", "color", "borderColor"] as const;
export const DIM_KEYS = ["paddingX", "paddingY", "gap", "height", "minWidth", "width", "radius", "borderWidth", "iconSize"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];
export type DimKey = (typeof DIM_KEYS)[number];
export type StyleKey = ColorKey | DimKey | "font" | "shadow" | "opacity";

const seg = z.string().trim().regex(/^[a-z][a-z0-9-]*$/i, "letters, digits and dashes");
const val = z.union([z.string().trim().min(1).max(80), z.number().min(0).max(2000)]);

export const PartSchema = z.object({
  name: seg.transform((s) => s.toLowerCase()),
  kind: z.enum(PART_KINDS),
  /** Parent part name; null for the root (exactly one). */
  parent: z.string().trim().toLowerCase().nullish(),
  /** Sample content for text and input parts ("Label", "Search…"). */
  text: z.string().trim().max(80).nullish(),
  /** Icon name for icon parts (Lucide names: "plus", "check", "chevron-down", "x", "search"…). */
  icon: z.string().trim().max(40).nullish(),
  /** Layout of a container's children. */
  direction: z.enum(["row", "column"]).nullish(),
  /** Fill the remaining space in the parent. */
  grow: z.boolean().nullish(),
});

export const PropSchema = z.object({
  name: seg.transform((s) => s.toLowerCase()),
  values: z.array(z.string().trim().min(1).max(30)).min(1).max(6),
});

export const StyleRuleSchema = z.object({
  part: z.string().trim().toLowerCase(),
  /** Applies only when every listed prop (or "state") has this value. */
  when: z.record(z.string(), z.string()).nullish(),
  set: z.object({
    background: val.optional(),
    color: val.optional(),
    borderColor: val.optional(),
    paddingX: val.optional(),
    paddingY: val.optional(),
    gap: val.optional(),
    height: val.optional(),
    minWidth: val.optional(),
    width: val.optional(),
    radius: val.optional(),
    borderWidth: val.optional(),
    iconSize: val.optional(),
    font: val.optional(),
    shadow: val.optional(),
    opacity: z.number().min(0).max(1).optional(),
  }),
});

export const ComponentSpecSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.enum(LEVELS),
  description: z.string().trim().max(400).default(""),
  reason: z.string().trim().max(400).default(""),
  usedIn: z.array(z.string().trim().max(80)).max(12).default([]),
  anatomy: z.array(PartSchema).min(1).max(16),
  props: z.array(PropSchema).max(4).default([]),
  states: z.array(z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]*$/)).min(1).max(8),
  styles: z.array(StyleRuleSchema).max(120),
  a11y: z
    .object({
      role: z.string().trim().max(160).default(""),
      keyboard: z.string().trim().max(300).default(""),
      minTarget: z.number().min(0).max(100).nullish(),
      notes: z.array(z.string().trim().max(300)).max(10).default([]),
    })
    .default({ role: "", keyboard: "", notes: [] }),
  content: z.array(z.string().trim().max(300)).max(10).default([]),
});

export type Part = z.infer<typeof PartSchema>;
export type StyleRule = z.infer<typeof StyleRuleSchema>;
export type ComponentSpec = z.infer<typeof ComponentSpecSchema>;

/** At most this many variant × state cells per component, so pages and Figma sets stay usable. */
export const MAX_CELLS = 96;

export function combos(spec: Pick<ComponentSpec, "props" | "states">): Record<string, string>[] {
  let out: Record<string, string>[] = [{}];
  for (const p of spec.props) out = out.flatMap((c) => p.values.map((v) => ({ ...c, [p.name]: v })));
  return out.flatMap((c) => spec.states.map((s) => ({ ...c, state: s })));
}

/** Figma's variant naming: "variant=primary, size=md, state=hover". */
export function variantName(combo: Record<string, string>) {
  return Object.entries(combo)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

/** What a style value may point at, from the token set. */
export interface TokenIndex {
  colors: Set<string>;
  space: Set<string>;
  radius: Set<string>;
  text: Set<string>;
  shadow: Set<string>;
}

export function tokenIndex(set: TokenSet): TokenIndex {
  return {
    colors: new Set([...set.semantic.map((s) => s.path), ...set.ramps.flatMap((r) => Object.keys(r.steps).map((k) => `color/${r.name}/${k}`))]),
    space: new Set(set.spacing.map((d) => `space/${d.name}`)),
    radius: new Set(set.radius.map((d) => `radius/${d.name}`)),
    text: new Set(set.typeScale.map((t) => `text/${t.name}`)),
    shadow: new Set(set.shadows.map((s) => `shadow/${s.name}`)),
  };
}

/** Accepts "body/md" as shorthand for "text/body/md". */
export const fontRef = (v: string) => (v.startsWith("text/") ? v : `text/${v}`);

/** Returns a message if a style value doesn't resolve against the tokens. */
export function checkValue(key: StyleKey, v: string | number, idx: TokenIndex): string | null {
  if (key === "opacity") return typeof v === "number" ? null : "opacity must be a number";
  if (typeof v === "number") return (COLOR_KEYS as readonly string[]).includes(key) || key === "font" || key === "shadow" ? `${key} must be a token` : null;
  if ((COLOR_KEYS as readonly string[]).includes(key)) {
    return v === "transparent" || isHex(v) || idx.colors.has(v) ? null : `"${v}" is not a colour token`;
  }
  if (key === "font") return idx.text.has(fontRef(v)) ? null : `"${v}" is not a text style`;
  if (key === "shadow") return v === "none" || idx.shadow.has(v) ? null : `"${v}" is not a shadow token`;
  if (key === "radius") return idx.radius.has(v) || idx.space.has(v) ? null : `"${v}" is not a radius token`;
  return idx.space.has(v) || v === "auto" || v === "fill" ? null : `"${v}" is not a spacing token`;
}

/** Structural and token problems; used to validate AI output (fed back on retry) and hand edits. */
export function specProblems(spec: ComponentSpec, set: TokenSet): string[] {
  const out: string[] = [];
  const idx = tokenIndex(set);
  const names = new Set<string>();
  for (const p of spec.anatomy) {
    if (names.has(p.name)) out.push(`anatomy: duplicate part "${p.name}"`);
    names.add(p.name);
  }
  const roots = spec.anatomy.filter((p) => !p.parent);
  if (roots.length !== 1) out.push(`anatomy: needs exactly one root part (parent null), found ${roots.length}`);
  for (const p of spec.anatomy) {
    if (p.parent && !names.has(p.parent)) out.push(`anatomy: "${p.name}" has unknown parent "${p.parent}"`);
    if (p.parent && spec.anatomy.find((x) => x.name === p.parent)?.kind !== "container") out.push(`anatomy: parent of "${p.name}" must be a container`);
  }
  const propNames = new Set(spec.props.map((p) => p.name));
  if (propNames.has("state")) out.push(`props: "state" is reserved; list states in "states"`);
  spec.styles.forEach((r, i) => {
    if (!names.has(r.part)) out.push(`styles[${i}]: unknown part "${r.part}"`);
    for (const [k, v] of Object.entries(r.when ?? {})) {
      if (k === "state") {
        if (!spec.states.includes(v)) out.push(`styles[${i}].when: unknown state "${v}"`);
      } else if (!propNames.has(k)) out.push(`styles[${i}].when: unknown prop "${k}"`);
      else if (!spec.props.find((p) => p.name === k)!.values.includes(v)) out.push(`styles[${i}].when: "${k}" has no value "${v}"`);
    }
    for (const [k, v] of Object.entries(r.set)) {
      if (v === undefined) continue;
      const err = checkValue(k as StyleKey, v as string | number, idx);
      if (err) out.push(`styles[${i}].set.${k}: ${err}`);
    }
  });
  const cells = combos(spec).length;
  if (cells > MAX_CELLS) out.push(`${cells} variant × state combinations; keep it at ${MAX_CELLS} or fewer (fewer prop values or states)`);
  return out;
}

/** A spec schema that also checks token references, so a bad AI answer is retried with the reasons. */
export function specSchemaFor(set: TokenSet) {
  return ComponentSpecSchema.superRefine((spec, ctx) => {
    for (const message of specProblems(spec, set)) ctx.addIssue({ code: "custom", message });
  });
}

export const InventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.enum(LEVELS),
  reason: z.string().trim().max(300).default(""),
  usedIn: z.array(z.string().trim().max(80)).max(8).default([]),
  variants: z.array(z.string().trim().max(60)).max(10).default([]),
  states: z.array(z.string().trim().max(30)).max(8).default([]),
});
export const InventorySchema = z.object({ items: z.array(InventoryItemSchema).min(1).max(60) });
export type InventoryItem = z.infer<typeof InventoryItemSchema> & { estimateUsd?: number };

export interface ComponentRecord {
  id: string;
  systemId: string;
  name: string;
  level: Level;
  reason: string;
  spec: ComponentSpec | null;
  status: ComponentStatus;
  order: number;
  updatedAt: number;
}
