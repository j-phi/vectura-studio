/**
 * RGR regressions:
 *
 * 1. setCanvasCursor should fall back dataset.cursorMode to the cursor
 *    keyword when no explicit mode is provided. Hover handlers rely on this
 *    so e2e/integration tests can assert dataset.cursorMode === 'grab'/'move'
 *    from a single-arg call. A refactor stripped that fallback; this test
 *    locks the contract.
 *
 * 2. startMaskPreviewForSelection should start the mask preview for the
 *    mask root even when the click auto-selected a multi-layer mask group
 *    (mask parent + clipped child). Previously the preview only fired for
 *    a single-layer selection.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer cursor mode + mask preview', () => {
  let runtime;
  let Renderer;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    Renderer = runtime.window.Vectura.Renderer;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeBareRenderer = () => {
    const engine = {
      layers: [],
      currentProfile: { width: 300, height: 300 },
      getBounds() { return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false }; },
    };
    const r = new Renderer('main-canvas', engine);
    r.scale = 1;
    return r;
  };

  test('setCanvasCursor falls back cursorMode to keyword cursor when no mode is given', () => {
    const r = makeBareRenderer();
    r.canvas = { style: {}, dataset: {} };
    r.setCanvasCursor('grab');
    expect(r.canvas.dataset.cursorMode).toBe('grab');
    r.setCanvasCursor('grabbing');
    expect(r.canvas.dataset.cursorMode).toBe('grabbing');
    r.setCanvasCursor('move');
    expect(r.canvas.dataset.cursorMode).toBe('move');
  });

  test('setCanvasCursor uses explicit mode argument when provided', () => {
    const r = makeBareRenderer();
    r.canvas = { style: {}, dataset: {} };
    r.setCanvasCursor('crosshair', 'shape-reticle');
    expect(r.canvas.dataset.cursorMode).toBe('shape-reticle');
  });

  test('setCanvasCursor with url(...) cursor keeps cursorMode as default unless explicit', () => {
    const r = makeBareRenderer();
    r.canvas = { style: {}, dataset: {} };
    // url() cursors are not valid mode keywords; fallback should land on 'default'.
    r.setCanvasCursor('url("data:image/svg+xml,foo") 0 0, auto');
    expect(r.canvas.dataset.cursorMode).toBe('default');
    r.setCanvasCursor('url("data:image/svg+xml,foo") 0 0, auto', 'pen');
    expect(r.canvas.dataset.cursorMode).toBe('pen');
  });

  test('startMaskPreviewForSelection picks the mask root from a multi-layer mask group', () => {
    const r = makeBareRenderer();
    r.activeTool = 'select';
    let captured = null;
    r.startMaskPreview = (layer) => { captured = layer; };
    r.clearMaskPreview = () => { captured = null; };

    const maskParent = {
      id: 'parent',
      mask: { enabled: true },
      maskCapabilities: { canSource: true },
    };
    const child = { id: 'child', mask: { enabled: false } };

    r.startMaskPreviewForSelection([maskParent, child]);
    expect(captured).toBe(maskParent);
  });

  test('startMaskPreviewForSelection clears preview when no mask root is selected', () => {
    const r = makeBareRenderer();
    r.activeTool = 'select';
    let captured = 'sentinel';
    r.startMaskPreview = (layer) => { captured = layer; };
    r.clearMaskPreview = () => { captured = null; };

    const a = { id: 'a', mask: { enabled: false } };
    const b = { id: 'b', mask: { enabled: false } };

    r.startMaskPreviewForSelection([a, b]);
    expect(captured).toBeNull();
  });

  test('startMaskPreviewForSelection does nothing when activeTool is not select', () => {
    const r = makeBareRenderer();
    r.activeTool = 'pen';
    let captured = 'sentinel';
    r.startMaskPreview = (layer) => { captured = layer; };
    r.clearMaskPreview = () => { captured = null; };

    const maskParent = {
      id: 'p',
      mask: { enabled: true },
      maskCapabilities: { canSource: true },
    };
    r.startMaskPreviewForSelection([maskParent]);
    expect(captured).toBeNull();
  });

  test('startMaskPreviewForSelection forwards single-layer selection to startMaskPreview', () => {
    const r = makeBareRenderer();
    r.activeTool = 'select';
    let captured = null;
    r.startMaskPreview = (layer) => { captured = layer; };
    r.clearMaskPreview = () => { captured = null; };

    const layer = { id: 'solo' };
    r.startMaskPreviewForSelection([layer]);
    expect(captured).toBe(layer);
  });

  // BUG 1: a real pointer hover over the canvas calls updateHoverCursor, which had
  // no 'type' branch and fell through to the crosshair default — so the Type tool
  // showed a plus/crosshair instead of the I-beam text cursor.
  test('updateHoverCursor keeps the I-beam (text) cursor for the type tool', () => {
    const r = makeBareRenderer();
    r.canvas = { style: {}, dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    r.activeTool = 'type';
    r._modState = { alt: false, meta: false };
    // Stubs only reached by the (buggy) fall-through; the fixed 'type' branch
    // returns before any of these run.
    r.screenToWorld = () => ({ x: 0, y: 0 });
    r.hitLightSource = () => false;
    r.getSelectedLayers = () => [];

    r.updateHoverCursor({ clientX: 10, clientY: 10 });

    expect(r.canvas.style.cursor).toBe('text');
    expect(r.canvas.dataset.cursorMode).toBe('type');
  });
});
