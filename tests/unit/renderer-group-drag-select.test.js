/**
 * RGR: Drag-select should select the whole group when any member is caught.
 * Without the fix, dragging a rect over one child would select only that child.
 * With the fix, _expandGroupSelection expands to all visible, unlocked siblings.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer — group-aware drag selection', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = (layerList) => {
    const { Renderer } = runtime.window.Vectura;
    const engine = {
      layers: layerList,
      currentProfile: { width: 300, height: 300 },
      getBounds() {
        return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false };
      },
      getLayerChildren(parentId) {
        return layerList.filter((l) => l.parentId === parentId);
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    return renderer;
  };

  const makeGroup = (id) => ({
    id,
    visible: true,
    isGroup: true,
    groupType: 'group',
    parentId: null,
    paths: [],
    params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
  });

  const makeChild = (id, parentId, points, overrides = {}) => ({
    id,
    visible: true,
    isGroup: false,
    parentId,
    paths: [points],
    origin: { x: 0, y: 0 },
    params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    strokeWidth: 0.5,
    ...overrides,
  });

  test('_expandGroupSelection expands a single child hit to all group siblings', () => {
    const grp = makeGroup('grp');
    const childA = makeChild('a', 'grp', [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
    const childB = makeChild('b', 'grp', [{ x: 10, y: 90 }, { x: 50, y: 90 }]);
    const renderer = makeRenderer([grp, childA, childB]);

    // Only childA intersects the drag rect — without expansion this returns just [childA]
    const result = renderer._expandGroupSelection([childA]);
    const ids = result.map((l) => l.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  test('_expandGroupSelection leaves ungrouped layers unchanged', () => {
    const solo = makeChild('solo', null, [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
    solo.parentId = null;
    const renderer = makeRenderer([solo]);

    const result = renderer._expandGroupSelection([solo]);
    expect(result.map((l) => l.id)).toEqual(['solo']);
  });

  test('_expandGroupSelection in groupEditMode filters to within-group layers only', () => {
    const grp = makeGroup('grp');
    const childA = makeChild('a', 'grp', [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
    const childB = makeChild('b', 'grp', [{ x: 10, y: 90 }, { x: 50, y: 90 }]);
    const outsider = makeChild('out', null, [{ x: 200, y: 200 }, { x: 250, y: 200 }]);
    outsider.parentId = null;
    const renderer = makeRenderer([grp, childA, childB, outsider]);
    renderer.groupEditMode = { groupId: 'grp', activeLayerId: 'a' };

    // Only childA is inside grp; outsider should be excluded
    const result = renderer._expandGroupSelection([childA, outsider]);
    expect(result.map((l) => l.id)).toEqual(['a']);
  });

  test('_expandGroupSelection skips invisible siblings', () => {
    const grp = makeGroup('grp');
    const childA = makeChild('a', 'grp', [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
    const childB = makeChild('b', 'grp', [{ x: 10, y: 90 }, { x: 50, y: 90 }], { visible: false });
    const renderer = makeRenderer([grp, childA, childB]);

    const result = renderer._expandGroupSelection([childA]);
    expect(result.map((l) => l.id)).toEqual(['a']);
  });

  test('_expandGroupSelection returns both siblings when both are caught by drag', () => {
    const grp = makeGroup('grp');
    const childA = makeChild('a', 'grp', [{ x: 10, y: 10 }, { x: 50, y: 10 }]);
    const childB = makeChild('b', 'grp', [{ x: 10, y: 90 }, { x: 50, y: 90 }]);
    const renderer = makeRenderer([grp, childA, childB]);

    const result = renderer._expandGroupSelection([childA, childB]);
    const ids = result.map((l) => l.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });
});
