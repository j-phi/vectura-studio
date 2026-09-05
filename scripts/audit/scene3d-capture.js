#!/usr/bin/env node
/**
 * Scene3D fill-style audit — capture harness.
 *
 * Renders the 3D Scene algorithm (src/core/algorithms/scene3d.js) across a
 * geometry x mapper x fill-style x density x camera-angle matrix in a REAL
 * headless Chromium tab, crops each shot to the object alone, and appends a
 * JSONL manifest entry (stats + pass/fail signals) per shot.
 *
 *   node scripts/audit/scene3d-capture.js --tier A --shard 1/50 --port 8460 \
 *     --out docs/3d-audit/fill-audit
 *
 * Tier A = geometry x type (mapper): every PRIMITIVE x every MAPPER, the
 *          shipped default fill style ('ladder'), 3 densities, 2 angles.
 * Tier B = type x style: a small primitive subset x every REACHABLE
 *          (mapper, fillStyle) pair (per Vectura.SCENE_FILL_STYLES.isReachableOn),
 *          3 densities, 2 angles.
 *
 * Deterministic ordering: primitives/mappers/styles are iterated in the
 * exact order the live app exposes them (no re-sorting), so the SAME
 * `--shard i/n` slice is stable across runs and across shard workers.
 * Resumable: a shot whose destination .webp already exists is skipped
 * without re-rendering (only a console note, no manifest rewrite — the
 * manifest line from the run that produced the file already covers it).
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { tier: 'A', shard: '1/1', port: 8460, out: 'docs/3d-audit/fill-audit' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--tier') out.tier = argv[++i];
    else if (a === '--shard') out.shard = argv[++i];
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--only') out.only = new RegExp(argv[++i]);
    else if (a === '--root') out.root = path.resolve(argv[++i]);
    else if (a === '--no-shard-default') out.noShardDefault = true;
  }
  return out;
}

function parseShard(spec) {
  const m = /^(\d+)\/(\d+)$/.exec(String(spec || '1/1'));
  if (!m) throw new Error(`Bad --shard "${spec}" (expected i/n, 1-based)`);
  const i = Number(m[1]);
  const n = Number(m[2]);
  if (i < 1 || i > n) throw new Error(`--shard ${spec}: i must be in 1..n`);
  return { i, n };
}

// ── Server bootstrap (reused across shards sharing one --port) ───────────
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

async function ensureServer(port, root = ROOT) {
  if (await pingServer(port)) return { started: false };
  const child = spawn('node', [path.join(root, 'scripts/dev-server.js'), String(port)], {
    cwd: root, stdio: 'ignore', detached: true,
  });
  child.unref();
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await pingServer(port)) return { started: true };
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev-server on port ${port} did not come up in time`);
}

// ── Page bootstrap ─────────────────────────────────────────────────────────
async function openPage(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  return page;
}

async function getConstants(page) {
  return page.evaluate(() => {
    const P = window.Vectura.Scene3D.Params;
    const T = window.Vectura.SCENE3D_TONE_LAWS;
    return {
      version: window.Vectura.APP_VERSION,
      PRIMITIVES: P.PRIMITIVES.slice(),
      MAPPERS: P.MAPPERS.slice(),
      DEFAULT_CAMERA: { ...P.DEFAULT_CAMERA },
      DEFAULT_FILL_STYLE: (window.Vectura.SCENE_FILL_STYLES && window.Vectura.SCENE_FILL_STYLES.DEFAULT) || 'ladder',
      TONE_LAW_IDS: T.IDS.slice(),
      SOLID_DEFAULT_TYPE: (P.PRIMITIVE_PARAM_DEFAULTS.solid && P.PRIMITIVE_PARAM_DEFAULTS.solid.solidType) || 'buckyball',
    };
  });
}

// Full fill-style roster this audit walks: the shipped default ('ladder',
// NOT itself in TONE_LAW_IDS — see src/core/scene3d/params.js clampStyleParam
// case 'toneLaw') plus the roster's 47 measured laws.
function fullStyleRoster(consts) {
  return [consts.DEFAULT_FILL_STYLE, ...consts.TONE_LAW_IDS];
}

const DENSITY_VALUES = { low: 1, med: 50, max: 220 }; // fillDensity slider (src/ui/panels/scene3d-panel.js D_DENSITY: min 1, max 220, default 50)
const ANGLE_KEYS = ['a', 'b']; // a = app default camera, b = contrasting angle
const SECOND_ANGLE = { yaw: 40, pitch: -15 };

function cameraFor(consts, angleKey) {
  if (angleKey === 'a') return { ...consts.DEFAULT_CAMERA };
  return { ...consts.DEFAULT_CAMERA, yaw: SECOND_ANGLE.yaw, pitch: SECOND_ANGLE.pitch };
}

// ── Matrix builders ────────────────────────────────────────────────────────
function buildTierA(consts) {
  const items = [];
  consts.PRIMITIVES.forEach((primitive) => {
    consts.MAPPERS.forEach((mapper) => {
      ['low', 'med', 'max'].forEach((density) => {
        ANGLE_KEYS.forEach((angle) => {
          items.push({ tier: 'A', primitive, mapper, style: consts.DEFAULT_FILL_STYLE, density, angle });
        });
      });
    });
  });
  return items;
}

const TIER_B_PRIMITIVES = ['sphere', 'torus', 'box', 'cone'];

// Ask the LIVE app which (primitive, mapper, style) triples actually differ
// from Ladder (Vectura.SCENE_FILL_STYLES.isReachableOn) — avoids duplicating
// the reachability rules (faceted/cap-limited/curved-spiral-stipple-inert/
// pyramid exceptions) documented in src/config/context-bar.js.
async function computeTierBReachability(page, consts) {
  const roster = fullStyleRoster(consts);
  return page.evaluate(({ primitives, mappers, roster, solidType }) => {
    const F = window.Vectura.SCENE_FILL_STYLES;
    const out = {};
    primitives.forEach((primitive) => {
      out[primitive] = {};
      mappers.forEach((mapper) => {
        out[primitive][mapper] = roster.filter((style) => F.isReachableOn(style, primitive, solidType, mapper));
      });
    });
    return out;
  }, { primitives: TIER_B_PRIMITIVES, mappers: consts.MAPPERS, roster, solidType: consts.SOLID_DEFAULT_TYPE });
}

function buildTierB(consts, reach) {
  const items = [];
  const unreachable = [];
  TIER_B_PRIMITIVES.forEach((primitive) => {
    consts.MAPPERS.forEach((mapper) => {
      const roster = fullStyleRoster(consts);
      const reachSet = new Set(reach[primitive][mapper]);
      roster.forEach((style) => {
        if (!reachSet.has(style)) { unreachable.push({ primitive, mapper, style }); return; }
        ['low', 'med', 'max'].forEach((density) => {
          ANGLE_KEYS.forEach((angle) => {
            items.push({ tier: 'B', primitive, mapper, style, density, angle });
          });
        });
      });
    });
  });
  return { items, unreachable };
}

// ── Shot naming ─────────────────────────────────────────────────────────
function shotRelPath(item) {
  const file = `${item.primitive}__${item.mapper}__${item.style}__${item.density}__${item.angle}.webp`;
  return path.join('shots', item.tier, file);
}

// ── In-page: build the scene, style it, generate, gather stats ───────────
async function buildAndMeasure(page, item, consts) {
  const camera = cameraFor(consts, item.angle);
  return page.evaluate(({ item, camera, densityValue, solidType }) => {
    const P = window.Vectura.Scene3D.Params;
    const app = window.app;
    const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true;
    g.containerRole = 'scene';
    const q = g.params;
    q.camera = camera;
    q.ground = { enabled: false };
    q.backdrop = { enabled: false };
    const bag = { ...(P.PRIMITIVE_PARAM_DEFAULTS[item.primitive] || {}) };
    if (item.primitive === 'solid') bag.solidType = solidType;
    const OBJ = {
      id: 'obj', name: 'Obj', primitive: item.primitive, params: bag,
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
    const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
    q.objects = [OBJ];
    q.lights = [SUN];
    const style = { penId: null, mapper: item.mapper, params: { fillAngle: 45, fillDensity: densityValue, toneLaw: item.style } };
    q.styleTable = { scene: JSON.parse(JSON.stringify(style)), byObject: { obj: JSON.parse(JSON.stringify(style)) }, byFace: {} };

    const t0 = performance.now();
    let genError = null;
    try {
      engine.computeAllDisplayGeometry();
    } catch (e) {
      genError = String(e && e.stack || e);
    }
    const genMs = Math.round(performance.now() - t0);
    if (!genError) app.render();

    const paths = (g.scenePaths || []);
    let totalPoints = 0;
    let inkMm = 0;
    const weightScales = [];
    paths.forEach((p) => {
      if (!Array.isArray(p)) return;
      totalPoints += p.length;
      for (let i = 1; i < p.length; i += 1) inkMm += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      const w = p.meta && Number(p.meta.weightScale);
      weightScales.push(Number.isFinite(w) ? w : 1);
    });

    const SF = window.Vectura.Scene3D && window.Vectura.Scene3D.SurfaceFill;
    const ribbon = (SF && SF.lastRibbonStats) ? { ...SF.lastRibbonStats } : null;
    const isRibbonLaw = !!(ribbon && ribbon.ribbonLaw === true);
    const wallOrWide = ribbon ? (Number(ribbon.wallRings) || 0) + (Number(ribbon.wide) || 0) : 0;
    const allWeightOne = weightScales.length > 0 && weightScales.every((w) => Math.abs(w - 1) < 1e-6);
    const bareCentrelinesOnly = isRibbonLaw && wallOrWide === 0 && allWeightOne;

    return {
      genError,
      genMs,
      pathCount: paths.length,
      totalPoints,
      inkMm: Math.round(inkMm * 10) / 10,
      ribbonLaw: isRibbonLaw,
      wallRings: ribbon ? (Number(ribbon.wallRings) || 0) : null,
      wide: ribbon ? (Number(ribbon.wide) || 0) : null,
      bareCentrelinesOnly,
      appVersion: window.Vectura.APP_VERSION,
    };
  }, { item, camera, densityValue: DENSITY_VALUES[item.density], solidType: consts.SOLID_DEFAULT_TYPE });
}

// Fixed zoom for every shot (a consistent framing convention, not tuned per
// primitive) — the object-only crop below then bbox-scans the ACTUAL ink,
// so the fixed zoom only has to be loose enough that no primitive's default
// size clips the canvas edge.
const FIXED_ZOOM = 3.6;

async function frameAndCrop(page) {
  await page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k;
    r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k;
    r.userHasManipulated = true;
    r.draw();
  }, FIXED_ZOOM);
  await page.waitForTimeout(120);
  return page.evaluate(({ targetWidth, quality }) => {
    const c = document.querySelector('#main-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const corner = d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114;
    let minx = 1e9; let miny = 1e9; let maxx = -1e9; let maxy = -1e9;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (Math.abs(L - corner) < 90) continue;
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
    if (maxx < minx || maxy < miny) return { empty: true };
    const pad = 12;
    const sx = Math.max(0, minx - pad);
    const sy = Math.max(0, miny - pad);
    const sw = Math.min(c.width - sx, (maxx - minx) + 2 * pad);
    const sh = Math.min(c.height - sy, (maxy - miny) + 2 * pad);
    const k = Math.min(1, targetWidth / sw);
    const o = document.createElement('canvas');
    o.width = Math.max(1, Math.round(sw * k));
    o.height = Math.max(1, Math.round(sh * k));
    const g = o.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
    return { dataUrl: o.toDataURL('image/webp', quality), width: o.width, height: o.height };
  }, { targetWidth: 800, quality: 0.82 });
}

// ── Timeout-safe per-shot runner ─────────────────────────────────────────
const SHOT_TIMEOUT_MS = 45000;

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error('shot-timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function runShot(ctx, item) {
  const rel = shotRelPath(item);
  const abs = path.join(ctx.outDir, rel);
  if (fs.existsSync(abs)) {
    console.log('skip (exists)', rel);
    return;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const startedAt = Date.now();
  let record;
  try {
    const measure = await withTimeout(buildAndMeasure(ctx.page, item, ctx.consts), SHOT_TIMEOUT_MS);
    if (measure.genError) {
      record = { ...item, status: 'error', error: measure.genError, tookMs: Date.now() - startedAt };
    } else {
      const shot = await withTimeout(frameAndCrop(ctx.page), SHOT_TIMEOUT_MS);
      if (shot.empty) {
        record = { ...item, status: 'empty-canvas', ...measure, tookMs: Date.now() - startedAt };
      } else {
        const b64 = shot.dataUrl.split(',')[1];
        fs.writeFileSync(abs, Buffer.from(b64, 'base64'));
        record = {
          ...item, status: 'ok', path: rel, imgWidth: shot.width, imgHeight: shot.height,
          ...measure, tookMs: Date.now() - startedAt,
        };
      }
    }
  } catch (e) {
    const isTimeout = String(e && e.message) === 'shot-timeout';
    record = { ...item, status: isTimeout ? 'timeout' : 'error', error: String(e && e.stack || e), tookMs: Date.now() - startedAt };
    if (isTimeout) {
      // Recover: the hung evaluate keeps the page's JS thread busy, so close
      // and reopen it rather than let every subsequent shot queue behind it.
      console.log('TIMEOUT — recycling page:', JSON.stringify(item));
      try { await ctx.page.close(); } catch (_) { /* already gone */ }
      ctx.page = await openPage(ctx.browser, ctx.baseUrl);
    }
  }
  fs.appendFileSync(ctx.manifestPath, JSON.stringify(record) + '\n');
  console.log(record.status, rel, record.genMs != null ? `${record.genMs}ms` : '');
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { i: shardI, n: shardN } = parseShard(args.shard);
  const outDir = path.resolve(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });

  await ensureServer(args.port, args.root || ROOT);
  const baseUrl = `http://127.0.0.1:${args.port}`;

  const browser = await chromium.launch();
  let page = await openPage(browser, baseUrl);
  const consts = await getConstants(page);
  console.log('served version', consts.version);
  console.log('PRIMITIVES', consts.PRIMITIVES.length, 'MAPPERS', consts.MAPPERS.length,
    'fill-style roster', fullStyleRoster(consts).length);

  const tierA = buildTierA(consts);
  console.log(`Tier A total shots: ${tierA.length} (12 primitives x 8 mappers x 1 style x 3 densities x 2 angles)`);

  let items;
  let unreachableManifestPath = path.join(outDir, `manifest.${args.tier}.unreachable.jsonl`);
  if (args.tier === 'A') {
    items = tierA;
  } else if (args.tier === 'B') {
    const reach = await computeTierBReachability(page, consts);
    const { items: tierBItems, unreachable } = buildTierB(consts, reach);
    items = tierBItems;
    console.log(`Tier B total shots: ${items.length} (${TIER_B_PRIMITIVES.length} primitives x reachable (mapper,style) pairs x 3 densities x 2 angles)`);
    console.log(`Tier B unreachable (mapper,style) pairs recorded, not shot: ${unreachable.length}`);
    if (!fs.existsSync(unreachableManifestPath)) {
      const lines = unreachable.map((u) => JSON.stringify({ tier: 'B', ...u, status: 'unreachable' })).join('\n');
      if (lines) fs.writeFileSync(unreachableManifestPath, lines + '\n');
    }
  } else {
    throw new Error(`Unknown --tier "${args.tier}" (expected A or B)`);
  }

  const shardLabel = `${shardI}-${shardN}`;
  const manifestPath = path.join(outDir, `manifest.${args.tier}.${shardLabel}.jsonl`);
  let shard = items.filter((_, idx) => idx % shardN === (shardI - 1));
  if (args.only) shard = shard.filter((it) => args.only.test(`${it.primitive}__${it.mapper}__${it.style}__${it.density}__${it.angle}`));
  console.log(`Shard ${args.shard}: ${shard.length} of ${items.length} shots -> ${manifestPath}`);

  if (args.dryRun) { await browser.close(); return; }

  const ctx = { browser, baseUrl, page, outDir, manifestPath, consts };
  for (const item of shard) {
    // eslint-disable-next-line no-await-in-loop
    await runShot(ctx, item);
  }

  await ctx.page.close();
  await browser.close();
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = {
  parseArgs, parseShard, buildTierA, buildTierB, fullStyleRoster, shotRelPath,
  ensureServer, openPage, getConstants, computeTierBReachability, runShot,
  DENSITY_VALUES, ANGLE_KEYS, TIER_B_PRIMITIVES,
};
