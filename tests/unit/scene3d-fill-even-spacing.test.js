const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * EVEN SPACING OF THE SURVIVING RULINGS.
 *
 * Jay, on the staged re-wire at Stage 1 (masterGrid + dither on, everything
 * else off): "Hatch, crosshatch, spiral, etc. on curved surfaces seem to have
 * unexpected gaps. Be sure that these are all 100% even and aligned."
 *
 * THE CAUSE, measured. Which rulings survive at a given coverage was chosen by
 * a van der Corput (bit-reversed) rank: keep line i iff vdc(i) < cov. A
 * bit-reversed prefix is SPREAD — that is what fixed the original "the rank was
 * the family coordinate" fault — but spread is not EVENLY SPACED. It is a
 * binary refinement, so the kept-index gaps are always a power-of-two pair:
 * at cov 0.62 gaps of 1 and 2, at cov 0.42 gaps of 2 and 4, at cov 0.20 gaps of
 * 4 and 8. A gap twice as wide as its neighbours in an otherwise regular field
 * is the "unexpected gap".
 *
 * THE CONTRACT. At any coverage the surviving rulings must be as evenly spaced
 * as an integer grid allows: the kept-index gaps may take at most TWO distinct
 * values and those two must be CONSECUTIVE integers (floor(1/cov) and
 * ceil(1/cov)) — never a 1 beside a 3, never a 2 beside a 4.
 *
 * Two levels of assertion, because the pure property is not enough on its own:
 *   1. `__ladderForTest` — the ladder in isolation, swept over coverage.
 *   2. The REAL emitter on a real curved primitive, where every ruling reads
 *      its OWN span-mean coverage. There the gap set legitimately spans the
 *      whole tone ramp (a lit band is sparser than a dark one — that IS the
 *      drawing), so what is pinned is LOCAL regularity: neighbouring gaps step
 *      by one at a time. Under the bit-reversed rank they doubled instead.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const PEN = 0.3;
const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: PEN, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
// THE RIG IS IMPORTED, NOT COPIED (scene3d-fixture-single-source, rule A).
const { CAMERA, SUN } = require('../fixtures/scene3d-shadow-anatomy');

const gapsOf = (kept) => {
  const s = [...new Set(kept)].sort((a, b) => a - b);
  const g = [];
  for (let i = 1; i < s.length; i += 1) g.push(s[i] - s[i - 1]);
  return g;
};
const distinct = (g) => [...new Set(g)].sort((a, b) => a - b);

describe('Scene3D.SurfaceFill — the ladder keeps EVENLY SPACED rulings', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  describe('the ladder in isolation', () => {
    it('is published as a sequence selector, not a per-line rank', () => {
      const ladder = V.Scene3D.SurfaceFill.__ladderForTest;
      expect(typeof ladder).toBe('function');
      // A per-line rank cannot express this: the verdict for line i depends on
      // the coverage every earlier ruling of the family read, which is what
      // makes the spacing even THROUGH a tone ramp rather than only at a
      // constant coverage.
      expect(ladder(new Array(8).fill(0.5)).length).toBe(8);
    });

    it('keeps a two-CONSECUTIVE-value gap set at every coverage, at every family size', () => {
      const ladder = V.Scene3D.SurfaceFill.__ladderForTest;
      const offenders = [];
      [40, 64, 120, 200].forEach((N) => {
        for (let cov = 0.05; cov <= 0.951; cov += 0.01) {
          const keep = ladder(new Array(N).fill(cov));
          const kept = [];
          keep.forEach((k, i) => { if (k) kept.push(i); });
          if (kept.length < 3) return;
          const d = distinct(gapsOf(kept));
          const okSet = d.length <= 1 || (d.length === 2 && d[1] - d[0] === 1);
          if (!okSet) offenders.push(`N=${N} cov=${cov.toFixed(2)} gaps={${d}}`);
        }
      });
      // The bit-reversed rank fails this on 81 of 194 coverages at N=64, always
      // with a power-of-two pair ({2,4}, {4,8}, {8,16}).
      expect(offenders).toEqual([]);
    });

    it('the two values are floor(1/cov) and ceil(1/cov) — the ideal pitch, quantized', () => {
      const ladder = V.Scene3D.SurfaceFill.__ladderForTest;
      [0.2, 0.25, 0.33, 0.42, 0.5, 0.62, 0.75].forEach((cov) => {
        const keep = ladder(new Array(200).fill(cov));
        const kept = [];
        keep.forEach((k, i) => { if (k) kept.push(i); });
        const d = distinct(gapsOf(kept));
        const lo = Math.floor(1 / cov);
        const hi = Math.ceil(1 / cov);
        d.forEach((g) => expect(g >= lo && g <= hi).toBe(true));
        // ...and the count is the coverage, so tone still means density.
        expect(Math.abs(kept.length / 200 - cov)).toBeLessThan(0.02);
      });
    });

    it('tracks a RAMPING coverage: local density follows local coverage', () => {
      // The closed form `frac((i+1)·cov) < cov` is Bresenham only at a constant
      // coverage; where cov drifts it advances the phase by cov + i·cov' and the
      // kept density comes out wrong by i·cov'. The accumulator does not.
      const ladder = V.Scene3D.SurfaceFill.__ladderForTest;
      const N = 200;
      const covs = Array.from({ length: N }, (_, i) => 0.2 + (0.4 * i) / (N - 1));
      const keep = ladder(covs);
      const kept = [];
      keep.forEach((k, i) => { if (k) kept.push(i); });
      // First fifth vs last fifth: coverage 0.24 vs 0.56, so the kept count must
      // roughly double.
      const head = kept.filter((i) => i < N / 5).length;
      const tail = kept.filter((i) => i >= (4 * N) / 5).length;
      expect(head / (N / 5)).toBeGreaterThan(0.17);
      expect(head / (N / 5)).toBeLessThan(0.31);
      expect(tail / (N / 5)).toBeGreaterThan(0.49);
      expect(tail / (N / 5)).toBeLessThan(0.63);
      // ...and it is still locally even: neighbouring gaps step by one at most.
      const g = gapsOf(kept);
      const jumps = g.filter((v, i) => i > 0 && Math.abs(v - g[i - 1]) > 1).length;
      expect(jumps).toBe(0);
    });
  });

  describe('the real emitter on a real curved primitive', () => {
    // THE FIXTURE IS CHOSEN TO SHOW THE DEFECT, and it was measured both ways
    // before it was written. The shipped ladder [0.15, 0.4, 0.65, 0.9] at
    // Density 40 lands most rulings at a coverage above 0.5, where the
    // bit-reversed rank's power-of-two pair happens to BE {1, 2} — the defect
    // is invisible there. Drop the ladder to [0.08, 0.18, 0.3, 0.45] (a
    // legitimate setting: a lighter drawing) and the rank's gaps become {2, 4}
    // with nothing between, measured on the emitter:
    //   hatch/sphere   6 of 10 adjacent gap pairs DOUBLE   (now 0 of 10)
    //   hatch/capsule  7 of 21                             (now 1 of 22)
    //   contour/sphere 5 of 12                             (now 0 of 12)
    const LADDER = [0.08, 0.18, 0.3, 0.45];
    const DENSITY = 70;
    const scene = (mapper, primitive) => {
      const p = clone(defaults);
      p.seed = 0;
      p.camera = clone(CAMERA);
      p.ground = { enabled: true };
      p.backdrop = { enabled: false };
      p.lights = [clone(SUN)];
      p.objects = [{
        id: 'ob', name: 'Ob', primitive,
        params: { sx: 30, sy: 40, sz: 30, detail: 22 },
        transform: {
          x: 0, y: 55, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
        },
        visibility: 'solid',
      }];
      p.tone = {
        enabled: true,
        bands: 4,
        thresholds: [0.25, 0.5, 0.75],
        ladder: LADDER,
        specular: { enabled: true, size: 1 },
      };
      const style = {
        penId: null,
        mapper,
        params: {
          fillAngle: 45,
          fillDensity: DENSITY,
          fillCurves: false,
          fillSmoothing: 0.65,
          fillSimplify: 0,
          fillFidelity: 1,
          highlightTreatment: 'none',
        },
      };
      p.styleTable = {
        scene: clone(style),
        byObject: { ground: { penId: null, mapper: 'none', params: {} }, ob: clone(style) },
        byFace: {},
      };
      return p;
    };

    const emittedRuns = (mapper, primitive) => {
      const SF = V.Scene3D.SurfaceFill;
      const orig = SF.buildObject;
      const raw = [];
      SF.buildObject = function wrapped(opts) {
        const r = orig.call(this, opts);
        if (r) r.forEach((q) => raw.push(q));
        return r;
      };
      try {
        algo.generate(scene(mapper, primitive), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
      } finally {
        SF.buildObject = orig;
      }
      return raw;
    };

    // One entry per (side, family): the indices of the rulings that survived.
    const keptByFamily = (raw) => {
      const byFam = new Map();
      raw.forEach((p) => {
        if (p.lineIndex == null || typeof p.fam !== 'string') return;
        if (!p.fam.startsWith('A#')) return;      // ungated primary families only
        const k = `${p.back ? 'B' : 'F'}:${p.fam}`;
        if (!byFam.has(k)) byFam.set(k, []);
        byFam.get(k).push(p.lineIndex);
      });
      return [...byFam.entries()]
        .map(([k, v]) => ({ fam: k, kept: [...new Set(v)].sort((a, b) => a - b) }))
        .filter((f) => f.kept.length >= 6);
    };

    test.each([
      ['hatch', 'sphere'], ['hatch', 'capsule'], ['hatch', 'cylinder'],
      ['crosshatch', 'sphere'], ['contour', 'sphere'], ['contour', 'ellipsoid'],
    ])('%s on a %s: the pitch steps one line at a time, it does not DOUBLE', (mapper, primitive) => {
      const fams = keptByFamily(emittedRuns(mapper, primitive));
      expect(fams.length).toBeGreaterThan(0);
      const report = [];
      fams.forEach((f) => {
        const g = gapsOf(f.kept);
        // A tone ramp legitimately WIDENS the pitch across the form — that is
        // the drawing — so the whole-family gap set spans the ramp and is not
        // the thing to pin. What must not happen is a gap sitting beside one
        // TWICE its size on open surface, which is what a binary refinement
        // produces and what reads as an unexpected white band.
        const jumps = g.filter((v, i) => i > 0 && Math.abs(v - g[i - 1]) > 1).length;
        const frac = g.length > 1 ? jumps / (g.length - 1) : 0;
        if (frac > 0.10) report.push(`${f.fam} ${jumps}/${g.length - 1} doubled — gaps=[${g}]`);
      });
      expect(report).toEqual([]);
    });

    it('tone survives: the pitch still opens up toward the light', () => {
      // A perfectly even family that ignored coverage would pass every spacing
      // assertion above and be a uniform object, which is the other failure.
      const fams = keptByFamily(emittedRuns('hatch', 'sphere'));
      const all = fams.reduce((acc, f) => acc.concat(gapsOf(f.kept)), []);
      expect(all.length).toBeGreaterThan(6);
      expect(Math.max.apply(null, all)).toBeGreaterThanOrEqual(Math.min.apply(null, all) * 2);
    });
  });
});
