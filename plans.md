# Plans

## UI
- Add responsive pane behavior: auto-collapse left/right panes into narrow columns at smaller widths, plus manual toggle to hide/show (Illustrator-style).
- Pin the algorithm dropdown + description block to the top of the left pane (sticky) while parameters scroll.
- Add a **Smoothing** parameter to every algorithm (document behavior and default).
- Add a **Curves vs. Line Segments** toggle for every algorithm; convert polylines to curves when enabled.
- Update mouse wheel zoom to zoom into the cursor (reticule) position.
- Replace every modal illustration with real algorithm-specific imagery at low/high values; no placeholders.
- Remove the Background color info modal.

## Flowfield
- Fix density so it visibly affects the number of paths.
- Replace unrelated info modal graphics (Step Length, Max Steps, Distortion Force, Chaos, Octaves) with accurate visuals.

## Lissajous
- Replace all transform info modal illustrations with relevant visuals.
- Verify and fix **Resolution** so it actually increases smoothness/point density.

## Wavetable
- Truncate should add both top and bottom truncated lines (not just top).
- Row Tilt: either fix to actually tilt the stack or rename + update description to match the current effect.
- Allow higher noise frequency and add additional controls (e.g., angle/rotation for noise direction).

## Boids
- Research and improve flocking realism (separation, alignment, cohesion, steering weights).
- Add a fish schooling behavior mode.

## Attractor
- Seed currently has no impact: decide whether to remove or apply it to parameters; update randomize accordingly.
- Update all attractor info modal imagery to reflect actual behavior.

## Circles
- Max Count is ineffective; fix to limit circle count.
- Padding at 0 should allow close packing (touching).
- Replace Min/Max Radius with a single double-headed **Radius Range** slider with a larger range.
- Replace inefficient attempt loop with a smarter solver (shrink/shift/relax) to reduce wasted attempts.

## Cityscape
- Remove algorithm entirely.

## Phylla
- Seed currently has no impact: decide whether to remove or apply it to parameters; update randomize accordingly.
