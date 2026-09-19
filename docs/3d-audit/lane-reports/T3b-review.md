STATUS: ACCEPT-WITH-FOLLOWUPS

# T3b review — mkDashRamp single-pass dashes below a density threshold (Jay decision 12=B)

- **Role:** adversarial reviewer, READ-ONLY.
- **Pinned range:** `b43fa4e3..e60d102e` on branch `3d-scene/fill-audit-a4` (one commit,
  `surface-fill.js` +48/−2, new `tests/unit/scene3d-mkdashramp-single-pass.test.js` +360 —
  matches the pinned diffstat exactly, confirmed via `git diff --stat`).
- **Worktree read from:** `.claude/worktrees/fill-audit-a4` (never edited/staged/reset).

## Method

- `git -C <worktree> archive b43fa4e3 | tar -x -C /private/tmp/claude-501/scratch-T3b/pre`,
  same for `e60d102e` into `.../post` — `node_modules` symlinked from MAIN. These are immune to
  worktree contamination but are not git repos, so the test file's own `git show <sha>:<path>`
  mutation technique cannot run inside them (confirmed: fails with "not a git repository").
- `git clone --local --no-hardlinks <worktree> /private/tmp/claude-501/scratch-T3b/gitclone`,
  checked out at `e60d102e`, `node_modules` symlinked. This IS a git repo reachable back to
  `b43fa4e3`, so the shipped test file's own mutation machinery (`git show b43fa4e3:...`) runs
  correctly here — all guard reruns and every throwaway probe below ran from this clone, never
  in the reviewed worktree.
- Five throwaway specs (independent threshold/duty/roster sweeps + a pre-vs-post d=34/35/36
  comparison) were written, run, and deleted from the gitclone before finishing — confirmed zero
  `zz-*` files remain. Nothing was left in the reviewed worktree at any point.
- Vitest 3.2.6, Node (repo environment), every run foreground, one file (or one throwaway file)
  at a time, `timeout: 600000` available though nothing here approached it.

## A note on the worktree (not a T3b finding)

Mid-review, `.claude/worktrees/fill-audit-a4` went dirty: `tests/unit/scene3d-curved-density-floor.test.js`
gained 118 uncommitted lines, clearly a concurrent **W-36e** session landing its own WIP (the diff's
own comments name `W-36e`, `crossPairShare`, "crosshatch dial bar's interior blind spot" — LEDGER
row 5 confirms W-36e is in flight on this same lane). I never edited, staged, or reset anything in
the worktree. Every number in this report comes from the `git archive`/`git clone` exports pinned
to `b43fa4e3`/`e60d102e`, which are immune to this by construction. Flagging per the "one active
workstream per worktree" rule — process hazard on the shared lane, not a defect in `e60d102e`.

## Condition 1 — RED/GREEN + mutation (BLOCKING)

**GREEN**, reproduced in the gitclone: `scene3d-mkdashramp-single-pass.test.js` **20/20** at
`e60d102e`.

**RED / mutation-kill, O10 ("single pass at the sparse end"):** the shipped test's own mutation
(`loadVecturaRuntime({ scriptOverrides: { 'src/core/scene3d/surface-fill.js': git-show-b43fa4e3 } })`)
reproduces `bandMax=6`, pens-per-mark `3.9347826086956523` at d=1, sphere/hatch, addLayer rig —
**exact digit-for-digit match** to the claim. This is a genuine blocking mutation-kill: strip the
gate, the bundle comes back, the test goes red. **MET, full rigor.**

**O11 ("T3's own count/monotonicity bars still hold") is a different shape of proof, and the
report is honest about why.** I independently verified the report's own claim that mark
`PLACEMENT` (the `marks` counter) is architecturally decoupled from `bandN`: running the exact
same fixture on both the current tree and the `b43fa4e3` mutant gives the **identical** sphere
sequence `[46, 46, 62, 63, 73]` on **both** trees (reproduced myself, not just re-run from the
shipped file). That means there is **no mutation of T3b's own code (`bandOnsetCap`) that could
ever break O11's monotonicity bar** — bandN only bounds `capOf`'s ink cap on an already-placed
mark, never whether a mark is placed. So "break monotonicity → RED" cannot be demonstrated by
mutating T3b's diff, because T3b's diff is provably inert on the quantity O11 measures. The
monotonicity property itself remains guarded by **T3's own** mutation-kill (`scene3d-mkdashramp-low-end.test.js`'s
O7, unmodified by this unit) — I re-ran it in the gitclone and it reproduces T3-review.md's own
number exactly: stripping `rowFloor` gives the sequence `[7, 7, 6, 12, 73]`, a real drop at
d=5→d=10, RED. **T3b did not touch that file, and it is still 13/13 green.** So: O10 carries a
first-party blocking mutation proof; O11 carries a structural independence argument (verified) plus
an untouched, still-green, independently-reproduced sibling mutation-kill. Both are legitimate,
both are disclosed as such in the report's own header comment (not hidden) — **MET**, with this
precision preserved rather than treating the two as the same rigor.

**Which half each gates**, as claimed: O10 = single-pass only, O11 = T3's count/monotonicity only,
O12 = continuity at the threshold, O13 = non-regression on O8/T4b/G4 territory. Accurate — none of
the four overlaps another's claim, confirmed by reading the diff (only `bandN`'s two computation
sites changed; `algoCoverage`/`markRowCoverage`/mark placement untouched).

**Verdict: MET.**

## Condition 2 — threshold measurement

Independently reproduced the pens-per-mark / bandMax / ink sweep at d = 1, 5, 10, 25, 34, 35, 36,
50, 100, 220, sphere/hatch/mkDashRamp, **both rigs**, from the gitclone (not re-running the
shipped file — a fresh throwaway spec calling `generate()` directly):

*(MERGE r4 item 30/R4-2 annotation: harness rule C — `generate()` called directly on a single
primitive, no scene/ground wrapper ever built, so every ink number below is object-only and the
ground-plane question is N/A. Fixture: rig addLayer+create as tabulated, camera n/a (object-space,
no scene camera), density per row, non-default params fillAngle 45/penWidth 0.3.)*

| d | addLayer bandMax | addLayer ppm | addLayer ink (mm) | create bandMax | create ppm | create ink (mm) |
|---|---|---|---|---|---|---|
| 1 | 1 | 1.00 | 325.19 | 1 | 1.00 | 417.26 |
| 5 | 2 | 1.89 | 517.11 | 2 | 1.87 | 807.02 |
| 10 | 2 | 1.76 | 571.17 | 2 | 1.87 | 807.02 |
| 25 | 5 | 2.98 | 1137.73 | 5 | 3.15 | 1732.97 |
| 34 | 6 | 3.21 | 1181.06 | 6 | 3.18 | 1911.88 |
| 35 | 6 | 3.21 | **1181.06** | 6 | 3.13 | 1912.88 |
| 36 | 5 | 2.77 | 1041.61 | 5 | — | — |
| 50 | 4 | 2.12 | 926.51 | 3 | 1.82 | 1177.40 |
| 100 | 1 | 1.00 | 625.39 | 1 | 1.00 | 970.04 |
| 220 | 1 | 1.00 | 981.65 | 1 | 1.00 | 1501.06 |

Every one of these matches the report/report.json to the number (d=50/220 rows match
`non_regression_d50_d220` exactly; d=1 matches `green_addLayer_rig_sphere_d1_bundle` exactly).

**Is d=35 the measured crossover or a round number?** Confirmed measured, not round: I ran the same
d=34/35/36 comparison against the `b43fa4e3` mutant (pre-fix, ungated) tree and got
**byte-identical ink at every one of d=34/35/36, pre vs. post** (1181.06/1181.06/1041.61 both
trees, addLayer rig). That proves `MK_BAND_ONSET_D=35` sits exactly where the **pre-existing,
ungated** mechanism already had its own natural ceiling — the gate is provably a no-op at and past
35 on the actual pre-fix tree, not merely by construction of the new code. 35 is not a round number
chosen for convenience; it is where the untouched mechanism already was.

**Is total ink continuous at the threshold?** At d=34→35: **yes**, 0.00% (addLayer) / 0.05%
(create) — both reproduced independently, matching the report. **At d=35→36: no** — an 11.8% drop
(1181.06→1041.61mm, addLayer) — but this is **not attributable to T3b**: the identical drop occurs
on the pre-fix mutant tree at the identical densities (1181.06→1041.61mm there too), because d=36
is past `MK_BAND_ONSET_D` where `bandOnsetCap` is a byte-identical no-op — this is T4's own natural
bandMax ceiling stepping from 6 to 5, present before T3b existed and untouched by it. The report's
own "largest internal ramp step" disclosure (d=4→5, 59–76%) is the honestly-scoped one; I found no
larger step that IS attributable to this unit's own gate.

**Verdict: MET**, both sub-questions answered with independently reproduced numbers.

## Condition 3 — orchestrator picture flag (ruling)

**Confirmed by eye, and now also by an independent number — but not caused or worsened by T3b, the
same shape of finding as T3-review.md's own condition 2.**

Looked directly (Read tool, full images) at the implementer's own before/after crops
(`after/T3b/sphere-low-before-after.png`, `sphere-low-crop3x-before-after.png`,
`torus-low-before-after.png`) plus the file-level-identical med/max shots (spot-checked
`sphere__hatch__mkDashRamp__med__a.webp` and `torus__...__max__a.webp` against T3's own copies —
`md5` **byte-identical files**, not just equal geometry). **What I saw:** BEFORE shows thick
bundles of 4–8 parallel hairlines that start/stop together, reading as disconnected ribbon
segments — the pre-T3b "tile" defect. AFTER shows single clean curving strokes — the bundle/tile
reading is genuinely gone. But the AFTER strokes are mostly long and continuous, broken only by
occasional small gaps — several rows run most of their visible arc unbroken. This is a legitimate,
literal match to the task's own description: **it reads as broken rulings more than as a
sparse-dash texture.**

**Quantified** (create rig, sphere/hatch/mkDashRamp, a duty-cycle proxy — `drawnSum/askSum` from
`lastMarkStats`, i.e. how much of each dash's own walked target it actually filled — independently
built, not a field the shipped test reads):

| d | rows | marks | duty proxy (post-fix) | duty proxy (pre-fix mutant) |
|---|---|---|---|---|
| 1 | 6 | 52 | 0.9395 | 0.9429 |
| 5 | 8 | 83 | 0.9555 | 0.9562 |
| 10 | 8 | 83 | 0.9555 | 0.9562 |

Each dash fills ~94–96% of the room available to it at every one of d=1/5/10 — this is the
numeric signature of "runs most of a row with small gaps," confirming the visual read. **Critically,
this duty-cycle proxy is virtually unchanged between the pre-fix and post-fix trees (Δ ≤ 0.7
percentage points at every density, same direction as ordinary noise)** — it is governed by the
dash-ramp's own period/response-curve mechanism (`mkAsk`, row pitch, `walkPoly`'s target-seeking),
which T3b's diff never touches (T3b only changed `bandN`/`capOf`'s pass-count cap, never the
per-mark walk target or period). This is architecturally consistent with the finding under
Condition 1: the two mechanisms are decoupled, so it is unsurprising the duty cycle survived the
fix unmoved.

**Ruling: this satisfies decision 12=B as literally stated** — "draw single-pass dashes below a
density threshold, keeping the band mechanism where it earns its keep" is exactly what shipped, and
the multi-pass TILE reading (the thing decision 12 was actually about — `SESSION-SUMMARY.md` §4
item 12's own text and `T3-review.md`'s condition 2, both scoped to the BUNDLE, not the duty cycle)
is gone. The "broken rulings, not discrete dashes" character is real, is confirmed, but is a
**different, pre-existing, unmoved mechanism** — a legitimate candidate for a follow-up (**T3c:
bound dash length at low density so dashes stay discrete**, exactly the task's own suggestion).
**I agree with the task's own steer: this does NOT block the merge.** It is a further preference on
top of a decision that has already been delivered as specified, not a regression this unit
introduced or a failure to meet the acceptance bar it was given.

## Condition 4 — d=50/d=220 byte-identity, T4b floor/ceiling, G4, mktick-*

- **d=50 (O8's checkpoint) and d=220, both primitives, both rigs:** byte-identical, reproduced
  independently (md5 of `generate()`'s own path output, mutant vs. current) — matches
  `non_regression_d50_d220` in `report.json` to the exact mm figure at every cell I checked.
- **T4b's own guard** (`scene3d-mkdashramp-dark-end.test.js`): **4/4**, unchanged, rerun clean in
  the gitclone.
- **`scene3d-mark-laws-draw.test.js` (includes G4 and O8):** **30/30**, unchanged count from T4's
  own 30/30, rerun clean.
- **mktick-\* untouched:** `scene3d-mktick-wedge.test.js` **58/58** and `scene3d-mktick-runaway.test.js`
  **37/37** both rerun clean in the gitclone (37/37 was named in the brief's "must not move" list
  but is absent from the implementer's own guard table — a minor reporting omission, not a defect,
  since it does pass). The diff itself (read in full) never touches any `law.shape === 'tick'`
  branch, `MK_TICK_STEP_CAP_MM`, or any file other than `surface-fill.js`'s two `bandN` sites and
  the new test file — tick code is untouched by construction, not merely by test result.

**Verdict: MET.**

## Condition 5 — roster md5 sweep, `## Bars changed`, lane baseline

**Reachable roster (4/4: `mkDotScreen`, `mkTick`, `mkScribble`, `ladder`) swept on BOTH rigs, 0
mismatches:**
- addLayer rig: shipped in the test file itself, 24 cells, reproduced in my own 20/20 run.
- create rig: the implementer's own report says this was a throwaway spec, written/run/deleted, not
  persisted. I independently rebuilt the same sweep (24 cells: 4 laws × 2 primitives × 3 densities,
  create rig) from scratch as my own throwaway spec — **24/24 md5-identical, 0 mismatches** — then
  deleted it. Combined: **48/48 cells, 0 mismatches**, both rigs, independently confirmed rather
  than trusted from the report's prose.

**`## Bars changed`:** report states "None to any existing test." Confirmed by the diff itself —
only `surface-fill.js` and the new test file are touched (`git diff --stat` shows exactly 2 files);
no existing threshold, tolerance, population, or fingerprint in any other file moved. Accurate.

**Lane baseline, all rerun clean in the gitclone:** `scene3d-ribbon-f1b-streaks.test.js` **44/44**,
`scene3d-ribbon-wall-coverage.test.js` **36/36**, `scene3d-ribbon-width-bar.test.js` **10/10**,
`scene3d-ribbon-width-create-rig.test.js` **12/12**, `scene3d-mkdashramp-low-end.test.js` **13/13**,
`scene3d-mkdashramp-dark-end.test.js` **4/4** — all unchanged.

**Verdict: MET.**

## Condition 6 — pictures

Read the implementer's own composite crops directly (full images, not thumbnails):
- **`sphere-low-before-after.png`** (full-frame, d=1, both states): BEFORE — six curving rows, four
  of which fan into visibly separate 4–6-line bundles with sharp gaps between segments (the "tile"
  read). AFTER — the same six rows now read as single clean strokes with small internal gaps; no
  bundle, no tile, but several rows are close to unbroken across most of their visible length (the
  Condition 3 finding).
- **`sphere-low-crop3x-before-after.png`** (3× native crop, upper-left/darkest region): BEFORE — 3
  distinct bundles clearly resolve into 4–6 parallel hairlines each, unambiguous ribbon read. AFTER
  — 3 distinct single hairlines with real, visible gaps between segments; genuinely discrete at this
  zoom, though the segments are still long relative to their gaps.
- **`torus-low-before-after.png`** (full-frame, d=1): identical improvement in kind — BEFORE shows
  bundled multi-line bands on the torus rim, AFTER shows single clean curves.
- **med/max, both primitives, both rigs:** spot-checked two cells (`sphere__hatch__mkDashRamp__med__a.webp`,
  `torus__hatch__mkDashRamp__max__a.webp`) at the **file level** — `md5` byte-identical to T3's own
  copies, i.e. the pixels themselves never changed, not just the underlying geometry. Consistent
  with `bandOnsetCap` being a no-op at d≥35.

**Plainly:** the tile/bundle defect decision 12 targeted is gone in the pictures. The "broken
ruling" character described in Condition 3 is also visible in the same pictures, and is real, but
belongs to a mechanism this unit never touched.

## Follow-ups (non-blocking)

1. **T3c candidate** (from Condition 3, matching the task's own suggested framing): bound dash
   length relative to its own period at low density so dashes read as unambiguously discrete rather
   than "broken but mostly-continuous" rulings. Not caused or worsened by T3b (duty-cycle proxy
   moved ≤0.7 points, noise-level, between pre- and post-fix trees) — a further preference on top of
   a bar T3b already met, not a defect in this unit.
2. `scene3d-mktick-runaway.test.js` (37/37, confirmed passing, named in the brief's guard list) is
   missing from the implementer's own guard table in `T3b-impl.md` — cosmetic reporting gap only.
3. Worktree contention noted above (W-36e concurrent edit) — process hazard for the orchestrator,
   not a T3b defect.
4. Sequencing note, not a T3b defect: `LEDGER.md` shows T3b's lane brief specified strict order
   "T2-5 (P0) → T3b → W-36f," but `e60d102e`'s parent is `b43fa4e3` directly and `LEDGER.md` row 1
   still shows T2-5 as "P0, Opus planner STARTING" — T3b appears to have landed ahead of T2-5 in
   practice. This does not affect T3b's own correctness (its stated base sha is exactly what the
   diff's parent commit is), but the orchestrator may want to confirm the lane's actual execution
   order matches intent.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** All six conditions are met on their own terms. The mutation proof is
full-strength for O10 (the half this unit actually changes) and is a verified structural-independence
argument plus an untouched, independently-reproduced sibling proof for O11 — both disclosed, neither
hidden. The threshold (d=35) is measured, not round, confirmed by reproducing byte-identical ink at
d=34/35/36 on both the pre-fix and post-fix trees. d=50/d=220/G4/T4b/mktick-* territory is
untouched, confirmed independently. The orchestrator's picture flag is CONFIRMED as an accurate
description of the shipped pictures but, exactly as T3-review.md found for T3 itself, is proven
(quantitatively, via an independent duty-cycle measurement unchanged pre/post-fix) to be inherited
from a different, untouched mechanism, not caused or worsened by this unit — so it converts to a
follow-up (T3c), not a reject, matching the task's own stated view. Ship T3b as-is; carry T3c
forward as its own unit if Jay wants the dash/gap ratio tightened further.

REPORT docs/3d-audit/lane-reports/T3b-review.md — ACCEPT-WITH-FOLLOWUPS — bundle flag verified gone; broken-ruling flag confirmed but T4-inherited (duty proxy unchanged pre/post).
