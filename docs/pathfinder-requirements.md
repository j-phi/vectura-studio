# Pathfinder Subpanel — Product Requirements (v1)

Status: implementation-ready. Owner: Vectura UI / core boolean.
Predecessors: `src/core/pathfinder-ops.js`, `src/ui/panels/pathfinder-panel.js`, `docs/pathfinder-ux-research.md`.

## 1. Goal & Non-Goals

**Goal.** Ship full Illustrator-Pathfinder parity for the six remaining Pathfinder-row operations (Divide, Trim, Merge, Crop, Outline, Minus Back) and restructure the existing Pathfinder panel into a collapsible `Pathfinder` section that matches the Align panel's `global-section` pattern. Result: a user with Illustrator muscle memory can select 2+ layers and click any of the ten buttons with no surprises, working within Vectura's line-art conventions.

**Non-goals (v1).**
- No live "compound shape" semantics for the six Pathfinder-row ops. Pathfinder ops are **destructive / baked** outputs grouped under a plain `groupType: 'pathfinder'` container — they do **not** create `type: 'compound'` layers. Live re-editability stays exclusive to the existing Shape Modes path.
- No Alt/Option modifier behavior for Pathfinder-row ops (Illustrator itself has none). Alt-click on a Shape Mode (currently produces a compound) keeps its existing meaning.
- No panel-menu flyout, no Trap, no Pathfinder Options dialog (precision / redundant-points / unpainted-artwork toggle). Precision is fixed; unpainted artwork is always kept (line-art parity — see §4.5).
- No new keyboard shortcuts (Illustrator ships none; matching that).
- No new boolean engine. All ops route through the existing `Vectura.FillBoolean` primitives already used by `pathfinder-ops.js`.

## 2. UI Structure

### 2.1 Section wrapping

The existing `.pathfinder-panel` block in `index.html` (currently lines 458–487 of `index.html`) gains a single outer `.global-section` wrapper named **"Pathfinder"**, matching the Align panel pattern exactly. Inside, the mode toggle and the two operation rows become a flat body (no sub-sub-collapsibles in v1 — Illustrator presents both rows always-visible inside one panel; mirror that).

```html
<div id="pf-section-root" class="global-section pathfinder-panel-section" data-pf-section="root">
  <button id="pf-section-root-header" class="global-section-header" type="button" aria-expanded="true">
    <span class="global-section-title">Pathfinder</span>
    <span class="global-section-toggle" aria-hidden="true"></span>
  </button>
  <div id="pf-section-root-body" class="global-section-body">
    <div class="pathfinder-panel">
      <!-- existing .pathfinder-panel-modes, .pathfinder-panel-row × 2, hint -->
    </div>
  </div>
</div>
```

### 2.2 Persistence

Header collapse state persists under `SETTINGS.uiSections.pathfinder` (boolean; `true` = open). Default open. Add the key to `src/config/defaults.js` `uiSections` block. Wire collapse/expand into the existing `global-section` handler that already drives the Align subsections (no new collapse logic).

### 2.3 Row labels (unchanged from current DOM)

- Top row label: `Shape Modes:` followed by the 4 shape-mode buttons and the `Expand` text button.
- Bottom row label: `Pathfinders:` followed by the 6 pathfinder buttons.
- Mode toggle (Silhouette / Shape-Only) stays at the top of the body, above the Shape Modes row.

No icon redesign — `Vectura.Icons.pathfinder` already exports factories for all ten ops; the existing `paintIcons()` pass in `pathfinder-panel.js` picks them up. The Outline icon factory is reused but should be replaced (see §4.5 icon note).

## 3. Button Enablement Rules

`refresh()` in `pathfinder-panel.js` is the single source of truth. Each evaluation runs on selection-change.

| Button | Enabled when | Disabled hint text (sets `#pathfinder-panel-hint`) |
|---|---|---|
| **Unite / Minus Front / Intersect / Exclude** | (existing) `eligibleInMode.length >= 2` OR a single `type:'compound'` is selected | "Select 2+ layers to combine." / "Shape-Only needs 2+ closed shapes." (existing) |
| **Expand** | (existing) exactly one `type:'compound'` selected | (no hint — silently disabled) |
| **Divide** | `eligibleInMode.length >= 2` | "Select 2+ overlapping layers to divide." |
| **Trim** | `eligibleInMode.length >= 2` | "Select 2+ overlapping layers to trim." |
| **Merge** | `eligibleInMode.length >= 2` | "Select 2+ overlapping layers to merge." |
| **Crop** | `eligibleInMode.length >= 2` | "Select 2+ layers; the topmost crops the rest." |
| **Outline** | `eligibleInMode.length >= 2` | "Select 2+ overlapping layers to outline." |
| **Minus Back** | `eligibleInMode.length >= 2` | "Select 2+ layers; everything below subtracts from the top." |

**Universal rules** (apply to all 6 new buttons in addition to the per-button rule):
- A single selected `type:'compound'` does **not** enable Pathfinder-row buttons (unlike Shape Modes). User must expand first. Show: "Expand the compound shape first to use Pathfinders."
- Locked layers, hidden layers, and modifier-group containers are filtered out before the count, via the existing `getEligibleLayers()`.
- In `shape-only` mode, the eligible filter (`shapeOnlyEligibility`) applies identically. Open paths are excluded in shape-only mode; chord-closed in silhouette mode (§4 per-op).
- Pathfinder-row buttons do **not** have a "single compound → change opType" path (they don't create compounds).

## 4. Per-Operation Spec

All ops:
- Wrapped in a single `app.pushHistory()` → mutate → `engine.computeAllDisplayGeometry()` → `app.render()` + `app.ui.renderLayers()` → `refresh()` cycle (one undo step).
- Output layers (when more than one) are wrapped in a new group container with `isGroup: true`, `groupType: 'pathfinder'`, `groupCollapsed: false`, name = `"<OpName> Result"` deduped via the existing `generateCompoundName` pattern. Group is inserted at the z-index of the frontmost input. Source layers are **removed** (destructive). All new layer IDs are generated via the existing `Math.random().toString(36).slice(2, 11)` + `_layerCounter` pattern in `createCompound`.
- Inputs are normalized via `geometryFor(layer, mode, engine)` (existing). This means silhouette mode chord-closes open paths via `Masking.getLayerSilhouette` (which already falls back to bounding rect), and shape-only mode skips ineligible layers. Document this **once**; per-op rows below say "uses standard `geometryFor` input pipeline."
- Zero-overlap behavior: ops degrade as documented per-op below. They never throw; they may produce an empty group (in which case the op is a no-op and history is **not** pushed — see §4.7).
- Appearance fields copied: `penId`, `color`, `strokeWidth`, `lineCap`. For Outline, fill source → stroke color (see §4.5).
- Add a new icon factory key only for `outline` redesign (others already exist in `Vectura.Icons.pathfinder`); see §4.5.

Back-to-front ordering is the existing `sortBackToFront(layers, engine)`. "Top" / "front" = last in array.

### 4.1 Divide

- **Tooltip:** `Divide`
- **Inputs:** 2+ eligible layers. Silhouette or shape-only mode.
- **Algorithm:** For each input multipolygon `Pi`, output the **arrangement cells** of the union. Concretely: compute `U = union(P1..Pn)`. For every non-empty subset `S ⊆ {1..n}`, compute `cell(S) = intersection(Pi for i∈S) − union(Pj for j∉S)`. Each non-empty `cell(S)` becomes one output layer whose appearance is inherited from `topmost(S)` (highest-z input in the subset). Implementation note: this is `O(2^n)`; cap `n` at 8 (show hint "Divide supports up to 8 layers; please reduce the selection."). For 2 ≤ n ≤ 8 this is fast enough for interactive use given Vectura's typical selection sizes.
- **Output:** group of N flat `type:'shape'` layers, each with `paths` = baked closed polygons (`meta.kind='polygon', meta.closed=true, meta.source='pathfinder-divide'`). Strokes **preserved** (Illustrator parity for Divide alone — Trim/Merge/Crop/Outline strip strokes; Divide keeps them).
- **Open paths:** chord-closed by `geometryFor` in silhouette mode; ineligible in shape-only mode.
- **Zero overlaps:** each input becomes its own output cell (i.e. you get back N layers identical to the inputs but in a new group). This matches Illustrator.
- **Z-order:** preserves source z-order within the group; group sits at frontmost input's old slot.
- **Icon factory:** `Vectura.Icons.pathfinder.divide` (exists).

### 4.2 Trim

- **Tooltip:** `Trim`
- **Inputs:** 2+ eligible layers.
- **Algorithm:** For each input `Pi`, output `Pi − union(Pj for j > i in z-order)`. Drop empty results.
- **Output:** group of ≤ N flat `type:'shape'` layers. **Strokes stripped** (`strokeWidth = 0`). Fill inherited from the original layer. No color-based merging (that's Merge).
- **Open paths:** silhouette closes; shape-only skips.
- **Zero overlaps:** every input survives untouched (modulo strokes stripped). Output = N layers in a group.
- **Z-order:** preserved within group.
- **Icon factory:** `Vectura.Icons.pathfinder.trim` (exists).

### 4.3 Merge

- **Tooltip:** `Merge`
- **Algorithm:** Run Trim as in §4.2 to produce per-layer non-overlapping fragments. Group fragments by **fill identity** (`penId` if set, else `color` string). Within each group, union the multipolygons. Each union becomes one output layer with that fill, strokes stripped.
- **Output:** group of ≤ N flat `type:'shape'` layers (one per distinct fill-identity).
- **Open paths:** silhouette closes; shape-only skips.
- **Zero overlaps:** equivalent to Trim with same-color unions (still produces N layers if all colors distinct, fewer if colors collide).
- **Icon factory:** `Vectura.Icons.pathfinder.merge` (exists).

### 4.4 Crop

- **Tooltip:** `Crop`
- **Inputs:** 2+ eligible layers. The frontmost is the cookie cutter.
- **Algorithm:** Let `F` = front layer's multipolygon, `Lj` (j < front) = the rest. For each `Lj`, output `Lj ∩ F`. Drop empty. **The front layer itself is discarded** (consumed by the crop, per Illustrator).
- **Output:** group of ≤ (N-1) flat `type:'shape'` layers, fills inherited per source, **strokes stripped**.
- **Open paths:** silhouette closes; shape-only skips. If the front layer is ineligible in the current mode, show hint "Crop needs a closed front shape — switch to Silhouette." and do not execute.
- **Zero overlaps:** front discards everything → empty result; no-op + hint "Crop produced no geometry (no overlap with front shape)."
- **Icon factory:** `Vectura.Icons.pathfinder.crop` (exists).

### 4.5 Outline

- **Tooltip:** `Outline`
- **Inputs:** 2+ eligible layers.
- **Algorithm:** For each input's silhouette ring(s), break every ring into open segments at intersection points with **all** other inputs' rings (and self-intersections). Each segment is one output open path; stroke color = source layer's `color`/`penId`; `strokeWidth` inherits from source (Illustrator uses 0pt; Vectura defaults to source weight because plotter output requires a real stroke width — divergence noted).
- **Implementation note (line-art divergence):** Illustrator deletes interior fills; Vectura already operates on stroke-only line art, so "delete fill" is a no-op. The key behavior is **splitting at intersections**. Use `FillBoolean.union(P1..Pn)` to build the planar arrangement of edges, then walk each input's ring and split at any vertex of the arrangement that lies on the ring (within `FillBoolean` epsilon). For v1, take the simpler equivalent route: for each input ring `Ri`, compute `Ri ∩ Pj` and `Ri − Pj` segment-by-segment for every `j ≠ i`; concatenate boundary fragments. If the boolean library's segment-level slicing is not exposed, walk the ring polyline against each other ring as a polyline-polygon intersection (existing `geometry-utils.js` provides segment intersection helpers).
- **Output:** group of K open-path `type:'shape'` layers, each with one open polyline path (`meta.kind='polyline', meta.closed=false, meta.source='pathfinder-outline'`). No fill semantics.
- **Open paths:** input open paths participate as their literal polyline (no chord closure for outline — they're already lines).
- **Zero overlaps:** each input becomes one output layer = its source ring(s) flattened to open polyline(s), unchanged. Useful pass-through.
- **Icon factory:** the existing `Vectura.Icons.pathfinder.outline` is identical to `divide`. Replace it with a distinct glyph: two overlapping rounded rects, no fill, with a tick mark indicating an intersection cut on the shared border. Suggested path: `PF_BACK_RECT + PF_FRONT_RECT + '<circle cx="14" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none"/>'`.

### 4.6 Minus Back

- **Tooltip:** `Minus Back`
- **Inputs:** 2+ eligible layers.
- **Algorithm:** Let `F` = front layer, `Bj` = all others. Compute `F − union(Bj)`. Single output.
- **Output:** **single** `type:'shape'` layer (not a group — matches Illustrator's single-path output). Inherits front layer's full appearance. Source layers removed. Inserted at front layer's old z-index. Strokes preserved.
- **Open paths:** silhouette closes; shape-only skips. If front is ineligible in shape-only mode → hint "Minus Back needs a closed front shape — switch to Silhouette." and no-op.
- **Zero overlaps:** front survives unchanged.
- **Icon factory:** `Vectura.Icons.pathfinder.minusBack` (exists).

### 4.7 Empty-result policy (global)

If a Pathfinder op produces zero non-empty output polygons:
- Do **not** push history.
- Do **not** mutate the layer list.
- Set hint to `"<OpName> produced no geometry."` for 3 seconds, then clear on next `refresh()`.

## 5. Acceptance Criteria — Unit Tests (`pathfinder-ops.test.js`)

Add a new export `Vectura.PathfinderOps.applyPathfinder(engine, layers, op, mode)` that performs the destructive mutation and returns `{ groupId, layerIds }` (or `null` on empty). Tests bracket with a fake engine + `Layer` factory matching existing test fixtures.

Per op, the following RGR cases must each fail without the implementation and pass with it:

### Divide
1. Two overlapping squares (A back red, B front blue, 50% overlap) → group of 3 layers: A-only (red), B-only (blue), overlap (blue, topmost wins).
2. Three concentric squares → group of 5 layers (outer ring, middle ring, inner; per Illustrator's 2^n−1 cells, minus empties).
3. Two disjoint squares → group of 2 layers, each identical to its source.
4. n = 9 inputs → hint "Divide supports up to 8 layers…"; no mutation.
5. One closed + one open path in silhouette mode → open path chord-closed; output has both contributions.

### Trim
1. Two overlapping squares → group of 2: back square minus overlap (red, no stroke), front square unchanged (blue, no stroke).
2. Three stacked rectangles → group of 3 with progressive trimming.
3. Two disjoint shapes → group of 2 identical-modulo-stroke copies.
4. Identical front and back → back becomes empty → dropped; group contains only front.
5. Strokes stripped: `strokeWidth === 0` on every output.

### Merge
1. Two overlapping squares with **same** fill `#ff0000` → group of 1 layer (union).
2. Two overlapping squares with different fills → identical to Trim output (group of 2).
3. Three squares, two share a color, one different → group of 2 (one merged-pair, one solo).
4. `penId` collision counts as identity even if `color` differs.
5. Strokes stripped.

### Crop
1. Front square crops back square (overlap region) → group of 1 (back-color rect of overlap), strokes stripped, front discarded.
2. Front fully contains a back layer → group of 1, back layer unchanged (modulo stroke strip), front discarded.
3. Front fully outside back → empty result → no-op + hint.
4. Front shape-only-ineligible in shape-only mode → hint, no mutation.
5. Three layers (front, mid, back) → group of 2 (mid∩front, back∩front).

### Outline
1. Two overlapping squares → 8 open-path layers (4 from each square, split at the two intersection points per side). Counts: A contributes 4 segments, B contributes 4 segments.
2. Two disjoint squares → group of 2, each a single open polyline copy of the input ring.
3. Stroke color = source fill color verified on each output.
4. Open input + closed input → open input passes through; closed input is split.
5. `meta.closed === false` on every output path.

### Minus Back
1. Front − union(back) on two overlapping squares → single layer, front shape with a notch.
2. Front fully contained in back → empty result → no-op + hint.
3. Front fully outside back → front survives unchanged.
4. Three layers (front + 2 backs) → single output = front − (back1 ∪ back2).
5. Output is **single layer at front's z-index**, not a group.

### Cross-cutting
- After every successful op: `engine.layers` no longer contains source layer IDs (destructive verified).
- Empty result: source layers untouched, `pushHistory` not called.
- History snapshot before op + undo restores selection to original state (integration test, §6).

## 6. Acceptance Criteria — Integration Tests (`pathfinder-panel.test.js`)

For each of the six new ops, one end-to-end case:

1. Boot a `MockApp` with engine, two overlapping shape layers selected.
2. Find the corresponding `.pf-btn[data-pf-op="<op>"]` in the DOM.
3. Assert `btn.disabled === false`, click it.
4. Assert: `app.pushHistory` called exactly once; `engine.computeAllDisplayGeometry` called; `app.render` called; `app.ui.renderLayers` called.
5. Assert the resulting layer-count delta matches the op's spec (e.g., Minus Back: −1, Trim with two overlapping: 0 net (−2 sources + 2 outputs + 1 group container = +1, then we account for sources removed)).
6. Click Undo (call `app.undo()` if available, else replay snapshot) → original `engine.layers` restored.

Additional panel tests:
- `Pathfinder` global-section collapses on header click, persists to `SETTINGS.uiSections.pathfinder`, restores on reinit.
- Single compound selected → all 6 Pathfinder buttons disabled with the "Expand the compound shape first" hint.
- Single layer selected → all 6 Pathfinder buttons disabled with their per-op hint.
- Mode toggle to `shape-only` with an open-path layer in the selection → eligibility shrinks; hint reflects the count delta.

## 7. Documentation Impact

Per the project's documentation contract:

| File | Update |
|---|---|
| `README.md` | Add the six Pathfinder ops to the feature-group list ("Layers & Modifiers" group, expandable detail panel). |
| `CHANGELOG.md` | New entry: "Pathfinder: full Illustrator parity — Divide / Trim / Merge / Crop / Outline / Minus Back; Pathfinder panel collapsible." |
| `plans.md` | Mark Pathfinder feature complete. |
| `docs/agentic-harness-strategy.md` | No update needed unless test matrix changes (it doesn't). |
| In-app help guide (`src/ui/help-content.js` or similar) | Add a "Pathfinder" subsection mirroring the Align subsection style. |
| In-app shortcut list | No additions (no new shortcuts). |
| Version | Bump patch in `package.json`; run `npm run version:sync`. |
| `docs/pre-release-hardening-log.md` | Log: "PRH-NNN: Pathfinder Options dialog (precision, redundant-points, drop-unpainted) deferred; current defaults baked in." |

## 8. Decisions Made vs Deferred

**Decisions made (v1, opinionated):**
1. Pathfinder-row ops are **destructive only**. No "live compound" variant. Live shapes remain a Shape-Modes-only feature, preserving the existing mental model where the four Shape Modes are the non-destructive primitives.
2. Output groupings use `groupType: 'pathfinder'` (a new groupType value), distinct from `'compound'`. The existing layers-panel rendering for generic groups handles display; no new UI affordance needed.
3. **Strokes preserved on Divide** (matching Illustrator), **stripped on Trim/Merge/Crop**. Outline replaces strokes with new stroke = source fill color, **but keeps source `strokeWidth`** (line-art divergence — 0pt strokes are meaningless for a plotter).
4. **Divide cap at n = 8 layers** to prevent 2^n explosion. Above the cap, show a hint and no-op. 8 covers ~99% of real selections.
5. Single collapsible `Pathfinder` section (not nested sub-sections per row). Illustrator presents both rows in one panel; sub-collapsing would add UX cost without benefit.
6. Front-shape-must-be-closed enforcement for Crop and Minus Back in shape-only mode. Silhouette mode falls back to bounding rect (per existing `geometryFor`), which is consistent with how Shape Modes already treat ineligible silhouettes.
7. Empty results are no-ops with a transient hint and no history entry, rather than creating an empty group.
8. Pathfinder ops operate on the lifted compound (compounds count as one input via `liftToCompoundAncestor`, same as Shape Modes already do). They don't unwrap the compound's children.
9. Outline icon redesigned (existing one collides visually with Divide).

**Deferred to a later iteration:**
- Pathfinder Options dialog (precision, "remove redundant points", "drop unpainted artwork"). Current implicit defaults: FillBoolean's internal precision, no redundant-point removal, all-fragments-kept.
- Trap (print pre-press) op.
- Alt-click "live Pathfinder" semantics.
- `Release Compound Shape` panel-menu equivalent (the existing Expand button covers most workflows).
- Keyboard shortcuts (none in Illustrator either; users can add custom in a later iteration).
- Live compound containment of grouped Pathfinder outputs (i.e., re-edit a Trim result by changing a source). Out of scope.
- Per-result selection of "what counts as fill identity" for Merge (currently `penId || color`; could add a UI for "merge by stroke color" later).
