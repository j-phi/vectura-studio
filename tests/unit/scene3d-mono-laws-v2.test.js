/*
 * Pose mono laws, tone model v2 (light-realism U8). surface-fill-mono.js under `o.toneModel === 'v2'`:
 *   - every picker law (dutyConst, endShorten, mezzoRegion, etfKang, turingStripe, voronoiWeb, mazeFill) follows ONE
 *     target, cov = areaMax . dens(L*) (the L*-linear areaFor span, no lit floor, paper in the lightest PAPER_BAND),
 *   - the sample's specular `s.S` removes ink (the glint is paper),
 *   - legacy (no toneModel / 'legacy') is byte-identical (pinned below; recorded from the pristine tree).
 * The rig is a synthetic sphere substrate: sampleAt carries s.L / s.S exactly as the hub's samples will (H2 wiring);
 * one test drives the standalone path (no s.L: the law computes L / S itself from `o.light` via Regions.shade).
 * Metrics via tests/helpers/light-realism.js (bins, M1, M2, M3, M5 convention: see targetOf below).
 *
 * RED (main, where the laws ignore toneModel): endShorten rho > 0 at the front light (inverted), the lightest tones
 * keep ink (lit floor), mezzoRegion runs ~2x the ink of dutyConst, Turing / dutyConst have 0.2-0.4 cliffs.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const LR = require('../helpers/light-realism');
const DEG = Math.PI / 180;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const LIGHTS = {
  front: norm([0, 0, 1]),
  upperRight: norm([0.55, 0.55, 0.63]),
  side: norm([1, 0, 0.02]),
  back: norm([0.35, 0.35, -0.87]),
};
const R = 25; const CX = 160; const CY = 110; const PEN = 0.3;

const makeRig = (V, { light = 'front', model = 'v2', stub = true, density = 1, angle = 45, extra = {}, radius = R } = {}) => {
  const R = radius;
  const Reg = V.Scene3D.Regions;
  const lc = LIGHTS[light];
  const az = (Math.atan2(lc[0], lc[2]) / DEG + 360) % 360;
  const el = Math.asin(lc[1]) / DEG;
  const lightRec = { type: 'directional', azimuth: az, elevation: el, intensity: 1 };
  const eye = { x: 0, y: 0, z: 1 };
  const toward = Reg.towardLight(lightRec);
  const Hs = { x: toward.x + eye.x, y: toward.y + eye.y, z: toward.z + eye.z };
  const hl = Math.hypot(Hs.x, Hs.y, Hs.z); const H = { x: Hs.x / hl, y: Hs.y / hl, z: Hs.z / hl };
  const shadeOpts = { model, eye, shininess: Reg.shininessForSize(1), ks: 1 };
  const sampleAt = (a, b) => {
    a = Math.min(1, Math.max(0, a)); b = Math.min(1, Math.max(0, b));
    const lat = (a - 0.5) * Math.PI; const lon = b * 2 * Math.PI;
    const nx = Math.cos(lat) * Math.sin(lon); const ny = Math.sin(lat); const nz = Math.cos(lat) * Math.cos(lon);
    const wN = { x: nx, y: ny, z: nz }; const world = { x: R * nx, y: R * ny, z: R * nz };
    const r = Reg.shade(wN, world, [lightRec], shadeOpts);
    const legacy = Reg.combinedIntensity(wN, world, [lightRec]);
    const s = { x: CX + R * nx, y: CY - R * ny, z: R * nz, front: nz > 0, nz, I: legacy, wN, world, dA: null, dB: null };
    if (model === 'v2' && stub) { s.L = r.L; s.S = r.S; }
    else if (model !== 'v2') s.S = 0;
    return s;
  };
  const runs = [];
  const o = {
    algo: 'dutyConst', back: false, mapper: 'hatch', sampleAt, penWidth: PEN, inkWidth: PEN * 1.12, floorPitch: 2.2 * PEN,
    masterPitch: 3 * PEN, litMaxPitch: 12 * PEN, targetArea: 0.3, minMarkMM: 2 * PEN,
    hash: (a, b) => { let h = (a | 0) * 73856093 ^ (b | 0) * 19349663; h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; },
    angleDeg: angle, densityScale: density, crossDelta: 90, pushRun: (run) => { runs.push(run); },
    ...(model === 'v2' ? { toneModel: 'v2' } : {}),
    ...(model === 'v2' && !stub ? { light: { model: 'v2', lights: [lightRec], eye, shininess: shadeOpts.shininess, ks: 1 } } : {}),
    ...extra,
  };
  return { o, runs, lightRec, H, eye, lightCam: { x: lc[0], y: lc[1], z: lc[2] }, lightWorld: toward, model };
};

// Build a light-realism profile (tests/helpers/light-realism.js shape) from emitted runs.
const profileOf = (V, rig, cell = 0.25, rimFrac = 0.85) => {
  const Reg = V.Scene3D.Regions;
  const ink = new Map();
  rig.runs.forEach((p) => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i]; const d = Math.hypot(b.x - a.x, b.y - a.y); if (!(d > 0)) continue;
      const n = Math.max(1, Math.ceil(d / (cell * 0.2)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n; const key = Math.floor((a.x + (b.x - a.x) * t) / cell) + ',' + Math.floor((a.y + (b.y - a.y) * t) / cell);
        ink.set(key, (ink.get(key) || 0) + d / n);
      }
    }
  });
  const samples = [];
  for (let gx = Math.floor((CX - R) / cell); gx <= Math.ceil((CX + R) / cell); gx++) {
    for (let gy = Math.floor((CY - R) / cell); gy <= Math.ceil((CY + R) / cell); gy++) {
      const x = (gx + 0.5) * cell; const y = (gy + 0.5) * cell; const dx = (x - CX) / R; const dy = (y - CY) / R; const r2 = dx * dx + dy * dy;
      if (r2 > rimFrac * rimFrac) continue;
      samples.push({ gx, gy, n: { x: dx, y: -dy, z: Math.sqrt(1 - r2) }, p: null, rad: Math.sqrt(r2) / rimFrac });
    }
  }
  const N = samples.length;
  const cells = { nl: new Float32Array(N), L: new Float32Array(N), S: new Float32Array(N), rad: new Float32Array(N), ink: new Float32Array(N), vis: new Float32Array(N).fill(1) };
  const shadeOpts = { model: rig.model, eye: rig.eye, shininess: Reg.shininessForSize(1), ks: 1 };
  samples.forEach((sm, i) => {
    const r = Reg.shade(sm.n, { x: R * sm.n.x, y: R * sm.n.y, z: R * sm.n.z }, [rig.lightRec], shadeOpts);
    cells.nl[i] = sm.n.x * rig.lightWorld.x + sm.n.y * rig.lightWorld.y + sm.n.z * rig.lightWorld.z;
    cells.L[i] = r.L; cells.S[i] = r.S || 0; cells.rad[i] = sm.rad; cells.ink[i] = ink.get(sm.gx + ',' + sm.gy) || 0;
  });
  return { cells, n: N, cell, areaCell: cell * cell, penWidth: PEN, model: rig.model, samples, lightWorld: rig.lightWorld, eyeWorld: rig.eye, H: rig.H, lightCam: rig.lightCam, discR: R, discC: [CX, CY] };
};



const LEGACY_HASH = {
 "etfKang/hatch": "215f288a6e35:63",
 "defectSplit/hatch": "cfcc46f841e4:91",
 "mezzoRegion/hatch": "c9ce2c4b0c70:179",
 "mezzoRegion/crosshatch": "17c1e7d0748c:353",
 "creviceAO/hatch": "4c93a479f968:88",
 "contactBloom/hatch": "8100aa689e43:83",
 "transReserveMono/hatch": "0070e4357f82:349",
 "jitterOverdraw/hatch": "b2078a56c7c8:102",
 "mergeLadder/hatch": "f1c5778efa00:60",
 "originSpiral/hatch": "8fed159ea8d4:116",
 "shearClear/hatch": "b3295d1baa09:39",
 "phaseBlue/hatch": "791aa3c87285:42",
 "dutyConst/hatch": "8dbcfc15c1a7:225",
 "dutyConst/crosshatch": "528e7a63f75b:435",
 "endShorten/hatch": "4e616d536c00:37",
 "turingStripe/hatch": "a53c99c7c76d:90",
 "voronoiWeb/hatch": "6f9b7f37d498:324",
 "mazeFill/hatch": "4da460713670:902",
 "diffGrowth/hatch": "6554a70ba65c:1",
 "spaceColonise/hatch": "71acf2c44bac:69",
 "fiboQuasi/hatch": "86e48f954c4a:47",
 "hachureSlope/hatch": "41c965d38280:43"
};

const PICKER = ['dutyConst', 'endShorten', 'mezzoRegion', 'etfKang', 'turingStripe', 'voronoiWeb', 'mazeFill'];
const hashOf = (runs) => crypto.createHash('sha256').update(JSON.stringify(runs.map((r) => r.map((p) => [p.x, p.y, p.z])))).digest('hex').slice(0, 12) + ':' + runs.length;

describe('SurfaceFillMono tone model v2 (U8)', () => {
  let rt; let V; let Mono;
  const cache = {};
  beforeAll(async () => {
    rt = await loadVecturaRuntime({ includeUi: false });
    V = rt.window.Vectura; Mono = V.Scene3D.SurfaceFillMono;
  }, 120000);
  afterAll(() => rt && rt.cleanup && rt.cleanup());

  // run a law on the rig; returns { rig, profile, C } (the mono ctx is published by __MONO_TRACE)
  const runLaw = (law, opts = {}) => {
    const key = law + JSON.stringify(opts);
    if (cache[key]) return cache[key];
    const rig = makeRig(V, opts); rig.o.algo = law;
    rt.window.__MONO_TRACE = 1; rt.window.__MONO_CTX = null;
    Mono.emit(rig.o);
    const C = rt.window.__MONO_CTX; rt.window.__MONO_TRACE = 0;
    const profile = profileOf(V, rig);
    return (cache[key] = { rig, profile, C });
  };
  // the target coverage (pen coverage) the v2 map asks of every law at luminance L (specular 0)
  const target = (C, L) => C.areaMax * C.dens({ L, S: 0 }) / 1.12;
  const dev = (r) => {
    const b = LR.bins(r.profile, 'L', { n: 10, minArea: 10 });
    return Math.max(0, ...b.filter((x) => x.cov !== null).map((x) => Math.abs(x.cov - target(r.C, (x.lo + x.hi) / 2))));
  };

  describe.each(['front', 'upperRight'])('picker laws, %s light', (light) => {
    it.each(PICKER)('%s: M1 monotone, M2 glint is paper, M3 range, graded not stepped', (law) => {
      const r = runLaw(law, { light });
      const m1 = LR.m1Monotone(r.profile);
      expect(m1.maxRise, `${law} bins ${m1.detail}`).toBeLessThanOrEqual(0.05);
      expect(m1.rho, `${law} rho`).toBeLessThanOrEqual(-0.9);
      const top = LR.topFractionCoverage(r.profile, 'S', 0.01);
      expect(top, `${law} glint coverage`).toBeLessThanOrEqual(0.01);
      const b = LR.bins(r.profile, 'L', { n: 10, minArea: 10 }).filter((x) => x.cov !== null);
      expect(b[0].cov - b[b.length - 1].cov, `${law} range`).toBeGreaterThanOrEqual(light === 'front' ? 0.12 : 0.25);
      expect(b[b.length - 1].cov, `${law} lightest bin is paper`).toBeLessThanOrEqual(0.03);
      // no cliff: no single bin step loses more than 0.2
      for (let i = 1; i < b.length; i++) expect(b[i - 1].cov - b[i].cov, `${law} step ${i}`).toBeLessThanOrEqual(0.2);
    });
    it('M2 (front): the drawn glint sits on the analytic n = normalize(L + e) point', () => {
      if (light !== 'front') return;
      PICKER.forEach((law) => {
        const m2 = LR.m2Highlight(runLaw(law, { light }).profile, { specular: true });
        expect(m2.pass, `${law} ${JSON.stringify(m2)}`).toBe(true);
      });
    });
  });

  it('M5: every picker law follows the one target within 0.09 per bin (0.06 for dutyConst, endShorten, voronoiWeb, mezzoRegion), spread across laws <= 0.10', () => {
    ['front', 'upperRight'].forEach((light) => {
      const per = {};
      PICKER.forEach((law) => {
        const r = runLaw(law, { light });
        per[law] = dev(r);
        expect(per[law], `${law} ${light}`).toBeLessThanOrEqual(['dutyConst', 'endShorten', 'voronoiWeb', 'mezzoRegion'].includes(law) ? 0.06 : 0.09);
      });
      const cov = {};
      PICKER.forEach((law) => { cov[law] = LR.bins(runLaw(law, { light }).profile, 'L', { n: 10, minArea: 10 }); });
      for (let i = 0; i < 10; i++) {
        const vals = PICKER.map((l) => cov[l][i].cov).filter((v) => v !== null);
        if (vals.length < 4) continue;
        expect(Math.max(...vals) - Math.min(...vals), `${light} bin ${i}`).toBeLessThanOrEqual(0.10 + 0.10);
      }
    });
  });

  it('endShorten is no longer inverted under a front light (legacy rho was +0.9: the centre was solid)', () => {
    const r = runLaw('endShorten', { light: 'front' });
    expect(LR.m1Monotone(r.profile).rho).toBeLessThanOrEqual(-0.9);
    const legacy = runLaw('endShorten', { light: 'front', model: 'legacy' });
    expect(LR.m1Monotone(legacy.profile).rho).toBeGreaterThan(0.5); // the pinned defect
  });

  it('mezzoRegion no longer runs at twice the ink of dutyConst for the same tone (dark bin)', () => {
    const m = LR.bins(runLaw('mezzoRegion', { light: 'upperRight' }).profile, 'L', { n: 10, minArea: 10 }).filter((x) => x.cov !== null)[0].cov;
    const d = LR.bins(runLaw('dutyConst', { light: 'upperRight' }).profile, 'L', { n: 10, minArea: 10 }).filter((x) => x.cov !== null)[0].cov;
    expect(m / d).toBeLessThan(1.25);
    const lm = LR.bins(runLaw('mezzoRegion', { light: 'upperRight', model: 'legacy' }).profile, 'L', { n: 10, minArea: 10 }).filter((x) => x.cov !== null)[0].cov;
    expect(lm / d).toBeGreaterThan(1.8); // legacy pinned
  });

  it('M6 anchor: constant-tone mezzoRegion follows cDark . D(I) like the locked mezzo (U7 table), 25 mm sphere', () => {
    const REF = { 0: 0.434, 0.2: 0.384, 0.4: 0.345, 0.6: 0.220, 0.8: 0.116, 0.9: 0.052, 1: 0 };
    Object.keys(REF).forEach((k) => {
      const L = Number(k);
      const rig = makeRig(V, { light: 'front', radius: 25 }); rig.o.algo = 'mezzoRegion';
      const base = rig.o.sampleAt; rig.o.sampleAt = (a, b) => { const s = base(a, b); if (s) { s.L = L; s.S = 0; } return s; };
      Mono.emit(rig.o);
      let len = 0;
      rig.runs.forEach((p) => { for (let i = 1; i < p.length; i++) { const mx = (p[i].x + p[i - 1].x) / 2 - CX; const my = (p[i].y + p[i - 1].y) / 2 - CY; if (Math.hypot(mx, my) < 12.5) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); } });
      const cov = PEN * len / (Math.PI * 12.5 * 12.5);
      expect(Math.abs(cov - REF[k]), `I=${k} cov ${cov.toFixed(3)}`).toBeLessThanOrEqual(0.05);
    });
  });

  it('s.S removes ink: a specular patch is bare paper, its surround keeps the tone', () => {
    const rig = makeRig(V, { light: 'upperRight' }); rig.o.algo = 'dutyConst';
    const base = rig.o.sampleAt;
    rig.o.sampleAt = (a, b) => { const s = base(a, b); if (s) { s.L = 0.3; s.S = Math.hypot(s.x - CX - 5, s.y - CY + 5) < 6 ? 1 : 0; } return s; };
    Mono.emit(rig.o);
    let inside = 0; let outside = 0;
    rig.runs.forEach((p) => { for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i].x - CX - 5, p[i].y - CY + 5); const l = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); if (d < 5) inside += l; else if (d > 8 && Math.hypot(p[i].x - CX, p[i].y - CY) < 18) outside += l; } });
    expect(inside).toBeLessThan(1);
    expect(outside).toBeGreaterThan(100);
  });

  it('standalone path: no s.L on the sample -> the law computes L / S from o.light (Regions.shade), same ink as the stub', () => {
    const a = makeRig(V, { light: 'upperRight', stub: true, radius: 14 }); a.o.algo = 'dutyConst'; Mono.emit(a.o);
    const b = makeRig(V, { light: 'upperRight', stub: false, radius: 14 }); b.o.algo = 'dutyConst'; Mono.emit(b.o);
    expect(hashOf(b.runs)).toBe(hashOf(a.runs));
    expect(a.runs.length).toBeGreaterThan(20);
  });

  it('every law in the roster runs under v2 without error and draws ink', () => {
    Mono.LAWS.forEach((law) => {
      const rig = makeRig(V, { light: 'upperRight', radius: 14 }); rig.o.algo = law; Mono.emit(rig.o);
      const d = rt.window.__MONO_DIAG;
      expect(d.error, law).toBe(null);
      expect(rig.runs.length, law).toBeGreaterThan(0);
    });
  });

  describe('legacy stays byte-identical', () => {
    it.each(Object.keys(LEGACY_HASH))('%s', (key) => {
      const [law, mapper] = key.split('/');
      const rig = makeRig(V, { model: 'legacy', light: 'upperRight', radius: 14 }); rig.o.algo = law; rig.o.mapper = mapper;
      Mono.emit(rig.o);
      expect(hashOf(rig.runs)).toBe(LEGACY_HASH[key]);
    });
    it('toneModel "legacy" (explicit) equals absent', () => {
      const a = makeRig(V, { model: 'legacy', radius: 14 }); a.o.algo = 'mezzoRegion'; Mono.emit(a.o);
      const b = makeRig(V, { model: 'legacy', radius: 14, extra: { toneModel: 'legacy' } }); b.o.algo = 'mezzoRegion'; Mono.emit(b.o);
      expect(hashOf(b.runs)).toBe(hashOf(a.runs));
    });
  });
});
