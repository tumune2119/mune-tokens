import { dashboardStats, listSystemSummaries } from "@/lib/systems";
import { SystemBrowser } from "@/components/system-browser";

export default function DashboardPage() {
  const systems = listSystemSummaries();
  const stats = dashboardStats(systems);
  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Design systems</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define tokens here, preview them as clean pages, then bring them into Figma.
        </p>
      </header>
      <div className="mb-8 grid grid-cols-3 gap-4">
        <Stat label="Systems" value={stats.systems} />
        <Stat label="Tokens" value={stats.tokens} />
        <Stat label="Exports this week" value={stats.exportsThisWeek} />
      </div>
      <SystemBrowser systems={systems} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
