const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D highlight treatments (Phase 4) — the specular/highlight band is no
 * longer ONLY blank paper. `style.params.highlightTreatment` selects what the
 * top tone band(s) render as: blank (drop, legacy default), keep, dashed,
 * dotted, sparse, altFill, burst, or stippleOut. The ordered-dither highlight
 * gate in SurfaceFill (and the per-face band on faceted prims) is generalized
 * from a boolean drop into a band classifier that dispatches to the treatment.
 * altFill/burst fill the specular sub-region (Regions.specularHotspot).
 *
 * Determinism: hash-only, no RNG. The DEFAULT ('blank') is a strict no-op —
 * output is byte-identical to a scene carrying no highlight params at all.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D highlight treatments (Phase 4)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // A single primitive, tone ON, a strong overhead-ish light so the lit cap
  // reaches the top tone band (the highlight band).
  const scene = (primitive, styleParams) => {
    const p = clone(defaults);
    const params = primitive === 'sphere'
      ? { radius: 40, detail: 22 }
      : { sx: 44, sy: 44, sz: 44 };
    p.objects = [{
      id: 'o1', name: 'x', primitive, params,
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 60, castShadows: false }];
    return p;
  };

  const gen = (primitive, styleParams) => algo.generate(scene(primitive, styleParams), null, null, BOUNDS) || [];
  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const hlFills = (paths) => fills(paths).filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.highlight === true);

  // ── HEADLINE (RGR): dashed keeps highlight-band lines but stamps strokeDash,
  // where blank drops them entirely. ─────────────────────────────────────────
  test('dashed: highlight-band fills exist and carry strokeDash (blank drops them)', () => {
    const dashed = hlFills(gen('sphere', { highlightTreatment: 'dashed' }));
    const blank = hlFills(gen('sphere', { highlightTreatment: 'blank' }));
    expect(dashed.length).toBeGreaterThan(0);
    dashed.forEach((pp) => {
      expect(pp.meta.sceneTarget.highlight).toBe(true);
      expect(Array.isArray(pp.meta.strokeDash) && pp.meta.strokeDash.length >= 2).toBe(true);
    });
    // Blank leaves the highlight band as bare paper — no highlight-tagged fills.
    expect(blank.length).toBe(0);
  });

  // ── HEADLINE: burst emits ~burstCount radial segments from the hotspot. ─────
  test('burst: emits roughly burstCount radial highlight segments', () => {
    const bc = 16;
    const radial = hlFills(gen('sphere', { highlightTreatment: 'burst', burstCount: bc }));
    expect(radial.length).toBeGreaterThanOrEqual(bc - 4);
    expect(radial.length).toBeLessThanOrEqual(bc + 1);
    // Each burst ray is a short open segment (2 points after clipping).
    radial.forEach((pp) => expect(pp.length).toBeGreaterThanOrEqual(2));
  });

  test('burstCount scales the number of radial segments', () => {
    const few = hlFills(gen('sphere', { highlightTreatment: 'burst', burstCount: 8 })).length;
    const many = hlFills(gen('sphere', { highlightTreatment: 'burst', burstCount: 40 })).length;
    expect(many).toBeGreaterThan(few);
  });

  // ── HEADLINE: sparse keeps fewer lines than keep but more than blank. ───────
  test('sparse: fewer total fills than keep, more than blank', () => {
    const blank = fills(gen('sphere', { highlightTreatment: 'blank' })).length;
    const sparse = fills(gen('sphere', { highlightTreatment: 'sparse', highlightDensity: 25 })).length;
    const keep = fills(gen('sphere', { highlightTreatment: 'keep' })).length;
    expect(sparse).toBeGreaterThan(blank);
    expect(sparse).toBeLessThan(keep);
  });

  test('altFill: fills the highlight sub-region with the alternate mapper', () => {
    const alt = hlFills(gen('sphere', { highlightTreatment: 'altFill', altFillMapper: 'stipple' }));
    expect(alt.length).toBeGreaterThan(0);
  });

  // ── Faceted path: a box highlight band dashes too (per-face band classifier). ─
  test('faceted box: dashed highlight band stamps strokeDash', () => {
    const dashed = hlFills(gen('box', { highlightTreatment: 'dashed' }));
    expect(dashed.length).toBeGreaterThan(0);
    dashed.forEach((pp) => expect(Array.isArray(pp.meta.strokeDash)).toBe(true));
  });

  // ── REGRESSION GUARD: 'blank' (the default) is a strict no-op. Output with
  // explicit blank/other highlight params must be byte-identical to a scene
  // carrying NO highlight params at all. ─────────────────────────────────────
  test('blank default is a strict no-op (byte-identical to no highlight params)', () => {
    const bare = JSON.stringify(gen('sphere', {}));
    const withBlank = JSON.stringify(gen('sphere', {
      highlightTreatment: 'blank', highlightBands: 2, highlightDensity: 80, burstCount: 40,
    }));
    expect(withBlank).toBe(bare);
  });

  test('deterministic: same highlight params → byte-identical output', () => {
    const a = JSON.stringify(gen('sphere', { highlightTreatment: 'dashed' }));
    const b = JSON.stringify(gen('sphere', { highlightTreatment: 'dashed' }));
    expect(a).toBe(b);
  });
});
