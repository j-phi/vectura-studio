/*
 * Unit tests for src/ui/start-page/art-source.js — window.Vectura.StartPageArtSource.
 * Real RecentsStore + real art-source + picks config over the in-memory IndexedDB fake;
 * the renderer is a counting stub (its real behavior is covered by the integration test).
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

const idbHolder = { idb: null };
const loadModules = () => {
  const listeners = new Map();
  const win = {
    dispatchEvent: (e) => { (listeners.get(e.type) || []).forEach((fn) => fn(e)); return true; },
    addEventListener: (t, fn) => { listeners.set(t, (listeners.get(t) || []).concat(fn)); },
    removeEventListener: (t, fn) => { listeners.set(t, (listeners.get(t) || []).filter((f) => f !== fn)); },
    CustomEvent: class { constructor(type) { this.type = type; } },
    get indexedDB() { return idbHolder.idb; },
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, structuredClone, JSON, Promise, Map, Set, Date, Math, Error, Object, Array });
  ['src/config/start-page.js', 'src/core/recents-store.js', 'src/config/start-page-picks.js', 'src/ui/start-page/art-source.js']
    .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }));
  return win.Vectura;
};

const GROUND = '<rect x="0" y="0" width="297" height="210" fill="#e8e0d0"/>';
const svgThumb = `<svg viewBox="0 0 297 210" xmlns="http://www.w3.org/2000/svg">${GROUND}<g stroke="#123456"><path d="M 0 0 L 5 5"/></g></svg>`;
const doc = (n) => ({ type: 'vectura', state: { engine: { layers: [] }, settings: {} }, n });

describe('StartPageArtSource', () => {
  let V; let idb; let clock; let store; let renders; let renderer;
  const presets = [
    { id: 'wavetable-aa', name: 'Aa', preset_system: 'wavetable', params: {} },
    { id: 'rings-bb', name: 'Bb', preset_system: 'rings', params: {} },
    { id: 'scene3d-cc', name: 'Cc', preset_system: 'scene3d', params: {} },
  ];
  const picks = () => ({ STUDIO_PICKS: ['wavetable-aa', 'rings-bb', 'scene3d-cc', 'gone-dd'], PICK_NAMES: { 'rings-bb': 'Redwood' }, collectionFor: V.START_PAGE_PICKS.collectionFor });
  // Each call builds a source with its OWN cache over the shared fake IndexedDB (window.indexedDB).
  const mkSource = (version = '9.9.9') => V.StartPageArtSource.create({ store, renderer, presets, picks: picks(), version });

  beforeEach(() => {
    V = loadModules();
    idb = makeFakeIdb();
    idbHolder.idb = idb;
    clock = 1_700_000_000_000;
    store = V.RecentsStore.create({ indexedDB: () => idb, now: () => clock });
    renders = { doc: 0, preset: 0 };
    renderer = {
      renderDocument: async (d) => { renders.doc += 1; return { svg: `<svg data-doc="${d.n}"/>`, ownColors: { paper: '#ffffff', ink: '#000000', penName: 'P', paperName: 'None' }, algorithm: 'flowfield', bytes: 10 }; },
      renderPreset: async (p) => { renders.preset += 1; return { svg: `<svg data-preset="${p.id}"/>`, ownColors: { paper: '#f4efe4', ink: '#111111', penName: 'Pen 1', paperName: 'Paper' }, algorithm: p.preset_system, bytes: 10 }; },
    };
  });

  const seed = async () => {
    const tick = () => { clock += 1000; };
    await store.record({ name: 'one.vectura', algorithm: 'Rings', pens: [{ color: '#223344', width: 0.3 }], thumb: { kind: 'svg', data: svgThumb }, payload: doc(1), source: 'open' }); tick();
    await store.record({ name: 'two.vectura', algorithm: 'Wavetable', pens: [], thumb: { kind: 'png', data: 'data:image/png;base64,AAAA' }, payload: doc(2), source: 'open' }); tick();
    await store.record({ name: 'three.vectura', algorithm: 'Boids', pens: [], thumb: null, payload: doc(3), source: 'open' }); tick();
    // Re-opening "one" makes it the most recent without changing its addedAt.
    await store.record({ name: 'one.vectura', algorithm: 'Rings', pens: [{ color: '#223344', width: 0.3 }], thumb: { kind: 'svg', data: svgThumb }, payload: doc(1), source: 'open' });
  };

  const newSource = mkSource;

  it('list(): works in addedAt order, then studio picks (unknown pick ids dropped)', async () => {
    await seed();
    const arts = await mkSource().list();
    expect(arts.map((a) => a.id)).toEqual([
      expect.stringMatching(/^work:/), expect.stringMatching(/^work:/), expect.stringMatching(/^work:/),
      'pick:wavetable-aa', 'pick:rings-bb', 'pick:scene3d-cc',
    ]);
    expect(arts.slice(0, 3).map((a) => a.name)).toEqual(['one', 'two', 'three']);
    expect(arts.slice(0, 3).every((a) => a.kind === 'work' && a.workId === a.recentId)).toBe(true);
    expect(arts.slice(3).every((a) => a.kind === 'pick' && a.presetId)).toBe(true);
    expect(arts[4].name).toBe('Redwood');
    expect(arts[3].name).toBe('Aa');
  });

  it('listRecentFirst(): works by last opened, newest first, then picks', async () => {
    await seed();
    const arts = await mkSource().listRecentFirst();
    expect(arts.slice(0, 3).map((a) => a.name)).toEqual(['one', 'three', 'two']);
    expect(arts.slice(3).map((a) => a.kind)).toEqual(['pick', 'pick', 'pick']);
  });

  it('first-run user (no saved works) gets the picks', async () => {
    const arts = await mkSource().list();
    expect(arts.map((a) => a.kind)).toEqual(['pick', 'pick', 'pick']);
  });

  it('assigns collections from the algorithm and never invents "Commissions"', async () => {
    await seed();
    const arts = await mkSource().list();
    expect(arts.map((a) => a.collection)).toEqual(['Botanicals', 'Studies', 'Experiments', 'Studies', 'Botanicals', 'Experiments']);
    const { COLLECTIONS, COLLECTION_NAMES, STUDIO_PICKS, collectionFor } = V.START_PAGE_PICKS;
    expect(COLLECTION_NAMES).toEqual(['Studies', 'Botanicals', 'Experiments']);
    expect(new Set(Object.values(COLLECTIONS))).toEqual(new Set(COLLECTION_NAMES));
    expect(JSON.stringify(V.START_PAGE_PICKS)).not.toMatch(/commission/i);
    expect(collectionFor('somethingNew')).toBe('Studies');
    expect(STUDIO_PICKS.length).toBeGreaterThanOrEqual(6);
  });

  it('a work with an SVG thumbnail uses it (ground removed, paper color read) without rendering', async () => {
    await seed();
    const one = (await mkSource().list())[0];
    const svg = await one.getSvg();
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('<path d="M 0 0 L 5 5"/>');
    expect(one.ownColors).toMatchObject({ paper: '#e8e0d0', ink: '#223344' });
    expect(renders).toEqual({ doc: 0, preset: 0 });
  });

  it('a work with a PNG thumbnail shows in its recorded paper and ink (old entries fall back to the SVG ground / first pen)', async () => {
    await store.record({ name: 'big.vectura', algorithm: 'Rings', pens: [{ color: '#223344', width: 0.3 }], thumb: { kind: 'png', data: 'data:image/png;base64,AAAA' }, paperColor: '#14181f', inkColor: '#f2d27a', payload: doc(7), source: 'open' });
    clock += 1000;
    await store.record({ name: 'old.vectura', algorithm: 'Rings', pens: [{ color: '#223344', width: 0.3 }], thumb: { kind: 'png', data: 'data:image/png;base64,AAAA' }, payload: doc(8), source: 'open' });
    const arts = await mkSource().list();
    const big = arts.find((a) => a.name === 'big');
    const old = arts.find((a) => a.name === 'old');
    expect(big.ownColors).toMatchObject({ paper: '#14181f', ink: '#f2d27a' });
    expect(old.ownColors).toMatchObject({ ink: '#223344' }); // no stored paper: the fallback paper, but the first pen's ink
  });

  it('a work without an SVG thumbnail renders its stored document once and caches it', async () => {
    await seed();
    const source = newSource();
    const [, two] = await source.list();
    expect(await two.getSvg()).toBe('<svg data-doc="2"/>');
    expect(renders.doc).toBe(1);
    expect(await two.getSvg()).toBe('<svg data-doc="2"/>');
    expect(renders.doc).toBe(1);
  });

  it('cache hit avoids re-render across a fresh source (persisted) and across app versions; changed content re-renders', async () => {
    const first = newSource();
    const [pick] = await first.list();
    await pick.getSvg();
    await pick.getSvg();
    expect(renders.preset).toBe(1);

    renders.preset = 0;
    const again = newSource();
    const [pick2] = await again.list();
    expect(await pick2.getSvg()).toBe('<svg data-preset="wavetable-aa"/>');
    expect(pick2.ownColors.paper).toBe('#f4efe4');
    expect(renders.preset).toBe(0);

    // A patch release (new app version) keeps the cache: the key is the piece's content, not the version.
    const next = newSource('10.0.0');
    const [pick3] = await next.list();
    await pick3.getSvg();
    expect(renders.preset).toBe(0);

    // The same id with different content is a different piece.
    const edited = V.StartPageArtSource.create({
      store, renderer, version: '10.0.0', picks: picks(),
      presets: presets.map((p) => (p.id === 'wavetable-aa' ? { ...p, params: { amp: 2 } } : p)),
    });
    const [pick4] = await edited.list();
    await pick4.getSvg();
    expect(renders.preset).toBe(1);
  });

  it('concurrent getSvg() calls share one render', async () => {
    const [pick] = await newSource().list();
    await Promise.all([pick.getSvg(), pick.getSvg(), pick.getSvg()]);
    expect(renders.preset).toBe(1);
  });

  it('subscribe() fires when saved works change and can be undone', async () => {
    const source = mkSource();
    let n = 0;
    const off = source.subscribe(() => { n += 1; });
    await store.record({ name: 'x.vectura', algorithm: 'Rings', pens: [], thumb: null, payload: doc(9), source: 'open' });
    expect(n).toBe(1);
    off();
    await store.record({ name: 'y.vectura', algorithm: 'Rings', pens: [], thumb: null, payload: doc(10), source: 'open' });
    expect(n).toBe(1);
  });

  it('a 3D Scene work registers its stored scene as a live model and carries its key as sceneId', async () => {
    const seen = [];
    V.StartPageOrbit3D = {
      sceneFromDoc: (d) => (d && d.scene ? { objects: [{ primitive: 'box' }] } : null),
      registerScene: (key, scene, name) => { seen.push([key, name]); return `scene:${key}`; },
    };
    await store.record({ name: 'cube.vectura', algorithm: 'Object 3D', pens: [], thumb: null, payload: Object.assign(doc(4), { scene: true }), source: 'open' });
    clock += 1000;
    await store.record({ name: 'flat.vectura', algorithm: 'Rings', pens: [], thumb: null, payload: Object.assign(doc(5), { scene: true }), source: 'open' });
    const arts = await mkSource().list();
    const cube = arts.find((a) => a.name === 'cube');
    const flat = arts.find((a) => a.name === 'flat');
    expect(cube.sceneId).toMatch(/^work:/);
    expect(seen).toEqual([[cube.sceneId, 'cube']]);
    expect(flat.sceneId).toBeUndefined(); // not a 3D work: its document is never read for a scene
    const recent = await mkSource().listRecentFirst();
    expect(recent.find((a) => a.name === 'cube').sceneId).toBe(cube.sceneId);
  });
});

