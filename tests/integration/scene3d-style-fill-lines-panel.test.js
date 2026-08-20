/**
 * 3D panel — line output split by role (Object tab = BORDER, Style tab = FILL).
 *
 * WHAT THIS PINS
 * --------------
 * Two groups of controls, each labelled with the ONE kind of line it owns:
 *
 *   Object tab ▸ "Border lines"  → Curves / Smoothing / Simplify on the object
 *                                  bag. Silhouette, creases, face outlines.
 *   Style  tab ▸ "Fill lines"    → Curves / Smoothing / Simplify / Fidelity in
 *                                  style.params. Internal fill lines only.
 *
 * ABSENT, NOT INERT
 * -----------------
 * Every row here is gated on geometry that can actually use it, and a row that
 * cannot is REMOVED, never disabled-in-place — the same rule the `none`
 * highlight treatment and the Dash-length row already follow. The gate is
 * `Scene3D.Params.CURVED_FILL_PRIMITIVES`, read LIVE from the engine (never a
 * copied list), plus the mapper's own reach:
 *
 *   • faceted geometry (box/plane/polyhedron/imported mesh) → no fill-line rows;
 *   • stipple → no fill-line rows at all (it draws dots, not lines);
 *   • Fidelity additionally requires the CHART-SAMPLED fill — a region contour
 *     or a flat-clip spiral is a 2D silhouette pass that never reaches
 *     SurfaceFill, so there is no per-line sampling for Fidelity to scale.
 */

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const fixtureParams = (overrides = {}) => ({
  sceneVersion: 1,
  seed: 0,
  posX: 0,
  posY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  objects: [],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: true },
  backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -30, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [],
  assets: {},
  styleTable: {
    scene: { penId: null, mapper: 'none', params: {} },
    byObject: {},
    byFace: {},
  },
  ...overrides,
});

const obj = (n, primitive, params) => ({
  id: `obj-${n}`,
  name: `Obj ${n}`,
  primitive,
  params: params || { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
});

const CAPSULE = { sx: 40, sy: 55, sz: 40, detail: 16 };

describe('3D panel — Border lines (Object tab) vs Fill lines (Style tab)', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    window = runtime.window;
    document = runtime.document;
  });

  afterAll(() => runtime.cleanup());

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));

  const mount = (paramsOverrides = {}) => {
    const { UI } = window.Vectura;
    const layer = {
      id: 's3d-1', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1',
      params: fixtureParams(paramsOverrides),
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container };
  };

  const clickTab = (container, value) => fire(container.querySelector(`.tab-btn[data-value="${value}"]`), 'click');
  const selectObject = (container, id) => fire(container.querySelector(`.vs3-tree-row[data-object-id="${id}"]`), 'click');

  // The OBJECT INSPECTOR only. `.vs3-inspector` alone also matches the Shadow
  // and scene-wide Border Lines sections, which carry rows of the same name.
  const inspector = (container) => container.querySelector('.vs3-inspector:not(.vs3-shadow):not(.vs3-output)');
  const labels = (container) => Array.from(inspector(container).querySelectorAll('.vs3-row'))
    .map((r) => (r.querySelector('.vs3-lbl') || {}).textContent);
  const headings = (container) => Array.from(inspector(container).querySelectorAll('.vs3-subhead, .vs3-hl-hdr'))
    .map((e) => e.textContent);
  const sectionTitles = (container) => Array.from(container.querySelectorAll('.vs3-panel button, .vs3-panel h3, .vs3-panel .section-title, .vs3-panel summary'))
    .map((e) => e.textContent.trim());

  // Rows inside the Style tab's "Fill lines" group. The plain labels (Curves /
  // Smoothing / Simplify) are shared with the Object tab's border group, so
  // these are scoped to the style page to keep the two apart.
  const stylePage = (container) => container.querySelector('.vs3-page[data-page="style"]');
  const styleLabels = (container) => Array.from(stylePage(container).querySelectorAll('.vs3-row'))
    .map((r) => (r.querySelector('.vs3-lbl') || {}).textContent);
  const styleRow = (container, label) => Array.from(stylePage(container).querySelectorAll('.vs3-row'))
    .find((r) => r.querySelector('.vs3-lbl') && r.querySelector('.vs3-lbl').textContent === label);
  const styleHeadings = (container) => Array.from(stylePage(container).querySelectorAll('.vs3-hl-hdr'))
    .map((e) => e.textContent);

  const FILL_LINE_ROWS = ['Curves', 'Smoothing', 'Simplify', 'Fidelity'];

  // ── Object tab: the border group is labelled as such ──────────────────────

  test('a curved object gets a "Border lines" heading over Curves / Smoothing / Simplify', () => {
    const { container } = mount({ objects: [obj(1, 'capsule', CAPSULE)] });
    selectObject(container, 'obj-1');
    expect(headings(container)).toContain('Border lines');
    ['Curves', 'Smoothing', 'Simplify'].forEach((l) => expect(labels(container)).toContain(l));
  });

  // A scoped heading that runs on into unrelated rows claims controls it does
  // not govern — the exact confusion the split exists to remove. Both groups
  // must be TERMINATED by the next heading.
  const groupRows = (host, heading) => {
    const out = [];
    let inGroup = false;
    Array.from(host.children).forEach((el) => {
      if (el.classList.contains('vs3-subhead') || el.classList.contains('vs3-hl-hdr')) {
        inGroup = el.textContent === heading;
        return;
      }
      if (inGroup && el.classList.contains('vs3-row')) {
        out.push((el.querySelector('.vs3-lbl') || {}).textContent);
      }
    });
    return out;
  };

  test('the Border lines heading governs exactly its three rows, then ends', () => {
    const { container } = mount({ objects: [obj(1, 'capsule', CAPSULE)] });
    selectObject(container, 'obj-1');
    expect(groupRows(inspector(container), 'Border lines')).toEqual(['Curves', 'Smoothing', 'Simplify']);
  });

  test('the Fill lines heading governs exactly its four rows, then ends', () => {
    const { container } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: {} } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');
    expect(groupRows(container.querySelector('.vs3-style'), 'Fill lines'))
      .toEqual(['Curves', 'Smoothing', 'Simplify', 'Fidelity']);
  });

  test('a faceted object gets neither the heading nor the rows', () => {
    const { container } = mount({ objects: [obj(1, 'box')] });
    selectObject(container, 'obj-1');
    expect(headings(container)).not.toContain('Border lines');
    ['Curves', 'Smoothing', 'Simplify'].forEach((l) => expect(labels(container)).not.toContain(l));
  });

  test('the scene-wide default section says Border Lines', () => {
    const { container } = mount();
    expect(sectionTitles(container).join('|')).toContain('Border Lines');
  });

  // ── Style tab: the fill group ─────────────────────────────────────────────

  test('a curved object on a fill-line mapper gets a "Fill lines" group with all four rows', () => {
    const { container } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50 } } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');
    expect(styleHeadings(container)).toContain('Fill lines');
    FILL_LINE_ROWS.forEach((l) => expect(styleLabels(container)).toContain(l));
  });

  test('the fill rows write style.params at the CURRENT scope (object override)', () => {
    const { container, layer } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50 } } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');

    const onBtn = Array.from(styleRow(container, 'Curves').querySelectorAll('button'))
      .find((b) => b.textContent.trim() === 'On');
    fire(onBtn, 'click');
    expect(layer.params.styleTable.byObject['obj-1'].params.fillCurves).toBe(true);
    // …and NOT onto the object bag, which is the border's home.
    expect(layer.params.objects[0].curves).toBeUndefined();

    const slider = styleRow(container, 'Fidelity').querySelector('input[type="range"]');
    slider.value = '2';
    fire(slider, 'input');
    fire(slider, 'change');
    expect(layer.params.styleTable.byObject['obj-1'].params.fillFidelity).toBe(2);
  });

  test('fill-line settings survive a mapper swap, and an unset one is never seeded', () => {
    const { container, layer } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: { fillSmoothing: 0.4 } } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');
    const mapperSel = styleRow(container, 'Type').querySelector('select');
    mapperSel.value = 'contour';
    fire(mapperSel, 'change');
    const params = layer.params.styleTable.byObject['obj-1'].params;
    expect(params.fillSmoothing).toBe(0.4);
    // The three the user never touched stay ABSENT — that is what keeps an
    // untouched document byte-identical.
    ['fillCurves', 'fillSimplify', 'fillFidelity'].forEach((k) => expect(params[k]).toBeUndefined());
  });

  test('a faceted object gets NO fill-line rows, whatever the mapper', () => {
    const { container } = mount({
      objects: [obj(1, 'box')],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: {} } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');
    expect(styleHeadings(container)).not.toContain('Fill lines');
    expect(styleLabels(container)).not.toContain('Fidelity');
  });

  test('stipple draws dots, not lines — the whole group is absent', () => {
    const { container } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'stipple', params: {} } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');
    expect(styleHeadings(container)).not.toContain('Fill lines');
  });

  test('a REGION contour keeps Curves/Smoothing/Simplify but drops Fidelity (no chart sampling)', () => {
    const { container } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'contour', params: { contourStyle: 'region' } } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');
    expect(styleHeadings(container)).toContain('Fill lines');
    expect(styleLabels(container)).toContain('Curves');
    expect(styleLabels(container)).not.toContain('Fidelity');
  });

  test('a FLAT-CLIP spiral likewise drops Fidelity', () => {
    const { container } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'spiral', params: { spiralMode: 'flatClip' } } },
        byFace: {},
      },
    });
    selectObject(container, 'obj-1');
    clickTab(container, 'style');
    expect(styleHeadings(container)).toContain('Fill lines');
    expect(styleLabels(container)).not.toContain('Fidelity');
    // A surface (default) spiral does get it.
    const { container: c2 } = mount({
      objects: [obj(1, 'capsule', CAPSULE)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: null, mapper: 'spiral', params: {} } },
        byFace: {},
      },
    });
    selectObject(c2, 'obj-1');
    clickTab(c2, 'style');
    expect(styleLabels(c2)).toContain('Fidelity');
  });

  // ── Scene scope: bound to the curved objects that exist ───────────────────

  test('at SCENE scope the group appears only when the scene holds curved geometry', () => {
    const curvedScene = mount({
      objects: [obj(1, 'box'), obj(2, 'sphere', { radius: 40, detail: 24 })],
      styleTable: { scene: { penId: null, mapper: 'hatch', params: {} }, byObject: {}, byFace: {} },
    });
    clickTab(curvedScene.container, 'style');
    expect(styleHeadings(curvedScene.container)).toContain('Fill lines');

    const facetedScene = mount({
      objects: [obj(1, 'box'), obj(2, 'plane', { sx: 100, sz: 100 })],
      styleTable: { scene: { penId: null, mapper: 'hatch', params: {} }, byObject: {}, byFace: {} },
    });
    clickTab(facetedScene.container, 'style');
    expect(styleHeadings(facetedScene.container)).not.toContain('Fill lines');
  });

  // ── The gate is the ENGINE's set, not a copy ──────────────────────────────

  test('every CURVED_FILL_PRIMITIVE offers the group; no faceted primitive does', () => {
    const set = window.Vectura.Scene3D.Params.CURVED_FILL_PRIMITIVES;
    const withGroup = (primitive) => {
      const { container } = mount({
        objects: [obj(1, primitive, { radius: 40, sx: 40, sy: 55, sz: 40, detail: 16 })],
        styleTable: {
          scene: { penId: null, mapper: 'none', params: {} },
          byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: {} } },
          byFace: {},
        },
      });
      selectObject(container, 'obj-1');
      clickTab(container, 'style');
      return styleHeadings(container).includes('Fill lines');
    };
    [...set].forEach((p) => expect([p, withGroup(p)]).toEqual([p, true]));
    ['box', 'plane', 'solid'].forEach((p) => expect([p, withGroup(p)]).toEqual([p, false]));
  });
});

// ---------------------------------------------------------------------------
// The per-LAYER object3d panel (scene tree) must offer the same two groups.
// ---------------------------------------------------------------------------
describe('object3d leaf panel — the same split', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    window = runtime.window;
    document = runtime.document;
  });

  afterAll(() => runtime.cleanup());

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));

  const mountLeaf = (primitive, styleParams, mapper = 'hatch') => {
    const { UI } = window.Vectura;
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Capsule', visible: true, parentId: null,
      params: {
        primitive,
        params: primitive === 'box' ? { sx: 40, sy: 40, sz: 40 } : { ...CAPSULE },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid',
        style: { penId: null, mapper, params: { ...(styleParams || {}) } },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { layer, container };
  };

  // Both pages stay in the DOM once rendered, and they carry rows of the same
  // name (that is the point of the split) — so every lookup is page-scoped.
  const page = (container, name) => container.querySelector(`.vs3-page[data-page="${name}"]`);
  const heads = (container, name) => Array.from(page(container, name).querySelectorAll('.vs3-subhead, .vs3-hl-hdr')).map((e) => e.textContent);
  const rowLabels = (container, name) => Array.from(page(container, name).querySelectorAll('.vs3-row'))
    .map((r) => (r.querySelector('.vs3-lbl') || {}).textContent);
  const clickTab = (container, value) => fire(container.querySelector(`.tab-btn[data-value="${value}"]`), 'click');

  test('Object tab shows the Border lines group for curved geometry only', () => {
    const curved = mountLeaf('capsule');
    expect(heads(curved.container, 'object')).toContain('Border lines');
    const faceted = mountLeaf('box');
    expect(heads(faceted.container, 'object')).not.toContain('Border lines');
  });

  test('Style tab shows the Fill lines group and writes style.params', () => {
    const { container, layer } = mountLeaf('capsule');
    clickTab(container, 'style');
    expect(heads(container, 'style')).toContain('Fill lines');
    ['Curves', 'Smoothing', 'Simplify', 'Fidelity'].forEach((l) => expect(rowLabels(container, 'style')).toContain(l));

    const curvesRow = Array.from(page(container, 'style').querySelectorAll('.vs3-row'))
      .find((r) => r.querySelector('.vs3-lbl') && r.querySelector('.vs3-lbl').textContent === 'Curves');
    const input = curvesRow.querySelector('input[type="checkbox"]')
      || Array.from(curvesRow.querySelectorAll('button')).find((b) => b.textContent.trim() === 'On');
    if (input && input.type === 'checkbox') { input.checked = true; fire(input, 'change'); } else { fire(input, 'click'); }
    expect(layer.params.style.params.fillCurves).toBe(true);
    expect(layer.params.curves).toBeUndefined();
  });

  test('a faceted leaf gets no Fill lines group', () => {
    const { container } = mountLeaf('box');
    clickTab(container, 'style');
    expect(heads(container, 'style')).not.toContain('Fill lines');
  });
});
