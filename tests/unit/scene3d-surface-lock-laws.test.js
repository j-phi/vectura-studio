const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// SurfaceLockLaws (W3-B): dutyConst, endShorten, mergeLadder, phaseBlue as LUT + run-treatment layers over the
// ladder rulings (docs/surface-lock-contract.md §5, §9, §12). The tone maps are checked against the POSE-mode
// makeCtx published through __MONO_TRACE (areaFor / pitchFor), plus the pose law bodies' own constants.

const PEN = 0.3;
const LAWS = ['dutyConst', 'endShorten', 'mergeLadder', 'phaseBlue'];
const MAPPERS = ['hatch', 'crosshatch'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const specOf = (o = {}) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 10, sy: 10, sz: 10 }, detail: 24,
  scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'dutyConst',
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: PEN, scaleRef: 1,
  seed: { salt: 0, phase: 0, off: 0 }, ...o,
});
const lutAt = (lut, I) => {
  const k = I * 256; const k0 = Math.floor(k); const k1 = Math.min(256, k0 + 1);
  return lut[k0] + (lut[k1] - lut[k0]) * (k - k0);
};
const I33 = Array.from({ length: 33 }, (_, i) => i / 32);

// The pose law bodies' own maps, transcribed from surface-fill-mono.js (lawDuty, lawEndShorten, lawMerge, lawPhaseBlue).
const poseMaps = (C) => {
  const dutyP = () => {
    const P0 = C.FLOOR * 1.05 * C.SPARSE;
    const tDense = clamp((1 - 1 / C.DS) / (1 - 1 / 4), 0, 1);
    const cov0 = C.PEN / P0;
    return tDense > 0 ? C.PEN / (cov0 + (1 - cov0) * tDense) : P0;
  };
  const aLight = C.areaFor(1); const aDark = C.areaFor(0);
  const duty = (I) => clamp(0.18 + (1 - 0.18) * ((C.areaFor(I) - aLight) / Math.max(1e-6, aDark - aLight)), 0.18, 1);
  const full = C.INK / C.FLOOR;
  const mOf = (I) => { const want = C.areaFor(I); return clamp(want / full, 0.03, 1) + clamp((want - full) / Math.max(1e-6, 1 - full), 0, 1); };
  const mergeP = (m) => (m <= 1 ? C.FLOOR + (C.PMAX - C.FLOOR) * (1 - m) : Math.max(C.INK * 0.98, C.FLOOR - (C.FLOOR - C.INK * 0.98) * (m - 1)));
  return {
    dutyConst: (I) => { const d = duty(I); return d * (2 * C.FLOOR) < C.MINMARK ? 0 : d / dutyP(); },
    endShorten: (I) => { const e = I * I * (3 - 2 * I); return (1 - 0.84 * e) / (C.FLOOR * 1.15 * C.SPARSE); },
    mergeLadder: (I) => { const m = mOf(I); return m * (1.8 * C.FLOOR) < C.MINMARK ? 0 : 1 / clamp(mergeP(m), C.INK * 0.9, C.PMAX); },
    phaseBlue: (I) => 1 / C.pitchFor(I),
  };
};

describe('SurfaceLockLaws (W3-B)', () => {
  let rt; let V; let Z; let MS; let SL; let L; const ctxByLaw = {}; const msCache = new Map();
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; Z = V.Scene3D.SurfaceLockLaws; MS = V.Scene3D.SurfaceLockMarkSet; SL = V.Scene3D.SurfaceLock; L = V.Scene3D.SurfaceLockLadder;
    const win = rt.runtime.window;
    LAWS.forEach((law) => {
      const scene = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: law, mapper: 'hatch', markSpace: 'pose' });
      win.__MONO_TRACE = 1; win.__MONO_CTX = null;
      scene.group.params.tone = Object.assign({}, scene.group.params.tone, { model: 'legacy' }); // the maps below are the LEGACY pose maps (v2 has its own plot floor)
      scene.composeFull();
      ctxByLaw[law] = win.__MONO_CTX; win.__MONO_TRACE = 0;
    });
    // mergeLadder and phaseBlue are not selectable scene tone laws (scene3d-tone-laws.js lists neither), so no scene
    // composes them. Their makeCtx tone maps (areaFor / pitchFor / FLOOR / INK / PMAX / MINMARK) depend on pen and
    // Density only, so the context of any mono law at the same pen is the same substrate.
    ctxByLaw.mergeLadder = ctxByLaw.dutyConst; ctxByLaw.phaseBlue = ctxByLaw.dutyConst;
  }, 120000);
  afterAll(() => rt && rt.cleanup());
  const bake = (spec) => { const k = JSON.stringify(spec); if (!msCache.has(k)) msCache.set(k, Z.bake(spec)); return msCache.get(k); };
  const keyOf = (ms, r) => { const l = ms.runLevel[r]; const rk = MS.rankOf(ms, r); return l === 0 ? rk : 2 ** (l - 1) * (1 + rk); };
  const runLen = (ms, r) => {
    let s = 0;
    for (let v = ms.runStart[r] + 1; v < ms.runStart[r + 1]; v++) {
      s += Math.hypot(ms.positions[3 * v] - ms.positions[3 * v - 3], ms.positions[3 * v + 1] - ms.positions[3 * v - 2], ms.positions[3 * v + 2] - ms.positions[3 * v - 1]);
    }
    return s;
  };
  const drawnLength = (ms, t) => { let s = 0; for (let r = 0; r < ms.runCount; r++) if (keyOf(ms, r) < t) s += runLen(ms, r); return s; };

  it('supports exactly the FIT rows (four laws x hatch/crosshatch x ladder primitives), minus refuse rules', () => {
    expect(Z.id).toBe('laws');
    LAWS.forEach((law) => MAPPERS.forEach((m) => expect(Z.supports(specOf({ toneLaw: law, mapper: m })), `${law}/${m}`).toBe(true)));
    expect(Z.supports(specOf({ toneLaw: 'dutyConst', primitive: 'torus', mode: 'torus' }))).toBe(true);
    ['contour', 'spiral', 'stipple', 'wireframe'].forEach((m) => expect(Z.supports(specOf({ mapper: m })), m).toBe(false));
    ['ladder', 'mezzoRegion', 'creviceAO', 'etfKang', undefined].forEach((l) => expect(Z.supports(specOf({ toneLaw: l })), String(l)).toBe(false));
    expect(Z.supports(specOf({ primitive: 'box', mode: undefined }))).toBe(false);
    expect(Z.supports(specOf({ primitive: 'torusKnot', mode: 'torusKnot' }))).toBe(false);
    expect(Z.supports(specOf({ style: { tripleHatch: true } }))).toBe(false);
    expect(Z.supports(null)).toBe(false);
    expect(Z.FIT.length).toBeGreaterThan(0);
    expect(SL.BAKER_KEYS).toContain('SurfaceLockLaws');
  });

  describe.each(LAWS)('%s', (law) => {
    it('toneLUT equals the pose-mode tone map at 33 I values (§5)', () => {
      const C = ctxByLaw[law];
      expect(C, 'the mono context was published').toBeTruthy();
      const { lut, scaleFn } = Z.toneLUT(specOf({ toneLaw: law, penWidth: C.PEN, style: { fillDensity: 50, densityScale: C.DS } }), { tone: {}, penWidth: C.PEN, highlight: 'blank' });
      expect(scaleFn).toBe(null);
      expect(lut.length).toBe(257);
      const want = poseMaps(C)[law];
      I33.forEach((I) => expect(Math.abs(lutAt(lut, I) - want(I)), `I=${I}`).toBeLessThan(1e-5 * Math.max(1, want(I))));
    });

    it('toneLUT is monotone: never denser toward the light (all 257 entries) and darker than lighter overall', () => {
      const C = ctxByLaw[law];
      const { lut } = Z.toneLUT(specOf({ toneLaw: law, penWidth: C.PEN }), {});
      for (let k = 0; k < 256; k++) expect(lut[k + 1], `k=${k}`).toBeLessThanOrEqual(lut[k] + 1e-7);
      expect(lut[0]).toBeGreaterThan(lut[256]);
      for (let k = 0; k <= 256; k++) expect(lut[k]).toBeGreaterThanOrEqual(0);
    });

    it.each(MAPPERS)('bake (%s): valid, deterministic, objectId-free, salt changes the set', (mapper) => {
      const spec = specOf({ toneLaw: law, mapper });
      const a = bake(spec);
      expect(MS.validate(a)).toEqual([]);
      expect(a.runCount).toBeGreaterThan(20);
      expect(a.bakerId).toBe('laws');
      expect(a.meta.gain).toBe(2);
      expect(a.meta.toneModel).toBe('pitch');
      expect(a.meta.p0).toBeGreaterThan(0);
      expect(a.meta.lawId).toBe(law);
      const b = Z.bake(spec);
      ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'].forEach((k) => expect(Array.from(b[k]), k).toEqual(Array.from(a[k])));
      expect(Array.from(Z.bake({ ...spec, objectId: 'zzz' }).positions)).toEqual(Array.from(a.positions));
      expect(Array.from(Z.bake({ ...spec, seed: { salt: 7, phase: 0.3, off: 0 } }).positions)).not.toEqual(Array.from(a.positions));
      if (mapper === 'crosshatch') expect(Array.from(a.runFamily).some((f) => f === 1)).toBe(true);
    });

    it('frame: ink length is monotone non-increasing in uniform tone I and darker than lighter (Level F)', () => {
      const C = ctxByLaw[law];
      const BOUNDS = { width: 320, height: 220, penWidth: 0 };
      const pose = SL.poseOf({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, { yaw: 0.4, pitch: 0.3, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
      const spec = specOf({ toneLaw: law, penWidth: C.PEN, scaleRef: pose.cam.scale, style: { fillDensity: 50, densityScale: C.DS, fillAngle: 45 } });
      const ms = Z.bake(spec);
      const tone = Z.toneLUT(spec, {});
      const ink = (I) => {
        SL.resetStats();
        const lines = SL.frame([ms], pose, { toneFn: () => I, tone, penWidth: C.PEN, floorPitch: 2.2 * C.PEN, objectId: 'o1' });
        let s = 0; lines.forEach((ln) => { for (let i = 1; i < ln.length; i++) s += Math.hypot(ln[i].x - ln[i - 1].x, ln[i].y - ln[i - 1].y); });
        return s;
      };
      const vals = [0, 0.2, 0.4, 0.6, 0.8, 1].map(ink);
      for (let i = 1; i < vals.length; i++) expect(vals[i], `I=${i / 5}`).toBeLessThanOrEqual(vals[i - 1] + 1e-6);
      expect(vals[0]).toBeGreaterThan(vals[5] * 1.15);
      expect(vals[0]).toBeGreaterThan(0);
    });
  });

  describe('dutyConst treatment: constant ruling set, dashes in duty bands', () => {
    it('drawn length is monotone in the gate and tracks the duty within the band quantisation', () => {
      const ms = bake(specOf({ toneLaw: 'dutyConst', sizes: { sx: 14, sy: 14, sz: 14 } }));
      const total = drawnLength(ms, 99);
      expect(total).toBeGreaterThan(0);
      const rho = ms.meta.rho;
      expect(rho).toBeGreaterThan(0.6); expect(rho).toBeLessThan(1.5);
      let prev = 0;
      for (let d = 0; d <= 1.0001; d += 0.05) { const f = drawnLength(ms, rho * d) / total; expect(f).toBeGreaterThanOrEqual(prev - 1e-9); prev = f; }
      // below the pose law's minimum dash (MINMARK / PERIOD) nothing is drawn; at duty 1 the ruling is whole
      const C = ctxByLaw.dutyConst; const minDuty = C.MINMARK / (2 * C.FLOOR);
      expect(drawnLength(ms, 0) / total).toBe(0); // the LUT is 0 below the minimum dash: nothing passes key < 0
      expect(Math.abs(drawnLength(ms, rho * (minDuty + 0.01)) / total - minDuty)).toBeLessThan(0.08);
      expect(drawnLength(ms, rho * 1.0001) / total).toBeGreaterThan(0.99);
      [0.55, 0.75, 0.95].forEach((d) => expect(Math.abs(drawnLength(ms, rho * d) / total - d), `duty ${d}`).toBeLessThan(0.13));
    });
    it('every piece is a plain open polyline of at least two vertices with outward unit normals', () => {
      const ms = bake(specOf({ toneLaw: 'dutyConst' }));
      const n = [];
      for (let r = 0; r < ms.runCount; r++) expect(ms.runStart[r + 1] - ms.runStart[r]).toBeGreaterThanOrEqual(2);
      for (let v = 0; v < ms.vertexCount; v += 17) {
        MS.octDecode(ms.normals, 2 * v, n);
        const px = ms.positions[3 * v]; const py = ms.positions[3 * v + 1]; const pz = ms.positions[3 * v + 2];
        expect(Math.abs(Math.hypot(px, py, pz) - 10)).toBeLessThan(4e-3); // chord sagitta of a 0.5 mm ladder step at R 10 is 3e-3
        expect((n[0] * px + n[1] * py + n[2] * pz) / 10).toBeGreaterThan(0.999);
      }
    });
  });

  describe('endShorten treatment: every ruling exists, ends retract by an even stagger', () => {
    it('the kept rulings are a single pitch and the gate keeps an even, proportional subset', () => {
      const ms = bake(specOf({ toneLaw: 'endShorten', sizes: { sx: 14, sy: 14, sz: 14 } }));
      const rho = ms.meta.rho;
      const total = drawnLength(ms, 99);
      let prev = 0;
      [0.16, 0.3, 0.5, 0.7, 0.9, 1.0001].forEach((u) => {
        const f = drawnLength(ms, rho * u) / total;
        expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(Math.abs(f - Math.min(1, u)), `u ${u}`).toBeLessThan(0.1);
        prev = f;
      });
      expect(drawnLength(ms, rho * 1.0001) / total).toBeGreaterThan(0.995);
    });
    it('meta.p0 is the single ruling pitch (finer levels than the pitch are dropped)', () => {
      const ms = bake(specOf({ toneLaw: 'endShorten' }));
      const C = ctxByLaw.endShorten;
      const nominal = (C.FLOOR * 1.15 * C.SPARSE);
      expect(ms.meta.p0 * 1).toBeGreaterThan(nominal * 0.7);
      expect(ms.meta.p0 * 1).toBeLessThan(nominal * 1.45);
    });
  });

  describe('mergeLadder treatment: dashes below the touch point, whole rulings above it', () => {
    it('adds dash pieces to rulings coarser than the floor and leaves finer rulings whole', () => {
      const spec = specOf({ toneLaw: 'mergeLadder' });
      const ms = bake(spec);
      const lad = L.bake({ ...spec, toneLaw: 'ladder' });
      expect(ms.runCount).toBeGreaterThan(lad.runCount * 0.3);
      expect(ms.meta.touchKey).toBeGreaterThan(0);
      let whole = 0; let pieces = 0;
      for (let r = 0; r < ms.runCount; r++) { if (keyOf(ms, r) >= ms.meta.touchKey) whole += 1; else pieces += 1; }
      expect(pieces).toBeGreaterThan(0); expect(whole).toBeGreaterThan(0);
    });
    it('drawn length at a gate is monotone', () => {
      const ms = bake(specOf({ toneLaw: 'mergeLadder' }));
      let prev = -1;
      for (let t = 0; t <= 16; t += 0.5) { const s = drawnLength(ms, t); expect(s).toBeGreaterThanOrEqual(prev - 1e-9); prev = s; }
    });
  });

  describe('phaseBlue treatment: ladder rulings displaced sideways by a bounded blue jitter', () => {
    it('keeps the ladder run structure, moves vertices by at most a/2 of the finest pitch, stays on the surface', () => {
      const spec = specOf({ toneLaw: 'phaseBlue' });
      const ms = bake(spec);
      const lad = Z.debug && Z.debug.ladderFor ? Z.debug.ladderFor(spec) : null;
      expect(lad, 'Z.debug.ladderFor exposes the untreated ladder bake').toBeTruthy();
      expect(ms.runCount).toBe(lad.runCount);
      expect(ms.vertexCount).toBe(lad.vertexCount);
      const pf = ms.meta.p0 / 2 ** (ms.levels - 1);
      let worst = 0; let moved = 0; let surf = 0;
      for (let v = 0; v < ms.vertexCount; v++) {
        const d = Math.hypot(ms.positions[3 * v] - lad.positions[3 * v], ms.positions[3 * v + 1] - lad.positions[3 * v + 1], ms.positions[3 * v + 2] - lad.positions[3 * v + 2]);
        worst = Math.max(worst, d); if (d > 1e-6) moved += 1;
        surf = Math.max(surf, Math.abs(Math.hypot(ms.positions[3 * v], ms.positions[3 * v + 1], ms.positions[3 * v + 2]) - 10));
      }
      expect(moved).toBeGreaterThan(ms.vertexCount * 0.9);
      expect(worst).toBeLessThanOrEqual(0.5 * ms.meta.jitterFrac * pf + 1e-4);
      expect(surf).toBeLessThan(1e-3);
      expect(Array.from(ms.runLevel)).toEqual(Array.from(lad.runLevel));
    });
  });

  describe('dutyConst limb ring (FX-J1): the plot-floor cap acts on rulings, not duty bands (contract A13)', () => {
    const len = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return s; };
    const rig = (markSpace, yaw, mapper = 'hatch') => {
      const sc = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'dutyConst', mapper, markSpace, ground: false, shadow: false });
      sc.setPose({ camYaw: yaw, camPitch: 20 });
      return sc;
    };
    const measure = (paths, cx, cy, R) => {
      const fills = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill');
      let band = 0;
      fills.forEach((p) => { const m = p[p.length >> 1]; if (Math.hypot(m.x - cx, m.y - cy) / R >= 0.9) band += len(p); });
      return { fills, band, total: fills.reduce((s, p) => s + len(p), 0) };
    };
    const centre = (paths) => {
      const all = [].concat(...paths.filter((p) => p.meta && p.meta.kind === 'sceneEdge'));
      let cx = 0; let cy = 0; all.forEach((q) => { cx += q.x; cy += q.y; }); cx /= all.length; cy /= all.length;
      let R = 0; all.forEach((q) => { R = Math.max(R, Math.hypot(q.x - cx, q.y - cy)); });
      return { cx, cy, R };
    };

    it('the baked MarkSet declares capKey ruling and stamps every band of a ruling with that ruling\'s ladder rank', () => {
      const ms = Z.bake(specOf({ toneLaw: 'dutyConst' }));
      expect(ms.meta.capKey).toBe('ruling');
      expect(ms.runCapRank.length).toBe(ms.runCount);
      expect(MS.validate(ms)).toEqual([]);
      const caps = new Set(Array.from(ms.runCapRank));
      expect(caps.size).toBeGreaterThan(1);
      Array.from(caps).forEach((c) => expect(c).toBeLessThan(MS.RANK_SCALE));
      // endShorten (keys already are ruling ranks) and ladder-derived laws carry no capRank: output unchanged
      expect(Z.bake(specOf({ toneLaw: 'endShorten' })).runCapRank).toBeUndefined();
      expect(Z.bake(specOf({ toneLaw: 'endShorten' })).meta.capKey).toBeUndefined();
    });

    [-30, 40].forEach((yaw) => {
      it(`yaw ${yaw}: limb band keeps >= 0.35 x pose ink, fill path count <= 1.1 x pose, no fill pair under 0.8 x floor (Level S == Level F)`, () => {
        const pose = rig('pose', yaw); const surf = rig('surface', yaw);
        const P = pose.composeFull(); const S = surf.composeFull();
        const { cx, cy, R } = centre(P);
        const mp = measure(P, cx, cy, R); const ms = measure(S, cx, cy, R);
        expect(mp.band).toBeGreaterThan(20);
        expect(ms.band / mp.band, 'limb band ink').toBeGreaterThanOrEqual(0.35);
        expect(ms.fills.length / mp.fills.length, 'fill path count').toBeLessThanOrEqual(1.1);
        // Level F: same scene composed through the frame path with Level S off must equal Level S
        const realFrameable = SL.frameable; SL.frameable = () => false;
        let F; try { F = surf.composeFull(); } finally { SL.frameable = realFrameable; }
        const mf = measure(F, cx, cy, R);
        expect(mf.fills.length).toBe(ms.fills.length);
        expect(Math.abs(mf.total - ms.total)).toBeLessThan(0.1);
        // §14.6 spacing: away from the limb, the perpendicular gap between side-by-side drawn fill runs (measured against the local
        // tangent, so curved rulings are fair) stays at the plot floor (2.2 x pen 0.3). The pose reference measures 0.456 with the same
        // probe (vertex-sampled, so it reads slightly under the true gap): require 0.65 x floor, and no worse than the pose ink - 0.03.
        const floor = 1.4 * 0.3; // the scene is v2: its plot floor is V2.FLOOR_PEN (1.4 pens), not the legacy 2.2
        const gap = (paths) => {
          let worst = Infinity;
          const inner = paths.filter((p) => { const m = p[p.length >> 1]; return Math.hypot(m.x - cx, m.y - cy) < R - 0.5 && p.length >= 3; });
          inner.forEach((p, i) => {
            for (let k = 1; k < p.length - 1; k += 2) {
              const m = p[k]; let tx = p[k + 1].x - p[k - 1].x; let ty = p[k + 1].y - p[k - 1].y; const tl = Math.hypot(tx, ty);
              if (tl < 1e-6 || Math.hypot(m.x - cx, m.y - cy) > R - 0.5) continue;
              tx /= tl; ty /= tl;
              inner.forEach((q, j) => {
                if (i === j) return;
                q.forEach((w) => {
                  const dx = w.x - m.x; const dy = w.y - m.y;
                  if (Math.abs(dx * tx + dy * ty) < 0.25) { const pr = Math.abs(-dx * ty + dy * tx); if (pr > 0.02) worst = Math.min(worst, pr); }
                });
              });
            }
          });
          return worst;
        };
        const worst = gap(ms.fills); const worstPose = gap(mp.fills);
        expect(worst, 'min side-by-side spacing').toBeGreaterThanOrEqual(0.65 * floor);
        expect(worst, 'no tighter than pose').toBeGreaterThanOrEqual(worstPose - 0.03);
      });
    });

    it('crosshatch: Level S equals Level F', () => {
      const surf = rig('surface', -30, 'crosshatch');
      const S = surf.composeFull();
      const realFrameable = SL.frameable; SL.frameable = () => false;
      let F; try { F = surf.composeFull(); } finally { SL.frameable = realFrameable; }
      const nS = S.filter((p) => p.meta.kind === 'sceneFill'); const nF = F.filter((p) => p.meta.kind === 'sceneFill');
      expect(nF.length).toBe(nS.length);
      expect(nS.length).toBeGreaterThan(50);
      expect(Math.abs(nF.reduce((s, p) => s + len(p), 0) - nS.reduce((s, p) => s + len(p), 0))).toBeLessThan(0.1);
    });
  });

  it('does not touch pose rendering: absent markSpace and a pose style never reach the module', () => {
    expect(SL.effectiveMarkSpace({}, { spec: specOf({ toneLaw: 'dutyConst' }) })).toBe('pose');
  });
});
