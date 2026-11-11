/*
 * RGR — a worker settle that lands after a newer edit must not install its (old pose) ink.
 *  1. Start the settle (beginSceneAsync), change the pitch, generate (sync full compose: the new state is memoized), then let the
 *     old result land: finishSceneAsync refuses it and the group keeps the NEW pose's ink under the new key.
 *  2. A sync full compose / memo hit of a different state cancels the settle still in flight.
 *  3. An unchanged scene still installs the result (the happy path is untouched).
 * RED (pre-change): finishSceneAsync compared keys only when its capture returned a job; with the newer state memoized it returned none,
 * so the old result was installed under the new key (the canvas, export and the next memo hit all showed the old pose).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const hashPaths = (paths) => {
  let h = 0x811c9dc5 >>> 0; let n = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  (paths || []).forEach((p) => { if (!Array.isArray(p)) return; n++; mix('|'); p.forEach((q) => mix(`${q.x},${q.y};`)); });
  return `${h.toString(16)}:${n}`;
};

describe('Engine worker settle vs a newer edit', () => {
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
    return { engine, gid, group };
  };
  // A worker stand-in: composes the posted job on the calling thread (same code the worker runs) and resolves when told to.
  const fakeClient = (ignoreCancel) => {
    const c = { runs: [], cancels: 0, available: () => true };
    c.run = (job) => {
      const out = V.Scene3D.ComposeJob.run(job);
      let resolve; let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      const h = { promise, cancel: () => { c.cancels += 1; if (!ignoreCancel) reject(new Error('cancelled')); }, land: () => resolve({ paths: V.Scene3D.ComposeJob.unpack(out.packed), finished: out.finished ? V.Scene3D.ComposeJob.unpack(out.finished) : null, packed: out.packed, ms: out.ms }) };
      c.runs.push(h);
      return h;
    };
    return c;
  };
  const reference = (mut) => { const r = make(); mut(r.group); r.engine.computeAllDisplayGeometry(); return hashPaths(r.group.scenePaths); };

  test('a result for the old pose is refused when the newer pose is already memoized (even if the cancel came too late)', async () => {
    const o = make(); const client = fakeClient(true);              // a result that is already on its way ignores the cancel
    o.group.params.camera.yaw += 40;                                   // the pose the settle is posted for
    const ctx = o.engine.beginSceneAsync(o.gid, { client });
    expect(ctx && ctx.job).toBeTruthy();
    o.group.params.camera.pitch += 9;                                  // an edit while the worker runs
    o.engine.generate(o.gid);                                          // ...and its sync full compose: the new state is now memoized
    const fresh = hashPaths(o.group.scenePaths);
    const keyNow = o.group._sceneSettledKey;
    client.runs[0].land();
    const installed = await ctx.promise.then((res) => o.engine.finishSceneAsync(ctx, res), () => false);
    expect(installed).toBe(false);
    expect(o.group._sceneSettledKey).toBe(keyNow);
    expect(hashPaths(o.group.scenePaths)).toBe(fresh);
    o.engine.computeAllDisplayGeometry();                               // the memo still serves the new pose
    expect(hashPaths(o.group.scenePaths)).toBe(fresh);
    expect(fresh).toBe(reference((g) => { g.params.camera.yaw += 40; g.params.camera.pitch += 9; }));
  }, 120000);

  test('a sync full compose of a different state cancels the settle in flight', () => {
    const o = make(); const client = fakeClient();
    o.group.params.camera.yaw += 40;
    const ctx = o.engine.beginSceneAsync(o.gid, { client });
    expect(ctx.job).toBeTruthy();
    expect(o.group._sceneAsyncHandle).toBeTruthy();
    o.group.params.camera.pitch += 9;
    o.engine.generate(o.gid);
    expect(client.cancels).toBe(1);
    expect(o.group._sceneAsyncHandle).toBeNull();
    ctx.promise.catch(() => {});
  });

  test('an unchanged scene still installs the settle result, equal to a plain render', async () => {
    const o = make(); const client = fakeClient();
    o.group.params.camera.yaw += 40;
    const ctx = o.engine.beginSceneAsync(o.gid, { client });
    o.engine.computeAllDisplayGeometry();                              // a no-op recompose of the SAME state must not cancel it
    expect(client.cancels).toBe(0);
    client.runs[0].land();
    const ok = await ctx.promise.then((res) => o.engine.finishSceneAsync(ctx, res), () => false);
    expect(ok).toBe(true);
    expect(hashPaths(o.group.scenePaths)).toBe(reference((g) => { g.params.camera.yaw += 40; }));
  }, 120000);
});
