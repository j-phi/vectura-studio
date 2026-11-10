# Surface-locked Scene3D fills: implementation contract

Status: **authoritative** for the `feat/surface-lock` effort (owner decision: rollout option C).
Design background: the surface-lock design note (Scene3D fills inventory, tonal-art-map levels).
Work plan and unit ownership: the surface-lock plan held by the orchestrator.

A fill in `markSpace: 'surface'` is **baked once** in object space and **framed per pose**. Dragging or
rotating costs one transform, cull, tone gate and projection per vertex. Export reads the same frame,
so a drag frame equals the final render by construction. `markSpace: 'pose'` (and an absent key) is
today's fill, unchanged byte for byte.

Section numbers are referenced from code comments and the plan. Change a rule here first, then the
code.

---

## 0. Two integration levels (measured, read first)

Measured on this branch (Node 24, default `addLayer('scene3d')` sphere, 320 x 220 profile, median of 4):

| Generate of the default scene | ms |
|---|---|
| Default ladder hatch, full tier | 220-300 |
| Mezzotint (`mezzoRegion`), full tier | 2300-2650 |
| Fill mapper `none` (edges, ground, shadow) | 110-145 |
| `none` and no cast shadow (mesh 3080 faces, edges, HLR) | 58-106 |
| Flat draft tier | 40-54 |

So replacing only the fill leaves 60-110 ms of per-pose work. The 8 ms goal needs the whole scene
framed. Two levels:

- **Level F (fills locked).** `generateScene` runs as today; each surface-locked fill group calls
  `SurfaceLock.frame` instead of `SurfaceFill.buildObject`. Output lines go through the existing HLR
  clipper and `emitRuns`. Correct for every scene, cost about the non-fill floor above.
- **Level S (scene framed).** When `SurfaceLock.frameable(p, bounds)` is true, `generateScene` takes an
  early branch: `SurfaceLock.sceneFrame` produces fills, outlines, ground and cast shadow from cached
  object-space data (§13). This is the level the 8 ms target applies to.

Both levels give drag == export, because the drag frame and the export both call `generate` and a
scene is in exactly one level for given params.

## 1. Modules, ownership, load order

All register on `window.Vectura.Scene3D` as their own top-level key (so
`Engine.sceneModuleFingerprint`, which walks one level deep, fingerprints them). Load order (index.html,
`ComposeClient.WORKER_SCRIPTS`, `tests/helpers/runtime-profiles.js` `SCENE3D_FILES`, all three kept in
step; `tests/unit/scene3d-surface-lock-scaffold.test.js` pins it):

| Order | File | Namespace | Owner unit |
|---|---|---|---|
| after `scene3d-fill-controls.js` | `src/config/scene3d-surface-lock.js` | `Vectura.SCENE3D_SURFACE_LOCK` | W1-A (constants) |
| after `surface-fill.js` | `surface-lock-markset.js` | `SurfaceLockMarkSet` | scaffold (frozen) |
| | `surface-lock-chart.js` | `SurfaceLockChart` | scaffold (frozen) |
| | `surface-lock-mezzo.js` | `SurfaceLockMezzo` | W1-C |
| | `surface-lock-ladder.js` | `SurfaceLockLadder` | W1-D |
| | `surface-lock-laws.js` | `SurfaceLockLaws` | W3-B |
| | `surface-lock-faceted.js` | `SurfaceLockFaceted` | W3-A |
| | `surface-lock-visibility.js` | `SurfaceLockVisibility` | W1-E |
| | `surface-lock-shadow.js` | `SurfaceLockShadow` | W1-B, W3-C |
| before `algorithms/scene3d.js` | `surface-lock.js` | `SurfaceLock` | W1-A |

Rules:
- Modules look each other up **lazily at call time** (`Vectura.Scene3D.X` inside the function), never at
  load, so load order inside the block does not matter and stubs can be replaced one at a time.
- Every module must load in the worker (no DOM, no `document`, no `performance` without a guard).
- "Frozen" files change only through the orchestrator (a bug found by a unit is reported, not patched).
- No new file may be added to the three manifests by a Wave 1 or Wave 2 unit; the scaffold already
  registered every file this plan needs.

## 2. MarkSet data layout (`SurfaceLockMarkSet`)

One MarkSet = every mark one fill group could draw on one object, at every density level, in the
object's **scaled local frame**: millimetres, `p_scaled = diag(sx, sy, sz) * chart(a, b)`; object
rotation and translation **not** applied. (Object scale is a bake input, §8.)

| Field | Type | Meaning |
|---|---|---|
| `layout` | 1 | `LAYOUT_VERSION` |
| `bakerId`, `key`, `objectId` | string | baker id, bake key (§8), object id of the spec that baked it |
| `vertexCount` `nv`, `runCount` `nr`, `levels` | int | `levels` = highest used level + 1 |
| `positions` | `Float32Array(3 nv)` | x, y, z per vertex, scaled local mm |
| `normals` | `Int16Array(2 nv)` | outward unit normal, octahedral, `OCT_SCALE` 32767 (`octEncode`/`octDecode`; worst error < 1e-4 rad) |
| `runStart` | `Uint32Array(nr + 1)` | run r owns vertices `[runStart[r], runStart[r+1])`; `runStart[nr] = nv` |
| `runLevel` | `Uint8Array(nr)` | level 0 .. `MAX_LEVELS - 1` (6 levels max) |
| `runRank` | `Uint16Array(nr)` | rank r in [0, 1) stored as `round(r * 65536)`, max 65535 (`rankOf`) |
| `runFamily` | `Uint8Array(nr)` | 0 primary family, 1 crossing family, 2 third family |
| `runFlags` | `Uint8Array(nr)` | bit 0 `CLOSED` (ring; frame closes it), bit 1 `DOT` (1-vertex anchor, drawn as a glyph), bit 2 `BACK` (reserved, x-ray; unused in v1) |
| `meta` | plain object | below |

`meta` (JSON-able; everything a frame needs besides the arrays):

| Key | Meaning |
|---|---|
| `p0` | level-0 surface pitch, scaled local mm (> 0, `validate` checks) |
| `gain` | density multiplier per level: 2 for line families (`toneModel 'pitch'`), 4 for 2D dot lattices (`'area'`) |
| `toneModel` | `'pitch'` or `'area'` |
| `scaleRef` | the bake-time projection scale the baker designed for (§8) |
| `minMarkMM` | screen-mm floor for a drawn sub-run (`MIN_MARK_PEN * penWidth`); DOT runs exempt |
| `glyph` | for DOT runs: `{ kind: 'circle', r: <screen mm>, segs: <int >= 4> }` |
| `bounds` | `{ min: [x,y,z], max: [x,y,z], radius }` in scaled local mm |
| `convex` | boolean (record.convex of the object) |
| `msBake` | bake wall time (informational; never part of equality) |

Runs are emitted in bake order. Order is part of the determinism contract (§3), plot ordering is not
(the optimizer re-sorts).

Builder API: `createBuilder(meta) -> { beginRun(level, rank, family, flags), vertex(x, y, z, nx, ny, nz),
endRun() -> kept, finish() -> MarkSet }`. A non-DOT run with fewer than 2 vertices is dropped.
`validate(ms) -> []` when well formed. `transferList(ms)` gives the buffers a worker transfers.

Memory: 16 B/vertex + 8 B/run. Budget per object per fill group: 200k vertices (3.2 MB).

## 3. Chart metric, seeds, determinism (`SurfaceLockChart`)

- `metric(mode, sizes, scale)` wraps `SurfaceFill.chartFor(mode, sizes)` (same `mode`/`sizes` as
  `curvedChartParams` in `algorithms/scene3d.js`, including the `AROUND_IS_U` swap, `cappedChart`,
  `capsuleArcChart`). `M.sample(a, b)` returns point, `dP/da`, `dP/db` (scaled mm per unit parameter) and
  the **outward** unit normal. Differences: central (EPS 1/4096), wrapped across a periodic seam,
  second-order one-sided at a hard domain edge. Normals use the inverse-transpose of the scale. At a
  pole the normal comes from two meridian tangents a quarter-turn apart (sphere error < 1e-9).
  `M.orientation` is the divergence-theorem sign SurfaceFill's `chartOrientation` uses (torus and
  torusKnot charts are inward and get flipped).
- Spacing is always measured in **object mm** (chart derivatives or 3D distance), never in (a, b) and
  never on screen. Occupancy uses `spatialHash3(cell)` (3D, pole and seam safe).
- Randomness: `hash(i, j, salt)` only (the `sfHash` formula with an explicit salt). `Math.random`,
  `Date`, iteration over `Map`/object key order that depends on insertion from hash buckets, and the
  module-global `Geometry3D` SEED are forbidden inside a baker. The salt comes from `spec.seed.salt`,
  phase offsets from `spec.seed.phase`.
- Determinism: the same spec gives identical typed arrays (bitwise) on main thread and in the worker.
  Ranks and levels may depend on geometry, style, pen width, `scaleRef` and seed only; **never** on
  light, tone settings, pose, camera or other objects.

## 4. Pose, camera, light inputs

`SurfaceLock.poseOf(transform, camera, bounds) -> Pose`, the shape `PosePreview.describe` already builds
(`pose-preview.js`), minus scale:

```
Pose = {
  cam: { yaw, pitch, roll, scale, cx, cy, persp, focal, dist },  // Scene.buildProjOpts(camera, { width, height })
  obj: { x, y, z, yaw, pitch, roll },                             // object rotation + translation only
}
```

Matrices (the `PosePreview` recipe, `_internals.rotMatrix`): `camR = rotMatrix(cam angles)`,
`objR = rotMatrix(obj angles)` (row-major 3x3 from `Geometry3D.makeRotator` applied to the basis),
`A = camR * objR`, `cT = camR * [x, y, z]`. For a baked vertex p and normal n:

- camera space `c = A p + cT`, `n_c = A n` (no renormalisation needed; rotation only);
- world space (tone) `p_w = objR p + [x, y, z]`, `n_w = objR n`;
- projection exactly as `Geometry3D.projectPoint`: orthographic `X = cx + c.x * scale`,
  `Y = cy - c.y * scale`, per-vertex scale `s_v = scale`; perspective `denom = focal + dist - c.z`, a vertex
  with `denom <= 0.05 * focal` is invalid (treated as culled), `s_v = focal / denom * scale`,
  `X = cx + c.x * s_v`, `Y = cy - c.y * s_v`; output `z = c.z` (larger is nearer);
- facing cosine `c_v`: orthographic `n_c.z`; perspective `n_c . normalize(e - c)` with
  `e = (0, 0, focal + dist)` (the `camPos` of `Scene.assembleScene`).

Precision requirement: an orthographic frame vertex equals
`Scene.projectWorldPoint(Scene.applyObjectTransform(p_local, t), camera, bounds)` within 1e-9 mm.

Lights are never read by `frame`. Tone arrives as a closure (§5) built by the caller from the same
`activeLights`/`activeToneShape` `generateScene` uses for that record.

## 5. Tone gating

Inputs per frame: `view.toneFn(n_w, p_w) -> I` (the record's `intensityFn`: `shapeTone(combinedIntensity(...))`,
clamped to [0, 1]); a **tone table** `{ lut, scaleFn }` from `baker.toneLUT(spec, toneCtx)`; `floorPitch =
PLOT_FLOOR_PEN * penWidth` (screen mm; `Regions.PLOT_FLOOR_PEN`, 2.2).

- `lut`: `Float32Array(TONE_LUT_SIZE + 1)` (257); `lut[k]` = 1 / (target **screen** pitch in mm) at
  `I = k / 256`, 0 meaning blank. Linear interpolation in I. A law's LUT reproduces that law's pose-mode
  tone map (mono laws: `makeCtx` `areaFor`/`pitchFor`; ladder: `Regions.band` + `coverageFor` with the
  tone ladder). The LUT depends on `p.tone`, style and pen width, **not** on the bake; it is memoized by
  `SurfaceLock` on `(bakerId, toneKey)`.
- `scaleFn(n_w, p_w, e_w) -> [0, 1]` or null: optional view-dependent coverage multiplier (the ladder's
  specular glint cap; `e_w` = unit vector from `p_w` toward the eye, world space).
- Per vertex demand: `t_v = (p0 * s_v * lut(I_v) * scale_v) ^ q`, `q = log2(gain)` (1 for pitch, 2 for area).
- Foreshortening cap (plot floor): `T_v = (p0 * s_v * c_v / floorPitch) ^ q`; `t_eff_v = min(t_v, T_v)`.
  Screen spacing of the drawn subset therefore never falls under the floor, however the surface turns.
- Run key: `k(level 0, r) = r`; `k(L >= 1, r) = gain^(L-1) * (1 + (gain - 1) * r)`. Level 0 spans [0, 1),
  level L spans [gain^(L-1), gain^L), so a larger key is always a finer mark.
- A point at parameter u of segment i -> i+1 is drawn iff it is visible (§6, §7) and `k < t_eff(u)`, with
  `t_eff` linear in u between the vertex values. A crossing sits at `u* = (k - t_i) / (t_{i+1} - t_i)`;
  the emitted endpoint is the linear interpolation of the camera-space and screen positions at u*.
  (Run steps are <= 0.5 mm; sagitta error for R >= 10 mm is < 0.004 mm.)
- With constant `t`, the drawn fraction of each level's runs equals the fraction of ranks below the
  threshold (the bakers' rank distribution must make that subset spatially even; §9).

## 6. Frame pipeline and output

`SurfaceLock.frame(markSets, pose, view) -> lines` (Level F) runs, per MarkSet, per run, per vertex, in
Float64: transform (§4), validity, facing `c_v > 0`, grazing cull `c_v >= NZ_CULL` (0.08), tone gate (§5),
projection. Every cut (facing, grazing, tone, near plane) is placed at the interpolated crossing of the
quantity that caused it; nothing leaves the silhouette. Sub-runs shorter than `meta.minMarkMM` on screen
are dropped.

`view = { toneFn, tone: { lut, scaleFn }, penWidth, objectId, specOff?: boolean }`.

### 6.1 Level F output (the `SurfaceFill.buildObject` line contract)

An array of lines; each line is `Array<{ x, y, z }>` (screen mm, camera z) with `line.back = false`.
A `CLOSED` run whose whole loop is drawn stays closed (first point repeated). A `DOT` run is drawn when
its single vertex passes, as a closed `meta.glyph.segs`-gon of screen radius `meta.glyph.r` around the
projected anchor (screen-round). Order: markSets order, then run order, then along-run order. The
caller sends the lines through `clipper.clipPath(pts, segCtx)` and `emitRuns` exactly as the curved
branch of `algorithms/scene3d.js` does today (lines 5173-5230), so fill meta, pens, stroke treatment
and HLR occlusion against other objects are unchanged code.

### 6.2 Level S output

`SurfaceLock.sceneFrame(p, bounds, ctx)` emits through callbacks the caller (`generateScene`) supplies,
so meta and treatments stay in one place:

```
ctx = {
  toneFnFor(objectId) -> (n_w, p_w) => I,
  emitFill(objectId, runs),            // runs: [{ pts: [{x,y,z}], visible: true }] (clipper result shape)
  emitEdge(objectId, edgeClass, runs), // edgeClass 'silhouette' | 'crease' | 'boundary'
  emitShadow(runs),
  seedFor(objectId) -> { salt, phase, off },
}
```

It returns `undefined`; `generateScene` returns its `out` as usual. Paint order: shadow, then per object
in `p.objects` order its fills then its edges (the order `generateScene` produces today).

## 7. Visibility per shape class

| Class | Level F | Level S |
|---|---|---|
| Convex chart primitive: sphere, ellipsoid, cylinder, cone, capsule, superellipsoid, pyramid | frame: facing + grazing; clipper does the rest | facing + grazing; no occlusion test for a lone object |
| Torus | frame: facing + grazing; clipper's `analyticOccluder` (`torusAnalyticHidden`) as today | facing + grazing + `TorusOcclusion.buildSelfOcclusionTest` per frame (W1-E measures; > 2 ms moves it to the buffer) |
| torusKnot, CSG, mesh, any non-convex | frame: facing + grazing; clipper `selfOcclude: true` as today | facing + depth buffer including the object itself |
| Faceted (box, plane, polyhedron, OBJ) | W3-A: per-face facing from the face normal; clipper as today | facing + depth buffer when more than one object or non-convex |
| Several objects | clipper (unchanged semantics) | depth buffer of every object's cached triangles, owner-excluded for a convex object's own marks |

Frame never performs inter-object occlusion in Level F (that would double-occlude).

Level S depth buffer (`SurfaceLockVisibility.occluder(meshBakes, pose)`): rasterise the cached
object-space triangles after the per-frame transform into a face-id + depth buffer of at most 512 x 512
cells over the projected scene bounds; a point is hidden when the buffer is nearer by more than
`DEPTH_BIAS_MM` (W1-E sets it in the config, measured against the HLR clipper); visibility changes along
a run are located to within 0.05 mm. Silhouette rule (all levels): no fill endpoint lies more than
0.15 mm outside the hull of the drawn silhouette ink (the `scene3d-fill-silhouette-overshoot` bar).

## 8. Bake spec, key and cache

```
BakeSpec = {
  objectId, primitive, mode, sizes, detail,  // curvedChartParams(obj) + obj.primitive (faceted: faces from the mesh)
  scale: { sx, sy, sz },                     // transform.scale / sx / sy / sz resolved like Scene.applyObjectTransform
  mapper, toneLaw,                           // toneLaw = Params.resolveToneLaw(sp); alias params folded into style
  style,                                     // normalized style params; markSpace removed
  penWidth,                                  // bounds.penWidth
  scaleRef,                                  // 2^round(log2(zoom * (persp ? focal / (focal + dist) : 1)))
  seed,                                      // Geometry3D.snapshotSeedState() at the record (generateScene sets it per record)
}
```

- `bakeKey(spec) = JSON.stringify([BAKE_VERSION, bakerId, primitive, mode, sizes, detail, scale, mapper,
  toneLaw, stableStyle, penWidth, scaleRef, seed])`, where `stableStyle` has sorted keys. Not in the key,
  and therefore never read by a baker: pose, camera angles, zoom inside one octave, lights, `p.tone`,
  shadow, ground, other objects, `objectId`.
- Zoom: a zoom inside the octave of `scaleRef` does not re-bake; tone stays screen-calibrated through
  `s_v` (§5). The finest level is designed for `scaleRef * ZOOM_HEADROOM`.
- Cache: module-level LRU in `SurfaceLock`, by bytes (`CACHE_MB`, `CACHE_MB_MOBILE` when
  `SpinRing.isMobile()`), shared across groups, alive in main thread and worker separately. A hit is
  identical to a re-bake by determinism (§3), so the cache can never change output. `clearCache()`
  empties it; the engine needs no per-group bake state.
- Bake runs synchronously on a cache miss (v1). An off-thread pre-bake through `ComposeClient` may be
  added later (MarkSets are transferable) without changing this contract.

## 9. Baker interface

```
Baker = {
  id: string,
  FIT: [ { mappers: [...], laws: [...], primitives: [...], refuse?: { <styleKey>: [values] } } ],
  supports(spec) -> boolean,           // true exactly for FIT rows minus refuse rules (a test checks both ways)
  bake(spec) -> MarkSet,               // pure, deterministic, §2 meta filled
  toneLUT(spec, toneCtx) -> { lut, scaleFn },  // toneCtx = { tone: p.tone (normalized), penWidth, highlight }
}
```

Dispatch: `SurfaceLock.BAKER_KEYS = ['SurfaceLockMezzo', 'SurfaceLockLadder', 'SurfaceLockLaws',
'SurfaceLockFaceted']`; the first `supports(spec)` wins.

Level design (all bakers): `p0` = the law's lit maximum screen pitch / `scaleRef`
(mono: `PMAX = max(FLOOR * 1.6, LIT_MAX_PITCH_PEN * pen / DS)`, `DS = clamp(densityScale, 0.25, 4)`);
levels `L = 1 + ceil(log2(p0 * scaleRef * ZOOM_HEADROOM / floorPitch))`, capped at `MAX_LEVELS`.
Level l adds marks so that all levels <= l reach pitch `p0 / gain^l` (lines: `gain` 2, Jobard-Lefer or
ruling bisection; dots: `gain` 4). Ranks inside a level must make every threshold subset even (bit
reversal `vdc2` over a spatially ordered index, or greedy farthest-point order). Not a hash.

- **Mezzo (`lawMezzoLocked`, W1-C).** Region seeds by 3D dart throwing over the surface in object mm,
  `REG = max(3.0, R * 0.20) / scaleRef` with R the minor half-extent of `meta.bounds`; at most 200 seeds;
  six angles 30 degrees apart. A region's direction is a constant 3D vector `d_s` (the seed's
  `fillAngle + ai * 30` direction in its tangent plane, measured from `dP/da` normalised, or from the
  object +X axis projected into the plane when `|dP/da|` is degenerate). At a point q in that region the
  field is `d_s` projected into q's tangent plane (a line field, sign-continuous). Streamlines integrate
  that field in (a, b) through the chart Jacobian with verified steps (`stepTo` pattern, STEP 0.34 mm,
  tolerance 2.5x, 5 halvings), stop at `0.80 * d_l` from other lines, seed at `0.95 * d_l`, at most
  2600 steps per line. Crosshatch: a second family at `+ (CROSS_OBJ_DEG + crossDelta - 90)` degrees with
  its own occupancy. The look changes on purpose: lines wrap with the form.
- **Ladder family (W1-D):** hatch, crosshatch, contour, spiral, stipple. Rulings from
  `angleFamily`-style lines in (a, b) with the count set from the object-space metric (not the projected
  median pitch). Ruling i of the finest level gets its level and rank from its index (bit structure,
  `vdc2`). Resampled by object-mm arc length (step <= 0.5 mm). The 65 degree cross is built in the
  tangent plane (it reads near-square at poles; accepted). Stipple dots are `DOT` runs on a nested
  lattice (`gain` 4). The pose-mode `ladderStep` accumulator, feather and hysteresis are not ported (they
  are sequential, not nested); the locked ladder is a new look of the same density law.
- **Faceted (W3-A):** one 2D generator per face in the face plane, frame anchored to object axes.
- **Laws (W3-B):** good-fit laws as tone gating along locked rulings.

## 10. Shadow (`SurfaceLockShadow`)

- `supports({ shadow, light, ground, casters })`: one directional light with `castShadows`,
  `|lightDir.y| >= Shadows' MIN_ABS_DY`, `shadowLayers: false`, a ground, every caster a chart or box
  primitive. Otherwise the scene is not Level S (Level F keeps `Shadows.build`).
- `bakeGround(groundSpec, shadowCfg, penWidth, seed) -> GroundHatch`: hatch lines fixed in **world ground
  coordinates** (plane y = 0, angle `shadowAngle` about +Y from +X, spacing from `shadowDensity` by the
  same rule `Shadows` uses) over the ground extent, nested by level and rank like a MarkSet (gain 2) for
  the tone-depth grading. Pose-free; key = ground size, shadow config, pen width, seed.
- `frameShadow(groundHatch, casters, lightDirWorld, pose) -> { world: Float64Array(x0, z0, x1, z1 ...),
  runs: [{ pts, visible: true }] }`: per caster footprint on y = 0 along the light (sphere: exact
  ellipse; convex mesh: convex hull of the projected cached vertices), union by merging per-line
  intervals (no `FillBoolean`), grading by `shadowToneDepth`/`shadowFalloff` as level gating on distance
  from the contact point, then projection of the interval endpoints (a ground segment stays straight).
  The lines never move under a camera orbit; only the footprint does when light or caster moves.
- Receive shadow (W3-C): light-space depth map, rebuilt only when an object or the light moves (never on
  a camera orbit), feeding `toneFn` through the record's `shadowFn`.

## 11. Stats counters (`SurfaceLock.stats`, `resetStats()`)

`bakes` (bake calls), `bakeHits`, `bakeMisses`, `frames` (`frame` calls), `sceneFrames`, `verticesIn`
(vertices visited), `verticesOut` (points emitted), `runsIn`, `runsOut` (sub-runs emitted),
`culledFacing`, `culledGrazing`, `culledTone`, `culledOccluded` (vertices), `msBake`, `msFrame`
(cumulative), `msFrameLast`, `cacheBytes`, `cacheEntries`, `evictions`. Counters are deterministic for
a given input (tests assert them); ms values are informational.

Budgets: default sphere Level S `sceneFrame` <= 8 ms, two objects <= 16 ms, bake <= 400 ms (desktop).
Perf tests assert counters and generous clocks (no wall-clock ratios; see `tests/perf/scene3d-drag.test.js`).

## 12. `markSpace` style key, effective mode, FIT table, compatibility

- Style key `markSpace`: `'pose' | 'surface'`. `clampStyleParam`: `value === 'surface' ? 'surface' : 'pose'`.
  Normalisation never injects it; **absent means 'pose'** at every reader (`sp.markSpace === 'surface'`).
  It is distinct from the existing `wrap: 'surface' | 'flat'` key.
- `SurfaceLock.effectiveMarkSpace(style, ctx)` is `'surface'` iff the style asks for it, some baker
  `supports(spec)`, and no exclusion applies. Exclusions v1 (data in `SurfaceLock.EXCLUSIONS`): x-ray
  visibility; highlight treatment other than `blank`/`none`; `highlightMode: 'lightDriven'`; `toneBands`
  > 0; `tierPens`; `wrap: 'flat'`; contour `region`; spiral flat clip; emissive core blank; CSG carve;
  receive-shadow (until W3-C); area lights; `lawDraft`-only paths. Excluded styles render pose mode.
- FIT v1 (rows owned by each baker's `FIT`):

| Fill | Mappers | Fit | Owner |
|---|---|---|---|
| ladder (default law, aliases folded by `resolveToneLaw`) | hatch, crosshatch, contour, spiral, stipple | good | W1-D |
| `mezzoRegion` | hatch, crosshatch, contour | good (look change) | W1-C |
| faceted ladder | box, plane, polyhedron | good | W3-A |
| `dutyConst`, `endShorten`, `mergeLadder`, `phaseBlue`, `creviceAO`, `jitterOverdraw`, `transReserveMono`, bundles | hatch, crosshatch | good | W3-B |
| `contField*`, `voronoiWeb`, `mazeFill`, `turingStripe` | | fair, later | — |
| `etfKang`, `contourFlow`, `defectSplit`, `hachureSlope`, `shearClear`, `contactBloom`, `originSpiral`, contourSlice, wrap flat, burst, graded shadow zones, width/ribbon/nib laws | | pose only | — |

- **Compatibility.** `SCENE_VERSION` 6; `SCENE_MIGRATIONS[5]` stamps `markSpace: 'pose'` on every style
  object that lacks the key: `styleTable.scene`, `styleTable.byObject[*]`, `styleTable.byFace[*]`, an
  object3d leaf's `style` and `faceStyles[*]`, a booleanGroup3d's style. `sceneVersion: 6` in both
  `ALGO_DEFAULTS.scene3d` and `ALGO_DEFAULTS.object3d`. Saved files and presets (sceneVersion 1-5) render
  byte-identically; pose goldens never change.
- **Creation default (W3-E).** New objects get `markSpace: 'surface'` through `ALGO_DEFAULTS.object3d.style.params`
  (a creation default; import replaces params wholesale, so no saved document sees it). The scene-scope
  style (`styleTable.scene`, which the ground inherits) is not seeded.
- **FIT growth rule.** Adding a row to any `FIT` changes the render of saved documents that asked for
  `surface` on that pair. Such a change must bump `SCENE_VERSION` with a migration that pins `'pose'` on
  exactly those styles.

## 13. Level S: `frameable`, `sceneFrame`, engine and renderer

- `frameable(p, bounds)`: every object's every fill group is effective `surface` or draws no fill
  (`none`, `wireframe`); every object is a class `SurfaceLockVisibility.supports` accepts; lights are
  directional or ambient; cast shadow is off or `SurfaceLockShadow.supports`; edge styles drop hidden
  edges (dashed hidden edges need the clipper); no border, no emissive, no contourSlice, no booleans, no
  backdrop. The list is data in `SurfaceLock` (W1-A) and grows only with tests.
- Per frame `sceneFrame` does: per object `poseOf`, `frame` the cached MarkSets, `occluder` when needed,
  `outline` (sphere and ellipsoid: analytic limb; others: silhouette and crease edges of the cached mesh,
  classified per frame), ground outline (world-fixed, projected), `frameShadow`. Mesh, edge adjacency,
  ground hatch and MarkSets are cached object-space data (`SurfaceLockVisibility.meshBake`).
- Engine (W2-B): a group whose scene has any effective-surface fill composes preview frames at tier
  `'full'` (no draft tier, no PosePreview warp or snapshot), so the drag frame is the export. SpinRing is
  skipped for frameable scenes (renderer `_spinMaintain`/`_spinTarget`). Pose-only scenes keep every
  existing path.

## 14. Required tests (RGR witnesses)

Shared rig: `tests/helpers/surface-lock-scene.js` (`buildSurfaceLockScene` through `engine.addLayer`,
`dragEqualsExport`, `signature` which includes meta). Each test names the section it guards.

1. Bake count stays 1 across a 36-yaw sweep and a light-azimuth sweep (§8).
2. Drag frame equals a fresh full compose at the 8 `DEFAULT_POSES` (`dragEqualsExport`, §0, §13).
3. Object-space mark positions are invariant across poses: inverse-transformed fill points lie on the
   MarkSet within 1e-6 mm (§4).
4. Tone monotonicity per I band, area-normalised (the `scene3d-mono-tone-gradient` pattern, §5).
5. No silhouette overshoot > 0.15 mm (the `scene3d-fill-silhouette-overshoot` pattern, §7).
6. Plot floor: no two drawn fill runs closer than `0.8 * floorPitch` on screen away from 0.5 mm of the
   limb (§5 cap).
7. Migration v5 -> v6 stamps `'pose'`; v6 documents load unchanged; presets render unchanged (§12).
8. The pose golden corpus and tone baselines are unchanged (existing audits).
9. Perf counters and generous clocks for frame, sceneFrame and bake (§11).
10. Scaffold invariant (already committed): a style asking for `surface` whose effective mode is `pose`
    renders exactly like one without the key.

## 15. Corrections to the design note (found while reading the code)

1. Non-fill per-pose work is 60-110 ms on the default sphere (§0). Locking fills alone cannot meet 8 ms;
   Level S (whole-scene frame) is required, and Level F is the safe fallback.
2. Object scale is a bake input, not pose. The frame is rotation + translation (one 3x3 + T), and
   locked normals are correct under non-uniform scale (pose mode's `rotObj`-only normal is not; pose
   mode is left as is).
3. Tone is not baked. The bake key excludes `p.tone` and lights; a per-law tone LUT (§5) is applied per
   frame, so light or tone edits never re-bake.
4. Level F reuses the HLR clipper for occlusion; the depth buffer is only for Level S.
5. Zoom is handled by a `scaleRef` octave in the key, not a re-bake per zoom step.
6. `silhouetteProjectLocal` is closure-private in `algorithms/scene3d.js`; Level S outlines are built in
   `SurfaceLockVisibility` instead of exporting it.
7. `wrap` already means `'surface' | 'flat'`; `markSpace` is a separate key and the UI must not call it
   "wrap".
8. The per-run `Uint32 (level << 24 | rank)` becomes `Uint8` level + `Uint16` rank (same bytes, no
   bit-packing).
9. `pose-preview.js` and `spin-ring.js` already live in this branch.
10. The pose ladder's `ladderStep` accumulator is sequential, not nested; the locked ladder uses `vdc2`
    ranks (a new look of the same density law).
11. The default new object is ladder `hatch`, not mezzotint, so the default flip depends on the ladder
    baker (W1-D), not only the mezzo one.
12. Fill Curves (`fillCurves: true`, seeded on every new rounded object) curve-fits every fill path in
    `_applySceneCurveFinish` per compose; its per-frame cost on 30-60k drawn points is unmeasured and may
    dominate Level S (W2-B measures; options in the plan).
