/*
 * Real path: with the Start Page open, Clear in the Recent rail (and its Undo) updates the Plates section at once.
 * A lone opened file is the only plate; Clear hands the plates back to the example plates; Undo restores the file.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 10 L 100 90"/></g></svg>';

describe('Start Page: Clear in Recent updates the plates while the page is open', () => {
  let runtime; let window; let document; let app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    const V = window.Vectura;
    V.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el) => { el._spInk = { setColorway() {}, setFrame() {} }; return Promise.resolve({}); },
      fillWord: (el) => { el._spWord = { setColorway() {}, refit() {} }; return Promise.resolve({}); },
    };
    // real works list; only the example art is swapped for a tiny SVG (jsdom has no engine canvas)
    const real = V.StartPageArtSource;
    V.StartPageArtSource = Object.assign({}, real, {
      examples: () => real.examples().map((a) => Object.assign({}, a, { getSvg: async () => SVG })),
    });
    app = window.app = new V.App();
    await tick();
  });

  afterEach(async () => {
    await tick(250);
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  const sp = () => document.getElementById('start-page');
  const qa = (s) => [...sp().querySelectorAll(s)];
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  test('Clear brings the examples back and Undo restores the lone plate, with no hide/show', async () => {
    await app.recents.record({
      name: 'mine.vectura', source: 'open', algorithm: 'Rings', paper: 'A3', pens: [{ color: '#112233', width: 0.3 }],
      thumb: { kind: 'svg', data: SVG }, payload: { type: 'vectura', version: 'x', state: app.captureState(), images: {} },
    });
    app.startPage.show();
    await tick(400);
    expect(qa('.sp-pl[data-example]')).toHaveLength(0);
    expect(qa('.sp-pl')).toHaveLength(1);

    click(sp().querySelector('[data-act="clear-recent"]'));
    await tick(600);
    expect(app.recents.list()).toHaveLength(0);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);

    click(document.querySelector('#vectura-toast-host [data-action="undo"]'));
    await tick(600);
    expect(qa('.sp-pl[data-example]')).toHaveLength(0);
    expect(qa('.sp-pl')).toHaveLength(1);
  });
});
