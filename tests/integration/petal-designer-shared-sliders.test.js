/*
 * Petal Designer → shared UI.Slider migration.
 *
 * The designer's five slider construction sites (structure counts/feather,
 * shading-stack ranges, modifier-stack ranges, randomness panel, per-ring
 * advanced params) previously rendered bare native <input type="range">
 * controls with plain-text value spans, clashing with the migrated UI.Slider
 * rows (gradient fill + editable chip) in the adjacent algorithm panel.
 *
 * These tests pin the migration contract:
 *  - markup: every range input in the designer lives inside a .sld-fx-wrap
 *    (the shared component's fx wrapper) with an editable .slider-val chip;
 *  - drag semantics: 'input' → live apply (no persist), 'change' → full
 *    apply (regenerate + persist), matching the legacy oninput/onchange pair;
 *  - chip edit: typing a value and blurring commits it (onChange + onCommit);
 *  - dblclick reset: double-clicking a track resets to the canonical default
 *    (ring params → PETAL_RING_PARAM_DEFAULTS baseline) and commits;
 *  - disabled stacks: a disabled shading card disables its slider + chip.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Petal Designer — shared UI.Slider rows', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    // jsdom getContext('2d') returns null; stub a no-op 2D context so the
    // designer canvases and renderPetalDesigner() don't throw.
    const noopCtx = {
      canvas: { width: 0, height: 0 },
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      fill() {}, stroke() {}, fillRect() {}, clearRect() {}, strokeRect() {}, arc() {},
      bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, translate() {}, rotate() {},
      scale() {}, setTransform() {}, transform() {}, resetTransform() {}, clip() {},
      drawImage() {}, measureText: () => ({ width: 0 }), fillText() {}, strokeText() {},
      setLineDash() {}, getLineDash: () => [], ellipse() {}, arcTo() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    const HC = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (HC) HC.getContext = function () { return noopCtx; };
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function ensurePetalisLayer() {
    let layer = (app.engine.layers || []).find((l) => l && l.type === 'petalisDesigner');
    if (layer) return layer;
    const Layer = window.Vectura.Layer;
    layer = new Layer(`test-petalis-${Date.now()}`, 'petalisDesigner', 'PE');
    layer.params = layer.params || {};
    layer.params.innerCount = 0;
    layer.params.outerCount = 6;
    app.engine.layers.push(layer);
    return layer;
  }

  const openDesigner = () => {
    const layer = ensurePetalisLayer();
    app.ui.openPetalDesigner({ layer });
    return { layer, win: document.getElementById('petal-designer-window'), pd: app.ui.petalDesigner };
  };

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('every designer range control is a shared slider (chip + fx wrap, zero bare natives)', () => {
    const { win } = openDesigner();
    // Populate the dynamic stacks too, so their construction sites are covered.
    win.querySelector('[data-petal-shading-add]').click();
    win.querySelector('[data-petal-modifier-add]').click();

    const ranges = Array.from(win.querySelectorAll('input[type=range]'));
    expect(ranges.length).toBeGreaterThanOrEqual(38);
    const bare = ranges.filter((el) => !el.closest('.sld-fx-wrap'));
    expect(bare.length).toBe(0);

    // Selector hooks survive on the component's internal range input.
    for (const sel of [
      'input[data-petal-inner-count]',
      'input[data-petal-outer-count]',
      'input[data-petal-split-feather]',
      'input[data-shade-key="lineSpacing"]',
      'input[data-ring-param="outer-petalWidthRatio"]',
      'input[data-ring-param="inner-petalScale"]',
    ]) {
      const el = win.querySelector(sel);
      expect(el, sel).toBeTruthy();
      expect(el.closest('.sld-fx-wrap'), sel).toBeTruthy();
      // Each migrated row carries the editable value chip.
      expect(el.closest('.slider-row')?.querySelector('.slider-val'), sel).toBeTruthy();
    }

    // The legacy plain-text value spans are gone from slider rows (the select
    // rows — symmetry, shading/modifier type — legitimately keep theirs).
    const staleSpans = Array.from(win.querySelectorAll('.petal-slider-value')).filter(
      (span) => span.closest('label')?.querySelector('input[type=range]')
    );
    expect(staleSpans.length).toBe(0);
    app.ui.closePetalDesigner();
  });

  test('structure drag: input applies live (no persist), change persists', () => {
    const { win, pd } = openDesigner();
    const spy = vi.spyOn(app.ui, 'applyPetalDesignerToLayer');
    const input = win.querySelector('input[data-petal-inner-count]');
    expect(input).toBeTruthy();

    input.value = '12';
    fire(input, 'input');
    expect(pd.state.innerCount).toBe(12);
    let opts = spy.mock.calls[spy.mock.calls.length - 1][1];
    expect(opts).toMatchObject({ refreshControls: false, persistState: false });
    // Chip mirrors the drag value live.
    expect(input.closest('.slider-row').querySelector('.slider-val').value).toBe('12');

    fire(input, 'change');
    opts = spy.mock.calls[spy.mock.calls.length - 1][1];
    expect(opts).toMatchObject({ persistState: true });
    expect(pd.state.innerCount).toBe(12);

    spy.mockRestore();
    app.ui.closePetalDesigner();
  });

  test('chip edit commits the typed value (split feathering, % chip)', () => {
    const { win, pd } = openDesigner();
    const spy = vi.spyOn(app.ui, 'applyPetalDesignerToLayer');
    const input = win.querySelector('input[data-petal-split-feather]');
    const chip = input.closest('.slider-row').querySelector('.slider-val');
    expect(chip).toBeTruthy();

    chip.value = '25';
    fire(chip, 'blur');
    expect(pd.state.profileTransitionFeather).toBe(25);
    const opts = spy.mock.calls[spy.mock.calls.length - 1][1];
    expect(opts).toMatchObject({ persistState: true });
    // Unit-suffixed chip re-renders with the % glyph.
    expect(chip.value).toBe('25%');

    spy.mockRestore();
    app.ui.closePetalDesigner();
  });

  test('dblclick resets a ring param to its canonical baseline and commits', () => {
    const { win, pd } = openDesigner();
    pd.state.activeTarget = 'outer';
    pd.state.outerRingParams = { petalWidthRatio: 0.3 };
    app.ui.syncPetalDesignerControls(pd);

    const input = win.querySelector('input[data-ring-param="outer-petalWidthRatio"]');
    expect(Number(input.value)).toBeCloseTo(0.3, 2);

    const spy = vi.spyOn(app.ui, 'applyPetalDesignerToLayer');
    input.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(pd.state.outerRingParams.petalWidthRatio).toBeCloseTo(0.74, 2);
    expect(Number(input.value)).toBeCloseTo(0.74, 2);
    const opts = spy.mock.calls[spy.mock.calls.length - 1][1];
    expect(opts).toMatchObject({ persistState: true });

    spy.mockRestore();
    app.ui.closePetalDesigner();
  });

  test('a disabled shading card disables its slider track and chip', () => {
    const { win, pd } = openDesigner();
    pd.state.shadings = [{ id: 's-dis', enabled: false, type: 'radial' }];
    app.ui.renderPetalDesignerShadingStack(app.ui.petalDesigner);

    const input = win.querySelector('input[data-shade-key="lineSpacing"]');
    expect(input).toBeTruthy();
    expect(input.disabled).toBe(true);
    expect(input.closest('.slider-row').querySelector('.slider-val').disabled).toBe(true);

    pd.state.shadings = [];
    app.ui.closePetalDesigner();
  });

  // Regression coverage for converting the shading stack's 'Hatch Angle'
  // rangeDef (key: 'angle') from a linear slider to the shared UI.AngleDial —
  // matching the same param's conversion on the non-inline Petalis Shading
  // stack (algo-config-panel.js buildShadingAngleControl). This is the
  // Petal Designer's own bespoke render loop (renderPetalDesignerShadingStack
  // → makeAngle), a separate construction site from that panel, so it needed
  // its own dispatch branch and its own coverage.
  test("shading stack's Hatch Angle mounts UI.AngleDial (not a linear slider) and round-trips a negative value", () => {
    const { win, pd } = openDesigner();
    pd.state.shadings = [{ id: 's-angle', enabled: true, type: 'radial', angle: 30 }];
    app.ui.renderPetalDesignerShadingStack(app.ui.petalDesigner);

    // No bare range input for 'angle' anymore.
    expect(win.querySelector('input[data-shade-key="angle"]')).toBeNull();

    const dial = win.querySelector('svg.angle-dial');
    expect(dial).toBeTruthy();
    expect(dial.getAttribute('aria-valuemin')).toBe('-90');
    expect(dial.getAttribute('aria-valuemax')).toBe('90');
    expect(dial.getAttribute('aria-valuenow')).toBe('30');

    const input = win.querySelector('.angle-inp');
    expect(input).toBeTruthy();
    input.value = '-45';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    // Before the angle-dial min/max fix + this dispatch branch, a negative
    // value on a [-90,90] domain either had no dial to enter it into, or
    // (once wired to a plain AngleDial with the pre-fix wrap360) would have
    // been force-wrapped into [0,360) and clamped to 90.
    expect(pd.state.shadings[0].angle).toBe(-45);

    pd.state.shadings = [];
    app.ui.closePetalDesigner();
  });

  test('a disabled shading card disables its Hatch Angle dial too', () => {
    const { win, pd } = openDesigner();
    pd.state.shadings = [{ id: 's-angle-dis', enabled: false, type: 'radial', angle: 10 }];
    app.ui.renderPetalDesignerShadingStack(app.ui.petalDesigner);

    const dial = win.querySelector('svg.angle-dial');
    expect(dial).toBeTruthy();
    expect(dial.tabIndex).toBe(-1);
    expect(win.querySelector('.angle-inp').disabled).toBe(true);

    pd.state.shadings = [];
    app.ui.closePetalDesigner();
  });
});
