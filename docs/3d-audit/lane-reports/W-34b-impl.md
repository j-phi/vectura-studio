STATUS: DONE

# W-34b — fix the `coneCrossSectionWorld` closing-point construction bug (implementer report)

Test-only follow-up from `W-34-review.md` §3 (Required follow-up). Lane: fill-audit-d2. Worktree:
`.claude/worktrees/fill-audit-d2` (branch `3d-scene/fill-audit-d2`), port 8481. Base sha: `fe491dfa`
(W-34, unchanged — this unit does not touch `src/`). New sha: see commit below.

## 1. The bug (as identified by the reviewer)

`coneCrossSectionWorld` in `tests/unit/scene3d-contour-slice-corners.test.js` assembled the cone's
analytic cross-section as base(+x) → vertex → base(−x), then appended a trailing closing point
(`.concat([{...pts[0]}])`). For the **capsule** helper this is correct — a capsule's cross-section
has no flat rim, so the mirror's last point already coincides with `pts[0]` by construction. For the
**cone**, it is wrong: the cone has a flat base disk, so the lateral-surface cross-section is a
genuinely **open** arc (the two base-rim endpoints, at +x and −x on the base circle, are real,
distinct points connected only by the undrawn base rim — not by the lateral surface this curve
traces). Appending the closing point made `isClosedRun`/`turnOverArc` treat the curve as closed and
evaluate a synthetic wrap-around window across the ~36 mm base chord, landing on a real-but-unrelated
feature (the base/lateral dihedral edge) and inflating T2's cone ceiling from a correct ~76–77°/mm to
the shipped 141.56°/mm.

## 2. Fix

`tests/unit/scene3d-contour-slice-corners.test.js` — `coneCrossSectionWorld` only: removed
`.concat([{ ...pts[0] }])`, now returns `pts.concat(mirrored)` (open polyline). Added an explanatory
comment in place. `capsuleCrossSectionWorld` was **not touched**.

## 3. RGR proof

**Cone ceiling, before → after (camera a, measured live in the worktree):**

| | analytic ceiling (real planes) | emitted worst | assertion (`emittedWorst <= ceiling + 1`) |
|---|---|---|---|
| before (buggy, closed) | **141.56°/mm** | 76.41°/mm | pass (vacuously loose) |
| after (fixed, open) | **76.18°/mm** | 76.41°/mm | pass (76.41 ≤ 77.18 — tight, correct) |

76.18°/mm matches the reviewer's independent reconstruction (`W-34-review.md` §3: "76.18°/mm max vs.
the plan's 76.4°/mm") and the plan's own truth-ladder value (76.4°/mm) to within numerical/resampling
noise.

**Capsule, before vs. after — proven bit-identical, as the reviewer claimed:**

| | analytic worst (real planes) | emitted worst | excess |
|---|---|---|---|
| before | 8.165858041455296°/mm | 8.37451752353217°/mm | 2.555267076865406% |
| after | 8.165858041455296°/mm | 8.37451752353217°/mm | 2.555267076865406% |

Identical to the last printed digit — the capsule helper's append was, as the reviewer proved, a
no-op there.

**Item (3) — mutation proof, in a scratch export (not the worktree).** `git -C
.claude/worktrees/fill-audit-d2 archive fe491dfa | tar -x -C /private/tmp/claude-501/scratch-W34b`,
`node_modules` symlinked to the worktree. Copied the corrected test file into the scratch export
(src `scene3d.js` untouched — this is a test-only fix). Confirmed the T2 cone assertion still passes
there with the corrected ceiling (76.41 ≤ 77.18, identical to the worktree run above).

Then, in a scratch-only `describe` block (added to the scratch copy only, never committed), took the
real emitted worst-M2 cone ring, found its worst-turn vertex, and perturbed the adjacent point by
0.35 mm along the local normal — simulating a future regression that invents a small near-apex
corner. Result:

```
W-34b mutation proof: newCeiling(+1)=77.18, oldCeiling(+1)=142.56
W-34b mutation proof: pre-mutation worst=76.41, mutated=122.97
```

**122.97°/mm trips the corrected ceiling (77.18) but would NOT have tripped the old inflated one
(142.56).** This proves the corrected T2 assertion has real regression-catching power that the
pre-W-34b version lacked, exactly as the review's follow-up asked. Scratch export deleted after use.

## 4. Guards — foreground, one file at a time, never backgrounded

| suite | result |
|---|---|
| `tests/unit/scene3d-contour-slice-corners.test.js` | **25/25** |
| `tests/unit/scene3d-contour-slice.test.js` | **57/57** |

## 5. Evidence re-shoot

**None.** This unit changes only a test-helper's analytic-truth construction; it does not touch
`src/` or any rendering path. No pixel this project emits changed. `git diff --stat -- src/` is empty
(confirmed above).

## 6. `## Bars changed`

| file:line | old | new | why |
|---|---|---|---|
| `tests/unit/scene3d-contour-slice-corners.test.js` — `coneCrossSectionWorld` (T2's cone analytic-truth helper, formerly ending `.concat([{...pts[0]}])`) | T2 cone ceiling effectively **141.56°/mm** (`analyticCeiling + 1` = 142.56) | T2 cone ceiling effectively **76.18°/mm** (`analyticCeiling + 1` = 77.18) | **CORRECTION**, not a widening or re-pin of a pinned literal — the ceiling was always computed dynamically from this helper at test-run time, never a hardcoded constant. The helper had a construction bug (closing a genuinely open arc) that the reviewer identified and proved with independent reconstruction (`W-34-review.md` §3: capsule bit-identical 8.166°/mm with/without the append; cone truth 76.18°/mm without it, matching the plan's 76.4°/mm). This report reproduces both proofs independently (§3 above) and additionally proves, via a scratch-export mutation (§3, item 3), that the corrected bar catches a synthetic near-apex corner (122.97°/mm) the old inflated bar would have missed (122.97 < 142.56). Net effect: **tightens** T2's cone regression protection from "up to ~140°/mm of invented interior corner would pass undetected" to "up to ~77°/mm" — a real narrowing of the gap the reviewer flagged, not a loosening. |

No other bar, tolerance, count ceiling, or pinned fingerprint was touched. `capsuleCrossSectionWorld`
is byte-identical (not edited); its ceiling/excess numbers are unchanged (§3).

## 7. Commit

Worktree `fill-audit-d2`, one file staged: `tests/unit/scene3d-contour-slice-corners.test.js`. No
version bump (worktree, tests-only, per protocol). Not pushed.

## 8. Open items

None new. The review's only follow-up for this unit is closed. Fix C (cone apex-band level warping,
needs Jay) and W-35 (stair-step ends) remain as filed in `W-34-impl.md` §10 — untouched by this unit.

REPORT docs/3d-audit/lane-reports/W-34b-impl.md
