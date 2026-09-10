/* W-30d evidence — the shadow-receive footprint HOLE-accuracy fix (F2a: torus
 * caster hull HOLE now preserved, via `Shadows.footprintRings`) and the
 * thin-torus blank-void fix (graded inward search replaces the single 0.9
 * fraction), shot in the REAL app, before/after, on TWO servers.
 *
 * No manifest cell exercises `shadowReceiveOnObjects` at all (W-30c-plan.md
 * §6, re-confirmed by W-30c-impl.md) — bespoke scenes throughout, per
 * AGENT-PROTOCOL.md.
 *
 * Two evidence sets:
 *   1. w30d-footprint-hole — sphere/box/torus x point/directional, before
 *      (2d931b1a — this lane's HEAD immediately before this unit, F2b done /
 *      F2a not) vs after (this worktree). The torus cells are the money shot:
 *      before shows a SOLID blob (F2b's fix made it visible but hole-filled,
 *      R2); after must show a genuine ANNULUS with an open hole.
 *   2. w30d-thin-torus — the razor-thin torus rig (sx=180/sy=3/sz=180), before
 *      (83d1e021 — this unit's own F2a-only commit, single 0.9 fraction) vs
 *      after (this worktree, graded fractions). Before must show NO visible
 *      shadow (the blank-void bug); after must show a clear annular shadow.
 *
 * True before/after: PORT_FIXED (8482, this lane's own assigned port) serves
 * THIS worktree; PORT_PRE (8483, throwaway) serves a `git archive` of the
 * relevant pinned SHA for each set in turn (re-used sequentially, killed and
 * restarted between sets since the two sets pin DIFFERENT SHAs) — the same
 * scratch-export convention W-30b/W-30c's evidence scripts used. Both killed
 * on exit (success or failure).
 *
 *   node scripts/w30d-shadows-evidence.js [outDir]
 *
 * Default outDir = docs/3d-audit/fill-audit/after/W-30d (pass MAIN's absolute
 * path explicitly — this script's own worktree is not necessarily where the
 * gallery output should land). Pre-SHA scratch roots are fixed constants
 * below (pre-created via `git archive <sha> | tar -x`, node_modules symlinked).
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const THIS_ROOT = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(THIS_ROOT, 'docs/3d-audit/fill-audit/after/W-30d'));
const SCRATCH = '/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/85578c5a-c89b-4e50-b45b-df0e42b19e84/scratchpad';
const PRE_HOLE_ROOT = path.join(SCRATCH, 'w30d-pre-hole'); // 2d931b1a
const PRE_THIN_ROOT = path.join(SCRATCH, 'w30d-pre-thin'); // 83d1e021

const PORT_FIXED = 8482;
const PORT_PRE = 8483;

const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const TONE = { enabled: true, bands: 2, thresholds: [0.3], ladder: [0.1, 0.95] };

const RECEIVER = {
  id: 'receiver', name: 'receiver', primitive: 'plane', params: { sx: 500, sz: 500 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const SPHERE = {
  id: 'caster', name: 'caster', primitive: 'sphere', params: { radius: 20, detail: 20 },
  transform: { x: 60, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const BOX = {
  id: 'caster', name: 'caster', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 60, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const TORUS = {
  id: 'caster', name: 'caster', primitive: 'torus', params: { sx: 40, sy: 12, sz: 40, detail: 24 },
  transform: { x: 60, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
// Razor-thin rig from scene3d-shadow-footprint-torus-thin-blank.test.js.
const THIN_TORUS = {
  id: 'caster', name: 'caster', primitive: 'torus', params: { sx: 180, sy: 3, sz: 180, detail: 24 },
  transform: { x: 60, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};

// W-30c's own less-grazing light (reused so the ellipse is legible).
const POINT_LESS_GRAZING = {
  id: 'p1', type: 'point', position: { x: -160, y: 260, z: 60 }, range: 2000, intensity: 4, castShadows: true,
};
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25, intensity: 1, castShadows: true };

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

async function withPage(baseUrl, fn) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  const ver = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');
  try {
    const result = await fn(page);
    return { ...result, ver, errors };
  } finally {
    await browser.close();
  }
}

const build = (page, {
  caster, light, lights, shadowOn = true,
}) => page.evaluate(({
  casterObj, receiverObj, light, lights, CAMERA, TONE, styleTable, shadowOn,
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
  p.lights = lights || [light];
  p.tone = TONE;
  p.shadow = { ...(p.shadow || {}), shadowReceiveOnObjects: !!shadowOn };
  p.styleTable = styleTable;
  engine.computeAllDisplayGeometry();
  app.render();
  const paths = g.scenePaths || [];
  const receiverFills = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
    && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'receiver');
  return { layerId: gid, total: paths.length, receiverFillCount: receiverFills.length };
}, {
  casterObj: caster, receiverObj: RECEIVER, light, lights, CAMERA, TONE, styleTable: styleTable(), shadowOn,
});

const frameWorldWindow = (page, worldPts, marginFrac) => page.evaluate(({ CAMERA, worldPts, marginFrac }) => {
  const bounds = window.app.engine.getBounds();
  const pts = worldPts.map((w) => window.Vectura.Scene3D.Scene.projectWorldPoint(w, CAMERA, bounds));
  const minx = Math.min(...pts.map((p) => p.x)); const maxx = Math.max(...pts.map((p) => p.x));
  const miny = Math.min(...pts.map((p) => p.y)); const maxy = Math.max(...pts.map((p) => p.y));
  const r = window.app.renderer;
  const rect = r.canvas.getBoundingClientRect();
  const cw = rect.width; const ch = rect.height;
  const pw = (maxx - minx) || 1; const ph = (maxy - miny) || 1;
  const margin = 1 + marginFrac;
  const scale = Math.min(cw / (pw * margin), ch / (ph * margin));
  r.scale = scale;
  r.offsetX = cw / 2 - scale * (minx + maxx) / 2;
  r.offsetY = ch / 2 - scale * (miny + maxy) / 2;
  r.userHasManipulated = true; r.draw();
  return {
    minx, maxx, miny, maxy, scale, offsetX: r.offsetX, offsetY: r.offsetY,
  };
}, { CAMERA, worldPts, marginFrac });

const shot = (page, sx, sy, sw, sh, cap) => page.evaluate(({
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

const save = async (page, file, sx, sy, sw, sh, cap) => {
  const url = await shot(page, sx, sy, sw, sh, cap || 0);
  fs.writeFileSync(path.join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
  return file;
};

const FOOTPRINT_WINDOW = [
  { x: -80, y: 0, z: -180 }, { x: -80, y: 0, z: 180 },
  { x: -80, y: 80, z: -180 }, { x: -80, y: 80, z: 180 },
  { x: 330, y: 0, z: -180 }, { x: 330, y: 0, z: 180 },
  { x: 330, y: 80, z: -180 }, { x: 330, y: 80, z: 180 },
];
const THIN_TORUS_WINDOW = [
  { x: -100, y: 0, z: -160 }, { x: -100, y: 0, z: 160 },
  { x: 220, y: 0, z: -160 }, { x: 220, y: 0, z: 160 },
  { x: -100, y: 80, z: -160 }, { x: 220, y: 80, z: 160 },
];

// 1. Footprint hole: sphere/box/torus x point/directional, before (2d931b1a)/after.
async function shootFootprintHole(report, preBaseUrl) {
  const casters = [['sphere', SPHERE], ['box', BOX], ['torus', TORUS]];
  const lights = [['point', POINT_LESS_GRAZING], ['directional', SUN]];
  report.footprintHole = {};
  for (const [portLabel, baseUrl] of [['after', `http://127.0.0.1:${PORT_FIXED}`], ['before', preBaseUrl]]) {
    // eslint-disable-next-line no-await-in-loop
    await withPage(baseUrl, async (page) => {
      for (const [cname, caster] of casters) {
        for (const [lname, light] of lights) {
          const key = `${cname}-${lname}-${portLabel}`;
          // eslint-disable-next-line no-await-in-loop
          const stats = await build(page, { caster, light });
          // eslint-disable-next-line no-await-in-loop
          await frameWorldWindow(page, FOOTPRINT_WINDOW, 0.15);
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(200);
          // eslint-disable-next-line no-await-in-loop
          const rect = await page.evaluate(() => {
            const r = window.app.renderer; const c = r.canvas.getBoundingClientRect();
            return { width: c.width, height: c.height };
          });
          // eslint-disable-next-line no-await-in-loop
          await save(page, `hole-${key}.png`, 0, 0, rect.width, rect.height, 1600);
          report.footprintHole[key] = stats;
        }
      }
      return {};
    });
  }
}

// 2. Thin-torus blank-void: razor-thin rig, before (83d1e021)/after.
async function shootThinTorus(report, preBaseUrl) {
  report.thinTorus = {};
  for (const [portLabel, baseUrl] of [['after', `http://127.0.0.1:${PORT_FIXED}`], ['before', preBaseUrl]]) {
    // eslint-disable-next-line no-await-in-loop
    await withPage(baseUrl, async (page) => {
      // eslint-disable-next-line no-await-in-loop
      const stats = await build(page, { caster: THIN_TORUS, light: SUN });
      // eslint-disable-next-line no-await-in-loop
      await frameWorldWindow(page, THIN_TORUS_WINDOW, 0.15);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(200);
      // eslint-disable-next-line no-await-in-loop
      const rect = await page.evaluate(() => {
        const r = window.app.renderer; const c = r.canvas.getBoundingClientRect();
        return { width: c.width, height: c.height };
      });
      // eslint-disable-next-line no-await-in-loop
      await save(page, `thin-torus-${portLabel}.png`, 0, 0, rect.width, rect.height, 1600);
      report.thinTorus[portLabel] = stats;
      return {};
    });
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const report = { generatedAt: new Date().toISOString() };
  let fixedServer;
  let preServer;
  try {
    fixedServer = await ensureServer(PORT_FIXED, THIS_ROOT);

    preServer = await ensureServer(PORT_PRE, PRE_HOLE_ROOT);
    await shootFootprintHole(report, `http://127.0.0.1:${PORT_PRE}`);
    killServer(preServer); preServer = null;

    preServer = await ensureServer(PORT_PRE, PRE_THIN_ROOT);
    await shootThinTorus(report, `http://127.0.0.1:${PORT_PRE}`);
    killServer(preServer); preServer = null;

    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log('DONE', outDir);
  } finally {
    killServer(fixedServer);
    killServer(preServer);
  }
})();
