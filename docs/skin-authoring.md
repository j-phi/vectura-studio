# Skin Authoring Guide

> Add a new visual skin to Vectura Studio. The architecture lets you ship a complete re-skin with **one CSS file + one manifest entry** — no JavaScript edits required beyond the registry.

## TL;DR

```bash
npm run skin:new -- twilight
```

This generates `src/ui/skin/twilight.css` from the SDK template and prints the manifest snippet to paste into `src/config/defaults.js`. Edit the palette, paste the snippet, reload the app — done.

---

## Architecture (5-line summary)

The Vectura UI is themed via CSS custom properties on `:root`. A "skin" is a stylesheet that sets those properties, plus a registry entry describing the skin to the runtime.

- **Tokens** — CSS custom properties consumed by `components.css` and `renderer.js` via `getThemeToken()`.
- **Manifest** — registry entry in `window.Vectura.THEMES[id]`. Lives in `src/config/defaults.js`.
- **Stylesheet swap** — `src/ui/skin/skin-manager.js` swaps `<link id="active-skin">` `href` when `App.applyTheme()` runs, and pushes `manifest.cssVars` to `:root` synchronously to avoid a flash of unstyled content while the new file streams in.
- **Mode mirror** — `data-ui-skin="<id>"` on `<html>` lets selectors target a specific skin if needed (e.g., the petal-designer chrome lives behind `[data-ui-skin^="meridian"]`).

That's it. New skins do not require JS code.

---

## Step-by-step (using the SDK)

### 1. Generate the CSS file

```bash
npm run skin:new -- <skin-id>
```

The id must be lowercase kebab-case (`a-z`, `0-9`, `-`), starting with a letter. Examples: `twilight`, `arctic-blue`, `desert-rose`.

Optional flags:

- `--label "Display Name"` — what shows in the skin picker. Defaults to title-cased id.
- `--family <name>` — family slug (used to scope per-family CSS in `components.css`). Defaults to the prefix before the first dash, or the full id if no dash.
- `--force` — overwrite an existing `<id>.css`.

The script writes `src/ui/skin/<id>.css` and prints the manifest snippet to stdout.

### 2. Edit the palette

Open `src/ui/skin/<id>.css`. Every token in the file is required — the template is annotated with what each one controls. Edit the values to your palette.

Token groups (full list inside the template):

| Group | Tokens | Purpose |
|---|---|---|
| Surface | `--ui-bg`, `--ui-panel`, `--ui-panel-alt`, `--ui-border`, `--ui-border-hi` | Page + panel chrome |
| Text | `--ui-text`, `--ui-text-2`, `--ui-muted`, `--ui-formula` | Type tokens (primary/secondary/placeholder/value-readout) |
| Accent | `--ui-accent`, `--ui-accent-2`, `--ui-danger` | Brand + semantic |
| Controls | `--ui-ctrl`, `--ui-ctrl-hov`, `--ui-workspace`, `--slider-start` | Buttons/inputs/canvas |
| Shadow | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-pane` | 4 elevation stops |
| Tailwind RGB | `--vectura-{bg,panel,border,text,muted,accent,danger}-rgb` | Decomposed RGB triples for `bg-vectura-*` Tailwind utilities |
| Renderer | `--render-*` | Canvas rendering (selection handles, marquees, guides) |
| Designer | `--designer-*` | Petal/pattern designer chrome |
| Plotter | `--plotter-*` | Pens-panel preview visualization |

### 3. Register the manifest

Open `src/config/defaults.js`. Find the `window.Vectura.THEMES = { … }` block and paste the snippet the SDK printed. Adjust:

- `colorScheme` — `'dark'` or `'light'` (drives `prefers-color-scheme` and meta tag).
- `metaThemeColor` — hex used for the iOS Safari toolbar / Android Chrome address bar.
- `documentBg` — fallback document background applied before the stylesheet streams in.
- `pen1Color` — default Pen 1 color (matches the skin's contrast preference).
- `cssVars` — the *subset* of tokens pushed synchronously. Most skins only need the `--vectura-*-rgb` triples (which power Tailwind utilities). Other tokens load with the stylesheet.
- `manifest` — choose `CLASSIC_MANIFEST` (default geometry) or `MERIDIAN_MANIFEST` (Space Grotesk + JetBrains Mono fonts; meridian capabilities). You can also pass an inline object that extends one of those.

### 4. Reload + verify

Reload `index.html`. The skin should appear in the skin picker (top-right). Cycle to it. The Vectura chrome should paint with your palette.

If something looks broken, the most common causes are:

1. A typo in a token value (CSS silently falls through to defaults).
2. Mismatched `[data-ui-skin="<id>"]` selector — the auto-generated file wires this from your id; if you renamed the file, update the selector inside it too.

### 5. (Optional) Visual baselines

The visual regression suite (`npm run test:visual`) currently exercises `dark` / `light` / `lark`. New skins are not exercised by default — they're "additive." If you want a baseline, copy a visual test, point it at your skin id, and run `npm run test:update` to capture a new SVG baseline.

---

## What goes into `cssVars` vs the stylesheet?

**Rule of thumb:** synchronous (`cssVars`) for anything read by JS *before* the stylesheet finishes loading. Asynchronous (stylesheet) for everything else.

Specifically:

- **`cssVars`** — the `--vectura-*-rgb` triples (Tailwind utilities resolve these immediately on first paint), plus any token a renderer or compute-heavy path reads at startup. Keep this list **short** — every entry is a string, written via inline style on `<html>`.
- **Stylesheet** — everything else. `--ui-*`, `--render-*`, `--designer-*`, `--plotter-*`, and `--shadow-*` all live in the stylesheet. Stylesheet swap is one-frame fast in modern browsers, and `data-skin-swapping="true"` suppresses transitions during the swap to prevent visible flicker.

---

## Reduced-motion compliance

The skin system honors `prefers-reduced-motion: reduce` automatically. The shared `src/ui/skin/motion.css` includes a reduced-motion fallback for every keyframe (`thumb-release`, `fx-pulse-fill`, `btn-press`, `progress-indeterminate`) plus a universal `*, *::before, *::after` guard collapsing all animations + transitions to ≤0.01ms.

If your skin adds new keyframes (rare — most skins don't), add them to `motion.css` (not your skin file) and pair them with a reduced-motion fallback there.

---

## Family scoping

Some Phase 4 chrome (petal-designer, pattern-designer, touch-modifier-bar) is scoped to `[data-ui-skin^="meridian"]` so classic skins keep their existing look. If you're authoring a new family with bespoke chrome, you can:

1. Add a `[data-ui-skin^="<your-family>"]` block to `src/ui/skin/components.css` (preferred), or
2. Append family-specific selectors directly to your skin's `<id>.css`.

Family selectors should not redefine `--ui-*` tokens — those belong on the `:root` block. Use family selectors only when a chrome element fundamentally renders differently across families (e.g., a different button shape).

---

## Locked contracts

- **Skin ids are kebab-case lowercase** (validated by `skin-new.js` and `SkinManager.register`).
- **Manifests are immutable after registration** — `SkinManager.register` throws on duplicate id. Hot-reload during development requires a page refresh.
- **`vectura:skin-change` event fires once per `applyTheme` call**, one rAF after the stylesheet swap commits. Listen on `window`. Payload: `{ id, family, manifest, prevId }`.
- **`getThemeToken(name)`** (in `src/ui/ui.js`) caches per-skin lookups; the cache is invalidated on `vectura:skin-change`. New skins are picked up automatically.

---

## Migration: dropping a skin

Removing a registered skin: delete the manifest entry from `defaults.js`, `git rm src/ui/skin/<id>.css`, and check for hard-coded references via `rg "data-ui-skin=\"<id>\"" src/ tests/`. There is no SDK helper for this — it's a one-time edit.

---

## See also

- `plans.md` — the migration that introduced this SDK, with full architectural rationale.
- `src/ui/skin/_template.css` — the canonical token list.
- `src/ui/skin/skin-manager.js` — registration + activation + event dispatch.
- `src/config/defaults.js` — the THEMES registry.
