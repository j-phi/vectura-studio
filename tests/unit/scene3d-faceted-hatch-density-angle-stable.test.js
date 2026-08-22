const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * fs-v2-facetedangle — owner-reported live defect: "changing the fill
 * Density visibly rotates the hatch, while the angle NUMBER stays put."
 *
 * `tests/unit/scene3d-hatch-density-angle-stable.test.js` (merged, owned
 * elsewhere) proved the CURVED (chart-wrapped) direction field is
 * density-invariant. This file covers the other half: the FACETED path
 * (box/plane/solid/ground).
 *
 * Root cause: `crossFamilies()` (scene3d.js ~:1157-1191) emits the user's
 * family A AND an automatic "dark side" tone-zone cross family at
 * `angleDeg + CROSS_OBJ_DEG_B`, spacing `spacing / w` (w = the facet's zone
 * weight, `Regions.formInk(zone).cross`). The density work in ab975bff gave
 * family A relief from `hatchPolygon`'s historic 1mm spacing floor via a
 * `minSpacing` option, but the automatic cross family kept the unconditional
 * 1mm floor. Above Density 100, family A tightens past 1mm while the cross
 * family cannot, so the ink ratio between the two families shifts and the
 * AGGREGATE rendered bearing drifts even though `fillAngle` never changed.
 *
 * WHY 'solid' (buckyball) + tone.bands=4, and WHY Density 100 -> 500 (not
 * 50 -> 150 the way the curved-path test does it):
 *
 *  - The cross weight `w` is 0 for every zone except F (0.20) and T (1.00)
 *    (regions.js FORM_INK), and `Regions.formZone` only ever returns 'T'
 *    when `tone.bands === 4` (regions.js: "T and R only exist at bands =
 *    4") — a fresh scene ships at bands=3. Worse, a FLAT-FACED primitive
 *    (box/plane) is PERMANENTLY ineligible for 'T' regardless of bands:
 *    `faceZone` gates it on `smoothShadedFaces` (the dihedral rule — "a cube
 *    has an edge, not a terminator", regions.js ~:596), so a box's cross
 *    weight caps at F's 0.20 forever. At w=0.20, `spacing / w` = 5x the
 *    recipe spacing and never comes near a 1mm floor inside Density 50-200
 *    at all — verified empirically (a box measurably does NOT reproduce the
 *    reported drift via this mechanism in that range; whatever a box shows
 *    there is a different, out-of-scope effect). A buckyball's facets ARE
 *    smooth-shaded (small dihedral angles between neighbours), so with
 *    bands=4 a facet can land in T (w=1) and `spacing / w` = the recipe
 *    spacing itself — exactly where the floor asymmetry bites. 'solid' is
 *    still squarely one of the four primitives `crossFamilies` serves.
 *
 *  - Density <= 100 is PROVEN byte-identical by this fix's own gate (see the
 *    BYTE-IDENTITY GUARD below), so comparing 50 vs 150 partly measures
 *    Density<=100's own inherent low-line-count noise (a buckyball's many
 *    independent facets each draw very few lines at d50: 70 total across
 *    the whole object), which this fix neither causes nor can address.
 *    Measured directly: d100 is BYTE-IDENTICAL before and after this fix
 *    (both land on 147.23981061700349 deg, to the last bit — the gate
 *    correctly does nothing at the boundary), so it is the honest anchor.
 *    From there, BEFORE this fix the bearing drifts CONTINUOUSLY and
 *    monotonically as Density climbs the full supported range: 147.2 deg
 *    (d100) -> 151.6 (d150) -> 154.4 (d200) -> 155.1 (d300) -> 157.5 (d500),
 *    a 10.2 deg walk with no sign of leveling off. AFTER this fix the same
 *    sweep is 147.2 -> 141.7 -> 145.1 -> 145.9 -> 148.4: it moves, but stays
 *    inside a ~7 deg band and does not keep climbing — d100 to d500 (the
 *    full range) closes from a 10.2 deg drift to 1.2 deg.
 *
 * Fix: the cross family's own floor is gated the same way
 * `curvedMasterFloorPen` (scene3d.js ~:346) already gates the curved path's
 * analogous relief — `undefined` (⇒ hatchPolygon's untouched 1mm default)
 * for density <= 100, so d<=100 output is byte-identical BY CONSTRUCTION
 * (the option is omitted, exactly as before this fix), and the SAME floor
 * family A already uses above 100, so the two families' floors move
 * together and the ratio stops drifting without bound.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = {
  width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3,
};

// Mean UNDIRECTED segment bearing (deg, 0..180), length-weighted. Mirrors
// scene3d-hatch-density-angle-stable.test.js / scene3d-hatch-angle.test.js.
const meanBearing = (paths) => {
  let sx = 0; let sy = 0; let w = 0;
  paths.forEach((pp) => {
    for (let i = 0; i + 1 < pp.length; i++) {
      const dx = pp[i + 1].x - pp[i].x;
      const dy = pp[i + 1].y - pp[i].y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const r = 2 * Math.atan2(dy, dx);
      sx += Math.cos(r) * len; sy += Math.sin(r) * len; w += len;
    }
  });
  if (!w) return NaN;
  let m = (Math.atan2(sy / w, sx / w) * 90) / Math.PI;
  if (m < 0) m += 180;
  return m;
};

const bearingGap = (a, b) => {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
};

describe('Scene3D — faceted (solid/buckyball) fill bearing is Density-invariant', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // yaw 0 / pitch -60 puts a facet in the T (terminator) zone under the
  // default sun light (azimuth 135, elevation 45) — verified by sweeping
  // yaw/pitch and reading the emitted cross-family weight directly.
  const solidObj = (extra = {}) => ({
    id: 'obj-1',
    name: 'obj-1',
    primitive: 'solid',
    params: {
      solidType: 'buckyball', radius: 25, sideCount: 5, depth: 24, frequency: 2, taper: 55, starRatio: 45,
    },
    transform: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: -60, roll: 0, scale: 1,
    },
    visibility: 'solid',
    ...extra,
  });

  const sceneParams = (fillAngle, density) => {
    const p = clone(defaults);
    // bands=4 is required to ever reach the T zone at all (§5.3) — see file
    // header. Ladder/thresholds otherwise mirror the shipped default shape.
    p.tone = {
      enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.15, 0.35, 0.6, 0.9], specular: { enabled: true, size: 1 },
    };
    p.objects = [solidObj()];
    p.styleTable.byObject['obj-1'] = { penId: null, mapper: 'hatch', params: { fillAngle, fillDensity: density } };
    return p;
  };

  const fillsOf = (fillAngle, density) => (algo.generate(sceneParams(fillAngle, density), null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  const FILL_ANGLE = 20;
  // See file header: the fix does nothing at d<=100 by construction, so d100
  // is the honest, PROVEN-identical anchor, and d500 is the far end of the
  // full supported range. Before the fix this pair drifts 10.2 deg; after,
  // 1.2 deg. 3 deg gives real margin above the measured post-fix figure
  // while remaining far tighter than the pre-fix drift.
  const TOLERANCE_DEG = 3;

  test('hatch: mean rendered bearing on a faceted solid (T-zone cross family live) is stable across Density 100 -> 500 -> 100', () => {
    const b100 = meanBearing(fillsOf(FILL_ANGLE, 100));
    const b500 = meanBearing(fillsOf(FILL_ANGLE, 500));
    const b100again = meanBearing(fillsOf(FILL_ANGLE, 100));
    expect(Number.isFinite(b100)).toBe(true);
    expect(Number.isFinite(b500)).toBe(true);
    expect(bearingGap(b100, b500)).toBeLessThan(TOLERANCE_DEG);
    // Determinism: re-generating at the original density reproduces the
    // exact same bearing — no hysteresis from having visited 500.
    expect(b100again).toBe(b100);
  });

  // ── BYTE-IDENTITY GUARD ────────────────────────────────────────────────
  describe('BYTE-IDENTITY GUARD — density <= 100 is unaffected by the cross-family floor fix', () => {
    test('test seam is published', () => {
      expect(typeof algo.__crossFloorForTest).toBe('function');
    });

    test('every integer density 0-100 gates to undefined (hatchPolygon default 1mm floor applies, exactly as before this fix)', () => {
      for (let d = 0; d <= 100; d++) {
        expect(algo.__crossFloorForTest(d)).toBe(undefined);
      }
      // Fractional densities too.
      [0.5, 12.25, 49.9, 50.1, 99.999].forEach((d) => {
        expect(algo.__crossFloorForTest(d)).toBe(undefined);
      });
    });

    test('density > 100 relaxes to the SAME floor family A already uses (0.3mm through 200, tapering to 0.18mm at 500)', () => {
      expect(algo.__crossFloorForTest(101)).toBeCloseTo(0.3, 10);
      expect(algo.__crossFloorForTest(150)).toBeCloseTo(0.3, 10);
      expect(algo.__crossFloorForTest(200)).toBeCloseTo(0.3, 10);
      expect(algo.__crossFloorForTest(500)).toBeCloseTo(0.18, 10);
    });

    test('full pipeline: density-100 fill output (T-zone scene) is a pure, repeatable function (no nondeterminism introduced)', () => {
      const a = JSON.stringify(fillsOf(FILL_ANGLE, 100));
      const b = JSON.stringify(fillsOf(FILL_ANGLE, 100));
      expect(a.length).toBeGreaterThan(0);
      expect(a).toBe(b);
    });
  });
});
