/*
 * Regression: when a Shape layer has curves=true (or simplify/smoothing > 0),
 * applyShapeAnchorRebuild used to read from a frozen path.meta.originalAnchors
 * snapshot. After a direct-selection anchor edit, the renderer wrote new
 * anchors into path.meta.anchors and called engine.generate(), but the rebuild
 * ignored them and rebuilt from the stale snapshot — so the rendered curve
 * stayed at the pre-edit position while the cyan anchor overlay (drawn from
 * the live anchors on directSelection) followed the cursor. Visible as the
 * "I'm dragging the dotted blue line, not the shape" bug.
 *
 * The fix strips the stale baseline (`originalAnchors`/`originalClosed`) from
 * `path.meta` when the renderer commits an anchor edit through
 * _applySelectionPath, so the next applyShapeAnchorRebuild re-baselines from
 * the freshly-edited anchors.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Shape anchor edit with curves ON — engine rebuild follows edited anchors', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('after enabling curves and direct-editing an anchor, layer.paths reflects the edit (not the pre-curve snapshot)', () => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    // Open polyline with a clear middle anchor that the test will drag.
    const path = [
      { x: 10, y: 50 },
      { x: 50, y: 50 },
      { x: 90, y: 50 },
    ];
    path.meta = {
      kind: 'poly',
      closed: false,
      anchors: path.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
    };

    const layer = new Layer('shape-edit-target', 'shape', 'Target');
    layer.sourcePaths = [path];
    layer.params.curves = true;
    layer.params.smoothing = 0;
    layer.params.simplify = 0;
    layer.params.posX = 0;
    layer.params.posY = 0;
    layer.params.scaleX = 1;
    layer.params.scaleY = 1;
    layer.params.rotation = 0;
    engine.layers.push(layer);

    // First generate: snapshots originalAnchors and rebuilds.
    engine.generate(layer.id);

    // Confirm the snapshot was taken — establishes that the rebuild branch ran.
    const sourcePathAfterFirst = layer.sourcePaths[0];
    expect(Array.isArray(sourcePathAfterFirst.meta.originalAnchors)).toBe(true);
    expect(sourcePathAfterFirst.meta.originalAnchors).toHaveLength(3);

    const canvas = runtime.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const sel = renderer.setDirectSelection(layer, 0);
    expect(sel).not.toBeNull();
    expect(sel.anchors).toHaveLength(3);

    // Simulate a direct-drag of the middle anchor: move it 40mm down.
    const DRAG_DY = 40;
    sel.anchors[1].x = 50;
    sel.anchors[1].y = 50 + DRAG_DY;

    renderer.applyDirectPath();

    // After the edit, layer.paths must reflect the new middle-anchor Y.
    // Pre-fix, the rebuild restored the stale originalAnchors snapshot, so
    // the polyline's interior point was clamped back near y=50.
    const renderedPath = layer.paths[0];
    expect(Array.isArray(renderedPath)).toBe(true);
    expect(renderedPath.length).toBeGreaterThanOrEqual(3);

    const maxY = renderedPath.reduce((m, pt) => Math.max(m, pt.y), -Infinity);
    expect(maxY).toBeGreaterThan(50 + DRAG_DY * 0.5);

    // And path.meta.anchors must reflect the edit too — not be silently
    // overwritten back to the snapshot.
    const newAnchors = layer.sourcePaths[0].meta.anchors;
    expect(newAnchors).toHaveLength(3);
    expect(newAnchors[1].y).toBeGreaterThan(50 + DRAG_DY * 0.5);
  });
});
