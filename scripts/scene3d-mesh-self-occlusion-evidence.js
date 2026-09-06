/* Unit F evidence — imported non-convex mesh vs the F7 red-line rule, shot in
 * the REAL app. Same object-only canvas-crop technique
 * `scripts/shadow-receive-plane-evidence.js` (unit D) / `scripts/shadow-
 * overlap-evidence.js` (unit C) use: grab `#main-canvas` directly (no app
 * chrome), auto-detect the drawn content's bounding box by scanning pixel
 * luminance against the corner (background) colour, and crop with a small
 * margin — plus a survivor-region crop centred on the exact paper-space
 * point `tests/unit/scene3d-mesh-self-occlusion.test.js` measured as a
 * genuine far-sheet survivor for the 'spiral' mapper.
 *
 * Reuses the SAME torus fixture generator as the unit test (major=25.5,
 * minor=2.52, 24x12) and the SAME import path (`ObjImport.parse` ->
 * `engine.importMeshAsScene`) — this is not a different scene, it is the
 * measured one, seen.
 *
 *   node scripts/scene3d-mesh-self-occlusion-evidence.js [baseUrl] [outDir]
 *
 * Serve THIS worktree first: node scripts/dev-server.js 8471
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8471';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', '3d-audit', 'handoff', 'unit-f');

// ── Same fixture as tests/unit/scene3d-mesh-self-occlusion.test.js ─────────
const TAU = Math.PI * 2;
const MAJOR = 25.5;
const MINOR = 2.52;
const U_STEPS = 24;
const V_STEPS = 12;
const torusPoint = (u, v) => {
  const a = u * TAU; const b = v * TAU;
  const ringR = MAJOR + (Math.cos(b) * MINOR);
  return { x: Math.cos(a) * ringR, y: Math.sin(b) * MINOR, z: Math.sin(a) * ringR };
};
const analyticOutward = (u, v) => {
  const a = u * TAU; const b = v * TAU;
  return { x: Math.cos(a) * Math.cos(b), y: Math.sin(b), z: Math.sin(a) * Math.cos(b) };
};
const cross3 = (p, q) => ({
  x: (p.y * q.z) - (p.z * q.y), y: (p.z * q.x) - (p.x * q.z), z: (p.x * q.y) - (p.y * q.x),
});
const sub3 = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot3 = (p, q) => (p.x * q.x) + (p.y * q.y) + (p.z * q.z);

const buildTorusObj = () => {
  const vidx = (iu, iv) => ((((iu % U_STEPS) + U_STEPS) % U_STEPS) * V_STEPS)
    + (((iv % V_STEPS) + V_STEPS) % V_STEPS) + 1;
  const a = torusPoint(0 / U_STEPS, 0 / V_STEPS);
  const b = torusPoint(1 / U_STEPS, 0 / V_STEPS);
  const c = torusPoint(1 / U_STEPS, 1 / V_STEPS);
  const d = torusPoint(0 / U_STEPS, 1 / V_STEPS);
  const naturalNormal = cross3(sub3(b, a), sub3(c, a));
  const naturalIsOutward = dot3(naturalNormal, analyticOutward(0, 0)) > 0;
  const lines = ['# unit-f torus fixture (24x12) — evidence script, same generator as the unit test'];
  for (let iu = 0; iu < U_STEPS; iu++) {
    for (let iv = 0; iv < V_STEPS; iv++) {
      const p = torusPoint(iu / U_STEPS, iv / V_STEPS);
      lines.push(`v ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}`);
    }
  }
  for (let iu = 0; iu < U_STEPS; iu++) {
    for (let iv = 0; iv < V_STEPS; iv++) {
      const ia = vidx(iu, iv); const ib = vidx(iu + 1, iv);
      const ic = vidx(iu + 1, iv + 1); const id = vidx(iu, iv + 1);
      const quad = naturalIsOutward ? [ia, ib, ic, id] : [ia, id, ic, ib];
      lines.push(`f ${quad.join(' ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
};

// The exact paper-space (document mm) survivor point
// tests/unit/scene3d-mesh-self-occlusion.test.js measured for the 'spiral'
// mapper (cellMm: 0.25, deterministic across repeated runs).
const SURVIVOR = { x: 172.18602666957324, y: 104.42211992678234 };
const SURVIVOR_HALFCROP = 20; // paper mm half-window around the survivor point

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

  const objText = buildTorusObj();

  // Import the fixture through the REAL production path and set the fill
  // mapper, mirroring the unit test exactly.
  const build = (mapper) => page.evaluate(({ objText, mapper }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const V = window.Vectura;
    const mesh = V.ObjImport.parse(objText, 'unit-f-torus.obj');
    const res = engine.importMeshAsScene(mesh, 'unit-f-torus');
    const child = engine.getLayerById(res.childId);
    child.params.style = child.params.style || { penId: null, mapper: 'hatch', params: {} };
    child.params.style.mapper = mapper;
    child.params.style.params = { ...(child.params.style.params || {}), fillDensity: 60 };
    const t0 = performance.now();
    engine.computeAllDisplayGeometry();
    const t1 = performance.now();
    app.render();
    const group = engine.getLayerById(res.groupId);
    const paths = group.scenePaths || [];
    const lastRibbonStats = V.Scene3D.SurfaceFill.lastRibbonStats;
    return {
      groupId: res.groupId, childId: res.childId, total: paths.length, computeMs: t1 - t0, lastRibbonStats,
    };
  }, { objText, mapper });

  const zoom = (k) => page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2; const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k; r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k; r.userHasManipulated = true; r.draw();
  }, k);

  const applyView = (view) => page.evaluate((view) => {
    const r = window.app.renderer;
    r.scale = view.scale; r.offsetX = view.offsetX; r.offsetY = view.offsetY;
    r.userHasManipulated = true; r.draw();
  }, view);

  // Deselect (no gizmo/handles in the shot) — this evidence is about the
  // rendered ink, not the editor chrome.
  const deselect = () => page.evaluate(() => {
    window.app.setSelection && window.app.setSelection([]);
    window.app.renderer.draw();
  });

  // Canvas-only crop: draws directly from `#main-canvas` into an offscreen
  // canvas and returns a data URL — no app chrome (menus/panels/toolbars)
  // ever enters the frame. `cap` bounds the longest output side. The source
  // rect is CLAMPED to the canvas's own device-pixel bounds first — an
  // unclamped rect (e.g. a survivor crop window that runs past the canvas
  // edge) would otherwise sample past the bitmap and pad the result with
  // blank/transparent pixels instead of failing loudly.
  const shot = (sx, sy, sw, sh, cap) => page.evaluate(({ sx, sy, sw, sh, cap }) => {
    const c = document.querySelector('#main-canvas');
    const s = c.width / c.clientWidth;
    let dx0 = sx * s; let dy0 = sy * s;
    let dx1 = (sx + sw) * s; let dy1 = (sy + sh) * s;
    dx0 = Math.max(0, Math.min(c.width, dx0));
    dy0 = Math.max(0, Math.min(c.height, dy0));
    dx1 = Math.max(0, Math.min(c.width, dx1));
    dy1 = Math.max(0, Math.min(c.height, dy1));
    const w = Math.round(dx1 - dx0); const h = Math.round(dy1 - dy0);
    const k = cap ? Math.min(1, cap / Math.max(w, h)) : 1;
    const o = document.createElement('canvas');
    o.width = Math.round(w * k); o.height = Math.round(h * k);
    const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(c, Math.round(dx0), Math.round(dy0), w, h, 0, 0, o.width, o.height);
    return { url: o.toDataURL('image/png'), clamped: dx0 !== sx * s || dy0 !== sy * s || dx1 !== (sx + sw) * s || dy1 !== (sy + sh) * s };
  }, { sx, sy, sw, sh, cap });

  const save = async (file, sx, sy, sw, sh, cap) => {
    const { url, clamped } = await shot(sx, sy, sw, sh, cap || 0);
    if (clamped) console.log(`  (${file}: crop window clamped to the canvas bounds — window ran off-canvas)`);
    fs.writeFileSync(path.join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
    return file;
  };

  // Auto-detects the drawn content's bbox (device px) by scanning pixel
  // luminance against the corner colour — same helper as unit-d's script.
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

  const ZOOM = 3.2;
  const stats = {};

  // ── hatch mapper — PASSES (0 survivors) ─────────────────────────────────
  stats.hatch = await build('hatch');
  await zoom(ZOOM);
  await deselect();
  await page.waitForTimeout(200);
  let bb = await bbox();
  await save('F-hatch-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1600);
  const VIEW = await page.evaluate(() => {
    const r = window.app.renderer;
    return { scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY };
  });

  // ── spiral mapper — 1/29 survivor (gap ~9.3mm), same view ───────────────
  stats.spiral = await build('spiral');
  await applyView(VIEW);
  await deselect();
  await page.waitForTimeout(200);
  bb = await bbox();
  await save('F-spiral-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1600);

  // Crop centred on the EXACT measured survivor point, at high magnification,
  // so the gap can actually be looked at (plan-F's requirement). Re-centre
  // the view ON the survivor first (rather than reusing the full-object
  // VIEW) so a tight crop window can't run off the canvas edge — the
  // survivor sits near the torus's right-hand inner-hole cusp, well off
  // centre in the full-object framing.
  const SURVIVOR_ZOOM_SCALE = VIEW.scale * 1.8;
  await page.evaluate(({ x, y, scale }) => {
    const r = window.app.renderer;
    const rect = r.canvas.getBoundingClientRect();
    r.scale = scale;
    r.offsetX = (rect.width / 2) - (x * scale);
    r.offsetY = (rect.height / 2) - (y * scale);
    r.userHasManipulated = true; r.draw();
  }, { x: SURVIVOR.x, y: SURVIVOR.y, scale: SURVIVOR_ZOOM_SCALE });
  await page.waitForTimeout(200);
  const p1 = await toCanvasPx({ x: SURVIVOR.x - SURVIVOR_HALFCROP, y: SURVIVOR.y - SURVIVOR_HALFCROP });
  const p2 = await toCanvasPx({ x: SURVIVOR.x + SURVIVOR_HALFCROP, y: SURVIVOR.y + SURVIVOR_HALFCROP });
  const cropX = Math.min(p1.x, p2.x); const cropY = Math.min(p1.y, p2.y);
  const cropW = Math.abs(p2.x - p1.x); const cropH = Math.abs(p2.y - p1.y);
  await save('F-spiral-survivor-crop.png', cropX, cropY, cropW, cropH, 1400);

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ ver, survivor: SURVIVOR, stats }, null, 2));
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); fs.writeFileSync(path.join(outDir, 'page-errors.txt'), errors.join('\n')); }
  console.log('DONE', JSON.stringify(stats));
  await browser.close();
})();
