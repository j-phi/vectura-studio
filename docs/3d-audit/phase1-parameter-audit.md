# Phase 1 — 3D Algorithm Parameter Usability Audit

**Date:** 2026-06-13
**Scope:** Every parameter of the four 3D algorithms — `spiral3d`, `polyhedron`, `meshTopography`, `imageSurface`.
**Method:** A deterministic in-browser sweep harness (run via Chrome DevTools against `http://localhost:8000`) drove `window.app.engine`. For each control it:

1. Read the live schema from `window.Vectura.UI.CONTROL_DEFS[algo]` (id, type, min/max/step, options, `showIf`).
2. Auto-satisfied each control's `showIf` precondition by flipping sibling toggles/selects until the control became active (so gated controls are tested in a context where they *should* work).
3. Swept the control across its range (5 samples for ranges, all options for selects, both states for checkboxes) with a **fixed seed (42)** for determinism.
4. Computed a signature per value = `pathCount | totalPoints | totalLength | bbox | hiddenCount | metaValueHash`. The hash digests **all path metadata values** (stroke weight scale, dash arrays, dot flags, etc.), so the harness distinguishes *"changes styling only"* from *"changes nothing at all."*

A parameter is a **NO-OP** when every value across its full range produces an identical signature while the control is active. Ambiguous NO-OPs were re-tested under explicitly activating conditions (right solid type, right mode, height source) before being confirmed.

Because the signature is deterministic, **identical signature ⇒ pixel-identical render**. This was visually confirmed in Chrome for the headline `imageSurface / noiseAmount` finding (`.audit3d/imgsurface_noise0.png` vs `imgsurface_noise1.png` — indistinguishable).

---

## Summary

| Algorithm | Params tested | OK | Defects |
|---|---|---|---|
| spiral3d | 45 | 36 | 9 (crease + hidden-line bias + Lambert hatching block unwired) |
| polyhedron | 40 | 37 | 3 (1 broken control, 2 ungated dead-for-default-solid) |
| meshTopography | 33 | 32 | 1 (dead/redundant `artworkSize`) |
| imageSurface | 44 | 28 | 16 (surface-noise subsystem + whole shading block + see-through unwired) |

The dominant theme: the shared **"Shading & Lines"** enhancement block (depth cue, outline emphasis, crease extraction, hidden-line removal, Lambert hatching) is shown on **all four** algorithms but is only **fully functional on the two face-based ones** (`polyhedron`, `meshTopography`). On the line-based algorithms (`spiral3d`, `imageSurface`) the face-derived enhancements (crease, hatch, depth-bias) have no surface to operate on and silently do nothing.

---

## Confirmed defects (control does nothing in any tested context)

### D1 — `polyhedron / vertexOcclusionMode` — BROKEN
`outline` vs `occlude` produces an identical render in **both** `surfaceMode: front` and `faceOpacityMode: opaque`. The vertex-occlusion toggle is not wired.
Evidence: `front` → `193|1348|9047` for both options; `opaque` → `172|949|8799` for both.

### D2 — `meshTopography / artworkSize` — DEAD / REDUNDANT
`artworkSize` (30→260 mm) has **no effect** in either `contours` or `wireframe` render mode. The actual mesh size is driven entirely by `primitiveScaleX/Y/Z`. `artworkSize` is a leftover/duplicate control.
Evidence: all four samples → `93|1600|4150` (contours), `1083|2166|9957` (wireframe).

### D3 — `imageSurface / noiseAmount` + `noiseMode` — SURFACE NOISE UNWIRED
The "Surface Noise" subsystem does nothing. `noiseAmount` 0→1 produces identical output with `noiseMode` = `add` **and** `replace`, even at `amplitude: 80`. `noiseMode` is consequently also a no-op.
Evidence: all samples → `42|3570|6501`. Visually confirmed (screenshots).

### D4 — `imageSurface / smoothing` (Map Blur) — NO EFFECT
`smoothing` 0→100 has no effect even at `sampleDetail: 200`. (May be intended only for imported raster sources; the built-in analytic relief is already smooth — but the control gives no feedback regardless of source, which is itself the defect.)
Evidence: all samples → `42|8442|6505`.

### D5 — `imageSurface / seeThrough` — NO EFFECT
The See-Through checkbox does nothing in `mesh` mode under either `hiddenLineMode: remove` or `backface`.
Evidence: both states → `72|2494|10817`.

### D6 — `spiral3d` shading block partially unwired
NO-OP controls (active, full range, zero change): `showCreases`, `creaseAngle`, `depthBias`, `hatchEnable`, `lightAzimuth`, `lightElevation`, `hatchAngle`, `hatchSpacing`, `crossHatch`.
Working controls on spiral3d: `depthCue`, `depthCueStrength`, `emphasizeOutline`, `outlineWeight`, `hiddenLineMode`.
Root cause: spiral3d renders line/dot loops with no closed faces, so crease extraction and Lambert hatching have no surface to act on, and `depthBias` (painter occlusion tuning) has nothing to bias.

### D7 — `imageSurface` shading block unwired
NO-OP controls (active, full range, zero change): `emphasizeOutline`, `outlineWeight`, `showCreases`, `creaseAngle`, `hiddenLineMode`, `depthBias`, `hatchEnable`, `lightAzimuth`, `lightElevation`, `hatchAngle`, `hatchSpacing`, `crossHatch`.
Working controls on imageSurface: `depthCue`, `depthCueStrength`.
This is the widest gap: only 2 of the 14 shared-block controls function.

---

## Ungated controls — work, but dead under the default configuration (UX defects)

### D8 — `polyhedron / sideCount` — no `showIf`, dead for the default solid
`sideCount` **works** for `prism`, `flatPolygon`, `antiprism`, `bipyramid` (verified: 3→30 sides changes geometry monotonically). It is **ignored** by the default solid `buckyball` and by `cube`/`tetrahedron`/`octahedron`/`icosahedron`/`importedMesh`. With no `showIf`, a user on the default solid drags `sideCount` and nothing happens.
Evidence: `prism` → 4 distinct sigs `20|162|2327 … 185|1686|9935`; `buckyball` (default) → no change.

### D9 — `polyhedron / depth` — no `showIf`, dead for the default solid
`depth` **works** for `prism` (extrusion length, verified 0→180 changes length `2301→4969`). Ignored by `buckyball` (default) and the platonic solids. Same ungated-dead-control problem as D8.

---

## Controls verified working (highlights)

- **spiral3d:** all 6 shapes (sphere/cone/cylinder/ellipsoid/torus/capsule) + their radii, both wrap types, line/dots render, all dot sizing, turns/twist/lineCount, full view stack (yaw/pitch/roll, projection, camera, focal), `depthCue`, `emphasizeOutline`/`outlineWeight`, `hiddenLineMode`.
- **polyhedron:** all 10 solid types, faces/edges/vertices visibility + styling, all six effects (bulge/extrude/explode/expand/shard/twist), full view stack, **entire shading block works** (crease, hatch, hidden-line all functional).
- **meshTopography:** all 11 primitives, all 3 render modes, plane controls, contour smoothing, **entire shading block works**.
- **imageSurface:** all 4 modes (lines/mesh/topography/bars), map transforms (amplitude/gamma/contrast/invert), rows/columns, bar controls, view stack, `depthCue`.

---

## Cross-cutting observations for the product/UX phases

1. **The shared shading block is inconsistently applicable.** It is identical UI across all four algorithms, but face-derived enhancements (crease, Lambert hatch, depth-bias) are meaningless for line-based outputs. Either wire equivalents, or hide the inapplicable controls per algorithm.
2. **Two solid-type-specific controls lack `showIf` gating** (`sideCount`, `depth`), so they read as broken on the default solid.
3. **`artworkSize` duplicates `primitiveScale`** on meshTopography — a redundancy to resolve.
4. **The Surface Noise subsystem on imageSurface is entirely non-functional** with the default source — the most impactful single defect.
5. **Naming collision:** `focalLength` is labeled "Depth Strength" and `depthCueStrength` is also labeled "Depth Strength" — two different controls share a visible label.
