STATUS: ACCEPT-WITH-FOLLOWUPS (both iteration-1 blockers genuinely fixed; one new, narrower robustness gap found)

# W-27c reviewer report — iteration 2 (adversarial, read-only)

Responds to `docs/3d-audit/lane-reports/W-27c-impl-2.md`, re-reviewing against my own iteration-1
REJECT (`W-27c-review.md`). New commit: `073202a4` on top of `29203162`. Confirmed clean worktree
throughout, no edits made there — all mutation/reproduction work done in disposable scratch exports.

## Blocking #1 — divergence guard: FIXED, independently reproduced

RED reproduced against a `git archive 29203162` scratch tree with the new test file copied in: **1 of
9 new tests fails**, `expected 61.64811030188034 to be less than 5` — matching the implementer's cited
61.65mm exactly (own independent construction of their rig). GREEN at `073202a4`: 33/33.

Read the actual diff (`scene3d.js`, `sliceAnalyticProjectLocal`): now tracks `best`/`bestAbsF` seeded
with the untouched input, accepts a step only if finite, within `4×max(sizes)`, and strictly reduces
`|F|`; first rejection returns `best`. Re-ran my own iteration-1 divergence construction (ellipsoid
20/12/16, p=(15,8,5)) directly against the real HEAD API: eps=1e-3/1e-4/1e-5, which pre-fix moved the
point 106/1060/10600mm, now all return the **input point unmoved, 0mm move, F unchanged** — bounded,
confirmed independently (different rig from the implementer's, same result).

**Flag 6 (number discrepancy) resolved**: my review's 106/1060/10600mm and the implementer's cited
61.6/617/6174mm are **both correct** — different rigs (mine: ellipsoid 20×12×16, p=(15,8,5); theirs:
sphere r=20, p=(20.5,0,0)). Reran the implementer's exact construction myself against pre-guard
`29203162`: got 61.65/617.37/6173.78mm, matching them digit-for-digit. Not a contradiction.

**Flag 3 (silent no-op on rejection)** — confirmed directly: a near-tangent case now returns the
**exact, bit-identical input point** (`out.x===p.x` etc.), i.e. that one ring point is silently left
unrefined at its raw (pre-Newton) accuracy while its neighbors on the same ring get corrected to machine
precision. This is an intentional, disclosed tradeoff ("never worse... than the point this function was
handed") and is strictly better than iteration 1's unbounded teleport, but **it is not tested or
surfaced** beyond the two narrow guard tests (no-teleport, no-NaN) — nothing confirms the rest of a ring
still improves around such a point, and nothing flags that this could read as a barely-visible flat spot
at exactly the ring's most curvature-sensitive locations. Acceptable as shipped; recommend a code
comment + a follow-up test asserting the rest of a ring with one degenerate point still converges
normally (not currently proven, though plausible from the a/c whole-ring numbers).

**Flag 4/5 — new finding, not previously flagged by either report**: the `4×max(sizes)` bound and the
"strictly reduces |F|" acceptance test both silently fail to protect **cylinder** against a free-axis
(Y) excursion, because cylinder's `F = (x/sx)²+(z/sz)²-1` is **provably y-independent** (verified: `gy`
is hard-coded `0` in `sliceSurfaceFG`'s cylinder branch — flag 5's exemption claim is TRUE). Constructed
directly against the real HEAD API — an elongated cylinder `sx=1,sy=50,sz=1` (a plausible "long thin
tube" object), a plane oriented nearly parallel to its axis (near-degenerate for this shape), point
`p=(1.3,10,0.1)` (F0=0.70, legitimately off-surface):

```
eps=0.3   → moves  1.06mm  along Y (10 → 11.0),   Fout=0.000000
eps=0.1   → moves  3.05mm  along Y (10 → 13.0),   Fout=0.000000
eps=0.03  → moves 10.13mm  along Y (10 → 20.1),   Fout=0.000000
eps=0.01  → moves 30.39mm  along Y (10 → 40.4),   Fout=0.000000
eps=0.003 → moves 101.28mm along Y (10 → 111.3),  Fout=0.000000   ← still ACCEPTED (scaleBound=200mm)
```

Every one of these is *accepted* by the guard — F stays exactly 0 the whole time (correct on the XZ
circle), so "strictly reduces |F|" is trivially satisfied at every step, and `dist` stays under the
200mm (`4×max(1,50,1,1)`) bound even at 101mm — over **twice the cylinder's own 50mm length**. The
guard's two safety checks are both blind to this because they were designed around primitives whose `F`
constrains every coordinate; cylinder is exactly the primitive the implementer's own section 2 already
proved does NOT do that. Scope: requires an elongated primitive (aspect ratio ≳ 20:1) *and* a
near-axis-parallel cutting plane — a real but narrower configuration than iteration 1's defect (which
fired on ANY primitive at ANY near-tangent point). Not re-tested by either the divergence-guard tests
(sphere-only) or the blocking-#2 tests (default-proportioned cylinder, well-conditioned plane). Flagging
as an open follow-up, not a re-REJECT — F correctness (the rendered cross-section) is preserved; only
the free axis can silently drift.

## Blocking #2 — oracle: FIXED for sphere/cone/torus, cylinder exemption verified TRUE

Applied **mutation B** (delete only the in-loop gradient-onto-plane projection line, keep the intra-loop
off-plane snap) to a fresh scratch export of HEAD myself:

```
sphere:   maxSurfErr 0.242147... > 0.15  → FAILS (matches impl's cited 0.242)
cone:     maxSurfErr 0.239530... > 0.15  → FAILS (matches impl's cited 0.240)
torus:    maxSurfErr 0.622124... > 0.15  → FAILS (matches impl's cited 0.622)
cylinder: PASSES (as documented — see below)
```

Numbers match the implementer's exactly. Applied **mutation C** (delete both the gradient projection
AND the intra-loop off-plane snap) myself as well: this time **all four** primitives fail, including
cylinder — because with the intra-loop snap gone, `maxPlaneErr` (the plane-membership half of the
oracle, which does not touch F at all) now catches cylinder too. This confirms the two-pronged design
(plane-membership + surface-residual, checked independently) is sound: mutation B is caught via surface
residual for 3/4 primitives, mutation C is caught via plane membership for all 4/4. The item-(a) ellipsoid
test (unchanged from iteration 1) continues to catch mutation C on its own (0.298mm > 0.15mm, as I found
in iteration 1). **Cylinder's exemption claim is mathematically verified true** — its implicit surface
really cannot distinguish "correct y" from "any y," so no F-based oracle can ever close that gap for it;
the fixture is honestly scoped and documented as such, not silently dropped.

## Item (b) — RESOLVED: my own iteration-1 number was a measurement error, not a real disagreement

Re-ran my exact iteration-1 rig (identity transform, `sx=20,sy=24,sz=20`, detail18, sliceCount22) against
`073202a4`, this time correctly applying the open-polyline-aware turn metric to the **refined** ring
(iteration 1's script had applied it to the RAW 150-point ring by mistake — the `refLen` values in my
own iteration-1 output, e.g. 1193 points at the peak plane, were never actually fed through the metric).
Correcting that: **overall worst = 7.085°, at plane 8** — matching the implementer's 7.09° figure.
**Their number was right; my prior 39.8° was measuring the wrong ring.** No unreconciled discrepancy
remains. Since 7.09° clears both the plan's ≤8° and R2's ≤12° bars at this rig, the underlying geometry
now numerically supports closing item (b) for the identity-transform/default-plane case — but:

**Flag 2 confirmed as written**: the committed test only asserts `expect(worst).toBeGreaterThan(0);
expect(worst).toBeLessThan(45);` (lines 1011-1012) — a placeholder, not a bar. It should be tightened to
`toBeLessThan(12)` (or `8`) now that the real number is known and reproduced by two independent
measurements, and a rotated/tilted variant (matching items a/c's own scope gap) is still missing before
item (b) can be called closed in general, not just at the shipped default rig. Recommend: tighten the
assertion in the next pass; do not cite the current test as proof of (b) until it is.

## Guards, re-run one file at a time at `073202a4`

All green: `scene3d-contour-slice` 33/33, `scene3d-mesh-self-occlusion` 5/5, `scene3d-curves` 13/13,
`scene3d-hlr-spatial-index-identity` 6/6, `scene3d-hlr` 11/11, `scene-xray-needs-fill` (integration)
17/17 — 85/85 total. Plane-count purity tests untouched (unaffected file region).

## Evidence

All 4 re-shot `after/W-27c/shots/**` cells (mtime 19:42, ahead of iteration 1's) viewed directly:
ellipsoid, cylinder, cone (Tier A ladder + Tier B none) — pixel-indistinguishable from iteration 1's
already-clean captures (smooth concentric curves, sharp uncorrupted apex, no gaps/fragments/new
artifacts). No visible regression from the guard, confirming the implementer's claim.

## Scope check

`git diff --stat 29203162..HEAD`: only `src/core/algorithms/scene3d.js` (+41/-5) and
`tests/unit/scene3d-contour-slice.test.js` (+295) — single commit, no stray files, matches the impl
report exactly.

## Verdict: ACCEPT-WITH-FOLLOWUPS

Both iteration-1 REJECT reasons are genuinely fixed, not just re-asserted: the catastrophic-divergence
bug is bounded (independently reproduced pre/post on two different rigs), and the item-(c) oracle now
demonstrably discriminates mutation B/C for 3 of 4 primitives with the 4th provably exempt. Item (b)'s
cross-report number conflict is resolved in the implementer's favor (my error). This unit may be
considered closed on items (a) and (c); item (b) remains honestly open. Required before anyone treats
item (b)/(c) as fully closed in general (not blocking this unit's own verdict):

1. **New, must-track follow-up**: harden the divergence guard for primitives whose `F` doesn't constrain
   every coordinate (cylinder today, possibly others later) — the free axis can still drift by
   multiples of the object's own length under a near-degenerate plane; `4×max(sizes)` does not catch it
   because it scales off the largest dimension, not the locally-relevant one.
2. Tighten item (b)'s `0 < worst < 45` placeholder to the real bar (≤8° or ≤12°) now that 7.09°/7.085°
   is confirmed by two independent measurements, and add a rotated/tilted variant before calling (b)
   closed in general.
3. Items (d) torus-hole fragments, (e) perf, and the stale gallery shots remain open exactly as before —
   not blocking, not addressed this iteration by design.
