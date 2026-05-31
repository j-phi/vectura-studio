const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Regression coverage for the harmonograph "Virtual Plotter" play button.
 *
 * Bug (pre-fix): the rAF tick accumulates `state.playhead` as a FLOAT, but
 * draw() used it directly as an array index — `data.path[limit]` where
 * limit ≈ 27.3 → undefined → `toCanvas(undefined)` throws
 * "Cannot read properties of undefined (reading 'x')". The throw happens
 * before the requestAnimationFrame reschedule line, so the loop dies after
 * one frame and the playhead freezes. To the user, "Play does nothing."
 *
 * These tests drive the real panel widget (UI.mountHarmonographPlotter via
 * buildControls) with a manually-pumped rAF queue so frame timing is
 * deterministic.
 */
describe('Harmonograph virtual plotter — playback', () => {
  let runtime, window, document, ui, plotterState;
  let rafCbs;

  const flush = (ts) => {
    const cbs = rafCbs;
    rafCbs = [];
    cbs.forEach((cb) => cb(ts));
  };

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    window.app.engine.addLayer('harmonograph');
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    ui = window.app.ui;

    // Deterministic, manually-pumped animation frame queue.
    rafCbs = [];
    window.requestAnimationFrame = (cb) => rafCbs.push(cb);
    window.cancelAnimationFrame = () => {};

    plotterState = ui.harmonographPlotterState;
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('the virtual plotter widget and its play button mount for a harmonograph layer', () => {
    expect(document.querySelector('.harmonograph-plotter')).toBeTruthy();
    expect(document.querySelector('.harmonograph-plotter-play')).toBeTruthy();
    expect(plotterState).toBeTruthy();
    expect(plotterState.maxPlayhead).toBeGreaterThan(0);
  });

  test('playback advances across many frames without crashing (float-index regression)', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click(); // start playing → schedules first tick
    expect(ui.harmonographPlotterState.playing).toBe(true);

    // Pump ~40 frames at ~16ms each. Pre-fix this throws on the 2nd frame
    // (playhead becomes a float and indexes past the array).
    let ts = 1000;
    expect(() => {
      for (let i = 0; i < 40; i += 1) {
        ts += 16;
        flush(ts);
      }
    }).not.toThrow();

    const st = ui.harmonographPlotterState;
    expect(Number.isFinite(st.playhead)).toBe(true);
    // It should have advanced well past the first frame, not frozen.
    expect(st.playhead).toBeGreaterThan(20);
  });

  test('playback loops at the end instead of stopping', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    const st = ui.harmonographPlotterState;

    // Jump near the end, then advance past it.
    st.playhead = st.maxPlayhead - 0.5;
    let ts = 2000;
    for (let i = 0; i < 6; i += 1) {
      ts += 16;
      flush(ts);
    }

    // Looping: still playing, and the playhead wrapped back toward the start.
    expect(st.playing).toBe(true);
    expect(st.playhead).toBeLessThan(st.maxPlayhead);
    expect(playBtn.textContent).toBe('Pause');
  });
});
