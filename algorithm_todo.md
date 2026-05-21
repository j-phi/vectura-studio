# Algorithm Inspiration Implementation Spec

Date: 2026-05-20

This is the executable roadmap for extending Vectura Studio so it can generate work in the visual families now present in `src/inspiration/`. It replaces the earlier attachment-derived draft with an audit of the actual files in the folder.

The goal is not to copy individual images. The goal is to make Vectura capable of generating the underlying visual systems: image-encoded lines, dot and glyph fields, topographic contours, moire waves, parametric tubes, grammar branches, tilings, isometric weaves, and perspective meshes.

## Repo Context

- Vectura is a browser-native, vanilla-JS, plotter-first vector app.
- New generators must produce path arrays compatible with the existing engine, renderer, layer system, pen metadata, SVG export, masks, and post-processing controls.
- New noise behavior must converge on the shared Noise Rack model. Do not add a private algorithm-specific noise stack unless the exception is documented and later extractable.
- New algorithms must be seeded and deterministic for fixed params, seed, and bounds.
- RGR means Red-Green-Refactor. Each spec below includes tests to write first, the behavior that makes them pass, and the cleanup expected after the behavior is stable.

## Actual Inspiration Inventory

### High Priority PNG Set

These are the clearest direct targets and should drive the first presets.

| File | Visual family | Implementation target |
| --- | --- | --- |
| `download.png` | 3D tube knot made from dense projected cross-section rings | `parametricTube` |
| `download-1.png` | L-system botanical branch with formula caption | `lSystem` |
| `download-2.png` | Seamless nested contour tile with looping peanut/ring fields | `contourField` tile mode |
| `download-3.png` | Beige field of cross glyph clusters, color/size falloff | `glyphField` |
| `download-4.png` | Tiny capsule/dash field with blocky pastel vector flow | `glyphField` plus vector orientation |
| `download-5.png` | Red/magenta cross glyph density wells | `glyphField` with radial wells |
| `download-6.png` | Diagonal hatch map/silhouette with yellow/black regions | `scanlineWeaver` |
| `download-7.png` | Portrait from topographic pencil contours | `contourField` image mode |
| `download-8.png` | Hexagonal radial fan weave with colored line sectors | `tessellationWeave` hex fan mode |
| `download-9.png` | Yellow/brown hex/cube labyrinth with circuit corridors | `tessellationWeave` labyrinth mode |
| `download-10.png` | Purple/pink isometric cube weave with holes | `tessellationWeave` isometric cube mode |
| `download-11.png` | Blue/cyan isometric stepped column weave | `tessellationWeave` isometric column mode |

### Existing Named PNG Set

These earlier references remain relevant and now serve as contour, wave, and parametric validation targets.

| File | Visual family | Implementation target |
| --- | --- | --- |
| `contour-canyon-terraces.png` | Dense topographic terracing and ridge lines | `contourField`, Topo refinements |
| `contour-cellular-bulbs.png` | Cellular relief and grayscale height contours | `contourField` |
| `contour-crater-depression.png` | Radial depression/crater contour field | `contourField` |
| `contour-dune-ridge.png` | River/canyon topography with strong contour breaks | `contourField` |
| `contour-portrait-face.png` | Image portrait from contour bands | `contourField` image mode |
| `flowing-ribbon-streamlines.png` | Vertical ribbon streamlines | `scanlineWeaver`, Flowfield refinement |
| `line-warped-heightfield.png` | Word/image revealed by warped horizontal scanlines | `scanlineWeaver` |
| `neon-scanline-totem.png` | Figure encoded by horizontal scanlines and neon bands | `scanlineWeaver` |
| `radial-branching-rings.png` | Paired radial ring/tube loops | `parametricTube`, `polarLouver` mode |
| `spiral-halftone-figure.png` | Soft figure from spiral/line density | `glyphField`, `scanlineWeaver` |
| `vortex-flowlines.png` | Vortex and turbulent streamlines | Flowfield and `scanlineWeaver` presets |

### JPG/GIF Visual Taxonomy

The JPG set adds enough breadth that the plan should be organized by visual systems, not one-off algorithms.

#### Image-Encoded Portraits And Objects

Files:

- `0619d04a51f8cad7d5be5d4d01aef671.jpg`
- `8a4c9289b151382e79e37173f6f07da3.jpg`
- `8d378aaf4398edc3f6551eea86b7d47c.jpg`
- `f9ccb5f389510e772c031bf7072d9cc5.jpg`
- `3519b32f647765a4c7c46cd8e0c69634.jpg`
- `67a8f98ad743c1fdd1124220d14c4559.jpg`
- `4b323f230d154b9ba220982e434e68af.jpg`
- `d62af1b27311f5b5641388d1a96f2e2d.jpg`
- `d90c877b3be211006efdb138ffd94aaa.jpg`

Observed grammar:

- Faces and objects emerge from parallel line width, line breaks, dot size, dash density, or contour displacement.
- Several references use black background with white marks; output must be pen-color agnostic and not assume white paper.
- Some image encodings are hard clipped to circles/spheres; others fade through density.

Primary specs:

- `scanlineWeaver`
- `glyphField`
- `contourField` image mode

#### Polar, Radial, And Louvered Forms

Files:

- `05d504fce7f53765fdb8e00bd59c871c.jpg`
- `120519670df2615d63efa3a645b9594a.jpg`
- `1e16802c3207d42a540b2c6c8bca97af.jpg`
- `528fd8c82b8dfa6c3364b6b4125768bc.jpg`
- `537d97aac4b57dfd16ff602929292348.jpg`
- `b95ebf19a7d8ec60cc3207ba8f8b3617.jpg`
- `bea9727ccb527a56d2ef197644710b67.jpg`
- `aa3ebe1328fef4ab23b8bd98ba95c42e.jpg`
- `d14ba75edcf2910f726bfdacc6c2c706.jpg`
- `f16b2cb3f96f289701abeef36a3055dc.jpg`

Observed grammar:

- Radial bars, polar spokes, louvered circles, nested orbital curves, paired light fields, and sphere-like depth bands.
- These are not just Lissajous curves; many use polar sampling, angular clipping, and image/field-driven dash lengths.

Primary specs:

- `polarLouver`
- `parametricTube`
- `scanlineWeaver` polar mode

#### Glyph And Motif Fields

Files:

- `download-3.png`
- `download-4.png`
- `download-5.png`
- `e5ec1cd61288d5c7567e5b48e98256ea.jpg`
- `e913590eb06b75354396dd7c89922d7d.jpg`
- `dec31f180b4ba7b4db41d129b232bd4b.jpg`
- `1e86d8601df7627af9c079c454411aa0.jpg`
- `5cc8fa080116961b8804035d8a85b99d.jpg`
- `dbda4520298b9174eddf04db75236617.jpg`

Observed grammar:

- Repeated marks are the main unit: crosses, dots, capsules, Y-shapes, scallops, short line stacks, and interlocking arcs.
- Marks encode scalar field value through size, opacity surrogate, spacing, rotation, or dropout.
- Some examples are local compositions, others are tileable pattern systems.

Primary specs:

- `glyphField`
- `tessellationWeave` motif mode
- Pattern integration

#### Moire, Wavetable, And Flow-Line Textures

Files:

- `5532bf65750e21ce7d6885ba29fefffe.jpg`
- `c0fbddafad81f377d76fcb74e53d4fa1.jpg`
- `c44a63c4e47258c08f2d3291af9eb4eb.jpg`
- `cd68ebe5d1917518c5dfc82f7ec27c9c.jpg`
- `d0125915f025adc3fabb64764daf24af.jpg`
- `d303116d72b7fedfe9a3a9fc9875d0db.jpg`
- `d37e4a8c7a80341ad40a20ff057f1da7.jpg`
- `e25a47cddf4f6300fcc5a16d4bbf363a.jpg`
- `fba1cd2345c2f98135d65fbe112dafa1.jpg`
- `fd1681c635418911c1e1ba10e431974a.jpg`

Observed grammar:

- Repeated line families reveal waves, dunes, storms, water, and abstract fields.
- Several references need line breaking, field-aware spacing, and depth/brightness bands rather than just y-displacement.

Primary specs:

- `scanlineWeaver`
- Wavetable refinements
- Flowfield presets

#### Contour, Topographic, And Relief Studies

Files:

- `a81e83383e71aeea316b01cc8f7bd898.jpg`
- `bde29af91b455c294351783a85e64da4.jpg`
- `89c74ad1ebef5b53b4b61cc7e755de2c.jpg`
- `bb69fc03d7aa35132ab06efa9ab09d1d.jpg`
- all named `contour-*.png`

Observed grammar:

- Contour lines can be dense, sparse, tileable, image-derived, landscape-derived, or used as product/background ornament.
- Good implementation requires one reusable contour pipeline with different source fields.

Primary specs:

- `contourField`
- Topo refinements
- Pattern generated tiles

#### Mesh, Terrain, Wormhole, And Perspective Grids

Files:

- `285a0d5a894b9bc72123a442a7e40a33.jpg`
- `77a8ba3f1e11577c4395b3bfd12897d1.jpg`
- `bbcb8d43ee73d31e0ae70d59685499fe.jpg`
- `f3777fb6da1afa01a1558197ede40e09.gif`

Observed grammar:

- Wire terrain, deformed surface meshes, polar tunnels, and perspective city/road grids.
- This is distinct from the current Terrain algorithm: the references emphasize mesh topology and projection structure as art, not only realistic heightfield scanlines.

Primary specs:

- `perspectiveMesh`
- Terrain/Horizon refinements

#### Tiling, Hex, Isometric, And Architectural Weaves

Files:

- `download-8.png`
- `download-9.png`
- `download-10.png`
- `download-11.png`
- `1e86d8601df7627af9c079c454411aa0.jpg`
- `5cc8fa080116961b8804035d8a85b99d.jpg`
- `e913590eb06b75354396dd7c89922d7d.jpg`
- `dec31f180b4ba7b4db41d129b232bd4b.jpg`

Observed grammar:

- Isometric/cube-based patterns rely on face-aware stroke families and over-under ordering.
- Hex fan work relies on clipped radial sectors and color by sector.
- Small motif wallpaper references need seamless pattern export and Pattern Designer reuse.

Primary specs:

- `tessellationWeave`
- Pattern integration

## Product Strategy

### North Star

Vectura should become a system for building plotter-ready generative print studies from reusable visual grammars. A user should be able to pick a reference family, choose a preset, adjust high-level controls, and export clean SVG paths without manually tracing or cleaning geometry.

### First Release Goal

Ship enough infrastructure and algorithms that every inspiration group above has at least one credible generator and one deterministic visual baseline.

### Design Principles

- Prefer generators that expose a grammar, not a fixed effect.
- Keep high-level controls visible first: density, scale, source, field, mark, angle, seed, pen mapping.
- Keep advanced controls collapsible: field composition, image preprocessing, clipping tolerances, path caps, and perf caps.
- Make algorithm output self-describing through `path.meta`: `penIndex`, `family`, `source`, `tile`, `depth`, `glyph`, or `band`.
- Make raster images optional inputs, never output dependencies.

## Shared Architecture To Build First

### `src/core/field-sampler.js`

Purpose: a shared field source layer for scalar, vector, image, SDF, and polar sampling.

Required API:

```js
window.Vectura.FieldSampler = {
  createScalar({ noise, seed, bounds, noises, sources, edgeMode }),
  createVector({ noise, seed, bounds, noises, mode, edgeMode }),
  createImageScalar({ imageData, effects, edgeMode, channel }),
  createSdf({ sources, bounds, edgeMode }),
  polar({ center, angle, radius, twist, radialScale }),
  normalize(value, { curve, contrast, bias, clamp }),
};
```

Supported source types:

- `noiseRack`
- `image`
- `point`
- `line`
- `ring`
- `box`
- `capsule`
- `ellipse`
- `regularPolygon`
- `hex`
- `sinusoid`
- `tileRepeat`
- `existingLayerSilhouette`

Supported composition modes:

- `add`
- `subtract`
- `multiply`
- `max`
- `min`
- `smoothMax`
- `smoothMin`
- `replace`

RGR tests:

- `tests/unit/field-sampler.test.js`
- Red: fixed Noise Rack config returns deterministic scalar values.
- Red: `edgeMode=wrap` returns matching samples at left/right and top/bottom.
- Red: image sampler with synthetic 2x2 data returns expected bilinear values.
- Green: implement scalar/image/edge contracts.
- Refactor: replace duplicated image/field sampling in future algorithms after parity tests exist.

### `src/core/glyph-emitter.js`

Purpose: emit repeatable plotter glyphs from cells, point clouds, fields, and image samples.

Required API:

```js
window.Vectura.GlyphEmitter = {
  emitGrid({ bounds, rows, cols, lattice, jitter, rowShift, seed }),
  emitGlyph({ type, center, size, angle, aspect, mode, wobble, seed }),
  mapGlyphStyle({ scalar, vector, params, cell }),
  attachMeta(paths, meta),
};
```

Glyphs for launch:

- `dot`
- `dash`
- `capsule`
- `plus`
- `x`
- `y`
- `triFork`
- `shortHatch`
- `square`
- `diamond`
- `scallopArc`
- `customPath`

RGR tests:

- `tests/unit/glyph-emitter.test.js`
- Red: plus emits two centered open paths in centerline mode.
- Red: x emits two centered diagonal paths.
- Red: y emits three branches with 120 deg symmetry before rotation.
- Red: grid jitter is deterministic by seed.
- Green: implement first glyphs and metadata.
- Refactor: use the same emitter in `glyphField` and later Pattern generated motifs.

### `src/core/contour-utils.js`

Purpose: reusable marching squares, segment linking, smoothing, periodic seam validation, and closed-loop preservation.

Required API:

```js
window.Vectura.ContourUtils = {
  extractContours({ field, cols, rows, bounds, thresholds, periodic }),
  linkSegments(segments, tolerance),
  smoothPath(path, iterations, closed),
  validatePeriodicSeams(paths, bounds, tolerance),
};
```

RGR tests:

- Red: a synthetic circle field produces closed loops.
- Red: periodic sinusoid field has matching seam endpoints.
- Red: smoothing preserves closed-loop closure.
- Green: extract from Topo only after tests pin existing behavior.
- Refactor: migrate Topo, `contourField`, and tile contours onto shared utilities.

### `src/core/visibility-clipper.js`

Purpose: shared clipping and hidden-line operations for hatches, mesh grids, isometric motifs, and tubes.

Required API:

```js
window.Vectura.VisibilityClipper = {
  clipPathToPolygon(path, polygon, tolerance),
  clipPathsToMask(paths, mask, tolerance),
  splitByScalarBand(path, sampler, bands),
  removeHiddenByDepth(paths, depthSampler, tolerance),
};
```

RGR tests:

- Red: rectangular clip never emits outside points.
- Red: split-by-band preserves total path length within tolerance when bands cover all values.
- Red: depth removal reduces path length for overlapping test arcs.
- Green: implement line clipping first; depth removal can ship in a later phase.

### `src/core/sdf-primitives.js`

Purpose: analytic signed distance fields for contour tiles, masks, and labyrinth boundaries.

Primitives:

- circle
- ellipse
- box
- roundedBox
- capsule
- regularPolygon
- hex
- ring
- lineSegment
- sinusoidalStripe

Operations:

- translate
- rotate
- scale
- repeatGrid
- repeatHex
- union
- intersection
- difference
- smoothUnion
- domainWarp

RGR tests:

- Red: circle SDF sign is negative inside and positive outside.
- Red: repeatGrid returns equal values one period apart.
- Red: smoothUnion is continuous around blend boundary.

## Algorithm Spec 1: `glyphField`

### Covers

- `download-3.png`
- `download-4.png`
- `download-5.png`
- `e5ec1cd61288d5c7567e5b48e98256ea.jpg`
- `e913590eb06b75354396dd7c89922d7d.jpg`
- `dec31f180b4ba7b4db41d129b232bd4b.jpg`
- `3519b32f647765a4c7c46cd8e0c69634.jpg`
- `67a8f98ad743c1fdd1124220d14c4559.jpg`
- `8d378aaf4398edc3f6551eea86b7d47c.jpg`

### Intent

Generate fields of plotter marks where each cell's mark, size, angle, pen, and dropout are driven by scalar/vector fields or image data.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `glyphType` | select | `plus` | dot, dash, capsule, plus, x, y, triFork, hatch, square, diamond, scallopArc |
| `lattice` | select | `cartesian` | cartesian, offset, hex, iso |
| `rows` | range | 48 | 4 to 220 |
| `cols` | range | 48 | 4 to 220 |
| `cellAspect` | range | 1 | 0.2 to 5 |
| `cellJitter` | range | 0.08 | 0 to 1 |
| `sourceMode` | select | `field` | field, image, imageGradient, radialWells, existingLayer |
| `densityMode` | select | `threshold` | all, threshold, probability, bands, imageAlpha |
| `densityThreshold` | range | 0.35 | 0 to 1 |
| `sizeMin` | range | 0.25 | 0.01 to 20 mm |
| `sizeMax` | range | 4.8 | 0.01 to 40 mm |
| `sizeCurve` | range | 1.4 | 0.1 to 6 |
| `angleMode` | select | `field` | fixed, field, tangent, radial, imageGradient, random |
| `penMappingMode` | select | `byBand` | single, byBand, bySize, byAngle, bySource, cycle |
| `emptyMaskMode` | select | `none` | none, circle, box, fieldBelow, imageAlpha, layerSilhouette |
| `registrationJitter` | range | 0.05 | 0 to 1 |
| `handWobble` | range | 0.08 | 0 to 1 |

### Generation Pipeline

1. Build cell centers from `GlyphEmitter.emitGrid`.
2. Sample scalar and vector fields through `FieldSampler`.
3. Apply source and empty-mask tests.
4. Evaluate density/dropout. Probabilistic dropout must use deterministic per-cell RNG.
5. Map size, angle, and pen.
6. Emit glyph paths.
7. Apply whole-glyph registration jitter and optional per-path hand wobble.
8. Add `path.meta = { algorithm: 'glyphField', glyphType, cell, scalar, penIndex }`.

### Presets

- `glyph-field-cross-clusters`: plus/x marks on beige-paper spacing, blue/orange/gray pen bands.
- `glyph-field-pastel-capsule-flow`: capsule dashes in magenta/teal/purple block flow.
- `glyph-field-red-density-wells`: red/magenta x marks around two radial wells.
- `glyph-field-dot-dolphin`: image silhouette made from white dots on black.
- `glyph-field-y-wallpaper`: sparse Y-shaped motif repeat with one accent pen.

### RGR Tests

Red:

- Add `tests/unit/glyph-field.test.js`.
- Assert fixed seed and params produce identical `pathSignature`.
- Assert `densityThreshold` monotonicity: active cell count decreases as threshold increases.
- Assert `glyphType=plus` path count equals `activeCells * 2` in centerline mode.
- Assert `penMappingMode=byBand` emits at least two distinct `meta.penIndex` values for a synthetic gradient.
- Add visual baselines:
  - `glyph-field-cross-clusters.svg`
  - `glyph-field-pastel-capsule-flow.svg`

Green:

- Implement field mode, cartesian grid, plus/x/dot/capsule first.
- Add image mode after synthetic image sampler tests pass.

Refactor:

- Move any glyph geometry that lands in the algorithm back into `GlyphEmitter`.
- Share lattice generation with future `tessellationWeave` where it remains generic.

## Algorithm Spec 2: `scanlineWeaver`

### Covers

- `download-6.png`
- `line-warped-heightfield.png`
- `neon-scanline-totem.png`
- `0619d04a51f8cad7d5be5d4d01aef671.jpg`
- `05d504fce7f53765fdb8e00bd59c871c.jpg`
- `4b323f230d154b9ba220982e434e68af.jpg`
- `528fd8c82b8dfa6c3364b6b4125768bc.jpg`
- `8a4c9289b151382e79e37173f6f07da3.jpg`
- `d62af1b27311f5b5641388d1a96f2e2d.jpg`
- `f9ccb5f389510e772c031bf7072d9cc5.jpg`
- `5532bf65750e21ce7d6885ba29fefffe.jpg`
- `c44a63c4e47258c08f2d3291af9eb4eb.jpg`
- `d37e4a8c7a80341ad40a20ff057f1da7.jpg`
- `fd1681c635418911c1e1ba10e431974a.jpg`

### Intent

Encode images, masks, heightfields, waves, and abstract fields as families of line segments. This is the central algorithm for scanline portraits, striped spheres, moire panels, wave fields, and hatch maps.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `sourceMode` | select | `field` | field, image, layerSilhouette, textMask |
| `lineFamily` | select | `horizontal` | horizontal, vertical, diagonal, cross, polar, radial, contourFollow |
| `primaryAngle` | range | 0 | -90 to 90 deg |
| `secondaryAngle` | range | 90 | -90 to 90 deg |
| `spacing` | range | 2 | 0.2 to 20 mm |
| `sampleStep` | range | 1 | 0.2 to 8 mm |
| `amplitude` | range | 8 | -80 to 80 mm |
| `maskThreshold` | range | 0.45 | 0 to 1 |
| `posterizeBands` | range | 3 | 1 to 16 |
| `breakMode` | select | `none` | none, threshold, dash, noise, sourceBands, pixel |
| `breakDensity` | range | 0.35 | 0 to 1 |
| `widthEncoding` | select | `length` | none, length, parallelCount, gap, penBand |
| `edgeMode` | select | `hardClip` | none, hardClip, feather, overshoot, contourOutline |
| `penMappingMode` | select | `byBand` | single, byBand, byFamily, byDepth, bySource |
| `polarCenterX` | range | 50 | 0 to 100 percent |
| `polarCenterY` | range | 50 | 0 to 100 percent |
| `polarTwist` | range | 0 | -3 to 3 turns |

### Generation Pipeline

1. Resolve source field through `FieldSampler`.
2. Build base line families:
   - Cartesian: parallel lines clipped to bounds.
   - Cross: two line families.
   - Polar/radial: rays or rings from center.
   - ContourFollow: trace along field tangent.
3. Sample along each line at `sampleStep`.
4. Compute source value and optional vector direction.
5. Displace points by field value when `amplitude != 0`.
6. Split into visible segments by threshold, bands, or break mode.
7. Encode value through segment length, gap, parallel count, or pen band.
8. Clip segments through `VisibilityClipper`.
9. Emit `meta.family`, `meta.band`, `meta.depth`, and `meta.penIndex`.

### Presets

- `scanline-weaver-yellow-map`: diagonal yellow/black map hatch.
- `scanline-weaver-face-louvers`: vertical scanline portrait with face feature breaks.
- `scanline-weaver-broken-sphere`: white broken horizontal sphere lines on black.
- `scanline-weaver-word-field`: warped horizontal lines revealing block text/form.
- `scanline-weaver-storm-lines`: dense dark wave texture.

### RGR Tests

Red:

- Add `tests/unit/scanline-weaver.test.js`.
- Assert line clipping against a synthetic rectangle: no point outside mask plus tolerance.
- Assert `lineFamily=cross` emits two `meta.family` groups.
- Assert raising `maskThreshold` reduces total visible path length for a synthetic gradient.
- Assert `breakMode=dash` creates more paths than `none` for the same base line count.
- Add visual baselines:
  - `scanline-weaver-yellow-map.svg`
  - `scanline-weaver-broken-sphere.svg`

Green:

- Implement Cartesian line family and analytic field mode first.
- Add image and polar modes after shared sampler tests pass.

Refactor:

- Share hatch-line construction with SVG Distort fill modes if duplicated logic appears.
- Keep Wavetable displacement code separate until parity tests prove it can be safely extracted.

## Algorithm Spec 3: `contourField`

### Covers

- `download-2.png`
- `download-7.png`
- all `contour-*.png`
- `a81e83383e71aeea316b01cc8f7bd898.jpg`
- `bde29af91b455c294351783a85e64da4.jpg`
- `89c74ad1ebef5b53b4b61cc7e755de2c.jpg`
- `bb69fc03d7aa35132ab06efa9ab09d1d.jpg`

### Intent

Generalize Vectura's contour capability into a reusable field-contour generator for seamless tiles, portraits, craters, terrain, packaging backgrounds, and contour ornaments.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `sourceMode` | select | `noise` | noise, image, sdf, terrain, radialCrater, tileMetaballs |
| `levels` | range | 36 | 1 to 180 |
| `resolution` | range | 180 | 40 to 420 |
| `thresholdMode` | select | `linear` | linear, quantile, exponential, bandpass, sdfOffsets |
| `sensitivity` | range | 1 | 0.1 to 6 |
| `periodic` | checkbox | false | boolean |
| `tileRepeatX` | range | 4 | 1 to 16 |
| `tileRepeatY` | range | 4 | 1 to 16 |
| `featureBoost` | range | 0.35 | 0 to 1 |
| `edgeAttraction` | range | 0.25 | 0 to 1 |
| `lineJitter` | range | 0.04 | 0 to 1 |
| `closedOnly` | checkbox | false | boolean |
| `maskMode` | select | `none` | none, imageAlpha, luma, ellipse, layerSilhouette |
| `seamDiagnostics` | checkbox | false | boolean |

### Generation Pipeline

1. Build scalar field from Noise Rack, image, SDF, or analytic source.
2. If image mode, compute luma, gradient magnitude, and optional alpha mask.
3. Compose final field:
   - `F = base + edgeAttraction * gradient + featureBoost * bandpass(gradient)`
4. Select thresholds by `thresholdMode`.
5. Extract contours via `ContourUtils.extractContours`.
6. Link segments, close paths, smooth while preserving closure.
7. Apply periodic seam validation when `periodic=true`.
8. Clip by mask.
9. Emit `meta.level`, `meta.closed`, `meta.sourceMode`.

### Presets

- `contour-field-peanut-tile`: seamless loops like `download-2.png`.
- `contour-field-pencil-portrait`: image contour portrait like `download-7.png`.
- `contour-field-crater-depression`: radial crater.
- `contour-field-canyon-terraces`: ridge/canyon lines.
- `contour-field-packaging-map`: pale packaging topographic background.

### RGR Tests

Red:

- Add `tests/unit/contour-field.test.js`.
- Assert synthetic circle field creates closed loops.
- Assert periodic tile mode has matching left/right and top/bottom seam endpoints.
- Assert `featureBoost` increases contour density around high-gradient synthetic features.
- Assert jitter does not break closed-loop closure.
- Add visual baselines:
  - `contour-field-peanut-tile.svg`
  - `contour-field-pencil-portrait.svg`

Green:

- Extract and test contour utilities before migrating Topo.
- Implement noise and SDF tile modes first; image mode second.

Refactor:

- Once `contourField` passes, migrate Topo's matching internals to `ContourUtils` only if existing Topo baselines remain unchanged.

## Algorithm Spec 4: `parametricTube`

### Covers

- `download.png`
- `radial-branching-rings.png`
- `bea9727ccb527a56d2ef197644710b67.jpg`
- `aa3ebe1328fef4ab23b8bd98ba95c42e.jpg`
- `f16b2cb3f96f289701abeef36a3055dc.jpg`

### Intent

Generate projected 3D tubes, orbital curves, ring fields, and spirograph-like constructions from a parametric spine plus cross-section frames.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `spineType` | select | `torusKnot` | torusKnot, trefoil, lissajous3d, orbitPair, rose, customFormula |
| `turnsP` | range | 2 | 1 to 12 |
| `turnsQ` | range | 3 | 1 to 16 |
| `spineSamples` | range | 480 | 48 to 3000 |
| `ribCount` | range | 220 | 8 to 1600 |
| `tubeRadius` | range | 11 | 0.2 to 90 mm |
| `radiusModulation` | range | 0.12 | 0 to 1 |
| `frameMode` | select | `parallelTransport` | parallelTransport, frenet, cameraFacing |
| `projection` | select | `orthographic` | orthographic, perspective |
| `cameraYaw` | range | 35 | -180 to 180 deg |
| `cameraPitch` | range | 20 | -89 to 89 deg |
| `hiddenMode` | select | `fadeBack` | none, fadeBack, dropBack, clipBack |
| `ribShape` | select | `ellipse` | ellipse, partialArc, spiralRing, crossSection |
| `crossingDensityBoost` | range | 0.25 | 0 to 1 |

### Formula Contract

```txt
P(t, phi) = S(t) + r(t) * (cos(phi) * N(t) + sin(phi) * B(t))
```

Where:

- `S(t)` is a 3D spine.
- `N(t)` and `B(t)` are stable frame vectors.
- `r(t)` is tube radius after modulation.
- `phi` samples the cross-section.

### Generation Pipeline

1. Sample `S(t)`.
2. Compute tangents and stable frames.
3. Generate ribs at uniform or curvature-biased `t` values.
4. Project rib samples to 2D.
5. Track approximate depth per projected point.
6. Apply hidden treatment:
   - `none`: all ribs visible.
   - `fadeBack`: assign back-facing segments to a secondary pen.
   - `dropBack`: skip back-facing spans.
   - `clipBack`: split spans at approximate occlusion transitions.
7. Fit all projected paths to document bounds.

### Presets

- `parametric-tube-coiled-knot`: direct `download.png` family.
- `parametric-tube-orbit-pair`: double-ring orbital light form.
- `parametric-tube-spirograph-poster`: nested orbital poster lines.

### RGR Tests

Red:

- Add `tests/unit/parametric-tube.test.js`.
- Assert `ribCount` equals path count for `hiddenMode=none`.
- Assert every projected point is finite.
- Assert `hiddenMode=dropBack` reduces total path length vs `none`.
- Assert fixed seed and params produce identical signature.
- Add visual baseline `parametric-tube-coiled-knot.svg`.

Green:

- Implement orthographic projection, torus knot, and no-hidden mode first.
- Add hidden depth modes after geometry is stable.

Refactor:

- Keep 3D math local until another algorithm needs it.
- Do not add Three.js; output is generated path geometry, not a rendered 3D scene.

## Algorithm Spec 5: `polarLouver`

### Covers

- `120519670df2615d63efa3a645b9594a.jpg`
- `537d97aac4b57dfd16ff602929292348.jpg`
- `b95ebf19a7d8ec60cc3207ba8f8b3617.jpg`
- `d14ba75edcf2910f726bfdacc6c2c706.jpg`
- `528fd8c82b8dfa6c3364b6b4125768bc.jpg`
- `d90c877b3be211006efdb138ffd94aaa.jpg`

### Intent

Generate polar/radial louver art: sunburst bars, circular slices, radial dash rings, louvered spheres, arch fields, and perforated polar posters.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `mode` | select | `radialBars` | radialBars, polarRings, louverSphere, archGate, vortexOrbit |
| `rayCount` | range | 96 | 3 to 720 |
| `ringCount` | range | 24 | 1 to 360 |
| `innerRadius` | range | 12 | 0 to 200 mm |
| `outerRadius` | range | 90 | 1 to 400 mm |
| `barLengthMode` | select | `field` | constant, field, image, sinusoid, depth |
| `angularWindow` | range | 360 | 1 to 360 deg |
| `twist` | range | 0 | -4 to 4 turns |
| `gapMode` | select | `none` | none, dashed, bands, occlusion, image |
| `louverDepth` | range | 0.4 | 0 to 1 |
| `penMappingMode` | select | `byDepth` | single, byRing, byRay, byDepth, byBand |

### Generation Pipeline

1. Build polar samples by ray/ring.
2. Resolve scalar/depth source from analytic field, image, or Noise Rack.
3. Generate radial bars, ring arcs, or louvered chord segments.
4. Apply angular windows and gap mode.
5. Apply twist by rotating samples as a function of radius.
6. Assign pen by ring/ray/depth.
7. Emit `meta.ring`, `meta.ray`, `meta.depth`, and `meta.family`.

### Presets

- `polar-louver-radial-sunburst`: broken radial bars.
- `polar-louver-sliced-sphere`: vertical louver sphere.
- `polar-louver-arch-gate`: arched gold louver form.
- `polar-louver-red-donut`: orange radial donut.

### RGR Tests

Red:

- Add `tests/unit/polar-louver.test.js`.
- Assert `rayCount` maps to path count in `radialBars` constant mode.
- Assert `twist=0` keeps rays straight from center.
- Assert `angularWindow=180` produces no points outside half-plane window plus tolerance.
- Add visual baseline `polar-louver-sliced-sphere.svg`.

Green:

- Implement radial bars and polar rings.
- Add louverSphere depth projection after path count tests pass.

Refactor:

- If polar sampling overlaps with `scanlineWeaver` polar mode, extract only the coordinate sampler, not the full algorithm.

## Algorithm Spec 6: `lSystem`

### Covers

- `download-1.png`

### Intent

Add an explicit grammar-based plant/branching generator, distinct from existing stochastic Hyphae.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `axiom` | text | `X` | safe grammar chars |
| `rulesPreset` | select | `botanical` | botanical, fern, weed, coral, winterTwig, custom |
| `ruleF` | text | `FF` | safe grammar |
| `ruleX` | text | `F-[[X]+X]+F[+FX]-X` | safe grammar |
| `iterations` | range | 5 | 0 to 8 |
| `angle` | range | 22.5 | 0 to 90 deg |
| `stepLength` | range | 5 | 0.2 to 40 mm |
| `lengthDecay` | range | 0.72 | 0.2 to 1 |
| `angleJitter` | range | 2 | 0 to 30 deg |
| `gravityBend` | range | 0.12 | -1 to 1 |
| `twigDensity` | range | 0.2 | 0 to 1 |
| `rootMode` | select | `bottomCenter` | bottomCenter, center, custom |
| `captionMode` | select | `none` | none, metadata, vectorApprox |

### Grammar

- `F`: draw forward
- `f`: move forward
- `+`: turn clockwise
- `-`: turn counterclockwise
- `[`: push turtle state
- `]`: pop turtle state
- `X`, `Y`, `A`, `B`: rewrite symbols
- `!`: taper branch
- `|`: turn 180 deg

Safety:

- Cap expanded command length at 200000 by default.
- Stop at the previous completed iteration if the cap would be exceeded.
- Ignore unsupported symbols with a warning in development mode.

### RGR Tests

Red:

- Add `tests/unit/l-system.test.js`.
- Assert two-iteration expansion for a small known grammar.
- Assert push/pop restores turtle state.
- Assert max command cap prevents runaway generation.
- Assert increasing productive iterations increases segment count.
- Add visual baseline `l-system-botanical-branch.svg`.

Green:

- Implement grammar expansion, turtle draw, deterministic jitter, and fit-to-bounds.

Refactor:

- Keep Hyphae unchanged except for help text clarifying stochastic vs grammar-based branching.

## Algorithm Spec 7: `tessellationWeave`

### Covers

- `download-8.png`
- `download-9.png`
- `download-10.png`
- `download-11.png`
- `1e86d8601df7627af9c079c454411aa0.jpg`
- `5cc8fa080116961b8804035d8a85b99d.jpg`
- `e913590eb06b75354396dd7c89922d7d.jpg`
- `dec31f180b4ba7b4db41d129b232bd4b.jpg`

### Intent

Generate tiled motif systems: hex fan fills, isometric cube/column weaves, scallop wallpaper, Y-motif fields, and hex/cube labyrinth circuits.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `mode` | select | `isometricColumns` | isometricColumns, cubeWeave, hexFan, hexLabyrinth, scallopTile, yMotif |
| `rows` | range | 10 | 1 to 120 |
| `cols` | range | 10 | 1 to 120 |
| `cellSize` | range | 14 | 2 to 80 mm |
| `stagger` | range | 0.5 | 0 to 1 |
| `strokeBands` | range | 5 | 1 to 32 |
| `bandSpacing` | range | 0.8 | 0.1 to 8 mm |
| `holeSize` | range | 0.35 | 0 to 0.85 |
| `fanDensity` | range | 24 | 2 to 160 |
| `labyrinthLevels` | range | 7 | 1 to 40 |
| `overlapMode` | select | `overUnder` | none, clipToCell, overUnder, overprint |
| `penMappingMode` | select | `byFace` | single, byFace, bySector, byRing, byDepth, cycle |
| `tileable` | checkbox | true | boolean |

### Generation Pipeline

1. Generate grid cells in cartesian, hex, or isometric basis.
2. Resolve cell motif template:
   - isometric column
   - cube with diamond hole
   - radial hex fan
   - nested hex labyrinth
   - scallop repeat
   - Y motif
3. Expand motif into centerlines or band families.
4. Clip to cell, hole, or labyrinth boundary as needed.
5. Apply over-under draw order.
6. Assign pens by face/sector/ring/depth.
7. Validate seamless boundaries when `tileable=true`.
8. Emit `meta.tile`, `meta.face`, `meta.sector`, `meta.band`, and `meta.penIndex`.

### Presets

- `tessellation-weave-blue-columns`
- `tessellation-weave-purple-cubes`
- `tessellation-weave-hex-fan`
- `tessellation-weave-yellow-labyrinth`
- `tessellation-weave-scallop-wallpaper`
- `tessellation-weave-y-motif`

### RGR Tests

Red:

- Add `tests/unit/tessellation-weave.test.js`.
- Assert isometric basis points match expected diamond coordinates.
- Assert `strokeBands` increases path count monotonically.
- Assert hole clipping removes all points from a synthetic center hole.
- Assert hex fan `clipToCell` emits no points outside its hex.
- Assert `tileable=true` passes seam validation for scallop/Y motifs.
- Add visual baselines:
  - `tessellation-weave-blue-columns.svg`
  - `tessellation-weave-purple-cubes.svg`
  - `tessellation-weave-hex-fan.svg`
  - `tessellation-weave-yellow-labyrinth.svg`

Green:

- Implement isometric columns and cube weave first.
- Implement hex fan next.
- Implement labyrinth after clipping helpers are stable.

Refactor:

- Integrate generated motifs with Pattern only after seam tests pass.
- Reuse Pattern Designer validation for custom generated tiles.

## Algorithm Spec 8: `perspectiveMesh`

### Covers

- `285a0d5a894b9bc72123a442a7e40a33.jpg`
- `77a8ba3f1e11577c4395b3bfd12897d1.jpg`
- `bbcb8d43ee73d31e0ae70d59685499fe.jpg`
- `f3777fb6da1afa01a1558197ede40e09.gif`

### Intent

Generate wire meshes where projection and topology are the main artwork: terrain sheets, polar tunnels, curved city grids, and glowing road-like perspective paths.

### Core Parameters

| Param | Type | Default | Range/options |
| --- | --- | --- | --- |
| `meshMode` | select | `terrainSheet` | terrainSheet, polarTunnel, globeGrid, cityDome, roadGrid |
| `projection` | select | `perspective` | orthographic, perspective, fisheye, spherical |
| `rows` | range | 32 | 2 to 240 |
| `cols` | range | 48 | 2 to 240 |
| `depth` | range | 90 | 1 to 500 mm |
| `heightAmplitude` | range | 35 | -120 to 120 mm |
| `vanishingPointX` | range | 50 | 0 to 100 percent |
| `vanishingPointY` | range | 45 | 0 to 100 percent |
| `curvature` | range | 0.35 | -1 to 1 |
| `primaryRoads` | range | 2 | 0 to 12 |
| `roadGlowLines` | range | 8 | 0 to 40 |
| `hiddenLineMode` | select | `none` | none, depthSort, horizonClip, occlusion |
| `penMappingMode` | select | `byDepth` | single, byAxis, byDepth, roadsSeparate |

### Generation Pipeline

1. Build a logical grid in terrain, polar, spherical, or city coordinates.
2. Sample height/depth field from Noise Rack or analytic source.
3. Project 3D points into 2D.
4. Generate row, column, and special road paths.
5. Apply hidden line or horizon clipping.
6. Optionally add bright road bundles as separate path families.
7. Emit `meta.axis`, `meta.depth`, `meta.road`, and `meta.penIndex`.

### Presets

- `perspective-mesh-cyan-terrain`
- `perspective-mesh-poster-surface`
- `perspective-mesh-polar-tunnel`
- `perspective-mesh-city-dome`

### RGR Tests

Red:

- Add `tests/unit/perspective-mesh.test.js`.
- Assert finite projected points for all mesh modes.
- Assert `rows + cols` maps to path count when hidden lines are off.
- Assert increasing perspective depth changes projected row spacing.
- Assert `primaryRoads` emits `meta.road=true` paths.
- Add visual baseline `perspective-mesh-polar-tunnel.svg`.

Green:

- Implement terrainSheet and polarTunnel first.
- Implement cityDome/roadGrid after path family metadata is stable.

Refactor:

- Reuse Terrain projection math where possible, but keep mesh topology independent from realistic Terrain generation.

## Existing Algorithm Refinements

### Topo

Add:

- shared `ContourUtils`
- optional image mode
- periodic mode
- threshold distribution modes

RGR:

- Existing Topo visual baselines must not drift under default params.
- New periodic test validates seam endpoints.

### Wavetable

Add:

- source-mask clipping
- band/pen mapping
- line break modes
- presets matching moire and word/field references

RGR:

- Existing Wavetable isometric baselines must not drift.
- New masked-line test uses a synthetic rectangle.

### Flowfield

Add:

- streamline band presets for `flowing-ribbon-streamlines.png` and `vortex-flowlines.png`
- optional value-to-pen mapping
- path breaking by field strength

RGR:

- Existing Flowfield canonical baseline must not drift.
- New preset baseline covers vortex flow lines.

### Pattern

Add:

- generated tile registration for `contourField` and `tessellationWeave`
- generated tile 3x3 seam validation
- save generated tile into project-local custom pattern registry

RGR:

- Generated tile survives `.vectura` round trip.
- Intentionally broken generated tile fails seam validation.

### Terrain/Horizon

Add:

- mesh-art presets that route users to `perspectiveMesh`
- optional shared projection helpers where safe

RGR:

- Existing Terrain and Horizon baselines remain unchanged.

## Cross-Reference Coverage Matrix

| Visual family | Files covered | Primary implementation |
| --- | --- | --- |
| Branch grammar | `download-1.png` | `lSystem` |
| Tube/knot/orbits | `download.png`, `radial-branching-rings.png`, `bea9727...`, `aa3ebe...`, `f16b2...` | `parametricTube` |
| Radial/louver/sphere | `120519...`, `537d...`, `528f...`, `b95e...`, `d14b...`, `d90c...` | `polarLouver`, `scanlineWeaver` |
| Cross/dot/glyph fields | `download-3.png`, `download-4.png`, `download-5.png`, `e5ec...`, `e913...`, `dec31...` | `glyphField` |
| Image-encoded portraits/objects | `0619...`, `8a4c...`, `8d37...`, `f9cc...`, `3519...`, `67a8...` | `scanlineWeaver`, `glyphField`, `contourField` |
| Contours/topography | `download-2.png`, `download-7.png`, `contour-*.png`, `a81e...`, `bde2...`, `89c7...` | `contourField`, Topo |
| Moire/waves/water | `5532...`, `c0fb...`, `c44a...`, `cd68...`, `d303...`, `d37...`, `fd168...` | `scanlineWeaver`, Wavetable |
| Isometric/hex/tiles | `download-8.png`, `download-9.png`, `download-10.png`, `download-11.png`, `1e86...`, `5cc8...` | `tessellationWeave`, Pattern |
| Perspective mesh | `285a...`, `77a8...`, `bbcb...`, `f377...gif` | `perspectiveMesh`, Terrain/Horizon refinements |

## Implementation Order

### Phase 0: Shared Infrastructure

- Add and test `field-sampler.js`.
- Add and test `glyph-emitter.js`.
- Add and test `contour-utils.js`.
- Add and test `visibility-clipper.js`.
- Add and test `sdf-primitives.js`.
- Register scripts in `index.html` before algorithms that consume them.

Done when:

- Helper tests pass.
- No existing visual baselines drift.
- Helpers do not import UI modules.

### Phase 1: Field Encoders

- Implement `glyphField`.
- Implement `scanlineWeaver`.
- Add first visual baselines and presets.

Done when:

- `download-3.png`, `download-4.png`, `download-5.png`, `download-6.png`, `0619...jpg`, and `05d...jpg` families are credibly covered.
- Export contains non-empty path groups and pen metadata.

### Phase 2: Contour System

- Implement `contourField`.
- Migrate safe contour utilities from Topo.
- Add image mode and periodic tile mode.

Done when:

- `download-2.png`, `download-7.png`, and named `contour-*.png` families are credibly covered.
- Seam tests and image-contour tests pass.

### Phase 3: Parametric And Polar Systems

- Implement `parametricTube`.
- Implement `polarLouver`.
- Add orbital/radial visual baselines.

Done when:

- `download.png`, `radial-branching-rings.png`, and radial JPG families are covered.

### Phase 4: Grammar And Tiling

- Implement `lSystem`.
- Implement `tessellationWeave`.
- Add Pattern integration for generated tiles.

Done when:

- `download-1.png`, `download-8.png`, `download-9.png`, `download-10.png`, and `download-11.png` families are covered.

### Phase 5: Mesh And Existing Algorithm Refinements

- Implement `perspectiveMesh`.
- Add Wavetable, Flowfield, Topo, Pattern, Terrain/Horizon refinements.

Done when:

- Mesh/wormhole/city-grid GIF families are covered.
- Existing algorithm defaults remain stable.

### Phase 6: Product Polish

- Add an "Inspiration Studies" preset section or preset tag.
- Add example `.vectura` files for at least eight representative presets.
- Add README gallery entries only after visual baselines are stable.
- Update CHANGELOG and plans as implementation lands.
- Update in-app help if workflow or controls change.

## Global RGR Test Program

### Unit Test Files

- `tests/unit/field-sampler.test.js`
- `tests/unit/glyph-emitter.test.js`
- `tests/unit/contour-utils.test.js`
- `tests/unit/visibility-clipper.test.js`
- `tests/unit/sdf-primitives.test.js`
- `tests/unit/glyph-field.test.js`
- `tests/unit/scanline-weaver.test.js`
- `tests/unit/contour-field.test.js`
- `tests/unit/parametric-tube.test.js`
- `tests/unit/polar-louver.test.js`
- `tests/unit/l-system.test.js`
- `tests/unit/tessellation-weave.test.js`
- `tests/unit/perspective-mesh.test.js`

Every algorithm unit test must assert:

- deterministic `pathSignature`
- finite coordinates
- monotonic response for one density/complexity control
- clipping/bounds contract where applicable
- metadata contract for pen/family/depth/tile where applicable

### Visual Baselines

Add scenarios to `tests/visual/svg-baseline.test.js`:

- `glyph-field-cross-clusters`
- `glyph-field-pastel-capsule-flow`
- `scanline-weaver-yellow-map`
- `scanline-weaver-broken-sphere`
- `contour-field-peanut-tile`
- `contour-field-pencil-portrait`
- `parametric-tube-coiled-knot`
- `polar-louver-sliced-sphere`
- `l-system-botanical-branch`
- `tessellation-weave-blue-columns`
- `tessellation-weave-purple-cubes`
- `tessellation-weave-hex-fan`
- `tessellation-weave-yellow-labyrinth`
- `perspective-mesh-polar-tunnel`

Visual policy:

- Baselines should be medium density, not stress density.
- High-density performance fixtures belong in perf tests.
- Regenerate baselines only after manual SVG inspection.

### Integration Tests

Create `tests/integration/inspiration-algorithms.test.js` with coverage for:

- algorithm appears in selector
- default controls render
- applying each new preset changes layer params
- changing a major control regenerates geometry
- pen metadata survives generation and export grouping
- generated Pattern tile survives `.vectura` round trip

### E2E Smoke

Add one smoke path only:

1. open app
2. add `glyphField`
3. apply `glyph-field-cross-clusters`
4. generate
5. export SVG
6. assert exported SVG has multiple path groups

Keep the rest in unit/integration/visual tests to avoid slow local E2E.

### Performance Tests

Add stress fixtures:

- `glyphField` 180 x 180 plus marks
- `scanlineWeaver` 0.5 mm spacing over A4
- `contourField` 360 resolution and 120 levels
- `parametricTube` 1200 ribs
- `tessellationWeave` 80 x 80 cells
- `perspectiveMesh` 200 x 200 grid

Each perf test should assert:

- generation finishes under a defined budget
- output path count respects a cap or warning policy
- no runaway grammar expansion, clipping explosion, or memory spike pattern

## Documentation Requirements During Implementation

For each shipped algorithm or meaningful refinement:

- Update `README.md` algorithm list and feature text.
- Update `CHANGELOG.md` under `Unreleased`.
- Move the active item through `plans.md`.
- Update in-app help only if workflow, UI behavior, or shortcuts change.
- Update `docs/agentic-harness-strategy.md` only if workflow, tooling, test policy, docs governance, or agent instructions change.

This spec-only file does not itself require README or CHANGELOG edits until implementation begins.

## Final Review Checklist

- [x] The plan references the actual files now present in `src/inspiration/`.
- [x] Every visible inspiration family maps to a generator or existing-algorithm refinement.
- [x] Shared infrastructure is defined before algorithm work.
- [x] Each new algorithm has intent, controls, pipeline, presets, and RGR tests.
- [x] The plan preserves Noise Rack discipline.
- [x] Output remains vector-first and plotter-ready.
- [x] Test surfaces cover unit, visual, integration, E2E smoke, and performance.
- [x] The plan is executable by an agent without needing to open the inspiration images.
