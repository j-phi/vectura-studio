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
});
