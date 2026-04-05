const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('UI bootstrap integrity', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('app boot populates layers, mathematical model, and about content', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });

    const { window, document } = runtime;
    const pageErrors = [];
    window.addEventListener('error', (event) => {
      if (event?.error?.message) pageErrors.push(event.error.message);
      else if (event?.message) pageErrors.push(event.message);
    });

    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(pageErrors).toEqual([]);

    const layerItems = document.querySelectorAll('#layer-list .layer-item');
    expect(layerItems.length).toBeGreaterThan(0);

    const formulaText = document.getElementById('formula-display')?.textContent?.trim() || '';
    expect(formulaText.length).toBeGreaterThan(0);

    const aboutText = document.getElementById('algo-desc')?.textContent?.trim() || '';
    expect(aboutText.length).toBeGreaterThan(0);
  });

  test('document setup exposes a single export-settings remove hidden geometry control, checked by default', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });

    const { window, document } = runtime;
    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(document.getElementById('set-remove-hidden-geometry')).toBeNull();

    const labels = Array.from(document.querySelectorAll('label, .control-label')).filter((node) =>
      /Remove Hidden Geometry/i.test(node.textContent || '')
    );
    expect(labels).toHaveLength(1);

    const exportCard = Array.from(document.querySelectorAll('.optimization-card')).find((card) =>
      /Export Settings/i.test(card.textContent || '')
    );
    expect(exportCard).toBeTruthy();
    expect(exportCard.textContent).toMatch(/Remove Hidden Geometry/);

    const checkbox = Array.from(exportCard.querySelectorAll('input[type="checkbox"]')).find((input) =>
      input.closest('.optimization-control')?.textContent?.includes('Remove Hidden Geometry')
    );
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);
    expect(window.Vectura.SETTINGS.removeHiddenGeometry).toBe(true);
  });

  test('theme toggle updates UI theme, document background, and Pen 1 without serializing theme into project state', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });

    const { window, document } = runtime;
    window.app = new window.Vectura.App();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const themeToggle = document.getElementById('theme-toggle');
    expect(themeToggle).toBeTruthy();
    expect(window.Vectura.SETTINGS.uiTheme).toBe('dark');

    themeToggle.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const pen1 = window.Vectura.SETTINGS.pens.find((pen) => pen.id === 'pen-1');
    const activeLayer = window.app.engine.getActiveLayer();
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    expect(window.Vectura.SETTINGS.uiTheme).toBe('light');
    expect(window.Vectura.SETTINGS.bgColor).toBe('#ffffff');
    expect(pen1?.color).toBe('#000000');
    expect(activeLayer?.penId).toBe('pen-1');
    expect(activeLayer?.color).toBe('#000000');
    expect(themeToggle.getAttribute('aria-label')).toContain('dark');
    expect(themeColorMeta?.getAttribute('content')).toBe('#f5f5f5');

    const state = window.app.captureState();
    expect(state.settings.uiTheme).toBeUndefined();
    const prefs = window.app.getPreferenceSnapshot();
    expect(prefs.uiTheme).toBe('light');
  });
});
