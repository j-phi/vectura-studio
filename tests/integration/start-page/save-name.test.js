/*
 * Save uses app.documentName when set (an opened colorway copy saves as "<name> (colorway).vectura"), and the
 * Start Page's frozen special fill (state.settings.startPageFill) survives captureState / applyState.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Save naming and startPageFill', () => {
  let runtime; let window; let app;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    window = runtime.window;
    app = window.app = new window.Vectura.App();
    await tick();
  });
  afterEach(() => runtime?.cleanup?.());

  const saveName = async () => {
    const names = [];
    window.Vectura.Download = { saveBlob: (blob, name) => { names.push(name); return Promise.resolve('saved'); } };
    app.ui.saveVecturaFile();
    await tick();
    return names[0];
  };

  test('a named document saves under its name; unnamed keeps the dated default', async () => {
    expect(await saveName()).toMatch(/^vectura-\d{4}-\d{2}-\d{2}\.vectura$/);
    app.documentName = 'Riverbed (colorway)';
    expect(await saveName()).toBe('Riverbed (colorway).vectura');
    app.documentName = 'a/b:c*?.vectura';
    expect(await saveName()).toBe('abc.vectura');
  });

  test('Windows reserved device names and leading dots are not used as file names', async () => {
    for (const [name, expected] of [['CON', 'CON-file.vectura'], ['nul.vectura', 'nul-file.vectura'], ['com3', 'com3-file.vectura'], ['LPT9', 'LPT9-file.vectura'], ['.hidden', 'hidden.vectura'], ['...', null], ['Console', 'Console.vectura']]) {
      app.documentName = name;
      const got = await saveName();
      if (expected) expect(got).toBe(expected); else expect(got).toMatch(/^vectura-\d{4}-\d{2}-\d{2}\.vectura$/);
    }
  });

  test('opening another file or a new canvas forgets the document name', async () => {
    app.documentName = 'Riverbed (colorway)';
    app.ui.loadVecturaPayload({ type: 'vectura', version: 'x', state: app.captureState(), images: {} }, { quiet: true });
    expect(app.documentName || null).toBeNull();
  });

  test('startPageFill round-trips through captureState / applyState and is absent otherwise', () => {
    const S = window.Vectura.SETTINGS;
    expect('startPageFill' in app.captureState().settings).toBe(false);
    S.startPageFill = { kind: 'duotone', ink: '#2b3a8f', ink2: '#e8c15a' };
    const state = app.captureState();
    expect(state.settings.startPageFill).toEqual({ kind: 'duotone', ink: '#2b3a8f', ink2: '#e8c15a' });
    delete S.startPageFill;
    app.applyState(state);
    expect(S.startPageFill).toEqual({ kind: 'duotone', ink: '#2b3a8f', ink2: '#e8c15a' });
    const plain = app.captureState();
    delete plain.settings.startPageFill;
    app.applyState(plain);
    expect(S.startPageFill).toBeUndefined();
  });
});
