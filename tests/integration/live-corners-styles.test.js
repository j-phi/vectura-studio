/**
 * Live Corners parity — corner STYLES (Round / Inverted Round /
 * Chamfer) on both parametric shapes and freeform paths:
 *   - Option/Alt+click cycling (Round → Inverted Round → Chamfer → Round)
 *   - style-specific geometry (convex arc / concave vertex-centered arc /
 *     straight cut)
 *   - Up/Down arrow cycling mid-drag (cycleActiveCornerDragType)
 *   - Corners dialog read/apply (getCornerDialogState / applyCornerDialogEdit)
 *   - serialization round-trip of shape.cornerTypes and anchor.cornerType
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Live Corners styles (round / invert / chamfer)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => runtime.cleanup());

  // ── Parametric rect helpers ────────────────────────────────────────────────
  function makeRect(renderer, engine, Layer, shapeExtra = {}) {
    const shape = { type: 'rect', x1: 0, y1: 0, x2: 100, y2: 100, cornerRadii: [0, 0, 0, 0], ...shapeExtra };
    const layer = new Layer('lc-rect', 'shape', 'Rect');
    layer.sourcePaths = [renderer.buildShapePath(shape)];
    layer.params = { curves: false, smoothing: 0, simplify: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    engine.layers.push(layer);
    engine.generate(layer.id);
    return layer;
  }

  function setupShape(shapeExtra = {}) {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const renderer = new Renderer('main-canvas', engine);
    const layer = makeRect(renderer, engine, Layer, shapeExtra);
    renderer.setSelection([layer.id], layer.id);
    renderer.setTool('direct');
    renderer.setDirectSelection(layer, 0);
    return { renderer, engine, layer };
  }

  const shapeOf = (renderer, layer) => renderer.getShapeMetaForLayer(layer, 0).shape;

  // ── Freeform helpers ───────────────────────────────────────────────────────
  function makeSquarePath() {
    const anchors = [
      { x: 0, y: 0, in: null, out: null },
      { x: 100, y: 0, in: null, out: null },
      { x: 100, y: 100, in: null, out: null },
      { x: 0, y: 100, in: null, out: null },
    ];
    const path = anchors.map((p) => ({ x: p.x, y: p.y }));
    path.push({ x: 0, y: 0 });
    path.meta = { kind: 'poly', closed: true, anchors };
    return path;
  }

  function setupFreeform() {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('lc-free', 'shape', 'Square');
    layer.sourcePaths = [makeSquarePath()];
    layer.params = { curves: false, smoothing: 0, simplify: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    engine.layers.push(layer);
    engine.generate(layer.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setSelection([layer.id], layer.id);
    renderer.setTool('direct');
    renderer.setDirectSelection(layer, 0);
    return { renderer, engine, layer };
  }

  // ── Alt+click cycling (shape) ─────────────────────────────────────────────
  test('cycleShapeCornerType cycles Round → Inverted Round → Chamfer → Round on one corner', () => {
    const { renderer, layer } = setupShape();
    renderer.cycleShapeCornerType(layer, 0, { index: 0 }, 'single');
    expect(shapeOf(renderer, layer).cornerTypes[0]).toBe('invert');
    renderer.cycleShapeCornerType(layer, 0, { index: 0 }, 'single');
    expect(shapeOf(renderer, layer).cornerTypes[0]).toBe('chamfer');
    renderer.cycleShapeCornerType(layer, 0, { index: 0 }, 'single');
    expect(shapeOf(renderer, layer).cornerTypes[0]).toBe('round');
    // Other corners untouched.
    expect(shapeOf(renderer, layer).cornerTypes.slice(1)).toEqual(['round', 'round', 'round']);
  });

  test('cycleShapeCornerType with a multi-corner selection switches the whole set', () => {
    const { renderer, layer } = setupShape();
    renderer.directSelection.selectedIndices = new Set([0, 2]);
    const cornerSet = renderer._selectedCornerIndices(shapeOf(renderer, layer));
    renderer.cycleShapeCornerType(layer, 0, { index: 0 }, 'selected', cornerSet);
    const types = shapeOf(renderer, layer).cornerTypes;
    expect(types[0]).toBe('invert');
    expect(types[2]).toBe('invert');
    expect(types[1]).toBe('round');
    expect(types[3]).toBe('round');
  });

  // ── Style geometry (shape) ────────────────────────────────────────────────
  test('chamfer corner builds a straight cut (no bezier handles)', () => {
    const { renderer } = setupShape({ cornerRadii: [20, 0, 0, 0], cornerTypes: ['chamfer', 'round', 'round', 'round'] });
    const anchors = renderer.directSelection.anchors;
    // Rounded corner 0 splits into a setback pair; chamfer pair carries no
    // handles on the cut segment.
    expect(anchors.length).toBe(5);
    const start = anchors[0];
    const end = anchors[1];
    expect(start.out).toBeNull();
    expect(end.in).toBeNull();
    // Setback points sit 20px along each edge from the (0,0) vertex.
    expect(Math.min(start.x + start.y, end.x + end.y)).toBeCloseTo(20, 3);
  });

  test('inverted round corner bulges toward the shape interior (vertex-centered arc)', () => {
    const invert = setupShape({ cornerRadii: [20, 0, 0, 0], cornerTypes: ['invert', 'round', 'round', 'round'] });
    const round = setupShape({ cornerRadii: [20, 0, 0, 0] });
    const iAnchors = invert.renderer.directSelection.anchors;
    const rAnchors = round.renderer.directSelection.anchors;
    // Both split corner 0 into a pair with the same setback endpoints.
    expect(iAnchors.length).toBe(5);
    expect(rAnchors.length).toBe(5);
    const iStart = iAnchors[0];
    const rStart = rAnchors[0];
    expect(iStart.x).toBeCloseTo(rStart.x, 3);
    expect(iStart.y).toBeCloseTo(rStart.y, 3);
    // Round: the out-handle runs along the edge (x stays 0). Invert: the
    // handle turns perpendicular to the vertex spoke, into the shape (x > 5).
    expect(Math.abs(rStart.out.x - rStart.x)).toBeLessThan(1e-6);
    expect(iStart.out.x - iStart.x).toBeGreaterThan(5);
  });

  // ── Mid-drag arrow-key style cycling ──────────────────────────────────────
  test('cycleActiveCornerDragType switches the style during a shape corner drag', () => {
    const { renderer, layer } = setupShape();
    const handles = renderer.getShapeCornerHandles(layer, 0);
    renderer.beginShapeCornerDrag(layer, 0, handles[0], 'single');
    renderer.updateShapeCornerDrag(renderer.transformShapeSourcePoint({ x: 20, y: 20 }, layer, null));
    expect(renderer.isCornerDragActive()).toBe(true);
    // Round → Inverted Round.
    expect(renderer.cycleActiveCornerDragType(1)).toBe(true);
    expect(shapeOf(renderer, layer).cornerTypes[0]).toBe('invert');
    // Down arrow (step -1): back to Round.
    expect(renderer.cycleActiveCornerDragType(-1)).toBe(true);
    expect(shapeOf(renderer, layer).cornerTypes[0]).toBe('round');
    renderer.endShapeCornerDrag();
    expect(renderer.isCornerDragActive()).toBe(false);
  });

  test('cycleActiveCornerDragType re-applies the in-progress freeform radius with the new style', () => {
    const { renderer } = setupFreeform();
    const handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    expect(renderer.beginFreeformCornerDrag(handle)).toBe(true);
    renderer.updateFreeformCornerDrag({ x: 15, y: 15 });
    // Round bake: the corner pair's connecting segment is curved.
    let anchors = renderer.directSelection.anchors;
    expect(anchors.length).toBe(5);
    expect(anchors[0].out).not.toBeNull();
    // Round → Inverted Round → Chamfer while still dragging.
    renderer.cycleActiveCornerDragType(1);
    renderer.cycleActiveCornerDragType(1);
    anchors = renderer.directSelection.anchors;
    expect(renderer.freeformCornerDrag.cornerType).toBe('chamfer');
    expect(anchors.length).toBe(5);
    expect(anchors[0].out).toBeNull();
    expect(anchors[1].in).toBeNull();
    renderer.endFreeformCornerDrag();
  });

  // ── Freeform style storage + drag geometry ────────────────────────────────
  test('cycleFreeformCornerType stores the style on the anchor and the next drag uses it', () => {
    const { renderer, layer } = setupFreeform();
    let handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    // Alt+click twice: round → invert → chamfer.
    renderer.cycleFreeformCornerType(handle);
    handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    expect(handle.cornerType).toBe('invert');
    renderer.cycleFreeformCornerType(handle);
    handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    expect(handle.cornerType).toBe('chamfer');
    // Persisted through applyDirectPath into the layer's path meta.
    expect(layer.sourcePaths[0].meta.anchors[0].cornerType).toBe('chamfer');
    // A widget drag now cuts a straight chamfer.
    expect(renderer.beginFreeformCornerDrag(handle)).toBe(true);
    renderer.updateFreeformCornerDrag({ x: 15, y: 15 });
    const anchors = renderer.directSelection.anchors;
    expect(anchors.length).toBe(5);
    expect(anchors[0].out).toBeNull();
    expect(anchors[1].in).toBeNull();
    renderer.endFreeformCornerDrag();
  });

  test('freeform inverted round drag produces a concave, vertex-centered arc', () => {
    const { renderer } = setupFreeform();
    let handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    renderer.cycleFreeformCornerType(handle); // round → invert
    handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    expect(renderer.beginFreeformCornerDrag(handle)).toBe(true);
    renderer.updateFreeformCornerDrag({ x: 15, y: 15 });
    const anchors = renderer.directSelection.anchors;
    expect(anchors.length).toBe(5);
    const start = anchors[0];
    const end = anchors[1];
    // Setback points straddle the (0,0) vertex on the two edges.
    const setback = Math.max(start.x, start.y);
    expect(setback).toBeGreaterThan(1);
    // The out-handle turns into the shape (perpendicular to the vertex spoke)
    // instead of running along the edge toward the vertex.
    const spokeAxis = start.x < start.y ? 'x' : 'y'; // start lies on one edge
    expect(Math.abs(start.out[spokeAxis] - start[spokeAxis])).toBeGreaterThan(1);
    // Midpoint of the corner cubic stays ~setback distance from the vertex
    // (vertex-centered arc), unlike round whose midpoint pulls well inside.
    const mid = cubicPoint(start, end, 0.5);
    const midDist = Math.hypot(mid.x, mid.y);
    expect(midDist).toBeGreaterThan(setback * 0.9);
    renderer.endFreeformCornerDrag();
  });

  function cubicPoint(a, b, t) {
    const p0 = { x: a.x, y: a.y };
    const c1 = a.out || p0;
    const p3 = { x: b.x, y: b.y };
    const c2 = b.in || p3;
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
    };
  }

  // ── Corners dialog plumbing ───────────────────────────────────────────────
  test('getCornerDialogState + applyCornerDialogEdit set radius and style as one edit', () => {
    const { renderer, layer } = setupShape();
    const payload = { kind: 'shape', layerId: layer.id, pathIndex: 0, cornerIndex: 1, scope: 'single', cornerSet: [] };
    const before = renderer.getCornerDialogState(payload);
    expect(before.radius).toBe(0);
    expect(before.cornerType).toBe('round');
    expect(renderer.applyCornerDialogEdit(payload, { radius: 25, cornerType: 'chamfer' })).toBe(true);
    const after = renderer.getCornerDialogState(payload);
    expect(after.radius).toBeCloseTo(25, 3);
    expect(after.cornerType).toBe('chamfer');
    const shape = shapeOf(renderer, layer);
    expect(shape.cornerRadii[1]).toBeCloseTo(25, 3);
    expect(shape.cornerTypes[1]).toBe('chamfer');
    // Untouched corners keep defaults.
    expect(shape.cornerRadii[0]).toBe(0);
    expect(shape.cornerTypes[0]).toBe('round');
  });

  test('freeform dialog edit with radius bakes the corner like a widget drag', () => {
    const { renderer } = setupFreeform();
    const payload = { kind: 'freeform', layerId: renderer.directSelection.layerId, pathIndex: 0, anchorIndex: 0 };
    expect(renderer.applyCornerDialogEdit(payload, { radius: 12, cornerType: 'chamfer' })).toBe(true);
    const anchors = renderer.directSelection.anchors;
    expect(anchors.length).toBe(5);
    expect(anchors[0].out).toBeNull();
    expect(anchors[1].in).toBeNull();
  });

  // ── Serialization ─────────────────────────────────────────────────────────
  test('shape cornerTypes and freeform anchor cornerType survive serialize/deserialize', () => {
    const { renderer, engine, layer } = setupShape({ cornerRadii: [10, 0, 0, 0], cornerTypes: ['chamfer', 'round', 'round', 'round'] });
    const free = setupFreeform();
    const handle = free.renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    free.renderer.cycleFreeformCornerType(handle); // stores 'invert' on the anchor

    const shapeDoc = JSON.parse(JSON.stringify(engine.exportState()));
    const freeDoc = JSON.parse(JSON.stringify(free.engine.exportState()));

    const { VectorEngine } = runtime.window.Vectura;
    const engine2 = new VectorEngine();
    engine2.importState(shapeDoc);
    const shape2 = engine2.layers.find((l) => l.id === layer.id).sourcePaths[0].meta.shape;
    expect(shape2.cornerTypes[0]).toBe('chamfer');
    expect(shape2.cornerRadii[0]).toBe(10);

    const engine3 = new VectorEngine();
    engine3.importState(freeDoc);
    const anchors3 = engine3.layers.find((l) => l.id === 'lc-free').sourcePaths[0].meta.anchors;
    expect(anchors3[0].cornerType).toBe('invert');
  });

  // ── Regression: dialog edit on a multi-corner selection (Array cornerSet) ──
  test('applyCornerDialogEdit with scope "selected" and an Array cornerSet does not crash', () => {
    const { renderer, layer } = setupShape();
    renderer.directSelection.selectedIndices = new Set([0, 2]);
    // Dialog payloads serialize the corner set as a plain Array.
    const payload = { kind: 'shape', layerId: layer.id, pathIndex: 0, cornerIndex: 0, scope: 'selected', cornerSet: [0, 2] };
    expect(renderer.applyCornerDialogEdit(payload, { radius: 15, cornerType: 'invert' })).toBe(true);
    const shape = shapeOf(renderer, layer);
    expect(shape.cornerRadii[0]).toBeCloseTo(15, 3);
    expect(shape.cornerRadii[2]).toBeCloseTo(15, 3);
    expect(shape.cornerTypes[0]).toBe('invert');
    expect(shape.cornerTypes[2]).toBe('invert');
    expect(shape.cornerRadii[1]).toBe(0);
  });

  // ── Regression: arrow-cycle before the first pointer move must persist ────
  test('cycleActiveCornerDragType before any pointer move still reaches the live shape', () => {
    const { renderer, layer } = setupShape();
    const handles = renderer.getShapeCornerHandles(layer, 0);
    renderer.beginShapeCornerDrag(layer, 0, handles[0], 'single');
    // No updateShapeCornerDrag yet — press ArrowUp immediately.
    expect(renderer.cycleActiveCornerDragType(1)).toBe(true);
    renderer.endShapeCornerDrag();
    expect(shapeOf(renderer, layer).cornerTypes[0]).toBe('invert');
  });

  // ── Freeform Live Corners stay live (widget survives the bake) ────────────
  test('a baked freeform corner keeps its widget and can be re-dragged from its current radius', () => {
    const { renderer } = setupFreeform();
    let handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    expect(renderer.beginFreeformCornerDrag(handle, handle.worldPoint)).toBe(true);
    renderer.updateFreeformCornerDrag({
      x: handle.worldPoint.x + handle.sourceInward.x * 5,
      y: handle.worldPoint.y + handle.sourceInward.y * 5,
    });
    const firstRadius = renderer.freeformCornerDrag.currentRadius;
    expect(firstRadius).toBeGreaterThan(1);
    renderer.endFreeformCornerDrag();
    expect(renderer.directSelection.anchors).toHaveLength(5);

    // The widget survives the bake, reporting the applied radius and style.
    const baked = renderer._getFreeformCornerHandles().find((h) => h.baked);
    expect(baked).toBeTruthy();
    expect(baked.radius).toBeCloseTo(firstRadius, 4);
    expect(baked.cornerType).toBe('round');
    expect(baked.sourceVertex.x).toBeCloseTo(0, 6);
    expect(baked.sourceVertex.y).toBeCloseTo(0, 6);

    // Re-drag continues from the current radius — dragging further inward
    // grows it; the pair count stays 5 (no double-split).
    expect(renderer.beginFreeformCornerDrag(baked, baked.worldPoint)).toBe(true);
    expect(renderer.freeformCornerDrag.startRadius).toBeCloseTo(firstRadius, 4);
    renderer.updateFreeformCornerDrag({
      x: baked.worldPoint.x + baked.sourceInward.x * 4,
      y: baked.worldPoint.y + baked.sourceInward.y * 4,
    });
    expect(renderer.freeformCornerDrag.currentRadius).toBeGreaterThan(firstRadius);
    renderer.endFreeformCornerDrag();
    expect(renderer.directSelection.anchors).toHaveLength(5);
  });

  test('Alt+click on a baked freeform corner switches style but keeps its radius', () => {
    const { renderer } = setupFreeform();
    let handle = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    renderer.beginFreeformCornerDrag(handle, handle.worldPoint);
    renderer.updateFreeformCornerDrag({
      x: handle.worldPoint.x + handle.sourceInward.x * 5,
      y: handle.worldPoint.y + handle.sourceInward.y * 5,
    });
    const radius = renderer.freeformCornerDrag.currentRadius;
    renderer.endFreeformCornerDrag();

    let baked = renderer._getFreeformCornerHandles().find((h) => h.baked);
    expect(renderer.cycleFreeformCornerType(baked)).toBe(true); // round → invert
    baked = renderer._getFreeformCornerHandles().find((h) => h.baked);
    expect(baked.cornerType).toBe('invert');
    expect(baked.radius).toBeCloseTo(radius, 4);
    // Geometry is now the concave variant: the cut segment's out-handle turns
    // into the shape instead of running along the edge.
    const start = renderer.directSelection.anchors[0];
    expect(Math.abs(start.out.x - start.x) > 1 || Math.abs(start.out.y - start.y) > 1).toBe(true);
  });

  test('dialog radius-only edit on a freeform corner preserves each corner\'s own style', () => {
    const { renderer } = setupFreeform();
    // Corner 0 → chamfer, corner 2 stays round; select both.
    let h0 = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    renderer.cycleFreeformCornerType(h0); // invert
    h0 = renderer._getFreeformCornerHandles().find((h) => h.anchorIndex === 0);
    renderer.cycleFreeformCornerType(h0); // chamfer
    renderer.directSelection.selectedIndices = new Set([0, 2]);
    const payload = { kind: 'freeform', layerId: renderer.directSelection.layerId, pathIndex: 0, vertex: { x: 0, y: 0 } };
    expect(renderer.applyCornerDialogEdit(payload, { radius: 12 })).toBe(true);
    // Both corners baked at 12, each with its own style.
    const bakedHandles = renderer._getFreeformCornerHandles().filter((h) => h.baked);
    expect(bakedHandles).toHaveLength(2);
    const types = bakedHandles.map((h) => h.cornerType).sort();
    expect(types).toEqual(['chamfer', 'round']);
  });

  // ── Tooltip format (video-parity readout, in document units) ─────────────
  test('chamfer drag reports the radius as "R: … mm" in document units', () => {
    const { renderer, layer } = setupShape({ cornerTypes: ['chamfer', 'chamfer', 'chamfer', 'chamfer'] });
    const handles = renderer.getShapeCornerHandles(layer, 0);
    renderer._dragCursorPos = { x: 10, y: 10 };
    renderer.beginShapeCornerDrag(layer, 0, handles[0], 'single');
    renderer.updateShapeCornerDrag(renderer.transformShapeSourcePoint({ x: 18, y: 18 }, layer, null));
    expect(renderer.lastTooltipText).toMatch(/^R: \d+(\.\d+)? mm$/);
    renderer.endShapeCornerDrag();
  });
});
