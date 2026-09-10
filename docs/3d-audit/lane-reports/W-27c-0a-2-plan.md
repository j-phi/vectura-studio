STATUS: PLAN-BLOCKED

# W-27c-0a-2 — residual saddle/pole ink merging: plan (measurement-first)

- **Role:** planner (read-only). **Lane:** fill-audit-d2 (:8481) — *not entered*.
- **Worked in:** scratch export of `323e2583` (fill-audit-d2 HEAD = W-35) at
  `/private/tmp/claude-501/scratch-W27c2`, `node_modules` symlinked. Removed on completion.
- **The fill-audit-d2 worktree was never touched** (a W-35 reviewer reads it).
- **Verdict: PLAN-BLOCKED.** Both levers the iter-4 review *required* be measured before
  level warping is considered are now measured and **both are dead**. A third lever of my own
  reaches the bar only by destroying the object and breaking the six W-27c-0a-4b guards that
  were ACCEPTed on 2026-09-08. Level warping, measured in both directions, is **worse than
  doing nothing**. And the decisive finding: **sub-bar (d)'s metric measures the wrong
  quantity** — §7.

## 0. Corrections to the brief's own framing (verify these before anything else)

1. **The brief's "blob width 2.10 mm torus / 14.85 mm sphere after iteration 4" is stale.**
   Those are iteration **2b**'s numbers (K=0.8, *unscoped* cull). Iteration 4 re-scoped the cull
   and largestW went **back to RED**. Measured at `323e2583` on the shipped engine-pipeline rig:
   **torus 3.35 mm, sphere 34.50 mm.** (The shipped test's own comments say the same:
   `scene3d-contour-slice.test.js:2056-2059` — "largest blob 3.35mm (==RED)… 34.5mm (==RED)".)
2. **The shipped iteration-4 cull improves largestW by exactly 0.00 mm.** Cull ON vs cull OFF
   (`mode:'off'`), same rig, same tree:

   | | paths | ink (mm) | blobCount | largestW |
   |---|---|---|---|---|
   | torus, cull OFF | 46 | 932.9 | 27 | **3.35** |
   | torus, cull ON (shipped) | 44 | 897.1 | 21 | **3.35** |
   | sphere, cull OFF | 27 | 1201.8 | 48 | **34.50** |
   | sphere, cull ON (shipped) | 26 | 1118.7 | 43 | **34.50** |

   The mechanism buys blobCount and nothing else. This corroborates the review's §4 finding that
   the four floors are defend-only, and it is the number that should have opened this unit.

## 1. Decomposition of the residual blob (iter-4 rig, native measurement resolution)

Rig: `buildRealEngineFills` exactly as shipped (`scene3d-contour-slice.test.js:1834`) —
real `engine.computeAllDisplayGeometry()`, `DEFAULT_CAMERA`, `contourSlice` / ladder /
fillDensity 50 / fillAngle 45, ground+backdrop off, pen 0.30 mm; `measureBlobs` ported
unmodified, 20 px/mm (1 px = 0.0025 mm²).

**1a. The reviewer's per-pixel probe, reproduced independently — exact match.**

| primitive | largest blob | area | pixels with ≥2 distinct pathIds *at that pixel* | distinct rings |
|---|---|---|---|---|
| torus | 985 px | **2.4625 mm²** | **278 = 28.22%** (0.6950 mm²) | 8 — `[24,26,28,30,32,34,36,39]` |
| sphere | 10744 px | **26.8600 mm²** | **2338 = 21.76%** (5.8450 mm²) | 16 — `[0..14,16]` |

Reviewer reported 278/985 = 28.2% / 8 rings and 2338/10744 = 21.8% / 16 rings. Reproduced to
the pixel, from a fresh implementation, on a different tree (`323e2583`, not `c6dd6130`).

**1b. But that is the wrong decomposition, and it *understates* the cross-ring share.**
`measureBlobs` does not call a pixel "merged" because two strokes overlap *at* it; it calls it
merged when a **1.5·penWidth window** around it is ≥75% inked. So the question that decides
whether a cross-ring mechanism can help is: *how many distinct paths ink that window?* Same
probe, window criterion instead of point criterion:

| primitive | solid px of largest blob | window contains ≥2 distinct paths | window contains exactly 1 path (true same-ring fold) |
|---|---|---|---|
| torus | 985 (2.4625 mm²) | **985 = 100.00% (2.4625 mm²)** | **0 = 0.00% (0.0000 mm²)** |
| sphere | 10744 (26.8600 mm²) | **10744 = 100.00% (26.8600 mm²)** | **0 = 0.00% (0.0000 mm²)** |

**Not one pixel of either largest blob is merged by a single ring folding on itself.** The
iter-4 report's "same-ring self-crossing, level warping is the only lever" is refuted outright,
not merely by a 22–28% minority. (Same-ring remains correct for the `waist` metric only, exactly
as the review said.) The 22–28% figure measures *pen-over-pen double-inking*, which is a strict
subset of *causing a merge*.

## 2. The two levers the review named, plus a third — measured

All numbers from the same rig. `band` = ring crossings on eight vertical scanlines
(x = 110,118,…,166 mm) through the torus's **flat lower band** (y ∈ [112,132] mm) — the
mm-space analogue of the review-3/review-4 §6 scanline test that caught the iteration-3 REJECT.
Shipped baseline `band = [0,2,1,3,3,2,4,1]` (sum 16). "Retention" = ink ÷ cull-inert ink
(torus 932.9, sphere 1201.8) — the live guard at `scene3d-contour-slice.test.js:1533`.

### Lever (a) — smaller / adaptive `CROWD_MIN_ARC_MULT` (currently 3 → 0.9 mm of arc)

| arcMult | T largestW | T blobs | T ink (ret.) | T band | S largestW | S blobs | S ink (ret.) | drops outside zone |
|---|---|---|---|---|---|---|---|---|
| **3 (shipped)** | 3.35 | 21 | 897.1 (96.2%) | [0,2,1,3,3,2,4,1] | 34.50 | 43 | 1118.7 (93.1%) | 0 T / 1 S |
| 2.0 | **3.00** | 22 | **898.6 (96.3%)** | **identical** | 34.50 | 43 | 1118.7 | 0 / 1 |
| 1.5 | 3.00 | 22 | 898.6 (96.3%) | identical | 34.50 | 43 | 1118.7 | 0 / 1 |
| 1.0 | 3.00 | 22 | 850.2 (91.1%) | −1 crossing | 34.50 | 43 | 1118.7 | 0 / 1 |
| 0.5 | 2.30 | 19 | 832.1 (89.2%) ✗ | −1 | 34.50 | 43 | 1118.7 | 0 / 1 |
| 0.25 | 2.15 | 15 | 817.0 (87.6%) ✗ | −1 | 34.50 | 43 | 1118.7 | 0 / 1 |
| 0 (degenerate) | 0 | 0 | 0 | all zero | 0 | 0 | 0 | everything |

- **The sphere is completely inert to lever (a) at every value from 3 down to 0.25** —
  byte-identical paths, ink, blobs, largestW. Root cause, from the per-ring instrumentation
  (§2d): **30 of the sphere's 31 candidate rings have `maxArc` exactly 0.0000** — no two
  *consecutive* points of any ring are both "near". Lowering an arc-length bar cannot help when
  the quantity being compared to it is identically zero.
- The torus improves 3.35 → 3.00 at arcMult 2.0 **for free** (ink goes slightly *up*, band
  byte-identical) and then only buys 3.00 → 2.15 by paying retention below the live 90% floor.
- Best honest result of lever (a): **3.00 mm / 34.50 mm** against a 0.9 mm bar.

### Lever (b) — peak-local-density trigger instead of the sustained-arc whole-run gate

I instrumented `makeCrowdGrid` with a `countNear(x,y,level)` returning the **number of distinct
other levels within `radius`**, and recorded the per-ring **peak** of that count.

**The signal the review hoped for does not exist.** Among rings the shipped mechanism *keeps*:

| primitive | rings | kept with peak ≥ 2 | ≥ 3 | ≥ 4 | ≥ 5 |
|---|---|---|---|---|---|
| torus | 47 | 11 | **2** (lv15 @ (155.8,106.9), lv21 @ (122.6,106.2)) | **0** | 0 |
| sphere | 31 | **2** (lv7, lv8 — both away from the pole) | **0** | 0 | 0 |

Consequences, measured:

| variant | T largestW | T ink (ret.) | T band sum | S largestW | S blobs | S ink |
|---|---|---|---|---|---|---|
| peak ≥ 3 only (arc gate replaced) | 3.00 | 880.8 (94.4%) | 16 | 34.50 | **48 (worse than 43)** | **1201.8 — cull fully inert** |
| peak ≥ 4 only / `arc3 OR peak≥4` | 3.35 | 897.1 | 16 | 34.50 | 43 | 1118.7 — **byte-identical to shipped** |
| `arc3 OR peak≥3` | 3.00 | 880.8 | 16 | 34.50 | 43 | 1118.7 |
| **peak ≥ 2 only** | **1.85** | 638.7 (**68.5%**) ✗✗ | **9** (was 16) ✗✗ | 26.30 | 36 | 1081.6 |

- Any threshold ≥ 3 is **inert-to-negative on the sphere** (it *removes* the one drop the shipped
  gate makes, so ink and blobCount go **up**).
- Threshold 2 is precisely the "unqualified any-single-near-sample" trigger the iteration-4
  implementer already measured and rejected: here it costs **31.5% of the torus's ink** and
  **halves the flat lower band** (16 → 9 crossings) — the exact iteration-3 REJECT signature.
- **Lever (b) is dead.** The review's hypothesis ("levels genuinely crowd but too *briefly* to
  trip the arc gate") is falsifiable and **false**: on the sphere they do not crowd at all under
  this grid, briefly or otherwise. §2d explains why.

### Lever (c) — mine: match the cull *radius* to the scale at which ink actually merges

`CROWD_CULL_K = 0.8` → radius 0.24 mm. But `measureBlobs` declares a merge when a
**0.95 × 0.95 mm** window is ≥75% inked — with a 0.30 mm pen that happens at a ring pitch of
about **0.40 mm**. *The cull's notion of "near" is ~1.7× tighter than the metric's notion of
"merged."* Rings at 0.25–0.40 mm merge in the oracle and are invisible to the trigger. Sweeping
K with the ≥2-distinct-levels gate and the arc gate both intact (a combination never tested —
the "K=1.0 is ruled out" note in STILL-OPEN was made against iteration 3's *unscoped* cull):

| K (radius) | T largestW | T ink (ret.) | T band | S largestW | S blobs | S ink (ret.) | cone ink | cyl ink |
|---|---|---|---|---|---|---|---|---|
| **0.8 (0.24 mm, shipped)** | 3.35 | 897.1 (96.2%) | sum 16 | 34.50 | 43 | 1118.7 (93.1%) | 787.18 | 1075.01 |
| 1.333 (0.40 mm) | 2.30 | 781.0 (**83.7%**) ✗ | sum 13 | **10.90** | 25 | 964.1 (80.2%) | 751.05 | 1033.66 |
| 2.0 (0.60 mm) | 2.00 | 609.0 (65.3%) ✗ | sum 11 | 4.05 | 7 | 782.2 (65.1%) | **657.87 ✗** | 1033.66 |
| 3.0 (0.90 mm) | **0.90** ✔ | 541.6 (58.1%) ✗ | sum 10 | **0.00** ✔ | **0** | 569.4 (47.4%) ✗ | **561.02 ✗** | **909.62 ✗** |

- **K = 3.0 is the only configuration in the entire parameter space that reaches ≤ 0.9 mm on both
  primitives** — and it does so by deleting 42% of the torus's ink and 53% of the sphere's,
  collapsing the flat lower band 16 → 10, dropping rings **outside** the saddle/pole zone
  (torus 3 of 16 drops at (160.5,98.5), (165.5,102.9), (116.7,99.9); sphere 6 of 11), and
  **breaking W-27c-0a-4b's cone and cylinder ink floors** (cone 561.02 < 708.46; cylinder
  909.62 < 967.51) — the guards a reviewer ACCEPTed one day ago specifically to stop this.
- K = 1.333 is the interesting middle: **sphere 34.50 → 10.90 mm (3.2×)**, torus 3.35 → 2.30.
  Ran the whole shipped guard file against it: **55/57 pass; exactly 2 fail, both retention** —
  `scene3d-contour-slice.test.js:1533` (781.00 vs the 839.63 floor) and `:1644/:1645`
  (half-retention 72.99% vs the >85 floor). **All six W-27c-0a-4b cone/cylinder guards pass.**
  Still 12× the bar on the sphere.

### 2d. Why the sphere is invisible to *both* named levers — the emit-order asymmetry

The grid is filled **greedily, in level order, from already-KEPT rings only**, and `isNear`
excludes the query ring's own level. The sphere's polar rings are emitted **first** (levels 5–9,
ring lengths 5.6 / 1.2 / 9.8 / 4.1 / 13.2 / 23.9 / 40.2 mm — the shrinking latitude circles), so
when the pole cluster is being decided **the grid is nearly empty**. By construction the first
two or three rings of any convergence cluster are always kept, and the cluster is scored against
an occupancy map that does not yet contain it. That, not the arc threshold, is why sphere
`maxArc` is identically 0 on 30 of 31 rings. A symmetric (two-pass) census would see it — but it
would then have to drop the *whole* cluster, which is lever (c) at large K, already measured
above.

### 2e. Level warping (the mechanism iteration 4 wanted, measured in both directions)

`buildSliceSegments` places plane `level` at `z = minD + (level/(count+1)) · span` — uniform in
`d`. I blended that toward two warps and swept the blend weight w. Positive w = arcsine
(spreads levels away from the `d`-extremes); negative w = raised-cosine (concentrates at the
`d`-extremes, spreads in the middle):

| warp | T largestW | T ink | T band | S largestW | cone largestW / ink | cyl largestW |
|---|---|---|---|---|---|---|
| 0 (shipped) | 3.35 | 897.1 | [0,2,1,3,3,2,4,1] | 34.50 | 31.30 / 787.2 | 41.70 |
| +0.25 | **4.10** | 935.9 | [0,1,1,2,3,3,3,1] | **39.75** | 32.75 / 817.1 | 41.85 |
| +0.50 | 3.75 | 940.1 | [0,0,0,1,2,3,4,0] | 39.80 | 34.10 / 844.6 | 41.90 |
| +0.75 | **10.40** | 896.8 | [0,0,0,0,2,3,4,1] | 39.80 | 35.75 / 912.0 | 42.40 |
| +1.00 | 4.45 | 917.7 | [0,0,0,0,2,3,4,0] | 39.80 | 39.30 / 954.2 | 42.60 |
| −0.25 | 2.80 | 901.0 | [0,3,3,4,4,3,2,0] | 19.90 | 25.00 / 739.3 | 41.40 |
| −0.50 | 3.60 | 883.5 | [0,1,3,3,3,3,3,1] | 10.85 | 22.50 / 688.6 ✗ | 40.55 |
| −0.75 | 2.50 | 862.7 | [0,3,5,5,3,1,1,1] | 9.25 | 13.70 / 637.1 ✗ | 40.95 |
| **−1.00** | **2.25** | 815.1 (87.4%) ✗ | [0,3,6,5,2,3,1,1] | **6.20** | 11.15 / **584.2 ✗** | 40.80 |

- **Arcsine warping (the intuitive "equal surface spacing" direction) makes every primitive
  worse at every blend weight** — torus up to 10.40 mm, sphere 34.5 → 39.8, cone 31.3 → 39.3,
  cylinder 41.7 → 42.6 — *and* it strips the torus's flat lower band ([0,2,1,3,3,2,4,1] →
  [0,0,0,0,2,3,4,0]). The reason is geometric: the crowding is **not** at the `d`-extremes of
  the slice axis. It is where the slice plane is tangent to the surface **in the view
  direction** — a camera-dependent set. Warping in `d` cannot target it.
- Raised-cosine warping helps (torus 2.25, sphere 6.20) but still misses the bar by 2.5× / 6.9×,
  breaks the W-27c-0a-4b **cone** ink floor at every w ≤ −0.5, and at w = −1 makes the cull
  entirely inert (ON ≡ OFF), i.e. it is a *different picture*, not a fixed one.
- A **view-aware** warp would be the principled version — and it would break the documented
  invariant `scene3d.js:4530` ("the plane count is a pure function of sliceCount") and its four
  guards (`scene3d-contour-slice.test.js:204-243`, incl. "#2 orbiting the camera does not blank
  or swing the contour set" and "#3 draft and full emit the same plane set"). Not available.

## 3. The RED oracle — and why an honest one cannot be written for the 0.9 mm bar

**The bar is not reachable.** The most efficient possible ring-removal (uniform decimation,
which sheds the most crowding per unit of ink) needs to delete **two thirds** of the picture:

| | keep every 1 | every 2 | every 3 | every 4 |
|---|---|---|---|---|
| torus largestW / ink retained | 3.35 / 100% | 2.60 / 46.2% | **0.35** / 32.5% | 0.45 / 25.0% |
| sphere largestW / ink retained | 34.50 / 100% | 1.60 / 59.2% | **0.00** / 28.0% | 0.00 / 30.0% |

Even **halving** every ring count leaves the sphere at 1.60 mm — above bar. And the local
geometry says why: inside the torus's largest blob the median nearest-other-path distance is
**0.319 mm** (p25 0.161 mm) against a **0.30 mm** pen, with **65.8% of the ink closer than
0.4 mm** and **46.8% closer than one full pen width**. The ink there is at or past saturation as
a matter of projection geometry — slice planes at fixed `d`-spacing map to arbitrarily small
surface spacing near a critical point of the height function.

**So the honest bar, stated three ways:**

| statement | torus | sphere |
|---|---|---|
| reachable **inside this lane's live guards** (ink ≥90%, both halves ≥85%, six 4b guards) | **3.00 mm** (arcMult 2.0) | **34.50 mm** (nothing moves it) |
| reachable if Jay relaxes retention to ≥83% / halves ≥72% | 2.30 mm | 10.90 mm |
| reachable at any cost, guards abandoned | 0.90 mm @ 58% ink | 0.00 mm @ 47% ink |

Against the 0.9 mm bar those are 3.3× / 38×, 2.6× / 12×, and 1.0× / 0× respectively.

**A RED oracle at ≤0.9 mm therefore cannot be written honestly for this mechanism.** Writing one
would force the next implementer to either widen the retention pair (the *only* guards the
review found actually guard this mechanism — §4 of `W-27c-0a-review-4.md`) or re-pin the 4b
floors, both of which are the exact pattern the round-1 lesson forbids.

## 4. Ranked fixes

### R1 — `CROWD_MIN_ARC_MULT: 3 → 2` (free partial; does **not** close the unit)

- **Edit:** `src/core/algorithms/scene3d.js:463`, one literal, plus its comment block
  (`:456-462`) which currently justifies `3` with numbers that no longer hold at `323e2583`.
- **Effect, measured:** torus largestW **3.35 → 3.00 mm**; ink **897.10 → 898.64 mm** (*up*
  0.17%); lower-band scanlines **byte-identical**; sphere, cone and cylinder **byte-identical**
  (cone 22 paths / 787.18 mm; cylinder 26 / 1075.01 mm). Same 2 rings dropped, both inside the
  saddle zone, none outside.
- **Guards:** I ran the whole shipped file against it — **57/57 pass, no bar moved.**
- **Bars that move:** none required. Sub-bar (e) blobCount goes **21 → 22** (wrong direction;
  ceiling is `ceil(21·1.10) = 24`, so it still passes). This must be disclosed under
  `## Bars changed` as a *movement without a bar change*, not hidden.
- **Byte-identity set:** sphere, cone, cylinder, solid (faceted — cull never applies), every
  non-contourSlice law. Only the torus moves.
- **Honest framing:** a 10% improvement on one primitive against a bar it misses by 3.3×.
  Worth landing only if the orchestrator wants the lane to leave something on the table.

### R2 — `CROWD_CULL_K: 0.8 → 1.3333` (**needs a Jay decision — do not land unilaterally**)

- **Edit:** `src/core/algorithms/scene3d.js:346`, one literal + its header comment.
- **Effect:** sphere largestW **34.50 → 10.90 mm (3.2×, the single largest improvement any
  lever produces)**, blobs 43 → 25; torus 3.35 → 2.30, blobs 21 → 19.
- **Guards that move — named, with current values:**
  - `tests/unit/scene3d-contour-slice.test.js:1533` — `after.totalInk > 0.9 * before.totalInk`
    → measured 781.00 vs 839.63 required. Would need **0.90 → 0.83**.
  - `:1644` / `:1645` — `topRetainedPct`/`bottomRetainedPct` `> 85` → measured 72.99.
    Would need **85 → 72**.
  - All six W-27c-0a-4b cone/cylinder guards **pass unchanged** (verified: cone 20 paths /
    751.05 mm inside `[19,25]` / `[708.46,865.90]`; cylinder 25 / 1033.66 inside `[23,29]` /
    `[967.51,1182.51]`).
  - The four RED-pinned torus/sphere floors (`:2090`, `:2095`, `:2113`, `:2116`) **cannot be
    moved by any fix in this lane and need not be**: they are structural, one-sided, and in the
    improving direction. A whole-ring cull only removes ink, so `waist` can only grow and
    `largestW` can only shrink. Confirmed across all 24 sweep variants — no variant violated any
    of the four.
- **Why this is a Jay decision, not an implementer's:** the retention pair is *exactly* what the
  reviewer identified as the only guard with teeth against this mechanism. Widening it to admit
  a change to this mechanism is the round-1 anti-pattern by definition. It buys 3.2× on the
  sphere and still misses the bar by 12×.

### R3 — re-oracle sub-bar (d). **This is the recommendation.** See §7.

*No fix at any rank reaches ≤ 0.9 mm without breaking guards that were accepted this week.*

## 5. Files

- **Allowed:** `src/core/algorithms/scene3d.js` — the slices block only
  (`makeCrowdGrid` :340-407, `CROWD_*` constants :335/:416/:428, `isRunCrowded` :439-459, the
  cull call-site :4700-4735); `tests/unit/scene3d-contour-slice.test.js`; this lane's docs.
- **Forbidden:** `src/core/mappers.js` (nothing measured here implicates it — the defect is
  entirely inside the slice emit loop); `src/core/hlr.js` (the 0.0038 mm bridged micro-gap
  belongs to handoff-c2, unchanged); `src/render/renderer.js`; every other lane's files.
- `buildSliceSegments` (:101-186) is inside the allowed block but is **off-limits in practice**:
  §2e shows warping it regresses all four primitives and a view-aware warp breaks the
  documented plane-count invariant and its four guards.

## 6. Evidence cells — all twelve verified present in `manifest.A.*.jsonl`

`shots/A/{torus,sphere,solid}__contourSlice__ladder__{med,max}__{a,b}.webp` — 12 cells, all
confirmed by grep against the manifests (not assumed). Add
`shots/A/{cone,cylinder}__contourSlice__ladder__{med,max}__{a,b}.webp` (also verified present)
for any fix that is not byte-identical on those two — R2 is not.
Re-shoot to `docs/3d-audit/fill-audit/after/W-27c-0a-2/` from MAIN, and **crop the saddle and
pole at native resolution before judging** (the 2026-09-05 lesson).
*Note:* R1 is byte-identical on sphere, solid, cone and cylinder — those cells will be
byte-identical pairs and must be explained as such in `report.json`, not re-shot as "evidence".

## 7. PLAN-BLOCKED — the numbers, and the recommendation

**No lever reaches the bar honestly.** But the measurement that settles this unit is not about
levers at all:

**Sub-bar (d) measures a connectivity extent, not an ink width.** `largestW` is
`max(bbox.w, bbox.h)` of the largest 8-connected merged component. I measured what that region
actually *is*, by distance transform on the same solid mask:

| primitive | `largestW` (bbox) | merged **area** | **max inscribed disc diameter** | median local thickness |
|---|---|---|---|---|
| torus | 3.35 mm | 2.465 mm² | **0.849 mm** | **0.241 mm** |
| sphere | 34.50 mm | 26.962 mm² | **0.783 mm** | **0.241 mm** |

**Both are already under the 0.9 mm bar, at HEAD, with no change whatsoever.** The sphere's
"34.5 mm blob" fills **4.5%** of its own bounding box and is nowhere thicker than 0.78 mm; its
median thickness is **less than one pen width**. It is a thin filigree network of touching
strokes spread across the polar band — not a puddle. A single 0.24 mm thread joining two small
merged patches makes `largestW` jump to the distance between them, which is why:

- the shipped cull moves `largestW` by **0.00 mm** (§0.2) while genuinely removing ink;
- it only falls when 40–70% of the ink is deleted (you finally sever the connectivity graph);
- the largest blob spans 8 / 16 distinct rings (a long chain, not a blob);
- `min inter-ring distance` sits at 0.00000 mm (rings genuinely touch — at threads).

Four iterations have been tuning a mechanism against a metric that does not measure the thing
its name claims.

**Recommendation — a Jay decision, in this order:**

1. **Re-oracle sub-bar (d)** as a *pair*, so this cannot read as softening a bar:
   **(d1)** max inscribed disc diameter of any merged region ≤ 0.9 mm — *currently PASSING at
   0.849 / 0.783 mm*; and **(d2)** total merged area, currently **2.465 mm² (torus) /
   26.962 mm² (sphere)**, as the quantity to actually drive down. (d2) is strictly harder to
   game than `largestW`: it cannot be improved by severing a thread. Sub-bar (e) (blobCount)
   inherits the same defect and should be reconsidered alongside it.
2. **Before implementing anything**, the orchestrator should crop the sphere pole and torus
   saddle from `after/W-27c-0a-4/` at native resolution and confirm with Jay what he circled:
   if the complaint is "there is a large grey smear at the pole", the right oracle is (d2)/ink
   density and the fix is fewer slices there; if it is "adjacent strokes touch", (d1) says it is
   already within one pen width and the unit closes as measured.
3. **Park the crowding cull.** Its parameter space is exhausted in all three dimensions
   (arc-length, distinct-level count, radius) and its best guard-clean move is 3.35 → 3.00 mm on
   one primitive (R1). Level warping in `d` is measurably worse than doing nothing (§2e).
4. **Correct STILL-OPEN.md and LEDGER.md**: the brief's 2.10 / 14.85 mm figures are iteration
   2b's, not iteration 4's; the current values are 3.35 / 34.50 mm; and the cull's effect on
   sub-bar (d) is exactly zero.

## 8. Stop conditions for whoever picks this up

1. **Stop if any fix requires moving `:1533` (0.9), `:1644`/`:1645` (85), or any of the six
   W-27c-0a-4b guards.** Those are the only bars with teeth against this mechanism.
   Stop-and-report; do not widen.
2. **Stop if any ring is dropped outside the saddle/pole zone** — the iteration-3 REJECT.
   Test it with the torus lower-band scanline count (must stay `[0,2,1,3,3,2,4,1]`, sum 16) and
   with the per-ring drop coordinates, not by eye.
3. **Stop if cone or cylinder move at all** unless the brief explicitly re-scopes them; both are
   byte-identical under R1 and both break under K ≥ 2.
4. **Stop if `largestW` improves while ink retention falls below 90%** — on this rig those two
   are the same number wearing different clothes (§3), and trading one for the other is not a
   fix.
5. **Stop if a causal story is carried over from a report instead of re-measured.** Three
   root causes for this defect have now died on independent measurement: "cull threshold
   exhausted" (iter 2b), "same-ring self-crossing" (iter 4, killed by the review), and
   "the arc gate is too coarse / peak density will find it" (this plan, §2a/§2b). The standing
   lesson holds.

### Reproduction

Probes used (scratch export of `323e2583`, since removed): a per-pixel/per-window pathId-tagging
port of `measureBlobs`; a `countNear` + full-scan `crowdDiag` instrumentation of
`makeCrowdGrid`/the cull call-site, driven by a `globalThis.__W27C_CFG`
`{cullK, arcMult, minLevels, peakLevels, mode}`; a blend-weight hook on `buildSliceSegments`'s
level placement; a chamfer distance transform for §7. **The instrumentation was verified inert:
`scene3d-contour-slice.test.js` is 57/57 green with it in place at default config.**
