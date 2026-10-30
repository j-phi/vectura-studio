/**
 * Start Page art renderer: a private engine renders documents and presets to
 * plotter SVG without disturbing the live editor state.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('StartPageArtRenderer', () => {
  let runtime;
  let window;
  let V;
  let R;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    window = runtime.window;
    V = window.Vectura;
    R = V.StartPageArtRenderer;
  }, 60000);
  afterAll(() => runtime.cleanup());

  // A saved-document payload built on a throwaway engine: a5 portrait, blue pen, cream paper.
  const makeDoc = (extraSettings = {}) => {
    const saved = clone(V.SETTINGS);
    try {
      const e = new V.VectorEngine();
      e.addShapeLayer('Zig', [[{ x: 20, y: 20 }, { x: 60, y: 60 }, { x: 100, y: 20 }]]);
      const doc = {
        type: 'vectura',
        state: {
          engine: e.exportState(),
          settings: {
            paperSize: 'a5', paperOrientation: 'portrait', margin: 5, precision: 3, strokeWidth: 0.4,
            truncate: true, cropExports: true, removeHiddenGeometry: true,
            paper: { type: 'none', color: '#fafaf0' },
            pens: [{ id: 'pen-1', name: 'Prussian', color: '#336699', width: 0.4 }],
            ...extraSettings,
          },
        },
        images: {},
      };
      return doc;
    } finally {
      Object.assign(V.SETTINGS, saved);
    }
  };

  const liveState = () => JSON.stringify(V.SETTINGS);

  test('renders a document with the document\'s own paper and pen, never the live ones', async () => {
    const before = liveState();
    const out = await R.renderDocument(makeDoc());
    expect(out.svg).toMatch(/viewBox="0 0 148 210"/);
    expect(out.svg).toContain('stroke="#336699"');
    expect(out.pathCount).toBeGreaterThan(0);
    expect(out.bytes).toBe(Buffer.byteLength(out.svg));
    expect(out.algorithm).toBe('shape');
    expect(out.ownColors).toEqual({ paper: '#fafaf0', ink: '#336699', penName: 'Prussian', paperName: 'None' });
    expect(liveState()).toBe(before);
  });

  test('leaves SETTINGS, the live engine and NOISE_IMAGES untouched when a render succeeds', async () => {
    const live = new V.VectorEngine();
    live.addLayer('lissajous');
    const liveBefore = JSON.stringify(live.exportState());
    const settingsBefore = liveState();
    const imagesBefore = V.NOISE_IMAGES;
    const imageIdsBefore = Object.keys(imagesBefore || {});
    const doc = makeDoc();
    doc.images = { 'noise-test-1': { width: 1, height: 1, data: [0, 0, 0, 255] } };
    await R.renderDocument(doc);
    await R.renderPreset(V.PRESETS.find((p) => p.id === 'lissajous-star'));
    expect(liveState()).toBe(settingsBefore);
    expect(JSON.stringify(live.exportState())).toBe(liveBefore);
    expect(live.layers).toHaveLength(1);
    expect(V.NOISE_IMAGES).toBe(imagesBefore);
    expect(Object.keys(V.NOISE_IMAGES || {})).toEqual(imageIdsBefore);
  });

  test('restores SETTINGS even when the render throws after the document settings were applied', async () => {
    const settingsBefore = liveState();
    const bad = makeDoc({ margin: 77, paperSize: 'a3' });
    bad.state.engine.layers = [null]; // importState throws once the settings are already swapped in
    const imagesBefore = Object.keys(V.NOISE_IMAGES || {});
    bad.images = { 'noise-bad-1': { width: 1, height: 1, data: [1, 2, 3, 4] } };
    await expect(R.renderDocument(bad)).rejects.toBeTruthy();
    expect(liveState()).toBe(settingsBefore);
    expect(Object.keys(V.NOISE_IMAGES || {})).toEqual(imagesBefore);
    await expect(R.renderDocument({ nope: true })).rejects.toThrow(/Vectura document/);
    await expect(R.renderPreset({ id: 'x' })).rejects.toThrow(/preset/);
    expect(liveState()).toBe(settingsBefore);
    // The queue survives a failure: the next render still works.
    const ok = await R.renderPreset(V.PRESETS.find((p) => p.id === 'lissajous-star'));
    expect(ok.svg).toContain('<path');
  });

  test('renders are queued one at a time on idle callbacks', async () => {
    const calls = [];
    let active = 0;
    let maxActive = 0;
    window.requestIdleCallback = (fn, opts) => { calls.push(opts); return setTimeout(fn, 0); };
    const RealEngine = V.VectorEngine;
    V.VectorEngine = class extends RealEngine {
      constructor() { super(); active += 1; maxActive = Math.max(maxActive, active); Promise.resolve().then(() => { active -= 1; }); }
    };
    try {
      const ids = ['lissajous-star', 'lissajous-clover', 'lissajous-trefoil'];
      const outs = await Promise.all(ids.map((id) => R.renderPreset(V.PRESETS.find((p) => p.id === id))));
      expect(outs).toHaveLength(3);
      expect(calls).toHaveLength(3);
      expect(calls[0]).toEqual({ timeout: 1500 });
      expect(maxActive).toBe(1);
      expect(new Set(outs.map((o) => o.svg)).size).toBe(3);
    } finally {
      V.VectorEngine = RealEngine;
      delete window.requestIdleCallback;
    }
  });

  test('a preset renders to the same SVG every time (its own seed, not a random one)', async () => {
    const preset = V.PRESETS.find((p) => p.id === 'rings-ancient-redwood');
    const a = await R.renderPreset(preset);
    const b = await R.renderPreset(preset);
    expect(a.svg).toBe(b.svg);
    expect(a.ownColors.paperName).toBe('Paper');
  });

  describe('every studio pick draws', () => {
    const picks = () => V.START_PAGE_PICKS.STUDIO_PICKS;
    test('the pick list is real: unique ids, all bundled presets, 6-10 of them', () => {
      expect(picks().length).toBeGreaterThanOrEqual(6);
      expect(picks().length).toBeLessThanOrEqual(10);
      expect(new Set(picks()).size).toBe(picks().length);
      picks().forEach((id) => expect(V.PRESETS.find((p) => p.id === id), id).toBeTruthy());
    });

    test.each([
      'wavetable-rolling-hills', 'terrain-alpine', 'topo-island', 'flowfield-still-pool',
      'rings-ancient-redwood', 'chrysanthemum-morifolium', 'harmonograph-4-3-star', 'scene3d-studio-shadows',
    ])('%s renders a non-empty SVG', async (id) => {
      expect(picks()).toContain(id);
      const preset = V.PRESETS.find((p) => p.id === id);
      const out = await R.renderPreset(preset);
      expect(out.svg.startsWith('<?xml')).toBe(true);
      expect(out.pathCount).toBeGreaterThanOrEqual(1);
      expect(out.bytes).toBeGreaterThan(5000); // one long stroke or many; either way real ink
      expect(out.svg).toContain('<path');
      expect(out.algorithm).toBe(preset.preset_system);
    }, 60000);
  });

  test('a preset with no UI apply path (text) renders through importState', async () => {
    const out = await R.renderPreset(V.PRESETS.find((p) => p.id === 'text-headline'));
    expect(out.algorithm).toBe('text');
    expect(out.pathCount).toBeGreaterThan(5);
  });

  test('stats track the slowest render', async () => {
    const s = R.stats();
    expect(s.count).toBeGreaterThan(5);
    expect(s.slowestMs).toBeGreaterThanOrEqual(s.lastMs);
    expect(typeof s.slowestId).toBe('string');
  });
});
