/*
 * Pen Studio entry points: the Pens panel ⋯ menu (first item) and the pen
 * picker popover footer button both call UI.PenStudio.open({app, penId?, anchorEl}).
 * Runs on the full index.html stack, so it also proves the script tags are wired.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Pen Studio entry points', () => {
  let runtime, window, document, app, SETTINGS, calls, realOpen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    SETTINGS = window.Vectura.SETTINGS;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  beforeEach(() => {
    SETTINGS.pens = [
      { id: 'pen-1', name: 'Pen 1', color: '#ffffff', width: 0.3 },
      { id: 'pen-2', name: 'Pen 2', color: '#dbeafe', width: 0.5 },
    ];
    app.ui.renderPens();
    calls = [];
    realOpen = window.Vectura.UI.PenStudio.open;
    window.Vectura.UI.PenStudio.open = (opts) => { calls.push(opts); return { close() {} }; };
  });

  afterEach(() => {
    window.Vectura.UI.PenStudio.open = realOpen;
    window.Vectura.UI.PenPicker?.close?.();
    document.querySelectorAll('.pens-menu').forEach((n) => n.remove());
  });

  test('the Pen Studio modules are loaded from index.html', () => {
    const V = window.Vectura;
    ['PenStudioStore', 'PenStudioDraft', 'PenStudioLab', 'PenStudioComplement'].forEach((k) => expect(V[k]).toBeTruthy());
    ['PenStudio', 'PenStudioLab', 'PenStudioPair', 'PenStudioShared'].forEach((k) => expect(V.UI[k]).toBeTruthy());
    expect(V.PEN_STUDIO.STORAGE_KEY).toBeTruthy();
  });

  test('Pens ⋯ menu: first item is "Pen Studio…" and opens the studio anchored to the button', () => {
    const btn = document.getElementById('btn-pens-menu');
    btn.click();
    const items = Array.from(document.querySelectorAll('.pens-menu [role="menuitem"]'));
    expect(items.length).toBeGreaterThan(1);
    expect(items[0].textContent).toBe('Pen Studio…');
    items[0].click();
    expect(calls).toHaveLength(1);
    expect(calls[0].app).toBe(app);
    expect(calls[0].anchorEl).toBe(btn);
  });

  test('Pen picker popover: footer button opens the studio with the selection pen and closes the picker', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    app.engine.layers.forEach((l) => { l.penId = 'pen-2'; });
    const layer = app.engine.getActiveLayer ? app.engine.getActiveLayer() : app.engine.layers[0];
    const ctl = window.Vectura.UI.openPenPicker({ anchorEl: anchor, targetLayerIds: layer ? [layer.id] : [], app });
    expect(ctl).toBeTruthy();
    const foot = document.querySelector('.pen-pick-pop .pen-pick-studio');
    expect(foot).toBeTruthy();
    expect(foot.textContent).toBe('Open Pen Studio');
    foot.click();
    expect(calls).toHaveLength(1);
    expect(calls[0].app).toBe(app);
    expect(calls[0].anchorEl).toBe(anchor);
    if (layer) expect(calls[0].penId).toBe('pen-2');
    expect(window.Vectura.UI.PenPicker.isOpen()).toBe(false);
    anchor.remove();
  });
});
