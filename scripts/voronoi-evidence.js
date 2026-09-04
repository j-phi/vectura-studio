/* voronoiWeb — LIVE visual evidence, shot in the REAL app.
 *
 * The two claims this law makes are visual ones: "reads unmistakably as a
 * Voronoi web with no breaks" and "openings smaller in shadow, larger in
 * highlight". Neither is settled by a passing unit test, so this drives a real
 * browser, puts a sphere under one strong directional light, and shoots three
 * frames — the whole form, a window inside the terminator, and a window on the
 * lit side — into `docs/voronoi-evidence/`.
 *
 *   node scripts/voronoi-evidence.js [baseUrl] [outDir]
 *
 * Serve the worktree under test first (`python3 -m http.server 8406`) — a stale
 * server on a shared port silently serving ANOTHER worktree has bitten this
 * repo before, so check the path count this prints against the unit harness.
 *
 * It captures CANVAS PIXELS, not the page: the app's floating tool bar sits
 * over the bottom of the form and a page screenshot puts it in the evidence.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8406';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', 'voronoi-evidence');

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
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 60000 });
  const ver = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');
  console.log('served version', ver);

  const stats = await page.evaluate(async ({ SPHERE, SUN, CAMERA }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA;
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.objects = [SPHERE];
    p.lights = [SUN];
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: 'voronoiWeb' } };
    p.styleTable = { scene: JSON.parse(JSON.stringify(base)), byObject: { ball: JSON.parse(JSON.stringify(base)) }, byFace: {} };
    engine.computeAllDisplayGeometry();
    app.render();
    const paths = g.scenePaths || [];
    let fillP = 0; let ink = 0;
    paths.forEach((q) => {
      if (!(q.meta && q.meta.kind === 'sceneFill')) return;
      fillP += 1;
      for (let i = 1; i < q.length; i++) ink += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
    });
    return { total: paths.length, fillPaths: fillP, fillInk: +ink.toFixed(1) };
  }, { SPHERE, SUN, CAMERA });
  console.log('paths', JSON.stringify(stats));

  // Fit, then zoom about the canvas centre so a single cell is legible.
  await page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2; const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k;
    r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k;
    r.userHasManipulated = true;
    r.draw();
  }, 2.6);
  await page.waitForTimeout(400);

  // Capture the CANVAS PIXELS, not the page: the app's floating tool bar sits
  // over the bottom of the form and a page screenshot would put it in the
  // evidence. `toDataURL` on a crop canvas sees only the drawing.
  const shot = (sx, sy, sw, sh, cap) => page.evaluate(({
    sx, sy, sw, sh, cap,
  }) => {
    const c = document.querySelector('#main-canvas');
    const s = c.width / c.clientWidth;
    const w = Math.round(sw * s); const h = Math.round(sh * s);
    const k = cap ? Math.min(1, cap / Math.max(w, h)) : 1;
    const o = document.createElement('canvas');
    o.width = Math.round(w * k); o.height = Math.round(h * k);
    const g = o.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, Math.round(sx * s), Math.round(sy * s), w, h, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }, {
    sx, sy, sw, sh, cap,
  });
  // The crops go out at full device resolution; the whole-form frame is capped
  // so the evidence does not put a multi-megabyte PNG in the repository.
  const save = async (file, sx, sy, sw, sh, cap) => {
    const url = await shot(sx, sy, sw, sh, cap || 0);
    fs.writeFileSync(path.join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
  };

  // Sphere bbox in CSS px inside the canvas. The web is near-white ink; the
  // document page frame is a faint grey line, so a LUMINANCE threshold picks
  // out the drawing and ignores the frame.
  const bb = await page.evaluate(() => {
    const c = document.querySelector('#main-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const corner = (d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114);
    let minx = 1e9; let miny = 1e9; let maxx = -1e9; let maxy = -1e9;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (Math.abs(L - corner) < 90) continue;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
    const s = c.width / c.clientWidth;
    return { minx: minx / s, miny: miny / s, maxx: maxx / s, maxy: maxy / s, scale: s };
  });
  console.log('sphere bbox (css px in canvas):', JSON.stringify(bb));
  const L = bb.minx; const T = bb.miny;
  const W = bb.maxx - bb.minx; const H = bb.maxy - bb.miny;

  await save('1-full-sphere.png', L - 6, T - 6, W + 12, H + 12, 1100);

  // Two equal windows at the same height, one inside the terminator and one on
  // the lit side, so the crops differ only in the tone under them.
  // The sun is at azimuth 90 / elevation 30, so on this front-on orthographic
  // camera the highlight sits up and to the RIGHT and the terminator side sits
  // down and to the LEFT. Equal windows, placed on those two centres.
  const S = Math.min(W, H) * 0.26;
  const win = (fx, fy) => [L + W * fx - S / 2, T + H * fy - S / 2, S, S];
  await save('2-crop-shadow.png', ...win(0.20, 0.70));
  await save('3-crop-highlight.png', ...win(0.74, 0.30));
  const box = { S };

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ ver, stats, bb, crop: { S } }, null, 2));
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
})();
