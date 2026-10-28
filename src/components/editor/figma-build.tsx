"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, ExternalLink, Loader2, RefreshCw, Sparkles, Square, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHead } from "./controls";
import { formatDuration, formatUsd } from "@/lib/format";
import { celebrate } from "@/lib/client/confetti";
import { cn } from "@/lib/utils";

interface Status {
  state: "connected" | "needs-auth" | "missing" | "no-cli";
  detail: string;
  server: string | null;
}
interface Plan {
  name: string;
  key: string;
  tier?: string;
}
type StepState = "waiting" | "running" | "ok" | "error";

/**
 * "Build in Figma": Claude Code (your subscription) creates the project's Figma file — Cover,
 * Design System and Components pages, variables, styles and components — using Figma's MCP server.
 */
export function FigmaBuild({ id, name, figmaUrl, dirty, onBuilt }: { id: string; name: string; figmaUrl: string; dirty: boolean; onBuilt: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planKey, setPlanKey] = useState("");
  const [planName, setPlanName] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [steps, setSteps] = useState<{ label: string; state: StepState; note?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<{ fileUrl: string; problems: string[]; costUsd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const check = async (force = false) => {
    setStatus(null);
    const s = await fetch(`/api/figma/status${force ? "?force=1" : ""}`).then((r) => r.json());
    setStatus(s);
  };

  useEffect(() => {
    let live = true;
    fetch("/api/figma/status")
      .then((r) => r.json())
      .then((s) => live && setStatus(s));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        if (!live) return;
        setPlanKey(s.settings.figmaPlanKey ?? "");
        setPlanName(s.settings.figmaPlanName ?? "");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function loadPlans() {
    setLoadingPlans(true);
    try {
      const res = await fetch("/api/figma/plans");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPlans(data.plans);
      if (!planKey && data.plans.length === 1) choose(data.plans[0]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingPlans(false);
    }
  }

  function choose(p: Plan) {
    setPlanKey(p.key);
    setPlanName(p.name);
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
              <Loader2 className="size-4 animate-spin" /> Checking the Figma connection…
            </span>
          ) : connected ? (
            <span className="flex items-center gap-2">
              <Check className="size-4" /> Figma connected
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
              <Terminal className="size-4" /> One-time Figma sign-in
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Open a terminal (PowerShell) and run <code className="rounded bg-black px-1.5 py-0.5 font-mono text-xs text-foreground">claude</code>
              </li>
              <li>
                Type <code className="rounded bg-black px-1.5 py-0.5 font-mono text-xs text-foreground">/mcp</code>, choose <span className="text-foreground">{status.server ?? "figma"}</span> and pick Authenticate.
              </li>
              <li>Sign in to Figma in the browser window that opens and allow access. Then close Claude Code and click Check again.</li>
            </ol>
          </div>
        )}

        {connected && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Team</span>
              {plans ? (
                <Select value={planKey} onValueChange={(k) => choose(plans.find((p) => p.key === k)!)}>
                  <SelectTrigger size="sm" className="h-8 w-64 rounded-lg" aria-label="Figma team">
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
                <>
                  <span className="text-sm">{planName || "not chosen"}</span>
                  <Button size="sm" variant="outline" onClick={loadPlans} disabled={loadingPlans || running}>
                    {loadingPlans ? <Loader2 className="animate-spin" /> : null} {planName ? "Change" : "Choose team"}
                  </Button>
                </>
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
