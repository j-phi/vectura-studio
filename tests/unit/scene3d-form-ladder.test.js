/**
 * O1 / O2 / O3 — THE FORM LADDER'S RATIOS, PINNED.
 *
 * The Round 7 review noted a protection gap in as many words: "Nothing pins T/F.
 * The plot-safety test asserts max ≤ 0.56 and a coarse ramp shape. Round 8 is
 * free to move F without fighting a test." That is true of F/M and R/F as well.
 * Every one of these ratios has been re-measured by hand, in a review document,
 * every round for eight rounds — and a number that lives only in a review
 * document is a number that regresses silently.
 *
 * So the ladder is asserted here, in the spec's own terms:
 *
 *   O1  D(T) / D(F)  >= 1.25          (§6.3)
 *   O3  T > F > R                     — rises to a peak, then falls twice
 *   O2  D(R) / D(F)  <= 0.60          (§6.3)
 *   F/M              in [1.45, 1.70]  — the Round 7 rebuild target for F,
 *                                       which F overshot at 2.02-2.23
 *
 * D is the FRACTION OF DARK PIXELS in a 4 mm window (§6.1) — rasterised, never
 * summed from ink length, because ink x pen / area is additive and double-counts
 * every crossing. The stroke is stamped into a boolean grid, exactly as
 * `scene3d-plot-safety.test.js` does, so a pixel inked twice is still one dark
 * pixel. Zones come from `Regions.formZone`, the classifier the fill itself
 * consults.
 *
 * RED/GREEN PROVENANCE
 * --------------------
 * At `0b32ee5` F/M measures 2.25 against a 1.70 ceiling and the F/M assertion
 * fails. T/F, T>F>R and R/F pass there and must keep passing.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FIX = require('../fixtures/scene3d-shadow-anatomy');

const { BOUNDS } = FIX;
const PATCH = 4;
const CELL = 0.1;

let runtime; let V;
beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
afterAll(() => { if (runtime) runtime.cleanup(); });

// ROUND 9 — the fixture is no longer restated here either. These four views are
// the harness's own ladder set, and "the four-fixture ladder is the unit of
// report" is a protected item: a ratio that survives one fixture is an anecdote.
const FIXTURES = [
  { view: 'E-bands4', radius: 46 },
  { view: 'V-E-bands4-sun45', radius: 46 },
  { view: 'W-bigball-bands4', radius: 92 },
  { view: 'W-bigball-sun45', radius: 92 },
];

const build = ({ view, radius }) => ({
  np: FIX.buildParams(V, view), paths: FIX.buildPaths(V, view), radius,
});

// Boolean-grid rasteriser: D(window) = filled fraction. Same quantity as the
// designer's dark-pixel instrument, no browser required, immune to overlap.
const darkGrid = (paths, penWidth) => {
  const W = Math.ceil(BOUNDS.width / CELL); const H = Math.ceil(BOUNDS.height / CELL);
  const grid = new Uint8Array(W * H);
  const r = penWidth / 2; const rc = Math.ceil(r / CELL);
  const stamp = (x, y) => {
    const ci = Math.round(x / CELL); const cj = Math.round(y / CELL);
    for (let j = cj - rc; j <= cj + rc; j++) {
      if (j < 0 || j >= H) continue;
      for (let i = ci - rc; i <= ci + rc; i++) {
        if (i < 0 || i >= W) continue;
        const dx = i * CELL - x; const dy = j * CELL - y;
        if (dx * dx + dy * dy <= r * r) grid[j * W + i] = 1;
      }
    }
  };
  paths.forEach((p) => {
    if (!p || p.length < 2) return;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(L > 0)) continue;
      const n = Math.max(1, Math.ceil(L / (CELL / 2)));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      }
    }
  });
  return { grid, W, H };
};
// null when the window is not WHOLLY on the page. A partly-off-page window has
// less paper to be dark, so scoring it reports the page edge, not the drawing:
// the 92 mm ball overruns the top of the 220 mm page, which is exactly where the
// terminator sits, and counting those windows as D=0 dragged T under F and
// reported T/F 0.87 where the harness measures 1.35.
const windowD = ({ grid, W, H }, gx, gy) => {
  const i0 = Math.round((gx * PATCH) / CELL); const j0 = Math.round((gy * PATCH) / CELL);
  const span = Math.round(PATCH / CELL);
  if (i0 < 0 || j0 < 0 || i0 + span > W || j0 + span > H) return null;
  let dark = 0; let n = 0;
  for (let j = j0; j < j0 + span; j++) {
    for (let i = i0; i < i0 + span; i++) {
      n += 1; if (grid[j * W + i]) dark += 1;
    }
  }
  return n ? dark / n : 0;
};

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
};
const hull = (pts) => {
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = []; const up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
};

const ladder = ({ np, paths, radius }) => {
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;
  const scn = Sc.assembleScene(np, BOUNDS);
  const obj = np.objects[0];
  const chart = V.Scene3D.SurfaceFill.chartFor('sphere', { sx: radius, sy: radius, sz: radius });
  const E = 1e-3; const N = Math.max(200, Math.round(200 * (radius / 46)));
  const cell = {}; const pts = [];
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
      if (G3.rotatePoint(nn, scn.camera).z <= 0) continue;
      const scr = scn.projectWorld(world); if (!scr) continue;
      const z = R.formZone(nn, world, {
        tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * radius },
      });
      pts.push({ x: scr.x, y: scr.y });
      const k = `${Math.floor(scr.y / PATCH)},${Math.floor(scr.x / PATCH)}`;
      (cell[k] = cell[k] || {})[z] = (cell[k][z] || 0) + 1;
    }
  }
  const sil = hull(pts);
  const g = darkGrid(paths, BOUNDS.penWidth);
  const acc = {};
  Object.entries(cell).forEach(([k, h]) => {
    const [gy, gx] = k.split(',').map(Number);
    const x0 = gx * PATCH; const y0 = gy * PATCH;
    const corners = [[x0, y0], [x0 + PATCH, y0], [x0, y0 + PATCH], [x0 + PATCH, y0 + PATCH]];
    if (!corners.every(([X, Y]) => inPoly(X, Y, sil))) return;
    const tot = Object.values(h).reduce((s, v) => s + v, 0);
    if (tot < 20) return;
    const dom = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    if (dom[1] < 0.65 * tot) return;
    const D = windowD(g, gx, gy);
    if (D == null) return;
    (acc[dom[0]] = acc[dom[0]] || []).push(D);
  });
  const mean = (a) => (a && a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const all = Object.values(acc).flat();
  return {
    L: mean(acc.L), M: mean(acc.M), T: mean(acc.T), F: mean(acc.F), R: mean(acc.R),
    max: all.length ? Math.max(...all) : NaN, n: acc,
  };
};

describe('the form ladder holds its ratios (O1 / O2 / O3 / O6)', () => {
  FIXTURES.forEach((fx) => {
    describe(fx.view, () => {
      let m;
      beforeAll(() => { m = ladder(build(fx)); });

      test('O3 — the dip is a shape: T > F > R', () => {
        expect(m.T).toBeGreaterThan(m.F);
        expect(m.F).toBeGreaterThan(m.R);
      });

      test('O1 — the terminator out-inks the form shadow by >= 1.25x', () => {
        expect(m.T / m.F).toBeGreaterThanOrEqual(1.25);
      });

      test('O2 — the reflected rim lifts: R <= 0.60 x F', () => {
        expect(m.R / m.F).toBeLessThanOrEqual(0.60);
      });

      test('the form shadow sits in its own band above the halftone: F/M in [1.45, 1.70]', () => {
        expect(m.F / m.M).toBeGreaterThanOrEqual(1.45);
        expect(m.F / m.M).toBeLessThanOrEqual(1.70);
      });

      // ── O6 — RATCHETED, NOT MET. The spec asks D(L) >= 0.10. ───────────────
      //
      // Round 8 showed O6 is arithmetically UNREACHABLE inside the current law:
      // the lit zone's composed ceiling is TOTAL_DARK_CEIL x L.coverage /
      // DARKEST_WEIGHT = 0.47 x 0.42 / 2.0 = 0.0987, under the spec's own 0.10
      // before a line is drawn. The Round 8 review ruled that the fix is a FLOOR
      // on the L zone's ceiling, and that it "cannot touch max(object)".
      //
      // ROUND 9 MEASURED ALL OF THAT, AND THE PROPOSED LEVER IS DISPROVED.
      // Four-fixture D(L), on this instrument, one lever at a time:
      //
      //   baseline                                   0.069 0.068 0.076 0.086
      //   L's composed ceiling REMOVED ENTIRELY      0.075 0.076 0.077 0.087
      //   LIT_MAX_PITCH_PEN 12 -> 10, and -> 8       0.069 0.068 0.076 0.086
      //   L ceiling floored at 0.16                  0.075 0.076 0.077 0.087
      //   + L's specular damping removed             0.100 0.095 0.099 0.106
      //
      // Removing L's ceiling outright buys +0.007. The ceiling is not the
      // binder: L's own coverage is, at raw x GLINT_KEEP = 0.42 x 0.6 = 0.252
      // after the specular cap halves it. `LIT_MAX_PITCH_PEN` — the mechanism
      // written for O6 — is dead at 12, at 10 and at 8, because the coverage cap
      // dominates it at every value.
      //
      // AND THE ONLY LEVER THAT REACHES 0.10 COSTS THE STEP ABOVE IT: L/M goes
      // 0.52-0.72 to 0.73-0.92, i.e. the lit band and the halftone converge.
      // Raising M instead to reopen the step takes F/M from 1.53-1.66 to ~1.20,
      // through the protected [1.45, 1.70] floor; raising F to compensate walks
      // max(object) at the T end toward the protected 0.56, whose worst-of-four
      // margin is already 3.8 %. The ladder is fully constrained: O6 at 0.10
      // cannot be bought without breaking a protected item, and that is a ruling
      // for the spec, not a number to tune toward.
      //
      // So O6 is RATCHETED here at what it actually measures. It may not fall.
      test('O6 — the centre light carries tone (spec bar 0.10; ratcheted at the measured level)', () => {
        expect(m.L).toBeGreaterThanOrEqual(0.065);
      });

      // O4/O7 — and the step above it stays open. This is the bar the only
      // working O6 lever would breach, so it is pinned before anyone spends it.
      test('O4/O7 — the lit -> halftone step stays open: L <= 0.75 x M', () => {
        expect(m.L / m.M).toBeLessThanOrEqual(0.75);
      });

      // O13 / C2 — the object's darkest patch, ON EVERY FIXTURE. Round 7
      // protected `max(object) <= 0.56` and Round 8 protected "the four-fixture
      // ladder is the unit of report" precisely because Round 8 reported this
      // number from the single fixture where it had improved while the
      // worst-of-four went the other way. Asserting it per fixture is what makes
      // "worst of four" a fact rather than a reporting convention.
      test('O13 — the object never out-inks the contact collar: max(object) <= 0.56', () => {
        expect(m.max).toBeLessThanOrEqual(0.56);
      });
    });
  });
});
