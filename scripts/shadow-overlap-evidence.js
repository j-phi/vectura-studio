/* Shadow overlap darkening (Unit C close-out) — LIVE visual evidence, shot in
 * the REAL app. Patterned on scripts/stroke-fill-integration-evidence.js.
 *
 * The unit test (tests/unit/scene3d-shadow-overlap.test.js) already proves the
 * ink-density contract at the Scene3D.Shadows.build layer, driven through the
 * shared fixture (tests/fixtures/scene3d-shadow-overlap-fixture.js). This
 * script drives the SAME two scenes ('overlap' and 'apart') through the real
 * app pipeline (engine.addLayer -> computeAllDisplayGeometry -> render) so the
 * darkening is seen, not only asserted, and measures the same density ratio
 * from the actually-rendered scenePaths.
 *
 *   node scripts/shadow-overlap-evidence.js [baseUrl] [outDir]
 *
 * Serve THIS worktree first: node scripts/dev-server.js 8470
 *
 * Captures CANVAS PIXELS, not the page (the floating tool bar overlaps the
 * form) — same shot/save/bbox helpers as the stroke-fill script.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8470';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', '3d-audit', 'handoff', 'unit-c');

// Same two scenes as tests/fixtures/scene3d-shadow-overlap-fixture.js:
//   overlap — casters 50mm apart ALONG the light throw -> far shadow lands on
//             near shadow -> a real depth-2 region.
//   apart   — casters offset ACROSS the throw -> footprints stay disjoint,
//             the byte-identity control (must show ZERO depth-2 regions).
const boxObj = (id, x, z) => ({
  id, name: id, primitive: 'box', params: { sx: 30, sy: 30, sz: 30 },
  transform: { x, y: 15, z, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});
const SCENES = {
  overlap: [boxObj('obj-1', -25, 0), boxObj('obj-2', 25, 0)],
  apart: [boxObj('obj-1', 0, -45), boxObj('obj-2', 0, 45)],
};
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25, intensity: 1, castShadows: true };
const CAMERA = { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

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

  const build = (objects) => page.evaluate(({ objects, SUN, CAMERA }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: true }; p.backdrop = { enabled: false };
    p.objects = objects; p.lights = [SUN];
    p.shadow = { ...(p.shadow || {}), shadowLayers: true };
    engine.computeAllDisplayGeometry();
    app.render();
    const paths = g.scenePaths || [];
    const shadowPaths = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
      && q.meta.sceneTarget && q.meta.sceneTarget.regionClass === 'castShadow');

    // Same density-by-depth grouping as tests/unit/scene3d-shadow-overlap.test.js.
    const polyArea = (poly) => {
      let a = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      return Math.abs(a) / 2;
    };
    const inkLength = (pts) => {
      let l = 0;
      for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return l;
    };
    const regions = new Map();
    shadowPaths.forEach((q) => {
      const t = q.meta.sceneTarget;
      const key = JSON.stringify(t.pickPolygon);
      let r = regions.get(key);
      if (!r) { r = { depth: t.shadowOverlap || 1, area: polyArea(t.pickPolygon), ink: 0, pickPolygon: t.pickPolygon }; regions.set(key, r); }
      r.ink += inkLength(q);
    });
    const byDepth = {};
    regions.forEach((r) => {
      const a = byDepth[r.depth] || { area: 0, ink: 0, regions: 0 };
      a.area += r.area; a.ink += r.ink; a.regions += 1;
      byDepth[r.depth] = a;
    });
    Object.keys(byDepth).forEach((d) => { byDepth[d].density = byDepth[d].ink / (byDepth[d].area || 1); });
    const overlapRegions = [...regions.values()].filter((r) => r.depth > 1);
    const bboxOf = (poly) => {
      let bb = null;
      poly.forEach((pt) => {
        if (!bb) bb = { minx: pt.x, maxx: pt.x, miny: pt.y, maxy: pt.y };
        else { bb.minx = Math.min(bb.minx, pt.x); bb.maxx = Math.max(bb.maxx, pt.x); bb.miny = Math.min(bb.miny, pt.y); bb.maxy = Math.max(bb.maxy, pt.y); }
      });
      return bb;
    };
    // Bbox (drawing-space, pre-pan/zoom) of the depth>=2 pieces, for the crop.
    let lensBB = null;
    overlapRegions.forEach((r) => {
      const bb = bboxOf(r.pickPolygon);
      if (!lensBB) lensBB = { ...bb };
      else { lensBB.minx = Math.min(lensBB.minx, bb.minx); lensBB.maxx = Math.max(lensBB.maxx, bb.maxx); lensBB.miny = Math.min(lensBB.miny, bb.miny); lensBB.maxy = Math.max(lensBB.maxy, bb.maxy); }
    });
    // Bbox of the LARGEST single (depth-1) region, so a scene with no overlap
    // still has a well-defined "representative shadow" location to crop for
    // a like-for-like density comparison.
    const singleRegions = [...regions.values()].filter((r) => r.depth === 1).sort((a, b) => b.area - a.area);
    const singleBB = singleRegions.length ? bboxOf(singleRegions[0].pickPolygon) : null;
    return {
      layerId: gid, total: paths.length, shadowPaths: shadowPaths.length,
      byDepth, overlapRegionCount: overlapRegions.length, lensBB, singleBB,
    };
  }, { objects, SUN, CAMERA });

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

  // Drawing-space (pre-pan/zoom) point -> canvas CSS-px, using the renderer's
  // CURRENT transform (must be read AFTER zoom()).
  const toCanvasPx = (pt) => page.evaluate((pt) => {
    const r = window.app.renderer;
    return { x: pt.x * r.scale + r.offsetX, y: pt.y * r.scale + r.offsetY };
  }, pt);

  const ZOOM = 2.4;
  const report = {};

  // --- overlap scene ---
  const ov = await build(SCENES.overlap);
  await zoom(ZOOM);
  await page.waitForTimeout(400);
  let bb = await bbox();
  await save('overlap-full.png', bb.minx - 6, bb.miny - 6, (bb.maxx - bb.minx) + 12, (bb.maxy - bb.miny) + 12, 1200);
  let lensCenterPx = null;
  if (ov.lensBB) {
    const c1 = await toCanvasPx({ x: ov.lensBB.minx, y: ov.lensBB.miny });
    const c2 = await toCanvasPx({ x: ov.lensBB.maxx, y: ov.lensBB.maxy });
    const minx = Math.min(c1.x, c2.x); const maxx = Math.max(c1.x, c2.x);
    const miny = Math.min(c1.y, c2.y); const maxy = Math.max(c1.y, c2.y);
    lensCenterPx = { x: (minx + maxx) / 2, y: (miny + maxy) / 2 };
  }
  // Crop window: generous margin around the lens (or bbox center if no lens).
  const CROP = 90; // CSS px half-size
  const center = lensCenterPx || { x: (bb.minx + bb.maxx) / 2, y: (bb.miny + bb.maxy) / 2 };
  await save('overlap-crop.png', center.x - CROP, center.y - CROP, CROP * 2, CROP * 2, 1200);
  report.overlap = { ...ov, bb, cropCenterPx: center };
  console.log('overlap', JSON.stringify({ shadowPaths: ov.shadowPaths, byDepth: ov.byDepth, overlapRegionCount: ov.overlapRegionCount }));

  // --- apart (control) scene: identical pipeline + zoom + crop window ---
  const ap = await build(SCENES.apart);
  await zoom(ZOOM);
  await page.waitForTimeout(400);
  bb = await bbox();
  await save('apart-full.png', bb.minx - 6, bb.miny - 6, (bb.maxx - bb.minx) + 12, (bb.maxy - bb.miny) + 12, 1200);
  // No depth-2 region exists in the control (by construction). Crop centred
  // on ONE of its ordinary single-shadow regions instead of the empty gap
  // between the two disjoint footprints, so the shot actually shows the
  // single-shadow pitch to compare against the overlap crop's denser patch.
  let apCenter = { x: (bb.minx + bb.maxx) / 2, y: (bb.miny + bb.maxy) / 2 };
  if (ap.singleBB) {
    const c1 = await toCanvasPx({ x: ap.singleBB.minx, y: ap.singleBB.miny });
    const c2 = await toCanvasPx({ x: ap.singleBB.maxx, y: ap.singleBB.maxy });
    apCenter = { x: (Math.min(c1.x, c2.x) + Math.max(c1.x, c2.x)) / 2, y: (Math.min(c1.y, c2.y) + Math.max(c1.y, c2.y)) / 2 };
  }
  await save('apart-crop.png', apCenter.x - CROP, apCenter.y - CROP, CROP * 2, CROP * 2, 1200);
  report.apart = { ...ap, bb, cropCenterPx: apCenter };
  console.log('apart', JSON.stringify({ shadowPaths: ap.shadowPaths, byDepth: ap.byDepth, overlapRegionCount: ap.overlapRegionCount }));

  const densityRatio = (ov.byDepth[2] && ov.byDepth[1]) ? ov.byDepth[2].density / ov.byDepth[1].density : null;
  const summary = {
    ver,
    densityRatio,
    overlapMeetsThreshold: densityRatio !== null && densityRatio > 1.25,
    apartOverlapRegionCount: ap.overlapRegionCount,
    apartIsControl: ap.overlapRegionCount === 0,
  };
  console.log('SUMMARY', JSON.stringify(summary));

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ ver, summary, report }, null, 2));
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); fs.writeFileSync(path.join(outDir, 'page-errors.txt'), errors.join('\n')); }
  await browser.close();
  if (!summary.overlapMeetsThreshold || !summary.apartIsControl) {
    console.error('EVIDENCE FAILED CONTRACT — see stats.json');
    process.exit(1);
  }
})();
