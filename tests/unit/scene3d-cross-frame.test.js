/**
 * O17 / §2.3 — THE CROSSED FAMILY IS MEASURED ON SCREEN, NOT IN THE CHART.
 *
 * §2.3 states the rule and the reason in one sentence:
 *
 *   > Crossed families use offsets +65° and +32° … never +90°, which produces a
 *   > visible square grid and moirés against the raster.
 *
 * That is a statement about the ANGLE THE EYE SEES. The curved fill built its
 * crossed family by adding +65° to `fillAngle` inside the surface's own
 * PARAMETER square and then pushing the result through the chart, so the angle
 * the eye saw was the pushforward of 65°, not 65°. On a sphere the pushforward
 * metric is (R·cos v · du, R · dv): as cos v → 0 toward the pole the u-component
 * collapses and any family with a dv component swings toward 90° ON SCREEN
 * against the parallels. The lit pole rendered as a clean square grid — exactly
 * the artefact the +65° exists to avoid — while the source said 65 the whole
 * time.
 *
 * WHAT THIS FILE MEASURES
 * -----------------------
 * The SCREEN angle, read off the DRAWING. Every emitted segment on the object
 * is binned into a 4 mm window and into a length-weighted orientation histogram
 * (mod 180°). A window carrying two families shows two peaks; their separation
 * is the number §2.3 is about. The renderer is never asked what angle it
 * intended — only the paths are read.
 *
 * Windows are classified into form zones through `Regions.formZone`, the same
 * classifier the fill itself consults, so the assertion lands on the zones that
 * actually carry a crossed family (T and F) rather than on the whole ball.
 *
 * NOISE FLOOR, STATED HONESTLY. A 4 mm window straddling the pole contains
 * genuinely divergent rulings from ONE family, because meridians converge there.
 * Zone M carries no crossed family at all (FORM_INK.M.cross === 0) and still
 * reports ~20 % of its windows as "two families ≥ 80° apart" on the big ball.
 * So the bars below are set well clear of that floor, and the M zone is measured
 * alongside T as a control: the claim is that T stops looking like M's noise and
 * starts looking like a 65° crossing.
 *
 * RED/GREEN PROVENANCE
 * --------------------
 * At `98289be` (Round 7 HEAD) the T zone of the 46 mm ball measures median 70°,
 * p90 85°, 13 % of crossed windows at ≥ 80°, and only 63 % inside 65 ± 10°; the
 * 92 mm ball measures 6 % at ≥ 80°. Both assertions below fail there.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { readHlStageSync } = require('../helpers/read-hl-stage-sync');
const FIX = require('../fixtures/scene3d-shadow-anatomy');

// DORMANT UNDER HL_STAGE STAGE 1 (surface-fill.js:276, toneZones: false). These
// assertions are correct and unmodified; the apparatus they describe (the
// zone-confined crossed family) is switched off. Flip `toneZones` to true and
// every one of them re-arms automatically. See
// docs/pre-release-hardening-log.md PRH-027 and
// tests/unit/scene3d-hl-stage-roster.test.js, which pins this roster.
const STAGE = readHlStageSync();
const whenZones = STAGE.toneZones ? describe : describe.skip;

const clone = (v) => JSON.parse(JSON.stringify(v));

// ROUND 10 — nothing restated. This file used to declare its own BOUNDS, SEED,
// CAMERA, SUN, TONE4 and ball builder. They MATCHED the fixture to the digit,
// which is precisely why the review called them latent: the O17 result quoted as
// the round's headline was pinned against a copy that nothing kept in step. The
// namesake test's copy had already drifted to pitch 22 / elevation 45.
const {
  BOUNDS, SEED, CAMERA, SUN, BALL_LADDER, toneBands, styleTable,
} = FIX;
const TONE4 = toneBands(4);

const PATCH = 4;      // mm — the design's own measurement window (§6.1)
const BINS = 36;      // 5° orientation bins, mod 180
const MIN_SEP = 20;   // two peaks closer than this are one family
const MIN_INK = 6;    // mm of ink below which a window is not two families
const SECOND_REL = 0.25; // the second peak must carry this much of the first

let runtime; let V;

beforeAll(async () => {
  runtime = await loadVecturaRuntime();
  V = runtime.window.Vectura;
});
afterAll(() => { if (runtime) runtime.cleanup(); });

const build = (ball) => {
  const p = clone(V.ALGO_DEFAULTS.scene3d);
  p.seed = SEED;
  p.camera = clone(CAMERA);
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.objects = [clone(ball)];
  p.lights = [clone(SUN)];
  p.tone = clone(TONE4);
  p.styleTable = styleTable(p.objects);
  const np = V.Scene3D.Params.normalizeParams(p);
  const paths = V.AlgorithmRegistry.scene3d.generate(
    V.Scene3D.Params.collectSceneParams(np, []), new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS,
  ) || [];
  return { np, paths };
};

// Which form zone owns each 4 mm window, sampled analytically off the chart —
// the same classifier and the same ground the fill itself uses.
const zoneGrid = (np, radius) => {
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;
  const scn = Sc.assembleScene(np, BOUNDS);
  const obj = np.objects[0];
  const chart = V.Scene3D.SurfaceFill.chartFor('sphere', { sx: radius, sy: radius, sz: radius });
  const E = 1e-3;
  const N = Math.max(200, Math.round(200 * (radius / 46)));
  const cell = {};
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const a = i / N; const b = j / N;
      const p0 = chart(a, b);
      const pa = chart(Math.min(1, a + E), b);
      const pb = chart(a, Math.min(1, b + E));
      if (!p0 || !pa || !pb) continue;
      let nn = G3.cross(G3.sub(pa, p0), G3.sub(pb, p0));
      const L = Math.hypot(nn.x, nn.y, nn.z); if (L < 1e-9) continue;
      nn = G3.mul(nn, 1 / L);
      if (G3.dot(nn, p0) < 0) nn = G3.mul(nn, -1);
      const world = Sc.applyObjectTransform(p0, obj.transform);
      if (G3.rotatePoint(nn, scn.camera).z <= 0) continue;
      const scr = scn.projectWorld(world); if (!scr) continue;
      const z = R.formZone(nn, world, {
        tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * radius },
      });
      const k = `${Math.floor(scr.y / PATCH)},${Math.floor(scr.x / PATCH)}`;
      (cell[k] = cell[k] || {})[z] = (cell[k][z] || 0) + 1;
    }
  }
  const out = {};
  Object.entries(cell).forEach(([k, h]) => {
    const tot = Object.values(h).reduce((s, x) => s + x, 0);
    if (tot < 20) return;
    const dom = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    if (dom[1] < 0.65 * tot) return;
    out[k] = dom[0];
  });
  return out;
};

// Length-weighted orientation histogram per window → the separation of the two
// dominant screen directions.
const separations = (paths, objectId, zones, want) => {
  const hist = {};
  paths.forEach((p) => {
    const m = p.meta || {}; const t = m.sceneTarget || {};
    if (m.kind !== 'sceneFill' || t.objectId !== objectId) return;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const L = Math.hypot(dx, dy); if (!(L > 1e-6)) continue;
      const ang = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 180) + 180) % 180;
      const key = `${Math.floor(((a.y + b.y) / 2) / PATCH)},${Math.floor(((a.x + b.x) / 2) / PATCH)}`;
      const c = hist[key] || (hist[key] = new Float64Array(BINS));
      const f = (ang / 180) * BINS;
      const k0 = Math.floor(f) % BINS; const fr = f - Math.floor(f);
      c[k0] += L * (1 - fr); c[(k0 + 1) % BINS] += L * fr;
    }
  });
  const seps = [];
  Object.entries(hist).forEach(([key, h]) => {
    if (zones[key] !== want) return;
    if (h.reduce((s, x) => s + x, 0) < MIN_INK) return;
    const s = new Float64Array(BINS);
    for (let i = 0; i < BINS; i++) s[i] = 0.25 * h[(i + BINS - 1) % BINS] + 0.5 * h[i] + 0.25 * h[(i + 1) % BINS];
    let i1 = 0; for (let i = 1; i < BINS; i++) if (s[i] > s[i1]) i1 = i;
    let i2 = -1;
    for (let i = 0; i < BINS; i++) {
      const d = Math.abs(i - i1);
      if (Math.min(d, BINS - d) * (180 / BINS) < MIN_SEP) continue;
      if (i2 < 0 || s[i] > s[i2]) i2 = i;
    }
    if (i2 < 0 || s[i2] / s[i1] < SECOND_REL) return;
    const d = Math.abs(i1 - i2);
    seps.push(Math.min(d, BINS - d) * (180 / BINS));
  });
  return seps.sort((a, b) => a - b);
};

const NOMINAL = 65;

whenZones('O17 — the crossed family holds ~65° ON SCREEN, on both ball fixtures', () => {
  // The two-fixture ladder, read off the fixture module rather than restated as
  // `[46, 92]` — so a harness cannot score one ball and call it the pair.
  BALL_LADDER.forEach((ball) => {
    const radius = ball.params.radius;
    test(`r=${radius}: no square grid in the terminator — <5% of crossed windows reach 80°`, () => {
      const { np, paths } = build(ball);
      const zones = zoneGrid(np, radius);
      const seps = separations(paths, ball.id, zones, 'T');
      expect(seps.length).toBeGreaterThan(20);
      const n80 = seps.filter((x) => x >= 80).length;
      expect(n80 / seps.length).toBeLessThan(0.05);
    });

    test(`r=${radius}: the terminator's crossing angle is centred on 65°, not drifting`, () => {
      const { np, paths } = build(ball);
      const zones = zoneGrid(np, radius);
      const seps = separations(paths, ball.id, zones, 'T');
      const med = seps[Math.floor(seps.length / 2)];
      expect(Math.abs(med - NOMINAL)).toBeLessThanOrEqual(10);
      const inBand = seps.filter((x) => Math.abs(x - NOMINAL) <= 15).length;
      expect(inBand / seps.length).toBeGreaterThanOrEqual(0.85);
    });
  });

  test('the form shadow crosses at the same angle as the terminator (one frame, one rule)', () => {
    const [SMALL] = BALL_LADDER;
    const { np, paths } = build(SMALL);
    const zones = zoneGrid(np, SMALL.params.radius);
    const F = separations(paths, SMALL.id, zones, 'F');
    expect(F.length).toBeGreaterThan(10);
    const med = F[Math.floor(F.length / 2)];
    expect(Math.abs(med - NOMINAL)).toBeLessThanOrEqual(10);
  });
});
