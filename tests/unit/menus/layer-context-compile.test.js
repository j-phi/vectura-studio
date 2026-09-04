/*
 * Compile gate for src/ui/menus/layer-context-menu.js (Phase 3 closure).
 *
 * Asserts the module loads under JSDOM, registers on UI.Menus.LayerContext,
 * builds the right items for a layer, and runs the duplicate/delete actions
 * via the bound engine surface — without the full app/renderer running.
 */
const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Menus.LayerContext (compile gate)', () => {
  let runtime;

  beforeEach(() => {
    runtime = loadUIComponent([
      'utils',
      'menu',
      'src/ui/menus/layer-context-menu',
    ]);
  });
  afterEach(() => {
    const { window } = runtime;
    if (window?.Vectura?.UI?.Menus?.LayerContext?._reset) {
      window.Vectura.UI.Menus.LayerContext._reset();
    }
    runtime.cleanup();
  });

  test('registers UI.Menus.LayerContext with bind/attach surface', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    expect(typeof LC).toBe('object');
    expect(typeof LC.bind).toBe('function');
    expect(typeof LC.attach).toBe('function');
  });

  test('attach() before bind() throws an actionable load-order error', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    expect(() => LC.attach({ app: { engine: { layers: [] } } })).toThrow(/load order broken/);
  });

  test('_itemsFor() returns appropriate menu entries for an algo layer', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { layerLockedIds: new Set() };
    const layer = { id: 'L1', type: 'wavetable', visible: true, isGroup: false };
    const items = LC._itemsFor(ui, layer);
    const keys = items.filter((i) => i.key).map((i) => i.key);
    expect(keys).toEqual(['rename', 'duplicate', 'delete', 'toggle-visibility', 'toggle-lock', 'expand-into-group']);
    // separators present:
    expect(items.some((i) => i.separator)).toBe(true);
  });

  test('_itemsFor() omits "Expand into group" for shape layers', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { layerLockedIds: new Set() };
    const items = LC._itemsFor(ui, { id: 'L1', type: 'shape', visible: true });
    expect(items.filter((i) => i.key === 'expand-into-group').length).toBe(0);
  });

  test('_itemsFor() flips visibility label per layer.visible', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { layerLockedIds: new Set() };
    const itemsHidden = LC._itemsFor(ui, { id: 'L1', type: 'wavetable', visible: false });
    const itemsShown = LC._itemsFor(ui, { id: 'L1', type: 'wavetable', visible: true });
    expect(itemsHidden.find((i) => i.key === 'toggle-visibility').label).toBe('Show layer');
    expect(itemsShown.find((i) => i.key === 'toggle-visibility').label).toBe('Hide layer');
  });

  test('_runAction(duplicate) calls engine.duplicateLayer with the layer id and pushes history', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const calls = [];
    const ui = {
      app: {
        engine: {
          duplicateLayer: (id) => calls.push(['dup', id]),
          removeLayer: (id) => calls.push(['rm', id]),
          layers: [],
        },
        pushHistory: () => calls.push(['hist']),
        render: () => {},
      },
      renderLayers: () => {},
      layerLockedIds: new Set(),
    };
    const layer = { id: 'L7', type: 'wavetable', visible: true };
    LC._runAction(ui, layer, 'duplicate');
    expect(calls).toEqual([['hist'], ['dup', 'L7']]);
  });

  test('_itemsFor() adds "Expand Fill" when layer has paint-bucket fills', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { layerLockedIds: new Set() };
    const layer = {
      id: 'L1', type: 'shape', visible: true, isGroup: false,
      fills: [{ id: 'f1', fillType: 'hatch', region: [{ x: 0, y: 0 }] }],
    };
    const items = LC._itemsFor(ui, layer);
    expect(items.some((i) => i.key === 'expand-fill')).toBe(true);
  });

  test('_itemsFor() omits "Expand Fill" when layer has no fills', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { layerLockedIds: new Set() };
    const items = LC._itemsFor(ui, { id: 'L1', type: 'shape', visible: true, isGroup: false, fills: [] });
    expect(items.some((i) => i.key === 'expand-fill')).toBe(false);
  });

  test('_itemsFor() omits "Expand Fill" for group layers even with fills field', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { layerLockedIds: new Set() };
    const items = LC._itemsFor(ui, {
      id: 'L1', type: 'shape', visible: true, isGroup: true,
      fills: [{ id: 'f1', fillType: 'hatch', region: [{ x: 0, y: 0 }] }],
    });
    expect(items.some((i) => i.key === 'expand-fill')).toBe(false);
  });

  test('_runAction(expand-fill) routes to PaintBucketOps.expandFill', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const calls = [];
    runtime.window.Vectura.PaintBucketOps = {
      expandFill: (engine, layer) => {
        calls.push(['expand', layer.id, engine === ui.app.engine]);
        return { groupId: 'G1', layerId: layer.id, fillLayerIds: [] };
      },
    };
    const ui = {
      app: {
        engine: {
          layers: [],
          setActiveLayerId: (id) => calls.push(['active', id]),
        },
        pushHistory: () => calls.push(['hist']),
        render: () => {},
        renderer: { commitActiveBatch: () => calls.push(['commit']) },
        setSelection: (ids, primary) => calls.push(['sel', ids, primary]),
      },
      renderLayers: () => {},
      layerLockedIds: new Set(),
    };
    const layer = {
      id: 'L9', type: 'shape', visible: true, isGroup: false,
      fills: [{ id: 'f1', fillType: 'hatch' }],
    };
    LC._runAction(ui, layer, 'expand-fill');
    const keys = calls.map((c) => c[0]);
    expect(keys).toContain('hist');
    expect(keys).toContain('expand');
    expect(keys).toContain('sel');
  });

  // ── Convert-to-Scene (I1) — the affordance shows only for polyhedron/topoform ─
  test('_itemsFor() adds "Convert to Scene" for a polyhedron layer', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { app: { engine: { convertAlgoToScene: () => {}, layers: [] } }, layerLockedIds: new Set() };
    const items = LC._itemsFor(ui, { id: 'L1', type: 'polyhedron', visible: true, isGroup: false });
    expect(items.some((i) => i.key === 'convert-to-scene')).toBe(true);
  });

  test('_itemsFor() adds "Convert to Scene" for a topoform layer', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { app: { engine: { convertAlgoToScene: () => {}, layers: [] } }, layerLockedIds: new Set() };
    const items = LC._itemsFor(ui, { id: 'L1', type: 'topoform', visible: true, isGroup: false });
    expect(items.some((i) => i.key === 'convert-to-scene')).toBe(true);
  });

  test('_itemsFor() omits "Convert to Scene" for other algo layers', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { app: { engine: { convertAlgoToScene: () => {}, layers: [] } }, layerLockedIds: new Set() };
    const items = LC._itemsFor(ui, { id: 'L1', type: 'wavetable', visible: true, isGroup: false });
    expect(items.some((i) => i.key === 'convert-to-scene')).toBe(false);
  });

  test('_runAction(convert-to-scene) calls engine.convertAlgoToScene and selects the new group', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const calls = [];
    const ui = {
      app: {
        engine: {
          layers: [],
          convertAlgoToScene: (id) => { calls.push(['convert', id]); return { ok: true, groupId: 'G1' }; },
          setActiveLayerId: (id) => calls.push(['active', id]),
        },
        pushHistory: () => calls.push(['hist']),
        setSelection: (ids, primary) => calls.push(['sel', ids, primary]),
        render: () => {},
      },
      renderLayers: () => {},
      layerLockedIds: new Set(),
    };
    LC._runAction(ui, { id: 'P1', type: 'polyhedron', visible: true }, 'convert-to-scene');
    expect(calls).toEqual([['hist'], ['convert', 'P1'], ['sel', ['G1'], 'G1'], ['active', 'G1']]);
  });

  test('_runAction(convert-to-scene) on a blocked result surfaces a toast and leaves the layer', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const toasts = [];
    runtime.window.Vectura.UI.overlays = runtime.window.Vectura.UI.overlays || {};
    runtime.window.Vectura.UI.overlays.Toast = { show: (props) => toasts.push(props) };
    const calls = [];
    const ui = {
      app: {
        engine: {
          layers: [],
          convertAlgoToScene: () => ({ ok: false, reason: 'contours', message: "Contours mode isn't convertible yet" }),
          setActiveLayerId: (id) => calls.push(['active', id]),
        },
        pushHistory: () => calls.push(['hist']),
        setSelection: (ids, primary) => calls.push(['sel', ids, primary]),
        render: () => {},
      },
      renderLayers: () => {},
      layerLockedIds: new Set(),
    };
    LC._runAction(ui, { id: 'T1', type: 'topoform', visible: true }, 'convert-to-scene');
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toMatch(/Contours/);
    // No selection change — the layer is untouched (only history was pushed).
    expect(calls.some((c) => c[0] === 'sel')).toBe(false);
  });

  // ── Convert-to-Scene (I3) — "Add solid" on a scene group ────────────────────
  test('_itemsFor() adds "Add solid" to a scene group (alongside Add object)', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { app: { engine: { addObjectToScene: () => {}, layers: [] } }, layerLockedIds: new Set() };
    const layer = { id: 'G1', type: 'scene3d', isGroup: true, containerRole: 'scene', visible: true };
    const items = LC._itemsFor(ui, layer);
    const keys = items.filter((i) => i.key).map((i) => i.key);
    expect(keys).toContain('scene-add-object');
    expect(keys).toContain('scene-add-solid');
  });

  test('_itemsFor() omits "Add solid" for a non-scene group', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = { app: { engine: { addObjectToScene: () => {}, layers: [] } }, layerLockedIds: new Set() };
    const items = LC._itemsFor(ui, { id: 'L1', type: 'wavetable', visible: true, isGroup: false });
    expect(items.some((i) => i.key === 'scene-add-solid')).toBe(false);
  });

  test('_runAction(scene-add-solid) calls engine.addObjectToScene(groupId, "solid")', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const calls = [];
    const ui = {
      app: {
        engine: {
          layers: [],
          addObjectToScene: (gid, prim) => { calls.push(['add', gid, prim]); return 'obj-9'; },
          setActiveLayerId: (id) => calls.push(['active', id]),
        },
        pushHistory: () => calls.push(['hist']),
        setSelection: (ids, primary) => calls.push(['sel', ids, primary]),
        render: () => {},
      },
      renderLayers: () => {},
      layerLockedIds: new Set(),
    };
    const layer = { id: 'G1', type: 'scene3d', isGroup: true, containerRole: 'scene', visible: true };
    LC._runAction(ui, layer, 'scene-add-solid');
    expect(calls).toContainEqual(['add', 'G1', 'solid']);
    expect(calls.some((c) => c[0] === 'hist')).toBe(true);
    expect(calls).toContainEqual(['sel', ['obj-9'], 'obj-9']);
  });

  // ── Scene-tree Increment E — "Add ground" on a scene group ──────────────────
  // sceneGround3d is a scene-child leaf hidden from the primary picker
  // (src/config/defaults.js ALGO_DEFAULTS.sceneGround3d.hidden); this is its
  // replacement affordance — reachable straight off the scene group's own
  // context menu, with a duplicate-ground guard (max one ground per scene).
  test('_itemsFor() offers "Add ground" on a scene group with no ground child yet', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = {
      app: {
        engine: {
          addObjectToScene: () => {},
          addGroundToScene: () => {},
          getLayerDescendants: () => [{ id: 'obj-1', type: 'object3d' }],
          layers: [],
        },
      },
      layerLockedIds: new Set(),
    };
    const layer = { id: 'G1', type: 'scene3d', isGroup: true, containerRole: 'scene', visible: true };
    const items = LC._itemsFor(ui, layer);
    const groundItem = items.find((i) => i.key === 'scene-add-ground');
    expect(groundItem).toBeTruthy();
    expect(groundItem.label).toMatch(/ground/i);
  });

  test('_itemsFor() omits "Add ground" once the scene already has a ground child (one ground max)', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = {
      app: {
        engine: {
          addObjectToScene: () => {},
          addGroundToScene: () => {},
          getLayerDescendants: () => [{ id: 'grd-1', type: 'sceneGround3d' }],
          layers: [],
        },
      },
      layerLockedIds: new Set(),
    };
    const layer = { id: 'G1', type: 'scene3d', isGroup: true, containerRole: 'scene', visible: true };
    const items = LC._itemsFor(ui, layer);
    expect(items.some((i) => i.key === 'scene-add-ground')).toBe(false);
    // Guard against a vacuous pass: prove the scene-group block actually ran
    // (the Add shape entries are present alongside the omitted ground entry).
    expect(items.some((i) => i.key === 'scene-add-solid')).toBe(true);
  });

  test('_runAction(scene-add-ground) calls engine.addGroundToScene(groupId) and selects the new ground', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const calls = [];
    const ui = {
      app: {
        engine: {
          layers: [],
          addGroundToScene: (gid) => { calls.push(['add-ground', gid]); return 'grd-9'; },
          setActiveLayerId: (id) => calls.push(['active', id]),
        },
        pushHistory: () => calls.push(['hist']),
        setSelection: (ids, primary) => calls.push(['sel', ids, primary]),
        render: () => {},
      },
      renderLayers: () => {},
      layerLockedIds: new Set(),
    };
    const layer = { id: 'G1', type: 'scene3d', isGroup: true, containerRole: 'scene', visible: true };
    LC._runAction(ui, layer, 'scene-add-ground');
    expect(calls).toContainEqual(['add-ground', 'G1']);
    expect(calls.some((c) => c[0] === 'hist')).toBe(true);
    expect(calls).toContainEqual(['sel', ['grd-9'], 'grd-9']);
  });

  test('_runAction(toggle-lock) toggles the id in ui.layerLockedIds', () => {
    const LC = runtime.window.Vectura.UI.Menus.LayerContext;
    LC.bind({});
    const ui = {
      app: { engine: { layers: [] }, render: () => {} },
      renderLayers: () => {},
      layerLockedIds: new Set(),
    };
    const layer = { id: 'L9', type: 'wavetable', visible: true };
    LC._runAction(ui, layer, 'toggle-lock');
    expect(ui.layerLockedIds.has('L9')).toBe(true);
    LC._runAction(ui, layer, 'toggle-lock');
    expect(ui.layerLockedIds.has('L9')).toBe(false);
  });
});
