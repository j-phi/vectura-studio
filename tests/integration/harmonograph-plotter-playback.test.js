const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Regression + Phase-1 coverage for the harmonograph "Virtual Plotter".
 *
 * Original bug: the rAF loop accumulated a FLOAT playhead and draw() indexed
 * data.path[float] → undefined → toCanvas threw before the reschedule line,
 * so playback died after one frame ("Play does nothing").
 *
 * Phase 1 rebuilds playback: tick() advances a real-time CLOCK and
 * RE-EVALUATES the figure every frame via the pipeline-free HarmonographCore
 * (evolving loopDrift = a stand-in for the future LFO), at a capped sample
 * count, pushing NO undo history. The pen reveal loops continuously.
 *
 * Tests drive the real panel widget with a manually-pumped rAF queue so frame
 * timing is deterministic.
 */
describe('Harmonograph virtual plotter — Phase 1 playback', () => {
  let runtime, window, document, ui;
  let rafCbs;

  const flush = (ts) => {
    const cbs = rafCbs;
    rafCbs = [];
    cbs.forEach((cb) => cb(ts));
  };
  const pump = (frames, startTs = 1000, dt = 16) => {
    let ts = startTs;
    for (let i = 0; i < frames; i += 1) { ts += dt; flush(ts); }
    return ts;
  };

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    window.app.engine.addLayer('harmonograph');
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    ui = window.app.ui;

    rafCbs = [];
    window.requestAnimationFrame = (cb) => rafCbs.push(cb);
    window.cancelAnimationFrame = () => {};
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('the virtual plotter widget and its play button mount for a harmonograph layer', () => {
    expect(document.querySelector('.harmonograph-plotter')).toBeTruthy();
    expect(document.querySelector('.harmonograph-plotter-play')).toBeTruthy();
    const st = ui.harmonographPlotterState;
    expect(st).toBeTruthy();
    expect(typeof st.revealFrac).toBe('number');
    expect(st.liveData.path.length).toBeGreaterThan(1);
  });

  test('playback advances across many frames without crashing (float-index regression)', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    expect(ui.harmonographPlotterState.playing).toBe(true);

    expect(() => pump(40)).not.toThrow();

    const st = ui.harmonographPlotterState;
    expect(Number.isFinite(st.revealFrac)).toBe(true);
    expect(st.revealFrac).toBeGreaterThanOrEqual(0);
    expect(st.revealFrac).toBeLessThanOrEqual(1);
    expect(st.playbackClock).toBeGreaterThan(0); // the clock actually advanced
  });

  test('the pen reveal loops (wraps to the start) instead of stopping at the end', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    const st = ui.harmonographPlotterState;
    st.revealFrac = 0.99;            // just before the end
    pump(12, 2000);                  // enough to cross the wrap point
    expect(st.playing).toBe(true);   // still playing, not halted
    expect(st.revealFrac).toBeLessThan(0.9); // wrapped back toward the start
    expect(playBtn.textContent).toBe('Pause');
  });

  test('playback RE-EVALUATES the figure per frame at a CAPPED sample count', () => {
    const fullLen = ui.harmonographPlotterState.liveData.path.length; // idle = full res
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    pump(10);
    const live = ui.harmonographPlotterState.liveData;
    // Live preview is capped (LIVE_SAMPLE_CAP=1400 → ≤1401 vertices) and is
    // strictly cheaper than the full-resolution idle figure (default 6000).
    expect(live.path.length).toBeLessThanOrEqual(1401);
    expect(live.path.length).toBeLessThan(fullLen);
  });

  test('the live figure evolves over time (powers circle->snake; proves per-frame re-eval)', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    pump(10, 1000);
    const early = JSON.parse(JSON.stringify(ui.harmonographPlotterState.liveData.path));
    pump(120, 5000);
    const later = ui.harmonographPlotterState.liveData.path;
    // The evolving loopDrift must have changed the geometry between snapshots.
    expect(later).not.toEqual(early);
  });

  test('a Motion Rack patch (LFO assigned to a param) drives the live figure', () => {
    const layer = window.app.engine.getActiveLayer();
    // A sine LFO (synced, 1 cycle/loop) modulating overall scale by ±0.3.
    layer.params.scale = 0.5;
    layer.params.motion = {
      sources: [{ id: 's1', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, polarity: 'bi', enabled: true }],
      edges: [{ id: 'e1', sourceId: 's1', targetParamPath: 'scale', amount: 0.3 }],
    };
    const span = (data) => {
      const xs = data.path.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    const st = ui.harmonographPlotterState;

    st.playbackClock = 7.5; st.lastTs = 0; flush(1000); // sine peak → scale ≈ 0.8
    const spanPeak = span(st.liveData);
    st.playbackClock = 22.5; st.lastTs = 0; flush(1000); // sine trough → scale ≈ 0.2
    const spanTrough = span(st.liveData);

    // Scale modulation must visibly change the figure size between peak/trough.
    expect(spanPeak).toBeGreaterThan(spanTrough * 1.5);
  });

  test('playback pushes NO undo history (per-frame state is transient)', () => {
    let pushes = 0;
    const orig = window.app.pushHistory;
    if (typeof orig === 'function') {
      window.app.pushHistory = function (...args) { pushes += 1; return orig.apply(this, args); };
    }
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    pump(60);
    expect(pushes).toBe(0);
    if (typeof orig === 'function') window.app.pushHistory = orig;
  });

  test('scrubbing the reveal while idle does not throw and updates the fraction', () => {
    const range = document.querySelector('.harmonograph-plotter-range');
    range.value = String(Number(range.max) * 0.5);
    expect(() => range.dispatchEvent(new window.Event('input', { bubbles: true }))).not.toThrow();
    expect(ui.harmonographPlotterState.revealFrac).toBeCloseTo(0.5, 2);
  });
});
