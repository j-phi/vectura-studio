#!/usr/bin/env node
/*
 * Vectura Studio - touch target + responsive layout audit CLI (Playwright, Chromium or WebKit).
 *
 * A thin wrapper. The measurement lives in tests/e2e/helpers/target-audit-core.js, the 26 state
 * openers live in tests/e2e/touch/target-audit-states.js, viewports in
 * tests/e2e/touch/viewports.js. The CI ratchet is tests/e2e/touch/target-audit.spec.js.
 *
 * Run:
 *   node scripts/dev-server.js 8414 &          # or any port
 *   node docs/touch-audit/scripts/target-audit.js [--port 8414] [--engine chromium|webkit]
 *        [--only ipad-portrait,iphone-portrait] [--states default,menu-file] [--no-shots]
 *
 * Output:
 *   docs/touch-audit/findings/target-audit.json      raw per-viewport/per-state data
 *   docs/touch-audit/evidence/layout/<vp>__<state>.png  screenshots (CSS-px scale)
 *
 * Thresholds: Apple HIG 44x44 CSS px; WCAG 2.2 AA 2.5.8 24x24 (with spacing exception);
 * crowding = nearest non-nested neighbour edge gap < 8 px; iOS focus-zoom = text-entry
 * control computed font-size < 16 px. Hit sizes are PROBED (`probed: true` in the output).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium, webkit } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const core = require(path.join(ROOT, 'tests/e2e/helpers/target-audit-core.js'));
const { STATES } = require(path.join(ROOT, 'tests/e2e/touch/target-audit-states.js'));
const { DEVICES } = require(path.join(ROOT, 'tests/e2e/touch/viewports.js'));

const OUT_JSON = path.join(ROOT, 'docs/touch-audit/findings/target-audit.json');
const SHOT_DIR = path.join(ROOT, 'docs/touch-audit/evidence/layout');

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const PORT = Number(arg('port', process.env.PORT || 8414));
const BASE = `http://127.0.0.1:${PORT}/`;
const ENGINE = arg('engine', 'chromium');
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const ONLY_STATES = arg('states', '') ? arg('states').split(',') : null;
const SHOTS = !argv.includes('--no-shots');

// Old CLI viewport ids -> project device names (viewports.js is the single source).
const VIEWPORT_IDS = {
  'ipad-portrait': 'iPadP', 'ipad-landscape': 'iPadL', 'iphone-portrait': 'iPhP', 'iphone-landscape': 'iPhL',
  'iphone-portrait-chrome': 'iPhP-c', 'iphone-landscape-chrome': 'iPhL-c', 'coarse-wide': 'coarseWide',
};
const DEFAULT_IDS = ['ipad-portrait', 'ipad-landscape', 'iphone-portrait', 'iphone-landscape'];

async function pollPost(page, st) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < 10000) {
    last = await st.post(page);
    if (last === true) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`postcondition: ${last}`);
}

async function main() {
  if (!['chromium', 'webkit'].includes(ENGINE)) throw new Error(`--engine must be chromium or webkit, got ${ENGINE}`);
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch();
  const results = { generatedAt: new Date().toISOString(), base: BASE, engine: ENGINE, probed: true, thresholds: core.THRESHOLDS, viewports: [] };

  for (const id of ONLY || DEFAULT_IDS) {
    const device = VIEWPORT_IDS[id];
    if (!device) throw new Error(`unknown viewport id ${id}; known: ${Object.keys(VIEWPORT_IDS).join(', ')}`);
    const d = DEVICES[device];
    const safe = core.SAFE_BANDS[device];
    const vpOut = { id, width: d.width, height: d.height, dpr: d.dpr, safe, states: [] };
    for (const st of STATES) {
      if (ONLY_STATES && !ONLY_STATES.includes(st.id)) continue;
      const ctx = await browser.newContext({
        viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr,
        isMobile: true, hasTouch: true, userAgent: d.ua, reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => { const m = String(e.message || e).slice(0, 200); if (!core.isBenignPageError(m)) errors.push(m); });
      const rec = { id: st.id };
      try {
        await core.bootApp(page, BASE);
        await st.run(page);
        await pollPost(page, st);
        await core.waitLayoutSettled(page);
        await page.waitForTimeout(150);
        const m = await core.measurePage(page, { W: d.width, H: d.height, safe, allow: [] });
        Object.assign(rec, m);
        if (st.id === 'layer-selected-handles' || st.id === 'pen-path-anchors') rec.handles = await page.evaluate(core.probeHandles);
        if (SHOTS) {
          rec.screenshot = `docs/touch-audit/evidence/layout/${id}__${st.id}.png`;
          await page.screenshot({ path: path.join(ROOT, rec.screenshot), scale: 'css' });
        }
      } catch (e) {
        rec.error = String(e.message || e).split('\n')[0].slice(0, 300);
      }
      rec.pageErrors = errors.slice(0, 5);
      rec.pageErrorCount = errors.length;
      vpOut.states.push(rec);
      const n = rec.items ? rec.items.filter((i) => i.onscreen).length : 0;
      process.stdout.write(`${id} ${st.id}: ${rec.error ? 'ERROR ' + rec.error : n + ' on-screen targets, canvas ' + rec.canvasPct + '%'}\n`);
      await ctx.close();
    }
    vpOut.summary = core.summarizeRun(vpOut.states);
    results.viewports.push(vpOut);
  }
  await browser.close();
  fs.writeFileSync(OUT_JSON, JSON.stringify(results));
  console.log(`wrote ${path.relative(ROOT, OUT_JSON)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
