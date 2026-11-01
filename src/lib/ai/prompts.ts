import { GROUP_LABELS, STEP_SETS, type GroupKey, type Scope, type SystemSettings, type TokenSet } from "../tokens/schema";
import type { BriefFile } from "../types";
import { directionBlock } from "../styles";

const SHAPES: Record<string, string> = {
  ramps: `"ramps": [{ "name": "brand", "base": "#0d9488" }]
  // 3–7 ramps: always "neutral" plus "brand"; add "accent" and status ramps ("success", "warning", "danger", "info") when useful.
  // Only give the base colour (what the brand colour looks like at roughly step 500–600). The app builds the steps in OKLCH.`,
  semantic: `"semantic": [{ "path": "color/bg/default", "light": "color/neutral/50", "dark": "color/neutral/950", "on": null, "description": "Page background" }]
  // 15–40 tokens. Paths start with "color/" and use groups like bg, text, border, action, status, focus.
  // Never reuse a ramp name as the group (no "color/brand/..."); use "color/action/primary/default".
  // light/dark reference a primitive "color/<ramp>/<step>" (or rarely a hex like "#ffffff").
  // "on": for foreground colours (text, icons, borders), the semantic background they sit on, e.g. "color/bg/default". Otherwise null.
  // Must include color/bg/default, color/bg/surface, color/text/default, color/text/muted, color/border/default,
  // color/action/primary/default, color/action/primary/hover, color/text/on-action (on color/action/primary/default), color/focus/ring.`,
  typography: `"fonts": [{ "key": "sans", "family": "Inter", "fallback": "ui-sans-serif, system-ui, sans-serif" }]
  // 1–3 families, each on Google Fonts. Keys: "sans", "serif", "display", "mono".
  "typeScale": [{ "name": "body/md", "font": "sans", "size": 16, "lineHeight": 24, "weight": 400, "letterSpacing": 0 }]
  // 9–16 styles: display/*, heading/*, body/*, label/*, caption, code/*. size and lineHeight in px (lineHeight on a 4px grid), letterSpacing in em (-0.02 = -2%).`,
  spacing: `"spacing": [{ "name": "4", "value": 16 }]   // 10–14 steps in px on a 4px base; names are multipliers ("0","1","2","3","4","6","8"...)`,
  radius: `"radius": [{ "name": "md", "value": 8 }]   // none, sm, md, lg, xl, full (9999)`,
  shadows: `"shadows": [{ "name": "md", "layers": [{ "x": 0, "y": 4, "blur": 8, "spread": -2, "color": "#0000001a" }] }]   // sm, md, lg, xl; colour as 8-digit hex with alpha`,
  breakpoints: `"breakpoints": [{ "name": "md", "value": 768 }]   // min widths in px`,
  motion: `"motion": { "durations": [{ "name": "fast", "value": 120 }], "easings": [{ "name": "standard", "value": [0.2, 0, 0, 1] }] }
  // 4–6 durations in ms (instant, fast, base, slow…) and 3–5 cubic-bezier easings (standard, decelerate, accelerate, emphasized). Match the brand's mood: calm brands move slower and softer.`,
};

const SCOPE_GROUPS: Record<Scope, string[]> = {
  colors: ["ramps", "semantic"],
  typography: ["typography"],
  spacing: ["spacing"],
  radius: ["radius"],
  shadows: ["shadows"],
  breakpoints: ["breakpoints"],
  motion: ["motion"],
};

const RULES = `Rules:
- Reply with ONLY one JSON object. No prose, no markdown fences, no comments.
- Lower-case names; letters, digits and dashes; "/" separates path segments.
- Text colours must meet the contrast target on the background named in "on" in every mode.
- Dark-mode values are designed, not inverted: dark surfaces around step 900–950, text around 50–200, brand slightly lighter (400–500).
- Keep it practical for a real product team. When a visual style is given, commit to it fully (its palette, fonts, radii and shadows) within these rules.`;

export function systemPromptFor(groups: string[]): string {
  return `You are a senior design-systems designer. You produce design tokens as JSON for a design-system tool.

Output shape (include only these keys, in this order):
{
  "name": "Short system name (2–4 words)",
  "summary": "One sentence on the visual direction",
  ${groups.map((g) => SHAPES[g]).join(",\n  ")}
}

${RULES}`;
}

export function generationGroups(scope: Scope[]) {
  return scope.flatMap((s) => SCOPE_GROUPS[s]);
}

function settingsLines(settings: SystemSettings) {
  const steps = STEP_SETS[settings.steps].join(", ");
  return [
    `Ramp steps: ${steps}.`,
    `Modes: ${settings.modes === "both" ? "light and dark (fill both)" : `${settings.modes} only (put the same value in light and dark)`}.`,
    `Contrast target: WCAG ${settings.contrast} (${settings.contrast === "AAA" ? "7:1" : "4.5:1"} for body text, 3:1 for UI and borders).`,
  ];
}

function filesBlock(files: BriefFile[]) {
  if (!files.length) return "";
  return `\n\nAttached files:\n${files.map((f) => `\n--- ${f.name} ---\n${f.text}`).join("\n")}`;
}

export function generationUserMessage(brief: string, settings: SystemSettings, files: BriefFile[]) {
  return `Create a design system for this brief:

${brief.trim()}

${settingsLines(settings).join("\n")}${directionBlock(settings, "tokens")}${filesBlock(files)}`;
}

/** Compact view of the current tokens so the model can stay consistent. */
function contextOf(set: TokenSet, group: GroupKey) {
  const ctx: Record<string, unknown> = {
    ramps: set.ramps.map((r) => ({ name: r.name, base: r.base })),
  };
  if (group !== "ramps") ctx.semantic = set.semantic.map((s) => ({ path: s.path, light: s.light, dark: s.dark, on: s.on ?? null }));
  if (group === "typography") {
    ctx.fonts = set.fonts;
    ctx.typeScale = set.typeScale;
  } else if (group === "motion") {
    ctx.motion = set.motion;
  } else if (group !== "ramps" && group !== "semantic") {
    ctx[group] = set[group];
  }
  return JSON.stringify(ctx);
}

export function regenerateSystemPrompt(group: GroupKey) {
  const shape = SHAPES[group];
  return `You are a senior design-systems designer revising one group of an existing token set.

Return ONLY a JSON object with this shape:
{
  ${shape}
}

${RULES}
- Return the complete group (every token, changed or not), not a diff.`;
}

export function regenerateUserMessage(opts: { group: GroupKey; set: TokenSet; settings: SystemSettings; brief: string; guidance: string }) {
  const { group, set, settings } = opts;
  const keep =
    group === "ramps"
      ? `\nKeep the existing ramp names (${set.ramps.map((r) => r.name).join(", ")}) so semantic colours keep working; you may add ramps.`
      : group === "semantic"
        ? `\nUse only these ramps: ${set.ramps.map((r) => r.name).join(", ")}.`
        : "";
  return `Regenerate the "${GROUP_LABELS[group]}" group.

Brief: ${opts.brief.trim() || "(none)"}
Guidance: ${opts.guidance.trim() || "Improve it while keeping the same direction."}
${settingsLines(settings).join("\n")}${keep}${directionBlock(settings, "tokens")}

Current tokens:
${contextOf(set, group)}`;
}
