const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * TUX-029: the Text panel's multi-line "Text" content field.
 * Same mount() pattern as text-panel.test.js (TextPanel.build against a ui stub).
 */
describe('Text panel content field (TUX-029)', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    window = runtime.window;
    document = runtime.document;
  });
  afterAll(() => { runtime.cleanup(); });
  afterEach(() => {
    vi.useRealTimers();
    try { window.localStorage.removeItem('vectura_spec_collapsed'); } catch (_) { /* */ }
    delete window.matchMedia;
  });

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));

  const mount = (overrides = {}, uiExtra = {}) => {
    const { UI, ALGO_DEFAULTS } = window.Vectura;
    const params = JSON.parse(JSON.stringify(ALGO_DEFAULTS.text));
    Object.assign(params, overrides);
    const layer = { id: 'text-1', type: 'text', params };
    const pushHistory = vi.fn();
    const regen = vi.fn();
    const storeLayerParams = vi.fn();
    const updateFormula = vi.fn();
    const buildControls = vi.fn();
    const ui = { app: { pushHistory, regen, ...(uiExtra.app || {}) }, storeLayerParams, updateFormula, buildControls };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.TextPanel.build(ui, layer, container);
    return { ui, layer, container, pushHistory, regen, storeLayerParams, updateFormula };
  };
  const field = (c) => c.querySelector('textarea[data-text-content]');

  test('T1 one session = one history entry (specimen path)', () => {
    vi.useFakeTimers();
    const { container, layer, pushHistory } = mount();
    const spec = container.querySelector('.vtp-spec-text');
    spec.focus();
    spec.textContent = 'A';
    fire(spec, 'input');
    vi.advanceTimersByTime(500);
    spec.textContent = 'AB';
    fire(spec, 'input');
    vi.advanceTimersByTime(500);
    fire(spec, 'blur');
    expect(layer.params.text).toBe('AB');
    expect(pushHistory).toHaveBeenCalledTimes(1);
  });

  test('T2 field exists, is bound, live, and one session = one entry', () => {
    vi.useFakeTimers();
    const { container, layer, pushHistory, regen } = mount();
    const f = field(container);
    expect(f).toBeTruthy();
    expect(f.value).toBe(layer.params.text);
    f.focus();
    f.value = 'Hello';
    fire(f, 'input');
    expect(layer.params.text).toBe('Hello');
    vi.advanceTimersByTime(500);
    expect(regen).toHaveBeenCalled();
    f.value = 'Hello there';
    fire(f, 'input');
    vi.advanceTimersByTime(500);
    fire(f, 'blur');
    expect(layer.params.text).toBe('Hello there');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    // The specimen preview mirrors the field.
    expect(container.querySelector('.vtp-spec-text').textContent).toContain('Hello there');
  });

  test('T2b a burst plus blur regens once', () => {
    const { container, regen } = mount();
    const f = field(container);
    f.focus();
    f.value = 'x'; fire(f, 'input');
    f.value = 'xy'; fire(f, 'input');
    fire(f, 'blur');
    expect(regen).toHaveBeenCalledTimes(1);
  });

  test('T3 an unchanged session adds no history entry', () => {
    const { container, pushHistory } = mount();
    const f = field(container);
    f.focus();
    fire(f, 'blur');
    expect(pushHistory).toHaveBeenCalledTimes(0);
  });

  test('T4 jitter=1 edits stay plain text', () => {
    const { container, layer } = mount({ jitter: 1 });
    const f = field(container);
    f.focus();
    f.value = 'Jitter';
    fire(f, 'input');
    fire(f, 'blur');
    expect(layer.params.text).toBe('Jitter');
    expect(f.value).toBe('Jitter');
    expect(f.querySelector('span')).toBeNull();
  });

  test('T5 the field survives a collapsed specimen and is outside it', () => {
    window.localStorage.setItem('vectura_spec_collapsed', 'true');
    const { container } = mount();
    expect(container.querySelector('.vtp-specimen').classList.contains('collapsed')).toBe(true);
    const f = field(container);
    expect(f).toBeTruthy();
    expect(f.closest('.vtp-specimen')).toBeNull();
  });

  test('T6 focusing the field ends a concurrent canvas session WITHOUT detaching the field', () => {
    // Real controller + a host whose refreshPanel rebuilds the panel the way
    // app.js does (ui.buildControls). A rebuild inside the focus event detaches the
    // field being focused, so the first tap would be lost.
    const { UI, ALGO_DEFAULTS, TextEditController } = window.Vectura;
    const params = JSON.parse(JSON.stringify(ALGO_DEFAULTS.text));
    Object.assign(params, { text: 'Hello World', kernPairs: { 5: 12 } });
    const layer = { id: 'text-1', type: 'text', params, glyphs: [{ sourceIndex: 0 }] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const pushHistory = vi.fn();
    let builds = 0;
    const ui = { app: { pushHistory, regen: vi.fn() }, storeLayerParams: vi.fn(), updateFormula: vi.fn() };
    const build = () => { container.innerHTML = ''; builds += 1; UI.TextPanel.build(ui, layer, container); };
    ui.buildControls = build;
    const te = new TextEditController({ regen: vi.fn(), pushHistory, refreshPanel: build, requestDraw: vi.fn() });
    ui.app.textEdit = te;
    build();
    expect(te.begin(layer, 5)).toBe(true);
    expect(te.isActive()).toBe(true);
    const buildsBefore = builds;
    const f = field(container);
    f.focus();
    expect(te.isActive()).toBe(false);
    expect(builds).toBe(buildsBefore);              // no synchronous rebuild
    expect(f.isConnected).toBe(true);
    expect(document.activeElement).toBe(f);
    expect(field(container)).toBe(f);
    f.value = 'Hi';
    fire(f, 'input');
    expect(layer.params.text).toBe('Hi');
    Object.keys(layer.params.kernPairs || {}).forEach((k) => expect(Number(k)).toBeLessThan(2));
  });

  test('T6c field tap in a blank session-created layer keeps the layer and takes the typed text', () => {
    const { UI, ALGO_DEFAULTS, TextEditController } = window.Vectura;
    const params = JSON.parse(JSON.stringify(ALGO_DEFAULTS.text));
    Object.assign(params, { text: '' });
    const layer = { id: 'text-new', type: 'text', params, glyphs: [] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const pushHistory = vi.fn();
    const layers = [layer];
    const discardCreatedLayer = vi.fn((l) => { layers.splice(layers.indexOf(l), 1); });
    const ui = { app: { pushHistory, regen: vi.fn() }, storeLayerParams: vi.fn(), updateFormula: vi.fn() };
    const build = () => { container.innerHTML = ''; UI.TextPanel.build(ui, layer, container); };
    ui.buildControls = build;
    const te = new TextEditController({
      regen: vi.fn(), pushHistory, refreshPanel: build, requestDraw: vi.fn(),
      createTextLayerAt: () => layer, discardCreatedLayer,
    });
    ui.app.textEdit = te;
    build();
    expect(te.beginNewAt(0, 0)).toBe(layer);   // Type tool tap, NO insertText
    const f = field(container);
    f.focus();
    expect(discardCreatedLayer).not.toHaveBeenCalled();
    expect(layers.length).toBe(1);
    expect(f.isConnected).toBe(true);
    expect(document.activeElement).toBe(f);
    f.value = 'Hi';
    fire(f, 'input');
    expect(layer.params.text).toBe('Hi');
    fire(f, 'blur');
    expect(pushHistory).toHaveBeenCalledTimes(1);   // exactly one field-session entry
  });

  test('T6b undo between inputs starts a new history entry', () => {
    vi.useFakeTimers();
    const { container, layer, pushHistory } = mount({ text: 'Abc' });
    const f = field(container);
    f.focus();
    f.value = 'Abcd';
    fire(f, 'input');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    layer.params.text = 'Abc'; // undo rewrote the text while the field kept focus
    f.value = 'Abcx';
    fire(f, 'input');
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  test('T7 touch-keyboard attributes', () => {
    const f = field(mount().container);
    expect(f.getAttribute('autocapitalize')).toBe('sentences');
    expect(f.getAttribute('autocorrect')).toBe('on');
    expect(f.getAttribute('inputmode')).toBe('text');
    expect(f.getAttribute('spellcheck')).toBe('true');
    expect(Number(f.getAttribute('rows'))).toBeGreaterThanOrEqual(3);
    expect(f.getAttribute('aria-label')).toBe('Text');
  });

  test('T8 fine pointer: specimen stays contenteditable (desktop unchanged)', () => {
    window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
    const spec = mount().container.querySelector('.vtp-spec-text');
    expect(spec.getAttribute('contenteditable')).toBe('true');
    expect(spec.getAttribute('role')).toBe('textbox');
  });

  test('T9 coarse pointer: specimen is a preview and a tap focuses the field', () => {
    window.matchMedia = (q) => ({ matches: /pointer:\s*coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
    const { container } = mount();
    const spec = container.querySelector('.vtp-spec-text');
    expect(spec.getAttribute('contenteditable')).toBe('false');
    expect(spec.getAttribute('role')).toBeNull();
    fire(spec, 'pointerup');
    fire(spec, 'click');
    expect(document.activeElement).toBe(field(container));
  });

  test('TextEditController.applyText prunes kernPairs and clamps the caret', () => {
    const { TextEditController } = window.Vectura;
    expect(typeof TextEditController.applyText).toBe('function');
    const layer = { id: 'a', type: 'text', params: { text: 'Hello World', kernPairs: { 3: 1, 5: 2, 9: 4 } } };
    TextEditController.applyText(layer, 'Hello');
    expect(layer.params.text).toBe('Hello');
    expect(layer.params.kernPairs).toEqual({ 3: 1 });
  });
});
