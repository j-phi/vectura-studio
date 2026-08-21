const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D per-object silhouette border (ask #8, ctxbar Highlight flyout).
 *
 * When obj.border.enabled, scene3d overstrokes the object's silhouette +
 * boundary edges with extra parallel passes so the outline reads as a heavy,
 * deliberate frame, scaled by `strength` and optionally recoloured by penId.
 *
 * RGR: these assertions FAIL on the pre-border code (no border render). The
 * regression guard proves border OFF (the default) is byte-identical to a scene
 * that never mentions border at all.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D per-object border (ask #8)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // A single box on an empty stage, wireframe (edges only) so the count isolates
  // the silhouette/boundary edge geometry the border emphasises.
  const scene = (border) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 40, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 },
      visibility: 'solid', ...(border !== undefined ? { border } : {}),
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 18, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };

  const edges = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge');

  test('border enabled emits MORE silhouette ink than border off', () => {
    const off = edges(algo.generate(scene({ enabled: false }), null, null, BOUNDS)).length;
    const on = edges(algo.generate(scene({ enabled: true, strength: 1 }), null, null, BOUNDS)).length;
    expect(on).toBeGreaterThan(off);
  });

  test('more strength emits more emphasis passes', () => {
    const weak = edges(algo.generate(scene({ enabled: true, strength: 1 }), null, null, BOUNDS)).length;
    const strong = edges(algo.generate(scene({ enabled: true, strength: 4 }), null, null, BOUNDS)).length;
    expect(strong).toBeGreaterThan(weak);
  });

  test('border penId recolours the emphasis passes only', () => {
    const paths = algo.generate(scene({ enabled: true, strength: 2, penId: 'pen-border' }), null, null, BOUNDS);
    const withPen = edges(paths).filter((pp) => pp.meta.penId === 'pen-border');
    expect(withPen.length).toBeGreaterThan(0);
  });

  test('REGRESSION: border off is byte-identical to a scene with no border block', () => {
    const noBlock = JSON.stringify(algo.generate(scene(undefined), null, null, BOUNDS));
    const offBlock = JSON.stringify(algo.generate(scene({ enabled: false }), null, null, BOUNDS));
    expect(offBlock).toBe(noBlock);
  });

  test('normalizeObject back-fills a default-off border block', () => {
    const p = V.Scene3D.Params.normalizeParams({ objects: [{ primitive: 'box' }] });
    // `offset` (mm, [-2, 2]) added alongside enabled/strength/penId — declaration
    // only (fs-c2-shadow Job 2); geometry/UI for it land in a separate effort.
    expect(p.objects[0].border).toEqual({ enabled: false, strength: 1, penId: null, offset: 0 });
  });
});
