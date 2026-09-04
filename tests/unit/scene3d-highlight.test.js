const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { readHlStageSync } = require('../helpers/read-hl-stage-sync');

// DORMANT UNDER HL_STAGE STAGE 1 (surface-fill.js:276, treatment: false). These
// three assertions are correct and unmodified; the highlight-band treatment
// dispatch (dashed / sparse / none) they exercise is switched off. Flip
// `treatment` to true and they re-arm automatically. See
// docs/pre-release-hardening-log.md PRH-027 and
// tests/unit/scene3d-hl-stage-roster.test.js, which pins this roster.
const STAGE = readHlStageSync();
const whenTreatment = STAGE.treatment ? test : test.skip;

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
  // "How much is drawn" is INK LENGTH. A path COUNT is not a proxy for it: the
  // treatments that thin a surface do so by BREAKING rulings, so they raise the
  // path count while lowering the ink — `blank` measured 114 paths against
  // `none`'s 112 while drawing strictly less.
  const inkOf = (paths) => paths.reduce((sum, pp) => {
    let L = 0;
    for (let i = 1; i < pp.length; i += 1) L += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
    return sum + L;
  }, 0);

  // ── HEADLINE (RGR): dashed keeps highlight-band lines but stamps strokeDash,
  // where blank drops them entirely. ─────────────────────────────────────────
  whenTreatment('dashed: highlight-band fills exist and carry strokeDash (blank drops them)', () => {
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

  // ── HEADLINE: sparse keeps fewer lines than an untreated surface, more than
  // blank. The upper anchor used to be `keep`; that treatment was retired in
  // favour of `none` (Jay, 2026-08-09), which is a TOTAL bypass rather than a
  // treatment — so it is the natural "untreated" anchor. ─────────────────────
  //
  // The upper anchor is no longer a total. It used to be `keep`, and `none`
  // cannot stand in for it: `none` switches the whole specular path off, so its
  // centre light carries MORE ink than any treated surface's does, and the
  // comparison stops being about `sparse` at all. What `sparse` actually
  // promises is that it THINS the highlight band rather than removing it, so
  // that is what is measured — against `blank`, which removes it, and against
  // its own density dial.
  whenTreatment('sparse: thins the highlight band rather than removing it', () => {
    const blank = inkOf(fills(gen('sphere', { highlightTreatment: 'blank' })));
    const sparse = inkOf(fills(gen('sphere', { highlightTreatment: 'sparse', highlightDensity: 25 })));
    const dense = inkOf(fills(gen('sphere', { highlightTreatment: 'sparse', highlightDensity: 100 })));
    expect(sparse).toBeGreaterThan(blank);
    // The band survives on the highlight CHANNEL; blank leaves nothing there.
    expect(hlFills(gen('sphere', { highlightTreatment: 'sparse', highlightDensity: 25 })).length)
      .toBeGreaterThan(0);
    expect(hlFills(gen('sphere', { highlightTreatment: 'blank' })).length).toBe(0);
    // ...and the density dial is live: keeping every line draws more than
    // keeping every fourth.
    expect(dense).toBeGreaterThan(sparse);
  });

  // ── `none` (formerly `keep`) is the OPPOSITE of a highlight: no ink may be
  // removed, thinned, re-penned, dashed or re-tagged, and the glint cap must
  // not fire. Jay's screenshot showed `Keep` selected with the capsule's rulings
  // still visibly breaking, which is what retired the treatment. ─────────────
  whenTreatment('none: emits no highlight-channel ink at all, and keeps more fill than blank', () => {
    const none = hlFills(gen('sphere', { highlightTreatment: 'none' }));
    const blank = hlFills(gen('sphere', { highlightTreatment: 'blank' }));
    expect(none.length).toBe(0);
    expect(blank.length).toBe(0);
    // ...and it keeps its lines: blank drops the highlight band to bare paper.
    expect(inkOf(fills(gen('sphere', { highlightTreatment: 'none' }))))
      .toBeGreaterThan(inkOf(fills(gen('sphere', { highlightTreatment: 'blank' }))));
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
