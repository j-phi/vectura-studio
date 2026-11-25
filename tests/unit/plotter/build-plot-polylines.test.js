// export-svg-builder.js is a browser IIFE on window.Vectura; give it a bare namespace before loading.
globalThis.window = globalThis.window || { Vectura: {} };
window.Vectura = window.Vectura || {};
window.Vectura.SETTINGS = window.Vectura.SETTINGS || {};
const PathDraw = require('../../../src/core/path-draw.js');
window.Vectura.PathDraw = window.Vectura.PathDraw || PathDraw;
require('../../../src/ui/export-svg-builder.js');

const { buildPlotPolylines } = window.Vectura.ExportSvgBuilder;

const item = (path, extra) => ({ path, useCurves: false, sharpEdges: false, ...extra });
const snapshot = (...groups) => ({ groups });
const pen = (id) => ({ id, name: id, color: '#123456', width: 0.3 });
const circle = (meta) => Object.assign([], { meta: { kind: 'circle', ...meta } });
const maxChordError = (poly, cx, cy, r) => {
  let worst = 0;
  for (let i = 1; i < poly.length; i++) {
    const mx = (poly[i].x + poly[i - 1].x) / 2; const my = (poly[i].y + poly[i - 1].y) / 2;
    worst = Math.max(worst, r - Math.hypot(mx - cx, my - cy));
  }
  return worst;
};

describe('ExportSvgBuilder.buildPlotPolylines', () => {
  test('is exported and returns [{penId, pen, polylines}] grouped by pen key', () => {
    const out = buildPlotPolylines(snapshot(
      { key: 'a', pen: pen('a'), items: [item([{ x: 0, y: 0 }, { x: 10, y: 0 }]), item([{ x: 0, y: 5 }, { x: 10, y: 5 }])] },
      { key: 'b', pen: pen('b'), items: [item([{ x: 1, y: 1 }, { x: 2, y: 2 }])] },
    ));
    expect(out.map((g) => g.penId)).toEqual(['a', 'b']);
    expect(out[0].pen.color).toBe('#123456');
    expect(out[0].polylines).toEqual([[{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 5 }, { x: 10, y: 5 }]]);
  });

  test('skips empty groups and degenerate paths', () => {
    const out = buildPlotPolylines(snapshot(
      { key: 'a', pen: pen('a'), items: [item([{ x: 0, y: 0 }]), item([])] },
      { key: 'b', pen: pen('b'), items: [item([{ x: 0, y: 0 }, { x: 1, y: 1 }])] },
    ));
    expect(out.map((g) => g.penId)).toEqual(['b']);
  });

  test('circles expand to >= 72 steps and closed at the start', () => {
    const [g] = buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(circle({ cx: 50, cy: 40, r: 1 }))] }));
    const poly = g.polylines[0];
    expect(poly.length).toBeGreaterThanOrEqual(73);
    expect(poly[poly.length - 1]).toEqual(poly[0]);
    expect(poly[0].x).toBeCloseTo(51, 9);
  });

  test.each([[5, 0.05], [100, 0.05], [100, 0.005], [400, 0.01]])('circle r=%f keeps chord error <= %f', (r, tol) => {
    const [g] = buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(circle({ cx: 200, cy: 150, r }))] }), { tolerance: tol });
    const poly = g.polylines[0];
    expect(maxChordError(poly, 200, 150, r)).toBeLessThanOrEqual(tol + 1e-9);
    poly.forEach((p) => expect(Math.hypot(p.x - 200, p.y - 150)).toBeCloseTo(r, 6));
  });

  test('larger circles get more steps than the 72 minimum', () => {
    const steps = (r) => buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(circle({ cx: 0, cy: 0, r }))] }), { tolerance: 0.01 })[0].polylines[0].length;
    expect(steps(400)).toBeGreaterThan(steps(2));
    expect(steps(400)).toBeGreaterThan(200);
  });

  test('ellipses (rx, ry, rotation) are expanded', () => {
    const [g] = buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(circle({ cx: 0, cy: 0, rx: 20, ry: 10, rotation: Math.PI / 2 }))] }));
    const xs = g.polylines[0].map((p) => p.x); const ys = g.polylines[0].map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(20, 6);
    expect(Math.max(...xs)).toBeCloseTo(10, 6);
  });

  test('curved paths go through PathDraw.toPolyline (flattened, honoring tolerance)', () => {
    const anchors = [
      { x: 0, y: 0, in: null, out: { x: 0, y: 30 } },
      { x: 60, y: 0, in: { x: 60, y: 30 }, out: null },
    ];
    const straight = Object.assign([{ x: 0, y: 0 }, { x: 60, y: 0 }], { meta: { anchors } });
    const probe = window.Vectura.PathDraw.toPolyline(straight, { useCurves: true }, 0.05);
    const [g] = buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(straight, { useCurves: true })] }), { tolerance: 0.05 });
    expect(g.polylines[0]).toEqual(probe);
    expect(g.polylines[0].length).toBeGreaterThan(5);
    const [coarse] = buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(straight, { useCurves: true })] }), { tolerance: 5 });
    expect(coarse.polylines[0].length).toBeLessThan(g.polylines[0].length);
  });

  test('closed smoothed paths end at their start', () => {
    const sq = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 }];
    const [g] = buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(sq, { useCurves: true })] }));
    const poly = g.polylines[0];
    expect(poly.length).toBeGreaterThan(5);
    expect(poly[poly.length - 1]).toEqual(poly[0]);
  });

  test('plain polylines are copied verbatim when curves are off', () => {
    const src = [{ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 5, y: 9 }];
    const [g] = buildPlotPolylines(snapshot({ key: 'a', pen: pen('a'), items: [item(src)] }));
    expect(g.polylines[0]).toEqual(src);
    expect(g.polylines[0]).not.toBe(src);
  });
});
