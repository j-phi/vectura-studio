STATUS: ACCEPT-WITH-FOLLOWUPS

# W-33 — adversarial review

Lane under review: `fill-audit-a2` (worktree `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a2`,
branch `3d-scene/fill-audit-a2`), pinned range **e31d8591..c6ff81de**. Reviewed read-only: `git archive` of
both shas was taken to scratch export dirs before the W-36b implementer began editing the live worktree; the
live worktree was never read again after that point. All numbers below are measured independently in the
scratch exports (`node_modules` symlinked to main), not copied from the implementer's report.

## (1) RED reproduction, device space, open-polyline-aware

Copied `tests/unit/scene3d-fill-ruling-corners.test.js` (verbatim from the c6ff81de export) into a scratch
export of `e31d8591` and ran it there: **17/19 fail**, exactly the C1 (×8)/C2 (×4)/C3 (×4)/C4 (×1) rows; C5
(synthetic oracle sanity) and C6 (point-count ceiling) pass at RED by construction, as designed. Camera-a
failures measured **31.235063882381258°**, camera-b **38.34903...°**, on all four primitives — matches the
plan's §B2 table and the impl report to the digit.

Open-polyline-awareness verified independently, not by re-running the shipped test: instrumented the
oracle's own `lo`/`hi` index selection (copied verbatim `m1()`/`isClosedPts()` logic) on a 6-point open run
and a 5-point closed ring. Confirmed by direct index enumeration — not a geometric guess — that for an open
run the two true endpoints (index 0, index n-1) are **never** selected as the checked vertex `b`, and the
`(i±1+n)%n` modular arithmetic never actually wraps for any checked `i` (lo=1, hi=n-2 keeps every neighbour
reference in-bounds without needing the modulus), so no phantom edge between an open run's unrelated first
and last points can ever enter a turn computation. For a closed ring, the seam vertex (index 0 after
stripping the duplicate) **is** checked, using its real wrap neighbours, which is correct. My first attempt at
this probe was a flawed test design (it conflated a real neighbour relationship with a phantom wrap); the
corrected index-enumeration probe is the one reported here.

## (2) GREEN + mutation (revert → RED)

19/19 green on the c6ff81de export, C2's console output matching the impl report's post-fit numbers to the
hundredth (capsule 14.72°, cone 28.07°, cylinder 28.23°, sphere 15.37°).

Mutation: in a throwaway copy of the c6ff81de export (never the worktree), neutered `refineFillRunTurns` to
an unconditional `return` at its first line. Result: **17/19 fail again**, and the camera-a failure value
(`31.235063882385155°`) is bit-for-bit the same number as the true e31d8591 RED run — proof the fix, not
some other coincidental change, is what the oracle is keying on. Mutant dir deleted immediately after.

## (3) Per-primitive max corner, before → after

Direct numeric probe (no pass/fail, just the raw M1), run in both scratch exports:

| primitive | cam a before | cam a after | cam b before | cam b after |
|---|---|---|---|---|
| capsule | 31.24° | 7.48° | 38.35° | 7.83° |
| cone | 31.24° | 7.75° | 38.35° | 7.84° |
| cylinder | 31.24° | 7.48° | 38.35° | 7.36° |
| sphere | 31.24° | 7.81° | 38.35° | 7.98° |

Every after-value is under the 8° bar, several close to it (7.98° is the closest margin, sphere cam b) but
none over. `sphere·contour·d50·cam a` total `sceneFill` points: **353 → 752** (+113%), matching the impl
report and C6's revised ≤2.3× bar (1.6× estimate would have rejected this fix; the report's disclosure that
the plan's own estimate was wrong is itself correct — see (secretary flag 1) below).

## (4a) Torus contour d=50 MD5 re-pin — geometry-only, not placement

Structural probe (not just the hash) on `torus + contour + ladder @ d=50`: **PATH_COUNT = 94 in both trees**
(identical). Per-path comparison across all 94 rings: **0 first-point diffs, 0 last-point diffs, 0
meta/sceneTarget diffs**; only the interior point **count** differs, on 56 of 94 rings (the rings that were
over 8° pre-fix and got bisected). This is exactly what `refineFillRunTurns` claims to do — insert interior
points only, never touch endpoints, never touch ring/path count or `meta`. The MD5 re-pin is legitimate: it
moved *because* ring point geometry changed, not because of a hidden placement or ring-count change.

## (4b) W-36 P6 sphere-contour ink re-pin — tightening, and actually necessary

`toBeCloseTo(x, 0)` → `toBeCloseTo(x, 1)` is a **tightening** (precision band 0.5mm → 0.05mm), not a widened
tolerance — correctly disclosed as such. Measured directly: `sphere/contour/d50` ink is **656.3820mm at
e31d8591** and **657.2541mm at c6ff81de** (Δ +0.872mm, matches the report's "+0.85mm" within their own
rounding), fill **count unchanged at 18** in both trees. The re-pin was *necessary*, not gratuitous: the old
`toBeCloseTo(656.4, 0)` assertion would fail against 657.2541 (|Δ|=0.854 > 0.5 tolerance); the new
`toBeCloseTo(657.25, 1)` correctly passes (|Δ|=0.0041 < 0.05). Confirmed the same probe's `sphere/hatch/d50`
(723.4371mm/24) and `cylinder/hatch/d220` (4495.5129mm/145) are **byte-identical** between trees — the ink
drift is isolated to the in-scope contour cell, not a broader hidden change.

No other bar moved beyond the three disclosed in the impl report (fingerprint re-pin, P6 tightening, C6
1.6×→2.3×) — confirmed by diffing every guard-list test file between the two scratch exports; only the three
named files (`surface-fill.js`, `scene3d-crosshatch-parity.test.js`,
`scene3d-curved-density-sparse-end.test.js`) plus the new `scene3d-fill-ruling-corners.test.js` differ at
all.

## (5) Guards, W-26, plot-safety, T1 mkTick, O3

All run foreground, one file (or a small explicit batch) at a time, on the c6ff81de export:

- `scene3d-fill-boundary-ends.test.js` — **41/41**, file byte-identical to e31d8591 (untouched).
- `scene3d-fill-even-spacing.test.js` — 12/12 (W-26 evenness/gap-jump bar).
- `scene3d-ladder-uniform-field-spacing.test.js` — 9/9.
- `scene3d-plot-safety.test.js` — 5/5 + 1 pre-existing conditional skip (`STAGE.coverageCap` gate, file
  untouched, identical skip on e31d8591).
- `scene3d-mark-laws-draw.test.js` (T1/T1b mkTick oracles, includes an explicit `mkTick`+`contour`+torus
  case) — 23/23.
- `scene3d-curves.test.js` — 13/13. `scene3d-mappers.test.js` (buckyball spiral fingerprint, faceted
  byte-identity) — 32/32.
- `scene3d-fill-span-verdict` + `scene3d-fill-seam-continuity` + `scene3d-fill-ruling-continuity` — 26/26 (+1
  pre-existing skip).
- `scene3d-crosshatch-parity.test.js` (W-36 parity, P1-P6) — **37/37**, exactly as the impl report claims.
  Since the file diff between trees is confined to the two P6 lines, and P1-P5 (family counts/gap medians on
  sphere/cylinder crosshatch etc.) pass unchanged, W-36's parity property is preserved.
- Eight more named guards (appdefault-lit-floor, curved-density-floor, curved-fill-angle-migration,
  faceted-density-calibration, faceted-hatch-density-angle-stable, hatch-density-500/floor/rescale) — 97/98
  (1 pre-existing skip).
- Thirteen more (hl-stage-roster, insert-default-ink, mapper-controls, mesh-self-occlusion,
  one-pen-down-reachability, ribbon-outline-fill-seam, ribbon-primitives, rounded-line-finish-defaults,
  shadow-anatomy, style-fill-lines, surface-fill, tone-quant-flow-live, xray-fold) — 146/148 (2 pre-existing
  skips).
- `scene3d-hatch-density-angle-stable.test.js` — **2/9 fail**, byte-identical failure count and file content
  to e31d8591 (`diff -q` silent). Confirmed pre-existing (W-36), not introduced here.
- `scene3d-curved-density-sparse-end.test.js` (the re-pinned file) — **20/20** including the re-pin.
- **O3** (`tests/unit/scene3d-fill-silhouette-overshoot.test.js`, W-32's oracle) does not exist in either
  scratch export — confirmed absent by directory listing on both shas. The impl report's disclosure that it
  could not be run in the same run is accurate, not a dodge.

## (6) Byte-identity of non-contour laws

`sceneEdge` (border/crease/boundary) paths on all four gallery primitives (contour rig, d50) are **MD5
byte-identical** between trees (capsule/cone/cylinder/sphere, all four hashes match). A 12-cell MD5 sample —
`{sphere, torus, cylinder} × {hatch, crosshatch} × {ladder, mkTick}` at d50 — is **byte-identical on all 12**
(count and full-path MD5 match exactly), and none of the sampled runs are closed rings (`anyClosed=false`
everywhere), so the "closed ring on any mapper" exemption never fires in this sample — consistent with the
scope claim.

## (7) The "fitter limitation" follow-up — reproduced, and it is NOT W-37

Reproduced exactly: on the app-default scene, RAW polyline worst M1 ≤ 8° on all four primitives (max 7.99°),
but the `fillCurves`-fitted/flattened polyline reads **14.72° / 28.07° / 28.23° / 15.37°** — identical to the
implementer's numbers.

Checked the mechanism directly, not just the symptom: instrumented `toCurveAnchors`'s gate (via the presence
of real `meta.anchors`) on every app-default contour ring across all four primitives. **The gate never
declines** (`anyGateDecline=false` on all four) — every ring gets real bezier anchors. This is the opposite
of W-37's mechanism (`toCurveAnchors` returning `{straight:true}`, the gate refusing to engage on
contourSlice output). Here the gate *engages* and *still* produces an over-bar result — inspecting the
flattened point counts (e.g. cone: 34 raw points → 12 flattened points) shows `flattenSmoothedPath` is
actually **reducing** density in the region the targeted-bisection fix made locally dense, which is
consistent with the report's diagnosis (a Catmull-Rom-family interpolation not built for a non-uniform
sample-density gradient). **Conclusion: this is correctly a new, distinct follow-up, not W-37** — the
implementer's framing is accurate, and it was disclosed rather than smuggled into this unit's asserted bar
(C2 measures-and-reports the post-fit number, does not hard-assert it).

## (8) Visual inspection — all 8 PNGs + native-resolution crops

Viewed all 8 evidence images (`capsule/cone/cylinder/sphere × {a,b}`, `after/W-33/shots/A/`). At whole-cell
resolution every ring on every primitive reads as a smooth ellipse/circle — no visible faceting anywhere,
including the poles/caps that were the worst offenders pre-fix.

Cropped two at native resolution (Pillow, 6×, from the actual PNG files):
- `capsule__contour__ladder__med__a.webp`, crop `(150,10)-(310,90)` (the plan's own named crop): the
  innermost cap ring reads as a clean, continuous ellipse with rounded major-axis tips — no corner, no
  facet, matching the impl report's description exactly.
- `cone__contour__ladder__med__b.webp`, crop `(140,10)-(320,110)`: the stacked rings near the apex read as
  smooth curved arcs; no polygon vertices visible at this zoom.

Harness-clean and app-clean agree here.

## (9) Merge risk against current main (e429cfc5 / 1193cbe1) — REAL, FLAGGED

`e429cfc5` (U0 sweep chunking) does not touch any file this unit touches — no conflict there.

`1193cbe1` ("round byte-identity/golden comparisons to fix arm64 vs x86_64 CI drift") **does** touch
`tests/unit/scene3d-curved-density-sparse-end.test.js` — the exact file W-33 re-pinned. It replaced the
file's `runMd5` helper from `md5(JSON.stringify(run(...)))` to
`md5(JSON.stringify(normalizePaths(run(...))))` (rounded via `tests/helpers/path-signature.js`) and
regenerated every golden hash in the file against that new mechanism, **including the
`torus + contour + ladder @ d=50` row** (main's current golden: `c049412aaed515dd6c82c91c53d0bd9f`, computed
against the OLD, pre-W-33, un-fixed geometry).

`e31d8591` (this lane's base) and `1193cbe1` are on **divergent history** (neither is an ancestor of the
other) — this lane branched before `1193cbe1` landed on main and has not incorporated it.

Verified directly, computationally, that **W-33's committed re-pin does not survive an as-is merge**:
- Old mechanism, on this branch's FIXED geometry: `5d5e4e87f98447a282188c182b243cf5` — matches W-33's
  committed value exactly (self-consistent with the mechanism that existed on this branch).
- New (`1193cbe1`) mechanism, on this branch's SAME FIXED geometry (computed here with main's actual
  `normalizePaths` helper): `bc212164fdc8e72486dcef4e200eaa8d` — matches **neither** W-33's committed hash
  **nor** main's currently-pinned hash. Neither side of a naive merge (take-mine, take-theirs) produces a
  correct golden value; the row must be **regenerated post-merge** against the truly-merged source, exactly
  as this same file's own pre-existing "MERGE NOTE" comment (for the neighbouring
  `torus + hatch + bundleCount` row) already requires other integrators to do.

This is not a defect in W-33's own work — the re-pin is internally correct for the mechanism that existed on
its branch, and is properly disclosed. It is an **integration hazard for whoever merges this lane**: a
naive merge/rebase onto current main will either silently drop the arm64/x86_64 CI-drift fix for this row
(if W-33's side is taken) or silently drop W-33's turn-refinement coverage (if main's side is taken). Flagging
for the orchestrator/integrator — the correct action is to regenerate this one golden hash against the merged
source, the same way the file's existing MERGE NOTE already instructs for its neighbour.

## Secretary flags — addressed

1. **C6 1.6× → 2.3× convergence proof, reproduced.** `FILL_REFINE_MAX_ROUNDS` set to 6 (shipped), 8, and 12
   in three scratch copies of the c6ff81de export: `sphere·contour·d50·cam a` total points measured
   **752, 752, 752** — bit-identical across all three round budgets. This is a genuinely converged cost, not
   an under-bounded round count; the plan's original 1.6× estimate was wrong for the stated reason (17/18
   rulings were already over 8° pre-fix, not 1-2), and the report's revision to a measured 2.3× is honest,
   not a fudge.
2. **Un-gated wraparound (`t1 < t0` vs `closed === true`) — no closed-ring regression found.** C4 (closed
   rings, wrap turn included) passes at GREEN with real numbers (7.81-7.98° across the four primitives,
   §(3) above) and fails correctly under mutation. The 12-cell hatch/crosshatch MD5 sample (§6) — all
   byte-identical, all `anyClosed=false` — shows the change did not perturb any non-contour closed-ring case
   in the sample (none of the sampled cells contain closed rings to begin with, which itself is consistent
   with the plan's own claim that hatch/crosshatch on these primitives run open). The torus contour
   structural diff (§4a) — 0 endpoint diffs, 0 count diffs across 94 closed rings — is the most direct
   evidence that the un-gating did not regress ordinary closed-ring behaviour: every closed ring's start/end
   is untouched, only interior points were added.
3. **P6 re-pin necessity, confirmed.** See (4b): the delta (+0.872mm measured) exceeds the OLD tolerance's
   0.5mm band, so the re-pin was required, not optional, and it is driven purely by the in-scope contour
   cell (hatch/crosshatch controls in the same file are byte-identical).

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** Every RED/GREEN/mutation proof, the per-primitive numbers, the two disclosed test
re-pins, and the C6 bar revision all reproduce independently and exactly. Scope discipline held (byte-identity
confirmed broadly: edges, 12 non-contour law/tone-law combos, W-36's own 37/37 parity suite). Two follow-ups,
neither blocking this unit's own correctness:

1. The fitter-limitation follow-up is real, reproduced, and correctly identified as a NEW item (the fitter's
   gate engages fine; its Catmull-Rom-family flattening mishandles the fix's own non-uniform point density) —
   not W-37 (whose mechanism is the gate declining). File it as such, do not fold it into W-37.
2. **New finding, not in the implementer's report**: the `scene3d-curved-density-sparse-end.test.js` MD5
   re-pin will not survive a merge onto current main as-is — main's `1193cbe1` changed that file's hashing
   mechanism after this lane branched. Flag for the integrator: regenerate the
   `torus + contour + ladder @ d=50` golden against the truly-merged source (measured here, for reference only:
   `bc212164fdc8e72486dcef4e200eaa8d` under `normalizePaths`-mechanism hashing of this branch's fixed
   geometry — re-verify against the actual merge, do not take this number on faith).
