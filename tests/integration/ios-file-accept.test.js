/*
 * TUX-053: the .vectura pickers must be selectable on iOS Files.
 * iOS greys out files whose type it cannot map from an `accept` of
 * ".vectura,application/json". The pickers add application/octet-stream on iOS
 * only, compute accept at open time, and sniff the file head before the full read.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const OCTET = 'application/octet-stream';

describe('TUX-053 iOS .vectura file picker', () => {
  let runtime, window, document, app, clicked;

  const stubNav = (ua, platform, touchPoints) => {
    const def = (k, v) => Object.defineProperty(window.navigator, k, { get: () => v, configurable: true });
    def('userAgent', ua);
    def('platform', platform);
    def('maxTouchPoints', touchPoints);
  };
  const unstubNav = () => {
    ['userAgent', 'platform', 'maxTouchPoints'].forEach((k) => { delete window.navigator[k]; });
  };
  const waitFor = async (fn, ms = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (fn()) return true;
      await new Promise((r) => setTimeout(r, 10));
    }
    return false;
  };
  const toasts = () => Array.from(document.querySelectorAll('.vectura-toast')).map((t) => t.textContent);

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('harmonograph');
    app.ui.renderLayers();
    app.ui.buildControls();
    clicked = [];
    vi.spyOn(window.HTMLInputElement.prototype, 'click').mockImplementation(function () { clicked.push(this); });
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 60)); // let modal rAF focus timers drain
    unstubNav();
    vi.restoreAllMocks();
    runtime?.cleanup?.();
    runtime = null;
  });

  const openAccept = () => {
    clicked.length = 0;
    document.getElementById('btn-open-vectura').click();
    expect(clicked.length).toBe(1);
    return clicked[0].accept;
  };
  const galleryAccept = () => {
    clicked.length = 0;
    document.querySelector('.hg-preset-import').click();
    expect(clicked.length).toBe(1);
    return clicked[0].accept;
  };
  const parts = (s) => s.split(',');

  test('(a) iPhone UA adds application/octet-stream to File > Open', () => {
    stubNav(IPHONE_UA, 'iPhone', 5);
    expect(parts(openAccept())).toContain(OCTET);
  });
  test('(b) iPad UA adds application/octet-stream to File > Open', () => {
    stubNav(IPAD_UA, 'iPad', 5);
    expect(parts(openAccept())).toContain(OCTET);
  });
  test('(c) desktop-mode iPadOS (Macintosh UA, MacIntel, touch points 5) adds octet-stream', () => {
    stubNav(MAC_UA, 'MacIntel', 5);
    expect(parts(openAccept())).toContain(OCTET);
  });
  test('(d) desktop Mac keeps today\'s accept strings byte for byte', () => {
    stubNav(MAC_UA, 'MacIntel', 0);
    expect(openAccept()).toBe('.vectura,application/json');
    expect(galleryAccept()).toBe('.vectura');
  });
  test('(e) gallery import under iPhone UA adds octet-stream', () => {
    stubNav(IPHONE_UA, 'iPhone', 5);
    expect(parts(galleryAccept())).toContain(OCTET);
  });
  test('(f) accept is computed per open, not at load', () => {
    stubNav(IPHONE_UA, 'iPhone', 5);
    expect(parts(openAccept())).toContain(OCTET);
    stubNav(MAC_UA, 'MacIntel', 0);
    expect(openAccept()).toBe('.vectura,application/json');
  });

  const fullReads = (spy, size) => spy.mock.calls.filter((c) => c[0] && c[0].size === size);

  test('(g) a non-JSON file is rejected from a 256-byte sniff, never fully read', async () => {
    const bytes = new Uint8Array(1024 + 4);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    const file = new window.File([bytes], 'x.vectura');
    const spy = vi.spyOn(window.FileReader.prototype, 'readAsText');
    app.ui.openVecturaFile(file);
    expect(await waitFor(() => toasts().includes('Invalid .vectura file'))).toBe(true);
    expect(fullReads(spy, file.size).length).toBe(0);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls.every((c) => c[0].size <= 256)).toBe(true);
  });

  test('(h) the gallery rejects a non-JSON file from the sniff, never fully read', async () => {
    const bytes = new Uint8Array(1024 + 4);
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
    const file = new window.File([bytes], 'x.vectura');
    document.querySelector('.hg-preset-import').click();
    const input = clicked[0];
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    const spy = vi.spyOn(window.FileReader.prototype, 'readAsText');
    input.dispatchEvent(new window.Event('change'));
    expect(await waitFor(() => toasts().includes('Could not read .vectura file — invalid JSON.'))).toBe(true);
    expect(fullReads(spy, file.size).length).toBe(0);
  });

  test('(i) REGRESSION: non-Vectura JSON still toasts Invalid and rolls back', async () => {
    const before = app.engine.layers.length;
    app.ui.openVecturaFile(new window.File(['{"hello":1}'], 'x.vectura'));
    expect(await waitFor(() => toasts().includes('Invalid .vectura file'))).toBe(true);
    expect(app.engine.layers.length).toBe(before);
  });
});
