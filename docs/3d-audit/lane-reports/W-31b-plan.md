STATUS: PLAN-READY

# W-31b — plan: crosshatch CELL SHAPE, a different mechanism

**Summary.** The defect is still RED and still PLACEMENT, re-measured today on the current lane head
`3bc61c32` with the light OFF: flat-tone cell aspect ramps **cone 0.644 → 1.643** (ramp 2.552),
**cylinder 0.741 → 1.377**, **sphere 0.826 → 1.239** at d=220 camera a, and **C1's [0.85, 1.18] band
fails on 3 of 5 primitives** there and on 3 of 5 at d=50 — numbers that are *byte-identical to the
`a3b651f0` ceiling W-36c pinned*, so none of the six commits since (F1-placement, W-36d, T4b, F1-erode,
T4c, F1-amp) moved crosshatch cell shape. Root cause is unchanged and re-located: `probe()` returns
`mmPerFrac` as an **area-weighted mean over the whole ruling** (`surface-fill.js:10132`) and the walk
spends it as **one scalar step** (`df = clamp(want / pb.mmPerFrac, dfMin, dfMax)`, `:10272`) emitted at a
constant parameter offset (`:10340`). This planner **prototyped Rank 1 in seven measured forms** in a
scratch export, and reports one genuinely new mechanical finding plus an honest gate failure: the
correction W-31's spike was missing is **normalising the per-sample step field against the walk's own
area weight and decoupling the scalar bookkeeping from the warped ruling** — with that, ruling counts are
preserved *exactly* on all 11 configs and the headline ramp drops **cone 2.552 → 1.175 (all five columns
inside the band)**, **sphere 1.500 → 1.142**, **cylinder 1.859 → 1.262**, while C2's within-family spread
improves 3–5× on four primitives. It still **FAILS the gate**: cylinder keeps two columns out, the
already-passing **ellipsoid (1.089 → 1.523)** and **sphere camera b (1.054 → 1.464)** regress, neighbouring
rulings **touch on the torus and on sphere camera b** (p01 local gap 0.0674 → 0.0005 and 0.0301 → 0.0000),
sphere ink falls **−18.2 %** (a P5b breach), and interior measurability drops 30–50 %. A second mechanism
— the brief's own "place the crossing family against family A's ACTUAL local spacing" — was **also
prototyped and is REJECTED BY MEASUREMENT** (family A byte-identical, but family B's median gap collapses
−43 % and the ramp gets worse); it is recorded so nobody re-derives it. The plan therefore ships a
**mandatory spike gate on Rank 1 with four named closure conditions**, and a Rank 3 that is *not* a repeat
of W-31's zero-diff ceiling: it adds the two bars nothing in this repo gates today — a **tone-authority
floor** (measured: tone has essentially **no** authority over cell size at d=220 because W-36c's
anti-saturation cap binds, so any "tone is preserved" claim made at d=220 is vacuous) and a **local
plot-safety floor** on the within-family p01 gap.

- Lane: **fill-audit-a3** · worktree `.claude/worktrees/fill-audit-a3` · branch `3d-scene/fill-audit-a3` · port 8475.
- **Lane head read: `3bc61c325c44e02ba14819dbc7b9242bc340ce68`** (v1.4.1, `fix(3d-audit): F1-amp …`).
  All measurement below is from a read-only scratch export of that sha at
  `/private/tmp/claude-501/scratch-W31b` (`git archive` + symlinked `node_modules` from MAIN). **Nothing was
  written to any worktree or to MAIN except this file.** `surface-fill.js` is under a live implementer
  (T2-2, MK.tick sink) in the worktree and was never read there.
- **Re-derive on your own base.** T2-2 lands in this same file; the mechanism does not change, but every
  line number and every RED number must be re-taken on the tree you actually build on.
- USER rule (Jay, verbatim, `user-reports/13-w26-judge-montage.webp`): *"I'm unclear on why some of these
  sections have diamond/square gaps and some have rectangular gaps - are lines not being evenly spaced?
  The only reason there should be greater amounts of space in some areas is if we're trying to represent
  highlights on a shape (less ink = more light)."*

---

## 0. Carried forward from W-31 — binding, do not re-litigate

| fact | source |
|---|---|
| The defect is **placement**, measured with **tone OFF** (`lights: []`), so no highlight exemption can apply | `W-31-plan.md` §1.3, re-confirmed §1 below |
| **W-36 is proven NOT to be the cause** and the pair's coverage split stays closed | `W-31-plan.md` §1.4 (single-family hatch runs show the identical spread) |
| **W-31's Rank 2 — per-sample TONE only — is PROTOTYPED AND REJECTED. NEVER RETRY IT.** | LEDGER standing ruling, `W-31-plan.md` §4 Rank 2 (−9…−13 % ink, out-fraction 0.437 → 0.671) |
| The `median`/`harmonic-mean` variants of `mmPerFrac` are **measured dead** — "the metric's averaging rule is not the bug; having only one scalar per ruling is" | `W-31-plan.md` §4 |
| **Rank 1's per-ruling scalar step is exhausted by measurement**; the `48ff98dc` Rank-3 ceiling is the baseline to beat | LEDGER row 7 |
| The **chart-pole knot** (sphere/ellipsoid camera a, top ~15 %) is **W-31c**, excluded by the INTERIOR definition. Do not chase it. | `W-31-impl.md` follow-ups |
| **W-36c's P1–P6, its anti-saturation cap and the W-26 gap-jump must not be undone** | LEDGER row 4, `W-36c-impl.md` `## Bars changed` |

---

## 1. The defect, RE-MEASURED on `3bc61c32` (RED numbers are current)

Instrument: **the one W-31 already built and shipped** —
`tests/unit/scene3d-crosshatch-cell-shape.test.js`'s `cellShapeStats` (local perpendicular gap at every
interior vertex against the *same family's* next ruling; square windows of side
`3 × max(medGapA, medGapB)`, min 2.5 mm, ≥3 samples of each family; cell aspect = `median(gA)/median(gB)`;
INTERIOR = middle 70 % of the ink bbox in both axes; ray cap 6.0 mm). **Do not invent a second
instrument** — reuse this one, exactly as W-31's reviewer did.

⚠ **Instrument note for the implementer (found by this planner, not previously recorded):**
`localGaps(lines, crossLines, cap)` declares `crossLines` and **never reads it** — the gaps it returns are
strictly *within-family* (ruling i to ruling i+1 of the same family). That is what C2 claims and what the
aspect ratio needs, so the instrument is correct; the unused parameter is a readability trap, not a bug.
Say so in your report rather than "fixing" it, which would move every pinned number.

### 1.1 Flat tone (`lights: []`) — the headline. Cell-aspect column medians, d = 220, camera a

| primitive | col 0–.2 | .2–.4 | .4–.6 | .6–.8 | .8–1 | **ramp (max/min)** | spread A/B (p95/p05) | interior windows |
|---|---|---|---|---|---|---|---|---|
| **cone** | **0.6438**(n6) | **0.6917**(n31) | 1.0151(n28) | **1.4652**(n30) | **1.6427**(n6) | **2.552** | 16.80 / 18.84 | 101 |
| **cylinder** | **0.7408**(n5) | 0.8644(n34) | 1.0001(n18) | 1.1636(n29) | **1.3770**(n4) | **1.859** | 9.81 / 9.57 | 90 |
| **sphere** | **0.8259**(n9) | 0.9515(n28) | 1.0083(n33) | 1.0707(n31) | **1.2390**(n9) | **1.500** | 15.18 / 15.58 | 110 |
| torus | 1.0396(n6) | 1.0643(n32) | 0.9263(n27) | 0.9676(n29) | 1.0997(n6) | 1.187 | 6.50 / 7.49 | 100 |
| ellipsoid | 0.9923(n7) | 1.0244(n24) | 0.9906(n22) | 0.9585(n26) | 1.0437(n7) | 1.089 | 14.70 / 14.71 | 86 |

**C1 ([0.85, 1.18] on every interior column) FAILS on 3 of 5 primitives at d=220 camera a** — cone (4 of
5 columns out), cylinder (2 out), sphere (2 out). It passed on 4 of 5 at W-31's time; **torus has since
come inside the band** (1.51 → 1.10), a genuine improvement from W-36c's denser families, and cone's ramp
eased from 2.92 (0.600→1.753) to 2.552. Everything else is unchanged.

### 1.2 The rest of the roster, flat tone

| cell | col medians | ramp | verdict |
|---|---|---|---|
| sphere d=50 a | — / 0.9511 / 1.0048 / 1.0317 / — | 1.085 | passes |
| cylinder d=50 a | — / 0.8673 / 1.0023 / **1.1894** / — | 1.371 | 1 col out (marginal) |
| torus d=50 a | **1.2841** / 0.9766 / **0.7237** / 0.9775 / — | 1.774 | 2 cols out |
| ellipsoid d=50 a | 1.0011 / 1.0279 / 1.0009 / 0.9554 / 0.9896 | 1.076 | passes |
| cone d=50 a | — / **0.7682** / 1.0456 / **1.6212** / **1.5620** | 2.110 | 3 cols out |
| **sphere d=220 b** (the control that must not regress) | 1.0015 / 0.9748 / 1.0002 / 1.0275 / 1.0063 | **1.054** | passes |

### 1.3 The LIT rig is no better — tone does not rescue it

| cell (lit) | col medians | ramp | vs flat |
|---|---|---|---|
| cone d=220 a | 0.6429 / 0.6947 / 1.0241 / 1.4577 / 1.5500 | 2.411 | same |
| cylinder d=220 a | 0.7306 / 0.8603 / 1.0068 / 1.1592 / **1.4824** | **2.029** | **worse** |
| sphere d=220 a | 0.8620 / 0.9494 / 1.0094 / 1.0498 / 1.1179 | 1.297 | better |
| **cone d=50 a** | — / **0.6499** / 1.0141 / **2.4520** / **1.2709** | **3.773** | **much worse** |
| sphere d=50 a | 0.9020 / 0.9821 / 1.0109 / **1.4011** / **1.5519** | 1.720 | **worse** |

### 1.4 ⚠ NEW, and it changes what a "tone is preserved" bar may say

A source-free tone probe (the same cell rendered under **two opposed light azimuths**, 135° and 315°,
elevation 45°; nothing else changes, so any movement in cell AREA is tone and only tone):

| cell | median interior cell AREA, az135 | az315 | **ratio** |
|---|---|---|---|
| sphere d=220 a | 0.489 | 0.516 | **1.055** |
| cylinder d=220 a | 0.527 | 0.547 | **1.038** |
| cone d=220 a | 0.457 | 0.484 | **1.059** |
| ellipsoid d=220 a | 0.470 | 0.511 | **1.087** |
| **sphere d=50 a** | 3.562 | 7.549 | **2.119** |
| **cone d=50 a** | 3.374 | 6.079 | **1.802** |

**At d=220 the tone has almost no authority over cell size.** That is not a defect — it is W-36c's
anti-saturation cap working as designed: `ladderPairWantedPitch` (`:4841`) returns
`Math.max(masterPitch / c, crossFloorPitch(...))`, and at d=220 the floor
(`crossMinPitch() = inkWidth() × 2` ≈ 0.66 mm at pen 0.3) **binds nearly everywhere** — the measured
median gaps are 0.55–0.67 mm, i.e. sitting on it. Two consequences the implementer must honour:

1. **The ~2× cell-aspect ramp at d=220 cannot be a tone effect**, because `want` is very nearly constant
   there. It is 100 % placement. This is a *stronger* version of W-31's tone-OFF argument and should be
   stated in the report.
2. **A tone-preservation bar measured at d=220 would be VACUOUS** — a mutation that deletes the tone
   response entirely still passes it. Per the standing ruling on which half of a bar a guard gates, the
   tone check **must be taken at d=50**, where tone has 1.8–2.1× authority, and must say in its own
   comment that it does *not* gate d ≥ 170.

---

## 2. Root cause, with file:line at `3bc61c32`

### 2.1 Where the ruling-MEAN metric is spent as one scalar step

| step | file:line | what it does |
|---|---|---|
| probe accumulates | `src/core/scene3d/surface-fill.js:10127` | `if (mm > 1e-6) { mmSum += mm * area; mmW += area; }` — `area = max(1e-4, segLen) × max(1e-3, mm)` (`:10124`), i.e. **screen arc length along × clearance across** |
| probe returns the mean | **`:10132`** | `return { on: true, pts, I: iSum / wSum, mmPerFrac: mmSum / mmW };` — **one scalar for the whole ruling** |
| the walk spends it | **`:10272`** | `let df = clamp(want / Math.max(1e-6, pb.mmPerFrac), dfMin, dfMax);` |
| the walk advances | **`:10299`** | `f += df;` (after `placed.push({ frac: f, df, I: pb.I, want })` at `:10297`) |
| emission | **`:10340`** | `const at = lineAt(p.frac);` then `emitLine(at, p.frac, …, { a: unitOff.a * p.df, b: unitOff.b * p.df }, …)` — **one constant parameter offset for the whole ruling** |
| the ruling itself | `:9935-9948` (`lineAtWrapped`, the `Math.abs(da) >= WRAP_MIN_DA` branch `fillAngle 45` takes on all five primitives) | `a = clamp(a0 + t·da, 0, 1)`, `b = wrap01(b0 + t·db)` — **no per-sample offset exists** |
| the local metric that *is* available per sample but thrown away | `:10123` | `if (!(mm > 1e-6)) mm = perpPitch(smp, unitOff, dirOf);` — `perpPitch` (`:5357-5367`) is a pure function of the sample's chart derivatives |

So the achieved local gap at sample *k* is `want × mm_k / mmPerFrac_ruling`. Family A's `mm` field and
family B's are mirror images (45° vs 135°), so the **cell aspect is the product of two mirrored ramps**.
Measured at `3bc61c32` with the light off, family medians 0.647/0.643 against a `want` pinned at the
0.66 mm cap floor, while local gaps run 0.43–0.83 mm within one family: the variation the walk cannot see
is the variation **inside** each ruling.

### 2.2 What a per-cell / locally-adaptive alternative must change — and the two traps

To place ruling *i+1* as the **offset curve** of ruling *i* at the locally-wanted clearance, four things
must change together. **Three of them were already in W-31's spike; the fourth is what this planner
measured and is why that spike failed.**

1. `probe()` must additionally return **per-sample** `mmArr[]` (local `perpPitch`, already computed at
   `:10123`), `wantArr[]` (the per-sample tone target) and — **the new part** — `wArr[]`, the per-sample
   **screen area weight** it already computes at `:10124` and immediately throws away into `mmW`.
2. `angleFamily`'s wrapped branch must gain `lineAtWarped(baseFrac, warpArr)` — the same ruling, displaced
   along the family normal by a per-sample offset. **It must interpolate `warpArr` LINEARLY.** W-31's spike
   used `Math.round(tt*(n-1))`, a nearest-neighbour lookup that turns every ruling into an *n*-step
   staircase; that is the measured cause of its "per-window scatter got worse, windows 76 → 39" report.
3. The walk must carry a cumulative per-sample offset field and **fill the holes**. A culled sample
   (off-surface / back-facing / past the silhouette) has no local metric; W-31's spike substituted the
   **scalar `df`** there, which re-injects the ruling-MEAN error exactly at the silhouette — i.e. in the
   *outermost interior column*, which is precisely the one column its gate failed on.
4. ⚠ **THE MISSING PIECE. The per-sample step field must be normalised against the walk's OWN weight, and
   the scalar bookkeeping must be read from the UNWARPED ruling.**
   - `mmPerFrac` is an **area-weighted** mean. Normalising the per-sample step field by its *sample-count*
     mean over-represents the compressed silhouette band, where many parameter samples pack into few
     screen millimetres. Measured, in this export: advancing `f` by the sample-count mean of the raw
     per-sample steps (what W-31's spike did) **collapses the ruling count 53 → 31 on the sphere and
     31–40 % across the roster**; normalising the step to the scalar `df` by sample count instead
     **collapses the median gap 0.647 → 0.466 mm (−28 %)**. Neither is a tuning problem; both are the wrong
     average.
   - The warped ruling bulges toward the low-`perpPitch` band, which **lowers its own** area-weighted
     `mmPerFrac`, which shrinks `df`, which adds rulings. Measured: **family B alone drifts +27 %** when the
     scalar `df`/`want` are read from the warped probe. Reading them from a second probe of the *base*
     `lineAt` makes the ruling count **exactly** the shipped walk's on all 11 configs (verified — see §4.2).
   - The honest scale target is the **achieved gap**, not the step: the shipped walk satisfies
     `areaWeightedMean(gap) = df × mmPerFrac = want` by construction, and a per-sample step field is
     anti-correlated with `mm`, so it must be normalised on `areaWeightedMean(raw_k × mm_k) = want`.

**What this does NOT fix, and must be said aloud:** a per-sample offset field bounds each sample's
*amplitude* but not the ruling's *curvature*. A sharply bent ruling can approach its neighbour in a
direction other than the family normal — measured below as the torus's within-family p95/p05 going from
7.49 to 372 with no amplitude violation anywhere. **A curvature bound is a fifth required change**, and no
prototype in this plan closes it.

---

## 3. The RED oracle

New file: **`tests/unit/scene3d-crosshatch-cell-shape-b.test.js`** (a sibling, not an edit of W-31's
ceiling file — that file is the *baseline to beat* and must stay pinned until this unit deliberately
re-pins it under `## Bars changed`). Reuse `scene3d-crosshatch-cell-shape.test.js`'s rig and
`cellShapeStats` verbatim.

### 3.1 Which half of Jay's rule each bar gates — and the mutation that proves it

Jay's sentence has exactly two clauses. **Name both, gate both, and mutation-prove the one you claim.**

| bar | clause gated | today | mutation that MUST trip it |
|---|---|---|---|
| **C1b — evenness where tone does not demand otherwise.** Flat tone (`lights: []`): every interior column median of cell aspect ∈ **[0.85, 1.18]**, on `{sphere, cylinder, torus, ellipsoid, cone} × d ∈ {50, 220} × cam a` + `sphere d=220 cam b` | *"are lines not being evenly spaced?"* — the **first** clause | **RED**: 3 of 5 primitives fail at d=220 a, 3 of 5 at d=50 (§1.1, §1.2) | revert `surface-fill.js` to the pre-fix blob → C1b fails on ≥3 primitives. **Second mutation:** force `probe()`'s per-sample array back to the scalar `mmPerFrac` while keeping the rest of the fix → **C1b fails again**, proving C1b measures the placement metric and not a fingerprint |
| **C2b — evenness WITHIN one family.** Flat tone: interior local-gap **p95/p05 ≤ the W-31 ceiling** per config, and **strictly better on ≥3 of 5 primitives at d=220** | the same first clause, at the level W-26 R1a cannot see (it measures ruling centroids at 1.15; this is the local generalisation) | **RED against the 2.0 target**: 6.50–18.84 today | freeze the per-sample field to a constant → spread returns to today's values |
| **C7 — tone-driven variation is PRESERVED.** Lit rig, **d = 50 only**: median interior cell AREA under sun azimuth 315° ÷ the same under 135° must be **≥ 1.50** on sphere and **≥ 1.40** on cone (measured today 2.119 / 1.802 — a floor with ≥20 % headroom, not a fingerprint) | *"unless we're trying to represent highlights"* — the **second** clause | **GREEN today; must stay green** | replace `ladderPairWantedPitch(pb.I, …)` with `ladderPairWantedPitch(0.5, …)` (tone deleted, spacing constant) → the ratio must collapse to ≈1.0. **Run this mutation and report the number** — without it C7 is an argument, not a proof |
| **C5b — measurability floor.** Interior window count ≥ **0.85 ×** today's per config (sphere 110, cylinder 90, torus 100, ellipsoid 86, cone 101 at d=220 a) | neither clause — it keeps C1b/C2b from going vacuous | GREEN | starve one family (`crossDensityRatio = 8`) → windows collapse |
| **C8 — LOCAL plot safety.** Flat tone, d=220: within-family **p01** local gap ≥ today's value per config (sphere 0.0200, cylinder 0.0452, torus 0.0674, ellipsoid 0.0182, cone 0.0128, sphere cam b 0.0301 mm) | neither clause — it is the rail a per-sample step can out-run | GREEN | any mechanism that lets neighbouring rulings touch trips it (the §4 prototype trips it on torus and sphere cam b) |

### 3.2 Bars this unit explicitly does NOT gate — state this in the report

- **Tone authority at d ≥ 170.** W-36c's cap deliberately flattens it (§1.4). C7 says nothing there and a
  reader must not infer that it does.
- **The chart-pole knot** (W-31c) — excluded by the INTERIOR definition, visible and ugly, not a spacing law.
- **Ruling-centroid gap jumps** — that is W-26 R1a (`scene3d-ladder-uniform-field-spacing`, 9/9), a
  different level of the same rule.
- **`hatch` / `contour` / every `contField*` law** — the gate confines this unit to the crosshatch pair.
  W-31's §7 named a "Rank 1 extended to every law" follow-up; that is **not** this unit and must not be
  attempted here.

### 3.3 Do not

Never widen C1b's band. Never shrink the INTERIOR box or the column split to move a column — W-31's
reviewer looked for exactly that shortcut and named it as gaming, not fixing. Never re-pin W-31's
`scene3d-crosshatch-cell-shape.test.js` CEILING array without a `## Bars changed` row carrying old → new
per config.

---

## 4. Ranked mechanisms

> **Naming, to avoid a collision with the standing ruling.** W-31's forbidden "Rank 2" is **per-sample TONE
> only** (harmonic-mean `want` inside `probe`). It is NOT any mechanism below, and it is not retried
> anywhere in this plan. The mechanisms here are M1/M2/M3.

### 4.1 Rank 1 = **M1 — per-sample warped placement, area-weight-normalised, scalar bookkeeping decoupled. PROTOTYPED HERE.**

Built in the scratch export as a gated, reversible patch (7 measured variants; full diff in Appendix A,
`node --check` clean, the pristine file restored and `scene3d-crosshatch-cell-shape.test.js` verified back
to **23/23** afterwards). Knobs were exposed on `globalThis.__W31B` so the OFF path could be proven
byte-equivalent: with `off: true` the instrument reproduces **every** shipped number to four decimals
(`nA=53 nB=54 win=110 medA=0.647 spreadA=15.18`, columns `0.8259/0.9515/1.0083/1.0707/1.2390`), which is
the gate's own proof.

**The seven variants, on flat tone, d=220 camera a (ramp = max/min of the five column medians):**

| # | variant | cone | cylinder | sphere | ellipsoid | torus spreadB | ruling counts |
|---|---|---|---|---|---|---|---|
| — | **shipped (RED)** | **2.552** | **1.859** | **1.500** | **1.089** | **7.49** | — |
| V1 | W-31's spike shape, `f` += sample-count mean | 1.585 | 2.946 | 2.699 | 4.386 | 5.76 | **−40 %** |
| V2 | step normalised to `df` by sample count | 1.311 | 2.406 | 1.352 | 1.312 | 10.94 | +8…+29 % |
| V3 | step normalised to `df` by **area weight**, smooth 2 | 1.239 | 4.146 | 1.334 | 1.160 | **2218** | +13…+35 % |
| V4 | V3, smooth 8, amplitude cap 2× | 1.179 | 1.257 | 1.179 | 1.631 | **301** | +13…+33 % |
| V5 | V4 + curvature low-pass on the accumulated field | 1.298 | 1.743 | 1.106 | 1.205 | **595** | +9…+31 % |
| V6 | V5 + scalar bookkeeping read from the **unwarped** ruling | 1.999 | 1.445 | 1.483 | 1.215 | 379 | **EXACT** |
| **V7** | **V6 + scale normalised on the achieved GAP (`awmean(raw·mm) = want`)** | **1.175** | **1.262** | **1.142** | 1.523 | **372** | **EXACT** |

**V7 in full, flat tone (the best form reached):**

| cell | RED columns | V7 columns | RED → V7 ramp | RED → V7 spread A/B | RED → V7 windows | ink Δ |
|---|---|---|---|---|---|---|
| **cone d=220 a** | 0.644 … 1.643 | **0.886 / 0.984 / 1.041 / 1.030 / 1.013 — ALL FIVE IN BAND** | 2.552 → **1.175** | 16.80/18.84 → **3.27/3.66** | 101 → 79 | +1.8 % |
| **sphere d=220 a** | 0.826 … 1.239 | 1.035 / 1.081 / 1.111 / 1.146 / **1.182** | 1.500 → **1.142** | 15.18/15.58 → **3.77/7.44** | 110 → 63 | **−18.2 %** |
| **cylinder d=220 a** | 0.741 … 1.377 | 1.138 / 1.055 / **1.208** / **1.331** / 1.082 | 1.859 → **1.262** | 9.81/9.57 → **4.16/3.06** | 90 → 44 | −7.0 % |
| torus d=220 a | 1.040 … 1.100 | 0.979 / 0.914 / 1.051 / 0.978 / 0.943 | 1.187 → 1.149 | 6.50/7.49 → **332.8/372.4** | 100 → 64 | +7.7 % |
| **ellipsoid d=220 a** | 0.992 … 1.044 | **1.105 / 1.497 / 1.310 / 0.983 / 1.291** | 1.089 → **1.523 (REGRESSED)** | 14.70/14.71 → 4.49/6.13 | 86 → 63 | −15.8 % |
| **sphere d=220 b** (control) | 1.002 … 1.006 | 0.911 / 0.920 / 0.966 / **0.727** / 1.064 | 1.054 → **1.464 (REGRESSED)** | 15.00/14.97 → **21.03/16.00** | 106 → 64 | +3.4 % |

Local plot safety (within-family p01 gap, mm, flat): cylinder **0.0452 → 0.1782** and cone
**0.0128 → 0.1053** *improve*; **torus 0.0674 → 0.0005** and **sphere cam b 0.0301 → 0.0000** — neighbouring
rulings touch. Tone authority at d=50 (C7's own quantity) **weakens ~35 %**: sphere 2.119 → 1.34, cone
1.802 → 1.42 — still over C7's floors, but the trend is the wrong way and must be watched.

**GATE VERDICT ON THE PROTOTYPE: FAIL.** Applying W-31's own gate (all five flat-tone column medians of
**cylinder d=220 camera a** inside [0.85, 1.18]) V7 lands 1.208 and 1.331 outside. Roster-wide it clears
the band on **cone only**. And the pinned W-31 ceiling goes **21 of 23 RED** under V7 — correct behaviour
for the ceiling, and proof the oracle is mutation-sensitive.

**Rank 1 is therefore the recommended mechanism only if these FOUR conditions are closed, each with a
number, before any guard or evidence work:**

1. **Curvature bound.** Torus and sphere-camera-b within-family p01 must return to **≥ 0.85 ×** today's
   value (0.0674 / 0.0301 mm). Amplitude caps do not do this — a bound on the warp field's *slope* (or an
   explicit neighbour-clearance fixed point, mirroring `contFieldAniso`'s own two-iteration
   `acrossClear` correction at `:10274-10284`, which the ladder path does not run) is what is missing.
2. **No regression on an already-passing config.** Ellipsoid d=220 a and sphere d=220 b are inside the band
   today; V7 pushes both out. Both must end inside.
3. **Ink.** Sphere d=220 must not fall below **P5b's 3713.0 mm floor** (`scene3d-crosshatch-parity.test.js`
   P5b). V7's −18.2 % on this planner's raw-run instrument is a strong signal it would breach; measure it
   through `finalFills`, the bar's own instrument, not through the raw runs.
4. **Measurability.** C5b (≥ 0.85 × today's interior window count) must hold; V7 loses 30–50 %.

**Spike gate (mandatory, and it is a GATE not a goal):** implement M1, then run **C1b's flat-tone control
on cylinder d=220 camera a and on ellipsoid d=220 camera a**, plus the torus p01 check. If all five
cylinder column medians are not inside [0.85, 1.18] **and** ellipsoid does not stay inside **and** torus
p01 does not hold, **STOP and take Rank 3.** Do not iterate the mechanism more than twice. Start from
Appendix A rather than re-deriving — V1–V7 are already spent.

### 4.2 Rank 2 = **M2 — the crossing family placed against family A's ACTUAL local spacing. PROTOTYPED AND REJECTED BY MEASUREMENT.**

The brief's own framing, and it is attractive: leave family A **completely untouched** and warp only the
crossing family, whose per-sample shape is `perpPitch(smp, unitOff_A, dirOf_A) / perpPitch(smp, unitOff_B,
dirOf_B)` — family A's local pitch at family B's own sample, computable with **no cross-family state at
all** because `perpPitch` is a pure function of the sample's chart derivatives. Since aspect = gA/gB, it
should drive the aspect to the dial's ratio by construction while leaving family A's ink, count, byte
identity and plot safety alone.

**Measured (mode `mirror`, smooth 8, cap 2×, curvature low-pass 2, decoupled):**

| cell, flat, d=220 a | family A (must be untouched) | family B median gap | V7-mirror columns | ramp |
|---|---|---|---|---|
| sphere | `nA=53 medA=0.647 spreadA=15.18` — **byte-identical to shipped** ✔ | **0.643 → 0.364 (−43 %)** | 1.469 / 1.630 / 1.588 / 1.475 / 1.573 | 1.110 |
| cylinder | untouched ✔ | 0.550 → 0.417 (−24 %) | 1.026 / 1.425 / 1.709 / 1.789 / 1.609 | **1.744** |
| cone | untouched ✔ | 0.626 → 0.393 (−37 %) | 1.078 / 1.185 / 1.443 / 1.762 / **2.407** | **2.234** |
| ellipsoid | untouched ✔ | 0.657 → 0.351 (−47 %) | 2.222 / 1.893 / 1.018 / 1.201 / 1.480 | 2.182 |

The family-A half of the gate works perfectly (every A statistic is byte-identical, which is itself a
useful proof that a role-scoped gate is clean). But family B's gaps collapse 24–47 %, the aspect sits at
1.4–1.7 instead of 1.0, and the ramp gets **worse** on cone and cylinder. The reason is structural, not a
tuning miss: a shape proportional to `mmA/mmB` makes `gap_B ∝ mmA` — which *varies*, because family A's own
local pitch is exactly what ramps. Matching family A's *ramp* is not the same as removing it.
**Recorded so no future unit re-derives it. Do not retry M2 as stated.** The only version worth a future
look would read family A's **emitted** gap field (via the existing `cfMakeField`/`cfAddInk` machinery) and
match its *value*, not its metric — and that needs cross-family state this file does not have today.

### 4.3 Rank 3 = **M3 — MEASURE-AND-STOP, but with two NEW gated bars. The shippable-now fallback.**

W-31 already shipped a zero-diff ceiling; repeating it would deliver nothing. Rank 3 here is:

1. **Land C7 (tone authority at d=50) and C8 (local plot-safety p01) as new, mutation-proved guards.**
   Both are GREEN today, both gate a clause nothing in this repo gates, and both are RED-provable by the
   mutations in §3.1. C7 in particular closes the hole §1.4 found — that after W-36c's cap, *"tone is
   preserved"* is currently an untested claim at every density the audit shoots.
2. **Re-pin W-31's ceiling to `3bc61c32`** only if any value moved (this planner measured none — state
   that, with the table, rather than silently re-pinning).
3. **Record §2.2's four-change analysis and Appendix A** so the next attempt starts from V7, not from zero.
4. File **W-31d** — the curvature/neighbour-clearance bound — as the blocking prerequisite for any
   per-sample placement mechanism in this file.

Rank 3 costs one session, moves no source, and cannot breach any W-36c/W-26 bar.

**Recommendation to the orchestrator:** run M1's gate first, with the four closure conditions in §4.1 as
hard pass/fail. If it does not clear, take **Rank 3** — and note that Rank 3 is now a real deliverable, not
a second empty ceiling. Do **not** take M2, and never W-31's Rank 2.

---

## 5. Guards, pins, and the fixture each pin actually uses

Baselines measured by this planner on `3bc61c32` in the scratch export, foreground, one file at a time:

| file | today | at risk? |
|---|---|---|
| `scene3d-crosshatch-parity.test.js` (W-36c P1–P6, P5a/P5b/P5c) | **91/91** | **YES** — P5b's fixtures are `{sphere, cylinder, torus, ellipsoid} × crosshatch × d=220` and P5a/P5c add cone+capsule at d ∈ {170, 220, 300}. **Directly in the blast radius.** P6's fixtures are `sphere hatch d=50`, `cylinder hatch d=220`, `sphere contour d=50` — **hatch/contour, so safe by the gate, and that is the assertion your byte-identity sweep must prove, not assume** |
| `scene3d-crosshatch-cell-shape.test.js` (W-31 ceiling) | **23/23** | **YES** — this unit's own baseline-to-beat |
| `scene3d-curved-density-floor.test.js` | **14/14** | **YES** — `:292-295` pins crosshatch **fill counts** on the **sphere** at d=10/100, ratio 0.25/1.0 (22/18/120/116), and `:314` the dial ceiling W-36d restored. Fixture = sphere + crosshatch + default (ladder) → in the blast radius |
| `scene3d-fill-even-spacing.test.js` | (green; re-measure) | **YES** — `:268` has an explicit `['crosshatch','sphere']` fixture |
| `scene3d-ladder-uniform-field-spacing.test.js` (W-26 R1a ≤ 1.15) | **9/9** | Check the fixture list at `:345` — it enumerates `[mapper, primitive, sizes]` rows; only the crosshatch rows are at risk |
| `scene3d-fill-span-verdict.test.js` (silhouette ink coverage < 0.85) | **11/11** | **YES** — the same anti-blob instrument P5a reuses |
| `scene3d-plot-safety.test.js` | **5/5 (+1 skip)** | **YES** — a per-sample step can go tighter locally than a per-ruling mean |
| `scene3d-curved-density-sparse-end.test.js` | (green; re-measure) | **NO** — its md5 pin at `:329` is `hatch/taperedEnds` on the **SPHERE**; mapper is hatch, not crosshatch. **Read the fixture, not the label** (the F1-erode ruling) |
| `scene3d-curved-crosshatch-controls.test.js` · `scene3d-fill-boundary-ends.test.js` · `scene3d-fill-ruling-continuity.test.js` · `scene3d-fill-ruling-corners.test.js` (W-33) · `scene3d-hatch-density-angle-stable.test.js` (W-36b) · `scene3d-mapper-audit.test.js` · `scene3d-surface-fill.test.js` | must hold | run them; `curved-crosshatch-controls` and `fill-ruling-corners` see the emitted ruling geometry directly |

**Pre-existing red.** Record the failing set at your own base **before** any edit, test by test, under a
`## Pre-existing red` heading, and prove the set is identical at the final commit. Do **not** trust an
env-gated "pre-fix" run: grep the target file for the flag name and confirm your fix's own symbol is absent
from the tree you call pre-fix, or just `git archive` the base sha.

**Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000`.** Never
`run_in_background`, never arm a Monitor. If a file exceeds ten minutes, rerun it alone with
`--pool=forks --poolOptions.forks.singleFork=true`, again at `timeout: 600000`. One file per command —
under `singleFork` a multi-file batch can silently truncate to the first file's results. Node 20
(`.nvmrc` v20.20.2). None of this lane's files is Tier 1; the cell-shape instrument runs in **~3 s**.

**Byte-identity sweep — coverage as a fraction of the roster, and the exclusions justified.**
The tier-A roster is **12 primitives × 8 Types × 3 densities × 2 cameras, style `ladder`** (576 cells;
mappers: `none`, `wireframe`, `hatch`, `crosshatch`, `contour`, `contourSlice`, `spiral`, `stipple`).
This unit's gate is `crossShare != null && isEvenLadder()` on the **wrapped-angle branch**, so:

- **Required, md5 byte-identical: `7 of 8 Types × 5 primitives = 35 of the 40`** cells in the brief's
  roster (every Type except `crosshatch`), at **both** cameras and at **d ∈ {50, 220}** — 140 renders.
  "The other mappers are unrelated" is a claim to be measured, not assumed (the F1-erode ruling: an
  honestly-scoped sweep missed a live instance of the very defect it was scoping).
- **Also required byte-identical, and easy to forget: `crosshatch` under a NON-ladder tone law** (e.g.
  `contFieldAniso`, `hatchWeight`, and one `contField*`), because `isEvenLadder()` gates them out. At
  least 3 laws × 5 primitives.
- **Also required: the `onMeridianAxis` crosshatch branches** (`:11457-11458`, `kind` `'a'`/`'b'`, not
  `'angle'`) — `lineAtWarped` exists only on the wrapped-angle branch, so these must be byte-identical too.
- **Expected to CHANGE: 5 cells** (`crosshatch × ladder × {sphere, cylinder, torus, ellipsoid, cone}`),
  plus their d=50 and camera-b variants.
- **Justified exclusion:** the other 7 primitives (`box`, `capsule`, `plane`, `pyramid`, `solid`,
  `superellipsoid`, `torusKnot`). `box`/`plane`/`pyramid`/`solid` are faceted and take a different mapper
  path; `capsule` **is** in P5a/P5c's fixture list and **must** be swept even though it is not in the five;
  `superellipsoid` and `torusKnot` are curved and should be spot-checked at d=220 camera a as a
  cheap confirmation (F1-erode's own sweep cost little and bought a finding).

---

## 6. Evidence

**Manifest reality check — do this before naming a single cell** (a brief named non-existent cells twice
in this audit). Verified by this planner against MAIN's manifests:

- `docs/3d-audit/fill-audit/manifest.B.*.jsonl` contains crosshatch × ladder for **only four primitives —
  `box`, `cone`, `sphere`, `torus`** (24 cells: 3 densities × 2 cameras each, all `status: ok`). **Tier B
  has no `cylinder` and no `ellipsoid` at all.**
- `docs/3d-audit/fill-audit/manifest.A.1-1.jsonl` contains crosshatch × ladder for **all 12 primitives**
  (72 cells), including `cylinder` and `ellipsoid`.

So the brief's "must exist in `manifest.B.*.jsonl`" is satisfiable for sphere / cone / torus and **not**
for cylinder / ellipsoid, which must come from tier A. Capture, **run from MAIN so output lands in main's
gallery dir**, and shoot **both rigs**:

```
# Tier B — sphere / cone / torus (verified present in manifest.B.*.jsonl)
node scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-audit-a3 --port 8475 \
  --only '^(sphere|cone|torus)__crosshatch__ladder__(med|max)__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/W-31b
node scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-audit-a3 --port 8475 \
  --rig addLayer --only '^(sphere|cone|torus)__crosshatch__ladder__(med|max)__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/W-31b

# Tier A — cylinder / ellipsoid (NOT in tier B) + the must-not-move controls
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a3 --port 8475 \
  --only '^((cylinder|ellipsoid)__crosshatch__ladder__(med|max)__(a|b)|sphere__(hatch|contour)__ladder__med__a|cylinder__hatch__ladder__max__a)$' \
  --out docs/3d-audit/fill-audit/after/W-31b
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a3 --port 8475 \
  --rig addLayer --only '^((cylinder|ellipsoid)__crosshatch__ladder__(med|max)__(a|b)|sphere__(hatch|contour)__ladder__med__a|cylinder__hatch__ladder__max__a)$' \
  --out docs/3d-audit/fill-audit/after/W-31b
```

Then write `after/W-31b/report.json`. Confirm the served `window.Vectura.APP_VERSION` matches the
worktree's `package.json`. **Byte-identical pairs must be explained** — for the three controls they are the
expected result and are the gate's own proof.

**Mandatory native-resolution crops (PIL crop → Read), and what to look for:**

- `cylinder__crosshatch__ladder__max__a` — **Jay's own panel.** Crop the left limb, the centre and the
  right limb side by side. Today the centre reads as even diamonds, the left limb as crushed rectangles
  and the right limb as stretched parallelograms (W-31's implementer and its reviewer both looked at this
  and saw it). The fix must make the limb cells square; **larger or smaller is fine, longer is not.**
- `cone__crosshatch__ladder__max__a` — the worst measured ramp (0.644 → 1.643). One horizontal band
  through mid-height, left silhouette to right, in a single crop.
- `torus__crosshatch__ladder__max__a` — **the crossing check.** Rank 1's prototype drove this cell's
  within-family p01 gap to 0.0005 mm. Crop at native resolution and say explicitly whether any two
  neighbouring rulings of the same family touch or merge.
- `sphere__crosshatch__ladder__max__b` — **the control that already passes** (columns 1.002–1.006). It must
  not regress; the prototype pushed one column to 0.727.
- `ellipsoid__crosshatch__ladder__max__a` (tier A) — the other already-passing config the prototype broke.
- `sphere__crosshatch__ladder__med__a` — the chart-pole knot. **Crop it, describe it, file it as W-31c. Do
  not chase it.**
- There is **no manifest cell for `rungMode: 'fine'`**; if Jay's own Fine-rungs cell is wanted, capture it
  bespoke exactly as W-36/W-36c did (`after/W-36c/jays-cell-*.png`).

---

## 7. Files

**Allowed:** `src/core/scene3d/surface-fill.js` — **crosshatch placement only**: `angleFamily`'s
wrapped-angle branch (`:9932-9949`), `probe()` (`:10058-10133`), and the walk's step/emit block
(`:10212-10344`) · `tests/unit/scene3d-crosshatch-cell-shape-b.test.js` (new) ·
`tests/unit/scene3d-crosshatch-cell-shape.test.js` and `tests/unit/scene3d-crosshatch-parity.test.js` and
`tests/unit/scene3d-curved-density-floor.test.js` **only** if a bar must move, each with a
`## Bars changed` row · `docs/3d-audit/lane-reports/W-31b-impl.md` ·
`docs/3d-audit/fill-audit/after/W-31b/**`.

**Forbidden:**

- **The W-01 master grid** and anything reached through `STAGE.masterGrid`'s non-crosshatch branches
  (`:11346` onward) — explicitly out of scope.
- Anything **F1-amp** or **T2-2** touch: the mark-law amplitude/wave block and the `MK.tick` sink.
  `surface-fill.js` is shared with a live implementer — **confirm textual disjointness against the
  worktree's HEAD before your first edit**, and if T2-2 has landed in the walk block, stop and re-partition.
- `surface-fill-mono.js` (fill-audit-c) · `scene3d.js`, `context-bar.js` (fill-audit) · `hlr.js`,
  `shadows.js`, pen-fill, fill-boolean (handoff-c) · `mappers.js` (fill-audit-d) · `src/config/**`
  (including `scene3d-tone-laws.js`, `params.js`) · any `src/ui/**` · any other worktree · every test file
  not named above. **No version bump** (worktree; the hook cannot fire there).

---

## 8. Stop conditions

1. **M1's spike does not clear §4.1's four conditions** (cylinder d=220 a band, ellipsoid stays inside,
   torus/sphere-cam-b p01 ≥ 0.85× today, P5b sphere ink ≥ 3713.0 mm). → Take Rank 3, report the numbers,
   stop. Do not iterate the mechanism more than twice.
2. **Any W-36c P1–P6 bar, the anti-saturation cap (`crossMinPitch`/`crossFloorPitch`), the W-26 R1a 1.15
   gap-jump, or `scene3d-fill-span-verdict`'s 0.85 coverage cap moves.** → Stop and report. None of them may
   be re-pinned by this unit under any circumstances.
3. **Any P6 byte-identity control moves** (sphere hatch d=50 = 24 fills / 723.4 mm; cylinder hatch d=220 =
   145 / 4495.5 mm; sphere contour d=50 = 18 / 657.25 mm) or **any of the 35 non-crosshatch roster cells
   fails md5 byte-identity.** → The gate leaked. Stop.
4. **Any within-family p01 local gap at d=220 falls below 0.85× today's value**, or any minimum local gap
   falls below `PLOT_FLOOR_PEN × penWidth`. → Stop; a per-sample step must not out-run the plot floor.
5. **C7 falls below its floor** (sphere d=50 az315/az135 cell-area ratio < 1.50, cone < 1.40). → The fix is
   eating the tone. Stop — that is the half of Jay's rule the fix exists to protect.
6. **An already-passing config regresses** (ellipsoid d=220 a, sphere d=220 b, sphere d=50 a, ellipsoid
   d=50 a, torus d=220 a). → Stop; a fix that trades five failing columns for five new ones is not a fix.
7. **The worktree is dirty with T2-2's or anyone else's uncommitted work**, or `git stash list` holds
   someone else's stash. → Stop and report; never checkpoint over another lane.
8. **The oracle cannot be met honestly.** → Ship the measurement (Rank 3) and say so. Never widen C1b's
   band, never shrink the INTERIOR box, never re-pin a fingerprint without proof in the report *and* the
   commit body.

---

## Bars changed

**This plan changes no bar.** It is read-only; `src/core/scene3d/surface-fill.js` in the scratch export was
patched, measured through seven variants, and **restored byte-identical** (verified: `node --check` clean
and `scene3d-crosshatch-cell-shape.test.js` back to **23/23** on the restored file). No file in any
worktree or in MAIN was modified except this report.

**Bars the implementer is expected to move, each needing its own `## Bars changed` row with old → new per
config and orchestrator sign-off:**

| file | expected move | why |
|---|---|---|
| `tests/unit/scene3d-crosshatch-cell-shape.test.js` — `CEILING` C1 columns | tightened on the primitives the fix improves | the ceiling is the baseline to beat; a fix that improves it must re-pin it **downward**, never up |
| `tests/unit/scene3d-crosshatch-cell-shape.test.js` — `CEILING` C2 `spreadA`/`spreadB` | tightened (V7 measured 15.18 → 3.77 on the sphere) | same |
| `tests/unit/scene3d-curved-density-floor.test.js:292-295` | **only if** the sphere crosshatch fill counts 22/18/120/116 move | they should NOT move — M1's decoupling preserves ruling counts exactly. If they do, the decoupling leaked |
| `tests/unit/scene3d-crosshatch-parity.test.js` P5b | **must not move** | it is a floor on shipped ink; moving it down would hide exactly the −18 % the prototype measured |

**No bar in `scene3d-ladder-uniform-field-spacing`, `scene3d-fill-span-verdict`, `scene3d-plot-safety`,
`scene3d-curved-density-sparse-end`, `scene3d-hatch-density-angle-stable` (W-36b),
`scene3d-fill-ruling-corners` (W-33) or any `scene3d-mark-laws-draw` oracle may move.**

---

## Appendix A — the Rank-1 (M1) prototype diff, as measured

Applied to `src/core/scene3d/surface-fill.js` at `3bc61c32` in
`/private/tmp/claude-501/scratch-W31b`, `node --check` clean, reverted after measurement. Knobs live on
`globalThis.__W31B` (`{ off, smooth, rmax, lam, wsmooth, mode, decouple }`) purely so the OFF path could be
proven byte-equivalent; **a shipping version must hard-code the chosen constants and delete the knobs.**
V7 = `{ mode: 'gap', smooth: 8, rmax: 2, lam: 1, wsmooth: 2, decouple: true }`.

```diff
--- a/src/core/scene3d/surface-fill.js
+++ b/src/core/scene3d/surface-fill.js
@@ -9946,7 +9946,43 @@
           at.steps = steps * len;
           return at;
         };
-        return { span: period, lineAt: lineAtWrapped, na, nb, da, db };
+        // W-31b PROTOTYPE: the SAME wrapped ruling, displaced along the family
+        // NORMAL by a per-sample offset instead of drawn at one uniform
+        // parameter offset. `warpArr` is the walk's cumulative per-sample
+        // offset in `frac` units; its length is the family's own `st+1` sample
+        // grid, which never depends on `frac` because `len` above does not.
+        // LINEARLY INTERPOLATED: W-31's spike used nearest-neighbour
+        // (`Math.round`), which turns every ruling into an `n`-step staircase —
+        // the measured cause of its per-window scatter regression.
+        const lineAtWarped = (baseFrac, warpArr) => {
+          const c = baseFrac * period;
+          const a0 = c * na; const b0 = c * nb;
+          const ta = (0 - a0) / da; const tb = (1 - a0) / da;
+          const t0 = Math.min(ta, tb); const t1 = Math.max(ta, tb);
+          const len = t1 - t0;
+          const n = warpArr ? warpArr.length : 0;
+          const at = (tt) => {
+            const t = t0 + len * tt;
+            // ABSOLUTE offsets: the walk normalises each ruling's per-sample
+            // step so its AREA-WEIGHTED mean is exactly the scalar `df`, which
+            // makes the area-weighted mean of `warpArr` exactly `baseFrac`.
+            // The ruling is therefore already centred where the scalar walk put
+            // it, and no mean subtraction is needed.
+            let off = 0;
+            if (n === 1) off = warpArr[0] - baseFrac;
+            else if (n > 1) {
+              const g = clamp(tt, 0, 1) * (n - 1);
+              const i0 = Math.min(n - 2, Math.max(0, Math.floor(g)));
+              const w = g - i0;
+              off = (warpArr[i0] * (1 - w) + warpArr[i0 + 1] * w) - baseFrac;
+            }
+            const dOff = off * period;
+            return { a: clamp(a0 + t * da + dOff * na, 0, 1), b: wrap01(b0 + t * db + dOff * nb) };
+          };
+          at.steps = steps * len;
+          return at;
+        };
+        return { span: period, lineAt: lineAtWrapped, na, nb, da, db, lineAtWarped };
       }
       // Perpendicular extent of the unit square → the offsets to sweep through.
       const projs = [0, na, nb, na + nb];
@@ -10010,6 +10046,33 @@
         : (kind === 'b' ? { a: 0, b: 1 } : { a: 1, b: 0 });
       const dirOf = fam ? { a: fam.da, b: fam.db }
         : (kind === 'b' ? { a: 1, b: 0 } : { a: 0, b: 1 });
+      // W-31b PROTOTYPE — per-sample ("warped") placement, gated to the
+      // crosshatch pair on the wrapped-angle branch ONLY.
+      const W31BCFG = (typeof globalThis !== 'undefined' && globalThis.__W31B) || {};
+      const W31B = W31BCFG.off !== true;
+      const W31B_SMOOTH = Number.isFinite(W31BCFG.smooth) ? W31BCFG.smooth : 2;
+      const W31B_RMAX = Number.isFinite(W31BCFG.rmax) ? W31BCFG.rmax : 3;
+      const W31B_MODE = W31BCFG.mode || 'df';
+      const W31B_LAM = Number.isFinite(W31BCFG.lam) ? W31BCFG.lam : 1;
+      const W31B_WSMOOTH = Number.isFinite(W31BCFG.wsmooth) ? W31BCFG.wsmooth : 0;
+      const W31B_DECOUPLE = W31BCFG.decouple !== false;
+      // W-31b MIRROR MODE: family A is untouched; only the CROSSING family is
+      // placed, and it is placed against family A's ACTUAL LOCAL spacing at
+      // each of its own samples — `perpPitch` evaluated with family A's own
+      // offset/direction vectors, which is a pure function of the sample's
+      // chart derivatives and needs no cross-family state at all.
+      const famX = (W31B_MODE === 'mirror' && crossShare != null && crossShare.role === 'b'
+        && kind === 'angle')
+        ? angleFamily(finite(angleDeg, 0) - finite(crossShare.delta, 90)) : null;
+      const unitOffX = famX ? { a: famX.na * famX.span, b: famX.nb * famX.span } : null;
+      const dirOfX = famX ? { a: famX.da, b: famX.db } : null;
+      const useWarp = W31B && crossShare != null && isEvenLadder()
+        && fam && typeof fam.lineAtWarped === 'function'
+        && (W31B_MODE !== 'mirror' || famX != null);
+      const warpSt = useWarp
+        ? Math.max(8, Math.round(((fam.lineAt(0) || {}).steps) || baseSteps)) : 0;
+      const warpArr = useWarp ? new Float64Array(warpSt + 1) : null;
+      const lineAtEff = useWarp ? ((frac) => fam.lineAtWarped(frac, warpArr)) : lineAt;
       // The projection's own scale, measured once. Orthographic and uniform, so
       // one number converts world millimetres to screen millimetres — which is
       // what `contFieldSurface` and `contFieldFore` need in order to state a
@@ -10055,8 +10118,8 @@
       // sample stands for (arc length along × clearance across), because that is
       // what the eye integrates — a parameter-weighted mean would let a
       // foreshortened pole outvote the whole lit face.
-      const probe = (frac) => {
-        const at = lineAt(clamp(frac, 0, 1));
+      const probe = (frac, useBase) => {
+        const at = (useBase ? lineAt : lineAtEff)(clamp(frac, 0, 1));
         if (!at) return null;
         // W-26 FOLLOW-UP FIX (found by this unit's own guard sweep, not named in
         // the brief): the probe's OWN numerical resolution — how finely it
@@ -10090,13 +10153,24 @@
         // this fix does not touch that line.
         const st = Math.max(8, Math.round(at.steps || baseSteps));
         const pts = [];
+        // W-31b: per-sample local pitch and per-sample tone target, same length
+        // as `pts` (`st+1`), `null` where the sample was culled. Additive — the
+        // scalar `I`/`mmPerFrac` returns below are unchanged, so every other
+        // caller is byte-identical.
+        const mmArr = [];
+        const wantArr = [];
+        const wArr = [];
+        const mmXArr = [];
         let iSum = 0; let wSum = 0;
         let mmSum = 0; let mmW = 0;
         let prevW = null; let prevS = null;
         for (let s = 0; s <= st; s++) {
           const pr = at(s / st);
           const smp = sampleAt(pr.a, pr.b);
-          if (!smp || smp.front !== wantFront) { pts.push(null); prevW = null; prevS = null; continue; }
+          if (!smp || smp.front !== wantFront) {
+            pts.push(null); mmArr.push(null); wantArr.push(null); wArr.push(0); mmXArr.push(null);
+            prevW = null; prevS = null; continue;
+          }
           const scr = { x: smp.x, y: smp.y, I: smp.I };
           pts.push(scr);
           // The ruling's own world tangent, from the step just taken.
@@ -10126,10 +10200,22 @@
           const area = Math.max(1e-4, segLen) * Math.max(1e-3, finite(mm, 1));
           iSum += clamp(finite(smp.I, 0), 0, 1) * area; wSum += area;
           if (mm > 1e-6) { mmSum += mm * area; mmW += area; }
+          mmArr.push(mm > 1e-6 ? mm : null);
+          wArr.push(area);
+          mmXArr.push(unitOffX ? perpPitch(smp, unitOffX, dirOfX) : null);
+          // The per-sample form of the SAME rule the scalar `want` below
+          // applies to the ruling's area-weighted mean `I`.
+          wantArr.push(isEvenLadder()
+            ? (crossShare != null
+              ? ladderPairWantedPitch(smp.I, crossShare.ratio, crossShare.role, crossShare.delta)
+              : ladderWantedPitch(smp.I))
+            : cfWantedPitch(smp.I));
           prevW = smp.world; prevS = scr;
         }
         if (!(wSum > 0) || !(mmW > 0)) return { on: false, pts };
-        return { on: true, pts, I: iSum / wSum, mmPerFrac: mmSum / mmW };
+        return {
+          on: true, pts, I: iSum / wSum, mmPerFrac: mmSum / mmW, mmArr, wantArr, wArr, mmXArr,
+        };
       };
       // ── ACROSS-FLOW CLEARANCE, MEASURED (Zander §4) ─────────────────────────
       // The seeding offset is the clearance in the MIDDLE of a ruling and a lie
@@ -10219,6 +10305,14 @@
           guard += 1;
           const pb = probe(f);
           if (!pb || !pb.on) { f += creep; continue; }
+          // W-31b: the SCALAR bookkeeping (`want`, `df`, and therefore the
+          // family's ruling count, its ink and every `maxN`/`guard` bound) is
+          // read from the UNWARPED base ruling. The warped ruling bulges toward
+          // the low-`perpPitch` band, which lowers its own area-weighted
+          // `mmPerFrac`, which shrinks `df`, which adds rulings — measured as a
+          // +27% count drift on family B alone. Decoupling the two makes the
+          // count and ink identical to the shipped walk by construction.
+          const pbS = (useWarp && W31B_DECOUPLE) ? (probe(f, true) || pb) : pb;
           // W-26: `ladder`/`fineLadder`/`phaseFineLadder` walk this SAME
           // continuous engine but state their tone target through
           // `ladderWantedPitch` (the master-grid pitch each law always
@@ -10232,9 +10326,9 @@
           // `crossDensityRatio = 1` — see that function's comment for why.
           let want = isEvenLadder()
             ? (crossShare != null
-              ? ladderPairWantedPitch(pb.I, crossShare.ratio, crossShare.role, crossShare.delta)
-              : ladderWantedPitch(pb.I))
-            : cfWantedPitch(pb.I);
+              ? ladderPairWantedPitch(pbS.I, crossShare.ratio, crossShare.role, crossShare.delta)
+              : ladderWantedPitch(pbS.I))
+            : cfWantedPitch(pbS.I);
           // 'contFieldMeasured' — the global response inversion, from pass 1.
           if (TONE_ALGO === 'contFieldMeasured' && cfLut) {
             want = clamp(inkWidth() / Math.max(1e-6,
@@ -10269,7 +10363,7 @@
           // call, so `want` (and therefore every front-face render) is
           // untouched — this is scoped strictly to the X-ray back pass.
           if (back) want /= backDensity;
-          let df = clamp(want / Math.max(1e-6, pb.mmPerFrac), dfMin, dfMax);
+          let df = clamp(want / Math.max(1e-6, pbS.mmPerFrac), dfMin, dfMax);
           if (TONE_ALGO === 'contFieldAniso' && prevPts) {
             // Two corrections, never more: this is a fixed-point step, not a
             // solve, and a third pass moves the answer by under a per cent.
@@ -10293,7 +10387,145 @@
               if (b) cfAddRad(fld, b.x, b.y, b.I);
             }
           }
-          placed.push({ frac: f, df, I: pb.I, want });
+          // W-31b PROTOTYPE. Snapshot BEFORE this iteration's own update: that
+          // snapshot is what `probe(f)` above actually read, so it IS this
+          // ruling's placed shape. Then take one step per sample.
+          const warpSnap = useWarp ? warpArr.slice() : null;
+          if (useWarp && pb.mmArr && pb.wantArr && pb.mmArr.length === warpArr.length) {
+            const n = warpArr.length;
+            const raw = new Float64Array(n);
+            const ok = new Uint8Array(n);
+            for (let k = 0; k < n; k++) {
+              const mm = pb.mmArr[k]; const wt = pb.wantArr[k];
+              if (W31B_MODE === 'mirror') {
+                const mx = pb.mmXArr ? pb.mmXArr[k] : null;
+                if (mm != null && mm > 1e-6 && mx != null && mx > 1e-6) {
+                  // The SHAPE only: family A's local gap at this point is
+                  // proportional to its own local `perpPitch`, so matching it
+                  // means a step proportional to `mmA_local / mmB_local`. The
+                  // area-weighted normalisation below sets the SCALE, so family
+                  // B's ruling count and ink are unchanged by construction.
+                  raw[k] = mx / mm; ok[k] = 1;
+                }
+              } else if (mm != null && mm > 1e-6 && wt != null) {
+                let st2 = wt / mm;
+                if (back) st2 /= backDensity;
+                raw[k] = clamp(st2, dfMin, dfMax); ok[k] = 1;
+              }
+            }
+            // HOLE FILL. A culled sample (off-surface, back-facing, past the
+            // silhouette) has no local metric. W-31's spike substituted the
+            // SCALAR `df` there, which re-injects the ruling-MEAN error exactly
+            // at the silhouette — i.e. in the outermost interior column that
+            // failed its own gate. Carry the nearest valid neighbours instead.
+            let anyOk = false;
+            for (let k = 0; k < n; k++) if (ok[k]) { anyOk = true; break; }
+            if (!anyOk) { for (let k = 0; k < n; k++) raw[k] = df; } else {
+              const prevIdx = new Int32Array(n); const nextIdx = new Int32Array(n);
+              let last = -1;
+              for (let k = 0; k < n; k++) { if (ok[k]) last = k; prevIdx[k] = last; }
+              last = -1;
+              for (let k = n - 1; k >= 0; k--) { if (ok[k]) last = k; nextIdx[k] = last; }
+              for (let k = 0; k < n; k++) {
+                if (ok[k]) continue;
+                const a2 = prevIdx[k]; const b2 = nextIdx[k];
+                if (a2 < 0) raw[k] = raw[b2];
+                else if (b2 < 0) raw[k] = raw[a2];
+                else {
+                  const w = (k - a2) / Math.max(1, b2 - a2);
+                  raw[k] = raw[a2] * (1 - w) + raw[b2] * w;
+                }
+              }
+            }
+            // SMOOTH. The step field must stay C1 or the accumulated warp puts
+            // a high-frequency zigzag into every ruling, which is what the
+            // local-normal gap instrument (and the eye) reads as scatter.
+            for (let it = 0; it < W31B_SMOOTH; it++) {
+              const sm = new Float64Array(n);
+              for (let k = 0; k < n; k++) {
+                const a2 = raw[Math.max(0, k - 1)]; const b2 = raw[Math.min(n - 1, k + 1)];
+                sm[k] = (a2 + 2 * raw[k] + b2) / 4;
+              }
+              raw.set(sm);
+            }
+            // NORMALISE AGAINST THE WALK'S OWN METRIC. `probe` states
+            // `mmPerFrac` as the mean of `mm` weighted by each sample's screen
+            // AREA (arc length along x clearance across) — the only weighting
+            // the eye's own integral matches. Weighting the per-sample step
+            // field by that SAME weight makes its weighted mean exactly the
+            // scalar `df`, so `f`, `maxN`, `guard`, `creep`, the family's
+            // ruling COUNT and its ink are all bit-identical to the unwarped
+            // walk, and the warp carries the SHAPE only. Weighting by sample
+            // COUNT instead (W-31's spike, and this unit's first two
+            // prototypes) over-represents the compressed silhouette band, which
+            // measured as a 28% median-gap collapse or a 40% count collapse.
+            let wa = 0; let wb = 0;
+            for (let k = 0; k < n; k++) {
+              const w = (pb.wArr && pb.wArr[k] > 0) ? pb.wArr[k] : 0;
+              wa += w * raw[k]; wb += w;
+            }
+            const rBar = wb > 1e-12 ? wa / wb : (raw.length ? raw[0] : df);
+            if (rBar > 1e-12) {
+              // Bound the warp's authority per sample: unbounded, a chart pole
+              // (`perpPitch` -> 0) takes the whole ruling.
+              let ra = 0; let rb = 0;
+              for (let k = 0; k < n; k++) {
+                raw[k] = clamp(raw[k] / rBar, 1 / W31B_RMAX, W31B_RMAX);
+                const w = (pb.wArr && pb.wArr[k] > 0) ? pb.wArr[k] : 0;
+                ra += w * raw[k]; rb += w;
+              }
+              let mR = rb > 1e-12 ? ra / rb : 1;
+              if (W31B_MODE === 'gap' || W31B_MODE === 'mirror') {
+                // SCALE ON THE ACHIEVED GAP, not on the step. The shipped walk
+                // achieves an AREA-WEIGHTED MEAN gap of exactly `want`
+                // (`gap_k = df x mm_k`, and `df x awmean(mm) = want` by the
+                // definition of `mmPerFrac`). A per-sample step field is
+                // anti-correlated with `mm` by construction, so normalising the
+                // STEP to `df` no longer lands that mean — measured as a 28-35%
+                // median-gap collapse. Normalise the achieved GAP instead.
+                let ga = 0; let gb2 = 0;
+                for (let k = 0; k < n; k++) {
+                  const mm2 = pb.mmArr[k];
+                  const w2 = (pb.wArr && pb.wArr[k] > 0) ? pb.wArr[k] : 0;
+                  if (mm2 != null && mm2 > 1e-6 && w2 > 0) { ga += w2 * raw[k] * mm2; gb2 += w2; }
+                }
+                if (gb2 > 1e-12 && ga > 1e-12) {
+                  const gBar = ga / gb2;
+                  const scale = clamp(want / gBar, 1e-6, 1e6);
+                  mR = 1 / scale * df;
+                }
+              }
+              // RELAXATION. Full correction (`lam` = 1) makes each ruling the
+              // exact offset curve of its predecessor; the warp then compounds
+              // over the whole family and neighbouring rulings can cross.
+              // `lam` < 1 is a partial correction per ruling, which still
+              // converges over several rulings but bounds the compounding.
+              for (let k = 0; k < n; k++) {
+                const sh = 1 + W31B_LAM * ((raw[k] / mR) - 1);
+                warpArr[k] += df * Math.max(0.05, sh);
+              }
+              // CURVATURE BOUND on the ACCUMULATED field. Amplitude limits
+              // (`W31B_RMAX`) bound how far a sample may move; they do not
+              // bound how sharply the ruling BENDS, and a sharply bent ruling
+              // can approach its neighbour in a direction other than the family
+              // normal (measured: torus d=220 within-family p95/p05 blows from
+              // 7.5 to 301 with no amplitude violation anywhere).
+              for (let it = 0; it < W31B_WSMOOTH; it++) {
+                const sw = new Float64Array(n);
+                for (let k = 0; k < n; k++) {
+                  const a3 = warpArr[Math.max(0, k - 1)];
+                  const b3 = warpArr[Math.min(n - 1, k + 1)];
+                  sw[k] = (a3 + 2 * warpArr[k] + b3) / 4;
+                }
+                warpArr.set(sw);
+              }
+            } else {
+              for (let k = 0; k < n; k++) warpArr[k] += df;
+            }
+          }
+          placed.push({
+            frac: f, df, I: pb.I, want, warp: warpSnap,
+          });
           prevPts = pb.pts;
           f += df;
         }
@@ -10320,7 +10552,7 @@
       if (!placed || !placed.length) return;
       nextFam('A');
       placed.forEach((p, i) => {
-        const at = lineAt(p.frac);
+        const at = (useWarp && p.warp) ? fam.lineAtWarped(p.frac, p.warp) : lineAt(p.frac);
         if (!at) return;
         // `pitchStep` is the ruling's OWN gap, not a family constant — which is
         // the whole difference between this family and every other one here, and
```

### Scratch dirs used
`/private/tmp/claude-501/scratch-W31b` (`git archive 3bc61c325c44e02ba14819dbc7b9242bc340ce68` from `.claude/worktrees/fill-audit-a3`, `node_modules` symlinked from MAIN). The prototype patch was reverted and the file restored byte-identical; the throw-away measurement harness (`tests/unit/zzw31b-measure.test.js`) and the saved diff (`W31b-prototype.diff`) remain there for this session only and are reproduced above so nothing depends on them surviving. Nothing was written to any worktree or to MAIN except this report.
