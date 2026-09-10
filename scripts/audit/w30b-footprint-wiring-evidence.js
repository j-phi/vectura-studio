/* W-30b evidence — buildFaceFootprint wired to the W-30 per-light-type
 * projector (Shadows.projectLightToPlane), shot in the REAL app.
 *
 * No manifest cell exercises `shadowReceiveOnObjects` with a non-directional
 * light (default OFF, no gallery scene uses one) — per AGENT-PROTOCOL.md, a
 * bespoke scene instead: a sphere caster resting on a large flat PLANE
 * receiver object (NOT the special `p.ground` — `buildFaceFootprint` is the
 * per-OBJECT flat-face shadow-receive path, `shadowReceiveOnObjects`, the
 * exact mechanism this unit rewires), shot with a POINT light and a SPOT
 * light, both far off to one side.
 *
 * True before/after: this script starts TWO dev servers — port 8482 serving
 * THIS worktree (the fix) and a throwaway port serving a `git archive` of
 * this lane's pre-fix commit `1e681432` (the same scratch-export convention
 * AGENT-PROTOCOL.md prescribes for reviewers) — so "before" is the actual
 * pre-fix `buildFaceFootprint`, not a simulated one. Both servers are killed
 * on exit (success or failure).
 *
 *   node scripts/audit/w30b-footprint-wiring-evidence.js [outDir] [preRoot]
 *
 * Defaults: outDir = docs/3d-audit/fill-audit/after/W-30b (relative to the
 * repo this script's OWN worktree lives in — NOT necessarily MAIN; pass an
 * absolute MAIN path explicitly, which is what the invoking session does),
 * preRoot = the scratch export directory holding the pre-fix tree.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const THIS_ROOT = path.resolve(__dirname, '..', '..');
const outDir = path.resolve(process.argv[2] || path.join(THIS_ROOT, 'docs/3d-audit/fill-audit/after/W-30b'));
const preRoot = path.resolve(process.argv[3] || '/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/85578c5a-c89b-4e50-b45b-df0e42b19e84/scratchpad/w30b-pre');

const PORT_FIXED = 8482;
const PORT_PRE = 8483;

// Smaller than the unit test's 1000x1000 (which only needed the extra room to
// avoid clipping a corner-case corner projection) — `zoom()` below fits the
// WHOLE ink bbox first, and a 1000-unit plane fits so wide the caster (world
// x=60) shrinks to a speck near one corner, making a probe-centred crop
// fragile. 500 comfortably contains the ~x=220 footprint extent (see the
// unit test's hull math) while keeping the caster a sane fraction of frame.
const RECEIVER = {
  id: 'receiver', name: 'receiver', primitive: 'plane', params: { sx: 500, sz: 500 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const CASTER = {
  id: 'caster', name: 'caster', primitive: 'sphere', params: { radius: 20, detail: 20 },
  transform: { x: 60, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const POINT_LIGHT = {
  id: 'p1', type: 'point', position: { x: -300, y: 150, z: 0 }, range: 2000, intensity: 4, castShadows: true,
};
const SPOT_LIGHT = {
  id: 's1',
  type: 'spot',
  position: { x: -300, y: 150, z: 0 },
  target: { x: 60, y: 0, z: 0 },
  coneAngle: 45,
  penumbra: 10,
  range: 2000,
  intensity: 4,
  castShadows: true,
};
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25, intensity: 1, castShadows: true };
const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const TONE = { enabled: true, bands: 2, thresholds: [0.3], ladder: [0.1, 0.95] };

const styleTable = () => ({
  scene: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
  byObject: {
    receiver: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
    caster: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
  },
  byFace: {},
});

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

async function ensureServer(port, root) {
  if (await pingServer(port)) throw new Error(`port ${port} already in use — refusing to reuse a server this script did not start`);
  const child = spawn('node', [path.join(root, 'scripts/dev-server.js'), String(port)], {
    cwd: root, stdio: 'ignore', detached: true,
  });
  child.unref();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await pingServer(port)) return child;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server on port ${port} (root ${root}) did not come up in time`);
}

function killServer(child) {
  if (!child || !child.pid) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { /* already dead */ }
}

async function captureScene(baseUrl, label, light, outPrefix) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  const ver = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');

  const build = () => page.evaluate(({
    casterObj, receiverObj, light, CAMERA, TONE, styleTable,
  }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: false }; p.backdrop = { enabled: false };
    p.objects = [casterObj, receiverObj];
    p.lights = [light];
    p.tone = TONE;
    p.shadow = { ...(p.shadow || {}), shadowReceiveOnObjects: true };
    p.styleTable = styleTable;
    engine.computeAllDisplayGeometry();
    app.render();
    const paths = g.scenePaths || [];
    const receiverFills = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
      && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'receiver');
    // Paper-space bbox of every CASTER path (any kind) — the shadow starts
    // right at its base, so a margin around this bbox reliably frames the
    // footprint region regardless of exact world-to-screen math done outside
    // the render itself.
    let casterBB = null;
    paths.forEach((q) => {
      if (!(q.meta && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'caster')) return;
      q.forEach((pt) => {
        if (!casterBB) casterBB = {
          minx: pt.x, maxx: pt.x, miny: pt.y, maxy: pt.y,
        };
        else {
          casterBB.minx = Math.min(casterBB.minx, pt.x); casterBB.maxx = Math.max(casterBB.maxx, pt.x);
          casterBB.miny = Math.min(casterBB.miny, pt.y); casterBB.maxy = Math.max(casterBB.maxy, pt.y);
        }
      });
    });
    return {
      layerId: gid, total: paths.length, receiverFillCount: receiverFills.length, casterBB,
    };
  }, {
    casterObj: CASTER, receiverObj: RECEIVER, light, CAMERA, TONE, styleTable: styleTable(),
  });

  // Deterministic world-space framing instead of an ink-bbox auto-fit: the
  // "outside" hatch pass covers the WHOLE receiver face uniformly by design
  // (that's the point — only the footprint-interior pass differs), so an
  // ink-bbox fit always frames the ENTIRE plane and shrinks a small caster to
  // a speck. Framing a FIXED world-space window around the caster+footprint
  // region instead keeps the same crop across every light/before-after
  // combination, which is also the fairer basis for a side-by-side compare.
  const WORLD_WINDOW = [
    { x: -60, y: 0, z: -150 }, { x: -60, y: 0, z: 150 },
    { x: -60, y: 60, z: -150 }, { x: -60, y: 60, z: 150 },
    { x: 300, y: 0, z: -150 }, { x: 300, y: 0, z: 150 },
    { x: 300, y: 60, z: -150 }, { x: 300, y: 60, z: 150 },
  ];
  const frameWorldWindow = (margin) => page.evaluate(({ CAMERA, WORLD_WINDOW, margin }) => {
    const bounds = window.app.engine.getBounds();
    const pts = WORLD_WINDOW.map((w) => window.Vectura.Scene3D.Scene.projectWorldPoint(w, CAMERA, bounds));
    const minx = Math.min(...pts.map((p) => p.x)); const maxx = Math.max(...pts.map((p) => p.x));
    const miny = Math.min(...pts.map((p) => p.y)); const maxy = Math.max(...pts.map((p) => p.y));
    const r = window.app.renderer;
    const rect = r.canvas.getBoundingClientRect();
    const cw = rect.width; const ch = rect.height;
    const pw = (maxx - minx) || 1; const ph = (maxy - miny) || 1;
    const scale = Math.min(cw / (pw * margin), ch / (ph * margin));
    r.scale = scale;
    r.offsetX = cw / 2 - scale * (minx + maxx) / 2;
    r.offsetY = ch / 2 - scale * (miny + maxy) / 2;
    r.userHasManipulated = true; r.draw();
    return {
      minx, maxx, miny, maxy, scale, offsetX: r.offsetX, offsetY: r.offsetY,
    };
  }, { CAMERA, WORLD_WINDOW, margin });

  const shot = (sx, sy, sw, sh, cap) => page.evaluate(({
    sx, sy, sw, sh, cap,
  }) => {
    const c = document.querySelector('#main-canvas');
    const s = c.width / c.clientWidth;
    const w = Math.round(sw * s); const h = Math.round(sh * s);
    const k = cap ? Math.min(1, cap / Math.max(w, h)) : 1;
    const o = document.createElement('canvas');
    o.width = Math.round(w * k); o.height = Math.round(h * k);
    const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(c, Math.round(sx * s), Math.round(sy * s), w, h, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }, {
    sx, sy, sw, sh, cap,
  });

  const save = async (file, sx, sy, sw, sh, cap) => {
    const url = await shot(sx, sy, sw, sh, cap || 0);
    fs.writeFileSync(path.join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
    return file;
  };

  const stats = await build();
  await frameWorldWindow(1.15);
  await page.waitForTimeout(300);
  const rect = await page.evaluate(() => {
    const r = window.app.renderer;
    const c = r.canvas.getBoundingClientRect();
    return { width: c.width, height: c.height };
  });
  await save(`${outPrefix}-full.png`, 0, 0, rect.width, rect.height, 1600);
  // Native-resolution crop centred on the world point the geometric proof
  // (tests/unit/scene3d-shadow-footprint-wiring.test.js) names PROBE
  // (x=140, z=0) — inside the TRUE perspective footprint, provably outside
  // the OLD parallel/default-direction one.
  const probeScreenPaper = await page.evaluate(({ CAMERA }) => {
    const bounds = window.app.engine.getBounds();
    return window.Vectura.Scene3D.Scene.projectWorldPoint({ x: 140, y: 0, z: 0 }, CAMERA, bounds);
  }, { CAMERA });
  const toCanvasPx = (pt) => page.evaluate((pt) => {
    const r = window.app.renderer;
    return { x: pt.x * r.scale + r.offsetX, y: pt.y * r.scale + r.offsetY };
  }, pt);
  const HALFCROP = 90;
  const p1 = await toCanvasPx({ x: probeScreenPaper.x - HALFCROP, y: probeScreenPaper.y - HALFCROP });
  const p2 = await toCanvasPx({ x: probeScreenPaper.x + HALFCROP, y: probeScreenPaper.y + HALFCROP });
  const cropX = Math.min(p1.x, p2.x); const cropY = Math.min(p1.y, p2.y);
  const cropW = Math.abs(p2.x - p1.x); const cropH = Math.abs(p2.y - p1.y);
  await save(`${outPrefix}-crop.png`, cropX, cropY, cropW, cropH, 1400);

  await browser.close();
  return {
    label, ver, stats, errors,
  };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let fixedServer;
  let preServer;
  const report = { generatedAt: new Date().toISOString(), shots: {} };
  try {
    fixedServer = await ensureServer(PORT_FIXED, THIS_ROOT);
    preServer = await ensureServer(PORT_PRE, preRoot);

    report.shots.pointAfter = await captureScene(`http://127.0.0.1:${PORT_FIXED}`, 'point-after (fixed)', POINT_LIGHT, 'point-after');
    report.shots.pointBefore = await captureScene(`http://127.0.0.1:${PORT_PRE}`, 'point-before (pre-fix, pinned 1e681432)', POINT_LIGHT, 'point-before');
    report.shots.spotAfter = await captureScene(`http://127.0.0.1:${PORT_FIXED}`, 'spot-after (fixed)', SPOT_LIGHT, 'spot-after');
    report.shots.spotBefore = await captureScene(`http://127.0.0.1:${PORT_PRE}`, 'spot-before (pre-fix, pinned 1e681432)', SPOT_LIGHT, 'spot-before');
    report.shots.directionalFixed = await captureScene(`http://127.0.0.1:${PORT_FIXED}`, 'directional (fixed, byte-identity control)', SUN, 'directional-fixed');
    report.shots.directionalPre = await captureScene(`http://127.0.0.1:${PORT_PRE}`, 'directional (pre-fix, byte-identity control)', SUN, 'directional-pre');

    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log('DONE', JSON.stringify(Object.keys(report.shots)));
  } finally {
    killServer(fixedServer);
    killServer(preServer);
  }
})();
