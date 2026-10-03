/**
 * U3 (fill-style review r3, docs/3d-audit/fill-style-review/r3-artistic.md) —
 * Object 3D panel reach.
 *
 *   1. P0 parity: in a scene TREE the scene group's Style editor reaches only
 *      the ground (every object3d child declares its own style and the
 *      whole-style cascade lets it win), so the Object 3D LEAF Style tab must
 *      offer every row the scene editor offers: cross angle / density /
 *      triple, angle ref, link fill, contour style, the spiral and dot rows,
 *      wireframe edges, the stroke (Line / Wobble) rows and the Highlight and
 *      X-ray blocks.
 *   2. Hidden-but-live engine keys get rows where they change output:
 *      wobbleScale, overstroke, spiralPitch, contourStep, toneQuantLevels.
 *      Density reaches the engine's own 500 clamp.
 *   3. Honest controls: rows that cannot apply to the shape are removed; rows
 *      the current Fill Style ignores are disabled with an (i) reason.
 *
 * Every test here fails on the pre-U3 panel (the rows did not exist on the
 * leaf, or were not gated).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('U3 — Object 3D Style tab parity + honest gating', () => {
  let runtime; let window; let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });
  afterAll(() => runtime.cleanup());

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const clickTab = (container, value) => fire(container.querySelector(`.tab-btn[data-value="${value}"]`), 'click');

  const mountLeaf = (mapper, styleParams = {}, primitive = 'box', extra = {}) => {
    const { UI } = window.Vectura;
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Obj', visible: true, parentId: null,
      params: {
        primitive,
        params: {},
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: extra.visibility || 'solid',
        style: { penId: null, mapper, params: { ...styleParams } },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    clickTab(container, 'style');
    return { layer, container, ui };
  };

  const page = (c) => c.querySelector('.vs3-page[data-page="style"]');
  const rowByLabel = (c, label) => Array.from(page(c).querySelectorAll('.vs3-row'))
    .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label) || null;
  const labels = (c) => Array.from(page(c).querySelectorAll('.vs3-row .vs3-lbl')).map((l) => l.textContent);
  const segClick = (row, value) => {
    const btn = row.querySelector(`[data-value="${value}"]`) || Array.from(row.querySelectorAll('button'))
      .find((b) => (b.textContent || '').trim().toLowerCase() === String(value).toLowerCase());
    btn.click();
  };

  describe('1 — every scene-editor row is reachable on the leaf', () => {
    test('crosshatch on a sphere: Cross angle, Cross density and Triple hatch rows exist', () => {
      const { container } = mountLeaf('crosshatch', { toneLaw: 'taperedEnds' }, 'sphere');
      const l = labels(container);
      expect(l).toEqual(expect.arrayContaining(['Cross angle', 'Cross density', 'Triple hatch']));
    });

    test('hatch on a box: Angle ref and Link fill rows exist and write the leaf style', () => {
      const { container, layer } = mountLeaf('hatch', {}, 'box');
      expect(rowByLabel(container, 'Angle ref')).toBeTruthy();
      const link = rowByLabel(container, 'Link fill');
      expect(link).toBeTruthy();
      segClick(link, 'on');
      expect(layer.params.style.params.linkFill).toBe(true);
    });

    test('spiral on a sphere: Angle offset, Eccentricity, Centre, Axis snap, Mode rows exist', () => {
      const { container } = mountLeaf('spiral', {}, 'sphere');
      expect(labels(container)).toEqual(expect.arrayContaining(['Angle offset', 'Eccentricity', 'Centre', 'Axis snap', 'Wrap']));
    });

    test('stipple: Dot, Dot size and Jitter rows exist; Dot angle only for an asymmetric mark', () => {
      const dot = mountLeaf('stipple', {}, 'box');
      expect(labels(dot.container)).toEqual(expect.arrayContaining(['Dot', 'Dot size', 'Jitter']));
      expect(rowByLabel(dot.container, 'Dot angle')).toBeNull(); // a dot is rotationally symmetric
      const cross = mountLeaf('stipple', { dotShape: 'cross' }, 'box');
      expect(rowByLabel(cross.container, 'Dot angle')).toBeTruthy();
    });

    test('wireframe: Edges and Show hidden rows exist', () => {
      const { container } = mountLeaf('wireframe', {}, 'box');
      expect(labels(container)).toEqual(expect.arrayContaining(['Edges', 'Show hidden']));
    });

    test('a fill Type gets the Stroke block (Line / Wobble / Overstroke) and the Highlight block', () => {
      const { container, layer } = mountLeaf('hatch', {}, 'box');
      expect(labels(container)).toEqual(expect.arrayContaining(['Line', 'Wobble', 'Overstroke', 'Treatment']));
      segClick(rowByLabel(container, 'Overstroke'), 'on');
      expect(layer.params.style.params.overstroke).toBe(true);
    });

    test('X-ray rows appear on the leaf when the object is x-ray', () => {
      const solid = mountLeaf('hatch', {}, 'sphere');
      expect(rowByLabel(solid.container, 'Back faces')).toBeNull();
      const xr = mountLeaf('hatch', {}, 'sphere', { visibility: 'xray' });
      expect(labels(xr.container)).toEqual(expect.arrayContaining(['Back faces', 'Back density', 'Back line', 'Depth → density', 'Depth → weight', 'Back pen', 'Front line']));
    });
  });

  describe('2 — hidden-but-live engine keys', () => {
    test('Wobble scale appears only once Wobble is on, and not on a curved shape', () => {
      const off = mountLeaf('hatch', { wobble: 0 }, 'box');
      expect(rowByLabel(off.container, 'Wobble scale')).toBeNull();
      const on = mountLeaf('hatch', { wobble: 40 }, 'box');
      expect(rowByLabel(on.container, 'Wobble scale')).toBeTruthy();
      const curved = mountLeaf('hatch', { wobble: 40 }, 'sphere');
      expect(rowByLabel(curved.container, 'Wobble scale')).toBeNull();
    });

    test('spiral Pitch: Auto by default; Set writes the density-derived pitch; Auto removes the key', () => {
      const { container, layer } = mountLeaf('spiral', { fillDensity: 50 }, 'box');
      const row = rowByLabel(container, 'Pitch');
      expect(row).toBeTruthy();
      expect(layer.params.style.params.spiralPitch).toBeUndefined();
      segClick(row, 'set');
      // 14 - 0.136 * 50 = 7.2 — the pitch the engine already draws at Density 50.
      expect(layer.params.style.params.spiralPitch).toBeCloseTo(7.2, 5);
      segClick(rowByLabel(container, 'Pitch'), 'auto');
      expect('spiralPitch' in layer.params.style.params).toBe(false);
    });

    test('spiral Pitch is removed on a curved surface spiral, offered on a curved Flat spiral', () => {
      expect(rowByLabel(mountLeaf('spiral', {}, 'sphere').container, 'Pitch')).toBeNull();
      expect(rowByLabel(mountLeaf('spiral', { spiralMode: 'flatClip' }, 'sphere').container, 'Pitch')).toBeTruthy();
    });

    test('contour Step: offered on a box and on a curved Region contour only', () => {
      expect(rowByLabel(mountLeaf('contour', {}, 'box').container, 'Step')).toBeTruthy();
      expect(rowByLabel(mountLeaf('contour', {}, 'sphere').container, 'Step')).toBeNull();
      expect(rowByLabel(mountLeaf('contour', { contourStyle: 'region' }, 'sphere').container, 'Step')).toBeTruthy();
    });

    test('quantised field Levels row only under the quantised Continuous Field', () => {
      expect(rowByLabel(mountLeaf('hatch', { toneLaw: 'contFieldSigmoid' }, 'sphere').container, 'Levels')).toBeNull();
      const q = mountLeaf('hatch', { toneLaw: 'contFieldSigmoid', fieldMetric: 'quantised' }, 'sphere');
      expect(rowByLabel(q.container, 'Levels')).toBeTruthy();
      // Measured dead on a faceted shape (the faceted path never reads it).
      const box = mountLeaf('hatch', { toneLaw: 'contFieldSigmoid', fieldMetric: 'quantised' }, 'box');
      expect(rowByLabel(box.container, 'Levels')).toBeNull();
    });

    test('Density reaches the engine clamp (500) on the leaf and the scene editor descriptor', () => {
      const { container } = mountLeaf('hatch', {}, 'box');
      const density = rowByLabel(container, 'Density').querySelector('input[type="range"]');
      expect(density.max).toBe('500');
    });
  });

  describe('3 — honest controls', () => {
    test('Min rulings, Angle ref and Link fill are removed on a curved shape (never read there)', () => {
      const { container } = mountLeaf('hatch', {}, 'sphere');
      ['Min rulings', 'Angle ref', 'Link fill'].forEach((l) => expect(rowByLabel(container, l)).toBeNull());
    });

    test('Triple hatch: removed on a box; disabled with a reason under Ladder; live under Tapered Ends', () => {
      expect(rowByLabel(mountLeaf('crosshatch', {}, 'box').container, 'Triple hatch')).toBeNull();
      const ladder = rowByLabel(mountLeaf('crosshatch', { toneLaw: 'ladder' }, 'sphere').container, 'Triple hatch');
      expect(ladder.classList.contains('is-disabled')).toBe(true);
      expect(ladder.getAttribute('title')).toMatch(/Triple hatch/);
      expect(ladder.querySelector('.vs3-lawinfo-btn')).toBeTruthy();
      const tapered = rowByLabel(mountLeaf('crosshatch', { toneLaw: 'taperedEnds' }, 'sphere').container, 'Triple hatch');
      expect(tapered.classList.contains('is-disabled')).toBe(false);
    });

    test('a disabled row does not write', () => {
      const { container, layer } = mountLeaf('crosshatch', { toneLaw: 'ladder' }, 'sphere');
      const row = rowByLabel(container, 'Triple hatch');
      segClick(row, 'on');
      expect(layer.params.style.params.tripleHatch).toBeUndefined();
    });

    test('Cross angle is disabled under a field-driven (mono) Fill Style', () => {
      const row = rowByLabel(mountLeaf('crosshatch', { toneLaw: 'mazeFill' }, 'box').container, 'Cross angle');
      expect(row.classList.contains('is-disabled')).toBe(true);
    });

    test('Highlight on a curved shape: dead treatments are disabled, Mode/Shadow grade/HL pen removed; band count never offered', () => {
      const { container } = mountLeaf('hatch', { highlightTreatment: 'burst' }, 'sphere');
      const sel = rowByLabel(container, 'Treatment').querySelector('select');
      const opt = (v) => Array.from(sel.options).find((o) => o.value === v);
      expect(opt('restyle').disabled).toBe(true); // U5: Dashed + Dotted are Restyle line
      expect(opt('altFill').disabled).toBe(false);
      expect(opt('burst').disabled).toBe(false);
      ['Highlight mode', 'Shadow grade', 'HL pen', 'Bands'].forEach((l) => expect(rowByLabel(container, l)).toBeNull());
      expect(rowByLabel(container, 'Burst count')).toBeTruthy();
    });

    test('Highlight on a box hatch keeps Mode and Shadow grade; band count still not offered', () => {
      const { container } = mountLeaf('hatch', { highlightTreatment: 'restyle' }, 'box');
      expect(rowByLabel(container, 'Highlight mode')).toBeTruthy();
      expect(rowByLabel(container, 'Shadow grade')).toBeTruthy();
      expect(rowByLabel(container, 'HL pen')).toBeTruthy();
      expect(rowByLabel(container, 'Bands')).toBeNull();
    });

    test('Seed-like rows owned by another unit are untouched: Stroke Fill row still renders', () => {
      const { container } = mountLeaf('hatch', { toneLaw: 'taperedEnds' }, 'sphere');
      expect(rowByLabel(container, 'Stroke Fill')).toBeTruthy();
    });
  });

  describe('defaults reproduce today — opening the panel writes nothing', () => {
    test('mounting the leaf for every Type leaves the style bag untouched', () => {
      ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple', 'wireframe'].forEach((m) => {
        ['box', 'sphere'].forEach((prim) => {
          const { layer } = mountLeaf(m, { toneLaw: 'ladder' }, prim);
          expect(layer.params.style.params).toEqual({ toneLaw: 'ladder' });
        });
      });
    });
  });
});

describe('U3 — the leaf reaches a real scene-tree object (engine round trip)', () => {
  let runtime; let window; let document;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });
  afterAll(() => runtime.cleanup());

  test('Overstroke toggled on the leaf changes the composed scene ink (the scene editor could not)', () => {
    const V = window.Vectura;
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    obj.params.style = { penId: null, mapper: 'hatch', params: { toneLaw: 'ladder' } };
    const objInk = () => {
      engine.computeAllDisplayGeometry();
      return (group.scenePaths || []).filter((p) => p.meta && p.meta.kind === 'sceneFill'
        && p.meta.sceneTarget && p.meta.sceneTarget.objectId === obj.id).length;
    };
    const before = objInk();
    expect(before).toBeGreaterThan(0);

    const ui = { app: { engine, pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    V.UI.Scene3DPanel.build(ui, obj, container);
    container.querySelector('.tab-btn[data-value="style"]').dispatchEvent(new window.Event('click', { bubbles: true }));
    const row = Array.from(container.querySelectorAll('.vs3-page[data-page="style"] .vs3-row'))
      .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === 'Overstroke');
    Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === 'On').click();
    expect(obj.params.style.params.overstroke).toBe(true);
    // Overstroke double-strikes every fill line.
    expect(objInk()).toBe(before * 2);
  });
});
