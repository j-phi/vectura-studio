STATUS: MEASURED

# W-15c design D — implementer report (F-14 remainder: graded case Density-blind)

**Lane** fill-audit-2 · worktree `.claude/worktrees/fill-audit-2` · branch `3d-scene/fill-audit-2` ·
port 8476 · base **main 47a5a755 (v1.3.99)**. **Final state: worktree reverted to base, byte-for-byte —
no source change ships.** `git status --short` is empty; `git diff --stat` against `47a5a755` is empty.
No commit was made (there is nothing new to commit).

## Summary

Fix 1 from `W-15c-D-plan.md` (per-object carrier normalisation, λ) was implemented, iterated through
three variants, and RED-oracle-verified to genuinely fix the reported plateau (box `face:+X`/`face:+Y`
ink strictly increasing with Density, `solid`'s carrier no longer flat at 35 paths). But every variant
**fails its own required oracle** — it breaks `scene3d-facet-tone.test.js` (two sub-tests: O21 and,
more importantly, **O28 view-independence**) and cannot clear `scene3d-subwindow-density.test.js`'s
0.4 bar even at the plan's own `LAM_MIN = 0.6`. Per the plan's stop conditions ("any O20/O9/O14
assertion fails at any λ … the subwindow probe exceeds 0.4 … ship the measurement rather than trade an
invariant for F-14") and the orchestrator's instruction ("implement fix #1 unless it fails its own
oracle, then report before trying #2"), the work is reverted and reported rather than shipped or
force-fitted. **A new, previously-undocumented root cause for the O28 failure is included below** — it
generalises to Fix 2 as well (same underlying mechanism), so Fix 2 is very unlikely to fare better
without a redesign that avoids camera-projected quantities in the λ derivation.

## What was implemented and measured (then reverted)

**Mechanism (final variant, closest to the plan's own wording).** A memoised `recordCarrierNorm(record,
styleParams)` walked every FRONT face of a graded (non-solo) record, rebuilding `faceUVScaffold` →
`spacingBand` → `uvPitchFactor`/`perpExtentUV` (extracted to a standalone `perpExtentUVFor(scaf, deg)`
so it could be evaluated for faces other than the one currently being rendered) to get each facet's
`naturalPlane_i`, `ext_i`, `covOne_i`. The "binding" facet `w` (argmin `ext_i/naturalPlane_i`, i.e. fewest
natural rulings) was targeted with the same Density-tracking rule W-15c already ships for solo
records — `Nw = clamp(round(ext_w/hatchSpacing(fillDensity) − 0.5), FACET_MIN_RULINGS, floor(zoneCeil_w
/covOne_w))` — and `λ = clamp((ext_w/(Nw+0.5))/naturalPlane_w, LAM_MIN=0.6, 1)`. This λ was applied to
**only the carrier family (`plan[0]`)** of every face on the object, injected right after `const plan =
asks.map(...)` (matching the plan's own "unlocking measurement" wording — `f.plane *= λ` before the
existing forEach) and left the rest of the existing floor/ceiling logic completely untouched. `λ = 1`
is byte-identical to today by construction.

**RED proof achieved (before reverting).** With this mechanism:
- `tests/unit/scene3d-box-density-bearing.test.js`: box `face:+X@78` ink 86/86/…/88/111/149/239/351 at
  d=5/10/…/60/70/80/90/100 — flat through ~d=50-55 then strictly increasing (old plateau ran to ~d=70).
  `face:+Y@3` ink 106 flat through ~d=80, then 106/115/169 at d=80/90/100 (old plateau ran to ~d=90). Both
  are genuine, monotonic improvements over the flat `[86,86,86]`/`[106,106,106]` pins, though the
  crossover lands later than the plan's originally-sketched d=50 sample point (arithmetic below).
- `tests/unit/scene3d-faceted-density-calibration.test.js`: a new RGR test, `fillLineCount(d,'solid')`
  at d=1/25/50, went from the pinned flat `[35,35,35]` to strictly increasing.
- The two "must-stay-green, not listed as expected re-pins" tests in the same file — "no rendered fill
  family ever rotates" and "ACCEPTED: the dark facet gains a second direction between Density 20 and
  30" — **also stayed green** once the λ injection was restricted to `plan[0]` only (an earlier variant
  that scaled every family, i>0 included, moved the dark facet's family-switch knee from Density 30 down
  to 20 and broke the second test; restricting to the carrier fixed that regression).
- Fingerprints re-pinned (with proof) for box d=10/24/50/100 and solid d=50/150; box d=150, `plane`
  (solo, untouched — `!soloOrient` gates it out entirely) and `sphere` (curved, not this path) confirmed
  BYTE-IDENTICAL to the existing pins.

**Why it does not ship — three independent failures against the guard list:**

1. **`scene3d-subwindow-density.test.js` — "the probe can say NO … reads clean"**: measured **0.498**
   against the **0.4 bar**, at `LAM_MIN = 0.6` (the exact value the plan derived from this same probe:
   "0.523 vs 0.4 bar at λ=0.5 FAIL, green at λ=0.7 — hence LAM_MIN=0.6"). I could not reproduce "green at
   0.6" on `R2-cube-bands4` with either the derived λ (which happened to clamp to exactly 0.6 for this
   fixture) or a blunt hard-coded `λ = 0.6` constant — both gave the identical 0.498 (confirming the two
   are numerically equivalent for this specific fixture, and ruling out a bug in my λ derivation as the
   cause of this specific failure). Either the plan's own scratch measurement used a mechanism that
   differs from "scale the carrier's `plane` by λ before the floor logic" in some detail I did not
   reproduce, or the LAM_MIN=0.6 boundary is tighter than the plan's own number suggests for the current
   (post-merge, v1.3.99) source. I did not lower LAM_MIN to compensate — the plan explicitly forbids
   this, and it is the guard that sets the floor in the first place.

2. **`scene3d-facet-tone.test.js` — O21, "a T facet carries a SECOND FAMILY at its own pitch, an F facet
   a lighter one"**: `ratio(T)` measured **0.593** against the **>0.75** bar (both the derived-λ and the
   blunt-0.6 variant). Scaling only the carrier (never the crossed family, per §5.3's withdrawal) still
   shifts where the *carrier* clears its own fit gate, which indirectly changes how much of the zone's
   composed budget is left for the crossed family — a second-order interaction the plan's §4 arithmetic
   doesn't appear to price in.

3. **`scene3d-facet-tone.test.js` — O28, "is VIEW-INDEPENDENT: orbiting the camera does not re-grade the
   facets"** — **NEW FINDING, not in the plan.** This is the more serious one, because it is architectural
   rather than a tuning miss. `recordCarrierNorm`'s "binding facet" selection (and its `ext`/`k`/
   `naturalPlane` inputs) is built from `faceUVScaffold`/`uvPitchFactor`/`perpExtentUV`, all of which route
   through `scaf.toScreen` — i.e. the **camera projection**. The plan's own step 1 says to walk the
   record's *front* faces, which is itself a camera-dependent set (which faces are front-facing changes
   as the object orbits). So which facet becomes "binding," and therefore the single λ applied to *every*
   facet's carrier, can differ between two camera angles even though the object, light and Density are
   identical. O28's test isolates exactly this: it renders the SAME cube at two very different yaws,
   normalises each facet's toned ink against a flat-ladder control (to cancel ordinary projection/shear
   differences), and requires the surviving toned/flat ratio to agree within ±6% between the two views —
   because tone GRADE is supposed to be a property of the object and the light only (this is the same
   invariant `recordBands` was built to protect, per its own comment: "so the grade is a property of the
   object and the light and never of where the camera happens to be"). With the blunt λ=0.6 constant (no
   per-view recomputation), O28 passed trivially. With the *derived*, per-record λ, it failed —
   **confirming the mechanism, not a coincidence**: `b[k]/a[k]` came out **0.75** against the required
   `>0.94`, i.e. a ~25% swing purely from which facet the camera happened to make "binding" at each yaw.
   **This defect is inherent to any "pick one binding facet by its own projected geometry, then apply its
   λ to every other facet" design** — it is not specific to my exact formula, so **Fix 2 (the plan's own
   fallback, "same machinery, applied only where λ ≥ LAM_MIN") inherits the identical risk** whenever it
   does engage, since it uses the same front-face/projected-geometry binding-facet derivation. Closing
   this would need the binding-facet selection (or at least the SET of candidate facets) to be
   camera-invariant — e.g. selecting from `record.faces` unconditionally (front and back, mirroring
   `recordBands`) — which I did not have room to design, re-derive λ's arithmetic for, and re-verify
   against all four failure modes within this unit.

## Ground-plane freeze — proof

No source file was touched in the final state (full revert, verified via `git status --short` / `git
diff --stat` against `47a5a755`, both empty). The ground plane's default-scene behaviour is therefore
byte-identical **by construction**, not by re-measurement:
- `tests/baselines/scene3d/tone/shadow-additive-default.json` and `shadow-inverse.json`: files not
  touched; content identical to `47a5a755`.
- The three `scene3d-hlr-spatial-index-identity` SETTLED rows (208/416, 404/1225, 651/2485): file not
  touched.
- `plane` (solo-orientation, gated out of every variant I built via `!soloOrient`) and `sphere` (curved,
  not the faceted path) fingerprints were re-measured during the iteration above and confirmed
  byte-identical to the existing pins in `scene3d-box-density-bearing.test.js`
  (`fingerprint(50,'plane') = 10a710a6:3909`, unchanged; `fingerprint(50,'sphere') = 6c237f90:23012`,
  `fingerprint(150,'sphere') = 3dc1b467:55668`, both unchanged).

## Files touched in the FINAL state

None. `src/core/algorithms/scene3d.js`, `tests/unit/scene3d-box-density-bearing.test.js`, and
`tests/unit/scene3d-faceted-density-calibration.test.js` were edited during the investigation (RED
tests added, `recordCarrierNorm` + carrier pre-scale implemented, `perpExtentUV` extracted to a
standalone helper) and then restored to `git show HEAD:<path>` byte-for-byte once the guard failures
above were confirmed reproducible under two independent variants (derived λ and blunt λ=0.6). No commit
was made.

## Tests run (all at base 47a5a755, confirming the revert is clean and nothing regressed)

`scene3d-box-density-bearing` (4/4), `scene3d-faceted-density-calibration` (7/7),
`scene3d-appdefault-facet-fill` (7/7), `scene3d-facet-tone` (15/15), `scene3d-faceted-highlight-dispatch`,
`scene3d-faceted-tone-law` (19/19), `scene3d-fixture-single-source`, `scene3d-hatch-density-500` (14/14),
`scene3d-plot-safety`, `scene3d-projected-pitch`, `scene3d-subwindow-density` (5/5, 2 skipped) — **11
files, 122 passed, 3 skipped, 0 failed** at the reverted (base) state.

## Evidence cells

None captured. The plan's evidence set (`box__hatch__ladder__med__a`, `solid__hatch__ladder__med__a`,
`plane__hatch__ladder__med__a`, `plane__contour__ladder__med__a`) would show the CURRENT (unfixed, base)
rendering, identical to whatever the existing gallery already holds for `47a5a755` — capturing it here
would not communicate anything about this unit's finding, so it was skipped per protocol's "if the
oracle cannot be met honestly, ship the measurement and say so" rather than manufacture evidence of a
non-shipped, no-op change.

## Bars changed

None. No pinned threshold, tolerance, count bar, or fingerprint in the repository moved — the two
fingerprint re-pins and one new RGR assertion built during the investigation were reverted along with
the source change.

## Recommendation for the next attempt

1. Re-derive `LAM_MIN` against the CURRENT source tree's `scene3d-subwindow-density` probe directly
   (measure, don't reuse the plan's §6 number) — my reproduction of the plan's own reference point
   (λ=0.6 ⇒ green) did not hold.
2. Redesign the binding-facet selection to be **camera-invariant** (front AND back faces, or a
   world-space proxy for "natural ruling count" that does not route through `scaf.toScreen`) before
   re-attempting Fix 1 or Fix 2 — otherwise the O28 regression measured here will reproduce.
3. Re-verify O21 ("T facet carries a second family") specifically, since scaling only the carrier still
   shifts the zone's composed coverage budget available to the crossed family; §4's arithmetic did not
   anticipate this interaction.
