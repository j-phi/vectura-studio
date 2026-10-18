/**
 * Legacy saved-file corpus (R-35).
 *
 * tests/fixtures/legacy-vectura/ holds real .vectura projects written by old
 * releases (0.5.x .. 1.4.0; see the README there for which build wrote each
 * file and how). Each one opens through the real file-open path
 * (ui._readVecturaFile: FileReader → JSON → app.applyState → engine.importState
 * with its migrations), and must:
 *   - open without a console error and without the open path's rollback,
 *   - come out at the current format version, with its layer types intact
 *     (or migrated as listed in EXPECTED_TYPES),
 *   - draw non-empty, finite geometry on every ink layer,
 *   - export a parseable SVG with no NaN/Infinity,
 *   - match its committed geometry summary (tests/baselines/golden-values/
 *     legacy-vectura-corpus.json, per architecture; regenerate on purpose with
 *     npm run test:update and scripts/test-update-goldens-x64.sh).
 */
const fs = require('fs');
const path = require('path');
const { bootPresetCorpusApp, summarizeSnapshot } = require('../helpers/preset-corpus');
const { goldenValues } = require('../helpers/golden-values');

const DIR = path.resolve(__dirname, '../fixtures/legacy-vectura');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.vectura')).sort();

// Top-level layer types after opening. A legacy type that the current build
// migrates or replaces is spelled out here, so a change is a visible decision.
const EXPECTED_TYPES = {
  '0.5.42-harmonograph.vectura': ['harmonograph'],
  '0.5.47-petalis.vectura': ['petalis'],
  '0.5.55-rings.vectura': ['rings'],
  '0.8.0-mixed.vectura': ['wavetable', 'rings', 'spiral', 'group'],
  '0.8.0-organic.vectura': ['petalisDesigner', 'flowfield', 'phylla'],
  '1.0.0-mixed.vectura': ['wavetable', 'rings', 'spiral', 'group'],
  '1.0.0-organic.vectura': ['petalisDesigner', 'flowfield', 'phylla'],
  '1.1.61-shapepack.vectura': ['shapePack'],
  '1.2.0-curves.vectura': ['wavetable', 'harmonograph', 'shapePack'],
  '1.3.0-text.vectura': ['text', 'harmonograph', 'shapePack'],
  // A pre-tree MONOLITH scene: the open path expands it into a scene group.
  '1.3.35-scene-monolith.vectura': ['scene3d', 'lissajous'],
  '1.4.0-mixed.vectura': ['wavetable', 'rings', 'spiral', 'group'],
  '1.4.0-scene.vectura': ['scene3d', 'lissajous'],
};

// Known defects found by this corpus. The assertion is inverted so a fix
// fails the test until the entry is removed. Do not add entries to pass.
const KNOWN_EMPTY = {
  // Pre-0.6 files name the flower layer type 'petalis'. The type was renamed
  // petalisDesigner and nothing maps the old name, so the layer opens empty.
  '0.5.47-petalis.vectura/0:petalis': 'legacy petalis layer type has no algorithm (no alias to petalisDesigner)',
};

// Scene groups that must carry object children after opening.
const SCENE_TREES = new Set(['1.3.35-scene-monolith.vectura', '1.4.0-scene.vectura']);

const layerInkSummary = (window, layer) => {
  const ink = window.Vectura.LayerInk.groupInkPaths(layer) || layer.paths || [];
  return summarizeSnapshot({ groups: [{ items: ink.map((p) => ({ path: p })) }] });
};

describe('legacy .vectura corpus', () => {
  let ctx;
  const golden = goldenValues('legacy-vectura-corpus');

  beforeAll(async () => { ctx = await bootPresetCorpusApp(); }, 60000);
  afterAll(() => { ctx?.cleanup(); });

  test('the corpus and the expectation table list the same files', () => {
    expect(FILES).toEqual(Object.keys(EXPECTED_TYPES).sort());
  });

  test.each(FILES)('%s opens, migrates, draws and matches its golden summary', async (file) => {
    const { app, window } = ctx;
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    ctx.reset();
    await ctx.openProject(text);
    expect(ctx.errors, `${file}: console.error while opening`).toEqual([]);

    const engine = app.engine;
    expect(app.captureState().engine.formatVersion).toBe(window.Vectura.VECTURA_FORMAT_VERSION);
    const top = engine.layers.filter((l) => !l.parentId);
    expect(top.map((l) => l.type), `${file}: top-level layer types`).toEqual(EXPECTED_TYPES[file]);

    if (SCENE_TREES.has(file)) {
      const scene = top.find((l) => l.type === 'scene3d');
      expect(scene.isGroup, `${file}: scene is not a scene group`).toBe(true);
      expect(engine.layers.some((l) => l.parentId === scene.id && l.type === 'object3d'),
        `${file}: scene group has no object3d child`).toBe(true);
    }

    const { LayerInk } = window.Vectura;
    const inkLayers = engine.layers.filter((l) => l.visible !== false && LayerInk.layerOwnsInk(l)
      && !l._sceneConsumed && !(engine.layers.find((p) => p.id === l.parentId)?.type === 'scene3d'));
    expect(inkLayers.length).toBeGreaterThan(0);
    inkLayers.forEach((layer, index) => {
      const summary = layerInkSummary(window, layer);
      const key = `${file}/${index}:${layer.type}`;
      if (KNOWN_EMPTY[key]) {
        expect(summary.paths, `${key}: KNOWN DEFECT fixed? remove it from KNOWN_EMPTY (${KNOWN_EMPTY[key]})`).toBe(0);
        return;
      }
      expect(summary.paths, `${key}: no geometry`).toBeGreaterThan(0);
      expect(summary.nonFinite, `${key}: non-finite coordinates`).toBe(0);
      golden.expect(key, summary);
    });

    const { svg } = await ctx.exportSvg();
    const doc = new window.DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror').length, `${file}: export does not parse`).toBe(0);
    expect(/NaN|Infinity/.test(svg), `${file}: NaN/Infinity in export`).toBe(false);
    expect(ctx.errors, `${file}: console.error while exporting`).toEqual([]);
  });
});
