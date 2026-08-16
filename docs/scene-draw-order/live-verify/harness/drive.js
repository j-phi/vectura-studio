/* Live verification for "a 3D scene exports its ink and sweeps top-to-bottom".
 *
 * Drives the RUNNING app (not jsdom):
 *   1. builds a capsule + ground + cast-shadow scene TREE (the harness recipe
 *      from docs/shadow-anatomy/live-verify/harness/drive.js),
 *   2. opens the Export modal and sets Line Sort → Apply on / Nearest /
 *      Vertical / Combined through the REAL select elements,
 *   3. screenshots that panel so the setting is visibly on,
 *   4. closes the modal and scrubs the main-canvas Draw Order slider to
 *      0/25/50/75/100 %, screenshotting the canvas each time,
 *   5. exports the SVG through UI.exportSVG() and writes it to disk,
 *   6. measures the ink front per frame + the exported path order.
 *
 * node drive.js <port> <outDir> <tag>
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '../../../../node_modules/playwright'));

const PORT = process.argv[2] || 4611;
const OUT = process.argv[3] || path.join(__dirname, '..');
const TAG = process.argv[4] || 'branch';
fs.mkdirSync(OUT, { recursive: true });

const STOPS = [0, 25, 50, 75, 100];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 2 });
  const consoleMsgs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}\n${e.stack}`));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => !!window.app && !!window.app.engine, null, { timeout: 30000 });

  // PROVENANCE — which tree is actually being served?
  const prov = await page.evaluate(async () => {
    const pkg = await (await fetch('package.json')).json();
    const eng = await (await fetch('src/core/engine.js')).text();
    return {
      pkgVersion: pkg.version,
      hasLayerInk: /window\.Vectura\.LayerInk/.test(eng),
      hasGroupInkPaths: /const groupInkPaths/.test(eng),
    };
  });
  console.log(`[${TAG}] PROVENANCE ${JSON.stringify(prov)}`);

  // ── build the capsule scene ────────────────────────────────────────────
  const built = await page.evaluate(() => {
    const eng = window.app.engine;
    eng.layers.slice().forEach((l) => { try { eng.removeLayer(l.id); } catch (e) { /* noop */ } });
    eng.layers.length = 0;

    const gid = eng.addSceneTree();               // group + box child + sun + ground
    const grp = eng.getLayerById(gid);
    const kids = () => eng.getLayerDescendants(gid);

    grp.name = 'Capsule Scene';
    grp.params.seed = 0;
    grp.params.camera = {
      projection: 'orthographic', yaw: -30, pitch: 32, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    grp.params.backdrop = { enabled: false };
    grp.params.shadow = { ...grp.params.shadow, shadowLayers: true, shadowLayerCount: 3 };

    const light = kids().find((l) => l.type === 'sceneLight3d');
    if (light) Object.assign(light.params, {
      type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: true,
    });

    const obj = kids().find((l) => l.type === 'object3d');
    if (obj) {
      obj.name = 'Capsule';
      obj.params.primitive = 'capsule';
      obj.params.params = { sx: 40, sy: 70, sz: 40, detail: 16 };
      obj.params.transform = { x: 0, y: 46, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      obj.params.visibility = 'solid';
      obj.params.role = 'solid';
      // Style left at the scene default on purpose — this is the document the
      // defect was reported on, not a fixture tuned to flatter the sweep.
    }

    eng.computeAllDisplayGeometry();
    eng.activeLayerId = gid;
    window.app.renderer.selectedLayerIds = new Set();
    window.app.renderer.resize();
    window.app.renderer.center();
    window.app.render();
    const g = eng.getLayerById(gid);
    return {
      gid,
      scenePaths: (g.scenePaths || []).length,
      groundChild: kids().some((l) => l.type === 'sceneGround3d'),
      layerPaths: (g.paths || []).length,
    };
  });
  console.log(`[${TAG}] BUILT ${JSON.stringify(built)}`);

  // ── set Line Sort through the REAL Export-modal controls ───────────────
  await page.evaluate(() => { window.app.ui.openExportModal(); });
  await page.waitForSelector('#export-modal-root', { timeout: 10000 });
  // The Line Sort card lives in the "Optimization" section of the modal nav.
  await page.evaluate(() => {
    const nav = document.querySelector('#export-modal-nav');
    const btn = Array.from(nav ? nav.querySelectorAll('button') : [])
      .find((b) => /sort/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await page.waitForTimeout(300);

  const uiSet = await page.evaluate(() => {
    const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
    // Identify each Line Sort select by its OPTION SET (the visible labels
    // carry an "i" info affix, so text matching is brittle).
    const sels = Array.from(document.querySelectorAll('#export-settings-scroll select'))
      .filter((s) => s.offsetParent);
    const byOpts = (...want) => sels.find((s) => {
      const v = Array.from(s.options).map((o) => o.value);
      return want.every((w) => v.includes(w)) && v.length === want.length;
    });
    const method = byOpts('nearest', 'greedy', 'angle', 'asdrawn');
    const direction = byOpts('none', 'horizontal', 'vertical', 'radial');
    const grouping = byOpts('layer', 'pen', 'combined');
    if (!direction) return { ok: false, why: 'no direction select visible' };
    // "Apply" is the first checkbox in the owning card's header.
    const card = direction.closest('.optimization-card');
    const apply = card && card.querySelector('.optimization-card-actions input[type="checkbox"]');
    if (apply && !apply.checked) { apply.checked = true; fire(apply, 'change'); }
    const set = (sel, value) => { if (!sel) return null; sel.value = value; fire(sel, 'change'); return sel.value; };
    // Re-query after the Apply toggle rebuilt the controls.
    const again = () => Array.from(document.querySelectorAll('#export-settings-scroll select')).filter((s) => s.offsetParent);
    const pick = (...want) => again().find((s) => {
      const v = Array.from(s.options).map((o) => o.value);
      return want.every((w) => v.includes(w)) && v.length === want.length;
    });
    const out = {
      ok: true,
      method: set(pick('nearest', 'greedy', 'angle', 'asdrawn') || method, 'nearest'),
      direction: set(pick('none', 'horizontal', 'vertical', 'radial') || direction, 'vertical'),
      grouping: set(pick('layer', 'pen', 'combined') || grouping, 'combined'),
    };
    return out;
  });
  console.log(`[${TAG}] UI LINE SORT ${JSON.stringify(uiSet)}`);
  await page.waitForTimeout(400);
  const modal = await page.$('#export-modal-root');
  if (modal) await modal.screenshot({ path: path.join(OUT, `${TAG}__00-linesort-panel.png`) });

  // What the app itself thinks is configured, read back from the layer.
  const configured = await page.evaluate(() => {
    const eng = window.app.engine;
    return eng.layers.map((l) => ({
      name: l.name, isGroup: !!l.isGroup,
      linesort: (eng.ensureLayerOptimization(l).steps || []).find((s) => s.id === 'linesort'),
    })).filter((r) => r.linesort);
  });
  console.log(`[${TAG}] CONFIGURED ${JSON.stringify(configured, null, 1)}`);

  // ── export the SVG from THIS document, straight out of the modal ───────
  const svg = await page.evaluate(() => {
    let captured = null;
    const OrigBlob = window.Blob;
    window.Blob = function (parts, opts) {
      if (opts && opts.type === 'image/svg+xml' && captured == null) captured = String(parts[0]);
      return new OrigBlob(parts, opts);
    };
    try { window.app.ui.exportSVG(); } finally { window.Blob = OrigBlob; }
    return captured;
  });
  fs.writeFileSync(path.join(OUT, `${TAG}__capsule-scene.svg`), svg || '');
  console.log(`[${TAG}] SVG bytes=${(svg || '').length} paths=${((svg || '').match(/<path[\s>]/g) || []).length}`);

  // close the modal
  await page.evaluate(() => {
    const close = document.querySelector('#export-modal-root [data-export-close], #export-modal-root .export-modal-close');
    if (close) close.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const root = document.querySelector('#export-modal-root');
    if (root) root.remove();
    if (window.app.renderer) window.app.renderer.exportModalOpen = false;
    window.app.ui.exportModalState = { isOpen: false };
    window.app.render();
  });
  await page.waitForTimeout(200);

  // ── scrub the main-canvas Draw Order slider ────────────────────────────
  const frames = [];
  for (const pct of STOPS) {
    const stat = await page.evaluate((p) => {
      const input = document.getElementById('draw-order-input');
      input.value = String(p);
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Measure the ink front: the lowest-sitting path (by centroid) the reveal
      // has reached, and how many paths are inked.
      const R = window.Vectura.Renderer;
      const PU = window.Vectura.OptimizationUtils;
      const rec = window.app.renderer.buildPlotRecords();
      const S = window.Vectura.SETTINGS;
      const reveal = R.computePlotRevealOrder(rec, {
        drawProgress: p / 100, drawSpeed: S.speedDown, travelSpeed: S.speedUp,
      });
      let n = 0; let front = -Infinity; let top = Infinity;
      rec.forEach((r) => {
        const info = reveal.info.get(r.path);
        if (p < 100 && (!info || reveal.threshold - info.drawStart <= 0)) return;
        n += 1;
        const c = PU.pathCentroid(r.path);
        front = Math.max(front, c.y);
        top = Math.min(top, c.y);
      });
      return { pct: p, inked: n, total: rec.length, frontY: front, topY: top };
    }, pct);
    await page.waitForTimeout(250);
    const canvas = await page.$('#canvas, canvas');
    await canvas.screenshot({ path: path.join(OUT, `${TAG}__reveal-${String(pct).padStart(3, '0')}.png`) });
    // Full window too, so the Draw Order readout is visible beside the art.
    await page.screenshot({ path: path.join(OUT, `${TAG}__app-${String(pct).padStart(3, '0')}.png`) });
    frames.push(stat);
    console.log(`[${TAG}] reveal ${pct}% inked=${stat.inked}/${stat.total} frontY=${Number(stat.frontY).toFixed(1)}`);
  }

  // ── does the exported order match the on-canvas plot order? ────────────
  const orderMatch = await page.evaluate(() => {
    const PU = window.Vectura.OptimizationUtils;
    // The exported set is not the canvas set item-for-item under the default
    // settings — margin cropping splits and drops geometry outside the plot
    // area. What must hold is that the exported items are emitted in the same
    // ORDER: meta.lineSortOrder non-decreasing inside every pen group, which is
    // exactly the sequence the canvas reveal walks.
    const groups = window.app.ui.getExportSnapshot().groups;
    const perGroup = groups.map((g) => {
      const orders = g.items
        .map((i) => (i.path && i.path.meta ? i.path.meta.lineSortOrder : undefined))
        .filter((v) => Number.isFinite(v));
      let inversions = 0;
      for (let i = 1; i < orders.length; i++) if (orders[i] < orders[i - 1]) inversions += 1;
      const ys = g.items.map((i) => PU.pathCentroid(i.path).y);
      return {
        pen: g.key, items: g.items.length, ordered: orders.length, inversions,
        firstY: +ys[0].toFixed(1), lastY: +ys[ys.length - 1].toFixed(1),
      };
    });
    const canvas = window.app.renderer.getDrawOrderSequence();
    return {
      canvasSequence: canvas.length,
      exportedItems: groups.reduce((n, g) => n + g.items.length, 0),
      perGroup,
    };
  });
  console.log(`[${TAG}] ORDER ${JSON.stringify(orderMatch)}`);

  fs.writeFileSync(path.join(OUT, `${TAG}__metrics.json`), JSON.stringify(
    { provenance: prov, built, uiSet, configured, frames, orderMatch, svgBytes: (svg || '').length,
      svgPaths: ((svg || '').match(/<path[\s>]/g) || []).length }, null, 2));
  fs.writeFileSync(path.join(OUT, `${TAG}__console.txt`), consoleMsgs.join('\n'));
  console.log(`[${TAG}] CONSOLE (${consoleMsgs.length})`);
  consoleMsgs.slice(0, 20).forEach((m) => console.log('   ', m.slice(0, 300)));
  await browser.close();
})();
