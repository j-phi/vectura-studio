/**
 * P3 feedback: while a group is isolated, clicking OUTSIDE the group must not
 * select the foreign object — the click is swallowed and isolation stays active
 * (only Escape / the breadcrumb exits). Everything INSIDE the group is
 * selectable, including nested descendants (which resolve to the immediate
 * child of the isolated group).
 *
 * Before the fix, an outside click ran exitGroupEditMode() but left
 * _groupHandled false, so it fell through and selected the foreign object.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('P3: isolate-group click scoping', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { Renderer } = runtime.window.Vectura;

    const grp = { id: 'grp', visible: true, isGroup: true, groupType: 'group', parentId: null, paths: [], params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1 } };
    const a = { id: 'a', visible: true, isGroup: false, parentId: 'grp', paths: [[{ x: 10, y: 10 }, { x: 50, y: 10 }]], origin: { x: 0, y: 0 }, params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1 }, strokeWidth: 0.5 };
    const b = { id: 'b', visible: true, isGroup: false, parentId: 'grp', paths: [[{ x: 10, y: 90 }, { x: 50, y: 90 }]], origin: { x: 0, y: 0 }, params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1 }, strokeWidth: 0.5 };
    const out = { id: 'out', visible: true, isGroup: false, parentId: null, paths: [[{ x: 200, y: 200 }, { x: 250, y: 200 }]], origin: { x: 0, y: 0 }, params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1 }, strokeWidth: 0.5 };
    const layers = [grp, a, b, out];

    const engine = {
      layers,
      currentProfile: { width: 300, height: 300 },
      getBounds() { return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false }; },
      getLayerChildren(pid) { return layers.filter((l) => l.parentId === pid); },
      getLayerAncestors(layer) {
        const anc = []; let cur = layer;
        while (cur && cur.parentId) { const p = layers.find((l) => l.id === cur.parentId); if (!p) break; anc.push(p); cur = p; }
        return anc;
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.groupEditMode = { groupId: 'grp', activeLayerId: 'a', kind: 'group' };
    renderer.setSelection(['a'], 'a');
    return { renderer, a, b, out };
  }

  test('clicking a foreign object outside the group is swallowed — stays isolated, no selection change', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 220, clientY: 200, preventDefault() {} });
    renderer.up({});

    expect(renderer.groupEditMode).not.toBeNull();
    expect([...renderer.selectedLayerIds]).toEqual(['a']); // unchanged, foreign NOT selected
  });

  test('clicking empty canvas outside the group stays isolated', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 150, clientY: 150, preventDefault() {} });
    renderer.up({});

    expect(renderer.groupEditMode).not.toBeNull();
  });

  test('clicking a member inside the group selects it and stays isolated', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 30, clientY: 90, preventDefault() {} }); // on child b
    renderer.up({});

    expect(renderer.groupEditMode).not.toBeNull();
    expect([...renderer.selectedLayerIds]).toEqual(['b']);
    expect(renderer.groupEditMode.activeLayerId).toBe('b');
  });

  test('shift-click extends the multi-selection within the isolated group', async () => {
    const { renderer } = await setup(); // selection starts as ['a'], isolated in grp
    // Shift-click member b (at 30,90) → both a and b selected, still isolated.
    renderer.down({ clientX: 30, clientY: 90, shiftKey: true, preventDefault() {} });
    renderer.up({});
    expect(renderer.groupEditMode).not.toBeNull();
    expect([...renderer.selectedLayerIds].sort()).toEqual(['a', 'b']);
  });

  test('_isolatedGroupMember resolves a nested descendant to the immediate group child', async () => {
    const { renderer } = await setup();
    // Simulate a sub-group inside grp: subgrp is a direct child of grp, leaf is
    // a child of subgrp. Clicking leaf should resolve to subgrp.
    const subgrp = { id: 'subgrp', visible: true, isGroup: true, groupType: 'group', parentId: 'grp', paths: [], params: {} };
    const leaf = { id: 'leaf', visible: true, isGroup: false, parentId: 'subgrp', paths: [[{ x: 60, y: 60 }, { x: 70, y: 60 }]], params: {} };
    renderer.engine.layers.push(subgrp, leaf);
    expect(renderer._isolatedGroupMember(leaf).id).toBe('subgrp');
    expect(renderer._isolatedGroupMember(renderer.engine.layers.find((l) => l.id === 'out'))).toBeNull();
  });
});
