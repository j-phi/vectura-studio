STATUS: ACCEPT

# W-36b — adversarial review

Reviewer, read-only. Worktree under review: `.claude/worktrees/fill-audit-a2` (W-31 implementer
editing it live throughout this review — never read after the initial archive). Pinned range
`c6ff81de..716b435b`, commit `716b435b`. All verification below was performed in scratch
`git archive` exports (`/private/tmp/.../scratchpad/scratch-W36b/{pre,post,mutant}`, symlinked
`node_modules`), foreground, one file at a time, per `AGENT-PROTOCOL.md` §Reviewers. The worktree
itself was never edited, stashed, or read after the two initial `git archive` pulls; a final
`git status --short -- . ':!graphify-out'` on the worktree was empty. All scratch dirs (including
the mutation copy) were deleted at the end of this review.

## (1) Only the one test file changed; hatch/byte-identity sub-tests byte-identical

`git diff --stat c6ff81de..716b435b -- . ':!graphify-out' ':!node_modules'` in the worktree:
**one file** — `tests/unit/scene3d-hatch-density-angle-stable.test.js` (76 insertions / 7 deletions).
No `src/` file touched; single commit in the range (`716b435b`).

Full `diff -u` between the `pre` and `post` archive copies of that file shows exactly: (a) a new
dated file-header paragraph explaining the re-expression and citing `W-36-review.md` §(5); (b) a
new `SurfaceFill` binding + `rawFamilyRuns` helper added inside `describe`; (c) the crosshatch
sub-test body replaced (combined `meanBearing` → per-family `bA`/`bB` measured from raw runs). The
**hatch** sub-test and the **BYTE-IDENTITY GUARD** test do not appear anywhere in the diff —
confirmed byte-identical between `c6ff81de` and `716b435b` (a diff that changed them would show
hunks touching those blocks; it does not). `TOLERANCE_DEG = 3` line is untouched at both ends
(grep confirms one occurrence per file, value `3`, referenced by all three per-primitive assertions
post-change).

## (2) 2/9 fail at c6ff81de, 9/9 pass at 716b435b, tolerance still 3°

Ran the unmodified file in the `pre` export: **9 tests | 2 failed | 7 passed**.
- `sphere > crosshatch`: `expected 3.703198892232293 to be less than 3`
- `cone > crosshatch`: `expected 3.816938074679058 to be less than 3`

Exact digit match to the impl report and to W-36-review.md §(5). Ran the changed file in the
`post` export: **9/9 passed**. `TOLERANCE_DEG` is `3` in both files (grep-confirmed) — no widening.

## (3) Mutation reproduced: trips per-family test, OLD combined test fails for the wrong reason (or not at all)

Built a `mutant` export (full `716b435b` archive) and applied, to the scratch copy only, the exact
mutation the implementer describes at `src/core/scene3d/surface-fill.js:11097`:

```
- else emitContFamily('angle', aB, Math.max(2, Math.round(count / crossRatio)), back, crossShareB);
+ else emitContFamily('angle', aB + (count * 0.05), Math.max(2, Math.round(count / crossRatio)), back, crossShareB);
```

Ran the **NEW per-family test** (from `716b435b`) against the mutated source:

| primitive | NEW per-family test |
|---|---|
| sphere | **FAIL** — gap 3.471615664848798° (>3) |
| cylinder | **FAIL** — gap 4.597006449664548° (>3) |
| cone | **FAIL** — gap 4.381733710548787° (>3) |
| torus | PASS (mutated branch not reached — on-axis code path) |

Ran the **OLD combined test** (copied verbatim from the `pre`/`c6ff81de` export into
`mutant/tests/unit-old/`, unmodified) against the *same* mutated source:

| primitive | OLD combined test |
|---|---|
| sphere | **PASS** — mutation NOT caught |
| cylinder | **FAIL** — gap 27.411561668282786° (~6x the actual per-family shift) |
| cone | **FAIL** — gap 4.8601439076158215° (comparable magnitude) |
| torus | PASS (same reason) |

Both digits match the impl report to the decimal (it reported "3.472°/4.597°/4.382°" and
"27.412°/4.860°"). This reproduces both requested outcomes: sphere is the clean "old test misses a
real per-family defect via near-50/50 cancellation" case, and cylinder is the "old metric trips but
at an uncalibrated, non-diagnostic magnitude" case. The new per-family test catches the injected
defect directly and at a magnitude representative of the actual per-family shift on every primitive
where the mutated branch is reached.

## (4) Family discriminator is a structural tag, not an angle heuristic

Wrote an independent probe (own script, scratch-only) reusing the target file's own `scene`/
`CURVED` fixtures, wrapping `SurfaceFill.buildObject` exactly as `rawFamilyRuns` does, and dumping
the distinct `.fam` values seen per primitive at Density 50 and 150. Result for all four
primitives, both densities: **`.fam` values are literal string tags `"A#0"` / `"A#1"`** — assigned
structurally by the source (not derived from rendered angle), and first-appearance order equals
`Array.from(new Set(...)).sort()` order in every case (`["A#0","A#1"] === ["A#0","A#1"]`). This is
the same `.fam` discriminator `scene3d-crosshatch-parity.test.js` (W-36's own test) uses
(`front.map((r) => r.fam)`, sorted there vs. first-appearance here — provably equivalent given the
tags are literal, order-independent strings). There is no risk of mis-assignment near a 45° fill
angle: the tag is set at construction time from which structural role (`'a'`/`'b'`) built the run,
never computed from the run's own bearing.

## (5) `## Bars changed` — metric changed, tolerance unchanged

Confirmed by direct diff (condition 1) and by the report's own text: "None. `TOLERANCE_DEG = 3`
... is untouched — the metric changed (combined ink-weighted vector average of both crosshatch
families -> two separate per-family bearing-gap assertions), the tolerance did not." Independently
verified: `TOLERANCE_DEG = 3` present, unchanged, in both `pre` and `post` exports; no other
numeric threshold, count bar, or fingerprint touched anywhere in the diff.

## Overall verdict

All five conditions independently reproduced to the digit. Scope is exactly as claimed
(tests-only, one file, hatch/byte-identity sub-tests untouched), the RED/GREEN proof is exact, the
mutation check cleanly demonstrates the combined metric is the flawed instrument (not a moved
direction field) on both the "silently passes" and "trips but miscalibrated" axes, the family split
uses a structural tag identical in kind to W-36's own parity test (no angle-heuristic risk near
45°), and the bars-changed disclosure is accurate (metric re-expressed, tolerance untouched, no
widening). No vacuous-pass guard, no widened tolerance, no unproven fingerprint re-pin found.

Open item carried forward from the impl report, not this unit's to fix: 3 pre-existing failures in
`scene3d-curved-crosshatch-controls.test.js` (unrelated string-equality truncation issue, confirmed
by worktree diff to not touch this unit's file) — needs an orchestrator decision on ownership.

Scratch dirs (`pre`, `post`, `mutant`, and the probe test file written only inside the scratch
`post` copy) deleted in full at the end of this review; nothing was left in any worktree.
