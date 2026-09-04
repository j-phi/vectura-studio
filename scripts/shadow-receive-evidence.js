/* Shadow-falling-onto-other-objects (Unit D close-out) — LIVE visual evidence
 * AND performance measurement, shot in the REAL app. Patterned on
 * scripts/shadow-overlap-evidence.js.
 *
 * The unit test (tests/unit/scene3d-shadow-receive.test.js) already proves the
 * per-sample mechanism at the Regions.combinedIntensity layer, an independent
 * ray/sphere oracle, and the full generate() pipeline. This script drives the
 * SAME kind of scene through the real app (engine.addLayer -> computeAll-
 * DisplayGeometry -> render) so the shadow is SEEN landing on another
 * object's own surface, in that object's own fill style, not only asserted.
 *
 *   node scripts/shadow-receive-evidence.js [baseUrl] [outDir]
 *
 * Serve THIS worktree first: node scripts/dev-server.js 8470
 *
 * Captures CANVAS PIXELS, not the page (the floating tool bar overlaps the
 * form) — same shot/save/bbox helpers as the stroke-fill / shadow-overlap
 * scripts.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const baseUrl = process.argv[2] || 'http://localhost:8470';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', '3d-audit', 'handoff', 'unit-d');

// Both objects share z=0: this SUN's travel direction has zero z-component
// (azimuth 90 keeps the whole light/shadow geometry in the xy-plane — see
// the unit test header for the offline ray/sphere scan that established
// this), so a z-mismatch between caster and receiver would make the shadow
// physically unable to reach the receiver no matter how the flag is set.
const CASTER = {
  id: 'caster', name: 'caster', primitive: 'sphere', params: { radius: 18, detail: 24 },
  transform: { x: 30, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const CASTER_ASIDE = {
  ...CASTER, transform: { ...CASTER.transform, x: 300 }, // control 1: moved far away, no shadow possible
};
// topoCone chart: apex at local y=+sy, base (radius sx) at local y=-sy —
// transform.y = sy sits the base on the ground (y=0..2*sy world).
const RECEIVER = {
  id: 'receiver', name: 'receiver', primitive: 'cone', params: { sx: 22, sy: 20, sz: 22, detail: 24 },
  transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 55, intensity: 1, castShadows: true };
const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const TONE = { enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.2, 0.4, 0.65, 0.9] };

const styleTable = (receiverLaw) => ({
  scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80, toneLaw: 'ladder' } },
  byObject: {
    caster: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80, toneLaw: 'ladder' } },
    receiver: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80, toneLaw: receiverLaw } },
  },
  byFace: {},
});

// A fixed 8-object dense scene for the performance measurement (the brief's
// "8-object dense scene" budget check) — a mix of casters and a couple of
// curved receivers, all sharing z=0 for the same reason as CASTER/RECEIVER.
const denseObjects = () => {
  const objs = [];
  for (let i = 0; i < 6; i += 1) {
    objs.push({
      id: `box-${i}`, name: `box-${i}`, primitive: 'box', params: { sx: 16, sy: 16, sz: 16 },
      transform: { x: -75 + i * 30, y: 8, z: -40, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    });
  }
  objs.push({ ...RECEIVER, id: 'receiver', transform: { ...RECEIVER.transform, z: 40 } });
  objs.push({ ...CASTER, id: 'caster', transform: { ...CASTER.transform, z: 40 } });
  return objs;
};

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  const ver = await page.evaluate(() => (window.Vectura && window.Vectura.APP_VERSION) || '?');
  console.log('served version', ver);

  const build = (objects, receiverLaw, shadowReceiveOn) => page.evaluate(({
    objects, receiverLaw, shadowReceiveOn, SUN, CAMERA, TONE,
  }) => {
    const app = window.app; const engine = app.engine;
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: false }; p.backdrop = { enabled: false };
    p.objects = objects; p.lights = [SUN];
    p.tone = TONE;
    p.shadow = { ...(p.shadow || {}), shadowReceiveOnObjects: shadowReceiveOn };
    const styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80, toneLaw: 'ladder' } },
      byObject: {},
      byFace: {},
    };
    objects.forEach((o) => {
      styleTable.byObject[o.id] = {
        penId: null, mapper: 'hatch',
        params: { fillAngle: 0, fillDensity: 80, toneLaw: o.id === 'receiver' ? receiverLaw : 'ladder' },
      };
    });
    p.styleTable = styleTable;
    const t0 = performance.now();
    engine.computeAllDisplayGeometry();
    const t1 = performance.now();
    app.render();
    const paths = g.scenePaths || [];
    const receiverFills = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
      && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'receiver');
    const inkLength = (pts) => {
      let l = 0;
      for (let i = 1; i < pts.length; i += 1) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return l;
    };
    // Whole-object ink LENGTH is a weak, dilutable signal here (the shadow
    // only ever affects a small patch of the receiver's surface, and pen-fill
    // dithering can move the total by more than that patch's own contribution)
    // — the unit tests already prove the causal per-sample mechanism with a
    // real margin. The robust, already-validated evidence-script signal is
    // exact geometry non-identity (the SAME check the unit test's HEADLINE
    // assertion uses): a JSON signature of every receiver fill path's points.
    const geomSig = JSON.stringify(receiverFills.map((q) => q.map((pt) => [
      Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000,
    ])));
    let receiverBB = null;
    receiverFills.forEach((q) => q.forEach((pt) => {
      if (!receiverBB) receiverBB = { minx: pt.x, maxx: pt.x, miny: pt.y, maxy: pt.y };
      else {
        receiverBB.minx = Math.min(receiverBB.minx, pt.x); receiverBB.maxx = Math.max(receiverBB.maxx, pt.x);
        receiverBB.miny = Math.min(receiverBB.miny, pt.y); receiverBB.maxy = Math.max(receiverBB.maxy, pt.y);
      }
    }));
    return {
      layerId: gid, total: paths.length, receiverFillCount: receiverFills.length,
      receiverInk: receiverFills.reduce((s, q) => s + inkLength(q), 0),
      geomSig,
      receiverBB,
      computeMs: t1 - t0,
    };
  }, { objects, receiverLaw, shadowReceiveOn, SUN, CAMERA, TONE });

  const zoom = (k) => page.evaluate((k) => {
    const r = window.app.renderer;
    r.center();
    const rect = r.canvas.getBoundingClientRect();
    const cx = rect.width / 2; const cy = rect.height / 2;
    r.offsetX = cx - (cx - r.offsetX) * k; r.offsetY = cy - (cy - r.offsetY) * k;
    r.scale *= k; r.userHasManipulated = true; r.draw();
  }, k);

  const shot = (sx, sy, sw, sh, cap) => page.evaluate(({ sx, sy, sw, sh, cap }) => {
    const c = document.querySelector('#main-canvas');
    const s = c.width / c.clientWidth;
    const w = Math.round(sw * s); const h = Math.round(sh * s);
    const k = cap ? Math.min(1, cap / Math.max(w, h)) : 1;
    const o = document.createElement('canvas');
    o.width = Math.round(w * k); o.height = Math.round(h * k);
    const g = o.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(c, Math.round(sx * s), Math.round(sy * s), w, h, 0, 0, o.width, o.height);
    return o.toDataURL('image/png');
  }, { sx, sy, sw, sh, cap });

  const save = async (file, sx, sy, sw, sh, cap) => {
    const url = await shot(sx, sy, sw, sh, cap || 0);
    fs.writeFileSync(path.join(outDir, file), Buffer.from(url.split(',')[1], 'base64'));
    return file;
  };

  const bbox = () => page.evaluate(() => {
    const c = document.querySelector('#main-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const corner = (d[0] * 0.299 + d[1] * 0.587 + d[2] * 0.114);
    let minx = 1e9; let miny = 1e9; let maxx = -1e9; let maxy = -1e9;
    for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) {
      const i = (y * c.width + x) * 4;
      const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (Math.abs(L - corner) < 90) continue;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    const s = c.width / c.clientWidth;
    return { minx: minx / s, miny: miny / s, maxx: maxx / s, maxy: maxy / s };
  });

  // Drawing-space (pre-pan/zoom) point -> canvas CSS-px, using the renderer's
  // CURRENT transform.
  const toCanvasPx = (pt) => page.evaluate((pt) => {
    const r = window.app.renderer;
    return { x: pt.x * r.scale + r.offsetX, y: pt.y * r.scale + r.offsetY };
  }, pt);

  // Apply a SAVED renderer transform verbatim (no auto-center/auto-fit) so
  // every one of the three scenes below is shot at the EXACT same pan/zoom —
  // the plan's "before and after from the SAME pipeline, the SAME zoom"
  // evidence rule. Auto-centering per scene would silently reframe around
  // each scene's own bbox and defeat a like-for-like crop.
  const applyView = (view) => page.evaluate((view) => {
    const r = window.app.renderer;
    r.scale = view.scale; r.offsetX = view.offsetX; r.offsetY = view.offsetY;
    r.userHasManipulated = true; r.draw();
  }, view);

  const ZOOM = 3.2;
  const CROP = 130;
  const stats = {};

  // ── two-object scene: caster + cone receiver, shadow ON, receiver law A ──
  // This build sets the ONE view every other shot in this script reuses.
  const on = await build([CASTER, RECEIVER], 'mazeFill', true);
  await zoom(ZOOM);
  await page.waitForTimeout(300);
  let bb = await bbox();
  await save('two-object-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1400);
  const VIEW = await page.evaluate(() => {
    const r = window.app.renderer;
    return { scale: r.scale, offsetX: r.offsetX, offsetY: r.offsetY };
  });
  // Crop centred on the receiver's own fill bbox (the shadow patch sits on
  // its near flank, inside this box) — real geometry, not a guessed pixel.
  if (!on.receiverBB) throw new Error('no receiver fill geometry found in the shadow-ON build — cannot place a crop');
  const rbb = on.receiverBB;
  const c1 = await toCanvasPx({ x: rbb.minx, y: rbb.miny });
  const c2 = await toCanvasPx({ x: rbb.maxx, y: rbb.maxy });
  const cropCenter = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
  await save('two-object-crop.png', cropCenter.x - CROP, cropCenter.y - CROP, CROP * 2, CROP * 2, 1200);
  stats.shadowOn = on;

  // ── control 1: caster moved aside — no shadow, same view/crop ───────────
  const aside = await build([CASTER_ASIDE, RECEIVER], 'mazeFill', true);
  await applyView(VIEW);
  await page.waitForTimeout(300);
  bb = await bbox();
  await save('control1-aside-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1400);
  await save('control1-aside-crop.png', cropCenter.x - CROP, cropCenter.y - CROP, CROP * 2, CROP * 2, 1200);
  stats.control1Aside = aside;

  // ── control 2: same scene, receiver toneLaw changed — the shadow's own
  //    appearance must visibly change (renders in the RECEIVER's own style) ──
  const lawB = await build([CASTER, RECEIVER], 'turingStripe', true);
  await applyView(VIEW);
  await page.waitForTimeout(300);
  bb = await bbox();
  await save('control2-lawb-full.png', bb.minx - 8, bb.miny - 8, (bb.maxx - bb.minx) + 16, (bb.maxy - bb.miny) + 16, 1400);
  await save('control2-lawb-crop.png', cropCenter.x - CROP, cropCenter.y - CROP, CROP * 2, CROP * 2, 1200);
  stats.control2LawB = lawB;

  // ── performance: caster+receiver, shadow off vs on ──────────────────────
  const perfSimpleOff = await build([CASTER, RECEIVER], 'mazeFill', false);
  const perfSimpleOn = await build([CASTER, RECEIVER], 'mazeFill', true);
  stats.perfSimple = { off: perfSimpleOff.computeMs, on: perfSimpleOn.computeMs };

  // ── performance: 8-object dense scene, shadow off vs on ─────────────────
  const dense = denseObjects();
  const perfDenseOff = await build(dense, 'mazeFill', false);
  const perfDenseOn = await build(dense, 'mazeFill', true);
  stats.perfDense = { off: perfDenseOff.computeMs, on: perfDenseOn.computeMs, ratio: perfDenseOn.computeMs / (perfDenseOff.computeMs || 1) };

  const summary = {
    ver,
    shadowOnReceiverInk: on.receiverInk,
    controlAsideReceiverInk: aside.receiverInk,
    // The robust check (whole-object ink LENGTH is a weak/dilutable proxy —
    // see the comment in build() above): moving the caster aside must change
    // the receiver's own emitted geometry, and law B must ALSO differ from
    // law A while the shadow is on (renders in the receiver's OWN style).
    controlAsideDiffersFromShadowOn: aside.geomSig !== on.geomSig,
    lawBDiffersFromLawAWithShadowOn: lawB.geomSig !== on.geomSig,
    perfSimpleMs: stats.perfSimple,
    perfDenseMs: stats.perfDense,
    perfDenseWithinBudget: stats.perfDense.ratio < 1.5,
  };
  console.log('SUMMARY', JSON.stringify(summary));

  fs.writeFileSync(path.join(outDir, 'stats.json'), JSON.stringify({ ver, summary, stats }, null, 2));
  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); fs.writeFileSync(path.join(outDir, 'page-errors.txt'), errors.join('\n')); }
  await browser.close();
})();
