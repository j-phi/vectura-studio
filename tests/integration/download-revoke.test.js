/*
 * TUX-054 — downloads and export save on iOS.
 *
 * Every file save goes through Vectura.Download.saveBlob (src/ui/download-blob.js):
 *   - the blob URL is revoked no sooner than REVOKE_DELAY_MS (30 s) after click(),
 *   - on a coarse-pointer device that can share files, the share sheet opens
 *     directly (synchronously, inside the user gesture) instead of an anchor download,
 *   - the success toast appears only after the save ran ('shared' / 'downloaded'),
 *     and never after the user cancelled the share sheet.
 *
 * Timers: the runtime runs inside a jsdom vm context whose setTimeout is jsdom's,
 * not the host's, so vi.useFakeTimers() cannot reach it. A small manual clock is
 * installed on window.setTimeout / clearTimeout instead.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('TUX-054 — blob download lifetime + share sheet', () => {
  let runtime, window, document, app;
  let clicks, blobs, revoked, shareCalls, timers, clockNow, timerId;

  const advance = (ms) => {
    clockNow += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= clockNow).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
    }
  };

  const setNav = (name, value) => {
    Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true });
  };

  // Configure the simulated platform. coarse: (pointer: coarse) matches.
  const platform = ({ coarse = false, canShare = false, share = null } = {}) => {
    window.matchMedia = (query) => ({
      matches: /pointer:\s*coarse/.test(query) ? coarse : false,
      media: query,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; },
    });
    setNav('canShare', canShare ? () => true : undefined);
    setNav('share', share || undefined);
  };

  const toastHost = () => document.getElementById('vectura-toast-host');
  const successToasts = () =>
    Array.from(toastHost()?.querySelectorAll('.vectura-toast-success') || []).map((el) => el.textContent);

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('pendula');
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  beforeEach(() => {
    clicks = []; blobs = []; revoked = []; shareCalls = [];
    timers = []; clockNow = 0; timerId = 0;
    window.setTimeout = (fn, ms = 0) => { timers.push({ id: ++timerId, fn, at: clockNow + (ms || 0) }); return timerId; };
    window.clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
    window.URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:test/${blobs.length}`; };
    window.URL.revokeObjectURL = (url) => { revoked.push(url); };
    window.HTMLAnchorElement.prototype.click = function click() {
      clicks.push({ href: this.href, download: this.download });
    };
    if (toastHost()) toastHost().innerHTML = '';
    window.Vectura.SETTINGS.devMode = false;
    platform({});
  });

  describe('anchor path: revoke is deferred to 30 s', () => {
    const cases = [
      { label: 'saveVecturaFile', filename: /^vectura-\d{4}-\d{2}-\d{2}\.vectura$/, type: 'application/json',
        run: () => app.ui.saveVecturaFile() },
      { label: 'exportSVG', filename: /^vectura\.svg$/, type: 'image/svg+xml',
        run: () => app.ui.exportSVG() },
      { label: 'exportAnimatedSVG', filename: /^vectura-animated\.svg$/, type: 'image/svg+xml',
        run: () => app.ui.exportAnimatedSVG() },
      { label: 'PresetBundle.download', filename: /^vectura-presets-x\.json$/, type: 'application/json',
        run: () => window.Vectura.PresetBundle.download('x') },
      { label: 'downloadJsonPayload', filename: /^p\.json$/, type: 'application/json',
        run: () => app.ui.downloadJsonPayload({}, 'p.json') },
      { label: '_downloadPatternSvg', filename: /^pat\.svg$/, type: 'image/svg+xml',
        run: () => app.ui._downloadPatternSvg('pat', '<svg/>') },
      { label: 'harmonograph gallery: set as default', filename: /\.vectura$/, type: 'application/json',
        run: () => {
          window.Vectura.SETTINGS.devMode = true;
          app.ui.renderLayers();
          app.ui.buildControls();
          const btn = document.querySelector('.hg-preset-set-default');
          if (!btn) throw new Error('set-default button not rendered');
          btn.click();
        } },
      { label: 'harmonograph gallery: repo export fallback', filename: /\.vectura$/, type: 'application/json',
        run: () => {
          window.Vectura.SETTINGS.devMode = true;
          const Modal = window.Vectura.UI.PresetSaveModal;
          let captured = null;
          const origOpen = Modal.open;
          Modal.open = (opts) => { captured = opts; };
          app.ui.renderLayers();
          app.ui.buildControls();
          document.querySelector('.hg-preset-save-pip').click();
          Modal.open = origOpen;
          if (!captured) throw new Error('save modal did not open');
          captured.onConfirm({ name: 'Tux Test', mode: 'new', destination: 'repo', group: 'User' });
        } },
    ];

    cases.forEach(({ label, filename, type, run }) => {
      test(`${label}: click fires, blob typed, revoke only after 30 000 ms`, () => {
        run();
        expect(clicks).toHaveLength(1);
        expect(clicks[0].download).toMatch(filename);
        expect(blobs).toHaveLength(1);
        expect(blobs[0].type).toBe(type);
        expect(revoked).toHaveLength(0);          // (c) not synchronous
        advance(29999);
        expect(revoked).toHaveLength(0);          // (d) still alive at 29.999 s
        advance(1);
        expect(revoked).toEqual([clicks[0].href]); // (e) revoked once, same URL
      });
    });

    test('PresetBundle.download keeps its synchronous boolean contract and reports the result', async () => {
      const results = [];
      const started = window.Vectura.PresetBundle.download('y', { onResult: (r) => results.push(r) });
      expect(started).toBe(true);
      await flush();
      expect(results).toEqual(['downloaded']);
    });
  });

  describe('share path (coarse pointer + canShare + share)', () => {
    test('resolve: share called synchronously with one correctly named File; no anchor; toast after flush', async () => {
      platform({ coarse: true, canShare: true, share: (data) => { shareCalls.push(data); return Promise.resolve(); } });
      app.ui.exportSVG();
      expect(shareCalls).toHaveLength(1);                // synchronous: before any await
      expect(shareCalls[0].files).toHaveLength(1);
      const file = shareCalls[0].files[0];
      expect(file.name).toBe('vectura.svg');
      expect(file.type).toBe('image/svg+xml');
      expect(clicks).toHaveLength(0);
      expect(blobs).toHaveLength(0);
      await flush();
      expect(successToasts().join('|')).toMatch(/Exported vectura\.svg/);
    });

    test('saveVecturaFile shares a .vectura File typed application/json', async () => {
      platform({ coarse: true, canShare: true, share: (data) => { shareCalls.push(data); return Promise.resolve(); } });
      app.ui.saveVecturaFile();
      expect(shareCalls).toHaveLength(1);
      expect(shareCalls[0].files[0].name).toMatch(/^vectura-\d{4}-\d{2}-\d{2}\.vectura$/);
      expect(shareCalls[0].files[0].type).toBe('application/json');
      await flush();
      expect(successToasts().join('|')).toMatch(/Saved vectura-/);
    });

    test('AbortError: no anchor click, no success toast', async () => {
      platform({ coarse: true, canShare: true,
        share: () => Promise.reject(new window.DOMException('cancelled', 'AbortError')) });
      app.ui.saveVecturaFile();
      await flush();
      expect(clicks).toHaveLength(0);
      expect(successToasts()).toHaveLength(0);
      expect(toastHost()?.querySelectorAll('.vectura-toast-danger').length || 0).toBe(0);
    });

    test('NotAllowedError: falls back to the anchor download, revokes after 30 s, then toasts', async () => {
      platform({ coarse: true, canShare: true,
        share: () => Promise.reject(new window.DOMException('no gesture', 'NotAllowedError')) });
      app.ui.exportSVG();
      await flush();
      expect(clicks).toHaveLength(1);
      expect(clicks[0].download).toBe('vectura.svg');
      expect(revoked).toHaveLength(0);
      expect(successToasts().join('|')).toMatch(/Exported vectura\.svg/);
      advance(30000);
      expect(revoked).toHaveLength(1);
    });

    test('PresetBundle.download shares the bundle and keeps the boolean return', async () => {
      platform({ coarse: true, canShare: true, share: (data) => { shareCalls.push(data); return Promise.resolve(); } });
      const results = [];
      expect(window.Vectura.PresetBundle.download('z', { onResult: (r) => results.push(r) })).toBe(true);
      expect(shareCalls).toHaveLength(1);
      expect(shareCalls[0].files[0].name).toBe('vectura-presets-z.json');
      await flush();
      expect(results).toEqual(['shared']);
    });
  });

  describe('D6 parity: desktop keeps the anchor path', () => {
    test('canShare true + share present but FINE pointer: share not called, anchor used', async () => {
      platform({ coarse: false, canShare: true, share: (data) => { shareCalls.push(data); return Promise.resolve(); } });
      app.ui.exportSVG();
      expect(shareCalls).toHaveLength(0);
      expect(clicks).toHaveLength(1);
      await flush();
      expect(successToasts().join('|')).toMatch(/Exported vectura\.svg/);
    });

    test('coarse pointer + canShare true but navigator.share undefined: anchor used', async () => {
      platform({ coarse: true, canShare: true, share: null });
      app.ui.exportSVG();
      expect(clicks).toHaveLength(1);
      await flush();
      expect(successToasts().join('|')).toMatch(/Exported vectura\.svg/);
    });

    test('coarse pointer + share present but canShare missing: anchor used', () => {
      platform({ coarse: true, canShare: false, share: (data) => { shareCalls.push(data); return Promise.resolve(); } });
      app.ui.exportSVG();
      expect(shareCalls).toHaveLength(0);
      expect(clicks).toHaveLength(1);
    });
  });
});
