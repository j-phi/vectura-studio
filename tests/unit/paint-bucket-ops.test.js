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

  it('auto-creates a Background shape layer when pouring on empty document (no layers)', () => {
    // Engine with zero layers — no existing target for the fill.
    const engine = {
      layers: [],
      docW: 297,
      docH: 210,
      _layerCounter: 0,
      getDisplayPaths: () => [],
      getActiveLayer() { return null; },
      computeAllDisplayGeometry: vi.fn(),
    };
    const app = fakeApp();
    const result = globalThis.Vectura.PaintBucketOps.applyFillAtPoint(engine, app, 50, 50, {
      scopeIndex: 0,
      mode: 'pour',
      fillParams: { fillMode: 'hatch', fillDensity: 4, penId: 'pen-1' },
    });
    expect(result).toBeTruthy();
    expect(result.mode).toBe('pour');
    expect(engine.layers.length).toBe(1);
    const bg = engine.layers[0];
    expect(bg.type).toBe('shape');
    expect(bg.isGroup).toBe(false);
    expect(bg.name).toBe('Background');
    expect(bg.fills.length).toBe(1);
    expect(bg.fills[0].isDocBounds).toBe(true);
    expect(engine.activeLayerId).toBe(bg.id);
    // History was pushed once for the synthetic layer creation; the fill push
    // itself shouldn't double-push.
    expect(app.pushHistory).toHaveBeenCalledTimes(1);
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

describe('PaintBucketOps.expandFill', () => {
  const buildFillRec = (id, region, opts = {}) => ({
    id,
    fillType: opts.fillType ?? 'hatch',
    density: opts.density ?? 4,
    angle: 0,
    amplitude: 1,
    penId: opts.penId ?? 'pen-1',
    region,
  });

  const expandableEngine = (...layers) => ({
    layers,
    docW: 297,
    docH: 210,
    _layerCounter: 0,
    getDisplayPaths: (layer) => layer.displayPaths || layer.paths || [],
    getActiveLayer() { return this.layers[0]; },
    computeAllDisplayGeometry: vi.fn(),
    setActiveLayerId(id) { this.activeLayerId = id; },
  });

  it('returns null when layer has no fills', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    expect(result).toBeNull();
    // No structural mutation.
    expect(engine.layers.length).toBe(1);
    expect(engine.layers[0]).toBe(layer);
  });

  it('produces a group with N+1 children for N fill records', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      buildFillRec('f1', closedRect(10, 10, 30, 30)),
      buildFillRec('f2', closedRect(40, 40, 60, 60)),
      buildFillRec('f3', closedRect(70, 70, 90, 90)),
    ];
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    expect(result).toBeTruthy();
    expect(result.groupId).toBeDefined();
    expect(result.fillLayerIds.length).toBe(3);

    // 1 group + 1 parent + 3 fills = 5 total.
    expect(engine.layers.length).toBe(5);

    const group = engine.layers.find((l) => l.id === result.groupId);
    expect(group.isGroup).toBe(true);
    expect(group.groupType).toBe('paintfill');
    expect(group.parentId).toBeNull();

    const children = engine.layers.filter((l) => l.parentId === group.id);
    expect(children.length).toBe(4); // parent + 3 fills
  });

  it('preserves original layer id; group gets a new id', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [buildFillRec('f1', closedRect(10, 10, 30, 30))];
    const engine = expandableEngine(layer);
    const originalId = layer.id;
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    expect(result.groupId).not.toBe(originalId);
    expect(layer.id).toBe(originalId);
    expect(layer.parentId).toBe(result.groupId);
  });

  it('clears layer.fills[] after expand', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      buildFillRec('f1', closedRect(10, 10, 30, 30)),
      buildFillRec('f2', closedRect(40, 40, 60, 60)),
    ];
    const engine = expandableEngine(layer);
    globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    expect(layer.fills).toEqual([]);
  });

  it('places parent first child, fills after in engine.layers (panel-top→bottom)', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      buildFillRec('f1', closedRect(10, 10, 30, 30)),
      buildFillRec('f2', closedRect(40, 40, 60, 60)),
      buildFillRec('f3', closedRect(70, 70, 90, 90)),
    ];
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);

    // Expected: [group, parent, fill1, fill2, fill3]
    expect(engine.layers[0].id).toBe(result.groupId);
    expect(engine.layers[1].id).toBe(layer.id);
    expect(engine.layers[2].id).toBe(result.fillLayerIds[0]);
    expect(engine.layers[3].id).toBe(result.fillLayerIds[1]);
    expect(engine.layers[4].id).toBe(result.fillLayerIds[2]);
  });

  it('inserts the group at the original layer index when there are other layers', () => {
    const top = makeLayer('T', [closedRect(0, 0, 10, 10)]);
    const middle = makeLayer('M', [closedRect(0, 0, 100, 100)]);
    middle.fills = [buildFillRec('f1', closedRect(20, 20, 80, 80))];
    const bottom = makeLayer('B', [closedRect(0, 0, 200, 200)]);
    const engine = expandableEngine(top, middle, bottom);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, middle);

    // Original layout: [T, M, B]; M is at index 1.
    // After: [T, group, M, fill, B] — group sits where M was.
    expect(engine.layers[0].id).toBe('T');
    expect(engine.layers[1].id).toBe(result.groupId);
    expect(engine.layers[2].id).toBe('M');
    expect(engine.layers[3].id).toBe(result.fillLayerIds[0]);
    expect(engine.layers[4].id).toBe('B');
  });

  it('fill children are type=shape with paths from generateGeometryForLayer', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      buildFillRec('f1', closedRect(10, 10, 30, 30), { fillType: 'hatch' }),
      buildFillRec('f2', closedRect(40, 40, 60, 60), { fillType: 'stipple' }),
    ];
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    result.fillLayerIds.forEach((id) => {
      const child = engine.layers.find((l) => l.id === id);
      expect(child.type).toBe('shape');
      expect(child.isGroup).toBe(false);
      expect(child.paths.length).toBeGreaterThan(0);
    });
  });

  it('fill children carry penId from source fill record', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      buildFillRec('f1', closedRect(10, 10, 30, 30), { penId: 'pen-1' }),
    ];
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    const child = engine.layers.find((l) => l.id === result.fillLayerIds[0]);
    expect(child.penId).toBe('pen-1');
  });

  it('fill children carry sourceFillRecord metadata', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    const rec = buildFillRec('f1', closedRect(10, 10, 30, 30), { fillType: 'stipple', density: 8 });
    layer.fills = [rec];
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    const child = engine.layers.find((l) => l.id === result.fillLayerIds[0]);
    expect(child.sourceFillRecord).toBeTruthy();
    expect(child.sourceFillRecord.id).toBe('f1');
    expect(child.sourceFillRecord.fillType).toBe('stipple');
    expect(child.sourceFillRecord.density).toBe(8);
    // Defensive copy — mutating the original record shouldn't leak.
    expect(child.sourceFillRecord).not.toBe(rec);
  });

  it('moves modifier from original parent to group', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [buildFillRec('f1', closedRect(10, 10, 30, 30))];
    const modifier = { kind: 'mirror', enabled: true };
    layer.modifier = modifier;
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    const group = engine.layers.find((l) => l.id === result.groupId);
    expect(group.modifier).toBe(modifier);
    expect(layer.modifier).toBeNull();
  });

  it('skips empty-region fills (records that produce 0 paths)', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [
      buildFillRec('f1', closedRect(10, 10, 30, 30)),
      // fillType 'none' → generator returns 0 paths.
      buildFillRec('f2', closedRect(40, 40, 60, 60), { fillType: 'none' }),
    ];
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    expect(result.fillLayerIds.length).toBe(1);
    // 1 group + 1 parent + 1 fill = 3 total.
    expect(engine.layers.length).toBe(3);
  });

  it('handles nested parents: new group inherits parentId of the original', () => {
    const outerGroup = makeLayer('G1', []);
    outerGroup.isGroup = true;
    outerGroup.groupType = 'pathfinder';
    const inner = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    inner.parentId = outerGroup.id;
    inner.fills = [buildFillRec('f1', closedRect(10, 10, 30, 30))];
    const engine = expandableEngine(outerGroup, inner);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, inner);
    const group = engine.layers.find((l) => l.id === result.groupId);
    expect(group.parentId).toBe(outerGroup.id);
    expect(inner.parentId).toBe(group.id);
  });

  it('triggers computeAllDisplayGeometry to refresh display', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [buildFillRec('f1', closedRect(10, 10, 30, 30))];
    const engine = expandableEngine(layer);
    globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    expect(engine.computeAllDisplayGeometry).toHaveBeenCalled();
  });

  it('refuses to expand a group layer (no fills semantics on containers)', () => {
    const grp = makeLayer('G', []);
    grp.isGroup = true;
    grp.fills = [{ id: 'f1', fillType: 'hatch', region: closedRect(0, 0, 100, 100) }];
    const engine = expandableEngine(grp);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, grp);
    expect(result).toBeNull();
    expect(engine.layers.length).toBe(1);
  });

  it('sets the group active after expand', () => {
    const layer = makeLayer('A', [closedRect(0, 0, 100, 100)]);
    layer.fills = [buildFillRec('f1', closedRect(10, 10, 30, 30))];
    const engine = expandableEngine(layer);
    const result = globalThis.Vectura.PaintBucketOps.expandFill(engine, layer);
    expect(engine.activeLayerId).toBe(result.groupId);
  });
});

describe('PaintBucketOps.translateLayerFills', () => {
  // Regression: filling a shape and then moving it must keep the fill registered
  // with the shape. Fill regions live in absolute world coords, so move/resize/
  // rotate of the owning layer has to transform them in lockstep — otherwise
  // the fill stays at the original world location while the shape walks away.
  it('translates every fill region (and innerRegion) by the same delta', () => {
    const layer = makeLayer('A', []);
    layer.fills = [
      { id: 'f1', region: closedRect(10, 10, 30, 30), innerRegion: closedRect(15, 15, 25, 25) },
      { id: 'f2', region: closedRect(40, 40, 80, 80), innerRegion: null },
    ];
    globalThis.Vectura.PaintBucketOps.translateLayerFills(layer, 100, -25);
    expect(layer.fills[0].region[0]).toEqual({ x: 110, y: -15 });
    expect(layer.fills[0].region[2]).toEqual({ x: 130, y: 5 });
    expect(layer.fills[0].innerRegion[0]).toEqual({ x: 115, y: -10 });
    expect(layer.fills[1].region[0]).toEqual({ x: 140, y: 15 });
    expect(layer.fills[1].innerRegion).toBeNull();
  });

  it('is a no-op when delta is zero or layer has no fills', () => {
    const empty = makeLayer('A', []);
    empty.fills = [];
    expect(() => globalThis.Vectura.PaintBucketOps.translateLayerFills(empty, 5, 5)).not.toThrow();

    const layer = makeLayer('B', []);
    layer.fills = [{ id: 'f1', region: closedRect(0, 0, 10, 10), innerRegion: null }];
    const before = JSON.stringify(layer.fills[0].region);
    globalThis.Vectura.PaintBucketOps.translateLayerFills(layer, 0, 0);
    expect(JSON.stringify(layer.fills[0].region)).toBe(before);
  });
});

describe('PaintBucketOps.transformLayerFills', () => {
  it('scales fill regions about a world-space origin', () => {
    const layer = makeLayer('A', []);
    layer.fills = [{ id: 'f1', region: closedRect(10, 10, 30, 30), innerRegion: null }];
    globalThis.Vectura.PaintBucketOps.transformLayerFills(layer, {
      dx: 0, dy: 0, scaleX: 2, scaleY: 2, origin: { x: 20, y: 20 },
    });
    // (10,10) about (20,20) at 2x → (0,0); (30,30) → (40,40).
    expect(layer.fills[0].region[0]).toEqual({ x: 0, y: 0 });
    expect(layer.fills[0].region[2]).toEqual({ x: 40, y: 40 });
  });

  it('rotates fill regions about a world-space origin', () => {
    const layer = makeLayer('A', []);
    layer.fills = [{ id: 'f1', region: [{ x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }], innerRegion: null }];
    globalThis.Vectura.PaintBucketOps.transformLayerFills(layer, {
      dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 }, rotation: 90,
    });
    // (10,0) rotated 90° about origin → (0,10).
    const p = layer.fills[0].region[0];
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(10, 6);
  });
});
