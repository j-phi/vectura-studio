/*
 * Integration tests for Phase 4 wire-ups: empty-state illustrations
 * + indeterminate progress bar.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Phase 4 — empty-state + progress wire-ups', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('UI.EmptyStates and UI.overlays.ProgressBar are loaded', () => {
    expect(typeof window.Vectura?.UI?.EmptyStates?.attach).toBe('function');
    expect(typeof window.Vectura?.UI?.overlays?.ProgressBar?.show).toBe('function');
    expect(typeof window.Vectura?.UI?.Menus?.EngineProgressTap?.attach).toBe('function');
  });

  test('renderLayers() shows empty-state illustration when there are no layers', () => {
    // Drop all layers.
    const engine = window.app.engine;
    engine.layers = [];
    window.app.ui.renderLayers();
    const list = document.getElementById('layer-list');
    expect(list).toBeTruthy();
    const emptyState = list.querySelector('.vectura-empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.querySelector('.vectura-empty-state-title').textContent).toMatch(/no layers/i);
    expect(emptyState.querySelector('.vectura-empty-state-illustration svg')).toBeTruthy();
  });

  test('saveVecturaFile() shows + hides progress bar around the work', () => {
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:test';
    if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') el.click = () => {};
      return el;
    };
    try {
      window.app.ui.saveVecturaFile();
    } finally {
      document.createElement = origCreate;
    }
    const host = document.getElementById('vectura-progress-bar-host');
    expect(host).toBeTruthy();
    // After save completes synchronously, bar should be hidden again.
    expect(host.style.display).toBe('none');
  });

  test('exportSVG() shows + hides progress bar around the work', () => {
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:test';
    if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') el.click = () => {};
      return el;
    };
    try {
      window.app.ui.exportSVG();
    } finally {
      document.createElement = origCreate;
    }
    const host = document.getElementById('vectura-progress-bar-host');
    expect(host).toBeTruthy();
    expect(host.style.display).toBe('none');
  });

  test('EngineProgressTap is attached to engine.generate', () => {
    // The wrapper carries the patched function name.
    expect(typeof window.app.engine.generate).toBe('function');
    expect(window.app.engine.generate.name).toBe('patchedGenerate');
  });
});
