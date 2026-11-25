const {
  connectedWithOrigin, makeJob, wireLabels, until, assertAllSafe, PlotterController,
} = require('./plotter-test-helpers.js');

afterEach(() => PlotterController.resetOwnership());

const square = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }, { x, y }];
const SIM = { sim: { holdDecelMs: 300 } };

const expectStopped = async (s) => {
  await until(s.clock, () => s.ctrl.state === 'idle', 20000);
  const a = s.sim.getPosition();
  await s.clock.advance(1000);
  const b = s.sim.getPosition();
  expect(b.mpos.x).toBeCloseTo(a.mpos.x, 3);
  expect(b.mpos.y).toBeCloseTo(a.mpos.y, 3);
  expect(b.mpos.z).toBeLessThanOrEqual(a3Up + 0.05);
  expect(s.sim.getState()).toBe('Idle');
  expect(assertAllSafe(s.sim)).toEqual([]);
};
const a3Up = 0;

describe('emergencyStop', () => {
  test('writes 0x85 and ! synchronously, emits estop, never throws', async () => {
    const s = await connectedWithOrigin(SIM);
    s.sim.clearLog();
    let p;
    expect(() => { p = s.ctrl.emergencyStop(); }).not.toThrow();
    const labels = wireLabels(s.sim);
    expect(labels.slice(0, 2)).toEqual(['0x85', '!']);
    const est = [];
    s.ctrl.on('estop', (e) => est.push(e));
    await s.run(p);
    await expectStopped(s);
  });

  test('is idempotent', async () => {
    const s = await connectedWithOrigin(SIM);
    const p1 = s.ctrl.emergencyStop();
    const p2 = s.ctrl.emergencyStop();
    await s.run(Promise.all([p1, p2]));
    await expectStopped(s);
    expect(wireLabels(s.sim).filter((l) => l === '0x18').length).toBe(1);
  });

  test('emits estop with the prior state', async () => {
    const s = await connectedWithOrigin(SIM);
    const est = [];
    s.ctrl.on('estop', (e) => est.push(e));
    await s.run(s.ctrl.emergencyStop());
    expect(est.length).toBe(1);
    expect(est[0].state).toBe('idle');
  });

  test('during a continuous jog: stops, loop dead, pen up', async () => {
    const s = await connectedWithOrigin(SIM);
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    for (let i = 0; i < 5; i += 1) { await s.clock.advance(100); h.keepAlive(); }
    await s.run(s.ctrl.emergencyStop());
    expect(s.ctrl._jogLoop).toBe(null);
    const x = s.sim.getPosition().mpos.x;
    await expectStopped(s);
    expect(s.sim.getPosition().mpos.x - x).toBeLessThan(20);
    expect(s.ctrl.originSet).toBe(true);
  });

  test('during a goTo: the move is rejected and motion stops', async () => {
    const s = await connectedWithOrigin(SIM);
    const g = s.ctrl.goTo(300, 200, 3000);
    g.catch(() => {});
    await s.clock.advance(400);
    const done = s.ctrl.emergencyStop();
    await s.run(done);
    await expect(g).rejects.toBeTruthy();
    await expectStopped(s);
    expect(s.sim.getPosition().mpos.x).toBeLessThan(300);
  });

  test('during a job run: job aborted, resume point kept, pen up', async () => {
    const s = await connectedWithOrigin(SIM);
    const job = makeJob([[square(10, 10, 100), square(150, 10, 100)]]);
    const run = s.ctrl.run(job);
    await until(s.clock, () => s.sim.getPosition().mpos.z > 1, 20000);
    await s.clock.advance(200);
    await s.run(s.ctrl.emergencyStop());
    const r = await s.run(run);
    expect(r.status).toBe('estop');
    await expectStopped(s);
    expect(s.ctrl.resumePoint).toBeTruthy();
  });

  test('while paused', async () => {
    const s = await connectedWithOrigin(SIM);
    const run = s.ctrl.run(makeJob([[square(10, 10, 100), square(150, 10, 100)]]));
    await until(s.clock, () => s.sim.getPosition().mpos.z > 1, 20000);
    s.ctrl.pause();
    await s.clock.advance(600);
    await s.run(s.ctrl.emergencyStop());
    await s.run(run);
    await expectStopped(s);
  });

  test('at a pen change', async () => {
    const s = await connectedWithOrigin(SIM);
    const run = s.ctrl.run(makeJob([[square(10, 10, 50)], [square(100, 10, 50)]]));
    await until(s.clock, () => s.ctrl.state === 'penChange', 60000);
    await s.run(s.ctrl.emergencyStop());
    await s.run(run);
    await expectStopped(s);
  });

  test('PlotterController.emergencyStopActive stops the active controller', async () => {
    const s = await connectedWithOrigin(SIM);
    expect(PlotterController.emergencyStopActive()).toBe(true);
    await s.clock.advance(5000);
    await expectStopped(s);
    PlotterController.resetOwnership();
    expect(PlotterController.emergencyStopActive()).toBe(false);
  });

  test('without an open port it resolves without throwing', () => {
    const { PlotterController: C } = require('./plotter-test-helpers.js');
    const T = require('../../../src/core/plotter/serial-transport.js');
    const { a3 } = require('./plotter-test-helpers.js');
    const c = new C(a3, new T.SimulatorTransport({ profile: a3, clock: T.createManualClock() }));
    expect(() => c.emergencyStop()).not.toThrow();
  });
});
