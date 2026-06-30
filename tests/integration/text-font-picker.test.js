const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Text font picker (bespoke panel contract).
 *
 * As of the synthesis Text-panel port, selecting a Text layer no longer renders
 * the legacy generic `fontPicker` control — the early-return hook in
 * src/ui/panels/algo-config-panel.js mounts window.Vectura.UI.TextPanel instead.
 * The font picker is now the bespoke `.vtp-fontpick-trigger` + a body-level
 * `.vtp-fp-pop` popover backed by the real catalog (Vectura.GoogleFonts) plus
 * the five built-in stroke faces (Vectura.StrokeFont).
 *
 * This boots the full app, selects a Text layer, builds its controls, and pins:
 *  - the bespoke panel + font picker mount,
 *  - the built-in stroke faces are reachable in the popover,
 *  - selecting a built-in face updates the layer font,
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

  test('the popover lists the five built-in stroke faces', () => {
    openPicker();
    const values = options().map((o) => o.dataset.value);
    ['sans', 'italic', 'condensed', 'wide', 'oblique'].forEach((v) => expect(values).toContain(v));
  });

  test('selecting a built-in face updates the layer font', () => {
    openPicker();
    const wide = options().find((o) => o.dataset.value === 'wide');
    expect(wide).toBeTruthy();
    wide.click();
    expect(activeLayer().params.font).toBe('wide');
    // Switching to a stroke face greys the Fill tab (no enclosed interior).
    expect(doc.querySelector('.vtp-tab[data-tab="fill"]').classList.contains('disabled')).toBe(true);
  });

  test('the picker degrades gracefully when the web catalog is unavailable offline', () => {
    // Restore a web face so the panel rebuilds with the Fill tab live, then open.
    activeLayer().params.font = 'google:inter';
    app.ui.buildControls();
    expect(() => openPicker()).not.toThrow();
    // Built-in faces are always reachable; the Google section shows a status hint
    // (the network catalog can't load under jsdom) instead of throwing.
    const values = options().map((o) => o.dataset.value);
    expect(values).toContain('sans');
    expect(popover().querySelector('.vtp-fp-empty')).toBeTruthy();
  });
});
