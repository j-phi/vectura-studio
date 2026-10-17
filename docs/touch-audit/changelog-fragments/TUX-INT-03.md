# TUX integration gate, run 3 (touch/integration)

## CHANGELOG bullet
- Touch fixes found when the lanes were combined: on a heavy document an iPad or iPhone in Safari no longer stalls for about a second on every pane tap (the context bar recomputed the selection bounds twice per frame), and the Generator drawer content on iPad portrait in Safari is no longer reported hidden after the drawer opens.

## plans.md line
- [x] TUX integration gate run 3: two cross-lane fixes (TUX-023 handle-clearance cache for the per-frame context-bar re-anchor; TUX-008/011 WebKit drawer content restyle) and the WebKit iPhone portrait J2 ledger cell restored to its JRN-010 failure step.

## Product fixes (RED = the named check failed on touch/integration before the fix)
- TUX-023 (`renderer.js` `getHandleClearancePx`): the value is cached until a draw (`_drawSeq`), the view (scale, offset), the selection or the temp transform changes, and it no longer walks the selection twice. The context bar re-anchors on every animation frame and called it twice, so each frame walked the selection bounds up to four times. On the WebKit heavy fixture a frame took about 180 ms (main: 70 ms) and each Playwright box query about 2 s. RED: `journeys.spec.js` J2 on `webkit-ipad-portrait` and `webkit-iphone-landscape` ("j2.open-layers: exceeded the 20000 ms step budget"), and `tests/integration/touch-handle-clearance-cache.test.js` (new). After: about 61 ms a frame; J2 fails again only at its ledgered `j2.rename-open` (JRN-010).
- TUX-008 / TUX-011 (`components.css`, end of file): an open tablet drawer names its direct `.pane-body` children `visibility: visible`. WebKit kept the inherited `hidden` from the closed pane on `.left-panel-sections` and most section rows after the drawer opened (the value cleared only after a forced repaint). RED: `journeys.spec.js` J9 on `webkit-ipad-portrait` ("failed at j9.preset-save-open: invisible: visibility hidden on div.p-4").

## Ledger
- `journey-status.json`: `webkit-iphone-portrait` J2 goes back to `j2.rename-open` (JRN-010). Run 2 had pinned it at `j2.open-layers` (the step-budget stall above, which is now fixed).

## Open items (not changed by this run; need Jay)
- Target-audit `@audit-extra` rises (38 test cells over 9 projects): the five TUX-020 HUD buttons count as `covered` under the TUX-011 drawer backdrop and under modals, and the full-bleed backdrop (`cursor: pointer`, TUX-011) counts as one `safeUnprotected` target. Text panel on iPad portrait adds two WCAG 2.5.8 spacing items (`.vtp-spec-head-btn`, `.vtp-spec-pill-head`, `.vtp-vselect`). Raising these cells needs `TOUCH_BASELINE=update-any` and a `TUX-WAIVER:` line; this run did not do it.
- TUX-012 req 1 (names >= 96 px) vs TUX-008 iPad-landscape pane caps: names measure 85 px (nested rows 69 / 53 px) in the 200 px right pane on `touch-ipad-landscape` and `webkit-ipad-landscape`.
