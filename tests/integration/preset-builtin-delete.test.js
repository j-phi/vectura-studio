const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Built-in preset deletion. Every curated preset is a .vectura file, so in
 * Developer Mode no preset is undeletable: the gallery's per-row X removes any
 * localStorage override, tombstones the bundled built-in (hiding it now and
 * across reloads until a re-bundle drops it), and deletes the .vectura source
 * file from the connected folder. Deleting a built-in confirms first. The
 * default-marker preset stays protected (a fresh layer initializes onto it).
 * Outside dev mode an overridden built-in REVERTs (drops the override, keeps the
 * bundled preset) and a user preset delete now also un-mirrors its file.
 */

// Minimal fake File System Access directory tree that records removed entries.
const makeFile = (name) => ({
  kind: 'file', name,
  async getFile() { return { async text() { return ''; } }; },
  async createWritable() { return { async write() {}, async close() {} }; },
});
const makeDir = (name, removed) => {
  const children = new Map();
  return {
    kind: 'directory', name, _children: children,
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async getDirectoryHandle(n, opts = {}) {
      if (children.has(n)) return children.get(n);
      if (!opts.create) throw new Error('NotFound');
      const d = makeDir(n, removed); children.set(n, d); return d;
    },
    async getFileHandle(n, opts = {}) {
      if (children.has(n)) return children.get(n);
      if (!opts.create) throw new Error('NotFound');
      const f = makeFile(n); children.set(n, f); return f;
    },
    async removeEntry(n) { removed.push(`${name}/${n}`); children.delete(n); },
    async *values() { for (const v of children.values()) yield v; },
  };
};

describe('Preset gallery — built-in deletion + revert (Developer Mode)', () => {
  let runtime, window, document, app;

  const option = (id) => document.querySelector(`.hg-preset-option[data-preset-id="${id}"]`);
  const delBtn = (id) => option(id) && option(id).querySelector('.hg-preset-delete:not(.hg-preset-revert)');
  const revertBtn = (id) => option(id) && option(id).querySelector('.hg-preset-revert');
  const userPresets = (sys) =>
    JSON.parse(window.localStorage.getItem(`vectura.user_presets.${sys}`) || '[]');
  const deletedIds = (sys) =>
    JSON.parse(window.localStorage.getItem(`vectura.deleted_presets.${sys}`) || '[]');
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const dangerConfirm = () => document.querySelector('.vectura-dialog-footer .hdr-btn.is-danger');

  const mount = async (layerType, { devMode = true, folder = null } = {}) => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.localStorage.clear();
    window.Vectura.SETTINGS.devMode = devMode;
    if (folder) {
      window.showDirectoryPicker = async () => makeDir('root', folder.removed);
      window.Vectura.PresetFolderStore.__setHandleForTests(makeDir('My Presets', folder.removed));
    }
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer(layerType);
    app.ui.renderLayers();
    app.ui.buildControls();
  };

  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('dev mode: a pristine built-in shows a DELETE button; the default marker does not', async () => {
    await mount('flowfield');
    // A curated built-in is deletable…
    expect(delBtn('flowfield-storm-cell')).toBeTruthy();
    expect(revertBtn('flowfield-storm-cell')).toBeFalsy();
    // …but the default-marker preset a fresh layer initializes onto is protected.
    expect(option('flowfield-default')).toBeTruthy();
    expect(delBtn('flowfield-default')).toBeFalsy();
    expect(revertBtn('flowfield-default')).toBeFalsy();
  });

  test('dev mode: deleting a built-in confirms, then tombstones it and removes it from the gallery', async () => {
    await mount('flowfield');
    expect(option('flowfield-storm-cell')).toBeTruthy();

    delBtn('flowfield-storm-cell').click();
    // A destructive confirm dialog appears; confirm it.
    expect(dangerConfirm()).toBeTruthy();
    dangerConfirm().click();

    expect(deletedIds('flowfield')).toContain('flowfield-storm-cell');
    expect(option('flowfield-storm-cell')).toBeNull();
  });

  test('a built-in tombstone survives a fresh gallery mount (reload) until the bundle drops it', async () => {
    await mount('flowfield');
    delBtn('flowfield-storm-cell').click();
    dangerConfirm().click();
    expect(option('flowfield-storm-cell')).toBeNull();

    // Simulate a reload: a new runtime over the SAME persisted localStorage.
    const saved = window.localStorage.getItem('vectura.deleted_presets.flowfield');
    runtime.cleanup();
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.localStorage.setItem('vectura.deleted_presets.flowfield', saved);
    window.Vectura.SETTINGS.devMode = true;
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('flowfield');
    app.ui.renderLayers();
    app.ui.buildControls();

    expect(option('flowfield-storm-cell')).toBeNull();
    expect(deletedIds('flowfield')).toContain('flowfield-storm-cell');
  });

  test('a tombstone for an id the bundle no longer carries is self-pruned on rebuild', async () => {
    await mount('flowfield');
    window.localStorage.setItem('vectura.deleted_presets.flowfield', JSON.stringify(['ghost-preset-id']));
    app.ui.buildControls(); // re-render the gallery
    expect(deletedIds('flowfield')).not.toContain('ghost-preset-id');
  });

  test('dev mode + connected folder: deleting a built-in removes its .vectura source file', async () => {
    const folder = { removed: [] };
    await mount('flowfield', { folder });
    // Seed the on-disk source file so the subdir exists for the delete to target.
    await window.Vectura.PresetFolderStore.writePreset('flowfield', 'storm-cell', { type: 'vectura' });
    delBtn('flowfield-storm-cell').click();
    dangerConfirm().click();
    await flush();
    // "Storm Cell" → slug storm-cell under the flowfield/ subdir.
    expect(folder.removed).toContain('flowfield/storm-cell.vectura');
  });

  test('non-dev: a pristine built-in has no affordance; an overridden built-in REVERTs (keeps the bundled preset)', async () => {
    await mount('flowfield', { devMode: false });
    // No delete/revert on a pristine built-in outside dev mode.
    expect(delBtn('flowfield-storm-cell')).toBeFalsy();
    expect(revertBtn('flowfield-storm-cell')).toBeFalsy();

    // Seed a localStorage override for the built-in (as a dev overwrite would).
    window.localStorage.setItem('vectura.user_presets.flowfield', JSON.stringify([
      { id: 'flowfield-storm-cell', name: 'Storm Cell', preset_system: 'flowfield', group: 'User', params: { density: 999 }, savedAt: 1 },
    ]));
    app.ui.buildControls();

    // Now a REVERT control (not delete) appears.
    expect(revertBtn('flowfield-storm-cell')).toBeTruthy();
    expect(delBtn('flowfield-storm-cell')).toBeFalsy();

    revertBtn('flowfield-storm-cell').click();
    // Override gone, but the bundled built-in remains in the gallery — and no tombstone.
    expect(userPresets('flowfield').find((p) => p.id === 'flowfield-storm-cell')).toBeFalsy();
    expect(option('flowfield-storm-cell')).toBeTruthy();
    expect(deletedIds('flowfield')).toEqual([]);
  });

  test('non-dev + connected folder: deleting a USER preset also un-mirrors its file', async () => {
    const folder = { removed: [] };
    await mount('flowfield', { devMode: false, folder });
    window.localStorage.setItem('vectura.user_presets.flowfield', JSON.stringify([
      { id: 'user-flowfield-1', name: 'My Field', preset_system: 'flowfield', group: 'User', params: { density: 5 }, savedAt: 1 },
    ]));
    app.ui.buildControls();
    // Seed the on-disk source file so the subdir exists for the delete to target.
    await window.Vectura.PresetFolderStore.writePreset('flowfield', 'my-field', { type: 'vectura' });

    expect(delBtn('user-flowfield-1')).toBeTruthy();
    delBtn('user-flowfield-1').click();
    await flush();

    expect(userPresets('flowfield').find((p) => p.id === 'user-flowfield-1')).toBeFalsy();
    expect(folder.removed).toContain('flowfield/my-field.vectura');
  });
});
