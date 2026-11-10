const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// Surface-locked mezzotint baker (lawMezzoLocked, docs/surface-lock-contract.md §2, §3, §5 LUT, §9 mezzo).
// Every assertion is on the MarkSet the baker returns, with no frame, pose, light or engine in between,
// except the tone-LUT witness, which is compared against the pose-mode law's own makeCtx.

const SLOW = 120000;
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'mezzoRegion',
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: 0.3, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, ...o,
});
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sameArrays = (a, b) => ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags']
  .every((k) => Buffer.compare(Buffer.from(a[k].buffer, a[k].byteOffset, a[k].byteLength), Buffer.from(b[k].buffer, b[k].byteOffset, b[k].byteLength)) === 0);

describe('SurfaceLockMezzo (lawMezzoLocked baker)', () => {
  let rt; let V; let Z; let MS; let sphere; let bakeMs;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; Z = V.Scene3D.SurfaceLockMezzo; MS = V.Scene3D.SurfaceLockMarkSet;
    const t0 = now();
    sphere = Z.bake(specOf());
    bakeMs = now() - t0;
  }, SLOW);
  afterAll(() => rt && rt.cleanup());

  const runsOf = (ms) => {
    const out = [];
    for (let r = 0; r < ms.runCount; r++) out.push({ r, v0: ms.runStart[r], v1: ms.runStart[r + 1], level: ms.runLevel[r], family: ms.runFamily[r] });
    return out;
  };
  const pt = (ms, i) => [ms.positions[3 * i], ms.positions[3 * i + 1], ms.positions[3 * i + 2]];

  it('FIT and supports() agree both ways', () => {
    expect(Z.id).toBe('mezzo');
    ['hatch', 'crosshatch', 'contour'].forEach((m) => {
      ['sphere', 'ellipsoid', 'torus', 'cylinder', 'capsule'].forEach((primitive) => {
        expect(Z.supports(specOf({ mapper: m, primitive })), `${m} ${primitive}`).toBe(true);
      });
    });
    expect(Z.supports(specOf({ toneLaw: 'ladder' }))).toBe(false);
    expect(Z.supports(specOf({ toneLaw: 'dutyConst' }))).toBe(false);
    expect(Z.supports(specOf({ mapper: 'stipple' }))).toBe(false);
    expect(Z.supports(specOf({ mapper: 'spiral' }))).toBe(false);
    expect(Z.supports(specOf({ primitive: 'box' }))).toBe(false);
    expect(Z.FIT.length).toBeGreaterThan(0);
  });

  it('1. every vertex is on the surface, normals are unit and outward (§2)', () => {
    expect(MS.validate(sphere)).toEqual([]);
    const n = [0, 0, 0];
    let worst = 0; let minDot = 1;
    for (let i = 0; i < sphere.vertexCount; i++) {
      const p = pt(sphere, i);
      worst = Math.max(worst, Math.abs(Math.hypot(...p) - 20));
      MS.octDecode(sphere.normals, 2 * i, n);
      expect(Math.abs(Math.hypot(...n) - 1)).toBeLessThan(1e-6);
      minDot = Math.min(minDot, (n[0] * p[0] + n[1] * p[1] + n[2] * p[2]) / Math.hypot(...p));
    }
    expect(worst).toBeLessThan(1e-4);
    expect(minDot).toBeGreaterThan(0.9999);
  });

  it('2. separation: runs of levels <= l stay 0.8 p0 / 2^l apart in object mm (§9)', () => {
    const p0 = sphere.meta.p0;
    const runs = runsOf(sphere);
    for (let l = 0; l < sphere.levels; l++) {
      const d = (0.8 * p0) / 2 ** l;
      const cell = d; const grid = new Map(); const key = (i, j, k) => `${i},${j},${k}`;
      let bad = 0; let checked = 0;
      runs.filter((r) => r.level <= l && r.family === 0).forEach((r) => {
        for (let v = r.v0; v < r.v1; v++) {
          const p = pt(sphere, v);
          if (Math.abs(p[1]) > 20 - 0.5) continue; // the chart pole, excluded by the plan
          const c = p.map((x) => Math.floor(x / cell));
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const list = grid.get(key(c[0] + i, c[1] + j, c[2] + k));
            if (!list) continue;
            for (const o of list) {
              if (o.r === r.r) continue;
              checked += 1;
              if (Math.hypot(o.p[0] - p[0], o.p[1] - p[1], o.p[2] - p[2]) < d - 1e-3) bad += 1;
            }
          }
          const kk = key(c[0], c[1], c[2]);
          if (!grid.has(kk)) grid.set(kk, []);
          grid.get(kk).push({ r: r.r, p });
        }
      });
      expect(bad, `level ${l}`).toBe(0);
      expect(checked, `level ${l} compared something`).toBeGreaterThan(0);
    }
  });

  it('3. nesting: total run length of levels <= l grows 2 +- 0.35 per level (§9)', () => {
    const len = new Array(sphere.levels).fill(0);
    runsOf(sphere).filter((r) => r.family === 0).forEach((r) => {
      for (let v = r.v0 + 1; v < r.v1; v++) len[r.level] += Math.hypot(...pt(sphere, v).map((x, i) => x - pt(sphere, v - 1)[i]));
    });
    const cum = []; len.reduce((s, x, i) => { cum[i] = s + x; return cum[i]; }, 0);
    for (let l = 1; l < cum.length; l++) {
      const ratio = cum[l] / cum[l - 1];
      expect(ratio, `cum[${l}]/cum[${l - 1}] = ${ratio.toFixed(3)} (${cum.map((c) => c.toFixed(0)).join(', ')})`).toBeGreaterThan(1.65);
      expect(ratio).toBeLessThan(2.35);
    }
  });

  it('4. directions: inside a region the run tangent is the region direction projected, within 2 degrees (§9)', () => {
    const regs = sphere.meta.regions;
    expect(regs.length).toBeGreaterThan(20);
    expect(regs.length).toBeLessThanOrEqual(200);
    let tested = 0; let worst = 0;
    runsOf(sphere).filter((r) => r.family === 0).forEach((r) => {
      for (let v = r.v0; v + 1 < r.v1; v += 5) {
        const a = pt(sphere, v); const b = pt(sphere, v + 1);
        const m = a.map((x, i) => (x + b[i]) / 2);
        const dist = regs.map((g) => Math.hypot(g.p[0] - m[0], g.p[1] - m[1], g.p[2] - m[2]));
        let i1 = 0; dist.forEach((d, i) => { if (d < dist[i1]) i1 = i; });
        const second = Math.min(...dist.filter((_, i) => i !== i1));
        if (second - dist[i1] < 1.0) continue; // too near a region boundary
        const nrm = m.map((x) => x / Math.hypot(...m));
        const D = regs[i1].d;
        const dn = D[0] * nrm[0] + D[1] * nrm[1] + D[2] * nrm[2];
        if (Math.abs(dn) > 0.97) continue; // the field vanishes where the normal is the direction
        if (Math.abs(m[1]) > 20 - 1.0) continue; // the chart pole: the field turns faster than a step there
        const t = D.map((x, i) => x - dn * nrm[i]); const tl = Math.hypot(...t);
        const c = b.map((x, i) => x - a[i]); const cl = Math.hypot(...c);
        if (cl < 1e-6) continue;
        const cos = Math.abs((t[0] * c[0] + t[1] * c[1] + t[2] * c[2]) / (tl * cl));
        worst = Math.max(worst, (Math.acos(Math.min(1, cos)) * 180) / Math.PI);
        tested += 1;
      }
    });
    expect(tested).toBeGreaterThan(500);
    expect(worst).toBeLessThan(2);
  });

  it('5. deterministic; the salt changes the set; no pose/light input; objectId and global seed state are ignored (§3)', () => {
    const again = Z.bake(specOf());
    expect(sameArrays(sphere, again)).toBe(true);
    const salted = Z.bake(specOf({ seed: { salt: 12345, phase: 0, off: 0 } }));
    expect(sameArrays(sphere, salted)).toBe(false);
    const G = V.Geometry3D;
    const prior = G.snapshotSeedState();
    G.setSeedState({ salt: 987654, phase: 0.37, off: 3 });
    const renamed = Z.bake(specOf({ objectId: 'another-object' }));
    G.restoreSeedState(prior);
    expect(sameArrays(sphere, renamed)).toBe(true);
    expect(renamed.objectId).toBe('another-object');
    expect(Object.keys(specOf()).filter((k) => /pose|light|camera|tone$|yaw|pitch/i.test(k))).toEqual([]);
  });

  it('6. toneLUT equals 1 / pitchFor(I) of the pose-mode makeCtx at 33 I values (§5)', () => {
    const scene = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'mezzoRegion', mapper: 'hatch', markSpace: 'pose' });
    const win = rt.runtime.window;
    win.__MONO_TRACE = 1; win.__MONO_CTX = null;
    scene.composeFull();
    const C = win.__MONO_CTX;
    win.__MONO_TRACE = 0;
    expect(C, 'the mono context was published').toBeTruthy();
    const { lut } = Z.toneLUT(specOf({ penWidth: C.PEN }), { tone: {}, penWidth: C.PEN, highlight: 'blank' });
    expect(lut.length).toBe(257);
    for (let i = 0; i <= 32; i++) {
      const I = i / 32;
      const k = I * 256; const k0 = Math.floor(k); const k1 = Math.min(256, k0 + 1);
      const got = lut[k0] + (lut[k1] - lut[k0]) * (k - k0);
      expect(Math.abs(got - 1 / C.pitchFor(I)), `I=${I}`).toBeLessThan(1e-6);
    }
  });

  it('acceptance: default sphere (R 20, pen 0.3, density 50) fits the budgets', () => {
    // eslint-disable-next-line no-console
    console.log(`[W1-C] sphere: vertices=${sphere.vertexCount} runs=${sphere.runCount} levels=${sphere.levels} bakeMs=${bakeMs.toFixed(0)} msBake=${sphere.meta.msBake} perLevel=${
      Array.from({ length: sphere.levels }, (_, l) => runsOf(sphere).filter((r) => r.level === l).length).join('/')} p0=${sphere.meta.p0}`);
    expect(sphere.vertexCount).toBeLessThanOrEqual(120000);
    expect(bakeMs).toBeLessThanOrEqual(2000);
    expect(MS.validate(sphere)).toEqual([]);
    expect(sphere.levels).toBeGreaterThanOrEqual(4);
    expect(sphere.levels).toBeLessThanOrEqual(6);
    expect(sphere.meta.gain).toBe(2);
    expect(sphere.meta.toneModel).toBe('pitch');
  });

  it('crosshatch adds a second family with its own occupancy; every chart primitive bakes clean (§9 FIT)', () => {
    const cross = Z.bake(specOf({ mapper: 'crosshatch' }));
    expect(MS.validate(cross)).toEqual([]);
    const fams = new Set(Array.from(cross.runFamily));
    expect(fams.has(0) && fams.has(1)).toBe(true);
    const cases = [
      { primitive: 'ellipsoid', mode: 'sphere', sizes: { sx: 30, sy: 20, sz: 22 }, scale: { sx: 1, sy: 1, sz: 1 } },
      { primitive: 'torus', mode: 'torus', sizes: { sx: 34, sy: 9, sz: 9 }, scale: { sx: 1, sy: 1, sz: 1 } },
      { primitive: 'cylinder', mode: 'cylinder', sizes: { sx: 16, sy: 30, sz: 16 }, scale: { sx: 1, sy: 1, sz: 1 } },
      { primitive: 'capsule', mode: 'capsule', sizes: { sx: 14, sy: 36, sz: 14 }, scale: { sx: 1, sy: 1, sz: 1 } },
      { primitive: 'sphere', mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 }, scale: { sx: 1.5, sy: 1, sz: 0.6 } },
    ];
    cases.forEach((c) => {
      const t0 = now();
      const ms = Z.bake(specOf(c));
      const dt = now() - t0;
      expect(MS.validate(ms), c.primitive).toEqual([]);
      expect(ms.runCount, c.primitive).toBeGreaterThan(50);
      expect(ms.vertexCount, c.primitive).toBeLessThanOrEqual(200000);
      expect(dt, `${c.primitive} bake clock`).toBeLessThan(8000);
      const n = [0, 0, 0];
      for (let i = 0; i < ms.vertexCount; i += 97) {
        MS.octDecode(ms.normals, 2 * i, n);
        expect(Math.abs(Math.hypot(...n) - 1)).toBeLessThan(1e-6);
      }
    });
    // Scaled sphere: p = diag(scale) * chart, so (x/30)^2 + (y/20)^2 + (z/12)^2 = 1.
    const sc = Z.bake(specOf(cases[4]));
    let worst = 0; let minDot = 1; const nn = [0, 0, 0];
    for (let i = 0; i < sc.vertexCount; i++) {
      const [x, y, z] = pt(sc, i);
      worst = Math.max(worst, Math.abs((x / 30) ** 2 + (y / 20) ** 2 + (z / 12) ** 2 - 1));
      // Inverse-transpose normal under non-uniform scale: proportional to the implicit gradient.
      MS.octDecode(sc.normals, 2 * i, nn);
      const g = [x / 900, y / 400, z / 144]; const gl = Math.hypot(...g);
      minDot = Math.min(minDot, (nn[0] * g[0] + nn[1] * g[1] + nn[2] * g[2]) / gl);
    }
    expect(worst).toBeLessThan(1e-4);
    expect(minDot).toBeGreaterThan(0.9999);
  });
});
