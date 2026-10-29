"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, ExternalLink, Loader2, Plug, RefreshCw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHead } from "./controls";
import { formatDuration, formatUsd } from "@/lib/format";
import { celebrate } from "@/lib/client/confetti";
import { cn } from "@/lib/utils";

interface Plan {
  name: string;
  key: string;
  tier?: string;
}
interface Status {
  state: "connected" | "needs-auth" | "no-cli";
  detail: string;
  account: { email: string; handle: string; plans: Plan[] } | null;
}
type StepState = "waiting" | "running" | "ok" | "error";

/** Default team: the user's own (named after them), else a paid one, else the first. */
function defaultPlan(account: NonNullable<Status["account"]>) {
  const { plans, handle } = account;
  return plans.find((p) => p.name === handle) ?? plans.find((p) => p.tier && p.tier !== "starter") ?? plans[0];
}

/**
 * "Build in Figma": Claude Code (your subscription) creates the project's Figma file — Cover,
 * Design System and Components pages, variables, styles and components — using Figma's MCP server.
 */
export function FigmaBuild({ id, name, figmaUrl, dirty, onBuilt }: { id: string; name: string; figmaUrl: string; dirty: boolean; onBuilt: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [planKey, setPlanKey] = useState("");
  const [steps, setSteps] = useState<{ label: string; state: StepState; note?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<{ fileUrl: string; problems: string[]; costUsd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const plans = status?.account?.plans ?? [];

  const check = async (force = false) => {
    setStatus(null);
    const [s, saved] = await Promise.all([
      fetch(`/api/figma/status${force ? "?force=1" : ""}`).then((r) => r.json() as Promise<Status>),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setStatus(s);
    const key: string = saved.settings.figmaPlanKey ?? "";
    if (s.account && !s.account.plans.some((p) => p.key === key)) {
      const p = defaultPlan(s.account);
      if (p) choose(p);
    } else setPlanKey(key);
  };

  useEffect(() => {
    // Runs once on mount; check() only sets state after its fetches resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  function choose(p: Plan) {
    setPlanKey(p.key);
    fetch("/api/figma/plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: p.key, name: p.name }) });
  }

  async function build(mode: "new" | "update") {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setError(null);
    setResult(null);
    setSteps([]);
    setStarted(Date.now());
    setNow(Date.now());
    try {
      const res = await fetch(`/api/systems/${id}/figma/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, planKey: mode === "new" ? planKey : undefined }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "plan") setSteps(ev.steps.map((label: string) => ({ label, state: "waiting" as StepState })));
          else if (ev.type === "step") setSteps((s) => s.map((x, i) => (i === ev.index ? { ...x, state: ev.state, note: ev.note } : x)));
          else if (ev.type === "done") {
            setResult({ fileUrl: ev.fileUrl, problems: ev.problems ?? [], costUsd: ev.usage?.costUsd ?? 0 });
            if (!ev.problems?.length) celebrate();
            onBuilt();
          } else if (ev.type === "error") setError(ev.message);
        }
      }
    } catch (err) {
      setError(ctrl.signal.aborted ? "Cancelled." : (err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const connected = status?.state === "connected";
  const account = status?.account;
  return (
    <section>
      <SectionHead
        title="Build in Figma"
        description={`Claude creates the Figma file “${name}” with Cover, Design System and Components pages, and fills it with your variables, styles and Ready components. Runs on your Claude subscription; no Figma AI credits.`}
      />
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {!status ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking the Figma connection… (a few seconds)
            </span>
          ) : connected && account ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Check className="size-4" /> Figma connected as <span className="font-medium">{account.handle}</span>
              {account.email && <span className="font-mono text-xs text-muted-foreground">{account.email}</span>}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CircleAlert className="size-4" /> {status.detail}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => check(true)} disabled={!status || running}>
            <RefreshCw /> Check again
          </Button>
        </div>

        {status?.state === "needs-auth" && (
          <div className="rounded-xl bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Plug className="size-4" /> One-time Figma connection
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Open{" "}
                <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
                  claude.ai → Settings → Connectors
                </a>{" "}
                (signed in with the same Claude account as Claude Code).
              </li>
              <li>Find <span className="text-foreground">Figma</span>, click Connect, sign in to Figma and allow access.</li>
              <li>Come back and click Check again.</li>
            </ol>
          </div>
        )}

        {connected && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Create files in</span>
              {plans.length ? (
                <Select value={planKey} onValueChange={(k) => choose(plans.find((p) => p.key === k)!)} disabled={running}>
                  <SelectTrigger size="sm" className="h-8 w-72 rounded-lg" aria-label="Figma team">
                    <SelectValue placeholder="Choose a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.name}
                        {p.tier ? ` · ${p.tier}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm">Figma returned no teams for this account.</span>
              )}
            </div>

            {dirty && <p className="text-xs text-muted-foreground">Save first — the Figma file is built from the saved version.</p>}
            <div className="flex flex-wrap gap-2">
              {running ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Square className="fill-current" /> Stop
                </Button>
              ) : figmaUrl ? (
                <>
                  <Button onClick={() => build("update")} disabled={dirty}>
                    <Sparkles /> Update Figma file
                  </Button>
                  <Button variant="outline" onClick={() => build("new")} disabled={dirty || !planKey}>
                    Create a new file
                  </Button>
                </>
              ) : (
                <Button onClick={() => build("new")} disabled={dirty || !planKey}>
                  <Sparkles /> Create Figma file
                </Button>
              )}
              {figmaUrl && !running && (
                <Button asChild variant="ghost">
                  <a href={figmaUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> Open in Figma
                  </a>
                </Button>
              )}
            </div>
            <p className="text-xs text-subtle-foreground">Takes a few minutes: Claude passes each prepared script to Figma in turn. Re-run Update after changes; variables and styles update in place.</p>
          </>
        )}

        {steps.length > 0 && (
          <ol className="space-y-1 rounded-xl bg-surface-2 p-3" aria-live="polite">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {s.state === "running" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : s.state === "ok" ? (
                    <Check className="size-4" />
                  ) : s.state === "error" ? (
                    <CircleAlert className="size-4" />
                  ) : (
                    <span className="block size-4 rounded-full border border-border-strong" />
                  )}
                </span>
                <span className={cn("min-w-0", s.state === "waiting" && "text-subtle-foreground")}>
                  {s.label}
                  {s.note && <span className="block truncate font-mono text-[0.68rem] text-muted-foreground">{s.note}</span>}
                </span>
              </li>
            ))}
            {running && <li className="pt-1 font-mono text-xs text-subtle-foreground">{formatDuration(now - started)}</li>}
          </ol>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-sm text-black">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        {result && (
          <div className="space-y-2 rounded-xl border border-border-strong p-3 text-sm">
            <p className="flex flex-wrap items-center gap-3">
              <Check className="size-4" /> {result.problems.length ? "Built, with a few gaps" : "Figma file ready"}
              <a href={result.fileUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                Open in Figma
              </a>
              <span className="font-mono text-xs text-subtle-foreground">{formatUsd(result.costUsd)} (API-equivalent)</span>
            </p>
            {result.problems.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {result.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
