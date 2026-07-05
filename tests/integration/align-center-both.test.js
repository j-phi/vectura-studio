/**
 * MSC-2 — Horizontal & Vertical Align Center (concentric snap).
 *
 * Verify-first finding: src/core/align-ops.js exposed separate alignCenterH /
 * alignCenterV ops but NO combined center-both op — so a single click could
 * only center one axis. MSC-2 adds `alignCenterBoth`, a compound op whose
 * delta map moves each layer on BOTH axes, so ONE apply inside ONE pushHistory
 * bracket (as the align surfaces already do) makes the selection concentric in
 * a single undo step.
 *
 * This exercises the op through the real engine apply path (the byte-identical
 * path the docked Align panel + Task Bar align flyout use: pushHistory →
 * engine.applyAlignDeltas), asserting concentricity and one-undo-step.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('MSC-2 — combined center-both align', () => {
  let runtime, window, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const AO = () => window.Vectura.AlignOps;

  function addTwoLayers(aPos, bPos) {
    app.engine.layers = [];
    const aId = app.engine.addLayer('wavetable');
    const bId = app.engine.addLayer('wavetable');
    const a = app.engine.layers.find((l) => l.id === aId);
    const b = app.engine.layers.find((l) => l.id === bId);
    Object.assign(a.params, { posX: aPos.x, posY: aPos.y, scaleX: 1, scaleY: 1, rotation: 0 });
    Object.assign(b.params, { posX: bPos.x, posY: bPos.y, scaleX: 1, scaleY: 1, rotation: 0 });
    app.engine.generate(a.id);
    app.engine.generate(b.id);
    app.engine.computeAllDisplayGeometry();
    return { a, b };
  }

  const centerOf = (layer) => {
    const rect = AO().worldRectFromBounds(app.renderer.getLayerBounds(layer));
    return rect ? { cx: rect.centerX, cy: rect.centerY } : null;
  };

  test('alignCenterBoth is a registered op', () => {
    expect(AO()._internal.ALIGN_OPS.alignCenterBoth).toBeTypeOf('function');
  });

  test('two shapes become concentric in one action, one undo step', () => {
    const { a, b } = addTwoLayers({ x: -40, y: -20 }, { x: 30, y: 25 });
    app.renderer.setSelection([a.id, b.id], a.id);

    // Not concentric to start.
    const beforeA = centerOf(a);
    const beforeB = centerOf(b);
    expect(Math.abs(beforeA.cx - beforeB.cx) + Math.abs(beforeA.cy - beforeB.cy)).toBeGreaterThan(1);

    const boundsFor = (layer) => app.renderer.getLayerBounds(layer);
    const layers = [a, b];
    const deltas = AO().align('alignCenterBoth', layers, boundsFor, { mode: 'selection' });

    // Delta map moves BOTH axes for at least one layer (proves compound, not
    // single-axis).
    const movesBothAxes = Object.values(deltas).some((d) => d.dx !== 0 && d.dy !== 0);
    expect(movesBothAxes).toBe(true);

    // Seed a baseline history entry so undo has a prior state to return to
    // (the headless harness starts with an empty history stack).
    app.pushHistory();

    // One action = one history push around one apply.
    const before = app.history.length;
    app.pushHistory();
    app.engine.applyAlignDeltas(deltas);
    expect(app.history.length).toBe(before + 1);

    // Concentric afterward.
    const afterA = centerOf(a);
    const afterB = centerOf(b);
    expect(afterA.cx).toBeCloseTo(afterB.cx, 3);
    expect(afterA.cy).toBeCloseTo(afterB.cy, 3);

    // Undo restores both positions (single step). applyState() deserializes
    // fresh layer objects, so re-fetch by id rather than trusting stale refs.
    app.undo();
    const aBack = app.engine.getLayerById(a.id);
    const bBack = app.engine.getLayerById(b.id);
    expect(aBack.params.posX).toBeCloseTo(-40, 6);
    expect(bBack.params.posX).toBeCloseTo(30, 6);
  });
});
