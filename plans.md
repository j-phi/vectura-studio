# Plans

This file is the active repository punchlist. Update it whenever meaningful work starts, changes scope, or completes.

## Operating Rules
- Keep `Inbox`, `In Progress`, `Done`, and `Decisions` current in the same PR as the implementation.
- Move items instead of duplicating them when status changes.
- Record architecture-level decisions in `Decisions` so future work has a stable reference.

## In Progress
- Continue extracting shared Noise Rack runtime primitives; stack blend-combination logic is now centralized, with deeper sampler extraction still pending.
- Extend Noise Rack to the remaining direct consumers, now mainly any leftover bespoke samplers after Petalis per-modifier stack UI parity.
- Extend Layer Modifiers further now that `Mirror` and `Morph` both ride the group-like modifier container model — new types layer onto the `applyModifierToMultiChildPaths` multi-child path or the single-child contract. Known Morph follow-ups: (a) a Morph group nested *under* another modifier (e.g. Mirror) currently has its rings rendered un-mirrored — the outer modifier isn't applied to `morphedPaths` (logged PRH-005).
- Fix the remaining strict Playwright Pattern fidelity regressions as product bugs, with `Autumn` horizontal-seam mismatch and representative `Bamboo` / `Bathroom Floor` / `Dominos` silhouette drift still failing source-faithful smoke coverage.

## Inbox
- **Petalis overhaul — remaining delight + UX follow-ups.** The overhaul core shipped in v1.2.0 (whorl layout, distinct shading + modifier stacks, convex botanical petal profiles + centre-anchoring, opt-in venation, the Bloom/Asymmetry/Cupping macros, a varied randomizer, and the non-destructive designer mount). Still to build:
  - **Species morph A→B.** A crossfade between two species/profiles, reusing `blendProfilePoints`/`profileBlendWeight` (already in `petalis.js`) — needs a two-source picker + a single blend slider in the panel/designer.
  - **Petal Designer undo.** The designer has zero `pushHistory` calls; route non-live commits in the canvas/shading/modifier/randomness bind sites through `this.app.pushHistory()` (hook point exists near `applyPetalDesignerToLayer`).
  - **Per-type shading cards.** Render only the controls a shading type actually uses (mirror the modifier-card pattern); add info buttons; surface the new `veinCount`/`veinReach` controls on the Venation card.
- **Pendula studio — Phase 3/4 remaining (tactile + craft + export).** The studio shipped in v1.2.0; still to build:
  - **Per-loop morph animation export** (the second time axis: a series of distinct evolving figures) — blocked on a frame-packaging decision (no zip lib in the no-build repo).
  - **Plotter hygiene on export** — randomize closed-loop seam start ("reloop") to avoid the pen ink-blot artifact.
  - **Optional node/matrix view** over the existing `{sourceId, targetParamPath, amount, …}` edge data (cheap — the data model already supports it).
  - **Deferred by design (judge-ranked lower / higher-risk):** the skeuomorphic main-canvas "Bench" (drag gears/arms/force vectors), the Patchbench node graph, the Twin-Elliptic machine type, a true-physics coupled-pendulum RK4 mode (log as a PRH hardening idea), and an elastic rubber-band linkage.
- **Meridian branch e2e shape-rect drift.** `tests/e2e/smoke.spec.js:1044 — shape reticle cursor appears for shape tools but selection restores normal cursor behavior` fails on `meridian-blue-skin` with a ~0.6 px Alt-drag rect midpoint drift vs `worldStart`. Passes cleanly on `main` (HEAD `6663bc9`). Verified pre-existing relative to Phase 5 — failed identically at the Phase 4 closure HEAD (`65290de`). Likely a layout shift introduced in Phases 2-4 (workspace pane chrome, padding/border drift) that nudges `getBoundingClientRect` between `worldStart` capture and Alt-drag mouse-down. Investigate canvas-bounding-rect timing in `src/render/renderer.js`. Visually rectangles still render correctly; this is a precision drift not a behavioral break.
- **Meridian Phase 3 menu deferrals.** Three menu wirings still use bespoke handlers and would benefit from primitive-based migration: (a) Layer-add submenu (`src/ui/shortcuts.js:517-565`) — needs `UI.overlays.Menu` to support submenus + custom item renderers; (b) Pen palette dropdown (`src/ui/panels/pens-panel.js:141-219`) — needs a new `UI.Menus.Palette` composing `overlays/Menu` chrome + custom swatch grid; (c) `this.openModal` → `UI.overlays.Modal` primitive promotion across the 7 centered modals (CSS rewrite vs class-name shim — pick an approach during the work).
- Migrate the remaining algorithm-local legacy noise paths (`flowfield`, `grid`, `rings`, `horizon`) onto `NoiseRack.defaultConfigFor` to finish the universal-noise convergence.
- Extract the remaining algorithm-tuning magic numbers (wavetable `0.45` / `0.866` / `0.5`, topo `0.45` / `0.866`, spiral tile constants, etc.) into `src/config/algorithm-tuning.js`.
- Reconcile the divergent `applyTile` implementations across `rainfall` / `wavetable` / `topo` / `spiral` and either unify them into `algorithm-utils.js` or formally document the per-algorithm contract.
- Investigate whether the `layer.origin` `{x:0, y:0}` back-compat default for pre-0.8.24 `.vectura` files preserves the prior bounds-derived behavior (renderer falls back to `profile.{width,height}/2` only when `origin` is absent — the new default may shift visuals on legacy saves).
- Extract more shared Noise Rack runtime primitives from the duplicated `wavetable` / `spiral` / `rainfall` implementations into `src/core/noise-rack.js`.
- Add tests for Noise Rack determinism, serialization, UI normalization, and algorithm parity across migrated systems.
- Add GitHub-side rulesets / branch protection, merge queue, and Project fields once the repository settings are available to configure.
- Decide whether to gate PRs on lint after introducing a repo-wide ESLint config that is compatible with the current browser-IIFE codebase.
- Add drag-to-mask layer assignment and richer silhouette providers for currently open-line-only algorithms once their envelope rules are stable.
- Add more modifier types beyond `Mirror`, reusing the shared modifier-container layer model and left-panel modifier registry.
- **Shape Properties popover (SHP-1) side-count edit collapses per-corner rounding — known limitation.** The Task Bar Shape Properties popover (`src/ui/shell/context-bar-modes.js` → `renderer.setShapeSides`) is uniform-corner-mode only. When it changes a polygon's side count, the persisted `cornerRadii` array is resized by refilling every entry with the current *max* radius, so a polygon that had per-corner variation (set via the on-canvas corner widget's single-corner drag) loses that variation on a popover side-count change. Acceptable because the popover intentionally exposes only a uniform radius (per-corner editing stays on-canvas), but a future enhancement could preserve/rescale the per-corner pattern across a side-count change. No PRH logged (design choice, not a defect).
- **Outline Text (TXT-1) welded-kern gap — known behavior, PRH-tracked.** `TextOutlineOps.outlineText` (`src/core/text-outline-ops.js`) partitions the rendered text geometry per glyph by nearest glyph-cell. On parsed web faces with `mergeOverlaps` on, a kerned pair (RA/AV/LT…) or connected script can weld two glyphs' ink into ONE contour; that ring's centroid lands in a single glyph-quad, so the sibling glyph gets zero paths and no layer — diverging from the "glyph count = non-whitespace char count" acceptance. Geometry is still fully preserved (no path dropped) and undo restores the editable Text layer. Fix options (split the welded ring per glyph-quad, or keep welded glyphs as one shared compound path à la Illustrator) are logged as PRH-014 in `docs/pre-release-hardening-log.md`; documented by a current-behavior regression test in `tests/unit/text-outline-ops.test.js`.

## Done
- **Unreleased — Illustrator-style measurement readouts, center points, and multi-corner rounding.**
  Smart-guide chip redesigned to a compact gray two-line box (dark text) rounded to 0.1 mm: `dX/dY`
  delta while dragging, `X/Y` on hover/select with a pink feature label (`anchor`) pinned at the
  point (`src/render/renderer.js` `_formatChipText`/`updateDirectDrag`/`showAnchorLabel`,
  `src/ui/skin/components.css` `.drag-value-tooltip`/`.drag-anchor-label`). New center helper point
  (blue diamond + `center` label + `X/Y`) on hovering any object's center (`_hitObjectCenter`,
  `drawCenterMarker`). New Settings ▸ Guides & Display toggles **Coordinate readout**
  (`showCoordinateReadout`) and **Center point** (`showCenterPoint`), persisted via the App
  preference snapshot. Direct-select multi-corner rounding rounds all selected corners to the
  cursor radius (`beginShapeCornerDrag` scope `'selected'` + `_selectedCornerIndices`/
  `_reselectCornerAnchors`). Config: `src/config/smart-guides.js`. Tests:
  `direct-drag-coordinate-readout.test.js`, `direct-select-multi-corner-round.test.js`.
- **Unreleased — radial fill gets a draggable Centerpoint pad.** The Type panel Fill tab
  (`src/ui/ui-text-panel.js`) mounts a second XY pad — identical to the Fill Offset pad but
  wired to `fillShiftX`/`fillShiftY` — shown only when `fillType === 'radial'`
  (`syncCenterVisibility()` toggles it from the shared fill grid's `onChange`). The engine path
  was already there: `PaintBucketOps.buildFillRecord` maps `fillShiftX/Y → shiftX/Y`, and
  `pattern.js` `radialFill`/`radialFillComposite` add them to the bounds centre. New text defaults
  `fillShiftX`/`fillShiftY`/`fillShiftMax` in `src/config/defaults.js`. Verified in-app (Playwright:
  centre `50,50 → 70,60` for shift `+20,+10`) and covered by three `tests/integration/text-panel.test.js`
  cases (hidden for non-radial, shown for radial, drag writes the shift + dbl-click recenters).
- **Unreleased — task-bar Simplify is an anchor-reduction ladder with bounded travel.** The
  slider runs complex → simple (L → R) with the thumb starting at the untouched original.
  `PathEditOps.simplifyBegin` (`src/core/path-edit-ops.js`) precomputes a per-path reduction
  ladder: rung 0 = original, higher rungs = strictly-fewer-anchor `GeometryUtils.fitBezierAnchors`
  fits (corners preserved via `cornerRadiusFrac 0`). `simplifyPreview(index)` applies a rung;
  `simplifyBegin`/`getSimplifyState` return `maxSteps` (deepest rung across the selection).
  The `context-bar-modes.js` simplify sub-mode scales the slider's `max` to `maxSteps`, disables
  it when nothing is reducible (triangle/rectangle → 0), swaps the wave icons to complex-left /
  simple-right, and shows a "{pts} pts" badge. `autoSmooth` now returns a suggested rung index.
  Covered by `tests/unit/path-edit-ops-simplify.test.js` (ladder/maxSteps/clamp/triangle/quad)
  and `tests/integration/{path-edit-ops,context-bar-modes}.test.js`.
- **Unreleased — task-bar "Show Properties panel" is now a restore action.** The ⋯-menu item only
  renders while the context's docked panel (right pane; left pane for single-text) is collapsed or
  narrower than its skin-default width; clicking it un-collapses / re-widens the panel (a
  user-widened pane keeps its custom width) and fires the existing blue attention pulse. Gating +
  restore live in `src/ui/shell/context-bar.js` (`showPanelNeedsRestore`/`restorePane`); covered by
  the TB-2b describe in `tests/integration/context-bar.test.js`.
- **v1.2.40 — Type tool web font + kerning, pen-picker loupe, minimal-anchor re-trace, scissors fix.**
  Type layers default to a vendored Inter web font parsed at boot (editable with real letterforms
  immediately); new per-pair `kernPairs` map alongside uniform tracking; context-bar Outline Text
  action. Pen picker + color picker eyedropper gain a magnified sampling loupe
  (`LOUPE_SIZE_PX`/`LOUPE_ZOOM`/`LOUPE_OFFSET_PX`). New `GeometryUtils.reduceAnchors` re-traces a
  bezier contour to its minimal editable anchor set (merge coincident seams, tangent-based corner
  detection, Schneider-fit each run), anchors carry a `corner` flag through the renderer's node overlay
  and engine anchor cloning. Fixed: renderer now treats an explicit `meta.closed === false` as
  authoritative, so a scissors-cut ring no longer gets silently re-closed on the next selection
  refresh. Full `test:ci`; version bumped + `version:sync`.
- **v1.2.39 — Illustrator Parity feedback pass (15 fixes).** Selection: Shift/Cmd-click + Shift-marquee
  multi-select (discrete toggle, no accidental move); isolate-group hit-test scoping (outside clicks
  swallowed, foreground layers don't shadow members). Task bar: drag-handle live preview; text Font/Style
  dropdown carets + chip-anchored pickers; Point/Area toggle; "Show Properties panel" focuses the Text
  panel + hides ABOUT; edit-path anchor verbs enable by selection (new `PathEditOps.deleteAnchors`);
  progressive **Smooth** slider (`smoothBegin/Preview/Commit/Cancel`); removed the standalone stroke-weight
  entry; re-render on primary-layer change. Menu: new **Object** menu + Duplicate/Delete reuse the
  context-menu verbs (`CanvasContextMenu.runCommand`/`getCommandStates`); Contextual Task Bar toggle added
  to View. Pens: per-pen weight textbox. Rendering: HiDPI smart-guide label fix. Flip H/V routes through
  `renderer.flipSelection`. Full `test:ci`; version bumped + `version:sync`.
- **v1.2.38 — Illustrator Tools Parity, Phase 3 (FINAL): transform numerics / text pickers / All Tools
  drawer / right-click menu (Lanes J, K, L, M merged + reconciled). This completes the whole
  Illustrator-Parity effort across all 13 lanes (A–M).** Merge order K→J→L→M onto v1.2.37; full `test:ci`;
  version bumped + `version:sync`. Delivered:
  - **Lane K (SEL-5/6, SG-6)** — Transform section true **X / Y / W / H** for manual shape/text selections
    (single + combined multi bounds) with **link W/H** proportional toggle (setting W resizes to the exact
    width about the bbox top-left, one undo); **Flip H / V** icon buttons via the shared
    `PathEditOps.flipLayers` (one undo, flip-twice restores); Direct-Selection single-anchor mode repurposes
    X/Y to the anchor's world position. Renderer gains `getTransformPanelModel` / `getSelectedAnchorState` /
    `applySelectionBox` / `applySelectedAnchorPosition` (single additive hunk, 4 methods); the panel
    self-mounts `#transform-bbox-controls`. New `src/config/transform-panel.js`.
  - **Lane J (TXT-3/4/5)** — Text font picker **hover live-preview** (≥150 ms dwell, no history push,
    dismiss/teardown revert, click commits with clean single-step undo, web faces fetched only on settled
    hover, zero eager fetches on open), filter **clear (×)**, and a real **size-preset dropdown** (6–72 mm).
    New `src/config/text-ui-config.js`; exposes `Vectura.UI.TextPanel.openFontPicker()` / `openSizePresets()`.
  - **Lane L (TLD-1/2)** — rail **"…" All Tools drawer**: registry-derived list of every tool grouped
    Select/Draw/Shapes/Type/Modify/Navigate, **grid/list** toggle (persisted `SETTINGS.toolDrawerView`),
    click-activates + rail-slot cross-highlight on hover. New `src/config/tool-drawer.js`,
    `src/ui/shell/tool-drawer.js` (attached via one optional-chained line in `toolbar.js`).
  - **Lane M (CTX-1, MSC-1/2)** — canvas **right-click context menu** of existing verbs (self-mounts to
    `#main-canvas`, no renderer edit); **mixed-value** stroke-weight indicator on multi-selections; compound
    **`alignCenterBoth`** align op (concentric in one undo). New `src/config/context-menu.js`,
    `src/config/mixed-values.js`, `src/ui/shell/canvas-context-menu.js`.
  - **Integration reconciliations / integrator wiring:**
    - **Six new module tags** wired into `index.html` (config: transform-panel, text-ui-config, tool-drawer,
      context-menu, mixed-values; shell: tool-drawer, canvas-context-menu) at `?v=1.2.38`; all `?v=` bumped.
    - **MSC-2 surfaced** (SPEC MSC-2 "align surfaces SHALL include it"): align-panel button (`index.html` +
      `multi-selection-panel.js` `ALIGN_OPS` + `icons.js` icon) and Task Bar align-flyout action
      (`src/config/context-bar.js`). New test `msc2-align-button-wiring.test.js` (button → concentric, one undo).
    - **Task Bar Smooth no-op fixed** (pre-existing Phase-2 bug found by Lane M): `context-bar.js` `doSmooth`
      called `smoothSelection(ids)` with no strength → clamped to 0 → early return. Now passes the config
      default `Vectura.CONTEXT_MENU.smoothStrength` (0.5) and lets the op own its single history push (dropped
      the bar's duplicate `pushHistory`). New test `context-bar-smooth-strength.test.js`.
    - **Task Bar text pickers wired** (closes the Lane G deferral): the bar's family/style chips call
      `TextPanel.openFontPicker()` and the size caret calls `openSizePresets()`, feature-detected on top of
      the existing wayfinding pulse. New test `context-bar-text-pickers.test.js`.
    - **`toolDrawerView`** (grid|list) folded into `App.getPreferenceSnapshot`/`applyPreferenceSnapshot`
      (both snapshot pairs) mirroring `contextBar`/`contextualHints`.
    - **Playwright** `tests/e2e/tool-drawer.spec.js` registered in the desktop-chromium testMatch + `test:e2e`.
    - **PRH renumber** (three-way 020 collision): PRH-020 = K (rotated-W/H object frame), PRH-021 = M
      (clipboard subsystem), PRH-022 = J (Text-specimen kick-loop bound). Log verified PRH-001…022 each once.
  - **In-lane decisions:** manual layer = shape|text leaves (algorithm/group keep native Pos/Scale, gain
    Flip); resize reference = bbox top-left (X/Y fixed on W/H); link toggle default off, not persisted; panel
    self-mounts via rAF (no index.html/ui.js edit); size presets = **mm** (matches the Size scrub unit),
    6–72; zero eager webfont fetches on picker open; font/size preview reverts on dismiss and restores the
    committed value *before* `pushHistory` so undo targets the original; drawer grid default + persisted,
    shortcut source = rail labels (no separate map), scissors/fill/light-source under Modify, Escape also
    closes; context menu = EXISTING verbs only (`alignCenterBoth` kept OUT of the menu per CTX-1 "no new
    behavior", surfaced via the align panel instead); Smooth default strength 0.5; contextmenu bound to
    `#main-canvas` specifically.
  - **Deferred:** rotated-layer object-frame W/H (`PRH-020`); real clipboard subsystem for the context menu
    Cut/Copy/Paste (`PRH-021`); Text-specimen kick-loop bounding (`PRH-022`); Simplify advanced gear
    (`PRH-019`, from Phase 2).
- **v1.2.37 — Illustrator Tools Parity, Phase 2: Contextual Task Bar (Lanes G, H, I merged + reconciled).**
  Merge order G→H→I onto v1.2.36; full `test:ci` run; version bumped + `version:sync`. Delivered:
  - **Lane G (TB-1…8)** — the floating `.ctxbar` framework: anchor-below-selection with viewport-flip +
    tool-rail yielding, hide-on-drag/draw/caret, per-kind state renderers (idle / single-path /
    single-shape / single-text / multi / group / direct), a 5-item overflow menu (Show panel / Hide bar /
    Reset / Pin / Quick help), drag-to-pin handle, `role="toolbar"` roving tabindex (no focus steal),
    Document Setup toggle. New `src/config/context-bar.js`, `src/ui/shell/context-bar.js`. Exposes
    `Vectura.UI.ContextBar` (getContentHost / restoreState / getContext / anchorRectForBar / setBusy).
  - **Lane H (TB-9…11, SHP-1…3)** — `context-bar-modes.js` sub-mode framework + Stroke-weight and Simplify
    inline modes, and a standalone shape-properties popover (corner radius / side count) with minimal,
    additive renderer plumbing (`getShapePropsState`/`beginShapePropsEdit`/`setShapeUniformCornerRadius`/
    `setShapeSides`/`endShapePropsEdit`) and a `vectura:isolation-changed` document event. New
    `src/config/shape-props.js`.
  - **Lane I (ISO-1…2)** — self-mounting `breadcrumb-bar.js`: `.iso-breadcrumb` ancestry strip + fixed-blue
    `.iso-edge-indicator`, driven immediately by Lane H's isolation event (rAF poll retained only as a
    harmless auto-mount fallback). New `src/config/breadcrumb.js`.
  - **Integration reconciliations:** `contextBarEnabled` + `contextBar` bag folded into
    `App.getPreferenceSnapshot`/`applyPreferenceSnapshot` + undo capture/apply + `defaults.js` (mirrors
    Lane F `contextualHints`); z-index audit (tool-bar 5 < bar 35 < breadcrumb 41 < edge 42 < modals);
    all 6 Phase-2 script tags wired in `index.html` (config → shell → main) at `?v=1.2.37`; in-app help
    gains a "Contextual Task Bar" section; new Playwright smoke for bar-appears + breadcrumb-visible.
  - **In-lane decisions:** idle bar adds Document Setup as a 2nd item (real `#btn-settings` trigger); group
    semantics = "one group + only its descendants"; add-anchor eligibility ≈ "an anchor selected"; Align
    flyout reuses docked panel buttons via click-dispatch (byte-identical geometry); shape-props popover is
    standalone (works without the bar) in uniform-corner mode; `SIDES_MAX` raised to 32 to avoid clamp data
    loss; breadcrumb root crumb labelled "Document", back-arrow steps one isolation level.
  - **Deferred to Phase 3 (Lane J, TXT-3…5):** full inline text family/style pickers in the bar's Text
    state — the bar currently opens/focuses the Text panel for wayfinding and edits size live. Simplify
    advanced-options gear tracked as `PRH-019`.
- **v1.2.36 — Illustrator Tools Parity, Phase 1 (all six lanes merged + reconciled).** Merge order
  A→C→E→B→D→F onto v1.2.34; full `test:ci` green; version bumped + `version:sync`. Delivered:
  - **Lane A (SEL-1…4, SG-1…5)** — 8-handle selection (edge-midpoint resize), multi-select Alt-drag
    duplicate, Flip H/V wrapper, live `X/Y` + `dX/dY` chips, and object-to-object smart guides that
    **extend** `computeGuides`/`computeSnap` (labels, anchor/endpoint snap, equal-spacing chips, hover
    highlight). New `src/config/smart-guides.js`; renderer also applies Lane B's stroke ctx on-canvas.
  - **Lane B (STR-1…6)** — per-layer stroke model (`lineJoin`/`miterLimit`/`dash`/`strokeAlign` + full
    `lineCap`), reusable Stroke Options panel, dash render-side, Align Stroke via closed-band offset,
    `StrokeModel.setStrokeWeight` (no pen mutation). Arrowheads + width Profile deferred (PRH-016/017).
  - **Lane C (PTH-1…5 + flipLayers)** — `window.Vectura.PathEditOps`: lossless Simplify preview/commit,
    Auto-Smooth, Smooth, anchor verbs + eligibility, live-shape auto-expand (`vectura:shape-expanded`),
    world-exact self-inverse `flipLayers`.
  - **Lane D (COL-1…4)** — anchored Pen Picker popover (Pens + New Pen), shared
    `PensPanel.assignPenToLayers` triple-write, mixed-pen `?` chip, eyedropper. MRU ordering deferred
    (PRH-018).
  - **Lane E (TXT-1…2)** — `TextOutlineOps.outlineText` → per-glyph path-layer group, one undo step;
    isolation drills into glyphs. Welded-kern gap deferred (PRH-014).
  - **Lane F (HUD-1…4)** — bottom hint-bar strip (config-driven per-tool hints, tool/zoom/rotation
    readouts, `Vectura.UI.toast()` canvas pill on `vectura:shape-expanded`, Contextual-hints toggle).
    rAF idle bail-out deferred (PRH-015).
  - **Integration reconciliations:** (1) **Flip seam (FLIP-1/2)** — the renderer flip wrapper no longer
    double-pushes history; `flipLayers` is the sole checkpoint owner (wrapper threads `app`, reads
    `res.changed`); a new composed regression `tests/integration/flip-one-undo-step.test.js` asserts a
    selection flip is exactly one undo step. (2) **contextualHints** folded into the App preference
    snapshot (`getPreferenceSnapshot`/`applyPreferenceSnapshot` + `captureState`/`applyState`); hint-bar
    localStorage fallback retired. (3) All new-module `<script>` tags added to `index.html` in load
    order. (4) PRH renumbered 014–018 (collisions resolved). (5) Dropped dead `alignClosedOnlyHint`
    string; wired `stroke-options.spec.js` into the e2e run.
  - **Deferred to Phase 2:** docked mount of the Stroke Options panel + Pen Picker chip (land in the
    Task Bar, TB-10 / TB-4/5/7); Pen-Picker popover e2e (until mounted). Both components reachable +
    tested now.
  - **Visual baselines:** re-ran `test:visual` post-merge — the v1.2.34 banded-bold change did **not**
    shift any Lane E/B baseline (all 34 pass); no re-baselining was required.
- **v1.2.35 — Band notches → adaptive join-disk sampling.** The silhouette nicks were 8-gon chord sagitta
  (0.076·R) in `strokeRingsToBand` join disks at every convex skeleton vertex; the band build now picks the
  side count so sagitta ≤ SIMP_TOL. Cleaner boundary → polygon-clipping retries vanish → ~6× faster cold Bold
  render and crumb-free output.
- **v1.2.34 — Banded bold residuals → noise floor.** Disk-sweep insight (Jay): a union of R-disks is fully
  pen-coverable — no "unreachable corner" physics for the built-in face. Shape-aware sliver filter (roundness
  4πA/P² ≥ 0.3 keeps compact pocket rings to minArea/16), 16-side join disks on erosion cuts. a–z coverage:
  22/26 at 0.00%, rest ≤0.09 mm whiskers. Coverage test extended to the 'u' spur.
- **v1.2.33 — Banded bold in-app fixes.** Post-review hardening of the v1.2.30 banded bold: erosion pass loss
  on dense curvy boundaries (simplified-boundary retries + single-shot-from-base fallback), silhouette bumps
  (sweep quads extended over skipped join-disk wedges), bare bowl spines (uniform-reliable coverage bookkeeping
  + exact closing contour at (bandW−penW)/2; skeleton demoted to last resort), and real pen width plumbed into
  engine bounds (pens panel regenerates text on committed width change). Gapless verified by true pen-coverage
  sampling a–z and in-browser; scanline test blind spot replaced with coverage sampling.
- **v1.2.32 — Type fills share the Paint Bucket control surface.** Extracted the paint bucket panel's variant
  grid + per-variant control rendering into a single shared module, `Vectura.UI.FillControlSurface`
  (`src/ui/fill-control-surface.js`), and mounted it in both the paint bucket panel and the Text panel's Fill
  tab. Type fills now expose the exact same twelve fill types and their full parameter sets as the bucket, driven
  by the same code (the engine path — `text.js → PaintBucketOps.buildFillRecord → _generatePatternFillPaths` —
  was already shared). Text keeps its bespoke main Angle dial (0°-up / −90° convention), Fill Offset pad, and
  Inset (excluded from the shared surface). RGR: new `tests/unit/fill-control-surface.test.js` +
  updated `tests/integration/text-panel.test.js`.
- **v1.2.30 — Built-in bold → banded concentric snake fill.** Replaced the built-in face's parallel-pass heavy
  weights (crossing lattices at junctions, splayed terminals) with a region-first model: per-glyph
  `strokeRingsToBand(thickness·penW)` → incremental morphological erosion (`GeometryUtils.insetMultiPolygon`,
  boundary-Minkowski subtraction — inward miter offsets self-cross near collapse and were rejected) at spacing
  `penW·(1 − inkOverlap)` (new `inkOverlap` param, default 15 %) → rings stitched into continuous snakes
  (`stitchConcentricRings`, segment-projection grafts) → skeleton medial pass when the deepest *reliable* ring
  leaves the spine bare (the deepest ring near bandW/2 pinches off locally and cannot be trusted for coverage).
  Per-glyph translation-normalized memo cache makes typing re-renders ~free. polygon-clipping hardening:
  `diskPhase`, `joinSkipAngle`, 1 µm coordinate snap + inset nudge-retry (fixed crashes and a 3 s sweep-line
  pathology). Legacy engine kept for sinusoidal/snake styles and headless. Covered by
  `tests/unit/geometry-band-fill.test.js` + `tests/integration/text-weight-band.test.js`. Merge note: the band
  is swept along the same bezierized contour v1.2.28 renders (curve strokes flattened via
  `rebuildShapeAnchors` + `buildPolylineFromAnchors`), so Bold reads as smooth as Regular.
- **v1.2.29 — Text specimen keeps real glyphs while editing** (no font swap on click; live trace from the
  contenteditable text).
- **v1.2.28 — Built-in stroke-font curves as native béziers.** Curve-built strokes tagged `meta.curve` in
  `stroke-font.js`; `text.js` bezierizes them at Catmull-Rom tension 1 (facets killed, corners preserved).
- **v1.2.27 — Web-font on-canvas editing** (point + area, exact `sourceIndex`).
- **v1.2.26 — Built-in text weight optics + fill-angle fix.** Built-in Vectura weights (extra parallel pen
  passes) are now metered by one pure source, `StrokeFont.weightMetrics(passes, capMM, penW)`:
  **F-03** widens the per-glyph advance (`extraTrackingMM = passes·penW·0.6`) so heavier stems don't merge, and
  **F-04** clamps the pen-pass thickness by optical cap size (`min(1+passes, ⌊cap·xHeightFrac/(2·penW)⌋)`) so
  small text keeps open counters. `text.js` applies both; web faces (real weighted outlines) keep plain
  tracking. Also fixed the text **Fill Angle** dial drawing perpendicular to the needle — canvas (`text.js`)
  and specimen (`ui-text-specimen.js`) now subtract 90° before the shared fill engine — and exposed
  `google-fonts.js` `flattenTol` so coarse-contour glyphs size their winding-canonicalization epsilon in
  display units. RGR: `tests/unit/stroke-font-quality.test.js` (29), `tests/integration/text-weight-optical.test.js`,
  `tests/integration/draw-order-reveal-smooth-tip.test.js`, updated `text-synthesis-features.test.js`.
- **v1.2.23–1.2.25 — Area Type on the Type tool.** Click-drag with the Type tool creates an Area Type frame
  (v1.2.23): additive `textMode`/`frameWidth`/`frameHeight` layer model, an `areaWrap()` word-wrapper keeping
  `sourceIndex` exact across wrap boundaries, fully editable wrapped text. Corner-handle **resize-reflow** re-wraps
  at constant point size (no glyph scale) with a red "+" overset out-port (v1.2.24). A **point↔area conversion
  dot** (hollow ring / filled dot) toggles the mode in one click (v1.2.25). Web-font area editing deferred
  (ligature `sourceIndex` degrades). Verified live in-browser; suites green.
- **v1.2.22 — Export plot-order fixes.** (1) The Export SVG "Line Sort Print Order" gear opened an empty
  settings pane when a Text layer was active (the bespoke Text-panel early return in `buildControls()` skipped
  the optimization-panel render, and the modal's fallback-layer recovery had nothing to promote in a Text-only
  doc). Hoisted the optimization render above the layer-type early returns and fire it on every early-return
  path while the export modal is open (`src/ui/panels/algo-config-panel.js`). (2) Changed the default Line Sort
  `method` from `nearest`+`vertical` to `asdrawn` so plots follow authored/reading order (left-to-right for
  text) instead of jumping between height bands (`src/config/defaults.js`). RGR:
  `export-text-layer-optimization.test.js` + a default-config case in `engine-workflow.test.js`.
- **v1.2.22 — Text decoration polish.** Strikethrough now rides the typeface's optical midpoint (x-height
  centre, from a new `xHeightFrac` exposed by `stroke-font.js` + `google-fonts.js`). Underline **and**
  strikethrough each gain a position offset, pen weight, a thickening mechanism (parallel / sinusoidal / snake
  offset passes + hatch / cross-hatch ribbon), and a 6-way line style (`meta.strokeDash`). Underline also has
  descender tail breaks whose padded gap is centred on each glyph's crossing-aware below-underline ink (equal
  padding both sides — fixed the off-centre `y` gap). All Caps↔Small Caps and Superscript↔Subscript are
  mutually exclusive (panel + algorithm guard), the Small Caps / Super / Subscript icons read clearly, and the
  default Text is sentence-cased (`Vectura`). Reveal panels show each decoration's controls only while it's
  selected. RGR coverage in `text-synthesis-features.test.js` + `text-panel.test.js`.
- **v1.2.21 — Bespoke Text panel (synthesis port).** Replaced the generic Text control list with a tabbed
  Type/Layout/Stroke/Fill panel + live opentype-traced specimen (the specimen is the editable text field).
  Ported from `design-explorations/text-panel-synthesis.html` via parallel implement→adversarial-review→judge
  teams. New modules `src/ui/ui-text-panel.js` + `src/ui/ui-text-specimen.js`, mounted through an early-return
  hook in `algo-config-panel.js`; CSS appended to `components.css` (`vtp-` namespace, token-driven). Added a
  large set of additive `ALGO_DEFAULTS.text` params (V/H scale, kerning, baseline shift, per-char rotation,
  caps/super/sub/underline/strike, indents, paragraph spacing, justification, font weight, fill inset/offset),
  consumed by `text.js` and the `google-fonts.js`/`stroke-font.js` layout engines (now returning glyph `meta`).
  Follow-ups: OpenType features beyond `liga` need a richer shaper than the vendored opentype build; hyphenation
  needs a wrap-width plumbed from the frame; specimen preview ignores a few typography params (cosmetic).
  **Decision:** the panel's per-layer **Plot Order** control (+ pen animation) was removed — the global
  **Line Sort** optimization (`defaults.js` linesort step, default `nearest`) governs final plot order and the
  draw-order scrub renders the optimized geometry, so a per-text plot-order hint was overridden/dead. `text.js`
  still honors the `plotOrder` param (kept for the algorithm + serialization); only the redundant UI was dropped.
- **v1.2.20 — Bezier smoothing for Contour fills.** Distance-field contour rings carried grid stairsteps.
  Added a fill **Bezier Curves** toggle + **Smoothness** slider (`fillContourBezier` / `fillContourSmoothing`):
  `_contourFieldFill` decimates each ring to ~grid scale and rebuilds it via `GeometryUtils.rebuildShapeAnchors`
  as a native cubic (short handles, so no counter bulge); `text.js` preserves the curve meta on fill paths.
  Both the fill and outline `bezierOutline` defaults flipped on. Shared with the paint-bucket contour fill
  (off by default there, no regression). RGR: contour-bezier on/off coverage through `text.generate` in
  `tests/unit/google-fonts.test.js`.
- **v1.2.19 — Prism Faces → Front gaps fixed.** The prism's hand-built side quads wound inward, so the
  `surfaceMode: 'front'` front/back test was inverted (near sides culled, far sides drawn) — visible holes.
  Routed the prism/antiprism side faces through the shared `orientFace` pass (`src/core/algorithms/polyhedron.js`),
  re-winding outward; no-op for the already-correct antiprism. RGR: a perspective front-cull regression test
  (the far side face must not survive `Faces → Front`), proven red against the inward winding. Suite green
  (unit 2126 / integration 652 / visual 24 — no baseline shift).
- **v1.2.17 — Polyhedron swept-profile family (Cone / Frustum / Cupola / Star Prism) + concave-normal fix.**
  Extended the existing `sideCount`/`depth` sweep family in `createSolidMesh` (`src/core/algorithms/polyhedron.js`)
  with four solids: `cone` (faceted pyramid), `frustum` (truncated pyramid, new `taper` param), `cupola`
  (2n-gon base → n-gon top, alternating triangle/quad band, `taper`-driven), and `starPrism` (extruded
  star profile, new `starRatio` param). New `taper`/`starRatio` controls gated by `polyhedronUsesTaper`/
  `polyhedronUsesStarRatio` in `controls-registry.js`; defaults added. Root-caused and fixed a latent
  concave-face bug found during adversarial review: `faceNormal` (`geometry3d.js`) used a first-three-points
  cross product that flips inward on concave polygons (the star caps), inverting the render-time front/back
  flag and Lambert shading — replaced with Newell's method (convex/triangular faces unchanged, all baselines
  hold). RGR: topology-scaling + winding-survival + a concave-cap regression test (proven red against the old
  normal); full suite green (unit 2125 / integration 652 / visual 24).
  still used naive polygon offsetting (`insetPolygon`), which self-intersects into chaotic tangled
  geometry on non-convex/varying-width glyph shapes at depth — reported as a scribbled-mess "VECTURA"
  contour on a script face at high density. Replaced inset contour with iso-contours of the
  distance-to-boundary field: a two-pass chamfer distance transform on a scanline-filled grid (grid
  honours the active even-odd/nonzero rule), then marching squares per ring level with edge-keyed
  segment stitching. Robust for any topology (pinch-off, varying stroke width, counters, overlaps);
  ring spacing calibrated to the thickest ink so thin strokes still get rings; path count grid-bounded
  (no high-density explosion). Outset kept on the old path. ~4–300ms/word depending on density+grid;
  acceptable for generation, a `fastPreview` downsample is a possible follow-up. +4 regression tests
  (non-convex chevron clean + bounded). Full unit/integration/visual/perf green. Verified visually on
  Oswald/Playfair/Lobster/Pacifico across densities. Reinforces [[feedback_verify_text_fills_real_path]]
  — the bug only showed at real density on a real script face.
- **v1.2.15 — Contour fills every letter + Type fills watertight on connected scripts (PRH-012).** Two
  fixes. (1) Contour's solid-shape branch sized its inset step to the whole letter (`√(area/π)/density`),
  far coarser than a glyph stroke is wide, so counter-less letters (V/E/C/T/U) collapsed after one ring
  and looked blank while R/A were dense — reported on a "VECTURA" contour fill. The solid step is now
  capped to the stroke thickness when the density step would give <2 rings; thick shapes and non-glyph
  contours are unchanged. (2) Connected-script faces (Pacifico, Dancing Script, Great Vibes) physically
  overlap adjacent glyph outers, which even-odd read as holes (counter bleed) and whose depth classifier
  left overlapped letters empty. Text now fills with the **nonzero winding** rule (gated via a
  `windingRule` flag): `compositeContainsPoint`/`scanLineClipComposite` accumulate signed winding and
  `classifyRegionTopology` classifies shells by "inner band is ink". For non-overlapping glyphs nonzero ≡
  even-odd, so non-script faces and every non-text consumer (paint bucket, pattern designer) are
  byte-identical. Verified across 11 typefaces (5 scripts) × 15 fills × 4 words × 3 densities = 1,980
  combos, 0 counter bleed; +14 regression tests; full unit/integration/visual/perf green. NOTE: real-app
  verification (via the actual `text.generate` algorithm path + visual renders) caught a contour defect
  that v1.2.14's isolated `_generatePatternFillPaths` tests missed — always verify text fills through the
  real algorithm path, not just the fill engine. Remaining: PRH-013 (halftone/maze extreme-density gaps).
- **v1.2.14 — Type fills made watertight & consistent across all fill types.** Text feeds every glyph
  contour (outer shells + counter holes) into the pattern-fill engine's composite branch; a dozen fills
  (dots/stipple/grid, contour, scribble, halftone, voronoi, truchet, maze, lsystem, spirograph, weave,
  flowfield) iterated per-loop and treated counters as solid (dots filled R/A counters; contour rendered
  only the first letter; scribble left non-convex letters empty). Introduced a shared region-topology
  layer (`classifyRegionTopology` + `interiorPointOf` + `groupCoherentClip`) and routed all composite
  fills through one even-odd ink invariant matching hatch/wave. Contour rewritten as a wall-aware annulus
  (offset outer inward + counters outward, step capped to wall thickness, thin-solid-shell fallback) so
  hairline bowls on Playfair/Lobster render; scribble/per-shell fills clip against a parity-consistent
  group-coherent set (fixing a neighbour-counter leak). Verified in-browser across 8 typefaces × 15 fills
  × 4 words × 3 densities (0 counter bleed, 0 empty shells) + a 47-case watertightness regression suite;
  full unit/integration/visual/perf suites green. Residual edge cases logged as PRH-012 (connected-script
  overlap) and PRH-013 (halftone/maze extreme-density coverage). Built via SWE+adversarial-reviewer+judge
  agent teams; the real-typeface browser pass caught two defects the synthetic tests missed.
- **v1.2.13 — Draw Order slider polish: single-row readout, full-width reveal, position-tinted halo.** The
  `Start … End` gradient labels and the `distance | lines | time` readout collapsed into a single
  `.draw-order-meta` flex row (`Start … dist | lines | time … End`) instead of stacking; labels
  dropped to 8px, and the global 2px runnable-track line is suppressed on the draw-order slider
  (`::-webkit-slider-runnable-track` / `::-moz-range-track` → transparent) so only the print-order
  gradient shows. The bar now paints the full start→end gradient across the **entire** track width
  and the fill **reveals** the left portion (an opaque track-coloured cap covers the unfilled right
  via a `calc(100% - var(--draw-order-fill))` background layer), so colours map to absolute plot
  position rather than a squeezed copy. The thumb halo (ring + glow) is tinted with the gradient
  colour sampled at the handle's current stop — `Renderer.refreshDrawOrderHalo` mixes the parsed
  start/end stops (`parseCssColor` handles hex + `rgba()`) at the fill fraction into
  `--draw-order-halo`, called from `updateDrawOrderOverlayToggle` and live on every slider `input`.
  Also documents the 1.2.11 relocation of the line-sort colour controls into this panel (on-canvas
  legend retired; colour-config window opens from the palette button, IDs preserved).
- **v1.2.10 — Raster-Plane base-noise Field Weight dials real relief + Bars default to solid.** The Image (Base) layer's *Field Weight* (the `imageSource` rack entry's `amplitude`) no longer contrast-stretches the `[0,1]` heightfield — which binary-saturated the surface once dialed past ~2 — but scales the **3D relief amplitude** directly: a new `baseReliefWeight(p)` reads the base layer's weight and `reliefAmp(p) = amplitude × baseReliefWeight` feeds both `surfaceSample` and `surfaceNormal`. The contrast-stretch and its `imageSourceCustomControls` amplitude gate were removed, so changing Field Weight keeps the faithful raw-sample base and just adds height. Range widened `-2..4` → `-10..25` in `RASTER_PLANE_NOISE_DEFS` (the deliberate exception to the shared Field-Weight cap). Switching Mode → **Bars** now cascades **See-Through OFF** (watertight solid relief; mirrors the Lines-as-Planes cascade). RGR: a neutralized-fix red proof on the new 3D dial-up unit test, a rewritten image-base preview-contract test (amplitude is a 3D scale, leaves the heightfield preview untouched), an identity test (Field Weight 1 ≡ no base layer), the bars-mode cascade integration test, and an updated control-defs contract. Full unit (2058) + integration (652) + visual (24) green.
- **v1.2.9 — Text typography overhaul (Font selection, stroke emphasis, fills, bezier outlines).** The Text algorithm's Font experience is now first-class. **Default font** is a vendored **Inter** face (`src/vendor/inter-400.ttf`, OFL-1.1) registered at boot via a new browser-only, silent-fail `GoogleFonts.registerVendored` (node/offline falls back to `sans` so baselines stay byte-identical). **Picker** renders in-font previews — Google rows in their own typeface (lazy via IntersectionObserver), built-in faces as inline `StrokeFont` SVG samples — with search on both tabs and the result cap raised to 1000. **Switching fonts no longer flashes the built-in placeholder**: `choose()` defers `app.regen()` until an unparsed web outline lands (the existing regen hook swaps it in). New `text.js` outline pipeline: **Bezier Curves** toggle converts opentype glyph commands to the engine's `meta.anchors` (via new `GoogleFonts.commandsToAnchors` + cardinal-handle cleanup `optimizeAnchorsCardinal`) so SVG export emits native cubic `C` (default off → polylines unchanged); a **Smoothness** slider drives the flatten tolerance. **Stroke emphasis** via *Outline Weight* + *Thickening Mode* (parallel/sinusoidal/snake) extracted into the shared `GeometryUtils.thickenPaths` (Harmonograph refactored onto it, output unchanged; Rainfall left on its specialised single-perp + trail-break path). **Pattern fills** on glyph interiors reuse the shared engine (`_generatePatternFillPaths` + `PaintBucketOps.buildFillRecord`, all fill types) with even-odd holes; *Stroke Outline* off → fill-only text. **Plot Order** (default Left → Right) stable-sorts paths by min-x. Covered by new unit tests (`commandsToAnchors`, `optimizeAnchorsCardinal`, smoothing→tolerance, `thickenPaths`, and the text fill/bezier/thickening/plot-order branches) and integration tests (in-font preview SVG, search, deferred-regen). Full `test:fast` green; visual baselines byte-identical.
- **v1.2.8 — Text algorithm gains the full Google Fonts catalogue.** The Font control is now a two-tab `fontPicker` (Built-in stroke faces + a searchable Google Fonts tab). A new `src/core/google-fonts.js` (`window.Vectura.GoogleFonts`) lazily fetches the CORS-friendly web-font catalogue (cached in `localStorage`), and on first use of a family lazy-loads a vendored outline parser (`src/vendor/opentype.min.js`), fetches that family's TTF, parses it, and registers a preview `FontFace`. `text.js` branches on a `google:<slug>` font key: when the family is parsed it traces glyph **outlines** into polylines via `GoogleFonts.layout` (adaptive de Casteljau flattening, cap-height mapped to the Size knob, alignment/tracking/line-height honoured); while it is still loading it renders the built-in stroke font and re-renders the layer when the outlines land (app registers a regen hook, mirroring the picture-decode pattern). Default Text layer stays on `sans` so presets/baselines are byte-identical. Covered by `tests/unit/google-fonts.test.js` (key scheme, weight/URL resolution, bezier flattening, layout positioning, the algorithm's swap/fallback branch) and `tests/integration/text-font-picker.test.js` (picker tabs render, built-in selection updates the layer, Google tab degrades gracefully offline).
- **v1.2.7 — Raster-Plane Bars gain a Corner Radius control.** `barCornerRadius` (0–100%, default 0) fillets each bar's footprint polygon via a `roundFootprint` helper (per-corner quadratic-Bézier fillet, trimmed up to half the shorter adjacent edge). Routed through the general N-gon prism builder (the legacy square fast-path stays byte-identical at radius 0); rounds in both See-Through ON wireframe and See-Through OFF solid hidden-line paths since they iterate footprint vertices generically. Covered by a new `raster-plane-bars.test.js` case (rounding multiplies top-edge count, radius-0 identity, finiteness through the solid path).
- **v1.2.7 — Lines as Planes silhouette fringe removed.** The closed top→floor→top curtain loop left a staircase of tiny detached segments down the left/right silhouette (each curtain edge pokes ~one occlusion column past the nearer row and survives as a stray tip once its middle is occluded). Curtains now draw the top ridgeline + the frontmost row's front-bottom contour; all interior floor contours are occluder-only via a new `draw:false` row flag in `geometry3d.occludeRowsFloatingHorizon` (the opaque band and back-row hiding are unchanged). Rewrote the three planes-mode occlusion tests to measure genuine top-on-top hidden-line removal at a low tilt (the old tests measured occlusion of the now-undrawn curtain bodies at a non-overlapping high tilt) and added a fringe-regression test.
- **v1.2.7 — Raster-Plane Bars gain Bar Sides + Bar Rotate, plus a bottom-contact-line fix.** Added a **Bar Sides** control (3–8, default 4) to the Bars render mode — tileable counts interlock gap-free (3 = triangles, 4 = squares, 6 = hexagons) while 5/7/8 inscribe a regular polygon per cell — and a **Bar Rotate** dial (−180…180°, default 0) that spins each footprint polygon about its center to orient the shapes and open/close the interlock. Defaults preserve the prior 4-sided square footprint. Also fixed the solid (See-Through OFF) render: bar walls that drop to the surface now draw a **bottom contact line** where the wall meets the plane, instead of vanishing into it. Regenerated the `raster-plane-bars-solid` visual baseline for the added contact edges.
- **v1.2.6 — Raster-Plane "Lines as Planes" base-height tuning.** The enable-cascade now seeds `baseHeight = 1` (was 0.33) and the Base Height slider maxes at 10 (was 1) for taller relief curtains. Updated `raster-plane-planes-cascade.test.js` to the new seed value.
- **v1.2.6 — Fill Density slider direction fixed (higher = denser, app-wide).** The shared `generatePatternFillPaths` engine consumed the slider value as raw spacing, so spacing-based fills (hatch/crosshatch/wave/dots/stipple/grid/meander/polygonal/triaxial/scribble) got *sparser* as the value rose — contradicting the label and the already-correct spiral/contour/radial. Inverted once at the dispatch chokepoint (`SPACING_LIKE_FILLS` set + `DENSITY_SPACING_REF=16`), so count-driven/own-knob fills are untouched and the default density (4) still maps to 4 mm (default fills unchanged). Added a `fill-param-effects.test.js` contract block (higher density → more geometry for spacing fills; contour/radial keep their direction) and updated the `fill.density` info text.
- **v1.2.6 — Dotscreen parametric dot shapes + directional Rotation ramp + interior Fill.** Replaced the fixed shape zoo with parametric shapes — Circle, Polygon (Sides), Star (Points), Gear (Cogs), Flower (Petals), Cross, Heart — with per-shape count knobs gated by `showIf` and area-preserving polygon circumradius. Added base Rotation + directional offset (Direction dial / Amount / easing Curve), plus Aspect and Jitter (dot size stays owned by Max/Min Dot + tone — no separate size control). Wired the universal Fill rack (`markerFill` + `fill*`) into each open-outline dot, mirroring the Spiralizer marker-fill bridge (sub-mm dots skipped; Smart-Edges unions only outlines). Legacy shape ids (square/diamond/…/burst) remap transparently; the two affected presets (Newsprint, Diamond Screen) were migrated to `polygon`+`dotSides` and re-bundled. Defaults preserve the classic circle screen bit-for-bit. Covered by rewritten `tests/unit/image-algorithms.test.js` cases (per-shape vertex counts, legacy remap, defaults-identity, rotation ramp via a uniform-tone fixture, aspect squash, jitter determinism, fill gating).
- **v1.2.5 — Raster-Plane Bars are a clean solid heightmap (See-Through OFF).** Replaced the wireframe
  bar render with analytic hidden-line removal in `raster-plane.js`: per cell, emit a top edge only
  where the neighbour is shorter (equal cells merge → no interior grid/walls) plus each camera-facing
  step's exposed riser, then clip every edge against the accumulated opaque faces of nearer bars
  (painter's nearest-first; faces carry a per-vertex depth plane). Pure plotter-ready vector segments,
  no fills. No see-through, no internal walls, no floating verticals at any angle; a smooth source
  renders as clean terraces. Verified across camera angles and a smooth-gradient control.
- **v1.2.2 — Text + picture algorithms, and an opaque-bars fix.** Three new 2D algorithms: **Text**
  (built-in single-line stroke font in `src/core/algorithms/stroke-font.js`, fit-to-frame layout with
  alignment/tracking/line-height/jitter), **Dotscreen** (halftone — picture → size-by-darkness dot
  screen), and **Weave** (image squiggle — picture → tone-modulated wavering lines). Both picture
  algorithms share a lightweight image-source helper (`image-source-util.js`) + a new `imageUpload`
  panel control, and fall back to a built-in shaded sphere. Also fixed **Raster-Plane opaque bars**:
  See-Through OFF now uses an interpolated screen-space depth buffer (per-vertex camera depth) instead
  of mean-depth painter faces, so nearer bars cleanly occlude the bars behind them with no sliver
  shatter or bleed-through. Follow-ups: per-algorithm preset files (the dirs exist but ship only the
  synthesized factory default); a richer built-in font set (weights / a true italic); optional
  smart-edge dot merging for Dotscreen (Clipper union) to reduce overlapping-dot pen passes.
- **v1.2.0 release.** All feature work since v1.1.0 — the universal preset system, the Morph
  modifier, the Pendula kinetic-harmonograph studio, the Petalis overhaul, four new 3D algorithms
  (Spiralizer, Topoform, Polyhedron, Raster-Plane) with STL import + shared rendering powers, the
  Terrain Free-3D mode with reworked river hydrology, and the gallery-first Wallpaper experience —
  shipped as **v1.2.0**. See `CHANGELOG.md` for the consolidated notes.

## Decisions
- In Wavetable `Isometric`, `Line Gap` refers to visible cell spacing and `Row Shift` applies as a coherent lattice shear across all three line families rather than offsetting only the horizontal rows.
- Positive Noise Rack amplitude only implies “up” for generators that convert noise directly into screen-space vertical displacement; radial, orbit, and vector-field consumers keep their existing amplitude semantics.
- Export configuration stays single-sourced through the existing `SETTINGS` object and layer optimization state; the Export SVG modal is only a preview/configuration surface and must not introduce a second export rules path.
- Document Setup unit choice is serialized with the project, but all internal physical geometry, paper, margin, stroke, and optimization math stays normalized in millimeters.
- Blueprint-style document-dimension labels are editor-only canvas chrome and never export.
- `Lissajous` exposes explicit endpoint truncation before `Close Lines`: `Truncate Start` and `Truncate End` remove 0-100% of arc length from each end, and `Close Lines` defaults to off.
- `Lissajous` `Close Lines` is a tail-trimming affordance, not a forced path-closure toggle: it preserves open paths and only replaces loose endpoints with exact self-intersection cutpoints when valid tail crossings exist.
- UI theme is a personal preference rather than project state: dark/light persists only through the existing cookie-preference snapshot, while `.vectura` project files continue to serialize document colors and pens without carrying a UI theme switch.
- `Noise Rack` is the product and architecture name for the universal multi-engine noise stack.
- `Universal` means every current noise-capable algorithm, not only new features and not only `wavetable`.
- `package.json` is the canonical app version source. Sync derived version surfaces with `npm run version:sync`.
- `README.md`, `plans.md`, `CHANGELOG.md`, the visible app version, and any affected in-app help/shortcut text are part of the required documentation surface for meaningful feature work.
- Layer Modifiers use explicit modifier-container layers (`containerRole = 'modifier'`) instead of overloading ordinary generator layers, so drag/drop nesting, export, and future modifier types share one tree model.
- Mirror Modifier axes are infinite reflection lines clipped only for guide drawing; multiple mirrors apply in stack order from top to bottom, and later mirrors operate on already-mirrored geometry.
- Mirror guide visibility/locking is editor-only state; dashed guides, triangles, and rotate handles never export, but mirrored child geometry does.
- Masking now follows an Illustrator-style parent-owned model: the visible parent layer is the mask, all descendants are clipped recursively, and the legacy source-layer mask workflow is retired rather than migrated.
- Mask parents can optionally hide their own artwork while still contributing silhouette clipping to descendants and export clip paths.
- `sourcePaths` are reserved for manual `expanded` geometry; generator-backed layers must always regenerate from their algorithm when the layer type changes.
- Live mask preview is editor-only: it never mutates layer geometry or export data, and it uses the active mask parent’s temporary transformed silhouette only while the drag is in progress.
- In `Rings`, `Top Down` means a universal world-space XY field beneath the artwork; `Concentric` means seam-corrected path-space sampling around each full ring loop; `Orbit Field` preserves the legacy ring-local orbital sampler.
- Live masking is non-destructive by default. Parent masks affect only descendants at display/export time; checked `Remove Hidden Geometry` trims hidden export geometry destructively while unchecked export preserves hidden source paths with SVG clip paths.
- `Remove Hidden Geometry` is export-only and defaults to on: checked exports physically trim hidden geometry to the current visible frame, unchecked exports preserve hidden source paths and recreate visibility with SVG clip paths.
- **Illustrator Tools Parity — Phase 1 in-lane decisions.**
  - SEL-3 flip geometry lives entirely in Lane C's `PathEditOps.flipLayers` (renderer is a pure invoker); the op reflects in **world** space and resets the transform, making flip world-exact and self-inverse at any rotation. `flipLayers` silently flattens live parametric shapes (rect `cornerRadii` / polygon `sides`) on flip (flip is not a PTH-5 verb, so no "Shape Expanded" toast).
  - Object smart guides **extend** the existing `computeGuides`/`computeSnap` pass (never a second guide system); magenta `#e6007e` token reconciled in one `drawGuides` pass with the existing cyan-center / yellow-equal-size styling; per-session candidate cache + N-nearest cap; grid and object snap compose (nearest per axis wins). SG-3 equal-spacing shipped in Phase 1 (perf headroom).
  - STR-4 Align Stroke inside/outside applies to **closed** subpaths only via the robust closed-band offset (`miterOffsetClosedRing`, not the collapse-prone `thickenPaths`); open paths stay centered; a per-path collapse guard silently reverts to centered (no tooltip). STR-5 pushes one history step per gesture on begin.
  - PTH: anchor-set contract is `[{layerId, pathIndex, anchorIndex}]`; `t→tolerance = (t/100)^2 · diagonal · 0.25`; `cutAtAnchors` splits at the named anchor (parametric), not region-based; smooth/convert/join deliberately also auto-expand + fire `vectura:shape-expanded` (a correct superset of the spec's simplify/cut, firing exactly once).
  - COL: the document pen list **is** the recent/available-colors surface (no separate recent row); popover↔docked panel stay in sync via a `#pen-list` MutationObserver; `createHsvHexPicker` was extracted from `openColorModal` (identical DOM/behavior).
  - TXT: glyph identity via the `layer.glyphs` sidecar (nearest-ink-centroid, inside-quad wins); group named `"<TextLayerName> Outlines"`, child names the raw char; pixel-identity asserted order-canonically.
  - HUD: zoom 100% = CSS-physical baseline; 4 px drag threshold clears hints; derived hint copy for pen/scissor/fill/lasso/hand/algo-draw/light-source; rotation readout is 0° until a viewport-rotation API lands.
  - Integration: FLIP-1/2 resolved by making `flipLayers` the sole history-checkpoint owner; `SETTINGS.contextualHints` is canonical in the App preference snapshot (localStorage fallback retired).
