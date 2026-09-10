#!/usr/bin/env node
/**
 * W-35 bespoke evidence sweep — sliceEndOverlap at k in {-2, 0, 4, 8} on
 * torus/sphere/ellipsoid, contourSlice mapper. The audit gallery has NO
 * param sweep (scene3d-capture.js:219 hard-codes fillAngle/fillDensity/
 * toneLaw only), so this is a standalone script, modelled on
 * scene3d-capture.js's buildAndMeasure/frameAndCrop (same rig: identity
 * transform, ortho camera, ladder toneLaw, sliceCount default 26).
 *
 * Captures the FULL canvas (not the gallery's 800px-capped crop) so the ring
 * ends can be cropped at native resolution afterward — protocol requires
 * looking at the defect region at native res, not a whole-cell downscale.
 *
 * Usage: node scripts/audit/w35-end-overlap-sweep.js --port 8481 --out <abs-dir>
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

function parseArgs(argv) {
  const out = { port: 8481, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port') out.port = Number(argv[++i]);
    else if (argv[i] === '--out') out.out = argv[++i];
  }
  return out;
}

const PRIMITIVES = ['sphere', 'ellipsoid', 'torus'];
const K_VALUES = [-2, 0, 4, 8];
const CAMERA_OVERRIDE = {}; // camera 'a' (app default)

async function buildAndMeasure(page, primitive, k) {
  return page.evaluate(({ primitive, k, cameraOverride }) => {
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
    q.camera = { ...P.DEFAULT_CAMERA, ...cameraOverride };
    q.ground = { enabled: false };
    q.backdrop = { enabled: false };
    const bag = { ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}) };
    const OBJ = {
      id: 'obj', name: 'Obj', primitive, params: bag,
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
    const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
    q.objects = [OBJ];
    q.lights = [SUN];
    const style = {
      penId: null, mapper: 'contourSlice',
      params: { sliceCount: 26, toneLaw: 'ladder', sliceEndOverlap: k },
    };
    q.styleTable = { scene: JSON.parse(JSON.stringify(style)), byObject: { obj: JSON.parse(JSON.stringify(style)) }, byFace: {} };

    let genError = null;
    try { engine.computeAllDisplayGeometry(); } catch (e) { genError = String((e && e.stack) || e); }
    if (!genError) app.render();

    const paths = (g.scenePaths || []);
    let totalPoints = 0; let inkMm = 0; let openRuns = 0; let closedRuns = 0;
    paths.forEach((p) => {
      if (!Array.isArray(p) || p.length < 2) return;
      totalPoints += p.length;
      for (let i = 1; i < p.length; i += 1) inkMm += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      const isClosed = Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6;
      if (isClosed) closedRuns += 1; else openRuns += 1;
    });
    return {
      genError, pathCount: paths.length, totalPoints,
      inkMm: Math.round(inkMm * 10) / 10, openRuns, closedRuns,
      appVersion: window.Vectura.APP_VERSION,
    };
  }, { primitive, k, cameraOverride: CAMERA_OVERRIDE });
}

const FIXED_ZOOM = 3.6;

async function frameAndCapture(page) {
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
  }, FIXED_ZOOM);
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const c = document.querySelector('#main-canvas');
    return c.toDataURL('image/png');
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error('--out <abs-dir> required');
  fs.mkdirSync(args.out, { recursive: true });
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });

  const report = { appVersion: null, shots: [] };
  for (const primitive of PRIMITIVES) {
    for (const k of K_VALUES) {
      const measure = await buildAndMeasure(page, primitive, k);
      report.appVersion = measure.appVersion;
      const dataUrl = await frameAndCapture(page);
      const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      const fname = `${primitive}__contourSlice__k${k}.png`;
      fs.writeFileSync(path.join(args.out, fname), Buffer.from(b64, 'base64'));
      console.log('shot', fname, JSON.stringify(measure));
      report.shots.push({ primitive, k, file: fname, ...measure });
    }
  }
  fs.writeFileSync(path.join(args.out, 'sweep-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
