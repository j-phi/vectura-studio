/*
 * Regression: three Draw-Order slider behaviors requested together.
 *   1. Holding Shift while dragging switches the handle's snap granularity from
 *      whole percent to tenths of a percent (the browser reads the `step`
 *      attribute live on every pointermove during a native range drag, so
 *      toggling it from the tracked modifier key is enough).
 *   2. Below 100% the thumb swaps from the plain circle to a rounded "play"
 *      triangle (Renderer.updateDrawOrderThumbShape), styled with the same
 *      halo/fill via a baked inline-SVG background-image + `is-progress` class.
 *   3. A click that never drags the playhead (pointerdown -> pointerup with no
 *      meaningful movement) starts a plot-order playback sweep toward 100%;
 *      an actual drag (movement past the threshold) does not.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Draw-Order slider: shift-drag tenths, play-triangle head, click-to-play', () => {
  let runtime, window, document, app, slider;
  let rafCbs;

  const flush = (ts) => { const cbs = rafCbs; rafCbs = []; cbs.forEach((cb) => cb(ts)); };
  const pump = (frames, startTs = 1000, dt = 16) => {
    let ts = startTs;
    for (let i = 0; i < frames; i += 1) { ts += dt; flush(ts); }
    return ts;
  };
  const setValue = (v) => {
    slider.value = String(v);
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
  };

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    rafCbs = [];
    window.requestAnimationFrame = (cb) => { rafCbs.push(cb); return rafCbs.length; };
    window.cancelAnimationFrame = () => {};
    window.app = new window.Vectura.App();
    window.app.engine.addLayer('wavetable');
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
    app = window.app;
    slider = document.getElementById('draw-order-input');
  });

  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('Shift held on pointerdown switches the drag step to tenths of a percent', () => {
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, shiftKey: true }));
    expect(slider.step).toBe('0.1');
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));
  });

  test('without Shift the drag step stays whole percent', () => {
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, shiftKey: false }));
    expect(slider.step).toBe('1');
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));
  });

  test('toggling Shift mid-drag updates the step live', () => {
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, shiftKey: false }));
    expect(slider.step).toBe('1');
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 0, shiftKey: true }));
    expect(slider.step).toBe('0.1');
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 25, clientY: 0, shiftKey: false }));
    expect(slider.step).toBe('1');
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 25, clientY: 0 }));
  });

  test('the step resets to whole-percent once an actual drag ends', () => {
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, shiftKey: true }));
    expect(slider.step).toBe('0.1');
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 20, clientY: 0, shiftKey: true }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 20, clientY: 0 }));
    // A real drag (unlike a stationary Shift-click, which starts fine-speed
    // playback and deliberately keeps step at '0.1' for its duration) always
    // leaves the default whole-percent step behind for future interactions.
    expect(slider.step).toBe('1');
  });

  test('below 100% the handle becomes a rounded play triangle; at 100% it is the plain circle', () => {
    setValue(63.4);
    expect(slider.classList.contains('is-progress')).toBe(true);
    const icon = slider.style.getPropertyValue('--draw-order-thumb-icon');
    expect(icon).toContain('data:image/svg+xml');

    setValue(100);
    expect(slider.classList.contains('is-progress')).toBe(false);
  });

  test('the readout shows tenths-of-a-percent precision from a fine drag', () => {
    setValue(63.4);
    expect(document.getElementById('draw-order-value').textContent).toBe('63.4%');
  });

  test('a click that never drags the playhead starts plot-order playback', () => {
    setValue(20);
    expect(app.renderer.drawProgress).toBeCloseTo(0.2, 5);

    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 5 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 50, clientY: 5 }));

    pump(10);
    expect(app.renderer.drawProgress).toBeGreaterThan(0.2);
  });

  test('dragging the playhead (movement past the threshold) does not start playback', () => {
    setValue(20);
    expect(app.renderer.drawProgress).toBeCloseTo(0.2, 5);

    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 0 }));
    setValue(55);
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 0 }));

    // No playback kicked in — the value stays exactly where the (manual, in
    // this harness) drag left it instead of drifting toward 100%.
    pump(10);
    expect(app.renderer.drawProgress).toBeCloseTo(0.55, 5);
  });

  test('actually dragging the playhead clears any canvas selection (scrubbing previews the whole document)', () => {
    const layerId = app.engine.layers[0].id;
    app.renderer.setSelection([layerId], layerId);
    expect(app.renderer.selectedLayerIds.size).toBe(1);

    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    // Still just a press — selection survives until real movement is seen.
    expect(app.renderer.selectedLayerIds.size).toBe(1);
    window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 0 }));
    expect(app.renderer.selectedLayerIds.size).toBe(0);
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 0 }));
  });

  test('a click-to-play (no drag) leaves the canvas selection alone', () => {
    const layerId = app.engine.layers[0].id;
    app.renderer.setSelection([layerId], layerId);

    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));

    expect(app.renderer.selectedLayerIds.size).toBe(1);
  });

  test('starting a new interaction cancels any in-flight playback', () => {
    setValue(10);
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));

    // The click above queued a playback tick synchronously (cancelAnimationFrame
    // hasn't run yet); a fresh pointerdown must cancel it before anything pumps.
    let cancelled = false;
    window.cancelAnimationFrame = () => { cancelled = true; };
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(cancelled).toBe(true);
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));
  });

  test('Shift-click plays back at 1/10 the normal speed, and the readout still shows tenths', () => {
    setValue(0);
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, shiftKey: true }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));
    // 19 non-baseline frames * 16ms ≈ 304ms. Normal rate (35%/s) would net ~10.6%;
    // Shift's 1/10 rate (3.5%/s) nets ~1.06% — well under half of the normal figure.
    pump(20);

    expect(app.renderer.drawProgress).toBeGreaterThan(0);
    expect(app.renderer.drawProgress).toBeCloseTo(0.0106, 2);
    expect(document.getElementById('draw-order-value').textContent).toMatch(/^\d+\.\d%$/);
  });

  test('Shift-click playback keeps advancing over many frames instead of sticking at its first tick', () => {
    setValue(0);
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, shiftKey: true }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));

    pump(20);
    const first = app.renderer.drawProgress;
    expect(first).toBeGreaterThan(0);

    pump(120);
    const later = app.renderer.drawProgress;
    expect(later).toBeGreaterThan(first * 3);
  });

  test('normal-speed (non-Shift) playback advances in whole percentages only — no stray decimals', () => {
    setValue(0);
    slider.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }));

    for (let i = 0; i < 8; i += 1) {
      pump(3);
      expect(document.getElementById('draw-order-value').textContent).toMatch(/^\d+%$/);
    }
  });

  test('the slider carries its own click-to-play tooltip instead of just the bar\'s generic one', () => {
    expect(slider.title).toMatch(/click to play/i);
    expect(slider.title).toMatch(/1\/10 speed/i);
  });

  test('the play-triangle fills its viewBox edge-to-edge (no dead margin for the track to peek through at low values)', () => {
    setValue(0);
    const icon = decodeURIComponent(slider.style.getPropertyValue('--draw-order-thumb-icon'));
    const d = icon.match(/d='([^']+)'/)[1];
    const xs = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    const ys = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
    // The old (buggy) build parked the triangle deep inside a 20-22 unit canvas,
    // leaving a wide transparent gap the track showed through at value=0.
    expect(Math.min(...xs)).toBeLessThan(1.5);
    expect(Math.max(...xs)).toBeGreaterThan(11);
    expect(Math.min(...ys)).toBeLessThan(1.5);
    expect(Math.max(...ys)).toBeGreaterThan(11);
  });
});
