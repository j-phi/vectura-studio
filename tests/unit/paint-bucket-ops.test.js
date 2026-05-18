/**
 * @vitest-environment jsdom
 *
 * Unit tests for src/core/paint-bucket-ops.js
 *
 * The ops module needs:
 *   - AlgorithmRegistry._polyContainsPoint (we stub a ray-cast)
 *   - AlgorithmRegistry._generatePatternFillPaths (stubbed to return a
 *     deterministic path so generateGeometryForLayer can be asserted)
 *   - Vectura.Layer (loaded from src/core/layer.js)
 */
const path = require('path');

beforeEach(() => {
  // Reset globals between tests so state doesn't leak. Layer/Layer ctor is
  // registered via an IIFE that only runs on first require, so we preserve it
  // across resets by re-attaching after wiping the Vectura bag.
  const priorLayer = globalThis.Vectura?.Layer;
  globalThis.Vectura = {
    SETTINGS: {
      pens: [{ id: 'pen-1', color: '#fff', width: 0.3 }],
      uiTheme: 'dark',
      strokeWidth: 0.3,
    },
    THEMES: { dark: { pen1Color: '#ffffff' } },
    ALGO_DEFAULTS: {
      shape: { seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      flowfield: { seed: 1 },
    },
  };
  if (priorLayer) globalThis.Vectura.Layer = priorLayer;
  // Point-in-polygon ray-cast — matches the pattern.js implementation.
  const polyContainsPoint = (poly, px, py) => {
    if (!Array.isArray(poly) || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect =
        ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };
  globalThis.Vectura.AlgorithmRegistry = {
    _polyContainsPoint: polyContainsPoint,
    // Stub returns one horizontal line through the region's centroid — enough
    // to assert generateGeometryForLayer produces non-empty geometry per fill.
    _generatePatternFillPaths: (fill) => {
      if (!fill || fill.fillType === 'none') return [];
      const region = fill.regions?.[0]?.outer || fill.region;
      if (!Array.isArray(region) || !region.length) return [];
      let minX = Infinity;
      let maxX = -Infinity;
      let sumY = 0;
      region.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        sumY += p.y;
      });
      const y = sumY / region.length;
      return [[{ x: minX, y }, { x: maxX, y }]];
    },
  };

  require(path.resolve(__dirname, '../../src/core/layer.js'));
  // Clear any prior module load so PaintBucketOps re-registers on the fresh Vectura bag.
  delete require.cache[path.resolve(__dirname, '../../src/core/paint-bucket-ops.js')];
  require(path.resolve(__dirname, '../../src/core/paint-bucket-ops.js'));
});

const closedRect = (minX, minY, maxX, maxY) => {
  const p = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY },
  ];
  p.meta = { kind: 'rect', closed: true };
  return p;
};

const makeLayer = (id, paths = [], { visible = true } = {}) => {
  const Layer = globalThis.Vectura.Layer;
  const layer = new Layer(id, 'shape', `shape-${id}`);
  layer.paths = paths;
  layer.displayPaths = paths;
  layer.visible = visible;
  layer.fills = [];
  return layer;
};

const fakeEngine = (...layers) => ({
  layers,
  docW: 297,
  docH: 210,
  getDisplayPaths: (layer) => layer.displayPaths || layer.paths || [],
  getActiveLayer() { return this.layers[0]; },
  computeAllDisplayGeometry: vi.fn(),
});

const fakeApp = () => ({ pushHistory: vi.fn(), render: vi.fn() });

describe('PaintBucketOps.findFillTargetStack', () => {
  it('returns ancestor chain sorted by ascending area across multiple layers', () => {
    // Outer square 100x100 on layer A, inner square 40x40 nested inside on layer B.
    const outer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    const inner = makeLayer('B', [closedRect(30, 30, 70, 70)]);
    const engine = fakeEngine(outer, inner);
    const { stack, includesDocBounds } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(engine, 50, 50);
    expect(stack.length).toBeGreaterThanOrEqual(2);
    // Inner (smallest) first, then outer, then doc-bounds.
    expect(stack[0].layer.id).toBe('B');
    expect(stack[1].layer.id).toBe('A');
    expect(stack[0].area).toBeLessThan(stack[1].area);
    expect(includesDocBounds).toBe(true);
    expect(stack[stack.length - 1].isDocBounds).toBe(true);
  });

  it('returns doc-bounds only when point is outside all closed paths', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 10, 10)]);
    const engine = fakeEngine(layer);
    const { stack, includesDocBounds } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(engine, 200, 200);
    expect(stack.length).toBe(1);
    expect(stack[0].isDocBounds).toBe(true);
    expect(includesDocBounds).toBe(true);
  });

  it('skips invisible layers', () => {
    const hidden = makeLayer('A', [closedRect(0, 0, 100, 100)], { visible: false });
    const engine = fakeEngine(hidden);
    const { stack } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(engine, 50, 50);
    // Only the doc-bounds entry — hidden layer is excluded.
    expect(stack.length).toBe(1);
    expect(stack[0].isDocBounds).toBe(true);
  });
});

describe('PaintBucketOps.applyFillAtPoint', () => {
  it('appends a fill record to the layer at the smallest enclosing region (scope 0)', () => {
    const outer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    const inner = makeLayer('B', [closedRect(30, 30, 70, 70)]);
    const engine = fakeEngine(outer, inner);
    const app = fakeApp();
    const result = globalThis.Vectura.PaintBucketOps.applyFillAtPoint(engine, app, 50, 50, {
      scopeIndex: 0,
      mode: 'pour',
      fillParams: { fillMode: 'hatch', fillDensity: 4, penId: 'pen-1' },
    });
    expect(result).toBeTruthy();
    expect(result.layerId).toBe('B');
    expect(inner.fills.length).toBe(1);
    expect(inner.fills[0].fillType).toBe('hatch');
    expect(inner.fills[0].density).toBe(4);
    expect(outer.fills.length).toBe(0);
    expect(app.pushHistory).toHaveBeenCalledTimes(1);
    expect(engine.computeAllDisplayGeometry).toHaveBeenCalledTimes(1);
  });

  it('uses the broader ancestor when scopeIndex > 0', () => {
    const outer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    const inner = makeLayer('B', [closedRect(30, 30, 70, 70)]);
    const engine = fakeEngine(outer, inner);
    const app = fakeApp();
    const result = globalThis.Vectura.PaintBucketOps.applyFillAtPoint(engine, app, 50, 50, {
      scopeIndex: 1,
      mode: 'pour',
      fillParams: { fillMode: 'hatch', fillDensity: 4, penId: 'pen-1' },
    });
    expect(result.layerId).toBe('A');
    expect(outer.fills.length).toBe(1);
    expect(inner.fills.length).toBe(0);
  });

  it('pours doc-bounds fill onto active layer when cursor is in empty space', () => {
    const active = makeLayer('A', []);
    const engine = fakeEngine(active);
    const app = fakeApp();
    const result = globalThis.Vectura.PaintBucketOps.applyFillAtPoint(engine, app, 200, 200, {
      scopeIndex: 0,
      mode: 'pour',
      fillParams: { fillMode: 'hatch', fillDensity: 4, penId: 'pen-1' },
    });
    expect(result).toBeTruthy();
    expect(active.fills.length).toBe(1);
    expect(active.fills[0].isDocBounds).toBe(true);
  });

  it('erase mode removes the topmost fill record at point', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      {
        id: 'f1', fillType: 'hatch', density: 4, penId: 'pen-1',
        region: closedRect(0, 0, 100, 100),
      },
    ];
    const engine = fakeEngine(layer);
    const app = fakeApp();
    const result = globalThis.Vectura.PaintBucketOps.applyFillAtPoint(engine, app, 50, 50, {
      scopeIndex: 0,
      mode: 'erase',
      fillParams: {},
    });
    expect(result).toBeTruthy();
    expect(result.mode).toBe('erase');
    expect(layer.fills.length).toBe(0);
    expect(app.pushHistory).toHaveBeenCalledTimes(1);
  });

  it('erase is a no-op when no fill record covers the point', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    const engine = fakeEngine(layer);
    const app = fakeApp();
    const result = globalThis.Vectura.PaintBucketOps.applyFillAtPoint(engine, app, 50, 50, {
      scopeIndex: 0,
      mode: 'erase',
      fillParams: {},
    });
    expect(result).toBeNull();
    expect(app.pushHistory).not.toHaveBeenCalled();
  });
});

describe('PaintBucketOps.findFillAtPoint', () => {
  it('returns the smallest fill record whose region contains the point', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      {
        id: 'wide', fillType: 'hatch', density: 4, penId: 'pen-1',
        region: closedRect(0, 0, 100, 100),
      },
      {
        id: 'narrow', fillType: 'stipple', density: 8, penId: 'pen-1',
        region: closedRect(30, 30, 70, 70),
      },
    ];
    const engine = fakeEngine(layer);
    const hit = globalThis.Vectura.PaintBucketOps.findFillAtPoint(engine, 50, 50);
    expect(hit).toBeTruthy();
    expect(hit.rec.id).toBe('narrow');
    expect(hit.layer.id).toBe('A');
  });

  it('returns null when no fill record covers the point', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [{
      id: 'f1', fillType: 'hatch', region: closedRect(0, 0, 50, 50),
    }];
    const engine = fakeEngine(layer);
    const hit = globalThis.Vectura.PaintBucketOps.findFillAtPoint(engine, 75, 75);
    expect(hit).toBeNull();
  });

  it('skips invisible layers', () => {
    const hidden = makeLayer('A', [closedRect(0, 0, 100, 100)], { visible: false });
    hidden.fills = [{ id: 'f1', fillType: 'hatch', region: closedRect(0, 0, 100, 100) }];
    const engine = fakeEngine(hidden);
    const hit = globalThis.Vectura.PaintBucketOps.findFillAtPoint(engine, 50, 50);
    expect(hit).toBeNull();
  });
});

describe('PaintBucketOps.generateGeometryForLayer', () => {
  it('produces geometry for each fill record', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      {
        id: 'f1', fillType: 'hatch', density: 4, penId: 'pen-1', angle: 0,
        region: closedRect(0, 0, 100, 100),
      },
      {
        id: 'f2', fillType: 'hatch', density: 4, penId: 'pen-1', angle: 0,
        region: closedRect(20, 20, 60, 60),
      },
    ];
    const paths = globalThis.Vectura.PaintBucketOps.generateGeometryForLayer(layer);
    expect(paths.length).toBe(2);
    expect(paths[0].length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty array when layer has no fills', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    const paths = globalThis.Vectura.PaintBucketOps.generateGeometryForLayer(layer);
    expect(paths).toEqual([]);
  });
});
