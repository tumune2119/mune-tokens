import type { TokenSet } from "../tokens/schema";
import type { BriefFile } from "../types";
import { MAX_CELLS, type ComponentSpec } from "./schema";

/** The tokens a component may use, compact enough to send with every spec request. */
export function tokenSummary(set: TokenSet) {
  return [
    `Semantic colours: ${set.semantic.map((s) => `${s.path}${s.description ? ` (${s.description})` : ""}`).join("; ")}`,
    `Spacing: ${set.spacing.map((d) => `space/${d.name}=${d.value}px`).join(", ")}`,
    `Radius: ${set.radius.map((d) => `radius/${d.name}=${d.value}px`).join(", ")}`,
    `Text styles: ${set.typeScale.map((t) => `${t.name} (${t.size}/${t.lineHeight} ${t.weight})`).join(", ")}`,
    `Shadows: ${set.shadows.map((s) => `shadow/${s.name}`).join(", ") || "none"}`,
  ].join("\n");
}

function files(list: BriefFile[]) {
  return list.length ? `\n\nAttached files:\n${list.map((f) => `\n--- ${f.name} ---\n${f.text}`).join("\n")}` : "";
}

export function inventorySystemPrompt() {
  return `You are a senior design-systems designer. From a product idea, list the UI components the product needs.

Reply with ONLY one JSON object, no prose or fences:
{
  "items": [
    { "name": "Button", "level": "primitive", "reason": "Every form and dialog has actions", "usedIn": ["Sign-up", "Checkout"], "variants": ["primary", "secondary", "ghost", "sm", "md", "lg"], "states": ["default", "hover", "pressed", "focus", "disabled"] }
  ]
}

Rules:
- level is one of: foundation (focus ring, elevation, icon grid), primitive (button, input, select, checkbox, switch, badge, avatar, tooltip), composite (form field, search bar, card, tabs, modal, toast, data table, empty state), product (domain-specific, e.g. "Transaction row" for fintech).
- 12–28 items. Include the primitives every product needs, then composites and 3–8 product-specific components.
- "reason" names the screen or flow that needs it. Keep each field short.
- Order: foundations, primitives, composites, product.`;
}

export function inventoryUserMessage(idea: string, brief: string, set: TokenSet, attached: BriefFile[]) {
  return `Product idea:
${idea.trim()}

Design system brief: ${brief.trim() || "(none)"}
Available tokens (for context):
${tokenSummary(set)}${files(attached)}`;
}

const SPEC_SHAPE = `{
  "name": "Button",
  "level": "primitive",
  "description": "One line on what it is",
  "reason": "Why the product needs it",
  "usedIn": ["Checkout"],
  "anatomy": [
    { "name": "root", "kind": "container", "parent": null, "direction": "row" },
    { "name": "leading-icon", "kind": "icon", "parent": "root", "icon": "plus" },
    { "name": "label", "kind": "text", "parent": "root", "text": "Button" }
  ],
  "props": [ { "name": "variant", "values": ["primary", "secondary", "ghost"] }, { "name": "size", "values": ["sm", "md"] } ],
  "states": ["default", "hover", "pressed", "focus", "disabled"],
  "styles": [
    { "part": "root", "set": { "radius": "radius/md", "gap": "space/2", "font": "label/md" } },
    { "part": "root", "when": { "size": "md" }, "set": { "height": 40, "paddingX": "space/4" } },
    { "part": "root", "when": { "variant": "primary" }, "set": { "background": "color/action/primary/default", "color": "color/text/on-action" } },
    { "part": "root", "when": { "variant": "primary", "state": "hover" }, "set": { "background": "color/action/primary/hover" } },
    { "part": "root", "when": { "state": "focus" }, "set": { "borderColor": "color/focus/ring", "borderWidth": 2 } },
    { "part": "root", "when": { "state": "disabled" }, "set": { "opacity": 0.5 } }
  ],
  "a11y": { "role": "button", "keyboard": "Enter and Space activate", "minTarget": 44, "notes": ["Visible focus ring"] },
  "content": ["Labels are verbs, 1–3 words", "Truncate after 24 characters"]
}`;

export function specSystemPrompt() {
  return `You are a senior design-systems designer writing a component spec that an app renders and imports into Figma.

Reply with ONLY one JSON object in this shape (example values):
${SPEC_SHAPE}

Rules:
- anatomy: exactly one root (parent null, kind "container"). kinds: container, text, icon, input, divider, spacer. Only containers have children. Icons use Lucide names (plus, check, x, chevron-down, chevron-right, search, info, triangle-alert, user, settings, calendar, arrow-right, circle).
- props: 0–3 variant properties with 1–5 values each. "state" is NOT a prop; list states in "states".
- (product of prop values) × states must be ≤ ${MAX_CELLS}.
- styles: rules apply from least to most specific "when". Style keys: background, color, borderColor (colour tokens: semantic paths like color/text/default, or "transparent"); paddingX, paddingY, gap, radius (space/* or radius/* tokens, or a number of px); height, minWidth, width, borderWidth, iconSize (number of px or a space/* token; width may be "fill"); font (a text style name like label/md); shadow (shadow/*); opacity (0–1).
- Use ONLY the tokens listed in the request. Prefer semantic colours; never invent token names or hex values.
- Every variant × state must look distinct where it should (hover, pressed, focus, disabled, error).
- Accessibility: min target 44px for touch targets, a focus style, contrast-safe colour pairs.`;
}

export function specUserMessage(opts: {
  name: string;
  level: string;
  reason: string;
  plan: { usedIn?: string[]; variants?: string[]; states?: string[] };
  idea: string;
  set: TokenSet;
  /** Optional guidance from the designer; it takes priority over the suggestions above it. */
  notes?: string;
}) {
  return `Write the spec for "${opts.name}" (${opts.level}).
Why it's needed: ${opts.reason || "(not given)"}
Used in: ${opts.plan.usedIn?.join(", ") || "(not given)"}
Suggested variants: ${opts.plan.variants?.join(", ") || "(your call)"}
Suggested states: ${opts.plan.states?.join(", ") || "default, hover, focus, disabled"}

Product idea: ${opts.idea.trim() || "(none)"}
${opts.notes?.trim() ? `
Designer's notes (follow these; they override the suggestions above):
${opts.notes.trim()}
` : ""}
Tokens you may use:
${tokenSummary(opts.set)}`;
}

export function reviseUserMessage(spec: ComponentSpec, instruction: string, set: TokenSet) {
  return `Revise this component spec: ${instruction.trim()}
Return the complete revised spec.

Current spec:
${JSON.stringify(spec)}

Tokens you may use:
${tokenSummary(set)}`;
}
