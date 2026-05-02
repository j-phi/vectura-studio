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

  // Helper: compute angle of a point relative to canvas center
  const pointAngle = (pt) => {
    const cx = 320 / 2;
    const cy = 220 / 2;
    return Math.atan2(pt.y - cy, pt.x - cx);
  };

  const pointRadius = (pt) => {
    const cx = 320 / 2;
    const cy = 220 / 2;
    return Math.hypot(pt.x - cx, pt.y - cy);
  };

  const wrapAngle = (a) => a - TAU * Math.round(a / TAU);

  // Interpolate an arm's angle at a given radius using the arm's point array
  const interpolateArmAngle = (arm, r) => {
    const cx = 320 / 2;
    const cy = 220 / 2;
    const armAngles = arm.map(pt => Math.atan2(pt.y - cy, pt.x - cx));
    const armRadii  = arm.map(pt => Math.hypot(pt.x - cx, pt.y - cy));
    // arm[0] = outermost, arm[CRACK_POINTS] = innermost; r decreases as index increases
    for (let i = 0; i < arm.length - 1; i++) {
      const r0 = armRadii[i];
      const r1 = armRadii[i + 1];
      if (r >= Math.min(r0, r1) && r <= Math.max(r0, r1)) {
        const t = Math.abs(r1 - r0) < 0.001 ? 0 : (r - r0) / (r1 - r0);
        return armAngles[i] + (armAngles[i + 1] - armAngles[i]) * t;
      }
    }
    // Clamp to nearest
    return armAngles[arm.length - 1];
  };

  test('crackNoise=0 — ring break boundaries align with crack arm angles', () => {
    const p = makeBaseParams({
      crackCount: 1,
      crackSpread: 8,
      crackDepth: 0.6,
      crackNoise: 0,
      crackSeed: 42,
    });
    const paths = generate(p);

    // Last 2 paths are crack arms (left=side-1, right=side+1)
    const leftArm  = paths[paths.length - 2];
    const rightArm = paths[paths.length - 1];

    // For each ring path, check break boundaries
    const outerR = 90; // effectiveMaxR = outerDiameter/2
    const innerR = outerR * (1 - p.crackDepth);
    const US = Math.max(360, Math.floor(outerR * 2));
    const sampleStep = TAU / US;

    let misalignments = 0;
    const ringPaths = paths.slice(0, paths.length - 2);
    for (const path of ringPaths) {
      if (path.length < 2) continue;
      const r = pointRadius(path[0]);
      if (r < innerR) continue;

      // Check last point of path (should align with left arm = side=-1)
      const endPt   = path[path.length - 1];
      const endAngle = pointAngle(endPt);
      const leftArmAngle = interpolateArmAngle(leftArm, r);
      const diffEnd = Math.abs(wrapAngle(endAngle - leftArmAngle));
      if (diffEnd > sampleStep * 2) misalignments++;

      // Check first point of path (should align with right arm = side=+1)
      const startPt    = path[0];
      const startAngle = pointAngle(startPt);
      const rightArmAngle = interpolateArmAngle(rightArm, r);
      const diffStart = Math.abs(wrapAngle(startAngle - rightArmAngle));
      if (diffStart > sampleStep * 2) misalignments++;
    }

    expect(misalignments).toBe(0);
  });

  // RGR Red test: with high crackNoise, ring break boundaries MUST align with crack arm angles.
  // This test fails with the pre-fix code (wobble ignored in ring suppression) and passes after.
  test('crackNoise=1.0 — ring break boundaries align with actual crack arm positions', () => {
    const p = makeBaseParams({
      crackCount: 1,
      crackSpread: 16,
      crackDepth: 0.6,
      crackNoise: 1.0,
      crackSeed: 42,
    });
    const paths = generate(p);

    const leftArm  = paths[paths.length - 2];
    const rightArm = paths[paths.length - 1];

    const outerR = 90;
    const innerR = outerR * (1 - p.crackDepth);
    const US = Math.max(360, Math.floor(outerR * 2));
    const sampleStep = TAU / US;

    let misalignments = 0;
    const ringPaths = paths.slice(0, paths.length - 2);
    for (const path of ringPaths) {
      if (path.length < 2) continue;
      const r = pointRadius(path[0]);
      if (r < innerR) continue;

      const endPt    = path[path.length - 1];
      const endAngle = pointAngle(endPt);
      const leftArmAngle = interpolateArmAngle(leftArm, r);
      const diffEnd = Math.abs(wrapAngle(endAngle - leftArmAngle));
      if (diffEnd > sampleStep * 2) misalignments++;

      const startPt    = path[0];
      const startAngle = pointAngle(startPt);
      const rightArmAngle = interpolateArmAngle(rightArm, r);
      const diffStart = Math.abs(wrapAngle(startAngle - rightArmAngle));
      if (diffStart > sampleStep * 2) misalignments++;
    }

    expect(misalignments).toBe(0);
  });

  test('multiple cracks all align with their respective arm paths', () => {
    const p = makeBaseParams({
      crackCount: 3,
      crackSpread: 10,
      crackDepth: 0.5,
      crackNoise: 0.8,
      crackSeed: 7,
    });
    const paths = generate(p);

    // Last 6 paths = 3 cracks × 2 arms each
    const outerR = 90;
    const innerR = outerR * (1 - p.crackDepth);
    const US = Math.max(360, Math.floor(outerR * 2));
    const sampleStep = TAU / US;

    const ringPaths = paths.slice(0, paths.length - p.crackCount * 2);

    // For each ring, find any path breaks and verify they're near SOME crack arm
    let misalignments = 0;
    for (const path of ringPaths) {
      if (path.length < 2) continue;
      const r = pointRadius(path[0]);
      if (r < innerR) continue;

      // Build array of all arm angles at this radius across all cracks
      const allArmAngles = [];
      for (let ci = 0; ci < p.crackCount; ci++) {
        const left  = paths[paths.length - p.crackCount * 2 + ci * 2];
        const right = paths[paths.length - p.crackCount * 2 + ci * 2 + 1];
        allArmAngles.push(interpolateArmAngle(left,  r));
        allArmAngles.push(interpolateArmAngle(right, r));
      }

      const checkAlignment = (ptAngle) => {
        const closest = Math.min(...allArmAngles.map(a => Math.abs(wrapAngle(ptAngle - a))));
        return closest <= sampleStep * 2;
      };

      if (!checkAlignment(pointAngle(path[path.length - 1]))) misalignments++;
      if (!checkAlignment(pointAngle(path[0]))) misalignments++;
    }

    expect(misalignments).toBe(0);
  });

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
