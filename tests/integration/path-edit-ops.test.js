/*
 * Integration coverage for window.Vectura.PathEditOps (Phase 1 Lane C):
 *
 *   PTH-1 — simplify session commits as ONE undo step; undo restores original.
 *   PTH-3 — smoothSelection round-trips through undo.
 *   PTH-4 — anchor verbs round-trip through undo.
 *   PTH-5 — live-shape auto-expand: cutting a live rect flips it to a plain
 *           path and fires 'vectura:shape-expanded' exactly once; public
 *           expandLiveShape(layerId) for Phase 2.
 *   SEL-3 — flipLayers(layerIds, axis): mirror is undoable (one step); flip
 *           twice restores within epsilon.
 *
 * Drives the engine API directly through the full-stack app (real App history,
 * real VectorEngine), the same way the Task Bar UI will call it in Phase 2.
 *
 * NOTE: src/core/path-edit-ops.js has no <script> tag yet (the phase
 * integrator adds it to index.html at merge), so this suite evals the module
 * source into the runtime window explicitly.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const MODULE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../src/core/path-edit-ops.js'),
  'utf8'
);

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

const cloneDeepPaths = (paths) =>
  (paths || []).map((p) => {
    const c = p.map((pt) => ({ x: pt.x, y: pt.y }));
    if (p.meta) c.meta = JSON.parse(JSON.stringify(p.meta));
    return c;
  });

// Dense noisy open polyline, straight-tagged (renders verbatim).
const makeNoisyPath = (n = 160) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: 10 + t * 100, y: 60 + Math.sin(t * Math.PI * 4) * 10 + ((i % 3) - 1) * 0.3 });
  }
  pts.meta = { straight: true, closed: false };
  return pts;
};

describe('PathEditOps integration (full-stack app)', () => {
  let runtime;
  let window;
  let app;
  let Ops;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.eval(MODULE_SOURCE);
    window.app = new window.Vectura.App();
    app = window.app;
    Ops = window.Vectura.PathEditOps;
    await waitForUi();
    // Fresh document: drop the default seeded layers for deterministic ids.
    app.engine.layers.slice().forEach((l) => app.engine.removeLayer(l.id));
  });

  afterEach(() => {
    Ops?.simplifyCancel?.({ app });
    runtime?.cleanup?.();
    runtime = null;
  });

  const addNoisyShapeLayer = () => {
    const id = app.engine.addShapeLayer('Noisy', [makeNoisyPath()]);
    return app.engine.layers.find((l) => l.id === id);
  };

  describe('PTH-1: simplify commit is one undo step', () => {
    test('commit + app.undo() restores the original geometry exactly', () => {
      const layer = addNoisyShapeLayer();
      const original = cloneDeepPaths(layer.sourcePaths);
      const historyBefore = app.history.length;

      Ops.simplifyBegin([layer.id], { app });
      Ops.simplifyPreview(75, { app });
      const res = Ops.simplifyCommit({ app });

      expect(res.committed).toBe(true);
      expect(app.history.length).toBe(historyBefore + 1);
      const committed = app.engine.layers.find((l) => l.id === layer.id);
      expect(committed.sourcePaths[0].length).toBeLessThan(original[0].length);

      app.undo();
      const restored = app.engine.layers.find((l) => l.id === layer.id);
      expect(cloneDeepPaths(restored.sourcePaths)).toEqual(original);
    });

    test('scrub sequence with cancel leaves document and history untouched', () => {
      const layer = addNoisyShapeLayer();
      const original = cloneDeepPaths(layer.sourcePaths);
      const historyBefore = app.history.length;

      Ops.simplifyBegin([layer.id], { app });
      [52, 100, 35, 6, 5, 63, 98, 0, 20].forEach((t) => Ops.simplifyPreview(t, { app }));
      Ops.simplifyCancel({ app });

      expect(app.history.length).toBe(historyBefore);
      const after = app.engine.layers.find((l) => l.id === layer.id);
      expect(cloneDeepPaths(after.sourcePaths)).toEqual(original);
    });
  });

  describe('PTH-3: smoothSelection is undoable', () => {
    test('smooth verb mutates geometry; one undo restores the original', () => {
      const layer = addNoisyShapeLayer();
      const original = cloneDeepPaths(layer.sourcePaths);
      const historyBefore = app.history.length;

      const res = Ops.smoothSelection([layer.id], 0.7, { app });
      expect(res.changed).toBe(true);
      expect(app.history.length).toBe(historyBefore + 1);
      const smoothed = app.engine.layers.find((l) => l.id === layer.id);
      expect(cloneDeepPaths(smoothed.sourcePaths)).not.toEqual(original);

      app.undo();
      const restored = app.engine.layers.find((l) => l.id === layer.id);
      expect(cloneDeepPaths(restored.sourcePaths)).toEqual(original);
    });
  });

  describe('PTH-4: anchor verbs round-trip through undo', () => {
    const makeSmoothClosedShapeLayer = () => {
      const anchors = [
        { x: 50, y: 0, in: { x: 30, y: 0 }, out: { x: 70, y: 0 } },
        { x: 100, y: 50, in: { x: 100, y: 30 }, out: { x: 100, y: 70 } },
        { x: 50, y: 100, in: { x: 70, y: 100 }, out: { x: 30, y: 100 } },
        { x: 0, y: 50, in: { x: 0, y: 70 }, out: { x: 0, y: 30 } },
      ];
      const pts = window.Vectura.GeometryUtils
        .buildPolylineFromAnchors(anchors, true)
        .map((p) => ({ x: p.x, y: p.y }));
      pts.meta = { kind: 'poly', closed: true, anchors };
      const id = app.engine.addShapeLayer('Blob', [pts]);
      return app.engine.layers.find((l) => l.id === id);
    };

    const roundTrip = (verb) => {
      const layer = makeSmoothClosedShapeLayer();
      const original = cloneDeepPaths(layer.sourcePaths);
      const historyBefore = app.history.length;
      const res = verb(layer);
      expect(res.changed).toBe(true);
      expect(app.history.length).toBe(historyBefore + 1);
      app.undo();
      const restored = app.engine.layers.find((l) => l.id === layer.id);
      expect(cloneDeepPaths(restored.sourcePaths)).toEqual(original);
    };

    test('convertAnchorsToCorner: one undo restores handles', () => {
      roundTrip((layer) => Ops.convertAnchorsToCorner(
        [{ layerId: layer.id, pathIndex: 0, anchorIndex: 0 }], { app }
      ));
    });

    test('convertAnchorsToSmooth: one undo restores original handles', () => {
      roundTrip((layer) => Ops.convertAnchorsToSmooth(
        [{ layerId: layer.id, pathIndex: 0, anchorIndex: 1 }], { app }
      ));
    });

    test('cutAtAnchors: one undo restores the closed path', () => {
      roundTrip((layer) => {
        const res = Ops.cutAtAnchors(
          [{ layerId: layer.id, pathIndex: 0, anchorIndex: 1 }], { app }
        );
        expect(layer.sourcePaths[0].meta.closed).toBe(false);
        return res;
      });
    });

    test('joinEndpoints: cut then join re-closes; each is its own undo step', () => {
      const layer = makeSmoothClosedShapeLayer();
      Ops.cutAtAnchors([{ layerId: layer.id, pathIndex: 0, anchorIndex: 1 }], { app });
      expect(layer.sourcePaths[0].meta.closed).toBe(false);
      const lastIdx = layer.sourcePaths[0].meta.anchors.length - 1;
      const res = Ops.joinEndpoints([
        { layerId: layer.id, pathIndex: 0, anchorIndex: 0 },
        { layerId: layer.id, pathIndex: 0, anchorIndex: lastIdx },
      ], { app });
      expect(res.changed).toBe(true);
      expect(layer.sourcePaths[0].meta.closed).toBe(true);
      app.undo(); // undo join
      const afterUndo = app.engine.layers.find((l) => l.id === layer.id);
      expect(afterUndo.sourcePaths[0].meta.closed).toBe(false);
    });
  });

  describe('PTH-5: live-shape auto-expand + shape-expanded event', () => {
    // Live rect exactly as the renderer's shape tool commits it:
    // meta = { kind: 'shape', closed, anchors, shape } (renderer.buildShapePath).
    const makeLiveRectLayer = () => {
      const shape = {
        type: 'rect', x1: 10, y1: 10, x2: 110, y2: 60, cornerRadii: [0, 0, 0, 0],
      };
      const anchors = [
        { x: 10, y: 10, in: null, out: null },
        { x: 110, y: 10, in: null, out: null },
        { x: 110, y: 60, in: null, out: null },
        { x: 10, y: 60, in: null, out: null },
      ];
      const pts = window.Vectura.GeometryUtils
        .buildPolylineFromAnchors(anchors, true)
        .map((p) => ({ x: p.x, y: p.y }));
      pts.meta = { kind: 'shape', closed: true, anchors, shape };
      const id = app.engine.addShapeLayer('Rectangle', [pts]);
      return app.engine.layers.find((l) => l.id === id);
    };

    const listenShapeExpanded = () => {
      const events = [];
      window.addEventListener('vectura:shape-expanded', (e) => events.push(e.detail));
      return events;
    };

    test('cutting a live rect flips it to a plain path and fires the event ONCE', () => {
      const layer = makeLiveRectLayer();
      expect(Ops.isLiveShapeLayer(layer)).toBe(true);
      const events = listenShapeExpanded();

      Ops.cutAtAnchors([{ layerId: layer.id, pathIndex: 0, anchorIndex: 1 }], { app });

      expect(events).toHaveLength(1);
      expect(events[0].layerId).toBe(layer.id);
      expect(events[0].source).toBe('cut');
      const after = app.engine.layers.find((l) => l.id === layer.id);
      expect(Ops.isLiveShapeLayer(after)).toBe(false);
      after.sourcePaths.forEach((p) => {
        expect(p.meta.shape).toBeUndefined();
        expect(p.meta.kind).not.toBe('shape');
      });
      expect(after.sourcePaths[0].meta.closed).toBe(false);
    });

    test('simplify commit on a live shape expands it and fires the event once', () => {
      const layer = makeLiveRectLayer();
      const events = listenShapeExpanded();
      Ops.simplifyBegin([layer.id], { app });
      Ops.simplifyPreview(60, { app });
      Ops.simplifyCommit({ app });
      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('simplify');
      const after = app.engine.layers.find((l) => l.id === layer.id);
      expect(Ops.isLiveShapeLayer(after)).toBe(false);
    });

    test('simplify cancel on a live shape does NOT expand and fires no event', () => {
      const layer = makeLiveRectLayer();
      const events = listenShapeExpanded();
      Ops.simplifyBegin([layer.id], { app });
      Ops.simplifyPreview(60, { app });
      Ops.simplifyCancel({ app });
      expect(events).toHaveLength(0);
      const after = app.engine.layers.find((l) => l.id === layer.id);
      expect(Ops.isLiveShapeLayer(after)).toBe(true);
    });

    test('public expandLiveShape: strips the descriptor, one undo step, event once', () => {
      const layer = makeLiveRectLayer();
      const events = listenShapeExpanded();
      const historyBefore = app.history.length;

      const res = Ops.expandLiveShape(layer.id, { app });
      expect(res.changed).toBe(true);
      expect(app.history.length).toBe(historyBefore + 1);
      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('api');
      expect(Ops.isLiveShapeLayer(layer)).toBe(false);
      // Outline preserved: anchors survive expansion.
      expect(layer.sourcePaths[0].meta.anchors).toHaveLength(4);
      expect(layer.sourcePaths[0].meta.closed).toBe(true);

      app.undo();
      const restored = app.engine.layers.find((l) => l.id === layer.id);
      expect(Ops.isLiveShapeLayer(restored)).toBe(true);
    });

    test('expandLiveShape on a non-live layer is a no-op with no event/history', () => {
      const layer = addNoisyShapeLayer();
      const events = listenShapeExpanded();
      const historyBefore = app.history.length;
      const res = Ops.expandLiveShape(layer.id, { app });
      expect(res.changed).toBe(false);
      expect(events).toHaveLength(0);
      expect(app.history.length).toBe(historyBefore);
    });
  });

  describe('SEL-3: flipLayers is undoable and self-inverse', () => {
    const worldXs = (layer) => layer.paths.flatMap((p) => p.map((pt) => pt.x));

    test('flip commits one undo step; undo restores the original geometry', () => {
      const layer = addNoisyShapeLayer();
      const original = cloneDeepPaths(layer.sourcePaths);
      const historyBefore = app.history.length;

      const res = Ops.flipLayers([layer.id], 'horizontal', { app });
      expect(res.changed).toBe(true);
      expect(app.history.length).toBe(historyBefore + 1);
      const flipped = app.engine.layers.find((l) => l.id === layer.id);
      expect(cloneDeepPaths(flipped.sourcePaths)).not.toEqual(original);

      app.undo();
      const restored = app.engine.layers.find((l) => l.id === layer.id);
      expect(cloneDeepPaths(restored.sourcePaths)).toEqual(original);
    });

    test('flip twice restores world geometry within epsilon', () => {
      const layer = addNoisyShapeLayer();
      const before = worldXs(layer);
      Ops.flipLayers([layer.id], 'vertical', { app });
      Ops.flipLayers([layer.id], 'vertical', { app });
      const after = worldXs(app.engine.layers.find((l) => l.id === layer.id));
      after.forEach((x, i) => expect(x).toBeCloseTo(before[i], 5));
    });
  });
});
