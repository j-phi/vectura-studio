/**
 * Start Page cover word logic (src/core/start-page/cover-words.js): which word the cover sets, which choices
 * are available, how letters get pieces. Pure: no DOM.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let W;
beforeAll(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  for (const rel of ['src/config/start-page.js', 'src/core/start-page/cover-words.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  }
  W = dom.window.Vectura.StartPageCoverWords;
});

const prefs = (over = {}) => ({ coverWord: 'vectura', customWord: '', name: '', ...over });

describe('cover word resolution', () => {
  it('maps every ENUM choice to a word', () => {
    expect(W.resolve(prefs()).word).toBe('Vectura');
    expect(W.resolve(prefs({ coverWord: 'vectura-studio' })).word).toBe('Vectura Studio');
    expect(W.resolve(prefs({ coverWord: 'studies' })).word).toBe('Studies');
    expect(W.resolve(prefs({ coverWord: 'botanicals' })).word).toBe('Botanicals');
    expect(W.resolve(prefs({ coverWord: 'experiments' })).word).toBe('Experiments');
    expect(W.resolve(prefs({ coverWord: 'custom', customWord: 'Rings' })).word).toBe('Rings');
  });
  it('uses the name for Last name and First + Last', () => {
    const p = prefs({ name: 'Ada Quill' });
    expect(W.resolve({ ...p, coverWord: 'last-name' }).word).toBe('Quill');
    expect(W.resolve({ ...p, coverWord: 'first-last' }).word).toBe('Ada Quill');
    expect(W.resolve(prefs({ name: 'Plato', coverWord: 'last-name' })).word).toBe('Plato');
  });
  it('falls back to Vectura when a name or custom word is missing', () => {
    expect(W.resolve(prefs({ coverWord: 'last-name' })).word).toBe('Vectura');
    expect(W.resolve(prefs({ coverWord: 'first-last' })).fellBack).toBe(true);
    expect(W.resolve(prefs({ coverWord: 'custom', customWord: '' })).word).toBe('Vectura');
  });
  it('lists the choices and disables the name ones until there is a name', () => {
    const list = W.choices(prefs());
    expect(list.map((c) => c.id)).toEqual(['vectura', 'vectura-studio', 'last-name', 'first-last', 'studies', 'botanicals', 'experiments', 'custom']);
    expect(list.find((c) => c.id === 'first-last').disabled).toBe(true);
    expect(list.find((c) => c.id === 'first-last').hint).toBe('Add name');
    expect(W.choices(prefs({ name: 'Ada Quill' })).find((c) => c.id === 'first-last').disabled).toBe(false);
    expect(list.find((c) => c.id === 'vectura').selected).toBe(true);
  });
  it('splits a word into letters, skipping spaces', () => {
    expect(W.letters('Vectura')).toHaveLength(7);
    expect(W.letters('Vectura Studio').map((l) => l.ch).join('')).toBe('VecturaStudio');
  });
});

describe('piece assignment', () => {
  const arts = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, bytes: 1000 + i * 100 }));
  it('gives seven letters seven distinct pieces when there are enough', () => {
    const out = W.assignArts(W.letters('Vectura').map((l) => l.ch), arts);
    expect(out).toHaveLength(7);
    expect(new Set(out.map((a) => a.id)).size).toBe(7);
  });
  it('gives a piece with a coverSlot its own letter and keeps it away from earlier letters', () => {
    const slotted = [{ id: 's-last', bytes: 1, coverSlot: 2 }, { id: 'dense', bytes: 99999 }, { id: 'plain', bytes: 5 }];
    const out = W.assignArts(['V', 'i', 'c'], slotted);
    expect(out.map((a) => a.id)).toEqual(['dense', 'plain', 's-last']);
  });
  it('puts the densest unused piece on a thin letter', () => {
    const out = W.assignArts(['i'], arts);
    expect(out[0].id).toBe('a7');
  });
  it('tops up with studio picks before reusing any work', () => {
    const works = [0, 1, 2].map((i) => ({ id: `w${i}`, kind: 'work', bytes: 5000 }));
    const picks = [0, 1, 2, 3].map((i) => ({ id: `p${i}`, kind: 'pick', bytes: 1000 }));
    const chars = W.letters('Vectura').map((l) => l.ch);
    const out = W.assignArts(chars, picks.concat(works));
    expect(new Set(out.map((a) => a.id)).size).toBe(7);
    expect(out.filter((a) => a.kind === 'work')).toHaveLength(3);
    const short = W.assignArts(chars, works.concat(picks.slice(0, 2)));
    expect(new Set(short.map((a) => a.id)).size).toBe(5);
  });
  it('reuses pieces when there are fewer than letters, and returns [] for none', () => {
    const out = W.assignArts(W.letters('Vectura').map((l) => l.ch), arts.slice(0, 2));
    expect(out).toHaveLength(7);
    expect(new Set(out.map((a) => a.id)).size).toBe(2);
    expect(W.assignArts(['a'], [])).toEqual([]);
  });
});
