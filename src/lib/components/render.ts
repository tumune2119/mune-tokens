import { cssColor, resolveRef, resolveSemantic } from "../tokens/color";
import { shadowCss, fontStack } from "../export/css";
import type { Mode, ShadowLayer, TokenSet } from "../tokens/schema";
import { COLOR_KEYS, DIM_KEYS, combos, fontRef, variantName, type ComponentSpec, type StyleKey } from "./schema";

/** A style value with the token it came from (null for raw values), so Figma can bind the variable. */
export interface Bound<T> {
  ref: string | null;
  value: T;
}

export interface FontValue {
  family: string;
  fallback: string;
  size: number;
  lineHeight: number;
  weight: number;
  letterSpacing: number;
}

export interface ResolvedStyle {
  background?: Bound<string>;
  color?: Bound<string>;
  borderColor?: Bound<string>;
  paddingX?: Bound<number | string>;
  paddingY?: Bound<number | string>;
  gap?: Bound<number | string>;
  height?: Bound<number | string>;
  minWidth?: Bound<number | string>;
  width?: Bound<number | string>;
  radius?: Bound<number | string>;
  borderWidth?: Bound<number | string>;
  iconSize?: Bound<number | string>;
  font?: Bound<FontValue>;
  shadow?: Bound<{ css: string; layers: ShadowLayer[] }>;
  opacity?: Bound<number>;
}

export interface RNode {
  part: string;
  kind: ComponentSpec["anatomy"][number]["kind"];
  direction: "row" | "column";
  text: string | null;
  icon: string | null;
  grow: boolean;
  style: ResolvedStyle;
  children: RNode[];
}

function resolveColor(set: TokenSet, v: string, mode: Mode): Bound<string> | undefined {
  if (v === "transparent") return { ref: null, value: "transparent" };
  if (v.startsWith("#")) return { ref: null, value: v };
  const hex = set.semantic.some((s) => s.path === v) ? resolveSemantic(set, v, mode) : resolveRef(set, v);
  return hex ? { ref: v, value: hex } : undefined;
}

function resolveDim(set: TokenSet, v: string | number): Bound<number | string> | undefined {
  if (typeof v === "number") return { ref: null, value: v };
  if (v === "auto" || v === "fill") return { ref: null, value: v };
  const [group, ...rest] = v.split("/");
  const name = rest.join("-");
  const list = group === "space" ? set.spacing : group === "radius" ? set.radius : null;
  const d = list?.find((x) => x.name === name);
  return d ? { ref: v, value: d.value } : undefined;
}

function resolveValue(set: TokenSet, key: StyleKey, v: string | number, mode: Mode): ResolvedStyle[keyof ResolvedStyle] {
  if ((COLOR_KEYS as readonly string[]).includes(key)) return typeof v === "string" ? resolveColor(set, v, mode) : undefined;
  if ((DIM_KEYS as readonly string[]).includes(key)) return resolveDim(set, v);
  if (key === "opacity") return typeof v === "number" ? { ref: null, value: v } : undefined;
  if (key === "font" && typeof v === "string") {
    const ref = fontRef(v);
    const t = set.typeScale.find((x) => `text/${x.name}` === ref);
    const f = t && set.fonts.find((x) => x.key === t.font);
    if (!t) return undefined;
    return { ref, value: { family: f?.family ?? "Inter", fallback: f?.fallback ?? "system-ui, sans-serif", size: t.size, lineHeight: t.lineHeight, weight: t.weight, letterSpacing: t.letterSpacing } };
  }
  if (key === "shadow" && typeof v === "string") {
    if (v === "none") return undefined;
    const s = set.shadows.find((x) => `shadow/${x.name}` === v);
    return s ? { ref: v, value: { css: shadowCss(s), layers: s.layers } } : undefined;
  }
  return undefined;
}

/** Applies the spec's style rules for one combination (least specific first) and builds the part tree. */
export function resolveTree(spec: ComponentSpec, set: TokenSet, mode: Mode, combo: Record<string, string>): RNode {
  const rules = spec.styles
    .map((r, i) => ({ r, i, n: Object.keys(r.when ?? {}).length }))
    .filter(({ r }) => Object.entries(r.when ?? {}).every(([k, v]) => combo[k] === v))
    .sort((a, b) => a.n - b.n || a.i - b.i);
  const raw = new Map<string, Partial<Record<StyleKey, string | number>>>();
  for (const { r } of rules) raw.set(r.part, { ...(raw.get(r.part) ?? {}), ...r.set });

  const build = (name: string): RNode => {
    const p = spec.anatomy.find((x) => x.name === name)!;
    const style: ResolvedStyle = {};
    for (const [k, v] of Object.entries(raw.get(name) ?? {})) {
      if (v === undefined) continue;
      const resolved = resolveValue(set, k as StyleKey, v, mode);
      if (resolved) (style as Record<string, unknown>)[k] = resolved;
    }
    return {
      part: p.name,
      kind: p.kind,
      direction: p.direction ?? "row",
      text: p.text ?? null,
      icon: p.icon ?? null,
      grow: !!p.grow,
      style,
      children: spec.anatomy.filter((c) => c.parent === p.name).map((c) => build(c.name)),
    };
  };
  const root = spec.anatomy.find((p) => !p.parent) ?? spec.anatomy[0];
  return build(root.name);
}

// ---------------------------------------------------------------------------
// HTML (inline styles only, no scripts) — used by the app preview and the export page.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const px = (v: number | string | undefined) => (typeof v === "number" ? `${v}px` : v === "fill" ? "100%" : v === "auto" ? "auto" : undefined);

/** Small Lucide-style glyphs (24px grid, stroke 2) for icon parts. */
const ICONS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-up": "m18 15-6-6-6 6",
  "chevron-right": "m9 18 6-6-6-6",
  "chevron-left": "m15 18-6-6 6-6",
  "arrow-right": "M5 12h14M12 5l7 7-7 7",
  search: "M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  info: "M12 16v-4M12 8h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  "triangle-alert": "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  circle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
};

export function iconPath(name: string | null) {
  return ICONS[name ?? ""] ?? ICONS.circle;
}

export function iconSvg(name: string | null, size: number, color: string) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;display:block"><path d="${iconPath(name)}"/></svg>`;
}

function fontCss(f: FontValue) {
  return `font-family:${esc(fontStack(f.family, f.fallback))};font-size:${f.size}px;line-height:${f.lineHeight}px;font-weight:${f.weight};letter-spacing:${f.letterSpacing}em;`;
}

/** Inherited text colour, so icon parts without their own colour follow the label. */
function nodeHtml(n: RNode, inherited: string): string {
  const s = n.style;
  const color = s.color ? cssColor(s.color.value) : inherited;
  const binds = Object.entries(s)
    .filter(([, b]) => (b as Bound<unknown>).ref)
    .map(([k, b]) => `${k}:${(b as Bound<unknown>).ref}`)
    .join(";");
  const data = `data-part="${esc(n.part)}"${binds ? ` data-bind="${esc(binds)}"` : ""}`;
  const box: string[] = [];
  if (s.background) box.push(`background:${cssColor(s.background.value)}`);
  if (s.color) box.push(`color:${color}`);
  if (s.borderColor || s.borderWidth) box.push(`border:${px(s.borderWidth?.value) ?? "1px"} solid ${s.borderColor ? cssColor(s.borderColor.value) : "currentColor"}`);
  if (s.radius) box.push(`border-radius:${px(s.radius.value)}`);
  if (s.paddingX) box.push(`padding-left:${px(s.paddingX.value)};padding-right:${px(s.paddingX.value)}`);
  if (s.paddingY) box.push(`padding-top:${px(s.paddingY.value)};padding-bottom:${px(s.paddingY.value)}`);
  if (s.height) box.push(`height:${px(s.height.value)}`);
  if (s.minWidth) box.push(`min-width:${px(s.minWidth.value)}`);
  if (s.width) box.push(`width:${px(s.width.value)}`);
  if (s.shadow) box.push(`box-shadow:${s.shadow.value.css}`);
  if (s.opacity) box.push(`opacity:${s.opacity.value}`);
  if (s.font) box.push(fontCss(s.font.value));
  if (n.grow) box.push("flex:1 1 0;min-width:0");

  switch (n.kind) {
    case "text":
      return `<span ${data} style="${box.join(";")};white-space:nowrap">${esc(n.text ?? "Label")}</span>`;
    case "input":
      return `<span ${data} style="${box.join(";")};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 0;min-width:0">${esc(n.text ?? "")}</span>`;
    case "icon": {
      const size = typeof s.iconSize?.value === "number" ? s.iconSize.value : 16;
      return `<span ${data} style="display:inline-flex;${s.opacity ? `opacity:${s.opacity.value}` : ""}">${iconSvg(n.icon, size, color)}</span>`;
    }
    case "divider":
      return `<div ${data} style="${n.grow ? "flex:1 1 0;" : ""}align-self:stretch;${n.direction === "column" ? "width:1px" : "height:1px;min-width:16px"};background:${s.color ? color : s.borderColor ? cssColor(s.borderColor.value) : "currentColor"};opacity:${s.opacity?.value ?? 1}"></div>`;
    case "spacer":
      return `<div ${data} style="flex:1 1 0"></div>`;
    default: {
      const layout = `display:flex;flex-direction:${n.direction};${n.direction === "row" ? "align-items:center" : "align-items:stretch"};${s.gap ? `gap:${px(s.gap.value)}` : ""};box-sizing:border-box`;
      return `<div ${data} style="${layout};${box.join(";")}">${n.children.map((c) => nodeHtml(c, color)).join("")}</div>`;
    }
  }
}

export function variantHtml(spec: ComponentSpec, set: TokenSet, mode: Mode, combo: Record<string, string>, inheritColor: string) {
  return nodeHtml(resolveTree(spec, set, mode, combo), inheritColor);
}

/**
 * The variant grid: one row per prop combination, one column per state. Each cell carries
 * data-component and data-variant (Figma's own variant naming) for importers.
 */
export function componentGridHtml(spec: ComponentSpec, set: TokenSet, mode: Mode, opts: { fg: string; muted: string; border: string }) {
  const all = combos(spec);
  const rows = new Map<string, Record<string, string>[]>();
  for (const c of all) {
    const { state, ...props } = c;
    void state;
    const key = variantName(props) || "default";
    rows.set(key, [...(rows.get(key) ?? []), c]);
  }
  // Columns size to their widest variant, so wide components are never clipped.
  const meta = `font-size:12px;line-height:16px;color:${opts.muted};font-family:ui-monospace,Menlo,Consolas,monospace`;
  const head = `<div></div>${spec.states.map((s) => `<div style="${meta}">${esc(s)}</div>`).join("")}`;
  const body = [...rows.entries()]
    .map(
      ([label, cells]) =>
        `<div style="${meta};max-width:220px;word-break:break-word">${esc(label)}</div>` +
        cells
          .map(
            (c) =>
              `<div data-component="${esc(spec.name)}" data-variant="${esc(variantName(c))}" style="display:flex;align-items:center;min-height:56px">${variantHtml(spec, set, mode, c, opts.fg)}</div>`,
          )
          .join(""),
    )
    .join("\n");
  return `<div style="display:grid;grid-template-columns:minmax(120px,max-content) repeat(${spec.states.length}, max-content);gap:16px 24px;align-items:center;width:max-content">${head}${body}</div>`;
}
