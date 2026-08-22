const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * "Expand into group" fidelity for a 3D Scene's tree children (object3d /
 * sceneGround3d / sceneLight3d). Two confirmed defects from a real
 * before/after comparison (sphere + sun + ground scene):
 *
 *   1. The expanded GROUND gained dense hatching that was never on canvas.
 *   2. The expanded ground did not occupy the same place/extent as the real
 *      ground quad.
 *
 * Root cause: a scene-tree child owns no `.paths` of its own — it is
 * `_sceneConsumed`, and its real rendered ink is a tagged slice of the owning
 * scene group's composed `group.scenePaths` (meta.sceneTarget.objectId ===
 * childId, or the literal sentinel 'ground' for the ground fixture — see
 * engine.getSceneChildRenderPaths). But `expandLayer` used to bake
 * `layer.paths` and, when empty, call `engine.generate(layer.id)` — and
 * generate()'s `Algorithms[layer.type] || Algorithms.flowfield` fallback has
 * no `Algorithms.object3d` / `Algorithms.sceneGround3d` entry, so it silently
 * ran flowfield against the child's incompatible param bag. That flowfield
 * hatch is defect 1 and 2 at once: unrelated geometry, unrelated bounds.
 *
 * RGR: on the pre-fix code this test's fidelity assertions fail (the
 * expanded ground's path count/bbox/meta don't match the real pre-expand
 * ground slice — they're a flowfield hatch instead). After the fix
 * (expandLayer sources a scene-tree child from
 * engine.getSceneChildRenderPaths, the real composed slice) they pass.
 *
 * Harness: a LEAN runtime (no App/Renderer/ui.js boot — see
 * tests/helpers/load-vectura-runtime.js defaults) that loads the real
 * engine.js + scene3d algorithm + layers-panel.js only, driving
 * UI.LayersPanel.expandLayer directly via a minimal `{ app: { engine } }`
 * stand-in. A full-app harness (new window.Vectura.App()) was tried first
 * and was too slow in this sandbox (one run exceeded five minutes), so this
 * file calls the real production code path without the unrelated UI/render
 * bootstrap cost.
 */

const bboxOf = (paths) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  (paths || []).forEach((p) => {
    if (!Array.isArray(p)) return;
    p.forEach((pt) => {
      if (!pt) return;
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    });
  });
  return { minX, minY, maxX, maxY };
};

describe('expandLayer on a 3D Scene tree child is faithful to the composed scene', () => {
  let runtime, V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    V.UI.LayersPanel.bind({ SETTINGS: V.SETTINGS, Layer: V.Layer, clone: V.Utils.clone });
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const fakeUi = (engine) => ({ app: { engine }, layerLockedIds: new Set() });
  const expand = (engine, layer, options) =>
    V.UI.LayersPanel.expandLayer.call(fakeUi(engine), layer, { skipHistory: true, ...options });

  function buildSphereLightGroundScene() {
    const engine = new V.VectorEngine();
    engine.layers = [];
    // addSceneTree seeds exactly the reported scenario: a default object3d
    // (a sphere per ALGO_DEFAULTS.object3d.primitive), a directional "sun"
    // light child, and a ground child — one gesture, matching the bug report.
    const gid = engine.addSceneTree();
    engine.computeAllDisplayGeometry();
    const group = engine.getLayerById(gid);
    const sphere = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const ground = engine.getLayerDescendants(gid).find((l) => l.type === 'sceneGround3d');
    const light = engine.getLayerDescendants(gid).find((l) => l.type === 'sceneLight3d');
    return { engine, group, sphere, ground, light };
  }

  test('expanding the ground reproduces the SAME paths that were actually on canvas (no phantom hatch, same extent)', () => {
    const { engine, group, ground } = buildSphereLightGroundScene();
    expect(ground).toBeTruthy();

    // What was actually rendered for the ground BEFORE expand (includes its
    // own cast shadow — scene3d stamps ground + its shadow with the literal
    // sentinel id 'ground', not the child layer's own id).
    const preGroundPaths = group.scenePaths.filter(
      (p) => p && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground'
    );
    expect(preGroundPaths.length).toBeGreaterThan(0);
    const preBbox = bboxOf(preGroundPaths);
    expect(Number.isFinite(preBbox.minX)).toBe(true);

    const children = expand(engine, ground, { returnChildren: true, suppressRender: true });
    expect(Array.isArray(children)).toBe(true);
    const expandedPaths = children.map((c) => c.sourcePaths && c.sourcePaths[0]).filter(Boolean);

    // Defect 1 (no phantom hatch): identical path COUNT to what was really
    // rendered — a flowfield fallback would emit a different, density-driven
    // count of hatch segments instead.
    expect(expandedPaths.length).toBe(preGroundPaths.length);
    // Every expanded path still carries the real scene provenance — proof it
    // was sourced from the composed scene, not a disconnected algorithm.
    expect(expandedPaths.every((p) => p.meta && p.meta.sceneTarget
      && p.meta.sceneTarget.objectId === 'ground')).toBe(true);

    // Defect 2 (same place/extent): bbox matches the real ground quad+shadow
    // exactly — a flowfield hatch runs on the full document bounds/margins,
    // not the ground's own footprint.
    const postBbox = bboxOf(expandedPaths);
    expect(postBbox.minX).toBeCloseTo(preBbox.minX, 6);
    expect(postBbox.minY).toBeCloseTo(preBbox.minY, 6);
    expect(postBbox.maxX).toBeCloseTo(preBbox.maxX, 6);
    expect(postBbox.maxY).toBeCloseTo(preBbox.maxY, 6);
  });

  test('expanding a light child is a graceful no-op (lights stamp no geometry of their own)', () => {
    const { engine, light } = buildSphereLightGroundScene();
    expect(light).toBeTruthy();
    const preType = light.type;
    const children = expand(engine, light, { returnChildren: true, suppressRender: true });
    // No sceneTarget-tagged geometry exists for a light id, so nothing to
    // expand — the layer must be left exactly as it was (not corrupted into
    // an empty group).
    expect(children).toBeUndefined();
    expect(light.type).toBe(preType);
    expect(light.isGroup).toBeFalsy();
  });

  test('negative guard — expanding a NON-3D layer is completely unaffected by the scene-child fidelity fix', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const id = engine.addLayer('flowfield');
    const layer = engine.getLayerById(id);
    engine.generate(id);
    const rawCount = layer.paths.length;
    expect(rawCount).toBeGreaterThan(0);

    const children = expand(engine, layer, { returnChildren: true, suppressRender: true });
    expect(Array.isArray(children)).toBe(true);
    // getSceneChildRenderPaths must return null for a non-scene-tree type, so
    // the ordinary layer.paths path is exercised exactly as before the fix —
    // one child per raw path (flowfield never stamps meta.weightScale, so the
    // new multi-pass step is also a no-op here).
    expect(children.length).toBe(rawCount);
    expect(layer.isGroup).toBe(true);
    expect(layer.type).toBe('group');
  });
});
