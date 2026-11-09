/**
 * StartPageArtRenderer.sceneSession: one engine per turning 3D Scene, only the camera changes per pose.
 * Identity contract: the session's SVG for a pose is byte-identical to a fresh renderDocument of the same document with that camera,
 * for every rock pose, a drag pose, and the return to home, so a plate shows exactly what the app draws.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const clone = (v) => JSON.parse(JSON.stringify(v));
const round1 = (v) => Math.round(v * 10) / 10;

describe('StartPageArtRenderer.sceneSession', () => {
  let runtime; let V; let R;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    V = runtime.window.Vectura;
    R = V.StartPageArtRenderer;
  }, 60000);
  afterAll(() => runtime.cleanup());

  const camLayer = (doc) => doc.state.engine.layers.find((l) => l.type === 'scene3d' && (!l.isGroup || l.containerRole === 'scene'));
  const posedDoc = (doc, pose) => {
    const c = clone(doc);
    const l = camLayer(c);
    l.params.camera = Object.assign({}, l.params.camera || {}, { yaw: pose.yaw, pitch: pose.pitch });
    return c;
  };
  const posesFor = (doc, rock) => {
    const cam = camLayer(doc).params.camera;
    const home = { yaw: round1(cam.yaw), pitch: round1(cam.pitch) };
    const SW = V.StartPageSceneOrbit.SWAY; const LV = V.StartPageSceneOrbit.LEVELS;
    const list = [];
    for (let i = 1; i <= rock; i++) for (const s of [1, -1]) list.push({ yaw: round1(home.yaw + SW[0] * s * i / LV), pitch: round1(home.pitch + SW[1] * s * i / LV) });
    list.push({ yaw: round1(home.yaw - 23), pitch: round1(home.pitch + 9) }); // a drag pose
    list.push(home); // and back
    return list;
  };

  const shadowsDoc = () => R.presetPayload(V.PRESETS.find((p) => p.id === 'scene3d-studio-shadows'));
  const treeDoc = () => {
    const base = shadowsDoc();
    const saved = clone(V.SETTINGS);
    try {
      const e = new V.VectorEngine();
      e.addLayer('scene3d');
      const doc = { type: 'vectura', state: { engine: e.exportState(), settings: base.state.settings }, images: {} };
      expect(doc.state.engine.layers.some((l) => l.type === 'object3d' && l.parentId)).toBe(true);
      expect(camLayer(doc).isGroup).toBe(true);
      return doc;
    } finally { Object.assign(V.SETTINGS, saved); }
  };

  const checkIdentity = async (doc, rock) => {
    const settingsBefore = JSON.stringify(V.SETTINGS);
    const session = R.sceneSession(doc);
    const poses = posesFor(doc, rock);
    for (const pose of poses) {
      const fresh = await R.renderDocument(posedDoc(doc, pose), 'fresh');
      const out = await session.render(pose, 'session');
      expect(out.svg === fresh.svg, `pose ${pose.yaw},${pose.pitch}`).toBe(true);
      expect(out.pathCount).toBe(fresh.pathCount);
      expect(out.ownColors).toEqual(fresh.ownColors);
      expect(JSON.stringify(V.SETTINGS)).toBe(settingsBefore);
    }
    // the poses really differ (the camera moves the drawing), so equality is not vacuous
    const a = await session.render(poses[0]); const b = await session.render(poses[poses.length - 2]);
    expect(a.svg).not.toBe(b.svg);
    session.dispose();
    await expect(session.render(poses[0])).rejects.toThrow(/disposed/);
  };

  test('Studio Shadows (monolith scene): every rock pose, a drag pose and home equal fresh renders', async () => {
    await checkIdentity(shadowsDoc(), 6);
  }, 240000);

  test('a scene TREE (scene group with object3d children): rock, drag pose and home equal fresh renders', async () => {
    await checkIdentity(treeDoc(), 2);
  }, 240000);

  test('renders interleaved with other renders still match (SETTINGS are re-applied per call)', async () => {
    const doc = shadowsDoc();
    const session = R.sceneSession(doc);
    const pose = { yaw: -20.1, pitch: 12.3 };
    const [s1, other, s2] = await Promise.all([session.render(pose), R.renderPreset(V.PRESETS.find((p) => p.id === 'scene3d-studio-shadows')), session.render({ yaw: -25, pitch: 20 })]);
    expect(other.svg.length).toBeGreaterThan(0);
    const fresh1 = await R.renderDocument(posedDoc(doc, pose));
    const fresh2 = await R.renderDocument(posedDoc(doc, { yaw: -25, pitch: 20 }));
    expect(s1.svg === fresh1.svg).toBe(true);
    expect(s2.svg === fresh2.svg).toBe(true);
    session.dispose();
  }, 120000);

  // The worker path: a client that runs the job where it is called (a stand-in for the Web Worker: same ComposeJob.run, same result
  // shape). Poses after the first must come back through it - not through the session's own generator - and equal fresh renders.
  test('with a compose worker, poses after the first are composed by it and still equal fresh renders (settings re-applied around the await)', async () => {
    const C = V.Scene3D.ComposeClient;
    const saved = { available: C.available, create: C.create };
    const jobs = [];
    const fake = () => ({
      available: () => true, isReady: () => true, terminate() {},
      run(job) {
        jobs.push(job.seed);
        const out = V.Scene3D.ComposeJob.run(job);
        const U = V.Scene3D.ComposeJob.unpack;
        return { cancel() {}, promise: Promise.resolve({ paths: U(out.packed), finished: out.finished ? U(out.finished) : null, packed: out.packed, ms: out.ms }) };
      },
    });
    C.available = () => true; C.create = fake;
    try {
      const doc = treeDoc();
      const session = R.sceneSession(doc);
      const poses = [{ yaw: -30, pitch: 20 }, { yaw: -27.5, pitch: 20 }, { yaw: -22.5, pitch: 20 }, { yaw: -40, pitch: 20 }];
      for (const pose of poses) {
        const settingsBefore = JSON.stringify(V.SETTINGS);
        const out = await session.render(pose, 'worker');
        const fresh = await R.renderDocument(posedDoc(doc, pose), 'fresh');
        expect(out.svg === fresh.svg, `pose ${pose.yaw}`).toBe(true);
        expect(JSON.stringify(V.SETTINGS)).toBe(settingsBefore);
      }
      expect(jobs.length).toBe(poses.length - 1); // every pose but the first (the session's own engine build) went to the worker
      session.dispose();
    } finally { Object.assign(C, saved); }
  }, 240000);

  // The main-thread budget of a baked pose. A worker pose used to land as ONE 80-200 ms task (the curve finish run a second time inside
  // computeAllDisplayGeometry, then the whole SVG). It is now counted, not timed: the display geometry is not recomputed for a scene-only
  // document, the worker's finished ink is unpacked and the SVG built in many slices, and the bytes still equal a fresh render.
  test('a lazy worker pose finishes in slices: no second compose or curve finish on this thread, and the bytes equal a fresh render', async () => {
    const C = V.Scene3D.ComposeClient;
    const saved = { available: C.available, create: C.create };
    const E = V.VectorEngine.prototype;
    const spies = { computeAll: 0, finish: 0, unpackWhole: 0, unpackEntry: 0 };
    const orig = { computeAll: E.computeAllDisplayGeometry, finish: E._applySceneCurveFinish, unpack: V.Scene3D.ComposeJob.unpack, unpackEntry: V.Scene3D.ComposeJob.unpackEntry };
    let inWorker = false;
    const lazyClient = () => ({
      available: () => true, isReady: () => true, terminate() {},
      run(job, opts) {
        inWorker = true; // the stand-in worker runs the compose (and its curve finish) here; that is the worker's work, not this thread's
        const out = (() => { try { return V.Scene3D.ComposeJob.run(job); } finally { inWorker = false; } })();
        expect(opts && opts.lazy).toBe(true); // the session asks for the packed ink: nothing is unpacked up front
        return { cancel() {}, promise: Promise.resolve({ packed: out.packed, finishedPacked: out.finished, ms: out.ms }) };
      },
    });
    const savedTuning = Object.assign({}, R.tuning);
    C.available = () => true; C.create = lazyClient;
    try {
      const doc = treeDoc();
      const session = R.sceneSession(doc);
      await session.render({ yaw: -30, pitch: 20 }, 'first'); // the session's own engine build (not counted)
      R.tuning.sliceMs = 0.001; R.tuning.quietMs = 0; // every unit of work is its own slice
      E.computeAllDisplayGeometry = function (...a) { spies.computeAll += 1; return orig.computeAll.apply(this, a); };
      E._applySceneCurveFinish = function (...a) { if (!inWorker) spies.finish += 1; return orig.finish.apply(this, a); };
      V.Scene3D.ComposeJob.unpack = function (...a) { spies.unpackWhole += 1; return orig.unpack.apply(this, a); };
      V.Scene3D.ComposeJob.unpackEntry = function (...a) { spies.unpackEntry += 1; return orig.unpackEntry.apply(this, a); };
      const slices0 = R.stats().slices;
      const pose = { yaw: -22.5, pitch: 20 };
      const settingsBefore = JSON.stringify(V.SETTINGS);
      const out = await session.render(pose, 'lazy');
      const counted = Object.assign({}, spies); // the fresh render below does its own work
      const sliced = R.stats().slices - slices0;
      const fresh = await R.renderDocument(posedDoc(doc, pose), 'fresh');
      expect(out.svg === fresh.svg).toBe(true);
      expect(JSON.stringify(V.SETTINGS)).toBe(settingsBefore);
      expect(out.sliced).toBe(true);
      expect(counted.computeAll).toBe(0);
      expect(counted.finish).toBe(0);
      expect(counted.unpackWhole).toBe(0);
      expect(counted.unpackEntry).toBeGreaterThan(10);
      expect(sliced).toBeGreaterThan(20);
      session.dispose();
    } finally {
      Object.assign(C, saved);
      E.computeAllDisplayGeometry = orig.computeAll; E._applySceneCurveFinish = orig.finish;
      V.Scene3D.ComposeJob.unpack = orig.unpack; V.Scene3D.ComposeJob.unpackEntry = orig.unpackEntry;
      Object.assign(R.tuning, savedTuning);
    }
  }, 240000);

  test('a document with another layer still recomputes its display geometry after a worker pose', async () => {
    const C = V.Scene3D.ComposeClient;
    const saved = { available: C.available, create: C.create };
    const E = V.VectorEngine.prototype;
    const origAll = E.computeAllDisplayGeometry;
    let calls = 0;
    C.available = () => true;
    C.create = () => ({ available: () => true, isReady: () => true, terminate() {}, run(job) { const out = V.Scene3D.ComposeJob.run(job); return { cancel() {}, promise: Promise.resolve({ packed: out.packed, finishedPacked: out.finished, ms: out.ms }) }; } });
    try {
      const doc = treeDoc();
      const extra = new V.VectorEngine();
      extra.addLayer('lissajous');
      const lis = extra.exportState().layers.find((l) => l.type === 'lissajous');
      doc.state.engine.layers.push(lis);
      const session = R.sceneSession(doc);
      await session.render({ yaw: -30, pitch: 20 }, 'first');
      E.computeAllDisplayGeometry = function (...a) { calls += 1; return origAll.apply(this, a); };
      const pose = { yaw: -22.5, pitch: 20 };
      const out = await session.render(pose, 'mixed');
      const fresh = await R.renderDocument(posedDoc(doc, pose), 'fresh');
      expect(out.svg === fresh.svg).toBe(true);
      expect(calls).toBeGreaterThan(0);
      session.dispose();
    } finally { Object.assign(C, saved); E.computeAllDisplayGeometry = origAll; }
  }, 240000);
});
