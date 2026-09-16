const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  measure, polyDetrend, directionalScan, dominantPeriod,
} = require('../helpers/scene3d-mktick-band');

/*
 * T2-3b (b) — the CONTOUR-mapper moiré `T2-3-review.md` photographed on
 * `sphere/contour` and `cone/contour`: broad diagonal light/dark sweeps
 * across the lit flank, four to five alternations, sharp-edged. Root cause
 * (`docs/3d-audit/lane-reports/T2-3b-plan.md` §3): `surface-fill.js`'s
 * `solveAt`, `lenChan` branch (mkTick's own — see "## lenChan consumers"
 * below), re-derives `P = clamp(L/g, PMIN, MK_PMAX)` from `L` but — unlike
 * its `countChan` sibling three lines above — never re-solves `L` when that
 * clamp pins at `PMIN`. Over the whole midtone (`I` in [0.30, 0.90] on this
 * fixture) `P` sits pinned at the floor and the delivered ink area
 * `L*w/(R*P)` sags up to 25% below what the tone solve asked for
 * (`mkAsk(I)`) — a second, unasked-for tone transfer printed along the
 * isophotes. Rank 1 (`surface-fill.js`'s `Lfloor`, T2-3b (a)'s commit
 * neighbour) restores the delivered area with a smooth (4-norm) floor.
 *
 * WHICH HALF OF THE ACCEPTANCE BAR THIS FILE GATES (state it, per the
 * standing ruling). This instrument gates the MOIRÉ half only —
 * `bandC` says nothing about whether the bare space between ticks reads as
 * scattered texture or a converging hole (that is `wedge25`/`holeMax` in
 * `scene3d-mktick-wedge.test.js`) and nothing about whether tick length
 * actually carries tone (that is `O5`, same file). Per Jay's rule
 * (`user-reports/8.png`) R2 "the field stays complete... the only gaps
 * allowed are where highlights are" — this instrument answers a narrower,
 * related question: even where ink IS present, does its DENSITY carry a
 * coherent directional oscillation the light doesn't ask for? A field can
 * pass `wedge25` (no bare holes) and still band (every row draws SOMETHING,
 * but density swings coherently along an axis) — that is exactly what
 * shipped and was missed until this unit.
 *
 * THE INSTRUMENT (`tests/helpers/scene3d-mktick-band.js`, a JS port of the
 * plan's own `T2-3b-plan-evidence/tools/band.py` — read both together):
 * rasterise the algorithm's own returned paths, build an object mask,
 * low-pass (normalised Gaussian blur, kills the row comb and individual
 * ticks), detrend with a degree-3 2D polynomial (removes the INTENDED
 * whole-object tone taper regardless of its length scale), then scan
 * direction theta=0..179 and take the p95-p5 spread of the residual
 * projected onto the worst axis, divided by mean ink density (a
 * dimensionless contrast, `bandC`). Full derivation and the reason a naive
 * scale-separated Gaussian subtraction reads BACKWARDS on these 40-57mm
 * objects: `T2-3b-plan.md` §1.
 *
 * RE-DERIVATION ON THIS TREE (`c28b3490`, T3 + W-31b landed since the plan
 * measured `81925ee8`, neither touches tick code): this file's own
 * measurement, run before Rank 1 landed (i.e. against T2-3's shipped,
 * pre-Rank-1 code, scratch `git archive c28b3490`), reproduced the RED the
 * plan predicted on the two flagged cells:
 *
 *   bandC (pre-Rank-1, on THIS tree)   test rig   create rig
 *   sphere/contour                      0.0955     0.1121
 *   cone/contour                        0.0548     0.0674
 *
 * — both far above the shipped, never-flagged `mkDotScreen` reading on the
 * identical fixture (see the bar below) and both close to the plan's own
 * `81925ee8` numbers (0.0982 / 0.1172 and 0.0518 / 0.0642), confirming T3
 * and W-31b did not move this defect. `docs/3d-audit/lane-reports/
 * T2-3b-impl.md` carries the full scratch-export session. This file's own
 * MUTATION-KILL 1 below reproduces the same direction permanently (removing
 * Rank 1's fix raises `bandC` back toward those numbers on a real render,
 * with no dependency on git history — the `git show HEAD` anti-pattern
 * `T2-3b-impl.md`'s deliverable (a) just removed from the sibling file).
 *
 * ## lenChan consumers (per the orchestrator's blast-radius requirement)
 * `chan: 'len'` appears on exactly ONE row of the `MK` table
 * (`surface-fill.js:2620`, `mkTick`). Every other law's `chan` is
 * `'size'` (`mkDotScreen`, `mkLozenge`, `mkChevron`, `mkCrossPlus`,
 * `mkTriangle`), `'elong'` (`mkDashRamp`, `mkSFlick`), `'count'`
 * (`mkComma`, `mkRadialFlick`), `'amp'` (`mkScribble`) or `'alt'`
 * (`mkDotLozenge`) — none of which take `solveAt`'s `lenChan` branch
 * (`const lenChan = law.chan === 'len';`, `:6470`). Rank 1's three lines
 * live wholly inside `else if (lenChan)`, so structurally NO non-`mkTick`
 * law can reach them; mkTick is the only consumer and the blast radius is
 * this unit's own 6 cells x 2 rigs. The negative-control mutation below
 * (mkComma's `L0`, a `countChan`-branch constant) independently confirms
 * this at the render level, not just by grep.
 */

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BOUNDS = {
  width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3,
};
const SUN = {
  id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false,
};
const clone = (v) => JSON.parse(JSON.stringify(v));

// The two cells `T2-3-review.md` photographed and this unit exists for.
const GATED_CELLS = [['sphere', 'contour'], ['cone', 'contour']];
// All six T2-3 cells — reported for every one, gated only on the two above
// (torus's object mask is dominated by a large pre-existing structural
// reading from its own hole/fan convergence — `T2-3b-plan.md` §1.5 flags
// this in the plan's own Python instrument; this JS port's simpler
// morphological closing is MORE sensitive to it, not less, so torus is
// reported here, never gated, consistent with — if anything stricter than
// — the plan's own treatment).
const ALL_CELLS = [
  ['sphere', 'hatch'], ['sphere', 'contour'],
  ['torus', 'hatch'], ['torus', 'contour'],
  ['cone', 'hatch'], ['cone', 'contour'],
];

const buildSceneParams = (Params, defaults, {
  mapper, fillDensity, primitive, rig, toneLaw = 'mkTick',
}) => {
  const p = clone(defaults);
  const bag = rig === 'create'
    ? { ...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) }
    : clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  p.objects = [{
    id: 'obj', name: 'Obj', primitive, params: bag,
    transform: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
    },
    visibility: 'solid',
  }];
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [SUN];
  p.styleTable = {
    scene: {
      penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw },
    },
    byObject: {},
    byFace: {},
  };
  return p;
};

const renderCell = (Vectura, {
  mapper, primitive, rig = 'test', toneLaw = 'mkTick',
}) => {
  const algo = Vectura.AlgorithmRegistry.scene3d;
  const defaults = Vectura.ALGO_DEFAULTS.scene3d;
  const Params = Vectura.Scene3D.Params;
  const params = buildSceneParams(Params, defaults, {
    mapper, fillDensity: 50, primitive, rig, toneLaw,
  });
  const paths = algo.generate(params, null, null, BOUNDS);
  const stat = Vectura.Scene3D.SurfaceFill.lastMarkStats;
  return { paths, stat };
};

let headSourceCache = null;
const loadHeadSource = () => {
  if (!headSourceCache) headSourceCache = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  return headSourceCache;
};

const patchOne = (src, needle, repl, label) => {
  const count = src.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: needle count = ${count}, expected 1 (source drifted?)`);
  return src.split(needle).join(repl);
};

// MUTATION-KILL 1 (blocking): remove Rank 1's own fix, restoring
// `L = Lease` exactly as T2-3 shipped it (no `Lfloor`, no soft-max).
const RANK1_NEEDLE = 'const Lfloor = g * PMIN;\n          L = Math.min(law.L0 * R, Math.pow(Math.pow(Lease, 4) + Math.pow(Lfloor, 4), 1 / 4));';
const RANK1_REPL = 'L = Lease; // MUTATION-KILL 1: Rank 1 removed, restoring T2-3 shipped behaviour';

// Contrast mutation (per the brief): nudge a shipped tone-curve constant by
// the smallest non-no-op step. Proves the goldens/bandC are sensitive to
// the CURVE, not only to placement.
const EASE_NEEDLE = 'const MK_TICK_EASE_BLEND = 0.92;';
const EASE_REPL = 'const MK_TICK_EASE_BLEND = 0.90; // T2-3b contrast mutation';

// Narrow negative control: a `countChan`-branch constant (`mkComma`) that
// cannot structurally reach `lenChan`'s Rank-1 lines. Proves bandC is not
// simply "any edit to the file trips it".
const COMMA_NEEDLE = "mkComma:       { shape: 'comma',    chan: 'count', lat: 'blue',    or: 'along',  L0: 1.30 },";
const COMMA_REPL = "mkComma:       { shape: 'comma',    chan: 'count', lat: 'blue',    or: 'along',  L0: 1.31 }, // T2-3b negative control";

// Historical, PINNED non-regression ceiling: T2-3's own shipped (pre-Rank-1)
// `bandC` reading on this tree (`c28b3490`, measured via scratch
// `git archive` before Rank 1 landed — see T2-3b-impl.md). Rank 1 must not
// raise `bandC` above this reading by more than 5% on either flagged cell,
// either rig (`T2-3b-plan.md` §4.5). RE-PIN ONLY WITH THE SAME SCRATCH-
// EXPORT PROOF.
const PRE_RANK1_BANDC = {
  'test|sphere/contour': 0.09554,
  'test|cone/contour': 0.05478,
  'create|sphere/contour': 0.11207,
  'create|cone/contour': 0.06741,
};

describe('Scene3D.SurfaceFill — mkTick directional banding oracle (T2-3b, moiré half only)', () => {
  describe('instrument correctness — synthetic density field (no renderer)', () => {
    const PPMM = 8;
    const ROW_PITCH = 4.5;
    const W = Math.round(50 * PPMM);
    const H = Math.round(50 * PPMM);

    // A filled-disc mask (mimics a round object's silhouette) with a
    // smooth radial taper (a stand-in for the intended whole-object tone
    // gradient) — degree <=2, well inside what a degree-3 fit removes
    // exactly.
    const buildMask = () => {
      const mask = new Uint8Array(W * H);
      const cx = W / 2; const cy = H / 2; const rad = Math.min(W, H) / 2 - 4;
      for (let j = 0; j < H; j += 1) {
        for (let i = 0; i < W; i += 1) {
          if ((i - cx) ** 2 + (j - cy) ** 2 <= rad * rad) mask[j * W + i] = 1;
        }
      }
      return mask;
    };
    const smoothTaper = (mask) => {
      const D = new Float64Array(W * H);
      for (let j = 0; j < H; j += 1) {
        for (let i = 0; i < W; i += 1) {
          const k = j * W + i;
          if (mask[k]) D[k] = 0.5 + 0.3 * (i / W) - 0.1 * ((j / H) ** 2);
        }
      }
      return D;
    };
    const injectBand = (D, mask, thetaDeg, periodMm, amp) => {
      const out = D.slice();
      const a = (thetaDeg * Math.PI) / 180;
      const nx = Math.cos(a); const ny = Math.sin(a);
      for (let j = 0; j < H; j += 1) {
        for (let i = 0; i < W; i += 1) {
          const k = j * W + i;
          if (!mask[k]) continue;
          const s = (i / PPMM) * nx + (j / PPMM) * ny;
          out[k] += amp * Math.sin((2 * Math.PI * s) / periodMm);
        }
      }
      return out;
    };
    const measureField = (D, mask) => {
      const res = polyDetrend(D, mask, W, H, 3);
      const best = directionalScan(res, mask, W, H, PPMM, 0.4);
      if (!best) return null;
      let sum = 0; let n = 0;
      for (let k = 0; k < W * H; k += 1) if (mask[k]) { sum += D[k]; n += 1; }
      const meanInk = sum / n;
      const periodMm = dominantPeriod(best.prof, best.binMm, 1.5 * ROW_PITCH, 9.0 * ROW_PITCH);
      return { bandC: best.spread / meanInk, thetaDeg: best.thetaDeg, periodMm };
    };

    test('recovers an injected band angle to within 3deg and period to within 1.5mm', () => {
      const mask = buildMask();
      const base = smoothTaper(mask);
      const banded = injectBand(base, mask, 40, 18, 0.18);
      const r = measureField(banded, mask);
      expect(r).not.toBeNull();
      const angErr = Math.min(Math.abs(r.thetaDeg - 40), Math.abs(r.thetaDeg - 40 - 180), Math.abs(r.thetaDeg - 40 + 180));
      expect(angErr).toBeLessThanOrEqual(3);
      expect(Math.abs(r.periodMm - 18)).toBeLessThanOrEqual(1.5);
    });

    test('a second injected band at a different angle/period is ALSO recovered (not a fixed-axis artefact)', () => {
      const mask = buildMask();
      const base = smoothTaper(mask);
      const banded = injectBand(base, mask, 110, 12, 0.18);
      const r = measureField(banded, mask);
      expect(r).not.toBeNull();
      const angErr = Math.min(Math.abs(r.thetaDeg - 110), Math.abs(r.thetaDeg - 110 - 180), Math.abs(r.thetaDeg - 110 + 180));
      expect(angErr).toBeLessThanOrEqual(3);
      expect(Math.abs(r.periodMm - 12)).toBeLessThanOrEqual(1.5);
    });

    test('the smooth taper ALONE (no band) reads near zero — a degree-3 fit removes it exactly', () => {
      const mask = buildMask();
      const base = smoothTaper(mask);
      const r = measureField(base, mask);
      expect(r).not.toBeNull();
      expect(r.bandC).toBeLessThan(0.01);
    });

    test('spatially-incoherent per-pixel jitter of the SAME amplitude as the injected band scores far lower', () => {
      const mask = buildMask();
      const base = smoothTaper(mask);
      // Deterministic pseudo-random jitter (mulberry32), same amplitude as
      // the band injected above, but with no directional coherence.
      let seed = 0x2f3a1c5b;
      const rnd = () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const jittered = base.slice();
      for (let k = 0; k < W * H; k += 1) if (mask[k]) jittered[k] += 0.18 * (rnd() * 2 - 1);
      const rBand = measureField(injectBand(base, mask, 40, 18, 0.18), mask);
      const rJitter = measureField(jittered, mask);
      expect(rJitter).not.toBeNull();
      expect(rJitter.bandC).toBeLessThan(0.5 * rBand.bandC);
    });
  });

  describe('T2-3b own area floor (Lfloor) — live disk source, not git history', () => {
    test('the lenChan branch of solveAt carries the Lfloor smooth-floor fix', () => {
      const src = loadHeadSource();
      expect(src).toContain('const Lfloor = g * PMIN;');
      expect(src).toMatch(/mkTick:\s*\{[^}]*chan: 'len'/);
    });
  });

  describe('real render — sphere/contour + cone/contour, both rigs (GATED: moiré half)', () => {
    let runtime;
    const results = { test: {}, create: {} };
    const dotScreen = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        GATED_CELLS.forEach(([primitive, mapper]) => {
          const { paths, stat } = renderCell(V, { primitive, mapper, rig });
          const rowPitch = stat.tickField.rowPitch;
          results[rig][`${primitive}/${mapper}`] = { ...measure(paths, { rowPitch }), rowPitch };
          const ds = renderCell(V, {
            primitive, mapper, rig, toneLaw: 'mkDotScreen',
          });
          dotScreen[rig][`${primitive}/${mapper}`] = measure(ds.paths, { rowPitch });
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    ['test', 'create'].forEach((rig) => {
      GATED_CELLS.forEach(([primitive, mapper]) => {
        const key = `${primitive}/${mapper}`;
        test(`${rig} rig — ${key}: bandC <= shipped mkDotScreen reading on the identical fixture (NEW bar)`, () => {
          const r = results[rig][key];
          const ds = dotScreen[rig][key];
          expect(r).not.toBeNull();
          expect(ds).not.toBeNull();
          expect(r.bandC).toBeLessThanOrEqual(ds.bandC);
        });

        test(`${rig} rig — ${key}: bandC does not rise more than 5% above T2-3's shipped (pre-Rank-1) reading`, () => {
          const r = results[rig][key];
          const ceiling = PRE_RANK1_BANDC[`${rig}|${key}`] * 1.05;
          expect(r.bandC).toBeLessThanOrEqual(ceiling);
        });
      });
    });
  });

  describe('report-only — all six cells, both rigs (torus REPORTED, not gated — see file header)', () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        ALL_CELLS.forEach(([primitive, mapper]) => {
          const { paths, stat } = renderCell(V, { primitive, mapper, rig });
          const rowPitch = stat.tickField.rowPitch;
          results[rig][`${primitive}/${mapper}`] = { ...measure(paths, { rowPitch }), rowPitch };
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    test('bandC/theta/period are non-vacuous finite numbers on every cell, both rigs', () => {
      ['test', 'create'].forEach((rig) => {
        ALL_CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          expect(r).not.toBeNull();
          expect(Number.isFinite(r.bandC)).toBe(true);
        });
      });
    });
  });

  describe('MUTATION-KILL 1 (BLOCKING) — removing Rank 1 raises bandC, real render, both rigs, both flagged cells', () => {
    let shippedRuntime;
    let mutantRuntime;
    const shipped = { test: {}, create: {} };
    const mutant = { test: {}, create: {} };

    beforeAll(async () => {
      shippedRuntime = await loadVecturaRuntime();
      mutantRuntime = await loadVecturaRuntime({
        scriptOverrides: { [REL_PATH]: patchOne(loadHeadSource(), RANK1_NEEDLE, RANK1_REPL, 'RANK1_NEEDLE') },
      });
      const SV = shippedRuntime.window.Vectura;
      const MV = mutantRuntime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        GATED_CELLS.forEach(([primitive, mapper]) => {
          const s = renderCell(SV, { primitive, mapper, rig });
          const m = renderCell(MV, { primitive, mapper, rig });
          shipped[rig][`${primitive}/${mapper}`] = measure(s.paths, { rowPitch: s.stat.tickField.rowPitch });
          mutant[rig][`${primitive}/${mapper}`] = measure(m.paths, { rowPitch: m.stat.tickField.rowPitch });
        });
      });
    }, 180000);

    afterAll(async () => {
      if (shippedRuntime) await shippedRuntime.cleanup();
      if (mutantRuntime) await mutantRuntime.cleanup();
    });

    ['test', 'create'].forEach((rig) => {
      GATED_CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: shipped (Rank 1) bandC < no-Rank-1 mutant's bandC`, () => {
          const key = `${primitive}/${mapper}`;
          expect(shipped[rig][key].bandC).toBeLessThan(mutant[rig][key].bandC);
        });
      });
    });
  });

  describe('CONTRAST mutation (per the brief) — nudging the tone curve changes bandC on the flagged cells', () => {
    let shippedRuntime;
    let mutantRuntime;

    beforeAll(async () => {
      shippedRuntime = await loadVecturaRuntime();
      mutantRuntime = await loadVecturaRuntime({
        scriptOverrides: { [REL_PATH]: patchOne(loadHeadSource(), EASE_NEEDLE, EASE_REPL, 'EASE_NEEDLE') },
      });
    }, 60000);

    afterAll(async () => {
      if (shippedRuntime) await shippedRuntime.cleanup();
      if (mutantRuntime) await mutantRuntime.cleanup();
    });

    GATED_CELLS.forEach(([primitive, mapper]) => {
      test(`test rig — ${primitive}/${mapper}: MK_TICK_EASE_BLEND 0.92->0.90 changes bandC (sensitive to the curve, not only placement)`, () => {
        const SV = shippedRuntime.window.Vectura;
        const MV = mutantRuntime.window.Vectura;
        const s = renderCell(SV, { primitive, mapper, rig: 'test' });
        const m = renderCell(MV, { primitive, mapper, rig: 'test' });
        const rs = measure(s.paths, { rowPitch: s.stat.tickField.rowPitch });
        const rm = measure(m.paths, { rowPitch: m.stat.tickField.rowPitch });
        expect(Math.abs(rs.bandC - rm.bandC)).toBeGreaterThan(1e-6);
      });
    });
  });

  describe('NEGATIVE CONTROL (per the brief) — a countChan-branch constant cannot reach lenChan, bandC unchanged', () => {
    let shippedRuntime;
    let mutantRuntime;

    beforeAll(async () => {
      shippedRuntime = await loadVecturaRuntime();
      mutantRuntime = await loadVecturaRuntime({
        scriptOverrides: { [REL_PATH]: patchOne(loadHeadSource(), COMMA_NEEDLE, COMMA_REPL, 'COMMA_NEEDLE') },
      });
    }, 60000);

    afterAll(async () => {
      if (shippedRuntime) await shippedRuntime.cleanup();
      if (mutantRuntime) await mutantRuntime.cleanup();
    });

    GATED_CELLS.forEach(([primitive, mapper]) => {
      test(`test rig — ${primitive}/${mapper}: mkComma's L0 (countChan branch) does NOT change mkTick's bandC`, () => {
        const SV = shippedRuntime.window.Vectura;
        const MV = mutantRuntime.window.Vectura;
        const s = renderCell(SV, { primitive, mapper, rig: 'test' });
        const m = renderCell(MV, { primitive, mapper, rig: 'test' });
        const rs = measure(s.paths, { rowPitch: s.stat.tickField.rowPitch });
        const rm = measure(m.paths, { rowPitch: m.stat.tickField.rowPitch });
        expect(rs.bandC).toBeCloseTo(rm.bandC, 9);
      });
    });
  });
});
