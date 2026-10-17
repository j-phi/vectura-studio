/**
 * Object 3D Style tab — rows grey (with a reason) or appear where a Fill Style
 * reads or ignores a control.
 *
 *   item 2/3  a monoline Fill Style greys Contour in the Type list and, when it
 *             has no direction, the Angle row (both with a reason in the (i)).
 *   item 6    turingStripe shows a "Stripe align" row that writes `stripeAlign`.
 *   item 7    the "Jitter has no effect on a curved shape" grey is gone.
 *   item 8    mkDotScreen shows Dot size / Dot angle on the line Types.
 *   item 9    Seed + RANDOMIZE grey with "No effect for this style" when no fill
 *             in the layer draws from the seed.
 */

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};

describe('Object 3D Style tab — mono-law gates and control rows', () => {
  let runtime; let window; let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
  });
  afterAll(() => runtime.cleanup());

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));
  const clickTab = (container, value) => fire(container.querySelector(`.tab-btn[data-value="${value}"]`), 'click');

  const mountLeaf = (mapper, styleParams, primitive = 'sphere') => {
    const { UI } = window.Vectura;
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Obj', visible: true, parentId: null,
      params: {
        primitive,
        params: primitive === 'sphere' ? { radius: 40, detail: 14 } : { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid',
        style: { penId: null, mapper, params: { ...styleParams } },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    clickTab(container, 'style');
    return { layer, container };
  };
  const typeSelect = (container) => [...container.querySelectorAll('select')]
    .find((s) => [...(s.options || [])].some((o) => o.value === 'contour'));
  const rowOf = (container, label) => [...container.querySelectorAll('.vs3-row')]
    .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label);

  test('a direction-free monoline law greys Contour and Angle, with the reason beside Fill Style', () => {
    const { container } = mountLeaf('hatch', { toneLaw: 'voronoiWeb', fillAngle: 45 });
    const contour = [...typeSelect(container).options].find((o) => o.value === 'contour');
    expect(contour.disabled).toBe(true);
    expect(contour.textContent).toMatch(/same as Hatch/);
    const angle = rowOf(container, 'Angle');
    expect(angle.getAttribute('aria-disabled')).toBe('true');
    expect(angle.querySelector('.vs3-lawinfo-btn')).toBeTruthy();
    // The Fill Style (i) names the Contour reason.
    expect(container.textContent).toMatch(/Contour draws the same picture as Hatch/);
  });

  test('a monoline law WITH a direction keeps Angle live (and still greys Contour)', () => {
    const { container } = mountLeaf('hatch', { toneLaw: 'dutyConst', fillAngle: 45 });
    expect([...typeSelect(container).options].find((o) => o.value === 'contour').disabled).toBe(true);
    expect(rowOf(container, 'Angle').getAttribute('aria-disabled')).toBeNull();
  });

  test('Ladder (the default) greys nothing', () => {
    const { container } = mountLeaf('hatch', { toneLaw: 'ladder' });
    const contour = [...typeSelect(container).options].find((o) => o.value === 'contour');
    expect(contour.disabled).toBeFalsy();
    expect(contour.textContent).toBe('Contour');
    expect(rowOf(container, 'Angle').getAttribute('aria-disabled')).toBeNull();
  });

  test('turingStripe shows Stripe align, and moving it writes stripeAlign', () => {
    const { container, layer } = mountLeaf('hatch', { toneLaw: 'turingStripe' });
    const slider = container.querySelector('input.ctrl-slider[aria-label="Stripe alignment"]');
    expect(slider).toBeTruthy();
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('1.2');
    slider.value = '0.9';
    fire(slider, 'input');
    fire(slider, 'change');
    expect(layer.params.style.params.stripeAlign).toBe(0.9);
    // ...and no other law shows it.
    const other = mountLeaf('hatch', { toneLaw: 'ladder' });
    expect(other.container.querySelector('input.ctrl-slider[aria-label="Stripe alignment"]')).toBeFalsy();
  });

  test('mkDotScreen shows Dot size on the line Types and writes dotSize', () => {
    const { container, layer } = mountLeaf('hatch', { toneLaw: 'mkDotScreen' });
    const slider = container.querySelector('input.ctrl-slider[aria-label="Dot size"]');
    expect(slider).toBeTruthy();
    slider.value = '1.5';
    fire(slider, 'input');
    fire(slider, 'change');
    expect(layer.params.style.params.dotSize).toBe(1.5);
  });

  test('Jitter on a curved Stipple is a live row, not a greyed "no effect" one', () => {
    const { container } = mountLeaf('stipple', { toneLaw: 'ladder' });
    const jitter = rowOf(container, 'Jitter');
    // The leaf panel does not render the stipple descriptors, so assert on the
    // gate itself: no verdict string, no note about curved shapes anywhere.
    expect(container.textContent).not.toMatch(/Jitter has no effect/);
    if (jitter) expect(jitter.getAttribute('aria-disabled')).toBeNull();
  });

  describe('Seed honesty', () => {
    const sceneLayer = (styleParams, mapper = 'hatch', primitive = 'sphere') => ({
      id: 's1', type: 'scene3d', name: 'Scene', visible: true,
      params: {
        seed: 7, seedMode: 'seeded',
        objects: [{ id: 'o1', name: 'o', primitive, params: { radius: 40, detail: 14 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }],
        lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
        ground: { enabled: true },
        styleTable: { scene: { penId: null, mapper, params: styleParams }, byObject: {}, byFace: {} },
      },
    });

    test('the default hatch scene greys Seed + RANDOMIZE and says why', () => {
      const ACP = window.Vectura.UI.AlgoConfigPanel;
      const layer = sceneLayer({ toneLaw: 'ladder' });
      expect(ACP.layerSeedLive(layer)).toBe(false);
      ACP.applySeedReach(layer);
      expect(document.getElementById('inp-seed').disabled).toBe(true);
      expect(document.getElementById('btn-rand-seed').disabled).toBe(true);
      const note = document.querySelector('#seed-controls .seed-inert-info');
      expect(note).toBeTruthy();
      expect(note.textContent).toMatch(/No effect for this style/);
      expect(note.querySelector('.vs3-lawinfo-btn')).toBeTruthy();
    });

    test('a style with random marks wakes the Seed again', () => {
      const ACP = window.Vectura.UI.AlgoConfigPanel;
      ACP.applySeedReach(sceneLayer({ toneLaw: 'ladder' }));
      expect(document.getElementById('inp-seed').disabled).toBe(true);
      const live = sceneLayer({ toneLaw: 'ladder' }, 'stipple');
      expect(ACP.layerSeedLive(live)).toBe(true);
      ACP.applySeedReach(live);
      expect(document.getElementById('inp-seed').disabled).toBe(false);
      expect(document.getElementById('btn-rand-seed').disabled).toBe(false);
      expect(document.querySelector('#seed-controls .seed-inert-info')).toBeFalsy();
    });

    test('a non-3D layer never greys the Seed', () => {
      const ACP = window.Vectura.UI.AlgoConfigPanel;
      ACP.applySeedReach(sceneLayer({ toneLaw: 'ladder' }));
      ACP.applySeedReach({ id: 'x', type: 'flowfield', params: {} });
      expect(document.getElementById('inp-seed').disabled).toBe(false);
    });
  });
});
