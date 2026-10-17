const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * CodeQL js/xss-through-dom (ui-text-panel.js): the stroke-face preview SVG
 * carries the face name. A face value is layer state (a loaded .vectura file can
 * hold any string), so the name must reach the DOM as text, never as markup.
 */
describe('Text panel stroke-face preview escapes the face name', () => {
  let runtime;
  let window;
  let app;
  let doc;
  const PAYLOAD = '"><img src=x onerror=window.__vtpXss=1>';

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
    });
    window = runtime.window;
    doc = window.document;
    app = new window.Vectura.App();
    await Promise.resolve();
    const id = app.engine.addLayer('text');
    app.engine.activeLayerId = id;
    app.renderer.setSelection([id], id);
    const layer = app.engine.layers.find((l) => l.id === id);
    layer.params.font = PAYLOAD;
    app.ui.buildControls();
  });

  afterAll(() => runtime.cleanup());

  test('the font trigger renders the injected name as text, with no injected element', () => {
    const trigger = doc.querySelector('.vtp-fontpick-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.querySelectorAll('img').length).toBe(0);
    const svg = trigger.querySelector('svg');
    const labelled = svg || trigger.querySelector('[aria-label]') || trigger;
    const label = labelled.getAttribute('aria-label') || labelled.textContent;
    expect(label).toContain('<img');
    expect(window.__vtpXss).toBeUndefined();
  });

  test('the picker option for the injected face holds no injected element', () => {
    doc.querySelector('.vtp-fontpick-trigger').click();
    const pop = doc.querySelector('.vtp-fp-pop');
    expect(pop).toBeTruthy();
    expect(pop.querySelectorAll('img').length).toBe(0);
    expect(window.__vtpXss).toBeUndefined();
  });

  test('the built-in Vectura option still previews from an SVG outline', () => {
    const pop = doc.querySelector('.vtp-fp-pop');
    const row = Array.from(pop.querySelectorAll('.vtp-fp-opt')).find((o) => o.dataset.value === 'vectura');
    expect(row).toBeTruthy();
    const svg = row.querySelector('.vtp-fp-opt-name svg.vtp-fp-opt-svg');
    expect(svg).toBeTruthy();
    expect(svg.querySelector('path').getAttribute('d')).toMatch(/^M/);
    expect(svg.getAttribute('aria-label')).toBeTruthy();
  });
});
