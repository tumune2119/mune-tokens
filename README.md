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

## Components

In a saved system, open the **Components** tab and choose **Plan from project idea**. Describe the product (you can attach a PRD, user flows or a MUNE TASKS plan). Claude then lists the components it needs, grouped as foundations, primitives, composites and product-specific. Each item shows why it's needed, its variants and states, and an estimated cost. Untick what you don't want, then add the rest to the library.

Specs are written **one component per AI call**, so a bad answer only retries that one. Each spec defines:

- **Anatomy:** the named parts.
- **Variant properties and states.**
- **Token bindings:** which token each part uses, for each variant and state.
- **Accessibility and content rules.**

Token names are checked against the system before a spec is accepted.

Each component renders as a full variant × state grid built only from token values. You can **Revise** with AI (you see a preview and its cost before applying), edit the JSON by hand, and set its status: Draft, Ready or Exported. **Ready** components go into `UI-CONFIG.md`, the Components export page and the Figma plugin.

## Where things live

| What | Where |
|---|---|
| Database | `data\mune-tokens.db` (override with `MUNE_TOKENS_DB_PATH`) |
| Project folders | `Documents\MUNE Tokens\<system>\` (changeable in Settings) |
| Server log (launcher) | `logs\server.log` |

Each save rewrites the project folder with `UI-CONFIG.md`, `tokens.json` (W3C DTCG), `tokens.css`, `tailwind.css` (Tailwind v4) and `export\*.html`. The previous `UI-CONFIG.md` is kept in `.history\`. If you edit `UI-CONFIG.md` by hand, the app notices and asks whether to **keep your edits** (read back in as a new version) or **overwrite** the file.

## Into Figma

**MUNE Tokens Importer** is a private development plugin in `figma-plugin/`. It isn't published and costs nothing to run.

1. One time, in Figma desktop: **Plugins → Development → Import plugin from manifest…** and pick `figma-plugin\manifest.json`.
2. In a system, go to **Export → Copy Figma link**. Run the plugin, paste the link, then click **Load** and **Import**. MUNE TOKENS must be running.

The plugin creates the following, and running it again updates everything in place:

- **Primitives** (hidden from pickers), **Semantic** (Light and Dark modes, aliasing the primitives) and **Dimensions** (space, radius, breakpoints) variable collections.
- Text styles and effect styles.
- A component set per Ready component on a **MUNE Components** page. Fills, strokes, padding, gap, radius and size are bound to the variables, and text and shadows use the styles.

If the plugin can't reach the app, choose `tokens.json` in the plugin instead. That imports variables and styles only. If your Figma plan allows only one mode per collection, Dark values go into a separate "Semantic (Dark)" collection.

For pixel-exact reference frames, use **Open in browser** on any export page and capture it with html.to.design. Capture each mode separately.

To type-check the plugin: `npx tsc -p figma-plugin`.

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
