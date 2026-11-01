/**
 * Hand-built documents for the ExportSvgBuilder byte-identity goldens (no trigonometric generators, so the
 * hashes hold on every architecture). Shared by tests/integration/export-svg-builder.test.js.
 *
 * `rich` exercises the paths the plain `crop` / `clip` cases do not: a mask parent with clip paths
 * (removeHiddenGeometry off), line-sort + plotter-optimize on export, a path-level pen override
 * (meta.penId) and a variable line weight (meta.weightScale).
 */
const RICH_FLAGS = {
  cropExports: false,
  removeHiddenGeometry: false,
  truncate: true,
  optimizationExport: true,
  plotterOptimize: 0.1,
};

const buildRichDoc = (window, app) => {
  const { SETTINGS } = window.Vectura;
  app.applyState(JSON.parse(JSON.stringify(app.captureState())));
  Object.assign(SETTINGS, RICH_FLAGS);
  const engine = app.engine;
  engine.layers.length = 0;
  const pens = SETTINGS.pens;
  const mask = engine.addShapeLayer('Frame', [
    [{ x: 40, y: 40 }, { x: 160, y: 40 }, { x: 160, y: 140 }, { x: 40, y: 140 }, { x: 40, y: 40 }],
  ]);
  const child = engine.addShapeLayer('Hatch', [
    [{ x: 20, y: 60 }, { x: 180, y: 70 }],
    [{ x: 20, y: 80 }, { x: 180, y: 90 }],
    [{ x: 20, y: 100 }, { x: 180, y: 110 }],
    [{ x: 20, y: 120 }, { x: 100, y: 120 }, { x: 180, y: 130 }],
  ]);
  const solo = engine.addShapeLayer('Solo', [
    [{ x: 30, y: 160 }, { x: 80, y: 180 }, { x: 130, y: 160 }],
    [{ x: 30, y: 170 }, { x: 80, y: 190 }, { x: 130, y: 170 }],
  ]);
  [mask, child, solo].forEach((id) => engine.generate(id));
  const maskLayer = engine.layers.find((l) => l.id === mask);
  const childLayer = engine.layers.find((l) => l.id === child);
  const soloLayer = engine.layers.find((l) => l.id === solo);
  maskLayer.id = 'golden-frame'; // layer ids are random uuids; the mask clip id embeds one
  maskLayer.mask.enabled = true;
  maskLayer.mask.hideLayer = false;
  childLayer.parentId = maskLayer.id;
  childLayer.penId = pens[0].id;
  soloLayer.penId = pens[0].id;
  const second = pens[1] || pens[0];
  soloLayer.paths[1].meta = { penId: second.id };
  childLayer.paths[1].meta = { weightScale: 2 };
  soloLayer.paths[0].meta = { weightScale: 0.5, penId: second.id };
  app.computeDisplayGeometry();
};

module.exports = { buildRichDoc, RICH_FLAGS };
