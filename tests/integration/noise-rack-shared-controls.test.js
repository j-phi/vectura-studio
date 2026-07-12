const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Adversarial-review fixes A4 / A6 in the noise-rack panel:
 *   A4 — buildAngleControl mounts the shared UI.AngleDial (keyboard arrows,
 *        aria role=slider, inline degree input, dblclick default reset) in
 *        place of the legacy hand-rolled .angle-dial div + .value-chip +
 *        hidden .value-input (mouse-only). Commit semantics preserved: drag
 *        is needle-only, release/keyboard/text-entry/dblclick commit with a
 *        history push + param write + regen. Both conventions are 0°-up
 *        clockwise-positive, so the display value maps 1:1.
 *   A6 — noise checkbox controls mount UI.SwToggle (Space/Enter + aria).
 */
describe('Noise rack — shared component controls (A4/A6)', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('wavetable');
    app.ui.renderLayers();
    app.ui.buildControls();
    // Add one noise to the rack via the panel's own affordance.
    const addBtn = document.querySelector('#dynamic-controls .noise-list .noise-add');
    expect(addBtn).toBeTruthy();
    addBtn.click();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const layer = () => app.engine.getActiveLayer();
  const noise = () => layer().params.noises[0];
  const rack = () => document.querySelector('#dynamic-controls .noise-list');
  const findNoiseControl = (labelRe) => {
    const labels = Array.from(rack().querySelectorAll('.noise-control .control-label'));
    const hit = labels.find((el) => labelRe.test(el.textContent.trim()));
    return hit ? hit.closest('.noise-control') : null;
  };

  test('A4: the noise angle control is a UI.AngleDial — SVG dial + inline degree input, no legacy chip', () => {
    const ctrl = findNoiseControl(/^Noise Angle$/);
    expect(ctrl).toBeTruthy();
    const dial = ctrl.querySelector('svg.angle-dial');
    expect(dial).toBeTruthy();
    expect(dial.getAttribute('role')).toBe('slider');
    expect(dial.tabIndex).toBe(0);
    expect(ctrl.querySelector('.angle-inp')).toBeTruthy();
    // Legacy hand-rolled trio is gone.
    expect(ctrl.querySelector('button.value-chip')).toBeFalsy();
    expect(ctrl.querySelector('.value-input')).toBeFalsy();
    expect(ctrl.querySelector('div.angle-dial')).toBeFalsy();
  });

  test('A4: keyboard arrows commit the snapped value with exactly one history push', () => {
    const ctrl = findNoiseControl(/^Noise Angle$/);
    const dial = ctrl.querySelector('svg.angle-dial');
    const before = Number(noise().angle) || 0;

    let pushes = 0;
    const origPush = app.pushHistory.bind(app);
    app.pushHistory = (...a) => { pushes += 1; return origPush(...a); };
    dial.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    app.pushHistory = origPush;

    expect(Number(noise().angle)).toBe((before + 1) % 360);
    expect(pushes).toBe(1);
  });

  test('A4: dblclick on the dial resets to the noise default and commits', () => {
    const ctrl = findNoiseControl(/^Noise Angle$/);
    const dial = ctrl.querySelector('svg.angle-dial');
    const inp = ctrl.querySelector('.angle-inp');
    // A freshly created noise shows the template default (same source the
    // dblclick reset resolves via getNoiseDefault).
    const defaultAngle = Number(inp.value);

    // Move away from the default first.
    dial.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    dial.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(Number(noise().angle)).not.toBe(defaultAngle);

    dial.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(Number(noise().angle)).toBe(defaultAngle);
    expect(Number(inp.value)).toBe(defaultAngle);
  });

  test('A4: a disabled noise card gates its dial out of pointer/tab order', () => {
    noise().enabled = false;
    app.ui.buildControls();
    const ctrl = findNoiseControl(/^Noise Angle$/);
    const dial = ctrl.querySelector('svg.angle-dial');
    const inp = ctrl.querySelector('.angle-inp');
    expect(dial.style.pointerEvents).toBe('none');
    expect(dial.tabIndex).toBe(-1);
    expect(inp.disabled).toBe(true);
    expect(ctrl.querySelector('.angle-ctrl').classList.contains('angle-disabled')).toBe(true);
  });

  test('A6: noise checkbox controls are UI.SwToggles — Space toggles the value with history + aria sync', () => {
    // The checkbox defs (Invert Color / Invert Opacity) render for image noise.
    noise().type = 'image';
    app.ui.buildControls();
    const ctrl = findNoiseControl(/^Invert Color$/);
    expect(ctrl).toBeTruthy();
    const toggle = ctrl.querySelector('.sw-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.tabIndex).toBe(0);

    const before = Boolean(noise().imageInvertColor);
    let pushes = 0;
    const origPush = app.pushHistory.bind(app);
    app.pushHistory = (...a) => { pushes += 1; return origPush(...a); };
    toggle.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    app.pushHistory = origPush;

    expect(Boolean(noise().imageInvertColor)).toBe(!before);
    expect(toggle.getAttribute('aria-checked')).toBe(String(!before));
    expect(pushes).toBe(1);
    const readout = ctrl.querySelector('.font-mono');
    expect(readout.textContent).toBe(!before ? 'ON' : 'OFF');
  });
});
