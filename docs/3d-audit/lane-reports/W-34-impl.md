STATUS: DONE

# W-34 — "There are some angles in this curved shape that should not be there" (implementer report)

Lane: fill-audit-d2. Worktree: `.claude/worktrees/fill-audit-d2` (branch `3d-scene/fill-audit-d2`),
port 8481. Base sha: `be5cfcf8` (W-27c-0a-4b's cone/cylinder measurement + guards — tests only,
`scene3d.js` untouched by that unit). New sha: see commit below. Plan:
`docs/3d-audit/lane-reports/W-34-plan.md`. Ruling followed exactly:
`docs/3d-audit/lane-reports/LEDGER.md` § Standing orchestrator rulings, 2026-09-08 — ship Fix A
always; ship Fix B only if the plan's T3 is RED; Fix C is forbidden here (needs Jay).

## 1. Files touched

- `src/core/algorithms/scene3d.js` — **only** the slices block, exactly the plan's allowed region:
  - `refineSliceRing` (Fix A): accepts `opts.project`; a `measure(pts)` closure measures the stop
    condition in device space when a projector is supplied, world space otherwise (byte-identical
    absent `opts.project`). Subdivision and the Newton analytic snap are untouched — still world space.
  - `linkPlane` inside the contourSlice pass (Fix A wiring): supplies `refineProjectFn`, built from
    `scene.projectWorld` (the SAME projector `projectPath` uses two lines later), to every
    `refineSliceRing` call.
  - `sliceSurfaceFG` (Fix B, landed because T3 was RED — see §2): new `capsule` branch, mirroring
    `charts.js topoCapsule` exactly (`r = max(1, min(sx,sz))`, `half = max(r,sy)`,
    `cylHalf = max(0, half-r)`, cylindrical/domed piecewise implicit F).
- `tests/unit/scene3d-contour-slice-corners.test.js` (**new file**) — the plan's §3 oracle: T1 (M1,
  roster-wide, both cameras), T2 (M2, honestly scoped with a computed cone exemption), T3 (the
  capsule truth oracle), T4 (refinement-can't-cheat guard), plus a permanent pure-math mutation guard
  proving the open-polyline-aware metric is load-bearing. 25 tests, all pass at the final sha.
- `tests/unit/scene3d-contour-slice.test.js` — **lines ~1011-1012 only** (item (b) placeholder),
  per plan §7.1. See `## Bars changed`.
- `mappers.js`: confirmed **not touched** — `git status` shows no change; contourSlice is not on the
  `REGION_MAPPERS` path, as the plan said.

## 2. RGR proof

**RED at be5cfcf8** (reproduced in a scratch `git archive` export at
`/private/tmp/claude-501/scratch-W34-pre`, node_modules symlinked to the worktree, never touching the
worktree itself):

- **T1 (M1, camera a)**: cone **8.0882°**, capsule **9.0750°** — matches the plan's numbers to four
  decimal places, confirming the metric implementation is correct.
- **T1 (M1, camera b) — new finding, not in the plan's table** (the plan only tabulated M1 at camera
  a): sphere **8.3913°**, ellipsoid **8.3551°**, cone **9.3168°**, torus **10.6330°**, capsule
  **8.5539°** — ALL SIX primitives were over the 8° bar at camera b, not just cone/capsule. The plan's
  own M2 table did cover camera b (cone 86.5, capsule 34.2, torus 17.4, ellipsoid 10.6) but its M1
  table did not. This is disclosed, not silently absorbed.
- **T2 (cone exemption)**: implemented per-plane, not as a continuous sweep (see §3 deviation) — cone
  emitted worst 76.41°/mm vs. the analytic ceiling (at the real 26 slice-plane z-values) 141.56°/mm.
  Comfortably exempt.
- **T3 (capsule truth oracle)**: emitted worst **32.42°/mm** vs. analytic worst (real planes)
  **8.17°/mm** — excess **297%**, far over the plan's 15% bar. **RED — Fix B is warranted.**

**GREEN after Fix A** (T1, all 12 camera×primitive cases, including the camera-b cases the plan never
tabulated): all pass. Camera a: torus 7.5795°, capsule 7.9278° (sphere/ellipsoid/cone under 8, exact
values in `after/W-34/report.json`). Camera b: torus 7.8643°, capsule 7.9215°. T2 unaffected (cone
still exempt, 76.41 vs 141.56 ceiling). **T3 still RED after Fix A alone**: emitted worst 32.4685°/mm
vs. truth 8.1659°/mm, excess 297.6% — confirming Fix A alone cannot and (per the plan) should not move
the capsule's invented sharpening; it only fixes the world/device stop-condition bug. Per the ruling,
Fix B ships.

**GREEN after Fix B**: T3 emitted worst **8.3745°/mm** vs. truth **8.1659°/mm**, excess **2.56%** —
comfortably inside the 15% bar. All 25 new tests pass.

## 3. Deviation from the plan's literal T2/T3 design — disclosed

The plan's T2/T3 design (§3.2) compares an emitted ring to the analytic truth "at the same plane,"
implying a 1:1 correspondence between an emitted path index and a specific slice-plane z0. The
engine's public API does not expose which world-z plane a given emitted device-space path came from
(the emitted path only carries device x/y/z-depth, not the original world z), and a naive index-based
correspondence breaks because degenerate 2-point stub paths (a separately-tracked, pre-existing defect
— plan §7.4/W-29 family) interleave with real rings, and clipping can split one ring into more than
one emitted path.

Two implementations were tried:

1. **Continuous z0 sweep** (my first attempt): sweeps z0 continuously across the full ±r range. This
   is WRONG — it includes z0 values near the silhouette extremes (±r) that no real slice plane ever
   lands on, where the true cross-section legitimately pinches to a near-point and produces a
   spuriously huge analytic M2 (measured: capsule "truth" 72.6°/mm, an order of magnitude above every
   real plane). Comparing against this ceiling would have made T3 **vacuously pass** at be5cfcf8
   (emitted 32.4 < 72.6), hiding the real defect. Caught and discarded before it entered the shipped
   file.
2. **Exact real-plane z0 sweep** (shipped): a `realPlaneZ0s()` helper builds the actual scene via
   `Scene3D.Scene.assembleScene` + `Scene3D.Slices.buildSliceSegments` (the same two calls the
   engine's own contourSlice pass makes) and reads the **exact** world-z of every FRONT slice plane —
   not a re-derivation, the literal values the engine itself computes. The oracle then takes the GLOBAL
   worst analytic M2 across those exact z0 values and compares it to the GLOBAL worst emitted M2
   (not matched plane-for-plane, since that correspondence isn't recoverable from the public API).
   This is a real, principled, code-computed exemption/oracle — genuinely "by rule," not a tolerance —
   just less granular than the plan's literal per-plane design. It reproduced the plan's own numbers
   (cone comfortably exempt; capsule RED at 297% excess, GREEN at 2.56% after Fix B), so the
   simplification did not change the ship/no-ship outcome, which is what matters.

This is flagged per protocol ("stop-and-report beats a fudge") even though the numeric result matches
the plan, because the implementation differs from the plan's literal spec and a future reader should
know why.

## 4. Guards — foreground, one file at a time, never backgrounded

| suite | result |
|---|---|
| `tests/unit/scene3d-contour-slice-corners.test.js` (new) | **25/25** |
| `tests/unit/scene3d-contour-slice.test.js` | **57/57** (51 pre-existing + W-27c-0a-4b's 6, all byte-identical to their own cull-inert baseline — cone `pathCount 22/totalInk 787.18/waist 0.0372mm`, cylinder `pathCount 26/totalInk 1075.01mm`, matching W-27c-0a-4b-impl.md exactly) |
| `tests/unit/scene3d-mappers.test.js` | **32/32** |
| `tests/unit/scene3d-hlr.test.js` | **11/11** |
| `tests/unit/scene3d-curves.test.js` | **13/13** (includes "the toggle is LIVE: capsule ink differs with Curves on vs off," which exercises the capsule path Fix B touches — still green) |
| W-27c ellipsoid rotated-transform accuracy (part of the 57) | untouched — this test drives `Slices.analyticProjectLocal` directly with no `opts.project`, bar `<0.15mm` unaffected |
| item 0(b) ceiling `≤55` (part of the 57) | untouched — measured 36, **did not move** |

All seven torus O2 metrics from the W-27c-0a-4 chain are **byte-identical** (pathCount 44, totalInk
897.1044413969058mm, waist 0.03878612131638042mm, largestW 3.35mm, blobCount 21, pct05 2.400237,
pct1 8.388889) — reproduced live in this worktree, not read off a prior report.

## 5. Byte-identity sweep (plan §4, extended to include cone/cylinder per its own instruction)

Method: a single vitest process loading two runtimes via `loadVecturaRuntime`'s `scriptOverrides` —
one running `be5cfcf8`'s `scene3d.js` (via `git show`), one running the final (Fix A + Fix B) source
— comparing md5 of `algo.generate()` output for the same scene params. All 14 cases matched:

`box/plane/pyramid/solid(buckyball)/cylinder` under `contourSlice`, and
`sphere/ellipsoid/cone/cylinder/torus/capsule/box/plane/pyramid` under `hatch` (a non-contourSlice
mapper). **14/14 byte-identical.**

## 6. Evidence capture (from MAIN, against the fill-audit-d2 worktree)

```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-d2 --port 8481 \
  --only '^(cone|capsule|ellipsoid|cylinder|sphere|torus)__contourSlice__ladder__med__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/W-34
```
12/12 cells captured (all confirmed present in `manifest.A.1-1.jsonl`/`manifest.B.[1-5]-5.jsonl`
before naming them, per protocol). `med`/`max` are byte-identical on this mapper (density never
reaches the slice pass) — camera **a and b** were shot instead, matching the plan's instruction.

**Note on the `--help` trap (LEDGER.md's own documented gotcha, hit again):** I ran
`node scripts/audit/scene3d-capture.js --help` to check the flag syntax; the script does not recognize
`--help` and silently ran its full default job against MAIN's own gallery instead. Confirmed harmless:
`git status` afterward showed only pre-existing, unrelated docs churn from other lanes (LEDGER.md,
STILL-OPEN.md, other units' `after/`/lane-report files) — no `index.html` or root `manifest.A.1-1.jsonl`
diff, i.e. every write was `skip (exists)` (idempotent). No repair needed; re-ran with the real
`--root`/`--only`/`--out` flags immediately after.

### Ink before → after (full app pipeline, `ladder` `med`, cameras a/b — `inkMm` from the manifest,
### NOT the raw `generate()` point totals used for the RGR proof above, which measure an earlier
### pipeline stage before Simplify)

| primitive | cam a before → after | cam b before → after | pathCount a before → after | pathCount b before → after |
|---|---|---|---|---|
| sphere | 1311.2 → 1243.8 (−5.1%) | 1267.6 → 1281.8 (+1.1%) | 95 → 94 | 95 → 95 |
| ellipsoid | 1437.3 → 1457.2 (+1.4%) | 1360.8 → 1378.7 (+1.3%) | 91 → 91 | 95 → 95 |
| cone | 914.3 → 917.3 (+0.3%) | 797.5 → 781.3 (−2.0%) | 95 → 95 | 102 → 101 |
| cylinder | 1264.9 → 1264.9 (**byte-identical**) | 1293.2 → 1293.2 (**byte-identical**) | 106 → 106 | 106 → 106 |
| torus | 1123.2 → 1098.6 (−2.2%) | 989.6 → 1000.7 (+1.1%) | 109 → 107 | 103 → 103 |
| capsule | 1444.1 → 1385.3 (−4.1%) | 1426.5 → 1318.4 (−7.6%) | 91 → 90 | 87 → 85 |

Capsule's ink drop (−4.1% / −7.6%) is larger than the plan's "well under 1%" prediction for Fix A
alone — expected and correct, since this is Fix B's effect (a shorter, non-invented true-surface
curve replaces a longer Catmull-Rom wiggle). Cylinder stays exactly byte-identical, as predicted (its
rings are 2-point straight lines — `refineSliceRing` never subdivides them). Every other primitive
moves by 0.3–5.1%, consistent with "point counts grow/shrink slightly, geometry does not" for the
smooth-quadric primitives Fix A alone touches.

## 7. LOOK — crops at native resolution

**Cone apex** (`(190,0)-(390,180)` region of the 565×738 `med`/`a` cell, per plan §6): **identical in
character before vs. after.** The sharp inverted-V chevron on the two near-apex rings is still there,
unchanged — exactly as the ruling requires. This is genuine geometry (the plan's §1.4 analytic
comparison: 76.4° emitted vs. 76.4° analytic, 0.0° delta) and Fix A/Fix B correctly leave it alone.
Only Fix C — forbidden to this implementer, filed for Jay — would remove it.

**Capsule corner** (a 240×230 native crop of one of the stadium shape's rounded corners, 4×
upsampled): **dramatic, unambiguous visual fix.** Before: every inner ring shows clearly polygonal,
faceted corners — multiple straight facets meeting at sharp visible vertices, not a smooth curve.
After: every ring is now a continuous, smooth round corner with no faceting anywhere. This matches the
numeric result exactly (32.4°/mm invented → 8.4°/mm, 2.6% over true geometry).

**Ellipsoid** (`(0,60)-(220,340)` region, per plan §6 — not this unit's target, W-35's territory):
looked anyway per protocol. Before shows the small stair-step kinks at a couple of clipped ring ends
(W-35's own defect); after, those same regions read visibly smoother. **Not claimed as a W-35 fix** —
a different mechanism (HLR clip-end fidelity vs. this unit's refinement stop-condition space) — but
the picture measurably changed, so per plan §7.2, W-35 must re-baseline its before-numbers against
this post-W-34 tree, not against the pre-W-34 gallery.

## 8. `## Bars changed`

| file:line | old | new | why |
|---|---|---|---|
| `tests/unit/scene3d-contour-slice.test.js` — item (b) placeholder ("honest measurement: open-aware max turn...") | `expect(worst).toBeGreaterThan(0); expect(worst).toBeLessThan(45);` | `expect(worst).toBeGreaterThan(0); expect(worst).toBeLessThanOrEqual(8);` | Per plan §7.1: this test measures the WORLD-space per-vertex max at the reviewer's own rig (no `opts.project` passed — untouched by Fix A), and the world/device dispute is now settled (§2.2 of the plan): 7.09° there is genuinely the world-space number, not a stand-in for anything device-space, and 39.8° was a different bug (wrapped-open-ring) entirely, since withdrawn. There is no more live dispute to stay agnostic about, so the placeholder's deliberately-loose `<45` is tightened to the ledger's real `<=8` bar. Re-ran after tightening: still passes (measured ~7.09°, unaffected by Fix A/B since this test never routes through a camera projection). |

No other existing bar, tolerance, count ceiling, or pinned fingerprint was touched. The torus 0(b)
ceiling (`≤55`) and all seven torus O2 metrics are confirmed **unmoved** (§4). No fingerprint was
re-pinned.

## 9. Commit

Worktree `fill-audit-d2`, files staged: `src/core/algorithms/scene3d.js`,
`tests/unit/scene3d-contour-slice.test.js`, `tests/unit/scene3d-contour-slice-corners.test.js`. No
version bump (worktree, per protocol). Not pushed.

## 10. Open items (not this unit's to fix)

- **Fix C** (cone apex-band level warping) — the only thing that removes the chevron Jay circled. Per
  the ruling this is forbidden here; filed at LEDGER.md row 21e as a product decision for Jay, needing
  the before/after montage of cone planes 11–16.
- **W-35** (stair-step ends) should re-baseline its before-numbers against this post-W-34 tree (plan
  §7.2) — Fix A changed clipped-ring point counts.
- **W-37** (new id, already filed by the plan/secretary): `GeometryUtils.toCurveAnchors` returns
  `{straight:true}` on every contourSlice ring, so Fill Curves is inert on contourSlice output; and the
  degenerate 2/3-point stub paths (sphere 19, ellipsoid 8/19, torus 37, capsule several) are the W-29
  family. Neither is in this lane's files.
- The T1-camera-b finding (§2) that ALL SIX primitives, not just cone/capsule, were over the 8° bar at
  camera b pre-fix — worth folding into the plan's own historical record since it wasn't measured
  there, though Fix A already closes it.
