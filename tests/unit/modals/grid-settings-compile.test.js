/*
 * Compile gate for src/ui/modals/grid-settings.js (Phase 3 step 2).
 *
 * Verifies the grid-settings panel module:
 *   - registers as window.Vectura.UI.Modals.GridSettings
 *   - exposes bind() + mount + bindHandlers + PANEL_HTML + PANEL_ID
 *   - throws a clear error if mount/bindHandlers run before bind()
 *   - after bind(), mount() injects #grid-settings-panel into a host element
 *   - mount() is idempotent (re-mount no-ops)
 *   - mount() yields all six expected control IDs in the markup
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('grid-settings panel compile gate', () => {
  let dom;
  let GridSettings;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/modals/grid-settings.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    GridSettings = w.Vectura.UI.Modals.GridSettings;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.GridSettings with bind + mount + bindHandlers', () => {
    expect(GridSettings).toBeTruthy();
    expect(typeof GridSettings.bind).toBe('function');
    expect(typeof GridSettings.mount).toBe('function');
    expect(typeof GridSettings.bindHandlers).toBe('function');
    expect(typeof GridSettings.PANEL_HTML).toBe('string');
    expect(GridSettings.PANEL_ID).toBe('grid-settings-panel');
  });

  it('mount throws a clear error before bind()', () => {
    const host = dom.window.document.createElement('div');
    expect(() => GridSettings.mount(host))
      .toThrow(/GridSettings\.mount invoked before GridSettings\.bind/);
  });

  it('bindHandlers throws a clear error before bind()', () => {
    expect(() => GridSettings.bindHandlers.call({}))
      .toThrow(/GridSettings\.bindHandlers invoked before GridSettings\.bind/);
  });

  it('after bind(), mount() injects the panel with all expected control IDs', () => {
    GridSettings.bind({
      getEl: (id) => dom.window.document.getElementById(id),
      SETTINGS: {},
      openColorPickerAnchoredTo: () => {},
    });
    const main = dom.window.document.querySelector('main');
    const panel = GridSettings.mount(main);
    expect(panel).toBeTruthy();
    expect(panel.id).toBe('grid-settings-panel');
    const expectedIds = [
      'grid-settings-panel',
      'btn-close-grid-settings',
      'grid-type-ctrl',
      'set-grid-opacity-slider',
      'set-grid-opacity',
      'set-grid-style',
      'set-grid-color-pill',
      'set-grid-color',
      'set-grid-size-slider',
      'set-grid-size',
      'set-grid-minor-opacity-slider',
      'set-grid-minor-opacity',
      'set-grid-minor-color-pill',
      'set-grid-minor-color',
      'set-grid-minor-size-slider',
      'set-grid-minor-size',
      'set-grid-snap-enabled',
      'set-grid-snap-sensitivity',
      'set-grid-snap-sensitivity-val',
    ];
    for (const id of expectedIds) {
      expect(dom.window.document.getElementById(id), `missing #${id}`).toBeTruthy();
    }
  });

  it('mount() is idempotent (re-mount no-ops)', () => {
    const main = dom.window.document.querySelector('main');
    const panel1 = GridSettings.mount(main);
    const panel2 = GridSettings.mount(main);
    expect(panel1).toBe(panel2);
    // Only one panel in the DOM:
    expect(dom.window.document.querySelectorAll('#grid-settings-panel').length).toBe(1);
  });

  it('PANEL_HTML contains all expected style options and grid sections', () => {
    expect(GridSettings.PANEL_HTML).toContain('<option value="cartesian">');
    expect(GridSettings.PANEL_HTML).toContain('<option value="isometric">');
    expect(GridSettings.PANEL_HTML).toContain('<option value="cartesian-dot">');
    expect(GridSettings.PANEL_HTML).toContain('<option value="isometric-dot">');
    expect(GridSettings.PANEL_HTML).toContain('data-grid-type="none"');
    expect(GridSettings.PANEL_HTML).toContain('data-grid-type="standard"');
    expect(GridSettings.PANEL_HTML).toContain('data-grid-type="major-minor"');
    expect(GridSettings.PANEL_HTML).toContain('Major Grid Lines');
    expect(GridSettings.PANEL_HTML).toContain('Minor Grid Lines');
    expect(GridSettings.PANEL_HTML).toContain('Snap to Grid');
  });
});
