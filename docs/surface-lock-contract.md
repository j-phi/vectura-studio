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
'SurfaceLockFaceted']`; the first `supports(spec)` wins.

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
  - *Marks.* The rulings are the ladder's at the law's row pitch (one level, as `dutyConst`). A mark lattice sized for the pitch the rulings actually have (`meta.rho` = baked / designed pitch) reaches the shared v2 target's dark end (`pen / peff`, the `dutyConst` v2 ink). A tone draws the fraction `D(I)` of the marks (`targetOf`, no lit floor): a mark is on iff its low-discrepancy key is below `D`, so the marks at a tone are a subset of those at every darker tone. `toneLUT` is `D(I) / rowPitch` (tone OFF: uniform Density, as `dutyConst` v2); `meta.toneScaleFree`, `capKey 'ruling'`; the glint is the H1 `scaleFn` (the baker returns none).
  - *Laws.* Tick: a stroke perpendicular to the ruling per cell. Dot Screen: a closed 8-gon ring per cell on a staggered hex lattice. Dash Ramp: five runs per cell (outer, flank, core, flank, outer; core on once `D > 0`, flanks from 1/3, outers from 2/3: dot -> dash -> ruling), joined by the frame (A11); each sixth of a cell must clear `minMarkMM`, because the frame drops a lone short piece before a neighbour can join it. Scribble: one 4-vertex triangle-wave cell per period, amplitude solved for the coverage. Bundle Count: 3 parallel passes per ruling (5 max after the pitch correction), pass `j` on iff `(j + r) / n < D`.
  - *Not locked (needs a per-run width channel in the MarkSet and frame, which carry none):* `weightModulated`, `taperedEnds`.
