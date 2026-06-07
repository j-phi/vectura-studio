const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Phase 3: the disk → browser read-back direction, end to end through the real
 * app stack. A preset edited on disk (or dropped into the folder by another
 * machine) is pulled into localStorage by app._pullPresetFolderAndRefresh().
 * The real FSA doesn't exist in jsdom, so we inject a fake granted folder handle.
 */
const makeFile = (name, lastModified = 0) => {
  let data = '';
  return {
    kind: 'file', name,
    async getFile() { return { lastModified, async text() { return data; } }; },
    async createWritable() { return { async write(c) { data = c; }, async close() {} }; },
    _read() { return data; },
    _write(c) { data = c; },
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
    async removeEntry(n) { children.delete(n); },
    async *values() { for (const v of children.values()) yield v; },
  };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Preset folder read-back / two-way sync (Phase 3)', () => {
  let runtime, window, document, app, root;

  const pip = () => document.querySelector('.hg-preset-save-pip');
  const nameInput = () => document.getElementById('preset-save-name');
  const ls = (sys) => JSON.parse(window.localStorage.getItem(`vectura.user_presets.${sys}`) || '[]');

  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const boot = async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.localStorage.clear();
    window.showDirectoryPicker = async () => makeDir('root');
    root = makeDir('My Presets');
    window.Vectura.PresetFolderStore.__setHandleForTests(root);
    window.app = new window.Vectura.App();
    app = window.app;
  };

  // Save the active layer as a preset named `name` through the real save pip flow.
  const saveActiveAs = (name) => {
    pip().click();
    nameInput().value = name;
    document.querySelector('.preset-save-confirm').click();
  };

  test('an external edit to a disk file is pulled into the matching browser preset (LWW)', async () => {
    await boot();
    app.engine.addLayer('lissajous');
    app.ui.renderLayers();
    app.ui.buildControls();

    const layer = app.engine.getActiveLayer();
    layer.params.freqX = (layer.params.freqX || 0) + 5;
    app.regen();
    saveActiveAs('Folder Look');
    await flush();

    const saved = ls('lissajous');
    expect(saved).toHaveLength(1);
    const id = saved[0].id;

    // Simulate another machine editing the file: same presetId, newer savedAt,
    // changed params.
    const file = root._children.get('lissajous')._children.get('folder-look.vectura');
    const doc = JSON.parse(file._read());
    doc.layers[0].params.freqX = 99;
    doc.meta.savedAt = (doc.meta.savedAt || 0) + 10000;
    file._write(JSON.stringify(doc));

    await app._pullPresetFolderAndRefresh();

    const after = ls('lissajous');
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(id);          // same preset, updated in place
    expect(after[0].params.freqX).toBe(99); // disk edit pulled in
  });

  test('a .vectura file dropped into the folder is imported as a new User preset', async () => {
    await boot();
    // No browser presets yet; drop a file straight into <root>/rings/.
    const ringsDir = await root.getDirectoryHandle('rings', { create: true });
    const fh = await ringsDir.getFileHandle('ocean.vectura', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify({
      type: 'vectura', name: 'Ocean',
      meta: { presetId: 'user-rings-ext', group: 'User', system: 'rings', savedAt: 5000 },
      layers: [{ type: 'rings', params: { count: 7 } }],
    }));
    await w.close();

    expect(ls('rings')).toHaveLength(0);
    await app._pullPresetFolderAndRefresh();

    const imported = ls('rings');
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ id: 'user-rings-ext', name: 'Ocean', group: 'User' });
    expect(imported[0].params).toEqual({ count: 7 });
  });

  test('read-back is additive: a file removed from disk does not delete the browser preset', async () => {
    await boot();
    app.engine.addLayer('lissajous');
    app.ui.renderLayers();
    app.ui.buildControls();
    const layer = app.engine.getActiveLayer();
    layer.params.freqX = (layer.params.freqX || 0) + 3;
    app.regen();
    saveActiveAs('Stays');
    await flush();
    expect(ls('lissajous')).toHaveLength(1);

    // Delete the disk file, then pull — the browser preset must remain.
    root._children.get('lissajous')._children.delete('stays.vectura');
    await app._pullPresetFolderAndRefresh();
    expect(ls('lissajous')).toHaveLength(1);
  });
});
