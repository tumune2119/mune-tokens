import { contrastRatio, gradeContrast, inkOn, oklchLabel, resolveRef, resolveSemantic } from "../tokens/color";
import { cssVar, type Mode, type SystemSettings, type TokenSet } from "../tokens/schema";
import { fontStack, shadowCss } from "./css";

/**
 * Standalone export pages read by html.to.design. Deliberately boring: fixed 1440px width, no JS,
 * no animation, no sticky/hover-only content, one top-level <section> per Figma frame, every token's
 * name in visible text and in data-token (slash paths become Figma groups).
 */
export const EXPORT_PAGES = ["colors", "typography", "spacing", "effects"] as const;
export type ExportPage = (typeof EXPORT_PAGES)[number];
export const PAGE_LABELS: Record<ExportPage, string> = {
  colors: "Colours",
  typography: "Typography",
  spacing: "Spacing & Radius",
  effects: "Effects",
};

export interface PageMeta {
  name: string;
  version: number;
  settings: SystemSettings;
  /** Google Fonts stylesheet URLs that are known to load (see fonts.ts). */
  fontLinks: string[];
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Canvas {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  surface: string;
}

function canvasFor(set: TokenSet, mode: Mode): Canvas {
  const light = mode === "light";
  const pick = (path: string, fallback: string) => resolveSemantic(set, path, mode) ?? fallback;
  const bg = pick("color/bg/default", light ? "#ffffff" : "#0a0a0a");
  return {
    bg,
    fg: pick("color/text/default", light ? "#0a0a0a" : "#fafafa"),
    muted: pick("color/text/muted", light ? "#525252" : "#a3a3a3"),
    border: pick("color/border/default", light ? "#e5e5e5" : "#262626"),
    surface: pick("color/bg/surface", light ? "#ffffff" : "#141414"),
  };
}

function shell(title: string, meta: PageMeta, mode: Mode, set: TokenSet, body: string) {
  const c = canvasFor(set, mode);
  const fonts = meta.fontLinks.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join("\n");
  const sans = set.fonts.find((f) => f.key === "sans") ?? set.fonts[0];
  const uiFont = sans ? fontStack(sans.family, sans.fallback) : "system-ui, sans-serif";
  return `<!doctype html>
<html lang="en" data-theme="${mode}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1440">
<meta name="generator" content="MUNE Tokens">
<title>${esc(`${meta.name} — ${title} (${mode})`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${c.bg};color:${c.fg}}
body{width:1440px;font-family:${uiFont};font-size:14px;line-height:20px;-webkit-font-smoothing:antialiased}
.page{display:flex;flex-direction:column;gap:48px;padding:64px}
.frame{display:flex;flex-direction:column;gap:24px;padding:40px;border:1px solid ${c.border};border-radius:24px;background:${c.surface}}
.frame-head{display:flex;flex-direction:column;gap:4px}
h1{font-size:40px;line-height:48px;font-weight:700;letter-spacing:-0.02em}
h2{font-size:24px;line-height:32px;font-weight:600}
.muted{color:${c.muted}}
.mono{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:12px;line-height:16px}
.row{display:flex;gap:12px;flex-wrap:wrap}
.swatch{display:flex;flex-direction:column;gap:8px;width:96px}
.chip{height:96px;border-radius:12px;border:1px solid ${c.border};display:flex;align-items:flex-end;padding:8px;font-size:12px;line-height:16px;font-weight:600}
.card{display:flex;flex-direction:column;gap:8px;width:296px;padding:16px;border:1px solid ${c.border};border-radius:16px}
.label{display:flex;flex-direction:column;gap:2px}
.name{font-weight:600;font-size:13px;line-height:18px;word-break:break-all}
</style>
</head>
<body>
<main class="page">
<header class="frame" id="header" data-frame="Header">
<div class="frame-head">
<p class="muted mono">MUNE Tokens · version ${meta.version} · ${mode === "light" ? "Light" : "Dark"} mode</p>
<h1>${esc(meta.name)} — ${esc(title)}</h1>
</div>
</header>
${body}
</main>
</body>
</html>
`;
}

function frame(id: string, title: string, subtitle: string, content: string) {
  return `<section class="frame" id="${esc(id)}" data-frame="${esc(title)}">
<div class="frame-head"><h2>${esc(title)}</h2>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ""}</div>
${content}
</section>`;
}

function colorsPage(set: TokenSet, mode: Mode) {
  const parts: string[] = [];
  for (const r of set.ramps) {
    const swatches = Object.entries(r.steps)
      .map(([step, hex]) => {
        const token = `color/${r.name}/${step}`;
        return `<div class="swatch" data-token="${token}" data-value="${hex}">
<div class="chip" style="background:${hex};color:${inkOn(hex)}">${step}</div>
<div class="label"><span class="name">${token}</span><span class="mono muted">${hex.toUpperCase()}</span><span class="mono muted">${oklchLabel(hex)}</span></div>
</div>`;
      })
      .join("\n");
    parts.push(frame(`ramp-${r.name}`, `Primitives / ${r.name}`, `Base ${r.base.toUpperCase()}`, `<div class="row">${swatches}</div>`));
  }

  const groups = new Map<string, typeof set.semantic>();
  for (const s of set.semantic) {
    const g = s.path.split("/")[1];
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }
  for (const [group, tokens] of groups) {
    const cards = tokens
      .map((s) => {
        const ref = s[mode];
        const hex = resolveRef(set, ref) ?? "#ff00ff";
        const onHex = s.on ? resolveSemantic(set, s.on, mode) : null;
        const ratio = onHex ? contrastRatio(hex, onHex) : null;
        const preview = onHex
          ? `<div class="chip" style="background:${onHex};color:${hex};font-size:20px;line-height:24px">Aa</div>`
          : `<div class="chip" style="background:${hex}"></div>`;
        return `<div class="card" data-token="${s.path}" data-value="${hex}" data-alias="${esc(ref)}">
${preview}
<div class="label"><span class="name">${s.path}</span>
<span class="mono muted">${esc(ref.startsWith("#") ? ref.toUpperCase() : `→ ${ref}`)} · ${hex.toUpperCase()}</span>
${ratio ? `<span class="mono muted">on ${esc(s.on!)}: ${ratio.toFixed(2)}:1 · ${gradeContrast(ratio)}</span>` : ""}
${s.description ? `<span class="muted">${esc(s.description)}</span>` : ""}
</div>
</div>`;
      })
      .join("\n");
    parts.push(frame(`semantic-${group}`, `Semantic / ${group}`, `${mode === "light" ? "Light" : "Dark"} mode values`, `<div class="row">${cards}</div>`));
  }
  return parts.join("\n");
}

function typographyPage(set: TokenSet) {
  const parts: string[] = [];
  if (set.fonts.length) {
    const specimens = set.fonts
      .map(
        (f) => `<div class="card" style="width:400px" data-token="font/${f.key}">
<div style="font-family:${esc(fontStack(f.family, f.fallback))};font-size:72px;line-height:80px">Aa</div>
<div style="font-family:${esc(fontStack(f.family, f.fallback))};font-size:16px;line-height:24px">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 !?&amp;@#</div>
<div class="label"><span class="name">font/${f.key}</span><span class="muted">${esc(f.family)}</span><span class="mono muted">${esc(f.fallback)}</span></div>
</div>`,
      )
      .join("\n");
    parts.push(frame("fonts", "Fonts", "", `<div class="row">${specimens}</div>`));
  }
  if (set.typeScale.length) {
    const rows = set.typeScale
      .map((t) => {
        const f = set.fonts.find((x) => x.key === t.font);
        const family = f ? fontStack(f.family, f.fallback) : "inherit";
        return `<div style="display:flex;gap:32px;align-items:baseline;padding:16px 0;border-top:1px solid currentColor;border-color:rgba(127,127,127,0.25)" data-token="text/${t.name}">
<div class="label" style="width:280px;flex-shrink:0"><span class="name">${t.name}</span><span class="mono muted">${esc(f?.family ?? t.font)} · ${t.weight}</span><span class="mono muted">${t.size}px / ${t.lineHeight}px · ${t.letterSpacing}em</span></div>
<div style="font-family:${esc(family)};font-size:${t.size}px;line-height:${t.lineHeight}px;font-weight:${t.weight};letter-spacing:${t.letterSpacing}em;flex:1;min-width:0">The quick brown fox jumps over the lazy dog</div>
</div>`;
      })
      .join("\n");
    parts.push(frame("type-scale", "Type scale", "Size / line height · weight · letter spacing", `<div>${rows}</div>`));
  }
  return parts.join("\n");
}

function spacingPage(set: TokenSet, mode: Mode) {
  const accent = resolveSemantic(set, "color/action/primary/default", mode) ?? (mode === "light" ? "#0a0a0a" : "#fafafa");
  const parts: string[] = [];
  if (set.spacing.length) {
    const rows = set.spacing
      .map(
        (d) => `<div style="display:flex;gap:24px;align-items:center" data-token="space/${d.name}" data-value="${d.value}">
<div class="label" style="width:200px"><span class="name">space/${d.name}</span><span class="mono muted">${d.value}px · ${d.value / 16}rem · ${cssVar(`space/${d.name}`)}</span></div>
<div style="width:${Math.min(d.value, 1000)}px;height:24px;background:${accent};border-radius:4px"></div>
</div>`,
      )
      .join("\n");
    parts.push(frame("spacing", "Spacing", "", `<div style="display:flex;flex-direction:column;gap:12px">${rows}</div>`));
  }
  if (set.radius.length) {
    const boxes = set.radius
      .map(
        (d) => `<div class="swatch" style="width:136px" data-token="radius/${d.name}" data-value="${d.value}">
<div style="width:120px;height:120px;border:2px solid ${accent};border-radius:${d.value}px"></div>
<div class="label"><span class="name">radius/${d.name}</span><span class="mono muted">${d.value}px</span></div>
</div>`,
      )
      .join("\n");
    parts.push(frame("radius", "Radius", "", `<div class="row" style="gap:24px">${boxes}</div>`));
  }
  if (set.breakpoints.length) {
    const max = Math.max(...set.breakpoints.map((d) => d.value));
    const rows = set.breakpoints
      .map(
        (d) => `<div style="display:flex;gap:24px;align-items:center" data-token="breakpoint/${d.name}" data-value="${d.value}">
<div class="label" style="width:200px"><span class="name">breakpoint/${d.name}</span><span class="mono muted">${d.value}px</span></div>
<div style="width:${Math.round((d.value / max) * 1000)}px;height:16px;border:1px solid ${accent};border-radius:4px"></div>
</div>`,
      )
      .join("\n");
    parts.push(frame("breakpoints", "Breakpoints", "Min widths", `<div style="display:flex;flex-direction:column;gap:12px">${rows}</div>`));
  }
  return parts.join("\n");
}

function effectsPage(set: TokenSet, mode: Mode) {
  if (!set.shadows.length) return frame("shadows", "Shadows", "No shadows in this system yet.", "");
  const c = canvasFor(set, mode);
  const cards = set.shadows
    .map(
      (s) => `<div class="swatch" style="width:240px;gap:16px" data-token="shadow/${s.name}">
<div style="width:240px;height:140px;border-radius:16px;background:${c.surface};box-shadow:${shadowCss(s)}"></div>
<div class="label"><span class="name">shadow/${s.name}</span><span class="mono muted">${esc(shadowCss(s))}</span></div>
</div>`,
    )
    .join("\n");
  return frame("shadows", "Shadows", "", `<div class="row" style="gap:48px;padding:24px 8px">${cards}</div>`);
}

export function renderExportPage(set: TokenSet, page: ExportPage, mode: Mode, meta: PageMeta): string {
  const body =
    page === "colors"
      ? colorsPage(set, mode)
      : page === "typography"
        ? typographyPage(set)
        : page === "spacing"
          ? spacingPage(set, mode)
          : effectsPage(set, mode);
  return shell(PAGE_LABELS[page], meta, mode, set, body);
}
