/*
 * Draw Order live probe — builds the reported scene (capsule + ground + cast
 * shadow) in the REAL app, sets a directional/vertical line sort, and reports
 * what the three consumers (preview overlay / playback reveal / SVG export)
 * actually see. Screenshots the main canvas at each reveal progress value.
 *
 * Usage: node docs/draw-order/harness/probe.js <port> <outDir> <tag> [extraLayers]
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/jayphi/Documents/github/vectura-studio/node_modules/playwright');

const PORT = process.argv[2] || '4173';
const OUT = process.argv[3];
const TAG = process.argv[4] || 'probe';
const MODE = process.argv[5] || 'scene'; // 'scene' | 'mixed'

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  pg.on('console', (m) => { if (m.type() === 'error') console.log('PAGE-ERR', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => !!window.app && !!window.app.engine, null, { timeout: 30000 });

  const setup = await pg.evaluate((MODE) => {
    const S = window.Vectura.SETTINGS;
    S.margin = 10; S.truncate = 4; S.preview3dQuality = 'high';
    if (S.pens && S.pens[0]) S.pens[0].width = 0.3;
    const eng = window.app.engine;
    eng.currentProfile = { width: 320, height: 220, name: 'fx' };
    eng.layers.slice().forEach((l) => { try { eng.removeLayer(l.id); } catch (e) {} });
    eng.layers.length = 0;

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
      byObject: { ground: { penId: null, mapper: 'none', params: {} } },
      byFace: {},
    };
    Object.assign(kids().find((l) => l.type === 'sceneLight3d').params,
      { type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: true });
    const c = kids().find((l) => l.type === 'object3d');
    c.params.primitive = 'capsule';
    c.params.params = { sx: 40, sy: 70, sz: 40, detail: 24 };
    c.params.transform = { x: 0, y: 46, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    c.params.style = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85 } };

    if (MODE === 'mixed') {
      const wid = eng.addLayer('wavetable');
      eng.generate(wid);
    }
    eng.computeAllDisplayGeometry();
    return {
      gid,
      layers: eng.layers.map((l) => ({
        id: l.id, type: l.type, isGroup: !!l.isGroup, name: l.name,
        sceneConsumed: !!l._sceneConsumed,
        scenePaths: Array.isArray(l.scenePaths) ? l.scenePaths.length : null,
        optimizedPaths: Array.isArray(l.optimizedPaths) ? l.optimizedPaths.length : null,
        paths: Array.isArray(l.paths) ? l.paths.length : null,
      })),
      targetIds: Array.from(window.app.renderer.getOptimizationTargetIds()),
    };
  }, MODE);
  console.log('SETUP', JSON.stringify(setup, null, 1));

  // Apply a directional / vertical line sort exactly as the Line Sort tab does.
  const sorted = await pg.evaluate(() => {
    const eng = window.app.engine;
    const applied = [];
    eng.layers.forEach((l) => {
      const opt = eng.ensureLayerOptimization(l);
      if (!opt || !opt.steps) return;
      const step = opt.steps.find((s) => s.id === 'linesort');
      if (!step) return;
      step.enabled = true; step.bypass = false;
      step.method = 'directional'; step.direction = 'vertical'; step.grouping = 'combined';
      applied.push({ id: l.id, isGroup: !!l.isGroup });
    });
    eng.optimizeLayers(eng.layers, { includePlotterOptimize: true });
    window.Vectura.SETTINGS.lineSortOverlayVisible = true;
    return {
      applied,
      withOrder: eng.layers.map((l) => {
        const src = eng.getRenderablePaths(l, { useOptimized: true }) || [];
        return {
          id: l.id, isGroup: !!l.isGroup, n: src.length,
          withLineSortOrder: src.filter((p) => p && p.meta && Number.isFinite(p.meta.lineSortOrder)).length,
        };
      }),
    };
  });
  console.log('SORT', JSON.stringify(sorted, null, 1));

  // Frame the document then report consumer agreement.
  const frame = await pg.evaluate(() => {
    const eng = window.app.engine, r = window.app.renderer;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    eng.layers.forEach((l) => {
      (eng.getRenderablePaths(l, { useOptimized: true }) || []).forEach((p) => {
        if (!Array.isArray(p)) return;
        p.forEach((q) => { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; });
      });
    });
    r.resize();
    const cw = r.canvas.clientWidth, ch = r.canvas.clientHeight;
    const s = Math.min(cw / (x1 - x0 + 10), ch / (y1 - y0 + 10));
    r.scale = s; r.offsetX = cw / 2 - ((x0 + x1) / 2) * s; r.offsetY = ch / 2 - ((y0 + y1) / 2) * s;
    r.draw();
    return { x0, y0, x1, y1, scale: s };
  });
  console.log('FRAME', JSON.stringify(frame));

  const report = await pg.evaluate(() => {
    const r = window.app.renderer, eng = window.app.engine, ui = window.app.ui;
    const Renderer = window.Vectura.Renderer;
    const PU = window.Vectura.OptimizationUtils;
    const sig = (p) => {
      if (p && p.meta && p.meta.kind === 'circle') return `c:${Math.round((p.meta.cx ?? 0) * 100)},${Math.round((p.meta.cy ?? 0) * 100)}`;
      if (!Array.isArray(p) || !p.length) return 'empty';
      const a = p[0], b = p[p.length - 1];
      return `${Math.round(a.x * 100)},${Math.round(a.y * 100)}>${Math.round(b.x * 100)},${Math.round(b.y * 100)}`;
    };
    const out = {};
    // Export order
    try {
      out.exportCount = ui.getExportSnapshot().groups.flatMap((g) => g.items).length;
      out.exportFirst5 = ui.getExportSnapshot().groups.flatMap((g) => g.items).slice(0, 5).map((it) => sig(it.path));
    } catch (e) { out.exportErr = String(e); }
    // Reveal order (drawProgress semantics)
    r.drawProgress = 1;
    if (typeof r.buildPlotRecords === 'function') {
      const recs = r.buildPlotRecords();
      out.recordCount = recs.length;
      const rev = Renderer.computePlotRevealOrder(recs, { drawProgress: 1, drawSpeed: 250, travelSpeed: 500 });
      const ordered = Array.from(rev.info.entries()).sort((a, b) => a[1].drawStart - b[1].drawStart).map((e) => e[0]);
      out.revealFirst5 = ordered.slice(0, 5).map(sig);
      out.revealYFirst = ordered.length ? PU.pathCentroid(ordered[0]).y : null;
      out.revealYLast = ordered.length ? PU.pathCentroid(ordered[ordered.length - 1]).y : null;
    } else out.noBuildPlotRecords = true;
    if (typeof r.getDrawOrderPreviewItems === 'function') {
      const items = r.getDrawOrderPreviewItems().items;
      out.previewCount = items.length;
      out.previewFirst5 = items.slice(0, 5).map((i) => sig(i.path));
    } else out.noPreviewApi = true;
    return out;
  });
  console.log('REPORT', JSON.stringify(report, null, 1));

  // Screenshot the reveal sweep.
  for (const pct of [0, 0.25, 0.5, 0.75, 1]) {
    await pg.evaluate((p) => { window.app.renderer.drawProgress = p; window.app.renderer.draw(); }, pct);
    const cv = await pg.$('canvas');
    await cv.screenshot({ path: path.join(OUT, `${TAG}__reveal-${Math.round(pct * 100)}.png`) });
  }
  await br.close();
})();
