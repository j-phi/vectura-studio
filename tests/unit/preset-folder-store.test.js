/*
 * Unit tests for src/ui/preset-folder-store.js — the File System Access folder
 * backing for user presets (Phase 2). The real FSA / IndexedDB don't exist in
 * the node/jsdom env, so we drive the module with fake FileSystemDirectoryHandle
 * objects and a fake KV, exercising the routing/scan/permission logic.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ── In-memory fake of the File System Access directory/file handle API ─────────
const makeFile = (name, content = '') => {
  let data = content;
  return {
    kind: 'file', name,
    async getFile() { return { async text() { return data; } }; },
    async createWritable() { return { async write(c) { data = c; }, async close() {} }; },
    _read() { return data; },
  };
};
const makeDir = (name) => {
  const children = new Map();
  let permission = 'granted';
  return {
    kind: 'directory', name, _children: children,
    _setPermission(p) { permission = p; },
    async queryPermission() { return permission; },
    async requestPermission() { permission = 'granted'; return permission; },
    async getDirectoryHandle(n, opts = {}) {
      if (children.has(n)) return children.get(n);
      if (!opts.create) throw new Error('NotFoundError');
      const d = makeDir(n); children.set(n, d); return d;
    },
    async getFileHandle(n, opts = {}) {
      if (children.has(n)) return children.get(n);
      if (!opts.create) throw new Error('NotFoundError');
      const f = makeFile(n); children.set(n, f); return f;
    },
    async removeEntry(n) { if (!children.has(n)) throw new Error('NotFoundError'); children.delete(n); },
    async *values() { for (const v of children.values()) yield v; },
  };
};

describe('PresetFolderStore', () => {
  let dom, Store, win;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    win = dom.window;
    const code = fs.readFileSync(path.join(ROOT, 'src/ui/preset-folder-store.js'), 'utf8');
    vm.runInContext(code, dom.getInternalVMContext(), { filename: 'preset-folder-store.js' });
    Store = win.Vectura.PresetFolderStore;
    Store.__reset();
    // Mark the env as FSA-supported by default; the "unsupported" test opts out.
    win.showDirectoryPicker = async () => makeDir('default-picked');
  });

  afterEach(() => { Store?.__reset?.(); dom?.window?.close?.(); });

  it('reports unsupported when showDirectoryPicker is absent', async () => {
    win.showDirectoryPicker = undefined;
    expect(Store.isSupported()).toBe(false);
    const status = await Store.getStatus();
    expect(status).toEqual({ connected: false, name: null, permission: 'unsupported' });
    expect(await Store.writePreset('rings', 'foo', { a: 1 })).toBe(false);
  });

  it('writes a preset to <folder>/<system>/<slug>.vectura', async () => {
    const root = makeDir('Vectura Presets');
    Store.__setHandleForTests(root);
    const ok = await Store.writePreset('rings', 'fresh-cut', { type: 'vectura', name: 'Fresh Cut' });
    expect(ok).toBe(true);
    const sysDir = root._children.get('rings');
    expect(sysDir).toBeTruthy();
    const file = sysDir._children.get('fresh-cut.vectura');
    expect(file).toBeTruthy();
    expect(JSON.parse(file._read()).name).toBe('Fresh Cut');
  });

  it('readAll scans subdirectories and parses .vectura files (skipping junk)', async () => {
    const root = makeDir('root');
    Store.__setHandleForTests(root);
    await Store.writePreset('rings', 'a', { name: 'A' });
    await Store.writePreset('lissajous', 'b', { name: 'B' });
    // A non-.vectura file and an invalid-JSON .vectura should be skipped.
    const ringsDir = root._children.get('rings');
    ringsDir._children.set('notes.txt', makeFile('notes.txt', 'hello'));
    ringsDir._children.set('broken.vectura', makeFile('broken.vectura', '{not json'));

    const all = await Store.readAll();
    const ids = all.map((e) => `${e.system}/${e.slug}`).sort();
    expect(ids).toEqual(['lissajous/b', 'rings/a']);
    const a = all.find((e) => e.slug === 'a');
    expect(a.doc.name).toBe('A');
  });

  it('does not write when permission is only "prompt" (non-interactive)', async () => {
    const root = makeDir('root');
    root._setPermission('prompt');
    Store.__setHandleForTests(root);
    expect(await Store.writePreset('rings', 'x', { name: 'X' })).toBe(false);
    expect(root._children.size).toBe(0);
  });

  it('reconnect requests permission and then writes succeed', async () => {
    const root = makeDir('root');
    root._setPermission('prompt');
    Store.__setHandleForTests(root);
    expect((await Store.getStatus()).permission).toBe('prompt');
    expect(await Store.reconnect()).toBe(true);
    expect((await Store.getStatus()).permission).toBe('granted');
    expect(await Store.writePreset('rings', 'x', { name: 'X' })).toBe(true);
  });

  it('getStatus reflects a connected handle name + permission', async () => {
    const root = makeDir('My Folder');
    Store.__setHandleForTests(root);
    expect(await Store.getStatus()).toEqual({ connected: true, name: 'My Folder', permission: 'granted' });
  });

  it('deletePreset removes the file', async () => {
    const root = makeDir('root');
    Store.__setHandleForTests(root);
    await Store.writePreset('rings', 'gone', { name: 'Gone' });
    expect(root._children.get('rings')._children.has('gone.vectura')).toBe(true);
    expect(await Store.deletePreset('rings', 'gone')).toBe(true);
    expect(root._children.get('rings')._children.has('gone.vectura')).toBe(false);
  });

  it('connect() stores the picked handle via the KV; disconnect clears it', async () => {
    const store = new Map();
    Store.__setKVForTests({
      async get(k) { return store.get(k); },
      async set(k, v) { store.set(k, v); },
      async del(k) { store.delete(k); },
    });
    const picked = makeDir('Picked');
    win.showDirectoryPicker = async () => picked;

    expect(Store.isSupported()).toBe(true);
    const res = await Store.connect();
    expect(res).toEqual({ name: 'Picked' });
    expect(store.get('presetFolderHandle')).toBe(picked);
    expect(Store.hasHandle()).toBe(true);

    await Store.disconnect();
    expect(store.has('presetFolderHandle')).toBe(false);
    expect(Store.hasHandle()).toBe(false);
  });

  it('connect() returns null when the user cancels the picker', async () => {
    Store.__setKVForTests({ async get() {}, async set() {}, async del() {} });
    win.showDirectoryPicker = async () => { throw new Error('AbortError'); };
    expect(await Store.connect()).toBeNull();
    expect(Store.hasHandle()).toBe(false);
  });

  it('init() loads a previously-saved handle from the KV', async () => {
    const saved = makeDir('Saved');
    Store.__setKVForTests({ async get() { return saved; }, async set() {}, async del() {} });
    win.showDirectoryPicker = async () => saved;
    const h = await Store.init();
    expect(h).toBe(saved);
    expect((await Store.getStatus()).name).toBe('Saved');
  });
});
