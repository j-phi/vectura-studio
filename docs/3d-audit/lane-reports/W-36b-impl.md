STATUS: DONE

# W-36b — implementer report: re-express crosshatch guard sub-tests per family

- Lane: `fill-audit-a2` · worktree `.claude/worktrees/fill-audit-a2` · port 8475 · branch `3d-scene/fill-audit-a2`.
- Base sha (unchanged, tests-only): `c6ff81de` (W-33 HEAD, includes W-36 `e31d8591`).
- Files touched: `tests/unit/scene3d-hatch-density-angle-stable.test.js` ONLY. No `src/` touched.
- Scope: re-express `scene3d-hatch-density-angle-stable.test.js`'s **crosshatch** sub-tests
  (`hatch` sub-tests and the byte-identity guard untouched) to measure family A and family B
  bearings **separately**, per the guard's own docstring intent ("no code path derives a line's
  direction from spacing/density/count" — a per-family claim) and per W-36-review.md §(5)'s ruling.

## (1) RED confirmed at c6ff81de

Ran the file unmodified: **9 tests | 2 failed | 7 passed**.
- `sphere > crosshatch: mean rendered bearing is stable across Density 50 -> 150 -> 50`:
  `expected 3.703198892232293 to be less than 3`
- `cone > crosshatch: mean rendered bearing is stable across Density 50 -> 150 -> 50`:
  `expected 3.816938074679058 to be less than 3`

Exact match to the numbers in `W-36-impl.md` ("Guard regression found OUTSIDE this unit's scope")
and `W-36-review.md` §(5) (3.703°/3.816°).

## (2) Change made

Added (inside the existing `beforeAll`) `SurfaceFill = V.Scene3D.SurfaceFill;`, and a new helper
`rawFamilyRuns(primitive, params, fillAngle, density)` that wraps `SurfaceFill.buildObject` to
capture raw runs (`.fam`/`.back`/`.lineIndex` — the only place these survive, per the in-repo
idiom in `scene3d-crosshatch-parity.test.js`'s `rawRuns`/`crosshatchStats`), filters front-facing
runs (`!r.back`), and splits into family A / family B by first-appearance order. Family identity
is consistent across a density-pair comparison because `surface-fill.js`'s crosshatch code always
builds family A (role `'a'`) to completion before family B (role `'b'`) —
`src/core/scene3d/surface-fill.js:11077-11097` — a structural code-order guarantee, not a
data-dependent one, so "family A" at Density 50 and "family A" at Density 150 name the same
physical family.

Replaced the single combined-bearing crosshatch test (one per primitive, inside
`describe.each(Object.keys(CURVED))`) with a test that computes `meanBearing` on each family's
own raw runs at Density 50 and 150, and asserts `bearingGap` for **each family separately** is
`< TOLERANCE_DEG` (3°, UNCHANGED — see `## Bars changed`). The `hatch` sub-tests and the
`BYTE-IDENTITY GUARD` test are byte-for-byte untouched. Also added a dated file-header note
explaining the W-36b re-expression and citing the review's ruling.

## (3) GREEN — whole file

`npx vitest run tests/unit/scene3d-hatch-density-angle-stable.test.js`: **9/9 passed** (all four
primitives × {hatch, crosshatch} + the byte-identity guard). Per-family bearing gaps measured on
the real (unmutated) tree, well under 3° on every cell (matches the review's independent
measurement: sphere A 0.967°, sphere B 0.004°, cone A 1.347°, cone B 0.006°).

## (4) Guard sweep (foreground, one file at a time, as instructed)

- `scene3d-crosshatch-parity.test.js`: **37/37 passed**.
- `scene3d-curved-crosshatch-controls.test.js`: **15/18 passed, 3 failed** —
  `sphere / cylinder / torus > the default crossing family at angle 0 IS the parallels family`,
  all three failing on an `Object.is` string-equality assertion between near-identical
  coordinate-string dumps (differ only in trailing digits at the truncated preview; not
  investigated further — **out of this unit's scope**). Confirmed **pre-existing and unrelated
  to this change**: `git status --short` in the worktree shows only
  `tests/unit/scene3d-hatch-density-angle-stable.test.js` modified, and this unit's target file
  is not referenced by `scene3d-curved-crosshatch-controls.test.js`. Not investigated or fixed —
  outside the ALLOWED scope (tests-only unit, this specific file). Flagging for the orchestrator,
  same as W-36's own out-of-scope finding was flagged rather than silently absorbed.

## (5) Mutation check — scratch export, one family's bearing made density-dependent

Scratch export: `git -C .claude/worktrees/fill-audit-a2 archive c6ff81de | tar -x -C
/private/tmp/claude-501/scratch-W36b`, node_modules symlinked. Mutated
`src/core/scene3d/surface-fill.js:11097` (the `else emitContFamily('angle', aB, ...)` branch that
places family B's off-axis crosshatch line) to
`emitContFamily('angle', aB + (count * 0.05), ...)` — `count` scales with Density, so this injects
a genuine density-dependent bearing shift into family B ONLY, leaving family A and the hatch path
untouched. Put both the OLD (pre-W-36b, combined-bearing) test file and the NEW (this unit's,
per-family) test file into the scratch tree and ran both against the mutated source, foreground:

| primitive | OLD combined test (mutated) | NEW per-family test (mutated) |
|---|---|---|
| sphere | **PASS** (mutation NOT caught) | **FAIL** — gap 3.472° (>3°) |
| cylinder | FAIL — gap **27.412°** | **FAIL** — gap 4.597° (>3°) |
| cone | FAIL — gap 4.860° | **FAIL** — gap 4.382° (>3°) |
| torus | PASS (code path bypasses the mutated line — torus's crossing family lands on-axis, taking the `emitContFamily('b', 0, ...)` branch, not the mutated `else` branch) | PASS (same reason) |

**Both requested outcomes reproduced:**
- **Sphere is the clean "old test passes for the wrong reason" case**: the OLD combined,
  ink-weighted vector average completely misses a real, injected density-dependent bearing shift
  in family B — the near-50/50, near-orthogonal cancellation this file's header (and
  W-36-review.md §(5)) describes swallows the defect rather than surfacing it. The NEW per-family
  test catches it directly and correctly (3.472° on the mutated family).
- **Cylinder shows the OLD metric is uncalibrated even when it does trip**: it fires, but at
  **27.412°** — roughly 6x the actual per-family bearing shift (4.597°) the mutation caused. The
  combined metric's magnitude is not diagnostic of the underlying defect size; it is an artifact of
  the two families' relative ink share and angular separation at that primitive/angle, exactly the
  instrument flaw both reports describe.
- Cone is a case where both trip at comparable magnitude; torus is immune because the on-axis
  branch (`onMeridianAxis`) never reaches the mutated line, which is a property of that primitive's
  geometry at this fill angle, not a gap in the per-family test's coverage.

Mutation applied and reverted only inside the scratch export (`/private/tmp/claude-501/scratch-W36b`,
deleted in full afterward, never touched the worktree). Worktree `git status` was clean of any
mutation before and after.

## Bars changed

None. `TOLERANCE_DEG = 3` (file line, unchanged) is untouched — **the metric changed (combined
ink-weighted vector average of both crosshatch families -> two separate per-family bearing-gap
assertions), the tolerance did not.** No numeric threshold, count bar, or fingerprint was moved.

## Evidence re-shoot

None. This is a tests-only unit with no source change — no render output changes, so there is
nothing to re-shoot. Confirmed by `git status --short -- . ':!graphify-out'`: only
`tests/unit/scene3d-hatch-density-angle-stable.test.js` is modified.

## Commit

`git add tests/unit/scene3d-hatch-density-angle-stable.test.js` then committed in the worktree,
message names W-36b. Not pushed, not merged, main untouched.

## Open follow-ups

1. `scene3d-curved-crosshatch-controls.test.js` has 3 pre-existing failures (sphere/cylinder/torus
   "default crossing family at angle 0 IS the parallels family") unrelated to this unit — needs an
   orchestrator decision on who owns it (not in this unit's ALLOWED list, not touched here).
