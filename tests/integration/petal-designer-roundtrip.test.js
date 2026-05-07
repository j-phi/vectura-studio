/*
 * Phase 4 acceptance: Petal Designer round-trip preserves state.
 *
 * open → mutate state.innerCount → close → reopen → state preserved.
 * This validates the chrome re-skin did not regress the data binding
 * between the designer state object and the active layer's params.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Phase 4 — Petal Designer round-trip', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    // Provide getThemeToken as a global. In production it lives on UI.prototype
    // but the petal-designer IIFE references it as a global; JSDOM doesn't.
    if (typeof window.getThemeToken !== 'function') {
      window.getThemeToken = (_token, fallback) => fallback ?? '';
    }
    // JSDOM canvas getContext('2d') returns null; stub a no-op 2D context
    // so renderPetalDesigner() doesn't throw during open/reopen cycles.
    const noopCtx = new Proxy(
      {
        canvas: { width: 0, height: 0 },
        save() {}, restore() {}, beginPath() {}, closePath() {},
        moveTo() {}, lineTo() {}, fill() {}, stroke() {}, fillRect() {},
        clearRect() {}, strokeRect() {}, arc() {}, bezierCurveTo() {},
        quadraticCurveTo() {}, rect() {}, translate() {}, rotate() {},
        scale() {}, setTransform() {}, transform() {}, resetTransform() {},
        clip() {}, drawImage() {}, putImageData() {},
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
        createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
        measureText: () => ({ width: 0 }),
        fillText() {}, strokeText() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        createPattern: () => null,
        setLineDash() {}, getLineDash: () => [],
        ellipse() {}, arcTo() {},
      },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          return undefined;
        },
        set(target, prop, value) { target[prop] = value; return true; },
      }
    );
    const HC = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (HC) {
      HC.getContext = function() { return noopCtx; };
    }
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Find or create a Petalis layer for the round-trip.
  function ensurePetalisLayer() {
    let layer = (app.engine.layers || []).find((l) => l && l.type === 'petalisDesigner');
    if (layer) return layer;
    const Layer = window.Vectura.Layer;
    // Layer constructor: (id, type, name).
    const id = `test-petalis-${Date.now()}`;
    layer = new Layer(id, 'petalisDesigner', 'PetalRT');
    layer.params = layer.params || {};
    layer.params.innerCount = 12;
    layer.params.outerCount = 14;
    app.engine.layers.push(layer);
    return layer;
  }

  test('opens and closes without throwing', () => {
    const layer = ensurePetalisLayer();
    expect(typeof app.ui.openPetalDesigner).toBe('function');
    app.ui.openPetalDesigner({ layer });
    const win = document.getElementById('petal-designer-window');
    expect(win).toBeTruthy();
    // The chrome class names are unchanged by the re-skin (CSS-only).
    expect(win.classList.contains('petal-designer-window')).toBe(true);
    expect(win.querySelector('.petal-designer-header')).toBeTruthy();
    expect(win.querySelector('.petal-designer-title').textContent).toMatch(/petal designer/i);
    app.ui.closePetalDesigner();
    expect(document.getElementById('petal-designer-window')).toBeNull();
  });

  test('state preserved across open → mutate → close → reopen', () => {
    const layer = ensurePetalisLayer();
    app.ui.openPetalDesigner({ layer });
    const state = app.ui.petalDesigner?.state;
    expect(state).toBeTruthy();
    expect(state.layerId).toBe(layer.id);
    // Confirm getLayerById works inside the test runtime.
    const found = app.ui.getLayerById(layer.id);
    expect(found).toBe(layer);
    state.innerCount = 33;
    state.outerCount = 41;
    app.ui.applyPetalDesignerToLayer(state);
    // Confirm params on the layer were updated by apply().
    expect(layer.params.innerCount).toBe(33);
    expect(layer.params.outerCount).toBe(41);
    app.ui.closePetalDesigner();

    // Reopen and confirm — ensurePetalDesignerState() reads from layer.params.
    app.ui.openPetalDesigner({ layer });
    const reopened = app.ui.petalDesigner?.state;
    expect(reopened).toBeTruthy();
    expect(reopened.innerCount).toBe(33);
    expect(reopened.outerCount).toBe(41);
    app.ui.closePetalDesigner();
  });

  test('chrome class names are unchanged by Phase 4 re-skin (CSS-only)', () => {
    // The Phase 4 chrome re-skin is purely additive CSS scoped to
    // [data-ui-skin^="meridian"]; the JS-emitted class names must be
    // byte-identical to pre-Phase-4. Verifies the diff guardrail by
    // checking the exact class names on the chrome elements.
    const layer = ensurePetalisLayer();
    app.ui.openPetalDesigner({ layer });
    const win = document.getElementById('petal-designer-window');
    expect(win.classList.contains('petal-designer-window')).toBe(true);
    expect(win.querySelector('.petal-designer-header')).toBeTruthy();
    expect(win.querySelector('.petal-designer-title')).toBeTruthy();
    expect(win.querySelector('.petal-designer-actions')).toBeTruthy();
    // Each tool button keeps the legacy `petal-tool-btn` class.
    const toolBtns = win.querySelectorAll('.petal-tool-btn');
    expect(toolBtns.length).toBeGreaterThanOrEqual(1);
    // Profile editor card chrome.
    expect(win.querySelector('.petal-profile-editor-card')).toBeTruthy();
    expect(win.querySelector('.petal-profile-editor-card-title')).toBeTruthy();
    app.ui.closePetalDesigner();
  });
});
