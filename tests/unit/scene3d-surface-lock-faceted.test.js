const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// W3-A (docs/surface-lock-contract.md §7, §9 "Faceted", §12 FIT, §13): the faceted baker. One planar generator per face of a box,
// plane or polyhedron, the frame anchored to OBJECT axes, nested per face; Level S and Level F both read it. Every scene is built
// through engine.addLayer (buildSurfaceLockScene), so defaults and the factory preset are in play.

describe('SurfaceLockFaceted (box, plane, polyhedron)', () => {
  let rt; let V; let SL; let F;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; F = V.Scene3D.SurfaceLockFaceted; });
  afterAll(() => rt && rt.cleanup());

  const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };
  const build = (extra = {}) => buildSurfaceLockScene(V, { kind: 'box', toneLaw: 'ladder', mapper: 'hatch', markSpace: 'surface', ...extra });
  const specsOf = (s) => { s.composeFull(); return V.AlgorithmRegistry.scene3d.levelSBakeSpecs(JSON.parse(JSON.stringify(s.group._sceneAssembled)), BOUNDS); };
  const metaOf = (p) => (p && p.meta) || {};
  const tgt = (p) => metaOf(p).sceneTarget || {};
  const fillsOf = (paths, id) => paths.filter((p) => metaOf(p).kind === 'sceneFill' && tgt(p).objectId === id);
  const edgesOf = (paths, id, cls) => paths.filter((p) => metaOf(p).kind === 'sceneEdge' && tgt(p).objectId === id && (!cls || tgt(p).edgeClass === cls));
  const withoutLevelS = (fn) => { const real = SL.frameable; SL.frameable = () => false; try { return fn(); } finally { SL.frameable = real; } };
  const len = (path) => { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); return l; };
  const totalLen = (paths) => paths.reduce((a, p) => a + len(p), 0);

  describe('FIT and supports (§9, §12)', () => {
    const spec = (o = {}) => ({ primitive: 'box', mode: undefined, mapper: 'hatch', toneLaw: 'ladder', style: {}, ...o });
    it('box, plane and polyhedron take hatch and crosshatch of the ladder law, and nothing else', () => {
      ['box', 'plane', 'solid'].forEach((primitive) => ['hatch', 'crosshatch'].forEach((mapper) => expect(F.supports(spec({ primitive, mapper })), `${primitive} ${mapper}`).toBe(true)));
      expect(F.supports(spec({ mode: 'faceted' }))).toBe(true);
      ['contour', 'spiral', 'stipple', 'none'].forEach((mapper) => expect(F.supports(spec({ mapper })), mapper).toBe(false));
      ['sphere', 'cylinder', 'torus', 'pyramid'].forEach((primitive) => expect(F.supports(spec({ primitive })), primitive).toBe(false));
      expect(F.supports(spec({ mode: 'sphere' }))).toBe(false);
      expect(F.supports(spec({ toneLaw: 'mezzoRegion' }))).toBe(false);
      expect(F.supports(spec({ toneLaw: 'etfKang' }))).toBe(false);
    });
    it('refuses the styles a locked mark cannot honour', () => {
      expect(F.supports(spec({ style: { tripleHatch: true } }))).toBe(false);
      ['worldUp', 'light', 'screen'].forEach((angleRef) => expect(F.supports(spec({ style: { angleRef } })), angleRef).toBe(false));
      expect(F.supports(spec({ style: { angleRef: 'face' } }))).toBe(true);
      expect(F.supports(spec({ primitive: 'solid', sizes: { solidType: 'importedMesh' } }))).toBe(false);
      expect(F.supports(spec({ primitive: 'solid', sizes: { solidType: 'buckyball', shard: 30 } }))).toBe(false);
    });
    it('dispatch: a box with a hatch resolves to the faceted baker, a mezzo box to none', () => {
      expect(SL.bakerFor(spec())).toBe(F);
      expect(SL.bakerFor(spec({ toneLaw: 'mezzoRegion' }))).toBe(null);
      expect(SL.effectiveMarkSpace({ markSpace: 'surface' }, { spec: spec(), mapper: 'hatch' })).toBe('surface');
      expect(SL.explainMarkSpace({ markSpace: 'surface' }, { spec: spec({ toneLaw: 'mezzoRegion' }), mapper: 'hatch' }).reason).toBe('no baker');
    });
  });

  describe('the bake', () => {
    it('is deterministic, well formed, and on the faces', () => {
      const s = build();
      const [spec] = specsOf(s);
      expect(spec && spec.primitive).toBe('box');
      const a = F.bake(spec); const b = F.bake(spec);
      expect(V.Scene3D.SurfaceLockMarkSet.validate(a)).toEqual([]);
      expect(a.runCount).toBeGreaterThan(100);
      ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily'].forEach((k) => expect(Buffer.from(a[k].buffer).equals(Buffer.from(b[k].buffer)), k).toBe(true));
      // every vertex sits on a face plane of the 40 mm box
      for (let v = 0; v < a.vertexCount; v++) {
        const x = Math.abs(a.positions[3 * v]); const y = Math.abs(a.positions[3 * v + 1]); const z = Math.abs(a.positions[3 * v + 2]);
        expect(Math.max(x, y, z)).toBeCloseTo(20, 4);
      }
    });

    it('marks are anchored to OBJECT axes: the +X face rules at fillAngle in the (+Y, +Z) frame, on every pose', () => {
      const s = build();
      const [spec] = specsOf(s);
      const a = spec.style.fillAngle === undefined ? 45 : spec.style.fillAngle;
      const ms = F.bake(spec);
      const P = ms.positions; let checked = 0;
      for (let r = 0; r < ms.runCount; r++) {
        const v0 = ms.runStart[r]; const v1 = ms.runStart[r + 1] - 1;
        if (Math.abs(P[3 * v0] - 20) > 1e-4 || Math.abs(P[3 * v1] - 20) > 1e-4) continue; // the +X face only
        const dy = P[3 * v1 + 1] - P[3 * v0 + 1]; const dz = P[3 * v1 + 2] - P[3 * v0 + 2];
        const l = Math.hypot(dy, dz);
        const ang = (Math.atan2(dz / l, dy / l) * 180 / Math.PI + 360) % 180;
        expect(Math.abs(ang - (a % 180)), `run ${r}`).toBeLessThan(1e-3);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(20);
      // pose-free: the bake key (and the cache) survives a camera and object yaw sweep
      SL.clearCache(); SL.resetStats();
      for (let i = 0; i < 12; i++) { s.setPose({ camYaw: -60 + i * 10, camPitch: 20, objYaw: i * 7 }); s.composeFull(); }
      expect(SL.stats.bakeMisses).toBe(1);
    });

    it('nests per face: every threshold subset of a face is evenly spaced at p0 / 2^l', () => {
      const s = build();
      const [spec] = specsOf(s);
      const ms = F.bake(spec); const P = ms.positions;
      const L = ms.meta.levelsDesigned; const p0 = ms.meta.p0;
      expect(L).toBeGreaterThanOrEqual(3);
      // face +Z: n = (0,0,1), U = +X, V = +Y; family 0 direction d = (cos a, sin a, 0), ruling coordinate t = m . p with m = n x d
      const a = (spec.style.fillAngle === undefined ? 45 : spec.style.fillAngle) * Math.PI / 180;
      const m = [-Math.sin(a), Math.cos(a)];
      const byLevel = [];
      for (let l = 0; l < L; l++) byLevel.push([]);
      for (let r = 0; r < ms.runCount; r++) {
        const v0 = ms.runStart[r]; const v1 = ms.runStart[r + 1] - 1;
        if (Math.abs(P[3 * v0 + 2] - 20) > 1e-4 || Math.abs(P[3 * v1 + 2] - 20) > 1e-4 || ms.runFamily[r] !== 0) continue; // the +Z face only (its ends are not on an edge face)
        byLevel[ms.runLevel[r]].push(m[0] * P[3 * v0] + m[1] * P[3 * v0 + 1]);
      }
      for (let l = 0; l < L; l++) {
        const t = [].concat(...byLevel.slice(0, l + 1)).sort((x, y) => x - y);
        expect(t.length, `level ${l}`).toBeGreaterThan(2);
        const want = p0 / Math.pow(2, l);
        for (let i = 1; i < t.length; i++) expect(Math.abs(t[i] - t[i - 1] - want), `level ${l} gap ${i}`).toBeLessThan(1e-3);
      }
    });

    it('a one-face bake is that face of the whole bake, run for run (the Level F / Level S contract)', () => {
      const s = build({ mapper: 'crosshatch' });
      const [spec] = specsOf(s);
      const whole = F.bake(spec);
      let runs = 0; const pos = [];
      for (let f = 0; f < 6; f++) {
        const part = F.bake({ ...spec, sizes: { ...spec.sizes, face: f } });
        expect(part.runCount, `face ${f}`).toBeGreaterThan(20);
        runs += part.runCount; pos.push(...Array.from(part.positions));
      }
      expect(runs).toBe(whole.runCount);
      expect(pos).toEqual(Array.from(whole.positions));
      expect(new Set(Array.from(whole.runFamily))).toEqual(new Set([0, 1]));
      expect(SL.bakeKey(spec)).not.toBe(SL.bakeKey({ ...spec, sizes: { ...spec.sizes, face: 2 } }));
    });

    it('a plane and a polyhedron bake; bake time of the default box is inside the budget', () => {
      const s = build();
      const [spec] = specsOf(s);
      const t0 = Date.now(); const box = F.bake(spec); const ms = Date.now() - t0;
      expect(ms).toBeLessThan(400);
      expect(box.meta.msBake).toBeLessThan(400);
      const plane = F.bake({ ...spec, primitive: 'plane', sizes: { sx: 60, sz: 60 } });
      expect(plane.runCount).toBeGreaterThan(10);
      const solid = F.bake({ ...spec, primitive: 'solid', convex: undefined, sizes: { solidType: 'buckyball', radius: 20 } });
      expect(V.Scene3D.SurfaceLockMarkSet.validate(solid)).toEqual([]);
      expect(solid.runCount).toBeGreaterThan(100);
      process.stdout.write(`W3-A bake ms: default box ${ms} (meta ${box.meta.msBake.toFixed(1)}), runs ${box.runCount}, vertices ${box.vertexCount}\n`);
    });
  });

  describe('Level S: a hatched box composes from cached data (§13)', () => {
    it('the box is frameable, takes the sceneFrame path and stamps its fills surfaceLocked', () => {
      const s = build();
      s.setPose({ camYaw: -30, camPitch: 20 });
      SL.resetStats();
      const paths = s.composeFull();
      const p = V.Scene3D.Params.normalizeParams(s.group._sceneAssembled);
      expect(SL.frameable(p, BOUNDS)).toBe(true);
      expect(SL.stats.sceneFrames).toBeGreaterThan(0);
      expect(SL.stats.sceneFallbacks).toBe(0);
      const id = s.objectsOf()[0].id;
      const fills = fillsOf(paths, id);
      expect(fills.length).toBeGreaterThan(15);
      fills.forEach((f) => expect(metaOf(f).surfaceLocked).toBe(true));
    });

    it('a still-pose law (etfKang) keeps the box out of Level S; a mezzo box stays pose and equals markSpace pose', () => {
      const s = build({ toneLaw: 'etfKang' });
      s.composeFull();
      expect(SL.frameable(V.Scene3D.Params.normalizeParams(s.group._sceneAssembled), BOUNDS)).toBe(false);
      const mz = build({ toneLaw: 'mezzoRegion' }); const pz = build({ toneLaw: 'mezzoRegion', markSpace: 'pose' });
      [mz, pz].forEach((q) => q.setPose({ camYaw: -30, camPitch: 20 }));
      expect(SL.frameable(V.Scene3D.Params.normalizeParams((mz.composeFull(), mz.group._sceneAssembled)), BOUNDS)).toBe(false);
      // (the two engines mint different object ids, so compare the geometry, not the meta)
      const pts = (paths) => JSON.stringify(paths.map((q) => q.map((pt) => [pt.x, pt.y])));
      expect(pts(mz.composeFull())).toBe(pts(pz.composeFull()));
    });

    it('no fill end lies more than 0.15 mm outside the drawn silhouette (scene3d-fill-silhouette-overshoot)', () => {
      const s = build();
      const id = s.objectsOf()[0].id;
      [{ camYaw: -30, camPitch: 20 }, { camYaw: 40, camPitch: 20 }, { camYaw: 80, camPitch: 30 }].forEach((pose) => {
        s.setPose(pose);
        const paths = s.composeFull();
        const sil = edgesOf(paths, id, 'silhouette');
        expect(sil.length).toBeGreaterThan(0);
        const hull = V.Scene3D.Shadows.convexHull([].concat(...sil.map((q) => q.map((pt) => ({ x: pt.x, y: pt.y })))));
        // signed distance outside a convex polygon: > 0 outside, <= 0 inside (either winding)
        const area2 = hull.reduce((a, p, i) => { const q = hull[(i + 1) % hull.length]; return a + p.x * q.y - q.x * p.y; }, 0);
        const sgn = area2 > 0 ? 1 : -1; // the cross below is (q - a) x (b - a): positive on the right of a CCW edge, i.e. outside
        const outside = (q) => {
          let worst = -Infinity;
          for (let i = 0; i < hull.length; i++) {
            const a = hull[i]; const b = hull[(i + 1) % hull.length];
            const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            worst = Math.max(worst, sgn * ((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / l);
          }
          return worst;
        };
        let worst = -Infinity;
        fillsOf(paths, id).forEach((f) => f.forEach((q) => { worst = Math.max(worst, outside(q)); }));
        expect(worst, JSON.stringify(pose)).toBeLessThanOrEqual(0.15);
      });
    });

    it('Level S equals Level F for a hatched box and sphere (marks and counts)', () => {
      const s = build({ kind: 'two' });
      [{ camYaw: -30, camPitch: 20 }, { camYaw: 40, camPitch: 20 }, { camYaw: -30, camPitch: 20, objYaw: 40 }].forEach((pose) => {
        s.setPose(pose);
        s.composeFull();
        expect(SL.frameable(V.Scene3D.Params.normalizeParams(s.group._sceneAssembled), BOUNDS), JSON.stringify(pose)).toBe(true);
        const S = s.composeFull();
        const Fp = withoutLevelS(() => s.composeFull());
        s.objectsOf().forEach((o) => {
          const fs = fillsOf(S, o.id); const ff = fillsOf(Fp, o.id);
          expect(fs.length, `${o.params.primitive} ${JSON.stringify(pose)}`).toBeGreaterThan(20);
          expect(ff.length, `${o.params.primitive} F ${JSON.stringify(pose)}`).toBeGreaterThan(20);
          expect(Math.abs(totalLen(fs) / totalLen(ff) - 1), `${o.params.primitive} ${JSON.stringify(pose)}`).toBeLessThan(0.02);
        });
      });
    });
  });

  describe('Level F: the faceted pose compositor frames each face (§6.1)', () => {
    it('a box under a point light (not Level S) draws locked marks with per-face pick targets', () => {
      const s = build({ shadow: false });
      s.eng.getLayerDescendants(s.gid).filter((l) => l && l.type === 'sceneLight3d').forEach((l) => { l.params.type = 'point'; });
      s.setPose({ camYaw: -30, camPitch: 20 });
      SL.resetStats();
      const paths = s.composeFull();
      expect(V.AlgorithmRegistry.scene3d.levelS(s.group._sceneAssembled, BOUNDS)).toBe(false);
      expect(SL.stats.frames).toBeGreaterThanOrEqual(3); // the three front faces of the box
      const fills = fillsOf(paths, s.objectsOf()[0].id);
      expect(fills.length).toBeGreaterThan(15);
      fills.forEach((f) => expect(metaOf(f).surfaceLocked).toBe(true));
      expect(new Set(fills.map((f) => tgt(f).faceId)).size).toBe(3);
    });
  });
});
