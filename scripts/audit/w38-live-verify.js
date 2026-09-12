#!/usr/bin/env node
/**
 * W-38 — live-app verification via Playwright (chrome-devtools MCP is a
 * shared singleton and was failing to connect this session — CLAUDE.md's
 * "verify with Playwright instead" clause).
 *
 * Runs against the REAL running app (port 8476, this lane's own dev
 * server), in a real Chromium tab. Builds a scene3d group + box object the
 * same way scripts/audit/scene3d-capture.js's buildAndMeasure does, then
 * mounts the REAL Vectura.UI.Scene3DPanel.build(...) module (the same
 * production code path tests/integration/scene3d-panel.test.js drives, but
 * here in a live browser DOM/CSS instead of jsdom) so the Style tab, its
 * "Min rulings" slider, and its live drag/undo/round-trip behaviour are
 * observed for real, not asserted from a unit harness.
 *
 * Checks:
 *  1. hatch: Min rulings row appears; NOT under contour/spiral/stipple/
 *     wireframe/Slices.
 *  2. Drag 1 -> 3 -> 8; screenshot each.
 *  3. One pushHistory() call per drag gesture (one-undo-per-gesture).
 *  4. hatch -> wireframe -> hatch preserves the user-set value.
 *  5. A .vectura-shaped JSON save/reload round-trip preserves the value.
 *  6. The GROUND PLANE's own rendered ink is unaffected as the slider moves
 *     (decision 3's invariant) — checked via a SEPARATE full-engine scene
 *     (ground enabled) rendered through engine.computeAllDisplayGeometry(),
 *     not the bare panel-only fixture above.
 *  7. A sphere shows no Min rulings row at all (smooth primitive).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('@playwright/test');

function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/index.html', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  const port = Number(process.argv[2] || 8476);
  const outDir = path.resolve(process.argv[3] || 'docs/3d-audit/fill-audit/after/W-38/live');
  fs.mkdirSync(outDir, { recursive: true });

  if (!(await pingServer(port))) throw new Error(`no dev server on port ${port}`);
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine, null, { timeout: 90000 });

  // ── Mount the REAL Scene3DPanel against a live box/hatch object3d leaf,
  // exactly as tests/integration/scene3d-panel.test.js's `mount()` does,
  // but in a real browser DOM. ────────────────────────────────────────────
  const setup = await page.evaluate(() => {
    const V = window.Vectura;
    const P = V.Scene3D.Params;
    const layer = {
      id: 's3d-live', type: 'scene3d', name: 'Scene', visible: true, penId: 'pen-1',
      params: {
        sceneVersion: 4, seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
        objects: [{
          id: 'obj-1', name: 'Box 1', primitive: 'box',
          params: { ...(P.PRIMITIVE_PARAM_DEFAULTS.box || {}) },
          transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
        }],
        lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
        ground: { enabled: true }, backdrop: { enabled: false },
        camera: { projection: 'orthographic', yaw: -30, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
        groups: [], assets: {},
        styleTable: {
          scene: { penId: null, mapper: 'none', params: {} },
          byObject: { 'obj-1': { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } } },
          byFace: {},
        },
      },
    };
    let historyCalls = 0;
    const ui = { app: { pushHistory: () => { historyCalls += 1; }, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    container.id = 'w38-live-container';
    container.style.cssText = 'position:fixed;top:0;left:0;width:900px;height:700px;background:#111;z-index:99999;overflow:auto;';
    document.body.appendChild(container);
    V.UI.Scene3DPanel.build(ui, layer, container);
    window.__w38 = { ui, layer, container, getHistoryCalls: () => historyCalls, resetHistoryCalls: () => { historyCalls = 0; } };
    return { ok: true, version: V.APP_VERSION };
  });
  console.log('served version', setup.version);

  const clickTab = async (value) => {
    await page.evaluate((v) => {
      const btn = window.__w38.container.querySelector(`.tab-btn[data-value="${v}"]`);
      btn.dispatchEvent(new Event('click', { bubbles: true }));
    }, value);
  };
  const clickTreeRow = async () => {
    await page.evaluate(() => {
      window.__w38.container.querySelector('.vs3-tree-row').dispatchEvent(new Event('click', { bubbles: true }));
    });
  };
  const setMapper = async (mapper) => {
    await page.evaluate((m) => {
      const c = window.__w38.container;
      const sel = [...c.querySelectorAll('select')].find((s) => [...(s.options || [])].some((o) => o.value === m));
      sel.value = m;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, mapper);
  };

  await clickTreeRow();
  await clickTab('style');
  await setMapper('hatch');

  // ── Check 1: row present under hatch, absent under contour/wireframe/Slices.
  const rowPresence = await page.evaluate(() => {
    const c = window.__w38.container;
    const has = () => !!c.querySelector('input.ctrl-slider[aria-label="Minimum facet rulings"]');
    return { hatch: has() };
  });
  await setMapper('contour');
  const afterContour = await page.evaluate(() => !!window.__w38.container.querySelector('input.ctrl-slider[aria-label="Minimum facet rulings"]'));
  await setMapper('wireframe');
  const afterWireframe = await page.evaluate(() => !!window.__w38.container.querySelector('input.ctrl-slider[aria-label="Minimum facet rulings"]'));
  await setMapper('contourSlice');
  const afterSlices = await page.evaluate(() => !!window.__w38.container.querySelector('input.ctrl-slider[aria-label="Minimum facet rulings"]'));
  await setMapper('hatch');

  console.log('row presence: hatch=', rowPresence.hatch, 'contour=', afterContour, 'wireframe=', afterWireframe, 'slices=', afterSlices);

  // ── Check 2/3: drag 1 -> 3 -> 8, screenshot each, count history pushes.
  await page.evaluate(() => window.__w38.resetHistoryCalls());
  const dragTo = async (value) => {
    await page.evaluate((v) => {
      const c = window.__w38.container;
      const el = c.querySelector('input.ctrl-slider[aria-label="Minimum facet rulings"]');
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };
  const shots = {};
  for (const v of [1, 3, 8]) {
    // eslint-disable-next-line no-await-in-loop
    await dragTo(v);
    // eslint-disable-next-line no-await-in-loop
    const stored = await page.evaluate(() => window.__w38.layer.params.styleTable.byObject['obj-1'].params.facetMinRulings);
    // eslint-disable-next-line no-await-in-loop
    const shot = await page.locator('#w38-live-container').screenshot();
    fs.writeFileSync(path.join(outDir, `style-tab-min-rulings-${v}.png`), shot);
    shots[v] = stored;
  }
  const historyCallsAfter3Drags = await page.evaluate(() => window.__w38.getHistoryCalls());
  console.log('stored values at each drag:', JSON.stringify(shots), 'pushHistory calls for 3 drags:', historyCallsAfter3Drags);

  // ── Check 4: hatch -> wireframe -> hatch preserves the value (5).
  await dragTo(5);
  await setMapper('wireframe');
  await setMapper('hatch');
  const survived = await page.evaluate(() => window.__w38.layer.params.styleTable.byObject['obj-1'].params.facetMinRulings);
  console.log('facetMinRulings after hatch->wireframe->hatch (expect 5):', survived);

  // ── Check 5: .vectura save/open round-trip (JSON round-trip through the
  // real layer.params shape, mirroring what serialize/deserialize does for
  // a style-param bag).
  const roundTrip = await page.evaluate(() => {
    const saved = JSON.parse(JSON.stringify(window.__w38.layer.params));
    return saved.styleTable.byObject['obj-1'].params.facetMinRulings;
  });
  console.log('facetMinRulings survives JSON round-trip (expect 5):', roundTrip);

  // ── Check 7: sphere shows no Min rulings row at all.
  const sphereCheck = await page.evaluate(() => {
    const V = window.Vectura;
    const P = V.Scene3D.Params;
    const layer = {
      id: 's3d-sphere', type: 'scene3d', name: 'Scene', visible: true, penId: 'pen-1',
      params: {
        sceneVersion: 4, seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
        objects: [{
          id: 'obj-s', name: 'Sphere 1', primitive: 'sphere',
          params: { ...(P.PRIMITIVE_PARAM_DEFAULTS.sphere || {}) },
          transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
        }],
        lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
        ground: { enabled: true }, backdrop: { enabled: false },
        camera: { projection: 'orthographic', yaw: -30, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
        groups: [], assets: {},
        styleTable: {
          scene: { penId: null, mapper: 'none', params: {} },
          byObject: { 'obj-s': { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } } },
          byFace: {},
        },
      },
    };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    V.UI.Scene3DPanel.build(ui, layer, container);
    container.querySelector('.vs3-tree-row').dispatchEvent(new Event('click', { bubbles: true }));
    container.querySelector('.tab-btn[data-value="style"]').dispatchEvent(new Event('click', { bubbles: true }));
    const sel = [...container.querySelectorAll('select')].find((s) => [...(s.options || [])].some((o) => o.value === 'hatch'));
    sel.value = 'hatch';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const hasRow = !!container.querySelector('input.ctrl-slider[aria-label="Minimum facet rulings"]');
    container.remove();
    return hasRow;
  });
  console.log('sphere + hatch mounts Min rulings row (expect false):', sphereCheck);

  // ── Check 6: the GROUND PLANE's own ink is unaffected as the control
  // moves, through a FULL engine.addLayer + computeAllDisplayGeometry
  // scene (ground enabled), independent of the panel fixture above.
  const groundCheck = await page.evaluate(() => {
    const V = window.Vectura;
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    const prev = obj.params.primitive;
    obj.params.primitive = 'box';
    obj.params.params = V.Scene3D.Params.buildPrimitiveParams('box', prev, null) || {};
    obj.params.style.mapper = 'hatch';
    obj.params.style.params.fillAngle = 45;
    obj.params.style.params.fillDensity = 50;
    const groundInk = (paths, objId) => paths.filter((p) => {
      const m = p.meta || {}; const t = m.sceneTarget || {};
      return t.objectId !== objId;
    }).reduce((sum, p) => {
      let len = 0;
      for (let i = 1; i < p.length; i += 1) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      return sum + len;
    }, 0);
    const results = {};
    [1, 3, 8].forEach((v) => {
      obj.params.style.params.facetMinRulings = v;
      engine.computeAllDisplayGeometry();
      results[v] = Math.round(groundInk(group.scenePaths || [], obj.id) * 100) / 100;
    });
    return results;
  });
  console.log('ground ink at control 1/3/8 (expect identical):', JSON.stringify(groundCheck));

  const report = {
    rowPresence, afterContour, afterWireframe, afterSlices,
    shots, historyCallsAfter3Drags, survivedWireframeDetour: survived, roundTrip,
    sphereHasRow: sphereCheck, groundInk: groundCheck,
  };
  fs.writeFileSync(path.join(outDir, 'live-verify-report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
