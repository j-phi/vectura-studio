STATUS: VERIFIED

# W-32r4b — light verification (repair of the `scene3d-fill-boundary-ends` off-mask blind leg)

Verifier, read-only. Worktree under review: `.claude/worktrees/border-4`, pinned range
**76a77f22..fe5d67bf** (one commit, `test(3d-audit): W-32r4b — repair the boundary-ends off-mask
blind leg`). `git -C <worktree> status --short -- . ':!graphify-out'` clean before and after; the
worktree was never edited, stashed, checked out, or reset — every run below used `git archive`
scratch exports under `/private/tmp/claude-501/scratch-W32r4b/{pre-w32r4-b43fa4e3,
pre-unit-76a77f22, post, ...}`, `node_modules` symlinked from MAIN, all deleted at the end of this
pass. Node v20.20.2 (`.nvmrc`), matches the impl report.

**One protocol note, disclosed rather than hidden**: an early combined
`scene3d-fill-silhouette-overshoot.test.js` + `scene3d-hlr.test.js` run was issued without an
explicit `timeout` parameter, so the Bash tool auto-backgrounded it at its 120 s default under
shared-machine contention (other sessions' vitest visible in `ps`). Per the binding "never
run_in_background" rule, it was killed (not waited on) and both files were rerun separately,
foreground, with explicit `timeout: 600000`. No result below came from that killed run.

## (1) RED on pre-W-32r4 source, GREEN on post, mutation-proven on post

- **post (`fe5d67bf`), full file, in place: 49/49 GREEN**, 60.22 s. Includes the MUTATION PROOF
  test (13.7 s) passing — it toggles `__SIL_PROTO_OFF` (W-32r4's own flag) inside the *current*
  (patched) tree: OFF reproduces exactly one raster CELL (0.35 mm, `toBeCloseTo(CELL, 2)`) on
  ellipsoid/sphere/cone/capsule, all > the 0.20 mm bar; ON restores ≤ 0.20 mm on the same four. This
  satisfies "mutation-prove the bar on post (disable the refinement → RED)" directly, without a
  scratch tree.
- **The post test file copied onto a `b43fa4e3` scratch export (pre-W-32r4 source, `depth()`/mask
  code and `scene3d.js` both unpatched): 44/49 — exactly 5 failed**, 53.92 s. The 5 failures are the
  4 `test.each` sagitta cases (**capsule, cone, sphere, ellipsoid** — all `expected 0.35 to be <=
  0.2`) plus the MUTATION PROOF test (same assertion, off-branch). **Cylinder passes** (0.00 mm
  signal — no curvature to sag at this camera, matches the impl report's disclosed reason). This is
  the independently-reproduced RED number: **5/49**, and it lands on exactly the primitives
  W-32r4-plan.md's own worst-cell table names as the 0.52–0.72-pen deficit group (ellipsoid
  0.70–0.72 pen, sphere 0.52 pen, cone 0.48–0.53 pen); capsule (0.24–0.25 pen, smaller, disclosed as
  a bonus finding) also fails, cylinder (0.07–0.14 pen, smallest, no signal at this raster) does
  not — all as the impl report states, not cherry-picked.

## (2) Corrected diagnosis, independently reproduced

- **Old leg, unmodified (`76a77f22`'s own test file, 41 tests) on `b43fa4e3`: 41/41 GREEN**, 36.47 s
  — reproduces W-32r4-plan.md §1.6's own "41/41 before and after" claim as a control baseline.
- **Old leg + ONLY the off-mask fix** (I built this myself: took the `76a77f22` file unmodified and
  added *just* the `Dout`/`overshoot()` BFS-transform hunk to `maskFor()` — no new `describe` block,
  no `silhouette` collection in `build()` — then ran it on the same `b43fa4e3` source): **41/41
  GREEN, 36.50 s — identical to the control, byte-for-byte same pass count.** The original 41 CASES
  never call `overshoot()`, so patching the off-mask branch in isolation changes nothing they see.
  This directly reproduces the report's claim that the off-mask fix is defensive, not the closure:
  it cannot turn the old leg red for W-32's defect, because the old leg's own data (fill endpoints
  and mesh silhouette vertices) never leaves the mask in the first place — confirmed a second,
  independent way by the RED run above, where the DOCUMENTED PROOF test (worst off-mask magnitude
  across real fill+border-vertex data ≤ one CELL) **passed even against `b43fa4e3`-sourced
  fixtures**, i.e. even on the pre-fix geometry that carries W-32's own defect.
- **Distinct quantities, confirmed by reading both files' own text, not just their bars**:
  `scene3d-fill-silhouette-overshoot.test.js:1-40` states its own scope explicitly — O1/O2 measure
  `osDrawn`, the exact distance of ruling **endpoints** outside the **drawn** convex-hull outline
  (analytic hull technique, 0.15 mm / 0.5-pen bar), and its header names `scene3d-fill-boundary-ends`
  as measuring a different quantity referenced against the **chart**, not the drawn ink. The new
  sagitta bar in `scene3d-fill-boundary-ends.test.js` is distinct from *both*: it feeds silhouette
  **chord midpoints** (not ruling endpoints, not mesh vertices) through the file's own raster
  BFS `depth()` instrument (0.35 mm CELL, new 0.20 mm bar), measuring inward sag from the chart mask
  — a coarse raster technique against a different set of points than either sibling test uses.

## (3) Hygiene

- **No `src/` touched**: `git -C <worktree> diff --stat 76a77f22..fe5d67bf -- src/` is empty.
  `git diff --stat 76a77f22..fe5d67bf` shows exactly one file,
  `tests/unit/scene3d-fill-boundary-ends.test.js` (+218/−2).
- **`## Bars changed` accurate**: `TOL_MM = 1.0` and `CELL = 0.35` (lines 45/48) are byte-identical
  between `76a77f22` and `fe5d67bf` — confirmed by diffing the file's first 80 lines directly (CASES
  array, `TOL_MM`, `CELL`, `GRID`, `NZ_FOLD`: no diff). Only a new local
  `SIL_SAGITTA_BAR_MM = 0.20` inside the new `describe` block is added — matches the impl report's
  disclosure exactly, no existing bar widened or narrowed.
- **Lane baseline unchanged, spot-checked**: `scene3d-fill-silhouette-overshoot.test.js` — **401/401
  pass**, 247.42 s (one benign pre-existing `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC
  warning, exit 0 — documented shared-machine noise per `ROUND3-RESUME-BRIEFS.md` §0b, not a
  regression). `scene3d-hlr.test.js` — **11/11 pass**, 0.52 s. Both run against the `post` (worktree
  HEAD) scratch export, untouched by this unit.
- Worktree confirmed clean (`git status --short -- . ':!graphify-out'` empty) and at `fe5d67bf`
  both before and after this verification pass. All scratch dirs under
  `/private/tmp/claude-501/scratch-W32r4b/` deleted at the end; no probe files left in the repo or
  worktree.

## Verdict

**VERIFIED.** All three conditions independently reproduced with matching numbers: RED 5/49 on
pre-W-32r4 source (exactly the 4 sagitta cases + mutation proof, ellipsoid/sphere/cone/capsule, not
cylinder) vs GREEN 49/49 on post with the mutation proof passing in-process; the off-mask-fix-alone
control (41/41, identical to the unpatched baseline) confirms the brief's corrected diagnosis that
the off-mask branch was never the hiding mechanism; the new sagitta bar reads on a distinct point
set (drawn chord midpoints vs. ruling endpoints/mesh vertices) via a distinct technique (raster BFS
vs. analytic hull) from `scene3d-fill-silhouette-overshoot.test.js`; no `src/` touched; bars/raster/
population unchanged; lane baseline (overshoot file + one HLR file) unaffected.
