const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Phase 3 Lane J — Text editing UI polish (TXT-3…5).
 *
 * Drives TextPanel.build() directly against a minimal ui stub (mirroring
 * text-panel.test.js) with a MOCKED Vectura.GoogleFonts loader — no network.
 * Pins:
 *   TXT-3  font-family list hover live-preview: dwell-debounced webfont fetch
 *          (≥150ms), preview applies to layer.params.font without a history
 *          push, dismiss reverts, click commits.
 *   TXT-4  clear (×) affordance on the filter field + no bulk font fetch on open
 *          (un-cached rows load on hover only).
 *   TXT-5  font-size preset dropdown with hover live-preview + click-commit and
 *          dismiss-reverts.
 */
describe('Text panel hover-preview + presets (TXT-3..5)', () => {
  let runtime;
  let window;
  let document;
  let GF;
  let saved;

  const FAKE_FAMILIES = [
    { id: 'roboto', family: 'Roboto', category: 'sans-serif', weights: [400], subsets: ['latin'], defSubset: 'latin' },
    { id: 'lora', family: 'Lora', category: 'serif', weights: [400], subsets: ['latin'], defSubset: 'latin' },
    { id: 'oswald', family: 'Oswald', category: 'display', weights: [400], subsets: ['latin'], defSubset: 'latin' },
  ];

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    window = runtime.window;
    document = runtime.document;
    GF = window.Vectura.GoogleFonts;
  });

  afterAll(() => runtime.cleanup());

  // A truthy "parsed" stub per family so the specimen renderer's parsed-face
  // lookup succeeds — otherwise it re-kicks ensureFont on every render (in the
  // real app the fetch populates the store and the kick stops; the mock never
  // would, spinning forever). Paired with an empty layout() so no glyph shaping
  // is attempted against the stub.
  const PARSED = { roboto: { unitsPerEm: 1000 }, lora: { unitsPerEm: 1000 }, oswald: { unitsPerEm: 1000 } };

  // Patch the real GoogleFonts object with mocks before each mount; restore after.
  beforeEach(() => {
    saved = {
      getFamilies: GF.getFamilies,
      loadCatalog: GF.loadCatalog,
      ensureFont: GF.ensureFont,
      loadWeight: GF.loadWeight,
      getParsed: GF.getParsed,
      getFontStatus: GF.getFontStatus,
      layout: GF.layout,
    };
    GF.getFamilies = () => FAKE_FAMILIES.slice();
    GF.loadCatalog = vi.fn(() => Promise.resolve(FAKE_FAMILIES.slice()));
    GF.ensureFont = vi.fn(() => Promise.resolve(PARSED.roboto));
    GF.loadWeight = vi.fn(() => Promise.resolve(PARSED.roboto));
    GF.getParsed = (id) => PARSED[id] || null;
    GF.getFontStatus = () => 'ready';
    GF.layout = vi.fn(() => ({ paths: [], meta: [], width: 0, height: 0, cells: [] }));
    try { window.localStorage.clear(); } catch (_) { /* */ }
  });

  afterEach(() => {
    Object.assign(GF, saved);
    vi.useRealTimers();
  });

  const firePtr = (el, type, props = {}) => {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, { button: 0, pointerId: 1, clientX: 0, clientY: 0, shiftKey: false }, props);
    el.dispatchEvent(ev);
    return ev;
  };
  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));

  const mount = (overrides = {}) => {
    const { UI, ALGO_DEFAULTS } = window.Vectura;
    const params = JSON.parse(JSON.stringify(ALGO_DEFAULTS.text));
    Object.assign(params, overrides);
    const layer = { id: 'text-1', type: 'text', params };
    const pushHistory = vi.fn();
    const regen = vi.fn();
    const storeLayerParams = vi.fn();
    const updateFormula = vi.fn();
    const ui = { app: { pushHistory, regen }, storeLayerParams, updateFormula, buildControls: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.TextPanel.build(ui, layer, container);
    const pop = document.querySelector('.vtp-fp-pop');
    const trigger = container.querySelector('.vtp-fontpick-trigger');
    return { ui, layer, container, pushHistory, regen, storeLayerParams, pop, trigger };
  };
  const openPicker = (h) => { h.trigger.click(); return h.pop; };
  const optFor = (pop, value) => Array.from(pop.querySelectorAll('.vtp-fp-opt')).find((o) => o.dataset.value === value);

  // ── TXT-3 ────────────────────────────────────────────────────────────────
  test('TXT-3: rapid hover debounces the webfont fetch — only the settled family fetches', () => {
    vi.useFakeTimers();
    const h = mount({ font: 'sans' });
    GF.ensureFont.mockClear();
    const pop = openPicker(h);
    const roboto = optFor(pop, 'google:roboto');
    const lora = optFor(pop, 'google:lora');
    expect(roboto && lora).toBeTruthy();

    firePtr(roboto, 'pointerenter');
    vi.advanceTimersByTime(100);           // still within the dwell — no fetch yet
    expect(GF.ensureFont).not.toHaveBeenCalled();
    firePtr(roboto, 'pointerleave');
    firePtr(lora, 'pointerenter');          // re-arms the dwell for lora
    vi.advanceTimersByTime(100);
    expect(GF.ensureFont).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);             // 160ms since lora enter → fires once
    expect(GF.ensureFont).toHaveBeenCalledTimes(1);
    expect(GF.ensureFont).toHaveBeenCalledWith('lora');
  });

  test('TXT-3: hover applies a preview without a history push; dismiss reverts', async () => {
    // Real timers: the dwell (≥150ms) + the mocked fetch resolution settle the
    // preview. (Fake-timer microtask flushing tangles with the specimen renderer's
    // own scheduling; the debounce itself is proven synchronously in the test above.)
    const h = mount({ font: 'sans' });
    const pop = openPicker(h);
    const roboto = optFor(pop, 'google:roboto');
    firePtr(roboto, 'pointerenter');
    await new Promise((r) => setTimeout(r, 240)); // dwell + ensureFont resolve → preview
    expect(h.layer.params.font).toBe('google:roboto');
    expect(h.pushHistory).not.toHaveBeenCalled();

    // Dismiss (click outside) reverts to the committed face, no history push.
    firePtr(document, 'pointerdown');
    expect(h.layer.params.font).toBe('sans');
    expect(h.pushHistory).not.toHaveBeenCalled();
  });

  test('TXT-3: clicking a family commits it (history push + recent)', () => {
    const h = mount({ font: 'sans' });
    const pop = openPicker(h);
    const roboto = optFor(pop, 'google:roboto');
    roboto.click();
    expect(h.pushHistory).toHaveBeenCalledTimes(1);
    expect(h.layer.params.font).toBe('google:roboto');
    const recent = JSON.parse(window.localStorage.getItem('vectura_font_recent'));
    expect(recent[0]).toBe('google:roboto');
  });

  test('TXT-3: tearing the panel down reverts an un-committed preview (no leak)', async () => {
    const { UI } = window.Vectura;
    const h = mount({ font: 'sans' });
    const pop = openPicker(h);
    const roboto = optFor(pop, 'google:roboto');
    firePtr(roboto, 'pointerenter');
    await new Promise((r) => setTimeout(r, 240));
    expect(h.layer.params.font).toBe('google:roboto'); // preview applied
    // Rebuilding the panel (e.g. selecting another layer) destroys this instance.
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    UI.TextPanel.build({ app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn(), updateFormula: vi.fn(), buildControls: vi.fn() }, { id: 't2', type: 'text', params: JSON.parse(JSON.stringify(window.Vectura.ALGO_DEFAULTS.text)) }, container2);
    expect(h.layer.params.font).toBe('sans'); // reverted, not leaked
    expect(h.pushHistory).not.toHaveBeenCalled();
  });

  // ── TXT-4 ────────────────────────────────────────────────────────────────
  test('TXT-4: opening the picker does not bulk-fetch webfont specimens', () => {
    const h = mount({ font: 'sans' });
    GF.ensureFont.mockClear();
    openPicker(h);
    expect(GF.ensureFont).not.toHaveBeenCalled();
  });

  test('TXT-4: the filter field has a clear (×) button that empties the search', () => {
    const h = mount({ font: 'sans' });
    const pop = openPicker(h);
    const input = pop.querySelector('.vtp-fp-search input');
    const clear = pop.querySelector('.vtp-fp-clear');
    expect(clear).toBeTruthy();
    input.value = 'ser';
    fire(input, 'input');
    expect(pop.classList.contains('has-query') || clear.classList.contains('show')).toBe(true);
    clear.click();
    expect(input.value).toBe('');
  });

  // ── TXT-5 ────────────────────────────────────────────────────────────────
  test('TXT-5: the size scrub opens a preset dropdown with the spec sizes', () => {
    const h = mount();
    const sizeSlot = h.container.querySelector('[data-ref="slot-size"]');
    const presetBtn = sizeSlot.querySelector('.vtp-scrub-preset');
    expect(presetBtn).toBeTruthy();
    presetBtn.click();
    const menu = document.querySelector('.vtp-size-pop');
    expect(menu).toBeTruthy();
    const vals = Array.from(menu.querySelectorAll('.vtp-size-opt')).map((o) => Number(o.dataset.size));
    expect(vals).toEqual([6, 7, 8, 9, 10, 11, 12, 14, 18, 21, 24, 36, 48, 60, 72]);
  });

  test('TXT-5: hovering a size previews it without commit; dismiss reverts', () => {
    const h = mount({ fontSize: 14 });
    const prior = h.layer.params.fontSize;
    const presetBtn = h.container.querySelector('[data-ref="slot-size"] .vtp-scrub-preset');
    presetBtn.click();
    const menu = document.querySelector('.vtp-size-pop');
    const opt48 = Array.from(menu.querySelectorAll('.vtp-size-opt')).find((o) => Number(o.dataset.size) === 48);
    firePtr(opt48, 'pointerenter');
    expect(h.layer.params.fontSize).toBe(48);
    expect(h.pushHistory).not.toHaveBeenCalled();
    // Dismiss without click reverts to the prior size.
    firePtr(document, 'pointerdown');
    expect(h.layer.params.fontSize).toBe(prior);
    expect(h.pushHistory).not.toHaveBeenCalled();
  });

  test('TXT-5: clicking a size commits it (history push + value)', () => {
    const h = mount({ fontSize: 14 });
    const presetBtn = h.container.querySelector('[data-ref="slot-size"] .vtp-scrub-preset');
    presetBtn.click();
    const menu = document.querySelector('.vtp-size-pop');
    const opt36 = Array.from(menu.querySelectorAll('.vtp-size-opt')).find((o) => Number(o.dataset.size) === 36);
    opt36.click();
    expect(h.pushHistory).toHaveBeenCalledTimes(1);
    expect(h.layer.params.fontSize).toBe(36);
    expect(document.querySelector('.vtp-size-pop')).toBeFalsy();
  });
});
