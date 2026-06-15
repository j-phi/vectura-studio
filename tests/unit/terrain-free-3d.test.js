/**
 * Terrain "Free 3D" perspective mode.
 *
 * The terrain algorithm historically projected through its own fixed
 * vanishing-point projector (orthographic / one-point / two-point / isometric)
 * with NO camera orbit. The free-3d mode routes the same heightfield through the
 * shared Geometry3D engine, giving it yaw/pitch/roll orbit + ortho/perspective +
 * the cross-cutting shading powers (depth cue, silhouette, creases, hatching),
 * while preserving every terrain feature (rivers, oceans, coastline, occlusion).
 *
 * These tests need the FULL runtime (loadVecturaRuntime) because free-3d depends
 * on window.Vectura.Geometry3D, which the isolated VM loader in terrain.test.js
 * does not provide.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Terrain — Free 3D (yaw / pitch / roll via Geometry3D)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => runtime.cleanup());

  const BOUNDS = { width: 400, height: 300 };
  const DEPTH_SLICES = 24;

  const generate = (overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry.terrain.generate(
      {
        seed: 7,
        perspectiveMode: 'free-3d',
        depthSlices: DEPTH_SLICES,
        xResolution: 60,
        occlusion: true,
        mountainAmplitude: 50,
        mountainFrequency: 0.01,
        mountainOctaves: 4,
        peakSharpness: 1.6,
        valleyCount: 0,
        riversEnabled: false,
        oceansEnabled: false,
        yaw: -25,
        pitch: 58,
        roll: 0,
        projection: 'orthographic',
        hiddenLineMode: 'remove',
        depthCue: 'off',
        emphasizeOutline: false,
        showCreases: false,
        hatchEnable: false,
        noises: [],
        ...overrides,
      },
      // NB: seed 0 is falsy in SeededRNG (→ Math.random fallback, non-deterministic),
      // so the noise must be seeded with a non-zero value for stable comparisons.
      new SeededRNG(7),
      new SimpleNoise(7),
      BOUNDS,
    );
  };

  const sig = (paths) =>
    (paths || [])
      .filter(Array.isArray)
      .map((p) => p.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join('|'))
      .join(';');

  const ofKind = (paths, kind) => paths.filter((p) => p?.meta?.kind === kind);

  it('returns a non-empty array of finite {x,y} paths', () => {
    const out = generate();
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    out.forEach((path) => {
      expect(Array.isArray(path)).toBe(true);
      path.forEach((pt) => {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });
  });

  it('changing yaw changes the projected geometry', () => {
    expect(sig(generate({ yaw: -25 }))).not.toBe(sig(generate({ yaw: 40 })));
  });

  it('changing pitch changes the projected geometry', () => {
    expect(sig(generate({ pitch: 58 }))).not.toBe(sig(generate({ pitch: 20 })));
  });

  it('changing roll changes the projected geometry', () => {
    expect(sig(generate({ roll: 0 }))).not.toBe(sig(generate({ roll: 35 })));
  });

  it('an omitted roll matches roll:0 (backward-compatible default)', () => {
    expect(sig(generate({ roll: undefined }))).toBe(sig(generate({ roll: 0 })));
  });

  it('is deterministic for a fixed orientation', () => {
    expect(sig(generate({ yaw: 12, pitch: -40, roll: 20 })))
      .toBe(sig(generate({ yaw: 12, pitch: -40, roll: 20 })));
  });

  it('perspective projection differs from orthographic', () => {
    expect(sig(generate({ projection: 'orthographic' })))
      .not.toBe(sig(generate({ projection: 'perspective', cameraDistance: 500, focalLength: 400 })));
  });

  it('never emits a horizon line (meaningless under free rotation)', () => {
    expect(ofKind(generate(), 'horizon').length).toBe(0);
  });

  it('rivers ride the surface and are tagged in free-3d', () => {
    const withRivers = generate({ riversEnabled: true, riverCount: 3, mountainAmplitude: 60 });
    expect(ofKind(withRivers, 'river').length).toBeGreaterThan(0);
    expect(ofKind(generate({ riversEnabled: false }), 'river').length).toBe(0);
  });

  it('oceans + coastline emit coastline-tagged paths in free-3d', () => {
    const out = generate({ oceansEnabled: true, drawCoastline: true, waterLevel: 35, mountainAmplitude: 70 });
    expect(ofKind(out, 'coastline').length).toBeGreaterThan(0);
  });

  it('occlusion off emits exactly one scanline path per depth slice', () => {
    const out = generate({ occlusion: false });
    expect(ofKind(out, 'scanline').length).toBe(DEPTH_SLICES);
  });

  it('hidden-line removal changes the output vs see-through', () => {
    expect(sig(generate({ occlusion: true }))).not.toBe(sig(generate({ occlusion: false })));
  });

  // Regression: the painter occluder is the WHOLE surface sheet (front- AND
  // back-facing cells), so a near ridge genuinely hides the terrain behind it.
  // Culling back faces (the previous behaviour) left most hidden lines leaking
  // through; this asserts that a side-on, tall-terrain view removes a substantial
  // share of the scanline length. Measured fit-invariantly (each generation is
  // framed to canvas, so we normalise by its own bounding-box diagonal).
  const SIDE_ON = {
    depthSlices: 26, xResolution: 140, mountainAmplitude: 120, mountainFrequency: 0.005,
    mountainOctaves: 3, peakSharpness: 1.3, yaw: -16, pitch: 30,
  };
  const diag = (paths) => {
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    paths.filter(Array.isArray).forEach((p) => p.forEach((pt) => {
      if (pt.x < mnX) mnX = pt.x; if (pt.y < mnY) mnY = pt.y;
      if (pt.x > mxX) mxX = pt.x; if (pt.y > mxY) mxY = pt.y;
    }));
    return Math.hypot(mxX - mnX, mxY - mnY) || 1;
  };
  const scanLen = (paths) => ofKind(paths, 'scanline').reduce((s, p) => {
    let t = 0; for (let i = 1; i < p.length; i++) t += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return s + t;
  }, 0);

  it('occlusion hides a substantial share of a side-on tall-terrain view', () => {
    const on = generate({ ...SIDE_ON, occlusion: true });
    const off = generate({ ...SIDE_ON, occlusion: false });
    const normOn = scanLen(on) / diag(on);
    const normOff = scanLen(off) / diag(off);
    const hiddenFrac = 1 - normOn / normOff;
    // Back-face-culling occluders hid only ~14%; the full-sheet occluder hides ~35%.
    expect(hiddenFrac).toBeGreaterThan(0.25);
    // Sanity ceiling: it must not over-occlude the whole surface to nothing.
    expect(hiddenFrac).toBeLessThan(0.7);
  });

  it('hidden-line removal still occludes (no stipple collapse) at high resolution', () => {
    // The stipple bug dissolved dense rows into a shower of spuriously-VISIBLE
    // micro-fragments at high Depth Slices / X Resolution, which would push the
    // hidden fraction down toward a transparent tangle. The interpolated horizon
    // read keeps occlusion solid: at 220×520 the surface must still read as hidden
    // by a substantial, non-degenerate share (and never over-occlude to nothing).
    const cfg = { ...SIDE_ON, depthSlices: 220, xResolution: 520 };
    const on = generate({ ...cfg, occlusion: true });
    const off = generate({ ...cfg, occlusion: false });
    const hiddenFrac = 1 - (scanLen(on) / diag(on)) / (scanLen(off) / diag(off));
    expect(hiddenFrac).toBeGreaterThan(0.25);
    expect(hiddenFrac).toBeLessThan(0.75);
  });

  it('Lambert hatching adds hatch-tagged paths (off by default)', () => {
    expect(ofKind(generate(), 'hatch').length).toBe(0);
    expect(ofKind(generate({ hatchEnable: true }), 'hatch').length).toBeGreaterThan(0);
  });

  it('depth cue stamps a stroke dash on visible paths', () => {
    const plain = generate({ depthCue: 'off' });
    const cued = generate({ depthCue: 'dash', depthCueStrength: 80 });
    expect(plain.some((p) => Array.isArray(p?.meta?.strokeDash))).toBe(false);
    expect(cued.some((p) => Array.isArray(p?.meta?.strokeDash))).toBe(true);
  });

  it('emphasizeOutline adds silhouette paths; showCreases adds crease paths', () => {
    expect(generate({ emphasizeOutline: true }).some((p) => p?.meta?.outline)).toBe(true);
    expect(generate({ showCreases: true, creaseAngle: 18, mountainAmplitude: 80 }).some((p) => p?.meta?.crease)).toBe(true);
  });

  // topWidth fans the rectangular footprint into a trapezoid by widening the far
  // (top) edge. Viewed straight down (pitch 90, yaw/roll 0) the screen-Y of a
  // scanline depends only on its depth row and the screen-X span depends only on
  // the fan, so the far row's width / near row's width equals topWidth exactly
  // (the uniform fit-to-canvas transform preserves the ratio).
  const spanRatioTopOverBottom = (paths) => {
    const rows = ofKind(paths, 'scanline')
      .map((p) => {
        let minX = Infinity, maxX = -Infinity, sumY = 0;
        p.forEach((pt) => { if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x; sumY += pt.y; });
        return { span: maxX - minX, meanY: sumY / p.length };
      })
      .sort((a, b) => a.meanY - b.meanY); // top (far) first, bottom (near) last
    return rows[0].span / rows[rows.length - 1].span;
  };

  it('topWidth widens the far (top) edge into a trapezoid; 1 leaves it square', () => {
    const topDown = { yaw: 0, pitch: 90, roll: 0, occlusion: false };
    expect(spanRatioTopOverBottom(generate({ ...topDown, topWidth: 1 }))).toBeCloseTo(1, 1);
    expect(spanRatioTopOverBottom(generate({ ...topDown, topWidth: 4 }))).toBeCloseTo(4, 1);
  });

  it('topWidth is clamped to [1, 10]', () => {
    const topDown = { yaw: 0, pitch: 90, roll: 0, occlusion: false };
    expect(spanRatioTopOverBottom(generate({ ...topDown, topWidth: 25 }))).toBeCloseTo(10, 1);
    expect(spanRatioTopOverBottom(generate({ ...topDown, topWidth: 0.2 }))).toBeCloseTo(1, 1);
  });

  // --- Mountain FBM: octaves / lacunarity / gain were dead no-ops (sampleMountain
  // called the single-octave rack.evaluate instead of the FBM rack.sampleScalar). ---
  describe('mountain FBM (octaves/lacunarity/gain)', () => {
    it('octaves change the heightfield', () => {
      expect(sig(generate({ mountainOctaves: 1 }))).not.toBe(sig(generate({ mountainOctaves: 8 })));
    });
    it('lacunarity changes the heightfield', () => {
      expect(sig(generate({ mountainOctaves: 5, mountainLacunarity: 1.5 })))
        .not.toBe(sig(generate({ mountainOctaves: 5, mountainLacunarity: 3.0 })));
    });
    it('gain changes the heightfield', () => {
      expect(sig(generate({ mountainOctaves: 5, mountainGain: 0.3 })))
        .not.toBe(sig(generate({ mountainOctaves: 5, mountainGain: 0.7 })));
    });
    it('mountainFrequency still drives the base octave (no double-apply regression)', () => {
      expect(sig(generate({ mountainOctaves: 1, mountainFrequency: 0.004 })))
        .not.toBe(sig(generate({ mountainOctaves: 1, mountainFrequency: 0.02 })));
    });
  });

  // --- Rivers: DEM-hydrology rework (priority-flood → D8 → accumulation → network)
  // replacing the greedy steepest-descent tracer; relief-relative depth + bounded carve. ---
  describe('rivers (hydrology)', () => {
    const RIVERS = { riversEnabled: true, riverCount: 3, riverWidth: 3, riverMeander: 50, mountainAmplitude: 60 };

    it('emits river paths when enabled, none when disabled', () => {
      expect(ofKind(generate({ ...RIVERS, riverDepth: 8 }), 'river').length).toBeGreaterThan(0);
      expect(ofKind(generate({ riversEnabled: false }), 'river').length).toBe(0);
    });

    it('is deterministic (pure function of the seeded heightfield)', () => {
      expect(sig(generate({ ...RIVERS, riverDepth: 8 }))).toBe(sig(generate({ ...RIVERS, riverDepth: 8 })));
    });

    it('produces a dendritic network — more channel polylines than the trunk count', () => {
      // Tributaries joining trunks yield several polylines even at low riverCount
      // (the old tracer emitted exactly riverCount independent squiggles).
      expect(ofKind(generate({ ...RIVERS, riverCount: 2, riverDepth: 10 }), 'river').length).toBeGreaterThan(2);
    });

    it('does NOT drip below the surface at low or extreme depth (the bounded carve)', () => {
      // Reproduces the reported "drip" artifact: at low riverDepth the old unbounded
      // per-step carve gouged cells to -∞, projecting thin vertical lines far below.
      for (const riverDepth of [1, 30]) {
        const out = generate({ ...RIVERS, riverDepth, oceansEnabled: false });
        const rivers = ofKind(out, 'river');
        const scan = ofKind(out, 'scanline');
        const scanMaxY = Math.max(...scan.flat().map((p) => p.y));
        const riverMaxY = Math.max(...rivers.flat().map((p) => p.y));
        // No river vertex falls meaningfully below the lowest surface scanline.
        expect(riverMaxY).toBeLessThanOrEqual(scanMaxY + 2);
      }
    });
  });
});
