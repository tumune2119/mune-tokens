import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Clock, Coins, Cpu, Info, MessagesSquare } from "lucide-react";
import { getUsageReport, type UsageTotals } from "@/lib/usage";
import { DailyChart } from "@/components/usage/daily-chart";
import { formatDuration, formatTokens, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Claude usage" };

const RANGES = [7, 30, 90] as const;

const KIND_LABELS: Record<string, string> = {
  system: "New system generation",
  regenerate: "Regenerate group",
  test: "Connection tests",
};

export default async function UsagePage(props: PageProps<"/usage">) {
  const sp = await props.searchParams;
  const days = RANGES.find((r) => String(r) === sp.days) ?? 30;
  const report = getUsageReport(days);
  const t = report.totals;
  const inputAll = (u: UsageTotals) => u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  const usesCli = report.byModel.some((m) => m.provider === "cli");

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8 flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-3xl font-semibold tracking-tight">Claude usage</h1>
          <p className="mt-1 text-muted-foreground">Every request MUNE TOKENS sends to Claude, with tokens, cost and timing.</p>
        </div>
        <nav className="flex rounded-xl bg-card p-1 text-sm ring-1 ring-border" aria-label="Time range">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/usage?days=${r}`}
              className={cn(
                "rounded-lg px-3 py-1.5 font-medium transition-colors",
                r === days ? "bg-white text-black" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r} days
            </Link>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Coins className="size-5" />}
          label="Estimated cost"
          value={formatUsd(t.costUsd)}
          hint={`${formatUsd(report.allTime.costUsd)} all time`}
        />
        <Stat
          icon={<Cpu className="size-5" />}
          label="Tokens"
          value={formatTokens(inputAll(t) + t.outputTokens)}
          hint={`${formatTokens(inputAll(t))} in · ${formatTokens(t.outputTokens)} out`}
        />
        <Stat
          icon={<MessagesSquare className="size-5" />}
          label="Requests"
          value={String(t.calls)}
          hint={t.failed ? `${t.failed} failed` : "no failures"}
        />
        <Stat
          icon={<Clock className="size-5" />}
          label="Avg. time per request"
          value={t.calls ? formatDuration(t.durationMs / t.calls) : "—"}
          hint={`${formatDuration(t.durationMs)} total`}
        />
      </section>

      {usesCli && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground ring-1 ring-border">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
          <span>
            Requests through the <span className="text-foreground">Claude Code CLI</span> run on your Claude subscription. Their cost
            is the API-equivalent figure Claude Code reports, not money charged per request. API-key requests are priced from
            Anthropic&apos;s list prices.
          </span>
        </p>
      )}

      <div className="mt-6">
        <DailyChart daily={report.daily} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Breakdown
          title="By feature"
          rows={report.byKind.map((r) => ({ key: r.kind, label: KIND_LABELS[r.kind] ?? r.kind, ...r }))}
        />
        <Breakdown
          title="By model"
          rows={report.byModel.map((r) => ({
            key: `${r.model}-${r.provider}`,
            label: (
              <span>
                <span className="font-mono text-[0.8rem]">{r.model}</span>{" "}
                <span className="text-xs text-muted-foreground">{r.provider === "cli" ? "CLI" : "API"}</span>
              </span>
            ),
            ...r,
          }))}
        />
      </div>

      <div className="mt-6">
        <Breakdown
          title="By system"
          rows={report.bySystem.map((r) => ({
            key: r.systemId ?? "none",
            label: r.systemId ? (
              <Link href={`/systems/${r.systemId}`} className="hover:text-white hover:underline">
                {r.systemName ?? "Untitled"}
              </Link>
            ) : (
              <span className="text-muted-foreground">Not linked to a system (unsaved drafts, tests)</span>
            ),
            ...r,
          }))}
        />
      </div>

      <section className="surface mt-6 overflow-hidden rounded-2xl">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Recent requests</h2>
        {report.recent.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted-foreground">
            No requests yet. Usage is recorded from now on, whenever you generate a system, regenerate a group
            or test the connection.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-t border-border">
                  <th className="px-5 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Feature</th>
                  <th className="px-3 py-2 text-left font-medium">System</th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Input</th>
                  <th className="px-3 py-2 text-right font-medium">Cache read</th>
                  <th className="px-3 py-2 text-right font-medium">Output</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                  <th className="px-5 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.recent.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-5 py-2 whitespace-nowrap text-muted-foreground" suppressHydrationWarning>
                      {new Date(r.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{KIND_LABELS[r.kind] ?? r.kind}</td>
                    <td className="max-w-56 truncate px-3 py-2">
                      {r.systemId ? (
                        <Link href={`/systems/${r.systemId}`} className="hover:text-white hover:underline">
                          {r.systemName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-[0.78rem]">{r.model}</span>{" "}
                      <span className="text-xs text-muted-foreground">{r.provider === "cli" ? "CLI" : "API"}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{(r.inputTokens + r.cacheWriteTokens).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{r.cacheReadTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{r.outputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{formatUsd(r.costUsd)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {formatDuration(r.durationMs)}
                      {r.attempts > 1 && <span title="Retried once after an invalid response"> ×{r.attempts}</span>}
                    </td>
                    <td className="px-5 py-2">
                      {r.status === "ok" ? (
                        <span className="text-muted-foreground">OK</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 text-black" title={r.error ?? ""}>
                          <AlertTriangle className="size-3.5" /> Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-surface-2 text-foreground ring-1 ring-border">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: ({ key: string; label: React.ReactNode } & UsageTotals)[];
}) {
  const maxCost = Math.max(...rows.map((r) => r.costUsd), 0);
  return (
    <section className="surface overflow-hidden rounded-2xl">
      <h2 className="px-5 pt-5 pb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing in this range.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-t border-border">
              <th className="px-5 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-right font-medium">Requests</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Tokens in / out</th>
              <th className="w-40 px-5 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-5 py-2.5">{r.label}</td>
                <td className="px-3 py-2.5 text-right">{r.calls}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {formatTokens(r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens)} / {formatTokens(r.outputTokens)}
                </td>
                <td className="px-5 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    {/* Inline magnitude bar: same single white as the chart */}
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                      <span
                        className="block h-full rounded-full bg-white"
                        style={{ width: `${maxCost ? (r.costUsd / maxCost) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-14 text-right">{formatUsd(r.costUsd)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
