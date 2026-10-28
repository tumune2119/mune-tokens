"use client";

import { useMemo, useState } from "react";
import { formatTokens, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Day = { day: string; calls: number; tokens: number; costUsd: number };
type Metric = "costUsd" | "tokens" | "calls";

const METRICS: { value: Metric; label: string; format: (n: number) => string }[] = [
  { value: "costUsd", label: "Cost", format: formatUsd },
  { value: "tokens", label: "Tokens", format: formatTokens },
  { value: "calls", label: "Requests", format: (n) => String(n) },
];

const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };
const BAR_MAX = 24;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const n = v / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

function shortDay(day: string) {
  const [, m, d] = day.split("-").map(Number);
  return new Date(2000, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Column path: square at the baseline, 4px rounded data-end. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Daily usage as one blue column series, with hover tooltips and a table view. */
export function DailyChart({ daily }: { daily: Day[] }) {
  const [metric, setMetric] = useState<Metric>("costUsd");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const fmt = METRICS.find((m) => m.value === metric)!.format;

  const max = useMemo(() => niceMax(Math.max(...daily.map((d) => d[metric]))), [daily, metric]);
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(daily.length, 1);
  const barW = Math.max(2, Math.min(BAR_MAX, slot - 2)); // keep a ≥2px surface gap between columns
  // max is 1, 2 or 5 × 10^k, so fifths always land on round values.
  const step = max / 5;
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => i * step);
  const axisFmt =
    metric === "costUsd"
      ? (n: number) => `$${n.toFixed(Math.max(2, -Math.floor(Math.log10(step))))}`
      : fmt;
  const labelEvery = Math.ceil(daily.length / 8);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">Daily usage</h2>
        <Segmented
          value={metric}
          onChange={setMetric}
          options={METRICS.map((m) => ({ value: m.value, label: m.label }))}
        />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      {view === "table" ? (
        <div className="max-h-72 overflow-y-auto rounded-xl ring-1 ring-border">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Requests</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day} className="border-t border-border">
                  <td className="px-3 py-1.5">{shortDay(d.day)}</td>
                  <td className="px-3 py-1.5 text-right">{d.calls}</td>
                  <td className="px-3 py-1.5 text-right">{d.tokens.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right">{formatUsd(d.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="relative"
          ref={(el) => {
            if (!el) return;
            const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
            ro.observe(el);
            return () => ro.disconnect();
          }}
          onMouseLeave={() => setHover(null)}
        >
          <svg width={width} height={H} role="img" aria-label={`Daily ${metric === "costUsd" ? "cost" : metric}`}>
            {/* Recessive grid + y labels */}
            {ticks.map((t, i) => {
              const y = PAD.top + plotH - (t / max) * plotH;
              return (
                <g key={i}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y}
                    y2={y}
                    stroke={i === 0 ? "rgb(255 255 255 / 0.25)" : "rgb(255 255 255 / 0.07)"}
                  />
                  <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px]">
                    {i === 0 && metric === "costUsd" ? "$0" : axisFmt(t)}
                  </text>
                </g>
              );
            })}
            {daily.map((d, i) => {
              const v = d[metric];
              const h = (v / max) * plotH;
              const cx = PAD.left + slot * i + slot / 2;
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)}>
                  {/* Hit target: the whole column, bigger than the mark */}
                  <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                  {hover === i && (
                    <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="rgb(255 255 255 / 0.05)" />
                  )}
                  {v > 0 && (
                    <path
                      d={barPath(cx - barW / 2, PAD.top + plotH - Math.max(h, 2), barW, Math.max(h, 2))}
                      fill="#fafafa"
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                      {shortDay(d.day)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute z-10 min-w-36 rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg"
              style={{
                left: Math.min(PAD.left + slot * hover + slot / 2 + 10, width - 160),
                top: 8,
              }}
            >
              <p className="mb-1 font-medium text-foreground">{shortDay(daily[hover].day)}</p>
              <p className="flex justify-between gap-4 text-muted-foreground">
                Cost <span className="text-foreground tabular-nums">{formatUsd(daily[hover].costUsd)}</span>
              </p>
              <p className="flex justify-between gap-4 text-muted-foreground">
                Tokens <span className="text-foreground tabular-nums">{daily[hover].tokens.toLocaleString()}</span>
              </p>
              <p className="flex justify-between gap-4 text-muted-foreground">
                Requests <span className="text-foreground tabular-nums">{daily[hover].calls}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-lg bg-background/50 p-0.5 text-xs ring-1 ring-border">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            value === o.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
