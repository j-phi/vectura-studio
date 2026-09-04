/**
 * THE GROUND DOUBLE-PLOT — Round 9 §5.7, Round 10 P0 item 4.
 *
 * The scorecard states it:
 *
 *   > `mapper: 'none'` on the ground emits the ground quad's 4 border segments
 *   > TWICE, with byte-identical coordinates, once as `sceneFace` and once as
 *   > `sceneEdge` — 4 paths / 1520.96 mm each. The shadow-anatomy fixture uses
 *   > exactly that ground style.
 *
 * It contaminates no criterion on that scorecard — a boolean grid and a browser
 * raster both count a pixel inked twice as one dark pixel, which is precisely
 * why D is read off a raster and never summed from ink length (§0). It is still
 * a defect, and a PLOTTER one: the pen retraces four long lines, doubling ink
 * and pen wear on the ground border for no visual gain whatsoever. Any ABSOLUTE
 * `totalInk` quoted for a ground-on view in this workstream is ~1521 mm high.
 *
 * WHERE IT COMES FROM
 * -------------------
 * `scene3d.js` has two passes that both draw an object's outline:
 *
 *   1. the FACE-OUTLINE pass inside `record.faces.forEach`, which for a FACETED
 *      prim under a non-surface-fill mapper walks each front face's edges and
 *      draws the ones that are neither `crease` nor `interior` — i.e. exactly
 *      the silhouette + boundary set; and
 *   2. the STRUCTURAL EDGE pass (`kind: 'sceneEdge'`), which drops `interior`
 *      and (for a non-wireframe) `crease`, and draws exactly the same set.
 *
 * The source comment called this out for itself — "the structural edge pass
 * below draws the same outline — documented double-draw" — and documenting a
 * defect does not discharge it.
 *
 * THE ASSERTION IS COORDINATE IDENTITY, NOT A COUNT
 * -------------------------------------------------
 * A path count is a proxy: a legitimate change (a new border-emphasis pass, a
 * dash split) moves it without retracing anything. What the plotter cares about
 * is two pens travelling the same millimetres, so the test asserts that no two
 * emitted paths carry the same ordered coordinate list. That is the property
 * the fix has to establish, stated on the quantity it names.
 *
 * RED/GREEN PROVENANCE (measured at 82789c4, before the fix)
 * ----------------------------------------------------------
 *   A-off      4 pairs, 1520.96 mm retraced   all sceneFace/sceneEdge, obj=ground
 *   A-2        4 pairs, 1520.96 mm retraced   "
 *   A-3        4 pairs, 1520.96 mm retraced   "
 *   A-4        4 pairs, 1520.96 mm retraced   "
 *   F-trio     5 pairs, 1526.98 mm retraced   4 as above + one 6.02 mm
 *                                             sceneFill/sceneFill on the capsule
 * A ground-OFF view (E-bands4) was already clean at HEAD, which is the control:
 * the defect is the ground's, not every faceted object's.
 *
 * THE CAPSULE'S 6.02 mm IS A DIFFERENT DEFECT AND IS NOT FIXED HERE.
 * `F-trio` carries one further retrace: two `sceneFill` hatch runs on the capsule
 * land on identical coordinates (6.02 mm), almost certainly where the capsule's
 * chart seam is hatched from both sides. It is a real retrace and it is reported
 * as a Round 10 finding, but it belongs to the FILL, and de-duplicating the
 * outline must not touch `sceneFill` at all — a fix there would move tone
 * numbers, which this change must not. So the whole-drawing assertion below is
 * stated over the OUTLINE kinds (`sceneFace` + `sceneEdge`), which is precisely
 * the pair of passes §5.7 names, and the fill retrace is pinned separately at its
 * measured value so it cannot grow unnoticed.
 */
/**
 * ...and the hazard on the way out, which is why the second describe exists.
 *
 * The removed pass stamped `pickPolygon` on every segment it drew, and its own
 * comment said face-mode point-in-polygon picking depended on it. It does not:
 * the renderer consults `pickPolygon` only for `sceneFace`/`sceneFill`, and a
 * faceted object's face-mode pick is served by `_scenePickFaces` →
 * `_scenePolyDepthAt`, which re-derives the real front faces from the scene
 * assembly and needs the object merely to be PRESENT among the emitted paths.
 * That pass was written for exactly this case — its own comment names "a
 * 'none'-mapper box (no emitted face…) and the ground plane" — and it gives a
 * truer per-pixel depth than the face centroid the removed pass stamped.
 *
 * That is an argument. The test below is the evidence.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const FIX = require('../fixtures/scene3d-shadow-anatomy');

// §0 — nothing restated. Every scene comes from the fixture's own views.
const { buildPaths } = FIX;

// Ground-ON views (the fixture's `ground: { enabled: true }` default) and one
// ground-OFF control. `E-bands4` is on the four-fixture ladder.
const GROUND_ON = ['A-off', 'A-2', 'A-3', 'A-4', 'F-trio'];
const GROUND_OFF = ['E-bands4'];

const len = (path) => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
};

// A path's identity for retrace purposes: the ordered coordinate list, rounded
// to 1e-6 mm so float noise cannot mask (or manufacture) a match. A reversed
// retrace is the same physical travel, so the canonical key is the lexically
// smaller of the forward and reversed encodings.
const traceKey = (path) => {
  const fwd = path.map((pt) => `${pt.x.toFixed(6)},${pt.y.toFixed(6)}`);
  const rev = fwd.slice().reverse();
  const a = fwd.join(' ');
  const b = rev.join(' ');
  return a <= b ? a : b;
};

const OUTLINE_KINDS = new Set(['sceneFace', 'sceneEdge']);

const duplicates = (paths, kinds = null) => {
  const seen = new Map();
  const dupes = [];
  paths.forEach((path) => {
    if (!Array.isArray(path) || path.length < 2) return;
    const kind = path.meta && path.meta.kind;
    if (kinds && !kinds.has(kind)) return;
    const key = traceKey(path);
    const prev = seen.get(key);
    if (prev) {
      dupes.push({ key, path, kinds: [prev.meta && prev.meta.kind, kind] });
      return;
    }
    seen.set(key, path);
  });
  return dupes;
};

let V;
let runtime;

beforeAll(async () => {
  runtime = await loadVecturaRuntime({ includeRenderer: true });
  V = runtime.window.Vectura;
});

afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

describe('§5.7 — the ground border is drawn once, not twice', () => {
  GROUND_ON.forEach((viewId) => {
    test(`${viewId}: no two outline paths retrace the same coordinates`, () => {
      const paths = buildPaths(V, viewId);
      expect(paths.length).toBeGreaterThan(0);
      const dupes = duplicates(paths, OUTLINE_KINDS);
      const retraced = dupes.reduce((sum, d) => sum + len(d.path), 0);
      // The message carries the numbers so a RED run is self-documenting.
      expect({ view: viewId, pairs: dupes.length, retracedMm: Number(retraced.toFixed(2)) })
        .toEqual({ view: viewId, pairs: 0, retracedMm: 0 });
    });
  });

  GROUND_OFF.forEach((viewId) => {
    test(`${viewId} (ground OFF, control): also clean`, () => {
      const paths = buildPaths(V, viewId);
      expect(paths.length).toBeGreaterThan(0);
      expect(duplicates(paths, OUTLINE_KINDS).length).toBe(0);
    });
  });

  // The A-views carry no fill retrace at all, so on them the invariant holds
  // over the WHOLE drawing — no kind filter, nothing excluded.
  test('A-4: no two paths of ANY kind retrace the same coordinates', () => {
    expect(duplicates(buildPaths(V, 'A-4')).length).toBe(0);
  });

  // §0's standing rule: a probe may not be quoted until it has been shown able
  // to say NO. Feed the detector a known retrace and a known reversal.
  describe('the detector can say NO', () => {
    const seg = (x0, y0, x1, y1) => Object.assign(
      [{ x: x0, y: y0 }, { x: x1, y: y1 }], { meta: { kind: 'sceneEdge' } },
    );

    test('an exact retrace is reported', () => {
      expect(duplicates([seg(0, 0, 10, 0), seg(0, 0, 10, 0)]).length).toBe(1);
    });

    test('a REVERSED retrace is reported (same travel, opposite direction)', () => {
      expect(duplicates([seg(0, 0, 10, 0), seg(10, 0, 0, 0)]).length).toBe(1);
    });

    test('two distinct segments are not reported', () => {
      expect(duplicates([seg(0, 0, 10, 0), seg(0, 1, 10, 1)]).length).toBe(0);
    });
  });
});

describe('removing the pass did not remove the picking it claimed to carry', () => {
  // The scene the defect lives on, not a stand-in: `A-4`'s ground IS the
  // `mapper: 'none'` faceted quad that was drawn twice. A scene TREE would have
  // been the wrong rig — it ships as `wireframe`, which never ran the removed
  // pass, so every assertion below would have passed at HEAD as well and proved
  // nothing.
  const build = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const id = engine.addLayer('scene3d');
    const layer = engine.getLayerById(id);
    layer.params = FIX.buildParams(V, 'A-4');
    engine.computeAllDisplayGeometry();
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    renderer.activeTool = 'select';
    renderer.ready = true;
    return { engine, renderer, layer };
  };

  // A point strictly inside the ground quad and outside every other object's
  // projected face — 90 % of the way from the ground's centroid to one of its
  // own corners, which on this view is clear of both the ball and the post.
  const groundInteriorPoint = (renderer, layer) => {
    const faces = renderer._scenePickFaces(layer);
    const g = faces.find((f) => f.objectId === 'ground');
    expect(g).toBeTruthy();
    const c = g.poly.reduce((a, p) => ({ x: a.x + p.x / g.poly.length, y: a.y + p.y / g.poly.length }),
      { x: 0, y: 0 });
    const others = faces.filter((f) => f.objectId !== 'ground');
    for (let i = 0; i < g.poly.length; i++) {
      const v = g.poly[i];
      const pt = { x: c.x + 0.9 * (v.x - c.x), y: c.y + 0.9 * (v.y - c.y) };
      const covered = others.some((f) => renderer._scenePolyDepthAt(f.poly, pt.x, pt.y) !== null);
      if (!covered && renderer._scenePolyDepthAt(g.poly, pt.x, pt.y) !== null) return pt;
    }
    throw new Error('no clear ground point');
  };

  test('the ground emits NO sceneFace path at all (the premise of the tests below)', () => {
    // This is the assertion that fails at 82789c4 — it is what makes the picking
    // results underneath evidence rather than decoration.
    const { renderer, layer } = build();
    const paths = renderer.getInteractionPaths(layer) || [];
    const faces = paths.filter((p) => p.meta && p.meta.kind === 'sceneFace'
      && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground');
    expect(faces.length).toBe(0);
  });

  test('a click in the ground INTERIOR still resolves a FACE candidate', () => {
    const { renderer, layer } = build();
    const pt = groundInteriorPoint(renderer, layer);
    const stack = renderer._sceneCandidatesAtPoint(pt, 'face');
    expect(stack.length).toBeGreaterThan(0);
    expect(stack[0].objectId).toBe('ground');
    expect(typeof stack[0].faceId).toBe('string');
  });

  test('object-mode picking is unaffected too', () => {
    const { renderer, layer } = build();
    const pt = groundInteriorPoint(renderer, layer);
    const stack = renderer._sceneCandidatesAtPoint(pt, 'object');
    expect(stack.length).toBeGreaterThan(0);
    expect(stack[0].objectId).toBe('ground');
  });

  test('edge-mode picking still finds the ground outline (the surviving pass)', () => {
    const { renderer, layer } = build();
    const paths = renderer.getInteractionPaths(layer) || [];
    const edge = paths.find((p) => p.meta && p.meta.kind === 'sceneEdge'
      && p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'ground');
    expect(edge).toBeTruthy();
    const mid = { x: (edge[0].x + edge[1].x) / 2, y: (edge[0].y + edge[1].y) / 2 };
    const stack = renderer._sceneCandidatesAtPoint(mid, 'edge');
    expect(stack.some((c) => c.kind === 'edge' && c.objectId === 'ground')).toBe(true);
  });
});

describe('the retraced ink is measured, not assumed', () => {
  test('a ground-ON view retraces zero millimetres of outline', () => {
    const paths = buildPaths(V, 'A-4');
    const retraced = duplicates(paths, OUTLINE_KINDS).reduce((sum, d) => sum + len(d.path), 0);
    expect(Number(retraced.toFixed(2))).toBe(0);
  });

  // The capsule's fill retrace, pinned at its measured value. This is NOT an
  // endorsement — it is a defect held still. Reducing it is a pass; growing it
  // fails, and the number here is what a later round has to argue against.
  test('F-trio: the KNOWN capsule fill retrace has not grown (6.02 mm, 1 pair)', () => {
    const dupes = duplicates(buildPaths(V, 'F-trio'), new Set(['sceneFill']));
    const retraced = dupes.reduce((sum, d) => sum + len(d.path), 0);
    expect(dupes.length).toBeLessThanOrEqual(1);
    expect(retraced).toBeLessThanOrEqual(6.1);
  });
});
