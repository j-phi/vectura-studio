/**
 * Object 3D Style tab - panel reach for tone bands, chaining and the folded rows.
 *   tone bands + per-band / per-tier pen pickers, Voronoi "Chain edges",
 *   Stipple Smoothing / Simplify, Alt angle, wireframe "Show hidden" removed,
 *   X-ray "Front line" kept (greyed with a reason) on a faceted shape.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Object 3D Style tab - tone bands, chaining and folded rows', () => {
  let runtime; let window; let document;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
    const pens = window.Vectura.SETTINGS.pens;
    while (pens.length < 4) pens.push({ id: `t-pen-${pens.length}`, name: `T${pens.length}`, color: '#123456', width: 0.3 });
  });
  afterAll(() => runtime.cleanup());

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const mountLeaf = (mapper, styleParams = {}, primitive = 'sphere', extra = {}) => {
    const { UI } = window.Vectura;
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Obj', visible: true, parentId: null,
      params: {
        primitive, params: {}, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: extra.visibility || 'solid', style: { penId: null, mapper, params: { ...styleParams } },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    fire(container.querySelector('.tab-btn[data-value="style"]'), 'click');
    return { layer, container };
  };
  const page = (c) => c.querySelector('.vs3-page[data-page="style"]');
  const rowByLabel = (c, label) => Array.from(page(c).querySelectorAll('.vs3-row'))
    .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label) || null;
  const labels = (c) => Array.from(page(c).querySelectorAll('.vs3-row .vs3-lbl')).map((l) => l.textContent);
  const click = (row, text) => Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === text).click();

  test('Tone bands: absent by default; picking 3 writes the key and the pen palette; pickers appear', () => {
    const { layer, container } = mountLeaf('hatch', { toneLaw: 'ladder' });
    expect(layer.params.style.params.toneBands).toBeUndefined();
    expect(labels(container)).not.toContain('Band 1 pen');
    click(rowByLabel(container, 'Tone bands'), '3');
    const sp = layer.params.style.params;
    expect(sp.toneBands).toBe(3);
    expect(sp.tierPens).toHaveLength(3);
    expect(labels(container)).toEqual(expect.arrayContaining(['Band 1 pen', 'Band 2 pen', 'Band 3 pen']));
    expect(labels(container)).not.toContain('Band 4 pen');
  });

  test('a band pen picker writes that band only', () => {
    const { layer, container } = mountLeaf('hatch', { toneLaw: 'ladder', toneBands: 2, tierPens: ['t-pen-0', 't-pen-1'] });
    const sel = rowByLabel(container, 'Band 2 pen').querySelector('select');
    sel.value = 't-pen-3';
    fire(sel, 'change');
    expect(layer.params.style.params.tierPens).toEqual(['t-pen-0', 't-pen-3']);
  });

  test('Off clears the bands and the pens', () => {
    const { layer, container } = mountLeaf('hatch', { toneLaw: 'ladder', toneBands: 3, tierPens: ['t-pen-0', 't-pen-1', 't-pen-2'] });
    click(rowByLabel(container, 'Tone bands'), 'Off');
    expect(layer.params.style.params.toneBands).toBe(0);
    expect(layer.params.style.params.tierPens).toBeNull();
  });

  test('a three-pen law greys Tone bands and offers per-tier pickers', () => {
    const { layer, container } = mountLeaf('hatch', { toneLaw: 'penInterleave', tierPens: ['t-pen-0', 't-pen-1', 't-pen-2'] });
    expect(rowByLabel(container, 'Tone bands').classList.contains('is-disabled')).toBe(true);
    expect(labels(container)).toEqual(expect.arrayContaining(['Tier 1 pen', 'Tier 2 pen', 'Tier 3 pen']));
    const sel = rowByLabel(container, 'Tier 3 pen').querySelector('select');
    sel.value = 't-pen-3';
    fire(sel, 'change');
    expect(layer.params.style.params.tierPens).toEqual(['t-pen-0', 't-pen-1', 't-pen-3']);
  });

  test('Voronoi Web has Chain edges; Maze keeps Chain walls', () => {
    const v = mountLeaf('hatch', { toneLaw: 'voronoiWeb' });
    expect(labels(v.container)).toContain('Chain edges');
    click(rowByLabel(v.container, 'Chain edges'), 'On');
    expect(v.layer.params.style.params.chainMarks).toBe(true);
    const m = mountLeaf('hatch', { toneLaw: 'mazeFill' });
    expect(labels(m.container)).toContain('Chain walls');
    expect(labels(m.container)).not.toContain('Chain edges');
  });

  test('Stipple Dot on a curved shape shows Simplify only; Ring and Plus grey it', () => {
    const dot = mountLeaf('stipple', {}, 'sphere');
    expect(labels(dot.container)).toContain('Simplify');
    expect(labels(dot.container)).not.toContain('Curves');
    expect(rowByLabel(dot.container, 'Simplify').classList.contains('is-disabled')).toBe(false);
    // Smoothing on the stipple page: only the Object tab's border row exists (not in the Style page).
    expect(labels(dot.container)).not.toContain('Smoothing');
    ['ring', 'plus'].forEach((shape) => {
      const m = mountLeaf('stipple', { dotShape: shape }, 'sphere');
      expect(rowByLabel(m.container, 'Simplify').classList.contains('is-disabled')).toBe(true);
    });
    expect(labels(mountLeaf('stipple', {}, 'box').container)).not.toContain('Simplify');
  });

  test('Alt fill lines have an Alt angle row', () => {
    const { container } = mountLeaf('hatch', { toneLaw: 'ladder', highlightTreatment: 'altFill', altFillMapper: 'lines' }, 'sphere');
    expect(labels(container)).toContain('Alt angle');
  });

  test('wireframe has no Show hidden row (Hidden edges owns it)', () => {
    const { container } = mountLeaf('wireframe', {}, 'box');
    expect(labels(container)).toContain('Edges');
    expect(labels(container)).not.toContain('Show hidden');
  });

  test('X-ray Front line stays on a faceted shape, greyed with a reason', () => {
    const box = mountLeaf('hatch', { toneLaw: 'ladder' }, 'box', { visibility: 'xray' });
    const row = rowByLabel(box.container, 'Front line');
    expect(row).toBeTruthy();
    expect(row.classList.contains('is-disabled')).toBe(true);
    const sph = mountLeaf('hatch', { toneLaw: 'ladder' }, 'sphere', { visibility: 'xray' });
    expect(rowByLabel(sph.container, 'Front line').classList.contains('is-disabled')).toBe(false);
  });
});
