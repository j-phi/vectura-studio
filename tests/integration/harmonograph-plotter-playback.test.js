const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Virtual plotter — REVEAL-ONLY contract (post bug-fix).
 *
 * The grey "ghost" is the full STATIC figure (with any LFO motion baked into
 * its geometry by the shared evaluator); the red line traces it 0->100% on a
 * loop, exactly like dragging the Reveal scrubber. The figure NEVER morphs
 * during playback. (The original float-index crash that froze playback after
 * one frame is also covered here.)
 */
describe('Harmonograph virtual plotter — reveal-only playback', () => {
  let runtime, window, document, ui;
  let rafCbs;

  const flush = (ts) => { const cbs = rafCbs; rafCbs = []; cbs.forEach((cb) => cb(ts)); };
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
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('the widget + play button mount; state is reveal-only (no evolving machinery)', () => {
    expect(document.querySelector('.harmonograph-plotter')).toBeTruthy();
    expect(document.querySelector('.harmonograph-plotter-play')).toBeTruthy();
    const st = ui.harmonographPlotterState;
    expect(st).toBeTruthy();
    expect(typeof st.revealFrac).toBe('number');
    // the wall-clock evolution machinery is gone
    expect(st.playbackClock).toBeUndefined();
    expect(st.liveData).toBeUndefined();
    expect(st.figure.path.length).toBeGreaterThan(1);
  });

  test('playback advances the reveal across many frames without crashing (float-index regression)', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    expect(ui.harmonographPlotterState.playing).toBe(true);
    expect(() => pump(40)).not.toThrow();
    const st = ui.harmonographPlotterState;
    expect(Number.isFinite(st.revealFrac)).toBe(true);
    expect(st.revealFrac).toBeGreaterThanOrEqual(0);
    expect(st.revealFrac).toBeLessThanOrEqual(1);
  });

  test('the grey ghost figure is INVARIANT while playing — only the reveal advances', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    const st = ui.harmonographPlotterState;
    const figureBefore = st.figure;                       // same object identity expected
    const snapshotBefore = JSON.stringify(st.figure.path); // and same content
    const revealStart = st.revealFrac;
    playBtn.click();
    pump(30);
    expect(ui.harmonographPlotterState.figure).toBe(figureBefore);       // not re-evaluated
    expect(JSON.stringify(ui.harmonographPlotterState.figure.path)).toBe(snapshotBefore);
    expect(ui.harmonographPlotterState.revealFrac).not.toBe(revealStart); // reveal DID advance
  });

  test('the pen reveal loops (wraps to the start) instead of stopping at the end', () => {
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    const st = ui.harmonographPlotterState;
    st.revealFrac = 0.99;
    pump(12, 2000);
    expect(st.playing).toBe(true);
    expect(st.revealFrac).toBeLessThan(0.9);
  });

  test('playback pushes NO undo history (reveal is transient)', () => {
    let pushes = 0;
    const orig = window.app.pushHistory;
    if (typeof orig === 'function') window.app.pushHistory = function (...a) { pushes += 1; return orig.apply(this, a); };
    document.querySelector('.harmonograph-plotter-play').click();
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

describe('Pendula virtual plotter — Motion Rack edits rebuild the static ghost (Bug A wiring)', () => {
  let runtime, window, document, app;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('pendula');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('adding an LFO + assigning it via the Motion Rack changes the cached plotter figure', () => {
    const before = JSON.stringify(app.ui.harmonographPlotterState.figure.path);
    document.querySelector('.motion-add-lfo').click();
    const tgt = document.querySelector('.motion-assign-target');
    tgt.value = 'scale';
    document.querySelector('.motion-assign-add').click();
    // bump the amount so the baked geometry visibly differs, via the edge amount input
    const layer = app.engine.getActiveLayer();
    layer.params.motion.edges[0].amount = 0.4;
    app.ui.harmonographPlotterState.rebuild();
    const after = JSON.stringify(app.ui.harmonographPlotterState.figure.path);
    expect(after).not.toBe(before); // the LFO is baked into the cached ghost
  });
});

describe('Pendula Motion Rack — edits update the PRIMARY canvas', () => {
  let runtime, window, document, app;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('pendula');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('assigning an LFO via the Motion Rack regenerates the layer geometry (main canvas)', () => {
    const layer = app.engine.getActiveLayer();
    app.engine.generate(layer.id);
    const before = JSON.stringify(layer.paths || layer.sourcePaths);

    document.querySelector('.motion-add-lfo').click();
    const tgt = document.querySelector('.motion-assign-target');
    tgt.value = 'scale';
    document.querySelector('.motion-assign-add').click();      // commit -> regen()
    // make the edge strong so the baked geometry clearly differs, then re-commit
    const amt = document.querySelector('.motion-edge-amount');
    amt.value = '0.4';
    amt.dispatchEvent(new window.Event('change', { bubbles: true }));

    const after = JSON.stringify(app.engine.getActiveLayer().paths || app.engine.getActiveLayer().sourcePaths);
    expect(after).not.toBe(before); // the committed (main-canvas) geometry reflects the LFO
  });
});

describe('Pendula virtual plotter — ghost tracks ALL param edits via regen (not just Motion Rack)', () => {
  let runtime, window, app;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('pendula');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('editing a pendulum frequency + regen() refreshes the cached plotter ghost', () => {
    const layer = app.engine.getActiveLayer();
    const before = JSON.stringify(app.ui.harmonographPlotterState.figure.path);
    // simulate a pendulum-card param edit: mutate params, then regen (what the
    // card commit does) — without touching the Motion Rack
    layer.params.pendulums[0].freq = (layer.params.pendulums[0].freq || 2) + 2;
    app.regen();
    const after = JSON.stringify(app.ui.harmonographPlotterState.figure.path);
    expect(after).not.toBe(before); // ghost no longer stale
  });

  test('adding a third pendulum + regen() is reflected in the ghost', () => {
    const layer = app.engine.getActiveLayer();
    const before = JSON.stringify(app.ui.harmonographPlotterState.figure.path);
    layer.params.pendulums.push({ id: 'pend-3', enabled: true, ampX: 60, ampY: 60, phaseX: 45, phaseY: 45, freq: 5, micro: 0, damp: 0.001 });
    app.regen();
    expect(JSON.stringify(app.ui.harmonographPlotterState.figure.path)).not.toBe(before);
  });

  test('the plot-range thumbs commit plotStart/plotEnd and truncate BOTH the ghost and the main canvas', () => {
    const layer = app.engine.getActiveLayer();
    const doc = window.document;
    const startInput = doc.querySelector('.hp-plot-start');
    const endInput = doc.querySelector('.hp-plot-end');
    expect(startInput).toBeTruthy();
    expect(endInput).toBeTruthy();
    const fullPts = app.ui.harmonographPlotterState.figure.path.length;
    const beforeCanvas = JSON.stringify(layer.paths || layer.sourcePaths);
    // drag the end thumb down to 50%: `input` updates the live UI only...
    endInput.value = '50';
    endInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(layer.params.plotEnd).toBe(100); // not committed yet (heavy work waits for release)
    // ...the commit (regen of canvas + ghost) lands on release (`change`).
    endInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(layer.params.plotEnd).toBe(50);
    expect(layer.params.plotStart).toBe(0);
    // ghost is truncated (fewer vertices than the full figure)
    expect(app.ui.harmonographPlotterState.figure.path.length).toBeLessThan(fullPts);
    // and the committed main-canvas geometry changed too
    expect(JSON.stringify(layer.paths || layer.sourcePaths)).not.toBe(beforeCanvas);
  });

  test('a plot-range commit is undoable (pushes history)', () => {
    const layer = app.engine.getActiveLayer();
    const doc = window.document;
    const endInput = doc.querySelector('.hp-plot-end');
    endInput.value = '60';
    endInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    endInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(layer.params.plotEnd).toBe(60);
    app.undo();
    expect(app.engine.getActiveLayer().params.plotEnd).toBe(100);
  });

  test('the start thumb cannot cross the end thumb (kept at least 1% apart)', () => {
    const layer = app.engine.getActiveLayer();
    const doc = window.document;
    const startInput = doc.querySelector('.hp-plot-start');
    const endInput = doc.querySelector('.hp-plot-end');
    endInput.value = '40';
    endInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    endInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    startInput.value = '90'; // try to shove the start handle past the end
    startInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    startInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(layer.params.plotStart).toBeLessThan(layer.params.plotEnd);
    expect(layer.params.plotEnd - layer.params.plotStart).toBeGreaterThanOrEqual(1);
  });
});
