const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  wedgeFromMasks, measureWedge, siteCoverage, lengthCarriesTone,
} = require('../helpers/scene3d-mktick-wedge');
const { pathSignature } = require('../helpers/path-signature');

/*
 * T2-3 — mkTick's RASTERISED BARE-WEDGE ORACLE (R2) + the length-carries-
 * tone oracle (R1). `docs/3d-audit/lane-reports/T2-3-plan.md`.
 *
 * WHY THIS FILE EXISTS. `user-reports/8.png`, Jay's rule, has two clauses:
 *   R1 "ticks must have VARIABLE LENGTH ... tick length carries the tone."
 *   R2 "the field stays complete ... the only gaps allowed are where
 *       highlights are" (a HARD-EDGED gap, anywhere else, is the defect).
 * Two earlier units (T2 `dbad2d88`, T2-2 `9d911b05`) both shipped R1 and
 * were BOTH rejected on R2: `mkShape`'s `'tick'` branch spends its entire
 * length response in the ACROSS-ROW direction, centred on the row line
 * (`surface-fill.js`'s tick branch, ~:2637), so every mm the curve removes
 * opens a bare strip of `(R-L)/2` on BOTH sides of every row — a WEDGE,
 * because `L` grades along the row. `T2-3-plan.md` §0 measured T2 and T2-2
 * as the SAME RENDER on this defect (curves differ by <=1.15% of the
 * length range) — the curve was never the lever. `T2-2-review.md` §7's
 * BLOCKING finding was that NEITHER unit's own test suite could tell a
 * wedge-free render from a wedged one (the mean-of-thirds O5 oracle only
 * samples the two anchors' thirds and cannot see an interior plateau; a
 * "field stays complete" test in that unit duplicated an unrelated
 * wholesale-refusal check). This file is the missing instrument, landed
 * FIRST per the orchestrator's ruling, before the fix it gates.
 *
 * WHICH HALF EACH ORACLE GATES (state it, per the standing ruling):
 *   - `lengthCarriesTone` (the O5 tests below) gates R1 ONLY: mean drawn
 *     tick length, dark third vs light third, ratio >= 3.0 and monotone.
 *     It says NOTHING about whether the bare space between ticks is
 *     scattered (fine, legitimate light tone) or converged into a wedge
 *     (the defect) — that is R2, gated separately below.
 *   - `wedge25`/`holeMax` (the raster tests below) gate R2 ONLY: whether
 *     bare space, where it exists outside the highlight, reads as
 *     scattered texture or a converging hole. They say NOTHING about
 *     whether tick length actually carries tone (a law that never varied
 *     length at all — e.g. `chan:'count'` — would ALSO score well here,
 *     since a near-full-length tick everywhere leaves little bare space to
 *     measure; R1 is what rules that out).
 *   - `siteCoverage` is REPORTED, not gated, on purpose (see below) — it is
 *     the metric BOTH rejected units passed while shipping the wedge.
 *
 * THE RASTER (mutation-proved below, `wedgeFromMasks`'s own unit tests).
 * `mkStat.tickField` (`surface-fill.js`, gated to `law.shape === 'tick'`)
 * republishes the along-row field samples every ruling already computes —
 * no extra `sampleAt` calls — as flat `[x, y, I, ...]` triples plus
 * `rowPitch = masterPitch / MK_ROW_COV`. Each point is splatted as a disc
 * of radius `rowPitch/2` (the row's own half-pitch) at PPMM=6 px/mm
 * (a 0.1667mm raster cell — a 0.3mm pen stroke is ~1.8 px wide, fine enough
 * to resolve a bare gap of one pen width) to reconstruct the SHADED
 * SILHOUETTE (surface, non-highlight); the algorithm's own returned paths
 * are stamped as the ink mask; a two-pass chamfer distance transform from
 * ink gives, per shaded pixel, its distance to the nearest ink. `wedge25`
 * is the fraction of shaded pixels at least `0.25*rowPitch` from any ink
 * (a hole at least HALF a row pitch across); `holeMax` is the diameter (in
 * row pitches) of the single largest inscribed bare disc.
 *
 * HONEST METHODOLOGY LIMITATION, DISCLOSED (do not skip this). The plan's
 * own instrument (`T2-3-plan.md` §2) built its silhouette from a DENSE,
 * INDEPENDENT 461x461 continuous `sampleAt` sweep — a true 2D field. This
 * file's silhouette instead comes from mkTick's own coarse ALONG-ROW field
 * samples, isotropically splatted (no per-point row-direction vector is
 * available outside `surface-fill.js`'s own frame, and adding one would
 * mean sampling well outside the tick placement/MK-constants scope this
 * unit is granted). Measured consequence: every ROW ENDPOINT's disc
 * necessarily extends `rowPitch/2` past the row's own true tip (there is
 * no neighbouring sample beyond it to bound the disc), which the plan's
 * continuous field sweep does not suffer from. This raises this file's
 * absolute `wedge25`/`holeMax` readings well above the plan's own
 * (`~0.07-0.09` vs the plan's `~0.001-0.05`) and makes `holeMax`
 * ({@link SIX_CELL below}) DOMINATED by that endpoint artefact rather than
 * by the real defect (it barely moves between a staggered and an
 * un-staggered render on this fixture — MEASURED, not assumed, see the
 * mutation-kill below). Per the standing rule ("name what you do not
 * gate"): `holeMax` is REPORTED here, not gated. `wedge25`, however,
 * SURVIVES this noise floor as a real, monotone, cross-rig, six-cell signal
 * (measured below) — smaller in magnitude than the plan's own report, but
 * real — and IS gated, as a six-cell-MEAN blocking bar (the more robust
 * aggregate, exactly the reasoning `T2-3-plan.md` §2.4 used for its own W2)
 * plus a per-cell NON-REGRESSION ceiling (protects the stagger from being
 * silently reverted; per-cell separation from a no-stagger mutant is thin
 * on this instrument on some cells — disclosed in the mutation-kill below,
 * not hidden).
 *
 * MUTATION-KILL (BLOCKING, both directions):
 *   1. Instrument correctness, on hand-built SYNTHETIC masks (no renderer
 *      involved) — a fabricated wedge (two ink bands with a triangular gap
 *      between them) MUST trip `wedge25`/`holeMax`; a wedge-free, evenly
 *      speckled bare pattern (small holes, none far from ink) must NOT.
 *   2. Real-render mutation — the SAME `layMark` stagger insertion with
 *      `room` forced to 0 (i.e. this tree's own `chan:'len'` mechanism,
 *      full `L0=1.16`/`BLEND=0.92`, but centred on the row line exactly as
 *      T2/T2-2 shipped) MEASURED on both rigs, all six cells:
 *
 *        six-cell mean wedge25   | staggered (shipped) | no-stagger mutant
 *        addLayer/test rig       | 0.07622              | 0.08890  (+16.6%)
 *        create rig              | 0.08878              | 0.10278  (+15.8%)
 *
 *      Monotone in the SAME direction on all 12 cell x rig combinations
 *      individually (every one of the 6 cells, both rigs, mutant >=
 *      shipped — see the six-cell table in `T2-3-impl.md`). `holeMax` does
 *      NOT separate this way (both trees ~1.0-1.1 on every cell) — this is
 *      the measured basis for reporting, not gating, `holeMax`.
 *
 *   npx vitest run tests/unit/scene3d-mktick-wedge.test.js
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
const CELLS = [
  ['sphere', 'hatch'], ['sphere', 'contour'],
  ['torus', 'hatch'], ['torus', 'contour'],
  ['cone', 'hatch'], ['cone', 'contour'],
];

const buildSceneParams = (Params, defaults, {
  mapper, fillDensity, primitive, rig,
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
      penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw: 'mkTick' },
    },
    byObject: {},
    byFace: {},
  };
  return p;
};

const renderCell = (Vectura, { mapper, primitive, rig = 'test' }) => {
  const algo = Vectura.AlgorithmRegistry.scene3d;
  const defaults = Vectura.ALGO_DEFAULTS.scene3d;
  const Params = Vectura.Scene3D.Params;
  const params = buildSceneParams(Params, defaults, {
    mapper, fillDensity: 50, primitive, rig,
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

// ── MUTATION 2's needle: force the T2-3 stagger's own `room` to zero, i.e.
// this tree's `chan:'len'` mechanism (L0=1.16, BLEND=0.92) but centred on
// the row line exactly as T2/T2-2 shipped (the defect T2-review.md and
// T2-2-review.md both photographed).
const STAGGER_NEEDLE = "          if (law.shape === 'tick') {\n            const room = 0.5 * Math.max(0, sv.R - sv.L);";
const STAGGER_REPL = "          if (law.shape === 'tick') {\n            const room = 0; // MUTATION-KILL 2: stagger disabled";

// ── Six-cell mutation-kill 2 bars (blocking on the MEAN, non-regression
// ceiling per cell — see file header for the full measured table and the
// honest disclosure of why per-cell separation is thin on some cells).
const WEDGE_MEAN_BAR = { test: 0.0800, create: 0.0950 };
const WEDGE_CELL_CEILING = { test: 0.090, create: 0.180 };

describe('Scene3D.SurfaceFill — mkTick bare-wedge oracle (T2-3, R2) + O5 (R1)', () => {
  describe('instrument correctness — synthetic masks (no renderer)', () => {
    const PPMM = 6;
    const ROW_PITCH = 4.5; // mm, representative of the real fixture (~4.4-4.5)
    const W = 60 * PPMM; // 60mm wide raster
    const H = 20 * PPMM; // 20mm tall raster

    const blankSurf = () => new Uint8Array(W * H);
    const blankTone = (v) => new Float32Array(W * H).fill(v);

    test('a SYNTHETIC WEDGE (two ink bands, converging bare triangle between them) trips wedge25 and holeMax', () => {
      const surf = blankSurf();
      surf.fill(1); // whole raster is "on the object"
      const tone = blankTone(0.3); // well below the 0.90 highlight threshold everywhere
      const ink = new Uint8Array(W * H);
      // Two horizontal ink bands, `ROW_PITCH` px-worth apart in mm, leaving a
      // WIDE bare gap between them (a converging wedge in miniature: the gap
      // narrows toward one end of the raster).
      const rowPitchPx = Math.round(ROW_PITCH * PPMM);
      const topRow = Math.round(3 * PPMM);
      const botRow = topRow + rowPitchPx * 2; // two row-pitches apart -> a wide gap
      for (let x = 0; x < W; x += 1) {
        // taper the "ink extent" so the gap converges toward x=W (the wedge)
        const inkHalf = Math.round((1 - x / W) * 2 * PPMM) + 1;
        for (let dy = -inkHalf; dy <= inkHalf; dy += 1) {
          if (topRow + dy >= 0 && topRow + dy < H) ink[(topRow + dy) * W + x] = 1;
          if (botRow + dy >= 0 && botRow + dy < H) ink[(botRow + dy) * W + x] = 1;
        }
      }
      const r = wedgeFromMasks({
        W, H, surf, tone, ink, rowPitch: ROW_PITCH, ppmm: PPMM,
      });
      expect(r.wedge25).toBeGreaterThan(0.05);
      expect(r.holeMax).toBeGreaterThan(1.0); // a hole at least one full row pitch across
    });

    test('a WEDGE-FREE render (fine, evenly speckled bare gaps, none far from ink) does NOT trip wedge25/holeMax', () => {
      const surf = blankSurf();
      surf.fill(1);
      const tone = blankTone(0.3);
      const ink = new Uint8Array(W * H);
      // A dense, even grid of short ink dashes every ~1mm in both axes — the
      // bare space between them is small and uniform everywhere, never
      // converging into a hole.
      const stepPx = Math.round(1.0 * PPMM);
      for (let y = 0; y < H; y += stepPx) {
        for (let x = 0; x < W; x += 1) {
          if ((x % stepPx) < Math.round(0.6 * PPMM)) {
            for (let dy = 0; dy < Math.max(1, Math.round(0.3 * PPMM)); dy += 1) {
              if (y + dy < H) ink[(y + dy) * W + x] = 1;
            }
          }
        }
      }
      const r = wedgeFromMasks({
        W, H, surf, tone, ink, rowPitch: ROW_PITCH, ppmm: PPMM,
      });
      expect(r.wedge25).toBeLessThan(0.02);
      expect(r.holeMax).toBeLessThan(0.6);
    });

    test('bare area WITHIN the highlight zone (tone >= 0.90) is excluded — R2 explicitly allows gaps only there', () => {
      const surf = blankSurf();
      surf.fill(1);
      const tone = blankTone(0.95); // entirely highlight
      const ink = new Uint8Array(W * H); // zero ink anywhere
      const r = wedgeFromMasks({
        W, H, surf, tone, ink, rowPitch: ROW_PITCH, ppmm: PPMM,
      });
      // Every "surface" pixel is highlight, so there is nothing SHADED to
      // measure bare area over at all.
      expect(r.shadedPx).toBe(0);
      expect(r.wedge25).toBeNull();
    });
  });

  // ── T2-3b deliverable (a): the `git show HEAD:...` "RED at the pre-fix
  // tree" block above is provably vacuous at the commit that ships it — HEAD
  // IS the post-fix tree the instant this file's own commit lands, so the
  // second assertion throws inside `beforeAll` forever after
  // (`T2-3-review.md` §7, BLOCKING; the same anti-pattern `W-38b` removed
  // from `scene3d-facet-min-rulings.test.js`). Replaced with the `W-38b`
  // pattern: pinned `pathSignature` goldens (a string constant in THIS file,
  // not "the same code as the runtime under test") plus a live-disk-source
  // mechanism assertion. `docs/3d-audit/lane-reports/T2-3b-plan.md` §5.
  describe('mechanism assertions — read from the LIVE disk source, not `git show HEAD` (T2-3b)', () => {
    test("mkTick is on the T2-2/T2-3 chan:'len' mechanism, not the pre-fix chan:'count' design", () => {
      const src = loadHeadSource();
      expect(src).toMatch(/mkTick:\s*\{[^}]*chan: 'len'/);
      expect(src).not.toMatch(/mkTick:\s*\{[^}]*chan: 'count'/);
    });

    // T2-3b (b)'s own area floor — asserted once Rank 1 lands (see the
    // "T2-3b Rank 1" describe block below); kept as a single leg-2 site so
    // there is exactly one place asserting on the live disk source.
  });

  describe('pinned pathSignature goldens, both rigs, all six cells (RE-PIN ONLY WITH PROOF)', () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { paths } = renderCell(V, { primitive, mapper, rig });
          results[rig][`${primitive}/${mapper}`] = pathSignature(paths, 4);
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    // RE-PIN ONLY WITH PROOF (mutation-kill in the commit body/report; see
    // T2-3b-impl.md). Recorded from a run with this table empty — each miss
    // prints `'<rig>|<cell>': '<sha256>',` to paste back (the
    // `scene3d-hlr-spatial-index-identity.test.js` missing-entry convention).
    const EXPECTED_SIGNATURE = {
      'test|sphere/hatch': '75337a63beadeaca39d9b0510965780bd827f20b082a6d770caa946e34c65be5',
      'test|sphere/contour': 'bec156a1de2178377fbd95c1821ea7bb87d0f0107eb2cc26b9e623101038d9b9',
      'test|torus/hatch': 'ca54b4bc8d2b0fd8d646d9cefa23fb5927c0fe81e1b9ff651fef444bd38534cb',
      'test|torus/contour': '47e59f273ef1835b144abc0a6133f7301e3f484a0a5e8397b87b6ff52d324604',
      'test|cone/hatch': '70fa896b1d3f943a37641a0d74ffe6b6d8a64a8a0d71cbfce19708a2cd17e71e',
      'test|cone/contour': '885e02c9f5418caf68d49d168fbd08fe352ab8ae3f07b5ebb118156127216415',
      'create|sphere/hatch': '1d4447175fb39ff056d50928782e412eb0a7adc46d61df56687adc7c36daa5b5',
      'create|sphere/contour': 'c50bcc5381ff7fee1e7b34063230f1ee603bf4196a5645cc9f4daaddf554bad0',
      'create|torus/hatch': 'b879568127a3b2ac8658e2a8590ff36efb43215561e3705dd3d1b3f8be467392',
      'create|torus/contour': '5f6dec8e28919908d16265cdbfc4a07c416cbc4d074fedaeabd1498d512c5b21',
      'create|cone/hatch': '316724f75bb7eb89c2be5f5387115c5cbee91d9f9ef2e1ebb43acc2538c9a774',
      'create|cone/contour': '60ce1043a8fb22ec49ecb181090644d18d72ae4ad2a194c2b0454cc2ba27a82b',
    };

    ['test', 'create'].forEach((rig) => {
      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: pathSignature(paths, 4) is pinned`, () => {
          const key = `${rig}|${primitive}/${mapper}`;
          const actual = results[rig][`${primitive}/${mapper}`];
          const expected = EXPECTED_SIGNATURE[key];
          if (expected === 'PENDING') {
            // eslint-disable-next-line no-console
            console.log(`EXPECTED_SIGNATURE missing entry — paste this in: '${key}': '${actual}',`);
          }
          expect(actual).toBe(expected);
        });
      });
    });
  });

  describe('six-cell O5 (R1) — gated: length ratio >= 3.0, monotone, both rigs, ALL six cells', () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { stat } = renderCell(V, { primitive, mapper, rig });
          results[rig][`${primitive}/${mapper}`] = lengthCarriesTone(stat.lenByThird, stat.cntByThird);
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    ['test', 'create'].forEach((rig) => {
      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: O5 ratio >= 3.0 and monotone dark>=mid>=light`, () => {
          const r = results[rig][`${primitive}/${mapper}`];
          expect(r.ratio).not.toBeNull();
          expect(r.ratio).toBeGreaterThanOrEqual(3.0);
          expect(r.monotone).toBe(true);
        });
      });
    });
  });

  describe('six-cell wedge/hole (R2) — wedge25 gated (mean blocking, per-cell non-regression ceiling); holeMax + siteCoverage REPORTED only', () => {
    let runtime;
    const results = { test: {}, create: {} };

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const { paths, stat } = renderCell(V, { primitive, mapper, rig });
          const w = measureWedge({ tickField: stat.tickField, paths, penWidth: BOUNDS.penWidth });
          const cov = siteCoverage(stat.tickSites);
          results[rig][`${primitive}/${mapper}`] = { ...w, siteCoverage: cov };
        });
      });
    }, 120000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    ['test', 'create'].forEach((rig) => {
      test(`${rig} rig — six-cell MEAN wedge25 <= ${WEDGE_MEAN_BAR[rig]} (BLOCKING mutation-kill-2 bar)`, () => {
        const vals = CELLS.map(([p, m]) => results[rig][`${p}/${m}`].wedge25);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        expect(mean).toBeLessThanOrEqual(WEDGE_MEAN_BAR[rig]);
      });

      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: wedge25 <= ${WEDGE_CELL_CEILING[rig]} (non-regression ceiling)`, () => {
          expect(results[rig][`${primitive}/${mapper}`].wedge25).toBeLessThanOrEqual(WEDGE_CELL_CEILING[rig]);
        });
      });
    });

    test('holeMax and siteCoverage are non-vacuous numbers on every cell, both rigs (REPORTED, not gated — see file header)', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          expect(Number.isFinite(r.holeMax)).toBe(true);
          expect(r.siteCoverage).toBeGreaterThan(0.90);
        });
      });
    });
  });

  describe('MUTATION-KILL 2 — the T2-3 stagger, real render, both rigs, all six cells (proves wedge25 gates the PLACEMENT fix, not an unrelated diff)', () => {
    let shippedRuntime;
    let mutantRuntime;
    const shipped = { test: {}, create: {} };
    const mutant = { test: {}, create: {} };

    beforeAll(async () => {
      shippedRuntime = await loadVecturaRuntime();
      mutantRuntime = await loadVecturaRuntime({
        scriptOverrides: { [REL_PATH]: patchOne(loadHeadSource(), STAGGER_NEEDLE, STAGGER_REPL, 'STAGGER_NEEDLE') },
      });
      const SV = shippedRuntime.window.Vectura;
      const MV = mutantRuntime.window.Vectura;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const s = renderCell(SV, { primitive, mapper, rig });
          const m = renderCell(MV, { primitive, mapper, rig });
          shipped[rig][`${primitive}/${mapper}`] = measureWedge({ tickField: s.stat.tickField, paths: s.paths, penWidth: BOUNDS.penWidth });
          mutant[rig][`${primitive}/${mapper}`] = measureWedge({ tickField: m.stat.tickField, paths: m.paths, penWidth: BOUNDS.penWidth });
        });
      });
    }, 180000);

    afterAll(async () => {
      if (shippedRuntime) await shippedRuntime.cleanup();
      if (mutantRuntime) await mutantRuntime.cleanup();
    });

    ['test', 'create'].forEach((rig) => {
      test(`${rig} rig — six-cell MEAN wedge25: shipped (staggered) < no-stagger mutant`, () => {
        const meanOf = (obj) => {
          const vals = CELLS.map(([p, m]) => obj[rig][`${p}/${m}`].wedge25);
          return vals.reduce((a, b) => a + b, 0) / vals.length;
        };
        expect(meanOf(shipped)).toBeLessThan(meanOf(mutant));
      });

      CELLS.forEach(([primitive, mapper]) => {
        test(`${rig} rig — ${primitive}/${mapper}: shipped wedge25 <= no-stagger mutant's (monotone direction, per cell)`, () => {
          const key = `${primitive}/${mapper}`;
          expect(shipped[rig][key].wedge25).toBeLessThanOrEqual(mutant[rig][key].wedge25);
        });
      });
    });
  });
});
