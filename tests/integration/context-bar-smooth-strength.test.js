/**
 * Task Bar TB-6 Smooth — P3 feedback: Smooth now opens a progressive slider
 * (Illustrator-parity), NOT a fixed one-shot. Clicking Smooth enters the smooth
 * sub-mode; dragging the slider previews corner rounding live; Done commits in
 * exactly one undo step; Escape/cancel restores.
 *
 * RGR: the previous one-shot behavior would change geometry on a plain click
 * with no slider — this test proves the interactive slider path instead.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const nextFrames = (ms = 90) => new Promise((r) => setTimeout(r, ms));

describe('Task Bar Smooth passes a real strength (TB-6 regression)', () => {
  let runtime, window, document, app, CB, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    SETTINGS = window.Vectura.SETTINGS;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const host = () => CB.getContentHost();

  // A dense circle polyline (a genuinely smooth-able shape — no sharp corners,
  // so the fit visibly reduces/curves it, unlike an all-corner sawtooth which
  // corner-preservation would leave unchanged).
  const makeJaggedShape = (id) => {
    const pts = [];
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; pts.push({ x: 100 * Math.cos(a), y: 100 * Math.sin(a) }); }
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { straight: true, closed: true };
    return {
      id, name: id, type: 'shape', isGroup: false, visible: true,
      params: { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 },
      origin: { x: 0, y: 0 },
      sourcePaths: [pts], paths: [], fills: [],
    };
  };

  const geomSignature = (layer) =>
    JSON.stringify((layer.sourcePaths || []).map((p) => p.map((pt) => [Math.round(pt.x * 1000), Math.round(pt.y * 1000)])));

  test('Smooth opens the slider; dragging previews and Done commits in one undo step', async () => {
    const layer = makeJaggedShape('smooth-shape-1');
    app.engine.layers = [layer];
    app.renderer.setSelection([layer.id], layer.id);
    app.renderer.setTool('direct'); // → bar renders the 'direct' context (has Smooth)
    await nextFrames();

    const smoothTip = window.Vectura.CONTEXT_BAR.buttons.smooth.tooltip;
    const btn = Array.from(host().querySelectorAll('.ctxbar-btn')).find((b) => b.title === smoothTip);
    expect(btn).toBeTruthy();

    const before = geomSignature(app.engine.getLayerById(layer.id));
    app.pushHistory(); // baseline so undo has a prior state
    const histBefore = app.history.length;

    // Click Smooth → enters the progressive slider sub-mode.
    btn.click();
    await nextFrames();
    const slider = host().querySelector('.ctxbar-smooth-slider');
    expect(slider).toBeTruthy();

    // Drag the slider → live preview rounds the corners.
    slider.value = '80';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(geomSignature(app.engine.getLayerById(layer.id))).not.toBe(before);

    // Done commits.
    const done = host().querySelector('[data-ctxbar-exit="done"]');
    expect(done).toBeTruthy();
    done.click();
    await nextFrames();

    expect(geomSignature(app.engine.getLayerById(layer.id))).not.toBe(before);
    // Exactly one history push from the commit (smoothCommit owns it).
    expect(app.history.length).toBe(histBefore + 1);

    // Single undo restores the jagged original.
    app.undo();
    expect(geomSignature(app.engine.getLayerById(layer.id))).toBe(before);
  });
});
