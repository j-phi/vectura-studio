const { loadSurfaceLockRuntime, dragEqualsExport } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');

// Wave D1 (light realism): Mark . Tick, Mark . Dot Screen, Mark . Dash Ramp, Scribble and Bundle Count are baked once onto the surface
// (SurfaceLockLaws, FIT row `v2Only`) for v2 scenes. A legacy scene (no `toneModel`) keeps the pose output byte for byte (contract A20).
//   RED: effectiveMarkSpace(v2 spec) is 'surface' (today 'pose'); a legacy spec stays 'pose'.
//   M1/M2/M3: the curve is graded, reaches paper, and spans >= 0.25 pen coverage at Density 50.
//   M5/M6: every law follows the shared v2 target (the dutyConst v2 curve) within 0.06 pen coverage.
//   perf: vertices <= 2x the Default ladder; a repeated orbit sweep makes 0 bake misses and 0 tone evaluations.
//   drag == export; tone OFF draws a uniform Density; the glint (specular via scaleFn) is paper under a front light.
// Pose-v2 parity (M6 against the pose law) is not measurable yet: the pose mk* fills do not read the v2 tone (surface-fill.js).

const PEN = 0.3;
const LAWS = ['mkTick', 'mkDotScreen', 'mkDashRamp', 'mkScribble', 'bundleCount'];
const BOUNDS = { width: 320, height: 220, penWidth: 0 };
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'mkTick',
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', ...o,
});
const I21 = Array.from({ length: 21 }, (_, i) => i / 20);

describe('surface lock wave D1: v2 mark laws', () => {
  let rt; let V; let SL; let Z; let L; let MS;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; Z = V.Scene3D.SurfaceLockLaws; L = V.Scene3D.SurfaceLockLadder; MS = V.Scene3D.SurfaceLockMarkSet;
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  const pose = () => SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0.4, pitch: 0.3, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
  const rig = (law) => {
    const ps = pose();
    const spec = specOf({ toneLaw: law, scaleRef: ps.cam.scale });
    const ms = Z.bake(spec);
    const R = spec.sizes.sx * ps.cam.scale * 0.5; const area = Math.PI * R * R;
    const cover = (I, ctx) => {
      const tone = Z.toneLUT(spec, ctx || { tone: { enabled: I !== null } });
      const lines = SL.frame([ms], ps, { toneFn: I === null ? null : () => I, tone, penWidth: PEN, floorPitch: 2.2 * PEN, objectId: 'o1' });
      let len = 0;
      lines.forEach((ln) => {
        for (let i = 1; i < ln.length; i++) {
          const mx = (ln[i].x + ln[i - 1].x) / 2 - ps.cam.cx; const my = (ln[i].y + ln[i - 1].y) / 2 - ps.cam.cy;
          if (Math.hypot(mx, my) < R) len += Math.hypot(ln[i].x - ln[i - 1].x, ln[i].y - ln[i - 1].y);
        }
      });
      return PEN * len / area;
    };
    return { spec, ms, cover };
  };
  let ref; const rigs = {};
  const refCurve = () => { if (!ref) ref = (() => { const r = rig('dutyConst'); return I21.map((I) => r.cover(I)); })(); return ref; };

  LAWS.forEach((law) => {
    describe(law, () => {
      let r; let curve;
      beforeAll(() => { r = rig(law); rigs[law] = r; curve = I21.map((I) => r.cover(I)); });

      it('RED: v2 effectiveMarkSpace is surface; legacy stays pose', () => {
        const ctx = (spec) => ({ spec, mapper: 'hatch', visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
        expect(SL.effectiveMarkSpace(r.spec.style, ctx(r.spec))).toBe('surface');
        expect(SL.explainMarkSpace(r.spec.style, ctx(r.spec))).toEqual({ mode: 'surface', reason: 'surface' });
        const legacy = specOf({ toneLaw: law }); delete legacy.toneModel;
        expect(SL.effectiveMarkSpace(legacy.style, ctx(legacy))).toBe('pose');
        expect(Z.supports(Object.assign({}, legacy, { toneModel: 'legacy' }))).toBe(false);
        expect(Z.supports(specOf({ toneLaw: law, mapper: 'contour' }))).toBe(false);
        expect(Z.supports(specOf({ toneLaw: law, style: { fillDensity: 50, tripleHatch: true } }))).toBe(false);
      });

      it('M1/M2/M3: graded, paper at the lightest tones, range >= 0.25 at Density 50', () => {
        for (let i = 1; i < curve.length; i++) expect(curve[i], `I=${I21[i]}`).toBeLessThanOrEqual(curve[i - 1] + 0.03);
        expect(curve[20]).toBeLessThanOrEqual(0.02);
        expect(curve[19]).toBeLessThanOrEqual(0.03);
        expect(curve[1] - curve[19]).toBeGreaterThanOrEqual(0.25);
        expect(curve[4] - curve[10]).toBeGreaterThan(0.04);
        expect(curve[10] - curve[16]).toBeGreaterThan(0.04);
      });

      it('M5/M6: follows the shared v2 target (the dutyConst v2 curve) within 0.06 pen coverage', () => {
        const want = refCurve(); const tol = law === 'mkScribble' ? 0.07 : 0.06; // Scribble: few wide rulings, three amplitude levels
        I21.forEach((I, i) => expect(Math.abs(curve[i] - want[i]), `I=${I}`).toBeLessThanOrEqual(tol));
      });

      it('tone OFF draws a uniform Density (not nothing)', () => {
        const c = r.cover(null);
        expect(c).toBeGreaterThan(0.04);
        expect(Math.abs(c - PEN / (12 * PEN))).toBeLessThan(0.045);
        expect(Math.abs(r.cover(0.4, { tone: { enabled: false } }) - c)).toBeLessThan(1e-9);
      });

      it('vertex budget <= 2x the Default ladder; valid, deterministic MarkSet that keeps the ruling cap contract', () => {
        const lad = L.bake(specOf({ toneLaw: 'ladder', scaleRef: r.spec.scaleRef }));
        expect(r.ms.vertexCount).toBeLessThanOrEqual(2 * lad.vertexCount);
        expect(MS.validate(r.ms)).toEqual([]);
        expect(r.ms.meta.capKey).toBe('ruling');
        expect(r.ms.meta.toneScaleFree).toBe(true);
        expect(Array.from(Z.bake(r.spec).positions)).toEqual(Array.from(r.ms.positions));
      });

      it('through the engine: a v2 scene is surface-locked, drag == export, repeated orbit = 0 bake misses / 0 tone evals; legacy scene is untouched', () => {
        const s = LR.buildCase(V, { law, markSpace: 'surface' });
        const sl = V.Scene3D.SurfaceLock;
        sl.clearCache(); sl.resetStats();
        s.composeFull();
        expect(sl.stats.bakes, 'baked by the surface lock').toBeGreaterThan(0);
        expect(sl.stats.bakeErrors).toBe(0);
        dragEqualsExport(s, [{ camYaw: -30, camPitch: 20 }, { camYaw: 80, camPitch: 30, objYaw: 40 }]).forEach((d) => expect(d.equal, JSON.stringify(d.pose)).toBe(true));
        const yaws = [-60, -40, -20, 0, 20, 40, 60];
        LR.orbitCounters(s, yaws);
        const c = LR.orbitCounters(s, yaws, { warm: false });
        expect(c.bakeMisses).toBe(0);
        expect(c.toneEvals).toBe(0);
        // legacy tone model: pose output, no lock
        const g = LR.buildCase(V, { law, markSpace: 'surface', tone: { model: 'legacy' } });
        sl.clearCache(); sl.resetStats();
        g.composeFull();
        expect(sl.stats.bakes).toBe(0);
      });

      it('specular: under a front light the glint is paper (scaleFn from the H1 path)', () => {
        const s = LR.buildCase(V, { law, markSpace: 'surface', lightCam: LR.LIGHTS.front });
        const profile = LR.measure(s, { model: 'v2' });
        const m2 = LR.m2Highlight(profile, { specular: true });
        expect(m2.value, JSON.stringify(m2)).toBeLessThanOrEqual(0.012);
      });
    });
  });
});
