/* A2 — quick live-app sanity screenshot for the torus self-occlusion rewrite.
 * NOT a before/after streak-fix pair (the streaks are UNCHANGED by this
 * unit's fix — see docs/3d-audit/handoff/unit-a2-notes.md). This just
 * confirms the app renders a torus with each of the five reopened laws
 * without error after the Scene3D.TorusOcclusion rewrite + hlr.js gating.
 *
 *   node scripts/a2-torus-check-evidence.js [baseUrl] [outDir]
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8470';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', '3d-audit', 'handoff', 'unit-a2');

const TORUS = {
  id: 'donut', name: 'Donut', primitive: 'torus',
  params: { sx: 60, sy: 60, sz: 60, detail: 24 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
};
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 30, intensity: 1, castShadows: false };
const CAMERA = { projection: 'orthographic', yaw: -30, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 2.4 };

const LAWS = ['interlockWeave', 'onePenDown', 'trochoidLoop', 'ampSpacing', 'weaveDepth'];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });

  const statsAll = {};
  for (const law of LAWS) {
    // eslint-disable-next-line no-await-in-loop
    const res = await page.evaluate(({ torus, sun, camera, toneLaw }) => {
      const { app } = window;
      const engine = app.engine;
      engine.layers.slice().forEach((l) => { if (l) engine.removeLayer(l.id); });
      const groupId = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l && l.id === groupId);
      group.params.objects = [torus];
      group.params.lights = [sun];
      group.params.camera = camera;
      group.params.ground = { enabled: false };
      const obj = engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = 'torus';
      obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
      obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw, fillDensity: 60 };
      engine.computeAllDisplayGeometry();
      app.render();
      const stats = window.Vectura.Scene3D.SurfaceFill.lastRibbonStats || {};
      return { stats: JSON.parse(JSON.stringify(stats)), pathCount: (group.scenePaths || []).length };
    }, {
      torus: TORUS, sun: SUN, camera: CAMERA, toneLaw: law,
    });
    statsAll[law] = res;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(150);
    const canvas = await page.$('canvas#canvas, canvas');
    // eslint-disable-next-line no-await-in-loop
    await canvas.screenshot({ path: path.join(outDir, `${law}-after.png`) });
  }

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ statsAll, errors }, null, 2));
  console.log('errors:', errors);
  console.log(JSON.stringify(statsAll, null, 2));
  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
