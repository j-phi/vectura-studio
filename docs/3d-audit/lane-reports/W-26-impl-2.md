STATUS: DONE/FU

# W-26 iteration 2 — ladder family placed continuously (verify, finish, evidence)

Lane: fill-audit-a. Worktree: `.claude/worktrees/fill-audit-a` (branch `3d-scene/fill-audit-a`).
Base for RED proof: `9fa159f0` (W-01 M1, reviewed ACCEPT). Unit start HEAD: `4ea8caed`
(implementer 1's checkpoint, unverified). Final HEAD: `3c88605f` (this session's own commit, on
top of `4ea8caed` — the two WIP commits were not rewritten).

Files touched by this session: `src/core/scene3d/surface-fill.js` (one line + a load-bearing
comment; the rest of the unit's diff, 9fa159f0..4ea8caed, was implementer 1's, verified not
re-authored). No other `src/` or `tests/` file touched this session. Never touched
`surface-fill-mono.js` / `mappers.js` / `scene3d.js` / `hlr.js` / `ray-torus.js`, and never
touched `surface-fill.js:5084-5157` (the master grid).

## 1. What I verified from implementer 1's checkpoint

`git show --stat f5e22359 4ea8caed` (both already read in full before touching anything):
`f5e22359` — `surface-fill.js` (435 lines) + 8 test files re-pinned/edited + the new red test file
(372 lines); `4ea8caed` — a 17-line remainder in `surface-fill.js` (Stage-0 `STAGE.masterGrid`
guard on `contMapper` and the spiral branch, per the implementer's own handoff note). Read the
full diff `9fa159f0..4ea8caed` (`git diff`, not just stat) end to end: `isEvenLadder()`,
`ladderCov()` (byte-identical to the coverage `literal 'ladder'` already computed —
`coverageForSample`/`fineLadderCov`/`nestedCov`, with the same O6 lit-band floor scoped correctly,
not blanket-clamped), `ladderWantedPitch(I) = masterPitch / clamp(ladderCov(I), 0.02, 1)`,
`algoCoverage` returning a flat `1` for the three laws, `contMapper`'s dispatch gaining
`isEvenLadder() && useLadder && STAGE.masterGrid`, and the spiral mapper's continuous-turn-
placement branch (integrate turn density by trapezoid rule, invert the accumulated-turns lookup),
with the discrete whole-turn-drop kept only for the `symmetric` (double-helix) case, disclosed as
a deliberate scope cut. This matches the plan's brief steps 1-4 point for point.

## 2. RED, reproduced independently (not trusted from the commit body)

`mkdir -p <scratchpad>/faa-9fa159f0 && git -C <worktree> archive 9fa159f0 | tar -x -C
<scratchpad>/faa-9fa159f0`, then `node_modules` symlinked to **main's real** `node_modules`
(the worktree's own `node_modules/` is a near-empty stub — vitest resolves through the ancestor
directory chain when run from inside the worktree, which a `/private/tmp` scratch export does not
have; symlinking straight to main's `node_modules` fixed this — a symlink to the worktree's own
stub does not). Overlaid `4ea8caed`'s `tests/unit/scene3d-ladder-uniform-field-spacing.test.js`
onto that old-source tree and ran it:

```
Test Files  1 failed (1)
     Tests  4 failed | 5 passed (9)
```

Failures, exact numbers, matching the commit body and the addendum's predictions:
- cone+contour R1a ratio: **2.052453945360482** (bar 1.15)
- cylinder+contour R1a ratio: **2.000000000000035** (bar 1.15)
- capsule-barrel R1a ratio: **2.000000000000026** (bar 1.15)
- cone+spiral turn-advance ratio: **77.1673288814952** (bar 1.15) — far worse than the addendum's
  inferred ~2.0, matching implementer 1's note that the discrete whole-turn drop collapses whole
  runs of consecutive turns in the dark band, not just a 1x/2x alternation.

The uniform-field lemma and the two vacuous-pass guards passed even on the old tree (as they must
— they assert properties of the FIELD and of the fix's own non-vacuity, not of the fix itself).

## 3. GREEN at `4ea8caed` (before I changed anything)

`npx vitest run tests/unit/scene3d-ladder-uniform-field-spacing.test.js` in the worktree: **9/9
pass**, confirming implementer 1's fix works as claimed.

## 4. Every named guard, run individually, one file at a time

All from the brief's own list plus the two named in the implementer's commit body
(`scene3d-hatch-density-500`, `scene3d-box-density-bearing`) — run with `npx vitest run
tests/unit/<file>.test.js`, never a glob, never in parallel:

`scene3d-hlr-spatial-index-identity` 6/6, `scene3d-tone-algo-default` 6/6,
`scene3d-curved-density-floor` 12/12, `scene3d-curved-density-sparse-end` 20/20,
`scene3d-form-ladder` 6 passed/24 skipped, `scene3d-fill-even-spacing` 11/11 (**REPLACED, not
deleted** — implementer 1's own diff swapped the old kept-INDEX-gap oracle for the drawn/
projected-gap rule, matching the addendum's explicit instruction), `scene3d-fill-span-verdict`
6/6, `scene3d-fill-ruling-continuity` 10 passed/1 skipped, `scene3d-fill-seam-continuity` 5/5,
`scene3d-plot-floor-obj` 12/12, `scene3d-plot-safety` 5 passed/1 skipped,
`scene3d-subwindow-density` 3 passed/2 skipped, `scene3d-appdefault-lit-floor` 4 passed/1 skipped
(inspected the "tone is still made by DROPPING rulings" test directly — it asserts a bound on
drawn-line count vs. the master-grid floor, not on the discrete-index mechanism, so it is not
vacuous under continuous placement), `scene3d-ribbon-f7-self-occlusion` 2/2,
`scene3d-hatch-density-500` 14/14, `scene3d-box-density-bearing` 4/4. **All green, all real
assertions** (checked each file's actual assertions, not just the pass/fail line, for the ones
whose names sounded like they might describe discrete-ladder-specific mechanics).

## 5. Full 117-file scene3d sweep, one file at a time (protocol: never a glob)

`ls tests/unit/scene3d*.test.js` → 117 files, split into 6 batches, each file run individually via
`npx vitest run <file>`, none run in the background by me (the harness auto-backgrounds a call
past 120s; I waited synchronously for each notification before proceeding, never doing other work
against a live test run). **First pass: 116/117 green, 1 real failure** —
`scene3d-style-fill-lines.test.js`: 14/15, `style Fidelity re-samples the CHART (it does not just
subdivide chords)` — `expected 5064.533408156862 to be greater than 5134.099284289115` (dense
fillFidelity produced LESS total chord length than coarse — backwards).

## 6. Diagnosis and fix for the one real regression

Reproduced this exact failure against the `9fa159f0` scratch export (overlaying only the test
file, unmodified source): **15/15 pass there** — proof this is a genuine NEW regression from
routing `ladder` through `emitContFamily`, not a pre-existing flake (implementer 1's own handoff
note had flagged this file as "NOT YET RE-RUN", but for an unrelated Stage-0 `toneLaw:'none'`
concern — the actual mechanism here is different and the handoff note did not anticipate it).

Traced it to `emitContFamily`'s `probe(frac)` (`surface-fill.js`, inside the family walk): `const
st = Math.max(8, Math.round(at.steps || steps))` — the WALK's own numeric resolution for
integrating mean intensity (`I`) and the parameter-to-millimetre conversion (`mmPerFrac`), i.e. the
math that decides WHERE the next ruling lands, fell back to the render-time, Style-tab-Fidelity-
scaled `steps` on any axis-aligned family (plain `axisLine` never sets `.steps`). The file's own
header comment on `fillFidelity` states the intended contract explicitly: "Style Fidelity buys
POINTS... Nothing here touches the mesh... They are orthogonal and neither reads the other." That
was already true for the FINAL rendered line (`emitLineOnce`'s own `nSteps` is an independent
read of live `steps`, confirmed by grep — only one call site in the whole file reads `at.steps ||
steps`, and it is this one, inside `probe`). It was never true for `emitContFamily`'s WALK itself,
for any of the pre-existing `contField*` laws — just never caught, because no test ever exercised
a `contField*` law together with `fillFidelity`. Routing `ladder` (the committed DEFAULT tone law)
through this same engine made a pre-existing latent defect visible for the first time, on the one
fixture (`scene3d-style-fill-lines.test.js`'s sphere+hatch+ladder+Density-50 rig) that happens to
combine a default-tone-law object with a `fillFidelity` sweep.

Fix (one line, `surface-fill.js`, inside `emitContFamily`'s `probe`): changed the fallback from
`steps` to `baseSteps` — the `fillFidelity`-INDEPENDENT mesh-detail constant already in scope
(`baseSteps = Math.max(28, Math.round(finite(opts.detail, 24) * 2))`, defined well above; `steps
=== baseSteps` whenever `fillFidelity === 1`, so this is a **no-op at the default Fidelity for
every existing caller** — the only way to observe any difference is to set `fillFidelity !== 1` on
an axis-aligned `contField*`/ladder-family object, which no other test in the repo does). Scope
note: `angleFamily`'s own `at.steps = steps * len` (angled/wrapped families) keeps its pre-existing
coupling to `fillFidelity` — untouched, no test exercises it, disclosed as a follow-up rather than
silently expanded into.

Verified after the fix: `scene3d-style-fill-lines` 15/15; `scene3d-ladder-uniform-field-spacing`
still 9/9; every one of the 20 previously-verified guards re-run individually, still green; the
full 117-file scene3d sweep re-run a second time, one file at a time, **117/117 green, 0 failed**.

## 7. Ink deltas — disclosed, not fudged

Re-shot the brief's named cells (below) and diffed `pathCount`/`inkMm` against the existing
pre-fix gallery manifests at Density 50 (`med`, chosen specifically because it sits outside the
sparse-end zone W-01 M1 touched, so this is a clean, W-26-only comparison):

| cell | before paths/ink | after paths/ink | dInk% |
|---|---|---|---|
| capsule+contour+ladder | 79 / 628.0mm | 80 / 686.5mm | +9.3% |
| capsule+hatch+ladder | 88 / 765.3mm | 90 / 868.2mm | +13.4% |
| capsule+crosshatch+ladder | 108 / 1245.7mm | 124 / 1690.7mm | **+35.7%** |
| capsule+spiral+ladder | 121 / 1498.1mm | 85 / 794.7mm | **-47.0%** |
| cone+contour+ladder | 92 / 531.6mm | 99 / 689.5mm | **+29.7%** |
| cylinder+contour+ladder | 101 / 954.8mm | 105 / 1101.8mm | +15.4% (at the boundary) |

Three of six exceed the brief's informal ±15% comfort bound. I did **not** treat this as a silent
pass. Checked every other named stop condition first: `scene3d-fill-boundary-ends` (41/41) and
`scene3d-fill-seam-continuity` (5/5) still pass, so no bare patches and no ruling ends in open
front surface; the uniform-field lemma still holds (still asserted green); `wallRings`/`wide` are
not applicable to these plain (non-ribbon) mapper cells. My honest read: the R1a defect is a
systematic **under-inking** artifact by construction — a uniform field's old grid-subset silently
dropped every other kept ruling, turning what should be one pitch of gap into two (bare paper
where ink was owed). Fixing that mechanically **adds** ink wherever the old mechanism happened to
drop a ruling the continuous walk now correctly places — a moderate increase with no dark-region
ruling loss is this exact fix's expected, correct signature, not an explosion. `capsule+spiral`'s
large **decrease** is the mirror image of the RED-proven 77.17× turn-advance defect: the old
whole-turn-drop verdict was clustering many redundant close turns in the dark band; removing that
pathology removes real, previously-redundant ink. I flag this explicitly for reviewer judgment
rather than deciding unilaterally that it is fine — see `open_followups` in `report.json`.

`capsule` also ties Density 1 to Density 50 pre-fix on **all four** mappers (byte-identical, not
just close) — a separate, pre-existing defect (W-01 M1's `CURVED_SPARSE_PITCH_BOOST` retune never
named capsule; matches STILL-OPEN.md's still-open W-01 M2 residual). This unit's fix incidentally
makes capsule respond to density at the low end too — a side effect, not something I verified
beyond noting it; it contaminates the "low" density deltas (huge negative numbers, e.g. -70%,
-80%) which I therefore excluded from the table above as not meaningfully attributable to W-26.

## 8. Evidence — captured, and looked at directly

Captured via `node scripts/audit/scene3d-capture.js --tier A|B --root
.claude/worktrees/fill-audit-a --port 8475 --only '<regex>' --out
docs/3d-audit/fill-audit/after/W-26`, run from MAIN. Checked the dev server on 8475 first
(`ps`/`lsof` on the listening PID) — confirmed it is `scripts/dev-server.js` running from inside
the worktree, so the capture reads this session's own fixed source, not main's. `appVersion` in
every manifest row reads `1.3.98`, matching the worktree's `package.json`.

**Before capturing, checked `shots/B`'s existing torus/cone ribbon-law cells for the W-10-style
manifest-corruption signature** (all torus cells sharing one md5, or a bloated multi-generation
manifest) named in `STILL-OPEN.md`: computed md5 for all 30 existing `torus__hatch__{5
laws}__{low,med,max}__{a,b}` files in `shots/B` — every law's own `low`/`med` pair matches itself,
`max` differs, and **no hash is shared across two different laws**. No `manifest*.jsonl` exists
directly under `shots/B` to inspect for stacked generations. Clean; treated as a trustworthy
baseline.

Cells re-shot (22 named in the brief + the F1 addendum, all already covered by the addendum's own
regex overlapping the brief's cone/torus controls):
`capsule__{contour,hatch,crosshatch,spiral}__ladder__{low,med}__a`,
`cone__contour__{ampSpacing,amplitudeOnly,ladder}__med__a`, `cylinder__contour__ladder__med__a`,
`torus__hatch__{interlockWeave,onePenDown,trochoidLoop,ampSpacing,weaveDepth}__{med,max}__a`.

**Looked at the images directly (Read tool), not just diffed hashes:**
- `cone__contour__ladder__med__a`, before vs after (Tier B): the BEFORE image shows an unmistakable
  paired-ring banding pattern — visible clusters of two close rings alternating with a wider single
  gap, running the length of the cone. The AFTER image shows perfectly even, regularly-spaced
  contour rings top to bottom, no pairing anywhere. This is the R1a defect and its fix, visible to
  the eye exactly as measured (2.05x → ≤1.15x).
- `capsule__spiral__ladder__{low,med}__a`: the pre-fix image (both low and med, byte-identical) is
  a dense, visually chaotic mass of 40+ tightly bunched, unevenly-spaced helical turns, worst near
  the caps. The after/med image shows ~18 cleanly, evenly-spaced turns wound uniformly the length
  of the barrel. Matches the 77.17× → 1.05× spiral turn-advance fix and explains the large ink
  decrease (§7) as real turn-count reduction, not lost tone.
- `capsule__contour__ladder__{low,med}__a`: both images read as reasonably regular at this zoom;
  the after/med image has visibly more rings than the pre-fix low/med (both the same file), i.e.
  capsule now genuinely responds to density (see the capsule sparse-end note in §7).
- `torus__hatch__interlockWeave__med__a` (F1 addendum, after): a dense zigzag interlock weave with
  a thin white band visible between the woven mass and the outer thin concentric rings — exactly
  the "between ribbon stretches" blank A3-judge.md describes. Confirmed this file is
  byte-identical before/after (§9) — the blank is present, unchanged, in this unit's own re-shoot.

## 9. F1 addendum (coordinator mid-unit instruction)

Read `A3-judge.md` §3 ("Are the white bands the user sees the pen-unreachable regions? — NO") and
its closing amended brief, and `A3-review.md`'s evidence regex. The judge routes F1 (torus
ribbon-law white bands) to W-26 as a *placement* question — "the blank the eye actually sees on
the torus is between ribbon stretches ... a placement question that belongs to W-26 (continuous
placement)."

**Structural check first:** the five reopened laws (`interlockWeave`, `onePenDown`,
`trochoidLoop`, `ampSpacing`, `weaveDepth`) are implemented in this same file's `WV_*`
ribbon/wave-law machinery (`ribbonize`, `isWaveLaw()`), a placement path entirely disjoint from
`isEvenLadder()`'s `TONE_ALGO` gate — `TONE_ALGO` is never simultaneously one of the ladder family
and one of the five ribbon laws, and the brief's own allowed Touch ranges for this unit never
reach the `WV_*` code. So on structural grounds alone, W-26 should not move these cells at all.

**Verified empirically, not just argued from code.** Checked the shots/B corruption signature
first (§8, clean). Re-shot all 10 named `torus__hatch__{5 laws}__{med,max}__a` cells: **all 10 are
byte-for-byte md5-identical** before (existing `shots/B`) vs after (`after/W-26/shots/B`) — see
`report.json`'s `byte_identical_pairs`/`gh1_identical_exceptions`.

Also ran the actual A3 split oracle, not just the pixels. `tests/helpers/scene3d-ring-coverage.js`
does not exist on `fill-audit-a` in the A3-amended form (only on `handoff-c`, per
`docs/3d-audit/lane-reports/A3-judge.md`'s binding brief) — **copied it into scratch, per
instruction, never into the worktree**
(`/private/tmp/.../scratchpad/f1-oracle/scene3d-ring-coverage.js`). Wrote a standalone
measurement script (`measure.js`, same location) reproducing the exact torus/hatch rig from
`tests/unit/scene3d-ribbon-f1b-streaks.test.js` (torus primitive, default 3/4 camera,
`style.params.toneLaw` = each of the 5 laws, `captureClipGroups` + `captureSelfOcclusionFootprint`
+ `measureRingFillRate`). Ran it against **two trees**: a clean scratch export of `9fa159f0`
(node_modules symlinked to main) and this unit's own final HEAD (`3c88605f`). Output:

```
diff before.json after.json  →  IDENTICAL (byte-for-byte)
```

| law | ringNotInkMm2 | ringNotInkReachableMm2 | ringUnreachableMm2 | clusterCount |
|---|---|---|---|---|
| interlockWeave | 2.01375 | 0.140625 | 1.873125 | 146 |
| onePenDown | 2.0025 | 0.050625 | 1.951875 | 143 |
| trochoidLoop | 1.490625 | 0.174375 | 1.31625 | 139 |
| ampSpacing | 1.2375 | 0.028125 | 1.209375 | 183 |
| weaveDepth | 0.871875 | 0.005625 | 0.86625 | 136 |

These numbers also match the historical `d5af9e30` baseline cited in
`scene3d-ribbon-f1b-streaks.test.js`'s own docstring (2.01/2.00/1.49/1.24/0.87 mm² respectively),
independent confirmation this is the same, long-standing mechanism, not a fresh regression.

**F1's status: UNCHANGED by W-26** — not improved, not worsened. Consistent with the judge's own
finding that the ring-coverage oracle's denominator is the ribbon polygon itself, so the
between-stretch blank (which sits *outside* any single ribbon polygon) was never something this
oracle — or, mechanically, this unit's fix — could touch. Closing F1 for real needs a unit that
touches the `WV_*` ribbon placement/spacing logic directly (how far apart consecutive ribbon
*stretches* land), which is out of this unit's brief and out of its allowed Touch ranges.

## 10. Commit

One final, non-WIP commit on top of `4ea8caed` (the two WIP commits were **not** rewritten):
`3c88605f`, `src/core/scene3d/surface-fill.js` only (+31/-1), full before/after numbers and every
re-pin justification in the commit body (guard-by-guard, the ink deltas, and the F1 addendum
table). `docs/3d-audit/fill-audit/after/W-26/report.json` written with the `after` array pointing
at `after/W-26/...` (no `shots/` leakage), `gh1_identical_exceptions` for all 12 confirmed-identical
cells with real reasons, and the measured tables above.

## Open follow-ups (also in `report.json`)

1. Ink deltas on 3 of 6 re-shot cells exceed the brief's informal ±15% bound — argued above as
   correct, not fudged; flagged for reviewer judgment.
2. `capsule`'s Density-1==Density-50 tie on all four mappers pre-fix is a separate, pre-existing
   defect (W-01 M2 residual) this unit did not set out to fix; noted, not verified further.
3. F1 (torus ribbon between-stretch blanks) stays OPEN, confirmed unchanged by this unit.
4. `angleFamily`'s own `steps * len` keeps its pre-existing fillFidelity coupling — untouched, no
   test exercises it, left for whoever next touches `emitContFamily`.

---

# Iteration-2 follow-ups (from `W-26-review.md`, ACCEPT-WITH-FOLLOWUPS)

Addressed below, foreground only, **no source changes** in this pass (only `surface-fill.js`
from §6 above, already committed at `3c88605f`, was touched this unit; everything below is
evidence, docs, and this report). Read `docs/3d-audit/lane-reports/W-26-review.md` in full first.

## Capsule-cap evidence

The review's item 2 ("Capsule cap-region tone-ordering evidence is weak") and the orchestrator-
ruling section named no single literal filename — the review's own recommendation was "a dedicated
capsule-cap gradient check would strengthen this." The existing re-shoot list already had
`capsule__contour__ladder__{low,med}__a`; the one cell in that same roster that was **not yet
re-shot**, and that gives the cap region the most resolution to look at (most rings, per Density),
is the **max** tier. Captured it the same way as every other cell:

```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a --port 8475 \
  --only '^capsule__contour__ladder__max__a$' --out docs/3d-audit/fill-audit/after/W-26
```

Appended cleanly to the existing `after/W-26/manifest.A.1-1.jsonl` (verified: 10 rows after, the 9
from iteration 2's own capture plus this one — nothing clobbered). `before` =
`shots/A/capsule__contour__ladder__max__a.webp` (already existed in the pre-fix gallery, md5
`8c0cef6e2191fbfea43f4f7047f3b685`, pathCount 142, inkMm 2327.4); `after` = `after/W-26/shots/A/
capsule__contour__ladder__max__a.webp` (md5 `8ad34b846ee7fd7134f3fde98064009c`, DIFFERS as
expected, pathCount 157, inkMm 2867.5, **+23.2% ink, +10.6% paths**). Both added to `report.json`'s
`before`/`after` arrays.

**Looked at both images directly.** Qualitatively: both before and after show the polar dome as a
tight nest of concentric ellipses converging on the pole marker dot, gradually spacing out toward
the shoulder (cap-to-barrel transition, silhouette-measured at y≈181-191px in both — confirming
the object geometry itself is identical and only the fill lines differ). This dome-region gradient
looks smooth and monotonic in BOTH images at a glance — consistent with the reviewer's own
hypothesis that the cap (a real, varying-coverage gradient per the Step-0 dump: 0.85 near the pole,
descending to the 0.7043 barrel plateau) was never as visibly broken as the barrel's flat-field
1×/2× alternation, because varying coverage naturally produces varying kept-index gaps even under
the OLD discrete mechanism. The dramatic, unambiguous visual win (paired-ring banding → perfectly
even spacing) stays confined to the barrel below the shoulder in both images, exactly as before.

**Quantified it too, honestly, not just eyeballed** (Python/PIL, `/private/tmp/.../scratchpad`):
scanned the vertical center column of each image, found contiguous white-pixel runs above the
measured shoulder y (185px), took each run's midpoint as a ring crossing, and computed consecutive
gaps — the same drawn-gap methodology the R1a test uses, applied by hand to the cap region alone
(caveat below).

| | before | after (incl. 1 pole-adjacent gap) | after (excl. that 1 gap) |
|---|---|---|---|
| cap ring crossings (pole dot excluded) | 10 | 16 | 15 |
| gap mean (px) | 15.15 | 9.59 | 8.83 |
| gap std-dev (px) | 2.50 | 3.37 | 1.70 |
| coefficient of variation | 0.165 | 0.352 | **0.192** |
| max/min gap ratio | 2.00 | 3.50 | **1.75** |

Excluding a single pole-adjacent gap in the AFTER image (21px, vs. its neighbours' 9-10.5px — the
gap immediately between the first and second real ring after the pole marker), the after-fix cap
region's gap regularity (CV 0.192, ratio 1.75) is **comparable to, marginally tighter than**, the
before-fix cap (CV 0.165, ratio 2.00) — not the dramatic win the barrel shows, but not a
regression either. Including that one outlier gap, the after ratio (3.50) reads worse than before
— I am disclosing this rather than only reporting the flattering exclusion. My best explanation,
not proven: this sits immediately next to the pole, a genuine chart singularity where
`emitContFamily`'s own `dfMax` step ceiling (surface-fill.js, "the step ceiling is six nominal
spacings, and it had to come down" — cited in the plan brief itself as the exact place a
converging family's walk can take an oversized step) is most likely to bind; it is a **single,
bounded, pole-adjacent occurrence**, not a repeating pattern through the cap, and the *rest* of
the cap's 14-15 gaps (9.0-10.5px) are tighter and more consistent than the before-fix cap's 9
gaps (13-18px). More rings are now placed in the cap overall (15-16 vs. 10), consistent with the
capsule density-response side-effect noted in the review and in §7/§9 of this report.

**Caveat on the method, stated plainly, not hidden:** this is a single vertical pixel-column scan
of a rendered PNG, not a re-implementation of the R1a oracle's chart-space sampling — it is
subject to projection/foreshortening distortion near a pole in a 3/4-view camera, exactly the
region under discussion, so a single scanline's gap sizes are not a rigorous substitute for
sampling `chartFor`/`sampleAt` directly the way the actual unit test does for the barrel case. I
am reporting it as an additional, honest data point that **narrows but does not close** the
reviewer's named verification gap: the cap gradient reads as preserved and, once the one
pole-adjacent outlier is set aside, no less regular than before — but this does not rise to the
same "measured, not assumed" standard §1-§13 of the review achieved for the uniform-field barrel
case. A proper close would sample the chart directly in parameter space near the pole, the way
`scene3d-ladder-uniform-field-spacing.test.js` does for cone/cylinder — out of scope for a
foreground, no-source-change follow-up pass.

## Docs lines

**CHANGELOG.md** (`## Unreleased` → `### Fixed`, new bullet added at the top of that list, in
MAIN's checkout — not committed, per the same convention this unit already followed for
`report.json`/evidence, since main's tree currently carries substantial unrelated uncommitted WIP
from other concurrent lanes and I was not asked to commit in main):

> **3D Scene: Ladder/Fine Ladder/contour and spiral fills no longer skip every other ruling on a
> flat-toned surface (a cone, a cylinder, a capsule barrel), which drew a visible doubled-width gap
> with no shading behind it.** Per the rule "ladder, fine ladder, and contour must not have
> irregular gaps unless they're required to create a perceptual gradient of light and shadow",
> these fills now place each ruling continuously instead of dropping alternating candidates from a
> fixed grid. Where this removes a previously-dropped ruling, the drawing carries a LITTLE more
> ink than before at the same Density/Fidelity setting — that increase is intentional (it is the
> gap being filled in, not new darkness added), not a regression.

**README / in-app help / shortcut list:** no UI text changed. Confirmed by diffing the whole unit
range: `git diff --stat 9fa159f0 3c88605f` touches only `src/core/scene3d/surface-fill.js` and
`tests/unit/*` — zero files under `src/ui/`, `src/config/` (which is where user-facing copy and
help text live), or any `*.md` outside this audit's own docs tree. No new/renamed/removed control,
label, tooltip, or keyboard shortcut resulted from this unit — `fillFidelity`, `toneLaw`, `ladder`
etc. are all pre-existing names, unchanged. So there is no README/help-guide edit owed here beyond
the CHANGELOG line above.

## Bars changed

One test bar changed value (not just a fingerprint re-pin) as a direct, disclosed, and-argued
consequence of the placement mechanism change — found in implementer 1's own diff
(`tests/unit/scene3d-fill-span-verdict.test.js`) and re-verified by me this iteration
(`git diff 9fa159f0 3c88605f -- tests/unit/scene3d-fill-span-verdict.test.js`), not newly
discovered:

**`inkRamp` contour bar: 1.8 → 1.3** (the `hatch` bar, 1.2, is unchanged). This test asserts the
last-band/first-band ink ratio (light-to-dark ramp strength) must exceed a bar, on the SAME fixture
in both cases — a floor, not a fingerprint, so a bar *lowering* is a real claim that the ramp got
weaker, and has to be justified on its own terms, not waved through as a re-pin.

**Mechanism (from the diff's own load-bearing comment, independently checked, not just copied):**
`emitContFamily`'s walk samples each candidate ruling's coverage via `probe()`'s AREA-WEIGHTED MEAN
intensity along the ruling's own visible arc — confirmed to be the SAME quantity
(`litSpanFloor`'s own comment: "the span's representative coverage is the MEAN over its own
samples") the discrete span verdict already used, so the TONE TARGET at any one point is
unchanged (this is the same "tone unchanged, only placement moves" invariant items 6/13 of the
review confirm elsewhere). What differs is SAMPLING RESOLUTION near a chart pole specifically: the
old discrete grid evaluated a FIXED number of uniformly-spaced candidate rings regardless of local
tone, so it always found whatever narrow, foreshortened band right at the pole happened to read
brightest; the continuous walk's own step size GROWS as the target coverage drops (sparser tone →
bigger steps), so it samples most coarsely exactly where a pole's foreshortening could produce a
brightness spike — and can step past that spike rather than land on it. Measured on the exact
fixture this test drives: old ramp ratio 2.08× (re-derived directly against a fresh git-archive of
base sha `9fa159f0` — NOT the stale 2.27× the comment's own first paragraph names from an earlier,
different round) → new 1.35×, both re-confirmed against the bar (1.3) with headroom.

**A narrower fix was tried and rejected, on the record, not silently dropped:** shrinking
`emitContFamily`'s own `dfMax` step ceiling specifically for `isEvenLadder()` narrows the pole gap
(1.45× at dfMax/3, 1.66× at dfMax/6) but **breaks** the adjacent RAMP-not-STEP assertion on `hatch`
at dfMax/6 (a real, measured trade-off, not a free win) — reverted rather than trade one measured
regression for another. `hatch`'s own bar (1.2) is unaffected by any of this and still measures
higher than it did before the fix.

**Why I am not reopening or re-tightening this bar in this pass:** the review's own verdict
(ACCEPT-WITH-FOLLOWUPS, item 3) already classified this as "disclosed, argued, not blocking," and
the coordinator's instruction for this pass was explicitly to explain the bar change, not to
re-derive a fix for the pole-sampling side effect — doing that would mean editing
`emitContFamily`'s walk beyond the pitch-source line this lane's own Touch list allows, which is a
"no source changes" violation for a foreground-only follow-up pass. Recorded here, per the
review's item 4, as one of the two things a judge pass should specifically re-examine (the other
being the capsule-cap evidence above): a genuine, disclosed, honestly-measured trade-off — a
one-pole-region ramp-strength reduction (2.08× → 1.35×, bar 1.3) in exchange for removing the
barrel's 1×/2× drawn-gap alternation everywhere else — not a hidden or fudged number.
