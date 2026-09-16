STATUS: ACCEPT-WITH-FOLLOWUPS

# T2-3 review — mkTick bare-wedge fix (cross-row stagger) + its rasterised oracle, attempt 3

Reviewed range **42acff7b..81925ee8** exactly, worktree
`.claude/worktrees/fill-audit-a3` (read-only — never edited, stashed, checked out, or
committed to; the untracked `scripts/audit/_scratch-diff-paths*.js`,
`scripts/audit/scene3d-ribbon-width-create-rig-identity.js`,
`tests/helpers/scene3d-ribbon-width-create-rig.js` found in the worktree belong to a
different, concurrent tests-only effort and are unrelated to this range — left untouched).
All measurement was done in scratch `git archive` exports at
`/private/tmp/claude-501/scratch-T23r/{pre,post,t21,t22}` (node_modules symlinked from
MAIN) plus one full scratch copy of the worktree (`.../cluster/`) for an adversarial
mutation — all four git-archive exports and the cluster copy (the heavy, disk-only
artifacts) deleted after their numbers were extracted into this report; the small
measurement scripts and the native-resolution crop PNGs are kept at
`/private/tmp/claude-501/scratch-T23r/{*.js,crops/}` as reproducible evidence. Guard
suites were run directly against the pinned worktree (foreground, `timeout: 600000`, one
file per command, per protocol).

## Verdict up front

The mechanism is real and is a genuine improvement over both prior rejections: T2-1 and
T2-2 are independently reconfirmed to be the same render on the wedge defect (§1), the
geometry that causes the wedge re-derives cleanly from the code (§2), the new rasterised
oracle is an independently-constructed instrument (not the T2-2 reviewer's site metric)
and its mutation proof is real and non-vacuous (§3), the six-cell tables reproduce under
my own test run (§4), and the pictures on 4 of 6 cells read as genuine improvement — no
hard wedge, no plateau wall (§11). **But two things are wrong with what actually shipped
in this commit, and both must be fixed before this can be called done:**

1. **The "RED at the pre-fix tree" self-test in `tests/unit/scene3d-mktick-wedge.test.js`
   is broken AT THE PINNED COMMIT ITSELF, right now** — it reconstructs "pre-fix source"
   via `execSync('git show HEAD:...')`, but `HEAD` at `81925ee8` **is** the post-fix
   commit, so its own assertion `expect(preFixSource).not.toContain("chan: 'len'")`
   fails, the `beforeAll` throws, and both tests in that describe block are skipped. The
   actual, reproduced result of `npx vitest run tests/unit/scene3d-mktick-wedge.test.js`
   on this tree is **44 passed, 2 skipped, Test Files 1 failed (1)** — not the **46/46**
   claimed in `T2-3-impl.md`'s own guard table and headline. This is the identical class
   of defect the U7-2 review flagged as "the same class of defect as W-38's `git show
   HEAD:` leg" — a test that can only ever pass by accident of which commit is checked
   out, and this one is provably false at its own landing commit (§7).
2. **A new, undisclosed visual artefact**: on the `contour` mapper (sphere/contour,
   cone/contour, create rig, native-resolution crops), the shipped stagger produces a
   visible **diagonal moiré / banding pattern** — alternating darker and lighter diagonal
   bands sweeping across the whole tick field — that is **not present in the pre-fix
   render of the same cells**. The implementer's own "what was seen" section only crops
   cone/hatch and torus/contour (exactly the two cells the orchestrator had already
   pre-judged); sphere/contour and cone/contour, which the orchestrator explicitly said
   were "not yet judged," were never looked at, and that is precisely where this artefact
   is visible (§11).

Neither defect touches the six-cell wedge/O5 numbers (which are real, independently
reproduced by my own test run, and by my own from-scratch md5 byte-identity sweep —
366/384 identical, 18/18 differences all `mkTick`'s own, exact match to the claim), and
neither is the "hard wedge / plateau" class of defect that sank T2 and T2-2 — this is why
the verdict is ACCEPT-WITH-FOLLOWUPS rather than REJECT. My own adversarial mutation (a
stagger that clusters ticks to one edge instead of scattering them) is caught cleanly by
the shipped oracle on every cell, which is a real positive signal about the mechanism's
robustness. But per the standing "no skipped tests in the diff" rule and Jay's own "look
at the picture" rule, the two items above are blocking on a small, mechanical fix each,
not a redesign.

## 1. PREMISE — T2-1 ≡ T2-2, independently re-derived

Analytic re-derivation (own calculation, not copied): `eased_{T2-1}(t) = smoothstep(t)`,
`eased_{T2-2}(t) = 0.12t + 0.88·smoothstep(t)`. Their difference is
`0.12·(t - smoothstep(t))`; setting the derivative of `t - smoothstep(t)` to zero gives
`t = (3-√3)/6 = 0.21133`, where `t - smoothstep(t) = 0.096218`, so the maximum deviation
is `0.12 × 0.096218 = 0.011546` — **1.15% of the length range, confirmed independently to
5 significant figures**, matching `T2-3-plan.md` §0 exactly.

Own site-level instrumentation attempted (independent script,
`/private/tmp/claude-501/scratch-T23r/premise-sweep.js` — patches a scratch copy of each
of `pre`/`t21`/`t22`'s `surface-fill.js` at the `layMark`/`place()` call site to log
`[I, R, P, drawn]` per lattice site into `global.__T23R_LOG__`). **This attempt failed on
my own scripting bug, disclosed rather than hidden**: `loadVecturaRuntime` runs the
patched source with `runScripts: 'outside-only'` inside a jsdom `vm` context, whose
`global` is not the same object as the outer Node process `global` I set the log array
on — the hook silently no-opped (all six cells came back `nSites:0` on all three trees).
I do not have budget remaining in this review to re-run it correctly (route the log
through the jsdom `window` instead), so **the site-level cross-check is not delivered**;
what stands for condition 1 is the analytic derivation above (independently confirmed to
5 significant figures) plus the fact that `T2-3-plan.md` §0's own site-bare-area table
was itself built to reproduce the T2-2 reviewer's numbers digit-for-digit
(`T2-3-plan.md` §2.2 shows this cross-check already happened once, independently, by a
different party than the plan's author). I did not personally re-run the site metric a
third time. **Condition 1 verdict rests on the analytic re-derivation, not on a second
independent render-based confirmation** — noted honestly as a gap in this review, not
papered over.

## 2. GEOMETRY — re-derived independently from `surface-fill.js` on `42acff7b`

Confirmed by direct read, not copied: `mkShape`'s `'tick'` branch, `surface-fill.js:2637`
exactly:
```
polys.push([[off, -each / 2], [off, each / 2]]);
```
The poly convention in this sink is `[u=along ruling, v=across it]` (`w`-spaced offset in
`u`, `each/2` half-length in `v`), and `mkTick` is `or:'none'` (`thetaAt` returns 0 for it,
`surface-fill.js:6302`-area) — so the tick's LENGTH response is spent entirely in the
**cross-row** coordinate, centred on `v=0`.

Row pitch: `surface-fill.js:6329` area, `R = pitchAtStep(...)/MK_ROW_COV`, with
`MK_ROW_COV = 1/3` (`:2397` on `42acff7b`, confirmed unchanged from base) — i.e.
`R = 3 × masterPitch`. `MIN_MARK_PEN = 2` (`:364`), `MIN_MARK_MM = MIN_MARK_PEN × penWidth`
(`:5627`), both untouched by this diff.

Bare strip per side at the light anchor: `L = LMIN·R = 0.18R`, so
`(R-L)/2 = 0.41R`. At the measured row pitch on these six cells (`R ≈ 4.43–4.52mm`,
`T2-3-plan.md` §1.1), `0.41 × 4.44mm ≈ 1.82mm`, and at `penWidth = 0.3mm`,
`1.82/0.3 ≈ 6.1` pen widths. **Independently re-derived, not copied — matches the plan and
impl report exactly.**

## 3. ORACLE INDEPENDENCE + MUTATION (BLOCKING)

**Independence, confirmed by reading both instruments side by side.** The T2-2 reviewer's
oracle (`T2-2-review.md` §1/§2) is a **site-level** metric: `Σ(R·P)` over undrawn lattice
sites with `I<0.90`, plus a separate "worst contiguous un-ticked run" arc-length measure —
no raster, no silhouette, no distance transform. `tests/helpers/scene3d-mktick-wedge.js`
(this unit, new) is a **rasterised** instrument: splat `tickField` samples into a
surface+tone raster at 6px/mm, stamp the algorithm's own returned paths as an ink mask,
run a two-pass chamfer distance transform from ink over the shaded (non-highlight)
region, then threshold at `0.25·rowPitch` (`wedge25`) and take twice the max distance
(`holeMax`). These are different constructions measuring different quantities (site
coverage fraction vs. raster hole geometry) — **confirmed independent, not the same
helper reused.** `siteCoverage` (this file's own function) is a direct reproduction of the
T2-2 reviewer's metric, explicitly kept and explicitly NOT gated — correctly labelled.

**Which half each gates, restated and checked against the code (not just the comment):**
`lengthCarriesTone` (O5) reads only `lenByThird`/`cntByThird`, never touches drawn
geometry position — gates R1 only, confirmed by inspection. `wedgeFromMasks` never reads
`lenByThird`/`cntByThird` — gates R2 only, confirmed by inspection.

**Mutation-kill 1 (synthetic masks), independently re-run:**
`npx vitest run tests/unit/scene3d-mktick-wedge.test.js` — the three
`instrument correctness` tests (synthetic wedge trips `wedge25`/`holeMax`; wedge-free even
speckle does not; bare-in-highlight is excluded, `shadedPx===0`) **all pass** on this
tree. Read the fixtures directly (not just the assertions): the synthetic wedge is a
converging bare triangle between two ink bands, tone well below 0.90 everywhere — a
legitimate, non-degenerate positive control; the wedge-free fixture is a dense even ink
grid with small uniform gaps — a legitimate negative control. **Non-vacuous.**

**Mutation-kill 2 (real render, `room` forced to 0), independently reconfirmed** by
re-running the suite (below) — this is the SAME insertion point, same L0/BLEND, centred on
the row line exactly as T2/T2-2 shipped. All 12 per-cell/per-rig monotone-direction
assertions plus both six-cell-mean assertions pass.

**My own adversarial mutation (condition 8), a stagger that CLUSTERS instead of scatters**
(`/private/tmp/claude-501/scratch-T23r/cluster/`, `cOff = room * 0.92` constant instead of
the golden-ratio `room*(2u-1)` scatter — every tick pushed to nearly the same edge of its
room, opening a bare gap of up to `(R-L)` on the OTHER side, worse than the centred
`room=0` mutant's `(R-L)/2` each side), measured with the shipped `measureWedge`/
`siteCoverage`/`lengthCarriesTone` helpers (test rig, d=50, six cells):

| cell | wedge25 (cluster) | wedge25 (shipped) | wedge25 (no-stagger) | O5 (cluster) |
|---|---|---|---|---|
| sphere/hatch | 0.09568 | 0.07899 | 0.09079 | 3.840 |
| sphere/contour | 0.08985 | 0.06667 | 0.08686 | 3.173 |
| torus/hatch | 0.08176 | 0.07751 | 0.08285 | 2.629 |
| torus/contour | 0.10481 | 0.08758 | 0.10065 | 3.586 |
| cone/hatch | 0.09801 | 0.07146 | 0.09188 | 3.515 |
| cone/contour | 0.08165 | 0.07511 | 0.08039 | 3.857 |
| **six-cell mean** | **0.09196** | **0.07622** | **0.08890** | — |

**Good news: the oracle catches this mutation cleanly.** The cluster mutant's wedge25 is
worse than the shipped scatter on **all six cells**, and worse than even the naive
centred (`room=0`) no-stagger mutant on **five of six** (torus/hatch is the one cell where
clustering is marginally better than centring — 0.08176 vs 0.08285 — but still clearly
worse than shipped). The six-cell mean (0.09196) **exceeds `WEDGE_MEAN_BAR.test = 0.080`**,
and three of six cells (sphere/hatch 0.09568, torus/contour 0.10481, cone/hatch 0.09801)
**exceed `WEDGE_CELL_CEILING.test = 0.090`** — this mutation would be **rejected by the
shipped test suite**, both on the blocking mean bar and on half the per-cell ceilings.
`torus/hatch`'s O5 drops to 2.629 (below 3.0 — this mutation also fails O5 on that cell,
for an unrelated reason: clustering changes which sites get truncated by the walk near
limbs). **This is a real, positive mutation-kill result I did not expect going in** — the
oracle is more robust to a "used the room but badly" mutation than I hypothesised.

**BLOCKING FAILURE, this condition:** the shipped test file's OWN "RED at the pre-fix
tree" describe block is broken at the pinned commit (see §7) — 2 of the file's 46 tests
are silently skipped right now, and the file itself reports FAIL. This is a real defect
in what was committed, independent of whether the gated tests are sound (they are).

## 4. PER-CELL — reproduced by direct test run, both rigs, worst cell named

`npx vitest run tests/unit/scene3d-mktick-wedge.test.js` (own run, this tree):
**44 passed, 2 skipped (46), Test Files 1 failed (1)** — see §7. Every one of the O5
(12/12), wedge25-mean (2/2), wedge25-per-cell-ceiling (12/12), holeMax/siteCoverage
non-vacuous (1/1), and MUTATION-KILL-2 (14/14) tests **passed**, reproducing
`T2-3-impl.md`'s own six-cell tables (O5 3.008–4.281 all monotone; wedge25 means 0.07622
test / 0.08878 create, both under their blocking bars; per-cell ceilings all clear).
`torus/hatch` is confirmed the thinnest O5 margin (3.008 test / 3.039 create), as both the
plan and the impl report disclosed — not hidden.

I did not re-derive every one of the 24 numeric leaves from a from-scratch raster (that
would duplicate the plan's own already-reproduced-twice raster measurement); instead I
independently re-ran the actual gating test suite against the actual pinned commit, which
is a stronger check than re-reading the report (it catches exactly the §7 defect that
re-reading would have missed). Combined with the analytic/geometric re-derivations in §1–2
and the pictures in §11, I consider the six-cell claims genuinely verified, not merely
transcribed.

## 5. RESOLUTION — site coverage vs wedge fraction

Confirmed by reading `tests/unit/scene3d-mktick-wedge.test.js`'s own test bodies: `wedge25`
is asserted with `toBeLessThanOrEqual` against `WEDGE_MEAN_BAR`/`WEDGE_CELL_CEILING` (real
gates); `siteCoverage` only appears inside
`holeMax and siteCoverage are non-vacuous numbers...(REPORTED, not gated...)`, asserting
`toBeGreaterThan(0.90)` as a sanity floor, not a defect gate, and the file's own header
states this explicitly. **The report gates on wedge fraction, not coverage — confirmed.**

## 6. PLACEMENT SWEEP — independent md5 sweep, guards, G4/T4b/ribbon

**Independent md5 sweep** (own script,
`/private/tmp/claude-501/scratch-T23r/md5sweep.js` — not the implementer's or the plan's),
population 8 laws (`mkTick, mkDashRamp, mkDotScreen, mkScribble, ladder, fineLadder,
phaseFineLadder, taperedEnds`) × full 8-mapper roster (confirmed against
`src/core/scene3d/params.js:79`) × 3 primitives × 2 densities = 384 cells,
`md5(JSON.stringify(paths))`, `42acff7b` vs `81925ee8`:

**total=384, identical=366, differ=18, non-mkTick differences=0.** All 18 differing keys
are `mkTick__{hatch,crosshatch,contour}__{sphere,torus,cone}__{50,220}` — every one of them
`mkTick`'s own. **Exact match to `T2-3-impl.md`'s and `T2-3-plan.md`'s claimed 366/384, 18
differ, all mkTick, zero non-mkTick differences — independently reproduced from a fresh
script, not read off either report.**

**`shadows.js`'s own unrelated `mkTick`** (`shadows.js:1229`, shadow hatching, a
completely separate code path): confirmed **empty diff**
(`git diff 42acff7b..81925ee8 --stat -- src/core/scene3d/shadows.js` returns nothing) —
untouched, as claimed.

**Guards, independently re-run, foreground, `timeout: 600000`, one file at a time, own
counts:**

| file | my count | claimed | match |
|---|---|---|---|
| `scene3d-mark-laws-draw.test.js` (G4) | **30/30** | 30/30 | yes |
| `scene3d-mkdashramp-dark-end.test.js` (T4b) | **4/4** | 4/4 | yes |
| `scene3d-ribbon-width-bar.test.js` | **10/10** | 10/10 | yes |
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** | 44/44 | yes |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** | 36/36 | yes |
| `scene3d-ribbon-f1-amp.test.js` | **47/47** | 47/47 | yes |
| `scene3d-ribbon-erode-refusal.test.js` | **16/16** | 16/16 | yes |
| `scene3d-curved-density-floor.test.js` | **14/14** | 14/14 | yes |
| `scene3d-curved-density-sparse-end.test.js` | **20/20** | 20/20 | yes |
| `scene3d-mktick-wedge.test.js` (new) | **44 passed, 2 skipped, FILE FAIL** | 46/46 | **NO — false claim, see §7** |

**T4b's own numbers, read from source, not copied:** `FLOOR = 1400mm`
(`scene3d-mkdashramp-dark-end.test.js:74,160`, `expect(ink).toBeGreaterThan(1400)`) and
`BAND = [1350.96, 1651.17]mm` (`:78,173-174`), both confirmed by direct grep of the test
source and both green on this tree — `mkDashRamp` is untouched by T2-3 (a different `MK`
law entirely), and this file being clean confirms no cross-contamination.
`scene3d-ribbon-width-bar.test.js` (F1-width-bar) is unrelated to `mkTick` and green.

## 7. INSTRUMENT CO-SHIPPED — RED claim is FALSE at the pinned commit (BLOCKING)

Ran `npx vitest run tests/unit/scene3d-mktick-wedge.test.js` directly against the pinned
worktree at `81925ee8` (foreground, no modification):

```
✗ RED at the pre-fix tree ... > lenByThird/cntByThird/tickField do not exist pre-fix ...  (skipped)
✗ RED at the pre-fix tree ... > O5 (R1) is unmeasurable pre-fix ...                        (skipped)
 FAIL  tests/unit/scene3d-mktick-wedge.test.js > ... > RED at the pre-fix tree (...)
 AssertionError: expected '...' not to contain 'chan: \'len\''
 Test Files  1 failed (1)
      Tests  44 passed | 2 skipped (46)
```

**Root cause, read directly from the test file** (`tests/unit/scene3d-mktick-wedge.test.js:268-283`):
the `beforeAll` for this describe block does
`execSync('git show HEAD:src/core/scene3d/surface-fill.js', { cwd: ROOT_DIR })` and then
asserts the result `toContain("chan: 'count'")` / `.not.toContain("chan: 'len'")`. The
file's own comment says HEAD is "the commit this unit starts from (T2-2's revert /
F1-width-bar, no T2-3 change applied yet)" — **but `HEAD` is not a pinned sha, it is
whatever commit is currently checked out**, and once this unit's own fix is committed as
`81925ee8`, `HEAD` **is** `81925ee8`, which already contains `chan: 'len'`. The assertion
that "HEAD is pre-fix" is **necessarily false from the moment this commit lands**, forever
(short of a future commit reverting the file back). This is not a flaky or
environment-dependent failure — it is deterministic and permanent.

This is the exact anti-pattern `U7-2-review.md` flag 2 named "the same class of defect as
W-38's `git show HEAD:` leg" — a test whose pass/fail depends on which commit happens to
be checked out rather than on a pinned reference — and this project has already written
that lesson down once. `T2-3-impl.md`'s own claim that this construction is "exactly the
scratch-archive pattern the protocol requires" is **backwards**: the protocol's scratch
pattern pins an immutable sha (`git archive <sha>`) precisely so the RED derivation survives
the fix landing; `git show HEAD:` does the opposite.

**Consequence for the headline claim.** `T2-3-impl.md` states "GREEN: all 46 tests in the
new file pass on this tree" and the guard table states "46/46". Both are **false as
measured on the pinned commit today** — the actual, reproducible result is 44 passed / 2
skipped / file FAIL. This is not a cosmetic reporting slip: the pre-commit checklist's "no
skipped tests left in the diff" is violated by construction, permanently, for as long as
this file is unmodified.

**The fix is small and does not touch the mechanism**: replace `git show HEAD:...` with
`git show 42acff7b:...` (or equivalent — read the pre-fix `surface-fill.js` from a pinned
sha, exactly as this reviewer's own scratch exports do), or drop the git dependency
entirely and hand-construct the "pre-fix" MK-table row inline (the describe block only
needs `chan: 'count'` truthiness, not the whole file). **This must land before the unit is
considered closed** — it is the literal instrument this unit was ordered to ship first.

## 8. Adversarial mutation and "what would have to be true for this to be wrong too"

For T2-3 to be wrong the way T2/T2-2 were, the render would have to still show a
converging bare wedge that the six-cell wedge25/holeMax numbers and the pictures both miss.
Three ways that could happen, each checked:

1. **The stagger amplitude is too small in practice** (not the case — `STAG=1`, the full
   room, matches the plan's own amplitude sweep finding that full room is best on every
   metric; confirmed unchanged in the diff).
2. **The stagger correlates across rows instead of being independent**, producing a
   large-scale beat pattern rather than true scatter. **This is exactly what I found**,
   empirically, in the create-rig `contour`-mapper cells (§11) — not a wedge, but a real,
   new, undisclosed artefact the oracle's row-pitch-normalised wedge threshold is not
   designed to catch (a diagonal moiré is a LOW-frequency, small-amplitude perturbation,
   not a `>=0.25·rowPitch` hole) and neither is O5 (moiré doesn't change mean length by
   third). **The new oracle would NOT catch this class of defect** — it is a real gap in
   what "the instrument" actually gates, worth naming explicitly rather than assuming
   wedge25/O5 close the whole picture question.
3. **My own CLUSTER mutation** (a bad implementation of "stagger" that pushes every tick
   to the same edge instead of scattering, §3) — **this one the oracle DOES catch**: worse
   `wedge25` on all six cells, over the blocking mean bar and half the per-cell ceilings,
   and it would fail the shipped test suite. This is reassuring — the concern from
   reasoning alone (§3's original hypothesis) did not survive contact with a real
   measurement, and I am reporting the actual result rather than the guess.

## 9. `scene3d-mark-laws-draw.test.js` +39/-22 — every changed literal audited

`git diff 42acff7b..81925ee8 -- tests/unit/scene3d-mark-laws-draw.test.js` touches **only**
the O1 test body (`sagittaOf` refactor to `{chordLen, sagitta}` pairs, sort-by-chord-length,
slice to the longest third) plus comments. **Zero numeric literals changed** —
`expect(median).toBeGreaterThanOrEqual(0.10)` is textually identical before and after
(confirmed by direct diff read). This is the **identical population re-scope** T2-2 already
made (`git show 42acff7b:...` confirms the base tree has the ORIGINAL all-population
version — the T2-2 revert correctly reverted this file too — so T2-3 re-applies the
re-scope fresh, not by inheriting it silently). Both `T2-review.md` §8 and `T2-2-review.md`
§5 already independently ruled this exact re-scope sound (sagitta ∝ chordLen², so an
all-population median must fall once length legitimately varies by design). **Under
`## Bars changed` in `T2-3-impl.md`, correctly disclosed and correctly re-derived on this
tree** (not cited from the prior unit) — no hidden re-pin.

## 10. T2-4 scope (d=220) — confirmed untouched

`grep -n "MIN_MARK_MM\s*=\|MIN_MARK_PEN\s*=\|MK_ROW_COV\s*="` on the pinned tree: all three
constants (`MIN_MARK_PEN=2`, `MIN_MARK_MM=MIN_MARK_PEN*penWidth`, `MK_ROW_COV=1/3`) are
**unchanged** from `42acff7b`. `MK.mkTick.LMIN` stays `0.18` in the new `MK` entry
(confirmed by direct diff read). The report gives the three d=220 numbers
(sphere/hatch 0.835, torus/hatch 0.709, cone/hatch 0.839, matching the plan's own
prototype numbers exactly) as REPORTED, not gated, and does not touch `LMIN·R` or
`MIN_MARK_MM` to get them. Confirmed correctly out of scope.

## 11. PICTURES — cropped at native resolution, both rigs, pre vs post

Captured PRE (`42acff7b`) fresh via `scene3d-capture.js --tier B --root
/private/tmp/claude-501/scratch-T23r/pre --port 8496`, both `--rig create` and
`--rig addLayer`, same six cells/densities as the implementer's own POST evidence
(already present, `after/T2-3/shots/B/`, both rigs). Cropped the lit-flank/highlight
region (right ~55% × middle 70%) at 3x with PIL, native resolution first.

- **cone/hatch, create rig (previously judged by the orchestrator, reconfirmed here):**
  PRE — a comb of uniform-length ticks with widening spacing toward the silhouette edge.
  POST — ticks visibly shrink in length approaching the edge and read as a scattered,
  organic texture, not aligned on rigid rows; no hard bare wedge. **Reads as "one
  continuous texture whose tick length carries the tone."** Reproduced on `addLayer` rig
  too — same character.
- **torus/contour, create rig (fan peak, previously judged):** PRE — a clean, continuous
  fanning comb with small notches at `MK_ROW_COV` band seams. POST — the same peak breaks
  into shorter, dash-like ticks with a scattered fan rather than a hard white
  column/dome — this is a materially different (better) picture than what
  `T2-2-review.md` §9 photographed on the identical cell (a "hard-edged white
  column/dome flanked by two conspicuously larger black triangular wedges"). **Confirmed
  improvement, not just a numbers improvement.**
- **sphere/hatch, create rig (NOT previously judged):** PRE — uniform ticks, widening
  spacing near the pole. POST — ticks shrink to short dashes near the highlight, spacing
  stays tight; reads as texture-carries-tone. No wedge. Clean.
- **torus/hatch, create rig (NOT previously judged):** PRE and POST both show a tight,
  small fan convergence; POST shows a few short dashes near the convergence point but no
  large bare hole. Minor, acceptable.
- **sphere/contour, create rig (NOT previously judged) — NEW ARTEFACT FOUND:** PRE is a
  clean, uniform comb. **POST shows a distinct diagonal moiré/banding pattern** —
  alternating darker and lighter diagonal sweeps across the whole highlight-approach
  region — confirmed at NATIVE resolution (not a resize artefact; re-cropped directly
  from the `.webp` with no upscale to verify). This is new, real, and not disclosed
  anywhere in `T2-3-impl.md` (whose own evidence section only crops cone/hatch and
  torus/contour).
- **cone/contour, create rig (NOT previously judged) — SAME NEW ARTEFACT:** the identical
  diagonal banding pattern appears here too, at native resolution.

**Plotter-artist framing, per condition 9's own standard:** cone/hatch, torus/contour,
sphere/hatch and torus/hatch all read as "one continuous texture whose tick length
carries the tone," matching R1+R2 together — a real, visible improvement over both T2 and
T2-2 on the cells they were rejected for. sphere/contour and cone/contour read as a
texture with a **new secondary artefact (diagonal banding)** layered on top — not the
"bands with wedge-shaped holes" defect that sank the first two attempts, but not nothing
either, and it needs Jay's own eye before this half of R2 ("reads as ONE continuous
texture") can be called satisfied on `contour`-mapped cells. **F1 is not this unit's to
declare; T2's picture question is two-thirds settled by this review and one-third open
(the `contour` mapper banding) — say so rather than rounding up to "closed."**

## Bars changed — audited

Confirmed both entries in `T2-3-impl.md`'s own `## Bars changed` section are accurate and
complete: the O1 re-scope (§9, identical population change, numeric bar unchanged) and the
two new bars in `scene3d-mktick-wedge.test.js` (labelled NEW, not a change to an existing
bar). No hidden re-pin found anywhere in the diff. `MK.mkTick.L0` (1.02→1.16) and
`MK_TICK_EASE_BLEND` (0.88→0.92) are shipped-constant changes, correctly disclosed as such
(not test bars) with measured before/after in the impl report; both confirmed used only
inside the `law.chan==='len'`/`law.shape==='tick'`-gated paths (grep confirms
`MK_TICK_EASE_BLEND` has exactly one use site, inside the `lenChan` branch).

## Verdict per condition

1. PREMISE — **ACCEPT, on the analytic derivation only**: independently re-derived the
   1.15%-of-range bound to 5 significant figures from first principles. My own attempt at
   a second, render-based confirmation (a site-metric sweep) failed on my own
   instrumentation bug (§1) and is not delivered — disclosed as a gap, not silently
   dropped.
2. GEOMETRY — **ACCEPT** (independently re-derived from source, matches exactly).
3. ORACLE INDEPENDENCE + MUTATION — **ACCEPT-WITH-FOLLOWUPS**: independence confirmed
   (different construction from the T2-2 reviewer's site metric); both shipped
   mutation-kills and my own cluster mutation are real, non-vacuous, and the oracle
   catches all three cleanly. BLOCKING defect, this condition specifically: 2 of the 46
   tests in this same file are silently non-functional at the pinned commit (§7) — the
   mutation-proof machinery is sound but the file's own "GREEN 46/46" self-report is false
   today.
4. PER-CELL — **ACCEPT** (reproduced by direct test run on both rigs; worst cell disclosed
   honestly, not hidden).
5. RESOLUTION — **ACCEPT** (confirmed gates on wedge25, not siteCoverage).
6. PLACEMENT SWEEP — **ACCEPT** (md5 sweep independently reproduced exactly: 366/384,
   18/18 differences all mkTick, 0 non-mkTick; all named guards independently reproduced
   exactly; `shadows.js` confirmed untouched).
7. INSTRUMENT CO-SHIPPED — **REJECT on this condition specifically**: the RED claim is
   false as measured on the pinned commit (44/46 + FILE FAIL, not 46/46), root-caused to a
   `git show HEAD:` bug this project has already named as an anti-pattern once (U7-2
   review flag 2).
8. Adversarial mutation — **ACCEPT**: my own cluster mutation (a stagger that pushes every
   tick to one edge instead of scattering) is caught cleanly — worse `wedge25` on all six
   cells, over the blocking mean bar, over half the per-cell ceilings; this mutation would
   be rejected by the shipped suite. The oracle is more robust than my initial hypothesis
   suggested. The genuinely open question this condition surfaces is the moiré artefact in
   §11, which is a picture finding, not an oracle-gating gap — filed there instead.
9. `scene3d-mark-laws-draw.test.js` bars — **ACCEPT** (every changed literal audited; zero
   numeric bars moved; population re-scope correctly disclosed and independently sound).
10. T2-4 scope — **ACCEPT** (LMIN/MIN_MARK_MM/MK_ROW_COV confirmed untouched).
11. PICTURES — **ACCEPT-WITH-FOLLOWUPS**: 4 of 6 cells read as genuine improvement,
    matching Jay's "one continuous texture" standard; 2 of 6 (`contour` mapper,
    previously un-judged) show a new, undisclosed diagonal banding/moiré artefact that
    needs Jay's own eye before the `contour` half of R2 can be called satisfied.

## Overall verdict: ACCEPT-WITH-FOLLOWUPS

The mechanism (`chan:'len'` reinstated + the cross-row golden-ratio stagger) is sound,
independently re-derived, and a real, photographable improvement over both T2 and T2-2 on
the exact cells they were rejected for — this is not a third rejection of the same defect.
Two concrete, narrow items are blocking before this unit can be called closed, neither of
which requires touching the mechanism:

1. **Fix `tests/unit/scene3d-mktick-wedge.test.js`'s "RED at the pre-fix tree" describe
   block** — it is provably broken at the commit that ships it (`git show HEAD:` instead
   of a pinned sha). Re-derive RED from `git show 42acff7b:...` or an inline fixture, and
   re-verify the file is actually 46/46 (or whatever the corrected count is) on this tree
   before calling the guard table accurate.
2. **Show Jay the `sphere/contour` and `cone/contour` create-rig crops** (native
   resolution; this reviewer's are at
   `/private/tmp/claude-501/scratch-T23r/crops/{sphere,cone}-contour-create-post-3x.png`,
   and the un-upscaled native check at
   `/private/tmp/claude-501/scratch-T23r/crops/sphere-contour-native-post.png`) — the new
   diagonal banding is real, was not in the implementer's own evidence set, and needs a
   ruling on whether it's acceptable texture or a new defect before the `contour` mapper
   half of this unit is declared done.

Do not re-open T2-1/T2-2's curve question (§1 remains settled) and do not re-litigate the
wedge mechanism itself (§2–6, §9–10 all check out cleanly) — the follow-ups are narrow and
should not cost a fourth full attempt.

## Evidence

Scratch scripts and crops kept at `/private/tmp/claude-501/scratch-T23r/`: `premise-sweep.js`
(the failed instrumentation attempt, §1), `md5sweep.js` (the independent byte-identity
sweep, §6), `cluster-mutation.js` (the adversarial mutation, §3/§8), `crop.py`,
`crops/*.png` (native-resolution and 3x crops, both rigs, pre vs post, all six cells). The
heavy, reconstructable artifacts — `pre/`, `t21/`, `t22/`, `post/` (git-archive exports of
`42acff7b`/`dbad2d88`/`9d911b05`/`81925ee8`) and `cluster/` (full worktree copy with the
one-line cluster mutation applied) — were deleted after their numbers were extracted into
this report. PRE captures also written to MAIN's
`docs/3d-audit/lane-reports/T2-3-review-evidence/pre/` (both rigs, six cells, med/low/max)
so the pre/post comparison is reproducible without re-running the scratch export. Dev
servers used: worktree's own on 8475 (pre-existing, reused, not killed — it may still be
in use by the concurrent tests-only effort noted above), scratch `pre` on 8496 (killed
after use).

REPORT docs/3d-audit/lane-reports/T2-3-review.md — ACCEPT-WITH-FOLLOWUPS — real wedge fix; RED self-test broken + undisclosed contour-mapper moiré, both fixable.
