import { emptyTokenSet, hexSchema, type ShadowLayer, type TokenSet } from "./schema";
import { isHex } from "./color";

/**
 * Reads a W3C Design Tokens (DTCG) file — ours (tokens.json) or another tool's — into a token set.
 * Numeric-step colours ("color/brand/500") become ramps; other colours become semantic tokens;
 * aliases ("{color.neutral.50}") are kept as references. Unknown token types are skipped.
 */
export function importDtcg(json: unknown): { set: TokenSet; modes: ("light" | "dark")[]; name: string | null; skipped: number } {
  const set = emptyTokenSet();
  let skipped = 0;
  const root = (json ?? {}) as Record<string, unknown>;
  const rootExt = ((root.$extensions as Record<string, unknown> | undefined)?.["mune.tokens"] ?? {}) as Record<string, unknown>;
  const modes = (Array.isArray(rootExt.modes) ? rootExt.modes : ["light", "dark"]).filter((m): m is "light" | "dark" => m === "light" || m === "dark");
  const ramps = new Map<string, Record<string, string>>();

  const toRef = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const alias = v.match(/^\{(.+)\}$/);
    if (alias) return alias[1].replace(/\./g, "/").toLowerCase();
    const hex = hexSchema.safeParse(v);
    return hex.success ? hex.data : null;
  };
  const px = (v: unknown): number | null => {
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && "value" in v) {
      const o = v as { value: number; unit?: string };
      return o.unit === "rem" ? o.value * 16 : o.value;
    }
    if (typeof v === "string") {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? (v.endsWith("rem") ? n * 16 : n) : null;
    }
    return null;
  };
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "x";

  const walk = (node: Record<string, unknown>, path: string[], inheritedType?: string) => {
    const type = (node.$type as string | undefined) ?? inheritedType;
    if ("$value" in node) {
      visit(path.map(slug), type, node);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$") || !v || typeof v !== "object") continue;
      walk(v as Record<string, unknown>, [...path, k], type);
    }
  };

  const visit = (path: string[], type: string | undefined, node: Record<string, unknown>) => {
    const value = node.$value;
    const ext = ((node.$extensions as Record<string, unknown> | undefined)?.["mune.tokens"] ?? {}) as Record<string, unknown>;
    const p = path.join("/");
    if (type === "color") {
      const last = path[path.length - 1];
      const isPrimitive = ext.collection === "Primitives" || (path.length === 3 && /^\d+$/.test(last) && typeof value === "string" && isHex(value));
      if (isPrimitive && typeof value === "string" && isHex(value)) {
        const ramp = path[path.length - 2];
        ramps.set(ramp, { ...(ramps.get(ramp) ?? {}), [last]: value.toLowerCase() });
        return;
      }
      const modeVals = (ext.modes ?? {}) as Record<string, unknown>;
      const light = toRef(modeVals.light ?? value);
      const dark = toRef(modeVals.dark ?? value);
      if (!light || !dark) return void skipped++;
      set.semantic.push({
        path: path[0] === "color" ? p : `color/${p}`,
        light,
        dark,
        on: typeof ext.on === "string" ? ext.on : null,
        description: typeof node.$description === "string" ? node.$description : null,
      });
      return;
    }
    if (type === "fontFamily") {
      const list = Array.isArray(value) ? value.map(String) : [String(value)];
      set.fonts.push({ key: path[path.length - 1], family: list[0], fallback: list.slice(1).join(", ") || "system-ui, sans-serif" });
      return;
    }
    if (type === "typography" && value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      const size = px(v.fontSize) ?? 16;
      const lhRaw = v.lineHeight;
      const lineHeight = typeof ext.lineHeightPx === "number" ? ext.lineHeightPx : typeof lhRaw === "number" && lhRaw < 5 ? Math.round(lhRaw * size) : (px(lhRaw) ?? Math.round(size * 1.5));
      const ls = typeof ext.letterSpacingEm === "number" ? ext.letterSpacingEm : (px(v.letterSpacing) ?? 0) / size;
      const fontRef = typeof v.fontFamily === "string" ? v.fontFamily.replace(/^\{|\}$/g, "").split(".").pop()! : "sans";
      set.typeScale.push({
        name: (path[0] === "typography" ? path.slice(1) : path).join("/"),
        font: slug(fontRef),
        size,
        lineHeight,
        weight: Number(v.fontWeight) || 400,
        letterSpacing: Number(ls.toFixed(3)),
      });
      return;
    }
    if (type === "dimension") {
      const n = px(value);
      if (n === null) return void skipped++;
      const group = path[0];
      const name = path.slice(1).join("-") || path[0];
      if (/^(space|spacing|size)$/.test(group)) set.spacing.push({ name, value: n });
      else if (/^(radius|radii|border-radius)$/.test(group)) set.radius.push({ name, value: n });
      else if (/^(breakpoint|breakpoints|screen|screens)$/.test(group)) set.breakpoints.push({ name, value: n });
      else skipped++;
      return;
    }
    if (type === "shadow") {
      const layers = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
      const parsed: ShadowLayer[] = [];
      for (const l of layers) {
        const color = hexSchema.safeParse(l?.color);
        if (!color.success) continue;
        parsed.push({ x: px(l.offsetX) ?? 0, y: px(l.offsetY) ?? 0, blur: px(l.blur) ?? 0, spread: px(l.spread) ?? 0, color: color.data, inset: !!l.inset });
      }
      if (parsed.length) set.shadows.push({ name: path.slice(1).join("-") || path[0], layers: parsed });
      else skipped++;
      return;
    }
    skipped++;
  };

  walk(root, []);

  for (const [name, steps] of ramps) {
    const keys = Object.keys(steps).sort((a, b) => Number(a) - Number(b));
    const base = steps["500"] ?? steps[keys[Math.floor(keys.length / 2)]];
    const ordered: Record<string, string> = {};
    for (const k of keys) ordered[k] = steps[k];
    set.ramps.push({ name, base, steps: ordered });
  }
  if (!set.fonts.length && set.typeScale.length) {
    for (const key of new Set(set.typeScale.map((t) => t.font))) set.fonts.push({ key, family: "Inter", fallback: "system-ui, sans-serif" });
  }
  const name = typeof rootExt.name === "string" ? rootExt.name : null;
  return { set, modes: modes.length ? modes : ["light", "dark"], name, skipped };
}
