/*
 * Compile gate for src/ui/menus/layer-filter-menu.js (Phase 3 closure).
 */
const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Menus.LayerFilter (compile gate)', () => {
  let runtime;

  beforeEach(() => {
    runtime = loadUIComponent([
      'utils',
      'menu',
      'src/ui/menus/layer-filter-menu',
    ]);
  });
  afterEach(() => {
    const { window } = runtime;
    if (window?.Vectura?.UI?.Menus?.LayerFilter?._reset) {
      window.Vectura.UI.Menus.LayerFilter._reset();
    }
    runtime.cleanup();
  });

  test('registers UI.Menus.LayerFilter with bind/attach surface', () => {
    const LF = runtime.window.Vectura.UI.Menus.LayerFilter;
    expect(typeof LF).toBe('object');
    expect(typeof LF.bind).toBe('function');
    expect(typeof LF.attach).toBe('function');
    expect(Array.isArray(LF.FILTER_OPTS)).toBe(true);
    expect(LF.FILTER_OPTS.length).toBeGreaterThanOrEqual(20);
  });

  test('attach() before bind() throws an actionable error', () => {
    const LF = runtime.window.Vectura.UI.Menus.LayerFilter;
    expect(() => LF.attach({})).toThrow(/load order broken/);
  });

  test('_itemsFor("all") marks the matching entry with a checkmark', () => {
    const LF = runtime.window.Vectura.UI.Menus.LayerFilter;
    LF.bind({});
    const items = LF._itemsFor('all');
    expect(items[0].label.startsWith('✓ ')).toBe(true);
    expect(items[1].label.startsWith('   ')).toBe(true);
    expect(items.length).toBe(LF.FILTER_OPTS.length);
  });

  test('attach() wires #layer-filter-btn to open the menu', () => {
    const { document } = runtime;
    const btn = document.createElement('button');
    btn.id = 'layer-filter-btn';
    document.body.appendChild(btn);
    const LF = runtime.window.Vectura.UI.Menus.LayerFilter;
    LF.bind({});
    const ui = { layerFilterType: 'all', renderLayers: () => {} };
    LF.attach(ui);
    btn.click();
    // The Menu primitive sets style.display = 'block' on open.
    const menuEl = document.querySelector('.menu-dropdown');
    expect(menuEl).not.toBeNull();
    expect(menuEl.style.display).toBe('block');
  });

  test('selecting a key updates ui.layerFilterType and calls renderLayers', () => {
    const { document } = runtime;
    const btn = document.createElement('button');
    btn.id = 'layer-filter-btn';
    document.body.appendChild(btn);
    const LF = runtime.window.Vectura.UI.Menus.LayerFilter;
    LF.bind({});
    let renders = 0;
    const ui = { layerFilterType: 'all', renderLayers: () => { renders += 1; } };
    LF.attach(ui);
    LF.open(ui, btn);
    // Click an entry inside the rendered menu — onSelect should fire.
    const entries = document.querySelectorAll('.menu-entry');
    const wavetable = Array.from(entries).find((e) => e.dataset.key === 'wavetable');
    expect(wavetable).toBeDefined();
    wavetable.click();
    expect(ui.layerFilterType).toBe('wavetable');
    expect(renders).toBe(1);
  });
});
