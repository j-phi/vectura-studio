const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');
const crypto = require('crypto');
const { signature } = require('../helpers/surface-lock-scene');
const shaOf = (paths) => crypto.createHash('sha1').update(signature(paths, 9).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')).digest('hex');

// Wave D4a (contract A30): Fill Style "Tapered Ends" (v2) is baked as a DRAG-PREVIEW-ONLY light-following width bake (FIT row `v2Only` + `dragPreviewOnly`),
// generalising A29's bakeWeight with the pose law's width curve (soft-clamped grey -> ink area -> width at the nominal pitch). Settled / export = pose compose
// byte for byte. The end taper appears on release (no end distance on a baked ruling).

const PEN = 0.3;
const LAW = 'taperedEnds';
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: LAW,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', dragPreview: true, ...o,
});

const inkOf = (paths, cell, pen) => {
  const ink = new Map();
  paths.forEach((p) => {
    const w = (p.meta && p.meta.weightScale) || 1;
    const closed = p.meta && p.meta.closed === true;
    let per = 0; let a2 = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; per += Math.hypot(q.x - p[i].x, q.y - p[i].y); a2 += p[i].x * q.y - q.x * p[i].y; }
    const share = closed && per > 0 ? (Math.abs(a2) / 2 / pen) / per : w;
    const last = closed ? p.length : p.length - 1;
    for (let i = 0; i < last; i++) {
      const a = p[i]; const b = p[(i + 1) % p.length]; const d = Math.hypot(b.x - a.x, b.y - a.y); if (!(d > 0)) continue;
      const n = Math.max(1, Math.ceil(d / (cell * 0.2)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n; const key = `${Math.floor((a.x + (b.x - a.x) * t) / cell)},${Math.floor((a.y + (b.y - a.y) * t) / cell)}`;
        ink.set(key, (ink.get(key) || 0) + share * d / n);
      }
    }
  });
  return ink;
};
const weighted = (s, paths) => {
  const prof = LR.measure(s, { model: 'v2', paths });
  const ink = inkOf(s.fills(paths), prof.cell, PEN);
  prof.samples.forEach((sm, i) => { prof.cells.ink[i] = ink.get(`${sm.gx},${sm.gy}`) || 0; });
  return { prof, bins: LR.bins(prof, 'L', { n: 10 }).map((x) => (x.cov === null ? 0 : x.cov)) };
};

describe('surface lock wave D4a: v2 taperedEnds (drag-preview-only width bake)', () => {
  let rt; let V; let SL; let Z; let MS;
  let surf; let pose; let surfPaths;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; Z = V.Scene3D.SurfaceLockLaws; MS = V.Scene3D.SurfaceLockMarkSet;
    const sS = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    SL.clearCache(); SL.resetStats();
    surfPaths = sS.composePreview();
    surf = weighted(sS, surfPaths);
    const sP = LR.buildCase(V, { law: LAW, markSpace: 'pose' });
    pose = weighted(sP, sP.composeFull());
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  it('RED: settled / export equals the pose compose byte for byte (0 bakes); the baked frame exists only while dragging', () => {
    const sS = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    const sP = LR.buildCase(V, { law: LAW, markSpace: 'pose' });
    SL.clearCache(); SL.resetStats();
    const settled = sS.composeFull();
    expect(SL.stats.bakes, 'no surface bake when settled').toBe(0);
    expect(shaOf(settled)).toBe(shaOf(sP.composeFull()));
    sS.setPose({ camYaw: 50, camPitch: 25 }); sP.setPose({ camYaw: 50, camPitch: 25 });
    const drag = sS.composePreview();
    expect(SL.stats.bakes, 'the drag frame is baked').toBeGreaterThan(0);
    expect(shaOf(drag)).not.toBe(shaOf(sP.composeFull()));
    expect(shaOf(sS.composeFull()), 'release swaps back to pose').toBe(shaOf(sP.composeFull()));
  });

  it('RED: supports / effectiveMarkSpace: surface only for a v2 dragPreview spec; settled, legacy, contour, tripleHatch stay pose', () => {
    const spec = specOf();
    const ctx = (sp) => ({ spec: sp, mapper: sp.mapper, visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
    expect(Z.supports(spec)).toBe(true);
    expect(SL.effectiveMarkSpace(spec.style, ctx(spec))).toBe('surface');
    const settledSpec = specOf({ dragPreview: undefined });
    expect(Z.supports(settledSpec)).toBe(false);
    expect(SL.effectiveMarkSpace(settledSpec.style, ctx(settledSpec))).toBe('pose');
    const legacy = specOf(); delete legacy.toneModel;
    expect(Z.supports(legacy)).toBe(false);
    expect(Z.supports(specOf({ mapper: 'contour' }))).toBe(false);
    expect(Z.supports(specOf({ style: { fillDensity: 50, tripleHatch: true } }))).toBe(false);
    expect(Z.supports(specOf({ mapper: 'crosshatch' }))).toBe(true);
  });

  it('bake: width channel + tone bands, lawId taperedEnds, widths grow toward the dark, within the weight byte', () => {
    const ms = Z.bake(specOf());
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.meta.lawId).toBe('taperedEnds');
    expect(ms.runWeight && ms.runBand).toBeTruthy();
    expect(ms.vertexCount).toBeLessThanOrEqual(120000);
    expect(Math.max(...Array.from(ms.runWeight))).toBeLessThanOrEqual(255);
    const fills = surfPaths.filter((p) => p.meta && p.meta.kind === 'sceneFill');
    expect(fills.length).toBeGreaterThan(20);
    expect(new Set(fills.map((p) => p.meta.weightScale || 1)).size, 'several distinct widths').toBeGreaterThan(2);
    // width curve differs from weightModulated's (the soft-clamped taper curve): same spec, other law, other bands
    const wm = Z.bake(specOf({ toneLaw: 'weightModulated' }));
    expect(Array.from(ms.runBand).join()).not.toBe(Array.from(wm.runBand).join());
  });

  it('drag frame: Level S (not warp), orbit = 0 bake misses / 0 tone evals, light move = 0 bakes', () => {
    const s = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    SL.clearCache(); SL.resetStats();
    s.setPose({ camYaw: 50, camPitch: 25 });
    const drag = s.composePreview();
    expect(SL.stats.bakes).toBeGreaterThan(0);
    expect(SL.stats.bakeErrors).toBe(0);
    expect(s.fills(drag).length).toBeGreaterThan(20);
    const yaws = [-60, -40, -20, 0, 20, 40, 60];
    LR.orbitCounters(s, yaws);
    const c = LR.orbitCounters(s, yaws, { warm: false });
    expect(c.bakeMisses).toBe(0);
    expect(c.toneEvals).toBe(0);
    const lm = LR.lightMoveCounters(s, [{ az: 20, el: 40 }, { az: 80, el: 30 }, { az: 140, el: 50 }]);
    expect(lm.bakeMisses, 'a light move rebakes nothing').toBe(0);
  });

  it('tone: M1 monotone and M3 range >= 0.15 on the drag frame; width-weighted ink per L* within 2x of pose, total close', () => {
    const m1 = LR.m1Monotone(surf.prof); expect(m1.pass, JSON.stringify(m1)).toBe(true);
    const m3 = LR.m3Range(surf.prof, 50); expect(m3.value, JSON.stringify(m3)).toBeGreaterThanOrEqual(0.15);
    const tot = (a) => a.reduce((x, y) => x + y, 0);
    surf.bins.forEach((v, i) => {
      if (pose.bins[i] < 0.03 && v < 0.12) return; // the paper end: the pose draws nothing, the baked grid keeps a thin residue until its roll-off (I > 0.96)
      expect(v / Math.max(1e-6, pose.bins[i]), `bin ${i} ${JSON.stringify({ s: surf.bins, p: pose.bins })}`).toBeGreaterThan(0.5);
      expect(v / Math.max(1e-6, pose.bins[i]), `bin ${i}`).toBeLessThan(2);
    });
    expect(tot(surf.bins) / tot(pose.bins)).toBeGreaterThan(0.7);
    expect(tot(surf.bins) / tot(pose.bins)).toBeLessThan(1.33);
  });

  it('the taper knobs are honoured: a softer / thinner-tip law changes the bake', () => {
    const a = Z.bake(specOf());
    const b = Z.bake(specOf({ style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface', taperSoftness: 0.3 } }));
    expect(Array.from(b.runBand).join()).not.toBe(Array.from(a.runBand).join());
  });
});
