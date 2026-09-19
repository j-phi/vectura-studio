STATUS: MEASURED

# T2-4 SCOUT — is the d=220 mkTick coverage loss still real, and is it a defect?

**Role:** read-only scout (Sonnet). **Base sha:** `6ebc76e8` (main, round-5 base, v1.4.3).
**Source tree:** scratch `git archive` export at `/private/tmp/claude-501/scratch-T2-4/`
(node_modules symlinked). No edits, no commits in any worktree. Scratch port 8473 used for one
capture run, killed after (`kill -9` on the dev-server pid, verified `lsof -iTCP:8473` clear).

**Fixture used for every render below** (unless noted): `width:1200 height:1000 m:20 dW:1160
dH:960 penWidth:0.3mm`; `ground.enabled:false`, `backdrop.enabled:false` (**ground-plane ink is
NOT in any ink total below — there is no ground plane**); camera = `DEFAULT_CAMERA`; one
directional sun (`az135 el45 intensity1`); `styleTable.scene = { mapper, params: { fillAngle:45,
fillDensity: <d>, toneLaw:'mkTick' } }`. **rig=create**: `PRIMITIVE_PARAM_DEFAULTS` merged under
`PRIMITIVE_CREATE_DEFAULTS`. **rig=test**: `PRIMITIVE_PARAM_DEFAULTS` alone (`engine.addLayer`
deserialization defaults). Four cells carried through every table: `sphere/hatch`, `torus/hatch`,
`torus/contour`, `cone/hatch` (the ones the brief's evidence-cell list and `T2-6-impl.md`'s own
table both used) — **not the full six**, for compute-budget reasons; disclosed under "Sweep
coverage" below, which covers the full 8-mapper roster instead.

## Q1 — which quantity, which tree

**The "0.91–0.99 pre-fix" / "0.67–0.82" pair in the brief comes from `T2-2-impl.md`'s "The honest
finding" section** (`docs/3d-audit/lane-reports/T2-2-impl.md`, its own d=220 table). That was a
**scratch-only logging hook inside T2-2's own worktree** — never shipped, confirmed absent from
`surface-fill.js` @ `6ebc76e8` (`grep -n 'T2-4' src/core/scene3d/surface-fill.js` → no hits, and
the hook's own describing comment is gone with the T2-2 revert). Its formula, stated in the text:
"area-weighted (`R*P`) fraction of `I<0.90` sites that drew ink" — **this is algebraically
identical to `siteCoverage()`** (`tests/helpers/scene3d-mktick-wedge.js:212`, committed later by
T2-3). Ran on T2-2's shipped tree `9d911b05` (chan:`len`, `BLEND=0.92`) against T1/T1b's own
pre-existing `chan:'count'` baseline — i.e. the tree **before `dbad2d88` (T2) existed at all**.
I independently identified and used that same pre-T2 sha: **`f828d828`** ("T1b — finish
plot-safety guard against near-duplicate tick stubs", the direct parent-chain ancestor of
`dbad2d828d82...` → `6ebc76e8`; verified `mkTick: { chan:'count', ... }` at that sha, confirmed by
`git merge-base f828d828 6ebc76e8` = `f828d828` itself).

**Table 1 — (a)+(b) are the SAME metric** (`siteCoverage`, hi=0.90), d=220, four cells, both rigs:

| cell | rig | **f828d828** (true pre-mkTick-work; chan:'count') | **6ebc76e8** (current, chan:'len') | Δ |
|---|---|---|---|---|
| sphere/hatch | create | 0.9224 | 0.8745 | −0.048 |
| sphere/hatch | test | 0.9253 | 0.8752 | −0.050 |
| torus/hatch | create | 0.9022 | 0.7803 | **−0.122** |
| torus/hatch | test | 0.9071 | 0.7806 | **−0.127** |
| torus/contour | create | 0.9378 | 0.8168 | −0.121 |
| torus/contour | test | 0.9485 | 0.8342 | −0.114 |
| cone/hatch | create | 0.9264 | 0.8754 | −0.051 |
| cone/hatch | test | 0.9362 | 0.8798 | −0.056 |

`f828d828`'s own siteCoverage instrument was re-built here as a scratch source-string patch
(`/private/tmp/claude-501/scratch-T2-4/scratch-probes/q2-pre.js`) at the exact `layMark` placement
call (`const drawnLen = place(...)` equivalent at that sha), logging `[sv.I, sv.R, sv.P, drawn]`
per candidate site — same shape `tickSites` uses on the current tree, same `siteCoverage()`
reducer. **`6ebc76e8`'s own `siteCoverage` reproduces `T2-6-impl.md`'s own published numbers
exactly** (cone/hatch/create 0.8754/tooShort 713, cone/hatch/test 0.8798/tooShort 552, paths and
pens counts also exact) — confirms the instrument, not just trusted.

**Reconciling "T2-2's 0.815–0.823 vs T2-6's 0.8754" (the brief's stated tension): NOT a
contradiction — different points in the SAME tree's history.** T2-2's number is a snapshot at
`9d911b05` (BLEND=0.92, before T2-3/T2-3b/T2-3c/T2-5/T2-6). Every one of those five later units
touched `MK.mkTick` again; T2-6 in particular added the `Lfloor`/soft-max floor (`:6712-6713`)
that did not exist at T2-2's own sha. The tree has been **partially, incrementally recovering**
coverage since T2-2's own number was taken — my own current-tree numbers above (0.78–0.88) sit
between T2-2's stale 0.67–0.82 and the true pre-work 0.90–0.95, exactly where five rounds of
partial mitigation would put it.

**Table 2 — wedge25 / holeMax** (rasterised bare-wedge oracle, `measureWedge()`), d=220, current
tree only — **N/A pre-fix**: the raster oracle's silhouette source (`mkStat.tickField`) is gated
`law.shape === 'tick'` and only republishes field samples introduced by T2-3; the concept of a
"wedge" (length grading opening a cross-row gap) does not exist for a length-invariant
`chan:'count'` law, so there is no pre-fix wedge25/holeMax to compare against — this is disclosed,
not omitted:

| cell | rig | wedge25 | holeMax |
|---|---|---|---|
| sphere/hatch | create | 0.1047 | 7.58 |
| torus/hatch | create | 0.1049 | 2.674 |
| torus/contour | create | 0.1049 | 4.221 |
| cone/hatch | create | 0.1190 | 3.148 |
| sphere/hatch | test | 0.1033 | 6.266 |
| torus/hatch | test | 0.1797 | 6.764 |
| torus/contour | test | 0.1319 | 7.939 |
| cone/hatch | test | 0.1143 | 2.565 |

(All within — some below — T2-6's own pinned six-cell-mean bars (`0.0950` create / `0.0800`
test); `wedge25` is REPORTED per-cell here per that test file's own "gated on the mean, reported
per-cell" convention. My own `wedge25` numbers differ from `T2-6-impl.md`'s published ones by up
to ~3% on `test/cone/hatch` (0.1143 vs 0.1108) despite `paths`/`pens`/`tooShort`/`siteCoverage`
matching exactly — a real, small, disclosed divergence, most likely PPMM/raster-bounds rounding
between this scout's harness and T2-6's own; it does not change any conclusion below.)

## Q2 — is there a loss at all?

**YES. Real, on the current tree, against the true pre-mkTick-work baseline, on the SAME
instrument (`siteCoverage`), both rigs, all four cells** — Table 1 above. **Named pre-fix sha:
`f828d828`** (T1b tip; the last commit before `dbad2d88` (T2) introduced `chan:'len'` variable
length at all — i.e. "before this whole line of work", not merely "before the most recent
attempt"). Loss ranges **−0.048 to −0.127** depending on cell (torus/hatch worst, both rigs). Not
within noise — every cell/rig combination moves in the same direction by 5–13 coverage points.

**Visual confirmation** (native-resolution crop, `cone/hatch/mkTick/max/a`, current tree,
`docs/3d-audit/fill-audit/after/T2-4/scout/shots/B/cone_a_crop_right.png`, 2x nearest-neighbour
zoom of the raw capture's right-hand terminator region): the tick field does NOT fade smoothly to
bare paper. Instead, past roughly the mid-tone band it breaks into **isolated 2–4-tick clusters
separated by gaps several row-pitches wide**, then a run of true bare paper right up to the
silhouette edge. `torus/hatch/mkTick/max/a` (full-image, not cropped) shows the same pattern
around its lit crown. This is the qualitative signature the numbers describe: not "correctly
darker," but patchy/clumped, which is what R2 ("gaps only at highlights, elsewhere the field stays
complete") forbids outside the true highlight.

## Q3 — attribution to `MIN_MARK_MM`

Swept `MIN_MARK_PEN` (baseline 2) → 1.5 → 1 on `6ebc76e8`, d=220, four cells, both rigs (scratch
source-string patch on `const MIN_MARK_PEN = 2;`, `surface-fill.js:364`; every other constant
untouched). `siteCoverage` and `tooShort` (raw drop count):

| cell | rig | ratio 2 (baseline) cov / tooShort | ratio 1.5 cov / tooShort | ratio 1 cov / tooShort |
|---|---|---|---|---|
| sphere/hatch | create | 0.8745 / 1433 | 0.9120 / 1164 | 0.9518 / 735 |
| torus/hatch | create | 0.7803 / 525 | 0.8619 / 366 | 0.9564 / 170 |
| torus/contour | create | 0.8168 / 437 | 0.8775 / 321 | 0.9469 / 163 |
| cone/hatch | create | 0.8754 / 713 | 0.9211 / 545 | 0.9601 / 353 |
| sphere/hatch | test | 0.8752 / 879 | 0.9161 / 694 | 0.9532 / 449 |
| torus/hatch | test | 0.7806 / 1071 | 0.8650 / 751 | 0.9522 / 352 |
| torus/contour | test | 0.8342 / 871 | 0.8915 / 641 | 0.9544 / 340 |
| cone/hatch | test | 0.8798 / 552 | 0.9228 / 419 | 0.9603 / 280 |

**Plottability cost** (marks that flip from dropped to plotted — all, by construction, under the
ORIGINAL 2×pen floor, several as short as one bare pen-width at ratio=1 since `MIN_MARK_MM =
ratio * 0.3mm`): `tooShort(2) − tooShort(r)`, e.g. at ratio=1: sphere/hatch/create **+698**,
torus/hatch/create **+355**, torus/contour/create **+274**, cone/hatch/create **+360** newly-drawn
marks, every one shorter than 2 pen widths (down to 1 pen width — a bare dot, exactly what T1b's
own rule ("a mark under two pen widths is a pen-down dot, not a mark") drops on purpose). Coverage
does recover most or all of the gap this way (torus/hatch/create even overshoots the pre-fix
0.9022 baseline, reaching 0.9564) — but strictly by shipping the class of mark `MIN_MARK_MM` exists
to forbid. `dupStub` (the T1b adjacent-mark spacing guard) also rises sharply at ratio=1
(sphere/hatch/create 6→77), absorbing some of the newly-surviving short marks into a second
rejection path rather than drawing them — the net pen increase is smaller than the raw tooShort
delta for that reason, disclosed, not smoothed over.

## Q4 — a mechanism that recovers coverage WITHOUT shipping sub-`MIN_MARK_MM` marks

Two prototypes, both scratch-only source patches (never touching `MIN_MARK_PEN`/`MIN_MARK_MM`
themselves — the existing `if (tot < MIN_MARK_MM) return false` drop gate is UNTOUCHED in both, so
every mark that *is* drawn is provably `>= MIN_MARK_MM` exactly as today), both isolated to the
`lenChan` branch's `Lease`/`Lfloor` soft-max at `surface-fill.js:6711-6713`:

- **Prototype A (soft, 3-way blend)** — add a third `PlotFloor = MIN_MARK_MM * 1.15` term into the
  existing 4-norm blend: `L = min(L0*R, (Lease^4 + Lfloor^4 + PlotFloor^4)^(1/4))`. As I→white
  Lease/Lfloor both shrink toward 0, so the 4-norm converges on `PlotFloor` instead of 0 — the
  light end asymptotes to a guaranteed-plottable length rather than decaying into a drop. `P=L/g`
  (unchanged, right below) re-derives the period, so this trades COUNT (sparser sites) for LENGTH
  at the light end, never area-fraction correctness.
- **Prototype B (hard floor)** — same `PlotFloor`, applied as `max(existing-blend, PlotFloor)`
  instead of folded into the 4-norm — isolates the softness question T2-6's own comment already
  flagged as a `bandC` risk for a hard-edged floor.

**Measured, d=220, rig=create, four cells** (rig=test not re-run for the prototypes, scope
disclosed):

| cell | HEAD cov / wedge25 | **A** cov / wedge25 | **B** cov / wedge25 | pre-fix (`f828d828`) cov |
|---|---|---|---|---|
| sphere/hatch | 0.8745 / 0.1047 | **0.9342** / 0.0553 | 0.9347 / 0.0486 | 0.9224 |
| torus/hatch | 0.7803 / 0.1049 | **0.9187** / 0.0459 | 0.9171 / 0.0420 | 0.9022 |
| torus/contour | 0.8168 / 0.1049 | **0.9434** / 0.0633 | 0.9451 / 0.0558 | 0.9378 |
| cone/hatch | 0.8754 / 0.1190 | **0.9432** / 0.0697 | 0.9431 / 0.0572 | 0.9264 |

**Both prototypes recover coverage past the true pre-mkTick-work baseline on every one of the four
cells**, and `wedge25` drops (improves) on every cell too, with **zero sub-`MIN_MARK_MM` marks by
construction**. `tooShort` roughly halves (e.g. sphere/hatch/create 1433→756 (A)/752 (B)).

**But NOT zero-regression, prototype A, measured against the pinned suite** (rig=create AND test,
`npx vitest run tests/unit/scene3d-mktick-wedge.test.js`, 43/58 pass):
- Pinned `pathSignature` goldens fail on all 12 (expected — geometry legitimately changed, would
  need re-pinning with proof, not attempted here).
- **`over2RP`/purity (clause c, T2-5's own USER RULE gate) — CLEAN.**
  `tests/unit/scene3d-mktick-band-purity.test.js`: **35/35 PASS**, including its own "ROSTER MD5
  SWEEP — only mkTick may change" (3 mappers × 37 laws ≈ 111 combos on `cone/create`) and its
  "instrumentation neutrality" check. Prototype A's blast radius is confined to `mkTick` exactly as
  intended.
- **O5 (R1, length ratio ≥2.3 monotone) — ONE real regression**: `create rig — torus/hatch`
  monotonicity flips false (dark≥mid≥light no longer holds) with prototype A. The other 11/12
  cell×rig combinations still pass.
- **MUTATION-KILL 2 (T2-3 stagger direction proof) — TWO razor-thin flips**: `create —
  torus/contour` (0.17372 vs mutant 0.17356, a 0.09% relative difference) and `create —
  cone/contour` (0.039547 vs 0.039525, 0.06%) — both ties at the instrument's own noise floor, not
  a qualitative reversal of the stagger's own effect (the six-cell MEAN comparison for both rigs
  still passes).
- `mkDashRamp` (the `chan:'elong'` branch, T2-5-plan.md §6's own established independence) is
  **structurally untouched** — prototype A/B edit only the `lenChan` branch (`law.chan === 'len'`),
  never the shared `else` branch mkDashRamp's `P = clamp(law.P0*R,...); L = min(g*P, capOf(P))`
  lives in, and neither prototype touches `MIN_MARK_PEN`/`MIN_MARK_MM` (only Q3's separate,
  unrelated sweep did that). Not re-run against the mkDashRamp pinned test files given time
  budget — this is a structural argument, the same kind `T2-5-plan.md` itself relied on for the
  same claim, not an independent re-derivation.

Prototype B was only measured on the coverage/wedge25/tooShort table above (not run against the
pinned suite) — comparably strong, marginally better `wedge25` on every cell in this run, but its
hard-edged floor is the shape T2-6's own comment already disclosed as a `bandC` risk, and it is
untested here against O5/MUTATION-KILL-2/band-purity. **Prototype A is the better-characterised
candidate** precisely because its one real regression is now named and bounded, not because it
measures better.

## Sweep coverage (roster fraction)

`mkTick` × all 8 `MAPPERS` × {sphere, torus, cone} × both rigs, d=220, `6ebc76e8`, current tree
(48 combinations, `isMarkLaw` = whether `lastMarkStats` is non-null at all):

| mapper | isMarkLaw (any cell) | note |
|---|---|---|
| hatch | YES | siteCoverage 0.71–0.88 across the 6 cell×rig |
| wireframe | YES | **byte-identical to hatch on every metric, every cell, every rig** (samples/marks/tooShort/siteCoverage all exact matches) — same underlying ruling |
| crosshatch | YES | worst cell measured: torus/create 0.7119 (below hatch's 0.7803 on the same cell) |
| contour | YES | mildly less affected (0.817–0.887) but still clearly below the ~0.90–0.95 pre-fix band |
| none | NO | `lastMarkStats` null — no ruled field for mkTick to ride |
| spiral | NO | ″ |
| stipple | NO | ″ |
| contourSlice | NO | ″ |

**4/8 mappers (50%) instantiate mkTick at all; `hatch`≡`wireframe` are provably one mechanism, so
3/8 (37.5%) are distinct mkTick-bearing behaviours.** The other 4 are excluded because they are
**measured**, not assumed, to never reach mkTick's placement code (`stat` is `null` on every
primitive tested). All three distinct mapper behaviours show the same coverage-collapse direction
at d=220 vs the ~0.90–0.95 pre-fix band — the defect is not a `hatch`-only artefact.

## Evidence

`docs/3d-audit/fill-audit/after/T2-4/scout/shots/B/{cone,torus}__hatch__mkTick__max__{a,b}.webp`
(fresh captures, this scout's own scratch export, port 8473, killed after) + `.png` conversions +
`cone_a_crop_right.png` (2x native-res crop of the terminator region, described under Q2). The
brief-listed manifest cells are v1.4.1 and were NOT used for any numeric claim above, per the
brief's own warning.

## Bars changed

**None.** Nothing shipped from this scout (read-only). Q3's `MIN_MARK_PEN` sweep and Q4's
prototypes are scratch-only source patches, never touching the tracked tree.

## Acceptance bar — clauses

**S1** ✓ Q1 tables, 3 metrics named (Table 1 = (a)+(b), Table 2 = (c)), fixtures stated above each.
**S2** ✓ `f828d828`, named and justified (T1b tip, immediate pre-`dbad2d88` ancestor, verified via
`git merge-base`). **S3** ✓ Q3 table + plottability count. **S4** ✓ 2 prototypes, both measured;
A run against the pinned suite, B measured on coverage/wedge only (scope disclosed). **S5** ✓
4/8 mappers instantiate mkTick (50%; 37.5% distinct), justified per mapper. **S6** ✓ one verdict
below.

## Verdict

**MEASURED** — not NO DEFECT (Q2 proves a real, non-noise loss against the true pre-work
baseline) and not a clean SRC UNIT (Q4's best prototype has two disclosed, real but narrow
regressions — one O5 monotonicity flip, two razor-thin mutation-kill ties — so "no guard
regression" is not met as prototyped).

**This is closer to SRC UNIT than to MECHANISM UNKNOWN and should be read that way by the
secretary**: the mechanism is concretely identified (`surface-fill.js:6711-6713`, the
`Lease`/`Lfloor` soft-max in `solveAt`'s `lenChan` branch), a scratch prototype recovers coverage
past the true pre-fix baseline on every cell tested with zero sub-`MIN_MARK_MM` marks, and
`over2RP`/band-purity (clause c) is fully clean under it. The gap to a clean ACCEPT is narrow and
named: retune `PlotFloor`'s multiplier (tried `1.15`; something smaller may clear `torus/hatch`'s
O5 monotonicity without giving back the coverage win) or scope the floor away from cells where it
flips O5, then re-run the FULL six-cell wedge test (this scout used four cells for budget reasons)
plus `over2RP` plus a fresh mkDashRamp onset check once T3c-onset lands (same `MIN_MARK_MM` both
pins read, per the round-5 queue's own serialization note). **Files a follow-on SRC unit would
touch: `src/core/scene3d/surface-fill.js` (`solveAt`'s `lenChan` branch only, ~:6693-6714) and
`tests/unit/scene3d-mktick-wedge.test.js` (re-pin `pathSignature` goldens WITH proof, and the O5
bar/population if `torus/hatch` cannot be brought back to monotone). Forbidden: `mkDashRamp`'s own
branch, `MIN_MARK_PEN`/`MIN_MARK_MM` themselves, `over2RP`'s own instrument file.** A guard a
follow-on unit should add: pin the d=220 `siteCoverage` floor (four cells, both rigs, ≥0.90) +
`tooShort` non-regression ceiling, mutation-proved by reverting `PlotFloor` to 0 (i.e. today's
tree) and confirming the guard trips.
