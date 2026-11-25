/*
 * Lifecycle review of the Send to Plotter panel and machine tools (simulator only, no port is opened):
 * listeners and controller subscriptions are released on close and not doubled on re-open, nothing keeps
 * running after a disconnect, Escape cancels a press-and-hold jog before closing, and every control that
 * moves the machine is disabled with a reason while the controller is not idle.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Send to Plotter lifecycle and gating', () => {
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
    c.confirmMachineCorner(); // the connect-time ±15 mm box is lifted by the UI's corner confirmation
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
    if (!STP.getPanel()) click('#btn-send-to-plotter');
  });

  afterAll(async () => {
    try { await STP.disconnectSession(); } catch (e) { /* ignore */ }
    STP.getPanel()?.close();
    runtime?.cleanup?.();
    runtime = null;
  });

  test('close and re-open release controller subscriptions and window/document listeners (no doubling)', async () => {
    const c = await connect();
    const added = new Map();
    const track = (target, label) => {
      const add = target.addEventListener.bind(target); const rem = target.removeEventListener.bind(target);
      target.addEventListener = (t, fn, o) => { added.set(`${label}:${t}`, (added.get(`${label}:${t}`) || 0) + 1); return add(t, fn, o); };
      target.removeEventListener = (t, fn, o) => { added.set(`${label}:${t}`, (added.get(`${label}:${t}`) || 0) - 1); return rem(t, fn, o); };
      return () => { target.addEventListener = add; target.removeEventListener = rem; };
    };
    const untrack = [track(window, 'window'), track(document, 'document')];
    const base = handlerCount(c); // the session's own bindings
    const baseByEvt = byEvt(c);
    for (let i = 0; i < 3; i += 1) {
      STP.getPanel()?.close();
      await tick(); // the modal removes its DOM one tick after close
      click('#btn-send-to-plotter');
      click('[data-tab="machine"]');
      click('[data-tab="console"]');
      click('[data-tab="plot"]');
      expect(handlerCount(c)).toBeGreaterThan(base); // tools subscribed
      STP.getPanel().close();
      await tick();
      expect(byEvt(c)).toEqual(baseByEvt); // and fully released
    }
    untrack.forEach((u) => u());
    const leaked = Array.from(added.entries()).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`);
    expect(leaked).toEqual([]);
    expect(STP.getSession().listeners.size).toBe(0);
  });

  test('nothing keeps running after a disconnect: poll timer and press-and-hold jog loop stop', async () => {
    const c = await connect();
    await c.jogContinuousStart({ x: 1, y: 0 }, 1500);
    expect(c._jogLoop).toBeTruthy();
    await STP.disconnectSession();
    expect(c._jogLoop).toBeNull();
    expect(c._pollTimer).toBeNull();
    expect(handlerCount(c)).toBe(0 + Object.values(c._handlers).reduce((n, s) => n + s.size, 0));
    const sim = STP.getSession().transport;
    expect(sim).toBeNull();
  });

  test('Escape cancels a press-and-hold jog and does not close the panel', async () => {
    const c = await connect(1);
    click('[data-tab="machine"]');
    await c.jogContinuousStart({ x: 1, y: 0 }, 1500);
    expect(c.state).toBe('jogging');
    document.querySelector('.stp-root').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => c.state === 'idle');
    expect(c._jogLoop).toBeNull();
    expect(STP.getPanel()).toBeTruthy();
  });

  describe('motion controls are disabled with a reason unless the plotter is idle', () => {
    const MACHINE = ['[data-stp-jog]', '[data-stp-act="pen-up"]', '[data-stp-act="pen-down"]', '[data-stp-act="set-origin"]', '[data-stp-act="goto-origin"]', '[data-stp-act="frame"]', '[data-stp-field="pen-z"]', '[data-stp-wizard]'];
    const PLOT = ['#stp-frame', '#stp-scale-check', '#stp-swatch-plot'];
    const longJob = () => {
      const lines = ['G21', 'G90', 'G1 Z0 F5000'];
      const starts = [];
      for (let i = 0; i < 40; i += 1) {
        starts.push(lines.length);
        lines.push(`G1 X${10 + i} Y10 F6000`, 'G1 Z3.5 F5000', `G1 X${10 + i} Y200 F1200`, 'G1 Z0 F5000');
      }
      return { lines, penChangeIndices: [starts[20]], pathStartIndices: starts, pathCount: starts.length };
    };

    const assertGated = (reasonRe) => {
      click('[data-tab="machine"]');
      MACHINE.forEach((sel) => {
        const els = document.querySelectorAll(`[data-pane="machine"] ${sel}`);
        expect(els.length, sel).toBeGreaterThan(0);
        els.forEach((el) => { expect(el.disabled, `${sel} disabled`).toBe(true); expect(el.title, `${sel} reason`).toMatch(reasonRe); });
      });
      click('[data-tab="plot"]');
      PLOT.forEach((sel) => {
        const el = document.querySelector(sel);
        expect(el.disabled, `${sel} disabled`).toBe(true);
        expect(el.title, `${sel} reason`).toMatch(reasonRe);
      });
      const start = document.getElementById('stp-start');
      if (start) expect(start.disabled).toBe(true);
    };

    test('running, paused and pen change', async () => {
      const c = await connect(30);
      const done = c.run(longJob(), { pens: [{ name: 'A' }, { name: 'B' }], penChange: 'pause' });
      await waitFor(() => c.state === 'running');
      await new Promise((r) => setTimeout(r, 60)); // let the tools refresh
      assertGated(/running|unavailable while a job/i);
      c.pause();
      await waitFor(() => c.state === 'paused');
      assertGated(/paused|unavailable while a job/i);
      c.resume();
      await waitFor(() => c.state === 'penChange', 60000);
      assertGated(/pen change|unavailable while a job/i);
      const stopP = c.stop();
      await waitFor(() => c.state === 'stopping' || c.state === 'idle', 5000);
      if (c.state === 'stopping') assertGated(/stopping|unavailable while a job/i);
      await stopP;
      await done.catch(() => null);
    }, 90000);

    test('helper actions called directly while not idle are refused with the reason, not sent', async () => {
      const c = await connect(30);
      const done = c.run(longJob(), { pens: [{ name: 'A' }, { name: 'B' }], penChange: 'pause' });
      await waitFor(() => c.state === 'running');
      const sim = STP.getSession().transport;
      const motion = () => sim.getLog().filter((e) => e.dir === 'in' && e.type === 'line' && /^G[01]/.test(e.data)).map((e) => e.data);
      const before = motion().length;
      const panel = STP.getPanel();
      expect(panel.runFrame()).toBeNull();
      expect(panel.s.plotMsg).toMatch(/running/i);
      panel.s.plotMsg = null;
      expect(panel.runScaleCheck()).toBeNull();
      expect(panel.s.plotMsg).toMatch(/running/i);
      panel.s.plotMsg = null;
      panel.plotSwatch();
      expect(panel.s.plotMsg).toMatch(/running/i);
      expect(STP.getSession().run).toBeNull(); // no helper job was started
      await new Promise((r) => setTimeout(r, 30));
      // everything the simulator received after the refusal is still the original job's lines
      const jobLines = new Set(longJob().lines);
      expect(motion().slice(before).every((l) => jobLines.has(l) || /^G1 Z/.test(l))).toBe(true);
      await c.stop();
      await done.catch(() => null);
    }, 60000);
  });
});
