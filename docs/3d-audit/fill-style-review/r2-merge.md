# R2: Adversarial check of r1-merge.md, and a gap hunt (lens a: CONSOLIDATION)

Repo `main` @ `e609338c`. This was a read-only audit. No repo file was changed.

**Empirical rig:** `fillstyle-audit/r2/nlib.js`. It is a headless `loadVecturaRuntime` (the same runtime as `tests/unit/scene3d-tone-law-collapse.test.js`). It calls `algo.generate` on a sphere (r40, det 20) under an orthographic camera, with angle 45 and density 60. The light is a sun at azimuth 200 and elevation 55. It takes the md5 of the output paths, rounded to 0.001 mm.

**Scripts:** `r2/t0.js`, `tA.js`, `tB.js`, `tC.js`, `tD.js`. **Raw output:** `r2/out*.txt`.

**What `frac` means:** the share of path set A that is found verbatim in path set B. It is a multiset match.

**Rig sanity check:** `fineLadder` (raw) md5 equals `ladder{rungMode:'fine'}` md5 (`b4b13f32c6`), and both differ from `ladder` (`73e58bfdcd`). So the rig sees the alias resolver.

**A general point about the "byte-identical" claims.** A Phase-1 fold is byte-identical *by construction*. The reason: `resolveToneLaw` (`params.js:819-842`) maps the survivor and its param back to the *same internal id*, and `TONE_ALGO` is unchanged. So "byte-identical" proves only that the plumbing works. It says nothing about whether the two styles are "one maker with a different constant". For that second question I measured how much geometry the pairs share (`frac`, below).

---

## 1. Verdict table: r1 merge candidates

| r1 item | Verdict | Evidence (file:line, plus empirical result) |
|---|---|---|
| **M1** bundleSubNib + bundleLozenge → bundleCount | **CONFIRMED (code). PARTLY on migration.** | See notes M1-a and M1-b below the table. |
| **M2** defectSplit (+mezzo) → etfKang "Flow field" | **CONFIRMED** | All three call `streamFamily(C, dirAt, (s)=>C.pitchFor(finite(s.I,0)))` verbatim (`surface-fill-mono.js:851, 955, 999`). The RUN table is `mono:2925-2927`. mezzo is class `cross` and the other two are `flow` (`context-bar.js:151, 159`), so r1's class blocker is real. One extra difference: mezzo reads `C.rot` and the other two do not. Measured: mezzo changes with fillAngle; etf and defect are angle-inert (`outA-etfKang.txt`). So "Direction field = regions" would also bring back a live Angle control. |
| **M3** isophoteWidth → taperedEnds; split bandProfile | **PARTLY** | See note M3 below the table. |
| **M4** Wave regroup + label fixes | **CONFIRMED, and r1 understated it** | See note M4 below the table. |
| **M5** contFieldSigmoid → ladder "Even spacing" | **CONFIRMED (code). Risk (b) CONFIRMED empirically.** | Both use `contMapper` → `emitContFamily` (`surface-fill.js:12596-12650`). `cfWantedPitch` is at `:5123-5131`; `ladderWantedPitch` is at `:5195`. `cfTightPitch`/`cfOpenPitch` never read `masterPitch` (`:5106-5109`). **Measured, Density 30/60/90:** `contFieldTouch` gave the same md5 at all three (fully Density-inert). `contFieldSigmoid` gave 30 ≡ 60, and 90 moved ink by only 0.5 %. `ladder` gave 2145 → 4209 → 7714 mm. A merged control would make Density dead on half its curve values. Fix that first. |
| **M6** lozengeStipple / deepFillTSP = ladder + overlay | **lozengeStipple CONFIRMED; deepFillTSP PARTLY** | lozengeStipple: 100 % of perceptualRamp's paths are present verbatim (frac 1.000, +57 paths of flicks). It is a pure additive overlay, as claimed (`:10152`, `:5462`). deepFillTSP: only 73.5 % of ladder's paths survive. The traverse *replaces* deep-zone rulings (`:10765`, same path count, +22 % ink), so it is not an add-on. A "Deep infill: traverse" param is still honest, but it is a replace, not an overlay. On Spiral and Stipple both overlays are dead. Measured: `ladder` ≡ `deepFillTSP`, and `perceptualRamp` ≡ `lozengeStipple` (`outD.txt`). Class blocker (dot/web, `context-bar.js:169-170`): CONFIRMED. |
| **M7** penCross / penReserve keep | **CONFIRMED (keep)** | `PEN_FAMILIES` is at `:4173-4178` and `penLayerTier` at `:4180-4186`. Also measured: penCross on hatch ≠ penInterleave on crosshatch (Δ60, ratio 2). Only 38 % of penInterleave's paths appear in penCross, because the base family uses the medium tier. So even moving the crossing onto the Type axis is not byte-composable. |
| **M8** dutyConst ↔ mkDashRamp (weak) | **CONFIRMED (weak), with an extra difference** | Two engines: mono `lawDuty` and MK `{morph, elong, row}` (`:2884`). Also, `dutyConst` reads the screen angle `C.rot` (measured: angle-live), while mkDashRamp follows the chart rows. |
| **M9a** originSpiral → Spiral Type | **CONFIRMED (gap exists). Feasibility PARTLY.** | `SPIRAL_CENTERS = ['centroid','bboxCenter']` (`params.js:595`). originSpiral is in `CURVED_SPIRAL_STIPPLE_INERT` (`context-bar.js:553`) and is excluded on torus (`:649`). Measured: originSpiral under Hatch ≡ Contour, and it is angle-inert. It ignores Type entirely, which strengthens the case for moving it. |
| **M9b** mkDotScreen ↔ Stipple | **CONFIRMED (long-term only)** | MK has 12 rows, 4 of them rostered (`surface-fill.js:2881-2894`). |
| **M10-T1** Hatch + Crosshatch → Layers | **CONFIRMED on curved shapes. PARTLY on faceted. Triple-hatch claim REFUTED.** | See note T1 below the table. |
| **M10-T2** Contour + Slices | **CONFIRMED (grouping only)** | contourSlice ignores the Fill Style: measured, ladder ≡ bundleCount ≡ none (`outC.txt`). The code bypass is at `scene3d.js:4265-4269, 4878`. r1's "row reachable per sub-param" risk is real. |
| **M10-T3** Contour + Spiral (not recommended) | **CONFIRMED (keep)** | `spiralMode` flatClip and surfaceHelix are different generators. Measured: 1108 mm vs 3956 mm. |
| **M11** Stroke Fill: rings × pen-down | **CONFIRMED** | `pen-fill.js:1425-1452`: `continuous = spiral‖serpentine`, `blend = spiral`. `contourParallel` uses `offsetPieces` and every other value uses `contourPieces`. See note M11 below the table. |
| **M12** shadow recipes = hand-made constants | **CONFIRMED, and the situation is worse than r1 says** | See NEW-1 (§2). |
| **§0** "presets carry no toneLaw; mapper only hatch/wireframe" | **CONFIRMED, with a small correction** | `user-presets/scene3d/{studio-shadows,cad-wireframe,shape-grid}.vectura` set only `mapper: hatch|wireframe`. `user-presets/object3d/` and `user-presets/sceneGround3d/` hold only `.gitkeep`. r1's mention of `sceneGround3d` as a mapper carrier is wrong: that leaf type has only `enabled` (`defaults.js:2288-2298`). No `src/config|ui|app` file seeds a toneLaw, or a mapper other than hatch/wireframe. **No proposed merge breaks a shipped preset.** |
| **r1 "Ground fill uses the same style system"** | **PARTLY** | The ground has no Type or Fill Style control of its own: the ground panel is On/Off only (`scene3d-panel.js:1892-1925`). It renders as a *faceted* record (`scene3d.js:3970-3973`) under the scene-style cascade. So a ground-fill vs object-fill merge is moot, because nothing is duplicated. |

**Note M1-a: code.** All three predicates are one-liners on `TONE_ALGO`:
- `adjMax` (`surface-fill.js:3242`)
- `adjStep` (`:3248`)
- `adjDarkArea` (`:3254`)
- `adjEndInset` (`:3365`)

The only other sites are `ADJ_LAWS` (`:3217`) and the shadow recipes (`shadows.js:1125, 1128`).

**Note M1-b: why the migration claim fails.** r1 wrote "Shadow: route both through the existing per-id recipes via `effectiveLaw`". That is wrong. The shadow row calls `FS.effectiveLaw(law, {})` with an **empty bag** (`scene3d-panel.js:3318`, `shell/context-bar.js:1937`), so it always returns the survivor id. After the fold, the `bundleSubNib` and `bundleLozenge` shadow recipes would become **legacy-only**. See NEW-1.

**Measured shared geometry for M1:**
- `bundleCount` → `bundleSubNib`: frac 0.464, +64 % ink.
- `bundleCount` → `bundleLozenge`: frac 0.468.

These are real constants, not overlays. On Spiral and Stipple all three are byte-identical to each other (`outD.txt`).

**Note M3: what holds and what does not.**
- *What holds.* All four ids share `splitsAlongLine` (`:2062-2068`), `wbFlatCov` (`:3181-3185`) and the `weightForArea` chassis (`:4999-5067`).
- *Overload r1 missed.* `bandProfile: taper ↔ hard` changes **three** things, not one:
  - the end taper (`taperFactor`, `:3495`);
  - **soft vs hard clamp** (`softClamp(…WB_CMIN,WB_CMAX)` at `:3502`, vs `clamp` at `:5002`);
  - the floor (0.01).

  So r1's Phase-2 composition "area = source × endTaper" does not reproduce `taperedEnds` unless the clamp shape is also a param.
- *A further difference.* `isoWidthArea` is not a `(1-c)` multiplier. It has its own reserve basis (`isoReserve()`, `ISO_THRESH`, `ISO_ALPHA`, `:3402-3407`) and needs per-sample `gradIs` (`:9274`).
- *Measured shared geometry vs whiteBand:* isophote 0.60, nib 0.53, taper 0.59. These are different pictures on one emitter, which is the expected result.

**Note M4: details.**
- **weaveDepth:** WV6 `{ph:'anti', dep:0, amp:'perp'}` (`:4408`).
- **onePenDown** differs from interlockWeave in **four** ways, not three:
  - in-phase: `wvLinePhase` returns `π·ord` only for `interlockWeave` (`:4598`);
  - no clearance cap (`:9488-9491`);
  - chained (`:9455`);
  - **and** it is not split along the line: it takes the run mean (`:4420-4422`).
- **Measured shared geometry:**
  - interlockWeave → onePenDown: frac 0.356.
  - ampSpacing → weaveDepth: frac 0.141.
- So both shipped U7/U8 options are mislabeled.

**Note T1: details.**
- **Curved shapes: CONFIRMED, exactly.** The sphere's Hatch paths are found in Crosshatch at **frac 1.000**. This held for every one of 9 laws: ladder, none, taperedEnds, bundleCount, weightModulated, ampSpacing, contFieldSigmoid and penInterleave all gave 1.000; mkTick gave 0.999. It also held under Δ60/r1, Δ90/r2 and Δ45/r0.5 (`outB.txt`, `outD.txt`). W-36c `crossShareA` did not perturb family A on this fixture. So Crosshatch really is Hatch plus extra families.
- **Faceted shapes: PARTLY.** On a box under `ladder`, the frac is 0.907. The faceted crosshatch rebalances family A.
- **Triple hatch: REFUTED as a layer count.** It is **dead under the default `ladder`**. Measured: ladder crosshatch ± `tripleHatch` gives the same md5 `c7e03cb148`. It is live only on the old dispatch: `none` goes from 3033 to 4498 mm. The reason: `contMapper` (`:12623-12650`) never reads `crossTriple`; only the legacy branch does (`:12679`). It is also tone-gated ("darkest band"), so "Layers = 3" would be a misnomer. See NEW-4.

**Note M11: details.**
- The tooltip calls `concentric` "bridged into one stroke" (`context-bar.js:737`), but `cfg.continuous` is false for it. The wording needs a check before any "Pen-down" param reuses it.
- `pen-fill.js` is used only by scene3d (`scene3d.js`, `ribbon-geometry.js`, `surface-fill.js`), so the blast radius is contained.

### r1 side-defect claims (S1–S7)

| claim | verdict | evidence |
|---|---|---|
| **S1** contFieldSigmoid loses its sigmoid under any other option | **CONFIRMED** | `sterzik()` is only on the `TONE_ALGO==='contFieldSigmoid'` branch (`:5128`). Every other id falls to the L\*-linear `cfAreaForTone` (`:5129-5130`). Measured: contFieldSigmoid → contFieldFore frac 0.412, +11 % ink. |
| **S2** perceptual rung option switches engines | **CONFIRMED** | `isEvenLadder` = ladder / fineLadder / phaseFineLadder / deepFillTSP only (`:5147-5148`). perceptualRamp returns `perceptualCov` into the discrete verdict (`:5452-5454`). |
| **S3** bandProfile mixes source + ends | **CONFIRMED, and it is wider than claimed** | It also mixes the clamp shape. See M3. |
| **S4** wave labels | **CONFIRMED** | See M4. |
| **S5** `quantised` is not a metric | **CONFIRMED** | It sits in the `fieldMetric` enum (`scene3d-tone-laws.js` STYLE_PARAMS contFieldSigmoid). `toneQuantLevels` has a clamp (`params.js:783`) but no UI. |
| **S6** spiralEccentricity is dead for the W-26 laws | **CONFIRMED (measured)** | Spiral + ladder + centroid: ecc 1 ≡ ecc 2.5 (md5 `d5c672405f`). It is live under `bboxCenter` and under `toneLaw:none`. So the control is dead only on the default path. |
| **S7** Type is inert for the 9 mono laws (Hatch ≡ Contour) | **CONFIRMED (measured, all 9)** | See note S7 below. |

**Note S7: details.**
- **Hatch ≡ Contour is byte-identical for all 9 mono laws:** etfKang, defectSplit, mezzoRegion, originSpiral, dutyConst, endShorten, turingStripe, voronoiWeb and mazeFill (`outA-*.txt`).
- **The cause:** `monoMapper` accepts hatch, crosshatch and contour (`:12574`). `emit` reads `mapper` only for the crosshatch `[0,65]` pass (`mono:2956`).
- **Extra finding:** mezzoRegion, dutyConst and endShorten read the **hidden** `fillAngle` under Contour. Contour has no Angle row (`scene3d-panel.js:420`). Measured: contour@0° ≠ contour@45°. So a value the user cannot see changes the picture.
- **Crosshatch:** Cross angle and Cross density are inert (the hard-coded 65°), as r1 said. r1-artistic §6.1 also found that the second pass double-inks on 6 of them.

---

## 2. NEW findings (not in r1)

### NEW-1: The shadow Fill Style picker has already lost 17 textures to the U1–U8 folds. Every further fold removes more. (STRONG; sharpens M12)

**Evidence:**
- The shadow `<select>` offers `FS.groups(null,null,null)`, which is `PICKER_IDS` only (`context-bar.js:396`). It writes the bare survivor id (`scene3d-panel.js:3271-3279`). It has **no sub-control**, and its `effectiveLaw` call uses `{}`.
- `clampShadowToneLaw` keeps raw folded ids only for *saved* documents (`params.js:1029-1060`).
- `shadows.js` still holds distinct recipes for 17 of the 18 folded ids. Only `onePenDown` has none. Examples: `fineLadder (0,.97)`, `bundleEased {3,.22}` (`shadows.js:1115-1135`).

**Consequence:**
- These 17 recipes are **unreachable for any new pick**. They are dead code for new work, kept only for legacy docs.
- M1, M2, M3, M5 and M6, as written, would each orphan 1–2 more recipes (bundleSubNib, bundleLozenge, isophoteWidth, contFieldSigmoid, …).
- So r1's migration line "route through effectiveLaw" cannot hold.

**Consolidation that follows.** There are three options:
- (a) Give the shadow row the same STYLE_PARAMS sub-controls, keyed `shadowToneLaw` + `shadow<Key>`.
- (b) Accept M12: the shadow offers mark class plus ≤2 numeric params, and the 17 orphan recipes become param detents.
- (c) Make the shadow row follow the object's own law.

Today's state is the worst of the three: 31 rows, with sub-variants silently lost.

**This needs Jay's ruling before any further fold.**

### NEW-2: Highlight treatments `dashed` and `dotted` are one treatment plus a line-type constant (STRONG, byte-identical)

**Evidence:**
- `hlLineType = (t) => t === 'dotted' ? 'dotted' : 'dashed'` (`scene3d.js:3887`).
- Every other branch tests `treatment === 'dashed' || treatment === 'dotted'` (`:3258`, `:4347`, `:4419`, `:4787`).

**Proposal:**
- Treatment `restyle` (on the highlight pen), plus **Highlight line type**, which reuses `STROKE_LINE_TYPES` (`params.js:587`): solid / dashed / dotted / dashdot.
- This is the exact pattern `xrayBackLineType` already uses (`scene3d.js:3800`).

**Migration:** `dashed` → `{restyle, dashed}` and `dotted` → `{restyle, dotted}`. This is byte-identical. It gains `dashdot`, and `solid` gives a pen-only highlight.

**Risk:** low.
- No preset uses `highlightTreatment` (grep of `user-presets/` and `src/config/user-presets.js`).
- `keep` → `none` already sets the alias precedent (`params.js:614`).

### NEW-3: Highlight `sparse` and `stippleOut` are one "thin the glint" treatment with a granularity param (MEDIUM)

**Evidence:**
- Both share `thinHL`, the same `highlightDensity` and the same routing.
- They differ only in the keep test: per-ruling `lineIndex % sparseStep` vs per-sample `ldHash < stippleKeep` (`scene3d.js:3264-3306` lightDriven; `:4411-4417` perFace).

**Proposal:** treatment `thin` + **Thin by**: ruling / sample. This is byte-identical by construction.

**Possible extension:** `blank` is the limit of "thin, keep 0". It is not byte-identical, so keep it separate.

### NEW-4: Triple hatch is dead under the default Fill Style (DEFECT; blocks T1's "Layers 3")

**Measured:** ladder crosshatch ± `tripleHatch` gives the same md5 (`outD.txt` L). It is live for `none`.

**Cause:** the `contMapper` crosshatch branch (`surface-fill.js:12632-12650`) has no third pass. Only the legacy branch reads `crossTriple` (`:12679`). The same applies to every contField law, and to every `isEvenLadder` law: ladder, fineLadder, phaseFineLadder and deepFillTSP.

**Effect on merges:**
- The row is a dead control on the default path.
- Any "Layers 1/2/3" consolidation must first port the third pass to `emitContFamily`, or gate the toggle off.

### NEW-5: The "— no effect here" gating on Spiral/Stipple is false, and folds have already stripped gating from sub-options (DEFECT; affects every fold)

**(a) The inert list is wrong on the fixture I measured.** `CURVED_SPIRAL_STIPPLE_INERT` (`context-bar.js:551-565`) greys 45 ids as drawing like Ladder. On a curved sphere under Spiral and under Stipple, they **do not** draw like Ladder. They collapse into about 8–10 distinct pictures, grouped by engine family (`outD.txt` J):
- {ladder, deepFillTSP}
- {perceptualRamp, lozengeStipple}
- {taperedEnds, whiteBand}
- {bundleCount, bundleSubNib, bundleLozenge, contFieldSigmoid, contFieldSurface (+ penInterleave on Spiral)}
- {mkTick, mkDotScreen}
- weightModulated, ampSpacing, interlockWeave and penCross each alone.

So a user who has one of these stored sees a different picture from Ladder, while the picker says "no effect".

This is one fixture (sphere, sun at 200/55). Confirm on the W-03 fixture before acting. It contradicts C-09…C-13 as shipped.

**(b) The fold sub-selects are not reachability-gated** (`scene3d-panel.js:698-708`, which renders `d.options` raw).
- Example: on pyramid + Hatch, `fineLadder` was a greyed row (`context-bar.js:609`). Measured: `ladder{rungMode:'fine'}` ≡ `ladder` there (md5 `df3a05ce9d`). Yet the "Fine rungs" option is offered live.
- Every future fold moves rows from a gated list into an ungated sub-select.
- **Required before more folds:** run `isReachableOn(option.law, …)` per sub-option.

### NEW-6: "Closest approach" is one concept under three keys, plus constants (MEDIUM, UI/vocabulary)

The same quantity, "how close may neighbouring marks get", appears as:

| where | expressed as | values |
|---|---|---|
| contField `fieldFloor` | tight pitch | `plot` = plot floor / `touch` = ink width (`surface-fill.js:5106-5108`) |
| bundle (r1 M1 "Pass step") | step | `abut` = 1 ink / sub-nib = 0.55 ink, overlapping (`:3247-3248`) |
| WV6 `cFlo` | clearance floor | 0.8 / 1.0 / 1.4 plot floors (`:4402-4411`) |

**Proposal:** one shared descriptor label and value set, **Closest approach**: plot floor / touching / overlapping. It applies to each survivor that has the axis.

This is a naming consolidation. It is not a byte merge. It keeps M1 from inventing a fourth vocabulary.

### NEW-7: "Cross angle" has five hard-coded sources and only one user control (MEDIUM; partly r1-artistic P-04)

| source | angle |
|---|---|
| `crossAngleDelta` (user) | 90 by default |
| mono crosshatch | 65, fixed (`mono:2956`) |
| triple pass | +32 (`surface-fill.js:12679`) |
| penCross | +60/div 2 (`:4176`) |
| penReserve | +90/div 1 (`:4177`) |
| shadow CROSS_B/C | 65/32 (r1-artistic) |

r1-artistic proposes *new* keys. A consolidation view says the opposite: one "second-family angle" concept. Two options:
- Read `crossAngleDelta` wherever a crossing family exists, which is a Phase-2 baseline change.
- Or show the effective angle read-only.

**Not byte-identical.** penCross on hatch ≠ penInterleave on crosshatch (Δ60, r2); shared geometry 0.38.

### NEW-8: Contour is a duplicate of Hatch for 9 laws; drop the row for them (STRONG, measured)

This follows from S7.
- For the 9 mono laws, Type=Contour gives output byte-identical to Type=Hatch.
- 3 of those laws also read an invisible angle.

**Proposal:** mark Contour unreachable for mono laws in `isReachableOn`, and point it at Hatch. Or make Contour feed them a chart-axis seed. Either way, the Type picker should not offer two identical pictures.

**Cheapest fix:** add the 9 ids to a `CONTOUR_INERT` list beside `CURVED_SPIRAL_STIPPLE_INERT`.

### Gap-hunt angles checked with no new merge found

- **Spiral Type vs Contour.** Different generators (measured; r1 T3 holds).
- **Stroke Fill vs Types.** The vocabulary overlaps (spiral / concentric vs Type spiral / contour), but they work at different scales (inside one ribbon vs the whole surface). No merge.
- **Ground vs object fill.** Nothing is duplicated (§1).
- **Density / pen / line-type triples:**
  - `shadowDensity`, `highlightDensity`, `xrayBackDensity`
  - `shadowPenId`, `highlightPenId`, `xrayBackPenId`
  - `shadowLineType`, `xrayBackLineType`

  These are the same concepts under per-channel keys (`params.js:479-483`, `:700-722`). They are legitimately per-channel. A shared "mark spec" sub-object would be a refactor, not a style merge. Low value.
- **mk\* shapes across classes.** r1 §3 holds.

---

## 3. Saturation judgement

- **Fill Style merges (law → law): saturated.** Round 2 found no new law-to-law fold. Every same-engine pair is now on r1's list or was already folded. The remaining engine-sharing pairs measure as distinct pictures (shared geometry 0.14–0.60), or cross mark classes.
- **Material new results came from adjacent axes:**
  - NEW-1: shadow picker orphaning;
  - NEW-2/3: highlight treatments;
  - NEW-4/5/8: reachability defects that any fold must respect.
- **Would another round find more?** A round 3 on Fill Style/Type merges would probably not find more. A round 3 aimed at the *other Style sub-settings* (highlight, X-ray, edge styles, shadow layers) might find 1–3 more small enum-plus-constant folds like NEW-2.
- **Recommendation:** stop merge hunting on laws. Resolve NEW-1, NEW-5b and NEW-4 before landing M1–M6, because each of them changes what a fold costs.
