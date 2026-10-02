# R3: Consolidation of the Style sub-settings (enum params)

Repo `main` @ `e609338c`. This was a read-only audit. No repo file was changed.

**Rig.** `fillstyle-audit/r3m/lib3.js`. It is r2's `nlib.js` with three changes:
- It also hashes the path meta: `strokeDash`, `hiddenLine`, `weightScale`, `penId`, plus the `highlight`, `xrayBack`, `occluded` and `edgeClass` tags.
- It takes an object-level option (`visibility`) and a `mut(p)` hook, so `edgeStyles`, `shadow`, `emissive`, `strokeFillStyle` and `tone` can be set.
- Fixture: the same sphere (r40, det 20) as r2, plus a box (60³). Camera: orthographic. Sun: azimuth 200, elevation 55. Angle 45, density 60.

**How to read the hashes.** `geo=` is the md5 of the points only. `full=` also covers the meta. A dash change therefore shows in `full` only.

**Scripts and raw output (all in `r3m/`):**
- `dump.js` dumps STYLE_PARAMS and the string defaults (`dump.out`).
- `e1.js`: X-ray front, hidden-edge dash, showHidden, xrayHiddenEdges.
- `e2.js`: dot shapes, angleRef, contourStyle/spiralMode, linkFill.
- `e3.js`: undirected dot-shape match, highlight dashed vs dotted, altFill, burst.
- `e4.js`: highlight-treatment groups.
- `e5.js` → `live.txt`: the liveness matrix (every option of every enum, on sphere and box).
- `e6.js`: Stroke Fill on faceted shapes, highlightBands.
- `out-e*.txt`: saved output of each script.

---

## 1. Enum inventory (every enum-valued style param)

**Sources.** I took every enum from `params.js`: `clampStyleParam` :655-786, `normalizeEdgeStyle`, `normalizeShadow`, `normalizeObjectEmissive` and `normalizeObject`. I added every Select, SegCtrl or toggle in `scene3d-panel.js` and every STYLE_PARAMS sub-select (runtime dump).

**Columns.**
- **Live S/B** = the measured option groups on the sphere / the box. `{a,b}` means a and b gave byte-identical output (`live.txt`).
- **Cluster** = the consolidation verdict. **K** = keep. **R3-n** = a new candidate (§2). **D-n** = a dead or inert finding (§3). **r1/r2** = already covered.

### 1a. `style.params` enums (per mapper)

| param (UI label) | options | code path | Live S / B | cluster |
|---|---|---|---|---|
| `lineType` (Line) | solid, dashed, dotted, dashdot | `strokeTreatment` → `LINE_TYPE_DASH` (`geometry3d.js:168-174`). It is one dash stamp with a pattern constant: `null`, `[3,2]`, `[0.4,2]`, `[3,2,0.4,2]`. | all 4 distinct / all 4 distinct | K. This is the canonical "line type". The other line-type surfaces should reuse it (§4 C1). |
| `angleRef` (Angle ref) | face, screen, worldUp | Faceted only: `faceHatchLines` `scene3d.js:2519-2539`. `screen` takes the scaffold-less screen-space branch (the draft path). `worldUp` adds `worldUpAngleInUV`. Under lightDriven, `faceLightDrivenLines` `:3243` maps `screen` to `face`. | **{face,screen,worldUp}** / 3 distinct. Under lightDriven on the box: **{face,screen}** {worldUp}. | **R3-1** (screen = "Flat"), **D-5** |
| `linkFill` (Link fill) | off, on | `maybeLink` → `linkBoustrophedon` `:2464`. Faceted only. | **{off,on}** / distinct | **D-6** |
| `crossAngleDelta`, `crossDensityRatio`, `tripleHatch` | numeric / bool | — | — | r2 NEW-4 and NEW-7 (extended in §4 C4) |
| `contourStyle` (Style) | surface, region | Curved only: a gate at `:4549`. `region` sets `chartParams = null` and falls to the flat silhouette region fill. | distinct / **{surface,region}** | **R3-1** |
| `spiralMode` (Mode) | surfaceHelix, flatClip | Curved only: **the same gate** `:4544`/`:4550`. `flatClip` sets `chartParams = null` and falls to the faceted path's clipped spiral. | distinct / **{helix,flat}** | **R3-1** |
| `spiralCenter` (Centre) | centroid, bboxCenter | `Mappers.trueSpiral` `opts.center` (`mappers.js:353`). It is one emitter with a centre constant. | distinct / **{centroid,bboxCenter}** (the box's projected centroid ≈ its bbox centre: fixture-dependent) | K. Vocabulary clash with burstCenter (§4 C6). |
| `axisSnap` | off, on | `mappers.js:401-402`. One emitter with a dθ constant (π/2 vs 2π/N). | distinct / distinct | K |
| `dotShape` (Dot) | dot, ring, cross, plus, tick | `Mappers.stippleMark` `mappers.js:170-186`. `ring` = a circle at 1.4r with 12 segments (dot has 10). `cross` = 2 diagonal arms. `plus` = 2 axial arms. `tick` = 1 axial arm. | all 5 distinct / all 5 distinct | **R3-5** |
| `showHidden` (Show hidden, wireframe) | off, on | `wfShowHidden` → `thisEdgeHidden = 'dash'` `:5328, :5401` | distinct / distinct | **R3-4** |
| `edgeClasses` (Edges, multi) | sil, bound, crease, interior | `:5326`. It is a per-class `return`. | — | §4 C9 (overlaps edgeStyles) |
| `sliceVisibility` (Show) | visibleOnly, fullContour | `:4882`. Topoform's `contourVisibility` maps onto it (`engine.js:1139`). | distinct / distinct | K (§4 C3: an "occluded part" concept) |
| `highlightTreatment` (Treatment) | blank, none(keep), dashed, dotted, sparse, altFill, burst, stippleOut | Curved: the `isHL`/treatment dispatch inside SurfaceFill, gated by `HL_STAGE.treatment=false` (`surface-fill.js:396`). Faceted: `:4347-4442`. altFill and burst: the region pass `:5141-5200`. | **{blank,none,dashed,dotted,sparse,stippleOut}** {altFill} {burst} / all 8 distinct under `ladder`. Under `toneLaw:none`: **{blank,none}**, then the rest each distinct. | r2 NEW-2/NEW-3 (re-verified, §2). **D-1** |
| `highlightMode` (Highlight mode) | perFace, lightDriven | `perFaceHighlight` `:2045`, `faceLightDrivenLines` `:3242`. Curved: `HL_STAGE.lightDriven=false`. | **{perFace,lightDriven}** / distinct | **D-1** |
| `highlightBands` (Bands) | 1, 2 | Its only reader is `isHighlightBand` via the curved `isHL` callback `:4704` (HL_STAGE-gated). | **{1,2}** / **{1,2}** (also with a 4-band tone, and under every treatment, `out-e6`) | **D-2: dead everywhere** |
| `altFillMapper` (Alt fill) | hatch, crosshatch, contour, spiral, stipple | `:5183-5191`. contour/spiral/stipple use `Mappers.regionFill`. hatch/crosshatch use `hatchSegments(edges,45)` (+`135`). | all 5 distinct / all 5 distinct | **R3-6** |
| `burstCenter` (Burst centre) | specular (Glint), centroid (Centre) | `:5146`. `centroid` is the **bbox midpoint** of `projBounds`, not a centroid. | distinct / distinct | K. Mislabelled (§4 C6). |
| `xrayFront` (Front) | solid, faded | Curved only: `frontTreat = strokeTreatment({...sp, lineType:'dotted'})` `:4770-4771`. The faceted path never reads `xr.front`. | distinct / **{solid,faded}** | **R3-2**, **D-3** |
| `xrayDepthCue` (Depth cue) | off, density, weight, both | `cueDensity = density‖both`, `cueWeight = weight‖both` (`:4208-4209`, `:4559-4560`) | all 4 distinct / all 4 distinct | **R3-8** |
| `xrayBackLineType` (Back line) | solid, dashed, dotted, dashdot | `backTreat` → `emitRuns(..., {forceHidden:true})` → `markHidden`. `markHidden` defaults `strokeDash` to `[3,2]` (`geometry3d.js:146`). | **{solid,dashed}** {dotted} {dashdot} / the same | **R3-3** |
| `xrayBackFaces` (Back faces) | off, on | `:4205` | distinct / distinct | K |
| `xrayHiddenEdges` (no UI) | on, off | `recXray.hiddenEdges` → `hiddenOnlyEdge` `:5355` | measured **live**: box, hidden=dash, 63 vs 60 paths (`out-e1` E4) | **D-4** |
| `toneFlowMode` (no UI) | iso, grad | `surface-fill.js:1495`. Its only reader is `contourFlow`, which is not in IDS. | {iso,grad} / {iso,grad} | r1-artistic (dead) |
| `toneLaw` (Fill Style) | 31 rows / 48 ids | — | — | r1/r2 |
| **STYLE_PARAMS sub-selects** (runtime dump) | `rungMode` (4), `bandProfile` (3), `weightEase` (2), `bundleMode` (4), `fieldMetric` (4), `fieldFloor` (2), `nesting` (2), `penDown` (2), `penMode` (4) | Each option is an alias of a distinct internal law id (`resolveToneLaw`, `params.js:819`). | — | r1/r2 (fold sub-selects, already merges) |

### 1b. Scene-, layer- and object-level enums on the Style surfaces

| param (UI label) | options | code path | Live S / B | cluster |
|---|---|---|---|---|
| `mapper` (Type) | none, hatch, wireframe, crosshatch, contour, spiral, stipple, contourSlice | dispatch | — | r1/r2 (T1–T3). The ctxbar list (`context-bar.js:949-955`) has no contourSlice. |
| `strokeFillStyle` (Stroke Fill) | spiral, concentric, serpentine, contourParallel | `pen-fill.js:1425-1452` | 4 distinct (taperedEnds, weightModulated) / **all 4 identical** (the law itself = ladder on the box) | r2 M11. The box result follows from NEW-5 reachability. |
| `edgeStyles.<cls>.dash` (Dash) | Solid(null), Dashed `[3,2]`, Dotted `[0.6,1.6]` | `edgeStyleMeta` `:1546` (raw array; the panel infers the name with `arr[0]<=1`, `:4661`) | silhouette: null / [3,2] / [0.6,1.6] / [0.4,2] all distinct | **R3-3**, §4 C1 |
| `edgeStyles.hidden.hiddenTreatment` (Occluded) | drop, dash | `sceneHidden` `:5400` | distinct (wireframe) | **R3-3**, **R3-4** |
| per-object edge override (Inherit/Override, Dash, Occluded) | the same as above | `edgeStyleFor` `:1525` | — | as above |
| `shadowMode` (Mode) | additive, inverse | `shadows.js:2831`. Additive emits hatch; inverse thins the ground fill. | distinct / distinct | K (different generators) |
| `shadowLineType` | solid, dashed, dotted, dashdot | `strokeTreatment({lineType})` `shadows.js:~2870` | 4 distinct / 4 distinct | K (§4 C1) |
| `shadowLayers` + `shadowLayerCount` | off/on + 2/3/4 (panel) vs **off/2/3/4** (ctxbar `:989`) | `shadows.js:2808-2809` | distinct | **R3-9** |
| `shadowToneLaw` | 31-row picker | — | — | r2 NEW-1 |
| `shadowAngleFollowsLight` | off, on | — | — | §4 C7 |
| `tone.bands` (Bands) | Flat, 2, 3, 4 (`flat` = `enabled:false`) | `renderTone` `:4758` | — | R3-9 (the pattern to copy) |
| `emissive.halo` | burst, ring, none | `:5211-5280` | 3 distinct / 3 distinct | **R3-7** |
| `visibility` / `role` / `castShadows` / group `op` / `projection` | solid/xray, solid/hole, inherit/on/off, union/subtract/intersect, ortho/persp | object/scene | — | K (not style variants) |

**Count.**
- 41 enum-valued params, about 180 options in total. The Fill Style roster counts as one param.
- 24 are style.params (9 of them are fold sub-selects).
- 17 are scene, layer or object params.

---

## 2. Merge candidates (new in R3)

### R3-1. "Flat vs Surface" is one concept under three keys, each live on a different shape class (STRONG, key merge)

**Evidence.**
- `contourStyle:'region'` and `spiralMode:'flatClip'` feed **the same gate**: `chartParams = !draft && SurfaceFill && !spiralFlatClip && !contourRegion ? … : null` (`scene3d.js:4550`). Both drop the curved chart and draw the flat silhouette region fill. The `:4540-4548` comments say this outright: "the SAME clipped Archimedean spiral the faceted path uses" and "the flat silhouette inset rings".
- `angleRef:'screen'` on a facet takes the scaffold-less screen-space branch (`:2524-2533`). That is "flat, ignore the surface" for hatch.

**Measured liveness (`live.txt`, `out-e2`).** The three keys are live on disjoint shape classes:
- `angleRef`: sphere {face,screen,worldUp} identical; box all distinct.
- `contourStyle` and `spiralMode`: sphere distinct; box identical.

So each control is dead on half the shapes, and the three labels differ: "Angle ref: Screen", "Style: Region" and "Mode: Flat".

**Proposal.** One param, **Wrap: Surface | Flat**, read by contour, spiral and hatch. Each option maps 1:1 onto today's value:
- `region` → `flat`
- `flatClip` → `flat`
- `angleRef:'screen'` → `wrap:flat`

`angleRef` keeps face/worldUp. Because every mapping is 1:1, the result is byte-identical by construction. A load-time shim makes migration safe; no preset sets any of the three keys (grep of `user-presets/`).

**Gap it exposes.** Stipple has no Flat option, and hatch has no Flat option on curved shapes. Flat-on-curved hatch would be new work, not a merge.

### R3-2. X-ray "Front: Faded" is `lineType:'dotted'` on the front fill (byte-identical) and dead on faceted shapes (STRONG)

**Code.** `frontTreat = (grpXray.front==='faded') ? strokeTreatment({...sp, lineType:'dotted'}) : groupTreat` (`:4770-4771`).

**Measured (`out-e1` E1).**
- Sphere: the front-fill paths under `xrayFront:'faded'` hash `003a160ea8`, the same as under `lineType:'dotted'`. The whole output differs only because lineType also dots the edges.
- Box: `faded` gives the same **full** hash `5a51fe3425` as `solid`. The faceted x-ray path never reads `xr.front`.

**Proposal.** Replace the Faded SegCtrl with **Front line**, which reuses `LINE_TYPE_OPTIONS`. This mirrors "Back line" (`xrayBackLineType`).
- `faded` → `dotted`.
- It gains dashed and dashdot.
- It needs a faceted port of `frontTreat`, or the row is gated on curved shapes only.

### R3-3. "Solid" is a false option on every occluded-line menu: Solid ≡ Dashed (STRONG, measured)

**Root cause.** `markHidden` stamps `strokeDash: extra.strokeDash || meta.strokeDash || [3,2]` (`geometry3d.js:146`). Every occluded or forced-hidden run passes through it (`emitRuns` `:3420-3428`). So a null dash (solid) becomes `[3,2]`.

**Measured.**
- `xrayBackLineType`: {solid,dashed} identical on both shapes (`live.txt`).
- `edgeStyles.hidden.dash` with Occluded=Dash: Solid(null) ≡ Dashed `[3,2]` (wireframe box, 3 occluded runs, full `7bffd15bed`, `out-e1` E2).
- With Occluded=Drop, every Dash value is inert (expected, but the row still shows).

**Proposal.**
- (a) Remove "Solid" from "Back line" and from the hidden class "Dash", or make it honest (pass an explicit `[]` sentinel).
- (b) Fold the hidden class's two rows ("Occluded: Drop|Dash" and "Dash: Solid|Dashed|Dotted") into **one** select: **Drop / Dashed / Dotted / Dash-dot**.

Today two rows encode three real states. The fold maps each state 1:1, so it is byte-identical.

### R3-4. Wireframe "Show hidden" ≡ Edge Styles → Hidden → Occluded: Dash (byte-identical)

**Code.** `thisEdgeHidden = wfShowHidden ? 'dash' : sceneHidden` (`:5401`). Both write the same edge-plan field.

**Measured.** Wireframe box, showHidden:true vs scene `hidden.hiddenTreatment:'dash'`: the same full hash `7bffd15bed` (`out-e1` E3).

**Proposal.** Retire `showHidden` as a separate concept. Map it to the per-object hidden override (`edgeStylesByObject[obj].hidden.hiddenTreatment='dash'`, Polish P-B), which already exists. Keep the wireframe row as a shortcut that writes that field if needed.

**Migration.** A per-*style* flag (it can live on a byFace style) becomes per-*object*. Where faces of one object disagree, the result is not byte-identical. That case is rare.

### R3-5. Dot shapes: `cross` = `plus` rotated 45° at √2 size; `tick` = one arm of `plus` (MEDIUM-LOW)

**Measured (`out-e3`).** Compared undirected at 0.01 mm:
- `cross(size .7, angle θ)` ≡ `plus(size .7·√2, angle θ+45)`. frac 1.000 both ways, on sphere and box, at θ=0 and θ=30.
- The directed hash differs only because the second arm is reversed (`mappers.js:180-181`). A plotter does not care.
- `tick` paths ⊂ `plus` paths at frac 1.000. `tick@90` ⊂ `plus` also at frac 1.000.

**Proposal.** **Mark: Dot | Ring | Stroke**, with **Arms: 1 | 2**, plus the existing Dot angle. `cross` becomes the preset "2 arms, +45°, ×√2". `ring` is a dot at 1.4r with 12 vs 10 segments, so it is a near-alias as well.

**Value.** Low. This is five familiar names vs three plus params. List it, do not push it.

### R3-6. Alt fill: hatch ⊂ crosshatch, and both ignore Angle (MEDIUM; one constant)

**Measured (`out-e3` E8).** The highlight paths of `altFillMapper:'hatch'` are a strict subset of `'crosshatch'` (frac 1.000, 3 of 6, sphere and box). `fillAngle` 10 vs 45 gives the same highlight paths.

**Code.** `hatchSegments(edges, 45, …)` + `hatchSegments(edges, 135, …)` (`:5188-5190`).

**Proposal.** One "Alt fill: Lines" option with **Layers 1|2**. Better still, read `fillAngle` and `crossAngleDelta`, which are hard-coded today (adds to §4 C4).

### R3-7. Highlight "burst" and Emissive "halo: burst" are one radial-ray emitter written twice (MEDIUM; code merge)

**Code.** `:5157-5166` (`N=burstCount`, rays 0.12r→r) and `:5249-5260` (`N=haloCount`, rays 0.9r→(1.2+0.5·intensity)r). Both use the same loop, `clipper.clipPath`, `emitRuns(…, NO_STROKE_TREATMENT)`, and 6–48 vs 4–48 counts.

**Proposal.** One `emitRadialBurst(cx, cy, rIn, rOut, N, z, meta, ctx)` helper, plus one vocabulary: **Rays**. The radii stay per-caller constants, so each caller stays byte-identical. The UI keys `burstCount` and `haloCount` name the same quantity.

### R3-8. X-ray "Depth cue" is two flags packed into four options (LOW; encoding)

**Code.** `cueDensity = cue==='density'‖'both'` and `cueWeight = cue==='weight'‖'both'` (`:4208-4209`, `:4559-4560`). `both` is the exact OR.

**Proposal.** Two toggles: **Depth → density** and **Depth → weight**. This is byte-identical by construction. It adopts the house pattern that X-ray already uses for its other rows (On/Off SegCtrls).

### R3-9. "On + count" has two encodings for the same shape (LOW; UI)

- Shadow layers: the panel has two rows, On/Off (`:3461`) and 2/3/4 (`:3481`). The ctxbar has **one** `off/2/3/4` (`context-bar.js:989`).
- Tone bands: one `Flat/2/3/4` row (`:4735`).

**Proposal.** Use the single-row `off/N` encoding everywhere.

### Re-check of r2 NEW-2 and NEW-3

On the box, `dashed` and `dotted` highlight give the same geometry (`8451662524`) and differ only in `strokeDash` (`out-e3` HL). **CONFIRMED.**

On the sphere, both are byte-identical to `none`/`blank`. See D-1: on curved shapes the merge changes nothing visible until the HL_STAGE re-wire lands.

---

## 3. Dead or inert findings that any consolidation must respect

| id | finding | evidence |
|---|---|---|
| **D-1** | On curved shapes, **6 of 8 highlight treatments are one picture**: {blank, none, dashed, dotted, sparse, stippleOut}. highlightMode, highlightSensitivity and shadowSensitivity are inert on the sphere. This held under ladder and none, under perFace and lightDriven, and with two sun positions. The cause is the deliberate staged unwire `HL_STAGE.{treatment, lightDriven, specular, shadowGrade} = false` (`surface-fill.js:388-404`). It is a known state, not a new bug. The UI still offers all of these rows on curved shapes. | `out-e4` HLG; `live.txt` |
| **D-2** | **`highlightBands` (Bands 1\|2) is dead on every shape.** Its only reader is the curved `isHL` callback (`:4704`), which is behind `HL_STAGE.treatment`. The faceted highlight is rank-based (`:1947`) and never reads `bands`. | box: 1≡2 for dashed, sparse, stippleOut and altFill, under both a 3-band and a 4-band tone (`out-e6` HB) |
| **D-3** | `xrayFront:'faded'` is dead on faceted shapes. | box full hash solid ≡ faded (`out-e1` E1) |
| **D-4** | `xrayHiddenEdges` is **live with no UI**. The panel comment (`scene3d-panel.js:~4626`) says "stays inert … just unread". But `hiddenOnlyEdge = … && recXray.hiddenEdges` (`:5355`) reads it. | xray box, hidden=dash: on 63 paths / off 60 paths (`out-e1` E4). A saved `false` changes the picture invisibly. |
| **D-5** | `angleRef` is inert on curved shapes, for all 3 values, under hatch and crosshatch. On faceted shapes under highlightMode=lightDriven, `screen` ≡ `face` (`:3243` collapses screen to face). | `live.txt`; `out-e2` E7/E12 |
| **D-6** | `linkFill` is inert on curved shapes (only `faceHatchLines` reads it). | sphere on ≡ off (`out-e2` E19) |
| **D-7** | `contourStyle`, `spiralMode` and (on this fixture) `spiralCenter` are inert on the box. | `live.txt` |
| **D-8** | `SCENE_HIGHLIGHT.TREATMENTS` offers `value:'keep'` labelled "None" (`context-bar.js` dump). The UI therefore writes the legacy alias as a live value, and the engine's own value `none` is never written. | `dump.out` HL |

**Effect on merges:**
- R3-1 *reduces* dead rows, because three half-dead rows become one row that is live everywhere.
- R3-2 must port `frontTreat` to faceted shapes, or gate the row.
- NEW-2 and NEW-3 change nothing on curved shapes until HL_STAGE is re-wired.

---

## 4. Duplicated concepts under different keys (extends r2 NEW-6 and NEW-7)

### C1. Line type / dash: one concept, 9 encodings, 3 different "dotted" values

**The 9 keys or encodings:**
- `lineType`, `xrayBackLineType`, `shadowLineType`: `STROKE_LINE_TYPES`.
- `edgeStyles.*.dash`: a raw array; the name is inferred from `arr[0]<=1`.
- `highlightTreatment` dashed/dotted (`hlLineType`, `:3887`).
- `xrayFront:'faded'` (= dotted).
- `hiddenTreatment:'dash'` and `showHidden`, both through the `markHidden` default.
- `meta.hiddenLine` (renderer fallback).

**The pattern constants:**
- dashed `[3,2]` appears at 5 sites: `geometry3d.js:172`, `:146`, `renderer.js:13967`, and `scene3d-panel.js` `OBJ_DASH_PATTERNS` (`:1535`) and `DASH_PATTERNS` (`:4661`).
- dotted is `[0.4,2]` in `LINE_TYPE_DASH`, but `[0.6,1.6]` in **both** panel edge-dash tables. So "Dotted" draws differently on an edge than on a fill.
- dashScale applies only on the `strokeTreatment` path. Edge and hidden dashes ignore it.
- The edge "Dash" menus have no Dash-dot.

**The enum list itself** is copied 6 times: `params.js:597`, `scene3d.js:3793`, `geometry3d.js:168`, panel `LINE_TYPE_OPTIONS`, and ctxbar `:983` and `:1034`. The edge "DASH_OPTS" is a 7th, partial copy.

### C2. Cross angle: 13 sites (r2 counted 5–6)

| site | value |
|---|---|
| `crossAngleDelta` (user) | 90 default (`scene3d.js:2421, 2943, 4640, 4725`) |
| `Regions.CROSS_OBJ_DEG` | 65 (`regions.js:603`) |
| `scene3d.js:2381-2382` | B 65 (reads Regions with a `‖ 65` fallback), **C = 32, a local literal** |
| `surface-fill.js:12427-12428, 12441-12442, 12478` | **literal** `+65` / `+32`, not `Regions.CROSS_OBJ_DEG` |
| `surface-fill.js:12549-12556` | `Regions.CROSS_OBJ_DEG` (the correct read) |
| `surface-fill.js:12680` | triple `+32` |
| mono crosshatch | `[0,65]` (`surface-fill-mono.js:2956`) |
| `shadows.js:1418-1419` | `CROSS_B_DEG 65`, `CROSS_C_DEG 32`: separate constants, not Regions |
| `shadows.js:908` | **`CROSS_MARK_DEG 60`** (shadow mark-class cross) |
| pen laws | penCross +60, penReserve +90 (`surface-fill.js:4176-4177`) |
| altFill crosshatch | **45 / 135 hard-coded**; it ignores fillAngle and the delta (R3-6) |

So the value 65 is defined in 3 places and 32 in 4. Only one of the 65s is shared.

### C3. "What happens to the occluded or back part": 7 keys

`edgeStyles.hidden.hiddenTreatment` (scene) · the per-object hidden override · wireframe `showHidden` (R3-4) · `xrayHiddenEdges` (live, no UI, D-4) · `xrayBackFaces` · object `visibility:'xray'` · `sliceVisibility` (plus topoform `contourVisibility`, which `engine.js:1139` maps onto it).

They use 4 vocabularies: Drop/Dash, Off/On, Solid/X-ray, Visible/Full.

### C4. "Flat vs on-surface": 3 keys (R3-1)

`angleRef:'screen'`, `contourStyle:'region'` and `spiralMode:'flatClip'`, under three labels: Screen, Region and Flat.

### C5. "Closest approach / plot floor" (extends r2 NEW-6)

| constant | value |
|---|---|
| `PLOT_FLOOR_PEN` (`surface-fill.js:244`) | 2.2 |
| `CURVED_FLOOR_PEN_MAX` (`scene3d.js:1280`, with the comment "== surface-fill's PLOT_FLOOR_PEN") | 2.2 |
| `MONO_PLOT_FLOOR_PEN` (`scene3d.js:3081`) | 2.2 |
| `PLOT_FLOOR_MULT_OBJ` (`scene3d.js:1125`) | 1.5 |
| shadow `PLOT_FLOOR_MULT` (`shadows.js:1417`) | 1.2 |
| `MK_TICK_PLOT_FLOOR` | 1.15 |
| `WV_CLEAR_FLOOR` | 1.0 |
| `CROSS_MIN_CLEAR_INKW` | 1 |
| `HATCH_SPACING_FLOOR_MM` | 0.3 / 0.18 |

These sit beside r2's three user-facing keys (`fieldFloor`, the bundle step, WV6 `cFlo`). So the value 2.2 is copied three times. Make it one exported constant.

### C6. "Centre"

- `spiralCenter`: {centroid = the true centroid, bboxCenter}.
- `burstCenter`: {specular, **centroid = the bbox midpoint**} (`:5146-5148`).
- The emissive halo centre is the bbox midpoint, fixed (`:5218-5219`).

So the value `centroid` has two meanings. Rename the burst value to `bounds`, or compute a real centroid.

### C7. "Angle reference"

`angleRef` {face, screen, worldUp} · `shadowAngleFollowsLight` (an angle reference of "light", as a bool) · `dotAngle` (absolute screen) · `spiralAngleOffset` · altFill's fixed 45°.

### C8. Pen override: 7 keys (r2 counted 3)

`style.penId`, `highlightPenId`, `xrayBackPenId`, `shadowPenId`, `edgeStyles.<cls>.pen` (×5 classes), `emissive.penId` and `border.penId`. The "inherit" label varies: "Layer pen", "Edge pen" and "Inherit".

### C9. Edge-class selection, twice

Wireframe `edgeClasses` (visibility per class, wireframe only) and `edgeStyles.<cls>` (style per class, every mapper). No "hide this class" option exists outside wireframe, and wireframe cannot style per class from its own row.

### C10. Secondary-family density: 5 scales for one idea

| key | scale |
|---|---|
| `shadowDensity` | 1–100, absolute |
| `highlightDensity` | 1–100, absolute |
| `xrayBackDensity` | 0.2–1, multiplier |
| `crossDensityRatio` | 0.25–2, spacing ratio |
| `facetMinRulings` | 1–8, count floor |

### C11. Tone step count: 7 keys

`tone.bands` (Flat/2/3/4) · `highlightBands` (1/2, dead, D-2) · `highlightSensitivity` (1–6) · `shadowSensitivity` (1–6) · `shadowLayerCount` (2–4) · `toneQuantLevels` (4–256, no UI) · `rungMode` coarse/fine.

### C12. Radial rays and rings

- Rays: highlight burst and emissive burst (R3-7).
- Rings: emissive `ring`, `dotShape:'ring'`, Stroke Fill `concentric`, `contourStyle:'region'` (inset rings).

### C13. The surface-fill mapper set: 7 copies

`params.js` `ALT_FILL_MAPPERS` and `SURFACE_FILL_MAPPERS` · `scene3d.js` `SURFACE_FILL` (:195) and the local `ALT_FILL_MAPPERS` (:2495) · panel `FILL_MAPPERS` (:349) and `ALT_FILL_MAPPER_OPTIONS` · ctxbar (:1019).

`params.js:637-648` already admits this drift risk.

---

## 5. Saturation judgement

**Results.** R3 found 9 new consolidation candidates in the sub-setting surfaces:
- 4 proven byte-identical by measurement: R3-2, R3-3, R3-4, R3-5 (R3-5 undirected).
- 1 key merge that is byte-identical by construction, with measured disjoint liveness: R3-1.
- 4 code or encoding folds: R3-6 to R3-9.

It also found 8 dead or inert rows (D-1 to D-8). D-2 and D-4 are new defects. D-1 is a known staged state that the UI does not reflect.

**Enum merges in the Style sub-settings: now saturated.**
- Every enum-valued param in `params.js` and `scene3d-panel.js` has been run option by option on two shape classes (`live.txt`).
- Every pair that survived the measurement either has a different code path, or is listed above.

**What is left.**
- Areas still unexplored: the object-level panels (border, emissive intensity, castShadows) and ctxbar-only flyout state. They would probably give 0–1 small items.
- The remaining value is not in merging. It is in **dead-control cleanup** (D-1 to D-8) and **constant de-duplication** (C1, C2, C5).

Those are better run as an implementation unit than as another audit round.

**Recommended order:**
1. R3-3 (false "Solid") and D-4 (the hidden live param). Both are cheap, and both are correctness issues.
2. R3-1 (Wrap), because it kills three half-dead rows.
3. C1 and C2 constant consolidation.
4. R3-2 together with its faceted port.
5. Defer NEW-2/NEW-3 until HL_STAGE is re-wired, because on curved shapes they are moot today.
