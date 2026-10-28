"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Paperclip, Plus, Sparkles, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { costLine } from "@/components/new-system/new-system";
import { parsePartialJson, streamAi } from "@/lib/client/ai-stream";
import { LEVELS, LEVEL_LABELS, type InventoryItem, type Level } from "@/lib/components/schema";
import { formatUsd } from "@/lib/format";
import type { UsageInfo } from "@/lib/ai/events";
import type { BriefFile } from "@/lib/types";
import type { MediaPart } from "@/lib/ai/types";
import { MEDIA_ACCEPT, isMediaFile, readMedia } from "@/lib/client/media";

type Row = InventoryItem & { key: number; on: boolean };

/**
 * Step 1 of the component library: the product idea → a checklist of components, grouped by level,
 * each with why it's needed, its variants/states and an estimated spec cost. Nothing is created
 * until "Add to library".
 */
export function PlannerDialog({
  open,
  onOpenChange,
  systemId,
  existing,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  systemId: string;
  existing: string[];
  onAdd: (items: InventoryItem[], writeSpecs: boolean) => Promise<void>;
}) {
  const [idea, setIdea] = useState("");
  const [files, setFiles] = useState<BriefFile[]>([]);
  const [media, setMedia] = useState<MediaPart[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState<{ name: string; level: Level }>({ name: "", level: "product" });
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || loadedFor.current === systemId) return;
    loadedFor.current = systemId;
    fetch(`/api/systems/${systemId}/idea`)
      .then((r) => r.json())
      .then((d: { idea: string; files: BriefFile[] }) => {
        setIdea((v) => v || d.idea);
        setFiles((f) => (f.length ? f : d.files));
      })
      .catch(() => {});
  }, [open, systemId]);

  async function find() {
    if (!idea.trim()) return toast("Describe the product first.");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setStreamed("");
    setRows([]);
    setUsage(null);
    try {
      const { data, usage } = await streamAi<{ items: InventoryItem[] }>(
        `/api/systems/${systemId}/components/inventory`,
        { idea, files, media },
        { onText: (d) => setStreamed((s) => s + d), onRetry: () => setStreamed("") },
        ctrl.signal,
      );
      const taken = new Set(existing.map((n) => n.toLowerCase()));
      setRows(data.items.map((it, i) => ({ ...it, key: i, on: !taken.has(it.name.toLowerCase()) })));
      setUsage(usage);
    } catch (err) {
      if (!ctrl.signal.aborted) toast.error((err as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const added: BriefFile[] = [];
    for (const f of Array.from(list)) {
      if (isMediaFile(f.name)) {
        try {
          const part = await readMedia(f);
          setMedia((prev) => [...prev, part].slice(0, 6));
        } catch (err) {
          toast.error((err as Error).message);
        }
        continue;
      }
      if (!/\.(md|txt|json|csv)$/i.test(f.name)) {
        toast(`${f.name}: attach text files (.md, .txt, .json, .csv) — e.g. a PRD, user flows or a MUNE TASKS plan.`);
        continue;
      }
      added.push({ name: f.name, size: f.size, text: (await f.text()).slice(0, 100_000) });
    }
    setFiles((p) => [...p, ...added].slice(0, 10));
  }

  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const next = [...r];
      const j = i + d;
      if (j < 0 || j >= next.length) return r;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const patch = (key: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const ticked = rows.filter((r) => r.on);
  const estimate = ticked.reduce((n, r) => n + (r.estimateUsd ?? 0), 0);
  const partial = busy ? parsePartialJson<{ items?: Partial<InventoryItem>[] }>(streamed)?.items?.filter((i) => i?.name) ?? [] : [];

  async function add(writeSpecs: boolean) {
    setAdding(true);
    try {
      await onAdd(ticked, writeSpecs);
      setRows([]);
      onOpenChange(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && abortRef.current?.abort(), onOpenChange(o))}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Plan components from a project idea</DialogTitle>
          <DialogDescription>Claude works out which components the product needs. Untick what you don&apos;t want; nothing is created until you add them.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy && find()}
            rows={4}
            disabled={busy}
            placeholder="A budgeting app for freelancers: connect bank accounts, tag transactions by client, see monthly cash flow, send invoices…"
            className="rounded-xl bg-surface-2"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Paperclip /> PRD, flows, screenshots…
            </Button>
            <input ref={fileInput} type="file" multiple hidden accept={`.md,.txt,.json,.csv,${MEDIA_ACCEPT}`} onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            {media.map((m, i) => (
              <span key={`m${i}`} className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-[0.7rem]">
                {m.mediaType === "application/pdf" ? "PDF" : "IMG"} {m.name}
                <button aria-label={`Remove ${m.name}`} onClick={() => setMedia(media.filter((_, j) => j !== i))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-[0.7rem]">
                {f.name}
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <span className="ml-auto" />
            {busy ? (
              <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square className="fill-current" /> Cancel
              </Button>
            ) : (
              <Button size="sm" onClick={find}>
                <Sparkles /> {rows.length ? "Find again" : "Find components"}
              </Button>
            )}
          </div>
        </div>

        {busy && (
          <div className="flex flex-wrap gap-1.5" aria-live="polite">
            {partial.map((it, i) => (
              <span key={i} className="rounded-md bg-surface-2 px-2 py-1 text-xs">
                {it.name}
              </span>
            ))}
            <span className="shimmer h-6 w-24 rounded-md" />
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-5">
            {usage && <p className="font-mono text-xs text-muted-foreground">{costLine(usage)}</p>}
            {LEVELS.map((level) => {
              const list = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.level === level);
              if (!list.length) return null;
              return (
                <section key={level}>
                  <h3 className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">{LEVEL_LABELS[level]}</h3>
                  <ul className="space-y-1.5">
                    {list.map(({ r, i }) => (
                      <li key={r.key} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2">
                        <Checkbox className="mt-1" checked={r.on} onCheckedChange={(v) => patch(r.key, { on: v === true })} aria-label={`Include ${r.name}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Input
                              value={r.name}
                              onChange={(e) => patch(r.key, { name: e.target.value })}
                              className="h-7 w-48 rounded-md border-transparent bg-transparent px-1 font-medium hover:border-border"
                              aria-label="Name"
                            />
                            {existing.some((n) => n.toLowerCase() === r.name.toLowerCase()) && <span className="text-[0.65rem] text-subtle-foreground">already in library</span>}
                          </div>
                          {r.reason && <p className="px-1 text-xs text-muted-foreground">{r.reason}</p>}
                          <p className="px-1 font-mono text-[0.65rem] text-subtle-foreground">
                            {[r.variants.length ? `variants: ${r.variants.join(", ")}` : "", r.states.length ? `states: ${r.states.join(", ")}` : "", r.usedIn.length ? `used in: ${r.usedIn.join(", ")}` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <span className="shrink-0 pt-1 font-mono text-[0.7rem] text-subtle-foreground" title="Estimated cost to write this spec">
                          ~{formatUsd(r.estimateUsd ?? 0)}
                        </span>
                        <div className="flex shrink-0">
                          <Button size="icon-xs" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}>
                            <ArrowUp />
                          </Button>
                          <Button size="icon-xs" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}>
                            <ArrowDown />
                          </Button>
                          <Button size="icon-xs" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                            <Trash2 />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
              <span className="text-sm text-muted-foreground">Add your own</span>
              <Input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Invoice row" className="h-8 w-48 rounded-lg bg-surface-2" />
              <Select value={custom.level} onValueChange={(v) => setCustom({ ...custom, level: v as Level })}>
                <SelectTrigger size="sm" className="h-8 w-40 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LEVEL_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!custom.name.trim()}
                onClick={() => {
                  setRows([...rows, { name: custom.name.trim(), level: custom.level, reason: "Added by hand", usedIn: [], variants: [], states: [], key: Date.now(), on: true, estimateUsd: rows[0]?.estimateUsd }]);
                  setCustom({ ...custom, name: "" });
                }}
              >
                <Plus /> Add
              </Button>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <DialogFooter className="items-center">
            <span className="mr-auto text-sm text-muted-foreground">
              {ticked.length} ticked · specs ~{formatUsd(estimate)} (API-equivalent)
            </span>
            <Button variant="outline" disabled={!ticked.length || adding} onClick={() => add(false)}>
              Add to library only
            </Button>
            <Button disabled={!ticked.length || adding} onClick={() => add(true)}>
              <Sparkles /> Add and write {ticked.length} spec{ticked.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
