/*
 * File > Close: drops the current project (confirming first when it has unsaved changes), leaves a blank canvas and
 * shows the Start Page. A never-saved project was never a plate, so closing it leaves the example plates; an opened
 * file stays the only plate until it is cleared from Recent (covered with the plates in example-plates.test.js).
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('File > Close', () => {
  let runtime; let window; let document; let app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    window.Vectura.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el) => { el._spInk = { setColorway() {}, setFrame() {} }; return Promise.resolve({}); },
      fillWord: (el) => { el._spWord = { setColorway() {}, refit() {} }; return Promise.resolve({}); },
    };
    app = window.app = new window.Vectura.App();
    await tick();
    app.startPage.hide({ restoreFocus: false });
  });

  afterEach(async () => {
    await tick(250); // let the Start Page's async render settle before the DOM goes
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  test('the File menu has a Close item after Open Recent and before Save', () => {
    const ids = [...document.querySelector('[aria-label="File menu"]').querySelectorAll('.top-menu-item')].map((b) => b.id);
    expect(ids).toContain('btn-close-project');
    expect(ids.indexOf('btn-close-project')).toBeGreaterThan(ids.indexOf('btn-open-recent'));
    expect(ids.indexOf('btn-close-project')).toBeLessThan(ids.indexOf('btn-save-vectura'));
  });

  test('closing a clean project empties the canvas and shows the Start Page', async () => {
    app.engine.addLayer('wavetable');
    app.markDocumentClean();
    expect(app.engine.layers.length).toBeGreaterThan(0);
    expect(await app.closeProject()).toBe(true);
    expect(app.engine.layers.filter((l) => !l.isGroup)).toHaveLength(0);
    expect(app.startPage.isOpen()).toBe(true);
    expect(app.currentRecentId).toBeNull();
  });

  test('the menu item runs it', async () => {
    app.engine.addLayer('wavetable');
    app.markDocumentClean();
    document.getElementById('btn-close-project').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await tick(50);
    expect(app.engine.layers.filter((l) => !l.isGroup)).toHaveLength(0);
    expect(app.startPage.isOpen()).toBe(true);
  });

  test('unsaved changes ask first; keeping the project leaves it untouched', async () => {
    app.engine.addLayer('wavetable');
    const asked = [];
    app.confirmDiscardChanges = async (o) => { asked.push(o); return false; };
    expect(await app.closeProject()).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0].confirmLabel).toBe('Close');
    expect(app.engine.layers.filter((l) => !l.isGroup).length).toBeGreaterThan(0);
    expect(app.startPage.isOpen()).toBe(false);
    app.confirmDiscardChanges = async () => true;
    expect(await app.closeProject()).toBe(true);
    expect(app.engine.layers.filter((l) => !l.isGroup)).toHaveLength(0);
  });
});
