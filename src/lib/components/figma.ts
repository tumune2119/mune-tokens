import { toDtcg } from "../export/dtcg";
import { modesOf } from "../tokens/schema";
import type { SystemRecord } from "../types";
import { iconPath, resolveTree, type RNode } from "./render";
import { combos, variantName, type ComponentSpec } from "./schema";

export interface FigmaComponent {
  name: string;
  description: string;
  level: string;
  props: { name: string; values: string[] }[];
  states: string[];
  variants: { name: string; combo: Record<string, string>; tree: RNode }[];
}

export interface FigmaPayload {
  app: "mune-tokens";
  name: string;
  version: number;
  tokens: Record<string, unknown>;
  components: FigmaComponent[];
  /** SVG path data for each icon the components use (24px grid, stroked). */
  icons: Record<string, string>;
}

/**
 * Plugin payload. Component trees are resolved in the first mode; every value keeps its token
 * ref, so the plugin binds variables and Figma switches modes on its own.
 */
export function figmaPayload(rec: SystemRecord, specs: ComponentSpec[]): FigmaPayload {
  const mode = modesOf(rec.settings)[0];
  const icons: Record<string, string> = { circle: iconPath("circle") };
  for (const spec of specs) for (const p of spec.anatomy) if (p.kind === "icon" && p.icon) icons[p.icon] = iconPath(p.icon);
  return {
    app: "mune-tokens",
    name: rec.name,
    version: rec.version,
    tokens: toDtcg(rec.tokens, { name: rec.name, version: rec.version, settings: rec.settings }),
    components: specs.map((spec) => ({
      name: spec.name,
      description: spec.description,
      level: spec.level,
      props: spec.props,
      states: spec.states,
      variants: combos(spec).map((combo) => ({ name: variantName(combo), combo, tree: resolveTree(spec, rec.tokens, mode, combo) })),
    })),
    icons,
  };
}
