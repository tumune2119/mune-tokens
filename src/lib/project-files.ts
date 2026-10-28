import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { toDtcg } from "./export/dtcg";
import { toTailwindCss, toTokensCss } from "./export/css";
import { toUiConfig } from "./export/ui-config";
import { EXPORT_PAGES, renderExportPage } from "./export/pages";
import { fontLinksFor } from "./export/fonts";
import { modesOf } from "./tokens/schema";
import type { SystemRecord } from "./types";
import type { ComponentSpec } from "./components/schema";

export const sha1 = (s: string) => createHash("sha1").update(s.replace(/\r\n/g, "\n")).digest("hex");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Temp file then rename. OneDrive can hold a lock for a moment, so retry a few times. */
async function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (i >= 6 || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
      await sleep(150 * (i + 1));
    }
  }
}

export function today() {
  return new Date().toLocaleDateString("sv-SE");
}

export function filesFor(rec: SystemRecord, components: ComponentSpec[] = []) {
  const meta = { name: rec.name, version: rec.version, settings: rec.settings };
  return {
    "UI-CONFIG.md": toUiConfig(rec.tokens, { ...meta, date: today(), brief: rec.brief, components }),
    "tokens.json": JSON.stringify(toDtcg(rec.tokens, meta), null, 2) + "\n",
    "tokens.css": toTokensCss(rec.tokens, meta),
    "tailwind.css": toTailwindCss(rec.tokens, meta),
  };
}

/** Every export page in every mode, as static HTML. */
export async function exportPagesFor(rec: SystemRecord, components: ComponentSpec[] = []) {
  const fontLinks = await fontLinksFor(rec.tokens);
  const out: Record<string, string> = {};
  for (const page of EXPORT_PAGES) {
    for (const mode of modesOf(rec.settings)) {
      out[`${page}-${mode}.html`] = renderExportPage(rec.tokens, page, mode, { name: rec.name, version: rec.version, settings: rec.settings, fontLinks, components });
    }
  }
  // Brands only change colours: one extra Colours page per brand and mode.
  for (const b of rec.tokens.brands) {
    for (const mode of modesOf(rec.settings)) {
      out[`colors-${mode}-${b.name}.html`] = renderExportPage(rec.tokens, "colors", mode, { name: rec.name, version: rec.version, settings: rec.settings, fontLinks, brand: b.name });
    }
  }
  return out;
}

/**
 * Writes the project folder: UI-CONFIG.md, tokens.json/.css, tailwind.css and export/*.html.
 * The previous UI-CONFIG.md is kept in .history\. Returns the hash of the UI-CONFIG.md written.
 */
export async function writeProjectFiles(rec: SystemRecord, folder: string, components: ComponentSpec[] = []): Promise<string> {
  const files = filesFor(rec, components);
  const current = path.join(folder, "UI-CONFIG.md");
  if (fs.existsSync(current)) {
    const prev = fs.readFileSync(current, "utf8");
    const v = prev.match(/^Version (\d+)/m)?.[1] ?? "old";
    const hist = path.join(folder, ".history", `UI-CONFIG.v${v}.md`);
    if (!fs.existsSync(hist)) {
      fs.mkdirSync(path.dirname(hist), { recursive: true });
      fs.writeFileSync(hist, prev, "utf8");
    }
  }
  for (const [name, content] of Object.entries(files)) await atomicWrite(path.join(folder, name), content);
  const pages = await exportPagesFor(rec, components);
  for (const [name, content] of Object.entries(pages)) await atomicWrite(path.join(folder, "export", name), content);
  return sha1(files["UI-CONFIG.md"]);
}

export type UiConfigState = { state: "ok" } | { state: "missing" } | { state: "edited"; text: string };

export function checkUiConfig(folder: string | null, hash: string | null): UiConfigState {
  if (!folder || !hash) return { state: "ok" };
  const file = path.join(folder, "UI-CONFIG.md");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { state: "missing" };
  }
  return sha1(text) === hash ? { state: "ok" } : { state: "edited", text };
}

export function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 48) || "system"
  );
}
