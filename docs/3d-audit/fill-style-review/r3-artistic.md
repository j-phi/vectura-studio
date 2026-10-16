# R3 — Object 3D Fill Styles: control reachability, honesty, pens, chaining (lens c, round 3)

**Scope.** This report drives the five areas that R2 left open (`r2-artistic.md` §4) to saturation. It is read-only at `main e609338c` (app v1.4.5). I served the main checkout on my own port **:8641**.

**Evidence method.** Playwright drives the real app in tree mode (`addLayer('scene3d')` makes a scene group plus an `object3d` child). It sets the child's style or the group's params, runs `engine.generate`, and hashes `group.scenePaths`. The hash covers every point to 3 dp, plus all path meta except `sceneTarget`/`algorithm`. The meta matters: dash is a meta field (`strokeDash`, geometry3d.js:217), so a geometry-only hash reports Line type as dead. My first pass made that mistake; it is corrected here. Where it matters, I hash the object's own fill separately from the ground and shadow.

Scripts and output are in `fillstyle-audit/r3/`:

| Script | What it does |
|---|---|
| `base.js` | Shared harness |
| `t1-reads.js` → `t1-reads.tsv` | Proxy on `StyleCascade.resolve`. Records every style key the engine reads, for each primitive and mapper. |
| `t2-sweep.js` → `t2-{sphere,cylinder,box}.tsv` | The main sweep, 17,580 cells: 5 fill Types × 25 sample laws (all 8 mark classes) × 55 variants × 3 primitives, plus wireframe, contourSlice and the x-ray set. Also counts distinct outputs across all 49 laws for each Type. |
| `t3-tone.js` | Tone, Specular, Shadow and Light controls |
| `t5`, `t7` | Scene-editor scope reach |
| `t6`, `t10`, `t14`, `t15` | Real-UI drives of the leaf panel |
| `t8`, `t9b` | Pens |
| `t11`, `t12` | Chaining |
| `t16` | Dot controls |
| `t17` | Border |
| `matrix.py` → `matrix.md` | Builds the matrix |

Primitive classes: **sphere** = curved; **cylinder** = curved with flat caps; **box** = faceted.

---

## 0. Headline (all NEW unless marked)

1. **The Scene group's Style editor cannot reach any object in a scene tree. It only styles the ground.**
   - Every new `object3d` child declares its own style: `{mapper:'hatch'}` (ALGO_DEFAULTS.object3d).
   - `collectSceneParams` always republishes `byObject[child] = child.params.style` (params.js:1295, `declaresStyle` :1238).
   - Whole-style-wins cascade, measured on sphere and box (`t7`):
     - A **Scene-scope** edit leaves the object hash unchanged.
     - An **Object-scope** edit (canvas object pick inside the group) also leaves it unchanged. The write goes to `group.styleTable.byObject[id]`, and the child's copy overwrites it.
     - Only **Face scope** reaches the object.
   - Live UI drive (`t5`): the tab reads "Editing: Scene". Type set to Stipple → object hash stays `2676e1c3`, and the ground becomes 3,123 stipple dots.
   - The ground fallback is by design (plans.md:694). The problem is that the editor does not say so.
   - **Consequence: every MAPPER_CONTROLS-only control has no object-reachable surface in a tree.** This covers Cross angle/density, Triple, Angle ref, Link fill, Contour style, all 5 spiral controls, all 4 dot controls, Line/Dash/Wobble, the 10 Highlight controls and the 7 X-ray controls. R2's N-1 is therefore a reachability fix (P0), not polish.
2. **Stroke Fill is dead on every tree object, on both of its surfaces.**
   - The leaf row and the ctxbar flyout both write `child.params.strokeFillStyle` (PNL:782; ctxbar shell :1670-1700 `owners()`).
   - The engine reads only the group's own param: `sp.strokeFillStyle || p.strokeFillStyle` (S3:4630). `collectSceneParams` does not carry the child's value.
   - Real-UI drive (`t15`, sphere, taperedEnds): spiral → serpentine → concentric → contourParallel all give hash `ba168513`.
   - A direct write to the group gives `6c4ce990`. The engine works; the plumbing is missing.
   - The S3:4622 comment says this was "measured in the app". That measurement covered only the monolith path.
3. **The Layers-panel "Assign pen" on an Object 3D row does nothing** (`t9b`). The real click sets `child.penId = pen-3`. The output still has 0 paths on pen-3; all of it plots on the group pen. Only the Style-tab **Pen** row routes ink.
4. **The Fill Style picker is dishonest in the opposite direction on curved Spiral and Stipple.**
   - It greys out 29 of 31 entries with "— no effect here" (`t10`).
   - The engine gives **17 distinct outputs** across the 49 ids on a sphere and 14 on a cylinder (`t13`).
   - Real UI (`t14`): a law carried over from Hatch shows "Bundle · Count — no effect here (disabled)". Yet it draws **1,241 dots against Ladder's 849** (+46 %).
   - The faceted note ("draw exactly like Ladder") is true: the box gives 1/49 for contour/spiral/stipple and 11/49 for hatch, which matches the 11 entries offered.
5. **The scene Tone section is a Ladder-only control set, but it is shown for every law** (`t3`, object-only hash):
   - **Bands=4 and Coverage:** dead under 12 of 13 sampled laws on a sphere (live only under `ladder`).
   - **Thresholds:** dead under 10 of 13 laws.
   - **Specular on/size:** dead under **all 13 laws on curved** shapes and under 5 of 13 on the box.
   - **Box Contour and box Stipple:** carry **no tone at all**. Light intensity, Bands and Specular all give an identical object hash.
   - The specular part follows from `HL_STAGE.specular:false` (SF:395). That is **already decided**: see PRH-027 (pre-release-hardening-log.md:55), which says to keep the flags off until the corpus is re-measured. So the fix is to gate the UI, not to re-enable the flag.
6. **Three-pen output never reaches real pens** (measured, `t8`):
   - The 6 pen laws emit `weightScale` 0.867 / 1.733 / 3.1 × the 0.3 mm layer pen. That is 0.26 / 0.52 / 0.93 mm.
   - The tray holds real pens of 0.3 / 0.5 / 0.8 mm.
   - `meta.penTier` is set on the run (SF:7895) but dropped at emit (S3:4845-4848 copies only `weightScale`). **0 paths** carry it.
   - The export already routes each path by `meta.penId` (ui-file-io.js:654, renderer.js:978-1002, engine.js:3984). So N-5 is a one-site stamp, not new plumbing.
   - `layers-panel.js` `isRealPenWidthPath`'s `penTier` branch is dead code.
7. **Maze is a few connected graphs drawn as thousands of pen-lifts** (`t11/t12`):
   - sphere mazeFill: **3,244 paths form only 54 connected components** at 0.01 mm. The odd-degree lower bound is **667 chains**.
   - So emit-time chaining cuts pen-lifts by **≥ 4.9×** with byte-identical ink. The box gives 4,955 → ≥ 1,004.
   - voronoiWeb is different. Its edges stop 0.3-0.6 mm short of the junctions (only 4 shared endpoints in 1,281 paths). A post-pass join would change the geometry, so voronoi must chain inside the law, before the inset.

---

## 1. Control-reachability matrix (summary)

**Keys.** Every style key the engine reads, from the proxy trace (`t1-reads.tsv`) plus grep:
- 70 distinct `style.params` keys, including the 8 collapse sub-control keys.
- Plus layer keys (`strokeFillStyle`, `seed`, `penId`), `border.*`, `tone.*`, `shadow.*` and `ground.enabled`.

**Surfaces:**
- **L** = Object 3D leaf Style tab (enumerated live, `t6`)
- **C** = ctxbar Style flyout (context-bar.js shell :1520-1800)
- **S** = scene-group Style editor (MAPPER_CONTROLS + the Line, Highlight and X-ray blocks). In a tree, S reaches **only the ground and face scope**, so S does not count as "shown" for objects.
- **Shadow** and **Tone** sections (scene tab)
- **Ground** child (Enabled only)

**Cells.** Every relevant key × Type (a key a surface offers for that Type, or an engine-only key for it), × curved/cylinder/faceted. **198 cells** in total. Full table in Appendix A.

| Class (for tree objects) | Cells | Meaning |
|---|---|---|
| **shown + live** | 13 | Pen ×5, Fill Style on hatch/cross, Density on spiral/stipple, 4 slice controls |
| **shown + live, but dead in some contexts** | 30 | Density/Angle/Min rulings/Fill lines/Fill Style/End overlap. Each is dead on some primitive or law, listed in §2 |
| **shown + dead** | 10 | **Seed** ×5 Types (D-1, confirmed) and **Stroke Fill** ×5 Types (NEW, headline 2) |
| **hidden + live** (engine reads it; no object-reachable UI) | 107 | All MAPPER_CONTROLS-only rows (headline 1), `wobbleScale`, `overstroke`, `spiralPitch`, `contourStep`, x-ray, highlight on faceted, `edgeClasses`, `showHidden` |
| **hidden + dead** | 38 | Read but inert: `highlightBands` (every context), `highlightMode`/`highlightSensitivity`/`shadowSensitivity` on contour/spiral/stipple, `xrayBackLineType`, `xrayHiddenEdges`, `toneFlowMode`, `toneQuantLevels` (outside contFieldQuant), `wobbleScale` on spiral/stipple, Fill lines on stipple |

**Per Type:**

| Type | shown+live | shown+live/context-dead | shown+dead | hidden+live | hidden+dead |
|---|---|---|---|---|---|
| hatch | 2 | 7 | 2 | 21 | 5 |
| crosshatch | 2 | 7 | 2 | 24 | 5 |
| contour | 1 | 7 | 2 | 18 | 8 |
| spiral | 2 | 6 | 2 | 21 | 9 |
| stipple | 2 | 2 | 2 | 21 | 11 |
| wireframe | 0 | 0 | 0 | 2 | 0 |
| contourSlice | 4 | 1 | 0 | 0 | 0 |

**Off-matrix surfaces:**

| Surface / control | Class | Evidence |
|---|---|---|
| Tone: Bands, Thresholds, Coverage | shown + live under `ladder` only; dead under most laws | t3 |
| Tone: Specular on/size | shown + dead on curved (all laws); partly live on faceted | t3 |
| Shadow section: 10 rows | shown + live. The shadow Fill Style picker is honestly filtered by `toneLawApplies` (PNL:3266) | t3 |
| `shadowToneDepth` | hidden + live (V13) | t3 |
| Border: enabled/weight/offset/pen | shown + live on L and C, both primitive classes | t17 |
| Ground child | Enabled only. The ground's fill style = scene-scope style, so the Scene Style editor is in effect the ground's style editor | t5 |
| Layers-panel pen pill on an `object3d` | shown + dead (NEW) | t9b |
| Seed / RANDOMIZE | shown + dead (D-1) | t2 |

---

## 2. Dead-combo list (live hash compare; "dead" = byte-identical output)

The sample is 25 laws (every mark class) × 3 primitives. Laws are named where a control is dead for only part of the roster. **Bold** = a control an object can actually see (L or C). The rest are S-only rows, which are dead for objects anyway (headline 1) and dead as listed even where S does reach.

### 2a. Visible to objects (L/C)

| Control | Type | Dead where | Status |
|---|---|---|---|
| **Seed / RANDOMIZE** | all | everywhere (3 primitives × 25 laws × 5 Types) | R2 D-1, confirmed |
| **Stroke Fill** | all 5 | everywhere in a tree (child write). The group-level param is live on the 4 ribbon laws in the sample | **NEW** |
| **Fill Style** | contour/spiral/stipple | faceted: 1 of 49 distinct (the UI is honest) | Confirmed honest |
| **Fill Style** | spiral/stipple | curved: the UI greys out 29 of 31, but the engine gives 17 distinct outputs | **NEW** (dishonest-grey) |
| **Density** | hatch/cross/contour | the 9 mono laws (endShorten, mezzo, etf, defect, duty, maze, voronoi, originSpiral, turing), all 3 primitives | V4 confirmed. It also covers contour (**NEW**) |
| **Angle** | hatch/cross | etf, defect, maze, voronoi, originSpiral, turing (all primitives) | V5 confirmed |
| **Angle** | contour | box: all laws. Curved: dead for 21/25 laws, **including the default `ladder`** (live only for endShorten, penCross, mezzoRegion, dutyConst) | D-4 refined |
| **Angle** | spiral | box: all. Curved: dead for `none`, **`ladder`** and deepFillTSP; live for the other 22 | D-4 **partly refuted** |
| **Angle** | stipple | box: all. Curved: **live** for 24/25 (the lattice rotates), dead only for `none` | D-4 **refuted** on curved |
| **Min rulings** | hatch/cross | sphere and **cylinder**, all laws (the curved path never reads the key, `t1`). Box: dead under the 8 mono laws | D-5 confirmed. Cylinder is **NEW** |
| **Fill lines: Curves** | hatch/cross/contour | mkScribble only (curved) | Minor |
| **Fill lines: Fidelity** | hatch/cross/contour | 11 laws on curved (mono + ampSpacing + trochoidLoop) | **NEW** |
| **End overlap** | contourSlice | box (its own help text admits this) | Known |
| **Layers-panel pen pill** | object3d row | always | **NEW** |

### 2b. S-only rows (ground and face scope)

| Control | Dead where | Status |
|---|---|---|
| Highlight treatment: none, dashed, dotted, sparse, stippleOut | curved: all laws (HL_STAGE.treatment, SF:397). Box hatch/cross: live except for mono laws. Box contour/spiral/stipple: `none` dead | D-6 confirmed. Decided off by **PRH-027** |
| Highlight treatment: altFill, burst | live everywhere | — |
| Highlight mode, Highlight sensitivity, Shadow sensitivity | curved: all. Faceted contour/spiral/stipple: all | **NEW** (the faceted part) |
| **Highlight band count** | **every context, including box hatch** | **NEW** |
| Highlight density, Highlight pen | curved: all | Follows from PRH-027 |
| Angle ref | curved and cylinder: all. Box: the 8 mono laws (plus endShorten/mezzo on `screen`) | D-3 confirmed + cylinder |
| Link fill | curved: all laws (`t11`: identical path counts). Box: mono laws | **NEW** (curved) |
| Cross angle, Cross density | the mono laws, all primitives | D-2 confirmed |
| **Triple hatch** | **box: all 25 laws. Curved: 12 laws, including the default `ladder`** | **NEW** |
| Contour style=Region | box | Faceted contour is already region |
| Spiral centre, Spiral mode | box | Not gated by primitive |
| Spiral eccentricity | curved: under the **default `ladder`** and deepFillTSP | **NEW** |
| Dot angle | dot and ring shapes (rotationally symmetric; `dot` is the default shape) | **NEW** (gate it by shape) |
| Jitter | sphere **and cylinder** | V8 confirmed + cylinder |
| X-ray back line type | everywhere. `emitRuns(…,'dash',…,{forceHidden:true})` overrides it (S3:4239) | **NEW** |
| X-ray hidden edges | everywhere. The EdgeStyles "Hidden" class now owns this | **NEW** |
| X-ray front=Faded | box | **NEW** |
| Wobble scale (hidden) | spiral/stipple everywhere, plus ≥ 23/25 laws on curved hatch | It only resamples segments longer than the scale |

### 2c. Tone section (scene tab), object-only hash (`t3`)

| Control | sphere hatch (13 laws) | box hatch | sphere stipple | box contour/stipple |
|---|---|---|---|---|
| Bands 3→4 / Coverage | dead 12/13 | dead 5/13 | live | dead |
| Bands 3→1 | dead 6/13 | dead 5/13 | live | dead |
| Thresholds | dead 10/13 | dead 13/13 | live | dead |
| Specular on/off, size | **dead 13/13** | dead 5/13 | dead | dead |
| Tone off (Flat) | live (except `none`) | live | live | live |
| Light intensity 1→0.6 | dead only `none`/maze | dead `none`/turing | live | **dead** |

---

## 3. Multi-pen: how output maps to pens today, and concrete designs

**Today (measured, `t8`, `t9b`):**
- **Per-path routing exists end to end.** Scene paths carry `meta.penId` when the style has a pen. Render, SVG export and the "by pen" grouping all bucket each path by `meta.penId || layer.penId` (renderer.js:978-1002, ui-file-io.js:654, engine.js:3984).
- **Sources of `meta.penId`:**
  - style `penId` (S3:4352, 4764)
  - border pen (S3:3604)
  - EdgeStyle pens (S3:1536-1547)
  - x-ray back pen (S3:4226)
  - highlight pen (S3:3867): dead on curved
  - emissive pen (S3:5246)
  - shadow pen (SH:2986)
- **Not a source:** the `object3d` layer's own `penId` (headline 3), the tone tier and the tone band.
- **Three-pen laws** draw on **one** pen with fictional widths (headline 6).

**Designs.** All defaults keep today's output exactly.

| # | Design | Engine site | UI | Effort |
|---|---|---|---|---|
| **MP-1** | **Honour the object-row pen.** In `_composeSceneGroup` (engine.js:2668), when `child.penId` is set and `style.penId` is null, use the child pen as the style pen (inject it in `collectSceneParams` at params.js:1295). Or hide the pill on `object3d` rows. Today's default `child.penId` is the group pen, so no output changes until a user re-picks. | params.js:1282-1296 | none | **S** |
| **MP-2** | **Tier → pen routing (N-5).** Add a style param `tierPens: [id\|null ×3]`, default null. At S3:4845, when `line.penTier != null && tierPens[line.penTier]`, emit `{...lineMeta, penId, weightScale: 1}`; the real nib carries the width. Add an `'auto'` option that snaps each tier to the tray pen nearest to `PEN_MM[k]` (SF:3806), which also covers R1 P-16. | S3:4845-4848, plus the faceted pen-law emit if there is one | Three Pen selects on L, shown only for `STROKE_FILL_PEN_LAWS` (context-bar.js:719). Reuse the same rows where Stroke Fill is disabled today. | **S-M** |
| **MP-3** | **Band → pen (N-6), colour separation.** Use `tone.thresholds` on the per-point `I`, not `zoneOf`, which returns null because `HL_STAGE.toneZones=false` (SF:390, SF:9936). Split runs at band crossings the way `splitByWeight` does (SF:7898). Add a style param `bandPens: [id\|null ×bands]`. | SF emit + S3:4845 | Pen-per-band rows under the Tone section | **M-L** |
| **MP-4** | **Fix the Stroke-Fill plumbing**, so the per-object ribbon fill can pair with MP-2. Carry `child.params.strokeFillStyle` into the object's style bag in `collectSceneParams`, or read `objectLayers.get(id).params` at S3:4630. | params.js:1282 / S3:4630 | none | **S** |
| **MP-5** | **Light/shade pen split.** Generalise `highlightPenId` (dead on curved) into a style param `shadePen` for the "shade side": samples with `I` < a threshold, split as in MP-3. This is the cheapest two-colour look and needs no tone-zone apparatus. | as MP-3 | 1 Pen + 1 threshold | **M** |

---

## 4. Mark chaining and path quality (measured, sphere and box, hatch, `t11`, `t12`)

| Law | Paths | Median mm | Components @0.01 mm | Chain lower bound | Possible lift cut | Note |
|---|---|---|---|---|---|---|
| mazeFill (sphere) | 3,244 | 0.70 | 54 | 667 | **≥ 4.9×**, zero geometry change | Emit-time graph walk |
| mazeFill (box) | 4,955 | 0.69 | — | 1,004 | ≥ 4.9× | same |
| voronoiWeb (sphere) | 1,281 | 0.99 | 1,278 | 1,279 | none without a geometry change | Edges stop 0.3-0.6 mm short of the junctions. Chain inside the law, before the inset |
| taperedEnds | 125 | 3.76 | — | 48 | 2.6× | Ribbon pieces share endpoints |
| ampSpacing | 279 | 3.03 | — | 82 | 3.4× | |
| originSpiral | 291 | 1.19 | — | 119 | 2.4× | Also 9.6 m of pen-up travel in emit order. D-7 dupes still present |
| turingStripe | 215 | 5.12 | — | 56 | 3.8× | |
| penInterleave | 129 | 1.39 | — | 14 | (tier changes) | Each tier change splits a run. Only chain within the same tier, after MP-2 |
| etfKang / defectSplit / mezzoRegion / mkTick | 195 / 185 / 449 / 712 | 10.2 / 16.8 / 10.2 / 3.6 | ≈ paths | ≈ paths | none | Genuinely separate marks |

- **Link fill does not help.** It changes nothing on curved shapes or under mono laws. Only the box ruling laws react: 16 → 4 paths.
- **Design CH-1.** Add `chainMarks` (default **on** would change only the path split; offer it as default **off** if byte-identity of the path list is a contract). Implement it as a graph walk over the shared endpoints of the mono-law output, in MO before return. Reuse the walker pattern at S3:3640-3700 (`chainedFloorSurvivors`).
- **Design CH-2.** `optimization-utils.js:134 joinNearbyPaths` has **no caller**. Offer it as an export step with a tolerance of ≤ 0.05 mm. It is safe for maze. It is unsafe at voronoi's 0.3-0.6 mm gaps.

---

## 5. Engine-capable features with no UI (hidden + live), ranked by artistic value

| Feature | Engine site | Reachable today? | Note |
|---|---|---|---|
| All MAPPER_CONTROLS rows (cross angle/density, triple, angle ref, link fill, contour style, spiral ×5, dot ×4), Line/Dash/Wobble, Highlight altFill/burst, X-ray ×5 | S3 throughout | Face scope only (tree) | Headline 1. This is the biggest "no UI" set, and it exists only because of scope |
| `wobbleScale`, `overstroke` | geometry3d.js:192-193 | no | Live on hatch/contour (overstroke on all 5 Types) |
| `spiralPitch` | S3:3324 | no | Live on box **and on curved flatClip**. Dead on curved surfaceHelix |
| `contourStep` | S3:3341 | no | Live on box **and on curved Region** contour. Dead on curved surface contour |
| `shadowToneDepth` | SH ×9 | no | Live |
| `toneQuantLevels` | S3:4613 | no | Live only under contFieldQuant (V15) |
| `edgeClasses`, `showHidden` (wireframe) | S3:5325 | S only | Live. The leaf shows no wireframe controls at all |
| 8 MK shapes (mkComma, mkSFlick, mkChevron, mkRadialFlick, mkCrossPlus, mkTriangle, mkLozenge, mkDotLozenge) | SF:2886-2950 | no: not in IDS, so they warn and fall back to ladder (T3-impl.md:147) | N-8 |
| curvatureField, whiteLineInverse, hilbertDepth, sfcHalftone, errorDiffused, evenStreamlines, strokesGrow, screenAngles, multiScale | SF:468-907 | no | N-9. None are in the 48-law study (`docs/tone-laws/laws.json`), and none is recorded as rejected |
| Seeded `rng`/`noise` | engine.js:2720-2724 passes them; S3:1488 receives them and never uses them | — | N-2(b) needs no new plumbing |

---

## 6. R2 NEW proposals N-1 … N-9: feasibility with file:line

| # | Verdict | Feasibility evidence |
|---|---|---|
| **N-1** leaf parity | **FEASIBLE, now P0** | The leaf renderer is PNL:1333-1515. The generic renderer `renderControlBase` (PNL:4208-4271) is a closure bound to `resolved`/`commitStyle`. Lift it to module scope with a `write(key,val)` adapter; the leaf adapter is `commit(() => { style.params[k] = v; })` (PNL:1458). Also lift the Line/Wobble block (PNL:4278-4330), the Highlight block (PNL:4420-4520) and the X-ray block (PNL:4531-4650). Reuse the S gating, but add primitive gating where §2 shows dead rows (Min rulings/Angle ref/Link fill on curved, Spiral centre/mode on faceted, Triple on faceted, Dot angle on dot/ring). **M.** Alternative/companion: have S write through to children the way the ctxbar does (renderer.js:12785-12809), and relabel S "Ground & scene default" in tree mode. |
| **N-2** seed | **FEASIBLE** | (a) Add `scene3d`, `object3d` to `SEEDLESS_ALGOS` (ui.js:237) and `SEEDLESS_ALGOS_LIST` (algo-config-panel.js:5012). **S.** (b) The seeded `rng` and `noise` already arrive at S3:1488 (engine.js:2720-2724). The fold-in sites stay as R2 listed. **S-M.** |
| **N-3** depth fade | **FEASIBLE, cheaper than R2 said** | There is **one** chokepoint, `intensityFn` (S3:1651), plus the `noShadowBaseline` twin (S3:2222). Curved fills take it as `opts.intensityFn` (SF:1522-1523). Mono reads `s.I` from SF. Faceted calls the same function (S3:1946, 3159, 3266, 4415, 4526). It receives `worldPoint`, so depth comes from the camera. P-03's tone curve shares the wrapper. R2's "more than one chokepoint" is **refuted**. **S-M.** |
| **N-4** depth-cue dash | FEASIBLE | `G3.applyDepthCue` (geometry3d.js:573). Paths carry `sceneTarget.depth`. **S-M.** |
| **N-5** tier pens | **FEASIBLE, smaller than M** | See MP-2. The single emit site is S3:4845. The export routing exists. **S-M.** |
| **N-6** band pens | FEASIBLE, with a caveat | `zoneOf` is null under HL_STAGE (SF:390, 5528, 9936). Use thresholds on `I` instead. See MP-3. **M-L.** |
| **N-7** chain marks | **FEASIBLE for maze, NOT as a post-pass for voronoi** | See §4. **S-M.** |
| **N-8** mark shapes | FEASIBLE, measure first | MK table at SF:2886-2950. It needs an IDS/STYLE_PARAMS entry (scene3d-tone-laws.js:1014) or a collapse key on mkTick. The T2/T2-1/T2-2 rejections concerned mkTick's length-tone, not shape. No doc rejects the shapes. **M.** |
| **N-9** unrostered laws | FEASIBLE, measure first | curvatureField (SF:645) blends to the light's iso-tangent on a sphere (umbilic), so on spheres it is close to R1 P-09 (`angleRef:'light'`). Expose one, not both. Not in laws.json; not rejected. **M each.** |

---

## 7. Already decided or rejected in docs (do not re-litigate)

- **PRH-027** (pre-release-hardening-log.md:55): HL_STAGE flags stay off until the tone corpus is re-measured. **Do not propose re-enabling Specular, Treatment or Light-driven.** Gate or hide those UI rows on curved shapes instead.
- **plans.md:694**: the scene-scope style is the ground's fallback by design, and stays wireframe. The fix for headline 1 is in the UI (relabel, write-through, leaf parity), not in the cascade.
- **plans.md:759** (`ee91289`): a style-less child inherits the scene. So "make children inherit" is an existing route: a child with no style does inherit. The UI simply never produces one (the leaf seeds `{mapper:'wireframe'}` at PNL:1084; the insert seeds hatch).
- **W-10d / Contract A** (STILL-OPEN:97-99): the picker reachability is owned by `isReachableOn`/`writeBackFor`. Fix headline 4 there (context-bar.js:449-600), not in the panel.
- **V16** (R2): keep the Density ceiling at 220 (S3:1168-1197).
- **mkTick length-tone, W-07b amplitude, the trochoid cliff, T2-8**: rejected or parked. N-8 and N-9 do not touch them.
- **Stroke-fill rework** (docs/stroke-fill-handoff.md): paused, but MP-4 is plumbing and does not depend on it.

---

## 8. Saturation judgement

| Area | Status after R3 | Why |
|---|---|---|
| (1) Object 3D vs Scene editor parity | **Saturated** | Every engine-read key (70, from the proxy trace) is mapped against every surface. The structural cause is found: the scope cascade (headline 1). Further rounds would only re-list rows. |
| (2) Honest controls | **Saturated** | 17,580 hash cells across 3 primitive classes and all 8 mark classes. Every visible dead combo is in §2. The remaining unknowns are single-law corners outside the 25-law sample (for example contFieldQuant for `toneQuantLevels`), and they are hidden keys. |
| (3) Multi-pen | **Saturated (design-ready)** | All `meta.penId` sources are enumerated. Export routing is confirmed. The two drop points are found: S3:4845 (tier) and the child pen. MP-1…MP-5 are concrete and anchored to sites. |
| (4) Chaining | **Saturated (measured)** | The per-law lift-reduction ceiling is measured. Voronoi's geometry gap is identified. |
| (5) Engine-capable, no UI | **Saturated** | The list is closed: the proxy trace plus the unrostered SF/MK ids. |

**Overall: the artistic-flexibility lens is saturated.** A round 4 should be implementation and measurement, not audit.

**Suggested order:**
1. Fix the scope/leaf parity (headline 1 + N-1).
2. MP-4 Stroke-Fill plumbing, MP-1 object pen, N-2(a) Seed hide. These are one-liners.
3. Gate the curved dead rows (§2b, under PRH-027) and fix the picker's dishonest grey (headline 4).
4. MP-2 tier pens.
5. CH-1 maze chaining.
6. N-3/P-03 at S3:1651.

---

## Appendix A — full matrix (198 cells; S = scene editor, which reaches only the ground and face scope in a tree)

| Type | Key | Surfaces (L/C/S) | sphere | cylinder | box | Class (tree objects) |
|---|---|---|---|---|---|---|
| contour | `altFillMapper` | S | live | live | live | hidden+live |
| contour | `burstCenter` | S | live | live | live | hidden+live |
| contour | `burstCount` | S | live | live | live | hidden+live |
| contour | `contourStep` | — | part(25/50 dead) | part(25/50 dead) | live | hidden+live |
| contour | `contourStyle` | S | live | live | DEAD | hidden+live |
| contour | `dashScale` | S | live | live | live | hidden+live |
| contour | `fillAngle` | L | part(21/25 dead) | part(21/25 dead) | DEAD | shown+live(context-dead) |
| contour | `fillCurves` | L S | part(1/25 dead) | part(1/25 dead) | DEAD | shown+live(context-dead) |
| contour | `fillDensity` | L C S | part(18/50 dead) | part(18/50 dead) | live | shown+live(context-dead) |
| contour | `fillFidelity` | L S | part(11/25 dead) | part(11/25 dead) | DEAD | shown+live(context-dead) |
| contour | `fillSimplify` | L S | live | live | DEAD | shown+live(context-dead) |
| contour | `fillSmoothing` | L S | live | live | DEAD | shown+live(context-dead) |
| contour | `highlightBands` | S | DEAD | DEAD | DEAD | hidden+dead |
| contour | `highlightDensity` | S | DEAD | DEAD | live | hidden+live |
| contour | `highlightMode` | S | DEAD | DEAD | DEAD | hidden+dead |
| contour | `highlightPenId` | S | DEAD | DEAD | live | hidden+live |
| contour | `highlightSensitivity` | S | DEAD | DEAD | DEAD | hidden+dead |
| contour | `highlightTreatment` | S | part(125/175 dead) | part(125/175 dead) | part(25/175 dead) | hidden+live |
| contour | `lineType` | S | live | live | live | hidden+live |
| contour | `overstroke` | — | live | live | live | hidden+live |
| contour | `penId` | L C S | live | live | live | shown+live |
| contour | `seed` | L | DEAD | DEAD | DEAD | shown+dead |
| contour | `shadowSensitivity` | S | DEAD | DEAD | DEAD | hidden+dead |
| contour | `strokeFillStyle` | L C S | DEAD | DEAD | DEAD | shown+dead |
| contour | `toneFlowMode` | — | DEAD | DEAD | DEAD | hidden+dead |
| contour | `toneLaw` | L C S | live(49/49) | live(49/49) | DEAD(1/49) | shown+live(context-dead) |
| contour | `toneQuantLevels` | — | DEAD | DEAD | DEAD | hidden+dead |
| contour | `wobble` | S | live | live | live | hidden+live |
| contour | `wobbleScale` | — | DEAD | part(24/25 dead) | live | hidden+live |
| contour | `xrayBackDensity` | S | part(1/4 dead) | part(1/4 dead) | live | hidden+live |
| contour | `xrayBackFaces` | S | live | live | live | hidden+live |
| contour | `xrayBackLineType` | S | DEAD | DEAD | DEAD | hidden+dead |
| contour | `xrayBackPenId` | S | live | live | live | hidden+live |
| contour | `xrayDepthCue` | S | live | live | live | hidden+live |
| contour | `xrayFront` | S | live | live | DEAD | hidden+live |
| contour | `xrayHiddenEdges` | S | DEAD | DEAD | DEAD | hidden+dead |
| contourSlice | `sliceCount` | L S | live | live | live | shown+live |
| contourSlice | `sliceEndOverlap` | L S | live | live | DEAD | shown+live(context-dead) |
| contourSlice | `sliceRotate` | L S | live | live | live | shown+live |
| contourSlice | `sliceTilt` | L S | live | live | live | shown+live |
| contourSlice | `sliceVisibility` | L S | live | live | live | shown+live |
| crosshatch | `altFillMapper` | S | live | live | live | hidden+live |
| crosshatch | `angleRef` | S | DEAD | DEAD | part(14/50 dead) | hidden+live |
| crosshatch | `burstCenter` | S | live | live | live | hidden+live |
| crosshatch | `burstCount` | S | live | live | live | hidden+live |
| crosshatch | `crossAngleDelta` | S | part(9/25 dead) | part(9/25 dead) | part(8/25 dead) | hidden+live |
| crosshatch | `crossDensityRatio` | S | part(20/50 dead) | part(19/50 dead) | part(16/50 dead) | hidden+live |
| crosshatch | `dashScale` | S | live | live | live | hidden+live |
| crosshatch | `facetMinRulings` | L S | DEAD | DEAD | part(17/50 dead) | shown+live(context-dead) |
| crosshatch | `fillAngle` | L C S | part(6/25 dead) | part(6/25 dead) | part(6/25 dead) | shown+live(context-dead) |
| crosshatch | `fillCurves` | L S | part(1/25 dead) | part(1/25 dead) | DEAD | shown+live(context-dead) |
| crosshatch | `fillDensity` | L C S | part(19/50 dead) | part(19/50 dead) | part(16/50 dead) | shown+live(context-dead) |
| crosshatch | `fillFidelity` | L S | part(11/25 dead) | part(11/25 dead) | DEAD | shown+live(context-dead) |
| crosshatch | `fillSimplify` | L S | live | live | DEAD | shown+live(context-dead) |
| crosshatch | `fillSmoothing` | L S | live | live | DEAD | shown+live(context-dead) |
| crosshatch | `highlightBands` | S | DEAD | DEAD | DEAD | hidden+dead |
| crosshatch | `highlightDensity` | S | DEAD | DEAD | live | hidden+live |
| crosshatch | `highlightMode` | S | DEAD | DEAD | live | hidden+live |
| crosshatch | `highlightPenId` | S | DEAD | DEAD | live | hidden+live |
| crosshatch | `highlightSensitivity` | S | DEAD | DEAD | live | hidden+live |
| crosshatch | `highlightTreatment` | S | part(125/175 dead) | part(125/175 dead) | part(9/175 dead) | hidden+live |
| crosshatch | `lineType` | S | live | live | live | hidden+live |
| crosshatch | `linkFill` | S | DEAD | DEAD | part(8/25 dead) | hidden+live |
| crosshatch | `overstroke` | — | live | live | live | hidden+live |
| crosshatch | `penId` | L C S | live | live | live | shown+live |
| crosshatch | `seed` | L | DEAD | DEAD | DEAD | shown+dead |
| crosshatch | `shadowSensitivity` | S | DEAD | DEAD | part(10/25 dead) | hidden+live |
| crosshatch | `strokeFillStyle` | L C S | DEAD | DEAD | DEAD | shown+dead |
| crosshatch | `toneFlowMode` | — | DEAD | DEAD | DEAD | hidden+dead |
| crosshatch | `toneLaw` | L C S | live(49/49) | live(49/49) | live(11/49) | shown+live |
| crosshatch | `toneQuantLevels` | — | DEAD | DEAD | DEAD | hidden+dead |
| crosshatch | `tripleHatch` | S | part(12/25 dead) | part(12/25 dead) | DEAD | hidden+live |
| crosshatch | `wobble` | S | live | live | live | hidden+live |
| crosshatch | `wobbleScale` | — | part(23/25 dead) | part(23/25 dead) | part(8/25 dead) | hidden+live |
| crosshatch | `xrayBackDensity` | S | part(1/4 dead) | part(1/4 dead) | live | hidden+live |
| crosshatch | `xrayBackFaces` | S | live | live | live | hidden+live |
| crosshatch | `xrayBackLineType` | S | DEAD | DEAD | DEAD | hidden+dead |
| crosshatch | `xrayBackPenId` | S | live | live | live | hidden+live |
| crosshatch | `xrayDepthCue` | S | live | live | live | hidden+live |
| crosshatch | `xrayFront` | S | live | live | DEAD | hidden+live |
| crosshatch | `xrayHiddenEdges` | S | DEAD | DEAD | DEAD | hidden+dead |
| hatch | `altFillMapper` | S | live | live | live | hidden+live |
| hatch | `angleRef` | S | DEAD | DEAD | part(14/50 dead) | hidden+live |
| hatch | `burstCenter` | S | live | live | live | hidden+live |
| hatch | `burstCount` | S | live | live | live | hidden+live |
| hatch | `dashScale` | S | live | live | live | hidden+live |
| hatch | `facetMinRulings` | L S | DEAD | DEAD | part(17/50 dead) | shown+live(context-dead) |
| hatch | `fillAngle` | L C S | part(6/25 dead) | part(6/25 dead) | part(6/25 dead) | shown+live(context-dead) |
| hatch | `fillCurves` | L S | part(1/25 dead) | part(1/25 dead) | DEAD | shown+live(context-dead) |
| hatch | `fillDensity` | L C S | part(19/50 dead) | part(19/50 dead) | part(17/50 dead) | shown+live(context-dead) |
| hatch | `fillFidelity` | L S | part(11/25 dead) | part(11/25 dead) | DEAD | shown+live(context-dead) |
| hatch | `fillSimplify` | L S | live | live | DEAD | shown+live(context-dead) |
| hatch | `fillSmoothing` | L S | live | live | DEAD | shown+live(context-dead) |
| hatch | `highlightBands` | S | DEAD | DEAD | DEAD | hidden+dead |
| hatch | `highlightDensity` | S | DEAD | DEAD | live | hidden+live |
| hatch | `highlightMode` | S | DEAD | DEAD | live | hidden+live |
| hatch | `highlightPenId` | S | DEAD | DEAD | live | hidden+live |
| hatch | `highlightSensitivity` | S | DEAD | DEAD | live | hidden+live |
| hatch | `highlightTreatment` | S | part(125/175 dead) | part(125/175 dead) | part(10/175 dead) | hidden+live |
| hatch | `lineType` | S | live | live | live | hidden+live |
| hatch | `linkFill` | S | DEAD | DEAD | part(8/25 dead) | hidden+live |
| hatch | `overstroke` | — | live | live | live | hidden+live |
| hatch | `penId` | L C S | live | live | live | shown+live |
| hatch | `seed` | L | DEAD | DEAD | DEAD | shown+dead |
| hatch | `shadowSensitivity` | S | DEAD | DEAD | part(10/25 dead) | hidden+live |
| hatch | `strokeFillStyle` | L C S | DEAD | DEAD | DEAD | shown+dead |
| hatch | `toneFlowMode` | — | DEAD | DEAD | DEAD | hidden+dead |
| hatch | `toneLaw` | L C S | live(49/49) | live(49/49) | live(11/49) | shown+live |
| hatch | `toneQuantLevels` | — | DEAD | DEAD | DEAD | hidden+dead |
| hatch | `wobble` | S | live | live | live | hidden+live |
| hatch | `wobbleScale` | — | part(24/25 dead) | part(23/25 dead) | part(8/25 dead) | hidden+live |
| hatch | `xrayBackDensity` | S | part(1/4 dead) | part(1/4 dead) | live | hidden+live |
| hatch | `xrayBackFaces` | S | live | live | live | hidden+live |
| hatch | `xrayBackLineType` | S | DEAD | DEAD | DEAD | hidden+dead |
| hatch | `xrayBackPenId` | S | live | live | live | hidden+live |
| hatch | `xrayDepthCue` | S | live | live | live | hidden+live |
| hatch | `xrayFront` | S | live | live | DEAD | hidden+live |
| hatch | `xrayHiddenEdges` | S | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `altFillMapper` | S | live | live | live | hidden+live |
| spiral | `axisSnap` | S | live | live | live | hidden+live |
| spiral | `burstCenter` | S | live | live | live | hidden+live |
| spiral | `burstCount` | S | live | live | live | hidden+live |
| spiral | `dashScale` | S | live | live | live | hidden+live |
| spiral | `fillAngle` | L | part(3/25 dead) | part(3/25 dead) | DEAD | shown+live(context-dead) |
| spiral | `fillCurves` | L S | live | live | DEAD | shown+live(context-dead) |
| spiral | `fillDensity` | L C S | live | live | live | shown+live |
| spiral | `fillFidelity` | L S | live | live | DEAD | shown+live(context-dead) |
| spiral | `fillSimplify` | L S | live | live | DEAD | shown+live(context-dead) |
| spiral | `fillSmoothing` | L S | live | live | DEAD | shown+live(context-dead) |
| spiral | `highlightBands` | S | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `highlightDensity` | S | DEAD | DEAD | live | hidden+live |
| spiral | `highlightMode` | S | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `highlightPenId` | S | DEAD | DEAD | live | hidden+live |
| spiral | `highlightSensitivity` | S | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `highlightTreatment` | S | part(125/175 dead) | part(125/175 dead) | part(25/175 dead) | hidden+live |
| spiral | `lineType` | S | live | live | live | hidden+live |
| spiral | `overstroke` | — | live | live | live | hidden+live |
| spiral | `penId` | L C S | live | live | live | shown+live |
| spiral | `seed` | L | DEAD | DEAD | DEAD | shown+dead |
| spiral | `shadowSensitivity` | S | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `spiralAngleOffset` | S | live | live | live | hidden+live |
| spiral | `spiralCenter` | S | live | live | DEAD | hidden+live |
| spiral | `spiralEccentricity` | S | part(2/25 dead) | part(2/25 dead) | live | hidden+live |
| spiral | `spiralMode` | S | live | live | DEAD | hidden+live |
| spiral | `spiralPitch` | — | part(25/50 dead) | part(25/50 dead) | live | hidden+live |
| spiral | `strokeFillStyle` | L C S | DEAD | DEAD | DEAD | shown+dead |
| spiral | `toneFlowMode` | — | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `toneLaw` | L C S | live(17/49) | live(14/49) | DEAD(1/49) | shown+live(context-dead) |
| spiral | `toneQuantLevels` | — | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `wobble` | S | live | live | live | hidden+live |
| spiral | `wobbleScale` | — | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `xrayBackDensity` | S | part(1/4 dead) | part(1/4 dead) | live | hidden+live |
| spiral | `xrayBackFaces` | S | live | live | live | hidden+live |
| spiral | `xrayBackLineType` | S | DEAD | DEAD | DEAD | hidden+dead |
| spiral | `xrayBackPenId` | S | live | live | live | hidden+live |
| spiral | `xrayDepthCue` | S | live | live | live | hidden+live |
| spiral | `xrayFront` | S | live | live | DEAD | hidden+live |
| spiral | `xrayHiddenEdges` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `altFillMapper` | S | live | live | live | hidden+live |
| stipple | `burstCenter` | S | live | live | live | hidden+live |
| stipple | `burstCount` | S | live | live | live | hidden+live |
| stipple | `dashScale` | S | live | live | live | hidden+live |
| stipple | `dotAngle` | S | DEAD for dot/ring, live for cross/plus/tick | same | same | hidden+live (shape-gated, t16) |
| stipple | `dotShape` | S | live | live | live | hidden+live |
| stipple | `dotSize` | S | live | live | live | hidden+live |
| stipple | `fillAngle` | L | part(1/25 dead) | part(1/25 dead) | DEAD | shown+live(context-dead) |
| stipple | `fillCurves` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `fillDensity` | L C S | live | live | live | shown+live |
| stipple | `fillFidelity` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `fillSimplify` | S | live | live | DEAD | hidden+live |
| stipple | `fillSmoothing` | S | live | live | DEAD | hidden+live |
| stipple | `highlightBands` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `highlightDensity` | S | DEAD | DEAD | live | hidden+live |
| stipple | `highlightMode` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `highlightPenId` | S | DEAD | DEAD | live | hidden+live |
| stipple | `highlightSensitivity` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `highlightTreatment` | S | part(125/175 dead) | part(125/175 dead) | part(25/175 dead) | hidden+live |
| stipple | `lineType` | S | live | live | live | hidden+live |
| stipple | `overstroke` | — | live | live | live | hidden+live |
| stipple | `penId` | L C S | live | live | live | shown+live |
| stipple | `seed` | L | DEAD | DEAD | DEAD | shown+dead |
| stipple | `shadowSensitivity` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `stippleJitter` | S | DEAD | DEAD | live | hidden+live |
| stipple | `strokeFillStyle` | L C S | DEAD | DEAD | DEAD | shown+dead |
| stipple | `toneFlowMode` | — | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `toneLaw` | L C S | live(17/49) | live(14/49) | DEAD(1/49) | shown+live(context-dead) |
| stipple | `toneQuantLevels` | — | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `wobble` | S | live | live | live | hidden+live |
| stipple | `wobbleScale` | — | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `xrayBackDensity` | S | live | live | live | hidden+live |
| stipple | `xrayBackFaces` | S | live | live | live | hidden+live |
| stipple | `xrayBackLineType` | S | DEAD | DEAD | DEAD | hidden+dead |
| stipple | `xrayBackPenId` | S | live | live | live | hidden+live |
| stipple | `xrayDepthCue` | S | live | live | live | hidden+live |
| stipple | `xrayFront` | S | live | live | DEAD | hidden+live |
| stipple | `xrayHiddenEdges` | S | DEAD | DEAD | DEAD | hidden+dead |
| wireframe | `edgeClasses` | S | live | live | part(1/2 dead) | hidden+live |
| wireframe | `showHidden` | S | live | live | live | hidden+live |