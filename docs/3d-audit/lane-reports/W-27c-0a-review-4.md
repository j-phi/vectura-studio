STATUS: ACCEPT-WITH-FOLLOWUPS (mechanism + floors verified correct and beneficial; §8's "same-ring, not multi-ring" root cause for the largest blob is independently REFUTED and must not scope W-27c-0a-2 as written; cone/cylinder collateral is undisclosed and untested)

# W-27c-0a iteration 4 — adversarial review 4

Reviewer: read-only in `.claude/worktrees/fill-audit-d2` (`git status --short -- . ':!graphify-out'`
empty before/during/after; zero edits/commits in the worktree). All measurement below is in
from-scratch `git archive` scratch exports at `/private/tmp/claude-501/scratch-W27c4rev/{pre,post,red-parent,mutant1,mutant2,mutant3}`
(`pre`=47a5a755, `post`=c6dd6130, `red-parent`=74efa83a i.e. 767bed54's parent), symlinked to the
MAIN repo's `node_modules`. A prior reviewer was killed by a rate limit before writing anything —
this is a fresh, independent pass; its stale scratch dirs (`scratch-W27c4-{pre,post,preorig,mutant}`,
`scratch-W-27c-0a-3`) are not trusted and are removed at the end (see §9). Range: `47a5a755..c6dd6130`,
single commit `c6dd6130`. `git diff 47a5a755..c6dd6130 --stat`: exactly
`src/core/algorithms/scene3d.js` (+92/-…) and `tests/unit/scene3d-contour-slice.test.js` (+312/-98) —
matches the impl-4 report's own scope claim, confirmed.

## 1. RED/GREEN for the new/changed assertions

Copied `c6dd6130`'s test file onto a from-scratch `47a5a755` export (source unmodified) and ran the
full file:

- **GREEN at `post` (c6dd6130)**: 51/51, every printed number byte-for-byte matches the impl-4
  report and `report.json` (torus pathCount 44, totalInk 897.1044413969058mm, pct05 2.400237…%,
  pct1 8.388889…%, waist 0.03878612131638042mm; sphere pathCount 26, waist
  0.08225346440129311mm; engine-pipeline torus blobCount 21/largestW 3.35mm, sphere blobCount
  44/largestW 34.5mm; micro-gap oracle 1). **Confirmed, nothing fabricated.**
- **RED at `pre` (47a5a755) with the NEW test file**: exactly 2 tests fail, exactly as the report
  claims — `total emitted ink is barely touched...` (`expected 660.9545186184104 to be greater than
  839.6331694687829`) and `the re-scoped cull no longer concentrates ink loss in one region...`
  (`expected 53.72878591621057 to be greater than 85`). All 49 other tests pass at `pre`, and every
  printed number at `pre` matches iteration 3's own previously-reported values exactly (torus
  pathCount 36/totalInk 660.95mm/waist 0.054mm/largestW 2.75mm/blobCount 13; sphere pathCount
  21/waist 0.0823mm/largestW 19.25mm/blobCount 24) — this is a faithful RED, not a straw-man.
- **7th-bar check**: the W-27c item 0(b) fragment ceiling (`expect(fills.length).toBeLessThanOrEqual(55)`,
  line 1236) is untouched by this diff (confirmed via the diff itself and by running that specific
  test) and still passes at `post`. **Confirmed ≤55, not re-widened.**
- No `.only`/`.skip`/`xtest`/`xdescribe` anywhere in the file.

## 2. Micro-gap oracle — full four-way cross-check (mandatory per the brief)

| predicate | mechanism | result | matches report? |
|---|---|---|---|
| NEW (`hasBridgingInertPath`) | OLD/`pre` (iteration 3, unscoped) | **0** | yes — iteration 3's dropping incidentally removed the ring carrying the artifact |
| OLD (`hasInertContinuity`) | NEW/`post` (iteration 4, re-scoped) | **3** | yes — exactly the report's stated "3, not 0" |
| NEW (`hasBridgingInertPath`) | `post` (shipped) | **1** | yes |
| **NEW (`hasBridgingInertPath`)** | **74efa83a = 767bed54's parent — pre-item-0(b), pre-EVERY W-27c-0a iteration, `crowdGrid` doesn't exist in this tree at all** | **1, at the EXACT same coordinates and EXACT same distance** (`d=0.0038150702111636333mm`, pair at `(131.401,110.641)`↔`(131.402,110.645)`) | **yes — bit-for-bit** |

The fourth row is the load-bearing one: I wrote a standalone public-API-only probe
(`zz-review-microgap-probe.test.js`, no debug hook) against the 74efa83a export — a codebase that
predates the item 0(b) `selfOcclude` fix and every W-27c-0a crowding-cull iteration — and it
reproduces the identical bridged pair at the identical location and distance to 16 significant
figures. **This independently proves the report's root-cause claim for the micro-gap residual**
(pre-existing pen-width/HLR-clipping artifact, unrelated to any W-27c-0a mechanism) rather than
accepting it from the report. Not a REJECT item; this is the one claim in the report that is fully
vindicated by independent measurement.

## 3. Bars-changed table — independently measured, all six

All six moved bars were re-derived from the RED/GREEN runs above and match the report's table
exactly: ink-retention floor 0.6→0.9 (measured 96.16%); torus pct05/pct1 1.2/6→2.5/8.7 (measured
2.400/8.389, both real headroom under RED's 2.586/8.902); sphere pct05/pct1 2/8→4/13.5 (measured
3.558/12.454); torus engine blobCount ceiling 14→24 (measured 21, GREEN sits 3 below the ceiling
and 6 below RED 27 — closer to RED than iteration 3's 13, exactly as flagged, but real headroom
exists, this is not a coin-flip pin); sphere engine blobCount `<27`→`<=49` (measured 44); micro-gap
oracle `toBe(0)`→`toBeLessThanOrEqual(1)` under the rewritten predicate (§2, fully vindicated). No
widened bar here is a bare re-pin to a measured value with zero margin — each has real slack between
GREEN and its new ceiling/floor except the four floor+10% bars in §4.

## 4. The four floor+10% bars — mechanically present, but structurally toothless against THIS mechanism

**W-26b-3 shape check**: the report does not claim W-26b-3's shape (floor set BELOW the whole drift
envelope, PLUS a separate ±10% fingerprint band, both in one `expect` chain) and it was **not
applied** — what shipped is a single one-sided ±10% margin around the RED value (a floor for
waist, a ceiling for largestW), matching the *local* precedent iteration 2b itself established
(STILL-OPEN.md line 137), not W-26b-3's. This is not a misrepresentation (the report never invokes
W-26b-3), but it is a lighter guard shape than the audit's own strongest precedent, and W-26b-3
exists for a reason that plausibly does not apply here: this rig has no sun-elevation/camera-pitch
randomization or drift source (seed=1, fixed deterministic geometry) — I did not find any variance
across runs, so a drift-envelope half of that shape may genuinely be unnecessary here. Recorded as
informational, not a defect.

**Is a defend-only floor pinned AT RED, zero margin, a guard at all?** Mutation-tested with three
independent mutations against a scratch copy of `post` (never the worktree):

| mutation | torus waist | torus largestW | sphere waist | sphere largestW | 4 floors trip? | other tests trip? |
|---|---|---|---|---|---|---|
| none (baseline) | 0.0388 | 3.35 | 0.0823 | 34.5 | — | — |
| remove `if (e.level===queryLevel) continue` (same-level exclusion) | 0.0388 (=) | 3.35 (=) | 0.0823 (=) | 34.5 (=) | **no** | no (this exclusion never binds on this rig — dead code path for this test) |
| `CROWD_CULL_K` 0.8→1.8 (much more aggressive) | 0.0540 (better) | 2.00 (better) | 0.0823 (=) | 7.15 (better) | **no** (all pass trivially — they can only improve or hold) | **yes** — ink-retention (608.95 < 839.63 needed), half-retention bottom (81.2% < 85%), and the 0(b) occlusion-band test all fail |
| `CROWD_MIN_ARC_MULT` 3→0 (drop the sustained-run requirement) | 0.0540 (better) | 1.85 (better) | 0.0823 (=) | 26.3 (better) | **no** | **yes** — ink-retention and half-retention fail |

**Finding**: waist and largestW are, in this design, monotone-or-flat under every cull-aggressiveness
mutation I tried — the crowding cull can only ever *remove* ink (shrinking or dropping whole rings),
so the pairwise-minimum-distance metric (waist) can only stay the same or increase, and the
largest-merged-blob-width metric can only stay the same or shrink, when the mechanism is tuned more
aggressively. **RED is the structural ceiling/floor for these two quantities under this whole-ring
design — no mutation of this mechanism's own tunable constants (`CROWD_CULL_K`,
`CROWD_MIN_ARC_MULT`, `CROWD_MIN_DISTINCT_LEVELS`, or even removing the same-level exclusion) can
ever make them worse than RED.** That is consistent with (and independently confirms) the report's
practical conclusion that "a cross-ring test cannot move these" — but it also means the four
floor+10% bars provide **zero regression protection against this iteration's own mechanism** (there
is no possible mechanism-only regression for them to catch); their only live protection is against
some *unrelated* future change to the shared projector/refinement code. That's a real, if narrow,
guard — better than the prior console.log-only STOP-REPORT — but the report presents them as
"defend the position ... against a FUTURE regression" without noting that no such regression is
reachable from this lane's own parameter space. **Not blocking** (the mechanism-level regressions
that matter — reverting to unscoped over-culling — ARE caught, just by the ink-retention and
half-retention tests, not by these four), but worth recording plainly for whoever reads this later.

## 5. Same-ring self-crossing root cause — reproduced for waist, REFUTED for largestW (do not accept from the report)

**Waist: confirmed.** `waistAt` in the unit-rig test names a single `pathId` (40) for both index `i`
and `j` (`circDist>=6`, seam-aware) — by construction a same-path, non-adjacent pair. This is a
genuine same-ring self-crossing, matching the report.

**LargestW blob: refuted.** I wrote a standalone probe (`zz-review-samering-probe.test.js`,
public-API-only) that rasterizes ink exactly like the shipped `measureBlobs` helper but additionally
tags every painted pixel with the **set of distinct pathIds** that painted it, then reports, for the
largest blob's "solid" (merged, ≥75%-coverage) pixel set, how many pixels are covered by exactly one
path vs. two-or-more:

| primitive | blob size (n px) | distinct pathIds spanning the blob | pixels with 2+ distinct paths overlapping at that exact point |
|---|---|---|---|
| torus | 985 | **8** (`[24,26,28,30,32,34,36,39]`) | 278 / 985 = **28.2%** |
| sphere | 10744 | **16** (`[0..14,16]`) | 2338 / 10744 = **21.8%** |

This directly contradicts the report's §8/§2 claim that "the single dominant blob at each saddle/pole
is a SAME-RING self-crossing ... not a multi-ring pileup a cross-ring cull can ever address at any
scope." The largest blob is a **majority same-ring-fold, minority (22–28%, by pixel) genuine
cross-ring convergence spanning up to 8 (torus) / 16 (sphere) distinct emitted rings**. The pathId
spacing (torus: step of 2 across 7 of the 8 ids, consistent with one front-fill run per level times
a second per-level arc) is consistent with several genuinely adjacent slice LEVELS converging into
one raster region, not one ring folding onto itself. A more likely mechanistic explanation than
"structurally same-ring": each individual ring's overlap with its neighbors near the saddle/pole is
real (multi-level, as the mechanism's own design intends to catch) but too **brief** — never a
sustained arc reaching `CROWD_MIN_ARC_MULT * penWidth = 0.9mm` — to trip `isRunCrowded`'s
whole-ring gate, so no ring in the cluster ever gets dropped even though genuine multi-level
crowding is present. That is a different, and more actionable, diagnosis than "no cross-ring
mechanism at any scope can ever help": it suggests a *sustained-arc threshold* or *peak local
density* trigger (rather than the current per-ring, whole-run gate) might close some of this gap,
which "level warping is the only remaining lever" (the report's stated conclusion, feeding directly
into how W-27c-0a-2 gets scoped) forecloses without having tested it.

**This is exactly the class of claim task 4 flagged as unacceptable to take from the report, and it
does not survive independent measurement as stated.** It does not implicate the shipped mechanism or
numbers (all independently reproduced, §1/§3) — only the causal story in §8, which is the one thing
STILL-OPEN.md's W-27c-0a-2 entry will inherit verbatim if not corrected. **Required follow-up:**
before W-27c-0a-2 planning proceeds on "level warping is the only lever," measure whether a
smaller/adaptive `CROWD_MIN_ARC_MULT` or a peak-local-density (rather than sustained-arc) trigger can
reach the ~22–28% genuinely cross-ring portion of the residual blob.

## 6. Lower band preserved — quantitatively confirmed at native resolution

Cropped `before-789ba0fa`, iteration 3's `after/W-27c-0a`, and this iteration's `after/W-27c-0a-4`
(torus med, 800×399, no downscaling) at the exact region review-3 used (`(0,180)-(400,260)` /
`(400,180)-(800,260)`), then counted ink-crossings on seven vertical scanlines (`x=50,100,150,...,350`,
luma>128 threshold) instead of eyeballing:

```
before: [2, 2, 4, 4, 5, 4, 4]
iter3:  [0, 1, 1, 2, 3, 2, 2]
iter4:  [2, 2, 4, 4, 5, 4, 4]   <- byte-for-byte identical crossing counts to `before`
```

**Confirmed exactly**: iteration 4's ring density in the flat lower band matches `before` at every
sampled column, while iteration 3 is roughly half. Part 1 of the brief is genuinely met, not just
plausible-looking.

## 7. Visual inspection (native resolution, own crops)

- **Lower band** (§6 above): iter4 == before, iter3 visibly thinner. Confirmed.
- **Left-saddle apex** `(140,60)-(330,220)` 4x and `(140,150)-(260,220)` 8x: iter3 keeps rings
  distinct nearly to the tip (clean). Iter4 shows a small fused white patch at the extreme tip not
  present in iter3 — matches the report's own disclosure and the largestW-byte-identical-to-RED
  finding (though see §5 for the corrected causal story).
- **Hole near/far cusps** `(230,60)-(600,230)`, 3x: `before` and `iter4` are visually indistinguishable
  — no reintroduced dashes, gaps, or open ends at either cusp. No new defect here.
- **Solid (buckyball/faceted)**: not re-inspected visually (unnecessary — see §8, byte-identical by
  md5, confirmed independently).

## 8. Byte-identity sweep — non-contourSlice laws clean; **cone/cylinder contourSlice is NOT byte-identical and is undisclosed**

md5 of `algo.generate()` output, `pre` vs `post`, public-API-only:

| primitive/mapper | pre md5 | post md5 | identical? |
|---|---|---|---|
| torus/hatch | 816edfa2… | 816edfa2… | yes |
| torus/crosshatch | c1d2da47… | c1d2da47… | yes |
| torus/ladder | ea3d70f5… | ea3d70f5… | yes |
| sphere/hatch | dfde8859… | dfde8859… | yes |
| sphere/ladder | b17d862b… | b17d862b… | yes |
| box/contourSlice | 6f4fcd4c… | 6f4fcd4c… | yes |
| **solid/contourSlice (buckyball)** | db3fd4cc… | db3fd4cc… | **yes** |
| **cone/contourSlice** | 842cc89f… (n=90) | dcf2b151… (n=95) | **NO** |
| **cylinder/contourSlice** | 9d2a3be2… (n=103) | 6da90d0b… (n=106) | **NO** |

`SLICE_SMOOTH_EXCLUDED = new Set(['box','plane','pyramid'])` (scene3d.js:654) means `smoothSurface`
— and therefore the crowding cull — is **also active for cone and cylinder**, not just torus/sphere.
Cone and cylinder contourSlice output demonstrably changes between iteration 3 and iteration 4 (more
paths survive under the re-scoped mechanism, consistent with the general "iteration 4 keeps more
rings" pattern seen on torus/sphere). **Neither the impl-4 report, `report.json`, nor any test in
this diff mentions, measures, or visually verifies cone/cylinder** — the entire evidence set (§2
measurements, §6 evidence, the six gallery cells) is torus/sphere/solid only. This is a real,
independently-confirmed collateral-scope gap: the mechanism's blast radius is larger than what was
tested. Not evidence of a regression (I have no baseline to call it worse), but it is untested
territory on primitives STILL-OPEN.md separately tracks open cone/cylinder contourSlice defects for
(item (b) cone apex rings, W-27c's cone/cylinder items). **Required follow-up**: measure and, ideally,
add a regression guard for cone/cylinder contourSlice ink metrics before the next iteration touches
this mechanism again.

## 9. Guards — independently re-run, foreground, one file at a time

- `scene3d-contour-slice.test.js`: **51/51** (§1).
- `scene3d-mesh-self-occlusion.test.js`: **5/5**.
- `scene3d-curves.test.js`: **13/13**.
- `scene3d-hlr-spatial-index-identity.test.js`: **6/6**.
- `scene3d-hlr.test.js`: **11/11**.
- `scene3d-mappers.test.js`: **32/32**.

All six counts match the impl-4 report exactly. (Console noise from `[FillBoolean] polygon union
failed on degenerate geometry` during the mesh-self-occlusion run is pre-existing/unrelated per
STILL-OPEN.md's Unit-F entries, not a new failure — tests still pass 5/5.)

## 10. Merge/rebase risk against main's v1.4.0 (`1193cbe1`)

`1193cbe1` ("round byte-identity/golden comparisons to fix arm64 vs x86_64 CI drift") touches exactly
`scene3d-charts-parity.test.js`, `scene3d-curved-density-sparse-end.test.js`,
`scene3d-hlr-spatial-index-identity.test.js`, and `scene3d-mesh-invariants.test.js`. This lane touches
only `scene3d.js` and `scene3d-contour-slice.test.js`. `git diff 47a5a755 <main-tip>` on both of this
lane's files is **empty** — main has not touched either file since this lane's base. `scene3d-contour-slice.test.js`
has no golden-hash/`toEqual`-against-fixture comparisons of its own (its int-count assertions —
`toBeLessThanOrEqual(1)`, `<=55`, etc. — are platform-safe, not float-precision-sensitive). **No
rebase collision expected**; this lane's diff will apply cleanly onto current main.

## 11. Gallery hygiene

`report.json`'s `after` paths are `after/W-27c-0a-4/…` (not `shots/`) — compliant with GH-1's
hardening. The `med`/`max` byte-identical-pair note is present and explained (pre-existing,
unrelated to this fix). All 6 named cells present and match the six-cell manifest referenced in the
impl-4 report.

## Verdict: ACCEPT-WITH-FOLLOWUPS

**What is verified correct and should stand**: the re-scoped `CROWD_MIN_DISTINCT_LEVELS=2` mechanism
genuinely fixes review-3's REJECT reason (lower band ring density restored to an exact
scanline-crossing match with `before`, not just "looks better"); every number in the report's tables
reproduces bit-for-bit or to the measured precision; the micro-gap oracle's refined predicate and its
pre-existing-artifact root cause are proven independently all the way back to a codebase from before
item 0(b) even existed; the four floor+10% bars are mechanically real (not vacuous — they do fail
under a reverted-to-iteration-3 mutation, just via other assertions, not these four specifically);
all six named guard suites reproduce exactly; no rebase risk against main.

**What must be corrected before this feeds W-27c-0a-2 planning**:

1. **§5** — the "single dominant blob is a SAME-RING self-crossing, not a multi-ring pileup" claim is
   refuted for `largestW` (though confirmed for `waist`): 22–28% of the largest blob's solid pixels
   involve genuine multi-ring overlap spanning up to 8 (torus) / 16 (sphere) distinct rings. Do not
   scope W-27c-0a-2 around "level warping is the only remaining lever" without first testing whether
   a shorter sustained-arc threshold or a peak-density trigger can reach that portion.
2. **§8** — cone and cylinder contourSlice output changed under this mechanism and were never
   measured, mentioned, or visually checked. Needs at least a measurement pass (and ideally a
   regression guard) before the next iteration touches this code again.
3. **§4** — record, for whoever reads the four floor+10% bars later, that they cannot fail from any
   tuning of this mechanism's own constants (RED is a structural ceiling/floor for waist/largestW
   under a subtractive-only whole-ring cull) — they guard against unrelated future code changes only,
   not against this lane's own mechanism regressing.

None of the three is a defect in the shipped mechanism or a fabricated number — they are a
mischaracterized root cause, an untested scope expansion, and an under-disclosed guard limitation,
all correctable without touching `scene3d.js` again. The two-part brief (re-scope + land the four
floors) is met.

REPORT docs/3d-audit/lane-reports/W-27c-0a-review-4.md
