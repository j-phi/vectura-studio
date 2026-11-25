const { connectedWithOrigin, wireLabels, until, assertAllSafe, PlotterController } = require('./plotter-test-helpers.js');

afterEach(() => PlotterController.resetOwnership());

const cancels = (s) => wireLabels(s.sim).filter((l) => l === '0x85').length;

describe('single jog: one in flight', () => {
  test('repeated jog() calls while one is executing are dropped', async () => {
    const s = await connectedWithOrigin();
    const rs = await s.run(Promise.all([s.ctrl.jog(10, 0), s.ctrl.jog(10, 0), s.ctrl.jog(10, 0)]));
    expect(rs.filter((r) => r.sent).length).toBe(1);
    rs.filter((r) => !r.sent).forEach((r) => expect(r.reason).toBe('busy'));
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(10, 2);
    const again = await s.run(s.ctrl.jog(10, 0));
    expect(again.sent).toBe(true);
  });

  test('auto-repeat while the first jog is still moving is dropped', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.jog(50, 0, 600));
    await s.clock.advance(200);
    const r = await s.run(s.ctrl.jog(50, 0, 600));
    expect(r).toMatchObject({ sent: false, reason: 'busy' });
  });
});

describe('continuous jog lead limit', () => {
  test('commanded target never leads the real position by more than 0.3 s of travel', async () => {
    const s = await connectedWithOrigin();
    const feed = 3000;
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, feed));
    const mmPerS = feed / 60;
    let maxLead = 0;
    for (let i = 0; i < 120; i += 1) {
      await s.clock.advance(25);
      h.keepAlive();
      const loop = s.ctrl._jogLoop;
      if (!loop) break;
      maxLead = Math.max(maxLead, (loop.target.x - s.sim.getPosition().wpos.x) / mmPerS);
    }
    expect(maxLead).toBeLessThanOrEqual(0.3 + 0.02);
    expect(s.sim.getPosition().wpos.x).toBeGreaterThan(50);
    await s.run(s.ctrl.jogContinuousStop());
  });

  test('each jog segment is at most 0.15 s of travel', async () => {
    const s = await connectedWithOrigin();
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    for (let i = 0; i < 40; i += 1) { await s.clock.advance(50); h.keepAlive(); }
    await s.run(s.ctrl.jogContinuousStop());
    const xs = wireLabels(s.sim).filter((l) => /^\$J=/.test(l)).map((l) => parseFloat(/X([-\d.]+)/.exec(l)[1]));
    expect(xs.length).toBeGreaterThan(5);
    xs.forEach((x, i) => expect(x - (i ? xs[i - 1] : 0)).toBeLessThanOrEqual(7.5 + 1e-6));
  });

  test('status is polled at 100 ms or faster while jogging', async () => {
    const s = await connectedWithOrigin();
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    s.sim.clearLog();
    for (let i = 0; i < 10; i += 1) { await s.clock.advance(100); h.keepAlive(); }
    const polls = wireLabels(s.sim).filter((l) => l === '?').length;
    await s.run(s.ctrl.jogContinuousStop());
    expect(polls).toBeGreaterThanOrEqual(9);
  });
});

describe('continuous jog deadman', () => {
  test('without keepAlive the hold is cancelled within 350 ms', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    let t = 0;
    while (!cancels(s) && t < 2000) { await s.clock.advance(10); t += 10; }
    expect(cancels(s)).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(350);
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().wpos.x).toBeLessThan(40);
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('keepAlive keeps the hold going; the hard max is 8 s', async () => {
    const s = await connectedWithOrigin();
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 1200));
    const stops = [];
    s.ctrl.on('jogstop', (p) => stops.push(p.reason));
    let t = 0;
    while (!cancels(s) && t < 12000) { await s.clock.advance(100); h.keepAlive(); t += 100; }
    expect(t).toBeGreaterThan(7000);
    expect(t).toBeLessThanOrEqual(8200);
    expect(stops).toEqual(['max-hold']);
  });
});
