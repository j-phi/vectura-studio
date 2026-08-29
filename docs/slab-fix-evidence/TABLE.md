# SLAB FIX — evidence for the two defects judge C raised

Two defects, both fixed on `sf/integration`. Every number below comes from the REAL app driven by
Playwright, on the judge's own scene: sphere r=46 detail=26, orthographic camera, one directional
light (az 90 / el 30), no ground, `fillDensity` 60, pen 0.3 mm.

- **NEW** = this branch, served on `:8414`
- **BASE** = merge-base `5e92311b` (v1.3.91), the pre-stroke-fill reference, served on `:8415`

Reproduce:

```
python3 -m http.server 8414                      # in the sf/integration worktree
git worktree add --detach <tmp>/base 5e92311b && (cd <tmp>/base && python3 -m http.server 8415)
node scripts/slabfix-tone.js      http://localhost:8414 http://localhost:8415 docs/slab-fix-evidence
node scripts/slabfix-coverage.js  http://localhost:8414 docs/slab-fix-evidence
node scripts/slabfix-shots.js     http://localhost:8414 app     onePenDown trochoidLoop interlockWeave weaveDepth ampSpacing taperedEnds
node scripts/slabfix-shots.js     http://localhost:8415 baseapp onePenDown trochoidLoop interlockWeave weaveDepth ampSpacing taperedEnds
```

## DEFECT 1 — self-crossing centrelines collapsed into solid slabs

**Root cause.** `RibbonGeometry.resolveSelfIntersections` dissolved a self-overlapping ribbon
outline with `FillBoolean.union`, then kept `largestShell(result)` — polygon[0] of the biggest
polygon. polygon-clipping had ALREADY computed the loop interiors correctly, as HOLES; keeping only
the shell threw every one of them away. `erode` + `PenFill` then painted the swallowed area solid.

Direct proof, outside the app (`node`, vendored polygon-clipping, a figure-eight ribbon):

```
figure8 union -> 1 polygon, ring 0 area +196.998, ring 1 area -39.533, ring 2 area -39.533
```

Two holes, one per loop. `largestShell` returned only the +196.998 ring — a 197 mm² slab where the
true swept area is 118 mm².

**Fix.** `buildRibbonMultiPolygon` / `buildRibbonRings` / `clipMultiPolygonToRegion` keep the whole
multipolygon (shell + holes) from the union and through the clip; `ribbonize` hands that nesting
straight to `insetMultiPolygon` instead of flattening it into one polygon. `buildRibbonRing` and
`clipRingToRegion` remain as single-ring views for callers that genuinely want one outline. W1's
degenerate-input protection is untouched: the 1e-6 snap and the four-rung escalating ladder
(snap coarsen, then RDP) still wrap every boolean call, and a total failure still returns the raw
ring rather than dropping it.

### Mid-band tone, BASE vs NEW (`tone.json`)

Coverage of the silhouette disc in 5 mm windows, aggregated into LEFT (shadow) / MID / RIGHT (lit)
thirds. "broken" is judge C's measurement of this branch before the fix.

| law | BASE mid | broken mid | NEW mid | BASE all | NEW all | BASE ink mm | NEW ink mm |
|---|---|---|---|---|---|---|---|
| onePenDown | 0.6293 | 0.147 | **0.6293** | 0.5645 | 0.5801 | 4032 | 21916 |
| trochoidLoop | 0.7584 | 0.473 | **0.7707** | 0.6984 | 0.7087 | 6232 | 25871 |
| interlockWeave | 0.6877 | — | 0.5344 | 0.6329 | 0.5286 | 3965 | 17490 |
| weaveDepth | 0.6372 | — | 0.5926 | 0.5805 | 0.5287 | 4691 | 17308 |
| ampSpacing | 0.5914 | — | 0.4597 | 0.5672 | 0.4977 | 5034 | 16059 |
| taperedEnds (control) | 0.3334 | 0.3334 | 0.3307 | 0.3704 | 0.3706 | 2426 | 12446 |

`onePenDown` lands on BASE's number to four decimals; `trochoidLoop` within 1.6%; the control does
not move. `interlockWeave`, `weaveDepth` and `ampSpacing` recover most of the way but stay 8–22%
under BASE — see the honest note at the bottom.

### Screenshots

| law | before (judge C) | after |
|---|---|---|
| onePenDown | `../judge-c-evidence/app-onePenDown.png` | `app-onePenDown.png`, `appmid-onePenDown.png` |
| trochoidLoop | `../judge-c-evidence/app-trochoidLoop.png` | `app-trochoidLoop.png`, `appmid-trochoidLoop.png` |
| interlockWeave | `../judge-c-evidence/app-interlockWeave.png` | `app-interlockWeave.png` |
| weaveDepth | — | `app-weaveDepth.png` |
| ampSpacing | `../judge-c-evidence/app-ampSpacing.png` | `app-ampSpacing.png` |
| taperedEnds (control) | `../judge-c-evidence/app-taperedEnds.png` | `app-taperedEnds.png` |

`baseapp-*.png` here are the same six laws on the BASE build, captured with the same script and
framing, so every law has a like-for-like reference.

## DEFECT 2 — spiral overdrew and was the only style with gaps

**Root cause.** `spiral` and `concentric` are handed the SAME contour rings by `contourPieces`.
Everything that differed came from `chainPieces`:

1. **ORDER.** Pieces arrived sorted by LEVEL, so a region with more than one lobe per level — any
   region with a hole, since the outer wall and each hole wall contour separately — was walked
   lobe-A-outer, lobe-B-outer, …, lobe-A-next, … A lifting style hops that; a continuous one must
   ROUTE it, retracing ink already on the paper. Measured on a disc with three holes: 207 links,
   457 mm of connector against 1130 mm of actual passes, the ten longest 9–16 mm across a 20 mm
   disc. Most of it was the REPAIR pass — 150 scattered residue blobs, each connected by a walk
   from wherever the spiral happened to finish.
2. **BLEND.** `applyBlend` morphed the last 30% of every ring onto the next, the OUTERMOST pass
   included. Everywhere else the vacated strip is already inked by the pass outside it; on the
   outermost pass its outer neighbour is the region BOUNDARY, so the region's own edge was left
   bare. That is why spiral was the only style with gaps while sharing concentric's rings.

**Fix.** `orderByProximity` (greedy nearest-end — proximity, not containment, because a distance
field's ladder runs inward from the outer wall and OUTWARD from every hole) orders the pieces of
both `contourPieces` and `offsetPieces`. A repair segment is SPLICED into the existing stroke at its
nearest point as a there-and-back detour, instead of being hung off the far end — a repair blob is
by construction about one pitch from a pass that is already drawn. The outermost pass is never
blended, and the blend that does run is capped by arc length (`BLEND_ARC_PITCHES`) rather than by a
fraction of the ring. Spiral still returns exactly one path per connected component.

### Contract C2 on real ribbon regions (`coverage.json`)

Every `PenFill.fillRegion` call captured during a real build, rasterised at 20 px/mm. All four
styles get the IDENTICAL region set. "before" is judge C's column. Gap bar = `(pen/2)²` =
0.0225 mm². Theoretical minimum overdraw at pitch `pen × 0.85` is 1.176.

| law / style | regions | mm² | coverage | ink mm | overdraw before | **overdraw now** | gap-fail regions | max gap mm² |
|---|---|---|---|---|---|---|---|---|
| taperedEnds / spiral | 18 | 1459.6 | 1.0000 | 8290 | 3.112 | **1.704** | 0 (was 1) | 0.0075 (was 0.0850) |
| taperedEnds / concentric | 18 | 1459.6 | 1.0000 | 7435 | 1.528 | 1.528 | 0 | 0.0075 |
| taperedEnds / serpentine | 18 | 1459.6 | 1.0000 | 58597 | 12.060 | 12.044 | 0 | 0.0050 |
| taperedEnds / contourParallel | 18 | 1459.6 | 1.0000 | 7479 | 1.538 | 1.537 | 0 | 0.0075 |
| trochoidLoop / spiral | 119 | 3564.9 | 0.9999 | 20924 | 2.401 | **1.761** | 0 | 0.0075 |
| trochoidLoop / concentric | 119 | 3564.9 | 0.9999 | 17325 | 1.321 | 1.458 | 0 | 0.0075 |
| trochoidLoop / serpentine | 119 | 3564.9 | 1.0000 | 48967 | 4.075 | 4.121 | 0 | 0.0050 |
| trochoidLoop / contourParallel | 119 | 3564.9 | 0.9999 | 34853 | 3.301 | **2.933** | 0 | 0.0075 |
| onePenDown / spiral | 43 | 2486.2 | 0.9994 | 16409 | 2.151 | **1.981** | 1 | 0.1300 |
| onePenDown / concentric | 43 | 2486.2 | 0.9994 | 14640 | 1.280 | 1.768 | 1 | 0.1300 |
| onePenDown / serpentine | 43 | 2486.2 | 0.9999 | 78689 | 3.530 | 9.496 | 0 | 0.0125 |
| onePenDown / contourParallel | 43 | 2486.2 | 0.9997 | 21099 | 10.019 | **2.547** | 0 | 0.0100 |

`taperedEnds`'s region set is byte-identical to the judge's (18 regions, 1459.6 mm²), so that block
is strictly like-for-like. `trochoidLoop` and `onePenDown`'s regions are NOT — the slab fix changed
the ribbon geometry itself, replacing filled loop interiors with real holes. Their columns compare
the same measurement on the corrected geometry, not on the same shapes.

### Honest residuals

- **`onePenDown` region 92 (308.6 mm², 1 shell + 13 holes) leaves a 0.13 mm² uncovered blob** —
  above the 0.0225 mm² bar. It is NOT spiral-specific: `concentric` leaves the identical blob, so it
  is not the chain. Traced offline: PenFill's own repair loop converges to zero blobs by round 2 and
  its residual is ~600 ISOLATED single cells (0.0026 mm² each), so the shortfall is a disagreement
  between PenFill's distance field (coarsened to cs = 0.0514 mm because the region exceeds the
  1.4 M-cell budget) and the polygon at 20 px/mm — a thin feature the field does not resolve. It is
  0.04% of one region out of 43. Not fixed; recorded.
- **`serpentine` (4.1–12.0x) and `contourParallel` (1.5–2.9x) still overdraw.** `contourParallel`
  improved a lot on `onePenDown` (10.02 -> 2.55) because it shares the piece ordering.
  `serpentine` builds its own scanline pieces and was not improved; on `onePenDown` it got WORSE
  (3.53 -> 9.50) because the corrected region has 13 real holes for its scanlines to turn around.
  Neither is the default. Not fixed; reported.
- **Build time.** `onePenDown` is the slowest law: 12.6 s in the browser on this scene against the
  reference build's 39 ms, and `taperedEnds` 3.1 s against 11 ms. That cost is the ribbon feature
  itself, not the slab fix — but the slab fix does add work, because a self-crossing ribbon is now a
  many-holed region rather than one blob.
