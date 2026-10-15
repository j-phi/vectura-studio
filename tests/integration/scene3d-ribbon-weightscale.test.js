const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * T4 — composed Scene3D weight contracts.
 *
 * The default runtime loader includes the current RibbonGeometry (W1) and
 * PenFill (W2) modules. Bucket B checks composed single-pen output and bucket C
 * checks that multi-pen laws preserve distinct widths. The raw producer
 * invariant has a separate unit owner, so these assertions intentionally stay
 * at the algorithm's composed output seam.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SPHERE = { radius: 40, detail: 20 };

// §2 of the plan. Written out, exactly as `RIBBON_LAWS` is in surface-fill.js.
const BUCKET_B = [
  'nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth',
  'whiteBand', 'weightSmoothstep', 'ampSpacing', 'weaveDepth',
  'interlockWeave', 'trochoidLoop', 'amplitudeOnly', 'onePenDown',
];
const BUCKET_C = [
  'penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing',
];

describe('T4 — ribbon laws emit only real single-pen strokes; three-pen laws keep their nibs', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // The same sphere fixture scene3d-tone-law-plumbing.test.js uses, so the two
  // files exercise one geometry and a difference between them is a real one.
  const scene = (styleParams) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive: 'sphere', params: clone(SPHERE),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: false }];
    return p;
  };

  const fills = (styleParams) => (algo.generate(scene(styleParams), null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  // An absent meta.weightScale means 1 — see the header.
  const effWeight = (pp) => {
    const raw = Number(pp.meta && pp.meta.weightScale);
    return Number.isFinite(raw) ? raw : 1;
  };

  test.each(BUCKET_B)('bucket B — "%s" emits nothing but weightScale-1 paths', (law) => {
    const paths = fills({ toneLaw: law });
    expect(paths.length).toBeGreaterThan(0);
    const offenders = paths.filter((pp) => effWeight(pp) !== 1).map(effWeight);
    // Report the actual widths on failure — "3 paths at 2.4, 1.8, 0.6" is a
    // diagnosis; "expected 3 to be 0" is not.
    expect({ law, offenders: offenders.slice(0, 8), count: offenders.length })
      .toEqual({ law, offenders: [], count: 0 });
  });

  test.each(BUCKET_C)('bucket C — "%s" still draws with genuinely different pen widths', (law) => {
    const paths = fills({ toneLaw: law });
    expect(paths.length).toBeGreaterThan(0);
    const distinct = new Set(paths.map((pp) => Math.round(effWeight(pp) * 1000) / 1000));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  test('the ribbon roster published to the UI is exactly the twelve bucket-B laws', () => {
    expect(V.Scene3D.SurfaceFill.ribbonLaws.slice().sort()).toEqual(BUCKET_B.slice().sort());
  });

  test('bucket B and bucket C do not overlap (the exemption is total)', () => {
    expect(BUCKET_B.filter((l) => BUCKET_C.includes(l))).toEqual([]);
  });
});

/*
 * C4 — strokeFillStyle routing and pen-width regeneration.
 *
 * The runtime loader includes the production ribbon and fill modules. One
 * targeted test below installs temporary stand-ins to record the constant-
 * width routing arguments; that test proves routing only.
 */
describe('C4 — strokeFillStyle routing and pen-width regeneration', () => {
  let runtime; let V; let algo; let defaults; let SurfaceFill;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SurfaceFill = V.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  const scene = (styleParams) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive: 'sphere', params: clone(SPHERE),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: false }];
    return p;
  };
  const fills = (styleParams) => (algo.generate(scene(styleParams), null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const effWeight = (pp) => {
    const raw = Number(pp.meta && pp.meta.weightScale);
    return Number.isFinite(raw) ? raw : 1;
  };

  test('scene3d.js forwards styleParams.strokeFillStyle to buildObject verbatim', () => {
    const seen = [];
    const real = SurfaceFill.buildObject;
    SurfaceFill.buildObject = (o) => { seen.push(o); return real(o); };
    try {
      algo.generate(scene({ toneLaw: 'taperedEnds', strokeFillStyle: 'concentric' }), null, null, BOUNDS);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen[0].strokeFillStyle).toBe('concentric');
    } finally {
      SurfaceFill.buildObject = real;
    }
  });

  test('the committed default is spiral, and it is read from config, not hardcoded twice', () => {
    expect(SurfaceFill.strokeFillDefault).toBe('spiral');
    expect(SurfaceFill.strokeFillStyles).toEqual(['spiral', 'concentric', 'serpentine', 'contourParallel']);
  });

  // ── Narrow routing spy: stand-ins record the arguments at this seam. ──────
  // buildRibbonMultiPolygon: a per-vertex-normal ribbon (good enough to be a
  // closed ring of the right size; the real miter-bisector construction, and the
  // self-overlap resolution that gives a self-crossing centreline its loop
  // HOLES, are W1's).
  // fillRegion: honours the ONE-PATH-PER-COMPONENT rule for spiral/serpentine
  // and the many-rings behaviour for concentric/contourParallel.
  // Save and restore the loaded production modules so following tests use them.
  let realRG; let realPF; let saved = false;
  const installStandIns = (log) => {
    if (!saved) { realRG = V.RibbonGeometry; realPF = V.PenFill; saved = true; }
    V.RibbonGeometry = {
      buildRibbonMultiPolygon(centerline, halfWidths) {
        if (log) log.push({ n: centerline ? centerline.length : 0, halfWidths: (halfWidths || []).slice() });
        if (!Array.isArray(centerline) || centerline.length < 2) return [];
        const nrm = (i) => {
          const p0 = centerline[Math.max(0, i - 1)];
          const p1 = centerline[Math.min(centerline.length - 1, i + 1)];
          const dx = p1.x - p0.x; const dy = p1.y - p0.y;
          const L = Math.hypot(dx, dy) || 1;
          return { x: -dy / L, y: dx / L };
        };
        const left = []; const right = [];
        for (let i = 0; i < centerline.length; i++) {
          const n = nrm(i); const h = halfWidths[i];
          left.push({ x: centerline[i].x + n.x * h, y: centerline[i].y + n.y * h });
          right.push({ x: centerline[i].x - n.x * h, y: centerline[i].y - n.y * h });
        }
        return [[left.concat(right.reverse())]];
      },
      clipMultiPolygonToRegion(mp) { return mp; },
    };
    V.PenFill = {
      fillRegion(region, penWidth, style) {
        const ring = (region && region[0]) || [];
        if (ring.length < 3) return { paths: [], coverage: 0 };
        if (style === 'spiral' || style === 'serpentine') {
          return { paths: [ring.map((p) => ({ x: p.x, y: p.y }))], coverage: 1 };
        }
        // concentric / contourParallel: several rings, as the contract allows.
        const paths = [];
        for (let k = 0; k < 3; k++) {
          const s = 1 - k * 0.2;
          let cx = 0; let cy = 0;
          ring.forEach((p) => { cx += p.x; cy += p.y; });
          cx /= ring.length; cy /= ring.length;
          paths.push(ring.map((p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s })));
        }
        return { paths, coverage: 1 };
      },
    };
  };
  const removeStandIns = () => {
    if (realRG) V.RibbonGeometry = realRG; else delete V.RibbonGeometry;
    if (realPF) V.PenFill = realPF; else delete V.PenFill;
  };

  /*
   * AMENDMENT A1 — CONSTANT-WIDTH RIBBON LAWS MUST BE RIBBONIZED TOO.
   *
   * The plan's contract C3 hooked `ribbonize` at the `splitByWeight` call site,
   * which is gated by `splitsAlongLine() && wCnt > 0`. Three of the twelve
   * ribbon laws — 'weightModulated', 'weightSmoothstep' and 'onePenDown' — are
   * DELIBERATELY absent from `splitsAlongLine()`: their width is one number for
   * the whole run. Under the original gate they never reached `ribbonize` at
   * all, kept a constant `weightScale > 1`, and therefore kept the fat-pen
   * claim: still one wide round-capped stroke, still protruding at the limb.
   *
   * The bucket-B weightScale assertion above CANNOT catch that on its own —
   * without the C1/C2 modules every law degrades to a weightScale-1 centreline
   * and the test passes green for the wrong reason. So this case asserts the
   * MECHANISM: that `buildRibbonMultiPolygon` is actually reached for a constant-width
   * law, and that it is handed a FLAT half-width array (A1's "synthesize the
   * flat halfWidths rather than adding a second construction"), while a
   * varying-width law is handed a varying one through the same code path.
   *
   * RGR: gate `ribbonize` on `splitsAlongLine()` instead of `isRibbonLaw()` and
   * the weightSmoothstep half of this test fails with zero calls recorded.
   */
  test('A1 — a constant-width ribbon law is ribbonized too, from a FLAT width profile', () => {
    const varying = [];
    const constant = [];
    const spread = (a) => Math.max(...a) - Math.min(...a);

    installStandIns(varying);
    try { fills({ toneLaw: 'taperedEnds', strokeFillStyle: 'spiral' }); } finally { removeStandIns(); }
    installStandIns(constant);
    try { fills({ toneLaw: 'weightSmoothstep', strokeFillStyle: 'spiral' }); } finally { removeStandIns(); }

    // Both laws must actually BUILD ribbons — not silently skip.
    expect({ varying: varying.length > 0, constant: constant.length > 0 })
      .toEqual({ varying: true, constant: true });
    // 'weightSmoothstep' has ONE width per run, so every station of a stretch
    // gets the same half-width. Exactly flat, not merely nearly so.
    constant.forEach((call) => {
      expect(call.halfWidths.length).toBe(call.n);
      expect(spread(call.halfWidths)).toBe(0);
    });
    // 'taperedEnds' varies along the ruling, so at least one stretch must not
    // be flat — otherwise the "same code path, two ways of filling the width
    // array" claim would be vacuous.
    expect(varying.some((call) => spread(call.halfWidths) > 0)).toBe(true);
  });


});

/*
 * C4 (second half) — CHANGING THE PEN MUST REGENERATE THE LAYER.
 *
 * Pen width is not a paint attribute for a 3D layer. `bounds.penWidth` reaches
 * surface-fill.js and sets the ruling pitch, the minimum mark, the speck floor
 * and — since the ribbon work — the entire WIDTH of every variable-width
 * stroke. A repaint at a new stroke width therefore shows a hatch still pitched
 * for the OLD pen, with ribbons still sized for it.
 *
 * RGR: `regenPenTextLayers` in src/ui/panels/pens-panel.js was hard-gated on
 * `layer.type === 'text'` and called `app.regen()`, which regenerates
 * `engine.activeLayerId` alone. A committed pen-width change therefore
 * regenerated NO 3D layer at all — and, for two text layers on one pen, only
 * one of them. This test fails on both counts without the widened predicate.
 */
describe('C4 — committing a pen width regenerates every layer whose geometry it feeds', () => {
  const FULL_STACK = {
    includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
  };
  const waitForUi = () => new Promise((r) => setTimeout(r, 80));

  let runtime; let window;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    await waitForUi();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('a scene-tree group on that pen is regenerated, not merely repainted', () => {
    const app = window.app;
    const SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.pens = [{ id: 'pen-t', name: 'Pen T', color: '#000000', width: 0.5 }];

    const gid = app.engine.addSceneTree();
    app.engine.getLayerById(gid).penId = 'pen-t';

    const generated = [];
    const realGenerate = app.engine.generate.bind(app.engine);
    app.engine.generate = (id, o) => { generated.push(id); return realGenerate(id, o); };

    app.ui.renderPens();
    const field = window.document.querySelector('#pen-list .pen-width-value');
    field.dispatchEvent(new window.Event('focus', { bubbles: true }));
    field.value = '1.25';
    field.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(SETTINGS.pens[0].width).toBeCloseTo(1.25, 5);
    expect(generated).toContain(gid);
  });

  test('a pen change reaches EVERY layer on that pen, not just the active one', () => {
    const app = window.app;
    const SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.pens = [{ id: 'pen-t', name: 'Pen T', color: '#000000', width: 0.5 }];

    const a = app.engine.addSceneTree();
    const b = app.engine.addSceneTree();
    app.engine.getLayerById(a).penId = 'pen-t';
    app.engine.getLayerById(b).penId = 'pen-t';
    app.engine.activeLayerId = b;   // `app.regen()` would only ever reach this one

    const generated = [];
    const realGenerate = app.engine.generate.bind(app.engine);
    app.engine.generate = (id, o) => { generated.push(id); return realGenerate(id, o); };

    app.ui.renderPens();
    const field = window.document.querySelector('#pen-list .pen-width-value');
    field.dispatchEvent(new window.Event('focus', { bubbles: true }));
    field.value = '0.90';
    field.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(generated).toContain(a);
    expect(generated).toContain(b);
  });
});
