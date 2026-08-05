const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Expand-to-layers must emit FULL-QUALITY geometry, never a stale DRAFT frame.
 *
 * scene3d's live-drag (fastPreview) frame renders region fills (spiral/contour/
 * stipple) as a cheap screen-space HATCH — every fill line is a 2-point segment
 * — instead of dispatching the real mapper (a spiral is one long continuous
 * winding run, hundreds of vertices). If a draft frame is the last thing that
 * ran, `layer.paths` holds that cheap hatch. expandLayer used to reuse that
 * cache verbatim (it regenerated only when paths were EMPTY), so the flattened
 * children diverged from the settled viewport: misaligned, cheap-hatch fills
 * instead of the real spiral fragments.
 *
 * RGR: on the pre-fix code the children carry the 2-point draft hatch (longest
 * sceneFill run == 2), NOT the ~272-vertex full spiral — this test fails. After
 * the fix (expandLayer forces a full-quality regenerate when the cached paths
 * came from a draft frame) the children match a fresh full generate.
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// Longest sceneFill run in a path set — the spiral's continuous winding run is
// hundreds of vertices at full quality, but only a 2-point segment as draft hatch.
const longestFill = (paths) =>
  Math.max(0, ...(paths || [])
    .filter((p) => p && p.meta && p.meta.kind === 'sceneFill' && Array.isArray(p))
    .map((p) => p.length));

describe('expandLayer emits full-quality geometry after a draft frame', () => {
  let runtime, window, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function makeSpiralScene() {
    const engine = app.engine;
    // Scene-tree Increment D: Add Layer now builds a TREE; this test exercises
    // the MONOLITH expand path, so build a monolith leaf directly (the saved-doc
    // load shape).
    const layer = new window.Vectura.Layer(`mono-spiral-${Math.random().toString(36).slice(2)}`, 'scene3d', 'Scene');
    engine.layers.push(layer);
    engine.activeLayerId = layer.id;
    const id = layer.id;
    layer.params.objects = [{
      id: 'obj-1', name: 'box', primitive: 'box',
      params: { sx: 60, sy: 60, sz: 60 },
      transform: { x: 0, y: 0, z: 0, yaw: 22, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid',
    }];
    layer.params.ground = { enabled: false };
    layer.params.styleTable = {
      scene: { penId: null, mapper: 'spiral', params: { fillAngle: 0, fillDensity: 50, spacing: 5 } },
      byObject: {}, byFace: {},
    };
    return { engine, id, layer };
  }

  test('a spiral scene3d layer expanded after a DRAFT frame carries the full spiral, not the cheap hatch', () => {
    const { engine, id, layer } = makeSpiralScene();

    // Full-quality reference: the real spiral is one long continuous run.
    engine.generate(id);
    const fullLongest = longestFill(layer.paths);
    expect(fullLongest).toBeGreaterThan(100);

    // Now a live-drag DRAFT frame overwrites the cache with cheap 2-point hatch.
    engine.generate(id, { fastPreview: true });
    const draftLongest = longestFill(layer.paths);
    expect(draftLongest).toBeLessThanOrEqual(4); // proves the draft is genuinely cheaper

    // Expand while the draft cache is the last thing that ran.
    const children = app.ui.expandLayer(layer, { returnChildren: true, suppressRender: true });
    expect(Array.isArray(children) && children.length).toBeGreaterThan(0);

    // The flattened children must reflect FULL quality (the settled viewport),
    // not the draft. Each child holds one source path (curves/meta preserved).
    const childPaths = children.map((c) => c.sourcePaths && c.sourcePaths[0]).filter(Boolean);
    const childLongest = longestFill(childPaths);
    expect(childLongest).toBeGreaterThan(100);
  });

  test('a non-draft (already full-quality) expand is unaffected — no needless regen mismatch', () => {
    const { engine, id, layer } = makeSpiralScene();
    engine.generate(id); // full quality is the last frame
    const fullLongest = longestFill(layer.paths);
    expect(fullLongest).toBeGreaterThan(100);

    const children = app.ui.expandLayer(layer, { returnChildren: true, suppressRender: true });
    const childPaths = children.map((c) => c.sourcePaths && c.sourcePaths[0]).filter(Boolean);
    expect(longestFill(childPaths)).toBeGreaterThan(100);
  });
});
