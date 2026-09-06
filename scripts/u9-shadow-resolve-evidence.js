/* U9 (resolve half) — LIVE visual evidence, shot in the REAL app.
 * docs/3d-audit/lane-reports/W-22-24-W-18-plan.md §U9,
 * docs/3d-audit/lane-reports/ROUND2-BRIEFS.md § handoff-c2.
 *
 * The unit tests (tests/unit/scene3d-shadow-tone-law.test.js — the HEADLINE
 * "(U9)" case and the params-level "U9 —" case) already prove the mechanism:
 * a shadow.shadowToneLaw of a FOLDED id ('fineLadder', a key of
 * src/config/scene3d-tone-laws.js's ALIASES) used to be collapsed to its
 * survivor ('ladder') by params.js's normalizeShadow, losing the information
 * shadows.js's HATCH_LAW_RECIPES needs to draw fineLadder's own recipe (a
 * 0.97x spacing multiplier) instead of falling through to the plain
 * hatchRingsEvenOdd fallback 'ladder' itself gets. This script drives the
 * SAME two builds through the real app pipeline (engine.addLayer ->
 * computeAllDisplayGeometry -> render) so the fix is SEEN, not only asserted.
 *
 * "before" is the plain 'ladder' shot — proven byte-identical, by the unit
 * test's geomSignature equality, to what 'fineLadder' rendered as BEFORE this
 * fix (the alias collapse made them literally the same code path). "after" is
 * 'fineLadder' shot under the CURRENT (fixed) worktree — it must now render
 * fineLadder's own, distinct recipe. Both shots are the SAME scene, SAME
 * camera/zoom/crop, SAME (fixed) app build — only shadowToneLaw differs.
 *
 *   node scripts/u9-shadow-resolve-evidence.js [baseUrl] [outDir]
 *
 * Serve THIS worktree first: node scripts/dev-server.js 8470
 *
 * Captures CANVAS PIXELS, not the page (the floating tool bar overlaps the
 * form) — same shot/save/bbox helpers as shadow-receive-evidence.js /
 * shadow-overlap-evidence.js.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8470';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', '3d-audit', 'fill-audit', 'after', 'U9');

// Sphere on a ground plane, directional light casting a shadow — the exact
// shape the plan's "Live verification" bullet names.
const SPHERE = {
  id: 'sphere-1', name: 'sphere-1', primitive: 'sphere', params: { radius: 34, detail: 28 },
  transform: { x: 0, y: 34, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 40, intensity: 1, castShadows: true };
const CAMERA = { projection: 'orthographic', yaw: 15, pitch: 50, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  const ver = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');
  console.log('served version', ver);

  const build = (shadowToneLaw) => page.evaluate(({ shadowToneLaw, SUN, CAMERA, SPHERE }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: true }; p.backdrop = { enabled: false };
    p.objects = [SPHERE]; p.lights = [SUN];
    p.shadow = { ...(p.shadow || {}), shadowToneLaw, shadowDensity: 70, shadowLayers: false };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 40, toneLaw: 'ladder' } },
      byObject: { 'sphere-1': { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 40, toneLaw: 'ladder' } } },
      byFace: {},
    };
    engine.computeAllDisplayGeometry();
    app.render();
    const paths = g.scenePaths || [];
    const shadowPaths = paths.filter((q) => q.meta && q.meta.sceneTarget && q.meta.sceneTarget.regionClass === 'castShadow');
    const geomSig = JSON.stringify(shadowPaths.map((q) => q.map((pt) => [
      Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000,
    ])));
    let bb = null;
    shadowPaths.forEach((q) => q.forEach((pt) => {
      if (!bb) bb = { minx: pt.x, maxx: pt.x, miny: pt.y, maxy: pt.y };
      else {
        bb.minx = Math.min(bb.minx, pt.x); bb.maxx = Math.max(bb.maxx, pt.x);
        bb.miny = Math.min(bb.miny, pt.y); bb.maxy = Math.max(bb.maxy, pt.y);
      }
    }));
    return { layerId: gid, shadowPathCount: shadowPaths.length, geomSig, shadowBB: bb };
  }, { shadowToneLaw, SUN, CAMERA, SPHERE });

  const zoom = (k) => page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2; const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k; r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k; r.userHasManipulated = true; r.draw();
  }, k);

  const shot = (sx, sy, sw, sh, cap) => page.evaluate(({ sx, sy, sw, sh, cap }) => {
    const c = document.querySelector('#main-canvas');
    const s = c.width / c.clientWidth;
    const w = Math.round(sw * s); const h = Math.round(sh * s);
    const k = cap ? Math.min(1, cap / Math.max(w, h)) : 1;
    const o = document.createElement('canvas');
    o.width = Math.round(w * k); o.height = Math.round(h * k);
    const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(c, Math.round(sx * s), Math.round(sy * s), w, h, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }, { sx, sy, sw, sh, cap });

  const save = async (file, sx, sy, sw, sh, cap) => {
    const url = await shot(sx, sy, sw, sh, cap || 0);
    fs.writeFileSync(path.join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
    return file;
  };

  const bbox = () => page.evaluate(() => {
    const c = document.querySelector('#main-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const corner = (d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114);
    let minx = 1e9; let miny = 1e9; let maxx = -1e9; let maxy = -1e9;
    for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) {
      const i = (y * c.width + x) * 4;
      const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (Math.abs(L - corner) < 90) continue;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    const s = c.width / c.clientWidth;
    return { minx: minx / s, miny: miny / s, maxx: maxx / s, maxy: maxy / s };
  });

  const toCanvasPx = (pt) => page.evaluate((pt) => {
    const r = window.app.renderer;
    return { x: pt.x * r.scale + r.offsetX, y: pt.y * r.scale + r.offsetY };
  }, pt);

  const applyView = (view) => page.evaluate((view) => {
    const r = window.app.renderer;
    r.scale = view.scale; r.offsetX = view.offsetX; r.offsetY = view.offsetY;
    r.userHasManipulated = true; r.draw();
  }, view);

  const ZOOM = 2.6;
  const CROP = 170;
  const stats = {};

  // ── "before" stand-in: plain 'ladder' — the SAME shape 'fineLadder'
  //    rendered as pre-fix (proven byte-identical by the unit test's
  //    geomSignature equality; see tests/unit/scene3d-shadow-tone-law.test.js
  //    "REGRESSION" + "HEADLINE (U9)" cases). This build ALSO fixes the ONE
  //    shared view every other shot in this script reuses. ─────────────────
  const before = await build('ladder');
  await zoom(ZOOM);
  await page.waitForTimeout(300);
  let bb = await bbox();
  await save('before-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1400);
  const VIEW = await page.evaluate(() => {
    const r = window.app.renderer;
    return { scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY };
  });
  if (!before.shadowBB) throw new Error('no castShadow geometry found in the "before" build — cannot place a crop');
  const sb = before.shadowBB;
  const c1 = await toCanvasPx({ x: sb.minx, y: sb.miny });
  const c2 = await toCanvasPx({ x: sb.maxx, y: sb.maxy });
  const cropCenter = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
  await save('before-crop.png', cropCenter.x - CROP, cropCenter.y - CROP, CROP * 2, CROP * 2, 1200);
  stats.before = before;

  // ── "after": shadowToneLaw:'fineLadder' under the CURRENT (fixed) build ──
  const after = await build('fineLadder');
  await applyView(VIEW);
  await page.waitForTimeout(300);
  bb = await bbox();
  await save('after-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1400);
  await save('after-crop.png', cropCenter.x - CROP, cropCenter.y - CROP, CROP * 2, CROP * 2, 1200);
  stats.after = after;

  // ── control: shadowToneLaw:'penCross' — an OFFERED (non-folded) survivor,
  //    must ALSO differ from 'ladder' (guards that the shared dispatch path
  //    still works for ordinary ids, not just the one folded id under test) ──
  const control = await build('penCross');
  await applyView(VIEW);
  await page.waitForTimeout(300);
  bb = await bbox();
  await save('control-penCross-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1400);
  stats.controlPenCross = control;

  const summary = {
    ver,
    beforeShadowPathCount: before.shadowPathCount,
    afterShadowPathCount: after.shadowPathCount,
    controlShadowPathCount: control.shadowPathCount,
    // U9's whole point: 'fineLadder' must NOT collapse to plain 'ladder'
    // geometry any more.
    afterDiffersFromBefore: after.geomSig !== before.geomSig,
    controlDiffersFromBefore: control.geomSig !== before.geomSig,
  };
  console.log('SUMMARY', JSON.stringify(summary));

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ ver, summary, stats }, null, 2));
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); fs.writeFileSync(path.join(outDir, 'page-errors.txt'), errors.join('\n')); }
  await browser.close();
})();
