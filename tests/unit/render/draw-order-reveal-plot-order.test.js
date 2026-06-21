const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

// The draw-order slider (Renderer.drawProgress) reveals the document along the
// real plot TIMELINE — pen-down draw time + pen-up travel time — walked in the
// same print order the SVG export uses (pen grouping, then line-sort interleave).
// Renderer.computePlotRevealOrder is the pure timeline core; these tests pin it.
describe('Renderer.computePlotRevealOrder — plot timeline', () => {
  let runtime;
  let computePlotRevealOrder;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    computePlotRevealOrder = runtime.window.Vectura.Renderer.computePlotRevealOrder;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // A straight horizontal path of a given length, fresh object identity.
  const seg = (x0, x1, extra) => {
    const p = [{ x: x0, y: 0 }, { x: x1, y: 0 }];
    return { path: p, length: Math.abs(x1 - x0), start: p[0], end: p[1], ...extra };
  };

  it('walks pen groups in first-appearance order and accumulates pen-down + travel time', () => {
    const a = seg(0, 10, { penKey: 'pen1', layerSeq: 0, pathIndex: 0 });
    const b = seg(0, 10, { penKey: 'pen2', layerSeq: 1, pathIndex: 0 });
    const c = seg(20, 30, { penKey: 'pen1', layerSeq: 2, pathIndex: 0 });
    const { info, total } = computePlotRevealOrder([a, b, c], {
      drawProgress: 1, drawSpeed: 10, travelSpeed: 10,
    });
    // Print order: pen1 group (a, c) then pen2 group (b).
    // a: travel 0, draw 10/10=1  → drawStart 0
    // c: travel |20-10|/10=1, draw 1 → drawStart 2
    // b: travel |0-30|/10=3, draw 1 → drawStart 6 ; total 7
    expect(info.get(a.path).drawStart).toBeCloseTo(0);
    expect(info.get(a.path).penDownTime).toBeCloseTo(1);
    expect(info.get(c.path).drawStart).toBeCloseTo(2);
    expect(info.get(b.path).drawStart).toBeCloseTo(6);
    expect(total).toBeCloseTo(7);
  });

  it('threshold = total plot time × drawProgress', () => {
    // Two abutting paths, no pen-up gap: total draw time = 2.
    const a = seg(0, 10, { penKey: 'p', layerSeq: 0, pathIndex: 0 });
    const b = seg(10, 20, { penKey: 'p', layerSeq: 1, pathIndex: 0 });
    const opts = { drawSpeed: 10, travelSpeed: 10 };
    expect(computePlotRevealOrder([a, b], { ...opts, drawProgress: 0.5 }).threshold).toBeCloseTo(1);
    expect(computePlotRevealOrder([a, b], { ...opts, drawProgress: 0 }).threshold).toBeCloseTo(0);
    expect(computePlotRevealOrder([a, b], { ...opts, drawProgress: 1 }).threshold).toBeCloseTo(2);
  });

  it('interleaves a pen group by lineSortOrder when paths are optimized + pen/combined grouped', () => {
    // Drawn order a,b,c but lineSortOrder visits them b(0), c(1), a(2).
    const mk = (order) => ({
      penKey: 'p', layerSeq: order, pathIndex: 0, optimized: true,
      lineSortOrder: order, lineSortGrouping: 'pen',
    });
    // Collapse travel to zero (all share one point) so only print order matters.
    const at0 = (extra) => ({ path: [{ x: 0, y: 0 }, { x: 0, y: 0 }], length: 10, start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, ...extra });
    const a = at0(mk(2));
    const b = at0(mk(0));
    const c = at0(mk(1));
    const { info } = computePlotRevealOrder([a, b, c], { drawProgress: 1, drawSpeed: 10, travelSpeed: 10 });
    expect(info.get(b.path).drawStart).toBeCloseTo(0);
    expect(info.get(c.path).drawStart).toBeCloseTo(1);
    expect(info.get(a.path).drawStart).toBeCloseTo(2);
  });

  it('does not interleave when line-sort metadata exists but paths are not optimized', () => {
    const at0 = (extra) => ({ path: [{ x: 0, y: 0 }, { x: 0, y: 0 }], length: 10, start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, ...extra });
    const a = at0({ penKey: 'p', layerSeq: 0, pathIndex: 0, optimized: false, lineSortOrder: 5, lineSortGrouping: 'pen' });
    const b = at0({ penKey: 'p', layerSeq: 1, pathIndex: 0, optimized: false, lineSortOrder: 1, lineSortGrouping: 'pen' });
    const { info } = computePlotRevealOrder([a, b], { drawProgress: 1, drawSpeed: 10, travelSpeed: 10 });
    expect(info.get(a.path).drawStart).toBeCloseTo(0); // input order preserved
    expect(info.get(b.path).drawStart).toBeCloseTo(1);
  });

  it('uses travelSpeed (not drawSpeed) for the pen-up gap between paths', () => {
    // Zero-length marks 100mm apart; draw time 0, so all time is travel.
    const a = { path: [{ x: 0, y: 0 }], length: 0, start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, penKey: 'p', layerSeq: 0, pathIndex: 0 };
    const b = { path: [{ x: 100, y: 0 }], length: 0, start: { x: 100, y: 0 }, end: { x: 100, y: 0 }, penKey: 'p', layerSeq: 1, pathIndex: 0 };
    const { info, total } = computePlotRevealOrder([a, b], { drawProgress: 1, drawSpeed: 10, travelSpeed: 100 });
    expect(info.get(a.path).drawStart).toBeCloseTo(0);
    expect(info.get(b.path).drawStart).toBeCloseTo(1); // 100mm / 100mm·s⁻¹
    expect(total).toBeCloseTo(1);
  });
});
