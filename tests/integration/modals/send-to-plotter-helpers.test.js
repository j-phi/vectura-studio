/*
 * Plot-tab helper actions driven through the Send to Plotter modal against the SimulatorTransport only
 * (no serial port is ever opened): Frame (air), Scale check (100 mm square, pen down), Test swatch
 * (rows x cols grid, each patch at its own feed and pen-down height), and refusal when out of bounds.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Send to Plotter helper actions (Frame, Scale check, Test swatch)', () => {
  let runtime; let window; let document; let app; let STP; let panel; let c; let sim;

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
  const motionCount = () => sim.getLog().filter((e) => e.dir === 'in' && e.type === 'line' && /^G[01]\b/.test(e.data)).length;
  const finish = async () => {
    await waitFor(() => c.state === 'idle' && STP.getSession().lastResult && !STP.getSession().lastResult.aborted && STP.getSession().run);
  };
  const reset = () => { sim.clearLog(); sim.clearTrace(); STP.getSession().lastResult = null; STP.getSession().run = null; };
  const UP = () => panel.profile().pen.up;

  // Replays the G1 lines the simulator received: [{x, y, z, f, down}] per motion line (F and Z are modal).
  const replay = () => {
    const out = []; const st = { x: 0, y: 0, z: 0, f: 0 };
    sim.getLog().filter((e) => e.dir === 'in' && e.type === 'line').forEach((e) => {
      const m = /^G1\b(.*)$/.exec(e.data);
      if (!m) return;
      const w = (k) => { const r = new RegExp(`${k}(-?[0-9.]+)`).exec(m[1]); return r ? Number(r[1]) : null; };
      ['X', 'Y', 'Z', 'F'].forEach((k) => { const v = w(k); if (v !== null) st[k.toLowerCase()] = v; });
      out.push({ x: st.x, y: st.y, z: st.z, f: st.f, down: st.z > UP() + 0.05, hasXY: w('X') !== null || w('Y') !== null });
    });
    return out;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    STP = window.Vectura.UI.Modals.SendToPlotter;
    STP.simOptions = { bannerDelayMs: 10, speed: 4000 };
    app.engine.addLayer('lissajous');
    app.render?.();
    click('#btn-send-to-plotter');
    panel = STP.getPanel();
    await STP.connectSession('sim', panel.profile());
    c = STP.getSession().controller;
    sim = STP.getSession().transport;
    await waitFor(() => c.state === 'idle');
    if (c.confirmMachineCorner) await c.confirmMachineCorner();
     await c.setOrigin();
    click('[data-tab="plot"]');
    await waitFor(() => panel.jobReady());
  });

  afterAll(async () => {
    try { await STP.disconnectSession(); } catch (e) { /* ignore */ }
    STP.getPanel()?.close();
    runtime?.cleanup?.();
    runtime = null;
  });

  test('Frame traces the job bounding box in the air: the pen is never below up and nothing is drawn', async () => {
    reset();
    await waitFor(() => !document.getElementById('stp-frame').disabled);
    click('#stp-frame');
    await finish();
    const b = panel.s.job.bbox;
    const moves = replay();
    expect(moves.length).toBeGreaterThan(3);
    expect(moves.every((m) => m.z <= UP() + 1e-9)).toBe(true);
    expect(sim.getTrace().length).toBe(0);
    const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]];
    corners.forEach(([x, y]) => {
      expect(moves.some((m) => m.hasXY && Math.abs(m.x - x) < 1e-3 && Math.abs(m.y - y) < 1e-3), `corner ${x},${y}`).toBe(true);
    });
    expect(c.pen.state).toBe('up');
  });

  test('Scale check draws a 100 mm square with a cross, pen down', async () => {
    reset();
    click('#stp-scale-check');
    await finish();
    const polys = sim.getPolylines();
    const sizeOf = (pl) => {
      const xs = pl.map((p) => p.x); const ys = pl.map((p) => p.y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const square = polys.find((pl) => pl.length === 5 && Math.abs(sizeOf(pl).w - 100) < 1e-3 && Math.abs(sizeOf(pl).h - 100) < 1e-3);
    expect(square, JSON.stringify(polys.map(sizeOf))).toBeTruthy();
    expect(Math.hypot(square[0].x - square[4].x, square[0].y - square[4].y)).toBeLessThan(1e-6); // closed
    expect(polys.filter((pl) => pl.length === 2 && Math.abs(sizeOf(pl).w - 50) < 1e-3 + (sizeOf(pl).h > 1 ? 50 : 0)).length).toBe(2);
    const t = sim.getTrace();
    expect(t.length).toBe(4 + 1 + 1);
    expect(t.every((s) => s.z > UP() + 0.05)).toBe(true);
    expect(t.every((s) => Math.abs(s.z - panel.profile().pen.down) < 1e-3)).toBe(true);
  });

  test('Test swatch draws rows x cols patches; every patch uses the feed and pen-down height of its cell', async () => {
    reset();
    panel.saveSettings({ swatch: { rows: '1500, 3000, 6000', cols: '2.5, 3.5', pattern: 'zigzag', size: 15, offsetX: 0, offsetY: 0 } });
    const rows = [1500, 3000, 6000]; const cols = [2.5, 3.5]; const size = 15; const gap = 5;
    click('#stp-swatch-plot');
    await finish();
    const downs = replay().filter((m) => m.down && m.hasXY);
    const cellOf = (m) => ({ c: Math.floor((m.x + 1e-6) / (size + gap)), r: Math.floor((m.y + 1e-6) / (size + gap)) });
    const seen = new Map();
    downs.forEach((m) => {
      const cell = cellOf(m);
      expect(cell.r).toBeGreaterThanOrEqual(0); expect(cell.r).toBeLessThan(rows.length);
      expect(cell.c).toBeGreaterThanOrEqual(0); expect(cell.c).toBeLessThan(cols.length);
      expect(m.f, `F in cell ${cell.r},${cell.c}`).toBe(rows[cell.r]);
      expect(m.z, `Z in cell ${cell.r},${cell.c}`).toBeCloseTo(cols[cell.c], 3);
      seen.set(`${cell.r},${cell.c}`, true);
    });
    expect(seen.size).toBe(rows.length * cols.length);
    // the simulator trace agrees: one connected group of segments per patch
    expect(new Set(sim.getTrace().map((s) => `${Math.floor((s.from.y + 1e-6) / (size + gap))},${Math.floor((s.from.x + 1e-6) / (size + gap))}`)).size).toBe(rows.length * cols.length);
  });

  describe('out of bounds is refused before any byte of motion is sent', () => {
    const expectRefused = (before) => {
      const err = document.getElementById('stp-plot-error');
      expect(err && err.textContent).toMatch(/Out of bounds/);
      expect(motionCount()).toBe(before);
      expect(STP.getSession().run).toBeNull();
      expect(c.state).toBe('idle');
    };

    test('Scale check', async () => {
      reset();
      panel.saveSettings({ swatch: { offsetX: 400, offsetY: 0 } });
      const before = motionCount();
      click('#stp-scale-check');
      expectRefused(before);
    });

    test('Test swatch', async () => {
      reset();
      panel.saveSettings({ swatch: { rows: '1500, 3000', cols: '2.5, 3.5', size: 15, offsetX: 400, offsetY: 0 } });
      const before = motionCount();
      click('#stp-swatch-plot');
      expectRefused(before);
    });

    test('Frame', async () => {
      reset();
      panel.saveSettings({ swatch: { offsetX: 0 }, placement: { offsetX: 500 } });
      await waitFor(() => panel.jobReady());
      const before = motionCount();
      click('#stp-frame');
      expectRefused(before);
      panel.saveSettings({ placement: { offsetX: 0 } });
    });
  });
});
