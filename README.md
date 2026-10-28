# MUNE TOKENS

A local-first design-system builder for Windows. Define colours, typography, spacing, radius, shadows and breakpoints by hand or with Claude, preview them as clean 1440px pages, then bring them into Figma with html.to.design. You don't spend Figma AI credits.

Part of the MUNE family (MUNE Splits, MUNE TASKS, MUNE UX). Dark mode only, monochrome chrome: the only colour on screen is your own tokens.

## Run it

- **Desktop:** run `powershell -ExecutionPolicy Bypass -File .\create-shortcut.ps1` once, then use the **MUNE TOKENS** desktop shortcut. It installs dependencies when the lockfile changes, rebuilds when sources change, starts the server on `127.0.0.1:5176` and opens an app window. Closing the last window stops the server.
- **Dev:** `npm run dev` (port 5177).
- **Checks:** `npm run typecheck`, `npm run lint`, and `npm run e2e -- http://127.0.0.1:5176` (drives the UI in headless Chrome; no AI calls; screenshots go to `e2e-output\`).

## AI

The provider is set in Settings and defaults to **Auto**. Auto uses `ANTHROPIC_API_KEY` from `.env.local` if one is set. Otherwise it uses the Claude Code CLI on your subscription, found on PATH, in `~/.local/bin`, or in the VS Code extension.

AI is always optional: you can start blank or import a tokens JSON instead. Every response is checked against a schema and retried once with the errors fed back. Each request is logged on the Usage page.

The model picks only a **base colour** for each ramp. The app then builds the steps in OKLCH so they look evenly spaced, which keeps output short and cheap.

## Where things live

| What | Where |
|---|---|
| Database | `data\mune-tokens.db` (override with `MUNE_TOKENS_DB_PATH`) |
| Project folders | `Documents\MUNE Tokens\<system>\` (changeable in Settings) |
| Server log (launcher) | `logs\server.log` |

Each save rewrites the project folder with `UI-CONFIG.md`, `tokens.json` (W3C DTCG), `tokens.css`, `tailwind.css` (Tailwind v4) and `export\*.html`. The previous `UI-CONFIG.md` is kept in `.history\`. If you edit `UI-CONFIG.md` by hand, the app notices and asks whether to **keep your edits** (read back in as a new version) or **overwrite** the file.

## Into Figma

1. In a system, go to **Export → Open in browser**. The page opens in your default browser.
2. Capture it with the html.to.design extension or plugin. Capture each mode separately.
3. For real Figma variables (collections, Light/Dark modes, aliases), import `tokens.json` with a DTCG importer such as Tokens Studio. The MUNE Tokens Importer plugin is planned for v0.2.

## Keyboard

| Key | Action |
|---|---|
| `N` | New system |
| `/` | Search |
| `Ctrl S` | Save system |
| `G` | Regenerate the current group with AI |
| `O` | Open the current group's export page in the browser |
| `Ctrl Enter` | Generate (on the brief) |
| `Esc` | Cancel generation / close dialog |

## Licence

MIT
