# R1 — Object 3D Fill Styles: Artistic-Flexibility Audit (lens c)

**Scope.** Object 3D layer (`scene3d`) → Style tab → **Type** (fill mapper) and **Fill Style** (tone law). Read-only audit at `main e609338c`.

**Coverage.**
- All 48 roster ids in `SCENE3D_TONE_LAWS.IDS` (src/config/scene3d-tone-laws.js:757), plus the engine default `ladder`. That is 49 laws.
- All 8 mappers (params.js:79).
- The 4 stroke-fill styles (surface-fill.js:59), shadow hatch, and ground fill.

**Abbreviations.**

| Short | File |
|---|---|
| SF | src/core/scene3d/surface-fill.js |
| MO | src/core/scene3d/surface-fill-mono.js |
| S3 | src/core/algorithms/scene3d.js |
| MP | src/core/scene3d/mappers.js |
| PR | src/core/scene3d/params.js |
| RG | src/core/scene3d/regions.js |
| SH | src/core/scene3d/shadows.js |
| PNL | src/ui/panels/scene3d-panel.js |
| TL | src/config/scene3d-tone-laws.js |
| FCS | src/ui/fill-control-surface.js |

**Supporting evidence.** Per-family tables have every constant, line and proposal seed. They are in the same folder:
- `part-A-width-ladder.md`: 13 laws
- `part-B-bundle-cf-pen.md`: 17 laws
- `part-C-mark-wave.md`: 10 laws
- `part-D-mono.md`: 9 laws, plus 11 unrouted functions
- `part-E-mappers-shared.md`: mappers, stroke fill, shadow, ground, existing params, shared tone pipeline

Read them for exhaustive detail. This file is the synthesis and the ranking.

---

## 1. Headline findings

1. **There is no tone curve.**
   - Intensity is raw Lambert: `max(0, n·L)` (RG:84-88).
   - The only user shaping is a stepped posterise: `tone.bands` 1-4, plus the Threshold and Coverage sliders (PR:530-535, PNL:4741-4830).
   - Laws carry private curves that are never exposed:
     - Sterzik A/B 0.4753/1.5918 at SF:5093 (and again at SF:3632).
     - `FC_GAIN` 0.55 at SF:1887.
     - L*-linear `areaForTone` at SF:1821.
     - `coverageGain = 0.5 + cov*1.1` at S3:1883-1886.
     - `TOTAL_DARK_CEIL` 0.47 at RG:714.
   - **No gamma or contrast control exists anywhere** in Object 3D.

2. **There is no seed.**
   - Every variation source is a fixed integer hash or a golden-ratio phase:
     - `hash2` (MP:146)
     - `strokeHash` (geometry3d.js:177)
     - `sfHash` (SF:6007)
     - `ldHash` (S3:2964)
     - the lozenge hash `lineIndex*977+31` (SF:10158)
     - `GOLDEN_STEP` (SF:1304)
   - This follows the "A-17" determinism contract.
   - `params.seed` is normalised (PR:1496) but **never read** and not shown in the UI.
   - A seed that is XOR-folded into these hashes keeps A-17, because output stays deterministic for each seed.

3. **The noise rack is not used.** No scene3d fill path references `Vectura.NoiseRack` (zero hits across S3, MP, SF, MO, SH, RG and the pen-fill code). CLAUDE.md requires noise work to converge on src/core/noise-rack.js. Any jitter, texture or flow-noise proposal below therefore routes through `NoiseRack.createEvaluator({noise, seed})` (noise-rack.js:272), not a new private noise.

4. **Hand wobble already exists, but only partly in the UI.**
   - `lineType`, `dashScale` and `wobble` are applied at the emit chokepoint for every fill (PR:657-661; UI at PNL:4294-4319).
   - `wobbleScale` (1-30, default 6) and `overstroke` work in the engine but **have no UI**.
   - No law has its own irregularity term (part-C, end).
   - Exposing these two keys is cheaper than building law-level wobble.

5. **Controls that are visible but have no effect on some laws** (they break principle 1, "No dead controls", in phase2-requirements-final.md):
   - **Mono laws (9): Density does nothing.** `masterPitch` is passed in but `makeCtx` never reads it (MO:102; part-D).
   - **Fill angle is ignored by 6 of the 9 mono laws.** Only mezzo, duty and endShorten read `C.rot`.
   - **Crosshatch on 6 mono laws redraws identical geometry.** The second pass is `[0, 65]` (MO:2956), but those laws do not read `C.rot`. The result is 2× pen time and double-inking. **This is a defect, not just a missing knob.**
   - **The curved stipple ignores `stippleJitter`** (S3 passes it only on the faceted path, S3:3350; the curved path uses a fixed 7-step dither, SF:12920).
   - **`penCross` ignores `crossAngleDelta` and `crossDensityRatio`.** It uses its own fixed `{deg:60, div:2}` (SF:4176).
   - **`mkDotScreen` ignores `dotSize` and `dotAngle`.** It hard-codes `rMax 0.58·R` (SF:3034).

6. **The engine already supports some params that the UI does not show:**
   - `spiralPitch`, `contourStep` (faceted)
   - `wobbleScale`, `overstroke`
   - `shadowToneDepth`
   - `toneQuantLevels` (contFieldQuant)
   - crease angle (edges.js:22, 28°)
   - The Density UI stops at 220, but the engine clamps at 0-500 (S3:1168, 1205).

7. **Some constants are dormant and must not be exposed.** Their `HL_STAGE` flags are off (SF:388-401):
   - `GLINT_KEEP`, `LIT_FLOOR`
   - `FEATHER_*`, `HYST_RANK`
   - `HL_TH`, `HL_EXP`, `SHADOW_TH`
   - `LIMB_CROSS_*`, `TOTAL_DARK_CEIL` (on the curved path)

   A knob on any of these would do nothing. They belong to the deliberate tone-unwire effort (project memory "Scene3D tone unwire"), so do not re-expose them.

8. **Engine capability already exists but is not exposed:**
   - Wave crest phase `in / anti / jit / walk` is implemented (SF:4585-4596) but reachable only through unexposed sibling laws.
   - The turingStripe anisotropy term is computed and then multiplied by `0.0` (MO:2541, verified). The catalog's claim that "stripes run across the shading" is false today.
   - Pen-fill already accepts a serpentine `opts.axis`, but SF:8440 passes `null`.

---

## 2. Coverage table — every law and type, with the hard-coded artist-relevant constants found

The "Exposed today" column lists only the law-specific inputs. Global inputs reach almost every law: Density, Angle, pen width, the tone bands/thresholds/ladder, and line type/dash/wobble. Exceptions are noted.

### 2a. Tone laws (49)

| Law | Family | Exposed today | Hard-coded artist-relevant constants (file:line = value) |
|---|---|---|---|
| none | ref | — | lineCountFor SF:1423 (`6+0.34d`) |
| ladder (default) | ladder | rungMode, tone sliders | PLOT_FLOOR_PEN SF:244=2.2; LIT_MAX_PITCH_PEN RG:744=12; TONE_SUBDIV SF:235=5. Label "Coarse — 4 rungs" (TL:1023) is wrong: the default is 3 |
| fineLadder | ladder (alias) | via rungMode | FINE_RUNG_COV SF:1718=0.02; rung clamp SF:1723=[8,32] |
| phaseFineLadder | ladder (alias) | via rungMode | NESTED_LEVELS SF:1855=64; INK_SPREAD SF:1800=0.12. The "phase" part is vestigial since W-26 |
| perceptualRamp | ladder (alias) | via rungMode | L*-linear transfer SF:1820-1826; LADDER_PHASE0 SF:1299=0.5 |
| lozengeStipple | ladder | — | LOZ_MM SF:10149=0.9mm; LOZ_GAIN SF:10150=0.35; min flick 0.6 SF:10165; hash 977/31 SF:10158 |
| deepFillTSP | ladder | — | TSP_I SF:1897=0.18; TSP_CORRIDOR SF:10195=0.4; TSP_PERIOD_PITCH SF:10196=1.6; triangle waveform SF:10274 |
| nibAngle | width (alias) | via bandProfile | NIB_DEG SF:3455=45°; NIB_FLOOR SF:3456=0.35; factor clamp SF:3462=[0.2,2.2] |
| taperedEnds | width | bandProfile | TAPER_MM SF:3485=3.5; TAPER_FLOOR SF:3486=0.42; TAPER_SOFT SF:3487=0.09; quintic SF:3497 |
| weightModulated | width | weightEase | max weight = covDark/covLight capped at 6 (SF:1748); W_MIN/W_MAX SF:1992-93=1/6; smootherstep SF:1676 |
| isophoteWidth | width | — | ISO_THRESH SF:3398=0.55; ISO_ALPHA SF:3399=0.4 |
| whiteBand | width (alias) | via bandProfile | WB_CMIN SF:2122=0.15; WB_CMAX SF:2123=0.85; linear transfer SF:5003 |
| weightSmoothstep | width (alias) | via weightEase | W_DITHER SF:1997=0.06; ease7 SF:4963 |
| bundleCount | bundle | bundleMode | ADJ_MAX SF:3240=8; ADJ_DARK_AREA SF:3252=0.93; pass step = 1 ink SF:3248; level bias 0.5 SF:3353 |
| bundleSubNib | bundle | — | ADJ_SUB_MAX SF:3241=13; ADJ_SUB_STEP SF:3247=0.55; ADJ_SUB_DARK_AREA SF:3253=0.97 |
| bundleEased | bundle (alias) | via bundleMode | ADJ_GAP_MIN SF:3283=0.35; smootherstep SF:3297 |
| bundleDither | bundle (alias) | via bundleMode | ADJ_DITHER_AMPL SF:3350=0.4; ADJ_DITHER_MM SF:3351=14mm; golden phase SF:3355 |
| bundleLozenge | bundle | — | inset `k*adjStep` SF:3365 (1 step/pass) |
| bundleHandoff | bundle (alias) | via bundleMode | ADJ_HANDOFF_I SF:3307=0.55 (hard `>=`) |
| contFieldSigmoid | contField | fieldMetric, fieldFloor | CF_STERZIK_A/B SF:5093-94=0.4753/1.5918; open end LIT_MAX_PITCH_PEN |
| contFieldTouch | contField (alias) | via fieldFloor | tight pitch = 1 ink SF:5107 |
| contFieldFore | contField (alias) | via fieldMetric | foreAt floor SF:11414=0.02 (full strength only) |
| contFieldSurface | contField (alias) | via fieldMetric | none of its own (contFieldFore with foreAt=1) |
| contFieldQuant | contField (alias) | toneQuantLevels (**no UI**) | CF_LEVELS_DEFAULT SF:1039=128; linear-in-pitch levels SF:5296 |
| penInterleave | threePen | penMode | PEN_MM SF:3806=[0.26,0.52,0.93]; grid 2.2×medium SF:4219; PEN_DEEP_AREA SF:3888=0.93 |
| penStipple | threePen (alias) | via penMode | PSTIP_PERIOD SF:4068=1/26 ruling (not mm); PSTIP_REF SF:4067=4; PEN_BLEND SF:3903=0.18 |
| penReserve | threePen | — | PRES_PERIOD SF:4081=1/12 ruling; PRES_DUTY_MAX SF:4082=0.6; detail angle 90° SF:4177 |
| penCross | threePen | — (ignores crossAngleDelta) | cross angle 60°, div 2 SF:4176; PEN_MULTI_CEIL SF:4027=0.85 |
| penPitchMatch | threePen (alias) | via penMode | hard switch at penMaxArea SF:3984-3988 |
| penFacing | threePen (alias) | via penMode | facing window nz 0.10 / span 0.75 SF:4243 |
| mkScribble | mark | — | amplitude `0.62R·min(1,0.28+(g-1)/3.4)` SF:7600; floor 0.10R; λ clamp 1.8w-3.4R SF:7601; light break g≤1.02 SF:7593 |
| mkTick | mark | — | tick ⟂ ruling SF:7311; MK_TICK_GAP_PEN SF:2620=0.6; MK_TICK_LEN_ALPHA SF:2656=0.12; CHAIN_RHO SF:2700=0.8; BC_EDGE_PEN SF:2728=2.0. MK_TICK_COMB_* SF:2585-2602 are never read |
| mkDashRamp | mark | — | P0 1.25 SF:2898; MK_DASH_LEN_FRAC SF:2556=0.5; MK_BAND_MAX_PASSES SF:2496=6; band pass spacing = w SF:7277 |
| mkDotScreen | mark | — (ignores dotSize/dotAngle) | rMax 0.58R SF:3034; spiral pitch = w SF:3035; hex lattice, no screen angle SF:2887 |
| ampSpacing | wave | nesting | aFlo/aMax .30/.40 SF:4402; ph 'in'; WV_LAMBDA_PEN SF:4318=7.3; WV6_AMP_MAX/MIN_MM SF:4388-89=0.8/0.34; WV_TAPER_MM SF:4321=2 |
| weaveDepth | wave (alias) | via nesting | aFlo/aMax .14/.46, cFlo 0.8, ph 'anti' SF:4408 |
| interlockWeave | wave | penDown | WV_AMAX SF:4319=0.42; WV_AFLOOR_SHARE SF:4540=0.14; WV_CLEAR_FLOOR SF:4322=1.0 |
| trochoidLoop | wave | — | WV_TROCH_AMAX SF:4323=0.48; WV_TROCH_AFLOOR_SHARE SF:4551=0.04 (cliff at 0.045); circle t-weight 1 SF:4611 |
| amplitudeOnly | wave | — | inline 0.46 SF:4565 (unnamed); WV_AO_PITCH_PEN SF:4325=4; triangle SF:4614 |
| onePenDown | wave (alias) | via penDown | WV_LINK_MAX_MM SF:4326=14. The toggle also flips the phase to in-phase and drops the clearance cap (SF:4602, 9487) |
| etfKang | mono | — (Density, Angle dead) | smoothing iterations MO:813=4; kernel ±2 MO:821; base dir ⟂∇depth MO:781 |
| defectSplit | mono | — (Density, Angle dead) | 4×(+½) defects MO:931-935; shadow-pair spread ±0.16RR MO:933; edge inset 0.99 MO:926 |
| mezzoRegion | mono | Angle | REG = max(3, 0.20R) MO:975; 6 angle slots × 30° MO:987-988 (random per seed, no neighbour guard) |
| originSpiral | mono | — (Density, Angle dead) | origin = brightest point MO:2652; R0 0.5·pitch(0.9) MO:2654; +θ only MO:2663; DUTY_CAP MO:2705=4; WRAP_FLOOR MO:60=0.28 |
| dutyConst | mono | Angle | P 1.05F MO:1446; PERIOD 2.0F MO:1447; DUTY_MIN MO:1465=0.18; golden stagger MO:1471 |
| endShorten | mono | Angle | P 1.15F MO:1514; retract 0.42·span MO:1541; stagger ±1.1P MO:1540 |
| turingStripe | mono | — (Density, Angle dead) | iterations MO:2508=170; wavelength 2×pitch MO:2487; Du 0.18 MO:2520; **anisotropy ×0.0 MO:2541**; init noise ±0.3 MO:2501 |
| voronoiWeb | mono | — (Density, Angle dead) | Lloyd passes 2 MO:1829; relax step 0.45 MO:1818; WEB_K MO:1627; CELL_MAX MO:1613; dart offset hash MO:1669 |
| mazeFill | mono | — (Density, Angle dead) | uniform DFS pick MO:2392; axis-aligned grid MO:2344-2362; cell 1.05× MO:2351 |

Unreachable code outside the roster:
- MO has 11 law functions, all unrouted: crevice, contact, transReserve, jitter, merge, shear, phaseBlue, growth, colonise, fibo, hachure (part-D §Unrouted).
- SF has engine laws that are not in IDS. Examples: `contourFlow`, which `toneFlowMode` feeds and which is therefore dead; `tourScribble`; `penScreen`; `penOctaves`.

These are a library of finished looks (differential growth, space colonisation, hachures) that the roster could expose later. That is outside the brief, so it is only noted here.

### 2b. Types (mappers), stroke-fill styles, shadow, ground

| Type | Exposed today | Hard-coded artist-relevant constants |
|---|---|---|
| none | — | crease angle edges.js:22=28° (no UI) |
| hatch | Angle, Density, Fill Style, Angle ref (face/screen/up), Link fill, Min rulings | hatchSpacing law S3:1205-1213 (linear); coverageGain S3:1883=`0.5+1.1cov`; CURVED_SPARSE_PITCH_BOOST S3:1354=4.1; no light-relative angle frame (S3:2519) |
| crosshatch | + Cross angle, Cross density, Triple hatch | zone 2nd family +65° RG:603 / S3:2381; triple +32° S3:2382 (comment at S3:2379 says 45°); fixed 2 (+1) families; triple gate `w>=1` S3:2424 |
| wireframe | Edges, Show hidden | crease 28°; hidden dash [3,2] geometry3d.js:169 |
| contour | Density, Fill Style, Style | even spacing only (no tone or geometric spacing law) S3:3339; curved ring axis fixed SF:12683; `contourStep` no UI |
| spiral | Angle offset, Eccentricity, Centre, Axis snap, Mode | Archimedean only MP:402; axisSnap = 4 sides fixed MP:400; centre = centroid/bbox only MP:353; `spiralPitch` no UI. On curved shapes the same controls mean different things (SF:12687-12692) |
| stipple | Dot, Dot size, Jitter, Dot angle | square lattice + hash MP:220; fixed hash seeds MP:146; **dot size not tone-modulated** MP:226 (flat stipple carries no tone); curved grid cols=1.6·rows, fixed 7-step dither SF:12900-12920 |
| contourSlice | Slices, Show, Rotate, Tilt, End overlap | uniform plane spacing S3:145; no tone response; CROWD_CULL_K S3:335=0.8 |
| Stroke fill (spiral/concentric/serpentine/contourParallel) | strokeFillStyle | RIBBON_OVERLAP SF:7946=0.15; serpentine axis auto SF:8440 (PF supports `axis`); PASS_TAPER_MM SF:8753=2; BRIDGE_LIMIT_PITCHES PF:68=6 |
| Shadow hatch | shadowAngle/Density/layerCount/falloff/Fill Style | CROSS_B/C SH:1418-19=65/32°; SATURATION/COLLAR_CEIL SH:1742-45=0.78/0.80; WAVE_WAVELEN_MM SH:914=7; DASH_PERIOD_MULT/DUTY SH:910-11; `shadowToneDepth` no UI |
| Ground | all mapper controls (same cascade) | span 0.75×bounds scene.js:312; square quad, no vignette or fade scene.js:314 |

---

## 3. What the 2D paint bucket offers that Object 3D does not

Source: `FCS` src/ui/fill-control-surface.js:88-139.

| 2D control | 3D equivalent | Gap |
|---|---|---|
| `fillShiftX/Y` (phase) | none | No pattern phase or offset on any 3D law. LADDER_PHASE0 and the golden phases are fixed. |
| `fillPadding` | `sliceEndOverlap` (slices only) | No inset from the silhouette for hatch or laws (mkTick has a private BC_EDGE_PEN of 2). |
| `fillContourStepVariance` | none | No spacing variance or "irregular rulings" control. |
| `fillTruchetSeed`, `fillMazeSeed` | none | **No seed anywhere** (§1.2). |
| `fillMazeAlgorithm` / `fillMazeBranchBias` | mazeFill: uniform DFS only | No straightness or branch bias, no algorithm choice. |
| `fillSpiralDirection` (cw/ccw), `fillSpiralTightness` | originSpiral: +θ only; spiral mapper: no direction | No wind direction. |
| `fillWaveFrequency`, `fillAmplitude`, `fillWaveSmoothing` | wave laws: fixed WV_LAMBDA_PEN, amplitude shares | No wavelength or amplitude control. |
| `fillDotPattern` (brick/grid/hex…) | stipple: square only; mkDotScreen: hex only | No lattice choice. |
| `fillPolyRotationStep`, `fillDotRotation` | dotAngle (stipple only) | No per-mark rotation progression. |
| `fillStripe*` (two-fill composite with bands) | none | No compound "fill A in light, fill B in dark" on 3D. The highlight `altFill` treatment is the only precedent, and it is dormant in HL_STAGE. |
| `fillWeaveOver/Under` | interlockWeave | No over/under count. |

Prior art in other algorithms: the noise rack has `hatch-dark` and `hatch-light` blend modes (noise-rack.js `combineBlend`). These are a ready-made "tone-weighted noise" primitive for a tone-texture overlay (P-08 below).

---

## 4. Ranked proposals

**Rule for every proposal: the default must reproduce today's output exactly.**
- Use the existing **absent-key sentinel** pattern: `seed:false` descriptors in MAPPER_CONTROLS (PNL:373-376). When the key is absent, the hard-coded constant applies.
- Where a key is already seeded with a different default (`crossAngleDelta` = 90, `stippleJitter` = 40), a new reader must use a separate key or an "inherit" sentinel. **Never** reinterpret the seeded value.

**Effort scale.**
- **S**: one constant becomes a clamped param. Touches PR + one engine site + one UI descriptor.
- **M**: several sites or a new engine primitive.
- **L**: a new subsystem.

**Plot cost.** Δ in pen-downs, ink length and time.

**Structural note for every per-law knob.** Law sub-controls today are `STYLE_PARAMS` descriptors, and they are **enum-only** (TL:1014+). Adding a numeric `kind:'slider'` descriptor type to STYLE_PARAMS gets several things for free:
- `persistentStyleKeys` (PNL ~480) carries the key across mapper detours with zero panel edits.
- The lawpick renders it under the law.

This is a one-time **M** that makes every per-law **S** below truly S. Build it first.

### Tier 1 — highest payoff ÷ effort

| # | Proposal | Range / default (= today) | Styles | Artistic payoff | Effort | Plot cost |
|---|---|---|---|---|---|---|
| **P-01** | **Expose the engine params that already work.** `wobbleScale` (1-30, 6), `overstroke` (bool, false), `spiralPitch` / `contourStep` (absent ⇒ density), `shadowToneDepth` (0-1, 0.75), crease angle (5-90°, 28), `toneQuantLevels` (4-256, 128) under contFieldQuant; Density slider max 220 → 500 | as listed | all fills / spiral / contour / shadow / wireframe / contFieldQuant | Hand-drawn character (wobble scale + overstroke), exact mm spacing, terraced woodcut tone (quant 4-8), crease control on wireframe. No engine work | **S** (UI only) | overstroke ≈ 2× ink on fill lines; Density 500 = many more rulings |
| **P-02** | **Seed.** One integer `fillSeed` XOR-folded into `hash2` (MP:146), `C.hash` (MO), `sfHash` (SF:6007), `ldHash` (S3:2964), `strokeHash` (geometry3d.js:177), lozenge 977/31 (SF:10158), and as a golden-phase offset `GOLDEN_STEP·seed` | int 0-999, **0** | stipple, wobble, lozengeStipple, mezzo, maze, turing, voronoi, bundleDither, mark/wave phase, ladder dither | Reroll an unlucky pattern (a moiré, a stray mark at the focal point) without changing tone. Parity with 2D (`fillTruchetSeed`, `fillMazeSeed`). Keeps A-17 | **S-M** (6 hash sites) | none |
| **P-03** | **Global tone curve**: `toneGamma` (0.4-2.5, **1**), `toneContrast` (-1…1, **0**, S-curve about `tonePivot` 0.5), optional `toneInvert` (false). Applied once to `I` at the sample chokepoint before any law or mapper. Identity is short-circuited when all values are at default, so output is byte-identical | as listed | all 49 laws + toned mappers + shadow | The missing "nail the lighting" control. Pushes midtones without moving the endpoints, gives a dramatic chiaroscuro or a flat graphic read, and lets one light setup serve many looks. It replaces several law-private curves for the user (Sterzik, FC_GAIN, L*) without touching them | **M** (find the single chokepoint: RG `intensity` + SF `smp.I` + MO `s.I`) | γ>1 or more contrast = more ink in the darks |
| **P-04** | **Wire existing keys into the laws that ignore them.** (a) penCross ← new `penCrossAngle` (15-90, absent ⇒ 60) + `penCrossDiv` (1-4, absent ⇒ 2). Do not reuse `crossAngleDelta`, which defaults to 90. (b) mkDotScreen ← `dotAngle` as the screen angle (absent ⇒ 0) and `dotSize` as the max-dot share (absent ⇒ 0.58R). (c) Curved stipple ← a jitter key that is **absent-sentinel only** (`stippleJitter` is seeded to 40). (d) Mono crosshatch: on the 6 direction-free laws, skip the duplicate second pass (a **defect fix**: output changes, because duplicate ink is removed) or rotate the field/grid by 65° | as listed | penCross, mkDotScreen, stipple, 6 mono laws | Controls the user already sees start working. 45° halftone screens. Penned cross angle | **S** each; (d) **S** + a baseline change | (d) **halves** pen time on those 6 laws |
| **P-05** | **Wave wavelength + crest phase.** `waveLength` (4-20 pens, **7.3**) for all 6 wave laws (WV_LAMBDA_PEN SF:4318); `wavePhase` in/anti/jitter/walk (**per-law current**) on ampSpacing and interlockWeave. The engine already implements all four phases at SF:4585-4596 | as listed | ampSpacing, weaveDepth, interlockWeave, trochoidLoop, amplitudeOnly, onePenDown | Tight ripple vs lazy swell. Nest vs weave vs organic. With loop size (P-12) it gives telephone-cord vs Spirograph coils | **S** (+ raise `steps` SF:9255 when λ is small) | shorter λ = more vertices, same pen-downs |
| **P-06** | **Calligraphic nib**: `nibAngle` (0-180°, **45**, NIB_DEG SF:3455), `nibContrast` (0-0.9, **0.65** = 1-NIB_FLOOR SF:3456) | as listed | nibAngle (and taperedEnds via bandProfile) | The defining calligraphy parameter: italic 30°, foundational 45°, left-hand practice | **S** | **zero** (same geometry, width only) |
| **P-07** | **Taper**: `taperLength` (0-15mm, **3.5**, SF:3485), `tipWidth` (0-1, **0.42**, SF:3486), `highlightSoftness` (0-0.25, **0.09**, SF:3487). taper=0 is exactly whiteBand | as listed | taperedEnds, whiteBand, nibAngle | Brush stroke vs engraving swell vs hard bar. Could replace the hard/taper enum with a continuous slider | **S** | zero / slightly less ink |
| **P-08** | **turingStripe `stripeAlign`** (0-1, **0**). Re-enables the dead `0.9*along*0.0` term (MO:2541). Also `patternMaturity` (40-400, **170**, MO:2508) and `stripeScale` (0.5-3, **1**) | as listed | turingStripe | Stripes that comb across the form like a fingerprint wrapped on the body. Without alignment the law is random labyrinth. The catalog already promises this look | **S** | CPU only; scale↓ = more ink |

### Tier 2 — strong payoff, moderate effort

| # | Proposal | Range / default | Styles | Payoff | Effort | Plot cost |
|---|---|---|---|---|---|---|
| **P-09** | **Light-relative hatch angle**: `angleRef: 'light'` (a new option on the existing seg; default stays 'face'). The angle is measured from the projected light bearing. The shadow already does this (`shadowAngleFollowsLight`) | enum, default face | hatch, crosshatch, all ruling laws | The classic engraving convention: hatch turns with the light. Moving the light re-orients the whole drawing coherently | **M** (S3:2519 + curved family angle SF:12376) | none |
| **P-10** | **Tone-range endpoints (cross-family)**: `highlightOpenness` = LIT_MAX_PITCH_PEN (RG:744, 4-20, **12**), and `darkestSpacing` = per-style PLOT_FLOOR_PEN override (1.2-4 pens, **2.2**; plumbing exists at `opts.masterFloorPen` SF:5919). A floor below about 1.5 needs a warning | as listed | ladder family, contField, pen, mono (PMAX), weightModulated | Airy engraving vs dense mezzotint. Bare paper vs inked highlights. R:270-283 notes the result is bit-identical from 12 down to 6 on fixtures, so the useful range is above 12 | **M** (O6 contract: per-layer override only) | floor↓ = many more rulings, flood risk |
| **P-11** | **Mono Density + angle wiring**: make `makeCtx` honour `masterPitch` as a pitch multiplier (absent ⇒ ×1), and a `fieldRotation` for etf/defect/maze/originSpiral (absent ⇒ 0). Do **not** reuse `fillAngle` (default 45), or output changes | as listed | 9 mono laws | Removes 2 dead controls on 9 laws (principle 1, phase2-final). Maze or flow at any angle. Coarse vs fine mono texture | **M** | Density↑ = more ink |
| **P-12** | **Trochoid loop size + aspect**: `loopSize` (0.3-0.6, **0.48**, SF:4323), `loopAspect` (0.5-1.5, **1**, t-weight SF:4611; the elongation model SF:4669 must match) | as listed | trochoidLoop | Spring, cursive or chain-mail looks | **S-M** | tight loops → much more ink (√(1+q²)) |
| **P-13** | **voronoiWeb `webRelax`** (0-8 passes, **2**) + `cellRange` (0.5-2×, **1**); **mezzoRegion `regionSize`** (0.05-0.6R, **0.20**) + `angleSlots`/`angleStep` (2-12 / 10-90°, **6/30°**); **mazeFill `straightness`** (0-1, **0**) + `cellScale` (1-3, **1.05**) | as listed | voronoiWeb, mezzoRegion, mazeFill | Crackle glaze ↔ honeycomb. Mezzotint shimmer ↔ patchwork parquet. Caves ↔ galleries. Parity with 2D maze branch bias | **S** each | mezzo regions↓ = more lifts; maze straighter = fewer breaks |
| **P-14** | **deepFillTSP shadow controls**: `deepThreshold` (0-0.5, **0.18**, SF:1897), `zigWavelength` (0.8-4, **1.6**, SF:10196), `fillDepth` (0-**0.4**, SF:10195), **capped at today's 0.4** | as listed | deepFillTSP | Scribble-shadow reaching into the mid-darks; lazy vs crackle zig | **S** | more ink, **no** extra lifts |
| **P-15** | **Bundle depth**: `bundleMaxPasses` (2-16, **8**, SF:3240), `bundleDarkGap` (0.02-0.3, **0.07**), `ditherScale` (2-40mm, **14**, SF:3351; the catalog itself suggests the untried short wavelength), `handoffLevel` (0.2-0.9, **0.55**, SF:3307) | as listed | 6 bundle laws | Open engraving vs near-solid. Clean single-line hatch with bundles only in core shadow | **S** | passes = linear plot time in the darks |
| **P-16** | **Three-pen widths from layer pens**: `penWidths` = "use pens 1/2/3" or explicit mm (**0.26/0.52/0.93**, SF:3806) | as listed | 6 pen laws | The tone math matches the nibs actually loaded. Today the widths are fiction, and the output only carries `meta.penTier` | **M** | none (pen changes stay at 2-3) |
| **P-17** | **Mark-language knobs**: mkScribble `scribbleAmplitude` (0.3-0.62R, **0.62**) + `scribbleCorners` (zigzag/rounded); mkDashRamp `dashGapRatio` (0.2-0.9, **0.5**) + `bandPasses` (1-6, **6**) + `rowStagger` (golden/brick/aligned); mkDotScreen `dotFill` spiral/ring (**spiral**) | as listed | mkScribble, mkDashRamp, mkDotScreen | Calm wave vs wild scrawl. Morse grid. Engraved ring-dots | **S-M** | short dashes = more lifts |
| **P-18** | **Stroke-fill**: `serpentineAxis` (auto/0-180°, **auto**; PF already accepts `opts.axis`), `ribbonOverlap` (0-0.6, **0.15**, SF:7946) | as listed | 12 ribbon laws | Directional "brushed" fill inside width laws. Denser or striated ribbons | **S** | overlap↑ = more passes |

### Tier 3 — valuable, larger or riskier

| # | Proposal | Default | Styles | Payoff | Effort | Plot cost / risk |
|---|---|---|---|---|---|---|
| **P-19** | **Noise-rack tone texture**: an optional `toneNoise` stack (default **empty** ⇒ identical) evaluated through `NoiseRack.createEvaluator({noise, seed})` and added to `I` before P-03's curve. The rack's `hatch-dark`/`hatch-light` blends are reusable as is | empty | all laws | Mottled, weathered or atmospheric tone (aquatint grain) that the light alone cannot give. Satisfies the CLAUDE.md noise-convergence rule | **L** (rack UI embed + determinism) | ink varies |
| **P-20** | **Noise-rack angle flow**: the same stack drives a per-sample angle offset for hatch and ruling laws (default empty) | empty | hatch/crosshatch + ruling laws | Hand-sketched, flowing hatch; wood-grain | **L** (ruling walk must tolerate curved families) | risk: crossings and moiré; guard with the plot floor |
| **P-21** | **Stipple tone modulation + lattice**: `stippleToneMode` none/size/count (**none**), `stippleLattice` square/hex/poisson (**square**) | none / square | stipple mapper | Flat stipple carries **no tone today** (MP:226). This makes stipple a shading tool. Parity with 2D `fillDotPattern` | **M-L** | count mode = many lifts |
| **P-22** | **Spiral variants**: `spiralLaw` archimedean/log/fermat (**archimedean**), `spiralSides` N-gon (absent ⇒ 4 when axisSnap), `spiralDirection` cw/ccw, free centre offset; originSpiral `originOffset` + `windDirection` + `wrapStrength` (WRAP_FLOOR MO:60) | as listed | spiral mapper, originSpiral | Vortex, shell or polygon spirals; an eccentric focal orbit. Parity with 2D | **M** | — |
| **P-23** | **Contour / slice spacing law**: `spacingLaw` even/tone/geometric (**even**) + `spacingRatio` for contour and contourSlice | even | contour, contourSlice | Topographic emphasis; slices that densify in shadow (today slices ignore light entirely) | **M-L** | tone mode = more rings in the darks |
| **P-24** | **Crosshatch family count / angles**: `crossFamilies` 2-4 (**2**), expose triple angle (**32°**, S3:2382; fix the "45°" comment at S3:2379) | 2 / 32 | crosshatch | 4-way engraved cross-hatching | **M** | each family = linear ink |
| **P-25** | **Silhouette inset/padding** (parity with 2D `fillPadding`): `fillInset` (pens, **0**) for hatch and laws | 0 | all ruling fills | A clean white halo inside the outline (a common illustration choice) | **M** (interacts with T2-8, which Jay parked) | less ink |
| **P-26** | **Etf/defect flow**: `flowSmoothing` (1-16, **4**, MO:813), `flowTwist` (-90…90°, **0**), `defectRotation` (0-360, **0**), `shadowPairSpread` (0-0.5, **0.16**) | as listed | etfKang, defectSplit | Calm engraved sweeps vs body-hugging. Placed whorls | **S-M** | CPU; note F-18 etfKang singularities are still open (STILL-OPEN.md:3) |
| **P-27** | **Ground vignette**: `groundExtent` (×bounds, **0.75**, scene.js:312) + `groundFade` (0-1, **0**) | 0.75 / 0 | ground | A ground that dissolves into the paper instead of a hard square edge | **M** | less ink |

### Lower-priority single-law knobs (from the part files; S each, narrower audience)

- isophoteWidth `isoLevel` 0.1-0.9 (0.55) and `swell` 0.1-1.5 (0.4).
- weightSmoothstep `weightJitter` 0-0.3 (0.06), which reads as uneven pen pressure.
- weightModulated explicit `maxWeight` (absent ⇒ derived).
- whiteBand `shadowWhite` 0.05-0.4 (0.15).
- fineLadder / phaseFineLadder `rungs` / `toneLevels` (auto / 64).
- perceptualRamp `patternPhase` (LADDER_PHASE0 0.5), which is the 3D equivalent of 2D `fillShift`.
- lozengeStipple `flickLength` 0.3-3mm (0.9) and `stippleAmount` 0-1 (0.35). This one costs **one lift per flick**.
- contFieldSigmoid `fieldContrast` / `fieldMidtone` (1.5918 / 0.4753). Largely subsumed by P-03.
- contFieldFore `foreStrength` 0-1 (1); at 0 it equals contFieldSurface.
- contFieldTouch `touchTightness` 0.8-2.2 (1.0).
- penStipple / penReserve periods. **Prerequisite:** convert from per-ruling fractions to mm (SF:4068/4081). That conversion changes output unless the default reproduces the per-ruling value.
- penFacing `facingLimbWidth` / `facingBlend` / `facingInvert`.
- mkTick `tickAngle` (riskiest: the extent solver assumes ⟂ ticks), `rimTaper` (0.8) and `outlineMargin` (2 pens).
- onePenDown `maxBridge` 0-30mm (14).
- dutyConst `dutyRange` [0.18,1] and `dashPeriod` (2F).
- endShorten `retract` (0.42) and `endStagger` (2.2P).
- Shadow `collarCeiling` (0.80), shadow wave wavelength (7mm), and cross angles 65/32.

---

## 5. Guardrails from prior work (cite, don't re-litigate)

- **Do not expose dormant `HL_STAGE` constants** (§1.7). They are the deliberate tone-unwire (SF:388).
- **deepFillTSP `fillDepth` must not exceed 0.4.** W-07b bought ink with amplitude and was **REJECTED** as a self-crossing scribble (4-6× crossings). W-07b-2's corridor bound was the accepted fix (fill-audit-handoff.md:233).
- **mkTick length-vs-spacing is a known reject zone.** T2 and T2-1/T2-2 smoothstep length-tone was REJECTED and REVERTED (STILL-OPEN.md:382; fill-audit-handoff.md:400). T2-7's spacing-tone tick field is what Jay accepted. So `MK_TICK_LEN_ALPHA` should be capped near 0.12, or shipped "advanced, unsupported".
- **Trochoid light floor has a measured cliff at 0.045** (deep-blank oracle). Do not expose it above 0.04.
- **Wave amplitude changes make these laws lighter, not bolder.** F1-amp, decision 10 (STILL-OPEN.md:526). Expect ink to drop, not rise, when amplitude knobs move.
- **T2-8, filling the dark non-highlight wedges, is PARKED by Jay** (fill-audit-handoff.md (c)). P-25 (inset) and P-10 (darkest spacing) both touch silhouette-edge ink, so sequence them after T2-8's ruling.
- **W-15c (N=9 vs N=3) and T2-8b-4 (master-tick policy) are pending owner calls.** P-10 overlaps with master-grid policy, so wait for T2-8b-4.
- **Principle "No dead controls" plus the R-CONSIST `showIf` idiom** (phase2-requirements-final.md). Every new law knob must be `showIf`-gated to the law that reads it. The mono Density and Angle findings (§1.5) violate this today.
- **A-17 determinism** (S3:14). The seed (P-02) and noise-rack (P-19/20) proposals keep it, because output is deterministic for each seed.
- **Reachability.** The roster collapse (U0-U9, W-22-24) folds laws into survivors with enum sub-controls. New numeric knobs on a folded law must be keyed on the survivor's `STYLE_PARAMS`, or `effectiveLaw` reconstruction (W-10d-3) will drop them on round-trip.

---

## 6. Defects found along the way (not knobs; flag to the fill-audit queue)

1. **Mono crosshatch double-inks** on etfKang, defectSplit, originSpiral, voronoiWeb, mazeFill and turingStripe (MO:2956). The second pass draws identical geometry: 2× pen time and paper wear.
2. **Density does nothing on all 9 mono laws** (`makeCtx` MO:102 ignores `masterPitch`). Fill angle does nothing on 6 of them.
3. **turingStripe anisotropy is multiplied by `0.0`** (MO:2541). The catalog text overstates the law.
4. **Curved stipple ignores `stippleJitter`** (S3:3350 is faceted only; SF:12920).
5. **`toneFlowMode` is dead.** Its only reader is `contourFlow`, which is not in IDS. `toneQuantLevels` has no UI.
6. **The "Coarse — 4 rungs" label** (TL:1023) is wrong: the default is 3.
7. **onePenDown's "pen-down" toggle also changes the waveform** (in-phase, no clearance cap; SF:4602, 9487). The control's label understates what it does.
8. **"Nesting: Nested rows"** (TL:1176) actually means anti-phase plus clearance-solved amplitude.
9. **Dead constants**: `MK_TICK_COMB_*` (SF:2585-2602) and `MK.mkTick.L0/LMIN/P0`. There is also an unnamed inline 0.46 in amplitudeOnly (SF:4565).
10. **The triple-hatch comment says +45°; the code uses +32°** (S3:2379 vs S3:2382).
11. **Spiral controls change meaning between the flat and curved paths** (SF:12687-12692). Eccentricity becomes sweep γ, and Bounds becomes a double helix.
12. **Density UI max 220 vs engine 500** (S3:1168).

---

## 7. Suggested sequencing

1. **P-01** (UI-only wins) and the defects in §6 #1-#6.
2. **The STYLE_PARAMS numeric-descriptor type**, which unblocks every per-law S.
3. **P-02 seed** and **P-03 tone curve**, the two cross-cutting multipliers.
4. **P-04 – P-08** (cheap, high-delight per-law knobs).
5. **Tier 2** in order.
6. **Tier 3**, after T2-8 and T2-8b-4 owner rulings land.
