/*
 * RGR — pre-baked spin for a 3D Scene (Scene3D.SpinRing).
 *  1. The ring is keyed by the scene minus the swept yaw: a yaw change keeps it valid, any other edit invalidates it.
 *  2. Frames are baked outward from the current yaw; nearest() is circular.
 *  3. Installing a baked frame equals a normal full render at that yaw (byte for byte) and runs no compose.
 *  4. A stale frame (scene edited since) is refused.
 * RED (pre-change src): Scene3D.SpinRing, Engine.sceneJobOnly and Engine.installSpinFrame do not exist.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const hashPaths = (paths) => {
  let h = 0x811c9dc5 >>> 0; let n = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  (paths || []).forEach((p) => { if (!Array.isArray(p)) return; n++; mix('|'); p.forEach((q) => mix(`${q.x},${q.y};`)); });
  return `${h.toString(16)}:${n}`;
};
const wait = (ring, n) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => {
    if (ring.readyCount() >= n) resolve();
    else if (Date.now() - t0 > 120000) reject(new Error('bake timeout'));
    else setTimeout(tick, 5);
  };
  tick();
});

describe('Scene3D.SpinRing', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeUi: false }); V = runtime.window.Vectura; }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

  const make = () => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === gid);
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    child.params.primitive = 'sphere';
    child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true } };
    engine.computeAllDisplayGeometry();
    const target = { id: 'camera', get: () => group.params.camera.yaw, set: (y) => { group.params.camera.yaw = y; } };
    return { engine, group, child, target };
  };
  const ringOf = (o, step = 90) => V.Scene3D.SpinRing.create({ engine: o.engine, group: o.group, target: o.target, step, runnerFactory: V.Scene3D.SpinRing.inlineRunner, poolSize: 1 });

  test('key is the scene minus yaw: yaw edits keep the ring, other edits drop it', () => {
    const o = make(); const ring = ringOf(o);
    expect(ring.key0).toBeTruthy();
    o.group.params.camera.yaw += 17;
    expect(ring.valid()).toBe(true);
    o.group.params.camera.pitch += 4;
    expect(ring.valid()).toBe(false);
    ring.dispose();
  });

  test('bakes outward from the current yaw and finds the nearest frame circularly', async () => {
    const o = make(); o.group.params.camera.yaw = 170;
    const ring = ringOf(o, 90);
    expect(ring.count).toBe(4);
    ring.start();
    await wait(ring, 1);
    expect(ring.frames.has(0)).toBe(true);           // the starting yaw is first
    await wait(ring, 4);
    expect(ring.frameAt(-175).yaw).toBe(ring.yaws[ring.frameAt(-175).idx]);
    expect(ring.frameAt(179).yaw).toBe(170);
    expect(ring.report().vectorMB).toBeGreaterThan(0);
    expect(o.group.params.camera.yaw).toBe(170);      // baking never leaves the scene turned
    ring.dispose();
  }, 120000);

  test('an installed frame is byte-identical to a full render at that yaw and runs no compose', async () => {
    const o = make(); const ring = ringOf(o, 90); ring.start(); await wait(ring, 4);
    const f = ring.frames.get(1);
    o.group.params.camera.yaw = f.yaw;
    const composes = o.engine.sceneComposeStats.composes;
    expect(o.engine.installSpinFrame(o.group, f)).toBe(true);
    expect(o.engine.sceneComposeStats.composes).toBe(composes);
    expect(o.group._pathsFromDraft).toBe(false);
    const installed = hashPaths(o.group.scenePaths);
    // reference: a fresh engine, same scene, same yaw, plain compose
    const ref = make(); ref.group.params.camera.yaw = f.yaw; ref.engine.computeAllDisplayGeometry();
    expect(installed).toBe(hashPaths(ref.group.scenePaths));
    // and the memo it left behind still serves later regenerations identically
    o.engine.computeAllDisplayGeometry();
    expect(hashPaths(o.group.scenePaths)).toBe(installed);
    ring.dispose();
  }, 120000);

  test('a stale frame is refused', async () => {
    const o = make(); const ring = ringOf(o, 180); ring.start(); await wait(ring, 2);
    const f = ring.frames.get(1);
    o.group.params.camera.yaw = f.yaw;
    o.group.params.camera.zoom = 1.3;
    expect(o.engine.installSpinFrame(o.group, f)).toBe(false);
    ring.dispose();
  }, 120000);
});
