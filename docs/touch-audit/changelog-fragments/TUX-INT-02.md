# TUX integration gate, run 2 (touch/integration)

## CHANGELOG bullet
- Touch fixes found when the lanes were combined: the Layers draw-order slider is no longer partly covered by the eye and gear buttons, the pen draft bar (Done / Remove Last Anchor / Cancel) no longer sits under the canvas zoom controls, the modifier buttons on a short iPhone landscape screen stay clear of the zoom controls, and the inline Pattern Designer fits its pane when the pane opens after the designer was built.

## plans.md line
- [x] TUX integration gate run 2: four cross-lane fixes (TUX-041/043 draw-order head, TUX-020/030 pen draft bar vs HUD, TUX-045/020 short-landscape modifier grid, TUX-008 inline Pattern Designer re-fit) and stale-test updates for TUX-045, TUX-048, TUX-050, TUX-054, TUX-008.

## Product fixes (RED = the named spec failed on touch/integration before the fix)
- TUX-041 / TUX-043 (`components.css`, end of file): on every touch layout the draw-order head keeps a 14 px margin, so the 44 px `::before` of the 18 px eye/gear icons clears the 44 px slider; off touch-wide the head also gets a 4 px right inset so the gear box is not clipped by the pane edge. RED: `sliders.spec.js` (a) draw-order hitArea 37 / 32 px (iPadP, iPadL, iPhL), `targets-controls.spec.js` gear 43x44.
- TUX-020 / TUX-030 (`components.css`): while `.ctxbar--pen-draft` is mounted the HUD rides above it (same offset as the TUX-022 fill bar). RED: `pen.spec.js` Cancel covered by `canvas-hud-history` / `canvas-hud-view` (iPadL, iPhP, coarse-wide, WebKit).
- TUX-045 / TUX-020 (`components.css`): below 361 px tall, `body.phone-layout.phone-short #touch-modifier-bar` is a 2 x 2 grid (TUX-007 sized it as two columns for this reason). RED: `undo-zoom.spec.js` Fit hit 46x33 and "btn-hud-fit overlaps touch-modifier-bar" on touch-iphone-landscape-chrome.
- TUX-008 (`ui-pattern-designer.js`): an inline designer built inside a closed (0 x 0) pane re-fits once the pane opens and its size settles (ResizeObserver, 250 ms settle). Before, it kept the 460 x 320 fallback and overflowed a 254 px phone pane. RED: `modals.spec.js` C Pattern Designer (inline) "a clear pinch spot exists" on iPhL (Chromium + WebKit).

## Stale assertions updated (intentional TUX changes)
- `journey-defs.js` j9.paper-section: Paper starts open on touch (TUX-050 req 3); tap only while collapsed.
- `journey-defs.js` j10.export-download / j10.save-vectura + `pages.js` `savedFileName`: accept a download or a share-sheet call (TUX-054 routes WebKit coarse saves to `navigator.share`). Added to the journey static guard's evaluate allowlist (read-only instrumentation).
- `drawers.spec.js` toast test: longer message, since TUX-048 lets a touch toast span the viewport.
- `tooltips.spec.js` (j): TUX-045 tasks (`multiSelect`) carry a visible text label in every layout.
- `image-import.spec.js` setup: a tablet drawer opens through `Workspace.paneState` (TUX-008), not `pane-force-open`.
- `layers-panel.spec.js`: centre the row before the hit probe (fractional scroll left the last row 0.5 px under the list edge).
- `gestures.spec.js` (e): move the view down until the press path is clear of the TUX-045 touch-wide modifier bar.
- `motion-curve-points.spec.js`: scroll Remove/Add into view before the tap (330 px landscape).
- `journey-status.json`: regenerated; 12 cells now pass, 11 failures moved to a later step. Two WebKit iPad-portrait cells were NOT re-ledgered (J2 moved earlier, J9 is new); they stay red.
- `target-baseline.json`: `TOUCH_BASELINE=update` only (126 cells lowered, none raised).

## Notes for the integrator / Jay
- Open conflict, needs a decision: TUX-012 req 1 (layer names >= 96 px) vs TUX-008 iPad-landscape caps (right pane 200 px for the 45 % canvas floor). Names measure 85 px at 200 px; 212 px drops the canvas share to 43.9 %.
- Target-audit rises are lane-composition, identical at the previous integration merge (50ffb5f2): the five TUX-020 HUD buttons are counted as covered under the TUX-011 drawer backdrop and under modals; the backdrop itself counts as one safeUnprotected target; Text panel adds wcag258 spacing items on iPadP. Raising these cells needs `TOUCH_BASELINE=update-any` and a `TUX-WAIVER:` line, which this run did not do.
