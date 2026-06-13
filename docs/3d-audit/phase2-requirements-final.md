# Phase 2 — 3D Parameter Remediation Requirements (FINAL)

**Date:** 2026-06-13
**Status:** Final — reconciled against adversarial critique.
**Inputs:** `docs/3d-audit/phase1-parameter-audit.md`, `src/ui/controls-registry.js`, `src/config/defaults.js`, `src/core/algorithms/{spiral3d,polyhedron,mesh-topography,image-surface}.js`, `geometry3d.js`.

## What changed from the draft (critique reconciliation)
- **R7** — the critique is correct and load-bearing: imageSurface has **zero** `emphasizeOutline`/`weightScale` wiring (grep confirms only comments). "WIRE outline all modes" was a major mis-pricing. Outline is **split**: WIRE for face-derivable modes (mesh/bars), HIDE for flat lines/topography (no clean boundary algorithm). `hiddenLineMode`/`depthBias` are tested in **bars** mode (where `occludeBarEdges` makes them live, image-surface.js:444,696), not default lines.
- **R5** — DOWNGRADED WIRE→GATE-or-default-fix. Verified `buildMesh`→`pushVisibilityPaths`→`splitPathByVisibility({keepHidden:p.seeThrough!==false})` (image-surface.js:298). Mesh **already** consults `seeThrough`, and registry:1953 **already** gates it to mesh/topography/bars/lines-as-planes. The only residual defect is "default mesh doesn't self-occlude," a defaults problem. Resolution: change the imageSurface mesh default to a self-occluding tilt/amplitude.
- **R3** — empty-stack hint pulled **into** R3 (not fast-follow). A bare hide of two controls is the same "reads as broken" class the audit kills.
- **R2** — reader description corrected: primary is `scaleX3d ?? primitiveScaleX`; `finite(p.artworkSize,150)*0.42` is the default-arg fallback (mesh-topography.js:112). Exact replacement spelled out + byte-identity test.
- **R1** — acceptance now requires a **named fixture solid** with a provably front-facing-yet-occluded vertex; if no built-in solid qualifies, R1 narrows to importedMesh.
- **ADD R-CONSIST** — uniform "inapplicable control" idiom + stable section header/order across all four panels.
- **R10 / R-CC priority** — R10 promoted to first (no-baseline) wave; R-CC marked P1 prerequisite, sequenced before R6/R7.

## Guiding product principles
1. **No dead controls.** A visible control must change the render in its current context or be hidden via `showIf`.
2. **Wire where a line-based equivalent exists; hide where it doesn't.** Face-only enhancements (Lambert hatch, crease, painter depth-bias) are meaningful only with closed faces; for pure line/dot output we HIDE, never fake.
3. **Consistent idiom.** Across the four 3D panels, "inapplicable here" must look the same and live in the same place.
4. **Determinism preserved.** Presets/baselines stay byte-identical unless the change *is* the fix; regenerate baselines deliberately.

## Waves & priority
**Wave 1 (no baseline regen — gates, relabels, removes):** R10, R-CC, R3, R6, R8, R9, R2, R4, R5(gate path).
**Wave 2 (baseline regen — wiring):** R1, R7(outline+hatch wiring), R5(default change if pursued).

| Priority | Requirements |
|---|---|
| **P0** | R3 |
| **P1** | R-CC, R10, R1, R7, R6, R-CONSIST |
| **P2** | R2, R8, R9, R4, R5 |

---

### R3 — imageSurface noise (`noiseMode`+`noiseAmount`) — GATE + empty-stack hint — D3 — P0
**Root cause:** noise IS wired (`applyNoise`), but `createNoiseField` returns null when `p.noises` has no enabled layers (image-surface.js:88-89) and the default stack is empty (defaults.js:1762). The mode/amount sliders sit ABOVE the activating `noiseList` (registry 1907/1916 vs 1917), so they read broken.
**Disposition:** GATE both `noiseMode`/`noiseAmount` with `showIf: (p) => (p.noises||[]).some(n => n.enabled !== false)`. Reorder: header → noiseList → (gated) mode → (gated) amount. **Include an empty-stack hint** ("Add a noise layer to enable") rendered under the header when no enabled layer exists, so the gate never silently hides two controls. Do NOT seed a default noise layer (would mutate every preset's geometry). Verify `controls-registry-compile.test.js` does not assert byte-identity of `CONTROL_DEFS.imageSurface` ordering before assuming R3 is test-free.
**Acceptance:** *Red:* with `noises:[]`, both `showIf` return false and the hint renders. *Green:* with one enabled layer, both `showIf` true AND `generate({...defaults,noises:[layer],noiseAmount:1}) ≠ ...noiseAmount:0` (≥2 distinct signatures across add & replace modes).

### R-CC — Shared "Shading & Lines" block → capability-driven factory — RETYPE — P1 (prereq for R6/R7)
**Finding:** `SHADING_LINE_CONTROLS` (registry:71) is one array spread into all four algos (1753/1838/1899/1968). A flat array cannot show a control id on one algo and hide it on another, which R6/R7 require.
**Disposition:** RETYPE into `buildShadingControls({ algo, faceCapable, allowHatch, allowCrease, allowHiddenLine })` that injects per-algo `showIf`, preserving a single source of truth.

| Algo | faceCapable | allowHatch | allowCrease | allowHiddenLine | outline |
|---|---|---|---|---|---|
| polyhedron | yes | yes | yes | yes | wired |
| meshTopography | yes | yes | yes | yes | wired |
| spiral3d | no | no | no | line-mapped (keep) | already wired |
| imageSurface | per-mode | mesh/bars only | no | face-modes only | mesh/bars only |

**Acceptance:** one factory; each algo calls with flags; face-only controls hidden on spiral3d and (crease) on imageSurface, shown on polyhedron/meshTopography; no duplicate label within any algo. **Hard dependency: land before R6 and R7.**

### R10 — Label collision "Depth Strength" — RELABEL — P1 (Wave 1, do first)
**Finding:** `focalLength` and `depthCueStrength` both labeled "Depth Strength" on all four algos (registry 82, 1748/1835/1896/1966). `focalLength` is gated to perspective projection, so the collision only surfaces in perspective mode — still a real bug.
**Disposition:** `focalLength` → "Perspective Strength"; `depthCueStrength` → "Depth Cue Strength". Zero geometry/baseline impact.
**Acceptance:** unit assertion — no two controls within any `CONTROL_DEFS[algo]` share an identical `label`.

### R1 — polyhedron `vertexOcclusionMode` — WIRE (or GATE if no qualifying solid) — D1 — P1
**Finding:** polyhedron.js:315 `const visible = p.vertexOcclusionMode === 'occlude' ? pt.front : true;` consults only the vertex's own front flag, never occlusion by a nearer face. On the convex default buckyball, front vertices are on front faces, so `occlude` and `outline` render identically.
**Disposition:** WIRE `occlude` to drop vertices whose projected point falls inside a nearer opaque front face, reusing the depth-sorted `faceRecords` (polyhedron.js:236-239) via point-in-polygon against front-most faces. `outline` keeps all (current behavior). **Before committing to WIRE, confirm a built-in solid has a vertex that is front-facing yet behind a nearer face** (convex platonic/Goldberg solids may have none). Candidate: a high-`twist`/`shard`-deformed solid, or `importedMesh` with overlap. If no built-in solid qualifies, narrow R1 to GATE-on-importedMesh.
**Acceptance:** *Red:* on a **named** self-occluding fixture solid, `occlude` and `outline` yield identical vertex-glyph path counts (pin the exact solid params). *Green:* `occlude` has strictly fewer vertex-glyph paths on that fixture; `outline` byte-identical to baseline.

### R7 — imageSurface shading block — SPLIT (wire face-derivable, hide flat) — D7 — P1
Per control, keyed on whether the current `mode` emits faces (mesh/bars/lines-as-planes = faces; flat lines / topography = polylines):

| Control | Disposition | Rationale |
|---|---|---|
| `emphasizeOutline`/`outlineWeight` | **WIRE mesh & bars; HIDE on flat lines/topography** | **No existing imageSurface outline code** (grep: zero `weightScale`/`emphasizeOutline` wiring). For mesh/bars a silhouette is derivable from the facet boundary; flat polyline/marching-squares modes have no clean boundary path. Do NOT ship "WIRE all modes." |
| `hatchEnable` + light/hatch params | **WIRE mesh & bars; GATE off lines/topography** | `pushFaceHatch` exists (image-surface.js:314, called for mesh:472 & bars:672); polylines have no facet to light |
| `hiddenLineMode` | **WIRE face modes (lines-as-planes & bars); GATE off flat** | `occludeBarEdges`/`splitPathByVisibility` already consume it in those modes; flat modes use `seeThrough` |
| `depthBias` | **GATE (follows hiddenLineMode, non-backface)** | `occludeBarEdges` passes `finite(p.depthBias,0.5)` (image-surface.js:444,696) — live in bars/lines-as-planes |
| `showCreases`/`creaseAngle` | **HIDE entirely** (`showIf:()=>false`) | height-field grid: every edge is a "crease"; degenerates to wireframe |

**Outline scope note:** `emphasizeOutline` for mesh/bars requires building a boundary-path extractor (the facet silhouette) — this is net-new, not a relabel; it belongs in Wave 2 with baseline regen. If a clean boundary path proves intractable for bars, downgrade `emphasizeOutline` to HIDE on imageSurface entirely rather than ship an unbounded task.
**Acceptance:** `hatchEnable.showIf({mode:'topography'})===false`, `===true` for `mesh`; crease controls absent for imageSurface; `hiddenLineMode`/`depthBias` tested in **bars** mode (≥2 sigs on depthBias sweep where occlusion fires), hidden for flat lines & topography; outline toggle yields ≥2 sigs on mesh once the boundary extractor lands (tied to the Wave-2 boundary spec).

### R6 — spiral3d shading block — HIDE face-only controls — D6 — P1
**Finding (verified):** spiral3d emits line/dot loops, no closed faces. It already wires `depthCue`/`depthCueStrength` (applyDepthCue:301), `emphasizeOutline`/`outlineWeight` (208/236), and hidden-line/back-face mapping (250-259) — the "working five." Crease, Lambert hatch, and painter depthBias have no surface.
**Disposition:** HIDE `showCreases`, `creaseAngle`, `hatchEnable`, `lightAzimuth`, `lightElevation`, `hatchAngle`, `hatchSpacing`, `crossHatch`, `depthBias` on spiral3d (via R-CC flags). Keep the working five. No faked wireframe hatch.
**Acceptance:** schema `showIf` falsy for the hidden set on spiral3d defaults; geometry byte-identical (already no-ops); visible control count reduced.

### R-CONSIST — Uniform cross-panel idiom — ADD — P1
**Finding:** post-remediation, polyhedron/meshTopography show the full block, spiral3d shows ~5 of 14, imageSurface a per-mode subset. Without a rule the panels grow/shrink unpredictably (audit cross-cutting observation #1).
**Disposition:**
(a) The "Shading & Lines" section **header renders even when only depth-cue survives** — never collapse the section to nothing (empty-but-present reads more coherent than missing).
(b) **Lock control order identical** across algos so Depth Cue / Outline / Hidden Lines sit in the same place.
(c) **One idiom for "inapplicable here"**: all-hidden via `showIf` (chosen idiom — matches R3/R6/R8/R9), applied uniformly; no mix of hide-vs-disable across panels.
**Acceptance:** a registry test asserts (1) the Shading section header key is present for all four algos, (2) the relative order of shared control ids is identical across algos, (3) "inapplicable" controls are absent (not merely disabled) everywhere.

### R2 — meshTopography `artworkSize` — REMOVE — D2 — P2
**Finding:** reader is `Math.max(1, finite(p.scaleX3d ?? p.primitiveScaleX, finite(p.artworkSize,150)*0.42))` (mesh-topography.js:112-114). Primary is `scaleX3d`, then `primitiveScaleX` (default 65), then the `artworkSize`-derived default arg — which is never reached because `primitiveScale*` always defaults to 65. Dead in every render mode. (`artworkSize` is genuinely live on imageSurface:233 — meshTopography-specific removal.)
**Disposition:** REMOVE the control (registry:1872), the default key (defaults:1695), and replace the default-arg term `finite(p.artworkSize,150)*0.42` with the exact literal **`63`** (150 × 0.42 = 63 exactly) on all three axes: `Math.max(1, finite(p.scaleX3d ?? p.primitiveScaleX, 63))`. Old presets carrying `artworkSize` harmlessly ignore it.
**Acceptance:** schema has no `artworkSize` for meshTopography; default undefined; **byte-identity test** — `generate(defaults)` and `generate(old-preset-with-artworkSize)` both byte-identical to pre-change baseline.

### R8 — polyhedron `sideCount` — GATE — D8 — P2
**Disposition:** `showIf: (p) => ['flatPolygon','prism','antiprism','bipyramid'].includes(p.solidType)`.
**Acceptance:** `showIf({solidType:'buckyball'})===false`, `===true` for `prism`; no geometry change.

### R9 — polyhedron `depth` — GATE — D9 — P2
**Disposition:** `showIf: (p) => ['prism','antiprism','bipyramid'].includes(p.solidType)` (exclude flat 2D `flatPolygon`; polyhedron.js:61-80 consume depth as half-height; depth also normalizes `twist` at :164 — same solid set). Confirm `flatPolygon` ignores `depth` during implementation.
**Acceptance:** `showIf({solidType:'buckyball'})===false`, `===true` for `prism`; where shown, a `depth` sweep yields ≥2 distinct sigs.

### R4 — imageSurface `smoothing` (Map Blur) — GATE — D4 — P2
**Finding:** wired (image-surface.js:244-264, ≤4 box-blur passes) and active by default (18), but the built-in analytic relief is already smooth → near-no-op. `imageSourceKind` exists (defaults.js:1739) so the gate is sound.
**Disposition:** `showIf: (p) => p.imageSourceKind !== 'builtin'`. Keep — it bites on imported/painted/noise sources.
**Acceptance:** `showIf({imageSourceKind:'builtin'})===false`, `===true` for `imported`. Green test must **inject a high-frequency raster** via the `imageData`/`fixtureGrid` path (fixtureSample at image-surface.js:43) and confirm the 3×3 box blur is perceptible (≥2 distinct sigs on a 0→100 sweep) on a realistic map before locking GATE-not-remove.

### R5 — imageSurface `seeThrough` — GATE-already-present + default fix — D5 — P2
**Finding (verified):** mesh **already** consults `seeThrough` identically to lines-as-planes — `buildMesh`→`pushVisibilityPaths`→`splitPathByVisibility({keepHidden:p.seeThrough!==false})` (image-surface.js:298,467,469). And registry:1953 **already** gates `seeThrough` to mesh/topography/bars/lines-as-planes. There is nothing to WIRE and nothing to GATE. The audit no-op is purely default-config: the default mesh has no hidden segments to reveal.
**Disposition:** No wiring, no new gate. Resolve the "reads dead on default mesh" defect by **changing the imageSurface mesh default to a self-occluding tilt/amplitude** so the control demonstrably affects the default render. If product prefers not to change the default look, accept `seeThrough` as legitimately context-dependent (same class as `smoothing`) and document it — no code change.
**Acceptance:** on the (new) default self-occluding mesh, `seeThrough` true→false changes the signature. If the default is left unchanged, assert the existing `showIf` keeps `seeThrough` off non-applicable modes and document the context-dependency (no false "dead" reading in the panel).
