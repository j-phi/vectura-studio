const { loadSurfaceLockRuntime, dragEqualsExport } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');
const crypto = require('crypto');
const { signature } = require('../helpers/surface-lock-scene');
// object ids are random per scene: normalised before hashing
const shaOf = (paths) => crypto.createHash('sha1').update(signature(paths, 9).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')).digest('hex');

// Owner decision (contract A28): the surface bake is DRAG-PREVIEW ONLY (FIT row `dragPreviewOnly`, spec.dragPreview from bounds.dragPreview).
// While a 3D drag / orbit is in progress the frame comes from the bake; settled and export output is the POSE compose, byte for byte.
// Wave D (WD-D2): the three-pen laws penInterleave / penReserve / penCross are baked once onto the surface for v2 scenes (SurfaceLockLaws,
// FIT row `v2Only`, contract A28). The pen of every run is baked (MarkSet.runPen / runWeight) and the pen mix follows the light through each
// run's tone band (MarkSet.runBand), so the pen split survives frame() and follows a light drag without a rebake. A legacy scene keeps the
// pose output byte for byte.
//   RED: effectiveMarkSpace(v2 spec) is 'surface' (today 'pose', reason 'no baker'); a legacy spec stays 'pose'.
//   Pen ids: drawn lines carry penTier + weightScale = nib / document pen, as the pose emit does; per-nib ink is compared with the pose compose.
//   Tone: the ink-weighted coverage curve per tone bin (L) follows the POSE compose of the same scene (the reference), bin by bin.
//   dragEqualsExport; a repeated orbit makes 0 bake misses and 0 tone evaluations; tone OFF draws a uniform fine-nib Density.

const PEN = 0.3;
const LAWS = ['penInterleave', 'penReserve', 'penCross'];
const NIBS = [0.26, 0.52, 0.93];
const BOUNDS = { width: 320, height: 220, penWidth: 0 };
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'penInterleave',
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface' }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2', dragPreview: true, ...o,
});

// Width-weighted ink per cell (length x weightScale): the pen laws carry tone in WHICH nib, so a plain length raster cannot compare them.
const inkOf = (paths, cell) => {
  const ink = new Map();
  paths.forEach((p) => {
    const w = (p.meta && p.meta.weightScale) || 1;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i]; const d = Math.hypot(b.x - a.x, b.y - a.y); if (!(d > 0)) continue;
      const n = Math.max(1, Math.ceil(d / (cell * 0.2)));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n; const key = `${Math.floor((a.x + (b.x - a.x) * t) / cell)},${Math.floor((a.y + (b.y - a.y) * t) / cell)}`;
        ink.set(key, (ink.get(key) || 0) + w * d / n);
      }
    }
  });
  return ink;
};
const tierRows = (s, paths) => {
  const prof = LR.measure(s, { model: 'v2', paths });
  const fills = s.fills(paths);
  const row = (sel) => {
    const ink = inkOf(fills.filter(sel), prof.cell);
    prof.samples.forEach((sm, i) => { prof.cells.ink[i] = ink.get(`${sm.gx},${sm.gy}`) || 0; });
    return LR.bins(prof, 'L', { n: 10 }).map((x) => (x.cov === null ? 0 : x.cov));
  };
  return { all: row(() => true), t: [0, 1, 2].map((k) => row((p) => p.meta && p.meta.penTier === k)) };
};

describe('surface lock wave D (WD-D2): v2 penInterleave / penReserve / penCross', () => {
  let rt; let V; let SL; let Z; let MS;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; Z = V.Scene3D.SurfaceLockLaws; MS = V.Scene3D.SurfaceLockMarkSet;
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  LAWS.forEach((law) => {
    describe(law, () => {
      let surf; let pose; let surfPaths;
      beforeAll(() => {
        const sS = LR.buildCase(V, { law, markSpace: 'surface' });
        SL.clearCache(); SL.resetStats();
        surfPaths = sS.composePreview(); // a drag frame: the baked fill
        surf = tierRows(sS, surfPaths);
        pose = tierRows(LR.buildCase(V, { law, markSpace: 'pose' }), LR.buildCase(V, { law, markSpace: 'pose' }).composeFull());
      }, 120000);

      it('RED: settled / export output equals the pose compose byte for byte (sha); the baked frame exists only while dragging', () => {
        const sS = LR.buildCase(V, { law, markSpace: 'surface' });
        const sP = LR.buildCase(V, { law, markSpace: 'pose' });
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

      it('RED: v2 effectiveMarkSpace is surface for a drag spec; settled (no dragPreview), legacy, crosshatch and tripleHatch stay pose', () => {
        const spec = specOf({ toneLaw: law });
        const settledSpec = specOf({ toneLaw: law, dragPreview: undefined });
        const ctx0 = (sp) => ({ spec: sp, mapper: sp.mapper, visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
        expect(SL.effectiveMarkSpace(settledSpec.style, ctx0(settledSpec))).toBe('pose');
        expect(Z.supports(settledSpec)).toBe(false);
        const ctx = (sp) => ({ spec: sp, mapper: sp.mapper, visibility: 'hidden', emissiveCoreBlank: false, csgCarve: false, receiveShadow: false, areaLight: false });
        expect(SL.effectiveMarkSpace(spec.style, ctx(spec))).toBe('surface');
        expect(SL.explainMarkSpace(spec.style, ctx(spec))).toEqual({ mode: 'surface', reason: 'surface' });
        const legacy = specOf({ toneLaw: law }); delete legacy.toneModel;
        expect(SL.effectiveMarkSpace(legacy.style, ctx(legacy))).toBe('pose');
        expect(Z.supports(Object.assign({}, legacy, { toneModel: 'legacy' }))).toBe(false);
        expect(Z.supports(specOf({ toneLaw: law, mapper: 'crosshatch' }))).toBe(false);
        expect(Z.supports(specOf({ toneLaw: law, mapper: 'contour' }))).toBe(false);
        expect(Z.supports(specOf({ toneLaw: law, style: { fillDensity: 50, tripleHatch: true } }))).toBe(false);
      });

      it('pen ids: runs carry a nib (runPen / runWeight / runBand); drawn lines carry penTier and weightScale = nib / document pen', () => {
        const ms = Z.bake(specOf({ toneLaw: law }));
        expect(MS.validate(ms)).toEqual([]);
        expect(ms.meta.penTiers).toBe(true);
        expect(ms.runPen && ms.runWeight).toBeTruthy();
        expect(Boolean(ms.runBand), 'a tone band only where the nib follows the light').toBe(law !== 'penCross');
        expect(Array.from(new Set(ms.runPen)).every((k) => k >= 1 && k <= 3)).toBe(true);
        const fills = surfPaths.filter((p) => p.meta && p.meta.kind === 'sceneFill' && Number.isInteger(p.meta.penTier));
        expect(fills.length).toBeGreaterThan(20);
        fills.forEach((p) => expect(Math.abs(p.meta.weightScale - NIBS[p.meta.penTier] / PEN), `tier ${p.meta.penTier}`).toBeLessThan(0.02));
        // which nibs each law uses (the pose compose's nibs): Interleave all three, Reserve all three, Cross medium + broad only
        const used = new Set(fills.map((p) => p.meta.penTier));
        const want = law === 'penCross' ? [1, 2] : [0, 1, 2];
        want.forEach((k) => expect(used.has(k), `nib ${k}`).toBe(true));
        if (law === 'penCross') expect(used.has(0)).toBe(false);
      });

      it('tone: the ink-weighted coverage per tone bin follows the pose compose (reference: markSpace pose, same scene, v2) in every bin', () => {
        const worst = Math.max(...surf.all.map((v, i) => Math.abs(v - pose.all[i])));
        const tot = (a) => a.reduce((x, y) => x + y, 0);
        expect(worst, JSON.stringify({ surf: surf.all, pose: pose.all })).toBeLessThanOrEqual(0.12);
        expect(tot(surf.all) / tot(pose.all)).toBeGreaterThan(0.8);
        expect(tot(surf.all) / tot(pose.all)).toBeLessThan(1.2);
        // paper at the lightest tones, as the pose law
        expect(surf.all[9]).toBeLessThanOrEqual(0.05);
      });

      it('pen split: the nib carrying most ink in the darkest bins and in the mid bins is the pose compose\'s, and each nib\'s total ink is within 2x of the pose\'s', () => {
        const lead = (r, i) => [0, 1, 2].reduce((b, k) => (r.t[k][i] > r.t[b][i] ? k : b), 0);
        const bins = law === 'penCross' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
        bins.forEach((i) => expect(lead(surf, i), `bin ${i} ${JSON.stringify(surf.t.map((a) => a[i]))} vs pose ${JSON.stringify(pose.t.map((a) => a[i]))}`).toBe(lead(pose, i)));
        [0, 1, 2].forEach((k) => {
          const a = surf.t[k].reduce((x, y) => x + y, 0); const b = pose.t[k].reduce((x, y) => x + y, 0);
          if (b < 0.05) { expect(a).toBeLessThan(0.15); return; }
          expect(a / b, `nib ${k}`).toBeGreaterThan(0.4);
          expect(a / b, `nib ${k}`).toBeLessThan(2.5);
        });
      });

      it('through the engine: drag frames are baked (nib channels present), repeated orbit = 0 bake misses / 0 tone evals; legacy untouched', () => {
        const s = LR.buildCase(V, { law, markSpace: 'surface' });
        SL.clearCache(); SL.resetStats();
        s.setPose({ camYaw: 50, camPitch: 25 });
        const drag = s.composePreview();
        expect(SL.stats.bakes, 'baked by the surface lock').toBeGreaterThan(0);
        expect(SL.stats.bakeErrors).toBe(0);
        const fills = s.fills(drag).filter((p) => Number.isInteger(p.meta.penTier));
        expect(fills.length, 'nib channels (penTier / weightScale)').toBeGreaterThan(20);
        fills.forEach((p) => expect(p.meta.weightScale).toBeGreaterThan(0));
        const yaws = [-60, -40, -20, 0, 20, 40, 60];
        LR.orbitCounters(s, yaws);
        const c = LR.orbitCounters(s, yaws, { warm: false });
        expect(c.bakeMisses).toBe(0);
        expect(c.toneEvals).toBe(0);
        const g = LR.buildCase(V, { law, markSpace: 'surface', tone: { model: 'legacy' } });
        SL.clearCache(); SL.resetStats();
        g.composePreview();
        expect(SL.stats.bakes).toBe(0);
      });

      it('perf: the bake stays within the vertex budget; the LUT is graded and reaches paper', () => {
        const ms = Z.bake(specOf({ toneLaw: law, scaleRef: 3 }));
        expect(ms.vertexCount).toBeLessThanOrEqual(120000);
        const lut = Z.toneLUT(specOf({ toneLaw: law, scaleRef: 3 }), { tone: { enabled: true } }).lut;
        for (let i = 1; i < lut.length; i++) expect(lut[i], `I=${i}`).toBeLessThanOrEqual(lut[i - 1] + 1e-6);
        expect(lut[lut.length - 1]).toBeLessThan(0.1 * lut[0]);
        const off = Z.toneLUT(specOf({ toneLaw: law, scaleRef: 3 }), { tone: { enabled: false } }).lut;
        expect(off[0]).toBeGreaterThan(0);
        expect(Math.abs(off[100] - off[0])).toBeLessThan(1e-9);
      });
    });
  });

  it('MarkSet runBand: absent unless a run sets one; a run draws only inside its band (frame)', () => {
    const B = MS.createBuilder({ bakerId: 't', key: 'k', objectId: 'o', meta: { p0: 1 } });
    const run = (lo, hi) => { B.beginRun(0, 0.1, 0, 0, undefined, 0, 0, lo, hi); B.vertex(0, 0, 1, 0, 0, 1); B.vertex(1, 0, 1, 0, 0, 1); B.endRun(); };
    run(undefined, undefined);
    expect(B.finish().runBand).toBeUndefined();
    const C = MS.createBuilder({ bakerId: 't', key: 'k', objectId: 'o', meta: { p0: 1 } });
    C.beginRun(0, 0.1, 0, 0); C.vertex(0, 0, 1, 0, 0, 1); C.vertex(1, 0, 1, 0, 0, 1); C.endRun();
    C.beginRun(0, 0.1, 0, 0, undefined, 0, 0, 0.3, 0.6); C.vertex(0, 1, 1, 0, 0, 1); C.vertex(1, 1, 1, 0, 0, 1); C.endRun();
    const ms = C.finish();
    expect(Array.from(ms.runBand)).toEqual([0, 255, 77, 153]);
    expect(MS.validate(ms)).toEqual([]);
    const ps = SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0, pitch: 0, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
    const lut = new Float32Array(257).fill(100);
    const at = (I) => SL.frame([ms], ps, { toneFn: () => I, tone: { lut, scaleFn: null }, penWidth: PEN, floorPitch: 0, objectId: 'o' }).length;
    expect(at(0.1)).toBe(1); expect(at(0.45)).toBe(2); expect(at(0.9)).toBe(1);
  });
});
