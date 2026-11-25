/*
 * Mathematical Model copy button: the bottom pane's formula block carries a
 * Copy button that writes the full model (formula text, every Values row and
 * the seed) to the clipboard as plain text.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const nextFrames = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('Mathematical Model copy button', () => {
  let runtime;
  let window;
  let document;
  let app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    await nextFrames();
    if (!app.engine.getActiveLayer()) app.engine.addLayer('wavetable');
    await nextFrames();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('renders a copy button and copies the full model text', async () => {
    const written = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { written.push(t); return Promise.resolve(); } },
    });
    app.ui.updateFormula();
    const btn = document.querySelector('#formula-display .formula-copy-btn');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toMatch(/copy/i);

    const layer = app.engine.getActiveLayer();
    const formulaText = `${app.engine.getFormula(layer.id) || ''}`.trim();
    btn.click();
    await nextFrames(20);
    expect(written).toHaveLength(1);
    const text = written[0];
    // Formula, a header, and every rendered Values row, as "key: value" lines.
    expect(text).toContain(formulaText.split('\n')[0].trim());
    expect(text).toMatch(/^Values$/m);
    const rows = [...document.querySelectorAll('#formula-display .formula-row')];
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      const k = row.querySelector('.formula-key').textContent;
      const v = row.querySelector('.formula-val').textContent;
      expect(text).toContain(`${k}: ${v}`);
    });
    // No truncation: the clipboard text holds every row, not just the visible ones.
    expect(text.split('\n').filter((l) => l.includes(': ')).length).toBeGreaterThanOrEqual(rows.length);
    expect(btn.dataset.state).toBe('copied');
  });

  test('the button survives a re-render and still copies the current layer', async () => {
    const written = [];
    window.navigator.clipboard.writeText = (t) => { written.push(t); return Promise.resolve(); };
    app.ui.updateFormula();
    app.ui.updateFormula();
    const btns = document.querySelectorAll('#formula-display .formula-copy-btn');
    expect(btns).toHaveLength(1);
    btns[0].click();
    await nextFrames(20);
    expect(written).toHaveLength(1);
  });
});
