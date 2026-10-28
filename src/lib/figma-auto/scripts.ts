import "server-only";
import fs from "node:fs";
import path from "node:path";
import { toDtcg } from "../export/dtcg";
import { iconPath, resolveValue } from "../components/render";
import type { ComponentSpec, StyleKey } from "../components/schema";
import { modesOf } from "../tokens/schema";
import type { SystemRecord } from "../types";

/**
 * Builds the Figma scripts for "Build in Figma". They reuse the importer plugin's own functions
 * (figma-plugin/code.js), so the automation and the plugin can't drift apart; each script carries
 * just the data it needs and stays under the use_figma size limit.
 */
export interface FigmaScript {
  label: string;
  code: string;
}

const LIMIT = 42_000; // use_figma accepts 50k characters; leave room for the wrapper

let plugin: string | null = null;
function pluginSource() {
  plugin ??= fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "figma-plugin", "code.js"), "utf8");
  return plugin;
}

/** One top-level declaration from code.js (function, or let/const), by name. */
function decl(name: string): string {
  const src = pluginSource();
  const m = new RegExp(`^(?:async )?function ${name}\\(|^(?:let|const) ${name}\\b`, "m").exec(src);
  if (!m) throw new Error(`figma-plugin/code.js has no top-level "${name}"`);
  const start = m.index;
  const lineEnd = src.indexOf("\n", start);
  const firstLine = src.slice(start, lineEnd);
  if (/;\s*$/.test(firstLine)) return firstLine;
  const end = src.indexOf("\n}", start);
  const after = src[end + 2] === ";" ? end + 3 : end + 2;
  return src.slice(start, after);
}

/**
 * Drops comments and indentation (the plugin source has no multi-line strings). Line comments go
 * first: they can contain "/*" (e.g. "space/*") that would otherwise start a bogus block comment.
 */
function minify(code: string) {
  return code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .join("\n")
    .replace(/\/\*\*[\s\S]*?\*\//g, "");
}

const PRELUDE = "let log = [];\nfunction note(line) { log.push(line); }";
const COMMON = ["rgba", "px", "aliasName", "flatten", "fontStyles", "WEIGHT_NAMES", "weightOf", "fontFor"];
const VARIABLES = ["collection", "ensureModes", "variablesIn", "variable", "semanticScopes", "importVariables"];
const STYLES = ["importTextStyles", "importEffectStyles"];
const COMPONENTS = ["buildContext", "paint", "num", "applyFont", "build", "stretch", "componentsPage", "importComponents"];
const SHOWCASE = ["stack", "varPaint", "label", "section", "resolvedHex", "hex", "componentsPage", "buildShowcase"];

function runtime(names: string[]) {
  return minify([PRELUDE, ...[...new Set([...COMMON, ...names])].map(decl)].join("\n"));
}

/** Variant trees are built inside Figma from the compact spec (mirrors resolveTree in render.ts). */
const TREES = minify(`
function combos(spec) {
  let out = [{}];
  for (const p of spec.props) out = out.flatMap((c) => p.values.map((v) => Object.assign({}, c, { [p.name]: v })));
  return out.flatMap((c) => spec.states.map((s) => Object.assign({}, c, { state: s })));
}
function variantName(c) { return Object.keys(c).map((k) => k + "=" + c[k]).join(", "); }
function resolveRef(k, v) {
  if (k === "opacity") return typeof v === "number" ? { ref: null, value: v } : null;
  if (typeof v === "number" || v === "transparent" || v === "auto" || v === "fill" || v.charAt(0) === "#") return { ref: null, value: v };
  if (v === "none") return null;
  const key = k === "font" && v.indexOf("text/") !== 0 ? "text/" + v : v;
  return Object.prototype.hasOwnProperty.call(REFS, key) ? { ref: key, value: REFS[key] } : null;
}
function treeFor(spec, combo) {
  const rules = spec.styles.map((r, i) => ({ r, i, n: Object.keys(r.when || {}).length }))
    .filter((x) => Object.keys(x.r.when || {}).every((k) => combo[k] === x.r.when[k]))
    .sort((a, b) => a.n - b.n || a.i - b.i);
  const raw = {};
  for (const x of rules) raw[x.r.part] = Object.assign(raw[x.r.part] || {}, x.r.set);
  const node = (name) => {
    const p = spec.anatomy.find((a) => a.name === name);
    const style = {};
    for (const k of Object.keys(raw[name] || {})) { const b = resolveRef(k, raw[name][k]); if (b) style[k] = b; }
    return { part: p.name, kind: p.kind, direction: p.direction || "row", text: p.text || null, icon: p.icon || null, grow: !!p.grow, style,
      children: spec.anatomy.filter((c) => c.parent === p.name).map((c) => node(c.name)) };
  };
  return node((spec.anatomy.find((a) => !a.parent) || spec.anatomy[0]).name);
}`);

const json = (v: unknown) => JSON.stringify(v);

/** Splits a DTCG document by its top-level groups so each part fits a script. */
function pick(dtcg: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = { $extensions: dtcg.$extensions };
  for (const k of keys) if (k in dtcg) out[k] = dtcg[k];
  return out;
}

export interface BuildPlan {
  scripts: FigmaScript[];
  expected: { primitives: number; semantic: number; textStyles: number; effectStyles: number; components: string[] };
}

export function buildScripts(rec: SystemRecord, specs: ComponentSpec[]): BuildPlan {
  const dtcg = toDtcg(rec.tokens, { name: rec.name, version: rec.version, settings: rec.settings }) as Record<string, unknown>;
  const scripts: FigmaScript[] = [];
  const name = rec.name;

  // 1. Cover page (the file's first page) with the project name.
  scripts.push({
    label: "Cover page",
    code: `${PRELUDE}
const NAME = ${json(name)};
const SUB = ${json(`Design system · version ${rec.version} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`)};
const first = figma.root.children[0];
let page = figma.root.children.find((p) => p.name === "Cover");
if (!page && figma.root.children.length === 1 && first.children.length === 0) page = first; // a brand-new file
if (!page) page = figma.createPage();
page.name = "Cover";
await figma.setCurrentPageAsync(page);
for (const n of page.children.filter((n) => n.name === "Cover")) n.remove();
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
const f = figma.createFrame();
f.name = "Cover"; f.fills = [{ type: "SOLID", color: { r: 0.04, g: 0.04, b: 0.04 } }];
f.layoutMode = "VERTICAL"; f.primaryAxisSizingMode = "FIXED"; f.counterAxisSizingMode = "FIXED"; f.resize(1920, 1080);
f.primaryAxisAlignItems = "CENTER"; f.paddingLeft = 160; f.itemSpacing = 24;
const t = figma.createText(); t.fontName = { family: "Inter", style: "Bold" }; t.fontSize = 120; t.characters = NAME; t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
const s = figma.createText(); s.fontName = { family: "Inter", style: "Regular" }; s.fontSize = 40; s.characters = SUB; s.fills = [{ type: "SOLID", color: { r: 0.64, g: 0.64, b: 0.64 } }];
f.appendChild(t); f.appendChild(s); page.appendChild(f);
note("Cover page");
return { log, pageId: page.id };`,
  });

  // 2. Variables: primitives (with brand modes), semantic (Light/Dark aliases), dimensions and motion.
  const varRuntime = runtime(VARIABLES);
  const colorParts: Record<string, unknown>[] = [];
  const color = (dtcg.color ?? {}) as Record<string, Record<string, unknown>>;
  const primitiveGroups = Object.keys(color).filter((g) => Object.values(color[g]).some((t) => (t as { $extensions?: Record<string, { collection?: string }> }).$extensions?.["mune.tokens"]?.collection === "Primitives"));
  const semanticGroups = Object.keys(color).filter((g) => !primitiveGroups.includes(g));
  colorParts.push({ $extensions: dtcg.$extensions, color: Object.fromEntries(primitiveGroups.map((g) => [g, color[g]])) });
  colorParts.push({ $extensions: dtcg.$extensions, color: Object.fromEntries(semanticGroups.map((g) => [g, color[g]])) });
  colorParts.push(pick(dtcg, ["space", "radius", "breakpoint", "motion"]));
  // Pack the parts into as few scripts as fit (primitives must run before semantic aliases them).
  let batch: Record<string, unknown>[] = [];
  const flush = () => {
    if (!batch.length) return;
    const merged = batch.reduce<Record<string, unknown>>((a, b) => {
      for (const [k, v] of Object.entries(b)) a[k] = k === "color" ? { ...((a.color as object) ?? {}), ...(v as object) } : v;
      return a;
    }, {});
    scripts.push({ label: `Variables (${scripts.filter((s) => s.label.startsWith("Variables")).length + 1})`, code: `const T = ${json(merged)};\n${varRuntime}\nawait importVariables(T);\nreturn { log };` });
    batch = [];
  };
  for (const part of colorParts) {
    const size = json([...batch, part]).length + varRuntime.length;
    if (batch.length && size > LIMIT) flush();
    batch.push(part);
  }
  flush();

  // 3. Text and effect styles.
  scripts.push({
    label: "Text and effect styles",
    code: `const T = ${json(pick(dtcg, ["font", "typography", "shadow"]))};\n${runtime(STYLES)}\nawait importTextStyles(T);\nawait importEffectStyles(T);\nreturn { log };`,
  });

  // 4. Components, in batches; trees are built in Figma from compact specs and a ref → value map.
  const mode = modesOf(rec.settings)[0];
  const refs: Record<string, unknown> = {};
  const icons: Record<string, string> = { circle: iconPath("circle") };
  for (const spec of specs) {
    for (const p of spec.anatomy) if (p.kind === "icon" && p.icon) icons[p.icon] = iconPath(p.icon);
    for (const r of spec.styles) {
      for (const [k, v] of Object.entries(r.set)) {
        if (typeof v !== "string" || v.startsWith("#") || ["transparent", "auto", "fill", "none"].includes(v)) continue;
        const b = resolveValue(rec.tokens, k as StyleKey, v, mode) as { ref: string | null; value: unknown } | undefined;
        if (b?.ref) refs[b.ref] = k === "shadow" ? { css: "" } : b.value; // shadows bind by style name
      }
    }
  }
  const compRuntime = runtime(COMPONENTS) + "\n" + TREES;
  const compact = specs.map((s) => ({ name: s.name, description: s.description, anatomy: s.anatomy, props: s.props, states: s.states, styles: s.styles }));
  let group: typeof compact = [];
  const pushComponents = () => {
    if (!group.length) return;
    scripts.push({
      label: `Components: ${group.map((c) => c.name).join(", ")}`,
      code: `const SPECS = ${json(group)};\nconst REFS = ${json(refs)};\nconst ICONS = ${json(icons)};\n${compRuntime}
const COMPS = SPECS.map((s) => ({ name: s.name, description: s.description, states: s.states, variants: combos(s).map((c) => ({ name: variantName(c), tree: treeFor(s, c) })) }));
await importComponents(COMPS, ICONS, true);
return { log };`,
    });
    group = [];
  };
  const base = compRuntime.length + json(refs).length + json(icons).length + 400;
  for (const c of compact) {
    if (group.length && base + json([...group, c]).length > LIMIT) pushComponents();
    group.push(c);
  }
  pushComponents();

  // 5. Showcase page, then page order and a read-only check of what exists.
  scripts.push({
    label: "Design System page",
    code: `${runtime(SHOWCASE)}\nconst r = await buildShowcase(${json(name)});\nreturn { log, pageId: r.page.id };`,
  });
  scripts.push({
    label: "Check",
    code: `const order = ["Cover", "Design System", "Components"];
order.forEach((n, i) => { const p = figma.root.children.find((x) => x.name === n); if (p) figma.root.insertChild(Math.min(i, figma.root.children.length - 1), p); });
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const comp = figma.root.children.find((p) => p.name === "Components");
let sets = [];
if (comp) { await comp.loadAsync(); sets = comp.children.filter((n) => n.type === "COMPONENT_SET").map((s) => s.name + ":" + s.children.length); }
return {
  pages: figma.root.children.map((p) => p.name),
  collections: cols.map((c) => ({ name: c.name, modes: c.modes.map((m) => m.name), count: c.variableIds.length })),
  textStyles: (await figma.getLocalTextStylesAsync()).length,
  effectStyles: (await figma.getLocalEffectStylesAsync()).length,
  components: sets,
};`,
  });

  // Compile (not run) every script, so a broken one stops here instead of halfway through Figma.
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (body: string) => unknown;
  for (const s of scripts) {
    if (s.code.length > 50_000) throw new Error(`Figma script "${s.label}" is too large (${s.code.length} characters).`);
    try {
      new AsyncFunction(s.code);
    } catch (err) {
      throw new Error(`Figma script "${s.label}" doesn't compile: ${(err as Error).message}`);
    }
  }
  return {
    scripts,
    expected: {
      primitives: rec.tokens.ramps.reduce((n, r) => n + Object.keys(r.steps).length, 0),
      semantic: rec.tokens.semantic.length,
      textStyles: rec.tokens.typeScale.length,
      effectStyles: rec.tokens.shadows.length,
      components: specs.map((s) => s.name),
    },
  };
}
