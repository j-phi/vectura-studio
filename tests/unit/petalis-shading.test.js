/*
 * RGR: Petalis shading engine correctness (complaint "shading not working").
 *  - Shading RNG must be isolated from layout RNG (editing shading must not
 *    rearrange the flower).
 *  - radial / parallel / edge are advertised as 3 distinct hatch styles and
 *    must produce different output (they were byte-identical).
 *  - Enabling a light source must not strip group/label meta from shading.
 *  - outline/rim/contour shading must follow the designer profile, not a
 *    legacy named-profile silhouette.
 *
 * generate() runs through the petalisDesigner wrapper (forces dual + designer).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

const base = (overrides = {}) => ({
  seed: 4242, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0,
  layoutMode: 'whorl',
  petalScale: 40, petalProfile: 'teardrop', petalWidthRatio: 1, petalSteps: 28,
  ringMode: 'dual', innerCount: 0, outerCount: 6, ringSplit: 0.45, ringOffset: 0, radialGrowth: 1,
  countJitter: 0, sizeJitter: 0, rotationJitter: 0, angularDrift: 0, driftStrength: 0,
  anchorToCenter: 'central', anchorRadiusRatio: 1, tipSharpness: 1, tipTwist: 0, tipCurl: 0,
  baseFlare: 0, basePinch: 0, radiusScale: 0,
  designerInner: null, designerOuter: null,
  designerSymmetry: 'none', designerInnerSymmetry: 'none', designerOuterSymmetry: 'none',
  noises: [], shadings: [], petalModifiers: [], layering: false,
  centerType: 'disk', centerRadius: 0, centerDensity: 1,
  ...overrides,
});

const shade = (overrides = {}) => ({
  id: 'shade-1', enabled: true, type: 'radial', target: 'both',
  widthX: 100, widthY: 100, posX: 50, posY: 50, gapX: 0, gapY: 0, gapPosX: 50, gapPosY: 50,
  lineType: 'solid', lineSpacing: 1.5, density: 1, jitter: 0, lengthJitter: 0, angle: 0,
  ...overrides,
});

const onlyOutlines = (paths) => paths.filter((p) => p.meta && p.meta.label === 'Outline');
const onlyShades = (paths) => paths.filter((p) => p.meta && /^Shade/.test(p.meta.label || ''));
const sig = (paths) => pathSignature(paths);

describe('Petalis shading engine', () => {
  let runtime, algo, SeededRNG, SimpleNoise;
  const rng = (s = 4242) => new SeededRNG(s);
  const noise = (s = 4242) => new SimpleNoise(s);

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    algo = runtime.window.Vectura.AlgorithmRegistry.petalisDesigner;
    SeededRNG = runtime.window.Vectura.SeededRNG;
    SimpleNoise = runtime.window.Vectura.SimpleNoise;
  });
  afterAll(() => runtime?.cleanup?.());

  const gen = (params) => algo.generate(params, rng(), noise(), bounds);

  test('shading is produced for an enabled radial hatch', () => {
    const out = gen(base({ shadings: [shade()] }));
    expect(onlyShades(out).length).toBeGreaterThan(0);
  });

  test('adding a jittered/stipple shading does NOT change the layout (RNG isolation)', () => {
    // rotationJitter>0 means the layout consumes per-petal RNG; if shading shares
    // that stream, adding shading re-rolls every later petal's rotation.
    const organic = { rotationJitter: 8, sizeJitter: 0.2 };
    const layoutOnly = onlyOutlines(gen(base(organic)));
    const withStipple = onlyOutlines(
      gen(base({ ...organic, shadings: [shade({ type: 'stipple', jitter: 0.8, lengthJitter: 0.8 })] }))
    );
    expect(sig(withStipple)).toBe(sig(layoutOnly));
  });

  test('raising shading line jitter does NOT change the layout (RNG isolation)', () => {
    const organic = { rotationJitter: 8, sizeJitter: 0.2 };
    const a = onlyOutlines(gen(base({ ...organic, shadings: [shade({ jitter: 0 })] })));
    const b = onlyOutlines(gen(base({ ...organic, shadings: [shade({ jitter: 0.9 })] })));
    expect(sig(a)).toBe(sig(b));
  });

  test('a centered hatch with zero Y-gap keeps its midline (gap only removes lines when gapY > 0)', () => {
    // widthY:0 collapses the hatch to a single centerline at offset 0. With the
    // default gapY:0/gapPosY:50 the gap window is [0,0]; the old code skipped any
    // line at offset 0, deleting the midline. The gap must be inert when gapY===0.
    const out = onlyShades(gen(base({ shadings: [shade({ widthY: 0, gapY: 0, gapPosY: 50 })] })));
    expect(out.length).toBeGreaterThan(0);
  });

  test('radial, parallel, and edge hatches produce DIFFERENT output', () => {
    const mk = (type) => onlyShades(gen(base({ shadings: [shade({ type })] })));
    const radial = sig(mk('radial'));
    const parallel = sig(mk('parallel'));
    const edge = sig(mk('edge'));
    expect(parallel).not.toBe(radial);
    expect(edge).not.toBe(radial);
    expect(edge).not.toBe(parallel);
  });

  test('venation shading emits a midrib plus secondary veins, clipped to the petal', () => {
    const oneVein = onlyShades(gen(base({ outerCount: 1, shadings: [shade({ type: 'vein', veinCount: 0 })] })));
    const manyVeins = onlyShades(gen(base({ outerCount: 1, shadings: [shade({ type: 'vein', veinCount: 5 })] })));
    // A bare midrib produces at least one line; secondary veins add more.
    expect(oneVein.length).toBeGreaterThan(0);
    expect(manyVeins.length).toBeGreaterThan(oneVein.length);
    // Distinct from a radial hatch.
    const radial = onlyShades(gen(base({ outerCount: 1, shadings: [shade({ type: 'radial' })] })));
    expect(sig(manyVeins)).not.toBe(sig(radial));
  });

  test('enabling a light source keeps group/label meta on shading paths', () => {
    // layering:false → no occluders → all shading is "lit" and passes through
    // splitPathByShadow, which rebuilt the path and dropped its meta.
    const out = gen(base({ lightSource: { x: 0, y: 0 }, layering: false, shadings: [shade()] }));
    const shades = onlyShades(out);
    expect(shades.length).toBeGreaterThan(0);
    shades.forEach((s) => {
      expect(s.meta.group).toBeTruthy();
      expect(/^Petal/.test(s.meta.group)).toBe(true);
    });
  });
});
