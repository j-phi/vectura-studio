/*
 * Integration tests for Phase 3 closure toast wire-ups.
 *
 * Boots the full Vectura runtime, then exercises the surfaces that should
 * fire UI.overlays.Toast: save, open, import, export, layer-add. We assert
 * the toast container element exists and at least one toast was appended
 * after each surface action.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Phase 3 closure — toast wire-ups', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  beforeEach(() => {
    // Clear any prior toast nodes.
    const host = document.getElementById('vectura-toast-host');
    if (host) host.innerHTML = '';
  });

  test('UI.overlays.Toast is loaded and exposes show()', () => {
    expect(typeof window.Vectura?.UI?.overlays?.Toast?.show).toBe('function');
  });

  test('saveVecturaFile() fires a success toast', () => {
    // Stub createObjectURL and revokeObjectURL because JSDOM lacks them.
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:test';
    if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
    // Avoid actually clicking the anchor element which would navigate.
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') el.click = () => {};
      return el;
    };

    window.app.ui.saveVecturaFile();

    document.createElement = origCreate;
    const host = document.getElementById('vectura-toast-host');
    expect(host).toBeTruthy();
    const toasts = host.querySelectorAll('.vectura-toast');
    expect(toasts.length).toBeGreaterThanOrEqual(1);
    const last = toasts[toasts.length - 1];
    expect(last.textContent).toMatch(/saved/i);
    expect(last.classList.contains('vectura-toast-success')).toBe(true);
  });

  test('exportSVG() fires a success toast naming the file and its path count', () => {
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:test';
    if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') el.click = () => {};
      return el;
    };

    window.app.engine.addLayer('flowfield');
    window.app.ui.exportSVG();

    document.createElement = origCreate;
    const host = document.getElementById('vectura-toast-host');
    expect(host).toBeTruthy();
    const toasts = host.querySelectorAll('.vectura-toast');
    expect(toasts.length).toBeGreaterThanOrEqual(1);
    const last = toasts[toasts.length - 1];
    // Delight contract: filename + comma-grouped path count, e.g.
    // "Exported vectura.svg — 1,165 paths".
    expect(last.textContent).toMatch(/^Exported vectura\.svg — [\d,]+ paths?$/);
    expect(last.classList.contains('vectura-toast-success')).toBe(true);
  });

  test('openVecturaFile() emits a danger toast on invalid JSON', () => {
    let onloadCb = null;
    class FakeReader {
      constructor() { this.result = ''; }
      readAsText(_blob) {
        this.result = '{ not valid';
        if (typeof this.onload === 'function') {
          onloadCb = this.onload;
          this.onload();
        }
      }
    }
    const origReader = window.FileReader;
    window.FileReader = FakeReader;
    try {
      window.app.ui.openVecturaFile(new window.Blob(['{}']));
    } finally {
      window.FileReader = origReader;
    }
    const host = document.getElementById('vectura-toast-host');
    const toasts = host.querySelectorAll('.vectura-toast');
    expect(toasts.length).toBeGreaterThanOrEqual(1);
    const dangerToast = Array.from(toasts).find((t) => t.classList.contains('vectura-toast-danger'));
    expect(dangerToast).toBeTruthy();
    expect(dangerToast.textContent).toMatch(/invalid/i);
  });

  // AUD-09: openVecturaFile's catch collapsed every failure mode into one
  // opaque modal and never logged the real error, making the actual parse
  // failure unrecoverable from the console.
  test('openVecturaFile() console.errors the real parse error on invalid JSON', () => {
    class FakeReader {
      constructor() { this.result = ''; }
      readAsText(_blob) {
        this.result = '{ not valid';
        if (typeof this.onload === 'function') this.onload();
      }
    }
    const origReader = window.FileReader;
    window.FileReader = FakeReader;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      window.app.ui.openVecturaFile(new window.Blob(['{}']));
    } finally {
      window.FileReader = origReader;
    }
    expect(errSpy).toHaveBeenCalled();
    // The jsdom window realm's Error differs from this file's global Error,
    // so check for a thrown-error shape (a `.message` string) rather than
    // `instanceof Error`.
    const loggedErr = errSpy.mock.calls.find((args) =>
      args.some((a) => a && typeof a === 'object' && typeof a.message === 'string')
    );
    expect(loggedErr).toBeTruthy();
    errSpy.mockRestore();
  });

  // AUD-09: saveVecturaFile was try/finally with no catch — a thrown
  // captureState()/stringify meant no file downloaded, the progress bar
  // closed normally, and the user got zero feedback that the save failed.
  test('saveVecturaFile() catches a captureState failure, toasts distinctly from success, and console.errors', () => {
    const origCapture = window.app.captureState;
    window.app.captureState = () => { throw new Error('boom'); };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => window.app.ui.saveVecturaFile()).not.toThrow();

    window.app.captureState = origCapture;
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();

    const host = document.getElementById('vectura-toast-host');
    const toasts = host.querySelectorAll('.vectura-toast');
    const dangerToast = Array.from(toasts).find((t) => t.classList.contains('vectura-toast-danger'));
    expect(dangerToast).toBeTruthy();
    expect(dangerToast.textContent).not.toMatch(/^saved/i);
  });
});
