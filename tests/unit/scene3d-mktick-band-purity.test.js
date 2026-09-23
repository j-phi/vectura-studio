const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * T2-5's band-purity oracle (O-A/O-B/O-C1/O-C2), RETIRED — T2-7 (Jay's
 * `eye_t26` ruling, "BUILD proto6 DIRECTION", `T2-7-plan.md` Amendment 4).
 *
 * WHY. This file's O-A/O-B/O-C oracles worked by SPLICING a hand-maintained
 * string reconstruction of `layMark`'s `if (law.shape === 'tick') { ... }`
 * block (`POST_TICK_BLOCK_INSTRUMENTED`/`PRE_TICK_BLOCK`) with one hook call
 * per emitted sub-tick, in the shape `{I,R,P,L,a,k,band,each,cOff,nSub,j}` —
 * T2-3's row-wide stagger's own vocabulary (a single tick, offset by `cOff`
 * within a band of width `band`). T2-7 replaces that ENTIRE mechanism: mkTick
 * no longer computes a stagger offset or a comb split at all — `solveAt`'s
 * own tick branch now returns a `segs` array of absolute v-ranges (main
 * band + graded band-fill pieces + limb/rim chain ticks), each placed as its
 * own independent mark. There is no `cOff`/`band`/`nSub`/`j` left to hook —
 * maintaining a hand-copied mirror of the new, much larger block would
 * reproduce exactly the "stale hand-copy" trap `T2-6`'s own §4a and this
 * file's own header once warned about, for no benefit: T2-7's real-neighbour
 * extents, contact-free seams and graded pieces are measured DIRECTLY off
 * the algorithm's own EMITTED PATHS in `scene3d-mktick-spacing-tone.test.js`
 * (a strictly more robust methodology than a source splice — see that
 * file's own header), not off a hook.
 *
 * REPLACEMENT MAP (`## Bars changed`):
 *   - O-A (roughP95, lenToneR2n; clauses "fragments"/"gradually shortening")
 *     -> `scene3d-mktick-spacing-tone.test.js` T4/T10/T11 (gradual tone,
 *     bareSeamFrac/limbGapFrac) and the 15-spot picture checklist in
 *     `T2-7-impl.md` (G2a/G2b/G5/G3 — the picture beats the bar).
 *   - O-B (ovMax, "don't increase overlap at the seams") -> T6 (B8e), a
 *     TIGHTENING measured on emitted paths, not a hook.
 *   - O-C1 (purity) / O-C2 (over2RP, "remove any lines not part of a tick
 *     band") -> T7 (B9), measured on emitted paths.
 * The synthetic/instrument-correctness style tests these oracles used are
 * superseded, not preserved separately, because the new instruments (B8e,
 * B9, SP5, B1, B3) are simple closed-form measurements over `paths`/
 * `lastMarkStats`, not a raster or a hook needing its own correctness proof
 * the way the old wedge/band rasterisers did.
 *
 * KEPT — two structural checks (no hand-copy dependency, CI-safe: no git
 * history, no scratch paths, no child_process):
 *   1. A live-disk-source mechanism assertion (T2-7's segs-based tick branch
 *      is present; T2-6's comb literal is gone).
 *   2. An ISOLATION mutation-kill: a needle that disables `law.shape ===
 *      'tick'` itself (renames the shape check to an unreachable string) and
 *      confirms every OTHER law's render (`mkDotScreen`, `mkDashRamp`,
 *      `mkComma`) is byte-identical with and without T2-7's tick branch
 *      reachable — the direct, non-hand-copied version of the roster sweep's
 *      own claim ("no non-mkTick law can reach this unit's code").
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

const buildSceneParams = (Params, defaults, {
  mapper, fillDensity, primitive, rig, law,
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
      penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw: law },
    },
    byObject: {},
    byFace: {},
  };
  return p;
};

const renderOne = (runtime, {
  primitive, mapper, rig, law,
}) => {
  const V = runtime.window.Vectura;
  const algo = V.AlgorithmRegistry.scene3d;
  const defaults = V.ALGO_DEFAULTS.scene3d;
  const Params = V.Scene3D.Params;
  const p = buildSceneParams(Params, defaults, {
    mapper, fillDensity: 50, primitive, rig, law,
  });
  return algo.generate(p, null, null, BOUNDS);
};

const patchOne = (src, needle, repl, label) => {
  const count = src.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: needle count = ${count}, expected 1 (source drifted?)`);
  return src.split(needle).join(repl);
};

describe('Scene3D.SurfaceFill — mkTick band-purity oracle (T2-5) — RETIRED, replaced by T2-7 spacing-tone bars', () => {
  test('mechanism assertion — mkTick is on the T2-7 (segs-based) mechanism, not the pre-fix stagger/comb', () => {
    const src = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
    expect(src).toMatch(/law\.shape === 'tick' && sv\.segs/);
    expect(src).not.toMatch(/MK_TICK_COMB_RHO \*\* j/);
  });

  describe('ISOLATION — T2-7 is gated on law.shape===\'tick\'; no other law can reach it', () => {
    const md5 = (paths) => crypto.createHash('md5').update(JSON.stringify(paths)).digest('hex');
    const CELLS = [
      ['sphere', 'hatch', 'mkDotScreen'],
      ['sphere', 'hatch', 'mkDashRamp'],
      ['cone', 'contour', 'mkComma'],
    ];

    test('every non-tick law renders byte-identically whether or not the tick shape check can ever match', async () => {
      const shippedRuntime = await loadVecturaRuntime();
      // The needle disables ONLY the `law.shape === 'tick'` literal `solveAt`
      // gates on (an unreachable string), so every OTHER law's own `chan`/
      // `lat` arithmetic is provably unaffected by whatever mkTick's own
      // branch does — this is the isolation proof the roster sweep's own
      // claim rests on, done directly rather than via a hand-copied splice.
      const src = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
      const mutated = patchOne(
        src,
        "if (law.shape === 'tick') {\n          const PMINT = (1 + MK_TICK_GAP_PEN) * w;",
        "if (law.shape === '__t27_disabled__') {\n          const PMINT = (1 + MK_TICK_GAP_PEN) * w;",
        'TICK_GATE_NEEDLE',
      );
      const mutantRuntime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: mutated } });
      try {
        for (const [primitive, mapper, law] of CELLS) {
          const s = renderOne(shippedRuntime, {
            primitive, mapper, rig: 'create', law,
          });
          const m = renderOne(mutantRuntime, {
            primitive, mapper, rig: 'create', law,
          });
          expect(md5(m)).toBe(md5(s));
        }
      } finally {
        await shippedRuntime.cleanup();
        await mutantRuntime.cleanup();
      }
    }, 60000);

    test('MUTATION-KILL (proves the gate matters): mkTick itself DOES change when the same gate is disabled', async () => {
      const shippedRuntime = await loadVecturaRuntime();
      const src = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
      const mutated = patchOne(
        src,
        "if (law.shape === 'tick') {\n          const PMINT = (1 + MK_TICK_GAP_PEN) * w;",
        "if (law.shape === '__t27_disabled__') {\n          const PMINT = (1 + MK_TICK_GAP_PEN) * w;",
        'TICK_GATE_NEEDLE',
      );
      const mutantRuntime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: mutated } });
      try {
        const s = renderOne(shippedRuntime, {
          primitive: 'cone', mapper: 'hatch', rig: 'create', law: 'mkTick',
        });
        const m = renderOne(mutantRuntime, {
          primitive: 'cone', mapper: 'hatch', rig: 'create', law: 'mkTick',
        });
        expect(md5(m)).not.toBe(md5(s));
      } finally {
        await shippedRuntime.cleanup();
        await mutantRuntime.cleanup();
      }
    }, 60000);
  });

  // ── ROSTER MD5 SWEEP (standing rule 2: coverage as a fraction, exclusions
  // justified). Reduced coverage, disclosed: 3 mappers (hatch/crosshatch/
  // contour, the only ones mkTick's mark-emission path can structurally
  // reach) x PRODUCTION laws, on cone/create — a smoke sweep confirming
  // every law×mapper combination renders without throwing (the isolation
  // block above is what actually proves "only mkTick moves"; this sweep
  // adds breadth across the full law roster, which the isolation block's 3
  // hand-picked laws do not cover).
  //
  // Merge r5, 2026-09-23: split per mapper, same as CI-6 (`a3594462`) split
  // the pre-T2-7 roster sweep this block replaced — SAME population (same 3
  // mappers, same LAWS, same cone/create fixture), runtime load hoisted to a
  // shared beforeAll, 900000ms per test. The single-test 300000ms form this
  // lane shipped was written before CI-6 landed and would put the whole
  // ~111-cell sweep back under one budget in the coverage job.
  describe('ROSTER SMOKE SWEEP — 3 mappers (hatch/crosshatch/contour) x PRODUCTION laws render without error', () => {
    let runtime;
    let LAWS;
    let SWEEP_MAPPERS;

    beforeAll(async () => {
      runtime = await loadVecturaRuntime();
      const V = runtime.window.Vectura;
      const MAPPERS = V.Scene3D.Params.MAPPERS
        || ['none', 'hatch', 'wireframe', 'crosshatch', 'contour', 'spiral', 'stipple', 'contourSlice'];
      LAWS = (V.SCENE3D_TONE_LAWS && V.SCENE3D_TONE_LAWS.PRODUCTION) || [];
      expect(MAPPERS.length).toBe(8);
      expect(LAWS.length).toBeGreaterThanOrEqual(30);
      SWEEP_MAPPERS = MAPPERS.filter((m) => ['hatch', 'crosshatch', 'contour'].includes(m));
      expect(SWEEP_MAPPERS.length).toBe(3);
    }, 180000);

    afterAll(async () => {
      if (runtime) await runtime.cleanup();
    });

    ['hatch', 'crosshatch', 'contour'].forEach((mapper) => {
      test(`cone/create, mapper=${mapper}: every PRODUCTION law renders a finite path array`, () => {
        expect(SWEEP_MAPPERS).toContain(mapper);
        let total = 0;
        let mkTickCells = 0;
        LAWS.forEach((law) => {
          total += 1;
          const paths = renderOne(runtime, {
            primitive: 'cone', mapper, rig: 'create', law,
          });
          expect(Array.isArray(paths)).toBe(true);
          if (law === 'mkTick') mkTickCells += 1;
        });
        // eslint-disable-next-line no-console
        console.log(`T2-7 roster smoke sweep [${mapper}]: ${total} cells rendered (${LAWS.length} laws), ${mkTickCells} of them mkTick`);
        expect(mkTickCells).toBe(1);
      }, 900000);
    });
  });
});
