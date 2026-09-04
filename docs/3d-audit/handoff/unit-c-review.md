# Unit C — Shadow overlap darkening: independent implementation review

Reviewing `src/core/scene3d/shadows.js` (overlap darkening apparatus, merged
into `sf/preview` at `6c17709d`/`d5af9e30`) as if written by someone else, per
the handoff's own DONE wording. No defect found that requires a source change;
one low-severity observation is noted but left as-is (see below).

## What the code does

- `overlapCfg()` reads `Vectura.AlgorithmTuning.scene3dShadowOverlap`
  (`maxDepth: 3, pitchStep: 0.5, maxCasters: 8`), degrading to a frozen
  fallback with the same values if the config module hasn't loaded.
- `overlapFactor(depth)` returns `1` at depth `<= 1` (identity) and
  `1 + pitchStep * (min(depth, maxDepth) - 1)` above it — clamped to the
  ladder's last rung so a pile of casters can't run away.
- `overlapPitch(sp, penWidth, depth)` returns `sp` unchanged at depth `<= 1`
  and otherwise `max(floor, sp / overlapFactor(depth))`, floored at
  `PLOT_FLOOR_MULT (1.2) * penWidth` so the densest overlap can't flood solid.
- `emitShadowRegion` applies `overlapPitch` to the flat-hatch base spacing
  and, separately, to the zoned-model ladder base — in the zoned case
  explicitly **after** the headroom/rung `scale`, with a comment explaining
  why doing it before would be self-cancelling (`rungScale` is inversely
  proportional to pitch, so pre-scaling and then rescaling collapses back to
  the same ladder). Verified this ordering is in fact what's in the file.
- `shadowMeta` only adds `shadowOverlap` to `sceneTarget` when `overlap > 1`,
  so a non-overlapping shadow's meta is byte-identical to pre-change.
- In `build()`, `overlapLevels(geoms)` computes the multiplicity lattice
  incrementally: for each caster `g`, walking `d` from `maxDepth` down to `2`,
  it reads `atLeast[d-1]` (not yet touched by `g` this iteration, since `d-1`
  updates for `g` haven't happened yet at this point in the same downward
  pass) and unions `atLeast[d-1] ∩ g` into `atLeast[d]`; `atLeast[1]` is
  updated last. This is the standard incremental k-cover recurrence
  (`atLeast[d]` after `i` casters = `atLeast[d]` after `i-1` casters, union
  `atLeast[d-1] ∩ g_i`) and is correct — **no double-intersection**: at the
  point each `d` reads `atLeast[d-1]`, that array still reflects the state
  from before the current caster, by construction of the downward walk.
- `boolOk()` checks `FillBoolean.consumeLastOpError()` after every boolean op
  in the lattice build and in the later exact-n split; on failure,
  `overlapLevels` returns `null` immediately (discarding whatever partial
  `atLeast` state existed), and the exact-n split loop does
  `pieces.length = 0; break`. Both paths funnel into `if (!split)
  emitGeom(geom, 1)` — the plain, pre-overlap single-union region. Confirmed:
  **the bail-out is a clean fallback to today's single region, not a partial
  decomposition.**
- The exact-n split (`classList.forEach`) walks `d` from `maxDepth` down to
  `2`, at each step intersecting the **remaining** `rest` with `levels[d]`,
  emitting that as depth `d`, and replacing `rest` with the difference. Since
  `levels` are nested (`atLeast[d] ⊆ atLeast[d-1]`), each subsequent level
  only ever consumes area not already claimed by a deeper level — **no
  region is emitted at two depths**; whatever remains after the walk is
  ordinary depth-1 shadow.
- The occlusion collar is unioned into `geom` **before** the exact-n split, so
  a collar sliver that happens to geometrically coincide with a genuine
  overlap sub-region is correctly bucketed at that region's depth; a collar
  sliver outside the lattice falls out with `rest` and stays depth-1. That
  matches the comment ("depth-1 wherever it falls outside the lattice")
  literally — it does not claim the collar can never be depth ≥ 2, only that
  its default (non-coincident) case is depth-1. Not a bug.

## Answers to the brief's specific review questions

1. **Downward walk free of double-intersection?** Yes — see above.
2. **`boolOk()` bail-out falls back to today's single union?** Yes, confirmed
   at both call sites (`overlapLevels` and the exact-n split loop).
3. **Are `maxCasters`/`maxDepth` bounded against runaway boolean cost?**
   Partially. Both are `Math.max(1, ...)`-clamped from below only; there is
   no upper clamp in `overlapCfg()`. In practice this is safe today because
   `algorithm-tuning.js` freezes `scene3dShadowOverlap` at
   `{maxDepth: 3, maxCasters: 8}` and nothing in the app exposes these as
   user-settable UI params — so no in-app path can currently drive this
   unbounded. **Observation, not a defect**: a future change to that tuning
   file (or a UI control added later) could set an unreasonably large
   `maxDepth`/`maxCasters` with no code-level ceiling. Left as-is per the
   brief's scope (localized fix only for a *found* defect); flagged here for
   whoever next touches `algorithm-tuning.js` or exposes these as UI params.
4. **Does the collar land at depth 1 as the comment claims?** As literally
   written, yes (see above) — the comment describes the default case, not an
   absolute guarantee, and the code matches that reading.
5. **Can "rest" ever be double-inked with an overlap piece?** No — each
   level's slice is drawn from the current `rest`, and `rest` is replaced by
   its difference with that slice before the next (shallower) level is
   considered, so depths partition the footprint rather than overlap it.

## Mutation check (proves the density test is not vacuous)

Patched `overlapFactor` in the working tree to `return 1;` unconditionally —
the "coincident lines" behaviour the TRAP describes (overlap region keeps the
single-shadow pitch). Ran
`npx vitest run tests/unit/scene3d-shadow-overlap.test.js`:

```
❯ tests/unit/scene3d-shadow-overlap.test.js (4 tests | 2 failed) 188ms
  × the overlap pitch ladder is monotonic in n and never breaks the plot floor
    → expected 0.6 to be less than 0.6
  × two overlapping casters emit a distinct, denser overlap region
    → expected 1.1526937377868247 to be greater than 1.25
  ✓ a single caster is byte-identical to the pre-change renderer
  ✓ two casters whose shadows do NOT overlap are byte-identical too
```

Both the ladder-monotonicity assertion and the ink-density assertion turn RED
under the mutation (measured ratio drops from the real 3.06x — see below — to
1.15x, under the 1.25x bar). **Not vacuous.** The file was then reverted by
re-editing `overlapFactor` back to its original body; `git diff d5af9e30 --
src/core/scene3d/shadows.js` is empty, confirming a byte-identical restore
(no destructive VCS op used).

## In-app measurement (real render pipeline, not the fixture)

`scripts/shadow-overlap-evidence.js` drives the exact two scenes from
`tests/fixtures/scene3d-shadow-overlap-fixture.js` (`overlap`: two 30mm boxes
50mm apart along the light throw; `apart`: the same boxes offset across the
throw instead) through `engine.addLayer('scene3d')` →
`computeAllDisplayGeometry()` → `app.render()`, with `shadow.shadowLayers:
true`. Measured directly from the rendered `scenePaths`, grouped by
`meta.sceneTarget.shadowOverlap` and `pickPolygon` exactly as the unit test
does:

- **overlap scene**: depth-1 density 0.627, depth-2 density 1.919 —
  **ratio 3.06x** (threshold 1.25x). One depth-2 region present.
- **apart (control) scene**: depth-1 density 1.148, **zero** depth-2 regions.

Screenshots (`docs/3d-audit/handoff/unit-c/`): `overlap-full.png`,
`overlap-crop.png` (cropped to the actual depth-2 lattice piece's bounding
box, transformed through the live renderer pan/zoom — shows the visible
transition from single-density hatch to the tighter-pitch overlap patch),
`apart-full.png`, `apart-crop.png` (cropped to one representative
single-shadow region in the control scene, same zoom/window size). The two
crops are not byte-identical, and `overlapLevels` is confirmed non-null in
this real app scene (feature is live, not inert).

## Verdict

No defect found requiring a change to `shadows.js` or the test. The
mutation check confirms the density assertion is a real, non-vacuous guard
against exactly the coincident-line failure mode the TRAP describes. The
darkening is measured and visible in the running app with real overlapping
casters, against a control that shows no overlap and is not byte-identical
to the overlap scene. Item C is closed with only the observation in point 3
above logged for future attention (not a blocker).
