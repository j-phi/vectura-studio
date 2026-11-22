const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');

// SurfaceLockMezzo, tone model v2 (light-realism unit U7). Under `spec.toneModel === 'v2'` the mezzo density LUT
//   M1  is non-increasing in I and graded (no plateau / cliff),
//   M2  reaches paper at the lightest tones (no lit floor),
//   M3  spans >= 0.25 pen-coverage at Density 50,
//   M6  follows the spec's cov_target curve (light-plan 2.2; the laws baker's targetOf) within 0.05, the target U8's pose mezzo must match,
// and tone OFF draws the uniform Density instead of paper. Legacy (no toneModel / 'legacy') stays byte-identical.
// Coverage is measured in the middle of the disc (radius 0.5 R), where the plot-floor cap never binds, at a constant tone I.

const PEN = 0.3;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'mezzoRegion',
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, ...o,
});
const I21 = Array.from({ length: 21 }, (_, i) => i / 20);

describe('SurfaceLockMezzo tone model v2 (U7)', () => {
  let rt; let V; let Z; let SL; let ms; let pose; let R; let area;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; Z = V.Scene3D.SurfaceLockMezzo; SL = V.Scene3D.SurfaceLock;
    pose = SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0.4, pitch: 0.3, roll: 0, zoom: 1, projection: 'orthographic' }, { width: 320, height: 220, penWidth: 0 });
    ms = Z.bake(specOf({ scaleRef: pose.cam.scale }));
    R = 14 * pose.cam.scale * 0.5; area = Math.PI * R * R;
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  const cover = (spec, I, ctx) => {
    const tone = Z.toneLUT(spec, ctx || { tone: { enabled: I !== null } });
    const lines = SL.frame([ms], pose, { toneFn: I === null ? null : () => I, tone, penWidth: PEN, floorPitch: 2.2 * PEN, objectId: 'o1' });
    let len = 0;
    lines.forEach((ln) => {
      for (let i = 1; i < ln.length; i++) {
        const mx = (ln[i].x + ln[i - 1].x) / 2 - pose.cam.cx; const my = (ln[i].y + ln[i - 1].y) / 2 - pose.cam.cy;
        if (Math.hypot(mx, my) < R) len += Math.hypot(ln[i].x - ln[i - 1].x, ln[i].y - ln[i - 1].y);
      }
    });
    return PEN * len / area;
  };
  const v2 = () => specOf({ toneModel: 'v2', scaleRef: pose.cam.scale });

  // The spec's cov_target shape: the pose map's L*-linear areaFor span, normalised, with the paper roll-off; scaled by the
  // law's own dark coverage c_dark (light-plan 2.2: c_dark comes from Density and the bake's finest level), here the measured I=0 value.
  const shape = () => {
    const INK = PEN * 1.12; const PMAX0 = Math.max(2.2 * PEN * 1.6, 12 * PEN);
    const Lstar = (Y) => (Y > 0.008856 ? 116 * Math.pow(Y, 1 / 3) - 16 : 903.3 * Y);
    const invL = (Lv) => (Lv > 8 ? Math.pow((Lv + 16) / 116, 3) : Lv / 903.3);
    const LL = Lstar(1 - clamp(INK / PMAX0, 0.02, 0.5)); const LD = Lstar(0.1);
    const areaFor = (I) => clamp(1 - invL(LD + (LL - LD) * I), 0.02, 0.9);
    return (I) => {
      const d = clamp((areaFor(I) - areaFor(1)) / (areaFor(0) - areaFor(1)), 0, 1);
      const u = clamp((1 - I) / 0.15, 0, 1);
      return d * u * u * (3 - 2 * u);
    };
  };

  describe('v2', () => {
    let curve;
    beforeAll(() => { curve = I21.map((I) => cover(v2(), I)); console.log('[U7] mezzo v2 cov per I (0..1 step .05):', curve.map((c) => c.toFixed(3)).join(' ')); }, 120000);

    it('M1: non-increasing in I, graded (no plateau, no cliff)', () => {
      for (let i = 1; i < curve.length; i++) expect(curve[i], `I=${I21[i]}`).toBeLessThanOrEqual(curve[i - 1] + 0.02);
      for (let i = 1; i < curve.length; i++) expect(curve[i - 1] - curve[i], `step to I=${I21[i]}`).toBeLessThan(0.12);
      expect(curve[4] - curve[10]).toBeGreaterThan(0.05);
      expect(curve[10] - curve[16]).toBeGreaterThan(0.05);
    });

    it('M2/M3: the lightest tones are paper and the range is at least 0.25 at Density 50', () => {
      expect(curve[20]).toBeLessThanOrEqual(0.02);
      expect(curve[19]).toBeLessThanOrEqual(0.02);
      expect(curve[1] - curve[19]).toBeGreaterThanOrEqual(0.25);
    });

    it('M6: follows the spec cov_target curve within 0.05 (U8 pose mezzo targets the same curve)', () => {
      const sh = shape(); const want = (I) => curve[0] * sh(I);
      expect(curve[0]).toBeGreaterThanOrEqual(0.35); // the dark end is the bake's real ceiling, not a plateau below it
      I21.forEach((I, i) => expect(Math.abs(curve[i] - want(I)), `I=${I} got ${curve[i].toFixed(3)} want ${want(I).toFixed(3)}`).toBeLessThanOrEqual(0.05));
    });

    it('tone OFF draws the uniform Density (the ladder tone-off ink), not paper', () => {
      const c = cover(v2(), null);
      expect(c).toBeGreaterThan(0.05);
      expect(Math.abs(c - 1 / 12)).toBeLessThan(0.04);
    });

    it('the model also comes from toneCtx when the spec carries none; an explicit legacy spec wins', () => {
      const bare = specOf({ scaleRef: pose.cam.scale });
      expect(Z.toneLUT(bare, { tone: { model: 'v2' } }).lut[256]).toBe(0);
      expect(Z.toneLUT(specOf({ toneModel: 'legacy' }), { tone: { model: 'v2' } }).lut[256]).toBeGreaterThan(0);
    });
  });

  it('legacy: no toneModel and toneModel "legacy" give the identical, non-zero-floored LUT', () => {
    const a = Z.toneLUT(specOf(), { tone: {} }).lut; const b = Z.toneLUT(specOf({ toneModel: 'legacy' }), { tone: {} }).lut;
    expect(Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer))).toBe(0);
    expect(a[256]).toBeGreaterThan(0.05); // the lit floor
  });
});
