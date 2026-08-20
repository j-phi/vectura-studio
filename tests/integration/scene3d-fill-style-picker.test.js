/**
 * 3D Scene Studio — the Fill Style picker (U9).
 *
 * WHAT THIS PINS
 * --------------
 * The Style surface names two different things and must keep them apart:
 *
 *   "Type"       → the MAPPER: hatch / crosshatch / contour / spiral /
 *                  stipple / wireframe / none. What KIND of fill is drawn.
 *   "Fill Style" → the TONE LAW (`style.params.toneLaw`). HOW that kind is
 *                  drawn — which of the 47 measured laws modulates the ink.
 *
 * The first dropdown used to be labelled "Fill", which left the second one
 * unnameable; renaming it to "Type" is a deliberate contract change and the
 * label assertions here are its regression test.
 *
 * MARK CLASS IS NOT COSMETIC
 * --------------------------
 * The picker groups by MARK CLASS (parallel hatching / crosshatch & multi-
 * angle / flow lines / wavy / dashes / dots / networks), NOT by the roster's
 * tone-MECHANISM families. Crosshatched and single-direction textures occupy
 * separate perceptual clusters (Sterzik, Vollmer & Vollmer, IEEE TVCG 2024),
 * so `penCross` and `penReserve` — which the roster files under the `threePen`
 * mechanism family — must land in the CROSSHATCH group, and a test says so.
 *
 * WHOLE-STYLE-WINS
 * ----------------
 * `src/core/scene3d/style-cascade.js` resolves byFace > byObject > scene with
 * NO per-field merge, and every write replaces the whole style. Two failure
 * modes follow, and both have a test below:
 *   1. a picker that drops a params key silently destroys that setting;
 *   2. a picker that writes the wrong SCOPE appears to do nothing on any
 *      object that declares its own style (the object's style wins over the
 *      scene's, so a scene-scope write never reaches it).
 */

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const styleTable = (byObject = {}, byFace = {}, scene = { penId: null, mapper: 'none', params: {} }) =>
  ({ scene, byObject, byFace });

const fixtureParams = (overrides = {}) => ({
  sceneVersion: 1, seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
  objects: [
    {
      id: 'obj-1', name: 'Sphere 1', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 16 },
      transform: { x: 0, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid',
    },
  ],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: false }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: styleTable(),
  ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════
// 1. The shared config — one taxonomy, read by both surfaces.
// ══════════════════════════════════════════════════════════════════════════

describe('Fill Style — the shared mark-class config', () => {
  let runtime, window, F, R;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    F = window.Vectura.SCENE_FILL_STYLES;
    R = window.Vectura.SCENE3D_TONE_LAWS;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('SCENE_FILL_STYLES is declared beside SCENE_HIGHLIGHT, over the tone-law roster', () => {
    expect(F).toBeTruthy();
    expect(R).toBeTruthy();
    expect(F.DEFAULT).toBe('ladder');
  });

  test('every one of the 47 roster laws has a mark class, and no stray ids', () => {
    expect(R.IDS.length).toBe(47);
    expect(F.assertComplete()).toEqual({ missing: [], unknown: [], stray: [] });
  });

  test('penCross and penReserve are CROSSHATCH, not lumped in with single-direction hatching', () => {
    expect(F.markClass('penCross')).toBe('cross');
    expect(F.markClass('penReserve')).toBe('cross');
    expect(F.markClassLabel('cross')).toMatch(/Crosshatch/);
    // …and the roster still files them by MECHANISM, which is the whole point:
    // the two cuts genuinely disagree, so the picker cannot reuse the roster's
    // own grouping.
    expect(R.BY_ID.penCross.family).toBe('threePen');
    expect(F.markClass('nibAngle')).toBe('hatch');
  });

  test('the production list is the 36 laws plus the shipped default, grouped by mark class', () => {
    const g = F.groups(false);
    const opts = g.reduce((a, x) => a.concat(x.options), []);
    expect(opts.length).toBe(R.PRODUCTION.length + 1);
    expect(opts.map((o) => o.value)).toContain('ladder');
    // No headed-but-empty group is ever rendered.
    g.forEach((grp) => expect(grp.options.length).toBeGreaterThan(0));
    // Groups are mark classes, not tone-mechanism families.
    expect(g.map((x) => x.group)).not.toContain('Three-pen');
  });

  test('the library disclosure adds exactly the 11 demoted laws, each tier-suffixed', () => {
    const prod = F.groups(false).reduce((a, x) => a.concat(x.options), []);
    const all = F.groups(true).reduce((a, x) => a.concat(x.options), []);
    expect(all.length).toBe(prod.length + R.LIBRARY.length);
    const added = all.filter((o) => !prod.some((p) => p.value === o.value)).map((o) => o.value);
    expect(added.sort()).toEqual([...R.LIBRARY].sort());
    all.filter((o) => R.LIBRARY.indexOf(o.value) !== -1)
      .forEach((o) => expect(o.label).toContain(F.LIBRARY_SUFFIX));
    // The crosshatch group is where the disclosure actually pays: it holds ONE
    // production law and grows to three once the two pen crosshatches appear.
    const crossOf = (groups) => groups.find((x) => x.group === F.markClassLabel('cross'));
    expect(crossOf(F.groups(false)).options.length).toBe(1);
    expect(crossOf(F.groups(true)).options.map((o) => o.value)).toContain('penCross');
  });

  test('the note leads with the mark class; simulated laws are prefixed; caveats survive', () => {
    const n = F.note('penStipple');
    expect(n.text).toMatch(/^Dots & stipple —/);
    expect(n.caveat.startsWith(F.SIMULATED_NOTE)).toBe(true);
    // A non-simulated library law still shows its measured caveat.
    expect(F.note('bundleDither').caveat.length).toBeGreaterThan(0);
    expect(F.note('bundleDither').caveat.startsWith(F.SIMULATED_NOTE)).toBe(false);
    // A production law shows a note and no caveat.
    expect(F.note('etfKang').text.length).toBeGreaterThan(0);
    expect(F.note('etfKang').caveat).toBe('');
  });

  test('an absent or unknown toneLaw resolves to the shipped default, which IS selectable', () => {
    expect(F.resolve(undefined)).toBe('ladder');
    expect(F.resolve('notALaw')).toBe('ladder');
    expect(F.resolve('etfKang')).toBe('etfKang');
    // The trap: 'ladder' is deliberately absent from the roster's 47, so
    // without a synthesized option the select would display a law the drawing
    // is not using.
    expect(R.IDS).not.toContain('ladder');
    const values = F.groups(false).reduce((a, x) => a.concat(x.options.map((o) => o.value)), []);
    expect(values).toContain('ladder');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Surface A — the context-bar Style flyout.
// ══════════════════════════════════════════════════════════════════════════

describe('Fill Style — context-bar Style flyout', () => {
  let runtime, window, document, app, CB, F;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    F = window.Vectura.SCENE_FILL_STYLES;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const addSelectScene = (overrides = {}) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-fs-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...fixtureParams(overrides) };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    return scene;
  };
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  const pillByLabel = (t) => pills().find((f) => (f.querySelector('.ctxbar-text-fieldlabel') || {}).textContent === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const openStyle = (overrides) => {
    const scene = addSelectScene(overrides);
    pillByLabel('Style').click();
    return { scene, fly: openFly() };
  };
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('the first dropdown is labelled "Type", not "Fill"', () => {
    const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    expect(rowCtl(fly, 'Type')).toBeTruthy();
    expect(rowCtl(fly, 'Fill')).toBeNull();
  });

  test('a Fill Style dropdown sits beneath Type, grouped by mark class', () => {
    const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const labels = Array.from(fly.querySelectorAll('.ctxbar-fly-label')).map((l) => l.textContent);
    expect(labels.indexOf('Fill Style')).toBe(labels.indexOf('Type') + 1);
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    const groups = Array.from(sel.querySelectorAll('optgroup'));
    expect(groups.length).toBe(F.groups(false).length);
    expect(groups.map((g) => g.label)).toContain(F.markClassLabel('cross'));
    expect(sel.querySelectorAll('option').length).toBe(
      F.groups(false).reduce((a, x) => a + x.options.length, 0),
    );
  });

  test('an unset style shows the shipped default rather than lying about the first option', () => {
    const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    expect(rowCtl(fly, 'Fill Style').querySelector('select').value).toBe('ladder');
  });

  test('the row is absent on wireframe and on none — a tone law is meaningless there', () => {
    ['wireframe', 'none'].forEach((mapper) => {
      const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper, params: {} } }) });
      expect(rowCtl(fly, 'Fill Style')).toBeNull();
    });
  });

  test('choosing a law writes the FULL params bag at OBJECT scope, plus one undo', () => {
    const before = { fillAngle: 30, fillDensity: 62, lineType: 'dashed', fillCurves: true };
    const { scene, fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { ...before } } }) });
    const hist = app.history.length;
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    sel.value = 'etfKang';
    fire(sel, 'change');
    const written = scene.params.styleTable.byObject['obj-1'].params;
    expect(written.toneLaw).toBe('etfKang');
    // Whole-style-wins makes a dropped key a silent data loss — assert every one.
    Object.keys(before).forEach((k) => expect(written[k]).toEqual(before[k]));
    expect(app.history.length).toBe(hist + 1);
  });

  test('THE SCOPE TRAP — the write lands on an object that declares its own style', () => {
    // The object's own style wins over the scene's, so a scene-scope write
    // would never reach it and the picker would look broken on exactly the
    // objects a user is most likely to be editing.
    const { scene, fly } = openStyle({
      styleTable: styleTable(
        { 'obj-1': { penId: null, mapper: 'hatch', params: { fillDensity: 50 } } },
        {},
        { penId: null, mapper: 'hatch', params: { toneLaw: 'mkTick' } },
      ),
    });
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    sel.value = 'voronoiWeb';
    fire(sel, 'change');
    const SC = window.Vectura.Scene3D.StyleCascade;
    const eff = SC.resolve(scene.params.styleTable, { objectId: 'obj-1' });
    expect(eff.provenance.scope).toBe('object');
    expect(eff.params.toneLaw).toBe('voronoiWeb');
    // …and the scene style is untouched.
    expect(scene.params.styleTable.scene.params.toneLaw).toBe('mkTick');
  });

  test('the note names the mark class, and a library law renders its caveat', () => {
    const { fly } = openStyle({
      styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } } }),
    });
    const notes = () => Array.from(openFly().querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes().some((t) => t.startsWith('Flow lines —'))).toBe(true);
    expect(openFly().querySelector('.ctxbar-fly-note.is-caveat')).toBeNull();

    // Disclose the library, then pick a simulated pen law.
    const libOn = Array.from(rowCtl(fly, 'Library').querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'On');
    libOn.click();
    const sel = rowCtl(openFly(), 'Fill Style').querySelector('select');
    sel.value = 'penStipple';
    fire(sel, 'change');
    const caveat = openFly().querySelector('.ctxbar-fly-note.is-caveat');
    expect(caveat).toBeTruthy();
    expect(caveat.textContent.startsWith(window.Vectura.SCENE_FILL_STYLES.SIMULATED_NOTE)).toBe(true);
  });

  test('the Library toggle grows the option list by exactly the 11 demoted laws, and persists nothing', () => {
    const { scene, fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const count = () => rowCtl(openFly(), 'Fill Style').querySelector('select').querySelectorAll('option').length;
    const libBtn = (text) => Array.from(rowCtl(openFly(), 'Library').querySelectorAll('button'))
      .find((b) => b.textContent.trim() === text);
    // The disclosure is module-scoped view state that survives a reselection,
    // so start from a known Off rather than from whatever ran before.
    libBtn('Off').click();
    const closed = count();
    libBtn('On').click();
    expect(count()).toBe(closed + window.Vectura.SCENE3D_TONE_LAWS.LIBRARY.length);
    libBtn('Off').click();
    // View-only: it never reaches layer params.
    const p = scene.params.styleTable.byObject['obj-1'].params;
    expect(Object.keys(p).some((k) => /library/i.test(k))).toBe(false);
  });

  test('a multi-selection that disagrees on the law shows Mixed', () => {
    const scene = addSelectScene({
      objects: [
        { id: 'obj-1', name: 'A', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 12 }, transform: { x: -40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
        { id: 'obj-2', name: 'B', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 12 }, transform: { x: 40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
      ],
      styleTable: styleTable({
        'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } },
        'obj-2': { penId: null, mapper: 'hatch', params: { toneLaw: 'mazeFill' } },
      }),
    });
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1', 'obj-2'], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    pillByLabel('Style').click();
    const ctl = rowCtl(openFly(), 'Fill Style');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(true);
    expect(Array.from(ctl.querySelectorAll('option')).map((o) => o.textContent)).toContain('Mixed');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Surface B — the docked 3D Scene panel's Style tab.
// ══════════════════════════════════════════════════════════════════════════

describe('Fill Style — docked 3D Scene panel', () => {
  let runtime, window, document, F;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
    F = window.Vectura.SCENE_FILL_STYLES;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const mount = (overrides = {}) => {
    const { UI } = window.Vectura;
    const layer = { id: 's3d-fs', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1', params: fixtureParams(overrides) };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container };
  };
  const clickTab = (c, v) => fire(c.querySelector(`.tab-btn[data-value="${v}"]`), 'click');
  const selectObject = (c, id) => fire(c.querySelector(`.vs3-tree-row[data-object-id="${id}"]`), 'click');
  const stylePage = (c) => c.querySelector('.vs3-page[data-page="style"]');
  const styleRow = (c, label) => Array.from(stylePage(c).querySelectorAll('.vs3-row'))
    .find((r) => r.querySelector('.vs3-lbl') && r.querySelector('.vs3-lbl').textContent === label);
  const openStyle = (overrides) => {
    const m = mount(overrides);
    selectObject(m.container, 'obj-1');
    clickTab(m.container, 'style');
    return m;
  };
  const hatchOn = (params = {}) => ({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params } }) });

  test('the mapper row is labelled "Type" and a "Fill Style" row follows it', () => {
    const { container } = openStyle(hatchOn());
    expect(styleRow(container, 'Type')).toBeTruthy();
    expect(styleRow(container, 'Mapper')).toBeUndefined();
    expect(styleRow(container, 'Fill Style')).toBeTruthy();
  });

  test('the Fill Style select is grouped by mark class and shows the shipped default', () => {
    const { container } = openStyle(hatchOn());
    const sel = styleRow(container, 'Fill Style').querySelector('select');
    expect(sel.value).toBe('ladder');
    const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(F.groups(false).map((g) => g.group));
    expect(groups).toContain(F.markClassLabel('cross'));
  });

  test('no Fill Style row on wireframe', () => {
    const { container } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'wireframe', params: {} } }) });
    expect(styleRow(container, 'Fill Style')).toBeUndefined();
  });

  test('picking a law writes the full params bag at the CURRENT scope', () => {
    const { container, layer } = openStyle(hatchOn({ fillAngle: 12, fillDensity: 71 }));
    const sel = styleRow(container, 'Fill Style').querySelector('select');
    sel.value = 'mkDotScreen';
    fire(sel, 'change');
    const p = layer.params.styleTable.byObject['obj-1'].params;
    expect(p.toneLaw).toBe('mkDotScreen');
    expect(p.fillAngle).toBe(12);
    expect(p.fillDensity).toBe(71);
  });

  test('THE SCOPE TRAP — a FACE override is edited at face scope, leaving the object alone', () => {
    const m = mount({
      styleTable: styleTable(
        { 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang', fillDensity: 55 } } },
        { 'obj-1/f-3': { penId: null, mapper: 'hatch', params: { fillDensity: 40 } } },
      ),
    });
    window.dispatchEvent(new window.CustomEvent('vectura:scene-selection', {
      detail: { layerId: 's3d-fs', mode: 'face', objectIds: ['obj-1'], faceKeys: ['obj-1/f-3'], edgeKeys: [] },
    }));
    clickTab(m.container, 'style');
    expect(stylePage(m.container).querySelector('.vs3-style-scope').textContent).toContain('f-3');

    // The face override predates the control, so it has NO toneLaw. Whole-
    // style-wins means it must show the DEFAULT, not inherit the object's law.
    const sel = styleRow(m.container, 'Fill Style').querySelector('select');
    expect(sel.value).toBe('ladder');

    sel.value = 'mazeFill';
    fire(sel, 'change');
    const t = m.layer.params.styleTable;
    expect(t.byFace['obj-1/f-3'].params.toneLaw).toBe('mazeFill');
    expect(t.byFace['obj-1/f-3'].params.fillDensity).toBe(40);
    // The object's own law is untouched — the write did not leak up a scope.
    expect(t.byObject['obj-1'].params.toneLaw).toBe('etfKang');
    expect(F.resolve(undefined)).toBe('ladder');
  });

  test('CARRY-THROUGH — the law survives a mapper switch (hatch → crosshatch)', () => {
    const { container, layer } = openStyle(hatchOn({ toneLaw: 'etfKang', fillDensity: 55 }));
    const mapSel = styleRow(container, 'Type').querySelector('select');
    mapSel.value = 'crosshatch';
    fire(mapSel, 'change');
    expect(layer.params.styleTable.byObject['obj-1'].params.toneLaw).toBe('etfKang');
  });

  test('the description block prints the mechanism; a library law adds its caveat', () => {
    const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
    const notes = Array.from(stylePage(container).querySelectorAll('.vs3-lawnote')).map((n) => n.textContent);
    expect(notes.join(' ')).toContain('Voronoi');
    expect(stylePage(container).querySelector('.vs3-lawnote.is-caveat')).toBeNull();

    const lib = openStyle(hatchOn({ toneLaw: 'bundleDither' }));
    const caveat = stylePage(lib.container).querySelector('.vs3-lawnote.is-caveat');
    expect(caveat).toBeTruthy();
    expect(caveat.textContent.length).toBeGreaterThan(10);
  });

  test('the Library row discloses the 11 demoted laws without persisting anything', () => {
    const { container, layer } = openStyle(hatchOn());
    const count = () => styleRow(container, 'Fill Style').querySelector('select').querySelectorAll('option').length;
    const closed = count();
    const on = Array.from(styleRow(container, 'Library').querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'On');
    fire(on, 'click');
    expect(count()).toBe(closed + window.Vectura.SCENE3D_TONE_LAWS.LIBRARY.length);
    expect(layer.params.styleTable.byObject['obj-1'].params.library).toBeUndefined();
  });
});
