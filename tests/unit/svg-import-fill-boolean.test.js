const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Closed unit square as {x,y} points (CCW winding)
const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
// Smaller square inside the unit square (for hole/nesting tests)
const innerSquare = [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }];

describe('FillBoolean', () => {
  let FB;
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    FB = runtime.window.Vectura.FillBoolean;
  });

  afterAll(() => { runtime?.cleanup?.(); });

  // --- closeRing ---

  test('closeRing converts {x,y} array to closed numeric-pair ring', () => {
    const result = FB.closeRing(square);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(5); // 4 pts + closing repeat
    expect(result[0]).toEqual(result[result.length - 1]);
    result.forEach((pt) => {
      expect(Array.isArray(pt)).toBe(true);
      expect(pt.length).toBe(2);
    });
  });

  test('closeRing returns [] for empty array', () => {
    expect(FB.closeRing([])).toEqual([]);
  });

  test('closeRing returns [] for fewer than 3 points', () => {
    expect(FB.closeRing([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });

  test('closeRing does not throw for NaN coordinate inputs', () => {
    expect(() => FB.closeRing([{ x: NaN, y: 0 }, { x: 0, y: NaN }, { x: 5, y: 5 }])).not.toThrow();
  });

  // --- ringArea ---

  test('ringArea returns correct signed area for a 10x10 square ring', () => {
    const closed = FB.closeRing(square);
    const area = FB.ringArea(closed);
    expect(Math.abs(area)).toBeCloseTo(100, 5);
  });

  test('ringArea changes sign for reversed winding', () => {
    const cw = FB.closeRing([...square].reverse());
    const ccw = FB.closeRing(square);
    expect(Math.sign(FB.ringArea(cw))).not.toBe(Math.sign(FB.ringArea(ccw)));
  });

  test('ringArea returns 0 for degenerate (collinear) ring', () => {
    const line = FB.closeRing([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
    expect(FB.ringArea(line)).toBeCloseTo(0, 5);
  });

  // --- pointInRing ---

  test('pointInRing returns true for a point clearly inside the square', () => {
    const ring = FB.closeRing(square);
    expect(FB.pointInRing([5, 5], ring)).toBe(true);
  });

  test('pointInRing returns false for a point outside the square', () => {
    const ring = FB.closeRing(square);
    expect(FB.pointInRing([20, 20], ring)).toBe(false);
    expect(FB.pointInRing([-1, 5], ring)).toBe(false);
  });

  test('pointInRing returns false for null point', () => {
    expect(FB.pointInRing(null, FB.closeRing(square))).toBe(false);
  });

  test('pointInRing returns false for ring with fewer than 4 elements', () => {
    expect(FB.pointInRing([5, 5], [[0, 0], [10, 0], [10, 10]])).toBe(false);
  });

  // --- ringToMultiPolygon + multiPolygonToPaths ---

  test('ringToMultiPolygon produces a non-empty multipolygon for a valid ring', () => {
    const mp = FB.ringToMultiPolygon(square);
    expect(Array.isArray(mp)).toBe(true);
    expect(mp.length).toBeGreaterThan(0);
  });

  test('ringToMultiPolygon returns [] for degenerate input', () => {
    expect(FB.ringToMultiPolygon([])).toEqual([]);
    expect(FB.ringToMultiPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });

  test('multiPolygonToPaths converts a multipolygon back to {x,y} path arrays', () => {
    const mp = FB.ringToMultiPolygon(square);
    if (!mp.length) return; // polygon-clipping not available — skip gracefully
    const paths = FB.multiPolygonToPaths(mp);
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((path) => {
      path.forEach((pt) => {
        expect(typeof pt.x).toBe('number');
        expect(typeof pt.y).toBe('number');
      });
    });
  });

  test('ringsToEvenOddMultiPolygon returns an array (possibly empty without polygon-clipping)', () => {
    const result = FB.ringsToEvenOddMultiPolygon([square, innerSquare]);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('svgDistort generate', () => {
  let generate;
  let SeededRNG;
  let SimpleNoise;
  let runtime;

  const bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    const reg = runtime.window.Vectura.AlgorithmRegistry;
    generate = reg?.svgDistort?.generate?.bind(reg.svgDistort);
    SeededRNG = runtime.window.Vectura.SeededRNG;
    SimpleNoise = runtime.window.Vectura.SimpleNoise;
  });

  afterAll(() => { runtime?.cleanup?.(); });

  const rng = () => new SeededRNG(42);
  const noise = () => new SimpleNoise(42);

  const outlineParams = (groups) => ({
    importedGroups: groups,
    autoFit: false,
    scale: 1,
    fillMode: 'none',
    showOutlines: true,
    noises: [],
    seed: 42,
    posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0,
  });

  test('returns [] for empty importedGroups', () => {
    expect(generate(outlineParams([]), rng(), noise(), bounds)).toEqual([]);
  });

  test('returns [] when importedGroups is absent', () => {
    const p = { ...outlineParams([]) };
    delete p.importedGroups;
    expect(generate(p, rng(), noise(), bounds)).toEqual([]);
  });

  test('returns [] when all groups have no paths', () => {
    const p = outlineParams([{ paths: [], isClosed: false }]);
    expect(generate(p, rng(), noise(), bounds)).toEqual([]);
  });

  test('single outline group produces non-empty path array', () => {
    const group = { paths: [square], isClosed: false };
    const result = generate(outlineParams([group]), rng(), noise(), bounds);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('output paths contain {x,y} objects with numeric coordinates', () => {
    const group = { paths: [square], isClosed: false };
    const result = generate(outlineParams([group]), rng(), noise(), bounds);
    result.forEach((path) => {
      expect(Array.isArray(path)).toBe(true);
      path.forEach((pt) => {
        expect(typeof pt.x).toBe('number');
        expect(typeof pt.y).toBe('number');
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });
  });

  test('generate is deterministic — same params produce identical output', () => {
    const group = { paths: [square], isClosed: false };
    const p = outlineParams([group]);
    const a = generate(p, rng(), noise(), bounds);
    const b = generate(p, rng(), noise(), bounds);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('autoFit scales source geometry to fit the canvas bounds', () => {
    // Source geometry spans 0–1000 × 0–1000; canvas is 280×180 — autoFit must shrink it
    const bigSquare = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
    const p = { ...outlineParams([{ paths: [bigSquare], isClosed: false }]), autoFit: true };
    const result = generate(p, rng(), noise(), bounds);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((path) => {
      path.forEach((pt) => {
        // All output points must lie within canvas extent (m to m+dW/dH range with tolerance)
        expect(pt.x).toBeGreaterThanOrEqual(bounds.m - 1);
        expect(pt.x).toBeLessThanOrEqual(bounds.m + bounds.dW + 1);
        expect(pt.y).toBeGreaterThanOrEqual(bounds.m - 1);
        expect(pt.y).toBeLessThanOrEqual(bounds.m + bounds.dH + 1);
      });
    });
  });

  test('degenerate path with all-NaN coords does not throw', () => {
    const nanPath = [{ x: NaN, y: NaN }, { x: NaN, y: NaN }, { x: NaN, y: NaN }];
    const p = outlineParams([{ paths: [nanPath], isClosed: false }]);
    expect(() => generate(p, rng(), noise(), bounds)).not.toThrow();
  });
});
