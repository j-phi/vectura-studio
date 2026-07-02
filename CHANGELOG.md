# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally human-curated with an `Unreleased` section that collects work before release.

## 1.2.30 - 2026-07-02

### Changed
- **Built-in bold is now a banded concentric snake fill — no more crossing passes.** Heavier built-in Vectura
  weights (and `outlineThickness > 1` on the built-in face) no longer draw N independent parallel offset copies
  of every stroke — the model that crossed doubled-ink lattices at junctions (a t crossbar, the e bar/bowl) and
  splayed uncapped terminals. Each glyph's strokes are now swept into **one boolean band** of total width
  `thickness · penW` (`GeometryUtils.strokeRingsToBand` — junctions weld, terminals get round caps), the band is
  filled with **concentric erosion passes** (`GeometryUtils.insetMultiPolygon`, true morphological erosion:
  subtract a Minkowski band swept along the boundary — robust where inward miter offsets self-cross), and the
  rings are stitched into a **continuous snaking pen path** (`GeometryUtils.stitchConcentricRings`, segment-
  projection grafts). A final skeleton pass runs the medial spine whenever the deepest reliable ring leaves it
  uncovered. Zero pass crossings, gapless coverage at the physical pen width, and the drawn ink edge lands
  exactly on the intended letterform boundary. Per-glyph results are memoized (translation-normalized), so
  repeated letters and every re-render while typing are effectively free; sinusoidal/snake thickening styles and
  headless (no polygon-clipping) environments keep the legacy parallel-pass engine. The band is swept along the
  same bezierized contour 1.2.28 renders (curve strokes are Catmull-Rom-flattened before banding), so heavy
  weights read as smooth as Regular.
- **New `inkOverlap` text parameter (0–60 %, default 15).** Concentric pass spacing is tied to the pen:
  `penW · (1 − inkOverlap)`. 0 % means passes just touch (fastest, least ink); higher values overdraw for denser
  ink coverage. Exposed as an **Ink Overlap** scrub in the Text panel's Stroke tab (built-in face, Parallel mode)
  and in the generic algorithm controls.

### Fixed
- **polygon-clipping robustness.** `strokeRingsToBand` gains `diskPhase` (rotates join-disk sampling off
  degenerate quad-corner alignments that crashed the vendor sweep line) and `joinSkipAngle` (skips join disks at
  near-collinear vertices — sub-micron notch, order-of-magnitude fewer union polygons); `insetMultiPolygon`
  snaps coordinates to a 1 µm grid and retries with a sub-percent inset nudge, which eliminated observed
  multi-second sweep-line pathologies. All defaults preserve historical output byte-for-byte.

## 1.2.29 - 2026-07-02

### Fixed
- **Text specimen keeps real glyphs while editing.** Clicking the panel specimen to edit no longer swaps the
  traced Vectura geometry for the CSS stand-in font — the trace stays drawn from the live editable text while
  the transparent field owns the caret.

## 1.2.28 - 2026-07-02

### Changed
- **Built-in Vectura curves render as native béziers (kill facets).** The stroke font's bowls/arcs/splines are
  dense sampled polylines that previously drew as straight chords (visible facets at large sizes). Curve-built
  strokes are now tagged (`meta.curve`) in `stroke-font.js` and always bezierized in `text.js` at Catmull-Rom
  tension 1 — the sampler's own tension, so the cubics reproduce the designed contour exactly. Straight stems,
  serifs and diagonals stay faithful sharp polylines.

## 1.2.27 - 2026-07-02

### Added
- **Web-font on-canvas editing.** Point and Area type using web (Google Fonts) faces are now editable directly
  on the canvas (caret, selection, insert, delete) with exact `sourceIndex` mapping, matching the built-in face.

## 1.2.26 - 2026-07-01

### Changed
- **Built-in monoline weights are now optically metered.** Heavier built-in Vectura weights draw as extra
  parallel pen passes; a single pure source (`StrokeFont.weightMetrics(passes, capMM, penW)`) now governs both
  their **advance** and their **thickness** so stems no longer merge and counters no longer clog:
  - **F-03 — advance widening.** Heavier weights widen the per-glyph advance (`extraTrackingMM = passes · penW · 0.6`)
    so the sideways ink spread of the extra passes doesn't run adjacent stems together. Web faces carry real
    weighted outlines and keep their plain tracking.
  - **F-04 — optical thickness clamp.** The pen-pass contribution is clamped by optical cap size
    (`clampedThickness = min(1 + passes, ⌊cap · xHeightFrac / (2·penW)⌋)`), so small text keeps open counters
    while large caps still get the full weight. Any user `outlineThickness > 1` is preserved additively.

### Fixed
- **Text fill angle now matches the dial.** The Fill Angle dial (0° up, clockwise-positive) previously drew
  hatch lines *perpendicular* to the needle because the shared pattern-fill engine measures its angle from the
  +x axis — a "/" pick rendered "\". Both the canvas fill (`text.js`) and the SVG panel specimen
  (`ui-text-specimen.js`) now apply a −90° remap so the hatch runs parallel to what the dial shows.
- **Coarse-contour fill winding epsilon.** `google-fonts.js` layout now exposes its `flattenTol`, so glyphs that
  fall back to coarse (non-bézier) contours size their winding-canonicalization epsilon in display units
  correctly instead of using a fixed guess.

## 1.2.25 - 2026-07-01

### Added
- **Point ↔ Area type conversion widget.** A conversion dot at the right-middle of a selected text layer's
  bounding box toggles the mode with a single click — a **hollow ring** for point type, a **filled dot** for
  area type. `point→area` frames the layer at its current natural extent (text stays put, now wrapping);
  `area→point` unwraps. One pre-change history snapshot per toggle; the layer stays selected throughout
  (`TextEditController.convertTextMode`, `Renderer.drawTextModeWidget` / `_hitTextModeWidget`).

## 1.2.24 - 2026-07-01

### Added
- **Area Type frame resize-reflow + overset indicator.** Dragging a corner handle on an area text layer now
  resizes its **frame** (`params.frameWidth`/`frameHeight`) and re-wraps the text live at constant point size
  instead of scaling the glyphs (point-type layers keep normal scaling). Undo restores the prior frame via a
  single first-move snapshot with the release commit suppressed. When laid text overflows the frame, the
  renderer draws Illustrator's red "+" out-port at the frame's bottom-right (transient `textOverset` flag,
  never serialized). Overflow threading to a linked frame stays deferred.

## 1.2.23 - 2026-07-01

### Added
- **Area Type — click-drag frame with word-wrap (on-canvas Type tool).** With the Type tool, a plain click
  still creates point type; a **click-drag** now creates an Area Type frame the size of the drag (live W/H
  readout) and text typed into it word-wraps at the frame width at constant point size. Additive layer model
  (`textMode` `'point'|'area'`, `frameWidth`/`frameHeight` in mm) round-trips through serialization. A new
  `areaWrap()` word-wrapper (`stroke-font.js`) returns per-line raw-string offsets so `sourceIndex` stays exact
  across wrap boundaries — wrapped area text is fully editable (caret/selection/insert/delete). Built-in stroke
  font area text is mutable; web-font area editing stays deferred (ligature `sourceIndex` degrades).

## 1.2.22 - 2026-06-30

### Changed
- **New built-in typeface — Vectura "architect's draft".** The single-stroke font (`stroke-font.js`) was
  redrawn from scratch as an original geometric monoline alphabet: tall x-height, open apertures, and **true
  curves** — round bowls are sampled circular arcs and the S-curve / humanist letters (S, a, e, s, g, 2, 3,
  5, 6, 9, &, ?, parens…) are built from a Catmull-Rom spline helper rather than the old faceted polylines.
  It stays a one-pen-pass plotter-native skeleton (no fills, no doubled outlines) and keeps the same metrics
  and layout/serialization contract, so existing `.vectura` files are unchanged.
- **The Text specimen now shows the REAL font.** For built-in faces the panel specimen used to substitute the
  UI sans (Space Grotesk), so it never matched what was plotted. It now traces the actual `StrokeFont`
  geometry into the stage — fit-to-frame and centred exactly like the canvas — so the preview and the
  rendered/plotted output use the same letterforms and align (`ui-text-specimen.js`).
- **Vectura is one font, with Styles + Weights.** The five slant/width variants are no longer separate fonts
  in the picker — it now lists a single **Vectura** family, and Italic / Condensed / Wide / Backslant move
  into a **Style** select. A separate **Weight** select (Regular / Medium / Semibold / Bold) finally works for
  the built-in monoline font: heavier weights **wrap extra parallel pen passes around every stroke**
  (`StrokeFont.weightPasses` → `text.js` → `GeometryUtils.thickenPaths`), so **Bold** genuinely fattens each
  letter on the plot and the specimen preview thickens to match. `p.font` (style id) and `p.fontWeight`
  serialization are unchanged — only the panel presentation and the built-in weight behaviour changed.
- **Text decoration controls overhauled.** Strikethrough now rides each typeface's **optical midpoint**
  (the centre of the x-height, computed per face from its metrics) instead of a fixed fraction that sat too
  low — both `stroke-font.js` and `google-fonts.js` now expose an `xHeightFrac` the algorithm reads. The Type
  tab gains reveal panels (shown only while the decoration is selected). Underline **and** strikethrough each
  now offer a position offset (**Strike Height** / **Underline Position**), a pen **Weight**, a **Thicken
  Mode** (Parallel / Sinusoidal / Snake offset passes, or a **Hatch** / **Cross-Hatch** ribbon), and a
  **Line Style** (Solid / Dashed / Dotted / Dash-Dot / Long Dash / Dense Dots, via `meta.strokeDash` like
  other algorithms). Underline additionally has a **Descender Breaks** toggle + **Break Padding** slider —
  leaving a padded gap in the rule wherever a glyph's tail (g, j, p, q, y…) dips through it.
- **Descender break gap is symmetric.** The gap is centred on each glyph's actual below-underline ink
  (computed crossing-aware, following where the tail meets the rule) with equal padding on both sides —
  previously it straddled the glyph advance cell, so left-leaning tails like *y* sat off-centre in the gap.
- **Mutually-exclusive character styles.** All Caps ↔ Small Caps and Superscript ↔ Subscript can no longer
  both be active — turning one on clears its partner in the panel, and the algorithm guards the same pairing
  for legacy/serialized files.
- **Clearer style-button icons.** The Small Caps icon is now a small capital seated on the baseline (was a
  hovering lowercase *r*), and Superscript / Subscript read as **x²** / **x₂**.
- **Default Text is sentence-cased** — the Text layer now starts as `Vectura` rather than `VECTURA`.

All new params land as additive `ALGO_DEFAULTS.text` defaults, so existing `.vectura` files, undo/redo, and
serialization are unchanged (every decoration is off / zero-offset by default).

### Changed
- **Default plot order is now reading-order ("as drawn").** The Line Sort optimization step defaulted to
  `method: 'nearest'` with `vertical` banding, which grouped strokes into height bands and swept top-to-bottom
  — so a horizontal word (e.g. "Vectura") plotted in a jumpy order that hopped between letters instead of
  reading left-to-right. It now defaults to `method: 'asdrawn'`, preserving each algorithm's authored
  generation order (reading order for text). Travel-optimizing sorts (`nearest` / `greedy`, with horizontal /
  vertical / radial banding) remain one selection away in the export **Line Sort** card (`src/config/defaults.js`).

### Fixed
- **Export SVG "Line Sort Print Order" gear no longer opens an empty settings pane.** With a Text layer active
  — and especially when a Text layer was the only layer in the document — `buildControls()` returned early
  through the bespoke Text-panel path before it reached the code that renders the export optimization panel, so
  the Export modal's settings pane came up blank (the "promote a non-text fallback layer" recovery had nothing
  to promote to). The optimization-panel render is now hoisted above the layer-type early returns and fires on
  every early-return path while the modal is open, so the panel populates for Text / group / modifier /
  multi-selection / paint-tool states too (`src/ui/panels/algo-config-panel.js`).

## 1.2.21 - 2026-06-30

### Added
- **Bespoke Text panel (synthesis design).** The Text layer now has a dedicated tabbed panel
  (Type / Layout / Stroke / Fill) with a live, opentype-traced **specimen** preview that doubles as the
  editable text field — there is no separate text input. It mounts via the same early-return hook the
  Mirror/Morph modifier panels use (`algo-config-panel.js` → `Vectura.UI.TextPanel.build`), is fully
  `vtp-`-namespaced against existing skin tokens (renders correctly on every skin), and drives each control
  through the standard history/regen commit path (one undo step per scrub gesture). New modules:
  `src/ui/ui-text-panel.js` (shell, tabs, scrub fields, font-picker popover backed by the real Google Fonts
  catalog, idempotent lifecycle) and `src/ui/ui-text-specimen.js` (guide / outline-node / fill-line overlays).
- **New typographic controls for the Text algorithm.** Vertical/horizontal scale, manual kerning, baseline
  shift, per-character rotation, all-caps plus synthesized small-caps / superscript / subscript, underline &
  strikethrough, left/right/first-line indents, paragraph space-before/after, paragraph justification
  (`justify-left|center|right|all`), font weight (Regular/Medium/Semibold/Bold), and fill **inset** + fill
  **offset** placement. All land as additive `ALGO_DEFAULTS.text` params, so existing `.vectura` files,
  undo/redo, and serialization are unchanged. The font layout engines (`google-fonts.js`, `stroke-font.js`)
  now accept these as optional opts and return an index-aligned glyph `meta` array consumed by `text.js`.

### Known limitations
- **OpenType features** (contextual alternates, discretionary ligatures, swash, stylistic sets, fractions,
  oldstyle/tabular figures, super/sub position) are surfaced in the panel and plumbed through the layout
  engine, but the vendored `opentype.min.js` only actually shapes **standard ligatures** (`liga`) for Latin
  text — the others are accepted and currently inert until a richer shaper is vendored.
- **Hyphenation** has a dependency-free soft-wrap implementation, but it only engages when a wrap width is
  supplied; the current fit-to-frame layout does not provide one, so the toggle is presently a no-op.

## 1.2.20 - 2026-06-26

### Added
- **Bezier smoothing for Contour fills (Type).** Contour rings are extracted from a grid distance
  field, so they carried sub-cell *stairsteps* that were visible on every plotted letter. The Fill panel
  now has a **Bezier Curves** toggle plus a **Smoothness** slider (alongside the contour controls): when
  on, each ring is decimated to grid scale and rebuilt as a native cubic curve, so the pen draws a clean
  line instead of jaggies. Handles stay short relative to the ring spacing, so a smoothed ring can't bulge
  across into a counter. Both the new fill **Bezier Curves** and the outline **Bezier Curves** now default
  **on** for the smoothest letterforms out of the box. The toggle is shared by the paint-bucket contour
  fill too (defaults off there, so existing fills are unchanged).

## 1.2.19 - 2026-06-26

### Fixed
- **Prism no longer shows gaps in Faces → Front.** The prism's side quads were hand-wound clockwise as
  seen from outside, so their face normals pointed at the axis (inward). With *Faces → Front* selected,
  the front/back test was inverted: the camera-facing sides were culled and the far sides drawn in their
  place, leaving holes in the solid. The side faces now run through the same `orientFace` pass the rest
  of the solids use, which re-winds every face outward (a no-op for the antiprism, whose band was already
  correct). Caps and all other solids are unchanged.

## 1.2.18 - 2026-06-26

### Fixed
- **Outset Contour fill is now clean too.** v1.2.16 moved the *inset* contour onto the distance-field
  engine but left **outset** on the old `insetPolygon` offsetting, which tangled into self-intersecting
  halo rings that collided between letters. Outset now traces iso-contours of the *outside* distance
  field — clean rings that expand outward and merge smoothly around the silhouette, bounded so they
  don't flood the canvas. Both contour directions now share the one robust engine; the dead
  `insetPolygon`-based contour path is removed entirely.

## 1.2.17 - 2026-06-25

### Added
- **Polyhedron sweep family — Cone, Frustum, Cupola, and Star Prism.** Four new solids that ride the
  existing `sideCount`/`depth` axis, extending the profile-and-sweep idea already behind Flat Polygon /
  Prism / Antiprism / Bipyramid. **Cone** is a faceted pyramid (an n-gon base to a single apex);
  **Frustum** a truncated pyramid with a new **Taper** control (top width %, 1 % approaches a cone,
  100 % a prism); **Cupola** lifts a 2n-gon base to an n-gon top through an alternating triangle/quad
  band (also Taper-driven); **Star Prism** extrudes a star-polygon profile with a new **Star Inset**
  control (inner-radius %). All four are watertight and outward-wound, and Taper/Star Inset only appear
  for the solids that use them.

### Fixed
- **Concave faces now get a correct surface normal.** `faceNormal` computed the normal from a single
  cross product of the first three vertices, which is wrong for concave polygons (the Star Prism caps),
  where those three samples wind opposite to the polygon and flip the normal inward — culling the
  star's front-facing cap and mis-shading it. It now uses **Newell's method** (the true area-weighted
  normal). Convex and triangular faces are unaffected (Newell points the same way there and every
  consumer normalizes), so all existing solids and the 3D algorithms that share the helper render
  byte-for-byte identically.

## 1.2.16 - 2026-06-25

### Fixed
- **Contour fill is now clean on every typeface and density.** The contour rings were generated by
  naive polygon offsetting (`insetPolygon` — push each vertex along its angle bisector), which
  self-intersects into chaotic, tangled geometry as soon as a glyph pinches off or its stroke width
  varies — a dense scribbled mess on script/display faces, and uneven coverage elsewhere. Contour
  (inset) now traces **iso-contours of the distance-to-boundary field** (a chamfer distance transform
  + marching squares), which is robust for any shape: rings follow pinch-offs, split into separate
  loops where a shape narrows, never self-cross, and fill every letter evenly. Ring spacing is now
  calibrated to the thickest ink so thin strokes still get several rings, and the path count is bounded
  by the grid instead of exploding at high density. The grid honours the active fill rule, so counters
  and connected-script overlaps stay correct. Outset contour is unchanged. Verified on uniform (Oswald),
  high-contrast (Playfair), and connected-script (Lobster, Pacifico) faces across densities.

## 1.2.15 - 2026-06-25

### Fixed
- **Contour fill now fills every letter, not just the ones with counters.** On a word like "VECTURA"
  the counter-less letters (V, E, C, T, U) came out nearly blank while R/A were dense — the solid
  contour step was sized to the whole letter (`√(area/π)/density`), which is far coarser than a glyph
  stroke is wide, so the first inset overshot the stroke centreline and it collapsed after a single
  ring. The solid step is now capped to the stroke thickness whenever the density step would yield
  fewer than ~2 rings, so thin strokes carry several concentric rings; thicker shapes (and every
  non-glyph contour fill) keep the density-driven spacing unchanged. Verified on uniform (Oswald,
  Roboto) and high-contrast (Playfair) faces — every letter fills.
- **Type fills are now watertight on connected-script faces too (Pacifico, Dancing Script, Great
  Vibes, …).** v1.2.14 made every fill counter-tight for typefaces whose glyph contours don't
  overlap; on connected scripts, where adjacent letter *outers* physically overlap, the even-odd
  rule read the stroke join as a hole and the depth classifier mis-read an overlapped outer as a
  counter — so per-shell fills bled into letter counters. Text now fills with the **nonzero
  winding** rule (which is what glyph outlines are authored for): overlapping same-wound outers
  union while opposite-wound counters still carve, and shells are classified by "is the band just
  inside this loop ink" (immune to the overlap miscount). The rule is gated to text via a
  `windingRule` flag, and for non-overlapping glyphs nonzero is mathematically identical to
  even-odd — so every other typeface, every other fill consumer (paint bucket, pattern designer,
  …), and the whole even-odd test suite are byte-for-byte unchanged. Verified across 11 typefaces
  (5 connected scripts) × 15 fills × 4 words × 3 densities = 1,980 combinations with **zero**
  counter bleed; closes PRH-012. (Remaining halftone/maze coverage gaps at extreme density are the
  separate PRH-013.)

## 1.2.14 - 2026-06-21

### Fixed
- **Type fills are now watertight and consistent across every fill type.** Text fills feed every
  glyph contour — outer shells *and* counter holes (the gaps in R, A, O, B, 8, …) — into the
  shared pattern-fill engine's composite branch. A dozen fills (dots/stipple/grid, contour,
  scribble, halftone, voronoi, truchet, maze, lsystem, spirograph, weave, flowfield) iterated
  per-loop and treated **every** loop, including counters, as solid — so dots filled the R/A
  counters, contour rendered only the first letter, and scribble left whole non-convex letters
  empty. All composite fills now route through one even-odd region-topology layer
  (`classifyRegionTopology`) and a single ink invariant, matching the hatch/wave reference:
  counters are always carved, every disjoint glyph is filled, and all fills agree on the same
  ink set. Contour additionally offsets counters outward (not just the outer inward) and caps its
  step to the wall thickness, so hairline bowls on high-contrast and script faces (Playfair,
  Lobster) render instead of clipping to nothing. Scribble/per-shell fills now clip against a
  parity-consistent **group-coherent** set, fixing a leak where a neighbour glyph's counter was
  dropped from the clip. Verified across 8 typefaces × 15 fills × 4 words × 3 densities (counter
  bleed = 0, empty shells = 0) plus a 47-case watertightness regression suite. Known edge cases
  logged as PRH-012/PRH-013.

## 1.2.13 - 2026-06-21

### Changed
- **Draw Order slider polish.** The progress bar now paints the full start→end print-order
  gradient across the *entire* track width and the fill simply **reveals** the left portion of
  it (an opaque track-coloured cap covers the unfilled right), so the colours map to absolute
  plot position instead of squeezing the whole gradient into the filled width. The slider thumb's
  halo (ring + glow) is now **tinted with the gradient colour sampled at the handle's current
  stop**, recolouring live as it drags. The retired native runnable-track line that bisected the
  bar is suppressed, and the `Start … distance | lines | time … End` readout is consolidated onto
  a single, slightly smaller row.

## 1.2.12 - 2026-06-21

### Changed
- **Draw Order panel — Start/End anchors and the plot estimate now share one row.** The
  `Start … End` gradient labels and the `distance | lines | time` readout collapsed into a single
  `.draw-order-meta` flex row (`Start … dist | lines | time … End`), so the Start/End anchors frame
  the plot estimate on one line instead of stacking into two. Labels dropped to 8px to fit, and the
  global 2px runnable-track line is suppressed on the draw-order slider (`::-webkit-slider-runnable-track`
  / `::-moz-range-track` → transparent) so only the print-order gradient shows, with no blue-grey bar
  bisecting the track.
- **Line-sort colour controls relocated into the Draw Order panel** (carried from 1.2.11, previously
  undocumented). The on-canvas colour legend was retired; its colour-configuration window now opens
  from the palette button in the Draw Order panel, with the original element IDs preserved so the
  wiring holds.

## 1.2.10 - 2026-06-21

### Changed
- **Raster-Plane base noise "Field Weight" now dials up real relief.** The Image (Base) layer's
  Field Weight used to contrast-stretch the `[0,1]` heightfield, which saturated the surface to a
  flat-topped binary mask once pushed past ~2. It now scales the **3D relief amplitude** directly
  (folded into `surfaceSample`/`surfaceNormal` via `baseReliefWeight`), so turning it up genuinely
  raises the relief while preserving the height gradient — and its range widened from `-2..4` to
  `-10..25` so you can crank it. Because the amplitude is now a 3D scale (like the top-level
  *Amplitude* control), it no longer reshapes the 2D source/height preview.
- **Raster-Plane Bars default to See-Through OFF.** Switching the Mode to *Bars* now seeds
  See-Through OFF so the boxes read as a watertight solid relief instead of drawing every hidden
  back edge (mirrors the Lines-as-Planes relief cascade). Other modes are untouched.

## 1.2.9 - 2026-06-21

### Added
- **Text typography overhaul — the Font experience is now first-class.** A pass over the Text algorithm
  brings its stroke and fill controls up to parity with the rest of the app:
  - **Google Fonts is the default, offline.** The default Text layer now ships on a vendored **Inter**
    face (`src/vendor/inter-400.ttf`, OFL-1.1) registered at boot, so a real web typeface renders with no
    network. Headless/offline environments fall back to the built-in `sans` stroke font, so presets and
    visual baselines stay byte-identical.
  - **In-font previews + better search.** The Google Fonts list renders each family's name in its own
    typeface (lazily, as rows scroll into view); the Built-in tab renders a tiny inline stroke sample of
    each face. Search now works on both tabs and the result ceiling was raised from 240 to 1000.
  - **Bezier outlines (opt-in) with a Smoothness control.** A new *Bezier Curves* toggle emits a web
    font's native cubic curves — `C` commands in the exported SVG, with handles nudged toward
    0/90/180/270° at extrema — instead of flattened polylines. A *Smoothness* slider controls how finely
    curved outlines are sampled when flattened. Both default off / neutral, so existing output is
    unchanged. (Built-in stroke faces are monoline and unaffected.)
  - **Stroke emphasis.** New *Outline Weight* (1–6) and *Thickening Mode* (Parallel / Sinusoidal / Snake)
    controls thicken the glyph outline via parallel offset passes — the same engine Harmonograph and
    Rainfall use, now extracted to the shared `GeometryUtils.thickenPaths`. *Stroke Outline* can be turned
    off entirely for fill-only typography.
  - **Pattern fills on glyph interiors.** A new *Enable Fill* toggle plus the full shared fill control
    group (every fill type — hatch, crosshatch, dots, contour, spiral, voronoi, maze, weave, …, with their
    spacing/angle/per-type parameters) fills letter interiors. Holes in O, A, e, B are carved out
    automatically by the engine's even-odd region rule. Web outline faces only.
  - **Left-to-right plot order.** A new *Plot Order* control (default *Left → Right*) sorts the output so
    the pen advances across the line with minimal travel; *Natural* keeps layout/fill order. The default
    is a stable sort, so already-ordered single-line text stays byte-identical.

### Fixed
- **No more built-in-font flash when switching web fonts.** Selecting a Google family that wasn't parsed
  yet briefly rendered the built-in `sans` stroke placeholder before swapping to the real outlines. The
  canvas regen is now deferred until the outline lands, so the layer goes straight from the previously
  displayed font to the new one. Parsed/built-in faces still swap immediately.

## 1.2.8 - 2026-06-21

### Added
- **The Text algorithm can now use any Google Font, not just the five built-in stroke faces.** The Font
  control became a two-tab picker: *Built-in* still lists the single-stroke faces (Vectura Sans, Italic,
  Condensed, Wide, Backslant), and a new *Google Fonts* tab exposes the full public web-font catalog
  (~2000 families) with a search box. Pick a family and the algorithm traces its glyph **outlines** into
  pen-ready polylines — an outline face draws as its contours (two passes per stroke), which the fill and
  optimization systems then handle like any other geometry. Selection is stored as `google:<slug>` so it
  round-trips through `.vectura` files. Loading is fully lazy and degrades silently offline: the catalog
  is fetched once (and cached locally) the first time the Google tab is opened, each family's outlines are
  fetched + parsed on first use, and while a family is still loading the layer renders with the built-in
  stroke font and swaps to the real letterforms the moment its outlines arrive (the same way picture
  layers decode). The default Text layer is unchanged — it still ships on the built-in `sans` face, so
  existing presets and baselines are byte-identical.

## 1.2.7 - 2026-06-21

### Added
- **The line-sort overlay order now has an eye toggle on the Draw Order subpanel.** A new eye button
  sits to the left of the Draw Order gear and shows/hides the plot-order overlay (both the gradient
  colouring of the lines and its on-canvas legend). The overlay now rides its own dedicated flag that is
  closed by default and not persisted, so it stays off on every load and only opens when you click the
  eye — the export modal / optimization-preview state can no longer turn it on behind your back. The eye
  is closed and grey when off; when on it becomes an open outline drawn with the overlay's start→end
  print-order gradient, and those colours update live when you change the overlay colour in settings.
  The on-canvas legend also gained a settings gear (matching the export menu's legend) that opens an
  inline Start Color / End Color / Line Thickness dialogue right on the legend — editing the live canvas
  overlay (a new `optimizationOverlaySecondaryColor` drives the end/print-order colour, '' = auto).
- **Raster-Plane Bars gained Bar Sides and Bar Rotate controls.** Bar Sides (3–8, default 4)
  changes how many sides each bar's footprint polygon has. The tileable counts interlock with no
  gaps — 3 = triangles, 4 = squares, 6 = hexagons — while the other counts (5, 7, 8) draw as
  regular polygons inscribed in each cell. Bar Rotate (−180…180°, default 0) spins each footprint
  polygon about its own center, letting you orient the shapes and open or close the interlock. The
  default 4-sided square footprint is unchanged from before.
- **Raster-Plane Bars gained a Corner Radius control.** Corner Radius (0–100%, default 0) fillets the
  corners of each bar's footprint polygon — squares become rounded-rectangle columns, hexagons become
  rounded hexagonal columns, and at 100% a square rounds all the way to a near-circle. It rounds in
  every render path (See-Through ON wireframe and the See-Through OFF solid hidden-line removal); at 0
  the sharp-cornered output is byte-identical to before.

### Fixed
- **Lines as Planes (See-Through OFF) no longer leaves a fringe of tiny segments along the left/right
  silhouette.** Each relief curtain was drawn as a closed top→floor→top loop; at the silhouette every
  curtain's edge pokes ~one occlusion column past the row in front of it and, with its middle hidden,
  survived only as a stray detached tip — a staircase of ticks down both edges. Curtains now draw their
  top ridgeline plus (for the frontmost row) the front-bottom contour, with all interior floor contours
  kept as occluder-only geometry (new `draw:false` row flag in `occludeRowsFloatingHorizon`). The opaque
  band — and therefore back-row hiding — is identical, but the side risers and floor-end tips are no
  longer drawn, so the fringe is gone.
- **Solid bars (See-Through OFF) now draw a bottom contact line where each wall meets the surface.**
  Previously the vertical sides of a bar that dropped to the surface vanished into the plane with no
  edge connecting the wall to the base; the wall now closes with a bottom contact edge so the relief
  reads as a solid sitting on the surface. The `raster-plane-bars-solid` visual baseline was
  regenerated since the solid render now includes these contact edges.
- **Polygonal bars (any non-square Bar Sides / any Bar Rotate) are now watertight.** The new prism
  render path wound its side walls the opposite way from the legacy square path, which inverted each
  wall's face normal — so the solid render drew (and occluded with) the BACK walls instead of the
  front ones. Front faces vanished, the bottom contact lines went missing, and you could see straight
  through hexagon/pentagon/triangle columns to the geometry behind them. Walls are now wound to match
  the legacy outward-normal convention, so the camera-facing faces draw and occlude correctly for every
  side count. Covered by a winding/occlusion regression test.
- **The base outline now frames non-square bars on all four sides.** Polygonal lattices over/under-hang
  the artwork rectangle, so a hexagon/pentagon/triangle relief used to spill past the base outline (or
  float inside it). The base rim is now grown to the footprint bounding box, so the outermost sides and
  corners touch it on every side — a clean frame from above. Square bars are unchanged (they tile the
  artwork rect exactly). Covered by a base-framing regression test.

## 1.2.6 - 2026-06-20

### Changed
- **Raster-Plane "Lines as Planes" now seeds a Base Height of 1 (was 0.33) and the Base Height slider
  ranges up to 10 (was 1).** Enabling Lines as Planes gives a more pronounced curtain lift by default, and
  the slider allows much taller relief.

### Fixed
- **Fill Density now reads higher = denser, everywhere.** The shared fill engine previously fed the slider
  value straight in as line/dot *spacing*, so for most fills (hatch, crosshatch, wave, dots, stipple, grid,
  meander, polygonal, scribble) a higher value made the fill *sparser* — the opposite of the label and of
  how spiral/contour/radial already behaved. The value is now inverted once, centrally, for the spacing-based
  fills (count-driven fills are untouched). The reference is chosen so the default density (4) still maps to
  4 mm spacing, leaving default fills unchanged; non-default spacing-fill presets/saved layers flip direction.

### Added
- **Dotscreen: parametric dot shapes, a directional Rotation ramp, and an interior Fill.** The fixed
  shape zoo is replaced by a compact, parametric set, and the dot controls are reorganised into Screen /
  Rotation / Fill sections.
  - **Parametric shapes.** Dot Shape is now **Circle, Polygon, Star, Gear, Flower, Cross, Heart**. The
    Polygon takes a **Sides** count (3–24, so it covers triangle / square / diamond / pentagon / hexagon /
    octagon / …), the Star a **Points** count (replacing the separate burst), the Gear a **Cogs** count,
    and the Flower a **Petals** count — each shown only for its shape. Polygons use an area-preserving
    circumradius so visual mass stays constant across side counts. Legacy shape ids in older `.vectura`
    files and presets (square, diamond, triangle, …, burst) are transparently remapped.
  - **Rotation.** A base **Rotation** plus a spatial **Offset** that ramps the per-dot angle across the
    screen along a 360° **Offset Direction** dial, by an **Offset Amount** (°), following an **Offset
    Curve** (linear / ease-in / ease-out / ease-in-out / exponential). Plus **Aspect** (area-preserving
    squash) and **Jitter**. Dot size is owned entirely by Max/Min Dot + tone — there is no separate size
    control (it would only duplicate those).
  - **Fill.** The universal Fill library (hatch / crosshatch / spiral / radial / dots / wave) now patterns
    the interior of each open-outline dot, mirroring the Spiralizer marker-fill bridge. Sub-mm dots are
    skipped (which bounds the cost on fine screens); Smart-Edges only unions the dot outlines.
  - At their defaults the classic circle screen is bit-for-bit unchanged; ramps and jitter use a spatial
    hash so output stays deterministic and dots don't reshuffle as White Cutoff changes.

## 1.2.5 - 2026-06-20

### Fixed
- **Raster-Plane Bars now render as a clean solid heightmap relief (See-Through OFF).** Previously the
  bars drew as hollow wireframe boxes — you could see straight through every bar, internal walls between
  touching bars showed, and edges fragmented. The render is now a true isometric solid with analytic
  hidden-line removal:
  - a cell contributes a **top edge only where its neighbour is shorter** (a real step), so touching
    equal-height cells merge with no interior grid and no internal wall, plus the **exposed riser** of
    each camera-facing step;
  - every edge is then **clipped against the opaque faces of the bars in front of it** (painter's
    algorithm, nearest-first, with per-vertex depth interpolated across each face), so hidden segments
    are removed — no see-through, no floating verticals, no fragments, at any camera angle.

  The output is pure plotter-ready vector segments (no fills). See-Through ON is unchanged (transparent
  wireframe). A smooth height source renders as clean terraces; busy/high-frequency sources naturally
  produce more steps (raise Map Blur or use a smoother source for a calmer relief).

## 1.2.2 - 2026-06-20

### Added
- **Text algorithm.** A new 2D layer that sets a string in a built-in single-line (monoline) stroke
  font and fits it to the document frame as pen-ready vector line art — no fills, no doubled outlines.
  Supports multi-line text, left/center/right alignment, letter spacing, line height, frame-fit or
  absolute (mm) sizing, manual offset, and an optional seed-stable hand-drawn jitter. The font covers
  the printable ASCII set (upper/lowercase, digits, punctuation) and ships in
  `src/core/algorithms/stroke-font.js`. A new free-text panel control (`text` / `textarea`) backs it.
- **Dotscreen (halftone) algorithm.** Screens an uploaded picture into a rotatable grid of dots —
  circle, square or diamond — whose diameter grows with local darkness, for a classic plotter-ready
  halftone. Tone is shaped by brightness / contrast / gamma / invert; screen angle, dot spacing and
  min/max dot size control the grid.
- **Weave (image squiggle) algorithm.** Renders an uploaded picture as parallel lines that waver side
  to side, with darkness driving both the wave amplitude and frequency (shadows wobble tightly,
  highlights flatten). Lines can be joined into one continuous boustrophedon stroke.
- **Picture source widget.** A new lightweight `imageUpload` panel control plus a shared image-source
  helper (`src/core/algorithms/image-source-util.js`) decode an uploaded picture to a runtime raster
  (persisted as a data URL, re-decoded on reload) and sample its luminance. With no picture set, both
  picture algorithms render a built-in Lambert-shaded sphere so they produce output immediately.
- **Algorithm menus gain named sections.** The Add Layer menu, the Algo-Draw toolbar picker, and the
  Generator algorithm selector now group entries under section headers — the existing **2D** / **3D**
  groups plus a new **Typography** section (Text) and **Image** section (Dotscreen, Weave) — driven by
  a `category` field and the shared `groupAlgorithmsForMenu` helper. Each new algorithm also ships a
  distinct picker icon.
- **Font selector for Text.** The stroke font exposes five styles — Vectura Sans, Vectura Italic,
  Condensed, Wide, and Backslant — derived from the base monoline glyphs via affine transforms, picked
  from a new Font dropdown in the Text panel.
- **Smart-Edge dot merging for Dotscreen.** An optional "Merge Dots" toggle unions overlapping dots
  (via the bundled polygon-clipping engine) into clean single-traced outlines, so dense regions plot
  as solid blobs instead of stacked, double-traced circles.
- **Weave continuity modes.** A Continuity selector threads the woven rows into one boustrophedon
  stroke (single) or stitches consecutive rows with ladder connectors on both ends (double), mirroring
  Wavetable.
- **Per-algorithm preset libraries** for Text, Dotscreen, and Weave (four hand-tuned `.vectura`
  presets each), surfaced through the universal preset gallery.
- **Drawing-order (plot progress) slider.** A low-profile horizontal slider with a vivid gradient sits
  below the Layers panel; it reveals the first N% of the whole document's pen path in plot order —
  truncating the straddling segment mid-stroke — as a pure render preview (export is unaffected).

### Fixed
- **Opaque Raster-Plane bars (See-Through OFF) now occlude correctly.** Bars hidden-line removal moved
  from a single mean-depth-per-face painter test — which left co-depth neighbours fighting and
  shattered edges into sub-pixel slivers, so far/short bars bled through the gaps — to an interpolated
  screen-space **depth buffer**: every bar surface is triangulated with per-vertex camera depth, and
  each candidate edge is clipped against the rasterised nearest-surface depth (with a slope-scaled
  bias to avoid self-occlusion). Nearer bars now cleanly hide the bars behind them. The base outline
  is occluded the same way, and surviving runs are merged back into clean spans.

## 1.2.1 - 2026-06-19

### Fixed
- **Petalis profile silhouettes now match their gallery icons.** The editable pen-editor shape for
  the **lanceolate, dagger, rounded, and notched** profiles had drifted off the icon the algorithm
  actually draws (e.g. a stray mid-blade anchor bowed lanceolate ~5.5% off; notched peaked at the
  wrong point). Each fitted-anchor template was re-fit to the canonical `profileHalfWidth` curve with
  the fewest control points — lanceolate and dagger collapse to a clean base/peak/tip (3 anchors → a
  4-point silhouette), rounded keeps one shoulder per cap (4), notched keeps a shoulder for both the
  fast base and concave tip (5). A new integration guard asserts every applied silhouette tracks its
  icon within tolerance and stays within its anchor budget.

### Changed
- **Smoother Petalis petal caps.** The petal-outline sampler now subdivides by chord flatness instead
  of evenly in `t`, so high-curvature tip/base caps stay smooth with fewer points and gentle stretches
  stay sparse. Pure single-profile and blended (inner/outer) petals carry their adaptive cap points
  through the blend, so round caps no longer facet into polygons.

## 1.2.0 - 2026-06-15

A large feature release spanning a universal preset system, a new Morph modifier, the Pendula
kinetic-harmonograph studio, a Petalis overhaul, four new 3D algorithms (Spiralizer, Topoform,
Polyhedron, Raster-Plane) with STL import and shared rendering powers, a Terrain Free-3D mode with
real river hydrology, and a gallery-first Wallpaper experience.

### Added
- **Universal preset system.** Every algorithm now opens on a named preset and carries a thumbnail
  preset gallery grouped by Classic / Geometric / Organic / Complex / Evolving / User. A dirty-state
  **save pip** appears the moment a layer diverges from its preset — click it (or `Cmd/Ctrl+S`) to
  name and save the look, with one-click Undo. Presets persist in the browser, **sync two-way to a
  folder on disk** (Chrome / Edge / Brave), or travel as a portable `vectura-presets.json` bundle.
  **Developer Mode** turns the Save dialog into an authoring tool — overwrite any preset (built-ins
  included), save into any category, reassign groups inline, and delete to disk — written straight
  into the repo's `user-presets/` folder.
- **Morph Modifier.** A new blend container alongside Mirror: drop in 2+ layers and it fills the gap
  with graduated in-between rings (an Illustrator-style Blend, but plotter-native — every path is a
  polyline). Corner-matched bézier rings keep sharp corners crisp, fill / position / size all morph,
  shapes chain sequentially or cyclically, and **Illustrator-style isolation** lets you single-click
  to select the group and double-click to step in and edit one child while the blend re-folds live.
- **Pendula — a new kinetic-harmonograph studio.** A Motion Rack of drag-assignable temporal LFOs,
  macro knobs, and draw-your-own shapes baked into the figure; **Lateral** and **Pintograph** machine
  types; **Release** and **Phase** drag pads with per-parameter dice padlocks; a grouped preset
  gallery; a pop-out, draggable, resizable **Virtual Plotter** with a plot-range window; and
  **Export Animated SVG** (a self-contained draw-on animation).
- **Spiralizer — a new 3D algorithm.** Coils lines or markers (dots, filled discs, plusses, crosses,
  squares, triangles, dashes) around a sphere, cone, cylinder, ellipsoid, torus, or capsule — or a
  twistable **Helix** shape where 2+ twists draw a DNA double helix with base-pair rungs. Markers
  scatter at mm-accurate spacing with a thickness selector, hollow glyphs take a universal fill, and
  it renders in orthographic or perspective projection.
- **Topoform — a new 3D algorithm.** Renders primitive meshes (sphere, torus, cube, cone, ellipsoid,
  cylinder, capsule, pyramid, superellipsoid, torus knot) or imported STL meshes as projected
  wireframes or depth-plane topographic contours — with detail up to 100, bezier contour smoothing,
  an optional Scene Lighting pass with a light-positioned **Specular Highlight** and a **Light
  Position** drag pad, and orthographic or perspective projection.
- **Polyhedron — a new 3D algorithm.** Renders Platonic / Archimedean solids or imported STL meshes
  as face bands, edges, and vertex rings — with front-face culling, dashed hidden lines, extrude /
  explode / twist effects, and orthographic or perspective projection.
- **Raster-Plane — a new 3D algorithm.** Projects a height source (built-in relief, preloaded noise,
  imported image, or hand-painted canvas) as line relief, deformed mesh, raster topography, or
  extruded bars — with a **Surface Noise** rack where each layer's own Blend Mode + Field Weight
  embosses the surface, a Lines-as-Planes **Base Height**, and orthographic or perspective projection.
- **Shared 3D rendering powers.** **STL import** (binary + ASCII), perspective projection, true bézier
  smoothing, primitive detail up to 100, and four toggleable rendering powers — depth cueing,
  silhouette / feature-edge emphasis, true hidden-line removal, and Lambert hatching — shared across
  the 3D algorithms (all off by default).
- **Harmonograph** gains a starter preset gallery and a live, evolving, looping Virtual Plotter.
- **Petalis overhaul.** Real convex petal geometry with 10 distinct, botanically-legible profiles and
  a visual thumbnail gallery; an embedded **Petal Designer** with a per-side (Inner / Outer) profile
  editor; even-ring whorl layout; one-knob **Bloom**, **Petal Asymmetry**, and pseudo-3D **Petal
  Cupping** macros; opt-in **Venation** shading; a randomizer that rolls a variety of real flowers;
  and ~10–12× faster generation.
- **Wallpaper** becomes gallery-first: a **Styles** mode of one-click cards for all 17 groups plus
  named recipes, a "surprise me" dice, on-canvas center / rotate handles, and live cached previews.
- **Cache-busting.** `npm run version:sync` stamps `?v=<version>` onto every local script and
  stylesheet, so a JS/CSS change always takes effect instead of serving stale cache.

### Changed
- **Terrain** gains a **Free 3D** projection mode — orbit the landscape on the shared 3D engine with
  sliders and an on-canvas gizmo — plus floating-horizon hidden-line removal, a **Top Width** footprint
  fan, and camera-distance / perspective-strength ranges reaching down to 1×.

### Fixed
- **Terrain.** Mountain **Octaves / Lacunarity / Gain** now actually drive multi-octave detail (they
  were previously dead no-ops), and **rivers** follow a real drainage network — they start in the hills,
  branch and merge downstream, and no longer "drip" thin lines below the surface.
- **Masking no longer changes a curve algorithm's shape** — curve geometry is flattened before
  clipping instead of clipping the sparse control polyline.
- **Wallpaper.** Rectangular lattices now lock their tile angle to 90°, so the mirror / glide
  symmetries (pm, pg, pmm, pmg, pgg) tessellate without overlapping or gapping.

## 1.1.10 - 2026-05-20

Closes the Meridian cleanup chain that was tracked since the Meridian Blue migration merge. `_ui-legacy.js` and `styles.css` are both deleted; the `--color-*` → `--ui-*` token migration is complete; the `data-theme` root mirror is gone. All new CSS now lands exclusively in `src/ui/skin/`.

### Added
- **Pen tool — bezier handle editing in the reticule subtool.** Direct-select on a pen-drawn anchor now exposes draggable bezier handles with snap-to-origin (5 px screen-space) and handle collapse-to-anchor behavior. Pairs with the new close-drag snap-to-start gesture.
- **Direct-select — drag-to-merge anchor nodes.** Dragging an anchor on top of another anchor on the same path merges the two into a single anchor (Illustrator-parity). Also fixes a regression where `sourcePaths.meta.anchors` were silently dropped through Undo/Redo and `.vectura` save/load.
- **Topo algorithm icon** replaced with a new brand mark.

### Changed
- **Meridian cleanup chain — closed.** Twenty-plus refactor commits drain `_ui-legacy.js` into satellite modules and `styles.css` into `src/ui/skin/`, then delete both files. Highlights:
  - Units 1.5–1.10: extract wave/noise tables + NOISE_DEFS, pen workflow methods, modal mount primitives, 6 algorithm-specific methods, Document Setup input handlers, the remaining `bindGlobal` handlers, and the constructor body into satellite modules — then `git rm src/ui/_ui-legacy.js` and drop its `<script>` tag.
  - Units 2.1–2.7: drain Align/Pathfinder/Paint-Bucket, right-pane tabs + bottom-pane shell, wave/noise + step-dot + export-modal scaffold + info-popover, export-modal optimization cards, Layers V8 + algo dropdown + touch-tablet variants, Document Setup drawer + layer-bar palette picker, mobile shell + touch ergonomics + Pattern Designer, and the base/root + theme-toggle + chevron + tour + help-guide CSS into the skin layer — then `git rm styles.css` and drop its `<link>` tag.
  - Steps 3.1–3.3a: rewrite every `var(--color-*)` reference under `src/` to `var(--ui-*)`, inline the `classic-*.css` aliases, and delete the `--color-*` defaults from `components.css`.
  - Step 4.1: drop the `data-theme` root mirror attribute and its fallback read path.
- **Scaffolding files** (`AGENTS.md`, `CLAUDE.md`, `docs/skin-authoring.md`, `docs/a11y-audit-phase5.md`, `plans.md`, `README.md`) updated to reflect the deletions; the "new CSS lands in `styles.css`" guidance is replaced with skin-only authoring.

### Fixed
- **Scissor tool on closed pen paths.** Closing a pen path then dragging the scissor across it no longer produces a spurious extra split near the start anchor. Affected paths that had an exact-coincident start/end pair.
- **E2E harness — subagent termination.** Recurring subagent terminations during `npm run test:e2e` runs eliminated; the harness no longer reaps its own worker process under specific timing windows.

### Removed
- **`src/ui/_ui-legacy.js`** — drained and deleted (unit 1.10). The legacy `UI` constructor now lives in `src/ui/ui.js`; all behavior preserved.
- **`styles.css`** — drained and deleted (unit 2.7). All rules now live under `src/ui/skin/{tokens,motion,components,*-skin}.css`.
- **`--color-*` token aliases** removed from `components.css` and the classic skin files; `data-theme` root attribute mirror dropped from the runtime.

## 1.1.0 - 2026-05-19

### Added
- **Wallpaper mirror — universal Domain scale slider.** New 0.30–2.00× control on every wallpaper mirror scales the fundamental-domain clip polygon around its centroid before symmetry ops. Values <1 introduce gaps between symmetric copies (open-tile aesthetic), values >1 introduce overlap (woven aesthetic), 1.00 keeps exact tiling. Works uniformly across all 17 groups and serializes to `.vectura` alongside the other tile params. Double-click to reset.
- **Wallpaper mirror — v1 layout toggle for 5 groups.** p3, p3m1, p4g, p6, and p6m gain a `Tile layout` row in the mirror panel to switch between **v2 (exact tile)** — the new mathematically correct fundamental domain — and **v1 (classic spacing)** — the pre-1.1 layout that produces the canonical "alternating triangles" look of p3, the open spacing of p3m1/p4g, and the dense overlap of p6/p6m. Default is v2; the toggle composes with Domain scale.
- **Pathfinder panel — full Illustrator parity.** Multi-selection sidebar gains a collapsible `Pathfinder` section that exposes all ten Illustrator-style operations on 2+ selected layers: four **Shape Modes** (Unite, Minus Front, Intersect, Exclude) produce non-destructive compound shapes editable via the Shape Modes row plus an Expand button to bake; six **Pathfinders** (Divide, Trim, Merge, Crop, Outline, Minus Back) produce destructive baked output grouped under a new `pathfinder` group container. The mode toggle (Silhouette / Shape-Only) drives input geometry — Silhouette chord-closes open paths, Shape-Only restricts to closed shapes. Outline preserves source `strokeWidth` (Vectura divergence vs Illustrator's 0pt — plotter output needs a real width). Divide is capped at 8 input layers to avoid `2^n` cell explosion. Empty results are no-ops with a transient hint (no spurious history entries). Each op is undoable as a single history step. Section collapse state persists in `SETTINGS.uiSections.multiSelectionPathfinderOpen`.
- **Export Stroke Override toggle.** New switch in the Optimization panel sits above the Stroke (mm) slider and defaults to OFF. With the toggle off, the SVG export honors each pen's configured width as set in the Pens panel. Turn it on to surface the slider and apply a single uniform stroke across the whole document, overriding the per-pen widths. Persisted across sessions and `.vectura` saves.

### Fixed
- **Wallpaper groups — exact tiling restored for 9 of 17 groups.** `pmg`, `pgg`, `cmm`, `p4g`, `p3`, `p3m1`, `p31m`, `p6`, and `p6m` all previously failed to tile the cell correctly: misplaced glide axes routed multiple ops to the same quadrant (pmg, pgg), non-perpendicular mirror angles in cmm generated D₃ instead of D₂, lattice-equivalent duplicate ops in p4g left a 25% gap, and incorrect fundamental-domain sizes/shapes in the hex groups produced partial coverage (p3/p3m1: ~50%), ~3× overlap (p6), or asymmetric overlap (p31m, p6m). Each group now has exact 1.000 coverage with no op-pair overlap, verified by sampling the fund-domain images and checking the reduced-mod-lattice grid union. Old behavior of `p3`/`p3m1`/`p4g`/`p6`/`p6m` is preserved as a per-group v1 toggle for aesthetic continuity.
- **Pathfinder ops now respect panel layer order (panel-top = "front" of the stack).** Previously TRIM, MERGE, CROP, MINUS BACK, DIVIDE, UNITE, INTERSECT, and EXCLUDE treated the *bottom* of the layer panel as the front of the stack, so the layer at the top of the panel was the one getting trimmed / cropped away / having its color discarded — opposite of every Illustrator-style design tool. They now consistently use the Illustrator convention: the panel-top layer is the cookie cutter (Crop), the survivor (Minus Back), the layer that stays whole (Trim/Merge), and the appearance-donor (Divide cells, Unite/Intersect/Exclude compounds). MINUS FRONT is unchanged — it still keeps the bottom-of-panel layer, since "subtract the front" means the *back* survives.
- **Make-clipping-mask drag gesture now uses Shift instead of CMD/Ctrl.** macOS Chrome silently cancels the `drop` event whenever CMD is held throughout an HTML5 drag (the OS treats it as a system alias gesture), so the previous "CMD+drag a mask-capable layer onto another to mask it" UX never worked for real users despite passing all synthetic tests. Switching the modifier to Shift sidesteps the OS-level intercept entirely — Shift has no special drag interpretation on any platform. Updated in-app help and README to document the new gesture.

### Changed
- **Mirror controls extracted to a dedicated panel module.** The 320-line `buildMirrorModifierControls()` method previously embedded in `_ui-legacy.js` is now `src/ui/panels/mirror-panel.js`, registered in `index.html` and called via `window.Vectura.UI.MirrorPanel.build(ctx, layer, container)`. The old call site in `algo-config-panel.js` and the integration test that exercised the legacy entry point have been updated. Behavior is unchanged; the new module is the home for all wallpaper-mirror controls including the new Domain scale and Tile layout switches.
- **Document Setup drawer rebuilt against the Meridian skin component vocabulary.** The slide-out File ▸ Document Setup pane now uses `.sect`/`.sect-hdr`/`.sect-body` (with the 3 px accent rail + chevron disclosure that the rest of the app uses), `.ctrl-sel`, `.num-step` (with ± hit targets), `.seg-ctrl` for orientation/units, `.value-chip` for color pills, and `.ctrl-slider` for line-weight inputs. Settings reorganised into nine collapsible sections — Theme, Paper, Crop & Outside, Margin Outline, Guides & Display, Background & Selection, Plotter Physics, Layer Bar Colors, History & Preferences — all open on first reveal so no controls move out of sight. Every `#set-*` id is preserved verbatim, so the ~30 inline handlers in `_ui-legacy.js` `bindGlobal()` keep wiring without modification.
- **Document Setup close button** is now a circular outlined left-facing chevron in the upper-right of the drawer header (matching the visual register of the side-pane collapse handles), replacing the previous `✕` glyph which was inheriting the legacy `.pane-toggle` absolute-positioning and floating midway up the panel.

## 1.0.0 - 2026-05-08

First stable release. The 0.x series shipped 13+ generative algorithms, the Petalis editor, mirror modifiers, layer nesting + masking, plotter-grade SVG export, and a Noise Rack. The 1.0 line draws a stake around a polished, accessible, themable Studio: six skins across two families, a rebuilt onboarding tour, an extensible UI architecture, and reduced-motion + keyboard-a11y compliance. From here on, breaking changes follow semver.

### Added
- **Welcome screen "take the tour" CTA.** Gradient ghost button on the welcome panel kicks off the onboarding tour from a cold start.
- **Toolbar dock-and-drag restore.** Grabbing a docked toolbar's drag handle now anchors the handle directly under the cursor — no snap-to-default-corner, no jump from float-vs-docked dimension shifts, no clamp at viewport edges. New regression test pins this behavior.

### Fixed
- **Mirror children unlock when their parent is deleted.** Auto-locked children that survive a mirror-modifier deletion are now restored to an editable state instead of remaining locked with no visible parent.
- **Manual version bumps no longer get double-stomped.** The PreToolUse Bash hook that auto-patches the version on commit now skips if `package.json` is already staged or if the commit only touches docs/hooks.
- **Theme toggle no longer leaves canvas on the wrong dark color** after cycling dark → lark → light → dark.
- **GitHub Pages deploy was missing `_ui-legacy.js`** — Jekyll silently strips files prefixed with `_`, so the bare GH Pages serve returned 404 and the script load chain halted, leaving the toolbar collapsed and menus dead. Added `.nojekyll` at the repo root to disable Jekyll processing.
- **Toolbar flicker on initial paint.** The empty `#tool-bar` div briefly rendered as a small rounded shape before JS populated it. Hidden via `.tool-bar:empty { visibility: hidden; }` so it only appears once children are mounted.
- **Left/right pane flicker and snap on page load** eliminated.
- **Toolbar subtool submenus** were getting clipped by an `overflow: hidden` ancestor; now portaled out so they render above the workspace.

### Changed
- **Onboarding tour rebuilt around an extensible step engine.** Visual primitives (highlight, dashed circles, popover positioning), action helpers (open menus, expand sections), and completion factories (`When.layerOfType`, `When.clickMatches`, `When.elementVisible`, …) are now cleanly separated, and steps may declare multiple in-place `phases` so a single visible step can guide the user through a multi-stage interaction. Adding a new step is data-only.
- **Tour content revamped.** Step 1 teaches press-and-hold algorithm selection (Rings) and waits for the user to draw — its final "double-click the canvas" phase anchors the popover above the viewport pointing down. Step 2 introduces the Algorithm-panel dropdown for swapping generators on an existing layer. Step 3 notes that **Randomize Params** lives at the **top** of the Algorithm Configuration pane. Step 4 covers layer nesting + Mask. Step 5 first highlights **+ Add Layer**, then the **Mirror Modifier Group** entry. Step 6 parks the popover over the Modifier panel so the canvas is free for the user to drag/rotate the mirror axis. Step 7 highlights **Save Project** and **Export SVG** within the auto-opened File menu.
- **Tutorial popover is draggable on play-around steps** (`movable: true`). Pull it from the title bar to move it out of the way without dismissing the tour. User-positioned coordinates persist across phases of the same step and reset on the next step.
- **Mirror modifier auto-locks its children on entry.** Layers that are wrapped by a mirror, dropped into a mirror group, or added under a selected mirror are now automatically marked locked so they cannot be nudged off-axis. The lock can still be removed individually from the layer list.
- **Disclosure chevrons unified** on the Lucide `chevron-down` glyph with directional rotation, replacing a mix of triangles and ad-hoc SVGs.
- **Internal `_ui-legacy.js` drained of ~100 delegator stubs** across panels, persistence, shell satellites, pens panel, pane-left, export-svg, modals, shortcuts, and grouping methods (now home in `layers-panel.js`). Continues the Meridian Blue UI architecture refactor toward eventual deletion of `_ui-legacy.js`.

### Inherited from 0.9.10 (rolled forward into 1.0.0 highlights)
- **Meridian Blue skin family** — three new skins (`meridian-dark`, `meridian-lark`, `meridian-light`) with Space Grotesk + JetBrains Mono typography, tighter pane geometry, slider/dial release halos, and family-scoped petal/pattern designer chrome. Plus indeterminate progress bar, empty-state SVG illustrations, the skin-authoring SDK (`npm run skin:new -- <id>`), and the reduced-motion + keyboard-a11y compliance audits.

## 0.9.10 - 2026-05-07

### Added
- **Meridian Blue skin family.** Three new skins (`meridian-dark`, `meridian-lark`, `meridian-light`) sourced from `themes-mockup.html`. Selected via the Modern/Classic toggle in Document Setup → Theme; the existing `dark`/`lark`/`light` cycle stays within the active family. Space Grotesk + JetBrains Mono typography, tighter pane geometry (290/258px panes, 30px row height), slider/dial release halos, family-scoped petal/pattern designer chrome, and indeterminate progress bar wired into save / SVG export / engine generations exceeding ~200 ms.
- **Skin-authoring SDK.** `npm run skin:new -- <id>` scaffolds a new skin from `src/ui/skin/_template.css`. Generator validates id format (lowercase kebab-case), refuses overwrite without `--force`, and prints the manifest snippet ready to paste into `src/config/defaults.js`. Full guide at `docs/skin-authoring.md`. New skins ship with one CSS file + one manifest entry — zero JavaScript edits.
- **Empty-state SVG illustrations** in the layer list and pattern fill panel via `UI.overlays.EmptyState` + `UI.EmptyStates`. Monochrome, sourced from `--ui-muted` so they re-skin automatically.
- **Indeterminate progress bar** primitive (`UI.overlays.ProgressBar`) with a stack model so concurrent jobs share one physical bar. Reduced-motion fallback collapses the animation and renders a static 100% bar at 0.55 opacity.
- **`vectura:skin-change` event.** Dispatched after `applyTheme` swaps the active stylesheet (one rAF later). Renderer cache + dial-wave halos refresh on this event. Payload: `{ id, family, manifest, prevId }`.
- **Reduced-motion compliance pass** scripted in `tests/unit/skin/reduced-motion-compliance.test.js`. Every keyframe in `motion.css` has a paired `prefers-reduced-motion: reduce` fallback; styles.css ships the universal `*, *::before, *::after` guard collapsing animations + transitions to ≤0.01ms.
- **Keyboard a11y audit** scripted in `tests/unit/skin/keyboard-a11y-audit.test.js`. Manual audit results in `docs/a11y-audit-phase5.md` covering 20 surfaces (modals, menus, designers, components). Focus-trapping primitives (Modal, Menu) handle Escape directly; keyboard-capturing components cancel via Escape.

### Changed
- **UI architecture refactor.** The 16,288-line `src/ui/ui.js` split into ~60 satellite modules under `src/ui/{shell,panels,components,overlays,modals,menus,skin}` while keeping the legacy class as a thin orchestrator. The DI-bag `bind(deps)` pattern is the locked extraction contract. `src/ui/_ui-legacy.js` (~8,300 lines) remains on disk during the transition; deletion is the final cleanup task tracked in the Phase 5 closure notes.
- **Renderer's `getThemeToken` cache** now resolves both `--ui-*` and legacy `--color-*` aliases for cross-skin compatibility. Cache is invalidated on `vectura:skin-change`.
- **Skin manifests** (in `window.Vectura.THEMES`) extended with `family`, `paneLeftWidth`, `paneRightWidth`, `bottomPaneHeight`, `rowHeight`, `motion`, `capabilities`, `colorScheme`, `metaThemeColor`, `documentBg`, `pen1Color`, `stylesheet` fields. Backward-compatible — classic skins inherit defaults via `CLASSIC_MANIFEST`.

## 0.9.0 - 2026-05-05

### Added
- **Mirror modifier "Expand to Folder"**: each mirrored output path becomes an individually editable shape layer inside a regular folder, preserving all source styling (pen, color, stroke width).
- **Mirror-axis path joining on expand**: pairs of paths that share an endpoint on the mirror axis are automatically joined into a single continuous path, eliminating pen lifts at axis crossings. Handles the three topologies that arise from `splitPathByAxis` — both-end (most common), end-start, and both-start — using a 0.5-unit proximity tolerance well above floating-point error.
- **Layer grouping and ungrouping** via the layer panel action menu: multiple selected layers group into a new folder; a selected group's children can be promoted back to the parent level.
- **Add Layer ▾ → Mirror Modifier Group now wraps the current selection** by default, matching `Insert > Mirror Modifier`. Both entry points now route through `insertMirrorModifier()`.

### Changed
- **Scissor/cut tool icons** redesigned using Lucide `slice`, `square-scissors`, and `circle-scissors` for clearer subtool distinction.
- **Pattern fill and terrain tool icons** updated for improved visual clarity.
- **Trash and mask-source-active icons** refreshed for design consistency.

## 0.8.27 - 2026-05-05

### Added
- **Custom canvas cursors** for the four primary tools. Selection (V) shows a filled black arrow, Direct Selection (A) an outline-only arrow, and Pen (P) a fountain-pen tip — each via SVG-as-cursor data URLs. Fill (F) hides the system cursor in favor of a DOM overlay (see below).
- **Fill loupe overlay.** When the Fill tool is active, the canvas shows a paint-bucket icon anchored to the cursor with a fill-point dot, plus a 96 px circular magnifier (~4× zoom) of the canvas pixels under the cursor. The magnifier auto-flips between quadrants relative to the cursor so it stays inside the canvas viewport when the cursor is near an edge.
- **Line shape primitive** (`shape-line`, keyboard `U`). Drag two endpoints; Shift snaps the angle to multiples of 45°. Emitted as an open two-anchor path (`closed: false`) and routed through the existing shape draft / commit / direct-select pipeline.
- **Algorithm-submenu hover styling now matches the toolbar's active-tool blue** (`#38bdf8` border + `rgba(56,189,248,0.12)` background), unifying the focus-cue across the two menus.

### Changed
- **Toolbar consolidation.** Rectangle, Oval, Line, and Polygon are now subtools of a single long-press group button (`data-tool="shape"`) that mirrors the Selection group's UX: single-tap activates the most-recently-used variant; long-press (280 ms) opens the variant submenu. The three previously-flat shape buttons are gone. Existing M / L / Y shortcuts still pick rect / oval / polygon; new `U` picks line. The active variant is persisted to `SETTINGS.shapeMode` and reflected as the parent button's icon.

## 0.8.24 - 2026-05-05

### Security
- **Fixed XSS via imported SVG pattern tile.** The Pattern Designer's tile-import path stored raw user SVG into `draftMeta.svg` without sanitizing event handlers; later `innerHTML` use during pattern validation could execute `<image onerror=...>`, `<animate onbegin=...>`, `<script>`, and `javascript:` href payloads. New shared `Vectura.SvgSanitize.sanitize()` strips `<script>`, `<foreignObject>`, all `on*` attributes, and rewrites `javascript:` `href`/`xlink:href`. Wired into both the Pattern Designer import path and the file-open SVG path (replacing the narrower inline `stripEventHandlers` in `ui-file-io.js`). Eight new regression cases in `tests/unit/security_xss.test.js`.
- Replaced two silent `} catch {}` blocks in `pattern.js` (boundary trace, path sampling) with `console.warn('[Pattern] …', err)` so previously-masked failures now surface.

### Fixed
- **`.vectura` save/load now preserves `layer.origin`.** Engine `exportState`/`importState` previously omitted origin; the field is read by transform math in the renderer, so scale and rotation could drift across a save/load cycle. Origin is now serialized (cloned) and restored, with a `{x:0, y:0}` default for back-compat with files saved before this version.
- Fixed precision loss in `worldToSourcePoint` for layers with `|scaleX|` or `|scaleY|` < 1e-6: the inverse-transform fallback no longer collapses to `1` (which broke true inversion); it now uses a sign-preserving `1e-6` clamp so tiny-but-nonzero scales remain orientation-correct.

### Changed
- **Engine layer mutations are now encapsulated.** Added `VectorEngine.reorderLayers()`, `deleteLayersById()`, and `setActiveLayerId()` with input validation and warn-on-invalid behavior. UI callsites that previously assigned directly to `engine.layers` / `engine.activeLayerId` (delete-layer, group/ungroup, mirror modifier insertion) now route through these methods.
- **`topo`, `phylla`, and `terrain` algorithms migrated off legacy noise stacks** to the shared `NoiseRack.defaultConfigFor(algorithmId, params)` helper, completing the AGENTS.md "universal noise" discipline for these algorithms (`flowfield`, `grid`, `rings`, `horizon` still pending). Visual baselines unchanged — defaults are byte-identical to the prior inline `legacyNoise` shapes.
- **Algorithm tuning constants extracted** to a new `src/config/algorithm-tuning.js` registry exposed as `Vectura.AlgorithmTuning`. Rainfall (`noiseScale`, `gustScale`, `spiralFactor`, `paddingMax`) and Wavetable (`defaultZoom`) now read from config instead of inlined literals; rainfall's hex tile ratio is now `Math.sqrt(3)/2` (precision gain, no baseline drift in current coverage).
- **Math utilities deduplicated.** New `src/core/algorithm-utils.js` exposes `Vectura.AlgorithmUtils.{clamp, clamp01, lerp, frac, applyPad}`; ~26 inline duplicates removed across 18 files (engine, renderer, modifiers, noise-rack, several UI mixins, and most algorithms). `applyTile` deliberately left inline per algorithm — its semantics diverge meaningfully across rainfall / wavetable / topo / spiral and a single canonical version would alter rendering.

## 0.8.20 - 2026-05-05

### Changed
- Layer cards now render at roughly 2× scale on touch tablets (iPad portrait and landscape) for finger-friendly interaction. Row heights, icon buttons, color dot, algorithm icon, and layer/group label text all enlarge; eye and lock buttons reach 40×40, action buttons 36×36. Targeted via `(pointer: coarse) and (min-width: 600px)` so phones and desktop are unchanged.
- Consolidated UI inline-SVG icons into a single registry at `src/ui/icons.js` exposing `Vectura.Icons.{layer,tool,misc}`. The 34-icon layer-panel set (previously inlined inside `ui.js`) and the 23-icon Petal Designer toolbar set (previously inlined inside `ui-petal-designer.js`) now live in one dedicated module, plus the formerly stray ring icon used for algorithm param-group headers. Pure refactor — no visual change, no API surface change for callers (`this._LVL_I` and the toolbar `renderIcon()` wrapper still work as before). Static `<svg>` literals in `index.html` (theme toggle, layer-search/filter/plus) were intentionally left alone since they render before JS loads.

## 0.8.0 - 2026-05-04

### Added
- Added **Lark theme**: a dark UI with a white canvas, purpose-built for a plotter-on-paper workflow. Accessible via the global theme toggle introduced in 0.7.0.
- Added **Algorithm Drawing Tool** with a dedicated submenu for quick access to algorithm-specific drawing actions.

### Changed
- Enhanced layer removal and modifier handling to correctly propagate mask state, preventing orphaned mask references when layers or modifiers are deleted.
- Exported wallpaper-groups utilities to the `window.Vectura` namespace for downstream use.
- Algorithm panels (module selector and configuration) are now hidden when a non-modifier group layer is selected, reducing visual clutter.
- Fixed bottom pane collapse/expand toggle icon rotation (was 90°, now 180°).
- Refactored engine and UI code for improved readability and maintainability.

### Fixed
- Fixed XSS vulnerability: user-controlled strings in modal error bodies are now properly escaped.
- Fixed missing `wallpaper-groups.js` module that caused CI failures.

## 0.7.0 - 2026-05-03

### Added
- Added a new **Terrain** algorithm focused on realistic plotter-ready terrain. Heightfield-driven scanlines under a selectable perspective (`Top-down`, `One-point`, `Two-point`, or `Isometric`), with native generators for ridged-multifractal mountains, V/U-profile valleys (sinuous axis, configurable count/depth/width/meander), steepest-descent rivers that carve into the heightfield, and an ocean clamp with optional marching-squares coastline contour. Hidden-line removal via per-column screen envelope. Shipping with six style presets — `Alpine Range`, `Rolling Hills`, `Canyon Mesa`, `Archipelago`, `River Delta`, `Tundra Flats` — and full Noise Rack integration for layering arbitrary additional displacement. Coexists with `Horizon` (which keeps its synthwave specialty).

### Changed
- Horizon out-of-the-box scene now ships with the mountain surface enabled and the Additional Noises rack empty (was opt-in mountain + a phantom rack layer with amplitude 0). New users see the algorithm's signature draped-mountain look immediately, and adding noise is an explicit action with no clutter to remove first.
- Horizon's mountain noise is now perfectly Y-coherent (`MOUNTAIN_Y_COHERENCE = 0`): every horizontal row samples the same mountain X-profile, so adjacent rows stack as vertical-translation copies of one underlying silhouette and visibly drape over the surface as a wireframe — no more loose per-row wobble. Per-row amplitude still tapers toward the horizon via `Skyline Relief`. Rack noise keeps its independent-per-row behavior so users can still add deliberate non-draped variation.
- Horizon (Terrain) parameter surface consolidated for clarity: `Depth Compression` is renamed to `Terrain Depth` and inverted (high = more rows pushed into the foreground; default 30 preserves the prior look). The Terrain Form `centerWidth`/`corridorSoftness`/`shoulderCurve`/`valleyProfile` cluster and the standalone `Center Dampening` group are merged into a single `Center Region` panel with one `Width`, one `Edge Softness`, and one `Compress at Horizon` driving both the heightfield profile and the noise mask. `Symmetry Blend` becomes `Noise Mirror` and lives under Terrain Noise (where it actually belongs). Mountain noise drops `Mountain Zoom`, `Mountain Frequency`, and `Mountain Seed` — the built-in surface is now controlled by `Mountain Amplitude` alone, with seed shared from the global Seed slider. Net: ~26 user-facing knobs collapsed to 15 with no loss of expressive range for typical scenes. Old `.vectura` projects load unchanged via the default-spread; removed fine controls fall back to the unified defaults.

### Fixed
- Horizon no longer draws a perfectly flat line across the canvas at the vanishing-point Y. The previous spacing put the topmost row exactly on the horizon (`t_raw = 0` → `rowY = horizonY`), which made the horizon line itself a visible artifact regardless of terrain settings. Rows are now distributed in the half-open interval `(0, 1]` (nearest row at the ground, farthest a small step in front of the horizon, never on it). Three Horizon visual baselines were regenerated.
- Horizon's `Additional Noises` rack now renders added noise layers in the panel. Previously the shared `ensureWavetableNoises` helper allow-listed only `wavetable`/`rainfall`/`terrain` and silently returned an empty array for `horizon`, so any added rack layer was invisible (and unreachable for editing) even though it was stored on the layer.
- Horizon (Terrain) parameter directions and wiring now match their labels: `Center Depth` carves a valley downward (was inverted into a ridge), `Shoulder Lift` and `Ridge Sharpness` raise terrain upward (were pushing it down), `Skyline Relief` attenuates the full terrain expression toward the horizon so the slider has a visible effect even when noise is off, and the convergence/fan lines now follow the displaced terrain instead of staying perfectly straight when terrain shape is active. `Floor Height` becomes a bidirectional Y offset (range -100..100, default 0) — useful for compensating downward when noise bulges push rows up. Additional Noises in the noise rack now displace the terrain regardless of the `Enable Terrain Noise` master toggle (the master toggle still gates the built-in mountain noise). Visual baselines `horizon-valley.svg`, `horizon-shoulders.svg`, and `horizon-flat-grid.svg` were regenerated to match.

### Changed
- Horizon mountain noise now skins coherently across rows by anchoring the noise depth-axis to the horizon, so adjacent rows sample nearly the same lateral mountain profile. `Mountain Amplitude` can now be pushed well above 5 without rows tangling, and the grid stays evenly draped over the mountain surface. Visual baselines `horizon-valley.svg` and `horizon-shoulders.svg` were regenerated to match.
- Added a `Compress at Horizon` sub-control under `Center Dampening` (range 0–100, default 0). At 100 the dampened band tapers to zero width at the horizon line, forming an upward-pointing triangular mask anchored at the vanishing point; existing softness and falloff still shape the per-row edges.
- Horizon now starts as a clean perspective grid by default. Terrain noise is opt-in via the new `Enable Terrain Noise` toggle, which exposes a built-in mountain noise (amplitude/zoom/seed) plus a `Center Dampening` group that attenuates the mountain toward the vanishing point with width, softness, and falloff sub-controls. The existing per-layer noise rack is retained as `Additional Noises` for layering extra noise on top of the mountain.

### Added
- Added a global dark/light theme toggle in the header, with full-shell CSS-variable theming across panes, menus, modals, tool chrome, helper widgets, and canvas surround.
- Added `Insert > Mirror Modifier`, a new modifier-container layer type that behaves like a group in the Layers panel while applying a sequential mirror-axis stack to its child layers.
- Added mirror-guide canvas overlays with dashed full-canvas axes, reflection-direction triangles, separate rotate handles, and per-axis/stack show-hide, lock, reorder, and delete controls.
- Added unit, integration, and Playwright coverage for mirror modifier geometry, state roundtrip, and the new Insert-menu workflow.
- Added Illustrator-style Rectangle (`M`), Oval (`L`), and Polygon (`Y`) shape tools that create editable `expanded` layers, including polygon side-count changes during draft and shape-aware corner-rounding handles.
- Added export coverage for masked shape geometry with `Remove Hidden Geometry` enabled and disabled, plus focused unit/browser tests for shape creation flows.
- Added Illustrator-style parent-mask coverage so visible mask parents clip their full descendant subtree on canvas and in SVG export.
- Added a `Hide Mask Layer` option on mask parents so the parent can keep clipping descendants while suppressing its own visible artwork on canvas and in export.
- Added a document-level Metric/Imperial unit switch in Document Setup, unit-aware paper/margin/stroke/tolerance controls, an optional blueprint-style document-dimension readout outside the canvas, and a `Clear Saved Preferences` action for cookie-backed UI state.
- Added unit, integration, Playwright, and screenshot coverage for document-unit conversion, clearing saved preferences, Document Setup shortcut toggling, multi-layer Line Sort scoping, and the new outside-canvas dimension labels.
- Added an Illustrator-style Export SVG modal with a large left-side preview, right-side export settings, bottom-right actions, and preview zoom/pan controls.
- Added representative Playwright source-fidelity coverage for fill-built Pattern tiles: the harness now scans the full pattern catalog to pick compound-fill archetypes, keeps `Autumn` seam fidelity as an expected-fail regression, and tracks representative tile-silhouette mismatches for known-bad patterns like `Autumn`, `Bamboo`, and `Bank Note` without breaking the suite.
- Added a runtime custom Pattern registry with local-library plus project-carried custom tiles, `.vectura` round-trip support for saved custom patterns, inline `Import SVG Tile` / `Save Pattern` / `Load Saved` actions in the Pattern Texture Designer, and a live `3x3` seam-validation preview that blocks saving invalid imported tiles.
- Added unit coverage for custom-pattern registry/validation flows and Playwright coverage for invalid-tile save blocking plus custom-pattern project round-tripping.
- Added shared toolbar generation in `ui.js` so the main canvas, Petal Designer, and Texture Designer all render from one configurable tool-definition registry, and expanded the shared tool set with `Fill` and `Erase Fill`.
- Added nested-region Texture Designer fill targeting, drag-pour fill/erase behavior, `Alt/Option` temporary erase while filling, and a `Show Gaps` slider with yellow preview markers plus auto-close actions for closable seam-endpoint gaps.

### Changed
- Corrected polygon Noise Rack zoom semantics so larger values now produce a larger polygon footprint across shared and algorithm-local samplers, and normalized vertical-displacement sign so positive amplitudes lift line stacks upward while negative amplitudes push them downward.
- Fixed Wavetable `Isometric` so `Line Gap` now scales the visible cell spacing from one shared lattice model, `Row Shift` shears the full lattice instead of leaving diagonal families behind, and added deterministic plus SVG-baseline regressions for the corrected behavior.
- Fixed the stale Export SVG smoke test path so CI now forces a real Line Sort off-to-on transition before asserting preview promotion, matching the current default-enabled Line Sort setting instead of relying on a no-op checkbox `check()`.
- Reclassified the remaining Pattern smoke failures as real renderer/import fidelity bugs rather than expected test drift; `Autumn` seam continuity and representative Hero fill-built silhouette mismatches remain open product issues.
- Fixed fill-built Pattern SVG extraction so the renderer now traces the visible filled silhouette instead of outlining every overlapping subpath independently, and tightened seam-chain reconnection so `Autumn`'s standard-grid tile joins stay vertically paired instead of producing irregular cross-seam diagonals. Added unit and Playwright regressions for the fill-boundary and seam-pairing cases.
- Fixed Pattern-layer texture initialization so the inline Texture Designer now renders the effective default texture immediately, including the initial `4 Point Stars` fallback case before any manual reselection.
- Moved the inline Pattern `Texture Designer` directly below the texture selection grid and above the `Scale` control.
- Moved export and optimization controls out of Document Setup into the Export SVG modal, while keeping export behavior dictated strictly by the existing `SETTINGS` and layer optimization state.
- Fixed the Export SVG modal `Line Sort` preview so its overlay mode, legend colors, and line-thickness styling stay local to the modal; the primary canvas no longer picks up export-preview overlay/legend state, and cancel leaves no preview residue behind.
- Tightened Export SVG optimization-card header layout so section-level info icons sit directly to the right of their header titles instead of drifting in the header row.
- Fixed Export SVG section-header info buttons to bind to the actual header label span instead of the drag-grip dot spans, so the `(i)` control now renders beside the header text.
- Adjusted Export SVG section-header info buttons to render as siblings immediately after the title span, matching the exact `Title (i)` order instead of nesting the button inside the title span.
- Fixed Export SVG section-header info panes to open below the full title bar instead of inside the header row, while keeping field-level info panes attached to their own controls.
- Added `Truncate Start` and `Truncate End` sliders to `Lissajous`, both defaulting to `0%`, and changed `Close Lines` to default off so endpoint shortening can be dialed in before any tail-closing pass.
- Changed `Lissajous` `Close Lines` to trim loose endpoint tails back to deterministic self-intersection cutpoints instead of hard-closing the path to its first sample, with focused unit coverage for trimmed and untouched cases.
- Fixed snapshot-based Undo/Redo for document-mutating layer-structure edits so grouping, reparenting, masking, modifier/container edits, and structural selection restore now roundtrip correctly with Redo instead of only restoring the pre-edit state.
- Switching dark/light theme now updates the document background default and flips `Pen 1` between white and black, propagating the pen color to existing `pen-1` layers while keeping theme as a personal cookie-backed preference instead of project state.
- Fixed direct-edited circle mask parents so descendant clipping now follows the edited outline immediately instead of continuing to use stale circle metadata, with runtime and Playwright regressions to keep mask edits in sync.
- Fixed `Export Optimized` so masked exports no longer implicitly remove hidden geometry when `Remove Hidden Geometry` is off; optimized SVG export now preserves full source geometry and applies ancestor clip paths non-destructively.
- Removed the duplicate top-level `Remove Hidden Geometry` checkbox from Document Setup so the Export Settings card is the single UI control for that export-only setting, with regression coverage for its default-on behavior.
- `Cmd/Ctrl + K` now toggles Document Setup open and closed instead of only opening it.
- Fixed `Line Sort` so multi-layer `selected` and `all` optimization scopes keep a shared sort order across preview, stats, overlay rendering, and optimized SVG export instead of silently falling back to per-layer sorting.
- The engine now computes modifier-aware effective geometry before display, masking, optimization, stats, and export so mirrored child layers render and export consistently.
- Mirror-masked closed shapes now stay valid silhouette providers, so masked children under a Mirror Modifier clip against the mirrored closed mask union instead of disappearing when the mask produces multiple disjoint silhouettes.
- Left-panel controls now switch between `Algorithm` and `Modifier` modes, hiding `Transform & Seed` for modifier containers and exposing Mirror Stack configuration instead.
- Mirror Modifier children can now be dragged back out to the root to unparent them, deleting a modifier dissolves only the wrapper and preserves its children, and `+ Add` under a selected modifier creates a normal drawable child instead of a bogus `mirror` layer.
- Mirror Modifier children now stay fully editable when selected, so nested child rows switch the left panel back to normal `Algorithm` controls and can still change algorithm, settings, and transforms while inheriting the mirror effect from their parent modifier.
- Rectangle and Polygon shape-tool layers now start with straight-edge primitive rendering instead of inheriting `Curves` from the previously selected layer, and rotated primitive selections keep their bounds plus corner-rounding handles aligned to the transformed shape geometry.
- Fixed algorithm switching so changing a generator layer type clears stale manual-geometry contamination, regenerates the artboard immediately, and stays covered by integration plus Playwright geometry regressions.
- Mask-parent move/resize/rotate drags now ghost-preview the masked descendant subtree against the transformed silhouette until mouse release.
- Rectangle, Oval, and Polygon creation plus single-shape Selection now use an Illustrator-style reticle cursor while keeping existing handle, drag, and center-out `Alt/Option` behaviors intact.
- Added `Remove Hidden Geometry` to `Document Setup > Export Settings`, defaulting it on so exported SVGs can destructively trim masked and frame-hidden geometry to match the current visible frame while still allowing non-destructive clip-path export when turned off.
- Replaced the old source-layer clipping workflow with Illustrator-style parent masks: mask state now lives on the visible parent, descendant layers are indented beneath it, legacy `sourceIds` masks are cleared on load, and export clip paths are derived from ancestor mask silhouettes instead of arbitrary source lists.
- Fixed `Remove Hidden Geometry` export to correctly clip ancestor-masked layers; the export now uses `displayMaskActive` (matching the canvas renderer) instead of `layer.mask?.enabled`, so child layers clipped by a parent mask are properly trimmed on export.
- Improved accessibility across all UI: theme-aware canvas reticle cursor, `prefers-reduced-motion` support, `aria-live` on notification toasts, modal focus management, `aria-pressed`/`aria-current`/`aria-expanded` on interactive controls, visible focus rings, and a minimum 11 px text-size floor.
- Changed Pattern-layer fill records to store normalized multi-region targets instead of only raw single-loop polygons, which lets the Texture Designer distinguish inner fills from outer-minus-hole rings and preserve those targets through save/load.

## 0.6.80 - 2026-03-01

### Changed
- Relaxed the post-occlusion reconnect rule so verticals can reappear after passing behind a ridge, which fixes missing visible fan lines on the saved broken masking fixture.

## 0.6.79 - 2026-03-01

### Changed

## 0.6.78 - 2026-03-01

### Changed
- Fixed the Layers-panel `Clip` trigger so the clipping-mask popover opens reliably from the layer rows in the saved masking-scene workflow.

## 0.6.77 - 2026-03-01

### Changed
- Tightened the Layers-panel clipping control with a more obvious `Clip` action and kept masking interactions scoped to the layer list workflow.

### Added
- Added a screenshot-based Playwright regression that loads the checked-in `broken-masking.vectura` fixture and snapshots the real saved masking case.

## 0.6.76 - 2026-03-01

### Changed

## 0.6.75 - 2026-03-01

### Changed
- Re-verified the saved broken masking scene against a fresh browser render so clipping masks terminate behind the visible terrain contour instead of bleeding through the landscape shoulders.

### Added

### Changed
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.74 - 2026-03-01

### Added

### Changed
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.73 - 2026-03-01

### Added

### Changed
- Added `id`/`name` wiring to the new masking editor checkboxes so the masking controls no longer contribute anonymous form fields.
## 0.6.72 - 2026-03-01

### Added
- Live non-destructive layer masking for silhouette-capable layers, including layer-row `Mask` controls, mirrored left-panel masking controls, and `Convert To Geometry` materialization into expanded lines.
- A new masking/display-geometry stage in the engine with `src/core/masking.js` and `src/core/path-boolean.js`.
- Unit coverage for masking silhouette eligibility, mask subtraction, and engine-level masked display geometry.

### Changed

## 0.6.71 - 2026-03-01

### Changed

## 0.6.70 - 2026-03-01

### Changed

## 0.6.69 - 2026-03-01

### Changed

## 0.6.68 - 2026-03-01

### Added

### Changed
- Full `Vanishing Pull` now behaves more like a true convergence-to-point control, while `Fan Reach` handles bottom/side coverage.

## 0.6.67 - 2026-03-01

### Changed

## 0.6.66 - 2026-03-01

### Changed

## 0.6.65 - 2026-03-01

### Changed
- Clarified the `Noise Angle` and `Line Offset Angle` help text to distinguish field rotation from displacement direction.

## 0.6.64 - 2026-03-01

### Added

### Changed

## 0.6.63 - 2026-03-01

### Added

### Changed

## 0.6.62 - 2026-03-01

### Changed

## 0.6.61 - 2026-03-01

### Added

### Changed

## 0.6.60 - 2026-03-01

### Changed
- Petal Designer overlay picking now selects the visible inactive shape when you click its silhouette, and the `Inner Shape` / `Outer Shape` profile editor cards now act as explicit selection targets.

### Added

## 0.6.59 - 2026-02-28

### Changed
- Replaced the remaining one-off Petalis modifier noise sliders with nested Noise Rack stacks in the main Petalis controls and the Petal Designer modifier cards.
- Kept legacy `scale` values as fallback zoom for older Petalis documents while routing new modifier edits through shared Noise Rack layer controls.

### Added
- Added deterministic unit coverage for Petalis modifier Noise Rack stacks.

## 0.6.58 - 2026-02-28

### Added
- A `Center Diameter` control for `Rings` so the innermost ring can start wider without changing the active Noise Rack stack.

### Changed
- Reworked `Rings` `Concentric` sampling so it behaves like a true ring-path field instead of a nearly static seam break, while keeping circular closure intact.
- Improved the Rings apply-mode help text so `Top Down`, `Concentric`, and `Orbit Field` describe the actual sampling models more clearly.

## 0.6.57 - 2026-02-28

### Changed
- Fixed shared Noise Rack image controls so `Invert Color` is handled as a real checkbox in the stacked-noise UI.
- Corrected image `Noise Width` sampling direction across the affected samplers so larger values widen the field instead of narrowing it.
- Centered polygon noise by default in the remaining top-left-biased samplers, including `wavetable`, so polygon fields start from canvas center.

## 0.6.56 - 2026-02-28

### Added
- A Petalis `Drift Noise Rack` control stack so angular drift now uses the shared Noise Rack model instead of a single legacy scale slider.

### Changed
- Petalis radial-noise, circular-offset, petal-noise, filament, and drift sampling paths now evaluate through Noise Rack-compatible stack samplers while preserving current legacy parameters as fallbacks.
- Local Playwright smoke runs now patch unsupported Unicode regexes, fall back to an installed Chrome when managed Chromium assets are unavailable, and disable local failure-video capture while keeping CI video artifacts enabled.

## 0.6.55 - 2026-02-28

### Added
- Noise Rack stack controls for `flowfield`, `grid`, and `phylla`, including per-layer engine selection, offsets, blend modes, and octave shaping.

### Changed
- `flowfield` now maps stacked Noise Rack fields into angle or curl flow while preserving its particle controls.
- `grid` and `phylla` now derive distortion from stacked Noise Rack fields instead of single ad hoc noise samplers.

## 0.6.54 - 2026-02-28

### Changed
- Refined Rings apply-mode semantics so `Top Down` samples world-space XY noise, `Concentric` samples along each ring path length, and `Orbit Field` preserves the legacy ring-local field.

## 0.6.53 - 2026-02-28

### Changed
- Updated Rings control language to describe the new `Top Down` and `Concentric` semantics ahead of restoring the legacy orbit-local mode as its own option.

## 0.6.52 - 2026-02-28

### Added
- Topo Noise Rack migration with multi-noise height-field layering.

### Changed
- Preserved Topo contour mapping modes while moving meaningful fractal controls into per-noise-layer behavior.

## 0.6.51 - 2026-02-28

### Added
- Rings Noise Rack migration with multi-noise layering and per-noise `Concentric` / `Top Down` projection.

### Changed
- Preserved legacy ring behavior through per-noise drift and sample-radius controls within the new Noise Rack model.

## 0.6.50 - 2026-02-28

### Added
- Canonical app-version plumbing through `src/config/version.js`.
- A version synchronization script at `scripts/sync-version.js`.

### Changed
- The app version shown in the UI now aligns with the package version.
