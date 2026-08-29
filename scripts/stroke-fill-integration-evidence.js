/* Stroke-fill integration — LIVE visual evidence, shot in the REAL app.
 *
 * The whole effort exists to kill two visible defects on a 3D scene fill:
 *   D1 stairstepping + round-cap bulges along a variable-width stroke, and
 *   D2 ink protruding past the silhouette after "Expand into group".
 * Neither is settled by a unit test, so this drives a real browser and shoots
 * the form, the limb, and a single stroke end into docs/integration-evidence/.
 *
 *   node scripts/stroke-fill-integration-evidence.js [baseUrl] [outDir]
 *
 * Serve THIS worktree first (python3 -m http.server 8410) — a stale server on a
 * shared port silently serving another worktree has bitten this repo before, so
 * check the printed version/path counts against the unit harness.
 *
 * Captures CANVAS PIXELS, not the page: the floating tool bar overlaps the form.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8410';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', 'integration-evidence');

const SPHERE = {
  id: 'ball', name: 'Ball', primitive: 'sphere',
  params: { radius: 46, detail: 26 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
};
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 30, intensity: 1, castShadows: false };
const CAMERA = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

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

  const build = (law, styleExtra) => page.evaluate(async ({ SPHERE, SUN, CAMERA, law, styleExtra }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: false }; p.backdrop = { enabled: false };
    p.objects = [SPHERE]; p.lights = [SUN];
    // CONTRACT C4: strokeFillStyle is a LAYER param (ALGO_DEFAULTS.scene3d),
    // NOT a style-cascade param — putting it in styleTable.params is inert.
    if (styleExtra && styleExtra.strokeFillStyle) p.strokeFillStyle = styleExtra.strokeFillStyle;
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: law } };
    p.styleTable = { scene: JSON.parse(JSON.stringify(base)), byObject: { ball: JSON.parse(JSON.stringify(base)) }, byFace: {} };
    engine.computeAllDisplayGeometry();
    app.render();
    const paths = g.scenePaths || [];
    let fillP = 0; let ink = 0; const ws = new Set();
    paths.forEach((q) => {
      if (!(q.meta && q.meta.kind === 'sceneFill')) return;
      fillP += 1;
      const w = Number(q.meta.weightScale); ws.add(Number.isFinite(w) ? Math.round(w * 1000) / 1000 : 1);
      for (let i = 1; i < q.length; i++) ink += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
    });
    return { layerId: gid, strokeFillStyle: p.strokeFillStyle, total: paths.length, fillPaths: fillP, fillInk: +ink.toFixed(1), weightScales: [...ws].sort((a, b) => a - b) };
  }, { SPHERE, SUN, CAMERA, law, styleExtra });

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

  const report = {};
  const frame = async (tag, law, styleExtra, zoomK) => {
    const st = await build(law, styleExtra);
    await zoom(zoomK || 2.4);
    await page.waitForTimeout(400);
    const bb = await bbox();
    const L = bb.minx; const T = bb.miny; const W = bb.maxx - bb.minx; const H = bb.maxy - bb.miny;
    await save(`${tag}-full.png`, L - 6, T - 6, W + 12, H + 12, 1200);
    // LIMB: a tall window straddling the left silhouette edge — where parallel
    // offset copies used to escape the form. STROKE END: a small window at the
    // top-left inner field where ribbon ends terminate.
    const S = Math.min(W, H) * 0.22;
    await save(`${tag}-crop-limb.png`, L - S * 0.35, T + H * 0.5 - S / 2, S, S);
    await save(`${tag}-crop-end.png`, L + W * 0.30 - S / 2, T + H * 0.22 - S / 2, S, S);
    report[tag] = { law, styleExtra: styleExtra || null, ...st, bb };
    console.log(tag, JSON.stringify(report[tag]));
    return report[tag];
  };

  // (a) the user's original defect
  await frame('a-taperedEnds', 'taperedEnds', null, 2.4);
  // (b) the strokeFillStyle control actually changes the fill
  await frame('b-spiral', 'taperedEnds', { strokeFillStyle: 'spiral' }, 2.4);
  await frame('b-concentric', 'taperedEnds', { strokeFillStyle: 'concentric' }, 2.4);
  // (c) the deliberate three-pen exemption must KEEP distinct nibs
  await frame('c-penCross', 'penCross', null, 2.4);

  // (d) expand into group — before / after on the taperedEnds sphere
  const before = await build('taperedEnds', null);
  await zoom(2.4); await page.waitForTimeout(300);
  let bb = await bbox();
  await save('d-expand-before-full.png', bb.minx - 6, bb.miny - 6, (bb.maxx - bb.minx) + 12, (bb.maxy - bb.miny) + 12, 1200);
  const Sb = Math.min(bb.maxx - bb.minx, bb.maxy - bb.miny) * 0.22;
  await save('d-expand-before-limb.png', bb.minx - Sb * 0.35, bb.miny + (bb.maxy - bb.miny) * 0.5 - Sb / 2, Sb, Sb);
  const beforeBB = bb;

  const expanded = await page.evaluate((gid) => {
    const app = window.app; const engine = app.engine;
    const layer = engine.layers.find((l) => l.id === gid);
    app.ui.expandLayer(layer);
    engine.computeAllDisplayGeometry();
    if (app.renderer && app.renderer.selectedLayerIds && app.renderer.selectedLayerIds.clear) app.renderer.selectedLayerIds.clear();
    app.render();
    const kids = engine.layers.filter((l) => l.parentId && l.parentId !== null);
    return { layers: engine.layers.length, children: kids.length };
  }, before.layerId);
  await page.waitForTimeout(400);
  bb = await bbox();
  await save('d-expand-after-full.png', bb.minx - 6, bb.miny - 6, (bb.maxx - bb.minx) + 12, (bb.maxy - bb.miny) + 12, 1200);
  await save('d-expand-after-limb.png', beforeBB.minx - Sb * 0.35, beforeBB.miny + (beforeBB.maxy - beforeBB.miny) * 0.5 - Sb / 2, Sb, Sb);
  report['d-expand'] = { before: { ...before, bb: beforeBB }, after: { ...expanded, bb } };
  // D2 is a MEASURED claim, not only a visual one: the expanded drawing's ink
  // bbox must not grow past the pre-expand one (beyond a sub-pixel epsilon).
  const grow = {
    left: +(beforeBB.minx - bb.minx).toFixed(2), top: +(beforeBB.miny - bb.miny).toFixed(2),
    right: +(bb.maxx - beforeBB.maxx).toFixed(2), bottom: +(bb.maxy - beforeBB.maxy).toFixed(2),
  };
  report['d-expand'].bboxGrowthCssPx = grow;
  console.log('expand bbox growth (css px, >0 = protrusion):', JSON.stringify(grow));

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ ver, report }, null, 2));
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); fs.writeFileSync(path.join(outDir, 'page-errors.txt'), errors.join('\n')); }
  await browser.close();
})();
