/**
 * Whole-preset corpus canary (R-34): shared driver.
 *
 * Every entry of window.Vectura.PRESETS (bundled from user-presets/**) goes
 * through the same steps a user takes, on the full app in jsdom:
 *
 *   1. add a layer of the preset's type      engine.addLayer (factory default)
 *   2. pick the preset                       ui._applyActivePreset (gallery / ctxbar path)
 *   3. export SVG                            ui.exportSVG (captured at Download.saveBlob)
 *   4. save the project                      ui.saveVecturaFile
 *   5. open the saved file                   ui._readVecturaFile (FileReader + applyState)
 *   6. export SVG again                      must equal step 3
 *
 * The geometry summary (path count, point count, bbox, hash of 3-decimal
 * coordinates) is taken from the export snapshot that exportSVG itself used,
 * so it describes exactly the emitted document.
 *
 * Text and 3D Scene presets have NO UI apply path: their layers use bespoke
 * panels that return before the algo-config panel stashes the preset applier
 * (see NO_UI_APPLY_PATH). For those types the preset's params are written into
 * a saved project and opened through the same file-open path, which is how a
 * saved scene reaches the engine.
 */
const { loadVecturaRuntime } = require('./load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// Layer types whose presets cannot be applied from the UI today (the
// algo-config panel returns early for their bespoke panels, so
// ui._applyActivePreset is never stashed for them). Reported as a finding;
// the canary still loads their params through the file-open path.
// Tracked as PRH-031 (stale ctxbar applier, possible data loss).
const NO_UI_APPLY_PATH = new Set(['text', 'scene3d']);

// Layer types that legitimately draw nothing from a preset alone.
//   svgDistort: distorts an imported SVG; a preset carries only fill/noise
//               settings, never the import, so the layer is empty until the
//               user imports a file.
//   sceneLight3d / sceneGround3d: a light or a ground plane is not ink; it only
//               changes how a scene's objects render.
//   booleanGroup3d: a fresh boolean group has no operand objects yet.
const EMPTY_BY_DESIGN = new Set(['svgDistort', 'sceneLight3d', 'sceneGround3d', 'booleanGroup3d']);

// Known defects this canary found. Each entry inverts ONE assertion for ONE
// preset: the test asserts the defect is still there, so a fix fails the test
// until the entry is removed. Do not add entries to make a new failure pass.
// Tracking: phylla emptyExport = PRH-029, rainfall roundTrip = PRH-030
// (docs/pre-release-hardening-log.md, plans.md Next -> Canary findings).
//   roundTrip:   export after save + reopen differs from the export before save.
//   emptyExport: the layer has geometry but the exported SVG has no paths.
const RAINFALL_NOISE_INJECTION = 'Opening the Rainfall panel (buildControls) seeds a default '
  + 'amplitude-9 noise into an empty params.noises without regenerating, so the canvas and '
  + 'export no longer match the params; save + reopen regenerates with the injected noise.';
const PHYLLA_CIRCLE_EXPORT = 'Phylla circle dots are meta-only circle paths (no points); with the '
  + 'default export settings (hard crop / hidden-geometry removal) the export drops every one, so '
  + 'the SVG is empty although the canvas shows the dots. Polygon-dot presets export fine.';
const KNOWN_DEFECTS = Object.freeze({
  'phylla-sunflower': { emptyExport: PHYLLA_CIRCLE_EXPORT },
  'phylla-dense-field': { emptyExport: PHYLLA_CIRCLE_EXPORT },
  'phylla-pinecone': { emptyExport: PHYLLA_CIRCLE_EXPORT },
  'rainfall-default': { roundTrip: RAINFALL_NOISE_INJECTION },
  'rainfall-downpour': { roundTrip: RAINFALL_NOISE_INJECTION },
  'rainfall-drizzle': { roundTrip: RAINFALL_NOISE_INJECTION },
  'rainfall-summer-rain': { roundTrip: RAINFALL_NOISE_INJECTION },
  'rainfall-windswept': { roundTrip: RAINFALL_NOISE_INJECTION },
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const fnv = (hash, text) => {
  let h = hash;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

const summarizeSnapshot = (snapshot) => {
  let paths = 0;
  let points = 0;
  let nonFinite = 0;
  let zeroLength = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hash = 2166136261;
  const visit = (x, y) => {
    points += 1;
    if (!Number.isFinite(x) || !Number.isFinite(y)) { nonFinite += 1; return; }
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  (snapshot.groups || []).forEach((group) => (group.items || []).forEach((item) => {
    const path = item.path;
    paths += 1;
    const meta = path && path.meta;
    if (meta && meta.kind === 'circle') {
      const cx = Number(meta.cx ?? meta.x);
      const cy = Number(meta.cy ?? meta.y);
      const rx = Number(meta.rx ?? meta.r);
      const ry = Number(meta.ry ?? meta.r ?? rx);
      if (!(rx > 0) && !(ry > 0)) zeroLength += 1;
      visit(cx - rx, cy - ry);
      visit(cx + rx, cy + ry);
      hash = fnv(hash, `c${cx.toFixed(3)},${cy.toFixed(3)},${rx.toFixed(3)},${ry.toFixed(3)};`);
      return;
    }
    const list = Array.isArray(path) ? path : [];
    let length = 0;
    for (let i = 0; i < list.length; i += 1) {
      const pt = list[i];
      visit(pt.x, pt.y);
      if (i > 0) length += Math.hypot(pt.x - list[i - 1].x, pt.y - list[i - 1].y);
    }
    if (list.length < 2 || !(length > 1e-9)) zeroLength += 1;
    hash = fnv(hash, `${list.map((pt) => `${Number(pt.x).toFixed(3)},${Number(pt.y).toFixed(3)}`).join(' ')};`);
  }));
  const round = (v) => (Number.isFinite(v) ? Number(v.toFixed(3)) : null);
  return {
    paths,
    points,
    nonFinite,
    zeroLength,
    bbox: paths ? [round(minX), round(minY), round(maxX), round(maxY)] : null,
    hash: hash.toString(16).padStart(8, '0'),
  };
};

const bootPresetCorpusApp = async () => {
  const runtime = await loadVecturaRuntime(FULL_STACK);
  const { window } = runtime;
  window.app = new window.Vectura.App();
  const app = window.app;

  // The download sink is the only stub: everything up to the Blob is real.
  let lastBlob = null;
  window.Vectura.Download.saveBlob = (blob) => {
    lastBlob = blob;
    return Promise.resolve('downloaded');
  };
  const readBlob = (blob) => new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

  // Keep the snapshot exportSVG used, so the summary describes the emitted SVG.
  const proto = window.Vectura.UI.prototype;
  const originalSnapshot = proto.getExportSnapshot;
  let lastSnapshot = null;
  app.ui.getExportSnapshot = function getExportSnapshot(...args) {
    lastSnapshot = originalSnapshot.apply(this, args);
    return lastSnapshot;
  };

  const errors = [];
  const originalError = window.console.error;
  window.console.error = (...args) => {
    errors.push(args.map((a) => (a && a.stack) || String(a)).join(' '));
  };

  const emptyState = clone(app.captureState());
  const bootImages = { ...(window.Vectura.NOISE_IMAGES || {}) };

  const reset = () => {
    window.Vectura.NOISE_IMAGES = { ...bootImages };
    app.applyState(clone(emptyState));
    errors.length = 0;
  };

  const exportSvg = async () => {
    lastBlob = null;
    lastSnapshot = null;
    app.ui.exportSVG();
    if (!lastBlob) throw new Error('exportSVG produced no blob (see console errors)');
    return { svg: await readBlob(lastBlob), summary: summarizeSnapshot(lastSnapshot) };
  };

  const saveProject = async () => {
    lastBlob = null;
    app.ui.saveVecturaFile();
    if (!lastBlob) throw new Error('saveVecturaFile produced no blob (see console errors)');
    return readBlob(lastBlob);
  };

  // The real open path: _readVecturaFile (FileReader → JSON → applyState, with
  // rollback + console.error on failure). Resolves after its onload ran.
  const openProject = (text) => new Promise((resolve, reject) => {
    const RealReader = window.FileReader;
    window.FileReader = class TrackedReader extends RealReader {
      constructor() {
        super();
        let handler = null;
        Object.defineProperty(this, 'onload', {
          configurable: true,
          get: () => handler,
          set: (fn) => {
            handler = fn;
            super.onload = (event) => {
              window.FileReader = RealReader;
              try { fn.call(this, event); resolve(); } catch (err) { reject(err); }
            };
          },
        });
      }
    };
    try {
      app.ui._readVecturaFile(new window.File([text], 'corpus.vectura', { type: 'application/json' }));
    } catch (err) {
      window.FileReader = RealReader;
      reject(err);
    }
  });

  const cleanup = () => {
    window.console.error = originalError;
    runtime.cleanup();
  };

  return { runtime, window, app, reset, exportSvg, saveProject, openProject, errors, cleanup };
};

// Put `params` on the only layer of a saved project and reopen it (the path a
// saved document takes; used for types with no UI apply path).
// A 3D Scene preset is a saved MONOLITH scene (inline objects/lights/ground):
// it goes in as one non-group scene3d layer of a format-1 document, so the
// file-open path runs the monolith → scene-tree migration on it, as it does
// for a scene saved before the tree existed.
const openWithParams = async (ctx, layerId, params, { monolith = false } = {}) => {
  const doc = JSON.parse(await ctx.saveProject());
  const engine = doc.state.engine;
  const layer = engine.layers.find((l) => l.id === layerId);
  layer.params = { ...layer.params, ...clone(params) };
  if (monolith) {
    layer.isGroup = false;
    layer.containerRole = null;
    layer.groupType = null;
    engine.layers = [layer];
    engine.activeLayerId = layer.id;
    engine.formatVersion = 1;
  }
  await ctx.openProject(JSON.stringify(doc));
};

const topLayerOf = (app, type) => app.engine.layers.find((l) => l.type === type && !l.parentId) || null;

/**
 * Run one preset through the pipeline. Presets of one system run in sequence
 * on the SAME layer, the way a user clicks through the gallery: the first
 * preset of a system starts from a fresh document + engine.addLayer, every
 * later one is applied to the layer the previous save + reopen left behind.
 * A failed case drops that chain, so the next case starts fresh.
 */
const runPresetCase = async (ctx, preset, { roundTrip = true } = {}) => {
  const { app, window } = ctx;
  const type = preset.preset_system;
  const chained = ctx.chainType === type && topLayerOf(app, type);
  ctx.chainType = null;
  if (!chained) {
    ctx.reset();
    app.engine.addLayer(type);
  }
  ctx.errors.length = 0;
  let layer = topLayerOf(app, type);
  app.engine.activeLayerId = layer.id;
  let applyPath = 'ui';
  if (NO_UI_APPLY_PATH.has(type)) {
    applyPath = 'file';
    // An empty-params marker (scene3d-default, text-default) is what addLayer
    // already built; there is nothing to write into the document.
    const params = preset.params || {};
    if (Object.keys(params).length) await openWithParams(ctx, layer.id, { ...params, preset: preset.id }, { monolith: type === 'scene3d' });
    else layer.params.preset = preset.id;
  } else {
    if (!chained) app.ui.buildControls();
    if (typeof app.ui._applyActivePreset !== 'function') throw new Error(`no preset applier for ${type}`);
    app.ui._applyActivePreset(preset.id);
  }
  layer = topLayerOf(app, type);
  const presetMarker = layer && layer.params ? layer.params.preset : undefined;
  const layerPathCount = layer && Array.isArray(layer.paths) ? layer.paths.length : 0;
  const first = await ctx.exportSvg();
  let second = null;
  if (roundTrip) {
    const saved = await ctx.saveProject();
    await ctx.openProject(saved);
    second = await ctx.exportSvg();
  }
  const prof = app.engine.currentProfile;
  const doc = new window.DOMParser().parseFromString(first.svg, 'image/svg+xml');
  ctx.chainType = type;
  return {
    type,
    applyPath,
    presetMarker,
    layerPathCount,
    first,
    second,
    profile: { width: prof.width, height: prof.height },
    parseErrors: doc.getElementsByTagName('parsererror').length,
    svgRoot: doc.documentElement ? doc.documentElement.nodeName : null,
    errors: ctx.errors.slice(),
  };
};

// Document bounds tolerance (mm) for exported coordinates.
const BOUNDS_MARGIN_MM = 0.5;

/**
 * Define the corpus suite for the presets whose preset_system is in `systems`.
 * Call from a test file; every file covers a disjoint set of systems and
 * preset-corpus-coverage.test.js checks that together they cover them all.
 */
const definePresetCorpusSuite = (label, systems) => {
  describe(`preset corpus canary: ${label}`, () => {
    let ctx;
    beforeAll(async () => { ctx = await bootPresetCorpusApp(); }, 60000);
    afterAll(() => { ctx?.cleanup(); });

    const allPresets = () => ctx.window.Vectura.PRESETS.filter((p) => systems.includes(p.preset_system));

    test('covers at least one preset per listed system', () => {
      const seen = new Set(allPresets().map((p) => p.preset_system));
      expect([...seen].sort()).toEqual([...systems].sort());
    });

    // test.each needs the ids up front; read them from the committed bundle
    // through a tiny sandbox (same data the app loads).
    const ids = presetIdsFor(systems);
    // Save + reopen runs on the first preset of every system (the factory
    // default every new layer gets) and on the KNOWN_DEFECTS round-trip
    // entries. Preset params are JSON already, so the per-preset risk left is
    // value-dependent import sanitizing; PRESET_CORPUS_RT=all runs the full
    // sweep (about 1.6x the time) when touching engine import/export.
    const ROUND_TRIP_IDS = roundTripIdsFor(systems);
    const firstHash = {};
    test.each(ids)('%s: applies, exports finite in-bounds SVG, survives save + reopen', async (id) => {
      const preset = ctx.window.Vectura.PRESETS.find((p) => p.id === id);
      expect(preset, `${id} missing from window.Vectura.PRESETS`).toBeTruthy();
      const roundTrip = process.env.PRESET_CORPUS_RT === 'all' || ROUND_TRIP_IDS.has(id) || Boolean(KNOWN_DEFECTS[id]?.roundTrip);
      const result = await runPresetCase(ctx, preset, { roundTrip });
      const known = KNOWN_DEFECTS[id] || {};

      expect(result.errors, `${id}: console.error during the pipeline`).toEqual([]);
      expect(result.presetMarker, `${id}: preset did not land on the layer`).toBe(id);

      const { summary, svg } = result.first;
      expect(result.parseErrors, `${id}: exported SVG does not parse`).toBe(0);
      expect(result.svgRoot).toBe('svg');
      expect(/NaN|Infinity/.test(svg), `${id}: NaN/Infinity in exported SVG`).toBe(false);
      expect(summary.nonFinite, `${id}: non-finite coordinates`).toBe(0);
      if (known.emptyExport) {
        // Tracked defect (see KNOWN_DEFECTS). Fails once it is fixed.
        expect(result.layerPathCount, `${id}: layer should still have geometry`).toBeGreaterThan(0);
        expect(summary.paths, `${id}: KNOWN DEFECT fixed? remove it from KNOWN_DEFECTS`).toBe(0);
      } else if (EMPTY_BY_DESIGN.has(result.type)) {
        expect(summary.paths, `${id}: ${result.type} is declared empty by design`).toBe(0);
      } else {
        expect(summary.paths, `${id}: no exported paths`).toBeGreaterThan(0);
        expect(summary.zeroLength, `${id}: zero-length exported paths`).toBe(0);
        const [minX, minY, maxX, maxY] = summary.bbox;
        const { width, height } = result.profile;
        expect(minX, `${id}: geometry left of the document`).toBeGreaterThanOrEqual(-BOUNDS_MARGIN_MM);
        expect(minY, `${id}: geometry above the document`).toBeGreaterThanOrEqual(-BOUNDS_MARGIN_MM);
        expect(maxX, `${id}: geometry right of the document`).toBeLessThanOrEqual(width + BOUNDS_MARGIN_MM);
        expect(maxY, `${id}: geometry below the document`).toBeLessThanOrEqual(height + BOUNDS_MARGIN_MM);
      }

      // A preset with params must change the drawing: catches an apply path
      // that sets the marker but keeps the previous (default) params.
      if (ROUND_TRIP_IDS.has(id)) firstHash[result.type] = summary.hash;
      else if (preset.params && Object.keys(preset.params).length && firstHash[result.type] && !EMPTY_BY_DESIGN.has(result.type) && !known.emptyExport) {
        expect(summary.hash, `${id}: export identical to ${result.type}'s first preset; the preset changed nothing`).not.toBe(firstHash[result.type]);
      }

      if (!roundTrip) return;
      if (known.roundTrip) {
        // Tracked defect (see KNOWN_DEFECTS). Fails once it is fixed.
        expect(result.second.svg === svg, `${id}: KNOWN DEFECT fixed? remove it from KNOWN_DEFECTS`).toBe(false);
      } else {
        expect(result.second.summary, `${id}: geometry changed after save + reopen`).toEqual(summary);
        expect(result.second.svg === svg, `${id}: exported SVG changed after save + reopen`).toBe(true);
      }
    });
  });
};

const roundTripIdsFor = (systems) => {
  const seen = new Set();
  const ids = new Set();
  bundledPresets().forEach((p) => {
    if (!systems.includes(p.preset_system) || seen.has(p.preset_system)) return;
    seen.add(p.preset_system);
    ids.add(p.id);
  });
  return ids;
};

const presetIdsFor = (systems) => bundledPresets().filter((p) => systems.includes(p.preset_system)).map((p) => p.id);

let bundleCache = null;
const bundledPresets = () => {
  if (bundleCache) return bundleCache;
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const file = path.resolve(__dirname, '../../src/config/user-presets.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  bundleCache = sandbox.window.Vectura.PRESETS;
  return bundleCache;
};

module.exports = {
  definePresetCorpusSuite,
  presetIdsFor,
  bootPresetCorpusApp,
  runPresetCase,
  summarizeSnapshot,
  NO_UI_APPLY_PATH,
  EMPTY_BY_DESIGN,
  KNOWN_DEFECTS,
};
