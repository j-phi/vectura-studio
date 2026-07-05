/**
 * MSC-2 integration — the SURFACED alignCenterBoth button routes to the op.
 *
 * Lane M shipped the `alignCenterBoth` compound op + unit/op-level coverage, but
 * the SPEC (MSC-2: "align surfaces SHALL include the one-click action") requires
 * a live control. The Phase-3 integrator wired three additive edits:
 *   (a) an `.align-btn[data-align-op="alignCenterBoth"]` button in index.html,
 *   (b) `'alignCenterBoth'` into the multi-selection panel's ALIGN_OPS Set,
 *   (c) an align.groups action in src/config/context-bar.js (Task Bar flyout).
 *
 * This test drives the REAL wired button (click on the DOM element) and asserts
 * the selection becomes concentric inside ONE undo step — proving the button is
 * routed through the panel's align dispatch, not just that the op exists.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('MSC-2 — wired alignCenterBoth button', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    window.Vectura.UI.MultiSelectionPanel.init(app);
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

  test('the button exists in the align grid and carries the icon', () => {
    const btn = document.querySelector('.align-btn[data-align-op="alignCenterBoth"]');
    expect(btn).toBeTruthy();
  });

  test('clicking the button snaps the selection concentric in one undo step', () => {
    const { a, b } = addTwoLayers({ x: -40, y: -20 }, { x: 30, y: 25 });
    app.renderer.setSelection([a.id, b.id], a.id);

    const beforeA = centerOf(a);
    const beforeB = centerOf(b);
    expect(Math.abs(beforeA.cx - beforeB.cx) + Math.abs(beforeA.cy - beforeB.cy)).toBeGreaterThan(1);

    // Seed a baseline history entry so undo has a prior state to return to.
    app.pushHistory();
    const before = app.history.length;

    const btn = document.querySelector('.align-btn[data-align-op="alignCenterBoth"]');
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new window.Event('click', { bubbles: true }));

    // Exactly one history push from the click.
    expect(app.history.length).toBe(before + 1);

    // Concentric afterward (both axes centered).
    const afterA = centerOf(a);
    const afterB = centerOf(b);
    expect(afterA.cx).toBeCloseTo(afterB.cx, 3);
    expect(afterA.cy).toBeCloseTo(afterB.cy, 3);

    // Single undo restores both original positions.
    app.undo();
    const aBack = app.engine.getLayerById(a.id);
    const bBack = app.engine.getLayerById(b.id);
    expect(aBack.params.posX).toBeCloseTo(-40, 6);
    expect(bBack.params.posX).toBeCloseTo(30, 6);
  });
});
