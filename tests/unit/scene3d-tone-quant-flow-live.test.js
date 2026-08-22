const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL METHOD Stage 0 — making `toneQuantLevels` / `toneFlowMode` genuinely
 * live in SurfaceFill.buildObject.
 *
 * BEFORE this change: both options were clamped in params.js and forwarded
 * from scene3d.js into `buildObject`, but `buildObject` never read
 * `opts.toneQuantLevels` / `opts.toneFlowMode` — it dispatched on the
 * hardcoded module constants `CF_LEVELS` (128) and `FLOW_MODE` ('iso').
 * `surface-fill.js:9141`'s debug metadata (`lastFloorStats.cont.levels`)
 * compounded the defect: it reported the CONSTANT, not the option, so even a
 * caller inspecting that field would be told the parameter had no effect.
 *
 * AFTER: `buildObject` shadows both constants with a per-call value resolved
 * from `opts`, exactly the pattern already used for `TONE_ALGO` /
 * `TONE_ALGO_DEFAULT`. Absent/invalid options degrade to the old hardcoded
 * constants byte-for-byte.
 *
 * These tests are driven through `engine.addLayer('scene3d')` +
 * `engine.computeAllDisplayGeometry()` — NOT `generate(params)` called
 * directly — per CLAUDE.md's "up to four origins" warning: a test that calls
 * `generate(params)` directly supplies the very value it is testing and
 * cannot see whether the real pipeline (style-cascade normalization via
 * params.js, then scene3d.js's forwarding) actually delivers it.
 */

describe('Scene3D SurfaceFill — toneQuantLevels / toneFlowMode are LIVE', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const SPHERE = { radius: 50, detail: 24 };

  // Same harness shape as scene3d-style-fill-lines.test.js's `compose()` —
  // strip the seeded default box + ground child, park exactly one curved
  // object on the stage, and let the ambient scene default (tone.enabled ===
  // true, one directional light) drive the fill.
  const compose = ({ styleParams }) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === groupId);

    engine.getLayerDescendants(groupId)
      .filter((l) => l && (l.type === 'object3d' || l.type === 'sceneGround3d'))
      .forEach((l) => engine.removeLayer(l.id));

    group.isGroup = true;
    group.containerRole = 'scene';
    group.params.seed = 0;
    group.params.objects = [];
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    group.params.camera = {
      projection: 'orthographic', yaw: -25, pitch: 20, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    group.params.lights = [{
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45,
      intensity: 1, castShadows: false,
    }];

    const childId = engine.addLayer('object3d');
    const child = engine.layers.find((l) => l.id === childId);
    child.parentId = groupId;
    child.params.seed = 0;
    child.params.primitive = 'sphere';
    child.params.params = { ...SPHERE };
    child.params.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    child.params.visibility = 'solid';
    child.params.style = {
      penId: null,
      mapper: 'hatch',
      params: { fillAngle: 0, fillDensity: 60, ...styleParams },
    };

    engine.computeAllDisplayGeometry();
    const live = engine.layers.find((l) => l.id === groupId);
    return (live.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
  };

  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
  const fingerprint = (paths) => JSON.stringify(paths.map((p) => ({
    pts: p.map((q) => ({ x: q.x, y: q.y, z: q.z })),
    meta: p.meta || null,
  }))).replace(UUID, 'OID');

  // ── toneQuantLevels ─────────────────────────────────────────────────────

  test('RED PROOF (documents the bug): toneQuantLevels 8 vs 128 render distinct sceneFill geometry', () => {
    const lo = compose({ styleParams: { toneLaw: 'contFieldQuant', toneQuantLevels: 8 } });
    const hi = compose({ styleParams: { toneLaw: 'contFieldQuant', toneQuantLevels: 128 } });
    expect(lo.length).toBeGreaterThan(0);
    expect(hi.length).toBeGreaterThan(0);
    expect(fingerprint(lo)).not.toBe(fingerprint(hi));
  });

  test('byte-identity guard: an absent toneQuantLevels renders identically to the explicit committed default (128)', () => {
    const absent = compose({ styleParams: { toneLaw: 'contFieldQuant' } });
    const explicit128 = compose({ styleParams: { toneLaw: 'contFieldQuant', toneQuantLevels: 128 } });
    expect(absent.length).toBeGreaterThan(0);
    expect(fingerprint(absent)).toBe(fingerprint(explicit128));
  });

  test('measured range: level counts far enough apart within [4, 256] all render distinctly', () => {
    const levelsList = [4, 8, 16, 32, 64, 128, 256];
    const prints = levelsList.map((n) => fingerprint(
      compose({ styleParams: { toneLaw: 'contFieldQuant', toneQuantLevels: n } }),
    ));
    // Every adjacent pair in this geometric-ish spread must differ — proof the
    // option is not merely clamped-and-ignored at any point in the range.
    for (let i = 1; i < prints.length; i += 1) {
      expect(prints[i]).not.toBe(prints[i - 1]);
    }
  });

  // ── toneFlowMode ────────────────────────────────────────────────────────
  //
  // `toneFlowMode` only has a consumer on 'contourFlow' / 'evenStreamlines' /
  // 'curvatureField' (surface-fill.js's `flowMapper` gate, ~line 8865) — NONE
  // of which are in the current `src/config/scene3d-tone-laws.js` PRODUCTION
  // roster (a pre-existing, Stage-0-unrelated fact: those three are retired/
  // prototype laws). `clampStyleParam`'s 'toneLaw' case rejects any id not in
  // the loaded roster and falls back to 'ladder', so reaching the FLOW_MODE
  // branch requires temporarily widening the roster the SAME way
  // `scene3d-tone-law-params.test.js` already does for its own roster test —
  // swap `Vectura.SCENE3D_TONE_LAWS`, restore it after. This does not touch
  // `src/config/scene3d-tone-laws.js` (out of this stage's owned files) and
  // does not change which laws ship selectable in the app.
  describe('with "contourFlow" temporarily admitted to the roster (FLOW_MODE\'s only consumer)', () => {
    let priorRoster;
    beforeAll(() => {
      priorRoster = Vectura.SCENE3D_TONE_LAWS;
      const ids = (priorRoster && priorRoster.IDS) || [];
      Vectura.SCENE3D_TONE_LAWS = { IDS: [...ids, 'contourFlow'] };
    });
    afterAll(() => { Vectura.SCENE3D_TONE_LAWS = priorRoster; });

    test('toneFlowMode "grad" vs "iso" render distinct sceneFill geometry on contourFlow', () => {
      const iso = compose({ styleParams: { toneLaw: 'contourFlow', toneFlowMode: 'iso' } });
      const grad = compose({ styleParams: { toneLaw: 'contourFlow', toneFlowMode: 'grad' } });
      expect(iso.length).toBeGreaterThan(0);
      expect(grad.length).toBeGreaterThan(0);
      expect(fingerprint(iso)).not.toBe(fingerprint(grad));
    });

    test('byte-identity guard: an absent toneFlowMode renders identically to the explicit committed default (iso)', () => {
      const absent = compose({ styleParams: { toneLaw: 'contourFlow' } });
      const explicitIso = compose({ styleParams: { toneLaw: 'contourFlow', toneFlowMode: 'iso' } });
      expect(absent.length).toBeGreaterThan(0);
      expect(fingerprint(absent)).toBe(fingerprint(explicitIso));
    });
  });

  // ── the lying metadata at surface-fill.js:9141 ─────────────────────────
  //
  // `lastFloorStats` is only populated in TONE_UNCAPPED mode — a permanent,
  // never-shipped comparison flag (`const TONE_UNCAPPED = false;`, see the
  // module's own "UNCAPPED MODE — comparison only, NEVER the committed
  // default" banner). To exercise the metadata line itself we re-execute the
  // module's own source with that one literal flipped, in the SAME jsdom
  // global the rest of the runtime already loaded into — the same technique
  // `load-vectura-runtime.js` uses to install every module (`vm`/`eval` into
  // one shared global scope). Nothing else about the module changes.
  describe('surface-fill.js:9141 metadata reports the RESOLVED value, not the constant', () => {
    let uncappedRuntime;
    let UV;

    beforeAll(async () => {
      uncappedRuntime = await loadVecturaRuntime({ includeUi: true });
      const srcPath = path.join(__dirname, '..', '..', 'src', 'core', 'scene3d', 'surface-fill.js');
      const src = fs.readFileSync(srcPath, 'utf8');
      const needle = 'const TONE_UNCAPPED = false;';
      expect((src.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length).toBe(1);
      uncappedRuntime.window.eval(src.replace(needle, 'const TONE_UNCAPPED = true;'));
      UV = uncappedRuntime.window.Vectura;
      expect(UV.Scene3D.SurfaceFill.uncapped).toBe(true);
    });

    afterAll(() => uncappedRuntime.cleanup());

    const composeUncapped = ({ styleParams }) => {
      const engine = new UV.VectorEngine();
      const groupId = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l.id === groupId);
      engine.getLayerDescendants(groupId)
        .filter((l) => l && (l.type === 'object3d' || l.type === 'sceneGround3d'))
        .forEach((l) => engine.removeLayer(l.id));
      group.isGroup = true;
      group.containerRole = 'scene';
      group.params.seed = 0;
      group.params.objects = [];
      group.params.ground = { enabled: false };
      group.params.backdrop = { enabled: false };
      group.params.camera = {
        projection: 'orthographic', yaw: -25, pitch: 20, roll: 0,
        cameraDistance: 620, focalLength: 520, zoom: 1,
      };
      group.params.lights = [{
        id: 'sun', type: 'directional', azimuth: 135, elevation: 45,
        intensity: 1, castShadows: false,
      }];
      const childId = engine.addLayer('object3d');
      const child = engine.layers.find((l) => l.id === childId);
      child.parentId = groupId;
      child.params.seed = 0;
      child.params.primitive = 'sphere';
      child.params.params = { ...SPHERE };
      child.params.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      child.params.visibility = 'solid';
      child.params.style = {
        penId: null,
        mapper: 'hatch',
        params: { fillAngle: 0, fillDensity: 60, ...styleParams },
      };
      engine.computeAllDisplayGeometry();
    };

    test('reported levels matches the opts.toneQuantLevels actually used, not CF_LEVELS_DEFAULT', () => {
      composeUncapped({ styleParams: { toneLaw: 'contFieldQuant', toneQuantLevels: 40 } });
      const stats = UV.Scene3D.SurfaceFill.lastFloorStats;
      expect(stats).toBeTruthy();
      expect(stats.cont).toBeTruthy();
      expect(stats.cont.levels).toBe(40);
    });

    test('an absent toneQuantLevels reports the committed default (128), matching what actually rendered', () => {
      composeUncapped({ styleParams: { toneLaw: 'contFieldQuant' } });
      const stats = UV.Scene3D.SurfaceFill.lastFloorStats;
      expect(stats.cont.levels).toBe(128);
    });
  });
});
