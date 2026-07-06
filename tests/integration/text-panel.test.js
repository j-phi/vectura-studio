const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Bespoke Text panel (synthesis design port) integration tests.
 *
 * TextPanel.build() is driven against a minimal ui stub + a real text layer
 * params snapshot. The runtime loads defaults.js, google-fonts.js,
 * stroke-font.js, ui-text-specimen.js, and ui-text-panel.js (ui.js is NOT
 * loaded — the panel is exercised directly, not through buildControls()).
 */
describe('Text panel (vtp-)', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    window = runtime.window;
    document = runtime.document;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));

  // Pointer/coordinate-carrying event (jsdom's Event has no clientX/pointerId).
  const firePtr = (el, type, props = {}) => {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, { button: 0, pointerId: 1, clientX: 0, clientY: 0, shiftKey: false }, props);
    el.dispatchEvent(ev);
    return ev;
  };

  // Fresh ui stub + text layer + mounted panel for each test.
  const mount = (overrides = {}) => {
    const { UI, ALGO_DEFAULTS } = window.Vectura;
    const params = JSON.parse(JSON.stringify(ALGO_DEFAULTS.text));
    Object.assign(params, overrides);
    const layer = { id: 'text-1', type: 'text', params };
    const pushHistory = vi.fn();
    const regen = vi.fn();
    const storeLayerParams = vi.fn();
    const updateFormula = vi.fn();
    const buildControls = vi.fn();
    const ui = { app: { pushHistory, regen }, storeLayerParams, updateFormula, buildControls };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.TextPanel.build(ui, layer, container);
    return { ui, layer, container, pushHistory, regen, storeLayerParams, updateFormula };
  };

  test('registers TextPanel.build', () => {
    expect(typeof window.Vectura.UI.TextPanel.build).toBe('function');
  });

  test('builds the panel shell + 4-tab structure with all pages', () => {
    const { container } = mount();
    expect(container.querySelector('.vtp-panel')).toBeTruthy();
    expect(container.querySelector('.vtp-tabbar')).toBeTruthy();
    const tabs = container.querySelectorAll('.vtp-tab');
    expect(tabs.length).toBe(4);
    expect(Array.from(tabs).map((t) => t.dataset.tab)).toEqual(['type', 'layout', 'stroke', 'fill']);
    ['type', 'layout', 'stroke', 'fill'].forEach((p) => {
      expect(container.querySelector(`.vtp-page[data-page="${p}"]`)).toBeTruthy();
    });
    // The editable specimen + its three overlay SVGs exist.
    expect(container.querySelector('.vtp-spec-text[contenteditable="true"]')).toBeTruthy();
    expect(container.querySelector('.vtp-guide-svg')).toBeTruthy();
    expect(container.querySelector('.vtp-fill-svg')).toBeTruthy();
    expect(container.querySelector('.vtp-outline-svg')).toBeTruthy();
  });

  test('editing the specimen writes params.text and commits via the host pattern', () => {
    const { container, layer, pushHistory, regen, storeLayerParams } = mount();
    const spec = container.querySelector('.vtp-spec-text');
    spec.focus();
    spec.textContent = 'HELLO WORLD';
    fire(spec, 'input');
    // Commit fires on blur (debounce flushed) — one undo step for the burst.
    fire(spec, 'blur');
    expect(layer.params.text).toBe('HELLO WORLD');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
    expect(storeLayerParams).toHaveBeenCalled();
  });

  test('a scrub stepper commit runs the full host pattern once', () => {
    const { container, layer, pushHistory, regen } = mount();
    const before = layer.params.fontSize;
    const sizeScrub = container.querySelector('.vtp-scrub[data-field="size"]');
    expect(sizeScrub).toBeTruthy();
    const stepUp = sizeScrub.querySelector('.vtp-scrub-steppers button[data-dir="1"]');
    fire(stepUp, 'click');
    expect(layer.params.fontSize).toBe(before + 1);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
  });

  test('a toggle commit runs the full host pattern and flips the param', () => {
    const { container, layer, pushHistory, regen } = mount();
    const before = !!layer.params.fitToFrame;
    const toggle = container.querySelector('[data-ref="fitToggle"]');
    fire(toggle, 'click');
    expect(!!layer.params.fitToFrame).toBe(!before);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
  });

  test('switching to a stroke (built-in) face disables the Fill tab + shows the reason', () => {
    const { container } = mount({ font: 'sans' });
    const fillTab = container.querySelector('.vtp-tab[data-tab="fill"]');
    expect(fillTab.classList.contains('disabled')).toBe(true);
    expect(fillTab.getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('[data-ref="fillReason"]').style.display).toBe('flex');
    expect(container.querySelector('[data-ref="fillEnabledArea"]').classList.contains('vtp-disabled-area')).toBe(true);
  });

  test('a web (google) face keeps the Fill tab enabled', () => {
    const { container } = mount({ font: 'google:inter' });
    const fillTab = container.querySelector('.vtp-tab[data-tab="fill"]');
    expect(fillTab.classList.contains('disabled')).toBe(false);
  });

  test('rebuild tears down the prior instance — no duplicate body popover', () => {
    mount();
    mount();
    mount();
    expect(document.querySelectorAll('.vtp-fp-pop').length).toBe(1);
  });

  test('rebuild does not leave a stuck body scrubbing class', () => {
    mount();
    mount();
    expect(document.body.classList.contains('vtp-is-scrubbing')).toBe(false);
  });

  test('a no-movement scrub click (down/up, no drag) commits nothing — no history, no regen', () => {
    const { container, layer, pushHistory, regen } = mount();
    const before = layer.params.lineHeight;
    const handle = container.querySelector('.vtp-scrub[data-field="leading"] .vtp-scrub-handle');
    expect(handle).toBeTruthy();
    firePtr(handle, 'pointerdown', { clientX: 50 });
    firePtr(handle, 'pointerup', { clientX: 50 });
    expect(layer.params.lineHeight).toBe(before);
    expect(pushHistory).not.toHaveBeenCalled();
    expect(regen).not.toHaveBeenCalled();
    expect(document.body.classList.contains('vtp-is-scrubbing')).toBe(false);
  });

  test('a dblclick reset on a scrub is a single undo step (no-move pointer cycles add nothing)', () => {
    const { container, layer, pushHistory, regen } = mount({ lineHeight: 2.5 });
    const handle = container.querySelector('.vtp-scrub[data-field="leading"] .vtp-scrub-handle');
    // Browser emits down/up twice then dblclick — none of the bare cycles move.
    firePtr(handle, 'pointerdown', { clientX: 30 });
    firePtr(handle, 'pointerup', { clientX: 30 });
    firePtr(handle, 'pointerdown', { clientX: 30 });
    firePtr(handle, 'pointerup', { clientX: 30 });
    fire(handle, 'dblclick', { cancelable: true });
    expect(layer.params.lineHeight).toBe(window.Vectura.ALGO_DEFAULTS.text.lineHeight);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
  });

  test('an actual scrub drag commits once on release (history + regen)', () => {
    const { container, layer, pushHistory, regen } = mount();
    const before = layer.params.lineHeight;
    const handle = container.querySelector('.vtp-scrub[data-field="leading"] .vtp-scrub-handle');
    firePtr(handle, 'pointerdown', { clientX: 0 });
    firePtr(handle, 'pointermove', { clientX: 60 });
    expect(regen).not.toHaveBeenCalled(); // live drag updates DOM only
    firePtr(handle, 'pointerup', { clientX: 60 });
    expect(layer.params.lineHeight).not.toBe(before);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
  });

  test('destroy mid-drag aborts the gesture — a later window blur fires no stale flush', () => {
    const { container, regen, pushHistory } = mount();
    const handle = container.querySelector('.vtp-scrub[data-field="leading"] .vtp-scrub-handle');
    firePtr(handle, 'pointerdown', { clientX: 0 });
    firePtr(handle, 'pointermove', { clientX: 40 }); // moved → one pushHistory, no flush yet
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).not.toHaveBeenCalled();
    // Rebuild (e.g. async font-load → regen → buildControls) tears the panel down.
    mount();
    expect(document.body.classList.contains('vtp-is-scrubbing')).toBe(false);
    // The leaked listener (pre-fix) would call flush()/regen() on the dead layer.
    window.dispatchEvent(new window.Event('blur'));
    expect(regen).not.toHaveBeenCalled();
  });

  const styleBtn = (container, style) => container.querySelector(`.vtp-glyph-btn[data-style="${style}"]`);

  test('superscript and subscript are mutually exclusive (turning one on clears the other)', () => {
    const { container, layer } = mount({ subscript: true });
    const sup = styleBtn(container, 'super');
    const sub = styleBtn(container, 'sub');
    expect(sub.classList.contains('active')).toBe(true);
    fire(sup, 'click');
    expect(layer.params.superscript).toBe(true);
    expect(layer.params.subscript).toBe(false);
    expect(sup.classList.contains('active')).toBe(true);
    expect(sub.classList.contains('active')).toBe(false);
  });

  test('all caps and small caps are mutually exclusive (turning one on clears the other)', () => {
    const { container, layer } = mount({ smallCaps: true });
    const caps = styleBtn(container, 'caps');
    const sm = styleBtn(container, 'smcaps');
    expect(sm.classList.contains('active')).toBe(true);
    fire(caps, 'click');
    expect(layer.params.allCaps).toBe(true);
    expect(layer.params.smallCaps).toBe(false);
    expect(caps.classList.contains('active')).toBe(true);
    expect(sm.classList.contains('active')).toBe(false);
  });

  test('strikethrough toggle reveals height / weight / thicken-mode / line-style controls', () => {
    const { container, layer } = mount();
    const reveal = container.querySelector('[data-ref="strikeReveal"]');
    expect(reveal.classList.contains('open')).toBe(false);
    fire(styleBtn(container, 'strike'), 'click');
    expect(layer.params.strikethrough).toBe(true);
    expect(reveal.classList.contains('open')).toBe(true);
    expect(container.querySelector('.vtp-scrub[data-field="strikeOff"]')).toBeTruthy();
    expect(container.querySelector('.vtp-scrub[data-field="stWeight"]')).toBeTruthy();
    expect(container.querySelector('[data-ref="stThickenMode"]')).toBeTruthy();
    expect(container.querySelector('[data-ref="stStyle"]')).toBeTruthy();
  });

  test('underline toggle reveals weight / thicken-mode / style / break controls; the break toggle nests its padding', () => {
    const { container, layer } = mount();
    const reveal = container.querySelector('[data-ref="underlineReveal"]');
    expect(reveal.classList.contains('open')).toBe(false);
    fire(styleBtn(container, 'under'), 'click');
    expect(layer.params.underline).toBe(true);
    expect(reveal.classList.contains('open')).toBe(true);
    expect(container.querySelector('.vtp-scrub[data-field="ulWeight"]')).toBeTruthy();
    expect(container.querySelector('[data-ref="ulThickenMode"]')).toBeTruthy();
    expect(container.querySelector('[data-ref="ulStyle"]')).toBeTruthy();
    const breakReveal = container.querySelector('[data-ref="ulBreakReveal"]');
    expect(breakReveal.classList.contains('open')).toBe(false);
    fire(container.querySelector('[data-ref="ulBreakToggle"]'), 'click');
    expect(layer.params.underlineBreak).toBe(true);
    expect(breakReveal.classList.contains('open')).toBe(true);
  });

  test('decoration style / thicken-mode selects write their params', () => {
    const { container, layer } = mount({ underline: true, strikethrough: true });
    const ulStyle = container.querySelector('[data-ref="ulStyle"]');
    ulStyle.value = 'dash-dot'; fire(ulStyle, 'change');
    expect(layer.params.underlineStyle).toBe('dash-dot');
    const ulMode = container.querySelector('[data-ref="ulThickenMode"]');
    ulMode.value = 'hatch'; fire(ulMode, 'change');
    expect(layer.params.underlineThickenMode).toBe('hatch');
    const stMode = container.querySelector('[data-ref="stThickenMode"]');
    stMode.value = 'snake'; fire(stMode, 'change');
    expect(layer.params.strikethroughThickenMode).toBe('snake');
  });

  test('style-button icons read clearly: small-cap on baseline, super/subscript marks', () => {
    const { container } = mount();
    const sm = styleBtn(container, 'smcaps');
    const sup = styleBtn(container, 'super');
    const sub = styleBtn(container, 'sub');
    expect(sm.querySelector('.vtp-smc')).toBeTruthy();
    expect(sup.querySelector('.vtp-sup')).toBeTruthy();
    expect(sub.querySelector('.vtp-sub')).toBeTruthy();
    // The old hovering-superscript span is gone from the small-caps button.
    expect(sm.querySelector('.vtp-sm')).toBeNull();
  });

  test('fill type is the shared paint-bucket variant grid; density comes from the shared surface', () => {
    const { container, layer } = mount({ font: 'google:inter', fillEnabled: true });
    expect(layer.params.fillDensity).toBe(21);
    // The Fill tab now renders the SAME variant grid the paint bucket uses
    // (12 fill types) via Vectura.UI.FillControlSurface — not a 5-option select.
    const grid = container.querySelector('[data-ref="fillVariantGrid"]');
    expect(grid).toBeTruthy();
    expect(grid.querySelectorAll('.pb-variant-btn').length).toBe(12);
    expect(grid.querySelector('.pb-variant-btn.active').dataset.bucketVariant).toBe('hatch');
    // Density is a shared-surface control, id-namespaced with the txtfill prefix.
    const dens = container.querySelector('#txtfill-fillDensity');
    expect(dens).toBeTruthy();
    expect(dens.value).toBe('21');
    // The excluded main Angle stays a bespoke 0°-up AngleDial (see text.js −90°).
    expect(container.querySelector('#txtfill-fillAngle')).toBeNull();
  });

  test('fill angle is a radial dial (not a linear scrub) and commits fillAngle', () => {
    const { container, layer, pushHistory, regen } = mount({ font: 'google:inter', fillEnabled: true, fillAngle: 0 });
    // The old linear scrub is gone.
    expect(container.querySelector('.vtp-scrub[data-field="fillAngle"]')).toBeNull();
    const mnt = container.querySelector('[data-ref="fillAngleMount"]');
    expect(mnt).toBeTruthy();
    expect(mnt.querySelector('svg.angle-dial')).toBeTruthy();
    const input = mnt.querySelector('input.angle-inp');
    expect(input).toBeTruthy();
    // Typing an angle + blur commits it through the host pattern once.
    input.value = '45';
    fire(input, 'blur');
    expect(layer.params.fillAngle).toBe(45);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
  });

  test('max fill-offset slider (1–1000mm, default 20) re-clamps the offset to its radius', () => {
    const { container, layer, regen } = mount({
      font: 'google:inter', fillEnabled: true, fillOffsetX: 18, fillOffsetY: 0, fillOffsetMax: 20,
    });
    const slider = container.querySelector('[data-ref="fillOffsetMaxSlider"]');
    expect(slider).toBeTruthy();
    expect(slider.min).toBe('1');
    expect(slider.max).toBe('1000');
    expect(slider.value).toBe('20');
    // Shrinking the max below the current offset clamps the offset down to it;
    // the pad edge now maps to the new max on both axes (knob rides the rim).
    slider.value = '10';
    fire(slider, 'input');
    expect(layer.params.fillOffsetMax).toBe(10);
    expect(layer.params.fillOffsetX).toBeCloseTo(10, 5);
    const knob = container.querySelector('[data-ref="fillOffsetKnob"]');
    expect(knob.style.left).toBe('100%');
    // Growing the max leaves the offset in mm but pulls the knob toward centre.
    slider.value = '40';
    fire(slider, 'input');
    expect(layer.params.fillOffsetMax).toBe(40);
    expect(layer.params.fillOffsetX).toBeCloseTo(10, 5);
    expect(knob.style.left).toBe('62.5%'); // 50 + (10/40)*50
    fire(slider, 'change');
    expect(regen).toHaveBeenCalled();
  });

  test('radial centerpoint pad is hidden for non-radial fills, revealed for radial', () => {
    // Hatch (default) → the Centerpoint pad stays hidden.
    const { container, layer } = mount({ font: 'google:inter', fillEnabled: true, fillType: 'hatch' });
    const field = container.querySelector('[data-ref="fillCenterField"]');
    expect(field).toBeTruthy();
    expect(field.style.display).toBe('none');
    expect(container.querySelector('[data-ref="fillCenterPad"]')).toBeTruthy();
    // Switching to the radial variant reveals it in step with the grid.
    const grid = container.querySelector('[data-ref="fillVariantGrid"]');
    const radialBtn = grid.querySelector('.pb-variant-btn[data-bucket-variant="radial"]');
    expect(radialBtn).toBeTruthy();
    radialBtn.click();
    expect(layer.params.fillType).toBe('radial');
    expect(field.style.display).toBe('');
  });

  test('radial fill mounts with the centerpoint pad already shown', () => {
    const { container } = mount({ font: 'google:inter', fillEnabled: true, fillType: 'radial' });
    const field = container.querySelector('[data-ref="fillCenterField"]');
    expect(field.style.display).toBe('');
  });

  test('dragging the centerpoint pad writes fillShiftX/fillShiftY (radial centre offset)', () => {
    const { container, layer, pushHistory, regen } = mount({
      font: 'google:inter', fillEnabled: true, fillType: 'radial',
      fillShiftX: 0, fillShiftY: 0, fillShiftMax: 20,
    });
    const pad = container.querySelector('[data-ref="fillCenterPad"]');
    // jsdom gives the pad a 0-size rect; stub it so the pointer maps to the rim.
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    // Pointer at the pad's right-centre edge → +x rim, y centred.
    firePtr(pad, 'pointerdown', { clientX: 100, clientY: 50 });
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(layer.params.fillShiftX).toBeCloseTo(20, 5); // clamped to the max radius
    expect(layer.params.fillShiftY).toBeCloseTo(0, 5);
    firePtr(pad, 'pointerup', { clientX: 100, clientY: 50 });
    expect(regen).toHaveBeenCalled();
    // Double-click recentres the origin.
    fire(pad, 'dblclick');
    expect(layer.params.fillShiftX).toBe(0);
    expect(layer.params.fillShiftY).toBe(0);
  });

  test('rebuild flushes a pending debounced specimen edit (no silent text loss)', () => {
    const { container, layer, pushHistory } = mount();
    const spec = container.querySelector('.vtp-spec-text');
    spec.focus();
    spec.textContent = 'UNSAVED DRAFT';
    fire(spec, 'input'); // starts the 400ms debounce, not yet committed
    expect(layer.params.text).not.toBe('UNSAVED DRAFT');
    mount(); // rebuild before the debounce elapses and before blur
    expect(layer.params.text).toBe('UNSAVED DRAFT');
    expect(pushHistory).toHaveBeenCalledTimes(1);
  });

  // ── Per-pair kerning gating ───────────────────────────────────────────────
  // Mount a panel with a controllable textEdit stub so we can drive the caret.
  const mountWithCaret = (text, state) => {
    const { UI, ALGO_DEFAULTS } = window.Vectura;
    const params = JSON.parse(JSON.stringify(ALGO_DEFAULTS.text));
    params.text = text;
    const layer = { id: 'text-kern', type: 'text', params };
    const textEdit = {
      isActive: () => state.active,
      getActiveLayer: () => (state.active ? layer : null),
      getCaretIndex: () => state.caret,
    };
    const ui = {
      app: { pushHistory: vi.fn(), regen: vi.fn(), textEdit },
      storeLayerParams: vi.fn(), updateFormula: vi.fn(), buildControls: vi.fn(),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.TextPanel.build(ui, layer, container);
    return { layer, container };
  };
  const emitCaret = (layer, caret, active = true) =>
    document.dispatchEvent(new window.CustomEvent('vectura:textcaret', {
      detail: { active, layerId: layer.id, caretIndex: caret },
    }));

  test('Kerning scrub is disabled unless editing between two letters, and edits the pair at the caret', () => {
    const state = { active: false, caret: 0 };
    const { layer, container } = mountWithCaret('AVA', state);
    const scrub = container.querySelector('.vtp-scrub[data-field="kerning"]');
    expect(scrub).toBeTruthy();
    // Not in an edit session → locked.
    expect(scrub.classList.contains('disabled')).toBe(true);

    // Enter edit mode, caret between A and V (gap index 1) → unlocked.
    state.active = true; state.caret = 1;
    emitCaret(layer, 1);
    expect(scrub.classList.contains('disabled')).toBe(false);

    // Commit a value → writes ONLY that pair.
    const input = scrub.querySelector('input');
    input.value = '-15';
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(layer.params.kernPairs).toEqual({ 1: -15 });

    // Move the caret to the other gap (index 2) → still enabled, but a fresh pair.
    state.caret = 2;
    emitCaret(layer, 2);
    expect(scrub.classList.contains('disabled')).toBe(false);
    expect(scrub.querySelector('input').value).toBe('0'); // no kern set for gap 2 yet
    input.value = '8';
    scrub.querySelector('input').dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(layer.params.kernPairs).toEqual({ 1: -15, 2: 8 });

    // Caret at a boundary (index 0, no left char) → locked again.
    state.caret = 0;
    emitCaret(layer, 0);
    expect(scrub.classList.contains('disabled')).toBe(true);
  });

  test('Kerning stays locked when the caret is adjacent to whitespace', () => {
    const state = { active: true, caret: 1 }; // 'A B' → caret 1 is A|space
    const { layer, container } = mountWithCaret('A B', state);
    const scrub = container.querySelector('.vtp-scrub[data-field="kerning"]');
    emitCaret(layer, 1);
    expect(scrub.classList.contains('disabled')).toBe(true); // space on the right
    state.caret = 2; emitCaret(layer, 2); // space|B
    expect(scrub.classList.contains('disabled')).toBe(true); // space on the left
  });
});
