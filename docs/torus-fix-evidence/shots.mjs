/*
 * F2 evidence capture — the ribbon pipeline on a TORUS, in the running app.
 *
 *   node docs/torus-fix-evidence/shots.mjs <port> <tag>
 *
 * `before` is served from a `git archive` of the pre-fix commit, `after` from
 * the worktree. Each case gets a full view plus two tight crops: one across the
 * inner HOLE (where the fix must not leak ink) and one on the outer LIMB (where
 * it must not protrude). A sphere is captured as the control.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const port = process.argv[2] || '8415';
const tag = process.argv[3] || 'after';
const OUT = path.resolve('docs/torus-fix-evidence');
fs.mkdirSync(OUT, { recursive: true });

const CASES = [
  { primitive: 'torus', law: 'taperedEnds' },
  { primitive: 'torus', law: 'ampSpacing' },
  { primitive: 'sphere', law: 'taperedEnds' },
  // Tipped up until the hole is unmistakably open. Bucket A (`ladder`), so this
  // one is not about ribbons at all: it shows WHICH SHEET of the torus the fill
  // is drawn on, which is the thing the normal-orientation fix corrects.
  { primitive: 'torus', law: 'ladder', pitch: 45, name: 'torus-open-hole' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.app && window.app.engine, null, { timeout: 30000 });

const report = {};

for (const { primitive, law, pitch, name } of CASES) {
  const meta = await page.evaluate(async ([prim, toneLaw, camPitch]) => {
    const app = window.app;
    // One object on the stage, driven exactly as the UI drives it.
    app.engine.layers.slice().forEach((l) => { if (!l.parentId) app.engine.removeLayer(l.id); });
    const groupId = app.engine.addLayer('scene3d');
    const obj = app.engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = prim;
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
    if (camPitch != null) {
      const g = app.engine.layers.find((l) => l.id === groupId);
      g.params.camera = { ...(g.params.camera || {}), pitch: camPitch };
    }
    app.engine.computeAllDisplayGeometry();

    const group = app.engine.layers.find((l) => l.id === groupId);
    const paths = (group.scenePaths || [])
      .filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === obj.id);
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    paths.forEach((p) => p.forEach((q) => {
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }));

    // Frame the object: fill the canvas with a small margin.
    const r = app.renderer;
    const cv = document.getElementById('main-canvas');
    const rect = cv.getBoundingClientRect();
    const pad = 0.08;
    const s = Math.min((rect.width * (1 - 2 * pad)) / (x1 - x0), (rect.height * (1 - 2 * pad)) / (y1 - y0));
    r.scale = s;
    r.offsetX = rect.width / 2 - ((x0 + x1) / 2) * s;
    r.offsetY = rect.height / 2 - ((y0 + y1) / 2) * s;
    r.draw();

    const stats = window.Vectura.Scene3D.SurfaceFill.lastRibbonStats;
    const toCanvas = (wx, wy) => ({ x: rect.x + wx * s + r.offsetX, y: rect.y + wy * s + r.offsetY });
    return {
      bbox: [x0, y0, x1, y1],
      canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      objTL: toCanvas(x0, y0),
      objBR: toCanvas(x1, y1),
      paths: paths.length,
      stats: {
        wide: stats.wide, ribbons: stats.ribbons, degenerate: stats.degenerate,
        noRing: stats.noRing, clipEmpty: stats.clipEmpty, erodeEmpty: stats.erodeEmpty,
        regionRings: stats.regionRings, regionArea: stats.regionArea,
        regionOuterArea: stats.regionOuterArea,
      },
    };
  }, [primitive, law, pitch == null ? null : pitch]);

  const base = `${tag}-${name || `${primitive}-${law}`}`;
  await page.screenshot({ path: path.join(OUT, `${base}-full.png`), clip: meta.canvas });

  const w = meta.objBR.x - meta.objTL.x;
  const h = meta.objBR.y - meta.objTL.y;
  // The inner hole sits at the middle of the form; the limb at its right edge.
  await page.screenshot({
    path: path.join(OUT, `${base}-crop-hole.png`),
    clip: { x: meta.objTL.x + w * 0.28, y: meta.objTL.y + h * 0.32, width: w * 0.44, height: h * 0.36 },
  });
  await page.screenshot({
    path: path.join(OUT, `${base}-crop-limb.png`),
    clip: { x: meta.objTL.x + w * 0.74, y: meta.objTL.y + h * 0.2, width: w * 0.26, height: h * 0.6 },
  });

  report[base] = meta.stats;
  console.log(base, JSON.stringify(meta.stats));
}

fs.writeFileSync(path.join(OUT, `stats-${tag}.json`), JSON.stringify(report, null, 2));
await browser.close();
