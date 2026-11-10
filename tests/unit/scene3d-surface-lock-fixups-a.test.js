const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');
const { buildSphere } = require('../helpers/surface-lock-synthetic-sphere');

// Wave 1 review fix-ups F-A1..F-A5 for src/core/scene3d/surface-lock.js (docs/surface-lock-contract.md §5, §7, §8, §10, §12, §13).
const BOUNDS = { width: 320, height: 220, penWidth: 0 };
const CAM = { yaw: 0, pitch: 0, roll: 0, zoom: 1, projection: 'orthographic' };

describe('surface lock fix-ups F-A1..F-A5', () => {
  let rt; let V; let SL; let MS; let sph; let saved;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; MS = V.Scene3D.SurfaceLockMarkSet;
    sph = buildSphere(V, {});
  });
  afterAll(() => rt && rt.cleanup());
  beforeEach(() => { SL.resetStats(); SL.clearCache(); saved = V.Scene3D.SurfaceLockMezzo; });
  afterEach(() => { V.Scene3D.SurfaceLockMezzo = saved; });
  const flat = (lines) => { const a = []; lines.forEach((l) => l.forEach((q) => a.push(q))); return a; };

  it('config carries PLOT_FLOOR_SLACK 0.8 and ZOOM_HEADROOM 1.5 (A1, A2)', () => {
    expect(V.SCENE3D_SURFACE_LOCK.PLOT_FLOOR_SLACK).toBe(0.8);
    expect(V.SCENE3D_SURFACE_LOCK.ZOOM_HEADROOM).toBe(1.5);
  });

  it('F-A1: tone off (no toneFn) evaluates the LUT at I = 1, not "unbounded" (D4)', () => {
    const pose = SL.poseOf({}, CAM, BOUNDS);
    const lut = new Float32Array(257).fill(3.3 / sph.p0);
    const off = SL.frame([sph.ms], pose, { toneFn: null, tone: { lut }, penWidth: 0, objectId: 'o' });
    const one = SL.frame([sph.ms], pose, { toneFn: () => 1, tone: { lut }, penWidth: 0, objectId: 'o' });
    expect(one.length).toBeGreaterThan(0);
    expect(JSON.stringify(off)).toBe(JSON.stringify(one));
    // and it is genuinely thinned versus an unbounded demand
    const dark = new Float32Array(257).fill(1e6);
    const all = SL.frame([sph.ms], pose, { toneFn: null, tone: { lut: dark }, penWidth: 0, objectId: 'o' });
    expect(flat(all).length).toBeGreaterThan(flat(off).length);
  });

  describe('with a fake baker', () => {
    let throwOn = false; let nullOn = false;
    const SPEC = () => ({
      objectId: 'a', primitive: 'sphere', mode: 'chart', sizes: { r: 20 }, detail: 1, scale: { sx: 1, sy: 1, sz: 1 },
      mapper: 'hatch', toneLaw: 'ladder', style: { markSpace: 'surface' }, penWidth: 0.3, scaleRef: 1, seed: { salt: 7, phase: 0 },
    });
    const fake = {
      id: 'fake', FIT: [], supports: (spec) => spec.mapper === 'hatch',
      bake: () => { if (throwOn) throw new Error('boom'); if (nullOn) return null; return buildSphere(V, { M: 64, levels: 3, step: 2 }).ms; },
      toneLUT: () => ({ lut: new Float32Array(257).fill(1), scaleFn: null }),
    };
    beforeEach(() => { throwOn = false; nullOn = false; V.Scene3D.SurfaceLockMezzo = fake; });

    it('F-A2: exclusions follow pose-mode normalisation; lawDraft is inert (D6, D7)', () => {
      const ctx = { primitive: 'sphere', mapper: 'hatch' };
      const run = (style, c) => SL.effectiveMarkSpace({ markSpace: 'surface', ...style }, { ...ctx, ...(c || {}) });
      expect(run({ highlightTreatment: 'keep' })).toBe('surface');
      expect(run({ highlightTreatment: 'bogus' })).toBe('surface');
      expect(run({ highlightTreatment: '' })).toBe('surface');
      expect(run({ highlightTreatment: 'none' })).toBe('surface');
      expect(run({ highlightTreatment: 'blank' })).toBe('surface');
      expect(run({ highlightTreatment: 'thin' })).toBe('pose');
      expect(run({ highlightTreatment: 'burst' })).toBe('pose');
      expect(run({ toneBands: 1 })).toBe('surface');
      expect(run({ toneBands: 0 })).toBe('surface');
      expect(run({ toneBands: 2 })).toBe('pose');
      expect(run({ toneBands: 3 })).toBe('pose');
      expect(run({}, { lawDraft: true })).toBe('surface');
      expect(SL.EXCLUSIONS.some((e) => e.id === 'lawDraft')).toBe(false);
    });

    it('F-A3: a throwing baker yields null, is counted in stats.bakeErrors, and is not cached (D5)', () => {
      throwOn = true;
      let r; expect(() => { r = SL.bake(SPEC()); }).not.toThrow();
      expect(r).toBeNull();
      expect(SL.stats.bakeErrors).toBe(1);
      expect(SL.stats.cacheEntries).toBe(0);
      nullOn = true; throwOn = false;
      expect(SL.bake(SPEC())).toBeNull();
      expect(SL.stats.bakeErrors).toBe(1); // a plain null is not an error
      nullOn = false;
      expect(SL.bake(SPEC())).not.toBeNull(); // recovers
      expect(SL.resetStats().bakeErrors).toBe(0);
    });
  });

  it('F-A5: the floor cap admits a whole level once its pitch is >= 0.8 x floor (A1)', () => {
    const NZ = 0.08;
    const pose = SL.poseOf({}, CAM, BOUNDS);
    const ms = sph.ms;
    // pen chosen so the head-on cr = p0 * scale / floor = 1.8: strict cap stays at T = 1, slack 0.8 admits T = 2 where cr / 0.8 >= 2
    const floorPen = 2.2;
    const pen = sph.p0 * pose.cam.scale / (1.8 * floorPen);
    const floor = floorPen * pen;
    const lut = new Float32Array(257).fill(1e6);
    SL.resetStats();
    const out = SL.frame([ms], pose, { toneFn: () => 0, tone: { lut }, penWidth: pen, objectId: 'o' });
    let expTone = 0;
    for (let r = 0; r < ms.runCount; r++) {
      const L = ms.runLevel[r]; const k = L === 0 ? MS.rankOf(ms, r) : Math.pow(2, L - 1) * (1 + MS.rankOf(ms, r));
      for (let v = ms.runStart[r]; v < ms.runStart[r + 1]; v++) {
        const n = MS.octDecode(ms.normals, 2 * v, [0, 0, 0]);
        const c = n[2];
        if (c < NZ) continue;
        const cr = sph.p0 * pose.cam.scale * c / (floor * 0.8);
        let T = 0; if (cr > 1e-6) { T = 1; while (T * 2 <= cr) T *= 2; while (T > cr) T /= 2; }
        if (!(T > k)) expTone += 1;
      }
    }
    expect(SL.stats.culledTone).toBe(expTone);
    expect(out.length).toBeGreaterThan(0);
  });

  describe('F-A4 sceneFrame against the real visibility / shadow interfaces', () => {
    let calls; let savedV; let savedS; let bakerSaved;
    const pt = (x, y) => ({ x, y, z: 0 });
    const fake = {
      id: 'fake', FIT: [], supports: (spec) => spec.mapper === 'hatch',
      bake: () => buildSphere(V, { M: 64, levels: 3, step: 2 }).ms,
      toneLUT: () => ({ lut: new Float32Array(257).fill(1), scaleFn: null }),
    };
    const obj = (id, prim, x, extra) => ({ id, primitive: prim, params: { radius: 10, convex: extra && extra.convex }, transform: { x, y: 10, z: 0, yaw: 0, pitch: 0, roll: 0, scale: (extra && extra.scale) || 1, sx: extra && extra.sx }, visibility: 'solid', border: { enabled: false }, emissive: { enabled: false } });
    const scene = (objects, withSun) => ({
      objects, camera: { ...CAM, yaw: -30, pitch: 20 },
      lights: withSun ? [{ type: 'directional', azimuth: 135, elevation: 45, castShadows: true }] : [{ type: 'ambient' }],
      ground: { enabled: true, scaleX: 1.5, scaleZ: 2 }, shadow: {}, backdrop: { enabled: false }, groups: [], tone: {},
      styleTable: { scene: { mapper: 'hatch', params: { markSpace: 'surface', toneLaw: 'ladder' } }, byObject: {}, byFace: {} },
    });
    const ctxOf = () => ({
      toneFnFor: () => () => 0.5, seedFor: () => ({ salt: 1, phase: 0, off: false }), lightDirWorld: { x: 0.3, y: -0.9, z: 0.2 },
      emitShadow: (runs) => calls.push(['shadow', runs]), emitFill: (id, runs) => calls.push(['fill', id, runs]),
      emitEdge: (id, cls, runs) => calls.push(['edge', id, cls, runs]), emitGround: (runs) => calls.push(['ground', runs]),
    });
    beforeEach(() => {
      calls = []; bakerSaved = V.Scene3D.SurfaceLockMezzo; V.Scene3D.SurfaceLockMezzo = fake;
      savedV = V.Scene3D.SurfaceLockVisibility; savedS = V.Scene3D.SurfaceLockShadow;
      const log = { mesh: 0, occ: [], clip: [], merge: 0, edgeRuns: null };
      calls.log = log;
      V.Scene3D.SurfaceLockVisibility = {
        supports: () => true,
        meshBake: (o) => { log.mesh += 1; const s = o.transform.scale; return { objectId: o.id, primitive: o.primitive, convex: o.params.convex !== false, scale: [o.transform.sx || s, s, s], vertices: Float64Array.from([-5, -5, -5, 5, -5, -5, 5, 5, 5, -5, 5, 5]), analytic: o.primitive === 'sphere' ? { kind: 'ellipsoid', radii: [o.params.radius * s, o.params.radius * s, o.params.radius * s] } : null }; },
        occluder: (bakes, pose) => {
          log.occ.push({ bakes, pose });
          return {
            segFor: (b) => ({ obj: bakes.indexOf(b), mode: 'fill', f0: -1, f1: -1 }),
            clipRun: (pts, seg) => {
              log.clip.push({ n: pts.length, seg });
              if (seg.obj < 0) return [{ pts, visible: true }];
              const h = Math.ceil(pts.length / 2);
              return [{ pts: pts.slice(0, h), visible: true }, { pts: pts.slice(h - 1), visible: false }];
            },
            closedMerge: (r) => { log.merge += 1; return r; },
          };
        },
        outline: () => { const runs = [{ pts: [pt(0, 0), pt(1, 1)], visible: true, tag: 'x' }]; log.edgeRuns = log.edgeRuns || runs; return { silhouette: runs, crease: [], boundary: [] }; },
      };
      log.shadowArgs = null;
      V.Scene3D.SurfaceLockShadow = {
        supports: () => true,
        bakeGround: (spec) => { log.groundSpec = spec; return { g: 1 }; },
        frameShadow: (h, casters, dir, pose) => { log.casters = casters; log.shadowPose = pose; return { runs: [{ pts: [{ x: 0, y: 0, z: 3 }, { x: 5, y: 5, z: 3 }], visible: true }] }; },
      };
    });
    afterEach(() => { V.Scene3D.SurfaceLockVisibility = savedV; V.Scene3D.SurfaceLockShadow = savedS; V.Scene3D.SurfaceLockMezzo = bakerSaved; });

    it('two identical objects get separate mesh bakes and the occluder gets the {cam, objs} pose (D10, D8)', () => {
      SL.sceneFrame(scene([obj('a', 'sphere', 0), obj('b', 'sphere', 0)], false), BOUNDS, ctxOf());
      expect(calls.log.mesh).toBe(2);
      expect(calls.log.occ.length).toBe(1);
      const { bakes, pose } = calls.log.occ[0];
      expect(bakes.length).toBe(2); expect(bakes[0]).not.toBe(bakes[1]);
      expect(pose.objs.length).toBe(2); expect(pose.cam.scale).toBeGreaterThan(0);
      expect(pose.objs[0]).toEqual(expect.objectContaining({ x: 0, yaw: 0 }));
    });

    it('builds the occluder for a lone non-convex object or a cast shadow, not for a lone convex object without a shadow (D9)', () => {
      SL.sceneFrame(scene([obj('a', 'sphere', 0)], false), BOUNDS, ctxOf());
      expect(calls.log.occ.length).toBe(0);
      SL.sceneFrame(scene([obj('a', 'torus', 0, { convex: false })], false), BOUNDS, ctxOf());
      expect(calls.log.occ.length).toBe(1);
      SL.sceneFrame(scene([obj('a', 'sphere', 0)], true), BOUNDS, ctxOf());
      expect(calls.log.occ.length).toBe(2);
    });

    it('fills are clipped through occ.clipRun(segFor), only visible runs survive and dropped vertices are counted (D8)', () => {
      SL.resetStats();
      SL.sceneFrame(scene([obj('a', 'sphere', 0), obj('b', 'sphere', 30)], false), BOUNDS, ctxOf());
      const fills = calls.filter((c) => c[0] === 'fill');
      expect(fills.length).toBe(2);
      fills.forEach((c) => { expect(c[2].length).toBeGreaterThan(0); c[2].forEach((r) => { expect(r.visible).toBe(true); expect(Array.isArray(r.pts)).toBe(true); expect(r.pts.length).toBeGreaterThan(1); }); });
      expect(calls.log.clip.some((c) => c.seg.obj === 0)).toBe(true);
      expect(calls.log.clip.some((c) => c.seg.obj === 1)).toBe(true);
      expect(SL.stats.culledOccluded).toBeGreaterThan(0);
      expect(calls.log.merge).toBeGreaterThan(0); // the sphere's rings are closed loops
    });

    it('edges pass through as the visibility module returned them (no re-wrapping)', () => {
      SL.sceneFrame(scene([obj('a', 'sphere', 0), obj('b', 'sphere', 30)], false), BOUNDS, ctxOf());
      const e = calls.find((c) => c[0] === 'edge');
      expect(e[3]).toBe(calls.log.edgeRuns);
      expect(e[3][0].pts[0]).toEqual(pt(0, 0));
    });

    it('shadow: sphere / hull caster records, ground spec and clipping with {obj: -1} (D11, D12)', () => {
      const box = obj('b', 'box', 30, { sx: 2, scale: 1 });
      SL.sceneFrame(scene([obj('a', 'sphere', 0), box], true), BOUNDS, ctxOf());
      const [c0, c1] = calls.log.casters;
      expect(c0).toEqual({ primitive: 'sphere', shape: 'sphere', center: { x: 0, y: 10, z: 0 }, radius: 10 });
      expect(c1.shape).toBe('hull'); expect(c1.primitive).toBe('box');
      expect(c1.points.length).toBe(4);
      expect(c1.points[1]).toEqual({ x: 35, y: 5, z: -5 }); // objR = identity: v + t
      expect(calls.log.groundSpec).toEqual({ width: 320, height: 220, scaleX: 1.5, scaleZ: 2, scaleRef: 1 });
      expect(calls.log.shadowPose.cam).toBeDefined();
      expect(calls.log.clip.some((c) => c.seg.obj === -1 && c.seg.mode === 'fill')).toBe(true);
      const sh = calls.find((c) => c[0] === 'shadow');
      expect(sh[1][0]).toEqual({ pts: [{ x: 0, y: 0, z: 3 }, { x: 5, y: 5, z: 3 }], visible: true });
    });

    it('non-uniform sphere scale is a hull; a ground outline is emitted (D12, D14)', () => {
      SL.sceneFrame(scene([obj('a', 'sphere', 0, { sx: 2 })], true), BOUNDS, ctxOf());
      expect(calls.log.casters[0].shape).toBe('hull');
      expect(calls.some((c) => c[0] === 'ground')).toBe(true);
      const g = calls.find((c) => c[0] === 'ground')[1];
      expect(g[0].pts.length).toBe(5);
    });
  });
});
