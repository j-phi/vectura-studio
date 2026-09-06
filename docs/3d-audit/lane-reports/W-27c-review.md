STATUS: REJECT (production diff unsafe as-is) — tests themselves are honest and should be KEPT

# W-27c reviewer report — fill-audit-d (adversarial, read-only)

- **Lane / worktree**: fill-audit-d, `.claude/worktrees/fill-audit-d` (port 8481), read-only throughout.
- **Base sha**: 55ddb720. **Unit commits**: `2dc7b3aa` (WIP, unreviewed, `scene3d.js` + xray test) → `29203162`
  (test-only, RGR proof for items a/c). Confirmed clean tree, no stash pollution, no other-lane edits.

## 1. Scope isolation (git log/diff)

`git log --oneline 55ddb720..HEAD` = `29203162`, `2dc7b3aa`, `44797f53`. **`44797f53` (W-25) is a
separate, already-landed unit** (mappers.js `trueSpiral` fix + its own test/scratch files) that sits
between the stated base and the W-27c WIP — it is NOT part of this review; confirmed its diff touches
only `mappers.js` + W-25's own tests/docs, nothing in `scene3d.js`.

W-27c itself: `2dc7b3aa` touches **`src/core/algorithms/scene3d.js`** (195 lines: `sliceInverseRotateOnly`,
`sliceLocalPlaneNormal`, `sliceSurfaceFG`, rewritten `sliceAnalyticProjectLocal` as a plane-constrained
Newton solve, new `Scene3DNS.Slices` exports) + `tests/integration/scene-xray-needs-fill.test.js` (20
lines). `29203162` touches **only** `tests/unit/scene3d-contour-slice.test.js` (+214 lines, pure
append at EOF). **`mappers.js` and `geometry-utils.js` (the fitter/`acceptable()` gate) are untouched
by both W-27c commits** — confirmed by diffing each file individually; the impl report's claim is correct.

Plane-count purity tests (lines ~204–306, `describe('plane count is a pure function of sliceCount')`):
diffed byte-for-byte against 55ddb720 — **identical, untouched**. The entire `29203162` diff is one hunk
appended after the file's last existing line; nothing above it moved.

## 2. RED reproduction (scratch, not stash)

`git archive 55ddb720 | tar -x` into scratch, `node_modules` symlinked from main, new test file copied in.
Result: **1 failed suite (2 tests, via a `beforeAll` throw) + 3 failed tests = all 5 new assertions dead**
at 55ddb720, all `TypeError: V.Scene3D.Slices.localPlaneNormal is not a function` — exactly as claimed
(the impl report's "2 direct / 3 beforeAll" phrasing is reversed from what I observed, but the substance —
all 5 fail pre-fix — holds). Verified the inline `oldEllipsoidProjectLocal` baseline in the test is
**byte-identical** to 55ddb720's real sphere-branch code (`sliceAnalyticProjectLocal`'s old body) — the
RED is faithful, not synthetic (ledger flag 3 resolved).

## 3. GREEN + numbers, independently re-measured

Ran the real suite at HEAD: **24/24 pass**. Patched a throwaway copy of the test file (console.log only,
never the worktree) to print the raw numbers instead of trusting the report:

```
ITEM_A {"oldMax":0.9641393837769395,"newMax":9.832429922281633e-10,"samples":1872}
ITEM_C cone     {"rawMax":0.2761990980940485,"refinedMax":3.844076349821488e-11,"ringsChecked":22}
ITEM_C cylinder {"rawMax":0.09398612077694035,"refinedMax":9.22115717074352e-10,"ringsChecked":40}
ITEM_C torus    {"rawMax":0.17556208018355682,"refinedMax":8.755218772180296e-12,"ringsChecked":34}
```

Exact match to the impl report, and independently derived (own script, not a re-read of their numbers).
Bars used: item (a) ≤0.15mm, item (c) <0.1mm — the latter matches the already-accepted W-27b sphere
precedent (`<0.1mm from analytic radius`), not a widened tolerance. Old method 0.964mm doesn't match the
prior judge's 0.309mm but is the same defect class on a different rig — acceptable, disclosed.

Guard suites, run alone per protocol, all green: contour-slice 24/24, mesh-self-occlusion 5/5, curves
13/13, hlr-spatial-index-identity 6/6, hlr 11/11 (59/59 total).

## 4. Mutation testing — the tests are not fully vacuous, but do not verify the plane constraint

**Mutation A** (no-op projector, `analyticProjectLocal` returns input unchanged): cone and torus item-(c)
tests correctly fail (0.276 and 0.176 > 0.1 bar); item-(a) bar test correctly fails (0.401 > 0.15).
Cylinder coincidentally still passes (raw 0.094 < 0.1 already) — not a test bug, just that primitive's
raw ring is already inside the bar. **Confirms the suite is not a rubber stamp for total removal.**

**Mutation B** (delete only the in-loop gradient-onto-plane projection — the code's own headline
innovation — but keep the final external plane reclamp): **24/24 still pass, unchanged.** The specific
mechanism the fix's comment block spends the most words justifying ("project OUT its component along
the plane normal... take a 1-D Newton step along that direction") is **not exercised by any assertion**.

**Mutation C** (delete all in-loop plane awareness, both the gradient projection and the intra-loop
off-plane snap): item (a)'s single accuracy test correctly fails (0.298mm > 0.15mm) — so the ellipsoid
test does catch a fully-disabled plane constraint. **But all three item (c) tests (cone/cylinder/torus)
still pass unchanged** — the "regression guard" tests added for item (c) verify only that Newton
converges to *some* point on the surface at identity/no-tilt, never that it respects the plane
constraint at all. This partially substantiates ledger flag 2: not pure circularity (the ellipsoid test
does probe the real end-to-end pipeline, including the production call site's own final reclamp — I
confirmed `scene3d.js:3789-3800` does the identical local→Newton→world→reclamp sequence the test
mirrors), but item (c)'s claimed "regression guard" is materially weaker than advertised — it does not
guard the one thing this WIP's cone/cylinder/torus change actually introduced (plane-constrained motion).

## 5. New finding: unguarded catastrophic divergence (not in either report, verified with concrete numbers)

The Newton loop (`scene3d.js` new `sliceAnalyticProjectLocal`) has **no fallback, no step clamp, no
sanity check** when the in-plane-projected gradient is small but above the `denom < 1e-12` break
threshold — i.e., when the cutting plane is near-tangent to the surface at a ring point (a real,
non-contrived geometric configuration: it occurs at extremal/turning points of a ring whenever the local
surface normal nearly aligns with the plane normal, which is exactly the neighborhood where refinement
matters most). Constructed directly against the real wired `Slices.analyticProjectLocal`, ellipsoid rig:

```
eps=1e-3  → point moves 106 mm,   F: 0.10 → 39.3
eps=1e-4  → point moves 1060 mm,  F: 0.10 → 3932
eps=1e-5  → point moves 10600 mm, F: 0.10 → 393264
eps<~3e-6 → denom<1e-12 fires, point returned UNMOVED (F stays 0.10, silently unrefined)
```

No NaN, no crash — just a silently wrong point (up to 10+ meters off, or silently unrefined) fed straight
into the ring the caller renders. Nothing in the 24-test suite, old or new, exercises this region — every
RGR rig uses a specific rotation/tilt that happens not to graze this zone. This is the exact class of risk
ledger flag 1 asked me to verify; I found it real, not hypothetical, and materially worse than "less
accurate" — it is unbounded. This is a defect in `2dc7b3aa`'s production code, which `29203162` (test-only)
never touches or guards against.

## 6. Item (b) — resolved (metric was measuring the wrong thing)

Reproduced the implementer's exact cone rig (identity transform, `sx=20,sy=24,sz=20`, detail18,
sliceCount22) and the ring at the peak/near-apex plane. **The ring is an OPEN arc, not a closed loop**
(`dist(ring[0], ring[last]) = 39.7mm`). The implementer's `maxTurnDeg` (and mine, initially) applies
modulo-`n` wraparound as if every ring were closed — which manufactures a **spurious ~112–140° "turn"
across the two disconnected open ends**, an edge that is never drawn on screen. Re-measured with an
open-polyline-aware version (no wraparound): the real internal max turn at that same ring is **39.8°**,
at a near-duplicate-point cluster (two points 0.08mm apart), not at the visually dominant tip. Verdict:
**the screenshots are correct; the angle metric was wrong** (measuring a phantom wraparound edge, not a
real corner) — not "polygonal rings hidden at 800px." This still leaves the plan's ≤8° bar unmet at 39.8°
on this primitive, so item (b) stays open, but for a different, now-understood reason, and a future
angle-based cone/cylinder/torus assertion must be open-polyline-aware or it will keep reporting phantom
defects.

## 7. Evidence — looked at the PNGs

All 4 `after/W-27c/shots/**` cells (ellipsoid A, cylinder A, cone A, cone B) viewed directly. Cone (both
Tier A ladder and Tier B none) shows clean, smoothly-rounded nested rings converging to a sharp apex, no
visible chevrons, gaps, or fragments. Ellipsoid shows smooth concentric ellipses, no visible pole defect.
Cylinder shows clean parallel verticals + smooth top/bottom ellipses. No true-before is available to diff
against (the implementer's disposable comparison worktree was correctly torn down per protocol) so this
is a sanity check for regressions, not a quantified delta — none of the 4 images show any new visible
defect. `report.json` accurately narrates all of this; `byte_identical_pairs: []` is honest (no claimed
identical pairs to explain away). Gallery-hygiene finding (stale `shots/A/{ellipsoid,cylinder}` predating
W-27) is real and correctly escalated, not yet fixed.

## Verdict: REJECT (as a mergeable unit) — do not build further units on `2dc7b3aa` unfixed

Items (a) and (c)'s **measurements are honest, independently reproduced, and not inflated** — the
0.15mm/0.1mm bars are genuinely met by 6–9 orders of magnitude on the tested rigs, and the RED/GREEN
proof is real (not vacuous per mutation A). **But** the production code those measurements vouch for has
an unguarded, unbounded-divergence failure mode (section 5) that no test — old, new, or the plan's own
oracle — catches, and item (c)'s specific "regression guard" tests do not actually guard the mechanism
they claim to (section 4, mutation C). The implementer's own decision to "finish, not revert" the dead
agent's WIP assumed the WIP was otherwise sound; it is not. Recommend, before this merges:

1. Add a bounds/sanity fallback to `sliceAnalyticProjectLocal` (e.g., reject a step whose resulting `|F|`
   grew, or clamp `k`, or fall back to the raw/previous point when `denom` is small-but-nonzero)  — **blocking**.
2. Add at least one cone/cylinder/torus test with object rotation/plane tilt (item c's rig is
   identity-only) so the plane-constraint mechanism is actually exercised (mutation B/C both slipped
   through the current suite) — blocking for re-closing item (c) as a genuine "regression guard."
3. Fix or drop the maxTurnDeg-on-open-rings measurement approach before it's used to claim/deny item (b).
4. Items (d), (e), and the stale gallery shots remain open exactly as reported — not blocking this
   verdict, just still owed.

The 5 new tests in `29203162` should be **kept** (they are real, non-circular for the aggregate case, and
correctly documented) — the REJECT is on the underlying `2dc7b3aa` production diff shipping as reviewed/safe,
not on the test-only commit's honesty.
