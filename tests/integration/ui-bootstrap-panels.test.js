const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('UI bootstrap – core panels', () => {
  let runtime, window, document, bootErrors;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    bootErrors = [];
    window.addEventListener('error', (event) => {
      if (event?.error?.message) bootErrors.push(event.error.message);
      else if (event?.message) bootErrors.push(event.message);
    });
    window.app = new window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('app boot populates layers, mathematical model, and about content', () => {
    expect(bootErrors).toEqual([]);

    const layerItems = document.querySelectorAll('#layer-list [data-lvl-id]');
    expect(layerItems.length).toBeGreaterThan(0);

    const formulaText = document.getElementById('formula-display')?.textContent?.trim() || '';
    expect(formulaText.length).toBeGreaterThan(0);

    const aboutText = document.getElementById('algo-desc')?.textContent?.trim() || '';
    expect(aboutText.length).toBeGreaterThan(0);
  });

  test('export modal owns remove hidden geometry and document setup no longer renders optimization cards', async () => {
    expect(document.getElementById('set-remove-hidden-geometry')).toBeNull();
    expect(Array.from(document.querySelectorAll('.optimization-card'))).toHaveLength(0);

    window.app.ui.openExportModal();
    await Promise.resolve();

    const exportRoot = document.getElementById('export-modal-root');
    expect(exportRoot).toBeTruthy();
    expect(exportRoot.querySelector('#export-preview-canvas')).toBeTruthy();
    expect(exportRoot.querySelector('#export-modal-settings')).toBeTruthy();

    const exportCard = Array.from(exportRoot.querySelectorAll('.optimization-card')).find((card) =>
      /Export Settings/i.test(card.textContent || '')
    );
    expect(exportCard).toBeTruthy();

    const checkbox = Array.from(exportCard.querySelectorAll('input[type="checkbox"]')).find((input) =>
      input.closest('.optimization-control')?.textContent?.includes('Remove Hidden Geometry')
    );
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);
    expect(window.Vectura.SETTINGS.removeHiddenGeometry).toBe(true);
  });

  test('theme toggle updates UI theme, document background, and Pen 1 without serializing theme into project state', async () => {
    const themeToggle = document.getElementById('theme-toggle');
    expect(themeToggle).toBeTruthy();
    expect(window.Vectura.SETTINGS.uiTheme).toBe('dark');

    const pen1 = window.Vectura.SETTINGS.pens.find((pen) => pen.id === 'pen-1');
    const activeLayer = window.app.engine.getActiveLayer();
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    // Click 1: dark → lark (dark UI + white paper)
    themeToggle.click();
    await Promise.resolve();
    expect(window.Vectura.SETTINGS.uiTheme).toBe('lark');
    expect(window.Vectura.SETTINGS.bgColor).toBe('#ffffff');
    expect(pen1?.color).toBe('#000000');
    expect(activeLayer?.penId).toBe('pen-1');
    expect(activeLayer?.color).toBe('#000000');
    expect(themeToggle.getAttribute('aria-label')).toContain('Light');
    expect(themeColorMeta?.getAttribute('content')).toBe('#09090b');

    // Click 2: lark → light
    themeToggle.click();
    await Promise.resolve();
    expect(window.Vectura.SETTINGS.uiTheme).toBe('light');
    expect(themeToggle.getAttribute('aria-label')).toContain('Dark');
    expect(themeColorMeta?.getAttribute('content')).toBe('#f5f5f5');

    const state = window.app.captureState();
    expect(state.settings.uiTheme).toBeUndefined();
    const prefs = window.app.getPreferenceSnapshot();
    expect(prefs.uiTheme).toBe('light');
  });

  test('document setup shortcut toggles the panel and document-unit state roundtrips through app state', async () => {
    const settingsPanel = document.getElementById('settings-panel');
    expect(settingsPanel.classList.contains('open')).toBe(false);

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    expect(settingsPanel.classList.contains('open')).toBe(true);

    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    expect(settingsPanel.classList.contains('open')).toBe(false);

    window.Vectura.SETTINGS.paperSize = 'custom';
    window.Vectura.SETTINGS.paperWidth = 254;
    window.Vectura.SETTINGS.paperHeight = 203.2;
    window.Vectura.SETTINGS.documentUnits = 'imperial';
    window.Vectura.SETTINGS.showDocumentDimensions = true;
    window.app.ui.initSettingsValues();

    const state = window.app.captureState();

    window.Vectura.SETTINGS.paperWidth = 210;
    window.Vectura.SETTINGS.paperHeight = 297;
    window.Vectura.SETTINGS.documentUnits = 'metric';
    window.Vectura.SETTINGS.showDocumentDimensions = false;

    window.app.applyState(state);
    await Promise.resolve();

    expect(window.Vectura.SETTINGS.documentUnits).toBe('imperial');
    expect(window.Vectura.SETTINGS.showDocumentDimensions).toBe(true);
    expect(document.getElementById('set-document-units')?.value).toBe('imperial');
    expect(document.getElementById('set-paper-width-label')?.textContent).toBe('Width (in)');
    expect(document.getElementById('set-paper-height-label')?.textContent).toBe('Height (in)');
    expect(document.getElementById('set-paper-width')?.value).toBe('10');
    expect(document.getElementById('set-paper-height')?.value).toBe('8');
  });
});

describe('UI bootstrap – line sort overlay', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    runtime.window.app = new runtime.window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('line sort overlay legend stays visible for shared multi-layer order metadata', () => {
    const { window, document } = runtime;
    const { Layer, SETTINGS } = window.Vectura;
    const app = window.app;
    const engine = app.engine;
    engine.layers = [];
    SETTINGS.globalLayerCount = 0;

    const buildLayer = (id, name, x1, x2) => {
      const layer = new Layer(id, 'shape', name);
      layer.params.curves = false;
      layer.sourcePaths = [[
        { x: x1, y: 42 },
        { x: x2, y: 42 },
      ]];
      layer.optimization = {
        bypassAll: false,
        steps: [{ id: 'linesort', enabled: true, bypass: false, method: 'greedy', direction: 'horizontal', grouping: 'combined' }],
      };
      return layer;
    };

    const left = buildLayer('legend-left', 'Left', 20, 40);
    const right = buildLayer('legend-right', 'Right', 180, 200);
    engine.layers.push(left, right);
    engine.activeLayerId = left.id;
    engine.generate(left.id);
    engine.generate(right.id);
    engine.computeAllDisplayGeometry();

    app.renderer.setSelection([left.id, right.id], right.id);
    SETTINGS.optimizationScope = 'selected';
    SETTINGS.optimizationPreview = 'overlay';
    app.ui.buildControls();
    app.ui.optimizeTargetsForCurrentScope({ includePlotterOptimize: true });
    app.render();

    const legend = document.getElementById('optimization-overlay-legend');
    const gradient = document.getElementById('optimization-overlay-legend-gradient');

    expect(left.optimizedPaths?.[0]?.meta?.lineSortOrder).toBe(0);
    expect(right.optimizedPaths?.[0]?.meta?.lineSortOrder).toBe(1);
    expect(legend?.classList.contains('hidden')).toBe(false);
    expect(gradient?.style.background || '').toContain('linear-gradient');
  });
});

describe('UI bootstrap – line sort export modal', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    runtime.window.app = new runtime.window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('enabling line sort from the export modal UI promotes preview mode to overlay', async () => {
    const { window, document } = runtime;

    window.app.ui.openExportModal();
    await Promise.resolve();

    const lineSortCard = Array.from(document.querySelectorAll('#export-modal-root .optimization-card')).find((card) =>
      /Line Sort/i.test(card.textContent || '')
    );
    expect(lineSortCard).toBeTruthy();

    const applyToggle = Array.from(lineSortCard.querySelectorAll('input[type="checkbox"]'))[0];
    expect(applyToggle).toBeTruthy();
    expect(window.Vectura.SETTINGS.optimizationPreview || 'off').toBe('off');
    expect(applyToggle.checked).toBe(true);

    applyToggle.checked = false;
    applyToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(applyToggle.checked).toBe(false);

    applyToggle.checked = true;
    applyToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(window.Vectura.SETTINGS.optimizationPreview).toBe('overlay');
  });
});
