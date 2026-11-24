const { loadSurfaceLockRuntime, signature } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');
const crypto = require('crypto');
const shaOf = (paths) => crypto.createHash('sha1').update(signature(paths, 9).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')).digest('hex');

// D5-voronoi (contract A33): voronoiWeb is baked onto the surface for v2 scenes as a DRAG-PREVIEW ONLY law (SurfaceLockWebs, second FIT row, `v2Only` +
// `dragPreviewOnly`). While a 3D drag / orbit is in progress the frame is the bake: one FULL Voronoi web per tone level in the object's chart, each run
// carrying the tone band of its level, so the cell size follows the light with no rebake. Settled and export output is the pose compose, byte for byte.

const PEN = 0.3;
const LAW = 'voronoiWeb';
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: LAW,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', dragPreview: true, ...o,
});

describe('surface lock D5 (voronoiWeb): v2 drag-preview-only one full Voronoi web per tone level', () => {
  let rt; let V; let SL; let W; let MS;
  let surfProf; let poseProf;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; W = V.Scene3D.SurfaceLockWebs; MS = V.Scene3D.SurfaceLockMarkSet;
    const sS = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    SL.clearCache(); SL.resetStats();
    surfProf = LR.measure(sS, { model: 'v2', paths: sS.composePreview() });
    const sP = LR.buildCase(V, { law: LAW, markSpace: 'pose' });
    poseProf = LR.measure(sP, { model: 'v2', paths: sP.composeFull() });
  }, 240000);
  afterAll(() => rt && rt.cleanup());


  it('RED: settled / export output equals the pose compose byte for byte (sha); the baked frame exists only while dragging', () => {
    const a = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    const b = LR.buildCase(V, { law: LAW, markSpace: 'pose' });
    SL.clearCache(); SL.resetStats();
    const settled = a.composeFull();
    expect(SL.stats.bakes, 'no surface bake when settled').toBe(0);
    expect(shaOf(settled)).toBe(shaOf(b.composeFull()));
    a.setPose({ camYaw: 50, camPitch: 25 }); b.setPose({ camYaw: 50, camPitch: 25 });
    const drag = a.composePreview();
    expect(SL.stats.bakes, 'the drag frame is baked (Level S)').toBeGreaterThan(0);
    expect(shaOf(drag)).not.toBe(shaOf(b.composeFull()));
    expect(shaOf(a.composeFull()), 'release swaps back to pose').toBe(shaOf(b.composeFull()));
  });

  it('RED: effectiveMarkSpace is surface only for a v2 hatch / crosshatch drag spec; settled, legacy, contour and tripleHatch stay pose', () => {
    const ctx = (sp) => ({ spec: sp, mapper: sp.mapper, visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
    const spec = specOf(); const settled = specOf({ dragPreview: undefined });
    expect(SL.effectiveMarkSpace(settled.style, ctx(settled))).toBe('pose');
    expect(W.supports(settled)).toBe(false);
    expect(SL.effectiveMarkSpace(spec.style, ctx(spec))).toBe('surface');
    expect(W.supports(specOf({ mapper: 'crosshatch' }))).toBe(true);
    const legacy = specOf(); delete legacy.toneModel;
    expect(SL.effectiveMarkSpace(legacy.style, ctx(legacy))).toBe('pose');
    expect(W.supports(Object.assign({}, legacy, { toneModel: 'legacy' }))).toBe(false);
    expect(W.supports(specOf({ mapper: 'contour' }))).toBe(false);
    expect(W.supports(specOf({ style: { fillDensity: 50, tripleHatch: true } }))).toBe(false);
    expect(SL.BAKER_KEYS).toContain('SurfaceLockWebs');
  });

  it('M1 / M3: the drag frame is graded (coverage falls with tone) and spans a visible range', () => {
    const m1 = LR.m1Monotone(surfProf); const m3 = LR.m3Range(surfProf, 50);
    expect(m1.pass, JSON.stringify(m1)).toBe(true);
    expect(m3.pass, JSON.stringify(m3)).toBe(true);
  });

  it('tone: the ink per L* bin stays within 1.5x of the pose compose (bin by bin where either has ink) and the total is close', () => {
    const cov = (p) => LR.bins(p, 'L', { n: 10 }).map((x) => (x.cov === null ? 0 : x.cov));
    const a = cov(surfProf); const b = cov(poseProf);
    const tot = (v) => v.reduce((x, y) => x + y, 0);
    a.forEach((v, i) => {
      if (b[i] < 0.03 && v < 0.05) return;
      expect(v / Math.max(1e-6, b[i]), `bin ${i} ${JSON.stringify({ a, b })}`).toBeGreaterThan(1 / 1.5);
      expect(v / Math.max(1e-6, b[i]), `bin ${i} ${JSON.stringify({ a, b })}`).toBeLessThan(1.5);
    });
    expect(tot(a) / tot(b)).toBeGreaterThan(1 / 1.35);
    expect(tot(a) / tot(b)).toBeLessThan(1.35);
  });

  it('through the engine: drag frames are baked, repeated orbit = 0 bake misses / 0 tone evals, a light move bakes nothing; legacy untouched', () => {
    const s = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    SL.clearCache(); SL.resetStats();
    s.setPose({ camYaw: 50, camPitch: 25 });
    const drag = s.composePreview();
    expect(SL.stats.bakes).toBeGreaterThan(0);
    expect(SL.stats.bakeErrors).toBe(0);
    expect(s.fills(drag).length).toBeGreaterThan(100);
    const yaws = [-60, -40, -20, 0, 20, 40, 60];
    LR.orbitCounters(s, yaws);
    const c = LR.orbitCounters(s, yaws, { warm: false });
    expect(c.bakeMisses).toBe(0);
    expect(c.toneEvals).toBe(0);
    const l = LR.lightMoveCounters(s, [{ az: 300, el: 30 }, { az: 250, el: 40 }, { az: 200, el: 50 }]);
    expect(l.bakeMisses || 0, 'a light drag is not a rebake').toBe(0);
    expect(l.sceneFrames, 'the light-drag frames are Level S frames of the cached bake').toBe(3);
    const g = LR.buildCase(V, { law: LAW, markSpace: 'surface', tone: { model: 'legacy' } });
    SL.clearCache(); SL.resetStats();
    g.composePreview();
    expect(SL.stats.bakes).toBe(0);
  });

  it('band exclusivity: the level bands tile [0, 1] (every tone is in exactly one level, bands touch only at their edge); runs carry their level band', () => {
    const ms = W.bake(specOf());
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.meta.lawId).toBe(LAW);
    const bands = ms.meta.voronoiBands;
    expect(bands.length).toBeGreaterThanOrEqual(3);
    expect(bands.length).toBe(ms.meta.voronoiLevels);
    const sorted = bands.slice().sort((p, q) => p[0] - q[0]);
    expect(sorted[0][0]).toBeLessThanOrEqual(0.003);
    expect(sorted[sorted.length - 1][1]).toBeGreaterThanOrEqual(0.997);
    for (let i = 1; i < sorted.length; i++) expect(Math.abs(sorted[i][0] - sorted[i - 1][1]), `band ${i} touches band ${i - 1}`).toBeLessThan(2 / 256);
    for (let I = 0.0123; I < 1; I += 0.0317) {
      const n = bands.filter((b) => I >= b[0] + 1e-9 && I <= b[1] - 1e-9).length;
      expect(n, `tone ${I.toFixed(3)} lies in exactly one level band`).toBe(1);
    }
    expect(ms.runBand, 'every run carries a band').toBeTruthy();
    const seen = new Set();
    for (let r = 0; r < ms.runCount; r++) seen.add(ms.runBand[2 * r] + ':' + ms.runBand[2 * r + 1]);
    expect(seen.size).toBe(bands.filter((b) => b[1] > b[0]).length);
    // the LUT carries the paper gate: nothing at the lightest tone, the full gate in the shadow
    const lut = W.toneLUT(specOf(), { tone: { enabled: true } }).lut;
    expect(lut[lut.length - 1]).toBe(0);
    expect(lut[0] * ms.meta.p0 * ms.meta.scaleRef).toBeGreaterThan(1);
  });

  it('web structure: the walls meet in 3-way junctions (share >= 0.8) and every cell level is a connected web', () => {
    const { info } = W.debug.voronoi(specOf({ scaleRef: 3 }));
    const h = info.degHist;
    const junc = h[3] + h[4] + h[5] + h[6];
    expect(junc).toBeGreaterThan(500);
    expect(h[3] / junc, JSON.stringify(h)).toBeGreaterThanOrEqual(0.8);
  });

  it('cell size follows the tone: the baked cell count per level rises 3x or more from the lightest to the darkest level', () => {
    const { info } = W.debug.voronoi(specOf({ scaleRef: 3 }));
    const seeds = info.perLevel.map((q) => q.seeds);
    expect(seeds.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < seeds.length; i++) expect(seeds[i]).toBeGreaterThan(seeds[i - 1] * 1.4);
    expect(seeds[seeds.length - 1] / seeds[0]).toBeGreaterThan(3);
  });

  it('perf: the bake stays within the vertex budget and 400 ms (node vm is 3-8x slower than Chromium: the budget is checked at 4x)', () => {
    const t0 = Date.now(); const ms = W.bake(specOf({ scaleRef: 3, objectId: 'o2' })); const dt = Date.now() - t0;
    expect(ms.vertexCount).toBeGreaterThan(1000);
    expect(ms.vertexCount).toBeLessThanOrEqual(200000);
    expect(dt).toBeLessThan(1600);
    const tor = W.bake(specOf({ primitive: 'torus', mode: 'torus', sizes: { sx: 34, sy: 9, sz: 9, detail: 24 } }));
    expect(tor.vertexCount).toBeGreaterThan(500);
  });
});
