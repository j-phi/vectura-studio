/**
 * fs-c3-panel — three docked left-hand 3D panel fixes, all in
 * src/ui/panels/scene3d-panel.js:
 *
 *   Job 1 — the focused LEAF object3d panel's fill Angle switches from a
 *           plain 0-180 range slider to the same circular UI.AngleDial the
 *           scene/object/face style editor already offers for `fillAngle`
 *           (descriptor D_ANGLE, kind:'dial', domain 0-360). fillAngle is
 *           stored screen-atan2 style (0deg = east, growing clockwise — see
 *           hatchPolygon in src/core/algorithms/geometry3d.js: dirX=cos,
 *           dirY=sin). UI.AngleDial is dial-space (0deg = up, clockwise), so
 *           every fillAngle dial call site applies the same +90 conversion
 *           documented at src/ui/fill-control-surface.js:467-500 — otherwise
 *           the dial pointer and the plotted hatch direction disagree by 90
 *           degrees. Domain is 0-360 (matches D_ANGLE) rather than 0-180: one
 *           stored param, one control convention, everywhere it is offered.
 *
 *   Job 2 — fillDensity's declared UI max rises from 100 to 200, with a
 *           consistent min of 1, in both places that literally declare it
 *           (D_DENSITY at the top of the file, and the leaf panel's own
 *           inline Density slider, which previously had an inconsistent
 *           min of 5). The engine's hatchSpacing (0-100 domain) is a later
 *           wave's job — this suite only pins the CONTROL's declared domain,
 *           not plotted output above 100.
 *
 *   Job 3 — the focused leaf object3d panel grows an object Border section
 *           (enable / weight / pen), previously reachable only from the
 *           scene/object/face style editor's object scope (buildObjectPanel
 *           does not read MAPPER_CONTROLS — the documented U9 catch). Every
 *           border weight control in the file (leaf + the pre-existing
 *           shared editor) grows a sibling Offset control writing
 *           obj.border.offset — mm, range [-2, 2], step 0.05, default 0,
 *           negative = inward. That contract and its geometry consumer are
 *           declared/landed by a different agent in a later wave; this
 *           panel only needs to write to it.
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

const fixtureObject = (n, primitive = 'box') => ({
  id: `obj-${n}`,
  name: `Box ${n}`,
  primitive,
  params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
});

describe('fs-c3-panel — left-hand 3D panel: angle dial / density domain / leaf border+offset', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));
  const clickTab = (container, value) => fire(container.querySelector(`.tab-btn[data-value="${value}"]`), 'click');

  // The focused LEAF object3d panel — direct mount, same idiom as the
  // "object3d leaf panel" describe block in scene3d-style-fill-lines-panel.test.js.
  const mountLeaf = (mapper = 'hatch', styleParams = {}, primitive = 'box') => {
    const { UI } = window.Vectura;
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Box', visible: true, parentId: null,
      params: {
        primitive,
        params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid',
        style: { penId: null, mapper, params: { ...styleParams } },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { layer, container };
  };

  // The scene/object/face style editor — mounted as a scene GROUP with one
  // object, then scoped to that object (same idiom as scene3d-panel.test.js's
  // Group B `mount()` + tree-row click).
  const mountGroupObjectScope = (paramsOverrides = {}) => {
    const { UI } = window.Vectura;
    const layer = {
      id: 's3d-1', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1',
      params: fixtureParams({ objects: [fixtureObject(1)], ...paramsOverrides }),
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    fire(container.querySelector('.vs3-tree-row'), 'click');
    return { layer, container };
  };

  const setHatchMapper = (container) => {
    const mapSel = [...container.querySelectorAll('select')]
      .find((s) => [...(s.options || [])].some((o) => o.value === 'contour'));
    mapSel.value = 'hatch';
    fire(mapSel, 'change');
  };

  // ── Job 1 — leaf fill-angle dial ──────────────────────────────────────────
  describe('Job 1 — leaf fill angle is a circular AngleDial (0-360)', () => {
    test('the leaf Style tab Angle row is an AngleDial, not the old 0-180 range slider', () => {
      const { container } = mountLeaf('hatch');
      clickTab(container, 'style');
      // RGR pin: the OLD leaf control was this exact slider.
      expect(container.querySelector('input.ctrl-slider[aria-label="Fill angle"]')).toBeFalsy();
      const dial = container.querySelector('.angle-ctrl svg.angle-dial');
      expect(dial).toBeTruthy();
      expect(dial.getAttribute('aria-valuemin')).toBe('0');
      expect(dial.getAttribute('aria-valuemax')).toBe('360');
    });

    test('dial-space matches the documented +90 offset for a screen-atan2 fillAngle', () => {
      // fillAngle 0 = hatch runs due EAST (hatchPolygon: dirX=cos(0)=1). The
      // dial is 0=up/clockwise, so east reads as 90 on the dial face.
      const { container } = mountLeaf('hatch', { fillAngle: 0 });
      clickTab(container, 'style');
      const dial = container.querySelector('.angle-ctrl svg.angle-dial');
      expect(dial.getAttribute('aria-valuenow')).toBe('90');
    });

    test('rotating the dial (keyboard nudge) writes style.params.fillAngle back through the same offset', () => {
      const { container, layer } = mountLeaf('hatch', { fillAngle: 45 });
      clickTab(container, 'style');
      const dial = container.querySelector('.angle-ctrl svg.angle-dial');
      const ev = new window.Event('keydown', { bubbles: true, cancelable: true });
      ev.key = 'ArrowRight';
      dial.dispatchEvent(ev);
      // ArrowRight = dial-space +1deg; dial-space 136 -> param 46.
      expect(layer.params.style.params.fillAngle).toBe(46);
    });
  });

  // ── Job 2 — fillDensity domain ────────────────────────────────────────────
  describe('Job 2 — fillDensity UI max is 200 (consistent min) everywhere declared', () => {
    test('shared scene/object/face style editor (D_DENSITY) declares min 1 / max 200', () => {
      const { container } = mountGroupObjectScope();
      clickTab(container, 'style');
      setHatchMapper(container);
      const density = container.querySelector('input.ctrl-slider[aria-label="Fill density"]');
      expect(density).toBeTruthy();
      expect(density.min).toBe('1');
      expect(density.max).toBe('200');
    });

    test('leaf panel Density slider declares min 1 / max 200 (was min 5 / max 100)', () => {
      const { container } = mountLeaf('hatch');
      clickTab(container, 'style');
      const density = container.querySelector('input.ctrl-slider[aria-label="Fill density"]');
      expect(density).toBeTruthy();
      expect(density.min).toBe('1');
      expect(density.max).toBe('200');
    });
  });

  // ── Job 3 — leaf object border + offset (everywhere weight exists) ───────
  describe('Job 3 — leaf object border reachable + Offset beside every border Weight', () => {
    test('leaf Style tab exposes a Border enable toggle (previously absent entirely)', () => {
      const { container } = mountLeaf('hatch');
      clickTab(container, 'style');
      const seg = container.querySelector('.seg-ctrl[aria-label="Silhouette border"]');
      expect(seg).toBeTruthy();
      expect(container.querySelector('input.ctrl-slider[aria-label="Border strength"]')).toBeFalsy();
    });

    test('enabling the leaf border writes layer.params.border.enabled and reveals Weight + Pen', () => {
      const { container, layer } = mountLeaf('hatch');
      clickTab(container, 'style');
      const seg = container.querySelector('.seg-ctrl[aria-label="Silhouette border"]');
      seg.querySelector('.seg-opt[data-value="on"]').click();
      expect(layer.params.border.enabled).toBe(true);
      const weight = container.querySelector('input.ctrl-slider[aria-label="Border strength"]');
      expect(weight).toBeTruthy();
      weight.value = '2.5';
      fire(weight, 'input');
      fire(weight, 'change');
      expect(layer.params.border.strength).toBe(2.5);
    });

    test('leaf border Weight has a sibling Offset control with the fixed contract (mm, [-2,2], step 0.05, default 0)', () => {
      const { container, layer } = mountLeaf('hatch');
      clickTab(container, 'style');
      const seg = container.querySelector('.seg-ctrl[aria-label="Silhouette border"]');
      seg.querySelector('.seg-opt[data-value="on"]').click();
      const offset = container.querySelector('input.ctrl-slider[aria-label="Border offset (mm)"]');
      expect(offset).toBeTruthy();
      expect(offset.min).toBe('-2');
      expect(offset.max).toBe('2');
      expect(offset.step).toBe('0.05');
      offset.value = '-1.25';
      fire(offset, 'input');
      fire(offset, 'change');
      expect(layer.params.border.offset).toBe(-1.25);
    });

    test('the pre-existing shared scene/object/face style editor Border also grows the sibling Offset control', () => {
      const { container, layer } = mountGroupObjectScope();
      clickTab(container, 'style');
      const seg = container.querySelector('.seg-ctrl[aria-label="Silhouette border"]');
      seg.querySelector('.seg-opt[data-value="on"]').click();
      const offset = container.querySelector('input.ctrl-slider[aria-label="Border offset (mm)"]');
      expect(offset).toBeTruthy();
      expect(offset.min).toBe('-2');
      expect(offset.max).toBe('2');
      expect(offset.step).toBe('0.05');
      offset.value = '0.5';
      fire(offset, 'input');
      fire(offset, 'change');
      expect(layer.params.objects[0].border.offset).toBe(0.5);
    });
  });
});
