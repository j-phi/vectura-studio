# HLD / EARS Update: Canonical Horizon Plane and Terrain Priority Refresh

## Summary
Refine `Horizon` so its first-class contract is a single perspective plane defined by:
- one movable vanishing point with adjustable `Vanishing Point X`,
- one horizontal `Horizon Height` line that extends left and right from that vanishing point,
- one symmetric family of convergence lines radiating downward from the vanishing point and continuing beyond the canvas bounds,
- one family of horizontal cross-lines descending from the horizon and continuing beyond the canvas bounds.

This perspective plane is the invariant base structure. Terrain is a deformation layer applied to that plane through the shared Noise Rack plus curated terrain controls for synthwave valley, shoulder, and ridge shaping. Existing canonical-Horizon requirements remain in force unless superseded below. The updated document should prioritize plane-definition correctness ahead of terrain styling.

## Key Requirement Changes

### Plane definition
- `Horizon` SHALL be specified as a single canonical line structure with one vanishing point and one horizontal horizon line.
- The vanishing point SHALL be movable in `X`, and its vertical placement SHALL be controlled by `Horizon Height`.
- The horizon line SHALL pass through the vanishing point and extend left and right across the full drawable region.
- Convergence lines SHALL be symmetrical about the vanishing point at generation time.
- Convergence lines SHALL originate at the vanishing point and extend beyond the canvas bounds after projection, even when terrain deformation alters their visible path.
- Horizontal plane lines SHALL originate from the horizon plane and extend beyond the canvas bounds.
- Terrain deformation and occlusion SHALL not redefine the underlying plane topology or terminate the logical extent of a plane line; they only affect the visible rendered segments.

### Density and spacing controls
Adopt independent controls for the two line families.

Required line-family controls:
- `Convergence Lines`
- `Horizontal Lines`
- `Link Densities` remains optional but only links counts, not spacing logic

Required spacing controls:
- `Convergence Spacing Mode`
- `Horizontal Spacing Mode`

Allowed spacing modes for both families:
- `Even`
  - Lines are distributed with uniform spacing in plane space.
- `Perspective`
  - Spacing compresses toward the horizon according to perspective expectations, with farther lines appearing closer together.
- `Bias Curve`
  - User-controlled non-linear spacing that shifts density toward the horizon, toward the viewer, or toward the center of the fan while preserving family order and symmetry rules.

Additional spacing controls:
- `Convergence Spacing Bias`
- `Horizontal Spacing Bias`

The document should explicitly state:
- count controls determine how many logical lines exist in each family,
- spacing controls determine where those logical lines are placed within the plane,
- terrain/noise does not change line count identity.

### Terrain and artistic shaping
Retain the shared Noise Rack as the sole procedural terrain source, and prioritize a richer artistic terrain surface on top of the fixed plane.

Required terrain controls:
- `Depth Compression`
- `Skyline Relief`
- `Center Width`
- `Center Depth`
- `Shoulder Lift`
- `Symmetry Blend`
- `Valley Profile`

Add or rename terrain-art controls to make the valley/mountain brief explicit:
- `Ridge Sharpness`
- `Shoulder Curve`
- `Corridor Softness`
- `Terrain Height`
- `Floor Height`

Terrain requirements:
- neutral settings SHALL produce a readable flat or lightly deformed synthwave plane,
- valley settings SHALL create a corridor from vanishing point toward viewer,
- shoulder/ridge settings SHALL build mountains on both sides of the corridor,
- symmetry settings SHALL govern terrain symmetry independently from the base plane’s required convergence symmetry,
- noise layers SHALL add broad landform and fine ridge detail without introducing non-plane line families.

### Occlusion and continuity
Replace any ambiguous hidden-line wording with stricter visibility language.

The updated requirements shall state:
- a line segment remains logically continuous from off-canvas origin to off-canvas termination even when partially hidden,
- visible segments SHALL end exactly at the terrain occlusion boundary,
- visible segments SHALL resume at the exact re-emergence boundary when the same logical line becomes visible again,
- the system SHALL NOT leave open visual gaps between intersecting visible rows and convergence lines when both should meet at a visible crossing,
- the system SHALL NOT drop or truncate an entire logical edge merely because a portion of that edge is occluded,
- occlusion SHALL be computed from the generated terrain surface, not by heuristic family-level trimming.

## Updated EARS Requirements

### Core mode
- WHEN a user selects `Horizon`, THE SYSTEM SHALL generate one canonical perspective terrain plane and SHALL NOT offer a separate `Horizon 3D` mode.
- WHEN a document contains legacy Horizon variants, THE SYSTEM SHALL map them into canonical `Horizon` deterministically.

### Perspective plane
- WHEN Horizon is generated, THE SYSTEM SHALL define exactly one vanishing point and exactly one horizontal horizon line passing through it.
- THE SYSTEM SHALL allow the user to move the vanishing point horizontally with `Vanishing Point X`.
- THE SYSTEM SHALL allow the user to move the horizon vertically with `Horizon Height`.
- THE SYSTEM SHALL generate convergence lines that are symmetric about the vanishing point at plane construction time.
- THE SYSTEM SHALL generate convergence lines that begin at the vanishing point and continue beyond the canvas bounds.
- THE SYSTEM SHALL generate horizontal plane lines that descend from the horizon and continue beyond the canvas bounds.
- THE SYSTEM SHALL NOT emit extra diagonal or non-plane line families.

### Spacing and density
- WHEN the user changes `Convergence Lines`, THE SYSTEM SHALL change only the number of convergence lines.
- WHEN the user changes `Horizontal Lines`, THE SYSTEM SHALL change only the number of horizontal plane lines.
- WHEN the user changes a spacing mode for one line family, THE SYSTEM SHALL NOT alter the other family’s spacing mode unless an explicit linked control is active.
- WHEN `Even` spacing is selected, THE SYSTEM SHALL distribute the chosen family uniformly in plane space.
- WHEN `Perspective` spacing is selected, THE SYSTEM SHALL compress spacing toward the horizon so farther lines appear closer together.
- WHEN `Bias Curve` spacing is selected, THE SYSTEM SHALL apply a user-controlled non-linear density bias while preserving line order and family identity.

### Terrain shaping
- WHEN terrain controls are neutral, THE SYSTEM SHALL be capable of producing a near-planar synthwave grid.
- WHEN center-valley controls are increased, THE SYSTEM SHALL lower a corridor that runs from the vanishing point toward the viewer.
- WHEN shoulder and ridge controls are increased, THE SYSTEM SHALL raise terrain on both sides of that corridor.
- WHEN symmetry blend is increased, THE SYSTEM SHALL bias terrain toward bilateral symmetry around the center corridor without changing the required symmetry of the underlying convergence fan.
- WHEN skyline relief is reduced, THE SYSTEM SHALL simplify distant terrain breakup near the horizon.
- WHEN skyline relief is increased, THE SYSTEM SHALL preserve stronger distant ridge definition.

### Noise behavior
- WHEN Noise Rack layers are enabled, THE SYSTEM SHALL use them as the only procedural source of Horizon terrain variation.
- THE SYSTEM SHALL support multiple noise layers contributing to one Horizon terrain field.
- IF seed and noise parameters are unchanged, THEN Horizon output SHALL remain deterministic.

### Occlusion and continuity
- WHEN a nearer terrain feature obscures part of a line, THE SYSTEM SHALL stop the visible segment at the terrain crossing where occlusion begins.
- WHEN that same line re-emerges, THE SYSTEM SHALL resume rendering it at the terrain crossing where visibility returns.
- THE SYSTEM SHALL preserve logical row identity and logical convergence-line identity across occlusion and re-emergence.
- THE SYSTEM SHALL NOT create open visible gaps at crossings where two visible line segments should meet.
- THE SYSTEM SHALL NOT trim whole line spans solely because a subsection is hidden.
- THE SYSTEM SHALL compute visibility from the generated terrain surface.

## Public Interface / Control Contract
Update the requirements document so Horizon control groups are defined as:

- `Perspective`
  - `Horizon Height`
  - `Vanishing Point X`

- `Plane Density`
  - `Horizontal Lines`
  - `Convergence Lines`
  - `Link Densities`

- `Plane Spacing`
  - `Horizontal Spacing Mode`
  - `Horizontal Spacing Bias`
  - `Convergence Spacing Mode`
  - `Convergence Spacing Bias`

- `Terrain Form`
  - `Depth Compression`
  - `Skyline Relief`
  - `Center Width`
  - `Center Depth`
  - `Corridor Softness`
  - `Shoulder Lift`
  - `Shoulder Curve`
  - `Ridge Sharpness`
  - `Valley Profile`
  - `Symmetry Blend`
  - `Terrain Height`
  - `Floor Height`

- `Noise Rack`
  - shared stacked noise controls only

Because you chose an expert surface, the document may also keep advanced quality-facing controls if needed, but they must be explicitly secondary to the plane and terrain controls and must not redefine the visual contract.

## Test Plan
Required additions or updates to the HLD/RGR section:

- Deterministic tests:
  - vanishing point X shifts the whole plane without changing line-family identity,
  - horizon height moves the vanishing point vertically through the horizon line,
  - convergence lines remain symmetric and extend beyond canvas bounds logically,
  - horizontal and convergence counts vary independently,
  - each spacing mode produces the intended ordering/compression behavior.

- Occlusion tests:
  - visible segments stop exactly at occlusion boundaries,
  - re-emerging segments keep the same logical row/column identity,
  - no open crossing gaps remain where visible lines should meet,
  - partial occlusion does not delete entire logical lines.

- Visual baselines:
  - flat even-spaced grid,
  - perspective-spaced road,
  - centered valley,
  - steep shoulders with re-emerging convergence lines,
  - asymmetric terrain over symmetric plane,
  - migrated legacy Horizon scene.

- Screenshot regressions:
  - dense fan near horizon,
  - high-relief valley with mountain shoulders,
  - edge-of-canvas continuation behavior,
  - masking silhouette following final visible terrain envelope.

## Assumptions and Defaults
- Base convergence fan symmetry is mandatory in the spec.
- Vanishing-point mobility is `X` plus `Horizon Height`, not free 2D dragging.
- Horizontal and convergence spacing are controlled independently.
- `Even`, `Perspective`, and `Bias Curve` are the only required spacing modes in the requirements.
- Shared Noise Rack remains the only procedural terrain source.
- The requirements should prioritize geometric plane correctness and occlusion correctness over legacy parity.


## When finished
- Delete this TODO.md file.