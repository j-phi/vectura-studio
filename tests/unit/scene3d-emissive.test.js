const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D emissive objects (Phase 7 — the sixth light type). An enabled
 * `object.emissive` does two things:
 *   (1) CONTRIBUTION — the object acts as a co-located POINT light at its world
 *       centroid, shading every OTHER object (never itself: its glow is its own
 *       self-render).
 *   (2) SELF-RENDER — the object draws its own glow: an outward radial BURST or
 *       concentric halo RINGS, with an optionally blank/bright core (coreBlank).
 *
 * Determinism: no RNG. Default OFF (or emissive.enabled=false) is a strict
 * no-op — output is byte-identical to a scene carrying no emissive block.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D emissive objects (Phase 7)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const gen = (p) => algo.generate(p, null, null, BOUNDS) || [];
  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const emGlow = (paths) => fills(paths).filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.emissive === true);
  const surfFillsOf = (paths, id) => fills(paths).filter((pp) => pp.meta.sceneTarget
    && pp.meta.sceneTarget.objectId === id && !pp.meta.sceneTarget.emissive);

  // A base scene: object B (a large flat plane facing up, hatched) with an
  // object A floating ABOVE it. No directional/ambient light + tone ON, so B is
  // fully dark UNLESS A is emissive — then A lights B's up-facing surface. `emA`
  // is the emissive block spread onto A; `coreBlankA` overrides its core.
  const scene = ({ emA, coreBlankA } = {}) => {
    const p = clone(defaults);
    p.objects = [
      {
        id: 'B', name: 'floor', primitive: 'plane', params: { sx: 120, sz: 120 },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      },
      {
        id: 'A', name: 'lamp', primitive: 'box', params: { sx: 24, sy: 24, sz: 24 },
        transform: { x: 0, y: 120, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
        ...(emA ? { emissive: { enabled: true, intensity: 2, halo: 'burst', haloCount: 16, coreBlank: coreBlankA !== false, ...emA } } : {}),
      },
    ];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 35, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    // A sun aimed from BELOW the horizon leaves B's up-facing plane dark (band 0)
    // — so the ONLY thing that can brighten B's top is an emissive object above
    // it. (An empty lights array normalizes back to the default overhead sun,
    // which would already saturate B's top band and hide the contribution.)
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: -40, intensity: 1, castShadows: false }];
    return p;
  };

  // ── HEADLINE (RGR): an enabled emissive object BRIGHTENS a facing object. B's
  // up-facing plane, unlit by any scene light, gains fill lines only because A
  // above it emits (a brighter tone band packs the hatch tighter). ────────────
  test('contribution: an emissive object brightens a facing object\'s fill', () => {
    const lit = surfFillsOf(gen(scene({ emA: { coreBlank: false } })), 'B').length;
    const dark = surfFillsOf(gen(scene({})), 'B').length;
    expect(lit).toBeGreaterThan(dark);
  });

  // ── HEADLINE (RGR): the emitter does NOT light ITSELF via the contribution
  // path. A's own surface fill (coreBlank off so it renders) is identical whether
  // or not A is emissive — with no other light, self-exclusion keeps A dark. ───
  test('self-exclusion: an emitter does not light itself', () => {
    const emissiveOn = surfFillsOf(gen(scene({ emA: { coreBlank: false } })), 'A').length;
    const plain = surfFillsOf(gen(scene({})), 'A').length;
    expect(emissiveOn).toBe(plain);
  });

  // ── HEADLINE (RGR): self-render emits ~haloCount radial burst rays, tagged
  // emissive. Independent of tone (a glow reads with light-made tone off). ─────
  test('self-render: burst emits ~haloCount emissive rays', () => {
    const p = scene({ emA: { halo: 'burst', haloCount: 16 } });
    p.tone = { ...clone(defaults).tone, enabled: false }; // glow is tone-independent
    const rays = emGlow(gen(p));
    expect(rays.length).toBeGreaterThanOrEqual(12);
    expect(rays.length).toBeLessThanOrEqual(17);
    rays.forEach((pp) => {
      expect(pp.meta.sceneTarget.regionClass).toBe('emissive');
      expect(pp.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('self-render: haloCount scales the ray count', () => {
    const few = emGlow(gen(scene({ emA: { halo: 'burst', haloCount: 8 } }))).length;
    const many = emGlow(gen(scene({ emA: { halo: 'burst', haloCount: 40 } }))).length;
    expect(many).toBeGreaterThan(few);
  });

  test('self-render: ring halo emits closed ring paths, none emits no glow', () => {
    const rings = emGlow(gen(scene({ emA: { halo: 'ring', haloRings: 4 } })));
    expect(rings.length).toBeGreaterThanOrEqual(1);
    const none = emGlow(gen(scene({ emA: { halo: 'none' } })));
    expect(none.length).toBe(0);
  });

  // ── coreBlank sparsens the emitter's OWN surface fill (bright core). ─────────
  test('coreBlank: suppresses the emitter\'s own surface fill', () => {
    const blank = surfFillsOf(gen(scene({ emA: { coreBlank: true } })), 'A').length;
    const kept = surfFillsOf(gen(scene({ emA: { coreBlank: false } })), 'A').length;
    expect(blank).toBe(0);
    expect(kept).toBeGreaterThan(0);
  });

  // ── REGRESSION GUARD: emissive.enabled=false (or absent) is a strict no-op —
  // byte-identical to a scene carrying no emissive block at all. ───────────────
  test('disabled emissive is byte-identical to no emissive block', () => {
    const bare = JSON.stringify(gen(scene({})));
    const withDisabled = (() => {
      const p = scene({});
      p.objects[1].emissive = { enabled: false, intensity: 3, halo: 'burst', haloCount: 40, coreBlank: true };
      return JSON.stringify(gen(p));
    })();
    expect(withDisabled).toBe(bare);
  });

  test('deterministic: same emissive scene → byte-identical output', () => {
    const a = JSON.stringify(gen(scene({ emA: { halo: 'burst' } })));
    const b = JSON.stringify(gen(scene({ emA: { halo: 'burst' } })));
    expect(a).toBe(b);
  });

  // ── normalizeObject back-fills a default-off emissive block, and clamps. ─────
  test('normalizeObject back-fills a default-off emissive block', () => {
    const p = V.Scene3D.Params.normalizeParams({ objects: [{ primitive: 'box' }] });
    expect(p.objects[0].emissive).toEqual({
      enabled: false, intensity: 1, penId: null, halo: 'burst', haloCount: 16, haloRings: 3, coreBlank: true,
    });
  });

  test('normalizeObject clamps emissive fields + whitelists halo', () => {
    const p = V.Scene3D.Params.normalizeParams({
      objects: [{ primitive: 'box', emissive: { enabled: true, intensity: 99, halo: 'lol', haloCount: 999, haloRings: 0, coreBlank: false, penId: 'pen-x' } }],
    });
    expect(p.objects[0].emissive).toEqual({
      enabled: true, intensity: 4, penId: 'pen-x', halo: 'burst', haloCount: 48, haloRings: 1, coreBlank: false,
    });
  });
});
