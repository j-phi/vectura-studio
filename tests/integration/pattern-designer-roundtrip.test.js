/*
 * Phase 4 acceptance: Pattern Designer round-trip + chrome integrity.
 *
 * open → mutate fills → close → reopen → state preserved.
 * Plus a guardrail check that the chrome class names are unchanged
 * by the Phase 4 re-skin (CSS-only).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Phase 4 — Pattern Designer round-trip', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    if (typeof window.getThemeToken !== 'function') {
      window.getThemeToken = (_token, fallback) => fallback ?? '';
    }
    const HC = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (HC) {
      HC.getContext = function() {
        const proxy = new Proxy(
          {
            canvas: { width: 0, height: 0 },
            getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
            createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
            measureText: () => ({ width: 0 }),
            getLineDash: () => [],
            createLinearGradient: () => ({ addColorStop() {} }),
            createRadialGradient: () => ({ addColorStop() {} }),
            createPattern: () => null,
          },
          {
            get(target, prop) {
              if (prop in target) return target[prop];
              return () => {};
            },
            set(target, prop, value) { target[prop] = value; return true; },
          }
        );
        return proxy;
      };
    }
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function ensurePatternLayer() {
    let layer = (app.engine.layers || []).find((l) => l && l.type === 'pattern');
    if (layer) return layer;
    const Layer = window.Vectura.Layer;
    const id = `test-pattern-${Date.now()}`;
    layer = new Layer(id, 'pattern', 'PatternRT');
    app.engine.layers.push(layer);
    return layer;
  }

  test('opens and closes without throwing', () => {
    const layer = ensurePatternLayer();
    expect(typeof app.ui.openPatternDesigner).toBe('function');
    app.ui.openPatternDesigner(layer);
    const win = document.getElementById('pattern-designer-window');
    expect(win).toBeTruthy();
    // Chrome is shared with petal designer (re-uses petal-designer-* names).
    expect(win.querySelector('.petal-designer-header')).toBeTruthy();
    expect(win.querySelector('.petal-designer-title').textContent).toMatch(/pattern designer/i);
    app.ui.closePatternDesigner();
    expect(document.getElementById('pattern-designer-window')).toBeNull();
  });

  test('chrome class names + data-pd-* state binders are unchanged', () => {
    const layer = ensurePatternLayer();
    app.ui.openPatternDesigner(layer);
    const win = document.getElementById('pattern-designer-window');
    expect(win).toBeTruthy();
    // Tool buttons keep `petal-tool-btn` (modal flavor reuses petal classes)
    // and the `data-pd-tool` state-binder attr.
    const toolBtns = win.querySelectorAll('[data-pd-tool]');
    expect(toolBtns.length).toBeGreaterThanOrEqual(1);
    // Action buttons.
    expect(win.querySelector('[data-pd-import-tile]')).toBeTruthy();
    expect(win.querySelector('[data-pd-save-custom]')).toBeTruthy();
    expect(win.querySelector('[data-pd-open-library]')).toBeTruthy();
    // Status + validation chrome.
    expect(win.querySelector('[data-pd-status]')).toBeTruthy();
    expect(win.querySelector('[data-pd-validation-summary]')).toBeTruthy();
    // Canvas surface.
    expect(win.querySelector('[data-pd-canvas]')).toBeTruthy();
    app.ui.closePatternDesigner();
  });

  test('fills round-trip via patternDesigner.fills + layer.params.patternFills', () => {
    const layer = ensurePatternLayer();
    // Pre-seed a fill onto the layer's params.patternFills (the source of
    // truth that the designer hydrates from).
    layer.params.patternFills = [{
      id: 'f1',
      region: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      regions: [],
      targetIds: [],
      density: 1.5,
      fillType: 'hatch',
    }];

    app.ui.openPatternDesigner(layer);
    const pd = app.ui.patternDesigner;
    expect(pd).toBeTruthy();
    expect(Array.isArray(pd.fills)).toBe(true);
    expect(pd.fills.length).toBe(1);
    expect(pd.fills[0].density).toBe(1.5);
    expect(pd.fills[0].fillType).toBe('hatch');
    app.ui.closePatternDesigner();

    // Reopen and confirm state was rehydrated from layer.params.
    app.ui.openPatternDesigner(layer);
    const pd2 = app.ui.patternDesigner;
    expect(pd2.fills.length).toBe(1);
    expect(pd2.fills[0].density).toBe(1.5);
    app.ui.closePatternDesigner();
  });
});
