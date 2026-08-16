/*
 * Draw Order POSITION contract — the colour overlay must sit exactly on the
 * geometry the canvas actually drew. Order is not enough: an overlay that
 * describes the right print order but paints it 40mm up-and-left of the real
 * artwork is worse than no overlay at all.
 *
 * Why this file exists. A previous attempt at the draw-order fix
 * (0c09053, reverted in 1dc1e53) re-sourced the overlay from
 * engine.getRenderablePaths instead of layer.optimizedPaths. A follow-up on top
 * of it also stopped excluding GROUPS from the preview scope, and the user saw:
 *   - a coloured capsule offset up and to the left of the real capsule,
 *   - stray diagonal overlay segments in empty corners of the canvas,
 *   - a displaced cast shadow.
 * Nothing in the suite noticed, because every existing draw-order test asserted
 * on ORDER (sequence of paths) and none asserted on POSITION (where the ink
 * lands). This file closes that hole.
 *
 * Two independent guards:
 *
 *   1. IDENTITY. Every overlay item's `path` must be a member of its own
 *      `item.layer`'s renderable set. The overlay traces items with
 *      `traceLayerPath(path, item.layer, …)`, so a path attributed to the wrong
 *      layer is stroked under the wrong transform. This is the cheap, precise
 *      guard: it fires the moment geometry is pulled from one layer and drawn
 *      as another (e.g. a scene GROUP's composed scenePaths attributed to a
 *      child object3d layer).
 *
 *   2. PIXEL-SPACE SUBSET. Capture every coordinate the renderer hands to the
 *      2D context during a real `renderer.draw()` with the overlay OFF, then
 *      again with it ON. The overlay may only re-trace coordinates the base
 *      draw already emitted — the set difference must be EMPTY. An offset ghost
 *      or a stray corner segment introduces coordinates that were never in the
 *      base draw, so this catches misplacement no matter which code path
 *      introduced it.
 *
 * Also pinned here: a 3D SCENE group contributes no preview items at all.
 * Scenes have no draw order (engine.optimizeLayers filters `!layer.isGroup`, so
 * no group path ever carries meta.lineSortOrder), and colouring composition
 * order as if it were plot order is a lie. That is a documented, separately
 * queued gap — this test freezes the honest behaviour so nobody "fixes" it by
 * dropping group geometry into the overlay in the wrong space again.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Draw Order: the overlay sits exactly on the drawn geometry', () => {
  let runtime, window, app, engine, renderer, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    engine = app.engine;
    renderer = app.renderer;
    SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.cropExports = false;
    SETTINGS.plotterOptimize = 0;
    // 'replace' makes the BASE draw render the optimized geometry too, so the
    // overlay's paths and the base draw's paths are the same objects and the
    // coordinate-subset comparison is exact rather than approximate.
    SETTINGS.optimizationPreview = 'replace';
    // Without this the pipeline bypasses every step, no path carries
    // meta.lineSortOrder, and drawOptimizedOverlay falls back to its FLAT
    // single-colour branch — which never touches getDrawOrderPreviewItems. The
    // gradient branch is the one the user is looking at, so that is the one
    // this file has to exercise.
    SETTINGS.optimizationExport = true;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const resetDoc = () => {
    engine.layers.slice().forEach((l) => { try { engine.removeLayer(l.id); } catch (e) { /* noop */ } });
    engine.layers.length = 0;
  };

  // The reported setting: Line Sort method Nearest + direction Vertical — the
  // combination that buckets paths into a top-to-bottom directional sweep
  // (engine.js buildDirectionalBuckets). 'directional' is not a method id.
  const applyVerticalSort = () => {
    engine.layers.forEach((l) => {
      if (l.isGroup) return;
      const opt = engine.ensureLayerOptimization(l);
      const step = opt?.steps?.find((s) => s.id === 'linesort');
      if (!step) return;
      step.enabled = true;
      step.bypass = false;
      step.method = 'nearest';
      step.direction = 'vertical';
      step.grouping = 'combined';
    });
    engine.optimizeLayers(engine.layers, { includePlotterOptimize: true });
  };

  // Coordinates are captured as raw {x, y} in document millimetres.
  //
  // The comparison is PROXIMITY, not identity: the overlay splits each path
  // into gradient chunks and re-traces them, and quadratic smoothing recomputes
  // its control points per chunk, so chunk-boundary control points differ from
  // the whole-path ones by microns. Those are the same line. A misplaced ghost
  // is not — the reported one was tens of millimetres off, and the stray
  // segments were in otherwise empty corners of the artboard. TOL_MM is set far
  // below any real displacement and far above smoothing noise.
  const TOL_MM = 1.0;

  // Densification step for the base-ink index. The overlay re-chunks and
  // re-smooths, so its vertices fall ANYWHERE along the drawn stroke, not on
  // the base draw's vertices. Sampling the base stroke finely turns "is this
  // overlay vertex on the drawn line?" into a point-to-point lookup.
  const STEP_MM = 0.25;

  // Record every coordinate the renderer hands to the 2D context during one
  // real draw(). The jsdom context is a stub, so these are the pre-viewport
  // DOCUMENT-space coordinates the renderer computes — precisely the space a
  // misplacement would show up in. `dense` walks the stroke; `raw` is the
  // vertex stream used as query points.
  const captureDraw = () => {
    const ctx = renderer.ctx;
    const raw = [];
    const dense = [];
    let cur = null;
    const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    const mark = (p) => { if (finite(p)) raw.push(p); };
    const walk = (from, to, at) => {
      if (!finite(from) || !finite(to)) return;
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP_MM));
      for (let i = 0; i <= steps; i++) dense.push(at(i / steps));
    };
    const saved = {};
    const wrap = (name, handler) => {
      saved[name] = ctx[name];
      ctx[name] = function patched(...args) {
        try { handler(args); } catch (e) { /* keep drawing */ }
        if (typeof saved[name] === 'function') return saved[name].apply(ctx, args);
        return undefined;
      };
    };
    wrap('moveTo', (a) => { cur = { x: a[0], y: a[1] }; mark(cur); if (finite(cur)) dense.push(cur); });
    wrap('lineTo', (a) => {
      const to = { x: a[0], y: a[1] };
      mark(to);
      const from = cur;
      walk(from, to, (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }));
      cur = to;
    });
    wrap('quadraticCurveTo', (a) => {
      const c = { x: a[0], y: a[1] };
      const to = { x: a[2], y: a[3] };
      mark(c); mark(to);
      const from = cur;
      walk(from, to, (t) => {
        const u = 1 - t;
        return {
          x: u * u * from.x + 2 * u * t * c.x + t * t * to.x,
          y: u * u * from.y + 2 * u * t * c.y + t * t * to.y,
        };
      });
      cur = to;
    });
    wrap('bezierCurveTo', (a) => {
      const c1 = { x: a[0], y: a[1] };
      const c2 = { x: a[2], y: a[3] };
      const to = { x: a[4], y: a[5] };
      mark(c1); mark(c2); mark(to);
      const from = cur;
      walk(from, to, (t) => {
        const u = 1 - t;
        return {
          x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
          y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
        };
      });
      cur = to;
    });
    // Circles/rects: index the whole outline so a circle-kind path counts as ink.
    wrap('arc', (a) => {
      const cx = a[0], cy = a[1], r = a[2];
      if (![cx, cy, r].every(Number.isFinite)) return;
      const n = Math.max(24, Math.ceil((2 * Math.PI * r) / STEP_MM));
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI * 2;
        dense.push({ x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) });
      }
      raw.push({ x: cx + r, y: cy });
      cur = null;
    });
    wrap('ellipse', (a) => {
      const cx = a[0], cy = a[1], rx = a[2], ry = a[3];
      if (![cx, cy, rx, ry].every(Number.isFinite)) return;
      const n = Math.max(24, Math.ceil((Math.PI * (rx + ry)) / STEP_MM));
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI * 2;
        dense.push({ x: cx + rx * Math.cos(th), y: cy + ry * Math.sin(th) });
      }
      raw.push({ x: cx + rx, y: cy });
      cur = null;
    });
    wrap('rect', (a) => {
      const [x, y, w, h] = a;
      if (![x, y, w, h].every(Number.isFinite)) return;
      [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(([px, py]) => dense.push({ x: px, y: py }));
      cur = null;
    });
    try {
      renderer.draw();
    } finally {
      Object.keys(saved).forEach((name) => { ctx[name] = saved[name]; });
    }
    return { raw, dense: dense.filter(finite) };
  };

  // Spatial hash over the densified base ink at TOL_MM resolution, so the
  // "is this overlay vertex on the drawn ink?" query is a 3x3 bucket lookup
  // rather than an O(n*m) scan.
  const makeInkIndex = (points) => {
    const cells = new Map();
    const cellKey = (cx, cy) => `${cx}|${cy}`;
    points.forEach((p) => {
      const k = cellKey(Math.floor(p.x / TOL_MM), Math.floor(p.y / TOL_MM));
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(p);
    });
    return (q) => {
      const cx = Math.floor(q.x / TOL_MM);
      const cy = Math.floor(q.y / TOL_MM);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = cells.get(cellKey(cx + dx, cy + dy));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            if (Math.hypot(bucket[i].x - q.x, bucket[i].y - q.y) <= TOL_MM) return true;
          }
        }
      }
      return false;
    };
  };

  const drawWithAndWithoutOverlay = () => {
    SETTINGS.lineSortOverlayVisible = false;
    const base = captureDraw();
    SETTINGS.lineSortOverlayVisible = true;
    const withOverlay = captureDraw();
    SETTINGS.lineSortOverlayVisible = false;
    // Index the sampled stroke AND the base draw's own vertex stream: a
    // quadratic CONTROL point sits off the curve by design (the smoothed stroke
    // passes through the midpoints), and the overlay re-emits those same
    // polyline vertices as its chunk controls. Both are legitimate ink.
    const onInk = makeInkIndex(base.dense.concat(base.raw));
    const strays = withOverlay.raw.filter((p) => !onInk(p));
    return {
      base: base.raw,
      withOverlay: withOverlay.raw,
      baseBounds: bounds(base.raw),
      overlayBounds: bounds(withOverlay.raw),
      strays,
      // A readable failure message: where did the stray ink land?
      straySample: strays.slice(0, 5).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`),
    };
  };

  const bounds = (points) => points.reduce((acc, p) => ({
    x0: Math.min(acc.x0, p.x), y0: Math.min(acc.y0, p.y),
    x1: Math.max(acc.x1, p.x), y1: Math.max(acc.y1, p.y),
  }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

  // Enabling the overlay must not grow the inked area. A dense hatch field can
  // absorb a translated ghost point-for-point (a shifted line lands on its
  // neighbour), so proximity alone is not enough — the EXTENT of the ink is the
  // check that a bodily displacement cannot survive.
  const boundsGrowth = (base, overlay) => ({
    left: +(base.x0 - overlay.x0).toFixed(3),
    top: +(base.y0 - overlay.y0).toFixed(3),
    right: +(overlay.x1 - base.x1).toFixed(3),
    bottom: +(overlay.y1 - base.y1).toFixed(3),
  });

  describe('a plain 2D document with a vertical draw order', () => {
    beforeAll(() => {
      resetDoc();
      const id = engine.addLayer('wavetable');
      engine.generate(id);
      engine.computeAllDisplayGeometry();
      applyVerticalSort();
      renderer.drawProgress = 1;
    });

    test('every overlay item belongs to the layer it is drawn as', () => {
      const targetIds = renderer.getOptimizationTargetIds();
      const { items } = renderer.getDrawOrderPreviewItems();
      expect(items.length).toBeGreaterThan(10);
      const owned = new Map();
      items.forEach(({ layer, path }) => {
        if (!owned.has(layer.id)) {
          owned.set(layer.id, new Set(
            engine.getRenderablePaths(layer, { useOptimized: targetIds.has(layer.id) }) || []
          ));
        }
        // REGRESSION GUARD: a path stroked under `layer`'s transform must be
        // one of `layer`'s own paths.
        expect(owned.get(layer.id).has(path)).toBe(true);
      });
    });

    test('the overlay re-traces the drawn ink and never lands ink off it', () => {
      const r = drawWithAndWithoutOverlay();
      expect(r.base.length).toBeGreaterThan(0);
      // Non-vacuous: the overlay really did stroke something this draw.
      expect(r.withOverlay.length).toBeGreaterThan(r.base.length);
      // REGRESSION GUARD: a stray segment puts overlay ink where the base draw
      // laid none.
      expect({ count: r.strays.length, at: r.straySample })
        .toEqual({ count: 0, at: [] });
      // REGRESSION GUARD: turning the overlay on must not extend the inked
      // area in ANY direction — a bodily displaced ghost always does.
      const grow = boundsGrowth(r.baseBounds, r.overlayBounds);
      Object.entries(grow).forEach(([side, mm]) => {
        expect([side, mm <= 0.001]).toEqual([side, true]);
      });
    });
  });

  describe('a 3D scene document (capsule + ground + cast shadow)', () => {
    let groupId;

    beforeAll(() => {
      resetDoc();
      groupId = engine.addSceneTree();
      const group = engine.getLayerById(groupId);
      group.params.seed = 0;
      group.params.camera = {
        projection: 'orthographic', yaw: -30, pitch: 32, roll: 0,
        cameraDistance: 620, focalLength: 520, zoom: 1,
      };
      group.params.backdrop = { enabled: false };
      group.params.shadow = { ...group.params.shadow, shadowLayers: true, shadowLayerCount: 3 };
      const kids = engine.getLayerDescendants(groupId);
      const light = kids.find((l) => l.type === 'sceneLight3d');
      if (light) {
        Object.assign(light.params, {
          type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: true,
        });
      }
      const obj = kids.find((l) => l.type === 'object3d');
      if (obj) {
        obj.params.primitive = 'capsule';
        obj.params.params = { sx: 40, sy: 70, sz: 40, detail: 12 };
        obj.params.transform = { x: 0, y: 46, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      }
      engine.computeAllDisplayGeometry();
      applyVerticalSort();
      renderer.drawProgress = 1;
    });

    test('the composed scene ink lives on the GROUP and carries no draw order', () => {
      const group = engine.getLayerById(groupId);
      expect(Array.isArray(group.scenePaths)).toBe(true);
      expect(group.scenePaths.length).toBeGreaterThan(0);
      // engine.optimizeLayers filters `!layer.isGroup`, so a group never gets
      // optimizedPaths and no scene path ever carries meta.lineSortOrder.
      expect(group.optimizedPaths == null || group.optimizedPaths.length === 0).toBe(true);
      const withOrder = group.scenePaths.filter(
        (p) => p && p.meta && Number.isFinite(p.meta.lineSortOrder)
      );
      expect(withOrder.length).toBe(0);
    });

    test('the reveal still times the scene ink (playback never flashes it in whole)', () => {
      const records = renderer.buildPlotRecords();
      const group = engine.getLayerById(groupId);
      const groupRecords = records.filter((r) => r.layerId === groupId);
      // The base draw draws the group's composed paths, so the plot records —
      // which feed the playback reveal — must cover them.
      expect(groupRecords.length).toBe(group.scenePaths.length);
      groupRecords.forEach((r) => expect(r.layer).toBe(group));
    });

    test('the colour overlay claims no scene geometry (scenes have no draw order)', () => {
      const { items } = renderer.getDrawOrderPreviewItems();
      // REGRESSION GUARD: the reverted attempt put the group's composed
      // scenePaths into the preview. A group is not an optimization target, so
      // the honest preview here is empty — and, critically, no overlay item may
      // ever be attributed to a group.
      expect(items.some((it) => it.layer.isGroup)).toBe(false);
      expect(items.length).toBe(0);
    });

    test('turning the overlay on adds no ink anywhere on the canvas', () => {
      const { base, strays, straySample, withOverlay } = drawWithAndWithoutOverlay();
      expect(base.length).toBeGreaterThan(0);
      // REGRESSION GUARD: the misplaced ghost capsule + the stray diagonal
      // segments in the empty corners were exactly this — overlay ink where the
      // scene laid none.
      expect({ count: strays.length, at: straySample }).toEqual({ count: 0, at: [] });
      // The scene contributes no preview items, so the overlay is a strict
      // no-op here: the draw emits exactly the same coordinate stream.
      expect(withOverlay.length).toBe(base.length);
    });
  });
});
