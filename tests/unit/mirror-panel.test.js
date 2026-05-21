/*
 * Mirror panel (v2) — RGR coverage.
 * Spec: src/ui/panels/mirror-panel.js
 *
 * Each block here would FAIL against the legacy buildMirrorModifierControls
 * (different DOM structure, no picker mode, no v2 class names) and passes
 * against the new module. That's the red-green proof.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('MirrorPanel — module surface', () => {
  let runtime;
  let MirrorPanel;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    MirrorPanel = runtime.window.Vectura.UI.MirrorPanel;
  });

  afterAll(() => runtime.cleanup());

  test('exposes the canonical helpers + TYPES table', () => {
    expect(MirrorPanel).toBeTruthy();
    expect(typeof MirrorPanel.build).toBe('function');
    expect(typeof MirrorPanel.defaultParamsFor).toBe('function');
    expect(typeof MirrorPanel.nameFor).toBe('function');
    expect(typeof MirrorPanel.summaryFor).toBe('function');
    expect(typeof MirrorPanel.pointToAngleDeg).toBe('function');
    expect(Object.keys(MirrorPanel.TYPES).sort()).toEqual(['arc', 'line', 'radial', 'wallpaper']);
    expect(MirrorPanel.WALL_GROUPS).toHaveLength(17);
    // Family is now keyed on the actual crystallographic lattice (5 values)
    // instead of the legacy 3-bucket ad-hoc grouping. cmm correctly belongs
    // to 'rhombic' here — the legacy list mis-classified it as 'sq'.
    const fams = new Set(MirrorPanel.WALL_GROUPS.map((g) => g.family));
    expect(fams.size).toBe(5);
    ['oblique', 'rectangular', 'rhombic', 'square', 'hexagonal'].forEach((lat) => {
      expect(fams.has(lat)).toBe(true);
    });
    expect(MirrorPanel.WALL_GROUPS.find((g) => g.id === 'cmm').family).toBe('rhombic');
  });
});

describe('MirrorPanel — pure helpers (would fail against legacy UI)', () => {
  let runtime, MirrorPanel;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    MirrorPanel = runtime.window.Vectura.UI.MirrorPanel;
  });
  afterAll(() => runtime.cleanup());

  test('defaultParamsFor emits ALL fields for the canonical state model', () => {
    const line = MirrorPanel.defaultParamsFor('line');
    expect(line).toMatchObject({ angle: 90, xShift: 0, yShift: 0, replacedSide: 'positive' });

    const rad = MirrorPanel.defaultParamsFor('radial');
    expect(rad).toMatchObject({ mode: 'dihedral', count: 6, angle: 0, centerX: 0, centerY: 0 });

    const arc = MirrorPanel.defaultParamsFor('arc');
    expect(arc).toMatchObject({
      centerX: 0, centerY: 0, radius: 80, arcStart: -180, arcEnd: 180,
      replacedSide: 'outer', strength: 100, falloff: 0, clipToArc: false,
      rotationOffset: 0, copies: 1,
    });

    const wall = MirrorPanel.defaultParamsFor('wallpaper');
    expect(wall).toMatchObject({
      group: 'p4m', tileWidth: 60, tileHeight: 60, tileAngle: 90,
      rotation: 0, centerX: 0, centerY: 0,
    });
  });

  test('nameFor / summaryFor reflect mirror type + key params', () => {
    expect(MirrorPanel.nameFor({ type: 'line', angle: 90 })).toBe('Line · 90°');
    expect(MirrorPanel.nameFor({ type: 'radial', count: 6, mode: 'dihedral' })).toBe('Radial · 6× dihedral');
    expect(MirrorPanel.nameFor({ type: 'arc', radius: 80 })).toBe('Arc · r 80');
    // Crystallographic name is hidden by default (pref off) — show a friendly
    // composable summary instead. The `Wallpaper · p4m` form returns when the
    // showCrystallographicNames preference is enabled (covered below).
    expect(MirrorPanel.nameFor({ type: 'wallpaper', group: 'p4m' }))
      .toBe('Wallpaper · square · 4-fold · mirrored');

    expect(MirrorPanel.summaryFor({ type: 'line', angle: 45, xShift: 10, yShift: -5, replacedSide: 'negative' }))
      .toBe('45° · SHIFT 10,-5 · SIDE −');
    expect(MirrorPanel.summaryFor({ type: 'radial', count: 4, mode: 'rotation', angle: 30 }))
      .toBe('4 WEDGES · ROTATION · 30°');
    expect(MirrorPanel.summaryFor({ type: 'arc', radius: 120, arcStart: -90, arcEnd: 90, replacedSide: 'inner', strength: 75 }))
      .toBe('R 120 · -90→90° · INNER · 75%');
    expect(MirrorPanel.summaryFor({ type: 'wallpaper', group: 'p6m', tileWidth: 80, tileHeight: 80, rotation: 15 }))
      .toBe('P6M · 80×80 · 15°');
  });

  test('pointToAngleDeg maps cardinal directions correctly', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 }; // center at (50,50)
    expect(MirrorPanel.pointToAngleDeg(50, 0,   rect, false)).toBe(0);
    expect(MirrorPanel.pointToAngleDeg(100, 50, rect, false)).toBe(90);
    expect(MirrorPanel.pointToAngleDeg(50, 100, rect, false)).toBe(180);
    expect(MirrorPanel.pointToAngleDeg(0,  50,  rect, false)).toBe(270);
  });

  test('pointToAngleDeg with shift snaps to multiples of 15°', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    const out = MirrorPanel.pointToAngleDeg(75, 30, rect, true);
    expect(out % 15).toBe(0);
  });

  test('fillPct clamps degenerate ranges', () => {
    expect(MirrorPanel.fillPct(5, 0, 10)).toBe('50.00');
    expect(MirrorPanel.fillPct(0, 5, 5)).toBe('0');
  });
});

describe('MirrorPanel.build — DOM behavior (RGR for the v2 redesign)', () => {
  let runtime, MirrorPanel, Modifiers, document;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    MirrorPanel = runtime.window.Vectura.UI.MirrorPanel;
    Modifiers = runtime.window.Vectura.Modifiers;
    document = runtime.document;
  });

  afterEach(() => runtime?.cleanup());

  const mkLayer = (mirrors) => ({
    id: 'L1', name: 'Mirror Group', isGroup: true, containerRole: 'modifier',
    modifier: Modifiers.createModifierState('mirror', {
      mirrors: mirrors || [Modifiers.createMirrorLine(0)],
    }),
  });

  const mkCtx = () => {
    const calls = { pushHistory: 0, refresh: 0 };
    return {
      app: { pushHistory: () => { calls.pushHistory += 1; } },
      getModifierState: (l) => l.modifier,
      refreshModifierLayer: () => { calls.refresh += 1; },
      _calls: calls,
    };
  };

  test('renders mp-root + stack rows + add button + editor for the auto-seeded line mirror', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    expect(container.querySelector('.mp-root')).toBeTruthy();
    expect(container.querySelectorAll('.mp-row')).toHaveLength(1);
    expect(container.querySelector('.mp-stack-add')).toBeTruthy();
    expect(container.querySelector('.mp-editor')).toBeTruthy();
    expect(container.querySelector('.mp-editor-hdr.is-clickable')).toBeTruthy();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeFalsy();
    expect(container.querySelector('input[data-param="angle"]')).toBeTruthy();
    expect(container.querySelector('[data-set="replacedSide"][data-val="positive"]')).toBeTruthy();
    expect(container.querySelector('[data-set="replacedSide"][data-val="negative"]')).toBeTruthy();
  });

  test('auto-adds a Line mirror if the modifier has zero mirrors', () => {
    const layer = mkLayer([]);
    expect(layer.modifier.mirrors).toHaveLength(0);
    MirrorPanel.build(mkCtx(), layer, document.createElement('div'));
    expect(layer.modifier.mirrors).toHaveLength(1);
    expect(layer.modifier.mirrors[0].type).toBe('line');
  });

  test('clicking + Add mirror opens the 4-up picker with all four types', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('.mp-stack-add').click();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeTruthy();
    const cards = container.querySelectorAll('[data-pick]');
    expect(cards).toHaveLength(4);
    expect(Array.from(cards).map((c) => c.dataset.pick).sort())
      .toEqual(['arc', 'line', 'radial', 'wallpaper']);
  });

  test('picker → new adds a mirror of the chosen type to the stack', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    const ctx = mkCtx();
    MirrorPanel.build(ctx, layer, container);
    container.querySelector('.mp-stack-add').click();
    container.querySelector('[data-pick="radial"]').click();
    expect(layer.modifier.mirrors).toHaveLength(2);
    expect(layer.modifier.mirrors[1].type).toBe('radial');
    expect(ctx._calls.pushHistory).toBeGreaterThanOrEqual(1);
  });

  test('picker → new: clicking a type closes picker and shows editor even after panel rebuild', () => {
    // This test simulates the real-app behavior where refreshModifierLayer
    // triggers a full panel rebuild. The bug: pickerState was saved as 'new'
    // (not 'closed') inside commit(), so the rebuild re-showed the picker
    // instead of the editor. RGR: this test FAILS before the fix.
    const container = document.createElement('div');
    const layer = mkLayer();
    let ctx;
    ctx = {
      app: { pushHistory: () => {} },
      getModifierState: (l) => l.modifier,
      refreshModifierLayer: () => {
        container.innerHTML = '';
        MirrorPanel.build(ctx, layer, container);
      },
    };
    MirrorPanel.build(ctx, layer, container);
    container.querySelector('.mp-stack-add').click();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeTruthy();
    container.querySelector('[data-pick="radial"]').click();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeFalsy();
    expect(container.querySelector('.mp-editor-hdr.is-clickable')).toBeTruthy();
  });

  test('picker → replace: clicking a type closes picker and shows editor after panel rebuild', () => {
    // Same bug as above but for the replace path. RGR: FAILS before the fix.
    const container = document.createElement('div');
    const layer = mkLayer();
    let ctx;
    ctx = {
      app: { pushHistory: () => {} },
      getModifierState: (l) => l.modifier,
      refreshModifierLayer: () => {
        container.innerHTML = '';
        MirrorPanel.build(ctx, layer, container);
      },
    };
    MirrorPanel.build(ctx, layer, container);
    container.querySelector('[data-act="change-type"]').click();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeTruthy();
    container.querySelector('[data-pick="arc"]').click();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeFalsy();
    expect(container.querySelector('.mp-editor-hdr.is-clickable')).toBeTruthy();
  });

  test('Change type CTA reopens picker; replace swaps type + resets params', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-act="change-type"]').click();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeTruthy();
    container.querySelector('[data-pick="arc"]').click();
    const m = layer.modifier.mirrors[0];
    expect(m.type).toBe('arc');
    expect(m.radius).toBe(80);
    expect(m.replacedSide).toBe('outer');
    expect(m.angle).toBeUndefined();
  });

  test('eye toggle flips mirror.enabled and re-renders the row', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    const row = container.querySelector('.mp-row');
    row.querySelector('[data-act="toggle"]').click();
    expect(layer.modifier.mirrors[0].enabled).toBe(false);
    expect(container.querySelector('.mp-row.is-disabled')).toBeTruthy();
  });

  test('lock toggle flips mirror.locked', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-act="lock"]').click();
    expect(layer.modifier.mirrors[0].locked).toBe(true);
  });

  test('delete removes the mirror; empty stack re-seeds a Line mirror', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-act="delete"]').click();
    expect(layer.modifier.mirrors).toHaveLength(1);
    expect(layer.modifier.mirrors[0].type).toBe('line');
  });

  test('clicking a side tile mutates replacedSide and persists', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-set="replacedSide"][data-val="negative"]').click();
    expect(layer.modifier.mirrors[0].replacedSide).toBe('negative');
  });

  test('a radial mirror renders three mode tiles + wedge slider + dial', () => {
    const layer = mkLayer([Modifiers.createRadialMirror(0)]);
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    expect(container.querySelectorAll('[data-set="mode"]')).toHaveLength(3);
    expect(container.querySelector('input[data-param="count"]')).toBeTruthy();
    expect(container.querySelector('.mp-dial')).toBeTruthy();
  });

  test('a wallpaper mirror renders composable chip rows (lattice / rotation / mirrors)', () => {
    // 2026-05-21: flat 17-cell atlas → three composable chip rows. The math
    // surface (group → fundamental domain) is unchanged, but the UI now
    // surfaces the underlying (lattice, rotation, mirrors) tuple.
    const layer = mkLayer([Modifiers.createWallpaperMirror(0)]);
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    expect(container.querySelector('[data-symmetry-row="lattice"]')).toBeTruthy();
    expect(container.querySelector('[data-symmetry-row="rotation"]')).toBeTruthy();
    expect(container.querySelector('[data-symmetry-row="mirrors"]')).toBeTruthy();
    // p4m → lattice=square, rotation=4, mirrors=straight
    const activeLat = container.querySelector('[data-sym-axis="lattice"].is-active');
    const activeRot = container.querySelector('[data-sym-axis="rotation"].is-active');
    const activeMir = container.querySelector('[data-sym-axis="mirrors"].is-active');
    expect(activeLat.dataset.symVal).toBe('square');
    expect(activeRot.dataset.symVal).toBe('4');
    expect(activeMir.dataset.symVal).toBe('straight');
  });

  test('tileHeight + tileAngle sliders are disabled when active group locks them', () => {
    // p4m (square lattice) hardcodes H = W and tileAngle = 90 in the math,
    // so dragging those sliders is a no-op. The panel must reflect that
    // by disabling them and showing a "locked" hint.
    const layer = mkLayer([Modifiers.createWallpaperMirror(0)]);
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);

    const heightSlider = container.querySelector('input[type=range][data-param="tileHeight"]');
    const angleSlider  = container.querySelector('input[type=range][data-param="tileAngle"]');
    const widthSlider  = container.querySelector('input[type=range][data-param="tileWidth"]');
    expect(heightSlider.disabled).toBe(true);
    expect(angleSlider.disabled).toBe(true);
    expect(widthSlider.disabled).toBe(false);
    expect(heightSlider.closest('.mp-ctrl-grp').classList.contains('is-locked')).toBe(true);
    expect(angleSlider.closest('.mp-ctrl-grp').classList.contains('is-locked')).toBe(true);

    // Toggling lattice to oblique resolves to p1 (snapping rotation 4→nearest
    // legal rotation for oblique, which is 2), and both axes unlock.
    container.querySelector('[data-sym-axis="lattice"][data-sym-val="oblique"]').click();
    const h2 = container.querySelector('input[type=range][data-param="tileHeight"]');
    const a2 = container.querySelector('input[type=range][data-param="tileAngle"]');
    expect(h2.disabled).toBe(false);
    expect(a2.disabled).toBe(false);

    // Rhombic lattice → cm/cmm (height locked, angle free).
    container.querySelector('[data-sym-axis="lattice"][data-sym-val="rhombic"]').click();
    const h3 = container.querySelector('input[type=range][data-param="tileHeight"]');
    const a3 = container.querySelector('input[type=range][data-param="tileAngle"]');
    expect(h3.disabled).toBe(true);
    expect(a3.disabled).toBe(false);
  });

  test('toggling lattice to hexagonal resolves to a hex group + updates active chip', () => {
    const layer = mkLayer([Modifiers.createWallpaperMirror(0)]);
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-sym-axis="lattice"][data-sym-val="hexagonal"]').click();
    const sym = layer.modifier.mirrors[0].symmetry;
    expect(sym.lattice).toBe('hexagonal');
    expect(layer.modifier.mirrors[0].group).toMatch(/^(p3|p3m1|p31m|p6|p6m)$/);
    const activeLat = container.querySelector('[data-sym-axis="lattice"].is-active');
    expect(activeLat.dataset.symVal).toBe('hexagonal');
  });

  test('info trigger opens a popover; close button dismisses it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    const trigger = container.querySelector('[data-info-open="source-side"]');
    expect(trigger).toBeTruthy();
    trigger.click();
    expect(container.querySelector('.mp-info-popover.is-open')).toBeTruthy();
    expect(container.querySelector('.mp-info-backdrop.is-open')).toBeTruthy();
    container.querySelector('.mp-ip-close').click();
    expect(container.querySelector('.mp-info-popover.is-open')).toBeFalsy();
    expect(container.querySelector('.mp-info-backdrop.is-open')).toBeFalsy();
    document.body.removeChild(container);
  });

  test('sprite is injected exactly once across rebuilds', () => {
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, document.createElement('div'));
    MirrorPanel.build(mkCtx(), layer, document.createElement('div'));
    expect(document.querySelectorAll('#mp-sprite')).toHaveLength(1);
  });

  // === Senior-review follow-ups ===

  test('picker → replace preserves id, color, enabled, locked across type swap', () => {
    const layer = mkLayer();
    const original = layer.modifier.mirrors[0];
    original.color = '#abcdef';
    original.locked = false; // locked=true blocks the picker; test preservation with unlocked mirror
    original.enabled = true;
    const origId = original.id;
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-act="change-type"]').click();
    container.querySelector('[data-pick="wallpaper"]').click();
    const swapped = layer.modifier.mirrors[0];
    expect(swapped.type).toBe('wallpaper');
    expect(swapped.id).toBe(origId);
    expect(swapped.color).toBe('#abcdef');
    expect(swapped.locked).toBe(false);
    expect(swapped.enabled).toBe(true);
  });

  test('locked mirror greys out editor body and disables Change-type button', () => {
    const layer = mkLayer();
    layer.modifier.mirrors[0].locked = true;
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    const body = container.querySelector('.mp-editor-body');
    const cta  = container.querySelector('[data-act="change-type"]');
    expect(body.classList.contains('is-locked')).toBe(true);
    expect(cta.disabled).toBe(true);
  });

  test('every state-changing user action pushes history exactly once', () => {
    const container = document.createElement('div');
    const layer = mkLayer();
    const ctx = mkCtx();
    MirrorPanel.build(ctx, layer, container);
    const before = ctx._calls.pushHistory;
    // toggle eye
    container.querySelector('[data-act="toggle"]').click();
    expect(ctx._calls.pushHistory).toBe(before + 1);
    // lock
    container.querySelector('[data-act="lock"]').click();
    expect(ctx._calls.pushHistory).toBe(before + 2);
    // side tile
    container.querySelector('[data-set="replacedSide"][data-val="negative"]').click();
    expect(ctx._calls.pushHistory).toBe(before + 3);
  });

  test('ESC dismisses the picker (not just info popovers)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const layer = mkLayer();
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('.mp-stack-add').click();
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeTruthy();
    document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(container.querySelector('.mp-editor-hdr.is-picker')).toBeFalsy();
    expect(container.querySelector('.mp-editor-hdr.is-clickable')).toBeTruthy();
    document.body.removeChild(container);
  });

  test('path multiplier badge appears when stack inflation exceeds 16×', () => {
    const layer = mkLayer([
      Modifiers.createRadialMirror(0, { count: 8, mode: 'dihedral' }), // 16×
      Modifiers.createMirrorLine(1), // 32×
    ]);
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    const warn = container.querySelector('.mp-stack-warn');
    expect(warn).toBeTruthy();
    expect(warn.textContent).toMatch(/×\s*paths/);
  });

  test('no multiplier badge for a single line mirror (2×)', () => {
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), mkLayer(), container);
    expect(container.querySelector('.mp-stack-warn')).toBeFalsy();
  });

  test('drag-and-drop reorders the mirrors array', () => {
    const layer = mkLayer([
      Modifiers.createMirrorLine(0),
      Modifiers.createRadialMirror(1),
      Modifiers.createArcMirror(2),
    ]);
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    const rows = container.querySelectorAll('.mp-row');
    expect(rows).toHaveLength(3);
    const ids = Array.from(rows).map((r) => r.dataset.mirrorId);
    // Drag first row past the second's midpoint → it lands at index 1.
    const dt = {
      effectAllowed: '', dropEffect: '',
      _data: {},
      setData(k, v) { this._data[k] = v; },
      getData(k) { return this._data[k]; },
    };
    const dragstart = new runtime.window.Event('dragstart', { bubbles: true });
    dragstart.dataTransfer = dt;
    rows[0].dispatchEvent(dragstart);
    const drop = new runtime.window.Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = dt;
    drop.clientY = 9999; // bottom half of row[1] → "after"
    // Stub getBoundingClientRect so the panel can compute before/after
    rows[1].getBoundingClientRect = () => ({ top: 0, height: 40, left: 0, right: 100, bottom: 40, width: 100 });
    rows[1].dispatchEvent(drop);
    expect(layer.modifier.mirrors.map((m) => m.id)).toEqual([ids[1], ids[0], ids[2]]);
  });

  test('defaultParamsFor stays aligned with Modifiers.create* factory defaults', () => {
    // If a factory default drifts, the picker-new path will silently emit
    // a different param set than the helper. Pin them together.
    const lineF = Modifiers.createMirrorLine(0);
    const lineH = MirrorPanel.defaultParamsFor('line');
    for (const k of Object.keys(lineH)) expect(lineF[k]).toBe(lineH[k]);

    const radF = Modifiers.createRadialMirror(0);
    const radH = MirrorPanel.defaultParamsFor('radial');
    for (const k of Object.keys(radH)) expect(radF[k]).toBe(radH[k]);

    const arcF = Modifiers.createArcMirror(0);
    const arcH = MirrorPanel.defaultParamsFor('arc');
    for (const k of Object.keys(arcH)) expect(arcF[k]).toBe(arcH[k]);

    const wallF = Modifiers.createWallpaperMirror(0);
    const wallH = MirrorPanel.defaultParamsFor('wallpaper');
    for (const k of Object.keys(wallH)) expect(wallF[k]).toBe(wallH[k]);
  });

  test('panel state does not pollute the persisted modifier object', () => {
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    // Open picker, toggle row — none of these should write keys onto
    // layer.modifier or its mirror items.
    container.querySelector('.mp-stack-add').click();
    container.querySelector('[data-act="picker-cancel"]').click();
    const banned = ['_panelSelectedId', '_panelPickerOpen', '_panelPickerTarget'];
    for (const k of banned) {
      expect(Object.prototype.hasOwnProperty.call(layer.modifier, k)).toBe(false);
    }
  });

  test('tile buttons advertise aria-pressed for their active state', () => {
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), mkLayer(), container);
    const pos = container.querySelector('[data-set="replacedSide"][data-val="positive"]');
    const neg = container.querySelector('[data-set="replacedSide"][data-val="negative"]');
    expect(pos.getAttribute('aria-pressed')).toBe('true');
    expect(neg.getAttribute('aria-pressed')).toBe('false');
    neg.click();
    const pos2 = container.querySelector('[data-set="replacedSide"][data-val="positive"]');
    const neg2 = container.querySelector('[data-set="replacedSide"][data-val="negative"]');
    expect(pos2.getAttribute('aria-pressed')).toBe('false');
    expect(neg2.getAttribute('aria-pressed')).toBe('true');
  });

  test('dblclick on a slider resets the param to its type default and pushes history', () => {
    const layer = mkLayer([
      Object.assign(Modifiers.createMirrorLine(0), { angle: 45, xShift: 50 }),
    ]);
    const container = document.createElement('div');
    const ctx = mkCtx();
    MirrorPanel.build(ctx, layer, container);

    // angle slider: 45 → dblclick → 90 (line default)
    const angleSlider = container.querySelector('input[data-param="angle"]');
    expect(+angleSlider.value).toBe(45);
    const before = ctx._calls.pushHistory;
    angleSlider.dispatchEvent(new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(layer.modifier.mirrors[0].angle).toBe(90);
    expect(ctx._calls.pushHistory).toBe(before + 1);

    // xShift slider: 50 → dblclick → 0 (line default)
    const xShiftSlider = container.querySelector('input[data-param="xShift"]');
    expect(+xShiftSlider.value).toBe(50);
    xShiftSlider.dispatchEvent(new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(layer.modifier.mirrors[0].xShift).toBe(0);
    expect(ctx._calls.pushHistory).toBe(before + 2);
  });

  test('dblclick on sliders resets radial + arc + wallpaper params to their defaults', () => {
    // radial: count 12 → 6
    const radLayer = mkLayer([Object.assign(Modifiers.createRadialMirror(0), { count: 12, centerX: 100 })]);
    const rc = document.createElement('div');
    MirrorPanel.build(mkCtx(), radLayer, rc);
    rc.querySelector('input[data-param="count"]').dispatchEvent(
      new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })
    );
    expect(radLayer.modifier.mirrors[0].count).toBe(6);
    rc.querySelector('input[data-param="centerX"]').dispatchEvent(
      new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })
    );
    expect(radLayer.modifier.mirrors[0].centerX).toBe(0);

    // arc: radius 200 → 80
    const arcLayer = mkLayer([Object.assign(Modifiers.createArcMirror(0), { radius: 200 })]);
    const ac = document.createElement('div');
    MirrorPanel.build(mkCtx(), arcLayer, ac);
    ac.querySelector('input[data-param="radius"]').dispatchEvent(
      new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })
    );
    expect(arcLayer.modifier.mirrors[0].radius).toBe(80);

    // wallpaper: tileWidth 200 → 60
    const wallLayer = mkLayer([Object.assign(Modifiers.createWallpaperMirror(0), { tileWidth: 200, rotation: 45 })]);
    const wc = document.createElement('div');
    MirrorPanel.build(mkCtx(), wallLayer, wc);
    wc.querySelector('input[data-param="tileWidth"]').dispatchEvent(
      new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })
    );
    expect(wallLayer.modifier.mirrors[0].tileWidth).toBe(60);
    wc.querySelector('input[data-param="rotation"]').dispatchEvent(
      new runtime.window.MouseEvent('dblclick', { bubbles: true, cancelable: true })
    );
    expect(wallLayer.modifier.mirrors[0].rotation).toBe(0);
  });

  test('the legacy fallback was deleted from algo-config-panel.js', () => {
    // Compile-gate against the dead-code fallback the senior flagged.
    // If anyone re-introduces a buildMirrorModifierControls reference outside
    // mirror-panel.js's docstring, this test fails — keeping the codebase
    // honest about the single-source-of-truth for the mirror UI.
    const fs = require('fs');
    const path = require('path');
    const algo = fs.readFileSync(path.join(__dirname, '..', '..', 'src/ui/panels/algo-config-panel.js'), 'utf8');
    // Meridian Unit 1.10 (2026-05-20): `_ui-legacy.js` was merged into
    // `src/ui/ui.js`; scan the consolidated entry instead.
    const orchestrator = fs.readFileSync(path.join(__dirname, '..', '..', 'src/ui/ui.js'), 'utf8');
    expect(algo.includes('buildMirrorModifierControls')).toBe(false);
    expect(orchestrator.includes('buildMirrorModifierControls')).toBe(false);
  });
});

// 2026-05-21: composable wallpaper-symmetry chip rows. Each test here would
// fail against the pre-2026-05-21 flat 17-cell atlas (no chip rows, no
// symmetry tuple, no legacy backfill path, no keyboard cycling).
describe('MirrorPanel — wallpaper composable symmetry', () => {
  let runtime, MirrorPanel, Modifiers, WG, document, SETTINGS;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    MirrorPanel = runtime.window.Vectura.UI.MirrorPanel;
    Modifiers = runtime.window.Vectura.Modifiers;
    WG = runtime.window.Vectura.WallpaperGroups;
    SETTINGS = runtime.window.Vectura.SETTINGS;
    document = runtime.document;
  });

  afterEach(() => runtime?.cleanup());

  const mkLayer = (mirrors) => ({
    id: 'L1', name: 'Mirror Group', isGroup: true, containerRole: 'modifier',
    modifier: Modifiers.createModifierState('mirror', {
      mirrors: mirrors || [Modifiers.createWallpaperMirror(0)],
    }),
  });

  const mkCtx = () => ({
    app: { pushHistory: () => {} },
    getModifierState: (l) => l.modifier,
    refreshModifierLayer: () => {},
  });

  test('createWallpaperMirror dual-writes group + symmetry tuple', () => {
    const w = Modifiers.createWallpaperMirror(0);
    expect(w.group).toBe('p4m');
    expect(w.symmetry).toEqual({ lattice: 'square', rotation: 4, mirrors: 'straight' });
  });

  test('toggling lattice from square→hexagonal snaps rotation 4→nearest hex rotation and dual-writes', () => {
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-sym-axis="lattice"][data-sym-val="hexagonal"]').click();
    const m = layer.modifier.mirrors[0];
    expect(m.symmetry.lattice).toBe('hexagonal');
    // 4 is closer to 3 than 6 → snap to 3, mirrors=straight is not valid for
    // hex rot 3 ({none, corners, edges}) → escalate to first non-'none'
    // option → corners → p3m1.
    expect(m.symmetry.rotation).toBe(3);
    expect(m.symmetry.mirrors).toBe('corners');
    expect(m.group).toBe('p3m1');
  });

  test('toggling mirrors none→straight on square rot 4 produces p4m', () => {
    const layer = mkLayer();
    const m0 = layer.modifier.mirrors[0];
    m0.group = 'p4';
    m0.symmetry = { ...WG.FEATURES.p4 };
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-sym-axis="mirrors"][data-sym-val="straight"]').click();
    expect(layer.modifier.mirrors[0].group).toBe('p4m');
  });

  test('rotation 3→6 in hex with mirrors=corners snaps to p6m (escalate-not-relax)', () => {
    const layer = mkLayer();
    const m0 = layer.modifier.mirrors[0];
    m0.group = 'p3m1';
    m0.symmetry = { ...WG.FEATURES.p3m1 };
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    container.querySelector('[data-sym-axis="rotation"][data-sym-val="6"]').click();
    expect(layer.modifier.mirrors[0].group).toBe('p6m');
  });

  test('a legacy mirror with only `group` (no `symmetry`) renders chip rows in correct active states', () => {
    // Simulate loading a pre-2026-05-21 .vectura file: only `group` is set,
    // the chip-row active state must be derived from FEATURES[group].
    const layer = mkLayer();
    const m0 = layer.modifier.mirrors[0];
    m0.group = 'pmg';
    delete m0.symmetry;
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    const lat = container.querySelector('[data-sym-axis="lattice"].is-active');
    const rot = container.querySelector('[data-sym-axis="rotation"].is-active');
    const mir = container.querySelector('[data-sym-axis="mirrors"].is-active');
    expect(lat.dataset.symVal).toBe('rectangular');
    expect(rot.dataset.symVal).toBe('2');
    expect(mir.dataset.symVal).toBe('straight+glide');
  });

  test('rotation chips that do not apply to the current lattice are disabled', () => {
    // Square lattice only allows rotation 4 — the {1,2,3,6} chips must be
    // disabled (clicks no-op).
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    [1, 2, 3, 6].forEach((rot) => {
      const chip = container.querySelector(`[data-sym-axis="rotation"][data-sym-val="${rot}"]`);
      expect(chip).toBeTruthy();
      expect(chip.disabled).toBe(true);
    });
    const chip4 = container.querySelector('[data-sym-axis="rotation"][data-sym-val="4"]');
    expect(chip4.disabled).toBe(false);
  });

  test('mirror.group + mirror.symmetry roundtrip through JSON.parse(JSON.stringify(...))', () => {
    // The engine clones the entire modifier via JSON during import/export at
    // engine.js:304/362/458. Make sure the new field survives without any
    // engine-side change.
    const w = Modifiers.createWallpaperMirror(0);
    const round = JSON.parse(JSON.stringify(w));
    expect(round.group).toBe('p4m');
    expect(round.symmetry).toEqual({ lattice: 'square', rotation: 4, mirrors: 'straight' });
  });

  test('⌘→ cycles through every group in the current family, then wraps', () => {
    const layer = mkLayer();
    const container = document.createElement('div');
    document.body.appendChild(container);
    MirrorPanel.build(mkCtx(), layer, container);
    const family = ['p4', 'p4m', 'p4g'];
    const visited = [layer.modifier.mirrors[0].group];
    for (let i = 0; i < family.length; i++) {
      document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', {
        key: 'ArrowRight', metaKey: true, bubbles: true,
      }));
      visited.push(layer.modifier.mirrors[0].group);
    }
    // After 3 steps from p4m, we should have wrapped back: p4m → p4g → p4 → p4m
    expect(visited).toEqual(['p4m', 'p4g', 'p4', 'p4m']);
    document.body.removeChild(container);
  });

  test('⌘← cycles backward through the family', () => {
    const layer = mkLayer();
    const container = document.createElement('div');
    document.body.appendChild(container);
    MirrorPanel.build(mkCtx(), layer, container);
    document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', {
      key: 'ArrowLeft', metaKey: true, bubbles: true,
    }));
    // p4m → cycle backward → p4 (forward order is p4, p4m, p4g)
    expect(layer.modifier.mirrors[0].group).toBe('p4');
    document.body.removeChild(container);
  });

  test('SETTINGS.showCrystallographicNames=false hides the wall-name badge; true reveals it', () => {
    SETTINGS.showCrystallographicNames = false;
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container);
    expect(container.querySelector('[data-testid="wall-name-badge"]')).toBeNull();

    SETTINGS.showCrystallographicNames = true;
    const container2 = document.createElement('div');
    MirrorPanel.build(mkCtx(), layer, container2);
    const badge = container2.querySelector('[data-testid="wall-name-badge"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('p4m');
    SETTINGS.showCrystallographicNames = false; // restore
  });

  test('nameFor respects SETTINGS.showCrystallographicNames', () => {
    SETTINGS.showCrystallographicNames = true;
    expect(MirrorPanel.nameFor({ type: 'wallpaper', group: 'p3' })).toBe('Wallpaper · p3');
    SETTINGS.showCrystallographicNames = false;
    expect(MirrorPanel.nameFor({ type: 'wallpaper', group: 'p3' }))
      .toBe('Wallpaper · hexagonal · 3-fold · no mirror');
  });
});
