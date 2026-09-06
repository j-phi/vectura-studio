#!/usr/bin/env node
/* W-27c 0(a) diagnostic probe — read-only. Reproduces the audit cell
   torus__contourSlice__ladder__med__a and captures BOTH the emitted
   scenePaths (device mm) AND what the renderer actually strokes (canvas px). */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/jayphi/Documents/github/vectura-studio/node_modules/@playwright/test');

const PORT = Number(process.argv[2] || 8517);
const OUT = process.argv[3] || '/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad/out0a';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });

  const consts = await page.evaluate(() => {
    const P = window.Vectura.Scene3D.Params;
    return {
      version: window.Vectura.APP_VERSION,
      DEFAULT_CAMERA: { ...P.DEFAULT_CAMERA },
      DEFAULT_FILL_STYLE: (window.Vectura.SCENE_FILL_STYLES && window.Vectura.SCENE_FILL_STYLES.DEFAULT) || 'ladder',
      torusDefaults: { ...(P.PRIMITIVE_PARAM_DEFAULTS.torus || {}) },
      CURVED: Array.from(P.CURVED_FILL_PRIMITIVES || []),
    };
  });
  console.log('VERSION', consts.version, 'camera', JSON.stringify(consts.DEFAULT_CAMERA));
  console.log('torus defaults', JSON.stringify(consts.torusDefaults));

  // Build the exact audit cell.
  const built = await page.evaluate(({ camera, style }) => {
    const P = window.Vectura.Scene3D.Params;
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const q = g.params;
    q.camera = camera; q.ground = { enabled: false }; q.backdrop = { enabled: false };
    const bag = { ...(P.PRIMITIVE_PARAM_DEFAULTS.torus || {}) };
    q.objects = [{ id: 'obj', name: 'Obj', primitive: 'torus', params: bag,
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
    q.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }];
    const st = { penId: null, mapper: 'contourSlice', params: { fillAngle: 45, fillDensity: 50, toneLaw: style } };
    q.styleTable = { scene: JSON.parse(JSON.stringify(st)), byObject: { obj: JSON.parse(JSON.stringify(st)) }, byFace: {} };
    engine.computeAllDisplayGeometry();
    app.render();
    // curve-finish relevant flags
    const SC = window.Vectura.Scene3D.StyleCascade;
    const sp = SC.resolve(q.styleTable, { objectId: 'obj' }).params || {};
    return {
      gid,
      pathCount: (g.scenePaths || []).length,
      curveFlags: {
        sceneCurves: q.curves, sceneSmoothing: q.smoothing, sceneSimplify: q.simplify,
        objCurves: q.objects[0].params.curves, objSmoothing: q.objects[0].params.smoothing,
        fillCurves: sp.fillCurves, fillSmoothing: sp.fillSmoothing, fillSimplify: sp.fillSimplify,
      },
    };
  }, { camera: consts.DEFAULT_CAMERA, style: consts.DEFAULT_FILL_STYLE });
  console.log('built', JSON.stringify(built));

  // Audit framing (FIXED_ZOOM 3.6), then capture the renderer's actual strokes.
  const capture = await page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2; const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k;
    r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k; r.userHasManipulated = true;

    // Monkeypatch the 2D context to record every stroked subpath in CSS px.
    const ctx = r.canvas.getContext('2d');
    const rec = [];
    let cur = null;
    const orig = {};
    ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'closePath', 'beginPath', 'stroke', 'fill', 'rect', 'setTransform'].forEach((m) => { orig[m] = ctx[m].bind(ctx); });
    let xf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const P = (x, y) => ({ x: xf.a * x + xf.c * y + xf.e, y: xf.b * x + xf.d * y + xf.f });
    ctx.setTransform = function (a, b, c, d, e, f) { if (typeof a === 'object') xf = { ...a }; else xf = { a, b, c, d, e, f }; return orig.setTransform(a, b, c, d, e, f); };
    ctx.beginPath = function () { cur = null; return orig.beginPath(); };
    ctx.moveTo = function (x, y) { cur = { pts: [P(x, y)], curves: 0 }; rec.push(cur); return orig.moveTo(x, y); };
    ctx.lineTo = function (x, y) { if (cur) cur.pts.push(P(x, y)); return orig.lineTo(x, y); };
    ctx.bezierCurveTo = function (x1, y1, x2, y2, x, y) {
      if (cur) {
        // flatten the bezier finely so measured turns reflect the drawn curve
        const p0 = cur.pts[cur.pts.length - 1];
        const c1 = P(x1, y1); const c2 = P(x2, y2); const p3 = P(x, y);
        const N = 24;
        for (let i = 1; i <= N; i++) {
          const t = i / N; const u = 1 - t;
          cur.pts.push({
            x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
            y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
          });
        }
        cur.curves += 1;
      }
      return orig.bezierCurveTo(x1, y1, x2, y2, x, y);
    };
    ctx.quadraticCurveTo = function (x1, y1, x, y) { if (cur) { cur.pts.push(P(x1, y1)); cur.pts.push(P(x, y)); cur.curves += 1; } return orig.quadraticCurveTo(x1, y1, x, y); };
    ctx.closePath = function () { if (cur && cur.pts.length) cur.pts.push({ ...cur.pts[0] }); return orig.closePath(); };

    r.draw();

    ['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'beginPath', 'setTransform'].forEach((m) => { ctx[m] = orig[m]; });

    const g = window.app.engine.layers.find((l) => l.containerRole === 'scene');
    const scenePaths = (g.scenePaths || []).map((p) => ({
      n: p.length,
      kind: p.meta && p.meta.kind,
      objectId: p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId,
      closed: !!(p.meta && p.meta.closed),
      straight: !!(p.meta && p.meta.straight),
      anchors: !!(p.meta && p.meta.anchors),
      pts: p.map((q) => ({ x: q.x, y: q.y })),
    }));
    return {
      scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY, dpr: window.devicePixelRatio,
      canvasW: r.canvas.width, canvasH: r.canvas.height,
      cssW: r.canvas.getBoundingClientRect().width,
      strokes: rec.map((s) => ({ n: s.pts.length, curves: s.curves, pts: s.pts })),
      scenePaths,
    };
  }, 3.6);

  console.log('scale(px per mm, css)', capture.scale, 'dpr', capture.dpr, 'strokes', capture.strokes.length, 'scenePaths', capture.scenePaths.length);
  fs.writeFileSync(path.join(OUT, 'capture.json'), JSON.stringify(capture));
  await page.screenshot({ path: path.join(OUT, 'full.png') });
  await browser.close();
})();
