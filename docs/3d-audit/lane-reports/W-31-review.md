STATUS: ACCEPT

# W-31 — adversarial review

Reviewer, read-only in `.claude/worktrees/fill-audit-a2`, pinned range `716b435b..48ff98dc`. Scratch
export at `/private/tmp/claude-501/scratch-w31-review` (`git archive 716b435b`, symlinked `node_modules`),
deleted after measurement.

## (1) Zero source diff in the range

`git -C <worktree> diff --stat 716b435b..48ff98dc` shows exactly one file: `tests/unit/scene3d-crosshatch-cell-shape.test.js`,
370 insertions, 0 deletions, 0 other files. `git log --oneline 716b435b..48ff98dc` shows one commit
(`48ff98dc`). Worktree `git status --short -- . ':!graphify-out'` is clean at `48ff98dc`. **Confirmed —
matches the claim exactly.**

## (2) Reproduced the spike's failure numbers independently

Extracted the spike diff quoted verbatim in `W-31-impl.md`, applied it with `git apply --check` (clean)
to a scratch export of `716b435b`, confirmed `node -c` syntax-clean. Wrote a standalone probe script
(not the test file, to avoid the test's own early-exit assertions masking later numbers) reusing the
identical instrument (local perpendicular gap, window binning, interior box, column split) and ran it
directly against the spike-patched source for cylinder d=220 camera a:

| | col 0-.2 | col .2-.4 | col .4-.6 | col .6-.8 | col .8-1 |
|---|---|---|---|---|---|
| **measured, flat-tone, spike-patched** | 0.6358 | 1.0237 | 0.9919 | 1.1448 | 0.9396 |
| impl report claims (flat, spike) | 0.6357 | 1.0237 | 0.9919 | 1.1448 | 0.9396 |
| **measured, lit-rig, spike-patched** | 0.7749 | 0.8366 | 1.0593 | 0.9884 | 0.6575 |
| impl report claims (lit, spike) | 0.7749 | 0.8366 | 1.0593 | 0.9884 | 0.6575 |

Exact match to four decimal places on all ten values, plus `nA/nB` (52/59) and window count (39) also
matched exactly. Reverted the patch (`git apply -R`), confirmed `node -c` clean and the scratch tree
byte-identical to the pristine archive. **The spike numbers are real, not asserted.**

**Was the STOP honest, or was there a nearby parameter that would have cleared the gate?** The one
column that still fails on the flat-tone control (col 0-.2, n=2) has the thinnest sample count of the
five and sits at the interior box's own edge — exactly where the report's own lead names the residual
("the ruling's local clearance varies most"). I looked for a cheap knob that would flip it: shrinking the
interior box or the column split would move it, but that is explicitly forbidden by the plan's stop
condition 8 ("never shrink the INTERIOR box to move the out-fraction") and would be gaming the oracle,
not fixing the mechanism. There is no dial in the shipped (reverted) code that touches this — the fix
would require a second correction pass over `warpArr` (the report's own comparison to `contFieldAniso`'s
2-iteration fixed point), which is a mechanism change, not a parameter tweak. Independently, the lit-rig
result is *worse* than the flat one (3 of 5 columns fail, not 1), so even if col 0's flat-tone number were
argued away, the lit rig alone fails the gate. **The STOP reads as honest, not convenient** — the
implementer did not shop for a threshold or a rig variant that would pass.

## (3) The ceiling test's shape and framing

`CEILING` in the new test pins C1 (per-column cell-aspect medians) with `toBeCloseTo(col.aspect, 2)` —
an exact two-sided fingerprint (±0.005), not a floor/ceiling ±10% band. C2 (within-family spread) *is* a
proper one-sided ceiling (`toBeLessThanOrEqual(rec.spreadA + 0.05)`, catching only regression toward more
spread). This is a **minor shape deviation** from "floor/ceiling ±10% band" — C1 is stricter than a band
(it would also fail on an *improvement*), which is defensible for a measurement pin (any change to this
mechanism should be visible, and the plan explicitly reserves any deliberate re-pin for a `## Bars
changed` entry) but is worth naming since it is not literally the band shape. The file's header comment
(lines 3–76) is extensive and explicit that this is "a NON-REGRESSION CEILING at today's own numbers —
nothing tightened, nothing widened, no fix shipped," names the spike's exact failure numbers, and files
two follow-ups (W-31b, W-31c) rather than declaring victory. It reads as a measurement pin documenting a
known defect, not a claim of acceptability, even without that exact phrase appearing verbatim.

**Mutation check:** worsening the aspect trips it — already demonstrated directly in (2): applying the
(reverted) spike patch to the pristine base and re-running the committed test file fails immediately
(`expected 52 to be 57`, `nA` mismatch) before even reaching the column assertions, and a probe of the
column values shows all of them shifted. Any perturbation of the mechanism is caught.

## (4) Tone-OFF path, not tone-ON

`cellShapeStats(rec.prim, rec.d, rec.cam === 'b', true)` — the 4th positional arg is `flat`, and every
C1/C2 test call passes `true`. `sceneFor` sets `p.lights = flat ? [] : [...]`, so every pinned number is
measured with lights off. **Confirmed — matches the plan's requirement that C1/C2 read the flat-tone
control.** The one lit-rig test (oracle-validity, `crossDensityRatio=2`) also passes `flat=true` explicitly
(4th arg `true`) — so the entire pinned suite is tone-OFF, not just most of it.

## (5) Guards, run directly against `48ff98dc` in the read-only worktree

```
scene3d-crosshatch-parity.test.js            37 passed
scene3d-hatch-density-angle-stable.test.js    9 passed
scene3d-fill-ruling-corners.test.js          19 passed   (this is "W-33" — file:line confirmed via W-33-impl.md)
scene3d-crosshatch-cell-shape.test.js        23 passed   (new, this unit)
Test Files  4 passed (4)   Tests  88 passed (88)
```
**All match the impl report's claims (37/37, 9/9, 23/23) and the requested W-33 bar (19/19) exactly.**

## (6) `## Bars changed`

The impl report's section reads "None. This unit ships zero source diff. The new test file ... introduces
NEW bars ... no existing numeric threshold, tolerance, count bar, or pinned fingerprint in any other test
file was touched." Consistent with (1): the diff touches exactly one (new) file. **Confirmed.**

## (7) After/W-31 evidence vs. prior captures

`docs/3d-audit/fill-audit/after/W-31/shots/A/*.webp` (20 files) exist on main. Compared byte-for-byte
(`cmp`) against `after/W-36/shots/A/*.webp` for every filename present in both sets (12 of 20 overlap —
`after/W-36` did not capture camera-b or cone cells): **all 12 overlapping files are byte-identical.**
This is exactly what "zero source diff" predicts, and it is independent corroboration beyond trusting the
report's own "byte-identical by construction" disclosure. Read the two named limb crops
(`cylinder_max_a_left.png` / `_right.png`) directly: the left limb reads as visibly crushed, tight
diamonds and the right limb as visibly stretched, open parallelograms — the defect is real and visible,
not just a number.

## Opinion — what W-31b needs

The spike proved the mechanism (per-sample offset placement) moves the metric in the right direction —
4 of 5 flat-tone columns already clear a tight band on the first attempt — but a single per-sample step
under-corrects at the interior box's edge and, more importantly, the lit-rig result regressed relative to
flat (worse, not better), and per-window scatter got worse too (out-fraction 0.42 → 0.67, measurable
windows 76 → 39). That combination — one axis better, two axes worse — is a real signal that a single
uncorrected step isn't enough, not noise. W-31b should start from exactly the lead the implementer left:
a second (or fixed-point) correction pass over `warpArr`, mirroring `contFieldAniso`'s own 2-iteration
convergence, before trying a structurally different mechanism. It should also re-derive RED on its own
base rather than reusing this unit's spike diff verbatim, since W-31b sits behind more merges. Rank 2
stays correctly closed off; nothing here reopens it.

REPORT docs/3d-audit/lane-reports/W-31-review.md — ACCEPT — spike/Rank-3 verified, numbers reproduced exactly, honest STOP.
