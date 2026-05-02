const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const TAU = Math.PI * 2;

const makeDefaultBounds = () => ({
  width: 320,
  height: 220,
  m: 20,
  dW: 280,
  dH: 180,
  truncate: true,
});

const makeBaseParams = (overrides = {}) => ({
  seed: 1,
  rings: 8,
  barkRings: 0,
  gap: 1,
  outerDiameter: 180,
  offsetX: 0,
  offsetY: 0,
  centerDiameter: 0,
  centerDrift: 0,
  biasStrength: 0,
  rayCount: 0,
  knotCount: 0,
  breakCount: 0,
  vMarkCount: 0,
  scarCount: 0,
  thickRingCount: 0,
  noises: [{ id: 'n1', enabled: true, type: 'simplex', blend: 'add', amplitude: 0, zoom: 0.02,
    freq: 1, angle: 0, shiftX: 0, shiftY: 0, applyMode: 'concentric', ringDrift: 0.5,
    ringRadius: 100, tileMode: 'off', noiseStyle: 'linear', imageWidth: 1, imageHeight: 1 }],
  ...overrides,
});

// Params with crackOutline=true so arm paths appear in the output for geometric checks.
const makeCrackParams = (overrides = {}) => makeBaseParams({
  crackOutline: true,
  ...overrides,
});

describe('Rings crack alignment', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const generate = (params) => {
    const { Algorithms, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return Algorithms.rings.generate(params, new SeededRNG(params.seed), new SimpleNoise(params.seed), makeDefaultBounds());
  };

  const cx = 320 / 2;
  const cy = 220 / 2;

  const pointAngle  = (pt) => Math.atan2(pt.y - cy, pt.x - cx);
  const pointRadius = (pt) => Math.hypot(pt.x - cx, pt.y - cy);
  const wrapAngle   = (a)  => a - TAU * Math.round(a / TAU);

  // Interpolate arm angle at a given ring radius.
  // With crackOutline=true the combined outline is 1 path (left + reversed right).
  // Split back into arms: first half = left arm (outer→inner), second half = right arm (inner→outer,
  // so reverse to get outer→inner for consistent radius ordering).
  const splitCombinedArm = (combinedPath) => {
    const half = (combinedPath.length) / 2;
    const left  = combinedPath.slice(0, half);
    const right = combinedPath.slice(half).reverse();
    return { left, right };
  };

  const interpolateArmAngle = (arm, r) => {
    const angles = arm.map(pt => Math.atan2(pt.y - cy, pt.x - cx));
    const radii  = arm.map(pt => Math.hypot(pt.x - cx, pt.y - cy));
    for (let i = 0; i < arm.length - 1; i++) {
      const r0 = radii[i], r1 = radii[i + 1];
      if (r >= Math.min(r0, r1) && r <= Math.max(r0, r1)) {
        const t = Math.abs(r1 - r0) < 0.001 ? 0 : (r - r0) / (r1 - r0);
        return angles[i] + (angles[i + 1] - angles[i]) * t;
      }
    }
    return angles[arm.length - 1];
  };

  // Core invariant: no ring point should lie between the crack arms at that radius.
  // crackCount combined outline paths are the last crackCount entries in paths[].
  const checkNoRingPointInsideCrack = (paths, crackCount, crackDepth) => {
    const outerR = 90;
    const innerR = outerR * (1 - crackDepth);
    const ringPaths = paths.slice(0, paths.length - crackCount);
    const armOffset = paths.length - crackCount;

    let violations = 0;
    for (const path of ringPaths) {
      for (const pt of path) {
        const r = pointRadius(pt);
        if (r < innerR) continue;
        const theta = pointAngle(pt);

        for (let ci = 0; ci < crackCount; ci++) {
          const { left, right } = splitCombinedArm(paths[armOffset + ci]);
          const leftAngle  = interpolateArmAngle(left,  r);
          const rightAngle = interpolateArmAngle(right, r);

          const span = wrapAngle(rightAngle - leftAngle);
          if (span <= 0) continue;
          const dt = wrapAngle(theta - leftAngle);
          if (dt > 0 && dt < span) violations++;
        }
      }
    }
    return violations;
  };

  // ── crackOutline=false: no arm paths in output ────────────────────────────

  test('crackOutline=false (default) — crack arms NOT in output path array', () => {
    const p = makeBaseParams({
      crackCount: 1,
      crackSpread: 8,
      crackDepth: 0.6,
      crackNoise: 0,
      crackSeed: 42,
    });
    const withoutOutline = generate(p);
    const withOutline    = generate({ ...p, crackOutline: true });
    // crackOutline=false produces one fewer path (no combined arm path)
    expect(withoutOutline.length).toBe(withOutline.length - 1);
  });

  // ── Alignment invariant (crackOutline=true provides arm paths for comparison) ──

  test('crackNoise=0 — no ring points inside crack arms', () => {
    const p = makeCrackParams({
      crackCount: 1,
      crackSpread: 8,
      crackDepth: 0.6,
      crackNoise: 0,
      crackSeed: 42,
    });
    const paths = generate(p);
    expect(checkNoRingPointInsideCrack(paths, p.crackCount, p.crackDepth)).toBe(0);
  });

  // RGR Red test: with high crackNoise, ring points must not appear inside the actual crack
  // arm boundaries. Pre-fix code suppressed using the wobble-free zone, leaving ring points
  // visible between the geometric zone edge and the displaced arm.
  test('crackNoise=1.0 — no ring points inside actual crack arm boundaries', () => {
    const p = makeCrackParams({
      crackCount: 1,
      crackSpread: 16,
      crackDepth: 0.6,
      crackNoise: 1.0,
      crackSeed: 42,
    });
    const paths = generate(p);
    expect(checkNoRingPointInsideCrack(paths, p.crackCount, p.crackDepth)).toBe(0);
  });

  test('multiple cracks — no ring points inside any crack arm boundary', () => {
    const p = makeCrackParams({
      crackCount: 3,
      crackSpread: 10,
      crackDepth: 0.5,
      crackNoise: 0.8,
      crackSeed: 7,
    });
    const paths = generate(p);
    expect(checkNoRingPointInsideCrack(paths, p.crackCount, p.crackDepth)).toBe(0);
  });

  // ── Bark-ring snap: arm outer point must match actual outermost ring radius ──

  test('crack arm outer point snaps to outermost ring actual radius (no-noise baseline)', () => {
    // With amplitude=0 and no bark texture, rawR == ringRadii (nominal), so outer point
    // should equal effectiveMaxR exactly.
    const p = makeCrackParams({
      crackCount: 1,
      crackSpread: 8,
      crackDepth: 0.6,
      crackNoise: 0,
      crackSeed: 42,
    });
    const paths = generate(p);
    const { left, right } = splitCombinedArm(paths[paths.length - 1]);
    const outerR = 90;
    expect(pointRadius(left[0])).toBeCloseTo(outerR, 1);
    expect(pointRadius(right[0])).toBeCloseTo(outerR, 1);
  });

  test('crack arm outer point snaps to outermost bark ring radius with noise applied', () => {
    // With significant noise amplitude, rawR differs from effectiveMaxR.
    // The arm outer point should be at rawR (not effectiveMaxR).
    const p = makeCrackParams({
      crackCount: 1,
      crackSpread: 8,
      crackDepth: 0.6,
      crackNoise: 0,
      crackSeed: 42,
      barkRings: 2,
      barkGap: 1,
      barkType: 'rough',
      barkRoughness: 6,
      noises: [{ id: 'n1', enabled: true, type: 'simplex', blend: 'add', amplitude: 8, zoom: 0.02,
        freq: 1, angle: 0, shiftX: 0, shiftY: 0, applyMode: 'concentric', ringDrift: 0.5,
        ringRadius: 100, tileMode: 'off', noiseStyle: 'linear', imageWidth: 1, imageHeight: 1 }],
    });
    const paths = generate(p);
    const outerR = 90;
    const { left, right } = splitCombinedArm(paths[paths.length - 1]);

    // With noise the arm outer radii should differ from effectiveMaxR
    const leftOuterR  = pointRadius(left[0]);
    const rightOuterR = pointRadius(right[0]);
    // At least one arm should be displaced from effectiveMaxR (noise is non-zero)
    const displaced = Math.abs(leftOuterR - outerR) > 0.1 || Math.abs(rightOuterR - outerR) > 0.1;
    expect(displaced).toBe(true);
  });

  // ── Bug A: frac mismatch when armOuterR < effectiveMaxR (noise pushes arm inward) ──

  // RGR Red: when noise amplitude pulls armOuterR below effectiveMaxR, isInCrack uses
  // effectiveMaxR for frac → looks at a deeper arm-segment (narrower angles) → ring points
  // near the arm boundary escape suppression and appear inside the drawn crack zone.
  // seed=3, crackSeed=1 produces armOuterR ≈ 88 on one side → 34 violations without fix.
  test('noise amplitude makes armOuterR < effectiveMaxR — no ring points inside crack arms', () => {
    const p = makeCrackParams({
      seed: 3,
      crackCount: 1,
      crackSpread: 20,
      crackDepth: 0.6,
      crackNoise: 0,
      crackSeed: 1,
      rings: 12,
      barkRings: 2,
      barkGap: 1,
      barkType: 'rough',
      barkRoughness: 8,
      noises: [{ id: 'n1', enabled: true, type: 'simplex', blend: 'add', amplitude: 15, zoom: 0.02,
        freq: 1, angle: 0, shiftX: 0, shiftY: 0, applyMode: 'concentric', ringDrift: 0.5,
        ringRadius: 100, tileMode: 'off', noiseStyle: 'linear', imageWidth: 1, imageHeight: 1 }],
    });
    const paths = generate(p);
    expect(checkNoRingPointInsideCrack(paths, p.crackCount, p.crackDepth)).toBe(0);
  });

  // ── Seam merge regression ──

  // With 8 rings (index 0 skipped, centerDiameter=0) + 1 crack outline = 8 total paths
  // when seam merge fires correctly for each split ring. Guards against regressions where
  // isInCrack(0, r) returns a spurious true and prevents the n+1 merge.
  test('seam merge — path count equals rings-1 + crackCount when crack not at theta=0', () => {
    const p = makeCrackParams({
      crackCount: 1,
      crackSpread: 8,
      crackDepth: 0.6,
      crackNoise: 1.0,
      crackSeed: 42,
    });
    const paths = generate(p);
    const crackArm = paths[paths.length - 1];
    const { left } = splitCombinedArm(crackArm);
    const midPt = left[Math.floor(left.length / 2)];
    const crackAngle = pointAngle(midPt);
    if (Math.abs(wrapAngle(crackAngle)) > 0.5) {
      // ring i=0 skipped (centerDiameter=0) → rings-1 ring paths + crackCount outlines
      const expectedPaths = makeBaseParams().rings - 1 + p.crackCount;
      expect(paths.length).toBe(expectedPaths);
    }
  });

  // ── Determinism ──

  test('determinism — same seed always yields same paths with cracks', () => {
    const p = makeBaseParams({
      crackCount: 2,
      crackSpread: 8,
      crackDepth: 0.5,
      crackNoise: 0.6,
      crackSeed: 99,
    });
    const paths1 = generate(p);
    const paths2 = generate(p);
    expect(paths1.length).toBe(paths2.length);
    for (let i = 0; i < paths1.length; i++) {
      expect(paths1[i].length).toBe(paths2[i].length);
      for (let j = 0; j < paths1[i].length; j++) {
        expect(paths1[i][j].x).toBeCloseTo(paths2[i][j].x, 5);
        expect(paths1[i][j].y).toBeCloseTo(paths2[i][j].y, 5);
      }
    }
  });
});
