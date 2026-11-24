# Surface-locked Scene3D fills: implementation contract

Status: **shipped** on `feat/surface-lock` (owner decision: rollout option C); authoritative for the implementation.
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
| `runCapRank` | `Uint16Array(nr)`, **optional** | cap key of run r in [0, 1), same quantisation as `runRank`. Present only when `meta.capKey === 'ruling'` (A13); then the plot-floor cap (§5) is compared against it instead of against the run's tone key. Absent = the cap folds into the tone key, as before. `validate` checks its length; `byteSize` and `transferList` include it when present |
| `runFlags` | `Uint8Array(nr)` | bit 0 `CLOSED` (ring; frame closes it), bit 1 `DOT` (1-vertex anchor, drawn as a glyph), bit 2 `BACK` (reserved, x-ray; unused in v1) |
| `meta` | plain object | below |

`meta` (JSON-able; everything a frame needs besides the arrays):

| Key | Meaning |
|---|---|
| `p0` | level-0 surface pitch, scaled local mm (> 0, `validate` checks) |
| `gain` | density multiplier per level: 2 for line families (`toneModel 'pitch'`), 4 for 2D dot lattices (`'area'`) |
| `toneModel` | `'pitch'` or `'area'` |
| `scaleRef` | the bake-time projection scale the baker designed for (§8) |
| `capKey` | `'ruling'` (optional, A13): the run's cap key is `runCapRank`, not its tone key. Set by `dutyConst` only |
| `minMarkMM` | screen-mm floor for a drawn sub-run (`MIN_MARK_PEN * penWidth`); DOT runs exempt |
| `glyph` | for DOT runs: `{ kind: 'circle', r: <screen mm>, segs: <int >= 4> }` |
| `bounds` | `{ min: [x,y,z], max: [x,y,z], radius }` in scaled local mm |
| `convex` | boolean (record.convex of the object) |
| `msBake` | bake wall time (informational; never part of equality) |
| `debug` | optional; the **only** place a baker may keep private keys (e.g. mezzo `regions`, `regionSep`, `levelRuns`). `validate` and the frame ignore it |

A `CLOSED` run **must not** repeat its first vertex; the closing gap (last vertex to first) is <= the run step (0.5 mm). The frame tolerates a repeat but bakers must not emit one.

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
clamped to [0, 1]; `null` when tone is off, in which case the LUT is still evaluated with `I = 1`, so tone off draws the uniform Density pitch, not the floor); a **tone table** `{ lut, scaleFn }` from `baker.toneLUT(spec, toneCtx)`; `floorPitch =
PLOT_FLOOR_PEN * penWidth` (screen mm; `Regions.PLOT_FLOOR_PEN`, 2.2).

- `lut`: `Float32Array(TONE_LUT_SIZE + 1)` (257); `lut[k]` = 1 / (target **screen** pitch in mm) at
  `I = k / 256`, 0 meaning blank. Linear interpolation in I. A law's LUT reproduces that law's pose-mode
  tone map (mono laws: `makeCtx` `areaFor`/`pitchFor`; ladder: `Regions.band` + `coverageFor` with the
  tone ladder). The LUT depends on `p.tone`, style and pen width, **not** on the bake; it is memoized by
  `SurfaceLock` on `(bakerId, toneKey)`.
- `scaleFn(n_w, p_w, e_w) -> [0, 1]` or null: optional view-dependent coverage multiplier (`e_w` = unit vector from
  `p_w` toward the eye, world space). Reserved for a future live glint. Pose mode's glint cap is a function of I
  only (`coverageForSample`), and the view-dependent blank glint is dormant (`HL_STAGE.toneZones` off), so bakers
  fold the cap into the LUT and return `scaleFn: null` (the ladder does).
- Per vertex demand: `t_v = (p0 * s_v * lut(I_v) * scale_v) ^ q`, `q = log2(gain)` (1 for pitch, 2 for area).
- Foreshortening cap (plot floor), **whole-level quantised**: `T0_v = (p0 * s_v * c_v / floorPitch) ^ q`;
  `T_v = gain ^ floor(log_gain(T0_v / PLOT_FLOOR_SLACK))` for lines (q = 1), `gain^m` with m taken from T0 for area;
  `PLOT_FLOOR_SLACK` = 0.8 (config key in `SCENE3D_SURFACE_LOCK`; the §14.6 bar). For `T0 < 1`, thin level 0 by
  `gain^-m`. `t_eff_v = min(t_v, T_v)`. Rationale: a rank-thinned partial level puts neighbours at its own pitch,
  so a continuous cap would admit up to 0.5 x floor; a whole level is admitted only when its pitch is >= 0.8 x floor.
  `T` therefore changes stepwise between vertices; the linear interpolation inside one <= 0.5 mm segment can draw a
  partial level over that segment only.
- **Cap on the ruling rank (`meta.capKey === 'ruling'`, A13).** When a MarkSet carries `runCapRank`, the cap is not folded into the tone demand.
  The pre-pass keeps tone (`t_v`) and cap (`T_v`) as two per-vertex values, and a point of run r is drawn iff it is visible, `k_r < t_v` **and**
  `capRank_r < T_v`. Both are linear in u between vertices, so the segment is clipped at the first of the two crossings (two intersected
  intervals). Reason: `dutyConst` keys a run by its duty band, so folding `T` into the tone key dropped the outer duty bands of every dash
  (the limb ring went blank and the surviving centre bands fell under `MIN_RUN_MM`); the cap is meant to drop whole RULINGS, whose key space
  is the ladder rank. Without `runCapRank` the rule above is unchanged.
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
A `CLOSED` run whose whole loop is drawn stays closed (the frame appends the first point; the MarkSet does not store it, §2). A `DOT` run is drawn when
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
  emitGround(runs),                    // world-fixed ground outline, projected
  seedFor(objectId) -> { salt, phase, off },
  specFor(obj, spec) -> BakeSpec,      // W2-A spec builder hook (replaces the stub spec)
}
```

A fill run's depth (`sceneTarget` z) is the **maximum run z** (the nearest point of the run), as `emitFill` computes it (I7).

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

Level S builds the occluder when there is more than one object, any non-convex object (a lone torus needs it for
self-occlusion), or a cast shadow. Interfaces (`SurfaceLockVisibility`, final):

```
supports(obj) -> bool
meshBake(obj) -> MeshBake                       // pose-free; carries objectId, convex, analytic, torus
occluder(meshBakes[], { cam, objs: [obj pose per bake] }) -> Occ
  Occ.hiddenAt(x, y, z, seg) -> bool            // seg = Occ.segFor(bake) | { obj: -1, mode: 'fill' } for ground/shadow
  Occ.segFor(bake) -> { obj, mode: 'fill', f0: -1, f1: -1 }
  Occ.clipRun(pts /* [{x,y,z}] */, seg) -> [{ pts, visible }]
  Occ.closedMerge(runs) -> runs                 // for CLOSED loops
  Occ.indexOf(bake) -> int
outline(meshBake, pose, occ|null) -> { silhouette, crease, boundary }   // each already runs: [{ pts, visible: true, ... }]
```

Fills are clipped with `occ.clipRun(line, occ.segFor(bake))` (visible runs kept, `closedMerge` for loops; dropped
vertices count in `culledOccluded`). Edge runs from `outline` pass straight through. Shadow and ground runs carry
camera z and are clipped with `{ obj: -1, mode: 'fill' }`. The aux mesh cache is keyed by `objectId` as well as the
mesh parameters, so two identical objects never share one MeshBake (the occluder indexes bakes by identity).

Level S depth buffer (`SurfaceLockVisibility.occluder`): rasterise the cached
object-space triangles after the per-frame transform into a face-id + depth buffer of at most 512 x 512
cells over the projected scene bounds; a point is hidden when the buffer is nearer by more than
`DEPTH_BIAS_MM` (W1-E sets it in the config, measured against the HLR clipper); visibility changes along
a run are located to within 0.05 mm. Silhouette rule (all levels): no fill endpoint lies more than
0.15 mm outside the hull of the drawn silhouette ink (the `scene3d-fill-silhouette-overshoot` bar).

## 8. Bake spec, key and cache

```
BakeSpec = {
  objectId, primitive, mode, sizes,          // curvedChartParams(obj) + obj.primitive (faceted: faces from the mesh)
  scale: { sx, sy, sz },                     // transform.scale / sx / sy / sz resolved like Scene.applyObjectTransform
  mapper, toneLaw,                           // toneLaw = Params.resolveToneLaw(sp); alias params folded into style
  style,                                     // normalized style params; markSpace removed
  penWidth,                                  // bounds.penWidth
  scaleRef,                                  // 2^round(log2(zoom * (persp ? focal / (focal + dist) : 1)))
  seed,                                      // (`detail` is not part of the spec or key while no baker reads it)
                                             // Geometry3D.snapshotSeedState() at the record (generateScene sets it per record)
}
```

- `bakeKey(spec) = JSON.stringify([BAKE_VERSION, bakerId, primitive, mode, sizes, scale, mapper,
  toneLaw, stableStyle, penWidth, scaleRef, seed])`, where `stableStyle` has sorted keys. Not in the key,
  and therefore never read by a baker: pose, camera angles, zoom inside one octave, lights, `p.tone`,
  shadow, ground, other objects, `objectId`, `detail`.
- Zoom: a zoom inside the octave of `scaleRef` does not re-bake; tone stays screen-calibrated through
  `s_v` (§5). The finest level is designed for `scaleRef * ZOOM_HEADROOM`.
- Object scale is a bake input. During an **active scale gesture** the frame may apply the residual scale
  `diag(s / s_baked)` to the cached MarkSet (normals through the inverse-transpose) as a preview only; release
  re-bakes. This is the only sanctioned drag != export case.
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
  toneLUT(spec, toneCtx) -> { lut, scaleFn },  // toneCtx = { tone: p.tone (normalized), penWidth, noHighlight }
                                               // noHighlight = highlightCfg(sp).treatment === 'none' (pose `grpHLOff`)
}
```

`SurfaceLock.bake(spec)` returns `null` when no baker supports the spec **or the baker throws** (counted in `stats.bakeErrors`); the caller then renders pose mode. A baker throw never blanks the layer.

Dispatch: `SurfaceLock.BAKER_KEYS = ['SurfaceLockMezzo', 'SurfaceLockLadder', 'SurfaceLockLaws',
'SurfaceLockFaceted', 'SurfaceLockWebs']`; the first `supports(spec)` wins.

Level design (all bakers): `p0` = the law's lit maximum screen pitch / `scaleRef`
(mono: `PMAX = max(FLOOR * 1.6, LIT_MAX_PITCH_PEN * pen / DS)`, `DS = clamp(densityScale, 0.25, 4)`);
levels `L = 1 + ceil(log2(p0 * scaleRef * ZOOM_HEADROOM / minPitch))`, capped at `MAX_LEVELS`, with
`minPitch = max(PLOT_FLOOR_SLACK * floorPitch, the law's darkest pitch at coverage 1)` (tone-independent, so
bake-key-safe; mono: `INK / A_DARK`; ladder: the master pitch `max(floor, hatchSpacing / 5)`; stipple uses the area
model). `ZOOM_HEADROOM` = 1.5 (`scaleRef = 2^round(log2 s)` keeps `s / scaleRef` within sqrt 2; the rest covers
perspective spread). Levels the plot floor can never draw are not baked.
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
  tolerance 2.5x, 5 halvings), stop at `0.80 * d_l` from other lines (occupancy points are kept no sparser than
  `0.5 * stopR`, so a streamline cannot slip between two points of another line; the separation test measures
  point-to-densified-run distance), seed at `0.95 * d_l`, at most
  2600 steps per line. Crosshatch: a second family at `+ (CROSS_OBJ_DEG + crossDelta - 90)` degrees with
  its own occupancy. The look changes on purpose: lines wrap with the form. Density is an input: the caller folds
  `densityScale` (`monoDensityScale(monoDensityOf(sp))`, closure-private in `algorithms/scene3d.js`) into
  `spec.style.densityScale`; the baker reads it (`DS`) and stays pure. Without it the mezzo ignores Density.
- **Ladder family (W1-D):** hatch, crosshatch, contour, spiral, stipple. Rulings from
  `angleFamily`-style lines in (a, b) with the count set from the object-space metric (not the projected
  median pitch). Ruling i of the finest level gets its level and rank from its index (bit structure,
  `vdc2`). **Compression rule:** in a converging chart region (local perpendicular metric ratio `rho = pm / pmRef * chord`
  below `THIN_RATIO` 0.95) a ruling is relabelled, not cut: a vertex of nominal level `lvl` gets
  `j = max(0, ceil(log2(THIN_RATIO / rho)))`, effective level `lvl + j`, dropped only when `lvl + j > L - 1`; ranks
  inside the new level stay nested and even. A cut-only fan is forbidden because it removes tone near poles and
  torus holes. The baked p0 is the effective pitch after power-of-two ruling counts (up to +-41 % from nominal);
  `meta.p0` is authoritative. Resampled by object-mm arc length (step <= 0.5 mm). The 65 degree cross is built in the
  tangent plane (it reads near-square at poles; accepted). Stipple dots are `DOT` runs on a nested
  lattice (`gain` 4). The pose-mode `ladderStep` accumulator, feather and hysteresis are not ported (they
  are sequential, not nested); the locked ladder is a new look of the same density law.
- **Faceted (W3-A):** one 2D generator per face in the face plane, frame anchored to object axes.
- **Laws (W3-B):** good-fit laws as tone gating along locked rulings.

## 10. Shadow (`SurfaceLockShadow`)

- `supports({ shadow, light, ground, casters })`: one directional light with `castShadows`,
  `|lightDir.y| >= Shadows' MIN_ABS_DY`, `shadowLayers: false`, a ground, every caster a chart or box
  primitive. Otherwise the scene is not Level S (Level F keeps `Shadows.build`).
- `bakeGround(groundSpec, shadowCfg, penWidth, seed) -> GroundHatch`, `groundSpec = { width, height, scaleX, scaleZ, scaleRef }` (the extents `groundHalfExtents` reads): hatch lines fixed in **world ground
  coordinates** (plane y = 0, angle `shadowAngle` about +Y from +X, spacing from `shadowDensity` by the
  same rule `Shadows` uses) over the ground extent, nested by level and rank like a MarkSet (gain 2) for
  the tone-depth grading. Pose-free; key = ground size, shadow config, pen width, seed.
- `frameShadow(groundHatch, casters, lightDirWorld, pose) -> { world: Float64Array(x0, z0, x1, z1 ...),
  runs: [{ pts, visible: true }] }`: per caster footprint on y = 0 along the light (sphere: exact
  ellipse; convex mesh: convex hull of the projected cached vertices), union by merging per-line
  intervals (no `FillBoolean`), grading by `shadowToneDepth`/`shadowFalloff` as level gating on distance
  from the contact point, then projection of the interval endpoints (a ground segment stays straight). Run points
  carry camera z (`{x, y, z}`) so the caller can clip them against the objects (§7). Casters are world-space records
  (what `prepareCaster` accepts): `{ primitive, shape: 'sphere', center: {x,y,z}, radius }` (uniform-scale sphere
  only) or `{ primitive, shape: 'hull', points: [{x,y,z}] }` (`objR * p_scaled + t` over `meshBake.vertices`). The
  light-thinning factor `thin` is measured at the caster footprint centre (not world origin) and quantised to a
  power of two (`2^round(log2 thin)`), so the drawn subset is every 2^m-th line, evenly spaced.
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
- Final `SurfaceLock` surface: `effectiveMarkSpace(style, ctx)` with `ctx = { spec (required), mapper, visibility,
  emissiveCoreBlank, csgCarve, receiveShadow, areaLight }`; `bakeKey(spec)`; `bake(spec) -> MarkSet | null`;
  `toneTable(spec, toneCtx) -> { lut, scaleFn: null }`; `poseOf(transform, camera, bounds)`;
  `frame(markSets, pose, view)`; `frameable`, `sceneFrame`; `stats`, `resetStats`, `clearCache`, `setCacheLimitBytes`.
  Config keys `PLOT_FLOOR_SLACK` (0.8) and `ZOOM_HEADROOM` (1.5) and the `bakeErrors` counter are introduced by the
  review fix-ups; this document is their source of truth.
- `SurfaceLock.effectiveMarkSpace(style, ctx)` is `'surface'` iff the style asks for it, some baker
  `supports(spec)`, and no exclusion applies. Exclusions v1 (data in `SurfaceLock.EXCLUSIONS`): x-ray
  visibility; highlight treatment other than `blank`/`none`, tested **after pose normalisation** (`keep -> none`,
  unknown or empty -> `blank`); `highlightMode: 'lightDriven'`; `toneBands` >= 2 (pose bands only at >= 2); `tierPens`; `wrap: 'flat'`; contour `region`; spiral flat clip; emissive core blank; CSG carve;
  receive-shadow (until W3-C); area lights. Excluded styles render pose mode. The lock path never reads `draft`, `lawDraft` or the draft-gated `toneOn` (drag == export, §0), so there is no `lawDraft` exclusion.
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
- Engine (W2-B1): `AlgorithmRegistry.scene3d.levelS(params, bounds)` is `SurfaceLock.frameable` on the normalized
  scene (pose-invariant). A **Level S** scene (the gate holds) composes preview frames at tier `'full'` with
  no PosePreview warp or snapshot and at the settled quality (the renderer's draft drag quality is not
  used), so the drag frame is the export and the release settle is a compose-memo hit (no worker post).
  `group._sceneLevelS` carries the answer to the renderer, which starts no SpinRing for it. If a Level S
  generate falls back (`sceneFallbacks` moves), the group is pose until its next settled compose.
  **Partly frameable** scenes (some surface fill, but `levelS` false: a point light, a border, a second
  object that is pose, I2/I3 exclusions) keep the warp, the SpinRing and the draft tiers: under a warp the
  locked marks move with the surface, so the preview is near-exact and the settle is exact.
- **The hold covers interactive commits (FX-J2).** `app.regen` and the other interactive commit paths hold the previous ink (`layer._sceneInkPrev`) while the worker bakes; every other caller composes exactly, and export and save never hold.
- Level S and Level F fill paths carry `meta.surfaceLocked: true`; `Engine._applySceneCurveFinish` skips the
  Fill Curves fit for them (the marks are the surface's own; the fit cost 6-19 ms a frame). Border and edge
  curves are unchanged.

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

## 16. Amendments

- **A1. `stats.toneEvals`, `stats.toneRemapPow` (§11).** `toneEvals` counts per-vertex tone-function evaluations in the pre-pass
  (a tone-memo hit does not count). `toneRemapPow` counts perspective vertices that took the per-vertex `pow` branch of the cap tone remap
  (orthographic frames use a per-cap LUT and do not count). Both are deterministic counters.
- **A2. `meta.minSepFrac`.** A law may declare the minimum screen separation its bake guarantees, as a fraction of the nominal pitch. The
  frame's min-separation cap uses it; absent means 1. Mezzo declares `STOP_FACTOR x SEP_MARGIN` (0.80 x 0.97).
- **A3. `meta.floorPitchPen` (decision O1).** A law may declare its own floor pitch in pen widths, which replaces the plot floor in the
  pre-pass. Contract §14.6 (no two drawn runs closer than 0.8 x the floor pitch) is measured against this ACTIVE floor. Mezzo declares
  `(INK / A_DARK) / pen`.
- **A4. `meta.sepBarFrac` (the ladder, decision O3).** The ladder declares an informational spacing bar (`MIN_SEP_FRAC`) and no `minSepFrac`,
  so the frame cap never thins a ladder fill.
- **A5. `meta.capToneRemap`.** When true (mezzo), a cap ring squeezes the tone range [m, D] into [m, T] in log space, so tone stays
  monotone inside a cap instead of clipping at it (§5).
- **A6. The bake key strips tone-only keys (§8).** `bakeStyle` removes `toneGamma`, `toneContrast`, `shadowSensitivity`, every key starting
  with `depthFade` or `highlight`, and `markSpace` before the key is built, because tone is applied per frame (§15.3). The tone-table key
  keeps them. `detail` is not in the key.
- **A7. Exclusions `faceStyles` and `depthFade` (§12).** An object with per-face style overrides or several fill styles (`faceStyles`) cannot
  be covered by one MarkSet, and `depthFade` reads the projected record (view dependent), so neither can live in a world-keyed tone memo.
  Both fall back to pose mode.
- **A8. `BAKE_VERSION`.** `SCENE3D_SURFACE_LOCK.BAKE_VERSION` is the first element of the bake key. Bump it whenever a baker's output
  changes, so a cached MarkSet from an older baker is never reused. It is 4 since FX-J1 (A13); 3 since W3-B (laws MarkSets carry `toneScaleFree` / `joinTouching` and emit dash bands in ruling order); 2 since FX-P (mezzo p0 x 1.2,
  active-floor level count, `MIN_MARK_PEN` 4).
- **A9. W3-B routing (§9, §12).** `dutyConst` and `endShorten` on `hatch` and `crosshatch` reach `SurfaceLockLaws` through the ordinary
  path: `Scene3D.Params.resolveToneLaw` -> spec `toneLaw` -> `bakerFor` (so `frameable`, `effectiveMarkSpace`, `explainMarkSpace` and the
  panel gate all say 'surface'), in Level F (`buildSurfaceLockSpec`) and Level S (`specOfObject` + `levelSSpecHelpers`). The spec carries
  `style.densityScale` (folded in by the caller, as for mezzo), `penWidth` and `scaleRef`; `toneLaw` is in the bake key (§8). Level S equals
  Level F for both laws. `mergeLadder` and `phaseBlue` stay baked-but-dormant: they are not in `SCENE3D_TONE_LAWS`, so no style can select
  them, and nothing routes to them.
- **A10. `meta.toneScaleFree`.** A MarkSet may declare that its tone is a function of the light alone. The pre-pass then evaluates
  `t = p0 * meta.scaleRef * LUT(I)` instead of `p0 * s * LUT(I)` (s = the vertex's screen scale), so a zoom inside one scale octave does not
  move the tone (before: up to +-41 %). The plot-floor cap still uses the live `s`. Absent or false keeps today's behaviour for every other
  law. The fixed-pitch laws (`dutyConst`, `endShorten`) declare it and carry `meta.scaleRef`.
- **A11. `meta.joinTouching`.** When true, the frame joins the first emitted piece of run r to the last emitted piece of run r-1 if their end
  points coincide (1e-4 mm). `dutyConst` cuts a dash into centre-out duty bands, each its own run (its own gate key); drawn together they
  are one dash, and without the join every band is shorter than the compositor's `MIN_RUN_MM` (0.6) and the object drew nothing. The laws
  baker emits the bands in order along the ruling (outer-left .. centre .. outer-right) so touching bands are consecutive runs.
- **A13. `runCapRank` / `meta.capKey` (FX-J1).** Optional MarkSet field and meta key (§2, §5). `dutyConst` stamps every duty band of ruling r
  with `runCapRank = keyOfRun(ladder, r) / gate` (the ruling's even-subset rank in [0, 1)) and sets `meta.capKey = 'ruling'`; the frame then
  tests the plot-floor cap against that rank. `endShorten`, `ladder`, `mezzo` and the other bakers do not emit it (their keys already are ruling ranks)
  and their output is byte-identical. `BAKE_VERSION` is 4 since this change (dutyConst MarkSets gain `runCapRank`). The scale-gesture hold (deferred) that
  earlier notes called "A8" is not this amendment and will take A14 or later.
- **A12. `SCENE3D_SURFACE_LOCK.FACETED` (W3-B).** The faceted baker's tunables live in the config table, read through `cfg().FACETED`:
  `STEP_MM`, `EDGE_MM`, `MIN_RUN_MM`, `MAX_VERTS`, `CROSS_OBJ_DEG`, `PHASE_FAM1`, `GAIN_LIT`, `GAIN_SPAN`, `PLOT_FLOOR_SLACK`, `ZOOM_HEADROOM`
  (the last two are the module's own copies, no longer read from the top level). Output is byte-identical to the former module-local values
  (fingerprints `facetedBox`, `facetedCross` in `scene3d-surface-lock-config.test.js`).
- **A14. The scale rule (W2-B3), deferred.** A Scale slider or gizmo scale on a locked object re-bakes, so the ink holds until each worker bake lands (ladder about 100-250 ms, Mezzotint about 0.5-0.8 s). A live scale preview is not built (PRH-131). Earlier notes (the W2-B2 commit, w2c-review) called this "A8"; A8 is `BAKE_VERSION`.
- **A15. `explainMarkSpace` and `exclusionCtx`.** `SurfaceLock.explainMarkSpace(style, ctx)` returns `{ mode, reason }` with the same decision as `effectiveMarkSpace`: `reason` is `'markSpace'` (the style asks for pose), an `EXCLUSIONS` id, `'no baker'`, or `'surface'`. The panel maps the reason to plain words (`MARKSPACE_REASONS`). The exclusion context (`exclusionCtx`) (`SurfaceLock.exclusionCtx(p, obj)`) carries the scene-level flags the style alone cannot know: `visibility`, `emissiveCoreBlank`, `areaLight` and `receiveShadow` (the last two added by FX-J5 so the Lock row and the engine agree; `csgCarve` and `faceStyles` come from the caller).
- **A16. Tone model v2 wiring (light realism H1).**
  - *Spec and key.* `spec.toneModel` is `'v2'` for a scene whose `p.tone.model` is `'v2'` (`specOfObject`, `sceneBakeSpecs`, `sceneFrame`; `SurfaceLock.toneModelOf(p)`); a legacy scene's spec carries no `toneModel`. `bakeKey` appends `'v2'` as a 13th element only for v2, so a legacy and a v2 spec never share a cache entry and every legacy key is byte-identical to an older build's.
  - *Glint (`toneTable`).* `toneCtx.light = { model, lights, shininess, ks, s0, s1, shadowKey?, shadowFnFor? }` (built by `SurfaceLock.lightCtxOf(p, recv)`; null for legacy). For `model 'v2'`, `ks > 0`, no baker `scaleFn` and no `noHighlight`, the table's `scaleFn(n_w, p_w, e_w)` is `Regions.specularKeep(S, s0, s1)` with S the Blinn-Phong term of `Regions.shade` (pinned equal by test), so the glint is paper. The LUT memo key sees only `light.model` and "no lights"; the `scaleFn` closure is a second memo keyed by the light, so a light move rebuilds a closure and never a LUT. `shadowFnFor(n_w)` blocks the glint inside a cast shadow, as `shade` does.
  - *Diffuse tone memo.* In a v2 scene the frame's `toneFn` is `SurfaceLock.toneFnV2(p, spec, recv)`: `Regions.shade(..., { model: 'v2', eye: null, ambient: p.tone.ambient, bounce: p.tone.bounce, shadowFn }).L` followed by the style's tone shape. `eye: null` keeps it view independent, so the per-vertex memo survives a camera orbit (a repeated sweep costs `toneEvals` 0). The memo key is the hub's `toneKey` plus `model`, `ambient`, `bounce` and the receive key.
  - *Receive shadows (lifts the `receiveShadow` exclusion for v2).* `exclusionCtx(p).receiveShadow` is false for a v2 scene when `SurfaceLockShadow.receiveMap` and `ShadowReceive.buildDepthMap` exist; a legacy scene keeps the exclusion (it stays the pose look). Per receiver, `receiveCtxFor` builds the map over the OTHER objects (pose excludes the receiver's own geometry as well) with `casters[].key` = the caster's `[id, primitive, params, transform]` key, fetched lazily on the first tone miss: an orbit never builds or looks it up, a light move or a caster move rebuilds it once per receiver. The map is a 4-entry LRU in `SurfaceLockShadow`, so a scene with more than 4 receivers rebuilds maps on every light move (not on orbit).
  - `SurfaceLock` also exports `exclusionCtx`, `toneModelOf`, `lightCtxOf`, `toneFnV2`, `receiveCtxFor`. The Level F dispatch in `algorithms/scene3d.js` (H2) uses the same helpers.
- **A17. Facing compensation (v2).** With `view.toneModel === 'v2'` the pre-pass scales the tone demand by `g(c) = 1 + k (2c / (1 + c) - 1)`, `c` the facing cosine, `k = SCENE3D_SURFACE_LOCK.V2.FACING_COMP` (1). A mark set of constant surface pitch puts about `1 / c` more ink into a foreshortened patch; the mean foreshortening of a tangent-plane mark of any direction is `(1 + c) / 2`, so equal tone reads equal ink per screen area at the limb and the centre (M7). Applied before the plot-floor cap. Without `toneModel` the demand is untouched.
- **A18. Cap remap for paper-ended LUTs.** `capToneRemap` squeezed the tone range [m, D] into [m, T] in log space and skipped when `lut[LUT_N] == 0` (a v2 LUT ends at paper, so there is no log floor). It now scales the whole range by `T / D` in that case (the darkest tone lands on the cap, lighter tones keep their order, paper stays paper). Legacy mezzo LUTs end above 0 and take the old branch.
- **A19. Config.** The v2 baker constants moved into the baker tables of `src/config/scene3d-surface-lock.js` (`LADDER.V2_P0_PEN/V2_DENSITY_EXP/V2_PAPER_BAND`, `LAWS.V2_TOL_MM/V2_MAX_SEG_MM/V2_PAPER_BAND`, `MEZZO.V2_PAPER_BAND`, `FACETED.DOT_SEGS/SPIRAL_MIN_S`); the modules already read their table with their literals as fallback, so no module edit was needed. New frame tunables live in `V2` (`FACING_COMP`).
- **A20. FIT growth gated on the tone model (light realism Wave D1); amends the §12 FIT growth rule.** `SurfaceLockLaws.FIT` has a second row with `v2Only: true`: `mkTick`, `mkDotScreen`, `mkDashRamp`, `mkScribble`, `bundleCount` on hatch / crosshatch and the six curved primitives (tripleHatch refused). `supports(spec)` is true for it only when `spec.toneModel === 'v2'`. A legacy or saved scene never carries `toneModel`, so it keeps its exact pose output: **no `SCENE_VERSION` migration** is needed for these rows (the bake key already carries `'v2'`, A16).
- **A21. Stride cap + crowd guard for ruling-capped v2 laws (light realism look tuning); amends A13.** A laws MarkSet whose meta says `capContinuous: true` (v2 `dutyConst`, `mkTick`, `mkDashRamp`, `mkScribble`, `mkDotScreen`, `bundleCount`) packs a CAP WORD into `runCapRank`: the ruling's spatial ordinal (low 12 bits; the kept rulings numbered side by side, recovered from the ladder's (level, bit-reversed rank)) and the local pitch ratio (high 4 bits, 1/8 steps rounded down: the distance to the neighbouring rulings over the nominal pitch, baked in object space). The frame no longer thresholds a key: it draws ruling `i` where `i % g === 0`, `g = ceil(1 / (local demand))`, with the demand `p0 * sv * fac * rho / (floor * CAP_STRIDE_SLACK)` and `fac = facing / sqrt(1 - (t . view)^2)` (the true screen gap between rulings), so the drawn rulings are exactly regular and only the rounding of `g` is lost (the octave quantisation of the dyadic cap lost about 30 % of the limb ink). `meta.capGuard: true` (`dutyConst` only, where the rulings ARE the marks) adds a screen-space crowd guard in `frameSet`: the runs are visited by (family, ordinal) and a stretch of a ruling is kept only where it stays `CAP_GUARD_FRAC x floor` away from every kept stretch of another ruling of the same family; it needs no extra state and is deterministic, so Level S == Level F. `dutyConst` v2 cells are also keyed per GROUP of cells (a sawtooth, `V2_DASH_GROUP_MM`) so a tone draws one long dash per group, not scattered cells. v2 only; legacy MarkSets carry neither flag, so their output is unchanged (no `SCENE_VERSION` change).
  - *Marks.* The rulings are the ladder's at the law's row pitch (one level, as `dutyConst`). A mark lattice sized for the pitch the rulings actually have (`meta.rho` = baked / designed pitch) reaches the shared v2 target's dark end (`pen / peff`, the `dutyConst` v2 ink). A tone draws the fraction `D(I)` of the marks (`targetOf`, no lit floor): a mark is on iff its low-discrepancy key is below `D`, so the marks at a tone are a subset of those at every darker tone. `toneLUT` is `D(I) / rowPitch` (tone OFF: uniform Density, as `dutyConst` v2); `meta.toneScaleFree`, `capKey 'ruling'`; the glint is the H1 `scaleFn` (the baker returns none).
  - *Laws.* Every law keeps its pose character with tone carried by mark SIZE, in nested pieces (a superset at every darker tone; piece `j` of a mark on iff `D > cum_j + u * inc_j`, `u` a per-mark low-discrepancy value, so the expected coverage is exactly `D`). Tick: a comb stroke across the rows per cell, drawn at half then full length. Dot Screen: a regular dot per cell whose size grows as 4 nested rings. Dash Ramp: five runs per cell (outer, flank, core, flank, outer): dot, dash, continuous ruling. Scribble: three nested triangle waves (amplitude a/3, 2a/3, a) along the WHOLE ruling, so a wave thins out where the tone lightens and is never chopped into dashes. Bundle Count: 3 parallel passes per ruling (5 max after the pitch correction), pass `j` on iff `(j + r) / n < D`.
  - *Not locked (needs a per-run width channel in the MarkSet and frame, which carry none):* `weightModulated`, `taperedEnds`.
  - *Frame change (`joinTouching`).* The minimum-mark cull of the LAST piece of a run is deferred until the next run has had the chance to extend it (`flushTail`), so touching pieces are merged before being judged. Before, a short piece beside a drawn neighbour was dropped on its own. Runs that do not set `joinTouching` are untouched.
- **A22. The v2 dark end (owner decision "go darker"); amends A16-A21.** The shared v2 dark end is ~0.65 ink coverage at Density 50 (it was 0.43; legacy ~0.8). One table, `SCENE3D_SURFACE_LOCK.V2`: `FLOOR_PEN` 1.4 (the v2 plot floor, pens; the cap admits a level at `PLOT_FLOOR_SLACK x` this = 1.12 pens, the ink width) and `GUARD_PEN` 1.3 (the frame's crowd guard in pens when `view.toneModel === 'v2'`; legacy keeps `CAP_GUARD_FRAC x` the floor). The frame, the ladder, the faceted baker and the laws baker read them for a v2 spec only (`spec.toneModel === 'v2'`); legacy keeps `Regions.PLOT_FLOOR_PEN` (2.2). Ladder: the darkest pitch is `DARK_MIN + TAIL g^TAIL_EXP + (P0 - DARK_MIN - TAIL) g^EXP`, `g = 1 - d/200` (`LADDER.V2_*`; Density 50 -> 1.55 pens, 100 -> 1.4, 200 -> `max(V2_DARK_MIN_PEN, GUARD_PEN)`), the level count reaches it (a law's ruling set passes `spec.lawFinest`), and the level-0 ruling count is any integer (legacy: a power of two). Crosshatch families each carry `1 - sqrt(1 - c)` so their union is the single-family dark end. Laws: `LAWS.V2_DUTY_PITCH_FLOOR/V2_END_PITCH_FLOOR` 0.95 x the v2 floor, `V2_PAPER_BAND` 0.18, tone-off mark fraction `V2_OFF_FRACTION`. Mezzo: `MEZZO.V2_P0_SCALE` 0.99 (finest level at ~1.5 pens). The pose ladder's v2 curve (`surface-fill.js` v2Curve) mirrors the ladder formula; the pose plot floor and the mono laws keep 2.2 (open). Measured limb/centre gap at the dark end: ~0.24 when this landed; closed afterwards by the mean-foreshortening octave cap and the limb knees (`C.V2_KNEE`, mezzo `K.V2_LIMB_KNEE`, v2 only; M7 gate).
- **A22a. dutyConst v2 at the dark end: one tone, one coverage; lines may touch (owner decisions "keep darker, allow touching"); amends A21, A22.** Defect: the frame's 1.3-pen crowd guard sat at the lattice's face-on screen gap (~1.34 pens), so it kept every ruling where the foreshortened gap cleared it and every other one elsewhere: a 2x density step along a facing contour (a dense oval, voids around it). The v2 `dutyConst` MarkSet now declares `capCompensate: true`, `strideSepPen` (`LAWS.V2_DUTY_SEP` x the nominal ruling pitch, ~ the baked face-on pitch; 1.0 since v1.5.30, was 1.08: the cap word quantises the local gap ratio down in 1/8 steps, so at 1.08 face-on cells straddled `c` = 1 and p90/p10 reached 1.35-1.38 (1.49 at 1.08 x 1.04); at 1.0 it is 1.20-1.22 and holds the bars for sep x {0.92, 1, 1.04} at 5 poses; BAKE_VERSION 5), `noFacingComp: true` and `guardPen` (`LAWS.V2_DUTY_GUARD_PEN` 1.05). The frame drops NO ruling for density: it scales each vertex's tone demand by `min(1, c)`, `c` = the local screen gap (`p0 sv fac x rq/8`) / `strideSep`, so crowded rulings draw proportionally shorter dashes and the ink per screen area follows the tone (exact, replaces A17's mean-foreshortening term for this set); the crowd guard (now 1.05 pens) only stops overlap near the limb, where lines may touch. Cap-word fixes for `dutyConst` v2: the ladder stamps each run of a law bake with its ruling index m (`capRank = (m + 1) / RANK_SCALE`), and the ordinals come from it (a pole relabel keeps the native rank under a finer level, so (level, rank) put several rulings in one place and most ordinal "neighbours" were far away); the local pitch ratio divides the object-space neighbour distance by the object-space pitch (it divided by the screen pitch). The frame's ruling tangent stays inside its run. Mark laws keep the A21 ordinals and ratio they are tuned on. The limb-ring spacing gate is "at least one pen width" (was "no tighter than pose").
- **A23. The Shading slider (owner request "set the density of shading myself"); amends A22.** `p.tone.darkness` (0..100, default `SCENE3D_SURFACE_LOCK.SHADE.DEFAULT` 50; v2 only) sets how dark the v2 shading gets; Density keeps setting the ruling count. `SurfaceLock.toneDarknessOf(p)` copies it onto a v2 spec as `spec.toneDarkness` (and the pose options as `opts.toneDarkness`) only when it is off the default, and the bake key and the tone-table key append `dk<value>` only then, so every default key, spec and output is byte-identical to A22. One remap, `Regions.darknessK(s, cDef, cMax)`: k = `LIGHT_RATIO + (1 - LIGHT_RATIO) s / 50` below the default (`LIGHT_RATIO` 0.6), 1 at it, `(c + (cMax - c)(s - 50) / 50) / c` above it; a tone of relative darkness rel draws `Regions.darknessRel(rel, k) = rel (1 + (k - 1) rel)` of the default dark end (monotone in k for every rel, paper stays paper, the lightest inked tones move under 10 %). Ladder (`darkV2`): k acts on the single-family coverage with cMax = pen / max(V2_DARK_MIN_PEN, GUARD_PEN) pens; crosshatch splits the moved coverage; past the default the darkest baked pitch is pd / k (dots pd / sqrt k), below it the rulings stay and the LUT asks for less; the faceted baker and the pose ladder (`surface-fill.js` v2Curve) use the same remap. Duty Cycle / End Shorten v2: k with cMax = pen / `SHADE.DUTY_MIN_PITCH_PEN`, but the ruling pitch never changes (`SHADE.DUTY_SHRINK` false: a finer pitch put the delivered gap under the 1.05-pen crowd guard, which dropped pieces; measured total ink 8717 -> 8483 mm at 100) and the LUT is capped at full duty, so past the default only the mid-tones darken. Mezzo (finest level at the no-overlap stop distance) and the mark laws (fixed lattices, default pitch) are capped the same way. The pose mono laws and every legacy spec ignore the slider (panel note). No `SCENE_VERSION` change: a missing key is the default.
- **A24. Ground height `ground.y` in the surface-locked shadow (light realism U3); amends §10.** `frameShadow(..., opts.groundY)` measures casters above the floor and projects from the plane `y = groundY` (directional and point/spot lights both cross the floor at its height); `groundRing` lifts its quad to `ground.y`; `sceneFrame` passes `p.ground.y`. `ground.y` is absent or 0 for the old plane, byte-identical. The ground hatch bake lives in XZ (world ground coordinates), so its key does not include Y: **a Y drag rebakes nothing**. **Occlusion (U4, supersedes the old known gap):** a raised ground (finite non-zero `ground.y`, camera above the plane) occludes object marks and edges below it. Pose: the ground's front face joins `occluderFaces` (objectId `ground`; ground ink and shadows are coplanar, inside the depth bias). Level S: `groundCover` builds, once per frame from the 4-6 projected ring vertices, a synthetic depth plane + polygon (no occluder-buffer entry, no rebake) and `underFloor` splits fills/outline runs at it; ground ink and the cast shadow are not tested against it. `ground.y` absent or 0: no cover, byte-identical.
- **A25. Lone-plane tone cap (light realism A1/U1).** A one-face faceted record (a lit plane) under v2 has its intensity capped at `FACETED.V2_LONE_FACE_MAX_I` (0.84) and gets no glint keep, so a plane tilted toward the sun keeps a fill instead of rolling to paper (and a mirror-angle plane is not blanked by the glint `scaleFn`). The tone memo key gains `lone` for v2 planes so boxes never share the capped table. The pose path (`faceMonoLines`) passes `loneFace` for a one-face record and `surface-fill-mono` applies the same cap; the plane mesh now also has a reversed-winding back face (`face:-Y`), so the pose check matches the plane by primitive. Legacy output is unchanged.
- **A26. Optional per-run pen and weight channels in the MarkSet (Wave D0).** `MarkSet.runPen` (Uint8 per run; 0 = the object's pen, `k` = `meta.penIds[k - 1]`) and `MarkSet.runWeight` (Uint8 per run; 0 = default width, else the line-weight scale in `1 / SurfaceLockMarkSet.WEIGHT_UNIT` (64) steps) are optional, allocated by the builder only when some run passes a pen / weight to `beginRun(level, rank, family, flags, capRank, pen, weight)`; `validate` checks their length, `byteSize` and `transferList` include them. `frameSet` sets `line.penId` (when the run's pen resolves through `meta.penIds`) and `line.weightScale` (when set and not x1) on the emitted line only when the channel is present; a `joinTouching` merge joins pieces of the same pen and weight only. A MarkSet without the channels takes none of those branches: frame output is byte-identical (the frame-identity witness is unchanged). The channels are plumbing for the pen-tier and weight laws; no baker writes them yet, and the Level F consumer (`algorithms/scene3d.js`, which already copies `weightScale` off a frame line) reads them when a baker starts to.
- **A27. `ampSpacing` surface baker, v2 only (Wave D1); extends the A20 FIT precedent.** `SurfaceLockLaws.FIT` has a third `v2Only` row: `ampSpacing` on hatch / crosshatch and the six curved primitives (tripleHatch refused); `supports(spec)` is true for it only when `spec.toneModel === 'v2'`, so a legacy or saved scene keeps its pose output and no `SCENE_VERSION` migration is needed (bake key carries `'v2'`, A16). It is the ladder's pitch law drawn on wave-displaced rulings: `bake` bakes the plain v2 ladder of the spec at the user's Density (`toneLaw 'ladder'`) and displaces every ruling sideways in the tangent plane by `A sin(2 pi s / lambda)`, `s` the arc length along the ruling, so neighbouring rulings keep the same phase and stay parallel (the spacing, which carries the tone, is the ladder's). `A = clamp(AMP_SHARE x p0, AMP_MM_MIN, AMP_MM_MAX)` (0.4, 0.34, 0.6 mm: the pose law's 0.8 mm cap is lowered so the arc length stays within ~7 % of the ladder's), `lambda = max(AMP_LAMBDA_AMP x A, AMP_LAMBDA_MIN_MM)` (12 x A, 3.2 mm), `AMP_STEPS` (10) samples per wavelength, a closed ruling takes a whole number of waves; dots copy through. `toneLUT` IS the ladder's table for the same spec, so the tone curve follows the Default ladder (measured within 0.013 pen coverage; the dutyConst-shared curve of A21 is not the reference of a pitch law, whose v2 dark end is ~0.58 at Density 50, A22). The MarkSet keeps the ladder's meta plus `lawId 'ampSpacing'`, `ampMM`, `ampLambdaMM`. Config: `LAWS.AMP_*`. Legacy tone model unchanged; `weaveDepth` and the other wave laws are not part of this row.
- **A28. Three-pen laws `penInterleave` / `penReserve` / `penCross`, v2 only (Wave D2); extends A20 / A26.** `SurfaceLockLaws.FIT` has a fourth `v2Only` row (hatch only; tripleHatch refused; `supports` true only for `toneModel 'v2'`, so legacy / saved scenes keep their pose output, no `SCENE_VERSION` migration). New optional MarkSet channel `runBand` (Uint8 x 2 per run: lo, hi in 1/255 of the tone I; `beginRun(..., pen, weight, bandLo, bandHi)`): the frame draws a run only where `lo <= I <= hi` (a second linear clip on a per-vertex `STI`); absent channel = no branch, frame output byte-identical (frame-identity witness unchanged). The bake stamps `runPen` (nib tier + 1), `runWeight` (nib mm / document pen, 1/64 steps) and `meta.penTiers`, so `frame()` sets `line.penTier` + `line.weightScale` (and `penId` when `meta.penIds` resolves); the Level S emit (`sceneFrame` -> `emitFill`) and the Level F emit copy them to the path meta exactly as the pose emit does (`penTier`, `weightScale`). The pen mix follows the light with no rebake: a ruling is baked once per nib, each copy with the tone band in which that nib is in the holder (tier = floor(u) + (vdc(ruling) < frac(u)), u the tier coordinate, bands nested). The LUT is the grid fraction. Grid + tone are CALIBRATED to the pose compose (default sphere, Density 50, v2): Interleave one even grid at 2.2 x the broad nib, nib from need = area x pitch x `PEN_INTER_NEED`; Reserve grid 3.0 x broad, tier u = tierU(area + `PEN_RES_U_BIAS`), 12 transverse reserves per ruling at one fixed white share (`PRES_DUTY` 0.3; the pose duty 0.3..0.6 varies with tone: not baked) plus a sparse fine +90 deg family; Cross a medium family (2.5 mm) and a broad family (every 1/0.35 th ruling at +60 deg; the ladder bakes nothing at some angles, e.g. a sphere at 105 deg: falls back to the mirrored angle). Ladder underneath is the plain v2 ladder baked with the pen stretched so its full grid is the law's pitch; `meta.minMarkMM` is the document pen's. Config: `LAWS.PEN_*`, `PRES_*`. Tone-off draws the uniform fine-nib Density. Known differences from pose: no per-tone reserve width; Cross / Reserve fine-nib detail is a fraction of pose's; per-nib ink is within ~2x of pose, bin coverage within 0.12 (see tests/unit/scene3d-surface-lock-wave-d-penlaws.test.js). **DRAG-PREVIEW ONLY (owner decision, WD-DBC): the bake is used only while a 3D drag / orbit is in progress. The FIT row carries `dragPreviewOnly: true`: `supports` is true only for a spec with `dragPreview: true`, which `buildSurfaceLockSpec` / `specOfObject` set from `bounds.dragPreview`; the engine sets that bound (and treats the scene as Level S, with no worker bake hold, so the first drag frame bakes on the main thread once) only for a preview frame (`options.preview`) of a scene frameable solely through such a row. Settled and export output (no `dragPreview`) is the pose compose, byte for byte as before A28; drag != export for these laws by design, the swap happens on release. ampSpacing (A27) has no flag and is unchanged.**
- **A29. `weightModulated` surface baker, v2 only (Wave D3); extends A20 / A26 / A28.** `SurfaceLockLaws.FIT` has a fifth `v2Only` row: `weightModulated` on hatch / crosshatch and the six curved primitives (tripleHatch refused); `supports` is true only for `toneModel 'v2'`, so a legacy or saved scene keeps its pose output (no `SCENE_VERSION` migration, bake key carries `'v2'`). Tone is line width on ONE even grid: `bake` bakes the plain v2 ladder of the spec at the user's Density and keeps only its level-0 rulings (the sparse-end pitch p0); the LUT is a flat screen-mm pitch (`1.001 / (p0 x scaleRef)`, so the grid keeps its spacing at any zoom) that rolls off to paper over the lightest `LAWS.WEIGHT_PAPER_BAND` of the tone by thinning rulings (ranks: a spatially even subset). The pose width law `w(I) = top + (1 - top) ease(I)` (`LAWS.WEIGHT_TOP`) is quantised in `LAWS.WEIGHT_STEP` steps; each ruling is baked once per step with that width in `runWeight` and the I interval where `w(I)` rounds to the step in `runBand` (A28 channel). The bands tile [0, 1], so the frame draws at every vertex the width the light asks for: the width follows the light while dragging with no rebake (0 orbit bake misses / tone evals, drag == export); tone OFF (I = 1, flat LUT) draws the uniform lightest width. Known differences from pose: the pose compose draws a true pen-width ribbon per ruling, the lock a plain line carrying `weightScale` (stroked at that width); width changes in steps of `WEIGHT_STEP` with butt joins at the band edges; lock rulings are chart-space and foreshorten, so the width-weighted ink per L* bin sits at ~0.5-0.8x of pose (within the 2x test bound; `tests/unit/scene3d-surface-lock-wave-d-weightlaw.test.js`). **DRAG-PREVIEW ONLY (owner decision, WD-DBC): the bake is used only while a 3D drag / orbit is in progress. The FIT row carries `dragPreviewOnly: true`: `supports` is true only for a spec with `dragPreview: true`, which `buildSurfaceLockSpec` / `specOfObject` set from `bounds.dragPreview`; the engine sets that bound (and treats the scene as Level S, with no worker bake hold, so the first drag frame bakes on the main thread once) only for a preview frame (`options.preview`) of a scene frameable solely through such a row. Settled and export output (no `dragPreview`) is the pose compose, byte for byte as before A28; drag != export for these laws by design, the swap happens on release. ampSpacing (A27) has no flag and is unchanged.**
- **A32. `mazeFill` surface baker, v2 (Wave D5; AMENDED: no longer drag-preview only); new baker `SurfaceLockWebs` (`surface-lock-webs.js`, `BAKER_KEYS` last entry, `id 'webs'`); extends A28 / A29.** One FIT row (`v2Only`, hatch / crosshatch, the six curved primitives, tripleHatch refused): `supports` is true for any v2 spec, so mazeFill is Level S AT REST: the settled and export frame is the surface-locked drawing, the same MarkSet and the same frame as the drag frame at the same pose (no swap on release; owner decision after the D5-maze sheet, "the surface-wrapped maze is the better look, and it should wrap the object"). A legacy / saved scene keeps its pose output (the row is `v2Only`), so no `SCENE_VERSION` migration; `BAKE_VERSION` is not bumped (the baker shipped nowhere before this change: no stale MarkSet of it exists). The earlier text of this amendment (settled = pose compose) is superseded. The pose law carves a random spanning tree on a screen grid whose cell is the tone; that is not a keyed subset, so the bake is its exact keyed-subset cousin, a recursive-division maze in the object chart (a, b): na x nb root chambers of about p0 (the coarsest cell, `p0 = floorCell x 2^L / LAWS.MAZE_FINE`), each divided by a cross into four chambers down to level L (<= `MAZE_LEVEL_MAX`); of the four half-walls of a cross one is closed and three carry a single gap, the root chambers are joined by a random spanning tree. A half-wall is stored as the nested chain of pieces that appear with the finer levels (the gap is one cell edge of the finest level drawn); the piece of level k is keyed `(level k, rank = min of the ranks of the two chambers it separates)`, so a gap never spans two cells of a finer neighbour. A mark of level k has the ladder's gain-2 key `2^(k-1)(1 + rank)`: every tone threshold t = p0 / cell(I) draws a PERFECT maze (witness: open cell edges = cells - 1 and connected, at every fully drawn level) whose cell size follows the light with no rebake (0 bake misses / 0 tone evals on orbit, a light move bakes nothing). LUT = 1 / cell(I) with the pose cell `max(floor, MAZE_PITCH_X x pitchOfDens) x MAZE_CELL_X` as a smooth maximum (`MAZE_KNEE_N`) so the dark end keeps grading; paper at the pose's `MAZE_PAPER_DENS`. Pointwise, a vertical wall is dropped where the chart cell is thinner than `MAZE_THIN` (a pole, the torus inner equator) and a horizontal one where it is wider than its inverse: rings / lanes instead of a fan. `meta.floorPitchPen` (`MAZE_FLOOR_PEN`) relaxes the frame's ruling-pitch plot-floor cap and `noFacingComp` is set. Polish: (1) LONG WALLS. A wall of slot level l is 2^(m - l) cells long at the tone level m; past `LAWS.MAZE_RUN` (4) cells it is drawn as runs of 4 cells with a one-cell gap (a few extra doors: the maze is perfect up to that tone and slightly braided past it). Ink is monotone in the key but a gap is not, so the broken copies are tone BANDS (`runBand`, A28): the whole wall (levels up to l + 2) in the band t < 2^(l + 2) (`iCross` inverts the tone LUT), then one dashed copy per finer level m in the band t in [2^(m - 1), 2^m); the copies are keyed (level m - 1, rank 0) and carry the wall's real gap. The vertex cost is one extra copy of the low-level walls, which are the short ones in total length. The perfect-maze witness runs on the unbroken skeleton (`debug.lattice` defaults `noBreak`). (2) POLES. A wall on the thin side of the chart (a ring at a sphere pole, a lane at a torus's inner equator) is closed (a `LAWS.MAZE_RING_OPEN` 0.2 share keeps its gap), is never broken, and all pieces of a ring share one rank per line and level (`ringRank`), so a ring appears whole at one tone, not as scattered arcs. Tone OFF draws I = 1, the unbroken copy: the broken copies are a tone-on feature. Known differences from pose: walls are chart-aligned and foreshorten toward the limb (the pose grid is screen-aligned), the lit area is empty paper as in the drag frame (the pose maze fills it with large rectangles); the ink per L* bin sits within 1.5x of pose (`tests/unit/scene3d-surface-lock-wave-d5-maze.test.js`). A scene whose ground shadow is cast by a torus is not frameable (`SurfaceLockShadow.supports` refuses a non-convex caster, pre-existing: its hull-projection bake would fill the hole) and so is NOT Level S: it keeps the flat pose maze (draft tier while dragging, pose compose at rest and in export), the same drawing at rest as before this amendment; turning the ground shadow or the light's cast shadows off gives the wrapped maze.
- **A33. `voronoiWeb` surface baker, v2, Level S at rest (Wave D5); same baker `SurfaceLockWebs`, second FIT row; extends A32; adds the drag LOD (coarse bake) and idle prewarm mechanism.** One FIT row (`v2Only`, hatch / crosshatch, the six curved primitives, tripleHatch refused; NOT drag-preview only, like the amended A32): the settled and export frame is the surface-locked web, the same MarkSet and the same frame as the drag frame at the same pose (no swap on release; owner decisions "nothing should flatten on release, everything should follow the surface"). Legacy tone and every other fill are unchanged. The pose law scatters seeds over the screen, relaxes them and draws their Voronoi walls; a different cell size is a different diagram, so there is no keyed subset and the bake is one FULL web per tone level in the object's chart (`D_l = CTOP / ratio^l`, blue-noise seeds on the label-grid nodes, damped Lloyd, nearest-seed labels, chord-bisector crossings, Gauss-Newton junctions, chained, simplified). Each run carries its level's TONE BAND (`MarkSet.runBand`); the bands tile [0, 1] so exactly one level draws at a vertex and the cell size follows the light with no rebake; the LUT is the paper gate. SPEED (general, any baker with `bakeCoarse(spec)` + `supportsCoarse(spec)`): the MarkSet is the surface texture, baked once (settled render, load and param edits bake it, so the first drag frame is a cache hit) and re-baked only when its key changes. (a) `SurfaceLock.prewarm(specs, { sync?, done? })` bakes the missing full MarkSets one per idle slice (`requestIdleCallback`, else `setTimeout`). (b) `SurfaceLock.bake(spec, { lod: true })` returns a COARSE MarkSet when the full one is missing: cached under its own key (`<bakeKey>|lod1`, so it can never answer a full lookup), `meta.lod = 1`; for voronoiWeb the `LAWS.VORONOI_COARSE_DROP` (2) finest levels are left out and the darkest kept level takes over their tone band (bands still tile [0, 1]; ~3.5x faster in Chromium). The engine uses it only for a Level S PREVIEW (drag) frame whose full bake is missing (`bounds.lodDrag`, set in `_composeSceneGroup`, never memoised, never the settled key), and builds the full bake behind it (worker settle when available, else idle `prewarm`); the next frame hits the full bake. Settled, export, captured jobs and precomposed worker results never see `lod`. `SETTINGS.sceneBakeLod === false` turns the LOD off. The maze keeps no coarse form (its bake is cheap). The baker's hot loops use local `Math` / `Number.isFinite` aliases (a window-backed global answers a global lookup through an interceptor: ~3x in jsdom / vm), seeds are drawn from the label grid nodes (no chart call per dart) and the junction refinement measures its Jacobian once (chord iteration, 5 chart calls per junction instead of 9). `BAKE_VERSION` / `SCENE_VERSION` are not bumped: the baker has shipped nowhere (branch only) and the row is `v2Only`. A torus under a ground shadow is not Level S (A32) and keeps the pose web at rest.
- **A34. Non-convex ground-shadow casters are Level S (torus, torus knot); extends §10 and A32 / A33 (which said a torus under a ground shadow is not Level S).** `SurfaceLockShadow.supports` accepts a caster record `{ primitive, shape: 'mesh', triangles: Float64Array(9 per triangle, world xyz) }` and the primitives in `MESH_PRIMITIVES` (`torus`, `torusKnot`); the `shadow` FRAMEABLE row therefore no longer refuses them, and a wrapped fill (mazeFill, voronoiWeb, every Level S law) on a torus stays surface-locked at rest and while dragging ("nothing flattens on release"). Footprint: each triangle is projected along the light onto the receiving plane (a convex triangle; a triangle with a vertex under the plane is dropped, as the hull path drops such a vertex) and the footprint is their UNION taken per baked line: the triangles are binned by the line-index range their offset span touches (CSR arrays, so a line tests only the triangles that can reach it), each line's intervals are merged (seams within 1e-7 mm bridged), then clipped to the ground and tone-gated per interval. The hole of a torus stays open whenever the light makes it visible in the shadow. Back-facing triangles are NOT pruned: mesh winding is not guaranteed consistent, and the merge makes the duplicate coverage free. Tone grading mirrors the pose path (`shadows.js` `nadirContact`): the contact set is the lowest slice of the mesh (vertices up to `max(0.5, 3 % of height)` above the receiver, widened by doubling until it holds a polygon), taken as its convex hull so the contact-distance function stays convex (the ternary / bisection tone gate needs that); pose uses the slice's edge segments, which differs only inside the hole of a flat-lying torus, where the hull reads distance 0 (darkest) and pose reads the small distance to the ring; the throw length L is the largest contact distance over the projected vertices. The caster record is built in `surface-lock.js casterOf` from the same mesh vertices and object matrix as the receive-map triangles, cached per transform; the sphere and hull paths are untouched (byte-identical frames). Picking polygon: the convex hull of the projected vertices (the hole is not pickable). CSG carved solids keep the `csgCarve` refusal (their own FIT row) and do not reach this path.
