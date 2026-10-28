"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { streamAi } from "@/lib/client/ai-stream";
import type { StoredComponentClient } from "./types";

export type QueueState = "queued" | "writing" | "error";

/**
 * Writes component specs one at a time (one AI call each, so a bad answer only retries that one).
 * Each finished spec is saved by the server and handed to onDone.
 */
export function useSpecQueue(systemId: string, onDone: (c: StoredComponentClient) => void) {
  const [states, setStates] = useState<Record<string, QueueState>>({});
  const [spent, setSpent] = useState(0);
  const queue = useRef<string[]>([]);
  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const id = queue.current.shift()!;
      setStates((s) => ({ ...s, [id]: "writing" }));
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const { data, usage } = await streamAi<StoredComponentClient>(`/api/systems/${systemId}/components/${id}/generate`, {}, {}, ctrl.signal);
        setSpent((n) => n + usage.costUsd);
        setStates((s) => {
          const next = { ...s };
          delete next[id];
          return next;
        });
        onDone(data);
      } catch (err) {
        if (ctrl.signal.aborted) {
          setStates({});
          queue.current = [];
          break;
        }
        setStates((s) => ({ ...s, [id]: "error" }));
        toast.error((err as Error).message);
      }
    }
    abort.current = null;
    running.current = false;
  }, [systemId, onDone]);

  const enqueue = useCallback(
    (ids: string[]) => {
      const fresh = ids.filter((id) => !queue.current.includes(id));
      queue.current.push(...fresh);
      setStates((s) => ({ ...s, ...Object.fromEntries(fresh.map((id) => [id, "queued" as const])) }));
      run();
    },
    [run],
  );

  const cancel = useCallback(() => {
    queue.current = [];
    abort.current?.abort();
    setStates({});
  }, []);

  const busy = Object.values(states).some((s) => s !== "error");
  return { states, enqueue, cancel, busy, spent };
}
