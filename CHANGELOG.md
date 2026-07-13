# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally human-curated with an `Unreleased` section that collects work before release.

## Unreleased

### Fixed
- **Changing a layer's algorithm now loads that algorithm's factory Default.** Factory state for a
  type is `ALGO_DEFAULTS` with the `<type>-default` preset applied on top — that is what `new Layer()`
  builds, and what the preset gallery compares against. The Algorithm dropdown re-derived it by hand
  and got a different answer: it rebuilt params from `ALGO_DEFAULTS` *alone*, so the swapped layer
  stamped itself `preset: '<type>-default'` while missing every value that preset curates (topoform
  arrived at `primitiveDetail` 18 instead of 100; spiralizer lost 11 curated params). The gallery,
  correctly, called it "Custom" — the Default was never loaded. "Reset to Defaults" had the same bug,
  resetting to a state no new layer has ever had. Both now go through `Vectura.factoryParams()`, the
  single definition introduced with the modified-parameter markers; it was always the third caller
  that had drifted. Not a regression from this cycle's preset sparsification — the pre-sparsification
  build fails identically. Guarded by three mechanical sweeps in
  `tests/integration/algorithm-switch-loads-factory-default.test.js` that name no algorithm and no
  value, so a new factory preset is covered on arrival.
- **A factory preset no longer hands a new layer its own nested objects.** `factoryParams` merged the
  preset's params by reference, and `rasterplane-default` carries an entire `noises` rack — so every
  new Raster-Plane layer shared one array with the shipped preset, and the first edit to that noise
  would rewrite the preset in memory for the rest of the session (every later layer inheriting the
  edit, with the gallery still reporting "Default" because it compares against the mutated preset).
  Deep-cloned now.
- **Preset thumbnails no longer freeze on an asset's fallback render.** The gallery's thumbnail
  memoization (added earlier this cycle) keyed on `(params, layerType)` alone, justified as "a pure
  function of its inputs". That was wrong: `text` draws built-in stroke letterforms until a Google
  face finishes downloading, and the picture algorithms draw a procedural sphere until `imageSrc`
  finishes decoding — and the params (hence the key) are identical before and after the asset
  lands. A user-saved preset on a web font would therefore show generic monoline letterforms for
  the whole session, and no amount of re-rendering could fix it. The key now carries
  `Vectura.ASSET_EPOCH`, which every async font/image load bumps, retiring the stale entries.
  Failed evaluations are also no longer cached (a transient error could pin a blank thumbnail).
- **`scripts/run-vitest.js` hardened after an adversarial review.** It (1) truncated CI logs to 64KB
  — `process.exit()` discards output still queued on a pipe, so the tail, including the summary,
  never reached the CI log; (2) counted occurrences of the RPC-timeout *string* rather than error
  blocks, so a real unhandled error riding alongside it could be swallowed; (3) failed *open* when
  vitest's "caught N unhandled errors" line was absent; and (4) accepted any text containing
  `Test Files … passed` as a summary, including a source line echoed in a stack trace. It now
  streams output (no truncation), and fails closed: it requires vitest's own error count to match
  the error blocks printed and every one of them to be the RPC timeout, and anchors the summary to
  its own line. Boundary pinned by 14 cases in `tests/unit/run-vitest-wrapper.test.js`.

### Added
- **A regression net for the curve system, which had none.** The existing 33 SVG baselines call
  `Algorithms[type].generate()` directly with `smoothing: 0, simplify: 0` hardcoded and serialize
  through a hand-rolled copy of the exporter in `tests/helpers/svg.js` that only emits cubics on
  `meta.forceCurves` and has no quadratic branch at all — so **not one of them contained a single
  curve command**, and the entire curve/smoothing/simplify system was invisible to the suite.
  `tests/visual/curve-baseline.test.js` drives the real path instead — `engine.addLayer` (so the
  true default cascade runs) → `engine.generate` (so the display pipeline runs) → the production
  `shapeToSvg` — and snapshots 10 algorithms with Curves off, Curves on, and Curves + Smoothing.
  It immediately pinned three findings the old net could not see: the Curves toggle emits
  **byte-identical** output on Spiralizer, Type, and Shape Pack (a dead switch, now held by a
  ratchet test that must only ever shrink); the draw-time quadratic that "Curves ON" actually
  performs on 2D algorithms nearly **doubles exported file size** (Rings 120 KB → 226 KB) while
  the real Bézier fit used by Raster-Plane *shrinks* it (63 KB → 54 KB); and the Smoothing slider
  is inert whenever Curves is on for those same 2D algorithms (a 3-byte diff across its full range).
- **`tests/unit/curve-fit-loops.test.js`** pins why the coming shared curve fit needs no
  handle-length clamp: on the lopsided ring that `pattern.js`'s clamp exists for (one neighbour
  far, one near), unclamped Catmull-Rom balloons into a self-intersection, while the Schneider
  least-squares fit in `GeometryUtils.reduceAnchors` stays inside a 5-unit tube around the source
  polygon. The clamp is a Catmull-Rom pathology, not a general one.

### Fixed
- **Spiralizer: the Curves toggle now actually curves the spiral.** It was a dead switch — output
  was *byte-identical* with the toggle on and off. `spiralizer.js` never read `params.curves` at
  all, and stamped `meta.straight` on every path it emitted, including the wrap strands and the
  silhouette — which are point-samples of a smooth curve, not line segments. `meta.straight` is a
  hard veto on curve rendering in both the canvas renderer and the SVG exporter, so the toggle
  could not take effect even in principle; and because Spiralizer is flagged `is3d`, the UI routed
  the toggle to a full regenerate rather than a re-render, denying it even the draw-time fallback
  that 2D algorithms get. It now mirrors Raster-Plane's `curveSurfacePath`, the working model: the
  toggle is the master enable and floors the bézier tension so Curves-ON curves visibly even at
  Smoothing 0, with Smoothing tuning it from there. The strands and silhouette emit true cubics
  (209 `L` commands become 209 `C` on the canonical baseline); the DNA rungs and marker glyphs stay
  straight, because those really are line segments.
- **The Simplify slider no longer destroys curves.** Both simplifiers call `stripCurveMeta`,
  which drops `meta.anchors` — and the display pass in `engine.generate()` ran them over every
  path. Any layer whose true geometry lives in its handles (text glyphs, morph rings, curve
  shapes) was therefore degraded to the faceted polyline it was cached as, the moment Simplify
  left zero: a Type layer with Curves on lost every glyph bezier at `simplify: 0.5`. The point
  array is only a flattened cache and the handle list is already the compact representation, so
  there was never anything to win. The export-side `linesimplify` step had always guarded this;
  the display pass now does too, and still decimates handle-less polylines exactly as before.
- **Spiralizer: the Smoothing slider was 100x under-scaled and did nothing.** `spiralizer.js`
  passed `smoothing` — the universal Post-Processing Lab slider, domain 0..1 — straight into
  `Geometry3D.smoothToBezier`, whose `amount` is on a 0..100 scale. At the slider's maximum the
  resulting Catmull-Rom tension was 0.01, so the emitted handles were a fraction of a millimetre
  long: mathematically present, visually nothing, and the strands stayed faceted wherever the
  user dragged it. Converted at the call site — handle length relative to sample spacing goes
  from 0.007 to 0.73, and the renderer now takes its native-cubic branch. (The *Curves* toggle
  is separately inert on Spiralizer — it stamps `meta.straight` on its strands, which vetoes
  curves outright. That is tracked as its own fix.)
- **Raster-Plane: See-Through now makes the planes see-through instead of deleting them.** With
  Lines as Planes on, ticking See-Through fell back to the plain stacked-wire branch — the
  vertical slices disappeared entirely and only the top profiles were left. See-Through is a
  hidden-line *style*, not a geometry switch: the slices (tops, floors, side risers, thickness
  edges) are now built and occluded exactly as they are with See-Through off, and the spans that
  other slices hide are drawn as dashed hidden lines rather than removed — the x-ray view, showing
  where each plane stands behind the solid. Applies to both the solid slab (Plane Width 100) and
  the free-standing cardboard slices, so Plane Width — previously a dead control under
  See-Through — is live there too, as is Occlusion Bias (now surfaced in the panel, since the
  floating-horizon pass it tunes runs on this path).
- **CI: vitest runs go through `scripts/run-vitest.js`, which tolerates one upstream bug.** Vitest's
  workers talk to the parent over birpc, whose RPC timeout is a hard-coded 60s with no config
  knob. On GitHub's shared runners this suite's heavy jsdom mounts push an `onTaskUpdate` ack
  past that window, the worker throws `[vitest-worker]: Timeout calling onTaskUpdate`, and vitest
  counts it as an unhandled error and exits non-zero — with a 100% green suite (it failed this
  way at 1201/1201 and 3847/3847 tests passing). Nothing eliminated it: fewer forks, removing the
  console flood off the RPC wire, sharding the run, and scoping coverage all failed to, and it
  fires in the integration job too, which has no instrumentation at all; the threads pool would
  sidestep the transport entirely but segfaults V8 with jsdom. So the wrapper retries once and
  then passes **only** if zero tests failed and that RPC timeout is the sole unhandled error. Any
  failing test, any other unhandled error, or a crash with no summary still fails the build —
  pinned by `tests/unit/run-vitest-wrapper.test.js`. It deliberately does not use vitest's
  `dangerouslyIgnoreUnhandledErrors`, which would blanket-ignore real errors too.
- **CI: coverage was instrumenting the entire repo.** The `coverage` block in `vitest.config.mjs`
  sat as a *sibling* of `test`, where vitest never reads it — so its `include: ['src/**/*.js']` and
  `exclude: ['src/vendor/**']` silently did nothing, and v8 instrumented build scripts,
  `playwright.config.js` and the minified vendor bundles (coverage-range-mapping the 171KB
  single-line `opentype.min.js` on every run). Moved under `test`; as a side effect the configured
  `lcov` reporter now actually runs for the first time.
- **Dropped a dangling source map reference from the vendored opentype build.**
  `src/vendor/opentype.min.js` ended with `//# sourceMappingURL=opentype.min.js.map`, but that
  map is not shipped — so Vite retried a failing ENOENT read in the parent process on every
  transform of it.
- **Panel rebuilds no longer re-run every preset's algorithm.** The preset gallery drew each
  option's thumbnail by evaluating that preset's geometry, with nothing cached — so every
  `buildControls()` re-ran the full algorithm once per preset (for Raster-Plane: a 3D mesh +
  hidden-line removal + a noise raster render, each time). Thumbnail geometry is a pure
  function of `(params, layerType)`, so it is now memoized, keyed on the params themselves
  (an edited preset re-evaluates rather than showing a stale thumbnail).
- **Raster-Plane stopped re-rendering its built-in relief on every regen.** `sampleBuiltIn` is a
  pure function of `(u, v)` — no seed, no params — yet the 384x384 procedural source raster
  (147k exp/sin/cos samples, ~950ms) was rebuilt from scratch on every `generate()` of a layer
  using the default built-in source. Now cached per resolution.
- **CI: the test suite no longer fails with every test passing.** Two infrastructure bugs, both of
  which failed the run while reporting 100% of tests green. (1) `hookTimeout` was left at
  vitest's 10s default while `testTimeout` was raised to 60s for CI slowness — hooks do not
  inherit it, so full-stack mounts done in `beforeEach` aborted with "Hook timed out". (2) The
  jsdom runtime stubbed canvas drawing but not canvas export, so `toDataURL` hit jsdom's
  backend-less implementation and emitted a stack-trace-bearing "Not implemented" error 2,344
  times; vitest ships every console call to the parent over birpc, and the flood plus the
  preset-thumbnail CPU above starved the RPC until it blew birpc's 60s timeout
  ("[vitest-worker]: Timeout calling onTaskUpdate").

### Added
- **3D rotation gizmo: three axes on every 3D algorithm, no backing disc, new palette.**
  Polyhedron and Raster-Plane gained real Rotate Z (`roll`) support — wired through the
  shared Geometry3D view (applied after yaw/pitch, so depth ordering and occlusion are
  unaffected), exposed as a View → Rotate Z slider, and driven by the gizmo's outer roll
  ring, which both algorithms previously lacked. The gizmo itself no longer paints the
  circular underlay disc behind the rings (it sat as a visual blob over the artwork in
  both themes), and the axis rings moved off the standard red/green/blue to an
  amber (X) / violet (Y) / cyan (Z) palette — red/green rings clashed with common pen
  colors and collapsed for red-green color-blind users. Skin tokens
  (`--render-gizmo-x/y/z`) updated across all six skins; help copy names the new
  ring colors.
- **Compass-heading controls are radial dials, not linear sliders.** Every parameter that's
  conceptually a direction/orientation rather than a magnitude now mounts `UI.AngleDial`
  instead of a `type:'range'` slider: `gridAngle` (halftone/Dotscreen "Screen Angle"),
  `hatchAngle` (shared across terrain/spiralizer/polyhedron/topoform/rasterPlane),
  `lineAngle` (imageWeave), `horizontalLineAngle`/`topographyAngle`/`barRotate`
  (rasterPlane per-mode), `barkWeaveAngle` (rings bark woven), `penAngle` (spirograph),
  `dotSpin` (halftone, now consistent with its sibling `dotSpinDir`), the Petalis Shading
  stack's "Hatch Angle" (both the panel and the inline Petal Designer surface), and
  Auto-Colorize's "Angle Offset" (Spiral Sweep + Angle Slice modes). Required the
  `UI.AngleDial` min/max domain fix above — every one of these controls has a non-`[0,360]`
  domain (e.g. `-90..90`, `-180..180`) that the dial would previously have corrupted.
- **Raster-Plane: Map Type ‘Normal’ now performs real normal-map height reconstruction.**
  Previously the Normal map type was a placeholder that differenced the raster's luminance
  against the built-in procedural relief — meaningless for an actual tangent-space normal
  map. The sampler now decodes each texel's normal (RGB → nx/ny/nz, with a quantization
  dead-zone so flat maps stay flat and nz clamped away from zero), converts it to a slope
  field, integrates it scanline-wise into a Float32 height grid, normalizes to [0,1], and
  bilinearly samples that grid as the base height. Reconstructed grids are cached (bounded,
  content-keyed) per source raster. Convention: positive red tilts the surface uphill along
  +x; `Flip Normal Y` is now solely the green-channel sign flip in Normal mode (for maps
  authored with the opposite green convention) — in Height mode it keeps its legacy meaning
  as a v-axis flip. Non-raster sources (fixture grids, the image-pipeline path, the built-in
  relief) fall back to the plain height path in Normal mode.
- **Every parameter control now speaks one language: the shared component library.** The
  hand-rolled sliders, angle dials, and switch toggles across the app's biggest surfaces —
  the algorithm parameter panel, mirror panel (24 sliders), noise rack, fill/paint-bucket
  surfaces, align-spacing, export optimization steps, and all 53 Petal Designer sliders —
  were migrated onto `UI.Slider`, `UI.AngleDial`, and `UI.SwToggle`. Every slider gains an
  **inline-editable value chip** (click, type, Enter), a **double-click reset to default**,
  the gradient track fill + release-halo motion, and unit-aware chips (mm/%/°); every angle
  dial gains **keyboard operation** (arrows ±1, Shift ×10, Home) and **touch support**;
  every toggle gains Space/Enter keyboard handling with proper `aria-checked`. Foundation:
  `UI.Slider` grew `defaultValue`/`format`/`parse` props and `UI.AngleDial` grew dial
  keyboard + `defaultValue` so panels migrated without losing any legacy behavior (undo
  history still pushes exactly once per drag gesture; live-preview params still regen per
  input frame). Known intentional exclusions: the hand-rolled dual-range control (shared
  dual mode has no skin CSS yet) and the harmonograph plotter reveal ranges.
- **Native browser dialogs are gone; file actions now toast.** A new skinned
  `UI.overlays.Prompt` (text-input dialog: Enter confirms, Esc cancels, focus+select on
  open, Promise-based) replaces every `window.prompt`/`alert` in the Petal Designer export
  and harmonograph preset gallery flows; the heavy-computation guard (flowfield density/max
  steps) uses `UI.overlays.Dialog` instead of `window.confirm`. Saving a project, exporting
  SVG (with path count — "Exported vectura.svg — 1,197 paths"), and failed opens/imports
  now surface as toasts. Canceling the preset-import name prompt now aborts the import
  instead of silently proceeding with a default name.
- **Seed rerolls are a dice.** The global seed's text "RANDOMIZE" button and the per-noise
  randomize button now use the same ⚄ dice affordance as the wallpaper "surprise me" button,
  with a button-pulse on reroll. (The ✦ sparkle on "Randomize params" is intentionally
  distinct — it mutates all parameters, not just the seed.)
- **Raster-Plane: solid Lines-as-Planes rendering + Plane Width slider.** Lines as Planes with
  See-Through OFF now renders as a true extruded solid: back-facing side risers are culled
  instead of "peeking through" as floating corner ticks, the space between adjacent slices
  occludes as solid material (inter-row surface strips + side quads, band-inset so tops never
  z-fight their own occluders at low Occlusion Bias), the block's side silhouettes draw as
  clean edge-profile bridges, and front-facing side faces skip hidden-line removal entirely
  (orthographic side faces are never occluded — kills mid-air "whisker" clipping). A new
  **Plane Width** slider (1–100%, shown when Lines as Planes is on) shrinks each slice from
  the touching solid slab (100%) into free-standing extruded planes with real gaps between
  rows — thickness facets and back edges render per slice — down to flat single-curtain
  planes at 1% (near-coincident face pairs collapse so plotters never double-ink). The
  floating-horizon output is also decimated to drop exactly-collinear resampled points
  (crater preset: ~21k → ~7k points, geometry-identical). Covered by
  `tests/unit/raster-plane-plane-width.test.js`.

### Fixed
- **Terrain: hidden lines are clipped exactly at the silhouette (Occlusion Bias 0).** Terrain feeds
  the *same* floating-horizon occluder as Raster-Plane, where `eps` is a screen-space slack margin —
  so its shipped `0.5` let farther rows draw *inside* the ridge in front of them. Measured through
  the app path: whiskers up to **12.8px** long as shipped (23.3px on a dense grid), ~1.6% of all ink
  sitting inside geometry it should have been behind; **0** at zero slack. The code's own comment
  claimed the bias "stops adjacent rows z-fighting" — that is measurably false: a row is only ever
  tested against strictly *nearer* rows and its own band is degenerate, so terrain cannot occlude
  itself. Zeroing costs no ink beyond the protruding ink itself (−1.7%, of which ~85% *is* the
  whiskers) with no stipple, no collapse, no shattered runs. New `tests/helpers/floating-horizon-oracle.js`
  rebuilds the pass's own band *continuously* (no rasterisation, no tolerance band) and measures ink
  length **inside** it; it mutation-tests itself against the historical 0.5 and a gross 3.0, and its
  sensitivity floor (0.02–0.05px) is recorded in the test. First SVG baseline for the free-3d pose —
  the only mode that reaches this code, and it had none.
- **Factory presets stop pinning junk for modes they are not in.** Terrain's preset pinned
  `vpLeftX: 0 / vpRightX: 100` — the two-point vanishing points — while shipping `free-3d`, where
  they are invisible and inert. The moment a user switched to Two-point they got VPs on the canvas
  edges, which makes both `lerp`s constant in depth: the trapezoid collapsed to a rectangle and
  two-point perspective had **zero horizontal convergence** (far/near width ratio 1.000, one distinct
  row width). With the curated 20/80 restored: ratio 0.600, 33 distinct widths. Same signature found
  and removed in `spiralizer` (`sphereRadius` pinned while shipping `helix`), and `terrain`'s
  `depthCompression` pin removed — it is read only by the three pinhole modes, so its gate was
  narrowed from "not orthographic" to those, retiring a control that rendered dead in two of six
  modes. All verified behaviour-preserving for the shipped look (seed pinned — terrain is stochastic,
  and an unpinned A/B compares two different mountains). New generic guard in
  `tests/integration/factory-preset-inactive-mode-pins.test.js`: **no factory preset may pin a value
  for a parameter its own `showIf` gate hides.** It names no algorithm and no value, so a preset
  freezing hidden junk fails on arrival.

### Added
- **Parameters moved off their default are marked in the panel, and one click resets them.** A
  value can be set without the user ever touching it — the factory preset carries it, a mode
  cascade seeds it on a toggle, or it rode in with a saved document — and nothing on screen
  distinguished a value somebody *chose* from one chosen *for* them. That is precisely why an
  Occlusion Bias of 1.5, seeded silently by ticking "Lines as Planes", could put hooks on every
  border with no reasonable way to suspect it. Every control whose value differs from what a
  brand-new layer of that type would have now carries a quiet dot ("Changed from the default
  (0). Click to reset."). Applied by wrapping the single `renderDef` funnel rather than
  annotating ~20 control branches, so controls added later are covered by construction. Factory
  state now has one definition, `Vectura.factoryParams(type)` (`src/core/layer.js`), replacing
  three copies that could drift. Covered by `tests/integration/control-modified-indicator.test.js`,
  whose central case is the one that hid the bug: a param a cascade changed behind the user's back.

### Changed
- **Factory presets now carry only what they deliberately override.** `user-presets/<type>/default.vectura`
  files are app-saved *full param dumps* — 50+ keys captured from whatever a live session had on
  screen — and `Layer` applies them ON TOP of `ALGO_DEFAULTS`, so the preset wins. That made **707
  config values dead letters**: editing `defaults.js` did nothing, which is exactly how a stale
  Occlusion Bias survived being "fixed" three times. The bundler now strips every key a
  `<type>-default` preset merely *restates*, leaving 38 deliberate overrides across 6 algorithms —
  printed at build time so they are auditable rather than buried. Byte-identical today (assigning a
  value that already equals the default is a no-op; verified across 1216 params in all 29
  algorithms), but from here on `defaults.js` actually reaches the app. Named artworks that double
  as a factory default (`wavetable-rolling-hills`) are exempt — an artwork must stay a
  self-contained snapshot. `CLAUDE.md` corrected: it claimed these markers are "never stored as
  files"; 20 are, and the bundler's own docstring says the file wins.
- **New guard at the app path** (`tests/integration/raster-plane-app-path-occlusion.test.js`).
  Every other test of the occlusion behaviour calls `generate()` with a hand-written param object —
  which *supplies* the value it is testing, and so is structurally blind to `ALGO_DEFAULTS`, the
  factory preset, and the UI cascade. This one buys the layer the way a user does (addLayer → tick
  the real checkbox → regen) and asserts on the **output**, naming no parameter value. Two paths,
  because they see different origins: with the cascade (which pins the mode-critical params, so it
  is the last word) and without it (a saved doc or a preset shipping planes already on — the only
  path where a bad `ALGO_DEFAULTS` or preset can still bite). Mutation-proven one origin at a time:
  poison `ALGO_DEFAULTS` → 3 fail, poison the preset → 3 fail, poison the cascade → 9 fail, clean →
  12 pass. It also mutation-tests **itself** (inject the historical 0.5; the suite must go red) —
  an assertion that immediately earned its place by catching the guard measuring nothing at all.
- **Raster-Plane "Lines as Planes" defaults to thin free-standing curtains, and stops seeding an
  Occlusion Bias.** Plane Width now defaults to `1` (was `100`) — free-standing slices are the
  look the mode exists for; a fused slab is what you get *without* it. More importantly, ticking
  the **Lines as Planes** checkbox used to cascade `depthBias = 1.5` — three times the old default
  and the single biggest source of the reported protrusions, since the bias *is* the slack the
  hidden-line pass grants a farther row before hiding it. At 1.5 every row punched over a pixel
  through the curtain in front of it (the `Crater` preset, which carried that seeded value,
  measured **925 breakthrough points, deepest 1.37px**). The cascade now seeds `planeWidth = 1`
  and `depthBias = 0`, and all five shipped Raster-Plane presets were zeroed to match: Crater now
  measures **0 breakthrough points**. Occlusion Bias remains on the slider for anyone who wants
  grazing lines deliberately kept whole. Stale cascade assertions in
  `raster-plane-planes-cascade.test.js` and `raster-plane-occlusion.test.js` updated to the new
  contract (coverage kept, not dropped).

### Fixed
- **Raster-Plane "Lines as Planes" clips exactly at the curtain border — no hooks, no hanging
  ends.** With See-Through OFF, every row leaked ink through the curtain standing in front of
  it: little hooks and whiskers at each border, worst at thin Plane Widths, up to half a pixel
  deep (measured across five heights: 158–400 breakthrough points each, deepest 0.50px). The
  cause was a default, not a miscalculation — **Occlusion Bias** shipped at `0.5`, and that
  number is exactly the slack the hidden-line pass grants a farther row before it agrees to
  hide it. Bias now defaults to `0` (clip exactly at the silhouette) in `ALGO_DEFAULTS`, in the
  algorithm's own fallback, and in the `rasterplane-default` preset a new layer actually loads;
  the slider remains for anyone who deliberately wants grazing lines kept whole. The slices are
  free-standing and each is only tested against strictly-nearer ones, so no bias was ever needed
  to stop them z-fighting (the solid-slab path has its own `inset` occluder for that, and is
  unaffected at zero bias). Two supporting changes, without which zeroing the bias merely swaps
  hooks for gaps: `occludeRowsFloatingHorizon` now **bisects the true visible/hidden crossing**
  instead of cutting at the last sample (a clipped line ended up to one sample short of the
  border — the hanging end), and its sampling stride is now decoupled from its occluder column
  pitch (`columnResolution`), letting the cardboard path rasterise its horizon 5× finer without
  paying for 5× the redundant sampling. Result across all five heights: breakthrough points
  1186 → **0**, deepest protrusion 0.50px → **0.00px**, hanging ends 351 → **0**, render time
  ~68ms → ~78ms. Bars, mesh and topography are byte-identical (they no longer read `depthBias`
  at all). Regression coverage: `tests/unit/raster-plane-plane-overlap.test.js`.
- **Left-aligned text never pushes its left side leftwards while typing.** Fit-to-frame
  text (the panel default) kept the whole block centred, so typing into a left-aligned fit
  layer re-centred it and shoved the left edge left on every keystroke. Left/right-aligned
  fit-to-frame text now pins its alignment cell edge to the matching FRAME edge and only
  rescales in place — new text extends away from the pinned edge. `justify-all` (base
  align left) now left-anchors like `justify-left` in absolute mode too. Centre align
  keeps the historical grow-both-ways behaviour.
- **Saved Default preset overrides now reapply to fresh layers.** The preset
  gallery correctly recognizes the factory state after Layer construction has
  merged the bundled Default preset, then applies a matching local Default
  override. This restores user-saved Pendula settings on rebuild instead of
  leaving raw `ALGO_DEFAULTS` values in place.
- **Welded script outlines: junction hooks/teeth and elbow S-wiggles removed.** Follow-up
  to the connected-script stability fix below, which introduced forced corners at glyph
  junctions: the bezier fit took its endpoint tangent at a forced corner from the single
  adjacent raw chord — clipper noise at a junction, so the cubic left the corner mis-aimed
  and (because fit error is only sampled at the sparse input points) an ~1mm hook/tooth was
  accepted between samples at every letter join. Forced-corner run endpoints now use a
  windowed chord over the run itself, clamped to the run's arc length. The weld's corner
  angle threshold also drops 75°→40°: junction corners and clipper vertex noise are handled
  by forceCorner + windowed tangents now, and 75° missed real outline elbows (the 's'
  bowl-to-exit turn), which the fit S-wiggled ~0.5mm trying to smooth through. Regression
  fixture: a real welded Dancing Script ring (`tests/fixtures/welded-script-ring.json`)
  asserting the whole fit stays within 0.4mm of the source boundary.
- **Typing in a connected-script web font no longer re-shapes earlier letters.** With
  Dancing Script (and any face whose letters touch), every keystroke visibly re-smoothed,
  re-faceted, or nudged the letters already typed. Two whole-string dependencies fixed:
  (1) the `mergeOverlaps` weld re-fit called `reduceAnchors` with tolerances relative to
  the welded ring's own bbox — a connected script welds the whole word into one ring, so
  each letter grew the tolerances and re-fit every earlier letter; the weld now passes
  absolute em-derived tolerances and marks the clipper's intersection vertices as forced
  corners (true tangent discontinuities), keeping each bezier fit run local to one glyph's
  boundary span. (2) Absolute-size point text vertically centred on the whole-string INK
  bbox, so the first ascender/descender typed nudged everything; the vertical anchor is now
  pinned to the first line's metric cap box — its midpoint is exactly the empty-box caret,
  so the first keystroke lands on the caret and Enter grows strictly downward (Illustrator
  point-type). One-time consequence: existing absolute-size text layers re-render with a
  small vertical shift, and welded webfont text gets a one-time outline re-fit.
- **`UI.AngleDial` corrupted every negative value on a non-`[0,360]` domain.** The widget
  had no concept of `min`/`max` — `setValue()` always force-wrapped into `[0, 360)`, so a
  descriptor like `min:-90,max:90` (e.g. `gridAngle`) would commit a negative drag/nudge as
  a large positive number (e.g. -30° → 330°), which the mount sites' `clamp(deg, min, max)`
  then silently collapsed to `max` — every negative value in the domain was unreachable.
  The widget now accepts optional `min`/`max` (default `0`/`360`, fully backward compatible)
  and folds input into the descriptor's real domain via a new `wrapToDomain()`: full-circle
  domains (`max - min >= 360`) use a plain modular fold (byte-identical to the old
  behavior); narrower domains (e.g. `-90..90`) saturate to the nearest valid edge when a
  drag/nudge lands in the dial's "back half" dead zone, instead of jumping to the wrong
  extreme. `aria-valuemin`/`aria-valuemax` now reflect the real domain. This was a
  prerequisite for converting any non-`[0,360]` angle control to the dial (see Added,
  below) — every one of them would otherwise have hit this corruption. Regression coverage
  in `tests/unit/components/angle-dial.test.js`,
  `tests/integration/algo-config-shared-controls.test.js`,
  `tests/integration/auto-colorize.test.js`, and
  `tests/integration/petal-designer-shared-sliders.test.js`.
- **Raster-Plane "Lines as Planes" hidden-line order now follows plan position.** The
  near→far ordering of slices/walls used the raw camera-space depth of each row's TOP
  surface, which mixes the content's height into depth under tilt: a taller-but-farther
  row could sort as "nearer", reach the floating-horizon pass out of order, and its lines
  were never tested against the truly nearer curtain — back rows broke through front
  walls (worst on narrow "cardboard" slices, Plane Width < 100). A new plan-position
  depth (`meanPlanDepth`) subtracts the height axis's camera-z contribution so occlusion
  order between parallel rows depends only on plan position; the front-wall pick, sort
  keys, and slab depths all follow. Depth-cue stamping (`meta.depth`) is unchanged.
- **Raster-Plane mesh + topography now perform true hidden-line removal with See-Through
  OFF.** The wire modes only ran a per-vertex back-face test, so front-facing geometry
  BEHIND a ridge — a valley floor, far contour rings — drew straight through the hill in
  front of it. The surviving visible runs are now additionally clipped against the surface
  itself: the same height sampler is meshed once per frame into screen-space depth
  triangles (capped 128/axis, preview-scaled) and every wire, contour, and hatch scan line
  is occlusion-tested through `G3.occludeSegmentsDepthBuffer`, with the Occlusion Bias
  param plus a slope-scaled bias so lines lying ON the surface keep their crest and
  silhouette runs whole (no stippled "acne"). Clipping happens before curve conversion, so
  the Curves toggle and contour smoothing behave exactly as before; See-Through ON output
  is byte-identical to the previous release. Covered by
  `tests/unit/raster-plane-mesh-hlr.test.js` (leak-through, see-through invariance,
  topography occlusion, anti-acne fragmentation guard).
- **Keyboard shortcuts no longer fire through open modals.** Window-level shortcuts
  (Delete, Cmd+Z, Cmd+K…) were reaching the engine while any dialog or modal was open —
  including the legacy settings/export/help overlay, where Delete could remove the very
  layer a pending confirm dialog was about to write to. Shortcuts now bail while any modal
  is open (`UI.overlays.Modal.anyOpen()` + legacy overlay check), and the heavy-computation
  confirm re-resolves its target layer by id at confirm time.
- **Distribute Spacing slider was invisible (0px wide).** `.align-btn { width:100% }` starved
  the slider's flex basis in the multi-selection panel; it now renders and drags.
- **Angle dial value chips clipped** ("180°" rendered as "18(") in the 290px left panel;
  chip input widened to fit three digits.
- Two toast calls used an unsupported `'error'` variant (unstyled); corrected to `'danger'`.
- **CI `coverage` job retries on a vitest worker-RPC timeout.** `v8` coverage instrumentation
  under CI's shared runner occasionally trips vitest's internal `birpc` "Timeout calling
  onTaskUpdate" — a worker-communication timeout, not a test failure (every suite still
  reports 100% passed when it occurs). No vitest config exposes that RPC timeout, so
  `.github/workflows/test.yml`'s coverage step now retries up to 3 times before failing.

### Changed
- **Raster-Plane: Map Blur now smooths every mode.** Map Blur previously only affected
  Topography (a post-tone box blur on its contour field); Relief Lines, Deformed Mesh, and
  Bars sampled the raw raster nearest-neighbour, so hard luminance steps projected as
  jagged square-wave profiles regardless of the slider. The blur now lives at the sampler:
  a deterministic 9-tap kernel (radius 0.35–9 texels of the active source, quadratic ramp)
  smooths the raw base height BEFORE the tone pipeline (map type/invert/gamma/contrast) and
  the noise-rack fold, for all four modes. Topography's duplicate field-level blur was
  removed so it no longer double-blurs, and the Map Blur control is un-gated from
  topography-only to all modes. Map Blur 0 remains byte-identical to no blur. Note: at the
  default Map Blur 18 the `raster-plane-canonical` and `raster-plane-topography` SVG
  baselines legitimately shift (lines gains blur for the first time; topography's blur
  moved pre-tone) — baseline refresh is a merge-review decision.
- Mirror-panel sliders now fill with the skin accent color rather than the per-mirror-type
  hue (consequence of the shared-component look; per-type tinting noted as a possible
  follow-up CSS hook).
- Petalis modifier/shading slider double-click now resets to the factory default for that
  control (was: slider minimum).
- **Illustrator-style measurement readouts, center points, and multi-corner rounding.**
  The smart-guide coordinate chip is now a compact light-gray, dark-text, two-line box (was a
  large single-line pink label): a live `dX/dY` **delta** while dragging an anchor, and `X/Y`
  **position** on hover/select, paired with a small pink feature label (`anchor`) pinned at the
  point — all rounded to **0.1 mm**. A new **center helper point** (blue diamond + pink `center`
  label + `X/Y` box) is revealed when hovering the center of *any* object, not just the
  selection. Both are gated by new Settings ▸ Guides & Display toggles — **Coordinate readout**
  and **Center point** (default on, persisted). In direct-select, selecting several corners and
  dragging one corner's rounding handle now rounds **all selected corners together** to the
  radius under the cursor (already-rounded corners snap to it); unselected corners are untouched
  (`beginShapeCornerDrag` scope `'selected'`, mapping selected anchors → shape vertices). Config
  in `src/config/smart-guides.js` (`chipPrecision: 1`, `labels.center`, `centerHitScreenPx`).
  Covered by `tests/integration/direct-drag-coordinate-readout.test.js` and
  `tests/integration/direct-select-multi-corner-round.test.js`.
- **Idle task bar gets an Add Layer dropdown; Draw gets a pen-nib icon.** A new pill sits left
  of Draw in the contextual task bar's idle state, matching the sidebar's Add Layer menu:
  Algorithm Layer (drill-down to the same grouped/iconed list as the module dropdown and
  algorithm switcher, via `Vectura.UI.utils.getDrawableAlgorithmOptions`/`renderAlgoMenuHTML`),
  Mirror Modifier Group, Morph Modifier Group, Empty Layer, and Empty Group — each wired to the
  same underlying engine/UI actions as the sidebar version (`addLayer`, `insertMirrorModifier`,
  `insertMorphModifier`, `addEmptyLayer`, `addGroupLayer`). The drill-down list swaps in place
  for the algorithm submenu (rather than the sidebar's hover-revealed side panel) so it doesn't
  clip inside the bar's scrollable flyout and works the same on touch. The Draw button now uses
  a pen-nib glyph instead of a pencil (it activates the pen tool), keeping its "Draw" text label.
  The dropdown also flips open upward instead of downward (rotating its caret to match) whenever
  the bar has more room above than below — evaluated on open, and re-evaluated live via the same
  `reanchor()`/drag-move hooks that already move the bar itself (`state.repositionOpenFlyout`),
  so it keeps pointing the right way while the bar is dragged or auto-repositions. The caret is
  kept correct even before the dropdown is ever opened (registered unconditionally, not just
  while open, so a hard refresh with the bar pinned near the bottom no longer shows a
  down-pointing caret that only fixes itself after the first click). Grabbing the drag handle no
  longer counts as an "outside click" that dismisses the open flyout, so the live re-flip is
  actually visible mid-drag. Covered by eight new `tests/integration/context-bar.test.js` cases.
- **Radial fill gets a draggable Centerpoint.** The Type panel's Fill tab now shows a
  **Centerpoint** XY pad — a twin of the existing Fill Offset pad — whenever the **radial**
  fill type is active. Dragging its knob (or arrow-keying it, or double-clicking to recenter)
  shifts the radial fill's origin off the region's bounds centre; a vertical slider sets the
  pad-edge radius. It writes `fillShiftX`/`fillShiftY` (new `fillShiftMax` for the radius),
  which the pattern engine already consumes as the radial centre offset
  (`pattern.js` `radialFill`: `cx = midX + shiftX`). The pad reveals/hides in step with the
  fill-type grid — shown only for radial. Covered by `tests/integration/text-panel.test.js`.

### Changed
- **The task bar's Simplify slider is now an anchor-reduction control with bounded travel.**
  It runs complex → simple (left → right), and the thumb starts at the complex end
  (the untouched original). Behind it, `simplifyBegin` precomputes a per-path *reduction
  ladder* — rung 0 is the original, and each higher rung is a strictly-lower anchor count
  fit with the fewest cubic beziers that still reproduce the shape (corners preserved).
  The slider's range is scaled to the deepest achievable rung, so it physically stops
  once no more endpoints can be removed: a triangle or rectangle (all hard corners) has
  nothing to simplify and the slider is disabled with a "nothing to simplify" note, while
  a 4-point gentle curve collapses toward 3 (or fewer) anchors with the silhouette held by
  the fitted beziers. The badge now reads "{pts} pts"; the wave icons were swapped so the
  left (complex) shows *More detail* and the right (simple) shows *Fewer points*.
- **"Show Properties panel" in the task bar's ⋯ menu is now a restore action.** The item only
  appears while the docked panel it targets (right pane; left pane for a text layer) is collapsed
  or resized narrower than its skin-default width. Choosing it restores the panel — un-collapsing
  it and, if shrunk, widening it back to the default (a user-widened pane keeps its custom width) —
  and fires the existing blue attention pulse. At full size the item is omitted from the menu.
- **The contextual task bar's algorithm switcher now matches the Add Layer submenu and the
  left-pane module dropdown** — same grouped list, section headers, and per-algorithm icon +
  palette color, including on the closed pill. All three now render from one shared pair of
  helpers, `Vectura.UI.utils.renderAlgoMenuHTML`/`getAlgoMenuIcon`/`getAlgoMenuColor`
  (`src/ui/utils.js`), so the list is defined once. Covered by
  `tests/integration/context-bar.test.js`.

## 1.2.41 - 2026-07-05

### Fixed
- **Topoform silhouette now tracks the plane controls.** In contour mode the
  `Plane Tilt` / `Plane Rotate` controls pre-rotate the mesh before the depth
  slicer cuts it, so the contour lines tilt with the planes — but the silhouette
  outline (and creases) were still projected from the raw, un-rotated mesh, so
  they floated off the tilted form. Both overlays are now built from the same
  plane-oriented vertices as the contours, so they move and reshape together.
  Wireframe / triangle-mesh modes (which ignore the plane controls) are
  unchanged, and the default view (tilt/rotate at 0) is byte-identical.

## 1.2.40 - 2026-07-05

### Added
- **On-canvas Type layers default to a vendored web font (Inter)**, parsed at boot and swapped in live
  the instant a text session begins, so a fresh Type-tool layer is editable with real letterforms
  instead of the stroke-font placeholder.
- **Per-pair manual kerning** (`kernPairs`): a sparse caret-indexed map, editable only with the caret
  between two letters, layered on top of the existing uniform `tracking`.
- **Outline Text action in the context bar** (hollow-T icon) converts a text layer to its
  filled/stroked contour.
- **Eyedropper sampling loupe** in the color picker and pen-picker popover: a magnified preview circle
  that follows the pointer while sampling a pen color.
- **`GeometryUtils.reduceAnchors`** re-traces a bezier-anchor contour into the minimal set of editable
  anchors that reproduces it within a sub-pixel tolerance — merges coincident seams, detects corners
  from handle tangents, and Schneider-fits each corner-to-corner run. Anchors carry a `corner` flag,
  threaded through the renderer's node overlay and preserved through engine anchor cloning.

### Fixed
- **Scissors-cut selection no longer silently re-closes.** An explicit `meta.closed === false` is now
  authoritative when the renderer parses a path's anchors; previously a closed ring cut at one anchor
  (coincident start/end points) got re-merged into a closed ring on the next selection refresh, undoing
  the cut.

## 1.2.39 - 2026-07-04

**Illustrator Parity — feedback pass.** Fifteen usability fixes from a review of the Phase-1–3
parity work, spanning selection, the contextual task bar, the edit-path tools, the menu system, and
per-pen stroke weight.

### Added
- **Every right-click and task-bar verb is now in the top menu.** A new **Object** menu (Edit Path,
  Flip Horizontal/Vertical, Isolate Group / Exit Isolation, Lock / Unlock All, Simplify…, Smooth…,
  Outline Text, Transform…) plus **Duplicate / Delete** in the Edit menu, each reusing the canvas
  context-menu verbs via new `CanvasContextMenu.runCommand()` / `getCommandStates()` (single source of
  wiring). Menu items gate on the live selection state.
- **Contextual Task Bar toggle in the View menu** (with a checkmark), in addition to Document Setup.
- **Point Type ↔ Area Type toggle** on the text task bar (drives `textEdit.convertTextMode`).
- **Progressive Smooth slider** (`PathEditOps.smoothBegin/Preview/Commit/Cancel`): the Smooth button
  now opens a live slider with **Done** and **Auto**. It **fits the fewest cubic bezier segments** to
  the path (Schneider curve fitting, `GeometryUtils.fitBezierAnchors`) within a tolerance the slider
  drives — so a dense 84-point polyline collapses to a handful of clean bezier anchors instead of one
  anchor per point or a stair-stepped line. **Sharp corners get a corner-radius fillet** (Illustrator
  "Smooth" on a polygon): each corner is replaced by a rounded arc (two setback anchors + a
  circular-arc cubic), the edges between stay straight, and the fillet radius grows with the slider
  until adjacent fillets meet (a hexagon rounds toward a circle). Fillets round INWARD — no ballooning
  or overshoot (handles are chord-clamped). Corner-less shapes (an ellipse) just get the minimal-anchor
  curve fit. The result is stamped `forceCurves`, so it renders AND exports as true cubic beziers
  (`M … C … Z`) even when the layer's Curves toggle is off.
- **Per-pen stroke weight textbox.** Each pen row now has an editable numeric weight field synced with
  its slider; the standalone stroke-weight task-bar entry was removed (weight is a pen property).

### Fixed
- **Shift/Cmd-click multi-select** now adds/removes objects (and a Shift-marquee unions into the
  selection); it's a discrete toggle that never arms an accidental move.
- **Isolate group** now scopes canvas hit-testing to the group: clicks outside are swallowed (Escape /
  breadcrumb exits), foreground foreign layers no longer shadow members, and nested descendants resolve
  to the immediate child.
- **Edit-path anchor verbs** (right of Smooth) enable/disable by the actual anchor selection — one
  anchor → Remove / Cut / Convert-Corner / Convert-Smooth; two open endpoints → Connect — and act on the
  correct anchors (new `PathEditOps.deleteAnchors`).
- **Task-bar drag handle** now follows the pointer live (was snapping only to the release point).
- **Text task-bar Font / Font Style** show a dropdown caret and open their picker anchored beneath the
  clicked chip (was appearing over the left panel).
- **"Show Properties panel"** (⋯ overflow) for text now focuses the Text panel and auto-hides the ABOUT
  block so more controls are visible.
- **Context-menu Flip Horizontal/Vertical** routes through `renderer.flipSelection` so the display and
  the Transform panel inputs both refresh (previously looked like a no-op).
- **Smart-guide measurement labels** ("midpoint", spacing chips) no longer drift to the top-left on
  HiDPI displays (reset to the devicePixelRatio base transform instead of identity).
- Task bar re-renders when the selected layer changes within the same kind (controls were staying bound
  to the previously-selected layer).

## 1.2.38 - 2026-07-03

**Illustrator Tools Parity — Phase 3 (final): transform numerics, text pickers, All Tools drawer,
right-click menu.** The last four lanes (J, K, L, M) merged and reconciled onto the Phase-2 bar,
completing the whole Illustrator-Parity effort across all 13 lanes. No AI tooling anywhere (hard
exclusion).

### Added
- **Numeric transform X / Y / W / H + Flip (Lane K — SEL-5/6, SG-6).** The Transform section now shows
  editable **X / Y / W / H** for manual shape/text selections (single or multi, combined bounds) with a
  **link W/H** proportional toggle; setting W resizes to that exact width about the bounding-box top-left,
  each edit is one undo step. **Flip Horizontal / Vertical** icon buttons sit beside rotate and route
  through the shared `PathEditOps.flipLayers` op (one undo, flip-twice restores). With the
  Direct-Selection tool and exactly one anchor selected, X / Y repurpose to that anchor's world position
  ("Anchor X/Y") and move the anchor live. Renderer gains `getTransformPanelModel` /
  `getSelectedAnchorState` / `applySelectionBox` / `applySelectedAnchorPosition`; the panel self-mounts
  `#transform-bbox-controls` (config `src/config/transform-panel.js`).
- **Text hover-preview & size presets (Lane J — TXT-3/4/5).** The Text panel's font picker now **live-
  previews a family on hover** after a ≥150 ms dwell (no history push; dismiss/teardown revert to the
  committed face; click commits with a clean single-step undo), fetches web faces only on settled hover
  (zero eager webfont fetches on open), adds a filter **clear (×)** affordance, and replaces the size
  scrub-cycle with a real **size-preset dropdown** (6–72 mm). Config `src/config/text-ui-config.js`;
  exposes `Vectura.UI.TextPanel.openFontPicker()` / `openSizePresets()`.
- **All Tools drawer (Lane L — TLD-1/2).** A rail overflow **"…"** button opens a non-modal **All Tools**
  drawer listing every registered tool (grouped Select / Draw / Shapes / Type / Modify / Navigate) with a
  **grid/list** toggle (persisted). Clicking a tool activates it and updates the rail slot; hovering an
  entry **cross-highlights** the rail slot its tool lives in. Enumeration is derived from the real tool
  registry (drift-guarded). Config `src/config/tool-drawer.js`, shell `src/ui/shell/tool-drawer.js`.
- **Canvas right-click context menu (Lane M — CTX-1).** Right-clicking the canvas opens a menu of the
  existing verbs — Duplicate / Delete, Undo / Redo, Group / Ungroup / Isolate·Exit, Simplify… / Smooth /
  Flip H / Flip V, Transform▸ — each routing to the command the toolbar / shortcut / Task Bar already
  uses, with eligibility disabled-with-reason. Self-mounts to `#main-canvas` (no renderer edit). Config
  `src/config/context-menu.js`, shell `src/ui/shell/canvas-context-menu.js`.
- **Mixed-value indicators (Lane M — MSC-1).** A multi-selection with differing stroke weights blanks the
  weight field and shows a muted "mixed" placeholder (Stroke Options panel + Task Bar stroke sub-mode)
  instead of a misleading single value. Headless helper `Vectura.MixedValue` (config
  `src/config/mixed-values.js`).
- **Align centers (both axes) (Lane M — MSC-2).** A new compound **`alignCenterBoth`** align op snaps a
  multi-selection concentric in a single undo step, surfaced as a button in the docked Align panel and in
  the Task Bar's Align flyout.

### Reconciliations (integration)
- **Six new module tags** wired into `index.html` in load order (`transform-panel`, `text-ui-config`,
  `tool-drawer`, `context-menu`, `mixed-values` config; `tool-drawer`, `canvas-context-menu` shell) at
  `?v=1.2.38`.
- **MSC-2 surfacing.** The `alignCenterBoth` op (Lane M) is wired into its live controls: an align-panel
  button (`index.html` + `multi-selection-panel.js` `ALIGN_OPS` + `icons.js`) and a Task Bar align-flyout
  action (`src/config/context-bar.js`).
- **Task Bar Smooth fix.** The bar's **Smooth** button was a pre-existing no-op — `doSmooth` called
  `smoothSelection` with no strength (which clamps to 0 and early-returns). It now passes a config-driven
  default strength (`Vectura.CONTEXT_MENU.smoothStrength`, 0.5) and lets the op own its single
  push-before-change history (one undo step).
- **Task Bar text pickers.** The bar's family/style chips now open Lane J's real inline **font picker**
  and the size field's caret opens the **size presets** (`Vectura.UI.TextPanel.openFontPicker` /
  `openSizePresets`), feature-detected in addition to the existing wayfinding pulse.
- **Preference round-trip.** `toolDrawerView` (grid|list) folds into
  `App.getPreferenceSnapshot`/`applyPreferenceSnapshot` (mirroring `contextBar`/`contextualHints`).
- **Playwright.** `tests/e2e/tool-drawer.spec.js` registered in the desktop-chromium project + `test:e2e`.

### Deferred
- Rotated-layer object-frame W/H (`PRH-020`), a real clipboard subsystem for the context menu (`PRH-021`),
  and Text-specimen kick-loop bounding (`PRH-022`).

## 1.2.37 - 2026-07-03

**Illustrator Tools Parity — Phase 2: Contextual Task Bar.** Three lanes (bar framework, sub-modes +
shape properties, isolation breadcrumb) merged and reconciled onto the Phase-1 foundation. The
plotter-native engine APIs shipped in Phase 1 are now user-facing: a floating contextual toolbar surfaces
the right actions for the current selection, and double-clicking into a group shows an isolation
breadcrumb. No AI tooling anywhere (hard exclusion).

### Added
- **Contextual Task Bar framework (Lane G — TB-1…8).** A floating pill (`.ctxbar`, mounted into
  `#viewport-container`) anchors just below the current selection, flips above near the viewport bottom,
  clamps to the viewport, and yields to the tool rail. It hides during canvas drag, drawing, and text-caret
  edits. Per selection kind it renders a tailored action set:
  - **Idle** — Draw + Document Setup.
  - **Single path** — Edit Path, pen chip, stroke weight, shape properties (live rect/poly), lock.
  - **Multi** — Group, Align flyout (reuses the docked align buttons for byte-identical geometry), pen,
    stroke. **Group** — Ungroup, Isolate group, pen, stroke.
  - **Direct** — Simplify, Smooth, and six anchor verbs (visible-but-disabled until an eligible anchor is
    selected). **Text** — family/style/size bound to the Text panel, Outline, pen.
  - A trailing **…** overflow menu (Show panel / Hide bar / Reset position / Pin position / Quick help),
    a drag handle (drag → pin), ARIA `role="toolbar"` with roving tabindex (never steals focus on
    appearance), and a `≤120ms` fade/slide with reduced-motion fallback. Toggle the whole bar under
    **Document Setup → Guides & Display** (default on). Copy/icons/timings live in the new
    `src/config/context-bar.js`.
- **Bar sub-modes & shape properties (Lane H — TB-9…11, SHP-1…3).** Inline sub-modes morph into the bar:
  **Stroke weight** (slider + steppers + document-unit field, with "Open Stroke Options" for the full
  popover) and **Simplify** (live `PathEditOps` preview, Auto-Smooth, points/percent badge; Done commits,
  Esc/click-away cancels). Selecting a live **rectangle or polygon** opens a **shape-properties popover**
  (corner type & radius for rects, side count 3–20 for polygons) that round-trips with the on-canvas
  corner widget as one undo step per gesture. New renderer plumbing
  (`getShapePropsState`/`beginShapePropsEdit`/`setShapeUniformCornerRadius`/`setShapeSides`/
  `endShapePropsEdit`) and a `vectura:isolation-changed` document event fired on enter/exit isolation.
  Strings/ranges in the new `src/config/shape-props.js`.
- **Isolation breadcrumb (Lane I — ISO-1…2).** Double-clicking into a group shows a breadcrumb strip
  (`.iso-breadcrumb`) across the top of the canvas: the ancestry chain from `Document` to the active
  group, with each ancestor crumb stepping out one isolation level, a back arrow to exit one level, and
  the root crumb to leave isolation entirely. A thin top-edge accent line (`.iso-edge-indicator`, fixed
  isolation blue) marks the isolated state. The breadcrumb updates immediately off the renderer's
  `vectura:isolation-changed` event. Strings/tokens in the new `src/config/breadcrumb.js`.

### Reconciliations (integration)
- **Preference round-trip.** `contextBarEnabled` + the `contextBar` position/pinned bag now fold into the
  canonical `App.getPreferenceSnapshot`/`applyPreferenceSnapshot` (and undo capture/apply), so the bar's
  enabled state and pinned position persist via `.vectura` files and cookie prefs (mirroring Lane F's
  `contextualHints`). Defaults added to `src/config/defaults.js`.
- **Isolation event ↔ breadcrumb.** Lane H's `vectura:isolation-changed` event drives Lane I's breadcrumb
  directly (verified by an integration test); the breadcrumb's rAF poll is retained only as a harmless,
  visibility-gated auto-mount fallback.
- **Z-index layering.** tool-bar (5) < context bar (35) < isolation breadcrumb (41) < edge indicator (42)
  < modals — no element occludes another or the tool rail.

### Deferred
- Full inline text **family/style pickers** in the bar's Text state → Phase 3 (Lane J, TXT-3…5); the bar
  currently opens/focuses the Text panel for wayfinding and edits size live.
- Simplify advanced-options gear (`PRH-019`).

## 1.2.36 - 2026-07-03

**Illustrator Tools Parity — Phase 1.** Six lanes (renderer interaction core, stroke model & options,
path-edit ops, pen picker, text outline, hint bar) merged and reconciled. These are the plotter-native
foundations the Phase-2 Contextual Task Bar surfaces; several engine APIs below are reachable now and
become fully user-facing in Phase 2. No AI tooling anywhere (hard exclusion).

### Added
- **Renderer interaction core (Lane A — SEL-1…4, SG-1…5).**
  - **SEL-1** — 8-handle selection box: the 4 existing corners plus 4 edge-midpoint handles for
    single-axis resize (Shift constrains proportions).
  - **SEL-2** — Alt/Option+drag now duplicates a **multi-selection** (not just a single layer); Escape
    mid-drag cancels leaving no copy; the whole duplicate commits as one undo step.
  - **SEL-3** — **Flip Horizontal / Flip Vertical** for the selection (single or multi), mirroring about
    the selection-bounds center; world-exact and self-inverse at any rotation; one undo step.
  - **SEL-4** — live measurement chips: hover shows `X / Y`, a move-drag shows relative `dX / dY`, all in
    document units (reuses the existing drag-tooltip surface).
  - **SG-1…5** — object-to-object smart guides that **extend** the existing guide/snap subsystem: edge/
    center alignment guides + snap against other objects, magenta semantic labels (`path` / `anchor` /
    `midpoint` / `endpoint`), anchor/endpoint snapping during object drags, equal-spacing hint chips, and
    a hover-highlight of the unselected path under the cursor. All behind `showGuides`/`snapGuides`.
    Guide vocabulary/tokens live in the new `src/config/smart-guides.js`; guides are overlay-only, never
    exported.
- **Stroke model & options (Lane B — STR-1…6).** The per-layer stroke model gains `lineJoin`,
  `miterLimit`, `dash {enabled, pattern}`, and `strokeAlign`, plus the full `lineCap`
  (`butt|round|projecting`) set — all serialized in `.vectura` (backward-compatible) and emitted as
  `stroke-linecap`/`stroke-linejoin`/`stroke-miterlimit`/`stroke-dasharray` on SVG export, with the live
  canvas matching the export. A reusable **Stroke Options** panel component (weight / cap / corner+limit
  / align / dashed-line editor) renders the full popover anatomy. Align Stroke offsets closed paths
  ±weight/2 via the robust closed-outline band machinery (open paths stay centered; a per-path collapse
  guard falls back to centered). A single `StrokeModel.setStrokeWeight` API drives weight edits without
  ever touching `penId` or the pen record.
- **Path-edit ops engine (Lane C — PTH-1…5).** New `window.Vectura.PathEditOps`: lossless Simplify
  preview/commit/cancel with live point counts, Auto-Smooth suggestion, one-shot Smooth, anchor verbs
  (convert-to-corner / convert-to-smooth / cut-at-anchors / join-endpoints) with eligibility predicates,
  and live-shape auto-expand (destructive verbs on a parametric rect/polygon expand it to a plain path
  and fire a `vectura:shape-expanded` event → HUD-3 toast). Also hosts the SEL-3 `flipLayers` geometry op.
- **Pen Picker popover (Lane D — COL-1…4).** New anchored Pen Picker popover (`Pens` + `New Pen` tabs)
  translating the video's Swatches/Mixer to Vectura's document-pen model: click a pen to apply it
  instantly, or mix a color + width + name and Add Pen. A shared `PensPanel.assignPenToLayers` helper
  writes the `penId`/`color`/`strokeWidth` triple (never a bare color), a mixed-pen `?` chip state, and
  an optional eyedropper that samples/creates a matching pen. The popover and docked Pens panel share
  `SETTINGS.pens` as a single source of truth.
- **Outline Text (Lane E — TXT-1…2).** `window.Vectura.TextOutlineOps.outlineText(layerId)` replaces a
  Text layer with a group of per-glyph static path layers (named for each character), reusing the exact
  rendered glyph outlines; one undo step restores the editable Text layer. Glyph layers are ordinary
  shapes — movable, simplifiable, mask-capable — and double-click isolation drills into the group.
- **Hint bar & HUD (Lane F — HUD-1…4).** The generic header `READY` text is replaced by a bottom
  workspace strip:
  - **HUD-1** — a per-tool contextual hint line (up to 3 `|`-separated segments, each with a bolded
    keyword). All copy is config-driven in `src/config/hints.js`; the hint text clears while a canvas drag
    is in progress and restores on release.
  - **HUD-2** — live active-tool name, zoom %, and canvas rotation readouts (text only).
  - **HUD-3** — a transient top-center canvas toast pill (`Vectura.UI.toast(message)`), ~2s auto-dismiss,
    reduced-motion aware; subscribes to `vectura:shape-expanded` (Lane C / PTH-5).
  - **HUD-4** — a **Contextual hints** checkbox in Document Setup → Guides & Display (default ON) gating
    the hint text only; tool/zoom/rotation readouts always show.

### Fixed / Integration reconciliations
- **Flip seam (SEL-3, one undo step).** The renderer flip wrapper and the `flipLayers` geometry op each
  pushed history, so a flip took two undo steps and the wrapper mis-read the op's `{changed}` return as a
  boolean. The op is now the sole owner of the single history checkpoint (the wrapper threads the app
  through and reads `res.changed`). New composed regression asserts a selection flip is exactly one undo
  step end-to-end.
- **Contextual-hints persistence.** `SETTINGS.contextualHints` is folded into the canonical App
  preference snapshot (`getPreferenceSnapshot`/`applyPreferenceSnapshot` + `captureState`/`applyState`),
  so it round-trips via `.vectura` files and cookie-backed prefs alongside `showGuides`/`snapGuides`; the
  hint bar's standalone `localStorage` fallback was retired.

### Notes
- Deferred to **Phase 2**: the docked mount of the Stroke Options panel and the Pen Picker chip land in
  the Task Bar (TB-10 / TB-4/5/7); both components are reachable and tested now. Pen-Picker popover e2e is
  deferred until it is mounted by the Task Bar.
- New hardening items logged: PRH-014 (welded-kern glyph split), PRH-015 (hint-bar rAF idle bail-out),
  PRH-016 (arrowhead stroke rows), PRH-017 (width-profile control), PRH-018 (Pen-Picker MRU ordering).

## 1.2.35 - 2026-07-03

### Fixed
- **Banded bold: silhouette notches eliminated (and a 6× cold-render win).** The ~0.1 mm nicks visible along
  bold letterform edges were in the band boundary itself, present since `strokeRingsToBand` was born: join
  disks were sampled as 8-gons, and at Bold radii an 8-gon chord dips `R·(1−cos π/8) ≈ 0.076·R` inside the
  true circle — one notch at every gentle convex skeleton vertex (boundary = quad edge → chord → quad edge).
  The band build now sizes its join-disk sampling adaptively so the chord sagitta stays under the simplify
  tolerance (~0.02 mm). Side effect: the smoother boundary erodes far more cleanly — polygon-clipping stops
  thrashing through crash-retries — so cold Bold rendering dropped ~6× (e.g. three fresh glyphs 1.25 s → 0.22 s)
  and near-collapse crumb slivers vanished from the output.

## 1.2.34 - 2026-07-03

### Fixed
- **Banded bold: junction-pocket residuals driven to the noise floor.** Jay's observation that the band region
  is itself a pen-disk sweep — so a union of R-disks has NO point a pen ≤ R cannot reach, sharp weld corners
  included — reframed the remaining sub-0.4 mm coverage residuals as pure discretization, not "plotting
  physics". Two fixes: the erosion sliver filter is now shape-aware (roundness 4πA/P² keeps small compact
  junction-pocket rings — real coverage — down to 1/16 of the old flat area floor, while still dropping hair
  crumbs), and the erosion cut's join disks sample at 16 sides (corner-arc sagitta < 2% of the inset; cheap
  because gentle curvature already skips its joins). True pen-coverage sweep a–z: 22/26 glyphs at exactly
  0.00% uncovered; the other four carry only ≤0.09 mm probe-noise-floor whiskers at one junction pocket each.
  Coverage regression test now also runs the 'u' spur (the glyph whose pocket ring the flat floor dropped).

## 1.2.33 - 2026-07-02

### Fixed
- **Banded bold: in-app hollow bands, silhouette bumps, and bare spines.** In-app review showed heavy built-in
  weights rendering hollow and lumpy; four root causes fixed, each verified by true pen-coverage sampling
  (a–z sweep; 20/26 glyphs 0.00% uncovered, worst residual 0.4 mm only at needle-acute junction-pocket tips)
  and re-inspection in the running app:
  - **Erosion pass loss** — one polygon-clipping failure on a dense curvy boundary silently truncated every
    deeper concentric pass (a ~0.9 mm white ring inside the band). `insetMultiPolygon` now escalates through
    RDP-simplified cut boundaries, and text.js retries each depth single-shot from the clean base band before
    concluding collapse.
  - **Silhouette bumps** — `joinSkipAngle`'s skipped join disks left un-swept needle wedges reaching the band
    edge; a round-capped pen drew each as a nub on the letterform. Sweep quads now extend longitudinally to
    cover the skipped corner wedge.
  - **Bare spine** — junction pockets deeper than the uniform half-width fooled the coverage bookkeeping into
    skipping the closing pass, leaving the bowl's medial strip uncovered. Coverage is now tracked from the
    deepest UNIFORM-reliable pass, with an exact closing contour at (bandW−penW)/2; skeleton strokes are the
    last-resort fallback only (they slash across junction-pocket rings).
  - **Real pen width** — the engine's generate() bounds never carried `penWidth`, silently pinning every
    in-app band to the 0.35 mm fallback. The layer's assigned pen (or the first pen) now flows into bounds,
    and a committed pen-width change regenerates text layers instead of only repainting.
- **Test hardening.** The scanline "gapless" check had a blind spot (a missing pass read as a counter
  crossing); replaced with true pen-coverage sampling over the reconstructed band region, plus an engine-level
  penWidth-in-bounds regression. Two stale path-count assertions updated to ink-based metrics (the stitched
  snake changed the path-count contract, not the ink contract).

## 1.2.32 - 2026-07-02

### Changed
- **Type fills now offer the exact same controls as the Paint Bucket tool.** The Text panel's Fill tab used to
  hand-roll a five-option subset (Hatch / Spiral / Dots / Stripe / Cross-Hatch) with a single density slider. It
  now renders the **same variant grid and per-variant parameters the paint bucket exposes** — all twelve fill
  types (Hatch, Wave, Dots, Contour, Spiral, Radial, Polygonal, Truchet, Maze, Stripes, Weave, plus None) with
  their full parameter sets (amplitude, dot shape/pattern/size/rotation/jitter, line count, sides, poly tiling,
  wave smoothing/frequency, spiral tightness/direction, radial skip, contour direction/variance/simplify/center
  padding, and the Truchet/Maze/Stripes/Weave controls). Every fill type and parameter matches the bucket because
  both surfaces now render from **one shared module**, `Vectura.UI.FillControlSurface`
  (`src/ui/fill-control-surface.js`), rather than duplicating the control logic. The engine path was already
  shared (`text.js → PaintBucketOps.buildFillRecord → AlgorithmRegistry._generatePatternFillPaths`); this closes
  the UI gap so the same knobs drive the same fill code.
- The text-specific main **Angle** dial (0°-up convention — see the −90° note in `text.js`), the **Fill Offset**
  pad, and the **Inset** control stay as bespoke Text-panel controls (excluded from the shared surface) because
  they own placement roles the paint bucket handles via padding/shift. The shared surface's own per-variant
  angles (stripe, weave, poly, dot rotation) come through unchanged and match the bucket.

### Internal
- Extracted the variant grid + per-variant control rendering out of `src/ui/panels/paint-bucket-panel.js` into
  the shared `Vectura.UI.FillControlSurface.mount({ gridEl, controlsEl, params, typeKey, exclude, idPrefix,
  onEdit, onChange })`. The paint bucket panel now mounts the surface (`onChange → persistAndRedraw`) and keeps
  only its surrounding chrome (scope, pens, sensitivity, status chip, expand) and the fill-record ↔ params
  mapping; the Text panel mounts it with `typeKey: 'fillType'` and a namespaced id prefix so both can coexist.

## 1.2.31 - 2026-07-02

### Changed
- **Google Fonts picker is ordered by popularity.** The web-font catalogue now sorts by real Google Fonts usage
  (Roboto, Open Sans, Lato, Montserrat, Oswald, … first) with an alphabetical tail for everything else, applied
  to both the cached and the freshly-fetched catalogue (`src/core/google-fonts.js`). The **Built-in single-stroke**
  section moves below Google Fonts in the font picker so web faces lead.
- **Text layer hidden from the generic Add-Layer flow.** The `text` layer type is marked `hidden` in
  `ALGO_DEFAULTS`; the on-canvas Type tool remains its entry point.

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
