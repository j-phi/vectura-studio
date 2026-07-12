const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Adversarial-review fixes A3 / A6 / A8 in the algo-config panel:
 *   A3 — lightPad: window-level pointerup/pointercancel fallback so a drag
 *        always ends even when setPointerCapture fails (unsupported/detached).
 *   A6 — optimization-step checkbox controls mount UI.SwToggle (keyboard
 *        Space/Enter + aria-checked) instead of hand-rolled .sw-toggle markup;
 *        dblclick-reset to the step default is preserved by external wiring.
 *   A8 — petalis modifier/shading sliders dblclick-reset to the param's TRUE
 *        default (the create* factory value a fresh modifier gets), no longer
 *        to def.min.
 */
describe('Algo-config panel — adversarial-review fixes', () => {
  let runtime, window, document, app;

  const setup = async (type) => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer(type);
    app.ui.renderLayers();
    app.ui.buildControls();
  };
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const layer = () => app.engine.getActiveLayer();
  const controlsHost = () => document.getElementById('dynamic-controls');

  test('A3: lightPad drag ends via the window pointerup fallback when pointer capture fails', async () => {
    await setup('topoform');
    layer().params.sceneLighting = true;
    layer().params.hatchEnable = true;
    app.ui.buildControls();
    const pad = controlsHost().querySelector('.light-pad');
    expect(pad).toBeTruthy();

    const SIZE = 100;
    pad.getBoundingClientRect = () => ({
      left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0,
    });
    // Simulate a platform where capture is unavailable: without the window
    // fallback, releasing OUTSIDE the pad would leave padDragging stuck.
    pad.setPointerCapture = () => { throw new Error('capture unsupported'); };

    pad.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: SIZE / 2, clientY: SIZE / 2 }));
    // Release happens on the WINDOW (pointer left the pad), at the right edge:
    // azimuth 0°, elevation 0°.
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: SIZE, clientY: SIZE / 2 }));
    expect(layer().params.lightAzimuth).toBeCloseTo(0, 5);
    expect(layer().params.lightElevation).toBeCloseTo(0, 5);

    // Drag is over — a later pointermove over the pad must be inert.
    const azAfter = layer().params.lightAzimuth;
    const elAfter = layer().params.lightElevation;
    const padAfter = controlsHost().querySelector('.light-pad') || pad;
    padAfter.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(layer().params.lightAzimuth).toBe(azAfter);
    expect(layer().params.lightElevation).toBe(elAfter);
  });

  test('A6: optimization "Remove Tiny" is a UI.SwToggle — Space toggles the step config with aria sync', async () => {
    await setup('flowfield');
    // Enable the filter step so its controls are interactive (disabled steps
    // render disabled inputs — legacy parity the SwToggle migration keeps).
    const cfg = app.engine.ensureLayerOptimization(layer());
    const filterStep = cfg.steps.find((s) => s.id === 'filter');
    filterStep.enabled = true;
    app.ui.openExportModal();
    const optHost = document.getElementById('optimization-controls') || document.body;
    const labels = Array.from(optHost.querySelectorAll('.optimization-control .control-label'));
    const hit = labels.find((el) => el.textContent.trim() === 'Remove Tiny');
    expect(hit).toBeTruthy();
    const ctrl = hit.closest('.optimization-control');
    const toggle = ctrl.querySelector('.sw-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.tabIndex).toBe(0); // keyboard-reachable — old markup was not

    const stepVal = () => Boolean(layer().optimization?.steps?.find((s) => s.id === 'filter')?.removeTiny);
    const before = toggle.getAttribute('aria-checked') === 'true';
    toggle.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(stepVal()).toBe(!before);
    expect(toggle.getAttribute('aria-checked')).toBe(String(!before));
    // ON/OFF readout stays in sync (legacy visual parity)
    const readout = ctrl.querySelector('.font-mono');
    expect(readout.textContent).toBe(!before ? 'ON' : 'OFF');
  });

  test('A8: petalis center-modifier slider dblclick resets to the factory default, not def.min', async () => {
    await setup('petalisDesigner');
    layer().params.centerModifiers = [{
      id: 'mod-test', enabled: true, type: 'ripple', amount: 7, frequency: 6, noises: [],
    }];
    app.ui.buildControls();

    // The ripple Amplitude def has min 0; the factory (createPetalisModifier)
    // seeds amount: 2 — the value a freshly added modifier shows.
    const labels = Array.from(controlsHost().querySelectorAll('.noise-control .control-label'));
    const hit = labels.find((el) => /^Amplitude/.test(el.textContent.trim()));
    expect(hit).toBeTruthy();
    const ctrl = hit.closest('.noise-control');
    const slider = ctrl.querySelector('input[type="range"]');
    expect(slider).toBeTruthy();
    expect(parseFloat(slider.value)).toBe(7);

    slider.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(layer().params.centerModifiers[0].amount).toBe(2); // factory default
    expect(parseFloat(slider.value)).toBe(2);
  });
});
