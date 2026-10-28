"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { QuitButton, StoppedScreen, useAppPresence } from "@/components/app-lifetime";
import type { SystemSummary } from "@/lib/types";

export function isTyping(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("[role=dialog]") !== null;
}

export function AppShell({
  systems,
  launched,
  children,
}: {
  systems: SystemSummary[];
  /** Started by the desktop launcher: the server stops when the last window closes. */
  launched: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { stopped, setStopped } = useAppPresence(launched);

  // Global shortcuts: N = new system, / = focus search. Editor shortcuts live in the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push("/new");
      } else if (e.key === "/") {
        e.preventDefault();
        const el =
          document.querySelector<HTMLInputElement>('[data-search="primary"]') ??
          document.querySelector<HTMLInputElement>('[data-search="sidebar"]');
        el?.focus();
        el?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar systems={systems} footer={launched && <QuitButton onQuit={() => setStopped(true)} />} />
      <main className="min-w-0 flex-1">{children}</main>
      {stopped && <StoppedScreen />}
    </div>
  );
}
