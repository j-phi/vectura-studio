/*
 * RGR — F7: A NON-CONVEX OBJECT MUST OCCLUDE ITSELF.
 *
 * Reported (Jay, pointing at a torus at its default 3/4 view): tracing the
 * top edge of the FRONT of the loop where it crosses the inner hole gives a
 * curve. "Contour lines from the back of the loop must never break through
 * that line." They did — two short stray fragments on the inner-hole
 * silhouette near 8 and 4 o'clock, contours belonging to the FAR side of the
 * tube drawn across the near sheet.
 *
 * ROOT CAUSE (established before this fix, not re-derived here):
 * `scene3d.js` builds every fill/ribbon/wall-ring clip's segment context as
 * `{ objectId: record.id, selfObject: true }`, and `hlr.js`'s `hiddenAt`
 * skips ANY occluder face belonging to the same object whenever
 * `seg.selfObject` is set — unconditionally, for every primitive. A convex
 * primitive (sphere/capsule/cylinder/cone/box/plane/ellipsoid/pyramid) needs
 * exactly that: its own front surface can never hide another front-facing
 * patch of itself. A torus is not convex — its near tube wall genuinely can,
 * and does, hide its own far tube wall through the donut hole — so the
 * blanket skip was wrong for it specifically.
 *
 * THE FIX (this commit): `scene.js`'s `isConvexObject` computes a genuine
 * per-object convexity flag (`record.convex`) — an allowlist for shapes that
 * are convex BY CONSTRUCTION (zero cost), a torus/torus-knot are always
 * non-convex (a mathematical fact about a genus-1 tube), and everything else
 * (superellipsoid, solid/polyhedra/imported mesh, csg) gets the real
 * vertex-vs-face-plane convexity test. `scene3d.js` threads `!record.convex`
 * into every fill/ribbon/wall-ring segCtx as `selfOcclude`, and `hlr.js`'s
 * `hiddenAt` only re-arms same-object occlusion when that flag is set,
 * subject to a wider self-occlusion depth margin (`SELF_OCCLUDE_BIAS`) so
 * genuine self-occlusion crossings register without same-surface
 * tessellation noise misfiring. `surface-fill.js`'s `ribbonize` additionally
 * pre-splits a ruling's centreline at the visible/self-occluded boundary
 * BEFORE building outline/wall/PenFill geometry for it (carrying real
 * per-point z from the new `zAlongRun`, replacing a constant per-run z stamp
 * that would otherwise defeat a per-sample occlusion test).
 *
 * THE TEST — the user's own invariant, not the implementation's. Derives the
 * torus's near/far sheet overlap independently (see
 * `tests/helpers/scene3d-torus-hole-oracle.js`: a fresh analytic torus
 * surface, projected through the real captured camera/projection/object-
 * transform, NEVER calling into `surface-fill.js`'s chart/sampleAt,
 * `buildRegionRings`, `hlr.js`, or `RibbonGeometry`) and asserts that no
 * emitted `sceneFill` path vertex landing in a genuine near/far overlap cell
 * reads at the FAR depth.
 *
 * RED against `57e86f48` (the commit immediately before this fix),
 * reproducibly:
 *   VECTURA_PRE_F7=1 npx vitest run tests/unit/scene3d-ribbon-f7-self-occlusion.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const {
  captureTorusSetup, buildOverlapField, overlapCellAt,
} = require('../helpers/scene3d-torus-hole-oracle');

const F7_BASELINE_SHA = '57e86f48';
const F7_FILES = [
  'src/core/scene3d/scene.js',
  'src/core/scene3d/hlr.js',
  'src/core/scene3d/surface-fill.js',
  'src/core/algorithms/scene3d.js',
];
const preF7RuntimeOptions = makeMultiFilePreShaRuntimeOptions(F7_BASELINE_SHA, 'VECTURA_PRE_F7', F7_FILES);

const LAWS = ['taperedEnds', 'weightSmoothstep'];

describe('SurfaceFill — F7 self-occlusion at the torus inner-hole (non-convex objects occlude themselves)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preF7RuntimeOptions() });
    V = runtime.window.Vectura;
  }, 120000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(LAWS)('%s — no far-sheet vertex from a near/far overlap cell survives into the final ink', (toneLaw) => {
    const engine = new V.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === groupId);
    const obj = engine.getLayerDescendants(groupId)
      .filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = 'torus';
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
    // Default camera (3/4 view: yaw -30, pitch 20) — untouched, matching the
    // reported view.

    // `group.scenePaths` (the final, composited output) carries only {x, y}
    // — `Geometry3D.pathWithMeta` strips z once a run is emitted, the same
    // way every OTHER scene3d path already does. So this test captures the
    // PRE-CLIP `SurfaceFill.buildObject` output too — the same `lines` array
    // scene3d.js's own post-hoc self-occlusion clip consumes, still carrying
    // real per-point z — to know WHICH (x, y) positions the far sheet's own
    // geometry actually visited, then asserts none of those positions
    // survive into the final ink.
    const SF = V.Scene3D.SurfaceFill;
    const rawLines = [];
    const origBuildObject = SF.buildObject;
    SF.buildObject = function wrapped(opts) {
      const result = origBuildObject.call(this, opts);
      if (Array.isArray(result)) result.forEach((line) => rawLines.push(line));
      return result;
    };
    const capture = captureTorusSetup(V);
    try {
      engine.computeAllDisplayGeometry();
    } finally {
      SF.buildObject = origBuildObject;
      capture.restore();
    }

    const stats = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(stats).toBeTruthy();
    expect(stats.ribbonLaw).toBe(true);
    // Guard the guard: this fixture must actually reach the WALLS/RIBBON
    // branches (an inert ribbon that silently fell back to bare centrelines
    // would pass the assertion below vacuously — harness-clean is not
    // app-clean).
    expect(stats.wide + stats.walls).toBeGreaterThan(0);

    const { sizes, setup } = capture.getCapture();
    expect(sizes).toBeTruthy();
    expect(setup && setup.camera).toBeTruthy();
    const field = buildOverlapField(V, setup, sizes);
    // Guard the guard: the fixture must actually HAVE a near/far overlap at
    // this view (it does, by construction, at the torus's default 3/4 view —
    // this is what makes the inner hole read as a hole at all) — a field
    // with no qualifying overlap cell would pass the assertion below
    // vacuously too.
    let overlapCells = 0;
    field.cells.forEach((cell) => { if (cell.near.z - cell.far.z > 8) overlapCells += 1; });
    expect(overlapCells).toBeGreaterThan(0);
    expect(rawLines.length).toBeGreaterThan(0);

    // Every (x, y) position the FAR sheet's own raw geometry visited, per
    // this oracle's independent depth field — the positions self-occlusion
    // must remove.
    const farPositions = [];
    rawLines.forEach((line) => {
      if (!Array.isArray(line) || line.back === true) return;
      line.forEach((pt) => {
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) return;
        const cell = overlapCellAt(field, pt.x, pt.y);
        if (!cell) return;
        const mid = (cell.near.z + cell.far.z) / 2;
        if (pt.z < mid) farPositions.push({ x: pt.x, y: pt.y, z: pt.z, near: cell.near.z, far: cell.far.z });
      });
    });
    // NOT asserted >0 here: a self-occlusion fix thorough enough to pre-split
    // a ruling's centreline BEFORE `ribbonizeCore` ever builds outline/wall/
    // fill geometry for the hidden stretch (this file's own fix) can leave
    // `SurfaceFill.buildObject`'s raw, pre-clip output with NO far-sheet
    // content at all to find here — the earliest possible place to have
    // removed it, and a stronger result than catching it downstream. The
    // `overlapCells` guard above already proves this fixture has genuine
    // near/far overlap to defeat; that is the non-vacuousness guarantee.

    // Every (x, y) position that survived into the final, composited,
    // self-occlusion-clipped ink.
    const inkPositions = new Set();
    const paths = (group.scenePaths || []).filter(
      (p) => p && p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget
        && p.meta.sceneTarget.objectId !== 'ground' && !p.meta.sceneTarget.xrayBack);
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((path) => {
      path.forEach((pt) => {
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
        inkPositions.add(`${pt.x},${pt.y}`);
      });
    });

    // THE CLAIM. No far-sheet position survives, verbatim, into the ink.
    const survivors = farPositions.filter((p) => inkPositions.has(`${p.x},${p.y}`));
    expect(survivors).toEqual([]);
  }, 120000);
});
