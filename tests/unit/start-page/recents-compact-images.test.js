/**
 * Recents keeps a stored copy of a document whose legacy (number-array) noise images would blow the
 * docsMaxBytes budget, by compacting the images before measuring and storing.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { makeFakeIdb } = require('../../helpers/fake-indexeddb.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const load = () => {
  const win = { dispatchEvent: () => true, CustomEvent: class { constructor(t) { this.type = t; } } };
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Error, Uint8ClampedArray, Uint8Array, Buffer, console });
  ['src/config/start-page.js', 'src/core/image-codec.js', 'src/core/recents-store.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  });
  return win.Vectura;
};

const bytes = () => { const a = []; let s = 11; for (let i = 0; i < 40 * 40 * 4; i += 1) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; a.push(s >>> 24); } return a; };

describe('RecentsStore with large legacy images', () => {
  it('stores the compact copy of a document that would exceed docsMaxBytes as number arrays', async () => {
    const V = load();
    V.START_PAGE = { ...V.START_PAGE, LIMITS: { ...V.START_PAGE.LIMITS, docsMaxBytes: 20000 } }; // small budget keeps the test fast
    const d = bytes();
    const payload = {
      type: 'vectura', state: { engine: { layers: [] }, settings: {} },
      images: { a: { width: 40, height: 40, data: d }, b: { width: 40, height: 40, data: d.slice() } },
    };
    expect(JSON.stringify(payload).length).toBeGreaterThan(20000);
    const store = V.RecentsStore.create({ indexedDB: () => makeFakeIdb(), now: () => 1_700_000_000_000 });
    const entry = await store.record({ name: 'Statue', source: 'open', payload });
    expect(entry.hasDoc).toBe(true);
    const doc = await store.getDoc(entry.id);
    expect(doc.images.b.sameAs).toBe('a');
    expect(Array.from(V.ImageCodec.decodeAll(doc.images).b.data)).toEqual(d);
    expect(Array.isArray(payload.images.a.data)).toBe(true); // caller's object untouched
  });
});
