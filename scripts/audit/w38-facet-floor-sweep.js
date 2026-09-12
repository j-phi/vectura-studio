#!/usr/bin/env node
/**
 * W-38 (F-14b) — "Min rulings" (facetMinRulings) bespoke sweep.
 *
 * Copies `buildAndMeasure`/`frameAndCrop` from scripts/audit/scene3d-capture.js
 * verbatim in mechanism, adding `facetMinRulings` to the style bag so the
 * fixed gallery capture script (which hard-codes its style bag) can be
 * swept across the new control's own range.
 *
 * Shoots box and solid (NOT pyramid — measured inert at every control value
 * and every density, docs/3d-audit/lane-reports/W-38-plan.md §2.2) at
 * control in {1, 2, 3, 5, 8}, fillDensity 50, fillAngle 45, camera 'a', the
 * same FIXED_ZOOM framing scene3d-capture.js uses.
 *
 *   node scripts/audit/w38-facet-floor-sweep.js --root <worktree> --port <port> \
 *     --out docs/3d-audit/fill-audit/after/W-38/bespoke
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = { port: 8460, out: 'docs/3d-audit/fill-audit/after/W-38/bespoke' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--root') out.root = path.resolve(argv[++i]);
  }
  return out;
}

function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/index.html', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureServer(port, root = ROOT) {
  if (await pingServer(port)) return { started: false };
  const child = spawn('node', [path.join(root, 'scripts/dev-server.js'), String(port)], {
    cwd: root, stdio: 'ignore', detached: true,
  });
  child.unref();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await pingServer(port)) return { started: true };
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev-server on port ${port} did not come up in time`);
}

async function openPage(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  return page;
}

async function buildAndMeasure(page, { primitive, control }) {
  return page.evaluate(({ primitive, control }) => {
    const P = window.Vectura.Scene3D.Params;
    const app = window.app;
    const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true;
    g.containerRole = 'scene';
    const q = g.params;
    q.camera = { ...P.DEFAULT_CAMERA };
    q.ground = { enabled: false };
    q.backdrop = { enabled: false };
    const bag = {
      ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}),
      ...(P.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}),
    };
    if (primitive === 'solid') bag.solidType = P.PRIMITIVE_PARAM_DEFAULTS.solid.solidType || 'buckyball';
    const OBJ = {
      id: 'obj', name: 'Obj', primitive, params: bag,
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
    const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
    q.objects = [OBJ];
    q.lights = [SUN];
    const style = {
      penId: null, mapper: 'hatch',
      params: { fillAngle: 45, fillDensity: 50, toneLaw: 'ladder', facetMinRulings: control },
    };
    q.styleTable = { scene: JSON.parse(JSON.stringify(style)), byObject: { obj: JSON.parse(JSON.stringify(style)) }, byFace: {} };

    const t0 = performance.now();
    let genError = null;
    try {
      engine.computeAllDisplayGeometry();
    } catch (e) {
      genError = String((e && e.stack) || e);
    }
    const genMs = Math.round(performance.now() - t0);
    if (!genError) app.render();

    const paths = (g.scenePaths || []);
    let totalPoints = 0;
    let inkMm = 0;
    // Per-face ruling counts on the two lit facets, for the report.
    const rulingsByFace = {};
    paths.forEach((p) => {
      if (!Array.isArray(p)) return;
      totalPoints += p.length;
      for (let i = 1; i < p.length; i += 1) inkMm += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      const m = p.meta || {};
      const t = m.sceneTarget || {};
      if (m.kind === 'sceneFill' && t.objectId === 'obj' && !t.occluded && t.faceId) {
        rulingsByFace[t.faceId] = (rulingsByFace[t.faceId] || 0) + 1;
      }
    });

    return {
      genError,
      genMs,
      pathCount: paths.length,
      totalPoints,
      inkMm: Math.round(inkMm * 10) / 10,
      rulingsByFace,
      appVersion: window.Vectura.APP_VERSION,
    };
  }, { primitive, control });
}

const FIXED_ZOOM = 3.6;

async function frameAndCrop(page) {
  await page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k;
    r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k;
    r.userHasManipulated = true;
    r.draw();
  }, FIXED_ZOOM);
  await page.waitForTimeout(120);
  return page.evaluate(({ targetWidth, quality }) => {
    const c = document.querySelector('#main-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const corner = d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114;
    let minx = 1e9; let miny = 1e9; let maxx = -1e9; let maxy = -1e9;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (Math.abs(L - corner) < 90) continue;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
    if (maxx < minx || maxy < miny) return { empty: true };
    const pad = 12;
    const sx = Math.max(0, minx - pad);
    const sy = Math.max(0, miny - pad);
    const sw = Math.min(c.width - sx, (maxx - minx) + 2 * pad);
    const sh = Math.min(c.height - sy, (maxy - miny) + 2 * pad);
    const k = Math.min(1, targetWidth / sw);
    const o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(sw * k));
    o.height = Math.max(1, Math.round(sh * k));
    const g = o.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
    return { dataUrl: o.toDataURL('image/png'), width: o.width, height: o.height };
  }, { targetWidth: 1600, quality: 1 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });

  await ensureServer(args.port, args.root || ROOT);
  const baseUrl = `http://127.0.0.1:${args.port}`;

  const browser = await chromium.launch();
  const page = await openPage(browser, baseUrl);

  const report = [];
  const PRIMITIVES = ['box', 'solid'];
  const CONTROLS = [1, 2, 3, 5, 8];

  for (const primitive of PRIMITIVES) {
    for (const control of CONTROLS) {
      // eslint-disable-next-line no-await-in-loop
      const measure = await buildAndMeasure(page, { primitive, control });
      // eslint-disable-next-line no-await-in-loop
      const shot = await frameAndCrop(page);
      const rel = `${primitive}__control${control}.png`;
      if (!shot.empty) {
        const b64 = shot.dataUrl.split(',')[1];
        fs.writeFileSync(path.join(outDir, rel), Buffer.from(b64, 'base64'));
      }
      const record = { primitive, control, ...measure, shot: shot.empty ? null : rel };
      report.push(record);
      console.log(primitive, 'control', control, JSON.stringify(measure.rulingsByFace), 'ink', measure.inkMm);
    }
  }

  fs.writeFileSync(path.join(outDir, 'sweep-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
