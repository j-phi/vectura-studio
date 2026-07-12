const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Adversarial-review fix A1 (+A2) — modal overlays vs global shortcuts.
 *
 * The Modal backdrop blocks pointers, but src/ui/shortcuts.js listens on
 * window keydown and used to bail only for INPUT/TEXTAREA/SELECT targets. So
 * while a confirmAbove dialog (UI.overlays.Dialog → Modal) or the legacy
 * #modal-overlay (document setup / export / help) was open, Delete/Backspace/
 * Cmd+Z still fired — a user could delete or undo away the very layer the
 * dialog's pending onConfirm closure referenced, then click Continue and write
 * params into a dead layer while corrupting the undo stack.
 *
 * Three layers of defense, each pinned here:
 *   (a) shortcuts.js early-returns while UI.overlays.Modal.anyOpen() or the
 *       legacy #modal-overlay reports open;
 *   (b) the confirmAbove onConfirm re-resolves the layer by id at confirm
 *       time and no-ops when it is gone;
 *   (c) [A2 hardening] with livePreview+confirmAbove combined, dialog Cancel
 *       restores the pre-gesture committed snapshot (livePreview already
 *       mutated layer.params during the drag) and re-arms the once-per-gesture
 *       history flag.
 */
describe('Modal overlays suppress global shortcuts (A1/A2)', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const layer = () => app.engine.getActiveLayer();
  const controlsHost = () => document.getElementById('dynamic-controls');
  const findControl = (label) => {
    const labels = Array.from(controlsHost().querySelectorAll('.control-label'));
    const hit = labels.find((el) => el.textContent.trim() === label);
    if (!hit) return null;
    let n = hit;
    for (let i = 0; i < 6 && n; i++) {
      n = n.parentElement;
      if (n && n.querySelector('input[type="range"]')) return n;
    }
    return null;
  };
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const key = (opts) => window.dispatchEvent(new window.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, opts)));

  test('UI.overlays.Modal.anyOpen() tracks open/close of Phase-1 modals (Dialog composes it)', () => {
    const overlays = window.Vectura.UI.overlays;
    expect(typeof overlays.Modal.anyOpen).toBe('function');
    expect(overlays.Modal.anyOpen()).toBe(false);
    const dlg = overlays.Dialog(document.body, { title: 'T', message: 'm', onConfirm: () => {} });
    dlg.open();
    expect(overlays.Modal.anyOpen()).toBe(true);
    dlg.close();
    expect(overlays.Modal.anyOpen()).toBe(false);
    dlg.destroy();
    // destroy-while-open also releases the counter
    const dlg2 = overlays.Dialog(document.body, { title: 'T2', message: 'm', onConfirm: () => {} });
    dlg2.open();
    expect(overlays.Modal.anyOpen()).toBe(true);
    dlg2.destroy();
    expect(overlays.Modal.anyOpen()).toBe(false);
  });

  test('Delete and Cmd+Z are suppressed while a UI.overlays.Dialog is open, and work again after close', () => {
    const id = layer().id;
    app.renderer.setSelection([id], id);
    const countBefore = app.engine.layers.length;

    let menuActions = [];
    const origTrigger = app.ui.triggerTopMenuAction?.bind(app.ui);
    app.ui.triggerTopMenuAction = (actionId) => { menuActions.push(actionId); return true; };

    const dlg = window.Vectura.UI.overlays.Dialog(document.body, { title: 'Heavy computation', message: 'm', onConfirm: () => {} });
    dlg.open();

    key({ key: 'Delete' });
    expect(app.engine.layers.length).toBe(countBefore); // layer survives
    key({ key: 'z', metaKey: true });
    expect(menuActions).toEqual([]); // undo accelerator swallowed

    dlg.close();
    dlg.destroy();

    key({ key: 'z', metaKey: true });
    expect(menuActions).toEqual(['btn-undo']); // shortcuts live again
    key({ key: 'Delete' });
    expect(app.engine.layers.length).toBe(countBefore - 1);

    if (origTrigger) app.ui.triggerTopMenuAction = origTrigger;
  });

  test('the legacy #modal-overlay (openModal) also suppresses Delete while open', () => {
    const id = layer().id;
    app.renderer.setSelection([id], id);
    const countBefore = app.engine.layers.length;

    app.ui.openModal({ title: 'Legacy', body: '<p>hi</p>' });
    expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(true);

    key({ key: 'Delete' });
    expect(app.engine.layers.length).toBe(countBefore);

    app.ui.closeModal();
    key({ key: 'Delete' });
    expect(app.engine.layers.length).toBe(countBefore - 1);
  });

  test('confirmAbove onConfirm no-ops (no param write, no history) when the layer died while the dialog was open', () => {
    let captured = null;
    const origDialog = window.Vectura.UI.overlays.Dialog;
    window.Vectura.UI.overlays.Dialog = (host, props) => {
      captured = props;
      return { open() {}, close() {}, destroy() {} };
    };
    try {
      const ctrl = findControl('Density');
      const slider = ctrl.querySelector('input[type="range"]');
      const doomed = layer();
      const before = doomed.params.density;

      slider.value = '9000';
      fire(slider, 'input');
      fire(slider, 'change');
      expect(captured).toBeTruthy();
      expect(doomed.params.density).toBe(before); // pending until confirmed

      // The layer dies while the dialog sits open (e.g. via another UI path).
      app.engine.removeLayer(doomed.id);
      expect(app.engine.getLayerById(doomed.id)).toBeFalsy();

      let pushes = 0;
      const origPush = app.pushHistory;
      app.pushHistory = () => { pushes += 1; };
      expect(() => captured.onConfirm()).not.toThrow();
      app.pushHistory = origPush;

      expect(doomed.params.density).toBe(before); // dead closure object untouched
      expect(pushes).toBe(0);                     // no phantom history entry
    } finally {
      window.Vectura.UI.overlays.Dialog = origDialog;
    }
  });

  test('A2: livePreview+confirmAbove — dialog Cancel restores the pre-gesture snapshot and re-arms the history flag', () => {
    // No shipped def combines both flags; arm livePreview on the density def
    // for this runtime only (fresh JSDOM per test, so no cross-test bleed).
    const densityDef = app.ui.controls.flowfield.find((d) => d.id === 'density');
    densityDef.livePreview = true;
    let captured = null;
    const origDialog = window.Vectura.UI.overlays.Dialog;
    window.Vectura.UI.overlays.Dialog = (host, props) => {
      captured = props;
      return { open() {}, close() {}, destroy() {} };
    };
    try {
      app.ui.buildControls();
      const ctrl = findControl('Density');
      const slider = ctrl.querySelector('input[type="range"]');
      const before = layer().params.density;

      slider.value = '9000';
      fire(slider, 'input'); // livePreview writes into layer.params immediately
      expect(layer().params.density).toBe(9000);

      fire(slider, 'change'); // above threshold → dialog
      expect(captured).toBeTruthy();

      captured.onCancel();
      // Restored to the COMMITTED pre-gesture value, not the previewed 9000.
      expect(layer().params.density).toBe(before);
      expect(parseFloat(slider.value)).toBe(before);

      // History flag was reset: the next full gesture pushes exactly once.
      let pushes = 0;
      const origPush = app.pushHistory;
      app.pushHistory = () => { pushes += 1; };
      slider.value = '3000';
      fire(slider, 'input');  // livePreview push (once per gesture)
      fire(slider, 'change'); // commit reuses that push
      app.pushHistory = origPush;
      expect(pushes).toBe(1);
      expect(layer().params.density).toBe(3000);
    } finally {
      delete densityDef.livePreview;
      window.Vectura.UI.overlays.Dialog = origDialog;
    }
  });
});
