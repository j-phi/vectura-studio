/*
 * Regression archaeology: what happens if the Draw Order preview stops
 * excluding GROUPS (the uncommitted follow-up that produced the misplaced
 * capsule)? Monkey-patches getOptimizationTargetIds at runtime so no source
 * change is needed, then screenshots the overlay.
 *
 * Usage: node docs/draw-order/harness/naive-groups.js <port> <outDir> <tag>
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/jayphi/Documents/github/vectura-studio/node_modules/playwright');

const PORT = process.argv[2] || '4173';
const OUT = process.argv[3];
const TAG = process.argv[4] || 'naive';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  pg.on('console', (m) => { if (m.type() === 'error') console.log('PAGE-ERR', m.text()); });
  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForFunction(() => !!window.app && !!window.app.engine, null, { timeout: 30000 });

  const info = await pg.evaluate(() => {
    const S = window.Vectura.SETTINGS;
    S.margin = 10; S.truncate = 4; S.preview3dQuality = 'high';
    if (S.pens && S.pens[0]) S.pens[0].width = 0.3;
    const eng = window.app.engine, r = window.app.renderer;
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
      byObject: { ground: { penId: null, mapper: 'none', params: {} } }, byFace: {},
    };
    Object.assign(kids().find((l) => l.type === 'sceneLight3d').params,
      { type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: true });
    const c = kids().find((l) => l.type === 'object3d');
    c.params.primitive = 'capsule';
    c.params.params = { sx: 40, sy: 70, sz: 40, detail: 24 };
    c.params.transform = { x: 0, y: 46, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    c.params.style = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85 } };
    eng.computeAllDisplayGeometry();

    // ---- THE NAIVE FOLLOW-UP: stop excluding groups from the preview scope.
    r.getOptimizationTargetIds = function () {
      return new Set(eng.layers.map((l) => l.id));
    };
    // …and give the group the optimizedPaths the overlay's eligibility gate wants,
    // exactly the way "just include the composed scene ink" would.
    grp.optimizedPaths = grp.scenePaths;
    eng.optimizeLayers(eng.layers, { includePlotterOptimize: true });
    S.lineSortOverlayVisible = true;

    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    (grp.scenePaths || []).forEach((p) => p.forEach((q) => {
      if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
    }));
    r.resize();
    const cw = r.canvas.clientWidth, ch = r.canvas.clientHeight;
    const s = Math.min(cw / (x1 - x0 + 10), ch / (y1 - y0 + 10));
    r.scale = s; r.offsetX = cw / 2 - ((x0 + x1) / 2) * s; r.offsetY = ch / 2 - ((y0 + y1) / 2) * s;
    r.drawProgress = 1;
    r.draw();
    const items = r.getDrawOrderPreviewItems ? r.getDrawOrderPreviewItems().items : [];
    // Where does the overlay geometry sit vs the drawn scene ink?
    let ox0 = 1e9, oy0 = 1e9, ox1 = -1e9, oy1 = -1e9;
    items.forEach((it) => { if (Array.isArray(it.path)) it.path.forEach((q) => {
      if (q.x < ox0) ox0 = q.x; if (q.x > ox1) ox1 = q.x; if (q.y < oy0) oy0 = q.y; if (q.y > oy1) oy1 = q.y;
    }); });
    return {
      previewCount: items.length,
      sceneBounds: { x0, y0, x1, y1 },
      overlayBounds: { x0: ox0, y0: oy0, x1: ox1, y1: oy1 },
      groupOptimized: (grp.optimizedPaths || []).length,
      scenePaths: (grp.scenePaths || []).length,
      sameRef: grp.optimizedPaths === grp.scenePaths,
    };
  });
  console.log('NAIVE', JSON.stringify(info, null, 1));
  const cv = await pg.$('canvas');
  await cv.screenshot({ path: path.join(OUT, `${TAG}__naive-groups.png`) });
  await br.close();
})();
