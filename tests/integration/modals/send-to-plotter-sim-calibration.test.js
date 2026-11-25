/*
 * Simulator calibration never satisfies the real plotter's first-run gate. Lifecycle review of the Send to Plotter panel and machine tools (simulator only, no port is opened):
 * listeners and controller subscriptions are released on close and not doubled on re-open, nothing keeps
 * running after a disconnect, Escape cancels a press-and-hold jog before closing, and every control that
 * moves the machine is disabled with a reason while the controller is not idle.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Send to Plotter simulator calibration isolation', () => {
  let runtime; let window; let document; let app; let STP;

  const waitFor = async (fn, ms = 15000, step = 20) => {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error(`waitFor timed out: ${fn}`);
      await new Promise((r) => setTimeout(r, step));
    }
  };
  const click = (sel) => {
    const el = document.querySelector(sel);
    expect(el, sel).toBeTruthy();
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const byEvt = (c) => Object.fromEntries(Object.entries(c._handlers).filter(([, v]) => v.size > 0).map(([k, v]) => [k, v.size]));
  const handlerCount = (c) => Object.values(c._handlers).reduce((n, set) => n + set.size, 0);
  const connect = async (speed) => {
    STP.simOptions = { bannerDelayMs: 10, speed: speed || 4000 };
    await STP.connectSession('sim', STP.getPanel().profile());
    const c = STP.getSession().controller;
    await waitFor(() => c.state === 'idle');
    await c.setOrigin();
    return c;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    STP = window.Vectura.UI.Modals.SendToPlotter;
    app.engine.addLayer('lissajous');
    app.render?.();
    click('#btn-send-to-plotter');
  });

  afterEach(async () => {
    try { await STP.disconnectSession(); } catch (e) { /* ignore */ }
  });

  afterAll(async () => {
    try { await STP.disconnectSession(); } catch (e) { /* ignore */ }
    STP.getPanel()?.close();
    runtime?.cleanup?.();
    runtime = null;
  });

  it('simulator calibration is practice only and never reaches the real profile', async () => {
    const KEY = 'vectura_plotter_overrides';
    window.localStorage.removeItem(KEY);
    const panel = STP.getPanel();
    expect(panel.calibration().axisChecked).toBe(false);
    await connect();
    const r = panel.setProfileOverride({ axes: { invertX: true }, pen: { down: 7, up: 3 }, calibration: { axisChecked: true, penHeightChecked: true } });
    expect(r.ok).toBe(true);
    expect(panel.calibration()).toEqual({ axisChecked: true, penHeightChecked: true }); // practice state visible while on the simulator
    expect(window.localStorage.getItem(KEY)).toBeNull();
    await STP.disconnectSession();
    expect(panel.calibration()).toEqual({ axisChecked: false, penHeightChecked: false });
    expect(panel.profile().axes.invertX).not.toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
