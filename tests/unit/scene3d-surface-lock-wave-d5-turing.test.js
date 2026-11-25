const { loadSurfaceLockRuntime, signature, dragEqualsExport } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');
const crypto = require('crypto');
const shaOf = (paths) => crypto.createHash('sha1').update(signature(paths, 9).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')).digest('hex');

// D5-turing (contract A35): turingStripe is baked onto the surface for v2 scenes as Level S at rest (SurfaceLockWebs, third FIT row, `v2Only`):
// the stripe field is a function of the SURFACE (a sum of plane waves of the object's own 3D position, zero-crossings traced on the chart /
// the box faces), baked once like a texture; the tone gate thins pieces of stripe by rank. No swap on release, export == settled.

const PEN = 0.3;
const LAW = 'turingStripe';
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: LAW,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', dragPreview: true, ...o,
});
const boxSpec = (o = {}) => specOf({ primitive: 'box', mode: 'faceted', sizes: { sx: 20, sy: 14, sz: 10 }, detail: undefined, ...o });
// buildCase centres the torus on the floor (half sunk); rest it on the ground (tube radius sy = 9) so the shadow is a real ring
const rest = (s) => { s.objectsOf()[0].params.transform.y = 9; return s; };
const castShadow = (paths) => paths.filter((p) => p && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');

describe('surface lock D5 (turingStripe): v2 Level S, a stripe texture on the surface', () => {
  let rt; let V; let SL; let W; let MS;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; W = V.Scene3D.SurfaceLockWebs; MS = V.Scene3D.SurfaceLockMarkSet;
  }, 240000);
  afterAll(() => rt && rt.cleanup());

  const cases = [
    ['sphere', () => LR.buildCase(V, { law: LAW, markSpace: 'surface', ground: false, shadow: false }), () => LR.buildCase(V, { law: LAW, markSpace: 'pose', ground: false, shadow: false })],
    ['torus with ground shadow', () => rest(LR.buildCase(V, { object: 'torus', law: LAW, markSpace: 'surface', ground: true, shadow: true })), () => rest(LR.buildCase(V, { object: 'torus', law: LAW, markSpace: 'pose', ground: true, shadow: true }))],
    ['box', () => LR.buildCase(V, { object: 'box', law: LAW, markSpace: 'surface', ground: false, shadow: false }), () => LR.buildCase(V, { object: 'box', law: LAW, markSpace: 'pose', ground: false, shadow: false })],
  ];
  cases.forEach(([name, mk, mkPose]) => {
    it(`RED: ${name}: settled == drag at the same pose (nothing flattens on release), not the pose compose, a pose change bakes nothing`, () => {
      const a = mk(); const b = mkPose();
      SL.clearCache(); SL.resetStats();
      const settled = a.composeFull();
      expect(SL.stats.bakes, 'the settled frame is baked (Level S at rest)').toBeGreaterThan(0);
      expect(SL.stats.sceneFrames, 'a Level S frame').toBeGreaterThan(0);
      expect(shaOf(settled), 'settled is no longer the pose compose').not.toBe(shaOf(b.composeFull()));
      expect(a.fills(settled).length, 'the settled frame has stripes').toBeGreaterThan(50);
      a.setPose({ camYaw: 50, camPitch: 25 });
      const drag = a.composePreview();
      const rested = a.composeFull();
      expect(shaOf(rested), 'settled == drag at the same pose').toBe(shaOf(drag));
      if (name.indexOf('torus') === 0) expect(castShadow(rested).length, 'the ground shadow is still there').toBeGreaterThan(8);
      const before = SL.stats.bakeMisses;
      a.setPose({ camYaw: -30, camPitch: 10 });
      a.composePreview(); a.composeFull();
      expect(SL.stats.bakeMisses, 'a pose change and its release bake nothing new').toBe(before);
    }, 300000);
  });

  it('RED: export parity: a drag frame and an independent full compose (what export reads) serialize identically at several poses', () => {
    const s = LR.buildCase(V, { law: LAW, markSpace: 'surface', ground: false, shadow: false });
    SL.clearCache();
    const out = dragEqualsExport(s, [{ camYaw: 20, camPitch: 15 }, { camYaw: -55, camPitch: 30 }]);
    out.forEach((r) => expect(r.equal, JSON.stringify(r.pose)).toBe(true));
  }, 300000);

  it('RED: supports / effectiveMarkSpace: sphere, torus and box under v2 hatch / crosshatch are surface (settled too); legacy, contour, tripleHatch stay pose', () => {
    const ctx = (sp) => ({ spec: sp, mapper: sp.mapper, visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
    [specOf(), specOf({ dragPreview: undefined }), specOf({ mapper: 'crosshatch' }), boxSpec(), boxSpec({ dragPreview: undefined }),
      specOf({ primitive: 'torus', mode: 'torus', sizes: { sx: 34, sy: 9, sz: 9 } })].forEach((sp, i) => {
      expect(W.supports(sp), 'supports ' + i).toBe(true);
      expect(SL.effectiveMarkSpace(sp.style, ctx(sp)), 'surface ' + i).toBe('surface');
    });
    const legacy = specOf(); delete legacy.toneModel;
    expect(W.supports(legacy)).toBe(false);
    expect(SL.effectiveMarkSpace(legacy.style, ctx(legacy))).toBe('pose');
    expect(W.supports(specOf({ mapper: 'contour' }))).toBe(false);
    expect(W.supports(specOf({ style: { fillDensity: 50, tripleHatch: true } }))).toBe(false);
    expect(W.supports(boxSpec({ style: { fillDensity: 50, tripleHatch: true } }))).toBe(false);
  });

  it('wrapped: every baked vertex lies ON the surface (sphere radius, box faces) and the stripes are long continuous lines', () => {
    const ms = W.bake(specOf({ scaleRef: 3 }));
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.meta.lawId).toBe(LAW);
    expect(ms.vertexCount).toBeGreaterThan(2000);
    for (let i = 0; i < ms.vertexCount; i++) {
      const r = Math.hypot(ms.positions[3 * i], ms.positions[3 * i + 1], ms.positions[3 * i + 2]);
      if (Math.abs(r - 14) > 0.05) throw new Error(`vertex ${i} off the sphere: r=${r}`);
    }
    const lens = [];
    for (let r = 0; r < ms.runCount; r++) {
      let L = 0;
      for (let v = ms.runStart[r] + 1; v < ms.runStart[r + 1]; v++) L += Math.hypot(ms.positions[3 * v] - ms.positions[3 * v - 3], ms.positions[3 * v + 1] - ms.positions[3 * v - 2], ms.positions[3 * v + 2] - ms.positions[3 * v - 1]);
      lens.push(L);
    }
    lens.sort((a, b) => a - b);
    expect(lens[lens.length >> 1] / (ms.meta.turingSpacingMM / 3), 'the median stripe is long (many line spacings): continuous stripes, not squiggles or static').toBeGreaterThan(25);
    expect(lens[0] / (ms.meta.turingSpacingMM / 3), 'no specks: the shortest stripe is still several spacings').toBeGreaterThan(5.9);
    const bx = W.bake(boxSpec({ scaleRef: 3 }));
    expect(MS.validate(bx)).toEqual([]);
    expect(bx.vertexCount).toBeGreaterThan(1500);
    const half = [10, 7, 5];
    for (let i = 0; i < bx.vertexCount; i++) {
      const p = [bx.positions[3 * i], bx.positions[3 * i + 1], bx.positions[3 * i + 2]];
      const onFace = p.some((c, a) => Math.abs(Math.abs(c) - half[a]) < 1e-3) && p.every((c, a) => Math.abs(c) <= half[a] + 1e-3);
      if (!onFace) throw new Error(`box vertex ${i} off the faces: ${p}`);
    }
    const tor = W.bake(specOf({ primitive: 'torus', mode: 'torus', sizes: { sx: 34, sy: 9, sz: 9, detail: 24 } }));
    expect(tor.vertexCount).toBeGreaterThan(2000);
  });

  it('smooth: the baked stripes are smooth curves, no stair steps or polygon corners (turning angle between consecutive segments stays bounded)', () => {
    const turn = (ms) => {
      const angles = [];
      for (let r = 0; r < ms.runCount; r++) {
        const a = ms.runStart[r]; const b = ms.runStart[r + 1];
        for (let v = a + 1; v + 1 < b; v++) {
          const p = (i) => [ms.positions[3 * i], ms.positions[3 * i + 1], ms.positions[3 * i + 2]];
          const p0 = p(v - 1); const p1 = p(v); const p2 = p(v + 1);
          const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]; const w = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
          const lu = Math.hypot(...u); const lw = Math.hypot(...w);
          if (!(lu > 1e-9 && lw > 1e-9)) continue;
          const c = Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (lu * lw)));
          angles.push(Math.acos(c) * 180 / Math.PI);
        }
      }
      angles.sort((x, y) => x - y);
      return { n: angles.length, median: angles[angles.length >> 1], p99: angles[Math.floor(0.99 * angles.length)], max: angles[angles.length - 1] };
    };
    [['sphere', specOf({ sizes: { sx: 25, sy: 25, sz: 25 } })], ['torus', specOf({ primitive: 'torus', mode: 'torus', sizes: { sx: 34, sy: 9, sz: 9, detail: 24 } })], ['box', boxSpec({ sizes: { sx: 40, sy: 40, sz: 40 } })]].forEach(([name, sp]) => {
      const t = turn(W.bake(sp));
      expect(t.n, name).toBeGreaterThan(5000);
      expect(t.median, name + ' ' + JSON.stringify(t)).toBeLessThan(14);
      expect(t.p99, name + ' ' + JSON.stringify(t)).toBeLessThan(45);
      expect(t.max, name + ' ' + JSON.stringify(t)).toBeLessThan(90);
    });
  });

  it('stripe spacing: neighbouring stripes sit about one clearance apart (the pose Turing line spacing), set by the Density tone law', () => {
    const ms = W.bake(specOf({ scaleRef: 3 }));
    const mm = ms.meta.turingSpacingMM;
    expect(mm, 'meta.turingSpacingMM').toBeGreaterThan(0.3);
    expect(mm).toBeLessThan(3);
    const coarse = W.bake(specOf({ scaleRef: 3, style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface', stripeScale: 2 } }));
    expect(coarse.meta.turingSpacingMM / mm, 'Stripe scale multiplies the spacing').toBeGreaterThan(1.8);
    expect(coarse.vertexCount, 'broader stripes, fewer vertices').toBeLessThan(ms.vertexCount * 0.75);
  });

  it('tone: the LUT is the paper gate (0 at the lightest tone, the full gate in the shadow, monotone), the bake is deterministic and tone OFF draws a uniform pattern', () => {
    const spec = specOf();
    const ms = W.bake(spec);
    const lut = W.toneLUT(spec, { tone: { enabled: true } }).lut;
    expect(lut[lut.length - 1]).toBe(0);
    expect(lut[0] * ms.meta.p0 * ms.meta.scaleRef).toBeGreaterThan(0.99);
    for (let k = 1; k < lut.length; k++) expect(lut[k], 'monotone ' + k).toBeLessThanOrEqual(lut[k - 1] + 1e-9);
    const off = W.toneLUT(spec, { tone: { enabled: false } }).lut;
    expect(off[0]).toBe(off[off.length - 1]);
    expect(off[0]).toBeGreaterThan(0);
    const sig = (m) => crypto.createHash('sha1').update(Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength)).digest('hex');
    expect(sig(W.bake(spec))).toBe(sig(ms));
    expect(sig(W.bake(specOf({ seed: { salt: 5, phase: 0, off: 0 } }))), 'the scene seed changes the pattern').not.toBe(sig(ms));
  });

  const cov = (p) => LR.bins(p, 'L', { n: 10 }).map((x) => (x.cov === null ? 0 : x.cov));
  [['sphere', {}], ['box', { object: 'box' }]].forEach(([name, extra]) => {
    it(`tone (${name}): graded by the light (M1 / M3) and the ink per L* bin stays within 2x of the pose compose, the total within 1.5x`, () => {
      const sS = LR.buildCase(V, { law: LAW, markSpace: 'surface', ...extra });
      SL.clearCache(); SL.resetStats();
      const a = LR.measure(sS, { model: 'v2', paths: sS.composeFull() });
      const sP = LR.buildCase(V, { law: LAW, markSpace: 'pose', ...extra });
      const b = LR.measure(sP, { model: 'v2', paths: sP.composeFull() });
      const m1 = LR.m1Monotone(a); const m3 = name === 'box' ? { pass: true } : LR.m3Range(a, 50); // a box has two facet tones: no range test
      if (process.env.TURING_DUMP) require('fs').appendFileSync('/tmp/turing-dump.txt', JSON.stringify({ name, a: cov(a), b: cov(b), m1, m3 }) + '\n');
      expect(m1.pass, JSON.stringify(m1)).toBe(true);
      expect(m3.pass, JSON.stringify(m3)).toBe(true);
      const ca = cov(a); const cb = cov(b);
      const tot = (v) => v.reduce((x, y) => x + y, 0);
      ca.forEach((v, i) => {
        if (cb[i] < 0.03 && v < 0.05) return;
        expect(v / Math.max(1e-6, cb[i]), `bin ${i} ${JSON.stringify({ ca, cb })}`).toBeGreaterThan(1 / 2);
        expect(v / Math.max(1e-6, cb[i]), `bin ${i} ${JSON.stringify({ ca, cb })}`).toBeLessThan(2);
      });
      expect(tot(ca) / tot(cb)).toBeGreaterThan(1 / 1.5);
      expect(tot(ca) / tot(cb)).toBeLessThan(1.5);
    }, 300000);
  });

  it('through the engine: repeated orbit = 0 bake misses / 0 tone evals, a light move bakes nothing; legacy untouched', () => {
    const s = LR.buildCase(V, { law: LAW, markSpace: 'surface', ground: false, shadow: false });
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
    const g = LR.buildCase(V, { law: LAW, markSpace: 'surface', tone: { model: 'legacy' }, ground: false, shadow: false });
    SL.clearCache(); SL.resetStats();
    g.composePreview();
    expect(SL.stats.bakes).toBe(0);
  });

  it('perf: the full bake of a default-size sphere / torus / box (scaleRef 1) fits the vertex budget; the first drag frame is that one bake (node vm is 3-8x slower than Chromium: checked at 4x of the 150 ms target)', () => {
    [specOf({ sizes: { sx: 25, sy: 25, sz: 25 }, objectId: 'p1' }), boxSpec({ sizes: { sx: 40, sy: 40, sz: 40 }, objectId: 'p2' }), specOf({ primitive: 'torus', mode: 'torus', sizes: { sx: 34, sy: 9, sz: 9, detail: 24 }, objectId: 'p3' })].forEach((sp) => {
      const t0 = Date.now(); const ms = W.bake(sp); const dt = Date.now() - t0;
      expect(ms.vertexCount).toBeLessThanOrEqual(200000);
      expect(dt, sp.primitive).toBeLessThan(600);
    });
  });
});
