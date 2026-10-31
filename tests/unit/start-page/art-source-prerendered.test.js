/*
 * Pre-rendered Start Page picks: the fetch-then-fallback logic in art-source.js, and a freshness guard that
 * fails when assets/start-page/picks/*.svg or the manifest drift from the bundled presets (run
 * `npm run start-page:picks` to regenerate).
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

const load = (files, extra = {}) => {
  const win = { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, ...extra };
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Error, Object, Array, encodeURIComponent });
  files.forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return win.Vectura;
};

describe('pre-rendered picks: fetch then fall back', () => {
  let V; let renders; let renderer; let fetched; let preset;
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
  const manifest = (over = {}) => ({ version: 'r1', path: './assets/start-page/picks/', hashByPick: { 'wavetable-aa': V.StartPageArtSource.hashOf(preset) }, ...over });
  const mk = (o = {}) => V.StartPageArtSource.create({
    store: { listWorks: async () => [] }, renderer, presets: [preset],
    picks: { STUDIO_PICKS: ['wavetable-aa'], PICK_NAMES: {}, collectionFor: () => 'Studies' },
    cache: V.StartPageArtSource.createCache(() => makeFakeIdb(), 'r1'), ...o,
  });
  const first = async (source) => (await source.list())[0];

  beforeEach(() => {
    V = load(['src/config/start-page.js', 'src/core/recents-store.js', 'src/config/start-page-picks.js', 'src/ui/start-page/art-source.js']);
    preset = { id: 'wavetable-aa', name: 'Aa', preset_system: 'wavetable', params: { amp: 3 } };
    renders = 0; fetched = [];
    renderer = { renderPreset: async () => { renders += 1; return { svg: '<svg data-live="1"/>', ownColors: { paper: '#f4efe4', ink: '#111111', penName: 'Pen 1', paperName: 'Paper' }, algorithm: 'wavetable', bytes: 5 }; } };
  });
  const okFetch = async (url) => { fetched.push(url); return { ok: true, text: async () => SVG }; };

  it('uses the pre-rendered file when the manifest hash matches, without a live render', async () => {
    const art = await first(mk({ prerendered: manifest(), fetch: okFetch }));
    expect(await art.getSvg()).toBe(SVG);
    expect(fetched).toEqual(['./assets/start-page/picks/wavetable-aa.svg']);
    expect(renders).toBe(0);
    expect(art.ownColors).toMatchObject({ paper: '#f4efe4', ink: '#111111' });
  });

  it('caches the fetched art: a second source over the same cache does not fetch again', async () => {
    const cache = V.StartPageArtSource.createCache(() => makeFakeIdb(), 'r1');
    await (await first(mk({ cache, prerendered: manifest(), fetch: okFetch }))).getSvg();
    await (await first(mk({ cache, prerendered: manifest(), fetch: okFetch }))).getSvg();
    expect(fetched.length).toBe(1);
  });

  it('renders live when the preset changed since the file was built (stale hash), never fetching', async () => {
    const art = await first(mk({ prerendered: manifest({ hashByPick: { 'wavetable-aa': 'old' } }), fetch: okFetch }));
    expect(await art.getSvg()).toBe('<svg data-live="1"/>');
    expect(fetched).toEqual([]);
    expect(renders).toBe(1);
  });

  it('renders live when the manifest render version differs from RENDER_VERSION', async () => {
    const art = await first(mk({ prerendered: manifest({ version: 'r0' }), fetch: okFetch }));
    expect(await art.getSvg()).toBe('<svg data-live="1"/>');
    expect(fetched).toEqual([]);
  });

  it.each([
    ['network error', async () => { throw new TypeError('Failed to fetch'); }],
    ['404', async () => ({ ok: false, text: async () => 'nope' })],
    ['non-SVG body', async () => ({ ok: true, text: async () => '<html>spa fallback</html>' })],
  ])('falls back to the live render on %s', async (_n, fetch) => {
    const art = await first(mk({ prerendered: manifest(), fetch }));
    expect(await art.getSvg()).toBe('<svg data-live="1"/>');
    expect(renders).toBe(1);
  });

  it('renders live with no manifest or no fetch (file:// open)', async () => {
    expect(await (await first(mk({ prerendered: null, fetch: okFetch }))).getSvg()).toBe('<svg data-live="1"/>');
    expect(await (await first(mk({ prerendered: manifest(), fetch: null }))).getSvg()).toBe('<svg data-live="1"/>');
  });
});

describe('pre-rendered picks: committed files match the bundled presets', () => {
  it('every STUDIO_PICK has an SVG file and a current manifest hash (run `npm run start-page:picks`)', () => {
    const V = load(['src/config/start-page.js', 'src/core/recents-store.js', 'src/config/user-presets.js', 'src/config/start-page-picks.js',
      'src/config/start-page-picks-art.js', 'src/ui/start-page/art-source.js']);
    const art = V.START_PAGE_PICKS_ART;
    expect(art, 'START_PAGE_PICKS_ART manifest').toBeTruthy();
    expect(art.version).toBe(V.StartPageArtSource.RENDER_VERSION);
    const byId = new Map(V.PRESETS.map((p) => [p.id, p]));
    for (const id of V.START_PAGE_PICKS.STUDIO_PICKS) {
      expect(byId.has(id), `${id} is a bundled preset`).toBe(true);
      const file = path.join(ROOT, 'assets/start-page/picks', `${id}.svg`);
      expect(fs.existsSync(file), `${id}.svg exists`).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toMatch(/^\s*(<\?xml[^>]*\?>\s*)?<svg\b/);
      expect(art.hashByPick[id], `${id} manifest hash is current`).toBe(V.StartPageArtSource.hashOf(byId.get(id)));
    }
    // the manifest also covers the five example plates (same pipeline)
    const wanted = new Set([...V.START_PAGE_PICKS.STUDIO_PICKS, ...V.START_PAGE_PICKS.EXAMPLE_PLATES.map((e) => e.presetId)]);
    expect(Object.keys(art.hashByPick).sort()).toEqual([...wanted].sort());
  });
});
