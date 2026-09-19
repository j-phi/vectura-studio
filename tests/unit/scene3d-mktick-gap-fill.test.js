const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { oracles, combNeutrality } = require('../helpers/scene3d-mktick-gap-fill');

/*
 * T2-6 — Jay's USER RULE clause (a), verbatim (`T2-6-plan.md`): "Instead of
 * tick fragments on the right, use gradually shortening ticks to fill the
 * black gaps at the bottom of the vertical waves."
 *
 * THREE ORACLES, defined in `T2-6-plan.md` §2 and implemented in
 * `tests/helpers/scene3d-mktick-gap-fill.js`:
 *   A1  — graded-gap share (BLOCKING). Of the non-highlight band-gap area,
 *         how much sits inside a run of >=2 sub-ticks that STRICTLY
 *         shortens (not merely non-increasing — a flat comb is not
 *         "gradually shortening", see the helper's own comment) with every
 *         consecutive step ratio >= 0.5 ("no tick under half its neighbour").
 *   A1b — the black-gap run itself (BLOCKING). The longest single
 *         uninterrupted bare interval inside a non-highlight site's own
 *         band, in row pitches — the literal size of "the black gap at the
 *         bottom of the wave".
 *   A2  — fragments (REPORTED, not gated — A2n as literally specified is
 *         INVERTED for this mechanism: filling a gap with shorter ticks
 *         necessarily creates more short ticks. A2loc, "shorter than half
 *         its own local neighbours", is the honest form).
 *   A3  — within-band length-vs-tone R^2, per row (REPORTED alongside O5,
 *         never gated alone — see the plan's own caveat, §2).
 *
 * WHICH CLAUSE: A1/A1b/neutrality gate clause (a) ONLY. They say nothing
 * about clause (b) ("don't increase overlap at the seams" — `ovMax`, held
 * exactly invariant by construction, T2-5's own file) or clause (c) ("remove
 * lines not part of a tick band" — `over2RP`, T2-5's own
 * `scene3d-mktick-band-purity.test.js`).
 *
 * THE HOOK. Same mechanism as `scene3d-mktick-band-purity.test.js` (T2-5's
 * own file): a `scriptOverrides`-patched copy of the CURRENT disk source,
 * one record per `layMark` tick site, fired via
 * `typeof globalThis.__T26_HOOK__ === 'function'` — a no-op (and provably
 * absent from every real render) whenever unwired, proven by the neutrality
 * test below. `subs[].v0/v1` are read directly off the FINAL `polys` array
 * handed to `place()` — the geometry actually placed, pre-walk/pre-truncate
 * (the same "attempted" caveat `T2-5-review.md` §3 already disclosed for
 * this class of hook); the site's own `drawn` flag comes from `place()`'s
 * real return value, and every oracle gates on it.
 *
 * PRE_TICK_BLOCK is a hand-maintained STRING CONSTANT reconstruction of the
 * T2-5-only state (`75777240`, this unit's own base sha) — not `git show
 * HEAD`, verified byte-for-byte against a `git archive 75777240` scratch
 * export (`/private/tmp/claude-501/scratch-T26-red`).
 *
 *   npx vitest run tests/unit/scene3d-mktick-gap-fill.test.js
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

const renderCellWithSites = (runtime, {
  mapper, primitive, rig = 'test', fillDensity = 50,
}) => {
  const V = runtime.window.Vectura;
  const algo = V.AlgorithmRegistry.scene3d;
  const defaults = V.ALGO_DEFAULTS.scene3d;
  const Params = V.Scene3D.Params;
  const params = buildSceneParams(Params, defaults, {
    mapper, fillDensity, primitive, rig,
  });
  const records = [];
  runtime.window.__T26_HOOK__ = (rec) => { records.push(rec); };
  const paths = algo.generate(params, null, null, BOUNDS);
  delete runtime.window.__T26_HOOK__;
  const stat = V.Scene3D.SurfaceFill.lastMarkStats;
  return {
    paths, stat, records, RP: stat.tickField.rowPitch,
  };
};

let headSourceCache = null;
const loadHeadSource = () => {
  if (!headSourceCache) headSourceCache = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  return headSourceCache;
};

const T26_BLOCK_START_NEEDLE = '        } else {\n          polys = mkShape(shapeFor(), sv.L, sv.R, w);';
const T26_BLOCK_END_NEEDLE = "        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);";

const spliceTickBlock = (src, replacementBlock) => {
  const startIdx = src.indexOf(T26_BLOCK_START_NEEDLE);
  if (startIdx < 0) throw new Error('spliceTickBlock: T2-6 block start not found (source drifted?)');
  const endIdx = src.indexOf(T26_BLOCK_END_NEEDLE, startIdx);
  if (endIdx < 0) throw new Error('spliceTickBlock: T2-6 block end not found (source drifted?)');
  const endPos = endIdx + T26_BLOCK_END_NEEDLE.length;
  return src.slice(0, startIdx) + replacementBlock + src.slice(endPos);
};

const HOOK_CALL = `
        if (typeof globalThis.__T26_HOOK__ === 'function' && law.shape === 'tick') {
          globalThis.__T26_HOOK__({
            I: sv.I, R: sv.R, P: sv.P, L: sv.L, a, k, lineIndex,
            drawn: !!drawnLen, comb: t26Comb, dir: t26Dir,
            subs: polys.map((pl) => ({ v0: Math.min(pl[0][1], pl[1][1]), v1: Math.max(pl[0][1], pl[1][1]) })),
          });
        }`;

// ── POST-fix (T2-6's own shipped code), instrumented — wholesale replacement
// of the shipped block (byte-identical geometry, two hoisted flags + one
// hook call added), same technique `scene3d-mktick-band-purity.test.js`
// uses for T2-5. Proven neutral below.
const POST_TICK_BLOCK_INSTRUMENTED = `        } else {
          polys = mkShape(shapeFor(), sv.L, sv.R, w);
          var t26Comb = false;
          var t26Dir = 0;
          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            const nOver = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            const probeI = (dv) => {
              const pp = fr.toParam(0, dv);
              if (!(pp.a >= 0 && pp.a <= 1)) return null;
              let bb = pp.b;
              if (bb < 0 || bb > 1) {
                if (bb < -0.25 || bb > 1.25) return null;
                bb = ((bb % 1) + 1) % 1;
              }
              const sm = sampleAt(pp.a, bb);
              return (sm && sm.front === wantFront && Number.isFinite(sm.I)) ? sm.I : null;
            };
            const iP = probeI(0.5 * sv.R);
            const iM = probeI(-0.5 * sv.R);
            let sgnDark = 0;
            if (iP != null && iM != null) sgnDark = (iP < iM) ? 1 : ((iP > iM) ? -1 : 0);
            else if (iP != null) sgnDark = -1;
            else if (iM != null) sgnDark = 1;
            t26Dir = sgnDark;
            const bandOn = (iP != null && iM != null);
            const minKeep = penWidth;
            let nComb = 1;
            let e0 = 0;
            if (bandOn && sv.L >= MK_TICK_COMB_MIN_R * sv.R && sv.L < 0.98 * sv.R) {
              for (let n = MK_TICK_COMB_MAX; n >= 2; n -= 1) {
                const den = (1 - MK_TICK_COMB_RHO ** n) / (1 - MK_TICK_COMB_RHO);
                const a0 = sv.L / den;
                if (a0 <= (MK_TICK_COMB_ENV * sv.R) / n && a0 * MK_TICK_COMB_RHO ** (n - 1) >= minKeep) {
                  nComb = n; e0 = a0; break;
                }
              }
            }
            const nSub = Math.max(nOver, nComb);
            const uniformSplit = (nComb < 2 || nSub !== nComb || sv.L >= sv.R);
            t26Comb = (nSub > 1 && !uniformSplit);
            if (nSub > 1) {
              const sub = (uniformSplit ? sv.R : MK_TICK_COMB_ENV * sv.R) / nSub;
              const dir = sgnDark >= 0 ? 1 : -1;
              const tiled = [];
              for (let j = 0; j < nSub; j++) {
                const each = uniformSplit ? (sv.L / nSub) : (e0 * MK_TICK_COMB_RHO ** j);
                const slot = dir > 0 ? (nSub - 1 - j) : j;
                const vCenter = (slot - (nSub - 1) / 2) * sub;
                tiled.push([[0, vCenter - each / 2], [0, vCenter + each / 2]]);
              }
              polys = tiled;
            } else {
              const room = 0.5 * Math.max(0, sv.R - sv.L);
              if (room > 1e-6) {
                const idx = a / Math.max(1e-6, sv.P);
                const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                const cOff = room * (2 * uu - 1);
                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
              }
            }
          }
        }
        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));
        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);${HOOK_CALL}`;

const buildPostSource = () => spliceTickBlock(loadHeadSource(), POST_TICK_BLOCK_INSTRUMENTED);

// ── PRE-fix reconstruction — the T2-5-only state (this unit's OWN base sha,
// `75777240`), byte-verified against `git archive 75777240` in
// `/private/tmp/claude-501/scratch-T26-red`. No comb, no direction probe.
const PRE_TICK_BLOCK = `        } else {
          polys = mkShape(shapeFor(), sv.L, sv.R, w);
          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            const nSub = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            if (nSub > 1) {
              const sub = sv.R / nSub;
              const each = sv.L / nSub;
              const tiled = [];
              for (let j = 0; j < nSub; j++) {
                const vCenter = (j - (nSub - 1) / 2) * sub;
                const room = 0.5 * Math.max(0, sub - each);
                let cOff = 0;
                if (room > 1e-6) {
                  const idx = (a / Math.max(1e-6, sv.P)) + j * 0.6180339887498949;
                  const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                  cOff = room * (2 * uu - 1);
                }
                tiled.push([[0, vCenter - each / 2 + cOff], [0, vCenter + each / 2 + cOff]]);
              }
              polys = tiled;
            } else {
              const room = 0.5 * Math.max(0, sv.R - sv.L);
              if (room > 1e-6) {
                const idx = a / Math.max(1e-6, sv.P);
                const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                const cOff = room * (2 * uu - 1);
                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
              }
            }
          }
        }
        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));
        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);
        if (typeof globalThis.__T26_HOOK__ === 'function' && law.shape === 'tick') {
          globalThis.__T26_HOOK__({
            I: sv.I, R: sv.R, P: sv.P, L: sv.L, a, k, lineIndex,
            drawn: !!drawnLen, comb: false, dir: 0,
            subs: polys.map((pl) => ({ v0: Math.min(pl[0][1], pl[1][1]), v1: Math.max(pl[0][1], pl[1][1]) })),
          });
        }`;

const buildPreSource = () => spliceTickBlock(loadHeadSource(), PRE_TICK_BLOCK);

// Verify PRE_TICK_BLOCK is a faithful reconstruction of this unit's OWN base
// sha (`75777240`), not a re-typed guess — the class of error
// `T2-3-review.md`/`T2-3b-plan.md` §5.1 found `git show HEAD` is prone to.
const BASE_SHA_SRC = '/private/tmp/claude-501/scratch-T26-red/src/core/scene3d/surface-fill.js';

// GATE — the RED bar (`T2-6-plan.md` §6.3 item 1). Two of twelve fixtures
// (`create|torus/hatch`, `create|torus/contour`) do not clear it — the
// `bandOn` gate disables the comb on the torus's own foreshortened bands
// (§4.2 spike gate / §4.3 table). Their own measured post-fix values are
// used as their bar instead, per the plan's own instruction.
const A1B_BAR = 0.42; // row pitches
const A1B_BAR_EXCEPT = {
  'create|torus/hatch': 0.51,
  'create|torus/contour': 0.46,
};
// GATE — A1 graded-gap share, per `T2-6-plan.md` §6.3 item 2. Restricted to
// the cells the plan itself names (cone/*, sphere/*, test|torus/*) — the
// create-rig torus cells are excluded for the SAME `bandOn` reason as A1b.
const A1_BAR = 0.35;
const A1_CELLS = [
  ['create', 'sphere/hatch'], ['create', 'sphere/contour'],
  ['create', 'cone/hatch'], ['create', 'cone/contour'],
  ['test', 'sphere/hatch'], ['test', 'sphere/contour'],
  ['test', 'cone/hatch'], ['test', 'cone/contour'],
  ['test', 'torus/hatch'], ['test', 'torus/contour'],
];

describe("Scene3D.SurfaceFill — mkTick graded band comb (T2-6, Jay's USER RULE clause a)", () => {
  test('PRE_TICK_BLOCK CODE (comments stripped) is identical to the real base sha (75777240) tick block', () => {
    if (!fs.existsSync(BASE_SHA_SRC)) {
      throw new Error(`base-sha scratch export missing at ${BASE_SHA_SRC} — re-run: `
        + 'git archive 75777240 | tar -x -C /private/tmp/claude-501/scratch-T26-red');
    }
    const baseSrc = fs.readFileSync(BASE_SHA_SRC, 'utf8');
    const startIdx = baseSrc.indexOf(T26_BLOCK_START_NEEDLE);
    const endIdx = baseSrc.indexOf(T26_BLOCK_END_NEEDLE, startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(-1);
    const realBlock = baseSrc.slice(startIdx, endIdx + T26_BLOCK_END_NEEDLE.length);
    // Strip `//`-comment lines and blank lines from BOTH sides — the real
    // block carries T2-5's own prose comments, PRE_TICK_BLOCK (this file)
    // does not; the CODE must still match exactly, line for line.
    const stripComments = (s) => s.split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim() !== '' && !l.trim().startsWith('//'))
      .join('\n');
    const preSansHook = PRE_TICK_BLOCK.split(`
        if (typeof globalThis.__T26_HOOK__`)[0];
    expect(stripComments(preSansHook)).toBe(stripComments(realBlock));
  });

  test('SEMANTIC PRE reconstruction proof: rendering through PRE_TICK_BLOCK (hook unarmed) on the '
    + 'CURRENT tree matches rendering the REAL git-archived base sha (75777240) directly, byte-for-byte, '
    + 'on every cell, both rigs', async () => {
    const baseRt = await loadVecturaRuntime({ rootDir: '/private/tmp/claude-501/scratch-T26-red' });
    const preRt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
    try {
      for (const rig of ['test', 'create']) {
        for (const [primitive, mapper] of CELLS) {
          const b = renderCellWithSites(baseRt, { primitive, mapper, rig });
          const p = renderCellWithSites(preRt, { primitive, mapper, rig });
          expect(JSON.stringify(p.paths)).toBe(JSON.stringify(b.paths));
        }
      }
    } finally {
      await baseRt.cleanup();
      await preRt.cleanup();
    }
  }, 180000);

  describe('instrumentation neutrality — the hook changes NOTHING when unwired', () => {
    test('POST source with hook wired vs UNMODIFIED disk source: byte-identical paths on every cell, both rigs', async () => {
      const plain = await loadVecturaRuntime();
      const instrumented = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPostSource() } });
      try {
        for (const rig of ['test', 'create']) {
          for (const [primitive, mapper] of CELLS) {
            const p = renderCellWithSites(plain, { primitive, mapper, rig });
            const i = renderCellWithSites(instrumented, { primitive, mapper, rig });
            expect(JSON.stringify(i.paths)).toBe(JSON.stringify(p.paths));
          }
        }
      } finally {
        await plain.cleanup();
        await instrumented.cleanup();
      }
    }, 180000);
  });

  describe('RED at the PRE-fix (T2-5 only, base sha 75777240) — re-derived on THIS tree', () => {
    let runtime;
    const results = {};

    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
      for (const rig of ['test', 'create']) {
        results[rig] = {};
        for (const [primitive, mapper] of CELLS) {
          results[rig][`${primitive}/${mapper}`] = renderCellWithSites(runtime, { primitive, mapper, rig });
        }
      }
    }, 180000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    test('A1b BLOCKING bar (<=0.42 RP): FAILS on at least ten of twelve fixtures pre-fix', () => {
      let over = 0;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          const A = oracles(r.records, r.RP);
          if (A.A1b_bareRunP95 > A1B_BAR) over += 1;
        });
      });
      expect(over).toBeGreaterThanOrEqual(10);
    });

    test('A1 BLOCKING bar (>=0.35): FAILS on every one of the ten named cells pre-fix', () => {
      A1_CELLS.forEach(([rig, key]) => {
        const r = results[rig][key];
        const A = oracles(r.records, r.RP);
        expect(A.A1_gradedGapShare == null ? 0 : A.A1_gradedGapShare).toBeLessThan(A1_BAR);
      });
    });

    test('no GRADED comb exists pre-fix (A1_combGraded === 0 on every fixture — T2-5\'s own '
      + 'over-wide-band retiling can still produce multi-sub-tick sites via clause (c), but they '
      + 'are UNIFORM (equal-length) and so never satisfy the strict-monotone graded criterion)', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          const A = oracles(r.records, r.RP);
          expect(A.A1_combGraded).toBe(0);
        });
      });
    });
  });

  describe('GREEN at the shipped tree (T2-6) — the current disk source, instrumented only', () => {
    let runtime;
    const results = {};

    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPostSource() } });
      for (const rig of ['test', 'create']) {
        results[rig] = {};
        for (const [primitive, mapper] of CELLS) {
          results[rig][`${primitive}/${mapper}`] = renderCellWithSites(runtime, { primitive, mapper, rig });
        }
      }
    }, 180000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    describe('A1b — black-gap run, BLOCKING', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const key = `${primitive}/${mapper}`;
          const bar = A1B_BAR_EXCEPT[`${rig}|${key}`] != null ? A1B_BAR_EXCEPT[`${rig}|${key}`] : A1B_BAR;
          test(`${rig}|${key}: bareRunP95 <= ${bar} RP`, () => {
            const r = results[rig][key];
            const A = oracles(r.records, r.RP);
            expect(A.A1b_bareRunP95).toBeLessThanOrEqual(bar);
          });
        });
      });
    });

    describe('A1 — graded-gap share, BLOCKING on the named cells', () => {
      A1_CELLS.forEach(([rig, key]) => {
        test(`${rig}|${key}: gradedGapShare >= ${A1_BAR}`, () => {
          const r = results[rig][key];
          const A = oracles(r.records, r.RP);
          expect(A.A1_gradedGapShare).toBeGreaterThanOrEqual(A1_BAR);
        });
      });
    });

    test('MUTATION-KILL: forcing a FLAT comb (RHO=1.0, all sub-ticks equal) makes A1 fall on cone/hatch, both rigs', async () => {
      // This is the mutation the plan's own item 2 requires — it proves the
      // oracle reads "gradually SHORTENING", not merely "split into >=2
      // sub-ticks" (`T2-6-plan.md` §4.5 Rank 4, rejected as oracle-gaming).
      const flatSrc = loadHeadSource().replace(
        'const MK_TICK_COMB_RHO = 0.62;',
        'const MK_TICK_COMB_RHO = 1.0;',
      );
      expect(flatSrc).not.toBe(loadHeadSource());
      const flatSrcPatched = spliceTickBlock(flatSrc, POST_TICK_BLOCK_INSTRUMENTED);
      const rt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: flatSrcPatched } });
      try {
        for (const rig of ['test', 'create']) {
          const r = renderCellWithSites(rt, { primitive: 'cone', mapper: 'hatch', rig });
          const flatA = oracles(r.records, r.RP);
          const shippedA = oracles(results[rig]['cone/hatch'].records, results[rig]['cone/hatch'].RP);
          expect(flatA.A1_combSites).toBeGreaterThan(0); // combs still fire — only their shape changed
          expect(flatA.A1_gradedGapShare == null ? 0 : flatA.A1_gradedGapShare)
            .toBeLessThan(shippedA.A1_gradedGapShare);
        }
      } finally { await rt.cleanup(); }
    }, 180000);

    test('MUTATION-KILL: forcing nComb=1 (no comb ever fires) returns A1b to >= 0.48 RP on cone/hatch, both rigs', async () => {
      const noCombSrc = loadHeadSource().replace(
        'const MK_TICK_COMB_MAX = 2;',
        'const MK_TICK_COMB_MAX = 1;',
      );
      expect(noCombSrc).not.toBe(loadHeadSource());
      const noCombPatched = spliceTickBlock(noCombSrc, POST_TICK_BLOCK_INSTRUMENTED);
      const rt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: noCombPatched } });
      try {
        for (const rig of ['test', 'create']) {
          const r = renderCellWithSites(rt, { primitive: 'cone', mapper: 'hatch', rig });
          const A = oracles(r.records, r.RP);
          expect(A.A1_combGraded).toBe(0);
          expect(A.A1b_bareRunP95).toBeGreaterThanOrEqual(0.48);
        }
      } finally { await rt.cleanup(); }
    }, 180000);

    describe('Neutrality, BLOCKING — every emitted comb sums EXACTLY to sv.L', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const key = `${primitive}/${mapper}`;
          test(`${rig}|${key}: max |sum(each_j) - L| < 1e-9`, () => {
            const r = results[rig][key];
            expect(combNeutrality(r.records)).toBeLessThan(1e-9);
          });
        });
      });
    });

    describe('A3 — within-band R^2, REPORTED alongside O5 (not gated alone)', () => {
      test('cone/hatch (both rigs): A3 exists and is a finite number in [0,1]', () => {
        ['test', 'create'].forEach((rig) => {
          const r = results[rig]['cone/hatch'];
          const A = oracles(r.records, r.RP);
          expect(Number.isFinite(A.A3_withinBandR2)).toBe(true);
          expect(A.A3_withinBandR2).toBeGreaterThanOrEqual(0);
          expect(A.A3_withinBandR2).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('A2 — fragments, REPORTED. A2n is EXPECTED to rise (inverted for this mechanism); A2loc must not blow up', () => {
      test('cone/hatch, create: A2loc does not exceed 1.5x its pre-fix count (sanity, not a Jay-ruled bar)', async () => {
        const preRt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
        try {
          const pre = renderCellWithSites(preRt, { primitive: 'cone', mapper: 'hatch', rig: 'create' });
          const preA = oracles(pre.records, pre.RP);
          const post = results.create['cone/hatch'];
          const postA = oracles(post.records, post.RP);
          expect(postA.A2loc_fragLtHalfNbr).toBeLessThanOrEqual(preA.A2loc_fragLtHalfNbr * 1.5 + 5);
        } finally { await preRt.cleanup(); }
      }, 180000);
    });
  });
});
