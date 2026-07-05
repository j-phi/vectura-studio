/**
 * P3 feedback: the edit-path contextual task bar gates its anchor verbs on the
 * current anchor selection. The renderer exposes getSelectedAnchorRefs() and
 * getSelectedAnchorSignature() as the read-only interface for that.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer anchor-selection API', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); });
  afterAll(() => runtime.cleanup());

  const makeRenderer = () => {
    const { Renderer } = runtime.window.Vectura;
    const renderer = new Renderer('main-canvas', { layers: [], currentProfile: { width: 300, height: 300 }, getBounds() { return { width: 300, height: 300, m: 0, dW: 300, dH: 300 }; } });
    return renderer;
  };

  test('returns empty when nothing is directly selected', () => {
    const r = makeRenderer();
    r.directSelection = null;
    r.directAuxSelections = [];
    expect(r.getSelectedAnchorRefs()).toEqual([]);
    expect(r.getSelectedAnchorSignature()).toBe('');
  });

  test('collects refs from the primary selection', () => {
    const r = makeRenderer();
    r.directSelection = { layerId: 'L1', pathIndex: 0, selectedIndices: new Set([2, 5]) };
    r.directAuxSelections = [];
    expect(r.getSelectedAnchorRefs().sort((a, b) => a.anchorIndex - b.anchorIndex)).toEqual([
      { layerId: 'L1', pathIndex: 0, anchorIndex: 2 },
      { layerId: 'L1', pathIndex: 0, anchorIndex: 5 },
    ]);
  });

  test('merges refs across primary + aux selections', () => {
    const r = makeRenderer();
    r.directSelection = { layerId: 'L1', pathIndex: 0, selectedIndices: new Set([1]) };
    r.directAuxSelections = [{ layerId: 'L2', pathIndex: 1, selectedIndices: new Set([3, 4]) }];
    expect(r.getSelectedAnchorRefs().length).toBe(3);
  });

  test('signature changes when the selected index set changes', () => {
    const r = makeRenderer();
    r.directSelection = { layerId: 'L1', pathIndex: 0, anchors: [], selectedIndices: new Set([1]) };
    r.directAuxSelections = [];
    const sig1 = r.getSelectedAnchorSignature();
    r.directSelection.selectedIndices = new Set([1, 2]);
    expect(r.getSelectedAnchorSignature()).not.toBe(sig1);
    // Stable when unchanged (order-independent). Handle-less anchors → 'c'.
    r.directSelection.selectedIndices = new Set([2, 1]);
    expect(r.getSelectedAnchorSignature()).toBe('L1:0:1c.2c');
  });

  test('getSelectedAnchorTypes classifies corner vs smooth anchors', () => {
    const r = makeRenderer();
    const corner = { x: 0, y: 0, in: null, out: null };
    const smooth = { x: 10, y: 0, in: { x: 8, y: 0 }, out: { x: 12, y: 0 } };
    r.directSelection = { layerId: 'L1', pathIndex: 0, anchors: [corner, smooth], selectedIndices: new Set([0]) };
    r.directAuxSelections = [];
    expect(r.getSelectedAnchorTypes()).toMatchObject({ hasCorner: true, hasSmooth: false, count: 1 });
    r.directSelection.selectedIndices = new Set([1]);
    expect(r.getSelectedAnchorTypes()).toMatchObject({ hasCorner: false, hasSmooth: true, count: 1 });
    r.directSelection.selectedIndices = new Set([0, 1]);
    expect(r.getSelectedAnchorTypes()).toMatchObject({ hasCorner: true, hasSmooth: true, count: 2 });
  });

  test('signature encodes anchor TYPE so a corner→smooth conversion re-renders', () => {
    const r = makeRenderer();
    const a = { x: 0, y: 0, in: null, out: null };
    r.directSelection = { layerId: 'L1', pathIndex: 0, anchors: [a], selectedIndices: new Set([0]) };
    r.directAuxSelections = [];
    const before = r.getSelectedAnchorSignature();
    r.directSelection.anchors[0] = { x: 0, y: 0, in: { x: -5, y: 0 }, out: { x: 5, y: 0 } };
    expect(r.getSelectedAnchorSignature()).not.toBe(before);
  });
});
