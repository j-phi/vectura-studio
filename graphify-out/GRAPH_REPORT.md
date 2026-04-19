# Graph Report - .  (2026-04-19)

## Corpus Check
- Large corpus: 234 files · ~1,481,568 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1254 nodes · 2666 edges · 86 communities detected
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 334 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Math & Color Utilities|Math & Color Utilities]]
- [[_COMMUNITY_Geometry & Layer Rendering|Geometry & Layer Rendering]]
- [[_COMMUNITY_App State & Preferences|App State & Preferences]]
- [[_COMMUNITY_Documentation & Governance|Documentation & Governance]]
- [[_COMMUNITY_Path Construction & Sampling|Path Construction & Sampling]]
- [[_COMMUNITY_Layer Type System|Layer Type System]]
- [[_COMMUNITY_SVG Export & UI|SVG Export & UI]]
- [[_COMMUNITY_Wavetable Algorithm|Wavetable Algorithm]]
- [[_COMMUNITY_Pattern Fill & Contours|Pattern Fill & Contours]]
- [[_COMMUNITY_Path Geometry Operations|Path Geometry Operations]]
- [[_COMMUNITY_Algorithm Gallery & Baselines|Algorithm Gallery & Baselines]]
- [[_COMMUNITY_Aesthetic & Inspiration|Aesthetic & Inspiration]]
- [[_COMMUNITY_Mirror Modifiers|Mirror Modifiers]]
- [[_COMMUNITY_Noise System|Noise System]]
- [[_COMMUNITY_Document Units & State|Document Units & State]]
- [[_COMMUNITY_Layer Optimization|Layer Optimization]]
- [[_COMMUNITY_Wavetable Horizon Tests|Wavetable Horizon Tests]]
- [[_COMMUNITY_Path Serialization|Path Serialization]]
- [[_COMMUNITY_Path Endpoint Processing|Path Endpoint Processing]]
- [[_COMMUNITY_Algorithm Bias & Presets|Algorithm Bias & Presets]]
- [[_COMMUNITY_Topographic Algorithm|Topographic Algorithm]]
- [[_COMMUNITY_Segment Endpoint Handling|Segment Endpoint Handling]]
- [[_COMMUNITY_Integration Test Helpers|Integration Test Helpers]]
- [[_COMMUNITY_Pattern Diagnostics|Pattern Diagnostics]]
- [[_COMMUNITY_Visual Regression Tests|Visual Regression Tests]]
- [[_COMMUNITY_Seam Helpers|Seam Helpers]]
- [[_COMMUNITY_Coordinate Validation|Coordinate Validation]]
- [[_COMMUNITY_Test Runtime Setup|Test Runtime Setup]]
- [[_COMMUNITY_Export Operations Pipeline|Export Operations Pipeline]]
- [[_COMMUNITY_Topo Closure Tests|Topo Closure Tests]]
- [[_COMMUNITY_Random & Averaging Utils|Random & Averaging Utils]]
- [[_COMMUNITY_Profile File Management|Profile File Management]]
- [[_COMMUNITY_Rings Noise Tests|Rings Noise Tests]]
- [[_COMMUNITY_Petal Designer Tests|Petal Designer Tests]]
- [[_COMMUNITY_Mask Preview Tests|Mask Preview Tests]]
- [[_COMMUNITY_Algorithm Determinism Tests|Algorithm Determinism Tests]]
- [[_COMMUNITY_Benchmark Suite|Benchmark Suite]]
- [[_COMMUNITY_Layer Core|Layer Core]]
- [[_COMMUNITY_Flowfield Algorithm|Flowfield Algorithm]]
- [[_COMMUNITY_Boids Algorithm|Boids Algorithm]]
- [[_COMMUNITY_Shape Pack Algorithm|Shape Pack Algorithm]]
- [[_COMMUNITY_Petalis Noise Modifier Tests|Petalis Noise Modifier Tests]]
- [[_COMMUNITY_Random Utility Tests|Random Utility Tests]]
- [[_COMMUNITY_Shape Tools Tests|Shape Tools Tests]]
- [[_COMMUNITY_UI Bootstrap Tests|UI Bootstrap Tests]]
- [[_COMMUNITY_Engine Workflow Tests|Engine Workflow Tests]]
- [[_COMMUNITY_Export Determinism Tests|Export Determinism Tests]]
- [[_COMMUNITY_Test Patch Utilities|Test Patch Utilities]]
- [[_COMMUNITY_Grid Algorithm|Grid Algorithm]]
- [[_COMMUNITY_Phylla Algorithm|Phylla Algorithm]]
- [[_COMMUNITY_Rings Algorithm|Rings Algorithm]]
- [[_COMMUNITY_Petalis Designer|Petalis Designer]]
- [[_COMMUNITY_sourcePaths Design Rationale|sourcePaths Design Rationale]]
- [[_COMMUNITY_Playwright Config|Playwright Config]]
- [[_COMMUNITY_Vitest Config|Vitest Config]]
- [[_COMMUNITY_Modifiers Tests|Modifiers Tests]]
- [[_COMMUNITY_Geometry Optimization Tests|Geometry Optimization Tests]]
- [[_COMMUNITY_Document Units Tests|Document Units Tests]]
- [[_COMMUNITY_RNG Noise Tests|RNG Noise Tests]]
- [[_COMMUNITY_Modifier Guide Bounds Tests|Modifier Guide Bounds Tests]]
- [[_COMMUNITY_Security XSS Tests|Security XSS Tests]]
- [[_COMMUNITY_Masking Tests|Masking Tests]]
- [[_COMMUNITY_Crop Export Tests|Crop Export Tests]]
- [[_COMMUNITY_Mask Preview Tests (unit)|Mask Preview Tests (unit)]]
- [[_COMMUNITY_Modifier Workflow Tests|Modifier Workflow Tests]]
- [[_COMMUNITY_Algorithm Switching Tests|Algorithm Switching Tests]]
- [[_COMMUNITY_Stress Tests|Stress Tests]]
- [[_COMMUNITY_Vitest Setup|Vitest Setup]]
- [[_COMMUNITY_Version Sync Script|Version Sync Script]]
- [[_COMMUNITY_App Entry Point|App Entry Point]]
- [[_COMMUNITY_Algorithm Registry|Algorithm Registry]]
- [[_COMMUNITY_Hyphae Algorithm|Hyphae Algorithm]]
- [[_COMMUNITY_Attractor Algorithm|Attractor Algorithm]]
- [[_COMMUNITY_Color Palettes Config|Color Palettes Config]]
- [[_COMMUNITY_Machine Profiles Config|Machine Profiles Config]]
- [[_COMMUNITY_Presets Config|Presets Config]]
- [[_COMMUNITY_UI Constants|UI Constants]]
- [[_COMMUNITY_Pattern Fill Config|Pattern Fill Config]]
- [[_COMMUNITY_Version Config|Version Config]]
- [[_COMMUNITY_Modifiers Module|Modifiers Module]]
- [[_COMMUNITY_Algorithm Descriptions|Algorithm Descriptions]]
- [[_COMMUNITY_Petal Library|Petal Library]]
- [[_COMMUNITY_UndoRedo History|Undo/Redo History]]
- [[_COMMUNITY_Changelog v0.6.80|Changelog v0.6.80]]
- [[_COMMUNITY_Examples Directory|Examples Directory]]
- [[_COMMUNITY_Version File|Version File]]

## God Nodes (most connected - your core abstractions)
1. `UI` - 281 edges
2. `Renderer` - 176 edges
3. `round()` - 43 edges
4. `getEl()` - 38 edges
5. `VectorEngine` - 31 edges
6. `clamp()` - 25 edges
7. `clone()` - 22 edges
8. `App` - 22 edges
9. `generate()` - 20 edges
10. `CLAUDE.md Architecture Overview` - 15 edges

## Surprising Connections (you probably didn't know these)
- `src/render/renderer.js — Renderer` --implements--> `UI: Dimension Rulers (Inch-labeled dimension callouts on canvas edges)`  [INFERRED]
  CLAUDE.md → src/render/renderer.js
- `src/render/renderer.js — Renderer` --implements--> `UI: Canvas Document Boundary (Dashed border showing document edges)`  [INFERRED]
  CLAUDE.md → src/render/renderer.js
- `Visual Snapshot: Masking Horizon Rings Canvas (Rings + Topo Combined)` --references--> `Algorithm: Topo - Topographic / Terrain Line Generation`  [INFERRED]
  tests/e2e/visual.spec.js-snapshots/masking-horizon-rings-canvas-desktop-visual-chromium-darwin.png → src/core/algorithms/topo.js
- `maskAlpha()` --calls--> `round()`  [INFERRED]
  src/core/algorithms/rainfall.js → tests/helpers/path-signature.js
- `Visual Snapshot: Rotated Polygon Selection (Hexagon with Rotation Transform Handles)` --references--> `src/render/renderer.js — Renderer`  [INFERRED]
  tests/e2e/visual.spec.js-snapshots/rotated-polygon-selection-canvas-desktop-visual-chromium-darwin.png → CLAUDE.md

## Hyperedges (group relationships)
- **Core Engine Data Pipeline** — engine_js, algorithms_index_js, masking_js, modifiers_js, optimization_utils_js, renderer_js [EXTRACTED 0.95]
- **Noise Rack Algorithm Consumers** — noise_rack_js, algorithms_index_js, engine_js, config_defaults_js [EXTRACTED 0.90]
- **Documentation Governance Document Set** — readme_vectura_studio, changelog_unreleased, plans_punchlist, agents_md, agentic_harness_strategy, testing_md, github_governance, pre_release_hardening_log [EXTRACTED 0.95]
- **Testing Infrastructure** — vitest_toolchain, playwright_toolchain, workflow_test_yml, workflow_dependency_review_yml, workflow_codeql_yml, svg_baselines [EXTRACTED 0.95]
- **Configuration Subsystem** — config_defaults_js, config_presets_js, config_version_js [EXTRACTED 0.90]
- **Visual Regression Baseline SVGs** — rainfall_canonical_svg, masking_horizon_rings_svg, flowfield_canonical_svg, mirrored_masked_circles_svg, petalis_canonical_svg, wavetable_horizon_3d_canonical_svg, shape_pack_canonical_svg, lissajous_canonical_svg, wavetable_horizon_canonical_svg [EXTRACTED 0.98]
- **Gallery Sample SVGs** — boids_gallery_svg, flowfield_gallery_svg, attractor_gallery_svg [EXTRACTED 0.98]
- **Standard 320x220 ViewBox Baselines** — rainfall_canonical_svg, masking_horizon_rings_svg, flowfield_canonical_svg, petalis_canonical_svg, wavetable_horizon_3d_canonical_svg, shape_pack_canonical_svg, lissajous_canonical_svg, wavetable_horizon_canonical_svg [EXTRACTED 0.99]
- **Gallery Dark Theme Style (900x600, #0b0b0d bg, white stroke)** — boids_gallery_svg, flowfield_gallery_svg, attractor_gallery_svg, gallery_dark_background, gallery_svg_900x600 [EXTRACTED 0.97]
- **Masking and Modifier Test Baselines** — masking_horizon_rings_svg, mirrored_masked_circles_svg, masking_module, modifier_mirror_module [INFERRED 0.88]
- **Wavetable Algorithm Variant Baselines** — wavetable_horizon_canonical_svg, wavetable_horizon_3d_canonical_svg, wavetable_algorithm [INFERRED 0.92]
- **Visual Regression Tests Covering Masking Behavior** — visual_spec_js, masking_horizon_rings_canvas_desktop_visual_chromium_darwin, broken_masking_canvas_desktop_visual_chromium_darwin, oval_mask_parent_wavetable_canvas_desktop_visual_chromium_darwin, mirrored_masked_circles_canvas_desktop_visual_chromium_darwin, masking_js [INFERRED 0.93]
- **Visual Regression Tests Covering Selection and Transform Handles** — visual_spec_js, rotated_polygon_selection_canvas_desktop_visual_chromium_darwin, rotated_rectangle_selection_canvas_desktop_visual_chromium_darwin, document_dimensions_canvas_desktop_visual_chromium_darwin, renderer_js, ui_rotation_handles, ui_selection_box, ui_transform_highlight [INFERRED 0.92]
- **Wavetable Algorithm Visual Test Coverage** — algorithm_wavetable, main_shell_desktop_visual_chromium_darwin, document_dimensions_canvas_desktop_visual_chromium_darwin, oval_mask_parent_wavetable_canvas_desktop_visual_chromium_darwin [INFERRED 0.87]
- **Contour / Topographic Inspiration Family** — contour_dune_ridge_img, contour_canyon_terraces_img, contour_crater_depression_img, contour_cellular_bulbs_img, contour_portrait_face_img, algo_topo, aesthetic_topographic [INFERRED 0.90]
- **Flowfield and Attractor Inspiration Family** — flowing_ribbon_streamlines_img, vortex_flowlines_img, radial_branching_rings_img, algo_flowfield, algo_attractors, aesthetic_organic_flow [INFERRED 0.87]
- **Scanline Displacement / Heightfield Rendering Family** — neon_scanline_totem_img, line_warped_heightfield_img, technique_scanline_displacement, algo_wavetable [INFERRED 0.92]
- **Portrait Rendering via Line Technique Family** — spiral_halftone_figure_img, contour_portrait_face_img, technique_halftone_spiral, technique_contour_portrait, algo_spiral, algo_topo [INFERRED 0.88]
- **All Chunk 4 Plotter Art Inspirations** — radial_branching_rings_img, contour_dune_ridge_img, contour_canyon_terraces_img, flowing_ribbon_streamlines_img, vortex_flowlines_img, city_img, contour_crater_depression_img, spiral_halftone_figure_img, neon_scanline_totem_img, contour_cellular_bulbs_img, contour_portrait_face_img, line_warped_heightfield_img, aesthetic_plotter_art [INFERRED 0.85]

## Communities

### Community 0 - "Math & Color Utilities"
Cohesion: 0.03
Nodes (10): clone(), round(), clamp(), cloneExportPath(), createPetalModifier(), formatValue(), getThemeToken(), isPetalisLayerType() (+2 more)

### Community 1 - "Geometry & Layer Rendering"
Cohesion: 0.03
Nodes (6): isModifierLayer(), rect(), cloneShape(), getThemeToken(), makeShapeReticleCursor(), Renderer

### Community 2 - "App State & Preferences"
Cohesion: 0.04
Nodes (9): App, getThemeConfig(), normalizeThemeName(), buildMaskedSceneSvg(), buildMirroredMaskedSceneSvg(), pathsToSvg(), getEl(), usesSeed() (+1 more)

### Community 3 - "Documentation & Governance"
Cohesion: 0.03
Nodes (110): Documentation Synchronization Matrix, Public Process Contracts, Source-of-Truth Hierarchy, Legacy Doc Status Taxonomy, Agentic Harness Strategy, Task Lifecycle Protocol, Harness Testing Matrix, Agentic Harness Governance (+102 more)

### Community 4 - "Path Construction & Sampling"
Cohesion: 0.05
Nodes (55): iterateSamples(), clamp01(), combineBlend(), createEvaluator(), applyDesignerProfileSymmetry(), applyLineType(), applyModifiers(), bboxFromPoints() (+47 more)

### Community 5 - "Layer Type System"
Cohesion: 0.06
Nodes (27): clone(), isValidDrawableLayerType(), resolveDrawableLayerType(), usesManualSourceGeometry(), VectorEngine, clonePaths(), countPathPoints(), applyMaskToPaths() (+19 more)

### Community 6 - "SVG Export & UI"
Cohesion: 0.06
Nodes (44): fmt(), shapeToSvg(), buildClipPathMarkup(), buildPreviewPair(), buildRangeValue(), buildVariantsFromDef(), clampPointToRect(), clipPathToRect() (+36 more)

### Community 7 - "Wavetable Algorithm"
Cohesion: 0.08
Nodes (44): applyPad(), applyTile(), baseNoise(), buildHorizonRow(), buildParallelLinesAtAngle(), buildSlopeFamily(), buildVisiblePolylineSegments(), cellularData() (+36 more)

### Community 8 - "Pattern Fill & Contours"
Cohesion: 0.12
Nodes (27): choosePatternFillResolution(), contourLines(), dedupeSequentialPoints(), generatePatternFillPaths(), getSubpathStrings(), getTargetSvgData(), hatchLines(), insetPolygon() (+19 more)

### Community 9 - "Path Geometry Operations"
Cohesion: 0.1
Nodes (17): closePathIfNeeded(), joinNearbyPaths(), buildBoundsFromVertices(), buildEllipseAnchors(), buildPolygonVertices(), buildRectangleVertices(), buildRoundedPolygonAnchors(), buildShapeAnchors() (+9 more)

### Community 10 - "Algorithm Gallery & Baselines"
Cohesion: 0.11
Nodes (27): Attractor Algorithm, Attractor Algorithm Gallery Sample SVG, Boids Algorithm, Boids Algorithm Gallery Sample SVG, Flowfield Algorithm, Flowfield Algorithm Canonical Baseline SVG, Flowfield Algorithm Gallery Sample SVG, Gallery SVG Dark Background Style (#0b0b0d) (+19 more)

### Community 11 - "Aesthetic & Inspiration"
Cohesion: 0.16
Nodes (26): Organic Flow / Nature-Inspired Aesthetic, Plotter Art Aesthetic, Topographic Map Aesthetic, Attractor Algorithm, Flowfield Algorithm, Hyphae/Branching Algorithm, Rings/Concentric Algorithm, Spiral Algorithm (+18 more)

### Community 12 - "Mirror Modifiers"
Cohesion: 0.16
Nodes (20): applyMirrorToPaths(), classifyPieceSide(), clipClosedPolygonByAxis(), clone(), clonePath(), createMirrorLine(), createModifierState(), flattenCirclePath() (+12 more)

### Community 13 - "Noise System"
Cohesion: 0.2
Nodes (13): SimpleNoise, applyPad(), applyTile(), baseNoise(), cellularData(), cellularNoise(), fbmNoise(), frac() (+5 more)

### Community 14 - "Document Units & State"
Cohesion: 0.24
Nodes (7): documentUnitsToMm(), formatDocumentLength(), getDocumentUnitLabel(), getDocumentUnitPrecision(), getDocumentUnitStep(), mmToDocumentUnits(), normalizeDocumentUnits()

### Community 15 - "Layer Optimization"
Cohesion: 0.15
Nodes (1): getMaskExportBounds()

### Community 16 - "Wavetable Horizon Tests"
Cohesion: 0.17
Nodes (7): average(), classifyHorizonPaths(), clone(), getSpacingStats(), groupSegmentsByIndex(), render(), renderHorizon3D()

### Community 17 - "Path Serialization"
Cohesion: 0.22
Nodes (11): normalizePaths(), pathSignature(), serializePaths(), classify(), classifyDesignerAssignments(), clone(), extractOutlines(), outlineMapByGroup() (+3 more)

### Community 18 - "Path Endpoint Processing"
Cohesion: 0.29
Nodes (14): applyEndpointTruncation(), buildEnvelope(), clamp(), classifyEndpoint(), findEndTailCut(), findStartTailCut(), interpolatePoint(), pathLength() (+6 more)

### Community 19 - "Algorithm Bias & Presets"
Cohesion: 0.33
Nodes (11): applyAlgorithmBias(), applyLissajousBias(), applyPetalisBias(), applyRainfallBias(), applyShapePackBias(), clamp(), pickRandom(), randomInRange() (+3 more)

### Community 20 - "Topographic Algorithm"
Cohesion: 0.27
Nodes (8): edgePoint(), ensureClosedPath(), interp(), isClosedPath(), pointKey(), refineByGradient(), sampleField(), smoothPath()

### Community 21 - "Segment Endpoint Handling"
Cohesion: 0.31
Nodes (7): buildEnvelope(), classifyEndpoint(), firstEndSegmentHits(), firstStartSegmentHits(), pointEquals(), pointInPolygon(), segmentIntersection()

### Community 22 - "Integration Test Helpers"
Cohesion: 0.22
Nodes (5): captureSvgExport(), captureSvgExport(), createCirclePath(), createMaskedEngine(), text()

### Community 23 - "Pattern Diagnostics"
Cohesion: 0.25
Nodes (0): 

### Community 24 - "Visual Regression Tests"
Cohesion: 0.33
Nodes (0): 

### Community 25 - "Seam Helpers"
Cohesion: 0.5
Nodes (2): closed(), tile()

### Community 26 - "Coordinate Validation"
Cohesion: 0.4
Nodes (0): 

### Community 27 - "Test Runtime Setup"
Cohesion: 0.5
Nodes (2): loadVecturaRuntime(), parseLocalScripts()

### Community 28 - "Export Operations Pipeline"
Cohesion: 0.4
Nodes (5): filter Operation, linesimplify Operation, linesort Operation, multipass Operation, vpype-like Optimization Integration

### Community 29 - "Topo Closure Tests"
Cohesion: 0.5
Nodes (0): 

### Community 30 - "Random & Averaging Utils"
Cohesion: 0.5
Nodes (0): 

### Community 31 - "Profile File Management"
Cohesion: 0.5
Nodes (0): 

### Community 32 - "Rings Noise Tests"
Cohesion: 0.67
Nodes (0): 

### Community 33 - "Petal Designer Tests"
Cohesion: 0.67
Nodes (0): 

### Community 34 - "Mask Preview Tests"
Cohesion: 0.67
Nodes (0): 

### Community 35 - "Algorithm Determinism Tests"
Cohesion: 1.0
Nodes (2): buildParams(), clone()

### Community 36 - "Benchmark Suite"
Cohesion: 0.67
Nodes (0): 

### Community 37 - "Layer Core"
Cohesion: 0.67
Nodes (1): Layer

### Community 38 - "Flowfield Algorithm"
Cohesion: 1.0
Nodes (2): curlAngle(), sampleField()

### Community 39 - "Boids Algorithm"
Cohesion: 0.67
Nodes (0): 

### Community 40 - "Shape Pack Algorithm"
Cohesion: 0.67
Nodes (0): 

### Community 41 - "Petalis Noise Modifier Tests"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Random Utility Tests"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Shape Tools Tests"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "UI Bootstrap Tests"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Engine Workflow Tests"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Export Determinism Tests"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Test Patch Utilities"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Grid Algorithm"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Phylla Algorithm"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Rings Algorithm"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Petalis Designer"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "sourcePaths Design Rationale"
Cohesion: 1.0
Nodes (2): sourcePaths Reserved for Expanded Geometry Decision, Rationale: sourcePaths Reserved for Expanded Geometry

### Community 53 - "Playwright Config"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Vitest Config"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Modifiers Tests"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Geometry Optimization Tests"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Document Units Tests"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "RNG Noise Tests"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Modifier Guide Bounds Tests"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Security XSS Tests"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Masking Tests"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Crop Export Tests"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Mask Preview Tests (unit)"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Modifier Workflow Tests"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Algorithm Switching Tests"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Stress Tests"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Vitest Setup"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Version Sync Script"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "App Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Algorithm Registry"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Hyphae Algorithm"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Attractor Algorithm"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Color Palettes Config"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Machine Profiles Config"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Presets Config"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "UI Constants"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Pattern Fill Config"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Version Config"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Modifiers Module"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Algorithm Descriptions"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Petal Library"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Undo/Redo History"
Cohesion: 1.0
Nodes (1): Non-Destructive History Timeline

### Community 83 - "Changelog v0.6.80"
Cohesion: 1.0
Nodes (1): CHANGELOG v0.6.80

### Community 84 - "Examples Directory"
Cohesion: 1.0
Nodes (1): Examples Directory README

### Community 85 - "Version File"
Cohesion: 1.0
Nodes (1): src/config/version.js

## Ambiguous Edges - Review These
- `City — Isometric aerial city of skyscrapers rendered entirely in dense vertical hatching lines with strong perspective convergence, plotter-pen aesthetic, B&W` → `Flowfield Algorithm`  [AMBIGUOUS]
  src/inspiration/city.png · relation: conceptually_related_to

## Knowledge Gaps
- **57 isolated node(s):** `Non-Destructive History Timeline`, `linesimplify Operation`, `linesort Operation`, `filter Operation`, `multipass Operation` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Petalis Noise Modifier Tests`** (2 nodes): `clone()`, `petalis-noise-rack-modifiers.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Random Utility Tests`** (2 nodes): `mockRandom()`, `random-in-range.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shape Tools Tests`** (2 nodes): `createRenderer()`, `shape-tools.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Bootstrap Tests`** (2 nodes): `ui-bootstrap-panels.test.js`, `buildLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Engine Workflow Tests`** (2 nodes): `centroidAxisOrder()`, `engine-workflow.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Export Determinism Tests`** (2 nodes): `clone()`, `export-determinism.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Patch Utilities`** (2 nodes): `listFiles()`, `patch-vitest-unicode.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Grid Algorithm`** (2 nodes): `sampleField()`, `grid.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Phylla Algorithm`** (2 nodes): `sampleField()`, `phylla.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rings Algorithm`** (2 nodes): `sampleNoise()`, `rings.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Petalis Designer`** (2 nodes): `enforceDesignerParams()`, `petalisdesigner.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `sourcePaths Design Rationale`** (2 nodes): `sourcePaths Reserved for Expanded Geometry Decision`, `Rationale: sourcePaths Reserved for Expanded Geometry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Playwright Config`** (1 nodes): `playwright.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Config`** (1 nodes): `vitest.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modifiers Tests`** (1 nodes): `modifiers.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Geometry Optimization Tests`** (1 nodes): `geometry-optimization-utils.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Document Units Tests`** (1 nodes): `document-units-preferences.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `RNG Noise Tests`** (1 nodes): `rng-noise.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modifier Guide Bounds Tests`** (1 nodes): `modifier-guide-bounds.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Security XSS Tests`** (1 nodes): `security_xss.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Masking Tests`** (1 nodes): `masking.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Crop Export Tests`** (1 nodes): `crop-exports-settings.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Mask Preview Tests (unit)`** (1 nodes): `mask-preview.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modifier Workflow Tests`** (1 nodes): `modifier-workflow.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Algorithm Switching Tests`** (1 nodes): `algorithm-switching.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Stress Tests`** (1 nodes): `stress.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vitest Setup`** (1 nodes): `vitest.setup.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Version Sync Script`** (1 nodes): `sync-version.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Entry Point`** (1 nodes): `main.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Algorithm Registry`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Hyphae Algorithm`** (1 nodes): `hyphae.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Attractor Algorithm`** (1 nodes): `attractor.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Color Palettes Config`** (1 nodes): `palettes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Machine Profiles Config`** (1 nodes): `machines.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Presets Config`** (1 nodes): `presets.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Constants`** (1 nodes): `ui-constants.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pattern Fill Config`** (1 nodes): `patterns.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Version Config`** (1 nodes): `version.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modifiers Module`** (1 nodes): `modifiers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Algorithm Descriptions`** (1 nodes): `descriptions.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Petal Library`** (1 nodes): `library.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Undo/Redo History`** (1 nodes): `Non-Destructive History Timeline`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Changelog v0.6.80`** (1 nodes): `CHANGELOG v0.6.80`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Examples Directory`** (1 nodes): `Examples Directory README`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Version File`** (1 nodes): `src/config/version.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `City — Isometric aerial city of skyscrapers rendered entirely in dense vertical hatching lines with strong perspective convergence, plotter-pen aesthetic, B&W` and `Flowfield Algorithm`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `UI` connect `Math & Color Utilities` to `App State & Preferences`, `Path Construction & Sampling`, `SVG Export & UI`, `Pattern Fill & Contours`, `Document Units & State`, `Layer Optimization`?**
  _High betweenness centrality (0.236) - this node is a cross-community bridge._
- **Why does `round()` connect `Math & Color Utilities` to `Geometry & Layer Rendering`, `App State & Preferences`, `Path Construction & Sampling`, `Layer Type System`, `SVG Export & UI`, `Wavetable Algorithm`, `Pattern Fill & Contours`, `Path Geometry Operations`, `Noise System`, `Layer Optimization`, `Path Serialization`, `Algorithm Bias & Presets`?**
  _High betweenness centrality (0.207) - this node is a cross-community bridge._
- **Why does `Renderer` connect `Geometry & Layer Rendering` to `Math & Color Utilities`, `App State & Preferences`, `Layer Type System`, `Path Geometry Operations`, `Layer Optimization`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `round()` (e.g. with `openColorPickerAnchoredTo()` and `roundToStep()`) actually correct?**
  _`round()` has 42 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Non-Destructive History Timeline`, `linesimplify Operation`, `linesort Operation` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Math & Color Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._