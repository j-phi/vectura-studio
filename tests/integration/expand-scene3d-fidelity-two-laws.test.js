const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * UNIT E (docs/stroke-fill-handoff.md item E, plan F5) — expand fidelity for
 * `interlockWeave` (6%) and `amplitudeOnly` (10%), the two bucket-B laws the
 * handoff named as diverging from the live render after "Expand into group"
 * while the other ten sit at 0.2-1%.
 *
 * MEASURED, NOT ASSUMED. This file's own numbers (docs/3d-audit/handoff/unit-e/
 * stats.json) do not reproduce that gap on this branch:
 *
 *   - `git diff d5af9e30 HEAD -- src/ui/panels/layers-panel.js
 *     src/core/scene3d/surface-fill.js` is EMPTY, so a pre-sha pin to d5af9e30
 *     cannot measure anything different from HEAD.
 *   - The in-process rasterized-ink oracle below (same construction as
 *     `expand-render-fidelity.test.js`'s `diffInk`) reads 0% divergence for
 *     BOTH named laws AND for the `nibAngle`/`onePenDown` controls, on the
 *     scene-tree object3d-child route -- the only route "Expand into group"
 *     is reachable from today (`engine.addLayer('scene3d')` always redirects
 *     to `addSceneTree()`).
 *
 * WHY IT IS ALREADY ZERO. C3 rule 6 (tests/unit/scene3d-ribbon-weightscale-
 * invariant.test.js) hard-guarantees every bucket-B path is emitted at
 * `weightScale === 1`. `expandLayer`'s rule-2 branch
 * (`isRealPenWidthPath` + `raw !== 1`) therefore never fires for a bucket-B
 * path; every one of them falls through to the plain `raw <= 1` branch, which
 * clones the path, strips the (already-1, so absent) `meta.weightScale`, and
 * ships it untouched -- byte-identical ink by construction, not by luck. A
 * scene-tree child's "before" ink is itself a slice of the already-composed
 * `group.scenePaths` (`engine.getSceneChildRenderPaths`), so nothing is
 * regenerated on expand either. The handoff's 6%/10% almost certainly predate
 * this guarantee landing for all twelve bucket-B laws (see
 * `docs/torus-fix-evidence/stats-before.json` for the pre-CLS_WALLS state
 * where `erodeEmpty` WAS double digits) -- see `unit-e-notes.md`.
 *
 * A REAL, SEPARATE finding: driving the identical fixture through the actual
 * browser (docs/3d-audit/handoff/unit-e/stats.json
 * `realRenderFullCanvasDiff`) DOES show an 8-10% raw-canvas pixel diff after
 * expand -- but it is WITHIN 2 POINTS OF IDENTICAL across `interlockWeave`,
 * `amplitudeOnly`, `nibAngle` and `onePenDown` alike, so it cannot be the
 * per-law gap the handoff named; it reads as a render-order/anti-aliasing
 * floor common to any expand, not a fidelity defect in these two laws. Per
 * plan-E's own "stop and report" clause, that is quantified and reported
 * here, not chased.
 *
 * This file exists as NEW regression coverage locking in the good state
 * above (nothing previously pinned expand-fidelity for these two specific
 * laws), with the anti-vacuity guards plan-E requires: `after.children > 0`,
 * and the raw JSON of the pre/post path sets must NOT be literally identical
 * (proving expand actually ran and transformed the data -- cloned + stripped
 * meta -- rather than a no-op, e.g. the `isGroup` trap where `expandLayer`
 * returns immediately and measures nothing).
 */

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

const LAWS = ['interlockWeave', 'amplitudeOnly'];

describe('T5/UNIT E — expand fidelity for interlockWeave and amplitudeOnly', () => {
  let runtime; let V; let widthOf;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
    V.UI.LayersPanel.bind({ SETTINGS: V.SETTINGS, Layer: V.Layer, clone: V.Utils.clone });
    widthOf = (path, penWidth) => penWidth * V.Renderer.resolvePathWeightScale(path);
  }, 60000);

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

  const diffInk = (prePaths, postPaths, penWidth) => {
    const maxHalf = Math.max(
      ...prePaths.concat(postPaths).map((p) => widthOf(p, penWidth) / 2),
      penWidth,
    );
    const box = bboxOf(prePaths.concat(postPaths), maxHalf + penWidth);
    const cell = penWidth / 4;
    const a = makeRaster(box, cell);
    const b = makeRaster(box, cell);
    rasterize(a, prePaths, penWidth);
    rasterize(b, postPaths, penWidth);
    let pre = 0; let onlyPre = 0; let onlyPost = 0;
    for (let i = 0; i < a.data.length; i++) {
      const x = a.data[i];
      const y = b.data[i];
      if (x) pre++;
      if (x && !y) onlyPre++;
      if (!x && y) onlyPost++;
    }
    return { pre, onlyPre, onlyPost };
  };

  const buildSphere = (law) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const group = engine.getLayerById(gid);
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    child.penId = 'pen-1';
    child.params.style.params = {
      ...child.params.style.params, fillAngle: 0, fillDensity: 60, toneLaw: law,
    };
    group.params.tone = { ...group.params.tone, enabled: true };
    engine.computeAllDisplayGeometry();
    return { engine, child, penWidth: 0.3 };
  };

  test.each(LAWS)('%s — is a real bucket-B ribbon law on this fixture (sanity)', (law) => {
    const { engine, child } = buildSphere(law);
    const stats = V.Scene3D.SurfaceFill.lastRibbonStats;
    expect(stats.algo).toBe(law);
    expect(stats.ribbonLaw).toBe(true);
    const paths = engine.getSceneChildRenderPaths(child.id).filter((p) => Array.isArray(p) && p.length > 1);
    expect(paths.length).toBeGreaterThan(20);
  });

  test.each(LAWS)('%s — expand divergence is within the 0.2-1%% band (measured 0%%)', (law) => {
    const { engine, child, penWidth } = buildSphere(law);
    const prePaths = engine.getSceneChildRenderPaths(child.id).filter((p) => Array.isArray(p) && p.length > 1);
    expect(prePaths.length).toBeGreaterThan(0);

    const children = expand(engine, child, { returnChildren: true, suppressRender: true });
    // Anti-vacuity #1 (plan-E / handoff): a forced `isGroup=true` makes
    // `expandLayer` return immediately and measure nothing. Prove it ran.
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBeGreaterThan(0);

    const postPaths = children.map((c) => c.sourcePaths && c.sourcePaths[0])
      .filter((p) => Array.isArray(p) && p.length > 1);
    expect(postPaths.length).toBeGreaterThan(0);

    // Anti-vacuity #2: expand must have actually transformed the data (clone +
    // meta strip), not handed back the same objects untouched.
    expect(JSON.stringify(postPaths)).not.toBe(JSON.stringify(prePaths));

    const d = diffInk(prePaths, postPaths, penWidth);
    expect(d.pre).toBeGreaterThan(1000); // sanity: there IS ink to compare
    const ratio = (d.onlyPre + d.onlyPost) / d.pre;
    // The named contract: divergence <= 1% (0.01). Measured: 0.
    expect(ratio).toBeLessThanOrEqual(0.01);
  });
});
