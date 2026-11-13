const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// SurfaceLockLaws, tone model v2 (light-realism unit U4). dutyConst and endShorten under `spec.toneModel === 'v2'`:
//   M1  coverage is non-increasing in the tone I and has no plateau,
//   M2  the lightest tones are paper (no lit floor, no cliff either),
//   M3  the dark-to-light range is at least 0.25 pen-coverage at Density 50,
//   M6  the locked curve follows the pose law's own L*-linear map (areaFor),
//   and tone OFF draws a uniform Density (contract §5) instead of nothing,
//   and the baked vertex count stays within 2x of the Default ladder's (the sceneFrame cost is linear in it).
// Legacy (no `toneModel`, or 'legacy') must stay byte-identical: the saved-file hard gate.
// Coverage is measured in the middle of the disc (facing > 0.87), where the plot-floor cap (a view-dependent ruling
// thinning owned by the frame, not by the baker) never binds, with a constant tone I standing in for the light.

const PEN = 0.3;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'dutyConst',
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, ...o,
});
const I21 = Array.from({ length: 21 }, (_, i) => i / 20);

describe('SurfaceLockLaws tone model v2 (U4)', () => {
  let rt; let V; let Z; let SL; let L; const ctxByLaw = {};
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; Z = V.Scene3D.SurfaceLockLaws; SL = V.Scene3D.SurfaceLock; L = V.Scene3D.SurfaceLockLadder;
    const win = rt.runtime.window;
    ['dutyConst', 'endShorten'].forEach((law) => {
      const scene = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: law, mapper: 'hatch', markSpace: 'pose' });
      win.__MONO_TRACE = 1; win.__MONO_CTX = null;
      scene.composeFull();
      ctxByLaw[law] = win.__MONO_CTX; win.__MONO_TRACE = 0;
    });
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  const BOUNDS = { width: 320, height: 220, penWidth: 0 };
  const poseOf = () => SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0.4, pitch: 0.3, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
  // Pen coverage of the middle of the disc (radius 0.5 R on screen) for a constant tone I (null = tone off).
  const rig = (extra) => {
    const pose = poseOf();
    const spec = specOf({ scaleRef: pose.cam.scale, ...extra });
    const ms = Z.bake(spec);
    const R = spec.sizes.sx * pose.cam.scale * 0.5; const area = Math.PI * R * R;
    const cover = (I, ctx) => {
      const tone = Z.toneLUT(spec, ctx || { tone: { enabled: I !== null } });
      SL.resetStats();
      const lines = SL.frame([ms], pose, { toneFn: I === null ? null : () => I, tone, penWidth: PEN, floorPitch: 2.2 * PEN, objectId: 'o1', toneModel: spec.toneModel === 'v2' ? 'v2' : undefined });
      let len = 0;
      lines.forEach((ln) => {
        for (let i = 1; i < ln.length; i++) {
          const mx = (ln[i].x + ln[i - 1].x) / 2 - pose.cam.cx; const my = (ln[i].y + ln[i - 1].y) / 2 - pose.cam.cy;
          if (Math.hypot(mx, my) < R) len += Math.hypot(ln[i].x - ln[i - 1].x, ln[i].y - ln[i - 1].y);
        }
      });
      return PEN * len / area;
    };
    return { spec, ms, pose, cover };
  };

  // The pose law's own maps (surface-fill-mono.js lawDuty): ruling pitch and the L*-linear duty span.
  const poseCov = (C) => {
    const dutyP = () => {
      const P0 = C.FLOOR * 1.05 * C.SPARSE;
      const tDense = clamp((1 - 1 / C.DS) / (1 - 1 / 4), 0, 1);
      const cov0 = C.PEN / P0;
      return tDense > 0 ? C.PEN / (cov0 + (1 - cov0) * tDense) : P0;
    };
    const aL = C.areaFor(1); const aD = C.areaFor(0);
    return (I) => (C.PEN / dutyP()) * clamp((C.areaFor(I) - aL) / Math.max(1e-6, aD - aL), 0, 1);
  };

  describe('dutyConst', () => {
    let r; let curve;
    beforeAll(() => { r = rig({ toneModel: 'v2' }); curve = I21.map((I) => r.cover(I)); });

    it('M1: coverage is non-increasing in I and graded (no plateau, no cliff)', () => {
      for (let i = 1; i < curve.length; i++) expect(curve[i], `I=${I21[i]}`).toBeLessThanOrEqual(curve[i - 1] + 0.02);
      // no cliff: no single 0.05 step of I drops more than 0.12 pen-coverage (today: ~0.2 -> 0 between 0.75 and 0.80)
      for (let i = 1; i < curve.length; i++) expect(curve[i - 1] - curve[i], `step to I=${I21[i]}`).toBeLessThan(0.12);
      // no plateau: the dark half and the light half are each graded, not flat
      expect(curve[4] - curve[10]).toBeGreaterThan(0.05);
      expect(curve[10] - curve[16]).toBeGreaterThan(0.05);
    });

    it('M2/M3: the lightest tones are paper and the range is at least 0.25 at Density 50', () => {
      expect(curve[20]).toBeLessThanOrEqual(0.02);
      expect(curve[19]).toBeLessThanOrEqual(0.02);
      expect(curve[1] - curve[19]).toBeGreaterThanOrEqual(0.25);
    });

    it('M6: follows the pose law\'s L*-linear map within 0.05 pen-coverage', () => {
      const want = poseCov(ctxByLaw.dutyConst);
      I21.forEach((I, i) => expect(Math.abs(curve[i] - want(I)), `I=${I}`).toBeLessThanOrEqual(0.05));
    });

    it('tone OFF draws a uniform Density (the Default ladder\'s lit pitch), not nothing', () => {
      const c = r.cover(null);
      const ladderLike = PEN / (12 * PEN); // ladder tone-off: one ruling per LIT_MAX_PITCH_PEN pens
      expect(c).toBeGreaterThan(0.05);
      expect(Math.abs(c - ladderLike)).toBeLessThan(0.035);
      // uniform: two off-centre windows agree (checked via the whole-disc figure being flat against I)
      const lit = r.cover(0.5, { tone: { enabled: false } });
      expect(Math.abs(lit - c)).toBeLessThan(1e-9);
    });

    it('vertex diet: the baked MarkSet is within 2x of the Default ladder\'s vertex count', () => {
      const lad = L.bake(specOf({ toneLaw: 'ladder', scaleRef: r.spec.scaleRef }));
      expect(r.ms.vertexCount).toBeLessThanOrEqual(2 * lad.vertexCount);
      expect(r.ms.runCount).toBeLessThanOrEqual(2 * lad.vertexCount);
    });

    it('v2 mark set is valid, deterministic and keeps the ruling cap contract (capKey ruling, runCapRank)', () => {
      const MS = V.Scene3D.SurfaceLockMarkSet;
      expect(MS.validate(r.ms)).toEqual([]);
      expect(r.ms.meta.capKey).toBe('ruling');
      expect(r.ms.runCapRank.length).toBe(r.ms.runCount);
      expect(Array.from(Z.bake(r.spec).positions)).toEqual(Array.from(r.ms.positions));
      for (let q = 0; q < r.ms.runCount; q++) expect(r.ms.runStart[q + 1] - r.ms.runStart[q]).toBeGreaterThanOrEqual(2);
    });
  });

  describe('endShorten', () => {
    let r; let curve;
    beforeAll(() => { r = rig({ toneLaw: 'endShorten', toneModel: 'v2' }); curve = I21.map((I) => r.cover(I)); });

    it('M1/M2/M3: graded, monotone, paper at the lightest tones (no lit floor)', () => {
      for (let i = 1; i < curve.length; i++) expect(curve[i], `I=${I21[i]}`).toBeLessThanOrEqual(curve[i - 1] + 0.02);
      expect(curve[20]).toBeLessThanOrEqual(0.02);
      expect(curve[19]).toBeLessThanOrEqual(0.03);
      expect(curve[1] - curve[19]).toBeGreaterThanOrEqual(0.25);
    });

    it('tone OFF draws a uniform plain hatch at the Default ladder\'s lit pitch', () => {
      const c = r.cover(null);
      expect(Math.abs(c - PEN / (12 * PEN))).toBeLessThan(0.035);
    });

    it('vertex diet: the ruling polylines are decimated to well under the Default ladder\'s count', () => {
      const lad = L.bake(specOf({ toneLaw: 'ladder', scaleRef: r.spec.scaleRef }));
      expect(r.ms.vertexCount).toBeLessThanOrEqual(1.5 * lad.vertexCount);
      // the decimation never leaves a gap longer than the tone-sampling bound
      let worst = 0;
      for (let q = 0; q < r.ms.runCount; q++) {
        for (let v = r.ms.runStart[q] + 1; v < r.ms.runStart[q + 1]; v++) {
          worst = Math.max(worst, Math.hypot(r.ms.positions[3 * v] - r.ms.positions[3 * v - 3], r.ms.positions[3 * v + 1] - r.ms.positions[3 * v - 2], r.ms.positions[3 * v + 2] - r.ms.positions[3 * v - 1]));
        }
      }
      expect(worst).toBeLessThanOrEqual(2.0 + 1e-6);
    });
  });

  describe('legacy stays byte-identical (saved files, pose golden corpus)', () => {
    it.each(['dutyConst', 'endShorten'])('%s: no toneModel === toneModel "legacy" === a toneCtx model "legacy"', (law) => {
      const a = Z.bake(specOf({ toneLaw: law }));
      const b = Z.bake(specOf({ toneLaw: law, toneModel: 'legacy' }));
      ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'].forEach((k) => expect(Array.from(b[k]), k).toEqual(Array.from(a[k])));
      const t0 = Z.toneLUT(specOf({ toneLaw: law }), { tone: { enabled: true } });
      const t1 = Z.toneLUT(specOf({ toneLaw: law, toneModel: 'legacy' }), { tone: { enabled: true, model: 'legacy' }, light: { model: 'legacy' } });
      expect(Array.from(t1.lut)).toEqual(Array.from(t0.lut));
    });
    it('dutyConst legacy keeps its dash-band structure, tone-off LUT and the cliff (the pose-mode contract)', () => {
      const ms = Z.bake(specOf({ toneLaw: 'dutyConst' }));
      expect(ms.meta.minDuty).toBeGreaterThan(0);
      expect(ms.runCount).toBeGreaterThan(5000);
      const off = Z.toneLUT(specOf({ toneLaw: 'dutyConst' }), { tone: { enabled: false } });
      expect(off.lut[256]).toBe(0);
    });
  });
});
