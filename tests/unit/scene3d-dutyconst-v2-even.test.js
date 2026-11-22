const LR = require('../helpers/light-realism');

// Light realism dark end, dutyConst (tone model v2): an EVEN fill at one tone.
// Defect (df3f1730): at the darker dark end the frame's crowd guard (1.3 pens) sat right at the lattice's face-on screen gap
// (~1.34 pens). Where the foreshortened gap cleared the guard every ruling was kept, elsewhere every other one: a 2x density step
// along a facing contour (a dense, sharp-edged oval with voids around it). Two bake bugs fed it: the local pitch ratio of the cap word
// divided an object-space distance by a screen-space pitch, and the ruling ordinals decoded (level, rank) that a pole relabel makes
// ambiguous, so the "neighbours" of most rulings were far away (ratio pinned at 15/8).
describe('dutyConst v2: one tone draws one coverage (no density step)', () => {
  let rt; let V;
  beforeAll(async () => { rt = await LR.loadRuntime(); V = rt.V; }, 120000);
  afterAll(() => rt && rt.cleanup());
  const PEN = 0.3;
  const TONE = { tone: { enabled: true, ladder: [0.33, 0.66], thresholds: [0.33, 0.66] } };
  const setup = (yaw = 0.4, pitch = 0.3) => {
    const SL = V.Scene3D.SurfaceLock; const Z = V.Scene3D.SurfaceLockLaws;
    const pose = SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw, pitch, roll: 0, zoom: 1, projection: 'orthographic' }, { width: 320, height: 220, penWidth: 0 });
    const spec = {
      objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24, scale: { sx: 1, sy: 1, sz: 1 },
      mapper: 'hatch', toneLaw: 'dutyConst', style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: PEN,
      scaleRef: pose.cam.scale, seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2',
    };
    const ms = Z.bake(spec);
    return { SL, pose, ms, tone: Z.toneLUT(spec, TONE) };
  };

  const measure = (yaw, pitch) => {
    const { SL, pose, ms, tone } = setup(yaw, pitch);
    const lines = SL.frame([ms], pose, { toneFn: () => 0, tone, penWidth: PEN, objectId: 'o1', toneModel: 'v2' });
    const C = 1; const R = 14 * pose.cam.scale; const ink = new Map();
    lines.forEach((p) => {
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1]; const b = p[i]; const d = Math.hypot(b.x - a.x, b.y - a.y); const n = Math.max(1, Math.ceil(d / 0.05));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const key = `${Math.floor((a.x + (b.x - a.x) * t - pose.cam.cx) / C)},${Math.floor((a.y + (b.y - a.y) * t - pose.cam.cy) / C)}`;
          ink.set(key, (ink.get(key) || 0) + d / n);
        }
      }
    });
    const cov = [];
    const N = Math.ceil(R / C);
    for (let ky = -N; ky < N; ky++) for (let kx = -N; kx < N; kx++) {
      if (Math.hypot((kx + 0.5) * C, (ky + 0.5) * C) < 0.6 * R) cov.push((ink.get(`${kx},${ky}`) || 0) * PEN / (C * C));
    }
    cov.sort((a, b) => a - b);
    const q = (f) => cov[Math.floor(f * (cov.length - 1))];
    return { ratio: q(0.9) / q(0.1), median: q(0.5) };
  };

  it('constant dark tone: 1 mm cells inside 0.6 R stay within 1.45x (p90 / p10) and the median reaches the dark end', () => {
    const m = measure(0.4, 0.3);
    expect(m.ratio).toBeLessThan(1.45); // df3f1730: 1.73 (dense oval at ~0.75, rings of every-other ruling at ~0.4)
    expect(m.median).toBeGreaterThanOrEqual(0.6);
  }, 120000);

  // U5: the cap word quantises the local gap ratio down in 1/8 steps, so face-on cells straddle c = 1 when the separation sits above 1
  // (1.08 shipped: 1.35-1.38 at the test pose, 1.49 at 1.08 x 1.04). The bars must hold with margin around the configured value.
  it('robust to the separation constant: bars hold for sep x {0.92, 1, 1.04} at 5 poses', () => {
    const orig = V.SCENE3D_SURFACE_LOCK;
    const base = (orig.LAWS && orig.LAWS.V2_DUTY_SEP) || 1.08;
    const poses = [[0.4, 0.3], [0, 0], [0.9, 0.5], [-0.6, 0.2], [1.3, -0.4]];
    const bad = [];
    try {
      [0.92, 1, 1.04].forEach((f) => {
        V.SCENE3D_SURFACE_LOCK = Object.freeze(Object.assign({}, orig, { LAWS: Object.freeze(Object.assign({}, orig.LAWS, { V2_DUTY_SEP: base * f })) }));
        poses.forEach(([yaw, pitch]) => {
          const m = measure(yaw, pitch);
          if (!(m.ratio < 1.45 && m.median >= 0.6)) bad.push(`sep x${f} yaw ${yaw} pitch ${pitch}: ratio ${m.ratio.toFixed(3)} median ${m.median.toFixed(3)}`);
        });
      });
    } finally { V.SCENE3D_SURFACE_LOCK = orig; }
    expect(bad).toEqual([]);
  }, 600000);

  it('the cap word carries a true local pitch ratio: most cells see a neighbouring ruling about one pitch away', () => {
    const { ms } = setup();
    let far = 0; let near = 0;
    for (let r = 0; r < ms.runCount; r++) {
      const rq = ms.runCapRank[r] >> 12;
      if (rq === 15) far += 1; else if (rq >= 6 && rq <= 10) near += 1;
    }
    expect(far / ms.runCount).toBeLessThan(0.3); // df3f1730: 0.58 (ordinal neighbours far away)
    expect(near / ms.runCount).toBeGreaterThan(0.6);
  }, 120000);
});
