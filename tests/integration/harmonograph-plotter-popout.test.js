const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Virtual plotter — pop-out / pop-in / drag / resize affordance.
 *
 * The Virtual Plotter widget (`.harmonograph-plotter`) can be detached from the
 * algorithm panel into a floating, draggable, resizable window
 * (`#harmonograph-plotter-float`) over the canvas, then re-docked. The SAME
 * wrapper DOM node is moved (so playback state/handlers persist); only the
 * canvas backing store is resized. Popped state survives `buildControls()`
 * re-mounts so a structural panel rebuild (dice / add pendulum / preset) does
 * not orphan the float.
 */
describe('Harmonograph virtual plotter — pop-out / pop-in', () => {
  let runtime, window, document, app, ui;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('harmonograph');
    app.ui.renderLayers();
    app.ui.buildControls();
    ui = app.ui;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('a pop-out button exists in the plotter header while docked', () => {
    const head = document.querySelector('.harmonograph-plotter-head');
    expect(head).toBeTruthy();
    const popOut = head.querySelector('.harmonograph-plotter-popout');
    expect(popOut).toBeTruthy();
    // docked → no float container yet, no pop-in affordance in the header
    expect(document.querySelector('#harmonograph-plotter-float')).toBeFalsy();
    expect(ui.harmonographPlotterPopped).toBeFalsy();
  });

  test('clicking pop-out moves the plotter into a fixed float container', () => {
    const popOut = document.querySelector('.harmonograph-plotter-popout');
    popOut.click();
    const float = document.querySelector('#harmonograph-plotter-float');
    expect(float).toBeTruthy();
    expect(float.style.position).toBe('fixed');
    const plotter = document.querySelector('.harmonograph-plotter');
    // the SAME wrapper now lives inside the float, not the panel
    expect(float.contains(plotter)).toBe(true);
    expect(ui.harmonographPlotterPopped).toBeTruthy();
    // a pop-in affordance is now present
    expect(document.querySelector('.harmonograph-plotter-popin')).toBeTruthy();
  });

  test('a placeholder is left in the panel when popped out', () => {
    document.querySelector('.harmonograph-plotter-popout').click();
    const placeholder = document.querySelector('.harmonograph-plotter-placeholder');
    expect(placeholder).toBeTruthy();
    // placeholder offers a way to pop back in
    expect(placeholder.querySelector('.harmonograph-plotter-popin')).toBeTruthy();
  });

  test('clicking pop-in restores the plotter to the panel and removes the float', () => {
    document.querySelector('.harmonograph-plotter-popout').click();
    expect(document.querySelector('#harmonograph-plotter-float')).toBeTruthy();
    // use the header pop-in button on the floated wrapper
    document.querySelector('.harmonograph-plotter-popin').click();
    expect(document.querySelector('#harmonograph-plotter-float')).toBeFalsy();
    expect(ui.harmonographPlotterPopped).toBeFalsy();
    const plotter = document.querySelector('.harmonograph-plotter');
    expect(plotter).toBeTruthy();
    expect(plotter.closest('#harmonograph-plotter-float')).toBeFalsy();
    // placeholder is gone too
    expect(document.querySelector('.harmonograph-plotter-placeholder')).toBeFalsy();
  });

  test('popped state survives a buildControls() re-mount (figure stays floated)', () => {
    document.querySelector('.harmonograph-plotter-popout').click();
    expect(ui.harmonographPlotterPopped).toBeTruthy();
    // a structural rebuild (what dice / add-pendulum / preset trigger)
    app.ui.buildControls();
    expect(ui.harmonographPlotterPopped).toBeTruthy();
    const float = document.querySelector('#harmonograph-plotter-float');
    expect(float).toBeTruthy();
    const plotter = document.querySelector('.harmonograph-plotter');
    expect(float.contains(plotter)).toBe(true);
    // exactly one plotter survives — the re-float must not duplicate it
    expect(document.querySelectorAll('.harmonograph-plotter').length).toBe(1);
    // and exactly one float container
    expect(document.querySelectorAll('#harmonograph-plotter-float').length).toBe(1);
  });

  test('dragging the header moves the float', () => {
    document.querySelector('.harmonograph-plotter-popout').click();
    const float = document.querySelector('#harmonograph-plotter-float');
    float.style.left = '300px';
    float.style.top = '120px';
    const head = document.querySelector('.harmonograph-plotter-head');
    const down = new window.Event('pointerdown', { bubbles: true });
    down.clientX = 320; down.clientY = 140;
    head.dispatchEvent(down);
    const move = new window.Event('pointermove', { bubbles: true });
    move.clientX = 420; move.clientY = 200;
    window.dispatchEvent(move);
    const up = new window.Event('pointerup', { bubbles: true });
    window.dispatchEvent(up);
    expect(parseFloat(float.style.left)).toBeCloseTo(400, 0);
    expect(parseFloat(float.style.top)).toBeCloseTo(180, 0);
  });

  test('dragging does NOT start from the play / pop-in buttons', () => {
    document.querySelector('.harmonograph-plotter-popout').click();
    const float = document.querySelector('#harmonograph-plotter-float');
    float.style.left = '300px';
    float.style.top = '120px';
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    const down = new window.Event('pointerdown', { bubbles: true });
    down.clientX = 320; down.clientY = 140;
    // dispatch on the play button (bubbles into the header)
    playBtn.dispatchEvent(down);
    const move = new window.Event('pointermove', { bubbles: true });
    move.clientX = 500; move.clientY = 400;
    window.dispatchEvent(move);
    window.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
    // unchanged — the button press should not have armed the drag
    expect(parseFloat(float.style.left)).toBeCloseTo(300, 0);
    expect(parseFloat(float.style.top)).toBeCloseTo(120, 0);
  });

  test('setPlotterSize updates the canvas backing store', () => {
    const canvas = document.querySelector('.harmonograph-plotter-canvas');
    const before = canvas.width;
    const fn = ui.harmonographPlotterState.setPlotterSize;
    expect(typeof fn).toBe('function');
    fn(400);
    expect(canvas.width).not.toBe(before);
    expect(canvas.width).toBeGreaterThanOrEqual(400);
    expect(canvas.height).toBe(canvas.width);
  });

  test('pop-out / pop-in pushes NO undo history (view-only affordance)', () => {
    let pushes = 0;
    const orig = app.pushHistory;
    if (typeof orig === 'function') app.pushHistory = function (...a) { pushes += 1; return orig.apply(this, a); };
    document.querySelector('.harmonograph-plotter-popout').click();
    document.querySelector('.harmonograph-plotter-popin').click();
    expect(pushes).toBe(0);
    if (typeof orig === 'function') app.pushHistory = orig;
  });

  test('popped plotter still plays back (handlers persist across the move)', () => {
    const rafCbs = [];
    window.requestAnimationFrame = (cb) => rafCbs.push(cb);
    window.cancelAnimationFrame = () => {};
    document.querySelector('.harmonograph-plotter-popout').click();
    const playBtn = document.querySelector('.harmonograph-plotter-play');
    playBtn.click();
    expect(ui.harmonographPlotterState.playing).toBe(true);
    // pump a couple of frames
    let ts = 1000;
    for (let i = 0; i < 5; i += 1) { ts += 16; const cbs = rafCbs.splice(0); cbs.forEach((cb) => cb(ts)); }
    expect(Number.isFinite(ui.harmonographPlotterState.revealFrac)).toBe(true);
  });

  test('pop-in restores the plotter into its panel slot (above Pendulum Guides, not at the bottom)', () => {
    document.querySelector('.harmonograph-plotter-popout').click();
    // pop back in via the header button
    document.querySelector('.harmonograph-plotter-popin').click();
    const plotter = document.querySelector('.harmonograph-plotter');
    expect(plotter).toBeTruthy();
    expect(plotter.closest('#harmonograph-plotter-float')).toBeFalsy(); // docked
    // The plotter is restored to its ORIGINAL slot (before the Pendulum Guides
    // section + everything after it), so it must have a following sibling — the
    // old appendChild bug docked it at the very bottom of the panel with none.
    expect(plotter.nextElementSibling).toBeTruthy();
  });

  test('re-floating across rebuilds disconnects the prior ResizeObserver (no per-rebuild leak)', () => {
    // jsdom has no ResizeObserver — install a counting fake so we can assert the
    // observer is disconnected (not accumulated) on each re-mount while popped.
    let connects = 0;
    let disconnects = 0;
    window.ResizeObserver = class {
      observe() { connects += 1; }
      disconnect() { disconnects += 1; }
      unobserve() {}
    };
    // re-mount so the plotter's observe path picks up the fake
    app.ui.buildControls();
    document.querySelector('.harmonograph-plotter-popout').click(); // pop out → 1 observe
    app.ui.buildControls(); // re-float → disconnect prior + 1 observe
    app.ui.buildControls(); // re-float → disconnect prior + 1 observe
    // every superseded observer was disconnected; at most one is live.
    expect(disconnects).toBeGreaterThanOrEqual(connects - 1);
    expect(connects - disconnects).toBeLessThanOrEqual(1);
  });
});
