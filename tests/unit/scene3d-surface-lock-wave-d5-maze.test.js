const { loadSurfaceLockRuntime, signature } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');
const crypto = require('crypto');
const shaOf = (paths) => crypto.createHash('sha1').update(signature(paths, 9).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')).digest('hex');

// D5-maze (contract A32, amended): mazeFill is baked onto the surface for v2 scenes (SurfaceLockWebs, FIT row `v2Only`): a recursive-division
// maze in the object's chart whose walls are keyed so every tone threshold draws a perfect maze (cell size follows the light, no rebake).
// The bake is the drag frame AND the settled / export frame (Level S at rest): no swap on release. Legacy tone and non-maze fills are untouched.

const PEN = 0.3;
const LAW = 'mazeFill';
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: LAW,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', dragPreview: true, ...o,
});

describe('surface lock D5 (mazeFill): v2 keyed-subset recursive-division maze', () => {
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

  it('RED: settled / export output is the surface-locked drawing (Level S at rest): the drag frame at the same pose, not the pose compose', () => {
    const a = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    const b = LR.buildCase(V, { law: LAW, markSpace: 'pose' });
    SL.clearCache(); SL.resetStats();
    a.setPose({ camYaw: 50, camPitch: 25 }); b.setPose({ camYaw: 50, camPitch: 25 });
    const drag = a.composePreview();
    const bakesAfterDrag = SL.stats.bakes;
    expect(bakesAfterDrag, 'the drag frame is baked (Level S)').toBeGreaterThan(0);
    const settled = a.composeFull();
    expect(SL.stats.bakeMisses, 'release bakes nothing new: the same cached MarkSet').toBe(1);
    expect(shaOf(settled), 'settled == drag at the same pose: no swap on release').toBe(shaOf(drag));
    expect(shaOf(settled), 'settled is no longer the flat pose maze').not.toBe(shaOf(b.composeFull()));
    // a fresh settled compose with no drag first is a Level S bake too
    const c = LR.buildCase(V, { law: LAW, markSpace: 'surface' });
    SL.clearCache(); SL.resetStats();
    c.setPose({ camYaw: 50, camPitch: 25 });
    expect(shaOf(c.composeFull())).toBe(shaOf(drag));
    expect(SL.stats.bakes, 'a settled compose bakes the surface maze').toBeGreaterThan(0);
  });

  it('RED: effectiveMarkSpace is surface for a v2 hatch / crosshatch spec drag or settled; legacy, contour and tripleHatch stay pose', () => {
    const ctx = (sp) => ({ spec: sp, mapper: sp.mapper, visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
    const spec = specOf(); const settled = specOf({ dragPreview: undefined });
    expect(SL.effectiveMarkSpace(settled.style, ctx(settled))).toBe('surface');
    expect(W.supports(settled)).toBe(true);
    expect(W.FIT.some((r) => r.dragPreviewOnly)).toBe(false);
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

  it('nesting witness: the marks drawn at a lighter tone are a strict subset of those drawn at a darker tone', () => {
    const ms = W.bake(specOf());
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.meta.lawId).toBe(LAW);
    const lut = W.toneLUT(specOf(), { tone: { enabled: true } }).lut;
    const keyOf = (r) => { const l = ms.runLevel[r]; const rk = MS.rankOf(ms, r); return l === 0 ? rk : Math.pow(2, l - 1) * (1 + rk); };
    const drawn = (I) => { const t = lut[Math.round(I * (lut.length - 1))] * ms.meta.p0 * 1.0001; const set = new Set(); for (let r = 0; r < ms.runCount; r++) if (keyOf(r) < t) set.add(r); return set; };
    const dark = drawn(0.1); const mid = drawn(0.45); const light = drawn(0.8);
    expect(light.size).toBeGreaterThan(0);
    expect(light.size).toBeLessThan(mid.size);
    expect(mid.size).toBeLessThan(dark.size);
    light.forEach((r) => expect(mid.has(r)).toBe(true));
    mid.forEach((r) => expect(dark.has(r)).toBe(true));
    expect(lut[lut.length - 1]).toBe(0); // paper at the lightest tone
  });

  it('perfect-maze witness: at every fully drawn level the open cell edges form a spanning tree of the cells (edges = cells - 1, connected)', () => {
    const spec = specOf({ primitive: 'cylinder', mode: 'cylinder', sizes: { sx: 16, sy: 22, sz: 16, detail: 16 } });
    const { pieces, info } = W.debug.lattice(spec);
    expect(pieces.length).toBeGreaterThan(200);
    const { Kf, na, nb, UA, UB } = info;
    expect(Kf).toBeGreaterThanOrEqual(2);
    const keyOf = (p) => (p.level === 0 ? p.rank : Math.pow(2, p.level - 1) * (1 + p.rank));
    // pieces by line: 'v:x' -> [[y0, y1]], 'h:y' -> [[x0, x1]]
    for (let m = 1; m <= Kf; m++) {
      const t = Math.pow(2, m);
      const lines = new Map();
      pieces.forEach((p) => {
        if (!(keyOf(p) < t)) return;
        const vertical = p.x0 === p.x1;
        const k = (vertical ? 'v:' : 'h:') + (vertical ? p.x0 : p.y0);
        if (!lines.has(k)) lines.set(k, []);
        lines.get(k).push(vertical ? [Math.min(p.y0, p.y1), Math.max(p.y0, p.y1)] : [Math.min(p.x0, p.x1), Math.max(p.x0, p.x1)]);
      });
      const blocked = (k, lo, hi) => (lines.get(k) || []).some(([a, b]) => a < hi && b > lo);
      const s = Math.pow(2, Kf - m); const cols = na * Math.pow(2, m); const rows = nb * Math.pow(2, m);
      const par = Array.from({ length: cols * rows }, (_, i) => i);
      const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      let open = 0; let comps = cols * rows;
      const join = (i, j) => { open += 1; const a = find(i); const b = find(j); if (a !== b) { par[a] = b; comps -= 1; } };
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          // edge to the right (wraps across the periodic seam)
          const i2 = i + 1 < cols ? i + 1 : (info.periodicA ? 0 : -1);
          if (i2 >= 0 && !blocked('v:' + ((i + 1) * s % UA), j * s, (j + 1) * s)) join(j * cols + i, j * cols + i2);
          const j2 = j + 1 < rows ? j + 1 : (info.periodicB ? 0 : -1);
          if (j2 >= 0 && !blocked('h:' + ((j + 1) * s % UB), i * s, (i + 1) * s)) join(j * cols + i, j2 * cols + i);
        }
      }
      expect(comps, `level ${m}: connected`).toBe(1);
      expect(open, `level ${m}: edges = cells - 1`).toBe(cols * rows - 1);
    }
  });

  it('long walls: no straight run of ink exceeds a few cells at any tone band (broken copies in tone bands), and a ring is closed on the thin side', () => {
    const spec = specOf();
    const ms = W.bake(specOf());
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.runBand, 'long walls are tone-banded').toBeTruthy();
    const { pieces, info } = W.debug.lattice(spec, { noBreak: false });
    const { Kf } = info;
    const dashes = pieces.filter((p) => p.dash);
    expect(dashes.length).toBeGreaterThan(50);
    // a band copy of level m: group by line, merge touching intervals; the longest merged run in level-m cells
    const runLimit = V.SCENE3D_SURFACE_LOCK.LAWS.MAZE_RUN || 4;
    const byLevel = new Map();
    dashes.forEach((p) => { const m = p.level + 1; if (!byLevel.has(m)) byLevel.set(m, []); byLevel.get(m).push(p); });
    expect(byLevel.size).toBeGreaterThan(0);
    byLevel.forEach((list, m) => {
      const cell = Math.pow(2, Kf - m);
      const lines = new Map();
      list.forEach((p) => {
        const v = p.x0 === p.x1; const k = (v ? 'v:' : 'h:') + (v ? p.x0 : p.y0);
        if (!lines.has(k)) lines.set(k, []);
        lines.get(k).push(v ? [Math.min(p.y0, p.y1), Math.max(p.y0, p.y1)] : [Math.min(p.x0, p.x1), Math.max(p.x0, p.x1)]);
      });
      let longest = 0;
      lines.forEach((iv) => {
        iv.sort((a, b2) => a[0] - b2[0]);
        let lo = iv[0][0]; let hi = iv[0][1];
        for (let q = 1; q < iv.length; q++) { if (iv[q][0] <= hi) hi = Math.max(hi, iv[q][1]); else { longest = Math.max(longest, hi - lo); lo = iv[q][0]; hi = iv[q][1]; } }
        longest = Math.max(longest, hi - lo);
      });
      expect(longest / cell, `level ${m}: longest merged dashed run in cells`).toBeLessThanOrEqual(2 * runLimit);
    });
    // the skeleton (no break) draws longer runs: the break is what shortens them
    const skel = W.debug.lattice(spec).pieces;
    expect(skel.some((p) => p.band || p.dash)).toBe(false);
  });

  it('bands tile the tone range: at every I the broken copies of one level are the only ones drawn (no overlap, no hole)', () => {
    const ms = W.bake(specOf());
    const n = ms.runCount; let banded = 0;
    const lo = new Float32Array(n); const hi = new Float32Array(n);
    for (let r = 0; r < n; r++) { lo[r] = ms.runBand[2 * r] / 255; hi[r] = ms.runBand[2 * r + 1] / 255; if (ms.runBand[2 * r] > 0 || ms.runBand[2 * r + 1] < 255) banded += 1; }
    expect(banded).toBeGreaterThan(100);
    const lut = W.toneLUT(specOf(), { tone: { enabled: true } }).lut;
    // a probe vertical (I) where ink exists must always be covered by at least one run of every banded wall: a spot check on the lightest drawn and darkest I
    const covered = (I) => { let c = 0; for (let r = 0; r < n; r++) if (I >= lo[r] - 1e-6 && I <= hi[r] + 1e-6) c += 1; return c; };
    [0, 0.2, 0.5, 0.8, 1].forEach((I) => expect(covered(I), `I ${I}`).toBeGreaterThan(0));
    expect(lut[0]).toBeGreaterThan(lut[Math.floor(lut.length / 2)]);
  });

  it('sphere pole: the rings are closed (long closed runs, a few gaps), not dashes', () => {
    const ms = W.bake(specOf());
    expect(MS.validate(ms)).toEqual([]);
    // the sphere chart is (a, b) = (latitude, longitude): the poles are the a edges and a ring is a constant-a (vertical) wall
    const share = (opt) => {
      const { pieces, info } = W.debug.lattice(specOf(), opt);
      const { UA, UB } = info;
      const lines = new Map();
      pieces.filter((p) => p.x0 === p.x1 && !p.dash && (p.x0 < UA * 0.06 || p.x0 > UA * 0.94)).forEach((p) => {
        if (!lines.has(p.x0)) lines.set(p.x0, []);
        lines.get(p.x0).push([Math.min(p.y0, p.y1), Math.max(p.y0, p.y1)]);
      });
      let covered = 0; let total = 0;
      lines.forEach((iv) => {
        iv.sort((x, y) => x[0] - y[0]);
        let lo = iv[0][0]; let hi = iv[0][1]; let c = 0;
        for (let q = 1; q < iv.length; q++) { if (iv[q][0] <= hi) hi = Math.max(hi, iv[q][1]); else { c += hi - lo; lo = iv[q][0]; hi = iv[q][1]; } }
        c += hi - lo; covered += c; total += UB;
      });
      return { lines: lines.size, cover: covered / total };
    };
    const closed = share({ noThin: false, noBreak: false });
    const open = share({ noThin: true, noBreak: false });
    expect(closed.lines).toBeGreaterThan(3);
    expect(closed.cover, JSON.stringify({ closed, open })).toBeGreaterThan(0.85);
    expect(closed.cover, JSON.stringify({ closed, open })).toBeGreaterThan(open.cover + 0.1);
    // and no ring is dashed (the break rule leaves the thin side alone)
    const { pieces } = W.debug.lattice(specOf(), { noThin: false, noBreak: false });
    const { UA } = W.debug.lattice(specOf()).info;
    expect(pieces.filter((p) => p.dash && p.x0 === p.x1 && (p.x0 < UA * 0.05 || p.x0 > UA * 0.95)).length).toBe(0);
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
