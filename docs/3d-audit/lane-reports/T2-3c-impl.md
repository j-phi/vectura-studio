STATUS: DONE

# T2-3c — implementer report

Lane `fill-audit-a3`, worktree `.claude/worktrees/fill-audit-a3`, branch
`3d-scene/fill-audit-a3`. Base sha `a8e2269f` (T2-3b (b), shipped) ->
final sha `7375918c`. Verified clean (`git status --short -- . ':!graphify-out'`,
`git stash list`) before starting — no stash entries touched this worktree,
no other WIP. Never pushed, never merged, never touched MAIN's `src/`/`tests/`.
Port 8475 (`nohup node <worktree>/scripts/dev-server.js 8475 &`, confirmed
`served version 1.4.1` == worktree `package.json`), killed after the capture
(`lsof -ti:8475` empty afterward).

## Reading done, in order

`AGENT-PROTOCOL.md`, `ROUND3-RESUME-BRIEFS.md` §0 (binding checklist, pasted
in full into the orchestrator's own prompt to me) and §0b (timeout rule —
followed: every vitest file run foreground, one at a time, `timeout: 600000`
available; none of my files needed it, all finished well under 45s),
`T2-3b-review.md` (flag 2, the BLOCKING follow-up this unit closes),
`T2-3b-impl.md`, `T2-3-plan.md` (the stagger + `place()` walk background).

## Files touched (all ALLOWED, nothing FORBIDDEN)

- `src/core/scene3d/surface-fill.js` — `MK_TICK_JUMP_PEN` (new constant,
  next to `MK_MAX_WALK_STEPS`), `MK_TICK_STEP_CAP_MM` (new, inside
  `emitMarks`, derived from `MK_ARC_MM`), `walkFrom` (new `stepCapMM`
  parameter + one guard clause), `walkPoly` (threads `stepCapMM` through
  its three `walkFrom` calls), and the `place()` call site (passes the cap
  only when `law.shape === 'tick'`). Nothing else in the file changed —
  confirmed by re-reading the diff before commit.
- `tests/unit/scene3d-mktick-wedge.test.js` — 11 of 12 `pathSignature`
  goldens re-pinned (see `## Bars changed`).
- `tests/helpers/scene3d-mktick-runaway.js` — NEW. Pure `pathLength` /
  `maxSegment` / `runawayCensus` helpers (no renderer).
- `tests/unit/scene3d-mktick-runaway.test.js` — NEW. The per-cell guard,
  mechanism assertions, addLayer-rig characterisation, and the
  MUTATION-KILL proof.

## 1. Mechanism — found with the reviewer's own census method

Dumped per-path point counts and lengths on Fixture A (this file's own
`renderCell`: `BOUNDS = {width:1200,height:1000,m:20,dW:1160,dH:960,
penWidth:0.3}`, `ground:{enabled:false}`, `backdrop:{enabled:false}`,
`toneLaw:'mkTick'`, `fillDensity:50`, no camera override — i.e. `DEFAULT_
CAMERA`), `sphere/contour`, `create` rig, base sha `a8e2269f`:

- Path index 943 (of 1123 total): **19 points, 52.386mm total drawn
  length.** Its own per-segment lengths:
  `[0.337, 0.338, 0.339, 46.73, 0.275, 0.269, 0.299, 0.319, 0.331, 0.364,
  0.355, 0.351, 0.349, 0.347, 0.347, 0.346, 0.346, 0.346]` — **eighteen
  ordinary steps of 0.27-0.36mm** (`MK_ARC_MM = MK_ARC_PEN * penWidth =
  1.2 * 0.3 = 0.36mm` at this fixture's pen) **and exactly ONE 46.73mm
  discontinuous jump**, between the 4th and 5th accepted points.
- This settles the reviewer's own open question ("not a single tick... this
  is `place()`'s per-arm walk chaining many mark sites into one continuous
  path"): it is **not** several independently-placed ticks merged into one
  path. `mkShape('tick', L, R, w)` returns exactly ONE 2-point poly per mark
  at every measured cell (confirmed structurally: `Lc = min(L, 1.02*R)`,
  `n = round(L/Lc)`, and `L` is capped at `L0*R = 1.16*R` by `solveAt`, so
  `L/Lc <= 1.16/1.02 = 1.137`, which always rounds to `n = 1`) — and
  confirmed on the actual fixture in
  `scene3d-mktick-runaway.test.js`'s own "addLayer-rig diagonal" describe
  block (every path in this render has <= 25 points; the historical 129-point
  theoretical ceiling — `2*MK_MAX_WALK_STEPS+1` — is never approached). It IS
  `place()`'s per-arm walk (`walkFrom`, `MK_MAX_WALK_STEPS = 64`), on a
  SINGLE tick, taking one catastrophic step: `walkFrom` re-derives its local
  frame (`frameFrom`) from every newly accepted sample, and that frame's
  basis vectors are `1/|dA . ld|`-scaled — near a chart singularity (a
  `contour` mapper's row approaching the pole, or a silhouette-adjacent patch
  going near edge-on, exactly where `solveAt`'s `R = clamp(..., 0.25, 40)`
  sits at its CEILING, the suspect `T2-3b-plan.md` §4.3 named) that scale
  blows up, so a step sized in UV for an ordinary patch can land the very
  next accepted sample tens of millimetres away in physical (screen) space.

## 2. The fix

`surface-fill.js`, `walkFrom` (per-arm walk) and `walkPoly` (the hub +
two-arm assembly) both take a new optional `stepCapMM`. Inside `walkFrom`'s
step loop, right after computing the candidate next point and BEFORE
accepting it:

```js
if (stepCapMM && Math.hypot(nextPt.x - curPt.x, nextPt.y - curPt.y) > stepCapMM) {
  truncated = true;
  break;
}
```

— refused exactly like an existing off-surface sample (`!hit`): `truncated
= true`, keep whatever the walk already accepted (T1b's own "shortened, not
refused wholesale" philosophy, applied to a NEW failure mode). `place()`'s
call site:

```js
const wk = walkPoly(fr, uOff, theta, poly, law.shape === 'tick' ? MK_TICK_STEP_CAP_MM : undefined);
```

`MK_TICK_STEP_CAP_MM = MK_TICK_JUMP_PEN * MK_ARC_MM`, `MK_TICK_JUMP_PEN =
12` (12x the walk's own per-step budget — comfortably above every ordinary
step measured at any gated cell, roughly two orders of magnitude below the
measured defect). **Tick-only by construction**: `'morph'` (`mkDashRamp`,
the only other `isWalkedShape`) always receives `undefined`, so
`if (stepCapMM && ...)` short-circuits and its behaviour is unchanged
regardless of geometry — not just measured, structurally guaranteed by the
ternary at the one call site (asserted live in the new test file).

**Avenue NOT taken, per `T2-3b-plan.md` §4.3's own explicit warning**:
clamping `L` against the nominal pitch was already tried and closed by the
plan (didn't remove the long path, wrecked O5). This fix does not touch `L`,
`solveAt`, the `Lfloor` area floor, `MK_ROW_COV`, or any MK-table constant —
it operates purely on the WALK, downstream of the tone solve, exactly the
site `T2-3b-review.md` and the orchestrator both pointed at.

## 3. Per-cell longest-path / count(>15mm), all 12 (cell, rig), Fixture A

Measured with `tests/helpers/scene3d-mktick-runaway.js`'s `runawayCensus`.
`PRE_T23B` = scratch `git archive 56481503` (T2-3b (a), before Rank 1).
`BASE` = `a8e2269f` (this unit's own starting point, also via scratch
`git archive`, never in-worktree). `FIXED` = this tree.

| rig | cell | PRE_T23B longest/count | BASE longest/count | FIXED longest/count |
|---|---|---|---|---|
| create | sphere/hatch | 47.085 / 4 | 46.690 / 3 | **8.713 / 0** |
| create | sphere/contour | 7.189 / 0 | **52.386 / 1** | **7.189 / 0** |
| create | torus/hatch | 14.199 / 0 | 14.199 / 0 | 8.474 / 0 |
| create | torus/contour | 10.513 / 0 | 11.876 / 0 | 10.513 / 0 |
| create | cone/hatch | 9.735 / 0 | 12.239 / 0 | 9.896 / 0 |
| create | cone/contour | 5.206 / 0 | 5.206 / 0 | 5.206 / 0 (byte-identical) |
| test | sphere/hatch | 37.376 / 2 | 37.376 / 2 | **8.854 / 0** |
| test | sphere/contour | 20.249 / 1 | 20.249 / 1 | **7.048 / 0** |
| test | torus/hatch | 17.814 / 1 | **17.814 / 2** | **7.228 / 0** |
| test | torus/contour | 12.734 / 0 | 12.734 / 0 | 12.734 / 0 (byte-identical) |
| test | cone/hatch | 10.287 / 0 | **15.610 / 1** | **10.306 / 0** |
| test | cone/contour | 8.061 / 0 | **22.435 / 1** | **7.010 / 0** |

**Every one of the seven pre-fix `>15mm` paths across all 12 (cell, rig)
combinations is eliminated. Zero new `>15mm` paths anywhere.**
`create|cone/contour` and `test|torus/contour` are BYTE-IDENTICAL
before/after (the two cells whose walk never took a step over 5mm at this
fixture — confirmed by the segment-length sweep below).

**`create|sphere/hatch` is disclosed, not required by this unit's own
bar**: its baseline (`PRE_T23B`) already had 4 paths over 15mm — an OLDER
defect than Rank 1, matching `T2-3b-plan.md` §4.3's own "pre has 13, not
introduced by Rank 1" disclosure. This unit's per-cell guard does not
require it to be red at the base sha (it is not a NEW regression relative
to the `56481503` baseline this unit's bar is defined against). The SAME
walk-jump mechanism produces it, so this fix cleans it up anyway
(46.69mm/3 -> 8.71mm/0) — a bonus, reported honestly as such, not claimed as
a requirement met.

## 4. Which half of the acceptance bar this guards (rule 1, mutation-proven)

Jay's rule (`user-reports/8.png`) has two written clauses: **R1** "ticks
must have VARIABLE LENGTH... tick length carries the tone" (`O5`,
`scene3d-mktick-wedge.test.js` — **untouched by this unit**, still
2.330-3.221 (test) / 2.437-3.221 (create), monotone 12/12, re-verified
below) and **R2** "the field stays complete... the only gaps allowed are
where highlights are" (`wedge25`/`holeMax`, same file, a GAP/absence-of-ink
defect — **also untouched**, all six-cell mean + per-cell ceilings still
pass with the same margins). A runaway stroke is neither R1 nor R2: it is
an EXCESS of ink in the wrong place, a walk artefact, not a legitimate
tick. `scene3d-mktick-runaway.test.js` gates a **third, implicit clause the
orchestrator named directly: "no stray marks that are not ticks."** It says
nothing about R1 or R2 and does not duplicate `O5`/`wedge25`/`holeMax`/
`bandC` (the moiré half, also untouched — 22/22 green, unchanged bars).

**Mutation-kill (blocking, per rule 1)**: `scene3d-mktick-runaway.test.js`'s
own `MUTATION-KILL` describe block patches the ONE call-site line back to
`walkPoly(fr, uOff, theta, poly)` (no cap, byte-for-byte `a8e2269f`'s own
code) via a scratch `scriptOverrides` render (not `git show`/stash) and
re-measures the four cells that were RED at the base sha
(`create|sphere/contour`, `test|torus/hatch`, `test|cone/hatch`,
`test|cone/contour`): the shipped tree clears the per-cell bar on every one;
the mutant reproduces a per-cell violation (count or longest, or both) on
every one. Reproduced independently at the base sha itself (below) as the
RED half of RGR.

## 5. RED, at `a8e2269f`, scratch `git archive` (never in the worktree)

Built `/private/tmp/claude-501/scratch-T23c-base/` from `git archive
a8e2269f`, `node_modules` symlinked from the worktree, copied in the
(not-yet-committed-at-that-sha) `scene3d-mktick-runaway.test.js` + its
helper unmodified, ran the file as-is:

**13 failed / 20 passed / 4 "skipped"** (the `MUTATION-KILL` describe
block's own `beforeAll` throws at this sha — `FIX_NEEDLE` does not exist
pre-fix, by construction, exactly as it shouldn't; not a defect, the block
exists to run only on the fixed tree).

The 13 failures:
- 3 mechanism assertions (the new call-site pattern, `MK_TICK_JUMP_PEN`,
  and `walkFrom`/`walkPoly`'s `stepCapMM` parameter — none exist pre-fix,
  correctly RED; the OTHER 3 mechanism assertions — R clamp ceiling
  untouched, `Lfloor` untouched, `L0` unchanged — correctly PASS at the
  base sha too, since those facts were already true before this unit).
- 8 per-cell census assertions: `create|sphere/contour` (both count AND
  longest), `create|cone/hatch` (longest only — `12.239 > 11.735` cap),
  `test|torus/hatch` (count only — `2 > 1`), `test|cone/hatch` (both),
  `test|cone/contour` (both).
- 2 "far below the pre-fix number" sanity checks on the two named flagged
  cells (`create|sphere/contour` 52.39 not `< 20`; `test|sphere/contour`
  20.25 not `< 15`).

**GREEN at `7375918c`**: all 37 tests, including the 8 per-cell census
assertions, the 2 sanity checks, all 6 mechanism assertions, and the 2
MUTATION-KILL proofs.

## 6. addLayer-rig diagonal — characterised, per the orchestrator's ask

**On Fixture A (this unit's own vitest fixture, `test`/addLayer-style
construction) it is a SINGLE 2-point path, not an alignment of several
ticks.** `test|sphere/contour`'s own worst pre-fix path: index 15, **`n=2`
points, one 20.249mm segment** — i.e. a single arm's very first accepted
step already lands 20.25mm from the hub (the SAME mechanism as the
create-rig 52.39mm case, just a smaller-magnitude instance: only one
catastrophic step, no subsequent ordinary steps at all, because the
resulting UV-target was already reached — or the walk truncated
immediately after — in one step). Structurally ruled out the "several
ticks merged" theory the same way as the create-rig cell: `mkShape('tick',
...)` returns one 2-point poly per mark at this fixture (rounds to `n=1`
always, given `L <= 1.16*R`), confirmed live in
`scene3d-mktick-runaway.test.js`'s own "addLayer-rig diagonal" test (every
path in the render has `<= 25` points).

**On the GALLERY capture fixture (the actual `engine.addLayer('scene3d')`
construction the capture harness's `--rig addLayer` drives, ground/backdrop
included, different non-default params than Fixture A's minimal
`test`/addLayer render — see `report.json`'s `fixture_gallery_capture` vs
`fixture_vitest_unit_test` blocks), the pre-fix picture instead shows a
FULL-DIAMETER diagonal, visually similar in extent to the create-rig
defect** (see `after/T2-3c/crops/sphere-contour-addlayer-native-before.png`
— LOOKED at, described in §7 below). **This is a genuine fixture-size
discrepancy, disclosed rather than smoothed over** (binding rule 3): the
vitest Fixture A's `test`/addLayer construction and the capture harness's
`--rig addLayer` construction are NOT the same object/params bag (see
`report.json`), so the SAME mechanism (a walk-jump near a chart
singularity) manifests at different magnitudes on the two fixtures — both
are eliminated by this fix (confirmed visually on the gallery fixture,
§7; confirmed numerically on Fixture A, §3/§5).

## 7. Evidence — LOOKED at, native resolution

Captured FROM MAIN, `--root` = the worktree at (then-uncommitted, now
`7375918c`), both `--rig create` and `--rig addLayer`, port 8475 (served
version `1.4.1`, matching `package.json`), into
`docs/3d-audit/fill-audit/after/T2-3c/` — six mkTick x med cells, both
rigs, 12 shots total, no byte-identical pairs. Full detail (fixture block,
per-shot pathCount/inkMm, the vitest per-cell table) in
`docs/3d-audit/fill-audit/after/T2-3c/report.json`. Ports killed after
capture (`lsof -ti:8475` empty).

**`crops/sphere-contour-create-native-before.png` / `-after.png`** (native
775x775px, no upscale, crop box (150,100)-(650,600)): BEFORE shows one
long, straight diagonal stroke crossing the whole lit flank from
upper-left to lower-right — unmistakable, the exact defect
`T2-3b-review.md` photographed. **AFTER: that stroke is completely gone.**
The tick field, row banding, and length-carries-tone gradient are visually
identical to BEFORE apart from the stroke's absence — **nothing new
appears.**

**`crops/sphere-contour-addlayer-native-before.png` / `-after.png`** (same
crop box, addLayer rig): BEFORE shows the same class of full-diameter
diagonal (see §6's fixture-discrepancy note). **AFTER: also completely
gone**, same "nothing else changed" read.

Also compared (not saved as crop files, described here): `torus/hatch` and
`cone/hatch` (create rig, full-frame): BEFORE shows several small jagged
diagonal spikes near the dense/dark region; AFTER shows these visibly
smoothed/reduced (consistent with the census: both cells improved even
though neither crossed this unit's own count15 bar). `torus/contour` and
`cone/contour`: visually indistinguishable before/after (both already
clean per the census, and `cone/contour` create-rig is the one
byte-identical cell).

**Plain answer to "does the fix look right in the app"**: yes — the stray
stroke is gone on every LOOKED-at cell/rig, and no new defect appears
anywhere in any of the eight full-frame comparisons made.

## 8. lenChan / tick-only blast radius (rule 2, coverage stated as a fraction)

**Structural**: `if (stepCapMM && ...)` inside `walkFrom` is a plain
truthiness check; `stepCapMM` is `undefined` at every call site except
`place()`'s own, where it is `law.shape === 'tick' ? MK_TICK_STEP_CAP_MM :
undefined`. The ONLY two shapes that ever call `walkPoly`/`walkFrom` at all
are `'tick'` (`mkTick`) and `'morph'` (`mkDashRamp`) — `isWalkedShape =
law.shape === 'tick' || law.shape === 'morph'`. So structurally, no law
other than `mkTick` can ever see a non-`undefined` `stepCapMM`.

**Measured, not just argued**: byte-identity sweep of the 3 non-mkTick
`PRODUCTION`-reachable laws (`mkScribble`, `mkDashRamp`, `mkDotScreen` —
100% of the reachable non-mkTick roster per `T2-3b-impl.md`'s own finding
that only 4 of 12 MK-table rows are wired to `SCENE3D_TONE_LAWS.
PRODUCTION`) x all 8 mappers (`none, hatch, wireframe, crosshatch, contour,
spiral, stipple, contourSlice`) x 3 primitives (`sphere, torus, cone`) x 2
densities (`d50, d220`) x 2 rigs (`create, test`) = **288 combinations**,
`sha256` path-signature compared between a scratch `git archive a8e2269f`
and this tree: **288/288 byte-identical, 0 diffs.** Scratch dir removed
after the sweep. This matches `T2-3b-impl.md`'s own precedent scope
exactly. The other 8 MK-table rows (`mkLozenge`, `mkComma`, `mkSFlick`,
`mkCrossPlus`, `mkTriangle`, `mkDotLozenge`, `mkRadialFlick`,
`mkAltrow`-family) are unreachable by `toneLaw` id at all (falls back to
`'ladder'`) — not independently swept, per the same disclosure T2-3b
already made for this exact roster.

`shadows.js:1229`'s own unrelated `mkTick` (a shadow-rendering function
keyed by the same string in a different table) — checked, not touched.

## 9. Guards — all run individually, foreground, this worktree

| file | result |
|---|---|
| `scene3d-mktick-wedge` (own, re-pinned) | 58/58 |
| `scene3d-mktick-banding` (own) | 22/22 |
| `scene3d-mktick-runaway` (own, new) | 37/37 |
| `scene3d-mkdashramp-dark-end` (T4b) | 4/4 |
| `scene3d-plot-safety` (T1b min-adjacent-mark) | 5/5 (1 pre-existing skip) |
| `scene3d-ribbon-f1b-streaks` | 44/44 |
| `scene3d-ribbon-wall-coverage` | 36/36 |
| `scene3d-ribbon-f1-amp` | 47/47 |
| `scene3d-mark-laws-draw` (G4 — `mkDashRamp`'s band-width guard) | 30/30 |
| `scene3d-mkdashramp-low-end` (T3) | 13/13 |
| `scene3d-crosshatch-cell-shape` + `-b` (W-31b) | 34/34 |
| `scene3d-crosshatch-parity` (W-36c) | 91/91 |
| `scene3d-ladder-uniform-field-spacing` + `scene3d-fill-ruling-corners` | 28/28 |
| `scene3d-faceted-hatch-density-angle-stable` + `scene3d-hatch-density-500` | 19/19 |
| `scene3d-fill-even-spacing` + `scene3d-curved-density-floor` + `-sparse-end` | 46/46 |

One benign `[vitest-worker]: Timeout calling "onTaskUpdate"` and
`[FillBoolean] polygon union failed on degenerate geometry` on stderr in
the ribbon files — pre-existing shared-machine noise, not a regression
(matches T2-3b-impl.md's own disclosure of the same lines).

## Bars changed

- `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE` —
  **11 of 12 `pathSignature` goldens RE-PINNED** (population change: the
  walk guard legitimately changes mkTick's own emitted geometry wherever a
  step used to blow up). `create|cone/contour`'s golden is UNCHANGED,
  byte-for-byte — the one cell whose own segment-length sweep never found a
  step over 5mm, itself part of the proof (a guard truly inert on an
  unaffected cell should not move that cell's own fingerprint). Old values
  are in `56481503`/`a8e2269f`'s own history for the diff; mutation-kill
  proof is `scene3d-mktick-runaway.test.js`'s own `MUTATION-KILL` describe
  block (reverting the guard reproduces the pre-fix per-cell violation on
  every one of the 4 flagged cells).
- No other test file's bar changed. No MK-table constant changed (`L0`
  1.16, `LMIN` 0.18, `P0` 1.02, `MK_TICK_EASE_BLEND` 0.92, the R clamp
  ceiling `(..., 0.25, 40)`, `MK_ROW_COV`, the `Lfloor` area floor all
  confirmed unchanged by `grep`/live-source assertions in the new test
  file). `O5` bar (`>= 2.30`) unchanged and unaffected; `wedge25`/`bandC`
  bars unchanged and unaffected (re-verified green with the same margins
  T2-3b-impl.md reported).
- `src/core/scene3d/surface-fill.js` — two NEW constants
  (`MK_TICK_JUMP_PEN = 12`, `MK_TICK_STEP_CAP_MM`), not a change to an
  existing bar.

## Stop conditions checked

1. Per-cell (not aggregate) runaway guard: shipped, blocking, mutation-proven.
2. Fix does not re-open the wedge (`wedge25` mean + per-cell ceilings all
   still pass, re-run 58/58 green), does not touch O5 (still 12/12
   monotone, `>= 2.30`), does not touch `bandC` (22/22 green, unchanged
   bars).
3. G4 (30/30), T4b (4/4), ribbon-width bars (44/44, 36/36, 47/47), T3
   (13/13), W-31b (34/34), mktick-wedge (58/58), mktick-banding (22/22) —
   all green, all run (not argued).
4. addLayer-rig diagonal characterised: single-step walk-jump on Fixture A
   (one 2-point path), a larger same-mechanism instance on the gallery
   fixture — both eliminated by this fix, disclosed as two different
   fixtures per rule 3.
5. Byte-identity: 288/288 non-mkTick PRODUCTION-law combinations, 0 diffs;
   structural proof (the ternary gate) covers every other MK-table row.
6. Evidence: six mkTick cells x med, both rigs, captured; two native crops
   LOOKED at and described; the stray stroke confirmed gone on both, no new
   defect on any of the eight full-frame comparisons made.

## Evidence paths

`docs/3d-audit/fill-audit/after/T2-3c/report.json`,
`docs/3d-audit/fill-audit/after/T2-3c/manifest.B.1-1.jsonl` (+
`.addlayer.jsonl`), `docs/3d-audit/fill-audit/after/T2-3c/shots/B/*.webp`,
`docs/3d-audit/fill-audit/after/T2-3c/crops/*.png`.

REPORT docs/3d-audit/lane-reports/T2-3c-impl.md — DONE — per-cell runaway guard shipped; longest paths per cell 52.39/20.25mm to <=13mm, 0 stray >15mm.
