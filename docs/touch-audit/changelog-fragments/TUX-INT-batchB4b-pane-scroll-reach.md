# TUX-INT B4b: pane scroll reach (Q22)

- Touch audit: a control below the fold of any scrollable pane, drawer body, formula pane or modal body counts in `reachable` when its real hit area after a minimal scroll is at least 44 x 44 (Q22). Non-scrolling clips and controls covered after the scroll stay unreachable. Three guard cases cover this.
- Pane bodies (`#left-panel-content`, `.right-tab-panel`, `.bottom-pane-body`, `.tool-drawer-body`) get a scroll cue on touch (`utils.scrollCue.bindPanes`).
- RED before the fix: `reachable` fell in 17 audit cells (generator-picker 9, fill-controls 6, text-panel 2) and text-panel `reachable` failed in the touch e2e on iPadP in both engines.
- Baseline: `reachable` rises in 70 cells (more controls counted). No other metric changed.
