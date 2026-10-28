"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Ellipsis, ExternalLink, FileJson, FolderOpen, History, Loader2, Save, Settings2, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmButton } from "@/components/confirm-button";
import { Kbd } from "@/components/kbd";
import { isTyping } from "@/components/app-shell";
import { costLine } from "@/components/new-system/new-system";
import { ColorsTab } from "./colors-tab";
import { SemanticTab } from "./semantic-tab";
import { TypographyTab } from "./typography-tab";
import { DimensionTab, ShadowsTab } from "./scales-tab";
import { ExportTab, copyUiConfig, openFolder, openInBrowser } from "./export-tab";
import { RegenerateDialog } from "./regenerate-dialog";
import { ComponentsTab } from "@/components/components/components-tab";
import { MotionTab } from "./motion-tab";
import { BrandsPanel } from "./brands-panel";
import { HistoryDialog } from "./history-dialog";
import { ImportDialog } from "./import-dialog";
import { SystemSettingsDialog } from "./settings-dialog";
import { findProblems, type GroupKey, type SystemSettings, type TokenSet } from "@/lib/tokens/schema";
import { contrastPairs, pairPasses } from "@/lib/tokens/color";
import { modesOf } from "@/lib/tokens/schema";
import type { ExportPage } from "@/lib/export/pages";
import type { UsageInfo } from "@/lib/ai/events";
import type { SystemRecord, SystemStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Update = (fn: (draft: TokenSet) => void) => void;

export interface EditorInitial {
  id: string | null;
  name: string;
  brief: string;
  settings: SystemSettings;
  tokens: TokenSet;
  version: number;
  status?: SystemStatus;
  folder?: string | null;
  folderError?: string | null;
  /** Unsaved drafts: AI calls to attach to the system once it's saved. */
  usageIds?: string[];
  lastCost?: UsageInfo;
  uiConfigEdited?: boolean;
  /** Absolute path of figma-plugin/manifest.json, shown in the Export tab. */
  pluginManifest?: string;
}

type Tab = "colors" | "semantic" | "typography" | "spacing" | "radius" | "shadows" | "breakpoints" | "motion" | "components" | "export";

const TABS: { value: Tab; label: string; group?: GroupKey; page?: ExportPage }[] = [
  { value: "colors", label: "Colours", group: "ramps", page: "colors" },
  { value: "semantic", label: "Semantic", group: "semantic", page: "colors" },
  { value: "typography", label: "Typography", group: "typography", page: "typography" },
  { value: "spacing", label: "Spacing", group: "spacing", page: "spacing" },
  { value: "radius", label: "Radius", group: "radius", page: "spacing" },
  { value: "shadows", label: "Shadows", group: "shadows", page: "effects" },
  { value: "breakpoints", label: "Breakpoints", group: "breakpoints", page: "spacing" },
  { value: "motion", label: "Motion", group: "motion", page: "effects" },
  { value: "components", label: "Components", page: "components" },
  { value: "export", label: "Export" },
];

const snapshot = (v: { name: string; brief: string; settings: SystemSettings; tokens: TokenSet }) =>
  JSON.stringify([v.name, v.brief, v.settings, v.tokens]);

export function SystemEditor({ initial }: { initial: EditorInitial }) {
  const router = useRouter();
  const [id, setId] = useState(initial.id);
  const [name, setName] = useState(initial.name);
  const [brief, setBrief] = useState(initial.brief);
  const [settings, setSettings] = useState(initial.settings);
  const [tokens, setTokens] = useState(initial.tokens);
  const [version, setVersion] = useState(initial.version);
  const [status, setStatusState] = useState<SystemStatus>(initial.status ?? "active");
  const [folder, setFolder] = useState(initial.folder ?? null);
  const [folderError, setFolderError] = useState(initial.folderError ?? null);
  const [saved, setSaved] = useState(() => (initial.id ? snapshot(initial) : ""));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("colors");
  const [regen, setRegen] = useState<GroupKey | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [uiConfigEdited, setUiConfigEdited] = useState(!!initial.uiConfigEdited);
  const usageIds = useRef<string[]>(initial.usageIds ?? []);

  const current = { name, brief, settings, tokens };
  const dirty = !id || snapshot(current) !== saved;
  const problems = useMemo(() => findProblems(tokens), [tokens]);
  const failing = useMemo(
    () => contrastPairs(tokens, modesOf(settings)).filter((p) => !pairPasses(p, settings.contrast)).length,
    [tokens, settings],
  );

  const update: Update = useCallback((fn) => {
    setTokens((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const load = useCallback((rec: SystemRecord) => {
    setId(rec.id);
    setName(rec.name);
    setBrief(rec.brief);
    setSettings(rec.settings);
    setTokens(rec.tokens);
    setVersion(rec.version);
    setStatusState(rec.status);
    setFolder(rec.folder);
    setFolderError(rec.folderError);
    setSaved(snapshot(rec));
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    if (!name.trim()) return toast.error("Give the system a name.");
    if (problems.length) return toast.error(`Fix ${problems.length} problem${problems.length === 1 ? "" : "s"} before saving: ${problems[0]}`);
    setSaving(true);
    try {
      const body = { name: name.trim(), brief, settings, tokens, usageIds: usageIds.current };
      const res = await fetch(id ? `/api/systems/${id}` : "/api/systems", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      const rec = data as SystemRecord;
      usageIds.current = [];
      load(rec);
      setUiConfigEdited(false);
      if (rec.folderError) toast.error(`Saved, but the project folder couldn't be written: ${rec.folderError}`);
      else toast(`Saved · version ${rec.version}`, { description: rec.folder ?? undefined });
      if (!id) router.replace(`/systems/${rec.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [saving, name, brief, settings, tokens, id, problems, load, router]);

  const activeTab = TABS.find((t) => t.value === tab)!;

  const openCurrent = useCallback(() => {
    if (!id) return toast("Save the system first — export pages show the saved version.");
    if (dirty) toast("Opening the saved version. Save to include your latest changes.");
    openInBrowser(id, activeTab.page ?? "colors", modesOf(settings)[0]).catch((e) => toast.error((e as Error).message));
  }, [id, dirty, activeTab, settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      // J/K (or arrows) move between tokens in the current tab; E edits the focused one.
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k" || ((e.key === "ArrowDown" || e.key === "ArrowUp") && (e.target as HTMLElement)?.closest?.("[data-token-item]"))) {
        const panel = document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
        const items = Array.from(panel?.querySelectorAll<HTMLElement>("[data-token-item]") ?? []);
        if (!items.length) return;
        e.preventDefault();
        const here = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-token-item]");
        const i = here ? items.indexOf(here) : -1;
        const down = key === "j" || e.key === "ArrowDown";
        const next = items[Math.max(0, Math.min(items.length - 1, i === -1 ? 0 : i + (down ? 1 : -1)))];
        if (!next.hasAttribute("tabindex") && next.tagName !== "BUTTON") next.setAttribute("tabindex", "-1");
        next.focus();
        next.scrollIntoView({ block: "nearest" });
        return;
      }
      if (key === "e") {
        const here = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-token-item]");
        if (!here) return;
        e.preventDefault();
        if (here.tagName === "BUTTON") return here.click();
        const field = here.querySelector<HTMLElement>("input:not([type=color]), button[aria-label], [role=combobox]");
        if (field instanceof HTMLInputElement) {
          field.focus();
          field.select();
        } else field?.click();
        return;
      }
      if ((e.key === "g" || e.key === "G") && activeTab.group) {
        e.preventDefault();
        setRegen(activeTab.group);
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        openCurrent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, activeTab, openCurrent]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  async function resolveUiConfig(action: "keep" | "overwrite") {
    if (!id) return;
    const res = await fetch(`/api/systems/${id}/ui-config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? "Failed");
    load(data.system);
    setUiConfigEdited(false);
    toast(action === "keep" ? `Imported ${data.changes} change${data.changes === 1 ? "" : "s"} from UI-CONFIG.md · version ${data.system.version}` : "UI-CONFIG.md rewritten from the app.");
    router.refresh();
  }

  async function setStatus(next: SystemStatus) {
    if (!id) return;
    const res = await fetch(`/api/systems/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (!res.ok) return toast.error("Couldn't update the system.");
    setStatusState(next);
    toast(next === "archived" ? "Archived." : "Restored.");
    router.refresh();
  }

  async function remove() {
    if (!id) return;
    await fetch(`/api/systems/${id}`, { method: "DELETE" });
    toast("Deleted. The project folder on disk was left as it is.");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 px-8 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Project name"
            placeholder="Project name"
            className="h-9 w-80 rounded-xl border-transparent bg-transparent px-2 text-lg font-semibold hover:border-border focus-visible:bg-surface-2"
          />
          <span className="font-mono text-xs text-subtle-foreground">{id ? `v${version}` : "draft"}</span>
          {status === "archived" && <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs">Archived</span>}
          <span className={cn("flex items-center gap-1.5 text-xs", dirty ? "text-foreground" : "text-subtle-foreground")} aria-live="polite">
            <span className={cn("size-1.5 rounded-full", dirty ? "bg-white" : "border border-subtle-foreground")} />
            {dirty ? (id ? "Unsaved changes" : "Not saved yet") : "Saved"}
          </span>
          {initial.lastCost && !id && <span className="font-mono text-xs text-subtle-foreground">{costLine(initial.lastCost)}</span>}

          <div className="ml-auto flex items-center gap-2">
            {activeTab.group && (
              <Button variant="outline" size="sm" onClick={() => setRegen(activeTab.group!)}>
                <Sparkles /> Regenerate <Kbd className="ml-0.5">G</Kbd>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={openCurrent} disabled={!id}>
              <ExternalLink /> Open in browser <Kbd className="ml-0.5">O</Kbd>
            </Button>
            {id && (
              <Button variant="outline" size="icon-sm" aria-label="Version history" title="Version history" onClick={() => setHistoryOpen(true)}>
                <History />
              </Button>
            )}
            <Button variant="outline" size="icon-sm" aria-label="System settings" title="System settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 />
            </Button>
            {id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label="More actions">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => openFolder(id)}>
                    <FolderOpen /> Open folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => copyUiConfig(id)}>
                    <Copy /> Copy UI config
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                    <FileJson /> Import from Figma / JSON…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {status === "active" ? (
                    <DropdownMenuItem onSelect={() => setStatus("archived")}>
                      <Archive /> Archive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setStatus("active")}>
                      <ArchiveRestore /> Restore
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {id && (
              <ConfirmButton title={`Delete "${name}"?`} description="It's removed from the app. The project folder on disk is kept." confirmLabel="Delete system" destructive onConfirm={remove}>
                <Button variant="outline" size="icon-sm" aria-label="Delete system" title="Delete system">
                  <Trash2 />
                </Button>
              </ConfirmButton>
            )}
            <Button size="sm" onClick={save} disabled={saving || (!dirty && !!id)} className={cn(dirty && "glow")}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Save system <Kbd className="ml-0.5 border-black/15 bg-black/10 text-black">Ctrl S</Kbd>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 px-8 py-6">
        {uiConfigEdited && id && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border-strong bg-surface-2 p-4">
            <TriangleAlert className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">UI-CONFIG.md was edited outside the app</p>
              <p className="text-sm text-muted-foreground">Keep the edits (read into this system as a new version) or overwrite the file from the app.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => resolveUiConfig("overwrite")}>
              Overwrite from app
            </Button>
            <Button size="sm" onClick={() => resolveUiConfig("keep")}>
              Keep my edits
            </Button>
          </div>
        )}
        {problems.length > 0 && (
          <div className="mb-6 rounded-2xl border border-border-strong bg-surface-2 p-4">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4" /> {problems.length} problem{problems.length === 1 ? "" : "s"} to fix before saving
            </p>
            <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted-foreground">
              {problems.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
              {problems.length > 6 && <li>…and {problems.length - 6} more</li>}
            </ul>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="mb-6 h-10 rounded-xl bg-card p-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="rounded-lg px-3 data-[state=active]:bg-white data-[state=active]:text-black">
                {t.label}
                {t.value === "semantic" && failing > 0 && (
                  <span className="ml-1 font-mono text-[0.65rem]" aria-label={`${failing} contrast failures`}>
                    ⚠{failing}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="colors">
            <ColorsTab tokens={tokens} settings={settings} update={update} />
            <BrandsPanel tokens={tokens} settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="semantic">
            <SemanticTab tokens={tokens} settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="typography">
            <TypographyTab tokens={tokens} update={update} />
          </TabsContent>
          <TabsContent value="spacing">
            <DimensionTab kind="spacing" tokens={tokens} update={update} />
          </TabsContent>
          <TabsContent value="radius">
            <DimensionTab kind="radius" tokens={tokens} update={update} />
          </TabsContent>
          <TabsContent value="shadows">
            <ShadowsTab tokens={tokens} update={update} />
          </TabsContent>
          <TabsContent value="breakpoints">
            <DimensionTab kind="breakpoints" tokens={tokens} update={update} />
          </TabsContent>
          <TabsContent value="motion">
            <MotionTab tokens={tokens} update={update} />
          </TabsContent>
          <TabsContent value="components">
            <ComponentsTab systemId={id} tokens={tokens} settings={settings} dirty={dirty} />
          </TabsContent>
          <TabsContent value="export">
            <ExportTab id={id} dirty={dirty} settings={settings} folder={folder} folderError={folderError} pluginManifest={initial.pluginManifest ?? null}
              brands={tokens.brands.map((b) => b.name)}
              name={name}
              figmaUrl={settings.figmaUrl}
              onReload={async () => {
                if (!id) return;
                const res = await fetch(`/api/systems/${id}`);
                if (res.ok) load(await res.json());
                router.refresh();
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <RegenerateDialog
        group={regen}
        onOpenChange={(o) => !o && setRegen(null)}
        ctx={{ systemId: id, name, brief, settings, tokens }}
        onApply={(next, usageId) => {
          setTokens(next);
          if (!id) usageIds.current.push(usageId);
          toast("Applied to the draft. Save to keep it.");
        }}
      />
      {id && (
        <HistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          systemId={id}
          current={tokens}
          onRestore={(v) => {
            setName(v.name);
            setSettings(v.settings);
            setTokens(v.tokens);
          }}
        />
      )}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} current={tokens} onApply={setTokens} />
      <SystemSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        brief={brief}
        settings={settings}
        tokens={tokens}
        onApply={(next) => {
          setBrief(next.brief);
          setSettings(next.settings);
          setTokens(next.tokens);
        }}
      />
    </div>
  );
}
