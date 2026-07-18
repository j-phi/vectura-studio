/**
 * @vitest-environment jsdom
 *
 * AUD-05 regression coverage: polygon-clipping throws ("Unable to complete
 * output ring") on degenerate input. Before this task the four FillBoolean
 * ops called polygonClipping raw, so one self-intersecting user shape in a
 * compound could throw uncaught through refreshAllCompounds → applyState,
 * leaving a silently dead UI.
 *
 * A real geometric repro was attempted first (bowties, near-degenerate
 * offsets, issue-tracker cases from mfogel/polygon-clipping) — the vendored
 * build absorbs them all, so per the task spec the throw is injected by
 * monkeypatching the clipping ops.
 *
 * Bootstrap mirrors tests/unit/pathfinder-ops.test.js.
 */
const path = require('path');

const polygonClipping = require(path.resolve(__dirname, '../../src/vendor/polygon-clipping.umd.js'));
globalThis.polygonClipping = polygonClipping;
if (typeof window !== 'undefined') window.polygonClipping = polygonClipping;
require(path.resolve(__dirname, '../../src/core/fill-boolean.js'));
require(path.resolve(__dirname, '../../src/core/path-boolean.js'));
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
};
require(path.resolve(__dirname, '../../src/core/utils.js'));
require(path.resolve(__dirname, '../../src/core/layer.js'));
require(path.resolve(__dirname, '../../src/core/geometry-utils.js'));
require(path.resolve(__dirname, '../../src/core/optimization-utils.js'));
require(path.resolve(__dirname, '../../src/core/masking.js'));
require(path.resolve(__dirname, '../../src/core/pathfinder-ops.js'));

const FB = globalThis.Vectura.FillBoolean;
const PO = globalThis.Vectura.PathfinderOps;
const Layer = globalThis.Vectura.Layer;

const square = (id, minX, minY, maxX, maxY) => {
  const layer = new Layer(id, 'rect', `rect-${id}`);
  const p = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY },
  ];
  p.meta = { kind: 'polygon', closed: true };
  layer.paths = [p];
  layer.displayPaths = [p];
  return layer;
};

const fakeEngine = (...layers) => ({ layers, _layerCounter: layers.length });

const squareGeom = (x0, y0, size) => [[
  [x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0],
]];

const withThrowingOp = (opName, fn) => {
  const real = polygonClipping[opName];
  polygonClipping[opName] = () => {
    throw new Error('Unable to complete output ring starting at [x, y]');
  };
  try {
    return fn();
  } finally {
    polygonClipping[opName] = real;
  }
};

describe('FillBoolean degenerate-geometry guard (AUD-05)', () => {
  test.each(['union', 'xor', 'intersection'])(
    'FB.%s degrades to [] instead of throwing, and records the failure',
    (opName) => {
      FB.consumeLastOpError();
      const result = withThrowingOp(opName, () =>
        FB[opName](squareGeom(0, 0, 10), squareGeom(5, 5, 10))
      );
      expect(result).toEqual([]);
      const err = FB.consumeLastOpError();
      expect(err).toBeTruthy();
      expect(err.op).toBe(opName);
      // Consuming clears it — a later legitimate empty result is not a failure.
      expect(FB.consumeLastOpError()).toBeNull();
    }
  );

  test('FB.difference degrades to [] instead of throwing', () => {
    FB.consumeLastOpError();
    const result = withThrowingOp('difference', () =>
      FB.difference(squareGeom(0, 0, 10), squareGeom(5, 5, 10))
    );
    expect(result).toEqual([]);
    expect(FB.consumeLastOpError()?.op).toBe('difference');
  });

  test('a legitimately empty intersection is NOT recorded as a failure', () => {
    FB.consumeLastOpError();
    // Disjoint squares: intersection is genuinely empty — no error entry.
    const result = FB.intersection(squareGeom(0, 0, 10), squareGeom(100, 100, 10));
    expect(result).toEqual([]);
    expect(FB.consumeLastOpError()).toBeNull();
  });

  test('recomputeCompound falls back to un-combined child paths when the op throws', () => {
    const A = square('A', 0, 0, 40, 40);
    const B = square('B', 20, 20, 60, 60);
    const engine = fakeEngine(A, B);
    const id = PO.createCompound(engine, [A, B], 'unite', 'silhouette');
    expect(id).toBeTruthy();
    const compound = engine.layers.find((l) => l.id === id);

    // Sanity: the healthy compound produced geometry.
    expect(compound.paths.length).toBeGreaterThan(0);
    const healthyCount = compound.paths.length;

    // Force a recompute with a throwing op: must not throw, and the user's
    // geometry must stay visible (child paths, not an empty layer).
    compound.compound.cache.signature = null;
    compound.compound.cache.multiPolygon = null;
    withThrowingOp('union', () => {
      expect(() => PO.refreshAllCompounds(engine)).not.toThrow();
    });
    // The fallback is the raw child geometry, not an empty result.
    expect(compound.paths.length).toBe(A.paths.length + B.paths.length);

    // And a healthy recompute afterwards restores the real boolean result.
    compound.compound.cache.signature = null;
    compound.compound.cache.multiPolygon = null;
    PO.refreshAllCompounds(engine);
    expect(compound.paths.length).toBe(healthyCount);
  });
});
