import { cssVar, modesOf, type SystemSettings, type TokenSet } from "../tokens/schema";
import { isHex } from "../tokens/color";

/**
 * W3C Design Tokens (DTCG) output — the source of truth for the Figma importer.
 * Primitives and semantic colours share the "color" root (the group names never clash);
 * each token says which Figma collection it belongs to, and semantic colours carry
 * one aliased value per mode under $extensions["mune.tokens"].modes.
 */
type Json = Record<string, unknown>;

const EXT = "mune.tokens";

function put(root: Json, path: string, token: Json) {
  const parts = path.split("/");
  let node = root;
  for (const p of parts.slice(0, -1)) {
    node[p] ??= {};
    node = node[p] as Json;
  }
  node[parts[parts.length - 1]] = token;
}

/** "color/neutral/50" → "{color.neutral.50}"; hex stays hex. */
export function aliasOf(ref: string) {
  return isHex(ref) ? ref : `{${ref.replace(/\//g, ".")}}`;
}

const dim = (value: number) => ({ value, unit: "px" });

export interface DtcgMeta {
  name: string;
  version: number;
  settings: SystemSettings;
}

export function toDtcg(set: TokenSet, meta: DtcgMeta): Json {
  const modes = modesOf(meta.settings);
  const root: Json = {
    $description: `${meta.name} design tokens · version ${meta.version}.`,
    $extensions: {
      [EXT]: {
        name: meta.name,
        version: meta.version,
        modes,
        collections: { Primitives: { modes: set.brands.length ? ["default", ...set.brands.map((b) => b.name)] : ["Value"] }, Semantic: { modes } },
        ...(set.brands.length ? { brands: ["default", ...set.brands.map((b) => b.name)] } : {}),
        contrast: meta.settings.contrast,
      },
    },
  };

  for (const r of set.ramps) {
    for (const [step, hex] of Object.entries(r.steps)) {
      // With brands, each primitive carries one value per brand (a mode of the Primitives collection).
      const brands = set.brands.length
        ? { brands: Object.fromEntries([["default", hex], ...set.brands.map((b) => [b.name, b.ramps.find((x) => x.name === r.name)?.steps[step] ?? hex])]) }
        : {};
      put(root, `color/${r.name}/${step}`, { $type: "color", $value: hex, $extensions: { [EXT]: { collection: "Primitives", ...brands } } });
    }
  }
  for (const s of set.semantic) {
    const values = Object.fromEntries(modes.map((m) => [m, aliasOf(s[m])]));
    put(root, s.path, {
      $type: "color",
      $value: values[modes[0]],
      ...(s.description ? { $description: s.description } : {}),
      $extensions: { [EXT]: { collection: "Semantic", modes: values, ...(s.on ? { on: s.on } : {}) } },
    });
  }
  for (const f of set.fonts) {
    const fallbacks = f.fallback.split(",").map((x) => x.trim()).filter(Boolean);
    put(root, `font/${f.key}`, { $type: "fontFamily", $value: [f.family, ...fallbacks] });
  }
  for (const t of set.typeScale) {
    put(root, `typography/${t.name}`, {
      $type: "typography",
      $value: {
        fontFamily: `{font.${t.font}}`,
        fontSize: dim(t.size),
        fontWeight: t.weight,
        lineHeight: Number((t.lineHeight / t.size).toFixed(4)),
        letterSpacing: dim(Number((t.letterSpacing * t.size).toFixed(2))),
      },
      $extensions: { [EXT]: { lineHeightPx: t.lineHeight, letterSpacingEm: t.letterSpacing } },
    });
  }
  const dims = (prefix: string, items: { name: string; value: number }[]) => {
    for (const d of items) put(root, `${prefix}/${d.name}`, { $type: "dimension", $value: dim(d.value) });
  };
  dims("space", set.spacing);
  dims("radius", set.radius);
  dims("breakpoint", set.breakpoints);
  for (const s of set.shadows) {
    put(root, `shadow/${s.name}`, {
      $type: "shadow",
      $value: s.layers.map((l) => ({
        color: l.color,
        offsetX: dim(l.x),
        offsetY: dim(l.y),
        blur: dim(l.blur),
        spread: dim(l.spread),
        ...(l.inset ? { inset: true } : {}),
      })),
    });
  }
  for (const d of set.motion.durations) put(root, `motion/duration/${d.name}`, { $type: "duration", $value: { value: d.value, unit: "ms" } });
  for (const e of set.motion.easings) put(root, `motion/easing/${e.name}`, { $type: "cubicBezier", $value: e.value });
  return root;
}

/** Token name ↔ CSS variable, as listed in UI-CONFIG.md. */
export function tokenVar(path: string) {
  return cssVar(path);
}
