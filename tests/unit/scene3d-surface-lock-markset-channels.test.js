const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');

// D0 (contract A26): optional MarkSet channels runPen / runWeight. Present -> the frame's lines carry penId / weightScale;
// absent -> no such property and the MarkSet has no such array (byte-identical to before; the frame-identity witness pins the rest).
const POSE = { cam: { cx: 0, cy: 0, scale: 1 } };
describe('MarkSet pen / weight channels (D0)', () => {
  let rt; let V; let SL; let MS;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; MS = V.Scene3D.SurfaceLockMarkSet; }, 120000);
  afterAll(() => rt && rt.cleanup());

  const build = (withChannels) => {
    const B = MS.createBuilder({ bakerId: 't', meta: { p0: 4, gain: 2, minMarkMM: 0, penIds: ['pen-a', 'pen-b'] } });
    for (let i = 0; i < 3; i++) {
      B.beginRun(0, i / 4 + 0.01, 0, 0, undefined, withChannels ? (i === 0 ? 0 : i) : undefined, withChannels ? (i === 2 ? MS.WEIGHT_UNIT * 2 : 0) : undefined);
      for (let k = 0; k < 6; k++) B.vertex(-5 + 2 * k, i * 3, 0, 0, 0, 1);
      B.endRun();
    }
    return B.finish();
  };
  const pose = () => SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0, pitch: 0, roll: 0, zoom: 1, projection: 'orthographic' }, { width: 100, height: 100, penWidth: 0 });
  const lines = (ms) => SL.frame([ms], pose(), { toneFn: () => 1, tone: null, penWidth: 0, objectId: 'o' });

  it('present: builder stores the arrays, validate passes, lines carry penId / weightScale', () => {
    const ms = build(true);
    expect(Array.from(ms.runPen)).toEqual([0, 1, 2]);
    expect(Array.from(ms.runWeight)).toEqual([0, 0, 128]);
    expect(MS.validate(ms).filter((x) => /runPen|runWeight/.test(x))).toEqual([]);
    expect(MS.transferList(ms).length).toBe(7 + 2);
    const L = lines(ms);
    expect(L.length).toBe(3);
    expect(L.map((l) => l.penId)).toEqual([undefined, 'pen-a', 'pen-b']);
    expect(L.map((l) => l.weightScale)).toEqual([undefined, undefined, 2]);
  });
  it('absent: no arrays, no line properties', () => {
    const ms = build(false);
    expect(ms.runPen).toBeUndefined(); expect(ms.runWeight).toBeUndefined();
    const L = lines(ms);
    expect(L.length).toBe(3);
    L.forEach((l) => { expect('penId' in l).toBe(false); expect('weightScale' in l).toBe(false); });
    expect(MS.transferList(ms).length).toBe(7);
  });
});
