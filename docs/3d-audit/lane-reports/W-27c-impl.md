STATUS: DONE/FU

# W-27c implementer report — fill-audit-d

- **Lane / worktree**: fill-audit-d, `.claude/worktrees/fill-audit-d` (port 8481)
- **Base sha (WIP checkpoint)**: 2dc7b3aa "wip(scene3d): W-27c contourSlice follow-ups (x-ray test, cone/ellipsoid) (unverified)"
- **New sha**: 29203162 "test(scene3d): RGR proof for W-27c contourSlice Newton projector (items a, c)"
- **Pre-fix parent used for RED**: 55ddb720 (2 commits before the WIP)
- **Files touched**: `tests/unit/scene3d-contour-slice.test.js` only (5 new tests added, +214 lines). Production code (`src/core/algorithms/scene3d.js`) is exactly the WIP checkpoint's diff — **not modified** in this unit. `src/core/scene3d/mappers.js` — untouched (not implicated by this WIP).

## Decision: FINISH (verify + add missing RGR proof), not revert

The WIP checkpoint's production diff (Newton-based `sliceSurfaceFG`/`sliceAnalyticProjectLocal`/`sliceLocalPlaneNormal`, generalizing the old per-primitive closed-form projector to a plane-constrained Newton solve) was **already green** against every targeted test I ran, but had **zero RGR proof** for the specific accuracy claim it exists to fix (item a) and **zero coverage at all** for cone/cylinder/torus (item c) — a real, silent regression risk since the refactor replaced their previously-exact direct solves with an iterative method. I added that proof rather than reverting working code.

## Targeted tests (run alone, one file at a time, per protocol)

| file | before my changes | after my changes |
|---|---|---|
| `tests/unit/scene3d-contour-slice.test.js` | 19/19 pass | **24/24 pass** (5 new) |
| `tests/unit/scene3d-mesh-self-occlusion.test.js` | 5/5 pass | unchanged (not touched) |
| `tests/unit/scene3d-curves.test.js` | 13/13 pass | unchanged |
| `tests/unit/scene3d-hlr.test.js` | 11/11 pass | unchanged |
| `tests/unit/scene3d-hlr-draft-flag-wiring.test.js` | 2/2 pass | unchanged |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | 6/6 pass | unchanged |
| `tests/integration/scene-xray-needs-fill.test.js` | 17/17 pass | unchanged (the WIP's own capsule self-occlusion-dash test edit is in this file and passes) |

Did not run `npm run test:unit` / `test:integration` (explicitly out of scope per brief — that is unit item 1, queued separately). Plane-count purity tests (`scene3d-contour-slice.test.js` describe "plane count is a pure function of sliceCount", #1-#5) are untouched and green throughout.

## RED/GREEN proof

5 new tests, all calling the WIP's new `Scene3D.Slices.localPlaneNormal` / `.inverseObjectTransform` / 4-arg `.analyticProjectLocal`:

- **RED**: reproduced via a disposable `git archive 55ddb720 | tar -x` scratch tree (own `node_modules` symlinked from main's `node_modules`, since the worktree's own `node_modules` is nearly empty and `npx` silently falls back to a wrong global vitest otherwise — used `node_modules/.bin/vitest` directly against main's `node_modules`). All 5 fail with `TypeError: V.Scene3D.Slices.localPlaneNormal is not a function` (2 as direct assertion failures, 3 as a `beforeAll`-hook throw cascading to all tests in that describe block).
- **GREEN**: 24/24 at HEAD (2dc7b3aa + my test commit).

## Item (a) — rotated-object / tilted-plane accuracy: numbers

Rig: ellipsoid `sx=20,sy=12,sz=16`, transform `yaw=35 pitch=20 roll=10`, cutting plane `sliceRotate=15 sliceTilt=10`, `sliceCount=20`, 1872 ring-point samples. Oracle: `|F|/|∇F|` on the true implicit ellipsoid equation — first-order distance to the true surface in mm, independently re-derived in the test (not re-exported from the source).

- **Old method** (W-27b's z-fixed closed-form, reproduced inline as the baseline): **0.964mm** worst-case, mean 0.057mm.
- **New method** (this WIP's plane-constrained Newton projector, called through the real exposed API): **9.8e-10mm** worst-case, mean 3.4e-11mm — machine precision.
- Bar (plan/STILL-OPEN item a): ≤0.15mm. **Met by >10⁸×.** (My rig's old-method number, 0.964mm, is worse than the previous reviewer's uncited 0.309mm — different specific rotation/tilt values, same defect class; both exceed the 0.15mm bar, both are fixed by the new method.)

## Item (c) — cone/cylinder/torus regression guard: numbers

Rig: identity transform, default untilted plane (the shipped W-27b setup), same F/∇F oracle re-derived per primitive from `sliceSurfaceFG`'s own comments (independent check, not a tautology).

| primitive | raw ring worst dev | refined (real projector) worst dev |
|---|---|---|
| cone (sx20,sy24,sz20, detail18, sliceCount22) | 0.276mm | **3.8e-11mm** |
| cylinder (sx20,sy24,sz20, detail16, sliceCount20) | 0.094mm | **9.2e-10mm** |
| torus (sx24,sy20,sz20, detail18, sliceCount22) | 0.176mm | **8.8e-12mm** |

All three land at machine precision — the Newton refactor is not just non-regressive relative to the old exact-by-construction solves, it is exact. Bar used: <0.1mm (matching the already-accepted sphere bar from W-27b) — met by ~7-9 orders of magnitude.

## Evidence — cells captured, and what I saw

Ran `node scripts/audit/scene3d-capture.js --tier {A,B} --root .claude/worktrees/fill-audit-d --port 8481 --only ... --out docs/3d-audit/fill-audit/after/W-27c` from MAIN. **Correction to the brief's regex**: `ellipsoid`/`cylinder` do not exist under Tier B (`TIER_B_PRIMITIVES = ['sphere','torus','box','cone']` — only `cone` from the requested set is reachable there), and Tier A never has style `none` (Tier A's single fixed style is `ladder`). Captured the closest honest equivalents instead:
- `after/W-27c/shots/A/{ellipsoid,cylinder,cone}__contourSlice__ladder__med__a.webp` (Tier A)
- `after/W-27c/shots/B/cone__contourSlice__none__med__a.webp` (Tier B, the exact cell named in the brief, for the one primitive that exists there)

**Gallery hygiene problem found**: the main gallery's existing `shots/A/{ellipsoid,cylinder}__contourSlice__ladder__med__a.webp` are stale — mtime predates even W-27 (2a44afc0) landing; the ellipsoid one still shows the pre-W-27b heptagon pole defect. Comparing against them would overstate this unit's delta. Instead I built a disposable `git worktree add --detach <scratch> 55ddb720`, served it on port 8482, and re-shot the same 4 cells there as the **true before** (not committed — scratch only). All 4 before/after pairs are byte-different.

**What I saw** (`docs/3d-audit/fill-audit/after/W-27c/report.json` has the full narrative):
- **ellipsoid** (Tier A): true-before is already visually smooth at this camera angle/zoom (the default capture doesn't rotate the object enough to expose item (a)'s defect visually) — no visible regression, matches the tiny-at-this-scale numeric delta.
- **cylinder** (Tier A): visually indistinguishable before/after, consistent with its already-small 0.094mm raw deviation.
- **cone** (Tier A ladder + Tier B none): a real, clearly visible improvement — every ring's near-tip changes from a sharp V/chevron corner (true-before) to a smooth rounded arc (after), in both style variants I captured.

**Surprise, flagged not resolved**: the cone screenshot improvement contradicts STILL-OPEN.md item (b) ("cone branch shows no visible improvement") — this WIP's generalization plausibly fixes it too, as a side effect of finally using the *correct* cutting-plane axis in local space (the old cone solve held local Y fixed, which is only the cutting coordinate for a sphere's symmetric case, not for a Y-axis cone cut by a default Z-const plane). However, my own `maxTurnDeg` measurement on the identical rig (Y-axis cone, Z-cut, identity transform) still finds ~112-142° max turning angle on both raw AND refined rings — disagreeing with my own eyes on the screenshots. I could not reconcile this in budget (most likely explanation: the offending high-turn vertex is not at the visually-dominant tip once the refined ring has hundreds of points). **Item (b) is therefore reported as improved-but-unverified-by-assertion, NOT closed** — no maxTurnDeg-based test was added for cone/cylinder/torus.

## Open follow-ups (STILL-OPEN.md items, current state)

- (a) rotated-ellipsoid accuracy — **CLOSED** this unit (numbers above).
- (b) cone near-apex rings — **NOT closed**; new photographic evidence suggests real improvement, but the angle-based metric disagrees; needs a reviewer/second pass to reconcile the two before this is claimed done.
- (c) cone/cylinder/torus RGR assertions — **CLOSED** this unit (numbers above), scoped to the identity-transform/default-plane rig (the shipped W-27b case); a rotated-transform variant for these three primitives was not added (out of this unit's budget; item (a)'s rig already covers the general Newton/plane-normal machinery for the 'sphere' mode, and item (c)'s risk was specifically "did the refactor regress the already-shipped default case", which it did not).
- (d) torus-hole dashed occlusion fragments — untouched, still open.
- (e) perf on 8-dense-sphere fixture — untouched, not re-measured, still open.
- Gallery hygiene: `shots/A/{ellipsoid,cylinder}__contourSlice__ladder__med__a.webp` should be refreshed from current main (see above).

## Commit

`29203162` in `.claude/worktrees/fill-audit-d` (branch `3d-scene/fill-audit-d`), test-file-only. Not pushed, not merged. Evidence (`docs/3d-audit/fill-audit/after/W-27c/*`) left uncommitted in MAIN per the audit's stated wrap-up convention (`fill-audit-handoff.md`'s "main (untracked → committed at wrap-up)" row).
