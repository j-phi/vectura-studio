/**
 * Regression test: the opt-in "Specular Highlight" (default OFF) draws a small
 * filled dot at the point where the LIGHT reflects toward the camera — a true
 * specular spot positioned by the light direction (lightAzimuth/lightElevation),
 * NOT at the geometric pole. `specularSize` scales it. Off by default, and the
 * glyph never appears unless the toggle is on.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Topoform — Specular Highlight (light-positioned)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => runtime.cleanup());

  const gen = (overrides) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry.topoform.generate(
      { sourceMode: 'sphere', renderMode: 'contours', primitiveDetail: 24, lineCount: 14,
        contourVisibility: 'visibleOnly', yaw: -28, pitch: 34, roll: 0, showOutline: false,
        specularHighlight: true, specularSize: 35, ...overrides },
      new SeededRNG(0), new SimpleNoise(0), { width: 500, height: 500 },
    );
  };

  const spec = (paths) => paths.filter((p) => p.meta && p.meta.specular);
  const centroid = (path) => {
    let sx = 0, sy = 0;
    path.forEach((pt) => { sx += pt.x; sy += pt.y; });
    return { x: sx / path.length, y: sy / path.length };
  };
  const radius = (path) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const t of path) { if (t.x < a) a = t.x; if (t.x > c) c = t.x; if (t.y < b) b = t.y; if (t.y > d) d = t.y; }
    return Math.hypot(c - a, d - b) / 2;
  };

  it('draws exactly one filled specular dot when on', () => {
    const s = spec(gen({}));
    expect(s).toHaveLength(1);
    expect(s[0].meta.fill).toBe(true);
  });

  it('the dot is positioned by the light, not the shape — moves when the light moves', () => {
    const a = centroid(spec(gen({ lightAzimuth: 135 }))[0]);
    const b = centroid(spec(gen({ lightAzimuth: 315 }))[0]);
    // Opposite azimuths put the reflection on opposite sides of the shape.
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
    // Elevation also repositions it.
    const c = centroid(spec(gen({ lightElevation: 10 }))[0]);
    const e = centroid(spec(gen({ lightElevation: 85 }))[0]);
    expect(Math.hypot(c.x - e.x, c.y - e.y)).toBeGreaterThan(5);
  });

  it('Highlight Size scales the dot up and down', () => {
    const small = radius(spec(gen({ specularSize: 15 }))[0]);
    const large = radius(spec(gen({ specularSize: 80 }))[0]);
    expect(large).toBeGreaterThan(small * 2);
  });

  it('size 0 draws no dot', () => {
    expect(spec(gen({ specularSize: 0 }))).toHaveLength(0);
  });

  it('no dot when the toggle is off, even with a size set', () => {
    expect(spec(gen({ specularHighlight: false, specularSize: 80 }))).toHaveLength(0);
  });

  it('default (off) output carries no specular geometry', () => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    const paths = AlgorithmRegistry.topoform.generate(
      { sourceMode: 'sphere', renderMode: 'contours', primitiveDetail: 24, lineCount: 14 },
      new SeededRNG(0), new SimpleNoise(0), { width: 500, height: 500 },
    );
    expect(spec(paths)).toHaveLength(0);
  });

  it('works in wireframe too (single light-positioned dot)', () => {
    expect(spec(gen({ renderMode: 'wireframe' }))).toHaveLength(1);
  });
});
