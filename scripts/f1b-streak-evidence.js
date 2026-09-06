/* F1B — CURRENT-STATE evidence for the five self-crossing laws' residual
 * streaks (docs/stroke-fill-handoff.md item A). NO FIX LANDED IN THIS UNIT —
 * see docs/3d-audit/handoff/unit-a-notes.md. This script therefore captures
 * ONE state (the defect as it stands), not a before/after pair: a
 * byte-identical before/after would be meaningless, and a fabricated
 * "after" would misrepresent unlanded work.
 *
 *   node scripts/f1b-streak-evidence.js <url> <outDir> <law> [law ...]
 *
 * Scene: torus, default 3/4 camera (untouched — engine.addLayer('scene3d')'s
 * own default), one directional light, ground/backdrop off, fillAngle 0,
 * fillDensity 60. For each law: <law>-full.png (object-only, cropped to
 * content) and <law>-band.png (a crop of the upper-left quadrant, where the
 * streaks were reported clustering). Dumps
 * Vectura.Scene3D.SurfaceFill.lastRibbonStats per law into stats.json.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const URL = process.argv[2] || 'http://localhost:8471';
const OUT_DIR = process.argv[3] || path.resolve(__dirname, '..', 'docs', '3d-audit', 'handoff', 'unit-a');
const LAWS = process.argv.slice(4).length ? process.argv.slice(4)
  : ['interlockWeave', 'onePenDown', 'trochoidLoop', 'ampSpacing', 'weaveDepth'];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await page.goto(`${URL}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  console.log('version', await page.evaluate(() => window.Vectura.APP_VERSION));

  const allStats = {};
  const allTiming = {};

  for (const law of LAWS) {
    const info = await page.evaluate(({ law: toneLaw }) => {
      const e = window.app.engine;
      e.layers = [];
      const groupId = e.addLayer('scene3d');
      const group = e.layers.find((l) => l.id === groupId);
      const obj = e.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = 'torus';
      obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
      obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw, fillAngle: 0, fillDensity: 60 };
      // Ground/backdrop are child layers of the scene3d group (sceneGround3d
      // / sceneBackdrop3d), not plain params flags — drop them so the shot is
      // object-only.
      e.layers = e.layers.filter((l) => l.parentId !== groupId
        || (l.type !== 'sceneGround3d' && l.type !== 'sceneBackdrop3d'));
      const t0 = performance.now();
      e.computeAllDisplayGeometry();
      const elapsedMs = performance.now() - t0;
      window.app.render();
      const stats = { ...(window.Vectura.Scene3D.SurfaceFill.lastRibbonStats || {}) };
      return { elapsedMs, stats, groupId };
    }, { law });
    allStats[law] = info.stats;
    allTiming[law] = info.elapsedMs;

    await page.evaluate(() => {
      const rr = window.app.renderer; rr.center();
      const rect = rr.canvas.getBoundingClientRect();
      const cx = rect.width / 2; const cy = rect.height / 2; const k = 2.4;
      rr.offsetX = cx - (cx - rr.offsetX) * k; rr.offsetY = cy - (cy - rr.offsetY) * k;
      rr.scale *= k; rr.userHasManipulated = true; rr.draw();
    });
    await page.waitForTimeout(350);

    const shots = await page.evaluate(() => {
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
      const full = crop(Math.max(0, a - 10), Math.max(0, bq - 10), w, h, 1400);
      // Upper-left quadrant of the object bbox — where the reported streaks cluster.
      const bw = w / 2; const bh = h / 2;
      const band = crop(Math.max(0, a - 10), Math.max(0, bq - 10), bw, bh, 1400);
      return { full, band };
    });
    fs.writeFileSync(path.join(OUT_DIR, `${law}-full.png`), Buffer.from(shots.full.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT_DIR, `${law}-band.png`), Buffer.from(shots.band.split(',')[1], 'base64'));
    console.log(law, 'stats', JSON.stringify(info.stats), 'elapsedMs', Math.round(info.elapsedMs));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'stats.json'), JSON.stringify({ stats: allStats, timingMs: allTiming }, null, 2));
  await browser.close();
})();
