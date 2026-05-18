# Adobe Illustrator Pathfinder Panel — UX Research

Reference: panel screenshot shows two labeled rows. Top row "Shape Modes:" has 4 icon buttons followed by an "Expand" text button. Bottom row "Pathfinders:" has 6 icon buttons. This spec targets pixel-faithful parity for a Vectura clone.

Primary source: Adobe helpx [Pathfinder panel overview](https://helpx.adobe.com/illustrator/desktop/manage-objects/reshape-transform-objects/pathfinder-panel-overview.html) and [Create compound shapes](https://helpx.adobe.com/illustrator/desktop/manage-objects/reshape-transform-objects/create-compound-shapes-with-pathfinder.html). Secondary: [Combining objects](https://helpx.adobe.com/au/illustrator/using/combining-objects.html), [Default keyboard shortcuts](https://helpx.adobe.com/illustrator/using/default-keyboard-shortcuts.html), [Shutterstock Pathfinder guide](https://www.shutterstock.com/blog/pathfinder-shape-modes-panel-guide), [Envato Tuts+ comprehensive guide](https://design.tutsplus.com/tutorials/a-comprehensive-guide-to-the-pathfinder-panel--vector-3306).

## Operation Reference

All ten operations require **2+ overlapping objects selected**. Result is auto-grouped if multiple paths remain. "Top/front" = topmost in z-order; "back/bottom" = bottommost.

| # | Section | Name | Tooltip | What it does | Result | Attribute winner |
|---|---|---|---|---|---|---|
| 1 | Shape Modes | **Unite** | "Unite" | Merges all selected shapes into a single outline = union of all areas. | Single path (or compound shape if Alt-clicked). | Topmost object's fill/stroke. |
| 2 | Shape Modes | **Minus Front** | "Minus Front" | Subtracts every front object from the bottom (backmost) object. | Single path. | Backmost object's fill/stroke. |
| 3 | Shape Modes | **Intersect** | "Intersect shape areas" | Keeps only the area where **all** selected shapes overlap; non-overlap discarded. | Single path. | Topmost object's fill/stroke. |
| 4 | Shape Modes | **Exclude** | "Exclude overlapping shape areas" | Keeps non-overlapping regions; even-overlap regions become holes (XOR). | Compound path. | Topmost object's fill/stroke. |
| — | Shape Modes | **Expand** | "Expand" (text button) | Converts a live compound shape into a baked Path or Compound Path. | Path / Compound Path. | Preserves compound's appearance. |
| 5 | Pathfinders | **Divide** | "Divide" | Slices every overlapping region into its own closed path along intersection lines. | Group of paths. | Each fragment keeps its original parent's fill; strokes preserved. |
| 6 | Pathfinders | **Trim** | "Trim" | Removes hidden (covered) portions of back objects; same-fill objects are NOT merged. | Group of paths. | Each object's original fill; **strokes removed**. |
| 7 | Pathfinders | **Merge** | "Merge" | Like Trim, then unions any adjacent same-fill paths. | Group/path. | Fill preserved per color cluster; **strokes removed**. |
| 8 | Pathfinders | **Crop** | "Crop" | Uses the frontmost object as a clipping mask, discarding everything outside it; frontmost object itself is consumed. | Group of clipped paths. | Each object's original fill; **strokes removed**. |
| 9 | Pathfinders | **Outline** | "Outline" | Converts every path into stroked open segments cut at every intersection. | Group of open paths. | Fill→stroke: each segment's stroke color comes from its original fill. Stroke weight = 0 pt by default. |
| 10 | Pathfinders | **Minus Back** | "Minus Back" | Subtracts every back object from the topmost (front) object. | Single path. | Frontmost object's fill/stroke. |

Sources for behavior and attribute winners: [helpx Pathfinder overview](https://helpx.adobe.com/illustrator/desktop/manage-objects/reshape-transform-objects/pathfinder-panel-overview.html), [Shutterstock guide](https://www.shutterstock.com/blog/pathfinder-shape-modes-panel-guide), [Envato Tuts+ guide](https://design.tutsplus.com/tutorials/a-comprehensive-guide-to-the-pathfinder-panel--vector-3306).

### Pre-conditions (enable/disable)

- All ten buttons require **≥ 2 objects selected**. With 1 or 0 objects selected, all buttons appear pressable but produce no result; Illustrator does not visually grey them out (documented limitation).
- Operations work on closed paths, open paths, compound paths, groups, and live shapes. Open paths are closed implicitly (start-to-end virtual segment) for boolean evaluation — see [pagecrafter Pathfinder tips](https://pagecrafter.com/intersect-not-working-illustrator-pathfinder-tips/).
- Pathfinder operations from the **panel** do not work on text, raster images, or symbols directly — convert text to outlines first. The **Effect > Pathfinder** menu version works on groups/text/layers without destroying them ([helpx combining objects](https://helpx.adobe.com/au/illustrator/using/combining-objects.html)).
- Groups: the panel buttons operate on the union of all paths inside any selected group. Nested groups are flattened in-place.

### Modifier-key behavior (Shape Modes only)

[Adobe helpx — Create compound shapes](https://helpx.adobe.com/illustrator/desktop/manage-objects/reshape-transform-objects/create-compound-shapes-with-pathfinder.html):

- **Plain click** on a Shape Mode (Unite / Minus Front / Intersect / Exclude): produces a **baked / expanded** result — destructive boolean, source objects gone.
- **Alt-click (Win) / Option-click (Mac)** on a Shape Mode: produces a **live compound shape** — non-destructive, source objects preserved and individually editable inside the compound. Each child stores its own shape mode tag (add / subtract / intersect / exclude). After Alt-clicking, the **Expand** button becomes the way to bake it.
- Pathfinder row buttons have **no Alt/Option modifier behavior** documented. (One Adobe UserVoice request proposes Alt-click-Expand to release compound shapes — currently not implemented; see [UserVoice ticket](https://illustrator.uservoice.com/forums/333657-illustrator-desktop-feature-requests/suggestions/33034699-alt-click-on-expand-button-in-pathfinder-palette-t).)

### Edge cases

- **Open paths**: Pathfinder closes them virtually for boolean math. Outline always produces open path segments. Unite on two open paths yields a closed path along their combined silhouette.
- **Text**: Must be outlined (Type > Create Outlines, Cmd/Ctrl+Shift+O) before panel-Pathfinder works. Effect > Pathfinder works on live text.
- **Raster images / linked files**: Ignored by panel Pathfinder. Crop with a raster front object does nothing; the raster is simply selected.
- **Single object**: Most operations no-op; Divide on a self-intersecting path still slices at self-intersections.
- **Identical/coincident paths**: With "Remove Redundant Points" on (panel menu > Pathfinder Options), duplicate anchors are collapsed.

## Compound Shape Semantics

Per [helpx Create compound shapes](https://helpx.adobe.com/illustrator/desktop/manage-objects/reshape-transform-objects/create-compound-shapes-with-pathfinder.html):

- A **compound shape** is "editable art consisting of two or more objects, each assigned a shape mode." It behaves like a single object in the Layers panel but exposes its members for re-editing — you can move, rotate, recolor, or change the shape-mode tag of any child non-destructively.
- A **baked path** (a.k.a. expanded) is a plain `<Path>` or `<Compound Path>` resulting from boolean evaluation — children are gone.
- **Plain click** → baked path. **Alt/Option click** → live compound shape. This is the central UX trick of the Shape Modes row.
- **Expand button** evaluates the compound's current shape modes and replaces the live compound with a flat `<Path>` (or `<Compound Path>` if the result has holes). Expand is only relevant — and only meaningfully enabled — when the selection is a live compound shape.
- **Release Compound Shape** (panel menu) restores the original member objects with their original colors and shape-mode tags discarded.
- **Nesting**: compound shapes may contain other compound shapes. They are re-editable indefinitely until Expanded or Released.
- **Compound shape vs. compound path**: a compound path (Object > Compound Path > Make, Cmd/Ctrl+8) only encodes holes via even-odd or non-zero winding. A compound shape encodes per-member booleans (add / subtract / intersect / exclude). See [Bring Your Own Laptop comparison](https://bringyourownlaptop.com/blog/compound-paths-vs-shapes-illustrator).

## Visual / Layout Spec

Based on the reference screenshot and current Illustrator builds:

- **Panel labels**: "Shape Modes:" and "Pathfinders:" rendered as small (~10–11 px) regular-weight sans-serif (Adobe Clean) in the panel's secondary text color. Trailing colon. Sentence-case, not all-caps.
- **Row layout**: label sits on its own short line; buttons sit on the next line as a single horizontal flex strip. Shape Modes row: 4 square icon buttons + small gap + "Expand" pill-shaped text button (wider, ~3× a single icon button). Pathfinders row: 6 square icon buttons, evenly spaced.
- **Button visuals**: icon-only, monochrome glyphs on a flat button background. Button size ~22×22 px. No labels under icons.
- **Hover state**: subtle background tint (slightly lighter than panel chrome).
- **Active/pressed state**: deeper inset background while mouse is down; operation fires on mouse-up.
- **Disabled state**: Illustrator does not visually disable Pathfinder buttons for low selection counts — they remain enabled-looking but no-op (a known UX quirk; some third-party guides flag it).
- **Row separator**: a thin horizontal divider between the Shape Modes and Pathfinders rows; no vertical dividers between buttons.
- **Expand button**: enabled only when the selection is a live compound shape. Greys out otherwise. Conveys "bake to flat path."
- **Keyboard shortcuts**: Illustrator ships **no default keyboard shortcuts** for any Pathfinder operation (per [helpx Default keyboard shortcuts](https://helpx.adobe.com/illustrator/using/default-keyboard-shortcuts.html) and [UserVoice request for Pathfinder shortcuts](https://illustrator.uservoice.com/forums/333657-illustrator-desktop-feature-requests/suggestions/37343224-keyboard-shortcuts-for-all-pathfinder-options-uni)). Users must assign via Edit > Keyboard Shortcuts. The only standard shortcut is **Shift+Ctrl/Cmd+F9** to open the panel. Adjacent shortcuts often confused for Pathfinder: Cmd/Ctrl+8 (Make Compound Path), Cmd/Ctrl+Alt+8 (Release Compound Path).

### Panel menu (hamburger / flyout) options

In top-down order ([Adobe helpx](https://helpx.adobe.com/illustrator/desktop/manage-objects/reshape-transform-objects/create-compound-shapes-with-pathfinder.html), [Envato Tuts+](https://design.tutsplus.com/tutorials/a-comprehensive-guide-to-the-pathfinder-panel--vector-3306)):

1. **Trap…** — advanced print pre-press; overlaps adjacent colors to hide registration gaps. *Advanced/optional for Vectura.*
2. **Repeat (last Pathfinder)** — re-applies the most recent operation.
3. **Pathfinder Options…** — opens dialog with:
   - **Precision** (0.001–100 pt, default 0.028 pt) — booleans tolerance.
   - **Remove Redundant Points** (checkbox, default off) — collapses coincident anchors.
   - **Divide and Outline Will Remove Unpainted Artwork** (checkbox, default on) — drops fragments with no fill.

   Reference: [Envato Tuts+ comprehensive guide](https://design.tutsplus.com/tutorials/a-comprehensive-guide-to-the-pathfinder-panel--vector-3306).
4. **Make Compound Shape** — equivalent to Alt-click-Unite on default; converts selection to a live compound.
5. **Release Compound Shape** — explodes a compound back to its source objects.
6. **Expand Compound Shape** — bakes a compound to a path (same as the Expand button).

For Vectura parity, items 1 and the Pathfinder Options dialog are *advanced/optional*. Items 4–6 are *required* for compound-shape parity.

## Discrepancies with the screenshot

- The screenshot shows enabled-looking buttons even with no selection — consistent with current Illustrator behavior; **not a bug to replicate as disabled**. Recommendation: Vectura should disable on `selection.length < 2` for clarity, diverging intentionally.
- The reference image labels the second row "Pathfinders:" (plural). Some legacy Illustrator builds rendered "Pathfinder:" (singular). Match the screenshot.
- Tooltip text in older Illustrator builds used phrases like "Add to shape area" / "Subtract from shape area" / "Intersect shape areas" / "Exclude overlapping shape areas." Current CC builds shortened these to "Unite" / "Minus Front" / "Intersect" / "Exclude" on the panel buttons but retained the longer phrasing in some tooltips. Treat the long forms as authoritative tooltip text (consistent across [krankykids cheatsheet](https://www.krankykids.com/cheatsheets/illustrator/pathfinder_shape_modes.html) and [Envato Tuts+ guide](https://design.tutsplus.com/tutorials/a-comprehensive-guide-to-the-pathfinder-panel--vector-3306)).
