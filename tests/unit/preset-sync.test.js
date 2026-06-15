/*
 * Unit tests for src/ui/preset-sync.js — the disk → browser read-back direction.
 *
 * Contract under test (locked 2026-06-07):
 *   - additive-only: a browser preset missing from disk is never deleted
 *   - import: a file not in the browser becomes a User preset
 *   - LWW: in-both pulls only when the disk copy is strictly newer; a newer/equal
 *     browser copy is never clobbered (→ idempotent on repeat pulls)
 *   - mtime fallback: a hand-edited file with stale/absent meta.savedAt still wins
 *     via its file lastModified
 *   - validation: malformed / non-preset files are skipped, not thrown on
 *
 * A fake store injects readAll() output so we exercise the reconcile logic
 * directly against a real JSDOM localStorage.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('PresetSync', () => {
  let dom, S, win;
  const PRE = 'vectura.user_presets.';
  const set = (sys, arr) => win.localStorage.setItem(PRE + sys, JSON.stringify(arr));
  const get = (sys) => JSON.parse(win.localStorage.getItem(PRE + sys) || '[]');

  // Build a fake PresetFolderStore whose readAll returns the given entries.
  const fakeStore = (entries) => ({ readAll: async () => entries });

  // Convenience: a disk entry { system, slug, doc, mtime }.
  const fileEntry = (system, name, params, { id, savedAt, mtime, group } = {}) => ({
    system,
    slug: S.slug(name),
    mtime: mtime || 0,
    doc: {
      type: 'vectura', version: '1.0.0', name,
      meta: { presetId: id || null, group: group || 'User', system, savedAt: savedAt || 0 },
      layers: [{ type: system, params }],
    },
  });

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    win = dom.window;
    const code = fs.readFileSync(path.join(ROOT, 'src/ui/preset-sync.js'), 'utf8');
    vm.runInContext(code, dom.getInternalVMContext(), { filename: 'preset-sync.js' });
    S = win.Vectura.PresetSync;
    win.localStorage.clear();
  });

  afterEach(() => dom?.window?.close?.());

  it('imports a file that is not yet in the browser', async () => {
    const store = fakeStore([fileEntry('rings', 'Ocean', { count: 7 }, { id: 'user-rings-100', savedAt: 100 })]);
    const res = await S.pullFromFolder({ store });
    expect(res).toEqual({ imported: 1, updated: 0, skipped: 0 });
    const list = get('rings');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'user-rings-100', name: 'Ocean', preset_system: 'rings', group: 'User', savedAt: 100 });
    expect(list[0].params).toEqual({ count: 7 });
  });

  it('is additive-only: a browser preset absent from disk is left untouched', async () => {
    set('rings', [{ id: 'user-rings-keep', name: 'Keep', preset_system: 'rings', group: 'User', params: { count: 3 }, savedAt: 50 }]);
    const store = fakeStore([fileEntry('rings', 'Ocean', { count: 7 }, { id: 'user-rings-100', savedAt: 100 })]);
    const res = await S.pullFromFolder({ store });
    expect(res.imported).toBe(1);
    const ids = get('rings').map((p) => p.id).sort();
    expect(ids).toEqual(['user-rings-100', 'user-rings-keep']); // nothing deleted
  });

  it('updates a matched preset only when the disk copy is strictly newer (LWW)', async () => {
    set('rings', [{ id: 'user-rings-1', name: 'Look', preset_system: 'rings', group: 'User', params: { count: 1 }, savedAt: 100 }]);
    const newer = fakeStore([fileEntry('rings', 'Look', { count: 9 }, { id: 'user-rings-1', savedAt: 200 })]);
    const res = await S.pullFromFolder({ store: newer });
    expect(res).toMatchObject({ updated: 1, imported: 0 });
    expect(get('rings')[0].params).toEqual({ count: 9 });
    expect(get('rings')[0].savedAt).toBe(200);
  });

  it('never clobbers a newer (or equal) browser copy', async () => {
    set('rings', [{ id: 'user-rings-1', name: 'Look', preset_system: 'rings', group: 'User', params: { count: 5 }, savedAt: 300 }]);
    // disk is OLDER and also an EQUAL case — neither should win.
    const older = fakeStore([fileEntry('rings', 'Look', { count: 9 }, { id: 'user-rings-1', savedAt: 200 })]);
    expect((await S.pullFromFolder({ store: older })).updated).toBe(0);
    expect(get('rings')[0].params).toEqual({ count: 5 });

    const equal = fakeStore([fileEntry('rings', 'Look', { count: 9 }, { id: 'user-rings-1', savedAt: 300 })]);
    expect((await S.pullFromFolder({ store: equal })).updated).toBe(0);
    expect(get('rings')[0].params).toEqual({ count: 5 });
  });

  it('is idempotent: a second pull with no disk change does nothing', async () => {
    const store = fakeStore([fileEntry('rings', 'Ocean', { count: 7 }, { id: 'user-rings-100', savedAt: 100 })]);
    expect((await S.pullFromFolder({ store })).imported).toBe(1);
    expect(await S.pullFromFolder({ store })).toEqual({ imported: 0, updated: 0, skipped: 0 });
    expect(get('rings')).toHaveLength(1);
  });

  it('a file mtime newer than browser savedAt wins even when meta.savedAt is stale', async () => {
    set('rings', [{ id: 'user-rings-1', name: 'Look', preset_system: 'rings', group: 'User', params: { count: 1 }, savedAt: 100 }]);
    // meta.savedAt is stale (50) but the file was touched later (mtime 500).
    const store = fakeStore([fileEntry('rings', 'Look', { count: 42 }, { id: 'user-rings-1', savedAt: 50, mtime: 500 })]);
    expect((await S.pullFromFolder({ store })).updated).toBe(1);
    expect(get('rings')[0].params).toEqual({ count: 42 });
    expect(get('rings')[0].savedAt).toBe(500);
  });

  it('matches a meta-less file by slugified name and imports it deterministically (no dupes on re-pull)', async () => {
    const entry = {
      system: 'rings', slug: 'hand-made', mtime: 700,
      doc: { type: 'vectura', name: 'Hand Made', layers: [{ type: 'rings', params: { count: 2 } }] },
    };
    const store = fakeStore([entry]);
    expect((await S.pullFromFolder({ store })).imported).toBe(1);
    const first = get('rings');
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe('user-rings-hand-made'); // deterministic from name
    // second pull: matched by name, disk not newer → no dupe, no update
    expect(await S.pullFromFolder({ store })).toEqual({ imported: 0, updated: 0, skipped: 0 });
    expect(get('rings')).toHaveLength(1);
  });

  it('strips transform/seed keys from imported params', async () => {
    const store = fakeStore([fileEntry('rings', 'Ocean', { count: 7, seed: 9, posX: 100, scaleX: 2 }, { id: 'x', savedAt: 1 })]);
    await S.pullFromFolder({ store });
    expect(get('rings')[0].params).toEqual({ count: 7 });
  });

  it('skips malformed / non-preset files without throwing', async () => {
    const store = fakeStore([
      { system: 'rings', slug: 'a', mtime: 0, doc: { not: 'vectura' } },        // wrong type
      { system: 'rings', slug: 'b', mtime: 0, doc: { type: 'vectura' } },        // no layers
      { system: 'rings', slug: 'c', mtime: 0, doc: { type: 'vectura', layers: [{ type: 'rings' }] } }, // no params
      fileEntry('rings', 'Good', { count: 1 }, { id: 'ok', savedAt: 1 }),         // valid
    ]);
    const res = await S.pullFromFolder({ store });
    expect(res).toEqual({ imported: 1, updated: 0, skipped: 3 });
  });

  it('resolves to all-zero with no store / empty folder (never throws)', async () => {
    expect(await S.pullFromFolder({ store: null })).toEqual({ imported: 0, updated: 0, skipped: 0 });
    expect(await S.pullFromFolder({ store: fakeStore([]) })).toEqual({ imported: 0, updated: 0, skipped: 0 });
  });

  it('buildDoc round-trips through parseDoc (the write/read format is one contract)', () => {
    const preset = { id: 'user-rings-1', name: 'Round Trip', group: 'User', params: { count: 4 }, savedAt: 123 };
    const doc = S.buildDoc('rings', preset);
    expect(doc.type).toBe('vectura');
    expect(doc.meta).toEqual({ presetId: 'user-rings-1', group: 'User', system: 'rings', savedAt: 123 });
    const parsed = S.parseDoc('rings', doc, 'round-trip', 0);
    expect(parsed).toMatchObject({ id: 'user-rings-1', name: 'Round Trip', group: 'User', savedAt: 123 });
    expect(parsed.params).toEqual({ count: 4 });
  });
});
