import "server-only";
import { findClaudeCli, runCliAgent } from "../ai/provider-cli";
import { getSettings } from "../settings";
import { recordUsage } from "../usage";
import type { TokenUsage } from "../ai/types";
import type { ComponentSpec } from "../components/schema";
import type { SystemRecord } from "../types";
import { buildScripts } from "./scripts";

/**
 * "Build in Figma": Claude Code (the user's subscription) drives Figma's MCP server to create the
 * file, add the pages and run the importer scripts. Only the Figma tools are allowed.
 *
 * Headless `claude -p` gets the claude.ai Figma connector; the Claude Code Figma plugin's server is
 * accepted too where it loads. Whichever answers whoami is used for the build.
 */

const PREFIXES = ["mcp__claude_ai_Figma", "mcp__plugin_figma_figma"];
const figmaTools = (...names: string[]) => [...names.flatMap((n) => PREFIXES.map((p) => `${p}__${n}`)), "WaitForMcpServers"];
/** "mcp__claude_ai_Figma__use_figma" → "use_figma". */
const toolName = (full: string) => full.slice(full.lastIndexOf("__") + 2);

export interface FigmaPlan {
  name: string;
  key: string;
  tier?: string;
}

export interface FigmaAccount {
  email: string;
  handle: string;
  plans: FigmaPlan[];
}

export interface FigmaStatus {
  cli: string | null;
  state: "connected" | "needs-auth" | "no-cli";
  detail: string;
  account: FigmaAccount | null;
  /** Tool-name prefix of the server that answered, e.g. "mcp__claude_ai_Figma". */
  prefix: string | null;
}

function track(model: string, usage: TokenUsage, started: number, ok: boolean, error: string | null, rec?: SystemRecord) {
  recordUsage({
    kind: "figma",
    provider: "cli",
    model,
    systemId: rec?.id ?? null,
    systemName: rec?.name ?? null,
    usage,
    durationMs: Date.now() - started,
    attempts: 1,
    status: ok ? "ok" : "error",
    error,
  });
}

let statusCache: { at: number; value: FigmaStatus } | null = null;
let statusRun: Promise<FigmaStatus> | null = null;

/**
 * Is Figma reachable from Claude Code, and as whom? One small whoami call (cached 10 minutes; `force`
 * re-checks). Returns the signed-in Figma account and the teams it can create files in.
 */
export async function figmaStatus(force = false): Promise<FigmaStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 10 * 60_000) return statusCache.value;
  statusRun ??= checkFigma().finally(() => (statusRun = null));
  const value = await statusRun;
  statusCache = { at: Date.now(), value };
  return value;
}

async function checkFigma(): Promise<FigmaStatus> {
  const settings = getSettings();
  const cli = await findClaudeCli(settings.cliPath);
  if (!cli) return { cli: null, state: "no-cli", detail: "Claude Code CLI not found.", account: null, prefix: null };

  let raw = "";
  let prefix: string | null = null;
  const ids = new Map<string, string>();
  const started = Date.now();
  const res = await runCliAgent(
    {
      system:
        "Call the Figma whoami tool exactly once (it is named mcp__claude_ai_Figma__whoami or mcp__plugin_figma_figma__whoami; use whichever exists, and wait for MCP servers first if Figma is still connecting). Then reply DONE. If no Figma tool exists, reply NOFIGMA.",
      user: "Check the Figma connection.",
      model: settings.model,
      effort: "low",
      allowedTools: figmaTools("whoami"),
      maxTurns: 4,
      onEvent: (e) => {
        if (e.type === "tool_use" && toolName(e.name) === "whoami") ids.set(e.id, e.name.slice(0, e.name.lastIndexOf("__")));
        if (e.type === "tool_result" && !e.isError && ids.has(e.id)) {
          raw = e.text;
          prefix = ids.get(e.id)!;
        }
      },
    },
    cli,
  );
  track(settings.model, res.usage, started, !!raw, raw ? null : res.result);

  let data: { whoami?: { email?: string; handle?: string; plans?: FigmaPlan[] } } = {};
  try {
    data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {}
  const who = data.whoami;
  if (!who) {
    return {
      cli,
      state: "needs-auth",
      detail: raw ? `Figma answered, but not as expected: ${raw.slice(0, 160)}` : "Figma isn't connected to your Claude account yet.",
      account: null,
      prefix: null,
    };
  }
  const plans = (who.plans ?? []).map((p) => ({ name: p.name, key: p.key, tier: p.tier }));
  return { cli, state: "connected", detail: "Figma connected", account: { email: who.email ?? "", handle: who.handle ?? "", plans }, prefix };
}

async function connected() {
  const s = await figmaStatus();
  if (s.state !== "connected" || !s.cli || !s.prefix) throw new Error(s.detail);
  return { cli: s.cli, prefix: s.prefix };
}

/** The Figma teams the user can create files in. */
export async function figmaPlans(force = false): Promise<FigmaPlan[]> {
  const s = await figmaStatus(force);
  if (s.state !== "connected" || !s.account) throw new Error(s.detail);
  if (!s.account.plans.length) throw new Error("Figma returned no teams for this account.");
  return s.account.plans;
}

export type BuildEvent =
  | { type: "plan"; steps: string[] }
  | { type: "step"; index: number; state: "running" | "ok" | "error"; note?: string }
  | { type: "file"; fileKey: string; fileUrl: string };

export interface BuildResult {
  fileKey: string;
  fileUrl: string;
  check: Record<string, unknown> | null;
  problems: string[];
  usage: TokenUsage;
}

const fileKeyFrom = (url: string) => url.match(/figma\.com\/(?:design|file)\/([0-9a-zA-Z]{10,})/)?.[1] ?? null;

/**
 * Creates (or updates) the project's Figma file. Scripts are generated here; Claude's only job is to
 * pass them to use_figma unchanged, in order. Progress is reported per step.
 */
export async function buildInFigma(
  rec: SystemRecord,
  specs: ComponentSpec[],
  opts: { planKey?: string; fileUrl?: string; signal?: AbortSignal; onEvent: (e: BuildEvent) => void },
): Promise<BuildResult> {
  const { cli, prefix } = await connected();
  const settings = getSettings();
  const plan = buildScripts(rec, specs);
  const existingKey = opts.fileUrl ? fileKeyFrom(opts.fileUrl) : null;
  if (!existingKey && !opts.planKey) throw new Error("Choose the Figma team to create the file in.");

  const setup = existingKey
    ? [`Call ${prefix}__create_session with fileKey="${existingKey}" and description="Update the ${rec.name} design system". Use this fileKey for every later step.`]
    : [
        `Call ${prefix}__create_new_file with fileName=${JSON.stringify(rec.name)}, planKey="${opts.planKey}", editorType="design".`,
        `Call ${prefix}__create_session with the fileKey from step 1 and description="Build the ${rec.name} design system".`,
      ];
  const steps = [...(existingKey ? ["Open file"] : ["Create file", "Open file"]), ...plan.scripts.map((s) => s.label)];
  opts.onEvent({ type: "plan", steps });

  const scriptSteps = plan.scripts
    .map(
      (s, i) =>
        `Step ${setup.length + i + 1}: call ${prefix}__use_figma with the fileKey, the sessionId, description=${JSON.stringify(s.label)} and code set to this exact script:\n<script>\n${s.code}\n</script>`,
    )
    .join("\n\n");
  const user = `${setup.map((s, i) => `Step ${i + 1}: ${s}`).join("\n")}\n\n${scriptSteps}`;
  const system = `You are an automation runner for Figma. You carry out a fixed list of steps with the Figma tools and nothing else.
- Do the steps in order, one tool call per step.
- For use_figma, the code argument is the text between <script> and </script>, copied exactly: every character unchanged. Never shorten, reformat, fix or explain a script.
- Always pass the fileKey and the sessionId from the earlier steps, and the given description.
- If a step returns an error, retry that step once unchanged; if it fails again, stop.
- Do not load skills, read resources, take screenshots or call any other tool.
- After the last step reply with the single word DONE, or FAILED: <reason>.`;

  let fileKey = existingKey ?? "";
  let fileUrl = opts.fileUrl ?? "";
  let check: Record<string, unknown> | null = null;
  const pending = new Map<string, number>();
  const setupNames = existingKey ? ["create_session"] : ["create_new_file", "create_session"];
  const started = Date.now();
  let failed: string | null = null;
  if (fileKey) opts.onEvent({ type: "file", fileKey, fileUrl });

  const res = await runCliAgent(
    {
      system,
      user,
      model: settings.model,
      effort: "low",
      allowedTools: figmaTools("create_new_file", "create_session", "use_figma"),
      maxTurns: steps.length * 2 + 4,
      signal: opts.signal,
      onEvent: (e) => {
        if (e.type === "tool_use") {
          const tool = toolName(e.name);
          let index = setupNames.indexOf(tool);
          if (tool === "use_figma") index = setupNames.length + plan.scripts.findIndex((s) => s.label === e.input.description);
          if (index < 0) return;
          pending.set(e.id, index);
          opts.onEvent({ type: "step", index, state: "running" });
        } else if (e.type === "tool_result") {
          const index = pending.get(e.id);
          if (index === undefined) return;
          if (e.isError) {
            failed = e.text.slice(0, 300);
            opts.onEvent({ type: "step", index, state: "error", note: failed });
            return;
          }
          failed = null;
          const json = e.text.slice(e.text.indexOf("{"), e.text.lastIndexOf("}") + 1);
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(json);
          } catch {}
          if (steps[index] === "Create file") {
            fileKey = String(data.file_key ?? data.fileKey ?? "");
            fileUrl = String(data.file_url ?? data.fileUrl ?? (fileKey ? `https://www.figma.com/design/${fileKey}` : ""));
            if (fileKey) opts.onEvent({ type: "file", fileKey, fileUrl });
          }
          if (steps[index] === "Check") check = data;
          const log = Array.isArray(data.log) ? (data.log as string[]).map((l) => l.replace(/^[\s·]+/, "")).filter(Boolean).join(" · ") : undefined;
          opts.onEvent({ type: "step", index, state: "ok", note: log });
        }
      },
    },
    cli,
  );
  // Assigned inside the event callback, which TypeScript can't follow.
  const final = check as Record<string, unknown> | null;
  const lastError = failed as string | null;
  const ok = !!fileKey && !!final && !lastError && !res.isError;
  track(settings.model, res.usage, started, ok, ok ? null : lastError ?? res.result, rec);
  if (!fileKey) throw new Error(`Couldn't create the Figma file. ${lastError ?? res.result}`);
  if (!final) throw new Error(`The build stopped before finishing${lastError ? `: ${lastError}` : res.result ? `: ${res.result}` : "."}`);

  // Compare what Figma reports with what the system holds.
  const problems: string[] = [];
  const cols = (final.collections ?? []) as { name: string; count: number; modes: string[] }[];
  const count = (n: string) => cols.find((c) => c.name === n)?.count ?? 0;
  if (count("Primitives") < plan.expected.primitives) problems.push(`Primitives: ${count("Primitives")} of ${plan.expected.primitives}`);
  if (count("Semantic") < plan.expected.semantic) problems.push(`Semantic colours: ${count("Semantic")} of ${plan.expected.semantic}`);
  if (Number(final.textStyles ?? 0) < plan.expected.textStyles) problems.push(`Text styles: ${final.textStyles} of ${plan.expected.textStyles} (missing fonts?)`);
  if (Number(final.effectStyles ?? 0) < plan.expected.effectStyles) problems.push(`Effect styles: ${final.effectStyles} of ${plan.expected.effectStyles}`);
  const made = ((final.components ?? []) as string[]).map((c) => c.split(":")[0]);
  for (const c of plan.expected.components) if (!made.includes(c)) problems.push(`Component missing: ${c}`);
  return { fileKey, fileUrl, check: final, problems, usage: res.usage };
}
