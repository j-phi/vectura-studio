STATUS: MEASURED — A3 lead REFUTED; root cause found and it is NOT dropped geometry. Fix is oracle-side, no `src/` change required.

# A3 — implementer brief: F1 "streaks" on the torus ribbon (five self-crossing laws)

**Planner (read-only), 2026-09-05.** Lane `handoff-c`, worktree
`/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/handoff-c`,
branch `3d-scene/handoff-c`, HEAD `79c98ca8`, `package.json` 1.3.98. Worktree was
CLEAN at start (`git status --short -- . ':!graphify-out'` empty) and is still clean —
this planner edited nothing in the worktree. All instrumentation ran in a scratch
export (`git archive HEAD | tar -x`) at
`/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad/a3`
with `node_modules` symlinked from the main checkout. Diagnostic scripts there:
`diag.js` (boolean/inset instrumentation), `diag2.js` (uncovered-cell location),
`diag3.js` (shortfall + protrusion), `diag4.js` (ring boundary length),
`diag5.js` (pen-reachability). Raw outputs: `base.json`, `d2.json`, `m0.json`,
`d4.json`, `d5.json` (+ `*.err`). Throwaway — nothing to commit.

---

## 0. Verdict in one paragraph

The A3 lead (PenFill / boolean-erosion **dropping** geometry) is **refuted by
measurement**: across a whole torus render there are **0 boolean failures for four of
the five laws and exactly 1 for `trochoidLoop`**, and **no erosion call anywhere
returned empty because of a failure** — 0.000 mm² of the 0.89–2.06 mm² is dropped
geometry. What the oracle is actually counting is **pen-unreachable area**: 89–98 % of
every law's `ringNotInkMm2` sits in cells that **no pen of width 0.3 mm can ink while
staying inside the ribbon** (convex corners and sub-2-pen necks of the *clipped*
ribbon polygon). Once that geometrically impossible set is excluded, all five laws are
**already inside the ≤ 0.18 mm² band** (0.152 / 0.051 / 0.180 / 0.028 / 0.017 mm²).
The honest unit is therefore an **oracle correction in
`tests/helpers/scene3d-ring-coverage.js`** (measure against the pen *opening* of the
ring, not the raw ring) with a proof that the corrected oracle still sees a real void —
**not** a change to `surface-fill.js`, `geometry-utils.js` or `fill-boolean.js`.
A separate, real-but-unrelated robustness bug was found in `insetMultiPolygon` (§7,
follow-up) — it does not move F1 and must not be sold as the F1 fix.

---

## 1. RED confirmed at the pre-fix tree

`npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js` in the scratch export of
`79c98ca8`: **1 file failed, 5 failed / 17 passed (22)**, 32.8 s. The five failures are
all the same assertion (`ringNotInkMm2 <= 0.18`):

| law | `ringNotInkMm2` | `ringFillRate` | `ringAreaMm2` |
|---|---|---|---|
| interlockWeave | 2.05875 | 0.99688 | 660.79 |
| onePenDown | 1.996875 | 0.99701 | 668.26 |
| trochoidLoop | 1.71 | 0.99751 | 686.53 |
| ampSpacing | 1.231875 | 0.99756 | 504.08 |
| weaveDepth | 0.888750 | 0.99847 | 581.48 |
| *taperedEnds* (clean control) | 0.1125 | 0.99978 | 512.30 |
| *weightSmoothstep* (clean control) | 0 | 1.0 | 67.60 |

These reproduce Unit A2's table exactly. Note `weightSmoothstep` is a **vacuous**
control for the ribbon class: `stats.wide === 0`, it never reaches `CLS_RIBBON` at all.
`taperedEnds` is the only real control.

---

## 2. Evidence A — the A3 lead is dead: nothing is being dropped

`FillBoolean.union/xor/difference/intersection` were wrapped (via the exported object,
which is what `geometry-utils` resolves at call time) and failures detected with the
already-exported `FillBoolean.consumeLastOpError()`. `GeometryUtils.insetMultiPolygon`
was wrapped to record, per call: inset, input/output area, bbox, and every boolean
failure that happened *inside* that call. One full torus render per law.

| law | inset calls | boolean failures | ops | inset calls returning `[]` | **dropped-because-failed** | streak mm² inside a failing call's bbox |
|---|---|---|---|---|---|---|
| interlockWeave | 70 | **0** | — | 1 | **0** | 0.000 |
| onePenDown | 20 | **0** | — | 0 | **0** | 0.000 |
| trochoidLoop | 116 | **1** | `union` | 1 | **0** | 0.056 of 1.71 (3.3 %) |
| ampSpacing | 116 | **0** | — | 1 | **0** | 0.000 |
| weaveDepth | 62 | **0** | — | 0 | **0** | 0.000 |

* Every `insetMultiPolygon` call in the whole render comes from **one** site:
  `surface-fill.js:6209` (`erode`), reached from `:6582` (outline) and `:6605` (fill).
* The live failure the A2 reviewer saw is real and reproducible — verbatim:
  `[FillBoolean] polygon union failed on degenerate geometry: Error: Unable to find
  segment #574762 [133.75509887555737, 81.00732122553501] -> [133.76289668607996,
  81.01820142523205] in SweepLine tree.` — stack:
  `safeOp (fill-boolean.js:77) → union (fill-boolean.js:94) → strokeRingsToBand
  (geometry-utils.js:1034) → insetMultiPolygon (geometry-utils.js:1312) → erode
  (surface-fill.js:6209) → surface-fill.js:6605`.
  It happens **once per render, on `trochoidLoop` only**, and that call **still
  returned geometry**: input 32.4571 mm² → output 25.2290 mm² (a plausible erosion at
  0.105 mm), `empty: false`. Nothing was dropped.
* The 1 empty inset per law for interlockWeave/trochoidLoop/ampSpacing is the
  `outlineOnly` counter firing (a genuinely sub-pen band consumed by the second
  erosion) — no boolean failure involved, and `stats.erodeEmpty === 0` everywhere.

**Conclusion: "safeOp returns null/[] ⇒ DROPPED geometry" does not occur on this
fixture. Do not spend the unit there.**

---

## 3. Evidence B — where the uncovered cells actually are

The oracle rasterises at `cs = pen/4 = 0.075 mm` (one cell = 0.005625 mm²). Per
uncovered cell we measured distance to the nearest captured-ring boundary segment
(`dB`), distance to the nearest ink centreline (`dI`), and which
`clipMultiPolygonToRegion` call site claimed the cell.

| law | uncovered cells | within 0.075 mm of a ring boundary | cells with `dB > pen/2` | mm² with `dB > pen/2` |
|---|---|---|---|---|
| interlockWeave | 366 | 332 (90.7 %) | 27 | 0.152 |
| onePenDown | 355 | 335 (94.4 %) | 8 | 0.045 |
| trochoidLoop | 304 | 265 (87.2 %) | 31 | 0.174 |
| ampSpacing | 219 | 214 (97.7 %) | 4 | 0.023 |
| weaveDepth | 158 | 157 (99.4 %) | 1 | 0.006 |
| taperedEnds | 20 | 17 (85.0 %) | 3 | 0.017 |

* **Every uncovered cell belongs to a RIBBON-class clip group** (`surface-fill.js:6566`);
  only 1 cell each on `trochoidLoop`/`ampSpacing` fell in a WALLS-class group
  (`:6491`). CLS_WALLS is not implicated.
* Cluster profile (flood fill): 147–191 clusters per law, mean 1.2–2.2 cells; the
  largest cluster in the whole set is 22 cells (0.124 mm², 0.825 mm long). There is
  **no lengthwise streak** in the data — it is a scatter of one-to-three-cell specks
  hugging ribbon boundaries. `ampSpacing`'s largest cluster is 3 cells.
* Shortfall `dI − pen/2` (how far the ink misses by): cumulative for interlockWeave
  ≤0.002 mm 24 cells, ≤0.005 24, ≤0.010 41, ≤0.020 38, ≤0.050 104, >0.050 135. So
  roughly a third of the cells are missed by more than 0.05 mm — i.e. not merely
  rasterisation noise; there is a real geometric shortfall to explain. §4 explains it.
* Not a pure boundary-length artefact: total captured-ring boundary length is
  1371.6 / 1373.2 / 1468.9 / 2106.9 / 1932.6 mm for the five laws vs 952.8 mm for
  `taperedEnds`, and uncovered cells per mm of boundary are 0.267 / 0.259 / 0.207 /
  0.104 / 0.082 vs 0.021 — 4–13× the control. Something law-specific is going on.

---

## 4. Evidence C — the mechanism: the area is PEN-UNREACHABLE

The ribbon pipeline's contract is that the pen **centre** stays at least `pen/2` inside
the clipped ribbon (that is precisely what `outlineMP = erode(clippedMP, pen/2)` at
`surface-fill.js:6582` enforces, and why it exists — defect D2, ink outside the
front-tested boundary). Under that constraint, for a **convex** corner of interior
angle θ, the nearest admissible pen centre is `r·csc(θ/2)` from the vertex, so a wedge
of depth `r·(csc(θ/2) − 1)` around the vertex **cannot be inked by any path**:
θ = 90° → 0.062 mm, θ = 60° → 0.150 mm, θ = 30° → 0.430 mm. A clipped ribbon is
*full* of such corners — the file's own comment says so ("a clipped ribbon is full of
reflex vertices, because the clip is what put them there"); the convex ones come with
it, and the five self-crossing laws generate far more of them (loop holes + crossing
cuts) than `taperedEnds`.

Measured directly (`diag5.js`): a cell is **pen-reachable** iff ∃ p with
`p ∈ its own clip group`, `dist(p, ∂group) ≥ pen/2`, `|cell − p| ≤ pen/2`
(candidate p on a polar lattice at `pen/12 = 0.025 mm` resolution, exact
segment-distance field, per-group so a neighbouring ribbon's boundary never counts):

| law | `ringNotInkMm2` | **UNREACHABLE mm²** | share | **REACHABLE mm² (the real defect)** |
|---|---|---|---|---|
| interlockWeave | 2.0588 | 1.9069 | 92.6 % | **0.1519** |
| onePenDown | 1.9969 | 1.9463 | 97.5 % | **0.0506** |
| trochoidLoop | 1.7100 | 1.5300 | 89.5 % | **0.1800** |
| ampSpacing | 1.2319 | 1.2037 | 97.7 % | **0.0281** |
| weaveDepth | 0.8888 | 0.8719 | 98.1 % | **0.0169** |
| taperedEnds (control) | 0.1125 | 0.0956 | 85.0 % | **0.0169** |

Two independent criteria agree to within 1–2 cells (compare §3's `dB > pen/2` column,
computed against *all* rings, with the REACHABLE column here, computed per group):
339/27 vs 339/27 on interlockWeave, 347/8 vs 346/9 on onePenDown.

**All five laws already satisfy the numeric band (≤ 0.18 mm²) on the reachable
set** — `trochoidLoop` at exactly 0.1800 (32 cells), i.e. with zero headroom. The
control is 85 % unreachable too, so this is not special pleading for the five laws:
the same correction applies uniformly and cannot rescue a law that has a real void.

**Corollary that closes the "fix the fill" door:** covering the wedges requires letting
ink outside the ribbon boundary by `r·(csc(θ/2) − 1)` — 0.06 to 0.43 mm, i.e. 20 % to
143 % of a pen width. That is defect D2 restored, at magnitudes comparable to the
0.27 mm violations the erosion-not-miter-offset decision was made to avoid
(`surface-fill.js:6186-6195`). Any "shrink the erosion by a margin" variant is
therefore ruled out on construction, not on taste. (A margin sweep was started and
abandoned as redundant once the analytic bound was in hand — see §11.)

---

## 5. Root cause statement (put this in the commit body)

> `measureRingFillRate`'s denominator is the raw `clipMultiPolygonToRegion` output.
> A pen of width `w` stroked by a path whose centre stays `w/2` inside that polygon
> cannot ink the polygon's convex corners: a wedge of depth `(w/2)(csc(θ/2) − 1)`
> per corner of interior angle θ is unreachable by construction. On the five
> self-crossing laws the clip produces enough corners that this unreachable set is
> 89–98 % of the reported `ringNotInkMm2`. The five laws' *reachable* uncovered area
> is 0.017–0.180 mm², already inside the ≤ 0.18 mm² band the other laws occupy.
> F1's remaining number is an oracle-denominator defect, not a fill defect.

---

## 6. The RGR red test

**Do not relax `STREAK_BAND_MM2` and do not delete the existing assertion.** The
change is additive.

**6.1 New oracle field (the change under test).** In
`tests/helpers/scene3d-ring-coverage.js`, add to `measureRingFillRate`'s return value:

* `ringNotInkReachableMm2` — the uncovered area restricted to **pen-reachable** cells.
* `ringUnreachableMm2` — the complement, reported so a reviewer can see the split.

Implementation constraints (all non-negotiable):
* Keep it an **independent** pure-JS computation. Do **not** call
  `GeometryUtils.insetMultiPolygon` / `FillBoolean` from the helper — the helper's own
  header is explicit that it is an independent reimplementation, and importing the
  production erosion would make the oracle test itself.
* Evaluate reachability **only on cells that came out uncovered** (a few hundred), so
  the cost is negligible; the runtime of the F1B file must stay in the ~35 s range.
* Predicate, verbatim: a cell at `(x,y)` owned by clip group `g` is reachable iff
  ∃ `p` with `p` inside `g`'s rings, `dist(p, ∂g) ≥ penWidth/2`, and
  `|(x,y) − p| ≤ penWidth/2`. Search `p` on a lattice **finer than one cell**
  (`penWidth/12 = 0.025 mm` was used for the numbers above; a finer lattice can only
  reclassify cells as reachable, i.e. can only make the test stricter).
* `ringFillRate`, `ringAreaMm2`, `ringNotInkMm2` and `selfOccludedAreaMm2` must be
  **byte-identical** to today for every caller. Three sibling files consume this helper
  (`scene3d-ribbon-c3-rule5`, `scene3d-ribbon-outline-fill-seam`,
  `scene3d-ribbon-wall-coverage`) and all three assert only
  `ringFillRate >= 0.995` — none may move.

**6.2 The five assertions in `tests/unit/scene3d-ribbon-f1b-streaks.test.js`.**
Change the band assertion to the reachable metric, and keep the raw number as a
recorded, non-asserted diagnostic (or assert it loosely, e.g. `< 3`, purely as an
anti-explosion guard):

```
expect(coverage.ringNotInkReachableMm2).toBeLessThanOrEqual(0.18);   // was ringNotInkMm2
```

Current values (this is the GREEN target — measured, not hoped):
`0.1519 / 0.0506 / 0.1800 / 0.0281 / 0.0169`. **`trochoidLoop` is at 0.1800 exactly**
— it passes `<=` with no headroom, and it is run-to-run sensitive (Unit A2 measured
`trochoidLoop` at 1.586 / 1.71 across trees). If it lands above 0.18 on the
implementer's machine, **stop and report the number** rather than nudging the band;
the correct escalation is then §8 option B (a real fill fix for the reachable
residue), not a wider band.

**6.3 The honesty proof (this is the RED half, and the unit is REJECTED without it).**
A corrected oracle that can no longer see a real void is worse than the bug. Add
`tests/unit/scene3d-ring-coverage-reachability.test.js` with:

1. **Synthetic-void RED.** Same torus fixture, one law, but wrap `PenFill.fillRegion`
   to drop every second returned path (a deliberate, unmistakable ~pitch-scale void).
   Assert `ringNotInkReachableMm2` **rises above 0.18** (measure and pin the actual
   value with a wide margin, e.g. `> 1.0`). Without this the new metric is unfalsifiable.
2. **Derived-not-tuned proof.** Pure geometry, no scene: a square region (side 3 mm,
   `penWidth = 0.3`) and an L-shaped / 60°-wedge region. Assert the reachable-cell
   classifier marks exactly the corner wedges unreachable and that the measured wedge
   depth matches `r(csc(θ/2) − 1)` to within one cell: 0.0621 mm at θ = 90°,
   0.1500 mm at θ = 60°. This is what makes the predicate a derivation rather than a
   fudge factor sized to make five numbers pass.
3. **Control invariance.** `taperedEnds` and the wall-coverage fixture keep
   `ringFillRate` unchanged and `ringNotInkReachableMm2 <= 0.18`.

**6.4 Anti-vacuity.** Keep the existing `stats.wide > 0 / ribbons > 0 /
degenerate <= baseline` block untouched, and additionally assert
`ringUnreachableMm2 > 0` on the five laws (if a future change makes the unreachable
set vanish, the predicate has broken, not the geometry).

---

## 7. Fix approaches, ranked

**A. (RECOMMENDED) Oracle correction — measure against the pen opening of the ring.**
Files: `tests/helpers/scene3d-ring-coverage.js` (+ the two test files). No `src/`
change, so no render changes, no serialization against `fill-audit-a`, no risk to the
other 44 laws. Cost: ~40 lines of pure JS plus the honesty test. Evidence PNGs come
back byte-identical **and that identity is the proof** (§9). Lands all five laws at
0.017–0.180 mm² against an unchanged 0.18 band.

**B. (OPTIONAL SECOND UNIT, only if trochoidLoop misses) Shrink the *reachable*
residue.** The residual 0.152 / 0.051 / 0.180 / 0.028 / 0.017 mm² is genuine and is the
class the code already names: the outline↔first-fill-pass seat (`RIBBON_OVERLAP`,
`surface-fill.js:6600-6606`) and PenFill pitch drift — the interior samples in `d2.json`
sit 0.52–0.60 mm from any boundary with `dI` of 0.150–0.159 mm, i.e. just outside one
pass's radius, which is a *pitch* symptom. Fixing that means `surface-fill.js` or
`pen-fill.js` and therefore **must be serialized against lane `fill-audit-a`**
(`surface-fill.js` is theirs). Do not open this in the same unit as A.

**C. REJECTED — margin on the outline erosion** (`erode(clippedMP, pen/2 − m)`):
requires `m` = 0.06–0.43 mm of ink outside the front-tested ribbon boundary to reach
the wedges (§4). That is defect D2 at the magnitude the erosion decision was taken to
avoid. Do not implement.

**D. REJECTED as the F1 fix — robust boolean fallback in `fill-boolean.js` /
`geometry-utils.js`.** There is nothing for it to recover: 0–1 failures per render,
0 drops (§2). It would move the metric by 0.000 mm².

**E. FOLLOW-UP, real but unrelated (needs its own W-id).**
`insetMultiPolygon`'s escalating retry ladder (`geometry-utils.js:1300-1318`) is **dead
code for the dominant failure mode**. The ladder only re-runs when
`strokeRingsToBand`/`FB.difference` *throw*, but `FillBoolean.safeOp`
(`fill-boolean.js:75-83`) catches polygon-clipping's throw and returns `null`, so
`union`/`difference` hand back `[]` and no exception ever reaches the `catch`. The loop
`break`s on attempt 1 with `region = []`, and the caller cannot distinguish "the
boolean failed" from "the erosion genuinely consumed the region" — exactly the class of
silent hole the audit keeps re-finding. It is latent today only because the failure is
rare and (measured) non-fatal. Fix: consult the already-exported
`FillBoolean.consumeLastOpError()` after each `FB.*` call inside `insetMultiPolygon`
(and after the per-contour `FB.union` in `strokeRingsToBand`) and continue the ladder
when a swallowed failure is seen. Guard with `tests/unit/geometry-band-fill.test.js`
(already covers `insetMultiPolygon`) plus a new case that injects a `FillBoolean` whose
first `union` fails and asserts the ladder recovers instead of returning `[]`.
**Do not bundle this with A** — it changes no F1 number and would muddy the commit.

---

## 8. Files — allowed / forbidden

**Allowed (this unit):**
* `tests/helpers/scene3d-ring-coverage.js` — additive only (see §6.1).
* `tests/unit/scene3d-ribbon-f1b-streaks.test.js` — swap the asserted metric, rewrite
  the header to record the refutation of both the self-occlusion hypothesis (A2) and
  the dropped-geometry hypothesis (A3), with the numbers from §2 and §4.
* `tests/unit/scene3d-ring-coverage-reachability.test.js` — new.
* `docs/3d-audit/STILL-OPEN.md`, `CHANGELOG.md`, `plans.md` — the usual doc contract.

**Forbidden:**
* `src/core/scene3d/surface-fill.js` — lane `fill-audit-a`. **Not needed at all for
  option A.** The `erode()` call site is *not* the fix site; if the implementer
  concludes it must change (option B), **stop and report** so the orchestrator can
  serialize — do not edit it opportunistically.
* `src/core/scene3d/surface-fill-mono.js` (`fill-audit-c`),
  `src/core/scene3d/scene3d.js` faceted path + `src/ui/panels/context-bar.js`
  (`fill-audit`), `src/core/scene3d/mappers.js` + the slice pass (`fill-audit-d`).
* `src/core/geometry-utils.js`, `src/core/fill-boolean.js`, `src/core/pen-fill.js` —
  handoff-c's per the serialization table, but **out of scope for A**; only option E
  touches them, in its own unit.
* `src/core/scene3d/torus-occlusion.js` / `hlr.js` — A2's landed work. Leave it.
  A2 stays KEEP: the reviewer already ruled, and nothing here re-opens it.
* Anything under `tests/helpers/` other than `scene3d-ring-coverage.js`.

---

## 9. Guard tests to run (targeted, one file at a time — shared machine)

```
npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js          # 22 tests, expect 22/22
npx vitest run tests/unit/scene3d-ring-coverage-reachability.test.js  # new
npx vitest run tests/unit/scene3d-ribbon-wall-coverage.test.js        # must not move
npx vitest run tests/unit/scene3d-ribbon-outline-fill-seam.test.js    # must not move
npx vitest run tests/unit/scene3d-ribbon-c3-rule5.test.js             # must not move
npx vitest run tests/unit/geometry-band-fill.test.js                  # insetMultiPolygon guard
npx vitest run tests/unit/scene3d-hlr-spatial-index-identity.test.js  # A2 re-pins live here
```
A test-only change must leave every `src/`-driven fingerprint untouched; if
`scene3d-hlr-spatial-index-identity` moves, something outside the brief was edited.

---

## 10. Evidence to re-shoot

```
node scripts/audit/scene3d-capture.js --tier A \
  --root .claude/worktrees/handoff-c --port 8470 \
  --only '^torus__(hatch|contour)__(ladder|none)__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/A3
```
(run from MAIN so the output lands in main's gallery; `after` paths in
`after/A3/report.json` must be `after/A3/…`).

**Expect every pair to be byte-identical to `before`, and say so explicitly in
`report.json`**: option A changes no `src/` file, so an identical render is the
*intended* result and is the evidence that the unit did not buy a metric with pixels.
Still open the PNGs with Read and describe what you see (per protocol step 3) — in
particular, confirm by eye that the torus ribbon bands read solid at the reported
locations from `d2.json` (e.g. interlockWeave's largest cluster at
`x≈148.6, y≈87.0`, 0.107 mm²; trochoidLoop's at `x≈137.0, y≈73.9`, 0.124 mm²,
0.825 mm long). These are 0.1 mm² specks: if they are invisible at tier-A zoom, record
that as the finding, because the handoff doc's claim is that "the render still reads
wrong" and this brief's measurement says the *metric* is not that visual defect.

---

## 11. Stop conditions

* **Stop and report** if `ringNotInkReachableMm2` for `trochoidLoop` lands above 0.18
  on the implementer's tree. Ship the measurement; propose option B as its own unit.
  Never widen `STREAK_BAND_MM2`, never coarsen the reachability lattice to buy a pass.
* **Stop and report** if the honesty test (§6.3 item 1) does **not** go red with a
  synthetic void — that means the correction is hiding real defects and must be
  reverted.
* **Stop and report** if any of the four sibling coverage tests moves. The change is
  additive by construction; movement means it was not.
* **Stop and report** rather than editing `surface-fill.js`. If the conclusion is that
  the fill genuinely must change, that is a serialized unit against `fill-audit-a`, not
  this one.
* **Do not** re-litigate A2 (`79c98ca8`): its reviewer ruled KEEP, and this measurement
  neither supports nor needs a revert. The self-occlusion correction in
  `captureSelfOcclusionFootprint` is working — it excluded 0 mm² of the streak on these
  fixtures, which is why the five numbers did not move for A2.
* Machine is shared: run one vitest file at a time; a timeout under load is not a
  regression — rerun alone.

---

## 12. Numbers an implementer can re-derive in 5 minutes

Scratch export + `node diag5.js` reproduces the reachability table (~6 min for six
laws). `node diag.js base` reproduces the boolean/inset table (~25 s per law). Both
scripts are read-only against the worktree — they wrap `window.Vectura.FillBoolean`,
`window.Vectura.GeometryUtils.insetMultiPolygon` and
`RibbonGeometry.clipMultiPolygonToRegion` on the loaded runtime, which is why no
tracked file had to be edited to get any number in this brief.
