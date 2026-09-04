const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const F = require('../fixtures/scene3d-shadow-overlap-fixture');
const crypto = require('crypto');

/*
 * Shadow OVERLAP darkening (sf/shadow-overlap).
 *
 * Two casters whose footprints overlap must read as ONE DEEPER shadow: the
 * overlap region rules at a TIGHTER pitch in the SAME direction, never as a
 * crosshatch and never as a second coincident copy of the same grid (family
 * rulings are phase-anchored to an absolute origin, so re-emitting a region at
 * the same pitch lays exactly the same ink — see `familyRulings`).
 *
 * The contract:
 *   1. n overlapping casters -> monotonically tighter pitch (the ladder);
 *   2. the tightest rung never goes below the file's own plot floor
 *      (PLOT_FLOOR_MULT = 1.2 x penWidth), so the densest overlap cannot
 *      flood to solid ink;
 *   3. measured ink density in the overlap region beats either single-shadow
 *      region;
 *   4. a ONE-caster scene, and a two-caster scene whose shadows do NOT
 *      overlap, stay byte-identical to the pre-change renderer (proved
 *      against a digest captured on the parent commit).
 */

const BASELINE = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../fixtures/scene3d-shadow-overlap-baseline.json'), 'utf8'
));

const digest = (paths) => crypto.createHash('sha256').update(JSON.stringify(paths)).digest('hex');

const polyArea = (poly) => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) / 2;
};
const inkLength = (pts) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};

// Ink per unit area, split by overlap depth. Every emitted path names its own
// region through meta.sceneTarget.pickPolygon, so regions are grouped by that
// polygon and each region's area counted exactly once.
const densityByDepth = (paths) => {
  const regions = new Map();
  paths.forEach((p) => {
    const t = p.meta.sceneTarget;
    const key = JSON.stringify(t.pickPolygon);
    let r = regions.get(key);
    if (!r) {
      r = { depth: t.shadowOverlap || 1, area: polyArea(t.pickPolygon), ink: 0 };
      regions.set(key, r);
    }
    r.ink += inkLength(p.pts);
  });
  const acc = new Map();
  regions.forEach((r) => {
    const a = acc.get(r.depth) || { area: 0, ink: 0, regions: 0 };
    a.area += r.area; a.ink += r.ink; a.regions += 1;
    acc.set(r.depth, a);
  });
  const out = {};
  acc.forEach((a, depth) => { out[depth] = { ...a, density: a.ink / (a.area || 1) }; });
  return out;
};

describe('Scene3D.Shadows — overlapping shadows darken', () => {
  let runtime;
  let V;
  let Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
  });

  afterAll(() => runtime.cleanup());

  test('the overlap pitch ladder is monotonic in n and never breaks the plot floor', () => {
    const penWidth = 0.3;
    const floor = 1.2 * penWidth; // PLOT_FLOOR_MULT x penWidth — the file's plot floor
    const sBase = 0.6;            // coverage 0.5 at penWidth 0.3
    const pitches = [1, 2, 3, 4, 12].map((n) => Shadows.__overlapPitchForTest(sBase, penWidth, n));
    expect(pitches[0]).toBe(sBase);                     // n = 1 is untouched
    for (let i = 1; i < pitches.length; i++) {
      expect(pitches[i]).toBeLessThanOrEqual(pitches[i - 1] + 1e-12); // never loosens
      expect(pitches[i]).toBeGreaterThanOrEqual(floor - 1e-12);       // never floods
    }
    expect(pitches[1]).toBeLessThan(pitches[0]);        // n = 2 is genuinely tighter
  });

  test('two overlapping casters emit a distinct, denser overlap region', () => {
    const paths = F.runScene(V, 'overlap');
    const byDepth = densityByDepth(paths);
    expect(byDepth[2]).toBeDefined();                   // the overlap exists as its own region
    expect(byDepth[1]).toBeDefined();                   // ...and the single-shadow area survives
    expect(byDepth[2].density / byDepth[1].density).toBeGreaterThan(1.25);
  });

  test('a single caster is byte-identical to the pre-change renderer', () => {
    const paths = F.runScene(V, 'single');
    expect(paths.length).toBe(BASELINE.single.paths);
    expect(digest(paths)).toBe(BASELINE.single.sha256);
  });

  test('two casters whose shadows do NOT overlap are byte-identical too', () => {
    const paths = F.runScene(V, 'apart');
    expect(paths.length).toBe(BASELINE.apart.paths);
    expect(digest(paths)).toBe(BASELINE.apart.sha256);
  });
});
