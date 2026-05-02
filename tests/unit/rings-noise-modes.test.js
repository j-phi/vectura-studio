const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const makeDefaultBounds = () => ({
  width: 320,
  height: 220,
  m: 20,
  dW: 280,
  dH: 180,
  truncate: true,
});

const makeBaseParams = (overrides = {}) => ({
  seed: 4242,
  rings: 8,
  gap: 1,
  outerDiameter: 180, // 2 * (220/2 - 20) = canvas-filling for test bounds
  offsetX: 0,
  offsetY: 0,
  noises: [{ id: 'noise-1', enabled: true, type: 'simplex', blend: 'add', amplitude: 0, zoom: 0.02, freq: 1, angle: 0, shiftX: 0, shiftY: 0, applyMode: 'concentric', ringDrift: 0.5, ringRadius: 100, tileMode: 'off', noiseStyle: 'linear', imageWidth: 1, imageHeight: 1 }],
  ...overrides,
});

describe('Rings noise modes', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const generate = (params, overrides = {}) => {
    const { Algorithms, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const p = { ...params, ...overrides };
    return Algorithms.rings.generate(p, new SeededRNG(p.seed), new SimpleNoise(p.seed), makeDefaultBounds());
  };

  test('concentric mode stays closed and produces path-space variation', () => {
    const { ALGO_DEFAULTS } = runtime.window.Vectura;
    const params = {
      ...clone(ALGO_DEFAULTS.rings),
      seed: 4242,
      rings: 6,
      barkRings: 0,
      gap: 1,
      outerDiameter: 180,
      centerDiameter: 1,
      offsetX: 0,
      offsetY: 0,
      noises: [
        {
          id: 'noise-1',
          enabled: true,
          type: 'simplex',
          blend: 'add',
          amplitude: 12,
          zoom: 0.02,
          freq: 1.5,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          applyMode: 'concentric',
          ringDrift: 0.65,
          ringRadius: 100,
          tileMode: 'off',
          noiseStyle: 'linear',
          imageWidth: 1,
          imageHeight: 1,
        },
      ],
    };

    const paths = generate(params);
    expect(paths.length).toBe(params.rings);

    paths.forEach((path) => {
      expect(path.length).toBeGreaterThan(10);
      expect(path[path.length - 1]).toEqual(path[0]);
    });

    const center = { x: makeDefaultBounds().width / 2, y: makeDefaultBounds().height / 2 };
    const radii = paths[0].slice(0, -1).map((point) => distance(point, center));
    const minRadius = Math.min(...radii);
    const maxRadius = Math.max(...radii);
    expect(maxRadius - minRadius).toBeGreaterThan(2);
  });

  test('centerDiameter=0 omits center ring; >0 adds it at the specified radius', () => {
    const { ALGO_DEFAULTS } = runtime.window.Vectura;
    const baseParams = {
      ...clone(ALGO_DEFAULTS.rings),
      seed: 4242,
      rings: 8,
      barkRings: 0,
      gap: 1,
      outerDiameter: 180,
      offsetX: 0,
      offsetY: 0,
      noises: [{ ...clone(ALGO_DEFAULTS.rings.noises[0]), amplitude: 0 }],
    };

    const center = { x: makeDefaultBounds().width / 2, y: makeDefaultBounds().height / 2 };
    const withoutCenter = generate({ ...baseParams, centerDiameter: 0 });
    const withCenter = generate({ ...baseParams, centerDiameter: 40 });

    expect(withoutCenter.length).toBe(baseParams.rings - 1);
    expect(withCenter.length).toBe(baseParams.rings);

    const innerRadius = distance(withCenter[0][0], center);
    expect(innerRadius).toBeGreaterThan(19.5);
    expect(innerRadius).toBeLessThan(20.5);
  });

  // --- tree-ring feature tests ---

  test('gapCurveStart > gapCurveEnd makes inner rings wider than outer', () => {
    const params = makeBaseParams({ rings: 10, gapCurveStart: 2.0, gapCurveEnd: 0.5, centerDiameter: 1 });
    const paths = generate(params);
    expect(paths.length).toBe(10);

    const center = { x: makeDefaultBounds().width / 2, y: makeDefaultBounds().height / 2 };
    const innerGap = distance(paths[1][0], center) - distance(paths[0][0], center);
    const outerGap = distance(paths[9][0], center) - distance(paths[8][0], center);
    expect(innerGap).toBeGreaterThan(outerGap);
  });

  test('barkRings are additive — total paths = rings + barkRings', () => {
    const bounds = makeDefaultBounds();
    const center = { x: bounds.width / 2, y: bounds.height / 2 };
    const barkRings = 3;

    const withoutBark = generate(makeBaseParams({ rings: 10, centerDiameter: 1 }));
    const withBark = generate(makeBaseParams({ rings: 10, barkRings, barkGap: 2, centerDiameter: 1 }));

    // bark rings are additive: 10 wood + 3 bark = 13 total
    expect(withoutBark.length).toBe(10);
    expect(withBark.length).toBe(10 + barkRings);

    // bark ring gaps should be compressed relative to wood ring gaps
    const outerGapBark = distance(withBark[12][0], center) - distance(withBark[11][0], center);
    const outerGapNormal = distance(withoutBark[9][0], center) - distance(withoutBark[8][0], center);
    expect(outerGapBark).toBeLessThan(outerGapNormal);
  });

  test('breakCount creates radial breaks across all rings', () => {
    // 2 radial break angles → each ring is split into subpaths at those angles
    const params = makeBaseParams({ rings: 4, breakCount: 2, centerDiameter: 1 });
    const paths = generate(params);
    // more paths than rings because each ring yields subpaths at break angles
    expect(paths.length).toBeGreaterThan(4);
    // all subpaths should be open (last point ≠ first)
    paths.forEach((path) => {
      if (path.length > 1) {
        const first = path[0];
        const last = path[path.length - 1];
        const isOpen = first.x !== last.x || first.y !== last.y;
        expect(isOpen).toBe(true);
      }
    });
  });

  test('breakCount 0 produces exactly one closed path per ring', () => {
    const params = makeBaseParams({ rings: 6, breakCount: 0, centerDiameter: 1 });
    const paths = generate(params);
    expect(paths.length).toBe(6);
    paths.forEach((path) => {
      expect(path[0]).toEqual(path[path.length - 1]);
    });
  });

  test('centerDrift shifts ring centers per ring', () => {
    const bounds = makeDefaultBounds();
    const center = { x: bounds.width / 2, y: bounds.height / 2 };

    const noDrift = generate(makeBaseParams({ rings: 6, centerDrift: 0, centerDiameter: 1 }));
    const withDrift = generate(makeBaseParams({ rings: 6, centerDrift: 3, centerDiameter: 1 }));

    expect(noDrift.length).toBe(6);
    expect(withDrift.length).toBe(6);

    // compute per-ring centroid and check drift shifts them
    const centroid = (path) => ({
      x: path.reduce((s, p) => s + p.x, 0) / path.length,
      y: path.reduce((s, p) => s + p.y, 0) / path.length,
    });

    const driftedCentroids = withDrift.map(centroid);
    const straightCentroids = noDrift.map(centroid);

    // at least one ring should have a centroid meaningfully offset from the no-drift version
    const maxDeviation = driftedCentroids.reduce(
      (maxD, dc, i) => Math.max(maxD, distance(dc, straightCentroids[i])),
      0,
    );
    expect(maxDeviation).toBeGreaterThan(0.5);
  });

  test('biasStrength makes one side of each ring wider', () => {
    const bounds = makeDefaultBounds();
    const center = { x: bounds.width / 2, y: bounds.height / 2 };
    const biasAngle = 0; // wider on the right (+x direction)

    const noBias = generate(makeBaseParams({ rings: 4, biasStrength: 0, biasAngle, centerDiameter: 1 }));
    const withBias = generate(makeBaseParams({ rings: 4, biasStrength: 0.4, biasAngle, centerDiameter: 1 }));

    const ringRight = (path) => {
      const rightmost = path.reduce((best, p) => (p.x > best.x ? p : best), path[0]);
      return distance(rightmost, center);
    };
    const ringLeft = (path) => {
      const leftmost = path.reduce((best, p) => (p.x < best.x ? p : best), path[0]);
      return distance(leftmost, center);
    };

    // with bias, right side should be farther than left side
    const ring = withBias[2];
    expect(ringRight(ring)).toBeGreaterThan(ringLeft(ring));

    // without bias they should be roughly symmetric
    const ringNoBias = noBias[2];
    const asymmetryNoBias = Math.abs(ringRight(ringNoBias) - ringLeft(ringNoBias));
    const asymmetryBias = ringRight(ring) - ringLeft(ring);
    expect(asymmetryBias).toBeGreaterThan(asymmetryNoBias + 1);
  });

  test('rayCount generates extra open paths beyond ring count', () => {
    const rings = 4;
    const rayCount = 12;
    const params = makeBaseParams({ rings, rayCount, centerDiameter: 1 });
    const paths = generate(params);
    expect(paths.length).toBe(rings + rayCount);

    // ray paths are 2-point open line segments
    const rays = paths.slice(rings);
    rays.forEach((ray) => {
      expect(ray.length).toBe(2);
    });
  });

  test('knotCount creates a localized warp at the knot angle', () => {
    const bounds = makeDefaultBounds();
    const center = { x: bounds.width / 2, y: bounds.height / 2 };

    // Use a fixed seed and read back the knot angle from rng sequence:
    // knotAngle = rng() * TAU, ringFrac = 0.25 + rng() * 0.5
    const { SeededRNG } = runtime.window.Vectura;
    const rng = new SeededRNG(9999);
    const knotAngle = rng.nextFloat() * Math.PI * 2;

    const noKnot = generate(makeBaseParams({ rings: 8, seed: 9999, knotCount: 0, centerDiameter: 1 }));
    const withKnot = generate(makeBaseParams({ rings: 8, seed: 9999, knotCount: 1, knotIntensity: 1.5, knotSpread: 45, centerDiameter: 1 }));

    expect(withKnot.length).toBe(8);

    // find radius variation near vs far from knot angle across middle rings
    const radiusAtAngle = (path, angle, tolerance) => {
      const pts = path.filter((pt) => {
        const a = Math.atan2(pt.y - center.y, pt.x - center.x);
        const delta = Math.abs(a - angle);
        const wrapped = Math.min(delta, Math.PI * 2 - delta);
        return wrapped < tolerance;
      });
      if (!pts.length) return null;
      return pts.reduce((s, pt) => s + distance(pt, center), 0) / pts.length;
    };

    // some ring near the knot should have more radius variation near knot angle vs opposite
    let knotSideGain = 0;
    for (let i = 2; i < 6; i++) {
      const rNear = radiusAtAngle(withKnot[i], knotAngle, 0.4);
      const rNearBase = radiusAtAngle(noKnot[i], knotAngle, 0.4);
      if (rNear !== null && rNearBase !== null) {
        knotSideGain = Math.max(knotSideGain, rNear - rNearBase);
      }
    }
    expect(knotSideGain).toBeGreaterThan(0.5);
  });

  test('barkType smooth leaves bark rings unchanged from plain geometry', () => {
    const baseParams = makeBaseParams({ barkRings: 4, barkGap: 2, barkType: 'smooth', seed: 1 });
    const pathsSmooth = generate(baseParams);
    const pathsNoType = generate({ ...baseParams, barkType: undefined });
    // smooth is the default — output must be identical
    expect(pathsSmooth.length).toBe(pathsNoType.length);
    for (let i = 0; i < pathsSmooth.length; i++) {
      expect(pathsSmooth[i].length).toBe(pathsNoType[i].length);
    }
  });

  test('barkType rough displaces bark rings differently from smooth', () => {
    const baseParams = makeBaseParams({ barkRings: 4, barkGap: 3, seed: 7 });
    const pathsSmooth = generate(baseParams, { barkType: 'smooth' });
    const pathsRough = generate(baseParams, { barkType: 'rough', barkRoughness: 6, barkFreq: 4 });
    const woodCount = 8;
    // Bark ring radii should differ from smooth
    let differenceFound = false;
    for (let i = woodCount; i < pathsRough.length; i++) {
      const r = pathsRough[i];
      const s = pathsSmooth[i];
      if (!r || !s) break;
      for (let k = 0; k < r.length && k < s.length; k++) {
        if (Math.abs(r[k].x - s[k].x) > 0.01 || Math.abs(r[k].y - s[k].y) > 0.01) {
          differenceFound = true;
          break;
        }
      }
      if (differenceFound) break;
    }
    expect(differenceFound).toBe(true);
  });

  test('barkType furrowed displaces bark rings with groove dips', () => {
    const baseParams = makeBaseParams({ barkRings: 3, barkGap: 3, seed: 42 });
    const pathsSmooth = generate(baseParams, { barkType: 'smooth' });
    const pathsFurrowed = generate(baseParams, {
      barkType: 'furrowed', barkFurrowCount: 8, barkFurrowDepth: 6, barkFurrowWidth: 0.1,
    });
    const woodCount = 8;
    // Furrowed bark should have at least one point significantly inset compared to smooth
    let maxInset = 0;
    for (let i = woodCount; i < pathsFurrowed.length; i++) {
      const rf = pathsFurrowed[i];
      const rs = pathsSmooth[i];
      if (!rf || !rs) break;
      const cx = 160, cy = 110;
      for (let k = 0; k < rf.length && k < rs.length; k++) {
        const rF = Math.hypot(rf[k].x - cx, rf[k].y - cy);
        const rS = Math.hypot(rs[k].x - cx, rs[k].y - cy);
        maxInset = Math.max(maxInset, rS - rF);
      }
    }
    expect(maxInset).toBeGreaterThan(1);
  });

  test('barkType fibrous produces oscillating bark rings', () => {
    const baseParams = makeBaseParams({ barkRings: 3, barkGap: 3, seed: 11 });
    const pathsFibrous = generate(baseParams, {
      barkType: 'fibrous', barkFiberCount: 20, barkFiberAmplitude: 4, barkFiberPhaseShift: 0.5,
    });
    const woodCount = 8;
    const barkPaths = pathsFibrous.slice(woodCount, woodCount + 3);
    const cx = 160, cy = 110;
    for (const ring of barkPaths) {
      if (!ring || ring.length < 4) continue;
      const radii = ring.map((pt) => Math.hypot(pt.x - cx, pt.y - cy));
      const minR = Math.min(...radii);
      const maxR = Math.max(...radii);
      // Fibrous rings should have meaningful radial variance
      expect(maxR - minR).toBeGreaterThan(1);
    }
  });

  test('barkType with small displacement does not propagate into wood rings', () => {
    // With confinement=0.5 (default) and roughness=4, max barkDisp=2px < barkGap=3px,
    // so the inward-push propagation stays within the bark zone and wood rings are unaffected.
    // Larger roughness CAN propagate inward to wood rings — that is the intended behavior.
    const baseParams = makeBaseParams({ rings: 6, barkRings: 3, barkGap: 3, seed: 99 });
    const pathsSmooth = generate(baseParams, { barkType: 'smooth' });
    const pathsRough = generate(baseParams, { barkType: 'rough', barkRoughness: 4, barkFreq: 6 });
    // Ring 0 is skipped (no centerDiameter), so wood rings land at paths[0..woodCount-2].
    const woodPathCount = 6 - 1;
    for (let i = 0; i < woodPathCount; i++) {
      if (!pathsSmooth[i] || !pathsRough[i]) continue;
      for (let k = 0; k < pathsSmooth[i].length && k < pathsRough[i].length; k++) {
        expect(pathsSmooth[i][k].x).toBeCloseTo(pathsRough[i][k].x, 5);
        expect(pathsSmooth[i][k].y).toBeCloseTo(pathsRough[i][k].y, 5);
      }
    }
  });

  test('all new params at neutral produce closed rings without distortion', () => {
    // With distortion params at zero/off, output should be closed rings per wood count.
    const { ALGO_DEFAULTS } = runtime.window.Vectura;
    const params = clone(ALGO_DEFAULTS.rings);
    params.rings = 12;
    params.outerDiameter = 180;
    params.barkRings = 0; // isolate: test neutral wood-only behavior
    params.breakCount = 0;
    params.seed = 55;
    const paths = generate(params);
    expect(paths.length).toBe(11); // ring 0 skipped because centerDiameter defaults to 0
    paths.forEach((path) => {
      expect(path.length).toBeGreaterThan(2);
      expect(path[0]).toEqual(path[path.length - 1]);
    });
  });
});
