const { setup, makeJob, until, wireLabels, assertAllSafe, PlotterController } = require('./plotter-test-helpers.js');
const safety = require('../../../src/core/plotter/plot-safety.js');

afterEach(() => PlotterController.resetOwnership());

const connectedRaw = async (o) => { const s = setup(o); await s.run(s.ctrl.connect()); return s; };
const settle = (s) => until(s.clock, () => s.ctrl.state === 'idle', 20000);
const MSG = /Confirm the carriage was at its start corner when you connected/;

describe('connect safety: machine corner confirmation', () => {
  test('starts unconfirmed; confirmMachineCorner() confirms', async () => {
    const s = await connectedRaw();
    expect(s.ctrl.machineCornerConfirmed).toBe(false);
    s.ctrl.confirmMachineCorner();
    expect(s.ctrl.machineCornerConfirmed).toBe(true);
  });

  test('jogs are clamped to +-15 mm around the connect position until confirmed', async () => {
    const s = await connectedRaw();
    await s.run(s.ctrl.setOrigin());
    const r = await s.run(s.ctrl.jog(100, 100));
    expect(r.target.x).toBeCloseTo(15, 3);
    expect(r.target.y).toBeCloseTo(15, 3);
    expect(r.atLimit.any).toBe(true);
    await settle(s);
    expect(s.sim.getPosition().mpos.x).toBeCloseTo(15, 2);
    const back = await s.run(s.ctrl.jog(-100, -100));
    expect(back.target.x).toBeCloseTo(0, 3); // machine zero edge (origin is there)
  });

  test('goTo outside the box is refused with corner-unconfirmed; inside works', async () => {
    const s = await connectedRaw();
    await s.run(s.ctrl.setOrigin());
    const err = await s.run(s.ctrl.goTo(100, 100)).catch((e) => e);
    expect(err.code).toBe('corner-unconfirmed');
    expect(err.message).toMatch(MSG);
    await s.run(s.ctrl.goTo(10, 10));
    s.ctrl.confirmMachineCorner();
    await s.run(s.ctrl.goTo(100, 100));
  });

  test('a job larger than the box is refused until confirmed', async () => {
    const s = await connectedRaw();
    await s.run(s.ctrl.setOrigin());
    const job = makeJob([[[{ x: 10, y: 10 }, { x: 100, y: 100 }]]]);
    const err = await s.run(s.ctrl.run(job)).catch((e) => e);
    expect(err.code).toBe('corner-unconfirmed');
    expect(err.message).toMatch(MSG);
    expect(wireLabels(s.sim).filter((l) => /^G1 X/.test(l)).length).toBe(0);
  });

  test('console motion outside the box is refused', async () => {
    const s = await connectedRaw();
    await s.run(s.ctrl.setOrigin());
    const r = await s.run(s.ctrl.sendConsole('G1 X200 Y200 F1000'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(MSG);
  });

  test('a reset (banner) un-confirms again', async () => {
    const s = await connectedRaw();
    s.ctrl.confirmMachineCorner();
    s.sim.writeRealtime(0x18);
    await s.clock.advance(1500);
    expect(s.ctrl.machineCornerConfirmed).toBe(false);
  });

  test('the box is centred on the position at connect', async () => {
    const s = await connectedRaw({ sim: { initialPosition: { x: 100, y: 50, z: 0 } } });
    await s.run(s.ctrl.setOrigin());
    const r = await s.run(s.ctrl.jog(100, -100));
    expect(r.target.x).toBeCloseTo(15, 3);
    expect(r.target.y).toBeCloseTo(-15, 3);
  });
});

describe('profile limits.edgeMargin', () => {
  test('defaults to 2 mm and is validated', () => {
    const { PLOTTER_PROFILES } = require('../../../src/config/plotters.js');
    const a3 = PLOTTER_PROFILES.find((p) => p.id === 'uunatek-3-a3');
    expect(safety.edgeMarginOf(a3)).toBe(2);
    expect(safety.edgeMarginOf({ limits: { edgeMargin: 0 } })).toBe(0);
    const bad = JSON.parse(JSON.stringify(a3)); bad.limits.edgeMargin = -1;
    expect(safety.validateProfile(bad).ok).toBe(false);
  });

  test('jogging to the far edge stops edgeMargin short of the frame', async () => {
    const s = await connectedRaw();
    s.ctrl.confirmMachineCorner();
    await s.run(s.ctrl.setOrigin());
    const r = await s.run(s.ctrl.jog(1000, 1000));
    expect(r.target.x).toBeCloseTo(418, 3);
    expect(r.target.y).toBeCloseTo(295, 3);
    await settle(s);
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('an origin set mid-sheet keeps the margin at the machine zero side too', async () => {
    const s = await connectedRaw();
    s.ctrl.confirmMachineCorner();
    await s.run(s.ctrl.goTo(0, 0)).catch(() => null);
    await s.run(s.ctrl.jog(200, 150));
    await settle(s);
    await s.run(s.ctrl.setOrigin());
    const r = await s.run(s.ctrl.jog(-1000, -1000));
    expect(r.target.x).toBeCloseTo(-198, 3);
    expect(r.target.y).toBeCloseTo(-148, 3);
  });

  test('jobs are bounded by the margin on the far edges', async () => {
    const s = await connectedRaw();
    s.ctrl.confirmMachineCorner();
    await s.run(s.ctrl.setOrigin());
    const ok = makeJob([[[{ x: 10, y: 10 }, { x: 417, y: 200 }]]]);
    const edge = makeJob([[[{ x: 10, y: 10 }, { x: 419.5, y: 200 }]]]);
    const e = await s.run(s.ctrl.run(edge)).catch((x) => x);
    expect(e.code).toBe('out-of-bounds');
    await expect(s.run(s.ctrl.run(ok), { maxMs: 600000 })).resolves.toMatchObject({ status: 'done' });
  });
});
