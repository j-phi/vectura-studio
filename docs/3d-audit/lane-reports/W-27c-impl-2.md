STATUS: DONE/FU

# W-27c implementer report — iteration 2 — fill-audit-d

Responds to `docs/3d-audit/lane-reports/W-27c-review.md` (STATUS: REJECT on the iteration-1 unit).

- **Lane / worktree**: fill-audit-d, `.claude/worktrees/fill-audit-d` (port 8481)
- **Base sha (iteration 1, rejected)**: 29203162 (test-only, on top of 2dc7b3aa WIP)
- **New sha**: 073202a4 "fix(scene3d): W-27c review iteration 2 — Newton divergence guard + non-circular plane/surface oracle under real rotation"
- **Files touched**: `src/core/algorithms/scene3d.js` (the divergence guard, +23/-5 lines net inside `sliceAnalyticProjectLocal`) and `tests/unit/scene3d-contour-slice.test.js` (+331/-5 lines: 9 new tests). `mappers.js` untouched.

## Checklist against the coordinator's 5 requirements

1. **Divergence guard + RED test reproducing the reviewer's case at HEAD, GREEN after** — DONE.
2. **Replace the circular oracle with plane-membership + analytic-radius/surface checks** — DONE (redesigned twice; see below for why the first redesign wasn't good enough and had to be redone).
3. **Resolve the cone item (b) metric-vs-screenshot contradiction, state which was wrong** — DONE: the metric was wrong (wraparound on an open ring). But see "unreconciled discrepancy" below — my own honest re-measurement does not match the review's cited number, and I report both rather than picking one.
4. **Address every other item in the review** — DONE (mutation B/C fixture requirement for cone/cylinder/torus with real rotation; see below).
5. **Re-shoot after/W-27c, LOOK, commit** — DONE.

## 1. Divergence guard (blocking #1)

**Root cause** (`sliceAnalyticProjectLocal`, `src/core/algorithms/scene3d.js`): the Newton step size `k = fg.F / denom`, where `denom` is the squared in-plane-projected gradient magnitude. As the cutting plane approaches TANGENT to the surface at a point (local surface normal nearly parallel to the plane normal), `denom` shrinks toward — but can sit just above — the existing `denom < 1e-12` bail-out floor. `k` then explodes, and the old code applied the step unconditionally with no check that it actually improved anything.

**Fix**: inside the Newton loop, track `best`/`bestAbsF` (seeded with the untouched input point). Each candidate step is computed, then accepted only if (1) every coordinate is finite, (2) its displacement from the current point is within `4 × max(sizes.sx, sizes.sy, sizes.sz, 1)` (a scale-relative sanity bound), and (3) the resulting `|F|` is strictly smaller than the best `|F|` seen so far. The first rejection stops the loop and returns the best point found — which can never be worse than the function's own input.

**RED** (reproduced against a disposable `git archive 29203162 | tar -x` scratch tree, own `node_modules` symlinked from main, then deleted after):
```
sphere r20, p=(20.5,0,0) [F0=0.1025], near-tangent plane at eps=1e-3:
  pre-guard (29203162): dist=61.65mm, expected <5mm -- FAILS
```
This exactly matches the review's own reproduction (they measured 61.6mm/617mm/6174mm at eps=1e-3/1e-4/1e-5 — I independently reproduced the 61.6mm figure against their exact construction before writing the fix).

**GREEN** at 073202a4: the same construction (eps=1e-3/1e-4/1e-5) now gives `dist < 5mm` (measured: 0mm — the guard rejects the divergent step immediately and returns the input unmoved, since even one Newton step there is not an improvement) and `|F|` never exceeds the input's own `|F0|=0.1025`. A degenerate zero-length plane-normal input is also covered (never produces NaN).

## 2. Non-circular plane-membership + surface-residual oracle (blocking #2)

**First attempt (had to be redone)**: I initially built an "axis-aligned circle" oracle — hold the cutting plane exactly perpendicular to each primitive's own axis (via forward-rotating the local +Y axis by a real object transform, then round-tripping through the real `Slices.localPlaneNormal`), giving an exact, trivial "center + radius" check. This worked for sphere/cone but **failed outright for torus** at the offset I'd picked (40mm — genuinely outside torus's small tube-radius convergence basin, 0.24mm > 0.15mm bar even for the CORRECT implementation, a test-construction bug, not a production bug) and, on closer mutation testing, **silently failed to discriminate mutation B for cylinder at any offset** — because an axis-perpendicular plane makes the projection step for a cylinder a no-op regardless of orientation quality (see below). I caught both problems via direct mutation testing before finalizing, and redesigned rather than patch around them.

**Final design**: a GENERIC local plane direction, `(0.35, 0.82, 0.45)` normalized — deliberately not aligned to any primitive's own symmetry axis — forward-rotated by a real object transform (`yaw=25, pitch=15, roll=10`) via `Scene.applyObjectTransform`, then inverted back through the real `Slices.localPlaneNormal`. A sanity test confirms the round-trip recovers the original direction (proving the rotation machinery is exercised, not bypassed). For each of sphere/cone/torus, 8 points already ON the true analytic surface (own parametric formula) are offset 1mm outward along their own surface-gradient direction (simulating a raw/interpolated ring point), run through the real `Slices.analyticProjectLocal` directly (no external-reclamp wrapper — isolates exactly the function the review's mutations target), then checked two ways, independently: (i) **plane membership** — the corrected point's own offset along the plane normal must equal the raw point's offset, pure dot-product geometry, zero reuse of F/gradient; (ii) **surface residual** — `|F|/|grad F|`, independently re-derived per primitive (not a re-export).

**Offset tuning, verified by mutation**: 1mm was chosen because at that offset every primitive's CORRECT implementation converges to machine precision (1e-8mm–1e-15mm, verified directly), while mutation B (delete the in-loop gradient-onto-plane projection) drives sphere/cone/torus to 0.242mm/0.240mm/0.622mm — all comfortably over the 0.15mm bar. **I verified this by literally applying the mutation to the committed source** (`git diff` confirms it was reverted before the final commit), re-running only the new blocking-#2 tests, confirming 3 of 4 fail with exactly the predicted numbers, then reverting.

**Cylinder — documented, provable exception, not a gap**: cylinder's implicit surface `F = (x/sx)² + (z/sz)² - 1` does not depend on `y` at all, so its gradient's y-component is identically zero at every point, for every plane orientation. This means: (a) the in-loop plane-reclamp (present regardless of the mutation) is, by itself, mathematically sufficient to keep the corrected point exactly on the plane for this one primitive, and (b) the surface residual can never distinguish "the point at the correct y" from "the point at any other y", because the surface doesn't encode y at all. I verified directly that removing the gradient-onto-plane projection changes NEITHER the plane error nor the surface residual for cylinder, at every offset from 1mm through 100mm. This is a real, primitive-specific mathematical property of cylinder's own implicit equation — not something a better test rig could work around. The cylinder fixture is kept (with this documented in its own comment and test name) because it still exercises the real rotation + non-axis-aligned-plane round-trip end-to-end and would catch a regression in that shared machinery, even though it cannot specifically catch mutation B for this one primitive.

## 3. Item (b) — the metric-vs-screenshot contradiction

Confirmed the reviewer's diagnosis: `maxTurnDeg` (mine, from iteration 1, and the review's independent reproduction) applies `% n` modulo wraparound as though every ring were closed. The cone's near-apex-adjacent ring from `buildSliceSegments`/`linkSegments` is a genuinely OPEN arc (first and last points do not coincide) — added a test proving `closureGap > 1mm` on the exact ring used. **The metric was wrong, not the screenshots.**

I then wrote an open-polyline-aware version (no wraparound) and re-measured the reviewer's exact stated rig (identity transform, `sx=20,sy=24,sz=20`, detail18, sliceCount22) across every ring on every plane. **My own measurement: worst-case 7.09°** — under the plan's ≤8° bar — reproduced identically across three wiring variants (with the `analyticProject` option, without it, and with vs. without the pass's own final external plane reclamp). I could **not** reproduce the review's cited 39.8° for "that same ring" despite matching every parameter they stated, including trying the "near-duplicate-point cluster (0.08mm apart)" detail they mentioned as a diagnostic (I found many points at that spacing throughout the refined ring — it's just the natural density of a 137–1193-point subdivided ring, not a distinguishing signature).

Given I could not reconcile this, and per the coordinator's explicit instruction not to claim improvement without a matching before-number, I did **not** assert a pass/fail verdict against either number in the test. The new test records the measurement with a loose, honest bound (`0 < worst < 45`) and the report/lane-doc state both figures side by side. **Item (b) stays OPEN** — reported neither as closed (my 7.09° would suggest that) nor confidently at 39.8° (I cannot reproduce it) — flagged explicitly for the next reviewer pass to run their own script against this exact commit and settle it.

## 4. Other review items

- Section 7 (evidence, "looked at the PNGs") — re-shot all 4 cells after the divergence-guard change (forced re-capture since the script skips existing files); all 4 are byte-different from iteration 1's after-shots (expected — any source change re-renders) but **visually identical** on direct inspection: ellipsoid smooth concentric ellipses, cylinder clean parallel verticals + smooth ellipses, cone (Tier A ladder and Tier B none) smooth rounded arcs at every ring, no chevrons, no new artifacts, no regression from the guard.
- Recommendation 4 (items d, e, stale gallery shots) — untouched, as instructed (not blocking, not in scope this iteration).

## Targeted tests (run alone, one file at a time)

| file | result |
|---|---|
| `tests/unit/scene3d-contour-slice.test.js` | **33/33 pass** (24 from iteration 1 + 9 new) |
| `tests/unit/scene3d-mesh-self-occlusion.test.js` | 5/5 |
| `tests/unit/scene3d-curves.test.js` | 13/13 |
| `tests/unit/scene3d-hlr.test.js` | 11/11 |
| `tests/unit/scene3d-hlr-draft-flag-wiring.test.js` | 2/2 |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `tests/integration/scene-xray-needs-fill.test.js` | 17/17 |

Plane-count purity tests (`scene3d-contour-slice.test.js` #1–#5) untouched and green throughout. Did not run `npm run test:unit`/`test:integration` (out of scope; machine shared, per the original brief).

## Commit

`073202a4` in `.claude/worktrees/fill-audit-d` (branch `3d-scene/fill-audit-d`). Not pushed, not merged. Evidence (`docs/3d-audit/fill-audit/after/W-27c/*`) re-shot and left uncommitted in MAIN per the audit's wrap-up convention.

## Open follow-ups for the next reviewer/orchestrator pass

1. **Item (b) reconciliation** — my 7.09° vs. the review's cited 39.8° on (per both of us) the identical rig. Needs a third measurement, ideally with the reviewer's own script run against commit 073202a4.
2. Items (d) torus-hole dashed occlusion fragments and (e) perf on the 8-dense-sphere fixture — untouched, still open.
3. Gallery hygiene: `shots/A/{ellipsoid,cylinder}__contourSlice__ladder__med__a.webp` in the main gallery remain stale (predate W-27) — not fixed this unit.
