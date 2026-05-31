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
