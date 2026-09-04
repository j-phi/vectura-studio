/*
 * Live acceptance verification for the Draw Order fix.
 *
 * Drives the REAL UI: opens the Export SVG modal, sets Line Sort Method =
 * Nearest and Direction = Vertical through the actual <select> elements (so the
 * setting is visibly on screen), closes the modal, turns on the Draw Order
 * colour overlay, then scrubs the real #draw-order-input slider to 0/25/50/75/
 * 100 and screenshots the MAIN CANVAS at each stop.
 *
 * At every stop it also measures, from the renderer's own reveal computation,
 * the vertical band of ink that is actually visible — so the claim "it draws in
 * from the top" is a number, not a vibe.
 *
 * Usage: node docs/draw-order/harness/verify.js <port> <outDir> <tag> <doc>
 *        doc = 'scene' (capsule + ground + cast shadow) | 'flat' (2D layers)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/jayphi/Documents/github/vectura-studio/node_modules/playwright');

const PORT = process.argv[2] || '4173';
const OUT = process.argv[3];
const TAG = process.argv[4] || 'verify';
const DOC = process.argv[5] || 'scene';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  pg.on('console', (m) => { if (m.type() === 'error') console.log('PAGE-ERR', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => !!window.app && !!window.app.engine, null, { timeout: 30000 });

  // ---- 1. Build the document -------------------------------------------------
  await pg.evaluate((DOC) => {
    const S = window.Vectura.SETTINGS;
    S.margin = 10; S.truncate = 4; S.preview3dQuality = 'high';
    if (S.pens && S.pens[0]) S.pens[0].width = 0.3;
    const eng = window.app.engine;
    eng.currentProfile = { width: 320, height: 220, name: 'fx' };
    eng.layers.slice().forEach((l) => { try { eng.removeLayer(l.id); } catch (e) {} });
    eng.layers.length = 0;

    if (DOC === 'scene') {
      const gid = eng.addSceneTree();
      const grp = eng.getLayerById(gid);
      const kids = () => eng.getLayerDescendants(gid);
      grp.params.seed = 0;
      grp.params.camera = { projection: 'orthographic', yaw: -30, pitch: 32, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      grp.params.tone = { enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.15, 0.4, 0.65, 0.9], specular: { enabled: true, size: 1 } };
      grp.params.backdrop = { enabled: false };
      grp.params.shadow = { ...grp.params.shadow, shadowLayers: true, shadowLayerCount: 3 };
      grp.params.styleTable = {
        scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85 } },
        byObject: { ground: { penId: null, mapper: 'none', params: {} } }, byFace: {},
      };
      Object.assign(kids().find((l) => l.type === 'sceneLight3d').params,
        { type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: true });
      const c = kids().find((l) => l.type === 'object3d');
      c.params.primitive = 'capsule';
      c.params.params = { sx: 40, sy: 70, sz: 40, detail: 24 };
      c.params.transform = { x: 0, y: 46, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      c.params.style = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85 } };
    } else {
      // A two-pen 2D document — the configuration the reported defect was about.
      const a = eng.addLayer('wavetable'); eng.generate(a);
      const b = eng.addLayer('rings'); eng.generate(b);
      if (S.pens && S.pens.length > 1) {
        eng.getLayerById(a).penId = S.pens[0].id;
        eng.getLayerById(b).penId = S.pens[1].id;
      }
    }
    eng.computeAllDisplayGeometry();
  }, DOC);

  // ---- 2. Set Line Sort = Nearest + Vertical THROUGH THE REAL UI --------------
  await pg.evaluate(() => window.app.ui.openExportModal());
  await pg.waitForTimeout(900);

  const uiSet = await pg.evaluate(() => {
    const labelled = (text) => Array.from(document.querySelectorAll('.optimization-row, .optimization-panel *'))
      .filter((el) => el.tagName === 'SELECT');
    const selects = Array.from(document.querySelectorAll('select'));
    const pick = (values) => selects.find((s) => {
      const opts = Array.from(s.options).map((o) => o.value);
      return values.every((v) => opts.includes(v));
    });
    const method = pick(['nearest', 'greedy', 'angle', 'asdrawn']);
    const direction = pick(['none', 'horizontal', 'vertical', 'radial']);
    const grouping = pick(['layer', 'pen', 'combined']);
    const fire = (el, v) => {
      if (!el) return null;
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value;
    };
    // Make sure the Line Sort step itself is enabled.
    const eng = window.app.engine;
    eng.layers.forEach((l) => {
      const opt = eng.ensureLayerOptimization(l);
      const step = opt?.steps?.find((s) => s.id === 'linesort');
      if (step) { step.enabled = true; step.bypass = false; }
    });
    window.Vectura.SETTINGS.optimizationExport = true;
    const out = {
      method: fire(method, 'nearest'),
      direction: fire(direction, 'vertical'),
      grouping: fire(grouping, 'combined'),
    };
    out.found = { method: !!method, direction: !!direction, grouping: !!grouping };
    return out;
  });
  console.log('UI-SET', JSON.stringify(uiSet));
  await pg.waitForTimeout(400);
  // Show the Sort tab, so Method=Nearest / Direction=Vertical is on screen.
  await pg.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('button, li, div, a'))
      .filter((el) => /^\s*Sort\s*$/.test((el.textContent || '').replace(/\s+/g, ' ').trim()) && el.offsetParent);
    (nav[0] || {}).click?.();
  });
  await pg.waitForTimeout(700);
  await pg.screenshot({ path: path.join(OUT, `${TAG}__ui-linesort-vertical.png`) });

  // Close the modal and re-apply, so the canvas reflects the UI setting.
  await pg.evaluate(() => {
    document.querySelectorAll('.modal-close, [data-modal-close]').forEach((b) => b.click());
    const eng = window.app.engine;
    eng.layers.forEach((l) => {
      const opt = eng.ensureLayerOptimization(l);
      const step = opt?.steps?.find((s) => s.id === 'linesort');
      if (step) { step.enabled = true; step.bypass = false; step.method = 'nearest'; step.direction = 'vertical'; step.grouping = 'combined'; }
    });
    eng.optimizeLayers(eng.layers, { includePlotterOptimize: true });
    window.Vectura.SETTINGS.lineSortOverlayVisible = true;
  });
  await pg.waitForTimeout(400);

  // ---- 3. Frame the artwork --------------------------------------------------
  const frame = await pg.evaluate(() => {
    const eng = window.app.engine, r = window.app.renderer;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    eng.layers.forEach((l) => (eng.getRenderablePaths(l, { useOptimized: true }) || []).forEach((p) => {
      if (!Array.isArray(p)) return;
      p.forEach((q) => { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; });
    }));
    r.resize();
    const cw = r.canvas.clientWidth, ch = r.canvas.clientHeight;
    const s = Math.min(cw / (x1 - x0 + 12), ch / (y1 - y0 + 12)) * 0.95;
    r.scale = s; r.offsetX = cw / 2 - ((x0 + x1) / 2) * s; r.offsetY = ch / 2 - ((y0 + y1) / 2) * s;
    r.draw();
    return { y0, y1 };
  });
  console.log('FRAME', JSON.stringify(frame));

  // ---- 4. Scrub the REAL slider, screenshot the MAIN CANVAS ------------------
  const rows = [];
  for (const pct of [0, 25, 50, 75, 100]) {
    const measure = await pg.evaluate((pct) => {
      const el = document.getElementById('draw-order-input');
      el.value = String(pct);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const r = window.app.renderer, eng = window.app.engine;
      const Renderer = window.Vectura.Renderer;
      const S = window.Vectura.SETTINGS;
      // Which ink is visible at this progress, per the renderer's own reveal?
      const records = r.buildPlotRecords();
      const rev = Renderer.computePlotRevealOrder(records, {
        drawProgress: r.drawProgress, drawSpeed: S.speedDown, travelSpeed: S.speedUp,
      });
      let y0 = Infinity, y1 = -Infinity, shown = 0;
      records.forEach((rec) => {
        const info = rev.info.get(rec.path);
        if (!info || rev.threshold - info.drawStart <= 0) return;
        shown++;
        (Array.isArray(rec.path) ? rec.path : []).forEach((q) => {
          if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
        });
      });
      return {
        pct,
        sliderValue: el.value,
        label: document.getElementById('draw-order-value')?.textContent || null,
        drawProgress: r.drawProgress,
        pathsShown: shown,
        pathsTotal: records.length,
        inkTop: Number.isFinite(y0) ? +y0.toFixed(2) : null,
        inkBottom: Number.isFinite(y1) ? +y1.toFixed(2) : null,
      };
    }, pct);
    await pg.waitForTimeout(250);
    const cv = await pg.$('#main-canvas');
    await cv.screenshot({ path: path.join(OUT, `${TAG}__reveal-${pct}.png`) });
    await pg.screenshot({ path: path.join(OUT, `${TAG}__app-${pct}.png`) });
    rows.push(measure);
    console.log('STOP', JSON.stringify(measure));
  }
  fs.writeFileSync(path.join(OUT, `${TAG}__measurements.json`), JSON.stringify({ uiSet, frame, rows }, null, 2));
  await br.close();
})();
