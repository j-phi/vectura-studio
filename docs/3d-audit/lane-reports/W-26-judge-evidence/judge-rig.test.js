/* W-26 JUDGE independent measurement rig v2 — per-FAMILY, perpendicular drawn spacing. */
const fs = require('fs');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: 0.3, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
const { CAMERA, SUN } = require('../fixtures/scene3d-shadow-anatomy');
const OUT = process.env.JUDGE_OUT || '/tmp/judge-out2.json';

describe('W-26 judge rig v2', () => {
  let runtime; let V; let algo; let defaults; let SF; let Regions; let G3; let Scene;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Regions = V.Scene3D.Regions;
    G3 = V.Geometry3D;
    Scene = V.Scene3D.Scene;
  });
  afterAll(() => runtime.cleanup());

  const scene = (mapper, primitive, sizes, toneLaw, density) => {
    const p = clone(defaults);
    p.seed = 0;
    p.camera = clone(CAMERA);
    p.ground = { enabled: true };
    p.backdrop = { enabled: false };
    p.lights = [clone(SUN)];
    p.objects = [{
      id: 'ob', name: 'Ob', primitive,
      params: Object.assign({ detail: 22 }, sizes),
      transform: { x: 0, y: 55, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid',
    }];
    const style = {
      penId: null, mapper,
      params: {
        fillAngle: 45, fillDensity: density, fillCurves: false, fillSmoothing: 0.65,
        fillSimplify: 0, fillFidelity: 1, highlightTreatment: 'none', toneLaw,
      },
    };
    p.styleTable = {
      scene: clone(style),
      byObject: { ground: { penId: null, mapper: 'none', params: {} }, ob: clone(style) },
      byFace: {},
    };
    return p;
  };

  const emitted = (mapper, primitive, sizes, toneLaw, density) => {
    const orig = SF.buildObject;
    const raw = [];
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((q) => raw.push(q));
      return r;
    };
    try {
      algo.generate(scene(mapper, primitive, sizes, toneLaw, density),
        new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
    } finally { SF.buildObject = orig; }
    return raw;
  };

  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const ratioOf = (g) => (g.length >= 2 ? Math.max(...g) / Math.min(...g) : null);
  const agj = (g) => {
    let m = 1;
    for (let i = 1; i < g.length; i += 1) {
      const r = Math.max(g[i] / g[i - 1], g[i - 1] / g[i]);
      if (r > m) m = r;
    }
    return m;
  };

  // Per family (`run.fam`), per ruling (`lineIndex`): centroid + mean direction.
  // Spacing = the PERPENDICULAR offset of the centroid onto the family normal
  // (kills the along-line component that clipping moves), which is exactly the
  // plan's "projected perpendicular gaps". For a contour family the rings step
  // along the axis so this is equivalent to the centroid distance the unit test
  // uses; for a hatch/crosshatch family it is NOT, and the centroid distance is
  // contaminated by how the silhouette clips each line.
  const famSpacings = (raw) => {
    const byFam = new Map();
    raw.forEach((run) => {
      if (run.back || run.lineIndex == null || typeof run.fam !== 'string') return;
      if (!byFam.has(run.fam)) byFam.set(run.fam, new Map());
      const lines = byFam.get(run.fam);
      if (!lines.has(run.lineIndex)) lines.set(run.lineIndex, { x: 0, y: 0, n: 0, dx: 0, dy: 0 });
      const acc = lines.get(run.lineIndex);
      for (let i = 0; i < run.length; i += 1) { acc.x += run[i].x; acc.y += run[i].y; acc.n += 1; }
      const a = run[0]; const b = run[run.length - 1];
      acc.dx += (b.x - a.x); acc.dy += (b.y - a.y);
    });
    const out = {};
    byFam.forEach((lines, fam) => {
      const reps = [...lines.entries()].filter(([, a]) => a.n > 0)
        .sort((p, q) => p[0] - q[0])
        .map(([li, a]) => ({
          li, x: a.x / a.n, y: a.y / a.n, dx: a.dx, dy: a.dy,
        }));
      if (reps.length < 4) return;
      // family mean direction, sign-normalised (lines are unoriented)
      let sx = 0; let sy = 0;
      reps.forEach((r) => {
        const m = Math.hypot(r.dx, r.dy);
        if (!(m > 1e-9)) return;
        let ux = r.dx / m; let uy = r.dy / m;
        if (ux < 0 || (ux === 0 && uy < 0)) { ux = -ux; uy = -uy; }
        sx += ux; sy += uy;
      });
      const dm = Math.hypot(sx, sy);
      const ux = dm > 1e-9 ? sx / dm : 1;
      const uy = dm > 1e-9 ? sy / dm : 0;
      const nx = -uy; const ny = ux;
      const offs = reps.map((r) => ({ li: r.li, t: r.x * nx + r.y * ny }));
      const cent = reps.map((r) => ({ x: r.x, y: r.y }));
      // perpendicular spacing, in placement order
      const perp = [];
      for (let i = 1; i < offs.length; i += 1) perp.push(Math.abs(offs[i].t - offs[i - 1].t));
      const perpNZ = perp.filter((v) => v > 1e-6);
      // centroid spacing, in placement order (what the unit test measures)
      const cd = [];
      for (let i = 1; i < cent.length; i += 1) cd.push(Math.hypot(cent[i].x - cent[i - 1].x, cent[i].y - cent[i - 1].y));
      const cdNZ = cd.filter((v) => v > 1e-6);
      const cut = (arr) => arr.slice(Math.floor(arr.length * 0.2), Math.ceil(arr.length * 0.8));
      out[fam] = {
        rulings: reps.length,
        perpFullRatio: r3(ratioOf(perpNZ)),
        perpCoreRatio: r3(ratioOf(cut(perpNZ))),
        perpAgjFull: r3(agj(perpNZ)),
        perpAgjCore: r3(agj(cut(perpNZ))),
        centFullRatio: r3(ratioOf(cdNZ)),
        perpGaps: perpNZ.map((v) => Math.round(v * 100) / 100),
      };
    });
    return out;
  };

  const inkOf = (raw) => {
    let ink = 0; let n = 0;
    raw.forEach((run) => {
      if (run.back) return;
      n += 1;
      for (let i = 1; i < run.length; i += 1) ink += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
    });
    return { ink: Math.round(ink * 10) / 10, fronts: n };
  };

  const cell = (label, mapper, primitive, sizes, toneLaw, density) => {
    const raw = emitted(mapper, primitive, sizes, toneLaw, density);
    const ik = inkOf(raw);
    return {
      label, mapper, primitive, toneLaw, density, ink: ik.ink, frontRuns: ik.fronts, fams: famSpacings(raw),
    };
  };

  // ── tone-transfer curve on a lit sphere: ink coverage binned by surface intensity
  const toneCurve = (toneLaw, mapper, density) => {
    const R = 25;
    const sizes = { sx: R, sy: R, sz: R };
    const raw = emitted(mapper, 'sphere', sizes, toneLaw, density);
    const camAngles = { yaw: CAMERA.yaw, pitch: CAMERA.pitch, roll: CAMERA.roll };
    const chart = SF.chartFor('sphere', sizes);
    const CELL = 1.0;
    const grid = new Map();
    const key = (gx, gy) => `${gx},${gy}`;
    const N = 260;
    for (let i = 0; i <= N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const p0 = chart(i / N, j / N);
        if (!p0) continue;
        const mag = Math.hypot(p0.x, p0.y, p0.z);
        if (!(mag > 1e-9)) continue;
        const nn = { x: p0.x / mag, y: p0.y / mag, z: p0.z / mag };
        const rn = G3.rotatePoint(nn, camAngles);
        if (!(rn.z > 0.03)) continue;
        const world = { x: p0.x, y: p0.y + 55, z: p0.z };
        const I = Math.max(0, Math.min(1, Regions.combinedIntensity(nn, world, [clone(SUN)])));
        const sp = Scene.projectWorldPoint(world, CAMERA, { width: BOUNDS.width, height: BOUNDS.height });
        if (!sp) continue;
        const k = key(Math.round(sp.x / CELL), Math.round(sp.y / CELL));
        const cur = grid.get(k);
        if (!cur) grid.set(k, { s: I, n: 1 }); else { cur.s += I; cur.n += 1; }
      }
    }
    const lookup = (x, y) => {
      const gx = Math.round(x / CELL); const gy = Math.round(y / CELL);
      for (let r = 0; r <= 3; r += 1) {
        let s = 0; let n = 0;
        for (let dx = -r; dx <= r; dx += 1) {
          for (let dy = -r; dy <= r; dy += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const c = grid.get(key(gx + dx, gy + dy));
            if (c) { s += c.s; n += c.n; }
          }
        }
        if (n > 0) return s / n;
      }
      return null;
    };
    const NB = 6;
    const binArea = new Array(NB).fill(0);
    grid.forEach((c) => {
      const I = c.s / c.n;
      binArea[Math.min(NB - 1, Math.floor(I * NB))] += CELL * CELL;
    });
    const binInk = new Array(NB).fill(0);
    raw.forEach((run) => {
      if (run.back) return;
      for (let i = 1; i < run.length; i += 1) {
        const len = Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
        const I = lookup((run[i].x + run[i - 1].x) / 2, (run[i].y + run[i - 1].y) / 2);
        if (I == null) continue;
        binInk[Math.min(NB - 1, Math.floor(I * NB))] += len;
      }
    });
    const cov = binInk.map((v, i) => (binArea[i] > 2 ? (v * 0.3) / binArea[i] : null));
    const valid = cov.filter((v) => v != null);
    return {
      toneLaw,
      mapper,
      density,
      binArea: binArea.map((v) => Math.round(v)),
      binInk: binInk.map((v) => Math.round(v * 10) / 10),
      coverage: cov.map((v) => (v == null ? null : Math.round(v * 1000) / 1000)),
      covDynamicRange: valid.length >= 2 ? r3(Math.max(...valid) / Math.min(...valid)) : null,
      monotoneDown: valid.every((v, i) => i === 0 || v <= valid[i - 1] + 1e-9),
      totalInk: Math.round(binInk.reduce((a, b) => a + b, 0) * 10) / 10,
    };
  };

  it('measures', () => {
    const results = { cells: [], tone: [] };
    const ELL = { sx: 26, sy: 34, sz: 20 };
    const CYL = { sx: 22, sy: 40, sz: 22 };
    const CONE = { sx: 30, sy: 40, sz: 30 };
    const SPH = { sx: 25, sy: 25, sz: 25 };
    [1, 25, 50, 85, 220].forEach((d) => {
      results.cells.push(cell('ellipsoid/contour/ladder', 'contour', 'ellipsoid', ELL, 'ladder', d));
    });
    ['fineLadder', 'phaseFineLadder'].forEach((law) => {
      [25, 50, 85].forEach((d) => {
        results.cells.push(cell(`cone/contour/${law}`, 'contour', 'cone', CONE, law, d));
      });
      results.cells.push(cell(`cylinder/contour/${law}`, 'contour', 'cylinder', CYL, law, 50));
      results.cells.push(cell(`sphere/hatch/${law}`, 'hatch', 'sphere', SPH, law, 50));
    });
    [25, 50, 85].forEach((d) => {
      results.cells.push(cell('cylinder/crosshatch/ladder', 'crosshatch', 'cylinder', CYL, 'ladder', d));
    });
    results.cells.push(cell('sphere/hatch/ladder', 'hatch', 'sphere', SPH, 'ladder', 50));
    ['ladder', 'fineLadder', 'phaseFineLadder'].forEach((law) => {
      results.tone.push(toneCurve(law, 'hatch', 50));
    });
    results.tone.push(toneCurve('ladder', 'contour', 50));
    results.tone.push(toneCurve('ladder', 'crosshatch', 50));
    fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
    expect(results.cells.length).toBeGreaterThan(0);
  }, 1800000);
});
