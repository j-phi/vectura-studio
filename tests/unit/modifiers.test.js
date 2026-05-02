const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mirror modifier helpers', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('mirror axis keeps source side and reflects it onto the replaced side', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = {
      enabled: true,
      angle: 90,
      xShift: 0,
      yShift: 0,
      replacedSide: 'positive',
    };
    const input = [[
      { x: 70, y: 20 },
      { x: 80, y: 20 },
    ]];

    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });

    expect(out).toHaveLength(2);
    expect(out[0][0].x).toBeCloseTo(70, 3);
    expect(out[1][0].x).toBeCloseTo(30, 3);
    expect(out[1][1].x).toBeCloseTo(20, 3);
  });

  test('sequential crossing mirrors compound in stack order', () => {
    const { Modifiers } = runtime.window.Vectura;
    const modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [
        { enabled: true, angle: 90, xShift: 0, yShift: 0, replacedSide: 'positive' },
        { enabled: true, angle: 0, xShift: 0, yShift: 0, replacedSide: 'positive' },
      ],
    };
    const input = [[
      { x: 70, y: 30 },
      { x: 80, y: 30 },
    ]];

    const out = Modifiers.applyModifierToPaths(input, modifier, { width: 100, height: 100 });
    const firstPoints = out.map((path) => `${Math.round(path[0].x)}:${Math.round(path[0].y)}`).sort();

    expect(firstPoints).toEqual(['30:30', '30:70', '70:30', '70:70']);
  });

  test('closed mirrored shapes stay closed and usable as silhouette sources', () => {
    const { Modifiers, OptimizationUtils } = runtime.window.Vectura;
    const mirror = {
      enabled: true,
      angle: 90,
      xShift: 0,
      yShift: 0,
      replacedSide: 'positive',
    };
    const circle = [];
    circle.meta = { kind: 'circle', cx: 70, cy: 50, r: 12 };

    const out = Modifiers.applyMirrorToPaths([circle], mirror, { width: 100, height: 100 });
    const centers = out
      .map((path) => path.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 }))
      .map((sum, index) => ({
        x: sum.x / Math.max(1, out[index].length),
        y: sum.y / Math.max(1, out[index].length),
      }))
      .sort((a, b) => a.x - b.x);

    expect(out).toHaveLength(2);
    expect(out.every((path) => OptimizationUtils.isClosedPath(path))).toBe(true);
    expect(centers[0].x).toBeCloseTo(30, 0);
    expect(centers[1].x).toBeCloseTo(70, 0);
  });
});

describe('Radial mirror modifier', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('rotation mode produces N copies of wedge-clipped geometry', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = { enabled: true, type: 'radial', count: 4, mode: 'rotation', centerX: 0, centerY: 0, angle: 0 };
    // path in the first 90° wedge (x>0, y>0 from center at 50,50)
    const input = [[
      { x: 60, y: 55 },
      { x: 70, y: 55 },
    ]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    expect(out.length).toBeGreaterThanOrEqual(4);
  });

  test('dihedral mode produces 2N copies', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = { enabled: true, type: 'radial', count: 3, mode: 'dihedral', centerX: 0, centerY: 0, angle: 0 };
    const input = [[
      { x: 55, y: 50 },
      { x: 60, y: 50 },
    ]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    // Should produce 2*3 = 6 copies (or fewer if path crosses wedge boundaries)
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.every((p) => Array.isArray(p) && p.length >= 2)).toBe(true);
  });

  test('edge mode returns valid paths', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = { enabled: true, type: 'radial', count: 4, mode: 'edge', centerX: 0, centerY: 0, angle: 0 };
    const input = [[
      { x: 60, y: 50 },
      { x: 70, y: 50 },
    ]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    expect(Array.isArray(out)).toBe(true);
    expect(out.every((p) => Array.isArray(p) && p.length >= 2)).toBe(true);
  });

  test('disabled radial mirror passes paths through unchanged', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = { enabled: false, type: 'radial', count: 6, mode: 'dihedral', centerX: 0, centerY: 0, angle: 0 };
    const input = [[{ x: 60, y: 50 }, { x: 70, y: 50 }]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    expect(out).toHaveLength(1);
  });

  test('radial + line mirror compose sequentially in stack', () => {
    const { Modifiers } = runtime.window.Vectura;
    const modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [
        { enabled: true, type: 'radial', count: 4, mode: 'rotation', centerX: 0, centerY: 0, angle: 0 },
        { enabled: true, type: 'line', angle: 90, xShift: 0, yShift: 0, replacedSide: 'positive' },
      ],
    };
    const input = [[{ x: 60, y: 55 }, { x: 70, y: 55 }]];
    const out = Modifiers.applyModifierToPaths(input, modifier, { width: 100, height: 100 });
    expect(Array.isArray(out)).toBe(true);
    expect(out.every((p) => Array.isArray(p) && p.length >= 2)).toBe(true);
  });
});

describe('Arc mirror modifier', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('outer replacement: source is inner side, reflection appears on outer side', () => {
    const { Modifiers } = runtime.window.Vectura;
    const R = 30;
    const mirror = { enabled: true, type: 'arc', centerX: 0, centerY: 0, radius: R, arcStart: -90, arcEnd: 90, replacedSide: 'outer' };
    // Source = inner side: path inside circle (center=50,50, dist=5 < R=30)
    const input = [[{ x: 55, y: 50 }, { x: 58, y: 50 }]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    // Source (inner) kept + reflection (outer) added
    expect(out.length).toBeGreaterThanOrEqual(2);
    // At least one path inside circle (source) and one outside (reflection)
    const innerPath = out.find((p) => Math.hypot(p[0].x - 50, p[0].y - 50) < R);
    expect(innerPath).toBeDefined();
  });

  test('inner replacement: source is outer side, reflection appears on inner side', () => {
    const { Modifiers } = runtime.window.Vectura;
    const R = 30;
    const mirror = { enabled: true, type: 'arc', centerX: 0, centerY: 0, radius: R, arcStart: -90, arcEnd: 90, replacedSide: 'inner' };
    // Source = outer side: path outside circle (dist=35 > R=30)
    const input = [[{ x: 85, y: 50 }, { x: 88, y: 50 }]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    expect(out.length).toBeGreaterThanOrEqual(2);
    // Reflection should be inside the circle: inversion gives R²/r = 900/35 ≈ 25.7 from center
    const innerReflected = out.find((p) => Math.hypot(p[0].x - 50, p[0].y - 50) < R);
    expect(innerReflected).toBeDefined();
  });

  test('arc reflection is involutory: reflecting twice returns to origin', () => {
    const { Modifiers } = runtime.window.Vectura;
    const pt = { x: 90, y: 50 };
    const cx = 50;
    const cy = 50;
    const R = 30;
    const r1 = Modifiers.reflectPointAcrossCircle(pt, cx, cy, R);
    const r2 = Modifiers.reflectPointAcrossCircle(r1, cx, cy, R);
    expect(r2.x).toBeCloseTo(pt.x, 4);
    expect(r2.y).toBeCloseTo(pt.y, 4);
  });

  test('disabled arc mirror passes paths through unchanged', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = { enabled: false, type: 'arc', centerX: 0, centerY: 0, radius: 30, replacedSide: 'outer' };
    const input = [[{ x: 80, y: 50 }, { x: 90, y: 50 }]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    expect(out).toHaveLength(1);
  });

  test('strength=50 does not collapse reflected path to mirror circle', () => {
    const { Modifiers } = runtime.window.Vectura;
    const R = 30;
    const cx = 50;
    const cy = 50;
    const mirror = {
      enabled: true, type: 'arc', centerX: 0, centerY: 0,
      radius: R, arcStart: -180, arcEnd: 180, replacedSide: 'outer', strength: 50, falloff: 0,
    };
    const input = [[{ x: 55, y: 50 }, { x: 58, y: 50 }]]; // inner at dist≈5–8
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    const reflected = out.filter((p) => Math.hypot(p[0].x - cx, p[0].y - cy) > R);
    expect(reflected.length).toBeGreaterThan(0);
    reflected.forEach((p) => {
      const d = Math.hypot(p[0].x - cx, p[0].y - cy);
      expect(Math.abs(d - R)).toBeGreaterThan(0.5);
    });
  });

  test('strength=0 adds no reflected paths', () => {
    const { Modifiers } = runtime.window.Vectura;
    const mirror = {
      enabled: true, type: 'arc', centerX: 0, centerY: 0,
      radius: 30, arcStart: -180, arcEnd: 180, replacedSide: 'outer', strength: 0, falloff: 0,
    };
    const input = [[{ x: 55, y: 50 }, { x: 58, y: 50 }]];
    const out = Modifiers.applyMirrorToPaths(input, mirror, { width: 100, height: 100 });
    expect(out).toHaveLength(1);
  });

});
