const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * A DELIBERATE PRODUCT DECISION — DO NOT "FIX" THIS ASYMMETRY.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene3D.Mesh.scaleMeshToRadius used to divide by meshBounds().maxRadius, which
 * is floored at Math.max(1, …) for the twist deformer's benefit. The truncated
 * icosahedron (buckyball) is the ONLY solid whose pre-scale circumradius sits
 * below that floor — sqrt((5 + 4/sqrt5)/9) = 0.8685… — so the divide was clamped
 * away and every buckyball was built at 0.8685 · Radius: 13.1% under its stated
 * size. The mesh now measures the TRUE circumradius, so a buckyball built from
 * the same stored Radius is ~15.14% (1 / 0.8685) larger than it used to be.
 *
 * That growth is handled DIFFERENTLY on the two surfaces that build a buckyball,
 * ON PURPOSE:
 *
 *   • scene3d / object3d / sceneGroup3d / booleanGroup3d — PRESERVED.
 *     engine.sanitizeImportedParams routes these four types through
 *     Scene3D.Params.migrateScene, and SCENE_MIGRATIONS[3] (SCENE_VERSION 3 → 4)
 *     scales a pre-v4 buckyball's STORED radius by 0.8685 so a saved scene
 *     document renders byte-identically to what it looked like before the fix.
 *     Covered in depth by tests/unit/scene3d-buckyball-radius-migration.test.js.
 *
 *   • standalone `polyhedron` layers — SNAPPED TO THE CORRECTED SIZE.
 *     A polyhedron layer is NOT routed through migrateScene, and no equivalent
 *     migration exists for it. A saved polyhedron buckyball therefore grows
 *     ~15.14% on open and lands at its true stated Radius — the number the
 *     Geometry > Radius row has always claimed.
 *
 * Jay was asked explicitly whether standalone Polyhedron layers should also be
 * protected, and chose the snap: "Snap them to a corrected size as needed."
 *
 * ⇒ ADDING A MIGRATION (or any radius rescale) FOR STANDALONE `polyhedron`
 *   LAYERS WOULD REGRESS THAT DECISION, NOT FIX A BUG. These tests fail if
 *   someone does. If the decision is genuinely revisited, this file is what
 *   should be changed — deliberately, with Jay — not quietly worked around.
 *
 * MEASUREMENT SURFACES (why each assertion reads what it reads):
 *   • A standalone polyhedron layer is NOT a scene child, so engine.generate()
 *     writes its real ink to `layer.paths`. (The `group.scenePaths` rule applies
 *     to composed scene groups only, and `layer.scenePaths` is absent here —
 *     asserted below so this reasoning cannot silently rot.)
 *   • Mesh size is read as the TRUE circumradius (max |vertex|) of
 *     Scene3D.Mesh.createSolidMesh(layer.params) — never mesh.bounds.maxRadius,
 *     which is the still-floored twist divisor.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const ser = (paths) => (paths || []).map((pp) => ({ pts: Array.from(pp), meta: pp.meta || null }));

describe('Polyhedron buckyball — snapped to the corrected size, NOT migrated (deliberate)', () => {
  let runtime; let V; let Mesh; let Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Mesh = V.Scene3D.Mesh;
    Params = V.Scene3D.Params;
  });
  afterAll(() => runtime.cleanup());

  // The TRUE circumradius — deliberately NOT mesh.bounds.maxRadius, which keeps
  // the Math.max(1, …) floor for the twist deformer.
  const circumradius = (mesh) => (mesh.vertices || [])
    .reduce((best, pt) => Math.max(best, Math.hypot(pt.x, pt.y, pt.z)), 0);
  const factor = () => Mesh.legacyTruncatedIcosahedronScale();

  // Build a standalone polyhedron layer, save the document, patch the SAVED
  // params (i.e. forge a document that was written before the fix), then load it
  // into a fresh engine — the real save → open round trip.
  const saveThenOpen = (patch) => {
    const engine = new V.VectorEngine();
    engine.addLayer('polyhedron');
    const saved = clone(engine.exportState());
    const savedLayer = saved.layers.find((l) => l.type === 'polyhedron');
    patch(savedLayer.params);
    const reopened = new V.VectorEngine();
    reopened.importState(saved);
    const layer = reopened.layers.find((l) => l.type === 'polyhedron');
    return { engine: reopened, layer };
  };

  // ── The factor, and the growth it implies. ─────────────────────────────────
  test('the correction grows a buckyball by ~15.14% at the same stored Radius', () => {
    expect(factor()).toBeCloseTo(Math.sqrt((5 + 4 / Math.sqrt(5)) / 9), 12);
    expect(1 / factor()).toBeCloseTo(1.15139147094195, 9);
  });

  // ── The polyhedron layer shape carries no scene version at all. ────────────
  test('a polyhedron layer has no sceneVersion — it is outside the scene migration model', () => {
    const engine = new V.VectorEngine();
    const layer = engine.getLayerById(engine.addLayer('polyhedron'));
    expect(layer.type).toBe('polyhedron');
    expect(layer.params.solidType).toBe('buckyball'); // the factory default IS a buckyball
    expect(V.ALGO_DEFAULTS.polyhedron.sceneVersion).toBeUndefined();
    expect(layer.params.sceneVersion).toBeUndefined();
    // …and the layer's flat param bag is not even a shape migrateScene can read:
    // it has no `objects[]` and no `primitive`, so SCENE_MIGRATIONS[3] is
    // structurally a no-op on it even if it were somehow invoked.
    expect(layer.params.objects).toBeUndefined();
    expect(layer.params.primitive).toBeUndefined();
  });

  // ── THE DECISION, mesh side. ───────────────────────────────────────────────
  describe.each([
    ['an explicit solidType: "buckyball"', (p) => { p.solidType = 'buckyball'; p.radius = 40; }],
    // An ABSENT solidType falls through to the truncated icosahedron in
    // buildSolidBaseMesh (`p.solidType || 'buckyball'`), so it rendered small
    // too — and it is snapped exactly the same way.
    ['an ABSENT solidType (falls through to buckyball)', (p) => { delete p.solidType; p.radius = 40; }],
  ])('a saved polyhedron with %s', (_label, patch) => {
    test('keeps its STORED radius on open — no migration touches it', () => {
      const { layer } = saveThenOpen(patch);
      expect(layer.params.radius).toBe(40);
      expect(layer.params.sceneVersion).toBeUndefined();
      // Explicitly NOT the migrated (preserved-look) value the scene3d side gets.
      expect(layer.params.radius).not.toBeCloseTo(40 * factor(), 6);
    });

    test('renders at its TRUE stated Radius — SNAPPED to the corrected size', () => {
      const { layer } = saveThenOpen(patch);
      const measured = circumradius(Mesh.createSolidMesh(layer.params));
      expect(measured).toBeCloseTo(40, 9);
      // …which is genuinely LARGER than the pre-fix look, by the full factor.
      expect(measured).toBeCloseTo(40 * factor() * (1 / factor()), 9);
      expect(measured / (40 * factor())).toBeCloseTo(1 / factor(), 9);
    });
  });

  // ── THE DECISION, rendered-ink side. ───────────────────────────────────────
  // Read off `layer.paths`: a standalone polyhedron is NOT a scene child, so
  // engine.generate() writes its real ink there (no scenePaths involved).
  test('the reopened document draws the CORRECTED look, not the pre-fix look', () => {
    const { engine, layer } = saveThenOpen((p) => { p.solidType = 'buckyball'; p.radius = 40; });
    engine.generate(layer.id);
    expect(layer.scenePaths).toBeUndefined(); // pins the measurement surface
    expect((layer.paths || []).length).toBeGreaterThan(0);
    const reopened = ser(layer.paths);

    // A layer authored TODAY at the same stated Radius — what "snapped" means.
    const fresh = new V.VectorEngine();
    const freshLayer = fresh.getLayerById(fresh.addLayer('polyhedron'));
    Object.assign(freshLayer.params, { solidType: 'buckyball', radius: 40 });
    fresh.generate(freshLayer.id);
    expect(reopened).toEqual(ser(freshLayer.paths));

    // The pre-fix look is, by construction, today's render at radius 40·factor.
    // The reopened document must NOT land there — that is the scene3d contract,
    // and standalone polyhedron layers deliberately do not get it.
    const legacy = new V.VectorEngine();
    const legacyLayer = legacy.getLayerById(legacy.addLayer('polyhedron'));
    Object.assign(legacyLayer.params, { solidType: 'buckyball', radius: 40 * factor() });
    legacy.generate(legacyLayer.id);
    expect(reopened).not.toEqual(ser(legacyLayer.paths));
  });

  // ── Surgical: only the buckyball moves; every other family is untouched. ───
  test.each(['cube', 'icosahedron', 'dodecahedron', 'goldberg', 'geodesic', 'octahedron', 'tetrahedron'])(
    'a saved polyhedron %s is unaffected either way', (solidType) => {
      const { layer } = saveThenOpen((p) => { p.solidType = solidType; p.radius = 40; });
      expect(layer.params.radius).toBe(40);
      expect(circumradius(Mesh.createSolidMesh(layer.params))).toBeCloseTo(40, 9);
    },
  );

  // ── BOTH SIDES OF THE ASYMMETRY, side by side. ─────────────────────────────
  // The scene3d half is covered in depth by
  // tests/unit/scene3d-buckyball-radius-migration.test.js; what is pinned HERE
  // is the CONTRAST — the same stored radius, the same solid, two deliberately
  // different outcomes depending on the layer type it was saved under.
  test('scene3d PRESERVES and polyhedron SNAPS — from one identical stored radius', () => {
    const k = factor();

    // (a) scene3d — the migration scales the stored radius down so the render is
    //     byte-identical to the pre-fix look.
    const scene = clone(V.ALGO_DEFAULTS.scene3d);
    scene.objects = [{
      id: 'o1', name: 'o', primitive: 'solid', params: { solidType: 'buckyball', radius: 40 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    scene.sceneVersion = 3;
    const migratedScene = Params.sanitizeSceneParams(scene);
    expect(migratedScene.objects[0].params.radius).toBeCloseTo(40 * k, 12);
    expect(circumradius(Mesh.createSolidMesh(migratedScene.objects[0].params))).toBeCloseTo(40 * k, 9);

    // (b) object3d leaf — same preservation.
    const leaf = clone(V.ALGO_DEFAULTS.object3d);
    leaf.primitive = 'solid';
    leaf.params = { solidType: 'buckyball', radius: 40 };
    leaf.sceneVersion = 3;
    expect(Params.migrateScene(leaf).params.radius).toBeCloseTo(40 * k, 12);

    // (c) standalone polyhedron — NO migration; snapped to the true size.
    const { layer } = saveThenOpen((p) => { p.solidType = 'buckyball'; p.radius = 40; });
    expect(layer.params.radius).toBe(40);
    expect(circumradius(Mesh.createSolidMesh(layer.params))).toBeCloseTo(40, 9);

    // The two rendered sizes differ by exactly the correction factor. If this
    // ratio ever becomes 1, someone added the migration Jay declined.
    const preserved = circumradius(Mesh.createSolidMesh(migratedScene.objects[0].params));
    const snapped = circumradius(Mesh.createSolidMesh(layer.params));
    expect(snapped / preserved).toBeCloseTo(1 / k, 9);
    expect(snapped / preserved).toBeGreaterThan(1.15);
  });

  // ── The routing gate that IMPLEMENTS the asymmetry. ────────────────────────
  // engine.sanitizeImportedParams runs migrateScene for exactly four layer
  // types. `polyhedron` is deliberately not one of them.
  test('only the four scene layer types are stamped with a sceneVersion on import', () => {
    const stampedOnImport = (type) => {
      const engine = new V.VectorEngine();
      engine.importState({ layers: [{ id: `L-${type}`, type, name: type, params: {} }] });
      const layer = engine.layers.find((l) => l.type === type);
      return layer && layer.params.sceneVersion !== undefined;
    };
    ['scene3d', 'object3d', 'sceneGroup3d', 'booleanGroup3d'].forEach((type) => {
      expect([type, stampedOnImport(type)]).toEqual([type, true]);
    });
    // The whole point: polyhedron is NOT migrated.
    expect(['polyhedron', stampedOnImport('polyhedron')]).toEqual(['polyhedron', false]);
  });

  // ── The factory presets ship at the corrected size, on purpose. ────────────
  // Both bundled polyhedron presets are buckyballs at Radius 76, so both now
  // draw ~15.14% larger than they did before the fix. That is the snap Jay
  // asked for — the presets were NOT re-authored to preserve the old look.
  test('the bundled polyhedron presets render at their stated Radius (76)', () => {
    const presets = (V.PRESETS || []).filter((p) => p.preset_system === 'polyhedron' || String(p.id || '').startsWith('polyhedron-'));
    expect(presets.map((p) => p.id).sort()).toEqual(['polyhedron-dashed-buckyball', 'polyhedron-default']);
    presets.forEach((preset) => {
      // A preset carries only its deliberate overrides; the rest of the bag is
      // ALGO_DEFAULTS, exactly as Layer builds it.
      const params = { ...clone(V.ALGO_DEFAULTS.polyhedron), ...clone(preset.params || {}) };
      expect(params.solidType).toBe('buckyball');
      expect(params.radius).toBe(76);
      const measured = circumradius(Mesh.createSolidMesh(params));
      expect([preset.id, Math.abs(measured - 76) < 1e-9]).toEqual([preset.id, true]);
      // …and NOT the pre-fix 66.006 (= 76 · 0.8685) it used to draw at.
      expect([preset.id, Math.abs(measured - 76 * factor()) < 1]).toEqual([preset.id, false]);
    });
  });
});
