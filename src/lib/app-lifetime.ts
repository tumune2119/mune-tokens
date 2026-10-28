import "server-only";

/**
 * When MUNE TOKENS is started from the desktop launcher (MUNE_TOKENS_AUTO_EXIT=1), the server lives only
 * as long as an app window is open. Each window reports in; closing the last one shuts the server down.
 * `npm run dev` / `npm start` without the flag never exit on their own.
 */
export const AUTO_EXIT = process.env.MUNE_TOKENS_AUTO_EXIT === "1";

const TICK_MS = 10_000;
/** Background/minimised windows only fire timers about once a minute, so allow a few missed beats. */
const STALE_MS = 150_000;
/** After a window says goodbye, wait this long in case it was only a reload. */
const BYE_GRACE_MS = 5_000;
/** If no window ever connects (browser failed to open), don't linger forever. */
const NEVER_CONNECTED_MS = 10 * 60_000;

interface State {
  clients: Map<string, number>;
  everConnected: boolean;
  startedAt: number;
  lastTick: number;
  exiting: boolean;
  lastByeAt: number;
  byeTimer: ReturnType<typeof setTimeout> | null;
}

const g = globalThis as unknown as { __muneTokensLifetime?: State };
function state(): State {
  g.__muneTokensLifetime ??= {
    clients: new Map(),
    everConnected: false,
    startedAt: Date.now(),
    lastTick: Date.now(),
    exiting: false,
    lastByeAt: 0,
    byeTimer: null,
  };
  return g.__muneTokensLifetime;
}

export function quitSoon(reason: string) {
  const s = state();
  if (s.exiting) return;
  s.exiting = true;
  console.log(`[MUNE TOKENS] Shutting down: ${reason}`);
  // Let the current response reach the browser first.
  setTimeout(() => process.exit(0), 300);
}

function exitIfNoWindows(reason: string) {
  if (state().clients.size === 0) quitSoon(reason);
}

/** Called once at server start (instrumentation.ts). */
export function startWatchdog() {
  if (!AUTO_EXIT) return;
  const s = state();
  console.log("[MUNE TOKENS] Will stop automatically when the last app window closes.");
  setInterval(() => {
    const now = Date.now();
    // A long gap between ticks means the PC was asleep: give windows time to check in again.
    if (now - s.lastTick > TICK_MS * 4) {
      for (const id of s.clients.keys()) s.clients.set(id, now);
    }
    s.lastTick = now;

    for (const [id, seen] of s.clients) if (now - seen > STALE_MS) s.clients.delete(id);
    if (!s.everConnected) {
      if (now - s.startedAt > NEVER_CONNECTED_MS) quitSoon("no app window connected");
    } else if (now - s.lastByeAt > BYE_GRACE_MS) {
      // A window that just closed is left to its own grace timer: it may be a reload.
      exitIfNoWindows("no app windows are open");
    }
  }, TICK_MS).unref();
}

/** A window reporting that it is open ("alive", repeated) or closing ("bye"). */
export function reportPresence(id: string, status: "alive" | "bye") {
  if (!AUTO_EXIT) return;
  const s = state();
  if (status === "alive") {
    s.clients.set(id, Date.now());
    s.everConnected = true;
    return;
  }
  s.clients.delete(id);
  s.lastByeAt = Date.now();
  if (s.byeTimer) clearTimeout(s.byeTimer);
  s.byeTimer = setTimeout(() => exitIfNoWindows("the last app window was closed"), BYE_GRACE_MS);
}
