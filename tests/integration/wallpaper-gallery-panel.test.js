/*
 * Wallpaper gallery / Build mode integration coverage (Team Beta).
 *
 * Exercises the gallery-first wallpaper editor added 2026-05-21:
 *   - Styles ↔ Build mode toggle, persisted in window.Vectura.SETTINGS
 *   - clicking a Style card dual-writes mirror.group + mirror.symmetry + history
 *   - clicking a named recipe card applies the WallpaperPresets seam config
 *   - "Surprise me" dice (WallpaperPresets.randomize) produces a valid group,
 *     pushes history (undoable), and Shift locks the lattice family
 *   - advanced chip clicks still resolve through nearestValidGroup AND surface
 *     snapping feedback (flashed chips + a transient plain-language line)
 *
 * Each block fails against the pre-gallery panel (no mode toggle, no
 * .mp-wallgrid cards, no dice, no .mp-snap-line) — that is the red→green proof.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Wallpaper gallery panel integration', () => {
  let runtime, MirrorPanel, Modifiers, WG, SETTINGS, document;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    MirrorPanel = runtime.window.Vectura.UI.MirrorPanel;
    Modifiers = runtime.window.Vectura.Modifiers;
    WG = runtime.window.Vectura.WallpaperGroups;
    SETTINGS = runtime.window.Vectura.SETTINGS;
    document = runtime.document;
    // Make randomize deterministic-ish so assertions are stable.
    runtime.window.Math.__origRandom = Math.random;
  });

  afterEach(() => {
    if (runtime?.window?.Math?.__origRandom) Math.random = runtime.window.Math.__origRandom;
    runtime?.cleanup();
  });

  const mkLayer = (mirror) => ({
    id: 'L1', name: 'Mirror Group', isGroup: true, containerRole: 'modifier',
    modifier: Modifiers.createModifierState('mirror', {
      mirrors: [mirror || Modifiers.createWallpaperMirror(0)],
    }),
  });

  // ctx that rebuilds the panel on refresh (mirrors real-app behavior) and
  // records pushHistory calls so we can assert undoability.
  const mkCtx = (container, layer) => {
    const calls = { pushHistory: 0 };
    let ctx;
    ctx = {
      app: {
        engine: { getLayerDescendants: () => [] },
        pushHistory: () => { calls.pushHistory += 1; },
      },
      getModifierState: (l) => l.modifier,
      refreshModifierLayer: () => {
        container.innerHTML = '';
        MirrorPanel.build(ctx, layer, container);
      },
      _calls: calls,
    };
    return ctx;
  };

  test('wallpaper editor defaults to Styles mode and renders a gallery of cards + a dice button', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(container, layer), layer, container);

    expect(container.querySelector('[data-wall-mode="styles"].is-active')).toBeTruthy();
    expect(container.querySelector('[data-wall-mode="build"]')).toBeTruthy();
    // 17 bare-group cards present (friendly labels, never raw pXX in the name).
    const groupCards = container.querySelectorAll('[data-style-group]');
    expect(groupCards.length).toBe(17);
    // Recipe cards from the WallpaperPresets seam.
    expect(container.querySelectorAll('[data-style-preset]').length).toBeGreaterThan(0);
    // Dice button.
    expect(container.querySelector('[data-act="surprise"]')).toBeTruthy();
    // No advanced chip rows in Styles mode.
    expect(container.querySelector('[data-symmetry-row="lattice"]')).toBeNull();
  });

  test('mode toggle persists the choice in SETTINGS and swaps to Build (chip rows appear)', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(container, layer), layer, container);

    container.querySelector('[data-wall-mode="build"]').click();
    expect(SETTINGS.wallpaperPanelMode).toBe('build');
    expect(container.querySelector('[data-symmetry-row="lattice"]')).toBeTruthy();
    expect(container.querySelector('[data-wall-mode="build"].is-active')).toBeTruthy();

    container.querySelector('[data-wall-mode="styles"].mp-wallmode-btn,[data-wall-mode="styles"]').click();
    expect(SETTINGS.wallpaperPanelMode).toBe('styles');
    expect(container.querySelector('[data-symmetry-row="lattice"]')).toBeNull();
  });

  test('clicking a Style card dual-writes mirror.group + mirror.symmetry and pushes history', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    const layer = mkLayer(); // starts p4m
    const container = document.createElement('div');
    const ctx = mkCtx(container, layer);
    MirrorPanel.build(ctx, layer, container);

    const card = container.querySelector('[data-style-group="p6m"]');
    expect(card).toBeTruthy();
    card.click();

    const m = layer.modifier.mirrors[0];
    expect(m.group).toBe('p6m');
    expect(m.symmetry).toEqual(WG.FEATURES.p6m);
    expect(ctx._calls.pushHistory).toBeGreaterThanOrEqual(1);
  });

  test('clicking a named recipe card applies the WallpaperPresets seam config (group + symmetry)', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    const presets = runtime.window.Vectura.WallpaperPresets.list();
    expect(presets.length).toBeGreaterThan(0);
    const first = presets[0];

    const layer = mkLayer();
    const container = document.createElement('div');
    const ctx = mkCtx(container, layer);
    MirrorPanel.build(ctx, layer, container);

    container.querySelector('[data-style-preset="0"]').click();
    const m = layer.modifier.mirrors[0];
    expect(m.group).toBe(first.mirror.group);
    expect(m.symmetry).toEqual(first.mirror.symmetry);
    expect(ctx._calls.pushHistory).toBeGreaterThanOrEqual(1);
  });

  test('Surprise me produces a valid crystallographic group, pushes history (undoable), and Shift locks the lattice', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    const layer = mkLayer(); // square lattice (p4m)
    const startLattice = layer.modifier.mirrors[0].symmetry.lattice;
    const container = document.createElement('div');
    const ctx = mkCtx(container, layer);
    MirrorPanel.build(ctx, layer, container);

    // Shift-click: lattice family must be preserved (axis lock).
    const dice = container.querySelector('[data-act="surprise"]');
    dice.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true, shiftKey: true }));

    const m = layer.modifier.mirrors[0];
    // Always a valid group: present in FEATURES.
    expect(WG.FEATURES[m.group]).toBeTruthy();
    expect(m.symmetry.lattice).toBe(startLattice); // lattice locked by Shift
    expect(ctx._calls.pushHistory).toBeGreaterThanOrEqual(1); // undoable
  });

  test('Build-mode chip click resolves through nearestValidGroup and fires snapping feedback when other axes change', async () => {
    SETTINGS.wallpaperPanelMode = 'build';
    const layer = mkLayer(); // p4m: square / 4-fold / straight
    const container = document.createElement('div');
    const ctx = mkCtx(container, layer);
    MirrorPanel.build(ctx, layer, container);

    // Switch lattice → hexagonal. Rotation 4 is invalid for hex, so the
    // resolver snaps rotation (and possibly mirrors) — feedback must fire.
    container.querySelector('[data-sym-axis="lattice"][data-sym-val="hexagonal"]').click();

    const m = layer.modifier.mirrors[0];
    expect(m.symmetry.lattice).toBe('hexagonal');
    expect(WG.FEATURES[m.group]).toBeTruthy();

    // A flashed chip + a visible, populated snap line.
    const flashed = container.querySelector('.mp-chip.mp-snap-flash');
    expect(flashed).toBeTruthy();
    const line = container.querySelector('[data-testid="wall-snap-line"]');
    expect(line).toBeTruthy();
    expect(line.hidden).toBe(false);
    expect(line.textContent).toMatch(/Adjusted/);
  });

  test('the friendly name badge is always present in Build mode so a snap shows where you landed', () => {
    SETTINGS.wallpaperPanelMode = 'build';
    SETTINGS.showCrystallographicNames = false;
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(container, layer), layer, container);
    const badge = container.querySelector('[data-testid="wall-name-badge"]');
    expect(badge).toBeTruthy();
    // Friendly text, not the raw pXX id (id only appears when the pref is on).
    expect(badge.textContent).not.toMatch(/p4m/);
  });

  test('locked sliders show a touch-safe actionable note (not a hover-only pXX title)', () => {
    SETTINGS.wallpaperPanelMode = 'build';
    const layer = mkLayer(); // p4m locks tileHeight + tileAngle
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(container, layer), layer, container);
    const notes = container.querySelectorAll('[data-testid="wall-lock-note"]');
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0].textContent).toMatch(/symmetry/i);
  });

  // ── Gallery icon + label + a11y regressions (audit 2026-05-21) ───────────

  test('group cards use crisp short labels, not the full description sentence', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(container, layer), layer, container);
    // p4g was the worst offender: its label used to be the whole sentence
    // "Quarter-turn rotations plus glide mirrors instead of straight ones".
    const card = container.querySelector('[data-style-group="p4g"]');
    const name = card.querySelector('.mp-stylecard-name').textContent.trim();
    expect(name).toBe('Square Glide');
    expect(name.split(/\s+/).length).toBeLessThanOrEqual(3);
    // The full description survives as the tooltip + accessible name.
    expect(card.getAttribute('title')).toMatch(/glide/i);
    expect(card.getAttribute('aria-label')).toContain('Square Glide');
  });

  test('style cards expose aria-pressed state and the thumb is decorative (aria-hidden)', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    const layer = mkLayer(); // active group p4m
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(container, layer), layer, container);
    const active = container.querySelector('[data-style-group="p4m"]');
    expect(active.getAttribute('aria-pressed')).toBe('true');
    const inactive = container.querySelector('[data-style-group="p6"]');
    expect(inactive.getAttribute('aria-pressed')).toBe('false');
    expect(active.querySelector('[data-style-thumb]').getAttribute('aria-hidden')).toBe('true');
  });

  test('gallery icons are CANONICAL — never fed the layer\'s live geometry (no drift on click)', () => {
    SETTINGS.wallpaperPanelMode = 'styles';
    // A ctx whose layer HAS descendant geometry. The icons must still ignore it:
    // feeding live effectivePaths is what made every card repaint on each click.
    const layer = mkLayer();
    const container = document.createElement('div');
    const ctx = mkCtx(container, layer);
    ctx.app.engine.getLayerDescendants = () => ([
      { id: 'c1', isGroup: false, effectivePaths: [[{ x: 0, y: 0 }, { x: 9, y: 4 }, { x: 3, y: 9 }]] },
    ]);
    const Preview = runtime.window.Vectura.WallpaperPreview;
    const calls = [];
    const orig = Preview.render;
    Preview.render = (el, opts) => { calls.push(opts); };
    try {
      MirrorPanel.build(ctx, layer, container);
    } finally {
      Preview.render = orig;
    }
    expect(calls.length).toBeGreaterThan(0);
    for (const opts of calls) {
      expect(opts.sourcePaths == null || opts.sourcePaths.length === 0).toBe(true);
    }
  });

  test('Build tile-angle range admits every recipe value (no silent clamp of 50–55° recipes)', () => {
    SETTINGS.wallpaperPanelMode = 'build';
    const layer = mkLayer();
    const container = document.createElement('div');
    MirrorPanel.build(mkCtx(container, layer), layer, container);
    const slider = container.querySelector('input[data-param="tileAngle"]');
    const min = Number(slider.getAttribute('min'));
    const max = Number(slider.getAttribute('max'));
    const recipeAngles = runtime.window.Vectura.WallpaperPresets.list()
      .map((p) => p.mirror.tileAngle)
      .filter((a) => a !== undefined);
    for (const a of recipeAngles) {
      expect(a).toBeGreaterThanOrEqual(min); // pre-fix min was 60 → Harlequin(55)/Diamond Trellis(50) failed
      expect(a).toBeLessThanOrEqual(max);
    }
  });
});
