# R1 — Fill Style / Type consolidation audit (lens a: CONSOLIDATION)

Repo `main` @ `e609338c`. Roster `scene3d-tone-laws.js` VERSION `168ec57b`. Read-only audit. No pictures were rendered for this report. Every claim comes from the code, and the file:line cites the evidence. The ink/path numbers come from `docs/3d-audit/lane-reports/W-22-24-W-18-plan.md` §1. Where I have no measurement, I say "unmeasured".

## 0. What is already decided. Do not re-propose these.

- **U1–U8 (W-22/23/24/W-18) shipped.** 18 ids are folded into 8 survivors through `ALIASES` + `STYLE_PARAMS` (`src/config/scene3d-tone-laws.js`, dumped at runtime). The picker shows 30 `PICKER_IDS` plus the default `ladder`, so 31 rows. The engine still accepts all 48 `IDS`, through the resolver `Params.resolveToneLaw`.
- **C-09…C-13 shipped (W-03).** 44 ids are hidden on curved+spiral/stipple (`CURVED_SPIRAL_STIPPLE_INERT`, `context-bar.js:551`).
- **Rejected or deferred folds:**
  - `trochoidLoop` is not folded into `interlockWeave`. Reason: a distinct picture, with 12% more ink.
  - `lozengeStipple` is not folded into `ladder`. Reason: the mark-class contract.
  - `isophoteWidth` stays its own row. Reason: "genuinely different".
  - `penCross` and `penReserve` stay. Reason: crossed marks.
  - Plan §8 lists these as Phase-3 *removal* candidates that need Jay's decision: `lozengeStipple`, `deepFillTSP`, `amplitudeOnly`, `trochoidLoop`, `bundleSubNib`, `mkTick`/`mkDashRamp`, `isophoteWidth`.
- **Standing invariants that limit any new fold:**
  - **§2.4:** the mark class must be constant across a collapse cluster. `markClass(alias) === markClass(alias.into)`. This matters because shadows dispatch by class.
  - **The resolver can select only ONE non-default descriptor at a time.** `effectiveLaw` (`context-bar.js` ~:310) returns the bare survivor when two or more descriptors are non-default. So any fold that needs two *orthogonal* params (for example step × end-taper) cannot be represented by aliases alone. It needs a Phase-2 engine change, in which the engine reads params instead of `TONE_ALGO ===` predicates.
  - **The shadow path keeps its own per-id recipes** (`shadows.js:1108-1290`). Every new alias must be resolved there too. This is the U9 trap.
- **Presets:** no file in `user-presets/**` and no entry in `src/config/user-presets.js` sets `toneLaw` or `shadowToneLaw`. Only `mapper: hatch|wireframe` appears (`user-presets/scene3d/*.vectura`, `sceneGround3d`). So the migration risk for folds is limited to user `.vectura` docs. The existing `ALIASES` shim already covers those docs losslessly.

My lens is *same generator, different constant*. That is broader than the U1–U8 test, which was *near-duplicate picture*. A param value is allowed to produce a different picture, the same way a pentagon is not a square. So some of the candidates below re-open rows that the plan kept separate for picture reasons. I mark each of those explicitly.

---

## 1. Coverage table — EVERY law (48 roster ids + shipped default `ladder` = 49)

**Engine family (by code):**
- **EC** = continuous even-placement chart family. `emitContFamily` `surface-fill.js:11366`. Routed by `contMapper` `:12598`.
- **DR** = discrete rung selection (old ladder verdict). `algoCoverage` `:5455-5464`.
- **RB** = whiteBand ribbon-width chassis. `wbFlatCov` + `splitsAlongLine` `:2062-2070`, `:3181-3185`. Width from `weightAtSample` `:4975`.
- **RW** = per-run weight. `flatCov` + `run.weightScale` `:8982-8983`.
- **AD** = adjacent-pass bundle. `ADJ_LAWS` `:3215`.
- **3P** = three-pen planner. `PEN_LAWS`/`penPlan` `:4164-4265`.
- **WV5/WV6** = wave chassis, rounds 5 and 6. `WV_LAWS` `:4423`, `WV6` `:4390`.
- **MK** = mark emitter. `MK` table `:2886`.
- **MS** = mono streamline chassis. `streamFamily` mono `:551`.
- **MR** = mono screen-straight ruling. `lawDuty` `:1440` and `lawEndShorten` `:1508` both rule `ang=(C.rot+90)` straight screen lines at a fixed multiple of `FLOOR`.
- **MU** = mono unique generator.

"Status" uses this notation:
- **S** = picker survivor.
- **F→x** = folded into x (param=value).
- **D** = shipped default.

| # | id | class | status | engine | mark primitive | tone → mark | spacing law | orientation | reads from shading | proposed cluster (§2) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `ladder` | hatch | D | EC | continuous ruling | spacing only | `masterPitch / ladderCov(I)` 4 rungs (`:5205`) | Angle / chart axis | I | **EVEN** (M5) |
| 2 | `none` | ref | S | EC off (masterGrid false) | ruling | none | density grid | Angle | — | keep |
| 3 | `fineLadder` | hatch | F→ladder rungMode=fine | EC | ruling | spacing | `fineLadderCov` (~64 rungs) | Angle | I | EVEN |
| 4 | `phaseFineLadder` | hatch | F→ladder rungMode=finePhase | EC | ruling | spacing | `nestedCov` (vdC prefix) | Angle | I | EVEN |
| 5 | `perceptualRamp` | hatch | F→ladder rungMode=perceptual | **DR** (not `isEvenLadder`, `:5147`) | ruling, rungs dropped | coverage (draw/skip) | `perceptualCov` (Murray-Davies→L*) | Angle | I, local pitch | EVEN† (S2) |
| 6 | `lozengeStipple` | dot | S | DR + flicks on dropped spans (`:10152`) | ruling + 0.9 mm flicks | coverage + flick count | `perceptualCov` (`:5462`) — identical to #5 | Angle | I | **LADDER-ADDON** (M6) |
| 7 | `deepFillTSP` | web | S (library) | EC (`isEvenLadder` `:5148`) + `tspVerts` (`:10765`) | ruling + boustrophedon in deep 15% | spacing + infill | same as `ladder` | Angle | I | **LADDER-ADDON** (M6) |
| 8 | `contFieldSigmoid` | hatch | S | EC (`CONT_LAWS` `:5078`) | ruling | spacing | `cfWantedPitch` Sterzik sigmoid, floor..open (`:5128`) — density-inert | Angle | I | **EVEN** (M5) |
| 9 | `contFieldTouch` | hatch | F→contFieldSigmoid fieldFloor=touch | EC | ruling | spacing | **L\*-linear** branch (`:5129-5130`), floor = ink width (`:5107`) | Angle | I | EVEN (S1) |
| 10 | `contFieldFore` | hatch | F→… fieldMetric=foreshortened | EC | ruling | spacing | L\*-linear, gap ÷ proj(t×n) (`:11486`) | Angle | I, normal | EVEN (S1) |
| 11 | `contFieldSurface` | hatch | F→… fieldMetric=surface | EC | ruling | spacing | L\*-linear, integrated in surface arc length (`:11475`) | Angle | I | EVEN (S1) |
| 12 | `contFieldQuant` | hatch | F→… fieldMetric=quantised | EC | ruling | spacing | L\*-linear, `cfQuantise` CF_LEVELS (`:11616`) | Angle | I | EVEN (S1, S5) |
| 13 | `whiteBand` | hatch | F→taperedEnds bandProfile=hard | RB | ribbon (outline+PenFill) | width `1-c` clamped (`:5002`) | `wbFlatCov` even | Angle | I | **RIBBON** (M3) |
| 14 | `nibAngle` | hatch | F→taperedEnds bandProfile=nib | RB | ribbon | width `(1-c)·nibFactor(θ)` (`:5013`) | `wbFlatCov` | Angle, θ of stroke | I, stroke dir | RIBBON |
| 15 | `taperedEnds` | hatch | S | RB | ribbon | width `taperArea(I,endMM)` (`:5018`) | `wbFlatCov` | Angle | I, run end distance | RIBBON |
| 16 | `isophoteWidth` | hatch | S | RB | ribbon | width `isoWidthArea(I,|∇I|)` (`:5065`) | `wbFlatCov` | Angle | I, ∇I | **RIBBON** (M3) |
| 17 | `weightModulated` | hatch | S | RW | constant-weight run | per-run mean weight (`:8982`) | `flatCov` sparse-end pitch | Angle | I | RIBBON-adjacent (M3b) |
| 18 | `weightSmoothstep` | hatch | F→weightModulated weightEase=smooth | RW | run | `ease7` + golden dither (`:4981`) | `flatCov` | Angle | I | RW |
| 19 | `bundleCount` | hatch | S | AD | N abutting passes | pass count (`adjAskN`) | stride × masterPitch | Angle | I, local pitch | **BUNDLE** |
| 20 | `bundleSubNib` | hatch | S (library) | AD | passes at 0.55 nib, max 13 | pass count | same; `ADJ_SUB_*` consts (`:3241-3254`) | Angle | I | **BUNDLE** (M1) |
| 21 | `bundleEased` | hatch | F→bundleCount mode=eased | AD | passes | gap eased (`:3294`) | same | Angle | I | BUNDLE |
| 22 | `bundleDither` | hatch | F→… mode=dither | AD | passes | threshold wave (`:3352`) | same | Angle | I | BUNDLE |
| 23 | `bundleLozenge` | hatch | S | AD | passes, pass k inset k·step (`:3365`) | pass count | same | Angle | I | **BUNDLE** (M1) |
| 24 | `bundleHandoff` | hatch | F→… mode=handoff | AD | passes | cap above I≥0.55 (`:3320`) | same | Angle | I | BUNDLE |
| 25 | `penInterleave` | hatch | S (library) | 3P | 3 nib tiers on one grid | tier mix (`:4217`) | medium-nib floor | Angle | I | **PEN** |
| 26 | `penStipple` | hatch | F→penInterleave mode=stipple | 3P | tiers + fine-nib duty | tier + duty (`:4232`, `:9658`) | `penCovU` | Angle | I | PEN |
| 27 | `penPitchMatch` | hatch | F→… mode=pitchMatch | 3P | tiers | smallest nib that fits (`:4252`) | `penCov` | Angle | I | PEN |
| 28 | `penFacing` | hatch | F→… mode=facing | 3P | tiers | tier from nz (`:4238`) | `penCovU` | Angle | I, nz | PEN |
| 29 | `penCross` | cross | S (library) | 3P + `PEN_FAMILIES` {60°, div 2} (`:4173-4177`) | 2 families, tiers 1/2 | share area | `penCov` | Angle + 60° | I | PEN (M7, keep) |
| 30 | `penReserve` | cross | S (library) | 3P + {90°, div 1} + duty gate | broad ground + transverse fine | duty reserves | `penCovU` | Angle + 90° | I | PEN (M7, keep) |
| 31 | `ampSpacing` | wave | S | WV6 row {in-phase, ramp, aFlo .30/aMax .40} (`:4401`) | serpentine | spacing field, pen past floor | `wvFlatCov` | Angle | I | **WAVE** (M4) |
| 32 | `weaveDepth` | wave | F→ampSpacing nesting=nested | WV6 row {**anti**-phase, perp, aFlo .14/.46, cFlo .8, dep **0**} (`:4407`) | serpentine | spacing | same | Angle | I | WAVE (S4: mislabeled) |
| 33 | `interlockWeave` | wave | S | WV5 anti-phase, clearance cap (`:4599`, `:9487`) | serpentine | spacing + amp cap | `wvFlatCov` | Angle | I | **WAVE** (M4) |
| 34 | `onePenDown` | wave | F→interlockWeave penDown=continuous | WV5 **in-phase** (not in `anti` set, `:9524`), no cap, chained (`:9455`) | one bridged serpentine | spacing | same | Angle | I | WAVE (S4) |
| 35 | `trochoidLoop` | wave | S | WV5, `wvForm` trochoid (`:4611`), aFlo .04/.48 | looping trochoid | spacing | same | Angle | I | **WAVE** (M4) |
| 36 | `amplitudeOnly` | wave | S (library) | WV5, triangle form (`:4612`), pitch 4 pens (`:4325`) | triangle wave | amplitude (arc length) | fixed tight | Angle | I | WAVE (M4) / ~mkScribble |
| 37 | `mkScribble` | wave | S | MK {scribble, amp, row, along} (`:2946`) | triangle polyline/row | amplitude + wavelength | MK row scaffold | along ruling | I | MARK (keep) |
| 38 | `mkTick` | dash | S | MK {tick, len, brick} + own solve (`:2940`, `:6878`) | perpendicular tick | length | brick lattice | ⟂ ruling | I | MARK (keep) |
| 39 | `mkDashRamp` | dash | S | MK {morph, elong, row, rowFloor} (`:2898`) | dot→dash→rule→band | elongation, fixed period | row | along | I | MARK / ~dutyConst (M8) |
| 40 | `mkDotScreen` | dot | S | MK {disc, size, hex} (`:2887`) | spiral disc | dot size | hex | none | I | MARK / ~Stipple Type (M9b) |
| 41 | `etfKang` | flow | S | MS `streamFamily(C, dirAt, pitchFor)` (`mono:851`) | streamline | spacing | `pitchFor(I)` | Kang-smoothed ⟂∇depth | I, depth | **FLOW** (M2) |
| 42 | `defectSplit` | flow | S | MS, identical call (`mono:955`) | streamline | spacing | `pitchFor(I)` | Σk·arg(p−dᵢ) field | I | **FLOW** (M2) |
| 43 | `mezzoRegion` | cross | S | MS, identical call (`mono:999`) | streamline | spacing | `pitchFor(I)` | per blue-noise region, 6 angles 30° apart (`mono:973-999`) | I | FLOW (M2, class-blocked) |
| 44 | `originSpiral` | web | S | MU ring recurrence (`mono:2651`) | one spiral from specular | ring spacing | `pitchFor` ring-by-ring | radial about highlight | I, hi-point | **→ Spiral Type** (M9a) |
| 45 | `dutyConst` | dash | S | MR, P = FLOOR·1.05, period 2·FLOOR (`mono:1440`) | dashes | duty 0.18→1 | fixed | screen Angle | I | ~mkDashRamp (M8) |
| 46 | `endShorten` | hatch | S | MR, P = FLOOR·1.15 (`mono:1508`) | full ruling | end retraction | fixed | screen Angle | I at ends | keep |
| 47 | `turingStripe` | web | S | MU reaction-diffusion (`mono:2441`) | zero-crossing stripes | local wavelength | RD | ∇I-anisotropic | I | keep |
| 48 | `voronoiWeb` | web | S | MU Voronoi + Lloyd (`mono:1594`) | cell walls | seed density | clamped cells | none | I | keep |
| 49 | `mazeFill` | web | S | MU perfect maze (`mono:2225`) | maze walls | cell size | graded grid | grid | I | keep |

† `perceptualRamp` sits on a different engine from its survivor. See S2.

### Types (mapper, `params.js:79`) — all 8

| Type | generator (code) | own params | tone-law reachable | proposed |
|---|---|---|---|---|
| none | bare face outlines + structural edges (`scene3d.js:4261-4300`) | — | no | keep |
| wireframe | all edges by class (`scene3d.js:4264`, `:5292`) | edgeClasses, showHidden | no | keep (≈ none minus face outlines + interior; low value to merge) |
| hatch | family A at Angle, or meridian `b` (`surface-fill.js:12661-12670`); faceted `faceHatchLines(...,false)` (`scene3d.js:4219`) | Angle, Density, Angle ref, Link fill, Min rulings | yes | **HATCH** (T1) |
| crosshatch | **hatch's family A, verbatim**, + `emitSecondary(angle+Δ, count/ratio)` (+ third pass at +32° if `tripleHatch`) (`:12671-12681`); faceted `faceHatchLines(...,true)` | + Cross angle, Cross density, Triple hatch | yes | **HATCH** (T1) |
| contour | curved: `emitFamily('a')` latitude rings (`:12683`); faceted: `insetPasses` (`mappers.js:463`); `contourStyle` surface/region switches generators (`params.js:673`) | Density, Style | yes | CONTOUR (T2) |
| spiral | curved: helix sweeping the same `a` axis (`:12687+`); faceted: `trueSpiral` Archimedean (`mappers.js:466`); `spiralMode` surfaceHelix/flatClip | 5 own | ladder family only on curved | keep (T3 not recommended) |
| stipple | jittered dot lattice, `dotShape` ∈ dot/ring/cross/plus/tick (`mappers.js:479`, `params.js:602`) | Dot, size, jitter, angle | ladder family only on curved | keep; absorb mkDotScreen? (M9b) |
| contourSlice | mesh ∩ parallel planes (`scene3d.js:4269`, `:4878`) | Slices, Show, Rotate, Tilt, End overlap | no | **CONTOUR** (T2) |

**Other sub-settings covered:**
- **Stroke Fill** (4 options, `context-bar.js:722`). See M11.
- **Shadow-hatch Fill Style** (`shadows.js:1108-1290`). See M12.
- **Ground fill:** `sceneGround3d` uses the same style/mapper system, so T1/T2 apply unchanged.
- **Density, Angle, Link fill and Min rulings** are mapper-generic. They are not consolidation targets, but see S7 for where they go inert.

---

## 2. Merge candidates (new — not covered by U1–U8)

Ranked by (code evidence × product value) ÷ risk.

### M1 — Bundle: fold `bundleSubNib` + `bundleLozenge` into `bundleCount` (STRONG)
- **Evidence.** Both are pure constant/predicate swaps inside the one AD engine.
  - `bundleSubNib`:
    - `adjMax` (8 → 13) `:3242`
    - `adjStep` (1.0 → 0.55 ink) `:3248`
    - `adjDarkArea` (0.93 → 0.97) `:3254`
  - `bundleLozenge`: `adjEndInset(k) = k·adjStep()` vs 0 `:3365`.
  - Every other line of the emitter is shared.
  - The shadow recipes confirm the same relationship:
    - `bundleSubNib` = `hatchDoublePass{4, .2}`
    - `bundleLozenge` = `hatchEndTrim(bundleCount's recipe, .08)`
    - Source: `shadows.js` HATCH table.
- **Proposed params:**
  - **Pass step** (enum `abut` = 1.0 ink, default; `overlap` = 0.55 ink). In Phase 2 this becomes a continuous 0.5–1.0 ink, with detents at 1.0 and 0.55. `adjMax`/`adjDarkArea` follow from the step.
  - **Bundle ends** (enum `square`, default; `lozenge`).
- **Representability.** Phase 1 (aliases) can only offer these as extra values of the existing `bundleMode` enum (`subNib`, `lozenge`). The reason: the resolver cannot combine `bundleMode=eased` with `ends=lozenge`. Phase 2 (`adjStep`/`adjEndInset` read params instead of `TONE_ALGO`) makes all 6 × 2 × 2 combinations real. That refactor is small, because each predicate is a one-liner.
- **Migration.**
  - `bundleSubNib` → `bundleCount{bundleMode:'subNib'}`. Phase 2: `{passStep:0.55}`.
  - `bundleLozenge` → `bundleCount{bundleMode:'lozenge'}`. Phase 2: `{bundleEnds:'lozenge'}`.
  - Byte-identical by construction, because the internal id is preserved.
  - Mark class: all hatch, so §2.4 holds.
  - Shadow: route both through the existing per-id recipes via `effectiveLaw`.
- **Risk.**
  - Low.
  - `bundleSubNib` floods (plan §8, F-08), so its caveat must follow the option (U5b rule).
  - Discoverability loss is small. These are library-tier and engraver-jargon rows.
  - Removes 2 picker rows.

### M2 — Flow field: fold `defectSplit` into `etfKang` as one "Flow Field" with a Field param (STRONG). `mezzoRegion` is conditional.
- **Evidence.**
  - All three call `streamFamily(C, dirAt, (s) => C.pitchFor(finite(s.I,0)))` with the same arguments (`surface-fill-mono.js:851`, `:955`, `:999`).
  - Placement, clearance, tone and the silhouette guard are the shared chassis (`:551`).
  - Only `dirAt` differs:
    - Kang ETF smoothing (`:765-850`)
    - designed ±½ defects (`:868-954`)
    - per-region random angle (`:973-998`)
  - So this is literally "one maker, different direction field".
- **Param.** **Direction field**: `depth` (Kang, default) / `defects` (designed singularities) / `regions` (mezzotint patches). Plus a possible numeric child for `regions`: region count / min separation (30° today).
- **Migration.**
  - `defectSplit` → `etfKang{flowField:'defects'}`.
  - `mezzoRegion` → `{flowField:'regions'}`.
  - **Blocker for mezzo:** its class is `cross` (`context-bar.js` MARK_OF), while etf and defect are `flow`. Folding it needs either a §2.4 exception or a reclass. Option: keep mezzo as its own row and merge only etf + defect (both `flow`; clean).
  - Shadow: the flow class is not offered on shadows (`SHADOW_NOTE`). mezzo has a CROSS recipe (`shadows.js` CROSS table), which is another reason to leave it out.
- **Risk.**
  - Medium-low.
  - etfKang has 13 test refs and defectSplit 5.
  - "ETF Direction Field (Kang)" and "Defect Split" are research names, not artistic presets. The merge *improves* discoverability: "Flow Field ▸ Direction: follows depth / designed / patchwork".
  - All three are inert on spiral/stipple (`CURVED_SPIRAL_STIPPLE_INERT`), so the gating stays consistent.

### M3 — Width ribbon: fold `isophoteWidth` into `taperedEnds`, and split `bandProfile` into two axes (MEDIUM — re-opens a plan "keep")
- **Evidence.**
  - whiteBand, nibAngle, taperedEnds and isophoteWidth share every chassis gate:
    - `splitsAlongLine` `:2065-2067`
    - `wbFlatCov` `:3181-3185`
    - `weightForArea(<area>, localPitch, weightCovEff)` `:5002-5066`
  - They differ ONLY in the area function:
    - `1-c`
    - `(1-c)·nibFactor(θ)`
    - `taperArea(I,endMM)`
    - `isoWidthArea(I,|∇I|)`
  - isophoteWidth is therefore a fourth width source on the same maker. The plan kept it separate because the *picture* differs (ink 2320 vs 2862 mm). Under this lens that is a param value, not a separate generator.
- **Overload found (split).** `bandProfile` today mixes two orthogonal things:
  - the **width source**: grey (whiteBand/taperedEnds), nib angle (nibAngle)
  - the **end treatment**: hard (whiteBand), tapered (taperedEnds)
  - So "Calligraphic nib with tapered ends" and "isophote with tapered ends" cannot be expressed, even though `taperArea`'s soft clamp + end taper is an independent multiplier.
- **Proposed params:**
  - **Width from**: `tone` (default) / `nibAngle` / `isophote`.
  - **Ends**: `tapered` (default) / `hard`.
  - Phase 1 can only enumerate the existing 4 ids. Phase 2 composes them: area = source(I) × endTaper(endMM).
- **Migration:**
  - `whiteBand` → `{widthFrom:'tone', ends:'hard'}`
  - `nibAngle` → `{widthFrom:'nibAngle', ends:'hard'}`. The shipped nib branch has no taper.
  - `isophoteWidth` → `{widthFrom:'isophote', ends:'hard'}`
  - All are ribbon laws (`STROKE_FILL_RIBBON_LAWS`), so Stroke Fill stays enabled across the cluster.
- **Risk.**
  - Shadow: `isophoteWidth` is in `TONE_LAW_NOT_DISTINGUISHABLE` (`shadows.js:867`), so the shadow row must exclude that combination, as U9b does for `penDown`.
  - isophoteWidth has 11 test refs.
  - Medium discoverability. "Isophote Width" is not an artist term, so a "Width from" control is clearer.
- **M3b (weak, do not do yet).** `weightModulated` is the same width idea at *per-run* granularity on `flatCov` (`:8982`), instead of per-sample on `wbFlatCov`. A "Width varies: along stroke / per stroke" param would unify the two. But the grids differ (`flatCov` vs `wbFlatCov`), so the "same constant" claim is weaker. List it only as a Phase-2 idea.

### M4 — Wave family: regroup by the code's own axes (MEDIUM; includes label corrections)
- **Evidence.** The WV6 table *is* a parameter table: `aFlo/aMax/amp/tone/ph/lam/dep/cFlo/steps` (`:4390-4412`). Round-5 laws use the same chassis with `TONE_ALGO` branches:
  - amplitude: `wvAmpAsk` `:4562-4566`
  - phase: `wvLinePhase` `:4599`, and `anti` at `:9524`
  - waveform: `wvForm` `:4611-4616`
  - pitch: `wvPitchPen` `:4463`
- **The shipped U7/U8 labels do not match the code:**
  - `weaveDepth` ("Nested rows") is WV6 `ph:'anti', dep:0`. It is an **anti-phase interlock**, not nesting; nesting is `dep:1` (`weaveOctaveEase`, unrostered). Its true twin by code is `interlockWeave`, not `ampSpacing`.
  - `onePenDown` ("One pen-down per family", under `interlockWeave`) is **in-phase** and drops the clearance cap: `anti` is only `interlockWeave` or `tourScribble` (`:9524`), and the cap applies only when `TONE_ALGO === 'interlockWeave'` (`:9487`). So the `penDown` option silently also flips the phase and removes the cap.
- **Proposed regroup.** One "Wave" survivor:
  - **Phase**: `nested` (in-phase) / `interlocked` (anti-phase).
  - **Waveform**: `serpentine` / `loop` (trochoid) / `zigzag` (triangle).
  - **Pen-down**: per ruling / continuous.
- **Enumerable map:**
  - ampSpacing = nested + serpentine
  - weaveDepth = interlocked + serpentine (R6)
  - interlockWeave = interlocked + serpentine (R5)
  - onePenDown = nested + serpentine + continuous
  - trochoidLoop = nested + loop
  - amplitudeOnly = nested + zigzag
  - R5 and R6 duplicate "interlocked + serpentine". Keep one (weaveDepth, the newer chassis, ink-matched to ampSpacing within 0.2%) as the param value. Keep the other reachable by alias.
- **Migration.** These are alias entries mapped to `(Wave, {phase, waveform, penDown})`. All are class `wave`, so §2.4 holds. All are ribbon laws, so Stroke Fill stays on.
- **Risk.**
  - Highest test surface of any cluster: interlockWeave 27, trochoidLoop 24, ampSpacing 23, weaveDepth 21.
  - `trochoidLoop` was explicitly *not* folded (plan §1 C-08: "polygon shards", 12% more ink). Here it is a *Waveform value*, which is honest because its picture is meant to differ. But that needs Jay's sign-off, because it reverses a recorded ruling.
  - `amplitudeOnly` is a self-declared refutation (plan §8). Retire it from the picker rather than give it a waveform slot.
  - Also note: `mkScribble` (MK `{scribble, amp}`) and `amplitudeOnly` are conceptually the same mark (a fixed-pitch triangle wave with amplitude as the tone channel) on two different engines. If amplitudeOnly stays, alias it toward mkScribble's row in the UI, not into Wave.
- **Minimum safe action now (even without the regroup):** fix the two labels. Either "Nested rows" → "Interlocked (anti-phase)", or move `weaveDepth` under `interlockWeave`. And add "(in-phase)" to the `continuous` pen-down option.

### M5 — Even spacing: `ladder` and `contFieldSigmoid` are one generator after W-26 (MEDIUM-HIGH value, HIGH risk)
- **Evidence.**
  - Both route through `contMapper` → `emitContFamily` (`:12598-12650`).
  - `algoCoverage` returns flat 1 for both (`:5447`, CONT branch).
  - They differ only in the wanted-pitch transfer:
    - `ladderWantedPitch = masterPitch / clamp(ladderCov(I))` (`:5205`, rungs from `fineLadderCov`/`nestedCov`/`coverageForSample`)
    - `cfWantedPitch(I) = pMin + (pMax-pMin)·curve(I)` (`:5123-5131`)
  - So `rungMode` (ladder) and `fieldMetric/fieldFloor` (contField) are two sub-controls on the same maker.
- **Proposed params.** One "Even spacing" style (id `ladder`, the default):
  - **Spacing curve**: `rungs4` (D) / `rungsFine` / `rungsPhase` / `lstar` (contField L\*-linear) / `sigmoid` (Sterzik).
  - **Metric**: screen / foreshortened / surface. This applies only to the field curves; the engine has ids only there.
  - **Floor**: plot / touch.
  - **Quantise**: off / N levels.
- **Migration.** `contFieldSigmoid` → `ladder{spacingCurve:'sigmoid'}`. Chain the existing contField aliases through it.
- **Risk.**
  - (a) `ladder` is the shipped default and the shadow baseline. Its unwrapped path is protected by a regression contract (`shadows.js` comment, ~:1010), so any alias must never route `ladder` itself through a recipe.
  - (b) The field curves are **density-inert**: `cfTightPitch`/`cfOpenPitch` ignore `masterPitch` (plan C-05: "density-inert rows"). The ladder curves follow Density. A merged control would make the Density slider silently dead on some curve values. Fix that first (make `pMax` density-aware), or show it.
  - (c) The mark class is hatch everywhere, so §2.4 holds.
  - Net: a real consolidation that collapses 2 rows and 2 sub-control sets into 1, but only after (b) is resolved.

### M6 — Ladder add-ons: `lozengeStipple` and `deepFillTSP` are ladder + one overlay (MEDIUM; matches plan §8 direction)
- **Evidence.**
  - `lozengeStipple` = `perceptualCov` exactly as `perceptualRamp` (`:5455-5464`; the comment says "all state the SAME target"), plus flicks on dropped spans (`:10149-10160`, `LOZ_MM 0.9`, `LOZ_GAIN 0.35`).
  - `deepFillTSP` = `isEvenLadder` (`:5148`; "rides isEvenLadder's own flat-1 placement") plus `tspVerts` in the deep third (`:10765`).
- **Proposed params** on the `ladder` survivor:
  - **Dropped-rung residual**: none / flicks.
  - **Deep-shadow infill**: none / traverse.
- **Migration:**
  - `lozengeStipple` → `ladder{rungMode:'perceptual', residual:'flicks'}`. This is a 2-descriptor combination, so it is not representable in Phase 1; Phase 1 can only enumerate it as a `rungMode` value "Perceptual + flicks".
  - `deepFillTSP` → `ladder{deepInfill:'traverse'}`.
- **Blocker.** The classes are `dot` and `web`, not `hatch`. Folding needs the same reclass Jay approved for penStipple (U6 precedent, `context-bar.js` penStipple comment). That changes the shadow recipe (`DOT_LAW_RECIPES.lozengeStipple`).
- **Risk.** Both are flagged as weak pictures in plan §8 (~15 flicks; ~2% visual). If Jay prefers *removal* (§8), use a no-param alias to `ladder` instead. Either way they should not stay top-level rows.

### M7 — Pen: `penCross` / `penReserve` into `penInterleave` (CODE YES, PRODUCT NO — keep)
- **Evidence.** They are rows of `PEN_FAMILIES` `{layer, deg, div}` (`:4173-4177`) plus `penLayerTier` (`:4181-4186`) on the one `penPlan` (`:4193`). That is exactly the "extra family count/angle" constant pattern.
- **Why not.**
  - The class is `cross` vs `hatch`, so it violates §2.4.
  - Crossed vs single-direction textures are separate perceptual clusters (Sterzik, cited at `context-bar.js:96-100`).
  - The plan explicitly keeps them.
- **Recorded as:** generator-shared but artistically meaningful. Do not merge.

### M8 — `dutyConst` ↔ `mkDashRamp` (WEAK)
- **Evidence.**
  - The tone channel is the same: a fixed period, with the mark lengthening until it meets its neighbour.
  - `dutyConst`: duty 0.18→1 (`mono:1440-1490`).
  - `mkDashRamp`: `chan:'elong'`, fixed period, dot→dash→rule, then a band past solid (`:2898`).
  - Both are class `dash`. The shadow recipes are the same `dashSegment` idea.
- **Difference.** The substrates differ: mono screen-straight lines at a fixed `FLOOR·1.05` clearance, vs the MK chart-row scaffold. `mkDashRamp` also adds the band stage.
- **Param if merged.** "Dash" with **Rulings follow**: surface / screen, and **Past solid**: stop / band.
- **Risk.**
  - Not byte-composable. The engines differ, so this is a picker-level alias only.
  - Low value; both rows are clear.
  - Recommend keep, unless the dash class needs thinning.

### M9 — Cross-axis: Fill Styles that duplicate a Type, and are hidden on that Type
- **M9a — `originSpiral` → Spiral Type.**
  - originSpiral is a spiral wound from the specular point with tone-integrated ring spacing (`mono:2651`).
  - The Spiral Type is a spiral wound from `centroid|bboxCenter` (`params.js:598`) with tone-driven turn spacing on curved (`surface-fill.js` W-26 spiral branch, `:12687+`).
  - Yet originSpiral is **inert under the Spiral Type** (`CURVED_SPIRAL_STIPPLE_INERT`) and reachable only under hatch/crosshatch/contour.
  - Proposal: add `spiralCenter: 'highlight'` (flatClip mode) to the Spiral Type, backed by `lawSpiral`. Alias `toneLaw:'originSpiral'` → `{mapper:'spiral', spiralMode:'flatClip', spiralCenter:'highlight'}`.
  - Risk: this changes `mapper`, a cross-axis migration that the resolver cannot do. It needs a `normalizeStyle` shim. The class `web` row empties by one. 7 test refs.
- **M9b — `mkDotScreen` ↔ Stipple Type.**
  - Both are "dots carrying tone".
  - Stipple: count/jitter lattice, `dotShape` ∈ {dot, ring, cross, plus, tick}.
  - mkDotScreen: hex lattice, size channel.
  - mkDotScreen is inert under Stipple.
  - Proposal: Stipple gains **Tone carried by**: count (D) / size (hex screen).
  - Risk: different engines (`mappers.js` region stipple vs MK chart rows), so the pictures differ. Treat this as a long-term direction: the MK `shape × chan × lat` table (`:2876-2950`) is already the generalisation of Stipple's `dotShape`. Not a Phase-1 fold.

### M10 — Types
- **T1 — Hatch + Crosshatch → Hatch with Layers 1/2/3 (STRONG code, MEDIUM product).**
  - Crosshatch runs hatch's family-A branch verbatim and then adds `emitSecondary` (`surface-fill.js:12671-12681`).
  - On faceted shapes it is the same `faceHatchLines` with a boolean flag (`scene3d.js:4219`, `:4345`, `:4405`).
  - `tripleHatch` already makes "layers" a count.
  - Param: **Layers** 1 (D) / 2 / 3. Show Cross angle and Cross density when Layers ≥ 2.
  - Migration: `mapper:'crosshatch'` → `{mapper:'hatch', hatchLayers:2}`, plus `tripleHatch:true` → 3.
  - Risk:
    - ~34 `'crosshatch'` literal sites: scene3d.js 10, surface-fill 8, context-bar 6, panel 5, params 4, mono 1.
    - Shadows and `isReachableOn` gate on the mapper.
    - "Crosshatch" is canonical plotter vocabulary, so the merge HURTS discoverability unless "Crosshatch" stays as a visible preset label.
  - Verdict: worthwhile only if the Type picker is being redesigned anyway.
- **T2 — Contour + Slices → Contour with Style {surface, region, slices} (MEDIUM).**
  - `contourStyle` is already a 2-way switch between *different* generators (`params.js:673`: chart parallels vs `insetPasses`).
  - `contourSlice` is a third contour generator: plane sections (`scene3d.js:4269`, `:4878`).
  - Migration: `mapper:'contourSlice'` → `{mapper:'contour', contourStyle:'slices'}`.
  - Risk:
    - Slices bypass the tone machinery, so the Fill Style row would become reachable or unreachable per *sub-param*. `isReachableOn` keys on the mapper only.
    - The Slice params (count/rotate/tilt/end overlap) need show-if gating.
    - "Slices" is a distinct, popular topographic look.
  - Verdict: optional; mainly helps grouping.
- **T3 — Contour + Spiral (NOT recommended).**
  - On curved shapes, spiral is the contour `a` family wound into one helix. That is the same "continuous pen-down" relationship as the U8 fold.
  - But spiral has 5 own params, different tone reachability, and a flat-mode generator unrelated to contour (`trueSpiral`). Keep it separate.
- **none ↔ wireframe:** a different edge policy, not a constant. Keep.

### M11 — Stroke Fill options (MEDIUM-LOW)
- **Evidence** (`src/core/pen-fill.js:1425-1453`):
  - `spiral` and `concentric` use the same `contourPieces` (SDF iso-rings). They differ only in `cfg.continuous` / `cfg.blend`: blend-morph vs bridge-or-lift.
  - `contourParallel` is the same nested-ring intent via polygon offset (`offsetPieces`, `:1011`).
  - `serpentine` is the only different geometry.
  - The fill is pen-pitched and coverage-guaranteed, so the visible picture differences are small. They mostly change path/pen-lift structure.
- **Proposal:**
  - **Pattern**: rings / serpentine.
  - **Pen-down**: one continuous path (spiral blend) / bridged rings.
  - Drop `contourParallel` as an alias of rings, unless a measured coverage or overdraw advantage justifies keeping it. Check `pen-fill.js:713`/`:816` notes on overdraw.
- **Migration.** Layer param `strokeFillStyle` (`defaults.js:2084`, `:2205`):
  - `spiral` → {rings, continuous}
  - `concentric` → {rings, bridged}
  - `contourParallel` → {rings, bridged, offset:'polygon'} (hidden)
- **Risk:** low; there is no preset usage.

### M12 — Shadow Fill Style recipes are hand-made "different constants" (STRONG)
- **Evidence.**
  - `shadows.js:1108-1290` gives each law id a recipe built from 6 primitives: `hatchOffset(angleNudge, spacingMult)`, `hatchDoublePass{passes, passSpacingMult, nudge, jitter}`, `hatchEndTrim(frac)`, `crossBase`, `waveSegment{amp, λ, phase}`, `dashSegment(period, duty)`, `dotMarks{pitch, flick, jitter}`.
  - The constants were chosen **"so no two ids land on the same (angle, mult) pair"** (comment ~:1022). For example:
    - `fineLadder` (0, .97)
    - `perceptualRamp` (0, 1.05)
    - `contFieldSigmoid` (0, 1.08)
    - `contFieldQuant` (0, .93)
    - `penPitchMatch` (0, 1.15)
  - These are textbook square-maker / pentagon-maker cases. The flat footprint has no light gradient for most laws to express.
- **Proposal.**
  - The shadow row offers the mark class (hatch / bundle / cross / wave / dash / dot) plus ≤2 params (Passes 1–4, Spacing ×0.8–1.2, End trim 0–25%).
  - Alternatively, the shadow row shows only the class of the object's own law.
- **Migration.** Map each stored `shadowToneLaw` to its recipe's (primitive, constants). This is byte-identical when the params reproduce the constants.
- **Risk.**
  - This reverses fs-n2 Stage 1 and the U9b "uniqueness" re-pin (`scene3d-shadow-tone-law-uniqueness.test.js`). That test exists *because* ids used to collide.
  - Needs Jay's decision: is per-id shadow uniqueness a product goal, or an artefact of mirroring the 48-row roster?

---

## 3. Merges that would HURT (keep separate even though code is shared)

- **mk\* across shapes** (`MK` table `:2886`). It is one generator with `shape × chan × lat × or`, which is literally a "polygon-maker". But dot / tick / dash-ramp / scribble are 4 different classes (dot/dash/dash/wave), so §2.4 applies. They are also distinct artistic languages. The mark-class optgroups already act as the "shape" param. Keep. The engine already holds 8 unrostered shapes (lozenge, chevron, comma, sflick, cross, triangle, dotLozenge, radialFlick, `:2888-2949`), so a future "Mark shape" param is cheap. Do it per class, not across classes.
- **penCross / penReserve** (M7). Crossed vs single-direction texture clusters.
- **turingStripe / voronoiWeb / mazeFill.** Three unrelated algorithms (RD, Voronoi+Lloyd, spanning tree). There is no shared constant. Each is a named artistic preset.
- **endShorten.** Its only kin is `dutyConst`'s scaffold, and the channel differs (end retraction vs duty). Its shadow recipe equals `taperedEnds`' `hatchEndTrim` idea, but on the surface it is distinct.
- **none.** The tone-off control. A "Tone on/off" toggle on every law is conceivable, but it would hide the reference row the whole roster is measured against.

---

## 4. Reverse findings — overloaded rows / mislabeled params (split or relabel)

- **S1 — `contFieldSigmoid` survivor loses its own curve under every other option.** `sterzik()` is applied only when `TONE_ALGO === 'contFieldSigmoid'` (`:5128`). Fore, Surface, Quant and Touch all fall through to the L\*-linear branch (`:5129-5130`). So choosing *Field metric = Foreshortened* silently also changes *curve: sigmoid → L\*-linear*. Two fixes are possible:
  - Make the survivor the L\*-linear base (unrostered `contFieldPitch`) and add a **Curve** param.
  - Or state the curve change in the option labels.
- **S2 — `ladder` rungMode `perceptual` switches engines.** `fineLadder` and `phaseFineLadder` are on the continuous engine (`isEvenLadder`, `:5147`). `perceptualRamp` is not: it returns `perceptualCov` < 1 into the discrete rung verdict (`:5455`). So the "Perceptual ramp" option brings back exactly the irregular 1-and-2-pitch gaps W-26 removed for ladder (F-23, `:5133-5146`). Either move `perceptualRamp` onto `ladderWantedPitch` (a gamma on `ladderCov`), or relabel and caveat the option. This also bears on M6, because lozengeStipple *needs* the discrete engine for `spanDrop`.
- **S3 — `taperedEnds.bandProfile` mixes the width source and the end treatment** (M3). Split it into two params.
- **S4 — Wave sub-param labels misdescribe the code** (M4).
  - `nesting:'nested'` → weaveDepth is anti-phase with `dep:0`, so it is not nested.
  - `penDown:'continuous'` → onePenDown is also in-phase with no clearance cap.
- **S5 — `fieldMetric` includes `quantised`, which is not a metric.** Quantisation (`cfQuantise`, `:11616`, `CF_LEVELS` `:1491`) is orthogonal to the metric. It belongs in its own param ("Gap levels: continuous / 16 / 128 / 256"). The roster text says it was run at 3 level counts, and `opts.toneQuantLevels` already exists.
- **S6 — Types with internal generator switches.**
  - `contour.contourStyle` (chart parallels vs region insets) and `spiral.spiralMode` (chart helix vs screen Archimedean) each swap the whole generator.
  - That is acceptable as long as the labels say so. But `spiralEccentricity` is documented as superseded for the W-26 laws (`:12707-12720`), so it is a dead control there. Grey it out.
- **S7 — Type is an inert axis for the 9 mono laws.**
  - `SurfaceFillMono.emit` reads `mapper` only to add a fixed 65° second pass for crosshatch (`mono:2956`). No law reads `C.mapper` (only `:539` stores it).
  - So for etfKang…mazeFill, **Hatch ≡ Contour** (by code; unmeasured — confirm with an md5 pair).
  - **Crosshatch's Cross angle and Cross density sliders are inert** for these laws: they use a hard-coded 65°, not `crossAngleDelta`.
  - Contour also has no Angle control in the panel (`scene3d-panel.js:420`), yet mono laws still read the hidden `fillAngle`.
  - Recommend:
    - grey out Cross angle/density for mono laws, or wire `crossAngleDelta` into `passes`;
    - either make Contour mean something to them (e.g. a chart-axis seed) or mark Contour as unreachable for them in `isReachableOn`.

---

## 5. Net effect if the strong items land

| step | picker rows (31 today incl. default) |
|---|---|
| M1 bundle (−2: SubNib, Lozenge) | 29 |
| M2 flow (−1 defectSplit; −2 if mezzo reclassed) | 28 (27) |
| M3 ribbon (−1 isophoteWidth) | 27 |
| M6 ladder add-ons (−2) | 25 |
| M4 wave (−3: interlockWeave, trochoidLoop, amplitudeOnly under one Wave) | 22 |
| M5 even-spacing (−1 contFieldSigmoid) | 21 |
| M9a originSpiral → Spiral Type (−1) | 20 |

Types: 8 → 7 (T2), or 6 (T1 + T2).

## 6. Implementation notes for whoever picks these up

1. **Phase 1 (alias-only).** Each fold is an `ALIASES` entry plus a `STYLE_PARAMS` option, exactly as in U1–U8. It is byte-identical by construction, and the RGR oracle is `toneLaw:X` md5 == `survivor + param` md5 (plan §0). Only the single-descriptor folds fit here: M1-as-enum, M2 (etf + defect), M3-as-enum, M6-as-enum, M4 relabels.
2. **Phase 2 (composable params).** Replace `TONE_ALGO === 'x'` predicates with param reads:
   - `adjStep`/`adjMax`/`adjEndInset` (`:3242-3365`)
   - the `weightAtSample` area chain (`:4975-5066`)
   - `wvLinePhase`/`wvForm`/`wvAmpAsk` (`:4555-4620`)
   - `cfWantedPitch` (`:5123`)
   - Detent ids must stay byte-identical. Values between detents are new pictures, which is the U10/U11 contract.
3. **Shadow.** Every alias must resolve through `effectiveLaw` before `HATCH/CROSS/WAVE/DASH/DOT_LAW_RECIPES` (`shadows.js:1108-1290`). Otherwise saved shadow textures change (the U9 trap).
4. **Mark-class invariant.** M2-mezzo, M6, M7 and M9 all cross classes. Each needs the U6-style explicit sign-off, or must stay out.
5. **Test blast radius** (files referencing the id under `tests/`):
   - interlockWeave 27, trochoidLoop 24, ampSpacing 23, weaveDepth 21, amplitudeOnly 15
   - etfKang 13, mkDashRamp 13, mkDotScreen 12, isophoteWidth 11, penCross 10, penReserve 9
   - originSpiral 7, contFieldSigmoid 6, dutyConst 6, defectSplit 5, mezzoRegion 5, endShorten 5, deepFillTSP 5
   - bundleSubNib 4, bundleLozenge 3, lozengeStipple 3
   - `scene3d-tone-law-collapse.test.js` runs 390–1046 s (handoff §0b). Budget for it.
