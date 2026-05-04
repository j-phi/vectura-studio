const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('algo-draw toolbar', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const getBtn = () => document.querySelector('.tool-btn[data-tool="algo-draw"]');
  const getIcon = () => getBtn()?.querySelector('.tool-icon');
  const getPicker = () => document.getElementById('algo-draw-picker');

  // Opens the algo-draw picker by simulating a 400ms hold, then waiting for the timer to fire.
  const openPicker = async () => {
    const btn = getBtn();
    btn.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 450));
  };

  test('algo-draw button defaults to wavetable icon (12×12 viewBox) on boot', () => {
    const icon = getIcon();
    expect(icon).toBeTruthy();
    // _LVL_I icons use a 12×12 viewBox; default static icon used 24×24.
    expect(icon.getAttribute('viewBox')).toBe('0 0 12 12');
    expect(icon.querySelector('path')).toBeTruthy();
  });

  test('long-press (400 ms hold) reveals the algorithm picker with all 15 algorithms', async () => {
    await openPicker();
    const picker = getPicker();
    expect(picker).toBeTruthy();
    expect(picker.classList.contains('hidden')).toBe(false);
    expect(picker.querySelectorAll('.algo-pick-item').length).toBe(15);
    picker.classList.add('hidden');
  });

  test('clicking a picker item selects the algorithm, updates the toolbar icon, and activates algo-draw', async () => {
    app.ui.setActiveTool?.('select');
    await openPicker();

    const picker = getPicker();
    const item = picker.querySelector('[data-algo-type="flowfield"]');
    expect(item).toBeTruthy();
    item.click();

    expect(app.renderer.algoDraftType).toBe('flowfield');
    expect(getBtn().title).toContain('flowfield');
    expect(picker.classList.contains('hidden')).toBe(true);
    expect(getIcon().getAttribute('viewBox')).toBe('0 0 12 12');
    expect(app.ui.activeTool).toBe('algo-draw');
  });

  test('drag-release: pointerup on button while released over a picker item selects it and activates algo-draw', async () => {
    app.ui.setActiveTool?.('select');
    expect(app.ui.activeTool).toBe('select');

    await openPicker();
    const picker = getPicker();
    expect(picker.classList.contains('hidden')).toBe(false);

    const spiralItem = picker.querySelector('[data-algo-type="spiral"]');
    expect(spiralItem).toBeTruthy();

    // Simulate pointer-captured release: pointerup fires on the button but cursor is over the picker item.
    const origEFP = document.elementFromPoint;
    document.elementFromPoint = () => spiralItem;
    getBtn().dispatchEvent(new window.Event('pointerup', { bubbles: true }));
    document.elementFromPoint = origEFP;

    expect(app.renderer.algoDraftType).toBe('spiral');
    expect(getBtn().title).toContain('spiral');
    expect(picker.classList.contains('hidden')).toBe(true);
    expect(app.ui.activeTool).toBe('algo-draw');
  });

  test('selecting shapepack and drawing creates a shapePack layer (not wavetable)', async () => {
    app.ui.setActiveTool?.('select');
    await openPicker();

    const picker = getPicker();
    const item = picker.querySelector('[data-algo-type="shapePack"]');
    expect(item).toBeTruthy();
    item.click();

    expect(app.renderer.algoDraftType).toBe('shapePack');

    const beforeIds = new Set(app.engine.layers.map((l) => l.id));
    app.renderer.onAlgoDrawComplete({
      algoType: app.renderer.algoDraftType,
      rect: { x: 100, y: 100, w: 200, h: 200 },
    });
    const created = app.engine.layers.find((l) => !beforeIds.has(l.id));
    expect(created).toBeTruthy();
    expect(created.type).toBe('shapePack');
  });

  test('x key activates the algo-draw tool from any other tool', () => {
    app.ui.setActiveTool?.('select');
    expect(app.ui.activeTool).toBe('select');

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true }));

    expect(app.ui.activeTool).toBe('algo-draw');
  });
});
