STATUS: ACCEPT

# W-34b review — `coneCrossSectionWorld` closing-point construction bug fix (tests-only)

Reviewer, read-only. Worktree `.claude/worktrees/fill-audit-d2` (branch `3d-scene/fill-audit-d2`),
pinned range `fe491dfa..6dcc308f` (single commit `6dcc308f`). All measurement done in scratch
`git archive` exports under `/private/tmp/claude-501/.../scratchpad/W34b-pre` (`fe491dfa`) and
`W34b-post` (`6dcc308f`), `node_modules` symlinked to the worktree, deleted at the end of this
review. No worktree or main-checkout file was edited, stashed, or deleted.

## 1. No `src/` change in the range — confirmed

`git -C <worktree> status --short -- . ':!graphify-out'` empty; `git stash list` shows only
unrelated pre-existing stashes; `git log --oneline fe491dfa..6dcc308f` = exactly one commit
(`6dcc308f`); `git diff --stat fe491dfa..6dcc308f` touches exactly one file,
`tests/unit/scene3d-contour-slice-corners.test.js` (+13/-2); `git diff --stat fe491dfa..6dcc308f
-- src/` is empty. The diff itself is exactly the claimed change: `coneCrossSectionWorld` drops
`.concat([{ ...pts[0] }])` (now returns `pts.concat(mirrored)`, an open polyline) with an
explanatory comment added; `capsuleCrossSectionWorld` is untouched (confirmed by reading the full
diff — no hunk touches it).

## 2. Cone ceiling at `6dcc308f` = 76.18°/mm; capsule bit-identical to `fe491dfa`

Ran `tests/unit/scene3d-contour-slice-corners.test.js` foreground
(`--pool=forks --poolOptions.forks.singleFork=true`) in the `W34b-post` scratch export:
**25/25 pass**. Console output, my own run:

```
W-34 T2 M2 cone/a: emitted worst=76.41, analytic ceiling (real planes)=76.18
W-34 T3 RESULT {"emittedWorst":8.37451752353217,"analyticWorst":8.165858041455296,"excessPct":2.555267076865406}
```

76.18°/mm matches the impl's claim exactly. Then ran the **same unmodified test file** in the
`W34b-pre` scratch export (`fe491dfa`, pre-fix): also 25/25 pass, and:

```
W-34 T2 M2 cone/a: emitted worst=76.41, analytic ceiling (real planes)=141.56
W-34 T3 RESULT {"emittedWorst":8.37451752353217,"analyticWorst":8.165858041455296,"excessPct":2.555267076865406}
```

The T3 capsule numbers are **identical to the last printed digit** between `fe491dfa` and
`6dcc308f` (8.37451752353217 / 8.165858041455296 / 2.555267076865406% both times) — independently
proves `capsuleCrossSectionWorld`'s append was a no-op there, exactly as claimed. Cone ceiling
moved 141.56 -> 76.18 as claimed; emitted worst (76.41) is unchanged by the test-file edit (it
comes from `src/`, which did not change).

## 3. Mutation proof — the point of the unit, reproduced independently

Built a standalone Node script (not committed anywhere, not a probe file left in any worktree —
lived only under my scratch dir, deleted after use) reusing the shipped M1/M2/`turnOverArc`/
`isClosedRun`/`resampleByArc` logic verbatim, plus both forms of `coneCrossSectionWorld` (closed
and open), to compute both ceilings independently of the impl's own reported number, and to apply
my own mutation (deliberately different from the impl's, to avoid rubber-stamping their exact
perturbation): took the real emitted cone rings (`algo.generate` via the same `genFor` rig), found
each ring's device-space topmost ("near-apex" surrogate) vertex, and displaced it 0.35mm along the
local edge normal.

Run against **both** scratch exports (src/ identical in both, so results were expected — and were
observed — to match):

```
W-34b REVIEWER MUTATION PROOF (W34b-post, 6dcc308f)
  openCeiling: 76.18, closedCeiling: 141.56
  preMutationWorst: 76.41, mutatedWorst: 135.60
  tripsOpenCeilingPlus1 (77.18): true
  tripsClosedCeilingPlus1 (142.56): false

W-34b REVIEWER MUTATION PROOF (W34b-pre, fe491dfa)
  openCeiling: 76.18, closedCeiling: 141.56
  preMutationWorst: 76.41, mutatedWorst: 135.60
  tripsOpenCeilingPlus1 (77.18): true
  tripsClosedCeilingPlus1 (142.56): false
```

**135.60°/mm trips the corrected ceiling (76.18 + 1 = 77.18) but does NOT trip the inflated
pre-fix ceiling (141.56 + 1 = 142.56).** This is an independent reconstruction of the impl's own
proof (they measured 122.97 vs. the same two ceilings, using a different perturbation site) —
different exact number, same qualitative result: the corrected ceiling has real regression-catching
power that the pre-fix ceiling lacked. A corrected ceiling that still cannot fail would be a guard
in name only; this one demonstrably can.

## 4. `## Bars changed` — audited, nothing else moved

The impl report's `## Bars changed` table lists exactly one entry: T2's cone ceiling,
141.56°/mm -> 76.18°/mm, labeled a **CORRECTION** (not a widening/re-pin), with the reviewer's
(this lane's own prior `W-34-review.md` §3) proof cited and the impl's own independent
reproduction plus the mutation proof as additional support. This matches what I verified in §§2-3
above. The single-file, 13-insertion/2-deletion diff (§1) rules out any other bar, tolerance, or
pinned fingerprint having moved — there is no other hunk in the range to hide one in.

## 5. Guard counts reproduced

- `tests/unit/scene3d-contour-slice-corners.test.js` at `6dcc308f`: **25/25 pass** (my own run,
  §2), matching the claimed 25/25.
- `tests/unit/scene3d-contour-slice.test.js` at `6dcc308f`: **57/57 pass** (my own run, foreground,
  singleFork), matching the claimed 57/57.

## 6. Evidence re-shoot

None expected and none needed — `src/` is unmodified in this range (§1), so no pixel this project
emits changed. The impl's report correctly states "None" for this unit.

## Verdict

**ACCEPT.** Construction-bug fix is scoped exactly as claimed (cone helper only, capsule
untouched), the corrected ceiling number (76.18°/mm) and capsule bit-identical claim are both
independently reproduced to the same digits, the `## Bars changed` disclosure is complete and
accurate, and — the actual point of a tests-only "fix the oracle" unit — an independently
constructed mutation proof confirms the corrected ceiling now has real regression-catching power
that the pre-fix ceiling lacked. No vacuous-pass guard, no widened tolerance, no undisclosed bar
change, no single-pipeline/single-zoom evidence gap (none applicable — no pixels changed).

REPORT docs/3d-audit/lane-reports/W-34b-review.md
