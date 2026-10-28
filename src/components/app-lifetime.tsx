"use client";

import { useEffect, useState } from "react";
import { Power } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ConfirmButton } from "@/components/confirm-button";

const HEARTBEAT_MS = 20_000;

/**
 * Tells the server this window is open (heartbeat) and that it is closing (beacon), so the launcher's
 * server stops when the last MUNE TOKENS window closes. Renders a "stopped" screen if the server is gone.
 */
export function useAppPresence(enabled: boolean) {
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const id = crypto.randomUUID();
    const body = (status: "alive" | "bye") => JSON.stringify({ id, status });
    let failures = 0;

    const beat = () =>
      fetch("/api/app/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: body("alive") })
        .then(() => {
          failures = 0;
        })
        .catch(() => {
          // Two misses in a row: the server has stopped (closed from another window, or Quit).
          if (++failures >= 2) setStopped(true);
        });

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    // Checking in again as soon as the window is visible keeps a long-minimised window counted.
    const onVisible = () => document.visibilityState === "visible" && beat();
    const onHide = () => navigator.sendBeacon("/api/app/presence", new Blob([body("bye")], { type: "application/json" }));
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
    };
  }, [enabled]);

  return { stopped, setStopped };
}

export function QuitButton({ onQuit }: { onQuit: () => void }) {
  return (
    <ConfirmButton
      title="Quit MUNE TOKENS?"
      description="This stops the local server and closes the app. Your design systems are saved; start it again from the desktop shortcut."
      confirmLabel="Quit"
      onConfirm={async () => {
        await fetch("/api/app/quit", { method: "POST" }).catch(() => {});
        onQuit();
        // Works for the launcher's app window; otherwise the "stopped" screen stays up.
        window.close();
      }}
    >
      <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground">
        <Power className="size-4" />
        Quit MUNE TOKENS
      </button>
    </ConfirmButton>
  );
}

export function StoppedScreen() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 backdrop-blur-sm">
      <div className="text-center">
        <LogoMark className="mx-auto mb-5 size-14 drop-shadow-[0_0_14px_rgb(255_255_255/0.18)]" />
        <p className="text-lg font-semibold">MUNE TOKENS has stopped</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your design systems are saved. Close this window, or start it again from the desktop shortcut.
        </p>
      </div>
    </div>
  );
}
