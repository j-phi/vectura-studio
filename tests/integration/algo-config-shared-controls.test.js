const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Algo-config panel — migration of the hand-rolled param controls onto the
 * shared component library (UI.Slider / UI.AngleDial / UI.SwToggle /
 * UI.overlays.Dialog):
 *   - every `type:'range'` def mounts UI.Slider markup (gradient fill wrap +
 *     inline-editable chip) with the legacy event contract preserved:
 *     'input' = live-only (chip/fill; livePreview defs preview-regen),
 *     'change' = commit (history + param + regen);
 *   - dblclick on the track resets to the ALGO_DEFAULTS value and commits;
 *   - `type:'angle'` defs mount the keyboard-operable SVG dial;
 *   - `type:'checkbox'` defs mount UI.SwToggle (Space/Enter now work);
 *   - `confirmAbove` guards route through UI.overlays.Dialog instead of
 *     window.confirm — cancel reverts the slider, confirm applies;
 *   - the global seed button is a dice affordance;
 *   - the topoform lightPad is pointer-event driven (touch/pen capable).
 */
describe('Algo-config panel — shared component controls', () => {
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

  // Find the control wrapper whose .control-label matches `label`, scoped to
  // the dynamic controls host.
  const findControl = (label) => {
    const labels = Array.from(controlsHost().querySelectorAll('.control-label'));
    const hit = labels.find((el) => el.textContent.trim() === label);
    if (!hit) return null;
    let n = hit;
    for (let i = 0; i < 6 && n; i++) {
      n = n.parentElement;
      if (n && (n.querySelector('input[type="range"]') || n.querySelector('svg.angle-dial') || n.querySelector('.sw-toggle'))) {
        return n;
      }
    }
    return null;
  };

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('range defs mount UI.Slider markup: fill wrap + editable value chip', async () => {
    await setup('flowfield');
    const ctrl = findControl('Step Length');
    expect(ctrl).toBeTruthy();
    const row = ctrl.querySelector('.slider-row');
    expect(row).toBeTruthy();
    expect(row.querySelector('.sld-fx-wrap input.ctrl-slider')).toBeTruthy();
    const chip = row.querySelector('input.slider-val');
    expect(chip).toBeTruthy(); // inline-editable chip, not the old <button>
    expect(ctrl.querySelector('button.value-chip')).toBeFalsy();
  });

  test("range 'input' is live-only; 'change' commits param + one undoable history entry", async () => {
    await setup('flowfield');
    const ctrl = findControl('Step Length');
    const slider = ctrl.querySelector('input[type="range"]');
    const before = layer().params.stepLen;

    let pushes = 0;
    const origPush = app.pushHistory.bind(app);
    app.pushHistory = (...a) => { pushes += 1; return origPush(...a); };

    slider.value = '9.5';
    fire(slider, 'input');
    // stepLen has no livePreview → drag must not commit
    expect(layer().params.stepLen).toBe(before);
    expect(pushes).toBe(0);

    fire(slider, 'change');
    expect(layer().params.stepLen).toBe(9.5);
    expect(pushes).toBe(1);

    app.pushHistory = origPush;
    app.undo();
    expect(app.engine.getActiveLayer().params.stepLen).toBe(before);
  });

  test('chip inline edit commits the parsed value on blur', async () => {
    await setup('flowfield');
    const ctrl = findControl('Step Length');
    const chip = ctrl.querySelector('input.slider-val');
    chip.value = '4.5';
    fire(chip, 'blur');
    expect(layer().params.stepLen).toBe(4.5);
  });

  test('dblclick on the track resets to the ALGO_DEFAULTS value and commits', async () => {
    await setup('flowfield');
    const defaults = window.Vectura.ALGO_DEFAULTS.flowfield;
    const ctrl = findControl('Step Length');
    const slider = ctrl.querySelector('input[type="range"]');
    layer().params.stepLen = 22;
    app.ui.buildControls();
    const ctrl2 = findControl('Step Length');
    const slider2 = ctrl2.querySelector('input[type="range"]');
    slider2.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(layer().params.stepLen).toBe(defaults.stepLen);
    expect(parseFloat(slider2.value)).toBe(defaults.stepLen);
    expect(slider).toBeTruthy(); // silence unused warning path
  });

  test('angle defs mount the keyboard-operable SVG dial and commit snapped values', async () => {
    await setup('flowfield');
    const ctrl = findControl('Angle Offset');
    expect(ctrl).toBeTruthy();
    const dial = ctrl.querySelector('svg.angle-dial');
    expect(dial).toBeTruthy();
    expect(dial.getAttribute('role')).toBe('slider');
    expect(dial.tabIndex).toBe(0); // focusable — old CSS dial was mouse-only

    const before = layer().params.angleOffset ?? 0;
    dial.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(layer().params.angleOffset).toBe((before + 1) % 360);
  });

  test('checkbox defs mount UI.SwToggle — keyboard toggles the param', async () => {
    await setup('flowfield');
    const ctrl = findControl('Curves');
    expect(ctrl).toBeTruthy();
    const toggle = ctrl.querySelector('.sw-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('role')).toBe('switch');
    const before = Boolean(layer().params.curves);
    expect(toggle.getAttribute('aria-checked')).toBe(String(before));
    // Space on the pill flips it — the hand-rolled markup had no keyboard path.
    toggle.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(Boolean(layer().params.curves)).toBe(!before);
    expect(toggle.getAttribute('aria-checked')).toBe(String(!before));
  });

  test('confirmAbove commits route through UI.overlays.Dialog: cancel reverts, confirm applies', async () => {
    await setup('flowfield');
    let captured = null;
    const origDialog = window.Vectura.UI.overlays.Dialog;
    window.Vectura.UI.overlays.Dialog = (host, props) => {
      captured = props;
      return { open() {}, close() {}, destroy() {} };
    };
    try {
      const ctrl = findControl('Density');
      const slider = ctrl.querySelector('input[type="range"]');
      const before = layer().params.density;

      // Above the 6000 threshold → dialog, not an immediate commit.
      slider.value = '9000';
      fire(slider, 'input');
      fire(slider, 'change');
      expect(captured).toBeTruthy();
      expect(captured.message).toBe('High density can be slow. Continue?');
      expect(layer().params.density).toBe(before); // pending until confirmed

      // Cancel → slider snaps back to the committed param.
      captured.onCancel();
      expect(layer().params.density).toBe(before);
      expect(parseFloat(slider.value)).toBe(before);

      // Re-drag and confirm → the heavy value lands.
      slider.value = '9000';
      fire(slider, 'input');
      fire(slider, 'change');
      captured.onConfirm();
      expect(layer().params.density).toBe(9000);
    } finally {
      window.Vectura.UI.overlays.Dialog = origDialog;
    }
  });

  test('the global seed button is a dice affordance (glyph + title, id stable)', async () => {
    await setup('flowfield');
    const btn = document.getElementById('btn-rand-seed');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('⚄');
    expect(btn.getAttribute('title')).toMatch(/dice/i);
  });

  test('topoform lightPad drags via pointer events (capture-based, touch-capable)', async () => {
    await setup('topoform');
    // lightPad gate: (sceneLighting && hatchEnable) || specularHighlight.
    layer().params.sceneLighting = true;
    layer().params.hatchEnable = true;
    app.ui.buildControls();
    const pad = controlsHost().querySelector('.light-pad');
    expect(pad).toBeTruthy();

    const SIZE = 100;
    pad.getBoundingClientRect = () => ({
      left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0,
    });
    // Drag from centre to the right edge: azimuth 0°, elevation 0° (grazing).
    pad.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: SIZE / 2, clientY: SIZE / 2 }));
    pad.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: SIZE, clientY: SIZE / 2 }));
    pad.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: SIZE, clientY: SIZE / 2 }));
    expect(layer().params.lightAzimuth).toBeCloseTo(0, 5);
    expect(layer().params.lightElevation).toBeCloseTo(0, 5);
  });

  test('export optimization Precision slider is a UI.Slider and live-applies', async () => {
    await setup('flowfield');
    app.ui.openExportModal();
    const optHost = document.getElementById('optimization-controls') || document.body;
    const labels = Array.from(optHost.querySelectorAll('.optimization-control .control-label'));
    const hit = labels.find((el) => el.textContent.trim() === 'Precision');
    expect(hit).toBeTruthy();
    const ctrl = hit.closest('.optimization-control');
    const slider = ctrl.querySelector('.sld-fx-wrap input.ctrl-slider');
    expect(slider).toBeTruthy();
    slider.value = '5';
    fire(slider, 'input');
    expect(window.Vectura.SETTINGS.precision).toBe(5);
  });
});
