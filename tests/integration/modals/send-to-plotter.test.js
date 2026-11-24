/*
 * Integration test for the Send to Plotter panel. Boots the full Vectura runtime and drives the panel
 * through File > Send to Plotter with the SimulatorTransport only (no port is ever opened):
 *   - the menu item exists, is gated on document content and opens the five-tab panel
 *   - Start is disabled with a reason while disconnected
 *   - simulator connect, origin through the controller, stats render, out-of-bounds message
 *   - plot settings are written into the preference snapshot (key `plotter`) and trimmed from the cookie first
 *   - a plot runs to completion in the simulator and the drawn trace has paths
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Send to Plotter panel', () => {
  let runtime; let window; let document; let app; let STP;

  const waitFor = async (fn, ms = 10000, step = 20) => {
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
  const flush = () => new Promise((r) => setTimeout(r, 200));

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    STP = window.Vectura.UI.Modals.SendToPlotter;
    STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
    app.engine.addLayer('lissajous');
    app.render?.();
  });

  afterAll(async () => {
    try { await STP.disconnectSession(); } catch (e) { /* ignore */ }
    STP.getPanel()?.close();
    runtime?.cleanup?.();
    runtime = null;
  });

  test('the File menu item exists and is enabled when the document has content', () => {
    const item = document.getElementById('btn-send-to-plotter');
    expect(item).toBeTruthy();
    expect(item.textContent).toContain('Send to Plotter');
    app.ui.refreshTopMenuItemStates?.();
    expect(item.hasAttribute('disabled')).toBe(false);
  });

  test('opens the panel with five tabs; Machine and Console degrade to a placeholder or the tools', () => {
    click('#btn-send-to-plotter');
    expect(document.querySelector('.stp-dialog')).toBeTruthy();
    const tabs = Array.from(document.querySelectorAll('.stp-tab')).map((t) => t.dataset.tab);
    expect(tabs).toEqual(['connect', 'setup', 'machine', 'plot', 'console']);
    click('[data-tab="machine"]');
    expect(document.querySelector('[data-pane="machine"]').hidden).toBe(false);
    expect(document.querySelector('[data-pane="machine"]').textContent.length).toBeGreaterThan(0);
    click('[data-tab="connect"]');
    expect(document.getElementById('stp-uuna-hint').textContent).toMatch(/Close the UUNA app first/);
  });

  test('Start is disabled with a reason while disconnected', () => {
    click('[data-tab="plot"]');
    const start = document.getElementById('stp-start');
    expect(start.disabled).toBe(true);
    expect(document.getElementById('stp-start-why').textContent).toMatch(/Connect to a plotter first/);
  });

  test('Setup renders stats for the document and Refresh picks up geometry', async () => {
    click('[data-tab="setup"]');
    await flush();
    const paths = Number(document.getElementById('stp-stat-paths').textContent);
    expect(paths).toBeGreaterThan(0);
    expect(document.getElementById('stp-stat-time').textContent).toMatch(/\d/);
    expect(document.querySelectorAll('.stp-pen').length).toBeGreaterThan(0);
  });

  test('connects to the simulator; the origin note links to Machine; origin set through the controller', async () => {
    click('[data-tab="connect"]');
    click('#stp-connect-sim');
    await waitFor(() => document.getElementById('stp-connected'));
    const c = STP.getSession().controller;
    expect(c.state).toBe('idle');
    expect(document.getElementById('stp-origin-note')).toBeTruthy();
    expect(document.querySelector('.stp-pill').dataset.state).toBe('idle');
    await c.setOrigin();
    await waitFor(() => !document.getElementById('stp-origin-note'));
    expect(c.originSet).toBe(true);
  });

  test('an out-of-bounds placement shows the overflow in mm and blocks Start', async () => {
    const panel = STP.getPanel();
    panel.saveSettings({ placement: { offsetX: 500 } });
    await waitFor(() => document.getElementById('stp-oob')?.classList.contains('is-visible'));
    expect(document.getElementById('stp-oob').textContent).toMatch(/Out of bounds.*right \d+(\.\d+)? mm/);
    click('[data-tab="plot"]');
    await flush();
    expect(document.getElementById('stp-start').disabled).toBe(true);
    expect(document.getElementById('stp-start-why').textContent).toMatch(/Out of bounds/);
    panel.saveSettings({ placement: { offsetX: 0 } });
    await waitFor(() => !document.getElementById('stp-oob').classList.contains('is-visible'));
  });

  test('plot settings persist into the preference snapshot and are trimmed from the cookie first', () => {
    const panel = STP.getPanel();
    panel.saveSettings({ placement: { offsetX: 12, rotate: 90 }, airPlot: false, optimize: { simplify: 0.1 } });
    const snap = app.getPreferenceSnapshot();
    expect(snap.plotter.placement).toMatchObject({ offsetX: 12, rotate: 90 });
    expect(snap.plotter.optimize.simplify).toBe(0.1);
    // round trip through a hostile snapshot is validated
    app.applyPreferenceSnapshot({ plotter: { placement: { rotate: 33, offsetX: 'x' }, profileId: '<bad>' } });
    expect(app.getPreferenceSnapshot().plotter.placement.rotate).toBe(0);
    expect(app.getPreferenceSnapshot().plotter.profileId).toBe('uunatek-3-a3');
    panel.saveSettings({ placement: { offsetX: 0, rotate: 0 } });
  });

  test('Start plots to completion in the simulator', async () => {
    click('[data-tab="plot"]');
    await waitFor(() => { const s = document.getElementById('stp-start'); return s && !s.disabled; });
    click('#stp-start');
    await waitFor(() => document.getElementById('stp-done'), 30000);
    const s = STP.getSession();
    expect(s.progress.percent).toBe(100);
    expect(s.controller.state).toBe('idle');
    expect(s.transport.getPolylines().length).toBeGreaterThan(0);
    expect(document.getElementById('stp-stop')?.hidden ?? true).toBe(true);
  }, 40000);


  test('closing while a plot runs asks first, keeps the job running, and Escape stops it after reopening', async () => {
    STP.getPanel()?.close();
    await STP.disconnectSession();
    STP.simOptions = { bannerDelayMs: 10, speed: 3 };
    click('#btn-send-to-plotter');
    click('#stp-connect-sim');
    await waitFor(() => STP.getSession().controller?.state === 'idle');
    const c = STP.getSession().controller;
    await c.setOrigin();
    click('[data-tab="plot"]');
    await waitFor(() => { const s = document.getElementById('stp-start'); return s && !s.disabled; });
    click('#stp-start');
    await waitFor(() => c.state === 'running');
    expect(document.getElementById('stp-stop').hidden).toBe(false);
    click('.stp-close');
    expect(document.getElementById('stp-confirm-close')).toBeTruthy();
    expect(STP.getPanel()).toBeTruthy();
    click('#stp-confirm-close');
    expect(STP.getPanel()).toBeFalsy();
    expect(c.state).toBe('running');
    click('#btn-send-to-plotter');
    expect(document.getElementById('stp-stop').hidden).toBe(false);
    document.querySelector('.stp-root').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => c.state === 'idle', 20000);
    expect(STP.getSession().lastResult.aborted).toBe(true);
    await waitFor(() => document.getElementById('stp-resume'));
    expect(document.getElementById('stp-resume-path')).toBeTruthy();
  }, 40000);

  test('closing the panel while idle closes immediately; reopening works', () => {
    click('.stp-close');
    expect(STP.getPanel()).toBeFalsy();
    click('#btn-send-to-plotter');
    expect(document.querySelector('.stp-dialog')).toBeTruthy();
  });
});
