const fs = require('fs');
const path = require('path');
const vm = require('vm');

const makeNoiseRackMock = () => ({
  createEvaluator({ noise }) {
    return {
      evaluate(x, y) { return noise.noise2D(x, y); },
    };
  },
  resolveEffectiveZoom(noiseDef, fallbackZoom = 1) {
    const rawZoom = Math.max(0.0001, noiseDef?.zoom ?? fallbackZoom);
    if ((noiseDef?.type || 'simplex') !== 'polygon') return rawZoom;
    const referenceZoom = Math.max(0.0001, noiseDef?.polygonZoomReference ?? fallbackZoom);
    return (referenceZoom * referenceZoom) / rawZoom;
  },
  combineBlend({ combined, value, blend = 'add' }) {
    if (combined === undefined) return value;
    if (blend === 'subtract') return combined - value;
    if (blend === 'multiply') return combined * value;
    if (blend === 'max') return Math.max(combined, value);
    if (blend === 'min') return Math.min(combined, value);
    return combined + value;
  },
});

const loadHorizonAlgorithm = () => {
  const filePath = path.resolve(__dirname, '../../src/core/algorithms/horizon.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    window: { Vectura: { AlgorithmRegistry: {}, NoiseRack: makeNoiseRackMock() } },
    Math,
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window.Vectura.AlgorithmRegistry.horizon;
};

const makeDeterministicNoise = (amplitude = 0.3) => ({
  noise2D(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + 0.137) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  },
});

const flatNoise = () => ({ noise2D: () => 0 });

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

const BASE_PARAMS = {
  seed: 42,
  horizonHeight: 40,
  vanishingPointX: 50,
  horizontalLines: 20,
  convergenceLines: 20,
  linkDensities: false,
  horizontalSpacingMode: 'perspective',
  horizontalSpacingBias: 0,
  convergenceSpacingMode: 'perspective',
  convergenceSpacingBias: 0,
  fanReach: 30,
  terrainDepth: 30,
  skylineRelief: 22,
  terrainHeight: 30,
  floorHeight: 0,
  centerWidth: 28,
  centerSoftness: 50,
  centerCompress: 0,
  centerDepth: 0,
  shoulderLift: 0,
  ridgeSharpness: 0,
  centerNoiseDampening: 0,
  terrainNoiseEnabled: true,
  mountainAmplitude: 35,
  noiseMirror: 0,
  noises: [{ id: 'noise-1', enabled: true, type: 'simplex', blend: 'add', amplitude: 6, zoom: 0.02, freq: 1, angle: 0, shiftX: 0, shiftY: 0, tileMode: 'off', seed: 0 }],
};

const pathSig = (paths) =>
  (paths || []).filter(Array.isArray).map((p) =>
    p.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join('|')
  ).join(';');

describe.skip('Horizon algorithm', () => {
  let horizon;

  beforeAll(() => {
    horizon = loadHorizonAlgorithm();
  });

  test('determinism: same params + seed produce identical output', () => {
    const noise = makeDeterministicNoise();
    const outA = horizon.generate({ ...BASE_PARAMS }, null, noise, BOUNDS);
    const outB = horizon.generate({ ...BASE_PARAMS }, null, noise, BOUNDS);
    expect(pathSig(outA)).toBe(pathSig(outB));
  });

  test('vanishingPointX shifts convergence fan without changing row count', () => {
    const noise = flatNoise();
    const left = horizon.generate({ ...BASE_PARAMS, vanishingPointX: 20 }, null, noise, BOUNDS);
    const center = horizon.generate({ ...BASE_PARAMS, vanishingPointX: 50 }, null, noise, BOUNDS);
    const right = horizon.generate({ ...BASE_PARAMS, vanishingPointX: 80 }, null, noise, BOUNDS);

    // Flat terrain means horizontal rows are identical regardless of VP X
    const rowsLeft = left.filter(Array.isArray);
    const rowsCenter = center.filter(Array.isArray);
    const rowsRight = right.filter(Array.isArray);
    expect(rowsLeft.length).toBeGreaterThan(0);
    expect(rowsCenter.length).toBeGreaterThan(0);
    expect(rowsRight.length).toBeGreaterThan(0);

    // Outputs differ (fan positions changed)
    expect(pathSig(left)).not.toBe(pathSig(right));
  });

  test('horizonHeight moves the horizon line: fewer rows when horizon is lower', () => {
    const noise = flatNoise();
    // Horizon higher on canvas (small %) → more ground → potentially more visible rows
    const highHorizon = horizon.generate(
      { ...BASE_PARAMS, horizonHeight: 20, terrainHeight: 0 }, null, noise, BOUNDS
    );
    // Horizon low on canvas (large %) → less ground → potentially fewer visible rows
    const lowHorizon = horizon.generate(
      { ...BASE_PARAMS, horizonHeight: 75, terrainHeight: 0 }, null, noise, BOUNDS
    );
    // Both produce some output
    expect(highHorizon.filter(Array.isArray).length).toBeGreaterThan(0);
    expect(lowHorizon.filter(Array.isArray).length).toBeGreaterThan(0);
    // Output differs
    expect(pathSig(highHorizon)).not.toBe(pathSig(lowHorizon));
  });

  test('horizontalLines and convergenceLines are independent', () => {
    const noise = flatNoise();
    const moreRows = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 30, convergenceLines: 10, linkDensities: false, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    const moreFan = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 10, convergenceLines: 30, linkDensities: false, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    // Output differs
    expect(pathSig(moreRows)).not.toBe(pathSig(moreFan));
  });

  test('linkDensities ties convergence count to horizontal count', () => {
    const noise = flatNoise();
    const linked = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 15, convergenceLines: 99, linkDensities: true, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    const explicit = horizon.generate(
      { ...BASE_PARAMS, horizontalLines: 15, convergenceLines: 15, linkDensities: false, terrainHeight: 0 },
      null, noise, BOUNDS
    );
    expect(pathSig(linked)).toBe(pathSig(explicit));
  });

  test('even spacing produces uniform row distribution', () => {
    const noise = flatNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, horizontalSpacingMode: 'even', terrainHeight: 0, horizontalLines: 5, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const rows = out.filter(Array.isArray).filter((p) => p.length > 1);
    // With flat noise and even spacing, rows should be equally spaced
    const ys = rows.map((r) => r[0].y).sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    const first = gaps[0];
    gaps.forEach((g) => {
      expect(Math.abs(g - first)).toBeLessThan(0.5);
    });
  });

  test('perspective spacing compresses rows toward horizon', () => {
    const noise = flatNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, horizontalSpacingMode: 'perspective', terrainHeight: 0,
        horizontalLines: 8, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const rows = out.filter(Array.isArray).filter((p) => p.length > 1);
    const ys = rows.map((r) => r[0].y).sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(2);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    // Gaps should increase from horizon to near (perspective compression toward horizon)
    const firstGap = gaps[0];
    const lastGap = gaps[gaps.length - 1];
    expect(lastGap).toBeGreaterThan(firstGap);
  });

  test('occlusion: visible segments stop at terrain boundaries', () => {
    // High terrain height with centered ridge should create occlusion
    const noise = makeDeterministicNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 80, horizontalLines: 30, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const rows = out.filter(Array.isArray);
    expect(rows.length).toBeGreaterThan(0);
    // All output points must have finite coordinates
    rows.forEach((seg) => {
      seg.forEach((pt) => {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });
  });

  test('all output coordinates are finite (terrain may exceed horizon with noise enabled)', () => {
    const noise = makeDeterministicNoise();
    const out = horizon.generate({ ...BASE_PARAMS, terrainHeight: 80 }, null, noise, BOUNDS);
    out.filter(Array.isArray).forEach((seg) => {
      seg.forEach((pt) => {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });
  });

  test('mask polygon exists and covers the ground region', () => {
    const noise = makeDeterministicNoise();
    const out = horizon.generate({ ...BASE_PARAMS }, null, noise, BOUNDS);
    expect(out.maskPolygons).toBeDefined();
    expect(Array.isArray(out.maskPolygons)).toBe(true);
    expect(out.maskPolygons.length).toBeGreaterThan(0);
    const mask = out.maskPolygons[0];
    expect(Array.isArray(mask)).toBe(true);
    expect(mask.length).toBeGreaterThanOrEqual(3);

    // All mask points must have valid coordinates
    mask.forEach((pt) => {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    });

    // Bottom-most mask point must be at or near the canvas bottom
    const inset = BOUNDS.truncate ? BOUNDS.m : 0;
    const groundBottom = inset + (BOUNDS.height - inset * 2);
    const maxY = Math.max(...mask.map((pt) => pt.y));
    expect(maxY).toBeGreaterThanOrEqual(groundBottom - 0.01);
  });

  test('flat terrain (terrainHeight=0, noise=0) produces readable grid', () => {
    const noise = flatNoise();
    const out = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 0, noises: [{ ...BASE_PARAMS.noises[0], amplitude: 0 }] },
      null, noise, BOUNDS
    );
    const segments = out.filter(Array.isArray);
    expect(segments.length).toBeGreaterThan(0);
    // All row points should be exactly at their base Y (no displacement)
    // so all y coordinates in a given row should be equal
    const rowSegs = segments.filter((s) => {
      const ys = s.map((pt) => pt.y);
      const range = Math.max(...ys) - Math.min(...ys);
      return range < 0.01; // flat rows
    });
    expect(rowSegs.length).toBeGreaterThan(0);
  });

  test('terrainNoiseEnabled=false suppresses built-in mountain noise but rack noise still applies', () => {
    const noise = makeDeterministicNoise();
    // Mountain off, rack off → completely flat rows.
    const flat = horizon.generate(
      {
        ...BASE_PARAMS,
        terrainNoiseEnabled: false,
        terrainHeight: 0,
        mountainAmplitude: 80,
        convergenceLines: 0,
        noises: [{ ...BASE_PARAMS.noises[0], amplitude: 0 }],
      },
      null, noise, BOUNDS
    );
    const flatRows = flat.filter(Array.isArray);
    expect(flatRows.length).toBeGreaterThan(0);
    flatRows.forEach((seg) => {
      const ys = seg.map((pt) => pt.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.01);
    });

    // Mountain off, rack on → rows should pick up displacement from rack noise alone.
    const rackOnly = horizon.generate(
      {
        ...BASE_PARAMS,
        terrainNoiseEnabled: false,
        terrainHeight: 0,
        mountainAmplitude: 80,
        convergenceLines: 0,
        noises: [{ ...BASE_PARAMS.noises[0], amplitude: 30 }],
      },
      null, noise, BOUNDS
    );
    const rackRows = rackOnly.filter(Array.isArray);
    const rackRanges = rackRows.map((seg) => {
      const ys = seg.map((pt) => pt.y);
      return Math.max(...ys) - Math.min(...ys);
    });
    expect(Math.max(...rackRanges)).toBeGreaterThan(1);
  });

  test('centerNoiseDampening=100 flattens noise near vanishing point but not at edges', () => {
    const noise = makeDeterministicNoise();
    const damped = horizon.generate(
      {
        ...BASE_PARAMS,
        terrainNoiseEnabled: true,
        terrainHeight: 0,
        mountainAmplitude: 80,
        centerNoiseDampening: 100,
        centerWidth: 40,
        centerSoftness: 0,
        horizontalLines: 4,
        convergenceLines: 0,
        noises: [{ ...BASE_PARAMS.noises[0], amplitude: 0 }],
      },
      null, noise, BOUNDS
    );
    const inset = BOUNDS.truncate ? BOUNDS.m : 0;
    const innerW = BOUNDS.width - inset * 2;
    const vpX = inset + innerW * 0.5;
    const halfW = innerW * 0.5;
    const segments = damped.filter(Array.isArray);
    expect(segments.length).toBeGreaterThan(0);
    // Collect all sample points; find their per-row base Y (the row's flat plane)
    // and check that points near the VP have ~0 displacement while points at edges deviate.
    let centerMaxDev = 0;
    let edgeMaxDev = 0;
    segments.forEach((seg) => {
      // Approximate base Y as the median of the segment's y values (rows are mostly flat).
      const ys = [...seg.map((p) => p.y)].sort((a, b) => a - b);
      const baseY = ys[Math.floor(ys.length / 2)];
      seg.forEach((pt) => {
        const xN = Math.abs(pt.x - vpX) / (halfW + 1e-6);
        const dev = Math.abs(pt.y - baseY);
        if (xN < 0.15) centerMaxDev = Math.max(centerMaxDev, dev);
        if (xN > 0.85) edgeMaxDev = Math.max(edgeMaxDev, dev);
      });
    });
    expect(centerMaxDev).toBeLessThan(0.5);
    expect(edgeMaxDev).toBeGreaterThan(centerMaxDev + 1);
  });

  test('centerCompress=100 tapers the dampened band to a triangle apex at the horizon', () => {
    const noise = makeDeterministicNoise();
    const baseOverrides = {
      ...BASE_PARAMS,
      terrainNoiseEnabled: true,
      terrainHeight: 0,
      mountainAmplitude: 80,
      centerNoiseDampening: 100,
      centerWidth: 40,
      centerSoftness: 0,
      horizontalLines: 8,
      convergenceLines: 0,
      noises: [{ ...BASE_PARAMS.noises[0], amplitude: 0 }],
    };
    const inset = BOUNDS.truncate ? BOUNDS.m : 0;
    const innerW = BOUNDS.width - inset * 2;
    const innerH = BOUNDS.height - inset * 2;
    const vpX = inset + innerW * 0.5;
    const halfW = innerW * 0.5;
    const horizonY = inset + innerH * 0.4;
    const groundBottom = inset + innerH;

    const collectCenterDev = (out) => {
      const segs = out.filter(Array.isArray);
      const samples = { nearHorizon: 0, nearGround: 0 };
      segs.forEach((seg) => {
        const ys = [...seg.map((p) => p.y)].sort((a, b) => a - b);
        const baseY = ys[Math.floor(ys.length / 2)];
        const depth = (baseY - horizonY) / Math.max(1, groundBottom - horizonY);
        seg.forEach((pt) => {
          const xN = Math.abs(pt.x - vpX) / (halfW + 1e-6);
          if (xN > 0.1) return;
          const dev = Math.abs(pt.y - baseY);
          if (depth < 0.3) samples.nearHorizon = Math.max(samples.nearHorizon, dev);
          if (depth > 0.7) samples.nearGround = Math.max(samples.nearGround, dev);
        });
      });
      return samples;
    };

    const noCompress = collectCenterDev(
      horizon.generate({ ...baseOverrides, centerCompress: 0 }, null, noise, BOUNDS)
    );
    const fullCompress = collectCenterDev(
      horizon.generate({ ...baseOverrides, centerCompress: 100 }, null, noise, BOUNDS)
    );

    // No-compress: dampening pins the center flat at every depth.
    expect(noCompress.nearHorizon).toBeLessThan(0.5);
    expect(noCompress.nearGround).toBeLessThan(0.5);

    // Full-compress: ground stays dampened, but the horizon row's center is released.
    expect(fullCompress.nearGround).toBeLessThan(0.5);
    expect(fullCompress.nearHorizon).toBeGreaterThan(noCompress.nearHorizon + 1);
  });

  test('rack noises stack on top of the built-in mountain', () => {
    const noise = makeDeterministicNoise();
    const mountainOnly = horizon.generate(
      {
        ...BASE_PARAMS,
        terrainNoiseEnabled: true,
        centerNoiseDampening: 0,
        noises: [{ ...BASE_PARAMS.noises[0], amplitude: 0 }],
      },
      null, noise, BOUNDS
    );
    const withRack = horizon.generate(
      {
        ...BASE_PARAMS,
        terrainNoiseEnabled: true,
        centerNoiseDampening: 0,
        noises: [{ ...BASE_PARAMS.noises[0], amplitude: 12 }],
      },
      null, noise, BOUNDS
    );
    expect(pathSig(mountainOnly)).not.toBe(pathSig(withRack));
  });

  test('global seed drives mountain noise determinism', () => {
    const noise = makeDeterministicNoise();
    const a = horizon.generate({ ...BASE_PARAMS, terrainNoiseEnabled: true, centerNoiseDampening: 0, seed: 1 }, null, noise, BOUNDS);
    const b = horizon.generate({ ...BASE_PARAMS, terrainNoiseEnabled: true, centerNoiseDampening: 0, seed: 1 }, null, noise, BOUNDS);
    // Determinism within a seed
    expect(pathSig(a)).toBe(pathSig(b));
  });

  // --- Direction conventions for terrain shape parameters --------------------
  // SVG Y grows downward, so visually "down" = larger Y, "up" = smaller Y.

  // Returns the silhouette Y at the center column: the smallest Y the terrain
  // reaches there across all rows. Smaller = higher on canvas.
  const centerSilhouetteY = (out) => {
    const poly = out.maskPolygons?.[0];
    if (!poly) return null;
    // Envelope points come first (one per column), then two ground anchors.
    const envPoints = poly.slice(0, poly.length - 2);
    let bestDx = Infinity;
    let bestY = null;
    envPoints.forEach((pt) => {
      const dx = Math.abs(pt.x - 160);
      if (dx < bestDx) { bestDx = dx; bestY = pt.y; }
    });
    return bestY;
  };

  // Average envelope Y over the center band [vpX±15].
  const centerBandAvgY = (out) => {
    const poly = out.maskPolygons?.[0];
    if (!poly) return null;
    const envPoints = poly.slice(0, poly.length - 2);
    const inBand = envPoints.filter((pt) => Math.abs(pt.x - 160) <= 15);
    return inBand.reduce((s, pt) => s + pt.y, 0) / Math.max(1, inBand.length);
  };

  // Average envelope Y over the shoulder bands (left and right, away from center).
  const shoulderBandAvgY = (out) => {
    const poly = out.maskPolygons?.[0];
    if (!poly) return null;
    const envPoints = poly.slice(0, poly.length - 2);
    const inBand = envPoints.filter((pt) => {
      const d = Math.abs(pt.x - 160);
      return d > 50 && d < 100;
    });
    return inBand.reduce((s, pt) => s + pt.y, 0) / Math.max(1, inBand.length);
  };

  test('positive centerDepth depresses the visible silhouette at center (valley, not ridge)', () => {
    const noise = flatNoise();
    const flat = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 50, centerDepth: 0, skylineRelief: 100, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const valley = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 50, centerDepth: 60, skylineRelief: 100, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    // A valley pushes the row centers DOWN, so the silhouette top at center
    // sits LOWER on the canvas (larger Y) than the flat case.
    expect(centerBandAvgY(valley)).toBeGreaterThan(centerBandAvgY(flat) + 5);
  });

  test('positive shoulderLift raises the visible silhouette at the shoulders', () => {
    const noise = flatNoise();
    const flat = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 50, shoulderLift: 0, skylineRelief: 100, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const lifted = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 50, shoulderLift: 80, skylineRelief: 100, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    // Lifted shoulders raise the silhouette in the shoulder band (smaller Y).
    expect(shoulderBandAvgY(lifted)).toBeLessThan(shoulderBandAvgY(flat) - 5);
  });

  test('floorHeight acts as a bidirectional Y offset', () => {
    const noise = flatNoise();
    const neutral = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 0, floorHeight: 0, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const up = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 0, floorHeight: 50, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const down = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 0, floorHeight: -50, convergenceLines: 0 },
      null, noise, BOUNDS
    );
    const baseY = centerSilhouetteY(neutral);
    // floorHeight > 0 → terrain shifts UP visually (smaller Y).
    expect(centerSilhouetteY(up)).toBeLessThan(baseY - 10);
    // floorHeight < 0 → terrain shifts DOWN visually (larger Y).
    expect(centerSilhouetteY(down)).toBeGreaterThan(baseY + 10);
  });

  test('skylineRelief attenuates terrain near the horizon', () => {
    const noise = flatNoise();
    const sharp = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 50, centerDepth: 60, skylineRelief: 100, convergenceLines: 0, horizontalLines: 60 },
      null, noise, BOUNDS
    );
    const muted = horizon.generate(
      { ...BASE_PARAMS, terrainHeight: 50, centerDepth: 60, skylineRelief: 0, convergenceLines: 0, horizontalLines: 60 },
      null, noise, BOUNDS
    );
    // skylineRelief=0 → terrain expression is ~zero at the horizon, so the
    // silhouette top sits almost exactly on horizonY=110. relief=100 → the
    // valley pushes the silhouette down at the center even at the horizon.
    expect(centerBandAvgY(sharp)).toBeGreaterThan(centerBandAvgY(muted) + 3);
  });

  test('terrainDepth=100 pushes more rows into the foreground than terrainDepth=0', () => {
    const noise = flatNoise();
    // groundBottom = 200, horizonY = 110 (horizonHeight=40 in BASE_PARAMS) → midY = 155.
    // Count how many displaced rows land in the foreground half.
    const foregroundRowCount = (out) => {
      const rows = out.filter(Array.isArray);
      const midY = 155;
      return rows.filter((seg) => {
        const sample = seg[Math.floor(seg.length / 2)];
        return sample && sample.y >= midY;
      }).length;
    };
    const sparse = horizon.generate(
      { ...BASE_PARAMS, terrainDepth: 0, terrainHeight: 0, convergenceLines: 0, horizontalLines: 30 },
      null, noise, BOUNDS
    );
    const dense = horizon.generate(
      { ...BASE_PARAMS, terrainDepth: 100, terrainHeight: 0, convergenceLines: 0, horizontalLines: 30 },
      null, noise, BOUNDS
    );
    expect(foregroundRowCount(dense)).toBeGreaterThan(foregroundRowCount(sparse) + 3);
  });
});
