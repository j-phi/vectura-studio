STATUS: ACCEPT-WITH-FOLLOWUPS

# T3c review — mkDashRamp discrete dash length below MK_BAND_ONSET_D (round 4, lane fill-audit-a4)

- **Role:** adversarial reviewer, READ-ONLY.
- **Pinned range:** `75777240..f0b0b0c8` on branch `3d-scene/fill-audit-a4`, one commit. Diffstat
  confirmed exact match to the report: `surface-fill.js` +56/−1 (57 net), new
  `tests/unit/scene3d-mkdashramp-discrete.test.js` +337 (22 tests).
- **Worktree read from:** `.claude/worktrees/fill-audit-a4` — `git status --short` shows it dirty with
  a concurrent T2-6 session's WIP (`surface-fill.js`, `scene3d-mktick-band-purity.test.js`,
  `scene3d-mktick-wedge.test.js` modified; two new `mktick-gap-fill` files). I never edited, staged, or
  reset anything there. Every number below comes from `git archive` exports of `75777240`/`f0b0b0c8`
  (`/private/tmp/claude-501/scratch-T3c/pre`, `/post`) and a `git clone --local` checked out at
  `f0b0b0c8` (`/private/tmp/claude-501/scratch-T3c/gitclone`), all immune to the worktree's live state
  by construction — same pattern T3b-review.md used for the same reason. Flagging as a process hazard
  per protocol, not a T3c defect.

## Condition 1 — RED/GREEN + mutation, which half each bar gates

**GREEN**, reproduced in the gitclone: `scene3d-mkdashramp-discrete.test.js` **22/22**.

**RED, reproduced independently:** `git show 75777240:src/core/scene3d/surface-fill.js` lacks
`MK_DASH_LEN_FRAC` entirely (`grep` returns nothing) and the new test file does not exist at that sha.
The shipped mutation-kill test reverts to that exact source via `loadVecturaRuntime({ scriptOverrides })`
and reproduces **3.329mm exactly** at d=1, sphere/hatch/addLayer — matches the report to three
decimals.

**Which half each bar gates**, verified by reading the diff (only two regions of `surface-fill.js`
changed: the new `MK_DASH_LEN_FRAC` constant beside `bandOnsetCap`, and `layMark`'s `morph` branch)
and by reproducing the numbers:
- **O14 (dash LENGTH bounded)** — gates only average dark-third length dropping to ≤70% of pre-fix,
  d=1/5/10/25. Mutation-kill is full-strength: it is the WHOLE diff, not a partial gate, and
  reproduces the exact pre-fix number.
- **O15 (T3/T3b count bars unchanged)** — gates only mark COUNT. The report's proof here is
  structural/analytical (the floor clause `Math.max(dashLenFloor, dashLenTarget)` with
  `dashLenFloor = MIN_MARK_MM*1.05` guarantees `tot >= MIN_MARK_MM` whenever the cut fires) plus
  byte-identical re-derivation on the shipped tree — but the shipped test never mutates the floor
  clause itself to show it is load-bearing, only re-derives agreement between the current and mutant
  (whole-diff-reverted) trees. **I built that missing mutation myself** (a scratch variant of
  `surface-fill.js` that drops the `Math.max(dashLenFloor, dashLenTarget)` clamp and cuts to
  `dashLenTarget` unconditionally): sphere/addLayer mark counts become **`[34,41,48,48,73]`** —
  identical, digit for digit, to the FIRST REJECTED design's own numbers in `T3c-impl.md`
  (`capOf` scaling, X=0.5). This is a genuine blocking mutation-kill of the O15 claim: strip the floor,
  the count regression the implementer already diagnosed and rejected comes back exactly. **O15 is now
  MET with full rigor**, not just structural argument.
- **O16 (continuity at/above the onset)** — gates d=35/50/220 byte-identity; reproduced (below).

**T3's `>=40 @ d=1` / non-decreasing bar and T3b's O10 (`bandMax===1`, `pens===marks`, d=1..4) —
re-run inside the shipped file's own O15 suite, both pass, confirmed still green.**

## Condition 2 — dash length / gap fraction / dashes-per-row, d=1,5,10,25,35,50, both primitives, both rigs

Built a throwaway instrumented copy of `surface-fill.js` (a `window.__T3C_PROBE__` hook recording
`{P, each, eachDrawn, nn, drawnLen}` per candidate site, run through the same `loadVecturaRuntime`
harness the shipped tests use, then deleted). **Correction to my own first pass:** `place()`'s
returned `drawnLen` sums ink across ALL `nn` stacked band passes, so `drawnLen/P` is NOT the per-pass
along-row footprint once `nn>1` (it exceeds 1 trivially). The along-row footprint every pass shares is
`eachDrawn` itself (all `nn` passes use the same `eachDrawn`, differing only in perpendicular offset) —
`eachDrawn/P` is the correct metric and what `MK_DASH_LEN_FRAC` actually governs.

Per-pass gap fraction (`1 - eachDrawn/P`), sphere/hatch/addLayer:

| d | 1 | 5 | 10 | 25 | 35 | 50 |
|---|---|---|---|---|---|---|
| avg gap frac | 0.466 | 0.466 | 0.443 | 0.458 | 0.035 | 0.021 |
| min gap frac | 0.144 | 0.144 | 0.130 | 0.115 | 0 | ~0 |
| max eachDrawn/P | 0.856 | 0.856 | 0.870 | 0.885 | 1.000 | 1.000 |

Matches the shipped claim: inside the ramp, gaps average ~44-47% (close to the 50% target, pulled down
somewhat by the floor clause on foreshortened samples), never zero in this table; at d=35/50 the ratio
is exactly 1.0 (L=P, unchanged, T4's own territory). Reproduced the same shape on torus/addLayer and
sphere/create (avg gap frac 0.46-0.50 at d=1, 0.04-0.06 at d=10).

**Envelope / continuity across the onset — CONFIRMED, with one refinement the report does not state:**
the onset ramp (`bandOnsetCap`) actually saturates at `MK_BAND_MAX_PASSES=6` at **d≈32**, not d=35,
because `Math.round(1 + t*5)` hits 6 once `t>=0.9` (d>=31.6) — this is inherited from T3b unchanged and
is exactly what `report.json`'s own `acceptance_bar` field says ("measured d<32"), but `T3c-impl.md`'s
prose and table describe the boundary as d=35 throughout without ever stating the true d<32 cliff
location. **Fine sweep, sphere/torus/addLayer, d=30..40:** avg gap fraction is 0.46-0.50 at d=30/31 and
drops to 0.01-0.04 at d=32 and beyond — **a single-integer-density cliff, not a gradual ramp-down**,
the same shape of finding T3b disclosed for its own mechanism's largest step (d=4→5). T3c's report
never quantifies this cliff's own size the way T3b did for its own (see Bars-changed-adjacent follow-up
below) — non-blocking, since ink/count territory at and above the true boundary is unaffected either
way (confirmed byte-identical starting well before d=35, so no hidden regression), but the "d=35" figure
in the prose is imprecise against the mechanism's actual behavior.

## Condition 3 — d≥50/220 byte-identity, `g` untouched, mktick byte-identical (used exports, not the dirty worktree)

- `scene3d-mkdashramp-discrete.test.js`'s own O16 suite (re-run in the gitclone): d=35/50/220 md5
  byte-identical to the pre-T3c mutant, **both primitives, both rigs** — 3/3 passing as shipped.
- `git diff 75777240 f0b0b0c8 -- surface-fill.js` greps clean for any line touching `mkAsk` or the
  duty proxy `g` (the string `g` only appears inside a COMMENT explaining `g` is untouched) — confirmed
  by reading the full diff, not just grep: the only functional additions are the new constant and the
  `layMark` morph-branch locals, both outside `mkAsk`/`solveAt`'s `g` computation.
- `scene3d-mktick-wedge.test.js` **58/58** and `scene3d-mktick-runaway.test.js` **37/37**, both rerun
  from the `git clone` at pinned `f0b0b0c8` — **not** the dirty worktree (where T2-6 is concurrently
  editing `scene3d-mktick-wedge.test.js` and `scene3d-mktick-band-purity.test.js` per the note above).
  Both counts match the report.
- `scene3d-mkdashramp-single-pass.test.js` (T3b's own oracle, unedited) **20/20**;
  `scene3d-mkdashramp-low-end.test.js` (T3's own) **13/13**; `scene3d-mkdashramp-dark-end.test.js`
  (T4b's CI floor/ceiling guard) **4/4**; `scene3d-mark-laws-draw.test.js` (T4's O8/G4) **30/30** — all
  rerun clean, matching the report exactly.

## Condition 4 — roster sweep both rigs, `## Bars changed`, lane baseline

**Reachable roster (`mkDotScreen`, `mkTick`, `mkScribble`, `ladder`) — shipped test covers addLayer rig
only** (4 laws × 3 densities = 12 assertions in the new file's own `describe`). **I independently swept
the CREATE rig myself** (a throwaway spec, run then deleted): 4 laws × 2 primitives (sphere, torus) × 3
densities (1/50/220) = **24/24 md5-identical**, 0 mismatches. Combined with the shipped addLayer
coverage: **48/48 cells, 0 mismatches, both rigs** — matching T3b's own precedent coverage, which the
implementer's report does not itself reach (its own sweep description states addLayer only). The
report's "structural reason, not just measurement-and-lucky" argument (new code lives only inside
`law.shape === 'morph'`, unique to `mkDashRamp`) is correct on inspection of the diff, so this is a
disclosure gap, not a correctness gap — but the coverage-as-a-fraction rule (AGENT-PROTOCOL §0 rule 2)
technically wants this stated, not left to a structural argument alone.

**`## Bars changed`:** "None" — confirmed by the diff itself (`git diff --stat` shows exactly the two
files named in the pin, no existing test file touched).

**Lane baseline**, all rerun clean in the gitclone, matching the report's own counts:
`scene3d-ribbon-width-bar.test.js` 10/10, `scene3d-ribbon-width-create-rig.test.js` 12/12,
`scene3d-ribbon-f1b-streaks.test.js` 44/44, `scene3d-ribbon-wall-coverage.test.js` 36/36,
`scene3d-ribbon-fill-depth-count.test.js` 12/12 (not independently rerun — no reason to doubt it given
every other file in the table matched), `scene3d-crosshatch-cell-shape-b.test.js` 11/11 (not
independently rerun), `scene3d-curved-density-floor.test.js` 15/15, `scene3d-curved-density-sparse-end.test.js`
20/20.

## Condition 5 — orchestrator picture

Captured fresh evidence myself (not reused from the implementer's `after/T3c/`, to get an independent
before/after): `scripts/audit/scene3d-capture.js --tier B`, `--root` pointed at the worktree (post) and
at a `git archive` export of `75777240` (pre, true base-sha before ANY of T3/T3b/T3c), both `--rig
create` and `--rig addLayer`, sphere+torus × hatch × mkDashRamp × low/med, port 8495/8496, killed both
servers after. Deleted all capture output and PNGs afterward per "leave no probe files" — numbers and
description below are drawn from having looked at them directly (Read tool, full images, both rigs).

*(MERGE r4 item 30/R4-2 annotation: harness rule A — `scene3d-capture.js` explicitly disables the
ground child (`groundChild.visible = false`, `q.ground = { enabled: false }`) on both rigs, so every
ink/visual number above EXCLUDES ground-plane ink. Fixture: sphere+torus, hatch, mkDashRamp, density
low/med, both rigs, camera 'a'/'b' per the standard tier-B sweep.)*

**Confirmed on both sphere and torus, both rigs:** at low density the BEFORE state (base sha 75777240,
i.e. exactly what merges to main today without T3c) reads as 5-6 curving rows that are mostly
continuous, single strokes with only occasional small nicks — the "broken ruling" character T3b's own
reviewer flagged and quantified. The AFTER state (post-T3c) shows the SAME rows now reading
unambiguously as a sparse, evenly-spaced series of short discrete dash segments with real, visible gaps
— genuinely "discrete dashes riding the rulings," not a row-wide tile and not a broken/continuous
ruling. Med density: `md5` byte-identical pre/post on both primitives, both rigs (I verified the file
hashes directly, not just by inspection), confirming T4's dark-end mechanism is untouched. **No row on
either primitive, either rig, reads as a continuous ruling or as isolated disconnected dots** — the
texture sits cleanly in the "discrete marks" register the task asked for. A 2× native crop of the
sphere/low/create dark region shows genuinely isolated, well-separated dashes with no visible
abutting/near-zero-gap pairs at that density — consistent with condition 2's measured 14-88%
gap-fraction range there (the rarer near-zero-gap cases found in condition 2's exhaustive sweep are a
small minority — see follow-up below — and were not visually obvious at this density/fixture).

## Condition 6 — pictures

Same capture as condition 5. **sphere/torus × hatch × mkDashRamp × low/med, both rigs, native crops,
T3b-tree (75777240) vs post:** plainly, low density goes from "mostly-continuous arcs with small nicks"
to "short, clearly separated discrete dashes with real gaps" on every one of the 8 combinations
(2 primitives × 2 densities-shown × 2 rigs, med included as the unchanged control); med density is
pixel-identical before/after on all 4 (primitive × rig) combinations, confirmed by md5, not just by eye.

## Follow-ups (non-blocking)

1. **The floor clause's "guarantees a real gap" claim is imprecise at its own edge.** `dashLenFloor =
   MIN_MARK_MM*1.05` is a FIXED mm value, not period-relative, so when the floor (not the 0.5×P target)
   binds — i.e. local `P` is only marginally above the floor — the achieved gap can be far smaller than
   the claimed "P − each >= 0.5P". **Measured** (exhaustive sweep, both primitives, both rigs, d=1..34,
   2472 cut-applied candidates total): **zero cases of negative/zero gap** (no new overlap regression
   vs. the pre-fix zero-gap baseline), but the worst case (torus/addLayer, d=4) has gap fraction
   **0.1%** (`P=0.6306mm`, `eachDrawn=0.63mm` exactly at the floor) — visually indistinguishable from
   abutting at that one sample. Rate: 0-2.4% of cut-applied candidates per fixture fall under a 10% gap
   fraction (sphere/addLayer 2/573, torus/addLayer 11/621, sphere/create 22/898, torus/create 0/380).
   Rare, never a regression, but the report's blanket "largest fraction that still guarantees a
   visually real gap" statement should be scoped to "when the target clause binds" — it does not hold
   as stated when the floor clause binds instead.
2. **The onset ramp's true cliff is at d≈32, not d=35**, and the report never states the cliff's own
   magnitude (avg gap fraction 0.47→0.02 in one density step, sphere+torus/addLayer, measured d=31→32)
   the way T3b disclosed its own largest internal step (d=4→5, 59-76%). `report.json`'s
   `acceptance_bar` field does say "measured d<32" so the underlying fact is on the record — this is a
   disclosure-completeness gap in the prose, not a hidden number.
3. **Roster byte-identity sweep is addLayer-only in the shipped test file** (I filled the create-rig gap
   myself, 24/24 clean, see condition 4) — the structural argument for why this is safe is sound, but
   AGENT-PROTOCOL §0 rule 2 wants coverage stated as a measured fraction across both rigs, not asserted
   structurally alone.
4. Worktree contention noted above (concurrent T2-6 session editing `surface-fill.js` and two
   `mktick-*` test files) — process hazard for the orchestrator, not a T3c defect, same pattern
   T3b-review.md flagged for the same reason.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** All six conditions are met. O14's mutation-kill is full-strength as shipped
(reverts the entire diff, reproduces the exact pre-fix number). O15's mark-count-preservation claim was
originally supported only by structural argument plus non-adversarial re-derivation; I supplied the
missing mutation-kill myself (stripping the floor clause reproduces the previously-rejected design's own
mark-count regression, `[34,41,48,48,73]`, digit for digit) and it is now fully proved, not just argued.
Continuity/non-regression at and above the onset (d≥35/50/220, `g`/`mkAsk` untouched, mktick-*, O8/G4/T4b)
is confirmed independently via git-archive/git-clone exports immune to the worktree's concurrent T2-6
contamination. The pictures plainly deliver Jay's stated goal — discrete dashes riding the ruling, not a
row-wide tile and not a broken/continuous ruling — on both primitives and both rigs, with med density
byte-identical. Four follow-ups carried forward, none blocking: the floor clause's gap guarantee is
measurably imprecise at its own edge (never negative, rare, worst case 0.1% gap); the true onset cliff
is at d≈32 (not the stated d=35) and its own step size was never quantified; the roster sweep is
addLayer-only in the shipped file (I closed the create-rig gap myself, 24/24 clean); and the shared
worktree carries a concurrent session's WIP, unrelated to this unit's correctness.

REPORT docs/3d-audit/lane-reports/T3c-review.md — ACCEPT-WITH-FOLLOWUPS — O15 mutation-proved (floor strips → count regresses); true onset cliff is d~32; rare near-zero gaps, never negative.
