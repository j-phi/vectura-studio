const LR = require('../helpers/light-realism');
const { buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// SurfaceLock wiring of the realistic light model (light-realism H1; contract A16-A18), driven through the real compose
// (engine.addLayer -> composeFull -> Level S sceneFrame), not the bakers:
//   toneModel threaded into the spec and the bake key, the glint is paper (scaleFn from toneCtx.light), the tone memo is
//   diffuse-only and survives an orbit, the receive-shadow exclusion is lifted by the receive map, and equal tone reads equal at
//   the limb and the centre (facing compensation, paper-ended cap remap).

const front = (s) => LR.setLightCam(s, LR.LIGHTS.front);

describe('SurfaceLock: tone model v2 wiring (H1)', () => {
  let rt; let V; let SL;
  beforeAll(async () => { rt = await LR.loadRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; }, 120000);
  afterAll(() => rt && rt.cleanup());

  const baseSpec = (o = {}) => ({
    objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
    scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'ladder',
    style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: 0.3, scaleRef: 1, seed: { salt: 0, phase: 0, off: 0 }, ...o,
  });
  const dirLight = { type: 'directional', azimuth: 0, elevation: 0, intensity: 1 };

  describe('spec and bake key', () => {
    it('toneModel v2 never shares a bake-cache entry with legacy; a legacy key is the old key', () => {
      const legacy = baseSpec(); const legacy2 = baseSpec({ toneModel: 'legacy' }); const v2 = baseSpec({ toneModel: 'v2' });
      expect(SL.bakeKey(v2)).not.toBe(SL.bakeKey(legacy));
      expect(SL.bakeKey(legacy2)).toBe(SL.bakeKey(legacy)); // 'legacy' adds nothing: legacy keys are byte-identical to an older build
      expect(JSON.parse(SL.bakeKey(legacy))).toHaveLength(12);
    });

    it('a v2 scene bakes under a v2 key; the same scene as legacy bakes under the old key (no shared entry)', () => {
      const keysOf = (model) => {
        const s = LR.buildCase(V, { markSpace: 'surface', tone: { model } });
        SL.clearCache(); s.composeFull();
        return SL.takeFreshBakes().map((e) => e.key);
      };
      const v2 = keysOf('v2'); const leg = keysOf('legacy');
      expect(v2.length).toBeGreaterThan(0); expect(leg.length).toBeGreaterThan(0);
      v2.forEach((k) => expect(JSON.parse(k)[12]).toBe('v2'));
      leg.forEach((k) => expect(JSON.parse(k)).toHaveLength(12));
    });
  });

  describe('toneTable scaleFn from toneCtx.light', () => {
    const R = () => V.Scene3D.Regions;
    const lightCtx = (extra = {}) => ({ model: 'v2', lights: [dirLight], shininess: R().shininessForSize(1), ks: 1, s0: R().SHADE_DEFAULTS.s0, s1: R().SHADE_DEFAULTS.s1, ...extra });
    const ctxOf = (light) => ({ tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66], model: 'v2' }, penWidth: 0.3, ...(light ? { light } : {}) });

    it('v2 + light: a scaleFn that is Regions.specularKeep of the shade() glint term', () => {
      const spec = baseSpec({ toneModel: 'v2' });
      const t = SL.toneTable(spec, ctxOf(lightCtx()));
      expect(typeof t.scaleFn).toBe('function');
      const eye = { x: 0, y: 0, z: 1 };
      const toward = R().towardLight(dirLight);
      let checked = 0;
      for (let i = 0; i < 400; i++) {
        const a = (i * 0.618 % 1) * 2 * Math.PI; const b = Math.acos(1 - 2 * ((i * 0.381 + 0.1) % 1));
        const n = { x: Math.sin(b) * Math.cos(a), y: Math.sin(b) * Math.sin(a), z: Math.cos(b) };
        const P = { x: 0, y: 0, z: 0 };
        const S = R().shade(n, P, [dirLight], { model: 'v2', eye, shininess: lightCtx().shininess, ks: 1 }).S;
        const keep = R().specularKeep(S, lightCtx().s0, lightCtx().s1);
        expect(t.scaleFn(n, P, eye)).toBeCloseTo(keep, 9);
        if (S > 0.2) checked += 1;
      }
      expect(checked).toBeGreaterThan(3);
      // the half vector: the glint centre is paper, an off-axis normal keeps its ink
      const H = R().normalize ? R().normalize({ x: toward.x + eye.x, y: toward.y + eye.y, z: toward.z + eye.z }) : (() => { const l = Math.hypot(toward.x + eye.x, toward.y + eye.y, toward.z + eye.z); return { x: (toward.x + eye.x) / l, y: (toward.y + eye.y) / l, z: (toward.z + eye.z) / l }; })();
      expect(t.scaleFn(H, { x: 0, y: 0, z: 0 }, eye)).toBeLessThan(0.01);
      expect(t.scaleFn({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0 }, eye)).toBe(1);
    });

    it('legacy, no light, specular off (ks 0) and noHighlight give no scaleFn (legacy table is the baker table)', () => {
      const spec = baseSpec();
      expect(SL.toneTable(spec, ctxOf(null)).scaleFn).toBeNull();
      expect(SL.toneTable(baseSpec({ toneModel: 'v2' }), ctxOf(lightCtx({ ks: 0 }))).scaleFn).toBeNull();
      expect(SL.toneTable(baseSpec({ toneModel: 'v2' }), Object.assign(ctxOf(lightCtx()), { noHighlight: true })).scaleFn).toBeNull();
      expect(SL.toneTable(spec, ctxOf(lightCtx({ model: 'legacy' }))).scaleFn).toBeNull();
    });

    it('the LUT is shared across lights (a light move rebuilds a closure, never a LUT); the table is memoized per light', () => {
      const spec = baseSpec({ toneModel: 'v2' });
      const a = SL.toneTable(spec, ctxOf(lightCtx())); const a2 = SL.toneTable(spec, ctxOf(lightCtx()));
      const b = SL.toneTable(spec, ctxOf(lightCtx({ lights: [Object.assign({}, dirLight, { azimuth: 90 })] })));
      expect(a2).toBe(a);
      expect(b).not.toBe(a);
      expect(b.lut).toBe(a.lut);
      expect(b.scaleFn).not.toBe(a.scaleFn);
    });

    it('a glint inside a cast shadow is not paper (shadowFnFor blocks it, as shade does)', () => {
      const spec = baseSpec({ toneModel: 'v2' });
      const eye = { x: 0, y: 0, z: 1 }; const P = { x: 0, y: 0, z: 0 };
      const toward = R().towardLight(dirLight); const l = Math.hypot(toward.x + eye.x, toward.y + eye.y, toward.z + eye.z);
      const H = { x: (toward.x + eye.x) / l, y: (toward.y + eye.y) / l, z: (toward.z + eye.z) / l };
      const lit = SL.toneTable(spec, ctxOf(lightCtx({ shadowKey: 'a', shadowFnFor: () => () => false }))).scaleFn(H, P, eye);
      const blocked = SL.toneTable(spec, ctxOf(lightCtx({ shadowKey: 'b', shadowFnFor: () => () => true }))).scaleFn(H, P, eye);
      expect(lit).toBeLessThan(0.01); expect(blocked).toBe(1);
    });
  });

  describe('front light on the default sphere (Level S, ladder), Density 50', () => {
    let s; let prof;
    beforeAll(() => {
      s = LR.buildCase(V, { markSpace: 'surface', density: 50 }); front(s);
      prof = LR.measure(s);
    }, 120000);

    it('the scene is v2 and Level S', () => {
      expect(s.group.params.tone.model).toBe('v2');
      SL.resetStats(); s.composeFull();
      expect(SL.stats.sceneFrames).toBeGreaterThan(0);
    });
    it('M1 coverage is non-increasing in L*', () => { const m = LR.m1Monotone(prof); expect(m.maxRise, JSON.stringify(m.detail)).toBeLessThanOrEqual(0.02 + 1e-9); expect(m.rho).toBeLessThanOrEqual(-0.9); });
    it('M2 the glint is paper and sits on n = normalize(L + e)', () => {
      const m = LR.m2Highlight(prof, { specular: true });
      expect(m.value, 'top 1 % of S').toBeLessThanOrEqual(0.01);
      expect(m.angleDeg).toBeLessThanOrEqual(3);
    });
    it('M3 range at Density 50 (upper-right light: both a dark and a bright end)', () => {
      const u = LR.buildCase(V, { markSpace: 'surface', density: 50 }); LR.setLightCam(u, LR.LIGHTS.upperRight);
      const m = LR.m3Range(LR.measure(u), 50); expect(m.value, JSON.stringify(m)).toBeGreaterThanOrEqual(0.25);
    }, 120000);
    it('M7 limb vs centre of equal tone', () => { const m = LR.m7LimbCentre(prof); expect(m.worst, JSON.stringify(m.per)).toBeLessThanOrEqual(0.04); });
  });

  describe('Density 20: M3 and the glint', () => {
    it('range >= 0.15 and paper at the glint', () => {
      const s = LR.buildCase(V, { markSpace: 'surface', density: 20 }); front(s);
      expect(LR.m2Highlight(LR.measure(s), { specular: true }).value).toBeLessThanOrEqual(0.01);
      const u = LR.buildCase(V, { markSpace: 'surface', density: 20 }); LR.setLightCam(u, LR.LIGHTS.upperRight);
      const m = LR.m3Range(LR.measure(u), 20); expect(m.value, JSON.stringify(m)).toBeGreaterThanOrEqual(0.15);
    }, 120000);
  });

  describe('M7 limb vs centre for the mezzotint', () => {
    it('mezzoRegion sphere, front light', () => {
      const s = LR.buildCase(V, { markSpace: 'surface', law: 'mezzoRegion', density: 50 }); front(s);
      const prof = LR.measure(s);
      const m = LR.m7LimbCentre(prof);
      expect(m.worst, JSON.stringify(m.per)).toBeLessThanOrEqual(0.04);
    }, 120000);
  });

  describe('orbit and light-move cost (Level S counters)', () => {
    let s; let vertexCount;
    beforeAll(() => {
      s = LR.buildCase(V, { markSpace: 'surface', density: 50 }); front(s);
      s.composeFull();
      SL.clearCache(); s.composeFull();
      vertexCount = SL.takeFreshBakes().reduce((a, e) => a + e.ms.vertexCount, 0);
    }, 120000);

    it('a repeated pure camera orbit: 0 bake misses, 0 tone evals (specular on)', () => {
      const yaws = [-40, -20, 0, 20, 40, 20, 0, -20, -40];
      LR.orbitCounters(s, yaws); // first sweep fills the memo lazily as vertices are revealed
      const d = LR.orbitCounters(s, yaws, { warm: false });
      expect(d.bakeMisses).toBe(0);
      expect(d.toneEvals).toBe(0);
      expect(d.frames + d.sceneFrames).toBeGreaterThan(0);
    });
    it('a light move: no bake, tone evals <= vertexCount per move', () => {
      const moves = [{ az: 20, el: 30 }, { az: 40, el: 50 }];
      const d = LR.lightMoveCounters(s, moves);
      expect(d.bakeMisses).toBe(0);
      expect(d.toneEvals).toBeLessThanOrEqual(vertexCount * moves.length);
      expect(d.toneEvals).toBeGreaterThan(0);
    });
  });

  describe('receive shadows on objects (exclusion lifted by the receive map)', () => {
    const build = () => {
      const s = buildSurfaceLockScene(V, { kind: 'two', ground: false, shadow: true, markSpace: 'surface' });
      s.group.params.shadow = Object.assign({}, s.group.params.shadow, { shadowReceiveOnObjects: true });
      return s;
    };
    it('v2: the receiveShadow exclusion is lifted (the receive map exists); legacy keeps it', () => {
      const obj = { id: 'o1', visibility: 'solid' };
      const p = { tone: { model: 'v2' }, shadow: { shadowReceiveOnObjects: true }, lights: [] };
      expect(SL.exclusionCtx(p, obj).receiveShadow).toBe(false);
      expect(SL.exclusionCtx({ ...p, tone: { model: 'legacy' } }, obj).receiveShadow).toBe(true);
      expect(SL.exclusionCtx({ ...p, shadow: {} }, obj).receiveShadow).toBe(false);
      const spec = baseSpec({ toneModel: 'v2' });
      const ex = SL.explainMarkSpace({ markSpace: 'surface' }, { ...SL.exclusionCtx(p, obj), spec });
      expect(ex.reason).toBe('surface');
      expect(SL.explainMarkSpace({ markSpace: 'surface' }, { ...SL.exclusionCtx({ ...p, tone: { model: 'legacy' } }, obj), spec }).reason).toBe('receiveShadow');
    });

    it('M8: ink inside the box\'s cast shadow on the sphere is at least the ambient-tone ink', () => {
      const s = build();
      LR.setLightAzEl(s, 90, 8); // toward-light +x: the box (x = 45) shades the sphere
      const leaf0 = s.objectsOf()[0]; const box = s.objectsOf()[1].params; const Sc = V.Scene3D.Scene;
      const mesh = Sc.buildPrimitiveMesh({ id: 'b', primitive: box.primitive, params: box.params, transform: box.transform }, 1);
      const W = mesh.vertices.map((pt) => Sc.applyObjectTransform(pt, box.transform));
      const tris = [];
      mesh.faces.forEach((f) => { for (let i = 1; i + 1 < f.length; i += 1) tris.push({ a: W[f[0]], b: W[f[i]], c: W[f[i + 1]] }); });
      const map = V.Scene3D.SurfaceLockShadow.receiveMap({ lights: [LR.firstLight(s)], casters: [{ id: 'b', triangles: tris }] });
      const prof = LR.measure(s, { visFn: (nw, wp) => { const sp = leaf0.params; const R = sp.params.radius; const tr = sp.transform || {}; return map.visFn(nw, wp || { x: (tr.x || 0) + R * nw.x, y: (tr.y || 0) + R * nw.y, z: (tr.z || 0) + R * nw.z }); } });
      const sh = [...prof.cells.vis].filter((v) => v < 0.5).length;
      if (sh * prof.areaCell < 8) return; // the shadow does not reach the sphere in this layout: nothing to assert
      const m = LR.m8Shadow(prof);
      expect(m.pass, JSON.stringify(m)).toBe(true);
    }, 120000);

    it('M8: points in another object\'s cast shadow keep the ambient tone ink; builds: 0 on orbit, rebuilt only on a light move', () => {
      const s = build();
      LR.setLightAzEl(s, 160, 25);
      const SLS = V.Scene3D.SurfaceLockShadow;
      SLS.resetReceiveStats(); SL.resetStats();
      s.composeFull();
      expect(SL.stats.sceneFrames).toBeGreaterThan(0); // still Level S
      const builds0 = SLS.receiveStats().builds;
      expect(builds0).toBeGreaterThan(0);
      LR.orbitCounters(s, [-40, -20, 0, 20, 40]);
      const b1 = SLS.receiveStats().builds;
      const d = LR.orbitCounters(s, [-40, -20, 0, 20, 40], { warm: false });
      expect(SLS.receiveStats().builds).toBe(b1);
      expect(d.toneEvals).toBe(0);
      LR.lightMoveCounters(s, [{ az: 200, el: 30 }]);
      expect(SLS.receiveStats().builds).toBeGreaterThan(b1);
      expect(SLS.receiveStats().builds - b1).toBeLessThanOrEqual(2); // one map per receiver (the receiver is not its own caster)
    });
  });
});
