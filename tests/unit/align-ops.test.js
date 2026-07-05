/**
 * Unit tests for src/core/align-ops.js
 *
 * The module is a self-contained IIFE that publishes window.Vectura.AlignOps.
 * Vitest defaults to a jsdom environment, so we just require() it and read
 * the exposed namespace.
 */
const path = require('path');

// Load the IIFE once into globalThis (jsdom's window is the same global).
require(path.resolve(__dirname, '../../src/core/align-ops.js'));

const AO = globalThis.Vectura.AlignOps;

// Stub layer + bounds factory: each "layer" carries a precomputed world rect.
// boundsFor() returns { minX, maxX, minY, maxY } — AlignOps' worldRectFromBounds
// recognizes that shape and synthesizes a non-rotated rect.
const layerWithRect = (id, minX, minY, maxX, maxY) => ({
  id,
  visible: true,
  locked: false,
  rect: { minX, maxX, minY, maxY },
});

const boundsForFactory = () => (layer) => layer.rect;

describe('AlignOps.worldRectFromBounds', () => {
  test('returns null for null input', () => {
    expect(AO.worldRectFromBounds(null)).toBeNull();
  });

  test('reads min/max from corners when present', () => {
    const b = {
      corners: {
        nw: { x: 0, y: 0 }, ne: { x: 10, y: 0 },
        se: { x: 10, y: 8 }, sw: { x: 0, y: 8 },
      },
    };
    const r = AO.worldRectFromBounds(b);
    expect(r).toMatchObject({ minX: 0, maxX: 10, minY: 0, maxY: 8, centerX: 5, centerY: 4 });
  });

  test('falls back to plain min/max', () => {
    const r = AO.worldRectFromBounds({ minX: 2, maxX: 12, minY: 4, maxY: 14 });
    expect(r).toMatchObject({ centerX: 7, centerY: 9 });
  });
});

describe('AlignOps.align (mode=selection)', () => {
  const boundsFor = boundsForFactory();

  test('alignLeft moves each layer so its left edge matches selection left', () => {
    const a = layerWithRect('a', 0,  0, 10, 10);
    const b = layerWithRect('b', 5,  0, 15, 10);
    const c = layerWithRect('c', 8,  0, 18, 10);
    const deltas = AO.align('alignLeft', [a, b, c], boundsFor, { mode: 'selection' });
    expect(deltas.a).toBeUndefined(); // already at leftmost (0)
    expect(deltas.b).toEqual({ dx: -5, dy: 0 });
    expect(deltas.c).toEqual({ dx: -8, dy: 0 });
  });

  test('alignRight moves each layer so its right edge matches selection right', () => {
    const a = layerWithRect('a', 0,  0, 10, 10);
    const b = layerWithRect('b', 5,  0, 15, 10);
    const c = layerWithRect('c', 8,  0, 18, 10);
    const deltas = AO.align('alignRight', [a, b, c], boundsFor, { mode: 'selection' });
    expect(deltas.a).toEqual({ dx: 8, dy: 0 });
    expect(deltas.b).toEqual({ dx: 3, dy: 0 });
    expect(deltas.c).toBeUndefined();
  });

  test('alignCenterH moves each layer so center matches selection center X', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);   // cx = 5
    const b = layerWithRect('b', 20, 0, 30, 10);  // cx = 25
    // selection cx = (0 + 30) / 2 = 15
    const deltas = AO.align('alignCenterH', [a, b], boundsFor, { mode: 'selection' });
    expect(deltas.a).toEqual({ dx: 10, dy: 0 });
    expect(deltas.b).toEqual({ dx: -10, dy: 0 });
  });

  test('alignTop / alignBottom / alignCenterV work symmetrically', () => {
    const a = layerWithRect('a', 0, 0,  10, 10);
    const b = layerWithRect('b', 0, 20, 10, 30);
    expect(AO.align('alignTop',     [a, b], boundsFor, { mode: 'selection' }).b).toEqual({ dx: 0, dy: -20 });
    expect(AO.align('alignBottom',  [a, b], boundsFor, { mode: 'selection' }).a).toEqual({ dx: 0, dy:  20 });
    expect(AO.align('alignCenterV', [a, b], boundsFor, { mode: 'selection' })).toEqual({
      a: { dx: 0, dy:  10 },
      b: { dx: 0, dy: -10 },
    });
  });

  test('locked layers are skipped from both reference and moves', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);
    const locked = { ...layerWithRect('locked', -50, 0, -40, 10), locked: true };
    const b = layerWithRect('b', 5, 0, 15, 10);
    const deltas = AO.align('alignLeft', [a, locked, b], boundsFor, { mode: 'selection' });
    // reference = aggregate of a + b = minX 0; locked excluded
    expect(deltas.locked).toBeUndefined();
    expect(deltas.b).toEqual({ dx: -5, dy: 0 });
  });

  test('hidden (visible=false) layers are skipped', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);
    const hidden = { ...layerWithRect('hidden', -50, 0, -40, 10), visible: false };
    const b = layerWithRect('b', 5, 0, 15, 10);
    const deltas = AO.align('alignLeft', [a, hidden, b], boundsFor, { mode: 'selection' });
    expect(deltas.hidden).toBeUndefined();
    expect(deltas.b).toEqual({ dx: -5, dy: 0 });
  });
});

describe('AlignOps.align (mode=artboard)', () => {
  const boundsFor = boundsForFactory();
  const artboard = { width: 100, height: 200 };

  test('alignCenterH centers each layer on the artboard horizontal midline', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);   // cx = 5
    const b = layerWithRect('b', 80, 0, 90, 10);  // cx = 85
    const deltas = AO.align('alignCenterH', [a, b], boundsFor, { mode: 'artboard', artboard });
    expect(deltas.a).toEqual({ dx: 45, dy: 0 });  // 50 - 5
    expect(deltas.b).toEqual({ dx: -35, dy: 0 }); // 50 - 85
  });

  test('alignBottom snaps each layer bottom to artboard.height', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);
    const b = layerWithRect('b', 0, 90, 10, 100);
    const deltas = AO.align('alignBottom', [a, b], boundsFor, { mode: 'artboard', artboard });
    expect(deltas.a).toEqual({ dx: 0, dy: 190 });
    expect(deltas.b).toEqual({ dx: 0, dy: 100 });
  });
});

describe('AlignOps.align (mode=key)', () => {
  const boundsFor = boundsForFactory();
  const key = layerWithRect('key', 50, 50, 60, 60);
  const a = layerWithRect('a', 0, 0, 10, 10);
  const b = layerWithRect('b', 70, 70, 80, 80);

  test('alignLeft aligns to key.minX, key itself is not moved', () => {
    const deltas = AO.align('alignLeft', [a, key, b], boundsFor, { mode: 'key', keyId: 'key' });
    expect(deltas.a).toEqual({ dx: 50, dy: 0 });
    expect(deltas.b).toEqual({ dx: -20, dy: 0 });
    expect(deltas.key).toBeUndefined();
  });
});

describe('AlignOps.distribute (mode=selection)', () => {
  const boundsFor = boundsForFactory();

  test('distributeCenterH on 3 evenly-spaced widths leaves them unchanged', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);
    const b = layerWithRect('b', 20, 0, 30, 10);
    const c = layerWithRect('c', 40, 0, 50, 10);
    const deltas = AO.distribute('distributeCenterH', [a, b, c], boundsFor, { mode: 'selection' });
    expect(deltas).toEqual({});
  });

  test('distributeCenterH pins outermost and centers middle layer between them', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);   // cx = 5
    const b = layerWithRect('b', 12, 0, 22, 10);  // cx = 17
    const c = layerWithRect('c', 40, 0, 50, 10); // cx = 45
    // selection cx range: [5, 45]; step = 40 / 2 = 20; b should land at cx=25 → dx = +8
    const deltas = AO.distribute('distributeCenterH', [a, b, c], boundsFor, { mode: 'selection' });
    expect(deltas.a).toBeUndefined();
    expect(deltas.c).toBeUndefined();
    expect(deltas.b).toEqual({ dx: 8, dy: 0 });
  });

  test('distributeLeft uses left-edge anchors and pins outermost lefts', () => {
    const a = layerWithRect('a',  0, 0, 10, 10);
    const b = layerWithRect('b', 30, 0, 50, 10); // wide
    const c = layerWithRect('c', 60, 0, 70, 10);
    // left-edge anchors at 0, 30, 60. step = 60/2 = 30. b's target left = 30 → no move.
    const deltas = AO.distribute('distributeLeft', [a, b, c], boundsFor, { mode: 'selection' });
    expect(deltas.b).toBeUndefined();
  });
});

describe('AlignOps.distributeSpacing', () => {
  const boundsFor = boundsForFactory();

  test('returns {} when no key object is set', () => {
    const a = layerWithRect('a',  0, 0, 10, 10);
    const b = layerWithRect('b', 20, 0, 30, 10);
    const deltas = AO.distributeSpacing('distributeSpacingH', [a, b], boundsFor, { spacing: 5 });
    expect(deltas).toEqual({});
  });

  test('with key=a, spacing=5 → b lands at min=15 (a.max+5)', () => {
    const a = layerWithRect('a',  0, 0, 10, 10);   // maxX=10
    const b = layerWithRect('b', 50, 0, 60, 10);   // minX=50
    const deltas = AO.distributeSpacing('distributeSpacingH', [a, b], boundsFor, {
      keyId: 'a', spacing: 5,
    });
    // b's new minX = a.maxX + 5 = 15 → dx = 15 - 50 = -35
    expect(deltas.b).toEqual({ dx: -35, dy: 0 });
    expect(deltas.a).toBeUndefined();
  });

  test('negative spacing causes overlap', () => {
    const a = layerWithRect('a',  0, 0, 10, 10);
    const b = layerWithRect('b', 50, 0, 60, 10);
    const deltas = AO.distributeSpacing('distributeSpacingH', [a, b], boundsFor, {
      keyId: 'a', spacing: -3,
    });
    // b's new minX = 10 - 3 = 7 → dx = 7 - 50 = -43
    expect(deltas.b).toEqual({ dx: -43, dy: 0 });
  });

  test('three items with spacing=2: middle and far placed sequentially from key', () => {
    const a = layerWithRect('a',  0, 0, 10, 10);
    const b = layerWithRect('b', 100, 0, 105, 10); // size 5
    const c = layerWithRect('c', 200, 0, 220, 10); // size 20
    const deltas = AO.distributeSpacing('distributeSpacingH', [a, b, c], boundsFor, {
      keyId: 'a', spacing: 2,
    });
    // b.newMin = 12, dx = -88
    expect(deltas.b).toEqual({ dx: -88, dy: 0 });
    // c follows b: c.newMin = (12 + 5) + 2 = 19, dx = -181
    expect(deltas.c).toEqual({ dx: -181, dy: 0 });
  });

  test('vertical spacing axis works analogously', () => {
    const a = layerWithRect('a', 0,  0,  10, 10);   // maxY=10
    const b = layerWithRect('b', 0, 50, 10, 60);   // minY=50
    const deltas = AO.distributeSpacing('distributeSpacingV', [a, b], boundsFor, {
      keyId: 'a', spacing: 3,
    });
    expect(deltas.b).toEqual({ dx: 0, dy: -37 }); // 13 - 50
  });
});

describe('AlignOps undo-step granularity', () => {
  test('layers that need no movement are omitted from delta map', () => {
    const boundsFor = boundsForFactory();
    const a = layerWithRect('a', 0, 0, 10, 10);
    const b = layerWithRect('b', 0, 0, 10, 10);
    const deltas = AO.align('alignLeft', [a, b], boundsFor, { mode: 'selection' });
    expect(deltas).toEqual({});
  });
});

// MSC-2 — Horizontal & Vertical Align Center (concentric snap) as ONE compound
// op that moves each layer on BOTH axes so a single apply (one undo step) makes
// the selection concentric.
describe('AlignOps.align alignCenterBoth (MSC-2)', () => {
  const boundsFor = boundsForFactory();

  test('centers each layer on both axes to the selection center in one delta map', () => {
    // Two rects with different centers → both must snap to the shared center.
    const a = layerWithRect('a', 0, 0, 10, 10);   // center (5, 5)
    const b = layerWithRect('b', 20, 30, 40, 50); // center (30, 40)
    // Selection aggregate rect: x[0..40] y[0..50] → center (20, 25).
    const deltas = AO.align('alignCenterBoth', [a, b], boundsFor, { mode: 'selection' });
    expect(deltas.a).toEqual({ dx: 15, dy: 20 });  // (20-5, 25-5)
    expect(deltas.b).toEqual({ dx: -10, dy: -15 }); // (20-30, 25-40)
  });

  test('two shapes become concentric after applying the deltas (single action)', () => {
    const a = layerWithRect('a', 0, 0, 10, 10);   // center (5, 5)
    const b = layerWithRect('b', 20, 30, 40, 50); // center (30, 40)
    const deltas = AO.align('alignCenterBoth', [a, b], boundsFor, { mode: 'selection' });
    const centerAfter = (rect, d = { dx: 0, dy: 0 }) => ({
      cx: (rect.minX + rect.maxX) / 2 + d.dx,
      cy: (rect.minY + rect.maxY) / 2 + d.dy,
    });
    const ca = centerAfter(a.rect, deltas.a);
    const cb = centerAfter(b.rect, deltas.b);
    expect(ca.cx).toBeCloseTo(cb.cx, 6);
    expect(ca.cy).toBeCloseTo(cb.cy, 6);
  });

  test('respects Align-To artboard as the reference center', () => {
    const a = layerWithRect('a', 0, 0, 10, 10); // center (5, 5)
    const deltas = AO.align('alignCenterBoth', [a], boundsFor, {
      mode: 'artboard', artboard: { width: 100, height: 80 },
    });
    // Artboard center (50, 40) → dx 45, dy 35.
    expect(deltas.a).toEqual({ dx: 45, dy: 35 });
  });
});
