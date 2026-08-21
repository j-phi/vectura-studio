const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * X-ray back-face PAINT ORDER (fs-b2). Back-face fills must render BEHIND
 * front-of-object geometry — in both canvas paint order (array order of
 * `layer.paths` / the scene group's `scenePaths`, since `Renderer.drawLayers`
 * strokes paths in array order with no z-sort) and SVG/export/plot order
 * (`UI.getExportSnapshot`, which buckets by effective pen in FIRST-SEEN
 * order and, within one pen, in item/array order).
 *
 * Before this fix, both the faceted (box) and curved (sphere) x-ray paths
 * pushed every FRONT fill to `out` before emitting the BACK fills, so a
 * distinct back pen's `<g>` always landed after the front pen's `<g>`
 * (drawn/plotted on top of it) and the canvas painted back ink over front
 * ink. This file pins the opposite: back-tagged fills must precede
 * front-tagged fills in emission order, for both the faceted and the curved
 * (SurfaceFill) code paths.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D x-ray back-face PAINT ORDER (fs-b2)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const scene = (primitive, styleParams) => {
    const p = clone(defaults);
    const params = primitive === 'sphere'
      ? { radius: 40, detail: 20 }
      : { sx: 40, sy: 40, sz: 40 };
    p.objects = [{
      id: 'o1', name: 'x', primitive, params,
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility: 'xray',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: {
        penId: 'frontPen',
        mapper: 'hatch',
        params: { fillAngle: 45, fillDensity: 60, xrayBackPenId: 'backPen', ...(styleParams || {}) },
      },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };

  const fills = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const isBack = (pp) => Boolean(pp.meta.sceneTarget && pp.meta.sceneTarget.xrayBack === true);

  // Index-of-last-back < index-of-first-front, over the FULL `out` array (not
  // just `fills`), because paint order is whatever order the caller pushed
  // to `out` — interleaved edge/border geometry between the two groups is
  // fine, but no front fill may sit at a lower index than any back fill.
  const assertBackBeforeFront = (paths) => {
    const kinds = paths.map((pp) => (pp.meta && pp.meta.kind === 'sceneFill'
      ? (isBack(pp) ? 'back' : 'front') : null));
    const backIdxs = kinds.map((k, i) => (k === 'back' ? i : -1)).filter((i) => i >= 0);
    const frontIdxs = kinds.map((k, i) => (k === 'front' ? i : -1)).filter((i) => i >= 0);
    expect(backIdxs.length).toBeGreaterThan(0);
    expect(frontIdxs.length).toBeGreaterThan(0);
    const lastBack = Math.max(...backIdxs);
    const firstFront = Math.min(...frontIdxs);
    expect(lastBack).toBeLessThan(firstFront);
  };

  test('faceted (box): every back-face fill precedes every front-face fill in emission order', () => {
    const paths = algo.generate(scene('box'), null, null, BOUNDS);
    expect(fills(paths).length).toBeGreaterThan(0);
    assertBackBeforeFront(paths);
  });

  test('curved (sphere / SurfaceFill): every back-face fill precedes every front-face fill in emission order', () => {
    const paths = algo.generate(scene('sphere'), null, null, BOUNDS);
    expect(fills(paths).length).toBeGreaterThan(0);
    assertBackBeforeFront(paths);
  });

  // Sanity: with x-ray OFF (or backFaces off), there is no back geometry and
  // ordering of the (unaffected) front fills is unperturbed — this guards
  // against a reorder that accidentally engages on solid objects too.
  test('solid (non-x-ray) box emits no back-tagged fills', () => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'x', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    const paths = algo.generate(p, null, null, BOUNDS);
    expect(fills(paths).some(isBack)).toBe(false);
  });
});
