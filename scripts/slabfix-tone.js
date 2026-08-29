/* SLAB FIX — mid-band tone, NEW vs BASE, measured in the running app.
 *   node scripts/slabfix-tone.js <newUrl> <baseUrl> <outDir>
 * Same scene, same rasterisation and the same 5 mm windows as
 * scripts/judge-c-tone.js, reduced to the LEFT / MID / RIGHT thirds that the
 * slab collapse showed up in.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const NEW_URL = process.argv[2] || 'http://localhost:8414';
const BASE_URL = process.argv[3] || 'http://localhost:8415';
const outDir = process.argv[4] || path.resolve(__dirname, '..', 'docs', 'slab-fix-evidence');

const SPHERE = { id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 46, detail: 26 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 30, intensity: 1, castShadows: false };
const CAMERA = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

const LAWS = ['onePenDown', 'trochoidLoop', 'interlockWeave', 'weaveDepth', 'ampSpacing', 'taperedEnds'];

async function measure(page, law) {
  return page.evaluate(async ({ SPHERE, SUN, CAMERA, law }) => {
    const engine = window.app.engine;
    const PEN = 0.3;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: false }; p.backdrop = { enabled: false };
    p.objects = [SPHERE]; p.lights = [SUN];
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: law } };
    p.styleTable = { scene: JSON.parse(JSON.stringify(base)), byObject: { ball: JSON.parse(JSON.stringify(base)) }, byFace: {} };
    const t0 = performance.now();
    engine.computeAllDisplayGeometry();
    const buildMs = Math.round(performance.now() - t0);

    const paths = (g.scenePaths || []).filter((q) => q.meta && q.meta.kind === 'sceneFill');
    let ink = 0;
    paths.forEach((q) => { for (let i = 1; i < q.length; i++) ink += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y); });

    let minx = 1e9; let miny = 1e9; let maxx = -1e9; let maxy = -1e9;
    paths.forEach((q) => q.forEach((pt) => {
      if (pt.x < minx) minx = pt.x; if (pt.x > maxx) maxx = pt.x;
      if (pt.y < miny) miny = pt.y; if (pt.y > maxy) maxy = pt.y;
    }));
    const PPM = 10; const pad = 2;
    const W = Math.ceil((maxx - minx + pad * 2) * PPM);
    const H = Math.ceil((maxy - miny + pad * 2) * PPM);
    const X = (v) => (v - minx + pad) * PPM;
    const Y = (v) => (v - miny + pad) * PPM;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const bits = (c) => {
      const d = c.getContext('2d').getImageData(0, 0, W, H).data;
      const b = new Uint8Array(W * H);
      for (let i = 0, j = 0; i < b.length; i++, j += 4) b[i] = d[j + 3] > 96 ? 1 : 0;
      return b;
    };
    const cx = (minx + maxx) / 2; const cy = (miny + maxy) / 2;
    const R = Math.min(maxx - minx, maxy - miny) / 2;
    const mc = mk(); const mctx = mc.getContext('2d');
    mctx.fillStyle = '#000'; mctx.beginPath(); mctx.arc(X(cx), Y(cy), R * PPM, 0, Math.PI * 2); mctx.fill();
    const mask = bits(mc);

    const ic = mk(); const ix = ic.getContext('2d');
    ix.lineCap = 'round'; ix.lineJoin = 'round'; ix.strokeStyle = '#000';
    paths.forEach((q) => {
      const w = Number.isFinite(Number(q.meta.weightScale)) ? Number(q.meta.weightScale) : 1;
      ix.lineWidth = Math.max(0.6, PEN * w * PPM);
      ix.beginPath(); ix.moveTo(X(q[0].x), Y(q[0].y));
      for (let i = 1; i < q.length; i++) ix.lineTo(X(q[i].x), Y(q[i].y));
      ix.stroke();
    });
    const ink1 = bits(ic);

    const win = Math.round(5 * PPM);
    const band = [{ m: 0, k: 0 }, { m: 0, k: 0 }, { m: 0, k: 0 }];
    let tm = 0; let tk = 0;
    for (let by = 0; by + win <= H; by += win) {
      for (let bx = 0; bx + win <= W; bx += win) {
        let m = 0; let k = 0;
        for (let y = by; y < by + win; y++) {
          for (let x = bx; x < bx + win; x++) {
            const i = y * W + x; if (mask[i]) { m++; if (ink1[i]) k++; }
          }
        }
        if (m <= win * win * 0.9) continue;
        const mmx = bx / PPM + minx - pad + 2.5;
        const b = mmx < cx - R / 3 ? 0 : (mmx > cx + R / 3 ? 2 : 1);
        band[b].m += m; band[b].k += k; tm += m; tk += k;
      }
    }
    const f = (o) => (o.m ? +(o.k / o.m).toFixed(4) : null);
    return { law, buildMs, paths: paths.length, inkMm: +ink.toFixed(0),
      left: f(band[0]), mid: f(band[1]), right: f(band[2]), all: +(tk / Math.max(1, tm)).toFixed(4) };
  }, { SPHERE, SUN, CAMERA, law });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const open = async (url) => {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    pg.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
    await pg.goto(`${url}/index.html`, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
    return pg;
  };
  const out = { newBuild: {}, base: {} };
  const pn = await open(NEW_URL);
  console.log('new version', await pn.evaluate(() => window.Vectura.APP_VERSION));
  for (const law of LAWS) { const r = await measure(pn, law); out.newBuild[law] = r; console.log('NEW ', law.padEnd(15), JSON.stringify(r)); }
  await pn.close();
  const pb = await open(BASE_URL);
  console.log('base version', await pb.evaluate(() => window.Vectura.APP_VERSION));
  for (const law of LAWS) { const r = await measure(pb, law); out.base[law] = r; console.log('BASE', law.padEnd(15), JSON.stringify(r)); }
  await pb.close();
  fs.writeFileSync(path.join(outDir, 'tone.json'), JSON.stringify(out, null, 2));
  await browser.close();
})();
