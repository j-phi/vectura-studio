# Phase 4 — Low-Level Design & Parallelization Plan (3D Algorithm Panels)

**Role:** Requirement author / tech lead.
**Inputs:** Phase 1 defect log (`phase1-parameter-audit.md`), the R-series product requirements, the Phase 3 UX requirements.
**Goal:** Decompose the remediation into work units sized for *parallel* implementation while minimizing merge conflicts on the three shared files (`controls-registry.js`, `defaults.js`, `geometry3d.js`).

---

## 0. Current source reality (verified, June 2026)

The registry has drifted since the audit/requirements were authored. Verified against `src/ui/controls-registry.js` **as it stands today**:

- **Already landed** (do NOT redo): R8 (`sideCount` `showIf: polyhedronUsesSideCount`, solids `flatPolygon/prism/antiprism/bipyramid`), R9 (`depth` `showIf: polyhedronUsesDepth`, solids `prism/antiprism/bipyramid`), and the `vertexOcclusionMode` relabel → **'Point Fill'** with options **'Outline Only' / 'Hide Interior'** (registry:1819-1826). The helpers `POLYHEDRON_SIDE_COUNT_SOLIDS`, `POLYHEDRON_DEPTH_SOLIDS`, `polyhedronUsesSideCount`, `polyhedronUsesDepth` exist at registry:52-55. The test `controls-registry-showif-predicates.test.js:108-120` already asserts all three and **passes**.
- **Consequence for R1:** the relabel half is done; R1's remaining scope is the *generator wiring* (`polyhedron.js`) only. The "Point Fill" naming means `vertexOcclusionMode === 'occlude'` is presented as "Hide Interior" — wiring it to drop vertices behind nearer faces matches that label.
- **Still flat & pending:** `SHADING_LINE_CONTROLS` is a single flat array spread into all four algos (registry:76-109, spread at 1758/1843/1905/1974). R-CC (factory retype) is NOT started.
- **Still colliding:** `focalLength` and `depthCueStrength` both labeled **'Depth Strength'** (registry:87 and 1752/1839/1901/1970-ish per-algo focalLength lines). R10/UX3 pending.
- **Working-tree WIP:** `src/core/algorithms/image-surface.js` and `tests/unit/vectura-geometry-algorithms.test.js` are modified (uncommitted). Treat with care — `git diff HEAD` before staging any image-surface unit so we don't clobber the user's WIP.

### Generator-side facts that constrain the design

- **D1 (polyhedron):** `buildVertexMarkers` (polyhedron.js:381) already has `isPointOccludedByFaces(point, faceRecords, tolerance)` and `pointInPolygon`. Today occlusion drops vertices **only** when `faceOpacityMode === 'opaque'` (line ~398). `vertexOcclusionMode === 'occlude'` only pushes a screen-space **mask** (clips other linework passing through the dot) — it never drops the vertex itself. That is exactly why "Outline Only" vs "Hide Interior" render identically on the convex default buckyball. **Fix:** also drop the marker when `vertexOcclusionMode === 'occlude' && isPointOccludedByFaces(...)`, independent of `faceOpacityMode`. On a convex solid no vertex is behind a nearer face, so a **named self-occluding fixture** (high `twist` + `shard`, or `importedMesh`) is required for the Red test.
- **D3 (imageSurface noise):** noise IS wired (`applyNoise` image-surface.js:157; folded at :195) but `createNoiseField` (image-surface.js:85) returns `null` when `p.noises` has no enabled layer, and the default stack is `[]` (defaults.js:1760). So the sliders read dead. R3 = gate sliders behind a non-empty stack + empty-state hint. **No generator change, no default change.**
- **D7 / R7 (imageSurface shading):** `pushFaceHatch` (image-surface.js:314) exists and is called for mesh (:472) & bars (:672); `occludeBarEdges` → `G3.occludeSegments` (:443-444, :696) exists for bars & lines-as-planes; `seeThrough` → `splitPathByVisibility` is wired for mesh/topography/bars (:298). **No existing outline/weightScale wiring** — `emphasizeOutline`/`outlineWeight` are net-new boundary extraction.
- **D6 / R6 (spiral3d):** already wires depthCue, emphasizeOutline/outlineWeight (spiral3d.js:203-236, the silhouette rings ARE the outline), and hiddenLineMode→backface/dash (:250-259). Crease/hatch/depthBias have no surface. R6 = **schema hide only**, zero generator change.
- **geometry3d:** `extractSilhouette(faces, projected, faceFront, {weightScale})` and `extractCreases` emit `{outline:true}` / `{crease:true}` paths. These need a *faces array + projected vertices + per-face front flags* — which line geometry (spiral3d) and the flat imageSurface modes do not have. That is the root cause of every "no-op on line geometry" defect.

---

## 1. The conflict map (why partition this way)

| File | Units that touch it | Conflict strategy |
|---|---|---|
| **`src/ui/controls-registry.js`** | R-CC, R10, R3, R2, R7(schema), R6(schema), R-CONSIST, UX1, UX3, UX5, UX6, UX7, UX9 | **Single sequential lane `G-REG`.** Almost every schema change lands here. Splitting it across parallel agents guarantees conflicts. One agent owns the file end-to-end across an ordered sub-sequence. |
| **`src/config/defaults.js`** | R2 (remove `artworkSize` mesh key) | Only R2 edits it. Disjoint → its own group. (R3/R5/R6 require **no** default change.) |
| **`src/core/algorithms/geometry3d.js`** | R7 (maybe a boundary helper), R1 (reuses existing helpers, no edit) | R7 may add ONE helper (`extractFieldBoundary`). R1 needs no geometry3d edit. Keep R7's geometry3d touch inside the R7 unit; no other unit edits geometry3d. |
| **`src/core/algorithms/polyhedron.js`** | R1 only | Disjoint. |
| **`src/core/algorithms/image-surface.js`** | R7 (wire shading), R3/R4/R5 (no generator change) | R7 is the only image-surface **generator** edit. R3/R4/R5 are registry/panel/default — they do NOT touch image-surface.js. So R7 owns image-surface.js alone. **Respect the existing WIP diff.** |
| **`src/core/algorithms/spiral3d.js`** | none (R6 is schema-only) | No edit. |
| **`src/core/algorithms/mesh-topography.js`** | R2 (replace `artworkSize` default-arg with literal `63`) | Disjoint. |
| **`src/ui/panels/algo-config-panel.js`** | R3/UX10 (empty-state hint), UX1 (collapsed sections) | Two units; group them sequentially (`G-PANEL`) since both edit `renderDef`/section render at :880-889. |

**The dominant constraint:** `controls-registry.js` is the throat. Everything schema lands there. We therefore make `controls-registry.js` a **single ordered lane** and parallelize only the *generator* and *panel* work against it.

---

## 2. Hard ordering dependencies

```
R-CC (factory)  ──must land before──>  R6 (spiral3d hide flags)  &  R7 (imageSurface per-mode flags)
                                       (R6/R7 inject showIf VIA the factory's capability flags)

R10 + UX2 + UX3 + UX5 + R-CONSIST  ── same wave, same file ── (label dedup assertions must all be green together)

R3 (registry gate + hint)  ──pairs with──>  UX10 (hint idiom)  &  G-PANEL (renderer hint support)

UX1 (collapsed sections)  ──after──>  R-CC/R6/R7  (collapse what remains after per-algo reduction)
```

Because R-CC, R6, R7, R10, R-CONSIST, R3, UX-series labels all edit **the same file**, the file-level lane `G-REG` already serializes them. We order the lane so the factory (R-CC) is implemented first, then the per-algo flags (R6/R7 schema), then labels/dedup/consist, then UX presentation. This collapses the cross-file dependency graph into one in-file ordering — which is exactly what we want for a no-build single-file registry.

---

## 3. Work units

> **Convention:** every unit follows RGR — write the failing test first, verify red, implement, verify green, refactor. Bump `package.json` patch + `npm run version:sync` on each landing wave. Run the Testing-Matrix suites for the change class (schema/label ⇒ `test:unit`; generator ⇒ `test:unit`+`test:integration`+`test:visual`; renderer ⇒ `test:integration`+`test:e2e`).

### Lane G-REG — `src/ui/controls-registry.js` (SEQUENTIAL, one owner)

The lane runs these sub-units in order. They all edit the same file; do not parallelize within the lane.

#### WU1 — R-CC: retype `SHADING_LINE_CONTROLS` into `buildShadingControls(capabilities)`

- **Files:** `src/ui/controls-registry.js`.
- **Change:** Replace the flat `const SHADING_LINE_CONTROLS = [...]` (registry:76-109) with a factory:
  ```js
  const buildShadingControls = ({ faceCapable, allowHatch, allowCrease, hiddenLineModes, allowOutline, depthCueAlways = true }) => {
    // returns the section + per-control objects, each carrying its own showIf
    // composed from (existing activation predicate) && (capability predicate).
  };
  ```
  Capability semantics (predicate is a function of `p` so per-mode algos like imageSurface can vary by `p.mode`):
  - `depthCue`/`depthCueStrength`: always present (works on every algo).
  - `emphasizeOutline`/`outlineWeight`: present iff `allowOutline(p)` truthy.
  - `showCreases`/`creaseAngle`: present iff `allowCrease(p)`.
  - `hiddenLineMode`: present iff `hiddenLineModes(p)` (face-derivable visibility).
  - `depthBias`: present iff `hiddenLineModes(p)` AND existing non-backface predicate.
  - `hatchEnable` + `lightAzimuth`/`lightElevation`/`hatchAngle`/`hatchSpacing`/`crossHatch`: present iff `allowHatch(p)`.
  - Section header `{type:'section', label:'Shading & Lines'}`: ALWAYS emitted (R-CONSIST rule a).
- **Call sites:** replace each `...SHADING_LINE_CONTROLS` spread with `...buildShadingControls(CAPS)`:
  - **polyhedron / meshTopography:** all flags `() => true`.
  - **spiral3d:** `allowOutline:()=>true` (already wired), `hiddenLineModes:()=>true` (line-mapped, keep), `faceCapable/allowHatch/allowCrease:()=>false`.
  - **imageSurface:** per-mode — `faceCapable`/`hiddenLineModes`: `(p)=>['mesh','bars'].includes(p.mode) || (p.mode==='lines'&&p.horizontalLinesAsPlanes)`; `allowHatch`: `(p)=>['mesh','bars'].includes(p.mode)`; `allowOutline`: `(p)=>['mesh','bars'].includes(p.mode)`; `allowCrease:()=>false`.
- **showIf composition:** the factory must AND the capability predicate with the control's own activation predicate so existing behaviour (e.g. `depthBias` only when hiddenLineMode!=='backface') survives.
- **showIf for IDs that were unconditional before** (e.g. `emphasizeOutline`, `hiddenLineMode`, `hatchEnable` had no showIf): now get `showIf: (p)=>capability(p)` where the algo's capability is not `()=>true`.
- **Single source of truth preserved:** one factory, four call sites.
- **RGR test (`tests/unit/controls-registry-shading-factory.test.js`, new):**
  - Red: assert `buildShadingControls` is exported/usable and that `CONTROL_DEFS.spiral3d.find(d=>d.id==='hatchEnable').showIf(ALGO_DEFAULTS.spiral3d)===false` (fails today: control has no showIf).
  - Green: implement factory; assert spiral3d hatch/crease/depthBias `showIf` falsy on defaults; polyhedron/mesh all `showIf` truthy; imageSurface `hatchEnable.showIf({mode:'topography'})===false` and `===true` for `{mode:'mesh'}`; exactly one `{type:'section',label:'Shading & Lines'}` per algo.
- **Risk:** med (touches all four panels' tail).

#### WU2 — R6 (spiral3d) + R7-schema (imageSurface) flags via the factory

> NOTE: R6/R7 *schema* is largely realized by WU1's capability flags. This sub-unit exists to (a) finalize the exact imageSurface per-mode predicates and (b) add an assertion harness. Keep it folded into WU1 if the same agent owns the lane; listed separately so the R6/R7 acceptance criteria are explicitly tracked. **Generator wiring for R7 is a SEPARATE non-registry unit (WU8).**
- **Files:** `src/ui/controls-registry.js`.
- **Change:** finalize the imageSurface capability predicates listed in WU1; for spiral3d confirm the hidden set (`showCreases, creaseAngle, hatchEnable, lightAzimuth, lightElevation, hatchAngle, hatchSpacing, crossHatch, depthBias`) is absent on defaults while the working five remain.
- **RGR test (same new file):**
  - R6: every id in the spiral3d hidden set has `showIf(ALGO_DEFAULTS.spiral3d)===false`; `depthCue`, `depthCueStrength`(when cue on), `emphasizeOutline`, `outlineWeight`(when on), `hiddenLineMode` remain present.
  - R7: `hatchEnable.showIf({mode:'mesh'})===true`, `({mode:'topography'})===false`; crease ids absent for imageSurface in ALL modes (`showCreases` undefined or `showIf` always false); `hiddenLineMode`/`depthBias` present for `{mode:'bars'}`, absent for `{mode:'lines',horizontalLinesAsPlanes:false}` and `{mode:'topography'}`.
- **Risk:** low (predicate tuning on top of WU1).
- **Depends on:** WU1.

#### WU3 — R10 + UX3 + UX5 + UX2 + R-CONSIST: labels, dedup, order lock (the no-baseline label wave)

- **Files:** `src/ui/controls-registry.js`.
- **Changes (label-only unless noted; ids never change):**
  - **R10/UX3:** `focalLength` label 'Depth Strength' → **'Perspective Strength'** (all four algos). `depthCueStrength` label 'Depth Strength' → **'Depth Cue Strength'** (in the factory). `depthBias` label 'Depth Bias' → **'Occlusion Bias'** (in the factory).
  - **UX5:** polyhedron `rotate`→'Yaw', `tilt`→'Pitch'; meshTopography `rotate`→'Yaw', `tilt`→'Pitch' (keep `roll`→'Roll'); imageSurface `rotate`→'Yaw', `tilt`→'Pitch'. spiral3d already Yaw/Pitch/Roll.
  - **UX2 (polyhedron Hidden-Lines de-dup):** the shared `hiddenLineMode` (label 'Hidden Lines') now lands on polyhedron via the factory, colliding with `faceOpacityMode` (label 'Hidden Lines', registry:1791). **Preferred:** verify the shared `hiddenLineMode` (backface/remove/dash) supersedes `faceOpacityMode` (Dashed/Pruned) on polyhedron; if it does, relabel `faceOpacityMode` → **'Hidden Faces'** (it controls face opacity, not line treatment). Do NOT remove the generator-read id this wave (the polyhedron generator still reads `faceOpacityMode` at polyhedron.js:319/398) — relabel only to satisfy the assertion; removal is a follow-up.
  - **R-CONSIST:** add the order-lock — shared shading control ids appear in the SAME relative order across all four algos (guaranteed by the single factory; just assert it). Section header always emitted (WU1).
- **RGR test (`tests/unit/controls-registry-3d-labels.test.js`, new):**
  - Red: `CONTROL_DEFS.polyhedron` contains two controls with label 'Depth Strength' (and 'Hidden Lines') today → assertion "no two controls in any 3D `CONTROL_DEFS[algo]` share an identical label" fails.
  - Green: after relabels, the no-duplicate-label assertion passes for all four algos; no label in any 3D panel begins with "Depth " more than once; the relative order of shared shading ids is identical across the four algos (compare the filtered id sequence).
- **Risk:** low (label-only). **First wave, byte-identical geometry.**
- **Depends on:** WU1 (factory must exist so the shared labels are centralized).

#### WU4 — R3: gate imageSurface noise sliders + reorder Surface Noise section

- **Files:** `src/ui/controls-registry.js`.
- **Change:**
  - Add `showIf: noiseStackActive` to BOTH `noiseMode` and `noiseAmount` where `const noiseStackActive = (p={}) => (p.noises||[]).some(n => n.enabled !== false);`. Define the helper near the other registry helpers (registry:52 area).
  - **Reorder** the Surface Noise section so the activating `noiseList` precedes the gated sliders: `{section 'Surface Noise'}` → `{type:'noiseList'...}` → `noiseMode(gated)` → `noiseAmount(gated)`. (Today the sliders sit ABOVE the list, registry:1907/1916 vs 1918.)
  - Add an empty-state hint def under the section header — a new lightweight schema marker, e.g. `{type:'sectionHint', text:'Add a noise layer to enable', showIf:(p)=>!noiseStackActive(p)}`. The renderer support for `sectionHint` is **WU9** (G-PANEL). The registry only declares it.
- **No default change, no generator change** (do NOT seed a noise layer — would mutate every preset).
- **RGR test (`tests/unit/controls-registry-imagesurface-noise.test.js`, new + an integration sig test):**
  - Red: with `ALGO_DEFAULTS.imageSurface.noises===[]`, `noiseMode.showIf` / `noiseAmount.showIf` are absent (undefined) → currently truthy/visible. After change they must be `false`.
  - Green schema: both `showIf({noises:[]})===false`; both `showIf({noises:[{enabled:true}]})===true`; the `sectionHint` def exists with `showIf({noises:[]})===true`.
  - Green generator (in `vectura-geometry-algorithms.test.js`): `pathSignature(generate('imageSurface',{...defaults, noises:[layer], noiseAmount:1, noiseMode:'add'}))` ≠ `...noiseAmount:0`, and `replace` mode also differs (≥2 distinct sigs across add & replace).
  - **Compile-gate check:** confirm no test asserts byte-identity of `CONTROL_DEFS.imageSurface` ordering before relying on the reorder being safe. (Verified: `control-defs-data-contract.test.js` only byte-checks a few representative non-imageSurface tables; safe.)
- **Risk:** low (schema reorder + gate).
- **Depends on:** none in-file ordering-wise, but lands in lane after WU1-3 to avoid churn.

#### WU5 — R2: remove `artworkSize` from meshTopography schema

- **Files:** `src/ui/controls-registry.js` (remove the meshTopography `artworkSize` def, registry:~1872).
- **Change:** delete the `{ id:'artworkSize', ... }` line from `CONTROL_DEFS.meshTopography` ONLY. (imageSurface keeps its `artworkSize` — it is live there.)
- **Pairs with WU6** (defaults + generator). Schema removal lands in this lane; the default-key removal and generator literal are WU6 (disjoint files).
- **RGR test (`tests/unit/controls-registry-3d-labels.test.js` or the data-contract test):** `CONTROL_DEFS.meshTopography.find(d=>d.id==='artworkSize')===undefined`.
- **Risk:** low.

#### WU6 (lane G-REG cont.) — UX7 + UX9p2 + UX6 (type-swap + label-only)

- **Files:** `src/ui/controls-registry.js`.
- **Change:**
  - **UX7 (angle dial, safe subset):** `lightAzimuth` (in factory) and `planeRotate` (meshTopography) `type:'range'` → `type:'angle'`, preserving min/max/step/displayUnit. Leave `lightElevation`, `hatchAngle`, all pitch/tilt as `range`. `horizontalLineAngle`/`topographyAngle` stay `range` (mod-180; documented).
  - **UX9 part 2 (spiral3d shape labels):** `baseRadius` 'Cone Radius'→'Radius', `coneHeight` 'Cone Height'→'Height', `cylinderRadius`→'Radius', `cylinderHeight`→'Height', `capsuleRadius`→'Radius', `capsuleHeight`→'Height'. ids unchanged. (Only one shape's dimension controls are visible at a time via existing `showIf`, so no co-visible label collision.)
  - **UX6 (vocab):** meshTopography `contourVisibility` option 'Full / Dashed Hidden' label → 'See-Through (dashed)'. No id/type/value change.
- **RGR test (extend labels test):** `lightAzimuth.type==='angle'`, `planeRotate.type==='angle'`, `lightElevation.type==='range'`; for any single spiral3d `shape`, visible dimension labels are bare ('Radius'/'Height') with no co-visible duplicate; randomization smoke produces a value for the converted angle controls.
- **Risk:** low.
- **Depends on:** WU1 (factory owns `lightAzimuth`), WU3 (labels settled).

#### WU7 (lane G-REG tail) — UX1 + UX9p1 schema flags (`collapsed` + imageSurface section split)

- **Files:** `src/ui/controls-registry.js` (schema flags only; renderer support is WU10/G-PANEL).
- **Change:**
  - **UX1:** add `collapsed:true` to the shared `Shading & Lines` section def (in the factory) and to polyhedron's `Effects` section def. Additive field; absent ⇒ today's behavior.
  - **UX9 part 1:** split imageSurface 'Surface' section into 'Surface' (`mode, mapType, artworkSize, amplitude, sampleDetail`) + a `collapsed:true` 'Map Adjust' section (`gamma, contrast, invert, clipBlackAreas, smoothing, normalFlipY`). `mode` stays first in 'Surface'.
- **RGR test:** the `Shading & Lines` and polyhedron `Effects` section defs carry `collapsed:true`; imageSurface has both 'Surface' and 'Map Adjust' section defs with the listed partition; all other section defs unaffected. Header label still present (R-CONSIST rule a).
- **Risk:** low-med (must land AFTER WU1/WU2; pairs with renderer WU10).
- **Depends on:** WU1, WU2, and renderer WU10 for the flag to render (schema-safe to land first).

---

### Lane G-DEFAULTS+GEN (parallel-safe, disjoint files)

#### WU-R1 — D1: wire polyhedron `vertexOcclusionMode` ('Hide Interior') true face occlusion

- **Files:** `src/core/algorithms/polyhedron.js` ONLY.
- **Change:** in `buildVertexMarkers` (polyhedron.js:381), add a drop when occlude is selected:
  ```js
  if (p.vertexOcclusionMode === 'occlude' && isPointOccludedByFaces(point, faceRecords, size * 0.16)) return;
  ```
  placed alongside the existing `faceOpacityMode==='opaque'` drop. Keep the mask-push for 'occlude' (so dots still clip linework) OR replace it — decide so that 'outline' keeps all markers and 'occlude' drops occluded ones. Verify on a built-in self-occluding solid; if none qualifies (convex platonics/buckyball don't), the Red fixture is a high-twist+shard deformed solid or `importedMesh` with overlap.
- **RGR test (`vectura-geometry-algorithms.test.js`, extend the existing polyhedron block):**
  - Red: pin a NAMED self-occluding fixture (e.g. `{solidType:'icosahedron', twist:170, shard:90, showVertices:true, showFaces:true, surfaceMode:'all'}` — confirm during impl that this yields a front-vertex behind a nearer front face) and assert `vertex-glyph path count` equal for `vertexOcclusionMode:'outline'` vs `'occlude'`.
  - Green: `occlude` has strictly fewer vertex-glyph paths on that fixture; `outline` byte-identical to baseline (default solid unaffected — convex, no occlusion).
- **Risk:** med (geometry; baseline-regen wave 2). **Disjoint file — fully parallel with G-REG.**

#### WU-R2gen — R2: meshTopography default-key + generator literal

- **Files:** `src/config/defaults.js` (remove `artworkSize:150` at meshTopography, defaults.js:1693) + `src/core/algorithms/mesh-topography.js` (replace `finite(p.artworkSize,150)*0.42` with literal `63` on all three axes, mesh-topography.js:112-114 → `Math.max(1, finite(p.scaleX3d ?? p.primitiveScaleX, 63))`).
- **RGR test (`vectura-geometry-algorithms.test.js`):**
  - Red: a test that `generate('meshTopography', {...defaults, artworkSize:30})` ≠ `...artworkSize:260` would FAIL today (artworkSize already dead) — instead assert the *replacement contract*: `generate('meshTopography')` byte-identical before/after, and `generate('meshTopography', {artworkSize:260})` byte-identical to `generate('meshTopography')` (old presets carrying artworkSize ignored).
  - Green: `ALGO_DEFAULTS.meshTopography.artworkSize===undefined`; both signatures match the pre-change baseline.
- **Risk:** low. **Disjoint files — parallel with G-REG and WU-R1.** Pairs with WU5 (schema removal in G-REG) — the schema and the default/generator can land in the same wave but in different files (no conflict; just both must ship together to avoid a dangling schema entry or dangling default).
- **conflictsWith:** WU5 (logically paired, physically disjoint files — safe to run parallel, must ship together).

#### WU-R4 — R4: gate imageSurface `smoothing` (Map Blur) to non-builtin sources

- **Files:** `src/ui/controls-registry.js`? — NO, to avoid conflicting with lane G-REG, place this showIf addition INTO lane G-REG as a sub-step OR (preferred) co-locate with WU7's imageSurface section split since `smoothing` moves into 'Map Adjust' anyway. **Decision: fold R4's `showIf:(p)=>p.imageSourceKind!=='builtin'` onto the `smoothing` def as part of WU7** (same control, same section move). This avoids a second agent editing the registry.
- **RGR test:** `smoothing.showIf({imageSourceKind:'builtin'})===false`, `({imageSourceKind:'imported'})===true`. Green generator test (in geometry test): inject a high-frequency raster via the `imageData`/`fixtureGrid` path (image-surface.js fixtureSample:43) and confirm the box blur is perceptible (≥2 distinct sigs on a 0→100 sweep) on a realistic map.
- **Risk:** low. **Folded into WU7 (registry) + a generator-side test in the geometry test file.**
- **conflictsWith:** WU7 (same `smoothing` def).

#### WU-R5 — R5: imageSurface `seeThrough` — keep wired+gated, choose no-default-change branch + document

- **Files:** none code-changing in the chosen branch (per UX10's resolution, prefer R5's no-default-change branch). Documentation only: note `seeThrough` is legitimately context-dependent (like `smoothing`) and relies on a self-occluding mesh to demonstrate. The empty-state/idiom guard is covered by UX10/WU4.
- **RGR test (`vectura-geometry-algorithms.test.js`):** assert the existing `seeThrough.showIf` keeps it off non-applicable modes (already true) AND a positive demonstration test: on a self-occluding mesh fixture (`{mode:'mesh', tilt:75, amplitude:120, rows:30, columns:30}` — tune to produce hidden segments), `seeThrough:true` vs `false` yields distinct signatures. This proves the control is live (not dead) without mutating the default.
- **Risk:** none (test + doc). **Disjoint — parallel.** If product later wants the default changed, that is a separate baseline-regen follow-up.

#### WU8 — R7-generator: wire imageSurface face-mode shading (outline + hatch already partly there)

- **Files:** `src/core/algorithms/image-surface.js` + possibly ONE new helper in `src/core/algorithms/geometry3d.js`.
- **Change:**
  - **hatch (mesh/bars):** already wired (`pushFaceHatch` :314, called :472/:672). Confirm it fires; no new code beyond ensuring the schema gate (WU2) matches.
  - **hiddenLineMode + depthBias (bars / lines-as-planes):** already wired via `occludeBarEdges`→`occludeSegments` (:443-444,:696). Confirm; ensure `depthBias` sweep produces ≥2 sigs in BARS mode where occlusion fires.
  - **emphasizeOutline / outlineWeight (mesh & bars):** NET-NEW. Extract the facet silhouette / field boundary and stamp `{outline:true, weightScale}`. For mesh, the boundary is the artwork-rect perimeter projected (or the visible-cell hull); for bars, the union outline of bar tops. Add `G3.extractFieldBoundary(points, p, {weightScale})` to geometry3d if a clean boundary helper is warranted; otherwise emit the projected rect perimeter as the outline. **Bounded-scope guard:** if a clean boundary proves intractable for bars, downgrade bars-outline to HIDE (set `allowOutline` false for bars in WU1) rather than ship an unbounded task — coordinate that flip back into the G-REG lane.
  - **showCreases/creaseAngle:** HIDE entirely (handled by WU1 `allowCrease:()=>false`). No generator change.
- **RGR test (`vectura-geometry-algorithms.test.js`):**
  - hatch: `generate('imageSurface',{mode:'mesh',hatchEnable:true,...})` emits paths with `meta.hatch` (or whatever pushFaceHatch stamps); `{mode:'topography',hatchEnable:true}` does NOT (gated).
  - hiddenLine/depthBias: BARS mode, `depthBias` 0→3 sweep ≥2 distinct sigs where occlusion fires; flat `lines`/`topography` unaffected.
  - outline: once the boundary extractor lands, `emphasizeOutline:true` on `{mode:'mesh'}` yields ≥2 sigs and emits `meta.outline` paths.
- **Risk:** med-high (net-new outline extraction; baseline-regen wave 2). **Owns image-surface.js alone. Respect the existing WIP diff — `git diff HEAD` first.**
- **Depends on:** WU1/WU2 (schema gates must match the modes the generator wires). conflictsWith: none (sole owner of image-surface.js).

---

### Lane G-PANEL — `src/ui/panels/algo-config-panel.js` (SEQUENTIAL, one owner)

#### WU9 — R3/UX10: render the `sectionHint` empty-state idiom

- **Files:** `src/ui/panels/algo-config-panel.js`.
- **Change:** in `renderDef` (algo-config-panel.js:880), handle `def.type === 'sectionHint'`: respect `def.showIf`, render a small muted `.control-section-hint` element with `def.text`. Reuse an existing muted/hint CSS token; new rule goes in `src/ui/skin/components.css` if none exists.
- **RGR test (`tests/integration/...` or a renderer unit):** with imageSurface `noises:[]`, the panel renders the hint element with text 'Add a noise layer to enable'; with an enabled layer, the hint is absent. (Pairs with WU4's schema `sectionHint` def.)
- **Risk:** low. **Depends on:** WU4 (schema def).
- **CSS:** any new rule in `src/ui/skin/components.css` (per CLAUDE.md), not inline.

#### WU10 — UX1: render `collapsed:true` sections as closed disclosures

- **Files:** `src/ui/panels/algo-config-panel.js` + `src/ui/skin/components.css` (and/or `motion.css` for the transition).
- **Change:** teach the section renderer (algo-config-panel.js:883-889) to render a `collapsed:true` section as a collapsible disclosure (reuse the existing `global-section` collapsible header or `pendulum-advanced` `<details>/<summary>` idiom — no new visual vocabulary). Closed on first render; header label present in DOM (R-CONSIST rule a). For collapse animation use `max-height + visibility` or `grid-template-rows` (NOT display:none↔max-height swap, per CLAUDE.md).
- **RGR test (renderer/integration):** a section def with `collapsed:true` produces a disclosure element closed on first render whose header label is in the DOM; a section def without the flag renders today's always-open block. Geometry byte-identical (presentation-only).
- **Risk:** low-med. **Depends on:** WU7 (schema flags) + WU9 (same file, sequential). conflictsWith: WU9 (same file → same lane).

---

### Deferred / baseline-regen (Wave 3)

#### WU-UX8 — normalize pitch/tilt range to [-90,90] (NOT baseline-neutral)

- **Files:** `src/ui/controls-registry.js` (G-REG lane, but scheduled in the baseline-regen wave, not the label wave).
- **Change:** polyhedron `tilt` [0,89]→[-90,90]; imageSurface `tilt` [0,89]→[-90,90]; meshTopography `tilt` [-180,180]→[-90,90]. spiral3d `pitch` already [-90,90].
- **RGR test + baseline:** schema min/max assertions; all `defaults.js` tilt/pitch defaults remain in [-90,90] (no default render change); a preset with out-of-range tilt loads without error (generator clamps via `finite`, not slider min/max). Regenerate SVG baselines in the same commit (`npm run test:update`).
- **Risk:** med. **Bundle with R1/R7 baseline-regen wave (Wave 3).**

---

## 4. Parallelization summary

| parallelGroup | Units (run sequentially WITHIN group) | Runs in parallel WITH |
|---|---|---|
| **G-REG** (`controls-registry.js`) | WU1 → WU2 → WU3 → WU4 → WU5 → WU6 → WU7 (→ WU-UX8 wave 3) | G-GEN, G-PANEL |
| **G-GEN-POLY** (`polyhedron.js`) | WU-R1 | everything else |
| **G-GEN-MESH** (`defaults.js` + `mesh-topography.js`) | WU-R2gen | everything else |
| **G-GEN-IMG** (`image-surface.js` + maybe `geometry3d.js`) | WU8 | everything except its WU1/WU2 schema dependency |
| **G-TEST-R5** (`vectura-geometry-algorithms.test.js`, seeThrough demo + doc) | WU-R5 | everything (test-only; coordinate test-file merge) |
| **G-PANEL** (`algo-config-panel.js` + skin CSS) | WU9 → WU10 | G-REG, G-GEN |

**Test-file contention note:** WU-R1, WU-R2gen, WU8, WU-R5, and several G-REG units all add cases to `tests/unit/vectura-geometry-algorithms.test.js` (already WIP-modified). To avoid merge churn, give NEW schema-only tests their own files (`controls-registry-shading-factory.test.js`, `controls-registry-3d-labels.test.js`, `controls-registry-imagesurface-noise.test.js`) and let only the *generator* units append to `vectura-geometry-algorithms.test.js` — and serialize those appends (treat the geometry test file as a soft shared lane, append at clearly separated `describe` blocks).

## 5. Dependency ordering (cross-lane)

1. **Wave 1 (no baseline):** G-REG WU1→WU2→WU3 (factory + flags + labels), WU4 (noise gate) + G-PANEL WU9 (hint), WU-R2gen + WU5 (artworkSize removal), WU-R5 (seeThrough demo+doc). All byte-identical geometry except artworkSize-removal (proven byte-identical).
2. **Wave 2 (presentation/type + baseline-regen for wiring):** G-REG WU6 (angle/labels), WU7 (collapsed + section split + R4 gate) + G-PANEL WU10 (disclosure render); WU-R1 (polyhedron occlusion, baseline regen), WU8 (imageSurface shading wiring, baseline regen).
3. **Wave 3 (baseline-regen ranges):** WU-UX8.

Each wave: bump patch, `npm run version:sync`, run Testing-Matrix suites; Wave 2/3 regenerate SVG baselines in-commit.
