const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Shadow Fill Style reach. Jay's decision: "keep as many shadow looks as possible, when they
 * are materially different". The shadow Fill Style row used to offer only the
 * picker survivors, so 17 shadow textures from earlier folds were reachable only
 * through an old saved document. The row now has the survivor's sub-controls
 * (FS.shadowSubControls), filtered to the textures that are materially different
 * (Shadows.toneLawMaterial / SHADOW_NONMATERIAL), and it stores the one internal
 * law id, so saved documents are untouched.
 *
 * This file pins:
 *   (a) every shadow recipe that is NOT in SHADOW_NONMATERIAL is reachable through
 *       the picker (survivor + sub-control picks), including the 2 restored from
 *       the earlier folds (weaveDepth, penStipple) and the ones this unit folds;
 *   (b) every dropped recipe draws the same mark structure as the look it is `like`
 *       (same path count within 20 %, same ink within 18 %) on the flat footprint;
 *   (c) the stored value is always a plain internal id the shadow clamp accepts.
 */
const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

describe('Shadow Fill Style reach: every materially different shadow texture is offered', () => {
  let runtime; let V; let Shadows; let FS; let R;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
    FS = V.SCENE_FILL_STYLES;
    R = V.SCENE3D_TONE_LAWS;
  });
  afterAll(() => runtime.cleanup());

  const build = (law) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(V.ALGO_DEFAULTS.scene3d),
      objects: [{ id: 'obj-1', name: 'b', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }],
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: { shadowToneLaw: law },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = V.Scene3D.HLR.createClipper([], { bias: 0.05 });
    const dir = V.Scene3D.Lighting.lightWorldDir(p.lights[0]);
    return Shadows.build(scene, p, BOUNDS, clipper, dir, { shadow: p.shadow })
      .filter((pp) => pp.meta && pp.meta.sceneTarget && pp.meta.sceneTarget.regionClass === 'castShadow');
  };
  const inkOf = (paths) => paths.reduce((sum, path) => {
    let s = 0;
    for (let i = 1; i < path.length; i++) s += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return sum + s;
  }, 0);

  // The laws that carry a shadow recipe of their own (a hatch / cross / wave / dash /
  // dot recipe in shadows.js), i.e. every id the shadow clamp keeps raw.
  const recipeIds = () => ['ladder'].concat(R.IDS).filter((id) => Shadows.toneLawApplies(id));

  // The shadow row is ONE plain-language "Look" select per survivor. A law is reachable when it is one of
  // that select's options (a single pick). Returns ['look=<law>'] or null.
  const reach = (target) => {
    const survivor = FS.resolve(target);
    if (!Shadows.toneLawApplies(survivor)) return null;
    const subs = FS.shadowSubControls(survivor, Shadows);
    if (target === survivor) return [];
    const look = subs.find((sub) => sub.descriptor.key === 'shadowLook');
    return look && look.options.some((o) => o.law === target) ? [`look=${target}`] : null;
  };

  test('(a) every shadow recipe that is materially different is reachable through the picker', () => {
    const unreachable = [];
    recipeIds().forEach((id) => {
      if (!Shadows.toneLawMaterial(id)) return;
      if (!reach(id)) unreachable.push(id);
    });
    expect(unreachable).toEqual([]);
  });

  test('(a) the two textures earlier folds had hidden are reachable again: weaveDepth, penStipple', () => {
    // Single picks from one plain-language Look select (review B/UX: weaveDepth was two hops).
    expect(reach('weaveDepth')).toEqual(['look=weaveDepth']);
    expect(reach('penStipple')).toEqual(['look=penStipple']);
    expect(reach('bundleSubNib')).toEqual(['look=bundleSubNib']);
    expect(reach('bundleLozenge')).toEqual(['look=bundleLozenge']);
    expect(reach('bundleDither')).toEqual(['look=bundleDither']);
    expect(reach('bundleEased')).toEqual(['look=bundleEased']);
    expect(reach('trochoidLoop')).toEqual(['look=trochoidLoop']);
    expect(reach('lozengeStipple')).toEqual(['look=lozengeStipple']);
    expect(reach('interlockWeave')).toEqual(['look=interlockWeave']);
    // Labels are plain words, not mechanism jargon.
    const waveLook = FS.shadowSubControls('ampSpacing', Shadows)[0];
    expect(waveLook.options.map((o) => o.label)).toEqual(expect.arrayContaining(['Braided double wave', 'Looping wave']));
  });

  test('(a) the picker never offers a dropped texture (it still draws for a saved document)', () => {
    Object.keys(Shadows.SHADOW_NONMATERIAL).forEach((id) => {
      expect(Shadows.toneLawMaterial(id)).toBe(false);
      // A saved document that names it keeps the raw id, so it draws its own recipe.
      expect(V.Scene3D.Params.normalizeShadow({ shadowToneLaw: id }).shadowToneLaw).toBe(id);
    });
  });

  test('(b) evidence — every dropped texture has the same mark structure as the look it duplicates', () => {
    Object.keys(Shadows.SHADOW_NONMATERIAL).forEach((id) => {
      const like = Shadows.SHADOW_NONMATERIAL[id].like;
      expect(Shadows.toneLawMaterial(like), `${like} must itself be offered`).toBe(true);
      const a = build(id);
      const b = build(like);
      expect(a.length, id).toBeGreaterThan(0);
      const nRatio = a.length / b.length;
      const inkRatio = inkOf(a) / inkOf(b);
      expect(nRatio, `${id} vs ${like}: path count`).toBeGreaterThan(0.8);
      expect(nRatio, `${id} vs ${like}: path count`).toBeLessThan(1.25);
      expect(inkRatio, `${id} vs ${like}: ink`).toBeGreaterThan(0.82);
      expect(inkRatio, `${id} vs ${like}: ink`).toBeLessThan(1.22);
    });
  });

  test('(c) every pick stores a plain internal id the shadow clamp keeps', () => {
    ['bundleCount', 'ampSpacing', 'penInterleave', 'ladder', 'taperedEnds'].forEach((survivor) => {
      FS.shadowSubControls(survivor, Shadows).forEach((sub) => {
        sub.options.forEach((opt) => {
          expect(R.IDS.concat(['ladder'])).toContain(opt.law);
          expect(V.Scene3D.Params.normalizeShadow({ shadowToneLaw: opt.law }).shadowToneLaw).toBe(opt.law);
        });
      });
    });
  });

  test('trochoidLoop draws a real loop on a seeded layer and the old coarse polyline on a legacy one', () => {
    const run = (seedMode) => {
      const p = V.Scene3D.Params.normalizeParams({
        ...clone(V.ALGO_DEFAULTS.scene3d),
        objects: [{ id: 'obj-1', name: 'b', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }],
        ground: { enabled: true },
        lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
        camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
        shadow: { shadowToneLaw: 'trochoidLoop' },
      });
      p.seedMode = seedMode;
      const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
      const clipper = V.Scene3D.HLR.createClipper([], { bias: 0.05 });
      const dir = V.Scene3D.Lighting.lightWorldDir(p.lights[0]);
      const out = Shadows.build(scene, p, BOUNDS, clipper, dir, { shadow: p.shadow })
        .filter((pp) => pp.meta && pp.meta.sceneTarget && pp.meta.sceneTarget.regionClass === 'castShadow');
      return { paths: out.length, pts: out.reduce((n, pp) => n + pp.length, 0) };
    };
    const legacy = run('legacy');
    const seeded = run('seeded');
    expect(seeded.paths).toBe(legacy.paths);
    expect(seeded.pts).toBeGreaterThan(legacy.pts * 3); // >= 3x the samples per cycle
    expect(run('legacy')).toEqual(legacy); // deterministic
  });
});
