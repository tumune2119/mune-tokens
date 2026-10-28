// @ts-check
/// <reference types="@figma/plugin-typings" />
// MUNE Tokens Importer — runs in Figma's plugin sandbox. Plain JS (no build step); kept to
// syntax every Figma version runs (no optional chaining / nullish coalescing).
//
// Creates, or updates in place by name:
//   Variables  · "Primitives" (one mode), "Semantic" (Light/Dark, aliasing primitives),
//                "Dimensions" (space/*, radius/*, breakpoint/*)
//   Styles     · text styles from typography/*, effect styles from shadow/*
//   Components · one component set per Ready component, variant properties from the spec,
//                fills/strokes/padding/gap/radius bound to the variables above

figma.showUI(__html__, { width: 420, height: 600, themeColors: true });

/** @type {string[]} */
let log = [];
/** @param {string} line */
function note(line) {
  log.push(line);
  figma.ui.postMessage({ type: "log", line: line });
}

// ---------------------------------------------------------------------------
// Values

/** @param {string} hex */
function rgba(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.slice(0, 6), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/** @param {any} v */
function px(v) {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof v.value === "number") return v.unit === "rem" ? v.value * 16 : v.value;
  return Number.parseFloat(String(v)) || 0;
}

/** "{color.neutral.50}" → "color/neutral/50"; anything else → null. @param {any} v */
function aliasName(v) {
  if (typeof v !== "string") return null;
  const m = v.match(/^\{(.+)\}$/);
  return m ? m[1].split(".").join("/") : null;
}

/**
 * Flattens a DTCG document into [{ path, type, value, description, ext }].
 * @param {any} root
 */
function flatten(root) {
  /** @type {{ path: string, type: string, value: any, description: string, ext: any }[]} */
  const out = [];
  /** @param {any} node @param {string[]} path @param {string | undefined} inherited */
  function walk(node, path, inherited) {
    const type = node.$type || inherited;
    if (Object.prototype.hasOwnProperty.call(node, "$value")) {
      const ext = (node.$extensions && node.$extensions["mune.tokens"]) || {};
      out.push({ path: path.join("/"), type: type || "", value: node.$value, description: node.$description || "", ext: ext });
      return;
    }
    for (const key of Object.keys(node)) {
      if (key.charAt(0) === "$") continue;
      const child = node[key];
      if (child && typeof child === "object") walk(child, path.concat(key), type);
    }
  }
  walk(root, [], undefined);
  return out;
}

// ---------------------------------------------------------------------------
// Variables

/** @param {string} name */
async function collection(name) {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of all) if (c.name === name) return c;
  return figma.variables.createVariableCollection(name);
}

/**
 * Makes the collection's modes match `names` (renames the first, adds the rest).
 * Returns modeIds in order; null when the Figma plan doesn't allow more modes.
 * @param {VariableCollection} col @param {string[]} names
 */
function ensureModes(col, names) {
  /** @type {string[]} */
  const ids = [];
  for (let i = 0; i < names.length; i++) {
    const existing = col.modes.find((m) => m.name === names[i]);
    if (existing) {
      ids.push(existing.modeId);
    } else if (i === 0 && col.modes.length === 1 && names.indexOf(col.modes[0].name) === -1) {
      col.renameMode(col.modes[0].modeId, names[0]);
      ids.push(col.modes[0].modeId);
    } else {
      try {
        ids.push(col.addMode(names[i]));
      } catch (e) {
        return null;
      }
    }
  }
  return ids;
}

/** @param {VariableCollection} col */
async function variablesIn(col) {
  /** @type {Map<string, Variable>} */
  const map = new Map();
  for (const id of col.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) map.set(v.name, v);
  }
  return map;
}

/**
 * @param {Map<string, Variable>} existing @param {string} name @param {VariableCollection} col
 * @param {VariableResolvedDataType} type
 */
function variable(existing, name, col, type) {
  const found = existing.get(name);
  if (found && found.resolvedType === type) return found;
  if (found) found.remove();
  const v = figma.variables.createVariable(name, col, type);
  existing.set(name, v);
  return v;
}

/** @param {string} path @returns {VariableScope[]} */
function semanticScopes(path) {
  const group = path.split("/")[1];
  if (group === "bg" || group === "surface") return ["FRAME_FILL", "SHAPE_FILL"];
  if (group === "text") return ["TEXT_FILL"];
  if (group === "border") return ["STROKE_COLOR"];
  if (group === "focus") return ["STROKE_COLOR", "EFFECT_COLOR"];
  return ["ALL_FILLS", "STROKE_COLOR"];
}

/** @param {any} tokens */
async function importVariables(tokens) {
  const flat = flatten(tokens);
  const rootExt = (tokens.$extensions && tokens.$extensions["mune.tokens"]) || {};
  const modes = /** @type {string[]} */ (rootExt.modes || ["light", "dark"]);
  const modeNames = modes.map((m) => (m === "light" ? "Light" : m === "dark" ? "Dark" : m));

  // Primitives: colours with collection "Primitives" (or plain hex colours under color/<ramp>/<step>).
  const prim = await collection("Primitives");
  const primMode = ensureModes(prim, ["Value"]);
  const primVars = await variablesIn(prim);
  let n = 0;
  for (const t of flat) {
    if (t.type !== "color" || t.ext.collection === "Semantic") continue;
    if (typeof t.value !== "string" || t.value.charAt(0) !== "#") continue;
    const v = variable(primVars, t.path, prim, "COLOR");
    v.setValueForMode(/** @type {string[]} */ (primMode)[0], rgba(t.value));
    v.scopes = []; // hidden from pickers: use semantic colours in designs
    n++;
  }
  note(`Primitives: ${n} colours`);

  // Semantic: one value per mode, aliasing primitives.
  const sem = await collection("Semantic");
  let semModes = ensureModes(sem, modeNames);
  /** @type {VariableCollection | null} */
  let darkCol = null;
  if (!semModes) {
    // Plans without multiple modes: Light in "Semantic", Dark in its own collection.
    semModes = ensureModes(sem, [modeNames[0]]);
    if (modeNames.length > 1) {
      darkCol = await collection("Semantic (" + modeNames[1] + ")");
      ensureModes(darkCol, [modeNames[1]]);
      note("This Figma plan allows one mode per collection: " + modeNames[1] + " values went to a separate collection.");
    }
  }
  const semVars = await variablesIn(sem);
  const darkVars = darkCol ? await variablesIn(darkCol) : null;
  let s = 0;
  for (const t of flat) {
    if (t.type !== "color" || t.ext.collection !== "Semantic") continue;
    const values = t.ext.modes || {};
    /** @param {Variable} target @param {string} modeId @param {string} mode */
    const setMode = (target, modeId, mode) => {
      const raw = values[mode] || t.value;
      const ref = aliasName(raw);
      const source = ref ? primVars.get(ref) || semVars.get(ref) : null;
      if (source) target.setValueForMode(modeId, figma.variables.createVariableAlias(source));
      else if (typeof raw === "string" && raw.charAt(0) === "#") target.setValueForMode(modeId, rgba(raw));
      else note("! " + t.path + " (" + mode + "): can't resolve " + raw);
    };
    const v = variable(semVars, t.path, sem, "COLOR");
    v.description = t.description;
    v.scopes = semanticScopes(t.path);
    modes.forEach((mode, i) => {
      if (darkCol && i > 0) return;
      setMode(v, /** @type {string[]} */ (semModes)[i], mode);
    });
    if (darkCol && darkVars) {
      const d = variable(darkVars, t.path, darkCol, "COLOR");
      d.description = t.description;
      d.scopes = semanticScopes(t.path);
      setMode(d, darkCol.modes[0].modeId, modes[1]);
    }
    s++;
  }
  note(`Semantic: ${s} colours · modes ${modeNames.join(" / ")}`);

  // Dimensions: space/*, radius/*, breakpoint/* as numbers.
  const dims = await collection("Dimensions");
  const dimMode = ensureModes(dims, ["Value"]);
  const dimVars = await variablesIn(dims);
  let d = 0;
  for (const t of flat) {
    if (t.type !== "dimension") continue;
    const group = t.path.split("/")[0];
    const v = variable(dimVars, t.path, dims, "FLOAT");
    v.setValueForMode(/** @type {string[]} */ (dimMode)[0], px(t.value));
    v.scopes = group === "radius" ? ["CORNER_RADIUS"] : group === "space" ? ["GAP", "WIDTH_HEIGHT"] : ["WIDTH_HEIGHT"];
    d++;
  }
  note(`Dimensions: ${d} numbers`);
}

// ---------------------------------------------------------------------------
// Fonts and styles

/** @type {Map<string, string[]> | null} */
let fontStyles = null;
const WEIGHT_NAMES = {
  100: ["Thin", "Hairline"],
  200: ["ExtraLight", "Extra Light", "UltraLight"],
  300: ["Light"],
  400: ["Regular", "Normal", "Book", "Roman"],
  500: ["Medium"],
  600: ["SemiBold", "Semi Bold", "DemiBold", "Demi Bold"],
  700: ["Bold"],
  800: ["ExtraBold", "Extra Bold", "UltraBold", "Heavy"],
  900: ["Black", "Heavy"],
};

/** @param {string} style */
function weightOf(style) {
  const s = style.toLowerCase().replace(/italic|oblique/g, "").trim();
  for (const w of Object.keys(WEIGHT_NAMES)) {
    for (const name of /** @type {Record<string, string[]>} */ (WEIGHT_NAMES)[w]) if (s === name.toLowerCase()) return Number(w);
  }
  return 400;
}

/**
 * The installed style for a family closest to the weight (non-italic), or null if the family isn't available.
 * @param {string} family @param {number} weight @returns {Promise<FontName | null>}
 */
async function fontFor(family, weight) {
  if (!fontStyles) {
    fontStyles = new Map();
    for (const f of await figma.listAvailableFontsAsync()) {
      const list = fontStyles.get(f.fontName.family) || [];
      list.push(f.fontName.style);
      fontStyles.set(f.fontName.family, list);
    }
  }
  const styles = (fontStyles.get(family) || []).filter((st) => !/italic|oblique/i.test(st));
  if (!styles.length) return null;
  let best = styles[0];
  for (const st of styles) if (Math.abs(weightOf(st) - weight) < Math.abs(weightOf(best) - weight)) best = st;
  const font = { family: family, style: best };
  await figma.loadFontAsync(font);
  return font;
}

/** @param {any} tokens */
async function importTextStyles(tokens) {
  const flat = flatten(tokens);
  /** @type {Record<string, string>} */
  const families = {};
  for (const t of flat) if (t.type === "fontFamily") families["{" + t.path.split("/").join(".") + "}"] = Array.isArray(t.value) ? t.value[0] : String(t.value);
  const existing = await figma.getLocalTextStylesAsync();
  let n = 0;
  /** @type {string[]} */
  const missing = [];
  for (const t of flat) {
    if (t.type !== "typography") continue;
    const v = t.value;
    const family = families[v.fontFamily] || String(v.fontFamily).replace(/[{}]/g, "");
    const size = px(v.fontSize);
    const font = await fontFor(family, Number(v.fontWeight) || 400);
    if (!font) {
      if (missing.indexOf(family) === -1) missing.push(family);
      continue;
    }
    const name = t.path.replace(/^typography\//, "");
    const style = existing.find((st) => st.name === name) || figma.createTextStyle();
    style.name = name;
    style.fontName = font;
    style.fontSize = size;
    const lh = typeof t.ext.lineHeightPx === "number" ? t.ext.lineHeightPx : typeof v.lineHeight === "number" ? Math.round(v.lineHeight * size) : px(v.lineHeight);
    style.lineHeight = { unit: "PIXELS", value: lh };
    const em = typeof t.ext.letterSpacingEm === "number" ? t.ext.letterSpacingEm : px(v.letterSpacing) / size;
    style.letterSpacing = { unit: "PERCENT", value: Math.round(em * 1000) / 10 };
    n++;
  }
  note(`Text styles: ${n}`);
  if (missing.length) note("! Fonts not installed in Figma (skipped): " + missing.join(", ") + ". Install them (Google Fonts) and run again.");
}

/** @param {any} tokens */
async function importEffectStyles(tokens) {
  const existing = await figma.getLocalEffectStylesAsync();
  let n = 0;
  for (const t of flatten(tokens)) {
    if (t.type !== "shadow") continue;
    const layers = Array.isArray(t.value) ? t.value : [t.value];
    const style = existing.find((st) => st.name === t.path) || figma.createEffectStyle();
    style.name = t.path;
    style.effects = layers.map((l) => {
      const c = rgba(l.color);
      return /** @type {Effect} */ ({
        type: l.inset ? "INNER_SHADOW" : "DROP_SHADOW",
        color: c,
        offset: { x: px(l.offsetX), y: px(l.offsetY) },
        radius: px(l.blur),
        spread: px(l.spread),
        visible: true,
        blendMode: "NORMAL",
      });
    });
    n++;
  }
  note(`Effect styles: ${n}`);
}

// ---------------------------------------------------------------------------
// Components

/**
 * @typedef {{ ref: string | null, value: any }} Bound
 * @typedef {{ part: string, kind: string, direction: "row" | "column", text: string | null, icon: string | null, grow: boolean, style: Record<string, Bound>, children: RNode[] }} RNode
 * @typedef {{ vars: Map<string, Variable>, textStyles: Map<string, TextStyle>, effectStyles: Map<string, EffectStyle>, icons: Record<string, string> }} Ctx
 */

async function buildContext(/** @type {Record<string, string>} */ icons) {
  /** @type {Map<string, Variable>} */
  const vars = new Map();
  for (const v of await figma.variables.getLocalVariablesAsync()) if (!vars.has(v.name)) vars.set(v.name, v);
  const textStyles = new Map((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
  const effectStyles = new Map((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]));
  return { vars: vars, textStyles: textStyles, effectStyles: effectStyles, icons: icons };
}

/** @param {Ctx} ctx @param {Bound} b @returns {SolidPaint} */
function paint(ctx, b) {
  const c = rgba(b.value);
  /** @type {SolidPaint} */
  let p = { type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
  const v = b.ref ? ctx.vars.get(b.ref) : null;
  if (v) p = figma.variables.setBoundVariableForPaint(p, "color", v);
  return p;
}

/**
 * Sets a number field and binds it to the token's variable when there is one.
 * @param {Ctx} ctx @param {any} node @param {VariableBindableNodeField} field @param {Bound | undefined} b
 */
function num(ctx, node, field, b) {
  if (!b || typeof b.value !== "number") return;
  // width/height are read-only on nodes; they change through resize().
  if (field === "width") node.resize(b.value, node.height);
  else if (field === "height") node.resize(node.width, b.value);
  else node[field] = b.value;
  const v = b.ref ? ctx.vars.get(b.ref) : null;
  if (v) node.setBoundVariable(field, v);
}

/** @param {Ctx} ctx @param {Bound | undefined} font @param {TextNode} t */
async function applyFont(ctx, font, t) {
  const f = font && font.value;
  const loaded = f ? await fontFor(f.family, f.weight) : null;
  t.fontName = loaded || (await fontFor("Inter", 400)) || { family: "Inter", style: "Regular" };
  if (!f) return;
  const style = font && font.ref ? ctx.textStyles.get(font.ref.replace(/^text\//, "")) : null;
  if (style && loaded) {
    await t.setTextStyleIdAsync(style.id);
    return;
  }
  t.fontSize = f.size;
  t.lineHeight = { unit: "PIXELS", value: f.lineHeight };
  t.letterSpacing = { unit: "PERCENT", value: Math.round(f.letterSpacing * 1000) / 10 };
}

/**
 * Builds one part (and its children) inside `parent`. `into` is used for the root (the component itself).
 * @param {Ctx} ctx @param {RNode} n @param {(FrameNode | ComponentNode) | null} parent
 * @param {{ color: Bound | null, font: Bound | null }} inherit @param {ComponentNode} [into]
 * @returns {Promise<SceneNode>}
 */
async function build(ctx, n, parent, inherit, into) {
  const s = n.style;
  const color = s.color || inherit.color;
  const font = s.font || inherit.font;
  const horizontal = parent ? parent.layoutMode === "HORIZONTAL" : true;

  if (n.kind === "text" || n.kind === "input") {
    const t = figma.createText();
    t.name = n.part;
    await applyFont(ctx, font || undefined, t);
    t.characters = n.text || (n.kind === "input" ? "" : "Label");
    if (color && color.value !== "transparent") t.fills = [paint(ctx, color)];
    if (s.opacity) t.opacity = s.opacity.value;
    if (parent) parent.appendChild(t);
    if (n.grow || n.kind === "input") t.textTruncation = "ENDING";
    return t;
  }

  if (n.kind === "icon") {
    const size = s.iconSize && typeof s.iconSize.value === "number" ? s.iconSize.value : 16;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (ctx.icons[n.icon || ""] || ctx.icons.circle) + '"/></svg>';
    const icon = figma.createNodeFromSvg(svg);
    icon.name = n.part + (n.icon ? " / " + n.icon : "");
    icon.resize(size, size);
    if (color && color.value !== "transparent") {
      const p = paint(ctx, color);
      for (const v of icon.findAll((x) => x.type === "VECTOR")) /** @type {VectorNode} */ (v).strokes = [p];
    }
    if (parent) parent.appendChild(icon);
    return icon;
  }

  if (n.kind === "divider") {
    const r = figma.createRectangle();
    r.name = n.part;
    const c = s.color || s.borderColor || color;
    r.fills = c ? [paint(ctx, c)] : [];
    r.resize(horizontal ? 16 : 1, horizontal ? 1 : 16);
    if (parent) parent.appendChild(r);
    return r;
  }

  const f = into || figma.createFrame();
  f.name = into ? f.name : n.part;
  f.layoutMode = n.kind === "spacer" || n.direction === "row" ? "HORIZONTAL" : "VERTICAL";
  f.counterAxisAlignItems = f.layoutMode === "HORIZONTAL" ? "CENTER" : "MIN";
  f.fills = s.background && s.background.value !== "transparent" ? [paint(ctx, s.background)] : [];
  if (parent) parent.appendChild(f);
  f.layoutSizingHorizontal = "HUG";
  f.layoutSizingVertical = "HUG";

  num(ctx, f, "paddingLeft", s.paddingX);
  num(ctx, f, "paddingRight", s.paddingX);
  num(ctx, f, "paddingTop", s.paddingY);
  num(ctx, f, "paddingBottom", s.paddingY);
  num(ctx, f, "itemSpacing", s.gap);
  for (const corner of /** @type {VariableBindableNodeField[]} */ (["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"])) num(ctx, f, corner, s.radius);
  if (s.borderColor || s.borderWidth) {
    f.strokes = s.borderColor && s.borderColor.value !== "transparent" ? [paint(ctx, s.borderColor)] : color ? [paint(ctx, color)] : [];
    f.strokeWeight = s.borderWidth && typeof s.borderWidth.value === "number" ? s.borderWidth.value : 1;
    f.strokeAlign = "INSIDE";
  }
  if (s.opacity) f.opacity = s.opacity.value;
  if (s.shadow && s.shadow.ref) {
    const st = ctx.effectStyles.get(s.shadow.ref);
    if (st) await f.setEffectStyleIdAsync(st.id);
  }

  // Children are built at their natural (HUG) size first; stretching is decided below, once this
  // frame's own width is known. (A FILL child inside a HUG parent collapses to 1px in Figma.)
  for (const child of n.children) await build(ctx, child, f, { color: color, font: font });

  if (s.height && typeof s.height.value === "number") {
    f.layoutSizingVertical = "FIXED";
    num(ctx, f, "height", s.height);
  }
  const fill = s.width && s.width.value === "fill";
  if (fill && !parent) {
    // A full-width root (a list row, a field): give it a usable width, at least its natural one.
    const w = Math.max(360, f.width);
    f.layoutSizingHorizontal = "FIXED";
    f.resize(w, f.height);
  } else if (s.width && typeof s.width.value === "number") {
    f.layoutSizingHorizontal = "FIXED";
    num(ctx, f, "width", s.width);
  }
  if (s.minWidth && typeof s.minWidth.value === "number") num(ctx, f, "minWidth", s.minWidth);

  return f;
}

/**
 * Second pass, top-down once the whole tree exists: "fill" / grow / spacer / input / divider parts
 * stretch, but only inside frames that have a width of their own (not HUG).
 * @param {SceneNode} node @param {RNode} n
 */
function stretch(node, n) {
  if (!("layoutMode" in node)) return;
  const f = /** @type {FrameNode} */ (node);
  n.children.forEach((c, i) => {
    const k = /** @type {any} */ (f.children[i]);
    if (!k) return;
    const wants =
      (c.style.width && c.style.width.value === "fill") || c.grow || c.kind === "spacer" || c.kind === "input" || (c.kind === "divider" && f.layoutMode === "HORIZONTAL");
    if (wants && f.layoutSizingHorizontal !== "HUG") k.layoutSizingHorizontal = "FILL";
    if (c.kind === "container" || c.kind === "spacer") stretch(k, c);
  });
}

/** @param {string} name */
async function componentsPage(name) {
  let page = figma.root.children.find((p) => p.name === name);
  if (!page) {
    page = figma.createPage();
    page.name = name;
  }
  await page.loadAsync();
  return page;
}

/**
 * @param {any[]} components @param {Record<string, string>} icons @param {boolean} replace
 */
async function importComponents(components, icons, replace) {
  if (!components.length) {
    note("Components: none marked Ready in the app.");
    return;
  }
  const ctx = await buildContext(icons);
  const page = await componentsPage("MUNE Components");
  let y = 0;
  for (const node of page.children) y = Math.max(y, node.y + node.height + 120);
  let made = 0;
  for (const c of components) {
    const old = page.children.find((x) => x.type === "COMPONENT_SET" && x.name === c.name);
    if (old && !replace) {
      note("· " + c.name + ": already on the page (tick “Replace existing” to rebuild it)");
      continue;
    }
    /** @type {ComponentNode[]} */
    const nodes = [];
    for (const v of c.variants) {
      const comp = figma.createComponent();
      comp.name = v.name;
      page.appendChild(comp);
      await build(ctx, v.tree, null, { color: null, font: null }, comp);
      stretch(comp, v.tree);
      nodes.push(comp);
    }
    const set = figma.combineAsVariants(nodes, page);
    set.name = c.name;
    set.description = c.description || "";

    // Grid: one row per prop combination, one column per state.
    const gap = 24;
    const pad = 32;
    const cols = c.states.length;
    /** @type {number[]} */
    const colW = new Array(cols).fill(0);
    /** @type {number[]} */
    const rowH = [];
    nodes.forEach((nd, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      colW[col] = Math.max(colW[col], nd.width);
      rowH[row] = Math.max(rowH[row] || 0, nd.height);
    });
    nodes.forEach((nd, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nd.x = pad + colW.slice(0, col).reduce((a, b) => a + b + gap, 0);
      nd.y = pad + rowH.slice(0, row).reduce((a, b) => a + b + gap, 0);
    });
    const w = pad * 2 + colW.reduce((a, b) => a + b, 0) + gap * (cols - 1);
    const h = pad * 2 + rowH.reduce((a, b) => a + b, 0) + gap * (rowH.length - 1);
    set.resizeWithoutConstraints(Math.max(w, 100), Math.max(h, 60));
    set.fills = [];
    set.strokes = [{ type: "SOLID", color: { r: 0.6, g: 0.33, b: 1 } }];
    set.dashPattern = [6, 4];
    set.cornerRadius = 8;
    if (old) {
      set.x = old.x;
      set.y = old.y;
      old.remove();
    } else {
      set.x = 0;
      set.y = y;
      y += set.height + 120;
    }
    made++;
    note("· " + c.name + ": " + nodes.length + " variants");
  }
  note(`Components: ${made} component set${made === 1 ? "" : "s"} on the “MUNE Components” page`);
}

// ---------------------------------------------------------------------------

figma.ui.onmessage = async (msg) => {
  if (msg.type !== "import") return;
  log = [];
  const p = msg.payload;
  const tokens = p.app === "mune-tokens" ? p.tokens : p;
  const o = msg.options;
  try {
    if (o.variables) await importVariables(tokens);
    if (o.textStyles) await importTextStyles(tokens);
    if (o.effectStyles) await importEffectStyles(tokens);
    if (o.components) {
      if (p.app === "mune-tokens") await importComponents(p.components || [], p.icons || {}, !!o.replace);
      else note("Components need the app link (a tokens.json file has no components).");
    }
    figma.ui.postMessage({ type: "done", ok: true });
    figma.notify("MUNE Tokens imported");
  } catch (e) {
    note("Error: " + (e instanceof Error ? e.message : String(e)));
    figma.ui.postMessage({ type: "done", ok: false });
  }
};
