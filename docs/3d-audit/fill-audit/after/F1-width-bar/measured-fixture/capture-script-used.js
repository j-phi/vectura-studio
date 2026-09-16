#!/usr/bin/env node
'use strict';

/*
 * F1-width-bar-reshoot — BESPOKE capture script.
 *
 * Why bespoke: MAIN's scripts/audit/scene3d-capture.js hardcodes
 * `fillAngle: 45` as a literal in BOTH its `--rig create` (line ~313) and
 * `--rig addLayer` (line ~280) construction branches, unconditionally, with
 * no CLI flag to omit or override it. There is therefore NO cell anywhere in
 * the gallery manifest shot at an unset fillAngle -- confirmed by reading the
 * script source, not inferred. Per the task brief, this script replicates
 * F1-width-bar's own MEASURED fixture instead: the EXACT construction
 * `tests/helpers/scene3d-ribbon-width.js`'s `measureRibbonWidth()` uses --
 * addLayer rig, torus/hatch, toneLaw set per cell, NO fillAngle key, NO
 * fillDensity override (both left absent, exactly as the impl report's
 * canonical script leaves them) -- driven through a REAL browser page (via
 * MAIN's own ensureServer/openPage/getConstants helpers, required from
 * scene3d-capture.js so page bootstrap is identical to the gallery's own)
 * instead of jsdom, so it can also produce a screenshot.
 *
 * Ground is intentionally LEFT AT ITS DEFAULT (enabled: true, NOT hidden) --
 * unlike scene3d-capture.js's addLayer branch, which explicitly hides the
 * ground child for a clean object-only crop. This script does not hide it
 * either, because the measured fixture (measureRibbonWidth) never touches
 * ground -- hiding it here would silently diverge from the actual measured
 * construction. This is flagged explicitly in the output as a likely
 * candidate for the ~37% inkMm gap noted in F1-width-bar-review.md follow-up
 * 2, alongside (or instead of) fillAngle.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const CAPTURE = require(path.join(__dirname, 'scene3d-capture.js'));
const { ensureServer, openPage, getConstants } = CAPTURE;

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = {
    port: 8501, root: ROOT_DIR, out: 'docs/3d-audit/fill-audit/after/F1-width-bar/measured-fixture',
    laws: ['interlockWeave', 'trochoidLoop', 'onePenDown', 'amplitudeOnly'],
    primitive: 'torus', mapper: 'hatch',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--root') out.root = path.resolve(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--laws') out.laws = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

const FIXED_ZOOM = 3.6; // same convention as scene3d-capture.js -- not tuned per primitive

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
  }, { targetWidth: 800, quality: 1 });
}

// Build the EXACT measureRibbonWidth() fixture in-page, measure ink + width
// via the same buildRibbonMultiPolygon wrap the shared test helper uses, then
// render for a screenshot.
async function buildMeasureAndRender(page, { primitive, mapper, law }) {
  return page.evaluate(({ primitive, mapper, law }) => {
    const V = window.Vectura;
    const app = window.app;
    const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    const g = engine.layers.find((l) => l.id === gid);
    const obj = engine.getLayerDescendants(gid).filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = primitive;
    obj.params.style = obj.params.style || { penId: null, mapper, params: {} };
    obj.params.style.mapper = mapper;
    // Exactly measureRibbonWidth()'s construction: NO fillAngle key, NO
    // fillDensity override (both left absent -- resolved by the algorithm's
    // own finite(sp.fillAngle,45) / finite(sp.fillDensity,50) fallback at
    // generate time, not by this script).
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: law };
    // Ground/backdrop/camera: UNTOUCHED (ALGO_DEFAULTS.scene3d ground.enabled
    // = true, backdrop.enabled = false already, camera = DEFAULT_CAMERA) --
    // matching measureRibbonWidth exactly, unlike scene3d-capture.js's
    // addLayer branch which explicitly hides the ground child.

    const RGm = V.RibbonGeometry;
    const calls = [];
    const original = RGm && RGm.buildRibbonMultiPolygon;
    if (RGm && typeof original === 'function') {
      RGm.buildRibbonMultiPolygon = function wrapped(centre, half, rgOpts) {
        let lengthMm = 0;
        for (let i = 1; i < centre.length; i += 1) lengthMm += Math.hypot(centre[i].x - centre[i - 1].x, centre[i].y - centre[i - 1].y);
        calls.push({
          lengthMm,
          halfMean: (half && half.length) ? half.reduce((s, h) => s + h, 0) / half.length : 0,
          minHalfWidth: rgOpts && rgOpts.minHalfWidth,
        });
        return original.apply(this, arguments);
      };
    }

    let genError = null;
    try {
      engine.computeAllDisplayGeometry();
    } catch (e) {
      genError = String(e && e.stack || e);
    } finally {
      if (RGm && typeof original === 'function') RGm.buildRibbonMultiPolygon = original;
    }
    if (!genError) app.render();

    const stats = { ...((V.Scene3D && V.Scene3D.SurfaceFill && V.Scene3D.SurfaceFill.lastRibbonStats) || {}) };
    const penWidth = stats.penWidth || 0.3;
    const ribbonCalls = calls.filter((c) => Math.abs((c.minHalfWidth || 0) - penWidth / 2) < 1e-9);
    const totalRibbonLen = ribbonCalls.reduce((s, c) => s + c.lengthMm, 0);
    const meanRibbonWidthMm = totalRibbonLen > 0
      ? ribbonCalls.reduce((s, c) => s + c.lengthMm * (2 * c.halfMean), 0) / totalRibbonLen
      : null;

    const paths = g.scenePaths || [];
    let totalPoints = 0;
    let inkMm = 0;
    paths.forEach((p) => {
      if (!Array.isArray(p)) return;
      totalPoints += p.length;
      for (let i = 1; i < p.length; i += 1) inkMm += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    });

    return {
      genError,
      law,
      penWidth,
      ribbonStretchCount: ribbonCalls.length,
      meanRibbonWidthMm,
      meanRibbonWidthPen: meanRibbonWidthMm != null ? meanRibbonWidthMm / penWidth : null,
      pathCount: paths.length,
      totalPoints,
      inkMm, // full precision -- NOT rounded to 1dp like scene3d-capture.js's own field, for exact-digit comparison
      inkMmRounded: Math.round(inkMm * 10) / 10,
      groundEnabled: !!(g.params && g.params.ground && g.params.ground.enabled),
      fillAngleInParams: obj.params.style.params.fillAngle, // undefined -- confirms absent, not defaulted-here
      appVersion: V.APP_VERSION,
    };
  }, { primitive, mapper, law });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // args.out is a MAIN-relative docs path -- evidence must land in MAIN's
  // docs tree, not the throwaway scratch export this script itself runs from.
  const MAIN_ROOT = '/Users/jayphi/Documents/github/vectura-studio';
  const realOutDir = path.resolve(MAIN_ROOT, args.out);
  fs.mkdirSync(realOutDir, { recursive: true });
  fs.mkdirSync(path.join(realOutDir, 'shots'), { recursive: true });

  await ensureServer(args.port, args.root);
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const browser = await chromium.launch();
  const page = await openPage(browser, baseUrl);
  const consts = await getConstants(page);
  console.log('served version', consts.version, 'root', args.root);

  const results = [];
  for (const law of args.laws) {
    // eslint-disable-next-line no-await-in-loop
    const measure = await buildMeasureAndRender(page, { primitive: args.primitive, mapper: args.mapper, law });
    if (measure.genError) {
      console.log('ERROR', law, measure.genError);
      results.push(measure);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const shot = await frameAndCrop(page);
    let shotRel = null;
    if (!shot.empty) {
      const b64 = shot.dataUrl.split(',')[1];
      shotRel = path.join('shots', `${args.primitive}__${args.mapper}__${law}__med__a__addlayer__measured.png`);
      fs.writeFileSync(path.join(realOutDir, shotRel), Buffer.from(b64, 'base64'));
    }
    results.push({ ...measure, shot: shotRel, imgWidth: shot.width, imgHeight: shot.height });
    console.log(law, 'ink=', measure.inkMm.toFixed(3), 'width=', measure.meanRibbonWidthMm, 'shot=', shotRel);
  }

  fs.writeFileSync(path.join(realOutDir, 'measured-fixture-raw-results.json'), JSON.stringify({ port: args.port, root: args.root, primitive: args.primitive, mapper: args.mapper, results }, null, 2));

  await page.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
