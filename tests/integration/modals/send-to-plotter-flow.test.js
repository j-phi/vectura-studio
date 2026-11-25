/*
 * Send to Plotter v2 guided flow (spec section 12): tab order + status glyphs, auto-advance, next-step
 * banner, header command bar (readout, E-STOP, hotkeys), start-corner card, collapsed Advanced sections.
 * Simulator only; the controller safety API is stubbed where the controller in this tree lacks it.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Send to Plotter v2 flow', () => {
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
  const key = (target, k, init) => target.dispatchEvent(new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, init || {})));
  const status = (id) => document.querySelector(`[data-tab="${id}"]`).dataset.status;
  const glyph = (id) => document.querySelector(`[data-tab="${id}"] .stp-tab-glyph`).textContent;
  const bannerText = () => document.getElementById('stp-banner-text')?.textContent || '';
  const connectSim = async () => {
    STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
    await STP.connectSession('sim', STP.getPanel().profile());
    const c = STP.getSession().controller;
    await waitFor(() => c.state === 'idle');
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

  afterEach(async () => { try { await STP.disconnectSession(); } catch (e) { /* ignore */ } });
  afterAll(async () => {
    try { await STP.disconnectSession(); } catch (e) { /* ignore */ }
    STP.getPanel()?.close();
    runtime?.cleanup?.();
    runtime = null;
  });

  test('tab order is Connect, Machine, Setup, Plot, divider, Console (Advanced) with numbers and status glyphs', async () => {
    const tabs = Array.from(document.querySelectorAll('.stp-tab'));
    expect(tabs.map((t) => t.dataset.tab)).toEqual(['connect', 'machine', 'setup', 'plot', 'console']);
    expect(tabs.slice(0, 4).map((t) => t.querySelector('.stp-tab-num').textContent)).toEqual(['1', '2', '3', '4']);
    expect(tabs[4].textContent).toMatch(/Console\s*Advanced/);
    const kids = Array.from(document.querySelector('.stp-rail').children);
    expect(kids[kids.indexOf(tabs[4]) - 1].getAttribute('role')).toBe('separator');
    // disconnected: Connect needs attention, the rest are dimmed placeholders
    expect(status('connect')).toBe('attention'); expect(glyph('connect')).toBe('●');
    expect(status('machine')).toBe('idle'); expect(glyph('machine')).toBe('–');
    expect(status('plot')).toBe('idle');
    await waitFor(() => status('setup') === 'done'); // the document fits the work area
    expect(glyph('setup')).toBe('✓');
  });

  test('banner: disconnected says to connect, text only (the header button is the one Connect)', () => {
    expect(bannerText()).toMatch(/Connect your plotter/);
    expect(document.getElementById('stp-banner-action')).toBeNull();
    expect(document.getElementById('stp-hdr-connect')).toBeTruthy();
  });

  test('Connect pane: no duplicate connect buttons; last port line + Choose a different port', async () => {
    const panel = STP.getPanel();
    click('[data-tab="connect"]');
    expect(document.getElementById('stp-connect-usb')).toBeNull();
    expect(Array.from(document.querySelectorAll('#stp-pane-connect button')).some((b) => /Connect \(USB\)|Reconnect USB/.test(b.textContent))).toBe(false);
    const WS = window.Vectura.PlotterTransports.WebSerialTransport;
    const was = WS.isSupported;
    WS.isSupported = () => true;
    panel.s.granted = [{ getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7523 }) }];
    panel.renderConnect();
    WS.isSupported = was;
    expect(document.getElementById('stp-last-port').textContent).toBe('Last port: USB 1a86:7523');
    const choose = document.getElementById('stp-choose-port');
    expect(choose.textContent).toMatch(/Choose a different port/);
    expect(choose.classList.contains('is-primary')).toBe(false);
    expect(document.getElementById('stp-uuna-hint')).toBeTruthy();
  });

  test('header: Moving pill while a manual move is in flight; origin chip tracks the origin; no chips in the Machine pane', async () => {
    const c = await connectSim();
    if (c.confirmMachineCorner) await c.confirmMachineCorner();
    const panel = STP.getPanel();
    const pill = () => document.querySelector('.stp-pill');
    expect(pill().textContent).not.toBe('Moving');
    expect(document.getElementById('stp-origin-chip').textContent).toBe('No origin');
    panel.ctx.reportMotion(true);
    expect(pill().textContent).toBe('Moving');
    expect(pill().classList.contains('is-moving')).toBe(true);
    panel.ctx.reportMotion(false);
    expect(pill().textContent).not.toBe('Moving');
    await c.setOrigin();
    await waitFor(() => document.getElementById('stp-origin-chip').textContent === 'Origin set');
    click('[data-tab="machine"]');
    expect(document.querySelector('.stp-mt-pill')).toBeNull();
    expect(document.querySelector('.stp-mt-stop')).toBeNull();
  });

  test('Plot: an emergency stop outside a job shows no Stopped/Resume card; a stopped job does', async () => {
    const c = await connectSim();
    if (c.confirmMachineCorner) await c.confirmMachineCorner();
    await c.setOrigin();
    click('[data-tab="plot"]');
    c.emit('done', { aborted: true, reason: 'estop', message: 'Emergency stop.', resumePoint: { pathIndex: 0, pathCount: 3 } });
    await new Promise((r) => setTimeout(r, 30));
    expect(document.getElementById('stp-resume')).toBeNull();
    c.emit('state', { state: 'running' });
    c.emit('done', { aborted: true, reason: 'stopped', message: 'Stopped by user.', resumePoint: { pathIndex: 0, pathCount: 3 } });
    await waitFor(() => document.getElementById('stp-resume'));
  });

  test('notes: the aria-live region is visually hidden; transient notes show inside the banner; emergency stop persists until the next action', async () => {
    const panel = STP.getPanel();
    const live = document.getElementById('stp-live-note');
    expect(live.classList.contains('sr-only')).toBe(true);
    panel.note('Jog stopped.');
    expect(document.getElementById('stp-banner-note').textContent).toBe('Jog stopped.');
    expect(document.getElementById('stp-banner').contains(document.getElementById('stp-banner-note'))).toBe(true);
    expect(live.textContent).toBe('Jog stopped.');
    panel.note('Emergency stop active.', { persist: true });
    expect(document.getElementById('stp-banner-note').classList.contains('is-persist')).toBe(true);
    document.querySelector('.stp-rail').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    expect(document.getElementById('stp-banner-note')).toBeNull();
  });

  test('auto-advances Connect -> Machine after connect; Machine -> Plot after the origin is set; glyphs follow', async () => {
    click('[data-tab="connect"]');
    const live = document.getElementById('stp-live-note');
    expect(live.getAttribute('aria-live')).toBe('polite');
    const c = await connectSim();
    await waitFor(() => STP.getPanel().tab === 'machine');
    expect(live.textContent).toMatch(/Connected/);
    if (c.confirmMachineCorner) await c.confirmMachineCorner();
    await waitFor(() => status('connect') === 'done');
    expect(status('machine')).toBe('attention');
    expect(bannerText()).toMatch(/top-left corner, then set the origin/);
    expect(document.getElementById('stp-banner-action')).toBeNull(); // Set origin here is in the pane: banner is text only
    await c.setOrigin();
    await waitFor(() => STP.getPanel().tab === 'plot');
    expect(live.textContent).toMatch(/Origin set/);
    expect(status('machine')).toBe('done');
    expect(status('plot')).toBe('attention');
    expect(bannerText()).toBe('Ready to plot');
    expect(document.getElementById('stp-banner-action')).toBeNull(); // the Plot pane has the giant Start plot
    click('[data-tab="setup"]');
    expect(document.getElementById('stp-banner-action').textContent).toBe('Start plot');
  });

  test('no auto-advance happens when the user is on another tab', async () => {
    click('[data-tab="setup"]');
    const c = await connectSim();
    await new Promise((r) => setTimeout(r, 150));
    expect(STP.getPanel().tab).toBe('setup');
    if (c.confirmMachineCorner) await c.confirmMachineCorner();
    await c.setOrigin();
    await new Promise((r) => setTimeout(r, 150));
    expect(STP.getPanel().tab).toBe('setup');
  });

  test('banner: origin step off the Machine tab offers Go to Machine; out of bounds offers Go to Setup', async () => {
    const c = await connectSim();
    if (c.confirmMachineCorner) await c.confirmMachineCorner();
    click('[data-tab="plot"]');
    await waitFor(() => /set the origin/.test(bannerText()));
    expect(document.getElementById('stp-banner-action').textContent).toBe('Go to Machine');
    await c.setOrigin();
    const panel = STP.getPanel();
    panel.saveSettings({ placement: { offsetX: 500 } });
    await waitFor(() => /doesn't fit/.test(bannerText()));
    expect(document.getElementById('stp-banner-action').textContent).toBe('Go to Setup');
    expect(status('setup')).toBe('attention');
    panel.saveSettings({ placement: { offsetX: 0 } });
    await waitFor(() => bannerText() === 'Ready to plot');
  });

  test('the header has a compact readout; the Machine tab has no position block', async () => {
    await connectSim();
    const ro = document.getElementById('stp-readout');
    expect(ro).toBeTruthy();
    expect(ro.hidden).toBe(false);
    expect(ro.closest('.stp-head')).toBeTruthy();
    expect(ro.querySelectorAll('[data-stp-pos]').length).toBe(3);
    click('[data-tab="machine"]');
    expect(document.querySelector('[data-pane="machine"] [data-stp-pos]')).toBeNull();
    expect(document.querySelector('[data-pane="machine"]').textContent).not.toMatch(/WPos|MPos/);
  });

  describe('header E-STOP and hotkeys', () => {
    test('E-STOP is hidden when disconnected, visible and neutral when idle, armed while a manual move is in flight', async () => {
      await waitFor(() => document.getElementById('stp-stop').hidden);
      const c = await connectSim();
      const stop = document.getElementById('stp-stop');
      await waitFor(() => !document.getElementById('stp-stop').hidden);
      expect(document.getElementById('stp-stop').disabled).toBe(false);
      expect(document.getElementById('stp-stop').dataset.armed).toBe('false');
      expect(stop).toBeTruthy();
      // a manual single jog in flight (state may be idle between short jogs) arms it
      if (c.confirmMachineCorner) await c.confirmMachineCorner();
      click('[data-tab="machine"]');
      let release;
      vi.spyOn(c, 'jog').mockImplementation(() => new Promise((r) => { release = () => r({ sent: true }); }));
      click('[data-stp-jog="e"]');
      await waitFor(() => document.getElementById('stp-stop').dataset.armed === 'true');
      expect(document.getElementById('stp-stop').hidden).toBe(false);
      expect(document.querySelector('[data-stp-act="dial-stop"]').hidden).toBe(false);
      release();
      await waitFor(() => document.getElementById('stp-stop').dataset.armed === 'false');
    });

    test('E-STOP is armed and enabled while a job runs; pointerdown calls emergencyStop', async () => {
      STP.simOptions = { bannerDelayMs: 10, speed: 3 };
      await STP.connectSession('sim', STP.getPanel().profile());
      const c = STP.getSession().controller;
      await waitFor(() => c.state === 'idle');
      if (c.confirmMachineCorner) await c.confirmMachineCorner();
      await c.setOrigin();
      c.emergencyStop = vi.fn(async () => { await c.stop(); });
      click('[data-tab="plot"]');
      await waitFor(() => { const s = document.getElementById('stp-start'); return s && !s.disabled; });
      click('#stp-start');
      await waitFor(() => c.state === 'running');
      const stop = document.getElementById('stp-stop');
      expect(stop.hidden).toBe(false);
      expect(stop.disabled).toBe(false);
      expect(stop.dataset.armed).toBe('true');
      stop.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      expect(c.emergencyStop).toHaveBeenCalledTimes(1);
      await waitFor(() => c.state === 'idle', 20000);
      STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
    }, 40000);

    test('Space and Escape trigger emergencyStop, but not while typing in an input', async () => {
      const c = await connectSim();
      c.emergencyStop = vi.fn(async () => ({}));
      const root = document.querySelector('.stp-root');
      key(root, ' ');
      expect(c.emergencyStop).toHaveBeenCalledTimes(1);
      const input = document.createElement('input');
      input.type = 'text';
      root.appendChild(input);
      input.focus();
      key(input, ' ');
      expect(c.emergencyStop).toHaveBeenCalledTimes(1);
      input.remove();
    });

    test('Escape triggers emergencyStop while the plotter is moving', async () => {
      const c = await connectSim();
      c.emergencyStop = vi.fn(async () => ({}));
      await c.jogContinuousStart({ x: 1, y: 0 }, 600).catch(() => null);
      await waitFor(() => c.state === 'jogging');
      key(document.querySelector('.stp-root'), 'Escape');
      expect(c.emergencyStop).toHaveBeenCalled();
      await c.jogCancel();
    });
  });

  describe('start-corner card (spec 12.3)', () => {
    const stubCorner = (c) => {
      c.machineCornerConfirmed = false;
      c.confirmMachineCorner = vi.fn(async () => { c.machineCornerConfirmed = true; c.emit('corner', { confirmed: true }); });
      c.emit('corner', { confirmed: false });
    };

    test('shown after connect while unconfirmed; Yes calls confirmMachineCorner and the card goes away', async () => {
      const c = await connectSim();
      stubCorner(c);
      await waitFor(() => document.getElementById('stp-corner'));
      expect(document.getElementById('stp-corner').textContent).toMatch(/start corner/);
      expect(status('connect')).toBe('attention');
      expect(document.getElementById('stp-banner-action')).toBeNull(); // the card replaces the step line
      click('#stp-corner-yes');
      expect(c.confirmMachineCorner).toHaveBeenCalledTimes(1);
      await waitFor(() => !document.getElementById('stp-corner'));
      expect(status('connect')).toBe('done');
    });

    test('No / not sure shows the power-cycle steps and a Reconnect button', async () => {
      const c = await connectSim();
      stubCorner(c);
      await waitFor(() => document.getElementById('stp-corner'));
      click('#stp-corner-no');
      expect(document.getElementById('stp-corner-steps').textContent).toMatch(/off[\s\S]*corner[\s\S]*on again[\s\S]*Reconnect/);
      expect(document.getElementById('stp-corner-reconnect')).toBeTruthy();
      expect(c.confirmMachineCorner).not.toHaveBeenCalled();
    });

    test('Start is blocked with a reason while the corner is unconfirmed', async () => {
      const c = await connectSim();
      if (c.confirmMachineCorner) await c.confirmMachineCorner();
      await c.setOrigin();
      stubCorner(c);
      await waitFor(() => document.getElementById('stp-corner'));
      click('[data-tab="plot"]');
      expect(document.getElementById('stp-start').disabled).toBe(true);
      expect(document.getElementById('stp-start-why').textContent).toMatch(/start corner/);
    });
  });

  test('a wco-mismatch event puts the origin warning with Set origin here in the banner', async () => {
    const c = await connectSim();
    if (c.confirmMachineCorner) await c.confirmMachineCorner();
    await c.setOrigin();
    click('[data-tab="setup"]');
    c.emit('wco-mismatch', { device: { x: 1, y: 1 }, expected: { x: 0, y: 0 } });
    await waitFor(() => /origin doesn't match/.test(bannerText()));
    expect(document.getElementById('stp-banner-action').textContent).toBe('Set origin here');
  });

  test('refusals reported by the tools (position-untrusted) show their message in the banner', async () => {
    await connectSim();
    STP.getPanel().ctx.reportError(Object.assign(new Error('The plotter position is not trusted. Set the origin again.'), { code: 'position-untrusted' }));
    expect(document.getElementById('stp-banner-err').textContent).toMatch(/not trusted/);
  });

  test('the out-of-bounds message names the safety margin when the overflow is within it', () => {
    const panel = STP.getPanel();
    const real = panel.profile;
    panel.profile = () => Object.assign({}, real.call(panel), { limits: { edgeMargin: 2 } });
    expect(panel.overflowMessage({ ok: false, overflow: { left: 0, right: 1.5, top: 0, bottom: 0 } })).toMatch(/\(2 mm safety margin from the frame\)/);
    expect(panel.overflowMessage({ ok: false, overflow: { left: 0, right: 30, top: 0, bottom: 0 } })).not.toMatch(/safety margin/);
    panel.profile = real;
  });

  test('Advanced sections are collapsed by default and remember their state for the session', async () => {
    const panel = STP.getPanel();
    ['connect', 'setup', 'plot', 'machine'].forEach((t) => panel.showTab(t));
    // (the machine tab's first-run checklist is open on purpose until calibration is complete)
    const all = Array.from(document.querySelectorAll('.stp-pane details:not([data-stp-adv="calibration"])'));
    expect(all.length).toBeGreaterThan(5);
    all.forEach((d) => expect(d.open, d.querySelector('summary').textContent).toBe(false));
    const optimization = document.querySelector('[data-adv="optimize"]');
    optimization.open = true;
    optimization.dispatchEvent(new window.Event('toggle'));
    panel.showTab('connect');
    expect(document.querySelector('[data-adv="optimize"]').open).toBe(true);
    optimization.open = false;
    optimization.dispatchEvent(new window.Event('toggle'));
    // the profile grid is collapsed behind a compact selected-profile row
    panel.showTab('connect');
    expect(document.querySelector('.stp-selrow')).toBeTruthy();
    expect(document.querySelector('.stp-card')).toBeNull();
    click('#stp-change-profile');
    expect(document.querySelectorAll('.stp-card').length).toBeGreaterThan(1);
    click('#stp-change-profile');
  });

  describe('rotation pictures follow the document orientation', () => {
    const iconRect = (deg) => document.querySelector(`.stp-rotcard[data-rotate="${deg}"] svg rect`);
    const dims = (deg) => ({ w: Number(iconRect(deg).getAttribute('width')), h: Number(iconRect(deg).getAttribute('height')) });
    const setDoc = (w, h) => {
      const panel = STP.getPanel();
      panel.s.geometry = Object.assign({}, panel.s.geometry, { docSize: { width: w, height: h } });
      panel.updateRotIcons();
    };

    test('landscape document: 0 and 180 are landscape, 90 and 270 portrait', () => {
      setDoc(420, 297);
      [0, 180].forEach((d) => expect(dims(d).w).toBeGreaterThan(dims(d).h));
      [90, 270].forEach((d) => expect(dims(d).h).toBeGreaterThan(dims(d).w));
    });

    test('portrait document: the reverse; square stays square', () => {
      setDoc(297, 420);
      [0, 180].forEach((d) => expect(dims(d).h).toBeGreaterThan(dims(d).w));
      [90, 270].forEach((d) => expect(dims(d).w).toBeGreaterThan(dims(d).h));
      setDoc(200, 200);
      [0, 90, 180, 270].forEach((d) => expect(dims(d).w).toBe(dims(d).h));
    });

    test('each icon carries a top marker and Refresh from canvas re-reads the document size', () => {
      expect(document.querySelectorAll('.stp-rotcard svg [data-top-marker]').length).toBe(4);
      const panel = STP.getPanel();
      const orig = panel.ui.getExportSnapshot.bind(panel.ui);
      panel.ui.getExportSnapshot = () => { const sn = orig(); return Object.assign({}, sn, { prof: Object.assign({}, sn.prof, { width: 400, height: 200 }) }); };
      try {
        click('#stp-refresh');
        expect(dims(0).w).toBeGreaterThan(dims(0).h);
      } finally { panel.ui.getExportSnapshot = orig; }
    });
  });
});
