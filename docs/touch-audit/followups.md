# Touch audit follow-ups

Items found during batch reviews. They are logged here, not fixed yet.

## From the B3 review

- **(a) CLOSED in B5.** iPad landscape: tool-rail buttons under the Document Setup drawer. The rail now rides above the drawer.
- **(b) CLOSED in batch G.** 874 x 330: export legend gear under the footer. The gear sits under the modal footer on the shortest phone landscape. This predates B3. Fix: move the legend above the footer or reserve space for it.

## From B4

- **Color picker, iPhone landscape: `covered` is 29 on this branch and 31 on 31aa7945, against a baseline of 28.** The cell measures pane controls under the open picker. The baseline is older than the last two B3 fixes. Re-seed it once the picker layout is settled.
- **`reachable` falls in the panel cells (see TUX-INT-batchB4-panels.md).** Larger rows push controls below the fold of a pane. The harness counts only controls that are on screen. Counting scroll-reachable pane controls (as modals now are) would end these waivers.
- **Pattern designer toolbar: CLOSED in B5.** The header row and the tool strip wrap. The B4 algorithm sweep still skips `pattern`; `targets-scene3d-petal.spec.js` covers it.

## From B5

- **CLOSED in batch G.** Collapsed right pane header is 52 px wide in a 36 px rail on touch-wide. The header (not the chevron's hit area) runs 17 px past the screen edge. The chevron's own box is clipped, its hit area stays at least 44 px. Cause: `body.touch-ui .pane-header-right .pane-title { margin-left: 52px }` holds the header open. Not fixed here.
- **`pane-collapsed .pane-toggle` width:** B4's `#left-pane button` and `#right-pane button` min-width rules now skip `.pane-toggle`.
- **874 x 330: export legend gear under the footer (B3 (b))** was closed in batch G.

## From batch G

- **CLOSED.** `ghost` 3 in the right-pane-pens cell: the pen swatch colour input was opacity 0 over a painted circle. The input now draws the circle itself.
