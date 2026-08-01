const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * 3D Scene panel (vs3-) integration tests — Phase 1 stream 1B.
 *
 * Group A (full stack): the buildControls() dispatch branch routes scene3d
 * layers to Scene3DPanel and is a strict no-op for every other layer type.
 * The scene3d layer is a FIXTURE built to the CONTRACT A params shape — the
 * scene3d engine/ALGO_DEFAULTS (stream 1A) do not exist in this tree, and the
 * panel must work from the layer's params alone.
 *
 * Group B (direct mount): Scene3DPanel.build() driven against a minimal ui
 * stub — shelf, tree, inspector, More… flyout memory, and the Style tab's
 * StyleCascade integration (CONTRACT C).
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// CONTRACT A params shape (fixture — see docs/3d-scene-studio proposal §3.3).
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

const fixtureObject = (n, primitive = 'box') => ({
  id: `obj-${n}`,
  name: `Box ${n}`,
  primitive,
  params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
});

// ---------------------------------------------------------------------------
// Group A — buildControls dispatch (full stack)
// ---------------------------------------------------------------------------
describe('Scene3D panel — buildControls dispatch', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const controlsHost = () => document.getElementById('dynamic-controls');

  test('a scene3d layer routes to Scene3DPanel (vs3- shell mounts)', () => {
    const { Layer } = window.Vectura;
    const layer = new Layer('s3d-dispatch', 'scene3d', 'Scene 1');
    layer.params = fixtureParams({ objects: [fixtureObject(1)] });
    app.engine.layers.push(layer);
    app.engine.activeLayerId = 's3d-dispatch';
    app.ui.buildControls();

    const host = controlsHost();
    expect(host.querySelector('.vs3-panel')).toBeTruthy();
    // Tabs: Scene | Style | Output.
    const tabValues = Array.from(host.querySelectorAll('.tab-btn')).map((b) => b.dataset.value);
    expect(tabValues).toEqual(['scene', 'style', 'output']);
    // Tree rendered the fixture object (plus the always-present Ground row).
    expect(host.querySelectorAll('.vs3-tree-row:not(.vs3-tree-ground):not(.vs3-tree-light)').length).toBe(1);
    expect(host.querySelector('.vs3-tree-ground')).toBeTruthy();
    // Selecting the object mounts the inspector (works without CONTRACT D —
    // this renderer has no setSceneSelection, so the panel-local path runs).
    host.querySelector('.vs3-tree-row:not(.vs3-tree-ground):not(.vs3-tree-light)').dispatchEvent(new window.Event('click', { bubbles: true }));
    expect(host.querySelector('input.ctrl-slider[aria-label="Position X (mm)"]')).toBeTruthy();
    // No generic control list (the branch early-returned before it).
    expect(host.querySelector('.control-label')).toBeFalsy();
  });

  test('the branch is a strict no-op for non-scene3d layers (algo controls unaffected)', () => {
    app.engine.addLayer('flowfield');
    app.ui.buildControls();

    const host = controlsHost();
    expect(host.querySelector('.vs3-panel')).toBeFalsy();
    // The generic algo control list still builds (labels + range sliders).
    expect(host.querySelectorAll('.control-label').length).toBeGreaterThan(0);
    expect(host.querySelector('input[type="range"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Group B — panel behavior (direct mount against a ui stub)
// ---------------------------------------------------------------------------
describe('Scene3D panel — behavior (vs3-)', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    window = runtime.window;
    document = runtime.document;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));
  const fireKey = (el, key) => {
    const ev = new window.Event('keydown', { bubbles: true, cancelable: true });
    ev.key = key;
    el.dispatchEvent(ev);
  };

  const mount = (paramsOverrides = {}) => {
    const { UI } = window.Vectura;
    const layer = {
      id: 's3d-1',
      type: 'scene3d',
      name: 'Scene 1',
      visible: true,
      penId: 'pen-1',
      params: fixtureParams(paramsOverrides),
    };
    const pushHistory = vi.fn();
    const regen = vi.fn();
    const storeLayerParams = vi.fn();
    const ui = { app: { pushHistory, regen }, storeLayerParams };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container, pushHistory, regen, storeLayerParams };
  };

  const clickTab = (container, value) => {
    fire(container.querySelector(`.tab-btn[data-value="${value}"]`), 'click');
  };

  test('registers Scene3DPanel.build and mounts the 3-tab shell', () => {
    const { container } = mount();
    expect(typeof window.Vectura.UI.Scene3DPanel.build).toBe('function');
    expect(container.querySelector('.vs3-panel')).toBeTruthy();
    ['scene', 'style', 'output'].forEach((p) => {
      expect(container.querySelector(`.vs3-page[data-page="${p}"]`)).toBeTruthy();
    });
    expect(container.querySelector('.vs3-page[data-page="scene"]').classList.contains('active')).toBe(true);
    // Output tab is a Phase 1 placeholder.
    expect(container.querySelector('.vs3-page[data-page="output"]').textContent)
      .toContain('Plot stats arrive in a later phase');
    // Import shelf stub is still disabled with its phase tooltip.
    const importBtn = container.querySelector('.vs3-shelf-btn[data-stub="import"]');
    expect(importBtn.disabled).toBe(true);
    expect(importBtn.title).toBe('STL import arrives in Phase 4');
    // Phase 2/G: the Light shelf button is activated — it ADDS a directional
    // light (no longer a disabled stub, and no longer a "select the sun" action).
    const lightBtn = container.querySelector('.vs3-shelf-btn[data-light="add"]');
    expect(lightBtn).toBeTruthy();
    expect(lightBtn.disabled).toBe(false);
    expect(container.querySelector('.vs3-shelf-btn[data-stub="light"]')).toBeFalsy();
  });

  test('shelf click appends a CONTRACT-A object with a unique id and ONE history entry', () => {
    const { container, layer, pushHistory, regen, storeLayerParams } = mount();
    fire(container.querySelector('.vs3-shelf-btn[data-prim="box"]'), 'click');

    expect(layer.params.objects.length).toBe(1);
    const obj = layer.params.objects[0];
    expect(obj.id).toBe('obj-1');
    expect(obj.name).toBe('Box 1');
    expect(obj.primitive).toBe('box');
    expect(obj.params).toEqual({ sx: 40, sy: 40, sz: 40 });
    expect(obj.transform).toEqual({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 });
    expect(obj.visibility).toBe('solid');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
    expect(storeLayerParams).toHaveBeenCalled();

    // Second add gets a unique ordinal.
    fire(container.querySelector('.vs3-shelf-btn[data-prim="sphere"]'), 'click');
    expect(layer.params.objects.length).toBe(2);
    expect(layer.params.objects[1].id).toBe('obj-2');
    expect(layer.params.objects[1].name).toBe('Sphere 2');
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  test('ids stay unique after deletions (ordinal = max existing + 1)', () => {
    const { container, layer } = mount({ objects: [fixtureObject(1), fixtureObject(4)] });
    fire(container.querySelector('.vs3-shelf-btn[data-prim="box"]'), 'click');
    expect(layer.params.objects.map((o) => o.id)).toEqual(['obj-1', 'obj-4', 'obj-5']);
  });

  test('tree renders one row per object; delete removes object, row, and its styles', () => {
    const { container, layer, pushHistory } = mount({
      objects: [fixtureObject(1), fixtureObject(2)],
      styleTable: {
        scene: { penId: null, mapper: 'none', params: {} },
        byObject: { 'obj-1': { penId: 'pen-2', mapper: 'none', params: {} } },
        byFace: { 'obj-1/face:+X': { penId: 'pen-3', mapper: 'none', params: {} } },
      },
    });
    expect(container.querySelectorAll('.vs3-tree-row:not(.vs3-tree-ground):not(.vs3-tree-light)').length).toBe(2);

    const firstRow = container.querySelector('.vs3-tree-row[data-object-id="obj-1"]');
    fire(firstRow.querySelector('.vs3-tree-del'), 'click');

    expect(layer.params.objects.length).toBe(1);
    expect(layer.params.objects[0].id).toBe('obj-2');
    expect(container.querySelectorAll('.vs3-tree-row:not(.vs3-tree-ground):not(.vs3-tree-light)').length).toBe(1);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    // Orphaned style entries are swept with the object.
    expect(layer.params.styleTable.byObject['obj-1']).toBeUndefined();
    expect(layer.params.styleTable.byFace['obj-1/face:+X']).toBeUndefined();
  });

  test('visibility toggle cycles solid → xray with one commit', () => {
    const { container, layer, pushHistory } = mount({ objects: [fixtureObject(1)] });
    const vis = container.querySelector('.vs3-tree-row .vs3-tree-vis');
    fire(vis, 'click');
    expect(layer.params.objects[0].visibility).toBe('xray');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    fire(container.querySelector('.vs3-tree-row .vs3-tree-vis'), 'click');
    expect(layer.params.objects[0].visibility).toBe('solid');
  });

  test('dblclick rename commits the new name once', () => {
    const { container, layer, pushHistory } = mount({ objects: [fixtureObject(1)] });
    const name = container.querySelector('.vs3-tree-name');
    fire(name, 'dblclick');
    const input = container.querySelector('.vs3-rename');
    expect(input).toBeTruthy();
    input.value = 'Hero Box';
    fireKey(input, 'Enter');
    expect(layer.params.objects[0].name).toBe('Hero Box');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.vs3-tree-name').textContent).toBe('Hero Box');
  });

  test('tree click selects (no commit) and the inspector mounts; slider commit writes transform with a single undo', () => {
    const { container, layer, pushHistory, regen } = mount({ objects: [fixtureObject(1)] });
    fire(container.querySelector('.vs3-tree-row'), 'click');
    // Selection is not an undoable edit.
    expect(pushHistory).toHaveBeenCalledTimes(0);
    expect(container.querySelector('.vs3-tree-row').classList.contains('selected')).toBe(true);

    const xSlider = container.querySelector('input.ctrl-slider[aria-label="Position X (mm)"]');
    expect(xSlider).toBeTruthy();
    xSlider.value = '25';
    fire(xSlider, 'input');
    // Live preview (feedback #3): the transform updates on drag, and the
    // gesture's single undo entry is pushed at drag start (not on release).
    expect(layer.params.objects[0].transform.x).toBe(25);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    fire(xSlider, 'change');
    // Release finalizes with a full regen; still exactly one undo entry.
    expect(layer.params.objects[0].transform.x).toBe(25);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);

    // Rotation + visibility SegCtrl also commit through the inspector.
    const yawSlider = container.querySelector('input.ctrl-slider[aria-label="Yaw (degrees)"]');
    yawSlider.value = '45';
    fire(yawSlider, 'input');
    fire(yawSlider, 'change');
    expect(layer.params.objects[0].transform.yaw).toBe(45);
    expect(pushHistory).toHaveBeenCalledTimes(2);

    const xrayOpt = container.querySelector('.vs3-inspector .seg-opt[data-value="xray"]');
    fire(xrayOpt, 'click');
    expect(layer.params.objects[0].visibility).toBe('xray');
    expect(pushHistory).toHaveBeenCalledTimes(3);
  });

  test('live drag coalesces many input events into ONE undo entry (feedback #3)', () => {
    const { container, layer, pushHistory } = mount({ objects: [fixtureObject(1)] });
    fire(container.querySelector('.vs3-tree-row'), 'click');
    const yaw = container.querySelector('input.ctrl-slider[aria-label="Yaw (degrees)"]');
    expect(yaw).toBeTruthy();
    // Simulate a drag: several input events before release.
    ['10', '20', '35', '50'].forEach((v) => { yaw.value = v; fire(yaw, 'input'); });
    // Each input previews live (the value tracks the drag)...
    expect(layer.params.objects[0].transform.yaw).toBe(50);
    // ...but the whole gesture is exactly ONE undo entry.
    expect(pushHistory).toHaveBeenCalledTimes(1);
    fire(yaw, 'change');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(layer.params.objects[0].transform.yaw).toBe(50);
  });

  test('double-click a dimension handle restores the primitive default (feedback #4)', () => {
    const { container, layer, pushHistory, regen } = mount({ objects: [fixtureObject(1)] });
    // Grow the box off its 40mm default before mounting the inspector.
    layer.params.objects[0].params.sx = 120;
    fire(container.querySelector('.vs3-tree-row'), 'click');
    const width = container.querySelector('input.ctrl-slider[aria-label="box width"]');
    expect(width).toBeTruthy();
    expect(Number(width.value)).toBe(120);
    // Double-clicking the handle resets to the box default (40mm), one undo entry.
    fire(width, 'dblclick');
    expect(layer.params.objects[0].params.sx).toBe(40);
    expect(pushHistory).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalled();
  });

  test('Style tab · no selection edits the SCENE scope (chip: Styled by: Scene)', () => {
    const { container, layer, pushHistory } = mount({ objects: [fixtureObject(1)] });
    clickTab(container, 'style');

    expect(container.querySelector('.vs3-style-scope').textContent).toBe('Editing: Scene');
    const chip = container.querySelector('.vs3-prov-chip');
    expect(chip.textContent).toContain('Styled by: Scene');
    // Scene scope has no clear affordance.
    expect(chip.querySelector('.vs3-prov-clear')).toBeFalsy();

    const penSelect = container.querySelector('.vs3-style select.ctrl-sel');
    penSelect.value = 'pen-2';
    fire(penSelect, 'change');
    expect(layer.params.styleTable.scene.penId).toBe('pen-2');
    expect(pushHistory).toHaveBeenCalledTimes(1);
  });

  test('Style tab · selected object writes styleTable.byObject; resolve + provenance reflect it; ✕ clears', () => {
    const { container, layer, pushHistory } = mount({ objects: [fixtureObject(1)] });
    const StyleCascade = window.Vectura.Scene3D.StyleCascade;

    fire(container.querySelector('.vs3-tree-row'), 'click');
    clickTab(container, 'style');

    // Before any override: inherited from scene.
    let chip = container.querySelector('.vs3-prov-chip');
    expect(chip.textContent).toContain('Styled by: Scene');
    expect(chip.classList.contains('is-inherited')).toBe(true);
    expect(chip.querySelector('.vs3-prov-clear')).toBeFalsy();

    const penSelect = container.querySelector('.vs3-style select.ctrl-sel');
    penSelect.value = 'pen-2';
    fire(penSelect, 'change');

    expect(layer.params.styleTable.byObject['obj-1']).toBeTruthy();
    expect(layer.params.styleTable.byObject['obj-1'].penId).toBe('pen-2');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    const resolved = StyleCascade.resolve(layer.params.styleTable, { objectId: 'obj-1' });
    expect(resolved.penId).toBe('pen-2');
    expect(resolved.provenance).toEqual({ scope: 'object', key: 'obj-1' });

    // Chip re-rendered as set-here with a clear affordance.
    chip = container.querySelector('.vs3-prov-chip');
    expect(chip.textContent).toContain('Styled by: Object');
    expect(chip.classList.contains('is-inherited')).toBe(false);
    const clearBtn = chip.querySelector('.vs3-prov-clear');
    expect(clearBtn).toBeTruthy();
    fire(clearBtn, 'click');
    expect(layer.params.styleTable.byObject['obj-1']).toBeUndefined();
    expect(pushHistory).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.vs3-prov-chip').textContent).toContain('Styled by: Scene');
  });

  test('Style tab · mapper hatch stores hatch defaults and mounts angle + density controls', () => {
    const { container, layer } = mount({ objects: [fixtureObject(1)] });
    fire(container.querySelector('.vs3-tree-row'), 'click');
    clickTab(container, 'style');

    // The mapper picker is the Select carrying the 'contour' option (the pen
    // Select is the other .ctrl-sel in the Style tab).
    // The mapper picker is the Select carrying the 'contour' option (the pen
    // Select is the other one in the Style tab).
    const mapSel = [...container.querySelectorAll('select')]
      .find((s) => [...(s.options || [])].some((o) => o.value === 'contour'));
    expect(mapSel).toBeTruthy();
    mapSel.value = 'hatch';
    fire(mapSel, 'change');
    const stored = layer.params.styleTable.byObject['obj-1'];
    expect(stored.mapper).toBe('hatch');
    // Hatch seeds the angle + density AND the shared stroke-treatment defaults
    // (Phase 1.1), so switching between fill mappers carries the line tuning.
    expect(stored.params).toEqual({
      fillAngle: 45, fillDensity: 50,
      lineType: 'solid', dashScale: 1, wobble: 0, wobbleScale: 6, overstroke: false,
    });

    // Hatch controls mounted after re-render (Density is shared across fill
    // mappers, so its label is the generic "Fill density").
    const density = container.querySelector('input.ctrl-slider[aria-label="Fill density"]');
    expect(density).toBeTruthy();
    density.value = '72';
    fire(density, 'input');
    fire(density, 'change');
    expect(layer.params.styleTable.byObject['obj-1'].params.fillDensity).toBe(72);
    // Whole-style commit preserved the angle.
    expect(layer.params.styleTable.byObject['obj-1'].params.fillAngle).toBe(45);
  });

  test('Style tab · a region mapper (contour) mounts Density but NOT Angle; seeds density default', () => {
    const { container, layer } = mount({ objects: [fixtureObject(1)] });
    fire(container.querySelector('.vs3-tree-row'), 'click');
    clickTab(container, 'style');
    const mapSel = [...container.querySelectorAll('select')]
      .find((s) => [...(s.options || [])].some((o) => o.value === 'contour'));
    mapSel.value = 'contour';
    fire(mapSel, 'change');
    // Seeded with a density default (no fillAngle) + the shared stroke defaults.
    expect(layer.params.styleTable.byObject['obj-1'].mapper).toBe('contour');
    expect(layer.params.styleTable.byObject['obj-1'].params).toEqual({
      fillDensity: 50,
      lineType: 'solid', dashScale: 1, wobble: 0, wobbleScale: 6, overstroke: false,
    });
    // Density control present; Angle control absent for a region mapper.
    expect(container.querySelector('input.ctrl-slider[aria-label="Fill density"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Hatch angle"]')).toBeFalsy();
  });

  test('a face selection (CONTRACT D event) scopes the Style tab to byFace', () => {
    const { container, layer } = mount({ objects: [fixtureObject(1)] });
    window.dispatchEvent(new window.CustomEvent('vectura:scene-selection', {
      detail: { layerId: 's3d-1', mode: 'face', objectIds: [], faceKeys: ['obj-1/face:+X'], edgeKeys: [] },
    }));
    clickTab(container, 'style');

    expect(container.querySelector('.vs3-style-scope').textContent).toContain('face:+X');
    const penSelect = container.querySelector('.vs3-style select.ctrl-sel');
    penSelect.value = 'pen-3';
    fire(penSelect, 'change');
    expect(layer.params.styleTable.byFace['obj-1/face:+X'].penId).toBe('pen-3');
    expect(container.querySelector('.vs3-prov-chip').textContent).toContain('Styled by: Face');
  });

  test('a selection event for another layer clears the panel selection', () => {
    const { container } = mount({ objects: [fixtureObject(1)] });
    fire(container.querySelector('.vs3-tree-row'), 'click');
    expect(container.querySelector('.vs3-tree-row').classList.contains('selected')).toBe(true);
    window.dispatchEvent(new window.CustomEvent('vectura:scene-selection', {
      detail: { layerId: 'other-layer', mode: 'object', objectIds: ['obj-9'], faceKeys: [], edgeKeys: [] },
    }));
    expect(container.querySelector('.vs3-tree-row').classList.contains('selected')).toBe(false);
  });

  test('More… flyout: pick is remembered for the session, icon/label swap, short-click re-invokes', () => {
    const first = mount();
    const { container, layer } = first;

    // No last pick yet → main button opens the menu. The menu is portaled to
    // <body> (escaping the section's overflow:hidden clip), so it is found on
    // the document, not inside the panel container.
    const moreBtn = container.querySelector('.vs3-more-btn');
    expect(moreBtn.dataset.lastPick).toBe('');
    fire(moreBtn, 'click');
    const doc = container.ownerDocument;
    const menu = doc.querySelector('.vs3-more-menu');
    expect(menu.parentNode).toBe(doc.body);
    expect(menu.classList.contains('open')).toBe(true);

    // Pick Torus Knot → adds it, closes the menu, swaps the button label.
    fire(menu.querySelector('.vs3-more-item[data-prim="torusKnot"]'), 'click');
    expect(menu.classList.contains('open')).toBe(false);
    expect(layer.params.objects.length).toBe(1);
    expect(layer.params.objects[0].primitive).toBe('torusKnot');
    expect(moreBtn.dataset.lastPick).toBe('torusKnot');
    expect(moreBtn.querySelector('.vs3-shelf-label').textContent).toBe('Torus Knot');

    // Short click now re-invokes the last pick directly (no menu).
    fire(moreBtn, 'click');
    expect(menu.classList.contains('open')).toBe(false);
    expect(layer.params.objects.length).toBe(2);
    expect(layer.params.objects[1].primitive).toBe('torusKnot');

    // The caret still opens the full menu.
    fire(container.querySelector('.vs3-more-caret'), 'click');
    expect(menu.classList.contains('open')).toBe(true);
    fire(container.querySelector('.vs3-more-caret'), 'click');

    // Session memory survives a panel rebuild (module scope, not persisted).
    const second = mount();
    const moreBtn2 = second.container.querySelector('.vs3-more-btn');
    expect(moreBtn2.dataset.lastPick).toBe('torusKnot');
    expect(moreBtn2.querySelector('.vs3-shelf-label').textContent).toBe('Torus Knot');
    fire(moreBtn2, 'click');
    expect(second.layer.params.objects.length).toBe(1);
    expect(second.layer.params.objects[0].primitive).toBe('torusKnot');
  });

  test('Ground is always in the scene tree; its visibility toggles params.ground.enabled', () => {
    const { container, layer } = mount();
    const ground = container.querySelector('.vs3-tree-ground');
    expect(ground).toBeTruthy();
    expect(ground.querySelector('.vs3-tree-name').textContent).toBe('Ground');
    expect(layer.params.ground.enabled).not.toBe(false);
    fire(ground.querySelector('.vs3-tree-vis'), 'click');
    expect(layer.params.ground.enabled).toBe(false);
  });

  test('curved-primitive inspector exposes dimension controls (torus: Diameter + Thickness) that write linked params', () => {
    const { container } = mount({
      objects: [{
        id: 'obj-1', name: 'Torus', primitive: 'torus',
        params: { sx: 34, sy: 9, sz: 9, detail: 24 },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      }],
    });
    fire(container.querySelector('.vs3-tree-row[data-object-id="obj-1"]'), 'click');
    const labels = Array.from(container.querySelectorAll('.vs3-lbl')).map((e) => e.textContent);
    expect(labels).toContain('Diameter');
    expect(labels).toContain('Thickness');
    expect(labels).toContain('Fidelity');
  });

  test('detaching the panel root self-heals: global listeners + portaled flyout are cleaned up', () => {
    const { container } = mount();
    // Open the flyout via the caret (always opens the menu regardless of any
    // session last-pick) so it portals to <body>.
    fire(container.querySelector('.vs3-more-caret'), 'click');
    const doc = container.ownerDocument;
    expect(doc.querySelector('.vs3-more-menu.open')).toBeTruthy();

    // Host rebuilds the pane for a non-scene layer: it just empties the
    // container, never calling our destroy.
    container.innerHTML = '';
    // Any subsequent global event triggers the self-heal teardown.
    doc.defaultView.dispatchEvent(new doc.defaultView.CustomEvent('vectura:scene-selection', { detail: null }));
    expect(doc.querySelector('.vs3-more-menu')).toBeNull();
  });
});
