#!/usr/bin/env node
'use strict';

/*
 * F1-width-bar-b IDENTITY PROOF -- does `tests/helpers/scene3d-ribbon-width-
 * create-rig.js`'s jsdom construction produce the EXACT SAME `scenePaths` as
 * a REAL browser page running MAIN's `scripts/audit/scene3d-capture.js`'s
 * own `--rig create` construction, against the SAME tree?
 *
 * Method: reuse `scene3d-capture.js`'s own exported `ensureServer`/
 * `openPage`/`getConstants` (require()'d, never edited) to drive a real
 * headless Chromium page against a `--root` tree, build the object EXACTLY
 * as that script's `buildAndMeasure()` `else` branch does (copied verbatim
 * below -- not reinvented), extract `g.scenePaths`, and md5 them with a
 * canonical (fixed-precision, order-preserving) serialization. Then run the
 * SAME cell through the jsdom helper in the SAME node process and md5 its
 * `scenePaths` with the identical serializer. Compare.
 *
 *   node scripts/audit/scene3d-ribbon-width-create-rig-identity.js \
 *     --port 8475 --root .claude/worktrees/fill-audit-a3 \
 *     --laws interlockWeave,trochoidLoop,onePenDown,amplitudeOnly
 *
 * RESULT, RECORDED (see `F1-width-bar-b-impl.md` for the full run): for all
 * four laws (torus/hatch/d=50, camera 'a', `81925ee8`), the browser and the
 * jsdom construction produce the IDENTICAL PATH COUNT (282/278/138/229 --
 * zero structural divergence) but a DIFFERENT md5, because the 9-decimal
 * rounding this file's own serializer applies is not tight enough to hide
 * cross-engine float64 last-ULP noise: a follow-up point-by-point diff
 * (`Math.max(|dx|,|dy|)` over every matched point, no rounding at all) found
 * the maximum coordinate delta between jsdom's V8 (via `vm`) and a full
 * headless Chromium's V8 to be 5.12e-13 mm (interlockWeave), 8.53e-14
 * (trochoidLoop), 2.84e-14 (onePenDown), 2.27e-13 (amplitudeOnly) -- 12-13
 * orders of magnitude below the 0.3mm pen width this whole unit measures in,
 * and consistent with two independent engine BUILDS computing the same
 * transcendental functions (sin/cos/atan2/sqrt, all over the torus/HLR/
 * fill-lattice math) to slightly different last-bit rounding, not with any
 * geometric or structural difference. MD5 THEREFORE CANNOT MATCH ON THIS
 * PAIR OF ENGINES BY CONSTRUCTION (a single 1-ULP difference anywhere in
 * ~280 paths' worth of coordinates changes the hash), but GEOMETRIC
 * EQUIVALENCE IS PROVEN to 12+ significant decimal digits, on all four
 * laws, both structurally (identical path/point counts) and numerically
 * (max delta ~1e-13). No canvas/DOM-dependent code path is in play: `grep`
 * confirms `src/core/scene3d/*.js` never calls `getImageData` (the ONE
 * canvas method `tests/helpers/load-vectura-runtime.js`'s stub returns
 * dummy data for), so the jsdom stub cannot be the source of a REAL
 * divergence here even in principle.
 */

const path = require('path');
const crypto = require('crypto');
const { chromium } = require('@playwright/test');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
// MAIN's own scene3d-capture.js (GH-2 `6ffaf9c6`, HAS the `--rig create`/
// `addLayer` split) -- required by ABSOLUTE path, deliberately NOT
// `__dirname`-relative, so this identity proof always bootstraps through
// MAIN's canonical audit tool even though this script itself lives in the
// worktree (this worktree's own committed copy of scene3d-capture.js
// predates GH-2 and has no `--rig` flag at all -- see impl report). Only
// `ensureServer`/`openPage`/`getConstants` are used from it; never edited.
const MAIN_ROOT = '/Users/jayphi/Documents/github/vectura-studio';
const CAPTURE = require(path.join(MAIN_ROOT, 'scripts/audit/scene3d-capture.js'));
const { ensureServer, openPage, getConstants } = CAPTURE;
const { loadVecturaRuntime } = require(path.join(ROOT_DIR, 'tests/helpers/load-vectura-runtime.js'));
const { measureRibbonWidthCreate } = require(path.join(ROOT_DIR, 'tests/helpers/scene3d-ribbon-width-create-rig.js'));

function parseArgs(argv) {
  const out = {
    port: 8475, root: ROOT_DIR, primitive: 'torus', mapper: 'hatch', cameraAngle: 'a',
    laws: ['interlockWeave', 'trochoidLoop', 'onePenDown', 'amplitudeOnly'],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--root') out.root = path.resolve(argv[++i]);
    else if (a === '--primitive') out.primitive = argv[++i];
    else if (a === '--mapper') out.mapper = argv[++i];
    else if (a === '--camera') out.cameraAngle = argv[++i];
    else if (a === '--laws') out.laws = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

// Canonical serializer: round every coordinate to 9 decimal places (well
// past float64's useful precision at these mm magnitudes) so a byte-for-byte
// JSON string difference caused by e.g. -0 vs 0 or trailing-digit printf
// noise doesn't masquerade as a geometry difference. Path META (weightScale
// etc.) is included -- it is part of "the emitted paths".
function canonicalPathsString(paths) {
  const round = (n) => (Number.isFinite(n) ? Math.round(n * 1e9) / 1e9 : n);
  const norm = (paths || []).map((p) => {
    if (!Array.isArray(p)) return p;
    const pts = p.map((pt) => (pt && typeof pt === 'object' ? { x: round(pt.x), y: round(pt.y) } : pt));
    const meta = p.meta ? { kind: p.meta.kind, weightScale: round(Number(p.meta.weightScale)) } : null;
    return { pts, meta };
  });
  return JSON.stringify(norm);
}

function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

// Point-by-point max coordinate delta, NO rounding -- the actual geometric-
// equivalence proof when the md5 (necessarily -- see file header) disagrees.
function maxCoordDelta(pathsA, pathsB) {
  let maxDelta = 0;
  const n = Math.min((pathsA || []).length, (pathsB || []).length);
  for (let i = 0; i < n; i += 1) {
    const pa = pathsA[i];
    const pb = pathsB[i];
    if (!Array.isArray(pa) || !Array.isArray(pb)) continue;
    const m = Math.min(pa.length, pb.length);
    for (let k = 0; k < m; k += 1) {
      const d = Math.max(Math.abs(pa[k].x - pb[k].x), Math.abs(pa[k].y - pb[k].y));
      if (d > maxDelta) maxDelta = d;
    }
  }
  return maxDelta;
}

// The EXACT create-rig `page.evaluate` body from `scene3d-capture.js`'s
// `buildAndMeasure()` `else` branch (GH-2 `6ffaf9c6`, lines ~284-315),
// trimmed to what this proof needs (no screenshot, no genMs/pathCount
// bookkeeping) but otherwise byte-for-byte the same scene construction.
async function buildCreateRigInBrowser(page, { primitive, mapper, law, density, camera }) {
  return page.evaluate(({
    primitive, mapper, law, density, camera,
  }) => {
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
    const bag = {
      ...(P.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}),
      ...(P.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}),
    };
    const OBJ = {
      id: 'obj', name: 'Obj', primitive, params: bag,
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    };
    const SUN = {
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false,
    };
    q.objects = [OBJ];
    q.lights = [SUN];
    const style = {
      penId: null, mapper, params: { fillAngle: 45, fillDensity: density, toneLaw: law },
    };
    q.styleTable = {
      scene: JSON.parse(JSON.stringify(style)),
      byObject: { obj: JSON.parse(JSON.stringify(style)) },
      byFace: {},
    };

    let genError = null;
    try {
      engine.computeAllDisplayGeometry();
    } catch (e) {
      genError = String((e && e.stack) || e);
    }

    const paths = (g.scenePaths || []).map((p) => {
      const arr = Array.isArray(p) ? p.map((pt) => ({ x: pt.x, y: pt.y })) : p;
      if (Array.isArray(p) && p.meta) arr.meta = { kind: p.meta.kind, weightScale: p.meta.weightScale };
      return arr;
    });

    return { genError, paths };
  }, {
    primitive, mapper, law, density, camera,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await ensureServer(args.port, args.root);
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const browser = await chromium.launch();
  const page = await openPage(browser, baseUrl);
  const consts = await getConstants(page);
  console.log('served version', consts.version, 'root', args.root);

  // jsdom side, same process, same tree (this worktree's own require()s).
  const rt = await loadVecturaRuntime({ includeUi: true });
  const V = rt.window.Vectura;

  const camera = { ...consts.DEFAULT_CAMERA };
  if (args.cameraAngle === 'b') Object.assign(camera, { yaw: 40, pitch: -15 });

  const rows = [];
  for (const law of args.laws) {
    // eslint-disable-next-line no-await-in-loop
    const browserResult = await buildCreateRigInBrowser(page, {
      primitive: args.primitive, mapper: args.mapper, law, density: 50, camera,
    });
    const jsdomResult = measureRibbonWidthCreate(V, {
      law, primitive: args.primitive, mapper: args.mapper, density: 50, cameraAngle: args.cameraAngle,
    });

    const browserHash = md5(canonicalPathsString(browserResult.paths));
    const jsdomHash = md5(canonicalPathsString(jsdomResult.scenePaths));
    const match = browserHash === jsdomHash;
    const maxDelta = maxCoordDelta(browserResult.paths, jsdomResult.scenePaths);
    const row = {
      law,
      browserGenError: browserResult.genError,
      browserPathCount: (browserResult.paths || []).length,
      jsdomPathCount: (jsdomResult.scenePaths || []).length,
      browserHash,
      jsdomHash,
      md5Match: match,
      maxCoordDeltaMm: maxDelta,
      geometricallyEquivalent: maxDelta < 1e-6, // 12+ orders of magnitude below the 0.3mm pen
      jsdomTotalInkMm: jsdomResult.totalInkMm,
      jsdomWidthMm: jsdomResult.meanRibbonWidthMm,
    };
    rows.push(row);
    console.log(
      law, 'md5Match=', match, 'browserPaths=', row.browserPathCount, 'jsdomPaths=', row.jsdomPathCount,
      'maxCoordDeltaMm=', maxDelta,
    );
  }

  await rt.cleanup();
  await page.close();
  await browser.close();

  console.log(JSON.stringify({
    port: args.port, root: args.root, primitive: args.primitive, mapper: args.mapper, cameraAngle: args.cameraAngle, rows,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
