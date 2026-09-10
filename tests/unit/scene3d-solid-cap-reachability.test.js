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

  // ── W-28: an IMPORTED MESH is capped by the SAME running-engine mechanism ─
  // `faceMonoLines`'s `MONO_MAX_FRONT_FACES` check reads `record.faces[i]
  // .front` uniformly off whatever mesh the object3d compositor built — it
  // has no `solidType` branch at all. An imported mesh with a real front-
  // face count over the cap therefore falls back exactly like the default
  // buckyball, even though (before this fix) the picker's own
  // `isCapLimited('solid', 'importedMesh')` said otherwise (see
  // `scene3d-fill-style-picker.test.js` "an imported mesh is UNCONDITIONALLY
  // cap-limited" for the picker-side proof). Fixture: a frequency-2 geodesic
  // sphere (80 triangular faces, well over the 12-face cap at this view),
  // built with the SAME unit-vertex/import-mesh param shape
  // `engine.importMeshAsScene` produces (`createSolidMesh`'s `importedMesh`
  // branch multiplies unit verts by `radius` — see engine.js).
  it('an IMPORTED MESH with a real front-face count over the cap also falls back — same mechanism as the default solid (W-28)', () => {
    const Mesh = V.Scene3D.Mesh;
    const geo = Mesh.createGeodesicMesh(1, 2); // unit vectors, 80 faces
    const importedBody = {
      id: 'solid',
      name: 'Solid',
      primitive: 'solid',
      params: {
        solidType: 'importedMesh',
        importedMesh: { vertices: geo.vertices, faces: geo.faces },
        radius: 46,
      },
      transform: {
        x: 0, y: 48, z: 0, yaw: 12, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    };
    const renderMesh = (law) => {
      const Params = V.Scene3D.Params;
      const p = clone(V.ALGO_DEFAULTS.scene3d);
      p.seed = SEED;
      p.camera = clone(CAMERA);
      p.ground = { enabled: false };
      p.backdrop = { enabled: false };
      p.objects = [clone(importedBody)];
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
    const base = renderMesh(null);
    const maze = renderMesh('mazeFill');
    expect(base.paths).toBeGreaterThan(0);
    expect(maze.md5).toBe(base.md5);
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

    // W-28 — imported meshes have no advance knowledge of their real
    // front-face count at picker time, so the model treats them the same
    // as the capped default, not the same as a low-poly named solid.
    expect(FS.isCapLimited('solid', 'importedMesh')).toBe(true);
    expect(FS.isReachableOn('mazeFill', 'solid', 'importedMesh')).toBe(false);
    expect(FS.isReachableOn('none', 'solid', 'importedMesh')).toBe(true);
    expect(FS.isReachableOn('ladder', 'solid', 'importedMesh')).toBe(true);
  });

  // ── W-28b: the face-count fast path, driven through the REAL import path ──
  // W-28 (above) is unconditional because the picker has no channel to the
  // mesh's real face count. But `engine.importMeshAsScene` DOES store that
  // number at import time (`buildImportedMeshParams` → `params.importedMesh
  // .faces.length`, engine.js), so a caller who reads it back off the stored
  // layer can hand it to `isCapLimited` as a 4th `totalFaces` argument and get
  // a real answer for a small mesh instead of the blanket W-28 fallback.
  // front-facing count is always <= total count, so a TOTAL <= 12 guarantees
  // `faceMonoLines`'s `MONO_MAX_FRONT_FACES` (scene3d.js:2634, ==12) can never
  // trip, from any camera angle — this is what makes the fast path SAFE, not
  // a guess. This block goes through the actual `V.ObjImport.parse` +
  // `engine.importMeshAsScene` pipeline (the same one a real OBJ drag-and-
  // drop drives), not a hand-built params bag, so it also proves the stored
  // face count really is reachable from where the picker would read it.
  describe('W-28b — the face-count fast path (real import pipeline)', () => {
    // A cube OBJ: 6 quad faces, triangulated to 12 — exactly AT the
    // MONO_MAX_FRONT_FACES boundary (the `<= 12` edge, not comfortably under
    // it), so this is the sharpest real-file proof of the fast path.
    const CUBE_OBJ = `# cube
v -1 -1 -1
v  1 -1 -1
v  1  1 -1
v -1  1 -1
v -1 -1  1
v  1 -1  1
v  1  1  1
v -1  1  1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

    const freshEngine = () => {
      const engine = new V.VectorEngine();
      engine.layers = [];
      return engine;
    };

    it('a 12-face cube import: stored totalFaces is 12, and the picker fast path is NOT cap-limited', () => {
      const engine = freshEngine();
      const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
      expect(mesh.faces.length).toBe(12);
      const result = engine.importMeshAsScene(mesh, 'Cube');
      expect(result.ok).toBe(true);
      expect(result.faces).toBe(12);
      const child = engine.getLayerById(result.childId);
      const solidParams = child.params.params;
      expect(solidParams.solidType).toBe('importedMesh');
      const totalFaces = solidParams.importedMesh.faces.length;
      expect(totalFaces).toBe(12);

      const FS = V.SCENE_FILL_STYLES;
      expect(FS.isCapLimited('solid', 'importedMesh', totalFaces)).toBe(false);
      expect(FS.isReachableOn('mazeFill', 'solid', 'importedMesh', undefined, totalFaces)).toBe(true);
      expect(FS.isReachableOn('etfKang', 'solid', 'importedMesh', undefined, totalFaces)).toBe(true);
      expect(FS.isReachableOn('none', 'solid', 'importedMesh', undefined, totalFaces)).toBe(true);
      expect(FS.isReachableOn('ladder', 'solid', 'importedMesh', undefined, totalFaces)).toBe(true);
    });

    it('the SAME 12-face cube, rendered with a mono law, actually moves the geometry — the fast path is not just picker-cosmetic', () => {
      const engine = freshEngine();
      const mesh = V.ObjImport.parse(CUBE_OBJ, 'cube.obj');
      const result = engine.importMeshAsScene(mesh, 'Cube');
      const child = engine.getLayerById(result.childId);
      const solidParams = child.params.params;

      const importedBody = {
        id: 'solid', name: 'Solid', primitive: 'solid', params: clone(solidParams),
        transform: { x: 0, y: 48, z: 0, yaw: 12, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      };
      const renderMesh = (law) => {
        const Params = V.Scene3D.Params;
        const p = clone(V.ALGO_DEFAULTS.scene3d);
        p.seed = SEED;
        p.camera = clone(CAMERA);
        p.ground = { enabled: false };
        p.backdrop = { enabled: false };
        p.objects = [clone(importedBody)];
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
      const base = renderMesh(null);
      const maze = renderMesh('mazeFill');
      expect(base.paths).toBeGreaterThan(0);
      expect(maze.md5).not.toBe(base.md5);
    }, 60000);

    it('an 80-face imported mesh (over the boundary) stays cap-limited even when totalFaces is supplied', () => {
      const Mesh = V.Scene3D.Mesh;
      const geo = Mesh.createGeodesicMesh(1, 2); // 80 faces
      const totalFaces = geo.faces.length;
      expect(totalFaces).toBeGreaterThan(12);
      const FS = V.SCENE_FILL_STYLES;
      expect(FS.isCapLimited('solid', 'importedMesh', totalFaces)).toBe(true);
      expect(FS.isReachableOn('mazeFill', 'solid', 'importedMesh', undefined, totalFaces)).toBe(false);
      expect(FS.isReachableOn('none', 'solid', 'importedMesh', undefined, totalFaces)).toBe(true);
    });
  });
});
