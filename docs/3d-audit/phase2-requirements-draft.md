# Phase 2 — 3D Parameter Remediation Requirements (DRAFT)

**Date:** 2026-06-13
**Author:** Product Lead (3D remediation)
**Inputs:** `docs/3d-audit/phase1-parameter-audit.md` (defect log), `src/ui/controls-registry.js`, `src/config/defaults.js`, `src/core/algorithms/{spiral3d,polyhedron,mesh-topography,image-surface}.js`, `src/core/algorithms/geometry3d.js`.
**Status:** Draft for adversarial critique by the next agent.

---

## Guiding product principles

1. **No dead controls.** Every visible control must either change the render in its current context, or be hidden (`showIf`) in contexts where it cannot. A control that "exists but does nothing" is a trust bug — the user drags it and concludes the whole app is broken.
2. **Wire where there is a meaningful line-based equivalent; hide where there is not.** Face-derived enhancements (Lambert hatch, crease extraction, painter depth-bias) are physically meaningful only when the algorithm emits closed faces. For pure line/dot output (spiral3d; imageSurface line/topography modes) we HIDE them rather than fake them — a faked hatch on a wireframe is worse than an absent control.
3. **Highest-value defect first.** D3 (imageSurface surface-noise) is the only defect that blocks a whole *creative subsystem*, not a single slider. It is **P0**.
4. **Prefer gating/relabel over deletion.** Delete a control only when it is provably redundant with another live control (true duplicate). Everything else is gated or wired.
5. **Determinism preserved.** Every disposition must keep existing presets and the fixed-seed baselines byte-identical *unless* the change is itself the fix (e.g. wiring a previously-dead control). Where output changes, regenerate baselines deliberately.

---

## Disposition vocabulary

- **WIRE** — make the control actually affect the render for this algorithm.
- **GATE** — add/extend a `showIf` so the control only appears where it is meaningful.
- **REMOVE** — delete a truly redundant control + its default key.
- **RELABEL / RETYPE** — rename or change control type; no behavior change to geometry.

---

## Priority ledger

| Priority | Requirements |
|---|---|
| **P0** | R3 (imageSurface surface-noise) |
| **P1** | R1 (polyhedron vertex occlusion), R7 (imageSurface shading block), R6 (spiral3d shading block), R10 (label collision) |
| **P2** | R2 (meshTopography artworkSize), R8/R9 (polyhedron sideCount/depth gating), R4 (imageSurface smoothing), R5 (imageSurface seeThrough) |

---

## Requirements

### R3 — imageSurface Surface Noise (`noiseMode` + `noiseAmount`) — **GATE** — maps to D3 — **P0**

**Root cause (corrected from the audit's surface symptom).** The noise *is* wired: `createSampler` → `applyNoise(value, noiseField(uu,vv), noiseMode, noiseAmount)` in `image-surface.js:195`. But `createNoiseField` returns `null` whenever the universal noise rack stack `p.noises` is empty (`image-surface.js:88-89`), and the default stack is empty (`defaults.js:1762 noises: []`). With no field, `noiseMode`/`noiseAmount` are mathematically inert — exactly what the harness saw. The controls are not broken; they are **mis-presented**: the "Surface Noise" section header sits *above* the mode/amount sliders, while the thing that activates them (the `noiseList` widget) sits *below* and reads as optional.

**Disposition: GATE (+ light reorder), not WIRE.** The engine is correct. The fix is to stop showing `noiseMode`/`noiseAmount` as live when they cannot do anything, and to make the dependency obvious.

- Add `showIf: (p) => (p.noises || []).some((n) => n.enabled !== false)` to both `noiseMode` and `noiseAmount` (registry lines ~1908 and 1917). When the stack is empty the two sliders disappear, so a user can never drag a dead control.
- Keep the `noiseList` widget always visible under the "Surface Noise" header so the user discovers they must add a layer first. (Optionally surface a one-line hint when the stack is empty — non-blocking.)
- Order: header → `noiseList` → (gated) `noiseMode` → (gated) `noiseAmount`, so the activating control precedes its dependents.

**Why not WIRE a built-in default noise layer?** Seeding a default noise layer would silently change every existing imageSurface preset's geometry — a regression vector. Keep defaults inert; gate the UI.

**Acceptance criterion (testable, RGR):**
- *Red:* with `p.noises = []`, the schema evaluation of `noiseMode.showIf(p)` and `noiseAmount.showIf(p)` returns `false`; today there is no `showIf` so both are `undefined`/always-shown.
- *Green:* with one enabled noise layer in `p.noises`, both `showIf` return `true`, AND a generate() sweep of `noiseAmount` 0→1 (mode `add` and `replace`) produces **≥2 distinct path signatures** (proving the wired path activates once a layer exists). Unit test in `tests/unit/vectura-geometry-algorithms.test.js` asserting `generate({...defaults, noises:[<layer>], noiseAmount:1})` ≠ `generate({...defaults, noises:[<layer>], noiseAmount:0})`.

---

### R1 — polyhedron `vertexOcclusionMode` — **WIRE** — maps to D1 — **P1**

**Finding.** `polyhedron.js:315` reads `const visible = p.vertexOcclusionMode === 'occlude' ? pt.front : true;` — it only consults the vertex's own *front-facing* flag, not whether the vertex is behind a nearer face. So `occlude` vs `outline` look identical whenever all flagged vertices are already front-facing (the default buckyball). The control is half-wired: it gates on backface, never on occlusion by other geometry.

**Disposition: WIRE.** `occlude` must hide vertices that are behind a closer opaque face, using the existing painter machinery (`G3.occludeSegments` / the depth-sorted face records already built at `polyhedron.js:239`). Test each vertex's projected point against the front-most faces; drop vertices whose screen point lies inside a nearer face polygon. `outline` keeps all vertices (current behavior).

**Acceptance criterion:**
- *Red:* `generate(polyhedronDefaults + {showVertices:true, vertexOcclusionMode:'occlude'})` and `...vertexOcclusionMode:'outline'}` on a solid with self-occluding vertices (e.g. `cube` rotated so back vertices overlap front faces, or `buckyball`) currently yield identical vertex path counts.
- *Green:* the `occlude` render has strictly **fewer** vertex glyph paths than `outline` for that configuration, and `outline` count is unchanged from today's baseline.

---

### R7 — imageSurface shading block (`emphasizeOutline`, `outlineWeight`, `showCreases`, `creaseAngle`, `hiddenLineMode`, `depthBias`, `hatchEnable` + light/hatch params) — **SPLIT: WIRE outline/hidden-line for face modes; GATE the rest** — maps to D7 — **P1**

This is the widest gap (12 of 14 shared-block controls dead). The right answer is per-control, driven by whether imageSurface emits faces in the current `mode`.

imageSurface modes and their geometry:
- `lines` (default) → relief polylines (faces only if `horizontalLinesAsPlanes`).
- `mesh` → quad faces (has `faceVisible`, `pushFaceHatch`, occluders — face geometry exists).
- `topography` → contour polylines (no faces).
- `bars` → box faces (occluders + hatch already present).

Per-control disposition:

| Control | Disposition | Where shown | Rationale |
|---|---|---|---|
| `emphasizeOutline` / `outlineWeight` | **WIRE** | all modes | Every mode has a silhouette; stamp outline weight on boundary paths (mesh/bars: face silhouette; lines/topography: the outer profile of the relief field). Line-meaningful everywhere. |
| `hatchEnable` + `lightAzimuth`/`lightElevation`/`hatchAngle`/`hatchSpacing`/`crossHatch` | **WIRE for `mesh` & `bars`; GATE off for `lines` & `topography`** | `showIf: (p)=> p.mode==='mesh' \|\| p.mode==='bars' \|\| (p.mode==='lines' && p.horizontalLinesAsPlanes)` | Lambert hatch needs facets. `pushFaceHatch` already exists for mesh/bars (image-surface.js:314). Pure polylines (`topography`, flat `lines`) have no face to light → hide, don't fake. |
| `hiddenLineMode` (backface/remove/dash) | **WIRE for face modes; GATE off for non-face** | `showIf: (p)=> faceModes` (mesh, bars, lines-as-planes) | Hidden-line removal needs occluders; the occluder pipeline already exists in those modes. In flat `lines`/`topography` there are no faces to hide behind, and `seeThrough` already governs the wire stacking — so hide it. |
| `depthBias` | **GATE** (follows `hiddenLineMode`) | only when `hiddenLineMode` shown AND `!== 'backface'` | It only tunes the painter occlusion threshold; pointless where hidden-line is hidden. Its existing `showIf` already requires non-backface; extend with the face-mode predicate. |
| `showCreases` / `creaseAngle` | **GATE off entirely on imageSurface** | `showIf: () => false` (i.e. removed from imageSurface's block) | Crease extraction (`G3.extractCreases`) needs a shared-edge face adjacency graph. imageSurface's mesh is a height-field grid where *every* interior edge is a "crease" by dihedral angle — the feature degenerates into "draw all gridlines," which the wireframe already is. No meaningful line equivalent → hide. |

**Implementation note.** Because three of these need a per-algorithm `showIf` that the *shared* `SHADING_LINE_CONTROLS` block does not carry, introduce a mechanism to override/augment the shared block per algorithm (e.g. a `makeShadingControls({ faceModes, allowCrease, allowHatch })` factory, or a post-filter that injects `showIf` by id when appending to `imageSurface`). Do **not** fork the block by hand-copying — that reintroduces drift. See R-CC.

**Acceptance criteria:**
- `emphasizeOutline`: in each of the four modes, toggling on with `outlineWeight` swept produces ≥2 distinct signatures (boundary stroke-weight metadata changes).
- `hatchEnable` shown only in face modes: `hatchEnable.showIf({mode:'topography'})===false`, `===true` for `{mode:'mesh'}`; and in `mesh`, sweeping `hatchEnable` off→on yields more paths (hatch segments added).
- `showCreases`/`creaseAngle` no longer appear for imageSurface (schema contains no shown crease control for this algo).
- `hiddenLineMode`/`depthBias` hidden for `{mode:'lines', horizontalLinesAsPlanes:false}` and `{mode:'topography'}`.

---

### R6 — spiral3d shading block (`showCreases`, `creaseAngle`, `depthBias`, `hatchEnable`, `lightAzimuth`, `lightElevation`, `hatchAngle`, `hatchSpacing`, `crossHatch`) — **GATE off (hide)** — maps to D6 — **P1**

**Finding.** spiral3d emits line/dot loops with **no closed faces** (the audit confirms; `spiral3d.js:298-301` notes "no polygon facets to clip a hatch grid against"). Crease, Lambert hatch, and painter depth-bias have no surface to act on. The working controls (`depthCue`, `depthCueStrength`, `emphasizeOutline`, `outlineWeight`, `hiddenLineMode`) already have line-meaningful behavior wired (the rings *are* the silhouette; hidden-line maps onto back-of-shape culling at `spiral3d.js:258-259`).

**Disposition: GATE off (hide) the face-only controls; keep the working five.**
- Hide `showCreases`, `creaseAngle`, `hatchEnable`, `lightAzimuth`, `lightElevation`, `hatchAngle`, `hatchSpacing`, `crossHatch`, `depthBias` on spiral3d.
- **Reconsider `hiddenLineMode` `depthBias`:** the audit lists `depthBias` as NO-OP on spiral3d. Since spiral3d does its own visibility mapping and does not call `G3.occludeSegments`, `depthBias` (painter threshold) is inert here. Hide it.
- Keep `depthCue`, `depthCueStrength`, `emphasizeOutline`, `outlineWeight`, `hiddenLineMode` (all verified working).

**Why hide and not WIRE a line-equivalent hatch?** A "hatch" on a wireframe sphere has no defined facet to fill; the honest UX is to not offer it. spiral3d already has rich line styling (dots, weights, depth-cue). No user value in a faked crease.

**Acceptance criterion:**
- Schema for spiral3d: `hatchEnable`, `showCreases`, `depthBias` (and the hatch/light children) have `showIf` returning `false` for spiral3d → not rendered. Assert via the schema (e.g. evaluate each control's `showIf(spiral3dDefaults)` is falsy for the hidden set, truthy/absent for the kept set).
- Generate sweep: removing those controls from the shown set leaves spiral3d baseline output **byte-identical** (they were already no-ops, so this is a pure UI reduction — RGR "green" is unchanged geometry + reduced visible control count).

---

### R10 — Label collision: "Depth Strength" (`focalLength`) vs "Depth Strength" (`depthCueStrength`) — **RELABEL** — maps to the naming-collision note — **P1**

**Finding.** `focalLength` is labeled **"Depth Strength"** (registry 1748/1835/1896/1966) and `depthCueStrength` is *also* labeled **"Depth Strength"** (SHADING block, line 82). Two distinct controls share one visible label on all four algorithms.

**Disposition: RELABEL both for clarity.**
- `focalLength` → **"Perspective Strength"** (it only shows under `projection: 'perspective'` and scales the focal foreshortening). Keeps it distinct and accurate.
- `depthCueStrength` → **"Depth Cue Strength"** (it scales the depth-based dash density; already gated on `depthCue !== 'off'`).

No geometry change. Update any in-app help / infoKey copy that referenced the old label.

**Acceptance criterion:** No two controls within the same algorithm's `CONTROL_DEFS[algo]` share an identical `label`. Add a unit assertion in `controls-registry` tests: for each 3D algo, the multiset of `label` values across all `{id}` controls has no duplicates.

---

### R2 — meshTopography `artworkSize` — **REMOVE** — maps to D2 — **P2**

**Finding.** `mesh-topography.js:112-114` resolves scale as `finite(p.scaleX3d ?? p.primitiveScaleX, finite(p.artworkSize,150)*0.42)`. Since `primitiveScaleX/Y/Z` always default to `65` (`defaults.js:1697-1699`), the third-arg `artworkSize` fallback is **never reached**. `artworkSize` is dead on meshTopography in every render mode (audit D2 confirms contours + wireframe).

**Disposition: REMOVE.** It is a true redundancy — `primitiveScaleX/Y/Z` fully own mesh sizing. Unlike imageSurface (where `artworkSize` *is* live — `image-surface.js:233`), meshTopography has no path where it matters.

- Delete the `artworkSize` control from `CONTROL_DEFS.meshTopography` (registry 1872).
- Remove the `artworkSize` key from `ALGO_DEFAULTS.meshTopography` (defaults 1695).
- Remove the dead `?? finite(p.artworkSize,...)` fallback term in `mesh-topography.js:112-114` (replace with a literal default, e.g. `* 0.42` of a fixed 150, or just `65`), so the parameter has no lingering reader.
- **Migration:** existing `.vectura` presets carrying `artworkSize` for meshTopography simply ignore the key (no crash; it's now unread). No preset rewrite required, but note it in CHANGELOG.

**Acceptance criterion:** meshTopography schema contains no `artworkSize` control; `ALGO_DEFAULTS.meshTopography.artworkSize` is undefined; `generate()` output for meshTopography defaults is byte-identical before/after (since the term never fired). RGR: a test that loads an old preset with `artworkSize` set and asserts it renders identically to one without.

---

### R8 — polyhedron `sideCount` — **GATE** — maps to D8 — **P2**

**Finding.** `sideCount` works for `flatPolygon`, `prism`, `antiprism`, `bipyramid` (verified monotonic) and is ignored by the platonic/buckyball/STL solids. With no `showIf`, dragging it on the default `buckyball` does nothing.

**Disposition: GATE.** Show only for the polygon-derived solids.
- `showIf: (p) => ['flatPolygon','prism','antiprism','bipyramid'].includes(p.solidType)` on `sideCount` (registry 1776).

**Acceptance criterion:** `sideCount.showIf({solidType:'buckyball'})===false`, `===true` for `{solidType:'prism'}`. No geometry change for any solid.

---

### R9 — polyhedron `depth` — **GATE** — maps to D9 — **P2**

**Finding.** `depth` is the extrusion length; live for `prism` (0→180 changes length), ignored by platonic/buckyball. Same ungated-dead problem as R8. Note: `depth` is also read by the `twist` effect (`polyhedron.js:164`) as a normalization divisor, but that only matters when there is extrusion to twist — i.e. the same solid set.

**Disposition: GATE.** Show for the solids that actually extrude.
- `showIf: (p) => ['prism','antiprism','bipyramid'].includes(p.solidType)` on `depth` (registry 1778). (Confirm `flatPolygon` truly ignores depth — it is a flat 2D polygon; exclude it. The next agent should verify whether `bipyramid`/`antiprism` consume `depth` as half-height — source at `polyhedron.js:61-80` shows they do.)

**Acceptance criterion:** `depth.showIf({solidType:'buckyball'})===false`; `===true` for `{solidType:'prism'}`. For each solid where it remains shown, a `depth` sweep yields ≥2 distinct signatures (proves it is live wherever it appears).

---

### R4 — imageSurface `smoothing` (Map Blur) — **GATE + clarify** — maps to D4 — **P2**

**Finding.** `smoothing` IS wired (`image-surface.js:244-245`, box-blur passes over the height field) and defaults to `18`, so it *is* active by default. The audit saw "no effect" because the **built-in analytic relief is already smooth** at the swept grid sizes — blurring an already-smooth field is a near-no-op. It is meaningful for imported raster / painted / noise sources where the field has high-frequency detail.

**Disposition: GATE by source kind (do not remove — it is genuinely useful for raster sources).**
- `showIf: (p) => p.imageSourceKind !== 'builtin'` (sources: `imported`, `painted`, `noise` keep it; built-in hides it). This stops the "I dragged it and nothing happened" failure on the default source while preserving the feature where it bites.
- Alternative considered & rejected: WIRE it to also affect built-in — rejected because the built-in relief is intentionally smooth and there is no detail to remove; showing the control there is the actual defect.

**Acceptance criterion:** `smoothing.showIf({imageSourceKind:'builtin'})===false`; `===true` for `{imageSourceKind:'imported'}`. With a high-frequency source (e.g. a noise-backed fixture grid) a `smoothing` 0→100 sweep yields ≥2 distinct signatures (proves it bites where shown).

---

### R5 — imageSurface `seeThrough` — **WIRE (fix default mesh)** — maps to D5 — **P2**

**Finding.** `seeThrough` is read in lines-as-planes / bars / mesh / topography (`p.seeThrough !== false` at multiple sites, e.g. 298/363/402/618). The audit found it dead in `mesh` mode under both `remove` and `backface`. Inspecting the mesh path: `seeThrough` should toggle whether hidden quad edges are kept (dashed) or removed. If the mesh build does not pass `seeThrough` into its occlusion branch the way `bars`/`lines` do, that is the bug.

**Disposition: WIRE.** Make `seeThrough` actually switch the mesh between (a) keep-hidden (back lattice dashed/visible) and (b) remove-hidden (true occlusion) — matching how `lines`-as-planes already behaves via `occluders`. The next agent must confirm whether the defect is (i) mesh genuinely never consulting `seeThrough` in its occlusion branch, or (ii) the default mesh having no self-occlusion to reveal a difference. If (ii), the disposition downgrades to GATE (show only where occlusion is possible); if (i), WIRE.

**Acceptance criterion:** in `mesh` mode on a self-occluding surface (sufficient amplitude + tilt so back faces are hidden), toggling `seeThrough` true→false changes the signature (hidden edges removed vs dashed). If after investigation mesh provably cannot self-occlude at any setting, instead assert `seeThrough.showIf` excludes plain `mesh` and the control no longer reads as dead.

---

### R-CC — Cross-cutting: the shared "Shading & Lines" block is applied uniformly but is not uniformly applicable — **RETYPE the block into a parameterized factory** — maps to the cross-cutting theme

**Finding.** `SHADING_LINE_CONTROLS` is a single array spread into all four algorithms (`...SHADING_LINE_CONTROLS` at registry 1753/1838/1900/1969). Several requirements above (R6, R7) need the *same control id* to be shown on one algorithm and hidden on another. A flat shared array cannot express that.

**Disposition: RETYPE the shared block into a factory** `buildShadingControls({ algo, faceCapable, allowHatch, allowCrease, allowHiddenLine })` that returns the block with per-algorithm `showIf` injected. This preserves the single source of truth (no hand-forked copies → no drift, satisfying the registry's existing compile-gate philosophy) while letting each algorithm declare which enhancements its geometry supports:

| Algo | faceCapable | allowHatch | allowCrease | allowHiddenLine | depthCue/outline |
|---|---|---|---|---|---|
| polyhedron | yes | yes | yes | yes | yes |
| meshTopography | yes | yes | yes | yes | yes |
| spiral3d | no | **no** | **no** | line-mapped (keep) | yes |
| imageSurface | per-mode | mesh/bars only | **no** | face-modes only | yes |

**Acceptance criterion:** one factory definition; each algorithm calls it with its capability flags; a unit test asserts that face-only controls (`hatchEnable`, `showCreases`) are hidden on spiral3d and (crease) on imageSurface, and shown on polyhedron/meshTopography. No duplicate label within any algo (ties into R10).

---

## Summary disposition table

| Req | Defect | Control(s) | Disposition | Priority |
|---|---|---|---|---|
| R3 | D3 | imageSurface `noiseMode`,`noiseAmount` | GATE (showIf: stack non-empty) + reorder | **P0** |
| R1 | D1 | polyhedron `vertexOcclusionMode` | WIRE (true occlusion test) | P1 |
| R7 | D7 | imageSurface shading block | SPLIT: WIRE outline + (hatch/hidden-line for face modes); GATE/HIDE crease + non-face hatch/hidden-line | P1 |
| R6 | D6 | spiral3d shading block | GATE off face-only controls; keep depthCue/outline/hiddenLine | P1 |
| R10 | naming | `focalLength` vs `depthCueStrength` labels | RELABEL ("Perspective Strength" / "Depth Cue Strength") | P1 |
| R2 | D2 | meshTopography `artworkSize` | REMOVE (control + default + dead reader) | P2 |
| R8 | D8 | polyhedron `sideCount` | GATE (polygon solids only) | P2 |
| R9 | D9 | polyhedron `depth` | GATE (extruding solids only) | P2 |
| R4 | D4 | imageSurface `smoothing` | GATE (non-builtin sources) | P2 |
| R5 | D5 | imageSurface `seeThrough` | WIRE mesh (or GATE if mesh can't self-occlude) | P2 |
| R-CC | cross-cut | shared shading block | RETYPE into capability factory | (enables R6/R7) |

---

## Open questions for the critique pass

1. **R5 disposition is conditional.** It hinges on whether mesh mode can self-occlude at all. The next agent should reproduce mesh occlusion before locking WIRE vs GATE.
2. **R3 reorder vs. inline hint.** Is gating `noiseMode`/`noiseAmount` enough, or should we also render an empty-stack hint ("Add a noise layer to enable")? Proposed: gate now, hint as a fast-follow.
3. **R7 outline on flat `lines`/`topography`.** "Outline = outer profile of the relief field" needs a concrete definition of the boundary path for polyline modes; if there is no clean silhouette, downgrade `emphasizeOutline` to GATE (face modes only) for imageSurface.
4. **R9 `flatPolygon` exclusion.** Confirm `flatPolygon` ignores `depth` (it should — it is 2D). If any 2D solid secretly reads depth, adjust the gate set.
5. **Versioning/baselines.** R1, R5, R7 (wired paths) and R2 (removed reader) change output where they fire → regenerate `test:visual` baselines deliberately; patch-bump + `npm run version:sync`; CHANGELOG + plans.md entries per the docs contract.
