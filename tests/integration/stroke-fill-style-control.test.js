/*
 * sf-w4 — the Stroke Fill Style selector.
 *
 * WHAT THIS PINS
 * --------------
 * A VARIABLE-WIDTH (bucket B) fill style draws its ruling as a real ribbon
 * OUTLINE stroked with the real pen, then FILLS that outline with a
 * pen-width-pitched continuous stroke. `strokeFillStyle` picks the pattern
 * that fill uses. The selector ships on BOTH surfaces a user reaches it from:
 *
 *   1. the contextual line-type bar → "Open Stroke Options" popover, which
 *      mounts src/ui/panels/stroke-options.js;
 *   2. the docked left-panel Style column, directly under Fill Style
 *      (src/ui/panels/scene3d-panel.js `fillStyleControls`).
 *
 * THE BUCKET GATE IS THE CONTRACT
 * -------------------------------
 * Only the 12 bucket-B fill styles build a ribbon. The 31 monowidth (bucket A)
 * styles never set a width profile, and the 6 three-pen (bucket C) styles are
 * deliberately exempt — they must keep genuinely different nib widths. On both
 * of those the control renders DISABLED with an explanatory tooltip. It must
 * NOT be hidden: hiding it moves every row beneath it the moment the Fill
 * Style changes, which is a visible layout jump.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../..');

// A monowidth (bucket A) and a three-pen (bucket C) representative.
const BUCKET_A = 'fineLadder';
const BUCKET_C = 'penCross';
const BUCKET_B = 'taperedEnds';

// ══════════════════════════════════════════════════════════════════════════
// 1. The shared config — one vocabulary, read by both surfaces.
// ══════════════════════════════════════════════════════════════════════════

describe('Stroke Fill Style — the shared config', () => {
  let dom;
  beforeAll(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    const ctx = dom.getInternalVMContext();
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/config/context-bar.js'), 'utf8'), ctx, { filename: 'context-bar.js' });
  });
  afterAll(() => { dom?.window?.close?.(); dom = null; });

  const S = () => dom.window.Vectura.STROKE_FILL_STYLES;

  test('the vocabulary is declared beside SCENE_FILL_STYLES, defaulting to spiral', () => {
    expect(S()).toBeTruthy();
    expect(S().DEFAULT).toBe('spiral');
    expect(S().PARAM).toBe('strokeFillStyle');
  });

  test('exactly four options, in order, with the user-facing labels', () => {
    expect(S().OPTIONS.map((o) => o.value)).toEqual(['spiral', 'concentric', 'serpentine', 'contourParallel']);
    expect(S().OPTIONS.map((o) => o.label)).toEqual(['Spiral', 'Concentric', 'Serpentine', 'Contour-Parallel']);
  });

  test('resolve() collapses an unknown/absent value onto the shipped default', () => {
    expect(S().resolve(undefined)).toBe('spiral');
    expect(S().resolve('nonsense')).toBe('spiral');
    expect(S().resolve('serpentine')).toBe('serpentine');
  });

  test('applies() is true for all 12 variable-width styles and false for the rest', () => {
    const B = [
      'nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth', 'whiteBand',
      'weightSmoothstep', 'ampSpacing', 'weaveDepth', 'interlockWeave',
      'trochoidLoop', 'amplitudeOnly', 'onePenDown',
    ];
    expect(S().RIBBON_LAWS.slice().sort()).toEqual(B.slice().sort());
    B.forEach((id) => expect(S().applies(id)).toBe(true));
    // weightModulated is NOT in the engine's WEIGHT_LAWS dict yet still sets a
    // weight scale — the list is explicit precisely so it cannot be missed.
    expect(S().applies('weightModulated')).toBe(true);
    [BUCKET_A, 'ladder', 'mkTick', 'voronoiWeb'].forEach((id) => expect(S().applies(id)).toBe(false));
  });

  test('the three-pen styles are exempt, and say so in their own words', () => {
    ['penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing']
      .forEach((id) => {
        expect(S().applies(id)).toBe(false);
        expect(S().isPenLaw(id)).toBe(true);
        expect(S().disabledNote(id)).toBe(S().PEN_DISABLED_NOTE);
      });
    expect(S().disabledNote(BUCKET_A)).toBe(S().DISABLED_NOTE);
    expect(S().disabledNote(BUCKET_B)).toBe('');
    expect(S().PEN_DISABLED_NOTE).not.toBe(S().DISABLED_NOTE);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Surface A — the contextual line-type bar's Stroke Options popover.
// ══════════════════════════════════════════════════════════════════════════

describe('Stroke Fill Style — Stroke Options panel (context bar)', () => {
  const buildHarness = () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
      url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
    });
    const ctx = dom.getInternalVMContext();
    for (const rel of [
      'src/config/stroke-options.js',
      'src/config/context-bar.js',
      'src/core/stroke-model.js',
      'src/ui/panels/stroke-options.js',
    ]) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: path.basename(rel) });
    }
    return dom;
  };

  const makeLayer = (toneLaw, over = {}) => ({
    id: 'l1', type: 'object3d', penId: 'pen-1', strokeWidth: 0.3,
    lineCap: 'round', lineJoin: 'round', miterLimit: 10,
    dash: { enabled: false, pattern: [] }, strokeAlign: 'center',
    params: { style: { penId: null, mapper: 'hatch', params: { toneLaw } }, ...over },
  });

  const mountPanel = (dom, layers) => {
    const host = dom.window.document.getElementById('host');
    const events = { pushes: 0, recompute: 0 };
    const app = {
      pushHistory: () => { events.pushes += 1; },
      render: () => {},
      engine: { computeAllDisplayGeometry: () => { events.recompute += 1; } },
    };
    const handle = dom.window.Vectura.UI.StrokeOptionsPanel.render(host, { app, layers });
    return { host, handle, events };
  };

  const section = (host) => host.querySelector('[data-stroke-section="strokeFill"]');
  const buttons = (host) => Array.from(host.querySelectorAll('[data-stroke-fill-style]'));

  let dom;
  beforeEach(() => { dom = buildHarness(); });
  afterEach(() => { dom?.window?.close?.(); dom = null; });

  test('a Stroke Fill row renders for a 3D layer, one toggle per option', () => {
    const { host } = mountPanel(dom, [makeLayer(BUCKET_B)]);
    expect(section(host)).toBeTruthy();
    expect(buttons(host).map((b) => b.getAttribute('data-stroke-fill-style')))
      .toEqual(['spiral', 'concentric', 'serpentine', 'contourParallel']);
    expect(buttons(host).map((b) => b.textContent))
      .toEqual(['Spiral', 'Concentric', 'Serpentine', 'Contour-Parallel']);
  });

  test('with nothing stored it shows the shipped default, not the first thing it finds', () => {
    const { host } = mountPanel(dom, [makeLayer(BUCKET_B)]);
    const active = buttons(host).filter((b) => b.classList.contains('is-active'));
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('data-stroke-fill-style')).toBe('spiral');
  });

  test('clicking a toggle writes layer.params.strokeFillStyle, under one undo step', () => {
    const layer = makeLayer(BUCKET_B);
    const { host, events } = mountPanel(dom, [layer]);
    buttons(host).find((b) => b.getAttribute('data-stroke-fill-style') === 'serpentine').click();
    expect(layer.params.strokeFillStyle).toBe('serpentine');
    expect(events.pushes).toBe(1);
    // …and the change is reflected back into the control, not just the model.
    const active = buttons(host).filter((b) => b.classList.contains('is-active'));
    expect(active.map((b) => b.getAttribute('data-stroke-fill-style'))).toEqual(['serpentine']);
  });

  test('the write recomputes display geometry — a new fill path has to be built', () => {
    const layer = makeLayer(BUCKET_B);
    const { host, events } = mountPanel(dom, [layer]);
    buttons(host).find((b) => b.getAttribute('data-stroke-fill-style') === 'concentric').click();
    expect(events.recompute).toBe(1);
  });

  test('a bucket-A (monowidth) style DISABLES the row but never hides it', () => {
    const layer = makeLayer(BUCKET_A);
    const { host } = mountPanel(dom, [layer]);
    const S = dom.window.Vectura.STROKE_FILL_STYLES;
    expect(section(host)).toBeTruthy();
    expect(section(host).classList.contains('is-disabled')).toBe(true);
    buttons(host).forEach((b) => {
      expect(b.disabled).toBe(true);
      expect(b.title).toBe(S.DISABLED_NOTE);
    });
    // A disabled toggle must not write.
    buttons(host)[1].click();
    expect(layer.params.strokeFillStyle).toBeUndefined();
    // …but it still SHOWS the stored value: a greyed control with nothing
    // selected reads as "unset", which is a different (and wrong) statement.
    expect(buttons(host).filter((b) => b.classList.contains('is-active'))
      .map((b) => b.getAttribute('data-stroke-fill-style'))).toEqual(['spiral']);
  });

  test('a bucket-C (three-pen) style DISABLES the row with its own explanation', () => {
    const { host } = mountPanel(dom, [makeLayer(BUCKET_C)]);
    const S = dom.window.Vectura.STROKE_FILL_STYLES;
    expect(section(host)).toBeTruthy();
    expect(section(host).classList.contains('is-disabled')).toBe(true);
    buttons(host).forEach((b) => {
      expect(b.disabled).toBe(true);
      expect(b.title).toBe(S.PEN_DISABLED_NOTE);
    });
  });

  test('a non-3D layer never grows the row — there is no ribbon to fill', () => {
    const { host } = mountPanel(dom, [{
      id: 'l2', type: 'flowfield', strokeWidth: 0.3, lineCap: 'round', lineJoin: 'round',
      miterLimit: 10, dash: { enabled: false, pattern: [] }, strokeAlign: 'center', params: {},
    }]);
    expect(section(host)).toBeNull();
    // …and the rest of the panel is unchanged.
    expect(host.querySelector('[data-stroke-section="weight"]')).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Surface B — the docked left-panel Style column.
// ══════════════════════════════════════════════════════════════════════════

describe('Stroke Fill Style — docked 3D Scene panel', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  const fixtureParams = (toneLaw, extra = {}) => ({
    sceneVersion: 4, seed: 0,
    objects: [{
      id: 'obj-1', name: 'Sphere 1', primitive: 'sphere', params: { radius: 20, detail: 16 },
      transform: { x: 0, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid',
    }],
    lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
    ground: { enabled: false }, backdrop: { enabled: false },
    camera: { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    groups: [], assets: {},
    styleTable: {
      scene: { penId: null, mapper: 'none', params: {} },
      byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw } } },
      byFace: {},
    },
    ...extra,
  });

  const openStyle = (toneLaw, extra) => {
    const { UI } = window.Vectura;
    const layer = {
      id: 's3d-sf', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1',
      params: fixtureParams(toneLaw, extra),
    };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    fire(container.querySelector('.vs3-tree-row[data-object-id="obj-1"]'), 'click');
    fire(container.querySelector('.tab-btn[data-value="style"]'), 'click');
    return { layer, container };
  };

  const stylePage = (c) => c.querySelector('.vs3-page[data-page="style"]');
  const rows = (c) => Array.from(stylePage(c).querySelectorAll('.vs3-row'));
  const rowLabels = (c) => rows(c).map((r) => (r.querySelector('.vs3-lbl') || {}).textContent);
  const row = (c, label) => rows(c).find((r) => r.querySelector('.vs3-lbl') && r.querySelector('.vs3-lbl').textContent === label);

  // STALE ASSERTION UPDATE (U2, fill-roster collapse) — BUCKET_B
  // ('taperedEnds') is now a survivor with its own collapse sub-control
  // ("Band profile"), which by U0's own design (scene3d-panel.js
  // fillStyleControls) renders directly under Fill Style and ABOVE Stroke
  // Fill: "directly under the Fill Style row and above the Stroke Fill
  // row". So Stroke Fill is no longer literally the very next row when the
  // resolved law has one — it is the next row AFTER Fill Style's own
  // sub-control rows, which are part of the same "how this fill is drawn"
  // control group. Computed from the live styleParams count rather than a
  // hardcoded offset, so this stays correct however many sub-controls a
  // future survivor declares.
  test('a "Stroke Fill" row sits directly beneath "Fill Style" (+ its own collapse sub-controls, if any)', () => {
    const { container } = openStyle(BUCKET_B);
    const labels = rowLabels(container);
    const FS = window.Vectura.SCENE_FILL_STYLES;
    const subControlRows = FS.styleParams(FS.resolve(BUCKET_B)).length;
    expect(labels.indexOf('Stroke Fill')).toBe(labels.indexOf('Fill Style') + 1 + subControlRows);
  });

  test('it offers the four options and shows the shipped default', () => {
    const { container } = openStyle(BUCKET_B);
    const sel = row(container, 'Stroke Fill').querySelector('select');
    expect(Array.from(sel.options).map((o) => o.value))
      .toEqual(['spiral', 'concentric', 'serpentine', 'contourParallel']);
    expect(Array.from(sel.options).map((o) => o.textContent))
      .toEqual(['Spiral', 'Concentric', 'Serpentine', 'Contour-Parallel']);
    expect(sel.value).toBe('spiral');
    expect(sel.disabled).toBe(false);
  });

  test('choosing one writes layer.params.strokeFillStyle', () => {
    const { container, layer } = openStyle(BUCKET_B);
    const sel = row(container, 'Stroke Fill').querySelector('select');
    sel.value = 'contourParallel';
    fire(sel, 'change');
    expect(layer.params.strokeFillStyle).toBe('contourParallel');
  });

  test('a stored value is read back, not silently reset to the default', () => {
    const { container } = openStyle(BUCKET_B, { strokeFillStyle: 'concentric' });
    expect(row(container, 'Stroke Fill').querySelector('select').value).toBe('concentric');
  });

  test('a bucket-A style greys the select out and says why, keeping the row', () => {
    const { container } = openStyle(BUCKET_A);
    const S = window.Vectura.STROKE_FILL_STYLES;
    const r = row(container, 'Stroke Fill');
    expect(r).toBeTruthy();
    expect(r.querySelector('select').disabled).toBe(true);
    expect(r.getAttribute('title')).toBe(S.DISABLED_NOTE);
  });

  test('a bucket-C (three-pen) style greys it out with the exemption explanation', () => {
    const { container } = openStyle(BUCKET_C);
    const S = window.Vectura.STROKE_FILL_STYLES;
    const r = row(container, 'Stroke Fill');
    expect(r).toBeTruthy();
    expect(r.querySelector('select').disabled).toBe(true);
    expect(r.getAttribute('title')).toBe(S.PEN_DISABLED_NOTE);
  });

  test('a greyed row refuses to write even if the <select> is driven directly', () => {
    // `disabled` stops a USER; it does not stop a programmatic change event.
    const { container, layer } = openStyle(BUCKET_A);
    const sel = row(container, 'Stroke Fill').querySelector('select');
    sel.value = 'serpentine';
    fire(sel, 'change');
    expect(layer.params.strokeFillStyle).toBeUndefined();
  });

  test('the row count does not change between an enabled and a disabled Fill Style', () => {
    // The whole point of disabling rather than hiding: no layout jump.
    expect(rowLabels(openStyle(BUCKET_B).container).length)
      .toBe(rowLabels(openStyle(BUCKET_A).container).length);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. The default lives in config, not in the UI.
// ══════════════════════════════════════════════════════════════════════════

describe('Stroke Fill Style — the defaults.js contract (C4)', () => {
  let runtime, window;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window } = runtime);
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('ALGO_DEFAULTS.scene3d.strokeFillStyle is the source of the default', () => {
    expect(window.Vectura.ALGO_DEFAULTS.scene3d.strokeFillStyle).toBe('spiral');
    // The standalone leaf delegates to the same pipeline and must agree.
    expect(window.Vectura.ALGO_DEFAULTS.object3d.strokeFillStyle).toBe('spiral');
    expect(window.Vectura.STROKE_FILL_STYLES.DEFAULT)
      .toBe(window.Vectura.ALGO_DEFAULTS.scene3d.strokeFillStyle);
  });

  test('a freshly added scene3d layer carries it', () => {
    const layer = new window.Vectura.Layer('sf-new', 'scene3d', 'Scene');
    expect(layer.params.strokeFillStyle).toBe('spiral');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. Surface A (the one a user actually reaches) — the CONTEXTUAL bar's
//    Style flyout, where Fill Style lives.
// ══════════════════════════════════════════════════════════════════════════
// The Stroke Options popover in §2 is the STR-2 panel; its only entry point is
// the stroke-weight sub-mode's "…" overflow, and that sub-mode has no live
// caller any more (context-bar.js: "Stroke weight is now a per-pen property —
// the standalone per-layer stroke-weight sub-mode was removed here"). For a 3D
// object the CONTEXTUAL surface is the Style ▾ pill — the flyout that carries
// Type / Fill Style / Pen / Angle / Density. Stroke Fill belongs directly
// beneath Fill Style there, exactly as it does in the docked panel.
//
// `strokeFillStyle` is a LAYER param (contract C4), not a style-cascade param:
// a scene-TREE object is its own object3d child layer and owns its own copy,
// so the write must land on THAT layer, not on styleTable.

describe('Stroke Fill Style — contextual bar Style flyout', () => {
  const FULL_STACK = {
    includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
  };
  const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));
  let runtime, window, document, app, CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const pillByLabel = (t) => Array.from(host().querySelectorAll('.ctxbar-scene-field'))
    .find((f) => f.getAttribute('aria-label') === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const flyRows = (fly) => Array.from(fly.querySelectorAll('.ctxbar-fly-row'));
  const flyRow = (fly, label) => flyRows(fly)
    .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
  const rowLabels = (fly) => flyRows(fly)
    .map((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent);

  // Build the scene a USER builds, put `toneLaw` on the CHILD, select it the
  // way both real entry points (canvas pick / layer-row click) do, and open
  // the Style pill.
  const openStyleFlyout = (toneLaw) => {
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    app.engine.layers = [];
    app.renderer.setSelection([], null);
    app.renderer.setSceneSelection(null);
    const gid = app.engine.addLayer('scene3d');
    const child = app.engine.getLayerChildren(gid).find((l) => l.type === 'object3d');
    child.params.style = { penId: null, mapper: 'hatch', params: { toneLaw } };
    app.engine.computeAllDisplayGeometry();
    app.renderer.setSelection([child.id], child.id);
    app.renderer.setSceneSelection({
      layerId: gid, mode: 'object', objectIds: [child.id], faceKeys: [], edgeKeys: [],
    });
    CB.restoreState();
    const pill = pillByLabel('Style');
    pill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return { gid, child, fly: openFly() };
  };

  // STALE ASSERTION UPDATE (U2) — see the identical note on the docked-panel
  // version of this test above.
  test('a "Stroke Fill" row sits directly beneath "Fill Style" (+ its own collapse sub-controls, if any)', () => {
    const { fly } = openStyleFlyout(BUCKET_B);
    const labels = rowLabels(fly);
    const FS = window.Vectura.SCENE_FILL_STYLES;
    const subControlRows = FS.styleParams(FS.resolve(BUCKET_B)).length;
    expect(labels.indexOf('Stroke Fill')).toBe(labels.indexOf('Fill Style') + 1 + subControlRows);
  });

  test('it offers the four options and shows the shipped default', () => {
    const { fly } = openStyleFlyout(BUCKET_B);
    const sel = flyRow(fly, 'Stroke Fill').querySelector('select');
    expect(Array.from(sel.options).map((o) => o.value))
      .toEqual(['spiral', 'concentric', 'serpentine', 'contourParallel']);
    expect(Array.from(sel.options).map((o) => o.textContent))
      .toEqual(['Spiral', 'Concentric', 'Serpentine', 'Contour-Parallel']);
    expect(sel.value).toBe('spiral');
    expect(sel.disabled).toBe(false);
  });

  test('choosing one writes strokeFillStyle onto the OBJECT\'s own child layer', () => {
    const { child, fly } = openStyleFlyout(BUCKET_B);
    const sel = flyRow(fly, 'Stroke Fill').querySelector('select');
    sel.value = 'serpentine';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(child.params.strokeFillStyle).toBe('serpentine');
  });

  test('a stored value is read back, not silently reset to the default', () => {
    const { child, gid } = openStyleFlyout(BUCKET_B);
    child.params.strokeFillStyle = 'concentric';
    CB.restoreState();
    pillByLabel('Style').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(flyRow(openFly(), 'Stroke Fill').querySelector('select').value).toBe('concentric');
    expect(gid).toBeTruthy();
  });

  test('a bucket-A (monowidth) style greys it out and says why, keeping the row', () => {
    const { fly } = openStyleFlyout(BUCKET_A);
    const S = window.Vectura.STROKE_FILL_STYLES;
    const r = flyRow(fly, 'Stroke Fill');
    expect(r).toBeTruthy();
    expect(r.querySelector('select').disabled).toBe(true);
    expect(r.getAttribute('title')).toBe(S.DISABLED_NOTE);
  });

  test('a bucket-C (three-pen) style greys it out with the exemption explanation', () => {
    const { fly } = openStyleFlyout(BUCKET_C);
    const S = window.Vectura.STROKE_FILL_STYLES;
    const r = flyRow(fly, 'Stroke Fill');
    expect(r).toBeTruthy();
    expect(r.querySelector('select').disabled).toBe(true);
    expect(r.getAttribute('title')).toBe(S.PEN_DISABLED_NOTE);
  });

  test('a disabled row still shows the stored value and refuses to write', () => {
    // …the stored value STAYS shown: a greyed control with nothing selected
    // reads as "unset", which is a different (and wrong) statement. And
    // `disabled` stops a USER but not a programmatic change event, so the
    // write is refused in the handler too.
    const { child, fly } = openStyleFlyout(BUCKET_A);
    const sel = flyRow(fly, 'Stroke Fill').querySelector('select');
    expect(sel.value).toBe('spiral');
    sel.value = 'concentric';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(child.params.strokeFillStyle).toBe('spiral');
  });

  test('the row count does not change between an enabled and a disabled Fill Style', () => {
    const b = rowLabels(openStyleFlyout(BUCKET_B).fly).length;
    const a = rowLabels(openStyleFlyout(BUCKET_A).fly).length;
    expect(b).toBe(a);
  });
});
