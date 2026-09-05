/* Judge acceptance test (item 1, part 2) — a tall box casting a shadow onto
 * a NEIGHBOURING box's SIDE face (not a ground plane). Same footprint-clip
 * mechanism (Unit D judge follow-up v2), exercised on a faceted box's own
 * vertical face instead of a 'plane' primitive, in the real app pipeline.
 *
 *   node scripts/shadow-receive-box-side-evidence.js [baseUrl] [outDir]
 * Serve THIS worktree first: node scripts/dev-server.js 8470
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8470';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', '3d-audit', 'handoff', 'unit-d');

const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25, intensity: 1, castShadows: true };
const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const TONE = { enabled: true, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85] };

// Tall caster box, positioned so its shadow (light travel ~ -X, zero
// z-component at azimuth 90) falls onto the RECEIVER box's -X side face.
const CASTER = {
  id: 'caster', name: 'caster', primitive: 'box', params: { sx: 30, sy: 90, sz: 30 },
  transform: { x: 70, y: 45, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const RECEIVER = {
  id: 'receiver', name: 'receiver', primitive: 'box', params: { sx: 60, sy: 60, sz: 60 },
  transform: { x: -30, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 3 });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  const ver = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');
  console.log('served version', ver);

  const build = (shadowOn) => page.evaluate(({ shadowOn, SUN, CAMERA, TONE, CASTER, RECEIVER }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: false }; p.backdrop = { enabled: false };
    p.objects = [CASTER, RECEIVER];
    p.lights = [SUN];
    p.tone = TONE;
    p.shadow = { ...(p.shadow || {}), shadowReceiveOnObjects: shadowOn };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
      byObject: {
        receiver: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
        caster: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
      },
      byFace: {},
    };
    engine.computeAllDisplayGeometry();
    app.render();
    return { total: (g.scenePaths || []).length };
  }, { shadowOn, SUN, CAMERA, TONE, CASTER, RECEIVER });

  const zoom = (k) => page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2; const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k; r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k; r.userHasManipulated = true; r.draw();
  }, k);
  const shot = () => page.evaluate(() => document.querySelector('#main-canvas').toDataURL('image/png'));
  const save = async (file) => {
    const url = await shot();
    fs.writeFileSync(path.join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
  };

  const on = await build(true);
  await zoom(2.2);
  await page.waitForTimeout(300);
  await save('box-side-on.png');
  console.log('on', JSON.stringify(on));

  const off = await build(false);
  await zoom(2.2);
  await page.waitForTimeout(300);
  await save('box-side-off.png');
  console.log('off', JSON.stringify(off));

  await browser.close();
})();
