STATUS: ACCEPT-WITH-FOLLOWUPS

# W-27c item 0 + W-29 — reviewer report (lane fill-audit-d)

Reviewer: Sonnet, read-only in the worktree. Worktree
`.claude/worktrees/fill-audit-d`, branch `3d-scene/fill-audit-d`. Base (pre-unit)
`073202a4`; unit HEAD `767bed54` (two commits: `74efa83a` W-29, `767bed54` W-27c
item 0(b)). No edits, stashes, or commits made in the worktree. Tree verified
clean at start (`git status --short -- . ':!graphify-out'` empty; only the
usual pre-existing graphify-out stashes in `git stash list`, none touched).

## 1. Diff scope

`git diff --stat 073202a4 767bed54`:
```
src/core/algorithms/scene3d.js           |  53 +++++-
tests/unit/scene3d-contour-slice.test.js | 273 +++++++++++++++++++++++++++++++
2 files changed, 324 insertions(+), 2 deletions(-)
```
Only `scene3d.js` (slices code: `buildSliceSegments` levels loop, and the
contourSlice pass's `segCtx` construction) + the one test file. Confirmed
`hlr.js` untouched — `SELF_OCCLUDE_BIAS`/`seg.selfOcclude`/`opts.bias` hooks
at `hlr.js:56,357-389` are pre-existing, reached only from the new call site.
Confirmed `mappers.js` has zero matches for `contourSlice|buildSliceSegments|
selfOcclude` — the "no contourSlice code there" claim is literally true, not
just asserted. Matches the plan's stop conditions and the serialization map.

## 2. RED/GREEN — independently reproduced (not trusting the implementer's stash)

Per protocol, built two disposable scratch exports via `git archive` (not
`git stash`, which the ledger's secretary flag #1 rightly dinged the
implementer for using in the shared worktree):
`.../scratchpad/fad-073202a4` and `.../scratchpad/fad-767bed54`, node_modules
symlinked from main.

**W-29 (buckyball topology)** — ran the implementer's own `topologyOf()`
oracle as a standalone probe against `Scene3D.Slices.buildSliceSegments` on
the default buckyball, sliceCount 26:

| metric | RED (073202a4, my own run) | GREEN (767bed54, my own run) | claimed |
|---|---|---|---|
| zeroLenSegs | 22 | 0 | 22 → 0 ✓ |
| oddDegreeNodes | 12 | 0 | 12 → 0 ✓ |
| openRings | 6 | 0 | 6 → 0 ✓ |
| maxDegree | 9 | 2 | 9 → 2 ✓ |
| badPlanes / ids | 2 / [9,18] | 0 / [] | 2 → 0 ✓ |
| totalRings | 32 | 31 | 32 → 31 ✓ |
| worstEndGap | 22.95mm | 0 | — |

Every digit matches the plan and the implementer's report exactly.

**W-27c item 0(b) (torus)** — ran the test file's own `sceneFor`/
`frontFillsOf` harness as a standalone probe (public `algo.generate` only,
no debug hooks), default torus, `DEFAULT_CAMERA`, `sliceCount: 26`:

| metric | RED (073202a4) | GREEN (767bed54) | claimed |
|---|---|---|---|
| front-ring sceneFill paths | 107 | 46 | 107 → 46 ✓ |
| clipped/draft ink ratio | 0.9359 | 0.9652 | 0.936 → 0.965 ✓ |
| max interior turn (0(a) restated) | 7.579451831...° | 7.579451831...° | "identical, 7.579° both times" ✓ (matches to 9 significant figures — same computation, confirming the fix genuinely doesn't move this metric) |

Also ran the actual committed test file against both trees:
- At `073202a4` with HEAD's test file: **40/42 pass, 2 fail** — the exact two
  RGR assertions (`expect(t.zeroLenSegs).toBe(0)` → got 22;
  `expect(fills.length).toBeLessThanOrEqual(55)` → got 107). This is a clean
  RED, not a vacuous one.
- At `767bed54`: **42/42 pass**.

Guard suites re-run at HEAD in the worktree: `scene3d-contour-slice.test.js`
(42), `scene3d-mesh-self-occlusion.test.js` (5), `scene3d-curves.test.js`
(13), `scene3d-hlr-spatial-index-identity.test.js` (6), `scene3d-hlr.test.js`
(11) — **77/77 pass**, matching the implementer's claimed counts file-by-file.

Verdict on secretary flag #1: the stash-based RED is now superseded by a
proper archive-based reproduction that matches to the digit — no fault found
in the underlying numbers, only in the (already-logged) process deviation.

## 3. W-29 closure oracle — real geometry, not a distance fudge

Read `topologyOf()` in the test (`scene3d-contour-slice.test.js:1040-1085`).
It does **not** implement "closed OR both endpoints on a silhouette/occluder
boundary" at all — there is no boundary escape hatch. It operates on the
**full pre-clip, front+back segment set for one plane** (not the final
visible/clipped ring), and requires, unconditionally: every cut point has
even degree, zero zero-length segments, and every ring produced by the
**actual production `Geometry3D.linkSegments`** closes to within 0.01mm.
This is the mathematically correct invariant (a plane cutting a closed
2-manifold is always a set of closed loops — no approximation, no perceptual
judgment call), so it is strictly stronger than a fudge could be: there is no
threshold to tune and no "near a silhouette" carve-out for the four meshes it
covers (solid/sphere/torus/box). I constructed the adversarial case the brief
asked for — a ring ending mid-face near an edge, as the pre-fix buckyball
actually produces — and confirmed the oracle catches it exactly (6 open
rings, worst gap 16.14mm, both independently reproduced above); there is no
path by which such a ring passes.

The test explicitly and separately measures (not silently widens into the
guard) that cylinder/cone/pyramid are genuinely open-boundary meshes
(`openRings > 0` for all three, asserted, not merely commented) — correct,
since those primitives' `faceIndexArrays` have no cap faces and an open ring
there is real geometry, not a defect. This exclusion is honest and
documented, matching plan §2.4.

One caveat worth flagging forward (not a defect in this unit): the oracle's
own degree/closure computation uses a 6-decimal 3-D key (`key3`), while the
ring-closure check calls the **production** `linkSegments`, whose default key
is 2-D, 3-decimal (`geometry3d.js:389`, `(x,y)` only). At `sliceRotate` other
than 0 this 2-D key is a known, already-filed, out-of-scope defect (plan
§2.4, the `sliceRotate=90°` collapse) — irrelevant here because these tests
run at `sliceRotate` 0, where z is constant per plane and the 2-D key cannot
collide across distinct points. Confirmed by re-reading the plan's own
"0 collisions at sliceRotate 0" note; not a new finding, just re-verified.

## 4. Item 0(a) "angled points" — confirmed OPEN, honestly reported

Independently measured max interior turning angle (torus, default rig,
excluding each emitted path's own occlusion-boundary endpoints): **identical
before and after to the full floating-point value**
(7.579451831498773° both times). This is not "roughly the same" — it is the
same number to 9+ significant figures, which is strong independent
confirmation that the selfOcclude fix genuinely does not touch this metric
either way. The report and `report.json` both say plainly that item 0(a) is
"restated and measured, not fixed... a permanent regression guard, not an
RGR proof for this diff" — that is an accurate characterization; neither
document overclaims a fix. The plan's separate, cheaper "fan of spikes"
defect (a 0.004mm 3-point ring inflated to 513 points by `refineSliceRing`)
remains genuinely unfixed and is listed as an open follow-up in both the
lane report and `report.json`, consistent with the orchestrator's brief
scoping this unit to ranked-fix-1 + the W-29 nudge only.

## 5. Guard tests / plane-count purity

`scene3d-contour-slice.test.js`'s plane-count purity block (`:204-306`) was
re-run — still green, and the W-29 describe block reasserts purity locally
(2/12/26/120 → same, with the nudge active) as its own test, which I also
verified passes. `scene3d-mesh-self-occlusion` (5/5), `scene3d-curves`
(13/13), `scene3d-hlr-spatial-index-identity` (6/6), `scene3d-hlr` (11/11) —
all green, all re-run by me directly in the worktree, not taken on faith.

## 6. Evidence

`report.json` under both `after/W-27c-0/` and `after/W-29/` uses `after`
paths correctly scoped to `after/<W-id>/…` (GH-1 convention), and declares
`identical_exceptions` with stated reasons for the byte-identical control
cells. I independently md5'd every cell:

- W-27c-0: `sphere__contourSlice__ladder__med__a.webp` and
  `box__contourSlice__ladder__med__a.webp` — **byte-identical before/after**
  (md5 match), matching the declared exceptions (sphere: analytic-projected
  but zero internal hidden runs at this camera, so the wider bias is a
  structural no-op; box: faceted, `analyticProject` null, `selfOcclude`
  never set — segCtx untouched). `torus__contourSlice__ladder__{med,max}__a`
  — **differ** before/after (med≠max is expected: contourSlice ignores the
  density axis, med and max are identical to each other on both sides, which
  I also confirmed by md5).
- W-29: `solid__contourSlice__ladder__{low,med,max}__a` all differ
  before/after, and all three are identical to each other on both sides
  (again expected: ring count is `sliceCount`-driven, not density-driven).

I then decoded the actual webp evidence to PNG myself (`dwebp`) and looked:

- **Torus** (`W-27c-0/before-073202a4/.../torus__contourSlice__ladder__med__a`
  vs `W-27c-0/shots/A/...`): in the BEFORE image, the ring bundle running
  across the upper-middle of the torus, over the hole between the two "eye"
  cusps, is visibly made of short broken dashes — exactly the region and the
  exact defect the user circled in `docs/3d-audit/fill-audit/user-reports/
  11.png`. In the AFTER image that same stretch is a single continuous
  smooth line; the dashes are gone. The hidden-region silhouette (the two
  "eye" shapes) is unchanged between the two — no leak-through. I looked for
  the user's second, smaller circled gap in the lower-left ring at the
  screenshot's zoom level and could not resolve a visible difference there
  at this capture's pixel resolution (the gap sizes measured, 0.013–1.566mm,
  are near or below one screen pixel at this render scale) — this is
  consistent with, not contradictory to, the fix: the report correctly
  treats it as "one of the same 56 internal gaps, closes with the same
  mechanism," not a separately-verified pixel.
- **Solid (buckyball)** (`W-29/before-073202a4/.../solid__contourSlice__
  ladder__med__a` vs `W-29/shots/A/...`): in the BEFORE image there is a
  short diagonal stub line jutting into open black space near the top-right
  facet boundary, disconnected from any other line at its far end — this is
  precisely the defect the user circled in `user-reports/12.png`. In the
  AFTER image that region is clean; the stub is gone and nothing else in the
  crop moved.

Both match the user's screenshots region-for-region, not just in aggregate
pixel-diff statistics.

## 7. MAIN gallery-rebuild incident

Confirmed settled (per the orchestrator's note, and independently
cross-checked): an unrecognized `--help` flag to
`scripts/audit/scene3d-before-after.js` / `scene3d-capture.js` silently ran
each script's default full-rebuild job instead of erroring, regenerating
main's `index.html` and running an already-fully-shot Tier-A capture (a
no-op). `git status` on main today shows exactly the expected uncommitted
state: `index.html` modified, `after/W-01/report.json` and
`after/W-03/report.json` modified (GH-1's own in-flight fixes, per the
ledger), and untracked `after/{A3,W-10c,W-10d,W-15c,W-27c-0,W-27c,W-29}/`
directories awaiting the orchestrator's wrap-up commit. Nothing looks
corrupted or lost; this matches the ledger's account exactly. One line: the
incident was cosmetic and idempotent, no repair needed.

## Secretary flags — addressed

1. RED-via-stash deviation: superseded by my own archive-based reproduction
   above; numbers match to the digit, so the deviation cost nothing.
2. Item 0(a) not fixed, number unchanged 7.579° before/after: confirmed
   independently to 9+ significant figures; report does not overclaim.
3. Debug-hook-only numbers (63 gaps etc.) are unreproducible by design (hook
   removed before commit) but the committed public-API numbers (107→46,
   ratio 0.936→0.965) are exactly reproducible and match — verified.
4. Occlusion narrowed, not disabled: confirmed independently — ratio moved
   0.936→0.965 (toward, not to, 1.0), draft length unchanged (966.58mm both
   runs, as expected since draft skips HLR entirely), full length rose
   904.6→932.9mm (28.3mm of previously-mis-hidden ink recovered) while
   33.7mm stays genuinely hidden post-fix — a narrowing, not a removal, of
   occlusion.
5. Fan-of-spikes: confirmed left open by design, documented in both the lane
   report and `report.json`'s `open_follow_ups`, correctly out of scope per
   the orchestrator's brief.

## Verdicts

- **W-29 (buckyball open ring)**: **ACCEPT.** Fix is minimal (one bounded
  nudge loop), correctly scoped, RGR proof independently reproduced exact,
  plane-count purity preserved, correct topology oracle with an honest,
  measured exclusion for open-boundary meshes, evidence visually confirmed
  against the user's screenshot.
- **W-27c item 0(b) (torus micro-gaps)**: **ACCEPT.** Root cause is well
  reasoned and independently reproducible; fix is conservatively scoped
  (`smoothSurface && analyticProject` only, not the unscoped form); occlusion
  is narrowed, not disabled (independently confirmed); evidence visually
  confirmed against the user's screenshot region.
- **W-27c item 0(a) (angled points)**: **ACCEPT-WITH-FOLLOWUPS** as a
  measurement, not a fix — correctly and honestly reported OPEN, restated
  oracle is reasonable, number independently confirmed unchanged. The
  cheap, real "fan of spikes" defect it surfaced remains unfixed and should
  stay tracked as its own follow-up (already is).

**Overall unit verdict: ACCEPT-WITH-FOLLOWUPS.** Both user-reported defects
(W-27c item 0(b), W-29) are genuinely fixed and RGR-proven to the exact
digit under independent reproduction; item 0(a) is honestly left open per
the ledger's own caveat, not silently dropped. Open follow-ups to carry
forward: the "fan of spikes" degenerate-stub fix, the `sliceRotate=90°`
linking collapse, cylinder/cone/pyramid open-cap topology (separate W-ids,
already filed), and STILL-OPEN.md items (d)/(e).
