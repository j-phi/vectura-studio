/**
 * THE CAST SHADOW, PINNED PER ZONE AND PER LAYER COUNT.
 *
 * The Round 7 review found a protection gap and stated it plainly:
 *
 *   > `Z0 = 1318.44 mm / 211 paths at Layers 2/3/4`, `Off = 16109.77`, and the
 *   > C11 triple exist ONLY in these review documents and in my scratch probe.
 *   > The test suite pins the cast shadow with a single number in a single
 *   > baseline. Round 8 must add a cast-shadow golden pinning per-zone ink at
 *   > Layers 2/3/4.
 *
 * It was worse than that. Exactly one visual golden carries a `castShadow`
 * section at all (`shadow-additive-default.json`, 191 paths / 4248.7242 ink),
 * and the reviewer's own audit script `r7audit-protected.js` reads
 * `p.regionClass` / `p.meta.regionClass` — neither of which exists. The class
 * lives at `p.meta.sceneTarget.regionClass` and the layer index at
 * `p.meta.sceneTarget.shadowLayer`. That script printed `cast 0.00mm/0p` for
 * every view, so it could not have caught a cast-shadow regression either.
 *
 * The cast shadow has been declared complete (15/15) and is explicitly
 * protected: nothing on the object side may move it. This file is what makes
 * that enforceable.
 *
 * WHAT IS PINNED, and why each number is here rather than in a review document:
 *
 *   C12  Layers Off is unchanged                16109.77 mm / 535 paths
 *   C11  Layers adds structure, not ink         2/3/4 within +-25% of their mean
 *   C3   the contact collar is ANCHORED         Z0 identical at every layer count
 *   C6   the umbra recedes                      Z2 carves 2 -> 3 -> 4
 *
 * THE FIXTURE IS NOT RESTATED HERE ANY MORE (Round 9).
 *
 * It was, and the Round 8 review named that the standing risk: this file is the
 * SOLE enforcement of the protected cast shadow, so a restated A-view meant that
 * if `render.js`'s A-view ever moved, the test would keep passing on a scene
 * nobody renders. The A-view now lives in `tests/fixtures/scene3d-shadow-anatomy.js`
 * and both the harness and this file import it. The scene below is
 * `VIEWS['A-off'|'A-2'|'A-3'|'A-4']` and nothing else.
 *
 * The fixture is a 46 mm ball plus an upright box. The box matters — a sphere's
 * contact set is a POINT, so a 4 mm window can never be pure collar, which is
 * why C2/C3/C4/C15 were unscoreable for three rounds.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FIX = require('../fixtures/scene3d-shadow-anatomy');

let runtime; let V;
beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
afterAll(() => { if (runtime) runtime.cleanup(); });

// A-off / A-2 / A-3 / A-4 — the harness's own protected views, read from the
// shared fixture. No camera, sun, object or tone table is written in this file.
const build = (layers) => FIX.buildPaths(V, layers === 'off' ? 'A-off' : `A-${layers}`);

const inkOf = (p) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return s;
};

// Cast-shadow ink, total and per shadow zone. The class and the layer index both
// live under `meta.sceneTarget` — see the file header.
const castOf = (paths) => {
  let ink = 0; let n = 0;
  const byZone = {};
  paths.forEach((p) => {
    if (!p || p.length < 2) return;
    const t = (p.meta && p.meta.sceneTarget) || {};
    if (t.regionClass !== 'castShadow') return;
    const L = inkOf(p);
    ink += L; n += 1;
    if (t.shadowLayer == null) return;
    const z = byZone[t.shadowLayer] || (byZone[t.shadowLayer] = { ink: 0, n: 0 });
    z.ink += L; z.n += 1;
  });
  return { ink, n, byZone };
};

const round2 = (x) => Math.round(x * 100) / 100;

describe('the cast shadow is protected — per zone, at every layer count', () => {
  const EXPECT = {
    off: { ink: 16109.77, n: 535 },
    2: {
      ink: 7840.20,
      n: 428,
      zones: { 0: [1318.44, 211], 2: [6521.76, 217] },
    },
    3: {
      ink: 8896.92,
      n: 835,
      zones: { 0: [1318.44, 211], 1: [1776.09, 355], 2: [5802.40, 269] },
    },
    4: {
      ink: 7448.60,
      n: 1199,
      zones: {
        0: [1318.44, 211], 1: [1750.32, 348], 2: [3735.33, 239], 3: [644.51, 401],
      },
    },
  };

  test('C12 — Layers Off is unchanged: 16109.77 mm / 535 paths', () => {
    const c = castOf(build('off'));
    expect(c.n).toBe(EXPECT.off.n);
    expect(round2(c.ink)).toBe(EXPECT.off.ink);
  });

  [2, 3, 4].forEach((layers) => {
    test(`Layers ${layers} — total cast ink and every zone, to the hundredth`, () => {
      const c = castOf(build(layers));
      expect(c.n).toBe(EXPECT[layers].n);
      expect(round2(c.ink)).toBe(EXPECT[layers].ink);
      const got = Object.fromEntries(
        Object.entries(c.byZone).map(([k, z]) => [k, [round2(z.ink), z.n]]),
      );
      expect(got).toEqual(EXPECT[layers].zones);
    });
  });

  test('C3 — the contact collar is ANCHORED: Z0 is identical at every layer count', () => {
    const z0 = [2, 3, 4].map((n) => {
      const c = castOf(build(n));
      return [round2(c.byZone[0].ink), c.byZone[0].n];
    });
    expect(z0).toEqual([[1318.44, 211], [1318.44, 211], [1318.44, 211]]);
  });

  test('C11 — Layers adds structure, not ink: 2/3/4 stay within +-25% of their mean', () => {
    const totals = [2, 3, 4].map((n) => castOf(build(n)).ink);
    const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
    totals.forEach((t) => {
      expect(Math.abs(t - mean) / mean).toBeLessThanOrEqual(0.25);
    });
  });

  test('C6 — the umbra recedes: Z2 carves away as layers are added', () => {
    const z2 = [2, 3, 4].map((n) => castOf(build(n)).byZone[2].ink);
    expect(z2[0]).toBeGreaterThan(z2[1]);
    expect(z2[1]).toBeGreaterThan(z2[2]);
  });
});
