/* LIVE VERIFICATION for the shadow-anatomy -> 3d-scene/p4 merge.
 *
 * Nine rounds of numbers and the workstream's own standing lesson is that
 * "nobody knows what a merged renderer draws until somebody opens it". This
 * drives the REAL app in a REAL browser -- not the vitest harness -- and
 * screenshots what a user would see.
 *
 * Usage:  node scripts/shadow-anatomy/live-merge-verify.js <baseUrl> <outDir> <label>
 *
 * The scenes, and what each is here to answer:
 *   sliver     R2-cube-bands4. THE HEADLINE. The +X face is near edge-on. Before
 *              the fix it rendered as a solid black stripe -- the cube read as
 *              having a keyline down one side. Composed coverage 1.084.
 *   sphere     A lit sphere on the curved (chart-wrapped) fill path -- the path
 *              p4's run sink acts on. Confirms the shadow work and p4's
 *              fill-continuity fix coexist rather than fighting.
 *   capsule    A curved object's fill at close range, for ruling continuity.
 *   layers-*   Cast-shadow penumbra layers Off / 2 / 3 / 4 on the cube. These
 *              are the protected list's own subject.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const FIX = require('../../tests/fixtures/scene3d-shadow-anatomy');

const baseUrl = process.argv[2] || 'http://localhost:8347';
const outDir = process.argv[3] || '/tmp/live';
const label = process.argv[4] || 'merged';

const clone = (v) => JSON.parse(JSON.stringify(v));

// SUN2 / CUBE2 are the R2 fixture's own, rebuilt here from exported parts
// because the fixture keeps them module-local. Same values as VIEWS' R2-cube.
const SUN2 = { ...clone(FIX.SUN), azimuth: 200, elevation: 40 };
const CUBE2 = { ...clone(FIX.CUBE), transform: { ...clone(FIX.CUBE.transform), yaw: 24 } };

const sceneOf = (over) => ({
  seed: FIX.SEED,
  camera: clone(over.camera || FIX.CAMERA),
  ground: over.ground === undefined ? { enabled: true } : over.ground,
  backdrop: { enabled: false },
  objects: clone(over.objects),
  lights: clone(over.lights || [FIX.SUN]),
  tone: clone(over.tone || FIX.toneBands(4)),
  styleTable: FIX.styleTable(over.objects, over.styleParams || {}),
  shadowOver: over.shadow || null,
});

const SCENES = [
  { id: 'sliver-r2-cube-bands4', zoom: 3.2, scene: sceneOf({ objects: [CUBE2], ground: { enabled: false }, tone: FIX.toneBands(4), lights: [SUN2] }) },
  { id: 'sphere-bands4', zoom: 2.2, scene: sceneOf({ objects: [FIX.BALL], ground: { enabled: false } }) },
  { id: 'capsule-fill', zoom: 2.6, scene: sceneOf({ objects: [FIX.CAPSULE], ground: { enabled: false } }) },
];
['off', 2, 3, 4].forEach((n) => {
  SCENES.push({
    id: `layers-${n}`,
    zoom: 1.6,
    scene: sceneOf({
      objects: [FIX.BALL],
      shadow: n === 'off' ? { shadowLayers: false } : { shadowLayers: true, shadowLayerCount: n },
    }),
  });
});

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 30000 });
  // The served tree must be the one under test -- a stale dev-server on a
  // shared port silently serving another worktree has bitten this repo before.
  const served = await page.evaluate(() => (window.Vectura && window.Vectura.VERSION) || 'unknown');
  console.log(`[${label}] app version reported by the page: ${served}`);

  const report = [];
  for (const s of SCENES) {
    const stats = await page.evaluate(async ({ spec }) => {
      const app = window.app;
      const V = window.Vectura;
      const engine = app.engine;
      // Fresh document each time so scenes never stack.
      engine.layers = [];
      const groupId = engine.addLayer('scene3d');
      engine.layers = engine.layers.filter((l) => l.parentId !== groupId);
      const group = engine.layers.find((l) => l.id === groupId);
      group.isGroup = true;
      group.containerRole = 'scene';
      const p = group.params;
      p.seed = spec.seed;
      p.camera = spec.camera;
      p.ground = spec.ground;
      p.backdrop = spec.backdrop;
      p.objects = spec.objects;
      p.lights = spec.lights;
      p.tone = spec.tone;
      p.styleTable = spec.styleTable;
      if (spec.shadowOver) p.shadow = { ...(p.shadow || {}), ...spec.shadowOver };
      engine.computeAllDisplayGeometry();
      app.render();
      const paths = group.scenePaths || [];
      const inkOf = (sel) => {
        let ink = 0; let n = 0;
        paths.forEach((q) => {
          if (!sel(q)) return;
          n += 1;
          for (let i = 1; i < q.length; i++) ink += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
        });
        return { paths: n, ink: +ink.toFixed(2) };
      };
      return {
        total: inkOf(() => true),
        fill: inkOf((q) => q.meta && q.meta.kind === 'sceneFill'),
        edge: inkOf((q) => q.meta && q.meta.kind === 'sceneEdge'),
      };
    }, { spec: s.scene });

    // Frame the object: zoom in so a per-face artefact is legible, then shoot
    // the canvas only.
    await page.evaluate((z) => {
      const r = window.app.renderer;
      if (r.zoomToFit) r.zoomToFit();
      if (typeof r.zoom === 'number') r.zoom *= z;
      else if (r.setZoom) r.setZoom(z);
      window.app.render();
    }, s.zoom);
    await page.waitForTimeout(250);

    const file = path.join(outDir, `${label}__${s.id}.png`);
    await page.locator('#main-canvas').screenshot({ path: file });
    report.push({ id: s.id, file, ...stats });
    console.log(`[${label}] ${s.id.padEnd(26)} total ${String(stats.total.paths).padStart(5)}p ${String(stats.total.ink).padStart(10)}mm   fill ${String(stats.fill.paths).padStart(5)}p ${String(stats.fill.ink).padStart(10)}mm`);
  }

  fs.writeFileSync(path.join(outDir, `${label}__stats.json`), JSON.stringify(report, null, 2));
  if (errors.length) console.log(`[${label}] PAGE ERRORS:\n${errors.join('\n')}`);
  await browser.close();
})();
