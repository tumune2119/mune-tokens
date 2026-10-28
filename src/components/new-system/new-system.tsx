"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileJson, Paperclip, Sparkles, Square, SquarePen, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Kbd } from "@/components/kbd";
import { Segmented } from "@/components/system-browser";
import { SystemEditor, type EditorInitial } from "@/components/editor/system-editor";
import { LivePreview } from "@/components/new-system/live-preview";
import { parsePartialJson, streamAi } from "@/lib/client/ai-stream";
import { buildTokenSet, type Generation } from "@/lib/ai/token-schemas";
import { blankTokenSet } from "@/lib/tokens/defaults";
import { importDtcg } from "@/lib/tokens/import";
import { SCOPES, SCOPE_LABELS, type Scope, type SystemSettings } from "@/lib/tokens/schema";
import { formatBytes, formatTokens, formatUsd } from "@/lib/format";
import type { BriefFile } from "@/lib/types";
import type { UsageInfo } from "@/lib/ai/events";

const TEXT_EXT = /\.(css|json|md|txt|scss|less|js|ts)$/i;

export function NewSystem({ defaults }: { defaults: SystemSettings }) {
  const [brief, setBrief] = useState("");
  const [settings, setSettings] = useState<SystemSettings>(defaults);
  const [files, setFiles] = useState<BriefFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<EditorInitial | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && busy && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, cancel]);

  const set = <K extends keyof SystemSettings>(k: K, v: SystemSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const toggleScope = (s: Scope, on: boolean) =>
    set("scope", on ? SCOPES.filter((x) => x === s || settings.scope.includes(x)) : settings.scope.filter((x) => x !== s));

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const added: BriefFile[] = [];
    for (const f of Array.from(list)) {
      if (!TEXT_EXT.test(f.name)) {
        toast(`${f.name}: only text files (.css, .json, .md, .txt) can be attached for now.`);
        continue;
      }
      if (f.size > 400_000) {
        toast(`${f.name} is too large (${formatBytes(f.size)}).`);
        continue;
      }
      added.push({ name: f.name, size: f.size, text: await f.text() });
    }
    setFiles((prev) => [...prev, ...added]);
  }

  async function generate() {
    if (!brief.trim()) {
      toast("Describe the product first.");
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setStreamed("");
    setStatus("Connecting…");
    try {
      const { data, usage } = await streamAi<Generation>(
        "/api/ai/generate",
        { brief, settings, files },
        {
          onMeta: (label) => setStatus(`Generating with ${label}`),
          onText: (d) => setStreamed((s) => s + d),
          onRetry: (reason) => {
            setStatus("Fixing the response…");
            setStreamed("");
            console.warn("Retrying:", reason);
          },
        },
        ctrl.signal,
      );
      const tokens = buildTokenSet(data, settings);
      setDraft({ id: null, name: data.name, brief, settings, tokens, version: 0, usageIds: [usage.id], lastCost: usage });
      toast(`Generated in ${(usage.durationMs / 1000).toFixed(1)}s · ${costLine(usage)}`);
    } catch (err) {
      const msg = (err as Error).message;
      if (ctrl.signal.aborted || msg === "Cancelled.") toast("Generation cancelled.");
      else toast.error(msg);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function startBlank() {
    setDraft({ id: null, name: "Untitled system", brief, settings, tokens: blankTokenSet(settings), version: 0, usageIds: [] });
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      const { set, modes, name, skipped } = importDtcg(JSON.parse(await file.text()));
      if (!set.ramps.length && !set.semantic.length && !set.typeScale.length && !set.spacing.length) {
        toast.error("No design tokens found in that file.");
        return;
      }
      const s: SystemSettings = { ...settings, modes: modes.length === 2 ? "both" : modes[0] };
      setDraft({ id: null, name: name ?? file.name.replace(/\.json$/i, ""), brief, settings: s, tokens: set, version: 0, usageIds: [] });
      if (skipped) toast(`Imported. ${skipped} token${skipped === 1 ? "" : "s"} of unsupported types were skipped.`);
    } catch (err) {
      toast.error(`Couldn't read that file: ${(err as Error).message}`);
    }
  }

  if (draft) return <SystemEditor initial={draft} />;

  const partial = parsePartialJson<Partial<Generation>>(streamed);

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,520px)_1fr]">
      <div className="border-r px-8 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">New system</h1>
        <p className="mt-1 text-sm text-muted-foreground">Describe the product. Claude drafts the tokens; nothing is saved until you say so.</p>

        <div className="mt-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="brief">Brief</Label>
            <Textarea
              id="brief"
              autoFocus
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) generate();
              }}
              disabled={busy}
              rows={7}
              placeholder={"Fintech app for freelancers. Calm, trustworthy, a little warm.\nBrand colour teal (#0d9488). Inter for UI. Needs AA contrast."}
              className="resize-y rounded-xl bg-surface-2"
            />
            <p className="text-xs text-subtle-foreground">Product, audience, mood, brand colours, fonts, accessibility needs.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Attachments</Label>
              <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
                <Paperclip /> Add files
              </Button>
              <input ref={fileInput} type="file" multiple hidden accept=".css,.json,.md,.txt,.scss,.less" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
            </div>
            {files.length > 0 ? (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
                    <span className="truncate font-mono text-xs">{f.name}</span>
                    <span className="flex items-center gap-2 text-xs text-subtle-foreground">
                      {formatBytes(f.size)}
                      <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="hover:text-foreground">
                        <X className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-subtle-foreground">Existing CSS, tokens JSON or brand notes (.css, .json, .md, .txt).</p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Generate</legend>
            <div className="grid grid-cols-2 gap-2">
              {SCOPES.map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <Checkbox checked={settings.scope.includes(s)} onCheckedChange={(v) => toggleScope(s, v === true)} disabled={busy} />
                  {SCOPE_LABELS[s]}
                </label>
              ))}
            </div>
            <p className="text-xs text-subtle-foreground">Unticked groups start from sensible defaults you can edit.</p>
          </fieldset>

          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <Field label="Ramp steps">
              <Segmented value={settings.steps} onChange={(v) => set("steps", v)} options={[{ value: "11", label: "50–950" }, { value: "9", label: "100–900" }]} />
            </Field>
            <Field label="Modes">
              <Segmented
                value={settings.modes}
                onChange={(v) => set("modes", v)}
                options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "both", label: "Both" }]}
              />
            </Field>
            <Field label="Contrast">
              <Segmented value={settings.contrast} onChange={(v) => set("contrast", v)} options={[{ value: "AA", label: "AA" }, { value: "AAA", label: "AAA" }]} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-6">
            {busy ? (
              <Button onClick={cancel} variant="outline" className="rounded-xl">
                <Square className="fill-current" /> Cancel <Kbd className="ml-1">Esc</Kbd>
              </Button>
            ) : (
              <Button onClick={generate} className="rounded-xl glow">
                <Sparkles /> Generate with Claude <Kbd className="ml-1 border-black/15 bg-black/10 text-black">Ctrl ↵</Kbd>
              </Button>
            )}
            <Button variant="outline" className="rounded-xl" onClick={startBlank} disabled={busy}>
              <SquarePen /> Start blank
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => importInput.current?.click()} disabled={busy}>
              <FileJson /> Import tokens JSON
            </Button>
            <input ref={importInput} type="file" hidden accept=".json,application/json" onChange={(e) => (importJson(e.target.files?.[0]), (e.target.value = ""))} />
          </div>
        </div>
      </div>

      <div className="min-w-0 px-8 py-10">
        <LivePreview partial={partial} settings={settings} busy={busy} status={status} chars={streamed.length} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

export function costLine(u: Pick<UsageInfo, "inputTokens" | "outputTokens" | "costUsd" | "attempts">) {
  return `${formatTokens(u.inputTokens)} in / ${formatTokens(u.outputTokens)} out · ${formatUsd(u.costUsd)}${u.attempts > 1 ? ` · ${u.attempts} attempts` : ""}`;
}
