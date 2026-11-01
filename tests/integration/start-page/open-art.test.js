/**
 * Start Page "open in exactly the colors shown": StartPageOpenArt.open drives a saved work and a studio pick
 * into the real editor with the resolved colorway frozen into the document (paper + pens), as a dirty,
 * unsaved "<name> (colorway)" document that never overwrites the original recent.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const WILD = { paper: '#1f3a8a', ink: '#e8c15a', ink2: '#ffffff', paperType: 'none' };

describe('StartPageOpenArt.open', () => {
  let runtime;
  let window;
  let V;
  let app;
  let O;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    window = runtime.window;
    V = window.Vectura;
    window.eval(fs.readFileSync(path.resolve(__dirname, '../../../src/ui/start-page/open-art.js'), 'utf8'));
    O = V.StartPageOpenArt;
    app = window.app = new V.App();
    await tick();
    app.markDocumentClean();
  });
  afterEach(() => { try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ } runtime?.cleanup?.(); });

  const makeWork = async (name = 'hills.vectura') => {
    app.engine.addLayer('wavetable');
    app.pushHistory();
    const entry = await app.recents.record({
      name, source: 'open', algorithm: 'Wavetable', paper: 'A3', pens: [{ color: '#111111', width: 0.3 }], thumb: null,
      payload: { type: 'vectura', version: 'x', state: app.captureState(), images: {} },
    });
    app.markDocumentClean(); // as after an Open/Save: no confirmation dialog in the way
    return entry;
  };
  const layerColors = () => app.engine.layers.filter((l) => !l.isGroup).map((l) => l.color);
  const workArt = (entry, name = 'hills') => ({ id: `work:${entry.id}`, kind: 'work', name, workId: entry.id, recentId: entry.id });

  test('StartPageArtRenderer.presetPayload builds a loadable document without touching live settings', () => {
    const before = JSON.stringify(V.SETTINGS);
    const preset = V.PRESETS.find((p) => p.id === 'lissajous-star');
    const payload = V.StartPageArtRenderer.presetPayload(preset);
    expect(JSON.stringify(V.SETTINGS)).toBe(before);
    expect(payload.type).toBe('vectura');
    expect(payload.state.engine.layers.length).toBeGreaterThan(0);
    expect(payload.state.settings.pens[0].id).toBe('pen-1');
    expect(payload.state.settings.paper.color).toBe('#f4efe4');
    expect(() => V.StartPageArtRenderer.presetPayload({ id: 'x' })).toThrow(/preset/);
  });

  test('a work opens in exactly the colorway: paper, pens and layer colors', async () => {
    const entry = await makeWork();
    expect(await O.open(workArt(entry), WILD, { app })).toBe(true);
    const S = V.SETTINGS;
    expect(S.paper.color).toBe('#1f3a8a');
    expect(S.paper.type).toBe('none');
    expect(S.bgColor).toBe('#1f3a8a');
    const used = app.engine.layers.filter((l) => !l.isGroup).map((l) => l.penId);
    expect(S.pens.find((p) => p.id === used[0]).color).toBe('#e8c15a');
    expect(layerColors().every((c) => c === '#e8c15a')).toBe(true);
  });

  test('the recolored document is dirty, named "<name> (colorway)" and not attached to the original recent', async () => {
    const entry = await makeWork();
    await O.open(workArt(entry), WILD, { app });
    expect(app.isDocumentDirty()).toBe(true);
    expect(app.documentName).toBe('hills (colorway)');
    expect(app.currentRecentId).toBeNull();
  });

  test('opening a copy again never stacks suffixes', async () => {
    const entry = await makeWork('hills (colorway).vectura');
    await O.open(workArt(entry, 'hills (colorway)'), { paper: '#ffffff', ink: '#111111' }, { app });
    expect(app.documentName).toBe('hills (colorway)');
    app.markDocumentClean();
    await O.open(workArt(entry, 'hills copy (colorway)'), { paper: '#ffffff', ink: '#222222' }, { app, asTemplate: true });
    expect(app.documentName).toBe('hills copy');
  });

  test('asTemplate names the document "<name> copy"', async () => {
    const entry = await makeWork();
    await O.open(workArt(entry), WILD, { app, asTemplate: true });
    expect(app.documentName).toBe('hills copy');
    expect(app.isDocumentDirty()).toBe(true);
    expect(V.SETTINGS.paper.color).toBe('#1f3a8a');
  });

  test('Save writes a NEW recent and leaves the original recent\'s stored copy untouched', async () => {
    const entry = await makeWork();
    const originalDoc = JSON.stringify(await app.recents.store.getDoc(entry.id));
    const countBefore = (await app.recents.store.listWorks()).length;
    await O.open(workArt(entry), WILD, { app });
    V.Download = { ...(V.Download || {}), saveBlob: () => Promise.resolve('saved') };
    app.ui.saveVecturaFile();
    await tick(120);
    const works = await app.recents.store.listWorks();
    expect(works.length).toBe(countBefore + 1);
    expect(JSON.stringify(await app.recents.store.getDoc(entry.id))).toBe(originalDoc);
    const fresh = works.find((w) => w.id !== entry.id);
    const savedDoc = await app.recents.store.getDoc(fresh.id);
    expect(savedDoc.state.settings.paper.color).toBe('#1f3a8a');
    expect(app.isDocumentDirty()).toBe(false);
  });

  test('a studio pick opens as a new unsaved document in the colorway', async () => {
    const preset = V.PRESETS.find((p) => p.id === 'lissajous-star');
    const art = { id: `pick:${preset.id}`, kind: 'pick', name: 'Lissajous Star', presetId: preset.id };
    expect(await O.open(art, WILD, { app })).toBe(true);
    expect(V.SETTINGS.paper.color).toBe('#1f3a8a');
    expect(V.SETTINGS.pens[0].color).toBe('#e8c15a');
    expect(layerColors().every((c) => c === '#e8c15a')).toBe(true);
    expect(app.engine.layers.some((l) => l.type === 'lissajous')).toBe(true);
    expect(app.isDocumentDirty()).toBe(true);
    expect(app.documentName).toBe('Lissajous Star (colorway)');
    expect(app.currentRecentId).toBeNull();
  });

  test('a special fill opens as the representative solid ink and keeps the fill in settings', async () => {
    const entry = await makeWork();
    await O.open(workArt(entry), { paper: '#101010', paperType: 'none', fill: 'metallic-gold' }, { app });
    expect(V.SETTINGS.pens.find((p) => p.id === app.engine.layers[0].penId).color).toBe(O.FILL_INKS['metallic-gold']);
    expect(V.SETTINGS.startPageFill).toMatchObject({ kind: 'metallic-gold' });
    // a following plain open clears it (the first open left an unsaved copy, so confirm the replace)
    vi.spyOn(app, 'confirmDiscardChanges').mockResolvedValue(true);
    await O.open(workArt(entry), WILD, { app });
    expect(V.SETTINGS.startPageFill).toBeUndefined();
  });

  test('unsaved work asks first; Keep editing leaves the editor and returns false', async () => {
    const entry = await makeWork();
    app.engine.addLayer('rings');
    app.pushHistory();
    const layersBefore = app.engine.layers.length;
    const paperBefore = V.SETTINGS.paper.color;
    const confirm = vi.spyOn(app, 'confirmDiscardChanges').mockResolvedValue(false);
    expect(await O.open(workArt(entry), WILD, { app })).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(app.engine.layers.length).toBe(layersBefore);
    expect(V.SETTINGS.paper.color).toBe(paperBefore);
    confirm.mockResolvedValue(true);
    expect(await O.open(workArt(entry), WILD, { app })).toBe(true);
    expect(V.SETTINGS.paper.color).toBe('#1f3a8a');
  });

  test('a work with no stored copy fails softly and leaves the editor alone', async () => {
    const paperBefore = V.SETTINGS.paper.color;
    expect(await O.open({ id: 'work:nope', kind: 'work', name: 'gone', recentId: 'nope' }, WILD, { app })).toBe(false);
    expect(V.SETTINGS.paper.color).toBe(paperBefore);
  });
});
