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

You can attach images and PDFs to the brief: a logo, screenshots or brand guidelines (up to 6). Claude takes the brand colours and the type and mood from them. Large images are scaled down to 1568px first. The component planner accepts screenshots and PRD PDFs the same way. Attachments work with both the API key and the CLI.

## Tokens

Each system has these token groups:

- colour ramps, plus semantic colours with Light and Dark values
- typography
- spacing, radius, shadows and breakpoints
- **motion:** durations and cubic-bezier easings
- **brands:** alternative brands that swap some ramps (for example a sub-brand's colour) and share everything else

Every save keeps a snapshot. **Version history** (the clock button in the system header) shows a token-by-token diff against your draft and can restore any earlier version into the draft.

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
| Project folders | `Documents\Design Systems\<project>\` (changeable in Settings) |
| Server log (launcher) | `logs\server.log` |

Each save rewrites the project folder with `UI-CONFIG.md`, `tokens.json` (W3C DTCG), `tokens.css`, `tailwind.css` (Tailwind v4) and `export\*.html`. The previous `UI-CONFIG.md` is kept in `.history\`. If you edit `UI-CONFIG.md` by hand, the app notices and asks whether to **keep your edits** (read back in as a new version) or **overwrite** the file.

## Visual styles

New system (and System settings) has a **Visual style** picker with 30 styles, from Minimalism and Swiss Design to Neo-Brutalism, Claymorphism, Y2K, Pixel Art, Aurora and Wabi-Sabi. Pick one, or two to blend (the first is the base). Each style carries concrete rules for colour, type (Google Fonts), radius, shadows, spacing, motion and components. Claude follows them when it generates or regenerates tokens and writes component specs, and UI-CONFIG.md passes them on to whoever builds the app. The library lives in `src/lib/styles.ts`.

**Avoid the generic AI look** (on by default) steers away from the common tells of AI-made UI: Inter/Geist/Space Grotesk, purple-on-black, glow orbs, sparkle icons and emojis, three identical feature cards, fake testimonials, em-dash copy and so on. A style you pick on purpose wins where they overlap.

## Build in Figma

Give the system a **Project name** when you create it (or rename it in the editor header). That name is used everywhere: the Figma file, its cover, the project folder and the exports.

In a system, go to **Export → Build in Figma** and click **Create Figma file**. Claude Code creates a new file in your Figma drafts (or the team you pick) named after the project. It adds **Cover**, **Design System** and **Components** pages and imports the variables, styles and Ready components, the same as the plugin below would. Then it checks the result and links the file. **Update Figma file** runs it again on the same file. It runs on your Claude subscription and uses no Figma AI credits.

Claude reaches Figma through the **Figma connector** on your Claude account. The card shows which Figma account is connected (name and email) and lets you pick the team under **Create files in**. If it says Figma isn't connected, connect Figma at claude.ai → Settings → Connectors, then click **Check again**.

**Rewrite spec** (Components tab) takes optional notes for Claude, for example "pill shape, add a loading state".

## Into Figma by hand

**MUNE Tokens Importer** is a private development plugin in `figma-plugin/`. It isn't published and costs nothing to run.

1. One time, in Figma desktop: **Plugins → Development → Import plugin from manifest…** and pick `figma-plugin\manifest.json`.
2. In a system, go to **Export → Copy Figma link**. Run the plugin, paste the link, then click **Load** and **Import**. MUNE TOKENS must be running.

The plugin creates the following, and running it again updates everything in place:

- **Primitives** (hidden from pickers), **Semantic** (Light and Dark modes, aliasing the primitives) and **Dimensions** (space, radius, breakpoints) variable collections.
- Text styles and effect styles.
- A component set per Ready component on a **Components** page. Fills, strokes, padding, gap, radius and size are bound to the variables, and text and shadows use the styles.
- With brands: Primitives gets one mode per brand. Motion becomes `motion/duration/*` (number) and `motion/easing/*` (text) variables.
- A **Design System** page that documents the whole system:
  - primitives for each brand
  - semantic colours in Light and Dark side by side
  - type samples, spacing, radius, motion and shadows
  - one instance of each component

  Everything on it is bound to the file's variables and styles.

If the plugin can't reach the app, choose `tokens.json` in the plugin instead. That imports variables and styles only. If your Figma plan allows only one mode per collection, Dark values go into a separate "Semantic (Dark)" collection.

**Round trip.** To bring Figma changes back into the app:

1. In the plugin, use **Export from Figma**. It saves the file's variables and styles as tokens JSON.
2. In the app, use **⋯ → Import from Figma / JSON…**. You see a token-level diff before anything is applied.

Figma doesn't store which background a text colour is meant to sit on, so re-check those pairings after an import.

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
| `J` / `K` (or `↓` / `↑`) | Move between tokens in the current tab |
| `E` | Edit the focused token |
| `Ctrl Enter` | Generate (on the brief) |
| `Esc` | Cancel generation / close dialog |

## Licence

MIT
