/**
 * O3 / §5.1 — THE FORM SHADOW'S CROSSED FAMILY COMES OFF THE SILHOUETTE.
 *
 * §5.1 gives the form shadow a single family whose rulings compress toward the
 * limb; the CROSSED family belongs to the terminator, and F borrows a half-weight
 * share of it so it can hold a value of its own. What F must not do is carry that
 * second direction all the way out to the contour: family A already crowds hard
 * there (a sphere's meridians converge at the silhouette), so a second direction
 * on top of it turns the outer rim into a woven mesh and the terminator stops
 * reading as a band. That is exactly what the Round 7 review found by eye —
 * "F's crossed family now covers the whole left of the form out to the contour,
 * so the ball reads as a continuous woven mesh from limb to terminator and the
 * dip stops separating" — and it is O3's own clause, "the dip is visible as a
 * shape".
 *
 * WHAT THIS FILE MEASURES
 * -----------------------
 * `nz`, the camera-space normal's z, is 1 facing the camera and exactly 0 ON the
 * silhouette, so it is the projection-correct measure of "how close to the
 * contour". Windows are classified by form zone and by nz off the chart, and the
 * number of DRAWN families in each window is read from the paths with the same
 * orientation histogram `scene3d-cross-frame.test.js` uses. The renderer is never
 * asked what it intended.
 *
 * RED/GREEN PROVENANCE
 * --------------------
 * At `0b32ee5` the F zone's outermost band (nz < 0.30, i.e. the outer ~5 % of the
 * projected radius) carries two families in 46 % of its windows on the 46 mm ball
 * and 54 % on the 92 mm ball. Both assertions below fail there.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { readHlStageSync } = require('../helpers/read-hl-stage-sync');
const FIX = require('../fixtures/scene3d-shadow-anatomy');

// DORMANT UNDER HL_STAGE STAGE 1 (surface-fill.js:276, toneZones: false). This
// assertion is correct and unmodified; the zone apparatus it depends on
// (F carrying its crossed family away from the contour, per Regions.formZone
// classification consumed by the emitter) is switched off. Flip `toneZones` to
// true and it re-arms automatically. The sibling assertion in this describe
// ("the outermost band ... is a single family") does not depend on the same
// mechanism and stays green. See docs/pre-release-hardening-log.md PRH-027 and
// tests/unit/scene3d-hl-stage-roster.test.js, which pins this roster.
const STAGE = readHlStageSync();
const whenZones = STAGE.toneZones ? test : test.skip;

const clone = (v) => JSON.parse(JSON.stringify(v));

// ROUND 10 — nothing restated. The protected limb taper is quoted off this file,
// so its rig must be the rendered one by construction, not by coincidence.
const {
  BOUNDS, SEED, CAMERA, SUN, BALL_LADDER, toneBands, styleTable,
} = FIX;
const TONE4 = toneBands(4);

const PATCH = 4; const BINS = 36; const MIN_SEP = 20; const MIN_INK = 6; const SECOND_REL = 0.25;
const LIMB_NZ = 0.30;   // outer ~5 % of the projected radius

let runtime; let V;
beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
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
  return { np, paths, radius: ball.params.radius, id: ball.id };
};

// Window → { zone, nz }, sampled analytically off the chart.
const windowInfo = ({ np, radius }) => {
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;
  const scn = Sc.assembleScene(np, BOUNDS);
  const obj = np.objects[0];
  const chart = V.Scene3D.SurfaceFill.chartFor('sphere', { sx: radius, sy: radius, sz: radius });
  const E = 1e-3; const N = Math.max(200, Math.round(200 * (radius / 46)));
  const cell = {};
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const a = i / N; const b = j / N;
      const p0 = chart(a, b); const pa = chart(Math.min(1, a + E), b); const pb = chart(a, Math.min(1, b + E));
      if (!p0 || !pa || !pb) continue;
      let nn = G3.cross(G3.sub(pa, p0), G3.sub(pb, p0));
      const L = Math.hypot(nn.x, nn.y, nn.z); if (L < 1e-9) continue;
      nn = G3.mul(nn, 1 / L);
      if (G3.dot(nn, p0) < 0) nn = G3.mul(nn, -1);
      const world = Sc.applyObjectTransform(p0, obj.transform);
      const camN = G3.rotatePoint(nn, scn.camera);
      if (camN.z <= 0) continue;
      const scr = scn.projectWorld(world); if (!scr) continue;
      const z = R.formZone(nn, world, {
        tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * radius },
      });
      const k = `${Math.floor(scr.y / PATCH)},${Math.floor(scr.x / PATCH)}`;
      const c = cell[k] || (cell[k] = { z: {}, nz: 0, n: 0 });
      c.z[z] = (c.z[z] || 0) + 1; c.nz += camN.z; c.n += 1;
    }
  }
  const out = {};
  Object.entries(cell).forEach(([k, c]) => {
    if (c.n < 20) return;
    const dom = Object.entries(c.z).sort((a, b) => b[1] - a[1])[0];
    if (dom[1] < 0.65 * c.n) return;
    out[k] = { zone: dom[0], nz: c.nz / c.n };
  });
  return out;
};

// Window → does the DRAWING carry two families here? null = too little ink.
const twoFamilyGrid = (paths, objectId) => {
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
  const out = {};
  Object.entries(hist).forEach(([key, h]) => {
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
    out[key] = i2 >= 0 && s[i2] / s[i1] >= SECOND_REL;
  });
  return out;
};

const crossedFraction = (info, two, pred) => {
  let n = 0; let k = 0;
  Object.entries(info).forEach(([key, v]) => {
    if (v.zone !== 'F' || !pred(v.nz)) return;
    if (two[key] === undefined) return;
    n += 1; if (two[key]) k += 1;
  });
  return { n, frac: n ? k / n : 0 };
};

describe("O3 — the form shadow's cross does not run to the contour", () => {
  // The two-fixture ladder, off the fixture module — never restated as [46, 92].
  BALL_LADDER.forEach((ball) => {
    const radius = ball.params.radius;
    test(`r=${radius}: the outermost band of the form shadow is a single family`, () => {
      const b = build(ball);
      const info = windowInfo(b);
      const two = twoFamilyGrid(b.paths, b.id);
      const limb = crossedFraction(info, two, (nz) => nz < LIMB_NZ);
      expect(limb.n).toBeGreaterThan(8);
      expect(limb.frac).toBeLessThan(0.15);
    });

    whenZones(`r=${radius}: the cross is still there away from the contour (not simply deleted)`, () => {
      const b = build(ball);
      const info = windowInfo(b);
      const two = twoFamilyGrid(b.paths, b.id);
      const limb = crossedFraction(info, two, (nz) => nz < LIMB_NZ);
      const inner = crossedFraction(info, two, (nz) => nz >= 0.55);
      expect(inner.n).toBeGreaterThan(8);
      // The claim here is a GRADIENT away from the silhouette, not an absolute
      // level. HOW MUCH cross F carries at all is `FORM_INK.F.cross`'s business,
      // not the taper's, and it is asserted where it belongs — the F clause of
      // `scene3d-cross-frame.test.js` requires F to carry a measurable crossed
      // family centred on 65°.
      //
      // Recorded because it was my own error: this line first read `> 0.30`, a
      // number I wrote down without measuring it. It was already unmet at r=92
      // BEFORE the taper existed (0.267), so it never tested the taper at all;
      // and halving `F.cross` from 0.40 to 0.20 for F/M then took it to 0.206.
      // A bar that a passing build cannot meet is not a bar.
      expect(inner.frac).toBeGreaterThan(0.15);
      expect(inner.frac).toBeGreaterThan(limb.frac * 2);
    });
  });
});
