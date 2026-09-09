/* W-30c evidence — the shadows.js correctness sweep (F1 area-light gate,
 * F2b occlusion-valid tone sample, F3 lights[0]-ambient footprint fix),
 * shot in the REAL app, before/after, on TWO servers.
 *
 * No manifest cell exercises `shadowReceiveOnObjects` at all (W-30c-plan.md
 * §6: 0 hits across manifest.A + manifest.B, no point/area light in any
 * cell) — bespoke scenes throughout, per AGENT-PROTOCOL.md.
 *
 * Three evidence sets, matching the plan's §6 list:
 *   1. w30c-footprint-shapes  — sphere/box/torus x point/directional, before/after
 *   2. w30c-area-penumbra     — the F1 rig, before/after + intensity profile table
 *   3. w30c-multilight        — [ambient, point] before/after (F3)
 *
 * True before/after: PORT_FIXED (8482, this lane's own assigned port) serves
 * THIS worktree; PORT_PRE (8483, throwaway) serves a `git archive` of this
 * lane's HEAD at the W-30c briefing (90f3411f, before F1/F2b/F3) — the same
 * scratch-export convention W-30b's evidence script used. Both killed on
 * exit (success or failure).
 *
 *   node scripts/w30c-shadows-evidence.js [outDir] [preRoot]
 *
 * Defaults: outDir = docs/3d-audit/fill-audit/after/W-30c (pass MAIN's
 * absolute path explicitly — this script's own worktree is not necessarily
 * where the gallery output should land), preRoot = the scratch export.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const THIS_ROOT = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] || path.join(THIS_ROOT, 'docs/3d-audit/fill-audit/after/W-30c'));
const preRoot = path.resolve(process.argv[3] || '/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/85578c5a-c89b-4e50-b45b-df0e42b19e84/scratchpad/w30c-pre');

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

// §6.1 — a LESS grazing light than W-30b's (-300,150,0) (aspect 2.98:1, the
// reviewer's own recommendation): (-160,260,60) gives ~1.3:1 so a viewer
// reads an ellipse, not a band.
const POINT_LESS_GRAZING = {
  id: 'p1', type: 'point', position: { x: -160, y: 260, z: 60 }, range: 2000, intensity: 4, castShadows: true,
};
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25, intensity: 1, castShadows: true };
const AMBIENT = { id: 'amb1', type: 'ambient', intensity: 0.15, castShadows: true };
// The §1c penumbra rig, reproduced.
const AREA_BOX = {
  id: 'caster', name: 'caster', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 60, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const AREA_LIGHT = {
  id: 'a1', type: 'area', position: { x: -300, y: 300, z: 0 }, size: 120, samples: 6, intensity: 1, castShadows: true,
};

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

const build = (page, { caster, light, lights, shadowOn = true }) => page.evaluate(({
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

// §6.1(ii) — frame from the FOOTPRINT's own world bbox plus a 30mm margin
// (W-30b's twelve PNGs all shared ink bbox x[67,820] y[647,1202] — the far
// end of its ellipse was never visually verifiable in any of them).
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

// 1. Footprint shapes: sphere/box/torus x point/directional, before/after.
async function shootFootprintShapes(report) {
  const WORLD_WINDOW = [
    { x: -80, y: 0, z: -180 }, { x: -80, y: 0, z: 180 },
    { x: -80, y: 80, z: -180 }, { x: -80, y: 80, z: 180 },
    { x: 330, y: 0, z: -180 }, { x: 330, y: 0, z: 180 },
    { x: 330, y: 80, z: -180 }, { x: 330, y: 80, z: 180 },
  ];
  const casters = [['sphere', SPHERE], ['box', BOX], ['torus', TORUS]];
  const lights = [['point', POINT_LESS_GRAZING], ['directional', SUN]];
  report.footprintShapes = {};
  for (const [portLabel, baseUrl] of [['after', `http://127.0.0.1:${PORT_FIXED}`], ['before', `http://127.0.0.1:${PORT_PRE}`]]) {
    // eslint-disable-next-line no-await-in-loop
    await withPage(baseUrl, async (page) => {
      for (const [cname, caster] of casters) {
        for (const [lname, light] of lights) {
          const key = `${cname}-${lname}-${portLabel}`;
          // eslint-disable-next-line no-await-in-loop
          const stats = await build(page, { caster, light });
          // eslint-disable-next-line no-await-in-loop
          await frameWorldWindow(page, WORLD_WINDOW, 0.15);
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(200);
          // eslint-disable-next-line no-await-in-loop
          const rect = await page.evaluate(() => {
            const r = window.app.renderer; const c = r.canvas.getBoundingClientRect();
            return { width: c.width, height: c.height };
          });
          // eslint-disable-next-line no-await-in-loop
          await save(page, `footprint-${key}.png`, 0, 0, rect.width, rect.height, 1600);
          report.footprintShapes[key] = stats;
        }
      }
      return {};
    });
  }
}

// 2. Area-light penumbra: F1 rig, before/after + the intensity-profile table
// (computed independently in-page via the exact combinedIntensity/pointInShadow
// calls the RGR test uses, not re-derived here).
async function shootAreaPenumbra(report) {
  const WORLD_WINDOW = [
    { x: -20, y: 0, z: -80 }, { x: -20, y: 0, z: 80 },
    { x: 180, y: 0, z: -80 }, { x: 180, y: 0, z: 80 },
    { x: -20, y: 80, z: -80 }, { x: 180, y: 80, z: 80 },
  ];
  report.areaPenumbra = {};
  for (const [portLabel, baseUrl] of [['after', `http://127.0.0.1:${PORT_FIXED}`], ['before', `http://127.0.0.1:${PORT_PRE}`]]) {
    // eslint-disable-next-line no-await-in-loop
    await withPage(baseUrl, async (page) => {
      // eslint-disable-next-line no-await-in-loop
      const stats = await build(page, { caster: AREA_BOX, light: AREA_LIGHT });
      // eslint-disable-next-line no-await-in-loop
      await frameWorldWindow(page, WORLD_WINDOW, 0.15);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(200);
      // eslint-disable-next-line no-await-in-loop
      const rect = await page.evaluate(() => {
        const r = window.app.renderer; const c = r.canvas.getBoundingClientRect();
        return { width: c.width, height: c.height };
      });
      // eslint-disable-next-line no-await-in-loop
      await save(page, `area-penumbra-${portLabel}.png`, 0, 0, rect.width, rect.height, 1600);
      // Intensity profile, computed IN-PAGE against the real occluder mesh,
      // exactly the rig scene3d-area-light-shadow-softening.test.js proves.
      // eslint-disable-next-line no-await-in-loop
      const profile = await page.evaluate(() => {
        const V = window.Vectura;
        const v = (x, y, z) => ({ x, y, z });
        const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
        const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
        const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
        const offset = (i, n, radius) => {
          const y = 1 - ((i + 0.5) / n) * 2;
          const rr = Math.sqrt(Math.max(0, 1 - y * y));
          const theta = i * GOLDEN_ANGLE;
          return v(Math.cos(theta) * rr * radius, y * radius, Math.sin(theta) * rr * radius);
        };
        const LIGHT = { id: 'a1', type: 'area', position: v(-300, 300, 0), size: 120, samples: 6, intensity: 1 };
        const N = 6; const RADIUS = 60; const NORMAL = v(0, 1, 0);
        const SceneB = V.Scene3D.Scene; const ShadowReceive = V.Scene3D.ShadowReceive; const Regions = V.Scene3D.Regions;
        const mesh = SceneB.buildPrimitiveMesh({ primitive: 'box', params: { sx: 40, sy: 40, sz: 40 } });
        const xf = { x: 0, y: 60, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
        const world = mesh.vertices.map((pt) => SceneB.applyObjectTransform(pt, xf));
        const record = { id: 'caster', faces: mesh.faces.map((idx, i) => ({ worldVerts: idx.map((vi) => world[vi]), faceId: mesh.faceIds[i] })) };
        const occ = ShadowReceive.buildOccluderSet([record]);
        const shadowFn = (wp, lt) => ShadowReceive.pointInShadow(wp, lt, occ, { excludeObjectId: 'plane' });
        const rows = [];
        for (let x = 30; x <= 140; x += 2) {
          const P = v(x, 0, 0);
          const current = Regions.combinedIntensity(NORMAL, P, [LIGHT], shadowFn);
          const unshadowed = Regions.combinedIntensity(NORMAL, P, [LIGHT], null);
          let sum = 0;
          for (let s = 0; s < N; s++) {
            const off = offset(s, N, RADIUS);
            const Ls = v(LIGHT.position.x + off.x, LIGHT.position.y + off.y, LIGHT.position.z + off.z);
            if (shadowFn(P, { type: 'point', position: Ls })) continue;
            const toL = sub(Ls, P); const dist = Math.hypot(toL.x, toL.y, toL.z);
            const dir = dist > 1e-9 ? v(toL.x / dist, toL.y / dist, toL.z / dist) : v(0, 1, 0);
            sum += Math.max(0, dot(NORMAL, dir));
          }
          rows.push({ x, current, gated: sum / N, unshadowed });
        }
        return rows;
      });
      report.areaPenumbra[portLabel] = { stats, profile };
      return {};
    });
  }
}

// 3. Multi-light: [ambient, point] before/after (F3).
async function shootMultilight(report) {
  const WORLD_WINDOW = [
    { x: -80, y: 0, z: -180 }, { x: -80, y: 0, z: 180 },
    { x: 330, y: 0, z: -180 }, { x: 330, y: 0, z: 180 },
    { x: -80, y: 80, z: -180 }, { x: 330, y: 80, z: 180 },
  ];
  report.multilight = {};
  for (const [portLabel, baseUrl] of [['after', `http://127.0.0.1:${PORT_FIXED}`], ['before', `http://127.0.0.1:${PORT_PRE}`]]) {
    // eslint-disable-next-line no-await-in-loop
    await withPage(baseUrl, async (page) => {
      // eslint-disable-next-line no-await-in-loop
      const stats = await build(page, { caster: SPHERE, lights: [AMBIENT, POINT_LESS_GRAZING] });
      // eslint-disable-next-line no-await-in-loop
      await frameWorldWindow(page, WORLD_WINDOW, 0.15);
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(200);
      // eslint-disable-next-line no-await-in-loop
      const rect = await page.evaluate(() => {
        const r = window.app.renderer; const c = r.canvas.getBoundingClientRect();
        return { width: c.width, height: c.height };
      });
      // eslint-disable-next-line no-await-in-loop
      await save(page, `multilight-${portLabel}.png`, 0, 0, rect.width, rect.height, 1600);
      report.multilight[portLabel] = stats;
      return {};
    });
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  let fixedServer;
  let preServer;
  const report = { generatedAt: new Date().toISOString() };
  try {
    fixedServer = await ensureServer(PORT_FIXED, THIS_ROOT);
    preServer = await ensureServer(PORT_PRE, preRoot);

    await shootFootprintShapes(report);
    await shootAreaPenumbra(report);
    await shootMultilight(report);

    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log('DONE', outDir);
  } finally {
    killServer(fixedServer);
    killServer(preServer);
  }
})();
