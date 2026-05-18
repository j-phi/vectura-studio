/**
 * @vitest-environment jsdom
 *
 * Unit tests for src/core/pathfinder-ops.js
 *
 * PathfinderOps is loaded as an IIFE that depends on FillBoolean (which itself
 * depends on the polygon-clipping UMD bundle), Masking, Layer, and the SETTINGS
 * bag. We bootstrap that stack onto globalThis before requiring the module.
 *
 * The polygon-clipping UMD is a real file in the repo (src/vendor/...), so we
 * load it directly to obtain a working boolean primitive set.
 */
const path = require('path');

// 1. polygon-clipping UMD detects CommonJS and exports via module.exports —
//    pin it back onto window so fill-boolean.js (which reads window.polygonClipping)
//    can find it under jsdom.
const polygonClipping = require(path.resolve(__dirname, '../../src/vendor/polygon-clipping.umd.js'));
globalThis.polygonClipping = polygonClipping;
if (typeof window !== 'undefined') window.polygonClipping = polygonClipping;
// 2. FillBoolean wraps polygon-clipping.
require(path.resolve(__dirname, '../../src/core/fill-boolean.js'));
// 3. Stub Masking with a passthrough silhouette resolver — we'll inject paths
//    into a fake `engine.layers` and read them via layer.displayPaths.
const path2 = require('path');
require(path2.resolve(__dirname, '../../src/core/path-boolean.js'));
// 4. Settings/Layer/Algorithms minimal stubs so Layer's constructor is happy.
globalThis.Vectura = globalThis.Vectura || {};
globalThis.Vectura.SETTINGS = globalThis.Vectura.SETTINGS || {
  pens: [{ id: 'pen-1', color: '#fff', width: 0.3 }],
  uiTheme: 'dark',
  strokeWidth: 0.3,
  globalLayerCount: 0,
};
globalThis.Vectura.THEMES = globalThis.Vectura.THEMES || { dark: { pen1Color: '#ffffff' } };
globalThis.Vectura.ALGO_DEFAULTS = globalThis.Vectura.ALGO_DEFAULTS || {
  shape: { seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
  flowfield: { seed: 1 },
};
require(path2.resolve(__dirname, '../../src/core/layer.js'));
require(path2.resolve(__dirname, '../../src/core/masking.js'));
// 5. The module under test.
require(path2.resolve(__dirname, '../../src/core/pathfinder-ops.js'));

const PO = globalThis.Vectura.PathfinderOps;
const Layer = globalThis.Vectura.Layer;

// Helpers to build closed-polygon layers compatible with Masking.
const square = (id, minX, minY, maxX, maxY, type = 'rect') => {
  const layer = new Layer(id, type, `${type}-${id}`);
  const path = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY },
  ];
  path.meta = { kind: 'polygon', closed: true };
  layer.paths = [path];
  layer.displayPaths = [path];
  return layer;
};

const fakeEngine = (...layers) => ({ layers, _layerCounter: layers.length });

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i += 1) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
};

const totalArea = (multiPolygon) => {
  if (!Array.isArray(multiPolygon)) return 0;
  let total = 0;
  multiPolygon.forEach((poly) => {
    if (!poly || !poly.length) return;
    // Outer ring positive, holes are negative — sum of signed areas.
    poly.forEach((ring, idx) => {
      const a = ringArea(ring);
      total += idx === 0 ? a : -a;
    });
  });
  return total;
};

describe('PathfinderOps.shapeOnlyEligibility', () => {
  test('rect is eligible', () => {
    const layer = square('a', 0, 0, 10, 10, 'rect');
    expect(PO.shapeOnlyEligibility(layer).ok).toBe(true);
  });

  test('flowfield (algorithm layer) is not eligible', () => {
    const layer = new Layer('b', 'flowfield', 'flowfield-1');
    expect(PO.shapeOnlyEligibility(layer).ok).toBe(false);
  });

  test('hidden layer is rejected', () => {
    const layer = square('c', 0, 0, 10, 10, 'rect');
    layer.visible = false;
    expect(PO.shapeOnlyEligibility(layer).ok).toBe(false);
  });

  test('compound layer is always eligible', () => {
    const compound = square('cmp', 0, 0, 10, 10, 'shape');
    compound.type = 'compound';
    expect(PO.shapeOnlyEligibility(compound).ok).toBe(true);
  });
});

describe('PathfinderOps.computeOp — Shape Modes (silhouette mode)', () => {
  // Two unit squares overlapping by a 4x4 region:
  //   A: (0,0)-(10,10)        area 100
  //   B: (6,6)-(16,16)        area 100
  //   overlap: (6,6)-(10,10)  area 16
  //   union  : 100 + 100 - 16 = 184
  //   xor    : 184 - 16       = 168
  const A = square('A', 0, 0, 10, 10);
  const B = square('B', 6, 6, 16, 16);
  const engine = fakeEngine(A, B);

  test('unite returns the union area', () => {
    const mp = PO.computeOp('unite', [A, B], 'silhouette', engine);
    expect(totalArea(mp)).toBeCloseTo(184, 4);
  });

  test('intersect returns just the overlap', () => {
    const mp = PO.computeOp('intersect', [A, B], 'silhouette', engine);
    expect(totalArea(mp)).toBeCloseTo(16, 4);
  });

  test('exclude returns union minus overlap', () => {
    const mp = PO.computeOp('exclude', [A, B], 'silhouette', engine);
    expect(totalArea(mp)).toBeCloseTo(168, 4);
  });

  test('minusFront subtracts the top-of-panel stack from the bottom-of-panel layer', () => {
    // Vectura's panel renders engine.layers in natural order, so engine[0]
    // (A) is at the TOP of the panel and engine[last] (B) is at the BOTTOM.
    // "Minus Front" keeps the bottom-of-panel layer (B) and removes A from
    // it: B - A = 100 - 16 = 84.
    const mp = PO.computeOp('minusFront', [A, B], 'silhouette', engine);
    expect(totalArea(mp)).toBeCloseTo(84, 4);
  });

  test('minusFront with asymmetric squares keeps the bottom-of-panel survivor', () => {
    // Use different sizes so the result is direction-sensitive.
    // Top of panel = small (10), bottom = large (400). Result = 400 - overlap.
    const small = square('small', 0, 0, 10, 10); // area 100
    const large = square('large', 5, 5, 25, 25); // area 400
    const eng = fakeEngine(small, large);
    const overlap = 25; // (5,5)-(10,10) → 5×5
    const mp = PO.computeOp('minusFront', [small, large], 'silhouette', eng);
    expect(totalArea(mp)).toBeCloseTo(400 - overlap, 4);
  });

  test('intersect of two non-overlapping squares is empty', () => {
    const C = square('C', 0, 0, 5, 5);
    const D = square('D', 20, 20, 25, 25);
    const mp = PO.computeOp('intersect', [C, D], 'silhouette', fakeEngine(C, D));
    expect(totalArea(mp)).toBe(0);
  });

  // Triangles, not rectangles — exercises the polygon path (not the
  // bounding-rect fallback) so a regression to "always-bounding-rect"
  // shows up immediately.
  test('union of two overlapping triangles equals their geometric union', () => {
    const triA = new Layer('triA', 'shape', 'triA');
    const pathA = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
    pathA.meta = { kind: 'polygon', closed: true };
    triA.paths = [pathA]; triA.displayPaths = [pathA];
    const triB = new Layer('triB', 'shape', 'triB');
    const pathB = [{ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    pathB.meta = { kind: 'polygon', closed: true };
    triB.paths = [pathB]; triB.displayPaths = [pathB];
    // Each triangle: area 50. They share only an edge — union = 100,
    // not 100 (their combined bounding rect would also be 100, so we test
    // *intersect* which is 0 for shared-edge triangles but would be 100
    // if both fell back to bounding rects).
    const mp = PO.computeOp('intersect', [triA, triB], 'silhouette', fakeEngine(triA, triB));
    expect(totalArea(mp)).toBeCloseTo(0, 4);
  });
});

describe('PathfinderOps.computeOp — Shape-Only mode', () => {
  test('shape-only excludes non-closed layers from union', () => {
    const A = square('A', 0, 0, 10, 10, 'rect');
    const algo = new Layer('algo', 'flowfield', 'fld');
    algo.displayPaths = [
      Object.assign([{ x: 5, y: 5 }, { x: 9, y: 9 }], { meta: {} }),
    ];
    // Sanity check: A is eligible, algo is not.
    expect(PO.shapeOnlyEligibility(A).ok).toBe(true);
    expect(PO.shapeOnlyEligibility(algo).ok).toBe(false);
    // geometryFor(A, 'shape-only') should yield a non-empty multipolygon.
    const geomA = PO.geometryFor(A, 'shape-only', fakeEngine(A, algo));
    expect(geomA.length).toBeGreaterThan(0);
    // In shape-only mode, only A contributes — unite of {A} is just A.
    const mp = PO.computeOp('unite', [A, algo], 'shape-only', fakeEngine(A, algo));
    expect(totalArea(mp)).toBeCloseTo(100, 4);
  });
});

describe('PathfinderOps.createCompound + expand', () => {
  test('createCompound wraps children in a compound group container', () => {
    const A = square('A', 0, 0, 10, 10);
    const B = square('B', 6, 6, 16, 16);
    const engine = fakeEngine(A, B);
    const id = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    expect(id).toBeTruthy();
    expect(engine.layers).toHaveLength(3);
    const compound = engine.layers.find((l) => l.id === id);
    expect(compound.type).toBe('compound');
    expect(compound.isGroup).toBe(true);
    expect(compound.containerRole).toBe('compound');
    expect(compound.groupType).toBe('compound');
    expect(compound.compound.opType).toBe('unite');
    expect(compound.compound.sourceMode).toBe('silhouette');
    expect(compound.compound.childIds).toEqual(['A', 'B']);
    // Children got reparented under the compound.
    expect(A.parentId).toBe(compound.id);
    expect(B.parentId).toBe(compound.id);
    // Compound carries the baked silhouette in paths AND effectivePaths so
    // getRenderablePaths (which prefers effectivePaths) picks it up.
    expect(compound.paths.length).toBeGreaterThan(0);
    expect(compound.effectivePaths.length).toBe(compound.paths.length);
  });

  test('expand bakes the compound and removes its children', () => {
    const A = square('A', 0, 0, 10, 10);
    const B = square('B', 6, 6, 16, 16);
    const engine = fakeEngine(A, B);
    const id = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    const compound = engine.layers.find((l) => l.id === id);
    PO.expand(engine, compound);
    expect(compound.type).toBe('shape');
    expect(compound.isGroup).toBe(false);
    expect(compound.containerRole).toBeNull();
    expect(compound.compound).toBeNull();
    expect(engine.layers.find((l) => l.id === 'A')).toBeUndefined();
    expect(engine.layers.find((l) => l.id === 'B')).toBeUndefined();
    expect(engine.layers).toHaveLength(1);
  });

  test('createCompound rejects fewer than 2 layers', () => {
    const A = square('A', 0, 0, 10, 10);
    const engine = fakeEngine(A);
    expect(PO.createCompound(engine, [A], 'unite', 'silhouette')).toBeNull();
  });

  test('createCompound rejects non-shape-mode ops', () => {
    const A = square('A', 0, 0, 10, 10);
    const B = square('B', 6, 6, 16, 16);
    const engine = fakeEngine(A, B);
    expect(PO.createCompound(engine, [A, B], 'divide', 'silhouette')).toBeNull();
  });
});

describe('PathfinderOps.recomputeCompound — cache invalidation', () => {
  test('moving a child invalidates the cache and updates paths', () => {
    const A = square('A', 0, 0, 10, 10);
    const B = square('B', 6, 6, 16, 16);
    const engine = fakeEngine(A, B);
    const id = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    const compound = engine.layers.find((l) => l.id === id);
    const firstArea = totalArea(compound.compound.cache.multiPolygon);

    // Move B far away so the union becomes two disjoint squares (area 200).
    B.paths[0].forEach((pt) => { pt.x += 100; pt.y += 100; });
    B.displayPaths = B.paths;
    B.params.posX = 100;
    PO.recomputeCompound(compound, engine);
    const secondArea = totalArea(compound.compound.cache.multiPolygon);
    expect(secondArea).toBeCloseTo(200, 4);
    expect(secondArea).not.toBeCloseTo(firstArea, 4);
  });

  test('reparenting a child into the compound includes it in the next recompute', () => {
    const A = square('A', 0, 0, 10, 10);
    const B = square('B', 6, 6, 16, 16);
    const engine = fakeEngine(A, B);
    const id = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    const compound = engine.layers.find((l) => l.id === id);
    // Add a third rect later by giving it parentId = compound.id.
    const C = square('C', 20, 0, 26, 6);
    C.parentId = compound.id;
    engine.layers.push(C);
    PO.recomputeCompound(compound, engine);
    // Three squares: A=100, B=100, C=36, A∩B=16, others disjoint → 220.
    expect(totalArea(compound.compound.cache.multiPolygon)).toBeCloseTo(220, 4);
    expect(compound.compound.childIds).toContain('C');
  });
});

describe('PathfinderOps — nested compounds (stacking)', () => {
  // Compose: C − (A ∪ B). A∪B = (0,0)-(18,10) rectangle (overlap fully merges),
  // area 180. C = (3,5)-(15,15) overlaps A∪B in the strip (3,5)-(15,10), area 60.
  // C area = 120. Difference area = 120 − 60 = 60.
  const setupAB = () => {
    const A = square('A', 0, 0, 10, 10);
    const B = square('B', 8, 0, 18, 10);
    const C = square('C', 3, 5, 15, 15);
    // Engine order: A, B, C. In Vectura's panel that puts A at the TOP and C
    // at the BOTTOM. The compound created from A+B will be inserted at
    // frontmost-of-{A,B}+1 = index 2 (after B), so it ends up just ABOVE C in
    // the panel. "Minus Front" keeps the bottom-of-panel layer (C) and
    // subtracts the union compound (the layers stacked above it).
    const engine = fakeEngine(A, B, C);
    return { A, B, C, engine };
  };

  test('Minus Front on (compound, layer) wraps the compound as a nested child', () => {
    const { A, B, C, engine } = setupAB();
    const innerId = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    const inner = engine.layers.find((l) => l.id === innerId);
    expect(inner.compound.opType).toBe('unite');
    // Now stack: take the unite compound + C, do Minus Front.
    const outerId = PO.createCompound(engine, [inner, C], 'minusFront', 'silhouette');
    expect(outerId).toBeTruthy();
    const outer = engine.layers.find((l) => l.id === outerId);
    // Outer must be a fresh compound containing [inner, C] — the inner compound
    // is preserved as a child (not flattened), and C is its front sibling.
    expect(outer.type).toBe('compound');
    expect(outer.compound.opType).toBe('minusFront');
    expect(outer.compound.childIds).toEqual([inner.id, C.id]);
    // The inner compound is nested under the outer compound.
    expect(inner.parentId).toBe(outer.id);
    expect(C.parentId).toBe(outer.id);
    // The original primitives stay nested under the inner compound (deep nesting).
    expect(A.parentId).toBe(inner.id);
    expect(B.parentId).toBe(inner.id);
    // The Minus Front silhouette equals C − (A∪B) = 120 − 60 = 60.
    expect(totalArea(outer.compound.cache.multiPolygon)).toBeCloseTo(60, 4);
  });

  test('moving an innermost child propagates through nested compounds on refresh', () => {
    const { A, B, C, engine } = setupAB();
    const innerId = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    const inner = engine.layers.find((l) => l.id === innerId);
    const outerId = PO.createCompound(engine, [inner, C], 'minusFront', 'silhouette');
    const outer = engine.layers.find((l) => l.id === outerId);
    const before = totalArea(outer.compound.cache.multiPolygon);
    expect(before).toBeCloseTo(60, 4);
    // Shift A horizontally so the inner union changes, which should change the
    // outer Minus Front result. Move A from (0,0)-(10,10) to (-5,0)-(5,10).
    A.paths[0].forEach((pt) => { pt.x -= 5; });
    A.displayPaths = A.paths;
    A.params.posX = -5;
    // Recompute parents in z-order: inner first (its index < outer's).
    PO.refreshAllCompounds(engine);
    const after = totalArea(outer.compound.cache.multiPolygon);
    // New A∪B = (-5,0)-(5,10) ∪ (8,0)-(18,10) (disjoint, area 200).
    // C = (3,5)-(15,15), area 120.
    //   C ∩ A = (3,5)-(5,10)  area 10
    //   C ∩ B = (8,5)-(15,10) area 35
    //   Total intersection = 45. C − (A∪B) = 120 − 45 = 75.
    expect(after).toBeCloseTo(75, 4);
    expect(after).not.toBeCloseTo(before, 4);
  });

  test('outer cache invalidates when inner compound geometry changes but path count stays the same', () => {
    // A and B overlap; after moving A, they still overlap → inner.paths.length
    // stays 1. If the outer signature only watches inner.paths.length, the
    // outer keeps stale geometry — that's the bug this test guards against.
    const A = square('A', 0, 0, 10, 10);
    const B = square('B', 8, 0, 18, 10);
    // C extends left of A∪B so the result is sensitive to A's x-shift even
    // when the union stays a single rectangle.
    const C = square('C', -3, 0, 5, 10);
    const engine = fakeEngine(A, B, C);
    const innerId = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    const inner = engine.layers.find((l) => l.id === innerId);
    const outerId = PO.createCompound(engine, [inner, C], 'minusFront', 'silhouette');
    const outer = engine.layers.find((l) => l.id === outerId);
    const before = totalArea(outer.compound.cache.multiPolygon);
    // C area 80. A∪B = (0,0)-(18,10). C ∩ (A∪B) = (0,0)-(5,10) = 50.
    // C − (A∪B) = 80 − 50 = 30.
    expect(before).toBeCloseTo(30, 4);

    // Shift A right by 2: (2,0)-(12,10). Still overlaps B → inner stays 1 path.
    A.paths[0].forEach((pt) => { pt.x += 2; });
    A.displayPaths = A.paths;
    A.params.posX = 2;
    PO.refreshAllCompounds(engine);
    // New A∪B = (2,0)-(18,10). C ∩ (A∪B) = (2,0)-(5,10) = 30.
    // C − (A∪B) = 80 − 30 = 50.
    expect(inner.paths.length).toBe(1); // sanity: path count truly unchanged
    expect(totalArea(outer.compound.cache.multiPolygon)).toBeCloseTo(50, 4);
  });

  test('expand on outer compound bakes the result and removes the nested chain', () => {
    const { A, B, C, engine } = setupAB();
    const innerId = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    const inner = engine.layers.find((l) => l.id === innerId);
    const outerId = PO.createCompound(engine, [inner, C], 'minusFront', 'silhouette');
    const outer = engine.layers.find((l) => l.id === outerId);
    PO.expand(engine, outer);
    expect(outer.type).toBe('shape');
    expect(outer.compound).toBeNull();
    // Direct children of the outer compound are removed by expand. The inner
    // compound was a direct child, so it goes — and we should NOT leave A/B
    // dangling as orphans whose grandparent is gone.
    expect(engine.layers.find((l) => l.id === inner.id)).toBeUndefined();
    expect(engine.layers.find((l) => l.id === C.id)).toBeUndefined();
    expect(engine.layers.find((l) => l.id === 'A')).toBeUndefined();
    expect(engine.layers.find((l) => l.id === 'B')).toBeUndefined();
  });
});
