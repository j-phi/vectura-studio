# Round 7 submission — backlog

> **Read §1 first.** Item 1 gated the round on purpose: three criteria were being
> scored by instruments that excluded the thing they measure, so every number
> below is taken on the repaired harness, and the R6 column of every before/after
> is *re-measured*, not carried. Where a repaired number disagrees with a Round 6
> number, the repaired one is the honest one and I say so.


Branch `shadow-anatomy`, worktree `agent-a71c6348dd322a40a`. Not merged to `p4`.
Views in `r7a/` (116 views + 17 crops, all gridded). Baseline before any Round 7
source change is `r7base/`, taken on the **repaired** harness so every
before/after below is measured by the same instrument.

---

## 1. The four instruments — repaired first, everything else scored on them

All four defects the review found are fixed, and the repaired harness now
**reproduces your independently-computed numbers to the digit** (`Z0` max 0.705,
`max(Z0)/max(object)` 1.11). That cross-check is the reason to trust the rest.

**#1 — the fixture is no longer restated.** `render.js` is now the single source
of every camera, light, object list and view builder, and exports
`buildParams` / `buildPaths` / `objectsOf`. `m4.js`, `facets.js`, `matrix.js` and
`p2.js` all `require` it. A measurement can no longer drift from the render,
which is the thing that produced `[BALL]` vs `[BALL, POST]`.

**#2 — the silhouette mask no longer eats the collar.** Two layers of this, not
one. The disc came out, and the object mask is now the true projected silhouette
(convex hull of the object's own ink — exact, every fixture primitive is convex).
But `Z0` was still coming back n = 7, because the *interiority* rule was "the
window lies wholly inside the light-projected footprint", and the contact set
lies **on** that footprint's base edge by construction. Replaced with "the window
is wholly covered by drawn region". Mixing is rejected by an 80 %-purity test on
attributed ink, not by geometry — so no clearance ring is needed, and the ring
was costing the entire measurement.

| | R6 instrument | R7 instrument |
|---|---|---|
| `Z0` patches scored on `A-2` | 0 (disc ate them) / 29 (your hand count) | **20**, max **0.705** |
| `C1` `Z0`/`Z2` | 2.49× | **2.90×** |
| `max(Z0)/max(object)` | 1.11× | **1.11×** (reproduced exactly) |

**#3 — the limb mask no longer eats zone R.** `LIMB = 0.93` is gone; the rule is
now the same "wholly inside the silhouette" test the shadow side uses, with no
radial term at all.

**But the mask was not the whole story, and n ≥ 30 was unreachable on that
fixture.** Zone R is 7.7 % of the visible surface (sample census, printed every
run). On the 46 mm ball that is ~510 mm² of screen — **~32 windows of 4 mm²
in total**, before any purity or dominance test. Demanding n ≥ 30 there is a
statement about the fixture, not the instrument. So I added `W-bigball-*`: the
same ladder at twice the radius, which quadruples R's area at the same 4 mm
window. R now measures with the n you asked for:

| fixture | R n | R/F | verdict |
|---|---|---|---|
| `E-bands4` (r 46, sun 28°) | 11 | 0.360 | n below your own bar |
| `V-E-bands4-sun45` (r 46, sun 45°) | 14 | 0.254 | ditto |
| **`W-bigball-bands4` (r 92, sun 28°)** | **50** | **0.285** | **O2 measured, n ≥ 30** |
| **`W-bigball-sun45` (r 92, sun 45°)** | **58** | **0.254** | **O2 measured, n ≥ 30** |

O2 and O23 are no longer unmeasured. R/F is 0.25–0.36 against a ≤ 0.60 bound, on
four fixtures.

*(One instrument bug I introduced and caught: the sample grid must scale with the
object or `tot < 20` silently becomes an area filter — at r 92 a fixed 200×200
grid puts ~5 samples in a 4 mm window and the whole ladder vanished. N now scales
with radius and resolves to exactly 200 at r 46, so the existing fixture's
numbers do not move.)*

**#4 — crops are gridded.** `shoot.js`'s grid routine is shared between full
views and crops. **`B-cube-zoom` is in `density.json`** for the first time:
**0 patches ≥ 0.90, 0 ≥ 0.80, max 0.735 ≤ 0.85.** The R5 acceptance clause that
has been formally unmet for three rounds is now formally met, not merely covered
by `F-trio`.

---

## 2. C2 — closed. And the diagnosis was right, but one term deeper.

Your ruling (ii) was correct about the base pass, and it was correct about the
route. It was not the whole leak. Capping the base pass alone moved the peak by
nothing at first, and the reason is worth having:

**The cross pass modelled family A's already-laid coverage using the CROSS
family's local pitch** — the only pitch in its scope. Family A runs at a
different angle and therefore a different pitch, so `cA` was evaluated on the
wrong quantity. Where the cross ran sparser than A, `cA` came out too low,
`room` too generous, and the pair composed past the ceiling anyway. Measured at
the peak window: family A 0.497, crossed family 0.289, composed 0.642 against a
0.47 ceiling.

That is your own principle again, one term over. So the budget is no longer
modelled at all. **Each pass gets a share of the zone's composed ceiling in
proportion to the ink it is meant to contribute, and enforces only its own share
against its own pitch — the one pitch it actually knows.** Because
`1 − ∏(1 − cᵢ)` with `cᵢ = 1 − (1 − ceil)^(wᵢ/W)` is exactly `ceil` when every
pass saturates, the total is bounded by construction and no pass needs to know
about any other. The Density overflow family is in the denominator, so it can no
longer spend budget nobody accounted for.

| | before | after | bar |
|---|---|---|---|
| `max(object)` | 0.636 | **0.531** | ≤ 0.56 |
| `max(Z0)/max(object)` | 1.11× | **1.33×** | ≥ 1.25× |
| `p90(Z0)/p90(object)` | 1.62× | 1.65× | ≥ 1.25× |
| object p50 / p90 / p99 | .176 / .418 / .555 | .178 / .424 / **.507** | — |
| `Z0` mean / max | 0.642 / 0.705 | **0.642 / 0.705** | untouched |

**C2 meets the spec text, both re-specified clauses, and the standing
1.25×-on-max ruling.**

### T/F moved. I stopped, as instructed.

You predicted T/F would not move. It moved: **1.592 → 1.455**.

I have not tuned it back, and I have not attempted item 10 (rebuild the ladder to
margin), because that would be re-tuning the same surface after being told to
stop. The measurements, so you can rule:

| | before | after |
|---|---|---|
| T | 0.401 | **0.417** (up) |
| F | 0.252 | **0.287** (up more) |
| M | 0.188 | 0.142 |
| F/M | 1.337 | **2.022** (MISS → PASS) |
| T/F | 1.592 | **1.455** |
| L | 0.090 | 0.082 |

**The ramp did not flatten — it steepened.** T rose; F/M went from missing its
bar to clearing it by 39 %. What fell is the *ratio*, because F gained the
crossed family that the mis-modelled `room` had been starving it of. Against the
spec's own O1 bar (≥ 1.25×) T/F 1.455 passes with 16 % margin; it is your
harness's self-imposed 1.60 that it misses.

My read, offered as disagreement rather than as a fix: **the 1.60 bar was set on
a number produced by the leak.** F was being under-inked by a modelling error, so
T/F was flattered. I would rather report 1.455 honestly than restore 1.592 by
re-breaking F. But it is your ladder and your call.

---

## 3. C15 — the regression test exists, and it found a live hole

The Round 6 RGR gap is closed: `tests/unit/scene3d-plot-safety.test.js`.

It asserts **composed coverage, never a pitch**, and it reads the collar's family
plan through a new seam (`__collarForTest`) rather than off the emitted paths —
a ruling's pitch is observable only where two adjacent rulings both survive
clipping, and inside the collar they mostly do not, so measuring the drawn
spacing there reports the clipping, not the ladder. The composition and the
assertion are done in the test, in the spec's own terms, so the test cannot
re-bless the implementation's arithmetic.

Red/green provenance: against `628fb5f^` the collar composes to **0.919** against
a 0.80 bound and the first test fails; at `628fb5f` and after it passes.

**And writing it found a live C15 hole in the protected code.** Striding family A
discharges the ceiling only while family A is the term that busts it. At a wide
pen it is not: one crossed family *alone* composes to **0.833** on a 0.96 mm grid
against a 0.80 bound, and no stride on A can touch that. `collarStrideFor`
returned stride 6 and reported itself satisfied while the collar flooded — the
same error as Round 6's, one term over. The crossed families now take a
ruling-subset stride of their own (same keep-every-k-th, same shared grid, so the
subset architecture is untouched).

**Correction to my own commit message, before you find it.** I wrote there that
the cross-stride "evaluates to 1 at every shipped pen and density". That is too
strong, and the enumeration is the thing to record, not the claim I preferred:

| pen | sBase | strideA | crossStride | composed |
|---|---|---|---|---|
| 0.3 | 0.36 | 6 | **2** | 0.498 |
| 0.3 | ≥ 0.5 | 1–2 | 1 | 0.72–0.78 |
| 0.5 | ≤ 0.5 | 6 | **2** | 0.498 |
| 0.8 | ≤ 1.0 | 6 | **2** | 0.48–0.50 |

So it engages at pen 0.3 too, once `sBase` falls to ~0.36 — i.e. at very high
shadow density, which is exactly the flooding regime it exists for. What *is*
true, and is the claim that matters: **it is inert on every fixture in this
harness.** `Z0` is bit-identical at 1318 mm / 211 paths across Layers 2/3/4
before and after, no cast-shadow golden moved, and the `c15.js` rows are
unchanged from `r6c`.

The object half of C15 is now measured too, per your Round 7 ruling. D is
**rasterised**, not summed from ink length: ink × pen / area is additive and
double-counts every crossing — it reports 0.656 where the drawing is 0.531.

---

## 4. Protected list — re-verified, nothing regressed

Cast-shadow ink is **bit-identical** across every view before and after.

- `Off` = **16109.77 mm** (C12) — unchanged.
- Layers 2 / 3 / 4 = **7840.20 / 8896.93 / 7448.60 mm** (C11) — unchanged, and
  identical to your own re-verification.
- **`Z0` = 1318 mm / 211 paths at Layers 2, 3 and 4** — identical, as protected.
- Conservation: `Z2` 6522 → 5802 → 3735, `Z1` 1776 / 1750, `Z3` 645 — intact.
- `c15.js` rows at HEAD: `A-2/3/4` max **0.705** (identical to R6), `F-trio` max
  **0.733**, `B-cube-zoom` max **0.725**. **Zero patches ≥ 0.80 anywhere**, and
  all three are under the 0.85 collar bound. `F-trio` moved 0.709 → 0.733: that
  is the faceted terminator gaining its crossed family in `98289be` (O21), which
  is the intended effect, and it is declared here rather than left for you to
  find. Zero ≥ 0.90 and zero ≥ 0.80 are unchanged.
- `collarStrideFor` and the post-stride third-family admission: unchanged at
  every shipped pen; `COLLAR_CEIL` still 0.80.

9 curved-object tone goldens regenerated — stale assertions, the object's density
ceiling deliberately changed. **No cast-shadow golden moved.**

---

## 4b. The dispatch table — O9 / O11 / O14 / O15 all close (`a2bf25d`)

"One file eleven times" is over. Measured by md5 of the rendered SVGs:

| group | before | after |
|---|---|---|
| `H-perface-*` — O14, cube | 3 / 6 | **6 / 6** |
| `H-lightdriven-*` — O15, cube | 4 / 6 | **6 / 6** |
| `H-lp-perface-*` — O14, low-poly | 5 / 6 | **6 / 6** |
| `H-lp-lightdriven-*` — O15, low-poly | 4 / 6 | **6 / 6** |
| `J-sens-*` — O9, cube | 1 / 3 | **3 / 3** |
| `J-lp-sens-*` — O9, low-poly | 1 / 3 | **3 / 3** |
| `I-pen-*` — O11, cube | 2 / 4 | **4 / 4** |
| `I-lp-pen-*` — O11, low-poly | 3 / 4 | **4 / 4** |

Four root causes, and they are worth reading because none of them was "the
treatment is missing":

1. **The whole faceted dispatch was dead code.** It keyed off `isHighlightBand`,
   and **no cube face ever reaches the top tone band under an ordinary sun** — so
   the branch never ran, whatever treatment was selected. Replaced with a
   specular glint-facet predicate.
2. **`sparse` and `stippleOut` were literally the same implementation** (both
   just scaled Density). They were not colliding by accident; there was only one.
3. **`highlightSensitivity` was never read in `perFace`.** Now the angular
   tightness of the specular acceptance cone (§5.4 #4): ~73° → ~49° → ~36° at
   sensitivity 1/3/6, glint facet set 2 → 1 → 0, ink 2417 / 3032 / 3400.
4. **`altFill` drew zero marks** — its hotspot pitch (10.75 mm) exceeded the
   hotspot diameter (12.9 mm), so the region pass emitted nothing. Capped to the
   disc.

O11 pen counts on the cube, `pen-hl` paths: `none` 0 (total bypass, by the Round 3
addendum's contract), `sparse` 7, `stippleOut` 37, `dashed` 26 — all were 0.

Two stale assertions were inverted, both of which pinned the defect itself:
`highlightSensitivity is INERT under the default perFace mode` (that inertness
*was* O9), and a `bbox(lightDriven) < bbox(perFace)` proxy that no longer orders
once perFace aims at the specular facet — restated as the structural claim it
stood in for. No coverage deleted.

14 goldens moved, all faceted (`box-*`, `parity-box-and-sphere`, and two
object-side `shadow-*` box goldens). **No cast shadow moved:** in both `shadow-*`
goldens `byRegionClass.castShadow` is byte-identical (191 paths / 4248.7242 ink),
every `sphere-*` golden is unchanged, and across all 109 harness views carrying a
`castShadow` class, zero changed. I re-verified this independently against my own
protected numbers (§4).

**One flagged trade, not taken:** at sensitivity 1 the cone accepts 2 of the
cube's 3 visible facets, which is looser than §5.4 #8's ≤ 8 %-of-silhouette
bound. Tightening it costs O9 its third state on the cube. That is a design
trade, so it is yours: the knobs are `GLINT_REL` / `GLINT_ABS`.

## 5. View R — delivered, with a per-facet instrument, and it scores O20/O21

`R-cube-bands2/3/4`, `R-lp-bands2/3/4`, `R-pair-bands4`, plus `facets.js`, which
masks each 4 mm window against the **assembled** facet polygon and reads D from
the rasterised drawing.

### O20 — the cube. Measured for the first time.

| view | face:+X (N·L .624) | face:+Y (N·L .469) | face:+Z (N·L 0) | spread | monotonic? |
|---|---|---|---|---|---|
| bands 2, R6 | 0.108 | 0.159 | 0.157 | 1.48× | yes |
| bands 3, R6 | 0.151 | 0.122 | 0.162 | 1.33× | **NO — inverted** |
| bands 4, R6 | 0.128 | 0.141 | 0.168 | 1.32× | yes |
| bands 4, after `a2bf25d` | 0.053 | 0.065 | 0.168 | 3.15× | yes |
| **bands 4, after `98289be`** | **0.035** | **0.065** | **0.215** | **6.09×** | **yes** |
| **bands 3, after `98289be`** | **0.047** | **0.052** | **0.208** | **4.43×** | **yes** |
| **bands 2, after `98289be`** | **0.051** | **0.072** | **0.200** | **3.95×** | **yes** |

**Your R4 diagnosis was exactly right.** `band()` is a *threshold* quantizer,
calibrated for a continuum of normals — and a cube does not have one. Its three
faces sit at N·L 0.624 / 0.469 / 0.000, and under `[0.25, 0.5, 0.75]` the first
two **land in the same band**. Everything downstream was incidental carrier
crowding, which is why they measured 0.012 apart and why bands 3 inverted.

`rankBands()` implements your prescription with its two guards intact:

- **It engages only where the thresholds are the wrong tool** — when the object's
  own facets leave the top of the ladder unused *and* span more than 0.15 in
  intensity. Anything with a real gradient (low-poly sphere, tessellated solid)
  is left exactly as the thresholds put it. Not a blanket re-grade.
- **It never darkens.** The result is `max(thresholdBand, rankBand)`, so a
  one-sided stretch cannot invert an order and cannot drag a bright object into
  the dark bands, which a two-sided histogram stretch would.
- **It returns a band INDEX**, so the emitted value stays a function of band
  count by construction — that is the contract the reverted per-facet gain tilt
  broke. Verified: bands 2/3/4 still emit three different ink totals on the cube
  (2766.42 / 2728.37 / 2805.23 mm).
- **Every facet is ranked, front and back**, so a camera orbit cannot re-grade
  the object — O28's view-independence survives by construction, not by luck.

**Against your acceptance clause:** three visible faces, three distinct D,
strictly decreasing in N·L, **top 1.86× lighter than the darker lit side** (bar
1.2×), and the three band counts still separate on ink. Met.

**O22 still passes:** zero facets classified `T` on the cube at any band count.
The dihedral gate holds through the re-quantization.

### O21 — the low-poly terminator. Was inverted. Now clears the bar.

| | R6 | after `98289be` |
|---|---|---|
| `D(terminator facets)` (n=5) | 0.154 | **0.295** |
| `D(facets below)` (n=9) | 0.169 | 0.221 |
| ratio | **0.91×** | **1.33×** (bar ≥ 1.25×) |

The cause was flat: faceted terminator facets were emitting `F`'s ink recipe, so
`T` measured 0.159 against `F`'s 0.158–0.161 — **indistinguishable**, and the dip
ran backwards. They now spend `formInk('T')`'s crossed family the way the curved
path does.

Also worth your attention: on the frequency-2 geodesic, **17 of 40 visible facets
are smaller than the protocol's own 4 mm window.** `facets.js` reports them
rather than dropping them silently.

---

## 6. O17 and O26 — one root cause, diagnosed, not yet fixed

View `S` (`E-bands4` lit pole at 12×) and `R-pair-zoom` (faceted + curved in one
frame) together show it.

The crossed family's **+65° is applied in the surface's parameter frame, not in
screen space.** On a wrapped chart the two are not the same, and they diverge
exactly where the chart distorts — at the pole and at the limb. Consequences,
both visible in the crops:

- **O17:** near the lit pole the two families cross at close to **90° on screen**
  and the region reads as a **square grid / woven plaid** — precisely what §2.3
  forbids ("never +90°, which produces a visible square grid and moirés"). The
  "starburst" is this.
- **O26:** on the curved ball the tone-band boundaries are **traceable as edges**,
  because the flip positions align with parameter-space isolines rather than with
  anything on screen.

One fix serves both: measure the cross offset in the screen/tangent frame. Not
landed this round — see §8.

---

## 7. Items closed by measurement rather than by code

**Item 11 — "the capsule and the low-poly float in `F-trio`."** Correct, and it is
**the fixture, not the shadow code.** Lowest world vertex on the assembled mesh:

```
cube      y =  0.00 mm   rests
lowpoly   y =  2.00 mm   floats
capsule   y = 30.00 mm   floats
```

The shadow is drawn under an object that is genuinely in the air, so it is
correctly detached. I left `F-trio` **exactly as it is** — it carries the
protected C15 acceptance rows and moving it would make those incomparable — and
added `F-trio-rest` / `F-trio-rest-2` with all three objects verified at y = 0,
plus paired crops `F-rest-capsule` / `F-float-capsule`.

**Item 12 — pen-up travel, one measurement, before any `emitHatchLines` split**
(emitted order; the app's plotter sort runs downstream of this):

| view | paths | pen-down | pen-up | ratio |
|---|---|---|---|---|
| `A-off` | 889 | 26900 mm | 26609 mm | 0.99 |
| `A-4` | 1553 | 18238 mm | 26586 mm | 1.46 |
| `E-bands4` | 299 | 6259 mm | 7683 mm | 1.23 |
| `F-trio` | 2432 | 23638 mm | 40528 mm | 1.71 |

Note **`A-4` is cheaper in total travel than `A-off`** (44 824 mm vs 53 509 mm):
Layers ON raises the pen-up *ratio* but lowers pen-down enough to win outright.

---

## 8. Density stops — all six shot, and the dead zone is diagnosed

`P-density10/25/40/60/85/100` are rendered, gridded and in `density.json`.

```
10: 3402   25: 3402   40: 3402   60: 3980   85: 5971   100: 6739
span 1.98 : 1   (was 1.84 : 1)   bar 2.5 : 1
```

The bottom three stops are still byte-identical. **The cause is the O6 highlight
floor.** `lineCountFor` does vary with density (10 → 9 lines, 25 → 15, 40 → 20),
but the ladder's line budget is then **floored** at a master pitch measured in
pen widths, so every stop below the floor collapses onto it. The floor is a
minimum *line count*, which blocks the sparse direction as well as the dense one
— and §0 only forbids going *tighter*. Going sparser is legal and is what
Density below default should do.

Not landed. It is a real change to the line budget in `surface-fill.js` and it
interacts with O6, which is itself currently missing its bar (D(L) 0.082 vs 0.13).
I did not want to move that surface in the same round as the C2 cap, having been
told to stop when T/F moved.

---

## 8b. Commits

| SHA | what |
|---|---|
| `2823321` | one composed density budget split across every pass (C2, C15) + the C15 regression test + the collar cross-stride hole |
| `a2bf25d` | faceted highlight dispatch — glint facets, live sensitivity, real `sparse`/`stippleOut` (O9/O11/O14/O15) |
| `98289be` | rank-quantized faceted tone + the faceted terminator's crossed family (O20/O21) |

Suites at `98289be`: **unit 3764 pass**, integration pass, **visual 110 pass**.
Nothing pushed; branch not merged to `p4`.

## 9. What did not land, and why

- **Item 7 — O26** and **item 9 — O17.** Root-caused to one shared defect (§6):
  the cross offset is applied in the surface's parameter frame, so its *screen*
  angle drifts toward 90° exactly where the chart distorts. Not landed —
  `surface-fill.js` had already taken the composed-budget change this round and I
  did not want two independent edits to the curved density path in one round,
  having been told to stop when T/F moved. One fix serves both criteria.
- **Item 8 — density stops.** Diagnosed (§8), not landed.
- **Item 10 — rebuild the ladder to margin.** Deliberately not attempted: you
  asked me to stop rather than press on if T/F moved, and this item is tuning the
  same surface.
- **Item 2 — the live object defect.** Owned elsewhere; fixed on `3d-scene/p4`
  (`ee91289`). **This worktree predates that fix, so the object half is still not
  live-verifiable here** — measure the object side through the offline harness,
  as everything in §2–§6 above is.

  Two things I checked rather than assumed:

  1. **The offline harness is genuinely unaffected.** `render.js` publishes an
     explicit `mapper` for every object and drives the *monolith* path with no
     `object3d` children at all, so the style-less-child cascade never applies.
     Confirmed by emission, not by argument: `E-bands4` 205 `sceneFill` paths on
     the ball, `R-cube-bands4` 52, `R-lp-bands4` 230, `A-4` 205 + 41.
  2. **I tried the suggested workaround live and it does not reach.** Setting an
     explicit `style:{mapper:'hatch'}` on `params.objects[0]` changes nothing,
     because in the running app that array is not what carries the geometry — the
     scene's object is an **`object3d` child layer**, and my writes went to an
     unused list. `r7-live/L-ball-bands*.png` are the evidence: the requested
     sphere never appears (the frame still shows the default cube), `tone.bands`
     2/3/4 produce byte-identical ink (642 mm, 9 paths, all edges), and the cube
     is the bare outline you saw in `jay-layers/`. I stopped there rather than
     route around it, as briefed.

  **Consequence for the live frames I did deliver:** `r7-live/U-live-*` is valid
  *shadow* evidence — the shadow path never reads the object's style — but the
  box in those frames is an unfilled outline. Judge the ground, not the box.

---

## 10. Views delivered

`r7a/` — 116 views, 17 crops, all with `density.json` entries.

| asked for | delivered |
|---|---|
| **R** | `R-cube-bands2/3/4`, `R-lp-bands2/3/4`, `R-pair-bands4`, crops `R-lp-term` / `R-cube-faces` / `R-pair-zoom`, **plus `facets.js` printing per-facet D** |
| **S** | `S-litpole` — `E-bands4` lit pole at **12×** |
| **T** | `T-matrix-cube` / `-lowpoly` / `-ball` / `-pen` / `-sens` — labelled grids with per-cell md5, so "identical" and "similar" cannot be confused |
| **`B-cube-zoom` in `density.json`** | done — 0 ≥ 0.80, max 0.735 |
| **all six density stops** | done |
| **U** | `U-box-throw` / `U-box-throw-3` (offline, same box fixture) **and live from the running app** at deviceScaleFactor 3: `r7-live/U-live-{off,3,4}-throw.png` |

**On U specifically — it is not nothing.** The mottled patch mid-throw is the
umbra's dash-duty ramp (`0.85 − 0.9·t`) breaking into marks long enough to read
individually rather than as tone. The live crop resolves it. The collar in the
same frame reads well: it wraps the base on both sides, its outer edge is
feathered with staggered line-ends and no readable silhouette (C4, C9, C14 all
hold live).
