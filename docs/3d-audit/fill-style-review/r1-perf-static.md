# R1 — Object 3D fill Type / Fill Style performance (lens b-static)

Auditor: read-only. No repo file was changed. Branch `main` @ e609338c.
Method: code tracing, plus a headless measurement of the **real product path**
(the JSDOM runtime from `tests/helpers/load-vectura-runtime.js`; `new VectorEngine()`;
`engine.addLayer('scene3d')`, which builds a scene TREE exactly as the app does).
Scripts: `fillstyle-audit/bench.js`, `prof.js`, `profsum.js`, `rotbench.js`.
Raw data: `laws-sphere-hatch.tsv`, `laws-box-hatch.tsv`, `mappers-*.txt`,
`prof-*/` (V8 CPU profiles). Absolute times are from Node with other processes on
the machine, so read them as relative. A browser will be in the same order of magnitude.

---

## TL;DR — why "pick a fill type, rotate the object" is slow and choppy

1. **On a scene tree (every new 3D scene) the live-drag draft path never runs.**
   `engine.generate(group, {preview:true})` drops `options`, and `_composeSceneGroup`
   hard-codes `fastPreview:false`. Every rAF drag frame is a full-quality render with
   the full tone law, ribbons, PenFill and shadow booleans.
   Measured on the default sphere: **draft 7 ms, actual drag frame 150 ms (default law) to 2.5 s (`taperedEnds`) and up to 5.6 s (`weaveDepth`)**.
2. **The cost of one full frame depends on the Fill Style, over a range of 100×** (55 ms for `none`, 5.6 s for `weaveDepth`, sphere·hatch).
   There are two expensive families. **Ribbon laws** spend most of their time in
   PenFill's raster EDT and in boolean erosion. **Mono laws** spend most of their
   time in `inv()`→`sampleAt()`, where `rotatePoint` re-computes trig and coerces
   numbers each time it is called.
3. **Panel edits (Type / Fill Style / transform sliders) do the work twice.**
   `app.regen()` generates the *active* object3d child as a standalone one-object
   scene. The engine discards that result, then recomposes the group.
   Measured: 5.5 s instead of 2.7 s.

When fixes #1 and #2 below are combined, a `taperedEnds` drag drops from about 2.5 s/frame to single-digit ms (draft).
A panel edit becomes 2× cheaper. Fix #3 is bit-identical and also removes about 25–60 % of every settled fill render.

---

## 0. The per-frame pipeline during a rotation (as built today)

| Gesture | Entry | Coalescing | What runs per frame on a scene TREE |
|---|---|---|---|
| Object rotate gizmo | `renderer.js:11467 _applySceneObjectGizmoDrag` → `:11545 _scheduleSceneDragRegen` | rAF, 1 regen/frame (`renderer.js:10541`) | `engine.generate(groupId,{preview:true})` → `engine.js:3338-3344` → `_composeSceneGroup(group)` **with `fastPreview:false` (`engine.js:2706-2709`)** → full `scene3d.generate` → `draw()` |
| Camera orbit pad | `renderer.js:15154 apply3DRotationDrag` → `:15215` | rAF for scene3d. **`updateFormula()` and `_activePresetGalleryRefresh()` still run on each pointermove** (`:15221-15222`) | same as above |
| Ground move drag | `renderer.js:10525` | rAF | same |
| Object panel transform slider (yaw/pitch/roll) | `scene3d-panel.js:2146-2160` → `regenDraft()` → `app.regen({preview:true})` (`app.js:1287`) | rAF | `engine.generate(activeLayerId=object3d child, {preview})` → **standalone 1-object scene3d generate (wasted)** → `computeAllDisplayGeometry()` (`engine.js:3654`) → `_computeSceneGroups` → **full-quality compose of EVERY scene group** → `optimizeLayers` → `app.render()` → `updateStats()` |
| Object panel Type / Fill Style pick | `scene3d-panel.js:829-831` `commit()` → `app.regen()` | n/a (discrete) | same as the slider row, at full quality, twice |
| Ctxbar flyout slider (gesture) | `renderer.js:12690 _sceneEndWrite` | **no rAF coalescing** — one synchronous generate per input event | `generate(group,{preview})` → full compose (preview dropped) |
| Release | `renderer.js:11551 _endSceneObjectGizmoDrag` / `:15249 end3DRotationDrag` | — | synchronous full `engine.generate` + `ui.buildControls(...)` (full panel DOM rebuild) |

Caching: nothing survives across frames. Every per-frame memo is created inside `generate`:
`faceFootprintCache`, `groundCache`, `smoothCache`, `rankBandCache`, `glintMaxCache` (`scene3d.js:1712-2057`),
and `chartOrientMemo`, `regionMemo` and so on inside `buildObject`. The meshes are rebuilt every frame
(`scene.js:384-392`). A pure rotation therefore invalidates *everything*.

Draft machinery that exists but is unreachable on trees: HLR coarser sampling
(`scene3d.js:1574`, `hlr.js:420`), tone off (`scene3d.js:1618-1619`), curved charts
replaced by the flat silhouette hatch (`scene3d.js:4549-4551` `!draft &&`), shadow
booleans skipped (`shadows.js:2764, 2996`), and mesh detail ×0.4 (`scene.js:155, 384`).

---

## 1. Measurements

### 1a. The product paths (default sphere, ground + light children, `hatch` + `taperedEnds`)

| Path | ms / call |
|---|---|
| `engine.generate(group,{preview:true})` — **one gizmo/orbit drag frame** | **2553** |
| `engine.generate(child,{preview:true})` — one panel-slider draft frame | 2713 |
| `engine.generate(child)` — one panel Type/Fill Style edit | **5537** (≈ 2 full composes) |
| `computeAllDisplayGeometry()` | 2551 |
| `scene3d.generate` same scene, `fastPreview:false` | 1911 |
| `scene3d.generate` same scene, **`fastPreview:true`** | **7.1** |

With the default law (no `toneLaw`), a drag frame is about 150 ms: 3 frames took about 470 ms in `prof-sphere-hatch`.
Of that, about 130 ms is `buildObject` and about 110 ms is the ground shadow `build`.

### 1b. Fill cost per law (sphere r20 d28, hatch, fill only, no ground, median of 3 yaws)

| Tier | Laws (ms/frame) |
|---|---|
| **S ≥ 3.5 s** | weaveDepth 5626 · turingStripe 5146 · ampSpacing 4933 · trochoidLoop 4410 · onePenDown 3765 · interlockWeave 3729 |
| **A 1.2–2.9 s** | mezzoRegion 2863 · defectSplit 2366 · etfKang 2346 · isophoteWidth 2071 · nibAngle 1989 · whiteBand 1968 · taperedEnds 1903 · originSpiral 1815 · dutyConst 1701 · voronoiWeb 1505 · weightModulated 1493 · weightSmoothstep 1490 · endShorten 1474 · mazeFill 1224 |
| B 150–400 ms | mkTick 398 · bundleSubNib 311 · amplitudeOnly 285 · contFieldTouch 280 · bundle* ≈200 · contField* 160–205 · deepFillTSP 165 |
| C < 150 ms | mkDotScreen, penReserve, penCross, mkDashRamp, (phase)fineLadder, pen*, mkScribble, perceptualRamp, lozengeStipple, none (55) |

Faceted (box, `laws-box-hatch.tsv`): every non-mono law runs in < 2 ms, because the faceted path does not route them.
The **9 mono laws cost the same on a box as on a sphere**: turingStripe 5533, mezzoRegion 3242, etfKang 2583, defectSplit 2477, originSpiral 2292, voronoiWeb 2030, dutyConst 1907, endShorten 1719, mazeFill 1467.

By Type (sphere, `taperedEnds`): hatch 2015, **crosshatch 3719** (two ribbon families), contour 1390,
spiral 104, stipple 69, contourSlice 85, wireframe 79. With the default law, every Type takes 35–153 ms.

### 1c. Where the time goes (CPU profiles)

| Law | Dominant self time |
|---|---|
| taperedEnds | `PenFill.edt` (pen-fill.js:186) **52.7 %**; ribbonize total 80 %; polygon-clipping erosion ≈ 9 % |
| weaveDepth | `edt` 31.7 %; polygon-clipping (compare/splay/sweep) ≈ 25 %; GC 8.4 % |
| turingStripe | mono `clamp` (surface-fill-mono.js:38) **40 %** (in the reaction–diffusion loop); `finite`+`rotatePoint`+`degToRad` 30 %; `inv`→`sampleAt` 41 % inclusive |
| etfKang | `finite` 31 % + `rotatePoint` 16 % + `degToRad` 7 % (all inside `sampleAt` via `inv`); `sampleAt` 74 % inclusive |
| default hatch | `finite` 12 %, `isFinitePt` (shadows) 10 %, `rotatePoint` 7 %, GC 7 %; ground shadow `buildShadowFields` ≈ 12 % |

---

## 2. Findings, ranked by impact × effort

### F1 — P0 · Scene-tree compose ignores the draft flag (the drag is always full quality)
- **Location:** `src/core/engine.js:3335-3345` (`generate` early-returns for a group and never forwards `options`); `src/core/engine.js:2706-2709` (`_composeSceneGroup` hard-codes `fastPreview: false`). Also `renderer.js:10552-10557`: the `SETTINGS.preview3dQuality='draft'` swap does nothing, because `previewDetailScale` returns 1 when `fastPreview` is false (`geometry3d.js:546-550`).
- **Mechanism:** every drag path (`_scheduleSceneDragRegen`, `_sceneEndWrite` gesture) targets the GROUP id. New scenes are always trees (`engine.js:808-815`). The comment block "Coalesce drag regens on rAF at DRAFT detail" (`renderer.js:10536`) describes behaviour that only the legacy monolith gets.
- **Impact:** every Type × every law × every curved and faceted object. Measured 2553 ms against 7 ms (`taperedEnds`), and about 150 ms against about 7 ms (default). This alone explains "slow and choppy".
- **Fix:** `generate(layerId, options)` → `this._composeSceneGroup(layer, options)`; in `_composeSceneGroup(group, options={})` set `fastPreview: Boolean(options.preview || options.fastPreview)`. Also set `layer._pathsFromDraft` on the group, because expand/flatten reads it. Add an RGR test: a group `generate(id,{preview:true})` must reach `scene3d.generate` with `bounds.fastPreview===true`. Mirror `scene3d-hlr-draft-flag-wiring.test.js`.
- **Byte-identity risk:** none for settled renders. `computeAllDisplayGeometry` still composes with `fastPreview:false`. Drag frames change to the documented draft look (see F5 for the UX consequence).
- **Effort:** S (about 5 lines + 1 test).

### F2 — P0 · Panel edits generate the active object3d child as a standalone scene (wasted), then recompose
- **Location:** `src/app/app.js:1290` (`engine.generate(this.engine.activeLayerId, options)`); `src/core/engine.js:3335+` (no `_sceneConsumed` short-circuit); `src/core/algorithms/object3d.js:21-22, 89`. `isConsumed` reads `params._sceneConsumed` / `bounds._sceneConsumed`, but the engine sets the flag on the **layer** (`engine.js:2673`), so the check is never true. The file header (`object3d.js:10-13`) documents the intended contract, and the code does not meet it.
- **Mechanism:** when the selected tree object is the active layer, each `regen()` runs a full one-object `scene3d.generate` (with default camera, lights and tone) and stores the result in `child.paths`. `getRenderablePaths` never serves it (`engine.js:2486`). Then `generate` ends in `computeAllDisplayGeometry()` (`engine.js:3654`), which composes the group again.
- **Impact:** every Style-tab Type pick, Fill Style pick, sub-setting slider (rAF draft) and transform slider. Measured 5537 ms against 2713 ms (2×). Under the draft path the standalone run is cheap (7 ms), but it is still waste.
- **Fix (pick one):** (a) in `engine.generate`, if `layer._sceneConsumed`, or if the layer is a scene-child type with an owning scene group, call `this.generate(ownerGroup.id, options)` and return. This also gives panel drafts the F1 draft compose instead of a full `computeAllDisplayGeometry`. (b) Minimal: pass `{...bounds, _sceneConsumed: layer._sceneConsumed}` so `object3d.generate` returns `[]`. (a) is better, because it also avoids recomposing *all* groups (F12).
- **Risk:** low. `child.paths` is dead output. Check that "Expand into group" uses `getSceneChildRenderPaths` (it does, `engine.js:2770+`) and not `child.paths`.
- **Effort:** S.

### F3 — P1 · `rotatePoint` / `applyObjectTransform` / `projectWorld` re-derive trig and coerce numbers on every call (bit-identical fix, about 70× on the primitive)
- **Location:** `src/core/algorithms/geometry3d.js:14-16, 35-53` (3× `degToRad`→`finite(Number())`, 6× sin/cos, 3 destructuring-array allocations per call); `src/core/scene3d/scene.js:234-243` (4× `finite` plus a new angles object per call); `scene.js:403` (`projectWorld` → `rotatePoint(pt, camAngles)`). Called from `surface-fill.js:5688 sampleAt` 4× per sample (8× when `useLadder`: `applyTransform`, `rotatePoint(nLocal, rot)`, `rotatePoint(wN, cam)`, `projectWorld`, plus 2× (`applyTransform`+`projectWorld`) for dA/dB), from `foreAt` (`:11403`), and from `worldAt`.
- **Evidence:** `rotbench.js` measured 1 M points in 704 ms with `rotatePoint` and 9.9 ms with a precomputed-trig rotator. **Bit-identical** (same three sequential rotations, same expression order; checked on 100 k points). In profiles, `finite`+`rotatePoint`+`degToRad` is 54 % of etfKang, 30 % of turingStripe and about 22 % of the default hatch frame.
- **Fix:** add `G3.makeRotator(angles)`, which precomputes cy/sy/cp/sp/cr/sr and returns `(pt)=>v(...)` with the identical op sequence. Add `Scene.makeObjectTransform(t)`, which precomputes sx/sy/sz and the rotator. In `assembleScene`, build the camera rotator once for `projectWorld`. In `buildObject`, build `rot`/`cam`/`applyTransform` rotators once per call. Keep `rotatePoint` as the API for the rest of the code.
- **Impact:** about 25–60 % off every curved fill frame, settled or drag. The largest gains are on mono laws, and on box mono laws through `faceMonoLines`.
- **Risk:** none, if the op order is preserved. Pin it with a property test that compares against `rotatePoint`.
- **Effort:** S–M (mechanical, at many call sites).

### F4 — P1 · Ribbon laws: PenFill rasterizes each ribbon on its axis-aligned bbox at pen/10, then runs 2 EDTs
- **Location:** `src/core/scene3d/surface-fill.js:8434-8441` (`PFm.fillRegion` per eroded ribbon piece); `src/core/pen-fill.js:1410-1415` (`cs = pen/10`, capped at `MAX_CELLS = 1.4 M`), `:212-246 buildField`, `:249-258 finishField` (2× `edt`, `:186`). Erosion: `surface-fill.js:8025 erode` → `GeometryUtils.insetMultiPolygon` → `strokeRingsToBand` (a polygon-clipping union of per-segment quads and join disks, `geometry-utils.js:960+`).
- **Mechanism:** a ribbon is long and thin (for example 50 mm × 0.5–1.5 mm). On a diagonal ruling the axis-aligned bbox is about 35 × 35 mm, which is about 1000 × 1000 cells at 0.035 mm, and the ribbon covers only about 3 % of them. Every cell gets two Felzenszwalb passes plus labelling, coverage and repair rounds (up to `MAX_REPAIR_ROUNDS=4`, each with `uncoveredBlobs`, a full-grid scan).
- **Impact:** the width family (taperedEnds, whiteBand, nibAngle, isophoteWidth, weightModulated, weightSmoothstep: 1.5–2.1 s) and the wave family plus onePenDown (3.7–5.6 s). EDT is 32–53 % of their frame, and erosion booleans another 9–25 %. Crosshatch doubles all of it.
- **Fix options:**
  (a) *Oriented raster:* rotate the ring set into its principal axis (the PCA of the ring, or the run's own chord direction, which ribbonize already knows), fill there, then rotate the paths back. About 10–30× fewer cells. **Not byte-identical** (the grid moves), but it is the same algorithm at the same resolution. Needs a golden refresh plus a coverage-parity check (`measureCoverage` within ε).
  (b) *Identity-preserving partial:* in `edt(inside, seed=0)` (dIn), columns with no inside cell are all-zero after pass 1, so skip them. Bound pass 2 to rows that hold inside cells. dOut needs real values only within a few cells of the boundary if `sampleSdf` reads only near the boundary — **verify** before you truncate. That gives about 2× and keeps dIn exact.
  (c) Erosion: pass `joinSkipAngle` (already supported, `geometry-utils.js:986-990`) so nearly-collinear vertices on a densely sampled ribbon boundary do not each add a join-disk polygon to the union sweep. This is not identical.
- **Effort:** M.

### F5 — P1 · Once F1 is fixed, a curved draft drops the chosen Fill Style entirely (visual "pop" on release)
- **Location:** `scene3d.js:4549-4551` (curved chart skipped when `draft`, so the flat silhouette `hatchSegments` is used); `scene3d.js:1619` (`toneOn` forced false when draft).
- **Mechanism:** the existing draft contract is "flat Phase-1 hatch during the drag; full tone on release". So the drag shows a generic hatch, and the selected law appears only on mouse-up after a full render that can take seconds. This is exactly the "choppy" feel once F1 makes the drag itself fast.
- **Proposal:** a law-preserving draft tier inside `buildObject`:
  - Keep the law's ruling placement and tone, but skip `ribbonize`/PenFill and erosion. Emit centrelines that carry `weightScale` meta, which the renderer can stroke wider.
  - Lower `fillFidelity` (samples per line) by about 0.4.
  - For mono laws, coarsen their lattices/grids (Turing `NX/NY`, Voronoi seeds, Maze cells) by a draft factor.
  - Choose a tier adaptively: time the last settled compose. If it was under about 40 ms, keep full quality during the drag (no pop for cheap laws); if not, use the law-preserving draft. Use the flat-hatch draft only as the last resort.
- **Risk:** drag frames only. **Effort:** M.

### F6 — P1 · Release does a synchronous full render plus a full panel rebuild (a multi-second freeze)
- **Location:** `renderer.js:11551-11583` (`engine.generate(layer.id)` + `ui.buildControls(layer)`), `renderer.js:15249-15268`.
- **Impact:** with Tier S/A laws, each release freezes the UI for 1.5–5.6 s (plus the panel DOM rebuild). Under F1 this becomes the only expensive moment, and users will feel it as "lag after letting go".
- **Fix:** (short term, S) defer the settle with `setTimeout(0)`/idle and cancel it when a new drag starts, so rapid successive nudges do not each pay for a full render. Rebuild only the inspector fields that changed, not `buildControls`. (Long term, L) move `scene3d.generate` into a **Web Worker**. The modules are IIFEs on `window.Vectura`, have no DOM dependency in `src/core/scene3d/*`, `geometry3d.js`, `pen-fill.js` or `fill-boolean.js` + polygon-clipping, and can be `importScripts`-ed with a `self.window = self` shim. Post back paths: about 35 k points is cheap to structured-clone. Show the draft until the worker result arrives, and discard results that are stale by a frame counter.
- **Risk:** none to output. The worker needs every input to be serializable (`assembled` params already are).

### F7 — P2 · `turingStripe`: the reaction–diffusion loop does loop-invariant work and allocates 2 arrays per iteration
- **Location:** `src/core/scene3d/surface-fill-mono.js:2506-2526`.
- **Mechanism:** the loop runs 170 iterations × up to 360² cells. Per cell per iteration there are 3 `clamp()` calls (each `Math.max(Math.min(Number(v)||0))`). `wl` and `Dv` depend only on `lam[k]` and `dx`, so they are loop-invariant, yet they are recomputed 170 times. `u = un.slice(); v = vn.slice()` allocates 2 × 518 KB per iteration, which is about 176 MB of garbage per frame. Profile: mono `clamp` takes **40 %** of the whole frame.
- **Fix:** precompute a `Dv[k]` Float32Array once. Inline the two remaining clamps as `x<lo?lo:x>hi?hi:x`, keeping `Number(x)||0` semantics: the inputs are finite floats, so NaN cannot occur except through 0×Inf, and you should guard that. Replace `slice()` with ping-pong buffers, and zero the border cells of the reused buffer once so the result stays **bit-identical**: the `un/vn` border cells are 0 under the current code after the first iteration.
- **Impact:** turingStripe 5.1–5.5 s → est. 2–2.5 s (≈ 1.5 s after F3, which removes most of the `inv` cost). **Effort:** S.

### F8 — P2 · Mono laws: `inv()` (screen → surface) is a Newton solve that costs several `sampleAt` per query, run per lattice cell
- **Location:** `surface-fill-mono.js:391-440` (`inv`: bucket seed, then up to 6 Newton steps × a line search; each step calls `at()`→`sampleAt`, and `frame()` adds 2 more `sampleAt` when dA/dB are absent, `:127-135`). Callers: Turing per grid cell (`:2454`), etfKang `streamFamily` (`:551`), and others.
- **Impact:** `inv` is 41 % (turing) and 63 % (etfKang) of the frame, inclusive. Mono laws are 1.2–5.5 s on both sphere and box.
- **Fix:** (identical) F3 makes each `sampleAt` about 3–4× cheaper. Also memoize `sampleAt(a,b)` per `buildObject` call in a Map keyed by the exact (a,b) bit pattern; Newton line searches and `frame` repeat the same points. (Not identical) seed each grid cell's Newton from the neighbour cell's solved (a,b) (scanline coherence), which needs about 1–2 iterations instead of 4–6. That needs a golden refresh.
- **Effort:** S (memo) / M (coherent seeding).

### F9 — P2 · Ground-shadow fields are brute force: O(cells × segments), plus a per-cell point-in-polygon with `isFinitePt` on every edge
- **Location:** `src/core/scene3d/shadows.js:1547-1640` (`buildShadowFields`: up to 40 000 cells × (`distToSegs(cSegs)` + `distToSegs(edgeSegs)`), then a second full pass calling `pointInRings` per cell, `:1513`, with `isFinitePt` per edge per cell).
- **Impact:** every scene with a ground shadow, every frame, for every law. About 60 ms/frame on the default sphere (12 % of the default frame; `isFinitePt` alone was the #2 self-time entry).
- **Fix (bit-identical):** filter non-finite points out of the rings and segments once. Replace the per-cell `pointInRings` with a per-row scanline: compute the edge crossings for row y once, then for each x count the crossings with `x < xcross`. That is the same comparisons, so the parity is identical. Bucket the segments in a coarse grid and take the exact min over the candidate cells with expanding rings; min is order-independent, so the result is identical.
- **Effort:** S–M.

### F10 — P2 · `combinedIntensity` re-derives each light's direction per sample
- **Location:** `src/core/scene3d/regions.js:42-49` (`lightWorldDir`: 2 `finite`, 3 trig, `normalize`), `:68` `towardLight` (`normalize` again), `:164+`. It is called per sample from `sampleAt` (`surface-fill.js:5759`) and per face. Area lights loop N sub-samples × `shadowFn` per sample (already noted in STILL-OPEN as 2.3–4.3× when Unit D is on).
- **Fix:** keep a per-generate `WeakMap<light, {dir, toward}>`. Same arithmetic, so identical. **Effort:** S. Impact about 2–5 %.

### F11 — P2 · No cross-frame reuse: every object's fill is rebuilt even if only another object moved
- **Location:** `scene3d.js:4579` (`SurfaceFill.buildObject` per record per frame).
- **Mechanism:** `buildObject` output depends only on that object's chart and transform, the camera, lights, tone, the style params, penWidth/bounds and `selfOcclusionTest`. Occlusion by other objects is applied *afterwards* by the clipper. `shadowFn` (Unit D, default off) is the only cross-object input.
- **Fix:** keep a module-level LRU keyed on a canonical signature of exactly those inputs (and bypassed when `shadowReceiveOnObjects` is on). In a multi-object scene, rotating object A then reuses B, C, …. **Identical** if the key is complete. The risk is a stale-cache bug, so key on a full canonical stringify of the inputs, not on a hand-picked subset.
- **Effort:** M. **Impact:** about (N−1)/N of the fill time while dragging one of N objects. It does not help a single-object rotation, and it does not help a camera orbit.

### F12 — P2 · Any leaf `generate` recomposes EVERY scene group and re-optimizes every layer
- **Location:** `engine.js:3654` → `computeAllDisplayGeometry` (`engine.js:2516-2560`) → `_computeSceneGroups` (all groups) → `optimizeLayers(this.layers)`.
- **Impact:** a document with K scenes pays K full composes per panel edit. Combined with F2, the edit runs the active child standalone plus K groups.
- **Fix:** add dirty tracking. Recompose only the group that owns the edited child (F2's option (a) already does this for scene edits).
- **Effort:** M.

### F13 — P3 · The continuous-family probe samples each ruling, then `emitLine` samples it again
- **Location:** `surface-fill.js:11423 probe` (samples `st` points per candidate, plus `creep` retries off-surface, plus `contFieldAniso`'s 2 extra probes), `:11669-11679` (`emitLine` re-walks the same ruling). `contFieldMeasured`/`contFieldEquil` run `walk()` twice (`cfPasses`).
- **Fix:** the per-call `sampleAt` memo from F8 catches the coincident parameters. **Identical.** **Effort:** S. Impact about 10–30 % on the ladder and contField laws (already cheap).

### F14 — P3 · Meshes and convexity are rebuilt every frame
- **Location:** `scene.js:118-160, 384-392` (`buildPrimitiveMesh`, `createTopoformMesh`, `isConvexMesh` per object per frame), and CSG `resolveAssembly`.
- **Fix:** memoize on (primitive, params, detailScale), because these are pure functions. **Identical.** Small for primitives, larger for CSG groups and imported meshes. **Effort:** S.

### F15 — P3 · UI work that is not coalesced on the hot path
- `renderer.js:15221-15222`: `updateFormula()` + `_activePresetGalleryRefresh()` run on each orbit pointermove. Move them into the rAF callback.
- `renderer.js:12690-12693`: the ctxbar flyout gesture preview runs one synchronous generate per input event, with no rAF. Route it through `_scheduleSceneDragRegen`.
- `app.js:1287-1310`: `regen()` → `render()` → `updateStats()` runs a full `computeStats({physics:true})` per rAF draft frame. Throttle it during gestures.
- `engine.js:906` `addSceneTree`: each of addObject/addLight/addGround calls `computeAllDisplayGeometry`, so a new scene costs 3 full composes (one-off).

### F16 — P3 · Side effect on correctness: a slow frame breaks gizmo rotate unwrapping
- **Location:** `renderer.js:11497-11505` assumes "a continuous drag never moves more than a few degrees between two consecutive pointermove events".
- **Mechanism:** with 2–5 s frames the main thread is blocked. Chrome coalesces pointermoves, so the next processed event can be more than 180° around the ring. The shortest-path unwrap then reverses the spin.
- **Fix:** F1 mostly removes the cause. To harden it, use `e.getCoalescedEvents()` and accumulate each sub-step.

### F17 — P3 · Draw-time dedupe builds string keys for every path when `plotterOptimize > 0`
- **Location:** `renderer.js:4945-4957, 5105-5110` (`pathKey` joins every point into a string, per draw). The default is 0 (`defaults.js:2596`), so this applies only when the user turns it on. Cache the keys per path array (WeakMap).

---

## 3. Suggested order of work (impact × effort)

| # | Item | Impact | Effort | Identity |
|---|---|---|---|---|
| 1 | F1 forward `preview` into `_composeSceneGroup` | ★★★★★ (drag 2.5 s → 7 ms) | S | settled identical |
| 2 | F2 route consumed children to the owning group | ★★★★ (edits 2×) | S | identical |
| 3 | F3 precomputed rotators / transforms | ★★★★ (25–60 % of every fill) | S–M | **bit-identical** |
| 4 | F6a defer + cancel the release settle; partial panel refresh | ★★★ | S | identical |
| 5 | F7 Turing loop hoist + ping-pong | ★★★ (one law) | S | bit-identical |
| 6 | F9 shadow fields scanline + segment grid | ★★ (every scene) | S–M | bit-identical |
| 7 | F4b EDT skip-empty columns · F4a oriented raster | ★★★★ (13 ribbon laws) | M | (b) identical / (a) golden refresh |
| 8 | F5 law-preserving adaptive draft | ★★★★ (UX) | M | drag only |
| 9 | F8 sampleAt memo (+ coherent Newton seeding) | ★★★ (9 mono laws) | S / M | memo identical |
| 10 | F10, F13, F14, F15 | ★–★★ | S | identical |
| 11 | F11 per-object fill LRU · F12 dirty-group compose | ★★★ (multi-object/multi-scene) | M | identical if key complete |
| 12 | F6b Web Worker for scene3d.generate | ★★★★ (no freezes at all) | L | identical |

RGR hooks: F1 → extend `tests/unit/scene3d-hlr-draft-flag-wiring.test.js` to drive `engine.generate(groupId,{preview:true})` on a tree. F2 → assert that `scene3d.generate` is called once (spy) for `app.regen()` with an active consumed child. F3/F7/F9 → existing goldens (`tests/visual/scene3d-tone-baseline.test.js`, `docs/tone-laws` byte gallery) must stay byte-identical. Add a direct property test `makeRotator(a)(p)` ≡ `rotatePoint(p,a)`.

NOT visually verified. This is a static and headless lens. Timing came from Node/JSDOM on the real engine path, not from the browser.
