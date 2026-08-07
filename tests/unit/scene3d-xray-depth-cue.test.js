const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Quantitative X-ray — interpretation A (depth-cued see-through fill).
 *
 * Today's x-ray (visibility:'xray') shows the far surface at a FLAT reduced
 * density (xrayBackDensity). The depth cue (xrayDepthCue) makes that see-through
 * fill QUANTITATIVE: it modulates the back-fill's density and/or stroke weight by
 * how far behind the front surface each sample sits — deep material reads
 * darker/heavier, shallow material reads faint. Off by default ⇒ byte-identical
 * to the flat x-ray.
 *
 * Each back-fill polyline carries meta.sceneTarget.xrayDepth (0 = flush behind
 * the front surface, 1 = deepest material) when a cue is active, so the
 * depth→look relationship is directly assertable.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D x-ray depth cue (Quantitative X-ray A)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const scene = (primitive, visibility, styleParams) => {
    const p = clone(defaults);
    const params = primitive === 'sphere'
      ? { radius: 40, detail: 20 }
      : { sx: 40, sy: 40, sz: 40 };
    p.objects = [{
      id: 'o1', name: 'x', primitive, params,
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility,
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };

  const fills = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const backFills = (paths) => fills(paths).filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.xrayBack === true);
  const gen = (prim, vis, sp) => algo.generate(scene(prim, vis, sp), null, null, BOUNDS);
  const cuedBacks = (paths) => backFills(paths).filter((pp) => Number.isFinite(pp.meta.sceneTarget.xrayDepth));

  // ── (a) DENSITY: a deep-back-fill sample emits MORE ink than a shallow one.
  // Faceted (box). The full see-through fill gains density toward deeper
  // material, so the total back-fill count exceeds the flat x-ray, and the
  // deep depth-band carries more runs than the shallow band. ────────────────
  test('density cue (faceted box): more back-fill ink, denser toward deeper material', () => {
    const off = backFills(gen('box', 'xray', { xrayDepthCue: 'off' })).length;
    const paths = gen('box', 'xray', { xrayDepthCue: 'density' });
    const back = cuedBacks(paths);
    expect(back.length).toBeGreaterThan(0);
    expect(back.length).toBeGreaterThan(off); // deep material adds ink vs flat x-ray
    const deep = back.filter((pp) => pp.meta.sceneTarget.xrayDepth >= 0.5).length;
    const shallow = back.filter((pp) => pp.meta.sceneTarget.xrayDepth < 0.5).length;
    expect(deep).toBeGreaterThan(shallow); // depth → density
    // Density cue does NOT touch stroke weight.
    back.forEach((pp) => expect(pp.meta.weightScale).toBeUndefined());
  });

  test('density cue (curved sphere): more back-fill ink, denser toward deeper material', () => {
    const off = backFills(gen('sphere', 'xray', { xrayDepthCue: 'off' })).length;
    const paths = gen('sphere', 'xray', { xrayDepthCue: 'density' });
    const back = cuedBacks(paths);
    expect(back.length).toBeGreaterThan(off);
    const deep = back.filter((pp) => pp.meta.sceneTarget.xrayDepth >= 0.5).length;
    const shallow = back.filter((pp) => pp.meta.sceneTarget.xrayDepth < 0.5).length;
    expect(deep).toBeGreaterThan(shallow);
  });

  // ── (b) WEIGHT: back-fill stroke weight scales monotonically with depth. ───
  const monotonicWeightByDepth = (back) => {
    const rows = back
      .map((pp) => ({ d: pp.meta.sceneTarget.xrayDepth, w: pp.meta.weightScale }))
      .sort((r1, r2) => r1.d - r2.d);
    rows.forEach((r) => expect(Number.isFinite(r.w)).toBe(true));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].w).toBeGreaterThanOrEqual(rows[i - 1].w); // non-decreasing in depth
    }
    return rows;
  };

  test('weight cue (sphere): every back run carries a depth-scaled weightScale (faint→heavy)', () => {
    const back = cuedBacks(gen('sphere', 'xray', { xrayDepthCue: 'weight' }));
    expect(back.length).toBeGreaterThan(0);
    const rows = monotonicWeightByDepth(back);
    const ws = rows.map((r) => r.w);
    expect(Math.max(...ws)).toBeGreaterThan(Math.min(...ws)); // it actually varies with depth
    expect(Math.max(...ws)).toBeGreaterThan(1); // deep material reads heavier
  });

  test('weight cue (box): back runs carry a monotonic weightScale, density unchanged from off', () => {
    const offCount = backFills(gen('box', 'xray', { xrayDepthCue: 'off' })).length;
    const back = cuedBacks(gen('box', 'xray', { xrayDepthCue: 'weight' }));
    expect(back.length).toBe(offCount); // weight cue does NOT change geometry/density
    monotonicWeightByDepth(back);
  });

  test('both cue (sphere): back runs carry BOTH weightScale and added density', () => {
    const off = backFills(gen('sphere', 'xray', { xrayDepthCue: 'off' })).length;
    const back = cuedBacks(gen('sphere', 'xray', { xrayDepthCue: 'both' }));
    expect(back.length).toBeGreaterThan(off);
    back.forEach((pp) => expect(Number.isFinite(pp.meta.weightScale)).toBe(true));
  });

  // ── (c) OFF (default) is byte-identical to pre-change flat x-ray. ─────────
  test('default x-ray == explicit off (byte-identical), no depth meta emitted', () => {
    const def = JSON.stringify(gen('sphere', 'xray'));
    const off = JSON.stringify(gen('sphere', 'xray', { xrayDepthCue: 'off' }));
    expect(off).toBe(def);
    backFills(gen('sphere', 'xray')).forEach((pp) => {
      expect(pp.meta.sceneTarget.xrayDepth).toBeUndefined();
      expect(pp.meta.weightScale).toBeUndefined();
    });
    backFills(gen('box', 'xray', { xrayDepthCue: 'off' })).forEach((pp) => {
      expect(pp.meta.sceneTarget.xrayDepth).toBeUndefined();
    });
  });

  // ── (d) A non-x-ray (solid) object is completely unaffected by the cue. ───
  test('solid output unchanged by a stray depth cue (strict xray gate)', () => {
    const bare = JSON.stringify(gen('sphere', 'solid'));
    const withCue = JSON.stringify(gen('sphere', 'solid', { xrayDepthCue: 'both' }));
    expect(withCue).toBe(bare);
    const bareBox = JSON.stringify(gen('box', 'solid'));
    const cuedBox = JSON.stringify(gen('box', 'solid', { xrayDepthCue: 'density' }));
    expect(cuedBox).toBe(bareBox);
  });

  // Determinism: no RNG in the cue.
  test('deterministic: same depth-cue params → byte-identical output', () => {
    expect(JSON.stringify(gen('sphere', 'xray', { xrayDepthCue: 'both' })))
      .toBe(JSON.stringify(gen('sphere', 'xray', { xrayDepthCue: 'both' })));
    expect(JSON.stringify(gen('box', 'xray', { xrayDepthCue: 'density' })))
      .toBe(JSON.stringify(gen('box', 'xray', { xrayDepthCue: 'density' })));
  });
});
