import "server-only";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import { estimateCostUsd } from "./pricing";
import { ZERO_USAGE, contentBlocks, type CompletionRequest, type CompletionResult, type TokenUsage } from "./types";

let cached: { at: number; key: string; path: string | null } | null = null;

function whereClaude(): Promise<string[]> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    execFile(cmd, ["claude"], { timeout: 4000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    });
  });
}

function versionKey(dir: string) {
  const m = dir.match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? Number(m[1]) * 1e8 + Number(m[2]) * 1e4 + Number(m[3]) : 0;
}

/** The Claude Code VS Code / Cursor extensions ship a standalone claude.exe. */
function extensionBinaries(): string[] {
  const home = os.homedir();
  const roots = [".vscode", ".vscode-insiders", ".cursor", ".windsurf"].map((r) => path.join(home, r, "extensions"));
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const found: { p: string; v: number }[] = [];
  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(/*turbopackIgnore: true*/ root);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.startsWith("anthropic.claude-code")) continue;
      const p = path.join(root, e, "resources", "native-binary", exe);
      if (fs.existsSync(p)) found.push({ p, v: versionKey(e) });
    }
  }
  return found.sort((a, b) => b.v - a.v).map((f) => f.p);
}

/** Finds the Claude Code CLI: explicit setting → PATH → standard install dirs → editor extension. */
export async function findClaudeCli(override?: string): Promise<string | null> {
  const key = override ?? "";
  if (cached && cached.key === key && Date.now() - cached.at < 60_000) return cached.path;

  const candidates: string[] = [];
  if (override?.trim()) candidates.push(override.trim().replace(/^"|"$/g, ""));
  const onPath = await whereClaude();
  // Prefer real executables over npm .cmd shims.
  candidates.push(...onPath.filter((p) => p.toLowerCase().endsWith(".exe")), ...onPath);
  const home = os.homedir();
  candidates.push(
    path.join(home, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
    path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "npm", "claude.cmd"),
    ...extensionBinaries(),
  );

  const hit = candidates.find((c) => {
    try {
      return fs.statSync(c).isFile();
    } catch {
      return false;
    }
  });
  cached = { at: Date.now(), key, path: hit ?? null };
  return cached.path;
}

function quoteForCmd(arg: string) {
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Runs `claude -p` headlessly. The prompt goes in over stdin and the system prompt via a temp file,
 * so large attachments never hit the Windows command-line length limit.
 */
export async function completeWithCli(req: CompletionRequest, cliPath: string): Promise<CompletionResult> {
  const sysFile = path.join(os.tmpdir(), `mune-tokens-system-${nanoid(8)}.txt`);
  fs.writeFileSync(sysFile, req.system, "utf8");

  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model",
    req.model,
    "--effort",
    req.effort,
    "--system-prompt-file",
    sysFile,
    // A plain text generation: no tools, MCP servers, settings or saved session.
    "--tools",
    "",
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--no-session-persistence",
    // Images/PDFs travel as content blocks: one stream-json user message instead of plain text.
    ...(req.media?.length ? ["--input-format", "stream-json"] : []),
  ];

  const isShim = /\.(cmd|bat)$/i.test(cliPath);
  const child = isShim
    ? spawn(`${quoteForCmd(cliPath)} ${args.map(quoteForCmd).join(" ")}`, {
        shell: true,
        cwd: os.tmpdir(),
        windowsHide: true,
      })
    : spawn(cliPath, args, { cwd: os.tmpdir(), windowsHide: true });

  const onAbort = () => child.kill();
  req.signal?.addEventListener("abort", onAbort, { once: true });

  let streamed = "";
  let resultText: string | null = null;
  let resultError: string | null = null;
  let usage: TokenUsage = ZERO_USAGE;
  let stderr = "";
  let buf = "";

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "stream_event") {
      const ev = msg.event as { type?: string; delta?: { type?: string; text?: string } };
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
        streamed += ev.delta.text;
        req.onText?.(ev.delta.text);
      }
    } else if (msg.type === "result") {
      usage = readResultUsage(msg, req.model);
      if (msg.is_error) {
        resultError = String(msg.result ?? msg.subtype ?? "Claude Code reported an error.");
      } else if (typeof msg.result === "string") {
        resultText = msg.result;
      }
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      handleLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c: string) => {
    stderr += c;
  });

  child.stdin.on("error", () => {}); // process may exit before reading everything
  const input = req.media?.length
    ? JSON.stringify({ type: "user", message: { role: "user", content: contentBlocks(req.user, req.media) } }) + "\n"
    : req.user;
  child.stdin.end(input, "utf8");

  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  }).finally(() => {
    req.signal?.removeEventListener("abort", onAbort);
    fs.rm(sysFile, { force: true }, () => {});
  });
  handleLine(buf);

  if (req.signal?.aborted) throw new Error("Cancelled.");
  if (resultError) throw new Error(`Claude Code: ${resultError}`);
  if (code !== 0 && !resultText) {
    const detail = stderr.trim().split(/\r?\n/).slice(-3).join(" ");
    throw new Error(`Claude Code exited with code ${code}${detail ? `: ${detail}` : ""}`);
  }
  return { text: resultText ?? streamed, usage };
}

/** Token counts and cost from the CLI's final "result" line. */
function readResultUsage(msg: Record<string, unknown>, model: string): TokenUsage {
  const u = (msg.usage ?? {}) as Record<string, number | undefined>;
  const tokens = {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  const reported = typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : null;
  return { ...tokens, costUsd: reported ?? estimateCostUsd(model, tokens) ?? 0 };
}
