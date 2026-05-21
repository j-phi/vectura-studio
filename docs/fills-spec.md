# Fill System Overhaul — Implementation Spec

Source of truth for the fill-pattern overhaul (parts A, B, C). This document was produced from a design ideation session with five outside experts and is binding for the implementation agents.

## A. Density defaults (DONE)

- `fillDensity` default → **1** (was 4)
- `fillDensity` min → **0.1** (was 1), step **0.1** (was 0.5)
- Files: `src/ui/panels/paint-bucket-panel.js`, `src/ui/ui-fill-panel.js`, `src/core/paint-bucket-ops.js`.

## C. Consolidations + reparams (existing fills)

### C1. Wave  (replaces `wavelines` + `zigzag`)

Single fill type with a smoothing parameter.

- `fillType: 'wave'`
- New caps: `angle`, `amplitude`, `shift`, `waveSmoothing`, `waveHarmonics`.
- New params:
  - `waveSmoothing` (range 0..1, step 0.01, default 1.0) — 0=pure triangle wave (zigzag), 1=pure sinusoid; interpolated via a power-blend.
  - `waveHarmonics` (range 1..3, step 1, default 1) — adds 2× and 3× harmonics for richer wave shapes.
- Migration: any saved fill with `fillType === 'wavelines'` → `'wave'` with `waveSmoothing: 1.0`; `fillType === 'zigzag'` → `'wave'` with `waveSmoothing: 0.0`. Handle in `buildFillRecord` reader path + a one-time normalize in `fillRecordToParams`.
- UI menu: remove the two old entries, add "Wave".

### C2. Dots  (replaces `stipple` + `grid`)

Unified dot fill with pattern + shape parameters.

- `fillType: 'dots'`
- New caps: `angle`, `dotSize`, `shift`, `dotPattern`, `dotShape`, `dotJitter`.
- New params:
  - `dotPattern` (select: `grid` | `brick` | `hex` | `jitter`, default `brick`).
  - `dotShape` (select: `circle` | `square` | `cross` | `tick`, default `circle`) — controls the stroke shape stamped at each grid point.
  - `dotJitter` (range 0..1, step 0.01, default 0) — random offset as fraction of spacing (only meaningful in `jitter` pattern, but applied to all).
- Migration: `'stipple'` → `'dots'` (preserve pattern, shape=`circle`); `'grid'` → `'dots'` with `pattern: 'grid'`, shape=`tick`.

### C3. Hatch  (consolidates `hatch` + `crosshatch` + `triaxial`)

- `fillType: 'hatch'`
- New caps: `angle`, `shift`, `lineCount`, `crossAngles`.
- New params:
  - `lineCount` (range 1..3, step 1, default 1) — 1 = single hatch, 2 = crosshatch, 3 = triaxial.
  - `crossAngles` (computed from `angle`): 1 layer = [angle]; 2 layers = [angle, angle+90]; 3 layers = [angle, angle+60, angle+120]. Stored as `null` (computed) unless user customizes (future).
- Keep legacy `hatch` / `crosshatch` / `triaxial` accepted in dispatcher for back-compat (map to lineCount 1/2/3 respectively in `fillRecordToParams`).

### C4. Polygonal — expanded params

- Rename axis label "Axes" → "Sides" (cap key stays `axes`, but label updates).
- Add caps: `polyPadding`, `polyRotation`, `polyRotationStep`, `polyScaleStep`.
- New params:
  - `polyPadding` (range 0..5, step 0.05, default 0) — inset distance between tiled polygons.
  - `polyRotation` (angle 0..360, default 0) — base rotation of all polygons.
  - `polyRotationStep` (range -45..45, step 0.5, default 0) — additional rotation per ring index from center (radial rotation increase).
  - `polyScaleStep` (range -0.5..0.5, step 0.01, default 0) — scale change per ring.

### C5. Spiral — expanded params

- Add caps: `spiralTurns`, `spiralTightness`, `spiralDirection`.
- New params:
  - `spiralTurns` (range 1..40, step 1, default 8).
  - `spiralTightness` (range 0..1, step 0.01, default 0.5) — 0 ≈ Archimedean, 1 ≈ logarithmic.
  - `spiralDirection` (select cw/ccw, default cw).

### C6. Radial — density-driven spokes

- Spoke count is derived from `density`: spokes sit ~`density` apart at mid-radius,
  so a smaller density spacing yields more spokes (consistent with hatch et al.).
- Caps: `radialSkip` (plus the shared `angle` / `shift`).
  - `radialSkip` (range 0..5, step 1, default 0) — skip every Nth spoke.
- Region extent uses `padding` (region inset); there is no separate outer-diameter
  knob. The earlier explicit `radialSpokes` / `centralDensity` / `outerDiameter`
  knobs were removed (density now controls spoke count; the others were dead or
  redundant).

### C7. Contour — expanded params

- Add caps: `contourDirection`, `contourStepVariance`, `contourSimplify`.
- New params:
  - `contourDirection` (select `inset` / `outset`, default `inset`).
  - `contourStepVariance` (range 0..1, default 0) — random variance per step.
  - `contourSimplify` (range 0..0.5, default 0.05) — Douglas-Peucker tolerance (mm) for CNC-friendly path simplification.

## B. Ten new fill types

Each follows the same renderer contract as existing fills:

```
fnName(poly, density, ...params) → Array<Array<{x,y}>>     // single region
fnNameComposite(polys, density, ...params) → Array<Array<{x,y}>>  // multi-region
```

Add an entry in `FILL_TYPE_OPTIONS`, `FILL_CAPS`, `VARIANT_CONTROLS`, `buildFillControlDefs`, and the `generatePatternFillPaths` switch. Persist any new params in `DEFAULTS` and `buildFillRecord`.

All ten — register in this exact order in `FILL_TYPE_OPTIONS` (after consolidated existing fills, before `polygonal`).

### B1. Flow Field

Streamlines traced along a vector field, clipped to the region.

- `fillType: 'flowfield'`
- Params:
  - `flowFieldType` (select: `perlin` | `curl` | `radial` | `spiral`, default `perlin`).
  - `flowNoiseScale` (range 0.5..20, step 0.1, default 6.0) — characteristic feature size in mm.
  - `flowSeed` (range 0..999, step 1, default 1).
  - `flowTraceLen` (range 5..200, step 1, default 60) — max steps per streamline.
  - `flowSeparation` (range 0.5..10, step 0.1, default 2.5) — minimum mm between adjacent streamlines.
- Algorithm: Cabral-style seed lattice + greedy streamline tracing with separation rejection (no exact spacing required; "approximate" is fine for plot art).
- Dense rule: lower `density` → more seed candidates → denser streamlines.

### B2. Voronoi

Voronoi tessellation of seed points within the region.

- `fillType: 'voronoi'`
- Params:
  - `voronoiSeeds` (range 5..400, step 1, default 60) — seed count.
  - `voronoiJitter` (range 0..1, step 0.01, default 0.5) — 0=Poisson-disk-ish even, 1=random uniform.
  - `voronoiStroke` (select: `boundary` | `centroid-spokes` | `concentric` | `boundary+centroid`, default `boundary`).
  - `voronoiSeedMode` (select: `random` | `hexgrid` | `square`, default `random`).
- Use a lightweight Fortune's-style sweep OR brute-force per-pixel-grid Voronoi (we have small regions; brute-force at 1mm grid is acceptable for v1).

### B3. Truchet Tiles

Square-tile pattern with random orientation per tile.

- `fillType: 'truchet'`
- Params:
  - `truchetTileSet` (select: `quarter-arcs` | `diagonals` | `dots-and-lines` | `triangle-split` | `scribble`, default `quarter-arcs`).
  - `truchetTileSize` (range 1..30, step 0.5, default 6) — mm.
  - `truchetSeed` (range 0..999, step 1, default 1).
  - `truchetRotations` (range 1..4, step 1, default 4) — number of allowed orientations.
- Renders tile-by-tile, clipping each tile to the region polygon.

### B4. Maze

Single continuous maze path filling the region.

- `fillType: 'maze'`
- Params:
  - `mazeCellSize` (range 1..20, step 0.5, default 5) — mm.
  - `mazeAlgorithm` (select: `dfs` | `wilson` | `eller` | `recursive-division`, default `dfs`).
  - `mazeBranchBias` (range 0..1, step 0.05, default 0.5) — favors long corridors (0) vs many branches (1).
  - `mazeSeed` (range 0..999, step 1, default 1).
  - `mazeWallMode` (select: `walls` | `path` | `both`, default `walls`).
- The whole region is voxelized to a maze grid (rectangular cells over rotated bbox), maze generated on cells whose center lies inside the polygon, paths drawn as polylines.

### B5. Scribble

Single chaotic continuous-stroke fill.

- `fillType: 'scribble'`
- Params:
  - `scribbleSmoothness` (range 0..1, step 0.01, default 0.6) — how curvy the stroke is.
  - `scribbleSeed` (range 0..999, step 1, default 1).
  - `scribbleCoverage` (range 0.1..3, step 0.05, default 1.0) — multiplier on total stroke length relative to area.
- Generates a single random-walk that wanders the region with momentum, repelled by previously-drawn segments — a classic plotter algorithm.

### B6. L-System

Fractal branching fill (organic).

- `fillType: 'lsystem'`
- Params:
  - `lsysPreset` (select: `coral` | `lichen` | `plant` | `dendritic` | `algae`, default `coral`).
  - `lsysIterations` (range 1..6, step 1, default 4).
  - `lsysAngleVariance` (range 0..30, step 0.5, default 8) — degrees of randomness on each branch.
  - `lsysSeed` (range 0..999, step 1, default 1).
  - `lsysScale` (range 0.2..5, step 0.05, default 1.0) — overall size multiplier.
- Each preset is a hard-coded rewrite ruleset producing turtle-graphics segments.

### B7. Halftone

Dot radius modulated by a scalar function.

- `fillType: 'halftone'`
- Params:
  - `halftoneSource` (select: `radial` | `linear` | `noise` | `distance-to-edge`, default `radial`).
  - `halftoneMinR` (range 0.05..3, step 0.05, default 0.2) — mm.
  - `halftoneMaxR` (range 0.1..5, step 0.05, default 1.5) — mm.
  - `halftoneFrequency` (range 0.5..20, step 0.1, default 5) — feature-size for noise; gradient steepness for radial/linear.
  - `halftoneAngle` (angle 0..360, default 0) — gradient direction.
  - `halftoneInvert` (select: `off` | `on`, default `off`).
- Dot pattern uses the unified `Dots` grid; only the radius per cell varies.

### B8. Stripes

Bands of alternating fills.

- `fillType: 'stripes'`
- Params:
  - `stripeBandWidth` (range 0.5..50, step 0.1, default 4) — mm.
  - `stripeGap` (range 0..50, step 0.1, default 2) — mm gap with no fill.
  - `stripeAngle` (angle 0..360, default 0).
  - `stripePrimary` (select: any other registered fill type except `stripes`/`none`, default `hatch`).
  - `stripeSecondary` (select: `none` | any other registered fill type, default `none`).
  - `stripeSecondaryDensity` (range 0.1..10, step 0.1, default 2) — multiplier on band density for secondary.
- Implementation: clip the region into alternating angled bands, then dispatch each band to the chosen sub-fill renderer.

### B9. Spirograph

Single parametric curve (Lissajous / hypotrochoid family).

- `fillType: 'spirograph'`
- Params:
  - `spiroRatioA` (range 1..20, step 0.5, default 5).
  - `spiroRatioB` (range 1..20, step 0.5, default 3).
  - `spiroPhase` (range 0..360, step 1, default 0) — degrees.
  - `spiroTurns` (range 1..200, step 1, default 50).
  - `spiroDeformation` (range 0..1, step 0.01, default 0) — modulates between Lissajous (0) and hypotrochoid (1).
- Curve fitted/scaled to region bbox; clipped to polygon.

### B10. Weave

Interlaced strands (textile-like).

- `fillType: 'weave'`
- Params:
  - `weavePattern` (select: `plain` | `twill` | `basket` | `satin`, default `plain`).
  - `weaveStrandWidth` (range 0.3..10, step 0.1, default 1.5) — mm.
  - `weaveGap` (range 0..5, step 0.05, default 0.3) — mm.
  - `weaveAngle` (angle, default 0).
  - `weaveOver` (range 1..6, step 1, default 1) — over-count (twill/satin).
  - `weaveUnder` (range 1..6, step 1, default 1) — under-count.
- Renders parallel warp strands + perpendicular weft strands, with the over/under pattern simulated by *omitting* short segments where a strand passes "under" (the gap appears where the other strand crosses).

## Engineering rules of engagement

1. **RGR**: Every new fill type and every consolidation MUST be implemented Red→Green→Refactor.
   - Write a failing unit test in `tests/unit/` that calls the renderer or dispatcher and asserts properties (returns array of polylines; respects density; clips to region; etc.).
   - Implement to green.
   - Refactor for clarity.
2. **One commit per fill/consolidation** with a clear message.
3. **No regressions**: existing `pattern-fill-boundaries.test.js`, `fill-boundary-clipping.test.js`, `ui-fill-panel-compile.test.js`, `pattern-designer-roundtrip.test.js` must keep passing throughout.
4. **Code review pass**: at the end, a separate reviewer agent reviews the diff for: registry consistency, parameter migration coverage, dead code from removed types, label/i18n updates, performance hotspots in inner loops.
5. **Back-compat**: do NOT break saved documents. The dispatcher must accept old fill type strings (`wavelines`, `zigzag`, `stipple`, `grid`, `crosshatch`, `triaxial`) and map them to the new consolidated types with reasonable defaults.
6. **Performance ceiling**: any new fill must render a 100×100mm region in < 200ms at default params on a typical laptop. If slower, add an internal density floor or step cap.
7. **Docs**: append a "Fill Types" section to README or new `docs/fills.md` that describes each fill and its primary parameters, generated from this spec.
