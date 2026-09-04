/*
 * A 3D SCENE is a first-class plot subject — it must EXPORT, and it must have a
 * DRAW ORDER.
 *
 * Reported defect (v1.3.84): setting Line Sort to Directional / Vertical on a 3D
 * capsule did not make the drawing sweep top-to-bottom; the reveal showed the
 * whole capsule at once. Investigating that turned up a strictly worse sibling:
 * a document containing only a 3D scene exported a BLANK SVG.
 *
 * One root cause, three symptoms. A scene's composed ink lives on the scene
 * GROUP (`group.scenePaths`, never `layer.paths`), and every consumer that walks
 * layers skipped groups:
 *
 *   - `UI.getExportSnapshot` skipped `isGroup && type !== 'compound' &&
 *     !isMorphGroup`, and every scene child is `_sceneConsumed`, so a
 *     scene-only document produced ZERO export items.
 *   - `engine.optimizeLayers` hard-filtered `!layer.isGroup`, so a group never
 *     received `optimizedPaths` and no composed scene path carried
 *     `meta.lineSortOrder`. Their order was composition order.
 *   - the draw-order colour preview therefore had nothing to show, and the
 *     playback reveal played composition order instead of the configured sweep.
 *
 * This file is the regression bar for all three. Position (does the overlay ink
 * land on the drawn ink?) is pinned separately by
 * draw-order-overlay-geometry-position.test.js — order and emission live here.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// Order-comparable signature (the export clones its paths, so identity
// comparison across consumers is impossible — compare visited geometry).
const sig = (path) => {
  if (path && path.meta && path.meta.kind === 'circle') {
    return `c:${Math.round((path.meta.cx ?? 0) * 100)},${Math.round((path.meta.cy ?? 0) * 100)}`;
  }
  if (!Array.isArray(path) || !path.length) return 'empty';
  const a = path[0];
  const b = path[path.length - 1];
  return `${Math.round(a.x * 100)},${Math.round(a.y * 100)}>${Math.round(b.x * 100)},${Math.round(b.y * 100)}`;
};

describe('A 3D scene exports its ink and obeys the configured draw order', () => {
  let runtime, window, app, engine, ui, renderer, SETTINGS, PU, Renderer;
  let groupId;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    engine = app.engine;
    ui = app.ui;
    renderer = app.renderer;
    SETTINGS = window.Vectura.SETTINGS;
    PU = window.Vectura.OptimizationUtils;
    Renderer = window.Vectura.Renderer;
    // Keep export geometry byte-comparable with canvas geometry: margin cropping
    // splits paths at the frame and would break a 1:1 comparison without saying
    // anything about ORDER.
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.optimizationExport = true;

    engine.layers.slice().forEach((l) => { try { engine.removeLayer(l.id); } catch (e) { /* noop */ } });
    engine.layers.length = 0;

    // Capsule + ground + cast shadow — the exact document the defect was
    // reported on. Scene envelope on the GROUP, objects/lights/ground on the
    // CHILD layers (writing params.objects on the group appends a phantom).
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

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  // The reported setting: Line Sort method Nearest + direction Vertical.
  // ('directional' is not a method id — it is direction != none.)
  function applyVerticalSort() {
    engine.layers.forEach((l) => {
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
  }

  const previewOrder = () => renderer.getDrawOrderPreviewItems().items.map((i) => sig(i.path));

  const playbackOrder = () => {
    const records = renderer.buildPlotRecords();
    const reveal = Renderer.computePlotRevealOrder(records, {
      drawProgress: 1,
      drawSpeed: SETTINGS.speedDown,
      travelSpeed: SETTINGS.speedUp,
    });
    return Array.from(reveal.info.entries())
      .sort((a, b) => a[1].drawStart - b[1].drawStart)
      .map((entry) => sig(entry[0]));
  };

  const exportOrder = () =>
    ui.getExportSnapshot().groups.flatMap((g) => g.items).map((it) => sig(it.path));

  test('the document really is scene-only (every child is consumed)', () => {
    const group = engine.getLayerById(groupId);
    expect(group.isGroup).toBe(true);
    expect(Array.isArray(group.scenePaths)).toBe(true);
    expect(group.scenePaths.length).toBeGreaterThan(50);
    // Nothing but the group emits ink — so if the group is skipped, the document
    // exports nothing at all.
    engine.getLayerDescendants(groupId).forEach((l) => {
      expect(engine.getRenderablePaths(l, { useOptimized: true })).toEqual([]);
    });
  });

  describe('EXPORT — a scene-only document must not export a blank file', () => {
    test('the export snapshot carries the composed scene ink', () => {
      // REGRESSION: getExportSnapshot skipped every non-compound, non-morph
      // group, so exportItems was 0 and the user got a blank SVG.
      const snapshot = ui.getExportSnapshot();
      const items = snapshot.groups.flatMap((g) => g.items);
      expect(items.length).toBeGreaterThan(50);
      expect(items.every((it) => it.layer.id === groupId)).toBe(true);
    });

    test('the file the user actually downloads is not blank', () => {
      // The real exportSVG path, captured at the Blob the download is built
      // from — the snapshot above could be right while emission still dropped
      // the geometry.
      let svg = null;
      window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:stub');
      const OrigBlob = window.Blob;
      window.Blob = function (parts, opts) {
        if (opts && opts.type === 'image/svg+xml' && svg == null) svg = String(parts[0]);
        return new OrigBlob(parts, opts);
      };
      try {
        ui.exportSVG();
      } finally {
        window.Blob = OrigBlob;
      }
      expect(svg).toBeTruthy();
      expect(svg).toContain('<svg');
      // REGRESSION: this document exported a valid but EMPTY <svg> — a header,
      // a viewBox, and not one line of ink.
      const pathCount = (svg.match(/<path[\s>]/g) || []).length;
      expect(pathCount).toBeGreaterThan(50);
    });

    test('a consumed child never exports a second copy of itself', () => {
      const child = engine.getLayerDescendants(groupId).find((l) => l.type === 'object3d');
      const stale = [[{ x: 5, y: 5 }, { x: 90, y: 90 }]];
      const had = child.paths;
      child.paths = stale;
      try {
        // REGRESSION GUARD: the export walk admits leaves unconditionally, so
        // the `_sceneConsumed` check is the only thing standing between a stale
        // per-object path array and a duplicated object in the plot.
        const items = ui.getExportSnapshot().groups.flatMap((g) => g.items);
        expect(items.some((it) => it.layer.id === child.id)).toBe(false);
      } finally {
        child.paths = had;
      }
    });

    test('a hidden scene group still exports nothing', () => {
      const group = engine.getLayerById(groupId);
      group.visible = false;
      try {
        const items = ui.getExportSnapshot().groups.flatMap((g) => g.items);
        expect(items.length).toBe(0);
      } finally {
        group.visible = true;
      }
    });
  });

  describe('DRAW ORDER — the configured sort reaches the composed scene ink', () => {
    test('scene paths carry meta.lineSortOrder', () => {
      const group = engine.getLayerById(groupId);
      // REGRESSION: optimizeLayers filtered `!layer.isGroup`, so 0 of ~966
      // composed scene paths ever carried a sort order.
      expect(Array.isArray(group.optimizedPaths)).toBe(true);
      expect(group.optimizedPaths.length).toBeGreaterThan(50);
      const withOrder = group.optimizedPaths.filter(
        (p) => p && p.meta && Number.isFinite(p.meta.lineSortOrder)
      );
      expect(withOrder.length).toBe(group.optimizedPaths.length);
    });

    test('the sweep runs top → bottom', () => {
      const seq = renderer.getDrawOrderSequence();
      expect(seq.length).toBeGreaterThan(50);
      const y = (rec) => PU.pathCentroid(rec.path).y;
      expect(y(seq[0])).toBeLessThan(y(seq[seq.length - 1]));
      // Not merely "ends lower than it starts": the running maximum of the
      // inked band must advance down the page. Sample the sequence in tenths
      // and require each decile's median y to be below the previous one's.
      const medians = [];
      for (let d = 0; d < 10; d++) {
        const slice = seq.slice(
          Math.floor((d * seq.length) / 10),
          Math.floor(((d + 1) * seq.length) / 10)
        );
        if (!slice.length) continue;
        const ys = slice.map(y).sort((a, b) => a - b);
        medians.push(ys[Math.floor(ys.length / 2)]);
      }
      expect(medians.length).toBe(10);
      const descending = medians.filter((m, i) => i > 0 && m < medians[i - 1] - 1e-6);
      expect({ nonMonotonicDeciles: descending, medians: medians.map((m) => +m.toFixed(2)) })
        .toEqual({ nonMonotonicDeciles: [], medians: medians.map((m) => +m.toFixed(2)) });
    });

    test('the reveal front marches down the page as playback advances', () => {
      const records = renderer.buildPlotRecords();
      // The ink FRONT is measured by path position (centroid), not by the
      // lowest vertex of any revealed path: a single long stroke — the ground
      // quad's far edge, the cast shadow's outline — legitimately reaches the
      // bottom of the sheet while sitting high in the sort. Centroid is the
      // quantity the vertical sort actually orders by, so it is the honest
      // measure of "how far down has the pen got".
      const front = (progress) => {
        const reveal = Renderer.computePlotRevealOrder(records, {
          drawProgress: progress,
          drawSpeed: SETTINGS.speedDown,
          travelSpeed: SETTINGS.speedUp,
        });
        let maxCentroidY = -Infinity;
        let count = 0;
        records.forEach((rec) => {
          const info = reveal.info.get(rec.path);
          if (!info || reveal.threshold - info.drawStart <= 0) return;
          count += 1;
          maxCentroidY = Math.max(maxCentroidY, PU.pathCentroid(rec.path).y);
        });
        return { maxCentroidY, count };
      };
      const stops = [0.2, 0.4, 0.6, 0.8].map(front);
      // REGRESSION: with no line sort reaching the scene, the reveal was
      // IDENTICAL at 25% and 50% (the whole capsule arrived at once) and the
      // front never moved — it sat at the same y from 10% to 30%, then the
      // ground and shadow landed together.
      const stuck = stops
        .map((s, i) => (i > 0 && s.maxCentroidY <= stops[i - 1].maxCentroidY ? i : -1))
        .filter((i) => i >= 0);
      expect({ stuckAt: stuck, front: stops.map((s) => +s.maxCentroidY.toFixed(1)) })
        .toEqual({ stuckAt: [], front: stops.map((s) => +s.maxCentroidY.toFixed(1)) });
      // …and the reveal is genuinely progressive, not an all-at-once flash.
      stops.forEach((s, i) => { if (i > 0) expect(s.count).toBeGreaterThan(stops[i - 1].count); });
    });

    test('preview, playback and export describe the SAME order', () => {
      const preview = previewOrder();
      expect(preview.length).toBeGreaterThan(50);
      expect(playbackOrder()).toEqual(preview);
      expect(exportOrder()).toEqual(preview);
    });
  });
});
