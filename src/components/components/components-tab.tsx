"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Braces, Check, CircleAlert, Loader2, Plus, Search, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton } from "@/components/confirm-button";
import { Segmented } from "@/components/system-browser";
import { CommitInput, SectionHead } from "@/components/editor/controls";
import { useGoogleFonts } from "@/components/editor/use-google-fonts";
import { PlannerDialog } from "./planner-dialog";
import { ReviseDialog, SpecJsonDialog } from "./spec-dialogs";
import { useSpecQueue } from "./use-spec-queue";
import type { StoredComponentClient } from "./types";
import { componentGridHtml } from "@/lib/components/render";
import { LEVELS, LEVEL_LABELS, combos, specProblems, type ComponentSpec, type ComponentStatus, type InventoryItem, type Level } from "@/lib/components/schema";
import { resolveSemantic } from "@/lib/tokens/color";
import { modesOf, type Mode, type SystemSettings, type TokenSet } from "@/lib/tokens/schema";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ComponentStatus, string> = { draft: "Draft", ready: "Ready", exported: "Exported to Figma" };

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Component library: plan from a project idea, write specs one by one, preview variant grids, mark Ready. */
export function ComponentsTab({ systemId, tokens, settings, dirty }: { systemId: string | null; tokens: TokenSet; settings: SystemSettings; dirty: boolean }) {
  if (!systemId) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Save the system to build components</p>
        <p className="mt-1 text-sm text-muted-foreground">Components are generated from the saved tokens, so every part uses token values.</p>
      </div>
    );
  }
  return <Library systemId={systemId} tokens={tokens} settings={settings} dirty={dirty} />;
}

function Library({ systemId, tokens, settings, dirty }: { systemId: string; tokens: TokenSet; settings: SystemSettings; dirty: boolean }) {
  const [items, setItems] = useState<StoredComponentClient[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [level, setLevel] = useState<Level | "all">("all");
  const [query, setQuery] = useState("");
  const [planner, setPlanner] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch(`/api/systems/${systemId}/components`)
      .then((r) => r.json())
      .then((list: StoredComponentClient[]) => {
        setItems(list);
        setSelected((s) => s ?? list[0]?.id ?? null);
      })
      .catch(() => setItems([]));
  }, [systemId]);

  const replace = useCallback((c: StoredComponentClient) => setItems((list) => (list ?? []).map((x) => (x.id === c.id ? c : x))), []);
  const queue = useSpecQueue(systemId, replace);

  async function addItems(list: InventoryItem[], write: boolean) {
    try {
      const created = await api<StoredComponentClient[]>(`/api/systems/${systemId}/components`, "POST", { items: list });
      setItems((prev) => [...(prev ?? []), ...created]);
      setSelected(created[0]?.id ?? null);
      if (write) queue.enqueue(created.map((c) => c.id));
      toast(`Added ${created.length} component${created.length === 1 ? "" : "s"}${write ? " — writing specs one by one" : ""}.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((c) => (level === "all" || c.level === level) && (!q || c.name.toLowerCase().includes(q)));
  }, [items, level, query]);
  const counts = useMemo(() => {
    const out = { draft: 0, ready: 0, exported: 0, nospec: 0 };
    for (const c of items ?? []) {
      out[c.status]++;
      if (!c.spec) out.nospec++;
    }
    return out;
  }, [items]);
  const current = items?.find((c) => c.id === selected) ?? null;
  const missingSpecs = (items ?? []).filter((c) => !c.spec && !queue.states[c.id]);

  if (!items) return <div className="shimmer h-40 rounded-2xl" />;

  return (
    <div>
      <SectionHead
        title="Component library"
        description="Every component uses only your tokens, so a token change updates them all. Ready components go into UI-CONFIG.md, the Components export page and Figma."
        actions={
          <>
            {queue.busy ? (
              <Button size="sm" variant="outline" onClick={queue.cancel}>
                <Square className="fill-current" /> Stop writing
              </Button>
            ) : (
              missingSpecs.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => queue.enqueue(missingSpecs.map((c) => c.id))}>
                  <Sparkles /> Write {missingSpecs.length} missing spec{missingSpecs.length === 1 ? "" : "s"}
                </Button>
              )
            )}
            <Button size="sm" onClick={() => setPlanner(true)}>
              <Wand2 /> Plan from project idea
            </Button>
          </>
        }
      />

      {dirty && (
        <p className="mb-4 rounded-xl bg-surface-2 px-4 py-2 text-xs text-muted-foreground">
          Previews use your unsaved tokens; AI writes specs against the saved version. Save first if you changed token names.
        </p>
      )}

      {items.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed py-16 text-center">
          <p className="font-medium">No components yet</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Describe the product you&apos;re building; Claude lists the components it needs, then writes a spec for each.</p>
          <Button className="mt-5" onClick={() => setPlanner(true)}>
            <Wand2 /> Plan from project idea
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <p className="font-mono text-xs text-subtle-foreground">
              {items.length} total · {counts.ready} ready · {counts.exported} exported · {counts.nospec} without spec
              {queue.spent > 0 && ` · ${formatUsd(queue.spent)} this session`}
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search components" className="h-8 rounded-lg bg-surface-2 pl-8" />
            </div>
            <Select value={level} onValueChange={(v) => setLevel(v as Level | "all")}>
              <SelectTrigger size="sm" className="h-8 w-full rounded-lg" aria-label="Filter by level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ul className="max-h-[60dvh] space-y-0.5 overflow-y-auto rounded-2xl border bg-card p-1.5">
              {visible.map((c) => {
                const q = queue.states[c.id];
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors", c.id === selected ? "bg-white text-black" : "hover:bg-surface-2")}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {q === "writing" ? (
                        <Loader2 className="size-3.5 animate-spin" aria-label="Writing spec" />
                      ) : q === "queued" ? (
                        <span className="text-[0.65rem] opacity-70">queued</span>
                      ) : q === "error" ? (
                        <CircleAlert className="size-3.5" aria-label="Failed" />
                      ) : !c.spec ? (
                        <span className="text-[0.65rem] opacity-70">no spec</span>
                      ) : c.status !== "draft" ? (
                        <span className="flex items-center gap-1 text-[0.65rem]">
                          <Check className="size-3" /> {c.status === "ready" ? "Ready" : "Exported"}
                        </span>
                      ) : (
                        <span className="text-[0.65rem] opacity-70">draft</span>
                      )}
                    </button>
                  </li>
                );
              })}
              {visible.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nothing matches.</li>}
            </ul>
            <div className="flex gap-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add by name" className="h-8 rounded-lg bg-surface-2" />
              <Button
                size="sm"
                variant="outline"
                disabled={!newName.trim()}
                onClick={() => {
                  addItems([{ name: newName.trim(), level: "primitive", reason: "Added by hand", usedIn: [], variants: [], states: [] }], false);
                  setNewName("");
                }}
              >
                <Plus />
              </Button>
            </div>
          </aside>

          {current ? (
            <Detail
              key={current.id}
              systemId={systemId}
              item={current}
              tokens={tokens}
              settings={settings}
              queueState={queue.states[current.id]}
              onWrite={(note) => queue.enqueue([current.id], note)}
              onChange={replace}
              onDelete={() => {
                setItems((list) => (list ?? []).filter((x) => x.id !== current.id));
                setSelected(null);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a component.</p>
          )}
        </div>
      )}

      <PlannerDialog open={planner} onOpenChange={setPlanner} systemId={systemId} existing={items.map((c) => c.name)} onAdd={addItems} />
    </div>
  );
}

function Detail({
  systemId,
  item,
  tokens,
  settings,
  queueState,
  onWrite,
  onChange,
  onDelete,
}: {
  systemId: string;
  item: StoredComponentClient;
  tokens: TokenSet;
  settings: SystemSettings;
  queueState?: string;
  onWrite: (note?: string) => void;
  onChange: (c: StoredComponentClient) => void;
  onDelete: () => void;
}) {
  const modes = modesOf(settings);
  const [mode, setMode] = useState<Mode>(modes[0]);
  const [revise, setRevise] = useState(false);
  const [json, setJson] = useState(false);
  const spec = item.spec;
  const problems = useMemo(() => (spec ? specProblems(spec, tokens) : []), [spec, tokens]);
  useGoogleFonts(tokens.fonts.map((f) => f.family));

  const patch = async (body: Record<string, unknown>) => {
    try {
      onChange(await api<StoredComponentClient>(`/api/systems/${systemId}/components/${item.id}`, "PATCH", body));
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    }
  };

  const activeMode = modes.includes(mode) ? mode : modes[0];
  const canvas = {
    bg: resolveSemantic(tokens, "color/bg/default", activeMode) ?? (activeMode === "light" ? "#ffffff" : "#0a0a0a"),
    fg: resolveSemantic(tokens, "color/text/default", activeMode) ?? (activeMode === "light" ? "#0a0a0a" : "#fafafa"),
    muted: resolveSemantic(tokens, "color/text/muted", activeMode) ?? "#737373",
    border: resolveSemantic(tokens, "color/border/default", activeMode) ?? "#e5e5e5",
  };
  const html = useMemo(() => (spec ? componentGridHtml(spec, tokens, activeMode, canvas) : ""), [spec, tokens, activeMode, canvas.fg, canvas.muted, canvas.border]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <CommitInput value={item.name} aria-label="Component name" className="h-9 w-64 text-base font-semibold" validate={(v) => (v ? null : "Required")} onCommit={(v) => patch({ name: v })} />
        <Select value={item.level} onValueChange={(v) => patch({ level: v })}>
          <SelectTrigger size="sm" className="h-8 w-44 rounded-lg" aria-label="Level">
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
        <Segmented
          value={item.status}
          onChange={(v) => patch({ status: v })}
          options={(["draft", "ready", "exported"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        />
        <div className="ml-auto flex items-center gap-1">
          <WriteSpecButton rewrite={!!spec} queueState={queueState} onWrite={onWrite} />
          {spec && (
            <>
              <Button size="sm" variant="outline" onClick={() => setRevise(true)}>
                <Wand2 /> Revise
              </Button>
              <Button size="icon-sm" variant="outline" aria-label="Edit spec JSON" title="Edit spec JSON" onClick={() => setJson(true)}>
                <Braces />
              </Button>
            </>
          )}
          <ConfirmButton
            title={`Delete ${item.name}?`}
            description="It's removed from the library, UI-CONFIG.md and the export page."
            confirmLabel="Delete component"
            destructive
            onConfirm={async () => {
              await api(`/api/systems/${systemId}/components/${item.id}`, "DELETE");
              onDelete();
            }}
          >
            <Button size="icon-sm" variant="outline" aria-label={`Delete ${item.name}`}>
              <Trash2 />
            </Button>
          </ConfirmButton>
        </div>
      </div>
      {item.reason && <p className="text-sm text-muted-foreground">{item.reason}</p>}

      {!spec ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {queueState === "writing" ? "Claude is writing the spec…" : queueState === "queued" ? "Waiting for its turn…" : "No spec yet. Write one with Claude, or paste one in later."}
          {item.plan.variants?.length ? <p className="mt-2 font-mono text-xs">Planned variants: {item.plan.variants.join(", ")}</p> : null}
        </div>
      ) : (
        <>
          {problems.length > 0 && (
            <div className="rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <CircleAlert className="size-4" /> Doesn&apos;t match the current tokens
              </p>
              <ul className="mt-1 font-mono text-xs text-muted-foreground">
                {problems.slice(0, 5).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
              <p className="text-xs text-muted-foreground">
                {spec.description} <span className="font-mono text-subtle-foreground">· {combos(spec).length} variants</span>
              </p>
              {modes.length > 1 && <Segmented value={activeMode} onChange={setMode} options={modes.map((m) => ({ value: m, label: m === "light" ? "Light" : "Dark" }))} />}
            </div>
            <div className="overflow-x-auto rounded-b-2xl p-6" style={{ background: canvas.bg, color: canvas.fg }}>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>

          <SpecSummary spec={spec} />
        </>
      )}

      {spec && (
        <>
          <ReviseDialog
            open={revise}
            onOpenChange={setRevise}
            systemId={systemId}
            item={item}
            tokens={tokens}
            mode={activeMode}
            onApply={async (next) => {
              if (await patch({ spec: next })) toast("Revision applied.");
            }}
          />
          <SpecJsonDialog open={json} onOpenChange={setJson} spec={spec} tokens={tokens} onSave={(next) => patch({ spec: next })} />
        </>
      )}
    </div>
  );
}

function SpecSummary({ spec }: { spec: ComponentSpec }) {
  const tree = (parent: string | null, depth: number): React.ReactNode[] =>
    spec.anatomy
      .filter((p) => (p.parent ?? null) === parent)
      .flatMap((p) => [
        <li key={p.name} style={{ paddingLeft: depth * 14 }} className="font-mono text-xs">
          {p.name} <span className="text-subtle-foreground">{p.kind}{p.icon ? ` · ${p.icon}` : ""}{p.text ? ` · "${p.text}"` : ""}</span>
        </li>,
        ...tree(p.name, depth + 1),
      ]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Anatomy</p>
        <ul className="space-y-0.5">{tree(null, 0)}</ul>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Properties & states</p>
        <ul className="space-y-1 text-xs">
          {spec.props.map((p) => (
            <li key={p.name}>
              <span className="font-mono">{p.name}</span> <span className="text-muted-foreground">{p.values.join(" · ")}</span>
            </li>
          ))}
          <li>
            <span className="font-mono">state</span> <span className="text-muted-foreground">{spec.states.join(" · ")}</span>
          </li>
        </ul>
        <p className="mt-3 mb-1 text-xs tracking-wide text-muted-foreground uppercase">Token bindings</p>
        <p className="text-xs text-muted-foreground">{spec.styles.length} rules — see the JSON or UI-CONFIG.md</p>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Accessibility & content</p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {spec.a11y.role && <li>Role: {spec.a11y.role}</li>}
          {spec.a11y.keyboard && <li>{spec.a11y.keyboard}</li>}
          {spec.a11y.minTarget ? <li>Min target {spec.a11y.minTarget}px</li> : null}
          {spec.a11y.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {spec.content.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Write / Rewrite spec, with optional notes to steer Claude. */
function WriteSpecButton({ rewrite, queueState, onWrite }: { rewrite: boolean; queueState?: string; onWrite: (note?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const label = rewrite ? "Rewrite spec" : "Write spec";
  const go = () => {
    onWrite(note);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={!!queueState && queueState !== "error"}>
          {queueState === "writing" ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {queueState === "writing" ? "Writing…" : queueState === "queued" ? "Queued" : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 rounded-2xl p-4" align="end">
        <Label htmlFor="spec-notes">Notes for Claude (optional)</Label>
        <Textarea
          id="spec-notes"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) go();
          }}
          rows={4}
          maxLength={4000}
          placeholder="e.g. Pill shape, only primary and ghost variants, include a loading state, icon on the left."
          className="resize-none text-sm"
        />
        <p className="text-xs text-muted-foreground">{rewrite ? "Replaces the current spec. " : ""}Leave empty to let Claude decide from the plan and your tokens.</p>
        <Button size="sm" className="w-full" onClick={go}>
          <Sparkles /> {label}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
