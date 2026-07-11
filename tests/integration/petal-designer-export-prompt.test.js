/*
 * Petal Designer profile export — skinned prompt dialog.
 *
 * The per-side and pair export buttons used to call the native, event-loop-
 * blocking window.prompt. They now open UI.overlays.Prompt (async): the
 * export runs only in the promise-resolution path, seeded with the same
 * default names, and Cancel/Esc aborts the export entirely.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Petal Designer — profile export prompt dialog', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    // jsdom getContext('2d') returns null; stub a no-op 2D context so the thumb
    // canvases and renderPetalDesigner() don't throw.
    const noopCtx = {
      canvas: { width: 0, height: 0 },
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      fill() {}, stroke() {}, fillRect() {}, clearRect() {}, strokeRect() {}, arc() {},
      bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, translate() {}, rotate() {},
      scale() {}, setTransform() {}, transform() {}, resetTransform() {}, clip() {},
      drawImage() {}, measureText: () => ({ width: 0 }), fillText() {}, strokeText() {},
      setLineDash() {}, getLineDash: () => [], ellipse() {}, arcTo() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    const HC = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (HC) HC.getContext = function () { return noopCtx; };
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  afterEach(() => {
    app.ui.closePetalDesigner?.();
    // Any dialog left open would leak into the next test.
    document.querySelectorAll('.vectura-modal-backdrop').forEach((el) => el.remove());
  });

  function ensurePetalisLayer() {
    let layer = (app.engine.layers || []).find((l) => l && l.type === 'petalisDesigner');
    if (layer) return layer;
    const Layer = window.Vectura.Layer;
    layer = new Layer(`test-petalis-${Date.now()}`, 'petalisDesigner', 'PE');
    layer.params = layer.params || {};
    layer.params.innerCount = 0;
    layer.params.outerCount = 6;
    app.engine.layers.push(layer);
    return layer;
  }

  const openDesigner = () => {
    const layer = ensurePetalisLayer();
    app.ui.openPetalDesigner({ layer });
    return { layer, win: document.getElementById('petal-designer-window'), pd: app.ui.petalDesigner };
  };

  const promptBackdrop = () => document.querySelector('.vectura-modal-backdrop');
  const promptInput = () => promptBackdrop()?.querySelector('input[type="text"]');
  const promptButtons = () => promptBackdrop()?.querySelectorAll('.vectura-dialog-footer button') || [];
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('Export Pair opens the skinned prompt (native prompt untouched); confirming exports with the entered name', async () => {
    const { win } = openDesigner();
    const calls = [];
    app.ui.downloadJsonPayload = (payload, filename) => calls.push({ payload, filename });
    const origPrompt = window.prompt;
    window.prompt = () => { throw new Error('native window.prompt must not be called'); };
    try {
      const btn = win.querySelector('[data-petal-profile-export-pair]');
      expect(btn).toBeTruthy();
      btn.click();

      // Dialog is open, seeded with the legacy default name; export has NOT run.
      expect(promptBackdrop()).toBeTruthy();
      expect(promptInput().value).toBe('petal-profile-pair');
      expect(calls.length).toBe(0);

      promptInput().value = 'my-pair';
      promptButtons()[1].click(); // OK
      await flush();

      expect(calls.length).toBe(1);
      expect(calls[0].filename).toMatch(/\.json$/);
      expect(promptBackdrop()).toBeNull();
    } finally {
      window.prompt = origPrompt;
      delete app.ui.downloadJsonPayload;
    }
  });

  test('cancelling the export prompt aborts the export', async () => {
    const { win } = openDesigner();
    const calls = [];
    app.ui.downloadJsonPayload = (payload, filename) => calls.push({ payload, filename });
    try {
      win.querySelector('[data-petal-profile-export-pair]').click();
      expect(promptBackdrop()).toBeTruthy();
      promptButtons()[0].click(); // Cancel
      await flush();
      expect(calls.length).toBe(0);
      expect(promptBackdrop()).toBeNull();
    } finally {
      delete app.ui.downloadJsonPayload;
    }
  });
});
