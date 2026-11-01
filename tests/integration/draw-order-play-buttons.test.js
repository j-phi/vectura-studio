/*
 * Regression: explicit Play buttons for the plot-order preview.
 *   1. The main-canvas Draw Order pane has a Play button (#draw-order-play)
 *      right of the % readout. At 100% it restarts the reveal from 0; below
 *      100% it plays on from the current position; while playing it pauses.
 *      The button flips to a pause glyph (`is-playing`) while the sweep runs.
 *   2. The Export SVG modal's "Line Sort Print Order" legend has a Play button
 *      (#export-legend-play) that animates the export preview path-by-path in
 *      line-sort order (exportModalState.playProgress 0→1, then back to null =
 *      full preview), with a pause toggle and a playhead on the gradient.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Plot-order Play buttons (Draw Order pane + Export Line Sort legend)', () => {
  let runtime, window, document, app;
  let rafCbs;

  const flush = (ts) => { const cbs = rafCbs; rafCbs = []; cbs.forEach((cb) => cb(ts)); };
  const pump = (frames, startTs = 1000, dt = 16) => {
    let ts = startTs;
    for (let i = 0; i < frames; i += 1) { ts += dt; flush(ts); }
    return ts;
  };
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    rafCbs = [];
    let nextId = 1;
    const live = new Map();
    window.requestAnimationFrame = (cb) => { const id = nextId++; live.set(id, cb); rafCbs.push((ts) => { if (live.has(id)) { live.delete(id); cb(ts); } }); return id; };
    window.cancelAnimationFrame = (id) => { live.delete(id); };
    window.app = new window.Vectura.App();
    window.app.engine.addLayer('wavetable');
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    app = window.app;
  });

  afterEach(() => {
    if (app?.ui?.modal?.overlay?.classList?.contains?.('open')) app.ui.closeModal?.();
    runtime?.cleanup?.();
    runtime = null;
  });

  describe('Draw Order pane', () => {
    test('a Play button sits immediately right of the % readout', () => {
      const btn = document.getElementById('draw-order-play');
      expect(btn).toBeTruthy();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.previousElementSibling?.id).toBe('draw-order-value');
      expect(btn.getAttribute('aria-label')).toMatch(/play/i);
    });

    test('at 100% Play restarts the reveal from the start and sweeps forward', () => {
      const btn = document.getElementById('draw-order-play');
      expect(app.renderer.drawProgress).toBe(1);
      click(btn);
      pump(1);
      expect(app.renderer.drawProgress).toBeLessThan(0.1);
      expect(btn.classList.contains('is-playing')).toBe(true);
      pump(20);
      expect(app.renderer.drawProgress).toBeGreaterThan(0.05);
      pump(200);
      expect(app.renderer.drawProgress).toBe(1);
      expect(btn.classList.contains('is-playing')).toBe(false);
    });

    test('clicking Play while playing pauses; clicking again resumes from there', () => {
      const btn = document.getElementById('draw-order-play');
      click(btn);
      let ts = pump(30);
      click(btn);
      expect(btn.classList.contains('is-playing')).toBe(false);
      const paused = app.renderer.drawProgress;
      expect(paused).toBeGreaterThan(0);
      expect(paused).toBeLessThan(1);
      ts = pump(30, ts);
      expect(app.renderer.drawProgress).toBe(paused);
      click(btn);
      pump(10, ts);
      expect(app.renderer.drawProgress).toBeGreaterThan(paused);
    });
  });

  describe('Export SVG Line Sort legend', () => {
    const openExport = () => {
      app.ui.openExportModal({ section: 'linesort' });
      return app.ui.exportModalState;
    };

    test('the legend carries a Play button next to its gear', () => {
      openExport();
      const btn = document.getElementById('export-legend-play');
      expect(btn).toBeTruthy();
      expect(btn.getAttribute('aria-label')).toMatch(/play/i);
      expect(document.getElementById('export-preview-legend-playhead')).toBeTruthy();
    });

    test('Play animates playProgress 0→1 then returns to the full preview', () => {
      const state = openExport();
      const btn = document.getElementById('export-legend-play');
      expect(state.playProgress ?? null).toBe(null);
      click(btn);
      expect(btn.classList.contains('is-playing')).toBe(true);
      pump(5);
      expect(state.playProgress).toBeGreaterThan(0);
      expect(state.playProgress).toBeLessThan(1);
      pump(200);
      expect(state.playProgress).toBe(null);
      expect(btn.classList.contains('is-playing')).toBe(false);
    });

    test('Play toggles to pause mid-sweep and holds its position', () => {
      const state = openExport();
      const btn = document.getElementById('export-legend-play');
      click(btn);
      let ts = pump(20);
      click(btn);
      const held = state.playProgress;
      expect(held).toBeGreaterThan(0);
      expect(held).toBeLessThan(1);
      expect(btn.classList.contains('is-playing')).toBe(false);
      pump(20, ts);
      expect(state.playProgress).toBe(held);
    });

    test('reveal count maps progress onto the ordered path list', () => {
      const count = app.ui.getExportPlayRevealCount;
      expect(typeof count).toBe('function');
      expect(count(100, null)).toBe(100);
      expect(count(100, 0)).toBe(0);
      expect(count(100, 0.5)).toBe(50);
      expect(count(100, 1)).toBe(100);
      expect(count(3, 0.01)).toBe(1);
    });

    test('closing the modal cancels an in-flight playback', () => {
      openExport();
      click(document.getElementById('export-legend-play'));
      pump(3);
      app.ui.closeModal();
      expect(() => pump(5)).not.toThrow();
      expect(app.ui.exportModalState).toBe(null);
    });
  });
});
