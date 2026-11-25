/**
 * StartPageArtSource: a work whose thumbnail is a PNG (export too big for an SVG thumbnail) but that carries display-only
 * plate lines shows those lines (real <path> polylines, ground stripped), never the blurry <image>.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
const { makeFakeIdb } = require('../../helpers/fake-indexeddb.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const load = () => {
  const win = {
    dispatchEvent: () => true, addEventListener() {}, removeEventListener() {},
    CustomEvent: class { constructor(t) { this.type = t; } },
    atob: (b) => Buffer.from(b, 'base64').toString('latin1'),
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Error, Object, Array });
  ['src/config/start-page.js', 'src/core/recents-store.js', 'src/config/start-page-picks.js', 'src/ui/start-page/art-source.js']
    .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return win.Vectura;
};

// 1x1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PLATE = { kind: 'svg', data: '<svg viewBox="0 0 2600 1838" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="2600" height="1838" fill="#f4efe4"/><g fill="none"><g stroke-width="0.3"><path d="M0 0 100 50 200 0"/></g></g></svg>' };

describe('StartPageArtSource plate lines', () => {
  let V; let store; let idb; let src;
  const record = (over) => store.record({ name: 'statue.vectura', algorithm: 'Wavetable', paper: 'A4', pens: [{ color: '#ffffff', width: 0.3 }], paperColor: '#f4efe4', inkColor: '#222222', payload: { n: 1 }, ...over });
  beforeEach(() => {
    V = load(); idb = makeFakeIdb();
    store = V.RecentsStore.create({ indexedDB: () => idb, now: () => 1_700_000_000_000 });
    const renderer = { renderDocument: async () => { throw new Error('must not render the document when plate lines exist'); }, renderPreset: async () => ({ svg: '<svg/>' }) };
    src = V.StartPageArtSource.create({ store, renderer, presets: [], picks: { STUDIO_PICKS: [], PICK_NAMES: {}, collectionFor: V.START_PAGE_PICKS.collectionFor } });
  });
  const workArt = async () => (await src.list()).find((a) => a.kind === 'work');

  it('prefers the plate over a PNG thumbnail: real <path> polylines, ground stripped, no <image>', async () => {
    await record({ thumb: { kind: 'png', data: PNG }, plate: PLATE });
    const art = await workArt();
    const svg = await art.getSvg();
    expect(svg).toMatch(/<path d="M0 0 100 50 200 0"/);
    expect(svg).not.toMatch(/<image/);
    expect(svg).not.toMatch(/<rect/);
    expect(art.ownColors.paper).toBe('#f4efe4');
  });

  it('an SVG thumbnail still wins over a plate', async () => {
    await record({ thumb: { kind: 'svg', data: '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="#fff"/><g><path d="M1 1 L2 2"/></g></svg>' }, plate: PLATE });
    expect(await (await workArt()).getSvg()).toMatch(/M1 1 L2 2/);
  });

  it('without a plate the PNG fallback is unchanged (last resort <image>)', async () => {
    await record({ thumb: { kind: 'png', data: PNG }, payload: undefined });
    const svg = await (await workArt()).getSvg();
    expect(svg).toMatch(/<image/);
  });
});
