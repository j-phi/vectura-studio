/* MERGE CHECKLIST item 7 — LIVE, IN THE REAL APP.
 * Loads a scene whose object3d style bag carries a RAW FOLDED `toneLaw`
 * (bundleDither / contFieldTouch / weaveDepth / onePenDown / fineLadder),
 * opens the ctxbar Style flyout, and records whether the FOLDED law's own
 * caveat is shown (not the survivor's silence).
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const ROOT = process.argv[2] || path.resolve(__dirname, '..', '..');
const OUT = process.argv[3] || path.resolve(__dirname, '..', '..', 'docs/3d-audit/fill-audit/after/MERGE-r2');
const PORT = Number(process.argv[4] || 8493);
const BASE = `http://127.0.0.1:${PORT}`;
const RAW_IDS = ['bundleDither', 'contFieldTouch', 'weaveDepth', 'onePenDown', 'fineLadder'];

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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('node', ['scripts/dev-server.js', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(`[dev] ${d}`));
  await waitForServer(`${BASE}/index.html`, 20000);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const report = { id: 'MERGE-r2-item-7', baseUrl: BASE, cases: [] };
  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer && window.app.ui, null, { timeout: 90000 });
    report.appVersion = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');
    report.packageVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    console.log('served', report.appVersion, 'package', report.packageVersion);

    for (const rawId of RAW_IDS) {
      const res = await page.evaluate((raw) => {
        const app = window.app; const V = window.Vectura;
        app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
        const scene = new V.Layer('scene-item7', 'scene3d', 'Scene');
        const d = JSON.parse(JSON.stringify(V.ALGO_DEFAULTS.scene3d));
        d.objects = [{
          id: 'obj-1', name: 'sphere', primitive: 'sphere', params: { radius: 40, detail: 20 },
          transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
        }];
        // A bag saved BEFORE the collapse: a raw folded toneLaw and NO sibling key.
        d.styleTable = { scene: { penId: null, mapper: 'hatch', params: {} }, byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: raw } } }, byFace: {} };
        scene.params = { ...scene.params, ...d };
        app.engine.layers.push(scene);
        app.engine.activeLayerId = scene.id;
        app.engine.generate(scene.id);
        app.renderer.setSelection([scene.id], scene.id);
        app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [] });
        V.UI.ContextBar.restoreState();
        const host = V.UI.ContextBar.getContentHost();
        const pill = Array.from(host.querySelectorAll('.ctxbar-scene-field')).find((f) => f.getAttribute('aria-label') === 'Style');
        if (!pill) return { error: 'no Style pill' };
        pill.click();
        const fly = document.querySelector('.ctxbar-scene-flyout.is-open');
        if (!fly) return { error: 'flyout did not open' };
        const rowCtl = (label) => {
          const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row')).find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
          return row ? row.querySelector('.ctxbar-fly-ctl') : null;
        };
        const fsSel = rowCtl('Fill Style') && rowCtl('Fill Style').querySelector('select');
        const subRows = Array.from(fly.querySelectorAll('.ctxbar-fly-row')).map((r) => {
          const l = (r.querySelector('.ctxbar-fly-label') || {}).textContent;
          const sel = r.querySelector('select');
          return sel ? { label: l, value: sel.value } : null;
        }).filter(Boolean);
        const caveatEl = fly.querySelector('.ctxbar-fly-note.is-caveat');
        const FS = V.SCENE_FILL_STYLES;
        return {
          raw,
          survivorShownInPicker: fsSel ? fsSel.value : null,
          subControls: subRows.filter((r) => r.label !== 'Fill Style' && r.label !== 'Type'),
          caveatShown: !!caveatEl,
          caveatText: caveatEl ? caveatEl.textContent : null,
          foldedLawHasOwnCaveat: !!(FS.note(raw).caveat),
          foldedLawCaveatText: FS.note(raw).caveat || null,
          survivorHasCaveat: !!(FS.note(FS.resolve(raw)).caveat),
          flyRect: (() => { const r = fly.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
        };
      }, rawId);
      if (res.error) { report.cases.push({ raw: rawId, error: res.error }); continue; }
      const clip = { x: Math.max(0, res.flyRect.x - 8), y: Math.max(0, res.flyRect.y - 8), width: res.flyRect.w + 16, height: res.flyRect.h + 16 };
      await page.screenshot({ path: path.join(OUT, `ctxbar-raw-${rawId}-flyout.png`), clip });
      await page.screenshot({ path: path.join(OUT, `ctxbar-raw-${rawId}-full.png`) });
      delete res.flyRect;
      res.verdict = res.foldedLawHasOwnCaveat
        ? (res.caveatShown ? 'PASS — folded law caveat shown' : 'FAIL — survivor silence')
        : (res.caveatShown ? 'note — a caveat is shown though the folded law has none of its own' : 'n/a — folded law has no caveat of its own');
      report.cases.push(res);
      console.log(rawId, res.verdict, '| picker shows', res.survivorShownInPicker, '| subs', JSON.stringify(res.subControls));
    }
    report.generatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log('wrote', path.join(OUT, 'report.json'));
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
