/* U9b — LIVE visual evidence, shot in the REAL app, for BOTH sub-parts:
 * (b) the shadow RECIPE fix (`shadowToneLaw:'onePenDown'` now resolves to
 *     interlockWeave's own recipe instead of the plain-hatch fallback), and
 * (c) the shadow ROW DISPLAY fix / W-10d-3b (the (i) popover now shows a raw
 *     folded id's OWN entry, e.g. Fine Ladder's, not the survivor's).
 *
 * Run against TWO servers so "before"/"after" is a real source diff, not a
 * different law value on the same build (the display bug can't be shown by
 * picking a different id the way U9's own canvas evidence did):
 *   - BEFORE: a scratch `git archive 2af329dd` export (this unit's own base,
 *     pre-fix), served separately.
 *   - AFTER: this worktree (fill-collapse-3), the fixed build.
 *
 *   node scripts/audit/u9b-shadow-display-evidence.js <beforeBaseUrl> <afterBaseUrl> <outDir>
 *
 * Captures the ctxbar Shadow flyout (Fill Style row + its (i) popover) and
 * a full canvas shot, for `shadowToneLaw:'fineLadder'` and
 * `shadowToneLaw:'onePenDown'`, on both servers.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('@playwright/test');

const BEFORE_URL = process.argv[2] || 'http://localhost:18482';
const AFTER_URL = process.argv[3] || 'http://localhost:8482';
const OUT = process.argv[4] || path.resolve(__dirname, '..', '..', 'docs', '3d-audit', 'fill-audit', 'after', 'U9b');
const IDS = ['fineLadder', 'onePenDown'];

const waitForServer = (url, timeoutMs) => new Promise((resolve, reject) => {
  const started = Date.now();
  const attempt = () => {
    const req = http.get(url, (res) => { res.resume(); resolve(); });
    req.on('error', () => {
      if (Date.now() - started > timeoutMs) reject(new Error(`server never came up: ${url}`));
      else setTimeout(attempt, 200);
    });
  };
  attempt();
});

const SPHERE = {
  id: 'sphere-1', name: 'sphere-1', primitive: 'sphere', params: { radius: 34, detail: 28 },
  transform: { x: 0, y: 34, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 40, intensity: 1, castShadows: true };
const CAMERA = { projection: 'orthographic', yaw: 15, pitch: 50, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await waitForServer(`${BEFORE_URL}/index.html`, 20000);
  await waitForServer(`${AFTER_URL}/index.html`, 20000);

  const browser = await chromium.launch();
  const report = { id: 'U9b', beforeBaseUrl: BEFORE_URL, afterBaseUrl: AFTER_URL, cases: [] };

  const shootOne = async (baseUrl, stage, rawId) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer && window.app.ui, null, { timeout: 90000 });
    const ver = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');

    const res = await page.evaluate(({ rawId, SUN, CAMERA, SPHERE }) => {
      const app = window.app; const V = window.Vectura; const engine = app.engine;
      // Same monolith->group shape U9's own evidence script uses (proven to
      // populate `g.scenePaths` with castShadow-classed regions) — a plain
      // `new V.Layer('scene3d', ...)` monolith does NOT populate scenePaths
      // the same way.
      engine.layers = engine.layers.filter((l) => l.type !== 'scene3d');
      const gid = engine.addLayer('scene3d');
      engine.layers = engine.layers.filter((l) => l.parentId !== gid);
      const scene = engine.layers.find((l) => l.id === gid);
      scene.isGroup = true; scene.containerRole = 'scene';
      const p = scene.params;
      p.camera = CAMERA; p.ground = { enabled: true }; p.backdrop = { enabled: false };
      p.objects = [SPHERE]; p.lights = [SUN];
      p.shadow = { ...(p.shadow || {}), shadowToneLaw: rawId, shadowDensity: 70, shadowLayers: false };
      p.styleTable = {
        scene: { penId: null, mapper: 'hatch', params: {} },
        byObject: { 'sphere-1': { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 40, toneLaw: 'ladder' } } },
        byFace: {},
      };
      engine.activeLayerId = scene.id;
      engine.computeAllDisplayGeometry();
      app.render();
      app.renderer.setSelection([scene.id], scene.id);
      app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['sphere-1'], faceKeys: [], edgeKeys: [] });
      V.UI.ContextBar.restoreState();
      const host = V.UI.ContextBar.getContentHost();
      const pill = Array.from(host.querySelectorAll('.ctxbar-scene-field')).find((f) => f.getAttribute('aria-label') === 'Shadow');
      if (!pill) return { error: 'no Shadow pill' };
      pill.click();
      const fly = document.querySelector('.ctxbar-scene-flyout.is-open');
      if (!fly) return { error: 'flyout did not open' };
      const rowCtl = (label) => {
        const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row')).find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
        return row ? row.querySelector('.ctxbar-fly-ctl') : null;
      };
      const fsCtl = rowCtl('Fill Style');
      const fsSel = fsCtl && fsCtl.querySelector('select');
      const row = fsCtl ? fsCtl.parentNode : null;
      const btn = row ? row.querySelector('.vs3-lawinfo-btn') : null;
      let popoverText = null;
      if (btn) {
        btn.click();
        const box = fly.querySelector(`#${btn.getAttribute('aria-describedby')}`);
        popoverText = box ? box.textContent : null;
      }
      const flyRect = (() => { const r = fly.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })();
      // Render-level proof (independent of the UI), matches the unit tests.
      const paths = scene.scenePaths || [];
      const shadowPaths = paths.filter((q) => q.meta && q.meta.sceneTarget && q.meta.sceneTarget.regionClass === 'castShadow');
      const geomSig = JSON.stringify(shadowPaths.map((q) => q.map((pt) => [
        Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000,
      ])));
      return {
        rawId,
        survivorShownInSelect: fsSel ? fsSel.value : null,
        popoverText,
        flyRect,
        shadowPathCount: shadowPaths.length,
        geomSig,
        hasDisplayLawHelper: typeof V.SCENE_FILL_STYLES.shadowDisplayLaw === 'function',
      };
    }, { rawId, SUN, CAMERA, SPHERE });

    if (res.error) {
      await page.close();
      return { stage, rawId, error: res.error };
    }
    const clip = { x: Math.max(0, res.flyRect.x - 8), y: Math.max(0, res.flyRect.y - 8), width: res.flyRect.w + 16, height: res.flyRect.h + 16 };
    await page.screenshot({ path: path.join(OUT, `${stage}-${rawId}-row.png`), clip });
    // Close the flyout before the canvas shot so the shadow/sphere are not
    // hidden behind the panel.
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const c = document.querySelector('#main-canvas');
      if (c) c.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `${stage}-${rawId}-canvas.png`) });
    delete res.flyRect;
    await page.close();
    return { stage, rawId, ver, pageErrors: errors, ...res };
  };

  for (const rawId of IDS) {
    // eslint-disable-next-line no-await-in-loop
    const before = await shootOne(BEFORE_URL, 'before', rawId);
    // eslint-disable-next-line no-await-in-loop
    const after = await shootOne(AFTER_URL, 'after', rawId);
    report.cases.push({ rawId, before, after });
    console.log(rawId, '| before select=', before.survivorShownInSelect, 'popover=', (before.popoverText || '').slice(0, 60));
    console.log(rawId, '| after  select=', after.survivorShownInSelect, 'popover=', (after.popoverText || '').slice(0, 60));
    console.log(rawId, '| before shadowPathCount=', before.shadowPathCount, 'after shadowPathCount=', after.shadowPathCount,
      'geomSig equal=', before.geomSig === after.geomSig);
  }

  report.generatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'raw-capture.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('wrote', path.join(OUT, 'raw-capture.json'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
