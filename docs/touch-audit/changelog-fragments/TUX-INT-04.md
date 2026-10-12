# TUX integration gate, run 4 (touch/integration)

## CHANGELOG bullet
- Touch: the on-canvas Undo / Redo / Zoom / Fit buttons now step aside while a side drawer or a dialog is open, and come back when it closes. Under the drawer backdrop or a dialog they could not be tapped, but they still looked live.

## plans.md line
- [x] TUX integration gate run 4: TUX-020 HUD steps aside under the TUX-011 drawer backdrop and under modals (34 target-audit `covered` cells lowered, none raised); TUX-017 gesture spec measures its empty-canvas pinch spot after the context bar re-anchors.

## Product fix (RED = the named check failed on touch/integration before the fix)
- TUX-020 / TUX-011 (`components.css`, end of file): `.canvas-hud` is `visibility: hidden` while `#mobile-pane-backdrop.visible`, `#modal-overlay.open` or an open `.vectura-modal-backdrop` is on the page. RED: `undo-zoom.spec.js` "TUX-020 R-i" (new): "no HUD button is shown under the backdrop: expected 0, received 5" (iPadP), 3 (iPhP); under a modal 5 / 3 / 5 (coarse-wide). The target audit counted these buttons as `covered` (iPadP drawer states +5, modal states +2..+4).

## Harness fix
- TUX-017 `gestures.spec.js` `prepare()`: the empty-canvas target is measured again three animation frames after the view move. The context bar follows the selection on the next frames; on iPhone landscape it landed on the first estimate (y 246) and both pinch fingers hit `.ctxbar-label`, so "simultaneous pinch, Select" and "no one-finger action after the pinch" failed with scale ratio 1 (deterministic in Chromium iPhL, also at 16d6b68a~1).

## Baseline
- `target-baseline.json`: `TOUCH_BASELINE=update` only. 34 `covered` cells lowered (modal and drawer states, all touch and WebKit projects). No cell raised.

## Open items (not changed; need Jay)
- `#mobile-pane-backdrop` counts as one `safeUnprotected` target in every drawer state on iPadP and iPhL (full-bleed, `cursor: pointer` for the iOS click, TUX-011). An inset hit area would let taps in the safe strips fall through to the canvas.
- iPadP drawer states: `reachable` is 1 below the baseline (present at c992cc9c too).
- iPadP text panel: 3 WCAG 2.5.8 items (`.vtp-spec-head-btn` 49x15, `.vtp-spec-pill-head` 49x22, `.vtp-vselect` 49x10); iPadL text panel: `select.vtp-guide-pick` in the bottom safe band; WebKit iPadP text panel `covered` +1.
- iPadL File menu: `covered` 4 vs 3 (the menu panel covers Selection, Direct, the left pane toggle and Multi-select).
- TUX-012 req 1 (names >= 96 px) vs TUX-008 iPadL pane caps: names 85 px (nested 69 / 53 px) on `touch-ipad-landscape` and `webkit-ipad-landscape`.
