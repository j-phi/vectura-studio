/**
 * SOLID'S FRONT-FACE CAP — the correction to the U12 fill-style-reachability
 * audit (`scratchpad/fillstyle-audit.md`, D1/D2).
 *
 * THE CORRECTION. The audit first measured box/plane/solid as all equally
 * restrictive: 10 of 47 laws reach them (`none` + the 9 `SurfaceFillMono`
 * laws), 37 do nothing. That is TRUE for box and plane, but NOT for `solid`.
 * `scene3d.js`'s `faceMonoLines` caps itself at a per-object FRONT-FACE budget
 * (`MONO_MAX_FRONT_FACES`) — a mono law owns one chart and budgets itself for
 * the whole object (`voronoiWeb` throws a fixed 26 000 darts, `mazeFill` walks
 * a spanning tree), so the cost does not shrink with the patch, and a body
 * over the cap falls back to the ordinary faceted hatch for EVERY mono law.
 * The shipped default solid is a 32-face buckyball, which sits over that cap.
 *
 * WHAT THIS FILE PINS, MEASURED HERE (not assumed from the audit's prose):
 *   1. On the DEFAULT solid, a mono law (mazeFill) renders BYTE-IDENTICAL to
 *      the untone default — the cap fallback, confirmed at the geometry level.
 *   2. `none` (Stage 0) is NOT part of that fallback: `spacingBand`'s Stage-0
 *      early return is unconditional on face count (see scene3d.js), so it
 *      keeps differing from the default on a capped solid. This is the one
 *      point where this file's measurement disagrees with a plain "0 of 47"
 *      reading of the correction — `none` measurably survives the cap.
 *   3. On a LOW-POLY named solid (dodecahedron — the same fixture
 *      `scene3d-faceted-tone-law.test.js` already uses for exactly this
 *      reason), the mono law is NOT capped and behaves like box/plane.
 *
 * `src/config/context-bar.js`'s `SCENE_FILL_STYLES.isCapLimited` /
 * `isReachableOn` model this: cap-limited ⇒ only `none`/`ladder` reachable;
 * not cap-limited (box, plane, or a low-poly solid) ⇒ `none`/`ladder`/the 9
 * mono laws reachable. This file is the RGR proof that model matches the
 * running engine, not the UI's own restatement of itself.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const FIX = require('../fixtures/scene3d-shadow-anatomy');

const clone = (v) => JSON.parse(JSON.stringify(v));
const { BOUNDS, SEED, CAMERA, SUN, toneBands, styleTable } = FIX;

const bodyOf = (solidType) => ({
  id: 'solid', name: 'Solid', primitive: 'solid', params: { solidType, radius: 46 },
  transform: { x: 0, y: 48, z: 0, yaw: 12, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('solid front-face cap — the U12 correction', () => {
  let runtime; let V;

  const render = (solidType, law) => {
    const Params = V.Scene3D.Params;
    const p = clone(V.ALGO_DEFAULTS.scene3d);
    p.seed = SEED;
    p.camera = clone(CAMERA);
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.objects = [clone(bodyOf(solidType))];
    p.lights = [clone(SUN)];
    p.tone = clone(toneBands(4));
    p.styleTable = styleTable(p.objects, law === null ? {} : { toneLaw: law });
    const np = Params.normalizeParams(p);
    const paths = V.AlgorithmRegistry.scene3d.generate(
      Params.collectSceneParams(np, []), new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS,
    ) || [];
    const fills = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill');
    const geom = fills.map((q) => q.map((pt) => `${pt.x.toFixed(4)},${pt.y.toFixed(4)}`).join(';')).join('|');
    return { md5: crypto.createHash('md5').update(geom).digest('hex'), paths: fills.length };
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  }, 120000);
  afterAll(() => runtime.cleanup());

  it('exposes PRIMITIVE_PARAM_DEFAULTS.solid.solidType — the fact isCapLimited reads live', () => {
    const P = V.Scene3D.Params;
    expect(P.PRIMITIVE_PARAM_DEFAULTS.solid.solidType).toBe('buckyball');
  });

  it('DEFAULT solid (buckyball): a mono law falls back to the untoned default — the cap fallback', () => {
    const base = render('buckyball', null);
    const maze = render('buckyball', 'mazeFill');
    expect(base.paths).toBeGreaterThan(0);
    expect(maze.md5).toBe(base.md5);
  }, 60000);

  it('DEFAULT solid (buckyball): a SECOND mono law also falls back (not a mazeFill accident)', () => {
    const base = render('buckyball', null);
    const etf = render('buckyball', 'etfKang');
    expect(etf.md5).toBe(base.md5);
  }, 60000);

  // ── THE DISAGREEMENT WITH A PLAIN "0 of 47" READING ──────────────────────
  it("DEFAULT solid: 'none' (Stage 0) is NOT capped — it still differs from the default", () => {
    const base = render('buckyball', null);
    const none = render('buckyball', 'none');
    expect(none.md5).not.toBe(base.md5);
  }, 60000);

  it('a LOW-POLY named solid (dodecahedron) is NOT capped — a mono law moves the geometry', () => {
    const base = render('dodecahedron', null);
    const maze = render('dodecahedron', 'mazeFill');
    expect(base.paths).toBeGreaterThan(0);
    expect(maze.md5).not.toBe(base.md5);
  }, 60000);

  // ── THE UI MODEL AGREES WITH WHAT WAS JUST MEASURED ──────────────────────
  it("SCENE_FILL_STYLES models exactly this: capped solid ⇒ only none/ladder; low-poly ⇒ like box", () => {
    const FS = V.SCENE_FILL_STYLES;
    expect(FS.isCapLimited('solid', 'buckyball')).toBe(true);
    expect(FS.isReachableOn('mazeFill', 'solid', 'buckyball')).toBe(false);
    expect(FS.isReachableOn('etfKang', 'solid', 'buckyball')).toBe(false);
    expect(FS.isReachableOn('none', 'solid', 'buckyball')).toBe(true);
    expect(FS.isReachableOn('ladder', 'solid', 'buckyball')).toBe(true);

    expect(FS.isCapLimited('solid', 'dodecahedron')).toBe(false);
    expect(FS.isReachableOn('mazeFill', 'solid', 'dodecahedron')).toBe(true);
  });
});
