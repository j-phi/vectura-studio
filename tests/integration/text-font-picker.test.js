const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Text font picker (bespoke panel contract).
 *
 * As of the synthesis Text-panel port, selecting a Text layer no longer renders
 * the legacy generic `fontPicker` control — the early-return hook in
 * src/ui/panels/algo-config-panel.js mounts window.Vectura.UI.TextPanel instead.
 * The font picker is now the bespoke `.vtp-fontpick-trigger` + a body-level
 * `.vtp-fp-pop` popover backed by the real catalog (Vectura.GoogleFonts) plus
 * the single built-in Vectura family (Vectura.StrokeFont) — its slant/width
 * variants are *styles* offered by the Style select, not separate fonts.
 *
 * This boots the full app, selects a Text layer, builds its controls, and pins:
 *  - the bespoke panel + font picker mount,
 *  - the Vectura family is reachable in the popover; styles live in the Style select,
 *  - selecting the family + a style updates the layer font,
 *  - the web catalog degrades gracefully offline (jsdom) rather than throwing.
 */
describe('Text font picker control (bespoke panel)', () => {
  let runtime;
  let window;
  let app;
  let doc;

  const FULL_STACK = {
    includeRenderer: true,
    includeUi: true,
    includeApp: true,
    includeMain: false,
    useIndexHtml: true,
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    window = runtime.window;
    doc = window.document;
    app = new window.Vectura.App();
    await Promise.resolve();
    const id = app.engine.addLayer('text');
    app.engine.activeLayerId = id;
    app.renderer.setSelection([id], id);
    app.ui.buildControls();
  });

  afterAll(() => runtime.cleanup());

  const activeLayer = () => app.engine.layers.find((l) => l.id === app.engine.activeLayerId);
  const trigger = () => doc.querySelector('.vtp-fontpick-trigger');
  const popover = () => doc.querySelector('.vtp-fp-pop');
  const openPicker = () => {
    if (!popover() || !popover().classList.contains('open')) trigger().click();
    return popover();
  };
  const options = () => Array.from(popover().querySelectorAll('.vtp-fp-opt'));

  test('mounts the bespoke Text panel with a font-picker trigger', () => {
    expect(doc.querySelector('.vtp-panel')).toBeTruthy();
    expect(trigger()).toBeTruthy();
    // The body-level popover is created once.
    expect(doc.querySelectorAll('.vtp-fp-pop').length).toBe(1);
  });

  test('the popover lists the single Vectura family; styles live in the Style select', () => {
    openPicker();
    const values = options().map((o) => o.dataset.value);
    expect(values).toContain('vectura');
    // The slant/width variants are no longer separate fonts in the picker…
    ['italic', 'condensed', 'wide', 'oblique'].forEach((v) => expect(values).not.toContain(v));
    // …they are the options of the Style (variant) select instead.
    const variant = doc.querySelector('[data-ref="variantSelect"]');
    expect(variant).toBeTruthy();
    const styleVals = Array.from(variant.options).map((o) => o.value);
    ['sans', 'italic', 'condensed', 'wide', 'oblique'].forEach((v) => expect(styleVals).toContain(v));
  });

  test('built-in stroke faces preview from the real StrokeFont outline, not generic UI text', () => {
    openPicker();
    const vectura = options().find((o) => o.dataset.value === 'vectura');
    expect(vectura).toBeTruthy();
    const nm = vectura.querySelector('.vtp-fp-opt-name');
    expect(nm).toBeTruthy();
    // The built-in single-stroke family has no CSS @font-face, so its preview is
    // an inline SVG drawn from actual StrokeFont geometry (a <path> of real
    // move/line data) rather than a plain text label in the generic UI font.
    const svg = nm.querySelector('svg.vtp-fp-opt-svg');
    expect(svg).toBeTruthy();
    const d = svg.querySelector('path').getAttribute('d');
    expect(d).toMatch(/^M-?[\d.]/);
    expect(d.length).toBeGreaterThan(20);
    // Accessible name is preserved for screen readers.
    expect(nm.getAttribute('aria-label')).toBe('Vectura');
  });

  test('selecting the Vectura family sets a built-in style; the Style select switches variant', () => {
    openPicker();
    const vectura = options().find((o) => o.dataset.value === 'vectura');
    expect(vectura).toBeTruthy();
    vectura.click();
    // The family marker resolves to a concrete style (Regular) from a web start.
    expect(activeLayer().params.font).toBe('sans');
    // Switching to a stroke face greys the Fill tab (no enclosed interior).
    expect(doc.querySelector('.vtp-tab[data-tab="fill"]').classList.contains('disabled')).toBe(true);
    // The Style select drives the slant/width variant.
    const variant = doc.querySelector('[data-ref="variantSelect"]');
    variant.value = 'wide';
    variant.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(activeLayer().params.font).toBe('wide');
  });

  test('the picker degrades gracefully when the web catalog is unavailable offline', () => {
    // Restore a web face so the panel rebuilds with the Fill tab live, then open.
    activeLayer().params.font = 'google:inter';
    app.ui.buildControls();
    expect(() => openPicker()).not.toThrow();
    // Built-in faces are always reachable; the Google section shows a status hint
    // (the network catalog can't load under jsdom) instead of throwing.
    const values = options().map((o) => o.dataset.value);
    expect(values).toContain('vectura');
    expect(popover().querySelector('.vtp-fp-empty')).toBeTruthy();
  });
});
