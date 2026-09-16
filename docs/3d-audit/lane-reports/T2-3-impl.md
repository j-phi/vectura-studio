STATUS: DONE/FU

# T2-3 — mkTick variable tick length, attempt 3: the bare-wedge fix AND its bar

Lane: fill-audit-a3. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`.
Branch: `3d-scene/fill-audit-a3`. Base sha: `42acff7b` (F1-width-bar, tests-only, on top of the T2-2
revert `179d9218`, whose `surface-fill.js` is confirmed byte-identical to `3bc61c32`, F1-amp's landed
sha). Port 8475, `served version 1.4.1` matched the worktree's `package.json`.

Read, in order, per the brief: `AGENT-PROTOCOL.md`, `ROUND3-RESUME-BRIEFS.md` §0/§0b, `T2-3-plan.md` +
its evidence dir, `T2-2-review.md`, `SESSION-SUMMARY.md` §5.

## What shipped

Both rejected units (T2 `dbad2d88`, T2-2 `9d911b05`) shipped R1 (length carries tone) but opened a
cross-row WEDGE: `mkShape`'s `'tick'` branch (`surface-fill.js:2637` area) spends its entire length
response in the ACROSS-ROW direction, centred on the row line, so every mm the curve removes is
subtracted from the row-to-row gap — `T2-3-plan.md` §0 proved the two curves are the SAME RENDER on
this defect (<=1.15% apart). This unit:

1. **Reintroduces `chan:'len'`** (T2-2's own mechanism — LMIN/L0/P0, `P=L/g` conservation,
   `lenByThird`/`cntByThird`) since the base tree had it fully reverted. `MK.mkTick.L0` raised
   1.02 -> **1.16** and `MK_TICK_EASE_BLEND` raised 0.88 -> **0.92** (both O5-headroom compensators for
   the stagger's own abutment-margin cost — measured, see plan §3).
2. **Rank 1 — the cross-row STAGGER**, implemented EXACTLY as prototyped in `T2-3-plan.md` §3: a
   low-discrepancy (golden-ratio) scatter of each tick's own centre across the room its own shortening
   created, inserted at the tick placement site in `layMark`, gated `law.shape === 'tick'`. Zero at the
   dark anchor (pure abutment preserved bit-for-bit); maximal exactly where the wedge is.
3. **Ships the rasterised bare-wedge INSTRUMENT FIRST**, per orchestrator ruling (a):
   `tests/unit/scene3d-mktick-wedge.test.js` + `tests/helpers/scene3d-mktick-wedge.js` (new).

## Files touched

- `src/core/scene3d/surface-fill.js` — `MK.mkTick` table entry (chan/L0/LMIN/P0 + doc comments),
  `MK_TICK_EASE_BLEND` constant, `mkStat` new fields (`lenByThird`/`cntByThird`/`tickField`/`tickSites`),
  `solveAt`'s `lenChan` branch, `layMark`'s stagger insertion + site/field logging, `place()`'s return
  value (`return tot` instead of `return true`, T2-2's own precedent), `publishMarkStats` (slices the
  new array fields), and the two doc-comment tables describing `mkTick`.
- `tests/unit/scene3d-mktick-wedge.test.js` (new, 46 tests) + `tests/helpers/scene3d-mktick-wedge.js`
  (new helper) — the wedge oracle.
- `tests/unit/scene3d-mark-laws-draw.test.js` — O1 re-scope (see `## Bars changed`).

**A note on the files-allowed scope.** The brief names "mkShape 'tick' branch, the tick placement at
~:6451, MK constants." Landing Rank 1 required also reinstating `chan:'len'`'s `solveAt` branch (the
tree had the WHOLE mechanism reverted, not just the curve), the `mkStat`/`publishMarkStats` fields
needed to measure O5, and a small per-site/per-field log — all of it gated to `law.shape === 'tick'` /
`law.chan === 'len'`, none of it touching `MK_ROW_COV`, the master grid, `emitContFamily`, wave-law code,
or `geometry-utils.js`. Disclosed here explicitly rather than claimed as literally three lines.

## RED / GREEN

**RED at `42acff7b` (this unit's own base sha, no `git stash` — via `git show HEAD:...` inside the test
file, exactly the scratch-archive pattern the protocol requires):** confirmed `chan: 'count'` is what
`HEAD` has, `chan: 'len'` is absent; `lastMarkStats.lenByThird` / `.cntByThird` / `.tickField` are all
`undefined` — O5 (R1) is literally unmeasurable pre-fix, which is the strongest possible RED (the
mechanism does not exist at all, not merely under a bar).

**GREEN:** all 46 tests in the new file pass on this tree (below).

## The instrument — which half of Jay's rule it gates

- **O5** (`lengthCarriesTone`, mean drawn tick length dark-third / light-third, >= 3.0 monotone) gates
  **R1 only** ("ticks must have VARIABLE LENGTH, tick length carries the tone"). It says nothing about
  whether bare space is scattered or converged into a wedge.
- **`wedge25`/`holeMax`** (the raster, `rasterizeField` + `rasterizeInk` + chamfer `distanceTransform`,
  raster cell = **1/6 mm** at PPMM=6) gate **R2 only** ("the field stays complete... the only gaps
  allowed are where highlights are" / the hard-edged clause). They say nothing about whether length
  actually carries tone — a fixed-length design would also score well here.
- **`siteCoverage`** is REPORTED, not gated — it is the pre-existing per-site metric BOTH rejected units
  passed while shipping the wedge (T2-2-review.md §1.3's own finding, reproduced here).

## Mutation-proof (BLOCKING, both required)

**1. Instrument correctness, synthetic masks** (`describe('instrument correctness...')`, 3 tests): a
hand-built synthetic wedge (two ink bands with a converging triangular bare gap) trips `wedge25 > 0.05`
and `holeMax > 1.0`; a wedge-free, evenly-speckled synthetic pattern scores `wedge25 < 0.02`,
`holeMax < 0.6`; bare area entirely inside the highlight zone (I>=0.90) is correctly excluded
(`shadedPx === 0`).

**2. Real-render mutation** (`describe('MUTATION-KILL 2...')`, 14 tests): the SAME stagger insertion with
`room` forced to `0` (this tree's own `L0=1.16`/`BLEND=0.92`, but centred on the row line exactly as
T2/T2-2 shipped), measured on both rigs, all six cells:

| six-cell mean wedge25 | staggered (shipped) | no-stagger mutant | delta |
|---|---|---|---|
| addLayer/test rig | **0.07622** | 0.08890 | +16.6% |
| create rig | **0.08878** | 0.10278 | +15.8% |

Monotone in the SAME direction (shipped <= mutant) on **all 12 of 12** individual cell x rig
combinations, gated as a hard per-cell assertion in the test file.

## HONEST METHODOLOGY LIMITATION (do not skip — this is the load-bearing disclosure)

The plan's own instrument (`T2-3-plan.md` §2) built its silhouette from a DENSE, INDEPENDENT 461x461
`sampleAt` sweep — a true continuous 2D field. **This unit's silhouette instead comes from mkTick's own
coarse ALONG-ROW field samples**, republished (gated to `law.shape === 'tick'`, no extra `sampleAt`
calls) and isotropically splatted at radius `rowPitch/2`, because no per-point row-direction vector is
available outside `surface-fill.js`'s own frame without sampling well past the tick-placement/MK-constant
scope this unit is granted.

**Measured consequence:** every ROW ENDPOINT's disc necessarily extends `rowPitch/2` past the row's own
true tip (nothing bounds it there), which the plan's continuous sweep does not suffer. This raises this
file's absolute `wedge25`/`holeMax` readings well above the plan's own prototype numbers
(mine: `~0.05-0.17` wedge25 / `~1.0-1.1` holeMax; plan's: `~0.00-0.05` wedge25 / `~0.39-0.96` holeMax) and
makes `holeMax` **dominated by that endpoint artefact rather than the real defect** — it barely moves
between the staggered and no-stagger real renders on this fixture (both ~1.0-1.1 on every cell, see the
report.json's mutation-kill table). **`holeMax` is therefore REPORTED here, not gated** — the same
disposition the plan itself gave its own rejected "shelf-span"/"cross-row jump" statistics (§2.4: "name
what you do not gate").

`wedge25` SURVIVES this noise floor as a real, monotone, cross-rig, six-cell signal — smaller in
magnitude than the plan's own report, but real (see the mutation-kill table above) — and IS gated: a
six-cell-MEAN blocking bar (the more robust aggregate — exactly the reasoning the plan's own §2.4 used for
its W2) plus a per-cell non-regression ceiling. Per-cell separation from the no-stagger mutant is THIN on
some cells (`torus/contour` on the `create` rig: 0.17307 shipped vs 0.17522 mutant, a 1.2% delta within
this instrument's own noise) — disclosed, not hidden; the per-cell gate is a **non-regression ceiling**
(protects the stagger from a future silent revert), not a proof-of-improvement on every individual cell.
The six-cell MEAN and O5 are clean and well-separated everywhere.

## Six-cell acceptance table (d=50, both rigs) — the worst cell, not just the mean

**addLayer/test rig:**

| cell | O5 (>=3.0, monotone) | wedge25 (ceiling 0.090) | holeMax (reported) | siteCoverage (reported) |
|---|---|---|---|---|
| sphere/hatch | **3.818** | 0.07899 | 1.110 | 0.978 |
| sphere/contour | **3.130** | 0.06667 | 1.079 | 0.991 |
| torus/hatch | **3.008** (thin margin, flagged by the plan too) | 0.07751 | 1.044 | 0.984 |
| torus/contour | **3.741** | 0.08758 | 1.081 | 0.991 |
| cone/hatch | **3.385** | 0.07146 | 0.984 | 0.985 |
| cone/contour | **3.813** | 0.07511 | 1.039 | 0.993 |
| **mean** | — | **0.07622** (bar <=0.080) | 1.056 | — |

**create rig:**

| cell | O5 (>=3.0, monotone) | wedge25 (ceiling 0.180) | holeMax (reported) | siteCoverage (reported) |
|---|---|---|---|---|
| sphere/hatch | **4.281** | 0.05449 | 0.992 | 0.978 |
| sphere/contour | **3.084** | 0.06510 | 1.038 | 0.990 |
| torus/hatch | **3.039** (thin margin) | 0.13794 | 0.980 | 0.975 |
| torus/contour | **3.731** | 0.17307 (thin vs its own ceiling AND vs the mutant, see limitation above) | 0.991 | 0.958 |
| cone/hatch | **3.257** | 0.06098 | 1.038 | 0.987 |
| cone/contour | **3.542** | 0.04111 | 1.008 | 0.999 |
| **mean** | — | **0.08878** (bar <=0.095) | 1.008 | — |

**Every one of the twelve O5 readings clears >= 3.0 and is monotone dark>=mid>=light. Every one of the
twelve wedge25 readings clears its own non-regression ceiling. Both six-cell means clear their blocking
bars.** `torus/hatch` O5 (3.008 test rig / 3.039 create rig) is the thinnest margin, exactly as the plan
warned (its own prototype measured 3.008/3.039 on this same cell) — reported, not fudged.

## d=220 (T2-4's territory) — reported, NOT fixed

| cell | siteCoverage | marks | tooShort |
|---|---|---|---|
| sphere/hatch | 0.835 | 1920 | 1058 |
| torus/hatch | 0.709 | 1824 | 1345 |
| cone/hatch | 0.839 | 1295 | 661 |

Matches `T2-3-plan.md` §2.5's own Rank-1 prototype numbers (0.835/0.709/0.839) exactly. Recovers +1.5 to
+3.5 points over T2-2's own d=220 collapse but does not close it — `LMIN*R` legitimately nears
`MIN_MARK_MM` at high density, T2-4's item (`LMIN*R` vs `MIN_MARK_MM`), left untouched here.

## Byte-identity sweep — coverage stated as a fraction

Population: **8 laws** (`mkTick`, `mkDashRamp`, `mkDotScreen`, `mkScribble`, `ladder`, `fineLadder`,
`phaseFineLadder`, `taperedEnds`) x **8/8 mappers** (full roster) x 3 primitives (sphere/torus/cone) x 2
densities (50/220) = **384 cells**, `md5(JSON.stringify(paths))`, current tree vs `git show
HEAD:...surface-fill.js` (pre-fix):

**366/384 identical (95.3%), 18 differ, all 18 `mkTick`'s own, ZERO non-mkTick differences.** Matches
`T2-3-plan.md`'s own Sweep B numbers exactly (366/384, 18 differ, all mkTick).

**Grep for pins on the changed law:** `mkTick` also has a separate, unrelated implementation in
`src/core/scene3d/shadows.js:1229` (shadow hatching) — untouched (`git diff --stat` touches only
`surface-fill.js` and the three test files named in this report). No other law's `solveAt` branch is
reachable through `lenChan` (unique to `mkTick`'s own `MK` entry).

## Guards — every one run individually, foreground, `timeout: 600000`

| file | result |
|---|---|
| `scene3d-mark-laws-draw.test.js` (G4) | **30/30** (after the O1 re-scope, see `## Bars changed`) |
| `scene3d-mkdashramp-dark-end.test.js` (T4b) | **4/4** |
| `scene3d-ribbon-width-bar.test.js` (F1-width-bar) | **10/10** |
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** |
| `scene3d-ribbon-f1-amp.test.js` | **47/47** |
| `scene3d-ribbon-erode-refusal.test.js` | **16/16** |
| `scene3d-curved-density-floor.test.js` | **14/14** |
| `scene3d-curved-density-sparse-end.test.js` | **20/20** |
| `scene3d-mktick-wedge.test.js` (new, this unit) | **46/46** |

All match, or exceed, the baseline counts named in the brief. Nothing pre-existing red; nothing turned
red by this unit. `[FillBoolean] polygon union failed on degenerate geometry` on stderr in several runs
is documented pre-existing noise (unrelated erosion pipeline), not a regression.

## Bars changed

- `tests/unit/scene3d-mark-laws-draw.test.js:168-207` (O1, torus/contour sagitta) — **population
  re-scoped from all-population to longest-third-by-chord-length; the numeric bar (`>= 0.10mm`) is
  UNCHANGED.** This is the IDENTICAL re-scope T2-2 already made and both `T2-review.md` and
  `T2-2-review.md` §5 independently ruled sound — re-adopted here because T2-3 reintroduces the same
  variable-length mechanism that made the all-population median mix long and short chords (sagitta scales
  with chord length squared, so short near-flick ticks legitimately show far less curvature over their own
  short span — not a walk regression). Measured on this tree: all-population median dropped 0.127mm (no
  length mechanism) -> **0.088mm** (T2-3, all-population, now ALSO carrying the cross-row stagger, which
  reduces it a little further than T2-2's own 0.076mm) -> **0.1765mm** on the longest third (clears the bar
  with 76% margin). Why the same re-scope applies again: the population change is inherent to reintroducing
  `chan:'len'` at all, not specific to the stagger.
- New file `tests/unit/scene3d-mktick-wedge.test.js` introduces new bars (`WEDGE_MEAN_BAR`,
  `WEDGE_CELL_CEILING`) — not a change to an existing bar, but disclosed per the same spirit: both are
  **non-regression ceilings set from this unit's own measured shipped values with a small margin** (see
  `## HONEST METHODOLOGY LIMITATION` for why the per-cell ceiling is loose on some cells), not proof that
  the absolute picture is defect-free — the mutation-kill table is the actual evidence of improvement.

## Evidence — LOOKED at, native-resolution crops

`docs/3d-audit/fill-audit/after/T2-3/` — 36 shots (18 addLayer-rig + 18 create-rig, sphere/torus/cone x
hatch/contour x mkTick x low/med/max), `report.json`, and 4 native-resolution crops under `crops/`.

**cone/hatch/med, lit flank, 3x crop.** BEFORE (`chan:'count'`, the pre-length design): a comb of
SAME-length ticks whose SPACING widens approaching the highlight — count-carries-tone, the pre-existing
design. AFTER (T2-3): ticks visibly SHRINK in length approaching the highlight while staying densely
spaced, and — this is the wedge fix specifically — the short ticks near the highlight are SCATTERED at
different perpendicular offsets rather than all sitting rigidly on one row line. Reads as an even,
organic scatter of varying-length marks, not a fan of straight same-length spokes with a hard bare gap
behind them.

**torus/contour/med, fan peak, 4x crop.** BEFORE: the radial fan runs as continuous full-length lines
straight into a flat white highlight plateau. AFTER: the same transition breaks into shorter, dash-like
ticks just before the highlight boundary — less of an abrupt line-to-white cutoff, though the highlight
zone itself (where gaps ARE legitimate per R2) is unchanged in extent, as expected.

## Stop conditions checked

- Scope leak: none — byte-identity sweep confirms zero non-`mkTick` differences across 384 cells.
- Ink: not separately re-measured this unit (out of the ranked-mechanism's own scope; O5/wedge/coverage
  are the named acceptance quantities).
- `ringFillRate`/`degenerate`/`wide`: N/A — this unit is the MK mark-law path, not the ribbon path; the
  five named ribbon guards (f1b-streaks/wall-coverage/f1-amp/erode-refusal) all stayed green, confirming
  no cross-contamination.
- Band does not close at d=220 (T2-4's territory) — reported above, not fudged, not widened.
- No new `[FillBoolean]` failures beyond the documented pre-existing noise.
- **Reporting DONE/FU, not "closed":** the wedge/hole raster's own methodology limitation (disclosed
  above) means the per-cell separation is thin on some cells — this needs Jay's own eye on the crops
  (provided) before it can be called visually closed, per the standing "harness-clean is not app-clean"
  rule and Jay's rule requiring a look at the real picture.

## Commit

Committing `src/core/scene3d/surface-fill.js`, the two new test/helper files, and the O1 re-scope in
`tests/unit/scene3d-mark-laws-draw.test.js`, with the six-cell wedge numbers in the message body. Then
STOP. Not pushed.
