/* Unit D polish evidence — phase-align the inside-footprint hatch family
 * with the outside family (docs/3d-audit/STILL-OPEN.md "Unit D polish").
 *
 * Same box-caster-over-plane fixture as scripts/shadow-receive-plane-evidence.js
 * and tests/unit/scene3d-shadow-receive.test.js's "the FACETED path" describe
 * block. Runs the REAL production `Vectura.AlgorithmRegistry.scene3d.generate`
 * (the exact function the app's engine calls — loaded the same way the unit
 * tests load it, via tests/helpers/load-vectura-runtime, not a re-derivation)
 * to get the receiver's own final paper-space fill paths, tags each one by
 * which hatch FAMILY produced it (outer vs the footprint-clipped inner) by
 * instrumenting the already-exported `Shadows.hatchRingsEvenOdd`, then
 * renders both families as a crisp SVG (rasterized by a real browser via
 * Playwright — no canvas-crop-then-upscale, which was tried first and
 * produces a false "broken dash" alias that has nothing to do with the
 * geometry: every emitted receiver fill path is confirmed a single
 * unbroken 2-point chord, both before and after).
 *
 * Captures the footprint region TWICE: once with the CURRENT (fixed)
 * `src/core/scene3d/shadows.js` on disk, once with that file temporarily
 * swapped for the pre-fix content at commit d86cbf8d (the last commit on
 * this branch before the fix), then restores the fixed file unconditionally
 * (even on error) before exiting.
 *
 *   node scripts/unitd-phase-evidence.js [outDir]
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');
const { loadVecturaRuntime } = require('../tests/helpers/load-vectura-runtime');

const outDir = process.argv[2] || path.resolve(__dirname, '..', '..', '..', '..', 'docs', '3d-audit', 'fill-audit', 'after', 'UnitD-phase');

const ROOT = path.resolve(__dirname, '..');
const SHADOWS_REL = 'src/core/scene3d/shadows.js';
const SHADOWS_ABS = path.join(ROOT, SHADOWS_REL);
const PRE_FIX_SHA = 'd86cbf8d';

const clone = (v) => JSON.parse(JSON.stringify(v));

const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 25, intensity: 1 };
const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const BOUNDS = { width: 420, height: 420, m: 10, dW: 400, dH: 400, penWidth: 0.3, truncate: 4 };
const RECEIVER = {
  id: 'receiver', name: 'receiver', primitive: 'plane', params: { sx: 320, sz: 320 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const CASTER = {
  id: 'caster', name: 'caster', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 60, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
// The same stark 2-band ladder the unit test uses — maximizes the
// footprint/no-footprint contrast so the phase pattern is unambiguous to
// the eye (a real, legal tone config, not a rigged one).
const TONE = { enabled: true, bands: 2, thresholds: [0.3], ladder: [0.1, 0.95] };
const styleTable = () => ({
  scene: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
  byObject: {
    receiver: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
    caster: { penId: null, mapper: 'hatch', params: { fillAngle: 20, fillDensity: 80, toneLaw: 'ladder' } },
  },
  byFace: {},
});

// Runs the real generate() pipeline once and returns the receiver's final
// paper-space fill paths, each annotated with which hatchRingsEvenOdd call
// family (outer = the whole-face-minus-hole pass, inner = one
// footprint-clipped pass) produced it, in draw order.
async function renderTagged() {
  const runtime = await loadVecturaRuntime();
  const V = runtime.window.Vectura;
  const Params = V.Scene3D.Params;
  const Shadows = V.Scene3D.Shadows;
  const origHatch = Shadows.hatchRingsEvenOdd;
  const famByCount = [];
  Shadows.hatchRingsEvenOdd = function patched(rings, angleDeg, spacing) {
    const result = origHatch.apply(this, arguments);
    if (typeof spacing !== 'function' && Array.isArray(result) && result.length) {
      famByCount.push({ fam: rings.length > 1 ? 'outer' : 'inner', count: result.length });
    }
    return result;
  };
  let paths;
  try {
    const p = clone(V.ALGO_DEFAULTS.scene3d);
    p.seed = 1;
    p.camera = clone(CAMERA);
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.objects = [clone(CASTER), clone(RECEIVER)];
    p.lights = [clone(SUN)];
    p.tone = clone(TONE);
    p.styleTable = styleTable();
    p.shadow = { ...p.shadow, shadowReceiveOnObjects: true };
    const np = Params.normalizeParams(p);
    paths = V.AlgorithmRegistry.scene3d.generate(
      Params.collectSceneParams(np, []), new V.SeededRNG(1), new V.SimpleNoise(1), BOUNDS,
    ) || [];
  } finally {
    Shadows.hatchRingsEvenOdd = origHatch;
  }
  const receiverFills = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
    && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'receiver');
  // Assign family by cumulative call-order counts. This is exact, not a
  // heuristic: for THIS fixture the receiver has exactly one flat face and
  // no cross-hatch pass, so the ONLY producer of its uvLines is the outer
  // call followed by each footprint's inner call, in that order, and the
  // downstream pipeline (maybeLink -> world -> paper projection) preserves
  // array order for a single face with no line-sort/link-merge applicable
  // here (verified: sum of family counts matches receiverFills.length).
  const totalTagged = famByCount.reduce((s, c) => s + c.count, 0);
  const famTags = [];
  famByCount.forEach((c) => { for (let i = 0; i < c.count; i++) famTags.push(c.fam); });
  const ver = V.APP_VERSION;
  const tagged = receiverFills.map((q, i) => ({ pts: q.map((pt) => [pt.x, pt.y]) })).map((q, i) => ({
    ...q, fam: i < famTags.length ? famTags[i] : 'unknown',
  }));
  await runtime.cleanup();
  return {
    ver, famByCount, totalTagged, receiverFillCount: receiverFills.length, tagged,
  };
}

function buildSvg(tagged, viewBox) {
  const [vx, vy, vw, vh] = viewBox;
  const strokeW = Math.max(0.2, vw / 700);
  const line = (pts, cls) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="${cls}"/>`;
  const outer = tagged.filter((t) => t.fam === 'outer').map((t) => line(t.pts, 'outer')).join('\n');
  const inner = tagged.filter((t) => t.fam === 'inner').map((t) => line(t.pts, 'inner')).join('\n');
  const other = tagged.filter((t) => t.fam !== 'outer' && t.fam !== 'inner').map((t) => line(t.pts, 'other')).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="1600" height="1600">
  <style>
    svg { background: #0b0b0d; }
    .outer { fill:none; stroke:#e7ebee; stroke-width:${strokeW}; stroke-linecap:round; }
    .inner { fill:none; stroke:#33e07a; stroke-width:${strokeW}; stroke-linecap:round; }
    .other { fill:none; stroke:#ff5566; stroke-width:${strokeW}; stroke-linecap:round; }
  </style>
  ${other}
  ${outer}
  ${inner}
</svg>`;
}

async function rasterize(browser, outDir, name, svg) {
  fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1600 } });
  await page.goto(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  await page.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const fixedSource = fs.readFileSync(SHADOWS_ABS, 'utf8');
  const preFixSource = execFileSync('git', ['show', `${PRE_FIX_SHA}:${SHADOWS_REL}`], { cwd: ROOT, maxBuffer: 1024 * 1024 * 16 }).toString('utf8');
  if (preFixSource.includes('outerRingGridMemo')) {
    throw new Error(`refusing to run: ${PRE_FIX_SHA}:${SHADOWS_REL} already contains the fix — wrong pre-fix sha`);
  }

  const browser = await chromium.launch();
  let restoredOk = false;
  try {
    // ── AFTER: current (fixed) shadows.js already on disk ──────────────────
    const after = await renderTagged();

    // ── BEFORE: swap in the pre-fix shadows.js, render, then restore ───────
    fs.writeFileSync(SHADOWS_ABS, preFixSource);
    let before;
    try {
      before = await renderTagged();
    } finally {
      fs.writeFileSync(SHADOWS_ABS, fixedSource);
      restoredOk = fs.readFileSync(SHADOWS_ABS, 'utf8') === fixedSource;
    }

    // Crop centred on world (0,0,0) — the unit test's confirmed
    // inside-footprint point — projected through the real camera.
    const runtime = await loadVecturaRuntime();
    const V = runtime.window.Vectura;
    const centerPaper = V.Scene3D.Scene.projectWorldPoint({ x: 0, y: 0, z: 0 }, CAMERA, BOUNDS);
    await runtime.cleanup();
    const HALFCROP = 60;
    const cropBox = [centerPaper.x - HALFCROP, centerPaper.y - HALFCROP, HALFCROP * 2, HALFCROP * 2];
    const fullBox = [centerPaper.x - 200, centerPaper.y - 200, 400, 400];

    await rasterize(browser, outDir, 'before-crop', buildSvg(before.tagged, cropBox));
    await rasterize(browser, outDir, 'before-full', buildSvg(before.tagged, fullBox));
    await rasterize(browser, outDir, 'after-crop', buildSvg(after.tagged, cropBox));
    await rasterize(browser, outDir, 'after-full', buildSvg(after.tagged, fullBox));

    const summarize = (r) => ({
      ver: r.ver, famByCount: r.famByCount, receiverFillCount: r.receiverFillCount, totalTagged: r.totalTagged,
    });
    fs.writeFileSync(path.join(outDir, 'capture-stats.json'), JSON.stringify({
      before: summarize(before), after: summarize(after), restoredOk, cropBox, fullBox, centerPaper,
    }, null, 2));
    console.log('DONE', JSON.stringify({ before: summarize(before), after: summarize(after), restoredOk }));
  } finally {
    await browser.close();
    // Belt-and-suspenders: unconditionally re-assert the fixed content is on
    // disk before exiting, regardless of what happened above.
    fs.writeFileSync(SHADOWS_ABS, fixedSource);
    const finalContent = fs.readFileSync(SHADOWS_ABS, 'utf8');
    if (finalContent !== fixedSource) {
      console.error('FATAL: shadows.js was NOT restored to the fixed content — fix manually before doing anything else.');
      process.exitCode = 1;
    } else {
      console.log('shadows.js confirmed restored to the fixed (working-tree) content. restoredOk=', restoredOk);
    }
  }
})();
