# Touch audit follow-ups

Items found during batch reviews. They are logged here, not fixed yet.

## From the B3 review

- **(a) iPad landscape: tool-rail buttons under the Document Setup drawer.** The buttons measure 39 x 44 while the drawer is open. The drawer covers part of the rail. This predates B3. Fix: offset the rail while the drawer is open.
- **(b) 874 x 330: export legend gear under the footer.** The gear sits under the modal footer on the shortest phone landscape. This predates B3. Fix: move the legend above the footer or reserve space for it.

## From B4

- **Color picker, iPhone landscape: `covered` is 29 on this branch and 31 on 31aa7945, against a baseline of 28.** The cell measures pane controls under the open picker. The baseline is older than the last two B3 fixes. Re-seed it once the picker layout is settled.
- **`reachable` falls in the panel cells (see TUX-INT-batchB4-panels.md).** Larger rows push controls below the fold of a pane. The harness counts only controls that are on screen. Counting scroll-reachable pane controls (as modals now are) would end these waivers.
- **Pattern designer toolbar (B5).** The Pattern algorithm panel reuses the Petal Designer toolbar. Its tool buttons (Selection, Direct Selection, Pen, Rectangle, Oval, Fill, Erase) are 27 px and run past the pane edge. The B4 algorithm sweep skips `pattern` for this reason. B5 must size them.
