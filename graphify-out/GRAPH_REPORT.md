# Graph Report - /Users/jayphi/Documents/github/vectura-studio  (2026-05-02)

## Corpus Check
- 116 files · ~1,545,318 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1542 nodes · 3302 edges · 96 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 510 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]

## God Nodes (most connected - your core abstractions)
1. `Renderer` - 176 edges
2. `UI` - 119 edges
3. `getEl()` - 34 edges
4. `VectorEngine` - 31 edges
5. `App` - 30 edges
6. `sort()` - 27 edges
7. `generatePatternFillPaths()` - 24 edges
8. `applyPetalDesignerToLayer()` - 23 edges
9. `getWavetableNoiseTemplates()` - 21 edges
10. `generate()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `src/render/renderer.js — Renderer` --implements--> `UI: Dimension Rulers (Inch-labeled dimension callouts on canvas edges)`  [INFERRED]
  CLAUDE.md → src/render/renderer.js
- `src/render/renderer.js — Renderer` --implements--> `UI: Canvas Document Boundary (Dashed border showing document edges)`  [INFERRED]
  CLAUDE.md → src/render/renderer.js
- `Visual Snapshot: Masking Horizon Rings Canvas (Rings + Topo Combined)` --references--> `Algorithm: Topo - Topographic / Terrain Line Generation`  [INFERRED]
  tests/e2e/visual.spec.js-snapshots/masking-horizon-rings-canvas-desktop-visual-chromium-darwin.png → src/core/algorithms/topo.js
- `Shape Pack Algorithm` --implements--> `Shape Pack Algorithm Canonical Baseline SVG`  [INFERRED]
  src/core/algorithms/shapepack.js → tests/baselines/svg/shape-pack-canonical.svg
- `Mirror Modifier Module` --implements--> `Mirrored Masked Circles Baseline SVG`  [INFERRED]
  src/core/modifiers.js → tests/baselines/svg/mirrored-masked-circles.svg

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

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (22): isModifierLayer(), round(), rect(), buildBoundsFromVertices(), buildEllipseAnchors(), buildPolygonVertices(), buildRectangleVertices(), buildRoundedPolygonAnchors() (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (13): App, getThemeConfig(), normalizeThemeName(), buildMirroredMaskedSceneSvg(), generate(), applyAutoColorization(), clamp(), getAutoColorizationConfig() (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (110): Documentation Synchronization Matrix, Public Process Contracts, Source-of-Truth Hierarchy, Legacy Doc Status Taxonomy, Agentic Harness Strategy, Task Lifecycle Protocol, Harness Testing Matrix, Agentic Harness Governance (+102 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (89): createPetalModifier(), createPatternDesignerMarkup(), applyDesignerEdgeSymmetry(), applyPetalDesignerProfileSelection(), applyPetalDesignerToLayer(), bindPetalDesignerCanvases(), bindPetalDesignerDrag(), bindPetalDesignerShortcuts() (+81 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (32): compareVectorAngles(), cosineOfAngle(), crossProduct(), dotProduct(), estimate(), getBboxOverlap(), horizontalIntersection(), insert() (+24 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (73): clone(), deleteFromPools(), discardAllDraftPatterns(), discardDraftPattern(), duplicatePattern(), ensureCustomId(), exportPatternSvg(), getCustomPatterns() (+65 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (71): xAt(), yAt(), buildSourceFillSampler(), choosePatternFillResolution(), collectBoundaryCrossings(), collectBoundaryEndpointCandidates(), collectCompiledPaths(), collectGapIssues() (+63 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (54): listProfileFiles(), buildEnvelope(), classifyEndpoint(), firstEndSegmentHits(), firstStartSegmentHits(), pointEquals(), pointInPolygon(), segmentIntersection() (+46 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (27): clone(), isValidDrawableLayerType(), resolveDrawableLayerType(), usesManualSourceGeometry(), VectorEngine, clonePaths(), countPathPoints(), applyMaskToPaths() (+19 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (40): iterateSamples(), clamp01(), combineBlend(), createEvaluator(), SimpleNoise, cmp(), CoordRounder, applyNoiseOffset() (+32 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (52): fmt(), pathsToSvg(), shapeToSvg(), buildClipPathMarkup(), buildPreviewPair(), buildRangeValue(), buildVariantsFromDef(), clamp() (+44 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (31): applyArcMirrorToPaths(), applyMirrorToPaths(), applyRadialMirrorToPaths(), buildAxisFromAngle(), classifyPieceSide(), clipClosedPolygonByAxis(), clipPathsToHalfPlane(), clone() (+23 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (33): clone(), _buildNoiseRack(), clamp(), createFlowfieldNoise(), createGridNoise(), createPetalisDriftNoise(), createPetalisModifierNoise(), createPhyllaNoise() (+25 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (27): Attractor Algorithm, Attractor Algorithm Gallery Sample SVG, Boids Algorithm, Boids Algorithm Gallery Sample SVG, Flowfield Algorithm, Flowfield Algorithm Canonical Baseline SVG, Flowfield Algorithm Gallery Sample SVG, Gallery SVG Dark Background Style (#0b0b0d) (+19 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (26): Organic Flow / Nature-Inspired Aesthetic, Plotter Art Aesthetic, Topographic Map Aesthetic, Attractor Algorithm, Flowfield Algorithm, Hyphae/Branching Algorithm, Rings/Concentric Algorithm, Spiral Algorithm (+18 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (17): closeRing(), difference(), intersection(), multiPolygonToPaths(), normalizeMultiPolygon(), normalizeRing(), rectToMultiPolygon(), ringsToEvenOddMultiPolygon() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (16): applyPad(), applyTile(), buildParallelLinesAtAngle(), buildSlopeFamily(), clamp01(), clipInfiniteLineToBounds(), clipShearedInfiniteLineToBounds(), displacePoint() (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (17): documentUnitsToMm(), formatDocumentLength(), getDocumentUnitLabel(), getDocumentUnitPrecision(), getDocumentUnitStep(), mmToDocumentUnits(), normalizeDocumentUnits(), formatDocumentNumber() (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.18
Nodes (13): carveAt(), clamp01(), clipRow(), edgePoint(), envAtX(), heightAtScreen(), interp(), lerp() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.26
Nodes (13): centerProfile(), clamp01(), clipFanLine(), dampen(), displace(), envAtX(), getFanBottomX(), lerp() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (11): normalizePaths(), pathSignature(), serializePaths(), classify(), classifyDesignerAssignments(), clone(), extractOutlines(), outlineMapByGroup() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (11): applyPad(), applyTile(), edgePoint(), ensureClosedPath(), frac(), interp(), isClosedPath(), pointKey() (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.2
Nodes (2): loadHorizonAlgorithm(), makeNoiseRackMock()

### Community 23 - "Community 23"
Cohesion: 0.27
Nodes (5): distance(), generate(), makeDefaultBounds(), ringLeft(), ringRight()

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (5): captureSvgExport(), captureSvgExport(), createCirclePath(), createMaskedEngine(), text()

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (2): loadTerrainAlgorithm(), makeNoiseRackMock()

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 0.48
Nodes (5): getEl(), initTouchModifierBar(), initTouchMouseBridge(), refreshTouchModifierButtons(), setTouchModifier()

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (2): closed(), tile()

### Community 29 - "Community 29"
Cohesion: 0.5
Nodes (2): loadTopoAlgorithm(), makeNoiseRackMock()

### Community 30 - "Community 30"
Cohesion: 0.4
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 0.4
Nodes (1): resetHistory()

### Community 32 - "Community 32"
Cohesion: 0.4
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 0.5
Nodes (2): loadVecturaRuntime(), parseLocalScripts()

### Community 34 - "Community 34"
Cohesion: 0.4
Nodes (5): filter Operation, linesimplify Operation, linesort Operation, multipass Operation, vpype-like Optimization Integration

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 0.83
Nodes (3): applyPad(), applyTile(), frac()

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (2): loadAlgorithm(), makeNoiseRackMock()

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (2): buildParams(), clone()

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (1): Layer

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): curlAngle(), sampleField()

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (2): sourcePaths Reserved for Expanded Geometry Decision, Rationale: sourcePaths Reserved for Expanded Geometry

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

### Community 91 - "Community 91"
Cohesion: 1.0
Nodes (0): 

### Community 92 - "Community 92"
Cohesion: 1.0
Nodes (1): Non-Destructive History Timeline

### Community 93 - "Community 93"
Cohesion: 1.0
Nodes (1): CHANGELOG v0.6.80

### Community 94 - "Community 94"
Cohesion: 1.0
Nodes (1): Examples Directory README

### Community 95 - "Community 95"
Cohesion: 1.0
Nodes (1): src/config/version.js

## Ambiguous Edges - Review These
- `City — Isometric aerial city of skyscrapers rendered entirely in dense vertical hatching lines with strong perspective convergence, plotter-pen aesthetic, B&W` → `Flowfield Algorithm`  [AMBIGUOUS]
  src/inspiration/city.png · relation: conceptually_related_to

## Knowledge Gaps
- **57 isolated node(s):** `Boids Algorithm`, `Shape Pack Algorithm`, `Lissajous Algorithm`, `Mirror Modifier Module`, `Petalis Algorithm` (+52 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 47`** (2 nodes): `makeEl()`, `pattern-designer-edit-tools.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `clone()`, `petalis-noise-rack-modifiers.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `mockRandom()`, `random-in-range.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `createRenderer()`, `shape-tools.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `buildLayer()`, `ui-bootstrap-panels.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `centroidAxisOrder()`, `engine-workflow.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `clone()`, `export-determinism.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (2 nodes): `listFiles()`, `patch-vitest-unicode.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (2 nodes): `buildFillControlDefs()`, `ui-fill-panel.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `sampleField()`, `grid.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (2 nodes): `sampleField()`, `phylla.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (2 nodes): `enforceDesignerParams()`, `petalisdesigner.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `sourcePaths Reserved for Expanded Geometry Decision`, `Rationale: sourcePaths Reserved for Expanded Geometry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `playwright.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `vitest.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `modifiers.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `path-boolean.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `geometry-optimization-utils.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `document-units-preferences.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `pattern-designer-library.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `rng-noise.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `pattern-registry.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `modifier-guide-bounds.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `security_xss.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `masking.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `crop-exports-settings.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `mask-preview.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `modifier-workflow.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `algorithm-switching.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `stress.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `vitest.setup.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `sync-version.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `main.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `hyphae.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `attractor.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `palettes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `machines.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `presets.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `ui-constants.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `patterns.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `version.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `modifiers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `descriptions.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `library.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 92`** (1 nodes): `Non-Destructive History Timeline`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `CHANGELOG v0.6.80`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 94`** (1 nodes): `Examples Directory README`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (1 nodes): `src/config/version.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `City — Isometric aerial city of skyscrapers rendered entirely in dense vertical hatching lines with strong perspective convergence, plotter-pen aesthetic, B&W` and `Flowfield Algorithm`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `sort()` connect `Community 7` to `Community 1`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 10`, `Community 11`, `Community 16`, `Community 19`, `Community 20`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Why does `Renderer` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Why does `UI` connect `Community 1` to `Community 8`, `Community 10`, `Community 5`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **What connects `Boids Algorithm`, `Shape Pack Algorithm`, `Lissajous Algorithm` to the rest of the system?**
  _57 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._