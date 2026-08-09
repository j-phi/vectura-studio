const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Shadow copy must describe what the controls ACTUALLY do.
 *
 * 1. FALLOFF → SOFTNESS. `shadowFalloff` began life as "density drop per layer"
 *    and was repurposed to drive PENUMBRA SOFTNESS (it sets how far the dark
 *    umbra core extends down the throw). The stored param key is unchanged —
 *    this is a label-only contract — but every UI string that still says
 *    "Falloff" is now actively misleading and must read "Softness".
 *
 * 2. ANGLE IS A FILL ANGLE, NOT A SUN BEARING. Jay: "changing the angle of the
 *    shadow should not move the shadow, but should instead move the angle of
 *    the line(s)/fill(s) in the shadow." The behaviour was fixed in RC1, but
 *    `src/config/context-bar.js` kept the pre-RC1 strings
 *    (aria 'Shadow angle (sun bearing, scene-wide)', note 'Scene-wide (sun)').
 *    The ctxbar worked around them with local literals; the CONFIG is the
 *    single source of truth and must not need overriding.
 *
 * Both surfaces — the ctxbar Shadow flyout and the panel Shadow section — are
 * asserted, because copy drift between them is exactly how this rotted.
 */

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('Shadow copy: "Softness" (not "Falloff"), and Angle is a fill angle (not the sun)', () => {
  let runtime; let window; let document; let app; let engine;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    engine = app.engine;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const controlsHost = () => document.getElementById('dynamic-controls');

  const buildTree = () => {
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    const grp = engine.getLayerById(gid);
    const box = engine.getLayerChildren(gid).find((c) => c.type === 'object3d');
    box.params.transform = { ...(box.params.transform || {}), y: 60 };
    engine.activeLayerId = gid;
    engine.computeAllDisplayGeometry();
    return { gid, grp, box };
  };

  // ── panel-surface helpers (same shape as scene-shadow-config-reachable) ──
  const sectionByTitle = (title) => Array.from(controlsHost().querySelectorAll('.sect'))
    .find((s) => (s.querySelector('.sect-hdr-title') || {}).textContent === title) || null;
  const shadowHost = () => {
    const sect = sectionByTitle('Shadow');
    return sect ? sect.querySelector('.vs3-shadow') : null;
  };
  const rowLabels = (scope) => Array.from(scope.querySelectorAll('.vs3-row'))
    .map((r) => (r.querySelector('.vs3-lbl') || {}).textContent);
  const rowCtl = (scope, label) => {
    const row = Array.from(scope.querySelectorAll('.vs3-row'))
      .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label);
    return row ? row.querySelector('.vs3-ctl') : null;
  };
  // Every aria-label under a subtree, so a renamed row can't leave the old word
  // hiding in the accessible name.
  const ariaTextOf = (scope) => Array.from(scope.querySelectorAll('[aria-label]'))
    .map((el) => el.getAttribute('aria-label')).join(' | ');

  // ── ctxbar helpers ───────────────────────────────────────────────────────
  const openShadowFlyout = (gid, objId) => {
    const CB = window.Vectura.UI.ContextBar;
    app.renderer.setSelection([gid], gid);
    app.renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [objId], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    const pill = Array.from(CB.getContentHost().querySelectorAll('.ctxbar-scene-field'))
      .find((f) => (f.querySelector('.ctxbar-text-fieldlabel') || {}).textContent === 'Shadow');
    expect(pill).toBeTruthy();
    pill.click();
    const fly = document.querySelector('.ctxbar-scene-flyout.is-open');
    expect(fly).toBeTruthy();
    return fly;
  };
  const flyLabels = (fly) => Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
    .map((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent);

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Falloff → Softness on the panel Shadow section.
  // ═════════════════════════════════════════════════════════════════════════

  test('panel: the layered-shadow slider is labelled "Softness", never "Falloff"', () => {
    const { grp } = buildTree();
    // The slider only mounts when Layers is on — turn it on the way the panel
    // does, then rebuild so the row is present.
    grp.params.shadow = { ...(grp.params.shadow || {}), shadowLayers: true };
    app.ui.buildControls();
    const host = shadowHost();
    expect(host).toBeTruthy();

    const labels = rowLabels(host);
    expect(labels).toContain('Softness');
    expect(labels).not.toContain('Falloff');
    expect(rowCtl(host, 'Softness')).toBeTruthy();
    expect(rowCtl(host, 'Falloff')).toBeFalsy();
  });

  test('panel: no shadow control text or aria still says "falloff"', () => {
    const { grp } = buildTree();
    grp.params.shadow = { ...(grp.params.shadow || {}), shadowLayers: true };
    app.ui.buildControls();
    const host = shadowHost();
    expect(host.textContent).not.toMatch(/falloff/i);
    expect(ariaTextOf(host)).not.toMatch(/falloff/i);
    expect(ariaTextOf(host)).toMatch(/softness/i);
  });

  test('panel: the renamed slider still writes the UNCHANGED shadowFalloff key', () => {
    const { grp } = buildTree();
    grp.params.shadow = { ...(grp.params.shadow || {}), shadowLayers: true };
    app.ui.buildControls();
    const input = rowCtl(shadowHost(), 'Softness').querySelector('input[type="range"], input');
    expect(input).toBeTruthy();
    input.value = '0.8';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Label-only change: the stored key and its clamp are untouched.
    expect(grp.params.shadow.shadowFalloff).toBeCloseTo(0.8, 5);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. The ctxbar Shadow flyout carries no stale "Falloff" copy either.
  // ═════════════════════════════════════════════════════════════════════════

  test('ctxbar: the Shadow flyout shows no "Falloff" row, text or aria', () => {
    const { gid, grp, box } = buildTree();
    grp.params.shadow = { ...(grp.params.shadow || {}), shadowLayers: true, shadowLayerCount: 3 };
    const fly = openShadowFlyout(gid, box.id);
    expect(flyLabels(fly)).not.toContain('Falloff');
    expect(fly.textContent).not.toMatch(/falloff/i);
    expect(ariaTextOf(fly)).not.toMatch(/falloff/i);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Angle copy describes the FILL, not the sun — in the CONFIG itself.
  // ═════════════════════════════════════════════════════════════════════════

  test('config: shadow.angle strings describe a fill angle, not a sun bearing', () => {
    const cfg = window.Vectura.CONTEXT_BAR;
    const angle = cfg.sceneFlyouts.shadow.angle;
    expect(angle.label).toBe('Angle');
    // Pre-RC1 copy: 'Shadow angle (sun bearing, scene-wide)' / 'Scene-wide (sun)'.
    expect(angle.aria).not.toMatch(/\bsun\b/i);
    expect(angle.aria).toMatch(/fill/i);
    expect(angle.note).not.toMatch(/\bsun\b/i);
    expect(angle.note).toMatch(/fill/i);
  });

  test('config: no shadow flyout string anywhere still sells Angle as the sun', () => {
    const cfg = window.Vectura.CONTEXT_BAR;
    expect(JSON.stringify(cfg.sceneFlyouts.shadow)).not.toMatch(/\bsun\b/i);
    expect(JSON.stringify(cfg.sceneFlyouts.shadow)).not.toMatch(/falloff/i);
  });

  test('ctxbar: the rendered Angle row uses the config strings and never says "sun"', () => {
    const { gid, box } = buildTree();
    const fly = openShadowFlyout(gid, box.id);
    const cfg = window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow;
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === 'Angle');
    expect(row).toBeTruthy();
    // flyRow appends the note as a SIBLING of the row, on the flyout itself.
    const notes = Array.from(fly.querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes).toContain(cfg.angle.note);
    // Nothing in the whole flyout — copy or accessible name — still says "sun".
    expect(fly.textContent).not.toMatch(/\bsun\b/i);
    expect(ariaTextOf(fly)).not.toMatch(/\bsun\b/i);
    // The dial's accessible name is the CONFIG string, not a local literal.
    // (AngleDial suffixes its numeric input's accessible name with "(degrees)".)
    const arias = Array.from(fly.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label'));
    expect(arias.some((a) => a.startsWith(cfg.angle.aria))).toBe(true);
    expect(arias).toContain(cfg.follow.aria);
  });
});
