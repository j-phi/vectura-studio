const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { readHlStageSync } = require('../helpers/read-hl-stage-sync');

// DORMANT UNDER HL_STAGE STAGE 1 (surface-fill.js:276, lightDriven /
// shadowGrade: false). These two assertions are correct and unmodified; the
// per-sample lightDriven glint gradient and the graded shadowSensitivity
// darkening they exercise are switched off. Flip the named flag and the test
// re-arms automatically. See docs/pre-release-hardening-log.md PRH-027 and
// tests/unit/scene3d-hl-stage-roster.test.js, which pins this roster.
const STAGE = readHlStageSync();
const whenLightDriven = STAGE.lightDriven ? test : test.skip;
const whenShadowGrade = STAGE.shadowGrade ? test : test.skip;

/*
 * Scene3D light-driven highlight/shadow (I8) + faceted/curved direction unify (I27).
 *
 * I8 — highlightMode:'lightDriven' places the highlight by the ACTUAL per-sample
 * specular term (a localized glint that spans the faces lit by a nearby point
 * light), not the per-face tone band. highlightSensitivity stages the treatment:
 * 1 = binary (uniform across the region), N = a gradient (brightest = blankest /
 * most-treated). shadowSensitivity mirrors it on the dark end (graded darkening).
 *
 * I27 — the FACETED fill used to shade BRIGHT=DENSE while the curved SurfaceFill
 * shaded BRIGHT=SPARSE, so a cube and a sphere in one scene shaded in OPPOSITE
 * directions. They are unified to the physically-correct DARK=DENSE / BRIGHT=
 * SPARSE. This is pinned below (a future re-inversion fails).
 *
 * Determinism: hash-only, no RNG. The DEFAULT (perFace, sensitivity 1) is a
 * strict no-op — byte-identical to a scene carrying none of these params.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D light-driven highlight + direction unify (I8 / I27)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const hlFills = (paths) => fills(paths).filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.highlight === true);
  const baseFills = (paths) => fills(paths).filter((pp) => !(pp.meta.sceneTarget && pp.meta.sceneTarget.highlight === true));
  const pointCount = (paths) => paths.reduce((acc, pp) => acc + pp.length, 0);
  const bboxArea = (paths) => {
    let minX = 1e9; let minY = 1e9; let maxX = -1e9; let maxY = -1e9;
    paths.forEach((pp) => pp.forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }));
    if (!Number.isFinite(minX)) return 0;
    return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
  };
  // A rounded face key from the fill's world normal (distinguishes cube faces).
  const faceKey = (pp) => {
    const n = pp.meta.sceneTarget && pp.meta.sceneTarget.normal;
    if (!n) return 'none';
    return `${Math.round(n.x * 4)},${Math.round(n.y * 4)},${Math.round(n.z * 4)}`;
  };

  // ── I27 — faceted + curved shade the SAME direction (dark = dense). ──────────
  // A box (faceted) and a sphere (curved) lit from the same world direction, seen
  // by the same head-on camera. World +X is screen-right, so both are lit on the
  // RIGHT (→ sparse there) and dense on the LEFT: the left/right point asymmetry
  // has the SAME SIGN for both. On the OLD bright=dense faceted code the cube was
  // denser on the LIT (right) side while the sphere was denser on the dark (left)
  // side → OPPOSITE signs → this test FAILS.
  const litObj = (primitive, params, transform) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'x', primitive, params,
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, ...(transform || {}) },
      visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = clone(defaults).tone;
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 12, castShadows: false }];
    return p;
  };
  // Measured as INK LENGTH, not as a point count.
  //
  // A point count cannot see this contract. It moves when a ruling is merely
  // SPLIT — one long line broken into three short ones gains four points and
  // loses no ink — and it counts a face carrying many short scraps as denser
  // than a face carrying a few long strokes. Both artifacts bit here, in
  // opposite directions and at the same time:
  //
  //   - on e85a497 (Round 2) the SPHERE's ink was 718 left / 787 right, i.e.
  //     BRIGHT = DENSE, the exact inversion this test exists to catch — and it
  //     passed anyway, on a point count of +4;
  //   - after the Round-3 fill, the CUBE's ink is 325 left / 65 right (5x
  //     darker on the dark side, correct) while its point count is -4, because
  //     the lit face's few long strokes were replaced by shorter ones.
  //
  // So the instrument was giving a false pass on a real inversion and a false
  // fail on a correct one. Ink length is what "denser" means.
  const leftMinusRight = (paths) => {
    const ff = fills(paths);
    let minX = 1e9; let maxX = -1e9;
    ff.forEach((pp) => pp.forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); }));
    const cx = (minX + maxX) / 2;
    let l = 0; let r = 0;
    ff.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) {
        const mx = (pp[i - 1].x + pp[i].x) / 2;
        const len = Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
        if (mx < cx) l += len; else r += len;
      }
    });
    return l - r;
  };

  test('I27: a lit cube and a lit sphere shade the SAME direction (dark=dense)', () => {
    const cube = leftMinusRight(algo.generate(litObj('box', { sx: 46, sy: 46, sz: 46 }, { yaw: 45 }), null, null, BOUNDS) || []);
    const ball = leftMinusRight(algo.generate(litObj('sphere', { radius: 46, detail: 22 }), null, null, BOUNDS) || []);
    // Both have a clear asymmetry (a shaded gradient, not a flat fill)…
    expect(Math.abs(cube)).toBeGreaterThan(20);
    expect(Math.abs(ball)).toBeGreaterThan(20);
    // …and it points the SAME way: dark side (screen-left) is denser for BOTH.
    expect(Math.sign(cube)).toBe(Math.sign(ball));
    expect(cube).toBeGreaterThan(0); // left (dark) has more lines than right (lit)
    expect(ball).toBeGreaterThan(0);
  });

  // ── I8 — light-driven highlight on a cube with a corner point light. ─────────
  const cornerScene = (styleParams) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'cube', primitive: 'box', params: { sx: 60, sy: 60, sz: 60 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -30, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = clone(defaults).tone;
    // A near point light just outside the +X/+Y/+Z corner (half-extent 30).
    p.lights = [{ id: 'pt', type: 'point', intensity: 1, range: 240, position: { x: 55, y: 55, z: 55 } }];
    return p;
  };
  const gen = (styleParams) => algo.generate(cornerScene(styleParams), null, null, BOUNDS) || [];

  test('lightDriven: the highlight is a LOCALIZED glint spanning ≥2 lit faces (not a per-face band)', () => {
    const ld = gen({ highlightMode: 'lightDriven', highlightTreatment: 'dashed', highlightSensitivity: 1 });
    const hl = hlFills(ld);
    const base = baseFills(ld);
    // A highlight actually lands.
    expect(hl.length).toBeGreaterThan(0);
    // It SPANS two lit faces (the corner glint crosses the face crease): the
    // highlight geometry carries ≥2 distinct face normals.
    const hlFaces = new Set(hl.map(faceKey));
    expect(hlFaces.size).toBeGreaterThanOrEqual(2);
    // It is a SUB-REGION of a face, NOT the whole face (this is what separates
    // lightDriven from the per-face band): at least one lit face carries BOTH
    // highlight fills and plain base fills.
    const baseFaces = new Set(base.map(faceKey));
    const shared = [...hlFaces].filter((k) => baseFaces.has(k));
    expect(shared.length).toBeGreaterThanOrEqual(1);
    // And it is compact — the glint bbox is a small fraction of the object bbox.
    expect(bboxArea(hl)).toBeLessThan(bboxArea(fills(ld)) * 0.6);
  });

  test('lightDriven perFace vs lightDriven: perFace tags a WHOLE face, lightDriven a sub-region', () => {
    // Same corner light. perFace tags WHOLE facets (§5.5.2 — the H zone on a
    // facet is a set of facets, and the blocky facet-edged result is the right
    // answer); lightDriven carves a sub-region out of the facets it crosses.
    //
    // This used to be measured as bbox(lightDriven) < bbox(perFace), which was
    // only ever a proxy — and a fragile one. perFace now places its highlight by
    // the SPECULAR glint facet set rather than by "the top tone band" (O14), so
    // the facet it lands on is a different, better-aimed one and the two bboxes
    // are no longer ordered. The structural claim is asserted directly instead:
    // a perFace-tagged facet carries NO plain base fill (the whole facet went to
    // the highlight), where a lightDriven-tagged facet carries both.
    const perAll = gen({ highlightTreatment: 'dashed' });                                         // perFace (default)
    const ldAll = gen({ highlightMode: 'lightDriven', highlightTreatment: 'dashed', highlightSensitivity: 1 });
    const per = hlFills(perAll);
    const ld = hlFills(ldAll);
    expect(ld.length).toBeGreaterThan(0);
    expect(per.length).toBeGreaterThan(0);
    const sharedWith = (all, hl) => {
      const baseFaces = new Set(baseFills(all).map(faceKey));
      return [...new Set(hl.map(faceKey))].filter((k) => baseFaces.has(k));
    };
    expect(sharedWith(ldAll, ld).length).toBeGreaterThanOrEqual(1);   // sub-region
    expect(sharedWith(perAll, per).length).toBe(0);                   // whole facet
  });

  // On a smooth curved surface (no face creases to fragment the clip), the
  // highlight ink scales cleanly with sensitivity: sensitivity 1 treats the WHOLE
  // glint region (binary); a higher stage count treats only the brightest core (a
  // graded gradient — dim region edges fall back to base) → strictly less ink.
  const ldSphere = (sensitivity) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'ball', primitive: 'sphere', params: { radius: 55, detail: 24 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, highlightMode: 'lightDriven', highlightTreatment: 'dashed', highlightSensitivity: sensitivity } },
      byObject: {}, byFace: {},
    };
    p.tone = clone(defaults).tone;
    p.lights = [{ id: 'pt', type: 'point', intensity: 1, range: 260, position: { x: 70, y: 70, z: 120 } }];
    return algo.generate(p, null, null, BOUNDS) || [];
  };

  whenLightDriven('sensitivity: 1 = binary (whole region) → MORE highlight ink than a graded N', () => {
    const s1 = pointCount(hlFills(ldSphere(1)));
    const s4 = pointCount(hlFills(ldSphere(4)));
    const s6 = pointCount(hlFills(ldSphere(6)));
    expect(s1).toBeGreaterThan(0);
    expect(s6).toBeGreaterThan(0);
    expect(s1).toBeGreaterThan(s6);       // binary covers the whole glint
    expect(s1).toBeGreaterThanOrEqual(s4); // graded stages treat progressively less
    expect(s4).toBeGreaterThanOrEqual(s6);
  });

  test('sensitivity is deterministic (hash-only, no RNG)', () => {
    const a = JSON.stringify(hlFills(ldSphere(5)));
    const b = JSON.stringify(hlFills(ldSphere(5)));
    expect(a).toBe(b);
  });

  // ── shadowSensitivity — graded darkening on the dark end (curved path). ──────
  const litSphere = (shadowSensitivity) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 70, detail: 24 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, shadowSensitivity } }, byObject: {}, byFace: {} };
    p.tone = clone(defaults).tone;
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 15, castShadows: false }];
    return p;
  };

  whenShadowGrade('shadowSensitivity: more stages → MORE ink on the dark side (graded darkening)', () => {
    const one = pointCount(fills(algo.generate(litSphere(1), null, null, BOUNDS) || []));
    const four = pointCount(fills(algo.generate(litSphere(4), null, null, BOUNDS) || []));
    expect(one).toBeGreaterThan(0);
    expect(four).toBeGreaterThan(one);
  });

  // ── REGRESSION GUARD — the default is a strict no-op. ───────────────────────
  test('default (perFace, sensitivity 1) is byte-identical to no I8 params', () => {
    const bare = JSON.stringify(gen({}));
    // Restating the DEFAULTS changes nothing. This assertion used to carry
    // `highlightSensitivity: 6` on the reasoning that the dial "is inert in
    // perFace mode" — which was the O9 defect itself, pinned as a contract. The
    // dial is now the perFace specular acceptance cone's angular tightness, so
    // only sensitivity 1 (its default) is a no-op.
    const withParams = JSON.stringify(gen({ highlightMode: 'perFace', highlightSensitivity: 1, shadowSensitivity: 1 }));
    expect(withParams).toBe(bare);
  });

  // ── O9 — and the dial must be LIVE in perFace, which is the whole point. ────
  test('highlightSensitivity is live in perFace mode and tightens the cone', () => {
    const loose = JSON.stringify(gen({ highlightMode: 'perFace', highlightSensitivity: 1 }));
    const tight = JSON.stringify(gen({ highlightMode: 'perFace', highlightSensitivity: 6 }));
    expect(tight).not.toBe(loose);
  });
});
