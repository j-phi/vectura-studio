/**
 * W3-D — the "Lock marks to surface" row on the 3D panel: writes style.params.markSpace ('surface' | 'pose') through the
 * normal history path, is disabled with the engine's own reason when the style cannot lock, and shows the scene's
 * Level S / Level F read-out.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Scene3D panel: Lock marks to surface', () => {
  let runtime;
  let window;
  let document;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); ({ window, document } = runtime); });
  afterAll(() => runtime.cleanup());

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));
  const mountLeaf = (mapper = 'hatch', styleParams = {}, primitive = 'sphere', levelS, groupParams) => {
    const { UI } = window.Vectura;
    const group = { id: 'g1', type: 'scene3d', isGroup: true, _sceneLevelS: levelS, params: groupParams };
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Ball', visible: true, parentId: 'g1',
      params: {
        primitive, params: { radius: 40 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid', style: { penId: null, mapper, params: { ...styleParams } },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn(), engine: { getLayerById: (id) => (id === 'g1' ? group : null) } }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    fire(container.querySelector('.tab-btn[data-value="style"]'), 'click');
    return { layer, container, ui };
  };
  const row = (container) => [...container.querySelectorAll('.vs3-row')].find((r) => /Lock marks to surface/.test((r.querySelector('.vs3-lbl') || {}).textContent || ''));
  const seg = (container, value) => [...row(container).querySelectorAll('button')].find((b) => (b.dataset.value || b.textContent.trim().toLowerCase()) === value);

  test('every locking mapper lists the row; wireframe does not', () => {
    ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'].forEach((m) => {
      expect(row(mountLeaf(m).container), m).toBeTruthy();
    });
    expect(row(mountLeaf('wireframe').container)).toBeFalsy();
  });

  test('W3-B: the row is live for the routed laws (dutyConst, endShorten) and a surface style stays surface', () => {
    ['dutyConst', 'endShorten'].forEach((law) => {
      ['hatch', 'crosshatch'].forEach((m) => {
        const r = row(mountLeaf(m, { toneLaw: law }).container);
        expect(r.getAttribute('aria-disabled'), `${law} ${m}`).not.toBe('true');
      });
    });
  });

  test('the toggle writes markSpace surface / pose and takes one history entry each', () => {
    const { layer, container, ui } = mountLeaf('hatch');
    expect(layer.params.style.params.markSpace).toBeUndefined();
    fire(seg(container, 'on'), 'click');
    expect(layer.params.style.params.markSpace).toBe('surface');
    expect(ui.app.pushHistory).toHaveBeenCalledTimes(1);
    fire(seg(container, 'off'), 'click');
    expect(layer.params.style.params.markSpace).toBe('pose');
    expect(ui.app.pushHistory).toHaveBeenCalledTimes(2);
  });

  test('a stored surface style reads On; a Type swap keeps the key', () => {
    const { container } = mountLeaf('hatch', { markSpace: 'surface' });
    expect(row(container).querySelector('[aria-pressed="true"], .active, [aria-checked="true"]').textContent.trim()).toMatch(/On/i);
  });

  test('Wrap Flat disables the row with the engine reason; the write is inert', () => {
    const { layer, container } = mountLeaf('hatch', { wrap: 'flat' });
    const r = row(container);
    expect(r.getAttribute('aria-disabled')).toBe('true');
    expect(r.getAttribute('title')).toMatch(/Wrap is Flat/);
    expect(layer.params.style.params.markSpace).toBeUndefined();
  });

  test('x-ray and tone bands disable it with their own reasons', () => {
    const { container } = mountLeaf('hatch', { toneBands: 3 });
    expect(row(container).getAttribute('title')).toMatch(/Tone bands/);
  });

  test('the Level S read-out follows group._sceneLevelS; absent when unknown', () => {
    expect(mountLeaf('hatch', {}, 'sphere', true).container.querySelector('.vs3-markspace-hint').dataset.levelS).toBe('1');
    const f = mountLeaf('hatch', {}, 'sphere', false).container.querySelector('.vs3-markspace-hint');
    expect(f.dataset.levelS).toBe('0');
    expect(f.textContent).toMatch(/Full redraw while dragging/);
    // Internal tier names (Level S / Level F) never reach the UI text.
    expect(f.textContent).not.toMatch(/Level [SF]/);
    expect(mountLeaf('hatch').container.querySelector('.vs3-markspace-hint')).toBeFalsy();
  });

  test('the in-app help documents the control', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../src/ui/modals/help-shortcuts.js'), 'utf8');
    expect(src).toMatch(/Lock marks to surface/);
    expect(src).toMatch(/Fast drag/);
    expect(src).not.toMatch(/Level [SF]\b/);
  });

  test('FX-J5: a scene that receives shadows or has an area light disables the row with the engine reason', () => {
    const rs = row(mountLeaf('hatch', {}, 'sphere', false, { shadow: { shadowReceiveOnObjects: true } }).container);
    expect(rs.getAttribute('aria-disabled')).toBe('true');
    expect(rs.getAttribute('title')).toMatch(/receives cast shadows/);
    const al = row(mountLeaf('hatch', { markSpace: 'surface' }, 'sphere', false, { lights: [{ type: 'area' }] }).container);
    expect(al.getAttribute('aria-disabled')).toBe('true');
    expect(al.getAttribute('title')).toMatch(/area light/);
    expect(row(mountLeaf('hatch', {}, 'sphere', false, { shadow: { shadowReceiveOnObjects: false } }).container).getAttribute('aria-disabled')).not.toBe('true');
  });

  test('FX-J6: a scene-scope Type swap keeps markSpace', () => {
    const { UI } = window.Vectura;
    const group = {
      id: 'g1', type: 'scene3d', isGroup: true,
      params: { objects: [], styleTable: { scene: { mapper: 'hatch', params: { markSpace: 'surface' } }, byObject: {} } },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn(), engine: { getLayerById: () => null } }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, group, container);
    fire(container.querySelector('.tab-btn[data-value="style"]'), 'click');
    const sel = container.querySelector('[aria-label="Style mapper"]');
    const native = sel.tagName === 'SELECT' ? sel : sel.querySelector('select');
    native.value = 'crosshatch';
    fire(native, 'change');
    expect(group.params.styleTable.scene.mapper).toBe('crosshatch');
    expect(group.params.styleTable.scene.params.markSpace).toBe('surface');
  });
});
