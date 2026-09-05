# Unit F notes — imported OBJ/STL meshes vs the red-line rule

**Two scope corrections to plan-F's brief, found while writing the test.** (1) An
imported mesh never reaches the ribbon/variable-width law engine — `curvedChartParams`
returns `null` for any `primitive` not in `TOPOFORM_MODES`, and an imported mesh's
primitive is always `'solid'`; there is no `taperedEnds`/`weightSmoothstep`/`ladder`
concept for this object class. (2) It also never reaches F7's `segCtx.selfOcclude`/
`SELF_OCCLUDE_BIAS` "6mm bias" machinery plan-F's language describes — `scene3d.js`'s
own `faceted` flag is `true` for `primitive === 'solid'`, routing it through the
PER-FACE hatch path instead (`segCtx = { ownerKeys: [face.key], objectId }`, no
`selfObject`/`selfOcclude`). `git diff 57e86f48 HEAD -- src/core/algorithms/scene3d.js`
confirms F7 never touched this segCtx. So there is no 6mm bias on this path at all —
it's genuine unbiased face-vs-face flat HLR, `hlr.js`'s original purpose.

**Measurement** (fixture: torus tessellation, 24x12, authored as OBJ text, imported via
`engine.importMeshAsScene` — the real .obj upload path — at the default 3/4 view;
independent oracle rasterizes the mesh's own world-space triangles, never calling
`hlr.js`/`surface-fill.js`/`scene.js`):

| mapper | candidate far positions | survivors | verdict |
|---|---|---|---|
| hatch (line fill) | 4 | 0 | PASSES |
| contour (region fill) | 12 | 0 | PASSES |
| spiral (region fill) | 29 | 1 (gap=9.28mm) | GAP — real, reproducible |

`VECTURA_SIMULATE_BLANKET_SKIP=1` (F7 never gates this path, so it can't serve as the
non-vacuity proof — see above) neuters same-object occlusion entirely and confirms the
fixture's overlap is real: spiral 0→25 survivors, contour 0→3. `hatch` stays at 0 even
there (its 4 raw candidates don't string-match final `scenePaths` once unclipped — a
capture-methodology artifact, not evidence its clean result is wrong).

**Root cause of the spiral gap: NOT the occlusion mechanism.** The single survivor
coincides with a `[FillBoolean] polygon union failed on degenerate geometry` console
error from `Mappers.regionFill`'s `insetPasses` (spiral/contour both call this; only
spiral produced a survivor on this fixture). A fix would touch `mappers.js`/
`fill-boolean.js`/`geometry-utils.js` — none of which are "the bias/isConvexObject
gate" this unit is pre-approved to touch (plan-F explicitly lists `regions.js` as
NOT-to-touch and gates any fix to that gate) — so it is recorded, not fixed. Test
`tests/unit/scene3d-mesh-self-occlusion.test.js` is intentionally RED on `spiral`.

**A 48x24 mesh (matching the built-in torus's own tessellation density) was tried
first and abandoned** — `frontRegionBoundary`'s even-odd edge accounting and
`Mappers.regionFill`'s polygon insets became impractically slow on that many small,
silhouette-grazing faces for a unit test. Whether a denser imported mesh's self-
occlusion holds at the same rate is a distinct, unmeasured question (likely a
performance question for the per-face fill path generally, not specific to F7/
self-occlusion) — flagged here, not chased.

Evidence: `docs/3d-audit/handoff/unit-f/` (app screenshot). Full mechanism trail in the
test file's own header comment.
