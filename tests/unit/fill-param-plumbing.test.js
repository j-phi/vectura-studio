/**
 * Fill-param plumbing tests.
 *
 * REGRESSION COVERAGE for the bug where `paint-bucket-ops.js`'s
 * `generateGeometryForLayer` and `generatePathsForFillRecord` were
 * hand-enumerating ~20 keys onto `fillArg`, dropping the ~30 B-series and
 * unified-fill knobs that `buildFillRecord` writes onto the record.
 *
 * Each test:
 *   1. Builds a `layer.fills[0]` record at baseline params for some fillType.
 *   2. Runs `PaintBucketOps.generateGeometryForLayer(layer)` → captures a
 *      fingerprint (path count + flattened length sum).
 *   3. Mutates ONLY ONE knob on the record to a clearly different value.
 *   4. Re-runs and asserts the output fingerprint changed.
 *
 * If the bucket-ops layer is dropping the knob, the second fingerprint will
 * equal the first and the test fails.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Fill param plumbing through PaintBucketOps.generateGeometryForLayer', () => {
  let runtime;
  let Ops;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Ops = runtime.window.Vectura.PaintBucketOps;
    expect(typeof Ops?.generateGeometryForLayer).toBe('function');
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // Closed 200x200 rectangle polygon. Big enough for B-series tiles/cells to
  // actually fit several primitives, small enough to keep tests fast.
  const rect = (x, y, w, h) => ([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]);
  const REGION = () => rect(0, 0, 200, 200);

  // Full default record matching buildFillRecord shape; tests start from this
  // and override only what they need. fillType is set per describe.
  const baseRec = (fillType, overrides = {}) => ({
    id: `fill-${fillType}-${Math.random().toString(36).slice(2, 8)}`,
    fillType,
    density: 5,
    angle: 0,
    amplitude: 1.0,
    waveSmoothing: 1.0,
    waveFrequency: 1.0,
    dotLength: 0,
    dotRotation: 0,
    dotSize: 0.6,
    padding: 0,
    shiftX: 0,
    shiftY: 0,
    dotPattern: 'brick',
    dotShape: 'circle',
    dotJitter: 0,
    lineCount: 1,
    axes: 3,
    polyTile: 'grid',
    polyPadding: 0,
    polyRotation: 0,
    polyRotationStep: 0,
    polyScaleStep: 0,
    spiralTurns: 8,
    spiralTightness: 0.5,
    spiralDirection: 'cw',
    radialSpokes: 36,
    radialSkip: 0,
    contourDirection: 'inset',
    contourStepVariance: 0,
    contourSimplify: 0.05,
    centralDensity: 1.0,
    outerDiameter: 1.0,
    // B3
    truchetTileSet: 'quarter-arcs',
    truchetTileSize: 6,
    truchetSeed: 1,
    truchetRotations: 4,
    // B4
    mazeCellSize: 5,
    mazeAlgorithm: 'dfs',
    mazeBranchBias: 0.5,
    mazeSeed: 1,
    mazeWallMode: 'walls',
    // B8
    stripeBandWidth: 4,
    stripeGap: 2,
    stripeAngle: 0,
    stripePrimary: 'hatch',
    stripeSecondary: 'none',
    stripeSecondaryDensity: 2,
    // B10
    weavePattern: 'plain',
    weaveStrandWidth: 1.5,
    weaveGap: 0.3,
    weaveAngle: 0,
    weaveOver: 1,
    weaveUnder: 1,
    penId: null,
    region: REGION(),
    innerRegion: null,
    loopId: null,
    isDocBounds: false,
    createdAt: 1,
    ...overrides,
  });

  // Build a synthetic layer with one fill record.
  const layerWith = (rec) => ({
    id: 'L',
    type: 'shape',
    visible: true,
    fills: [rec],
    paths: [],
    displayPaths: [],
  });

  // Fingerprint = "<path count>|<vertex count>|<sum-of-|x|+|y|>|<total-flattened-length>"
  // Combines three orthogonal signals so the test is sensitive to topology
  // changes (path count), sampling-density changes (vertex count), positional
  // shifts (coord sum — changes under rotation/translation/jitter even when
  // length stays the same), and shape changes (total length). All fixed to 3
  // decimals so floating-point noise doesn't flake the comparison.
  const fingerprint = (paths) => {
    let totalLen = 0;
    let coordSum = 0;
    let vertexCount = 0;
    for (const p of paths) {
      if (!Array.isArray(p)) continue;
      vertexCount += p.length;
      for (let i = 0; i < p.length; i += 1) {
        coordSum += Math.abs(p[i].x) + Math.abs(p[i].y);
        if (i > 0) {
          const dx = p[i].x - p[i - 1].x;
          const dy = p[i].y - p[i - 1].y;
          totalLen += Math.sqrt(dx * dx + dy * dy);
        }
      }
    }
    return `${paths.length}|${vertexCount}|${coordSum.toFixed(3)}|${totalLen.toFixed(3)}`;
  };

  // Run the public path and return both the raw paths and the fingerprint.
  const runFill = (rec) => {
    const layer = layerWith(rec);
    const paths = Ops.generateGeometryForLayer(layer) || [];
    return { paths, fp: fingerprint(paths) };
  };

  // Shared assertion: changing `knob` from baseRec[knob] to `newValue`
  // produces a different fingerprint.
  const expectKnobMattersFor = (fillType, knob, newValue, extraBase = {}) => {
    const baseline = baseRec(fillType, extraBase);
    const a = runFill(baseline);
    const mutated = { ...baseline, [knob]: newValue, region: REGION() };
    const b = runFill(mutated);
    if (a.fp === b.fp) {
      throw new Error(
        `Knob '${knob}' on fillType '${fillType}' did not affect output. ` +
        `Both runs produced fingerprint ${a.fp}. ` +
        `Baseline value=${JSON.stringify(baseline[knob])}, new value=${JSON.stringify(newValue)}. ` +
        `Paths(a)=${a.paths.length}, Paths(b)=${b.paths.length}.`
      );
    }
    expect(a.fp).not.toBe(b.fp);
  };

  // ---------------- Wave (C1 unified) ----------------
  describe('wave', () => {
    test('waveSmoothing flips triangle vs sine sampling', () => {
      // amplitude > 0 so the wave actually has shape.
      expectKnobMattersFor('wave', 'waveSmoothing', 0, { amplitude: 2 });
    });
    test('waveFrequency changes wavelength (higher = more cycles)', () => {
      expectKnobMattersFor('wave', 'waveFrequency', 2.0, { amplitude: 2 });
    });
  });

  // ---------------- Dots (C2 unified) ----------------
  describe('dots', () => {
    test('dotShape changes stamp glyph (and therefore path geometry)', () => {
      // dotLength>0 so each stamp expands into a polyline that reflects shape.
      expectKnobMattersFor('dots', 'dotShape', 'square', { density: 3, dotLength: 1, dotSize: 0.8 });
    });
    test('dotJitter perturbs stamp positions', () => {
      expectKnobMattersFor('dots', 'dotJitter', 0.8, { density: 3, dotLength: 1 });
    });
  });

  // ---------------- Hatch (C3 unified) ----------------
  describe('hatch', () => {
    test('lineCount 1 vs 3 (single vs triaxial) changes path count', () => {
      expectKnobMattersFor('hatch', 'lineCount', 3);
    });
  });

  // ---------------- Contour ----------------
  describe('contour', () => {
    test('contourDirection inset vs outset', () => {
      expectKnobMattersFor('contour', 'contourDirection', 'outset', { density: 8 });
    });
    test('contourStepVariance jitters the per-step offset', () => {
      expectKnobMattersFor('contour', 'contourStepVariance', 0.6, { density: 8 });
    });
    test('contourSimplify drops polyline detail', () => {
      // A 4-vertex axis-aligned rectangle has nothing to simplify (every inset
      // ring is also a 4-vertex rect). Use a 32-gon approximating a circle so
      // Douglas-Peucker actually has detail to remove.
      const N = 32;
      const ngon = [];
      for (let i = 0; i < N; i += 1) {
        const a = (i / N) * Math.PI * 2;
        ngon.push({ x: 100 + Math.cos(a) * 90, y: 100 + Math.sin(a) * 90 });
      }
      ngon.push(ngon[0]); // close
      const baseline = baseRec('contour', { density: 8, region: ngon });
      const a = runFill(baseline);
      const mutated = { ...baseline, contourSimplify: 5.0, region: ngon };
      const b = runFill(mutated);
      expect(a.fp).not.toBe(b.fp);
    });
  });

  // ---------------- Spiral ----------------
  describe('spiral', () => {
    test('spiralTurns increases winding count', () => {
      expectKnobMattersFor('spiral', 'spiralTurns', 24);
    });
    test('spiralTightness controls radial step', () => {
      expectKnobMattersFor('spiral', 'spiralTightness', 2.0);
    });
    test('spiralDirection cw vs ccw', () => {
      expectKnobMattersFor('spiral', 'spiralDirection', 'ccw');
    });
  });

  // ---------------- Radial ----------------
  describe('radial', () => {
    test('radialSpokes count', () => {
      expectKnobMattersFor('radial', 'radialSpokes', 6);
    });
    test('radialSkip alternation', () => {
      expectKnobMattersFor('radial', 'radialSkip', 2);
    });
  });

  // ---------------- Polygonal ----------------
  describe('polygonal', () => {
    test('polyPadding shrinks each tile', () => {
      expectKnobMattersFor('polygonal', 'polyPadding', 0.4);
    });
    test('polyRotation rotates each tile', () => {
      expectKnobMattersFor('polygonal', 'polyRotation', 45);
    });
    test('polyRotationStep cascades rotation across tiles', () => {
      expectKnobMattersFor('polygonal', 'polyRotationStep', 15);
    });
    test('polyScaleStep cascades scale across tiles', () => {
      expectKnobMattersFor('polygonal', 'polyScaleStep', 0.05);
    });
  });

  // ---------------- Truchet (B3) ----------------
  describe('truchet', () => {
    test('truchetTileSet swaps glyph family', () => {
      expectKnobMattersFor('truchet', 'truchetTileSet', 'diagonals');
    });
    test('truchetTileSize changes grid resolution', () => {
      expectKnobMattersFor('truchet', 'truchetTileSize', 15);
    });
    test('truchetSeed reseeds tile selection', () => {
      expectKnobMattersFor('truchet', 'truchetSeed', 99);
    });
    test('truchetRotations limits orientations', () => {
      expectKnobMattersFor('truchet', 'truchetRotations', 1);
    });
  });

  // ---------------- Maze (B4) ----------------
  describe('maze', () => {
    test('mazeCellSize changes grid resolution', () => {
      expectKnobMattersFor('maze', 'mazeCellSize', 15);
    });
    // NOTE: mazeAlgorithm is plumbed through by buildFillArg, but the current
    // _mazeFill implementation only runs DFS regardless of this knob — so we
    // cannot write a meaningful through-the-stack test for it today. The
    // PLUMBING fix is verified indirectly by every other maze* test below;
    // the algorithm-side implementation of alternate algorithms is a separate
    // change tracked outside this RGR.
    test.skip('mazeAlgorithm dfs vs prim — algorithm only implements DFS today', () => {
      expectKnobMattersFor('maze', 'mazeAlgorithm', 'prim');
    });
    test('mazeBranchBias shifts dfs branching', () => {
      expectKnobMattersFor('maze', 'mazeBranchBias', 0.05);
    });
    test('mazeSeed reseeds the maze', () => {
      expectKnobMattersFor('maze', 'mazeSeed', 99);
    });
    test('mazeWallMode walls vs path', () => {
      expectKnobMattersFor('maze', 'mazeWallMode', 'path');
    });
  });

  // ---------------- Stripes (B8) ----------------
  describe('stripes', () => {
    test('stripeBandWidth changes band size', () => {
      expectKnobMattersFor('stripes', 'stripeBandWidth', 20);
    });
    test('stripeGap changes between-band spacing', () => {
      expectKnobMattersFor('stripes', 'stripeGap', 10);
    });
    test('stripeAngle rotates the bands', () => {
      expectKnobMattersFor('stripes', 'stripeAngle', 45);
    });
    test('stripePrimary swaps fill type inside bands', () => {
      expectKnobMattersFor('stripes', 'stripePrimary', 'dots');
    });
    test('stripeSecondary adds alternating band content', () => {
      expectKnobMattersFor('stripes', 'stripeSecondary', 'hatch');
    });
    test('stripeSecondaryDensity changes secondary density', () => {
      // Only meaningful when secondary != 'none'; set it first.
      expectKnobMattersFor('stripes', 'stripeSecondaryDensity', 10, { stripeSecondary: 'hatch' });
    });
  });

  // ---------------- Weave (B10) ----------------
  describe('weave', () => {
    test('weavePattern plain vs basket (at non-default over/under)', () => {
      // At default weaveOver=weaveUnder=1 every pattern reduces to a
      // checkerboard (modulo 2). Bump over=under=2 so the formulas diverge.
      expectKnobMattersFor('weave', 'weavePattern', 'basket', { weaveOver: 2, weaveUnder: 2 });
    });
    test('weaveStrandWidth changes strand thickness', () => {
      expectKnobMattersFor('weave', 'weaveStrandWidth', 4.0);
    });
    test('weaveGap changes between-strand spacing', () => {
      expectKnobMattersFor('weave', 'weaveGap', 2.0);
    });
    test('weaveAngle rotates the weave', () => {
      expectKnobMattersFor('weave', 'weaveAngle', 45);
    });
    test('weaveOver changes over-count', () => {
      expectKnobMattersFor('weave', 'weaveOver', 3, { weavePattern: 'twill' });
    });
    test('weaveUnder changes under-count', () => {
      expectKnobMattersFor('weave', 'weaveUnder', 3, { weavePattern: 'twill' });
    });
  });
});
