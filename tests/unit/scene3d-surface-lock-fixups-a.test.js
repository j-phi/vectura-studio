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

// FX-A (docs/surface-lock-contract.md §5, §8, §11, §12): tone memo, min-separation cap, law floor, new exclusions, tone-free bake key.
describe('surface lock FX-A: frame memo, cap fields, exclusions, bake key', () => {
  let rt; let V; let SL; let sph; let saved;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock;
    sph = buildSphere(V, {});
  });
  afterAll(() => rt && rt.cleanup());
  beforeEach(() => { SL.resetStats(); SL.clearCache(); saved = V.Scene3D.SurfaceLockMezzo; });
  afterEach(() => { V.Scene3D.SurfaceLockMezzo = saved; });

  const countVerts = (lines) => lines.reduce((s, l) => s + l.length, 0);
  const lutOf = (fn) => { const l = new Float32Array(257); for (let k = 0; k <= 256; k++) l[k] = fn(k / 256) / sph.p0; return l; };
  const TONE_LUT = () => lutOf((i) => 0.4 + 6 * i * i);

  describe('tone memo (G3)', () => {
    const mkView = (counter, toneKey) => ({
      toneFn: (n, p) => { counter.n += 1; return 0.5 + 0.5 * Math.sin(2.1 * n.x + 1.3 * n.y + 0.07 * p.z); },
      tone: { lut: TONE_LUT() }, penWidth: 0, objectId: 'o', toneKey,
    });
    const poseAt = (yaw) => SL.poseOf({}, { yaw, pitch: 0.2, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);

    it('a second frame with the same toneKey at a new camera yaw makes 0 toneFn calls and equals the no-memo output', () => {
      const c1 = { n: 0 }; const c2 = { n: 0 }; const c3 = { n: 0 };
      SL.frame([sph.ms], poseAt(0.1), mkView(c1, 'k1'));
      expect(c1.n).toBeGreaterThan(1000);
      const evals1 = SL.stats.toneEvals;
      expect(evals1).toBe(c1.n);
      const memo = SL.frame([sph.ms], poseAt(0.1), mkView(c2, 'k1')); // same pose: every visited vertex is cached
      expect(c2.n).toBe(0);
      expect(SL.stats.toneEvals).toBe(evals1);
      const plain = SL.frame([sph.ms], poseAt(0.1), mkView(c3, null));
      expect(c3.n).toBeGreaterThan(1000); // mutation proof: no key -> no memo
      expect(JSON.stringify(memo)).toBe(JSON.stringify(plain));
    });

    it('a new yaw only evaluates vertices not seen yet; a different toneKey recomputes everything', () => {
      const a = { n: 0 }; const b = { n: 0 }; const c = { n: 0 };
      SL.frame([sph.ms], poseAt(0), mkView(a, 'k2'));
      SL.frame([sph.ms], poseAt(0.05), mkView(b, 'k2'));
      expect(b.n).toBeLessThan(a.n * 0.2);
      SL.frame([sph.ms], poseAt(0), mkView(c, 'k3'));
      expect(c.n).toBe(a.n);
    });
  });

  describe('cap fields', () => {
    const withMeta = (extra) => Object.assign(Object.create(Object.getPrototypeOf(sph.ms)), sph.ms, { meta: Object.assign({}, sph.ms.meta, extra) });
    const pose = () => SL.poseOf({}, { yaw: 0, pitch: 0, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
    const view = (pen) => ({ toneFn: null, tone: null, penWidth: pen, objectId: 'o' });
    // head-on cr = p0 * scale / (floorPen * pen * 0.8); pick pen so cr = 2.3 (T = 2) at the disc centre
    const pen23 = () => sph.p0 * pose().cam.scale / (2.3 * 2.2 * 0.8);

    it('meta.minSepFrac 0.8 scales the cap: equal to a 1/0.8 larger floor, and admits fewer vertices', () => {
      const pen = pen23();
      const base = SL.frame([sph.ms], pose(), view(pen));
      const sep = SL.frame([withMeta({ minSepFrac: 0.8 })], pose(), view(pen));
      const ref = SL.frame([sph.ms], pose(), view(pen / 0.8));
      expect(countVerts(sep)).toBeLessThan(countVerts(base));
      expect(JSON.stringify(sep)).toBe(JSON.stringify(ref));
    });

    it('absent minSepFrac / floorPitchPen keep today\'s behaviour', () => {
      const pen = pen23();
      const base = SL.frame([sph.ms], pose(), view(pen));
      expect(JSON.stringify(SL.frame([withMeta({ minSepFrac: 1 })], pose(), view(pen)))).toBe(JSON.stringify(base));
    });

    it('O1: a law floor below the strict floor admits more ink, equal to a proportionally smaller pen; absent keeps the strict floor', () => {
      const pen = pen23();
      const strict = SL.frame([sph.ms], pose(), view(pen));
      const law = SL.frame([withMeta({ floorPitchPen: 1.1 })], pose(), view(pen));
      expect(countVerts(law)).toBeGreaterThan(countVerts(strict));
      expect(JSON.stringify(law)).toBe(JSON.stringify(SL.frame([sph.ms], pose(), view(pen * 0.5))));
      expect(JSON.stringify(SL.frame([withMeta({ floorPitchPen: undefined })], pose(), view(pen)))).toBe(JSON.stringify(strict));
    });

    it('meta.floorPitchPen replaces the plot-floor pen multiplier', () => {
      const pen = pen23();
      const r = V.Scene3D.Regions && Number.isFinite(V.Scene3D.Regions.PLOT_FLOOR_PEN) ? V.Scene3D.Regions.PLOT_FLOOR_PEN : 2.2;
      const law = SL.frame([withMeta({ floorPitchPen: r * 2 })], pose(), view(pen));
      const ref = SL.frame([sph.ms], pose(), view(pen * 2));
      expect(JSON.stringify(law)).toBe(JSON.stringify(ref));
      expect(countVerts(law)).toBeLessThan(countVerts(SL.frame([sph.ms], pose(), view(pen))));
    });
  });

  describe('exclusions and bake key', () => {
    const SPEC = (style) => ({
      objectId: 'a', primitive: 'sphere', mode: 'chart', sizes: { r: 20 }, detail: 1, scale: { sx: 1, sy: 1, sz: 1 },
      mapper: 'hatch', toneLaw: 'ladder', style: Object.assign({ markSpace: 'surface', angle: 30 }, style || {}), penWidth: 0.3, scaleRef: 1, seed: { salt: 7, phase: 0 },
    });
    let lutCalls = 0;
    beforeEach(() => {
      lutCalls = 0;
      V.Scene3D.SurfaceLockMezzo = {
        id: 'fake', FIT: [], supports: (spec) => spec.mapper === 'hatch',
        bake: () => buildSphere(V, { M: 64, levels: 3, step: 2 }).ms,
        toneLUT: () => { lutCalls += 1; return { lut: new Float32Array(257).fill(1), scaleFn: null }; },
      };
    });

    it('faceStyles and depthFade exclusions fall back to pose; their examples are in the data', () => {
      ['faceStyles', 'depthFade'].forEach((id) => {
        const ex = SL.EXCLUSIONS.find((e) => e.id === id);
        expect(ex, id).toBeDefined();
        expect(ex.example).toBeDefined();
        const ctx = Object.assign({ primitive: 'sphere', mapper: 'hatch' }, ex.example.ctx || {});
        const style = Object.assign({ markSpace: 'surface' }, ex.example.style || {});
        expect(SL.effectiveMarkSpace(style, ctx), id).toBe('pose');
        expect(SL.effectiveMarkSpace({ markSpace: 'surface' }, { primitive: 'sphere', mapper: 'hatch' })).toBe('surface');
      });
      expect(SL.effectiveMarkSpace({ markSpace: 'surface', depthFade: false }, { primitive: 'sphere', mapper: 'hatch', faceStyles: false })).toBe('surface');
    });

    it('bakeKey ignores tone-only style keys and detail but not geometry keys', () => {
      const k0 = SL.bakeKey(SPEC());
      const same = [
        { toneGamma: 1.8 }, { toneContrast: 0.4 }, { highlightTreatment: 'none' }, { highlightTreatment: 'blank' }, { highlightMode: 'x' },
        { depthFade: false }, { depthFadeStrength: 0.5 }, { shadowSensitivity: 0.3 },
      ];
      same.forEach((s) => expect(SL.bakeKey(SPEC(s)), JSON.stringify(s)).toBe(k0));
      const d = SPEC(); d.detail = 5;
      expect(SL.bakeKey(d)).toBe(k0);
      expect(SL.bakeKey(SPEC({ angle: 31 }))).not.toBe(k0);
    });

    it('bakeKey leads with the configured BAKE_VERSION (a stale MarkSet is never reused)', () => {
      const v = V.SCENE3D_SURFACE_LOCK.BAKE_VERSION;
      expect(v).toBeGreaterThanOrEqual(2);
      expect(JSON.parse(SL.bakeKey(SPEC()))[0]).toBe(v);
    });

    it('the toneTable key still varies with tone-only style keys', () => {
      SL.toneTable(SPEC(), { tone: {}, penWidth: 0.3 });
      SL.toneTable(SPEC({ toneGamma: 1.8 }), { tone: {}, penWidth: 0.3 });
      expect(lutCalls).toBe(2);
    });
  });
});
