const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('right pane: Layers / Pens tabs', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('right pane shows two tabs in the pane header (replacing the LAYERS title)', () => {
    const tabBar = document.getElementById('right-pane-tabs');
    expect(tabBar).toBeTruthy();
    const header = document.querySelector('#right-pane .pane-header-right');
    expect(header).toBeTruthy();
    expect(header.contains(tabBar)).toBe(true);

    const buttons = tabBar.querySelectorAll('.right-pane-tab');
    expect(buttons.length).toBe(2);

    const labels = Array.from(buttons).map((b) => (b.textContent || '').trim().toLowerCase());
    expect(labels).toContain('layers');
    expect(labels).toContain('pens');
  });

  test('Add layer control lives inside the Layers tab content (in the search bar) and is removed from the pane header', () => {
    const addWrap = document.getElementById('layer-add-wrap');
    expect(addWrap).toBeTruthy();

    const layersPanel = document.getElementById('right-tab-panel-layers');
    const searchBar = document.getElementById('layer-search-bar');
    const header = document.querySelector('#right-pane .pane-header-right');

    expect(layersPanel.contains(addWrap)).toBe(true);
    expect(searchBar.contains(addWrap)).toBe(true);
    expect(header.contains(addWrap)).toBe(false);
  });

  test('Layers tab is active by default and shows the layer list (pens/auto-color hidden)', () => {
    const layersTab = document.querySelector('.right-pane-tab[data-tab="layers"]');
    const pensTab = document.querySelector('.right-pane-tab[data-tab="pens"]');
    const layersPanel = document.getElementById('right-tab-panel-layers');
    const pensPanel = document.getElementById('right-tab-panel-pens');

    expect(layersTab.classList.contains('active')).toBe(true);
    expect(pensTab.classList.contains('active')).toBe(false);

    expect(layersPanel.classList.contains('hidden')).toBe(false);
    expect(pensPanel.classList.contains('hidden')).toBe(true);

    expect(layersPanel.contains(document.getElementById('layer-list'))).toBe(true);
    expect(pensPanel.contains(document.getElementById('pens-section'))).toBe(true);
    expect(pensPanel.contains(document.getElementById('auto-colorization-section'))).toBe(true);
  });

  test('clicking the Pens tab swaps active panel to Pens and hides Layers panel', () => {
    const pensTab = document.querySelector('.right-pane-tab[data-tab="pens"]');
    const layersTab = document.querySelector('.right-pane-tab[data-tab="layers"]');
    const layersPanel = document.getElementById('right-tab-panel-layers');
    const pensPanel = document.getElementById('right-tab-panel-pens');

    pensTab.click();

    expect(pensTab.classList.contains('active')).toBe(true);
    expect(layersTab.classList.contains('active')).toBe(false);
    expect(pensPanel.classList.contains('hidden')).toBe(false);
    expect(layersPanel.classList.contains('hidden')).toBe(true);

    layersTab.click();
    expect(layersTab.classList.contains('active')).toBe(true);
    expect(pensPanel.classList.contains('hidden')).toBe(true);
  });
});

describe('document setup panel: background section', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('background color input lives inside the Document Setup settings panel, not the bottom or right pane', () => {
    const bgInput = document.getElementById('inp-bg-color');
    expect(bgInput).toBeTruthy();

    const settingsPanel = document.getElementById('settings-panel');
    const bottomPane = document.getElementById('bottom-pane');
    const rightPane = document.getElementById('right-pane');
    expect(settingsPanel.contains(bgInput)).toBe(true);
    expect(bottomPane.contains(bgInput)).toBe(false);
    expect(rightPane.contains(bgInput)).toBe(false);
  });

  test('background pill sits above the Selection Outline toggle inside Document Setup', () => {
    const bgPill = document.getElementById('bg-color-pill');
    const selectionOutline = document.getElementById('set-selection-outline');
    expect(bgPill).toBeTruthy();
    expect(selectionOutline).toBeTruthy();

    const order = bgPill.compareDocumentPosition(selectionOutline);
    expect(order & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('changing background input still updates SETTINGS.bgColor (wiring preserved after move)', () => {
    const bgInput = document.getElementById('inp-bg-color');
    bgInput.value = '#123456';
    bgInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(window.Vectura.SETTINGS.bgColor.toLowerCase()).toBe('#123456');
  });
});
