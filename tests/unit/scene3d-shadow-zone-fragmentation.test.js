/**
 * fs-z3 — Layers 4 "mottled stubs / ragged outline" (owner report).
 *
 * The owner's scene is a sphere resting on the ground plane, DEFAULT Scene3D
 * (radius 20, sun az135/el45, shadow angle 45, shadow density 50, pen 0.3),
 * shadow mode Additive, Shadow Layers 4. Reported symptom: the shadow reads as
 * mottled broken stubs near the caster instead of a solid dark contact band,
 * with a ragged/scalloped outline. Layers 2 and 3 render cleanly; only
 * Layers 4 was broken. Measured before this fix (paths / ink / median mark /
 * marks under 2mm), against the same scene with Layers OFF:
 *
 *   Layers off   61 paths   683.43mm   median 13.27mm   3.28% under 2mm
 *   Layers 4    156 paths   449.10mm   median  2.32mm  40.4%  under 2mm
 *
 * i.e. 2.6x the paths for 34% LESS ink, and a median mark roughly a fifth the
 * flat shadow's own. Four bounded defects in `src/core/scene3d/shadows.js`
 * (all inside the Layers-on zone-anatomy build; the flat/Off path is
 * byte-identical before and after — see the REGRESSION pin in
 * `scene3d-shadow-tone-gradient.test.js`):
 *
 *   1. `outerMargin` (Z3's rim width) was bounded to 30% of the local
 *      inradius — a genuine RIM only in name; measured 23-37% of the
 *      shadow's AREA at every caster size. Bounded to 10% of Rin instead.
 *   2. Z3 stacked BOTH rim retraction (up to 1.2x rimFeather off each mark
 *      end) and dash duty (0.35-0.75 duty at a ~spacing-x10 period) on the
 *      SAME band, double-shortening every rim mark. Retraction is now scoped
 *      off Z_OUTER — dash duty, already the documented/tuned lever for that
 *      zone, is the one mechanism left.
 *   3. `contactWidthOf` scaled off the contact ring's own minor extent,
 *      which is degenerate BY CONSTRUCTION for any round caster (a sphere's
 *      near-ground slice is a thin annulus) — the collar sat at its 1.2mm
 *      floor regardless of caster size. Rescaled to a fraction of the
 *      shadow's own throw length L instead.
 *   4. `zoneSpans` cut a ruling wherever the classified zone changed, with no
 *      floor on how short a resulting span could be. On a compact caster
 *      this fragmented every ruling into slivers a few mm long, which
 *      `keepFor`/`dashFor` then kept or dropped PER SLIVER — a ruling kept in
 *      one zone and dropped in the next left an isolated stub rather than a
 *      coherent line. A span shorter than 6x its family's own ruling pitch
 *      is now coalesced into its larger neighbour instead of surviving on
 *      its own (`coalesceSpans`), with the contact collar (Z_CONTACT) as a
 *      HARD boundary it never merges across (C3 — the collar must stay
 *      IDENTICAL at every Layers setting; a first cut of this coalescing
 *      broke that and was caught by the C3 regression below before it
 *      shipped).
 *
 * The golden per-zone ink pins for the shadow-anatomy fixture (ball + post,
 * `tests/fixtures/scene3d-shadow-anatomy.js`) moved accordingly — see
 * `tests/unit/scene3d-cast-shadow-zones.test.js`'s own re-baseline comment
 * for that fixture's before/after table and C3/C6/C11 re-verification.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));

let runtime; let V; let Shadows;
beforeAll(async () => {
  runtime = await loadVecturaRuntime();
  V = runtime.window.Vectura;
  Shadows = V.Scene3D.Shadows;
});
afterAll(() => { if (runtime) runtime.cleanup(); });

// ── the owner's exact scenario: DEFAULT Scene3D, a sphere resting on the
// ground, sun az135/el45, shadow angle 45, density 50, pen 0.3 ─────────────
const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: 0.3, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
const ballScene = (V2, radius, layers, extraShadow = {}) => {
  const p = clone(V2.ALGO_DEFAULTS.scene3d);
  p.seed = 0;
  p.objects = [{
    id: 'obj-1',
    name: 'Sphere 1',
    primitive: 'sphere',
    params: { radius, detail: 28 },
    transform: {
      x: 0, y: radius, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
    },
    visibility: 'solid',
  }];
  p.shadow = {
    ...p.shadow,
    shadowLayers: layers !== 'off',
    shadowLayerCount: layers === 'off' ? 3 : layers,
    ...extraShadow,
  };
  return p;
};
const buildOwnerScene = (radius, layers, extraShadow) => {
  const p = V.Scene3D.Params.normalizeParams(ballScene(V, radius, layers, extraShadow));
  return V.AlgorithmRegistry.scene3d.generate(
    V.Scene3D.Params.collectSceneParams(p, []), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS,
  ) || [];
};

const inkOf = (p) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return s;
};
const castPaths = (paths) => paths.filter((p) => {
  const t = (p && p.meta && p.meta.sceneTarget) || {};
  return t.regionClass === 'castShadow';
});
const round2 = (x) => Math.round(x * 100) / 100;
const markStats = (paths) => {
  const cast = castPaths(paths);
  const lens = cast.map(inkOf).filter((l) => l > 0).sort((a, b) => a - b);
  const ink = lens.reduce((a, b) => a + b, 0);
  const median = lens.length
    ? (lens.length % 2 ? lens[(lens.length - 1) / 2] : (lens[lens.length / 2 - 1] + lens[lens.length / 2]) / 2)
    : 0;
  const under2 = lens.filter((l) => l < 2).length;
  const byZone = {};
  cast.forEach((p) => {
    const z = p.meta.sceneTarget.shadowLayer;
    if (z == null) return;
    const L = inkOf(p);
    if (!byZone[z]) byZone[z] = { ink: 0, n: 0 };
    byZone[z].ink += L; byZone[z].n += 1;
  });
  return {
    paths: cast.length,
    ink: round2(ink),
    median: round2(median),
    under2Pct: round2(lens.length ? (100 * under2 / lens.length) : 0),
    byZone,
  };
};

describe('fs-z3 — the owner scenario, Layers off/2/3/4 (items 1-4 combined)', () => {
  // RED (measured on b0f600e8, before this fix — see file header): Layers 4
  // was 156 paths / 449.10mm / median 2.32mm / 40.4% of marks under 2mm.
  // GREEN (measured below, after the fix): fewer, longer, more coherent
  // marks — median mark length up ~55%, marks under 2mm cut by more than
  // half, and total ink UP (structure recovered, not merely thinned).
  test('C12-equivalent — Layers Off is unchanged: 683.43mm / 61 paths, median 13.27mm', () => {
    const s = markStats(buildOwnerScene(20, 'off'));
    expect(s.paths).toBe(61);
    expect(s.ink).toBe(683.43);
    expect(s.median).toBe(13.27);
    expect(s.under2Pct).toBe(3.28);
  });

  test('Layers 2 — 452.69mm / 70 paths, median 3.55mm, 11.43% under 2mm', () => {
    const s = markStats(buildOwnerScene(20, 2));
    expect(s.paths).toBe(70);
    expect(s.ink).toBe(452.69);
    expect(s.median).toBe(3.55);
    expect(s.under2Pct).toBe(11.43);
  });

  test('Layers 3 — 578.61mm / 123 paths, median 3.91mm, 13.01% under 2mm', () => {
    const s = markStats(buildOwnerScene(20, 3));
    expect(s.paths).toBe(123);
    expect(s.ink).toBe(578.61);
    expect(s.median).toBe(3.91);
    expect(s.under2Pct).toBe(13.01);
  });

  // THE HEADLINE. RED: 156 paths / 449.10mm / median 2.32mm / 40.4% under 2mm.
  test('Layers 4 — the reported defect: 537.35mm / 123 paths, median 3.59mm, 17.07% under 2mm', () => {
    const s = markStats(buildOwnerScene(20, 4));
    expect(s.paths).toBe(123);
    expect(s.ink).toBe(537.35);
    expect(s.median).toBe(3.59);
    // RED was 40.4% — this must be well below that, not merely under it.
    expect(s.under2Pct).toBeLessThan(20);
    expect(s.median).toBe(3.59);
  });

  test('the median mark at Layers 4 moves toward the Layers-off figure, not away from it', () => {
    const off = markStats(buildOwnerScene(20, 'off'));
    const l4 = markStats(buildOwnerScene(20, 4));
    // RED: l4.median (2.32) was 17.5% of off.median (13.27). GREEN must clear
    // 25% — a real, measurable recovery, not a rounding-level nudge.
    expect(l4.median / off.median).toBeGreaterThan(0.25);
  });

  // C3, RE-VERIFIED ON THE OWNER'S OWN SCENE (not just the ball+post
  // fixture). A first cut of item 4's span-coalescing let a short NON-contact
  // sliver merge INTO a Z_CONTACT neighbour (or the reverse), which broke
  // this on exactly this scene before the coalescer was scoped to treat
  // Z_CONTACT as a hard boundary it never crosses.
  test('C3 — the contact collar (Z0) is IDENTICAL at every Layers setting on the owner scene', () => {
    const z0 = [2, 3, 4].map((n) => {
      const s = markStats(buildOwnerScene(20, n));
      return [s.byZone[0].ink, s.byZone[0].n];
    });
    expect(z0[0]).toEqual(z0[1]);
    expect(z0[1]).toEqual(z0[2]);
  });
});

describe('fs-z3, item 5 — Density under Layers (evidenced, partial fix, deferred remainder)', () => {
  // RED (measured pre-fix): ink at Layers 4 spanned 137-472mm across the
  // whole 1-100 Density range and was NOT monotonic — Density 50 -> 60 made
  // the shadow 28% LIGHTER (449 -> 322mm) because the master-grid stride N
  // flipped 2 -> 3 while `scale` simultaneously snapped to its 2.2 ceiling.
  //
  // Items 1-4 above did not touch `strideLadder`/`headroomScale`/`rungScale`
  // — the ladder/headroom system that drives this — so its behaviour here is
  // whatever it already was, not a regression from this batch. It DID
  // improve as a side effect of the collar-width retune (item 3): the sweep
  // below is monotonic non-decreasing at every step EXCEPT one, Density
  // 50 -> 60 (537.35mm -> 434.55mm). Root cause, measured directly (temporary
  // instrumentation on `headroomScale`, not shipped): at Density 50,
  // sBase=0.6 and `headroomScale(sBase, penWidth)` returns 1 (the darkest
  // rung is already under SATURATION, so no correction fires) and `scale` is
  // set by `rungScale` alone (1.2). At Density 60, sBase drops to 0.5 and
  // `headroomScale` jumps to 2.80 — the darkest rung's composed coverage
  // crossed the 0.78 SATURATION ceiling somewhere in that narrow interval,
  // and correcting for it demands a MUCH sparser master ladder (scale
  // clamped to its 2.2 ceiling, sPen 0.72mm -> 1.10mm) despite the higher
  // density. That is a real discontinuity in a system with an extensive,
  // deliberately-tuned Round-1-through-8 history in its own comments
  // (SATURATION, COLLAR_CEIL, collarStrideFor/collarCrossStrideFor) that
  // items 1-4's own verified-safe C1/C2/C3/C6/C11/C15 state depends on.
  // Smoothing it is a real, separate fix (interpolating the ladder across the
  // saturation boundary, or reworking how `scale` composes with `rungScale`)
  // that risks destabilising that already-tuned system for a single
  // narrow-band artifact — out of proportion for this batch. Deferred, with
  // this evidence, per the task's own allowance for a well-evidenced
  // deferral. At minimum, this test pins that the sweep is monotonic
  // everywhere else and does not regress further.
  test('ink is non-decreasing in Density across the sweep except the one documented dip', () => {
    const stops = [10, 20, 25, 30, 40, 50, 60, 70, 75, 85, 90, 100];
    const inks = stops.map((d) => markStats(buildOwnerScene(20, 4, { shadowDensity: d })).ink);
    let violations = 0;
    const violationStops = [];
    for (let i = 1; i < inks.length; i++) {
      if (inks[i] < inks[i - 1]) { violations++; violationStops.push([stops[i - 1], stops[i]]); }
    }
    expect(violations).toBeLessThanOrEqual(1);
    if (violations === 1) expect(violationStops[0]).toEqual([50, 60]);
    // The endpoints are unambiguously monotonic — Density 100 must still be
    // darker than Density 10, whatever happens in the middle.
    expect(inks[inks.length - 1]).toBeGreaterThan(inks[0]);
  });
});

// ── item 1 & item 3 — isolated ablations on a controlled synthetic footprint
// (an ellipse at the owner's own r20 bounding-box proportions, 56.2 x 14.1mm,
// with a short 3mm contact segment near its "near" tip — the same convention
// scene3d-shadow-tone-gradient.test.js and the __gradedHatchForTest/
// __buildGradedSpacingForTest seams already use a synthetic rectangle for).
// This exercises the REAL `buildZoneModel`/`zoneAt` (via the __zoneModelForTest
// / __zoneAreaShareForTest seams), not a restatement of it, so it cannot drift
// from what production actually classifies. ─────────────────────────────────
describe('fs-z3, item 1 — Z3 is a genuine RIM, not ~37% of the shadow', () => {
  const ellipseRing = (a, b, cx, cy, n) => {
    const ring = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      ring.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
    }
    return ring;
  };
  const LEN = 56.2; const WID = 14.1;
  const rings = [ellipseRing(LEN / 2, WID / 2, LEN / 2, 0, 64)];
  const contactSegs = [[{ x: 0.3, y: -1.5 }, { x: 0.3, y: 1.5 }]];

  // RED, measured by isolated ablation (same fields/L/Rin/contactWidth the
  // fixed code produces; ONLY outerMargin's own formula swapped back to the
  // pre-fix one, `clamp(min(0.05*L, 0.30*Rin), 0.8, 5)`): Z3 area share
  // 37.6% — matches the task's own r20-sphere diagnosis (37.4%) closely,
  // confirming this synthetic footprint is representative.
  test('GREEN — Z3 area share is a rim (well under the RED 37.6%)', () => {
    const model = Shadows.__zoneAreaShareForTest(rings, contactSegs, 0.3, 4, 0.5);
    expect(model).toBeTruthy();
    const z3Share = model.shares['3'] || 0;
    expect(z3Share).toBeLessThan(0.25);
    // And it is not accidentally zeroed out either — a rim, not nothing.
    expect(z3Share).toBeGreaterThan(0.05);
  });

  test('outerMargin is bounded to ~10% of Rin, not ~30% (the RED formula)', () => {
    const model = Shadows.__zoneModelForTest(rings, contactSegs, 0.3, 4, 0.5);
    const oldMargin = Math.max(0.8, Math.min(5, Math.min(0.05 * model.L, 0.30 * model.fields.Rin)));
    // The new margin must be meaningfully smaller than the old one on this
    // representative elongated footprint — RED measured 2.10mm here.
    expect(model.outerMargin).toBeLessThan(0.6 * oldMargin);
  });
});

describe('fs-z3, item 3 — contactWidthOf tracks the caster, not a 1.2mm floor', () => {
  const ellipseRing = (a, b, cx, cy, n) => {
    const ring = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      ring.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
    }
    return ring;
  };
  const LEN = 56.2; const WID = 14.1;
  const rings = [ellipseRing(LEN / 2, WID / 2, LEN / 2, 0, 64)];
  // A near-point contact set (both x AND y collapse to ~0 extent) — exactly
  // the degenerate case a round caster's near-ground slice produces (see
  // `nadirContact`'s own comment: "a sphere touches at a POINT").
  const contactSegs = [[{ x: 0.3, y: -1.5 }, { x: 0.3, y: 1.5 }]];

  test('the collar half-width is off the 1.2mm floor and scales with the throw', () => {
    const model = Shadows.__zoneModelForTest(rings, contactSegs, 0.3, 4, 0.5);
    // RED (the pre-fix ring-minor-extent formula, on this contact set):
    // max(1.2, 0.12*ringMinExtent) = max(1.2, 0) = 1.2mm exactly (degenerate
    // floor). GREEN must clear it by a real margin.
    expect(model.contactWidth).toBeGreaterThan(1.2 * 1.5);
    // And it must still respect the C3 hard clamp (<=6% of the throw).
    expect(model.contactWidth).toBeLessThanOrEqual(0.06 * model.L + 1e-6);
  });
});

describe('fs-z3, item 4 — a ruling is not zone-split into slivers shorter than its own pitch', () => {
  const ellipseRing = (a, b, cx, cy, n) => {
    const ring = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      ring.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
    }
    return ring;
  };
  const LEN = 56.2; const WID = 14.1;
  const rings = [ellipseRing(LEN / 2, WID / 2, LEN / 2, 0, 64)];
  const contactSegs = [[{ x: 0.3, y: -1.5 }, { x: 0.3, y: 1.5 }]];
  const cfgBase = {
    angle: 45, coverage: 0.5, penWidth: 0.3, layers: true, falloff: 0.5,
    toneLaw: 'ladder', toneDepth: 0, tone: null,
  };

  // GREEN, measured directly off `__emitShadowRegionForTest`'s raw marks
  // (pre-clip, exactly what would be drawn): 44 distinct rulings emit 69
  // marks — a mean of 1.57 marks per ruling, not the RED 3.26/ruling the
  // owner's real scene measured pre-fix (197 rulings -> 643 zone spans).
  test('mean marks-per-ruling stays close to 1, not the RED 3.26', () => {
    const { raw } = Shadows.__emitShadowRegionForTest(rings, contactSegs, { ...cfgBase, layerCount: 4 });
    expect(raw.length).toBeGreaterThan(0);
    const byRuling = new Map();
    raw.forEach((r) => {
      const key = `${r.familyId}:${r.ruling}`;
      byRuling.set(key, (byRuling.get(key) || 0) + 1);
    });
    const mean = [...byRuling.values()].reduce((a, b) => a + b, 0) / byRuling.size;
    expect(mean).toBeLessThan(2);
  });

  // Boundary-gap sd (pen-lift distance between consecutive kept marks on the
  // same ruling): must APPROACH Layers 3's own figure, not sit far above it —
  // a scalloped/ragged Layers 4 would show a much larger spread than Layers 3
  // on the identical footprint.
  test('boundary-gap sd at Layers 4 approaches the Layers 3 figure', () => {
    const gapStats = (layerCount) => {
      const { raw } = Shadows.__emitShadowRegionForTest(rings, contactSegs, { ...cfgBase, layerCount });
      const byRuling = new Map();
      raw.forEach((r) => {
        const key = `${r.familyId}:${r.ruling}`;
        if (!byRuling.has(key)) byRuling.set(key, []);
        byRuling.get(key).push(r);
      });
      const gaps = [];
      byRuling.forEach((marks) => {
        marks.sort((a, b) => a.t0 - b.t0);
        for (let i = 1; i < marks.length; i++) gaps.push(marks[i].t0 - marks[i - 1].t1);
      });
      const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
      const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / (gaps.length || 1);
      return { n: gaps.length, sd: Math.sqrt(variance) };
    };
    const l3 = gapStats(3);
    const l4 = gapStats(4);
    expect(l3.n).toBeGreaterThan(10);
    expect(l4.n).toBeGreaterThan(10);
    // GREEN measured: L3 sd 1.021, L4 sd 1.078 — within 15%, not the
    // "0.29 vs 0.55" (~90% worse) shape the RED symptom described.
    expect(l4.sd).toBeLessThan(l3.sd * 1.3);
  });
});
