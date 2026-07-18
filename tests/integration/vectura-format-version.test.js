/*
 * AUD-02: opening a `.vectura` file saved by a NEWER app format must load
 * best-effort AND surface a non-blocking warning toast. Before this task no
 * version was compared anywhere, so a future-format file loaded silently
 * with whatever params happened to survive.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('.vectura newer-format warning on open (AUD-02)', () => {
  let runtime, window, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    if (typeof window.getThemeToken !== 'function') {
      window.getThemeToken = (_token, fallback) => fallback ?? '';
    }
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const openPayload = (payload) => {
    const realFileReader = window.FileReader;
    const text = JSON.stringify(payload);
    window.FileReader = class {
      readAsText() {
        this.result = text;
        if (typeof this.onload === 'function') this.onload();
      }
    };
    try {
      app.ui.openVecturaFile(new window.Blob([text], { type: 'application/json' }));
    } finally {
      window.FileReader = realFileReader;
    }
  };

  const withToastSpy = (fn) => {
    const overlays = (window.Vectura.UI.overlays = window.Vectura.UI.overlays || {});
    const realToast = overlays.Toast;
    const calls = [];
    overlays.Toast = { show: (opts) => calls.push(opts) };
    try {
      fn();
    } finally {
      overlays.Toast = realToast;
    }
    return calls;
  };

  test('formatVersion 999 loads best-effort and fires the newer-version warning', () => {
    const id = app.engine.addLayer('wavetable');
    app.engine.generate(id);
    const state = app.captureState();
    state.engine.formatVersion = 999;

    const calls = withToastSpy(() => openPayload({ state, images: {} }));

    // Best-effort load: the wavetable layer arrived.
    expect(app.engine.layers.some((l) => l.type === 'wavetable')).toBe(true);
    // Non-blocking warning surfaced.
    const warning = calls.find((c) => /newer version/i.test(c?.message || ''));
    expect(warning).toBeTruthy();
    expect(warning.variant).toBe('warning');
  });

  test('a current-format file opens with no newer-version warning', () => {
    const id = app.engine.addLayer('wavetable');
    app.engine.generate(id);
    const state = app.captureState();

    const calls = withToastSpy(() => openPayload({ state, images: {} }));

    expect(app.engine.layers.some((l) => l.type === 'wavetable')).toBe(true);
    expect(calls.some((c) => /newer version/i.test(c?.message || ''))).toBe(false);
  });
});
