'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/jayphi/Documents/github/vectura-studio/node_modules/@playwright/test');
const PORT = Number(process.argv[2] || 8517);
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });

  const info = await page.evaluate(() => {
    const P = window.Vectura.Scene3D.Params; const app = window.app; const engine = app.engine;
    engine.layers = []; const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const q = g.params; q.camera = { ...P.DEFAULT_CAMERA }; q.ground = { enabled: false }; q.backdrop = { enabled: false };
    q.objects = [{ id: 'obj', name: 'Obj', primitive: 'torus', params: { ...P.PRIMITIVE_PARAM_DEFAULTS.torus },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
    q.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }];
    const st = { penId: null, mapper: 'contourSlice', params: { fillAngle: 45, fillDensity: 50, toneLaw: 'ladder' } };
    q.styleTable = { scene: JSON.parse(JSON.stringify(st)), byObject: { obj: JSON.parse(JSON.stringify(st)) }, byFace: {} };
    engine.computeAllDisplayGeometry(); app.render();
    // audit framing
    const r = app.renderer; r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2, k = 3.6;
    r.offsetX = cx - (cx - r.offsetX) * k; r.offsetY = cy - (cy - r.offsetY) * k; r.scale *= k; r.userHasManipulated = true;
    // record the lineWidths the renderer actually uses
    const ctx = r.canvas.getContext('2d');
    const seen = [];
    const origStroke = ctx.stroke.bind(ctx);
    ctx.stroke = function () { seen.push(ctx.lineWidth); return origStroke(); };
    r.draw();
    ctx.stroke = origStroke;
    const uniq = Array.from(new Set(seen.map((w) => Math.round(w * 1000) / 1000)));
    return { lineWidths: uniq, scale: r.scale, strokes: seen.length };
  });
  console.log('renderer lineWidths (canvas units)', JSON.stringify(info.lineWidths), 'scale', info.scale.toFixed(3));
  await page.locator('#main-canvas').screenshot({ path: path.join(OUT, 'a-normal.png') });

  // hairline, per-path colour cycling overlay on a black canvas
  await page.evaluate(() => {
    const r = window.app.renderer;
    const g = window.app.engine.layers.find((l) => l.containerRole === 'scene');
    const ctx = r.canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
    const COL = ['#ff5252', '#4fc3f7', '#ffd54f', '#81c784', '#ba68c8', '#ff8a65', '#e0e0e0', '#26c6da'];
    (g.scenePaths || []).forEach((p, pi) => {
      ctx.strokeStyle = COL[pi % COL.length];
      ctx.lineWidth = 1;
      ctx.beginPath();
      p.forEach((q, i) => {
        const sx = (q.x * r.scale + r.offsetX) * dpr;
        const sy = (q.y * r.scale + r.offsetY) * dpr;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    });
    ctx.restore();
  });
  await page.locator('#main-canvas').screenshot({ path: path.join(OUT, 'b-hairline-colored.png') });
  console.log('done');
  await browser.close();
})();
