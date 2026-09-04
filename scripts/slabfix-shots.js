/* SLAB FIX — real app canvas shots, full view plus a mid-band crop.
 *   node scripts/slabfix-shots.js <url> <prefix> <law> [law ...]
 * Same scene and framing as scripts/judge-c-shots.js, so `app-*.png` here is
 * directly comparable with the judge's `baseapp-*.png`.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const URL = process.argv[2] || 'http://localhost:8414';
const PREFIX = process.argv[3] || 'app';
const LAWS = process.argv.slice(4);
const out = path.resolve(__dirname, '..', 'docs', 'slab-fix-evidence');

const SPHERE = { id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 46, detail: 26 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 30, intensity: 1, castShadows: false };
const CAMERA = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await p.goto(`${URL}/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  console.log('version', await p.evaluate(() => window.Vectura.APP_VERSION));

  for (const law of LAWS) {
    const info = await p.evaluate(async ({ SPHERE, SUN, CAMERA, law }) => {
      const e = window.app.engine;
      e.layers = [];
      const gid = e.addLayer('scene3d');
      e.layers = e.layers.filter((l) => l.parentId !== gid);
      const g = e.layers.find((l) => l.id === gid);
      g.isGroup = true; g.containerRole = 'scene';
      const q = g.params;
      q.camera = CAMERA; q.ground = { enabled: false }; q.backdrop = { enabled: false };
      q.objects = [SPHERE]; q.lights = [SUN];
      const bs = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: law } };
      q.styleTable = { scene: JSON.parse(JSON.stringify(bs)), byObject: { ball: JSON.parse(JSON.stringify(bs)) }, byFace: {} };
      e.computeAllDisplayGeometry();
      window.app.render();
      const paths = (g.scenePaths || []).filter((z) => z.meta && z.meta.kind === 'sceneFill');
      let ink = 0;
      paths.forEach((z) => { for (let i = 1; i < z.length; i++) ink += Math.hypot(z[i].x - z[i - 1].x, z[i].y - z[i - 1].y); });
      return { paths: paths.length, inkMm: Math.round(ink) };
    }, { SPHERE, SUN, CAMERA, law });

    await p.evaluate(() => {
      const rr = window.app.renderer; rr.center();
      const rect = rr.canvas.getBoundingClientRect();
      const cx = rect.width / 2; const cy = rect.height / 2; const k = 2.4;
      rr.offsetX = cx - (cx - rr.offsetX) * k; rr.offsetY = cy - (cy - rr.offsetY) * k;
      rr.scale *= k; rr.userHasManipulated = true; rr.draw();
    });
    await p.waitForTimeout(350);
    const shots = await p.evaluate(() => {
      const c = document.querySelector('#main-canvas');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const corner = d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114;
      let a = 1e9; let bq = 1e9; let cq = -1e9; let dq = -1e9;
      for (let y = 0; y < c.height; y += 1) {
        for (let x = 0; x < c.width; x += 1) {
          const i = (y * c.width + x) * 4;
          const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          if (Math.abs(L - corner) < 90) continue;
          if (x < a) a = x; if (x > cq) cq = x; if (y < bq) bq = y; if (y > dq) dq = y;
        }
      }
      const crop = (sx, sy, sw, sh, maxPx) => {
        const o = document.createElement('canvas');
        const k = Math.min(1, maxPx / Math.max(sw, sh));
        o.width = Math.round(sw * k); o.height = Math.round(sh * k);
        o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
        return o.toDataURL('image/png');
      };
      const w = cq - a + 20; const h = dq - bq + 20;
      // MID BAND: the middle third in x, full height — the band that collapsed.
      const mx = a - 10 + w / 3; const mw = w / 3;
      return { full: crop(a - 10, bq - 10, w, h, 1100), mid: crop(mx, bq - 10, mw, h, 900) };
    });
    fs.writeFileSync(path.join(out, `${PREFIX}-${law}.png`), Buffer.from(shots.full.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(out, `${PREFIX}mid-${law}.png`), Buffer.from(shots.mid.split(',')[1], 'base64'));
    console.log(law, JSON.stringify(info));
  }
  await b.close();
})();
