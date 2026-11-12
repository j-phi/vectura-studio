const { loadSurfaceLockRuntime, buildSurfaceLockScene, signature } = require('../helpers/surface-lock-scene');

/*
 * Scene 3D — the Transform & Seed section reaches the ink ("the transform and seed on scene 3d does nothing").
 *
 * TRANSFORM. A scene GROUP's posX/posY/scaleX/scaleY/rotation were never applied: the leaf-layer post-transform lives in
 * Engine._generateImpl, which a scene group never reaches (its ink comes from _composeSceneGroup). Contract now: the
 * Transform acts on the FINISHED ink like every other layer (scale, rotate, translate) about the DOCUMENT centre (a scene's
 * bbox moves as the camera orbits, so a bbox pivot would swim under a drag). The compose, its memo, the surface-lock caches
 * and the pose snapshot never see it.
 *
 * SEED. The surface-locked marks already draw their salt from the Seed, never from the layer's random UUID (two fresh
 * engines with equal seeds give identical ink). What was dead was the panel's reach predicate, which greyed out the Seed
 * field on the default (surface-locked ladder + ground shadow) scene although the seed changes that ink.
 *
 * Every scene is built through engine.addLayer (buildSurfaceLockScene), so defaults and the factory preset are in play.
 */

const MODES = ['surface', 'pose'];
const W = 320; const H = 220; // the helper's profile: the document centre is (160, 110)
const CX = W / 2; const CY = H / 2;

const flat = (paths) => (paths || []).flatMap((p) => (Array.isArray(p) ? p : []));
const maxDelta = (a, b) => {
  const pa = flat(a); const pb = flat(b);
  if (pa.length !== pb.length) return Infinity;
  let m = 0;
  for (let i = 0; i < pa.length; i += 1) m = Math.max(m, Math.abs(pa[i].x - pb[i].x), Math.abs(pa[i].y - pb[i].y));
  return m;
};
// points only: the meta carries the layer UUID (objectId), which is exactly what two fresh layers must not share
const ptsSig = (paths) => JSON.stringify((paths || []).map((p) => (Array.isArray(p) ? p.map((q) => [Math.round(q.x * 1e6), Math.round(q.y * 1e6)]) : null)));

describe('Scene 3D group Transform & Seed', () => {
  let rt; let V;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime({ sceneSeedMode: 'seeded' }); V = rt.V; });
  afterAll(() => rt && rt.cleanup());

  const build = (markSpace, extra = {}) => buildSurfaceLockScene(V, { kind: 'sphere', mapper: 'stipple', markSpace, ...extra });
  const setXf = (s, xf) => { Object.assign(s.group.params, xf); };
  const snapshotPts = (paths) => flat(paths).map((q) => ({ x: q.x, y: q.y }));

  describe.each(MODES)('markSpace %s', (mode) => {
    test('Pos X / Pos Y translate the whole picture', () => {
      const s = build(mode);
      const base = snapshotPts(s.composeFull());
      expect(base.length).toBeGreaterThan(100);
      setXf(s, { posX: 40, posY: -15 });
      const moved = s.composeFull();
      const exp = base.map((q) => ({ x: q.x + 40, y: q.y - 15 }));
      expect(maxDelta(moved, exp.length ? [exp] : [])).toBeLessThan(1e-9);
    });

    test('Scale scales about the document centre', () => {
      const s = build(mode);
      const base = snapshotPts(s.composeFull());
      setXf(s, { scaleX: 1.5, scaleY: 0.5 });
      const got = s.composeFull();
      const exp = base.map((q) => ({ x: CX + (q.x - CX) * 1.5, y: CY + (q.y - CY) * 0.5 }));
      expect(maxDelta(got, [exp])).toBeLessThan(1e-9);
    });

    test('Rotation rotates about the document centre', () => {
      const s = build(mode);
      const base = snapshotPts(s.composeFull());
      setXf(s, { rotation: 90 });
      const got = s.composeFull();
      // +90 deg with y down: (dx, dy) -> (-dy, dx)
      const exp = base.map((q) => ({ x: CX - (q.y - CY), y: CY + (q.x - CX) }));
      expect(maxDelta(got, [exp])).toBeLessThan(1e-9);
    });

    test('the pick polygons (and so every click on the scene) move with the ink', () => {
      const s = build(mode);
      const polysOf = (paths) => paths.map((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.pickPolygon).filter(Array.isArray);
      const base = polysOf(s.composeFull()).map((poly) => poly.map((q) => ({ x: q.x, y: q.y })));
      setXf(s, { posX: 25, posY: 10 });
      const moved = polysOf(s.composeFull());
      if (!base.length) return; // a scene with no pickable fill polygon has nothing to move
      expect(moved.length).toBe(base.length);
      expect(Math.abs(moved[0][0].x - (base[0][0].x + 25))).toBeLessThan(1e-9);
      expect(Math.abs(moved[0][0].y - (base[0][0].y + 10))).toBeLessThan(1e-9);
    });

    test('back at the identity the ink is the untransformed compose, byte for byte', () => {
      const s = build(mode);
      const base = signature(s.composeFull());
      setXf(s, { posX: 12, scaleX: 2, rotation: 33 });
      expect(signature(s.composeFull())).not.toBe(base);
      setXf(s, { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 });
      expect(signature(s.composeFull())).toBe(base);
    });

    test('the transform is applied once however many times the scene recomposes', () => {
      const s = build(mode);
      const base = snapshotPts(s.composeFull());
      setXf(s, { posX: 30 });
      s.composeFull();
      s.composeFull();
      s.eng.computeAllDisplayGeometry();
      const exp = base.map((q) => ({ x: q.x + 30, y: q.y }));
      expect(maxDelta(s.group.scenePaths, [exp])).toBeLessThan(1e-9);
    });

    test('a drag frame (preview compose) carries the transform too', () => {
      const s = build(mode);
      s.composeFull();
      setXf(s, { posX: 40, posY: 20 });
      const frame = s.composePreview();
      const settled = s.composeFull();
      // Level S: the frame IS the export. Pose mode: a draft/warp frame at least sits where the settled ink sits.
      if (mode === 'surface') {
        expect(s.group._sceneLevelS).toBe(true);
        expect(signature(frame)).toBe(signature(settled));
      } else {
        const box = (paths) => {
          const p = flat(paths); const xs = p.map((q) => q.x); const ys = p.map((q) => q.y);
          return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
        };
        const a = box(frame); const b = box(settled);
        expect(Math.abs(a.cx - b.cx)).toBeLessThan(2);
        expect(Math.abs(a.cy - b.cy)).toBeLessThan(2);
      }
    });

    test('an orbit after the transform keeps the same pivot (the picture does not swim)', () => {
      const s = build(mode);
      setXf(s, { rotation: 90 });
      s.setPose({ camYaw: -30, camPitch: 20 });
      const a = snapshotPts(s.composeFull());
      setXf(s, { rotation: 0 });
      const plain = snapshotPts(s.composeFull());
      // rotating the settled, untransformed ink by hand about the document centre must give the rotated compose
      const exp = plain.map((q) => ({ x: CX - (q.y - CY), y: CY + (q.x - CX) }));
      expect(a.length).toBe(exp.length);
      let m = 0; a.forEach((q, i) => { m = Math.max(m, Math.abs(q.x - exp[i].x), Math.abs(q.y - exp[i].y)); });
      expect(m).toBeLessThan(1e-9);
    });

    test('Seed changes the random marks', () => {
      const a = build(mode);
      setXf(a, { seed: 111, seedMode: 'seeded' });
      const b = build(mode);
      setXf(b, { seed: 222, seedMode: 'seeded' });
      // the leaf's own seed is random per layer: pin it so ONLY the scene Seed differs
      a.objectsOf().forEach((l) => { l.params.seed = 5; });
      b.objectsOf().forEach((l) => { l.params.seed = 5; });
      expect(signature(a.composeFull())).not.toBe(signature(b.composeFull()));
    });

    test('equal seeds give equal ink on two fresh layers (the salt is the Seed, never the layer UUID)', () => {
      const mk = () => {
        const s = build(mode);
        setXf(s, { seed: 4321, seedMode: 'seeded' });
        s.objectsOf().forEach((l) => { l.params.seed = 77; });
        return s;
      };
      const a = mk(); const b = mk();
      expect(a.gid).not.toBe(b.gid);
      expect(ptsSig(a.composeFull())).toBe(ptsSig(b.composeFull()));
    });
  });

  test('the DEFAULT scene (surface-locked ladder + ground shadow): the Seed moves the ink and the panel says it is live', () => {
    const mk = (seed) => {
      const s = buildSurfaceLockScene(V, { kind: 'sphere', markSpace: 'surface' });
      setXf(s, { seed, seedMode: 'seeded' });
      s.objectsOf().forEach((l) => { l.params.seed = 5; });
      return s;
    };
    const a = mk(1); const b = mk(2);
    expect(signature(a.composeFull())).not.toBe(signature(b.composeFull()));
    const asm = a.group._sceneAssembled;
    const P = V.Scene3D.Params;
    expect(P.sceneUsesSeed({ objects: asm.objects, styleTable: asm.styleTable, lights: asm.lights, ground: asm.ground, shadow: asm.shadow })).toBe(true);
  });

  test('a scene whose every fill is seed-free still reads as seed-free (the reach predicate is not just "always true")', () => {
    const s = buildSurfaceLockScene(V, { kind: 'sphere', mapper: 'hatch', toneLaw: 'contFieldSigmoid', markSpace: 'surface', shadow: false });
    s.composeFull();
    const asm = s.group._sceneAssembled;
    const P = V.Scene3D.Params;
    expect(P.sceneUsesSeed({ objects: asm.objects, styleTable: asm.styleTable, lights: asm.lights, ground: asm.ground, shadow: asm.shadow })).toBe(false);
  });

  test('a legacy (seedMode "legacy") layer ignores the Seed, so saved files render as they always did', () => {
    const mk = (seed) => {
      const s = build('surface');
      setXf(s, { seed, seedMode: 'legacy' });
      s.objectsOf().forEach((l) => { l.params.seedMode = 'legacy'; l.params.seed = 9; });
      return s;
    };
    expect(ptsSig(mk(1).composeFull())).toBe(ptsSig(mk(2).composeFull()));
    // (and the layers differ only by id, so equal points prove the salt is not the UUID there either)
  });
});
