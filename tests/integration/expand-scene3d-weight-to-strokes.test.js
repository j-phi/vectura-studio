const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Defect 3 — "the thicker lines ... are not rendered as overlapping strokes
 * to make the thicker lines, they're instead just rendered as if the pen
 * will magically grow wider."
 *
 * scene3d carries variable line weight (silhouette/crease emphasis, EdgeStyle
 * weightMm) as `meta.weightScale`, consumed as canvas lineWidth (renderer.js)
 * and SVG stroke-width (ui-file-io.js / export-svg.js). A plotter pen has a
 * FIXED physical width — it cannot draw a wider stroke on command. Expand
 * must therefore turn a weightScale>1 path into N real overlapping parallel
 * passes, and none of the expanded output may still carry meta.weightScale
 * (nothing downstream may fall back to a width attribute for weight).
 *
 * Pass spacing reuses the codebase's established banded-fill convention
 * (text.js's built-in-bold concentric fill: spacing = penWidth * (1 -
 * inkOverlap), inkOverlap 15%) rather than an arbitrary constant, so it is
 * tied to the layer's actual resolved pen width.
 *
 * RGR: before this multi-pass step existed, expandLayer emitted ONE child
 * per source path with meta.weightScale still attached (a single stroke
 * claiming a wider width). This test fails without the multi-pass step and
 * passes with it.
 *
 * Harness: the same LEAN runtime as expand-scene3d-child-fidelity.test.js
 * (no App/Renderer/ui.js boot) — see that file's header for why.
 */

describe('expandLayer turns meta.weightScale into real overlapping strokes', () => {
  let runtime, V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    V.UI.LayersPanel.bind({ SETTINGS: V.SETTINGS, Layer: V.Layer, clone: V.Utils.clone });
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const fakeUi = (engine) => ({ app: { engine }, layerLockedIds: new Set() });
  const expand = (engine, layer, options) =>
    V.UI.LayersPanel.expandLayer.call(fakeUi(engine), layer, { skipHistory: true, ...options });

  // A minimal scene-tree object3d child whose owning group's composed
  // scenePaths we stamp directly — isolates the pass-expansion MATH from the
  // rest of the HLR/lighting pipeline (that pipeline's own fidelity is
  // covered by expand-scene3d-child-fidelity.test.js).
  function buildSceneWithSyntheticChild() {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const group = engine.getLayerById(gid);
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    child.penId = 'pen-1'; // width 0.3mm — deterministic math below
    return { engine, group, child };
  }

  const strokePath = (weightScale, childId) => {
    const p = [{ x: 0, y: 0 }, { x: 10, y: 0 }]; // straight horizontal run
    p.meta = { kind: 'sceneEdge', sceneTarget: { objectId: childId }, weightScale };
    return p;
  };

  test('a weightScale>1 path becomes multiple offset passes, spaced by penWidth * (1 - 0.15), none carrying weightScale', () => {
    const { engine, group, child } = buildSceneWithSyntheticChild();
    const penWidth = 0.3; // pen-1
    const inkOverlap = 0.15;
    const spacing = penWidth * (1 - inkOverlap); // 0.255
    const weightScale = 3.4;
    const desiredWidth = penWidth * weightScale; // 1.02
    const expectedPasses = Math.max(1, 1 + Math.ceil((desiredWidth - penWidth) / spacing));
    expect(expectedPasses).toBeGreaterThan(1); // sanity: the scenario is genuinely "thick"

    group.scenePaths = [strokePath(weightScale, child.id)];

    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBe(expectedPasses);

    // No expanded path relies on a width attribute for weight.
    children.forEach((c) => {
      const path = c.sourcePaths[0];
      expect(path.meta && ('weightScale' in path.meta)).toBeFalsy();
    });

    // Passes are REAL parallel offset strokes (perpendicular to the source
    // run — a horizontal line offsets in Y), evenly spaced by `spacing`, not
    // stacked on top of each other or scattered arbitrarily.
    const ys = children.map((c) => c.sourcePaths[0][0].y).sort((a, b) => a - b);
    expect(new Set(ys.map((y) => y.toFixed(6))).size).toBe(expectedPasses); // all distinct
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeCloseTo(spacing, 6);
    }
    // Every pass keeps the source X extent (still the same run, just offset).
    children.forEach((c) => {
      const path = c.sourcePaths[0];
      expect(path[0].x).toBeCloseTo(0, 6);
      expect(path[1].x).toBeCloseTo(10, 6);
    });
  });

  test('more weight -> more (or equal) passes — the pass count genuinely scales with weightScale', () => {
    const { engine, group, child } = buildSceneWithSyntheticChild();
    group.scenePaths = [strokePath(1.8, child.id)];
    const lightChildren = expand(engine, child, { returnChildren: true, suppressRender: true });

    const { engine: engine2, group: group2, child: child2 } = buildSceneWithSyntheticChild();
    group2.scenePaths = [strokePath(5.5, child2.id)];
    const heavyChildren = expand(engine2, child2, { returnChildren: true, suppressRender: true });

    expect(heavyChildren.length).toBeGreaterThan(lightChildren.length);
  });

  test('a weightScale of exactly 1 (or absent) is left as a single pass — nothing to overlap', () => {
    const { engine, group, child } = buildSceneWithSyntheticChild();
    const plain = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    plain.meta = { kind: 'sceneEdge', sceneTarget: { objectId: child.id } }; // no weightScale at all
    group.scenePaths = [plain];

    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    expect(children.length).toBe(1);
    expect(children[0].sourcePaths[0].meta && ('weightScale' in children[0].sourcePaths[0].meta)).toBeFalsy();
  });

  test('the multi-pass step also fires through the REAL rendering pipeline (EdgeStyle weightMm on a live sphere)', () => {
    const { engine, group, child } = buildSceneWithSyntheticChild();
    // A heavy silhouette weight relative to the 0.3mm pen (EDGE_REF_WIDTH
    // falls back to bounds.penWidth) — clamped to 6x by scene3d itself.
    group.params.edgeStyles = { silhouette: { weightMm: 1.5 } };
    engine.computeAllDisplayGeometry();

    const rawSlice = group.scenePaths.filter(
      (p) => p && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === child.id
    );
    const weightedCount = rawSlice.filter((p) => Number(p.meta.weightScale) > 1).length;
    expect(weightedCount).toBeGreaterThan(0); // sanity: the sphere really has heavy silhouette edges

    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    // Every weighted source path turned into >=2 passes, so the expanded
    // count must exceed the raw pre-expand slice count.
    expect(children.length).toBeGreaterThan(rawSlice.length);
    // No expanded path is a plain flowfield/disconnected fallback: still
    // carries real scene provenance, and never a weightScale attribute.
    children.forEach((c) => {
      const path = c.sourcePaths[0];
      expect(path.meta && path.meta.sceneTarget && path.meta.sceneTarget.objectId).toBe(child.id);
      expect(path.meta && ('weightScale' in path.meta)).toBeFalsy();
    });
  });
});
