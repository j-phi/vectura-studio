const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('right pane: Layers / Pen / Paper tabs', () => {
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
    // Paper selector: the Pens tab is now "Pen / Paper" (data-tab stays "pens").
    expect(labels).toContain('pen / paper');
    expect(document.querySelector('.right-pane-tab[data-tab="pens"]').textContent.trim()).toBe('Pen / Paper');
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
    // Paper section sits above the Pens section inside the same tab.
    const paperSection = document.getElementById('paper-global-section');
    expect(pensPanel.contains(paperSection)).toBe(true);
    const order = paperSection.compareDocumentPosition(document.getElementById('pens-global-section'));
    expect(order & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('document setup panel: default paper (replaces the background colour)', () => {
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

  test('the old Background colour picker is gone; the Default paper row lives in Document Setup', () => {
    expect(document.getElementById('inp-bg-color')).toBeNull();
    expect(document.getElementById('bg-color-pill')).toBeNull();
    const select = document.getElementById('set-default-paper-type');
    expect(select).toBeTruthy();
    const settingsPanel = document.getElementById('settings-panel');
    expect(settingsPanel.contains(select)).toBe(true);
    expect(document.getElementById('right-pane').contains(select)).toBe(false);
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['', ...window.Vectura.PAPERS.ORDER]);
    // Unambiguous: "no default" vs. the plain "None" paper.
    expect(select.options[0].textContent).toBe('No default (follow theme)');
    expect(select.querySelector('option[value="none"]').textContent).toBe('None (plain colour)');
  });

  test('Default paper row sits above the Selection Outline toggle inside Document Setup', () => {
    const row = document.getElementById('default-paper-row');
    const selectionOutline = document.getElementById('set-selection-outline');
    const order = row.compareDocumentPosition(selectionOutline);
    expect(order & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('default paper controls write only the default (a preference), not the project paper', () => {
    const S = window.Vectura.SETTINGS;
    const before = { ...window.Vectura.Paper.effective() };
    const historyBefore = window.app.history.length;
    const select = document.getElementById('set-default-paper-type');
    select.value = 'kraft';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(S.paperDefault.type).toBe('kraft');
    expect(S.paperDefault.color).toBe(window.Vectura.PAPERS.TYPES.kraft.color);
    const input = document.getElementById('inp-default-paper-color');
    input.value = '#123456';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(S.paperDefault).toMatchObject({ type: 'kraft', color: '#123456' });
    expect(window.Vectura.Paper.effective()).toEqual(before);
    expect(window.app.history.length).toBe(historyBefore);
  });

  test('"Apply to this document" applies the default to the project with one undo step', () => {
    const S = window.Vectura.SETTINGS;
    const historyBefore = window.app.history.length;
    document.getElementById('btn-default-paper-apply').click();
    expect(S.paper).toMatchObject({ type: 'kraft', color: '#123456' });
    expect(S.bgColor).toBe('#123456');
    expect(window.app.history.length).toBe(historyBefore + 1);
  });

  test('choosing "No default (follow theme)" clears the default paper', () => {
    const select = document.getElementById('set-default-paper-type');
    select.value = '';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(window.Vectura.SETTINGS.paperDefault).toBeNull();
  });
});
