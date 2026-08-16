/*
 * Draw Order contract — the colour PREVIEW, the playback REVEAL and the SVG
 * EXPORT must all describe the SAME plot order.
 *
 * Reported defect (v1.3.83): "When I switch draw order to directional and
 * vertical, the colour mapping is correct, but the actual drawing direction on
 * playback is unchanged. It starts at the bottom of the shape instead of the
 * top."
 *
 * Root cause: three independent implementations of "plot order".
 *   - the canvas Draw Order overlay coloured layer.optimizedPaths sorted
 *     GLOBALLY by meta.lineSortOrder — no pen grouping at all;
 *   - the playback reveal (Renderer.computePlotRevealOrder) and
 *   - UI.getExportSnapshot
 *   both group by pen FIRST and only interleave by lineSortOrder inside a pen
 *   group. Export is authoritative (a plotter must finish a pen before it is
 *   swapped), so the preview was the liar: as soon as a document had more than
 *   one effective pen — two pens, a differently-penned fill, auto-colorize, or
 *   stroke divisions — the gradient promised a top-to-bottom sweep the pen
 *   would never make.
 *
 * The overlay also sourced its paths from layer.optimizedPaths while the reveal
 * keys its time map off engine.getRenderablePaths. With stroke divisions on
 * those are different objects, so every overlay path missed the reveal map and
 * the colour preview stopped revealing in lock-step entirely.
 *
 * Fix: one Renderer.buildPlotSequence + one Renderer.buildPlotRecords, consumed
 * by the preview, the reveal and (by construction, same rule) the export.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// Order-comparable signature for a path. The SVG export CLONES its paths, so
// identity comparison is impossible across the three consumers — compare the
// geometry the pen actually visits instead.
const sig = (path) => {
  if (path && path.meta && path.meta.kind === 'circle') {
    return `c:${Math.round((path.meta.cx ?? 0) * 100)},${Math.round((path.meta.cy ?? 0) * 100)}`;
  }
  if (!Array.isArray(path) || !path.length) return 'empty';
  const a = path[0];
  const b = path[path.length - 1];
  return `${Math.round(a.x * 100)},${Math.round(a.y * 100)}>${Math.round(b.x * 100)},${Math.round(b.y * 100)}`;
};

describe('Draw Order: preview / playback / export describe one plot order', () => {
  let runtime, window, app, engine, ui, renderer, SETTINGS, PU, Renderer;

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
    // Keep the export geometry byte-comparable with the canvas geometry: margin
    // cropping splits paths at the frame and would break the 1:1 comparison
    // without telling us anything about ORDER.
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.optimizationExport = true;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const resetDoc = () => {
    engine.layers.slice().forEach((l) => engine.removeLayer(l.id));
  };

  // Directional / vertical line sort, exactly as the Line Sort tab writes it.
  const applyVerticalSort = (method = 'nearest', grouping = 'combined') => {
    engine.layers.forEach((l) => {
      if (l.isGroup) return;
      const opt = engine.ensureLayerOptimization(l);
      const step = opt.steps.find((s) => s.id === 'linesort');
      step.enabled = true;
      step.bypass = false;
      step.method = method;
      step.direction = 'vertical';
      step.grouping = grouping;
    });
    engine.optimizeLayers(engine.layers, { includePlotterOptimize: true });
  };

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

  describe('single layer, one pen (the case that always worked)', () => {
    beforeAll(() => {
      resetDoc();
      const id = engine.addLayer('wavetable');
      engine.generate(id);
      engine.computeAllDisplayGeometry();
      applyVerticalSort();
    });

    test('all three agree, and the sweep runs top → bottom', () => {
      const preview = previewOrder();
      expect(preview.length).toBeGreaterThan(10);
      expect(playbackOrder()).toEqual(preview);
      expect(exportOrder()).toEqual(preview);

      const seq = renderer.getDrawOrderSequence();
      const y = (rec) => PU.pathCentroid(rec.path).y;
      expect(y(seq[0])).toBeLessThan(y(seq[seq.length - 1]));
    });
  });

  describe('two pens (the reported defect)', () => {
    beforeAll(() => {
      resetDoc();
      const a = engine.addLayer('wavetable');
      engine.generate(a);
      const b = engine.addLayer('rings');
      engine.generate(b);
      engine.getLayerById(a).penId = SETTINGS.pens[0].id;
      engine.getLayerById(b).penId = SETTINGS.pens[1].id;
      engine.computeAllDisplayGeometry();
      applyVerticalSort();
    });

    test('the preview colours the order the pen will really follow', () => {
      // REGRESSION: the overlay used to sort every optimized path globally by
      // meta.lineSortOrder, interleaving the two pens — an order no plotter can
      // execute, and one neither playback nor export ever produced.
      const preview = previewOrder();
      expect(preview.length).toBeGreaterThan(10);
      expect(playbackOrder()).toEqual(preview);
      expect(exportOrder()).toEqual(preview);
    });

    test('pen grouping stays the outer key; the vertical sort runs inside it', () => {
      const seq = renderer.getDrawOrderSequence();
      const penRuns = [];
      seq.forEach((rec) => {
        if (!penRuns.length || penRuns[penRuns.length - 1].pen !== rec.penKey) {
          penRuns.push({ pen: rec.penKey, recs: [rec] });
        } else {
          penRuns[penRuns.length - 1].recs.push(rec);
        }
      });
      // One contiguous run per pen — never an interleave across pens.
      expect(penRuns.length).toBe(new Set(penRuns.map((r) => r.pen)).size);
      expect(penRuns.length).toBeGreaterThan(1);
      // …and inside each run the pen still travels top → bottom.
      penRuns.forEach((run) => {
        const first = PU.pathCentroid(run.recs[0].path).y;
        const last = PU.pathCentroid(run.recs[run.recs.length - 1].path).y;
        expect(first).toBeLessThan(last);
      });
    });
  });

  describe('stroke divisions on (preview must stay in lock-step with playback)', () => {
    beforeAll(() => {
      resetDoc();
      const id = engine.addLayer('wavetable');
      engine.generate(id);
      const layer = engine.getLayerById(id);
      const divisions = engine.ensureLayerDivisions(layer);
      divisions.enabled = true;
      engine.computeAllDisplayGeometry();
      applyVerticalSort();
    });

    test('every previewed path is in the reveal time map', () => {
      const layer = engine.layers.find((l) => !l.isGroup);
      expect(layer.dividedPaths.length).toBeGreaterThan(layer.optimizedPaths.length);

      const records = renderer.buildPlotRecords();
      const reveal = Renderer.computePlotRevealOrder(records, {
        drawProgress: 0.15,
        drawSpeed: SETTINGS.speedDown,
        travelSpeed: SETTINGS.speedUp,
      });
      const items = renderer.getDrawOrderPreviewItems().items;
      expect(items.length).toBeGreaterThan(0);
      // REGRESSION: the overlay previewed layer.optimizedPaths while the reveal
      // timed layer.dividedPaths, so NONE of the previewed paths were in the
      // map — applyReveal fell through to "draw it anyway" and the whole
      // gradient stayed on screen at every progress value.
      const mapped = items.filter((it) => reveal.info.has(it.path)).length;
      expect(mapped).toBe(items.length);
    });

    test('preview, playback and export still agree', () => {
      const preview = previewOrder();
      expect(playbackOrder()).toEqual(preview);
      expect(exportOrder()).toEqual(preview);
    });
  });
});
