/**
 * TUX-023 integration fix: the context bar re-anchors on every animation frame and asks the renderer for
 * the touch handle clearance. On a heavy document each getSelectionBounds() walk costs tens of ms, so an
 * uncached clearance (computed twice per frame) held WebKit's main thread for about 120 ms per frame and
 * pushed J2 open-layers past its step budget on webkit-ipad-portrait / webkit-iphone-landscape.
 * The clearance is now cached until the view, the selection, the temp transform or a draw changes it.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TUX-023: getHandleClearancePx is cached between draws', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const boxLayer = (id, min, max) => ({
    id,
    visible: true,
    isGroup: false,
    paths: [[
      { x: min, y: min }, { x: max, y: min }, { x: max, y: max }, { x: min, y: max }, { x: min, y: min },
    ]],
    origin: { x: 0, y: 0 },
    params: { posX: 0, posY: 0, rotation: 0 },
    strokeWidth: 0.5,
  });

  const setup = () => {
    const { Renderer } = runtime.window.Vectura;
    const layers = [boxLayer('a', 100, 300), boxLayer('b', 200, 400)];
    const engine = {
      layers,
      currentProfile: { width: 600, height: 600 },
      getBounds() { return { width: 600, height: 600, m: 0, dW: 600, dH: 600, truncate: false }; },
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    let selected = [layers[0]];
    renderer.isCoarseHandles = () => true;
    renderer.getSelectedLayers = () => selected;
    const orig = renderer.getSelectionBounds.bind(renderer);
    let walks = 0;
    renderer.getSelectionBounds = (...a) => { walks += 1; return orig(...a); };
    return {
      renderer,
      walks: () => walks,
      select: (i) => { selected = [layers[i]]; },
    };
  };

  test('repeat calls with nothing changed do not walk the selection again', () => {
    const t = setup();
    const first = t.renderer.getHandleClearancePx();
    expect(first).toBeGreaterThan(0);
    const after1 = t.walks();
    for (let i = 0; i < 5; i += 1) expect(t.renderer.getHandleClearancePx()).toBe(first);
    expect(t.walks()).toBe(after1);
  });

  test('a draw, a view change, a selection change or a temp transform recomputes', () => {
    const t = setup();
    t.renderer.getHandleClearancePx();
    let w = t.walks();

    t.renderer._drawSeq = (t.renderer._drawSeq || 0) + 1;
    t.renderer.getHandleClearancePx();
    expect(t.walks()).toBeGreaterThan(w); w = t.walks();

    t.renderer.scale = 2;
    t.renderer.getHandleClearancePx();
    expect(t.walks()).toBeGreaterThan(w); w = t.walks();

    t.renderer.offsetX = 15;
    t.renderer.getHandleClearancePx();
    expect(t.walks()).toBeGreaterThan(w); w = t.walks();

    t.select(1);
    t.renderer.getHandleClearancePx();
    expect(t.walks()).toBeGreaterThan(w); w = t.walks();

    t.renderer.tempTransform = { origin: { x: 0, y: 0 }, dx: 5, dy: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    t.renderer.getHandleClearancePx();
    expect(t.walks()).toBeGreaterThan(w);
  });

  test('the cached value equals a fresh computation', () => {
    const t = setup();
    t.renderer.scale = 0.5;
    const cached = (t.renderer.getHandleClearancePx(), t.renderer.getHandleClearancePx());
    t.renderer._drawSeq = (t.renderer._drawSeq || 0) + 1;
    expect(t.renderer.getHandleClearancePx()).toBe(cached);
  });
});
