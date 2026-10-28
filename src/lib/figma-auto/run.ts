import "server-only";
import { findClaudeCli, runCliAgent, runCliCommand } from "../ai/provider-cli";
import { getSettings } from "../settings";
import { recordUsage } from "../usage";
import type { TokenUsage } from "../ai/types";
import type { ComponentSpec } from "../components/schema";
import type { SystemRecord } from "../types";
import { buildScripts } from "./scripts";

/**
 * "Build in Figma": Claude Code (the user's subscription) drives the official Figma MCP server to
 * create the file, add the pages and run the importer scripts. Only the Figma tools are allowed.
 */

export interface FigmaStatus {
  cli: string | null;
  /** MCP server name as Claude Code lists it, e.g. "plugin:figma:figma". */
  server: string | null;
  state: "connected" | "needs-auth" | "missing" | "no-cli";
  detail: string;
}

/** Tool-name prefix for an MCP server ("plugin:figma:figma" → "mcp__plugin_figma_figma"). */
const toolPrefix = (server: string) => `mcp__${server.replace(/[^A-Za-z0-9_-]/g, "_")}`;

let statusCache: { at: number; value: FigmaStatus } | null = null;

export async function figmaStatus(force = false): Promise<FigmaStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 60_000) return statusCache.value;
  const cli = await findClaudeCli(getSettings().cliPath);
  let value: FigmaStatus;
  if (!cli) {
    value = { cli: null, server: null, state: "no-cli", detail: "Claude Code CLI not found." };
  } else {
    const out = await runCliCommand(cli, ["mcp", "list"]);
    const lines = out.split(/\r?\n/).filter((l) => /mcp\.figma\.com|figma/i.test(l) && /:\s*https?:\/\//.test(l));
    const parsed = lines.map((l) => ({ name: l.slice(0, l.search(/:\s*https?:\/\//)).trim(), ok: /connected/i.test(l) && !/needs/i.test(l) }));
    const best = parsed.find((p) => p.ok) ?? parsed[0];
    value = best
      ? { cli, server: best.name, state: best.ok ? "connected" : "needs-auth", detail: best.ok ? `Figma connected (${best.name}).` : `Figma server “${best.name}” needs a one-time sign-in.` }
      : { cli, server: null, state: "missing", detail: "No Figma MCP server in Claude Code. Install the Figma plugin for Claude Code, or add Figma's MCP server." };
  }
  statusCache = { at: Date.now(), value };
  return value;
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

async function connected() {
  const s = await figmaStatus();
  if (s.state !== "connected" || !s.cli || !s.server) throw new Error(s.detail);
  return { cli: s.cli, prefix: toolPrefix(s.server) };
}

export interface FigmaPlan {
  name: string;
  key: string;
  tier?: string;
}

/** The Figma teams/organisations the user can create files in (one whoami call). */
export async function figmaPlans(signal?: AbortSignal): Promise<FigmaPlan[]> {
  const { cli, prefix } = await connected();
  const settings = getSettings();
  let raw = "";
  const started = Date.now();
  const res = await runCliAgent(
    {
      system: "Call the whoami tool exactly once, then reply with the single word DONE.",
      user: `Call ${prefix}__whoami.`,
      model: settings.model,
      effort: "low",
      allowedTools: [`${prefix}__whoami`],
      maxTurns: 3,
      signal,
      onEvent: (e) => {
        if (e.type === "tool_result" && !e.isError) raw = e.text;
      },
    },
    cli,
  );
  track(settings.model, res.usage, started, !!raw, raw ? null : res.result);
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const data = JSON.parse(json || "{}") as { whoami?: { plans?: { name: string; key: string; tier?: string }[] }; plans?: FigmaPlan[] };
  const plans = data.whoami?.plans ?? data.plans ?? [];
  if (!plans.length) throw new Error("Figma returned no teams for this account.");
  return plans.map((p) => ({ name: p.name, key: p.key, tier: p.tier }));
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
      allowedTools: [`${prefix}__create_new_file`, `${prefix}__create_session`, `${prefix}__use_figma`],
      maxTurns: steps.length * 2 + 4,
      signal: opts.signal,
      onEvent: (e) => {
        if (e.type === "tool_use") {
          const tool = e.name.slice(prefix.length + 2);
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
          const log = Array.isArray(data.log) ? (data.log as string[]).join(" · ") : undefined;
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
