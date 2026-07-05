/*
 * STR-5 — Weight quick-edit contract.
 *
 * A single Vectura.StrokeModel.setStrokeWeight(layer, value) API used by both
 * the Stroke Options panel and (Phase 2) the Task Bar weight slider, so the
 * two surfaces can never disagree. It writes ONLY layer.strokeWidth — never
 * layer.penId nor the pen record's width in SETTINGS.pens — so a layer's own
 * stroke weight can diverge from its assigned pen (distinct from the Pens
 * panel's width slider, which cascades to every layer on the pen).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');

const loadStrokeModel = () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of ['src/config/stroke-options.js', 'src/core/stroke-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context, { filename: rel });
  }
  return dom.window.Vectura;
};

describe('STR-5 setStrokeWeight API', () => {
  let Vectura;

  beforeAll(() => {
    Vectura = loadStrokeModel();
  });

  const makeLayer = () => ({
    id: 'l1',
    penId: 'pen-1',
    color: '#ffffff',
    strokeWidth: 0.3,
    lineCap: 'round',
  });

  test('writes only layer.strokeWidth', () => {
    const layer = makeLayer();
    const before = { ...layer };
    Vectura.StrokeModel.setStrokeWeight(layer, 1.25);
    expect(layer.strokeWidth).toBe(1.25);
    expect(layer.penId).toBe(before.penId);
    expect(layer.color).toBe(before.color);
    expect(layer.lineCap).toBe(before.lineCap);
  });

  test('never mutates penId or the pen record width', () => {
    const pens = [{ id: 'pen-1', name: 'A', color: '#111', width: 0.5 }];
    const layerA = { id: 'a', penId: 'pen-1', strokeWidth: 0.5 };
    const layerB = { id: 'b', penId: 'pen-1', strokeWidth: 0.5 };

    Vectura.StrokeModel.setStrokeWeight(layerA, 2.0, { pens });

    expect(layerA.strokeWidth).toBe(2.0);
    expect(layerA.penId).toBe('pen-1');
    // The pen record is untouched...
    expect(pens[0].width).toBe(0.5);
    // ...and a sibling layer on the same pen is NOT cascaded.
    expect(layerB.strokeWidth).toBe(0.5);
  });

  test('clamps to the configured min/max and rejects non-finite input', () => {
    const S = Vectura.STROKE_STYLE;
    const layer = makeLayer();
    Vectura.StrokeModel.setStrokeWeight(layer, -5);
    expect(layer.strokeWidth).toBe(S.WEIGHT_MIN_MM);
    Vectura.StrokeModel.setStrokeWeight(layer, 9999);
    expect(layer.strokeWidth).toBe(S.WEIGHT_MAX_MM);
    const prev = layer.strokeWidth;
    Vectura.StrokeModel.setStrokeWeight(layer, NaN);
    expect(layer.strokeWidth).toBe(prev); // unchanged on garbage
    Vectura.StrokeModel.setStrokeWeight(layer, 'nope');
    expect(layer.strokeWidth).toBe(prev);
  });

  test('returns the committed (clamped) value', () => {
    const layer = makeLayer();
    expect(Vectura.StrokeModel.setStrokeWeight(layer, 0.42)).toBe(0.42);
    expect(Vectura.StrokeModel.setStrokeWeight(layer, -1)).toBe(Vectura.STROKE_STYLE.WEIGHT_MIN_MM);
  });

  test('no-ops safely on a null layer', () => {
    expect(() => Vectura.StrokeModel.setStrokeWeight(null, 1)).not.toThrow();
    expect(Vectura.StrokeModel.setStrokeWeight(null, 1)).toBeNull();
  });

  test('a gesture pushes exactly one history step (at begin, before mutation)', () => {
    const layer = makeLayer();
    const snapshots = [];
    let renders = 0;
    const app = {
      // push-before-change: capture the pre-gesture strokeWidth so undo works.
      pushHistory: () => { snapshots.push(layer.strokeWidth); },
      render: () => { renders += 1; },
    };
    // Simulate a drag: begin, many live moves, one commit.
    Vectura.StrokeModel.setStrokeWeight(layer, 0.6, { app, begin: true });
    Vectura.StrokeModel.setStrokeWeight(layer, 0.8, { app });
    Vectura.StrokeModel.setStrokeWeight(layer, 1.0, { app, commit: true });
    expect(layer.strokeWidth).toBe(1.0);
    expect(snapshots).toEqual([0.3]); // one undo step, snapped BEFORE the gesture
    expect(renders).toBe(3);          // live repaint on every call
  });

  test('a single committed edit (begin+commit) still pushes exactly one step', () => {
    const layer = makeLayer();
    let pushes = 0;
    const app = { pushHistory: () => { pushes += 1; }, render() {} };
    Vectura.StrokeModel.setStrokeWeight(layer, 0.9, { app, begin: true, commit: true });
    expect(layer.strokeWidth).toBe(0.9);
    expect(pushes).toBe(1);
  });

  test('setStrokeWeightForLayers applies to a set without touching pens', () => {
    const pens = [{ id: 'pen-1', name: 'A', color: '#111', width: 0.5 }];
    const layers = [
      { id: 'a', penId: 'pen-1', strokeWidth: 0.5 },
      { id: 'b', penId: 'pen-1', strokeWidth: 0.5 },
    ];
    Vectura.StrokeModel.setStrokeWeightForLayers(layers, 1.5, { pens });
    expect(layers.every((l) => l.strokeWidth === 1.5)).toBe(true);
    expect(layers.every((l) => l.penId === 'pen-1')).toBe(true);
    expect(pens[0].width).toBe(0.5);
  });
});
