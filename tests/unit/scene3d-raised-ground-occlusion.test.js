const { loadSurfaceLockRuntime, buildSurfaceLockScene, dragEqualsExport } = require('../helpers/surface-lock-scene');

/*
 * U4 -- a raised ground (finite non-zero ground.y) occludes scene geometry below it, in the pose path (Level F) and in
 * Level S (sceneFrame). Ground ink and the cast shadow are on the plane itself and must not be clipped by it.
 * Oracle: sample the sphere surface in world space, project each sample with the scene camera and call a drawn fill/edge
 * point "illegal" when it coincides in screen x,y with a camera-FACING sample whose world y is below the plane (a lone sphere's
 * ink lies on its camera-facing side, and the drawn points carry no depth).
 */
const GROUND_Y = 20;
const MARGIN = 4; // samples must be this far under the plane, so a point drawn on the cut line itself is never flagged
// (samples within 0.25 of the limb are skipped: there a few mm of surface project onto well under the 0.6 mm match radius)
// Shadow path count of this scene on the tree before U4 (measured there): the occluder must not clip the shadow.
const EXPECTED_SHADOW = 192;
const POSES = [{ camYaw: -30, camPitch: 35 }, { camYaw: 60, camPitch: 50 }];

describe('scene3d raised ground occludes geometry below it (U4)', () => {
  let rt; let V;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; }, 120000);
  afterAll(() => rt && rt.cleanup());

  const build = (markSpace, groundY) => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere', markSpace, mapper: 'hatch', camera: { projection: 'orthographic' } });
    const leaf = s.objectsOf()[0];
    leaf.params.transform = { ...(leaf.params.transform || {}), x: 0, y: 0, z: 0 };
    leaf.params.params = { ...(leaf.params.params || {}), radius: 40 };
    const gl = s.eng.getLayerDescendants(s.gid).find((l) => l && l.type === 'sceneGround3d');
    if (groundY !== undefined) gl.params.y = groundY;
    return s;
  };
  const project = (s, w) => V.Scene3D.Scene.projectWorldPoint(w, s.group.params.camera, { width: 210, height: 297 });
  const illegal = (s, paths) => {
    const R = 40; const below = [];
    for (let i = 0; i <= 180; i += 1) for (let j = 0; j < 360; j += 2) {
      const th = (i * Math.PI) / 180; const ph = (j * Math.PI) / 180;
      const w = { x: R * Math.sin(th) * Math.cos(ph), y: R * Math.cos(th), z: R * Math.sin(th) * Math.sin(ph) };
      const cam = s.group.params.camera;
      const nz = V.Geometry3D.rotatePoint({ x: w.x / R, y: w.y / R, z: w.z / R }, { yaw: cam.yaw || 0, pitch: cam.pitch || 0, roll: cam.roll || 0 }).z;
      if (nz > 0.25 && w.y < GROUND_Y - MARGIN) { const q = project(s, w); if (q) below.push(q); }
    }
    const hash = new Map(); const C = 2;
    below.forEach((q) => { const k = `${Math.floor(q.x / C)},${Math.floor(q.y / C)}`; (hash.get(k) || hash.set(k, []).get(k)).push(q); });
    let bad = 0; let total = 0;
    paths.filter((p) => p.meta && (p.meta.kind === 'sceneFill' || p.meta.kind === 'sceneEdge')).forEach((p) => p.forEach((pt) => {
      total += 1;
      const cx = Math.floor(pt.x / C); const cy = Math.floor(pt.y / C);
      for (let a = -1; a <= 1; a += 1) for (let b = -1; b <= 1; b += 1) {
        const list = hash.get(`${cx + a},${cy + b}`);
        if (list && list.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 0.6)) { bad += 1; return; }
      }
    }));
    return { bad, total };
  };
  const shadowCount = (paths) => paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow').length;

  ['pose', 'surface'].forEach((space) => {
    it(`${space}: nothing from world y < ground.y is drawn`, () => {
      POSES.forEach((pose) => {
        const s = build(space, GROUND_Y); s.setPose(pose);
        const paths = space === 'surface' ? s.composePreview() : s.composeFull();
        const r = illegal(s, paths);
        expect(r.total).toBeGreaterThan(200);
        expect(r.bad).toBe(0);
      });
    }, 120000);
  });

  it('the oracle sees violations when the ground is not raised over the sphere (witness is live)', () => {
    // Same oracle, ground at 0: a sphere's lower half is drawn, so the oracle must flag it.
    const s = build('pose', 0); s.setPose(POSES[0]);
    expect(illegal(s, s.composeFull()).bad).toBeGreaterThan(10);
  }, 120000);

  it('Level S drag frames equal the export (Level F) with a raised ground', () => {
    const s = build('surface', GROUND_Y);
    dragEqualsExport(s, POSES).forEach((r) => expect(r.equal).toBe(true));
  }, 120000);

  it('the cast shadow and ground ink are not clipped by the occluder', () => {
    const s = build('surface', GROUND_Y); s.setPose(POSES[0]);
    const paths = s.composeFull();
    expect(shadowCount(paths)).toBe(EXPECTED_SHADOW);
    expect(paths.some((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground' && p.meta.kind === 'sceneEdge')).toBe(true);
  }, 120000);
});

