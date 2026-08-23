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
 *   C12  Layers Off is unchanged                11529.18 mm / 389 paths
 *   C11  Layers adds structure, not ink         2/3/4 within +-25% of their mean
 *   C3   the contact collar is ANCHORED         Z0 identical at every layer count
 *   C6   the umbra recedes                      Z2 carves 2 -> 3 -> 4
 *
 * C12 MOVED TWICE. First in shadowToneDepth (fs-w1-shadowtone, Stage 1 of the
 * shadow tone gradient): 16109.77mm/535 paths -> 11583.00mm/2174 paths —
 * "Layers Off" IS the flat() path in shadows.js, and shadowToneDepth's new
 * default (0.75, SHIPPED ON) applied there via a per-~6mm-chunk keep/drop
 * duty. That mechanism was itself a regression the product owner reported
 * from the running app: chopping every ruling into short pieces reads as
 * scattered stubs on the plotted page, and the 4x path-count jump for LESS
 * ink is real pen-lift cost, not "structure." fs-z2 (Stage 1.1) re-expresses
 * the SAME gradient as ruling SPACING instead of chopping — variable pitch
 * via `buildGradedSpacing` in shadows.js (the object's own tone ladder run
 * back through `Regions.coverageToSpacing`, the same primitive the uniform
 * baseline already uses) — so every emitted ruling stays one unbroken line;
 * only the gap between rulings widens toward the far tip. Moved again:
 * 11583.00mm/2174 paths -> 11529.18mm/389 paths — ink is essentially
 * unchanged (same gradient), path count is back down near the pre-gradient
 * 535 instead of 4x it. See tests/unit/scene3d-shadow-tone-gradient.test.js
 * for the RGR proof, including a byte-identical pin at explicit
 * `shadowToneDepth: 0`. The original pre-gradient 16109.77/535 pin is still
 * reachable by building with `shadow: { shadowToneDepth: 0 }`.
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
    // shadowToneDepth default (0.75) moved this — see the file header. Moved
    // AGAIN in fs-z2 (Stage 1.1): the chunk-and-thin gradient (16109.77/535 ->
    // 11583.00/2174, comment below) fragmented every ruling into ~6mm pieces,
    // which read as scattered stubs on the plotted page and quadrupled the
    // pen-lift count for LESS ink. Re-expressed as ruling SPACING instead
    // (buildGradedSpacing in shadows.js — variable pitch via the object's own
    // coverageToSpacing ladder, no chopping): 11529.18/389. Ink is essentially
    // unchanged (the same gradient), but path count is back down near the
    // pre-gradient baseline instead of 4x it.
    //
    // MOVED AGAIN — fs-z3 (the Layers=4 "mottled stubs / ragged outline"
    // owner report). `off` did NOT move (the flat path is byte-identical,
    // untouched by this batch — see the REGRESSION pin in
    // scene3d-shadow-tone-gradient.test.js). Layers 2/3/4 all moved, for four
    // DELIBERATE, EVIDENCED reasons in `src/core/scene3d/shadows.js`:
    //
    //   1. `outerMargin` (Z3's rim width) was 30% of the local inradius —
    //      23-37% of the shadow's AREA at every caster size measured, not a
    //      rim. Bounded to 10% of Rin instead.
    //   2. Z3 stacked BOTH rim retraction and dash duty on the same band,
    //      double-shortening every rim mark. Retraction is now scoped off
    //      Z_OUTER; dash duty (already the documented, tuned lever for that
    //      zone) is the one mechanism left.
    //   3. `contactWidthOf` scaled off the contact ring's own minor extent,
    //      which is degenerate by construction for any round caster (a
    //      sphere's near-ground slice is a thin annulus) — the collar was
    //      pinned to its 1.2mm floor regardless of caster size. Rescaled to
    //      4.5% of the shadow's own throw length L (floored 1.2mm, capped at
    //      the existing 6%-of-L clamp) — the one quantity every caster shape
    //      produces a non-degenerate value for. (4.5%, not the diagnosis's
    //      illustrative 3%: at 3% a near-prism caster — the box fixture in
    //      scene3d-shadow-controls.test.js — lost enough collar ink to push
    //      its OWN C11 ratio from 1.552 to 1.703, over the 1.667 ceiling; 4.5%
    //      recovers that margin while still lifting a sphere's collar well off
    //      its floor.) Z0 is smaller everywhere as a direct, deliberate
    //      consequence (1318.44 -> 1165.22mm on this fixture) — it is still
    //      IDENTICAL across Layers 2/3/4 (C3), still the darkest zone, and no
    //      longer a fixed 1.2mm regardless of what caster produced it.
    //   4. Ruling-vs-zone-span mismatch: `zoneSpans` cut a ruling wherever the
    //      classified zone changed, with no floor on how short a resulting
    //      span could be — on a compact caster this fragmented every ruling
    //      into slivers a `keepFor`/`dashFor` stride then dropped piecemeal,
    //      leaving isolated stubs (median emitted mark 2.34mm, 40% of marks
    //      under 2mm, against the flat shadow's own 13.27mm median). A span
    //      shorter than 6x its family's own ruling pitch is now coalesced
    //      into its larger neighbour instead of surviving as its own sliver
    //      (`coalesceSpans`, `SPAN_COALESCE_PITCH_MULT`) — see
    //      `tests/unit/scene3d-shadow-zone-fragmentation.test.js` for the RGR
    //      proof of items 1-4, with the RED numbers this fix moved from.
    //
    // Every number below was re-measured on this exact fixture after the fix;
    // C3 (Z0 anchored across Layers 2/3/4), C6 (Z2 recedes 2->3->4) and C11
    // (Layers 2/3/4 within +-25% of their mean) all still hold — see the
    // dedicated tests below, unchanged in shape, only in the digits they pin.
    off: { ink: 11529.18, n: 389 },
    2: {
      ink: 7735.82,
      n: 445,
      zones: { 0: [1165.22, 205], 2: [6570.61, 240] },
    },
    3: {
      ink: 8929.16,
      n: 869,
      zones: { 0: [1165.22, 205], 1: [2018.28, 387], 2: [5745.67, 277] },
    },
    4: {
      ink: 8181.55,
      n: 1069,
      zones: {
        0: [1165.22, 205], 1: [1949.86, 363], 2: [4674.44, 247], 3: [392.03, 254],
      },
    },
  };

  test('C12 — Layers Off is unchanged (at the shadowToneDepth default): 11529.18 mm / 389 paths', () => {
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
    expect(z0).toEqual([[1165.22, 205], [1165.22, 205], [1165.22, 205]]);
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
