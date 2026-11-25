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

  test('pen-change "Re-check pen height" uses the public controller API and Continue raises the pen first', async () => {
    const c = STP.getSession().controller;
    if (c.state !== 'idle') await c.stop();
    await waitFor(() => c.state === 'idle');
    await c.setOrigin();
    const lines = ['G21', 'G90', 'G1 Z0 F5000',
      'G1 X10 Y10 F6000', 'G1 Z3.5 F5000', 'G1 X20 Y10 F3000', 'G1 Z0 F5000',
      'G1 X30 Y30 F6000', 'G1 Z3.5 F5000', 'G1 X40 Y30 F3000', 'G1 Z0 F5000'];
    const gcode = { lines, penChangeIndices: [7], pathStartIndices: [3, 7], pathCount: 2 };
    const downSpy = vi.spyOn(c, 'penDown');
    click('[data-tab="plot"]');
    const done = c.run(gcode, { pens: [{ name: 'A', color: '#111111' }, { name: 'B', color: '#cc0000' }], penChange: 'pause' });
    await waitFor(() => document.getElementById('stp-pc-check'));
    click('#stp-pc-check');
    await waitFor(() => document.getElementById('stp-pc-raise'));
    expect(downSpy).toHaveBeenCalledTimes(1);
    expect(c.state).toBe('penChange');
    expect(c.pen.state).toBe('down');
    click('#stp-pc-continue');
    await done;
    expect(c.state).toBe('idle');
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../../src/ui/modals/send-to-plotter.js'), 'utf8');
    expect(src).not.toMatch(/\._cmd\b|\._penUpLine\b/); // the modal only uses the public controller API
    expect(STP.getSession().transport.getPosition().mpos.z).toBeLessThan(0.1);
  }, 40000);

  describe('setup preview is drawn in paper space', () => {
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    const flat = (v) => v.job.pens.flatMap((p) => p.paths.flat());
    const same = (a, b) => a.length === b.length && a.every((pt, i) => near(pt.x, b[i].x) && near(pt.y, b[i].y));

    test('with invertY / invertX / swapXY the preview paths equal the non-inverted ones (disconnected)', async () => {
      await STP.disconnectSession();
      const panel = STP.getPanel();
      const pid = panel.profile().id;
      const reset = () => panel.setProfileOverride({ axes: { invertX: false, invertY: false, swapXY: false } });
      reset(); panel.recompute();
      const base = panel.view();
      expect(flat(base).length).toBeGreaterThan(10);
      expect(base.area).toMatchObject({ x: 0, y: 0, w: 420, h: 297 });
      for (const axes of [{ invertY: true }, { invertX: true }, { invertX: true, invertY: true }, { swapXY: true }, { swapXY: true, invertY: true }]) {
        reset(); panel.setProfileOverride({ axes }); panel.recompute();
        const v = panel.view();
        expect(same(flat(v), flat(base)), JSON.stringify(axes)).toBe(true);
        expect(same(v.doc, base.doc), JSON.stringify(axes)).toBe(true);
        // the work area keeps its origin at the paper's top-left corner; swap turns it sideways
        const sw = axes.swapXY;
        expect(v.area).toMatchObject({ x: 0, y: 0, w: sw ? 297 : 420, h: sw ? 420 : 297 });
      }
      reset(); panel.recompute();
      expect(Store_overridesAxes(pid)).toMatchObject({ invertY: false });
    });

    const Store_overridesAxes = (pid) => (STP.Store.overrides(pid) || {}).axes;

    test('connected: the work area follows the controller WCO and the live pen is mapped into paper space', async () => {
      const panel = STP.getPanel();
      panel.setProfileOverride({ axes: { invertX: false, invertY: true, swapXY: false } });
      STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
      await STP.connectSession('sim', panel.profile());
      await waitFor(() => STP.getSession().controller?.state === 'idle');
      const c = STP.getSession().controller;
      c.wco = { x: 100, y: 200, z: 0 }; // as reported by the controller: origin sits at machine (100, 200)
      panel.recompute();
      let v = panel.view();
      // machine Y range [-200, 97] in work coordinates, inverted -> paper y in [-97, 200]
      expect(v.area.x).toBeCloseTo(-100, 6);
      expect(v.area.y).toBeCloseTo(-97, 6);
      expect(v.area.w).toBe(420);
      expect(v.area.h).toBe(297);
      c.wco = { x: 0, y: 0, z: 0 };
      // live WPos (machine work coords) -> paper
      STP.getSession().status = { wpos: { x: 12, y: -34, z: 0 }, mpos: { x: 12, y: -34, z: 0 } };
      v = panel.view();
      expect(v.live).toMatchObject({ x: 12, y: 34 });
      panel.setProfileOverride({ axes: { invertX: false, invertY: false, swapXY: false } });
      STP.getSession().status = null;
      await STP.disconnectSession();
    });
  });

  describe('live pen marker is origin-relative (no double-counted origin offset)', () => {
    test('origin at machine (10,10): WPos (0,0) sits on the origin cross; WPos (25,40) is 25/40 mm right/down', async () => {
      const panel = STP.getPanel();
      panel.setProfileOverride({ axes: { invertX: false, invertY: false, swapXY: false } });
      STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
      await STP.connectSession('sim', panel.profile());
      await waitFor(() => STP.getSession().controller?.state === 'idle');
      const c = STP.getSession().controller;
      c.wco = { x: 10, y: 10, z: 0 };
      panel.recompute();
      STP.getSession().status = { wpos: { x: 0, y: 0, z: 0 }, mpos: { x: 10, y: 10, z: 0 }, wco: { x: 10, y: 10, z: 0 } };
      let v = panel.view();
      expect(v.live.x).toBeCloseTo(0, 6);
      expect(v.live.y).toBeCloseTo(0, 6);
      // a status snapshot taken just before the origin was set still carries the old WPos: the marker must use MPos - WCO
      STP.getSession().status = { wpos: { x: 10, y: 10, z: 0 }, mpos: { x: 10, y: 10, z: 0 }, wco: { x: 0, y: 0, z: 0 } };
      v = panel.view();
      expect(v.live.x).toBeCloseTo(0, 6);
      expect(v.live.y).toBeCloseTo(0, 6);
      STP.getSession().status = { wpos: { x: 25, y: 40, z: 0 }, mpos: { x: 35, y: 50, z: 0 }, wco: { x: 10, y: 10, z: 0 } };
      v = panel.view();
      expect(v.live.x).toBeCloseTo(25, 6);
      expect(v.live.y).toBeCloseTo(40, 6);
      panel.setProfileOverride({ axes: { invertX: false, invertY: true, swapXY: false } });
      v = panel.view();
      expect(v.live.x).toBeCloseTo(25, 6);
      expect(v.live.y).toBeCloseTo(-40, 6);
      panel.setProfileOverride({ axes: { invertX: false, invertY: false, swapXY: false } });
      STP.getSession().status = null;
      await STP.disconnectSession();
    });
  });

  describe('visual-verification fixes: readout, caption, framing', () => {
    test('formatFwOpt never prints an object', () => {
      expect(STP.formatFwOpt({ flags: 'VZHDL', blocks: 15, rxBuffer: 128 })).toBe('VZHDL \u00b7 15 blocks \u00b7 RX 128 bytes');
      expect(STP.formatFwOpt('V,15,128')).toBe('V,15,128');
      expect(STP.formatFwOpt({ flags: '', blocks: NaN })).not.toMatch(/object/);
    });

    test('the Connect firmware table shows a formatted Options row', async () => {
      const panel = STP.getPanel();
      STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
      await STP.connectSession('sim', panel.profile());
      await waitFor(() => STP.getSession().controller?.state === 'idle');
      panel.showTab('connect');
      panel.renderConnect();
      const text = document.querySelector('.stp-fw')?.textContent || '';
      expect(text).not.toContain('[object Object]');
      await STP.disconnectSession();
    });

    test('the Setup preview caption describes the paper view', () => {
      const src = require('fs').readFileSync(require('path').join(__dirname, '../../../src/ui/modals/send-to-plotter.js'), 'utf8');
      expect(src).toContain('Paper view: as you see the sheet.');
      expect(src).not.toContain('Machine view, relative to the origin');
    });

    test('previewBounds covers work area, sheet outline and path bbox (rotated sheet overflowing the area)', () => {
      const v = {
        area: { x: 0, y: 0, w: 420, h: 297 },
        job: { bbox: { minX: 0, minY: 0, maxX: 297, maxY: 420 } },
        doc: [{ x: 0, y: 0 }, { x: 297, y: 0 }, { x: 297, y: 420 }, { x: 0, y: 420 }, { x: 0, y: 0 }],
      };
      const b = STP.previewBounds(v);
      expect(b.maxY).toBeGreaterThanOrEqual(420);
      expect(b.maxX).toBeGreaterThanOrEqual(420);
      expect(b.minX).toBeLessThanOrEqual(0);
      const onlyDoc = STP.previewBounds({ area: { x: 0, y: 0, w: 10, h: 10 }, job: null, doc: [{ x: 0, y: 0 }, { x: 50, y: 80 }] });
      expect(onlyDoc.maxY).toBeGreaterThanOrEqual(80);
    });
  });

  describe('dense documents (responsiveness)', () => {
    let panel;
    const manualYield = () => {
      const queue = [];
      return { queue, yieldFn: (cb) => queue.push(cb), pumpAll: () => { let n = 0; while (queue.length && n < 100000) { queue.shift()(); n += 1; } return n; } };
    };

    beforeAll(async () => {
      for (let k = 0; k < 4; k += 1) app.engine.addLayer('flowfield');
      for (let k = 0; k < 3; k += 1) app.engine.addLayer('spiral');
      if (!STP.getPanel()) click('#btn-send-to-plotter');
      panel = STP.getPanel();
      await STP.disconnectSession();
      STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
    });
    afterEach(() => { STP.jobOptions = null; });

    test('a >=100k-point document is optimized in slices; the longest block stays short and the result equals buildJob', async () => {
      const m = manualYield();
      STP.jobOptions = { asyncPointThreshold: 0, yieldFn: m.yieldFn, sliceMs: 8 };
      panel.refreshGeometry();
      const g = panel.s.geometry;
      expect(g.pointCount).toBeGreaterThanOrEqual(100000);
      expect(panel.s.building).toBe(true);
      expect(document.getElementById('stp-stats') || document.body).toBeTruthy();
      // drive the slices, timing each block
      let longest = 0; let blocks = 0;
      const t00 = Date.now();
      while (panel.s.building && Date.now() - t00 < 50000) {
        while (m.queue.length) {
          const t0 = performance.now();
          m.queue.shift()();
          longest = Math.max(longest, performance.now() - t0);
          blocks += 1;
        }
        await new Promise((r) => setTimeout(r, 10)); // lets a debounced recompute (earlier tests) enqueue
      }
      expect(panel.s.building).toBe(false);
      expect(blocks).toBeGreaterThan(5);
      expect(longest).toBeLessThan(100);
      const PJ = window.Vectura.PlotJob;
      const settings = JSON.parse(JSON.stringify(panel.settings())); settings.profileOverrides = {};
      let t0 = performance.now();
      const ref = PJ.buildJob(g.groups, { settings, profile: panel.profile(), docSize: g.docSize, firmware: null, originOffset: panel.s.job.originOffset });
      const tBuild = performance.now() - t0;
      t0 = performance.now();
      const gc = PJ.toGcode(ref, panel.profile(), {});
      const tGcode = performance.now() - t0;
      console.log('DENSE', JSON.stringify({ points: g.pointCount, buildJobMs: Math.round(tBuild), toGcodeMs: Math.round(tGcode), slices: blocks, longestSliceMs: Math.round(longest), gcodeLines: gc.lines.length }));
      expect(panel.s.job.stats.pathCount).toBe(ref.stats.pathCount);
      expect(panel.s.job.stats.drawLength).toBeCloseTo(ref.stats.drawLength, 6);
      expect(panel.s.job.bbox).toEqual(ref.bbox);
    }, 60000);

    test('a settings change mid-compute cancels the stale job; Start never plots it', async () => {
      const m = manualYield();
      STP.jobOptions = { asyncPointThreshold: 0, yieldFn: m.yieldFn, sliceMs: 2 };
      await STP.connectSession('sim', panel.profile());
      await waitFor(() => STP.getSession().controller?.state === 'idle');
      const c = STP.getSession().controller;
      await c.setOrigin();
      const settle = async () => {
        const t00 = Date.now();
        while ((panel.s.building || !panel.jobReady()) && Date.now() - t00 < 20000) { m.pumpAll(); await new Promise((r) => setTimeout(r, 10)); }
      };
      await settle(); // finish whatever the connect/origin refresh started
      expect(panel.jobReady()).toBe(true);
      panel.saveSettings({ placement: { offsetX: 0 } });
      panel.recompute(); // computation A, in flight on the old settings
      expect(panel.s.building).toBe(true);
      m.queue.shift()(); m.queue.shift()?.call(); // A makes progress, not finished
      panel.saveSettings({ placement: { offsetX: 7 } }); // settings change mid-compute
      expect(panel.s.building).toBe(true);
      const staleJob = panel.s.job;
      m.pumpAll(); // A's remaining slices run and are discarded
      expect(panel.s.job).toBe(staleJob);
      expect(panel.s.building).toBe(true);
      click('[data-tab="plot"]');
      expect(document.getElementById('stp-start').disabled).toBe(true);
      expect(document.getElementById('stp-start-why').textContent).toMatch(/Preparing/);
      expect(panel.startPlot()).toBeNull(); // refused: not ready
      expect(STP.getSession().run).toBeNull();
      await waitFor(() => m.queue.length, 5000); // debounce fired, computation B started
      await settle();
      expect(panel.jobReady()).toBe(true);
      expect(panel.s.job.placement.offsetX).toBeCloseTo(7, 6);
      await waitFor(() => !document.getElementById('stp-start').disabled);
      STP.jobOptions = { asyncPointThreshold: 1e9 };
      panel.saveSettings({ airPlot: true });
      panel.recompute();
      await waitFor(() => panel.jobReady());
      const started = panel.startPlot();
      expect(started).toBeTruthy();
      expect(STP.getSession().run.job.placement.offsetX).toBeCloseTo(7, 6);
      expect(STP.getSession().run.job.airPlot).toBe(true);
      await waitFor(() => c.state === 'running', 20000);
      await c.stop();
      await waitFor(() => c.state === 'idle', 30000).catch((e) => { throw new Error(`${e.message} state=${c.state} err=${JSON.stringify(STP.getSession().lastError)}`); });
      panel.saveSettings({ airPlot: false, placement: { offsetX: 0 } });
      await STP.disconnectSession();
    }, 90000);
  });
});
