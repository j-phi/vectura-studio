/* W-28b evidence — face-count fast path for the imported-mesh fill-style
 * picker cap (STILL-OPEN.md / LEDGER row 20 / 28 / 21d).
 *
 * Before this fix, EVERY imported mesh was unconditionally cap-limited
 * (W-28): the picker offered only 'none'/'ladder' (2 of 49 fill styles) no
 * matter the mesh's real size, because the picker's `isCapLimited` had no
 * channel to the mesh's real face count at pick time.
 *
 * `engine.importMeshAsScene` (via `buildImportedMeshParams`) DOES store the
 * mesh's real TOTAL face count at import time, in
 * `params.importedMesh.faces.length` (engine.js ~593 / ~1244). This fix adds
 * a `totalFaces` argument through `isCapLimited` / `isReachableOn` /
 * `groups` / `facetedNote` (src/config/context-bar.js) and wires it from
 * that stored count at the three picker call sites
 * (src/ui/panels/scene3d-panel.js). front-facing face count is always <=
 * total face count, so an import whose TOTAL is at or under
 * `MONO_MAX_FRONT_FACES` (scene3d.js:2634, ==12) can never present more than
 * 12 camera-facing faces either, from ANY angle — a hard geometric
 * guarantee, not a guess — so `totalFaces <= 12` is a safe "not cap-limited"
 * fast path. Above 12, or when totalFaces is unavailable, the picker keeps
 * the unconditional W-28 answer.
 *
 * This script drives the REAL running app (not a static isCapLimited read):
 * imports a 12-face cube OBJ (the real `Vectura.ObjImport.parse` +
 * `engine.importMeshAsScene` pipeline, exactly what the Import 3D Model menu
 * action calls) and, separately, an 80-face geodesic sphere, selects each
 * imported object in turn, opens its docked Style tab, and captures the real
 * Fill Style <select>. A native <select> dropdown is not screenshot-
 * capturable headless (it paints as a separate OS/browser surface), so
 * `select.size` is temporarily raised JUST for the capture, rendering the
 * SAME underlying <option> elements/disabled flags/labels as an inline
 * listbox instead of a closed dropdown — the picker's real disabled state is
 * untouched.
 *
 *   node scripts/w28b-face-count-threshold-evidence.js [baseUrl] [outDir]
 * With no baseUrl, starts and kills its own dev server on port 8476.
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const PORT = 8476;
const WORKTREE_ROOT = path.resolve(__dirname, '..');
const argBaseUrl = process.argv[2];
const baseUrl = argBaseUrl || `http://localhost:${PORT}`;
const outDir = process.argv[3]
  || '/Users/jayphi/Documents/github/vectura-studio/docs/3d-audit/fill-audit/after/W-28b';

const CUBE_OBJ = `# cube - 6 quad faces -> 12 triangles after parse (exactly at the <=12 boundary)
v -1 -1 -1
v  1 -1 -1
v  1  1 -1
v -1  1 -1
v -1 -1  1
v  1 -1  1
v  1  1  1
v -1  1  1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

const waitForServer = (url, timeoutMs) => new Promise((resolve, reject) => {
  const started = Date.now();
  const attempt = () => {
    const http = require('http');
    const req = http.get(url, (res) => { res.resume(); resolve(); });
    req.on('error', () => {
      if (Date.now() - started > timeoutMs) reject(new Error(`server never came up: ${url}`));
      else setTimeout(attempt, 200);
    });
  };
  attempt();
});

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });

  let serverProc = null;
  if (!argBaseUrl) {
    serverProc = spawn('node', ['scripts/dev-server.js', String(PORT)], {
      cwd: WORKTREE_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stdout.on('data', () => {});
    serverProc.stderr.on('data', (d) => process.stderr.write(`[dev-server] ${d}`));
    await waitForServer(`${baseUrl}/index.html`, 15000);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const report = { id: 'W-28b', baseUrl, cases: [] };

  try {
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => window.app && window.app.engine && window.app.renderer && window.app.ui,
      null, { timeout: 90000 },
    );
    const version = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');
    report.appVersion = version;
    console.log('served version', version);

    // ── Case A: a 12-face cube import (<=12, the fast-path boundary) ───────
    const buildAndSelect = (mode) => page.evaluate(({ mode, CUBE_OBJ }) => {
      const app = window.app;
      const engine = app.engine;
      engine.layers = [];
      let result;
      if (mode === 'small') {
        const mesh = window.Vectura.ObjImport.parse(CUBE_OBJ, 'cube.obj');
        result = engine.importMeshAsScene(mesh, 'Small import (12 faces)');
      } else {
        const geo = window.Vectura.Scene3D.Mesh.createGeodesicMesh(1, 2); // 80 faces
        const mesh = { vertices: geo.vertices, faces: geo.faces };
        result = engine.importMeshAsScene(mesh, 'Large import (80 faces)');
      }
      // engine.importMeshAsScene already sets engine.activeLayerId = childId.
      app.ui.renderLayers();
      app.ui.buildControls();
      const child = engine.getLayerById(result.childId);
      return {
        ok: result.ok,
        totalFaces: child.params.params.importedMesh.faces.length,
        solidType: child.params.params.solidType,
      };
    }, { mode, CUBE_OBJ });

    const openStyleTabAndReadSelect = async () => {
      const styleTab = page.locator('#dynamic-controls .tab-bar .tab-btn[data-value="style"]');
      await styleTab.waitFor({ state: 'visible', timeout: 10000 });
      await styleTab.click();
      const select = page.locator('#dynamic-controls select[aria-label="Fill style"]');
      await select.waitFor({ state: 'attached', timeout: 10000 });
      const options = await select.evaluate((el) => Array.from(el.options).map((o) => ({
        value: o.value, label: o.textContent, disabled: o.disabled,
      })));
      const noteEl = page.locator('#dynamic-controls').getByText(/no planar fill support|greyed out above draw exactly like Ladder/).first();
      const noteText = (await noteEl.count()) ? (await noteEl.first().textContent()).trim() : '(no faceted note present)';
      return { options, noteText, selectHandle: select };
    };

    const captureCase = async (mode, label, fileBase) => {
      const built = await buildAndSelect(mode);
      const { options, noteText, selectHandle } = await openStyleTabAndReadSelect();
      const enabledCount = options.filter((o) => !o.disabled).length;
      const disabledCount = options.filter((o) => o.disabled).length;

      // Collapsed (real, unmodified) state first.
      const panel = page.locator('#dynamic-controls');
      await panel.screenshot({ path: path.join(outDir, 'shots', `${fileBase}-collapsed.png`) });

      // Then force the SAME select into a visible listbox for the capture
      // only (does not change .disabled/.value on any option).
      await selectHandle.evaluate((el) => {
        el.dataset.__w28bOrigSize = String(el.size || 0);
        el.size = Math.min(el.options.length, 16);
        el.style.height = 'auto';
      });
      await panel.screenshot({ path: path.join(outDir, 'shots', `${fileBase}-expanded.png`) });
      await selectHandle.evaluate((el) => {
        const orig = Number(el.dataset.__w28bOrigSize || 0);
        el.size = orig;
        delete el.dataset.__w28bOrigSize;
      });

      const entry = {
        label,
        mode,
        totalFaces: built.totalFaces,
        solidType: built.solidType,
        optionCount: options.length,
        enabledCount,
        disabledCount,
        noteText,
        options,
      };
      report.cases.push(entry);
      console.log(label, JSON.stringify({ totalFaces: built.totalFaces, enabledCount, disabledCount }));
    };

    await captureCase('small', 'A — 12-face cube import (<=12, fast path applies)', 'A-small-12face');
    await captureCase('large', 'B — 80-face geodesic import (>12, stays cap-limited)', 'B-large-80face');
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('wrote', path.join(outDir, 'report.json'));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
