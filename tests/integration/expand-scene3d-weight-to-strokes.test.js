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

  /*
   * Defect 4 (this batch) — the multi-pass offset used ONE global chord
   * normal (a rigid translation of the whole path), not a per-vertex
   * perpendicular. On a curved path the passes converge and diverge instead
   * of holding a constant band width. RGR: this test measures the band
   * width (projected onto the LOCAL segment normal, not the global chord
   * normal used by the old rigid translate) at several points along a
   * curved arc and fails without a per-vertex offset, passes with it.
   */
  describe('curved paths hold a constant band width (per-vertex offset, not a rigid translate)', () => {
    // A quarter-circle arc (7 points, 90 deg over 6 segments): the local
    // tangent rotates ~90 deg end to end, while the chord (start->end) sits
    // at a fixed ~45 deg — exactly the scenario where a single global chord
    // normal drifts far from the true local perpendicular.
    const arcPath = (childId) => {
      const R = 20;
      const n = 6;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = (Math.PI / 2) * (i / n);
        pts.push({ x: R * Math.sin(a), y: R * (1 - Math.cos(a)) });
      }
      pts.meta = { kind: 'sceneEdge', sceneTarget: { objectId: childId }, weightScale: 3.4 };
      return pts;
    };

    // Local unit normal at vertex i via central difference — an
    // implementation-INDEPENDENT reference for "which way is perpendicular
    // to the curve here", distinct from the fixed global chord normal the
    // old rigid-translate code used.
    const localNormalAt = (path, i) => {
      const prev = path[i - 1] || path[i];
      const next = path[i + 1] || path[i];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const mag = Math.hypot(dx, dy) || 1;
      return { x: -dy / mag, y: dx / mag };
    };

    test('band width (pass 0 to last pass, projected onto the LOCAL normal) stays within tolerance at several points along the arc', () => {
      const { engine, group, child } = buildSceneWithSyntheticChild();
      const penWidth = 0.3;
      const spacing = penWidth * (1 - 0.15);
      const path = arcPath(child.id);
      group.scenePaths = [path];

      const children = expand(engine, child, { returnChildren: true, suppressRender: true });
      const passes = children.length;
      expect(passes).toBeGreaterThanOrEqual(4); // sanity: genuinely multi-pass

      const first = children[0].sourcePaths[0];
      const last = children[children.length - 1].sourcePaths[0];
      const expectedWidth = (passes - 1) * spacing;

      // Sample interior vertices spread across the arc (skip the very
      // endpoints, where a butt-cap/single-edge normal is expected on both
      // implementations and isn't the interesting case).
      const sampleIdx = [1, 2, 3, 4, 5];
      const widths = sampleIdx.map((i) => {
        const n = localNormalAt(path, i);
        const dx = last[i].x - first[i].x;
        const dy = last[i].y - first[i].y;
        return Math.abs(dx * n.x + dy * n.y);
      });

      widths.forEach((w) => {
        expect(w).toBeGreaterThan(0);
        expect(w).toBeCloseTo(expectedWidth, 1); // within ~0.05mm of nominal at every sampled point
      });

      // The band must not merely be non-zero everywhere — it must be
      // CONSTANT: the spread between the widest and narrowest sample stays
      // small relative to the nominal width (a rigid-translate offset drifts
      // by tens of percent across a 90 deg arc; a true per-vertex offset
      // stays essentially flat).
      const spread = Math.max(...widths) - Math.min(...widths);
      expect(spread / expectedWidth).toBeLessThan(0.1);
    });
  });
});
