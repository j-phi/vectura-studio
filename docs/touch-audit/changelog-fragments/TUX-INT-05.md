# TUX integration batch 3 (touch/integration)

## CHANGELOG bullet
- Touch: with several layers selected, the Layers action strip now fits the pane. Mask, Duplicate and Delete are 44 px buttons, and a ⋯ menu holds Hide, Lock, Group, Ungroup and Expand. A tap on an unavailable action explains why in a toast. A tap right after the phone menu closes (Undo, the menu button) now works. The toast no longer covers the bottom-pane expand button. The font list keeps three rows with the keyboard open in landscape.

## plans.md line
- [x] TUX integration batch 3: TUX-036/041 strip, TUX-012 menu test, TUX-058 audit reds (open menu and drawer backdrop are inert layers; text head hit areas; docked pane safe band), TUX-001 swallow without a time window, TUX-048 bottom toggle, TUX-032 compact popover, TUX-059 harness (WebKit fixture, scroll label, J2 bound, dead helper).

## Decisions (with evidence)
- TUX-058 `covered`: a target under an open dropdown menu or under the visible drawer backdrop is classed `popup-covered`: not `covered`, not `reachable`. Both layers dismiss on an outside tap (TUX-001, Q13). RED: iPadL menu-file covered 4 vs baseline 3 (the File panel x 180-424 covers Selection, Direct, the left toggle and Multi-select). A guard test proves a plain overlay still counts as `covered`. Baselines only went down.
- TUX-032 compact popover rows are 22 px (typing mode with the keyboard up). A 3-row list at 44 px does not fit 104 px (iPhone landscape in browser chrome).
- WebKit finger scroll: Playwright WebKit has no trusted touch scroll (`page.touchscreen` is tap only; synthetic touches run no native scroll). Cells that use the programmatic scroll are labelled "WebKit finger-scroll unproven" in the ledger file. A real device check is listed in the device checklist.
- J2 rename latency bound: 2500 ms, measured. Chromium iPad needs 1583, 1615, 1728 ms on the heavy document (so the old 1500 ms bound fails there); iPhone landscape 658-667 ms; iPhone portrait 18-20 ms; WebKit 12-36 ms.
- WebKit double-tap clock path: the heavier `journey-heavy-webkit` fixture cannot make a real double tap in Playwright WebKit (the second tap queues behind the busy main thread: second pointerdown 1085 ms after the first, sent at 110 ms). `rename-paths.spec.js` test 3 stamps the events itself (110 ms apart, 700 ms busy thread between) and runs on both engines. Mutation check: with `Date.now()` in place of the event stamp it fails on WebKit (opened false, expected true).
- Removed the dead `captureFile` helper.
