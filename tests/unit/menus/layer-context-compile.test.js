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
