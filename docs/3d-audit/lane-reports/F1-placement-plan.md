STATUS: MEASURED — mechanism FOUND, located to file:line, prototyped twice with before/after numbers. F1 is a **ruling-placement** defect (not "between ribbon *stretches*"), it is **not** pen-unreachable, and the A3 split oracle is a GUARD here, not the oracle. Plan ready for an implementer; base sha must be re-derived (the lane has moved past `3c88605f`).

# F1-placement — planner brief

**Planner (read-only), 2026-09-05.** Lane `fill-audit-a`.
Worktree `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a` — **not touched, not stashed, not committed to.** All work ran in a scratch export at
`/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad/faa-3c88605f`
(`git archive 3c88605f | tar -x`, `node_modules` symlinked from main, `package.json` 1.3.98). Scratch scripts: `patch-dbg.js` (behaviour-neutral instrumentation), `f1diag.js` (blank map + gap census + attribution), `f1split.js` (A3 split oracle), `f1seam.js` (family-wrap check). Raw outputs `f1diag-base2.json`, `f1diag-snap.json`, `f1diag-local.json`, `f1split-base.json`, `f1split-snap.json`, `f1seam.out`. Throwaway — nothing to commit.

## 0. Worktree state — read this before starting

`fill-audit-a` is **no longer at `3c88605f`**. At the time of writing:

- `git -C <worktree> rev-parse HEAD` = **`67c9752c`** ("T1 (W-05b/W-06b plan U1) — chart-walked marks: mkTick/mkDashRamp…"), with `3c88605f` as an ancestor.
- The tree is **DIRTY**: `M src/core/scene3d/surface-fill.js` (+54/−6) and untracked `tests/unit/zzz-probe1.test.js` — someone else's in-flight unit.

Consequences, non-negotiable:

1. **F1-placement must serialize behind that unit.** Two implementers in `surface-fill.js` in one worktree is the exact collision `CLAUDE.md` forbids. Do not start until the tree is clean.
2. **Every RED number in §4 was measured at `3c88605f` and must be re-derived at your own base sha.** The intervening change is in the MARK-law path (`isMarkLaw()`, `mkTick`/`mkDashRamp`), which is disjoint from the wave/ribbon coverage path this unit touches, so the numbers are expected to carry — but "expected" is not "measured".

## 1. The mechanism, in one paragraph

For the five F1 laws the fill is a family of rulings **subset off a fixed master grid** by a Sturmian phase accumulator, and for three of them the coverage that drives that accumulator is a **constant with no radiance term at all**. `weightCovAt` (`src/core/scene3d/surface-fill.js:4273`) falls through to `weightBaseCov()` (`:4303`), whose `isWaveLaw()` branch (`:2637`) returns **`wvFlatCov()`** (`:3910`) — a function that takes **no arguments**: `masterPitch / (wvPitchPen() * inkWidth())`, i.e. one number for the whole object. That number reaches the drop decision through `algoCoverage` (`:4818`) → `covAtSample` (`:7903`) → `spanDrops` (`:7313`) → `ladderKeeps` (`:6218`) → **`ladderStep` (`:1289`)**, a phase accumulator seeded at `LADDER_PHASE0 = 0.5` (`:1281`). The file's own comment at `:6199-6206` states the consequence: *"at a constant coverage the gaps are exactly floor(1/c) and ceil(1/c) … and also perfectly PERIODIC."* On the default torus at Density 50, `c = 0.44803` so `1/c = 2.232`, and the kept-index gap multiset is **{2×7, 3×2}** — one gap in four is **50 % wider than its neighbours with literally zero tone behind it**, because the coverage has no tone in it. On top of that the accumulator advances **one grid index per ruling**, never by screen distance, even though `covAtSample` already holds the projection-correct `localPitch` (`perpPitch`, `:5100`) and hands it to `weightCovAt` — which ignores it. So a family whose visible rulings differ by 4.4× in length and cluster non-uniformly on screen is subset as if it were uniform. The two effects together put a **41.7 mm × 6.6 mm, 62.6 mm² bare strip** across the lower front of the torus — 5 % of the visible surface, and 30× the *entire* `ringNotInkMm2` residue A3 measured.

## 2. What "between ribbon stretches" actually means — a correction to the routing note

The A3 judge routed F1 here as "the blank lies **between ribbon stretches**". In this file a **stretch** is something else: `ribbonizeCore` cuts **one ruling** into maximal same-width-class sub-segments at `:6544-6572` (`classAt` / `stretches` / `merged`, classes `CLS_CENTRE`/`CLS_WALLS`/`CLS_RIBBON` at `:6543`). Measured on `interlockWeave`: 16 CENTRE stretches (25.0 mm of arc), 31 WALLS (39.2 mm), 33 RIBBON (**603.3 mm**) — 90 % of the ribbon arc is one class, and the blank clusters are **not** at class boundaries.

The blank is **between consecutive RULINGS of the family**, and specifically in the slots of rulings the span verdict **dropped**. Attribution over the whole front region (`f1diag.js`, blank = distance-to-nearest-ink > 0.8 mm on a 0.1 mm raster):

| law | ruling samples in blank belonging to **dropped** rulings | to **kept** rulings | share dropped |
|---|---|---|---|
| interlockWeave | 353 | 35 | **91 %** |
| trochoidLoop | 335 | 39 | **90 %** |
| ampSpacing | 133 | 74 | 64 % |
| taperedEnds (control) | 169 | 31 | 85 % |

And the largest cluster is unambiguous — `interlockWeave`, 62.63 mm², 41.7 × 6.6 mm, centroid (151.6, 88.8): **77 dropped-ruling samples inside it, 0 kept-ruling samples.** It is the slot of dropped rulings 0 (54 samples) and 17 (21).

**Therefore stretch-to-stretch overlap cannot reach F1** and must not be attempted (see §7, Fix D).

## 3. Where the blanks are, in world space, and the proof of the drop model

Torus, default 3/4 camera (yaw −30 / pitch 20), `hatch`, Density 50, pen 0.30 mm, `inkWidth()` 0.336, `masterPitch` **1.50538**, `N` 25, family `A#0` emits **18 rulings** (lineIndex 0…17), region 1223.97 mm².

**3.1 The drop set is predicted exactly.** Running `ladderStep` by hand from `phase = 0.5`, `cov = 0.44803`: drop {0, 2, 4, 6, 8, **9**, 11, 13, 15, 17}, keep {1, 3, 5, 7, 10, 12, 14, 16}. Measured drop set from the instrumented build: **{0, 2, 4, 6, 8, 9, 11, 13, 15, 17}** — identical, ruling for ruling. Interior gaps {2×6, 3×1}; the double drop at 8–9 is the 3-gap.

**3.2 The family is CLOSED and both seam rulings are dropped.** `f1seam.out`: `minDist(ruling 0, ruling 17) = 0.353 mm` (versus `minDist(0, 2) = 1.518 mm`) — rulings 0 and 17 are geometric neighbours across the parameter wrap. Both are dropped, so the seam gap is also **3** index units. `spanDrops` has explicit wrap handling for the seam **along** a ruling (`:7328`, "THE PARAMETER SEAM IS NOT A SPAN BOUNDARY") and **none** for the wrap **across** the family: `ladderPhase` is keyed by family and simply runs out at the last index.

**3.3 The widest gap lands in the darkest region.** Per-ruling mean radiance (`f1seam.out`): ruling 8 `I = 0.407`, ruling 9 `I = 0.277` — the darkest band of the object — and both are dropped, giving the 3-gap there. The ruling lengths are wildly non-uniform (front sample counts 41 … 180, a 4.4× span) and the centroids of rulings 11–17 crowd inside (132–137, 82–85) while rulings 3–8 spread across (155–161, 76–83). An index-based subset of that family cannot be even on screen.

**3.4 The blank map (0.1 mm raster over the front region, base = `3c88605f`).**

| law | region mm² | max blank half-width | blank > 0.8 mm | (% region) | > 1.5 mm | > 2.0 mm | clusters | **largest cluster** |
|---|---|---|---|---|---|---|---|---|
| interlockWeave | 1223.97 | **2.94 mm** | 153.76 mm² | 12.6 | 37.12 | 11.89 | 27 | **62.63 mm², 41.7 × 6.6 mm** |
| onePenDown | 1223.97 | **3.21 mm** | 157.78 | 12.9 | 36.65 | 14.70 | 29 | **48.74 mm², 30.2 × 4.2 mm** |
| trochoidLoop | 1223.97 | **3.10 mm** | 150.61 | 12.3 | 34.70 | 12.15 | 22 | **62.87 mm², 41.7 × 6.3 mm** |
| ampSpacing | 1223.97 | 1.85 mm | 86.58 | 7.1 | 1.23 | **0.00** | 24 | 24.69 mm², 35.1 × 5.7 mm |
| weaveDepth | 1223.97 | 1.80 mm | 55.60 | 4.5 | 3.17 | **0.00** | 31 | 13.55 mm², 10.6 × 4.7 mm |
| *taperedEnds* (control) | 1223.97 | 2.65 mm | 226.08 | 18.5 | 33.57 | 11.34 | 55 | 62.49 mm², 40.9 × 18.8 mm |

Read this table carefully — it is the trap the A3 judge warned about:

- **The eye-visible band belongs to the THREE flat-coverage laws** (`interlockWeave`, `onePenDown`, `trochoidLoop`): a single 40 mm strip, 6 mm wide, blank to a depth of 2.9–3.2 mm.
- **`ampSpacing` and `weaveDepth` do NOT have it.** Their `>2.0 mm` blank is **0.00 mm²** at base. Their coverage is a genuine tone field (`wv6SpaceCov`, `:4170`), so their gap variation tracks tone. They belong in the fixture as *controls that must not move*, not as defect subjects.
- **The `taperedEnds` control has MORE total blank than any of the five** (226 mm², 18.5 %) and its largest cluster is the same 62 mm². A naive "largest blank cluster ≤ X" bar over the whole gallery would flag the control harder than the defect. The control's cluster is a 40.9 × **18.8** mm branched blob at depth 1.64 mm; the defect's is a 41.7 × **6.6** mm strip at depth 2.78 mm. The control carries the *same* defect through a *different* coverage function (`wbFlatCov()`, `:2640-2646`, flat at 0.6347 → `1/c = 1.576` → gaps {1×4, 2×6}, ratio 2.00) which is **outside this unit's file scope** — log it, do not fix it here (§9).

**3.5 Located in document coordinates** (for the bench look and for any bespoke capture):
`interlockWeave` largest band centroid **(151.6, 88.8)**, x ≈ 130.7 → 172.4, y ≈ 85.5 → 92.1 — the strip running left-to-right across the lower front, immediately beneath the inner hole. Second cluster 33.54 mm², 15.1 × 4.6 mm at **(126.5, 82.2)**, depth **2.94 mm** — the left inner rim. `trochoidLoop`'s two largest are the same two locations (62.87 at (151.1, 88.6); 32.02 at (126.2, 82.2)). Both are plainly visible in `docs/3d-audit/fill-audit/after/W-26/shots/B/torus__hatch__trochoidLoop__med__a.webp` and `…interlockWeave__med__a.webp` as a bare strip under the hole, and both correspond to the red bands in `docs/3d-audit/lane-reports/A3-judge-evidence/interlockWeave-blank.png`.

## 4. Why W-26's continuous placement does not govern these laws — measured, not inferred

`contMapper` (`:10441`) is
`(isContField() || (isEvenLadder() && useLadder && STAGE.masterGrid)) && toneOn`,
and `emitContFamily` (`:9275`) is reached **only** through it (call sites `:10463-10477`). `isContField()` (`:4466`) tests `CONT_LAWS`; `isEvenLadder()` (`:4530`) tests exactly `ladder` / `fineLadder` / `phaseFineLadder`. **None of the five ribbon laws is in either set**, so every one of them takes the `else` branch — the discrete master-grid subset — and never touches W-26's walk. `algoCoverage` even short-circuits the ladder family to a flat `1` at `:4756` ("`isEvenLadder()` → return 1") precisely so *nothing downstream drops a ruling* for them; the wave laws keep the drop channel.

Independently confirmed numerically: W-26's own addendum measured all ten `torus__hatch__{5 laws}__{med,max}` cells **byte-identical** before/after, and I reproduced the A3 split oracle at `3c88605f` to the digit against W-26's table (`interlockWeave` 2.01375 / 0.140625 / 1.873125 / 146 clusters). W-26 could not have moved F1.

## 5. Two prototypes, both measured in scratch

Both are env-gated one-place changes in the wave laws' **own** placement-coverage path. Neither touches `emitContFamily`, `spanDrops`, `ladderStep`, or the master grid at `:5084-5157`.

**Prototype A — "SNAP":** in `wvFlatCov()` (`:3910`), snap the flat reserve to a reciprocal integer, `c → 1/round(1/c)`. Rationale: on a Sturmian accumulator a coverage of exactly `1/k` produces the single gap `k`, so a law with no tone gradient draws a genuinely even field.

**Prototype B — "LOCAL":** in `weightCovAt`'s wave fallthrough (`:4303`), state the flat reserve against **`localPitch`** (already a parameter, already projection-correct) instead of the global `masterPitch`: `c = localPitch / (wvPitchPen() * inkWidth())`, guarded to `isWaveLaw() && !isWv6()`. Rationale: this makes the accumulator advance by **screen distance** rather than by grid index — the same quantity `emitContFamily`'s walk integrates — without routing through it.

| law | variant | cov | kept | index gaps | blank>0.8 mm² | >1.5 | **>2.0** | **largest cluster** | max half-width | ink mm | `wide` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| interlockWeave | BASE | 0.4480 | 8 | {2×6, 3×1} | 153.76 | 37.12 | **11.89** | **62.63 (41.7×6.6)** | 2.94 | 4796 | 33 |
| | SNAP | 0.5000 | 9 | **{2×8}** | 88.81 | 10.71 | 1.98 | **22.77 (11.3×4.3)** | 2.44 | 4680 (−2.4 %) | 34 |
| | LOCAL | 0.4480 | 9 | {1×1, 2×6, 3×1} | 168.35 | 20.10 | **0.28** | 45.80 (29.7×7.1) | **2.12** | 4538 (−5.4 %) | 40 |
| onePenDown | BASE | 0.4480 | 8 | {2×6, 3×1} | 157.78 | 36.65 | **14.70** | **48.74 (30.2×4.2)** | 3.21 | 4978 | 10 |
| | SNAP | 0.5000 | 9 | **{2×8}** | 110.20 | 11.33 | 1.78 | 22.40 (21.0×3.7) | 2.40 | 4843 (−2.7 %) | 12 |
| | LOCAL | 0.4480 | 9 | {2×8} | 124.35 | 6.68 | **0.00** | 28.38 (14.0×6.3) | **1.93** | 4691 (−5.8 %) | 16 |
| trochoidLoop | BASE | 0.4480 | 8 | {2×6, 3×1} | 150.61 | 34.70 | **12.15** | **62.87 (41.7×6.3)** | 3.10 | 5267 | 53 |
| | SNAP | 0.5000 | 9 | **{2×8}** | 87.21 | 9.74 | 1.94 | 22.37 (11.9×4.3) | 2.40 | 5054 (−4.0 %) | 63 |
| | LOCAL | 0.4480 | 9 | {2×8} | 97.14 | 7.50 | **0.00** | 28.49 (13.7×6.4) | **1.97** | 4989 (−5.3 %) | 55 |
| ampSpacing | BASE | 0.4480 | 14 | {1×9, 2×4} | 86.58 | 1.23 | 0.00 | 24.69 | 1.85 | 4768 | 54 |
| | SNAP | 0.5000 | 15 | {1×11, 2×3} | 43.11 | 1.24 | 0.00 | 12.56 | 1.85 | 5283 (**+10.8 %**) | 58 |
| | LOCAL | 0.4480 | 14 | {1×9, 2×4} | **86.58 (identical)** | 1.23 | 0.00 | **24.69 (identical)** | 1.85 | **4768 (identical)** | 54 |
| weaveDepth | BASE | 0.4480 | 15 | {1×11, 2×3} | 55.60 | 3.17 | 0.00 | 13.55 | 1.80 | 4760 | 30 |
| | SNAP | 0.5000 | 15 | {1×11, 2×3} | 60.95 (**worse**) | 2.67 | 0.00 | 12.53 | 1.83 | 4702 | 34 |
| | LOCAL | 0.4480 | 15 | {1×11, 2×3} | **55.60 (identical)** | 3.17 | 0.00 | **13.55 (identical)** | 1.80 | **4760 (identical)** | 30 |
| taperedEnds | BASE / SNAP / LOCAL | 0.6347 | 11 | {1×4, 2×6} | 226.08 in all three | 33.57 | 11.34 | 62.49 | 2.65 | 3779 | 14 |

Verdicts from the numbers:

- **LOCAL is the mechanism-correct fix and the correctly-scoped one.** It kills the deep blank outright (`>2.0 mm` 11.89 / 14.70 / 12.15 → **0.28 / 0.00 / 0.00 mm²**), pulls the max blank half-width from 2.94–3.21 mm to 1.93–2.12 mm, spends **less** ink (−5.3 to −5.8 %), raises `wide` (33→40, 10→16, 53→55 — no coverage bought by thinning), and leaves `ampSpacing`, `weaveDepth` and `taperedEnds` **byte-identical**.
- **SNAP is better on total blank area and largest-cluster area** but, as prototyped inside `wvFlatCov()`, it **leaks into the WV6 laws** (that function also seeds `wv6SpaceCov` at `:4172`, `wv6SplitCov` at `:4191`, and the interlock anti-phase ordinal at `:3971`): `ampSpacing` ink **+10.8 %**, `weaveDepth` blank **worse**. A shippable SNAP must live in a **new `wvPlaceCov()`** used only by the `weightBaseCov()` placement branch.
- **Neither prototype reaches zero.** After the best of them the largest bare cluster is still 22–46 mm² and 11–30 mm long. See §6 for the reason and §9 for the sibling unit that owns the rest.

## 6. What placement alone cannot fix — the second half of F1

The three defective laws are **pre-Round-6** and never got Round 6's amplitude floor. `wvAmpAsk` (`:3941`) returns, for them, `k * WV_AMAX` where `k = wvRamp(I)` (`:3917`) is **exactly 0 for every `I ≥ WV_I0 = 0.62`**. So over the lit half of the torus the "weave" is a **straight, thin, plain ruling** at a 3.36 mm reserve, and a 3 mm white stripe is then geometrically unavoidable however evenly the rulings are placed. Round 6 fixed precisely this for the WV6 laws with `aFlo` (0.14–0.46 of the drawn pitch) and `WV6_AFLOOR_MIN = 0.10` (`:3839`, `:3847-3870`) — and the file's own header says so: *"A plain ruling in the highlight is the defect Jay named, not a feature."* The four older wave laws (`interlockWeave`, `trochoidLoop`, `onePenDown`, `amplitudeOnly`) were left behind.

The measurement corroborates it: the two laws that **do** have the floor (`ampSpacing`, `weaveDepth`) already measure **0.00 mm²** of `>2.0 mm` blank at base, while the three without it measure 11.9–14.7 mm².

**This is a sibling unit, not this one** — see §9, F1-amp. Say so in the report so nobody reads a placement-only GREEN as "F1 closed".

## 7. Ranked fixes

**Fix 1 — LOCAL (recommended).** `weightCovAt` (`:4273-4303`): add, immediately before `return weightBaseCov();`, a branch for `isWaveLaw() && !isWv6()` that returns `clamp(localPitch / (wvPitchPen() * inkWidth()), env.covLight, env.covDark)` when `localPitch` is finite and positive. Prefer expressing it as a named `wvPlaceCov(localPitch)` beside `wvFlatCov()` with a load-bearing comment, so `wvFlatCov()` keeps its other three consumers untouched. Measured in §5. Guard: fall back to `weightBaseCov()` when `localPitch` is not finite (crossed/screen-frame families hand `pitchStep`/`lineDir` as functions of `tt`; `pitchAtStep` can return null).

**Fix 2 — SNAP, re-scoped (complementary, measure the 2×2).** A new `wvPlaceCov()` that snaps the reserve to `1/round(1/c)`. Best on total blank area and largest cluster. **Must** be swept before shipping: `round(1/c)` moves the reserved pitch by up to a factor 1.5 when `1/c` approaches 1.5 (masterPitch ≈ 2.24 mm), i.e. at low density or on a large object, which is an ink-explosion risk that the torus-at-50 fixture cannot see. Combine with Fix 1 (snap the **local** ratio per ruling) and measure; take whichever of {LOCAL, LOCAL+SNAP} wins on both `>2.0 mm` blank and largest-cluster area without breaking the ink bound.

**Fix 3 — route the flat-coverage wave family through `emitContFamily` (principled, out of scope as briefed).** Extend `contMapper`'s gate (`:10441`) so a law whose placement coverage is constant uses the continuous walk with `wantedPitch = wvPitchPen() * inkWidth()`. This is the same mechanism as Fix 1 but done properly and it also removes the drop channel entirely. **It requires the orchestrator to widen the file scope** (it changes what feeds W-26's engine even though it does not change the engine) and it carries W-26's own measured blast radius: when the ladder family moved onto that engine, whole-object ink swung −47 % to +36 % on six gallery cells. Do not take this without an explicit scope grant and a full re-shoot.

**Fix 4 — seam-aware family phase (small, additive, do it whichever fix wins).** On a closed family, `ladderPhase` should not simply run out at the last index. Today rulings 0 and 17 are neighbours (0.353 mm apart) and both drop, so the seam gap is the family's widest. `spanDrops` already has the along-line equivalent at `:7328`. Cheapest honest version: assert the closed-family gap multiset includes the seam gap (that is what RED-1 does) and let Fix 1/2 satisfy it; if it does not, seed the phase so the seam gap equals the modal interior gap.

**Fix D — REJECTED: stretch-to-stretch overlap / ribbon-family pitch rule inside `ribbonize`.** 90 % of the ribbon arc is a single `CLS_RIBBON` stretch (603 of 667 mm on `interlockWeave`) and 91 % of blank-adjacent ruling samples belong to **dropped whole rulings**, with the largest cluster containing **zero** kept-ruling samples. Nothing in `ribbonizeCore` (`:6320-6830`) can widen a ribbon into a slot where no ruling was ever emitted. Do not spend the unit there.

**Fix E — REJECTED: shrink the erosion / let ink outside the ribbon.** Already closed by A3 §4 on construction: covering a convex corner needs ink `r(csc(θ/2) − 1)` outside the tested boundary, which is defect D2 restored. Irrelevant to F1 anyway (§8).

## 8. Is any of the blank legitimately pen-unreachable? — explicit answer

**No. None of the F1 band is pen-unreachable, and none of it is tone-legitimate.** Three independent reasons:

1. **Geometry.** The band is 41.7 mm long and blank to a depth of 2.78–2.94 mm, i.e. **up to 5.9 mm wide** on front-facing surface. A 0.3 mm pen needs 0.15 mm of clearance. A3's unreachable class is convex-corner wedges of depth 0.062 mm (90°) to 0.43 mm (30°) — three orders of magnitude smaller, and *inside* a ribbon polygon. The F1 band lies **entirely outside** the ring-coverage denominator (it is a slot where no ribbon was built at all), which is exactly what the A3 judge said and what makes `ringNotInkMm2` blind to it.
2. **Tone.** For the three defective laws the placement coverage is a **constant** (`wvFlatCov()` takes no radiance argument). A gap 50 % wider than its neighbours therefore has, provably, no tone justification — which is the user's own rule verbatim ("must not have irregular gaps unless they're required to create a perceptual gradient of light and shadow", quoted at `:4517-4519`). Worse, the widest gap lands at rulings 8–9, mean radiance 0.407 / 0.277 — **the darkest band of the object**.
3. **Falsifiability.** Both prototypes remove most of it with **less** ink, so it is not a plot-floor or ink-budget necessity either.

**What IS legitimately unreachable, and must be reported to the user once so it stops being re-filed as F1:**

- A3's residue *inside* the ribbons — 0.87–2.06 mm² per law, of which **89–98 % is convex-corner wedges no 0.3 mm pen can enter while staying inside the clipped ribbon**, plus sub-two-pen necks. Permanent, correct, and invisible at tier-A zoom (largest cluster 0.107 mm², 0.45 × 0.30 mm).
- The lit end of a genuine tone ramp. `ampSpacing` and `weaveDepth` already measure **0.00 mm²** of `>2.0 mm` blank; their remaining blank is the spacing field doing its job. **These two laws should be reported to the user as tone-correct**, not fixed.
- One thing worth telling the user separately: at **Density 100** (`max`), `ampSpacing` and `weaveDepth` report `wide === 0` in their own gallery manifest (`after/W-26/manifest.B.1-1.jsonl`) — no ribbon is built at all, only wall rings — so the variable-width claim is inert for those two at the top of the density range. That is a different finding, not F1.

## 9. Sibling units this planner found and is NOT folding in

- **F1-amp (recommended next, and probably what finally satisfies the eye).** Back-port Round 6's `aFlo` amplitude floor to the four pre-Round-6 wave laws so the weave does not straighten to a plain ruling above `WV_I0 = 0.62` (`wvAmpAsk`, `:3941-3958`). Evidence in §6. Same file, same lane — must be serialized after F1-placement, not merged into it, because it changes texture rather than placement and needs its own ink/clearance measurement (`waveStat.ampMeanLit`, already reported at `:11050-11056`, is the ready-made oracle: it is the "waviness throughout" number and it is near zero for these four laws today).
- **`wbFlatCov` siblings.** `taperedEnds` and the other `wbFlatCov()` laws (`:2640-2646`) carry the *same* flat-coverage Sturmian defect at a *worse* ratio (2.00 vs 1.50) — measured 226.08 mm² of blank > 0.8 mm, largest cluster 62.49 mm². Out of this unit's scope; log as its own W-id.
- **`insetMultiPolygon` swallowed-failure ladder.** Still open from A3 §7; reproduced again here (one `union` failure per `trochoidLoop` render, and a *second*, different failure — `"Unable to complete output ring starting at [130.003, 71.247]"` — appears under Prototype B, which means the prototype changes the geometry enough to hit a new degenerate case. Not a regression the prototype introduced; a robustness gap it exposed. Record it.)
- **A3 follow-up (2) is still owed:** the cluster-shape oracle's `crossWidthMm > 0.30` bar has one grid cell of margin.

## 10. RGR — the RED oracle, with bars I can defend

Two new gating oracles plus a set of pinned diagnostics. Fixture: default `scene3d` layer, `primitive: 'torus'`, `style.mapper: 'hatch'`, `style.params.toneLaw: <law>`, default camera, default density (=50), pen 0.30 — identical to `tests/unit/scene3d-ribbon-f1b-streaks.test.js`'s `beforeAll`, so the two files stay comparable.

New file: `tests/unit/scene3d-ribbon-flat-field-placement.test.js`. Subjects **`interlockWeave`, `onePenDown`, `trochoidLoop`**. Controls that must not move: **`ampSpacing`, `weaveDepth`, `taperedEnds`**.

**RED-1 (gating) — a tone-free coverage must draw a gap-uniform closed family.**
Two-part, and part (a) is what makes part (b) honest:
 (a) **prove the coverage is flat** — sample the law's placement coverage across the family's rulings and assert its coefficient of variation is < 1e-9. (At `3c88605f` every ruling reads 0.44803108233922434.) A law whose coverage is *not* flat is exempt from (b) by construction, which is how `ampSpacing`/`weaveDepth` stay out of the bar without special-casing them by name.
 (b) assert `maxGap / minGap ≤ 1.15` over the kept-ruling gap multiset of the **closed** family (interior gaps **plus** the wrap gap `nRulings − lastKept + firstKept`).
 - **RED at `3c88605f`: 3/2 = 1.50** for all three laws (multiset {2×7, 3×2}).
 - **GREEN, Prototype A: 2/2 = 1.00** (multiset {2×9}).
 - **Bar justification: 1.15 is this file's own existing bar for this exact defect** — W-26's R1a in `tests/unit/scene3d-ladder-uniform-field-spacing.test.js`, measured there at 2.02/2.00/2.00 against 1.15. It is not invented for this unit. On an integer gap multiset the only passing value is 1.00, so the bar cannot be crept.
 - Under Prototype B the index gaps are legitimately non-uniform (that is the point — screen-even, not index-even), so if the implementer ships B, RED-1(b) must be restated on the **drawn perpendicular gap** rather than the index gap, with the bar kept at 1.15 and the measurement method stated. **Do not restate it on a quantity you have not first shown RED at.**

**RED-2 (gating) — the user-visible band.**
Over the front-facing region (the `clipRings` argument `ribbonize` passes to `RibbonGeometry.clipMultiPolygonToRegion`; capture it the way `captureClipGroups` captures the subject), rasterise at 0.1 mm, compute distance-to-nearest-ink (ink stroked at its own pen width), take 4-connected components of `{in region ∧ dist > 0.8 mm}`, and assert for each subject law:
 - **largest component area ≤ 32 mm²**, and
 - **largest component bbox longest extent ≤ 25 mm**, and
 - **`dist > 2.0 mm` area ≤ 3.0 mm²**.
 - **RED at `3c88605f`:** 62.63 / 48.74 / 62.87 mm²; extents 41.7 / 30.2 / 41.7 mm; `>2.0` 11.89 / 14.70 / 12.15 mm².
 - **GREEN, Prototype A:** 22.77 / 22.40 / 22.37 mm²; extents 11.3 / 21.0 / 11.9 mm; `>2.0` 1.98 / 1.78 / 1.94 mm².
 - **GREEN, Prototype B:** 45.80 / 28.38 / 28.49 mm² (**A wins the area bar**); extents 29.7 / 14.0 / 13.7 mm; `>2.0` 0.28 / 0.00 / 0.00 mm² (**B wins the depth bar by a mile**).
 - **Bar justification.** 32 mm² sits 40 % above Prototype A's worst green (22.77) and 48 % below the best red (48.74). 25 mm sits 19 % above A's worst green extent (21.0) and 17 % below the best red extent (30.2). 3.0 mm² sits 52 % above A's worst `>2.0` green (1.98) and 75 % below the best red (11.89). **All three bars sit strictly between two measured populations with ≥17 % margin on both sides.** If the implementer ships B rather than A, the area bar must be raised to a value B actually meets **and the raise must be disclosed under `## Bars changed` with B's number** — or, better, ship A+B and meet 32 with both.
 - **Mandatory disclosure in the test and the report:** `taperedEnds` measures **62.49 mm² / 40.9 mm** on this same oracle and is **not** gated by it, because its flat coverage comes from `wbFlatCov()` — a different function, a different W-id (§9). Put that number in the assertion message so nobody later "discovers" it and widens the bar.

**Pinned diagnostics (non-gating, recorded with values):** per law, `blank>0.8 / >1.5 / >2.0 mm²`, max blank half-width, cluster count, whole-object ink mm, `lastRibbonStats.{wide, wallRings, ribbons, degenerate}`, the flat coverage value, `masterPitch`, `N`, and the kept/dropped ruling index sets. The dropped-index set is the single most diagnostic artefact in this unit — it is what let the Sturmian model be confirmed ruling-for-ruling — so pin it.

**Anti-vacuity.** Gate the fix behind `makeMultiFilePreShaRuntimeOptions(<base sha>, 'VECTURA_PRE_F1P', ['src/core/scene3d/surface-fill.js'])` exactly as `scene3d-ribbon-f1b-streaks.test.js` does with `VECTURA_PRE_F1B`, and show the same file RED under that env and GREEN without it, in the commit body. Also assert `wide > 0` and `degenerate === 0` for every subject (measured: `wide` **rises** under both prototypes; degenerate is 0 everywhere in all three runs) so no bar is met by thinning the ribbon.

**Do NOT use the A3 split oracle as the F1 oracle.** Measured in scratch, base → Prototype A:

| law | `ringNotInkMm2` | `ringNotInkReachableMm2` | `ringUnreachableMm2` | clusters | worst cluster | `ringFillRate` |
|---|---|---|---|---|---|---|
| interlockWeave | 2.0138 → **2.1319 (+5.9 %)** | 0.1406 → 0.0394 | 1.8731 → 2.0925 | 146 → 171 | 0.1069 → 0.0506 mm² | 0.99687 → 0.99660 |
| onePenDown | 2.0025 → **2.1994 (+9.8 %)** | 0.0506 → 0.0619 | 1.9519 → 2.1375 | 143 → 171 | 0.0450 → 0.0563 | 0.99689 → 0.99650 |
| trochoidLoop | 1.4906 → **1.5806 (+6.0 %)** | 0.1744 → 0.0281 | 1.3163 → 1.5525 | 139 → 165 | 0.1238 → 0.0563 | 0.99777 → 0.99755 |
| taperedEnds | 0.1125 → **0.1125 (identical)** | 0.0169 → 0.0169 | 0.0956 → 0.0956 | 18 → 18 | 0.0113 → 0.0113 | 0.99977 → 0.99977 |

The split oracle goes **up** by 6–10 % while the user-visible band drops **64 %**. That is the A3 judge's finding proven from the other direction, and it is the reason the split oracle appears in §11 as a **guard** (must not regress past its bars), never as the pass criterion.

## 11. Guards — run every one, individually, foreground

Named in the brief:
- `tests/unit/scene3d-ribbon-f1b-streaks.test.js` **with the A3 split** — *dependency*: the split helper (`tests/helpers/scene3d-ring-coverage.js` with `ringNotInkReachableMm2` / `classifyReachabilityAtDivisor` / `findUncoveredClusters`) and this test file live on **`handoff-c` at `d86cbf8d`**, not on `fill-audit-a`. Either (a) wait for handoff-c to merge, or (b) copy both files in as part of this unit's diff and say so in the report — **do not** run the fill-audit-a copy and claim the split was checked. Its bars: `ringFillRate ≥ 0.995` (measured 0.99650–0.99755 under the prototypes — passing, but the margin *narrows*, so this is the guard most likely to bite), `ringNotInkMm2 < 3` (measured up to 2.199), `ringNotInkReachableMm2 < 1.0`, cluster length ≤ 1.2 mm and no `crossWidth > 0.30 mm` over `> 1.0 mm`, `ringUnreachableMm2 > 0`, `degenerate ≤ 0`.
- `tests/unit/scene3d-ladder-uniform-field-spacing.test.js` (W-26's own R1a proof, 9/9) — and note it is the source of the 1.15 bar RED-1 reuses.
- `tests/unit/scene3d-style-fill-lines.test.js` (15/15 — carries W-26's `probe()`/`baseSteps` fix; the one file W-26 broke and repaired).
- W-01 M1: `tests/unit/scene3d-curved-density-floor.test.js`, `tests/unit/scene3d-curved-density-sparse-end.test.js`.
- `tests/unit/scene3d-ribbon-f7-self-occlusion.test.js`.

Added by this planner, because the change is to a coverage function every wave law reads and to the drop channel:
`scene3d-ribbon-c3-rule5`, `scene3d-ribbon-outline-fill-seam`, `scene3d-ribbon-wall-coverage`, `scene3d-ribbon-wall-region-clip`, `scene3d-ribbon-weightscale-invariant`, `scene3d-ribbon-primitives`, `scene3d-ribbon-f6-self-occlusion`, `scene3d-fill-even-spacing`, `scene3d-fill-span-verdict`, `scene3d-fill-ruling-continuity`, `scene3d-fill-seam-continuity`, `scene3d-fill-boundary-ends`, `scene3d-plot-floor-obj`, `scene3d-plot-safety`, `scene3d-tone-algo-default`, `scene3d-hatch-density-500`, `scene3d-subwindow-density`, `scene3d-appdefault-lit-floor`, `expand-scene3d-weight-to-strokes`.

Every guard must be shown **non-vacuous** (it asserts a real moved number, not "no throw"), per the protocol.

## 12. Files allowed / forbidden

**Allowed**
- `src/core/scene3d/surface-fill.js`, and within it **only** the wave laws' own placement-coverage path: `wvFlatCov()` (`:3910`), a new `wvPlaceCov()` beside it, `weightBaseCov()`'s `isWaveLaw()` branch (`:2637`), and `weightCovAt`'s fallthrough (`:4273-4303`). Plus, if Fix 4 is taken, the closed-family phase seeding local to that path.
- `tests/unit/scene3d-ribbon-flat-field-placement.test.js` (new).
- `tests/helpers/*` only to ADD a shared blank-map helper (recommended: `tests/helpers/scene3d-blank-map.js`, so RED-2's rasteriser is reusable and reviewable in one place). If the A3 split files are imported from handoff-c, they come in verbatim.
- `docs/3d-audit/STILL-OPEN.md`, `docs/3d-audit/lane-reports/F1-placement-impl.md`, `CHANGELOG.md`, `plans.md`, `docs/3d-audit/fill-audit/after/F1-placement/report.json`.

**Forbidden**
- The master grid, `src/core/scene3d/surface-fill.js:5084-5157` (calibration) — untouchable, per the W-26 brief that is still in force.
- `emitContFamily` (`:9275`) and everything W-26 changed inside it, including `probe()`/`baseSteps`.
- `ladderStep` (`:1289`), `ladderKeeps` (`:6218`), `spanDrops` (`:7313`) — the accumulator is correct; it is being fed a tone-free constant. Fix the input.
- `ribbonizeCore` and the stretch classifier (`:6320-6830`) — §2/§7 Fix D closes that door with measurement.
- `contMapper`'s gate (`:10441`) **unless** the orchestrator explicitly grants Fix 3's wider scope.
- `src/core/scene3d/surface-fill-mono.js` (lane `fill-audit-c`), `hlr.js` / `shadows.js` / `pen-fill.js` / `fill-boolean.js` (lane `handoff-c`), `mappers.js` (lane `fill-audit-d`), `geometry-utils.js`.
- Any other worktree; any push, merge, tag or version bump.

## 13. Evidence cells — verified to exist and verified clean

The five ribbon laws **are** captured, contrary to the earlier "never captured" note: `docs/3d-audit/fill-audit/after/W-26/shots/B/` holds all ten `torus__hatch__{interlockWeave,onePenDown,trochoidLoop,ampSpacing,weaveDepth}__{med,max}__a.webp`, and the gallery baseline holds the same basenames under `shots/B/`.

**W-10 corruption check — performed, CLEAN.** `after/W-26/manifest.B.1-1.jsonl` has exactly **13 lines** for exactly **13 `.webp` files** (the W-10 signature was 42 lines = three stacked 14-line generations), and all 13 files have **13 distinct md5s** (the W-10 signature was six torus cells sharing one hash and three cone cells sharing another). `report.json` documents all 12 byte-identical before/after pairs with reasons and carries the `gh1_identical_exceptions` map. Safe to use as the `before`.

Re-shoot regex (from MAIN, so output lands in main's gallery dir):

```
node scripts/audit/scene3d-capture.js --tier B --root <worktree> --port <free ≥ 8510> \
  --only '^torus__hatch__(interlockWeave|onePenDown|trochoidLoop|ampSpacing|weaveDepth)__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/F1-placement
```

Add the two non-torus wave-law controls, also present in `after/W-26/shots/B/`:
`^cone__contour__(ampSpacing|amplitudeOnly)__med__a$`.

`before` pointers go to the top-level `shots/A|B/...` gallery baseline (the W-26 `after` copies are byte-identical to it, per its own report). Every `after` path must start `after/F1-placement/` or GH-1's hard refusal will reject the report. **`ampSpacing`/`weaveDepth`/cone cells are expected byte-identical under Fix 1 — that is the correct-scoping proof — so they must appear in `identical_exceptions` with that reason.** LOOK at the four subject cells and describe the strip under the inner hole before and after; that strip is the whole unit.

## 14. Stop conditions

Stop, ship the measurement, and report rather than fudging, if any of these fire:

1. **Scope leak.** `ampSpacing`, `weaveDepth`, `taperedEnds` or `weightSmoothstep` move at all on the blank map or on ink. Fix 1 leaves them bit-identical; anything else means the change landed in `wvFlatCov`'s other consumers (`:3971`, `:4172`, `:4191`).
2. **Ink.** Any subject law's whole-object ink moves more than **±8 %** at Density 50 (measured: −2.4 % to −5.8 % for the two prototypes; `ampSpacing` **+10.8 %** is exactly what a leak looks like).
3. **`ringFillRate` < 0.995** on any of the five, or `degenerate > 0`, or `wide` **falls** for any of the five. (Measured: `wide` rises under both prototypes; `ringFillRate` bottoms at 0.99650.)
4. **Density/primitive sweep.** If Fix 2's `round(1/c)` sends the reserved pitch outside ±25 % of `wvPitchPen() * inkWidth()` anywhere in `{torus, sphere, cone, capsule} × Density {1, 10, 25, 50, 100}`, do not ship Fix 2.
5. **The band does not close.** If RED-2's largest-cluster bar cannot be met honestly, **ship the numbers and say placement is only half the mechanism** (§6), open F1-amp, and do **not** widen the bar. A partial close with the real number in the report is the correct outcome here.
6. **New boolean failures.** A `[FillBoolean]` failure that did not occur at base is a stop-and-report, not a shrug. One new one was already seen under Prototype B (§9) — expect it and characterise it.
7. **Bench look missing.** No F1 screenshot exists anywhere in the repo (`user-reports/` holds only W-05b / W-06b / W-27c / W-29). `docs/stroke-fill-handoff.md` §A's *done when* requires the user to confirm by eye. **This unit may report MEASURED/DONE-FU; it may not report F1 CLOSED.** Ask the user to look at the re-shot `torus__hatch__trochoidLoop__med` pair and confirm the strip under the hole is what he meant.

## 15. Bars changed

None yet — this is a plan. When the implementer lands it, RED-1's 1.15 is **reused unchanged** from `tests/unit/scene3d-ladder-uniform-field-spacing.test.js`, and RED-2's three bars (32 mm², 25 mm, 3.0 mm²) are **new**, so they carry no "changed" entry — but §10's justification (each bar strictly between two measured populations, ≥17 % margin both sides) must be reproduced in the commit body. If the implementer ships Prototype B and has to raise the 32 mm² area bar, that **is** a bar change and must appear under `## Bars changed` as `tests/unit/scene3d-ribbon-flat-field-placement.test.js:<line> — 32 → <new> — Prototype B measures <n> mm²; Prototype A measured 22.8 and is the alternative`.
