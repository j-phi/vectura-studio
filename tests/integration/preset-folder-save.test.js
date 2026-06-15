const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Phase 2: when a folder is connected (File System Access), saving a preset
 * mirrors it to <folder>/<system>/<slug>.vectura in addition to localStorage.
 * The real FSA doesn't exist in jsdom, so we mark the env supported and inject a
 * fake FileSystemDirectoryHandle into PresetFolderStore, then drive a real save
 * through the gallery save pip.
 */
const makeFile = (name) => {
  let data = '';
  return {
    kind: 'file', name,
    async getFile() { return { async text() { return data; } }; },
    async createWritable() { return { async write(c) { data = c; }, async close() {} }; },
    _read() { return data; },
  };
};
const makeDir = (name) => {
  const children = new Map();
  return {
    kind: 'directory', name, _children: children,
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async getDirectoryHandle(n, opts = {}) {
      if (children.has(n)) return children.get(n);
      if (!opts.create) throw new Error('NotFound');
      const d = makeDir(n); children.set(n, d); return d;
    },
    async getFileHandle(n, opts = {}) {
      if (children.has(n)) return children.get(n);
      if (!opts.create) throw new Error('NotFound');
      const f = makeFile(n); children.set(n, f); return f;
    },
    async *values() { for (const v of children.values()) yield v; },
  };
};

describe('Preset save mirrors to a connected folder (Phase 2)', () => {
  let runtime, window, document, app;

  const pip = () => document.querySelector('.hg-preset-save-pip');
  const nameInput = () => document.getElementById('preset-save-name');

  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('saving a preset writes <folder>/<system>/<slug>.vectura', async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.localStorage.clear();
    // Mark FSA supported + inject a granted fake folder handle.
    window.showDirectoryPicker = async () => makeDir('root');
    const root = makeDir('My Presets');
    window.Vectura.PresetFolderStore.__setHandleForTests(root);

    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('lissajous');
    app.ui.renderLayers();
    app.ui.buildControls();

    // Diverge → pip appears → open modal → save.
    const layer = app.engine.getActiveLayer();
    layer.params.freqX = (layer.params.freqX || 0) + 5;
    app.regen();
    expect(pip().hidden).toBe(false);
    pip().click();
    nameInput().value = 'Folder Look';
    document.querySelector('.preset-save-confirm').click();

    // localStorage mirror written.
    const ls = JSON.parse(window.localStorage.getItem('vectura.user_presets.lissajous') || '[]');
    expect(ls).toHaveLength(1);

    // Folder write is fire-and-forget (a microtask) — flush, then assert.
    await new Promise((r) => setTimeout(r, 0));
    const sysDir = root._children.get('lissajous');
    expect(sysDir).toBeTruthy();
    const file = sysDir._children.get('folder-look.vectura');
    expect(file).toBeTruthy();
    const doc = JSON.parse(file._read());
    expect(doc.type).toBe('vectura');
    expect(doc.name).toBe('Folder Look');
    expect(doc.layers[0].type).toBe('lissajous');
    // transform/seed stripped from the mirrored params too.
    expect('posX' in doc.layers[0].params).toBe(false);
  });
});
