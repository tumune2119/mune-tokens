"use client";

import { useState } from "react";
import { Copy, Download, ExternalLink, FileArchive, FolderOpen, Layers, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/kbd";
import { Segmented } from "@/components/system-browser";
import { SectionHead } from "./controls";
import { FigmaBuild } from "./figma-build";
import { EXPORT_PAGES, PAGE_LABELS, type ExportPage } from "@/lib/export/pages";
import { modesOf, type Mode, type SystemSettings } from "@/lib/tokens/schema";
import { celebrate } from "@/lib/client/confetti";

const FILES = [
  { file: "tokens.json", label: "tokens.json", hint: "W3C Design Tokens — for the Figma importer" },
  { file: "tokens.css", label: "tokens.css", hint: "CSS custom properties" },
  { file: "tailwind.css", label: "tailwind.css", hint: "Tailwind v4 @theme" },
  { file: "UI-CONFIG.md", label: "UI-CONFIG.md", hint: "Give this to the AI that builds the app" },
] as const;

export function exportUrl(id: string, page: ExportPage, mode: Mode, brand?: string | null) {
  return `${window.location.origin}/export/${id}/${page}?mode=${mode}${brand ? `&brand=${encodeURIComponent(brand)}` : ""}`;
}

/** Records the export; the very first one for a system gets the confetti. */
export async function logExport(id: string, kind: string) {
  try {
    const res = await fetch(`/api/systems/${id}/export-log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
    if ((await res.json()).first) celebrate();
  } catch {}
}

export async function openInBrowser(id: string, page: ExportPage, mode: Mode, brand?: string | null) {
  const res = await fetch("/api/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: exportUrl(id, page, mode, brand) }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't open the browser");
  logExport(id, `open:${page}`);
}

export async function openFolder(id: string) {
  const res = await fetch("/api/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: "system", systemId: id }) });
  if (!res.ok) toast.error((await res.json().catch(() => null))?.error ?? "Couldn't open the folder");
}

export async function copyUiConfig(id: string) {
  const res = await fetch(`/api/export/${id}/UI-CONFIG.md`);
  if (!res.ok) return toast.error("Couldn't build the UI config.");
  await navigator.clipboard.writeText(await res.text());
  toast("UI config copied — paste it into your AI chat.");
}

export function ExportTab({
  id,
  dirty,
  settings,
  folder,
  folderError,
  pluginManifest,
  brands = [],
  name,
  figmaUrl,
  onReload,
}: {
  id: string | null;
  dirty: boolean;
  settings: SystemSettings;
  folder: string | null;
  folderError: string | null;
  pluginManifest: string | null;
  /** Extra brand names; pages can be opened per brand. */
  brands?: string[];
  name: string;
  figmaUrl: string;
  /** Re-read the saved system (Build in Figma stores the file link). */
  onReload: () => void;
}) {
  const [brand, setBrand] = useState<string>("default");
  const activeBrand = brands.includes(brand) ? brand : null;
  const modes = modesOf(settings);
  const [mode, setMode] = useState<Mode>(modes[0]);
  const activeMode = modes.includes(mode) ? mode : modes[0];

  if (!id) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Save the system to export it</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Export pages and files are built from the saved version. Press <Kbd>Ctrl S</Kbd> or click Save system.
        </p>
      </div>
    );
  }

  const run = (fn: () => Promise<unknown>) => fn().catch((e) => toast.error((e as Error).message));
  const download = (href: string, kind: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.click();
    logExport(id, kind);
  };

  return (
    <div className="space-y-10">
      {dirty && (
        <p className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-sm">
          <TriangleAlert className="size-4 shrink-0" />
          You have unsaved changes. Pages and files show the last saved version — save first to include them.
        </p>
      )}

      <section>
        <SectionHead
          title="Export pages"
          description="Clean 1440px pages for html.to.design. Open one in your browser, then capture it with the extension or the Figma plugin."
          actions={
            <>
              {brands.length > 0 && (
                <Segmented value={activeBrand ?? "default"} onChange={setBrand} options={["default", ...brands].map((b) => ({ value: b, label: b }))} />
              )}
              {modes.length > 1 && (
                <Segmented value={activeMode} onChange={setMode} options={modes.map((m) => ({ value: m, label: m === "light" ? "Light" : "Dark" }))} />
              )}
            </>
          }
        />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {EXPORT_PAGES.map((page) => (
            <div key={page} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0">
                <p className="font-medium">{PAGE_LABELS[page]}</p>
                <p className="truncate font-mono text-xs text-subtle-foreground">
                  /export/{id}/{page}?mode={activeMode}
                  {activeBrand && `&brand=${activeBrand}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" onClick={() => run(() => openInBrowser(id, page, activeMode, activeBrand))}>
                  <ExternalLink /> Open in browser
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Copy URL"
                  title="Copy URL"
                  onClick={() => run(async () => (await navigator.clipboard.writeText(exportUrl(id, page, activeMode, activeBrand)), toast("URL copied")))}
                >
                  <Copy />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Download HTML" title="Download HTML" onClick={() => download(`/export/${id}/${page}?mode=${activeMode}${activeBrand ? `&brand=${activeBrand}` : ""}&download=1`, `html:${page}`)}>
                  <Download />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => run(async () => {
              for (const p of EXPORT_PAGES) await openInBrowser(id, p, activeMode, activeBrand);
            })}
          >
            <Layers /> Open all pages ({activeMode})
          </Button>
          <Button variant="outline" size="sm" onClick={() => download(`/api/export/${id}/all.zip`, "zip")}>
            <FileArchive /> Download everything (.zip)
          </Button>
        </div>
      </section>

      <section>
        <SectionHead title="Files" description="Also written to the project folder on every save." />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {FILES.map((f) => (
            <div key={f.file} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="min-w-0">
                <p className="font-mono text-sm">{f.label}</p>
                <p className="truncate text-xs text-muted-foreground">{f.hint}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {f.file === "UI-CONFIG.md" && (
                  <Button size="sm" variant="outline" onClick={() => run(() => copyUiConfig(id))}>
                    <Copy /> Copy
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => download(`/api/export/${id}/${f.file}`, `file:${f.file}`)}>
                  <Download /> Download
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
          <FolderOpen className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">Project folder</p>
            <p className="truncate font-mono text-xs text-subtle-foreground" title={folder ?? undefined}>
              {folder ?? "Written on first save"}
            </p>
            {folderError && (
              <p className="mt-1 flex items-center gap-1.5 text-xs">
                <TriangleAlert className="size-3.5" /> Last write failed: {folderError}
              </p>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => openFolder(id)}>
            <FolderOpen /> Open folder
          </Button>
        </div>
      </section>

      <FigmaBuild id={id} name={name} figmaUrl={figmaUrl} dirty={dirty} onBuilt={onReload} />

      <section>
        <SectionHead
          title="Into Figma by hand"
          description="Or do it yourself: the importer plugin creates the same variables, styles and components; html.to.design brings in the reference pages."
          actions={
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(`${window.location.origin.replace("//127.0.0.1", "//localhost")}/api/figma/${id}`);
                  toast("Figma link copied — paste it into the MUNE Tokens Importer plugin.");
                  logExport(id, "figma-link");
                })
              }
            >
              <Copy /> Copy Figma link
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5">
            <p className="font-medium">MUNE Tokens Importer plugin</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Variables (Primitives, Semantic with Light/Dark, Dimensions) with aliases, text and effect styles, and Ready components as component sets bound to those variables. Re-running updates in place.</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground marker:font-mono marker:text-subtle-foreground">
              <li>
                One time, in Figma desktop: <span className="text-foreground">Plugins → Development → Import plugin from manifest…</span> and pick
                {pluginManifest ? (
                  <button
                    className="mt-1 block max-w-full truncate rounded-md bg-surface-2 px-2 py-1 text-left font-mono text-[0.7rem] text-foreground hover:bg-surface-3"
                    title="Copy path"
                    onClick={() => run(async () => (await navigator.clipboard.writeText(pluginManifest), toast("Path copied")))}
                  >
                    {pluginManifest}
                  </button>
                ) : (
                  <span className="font-mono"> figma-plugin\manifest.json</span>
                )}
              </li>
              <li>
                <span className="text-foreground">Copy Figma link</span> (top right), run the plugin, paste it, Load, Import. Keep MUNE TOKENS running.
              </li>
              <li>No connection? Choose <span className="font-mono">tokens.json</span> in the plugin instead (variables and styles only).</li>
            </ol>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <p className="font-medium">html.to.design</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Pixel-exact frames of the export pages, for documentation.</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground marker:font-mono marker:text-subtle-foreground">
              <li>
                <span className="text-foreground">Open in browser</span> on a page above — it opens outside this window.
              </li>
              <li>Capture it with the html.to.design extension, or paste the URL into its Figma plugin. Do each mode separately.</li>
              <li>Component cells carry data-component / data-variant in Figma&apos;s variant naming.</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
