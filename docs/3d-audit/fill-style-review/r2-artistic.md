# R2 — Object 3D Fill Styles: adversarial re-audit of artistic flexibility (lens c)

**Scope.** This report checks the claims in `r1-artistic.md` and its part files, then looks for gaps. It is read-only, at `main e609338c`. App v1.4.5 is served from the main repo on :8517.

**Evidence method.** Playwright drives the real app (`app.engine.addLayer('scene3d')` → object style → `app.engine.generate`). Each test hashes `scenePaths` (FNV over 3-dp coordinates) and counts paths, ink mm and exact-duplicate paths. Scripts and screenshots are in `fillstyle-audit/r2/`:
- `t2.js`: mono Density, Angle and crosshatch
- `t3.js`: penCross, dot screen, stipple, box
- `t4/t5.js`: seed
- `t6.js`: turing variants
- `t8–t16.js`: control reachability
- `*.png`: screenshots

Abbreviations follow R1: SF, MO, S3, MP, PR, RG, PNL, TL.

---

## 1. Verdict table — R1 claims

| # | R1 claim | Verdict | Evidence |
|---|---|---|---|
| V1 | `params.seed` is normalised (PR:1496) but never read | **CONFIRMED** | Its only reference in scene3d code is PR:1496. Live test: seed 1145 → 12345 → 1 gives byte-identical hashes for mazeFill and stipple (`t4.js`). |
| V2 | …"and not shown in the UI" | **REFUTED — and worse** | scene3d is not in `SEEDLESS_ALGOS` (ui.js:237, algo-config-panel.js:5012). **"Transform & Seed" shows a Seed field and a RANDOMIZE button on both the Scene 3D group and the Object 3D leaf** (`seed-expanded.png`, `style-etf-crosshatch.png`). RANDOMIZE pushes history and regens, and nothing changes. It is a visible dead control, which breaks principle 1. Every new layer gets a **random** seed (layer.js:48), so wiring `params.seed` directly would change every saved scene. See N-2. |
| V3 | No tone curve; intensity is raw Lambert (RG:84-88) | **CONFIRMED, with nuance** | `max(0, n·L)` at RG:84. No gamma, contrast or S-curve anywhere. But the user already has **gain/offset** controls: per-light `intensity` 0-4, an ambient light (default 0.25), and point/spot/area lights, with the total clamped to [0,1] (PR:1389-1425). Bands, thresholds and the ladder give a stepped curve. P-03 still holds. Its payoff is shaping, not exposure. Sibling `imageSurface` already ships gamma, contrast and invert. |
| V4 | Density does nothing on the 9 mono laws (`makeCtx` ignores `masterPitch`) | **CONFIRMED** | `masterPitch` gets 0 hits in MO. Sphere hatch, d=20/50/150 give identical hashes on all 9 laws. Box faceted etfKang d50 = d150 (`t2.js`, `t3.js`). The faceted caller's comment at S3:3205 ("so Density … still set the scale the law works at") is false. |
| V5 | Fill angle is ignored by 6 of 9 mono laws | **CONFIRMED** | Angle 0/45/90 gives identical hashes on etfKang, defectSplit, originSpiral, turingStripe, voronoiWeb and mazeFill. It changes mezzo, duty and endShorten. `C.rot` readers are at MO:988, 1441, 1509 only. |
| V6 | Mono crosshatch double-inks identical geometry (MO:2956) | **CONFIRMED (measured)** | The duplicate path counts are in the next table. |
| V6a | …"2× pen time" | **PARTLY** | Measured at **+50-65 % ink and +66-98 % pen-downs**, not 2×. |
| V6b | Cross angle, Cross density and Triple hatch on mono | **NEW (not in R1)** | All three are inert on mono crosshatch, and so is Angle ref. mezzo, duty and etf all give identical hashes. |
| V7 | turingStripe anisotropy ×0.0 (MO:2541) | **CONFIRMED** | Code: `0.9 * along * 0.0`. The catalog says "keeps the stripes running across the form's shading" (TL:721). That is false today. |
| V7a | P-08 "re-enabling it gives fingerprint stripes" | **PARTLY** | The term is a first-derivative (advective) term, not anisotropic diffusion. Measured by patching the term in the page (`t6.js`, `turing-strip.png`). **At 0.9**, stripes align, but only in the lit zone, and ink is −1 %. **At 3.0**, the pattern breaks into noise: paths 297 → 621, ink +28 %. A true second-derivative anisotropy gives blobs, not stripes. Cap `stripeAlign` at ≤1, and do not promise whole-form alignment. |
| V8 | Curved stipple ignores `stippleJitter` | **CONFIRMED** | On the sphere, j=0, 40 and 100 give identical hashes. On the box, j0 ≠ j40. Code: the curved stipple branch has no jitter input (SF:12899-12972). R1 calls it a "fixed 7-step dither", which is **PARTLY** right: that is only the fallback. Under the default ladder, the curved stipple uses `ladderKeeps` with a golden row phase (SF:12937-12946), so it **does** carry tone. |
| V9 | `penCross` ignores `crossAngleDelta` / `crossDensityRatio` | **PARTLY** | The law's own cross family is fixed at `{deg:60, div:2}` (SF:4176). But on the crosshatch mapper both dials **do** move output, via the mapper's family B (`t3.js`: 156 → 153/149 paths). On hatch, the dials are not shown, so no dead control is visible. |
| V10 | `mkDotScreen` ignores `dotSize` / `dotAngle` | **PARTLY / mis-framed** | `rMax 0.58R` is hard-coded (SF:3034). But dotSize and dotAngle are only on the **stipple** mapper, and on stipple the law shows "— no effect here". The keys are never visible beside mkDotScreen. Also, `dotSize` is an absolute radius (0.1-3), and rMax is a share of a cell. **P-04(b) as written is wrong: use new keys.** |
| V11 | wobbleScale and overstroke are engine-live with no UI | **CONFIRMED** | Read at geometry3d.js:192-193. The only panel reference is `STROKE_DEFAULTS` (PNL:357). Note: the export optimiser already has a `multipass` step with passes, offset, **jitter** and **seed** (defaults.js:2577). That is a global double-strike, so overstroke is partly redundant. |
| V12 | spiralPitch, contourStep | **CONFIRMED (faceted only)** | Read at S3:3324-3341 (`spiralOptsFrom`, `regionSpacingFor`), faceted region path only. On curved shapes they would be dead, so gate them by primitive. |
| V13 | shadowToneDepth | **CONFIRMED** | Default 0.75 (PR:502). The panel only backfills it (PNL:2086). There is no control. |
| V14 | crease angle (edges.js:22) is "engine-supported" | **PARTLY** | `classifyEdges` accepts `opts.creaseAngle`, but **both callers pass `{}`** (S3:3989, shadows.js:589). There is no param plumbing. shadows.js shares the classifier, so a crease knob must not change shadow classification. Sibling 3D algorithms already expose `creaseAngle` at 10-80° (controls-registry.js:99). |
| V15 | toneQuantLevels (contFieldQuant) | **CONFIRMED** | Forwarded at S3:4613 and clamped 4-256 with default 128 (PR:783, SF:1491). No UI. `toneFlowMode` is dead, as R1 says. |
| V16 | Density UI is 220 and the engine clamp is 500 | **CONFIRMED, but the proposal is weak** | S3:1168-1197 explicitly calls 200-500 "a path-count/plot-time knob, not a visible-tone knob". 220 is the documented meaningful ceiling. Do not raise it for artistic reasons. |
| V17 | Faceted (flat) stipple carries no tone (MP:226) | **CONFIRMED** | Box stipple: `toneLaw:none` and ladder give the same hash (`t3.js`). Spacing comes from Density only (S3:3361). |
| V18 | "Coarse — 4 rungs" label is wrong | **CONFIRMED** | The label is from build-tone-laws.js:240. The ladder has `tone.ladder.length` rungs, which is 3 by default (SF:409). |
| V19 | Triple-hatch comment says 45°, the code uses 32° | **CONFIRMED** | S3:2379 vs S3:2382. |
| V20 | R1 "Exposed today" columns (hatch: Angle ref, Link fill; crosshatch: Cross angle…; stipple: Dot/Jitter…) | **PARTLY — these are not on the Object 3D panel** | The Object 3D leaf Style tab (`buildObjectPanel`) does **not** read MAPPER_CONTROLS (its own comment, PNL ~1467). It shows only Pen, Type, Fill Style (+ sub-control), Stroke Fill, Density, Angle, Min rulings, Fill lines, Border and Edge styles (`t11/t12.js`). Cross angle, Cross density, Triple, Angle ref, Link fill, the spiral and dot controls, Line type, Wobble and Highlight exist **only in the Scene group's Style editor** (`t14.js`). See N-1. |
| V21 | R1 P-01 is "S (UI only)" | **PARTLY** | On the leaf surface, the line-type and wobble rows do not exist at all, so wobbleScale and overstroke need the leaf-parity work in N-1 first. |
| V22 | Nested constants spot-check | **CONFIRMED** | 17 constants spot-checked; all match the cited line: NIB 45/0.35, TAPER 3.5/0.42/0.09, WV_LAMBDA 7.3, TROCH 0.48, ADJ_MAX 8, DITHER 14mm, HANDOFF 0.55, TSP 0.18/0.4/1.6, RIBBON 0.15, serpentine `axis:null` SF:8440, LOZ 0.9/0.35, wave phases SF:4585-4596, PEN_MM SF:3806, turing 170 iterations. |

Mono crosshatch duplicates (V6), on a sphere at d=50, hatch vs crosshatch:

| Law | Paths (hatch → crosshatch) | Exact duplicate paths | Ink (mm) |
|---|---|---|---|
| etfKang | 269 → 456 | 187 | 6846 → 11245 |
| voronoiWeb | 1368 → 2654 | 1286 | — |
| mazeFill | 3314 → 6546 | 3232 | — |
| turingStripe | 297 → 512 | 215 | — |
| defectSplit | 240 → 398 | 158 | — |
| originSpiral | 363 → 644 | 316 | — |

The box (faceted) path does the same: etf has 189 duplicates and maze 5171. mezzo, duty and endShorten have 0 duplicates.

### Do R1's proposed defaults reproduce today's output?

| Proposal | Default = today? | Note |
|---|---|---|
| P-01 | ✓ | wobbleScale 6, overstroke false, shadowToneDepth 0.75 and quant 128 all match engine fallbacks. Crease 28 also matches, but needs plumbing first (V14). |
| P-02 `fillSeed` 0 | ✓ only as a new key | That leaves the visible seed dead and adds a second seed. N-2 is a better design. |
| P-03 | ✓ only with an identity short-circuit | There is more than one chokepoint: RG `intensity`, SF `smp.I`, MO `s.I`, the faceted `intensityFn`, and shadow-receive. |
| P-04(a) penCross keys | ✓ | — |
| P-04(b) dot screen | ✗ | Mis-specified (V10). |
| P-04(c) curved jitter | **contradiction** | The absent-sentinel key keeps the visible Jitter slider dead. House rule phase2-requirements-draft.md:16 §5 allows a baseline change "*unless the change is itself the fix (wiring a previously-dead control)*". Wire `stippleJitter` on curved shapes and re-baseline, or `showIf`-hide it on curved shapes. |
| P-04(d) | n/a | A defect fix; the output change is the point. |
| P-05, P-07, P-12-P-15, P-17, P-18 | ✓ | Constants match. |
| P-06 | ✓ | `nibContrast` 0.65 → `1-0.65 === 0.35` is exact in JS (checked). |
| P-08 | ✓ | At 0 the term is ×0. |
| P-11 | **contradiction** | A new `absent ⇒ ×1` key keeps Density and Angle dead, yet R1 says it "removes 2 dead controls". Either wire the existing keys under house rule §5 (re-baseline mono) or hide Density and Angle for direction-free mono laws. |

Tally of the 22 rows: **CONFIRMED 14, PARTLY 7, REFUTED 1** (V2), plus 1 new sub-finding (V6b) inside V6. Default-identity checks: 10 hold, 1 is wrong (P-04b), and 3 are contradictory (P-02, P-04c, P-11).

---

## 2. New dead or misleading controls found (defects, not knobs)

| # | Control | Context | Proof |
|---|---|---|---|
| D-1 | **Seed + RANDOMIZE** | every scene3d / object3d | V2 |
| D-2 | Cross angle, Cross density, Triple hatch, Angle ref | crosshatch + any mono law (scene editor) | `t8.js`: identical hashes |
| D-3 | **Angle ref** (Face/Screen/Up) | every law on **curved** primitives (sphere ladder: face = screen = up) | `t9.js`. It works on the box. It is not `showIf`-gated by primitive. |
| D-4 | Leaf **Angle** dial | contour (always), stipple and spiral on faceted shapes | `t16.js`. The leaf shows Angle for all 5 FILL_MAPPERS. The scene editor correctly omits it for contour, spiral and stipple, so the two surfaces disagree. |
| D-5 | Leaf **Min rulings** | curved primitives | Its own help text admits "No effect on smooth shapes". It is still shown. |
| D-6 | **Highlight Treatment**: Blank, None, Dashed, Dotted, Sparse, Stipple (6 of 8) | sphere and torus (curved) hatch | `t15.js`: identical hashes. Only Alt fill and Burst change. All 8 work on the box. This is probably a side effect of the staged tone unwire (memory `project_scene3d_tone_unwire`). Check it there before acting, but it is visible today. |
| D-7 | originSpiral emits **34 exact duplicate short segments** (0.6-1.1 mm) in a **single** hatch pass | sphere d50 | `t7.js` |
| D-8 | mazeFill / voronoiWeb are unchained | sphere | maze is **3314 paths for 4928 mm (median 0.70 mm)**; voronoi is 1368 paths. Link fill has no effect on them. The export pipeline has **no join step** by default: `joinNearbyPaths` is defined (optimization-utils.js:134) but no caller invokes it, and the defaults are simplify, sort, filter (off) and multipass (off). Pen-lifts dominate plot time. |

---

## 3. NEW proposals (gap hunt)

The defaults reproduce today's output exactly unless a row says otherwise.

| # | NEW proposal | Range / default | Payoff (artist / plotter) | Effort | Plot cost |
|---|---|---|---|---|---|
| **N-1** | **Object 3D leaf parity.** Render the MAPPER_CONTROLS rows (cross angle/density/triple, angle ref, link fill, spiral, dot shape/size/jitter/angle, wireframe edges) plus the stroke rows (Line, Wobble) and Highlight on the leaf Style tab, behind a "More" disclosure. Use the scene editor's own gating. | UI only, no new keys | Today the user's own surface hides half the existing controls (V20). Every per-law knob from R1 lands here, so this is a prerequisite for R1 P-01 and P-04-P-18. | **M** (PNL `buildObjectPanel`) | none |
| **N-2** | **Make the visible seed honest.** (a) Now: add scene3d and object3d to both SEEDLESS lists. (b) Then: wire `params.seed` into the hashes (MP:146, MO `C.hash`, SF `sfHash`, S3 `ldHash`, geometry3d `strokeHash`, golden phase). Gate it on `seedWired:true`, stamped only on new layers and on the user's first RANDOMIZE, so saved scenes stay byte-identical. Also pass the seeded `noise` that `generate(params, rng, noise)` already receives into NoiseRack (P-19/20). This replaces R1 P-02's separate `fillSeed`. | (a) hide; (b) int, default ignored unless the flag is set | Reroll an unlucky moiré or a stray mark. One seed for the scene, as in every other algorithm. | (a) **S**; (b) **S-M** | none |
| **N-3** | **Atmospheric depth fade.** `depthFade` 0-1 (**0**), `depthFadeRange` near/far (auto from scene z-bounds), `depthFadeDir` far-lighter / near-lighter. `I' = I + (1−I)·fade·t(z)`, at the same chokepoint as P-03. The samples already carry `z` (SF `smp.z`; faceted face centroid). | as listed | Aerial perspective: distant objects go airy and sparse, the classic engraving depth cue. Today a far object inks exactly like a near one. Near-lighter gives a spotlight vignette. | **M** (shares P-03's work) | **less** ink |
| **N-4** | **Depth Cue parity: dash by depth.** Sibling 3D algorithms have `depthCue: off|dash` + `depthCueStrength` (controls-registry.js:86-95; `G3.applyDepthCue` geometry3d.js:573). scene3d has it only for x-ray hidden lines (S3:3803). Offer it for edges and fills. | off / 0 | A cheap depth read on wireframe and edge-only scenes, and consistent with Polyhedron, Topoform and Terrain. | **S-M** (reuse) | dashes = more lifts |
| **N-5** | **Route pen tiers to real pens.** The 6 three-pen laws tag `meta.penTier`, but every line still exports on the object's single pen as a `weightScale` (layers-panel.js:2551-2607; PEN_MM is fixed at SF:3806). Add `tierPens: [penId|null ×3]` (**null** = today) so tier k is emitted on pen k. Pair it with R1 P-16, which takes the widths from those pens. | null ×3 | Three-pen laws become real multi-nib plots. Today the plotter draws the "broad" lines with the fine nib. | **M** | +1-2 pen changes |
| **N-6** | **Pen per tone band (colour separation).** `bandPens` gives one pen per tone band, darkest first (default inherit). The ladder already knows the zone per sample (`zoneOf`). | inherit | Two-colour engraving: a sepia mid-tone with black shadows, or a warm-light / cool-shadow split. A defining plotter-art move with no route today. | **M-L** | +1 pen change per band |
| **N-7** | **Chain the mono marks.** Join the maze walls and voronoi edges into polylines at emit (a graph walk; S3:3671 already has a chainer for other use). Optionally turn the default-off `joinNearbyPaths` into an export step. | on (output geometry is identical; only the path split changes) | Same picture, far fewer pen-lifts: maze median path 0.7 mm × 3314. | **S-M** | **many fewer** lifts |
| **N-8** | **Mark shape vocabulary (hooks, flicks, ticks).** The MK table already implements `mkComma`, `mkSFlick`, `mkChevron`, `mkRadialFlick`, `mkCrossPlus`, `mkTriangle`, `mkLozenge` and `mkDotLozenge` (SF:~1141-1230, 2942). None is in IDS; the audit uses them only as "provably unreachable" negative controls (T2-3b-plan.md:566). Expose them as `markShape` on the mkTick survivor (**tick**). | tick | Hooked ticks, commas and S-flicks: the hand engraver's mark-end grammar. | **M** + measurement | ⚠ They were not in the 48-law study, and mkTick took 3 attempts (T2/T2-1/T2-2 rejected), so treat this as measure-first. |
| **N-9** | **Engine-present but unreachable looks.** These SF ids are not in IDS: `curvatureField` (Hertzmann-Zorin principal-curvature rulings, 14 refs), `whiteLineInverse` (white-line engraving), `hilbertDepth` / `sfcHalftone` (space-filling-curve halftone), `errorDiffused`, `evenStreamlines`, `strokesGrow`. Offer `curvatureField` as `angleRef:'curvature'`; the rest are roster candidates. R1 named only contourFlow, tourScribble, penScreen and penOctaves. | absent | Curvature-following hatch is the strongest form cue in pen illustration. White-line engraving and SFC halftone are distinct looks. | **M** each + reachability check | varies |
| **N-10** | **Crevice / contact darkening (ambient-occlusion tone term).** `creviceDarken` 0-1 (**0**). It darkens where objects meet the ground or each other. Source: the existing receive-occlusion test (`shadowReceiveOnObjects`, Regions occlusion hook RG:155), or the unrouted `lawCrevice` / `lawContact` (MO:1016/1056). | 0 | Grounds objects. Without cast shadow the contact read is missing. | **L** | more ink at contacts |
| **N-11** | **Wobble character.** `wobbleMode: hash|smooth` (**hash**). Today wobble is per-vertex white noise on a 0.25 mm hash grid, resampled at wobbleScale (geometry3d.js:240-255), which reads as nervous kinks. Smooth mode uses NoiseRack value-noise along the arc, giving a low-frequency hand drift. | hash | Relaxed freehand line vs a nervous tremor. | **S-M** | none |
| **N-12** | **Per-facet angle variation.** `facetAngleJitter` 0-45° (**0**), a hashed rotation per face on the faceted path (seeded by N-2). | 0 | Stained-glass or veneer look on polyhedra and imported meshes. Hand-hatched facets are never all parallel. | **S** | none |
| **N-13** | **Rim reserve (light-independent white edge).** `rimReserve` 0-1 (**0**) removes ink where `|nz|` → 0 (the limb) as a fresnel-like term, separate from Lambert. | 0 | A white rim, the illustrator's back-light cheat. ⚠ It overlaps the dormant `LIMB_CROSS_*` / `FEATHER_*` (HL_STAGE off). Check it against the tone-unwire plan first; it may be exactly what was unwired. | **M** | less ink |

**Checked and found already covered** (do not propose):
- Per-object and per-face variation: each object has its own style, and there are `byFace` overrides (S3:1160) and an "Editing: Scene/Object/Face" scope in the scene editor.
- Multiple lights: directional, ambient, point, spot and area, with per-light intensity.
- Light-relative shadow angle: `shadowAngleFollowsLight`. R1 P-09 covers hatch.
- Minimum segment length: the global export `filter` step has `minLength`.
- Global overstroke: the export `multipass` step.
- Outline emphasis: per-edge-class EdgeStyle pen, weight and dash.
- Pass ordering: the global `linesort`.

No item in `docs/3d-audit` (STILL-OPEN, phase2/3, fill-audit-handoff) rejects depth fade, seed, pen routing or mark shapes. The relevant rejects are the ones R1 already lists: W-07b amplitude, mkTick length-tone, the trochoid cliff, and T2-8.

---

## 4. Saturation judgement

- **Per-law constant knobs: saturated.** R1's part files list essentially every artist-relevant literal. R2 found no high-value per-law constant that R1 missed. Further rounds on this axis will yield single-law S-knobs of narrow appeal.
- **Structural and plotter axis: not saturated, and it outranks R1's tier 1.** The biggest gains are not new knobs. They are:
  1. Make existing controls reachable from the Object 3D panel (N-1).
  2. Make visible controls honest (D-1…D-6, plus R1's mono and stipple defects).
  3. Turn three-pen and tone output into real multi-pen plots (N-5/N-6).
  4. Add the two missing global tone shapers, P-03 curve and N-3 depth fade.

**Suggested order:**
1. D-1 via N-2(a). This is a one-line hide.
2. Fix the mono defects: crosshatch duplicates (P-04d), wire or hide Density and Angle (a corrected P-11), and D-2/D-3.
3. N-1.
4. P-03 + N-3, sharing one chokepoint.
5. N-5, then N-7.
6. R1 P-05 to P-08.

A round 3 should be a feasibility spike, not more brainstorming:
- Reachability of N-8 and N-9 through `resolveToneLaw` and `effectiveLaw`.
- The N-2(b) `seedWired` migration.
- Whether D-6 is intentional under the tone unwire.
