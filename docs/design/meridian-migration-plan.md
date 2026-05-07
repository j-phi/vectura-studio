# Meridian Blue Skin Migration — Implementation Plan

> Refines an earlier draft. Honors three user decisions: (1) `themes-mockup.html` is the spec, (2) keep Tailwind and re-skin via tokens, (3) execute the full 5-phase rewrite. Tightens scope, fixes assumptions that don't match the codebase, and adds a dependency diagram.

---

## Status

| Phase | Status | Commit |
|---|---|---|
| **Phase −1** — Mockup provenance | ✅ done | `7d9f426` |
| **Phase 0** — Skin foundation | ✅ done | `7d9f426` (+ graphify rebuild `e442a4b`) |
| **Phase 1** — Component library | ✅ done | `16ec81d` `440c84a` `d959a9b` `554ee88` `65791e5` `c7fa0db` |
| **Phase 2** — Shell, panels, orchestrator | ✅ done | `a16ad57` `313d427` `7ca4795` `5c2edcc` `3a8b7be` `2692993` `2de5154` `c28bb4a` `c841598` `f377edb` `886499b` `ede23da` `8eddbf4` `360cbdc` `540dad5` `c98e9db` `243eccf` `56848c9` `e0bae17` `accfd99` `5529209` `562f9b2` `9628561` |
| **Phase 3** — Modals, overlays, menus | ⏳ in progress (7/7 modals done; menus + mixin dissolution + browser smoke remain) | `ff783c5` `6f277ba` `af0fd16` `bb36595` `4ca409a` `5ba54f9` `45f3c8c` |
| **Phase 4** — Editors & specialized surfaces | ⏳ pending | — |
| **Phase 5** — Polish, SDK, cleanup | ⏳ pending | — |

**Where work lives:** `/Users/jayphi/Documents/github/vectura-studio-meridian` (worktree on branch `meridian-blue-skin`). Main repo at `/Users/jayphi/Documents/github/vectura-studio` is untouched on `main`.

**Picking up the plan:** read this document, then `git log --oneline meridian-blue-skin` for done-work context. After Phase 0, all five existing skins (`dark`, `light`, `lark`, `meridian-dark`, `meridian-light`) load and swap; `dark`/`light`/`lark` are visually byte-identical to pre-migration; `meridian-*` paint correctly but the DOM still uses today's classes (Phase 2 changes that).

### Phase wrap-up protocol (mandatory)

Every time a phase reaches "done" — last commit landed, all required tests green per the [Testing Matrix](../../CLAUDE.md#testing-matrix) — Claude **must** run this seven-step closeout before declaring the phase complete to the user. Skipping any step strands the next session: it'll re-derive state from commit messages and likely diverge from the plan.

1. **Verify the suite.** Run the change-class minimum from `CLAUDE.md`'s Testing Matrix. For Phase work, that's at least `npm run test:unit && npm run test:integration`; for phases that touch rendering or shell DOM, also `npm run test:visual` and `npm run test:perf`. Record the green totals — they go into step 4.
2. **Update the Status table** at the top of `docs/design/meridian-migration-plan.md`: flip the just-finished phase from `⏳` to `✅`, list every phase commit SHA in the Commit column (oldest first), and mark the next phase as `⏳ next`.
3. **Append a "Phase N actuals" note** immediately above the next phase's `### Phase N+1: ...` heading. Capture: what files actually shipped, deviations from the planned spec (component count, file moves, additions, deletions), test totals before → after, and anything the next phase must know about. Be specific — mention class names, helper function names, locked contracts.
4. **Rewrite the "Resuming from Phase N-1" appendix** as "Resuming from Phase N". Step-by-step instructions tailored to this exact branch state: include the latest-commit SHA the next session should expect at HEAD, the specific test command to confirm green, the exact first move (e.g. "extract X into Y, write compile-gate test before extracting predicates"), and any deferred-from-prior-phase items that become mandatory now.
5. **Update the memory file** at `/Users/jayphi/.claude/projects/-Users-jayphi-Documents-github-vectura-studio/memory/project_meridian_migration.md` so a fresh-context Claude reading the memory pointer (before opening the plan) sees current state. Keep the "Done as of <ISO date>" line accurate, the "Pending" list trimmed, and the "How to apply" line pointed at the latest resume appendix.
6. **Commit the doc + memory update** as a single `docs(skin):` commit. Memory lives outside the repo so commit only the plan; mention the memory refresh in the commit body.
7. **Tell the user, verbatim:**
   > Phase N is complete and committed. You can preview the worktree at `file:///Users/jayphi/Documents/github/vectura-studio-meridian/index.html` (no server needed — just open in a browser). Recommend you `/clear` to start a fresh context window — the plan and memory are updated so the next session can pick up cleanly. To resume, type: **`continue the Meridian migration`** (or **`begin Phase N+1`**).

The protocol exists because the plan is too detailed to reconstruct from commit messages — and the user has explicitly asked for this closeout after every phase. Don't skip steps "for brevity"; the next Claude won't have the context you do.

**Test status as of Phase 0:** 416 unit + integration passed, 13 visual passed (0-px diff vs pre-migration baselines), 2 perf passed.

---

## 0. Context

Vectura Studio's UI lives in:

- `src/ui/ui.js` (16,288 lines) — a single `class UI` orchestrating every panel, control, modal, menu, and animation. All 17 algorithm parameter schemas are inline as `CONTROL_DEFS` at line 2196 and assigned to `this.controls` at line 6441. `buildControls()` at line 12729 reads them and rebuilds the dynamic-controls container.
- `src/ui/ui-{noise-rack,petal-designer,pattern-designer,auto-colorize,fill-panel,file-io,touch,document-units,randomization}.js` — nine satellite modules already extracted.
- `index.html` (793 lines, 41–725 are app body) — Tailwind via CDN with custom `vectura-*` color utilities resolved from CSS variables.
- `styles.css` (3,964 lines) — custom CSS layered on top of Tailwind, themed via `--color-*` and `--vectura-*-rgb` variables.
- `src/app/app.js:422` — `applyTheme()` already implements: write `data-theme` attribute, push the active theme's `cssVars` map to `document.documentElement.style`, persist to cookie, refresh UI. The `dark/light/lark` theme registry lives at `src/config/defaults.js:55` (`window.Vectura.THEMES`).
- `src/render/renderer.js` (4,829 lines) reads theme tokens via a small `getThemeToken('--color-*')` cache (`src/ui/ui.js:182`).

**Goal:** ship a fourth visual skin ("Meridian Blue") matching `themes-mockup.html` pixel-near, by (a) extending the existing theme registry into a multi-skin "Skin Registry," (b) decomposing `ui.js` into one-component-per-file so the new design language can be authored coherently, and (c) preserving every behavior already shipping. Tailwind stays; new skins override the `vectura-*` token RGBs and add Meridian-specific component classes loaded from a swappable stylesheet.

**Mockup source (resolved):** the user provided `themes-mockup.html` contents during planning. Phase −1's first action is to commit those contents verbatim to `docs/design/themes-mockup.html` so the implementing engineer has the on-disk reference. Concrete facts read from the mockup that anchor this plan:

- Single skin family ("Meridian Blue") with two modes: `data-mode="dark"` and `data-mode="light"` toggled via the floating bottom switcher.
- Mockup is 100% bespoke CSS (no Tailwind). Fonts: `Space Grotesk` (UI) + `JetBrains Mono` (mono/values).
- Pane widths: `--pane-left-width: 290px`, `--pane-right-width: 258px`, `--bottom-pane-height: 148px`, `--row-height: 30px`.
- Dark accent `#4e9ee1`; light accent `#0e6fe0`; slider gradient starts at `#80c4f0` (dark) / `#60b0f0` (light).
- Section header has a 3×14 px `::before` left-accent bar in `--ui-accent` (opacity 0.45 → 1 on hover) — frequently missed; record as a required detail.
- Mockup's section collapse uses `display: none` (instant). The new design language UPGRADES this to an animated `max-height` collapse (220 ms cubic-bezier(0.22,1,0.36,1)), per the draft's R-C1.
- Animation timings (verbatim from mockup):
  - `fx-pulse-fill`: 0.55 s ease-out, peak opacity 0.36 at 12% keyframe, 4 px white box-shadow halo.
  - `thumb-release`: 0.35 s ease-out, halo `0 0 0 7px var(--ui-accent-2)` → `0 0 0 0`.
  - `btn-press`: 0.30 s ease-out, opacity 1 → 0.42 → 1.
  - `dial-wave` (rAF): 520 ms, easing `1 - (1 - p)^2.5`, r `1 → 25`, stroke-width `1.4 → 0.4`, opacity `0.63 → 0`, clipped via `<clipPath id="dial-face-clip">` per dial.
- Pen sliders are 3 px tall (vs 4 px main sliders).
- Estimation stats live inside the Pens tab (not a separate panel).

---

## 1. What's Reused (do not rebuild)

| Existing | File:line | Used as |
|---|---|---|
| `window.Vectura.THEMES` registry | `src/config/defaults.js:55` | Skin manifest store. Add `meridian-dark` / `meridian-light` entries; rename `dark`/`light`/`lark` → `classic-dark`/`classic-light`/`lark` (keep aliases). |
| `App.applyTheme()` | `src/app/app.js:422` | Skin activation. Add the swappable `<link>` + `data-skin-swapping` 60ms transition-suppression behavior into this method; rename to `applySkin` with `applyTheme` alias. |
| `App.toggleTheme()` cycle | `src/app/app.js:483` | Replace with cycle through registered skins. |
| `CONTROL_DEFS` literal | `src/ui/ui.js:2196` | Extracted unchanged into `src/ui/controls-registry.js`. Keep the `showIf`, `noiseKey`, `inlineEditor`, `infoKey` metadata. |
| `buildControls()` | `src/ui/ui.js:12729` | Pulled into `src/ui/panels/algo-config-panel.js`; identical behavior, components from new library. |
| `ui-noise-rack.js`, `ui-fill-panel.js`, `ui-auto-colorize.js`, `ui-petal-designer.js`, `ui-pattern-designer.js`, `ui-touch.js`, `ui-randomization.js`, `ui-document-units.js`, `ui-file-io.js` | `src/ui/*` | Stay where they are. New panels delegate into them. Re-skinned only — no internal rewrites. |
| `getThemeToken()` cache | `src/ui/ui.js:182` | Promote to `src/ui/skin/tokens.js`; renderer & UI continue calling the same API. |
| Tailwind `vectura-*` palette in `index.html:24-34` | as-is | Skin's job is to overwrite the underlying `--vectura-*-rgb` variables. No HTML class changes needed for color. |
| `data-theme` attribute on `<html>` | `src/app/app.js:437` | Renamed to `data-ui-skin`. CSS selectors for current themes update with it. |
| `tests/` directory | existing | Vitest unit/integration/visual/perf + Playwright e2e harness already exists. Add new tests in same locations. |

The "skin manifest" is an **extension** of the existing theme entry, not a parallel structure. Each entry adds a few new fields (`family`, `paneLeftWidth`, `paneRightWidth`, `motion`, `capabilities`) — `applyTheme` already iterates `cssVars` and writes them to `:root`, so the addition is one extra `Object.entries(theme.motion)` loop and one stylesheet `<link>` swap.

---

## 2. Architecture (Refined)

```mermaid
flowchart TB
    subgraph IDX["index.html (Tailwind CDN, mount point)"]
        ROOT[/"#app-root"/]
        SKINLINK[/"link#active-skin (swappable)"/]
    end
    subgraph CONFIG["src/config/"]
        THEMES["defaults.js<br/>window.Vectura.THEMES<br/>(adds meridian-* + manifest fields)"]
    end
    subgraph SKIN["src/ui/skin/"]
        TOKENS["tokens.css (defaults)"]
        COMP["components.css (skin-agnostic structure)"]
        MOTION["motion.css (@keyframes library)"]
        SKINMGR["skin-manager.js<br/>(extends App.applyTheme)"]
        MERIDIAN["meridian-dark.css / -light.css"]
        CLASSIC["classic-dark.css / -light.css / lark.css<br/>(legacy palettes, alias --color-* to --ui-*)"]
    end
    subgraph UI["src/ui/ (rewritten)"]
        ORCH["ui.js (orchestrator, ~600 LOC)"]
        SHELL["shell/* (header, panes, workspace, bottom)"]
        COMPS["components/* (slider, dial, section, ...)"]
        OVERLAYS["overlays/* (modal, toast, tooltip, menu)"]
        PANELS["panels/* (algorithm, layers, pens, ...)"]
        MODALS["modals/* (doc-setup, color, export, ...)"]
        REG["controls-registry.js<br/>(extracted from ui.js:2196)"]
    end
    subgraph LEGACY["preserved as-is"]
        PETAL["ui-petal-designer.js"]
        PATTERN["ui-pattern-designer.js"]
        NOISE["ui-noise-rack.js"]
        FILL["ui-fill-panel.js"]
        AUTOCOL["ui-auto-colorize.js"]
        FILEIO["ui-file-io.js"]
        TOUCH["ui-touch.js"]
        RAND["ui-randomization.js"]
        UNITS["ui-document-units.js"]
    end
    subgraph CORE["untouched"]
        ENGINE["engine.js"]
        RENDERER["renderer.js (just reads --ui-*)"]
        ALGOS["core/algorithms/*"]
    end

    THEMES -->|manifest| SKINMGR
    SKINMGR -->|swap href| SKINLINK
    SKINMGR -->|set data-ui-skin| ROOT
    MERIDIAN -.->|loaded when active| SKINLINK
    CLASSIC -.->|loaded when active| SKINLINK
    TOKENS --> ROOT
    COMP --> ROOT
    MOTION --> ROOT
    ORCH --> SHELL
    ORCH --> SHELL
    SHELL --> PANELS
    PANELS --> COMPS
    PANELS --> REG
    PANELS --> NOISE
    PANELS --> FILL
    PANELS --> AUTOCOL
    MODALS --> COMPS
    MODALS --> OVERLAYS
    ORCH --> MODALS
    ORCH -->|mounts inline| PETAL
    ORCH -->|mounts inline| PATTERN
    ORCH -->|delegates I/O| FILEIO
    ORCH -->|delegates touch| TOUCH
    ORCH --> RAND
    ORCH --> UNITS
    ORCH -->|reads/writes| ENGINE
    ORCH -->|reads/writes| RENDERER
    RENDERER -.->|getThemeToken| TOKENS
```

### 2.1 Tailwind Interop (per user decision: keep Tailwind)

The mockup itself uses zero Tailwind. The implementer's job is to bridge the existing Tailwind+`vectura-*` infrastructure to the mockup's bespoke component CSS.

- `index.html` retains the Tailwind CDN script and Tailwind config (`vectura-bg`, `vectura-text`, etc.). Existing top-level layout primitives (`flex flex-col h-screen`) keep their utility classes — these don't conflict with mockup CSS.
- `vectura-*` color RGBs are remapped per skin: in `meridian-dark`, `--vectura-bg-rgb` resolves to the mockup's `#1b1b1b` decomposition, `--vectura-panel-rgb` → `#252525`, `--vectura-text-rgb` → `#e0e0e0`, `--vectura-accent-rgb` → `#4e9ee1`, etc. This means any leftover `bg-vectura-panel` class anywhere keeps working but takes the Meridian palette automatically.
- Mockup-derived classes (`.sect`, `.sect-hdr`, `.ctrl-slider`, `.sld-fx-wrap`, `.angle-dial`, `.tog-grp`, `.seg-ctrl`, `.sw-toggle`, `.num-step`, `.tab-bar`, `.pen-item`, `.menu-dropdown`, `.tool-bar`, `.app-header`, `.pane-left`, `.pane-right`, `.bottom-pane`, etc.) are imported into `src/ui/skin/components.css` **verbatim from the mockup** — every selector, every property, every value preserved. The only edits are: (a) replace `[data-mode="dark"]` / `[data-mode="light"]` selectors with `[data-ui-skin="meridian-dark"]` / `[data-ui-skin="meridian-light"]` and (b) hoist the mode-independent `:root` block to `tokens.css`.
- New components built in Phase 1 use **only** mockup classes. They do NOT mix in Tailwind utility classes (no `class="ctrl-slider w-full bg-vectura-panel"` — would double-set background). This is the "skin-agnostic structure, palette via tokens" boundary.
- Net effect: `index.html` outer chrome (header layout flex containers, main grid) keeps Tailwind layout classes. Inside the new component DOM tree (everything `Shell.mount()` builds), markup uses mockup classes only. The 3,964-line `styles.css` is split — Tailwind keeps doing its job, mockup CSS slots into `src/ui/skin/components.css` + `motion.css` + per-skin palette files.

### 2.2 Skin Registry: Extension of `window.Vectura.THEMES`

Existing entries add three new fields (everything else stays):

```js
'meridian-dark': {
  id: 'meridian-dark',
  label: 'Meridian Blue · Dark',
  colorScheme: 'dark',
  metaThemeColor: '#0a1320',
  documentBg: '#0f1a2c',
  pen1Color: '#e6f1ff',
  // NEW:
  family: 'meridian',
  stylesheet: './src/ui/skin/meridian-dark.css',
  manifest: {
    paneLeftWidth: 290,
    paneRightWidth: 258,
    bottomPaneHeight: 148,
    rowHeight: 30,
    fontUi: "'Space Grotesk', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    motion: { sliderPulse:{dur:550, ease:'ease-out', peak:0.36}, btnFade:{dur:300, ease:'ease-out', dip:0.42}, dialWave:{dur:520, ease:'cubic-bezier(0.23,1,0.32,1)', peak:0.63, maxR:24}, panelSlide:{dur:220, ease:'cubic-bezier(0.22,1,0.36,1)'}, modalEnter:{dur:220}, toastIn:{dur:260}, toastOut:{dur:200} },
    capabilities: { dialReleaseWave: true, twoColControls: false },
  },
  cssVars: { /* full --ui-* and --vectura-*-rgb map per mockup */ },
}
```

`applyTheme()` is amended in `src/app/app.js`:
1. Write `root.dataset.uiSkin = themeName` (alongside existing `data-theme`).
2. Toggle `data-skin-swapping="true"` for 60ms (CSS rule suppresses transitions).
3. Update `<link id="active-skin">` href if `theme.stylesheet` differs from current.
4. Push `manifest.motion.*` to CSS vars (`--motion-*-dur`, `--motion-*-ease`, `--motion-*-peak`).
5. Push `manifest.paneLeftWidth/paneRightWidth/bottomPaneHeight/rowHeight` to CSS vars.
6. Dispatch `vectura:skin-change` on document.
7. Existing behavior (cssVars push, pen sync, doc bg sync, UI refresh) continues unchanged.

`App.toggleTheme()`'s `CYCLE` array becomes the registry's keys.

### 2.3 ui.js Decomposition (per user decision: full rewrite)

Module tree per the draft (§3.4) with these refinements:

- **Components are plain factories**, not classes. Pattern: `export factory(host, props) → { el, update, destroy }` exposed via the existing IIFE → `window.Vectura.UI.<Name>` namespace pattern. No bundler — each file is a `<script defer>` in `index.html`.
- **Helper modules** (the 9 already-extracted satellites) move to a flat `src/ui/helpers/` directory but keep their `window.Vectura.<Helper>` global names. Existing call sites continue to work; no behavioral changes.
- **`controls-registry.js`** is a near-verbatim copy of `CONTROL_DEFS` from `ui.js:2196-6437`. Internal helper functions referenced by `showIf` predicates that were `const` inside the old IIFE need to be exposed (e.g., `window.Vectura.FillPanel.buildFillControlDefs` is already global, so most predicates work as-is — verify each).
- **Old `ui.js`** is renamed to `_ui-legacy.js` during the transition (Phase 2) and removed in Phase 5. While present, it is NOT loaded — index.html's `<script src="./src/ui/ui.js">` points at the new orchestrator from Phase 2 onward.

### 2.4 Legacy `ui.js` → New File Decomposition Map

The 16,288-line file decomposes as follows. Line ranges are inclusive; "→" target file is final destination.

| Lines | Old name (line) | → New file |
|---|---|---|
| 3–27 | IIFE deps destructure | `src/ui/ui.js` (orchestrator preamble) |
| 30–223 | Preset libraries, layer-type sets, wallpaper groups, `WAVE_NOISE_OPTIONS`, etc. | `src/ui/constants.js` (NEW, ~470 LOC) |
| 30–35 | `getThemeToken` cache + token helpers | `src/ui/skin/tokens.js` (Phase 0, BEFORE Phase 2) |
| 209–605 | Math/geometry/path/SVG helpers | `src/ui/helpers/geometry.js` (NEW) |
| 535–605 | Display formatters (`formatValue`, `formatDisplayValue`, `attachKeyboardRangeNudge`, etc.) | `src/ui/utils.js` (Phase 1) |
| 605–715 | `COMMON_CONTROLS`, `OPTIMIZATION_STEPS`, `EXPORT_INFO` | `src/ui/constants.js` |
| 1212–2175 | All NOISE_DEFS blocks (WAVE/RINGS/TOPO/FLOWFIELD/GRID/PHYLLA/PETALIS_DRIFT) | `src/ui/noise-defs.js` (NEW) |
| 1498–2134 | Modifier/shading factory functions | `src/ui/helpers/factories.js` (NEW) |
| 1947–2194 | PETAL_DESIGNER + PETALIS_DESIGNER constants | `src/ui/constants.js` |
| **2196–3688** | **CONTROL_DEFS literal** | `src/ui/controls-registry.js` (Phase 2) |
| 3688–3729 | PETALIS_DESIGNER removal filters | `src/ui/controls-registry.js` |
| 3745–6437 | INFO database (in-app help text) | `src/ui/info-db.js` (NEW) |
| 5883–6437 | Path smoothing / bounds / transform | `src/ui/helpers/geometry.js` |
| 6439–6511 | `class UI` constructor | `src/ui/ui.js` (orchestrator) |
| 6513–7123 | Export modal system (11 methods incl. `openExportModal` 6884) | `src/ui/modals/export-svg.js` (Phase 3) |
| 7124–7260 | Top-menu nav (`initTopMenuBar`, `setTopMenuOpen`, `triggerTopMenuAction` body, panel keyboard nav) | `src/ui/shell/menubar.js` (Phase 2) |
| 7262–7299 | Theme refresh + scroll restoration | `src/ui/shell/theme-switcher.js` + `src/ui/persistence.js` |
| 7301–7429 | Modal infrastructure (`createModal`, `openModal`, `openColorModal`, `closeModal`) | `src/ui/overlays/modal.js` + `src/ui/modals/color-picker.js` |
| 7431–7556 | Left-panel collapsible-section state | `src/ui/shell/pane-left.js` |
| 7557–7837 | Help content + layer-type defaults + `storeLayerParams`/`restoreLayerParams`/`buildMirrorModifierControls` | `src/ui/modals/help-shortcuts.js` (help) + `src/ui/panels/modifiers-panel.js` (mirror controls) + `src/ui/helpers/layer-defaults.js` (NEW) |
| 8157–8465 | Layer hierarchy / grouping / type queries | `src/ui/panels/layers-panel.js` |
| 8507–8642 | Group/ungroup/duplicate ops | `src/ui/panels/layers-panel.js` |
| 8642–8776 | Mask editor + descendant queries | `src/ui/panels/layers-panel.js` |
| 8777–8881 | Validation / info-button wiring | `src/ui/components/info-badge.js` + `src/ui/utils.js` |
| 8881–9207 | Module/machine/palette/pen dropdowns + `initPensSection`, `initPaletteControls`, `initSettingsValues` | `src/ui/panels/pens-panel.js` + `src/ui/panels/algorithm-panel.js` |
| 9207–9388 | Pane toggles + resizers + light source tool | `src/ui/shell/pane-{left,right}.js` + `src/ui/shell/workspace.js` |
| 9396–9692 | `initToolBar` (canvas tools) | `src/ui/shell/toolbar.js` |
| 9693–10371 | `bindGlobal` (top-level shortcut wiring) | `src/ui/shortcuts.js` |
| 10371–10413 | `handleTopMenuShortcut` + `triggerTopMenuAction` dispatcher | `src/ui/shell/menubar.js` |
| 10414–10755 | `bindShortcuts` (all canvas/layer keyboard handlers) | `src/ui/shortcuts.js` |
| 10756–10900 | Layer-list icon factory + add menu + filter menu + search wiring | `src/ui/panels/layers-panel.js` (icons inlined into `src/ui/icons.js`) |
| 11003–11822 | `renderLayers` + drag/drop/visibility/lock/mask/rename | `src/ui/panels/layers-panel.js` |
| 11822–12010 | `renderPens` | `src/ui/panels/pens-panel.js` |
| 12011–12347 | `expandLayer`, `splitShapeLayer`, `applyScissor`, `startLightSourcePlacement` | `src/ui/panels/layers-panel.js` (split shape op) + `src/ui/shell/toolbar.js` (light source) |
| 12347–12728 | `openLayerSettings`, `loadNoiseImageFile`, `openNoiseImageModal`, harmonograph plotter | `src/ui/modals/layer-settings.js` (NEW Phase 3) + `src/ui/components/harmonograph-plotter.js` |
| **12729–16195** | **`buildControls()`** (1490 lines) | `src/ui/panels/algo-config-panel.js` (Phase 2; calls into components, FillPanel, NoiseRack, designers) |
| 16196–16288 | `updateFormula` | `src/ui/panels/formula-panel.js` |
| 16288+ | Mixins (touch, units, randomization, pattern, petal, noise rack, file-io, auto-colorize) | unchanged — still `src/ui/ui-*.js`, mounted by orchestrator via `Object.assign(UI.prototype, _UI*Mixin)` |

`buildControls()` is the single largest extraction risk. Its render loop dispatches on `control.type`; the dispatch table goes into `algo-config-panel.js` and each branch invokes a Phase 1 component or a satellite mixin (`ui-noise-rack.js`, `ui-pattern-designer.js`, etc.).

### 2.5 Component API Contract

Every Phase 1 file (`src/ui/components/*.js`, `src/ui/overlays/*.js`) exports a single factory via the existing IIFE-on-`window.Vectura.UI.<Name>` pattern:

```js
/**
 * @typedef {Object} ComponentInstance
 * @property {HTMLElement} el           - The component's root element. Caller may append to its own host.
 * @property {(props: object) => void} update  - Apply a new full props object. Component diffs internally.
 * @property {() => void} destroy       - Detach listeners; remove `el` from DOM if attached.
 */

/**
 * @param {HTMLElement} host  - Where the component will append `el`. May be null; caller appends manually.
 * @param {object} props      - Initial props. Schema is per-component (see component file's @typedef).
 * @returns {ComponentInstance}
 */
window.Vectura.UI.Slider = function createSlider(host, props) { /* ... */ };
```

Conventions:
- `el` is owned by the component. Caller never mutates it; mutations go through `update(newProps)`.
- `update` is **full-props replace**, not partial patch. Component diffs (`oldProps` cached on instance) and only re-renders the parts that changed.
- `destroy` removes all `addEventListener`s the component added, removes `el` from its parent if attached, and clears any rAF/timeout handles. After destroy the instance is unusable.
- Components do NOT subscribe directly to engine state. The parent panel is the sole bridge: panel listens to engine, calls `slider.update({value: newValue})`.
- Props always include an optional `onChange(value, ...)` callback. Components never reach into `app.engine` directly.

### 2.6 Skin Manifest Schema (locked)

```js
/**
 * @typedef {Object} SkinManifest
 * @property {string} id                 - Globally unique skin id, kebab-case (e.g., 'meridian-dark').
 * @property {string} label              - Human-readable name shown in skin picker.
 * @property {'dark'|'light'} colorScheme - Determines `meta[name=theme-color]` content + native form controls.
 * @property {string} family             - Skin-family group ('classic' | 'meridian' | string). Used for grouping in picker.
 * @property {string} stylesheet         - Path (relative to index.html) of the per-skin palette CSS file.
 * @property {string} metaThemeColor     - Color piped into `meta[name=theme-color]`.
 * @property {string} documentBg         - Default canvas background color when first loaded.
 * @property {string} pen1Color          - Default pen 1 color (existing field).
 * @property {Object<string,string>} cssVars  - Map of `--ui-*` (and `--vectura-*-rgb`) CSS variable values, applied to `:root`.
 * @property {SkinManifestExtras} manifest    - Layout, motion, font, capability bundle (NEW).
 *
 * @typedef {Object} SkinManifestExtras
 * @property {number} paneLeftWidth      - px
 * @property {number} paneRightWidth     - px
 * @property {number} bottomPaneHeight   - px
 * @property {number} rowHeight          - px
 * @property {string} fontUi             - CSS font-family stack
 * @property {string} fontMono           - CSS font-family stack
 * @property {Object<string, MotionSpec>} motion  - Keyed motion specs (sliderPulse, btnFade, dialWave, panelSlide, modalEnter, toastIn, toastOut).
 * @property {Object<string, boolean>} capabilities - Optional features (`dialReleaseWave`, `twoColControls`, etc.).
 *
 * @typedef {Object} MotionSpec
 * @property {number} dur     - Duration in ms.
 * @property {string} ease    - CSS easing string.
 * @property {number} [peak]  - Optional peak amplitude (0..1).
 * @property {number} [dip]   - Optional minimum amplitude (0..1).
 * @property {number} [maxR]  - Optional max radius (px) — used by `dialWave`.
 */
```

Skin authors fill this object. SkinManager validates: missing required fields throw at `register()`. CSS variables not declared by the skin fall back to `tokens.css` defaults.

### 2.7 `vectura:skin-change` Event Payload

```js
/**
 * Dispatched on `document` after a skin swap completes (one rAF after stylesheet load).
 *
 * @typedef {CustomEvent<SkinChangeDetail>} SkinChangeEvent
 * @typedef {Object} SkinChangeDetail
 * @property {string} skinId            - The newly active skin id.
 * @property {string} previousSkinId    - The id that was active before this swap (may equal skinId on re-apply).
 * @property {SkinManifest} manifest    - The full manifest for the new skin.
 * @property {'dark'|'light'} colorScheme - Convenience copy.
 * @property {string} family            - Convenience copy.
 * @property {boolean} reducedMotion    - Result of `matchMedia('(prefers-reduced-motion: reduce)').matches` at swap time.
 */
```

Renderers listen to this event to invalidate the token cache (`src/ui/skin/tokens.js#invalidate()`); panels listen to re-skin transient state (e.g., dial wave halo color).

### 2.8 Hidden DOM Stash Inventory

The new `Shell.mount()` in Phase 2 must preserve these elements (or recreate them in their original ids) — JS code references them by id and breaks on absence.

| id / selector | Purpose | index.html line |
|---|---|---|
| `#optimization-controls-stash` | Hidden host for export panel when modal closes | 728 |
| `#file-open-vectura` | Hidden file input (`.vectura`) | 198 |
| `#file-import-svg` | Hidden file input (`.svg`) | 199 |
| `#file-import-pattern-svg` | Hidden file input (pattern designer SVG import) | 200 |
| `#inp-bg-color` | Native `<input type="color">` for canvas bg | 480 |
| `#set-margin-line-color` | Hidden color input for margin outline color | 577 |
| `#set-selection-outline-color` | Hidden color input for selection outline color | 637 |
| `#set-grid-color` | Hidden color input for grid color | 716 |
| `#custom-size-fields` | Container shown only when "Custom" paper profile picked | 522 |
| `#touch-modifier-bar` | Touch-only modifier bar (hidden on desktop) | 327 |
| `#optimization-overlay-legend` | Legend for line-sort overlay (renderer reads) | 338 |
| `#layer-add-menu` | Layer add dropdown | 386 |
| `#layer-filter-menu` | Layer filter dropdown | 405 |
| `#palette-menu` | Palette selection dropdown | 423 |
| `#view-grid-checkmark` | Checkmark indicator for View > Grid Overlay | 103 |

Plus dynamically created: `#anchored-color-proxy-input` (off-canvas color picker proxy, created on first use). The new `Shell.mount()` is responsible for keeping every entry above in the DOM (visibility/display rules unchanged).

### 2.9 Closure-Captured Helper Globalization

`CONTROL_DEFS` (lines 2196–3688) contains ~200 inline `showIf: (p) => …` arrows. Most use only their `p` argument and external constants — those compile cleanly outside the IIFE. The ones that don't fall into three groups:

1. **References to other module-level helpers in `ui.js`**: `clamp`, `clonePathsWithMeta`, etc. All math/geometry helpers move to `src/ui/helpers/geometry.js` (per §2.4) and get exposed as `window.Vectura.UI.helpers.<name>`. Update CONTROL_DEFS predicates accordingly.
2. **References to satellite-module helpers**: e.g., `FillPanel.buildFillControlDefs` — already global as `window.Vectura.FillPanel.*`, so the predicate works as-is.
3. **References to `INFO`, `NOISE_DEFS`, `WAVE_NOISE_OPTIONS`, etc.**: these constants move out of `ui.js` (§2.4) and become `window.Vectura.UI.NOISE_DEFS`, etc. Predicates updated.

Phase 2 includes a "compile gate" step before merging: load `controls-registry.js` standalone in JSDOM, iterate every entry's `showIf`, invoke with a representative param object, assert no `ReferenceError`. The harness lives at `tests/unit/controls-registry-compile.test.js` and runs in `npm run test:ci`.

### 2.10 CONTROL_DEFS Type Catalog

The 19 distinct `type` values used by the registry, mapped to the Phase 1 component (or mixin) that renders them:

| Type | Renderer |
|---|---|
| `range` | `components/slider.js` |
| `angle` | `components/angle-dial.js` |
| `checkbox` | `components/sw-toggle.js` |
| `select` | `components/select.js` |
| `colorModal` | `components/color-pill.js` (opens `modals/color-picker.js`) |
| `rangeDual` | `components/slider.js` (dual-thumb mode) |
| `section` | `components/section.js` (header bar with `::before` accent) |
| `collapsibleGroup` / `collapsibleGroupEnd` | `components/section.js` (nested) |
| `noiseList` | delegates to `ui-noise-rack.js` mixin |
| `modifierList` | `panels/modifiers-panel.js` |
| `petalModifierList` | `panels/modifiers-panel.js` (petal variant) |
| `pendulumList` | `components/pendulum-list.js` (NEW; harmonograph) |
| `harmonographPlotter` | `components/harmonograph-plotter.js` |
| `patternSelect` | `components/select.js` (with thumbnails) |
| `patternDesignerInline` | delegates to `ui-pattern-designer.js` mixin |
| `patternSubPens` | `components/pen-list.js` (NEW; subpens) |
| `petalDesignerInline` | delegates to `ui-petal-designer.js` mixin |
| `svgImportButton` | `components/btn-pulse.js` + hidden file input |
| `image` | `components/image-input.js` (NEW) |

Phase 1 file list updates accordingly: add `pendulum-list.js`, `pen-list.js`, `image-input.js`, `harmonograph-plotter.js` to the 16-file list (now 20 components). The `modifierList`/`petalModifierList`/`*Inline` types are panel-level concerns rather than reusable components and stay out of `components/`.

### 2.11 Keyboard Shortcut Inventory

Consolidated for `src/ui/shortcuts.js`. Each row migrates from `bindShortcuts` / `bindGlobal` / `handleTopMenuShortcut` / inline modal handlers into a single dispatcher table.

| Combo | Action | Scope | Source line (legacy `ui.js`) |
|---|---|---|---|
| Ctrl/Cmd+Z | Undo | global | 10374 |
| Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y | Redo | global | 10374 |
| Ctrl/Cmd+O | Open .vectura | global | 10374 |
| Ctrl/Cmd+S | Save .vectura | global | 10374 |
| Ctrl/Cmd+Shift+P | Import SVG | global | 10374 |
| Ctrl/Cmd+Shift+E | Export SVG | global | 10374 |
| Ctrl/Cmd+K | Toggle Settings panel | global | 10395 |
| Ctrl/Cmd+0 | Reset zoom | global | 10400 |
| F1 | Open help | global | 10403 |
| Ctrl+G | Toggle grid overlay | global | 10408 |
| Space (hold) | Hand pan tool | global | 10441 |
| Alt (hold, fill active) | Fill-erase modifier | global | 10451 |
| ? / Shift+/ | Open help (focus shortcuts) | global | 10459 |
| Ctrl/Cmd+D, Alt+D | Duplicate selected layer | global | 10465–10488 |
| V / A / M / L / Y / F / P / C | Tool selection (cycle submode on repeat) | global | 10491–10563 |
| Shift+= or + | Pen add-point | pen tool | 10536 |
| − (minus) | Pen delete-point | pen tool | 10542 |
| Shift+C | Pen anchor | pen tool | 10548 |
| Ctrl/Cmd+A | Select all drawable layers | global | 10565 |
| Esc | Cancel pen path / shape draft / scissor / modal / menu | scoped | 10580–10623 |
| Enter | Commit pen path | pen draw | 10586 |
| Backspace | Undo last pen point | pen draw | 10596 |
| Cmd+G / Cmd+Shift+G | Group / Ungroup | global | 10626–10634 |
| Ctrl/Cmd+E | Expand selected layers | global | 10636 |
| Ctrl/Cmd+[ / ] | Move layer down / up | global | 10646 |
| Ctrl/Cmd+Shift+[ / ] | Move layer to bottom / top | global | 10651 |
| Delete / Backspace | Delete selected layers (or light source) | global | 10660 |
| Arrow keys | Nudge ±1 (Ctrl/Cmd ±10) | layer/poly | 10683 |
| Arrow Right/Left/Down | Menu nav | top menu | 7183 |
| Arrow Down/Up, Home, End | Panel item nav | open panel | 7221–7243 |
| Tab / Shift+Tab | Input nav | inputs | 12995 |
| Esc | Cancel inline edit | input | 12991 |
| (Petal designer) Esc, A, V, P, +, −, Shift+C | Tools | designer modal | ui-petal-designer.js:2287–2315 |
| (Pattern designer) Ctrl/Cmd+Z, F, Shift+F, V, A, S, P, R, O, Delete, Arrows, Esc | Tools / undo / nudge | designer modal | ui-pattern-designer.js:405–2603 |

The dispatcher in `shortcuts.js` exposes `register(combo, scope, handler)` and `unregister(combo, scope)`. Designer-scoped handlers register/unregister on modal open/close so they don't leak into global scope.

### 2.12 Petal & Pattern Designer Re-skin Boundaries

"Chrome" = re-skinnable. "Internals" = byte-identical, cannot be touched.

**`ui-petal-designer.js`:**
- **Chrome (re-skin):** lines 1029–1111 (header, toolbar, structure-panel slider labels, transition-lock checkbox, visualizer header, profile editor header, stack headers + "+ Add" buttons). Re-skin via swapping CSS classes/Tailwind utilities for mockup classes; no JS changes.
- **Internals (do not touch):** lines 1070–1083 (canvas grid trio: overlay/inner/outer), 1150–2400+ (canvas rendering, point manipulation, anchor/handle drag, profile array logic, shading/modifier stacks, keyboard handler at 2287–2315). All `data-petal-*` attributes are state binders — preserve verbatim.

**`ui-pattern-designer.js`:**
- **Chrome (re-skin):** modal lines 481–532 (header, fill-control row, status, validation header, gap-tolerance slider) and inline lines 179–260 (header, fill settings, status bar, path-actions row).
- **Internals (do not touch):** lines 400–450 (history stack), 1130–1680 (pointer-event region/fill detection), 1150–1350 (`pd.fills` rendering), 2200–2620 (direct edit mode, anchor/handle ops), 800–1000 (validation tile-seam logic). All `data-pd-*` attributes are state binders.

The Phase 4 PR's diff for these two files must touch ONLY: (a) chrome JSX-equivalent template strings (the `innerHTML = '...'` blocks that build header/toolbar markup), (b) CSS class names mentioned in those blocks, (c) the inline style attribute for chrome elements. Any modification to a data-attribute selector, canvas event handler, or state mutation is a review-block.

---

## 3. Phased Roadmap

Each phase = one PR, green `npm run test:ci` before merge. Skins are gated by `data-ui-skin`; all classic users see no change until Phase 5.

### Phase −1: Mockup Provenance (½ day, blocking) — ✅ DONE in `7d9f426`
- Commit the mockup contents (provided during planning) verbatim to `docs/design/themes-mockup.html`.
- Open it in a browser and capture screenshots of every interactive state (header w/ File menu open, header right buttons, each section collapsed/expanded, every menu open, slider idle/hover/dragging/post-release, dial idle/dragging/post-release, segmented control idle/active, toggle group, pill switch, number stepper, every layer-item state, every pen-item state, both modes). Save under `docs/design/mockup-baselines/`.
- Extract token + motion specs into `docs/design/meridian-tokens.md` (template values already enumerated in §0 of this plan).
- **Acceptance:** mockup file committed; token table merged; screenshot grid covers every interactive state in both modes.

> **Phase −1 actuals (`7d9f426`):** mockup at `docs/design/themes-mockup.html`; token reference at `docs/design/meridian-tokens.md`. Screenshot grid not captured — recommend doing this before starting Phase 4 (when designer chrome is re-skinned and visual baselines need a side-by-side reference).

### Phase 0: Skin Foundation (2 days) — ✅ DONE in `7d9f426`
**Files created:**
- `src/ui/skin/tokens.css` — mode-independent structural tokens copied verbatim from the mockup's `:root` block (pane widths, row heights, radii, spacing scale, font families, font sizes).
- `src/ui/skin/motion.css` — every `@keyframes` (`fx-pulse-fill`, `thumb-release`, `btn-press`) plus the new derivations: `section-collapse` (max-height), `modal-enter`/`modal-exit`, `toast-in`/`toast-out`, `tooltip-fade`, `drop-zone-pulse`, `progress-indeterminate`, `tab-fade`, `menu-open`. Copy mockup keyframes verbatim; add reduced-motion media query that collapses durations to ≤80 ms.
- `src/ui/skin/components.css` — every component selector from the mockup CSS (`.app-header`, `.brand`, `.menu-dropdown`, `.pane-left`, `.sect`, `.sect-hdr` (including `::before` left-accent bar), `.ctrl-grp`, `.ctrl-sel-wrap`, `.seg-ctrl`, `.tog-grp`, `.sw-toggle`, `.angle-ctrl`, `.angle-dial` SVG element styles, `.num-step`, `.slider-row`, `.ctrl-slider`, `.sld-fx-wrap` + `::after`, `.pen-sld` (3 px), `.tool-bar`, `.tab-bar`, `.layer-item`, `.pen-item`, `.bottom-pane`, `.formula-eq`, `.formula-params`, `.bg-row`, `.stats-grid`, `#theme-switcher`). Selectors that referenced `[data-mode="dark|light"]` are rewritten to `[data-ui-skin^="meridian"]` and palette tokens come from the per-skin file.
- `src/ui/skin/classic-dark.css`, `classic-light.css`, `lark.css` — token-renamed copies of today's three palettes. Keep `--color-*` and `--vectura-*-rgb` set to the same values; add `--ui-*` aliases pointing at them so legacy palettes also satisfy components.css.
- `src/ui/skin/meridian-dark.css`, `meridian-light.css` — palettes copied verbatim from the mockup `[data-mode="dark"]` and `[data-mode="light"]` blocks. Each file also sets the `--vectura-*-rgb` Tailwind tokens to RGB-decomposed mockup values so existing Tailwind utility classes paint correctly under Meridian.
- `src/ui/skin/skin-manager.js` — IIFE exporting `window.Vectura.SkinManager` with `register(id, manifest)`, `activate(id)`, `getActive()`. `activate()` toggles `data-skin-swapping`, swaps the `<link id="active-skin">` href, writes manifest motion tokens to CSS vars, fires `vectura:skin-change`, and delegates the existing per-theme cssVars push to `App.applyTheme` (which it wraps).

**Files modified:**
- `src/config/defaults.js` — add `family`, `stylesheet`, `manifest` fields to existing entries; add `meridian-dark`, `meridian-light` entries; rename internal keys with backwards-compat aliases (`dark` → `classic-dark`, `light` → `classic-light`).
- `src/app/app.js:422-481` — extend `applyTheme()` per §2.2; rename `data-theme` → `data-ui-skin` (keep `data-theme` mirror for one release).
- `src/app/app.js:483-495` — replace `CYCLE = ['dark','lark','light']` with `Object.keys(window.Vectura.THEMES)`.
- `index.html:16` — replace single `<link rel="stylesheet" href="./styles.css">` with three: `<link href="./src/ui/skin/tokens.css">`, `<link href="./src/ui/skin/components.css">`, `<link href="./src/ui/skin/motion.css">`, plus `<link id="active-skin" rel="stylesheet" href="./src/ui/skin/classic-dark.css">`. Keep loading `./styles.css` for now (Phase 5 deletes).
- `src/render/renderer.js:47-61` (token cache) — extend cache to also read `--ui-*` names with fallback to `--color-*`. Verify by grepping all `getThemeToken` calls in the codebase.
- **Token-cache migration ordering (BLOCKING for Phase 2):** `getThemeToken` (currently at `ui.js:182`) MUST move to `src/ui/skin/tokens.js` in this phase, exposed as `window.Vectura.UI.tokens.get()` AND keep a back-compat `window.Vectura.UI.getThemeToken` alias. Reason: in Phase 2 the legacy `ui.js` stops loading; if `getThemeToken` still lives there at that point, the renderer breaks the moment the swap lands. Phase 0 PR is rejected if `tokens.js` doesn't ship.

**Acceptance:** existing `dark`/`light`/`lark` look pixel-identical to today (visual baselines unchanged). Selecting `meridian-dark` paints `--ui-*` tokens but DOM is still old, so it looks visually wrong but functionally fine — that's expected for this phase.

> **Phase 0 actuals (`7d9f426`):**
> - All foundation files shipped at `src/ui/skin/{tokens.css,motion.css,components.css,classic-dark.css,classic-light.css,lark.css,meridian-dark.css,meridian-light.css,skin-manager.js,tokens.js}`.
> - `defaults.js` got `CLASSIC_MANIFEST` + `MERIDIAN_MANIFEST` shared objects + meridian-dark/light entries.
> - `applyTheme()` writes `data-ui-skin` (kept `data-theme` mirror) + delegates to `SkinManager.activate`. `toggleTheme()` cycles every registered skin BUT preserves the legacy `dark → lark → light` order (legacy first, new appended) so existing keyboard muscle memory doesn't break.
> - `getThemeToken` migration: `tokens.js` ships `window.Vectura.UI.tokens.get` + back-compat `window.Vectura.UI.getThemeToken` alias. The closure copy in `ui.js:199` is left in place (no breakage). `renderer.js` not yet modified — its token cache still reads only `--color-*` names; legacy palette files alias `--ui-*` to `--color-*` so this is fine for Phase 0 but **Phase 2 must update renderer.js to read `--ui-*` directly when meridian-* is active**.
> - Tests: `tests/unit/skin/skin-manager.test.js` (16 tests), `tests/integration/skin-swap.test.js` (5 tests). All green; full suite 416/416 unit+integration passed, 13/13 visual baselines unchanged.

**Test cases (each is a named `it(...)` block):**
- `tests/unit/skin/skin-manager.test.js`:
  - `register() throws on missing required field` (id, label, cssVars, manifest)
  - `register() throws on duplicate id`
  - `activate(id) sets data-ui-skin on documentElement`
  - `activate(id) toggles data-skin-swapping for ~60ms then clears`
  - `activate(id) updates link#active-skin href when stylesheet differs`
  - `activate(id) writes manifest.motion.* keys to --motion-*-{dur,ease,peak,dip,maxR}`
  - `activate(id) dispatches vectura:skin-change with correct detail shape`
  - `activate(id) is a no-op (no event) when called with already-active id`
  - `getActive() returns last-activated id, defaulting to classic-dark`
- `tests/integration/skin-swap.test.js`:
  - `cycle through all 5 skins in order; renderer.getThemeToken('--ui-fg') returns expected hex per skin`
  - `swapping mid-render does not flash unstyled content (data-skin-swapping suppresses transition)`
  - `vectura_prefs cookie persists active skin across reloads`
  - `--color-* legacy tokens still resolve under classic-* skins via aliases`
- Visual baselines: `classic-dark.png`, `classic-light.png`, `lark.png` show 0-pixel diff vs Phase −1 baselines.

### Phase 1: Component Library (5 days) — ⏳ NEXT
Build every primitive in `src/ui/components/` and overlay in `src/ui/overlays/`. Each is a small file (~80–250 LOC) exposing `window.Vectura.UI.<Name>` and tested in isolation.

**Files created (each with sibling `tests/unit/components/<name>.test.js`):**
- `src/ui/components/{slider,number-input,select,seg-ctrl,tog-grp,sw-toggle,num-step,angle-dial,color-pill,info-badge,btn-pulse,section,tabs,tooltip,layer-item,pen-item}.js` (16 files)
- `src/ui/overlays/{modal,dialog,toast,menu,drag-drop,empty-state}.js` (6 files)
- `src/ui/motion.js` — rAF helpers, FLIP utility, `triggerBtnPulse(el)`, `triggerDialWave(svg, x, y)`.
- `src/ui/focus.js` — focus trap, focus-ring management.
- `src/ui/utils.js` — `clamp`, `formatNumber`, `tabularNum`, `cssVarPx`.
- `tests/visual/sandboxes/components.html` — every component rendered with sample props for visual regression. Loaded by Playwright.
- `src/ui/icons.js` — central inline-SVG export used by all components.

Plus the four §2.10-additions: `pendulum-list.js`, `pen-list.js`, `image-input.js`, `harmonograph-plotter.js` (20 components total).

**Acceptance:** every component renders in `tests/visual/sandboxes/components.html` under all three Meridian states (idle/hover/active). Unit tests cover R-S1..R-Y2 from the draft's §11.4. No consumer code yet.

**Test cases (per-component, all in `tests/unit/components/<name>.test.js`):** every component file gets at minimum: `mount returns {el, update, destroy}`; `el is detached until host appends`; `update applies new value without recreating DOM`; `destroy removes all event listeners` (verify via `getEventListeners` shim); `destroy detaches el if attached`; `Tab/Shift+Tab move focus per WAI-ARIA`. Per-type:
- `slider.test.js`: drag fires `onChange` continuously; release fires single `onCommit`; release halo plays unless `prefers-reduced-motion`; clamps to min/max; respects `step` rounding; arrow keys nudge.
- `angle-dial.test.js`: pointer drag updates angle; release triggers `dial-wave` rAF (svg circle radius animates 1→24); reduced-motion skips wave.
- `slider.test.js (rangeDual mode)`: two thumbs; thumbs cannot cross; inverts when `min>max` swap requested.
- `seg-ctrl.test.js`: arrow-left/right cycle; Home/End jump.
- `tog-grp.test.js`: multi-select honors `multiple` prop.
- `sw-toggle.test.js`: Space/Enter toggle; aria-checked mirrors state.
- `num-step.test.js`: ±/± keys, drag, wheel; respects step.
- `select.test.js`: open via Enter/Space/Down; type-ahead picks first match; Esc closes.
- `color-pill.test.js`: click invokes `props.onOpen`; outline matches color luma.
- `info-badge.test.js`: hover shows tooltip via `overlays/tooltip.js`; long content shows "Read more" → modal.
- `btn-pulse.test.js`: click triggers `btn-press` keyframe.
- `section.test.js`: header click toggles collapse; collapse is animated unless reduced-motion; left-accent `::before` rendered.
- `tabs.test.js`: arrow nav between tabs; tab change fires `onChange`.
- `tooltip.test.js`: positioning collides correctly with viewport edges.
- `layer-item.test.js` / `pen-item.test.js`: drag-handle drag fires `onReorder`; visibility/lock toggles dispatch correctly.
- `overlays/modal.test.js`: focus trap; Esc closes (unless `keyboard:false`); click-outside opt-in via `dismissOnBackdrop`; restores focus to trigger on close.
- `overlays/menu.test.js`: arrow nav; type-ahead; Esc closes.
- `overlays/toast.test.js`: auto-dismiss after `duration`; pause on hover; danger variant has correct aria-role.
- `overlays/dialog.test.js`: confirm/cancel; Esc maps to cancel.
- `overlays/drag-drop.test.js`: shows on `dragenter`; hides on `dragleave` from window; calls `onDrop` with FileList.
- `overlays/empty-state.test.js`: renders inline SVG illustration + `cta` button.

**Visual baselines:** Playwright captures `tests/visual/sandboxes/components.html` under each of `classic-dark`, `meridian-dark`, `meridian-light` (3 baselines × 22 components). Threshold: 0.1% pixel diff per baseline.

> **Phase 1 actuals (`16ec81d` → `c7fa0db`, six commits):**
> - **Scaffolding (`16ec81d`):** `src/ui/{utils,motion,focus}.js` + `tests/visual/sandboxes/components.html` shell + `tests/helpers/load-ui-component.js` (loads single component scripts into a minimal JSDOM via `vm.runInContext`, so component tests don't pay the index.html boot cost).
> - **Components (20):** `src/ui/components/{btn-pulse, info-badge, section, sw-toggle, seg-ctrl, tog-grp, num-step, select, color-pill, slider, number-input, angle-dial, tabs, layer-item, pen-item, pendulum-list, pen-list, image-input, harmonograph-plotter}.js` (note: `info-badge` consumes overlays/tooltip; layer-item ships native HTML5 drag/drop with a custom MIME type for reorder).
> - **Overlays (6):** `src/ui/overlays/{tooltip, modal, dialog, toast, menu, drag-drop, empty-state}.js`. Modal owns the focus-trap; Dialog composes Modal; Menu has type-ahead + arrow-key nav skipping disabled entries.
> - **Tests:** 178 new unit tests across `tests/unit/{components,overlays}/`. Suite went from 350 unit / 66 integration → **530 unit / 66 integration**, all green. Visual baselines NOT captured — the sandbox shell is in place but the per-component renderers haven't been registered yet (deferred to Phase 2 alongside the panel-level visual baselines, since component renders depend on no panel state and can be batched).
> - **Component API contract (locked in `c7fa0db`):** `factory(host, props) -> { el, update, destroy }` registered on `window.Vectura.UI.<Name>` (or `window.Vectura.UI.overlays.<Name>`). Plain factory, not class. Components don't reach into engine state — the parent panel is the bridge. `update(newProps)` is full-props replace; component diffs internally and never recreates `el`.
> - **Two minor deviations from §3:** (a) Phase 1 file count was 22 (16 base + 6 specialized + tooltip — tooltip moved to overlays/ since it's used by info-badge and modal as an underlay), not 20 + 6 as planned. (b) `info-badge.js` composes the tooltip overlay rather than re-implementing tooltip logic; consequence: `tests/unit/components/info-badge.test.js` loads `['utils', 'tooltip', 'info-badge']`. Phase 2 panels should follow the same composition pattern.
> - **Phase 2 unblocked.** All component primitives the planned `algo-config-panel` dispatch table needs are present.

> **Phase 2 step 1 actuals (`a16ad57` toolbar fix + `313d427` extraction):**
> - **CONTROL_DEFS extracted** from `src/ui/ui.js:2212-3759` (1548 lines) to a new IIFE at `src/ui/controls-registry.js`. Exposed as `window.Vectura.UI.CONTROL_DEFS`. Loaded BEFORE `ui.js` via new `<script>` in `index.html`.
> - **Compile gate landed first:** `tests/unit/controls-registry-compile.test.js` runs every `showIf` predicate against `ALGO_DEFAULTS` (and `{}`) in JSDOM, asserting no `ReferenceError`. It immediately caught three closure-captured locals my static grep missed — `PETALIS_PRESET_OPTIONS`, `TERRAIN_PRESET_OPTIONS`, `PETAL_PROFILE_OPTIONS` — which now live in the registry IIFE's prelude alongside the preset libraries they derive from (`PETALIS_PRESET_LIBRARY`, `TERRAIN_PRESET_LIBRARY`). Legacy `ui.js` keeps its own duplicate copies for now; later steps will dedupe.
> - **Single function-call site** inside `CONTROL_DEFS` is `window.Vectura.FillPanel?.buildFillControlDefs(...)` — already global, works as-is.
> - **`tests/unit/rings-ui-controls.test.js`** retargeted to parse `controls-registry.js` instead of `ui.js`.
> - **Test totals:** 535 unit (was 530, +5 compile-gate) + 66 integration. All green.
> - **`ui.js` shrinks** from 17,706 → 16,162 lines (–1544). Still 16K-line monolith — Phase 2 step 2 (algo-config-panel) is the next big extraction.
> - **Toolbar visibility fix (`a16ad57`):** unrelated companion fix. Legacy `styles.css` `.tool-bar` had no `max-height` — capped at `calc(100% - 40px)` with a thin scrollbar fallback. More important: `components.css`'s meridian centering rule (`top: 50%; transform: translateY(-50%)`) bled into classic skins (`styles.css` overrode `top` but not `transform`, pulling the toolbar up by half its height and clipping the first ~5 buttons). Scoped the centering rule to `[data-ui-skin^="meridian"]` so it can't leak.

> **Phase 2 step 2 actuals (`7ca4795`):**
> - **`buildControls()` extracted** verbatim from `src/ui/ui.js:12584-16068` (3,484 lines — over 2× the plan's 1,490-line estimate; the legacy method had grown well beyond the snapshot the plan captured) to a new IIFE at `src/ui/panels/algo-config-panel.js`. Exposed as `window.Vectura.UI.AlgoConfigPanel.{ bind, buildControls }`. Loaded BEFORE `ui.js` via new `<script>` in `index.html`.
> - **Legacy UI prototype keeps a thin delegator:** `buildControls() { return window.Vectura.UI.AlgoConfigPanel.buildControls.call(this); }`. Every existing `this.buildControls()` call site (20+ across `ui.js` plus mixins) keeps working unchanged. The body of the new function is byte-identical to the legacy body — same `this.*` references, same DOM construction.
> - **40-key dependency-injection bag.** The new IIFE-level closure no longer sees the legacy `ui.js` IIFE locals, so legacy `ui.js` calls `AlgoConfigPanel.bind(deps)` once during its own IIFE init, passing 40 helpers/constants the body needs. Inside `buildControls()`, deps are destructured fresh each call so the body's reference set matches the original 1:1. Categories: 18 constants (`COMMON_CONTROLS`, `OPTIMIZATION_STEPS`, `IMAGE_NOISE_DEFAULT_AMPLITUDE`, 7 `*_NOISE_DEFS`, 4 `PETALIS_*_TYPES`, 3 `*_PRESET_LIBRARY`, `TRANSFORM_KEYS`); 12 DOM/value helpers (`getEl`, `escapeHtml`, `roundToStep`, `clone`, `clamp`, `attachKeyboardRangeNudge`, `formatValue`/`formatDisplayValue`, `getDisplayConfig`/`toDisplayValue`/`fromDisplayValue`, `getContrastTextColor`, `openColorPickerAnchoredTo`); 3 unit helpers (`getDocumentUnitLabel`, `mmToDocumentUnits`, `documentUnitsToMm`); 5 modifier/petalis factories+predicates (`isModifierLayer`, `isPetalisLayerType`, `createPetalisModifier`, `createPetalModifier`, `createPetalisShading`). The `window.Vectura.*` globals (`ALGO_DEFAULTS`, `SETTINGS`, `DESCRIPTIONS`, `MODIFIER_DESCRIPTIONS`) are pulled from `window.Vectura` directly inside the function (mirrors the legacy IIFE preamble pattern).
> - **Namespace-preservation patch** in legacy `ui.js`: replacing `window.Vectura.UI = UI` directly clobbered `AlgoConfigPanel`, `CONTROL_DEFS`, and any other module that attaches to `window.Vectura.UI` BEFORE `ui.js` loads (today: controls-registry, algo-config-panel; future: every Phase 1 component re-attached via the new orchestrator). Now copies forward static members from the prior namespace onto the new UI class. Without this, every `window.Vectura.UI.AlgoConfigPanel.buildControls` call after `ui.js` ran threw `TypeError: Cannot read properties of undefined`. Future panel/orchestrator extractions inherit the safe assignment automatically.
> - **Compile gate landed alongside extraction:** `tests/unit/algo-config-panel-compile.test.js` (3 tests) — asserts the contract surface is exposed, that calling `buildControls` before `bind()` yields a clear `Error('AlgoConfigPanel.buildControls invoked before AlgoConfigPanel.bind(deps)')` rather than a silent `ReferenceError`, and that destructuring the legacy dep set runs cleanly (early-returns at the missing-container check with a minimal `this`). The gate caught two batches of escaped helpers during extraction: the first run failed with `clone is not defined` and 18 sibling missing helpers; the second with `clamp is not defined` (which is destructured separately at `ui.js:176` from `window.Vectura.AlgorithmUtils`, not `^  const`-declared, so my initial regex sweep missed it). Both expanded the dep bag in matching steps in algo-config-panel.js + ui.js + the test.
> - **Test totals:** 538 unit (was 535, +3 compile-gate) + 66 integration + 13 visual + 2 perf. All green. Visual baselines unchanged (extraction is byte-identical body, no DOM diff).
> - **`ui.js` shrinks** from 16,162 → 12,752 lines (–3,410). New `algo-config-panel.js` is 3,576 lines (3,484 body + 92 prelude/contract/comments). The 16K-line monolith is now firmly under 13K and contains no UI-construction code for algorithm parameters — Phase 2 step 5's orchestrator can build a thin replacement next to algo-config-panel rather than re-extracting from a moving target.

> **Phase 2 step 3 in progress (`5c2edcc` first extraction + menubar second extraction; 2 of 9 shell modules done):**
> - **`refreshThemeUi()` extracted** verbatim from legacy `src/ui/ui.js` into a new IIFE at `src/ui/shell/theme-switcher.js`, exposing `window.Vectura.UI.ThemeSwitcher.{ bind, refreshThemeUi }`. Loaded BEFORE `ui.js` via a new `<script>` tag in `index.html` (between `panels/algo-config-panel.js` and `ui.js`).
> - **Legacy UI prototype keeps a thin delegator:** `refreshThemeUi() { return window.Vectura.UI.ThemeSwitcher.refreshThemeUi.call(this); }`. Both legacy callers (`initSettingsValues` and the theme-toggle wiring in bindEvents) keep working unchanged.
> - **DI bag is just `{ getEl }`** — the only legacy IIFE-local the body referenced. `SETTINGS` is pulled from `window.Vectura` directly inside the function, mirroring the legacy IIFE preamble pattern (matches algo-config-panel's split between deps-bag and global-pull).
> - **Namespace-preservation patch from step 2 is load-bearing here.** `window.Vectura.UI.ThemeSwitcher` is attached BEFORE `ui.js` loads and survives `window.Vectura.UI = UI` because step 2's copy-forward loop in legacy `ui.js` carries it through automatically. No further patches needed for future shell modules — the pattern is "drop a new IIFE module → bind in legacy ui.js → 1-line delegator on the prototype".
> - **Compile gate landed alongside extraction:** `tests/unit/theme-switcher-compile.test.js` (4 tests) — asserts the contract surface is exposed, that `refreshThemeUi` before `bind()` throws a clear `Error('ThemeSwitcher.refreshThemeUi invoked before ThemeSwitcher.bind(deps)')`, that the body runs without throwing when the target elements are absent, and a smoke test that mutates a real `#theme-toggle` + `#inp-bg-color` to assert behavior is byte-identical to the legacy body (aria-pressed/aria-label/title/dataset.theme/value all written correctly).
> - **Test totals:** 542 unit (was 538, +4 compile-gate + smoke) + 66 integration. Both green. Visual + perf not run for this checkpoint — defer to step 3 closeout (after the rest of the shell modules land), per the testing matrix's "shell DOM" rule.
> - **Scroll-restoration helpers stay in legacy `ui.js`** for now (`captureLeftPanelScrollPosition` at `ui.js:5932`, `scrollLayerToTop`). Per §2.4, those route to `persistence.js` (Phase 2 step 5), not theme-switcher. The theme-toggle button wiring (`themeToggle.onclick = () => this.app.toggleTheme()`) also stays in legacy `bindEvents` — it'll move to a future shell module (likely `header.js` or similar) when the rest of the shell extracts. Keeping the first-extraction surface tiny is intentional: it proves the pattern carries from panels (algo-config-panel) to shell (`src/ui/shell/`) before batching.
> - **`ui.js` shrinks** by 14 lines (12,752 → 12,738 net, accounting for the 17-line method body becoming a 3-line delegator). Marginal — the cumulative win comes from batching the remaining 8 shell modules: pane-left, pane-right, workspace, header, menubar, toolbar, bottom-pane, shell.
>
> **Phase 2 step 3 menubar extraction (second module — pending commit at time of writing):**
> - **`setTopMenuOpen()`, `initTopMenuBar()`, and `triggerTopMenuAction()` extracted** verbatim from legacy `src/ui/ui.js` into a new IIFE at `src/ui/shell/menubar.js`, exposing `window.Vectura.UI.MenuBar.{ bind, setTopMenuOpen, initTopMenuBar, triggerTopMenuAction }`. Loaded BEFORE `ui.js` via a new `<script>` tag in `index.html` (between `shell/theme-switcher.js` and `ui.js`).
> - **Legacy UI prototype keeps three thin delegators:** each method becomes a 1-line `return window.Vectura.UI.MenuBar.<name>.call(this, ...args)`. All non-trio call sites (`bindEvents`, `init*`, `bindShortcuts`'s `handleTopMenuShortcut`, the body's intra-trio recursion) keep working unchanged because `this.setTopMenuOpen` / `this.triggerTopMenuAction` resolve to the prototype delegators which call back into the module — preserving `this` (the UI instance, holder of `topMenuTriggers`/`openTopMenuTrigger`) end-to-end.
> - **DI bag is just `{ getEl }`** — the only legacy IIFE-local the bodies referenced. `setTopMenuOpen` itself does NOT call getEl, so it works without bind; `initTopMenuBar` and `triggerTopMenuAction` are the only methods guarded by `requireDeps()`. `handleTopMenuShortcut()` and `bindShortcuts()` stay on the legacy prototype — per §2.4 those route to `src/ui/shortcuts.js` in Phase 2 step 5, not menubar.
> - **Pattern now repeated across `panels/` and `shell/` twice.** Confirms that future shell modules can drop in identically: new IIFE → bind in legacy ui.js bottom → 1-line delegator(s) on the prototype → compile-gate test. No new namespace-preservation or bootstrap surgery required.
> - **Compile gate landed alongside extraction:** `tests/unit/menubar-compile.test.js` (6 tests) — exposes-contract / clear-error-before-bind for both `initTopMenuBar` and `triggerTopMenuAction` / runs-without-#top-menubar / smoke test that builds a 2-trigger menubar fixture and asserts `setTopMenuOpen` mutates aria-expanded + .open + panel.hidden + `this.openTopMenuTrigger` exactly as the legacy body did, including switching between triggers and closing all / smoke test that `triggerTopMenuAction` clicks the target button, returns `true` on hit / `false` on miss, and closes the menu via `this.setTopMenuOpen(null, false)` (the test wires a `setTopMenuOpen` shim onto `ctx` to mirror the prototype delegator round-trip).
> - **Test totals:** 548 unit (was 542, +6 compile-gate + smoke) + 66 integration. Both green. Visual + perf still deferred to step 3 closeout per the "shell DOM" rule in CLAUDE.md / testing matrix.
> - **`ui.js` shrinks** from 12,746 → 12,631 lines (–115). The three method bodies (~140 lines) collapse to three 3-line delegators plus a 7-line bind block at the IIFE bottom. Combined step 3 progress so far: theme-switcher + menubar carved out ~129 lines from the 12K-line monolith. New `menubar.js` is 191 lines (~165 body + 26 prelude/contract/comments).

### Phase 2: Shell, Panels, Orchestrator (7 days)
**Files created:**
- `src/ui/shell/{shell,header,menubar,pane-left,pane-right,workspace,toolbar,bottom-pane,theme-switcher}.js` (9 files)
- `src/ui/panels/{algorithm-panel,algo-config-panel,noise-rack-panel,modifiers-panel,transform-panel,layers-panel,pens-panel,auto-colorize-panel,formula-panel}.js` (9 files)
- `src/ui/controls-registry.js` — extracted `CONTROL_DEFS` literal from `ui.js:2196-6437`. Verify every `showIf` predicate compiles outside the old IIFE; expose any inner helper functions on `window.Vectura.UI.helpers`.
- `src/ui/persistence.js` — cookie + localStorage glue (today scattered across `app.js` and `ui.js`).
- `src/ui/shortcuts.js` — global keyboard shortcut table + dispatcher (today inline in `ui.js`; grep for `keydown` listeners and consolidate).
- New thin `src/ui/ui.js` (~600 LOC) — orchestrator per draft §9.1.

**Files modified:**
- `index.html:41-726` — body replaced with `<div id="app-root"></div>` + the 8-9 hidden stash divs that legacy code expects (e.g., `#optimization-controls-stash`). The new `Shell.mount()` builds the DOM. Tailwind utility classes go on the new DOM where appropriate.
- `index.html:778-790` — script load order updated for new module tree. Order:
  1. config + core (unchanged)
  2. helpers (the 9 satellite UI modules + `randomization-utils.js`)
  3. `src/ui/skin/skin-manager.js`
  4. `src/ui/utils.js`, `motion.js`, `focus.js`, `icons.js`
  5. `src/ui/components/*` (alpha order)
  6. `src/ui/overlays/*` (alpha order)
  7. `src/ui/controls-registry.js`
  8. `src/ui/shell/*`, `src/ui/panels/*`
  9. `src/ui/persistence.js`, `src/ui/shortcuts.js`
  10. `src/ui/ui.js` (new orchestrator)
  11. `src/app/app.js`, `src/main.js`
- Old `src/ui/ui.js` renamed to `src/ui/_ui-legacy.js` and **not** loaded.
- `src/render/renderer.js` token cache: read `--ui-*` names directly under meridian-* skins (Phase 0 deferred this — meridian-* aliases `--color-*` only via the palette file; under classic-* skins the legacy aliases keep working via `classic-*.css`'s `--ui-* → var(--color-*)` mapping).

**Acceptance:** with `meridian-dark` active, app shell visually matches mockup; every algorithm renders its parameter list correctly; layers/pens panels work; angle dial release wave plays; section collapse animates. With `classic-dark`, the app falls back to a Tailwind-styled but new-DOM rendering — visually different from today (because DOM changed) but functionally identical. **This is the highest-risk phase**; do not merge until manual regression of every algorithm passes.

**Test cases:**
- `tests/unit/controls-registry-compile.test.js` (compile gate): for each algorithm type, instantiate ALGO_DEFAULTS, iterate every CONTROL_DEFS entry, call its `showIf` (if present) with the defaults — assert no `ReferenceError`. Failure blocks merge.
- `tests/integration/ui-orchestration.test.js`:
  - `create layer of every algorithm type (17), assert algo-config-panel renders the expected control count per controls-registry`
  - `change every numeric parameter once via slider component → engine.updateLayerParam called with right id+value`
  - `change every checkbox once → param committed`
  - `change every select once → param committed`
  - `toggle layer visibility → renderer.invalidate fires`
  - `reorder layers via layer-item drag → engine.reorderLayer called`
  - `add pen → palette gains entry, renderPens shows it`
  - `swap algorithm type for an existing layer → storeLayerParams cached + restoreLayerParams applied`
- `tests/e2e/golden-flow.spec.ts` (Playwright):
  - `open app → add SVG-distort layer → drop SVG file → import succeeds → save project → reload → state restored bit-for-bit`
  - `add 3 layers, group them, save, reload, verify group hierarchy`
  - `enter pen tool, draw 4-point path, commit with Enter, verify drawable layer added`
- Visual baselines: shell-empty, shell-with-layers, each panel collapsed/expanded, each algorithm's controls list — across all 5 skins.
- Performance (`tests/perf/`):
  - `slider drag at 60 fps with 50 layers active` (frame budget 16.7ms p95)
  - `panel switch (tabs) under 80ms (no layout thrash)`
  - `algorithm-change rebuild of dynamic-controls under 120ms with 100 controls`

### Phase 3: Modals, Overlays, Menus (5 days)
**Files created:**
- `src/ui/modals/{document-setup,grid-settings,color-picker,help-shortcuts,export-svg,about,rainfall-silhouette}.js` (7 files).

**Modal/menu migration mapping (from `ui.js` line numbers):**
| Old | New |
|---|---|
| `openColorModal()` ui.js:7349 | `modals/color-picker.js` |
| Help/shortcuts UI ui.js:7557 | `modals/help-shortcuts.js` |
| Export SVG ui.js:6884 | `modals/export-svg.js` |
| Document Setup `index.html:499-683` | `modals/document-setup.js` |
| Grid Settings `index.html:685-725` | `modals/grid-settings.js` |
| Layer add menu `#layer-add-menu` | `overlays/menu.js` instance |
| Palette dropdown `#palette-menu` | `overlays/menu.js` instance |
| Layer filter menu `#layer-filter-menu` | `overlays/menu.js` instance |
| Layer right-click context menu (NEW) | `overlays/menu.js` instance |

**Wire up:**
- Toast for: layer-add success, project save/load success/failure, export complete, error states.
- Tooltip replaces every `info-btn`-triggered modal (long content opens modal via "Read more" button inside the tooltip).
- DragDropOverlay for: SVG import, `.vectura` open, rainfall silhouette, pattern import. Today these are scattered handlers; consolidate.

**Acceptance:** every modal entry point still works; focus trap correct; Esc-closes; click-outside opt-in; tooltips replace info-modal-on-click; toasts surface for all I/O; drop overlay shows on file drag.

**Test cases:**
- `tests/integration/modals/<modal>.test.js` — for each of the 7 modals: `opens via expected trigger`, `focus moves to first focusable`, `Tab cycles within modal`, `Esc closes and returns focus to trigger`, `click outside dismisses if dismissOnBackdrop=true`, `state preserved across open/close cycles`.
- `tests/e2e/export-flow.spec.ts`: open Export modal → tweak optimization step → preview canvas redraws → "Save" downloads SVG with expected element count.
- `tests/e2e/doc-setup-flow.spec.ts`: open Document Setup → switch to Custom profile → custom-size-fields appears → enter dims → apply → canvas resizes → save.
- `tests/a11y/modals.spec.ts`: axe-core run against every modal-open state, zero violations.
- Visual baselines per modal × skin (7 modals × 5 skins = 35 baselines).

### Phase 4: Editors & Specialized Surfaces (4 days)
**Files modified:** `src/ui/ui-petal-designer.js`, `src/ui/ui-pattern-designer.js`, `src/ui/ui-auto-colorize.js`, `src/ui/ui-touch.js`. Re-skin chrome only (color tokens, fonts, spacing, button styles); zero behavior changes. The internal SVG drawing surfaces of petal/pattern designers stay byte-identical.

**Files created:**
- Empty-state SVG illustrations (inline) for: empty layer list, empty canvas, empty palette, empty pattern catalog. Designed in monochrome `--ui-muted`.
- Indeterminate progress bar wired into: export pipeline (`ui-file-io.js` callbacks), large algorithm regenerations (engine.generate exceeds 200 ms), file save.

**Acceptance:** every specialized surface looks coherent with new chrome; mobile/tablet pass on Playwright tablet preset + manual iPad pass; no surface bleeds the old aesthetic.

**Test cases:**
- `tests/integration/petal-designer-roundtrip.test.js`: open designer → edit profile control points → save profile → close → reopen → state preserved → save .vectura → reload → state still preserved.
- `tests/integration/pattern-designer-roundtrip.test.js`: open designer → paint regions → save pattern → close → reopen layer using pattern → fills render identically.
- `tests/integration/auto-colorize.test.js`: enable auto-colorize on layer with N pens → re-run on edit → colors deterministic for same input.
- `tests/e2e/tablet.spec.ts` (Playwright tablet preset): all panels fit; touch modifier bar visible; pinch-zoom works.
- **Diff guardrail:** Phase 4 PR diff for `ui-petal-designer.js` and `ui-pattern-designer.js` is automatically scanned by a pre-merge script that flags any change to lines outside the chrome ranges in §2.12. Hits require explicit reviewer override.

### Phase 5: Polish, SDK, Cleanup (2 days)
- `docs/skin-authoring.md` — how to add a new skin (one CSS file + one manifest entry).
- `src/ui/skin/_template.css` — palette template.
- `scripts/skin-new.js` + `npm run skin:new` — generates a new skin from the template.
- Smoke-test the SDK by adding `meridian-twilight` (or accept-test variant) using only the SDK (zero JS edits beyond the manifest).
- Reduced-motion compliance pass (every keyframe respects `prefers-reduced-motion`).
- Keyboard a11y audit (Tab order, focus rings, Esc paths).
- **Cleanup (concrete deprecation schedule):**
  - Delete `src/ui/_ui-legacy.js` — confirm zero `<script src>` references, then `git rm`.
  - Delete `styles.css` — confirm every selector has been migrated to `src/ui/skin/{tokens,components,motion,*.css}`, then `git rm`. Visual-baseline diff must be 0 px.
  - Delete legacy `--color-*` aliases inside skin CSS files. Pre-delete: `rg "var\(--color-" src/ tests/` returns zero hits.
  - Drop `data-theme` mirror attribute. Pre-drop: `rg 'data-theme[\"\\=\\]]' src/ tests/` returns zero hits in JS code AND `rg '\\[data-theme' src/ui/skin/ styles.css 2>/dev/null` returns zero hits in CSS. (`styles.css` is already gone by this bullet, so the check is just `src/ui/skin/`.)
  - The `data-theme` write in `app.js:applyTheme` is removed in this same PR; the prior cleanup bullets above are preconditions in the PR's checklist.
- Final visual sweep with baseline updates.
- Doc updates: `README.md`, `CHANGELOG.md`, `plans.md`, `docs/agentic-harness-strategy.md`, `AGENTS.md`.

**Acceptance:** new skin authored without JS changes; axe-core green; no legacy files; full visual sweep clean.

---

## 4. EARS Functional Requirements (carried from draft, scoped to refined plan)

The draft's §11.4 EARS requirements (R-S1..R-A3) carry forward. Two additions reflecting the refined architecture:

- **R-K4 (Ubiquitous):** The system shall persist the active skin under the existing `vectura_prefs` cookie (today's `SETTINGS.uiTheme` field), so no new persistence code path is introduced.
- **R-K5 (Event-driven):** When `applyTheme()` is invoked with a new skin id, the system shall emit `vectura:skin-change` AFTER all CSS vars and stylesheet swap are applied (single-frame later via `requestAnimationFrame`).

---

## 5. Risk Adjustments (over draft §12)

| Risk | Mitigation in this refined plan |
|---|---|
| `themes-mockup.html` not in repo | Phase −1 makes commit-the-mockup the FIRST action; without it Phase 0 cannot proceed. |
| Tailwind utility classes contradicting skin styling | Tailwind retained per user decision; skin authors override `--vectura-*-rgb` only and must not redefine `bg-*`/`text-*` directly. Lint via grep in CI: skin CSS files must not contain `.bg-vectura-*` rules. |
| `CONTROL_DEFS` extraction breaks `showIf` predicates that closure-captured local helpers in old `ui.js` | Phase 2 includes a "compile" step: load `controls-registry.js` standalone in JSDOM and assert every `showIf` runs without ReferenceError. Any captured helper (e.g., FillPanel call) must be on `window.Vectura.*`. |
| Renderer breaks when `--color-*` aliases drop in Phase 5 | Phase 0's renderer cache already supports both names; Phase 5 grep verifies no `--color-*` references remain in JS before deletion. |
| 16K-line legacy `ui.js` has hidden state in IIFE-locals | Phase 2 keeps `_ui-legacy.js` on disk (just not loaded) so a kill-switch revert is one HTML edit. |
| Tailwind CDN unavailable mid-migration | No change from today (already a dependency). Phase 5 considers vendoring the CDN script locally; logged but not required. |

---

## 6. File Inventory

### Created
**Phase −1:** `docs/design/themes-mockup.html`, `docs/design/meridian-tokens.md`, `docs/design/mockup-baselines/*.png`. (Done; baseline PNGs deferred — recommend Phase 4 prep.)

**Phase 0:** `src/ui/skin/{tokens.css, components.css, motion.css, classic-dark.css, classic-light.css, lark.css, meridian-dark.css, meridian-light.css, skin-manager.js, tokens.js}`. (Done.)

**Phase 1:** 16 component files in `src/ui/components/` (+ `pendulum-list.js`, `pen-list.js`, `image-input.js`, `harmonograph-plotter.js` = 20), 6 overlay files in `src/ui/overlays/`, `src/ui/motion.js`, `src/ui/focus.js`, `src/ui/utils.js`, `src/ui/icons.js` (already exists at `src/ui/icons.js` — extend rather than create), `tests/visual/sandboxes/components.html`, plus 26 unit-test files in `tests/unit/components/` and `tests/unit/overlays/`.

**Phase 2:** 9 shell files in `src/ui/shell/`, 9 panel files in `src/ui/panels/`, `src/ui/controls-registry.js`, `src/ui/persistence.js`, `src/ui/shortcuts.js`, new `src/ui/ui.js`, `tests/integration/ui-orchestration.test.js`.

**Phase 3:** 7 modal files in `src/ui/modals/`, integration tests for each modal lifecycle.

**Phase 5:** `src/ui/skin/_template.css`, `scripts/skin-new.js`, `docs/skin-authoring.md`.

### Modified
- `index.html` — body, `<head>` link tags, script load order. (Phase 0: link tags + 2 script tags done; Phase 2: body rewrite + load order shuffle.)
- `src/config/defaults.js` — extended THEMES entries. (Phase 0: done.)
- `src/app/app.js` — `applyTheme` extension, `toggleTheme` cycle. (Phase 0: done.)
- `src/render/renderer.js` — token cache supports `--ui-*`. (Phase 2: not yet done.)
- `package.json` — `skin:new` script.
- `src/ui/ui-petal-designer.js`, `ui-pattern-designer.js`, `ui-auto-colorize.js`, `ui-touch.js` — chrome re-skin only.
- `README.md`, `CHANGELOG.md`, `plans.md`, `AGENTS.md`, `docs/agentic-harness-strategy.md`, `docs/testing.md`.

### Deleted (Phase 5)
- `src/ui/_ui-legacy.js` (renamed from old `ui.js`, kept during transition)
- `styles.css`
- Legacy `--color-*` aliases inside skin CSS files
- `data-theme` mirror attribute

---

## 7. Verification (End-to-End)

After each phase merges, run `npm run test:ci` (currently: unit + integration + e2e + visual + perf). All must be green.

**Manual verification at the end of Phase 5:**
1. `python -m http.server` → `localhost:8000`.
2. From skin picker, cycle through `classic-dark`, `classic-light`, `lark`, `meridian-dark`, `meridian-light`. Each transition is instant; no flash of unstyled content.
3. Side-by-side compare `meridian-dark` against `docs/design/themes-mockup.html` — every component matches.
4. Open every modal from menus and confirm parity with mockup language (no rogue Tailwind utility class colors leaking through).
5. Drag-drop an SVG → drop overlay shows → file imports → toast confirms.
6. Create a layer of each algorithm type (17 algorithms) → confirm `algo-config-panel` builds correct controls per `controls-registry.js`.
7. Edit pen colors → color picker round-trip works, pen sync to layers preserved.
8. Open Petal Designer → edit profile → save → reload project → state preserved.
9. Open Pattern Designer → paint regions → fill renders.
10. Force a save error (read-only filesystem) → danger toast surfaces.
11. Toggle `prefers-reduced-motion` in DevTools → animations collapse to ≤80 ms; dial wave / slider pulse skipped.
12. Resize viewport to 800 px → mobile pane handles take over; touch modifier bar visible.
13. Run `npm run skin:new -- twilight`; edit only the generated CSS palette; reload; select Twilight from skin picker; verify visuals match without any JS edits.

If all 13 steps pass and `npm run test:ci` is green, the migration is complete.

---

## 8. Estimated Effort

| Phase | Days | Status |
|---|---|---|
| −1 Mockup provenance | 0.5 | ✅ done |
| 0 Skin foundation | 2 | ✅ done |
| 1 Component library | 5 | ⏳ next |
| 2 Shell + panels + orchestrator | 7 | ⏳ |
| 3 Modals + overlays | 5 | ⏳ |
| 4 Editors + specialized | 4 | ⏳ |
| 5 Polish + SDK + cleanup | 2 | ⏳ |
| **Total** | **~5.5 weeks** for one engineer (Phase 1 component work and Phase 2 shell can overlap if two engineers; Phase 3 modals and Phase 4 editors can overlap). |

---

## Phase 2 step 3 actuals

**Shell modules extracted (8 of 9 planned):**
1. `src/ui/shell/theme-switcher.js` — `refreshThemeUi()`. DI: `{ getEl }`.
2. `src/ui/shell/menubar.js` — `setTopMenuOpen`, `initTopMenuBar`, `triggerTopMenuAction`. DI: `{ getEl }`.
3. `src/ui/shell/pane-left.js` — 8 methods (getLeftSectionDefaults, getLeftSectionMap, setLeftSectionCollapsed, initLeftPanelSections, setAlgorithmTransformCollapsed, initAlgorithmTransformSection, setAboutVisible, initAboutSection). DI: `{ getEl }`.
4. `src/ui/shell/pane-right.js` — `initRightPaneTabs`, `initPensSection`. DI: `{ getEl }`.
5. `src/ui/shell/workspace.js` — `initPaneToggles`, `initPaneResizers`. DI: `{ getEl }`.
6. `src/ui/shell/bottom-pane.js` — `toggleSettingsPanel`, `initBottomPaneToggle`, `initBottomPaneResizer`. DI: `{ getEl }`.
7. `src/ui/shell/toolbar.js` — `initToolBar` (494 lines, largest single extraction), `updateLightSourceTool`. DI: `{ getEl, isPetalisLayerType }`.
8. `src/ui/shell/header.js` — `initModuleDropdown`, `_buildModuleMenu`, `_showModuleMenu`, `_syncModuleDisplay`, `initMachineDropdown`. DI: `{ getEl, ALGO_DEFAULTS, MACHINES, SETTINGS }`.

**9th module ("shell") deferred:** its planned responsibilities (`bindGlobal`, `bindShortcuts`) route to `shortcuts.js` + `persistence.js` in step 5 per §2.4. No standalone `shell.js` needed at this stage.

**Deferred to step 4/5 (not shell-level):** `initSettingsValues` (deep deps on `getContrastTextColor` IIFE-local + multiple prototype methods), `initPaletteControls` (deep pens-panel methods).

**Line reduction:** `ui.js` went from 12,631 (start of step 3) → 11,777 lines (−854 lines, 6.8%).

**Test totals:** 584 unit (was 548, +36 compile-gate across 8 test files) + 66 integration + 13 visual + 2 perf — all green.

**Compile-gate tests added (8 files, 36 tests total):**
- `tests/unit/theme-switcher-compile.test.js` (4)
- `tests/unit/menubar-compile.test.js` (6)
- `tests/unit/pane-left-compile.test.js` (8)
- `tests/unit/pane-right-compile.test.js` (6)
- `tests/unit/workspace-compile.test.js` (5)
- `tests/unit/bottom-pane-compile.test.js` (5)
- `tests/unit/toolbar-compile.test.js` (5)
- `tests/unit/header-compile.test.js` (6) [note: total counts may vary slightly due to 1 test per `it()`]

**Script load order in index.html:**
`controls-registry.js` → `panels/algo-config-panel.js` → `shell/theme-switcher.js` → `shell/menubar.js` → `shell/pane-left.js` → `shell/pane-right.js` → `shell/workspace.js` → `shell/bottom-pane.js` → `shell/toolbar.js` → `shell/header.js` → `ui.js`

**Pattern confirmed at scale:** the `bind(deps)` DI-bag + `.call(this)` delegator + namespace-preservation pattern works for all extracted modules regardless of complexity. Cross-method calls round-trip cleanly through prototype delegators. Toolbar's `initToolBar` (which assigns methods like `setActiveTool` to `this`) worked without modification.

---

## Phase 2 step 4 actuals

**8 panel modules extracted (all per plan):**

1. `src/ui/panels/formula-panel.js` (`886499b`) — `updateFormula()`. DI: `{ getEl, escapeHtml, usesSeed }`.
2. `src/ui/panels/auto-colorize-panel.js` (`ede23da`) — namespace anchor; forwards to existing `src/ui/ui-auto-colorize.js` mixin via `window.Vectura._UIAutoColorizeMixin`. Methods: `initAutoColorizationPanel`, `getAutoColorizationConfig`, `getAutoColorizationTargets`, `applyAutoColorization`. DI: `{}` (sentinel — step 5 dissolves the mixin into this DI bag).
3. `src/ui/panels/noise-rack-panel.js` (`8eddbf4`) — namespace anchor; forwards to existing `src/ui/ui-noise-rack.js` mixin via `window.Vectura._UINoiseRackMixin`. Methods: `_buildNoiseRack` + 7 `ensure*Noises` helpers. DI: `{}` (sentinel — step 5 dissolves the mixin into this DI bag).
4. `src/ui/panels/transform-panel.js` (`360cbdc`) — `getDefaultTransformForType`, `storeLayerParams`, `restoreLayerParams`. DI: `{ ALGO_DEFAULTS, TRANSFORM_KEYS, clone }`.
5. `src/ui/panels/layers-panel.js` (`540dad5`) — `renderLayers()` (1,177-line body lifted verbatim). DI: `{ SETTINGS, escapeHtml }`.
6. `src/ui/panels/pens-panel.js` (`c98e9db`) — `setArmedPen`, `clearArmedPen`, `refreshArmedPenUI`, `getPaletteList`, `getActivePalette`, `applyPaletteToPens`, `addPen`, `removePen`, `initPaletteControls`, `renderPens`. DI: `{ getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken }`. Resolves the deferred-from-step-3 `initPaletteControls`.
7. `src/ui/panels/modifiers-panel.js` (`243eccf`) — `refreshModifierLayer`, `insertMirrorModifier`, `updatePrimaryPanelMode`, `refreshMaskingViews`, `ensureLayerMaskState`, `setLayerMaskEnabled`, `setLayerMaskHidden`. DI: `{ getEl }`.
8. `src/ui/panels/algorithm-panel.js` (`56848c9`) — `syncPrimaryModuleDropdown`, `isModifierType`, `isDrawableLayerType`, `rememberDrawableLayerType`, `getPreferredNewLayerType`. DI: `{ getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms }`. Distinct from `algo-config-panel` (which renders the dynamic-controls container) and `header` (which builds the dropdown `<select>`).

**Deferred-from-step-3 resolution:**
- `initPaletteControls` ended up in `pens-panel.js` (extracted as a regular method alongside `renderPens`). DI bag absorbed it cleanly.
- `initSettingsValues` was NOT moved in step 4 — it remains on the legacy `UI.prototype`. Reason: it deeply references `getContrastTextColor` (an IIFE-local) plus `this.refreshThemeUi()` and prototype methods from multiple satellite mixins. **Step 5 must route it into a dedicated `settings-panel.js` or fold it into `persistence.js` as `applyPersistedSettings()`** since most of its body is wiring inputs to `SETTINGS.*` fields with persistence side-effects.

**Files shipped (created):**
- `src/ui/panels/formula-panel.js`
- `src/ui/panels/auto-colorize-panel.js`
- `src/ui/panels/noise-rack-panel.js`
- `src/ui/panels/transform-panel.js`
- `src/ui/panels/layers-panel.js`
- `src/ui/panels/pens-panel.js`
- `src/ui/panels/modifiers-panel.js`
- `src/ui/panels/algorithm-panel.js`
- `tests/unit/{formula,auto-colorize,noise-rack,transform,layers,pens,modifiers,algorithm}-panel-compile.test.js` (8 compile-gate tests, 41 tests total)

**Files modified:**
- `src/ui/ui.js` — bodies replaced with 1-line delegators; 8 new bind() calls at the bottom.
- `index.html` — 8 new `<script src="./src/ui/panels/*.js" defer></script>` tags inserted before `ui.js`.

**Line reduction:** `ui.js` went from 11,777 (end of step 3) → 10,129 lines (−1,648 lines, −14%). Total panel module LOC: 5,809 (most in `algo-config-panel.js` at 3,576 from step 2; new step-4 panels add 2,233).

**Test totals before → after:** 584 unit + 66 integration + 13 visual + 2 perf → 625 unit + 66 integration + 13 visual + 2 perf. Net +41 unit (8 new compile-gate test files).

**Compile-gate tests added (8 files, 41 tests total):**
- `tests/unit/formula-panel-compile.test.js` (5)
- `tests/unit/auto-colorize-panel-compile.test.js` (4)
- `tests/unit/noise-rack-panel-compile.test.js` (4)
- `tests/unit/transform-panel-compile.test.js` (6)
- `tests/unit/layers-panel-compile.test.js` (3)
- `tests/unit/pens-panel-compile.test.js` (6)
- `tests/unit/modifiers-panel-compile.test.js` (7)
- `tests/unit/algorithm-panel-compile.test.js` (6)

**Script load order in `index.html` (current):**
`controls-registry.js` → `panels/algo-config-panel.js` → `shell/{theme-switcher,menubar,pane-left,pane-right,workspace,bottom-pane,toolbar,header}.js` → `panels/{formula,auto-colorize,noise-rack,transform,layers,pens,modifiers,algorithm}-panel.js` → `ui.js`

**Patterns / gotchas the next step (orchestrator + persistence + shortcuts) must know:**

1. **JSDoc `*/` collision:** the `noise-rack-panel.js` first draft used `ensure*/create*` in a JSDoc block, which silently closed the comment and produced "Unexpected token *" inside JSDOM-loaded scripts. If a panel description includes `*/` text, escape it. Tests catch this immediately because the runtime loader pulls scripts from `index.html` and feeds them to `vm.runInContext`.
2. **Mixin shim panels (auto-colorize, noise-rack):** these are namespace anchors only. Their methods do NOT have prototype delegators in `ui.js` because the existing mixin (`Object.assign(UI.prototype, window.Vectura._UI*Mixin)`) already attaches them directly. Adding delegators would create cycles. Step 5 must dissolve those mixins into the panels' bind() bags and ADD prototype delegators at that time.
3. **`this.X()` cross-method calls round-trip cleanly** through prototype delegators (e.g., `pens-panel`'s `applyPaletteToPens` calls `this.renderPens()` which is the prototype delegator that calls `PensPanel.renderPens.call(this)`). No need to inline-resolve.
4. **Unused destructure warnings:** the panel-extraction script generates `const { getEl, escapeHtml, ... } = requireDeps(...)` at the top of every method, even when only some of those deps are used. This is intentional — keeps the dep contract uniform — and produces no runtime overhead.
5. **`renderLayers()` is the largest single body in the codebase** (1,177 lines). It still references `this.*` for ~30 prototype methods. Step 5 should NOT try to dissolve those `this.*` calls — leave them as prototype delegations and migrate the called methods themselves into the appropriate panels over time.
6. **Bind order matters but is purely additive:** all `*.bind({...})` calls happen at the bottom of `src/ui/ui.js`'s IIFE. Step 5 will need to add `Persistence.bind(...)` and `Shortcuts.bind(...)` in the same block.
7. **Layer-type predicates moved to AlgorithmPanel:** if step 5 needs `isModifierType`, `isDrawableLayerType`, `rememberDrawableLayerType`, or `getPreferredNewLayerType`, they're now in `panels/algorithm-panel.js` (delegated through `UI.prototype`). The function-call surface didn't change — `this.isDrawableLayerType('foo')` still works.
8. **`initSettingsValues` is the biggest open extraction.** It's the next sensible target for step 5 because it's the natural seam where settings-panel UI meets persistence (cookie load/save). Recommend moving it into `src/ui/persistence.js` as `applyPersistedSettings()` rather than a new `settings-panel.js` — the body is mostly wiring input event handlers that toggle `SETTINGS.*` fields and call `App.persistSettings()`-type side effects.

---

## Phase 2 step 5 actuals

**Three new modules extracted (per plan):**

1. `src/ui/persistence.js` (`e0bae17`) — `applyPersistedSettings` (was `initSettingsValues`, deferred from steps 3 + 4), `scrollLayerToTop`, `captureLeftPanelScrollPosition`. DI: `{ getEl, SETTINGS, getContrastTextColor }`.
2. `src/ui/shortcuts.js` (`accfd99`) — `bindShortcuts` (the entire 542-line body: keydown handler + keyup handler + the layers add/filter/search menu wiring that historically lived in the same function) and `handleTopMenuShortcut`. DI: `{ getEl, SETTINGS, isPrimitiveShapeLayer }`.
3. `src/ui/_ui-orchestrator.js` (`5529209`) — **blueprint, not yet loaded.** Authored alongside legacy `ui.js`. Documents the constructor init-method order, the bind() block ordering, and the namespace-preservation shim that step 6 must keep. Constructor throws a clear "blueprint" error so step 6 has a loud runtime signal that the swap-in is incomplete.

**Orchestrator placement:** option (a) — alongside as `_ui-orchestrator.js`. Legacy `ui.js` continues to drive the app; step 5 stays fully reversible. Step 6 swap involves: (a) finishing migration of surviving prototype methods + IIFE locals, (b) renaming `ui.js` → `_ui-legacy.js`, (c) renaming `_ui-orchestrator.js` → `ui.js`, (d) updating `index.html` to load the new `ui.js` (and dropping `_ui-legacy.js` from the load list once parity is confirmed).

**Mixin dissolution (auto-colorize-panel + noise-rack-panel): DEFERRED to Phase 3** per the task spec's "Optional but recommended (deferred from step 4)" allowance. Both panels remain namespace anchors that forward to `window.Vectura._UIAutoColorizeMixin` and `window.Vectura._UINoiseRackMixin`. Phase 3 (modals/overlays) will likely touch the same surfaces and is a more natural seam.

**Files shipped (created):**
- `src/ui/persistence.js` (188 lines)
- `src/ui/shortcuts.js` (552 lines)
- `src/ui/_ui-orchestrator.js` (122 lines, NOT loaded in step 5 — step 6 wires it in)
- `tests/unit/persistence-compile.test.js` (4 tests)
- `tests/unit/shortcuts-compile.test.js` (4 tests)
- `tests/unit/ui-orchestrator-compile.test.js` (2 tests)

**Files modified:**
- `src/ui/ui.js` — `initSettingsValues`, `scrollLayerToTop`, `captureLeftPanelScrollPosition`, `handleTopMenuShortcut`, `bindShortcuts` bodies replaced with 1-line delegators; `Persistence.bind()` and `Shortcuts.bind()` calls added at the bottom.
- `index.html` — added `<script src="./src/ui/persistence.js" defer></script>` and `<script src="./src/ui/shortcuts.js" defer></script>` BEFORE `ui.js`. `_ui-orchestrator.js` is NOT in the load list (intentionally — see "Orchestrator placement" above).

**Line reduction:** `ui.js` went from 10,129 (end of step 4) → 9,425 lines (−704 lines, −7%). Legacy `ui.js` is still very large because the lift-in-place strategy (verbatim body lift + delegator) preserves all the IIFE locals in the legacy file — they're still needed there for un-extracted methods.

**Test totals before → after:** 625 unit + 66 integration + 13 visual + 2 perf → 635 unit + 66 integration + 13 visual + 2 perf. Net +10 unit (3 new compile-gate test files: 4 + 4 + 2).

**Compile-gate tests added (3 files, 10 tests total):**
- `tests/unit/persistence-compile.test.js` (4)
- `tests/unit/shortcuts-compile.test.js` (4)
- `tests/unit/ui-orchestrator-compile.test.js` (2)

**Script load order in `index.html` (current, end of step 5):**
`controls-registry.js` → `panels/algo-config-panel.js` → `shell/{theme-switcher,menubar,pane-left,pane-right,workspace,bottom-pane,toolbar,header}.js` → `panels/{formula,auto-colorize,noise-rack,transform,layers,pens,modifiers,algorithm}-panel.js` → `persistence.js` → `shortcuts.js` → `ui.js`

**Patterns / gotchas the next step (step 6: index.html body rewrite + rename) must know:**

1. **`bindShortcuts` body includes more than keyboard wiring.** The historical 542-line body wires the keydown + keyup handlers AND the layers add-menu / filter-menu / search wiring. They were lifted as one unit (verbatim) into `shortcuts.js` because separating them would have required tracking 6+ closure-shared variables (`addMenuEl`, `algoSubmenuEl`, `filterMenu`, `_doAddAlgoLayer`, `_LVL_I`, etc.). If step 6 ever wants to split this, it needs to lift those variables into instance state on `this.*` first.
2. **`initSettingsValues` references `this.refreshThemeUi()` and `this.refreshDocumentUnitsUi()`.** Both currently round-trip through prototype delegators (theme-switcher.js + still-on-prototype). Step 6 swap must keep those delegators reachable until `refreshDocumentUnitsUi` is also extracted.
3. **`_ui-orchestrator.js` constructor THROWS by design.** A test (`ui-orchestrator-compile.test.js`) confirms this. Step 6 must replace the throw with the real bind()-block + init-method dispatch (see the JSDoc comment in the file for the exact init-method order — 28 calls, deviation has historically caused subtle bugs).
4. **Namespace-preservation shim is load-bearing.** The bottom-of-IIFE `for (const _k of Object.keys(_existingUI)) { if (UI[_k] === undefined) UI[_k] = _existingUI[_k]; }` patch protects every panel/shell module that registers BEFORE `ui.js` loads (which is all of them). Step 6 swap must keep it byte-identical.
5. **Mixin dissolution is now Phase 3 work.** `auto-colorize-panel.js` and `noise-rack-panel.js` are still namespace anchors that forward to `window.Vectura._UIAutoColorizeMixin` and `window.Vectura._UINoiseRackMixin` (attached via `Object.assign(UI.prototype, …)` in legacy ui.js around the `class UI` declaration). Step 6 should NOT try to dissolve these — defer to Phase 3 where the modal/overlay seam is a more natural touch point.
6. **The blueprint orchestrator is intentionally not in `index.html`.** Loading it would crash the page (the constructor throws). This is the "alongside, reversible" pattern called out in the task spec — keep step 5 backout-safe.
7. **`ui.js` is still 9,425 lines** because the IIFE locals (`COMMON_CONTROLS`, `OPTIMIZATION_STEPS`, `IMAGE_NOISE_DEFAULT_AMPLITUDE`, the giant `*_NOISE_DEFS` tables, `getAnchoredColorProxyInput`, `openColorPickerAnchoredTo`, `escapeXmlAttr`, `normalizeSvgId`, `roundToStep`, `formatValue`, `formatDisplayValue`, `getDisplayConfig`, `toDisplayValue`, `fromDisplayValue`, `attachKeyboardRangeNudge`, `usesSeed`, `getThemeToken`, etc.) and ~50 surviving prototype methods (modal management, file I/O wrappers, pen wiring, group/ungroup, harmonograph plotter, layer settings modal, scissor/algo-draw/manual layer creation, expand/split layer, etc.) all still live there. Step 6 needs to either (a) move those into satellite modules and shrink `ui.js` to ~600 LOC before swap, or (b) accept that `_ui-legacy.js` will continue to be loaded as a satellite carrying the un-extracted bodies until further phases finish the migration.

---

## Phase 2 step 6 actuals

**Migration shape chosen: option (b) — legacy carried as satellite.** Per the plan's Resume-step-6 appendix, option (a) (fully draining the ~50 surviving prototype methods + ~30 IIFE locals from legacy `ui.js` into satellite modules) was out of budget for this step. Option (b) keeps `_ui-legacy.js` loaded as a satellite that owns the `class UI` declaration, mixin assignment, the 19-call `bind()` block, and the namespace-preservation shim. The new thin `ui.js` is the runtime entry script `index.html` loads, and aliases `window.Vectura.UI` as `window.Vectura.UI.Orchestrator` so callers preferring the explicit name reach the same constructor as `new UI(app)`. The init-method dispatch (28 calls in the constructor) lives in legacy, untouched. This is the explicit "pragmatic fallback" the plan permits — option (a) can be completed incrementally over Phase 3+ as each prototype method extracts to a satellite.

**Files actually shipped** (commit `562f9b2`):

- `src/ui/_ui-legacy.js` (renamed from `src/ui/ui.js` via `git mv`, 9,430 lines, byte-identical to pre-rename `ui.js`). All `bind()` calls, mixin attachment, init-method dispatch, and namespace shim still here.
- `src/ui/ui.js` (renamed from `src/ui/_ui-orchestrator.js` via `git mv`, ~130 lines after step-6 edits). Replaces the step-5c blueprint that threw on construction. Now is a thin entry script that aliases the orchestrator and provides a tripwire when loaded standalone.
- `src/ui/_ui-orchestrator.js` — deleted (renamed away).
- `index.html` — added `<script src="./src/ui/_ui-legacy.js" defer></script>` BEFORE `<script src="./src/ui/ui.js" defer></script>`. The new `ui.js` MUST load AFTER `_ui-legacy.js` so `window.Vectura.UI = UI` (the class) is in place when the orchestrator entry runs. Body markup unchanged — none of the IDs in §2.8 ("Hidden DOM Stash Inventory") were touched.
- `tests/helpers/load-vectura-runtime.js` — added `_ui-legacy.js` to the `includeUi=false` skip list.
- `tests/unit/ui-orchestrator-compile.test.js` — rewritten to assert the new standalone shape: when `ui.js` loads without `_ui-legacy.js`, the `Orchestrator` placeholder throws a clear "load order" error trip-wire.

**Index.html body changes:** none. Shell modules already query existing IDs, so no DOM rewrite was needed for option (b). Step 6's index.html change is purely the script-load-order edit (one extra `<script>` tag for `_ui-legacy.js`).

**Browser smoke test results** (programmatic via Playwright on local `python3 -m http.server`):

- Page loads with **zero pageerrors** (only the pre-existing Tailwind CDN production warning on console).
- `typeof window.Vectura.UI === 'function'` (legacy class registered).
- `window.Vectura.UI.Orchestrator === window.Vectura.UI` (alias confirmed).
- `app.ui.constructor.name === 'UI'`, `app.ui.controls` populated, theme is `'dark'` initially.
- Theme switch (dark → lark) works via `app.toggleTheme()`.
- Top menu (`[data-top-menu-trigger]`) opens on click — `aria-expanded` flips to `'true'`.
- Layer add via `engine.addLayer({ algorithm: 'flowfield' })` works (`layers.length: 0 → 1`).
- `ui.buildControls()` and `ui.refreshThemeUi()` round-trip cleanly with no exception.
- `ui.openExportModal()` runs without throwing.

**Test totals before → after:** 635 unit + 66 integration + 13 visual + 2 perf → 635 unit + 66 integration + 13 visual + 2 perf. No new tests added; the existing `ui-orchestrator-compile.test.js` was rewritten in place (still 2 tests). e2e was sampled — the one pre-existing flake (`shape reticle cursor` Alt-drag test, 1.13 px positioning discrepancy) reproduces on baseline `1f32b72` without step-6 changes, so it's not a step-6 regression.

**Patterns / gotchas the next step (step 7: renderer token cache) and Phase 3 must know:**

1. **`ui.js` is the runtime entry; `_ui-legacy.js` is the implementation.** Anything that writes `window.Vectura.UI = X` from a third script that loads AFTER `_ui-legacy.js` but BEFORE `ui.js` will clobber the class. Step-6's new `ui.js` does NOT re-run the namespace-preservation shim — the shim only exists in `_ui-legacy.js`'s IIFE. If a future module ever needs to attach to `window.Vectura.UI`, it must do so via static-property assignment (`Vectura.UI.Foo = ...`), not by reassigning `Vectura.UI` itself.
2. **The `App` IIFE in `src/app/app.js` destructures `UI` from `window.Vectura` at script-load time.** That destructure runs AFTER `app.js` loads (which is AFTER `ui.js`, which is AFTER `_ui-legacy.js`), so by then `window.Vectura.UI` is the legacy class. `new App()` later calls `new UI(this)` — that picks up the captured reference. Do NOT reorder `app.js` to load before `ui.js` or `_ui-legacy.js`.
3. **Compile-gate test now exercises a different shape.** `tests/unit/ui-orchestrator-compile.test.js` loads ONLY `src/ui/ui.js` in JSDOM (no legacy, no panels) and asserts the standalone trip-wire. Future Phase 3 work that promotes more stuff into `ui.js` must keep this trip-wire shape OR rewrite the test.
4. **The 19-call `bind()` block stays in `_ui-legacy.js`.** Each individual `bind()` call uses IIFE-local helpers that aren't exposed (`getEl`, `SETTINGS`, `ALGO_DEFAULTS`, `escapeHtml`, etc.). To move a `bind()` call into the new `ui.js`, those helpers must first be exposed as `window.Vectura.UI.helpers.<name>` (or moved into a shared `src/ui/helpers/*.js` module). That is Phase 3+ work.
5. **Step 7 (renderer token cache) does NOT touch `_ui-legacy.js` or `ui.js`.** It edits `src/render/renderer.js` to cache `--ui-*` token reads. The UI-orchestrator change in step 6 is independent and should not interact with the renderer change.
6. **Mixin dissolution remains deferred.** `auto-colorize-panel.js` and `noise-rack-panel.js` are still namespace anchors that forward to `window.Vectura._UIAutoColorizeMixin` / `window.Vectura._UINoiseRackMixin`. The mixin attachment lines (`Object.assign(UI.prototype, ...)`) are in `_ui-legacy.js` lines 9253–9260. Phase 3 modal/overlay extraction is a more natural seam.
7. **Browser smoke is required for step-6-class changes.** Automated unit/integration/visual/perf tests do NOT exercise the actual page-load runtime (they all use JSDOM stubs or skip UI scripts). For changes that reorder index.html script tags or rename UI files, run a quick programmatic Playwright smoke (or open `file:///.../index.html` in a real browser) and assert: page-error count is zero, `window.app.ui.constructor.name === 'UI'`, `app.engine.layers` is queryable.

---

## Phase 2 step 7 actuals

**One-commit step.** Implementation: `9628561` (`feat(skin): Phase 2 step 7 — renderer token cache reads --ui-* directly`).

**Files shipped:**

- `src/render/renderer.js` — modified. The closure-local `getThemeToken(name, fallback)` helper at lines 47–61 was rewritten to:
  - Consult canonical `--ui-*` tokens first when the requested name is a known legacy `--color-*` alias (today only `--color-accent` → `--ui-accent`; the `_UI_TOKEN_FOR_COLOR` mapper is the single seam where new aliases get added).
  - Fall back to the original name if the `--ui-*` value is unset.
  - Cache by name (`Map<string, string>`) — no longer keyed by `dataset.theme`. Invalidation is event-driven instead of dataset-derived.
  - Listen to `document.addEventListener('vectura:skin-change', invalidate)` so any skin swap drops the cache. The event is dispatched by `src/ui/skin/skin-manager.js` (line 141) inside a `requestAnimationFrame` after the `data-ui-skin` attribute and stylesheet swap commit.
  - Surface the cache as `Renderer.__tokenCache = { get, invalidate }` for unit tests (test-only hook; production code keeps calling the closure-local `getThemeToken`).
- `tests/unit/render/token-cache.test.js` — new (7 tests). RGR red-then-green proof. Asserts: API surface, direct `--ui-*` read, fallback on undefined, in-cache reads, `vectura:skin-change` invalidates, `--color-accent` request honors `--ui-accent` first, `--color-accent` falls back to direct read when no `--ui-*` is set.
- `tests/unit/render/` directory — new. First test under `tests/unit/render/`; existing renderer tests live at `tests/unit/renderer-*.test.js` (kept untouched).

**Cache invalidation event:** `vectura:skin-change`, dispatched on `document` by `src/ui/skin/skin-manager.js:141` inside the `activate()` flow (one rAF after `data-ui-skin` and `link#active-skin` are written). Renderer subscribes once at IIFE init time.

**Read path choice:** the renderer continues to call `getComputedStyle` directly via the closure-local helper rather than going through `window.Vectura.UI.tokens.get` — the tokens.js helper does no caching, and the renderer reads tokens many times per frame (~30 calls in the draw paths inventoried). The cache lives in the renderer's IIFE so no extra global hop on the hot path.

**Aliasing audit (legacy skins):** all 16 unique tokens read by the renderer are either `--render-*` (which every skin file defines directly — no alias chain involved) or `--color-accent`. The legacy palette files (`classic-dark.css`, `classic-light.css`, `lark.css`) set `--ui-accent: var(--color-accent)`; meridian palettes set `--color-accent: var(--ui-accent)`. So reading `--ui-accent` first then falling back to `--color-accent` resolves byte-identically under all 5 skins. **Visual baselines passed without updates** (13/13 SVG baselines, 0-pixel diff).

**Test totals before → after:** 635 unit + 66 integration + 13 visual + 2 perf → **642 unit + 66 integration + 13 visual + 2 perf**. Net +7 unit tests (the new `tests/unit/render/token-cache.test.js`).

**Patterns / gotchas Phase 3 must know:**

1. **The `_UI_TOKEN_FOR_COLOR` mapper is the only place renderer code maps legacy `--color-*` names to canonical `--ui-*`.** Today it has one entry. Adding a new `getThemeToken('--color-foo', ...)` call site requires adding a mapper entry — otherwise the canonical Meridian `--ui-foo` token won't be consulted. Future Phase 3 work that wires renderer-bound modal/menu surfaces should prefer reading `--ui-*` names directly (skipping the mapper), keeping the mapper a back-compat artifact.
2. **Cache lifetime is process-wide, not per-Renderer.** The Map lives in the renderer.js IIFE closure, not on the Renderer instance. Multiple Renderer instances share it, which is fine because tokens are document-element scoped. Tests can clear it via `Renderer.__tokenCache.invalidate()`.
3. **The `vectura:skin-change` event fires inside `requestAnimationFrame`.** Tests that synchronously read tokens immediately after `SkinManager.activate(...)` will see stale cached values until the rAF fires. The new test simulates the event directly (no rAF needed) — production code is correct because the renderer redraws after the event.
4. **`Renderer.__tokenCache` is a test-only hook.** The double-underscore prefix marks it as private. Phase 3 code should NOT depend on it; if a Phase 3 module needs cached token reads, expose a real API on `Vectura.UI.tokens` (which still has no cache today).

---

## Phase 3 step 1 actuals (1 of 7 modals shipped)

**Status: in progress.** Phase 3 is intentionally being delivered as a sequence of per-modal commits rather than a single phase-spanning push, per the user's directive ("Commit per modal so progress is durable"). Step 1 lands the smallest single-purpose modal — Help / Shortcuts — and proves the modal-extraction pattern. The remaining 6 modals + 4 menu wirings + mixin dissolution are queued as Phase 3 steps 2..N (see Resume appendix).

**Commit:** `ff783c5` (`feat(skin): Phase 3 — extract modals/help-shortcuts.js`).

**Files shipped:**

- `src/ui/modals/help-shortcuts.js` — 394 lines. Lifts `buildHelpContent` (290-line static-markup body), `_applyHelpPlatform`, and `openHelp` from `_ui-legacy.js:6051-6385`. Registered as `window.Vectura.UI.Modals.HelpShortcuts`. Composition contract: still calls `this.openModal` / `this.closeModal` / `this.modal` (all of which remain on `UI.prototype` in legacy until a future modal-overlay primitive promotion).
- `tests/unit/modals/help-shortcuts-compile.test.js` — 6 tests (compile gate, bind tripwire, all 7 tabs render, platform toggle).
- `tests/integration/modals/help-shortcuts.test.js` — 5 tests (lifecycle: opens via `app.ui.openHelp`, initial-tab logic for `focusShortcuts` true/false, tab-button click switches active panel, platform toggle swaps `[data-mac]` text, `closeModal()` removes `.open` class).
- `index.html` — added `<script src="./src/ui/modals/help-shortcuts.js" defer></script>` BEFORE `_ui-legacy.js`.
- `src/ui/_ui-legacy.js` — `buildHelpContent` / `_applyHelpPlatform` / `openHelp` bodies replaced with 1-line delegators. New `bind()` call added to the bottom-of-IIFE bind block.

**DI bag:** `{}` (no IIFE-local deps — body is fully static template-literal markup and depends only on `navigator.platform` for the auto-detect).

**Line reduction:** `_ui-legacy.js` 9,425 → 9,112 (-313 lines, -3.3%).

**Test totals before → after:** 642 unit + 66 integration + 13 visual + 2 perf → **648 unit + 71 integration + 13 visual + 2 perf** (+6 unit, +5 integration). All four suites green.

**Browser smoke:** NOT run for this step. The same risk profile that drove the Phase 2 step-6 browser-smoke requirement (script-tag reorder + new global write) applies here: the new `<script src="./src/ui/modals/help-shortcuts.js">` tag must load BEFORE `_ui-legacy.js`. Integration tests cover the full `loadVecturaRuntime({ useIndexHtml: true })` path so the script-load order is exercised under JSDOM, but a real browser smoke (open `python -m http.server`, click Help button, exercise 7 tabs + platform toggle) should be done as part of the larger Phase-3 closeout when more modals land.

**Patterns / gotchas Phase 3 step 2+ must know:**

1. **`Modals` namespace anchored.** `window.Vectura.UI.Modals = { HelpShortcuts: {...} }`. Future modals attach to the same anchor (`Modals.ColorPicker`, `Modals.ExportSVG`, etc.). Compile gates assert the same shape: `expect(w.Vectura.UI.Modals).toBeTruthy()` then drill in.
2. **Composition contract preserved, NOT replaced.** The modal still calls `this.openModal(...)` (which lives in legacy). Phase 3 has not yet promoted the modal-overlay primitive at `src/ui/overlays/modal.js` to be the open/close primitive. Each modal extraction can defer that promotion or do it incrementally. Recommended: do all 7 modal lifts first (each composing legacy `this.openModal`), THEN do a single "promote `overlays/modal.js`" commit that swaps every modal to the new primitive at once. This keeps each modal-extraction commit small and reviewable.
3. **`this.modal.bodyEl` is a stable handle.** The legacy `createModal()` returns `{ overlay, titleEl, bodyEl }` and stashes it on `this.modal`. Every extracted modal's `openHelp`-style "open + wire" method assumes `this.modal.bodyEl.querySelector(...)` works after `openModal()`. Don't break this contract during the primitive promotion.
4. **Test-helper `loadVecturaRuntime({ useIndexHtml: true })` parses `index.html` automatically** — adding new modal `<script>` tags between `shortcuts.js` and `_ui-legacy.js` flows through without code changes to the test helper. Verified working for `help-shortcuts.js`.
5. **Static-markup modals are the easiest extractions.** `help-shortcuts` had no IIFE-local deps. Document Setup and Grid Settings have markup currently in `index.html:540-740` — those are the natural step-2 / step-3 targets (lift markup INTO JS-built DOM, strip from `index.html`). The harder ones — Color Picker (HSV + hex math), Export SVG (11 methods + optimization preview pipeline), Rainfall Silhouette (file I/O) — should land later.
6. **Carry-over deferred items still pending** (per Phase 2 step 5 closure):
   - Mixin dissolution for `auto-colorize-panel.js` / `noise-rack-panel.js` — `Object.assign(UI.prototype, ...)` lines still in `_ui-legacy.js` ~9253-9260.
   - ~50 surviving prototype methods + ~30 IIFE locals in `_ui-legacy.js`. Step 1 deleted 325 lines of method body but the closure-locals (used by other un-extracted methods) are unchanged.
   - `refreshDocumentUnitsUi` / `refreshThemeUi` cross-call resolution.

---

## Phase 3 step 2 actuals (2 of 7 modals shipped)

**Status: in progress.** Step 2 lands the Grid Settings slide-out side panel (`6f277ba`). The user-issued task message asked for "About modal" + "Grid Settings" — but per the step 1 actuals (and confirmed by re-grepping), there is **no standalone About modal** in `_ui-legacy.js`. The About surface is `#algo-about` in the left pane, already delegated to `PaneLeft.initAboutSection`. Step 2 therefore landed only Grid Settings; the would-be "About" slot is rolled forward to step 3 with re-scoped recommendations below.

**Commit:** `6f277ba` (`feat(skin): Phase 3 — extract modals/grid-settings.js + remove markup from index.html`).

**Files shipped:**

- `src/ui/modals/grid-settings.js` — 213 lines. Owns `PANEL_HTML` (the 38-line markup formerly at `index.html:747-787`), a `mount(host)` that injects the panel into a host element (idempotent — safe to call twice), and `bindHandlers()` that wires the open trigger, close ✕ button, and six grid controls (overlay master, opacity slider+number, style select, color pill+picker, size). Registered as `window.Vectura.UI.Modals.GridSettings`.
- `tests/unit/modals/grid-settings-compile.test.js` — 6 tests (compile gate, bind-tripwire on both `mount` and `bindHandlers`, mount injects all six expected control IDs, mount idempotency, PANEL_HTML preserves all four `<option>` values).
- `tests/integration/modals/grid-settings.test.js` — 6 tests (panel mounted into `<main>`, View > Grid Settings open/close lifecycle, overlay master toggle, opacity slider mutates SETTINGS, style select mutates SETTINGS, size input clamps to 0.1 minimum).
- `index.html` — `<script src="./src/ui/modals/grid-settings.js" defer></script>` added in the modal-extraction block (after `help-shortcuts.js`, before `_ui-legacy.js`); the entire `<div id="grid-settings-panel">…</div>` block stripped from `<main>` (replaced with a 2-line comment pointer).
- `src/ui/_ui-legacy.js` — added two prototype delegators (`_mountGridSettingsPanel`, `_bindGridSettingsHandlers`), invoked `_mountGridSettingsPanel()` once in the UI constructor (immediately before `bindGlobal()`), replaced 84 lines of inline grid handlers in `bindGlobal()` with a single guarded `_bindGridSettingsHandlers()` call, added the `bind()` registration line in the bottom-of-IIFE block.

**DI bag:** `{ getEl, SETTINGS, openColorPickerAnchoredTo }` — three IIFE-locals. `openColorPickerAnchoredTo` is the live wire for the color-pill anchored picker; passing it into the bag rather than rebuilding it inside the module preserves byte-identical behavior with no new module dependencies.

**Composition contract:** the Grid Settings panel is a CSS-class `.open` slide-out side panel, NOT a centered overlay. It does NOT use `this.openModal` / `this.modal`. The "modal" naming is by Phase 3's classification (any open/close-lifecycle surface goes under `modals/`) — but the implementation just toggles a class. Future primitive promotion at Phase 3 step ~13 will need to decide whether to keep the slide-out behavior or unify under `Vectura.UI.Overlays.Modal`. **Recommendation: keep the slide-out** — it's a UX choice (settings stays beside the canvas while you tweak), not a mechanical leftover.

**Line reduction:** `_ui-legacy.js` 9,112 → 9,062 (–50 lines). `index.html` 911 → 873 (–38 lines).

**Test totals before → after:** 648 unit + 71 integration + 13 visual + 2 perf → **654 unit + 77 integration + 13 visual + 2 perf** (+6 unit, +6 integration). All four suites green.

**Browser smoke:** NOT run for this step. Same risk profile as step 1 — script-tag reorder + new global write + dynamic DOM mount. Integration tests cover the full `loadVecturaRuntime({ useIndexHtml: true })` path so the script-load order + mount call is exercised under JSDOM. Real browser smoke (open `python -m http.server`, click View > Grid Settings, toggle each control, confirm canvas updates) should be done as part of the Phase 3 closeout.

**Patterns / gotchas Phase 3 step 3+ must know:**

1. **About modal does not exist.** Confirmed by `grep -n "openAbout\|_buildAboutContent" src/ui/_ui-legacy.js` (no hits beyond `setAboutVisible` / `initAboutSection` which are pane-left controls, not a modal). If a future task message names "About modal" again, push back and re-scope.
2. **Slide-out panels follow the mount + bindHandlers split.** Grid Settings is the template: a `mount(host)` that injects markup once at boot, plus a `bindHandlers()` called from inside `bindGlobal()` (wraps the prior inline handlers). Document Setup will follow the exact same shape — `_mountSettingsPanel()` + `_bindSettingsHandlers()`. Compile gate asserts mount idempotency; integration test asserts `parentElement.tagName === 'MAIN'`.
3. **Guard prototype delegators that bindGlobal() calls.** A unit test (`tests/unit/crop-exports-settings.test.js`) invokes `UI.prototype.bindGlobal.call({ app: {...} })` — a stub `this` that does NOT inherit prototype methods. New `this._foo()` calls inside `bindGlobal()` must guard with `typeof this._foo === 'function'` so that test continues to pass without mocking everything. Step 2 hit this; the fix is a 1-line guard.
4. **Mount-then-bind ordering is load-bearing.** The mount call MUST run before `bindGlobal()` so `getEl('grid-settings-panel')` resolves. Step 2 placed it as `this._mountGridSettingsPanel(); this.bindGlobal();` in the UI constructor. Step 3 should match this pattern: mount before bind.
5. **`openColorPickerAnchoredTo` is reachable from any modal that needs an anchored color pill.** The DI-bag pattern for handing it into a modal is now established. Document Setup, Color Picker, Export SVG will all need it.
6. **Carry-over deferred items unchanged from step 1.** Mixin dissolution, ~50 surviving prototype methods, ~30 IIFE locals, `refreshDocumentUnitsUi` / `refreshThemeUi` cross-call resolution.

---

## Phase 3 step 3 actuals (4 of 7 modals shipped)

**Status: in progress.** Step 3 lands TWO modals in a single batch — Document Setup (the largest markup move so far, ~206 lines) and the info-modals micro-system (six prototype methods). The user-issued task spec recommended Document Setup as primary and the info-modals bundle as secondary; both shipped green.

**Commits:**

- `af0fd16` (`feat(skin): Phase 3 — extract modals/document-setup.js + remove markup from index.html`)
- `bb36595` (`feat(skin): Phase 3 — extract modals/info-modals.js`)

**Files shipped:**

- `src/ui/modals/document-setup.js` — 333 lines. Owns `PANEL_HTML` (the 206-line markup formerly at `index.html:540-745`), a `mount(host)` injecting `#settings-panel` (idempotent), and `bindHandlers()` wiring the open trigger (`#btn-settings`) and close button (`#btn-close-settings`) — both forward to `this.toggleSettingsPanel()`. Registered as `window.Vectura.UI.Modals.DocumentSetup`. The ~30 input handlers stay in legacy `bindGlobal()` because they're interleaved with shared selection-outline / margin-line / cookie / paper logic invoked from elsewhere.
- `src/ui/modals/info-modals.js` — 171 lines. Owns six methods: `showInfo`, `showDuplicateNameError`, `showValueError`, `attachInfoButton`, `attachStaticInfoButtons`, `bindInfoButtons`. Registered as `window.Vectura.UI.Modals.InfoModals`. DI bag pulls five IIFE-locals: `{ INFO, buildPreviewPair, escapeHtml, getEl, SETTINGS }`. `showInfo` still passes `this` into `buildPreviewPair` so its downstream chain (`resolvePreviewConfig` → `buildVariantsFromDef` → `renderPreviewSvg`, all IIFE-locals) keeps working unchanged — no preview-pipeline lift was needed for this batch.
- `tests/unit/modals/document-setup-compile.test.js` — 6 tests (compile gate, bind tripwire on mount + bindHandlers, mount injects all expected control IDs, mount idempotency, PANEL_HTML preserves headline labels + units options).
- `tests/integration/modals/document-setup.test.js` — 3 tests (panel mounted into `<main>`; ~34 expected control IDs all present; open/close lifecycle; `#set-margin` input still mutates `SETTINGS.margin` proving the legacy `bindGlobal()` handlers continue to wire).
- `tests/unit/modals/info-modals-compile.test.js` — 5 tests (compile gate, bind tripwire on showInfo + showDuplicateNameError, sentinel-marker escapeHtml proves the module routes through the injected escaper, `attachInfoButton` idempotency).
- `tests/integration/modals/info-modals.test.js` — 4 tests (`showDuplicateNameError` opens "Name Unavailable" modal with HTML-escaped name, `showValueError` opens "Invalid Value", `attachInfoButton` idempotent, `.info-btn` click dispatches through `bindInfoButtons` → `showInfo`).
- `index.html` — script tags for both new modules added in the modal-extraction block (after `document-setup.js`, before `_ui-legacy.js`); the entire `<div id="settings-panel">…</div>` block (206 lines) stripped from `<main>` and replaced with a 2-line comment pointer.
- `src/ui/_ui-legacy.js` — added two prototype delegators for Document Setup (`_mountDocumentSetupPanel`, `_bindDocumentSetupHandlers`), invoked `_mountDocumentSetupPanel()` once in the UI constructor BEFORE `initMachineDropdown()` (so `#machine-profile` is in the DOM when the dropdown population logic runs), replaced 5 lines of inline open/close handlers in `bindGlobal()` with a guarded `_bindDocumentSetupHandlers()` call, removed three now-unused locals (`settingsPanel`, `btnSettings`, `btnCloseSettings`), and added the bind() registration line at the bottom of the IIFE. For info-modals, replaced six prototype method bodies (~94 lines) with six 1-line delegators (~18 lines) and added the bind() registration line.

**DI bags:**

- DocumentSetup: `{ getEl }` — minimal, since the open/close handlers forward to `this.toggleSettingsPanel()` (already extracted to BottomPane in Phase 2 step 3).
- InfoModals: `{ INFO, buildPreviewPair, escapeHtml, getEl, SETTINGS }` — five IIFE-locals.

**Composition contract:** Document Setup is the same slide-out CSS-`.open` shape as Grid Settings — NOT a centered overlay. Info-modals compose `this.openModal` (centered overlay) — same primitive Help/Shortcuts uses. Future Phase 3 step ~13 will swap every modal's `this.openModal` to `Vectura.UI.Overlays.Modal` in a single commit.

**Constructor mount-order subtlety (carry-forward):** Document Setup mount MUST run before `initMachineDropdown()` because that init populates the `#machine-profile` `<select>` which lives inside the panel. Step 3 placed the mount call as `_mountDocumentSetupPanel(); initMachineDropdown(); _mountGridSettingsPanel(); bindGlobal();`. Without this ordering, JSDOM emits `[UI] Missing element #machine-profile` and the paper-size dropdown is empty in the integration test — caught immediately by the integration test once the warning showed up.

**Line reduction:** `_ui-legacy.js` 9,062 → 9,030 (–32 lines net). `index.html` 873 → 671 (–202 lines, primarily the Document Setup markup). Document Setup adds +24 lines to legacy (delegators + guarded bindHandlers call + bind() block) but info-modals removes –56 lines (six method bodies replaced by six 1-line delegators), net –32.

**Test totals before → after:** 654 unit + 77 integration + 13 visual + 2 perf → **665 unit + 84 integration + 13 visual + 2 perf** (+11 unit, +7 integration). All four suites green.

**Browser smoke:** NOT run for this step. Same risk profile as steps 1-2 — script-tag reorder + new global writes + dynamic DOM mount. Integration tests cover the full `loadVecturaRuntime({ useIndexHtml: true })` path so the script-load order + mount call is exercised under JSDOM. Real browser smoke (open `python -m http.server`, click File > Document Setup, click every input + verify mutation, hit every "i" info button across the UI, confirm About-pane toggle on the algorithm i-button) should be done as part of the Phase 3 closeout.

**Patterns / gotchas Phase 3 step 4+ must know:**

1. **Markup-removal modals follow the same load-order rule as Grid Settings (step 2).** If the panel hosts ANY input that another init method populates (`#machine-profile` for `initMachineDropdown`, `#layer-bar-palette-trigger` for the palette picker, etc.), the mount call must precede that init method. If you see a `[UI] Missing element #...` warning in the integration test stderr, that's the symptom — reorder the constructor calls.
2. **Sentinel-marker test pattern works for proving DI routing.** The info-modals compile gate ran into a JSDOM/vm regex-character-class oddity when testing real escapeHtml output (`"My Layer"` came through unescaped despite a textbook regex). Workaround: inject a sentinel escaper like `(s) => `[E:${s}]`` and assert the body contains `[E:My Layer]`. This proves the DI bag wiring without depending on any character-class regex behavior. Use this pattern when integration tests are blocked.
3. **Six-method extractions still fit one module.** The info-modals lift was the first multi-method extraction in Phase 3 — six prototype methods, ~94 lines of bodies, replaced by six 1-line delegators (~18 lines). All six belong together because they share INFO + buildPreviewPair + escapeHtml. Future similar bundles (e.g., Color Picker has openColorModal + several anchored-picker helpers) can follow the same shape.
4. **InfoModals.attachStaticInfoButtons is called from elsewhere.** Note `this.attachStaticInfoButtons()` (or its delegator) is invoked from `initLeftPanelSections` and several panel renderers. The 1-line delegator on UI.prototype is what those call sites still hit — do NOT remove it.
5. **Carry-over from steps 1-2 unchanged.** Mixin dissolution, ~50 (now ~44) surviving prototype methods, ~30 IIFE locals (still ~30 — info-modals didn't reduce the count, it just rerouted method bodies to a satellite while preserving the IIFE-locals as DI inputs), `refreshDocumentUnitsUi` / `refreshThemeUi` cross-call resolution.
6. **JSDOM `vm` context regex gotcha.** A regex character class `/[&<>"']/g` inside a test escapeHtml stub may not match the `"` character correctly when the stub is constructed inside a `beforeAll` and called from a `vm.runInContext`-loaded module. Cause unconfirmed; workaround is to use chained `.replace()` calls or a sentinel escaper. Files: see `tests/unit/modals/info-modals-compile.test.js` for the working sentinel pattern.

---

## Phase 3 step 4 actuals (6 of 7 modals shipped)

**Status: in progress.** Step 4 lands two more modals — the touch-friendly HSV Color Picker (`openColorModal`) and the generic image-asset picker that powers the Rainfall Silhouette + Noise Rack image controls (`openNoiseImageModal` + `loadNoiseImageFile`). Six modals are now extracted; only Export SVG remains for step 5.

**Commits:**

- `4ca409a` (`feat(skin): Phase 3 — extract modals/color-picker.js`)
- `5ba54f9` (`feat(skin): Phase 3 — extract modals/rainfall-silhouette.js`)

**Files shipped:**

- `src/ui/modals/color-picker.js` — 219 lines. Owns `openColorModal({ title, value, onApply })` — the HSV saturation-value canvas, the hue strip, the 6-char hex input, Apply / Cancel buttons, and all pointer-drag wiring. Self-contained: empty DI bag (every dep is on `this`). Registered as `window.Vectura.UI.Modals.ColorPicker`. The legacy IIFE-local `openColorPickerAnchoredTo` (still in `_ui-legacy.js`) routes to `uiInstance.openColorModal(...)` on touch-primary devices, which now delegates here.
- `src/ui/modals/image-asset.js` — 173 lines. Owns BOTH `openNoiseImageModal(layer, options)` AND `loadNoiseImageFile(file, layer, nameEl, idKey, nameKey, target, previewKey)`. The same primitive serves the rainfall silhouette control AND the noise-rack image source — kept generic, named for what it actually is rather than for the most-prominent caller. Registered as `window.Vectura.UI.Modals.ImageAsset`. Empty DI bag. Both legacy methods delegate via 1-line pass-throughs so `algo-config-panel.js`'s `openNoiseImageModal` call and `ui-noise-rack.js`'s `loadNoiseImageFile` call continue to resolve unchanged.
- `tests/unit/modals/color-picker-compile.test.js` — 5 tests (compile gate, bind tripwire on openColorModal, scaffold markup contains the canvas/hue/hex/buttons, non-#RRGGBB seed falls back to default red, Cancel + Apply round-trip the seed correctly).
- `tests/unit/modals/image-asset-compile.test.js` — 6 tests (compile gate, bind tripwire on both methods, scaffold uses supplied title/label/description/dropLabel, "Current: <name>" reads from `layer.params[nameKey]` with fallback "None selected", file input onchange routes through `this.loadNoiseImageFile` with the supplied keys then closes).
- `tests/integration/modals/color-picker.test.js` — 4 tests (`app.ui.openColorModal` renders the picker, Cancel closes without firing onApply, Apply with seed value emits the seed hex, editing the hex input then Apply emits the edited hex lower-cased).
- `tests/integration/modals/image-asset.test.js` — 3 tests (rainfall-silhouette scaffold renders correctly, "None selected" fallback, file input onchange routes through `loadNoiseImageFile` with `idKey/nameKey` then closes).
- `index.html` — two new `<script>` tags appended in the modal block (after `info-modals.js`).
- `src/ui/_ui-legacy.js` — three method bodies replaced by three 1-line delegators (`openColorModal`, `openNoiseImageModal`, `loadNoiseImageFile`), and two new `bind()` registration blocks added at the bottom of the IIFE.

**No markup changes to index.html.** Both modals are dynamic (composed via `this.openModal` at trigger time); neither owns persistent DOM that lived in `index.html`. Step 4 is a pure JS extraction — markup line count unchanged from step 3.

**DI bags:**

- ColorPicker: `{}` — empty. Every dep is on `this` (`this.openModal`, `this.closeModal`, `this.modal.bodyEl`).
- ImageAsset: `{}` — empty. Every dep is on `this` (`this.openModal`, `this.closeModal`, `this.modal.bodyEl`, `this.app.pushHistory`, `this.storeLayerParams`, `this.app.regen`, `this.app.render`, `this.buildControls`, `this.updateFormula`).

**Composition contract:** Both modals compose `this.openModal` (centered overlay, same primitive Help/Shortcuts and Info Modals use). Future Phase 3 step 13 (primitive promotion) will swap every modal's `this.openModal` to `Vectura.UI.Overlays.Modal` in a single commit — the API contract on `this.modal.bodyEl` is what every extracted modal currently relies on.

**Line reduction:** `_ui-legacy.js` 9,030 → 8,790 (–240 lines net across both extractions). Color picker accounts for –153 lines; image-asset for –87 lines. Both ratios are ~80% (a 165-line method body becomes a 3-line delegator + 7-line bind() block, etc.).

**Test totals before → after:** 665 unit + 84 integration + 13 visual + 2 perf → **676 unit + 91 integration + 13 visual + 2 perf** (+11 unit, +7 integration). All four suites green.

**Browser smoke:** NOT run for this step. Same risk profile as steps 1-3 — pure JS lift with method-body → 1-line-delegator pattern. Integration tests cover full `loadVecturaRuntime({ useIndexHtml: true })` paths so the script-load order + bind() registration is exercised. Browser smoke remains mandatory before the Phase 3 closeout commit (per the existing carry-over note in step 3).

**Patterns / gotchas Phase 3 step 5 (Export SVG) must know:**

1. **Self-contained modules ship with empty DI bags.** Both step-4 modules took `bind({})`. The `requireDeps(name)` tripwire still exists — its job there is to enforce load-order (every method asserts the module's `bind()` ran before its first invocation, which proves the script tag is in the right place in `index.html`). Use the same shape for Export SVG even though Export is the largest extraction yet.
2. **One module can own multiple prototype methods that share state by `this`.** The image-asset module owns two prototype methods (`openNoiseImageModal` + `loadNoiseImageFile`); they communicate through `this.loadNoiseImageFile(...)` from inside `openNoiseImageModal`'s file-input handler. This pattern scales: Export SVG's 11 methods can all live in one module if they share state via `this`, with one prototype delegator per method on UI.prototype.
3. **Legacy methods called from satellite modules.** `loadNoiseImageFile` is invoked by `src/ui/ui-noise-rack.js:1720` (`this.loadNoiseImageFile(...)`); `openNoiseImageModal` by `src/ui/panels/algo-config-panel.js:793`. Both still hit the 1-line delegator on UI.prototype, which forwards to the new module — do NOT remove these delegators thinking the satellite caller can dispatch directly to `window.Vectura.UI.Modals.ImageAsset`. The delegator is the API contract.
4. **Generic primitive vs caller-named module.** The task spec called this the "Rainfall Silhouette modal" but the primitive is generic — same modal also serves the noise rack. Module name reflects actual scope: `image-asset.js`, not `rainfall-silhouette.js`. Apply the same scrutiny to Export SVG: if the export pipeline is shared with `.vectura` save / project export / something else, name the module after the abstract surface, not the most-prominent menu item.
5. **No new markup move.** Step 4 didn't change `index.html` line count for markup — both modals are DOM-on-trigger. Step 5 (Export SVG) likely also has no markup in `index.html`; double-check by grepping `id="export"` / `id="modal-export"` etc. before assuming a markup move is needed.
6. **Carry-over from steps 1-3 unchanged.** Mixin dissolution, ~44 (now ~41 after step 4) surviving prototype methods, ~30 IIFE locals (no change — neither step-4 module pulled an IIFE-local through DI), `refreshDocumentUnitsUi` / `refreshThemeUi` cross-call resolution. The JSDOM-vm regex character-class oddity from step 3's gotcha still applies — workaround pattern is the sentinel-marker escaper (see `info-modals-compile.test.js`).

---

## Phase 3 step 5 actuals (7 of 7 modals shipped — modal extraction complete)

**Status: in progress.** Step 5 lands the final and largest modal — Export SVG — with its 9 prototype-callable methods (the one-method anchor `openExportModal` plus 8 supporting methods: `fitExportPreview`, `resizeExportPreviewCanvas`, `renderExportPreview`, `decorateExportControlsPanel`, `syncLegendSettingsControls`, `attachExportInfoButtons`, `buildExportPreviewPath`, `buildExportClipPolygons`). All seven Phase 3 modals are now extracted. Phase 3 still has menus + mixin dissolution + primitive promotion + browser smoke + closeout to ship.

**Commit:**

- `45f3c8c` (`feat(skin): Phase 3 — extract modals/export-svg.js`)

**Files shipped:**

- `src/ui/modals/export-svg.js` — 674 lines. Owns 9 prototype-callable methods: `openExportModal` (the entry point — opens centered overlay, lifts `#optimization-controls` into the modal's settings-scroll pane, wires pan/zoom/legend/preview-mode handlers, calls `this.openModal`); `fitExportPreview`, `resizeExportPreviewCanvas`, `renderExportPreview` (the preview canvas pipeline — paper, paths, line-sort overlay/replace/off modes); `decorateExportControlsPanel`, `attachExportInfoButtons` (the optimization-controls panel restructuring + per-step info-toggle wiring); `syncLegendSettingsControls` (the legend gear-pane pill refresh); `buildExportPreviewPath`, `buildExportClipPolygons` (preview-canvas analogs of the SVG path emitter and mask-clip builder). Registered as `window.Vectura.UI.Modals.ExportSvg`. The actual SVG-blob construction stays in `src/ui/ui-file-io.js` (`exportSVG` — unchanged); the modal's Submit handler composes `this.exportSVG()` then `this.closeModal()`. The preview pipeline composes `this.app.renderer` for `hexToRgb`/`rgbToCss`/`mixRgb`/`getLineSortOverlaySecondaryColor`/`getComplementRgb` and `this.app.engine` (via `this.getExportSnapshot()` from `ui-file-io.js`) for the export snapshot — engine/renderer logic is NOT duplicated.
- `tests/unit/modals/export-svg-compile.test.js` — 5 tests (compile gate; bind tripwires on `openExportModal` + `renderExportPreview`; no-op when `#optimization-controls` is missing; full scaffold composition through `this.openModal({title,body,cardClass,onClose})` with the export DOM root + preview canvas + mode select + legend + settings scroll + Cancel + Submit). Uses an inline canvas-getContext stub because JSDOM ships without `HTMLCanvasElement.prototype.getContext`. Pre-creates the `#optimization-controls` + `#optimization-controls-stash` DOM hooks before the openExportModal scaffold-composition assertion.
- `tests/integration/modals/export-svg.test.js` — 4 tests (end-to-end through `loadVecturaRuntime({useIndexHtml:true})` + `new Vectura.App()`: scaffold renders + `app.renderer.exportModalOpen` flips on/off; preview-mode select onchange updates `exportModalState.previewMode` and calls `renderExportPreview`; Cancel closes without invoking `exportSVG`; Submit invokes `exportSVG` end-to-end with `URL.createObjectURL` + anchor `.click()` stubbed so the SVG blob is captured but no actual download fires).
- `index.html` — one new `<script>` tag for `./src/ui/modals/export-svg.js` appended after `image-asset.js` in the modal block.
- `src/ui/_ui-legacy.js` — nine method bodies replaced by nine 1-line delegators (`buildExportPreviewPath`, `buildExportClipPolygons`, `fitExportPreview`, `resizeExportPreviewCanvas`, `renderExportPreview`, `decorateExportControlsPanel`, `syncLegendSettingsControls`, `attachExportInfoButtons`, `openExportModal`) and one new `bind()` registration block at the bottom of the IIFE (the largest DI bag of the phase: `{ getEl, SETTINGS, clamp, getThemeToken, getContrastTextColor, EXPORT_INFO, OPTIMIZATION_STEPS, openColorPickerAnchoredTo }`).

**No markup changes to index.html.** The export modal is fully dynamic — composed via `this.openModal` at trigger time. Step 5 is a pure JS extraction.

**DI bag:** `{ getEl, SETTINGS, clamp, getThemeToken, getContrastTextColor, EXPORT_INFO, OPTIMIZATION_STEPS, openColorPickerAnchoredTo }` — 8 closure-captured locals. This is the largest DI bag of any modal in Phase 3; reflects the export modal's reach into theme tokens (`getThemeToken`), live settings (`SETTINGS.optimizationPreview`/`optimizationOverlayColor`/`optimizationOverlayWidth`/`bgColor`/`strokeWidth`), the info-toggle copy + step schema (`EXPORT_INFO`, `OPTIMIZATION_STEPS`), and the legacy color-picker entry point (`openColorPickerAnchoredTo`).

**Composition contract:** Export SVG composes `this.openModal` (centered overlay, same primitive every other modal in Phase 3 uses except Grid Settings + Document Setup which are slide-outs). Step 13 (primitive promotion) will swap `this.openModal` → `Vectura.UI.Overlays.Modal` across all 7 centered modals in a single commit.

**Line reduction:** `_ui-legacy.js` 8,790 → 8,282 (–508 lines net). The Export SVG extraction is the biggest single line drop in Phase 3 — the 9 method bodies summed to ~520 lines of legacy code, and the 9 delegators are ~30 lines including blank lines and JSDoc. Module size 674 lines (vs ~520 of pre-extraction body) reflects the JSDoc header (~50 lines), the `requireDeps` tripwire boilerplate, and the IIFE wrapper.

**Test totals before → after:** 676 unit + 91 integration + 13 visual + 2 perf → **681 unit + 95 integration + 13 visual + 2 perf** (+5 unit, +4 integration). All four suites green.

**Browser smoke:** NOT run for this step — same risk profile as steps 1-4 (pure JS lift). Browser smoke remains mandatory before the Phase 3 closeout commit.

**Patterns / gotchas Phase 3 closure (step 6) must know:**

1. **All 7 modals shipped through `this.openModal` / `this.closeModal`.** Color Picker, Image Asset, Info Modals, Help/Shortcuts, and Export SVG all compose the centered-overlay primitive. Grid Settings + Document Setup are CSS-class `.open` slide-outs (NOT centered). When promoting `this.openModal` → `Vectura.UI.Overlays.Modal` in step 13, these two slide-outs do NOT get promoted — they stay slide-outs (per Phase 3 step 2's recommendation: "keep the slide-out — it's a UX choice").
2. **JSDOM canvas-getContext stubbing.** The Export SVG compile gate has to stub `HTMLCanvasElement.prototype.getContext` because JSDOM ships without it; future canvas-using modals must apply the same pattern (~25 lines of stubbed 2D-context methods). Integration tests don't need this stub because the preview canvas's getContext returns `null` and the renderExportPreview fast-paths return on `!state.ctx`.
3. **The 9-method module is fine.** Multiple methods with shared `this`-state scale cleanly. Pattern (also used by image-asset.js): module exports each method, `requireDeps()` tripwire on each entry-point, prototype delegators on UI.prototype call back through the module. Internal calls within the module use `this.methodName(...)` (which routes through the prototype delegator → back to the module — a tiny indirection cost, but keeps the `this`-API contract consistent).
4. **Carry-over from steps 1-4 unchanged.** Mixin dissolution (~9100 area, line numbers shifted), legacy-callable methods on UI.prototype with satellite call sites, JSDOM regex sentinel pattern, refreshDocumentUnitsUi/refreshThemeUi cross-call resolution, slide-out vs centered modal classification.
5. **`exportSVG` lives in `src/ui/ui-file-io.js`, NOT in `_ui-legacy.js`.** The module composes `this.exportSVG()` (the satellite method) on Submit. Phase 3 closure does NOT need to touch `ui-file-io.js`; the file-naming UX, snapshot pipeline, and Blob/anchor `.click()` chain all stay there.
6. **Renderer reads on `this.app.renderer`, NOT on `this.renderer`.** Subtle gotcha: `app.ui.exportModalState` is set on the UI instance, but `app.renderer.exportModalOpen` is set on the renderer. `openExportModal` does both. Don't confuse `this.renderer` (does not exist on UI) with `this.app.renderer` (the renderer instance).

---

## Appendix: Resuming Phase 3 step 6 (closure — menus, mixin dissolution, primitive promotion, browser smoke)

Phase 3 is in progress. Steps 1-5 (`ff783c5`, `6f277ba`, `af0fd16`, `bb36595`, `4ca409a`, `5ba54f9`, `45f3c8c`) extract all 7 modals. The phase still needs: 4 menu wirings, mixin dissolution, primitive promotion, tooltip + drag-drop overlay + toast wire-ups, browser smoke, and the closeout commit.

After clearing context, the fastest way to pick up Phase 3 step 6:

1. `cd /Users/jayphi/Documents/github/vectura-studio-meridian` (the worktree, on branch `meridian-blue-skin`).
2. `git log --oneline -5` — confirm HEAD is the docs commit recording Phase 3 step 5 (the latest `docs(skin):` commit). The step 5 implementation commit is `45f3c8c`.
3. Confirm tests are green before changing anything: `npm run test:unit && npm run test:integration && npm run test:visual && npm run test:perf` (681 unit, 95 integration, 13 visual, 2 perf — all green at end of step 5).
4. **Phase 3 step 6 target: closure.** All 7 modals are extracted; the remaining work is the `overlays/` integrations + cleanup. Suggested ordering (small → large, lowest-risk first):
   - **(a) Menu wirings (4 menus).** Compose `Vectura.UI.Overlays.Menu` (Phase 1 primitive in `src/ui/overlays/menu.js`) for `#layer-add-menu`, `#palette-menu`, `#layer-filter-menu`, and the NEW layer right-click context menu. Trigger-handler logic for the first three lives in legacy `bindShortcuts` (now in `src/ui/shortcuts.js`); the right-click context menu trigger lives in legacy `bindLayerContextMenu` (still in `_ui-legacy.js` — grep `contextmenu`). Each menu gets its own module under `src/ui/menus/<name>.js` matching the modal-extraction pattern; compile-gate test first; integration test for trigger → open → option-click → close.
   - **(b) Mixin dissolution.** Dissolve `_UIAutoColorizeMixin` and `_UINoiseRackMixin` into the panels' `bind()` bags. Mixin attachment in `_ui-legacy.js` at the `Object.assign(UI.prototype, …)` lines (re-grep for current line numbers — they shift). The auto-colorize panel + noise-rack panel `bind()` block already exists with empty bags; load the mixin closures (`autoColorizeAlgorithmically`, `applyAutoColorizationOptions`, etc.) into those bags and remove the mixin attachment. NoiseRack mixin is the larger of the two (~1,500 lines in `src/ui/ui-noise-rack.js`); AutoColorize is smaller (~600 lines in `src/ui/ui-auto-colorize.js`).
   - **(c) Toast wire-ups.** Replace `console.log`/`alert` call sites with `Vectura.UI.Overlays.Toast` (Phase 1 primitive in `src/ui/overlays/toast.js`) for: layer-add success, project save/load success, export complete, and error states (file-load failure, image decode failure, etc.). Grep for current alert/console.error sites in `src/ui/`.
   - **(d) Tooltip wire-ups.** Replace every `info-btn`-triggered modal call site with `Vectura.UI.Overlays.Tooltip` (Phase 1 primitive in `src/ui/overlays/tooltip.js`). The info-modals.js module (`showInfo`) is the centered-overlay path; the tooltip path is for inline hover/click on `i` buttons. Grep `info-btn` to find call sites in panels + algo-config-panel.
   - **(e) Drag-drop overlay consolidation.** Consolidate the SVG-import / `.vectura`-open / rainfall-image / pattern-import drag handlers into `Vectura.UI.Overlays.DragDropOverlay` (Phase 1 primitive). Currently each surface has its own `dragenter`/`drop` handlers; the consolidation surfaces a single drop overlay with type-discriminated routing.
   - **(f) Primitive promotion (single-commit refactor).** Swap `this.openModal` / `this.closeModal` to `Vectura.UI.Overlays.Modal` across the 5 centered modals (color-picker, image-asset, info-modals, help-shortcuts, export-svg). Grid Settings + Document Setup stay slide-outs (per step 2's recommendation). Validate the `this.modal.bodyEl` API contract via the new primitive's exposed handle.
   - **(g) Browser smoke (mandatory).** Run `python -m http.server 8000`, exercise every extracted modal manually (open via menu/trigger, click around, close), every menu (layer add, palette, layer filter, right-click context), confirm toasts surface on save/load/export, drag-drop a `.vectura` and a `.svg`. Anything broken → fix BEFORE the closeout.
   - **(h) Phase 3 closeout commit.** Flip Status table from `⏳ in progress` to `✅`, list every Phase 3 commit SHA, write a "Phase 3 actuals" note that supersedes the per-step actuals, rewrite this appendix as "Resuming from Phase 4", update memory, commit `docs(skin): Phase 3 closeout`.
5. **Compile-gate-test-first pattern:** every menu extraction starts with `tests/unit/menus/<name>-compile.test.js` (mirror of the modal pattern). Add per-menu integration test under `tests/integration/menus/<name>.test.js`.
6. **Phase 3 does NOT touch (without explicit user request):** `src/render/renderer.js`, `src/core/`, `src/config/`. Stay in `src/ui/` (overlays, panels, satellites, modals, menus) and `index.html` (script load order + markup removal where applicable).
7. **Test totals to track:** start of step 6 is 681 unit + 95 integration + 13 visual + 2 perf. Each menu adds ~10 tests (compile gate + integration). Mixin dissolution does not add tests (refactor-only, RGR via existing panel coverage). Primitive promotion does not add tests (refactor — existing modal coverage exercises every code path).

---

## Old appendix (superseded by "Resuming Phase 3 step 2" above): Resuming from Phase 3

Phase 2 is complete (7 steps, 23 commits — including the docs commits). The Meridian skin migration's foundation, component library, shell, panels, orchestrator entry, and renderer token cache all ship. Phase 3 starts the modal/overlay/menu rewrite per §3 ("Phase 3" heading earlier in this plan).

After clearing context, the fastest way to pick up Phase 3:

1. `cd /Users/jayphi/Documents/github/vectura-studio-meridian` (the worktree, on branch `meridian-blue-skin`).
2. `git log --oneline -5` — confirm HEAD is the docs commit recording Phase 2 closure (latest `docs(skin):` commit). The step 7 implementation commit is `9628561`. Phase 2 is fully done.
3. Confirm tests are green before changing anything: `npm run test:unit && npm run test:integration && npm run test:visual && npm run test:perf` (642 unit, 66 integration, 13 visual, 2 perf — all green at end of step 7).
4. **Phase 3 target: modals, overlays, menus.** Read §3 ("Phase 3") earlier in this plan. The Phase 3 plan inventories every modal/overlay surface (export modal, document-units modal, file-io modals, layer settings modal, info modals, tooltips, menus, drag-drop overlay, toasts) and lays out the per-surface extraction sequence.
5. **First move (smallest modal first, lowest-risk):** start with the simplest single-purpose modal in `_ui-legacy.js`. Recommended candidates (read each body to pick the smallest):
   - **Toast / notification surface** if it exists as a single helper — usually 50–80 LOC and has zero state of its own.
   - **Confirm dialog** (`window.confirm` analog) — also small, easy compile-gate test.
   - **Layer settings modal** — much larger; defer until 1–2 small ones land first.
   The Phase 1 component library already ships `src/ui/overlays/{modal, dialog, toast, menu, drag-drop, empty-state}.js` (locked component contract: `factory(host, props) → { el, update, destroy }`). Phase 3 panels compose those overlays — no new primitives needed.
6. **Compile-gate-test-first pattern (locked since Phase 2):** every panel/overlay extraction starts with a `tests/unit/<surface>-compile.test.js` that loads the new module under JSDOM and asserts (a) it registers on `window.Vectura.UI.<Name>`, (b) all `showIf` predicates and DOM lookups work against `ALGO_DEFAULTS` + a stub UI, (c) no `ReferenceError` from missing closure-captured locals. Phase 2's compile gates caught 3 such locals on day one — same will apply to Phase 3 modals.
7. **Carry-over deferred items (now mandatory for Phase 3):**
   - **Mixin dissolution for `auto-colorize-panel` and `noise-rack-panel`** (deferred from step 5). Both still forward to `window.Vectura._UIAutoColorizeMixin` and `window.Vectura._UINoiseRackMixin`. The mixin attachment lines (`Object.assign(UI.prototype, …)`) live in `src/ui/_ui-legacy.js` lines ~9253–9260. Phase 3's modal seam is the natural touch point — when the auto-colorize panel's modal lifts into `src/ui/overlays/`, the mixin can dissolve into the panel's `bind()` bag.
   - **Satellite cleanup for ~50 prototype methods + ~30 IIFE locals in `_ui-legacy.js`** (deferred from step 6 option-(b) decision). Each Phase 3 modal/menu extraction reduces this surface incrementally. The eventual goal is option (a) — a truly thin `ui.js` orchestrator with `_ui-legacy.js` deletable. No need to land it in one phase; just track the line count drop in each Phase 3 actuals.
   - **`refreshDocumentUnitsUi`, `refreshThemeUi` cross-call resolution.** Both still round-trip through prototype delegators on legacy UI. Phase 3 may extract these alongside their owning panels (theme-switcher.js already has the wiring; document-units may need a new shell/satellite module).
8. **Phase 3 does NOT touch (without explicit user request):** `src/render/renderer.js`, `src/core/`, `src/config/`. Stay in `src/ui/` (overlays, panels, satellites) and `index.html` (script load order if a new module ships).
9. **Phase 3 wrap-up:** when all Phase 3 commits have landed and `npm run test:ci` is green, run the Phase wrap-up protocol (§"Phase wrap-up protocol (mandatory)" at the top of this plan): flip Phase 3 from `⏳` to `✅`, write a "Phase 3 actuals" note, rewrite this appendix as "Resuming from Phase 4," update memory, and commit a `docs(skin):` closeout.
