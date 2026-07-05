/**
 * P3 feedback: the anchor verbs to the right of Smooth in the edit-path task
 * bar were permanently disabled (renderDirect ran anchorEligibility ONCE at
 * entry, when no anchor was selected, and never re-ran; it also gated on the
 * full anchor list and passed raw geometry to the predicates instead of refs).
 *
 * Now the bar tracks the renderer's anchor-selection signature and re-renders,
 * gating each verb on the ACTUAL selection:
 *   - single anchor selected → Remove / Cut / Convert-Corner / Convert-Smooth
 *   - two open endpoints selected → Connect
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const nextFrames = (ms = 90) => new Promise((r) => setTimeout(r, ms));

describe('P3: edit-path anchor-verb enabling', () => {
  let runtime, window, app, CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = window.app = new window.Vectura.App();
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const verbs = () => Array.from(host().querySelectorAll('.ctxbar-anchor-verb'));
  // renderDirect order: add, delete, connect, cut, corner, smooth
  const byName = () => {
    const v = verbs();
    return { add: v[0], delete: v[1], connect: v[2], cut: v[3], corner: v[4], smooth: v[5] };
  };

  const closedSquare = (id) => ({
    id, name: id, type: 'shape', isGroup: false, visible: true,
    params: { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 },
    origin: { x: 0, y: 0 },
    sourcePaths: [(() => { const p = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 }]; p.meta = { closed: true, straight: true }; return p; })()],
    paths: [], fills: [],
  });

  const openZig = (id) => ({
    id, name: id, type: 'shape', isGroup: false, visible: true,
    params: { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 },
    origin: { x: 0, y: 0 },
    sourcePaths: [(() => { const p = [{ x: 0, y: 0 }, { x: 20, y: 30 }, { x: 40, y: 0 }]; p.meta = { closed: false, straight: true }; return p; })()],
    paths: [], fills: [],
  });

  const enterDirect = async (layer) => {
    app.engine.layers = [layer];
    app.renderer.setSelection([layer.id], layer.id);
    app.renderer.setTool('direct');
    await nextFrames();
  };
  // Four corner anchors of the square (handle-less).
  const CORNER4 = () => [
    { x: 0, y: 0, in: null, out: null },
    { x: 40, y: 0, in: null, out: null },
    { x: 40, y: 40, in: null, out: null },
    { x: 0, y: 40, in: null, out: null },
  ];
  const smoothAnchor = (a) => ({ ...a, in: { x: a.x - 5, y: a.y }, out: { x: a.x + 5, y: a.y } });
  const setAnchors = async (layer, indices, anchors = CORNER4()) => {
    app.renderer.directSelection = {
      layerId: layer.id, pathIndex: 0,
      anchors, closed: true,
      selectedIndices: new Set(indices),
    };
    app.renderer.directAuxSelections = [];
    await nextFrames();
  };

  test('with no anchors selected, delete/cut/corner/smooth/connect are disabled', async () => {
    const layer = closedSquare('sq');
    await enterDirect(layer);
    app.renderer.directSelection = { layerId: layer.id, pathIndex: 0, anchors: [], closed: true, selectedIndices: new Set() };
    await nextFrames();
    const b = byName();
    expect(b.delete.disabled).toBe(true);
    expect(b.cut.disabled).toBe(true);
    expect(b.corner.disabled).toBe(true);
    expect(b.smooth.disabled).toBe(true);
    expect(b.connect.disabled).toBe(true);
  });

  test('selecting a single corner anchor enables Remove / Cut / Convert-Smooth; Convert-Corner is a no-op (toggle)', async () => {
    const layer = closedSquare('sq');
    await enterDirect(layer);
    await setAnchors(layer, [1]); // all-corner square, index 1 is a corner
    const b = byName();
    expect(b.delete.disabled).toBe(false);
    expect(b.cut.disabled).toBe(false);
    // Toggle: a corner can only convert to smooth.
    expect(b.smooth.disabled).toBe(false);
    expect(b.corner.disabled).toBe(true);
    // Connect still needs two open endpoints.
    expect(b.connect.disabled).toBe(true);
  });

  test('selecting a smooth anchor enables Convert-Corner and disables Convert-Smooth (toggle)', async () => {
    const layer = closedSquare('sq');
    await enterDirect(layer);
    const anchors = CORNER4();
    anchors[1] = smoothAnchor(anchors[1]); // make index 1 a smooth point
    await setAnchors(layer, [1], anchors);
    const b = byName();
    expect(b.corner.disabled).toBe(false);
    expect(b.smooth.disabled).toBe(true);
  });

  test('a mixed selection (corner + smooth) enables BOTH Convert-Corner and Convert-Smooth', async () => {
    const layer = closedSquare('sq');
    await enterDirect(layer);
    const anchors = CORNER4();
    anchors[2] = smoothAnchor(anchors[2]); // index 1 corner, index 2 smooth
    await setAnchors(layer, [1, 2], anchors);
    const b = byName();
    expect(b.corner.disabled).toBe(false);
    expect(b.smooth.disabled).toBe(false);
  });

  test('selecting two open endpoints enables Connect', async () => {
    const layer = openZig('zig');
    await enterDirect(layer);
    // Endpoints of the open path are indices 0 and 2.
    app.renderer.directSelection = { layerId: layer.id, pathIndex: 0, anchors: [], closed: false, selectedIndices: new Set([0, 2]) };
    app.renderer.directAuxSelections = [];
    await nextFrames();
    expect(byName().connect.disabled).toBe(false);
  });

  test('clicking Remove deletes the selected anchor from the path', async () => {
    const layer = closedSquare('sq');
    await enterDirect(layer);
    await setAnchors(layer, [1]);
    app.pushHistory();
    const histBefore = app.history.length;
    const ptsBefore = app.engine.getLayerById('sq').sourcePaths[0].length;
    byName().delete.click();
    await nextFrames();
    const ptsAfter = app.engine.getLayerById('sq').sourcePaths[0].length;
    expect(ptsAfter).toBeLessThan(ptsBefore);
    expect(app.history.length).toBe(histBefore + 1); // op owns its single push
  });
});
