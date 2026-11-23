const { loadSurfaceLockRuntime, dragEqualsExport } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');

// Wave D (WD-D3): weightModulated is baked once onto the surface for v2 scenes (SurfaceLockLaws, FIT row `v2Only`, contract A29).
// One even grid at the sparse-end pitch; tone = line weight. Each ruling is baked once per weight step with a tone band (runBand) and the
// step's width (runWeight), so the width follows the light through frame() while dragging with no rebake. Legacy keeps the pose output.

const PEN = 0.3;
const LAW = 'weightModulated';
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: LAW,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', ...o,
});

// Ink as a length at the document pen: a lock line is length x weightScale; the pose compose draws a pen-width RIBBON (a closed outline), whose
// area / pen is its ink length, shared along its perimeter (an open pose line counts its length x weightScale).
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
  return LR.bins(prof, 'L', { n: 10 }).map((x) => (x.cov === null ? 0 : x.cov));
};

describe('surface lock wave D (WD-D3): v2 weightModulated', () => {
  let rt; let V; let SL; let Z; let MS;
  let surf; let pose; let surfPaths;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; Z = V.Scene3D.SurfaceLockLaws; MS = V.Scene3D.SurfaceLockMarkSet;
    const sS = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    SL.clearCache(); SL.resetStats();
    surfPaths = sS.composeFull();
    surf = weighted(sS, surfPaths);
    const sP = LR.buildCase(V, { law: LAW, markSpace: 'pose' });
    pose = weighted(sP, sP.composeFull());
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  it('RED: v2 effectiveMarkSpace is surface; legacy, crosshatch and tripleHatch stay pose', () => {
    const spec = specOf();
    const ctx = (sp) => ({ spec: sp, mapper: sp.mapper, visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
    expect(SL.effectiveMarkSpace(spec.style, ctx(spec))).toBe('surface');
    expect(SL.explainMarkSpace(spec.style, ctx(spec))).toEqual({ mode: 'surface', reason: 'surface' });
    const legacy = specOf(); delete legacy.toneModel;
    expect(SL.effectiveMarkSpace(legacy.style, ctx(legacy))).toBe('pose');
    expect(Z.supports(Object.assign({}, legacy, { toneModel: 'legacy' }))).toBe(false);
    expect(Z.supports(specOf({ mapper: 'contour' }))).toBe(false);
    expect(Z.supports(specOf({ style: { fillDensity: 50, tripleHatch: true } }))).toBe(false);
  });

  it('weights: runs carry a width channel and a tone band; drawn lines carry weightScale that grows toward the dark', () => {
    const ms = Z.bake(specOf());
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.runWeight && ms.runBand).toBeTruthy();
    const fills = surfPaths.filter((p) => p.meta && p.meta.kind === 'sceneFill');
    expect(fills.length).toBeGreaterThan(20);
    const ws = new Set(fills.map((p) => p.meta.weightScale || 1));
    expect(ws.size, 'several distinct widths').toBeGreaterThan(2);
    // darker = heavier: the mean weight of the lines in the darkest third of the sphere exceeds that of the lightest third
    const s = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    const prof = LR.measure(s, { model: 'v2', paths: surfPaths });
    const bins = LR.bins(prof, 'L', { n: 10 });
    expect(bins.length).toBe(10);
    const wOf = (idx) => {
      const sel = new Set(prof.samples.filter((sm, i) => idx(prof.cells.L[i])).map((sm) => `${sm.gx},${sm.gy}`));
      let sum = 0; let n = 0;
      s.fills(surfPaths).forEach((p) => { const m = Math.floor(p.length / 2); const a = p[m]; if (sel.has(`${Math.floor(a.x / prof.cell)},${Math.floor(a.y / prof.cell)}`)) { sum += (p.meta.weightScale || 1); n++; } });
      return n ? sum / n : 0;
    };
    const dark = wOf((I) => I < 0.35); const light = wOf((I) => I > 0.6);
    expect(dark, JSON.stringify({ dark, light })).toBeGreaterThan(light * 1.3);
  });

  it('tone: the width-weighted ink per tone bin stays within ~2x of the pose compose (bin by bin; the lit bins sit near 0.5x: the lock rulings are chart-space and foreshorten, the pose rulings are screen-space) and the total is close', () => {
    const tot = (a) => a.reduce((x, y) => x + y, 0);
    surf.forEach((v, i) => {
      if (pose[i] < 0.03 && v < 0.06) return;
      expect(v / Math.max(1e-6, pose[i]), `bin ${i} ${JSON.stringify({ surf, pose })}`).toBeGreaterThan(0.45);
      expect(v / Math.max(1e-6, pose[i]), `bin ${i}`).toBeLessThan(2);
    });
    expect(tot(surf) / tot(pose)).toBeGreaterThan(0.7);
    expect(tot(surf) / tot(pose)).toBeLessThan(1.33);
  });

  it('through the engine: baked by the surface lock, drag == export (widths included), repeated orbit = 0 bake misses / 0 tone evals; legacy untouched', () => {
    const s = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    SL.clearCache(); SL.resetStats();
    s.composeFull();
    expect(SL.stats.bakes, 'baked by the surface lock').toBeGreaterThan(0);
    expect(SL.stats.bakeErrors).toBe(0);
    dragEqualsExport(s, [{ camYaw: -30, camPitch: 20 }, { camYaw: 80, camPitch: 30, objYaw: 40 }]).forEach((d) => expect(d.equal, JSON.stringify(d.pose)).toBe(true));
    const wSig = (paths) => s.fills(paths).map((p) => `${p.meta.weightScale}`).join(',');
    s.setPose({ camYaw: 50, camPitch: 25 });
    expect(wSig(s.composePreview())).toBe(wSig(s.composeFull()));
    const yaws = [-60, -40, -20, 0, 20, 40, 60];
    LR.orbitCounters(s, yaws);
    const c = LR.orbitCounters(s, yaws, { warm: false });
    expect(c.bakeMisses).toBe(0);
    expect(c.toneEvals).toBe(0);
    const g = LR.buildCase(V, { law: LAW, markSpace: 'surface', tone: { model: 'legacy' } });
    SL.clearCache(); SL.resetStats();
    g.composeFull();
    expect(SL.stats.bakes).toBe(0);
  });

  it('crosshatch bakes its families at the same grid; every run carries a width and a band', () => {
    const ms = Z.bake(specOf({ mapper: 'crosshatch', style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' } }));
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.runCount).toBeGreaterThan(10);
    expect(new Set(ms.runFamily).size).toBe(2);
  });

  it('perf: the bake stays within the vertex budget; the LUT is one flat grid that rolls off to paper; tone OFF is uniform', () => {
    const ms = Z.bake(specOf({ scaleRef: 3 }));
    expect(ms.vertexCount).toBeLessThanOrEqual(120000);
    const lut = Z.toneLUT(specOf({ scaleRef: 3 }), { tone: { enabled: true } }).lut;
    expect(lut[0]).toBeGreaterThan(0);
    expect(Math.abs(lut[Math.floor(lut.length * 0.5)] - lut[0])).toBeLessThan(1e-9);
    expect(lut[lut.length - 1]).toBe(0);
    const off = Z.toneLUT(specOf({ scaleRef: 3 }), { tone: { enabled: false } }).lut;
    expect(off[0]).toBeGreaterThan(0);
    expect(Math.abs(off[off.length - 1] - off[0])).toBeLessThan(1e-9);
  });
});
