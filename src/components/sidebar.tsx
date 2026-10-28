"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { BarChart3, LayoutGrid, Plus, Search, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogoMark, Wordmark } from "@/components/logo";
import { Kbd } from "@/components/kbd";
import { PaletteStrip } from "@/components/palette-strip";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SystemSummary } from "@/lib/types";

export function Sidebar({ systems, footer }: { systems: SystemSummary[]; footer?: React.ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return systems.filter((s) => (q ? s.name.toLowerCase().includes(q) : s.status === "active"));
  }, [systems, query]);

  return (
    <aside className="sticky top-0 flex h-dvh w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <LogoMark className="size-8" />
        <Link href="/" className="text-[0.95rem]" aria-label="MUNE TOKENS home">
          <Wordmark />
        </Link>
      </div>

      <div className="space-y-3 px-4">
        <Button asChild className="h-9 w-full justify-between rounded-xl glow">
          <Link href="/new">
            <span className="flex items-center gap-2">
              <Plus /> New system
            </span>
            <Kbd className="border-black/15 bg-black/10 text-black">N</Kbd>
          </Link>
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-search="sidebar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
            placeholder="Search systems"
            className="h-9 rounded-xl bg-surface-2 pr-8 pl-8"
          />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">/</Kbd>
        </div>
      </div>

      <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
        {visible.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{query ? "No matching systems." : "No systems yet."}</p>
        )}
        <ul className="space-y-0.5">
          {visible.map((s) => {
            const active = pathname === `/systems/${s.id}`;
            return (
              <li key={s.id}>
                <Link
                  href={`/systems/${s.id}`}
                  className={cn(
                    "group flex flex-col gap-1.5 rounded-xl px-2.5 py-2 transition-colors",
                    active ? "bg-sidebar-accent ring-1 ring-border-strong" : "hover:bg-sidebar-accent/60",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", active ? "text-foreground" : "text-foreground/85")}>{s.name}</span>
                    <span className="shrink-0 text-[0.68rem] text-subtle-foreground" suppressHydrationWarning>
                      {relativeTime(s.updatedAt)}
                    </span>
                  </span>
                  <PaletteStrip colors={s.palette} className="h-1.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        <SideLink href="/" icon={<LayoutGrid className="size-4" />} label="Dashboard" active={pathname === "/"} />
        <SideLink href="/usage" icon={<BarChart3 className="size-4" />} label="Claude usage" active={pathname === "/usage"} />
        <SideLink href="/settings" icon={<Settings className="size-4" />} label="Settings" active={pathname === "/settings"} />
        {footer}
        <p className="px-2.5 pt-2 text-[0.68rem] leading-relaxed whitespace-nowrap text-subtle-foreground">
          <Kbd>N</Kbd> new · <Kbd>/</Kbd> search · <Kbd>Ctrl S</Kbd> save · <Kbd>O</Kbd> open
        </p>
      </div>
    </aside>
  );
}

function SideLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
