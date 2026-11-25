const {
  T, a3, setup, connected, connectedWithOrigin, makeJob, drawnSegments, motionLog, until, assertAllSafe, wireLabels, PlotterController,
} = require('./plotter-test-helpers.js');
const { PlotterError } = require('../../../src/core/plotter/plotter-controller.js');

const square = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }, { x, y }];
const PENS = [
  [square(10, 10, 40), [{ x: 70, y: 20 }, { x: 120, y: 30 }]],
  [[{ x: 100, y: 100 }, { x: 150, y: 120 }, { x: 200, y: 100 }], square(200, 150, 30)],
];

// Geometry check that tolerates a block split by a feed hold: same total drawn length and endpoints.
const expectSameDrawing = (sim, groups) => {
  const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const want = drawnSegments(groups).reduce((n, w) => n + len(w.from, w.to), 0);
  const got = sim.getTrace();
  expect(got.reduce((n, g) => n + len(g.from, g.to), 0)).toBeCloseTo(want, 2);
  const first = drawnSegments(groups)[0];
  expect(got[0].from.x).toBeCloseTo(first.from.x, 3);
  const lastW = drawnSegments(groups).slice(-1)[0];
  expect(got[got.length - 1].to.y).toBeCloseTo(lastW.to.y, 3);
};

const expectTrace = (sim, groups) => {
  const want = drawnSegments(groups);
  const got = sim.getTrace();
  expect(got.length).toBe(want.length);
  want.forEach((w, i) => {
    expect(got[i].from.x).toBeCloseTo(w.from.x, 3);
    expect(got[i].from.y).toBeCloseTo(w.from.y, 3);
    expect(got[i].to.x).toBeCloseTo(w.to.x, 3);
    expect(got[i].to.y).toBeCloseTo(w.to.y, 3);
  });
};

afterEach(() => { PlotterController.resetOwnership(); });

describe('connect', () => {
  test('waits for the banner, then does a read-only handshake with zero motion', async () => {
    const s = await connected();
    expect(s.ctrl.state).toBe('idle');
    expect(s.sim.getStats().droppedWhileBooting).toBe(0);
    const labels = wireLabels(s.sim);
    labels.forEach((l) => expect(['$I', '$$', '$G', '?', '']).toContain(l));
    expect(labels[0]).toBe('$I'); // nothing was sent before the banner arrived
    expect(s.sim.getStats().motionLines).toBe(0);
    expect(s.sim.getTrace()).toEqual([]);
    expect(s.sim.getPosition().mpos).toEqual({ x: 0, y: 0, z: 0 });
    expect(assertAllSafe(s.sim)).toEqual([]);
    expect(s.ctrl.originSet).toBe(false);
    expect(s.ctrl.fw[130]).toBe(420);
    expect(s.ctrl.fw[22]).toBe(0);
    expect(s.ctrl.firmware.ver).toMatch(/DrawCore/);
    expect(s.ctrl.rxBuffer).toBe(127);
    await s.ctrl.disconnect();
  });

  test('without a banner it falls back to a blank line and $I after the timeout', async () => {
    const s = setup({ sim: { resetOnOpen: false } });
    await s.run(s.ctrl.connect());
    expect(s.ctrl.state).toBe('idle');
    expect(wireLabels(s.sim).slice(0, 2)).toEqual(['', '$I']);
    expect(s.sim.getStats().motionLines).toBe(0);
  });

  test('is tolerant of a query that never gets an ok (timeouts, not hangs)', async () => {
    const s = setup();
    s.sim.injectFault({ type: 'dropOk', match: /^\$\$$/ });
    await s.run(s.ctrl.connect());
    expect(s.ctrl.state).toBe('idle');
    expect(s.ctrl.fw[130]).toBe(420);
  });

  test('a second controller cannot open another port (single owner)', async () => {
    const a = await connected();
    const b = setup();
    await expect(b.run(b.ctrl.connect())).rejects.toThrow(/already open/);
    await a.ctrl.disconnect();
    await b.run(b.ctrl.connect());
    expect(b.ctrl.state).toBe('idle');
  });

  test('connect does not move, and a pen left down is raised before the first XY move', async () => {
    const s = setup({ sim: { initialPosition: { x: 0, y: 0, z: 3.5 } } });
    await s.run(s.ctrl.connect());
    expect(s.sim.getStats().motionLines).toBe(0);
    expect(s.ctrl.penMustRaise).toBe(true);
    await s.run(s.ctrl.jog(5, 0));
    const labels = wireLabels(s.sim);
    const z = labels.findIndex((l) => /^G1 Z0 /.test(l));
    const jog = labels.findIndex((l) => /^\$J=/.test(l));
    expect(z).toBeGreaterThan(-1);
    expect(z).toBeLessThan(jog);
  });

  test.each(['mpos', 'wpos', 'both'])('works with %s status reports', async (mode) => {
    const s = await connectedWithOrigin({ sim: { statusMode: mode } });
    const r = await s.run(s.ctrl.jog(10, 5));
    expect(r.sent).toBe(true);
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(10, 3);
    expect(s.ctrl.status.wpos.x).toBeCloseTo(10, 3);
  });

  test('transport open failure leaves the controller disconnected and releases ownership', async () => {
    const s = setup();
    s.sim.open = async () => { throw new Error('nope'); };
    await expect(s.run(s.ctrl.connect())).rejects.toThrow(/nope/);
    expect(s.ctrl.state).toBe('disconnected');
    const t = setup();
    await t.run(t.ctrl.connect());
    expect(t.ctrl.state).toBe('idle');
  });
});

describe('manual moves', () => {
  test('jog clamps at the bounds and reports atLimit', async () => {
    const s = await connectedWithOrigin();
    let r = await s.run(s.ctrl.jog(-10, -10));
    expect(r.sent).toBe(false);
    expect(r.atLimit).toMatchObject({ x: 'min', y: 'min', any: true });
    r = await s.run(s.ctrl.jog(1000, 0));
    expect(r.sent).toBe(true);
    expect(r.target.x).toBe(420);
    expect(r.atLimit.x).toBe('max');
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().mpos.x).toBeCloseTo(420, 3);
    expect(s.sim.getState()).toBe('Idle'); // never alarmed
    r = await s.run(s.ctrl.jog(5, 0));
    expect(r.sent).toBe(false);
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('jog bounds are relative to the set origin', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(100, 80));
    await until(s.clock, () => s.ctrl.state === 'idle');
    await s.run(s.ctrl.setOrigin());
    expect(s.ctrl.originMachine).toEqual({ x: 100, y: 80 });
    let r = await s.run(s.ctrl.jog(-150, 0));
    expect(r.target.x).toBe(-100);
    expect(r.atLimit.x).toBe('min');
    await until(s.clock, () => s.ctrl.state === 'idle');
    r = await s.run(s.ctrl.jog(1000, 1000));
    expect(r.target).toEqual({ x: 320, y: 217 });
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().mpos).toMatchObject({ x: 420, y: 297 });
  });

  test('jog feed is clamped to the jog cap', async () => {
    const s = await connectedWithOrigin();
    const r = await s.run(s.ctrl.jog(5, 0, 99999));
    expect(r.feed).toBe(6000);
  });

  test('continuous jog cancels with 0x85 then G4 P0 and stops short of the target', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    expect(s.ctrl.state).toBe('jogging');
    await s.clock.advance(1500);
    await s.run(s.ctrl.jogContinuousStop());
    expect(s.ctrl.state).toBe('idle');
    const labels = wireLabels(s.sim);
    const cancel = labels.lastIndexOf('0x85');
    expect(cancel).toBeGreaterThan(-1);
    expect(labels[cancel + 1]).toBe('G4 P0');
    const x = s.sim.getPosition().mpos.x;
    expect(x).toBeGreaterThan(5);
    await s.clock.advance(10000);
    expect(s.sim.getPosition().mpos.x).toBeCloseTo(x, 6);
    expect(s.sim.getState()).toBe('Idle');
    // each queued segment is at most 0.25 s of travel (12.5 mm at 3000 mm/min)
    const jogs = labels.filter((l) => /^\$J=/.test(l));
    jogs.forEach((l, i) => {
      const cur = parseFloat(/X([-\d.]+)/.exec(l)[1]);
      const prev = i ? parseFloat(/X([-\d.]+)/.exec(jogs[i - 1])[1]) : 0;
      expect(cur - prev).toBeLessThanOrEqual(12.5 + 1e-6);
    });
  });

  test('continuous jog stops itself at the limit and emits limit', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.jogContinuousStart({ x: -1, y: 0 }, 3000));
    await until(s.clock, () => s.events.some((e) => e.name === 'limit'), 20000);
    await s.clock.advance(1000);
    expect(s.sim.getState()).toBe('Idle');
    expect(s.sim.getPosition().mpos.x).toBe(0);
  });

  test('pen up / down / height are clamped', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.penDown());
    expect(wireLabels(s.sim)).toContain('G1 Z3.5 F5000');
    await s.run(s.ctrl.penUp());
    let r = await s.run(s.ctrl.setPenHeight(99));
    expect(r).toEqual({ z: 10, clamped: true });
    r = await s.run(s.ctrl.setPenHeight(-5));
    expect(r.z).toBe(0);
    await s.clock.advance(1000);
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('setOrigin sends only G92 X0 Y0 and refuses while moving', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(30, 0));
    await expect(s.run(s.ctrl.setOrigin())).rejects.toThrow(/stop moving/);
    await until(s.clock, () => s.ctrl.state === 'idle');
    await s.run(s.ctrl.setOrigin());
    expect(wireLabels(s.sim).filter((l) => /G92/.test(l))).toEqual(['G92 X0 Y0']);
    expect(s.ctrl.originSet).toBe(true);
    expect(s.events.some((e) => e.name === 'origin')).toBe(true);
  });

  test('goTo raises the pen first and refuses out-of-bounds targets', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.penDown());
    await s.run(s.ctrl.goTo(50, 40));
    const labels = wireLabels(s.sim);
    const up = labels.lastIndexOf('G1 Z0 F5000');
    const move = labels.findIndex((l) => /^G1 X50 Y40/.test(l));
    expect(up).toBeLessThan(move);
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(50, 3);
    const before = s.sim.getStats().motionLines;
    await expect(s.run(s.ctrl.goTo(500, 10))).rejects.toThrow(/outside the work area/);
    await expect(s.run(s.ctrl.goTo(10, -1))).rejects.toThrow(PlotterError);
    expect(s.sim.getStats().motionLines).toBe(before);
    await s.run(s.ctrl.goToOrigin());
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(0, 3);
  });

  test('goToOrigin needs an origin', async () => {
    const s = await connected();
    await expect(s.run(s.ctrl.goToOrigin())).rejects.toThrow(/origin/i);
  });
});

describe('unlock and home', () => {
  test('unlock only sends $X on explicit call; console refuses it', async () => {
    const s = await connectedWithOrigin();
    const r = await s.run(s.ctrl.sendConsole('$X'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Unlock/);
    expect(wireLabels(s.sim)).not.toContain('$X');
    s.sim.injectFault({ type: 'alarm', code: 1 });
    await until(s.clock, () => s.ctrl.state === 'alarm');
    await expect(s.run(s.ctrl.jog(5, 0))).rejects.toThrow(/alarm/i);
    await s.run(s.ctrl.unlock());
    expect(s.ctrl.state).toBe('idle');
    expect(wireLabels(s.sim)).toContain('$X');
    expect(s.ctrl.originSet).toBe(true); // alarm 1 does not reset G92
  });

  test('home is refused when $22=0', async () => {
    const s = await connected();
    await expect(s.run(s.ctrl.home({ confirm: true }))).rejects.toThrow(/disabled/);
    expect(wireLabels(s.sim)).not.toContain('$H');
  });

  test('home needs $22=1 and an explicit confirm', async () => {
    const s = await connectedWithOrigin({ sim: { settings: { 22: 1 } } });
    await expect(s.run(s.ctrl.home())).rejects.toThrow(/confirm/);
    expect(wireLabels(s.sim)).not.toContain('$H');
    await s.run(s.ctrl.home({ confirm: true }));
    expect(wireLabels(s.sim)).toContain('$H');
    expect(s.ctrl.originSet).toBe(false);
    expect(s.ctrl.state).toBe('idle');
  });
});

describe('console (spec 10.1)', () => {
  test.each([
    ['G91', /Relative/],
    ['G91 G1 X5 F1000', /Relative/],
    ['G2 X10 Y10 I5 F1000', /Arcs/],
    ['G3 X10 Y10 I5 F1000', /Arcs/],
    ['G20', /inches/],
    ['G1 X500 F1000', /outside the work area/],
    ['G1 Y-1 F1000', /outside the work area/],
    ['G1 Z11 F1000', /outside the pen range/],
    ['G1 Z-1 F1000', /outside the pen range/],
    ['G1 X10 F12000', /above the/],
    ['G1 Z2 F9000', /above the/],
    ['G53 G1 X500 F1000', /outside the work area/],
    ['$110=5000', /firmware settings/i],
    ['$RST=*', /factory/i],
    ['G10 L20 P1 X0', /EEPROM/],
    ['$H', /Homing/],
    ['$J=G21G91X1000F2000', /outside the work area/],
    ['$J=G21G90X500F2000', /outside the work area/],
    ['$J=G21G90X10', /need a feed/],
    ['$J=G21G91X10F9000', /above the/],
  ])('refuses %s', async (line, re) => {
    const s = await connectedWithOrigin();
    const before = wireLabels(s.sim).length;
    const r = await s.run(s.ctrl.sendConsole(line));
    expect(r.ok).toBe(false);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(re);
    expect(wireLabels(s.sim).slice(before).filter((l) => l !== '?')).toEqual([]);
  });

  test('bounds use the current position and origin (missing axes)', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(100, 0));
    await until(s.clock, () => s.ctrl.state === 'idle');
    await s.run(s.ctrl.setOrigin());
    const r = await s.run(s.ctrl.sendConsole('G1 X-120 F1000'));
    expect(r.refused).toBe(true);
  });

  test('allows in-bounds G1, G0, queries and firmware writes only when enabled', async () => {
    const s = await connectedWithOrigin();
    let r = await s.run(s.ctrl.sendConsole('G1 X10 Y10 F3000'));
    expect(r.ok).toBe(true);
    r = await s.run(s.ctrl.sendConsole('G0 X20'));
    expect(r.ok).toBe(true);
    r = await s.run(s.ctrl.sendConsole('$$'));
    expect(r.ok).toBe(true);
    expect(r.lines.some((l) => l.startsWith('$130='))).toBe(true);
    r = await s.run(s.ctrl.sendConsole('$G'));
    expect(r.ok).toBe(true);
    await until(s.clock, () => s.sim.getState() === 'Idle');
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(20, 3);
    r = await s.run(s.ctrl.sendConsole('$110=8000'));
    expect(r.refused).toBe(true);
    r = await s.run(s.ctrl.sendConsole('$110=8000', { allowFirmwareWrites: true }));
    expect(r.ok).toBe(true);
    expect(s.sim.getStats().settingWrites).toEqual(['$110=8000']);
    r = await s.run(s.ctrl.sendConsole('$RST=*', { allowFirmwareWrites: true }));
    expect(r.refused).toBe(true); // $RST stays blocked even with the switch
  });

  test('absolute in-bounds jog is allowed; firmware errors are reported', async () => {
    const s = await connectedWithOrigin();
    let r = await s.run(s.ctrl.sendConsole('$J=G21G90X30Y30F2000'));
    expect(r.ok).toBe(true);
    await until(s.clock, () => s.sim.getState() === 'Idle');
    r = await s.run(s.ctrl.sendConsole('G93'));
    expect(r.ok).toBe(false);
    expect(r.error).toBe(20);
  });

  test('realtime from the console: ? allowed; everything else locked during a job', async () => {
    const s = await connectedWithOrigin();
    expect((await s.run(s.ctrl.sendConsole('?'))).ok).toBe(true);
    const p = s.ctrl.run(makeJob(PENS));
    await s.clock.advance(1000);
    expect((await s.run(s.ctrl.sendConsole('?'))).ok).toBe(true);
    expect((await s.run(s.ctrl.sendConsole('!'))).refused).toBe(true);
    expect((await s.run(s.ctrl.sendConsole('G1 X1 F100'))).refused).toBe(true);
    await s.run(s.ctrl.stop());
    await s.run(p);
  });

  test('console G92 updates origin tracking', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(25, 0));
    await until(s.clock, () => s.ctrl.state === 'idle');
    const r = await s.run(s.ctrl.sendConsole('G92 X0 Y0'));
    expect(r.ok).toBe(true);
    expect(s.ctrl.originSet).toBe(true);
    expect(s.ctrl.originMachine.x).toBeCloseTo(25, 3);
  });
});

describe('run', () => {
  test('streams a multi-pen job, pauses at the pen change, trace matches, 127 bytes never exceeded', async () => {
    const s = await connectedWithOrigin();
    const job = makeJob(PENS);
    expect(job.penChangeIndices.length).toBe(1);
    const p = s.ctrl.run(job, { pens: [{ name: 'Black' }, { name: 'Red' }] });
    await until(s.clock, () => s.events.some((e) => e.name === 'penChange'));
    expect(s.ctrl.state).toBe('penChange');
    const ev = s.events.find((e) => e.name === 'penChange');
    expect(ev.p).toMatchObject({ index: job.penChangeIndices[0], ordinal: 1, pen: { name: 'Red' } });
    expect(s.sim.getPosition().mpos.z).toBeLessThan(1); // pen is up
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(0, 3); // parked at the origin
    expect(s.sim.getPosition().wpos.y).toBeCloseTo(0, 3);
    const traceBefore = s.sim.getTrace().length;
    expect(traceBefore).toBe(drawnSegments([PENS[0]]).length);
    await s.clock.advance(5000);
    expect(s.sim.getTrace().length).toBe(traceBefore); // still waiting for the user
    s.ctrl.continuePenChange();
    const result = await s.run(p);
    expect(result).toMatchObject({ status: 'done', pathCount: 4 });
    expect(s.ctrl.state).toBe('idle');
    expectTrace(s.sim, PENS);
    const st = s.sim.getStats();
    expect(st.overflowCount).toBe(0);
    expect(st.maxRxBytes).toBeLessThanOrEqual(127);
    expect(assertAllSafe(s.sim)).toEqual([]);
    const pr = s.events.filter((e) => e.name === 'progress');
    expect(pr[pr.length - 1].p.percent).toBe(100);
    expect(s.events.some((e) => e.name === 'done' && !e.p.aborted)).toBe(true);
    expect(s.sim.getPosition().mpos.z).toBeLessThan(1); // ends pen-up
    expect(wireLabels(s.sim).some((l) => /^G0\b/.test(l))).toBe(false);
  });

  test('penChange continue mode does not pause', async () => {
    const s = await connectedWithOrigin();
    const result = await s.run(s.ctrl.run(makeJob(PENS), { penChange: 'continue' }));
    expect(result.status).toBe('done');
    expect(s.events.some((e) => e.name === 'penChange')).toBe(false);
    expectTrace(s.sim, PENS);
  });

  test('char counting is exercised and never exceeds 127 bytes (long polyline)', async () => {
    const s = await connectedWithOrigin({ sim: { speed: 4 } });
    const pts = [];
    for (let i = 0; i < 150; i += 1) pts.push({ x: 20 + i * 1.234, y: 50 + Math.sin(i / 5) * 30.789 });
    const groups = [[pts]];
    const result = await s.run(s.ctrl.run(makeJob(groups)));
    expect(result.status).toBe('done');
    expectTrace(s.sim, groups);
    const st = s.sim.getStats();
    expect(st.maxRxBytes).toBeGreaterThan(100);
    expect(st.maxRxBytes).toBeLessThanOrEqual(127);
    expect(st.overflowCount).toBe(0);
  });

  test('works relative to a non-zero origin', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(100, 100));
    await until(s.clock, () => s.ctrl.state === 'idle');
    await s.run(s.ctrl.setOrigin());
    const groups = [[square(10, 10, 50)]];
    await s.run(s.ctrl.run(makeJob(groups)));
    expectTrace(s.sim, groups);
    expect(s.sim.getTrace({ space: 'machine' })[0].from.x).toBeCloseTo(110, 3);
  });

  test('refused when not connected, origin not set, or not idle', async () => {
    const s = setup();
    await expect(s.run(s.ctrl.run(makeJob(PENS)))).rejects.toThrow(/Connect/);
    await s.run(s.ctrl.connect());
    await expect(s.run(s.ctrl.run(makeJob(PENS)))).rejects.toThrow(/origin/i);
    expect(motionLog(s.sim)).toEqual([]);
    await s.run(s.ctrl.setOrigin());
    const p = s.ctrl.run(makeJob(PENS));
    await s.clock.advance(500);
    await expect(s.run(s.ctrl.run(makeJob(PENS)))).rejects.toThrow(/idle/);
    await s.run(s.ctrl.stop());
    await s.run(p);
  });

  test('useMachineZero allows a run without an origin', async () => {
    const s = await connected();
    const r = await s.run(s.ctrl.run(makeJob([[square(10, 10, 20)]]), { useMachineZero: true }));
    expect(r.status).toBe('done');
  });

  test('out-of-bounds job is refused before the first byte with the overflow amount', async () => {
    const s = await connectedWithOrigin();
    const before = wireLabels(s.sim).length;
    const bad = makeJob([[[{ x: 10, y: 10 }, { x: 425.5, y: 10 }]]]);
    let err;
    try { await s.run(s.ctrl.run(bad)); } catch (e) { err = e; }
    expect(err.code).toBe('out-of-bounds');
    expect(err.message).toMatch(/right 5\.5 mm/);
    expect(motionLog(s.sim)).toEqual([]);
    expect(wireLabels(s.sim).slice(before).filter((l) => l !== '?')).toEqual([]);
    expect(s.ctrl.state).toBe('idle');
  });

  test('bounds use the origin offset', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(100, 0));
    await until(s.clock, () => s.ctrl.state === 'idle');
    await s.run(s.ctrl.setOrigin());
    const ok = makeJob([[[{ x: 10, y: 10 }, { x: 320, y: 10 }]]]);
    const bad = makeJob([[[{ x: 10, y: 10 }, { x: 321, y: 10 }]]]);
    await expect(s.run(s.ctrl.run(bad))).rejects.toThrow(/right 1 mm/);
    await expect(s.run(s.ctrl.run(ok))).resolves.toMatchObject({ status: 'done' });
  });

  test('bounds use the firmware work area', async () => {
    const s = await connectedWithOrigin({ sim: { settings: { 130: 100, 131: 297 } } });
    await expect(s.run(s.ctrl.run(makeJob([[[{ x: 10, y: 10 }, { x: 150, y: 10 }]]])))).rejects.toThrow(/right 50 mm/);
  });

  test.each([
    ['G0 X10', /G0/],
    ['G91', /relative/],
    ['G92 X0', /origin/],
    ['G2 X10 Y10 I5', /arcs/],
    ['G1 Z11 F5000', /pen range/],
    ['G1 X10 F12000', /exceeds/],
    ['$110=5000', /not allowed/],
    ['G10 L20 P1 X0', /EEPROM/],
  ])('refuses a job containing %s', async (line, re) => {
    const s = await connectedWithOrigin();
    const job = makeJob([[square(10, 10, 20)]]);
    job.lines.splice(5, 0, line);
    await expect(s.run(s.ctrl.run(job))).rejects.toThrow(re);
    expect(motionLog(s.sim)).toEqual([]);
  });

  test('pause holds the machine and resume continues', async () => {
    const s = await connectedWithOrigin();
    const groups = [[square(10, 10, 100)]];
    const p = s.ctrl.run(makeJob(groups));
    await s.clock.advance(3000);
    s.ctrl.pause();
    expect(s.ctrl.state).toBe('paused');
    await s.clock.advance(300);
    expect(s.sim.getState()).toMatch(/^Hold/);
    const pos = s.sim.getPosition().mpos;
    await s.clock.advance(20000);
    expect(s.sim.getPosition().mpos.x).toBeCloseTo(pos.x, 6);
    expect(s.ctrl.state).toBe('paused');
    s.ctrl.resume();
    expect(s.ctrl.state).toBe('running');
    const r = await s.run(p);
    expect(r.status).toBe('done');
    expectSameDrawing(s.sim, groups);
    const labels = wireLabels(s.sim);
    expect(labels).toContain('!');
    expect(labels).toContain('~');
  });

  test('stop: pen raised, ! then 0x18, G92 origin restored, state idle with resume point', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(30, 20));
    await until(s.clock, () => s.ctrl.state === 'idle');
    await s.run(s.ctrl.setOrigin());
    const groups = [[square(10, 10, 100), square(30, 30, 20), square(60, 60, 20)]];
    const p = s.ctrl.run(makeJob(groups));
    await until(s.clock, () => s.sim.getTrace().length >= 6);
    s.sim.clearLog();
    const stopRes = await s.run(s.ctrl.stop());
    expect(stopRes.stopped).toBe(true);
    const r = await s.run(p);
    expect(r.status).toBe('stopped');
    expect(r.resumePoint).toMatchObject({ pathIndex: expect.any(Number) });
    expect(s.ctrl.state).toBe('idle');
    const labels = wireLabels(s.sim);
    const hold = labels.indexOf('!');
    const reset = labels.indexOf('0x18');
    const g92 = labels.findIndex((l) => /^G92 X/.test(l));
    const penUp = labels.findIndex((l, i) => i > reset && /^G1 Z0 /.test(l));
    expect(hold).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(hold);
    expect(g92).toBeGreaterThan(reset);
    expect(penUp).toBeGreaterThan(g92);
    expect(labels).not.toContain('$X'); // hold completed: the reset raised no alarm
    expect(s.sim.getPosition().mpos.z).toBeLessThan(1);
    expect(s.sim.getPosition().wco.x).toBeCloseTo(30, 3);
    expect(s.sim.getPosition().wco.y).toBeCloseTo(20, 3);
    expect(s.ctrl.originSet).toBe(true);
    expect(assertAllSafe(s.sim)).toEqual([]);
    expect(s.events.some((e) => e.name === 'done' && e.p.aborted)).toBe(true);
  });

  test('stop with a slow hold: ALARM:3 (reset in motion) moves nothing more and demands a new origin', async () => {
    const s = await connectedWithOrigin({ sim: { holdDecelMs: 60000 } });
    const p = s.ctrl.run(makeJob([[square(10, 10, 100)]]));
    await until(s.clock, () => s.sim.getTrace().length >= 2);
    s.sim.clearLog();
    const r = await s.run(s.ctrl.stop());
    await s.run(p);
    const labels = wireLabels(s.sim).filter((l) => l !== '?');
    const reset = labels.indexOf('0x18');
    expect(reset).toBeGreaterThan(-1);
    const after = labels.slice(reset + 1);
    // position is untrustworthy: no unlock, no origin restore, no Z or XY motion
    expect(after).not.toContain('$X');
    expect(after.some((l) => /^G92/.test(l))).toBe(false);
    expect(after.some((l) => /^G1|^\$J=/.test(l))).toBe(false);
    expect(s.ctrl.state).toBe('alarm');
    expect(s.ctrl.originSet).toBe(false);
    expect(r.positionLost).toBe(true);
    const alarm = s.events.find((e) => e.name === 'alarm' && e.p.positionLost);
    expect(alarm).toBeTruthy();
    expect(alarm.p.message).toMatch(/power/i);
  });

  test('resumeFrom re-sends the preamble and a pen-up, then continues; nothing is left undrawn', async () => {
    const s = await connected();
    await s.run(s.ctrl.jog(30, 20));
    await until(s.clock, () => s.ctrl.state === 'idle');
    await s.run(s.ctrl.setOrigin());
    const groups = [[square(10, 10, 60), square(100, 10, 30), square(150, 10, 30), square(200, 10, 30)]];
    const job = makeJob(groups);
    const p = s.ctrl.run(job);
    await until(s.clock, () => s.sim.getTrace().length >= 9);
    await s.run(s.ctrl.stop());
    const r = await s.run(p);
    const rp = r.resumePoint;
    expect(rp.pathIndex).toBeGreaterThanOrEqual(0);
    expect(rp.pathIndex).toBeLessThanOrEqual(3);
    s.sim.clearLog();
    const done = await s.run(s.ctrl.resumeFrom(rp.pathIndex));
    expect(done.status).toBe('done');
    const labels = wireLabels(s.sim).filter((l) => l !== '?');
    expect(labels.slice(0, 4)).toEqual(['G21', 'G90', 'G1 Z0 F5000', 'G1 Z0 F5000']);
    expect(labels[4]).toBe(job.lines[job.pathStartIndices[rp.pathIndex]]);
    const all = s.sim.getTrace();
    drawnSegments(groups).forEach((w) => {
      expect(all.some((g) => Math.abs(g.from.x - w.from.x) < 1e-3 && Math.abs(g.from.y - w.from.y) < 1e-3
        && Math.abs(g.to.x - w.to.x) < 1e-3 && Math.abs(g.to.y - w.to.y) < 1e-3)).toBe(true);
    });
  });

  test('resumeFrom refuses a path that does not exist', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.run(makeJob([[square(10, 10, 20)]])));
    await expect(s.run(s.ctrl.resumeFrom(5))).rejects.toThrow(/does not exist/);
  });

  test('a pen-change wait can be stopped safely', async () => {
    const s = await connectedWithOrigin();
    const p = s.ctrl.run(makeJob(PENS));
    await until(s.clock, () => s.ctrl.state === 'penChange');
    await s.run(s.ctrl.stop());
    const r = await s.run(p);
    expect(r.status).toBe('stopped');
    expect(s.ctrl.state).toBe('idle');
  });

  test('a firmware error:N mid-job stops safely, raises the pen and reports the line', async () => {
    const s = await connectedWithOrigin();
    const job = makeJob([[square(10, 10, 80)]]);
    job.lines.splice(8, 0, 'G93'); // passes the filter, the firmware answers error:20
    const r = await s.run(s.ctrl.run(job));
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/rejected line 9/);
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().mpos.z).toBeLessThan(1);
    const er = s.events.find((e) => e.name === 'error');
    expect(er.p.line).toBe('G93');
    expect(wireLabels(s.sim)).toContain('0x18');
  });
});

describe('failure handling', () => {
  test('ALARM mid-job aborts, keeps a resume point, sends no further lines, unlock raises the pen', async () => {
    const s = await connectedWithOrigin();
    const job = makeJob([[square(10, 10, 100), square(30, 30, 20), square(60, 60, 20)]]);
    s.sim.injectFault({ type: 'alarm', code: 1, afterLines: 22 });
    const r = await s.run(s.ctrl.run(job));
    expect(r.status).toBe('alarm');
    expect(r.resumePoint).toBeTruthy();
    expect(s.ctrl.state).toBe('alarm');
    const al = s.events.find((e) => e.name === 'alarm');
    expect(al.p.code).toBe(1);
    expect(al.p.resumePoint).toEqual(r.resumePoint);
    const received = wireLabels(s.sim).filter((l) => l !== '?').length;
    await s.clock.advance(5000);
    expect(wireLabels(s.sim).filter((l) => l !== '?').length).toBe(received);
    expect(s.ctrl.getResumePoint()).toEqual(r.resumePoint);
    await s.run(s.ctrl.unlock());
    expect(s.sim.getPosition().mpos.z).toBeLessThan(1);
  });

  test('a dropped ok does not hang the job (idle recovery)', async () => {
    const s = await connectedWithOrigin();
    const groups = [[square(10, 10, 40), square(60, 10, 20)]];
    s.sim.injectFault({ type: 'dropOk', afterLines: 20 });
    const r = await s.run(s.ctrl.run(makeJob(groups)));
    expect(r.status).toBe('done');
    expectTrace(s.sim, groups);
    expect(s.sim.getLog().some((e) => e.type === 'dropped')).toBe(true);
  });

  test('a dropped ok on a manual command resolves by recovery instead of hanging', async () => {
    const s = await connectedWithOrigin();
    s.sim.injectFault({ type: 'dropOk', match: /^G92/ });
    const r = await s.run(s.ctrl.sendConsole('G92 X0 Y0'));
    expect(r.ok).toBe(true);
  });

  test('transport disconnect mid-job: state disconnected, error event, resume point kept, job resolves', async () => {
    const s = await connectedWithOrigin();
    s.sim.injectFault({ type: 'disconnect', afterLines: 18 });
    const r = await s.run(s.ctrl.run(makeJob([[square(10, 10, 100), square(30, 30, 20)]])));
    expect(r.status).toBe('disconnected');
    expect(s.ctrl.state).toBe('disconnected');
    const er = s.events.find((e) => e.name === 'error');
    expect(er.p).toMatchObject({ fatal: true });
    expect(er.p.message).toMatch(/disconnected/i);
    expect(s.ctrl.getResumePoint()).toBeTruthy();
    expect(PlotterController._active).toBeNull();
  });

  test('disconnect() during a job sends ! first', async () => {
    const s = await connectedWithOrigin();
    const p = s.ctrl.run(makeJob([[square(10, 10, 100)]]));
    await s.clock.advance(2000);
    s.sim.clearLog();
    await s.run(s.ctrl.disconnect());
    expect(wireLabels(s.sim)[0]).toBe('!');
    const r = await s.run(p);
    expect(r.status).toBe('disconnected');
    expect(s.ctrl.state).toBe('disconnected');
  });

  test('a board reset mid-session (banner) aborts the job, drops the origin and reports it', async () => {
    const s = await connectedWithOrigin();
    const p = s.ctrl.run(makeJob([[square(10, 10, 100)]]));
    await s.clock.advance(2500);
    s.sim.writeRealtime(0x18); // the board reboots by itself
    const r = await s.run(p);
    expect(r.status).toBe('reset');
    expect(r.message).toBe('The plotter restarted; position and origin were lost. Re-set the origin before plotting.');
    expect(s.ctrl.originSet).toBe(false);
    expect(s.ctrl.state).toBe('alarm');
    expect(s.events.find((e) => e.name === 'reset').p.message).toMatch(/Re-set the origin/);
    expect(s.events.find((e) => e.name === 'alarm').p.reset).toBe(true);
    await expect(s.run(s.ctrl.run(makeJob([[square(10, 10, 20)]])))).rejects.toThrow();
    await s.run(s.ctrl.unlock());
    await expect(s.run(s.ctrl.run(makeJob([[square(10, 10, 20)]])))).rejects.toThrow(/origin/i);
  });

  test('a banner during a jog also drops the origin and aborts the jog loop', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    await s.clock.advance(600);
    s.sim.writeRealtime(0x18);
    await s.clock.advance(500);
    expect(s.ctrl.originSet).toBe(false);
    expect(s.events.some((e) => e.name === 'reset')).toBe(true);
    expect(s.ctrl.state).toBe('alarm');
    const n = wireLabels(s.sim).filter((l) => /^\$J/.test(l)).length;
    await s.clock.advance(2000);
    expect(wireLabels(s.sim).filter((l) => /^\$J/.test(l)).length).toBe(n);
  });

  test('a silent device is detected as stopped responding', async () => {
    const s = await connectedWithOrigin();
    const p = s.ctrl.run(makeJob([[square(10, 10, 100)]]));
    await s.clock.advance(1000);
    s.sim._emit = () => {}; // freeze the device: drop every response
    const r = await s.run(p, { maxMs: 60000 });
    expect(r.status).toBe('error');
    expect(s.ctrl.state).toBe('error');
    expect(s.events.some((e) => e.name === 'error' && /stopped responding/.test(e.p.message))).toBe(true);
  });
});

describe('best-effort hold', () => {
  test('bestEffortHold writes ! when running and nothing when idle', async () => {
    const s = await connectedWithOrigin();
    expect(s.ctrl.bestEffortHold()).toBe(false);
    expect(PlotterController.bestEffortHold()).toBe(false);
    const p = s.ctrl.run(makeJob([[square(10, 10, 100)]]));
    await s.clock.advance(1500);
    s.sim.clearLog();
    expect(PlotterController.bestEffortHold()).toBe(true);
    await s.clock.advance(100);
    expect(wireLabels(s.sim)).toContain('!');
    expect(s.sim.getState()).toMatch(/^Hold/);
    await s.run(s.ctrl.stop());
    await s.run(p);
  });

  test('never throws after the port is gone', async () => {
    const s = await connectedWithOrigin();
    await s.sim.close();
    expect(() => s.ctrl.bestEffortHold()).not.toThrow();
  });
});

describe('driver registry and profile validation', () => {
  test('PLOTTER_DRIVERS.grbl creates a controller', () => {
    const { PLOTTER_DRIVERS } = require('../../../src/core/plotter/plotter-controller.js');
    const c = PLOTTER_DRIVERS.grbl.createController(a3, new T.SimulatorTransport({ profile: a3 }), {});
    expect(c.state).toBe('disconnected');
    expect(typeof c.on).toBe('function');
  });

  test('rejects an invalid profile', () => {
    const bad = JSON.parse(JSON.stringify(a3));
    bad.pen.zMax = 50;
    expect(() => new PlotterController(bad, new T.SimulatorTransport({ profile: a3 }))).toThrow(/Invalid plotter profile/);
  });

  test('event emitter subscribes and unsubscribes', () => {
    const c = new PlotterController(a3, new T.SimulatorTransport({ profile: a3 }));
    const seen = [];
    const off = c.on('x', (p) => seen.push(p));
    c.emit('x', 1);
    off();
    c.emit('x', 2);
    expect(seen).toEqual([1]);
  });
});

describe('pen-change repositioning and pen height re-check', () => {
  const parked = async () => {
    const s = await connectedWithOrigin();
    const p = s.ctrl.run(makeJob(PENS), { pens: [{ name: 'Black' }, { name: 'Red' }] });
    await until(s.clock, () => s.events.some((e) => e.name === 'penChange'));
    return { s, p };
  };
  const states = (s) => s.events.filter((e) => e.name === 'state').map((e) => e.p.state);

  test('penDown, setPenHeight (clamped), penUp, goTo and jog work without leaving penChange', async () => {
    const { s, p } = await parked();
    await s.run(s.ctrl.penDown());
    expect(s.ctrl.state).toBe('penChange');
    expect(s.sim.getPosition().mpos.z).toBeCloseTo(3.5, 3);
    const r = await s.run(s.ctrl.setPenHeight(99));
    expect(r.clamped).toBe(true);
    expect(s.sim.getPosition().mpos.z).toBeCloseTo(10, 3);
    await s.run(s.ctrl.setPenHeight(2));
    expect(s.sim.getPosition().mpos.z).toBeCloseTo(2, 3);
    await s.run(s.ctrl.penUp());
    expect(s.sim.getPosition().mpos.z).toBeLessThan(0.1);
    await s.run(s.ctrl.goTo(30, 40));
    expect(s.ctrl.state).toBe('penChange');
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(30, 3);
    await s.run(s.ctrl.jog(5, 0));
    await s.clock.advance(3000);
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(35, 3);
    expect(s.ctrl.state).toBe('penChange');
    const seq = states(s);
    expect(seq.slice(seq.lastIndexOf('penChange')).filter((x) => x !== 'penChange')).toEqual([]);
    s.ctrl.continuePenChange();
    await s.run(p);
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('continuePenChange raises a lowered pen before travel resumes', async () => {
    const { s, p } = await parked();
    await s.run(s.ctrl.penDown());
    const traceBefore = s.sim.getTrace().length;
    await s.run(s.ctrl.continuePenChange());
    expect(s.sim.getPosition().mpos.z).toBeLessThan(0.1);
    const res = await s.run(p);
    expect(res.status).toBe('done');
    expectTrace(s.sim, PENS); // no stray pen-down segment from the re-check or the resume travel
    expect(traceBefore).toBe(drawnSegments([PENS[0]]).length);
  });

  test('manual moves are refused while running, paused and stopping', async () => {
    const s = await connectedWithOrigin();
    const p = s.ctrl.run(makeJob(PENS));
    await until(s.clock, () => s.ctrl.state === 'running');
    for (const call of [() => s.ctrl.penUp(), () => s.ctrl.penDown(), () => s.ctrl.setPenHeight(1), () => s.ctrl.goTo(5, 5), () => s.ctrl.jog(1, 1)]) {
      await expect(call()).rejects.toThrow(/while the plotter is running/);
    }
    s.ctrl.pause();
    await expect(s.ctrl.penDown()).rejects.toThrow(/while the plotter is paused/);
    await expect(s.ctrl.jog(1, 1)).rejects.toThrow(/paused/);
    const stopP = s.ctrl.stop();
    expect(s.ctrl.state).toBe('stopping');
    await expect(s.ctrl.penDown()).rejects.toThrow(/stopping/);
    await expect(s.ctrl.goTo(5, 5)).rejects.toThrow(/stopping/);
    await s.run(stopP);
    await s.run(p);
  });

  test('setOrigin stays refused at a pen change', async () => {
    const { s, p } = await parked();
    await expect(s.ctrl.setOrigin()).rejects.toThrow(/penChange/);
    s.ctrl.continuePenChange();
    await s.run(p);
  });

  test('moves are refused during the automatic pen-up/park travel before the wait begins', async () => {
    const s = await connectedWithOrigin();
    const p = s.ctrl.run(makeJob(PENS));
    await until(s.clock, () => s.ctrl.state === 'penChange', 600000, 1);
    // parked flag only true once the user wait is open
    if (!s.events.some((e) => e.name === 'penChange')) {
      await expect(s.ctrl.penDown()).rejects.toThrow(/penChange/);
    }
    await until(s.clock, () => s.events.some((e) => e.name === 'penChange'));
    s.ctrl.continuePenChange();
    await s.run(p);
  });
});

describe('bounds tolerance for status rounding', () => {
  test('Go to origin at the power-on corner works with WCO -0.001 rounding skew', async () => {
    const s = await connected({ sim: { wcoSkew: { x: -0.001 } } });
    await s.run(s.ctrl.setOrigin());
    await s.run(s.ctrl.jog(151.164, 0));
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.ctrl.wco.x).toBeCloseTo(-0.001, 6);
    await s.run(s.ctrl.goToOrigin());
    const pos = s.sim.getPosition();
    expect(pos.wpos.x).toBeCloseTo(0, 2);
    expect(pos.wpos.y).toBeCloseTo(0, 2);
    expect(s.ctrl.pen.state).toBe('up');
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('goTo beyond the tolerance is still rejected', async () => {
    const s = await connectedWithOrigin();
    await expect(s.run(s.ctrl.goTo(-0.05, 0))).rejects.toMatchObject({ code: 'out-of-bounds' });
  });

  test('setOrigin at the power-on corner stores exactly (0, 0)', async () => {
    const s = await connected({ sim: { initialPosition: { x: 0.004, y: 0.002, z: 0 } } });
    const o = await s.run(s.ctrl.setOrigin());
    expect(o).toEqual({ x: 0, y: 0 });
  });

  test('jog target within tolerance past the edge clamps to the edge', async () => {
    const s = await connectedWithOrigin();
    const r = await s.run(s.ctrl.jog(-0.015, 0));
    expect(r.sent).toBe(false);
    expect(r.atLimit.x).toBe('min');
  });
});
