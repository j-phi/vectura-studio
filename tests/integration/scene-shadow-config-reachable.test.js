const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Shadow configuration must be REACHABLE and must mean what it says (RC1).
 *
 * Two independent defects, both live before this file:
 *
 * RC1 — the panel's shadow block was DEAD CODE on a scene TREE. It rendered
 *   only from inside the light inspector, which is reached by clicking a light
 *   ROW in the panel's in-panel tree. Those rows come from `params.lights`, and
 *   expandMonolithToTree / addSceneTree deliberately EMPTY that array (the real
 *   lights are `sceneLight3d` CHILD layers; collectSceneParams re-unions them at
 *   compose time, and emptying the inline array is what stops the compositor
 *   double-counting inline lights against child lights). Zero light rows ⇒
 *   renderShadowControls was never called ⇒ shadow line style / pen / density /
 *   angle were unreachable from the panel on every tree scene.
 *
 * SEMANTICS — the ctxbar Shadow flyout's "Angle" dial drove `lights.0.azimuth`,
 *   i.e. it MOVED the shadow by aiming the sun, instead of restyling the ink
 *   inside it. (On a tree it did not even do that: `params.lights` is empty, so
 *   the dial showed the 135° fallback and its writes landed on a phantom entry.)
 *   Angle now binds to the scene-wide `shadow.shadowAngle` bag — the hatch
 *   bearing shadows.js reads — on BOTH surfaces.
 *
 * MEASUREMENT — composed scene ink lives on `group.scenePaths`, never
 * `layer.paths` (a per-layer generate() bypasses _sceneConsumed and would render
 * an object3d standalone off ALGO_DEFAULTS). Every geometry assertion here runs
 * computeAllDisplayGeometry() and reads group.scenePaths, filtered to the
 * cast-shadow region (meta.sceneTarget.regionClass === 'castShadow').
 *
 * The legacy inline MONOLITH is the regression pin: it is the path that worked
 * before, and its lights/ground/objects stay inline throughout.
 */

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 60) => new Promise((r) => setTimeout(r, ms));

// ── composed-geometry helpers ───────────────────────────────────────────────
const shadowInk = (group) => (group.scenePaths || []).filter((p) => {
  const t = p && p.meta && p.meta.sceneTarget;
  return t && t.regionClass === 'castShadow';
});

const ptsOf = (p) => (Array.isArray(p.points) ? p.points : p);

const bboxOf = (paths) => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  paths.forEach((p) => ptsOf(p).forEach((pt) => {
    minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
  }));
  return { minX, minY, maxX, maxY };
};

// Length-weighted mean segment bearing, folded to [0,180) via the double-angle
// trick so a line and its reverse count as the same orientation.
const meanBearing = (paths) => {
  let sx = 0; let sy = 0;
  paths.forEach((p) => {
    const pts = ptsOf(p);
    for (let i = 1; i < pts.length; i += 1) {
      const dx = pts[i].x - pts[i - 1].x; const dy = pts[i].y - pts[i - 1].y;
      const len = Math.hypot(dx, dy);
      if (!(len > 1e-9)) continue;
      const th = 2 * Math.atan2(dy, dx);
      sx += len * Math.cos(th); sy += len * Math.sin(th);
    }
  });
  return ((Math.atan2(sy, sx) / 2) * 180 / Math.PI + 180) % 180;
};

const angleDelta = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
const bboxDrift = (a, b) => Math.max(
  Math.abs(a.minX - b.minX), Math.abs(a.maxX - b.maxX),
  Math.abs(a.minY - b.minY), Math.abs(a.maxY - b.maxY),
);

describe('Shadow configuration is reachable and means "restyle", not "move" (RC1)', () => {
  let runtime; let window; let document; let app; let engine;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    engine = app.engine;
    app.maxHistory = 100000;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const controlsHost = () => document.getElementById('dynamic-controls');

  // The scene a USER builds: Add Layer → 3D Scene → addSceneTree(). A scene
  // GROUP (type 'scene3d', isGroup, containerRole 'scene') with object3d /
  // sceneLight3d / sceneGround3d CHILDREN and an EMPTY inline lights array.
  const buildTree = () => {
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    const grp = engine.getLayerById(gid);
    const box = engine.getLayerChildren(gid).find((c) => c.type === 'object3d');
    // Lift the caster off the ground so it throws a shadow worth measuring.
    box.params.transform = { ...(box.params.transform || {}), y: 60 };
    engine.activeLayerId = gid;
    engine.computeAllDisplayGeometry();
    return { gid, grp, box };
  };

  // The legacy inline monolith — the regression pin. Objects, lights and ground
  // all stay on params; there are no child layers at all.
  const buildMonolith = () => {
    engine.layers = [];
    const { Layer } = window.Vectura;
    const layer = new Layer('mono-scene', 'scene3d', 'Scene');
    layer.params = {
      ...layer.params,
      sceneVersion: 1,
      seed: 0,
      objects: [{
        id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 60, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      }],
      lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true }],
      ground: { enabled: true },
      backdrop: { enabled: false },
      groups: [],
      assets: {},
      styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
    };
    engine.layers.push(layer);
    engine.activeLayerId = layer.id;
    engine.generate(layer.id);
    engine.computeAllDisplayGeometry();
    return layer;
  };

  // A monolith emits its ink on layer.paths (it is a leaf), a group on
  // scenePaths. One accessor so the pin and the tree share every assertion.
  const inkOf = (l) => (l.isGroup ? shadowInk(l) : (l.paths || []).filter((p) => {
    const t = p && p.meta && p.meta.sceneTarget;
    return t && t.regionClass === 'castShadow';
  }));

  // Re-run the SCENE. A group recomposes inside computeAllDisplayGeometry
  // (_computeSceneGroups → group.scenePaths); a monolith leaf must be
  // re-generated first — computeAllDisplayGeometry only re-derives display
  // geometry from paths the algorithm already produced.
  const recompose = (l) => {
    if (!l.isGroup) engine.generate(l.id);
    engine.computeAllDisplayGeometry();
  };

  // ── Panel-surface helpers ─────────────────────────────────────────────────
  const sectionByTitle = (title) => Array.from(controlsHost().querySelectorAll('.sect'))
    .find((s) => (s.querySelector('.sect-hdr-title') || {}).textContent === title) || null;
  const rowCtl = (scope, label) => {
    const row = Array.from(scope.querySelectorAll('.vs3-row'))
      .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label);
    return row ? row.querySelector('.vs3-ctl') : null;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 1. RC1 — the panel's Shadow section MOUNTS on a scene tree.
  // ═══════════════════════════════════════════════════════════════════════

  test('RC1: the tree fixture really is a tree — empty inline lights, real light CHILD', () => {
    const { gid, grp } = buildTree();
    expect(grp.type).toBe('scene3d');
    expect(grp.isGroup).toBe(true);
    expect(grp.containerRole).toBe('scene');
    // The defect's precondition: the panel's light rows read THIS array.
    expect(grp.params.lights).toEqual([]);
    const lights = engine.getLayerChildren(gid).filter((c) => c.type === 'sceneLight3d');
    expect(lights.length).toBe(1);
    // …and the compositor still sees a sun, via collectSceneParams.
    expect(grp._sceneAssembled.lights.length).toBe(1);
    expect(grp._sceneAssembled.lights[0].azimuth).toBe(135);
    // No light ROWS in this panel's tree — which is exactly why the shadow
    // block was unreachable before the fix.
    app.ui.buildControls();
    expect(controlsHost().querySelectorAll('.vs3-tree-light').length).toBe(0);
  });

  test('RC1: selecting the scene GROUP shows the Shadow section with every control', () => {
    buildTree();
    app.ui.buildControls();
    const sect = sectionByTitle('Shadow');
    expect(sect).toBeTruthy();
    const host = sect.querySelector('.vs3-shadow');
    expect(host).toBeTruthy();
    ['Mode', 'Follow light', 'Angle', 'Density', 'Pen', 'Line', 'Layers'].forEach((label) => {
      expect(rowCtl(host, label)).toBeTruthy();
    });
  });

  test('RC1 pin: the legacy MONOLITH gets the same Shadow section', () => {
    buildMonolith();
    app.ui.buildControls();
    const sect = sectionByTitle('Shadow');
    expect(sect).toBeTruthy();
    const host = sect.querySelector('.vs3-shadow');
    ['Mode', 'Follow light', 'Angle', 'Density', 'Pen', 'Line', 'Layers'].forEach((label) => {
      expect(rowCtl(host, label)).toBeTruthy();
    });
  });

  test('RC1: the panel Line + Pen selects write the scene shadow bag and change the ink', () => {
    const { grp } = buildTree();
    app.ui.buildControls();
    const host = sectionByTitle('Shadow').querySelector('.vs3-shadow');

    const before = inkOf(grp);
    expect(before.length).toBeGreaterThan(0);
    // Solid ⇒ no dash stamped on any shadow path.
    expect(before.some((p) => p.meta && p.meta.strokeDash)).toBe(false);

    const lineSel = rowCtl(host, 'Line').querySelector('select');
    expect(lineSel).toBeTruthy();
    lineSel.value = 'dashed';
    lineSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(grp.params.shadow.shadowLineType).toBe('dashed');
    engine.computeAllDisplayGeometry();
    // applyStrokeTreatment stamps the dash pattern onto each shadow path's meta
    // (it does not split the run — the dash is rendered/exported from meta).
    const dashed = inkOf(grp);
    expect(dashed.length).toBeGreaterThan(0);
    expect(dashed.every((p) => Array.isArray(p.meta && p.meta.strokeDash))).toBe(true);

    const pens = window.Vectura.SETTINGS.pens;
    expect(pens.length).toBeGreaterThan(1);
    const penSel = rowCtl(host, 'Pen').querySelector('select');
    penSel.value = pens[1].id;
    penSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(grp.params.shadow.shadowPenId).toBe(pens[1].id);
    engine.computeAllDisplayGeometry();
    // shadowMeta stamps the override onto meta.penId (Inherit ⇒ the key is
    // absent and the caster's pen wins).
    const penned = inkOf(grp);
    expect(penned.length).toBeGreaterThan(0);
    expect(penned.every((p) => p.meta.penId === pens[1].id)).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. SEMANTICS — Angle rotates the FILL, and does NOT move the shadow.
  //    (Jay: "changing the angle of the shadow should not move the shadow,
  //    but should instead move the angle of the line(s)/fill(s) in it.")
  // ═══════════════════════════════════════════════════════════════════════

  const angleSemantics = (make) => {
    const layer = make();
    const base = inkOf(layer);
    expect(base.length).toBeGreaterThan(0);
    const bear0 = meanBearing(base);
    const box0 = bboxOf(base);

    // (a) shadowAngle rotates the fill bearings…
    layer.params.shadow = { ...(layer.params.shadow || {}), shadowAngle: 120 };
    recompose(layer);
    const rotated = inkOf(layer);
    expect(rotated.length).toBeGreaterThan(0);
    const bear1 = meanBearing(rotated);
    expect(angleDelta(bear0, bear1)).toBeGreaterThan(20);

    // (b) …and leaves the FOOTPRINT where it was. This is the assertion that
    // pins the complaint: a fix that rotated the hatch but still drifted the
    // shadow would pass (a) alone. 1.5px tolerance covers hatch endpoints
    // landing at different places on the same footprint boundary.
    expect(bboxDrift(box0, bboxOf(rotated))).toBeLessThan(1.5);
    return { layer, bear0, box0 };
  };

  test('SEMANTICS (tree): Angle rotates the shadow fill and does NOT move the shadow', () => {
    angleSemantics(() => buildTree().grp);
  });

  test('SEMANTICS pin (monolith): same — rotates the fill, footprint unmoved', () => {
    angleSemantics(() => buildMonolith());
  });

  test('CONTRAST: aiming the SUN is what moves the shadow (bearing unchanged)', () => {
    const { gid, grp } = buildTree();
    const base = inkOf(grp);
    const bear0 = meanBearing(base);
    const box0 = bboxOf(base);

    const sun = engine.getLayerChildren(gid).find((c) => c.type === 'sceneLight3d');
    sun.params.azimuth = 220;
    engine.computeAllDisplayGeometry();
    const moved = inkOf(grp);
    expect(moved.length).toBeGreaterThan(0);
    // The footprint swings…
    expect(bboxDrift(box0, bboxOf(moved))).toBeGreaterThan(20);
    // …while the fill keeps its bearing (shadowAngle untouched).
    expect(angleDelta(bear0, meanBearing(moved))).toBeLessThan(2);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. The ctxbar Shadow flyout agrees with the panel.
  // ═══════════════════════════════════════════════════════════════════════

  const openShadowFlyout = (gid, objId) => {
    const CB = window.Vectura.UI.ContextBar;
    app.renderer.setSelection([gid], gid);
    app.renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [objId], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    // fs-s1 made the Shadow pill icon-only (no visible `.ctxbar-text-fieldlabel`
    // span) — select it by its accessible name (aria-label), which
    // makeDropField always sets, rather than by visible text.
    const pill = Array.from(CB.getContentHost().querySelectorAll('.ctxbar-scene-field'))
      .find((f) => f.getAttribute('aria-label') === 'Shadow');
    expect(pill).toBeTruthy();
    pill.click();
    const fly = document.querySelector('.ctxbar-scene-flyout.is-open');
    expect(fly).toBeTruthy();
    return fly;
  };
  const flyCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };

  test('ctxbar Angle dial reads shadow.shadowAngle (not the 135° sun fallback)', () => {
    const { gid, grp, box } = buildTree();
    grp.params.shadow = { ...(grp.params.shadow || {}), shadowAngle: 77 };
    const fly = openShadowFlyout(gid, box.id);
    const ctl = flyCtl(fly, 'Angle');
    expect(ctl).toBeTruthy();
    const input = ctl.querySelector('input');
    expect(input).toBeTruthy();
    // Before the fix this read light0.azimuth ?? 135 — never 77.
    expect(Number(input.value)).toBe(77);
  });

  test('ctxbar Angle dial WRITES shadow.shadowAngle — the sun is untouched', () => {
    const { gid, grp, box } = buildTree();
    const sun = engine.getLayerChildren(gid).find((c) => c.type === 'sceneLight3d');
    const azBefore = sun.params.azimuth;
    const bear0 = meanBearing(inkOf(grp));
    const box0 = bboxOf(inkOf(grp));

    const fly = openShadowFlyout(gid, box.id);
    const input = flyCtl(fly, 'Angle').querySelector('input');
    // AngleDial commits its text field on blur / Enter (not 'change').
    input.value = '120';
    input.dispatchEvent(new window.Event('blur', { bubbles: false }));

    expect(grp.params.shadow.shadowAngle).toBe(120);
    // The write must not leak into the lights — on a tree the inline array is
    // deliberately empty and must STAY empty (it would double-count otherwise).
    expect(grp.params.lights).toEqual([]);
    expect(sun.params.azimuth).toBe(azBefore);

    engine.computeAllDisplayGeometry();
    const after = inkOf(grp);
    expect(angleDelta(bear0, meanBearing(after))).toBeGreaterThan(20);
    expect(bboxDrift(box0, bboxOf(after))).toBeLessThan(1.5);
  });

  test('ctxbar Follow light hides the inert Angle dial and drives the engine flag', () => {
    const { gid, grp, box } = buildTree();
    let fly = openShadowFlyout(gid, box.id);
    expect(flyCtl(fly, 'Angle')).toBeTruthy();

    const seg = flyCtl(fly, 'Follow light');
    expect(seg).toBeTruthy();
    const onBtn = Array.from(seg.querySelectorAll('button')).find((b) => /^on$/i.test(b.textContent.trim()));
    expect(onBtn).toBeTruthy();
    onBtn.click();
    expect(grp.params.shadow.shadowAngleFollowsLight).toBe(true);

    // The flyout rebuilt in place; Angle is gone (shadows.js now derives it).
    fly = document.querySelector('.ctxbar-scene-flyout.is-open');
    expect(flyCtl(fly, 'Angle')).toBeFalsy();

    // …and the engine honours the flag: the fill bearing now tracks the sun.
    engine.computeAllDisplayGeometry();
    const bear0 = meanBearing(inkOf(grp));
    const sun = engine.getLayerChildren(gid).find((c) => c.type === 'sceneLight3d');
    sun.params.azimuth = 40;
    engine.computeAllDisplayGeometry();
    expect(angleDelta(bear0, meanBearing(inkOf(grp)))).toBeGreaterThan(5);
  });

  test('panel Follow light swaps the Angle slider for the derived note', () => {
    const { grp } = buildTree();
    app.ui.buildControls();
    let host = sectionByTitle('Shadow').querySelector('.vs3-shadow');
    expect(rowCtl(host, 'Angle')).toBeTruthy();

    const seg = rowCtl(host, 'Follow light');
    const onBtn = Array.from(seg.querySelectorAll('button')).find((b) => /^on$/i.test(b.textContent.trim()));
    onBtn.click();
    expect(grp.params.shadow.shadowAngleFollowsLight).toBe(true);

    host = sectionByTitle('Shadow').querySelector('.vs3-shadow');
    expect(rowCtl(host, 'Angle')).toBeFalsy();
    expect(host.textContent).toContain('derived from the light bearing');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Regression pin — the tree conversion still empties inline lights.
  // ═══════════════════════════════════════════════════════════════════════

  test('pin: expandMonolithToTree still empties inline lights (no double-count)', () => {
    const mono = buildMonolith();
    const beforeIds = (mono._sceneAssembled ? mono._sceneAssembled.lights : mono.params.lights).map((l) => l.id);
    expect(beforeIds).toEqual(['sun']);

    engine.expandMonolithToTree(mono.id);
    const grp = engine.getLayerById(mono.id);
    expect(grp.isGroup).toBe(true);
    // The inline array is emptied ON PURPOSE — collectSceneParams unions inline
    // lights BEFORE child lights, so leaving them would light the scene twice.
    expect(grp.params.lights).toEqual([]);
    engine.computeAllDisplayGeometry();
    expect(grp._sceneAssembled.lights.length).toBe(1);
    expect(grp._sceneAssembled.lights[0].azimuth).toBe(135);
  });
});
