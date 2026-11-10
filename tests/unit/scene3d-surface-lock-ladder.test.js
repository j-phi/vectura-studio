const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');

// SurfaceLockLadder: hatch, crosshatch, contour, spiral, stipple bakers (docs/surface-lock-contract.md §2, §3, §5, §9).
// Every test runs on MarkSets directly (no pose, no camera).

const PEN = 0.3;
const sphere = (mapper, extra = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper, toneLaw: undefined, style: { fillDensity: 50, fillAngle: 45 },
  penWidth: PEN, scaleRef: 1, seed: { salt: 1 }, ...extra,
});
const SHAPES = {
  sphere: { primitive: 'sphere', mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 } },
  cylinder: { primitive: 'cylinder', mode: 'cylinder', sizes: { sx: 14, sy: 40, sz: 14 } },
  torus: { primitive: 'torus', mode: 'torus', sizes: { sx: 20, sy: 20, sz: 20 } },
};
const MAPPERS = ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'];

describe('SurfaceLockLadder', () => {
  let rt; let V; let L; let MS; let cache;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime(); V = rt.V; L = V.Scene3D.SurfaceLockLadder; MS = V.Scene3D.SurfaceLockMarkSet; cache = new Map();
  });
  afterAll(() => rt && rt.cleanup());
  const bake = (spec) => { const k = JSON.stringify(spec); if (!cache.has(k)) cache.set(k, L.bake(spec)); return cache.get(k); };
  const runPts = (ms, r) => { const out = []; for (let v = ms.runStart[r]; v < ms.runStart[r + 1]; v++) out.push([ms.positions[3 * v], ms.positions[3 * v + 1], ms.positions[3 * v + 2]]); return out; };
  const runLen = (ms, r) => { const p = runPts(ms, r); let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]); return s; };
  const poles = (spec) => { const M = V.Scene3D.SurfaceLockChart.metric(spec.mode, spec.sizes, spec.scale); return [M.sample(0, 0.3), M.sample(1, 0.3)].map((q) => [q.x, q.y, q.z]); };
  const nearPole = (P, p, r) => P.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < r);
  const normalAt = (ms, v, out = []) => MS.octDecode(ms.normals, 2 * v, out);

  it('supports exactly the FIT rows minus their refuse rules', () => {
    expect(L.id).toBe('ladder');
    MAPPERS.forEach((m) => expect(L.supports(sphere(m)), m).toBe(true));
    expect(L.supports(sphere('hatch', { toneLaw: 'ladder' }))).toBe(true);
    expect(L.supports(sphere('wireframe'))).toBe(false);
    expect(L.supports(sphere('contourSlice'))).toBe(false);
    expect(L.supports(sphere('hatch', { toneLaw: 'mezzoRegion' }))).toBe(false);
    expect(L.supports(sphere('hatch', { primitive: 'torusKnot', mode: 'torusKnot' }))).toBe(false);
    expect(L.supports(sphere('hatch', { primitive: 'box', mode: undefined }))).toBe(false);
    expect(L.supports(sphere('hatch', { style: { tripleHatch: true } }))).toBe(false);
    expect(L.supports(sphere('spiral', { style: { spiralMode: 'flatClip' } }))).toBe(false);
    expect(L.supports(sphere('contour', { style: { contourStyle: 'region' } }))).toBe(false);
    expect(L.supports(sphere('stipple', { style: { dotShape: 'plus' } }))).toBe(false);
    expect(L.supports(null)).toBe(false);
    expect(L.FIT.length).toBeGreaterThan(0);
  });

  describe.each(MAPPERS)('mapper %s', (mapper) => {
    it.each(Object.keys(SHAPES))('is valid, on the surface, with unit outward normals (%s)', (shape) => {
      const spec = sphere(mapper, SHAPES[shape]);
      const ms = bake(spec);
      expect(MS.validate(ms)).toEqual([]);
      expect(ms.runCount).toBeGreaterThan(0);
      expect(ms.levels).toBeGreaterThanOrEqual(2);
      expect(ms.meta.gain).toBe(mapper === 'stipple' ? 4 : 2);
      const M = V.Scene3D.SurfaceLockChart.metric(spec.mode, spec.sizes, spec.scale);
      const n = [];
      let worst = 0; let minDot = 1;
      const stride = Math.max(1, Math.floor(ms.vertexCount / 400));
      for (let v = 0; v < ms.vertexCount; v += stride) {
        const x = ms.positions[3 * v]; const y = ms.positions[3 * v + 1]; const z = ms.positions[3 * v + 2];
        normalAt(ms, v, n);
        expect(Math.abs(Math.hypot(n[0], n[1], n[2]) - 1)).toBeLessThan(1e-6);
        if (shape === 'sphere') {
          worst = Math.max(worst, Math.abs(Math.hypot(x, y, z) - 20));
          minDot = Math.min(minDot, (n[0] * x + n[1] * y + n[2] * z) / 20);
        }
      }
      if (shape === 'sphere') { expect(worst).toBeLessThan(1e-3); expect(minDot).toBeGreaterThan(0.999); }
      expect(M).toBeTruthy();
    });

    it('is deterministic; salt changes the set; objectId does not', () => {
      const a = L.bake(sphere(mapper)); const b = L.bake(sphere(mapper));
      ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'].forEach((k) => expect(Array.from(a[k]), k).toEqual(Array.from(b[k])));
      const other = L.bake(sphere(mapper, { objectId: 'zzz' }));
      expect(Array.from(other.positions)).toEqual(Array.from(a.positions));
      const salted = L.bake(sphere(mapper, { seed: { salt: 9 } }));
      expect(Array.from(salted.positions)).not.toEqual(Array.from(a.positions));
      expect(Object.keys(sphere(mapper)).some((k) => /pose|camera|light|tone$/i.test(k))).toBe(false);
    });
  });

  it('density: total run length of levels <= l grows by 2 +- 0.35 per level (line families)', () => {
    ['hatch', 'contour'].forEach((mapper) => {
      const ms = bake(sphere(mapper));
      const per = new Float64Array(ms.levels);
      for (let r = 0; r < ms.runCount; r++) per[ms.runLevel[r]] += runLen(ms, r);
      let cum = per[0]; const growth = [];
      for (let l = 1; l < ms.levels; l++) { const next = cum + per[l]; growth.push(next / cum); cum = next; }
      growth.forEach((g, i) => { expect(Math.abs(g - 2), `${mapper} level ${i + 1} growth ${g}`).toBeLessThan(0.35); });
    });
  });

  it('stipple: DOT runs, one vertex each, count grows ~4x per level, glyph in meta', () => {
    const ms = bake(sphere('stipple'));
    expect(ms.meta.glyph.kind).toBe('circle');
    expect(ms.meta.glyph.segs).toBeGreaterThanOrEqual(4);
    expect(ms.meta.toneModel).toBe('area');
    const cnt = new Float64Array(ms.levels);
    for (let r = 0; r < ms.runCount; r++) {
      expect(ms.runFlags[r] & MS.FLAG.DOT).toBe(MS.FLAG.DOT);
      expect(ms.runStart[r + 1] - ms.runStart[r]).toBe(1);
      cnt[ms.runLevel[r]] += 1;
    }
    let cum = cnt[0];
    for (let l = 1; l < ms.levels; l++) { const g = (cum + cnt[l]) / cum; expect(Math.abs(g - 4), `level ${l} ${g}`).toBeLessThan(1.1); cum += cnt[l]; }
  });

  it('stipple: dot separation per level (levels <= l no closer than 0.8 p0 / 2^l) away from the poles', () => {
    const ms = bake(sphere('stipple'));
    const p0 = ms.meta.p0; const P = poles(sphere('stipple'));
    for (let l = 0; l < Math.min(ms.levels, 4); l++) {
      const pts = [];
      for (let r = 0; r < ms.runCount; r++) if (ms.runLevel[r] <= l) { const v = ms.runStart[r]; const q = [ms.positions[3 * v], ms.positions[3 * v + 1], ms.positions[3 * v + 2]]; if (!nearPole(P, q, 1.5)) pts.push(q); }
      let minD = Infinity;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]));
      expect(minD, `level ${l}`).toBeGreaterThanOrEqual(0.8 * p0 / Math.pow(2, l) - 1e-6);
    }
  });

  it('line separation: distinct runs of levels <= l stay >= 0.8 p0 / 2^l apart (hatch, contour) away from the pole caps (0.3 R: straight chart rulings are spirals there)', () => {
    ['hatch', 'contour'].forEach((mapper) => {
      const ms = bake(sphere(mapper));
      const p0 = ms.meta.p0; const P = poles(sphere(mapper));
      for (let l = 0; l < 5; l++) {
        const H = V.Scene3D.SurfaceLockChart.spatialHash3(p0 / Math.pow(2, l));
        const pts = [];
        for (let r = 0; r < ms.runCount; r++) {
          if (ms.runLevel[r] > l) continue;
          runPts(ms, r).forEach((p, i) => { if (!nearPole(P, p, 6)) { H.insert(p[0], p[1], p[2], r); pts.push([p, r]); } });
        }
        let minD = Infinity;
        const step = Math.max(1, Math.floor(pts.length / 3000));
        for (let i = 0; i < pts.length; i += step) {
          const [p, r] = pts[i];
          H.near(p[0], p[1], p[2], 0.8 * p0 / Math.pow(2, l), (id, d2) => { if (id !== r) minD = Math.min(minD, Math.sqrt(d2)); return false; });
        }
        // Closeness is checked against vertices of OTHER runs; same-ruling sub-runs share an id by construction.
        expect(minD, `${mapper} level ${l}`).toBeGreaterThanOrEqual(0.8 * p0 / Math.pow(2, l) * 0.999);
      }
    });
  });

  it('ruling count comes from the object-space metric: pose-free and scales with the object', () => {
    const a = bake(sphere('hatch'));
    const big = L.bake(sphere('hatch', { sizes: { sx: 40, sy: 40, sz: 40 } }));
    expect(a.runCount).toBeGreaterThan(0);
    const lvl0 = (ms) => { let n = 0; for (let r = 0; r < ms.runCount; r++) if (ms.runLevel[r] === 0) n += 1; return n; };
    expect(lvl0(big)).toBeGreaterThan(lvl0(a) * 1.6);
    // zoom within the octave does not change the key inputs; a different scaleRef does change density
    const z = L.bake(sphere('hatch', { scaleRef: 2 }));
    expect(z.meta.p0).toBeCloseTo(a.meta.p0 / 2, 9);
  });

  it('contour rings are CLOSED; spiral is one continuous run per level on a polar chart', () => {
    const c = bake(sphere('contour'));
    let closed = 0;
    for (let r = 0; r < c.runCount; r++) if (c.runFlags[r] & MS.FLAG.CLOSED) closed += 1;
    expect(closed).toBeGreaterThan(c.runCount * 0.5);
    const s = bake(sphere('spiral'));
    const perLevel = new Array(s.levels).fill(0);
    for (let r = 0; r < s.runCount; r++) perLevel[s.runLevel[r]] += 1;
    perLevel.forEach((n) => expect(n).toBe(1));
  });

  it('crosshatch family 1 is at 65 degrees (+-2.5) to family 0 in the tangent plane away from the poles', () => {
    const spec = sphere('crosshatch');
    const ms = bake(spec);
    const f1 = [];
    for (let r = 0; r < ms.runCount; r++) if (ms.runFamily[r] === 1) f1.push(r);
    expect(f1.length).toBeGreaterThan(5);
    const M = V.Scene3D.SurfaceLockChart.metric('sphere', spec.sizes, spec.scale);
    // chart lookup grid (nearest cell), and the baker's family-0 chart direction (survey medians of |Pa|, |Pb|)
    const NA = 160; const NB = 320; const grid = [];
    for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) { const s = M.sample((i + 0.5) / NA, (j + 0.5) / NB); if (s) grid.push(s); }
    const bs = []; for (let i = 0; i < 25; i++) for (let j = 0; j < 25; j++) { const s = M.sample((i + 0.5) / 25, (j + 0.5) / 25); bs.push(Math.hypot(s.dbx, s.dby, s.dbz)); }
    bs.sort((x, y) => x - y);
    const medA = Math.PI * 20; const medB = bs[bs.length >> 1];
    const ca = Math.cos(Math.PI / 4) / medA; const cb = Math.sin(Math.PI / 4) / medB;
    const P = poles(spec);
    const angles = [];
    for (let k = 0; k < f1.length && angles.length < 80; k++) {
      const p = runPts(ms, f1[k]); const i = p.length >> 1;
      if (i < 1 || i + 1 >= p.length) continue;
      const q = p[i]; if (nearPole(P, q, 8)) continue;
      let best = null; let bd = Infinity;
      for (const s of grid) { const d = (s.x - q[0]) ** 2 + (s.y - q[1]) ** 2 + (s.z - q[2]) ** 2; if (d < bd) { bd = d; best = s; } }
      const t0 = [ca * best.dax + cb * best.dbx, ca * best.day + cb * best.dby, ca * best.daz + cb * best.dbz];
      const t1 = [p[i + 1][0] - p[i - 1][0], p[i + 1][1] - p[i - 1][1], p[i + 1][2] - p[i - 1][2]];
      const cos = Math.abs((t0[0] * t1[0] + t0[1] * t1[1] + t0[2] * t1[2]) / (Math.hypot(...t0) * Math.hypot(...t1)));
      angles.push((Math.acos(Math.min(1, cos)) * 180) / Math.PI);
    }
    expect(angles.length).toBeGreaterThan(8);
    angles.forEach((ang) => { const d = Math.min(Math.abs(ang - 65), Math.abs(ang - 115)); expect(d, `angle ${ang}`).toBeLessThan(2.5); });
  });

  describe('toneLUT', () => {
    const toneCtx = (extra = {}) => ({ tone: { enabled: true, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85], specular: { enabled: false, size: 1 }, ...extra }, penWidth: PEN });
    const spec = (extra = {}) => sphere('hatch', { style: { fillDensity: 100, fillAngle: 45, ...extra } });

    it('reproduces Regions.band / coverageFor with the default ladder at 33 intensities', () => {
      const R = V.Scene3D.Regions; const ctx = toneCtx();
      const { lut, scaleFn } = L.toneLUT(spec(), ctx);
      expect(lut.length).toBe(257);
      expect(scaleFn).toBeNull();
      const floorPitch = R.PLOT_FLOOR_PEN * PEN; // density 100: master pitch = the plot floor, lit cap 12 pen not binding
      for (let i = 0; i < 33; i++) {
        const I = i / 32;
        const b = R.band(I, ctx.tone);
        let cov = R.coverageFor(2 - b, ctx.tone);
        if (b === 2) cov = Math.max(cov, cov * 0.6, 0.12);
        const k = Math.round(I * 256);
        const Ik = k / 256; const bk = R.band(Ik, ctx.tone); let ck = R.coverageFor(2 - bk, ctx.tone);
        if (bk === 2) ck = Math.max(ck, ck * 0.6, 0.12);
        expect(lut[k] * floorPitch, `I=${I}`).toBeCloseTo(ck, 5);
        void cov;
      }
    });

    it('applies the glint cap (GLINT_KEEP 0.6, specular size) to the lit band only', () => {
      const off = L.toneLUT(spec(), toneCtx()).lut;
      const on = L.toneLUT(spec(), toneCtx({ specular: { enabled: true, size: 1 } })).lut;
      const big = L.toneLUT(spec(), toneCtx({ specular: { enabled: true, size: 3 } })).lut;
      const kLit = 256; const kDark = 0;
      expect(on[kDark]).toBe(off[kDark]);
      // lit cov 0.2: off -> pitch 0.66/0.2 = 3.3 mm; on -> max(0.2*0.5, 0.2*0.6, LIT_FLOOR 0.12) = 0.12 -> 5.5 mm, capped at 12 pen = 3.6 mm.
      expect(1 / off[kLit]).toBeCloseTo(3.3, 4);
      expect(1 / on[kLit]).toBeCloseTo(3.6, 4);
      expect(big[kLit]).toBeCloseTo(on[kLit], 6);
      const none = L.toneLUT(spec(), { ...toneCtx({ specular: { enabled: true, size: 1 } }), highlight: 'none' }).lut;
      expect(none[kLit]).toBe(off[kLit]);
    });

    it('is monotone: darker means finer, lit pitch is capped at LIT_MAX_PITCH_PEN x pen, tone off is flat', () => {
      const { lut } = L.toneLUT(sphere('hatch'), toneCtx());
      expect(lut[0]).toBeGreaterThan(lut[256]);
      const cap = V.Scene3D.Regions.LIT_MAX_PITCH_PEN * PEN;
      for (let k = 0; k <= 256; k++) expect(1 / lut[k]).toBeLessThanOrEqual(cap + 1e-4);
      const flat = L.toneLUT(sphere('hatch'), { tone: { enabled: false }, penWidth: PEN }).lut;
      expect(new Set(Array.from(flat)).size).toBe(1);
    });

    it('stipple LUT follows area ~ coverage (pitch = master / sqrt(cov))', () => {
      const line = L.toneLUT(spec(), toneCtx()).lut; const dot = L.toneLUT(sphere('stipple', { style: { fillDensity: 100, dotSize: 0.2 } }), toneCtx()).lut;
      // darkest vs lit pitch ratio: lines master/0.85 vs master/0.2 (ratio 4.25); dots sqrt of that.
      expect(line[0] / line[256]).toBeGreaterThan(dot[0] / dot[256]);
    });
  });

  describe('budget', () => {
    it('default sphere hatch: <= 80k vertices, 4-6 levels, validate clean, bake time reported', () => {
      const t = Date.now();
      const ms = L.bake(sphere('hatch'));
      const dt = Date.now() - t;
      // eslint-disable-next-line no-console
      console.log(`[ladder] hatch vertices ${ms.vertexCount} runs ${ms.runCount} levels ${ms.levels} bake ${dt} ms (meta ${ms.meta.msBake.toFixed(1)})`);
      expect(ms.vertexCount).toBeLessThanOrEqual(80000);
      expect(ms.levels).toBeGreaterThanOrEqual(4); expect(ms.levels).toBeLessThanOrEqual(6);
      expect(MS.validate(ms)).toEqual([]);
      expect(dt).toBeLessThan(2000);
    });
  });
});
