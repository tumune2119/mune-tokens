"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/kbd";
import { PaletteStrip } from "@/components/palette-strip";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SystemSummary } from "@/lib/types";

type Filter = "active" | "archived";
type Sort = "recent" | "name";

export function SystemBrowser({ systems }: { systems: SystemSummary[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [sort, setSort] = useState<Sort>("recent");
  const reduce = useReducedMotion();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = systems.filter((s) => s.status === filter && (!q || s.name.toLowerCase().includes(q) || s.fonts.some((f) => f.toLowerCase().includes(q))));
    return sort === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  }, [systems, query, filter, sort]);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-search="primary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
            placeholder="Search by name or font"
            className="h-9 rounded-xl bg-surface-2 pl-8"
          />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: "recent", label: "Recent" },
            { value: "name", label: "Name" },
          ]}
        />
      </div>

      {systems.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed py-20 text-center">
          <p className="text-lg font-medium">No design systems yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Describe a product and let Claude draft the tokens, or start from a blank set and edit by hand.
          </p>
          <Button asChild className="mt-6 rounded-xl glow">
            <Link href="/new">
              <Plus /> New system <Kbd className="ml-1 border-black/15 bg-black/10 text-black">N</Kbd>
            </Link>
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nothing matches.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s, i) => (
            <motion.li
              key={s.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03 }}
            >
              <Link
                href={`/systems/${s.id}`}
                className="group flex h-full flex-col gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <PaletteStrip colors={s.palette} className="h-10 rounded-xl" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{s.fonts.join(" · ") || "No fonts"}</p>
                </div>
                <div className="mt-auto flex items-center justify-between text-xs text-subtle-foreground">
                  <span className="font-mono">{s.tokenCount} tokens</span>
                  <span suppressHydrationWarning>Updated {relativeTime(s.updatedAt)}</span>
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex w-fit shrink-0 gap-1 rounded-xl border bg-card p-1 text-xs", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition-colors",
            value === o.value ? "bg-white text-black" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
