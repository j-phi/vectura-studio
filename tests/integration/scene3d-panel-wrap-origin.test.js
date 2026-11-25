/**
 * etfKang "Wrap origin": the shared XY pad row on the 3D object Style tab. It appears only under the etfKang tone law, is
 * keyboard operable, and writes wrapOriginX / wrapOriginY together through the normal history path (one entry per gesture).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Scene3D panel: Wrap origin pad', () => {
  let runtime; let window; let document;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); ({ window, document } = runtime); });
  afterAll(() => runtime.cleanup());

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));
  const mount = (styleParams) => {
    const { UI } = window.Vectura;
    const group = { id: 'g1', type: 'scene3d', isGroup: true };
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Ball', visible: true, parentId: 'g1',
      params: { primitive: 'sphere', params: { radius: 40 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid', style: { penId: null, mapper: 'hatch', params: { ...styleParams } } },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn(), engine: { getLayerById: (id) => (id === 'g1' ? group : null) } }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    fire(container.querySelector('.tab-btn[data-value="style"]'), 'click');
    return { layer, container, ui };
  };
  const padOf = (c) => c.querySelector('.vs3-row[data-wrap-origin] .vtp-xypad');
  const key = (el, k, shift = false) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));

  test('shown for etfKang, absent for another law', () => {
    expect(padOf(mount({ toneLaw: 'etfKang' }).container)).toBeTruthy();
    expect(padOf(mount({ toneLaw: 'ladder' }).container)).toBeFalsy();
  });

  test('the pad is a labelled slider and reads "top pole" at the default', () => {
    const p = padOf(mount({ toneLaw: 'etfKang' }).container);
    expect(p.getAttribute('role')).toBe('slider');
    expect(p.getAttribute('aria-label')).toBe('Wrap origin');
    expect(p.getAttribute('aria-valuetext')).toBe('top pole');
  });

  test('arrow keys write both keys in one history step each; a stored origin seeds the knob', () => {
    const { layer, container, ui } = mount({ toneLaw: 'etfKang' });
    const p = padOf(container);
    key(p, 'ArrowRight', true);
    expect(layer.params.style.params.wrapOriginX).toBeCloseTo(0.1, 5);
    expect(layer.params.style.params.wrapOriginY).toBe(0);
    expect(ui.app.pushHistory).toHaveBeenCalledTimes(1);
    key(padOf(container), 'ArrowDown', true);
    expect(layer.params.style.params.wrapOriginY).toBeCloseTo(0.1, 5);
    expect(ui.app.pushHistory).toHaveBeenCalledTimes(2);
    const seeded = padOf(mount({ toneLaw: 'etfKang', wrapOriginX: 0.5, wrapOriginY: -0.5 }).container);
    expect(seeded.querySelector('.vtp-xypad-knob').style.left).toBe('75%');
    expect(seeded.querySelector('.vtp-xypad-knob').style.top).toBe('25%');
  });

  test('the value is clamped to the unit disk and double-click recentres', () => {
    const { layer, container } = mount({ toneLaw: 'etfKang', wrapOriginX: 0.9 });
    const p = padOf(container);
    for (let i = 0; i < 8; i++) key(padOf(container), 'ArrowRight', true);
    const { wrapOriginX: x, wrapOriginY: y } = layer.params.style.params;
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0001);
    fire(padOf(container), 'dblclick');
    expect(layer.params.style.params.wrapOriginX).toBe(0);
    expect(layer.params.style.params.wrapOriginY).toBe(0);
    expect(p).toBeTruthy();
  });
});
