// End-to-end check against a running server (no AI calls): start blank → save → edit → save again →
// export pages + files. Screenshots go to e2e-output\.
//   node scripts/e2e.mjs [baseUrl]      (default http://127.0.0.1:5176)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://127.0.0.1:5176";
const out = path.resolve("e2e-output");
fs.mkdirSync(out, { recursive: true });

const browsers = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
];
const executablePath = browsers.find((p) => p && fs.existsSync(p));
if (!executablePath) throw new Error("No Chrome or Edge found.");

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
const step = (s) => console.log(`• ${s}`);

step("dashboard");
await page.goto(base);
await shot("01-dashboard");

step("new → start blank");
await page.goto(`${base}/new`);
await shot("02-new");
await page.getByRole("button", { name: "Start blank" }).click();
await page.getByLabel("Project name").fill("E2E Test System");
await shot("03-draft");

step("save (Ctrl+S)");
await page.keyboard.press("Control+s");
await page.waitForURL(/\/systems\/[\w-]+$/, { timeout: 15000 });
const id = page.url().split("/").pop();
await page.getByText("Saved", { exact: true }).waitFor();
console.log(`  saved as ${id}`);

step("edit brand base → dirty → save v2");
await page.getByLabel("Base hex").nth(1).fill("#0d9488");
await page.getByLabel("Base hex").nth(1).press("Enter");
await page.getByText("Unsaved changes").waitFor();
await shot("04-colors-edited");
await page.getByRole("button", { name: /Save system/ }).click();
await page.getByText("v2").waitFor({ timeout: 15000 });

for (const [tab, file] of [["Semantic", "05-semantic"], ["Typography", "06-typography"], ["Spacing", "07-spacing"], ["Shadows", "08-shadows"], ["Export", "09-export"]]) {
  step(`tab ${tab}`);
  await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
  await page.waitForTimeout(400);
  await shot(file);
}

step("export pages");
for (const p of ["colors", "typography", "spacing", "effects"]) {
  for (const mode of ["light", "dark"]) {
    const res = await page.request.get(`${base}/export/${id}/${p}?mode=${mode}`);
    if (!res.ok()) throw new Error(`export ${p} ${mode}: ${res.status()}`);
    const html = await res.text();
    if (html.includes("<script")) throw new Error(`export ${p} contains a script tag`);
  }
}
const ep = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await ep.goto(`${base}/export/${id}/colors?mode=light`);
await ep.screenshot({ path: path.join(out, "10-export-colors-light.png"), fullPage: true });
await ep.goto(`${base}/export/${id}/colors?mode=dark`);
await ep.screenshot({ path: path.join(out, "11-export-colors-dark.png"), fullPage: true });
await ep.goto(`${base}/export/${id}/typography?mode=light`);
await ep.screenshot({ path: path.join(out, "12-export-type.png"), fullPage: true });

step("files");
for (const f of ["tokens.json", "tokens.css", "tailwind.css", "UI-CONFIG.md", "all.zip"]) {
  const res = await page.request.get(`${base}/api/export/${id}/${f}`);
  if (!res.ok()) throw new Error(`${f}: ${res.status()}`);
  fs.writeFileSync(path.join(out, f), await res.body());
}
const sys = await (await page.request.get(`${base}/api/systems/${id}`)).json();
console.log(`  folder: ${sys.folder} ${sys.folderError ? `(error: ${sys.folderError})` : ""}`);
for (const f of ["UI-CONFIG.md", "tokens.json", "tokens.css", "tailwind.css", "export/colors-light.html", ".history/UI-CONFIG.v1.md"]) {
  if (!fs.existsSync(path.join(sys.folder, f))) throw new Error(`missing ${f} in project folder`);
}

step("hand-edit UI-CONFIG.md → keep my edits");
const cfg = path.join(sys.folder, "UI-CONFIG.md");
fs.writeFileSync(cfg, fs.readFileSync(cfg, "utf8").replace("| `space/4` | 16px |", "| `space/4` | 18px |"));
await page.reload();
await page.getByText("UI-CONFIG.md was edited outside the app").waitFor();
await shot("13-uiconfig-banner");
await page.getByRole("button", { name: "Keep my edits" }).click();
await page.getByText("v3").waitFor({ timeout: 15000 });
const after = await (await page.request.get(`${base}/api/systems/${id}`)).json();
const s4 = after.tokens.spacing.find((d) => d.name === "4");
if (s4.value !== 18) throw new Error(`keep edits: space/4 is ${s4.value}, expected 18`);

await browser.close();
if (errors.length) {
  console.log("Browser errors:\n" + errors.map((e) => `  ${e}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("OK — screenshots in e2e-output\\");
}
