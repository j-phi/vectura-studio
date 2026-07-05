/*
 * TXT-1 — Outline Text visual parity baseline.
 *
 * The render BEFORE outlining (the live Text layer's engine-generated paths)
 * and AFTER (the union of the per-glyph shape layers' paths) must be
 * pixel-identical. Path order is not visually meaningful for same-pen stroke
 * rendering (and the per-glyph split necessarily regroups paths), so both
 * sides serialize through the same canonical form: per-path SVG fragments at
 * the harness's 3-decimal precision, sorted. Any geometric drift — points OR
 * native cubic anchors — changes a fragment and breaks equality.
 *
 * A committed baseline (tests/baselines/svg/text-outline-parity.svg) guards
 * the converted output against regressions; regenerate with
 * VECTURA_UPDATE_BASELINES=1 (npm run test:update).
 */
const fs = require('fs');
const path = require('path');

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { shapeToSvg } = require('../helpers/svg');

const MODULE_PATH = path.resolve(__dirname, '../../src/core/text-outline-ops.js');
const UPDATE_BASELINES = process.env.VECTURA_UPDATE_BASELINES === '1';

const canonicalSvg = ({ width, height, paths }) => {
  const body = (paths || [])
    .map((p) => shapeToSvg(p, 3))
    .filter(Boolean)
    .sort()
    .join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    body,
    '</svg>',
    '',
  ].join('\n');
};

describe('Outline Text visual parity (TXT-1)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    runtime.window.eval(fs.readFileSync(MODULE_PATH, 'utf8'));
  });

  afterAll(() => runtime.cleanup());

  const buildScene = () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      text: 'Vectura 42\nplot me',
      fitToFrame: false,
      fontSize: 30,
      jitter: 0,
      seed: 1234,
      align: 'left',
    });
    engine.generate(id);
    return { engine, id, layer };
  };

  test('render before outlining === render after outlining (pixel-identical)', () => {
    const { engine, id, layer } = buildScene();
    const { width, height } = engine.currentProfile;
    const before = canonicalSvg({ width, height, paths: layer.paths });
    expect(before.length).toBeGreaterThan(100);

    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    const children = engine.layers.filter((l) => l.parentId === result.groupId);
    const after = canonicalSvg({
      width,
      height,
      paths: children.flatMap((l) => l.paths || []),
    });

    expect(after).toBe(before);
  });

  test('matches committed baseline: text-outline-parity', () => {
    const baselineDir = path.resolve(__dirname, '../baselines/svg');
    const baselinePath = path.join(baselineDir, 'text-outline-parity.svg');

    const { engine, id } = buildScene();
    const { width, height } = engine.currentProfile;
    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    const children = engine.layers.filter((l) => l.parentId === result.groupId);
    const actual = canonicalSvg({
      width,
      height,
      paths: children.flatMap((l) => l.paths || []),
    });

    if (UPDATE_BASELINES) {
      fs.mkdirSync(baselineDir, { recursive: true });
      fs.writeFileSync(baselinePath, actual, 'utf8');
      expect(fs.existsSync(baselinePath)).toBe(true);
      return;
    }

    expect(fs.existsSync(baselinePath)).toBe(true);
    const expected = fs.readFileSync(baselinePath, 'utf8');
    expect(actual).toBe(expected);
  });
});
