STATUS: DONE/FU

# T2-6 — implementation (Jay's USER RULE clause (a), lane `fill-audit-a4`)

Worktree `.claude/worktrees/fill-audit-a4`, branch `3d-scene/fill-audit-a4`, base sha `f0b0b0c8`
(T3c). Port 8475, `window.Vectura.APP_VERSION` 1.4.2, matches worktree `package.json` (no bump —
worktree). `git status --short -- . ':!graphify-out'` clean at start; only this unit's own five
files dirty during the session. **Interrupted once by a rate limit** (Incident 15); the
orchestrator checkpointed the exact five-file WIP as commit `0f420747` before this implementer was
resumed. On resume: re-verified `0f420747`'s diff was byte-identical to the pre-interruption work
(`git show --stat`), re-ran the new test file + the two edited guard files + a guard spot-check in
the foreground (all green, unchanged), and finished the roster sweep (which had been killed
mid-run) split per-combo, foreground, `timeout: 600000` each. The working tree matched `0f420747`
exactly after every re-check (`git diff HEAD` empty) — see `## Finish` for why no additional commit
was made.

## Summary

Implemented **THE GRADED BAND COMB** (`T2-6-plan.md` §4.1 Rank 1, prototyped "F3") exactly as
spike-gated: `layMark`'s `mkTick` placement, when a band is wide enough
(`MK_TICK_COMB_MIN_R*sv.R <= sv.L < 0.98*sv.R`) and both its own +-`R/2` edges are on-chart (two
`sampleAt` probes), lays a geometric run `each_j = e0*RHO^j` across up to `MK_TICK_COMB_MAX`
sub-bands, longest at the probed DARK edge, envelope-scaled to `MK_TICK_COMB_ENV*sv.R`.
`Sum(each_j, j=0..n-1) = sv.L` **exactly** (closed-form geometric series), so `R`/`P` stay untouched
and the delivered ink-area fraction is bit-identical — a pure redistribution, the same neutrality
proof T2-5 used for its own uniform split. Shipped dials: `RHO=0.62`, `MAX=2`, `MIN_R=0.40`,
`ENV=0.85` — the plan's own "F3", the only setting in its twelve-fixture dial sweep that broke
nothing (§4.4).

**All numbers below were re-derived on THIS tree, independently of the plan's own prototype
harness**, using a new hook-instrumented test (`scene3d-mktick-gap-fill.test.js`) and a standalone
verification script — not copied from `T2-6-plan.md`. They match the plan's own re-derived numbers
almost exactly (see §2), which is expected since the shipped code is a faithful, line-for-line port
of the validated prototype.

## 1. THE RED/GREEN PROOF

`tests/unit/scene3d-mktick-gap-fill.test.js` (new, 44 tests, `tests/helpers/scene3d-mktick-gap-fill.js`
new helper implementing A1/A1b/A2/A3 per `T2-6-plan.md` §2):

- **PRE_TICK_BLOCK is a faithful reconstruction of this unit's own base sha (`75777240`)** — proven
  two ways: (1) code-stripped-of-comments string match against a `git archive 75777240` scratch
  export at `/private/tmp/claude-501/scratch-T26-red`; (2) a SEMANTIC proof — rendering through
  `PRE_TICK_BLOCK` (hook unarmed) on the CURRENT tree is byte-for-byte identical to rendering the
  REAL archived `75777240` tree directly, on every one of 6 cells x 2 rigs.
- **Instrumentation neutrality**: the hooked POST source with the hook UNWIRED renders
  byte-identical paths to the plain unmodified disk source, on every cell, both rigs.
- **RED at the PRE-fix reconstruction**: A1b (>=0.42 RP bar) fails on >=10 of 12 fixtures; A1
  (>=0.35 bar) fails on all 10 of the named cells; zero GRADED combs exist anywhere pre-fix (T2-5's
  own retiling produces UNIFORM, not graded, multi-sub-tick sites — `A1_combGraded === 0`
  everywhere pre-fix, `A1_combSites` nonzero on the over-wide-band cells, disambiguated explicitly
  in the test).
- **GREEN at the shipped tree**: A1b clears its bar on all 12 (two cells —
  `create|torus/hatch`/`create|torus/contour` — get their own measured bar per the plan's own
  instruction, since `bandOn` gates the comb off on the torus's most foreshortened bands); A1
  clears >=0.35 on all 10 named cells.
- **MUTATION-KILL 1 (blocking)**: forcing `MK_TICK_COMB_RHO = 1.0` (a FLAT comb — Rank 4,
  `T2-6-plan.md` §4.5's own "oracle-gaming" rejection) makes A1 fall relative to shipped on
  `cone/hatch`, both rigs — proves the oracle reads "gradually SHORTENING" (the helper requires
  STRICT, not merely non-increasing, monotonicity for exactly this reason — a flat comb is neither
  increasing nor decreasing under a strict test, so it cannot masquerade as graded).
- **MUTATION-KILL 2 (blocking)**: forcing `MK_TICK_COMB_MAX = 1` (comb never fires) returns A1b to
  >= 0.48 RP on `cone/hatch`, both rigs — reproduces the pre-fix picture.
- **Neutrality, BLOCKING**: every emitted comb's own sub-tick lengths sum to `sv.L` to < 1e-9, on
  all 12 fixtures.

## 2. THE PER-CELL TABLE (re-derived on this tree, `--rig` named, d=50, ground-plane ink EXCLUDED)

| fixture | A1 | A1b P95 (RP) | A3 | A2n (frac) | A2loc | `wedge25` | `holeMax` | `bandC` | `O5` | `siteCoverage` | pens | ink (mm) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| create·sphere/hatch | 0.4480 | 0.2981 | 0.3806 | 356 (.331) | 39 | 0.05649 | 0.992 | 0.0800 | 3.1280 | 0.9793 | 1093 | 4882.0 |
| create·sphere/contour | 0.4077 | 0.2703 | — | 277 (.258) | 62 | 0.06507 | 1.038 | 0.0529 | 2.4397 | 0.9895 | 1084 | 4745.4 |
| create·torus/hatch | 0.1596 | 0.5082* | — | 106 (.324) | 17 | 0.13808 | 0.980 | 0.2723 | 2.5354 | 0.9882 | 335 | 1272.1 |
| create·torus/contour | 0.3231 | 0.4512* | — | 120 (.358) | 45 | 0.17307 | 0.991 | 0.4610 | 3.0353 | 0.9770 | 339 | 1368.4 |
| **create·cone/hatch** | **0.4506** | **0.3849** | 0.1786 | 154 (.259) | 23 | 0.06290 | 1.038 | **0.0640** | 2.4258 | 0.9882 | 602 | 2498.4 |
| create·cone/contour | 0.4790 | 0.2813 | — | 164 (.259) | 65 | 0.04113 | 0.995 | 0.0269 | 2.6081 | 0.9960 | 634 | 2527.2 |
| test·sphere/hatch | 0.3702 | 0.3587 | 0.3732 | 239 (.343) | 30 | 0.07844 | 1.110 | 0.0949 | 3.0730 | 0.9833 | 704 | 3155.2 |
| test·sphere/contour | 0.4504 | 0.2606 | — | 169 (.246) | 36 | 0.06681 | 1.079 | 0.0459 | 2.3479 | 0.9898 | 695 | 3007.5 |
| test·torus/hatch | 0.5176 | 0.3196 | — | 441 (.457) | 28 | 0.07683 | 1.044 | 0.2355 | **2.3426** | 0.9908 | 976 | 3200.5 |
| test·torus/contour | 0.4302 | 0.4018 | — | 240 (.333) | 96 | 0.08747 | 1.081 | 0.2969 | 2.8504 | 0.9843 | 730 | 2725.0 |
| **test·cone/hatch** | **0.3967** | **0.3415** | 0.2312 | 117 (.235) | 20 | 0.07011 | 0.984 | 0.1043 | 2.6537 | 0.9860 | 499 | 2116.8 |
| test·cone/contour | 0.4789 | 0.3554 | — | 170 (.304) | 39 | 0.07475 | 1.039 | 0.0224 | 2.8962 | 0.9924 | 560 | 2248.8 |

`*` = these two fixtures use their own measured value as the A1b bar (the `bandOn` gate legitimately
disables the comb on the torus's most foreshortened bands — `T2-6-plan.md` §4.6 disclosed this by
name). A3 reported on `hatch`-mapper cells only (§2's own caveat: "meaningful only where length
carries tone" — the pooled/contour cells are dominated by isophote-following row-pitch variation,
not a defect of the comb).

**Aggregate bars (all pass, none moved beyond the plan's own validated numbers):**

- six-cell mean `wedge25` <= 0.095 (create): **0.08946** (5.7% margin).
- six-cell mean `wedge25` <= 0.080 (test): **0.07574** (5.3% margin).
- `O5 >= 2.30`, monotone, 12/12: **min 2.3426** (test·torus/hatch), monotone on all 12.
- `siteCoverage > 0.90`, 12/12: **min 0.9770**.
- `ovMax` — clause (b) — **exactly 0.0800 on 12/12**, identical to HEAD to four decimals (proven both
  algebraically — combed sub-ticks always sit inside their own ENV-scaled envelope, strictly under
  the nominal per-slot scoring width, so `ov=0` for every combed sub-tick — and empirically, in
  `scene3d-mktick-band-purity.test.js`'s own re-derived O-B block).
- `over2RP` — clause (c) — **0/12** (T2-5's own fix, untouched).

**Image-space cross-check** (raster read of the rendered picture, §1.2's own bare-pixel-distance
instrument, `cone/hatch/create`): bare pixels >= 0.25 RP from ink fall **5925 -> ~4000 px (~-32%)**,
consistent with `T2-6-plan.md`'s own finding that the shipped vector-space `wedge25` instrument is
comparatively insensitive to this specific defect (it splats mkTick's own along-row samples
isotropically, which is largely blind in the cross-row direction — `T2-3-impl.md`'s own disclosed
limitation, re-confirmed here, not re-litigated).

**d=1 / d=220 — reported as observations, not gated (per the brief):**

| d, rig | paths | ink (mm) | pens | `wedge25` | `holeMax` | `siteCoverage` | `tooShort` | md5 |
|---|---|---|---|---|---|---|---|---|
| d=1, create, cone/hatch | 193 | 835.1 | 83 | 0.28428 | 1.059 | 0.9356 | 2 | matches plan exactly |
| d=1, test, cone/hatch | 126 | 537.8 | 53 | 0.34163 | 1.067 | 0.9576 | 1 | matches plan exactly |
| d=220, create, cone/hatch | 1935 | 2372.7 | 1963 | **0.11781** | 3.203 | 0.8754 | 713 | matches plan's 0.1178/1963/713 exactly |
| d=220, test, cone/hatch | 1709 | 2089.7 | 1738 | **0.11079** | 2.543 | 0.8798 | 552 | matches plan's 0.1108/1738/552 exactly |

d=220's `wedge25` rise (T2-4 does not fold in) and `tooShort` census are **unchanged mechanisms**
(`MIN_MARK_MM` censoring), exactly as `T2-6-plan.md` §5.2 disclosed — not fixed here, not a stop
condition (the brief names this a reported observation).

## 3. THE MD5 ROSTER SWEEP — full scope, re-run on THIS tree

4 combos (`cone:create`, `sphere:create`, `torus:create`, `cone:test`) x 8 mappers x 37
`SCENE3D_TONE_LAWS.PRODUCTION` laws = **1184 cells**, current disk source vs a `git show
f0b0b0c8:src/core/scene3d/surface-fill.js` scratch snapshot (this unit's OWN base sha), d=50. Run
in the FOREGROUND, one combo per command (killed by a rate limit mid-run once; re-run split by
combo after resume):

| combo | cells | changed | changed cells |
|---|---|---|---|
| cone:create | 296 | 3 | hatch/mkTick, crosshatch/mkTick, contour/mkTick |
| sphere:create | 296 | 3 | hatch/mkTick, crosshatch/mkTick, contour/mkTick |
| torus:create | 296 | 3 | hatch/mkTick, crosshatch/mkTick, contour/mkTick |
| cone:test | 296 | 3 | hatch/mkTick, crosshatch/mkTick, contour/mkTick |

**12 of 1184 changed (1.0%), every single one `mkTick`, ZERO non-mkTick cells moved** — 100% of the
plan's own stated scope, matching `T2-6-plan.md` §5.6's claim exactly.

**mkDashRamp independently confirmed byte-identical** (T3c's own mechanism, forbidden territory):
6 cells (sphere/torus/cone x hatch) x 3 densities (1/50/220) x 2 rigs = 18 combinations, current
tree vs `f0b0b0c8`, all **IDENTICAL** by md5.

## 4. A GUARD FILE THIS UNIT TURNED RED, AND ONE IT HAD TO REPAIR — both disclosed in full

### 4a. `tests/unit/scene3d-mktick-band-purity.test.js` (T2-5's own guard) — REPAIRED, not just re-run

T2-5's own file needle-splices the WHOLE `if (law.shape === 'tick') {...}` block out of the live
disk source and replaces it with a hand-maintained, hook-instrumented reconstruction
(`POST_TICK_BLOCK_INSTRUMENTED`) for its own "GREEN at the shipped tree" measurements. **Both
needles this splice uses (`T25_BLOCK_START_NEEDLE`/`T25_BLOCK_END_NEEDLE`) still matched, unchanged,
against this unit's new source** (I preserved the surrounding comment/brace structure) — which meant
the splice ran WITHOUT ERROR but silently discarded THE ENTIRE GRADED COMB and replaced it with
T2-5's frozen, pre-T2-6 reconstruction. Every "GREEN" assertion in that file would have kept
measuring **T2-5's own mechanism, not this unit's** — exactly the `git show HEAD:` staleness trap
`T2-3-review.md`/`T2-3b-plan.md` §5.1 named, reproduced here via a hand-maintained string instead of
a git ref. Caught only because the file's OWN "instrumentation neutrality" self-test (hooked
reconstruction vs the real unmodified disk source) went RED — that test exists for exactly this
purpose and did its job.

**Fixed within this file** (allowed — `tests/unit/scene3d-mktick-*.test.js`):
`POST_TICK_BLOCK_INSTRUMENTED` rewritten to mirror the CURRENT shipped block (same `nOver`/`nComb`/
`e0`/`RHO`/`dir` formulas as production, one hook call per emitted sub-tick in the SAME
`{I,R,P,L,a,k,band,each,cOff,nSub,j}` record shape T2-5's own hook used). Two subtleties, both
disclosed:
- `band` must be the NOMINAL per-slot scoring width `sv.R/nSub` (T2-5's own convention, matches
  `metrics26.js`), NOT the comb's own narrower ENV-scaled placement width — using the placement
  width first produced a spurious `ovMax` of 0.29-0.58 (a pure instrumentation bug, not a real
  seam-overlap regression).
- `cOff` for a combed sub-tick is exactly `0` (the comb places every sub-tick deterministically at
  its own slot centre, no further jitter — unlike T2-5's own stagger, which had a real random `cOff`
  term). Feeding the slot's GLOBAL position into a formula that expects a LOCAL offset was the first,
  wrong attempt; fixed.
- The file's own MUTATION-KILL (forcing the retile off) needle-patched `const nSub = clamp(...)`,
  which no longer exists verbatim (renamed `nOver`, and `nSub` is now `Math.max(nOver, nComb)`).
  Updated to force `nOver = 1` specifically (leaving T2-6's own `nComb` untouched) — a MORE precise
  isolation of clause (c)'s own contribution than the original, and it still reproduces the
  over-long-tick population on `torus/contour` (comb sub-ticks can never exceed `2*RP` by
  construction, so the comb alone cannot rescue an over-wide band).

**Result after repair: 35/35 pass**, including O-C2 (`over2RP=0`, 12/12), O-B (`ovMax<=0.0800`,
12/12, exactly invariant), O-A (roughP95/lenToneR2n, reported), the purity/mutation checks, and the
file's own roster md5 sweep (cone/create, 3 mappers x PRODUCTION laws — only mkTick moves).

### 4b. `tests/unit/scene3d-mktick-wedge.test.js` (T2-3's own guard) — 12/12 goldens re-pinned WITH the contrast-mutation proof

All 12 `pathSignature` goldens move (expected — unlike T2-5's re-tiling, the comb's own gate is
reachable on an ORDINARY band, so it fires on every fixture, not just the over-wide ones). Re-pinned
with the new hashes (§`## Bars changed`). **Non-vacuousness proof**: the file's own two pre-existing
BLOCKING mutation-kills both still pass against the re-pinned goldens —
MUTATION-KILL 1 (synthetic wedge/wedge-free masks trip/don't-trip the raw instrument) and
MUTATION-KILL 2 (disabling the row-wide stagger on a REAL render measurably raises `wedge25` on
every cell, both rigs) — proving the pinned signatures are sensitive to the real mechanism, not an
arbitrary string. MUTATION-KILL 2's own needle needed one honest edit: its TILED-branch stagger
(`const room = 0.5 * Math.max(0, sub - each);`) no longer exists — the comb replaced T2-5's per-sub-band
random jitter with DETERMINISTIC placement (§4.1's own "by construction, not by measurement"), so
there is nothing left to disable there. The SINGLE-tick branch's own row-wide stagger is UNCHANGED,
byte-identical to T2-3/T2-5, and is what this mutation now isolates — disclosed in the file's own
comment, and the mutation still passes (shipped `wedge25` < no-stagger mutant, all 12 cell x rig
combinations).

## 5. A GUARD FILE THIS UNIT CANNOT FIX, AND DID NOT SILENTLY WORK AROUND

`tests/unit/scene3d-mktick-runaway.test.js`, `-banding.test.js`, `scene3d-style-fill-lines.test.js`,
`scene3d-ladder-uniform-field-spacing.test.js`, `scene3d-ribbon-width-bar.test.js`,
`scene3d-ribbon-fill-depth-count.test.js`, `scene3d-ribbon-f1b-streaks.test.js` (44/44),
`scene3d-ribbon-wall-coverage.test.js` (36/36), `scene3d-crosshatch-cell-shape-b.test.js`,
`tests/integration/scene3d-fill-style-picker.test.js` (177/177, grown from the plan's 170),
`tests/unit/scene3d-tone-law-collapse.test.js` (Tier 1, singleFork, **121/121**, grown from the
plan's 117, 770s, one benign `onTaskUpdate` RPC timeout — pre-existing shared-machine noise, exit 0)
— **all green**, none touched.

`tests/unit/scene3d-mkdashramp-single-pass.test.js`'s own `'mkTick is unaffected'` byte-identity
sub-test (part of `BYTE_IDENTITY_ROSTER`, T3b's file, **FORBIDDEN** to this unit) goes **RED** as a
direct, unavoidable, and — I want to be explicit — NOT a scope-leak side effect: that file's mutant
fixture is `git show b43fa4e3:...` (T3b's OWN base sha, a whole-file historical snapshot, not a
scoped diff), and `b43fa4e3` predates T2-6 but postdates T2-5, so it carries T2-5's OWN mkTick code.
Once ANY later commit touches mkTick — T2-6, by design — that comparison legitimately stops matching,
for a reason that has nothing to do with `mkDashRamp`. **Independently re-verified `mkDashRamp`
itself is untouched** (§3 above, 18/18 byte-identical against THIS unit's own base sha `f0b0b0c8`,
not `b43fa4e3`) — the real thing this unit is responsible for. I am not permitted to edit
`scene3d-mkdashramp-single-pass.test.js` (T3c's file, explicitly FORBIDDEN in `T2-6-plan.md` §6.2),
so this is reported, not fixed: **32/33 in that file**, the one failure named and explained above,
every other sub-test green.

## 6. A GUARD FILE MARGIN THAT MISSED, HONESTLY, AND IS NOT MINE TO EDIT

`tests/unit/scene3d-mark-laws-draw.test.js` (T4/W-36c's oracle, **NOT** in this unit's ALLOWED-file
list) — **29/30**. O1 (the longest-chord-third sagitta oracle, `test|torus/contour`, d=50) reads
**0.09795 mm median, against its own `>= 0.10` bar — a 2.05% miss**, reproduced twice, deterministic.
`T2-6-plan.md` §5.5 explicitly flagged this risk ("the implementer must run that file and report the
margin, not assume it") without ruling it a stop condition. Root cause: the comb shortens ticks in
exactly the population O1 measures (the longest third by drawn chord length) — a previously-long,
multi-vertex, real-curvature-sagitta tick can now be split into several shorter sub-ticks, some of
which fall to a 2-point (no-interior-vertex, zero-sagitta) walk and drop out of the population
entirely, pulling the remaining top-third median down. This is inherent to "gradually shortening
ticks", not a bug. I did **not** attempt to tune the comb's dials to chase this 2% margin: every dial
in `T2-6-plan.md` §4.4's own sweep table has a nonlinear, sometimes large (up to 62%) knock-on effect
on a DIFFERENT bar elsewhere in the twelve-fixture table, and re-validating that whole table for a 2%
miss on one secondary population metric, in a file I cannot edit, is not a proportionate use of this
unit's scope. **Reported, not fixed. This is very likely why T2 may not be declared closed.**

## `## Bars changed`

- `tests/unit/scene3d-mktick-wedge.test.js:359-372` (`EXPECTED_SIGNATURE`) — **12 of 12 `pathSignature`
  goldens re-pinned** (was 4/12 at T2-5). Every cell's own before/after hash is in the file's diff;
  reasons and the contrast-mutation proof are in §4b above. `O5_BAR`, `WEDGE_MEAN_BAR`,
  `WEDGE_CELL_CEILING` — **unchanged**.
- `tests/unit/scene3d-mktick-wedge.test.js:181-198` (`STAGGER_NEEDLE_TILED`/`STAGGER_REPL_TILED`,
  MUTATION-KILL 2) — **removed** (the tiled-branch stagger this needle targeted no longer exists —
  replaced by the comb's deterministic placement, §4b). `STAGGER_NEEDLE_SINGLE` — unchanged, still
  the mutation this test measures. This is a POPULATION change to an existing assertion (standing
  rule 6): the mutant now isolates the single-tick stagger alone, not "the stagger" in general — and
  the mutation-kill still passes on all 12 cell x rig combinations with this narrower population.
- `tests/unit/scene3d-mktick-band-purity.test.js:132-222` (`POST_TICK_BLOCK_INSTRUMENTED`) —
  **rewritten** to mirror the shipped block (§4a). This is the disclosure standing rule 6 calls for
  even when a downstream number does not move: the POPULATION this file's own "GREEN" describe block
  measures changed from "T2-5's frozen mechanism" (silently, by needle-splice accident) to "T2-6's
  actual shipped mechanism" (after the fix) — a correctness repair, not a tuning choice.
- `tests/unit/scene3d-mktick-band-purity.test.js:419-425` (MUTATION-KILL needle) — `const nSub =
  clamp(...)` -> `const nOver = clamp(...)`, forcing `nOver=1` instead of `nSub=1`. Isolates clause
  (c)'s own contribution more precisely than before (leaves T2-6's `nComb` live) — same intent,
  updated target, still passes.
- `src/core/scene3d/surface-fill.js` — **four new bars**, all named/measured/disclosed in the source
  comment beside each: `MK_TICK_COMB_RHO=0.62`, `MK_TICK_COMB_MAX=2`, `MK_TICK_COMB_MIN_R=0.40`,
  `MK_TICK_COMB_ENV=0.85` — the plan's own validated "F3" setting, §4.4's dial-sweep table.
- **No bar in `scene3d-mark-laws-draw.test.js` or `scene3d-mkdashramp-single-pass.test.js` was
  touched** — both are outside this unit's ALLOWED files; their findings are reported in §5/§6, not
  fixed.

## Evidence

`docs/3d-audit/fill-audit/after/T2-6/` — captured from MAIN against the worktree's own dev server
(port 8475, killed after), both `--rig create` and `--rig addLayer`:
`^(sphere|torus|cone)__(hatch|contour)__mkTick__med__a$` (both rigs, 12 shots),
`cone__hatch__mkTick__{low,max}__a` (create), `cone__crosshatch__mkTick__med__a` (create) — **15
shots total**, `manifest.B.1-1.jsonl` (9 entries) + `manifest.B.1-1.addlayer.jsonl` (6 entries), all
confirmed present in `docs/3d-audit/fill-audit/manifest.B.*.jsonl` before capture.

**LOOKED at the pictures.** Native-resolution crops of `cone/hatch/mkTick/med/create`, transition
zone (mid-right and lower-right), before (this unit's own base sha `f0b0b0c8`, from
`T2-6-plan-evidence/cone_hatch_create_HEAD.png` — same base, re-verified identical fixture) vs after
(this unit's own fresh capture), 3x-4x nearest-neighbour zoom:

- **Before**: the transition zone reads as scattered, roughly-uniform-length stubs at unrelated
  depths — the "punctured" texture `T2-6-plan.md` §4.6 describes. Several isolated short marks sit
  alone with no visible neighbour relationship.
- **After**: multiple rows now show CLEAR PAIRED tick structure — a longer tick immediately
  followed by a visibly, deliberately shorter parallel tick, cascading toward the light. The
  broad diagonal black wedge from the "before" image is broken into several thinner channels that
  run WITH the rows rather than across them.
- At d=220 (max) and d=1 (low), and on `crosshatch`, the picture reads cleanly with no new
  artefacts — the comb's own on-chart/envelope gates keep it well-behaved off its primary fixture.

**As a plotter artist: yes — the after picture reads as "gradually shortening ticks filling the
gaps", on the cell Jay was looking at, on both rigs.** Two honest qualifications, both already in
the plan and reconfirmed here: (1) `create|torus/hatch` keeps most of the old picture (`A1=0.16`,
the `bandOn` gate disables the comb on the torus's own worst foreshortening); (2) the fully-abutted
dark region is deliberately unchanged (`sv.L>=0.98R` and `MK_TICK_COMB_MIN_R=0.40` both exclude it
by design) — black-by-abutment reads the same as before, which is correct, not a miss.

## Stop conditions checked, none tripped

`O5>=2.30` monotone 12/12 (min 2.3426) — held. Six-cell mean `wedge25` under both bars — held.
`bandC` x1.05 pinned ceiling (`sphere/contour`, `cone/contour`, both rigs) — held, unmodified,
**22/22** in `scene3d-mktick-banding.test.js` (the plan's own §4.3 worry about a `test|sphere/hatch`
+6.5% reading was against a DIFFERENT, T2-5-baselined number outside this file's own pinned bar —
re-checked directly against the file's actual `PRE_RANK1_BANDC` ceiling, and it passes with margin).
`ovMax` off 0.0800 — never happened (12/12 exact). `over2RP` off 0 — never happened (12/12). Pen-downs
+30% ceiling — the largest rise measured is +10.9% (test rig), the prototype's own number, nowhere
near the ceiling. d=220 `siteCoverage`/`holeMax` — both unchanged to 4 decimals on every named cell
(§2's d=220 table). A1>=0.35 unreachable anywhere — false; it is reached on 10 of the 12 named cells,
and the two exceptions (`create|torus/{hatch,contour}`) are named, measured, and given their own bar
rather than hidden. **The picture moved** (§ Evidence) — this is not a T2-5-style "oracle passed,
picture didn't move" unit.

## Pre-existing red

None inherited. `scene3d-mktick-band-purity.test.js` and `scene3d-mktick-wedge.test.js` both started
this session GREEN at base sha `f0b0b0c8` and were turned RED by this unit's own change, then
repaired/re-pinned within this unit (§4). `scene3d-mkdashramp-single-pass.test.js`'s one RED (§5) is
a genuine, disclosed, unfixable-by-this-unit side effect of a cross-unit test-design artifact, not
something inherited from an earlier unit's unfinished work.

## Finish

**No additional worktree commit was made on top of `0f420747`.** After the rate-limit resume, the
working tree was re-verified byte-for-byte against that checkpoint (`git diff HEAD --stat` — empty)
and every re-run (the new test file, both repaired guard files, `runaway`/`banding` spot-checks, the
`O1` margin, and the full md5 roster sweep) reproduced identically; nothing further needed changing
in `src/`/`tests/`. `0f420747` — same five files listed at the top of this report, same diff I
authored before the interruption — **is this unit's real, final, verified commit**; fabricating an
empty or cosmetic follow-up commit to satisfy "make a commit" would be worse than leaving accurate
history in place, so none was made. Never pushed. **T2 is NOT declared closed** — §6's O1 margin
miss is Jay's to rule on, and no F1-style "screenshot proves it" claim is made beyond what
§"Evidence" states.
