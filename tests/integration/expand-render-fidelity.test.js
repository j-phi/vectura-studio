const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * T5 — EXPAND FIDELITY.  "Expand into group" must reproduce, exactly, the ink
 * that was on the canvas a moment before it was clicked.
 *
 * THE DEFECT THIS LOCKS OUT (the screenshotted one).  scene3d surface fills
 * carry their width as `meta.weightScale`, and expandLayer used to realize any
 * weightScale > 1 as N PARALLEL OFFSET COPIES of the centerline
 * (GeometryUtils.thickenPathsUniform).  On a sphere that is wrong twice:
 *
 *   - parallel copies of a curve near the limb sit OUTSIDE the silhouette, so
 *     the expanded group grows geometry the render never had (protrusion), and
 *   - the pass count is a discrete ceil(), so a smooth width ramp becomes a
 *     staircase of thick blobby bands with stepped ends.
 *
 * A scene fill's weightScale is not a claim on a pen that cannot grow — it is a
 * statement about WHICH REAL PEN draws the line (the three-pen tone laws snap
 * every run to an actual nib; the variable-width laws are moving to real ribbon
 * outline + pen-width fill geometry at weightScale 1).  So expand must pass it
 * through untouched.  Silhouette / crease EMPHASIS (`kind: 'sceneEdge'`,
 * spiralizer outlineWeight) is the opposite case and keeps its multi-pass
 * realization — covered by expand-scene3d-weight-to-strokes.test.js.
 *
 * HOW THIS IS MEASURED.  Not by comparing path lists (that would beg the
 * question) but by RASTERIZING the ink: every path is stamped into a boolean
 * grid at 4 samples per pen width, at the width the production resolver
 * (Renderer.resolvePathWeightScale) says it is drawn at, before and after
 * expand.  The two rasters are then diffed cell by cell.  This is the pixel
 * diff §5/T5 asks for, run deterministically in-process rather than through a
 * screenshot.  Round joins/caps are used for BOTH rasters, so cap treatment
 * cancels out of the diff and cannot mask a real geometry change.
 *
 * RGR: on the pre-fix code the fidelity ratio for the nibAngle sphere is a
 * large fraction (the expanded ink is a different, fatter, protruding shape)
 * and the protrusion cell count is in the tens of thousands.  Both are 0 after.
 *
 * Harness: the LEAN runtime plus renderer.js (needed for the production width
 * resolver) — see expand-scene3d-child-fidelity.test.js for why the full App
 * boot is avoided here.
 */

// ── RASTER ────────────────────────────────────────────────────────────────
// A boolean coverage grid. `stamp` marks every cell whose CENTER lies within
// `half` of the segment — i.e. the segment swept by a round pen of that width.
const makeRaster = (bbox, cell) => {
  const w = Math.max(1, Math.ceil((bbox.maxX - bbox.minX) / cell) + 1);
  const h = Math.max(1, Math.ceil((bbox.maxY - bbox.minY) / cell) + 1);
  return { minX: bbox.minX, minY: bbox.minY, cell, w, h, data: new Uint8Array(w * h) };
};

const stampSegment = (r, ax, ay, bx, by, half) => {
  const { cell, minX, minY, w, h, data } = r;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - half - minX) / cell));
  const i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + half - minX) / cell));
  const j0 = Math.max(0, Math.floor((Math.min(ay, by) - half - minY) / cell));
  const j1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + half - minY) / cell));
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const h2 = half * half;
  for (let j = j0; j <= j1; j++) {
    const py = minY + j * cell;
    const row = j * w;
    for (let i = i0; i <= i1; i++) {
      if (data[row + i]) continue;
      const px = minX + i * cell;
      let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const qx = px - (ax + t * dx);
      const qy = py - (ay + t * dy);
      if (qx * qx + qy * qy <= h2) data[row + i] = 1;
    }
  }
};

const bboxOf = (paths, pad) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  (paths || []).forEach((p) => {
    if (!Array.isArray(p)) return;
    p.forEach((pt) => {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
  });
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
};

module.exports = {};

describe('T5 — "expand into group" reproduces the rendered ink exactly', () => {
  let runtime; let V; let widthOf;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
    V.UI.LayersPanel.bind({ SETTINGS: V.SETTINGS, Layer: V.Layer, clone: V.Utils.clone });
    // The PRODUCTION width resolver — the raster is deliberately driven by the
    // same function the canvas render, the export preview and the emitted SVG
    // read, so a fidelity pass here is a statement about the real pipeline.
    widthOf = (path, penWidth) => penWidth * V.Renderer.resolvePathWeightScale(path);
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const fakeUi = (engine) => ({ app: { engine }, layerLockedIds: new Set() });
  const expand = (engine, layer, options) =>
    V.UI.LayersPanel.expandLayer.call(fakeUi(engine), layer, { skipHistory: true, ...options });

  const rasterize = (raster, paths, penWidth) => {
    (paths || []).forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const half = widthOf(path, penWidth) / 2;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        if (!a || !b) continue;
        stampSegment(raster, a.x, a.y, b.x, b.y, half);
      }
    });
  };

  // Returns { pre, post, only'd counts } for one before/after pair.
  const diffInk = (prePaths, postPaths, penWidth) => {
    const maxHalf = Math.max(
      ...prePaths.concat(postPaths).map((p) => widthOf(p, penWidth) / 2),
      penWidth,
    );
    const box = bboxOf(prePaths.concat(postPaths), maxHalf + penWidth);
    const cell = penWidth / 4; // 4 samples per pen width (§5 convention)
    const a = makeRaster(box, cell);
    const b = makeRaster(box, cell);
    rasterize(a, prePaths, penWidth);
    rasterize(b, postPaths, penWidth);
    let pre = 0; let post = 0; let onlyPre = 0; let onlyPost = 0;
    for (let i = 0; i < a.data.length; i++) {
      const x = a.data[i];
      const y = b.data[i];
      if (x) pre++;
      if (y) post++;
      if (x && !y) onlyPre++;
      if (!x && y) onlyPost++;
    }
    return { pre, post, onlyPre, onlyPost, cells: a.data.length };
  };

  // A real sphere ruled by a real variable-width tone law (`nibAngle`), lit,
  // tone on — i.e. exactly the object in the bug screenshot.
  const buildVariableWidthSphere = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const group = engine.getLayerById(gid);
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    child.penId = 'pen-1'; // 0.3mm — a deterministic, known pen width
    child.params.style.params = {
      ...child.params.style.params, fillAngle: 0, fillDensity: 60, toneLaw: 'nibAngle',
    };
    group.params.tone = { ...group.params.tone, enabled: true };
    engine.computeAllDisplayGeometry();
    return { engine, group, child, penWidth: 0.3 };
  };

  /* WHERE "VARIABLE WIDTH" IS NOW VISIBLE FROM (2026-08-29).
   *
   * This check used to look for fill paths at `meta.weightScale !== 1`. That is
   * the one thing the pen-width stroke-fill work makes IMPOSSIBLE on this
   * fixture: `nibAngle` is a bucket-B RIBBON law, and C3 rule 6 hard-asserts
   * that every path a ribbon law emits is a real single-pen stroke at
   * weightScale 1. The fixture is still variable-width — it is more genuinely
   * so than before, because the width is now drawn as real geometry rather than
   * claimed as a multiplier — so the sanity check reads it off the build report
   * instead. (This assertion was already failing on `sf/integration` before the
   * inert-ribbon fix, for the same reason.)
   */
  test('the sphere really is variable-width (fixture sanity)', () => {
    const { engine, child } = buildVariableWidthSphere();
    const paths = engine.getSceneChildRenderPaths(child.id);
    const fills = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill');
    expect(fills.length).toBeGreaterThan(50);

    const stats = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(stats.algo).toBe('nibAngle');
    expect(stats.ribbonLaw).toBe(true);
    // Real ribbons, with real outlines and real interior fills — a genuine
    // width RAMP built as geometry, not a flat offset and not a fallback to
    // bare centrelines.
    // 14 wide stretches on this fixture's default scene tree — a smaller sphere
    // than the tone fixtures use. The number is fixture-specific; that there are
    // plenty of them, and that they all became ribbons, is the claim.
    expect(stats.wide).toBeGreaterThan(8);
    expect(stats.ribbons).toBeGreaterThan(0);
    expect(stats.outlines).toBeGreaterThan(0);
    expect(stats.fills).toBeGreaterThan(0);
    // ...and the ribbon really did carry a varying width: some stretches were
    // wide enough to ribbonize and some were not.
    expect(stats.narrow).toBeGreaterThan(0);
    // C3 rule 6, restated where the old assertion used to sit: NOTHING here
    // asks the renderer for a fatter pen any more.
    const weighted = fills.filter((p) => Number.isFinite(Number(p.meta.weightScale)) && Number(p.meta.weightScale) !== 1);
    expect(weighted.length).toBe(0);
  });

  test('rasterized ink before and after expand is the same shape (pixel diff below threshold)', () => {
    const { engine, child, penWidth } = buildVariableWidthSphere();
    const prePaths = engine.getSceneChildRenderPaths(child.id).filter((p) => Array.isArray(p) && p.length > 1);
    expect(prePaths.length).toBeGreaterThan(0);

    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    expect(Array.isArray(children)).toBe(true);
    const postPaths = children.map((c) => c.sourcePaths && c.sourcePaths[0])
      .filter((p) => Array.isArray(p) && p.length > 1);
    expect(postPaths.length).toBeGreaterThan(0);

    const d = diffInk(prePaths, postPaths, penWidth);
    expect(d.pre).toBeGreaterThan(1000); // sanity: there IS ink to compare
    const ratio = (d.onlyPre + d.onlyPost) / d.pre;
    // Tight: any real geometry change moves thousands of cells at this
    // resolution. The pre-fix parallel-pass expansion scores ~0.5+ here.
    expect(ratio).toBeLessThan(0.001);
  });

  test('no protrusion — expand adds NO ink outside what was rendered', () => {
    const { engine, child, penWidth } = buildVariableWidthSphere();
    const prePaths = engine.getSceneChildRenderPaths(child.id).filter((p) => Array.isArray(p) && p.length > 1);
    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    const postPaths = children.map((c) => c.sourcePaths && c.sourcePaths[0])
      .filter((p) => Array.isArray(p) && p.length > 1);

    const d = diffInk(prePaths, postPaths, penWidth);
    // A hard 0, not a tuned tolerance: the expanded group may not put a single
    // sample of ink anywhere the render did not already have it. This is the
    // cell count that was in the tens of thousands before the fix — the blobby
    // bands hanging off the sphere's limb in the screenshot.
    expect(d.onlyPost).toBe(0);
  });

  test('bucket C — real pen tiers survive expand as distinct pen widths (not flattened, not faked)', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const group = engine.getLayerById(gid);
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    child.penId = 'pen-1';
    // Three real nibs, exactly as a three-pen tone law (penInterleave et al.)
    // emits them: the run is snapped to an actual pen in the tray and tagged.
    const tiered = [1, 2, 3.5].map((weightScale, k) => {
      const p = [{ x: 0, y: k * 5 }, { x: 20, y: k * 5 }];
      p.meta = {
        kind: 'sceneFill', sceneTarget: { objectId: child.id }, penTier: k, weightScale,
      };
      return p;
    });
    group.scenePaths = tiered;

    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    // One child per tier — never split into fake parallel passes of the fine pen.
    expect(children.length).toBe(3);
    // Read through the production resolver, not the raw meta: a weightScale of
    // exactly 1 is a no-op and is dropped, which changes no width anywhere.
    const scales = children.map((c) => V.Renderer.resolvePathWeightScale(c.sourcePaths[0]));
    expect(new Set(scales).size).toBeGreaterThanOrEqual(2); // T4: the exemption is intact
    expect(scales.sort((a, b) => a - b)).toEqual([1, 2, 3.5]);
    // ...and the tiers are still ONE stroke each, not fine-pen imitations.
    children.forEach((c) => expect(c.sourcePaths.length).toBe(1));
  });

  test('a per-path butt cap (`meta.strokeCap`) becomes the expanded child\'s own cap', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const group = engine.getLayerById(gid);
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    child.lineCap = 'round';
    const ribbon = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    ribbon.meta = { kind: 'sceneFill', sceneTarget: { objectId: child.id }, strokeCap: 'butt' };
    const plain = [{ x: 0, y: 4 }, { x: 10, y: 4 }];
    plain.meta = { kind: 'sceneFill', sceneTarget: { objectId: child.id } };
    group.scenePaths = [ribbon, plain];

    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    expect(children.length).toBe(2);
    const byCap = children.map((c) => c.lineCap);
    expect(byCap).toContain('butt');   // the ribbon pass ends flush, no bulge
    expect(byCap).toContain('round');  // everything else keeps the layer cap
    // The production resolver agrees with what expand baked onto the child.
    expect(V.Renderer.resolvePathLineCap(ribbon, 'round')).toBe('butt');
    expect(V.Renderer.resolvePathLineCap(plain, 'round')).toBe('round');
  });

  test('the three width consumers agree with expand on every weightScale', () => {
    // Canvas render, export preview and emitted SVG all clamp to [0.1, 6];
    // expand now reads the SAME resolver instead of its own copy, which is
    // where the drift started.
    const cases = [undefined, 1, 0.5, 2, 3.4, 7, 0.01, NaN];
    cases.forEach((weightScale) => {
      const p = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
      p.meta = { kind: 'sceneFill', weightScale };
      const resolved = V.Renderer.resolvePathWeightScale(p);
      expect(resolved).toBeGreaterThanOrEqual(0.1);
      expect(resolved).toBeLessThanOrEqual(6);
      if (!Number.isFinite(Number(weightScale)) || Number(weightScale) === 1) expect(resolved).toBe(1);
    });
  });
  /*
   * BOTH ENTRY POINTS INTO EXPANSION.  expandLayer has two sources: a scene-tree
   * child reads engine.getSceneChildRenderPaths (every test above), an ordinary
   * layer reads layer.paths. The width classification lives downstream of that
   * fork, so it must behave identically on either side — this covers the second
   * one, which was flagged as possibly untested.
   */
  describe('the ordinary layer.paths route classifies width the same way', () => {
    const plainLayerWith = (paths) => {
      const engine = new V.VectorEngine();
      engine.layers = [];
      const id = engine.addLayer('flowfield');
      const layer = engine.getLayerById(id);
      engine.generate(id);
      layer.paths = paths;
      delete layer._pathsFromDraft;
      return { engine, layer };
    };

    test('a real pen width on layer.paths is preserved, one child, no parallel copies', () => {
      const p = [{ x: 0, y: 0 }, { x: 20, y: 0 }];
      p.meta = { kind: 'sceneFill', weightScale: 3.4 };
      const { engine, layer } = plainLayerWith([p]);
      const children = expand(engine, layer, { returnChildren: true, suppressRender: true });
      expect(children.length).toBe(1);
      expect(V.Renderer.resolvePathWeightScale(children[0].sourcePaths[0])).toBe(3.4);
    });

    test('a width CLAIM on layer.paths still becomes real overlapping passes', () => {
      const p = [{ x: 0, y: 0 }, { x: 20, y: 0 }];
      p.meta = { kind: 'sceneEdge', weightScale: 3.4 }; // silhouette emphasis
      const { engine, layer } = plainLayerWith([p]);
      const children = expand(engine, layer, { returnChildren: true, suppressRender: true });
      expect(children.length).toBeGreaterThan(1);
      children.forEach((c) => {
        expect(c.sourcePaths[0].meta && ('weightScale' in c.sourcePaths[0].meta)).toBeFalsy();
      });
    });
  });
});
