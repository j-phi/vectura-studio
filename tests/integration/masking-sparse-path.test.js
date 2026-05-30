const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Regression for: masking a closed Lissajous-like path produced chord-line artifacts
// because the resample block in applyMaskToPaths was gated behind !isLoop. A standard
// (no-damping) Lissajous is geometrically closed — isClosedPath returns true, so
// isLoop=true, and resampling was skipped entirely. Sparse edges crossing the mask
// polygon boundary twice produced 2-point chord segments (rendered as straight lines).
describe('masking: sparse paths resampled before clipping regardless of closure', () => {
  let runtime, V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const makeOval = (cx, cy, rx, ry, n = 36) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const theta = (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry });
    }
    return pts;
  };

  test('RED→GREEN: sparse CLOSED lissajous masked by circle produces dense segments', () => {
    // 20-point closed Lissajous (each edge spans ~50+ document units — very sparse).
    // isClosedPath(path) === true → the !isLoop guard prevented resampling.
    const path = [];
    for (let i = 0; i < 20; i++) {
      const t = (i / 20) * Math.PI * 8;
      path.push({ x: 300 + Math.sin(3 * t) * 200, y: 250 + Math.sin(4 * t) * 160 });
    }
    path.push({ x: path[0].x, y: path[0].y }); // close: first === last

    const oval = makeOval(300, 250, 100, 80);

    const masked = V.Masking.applyMaskToPaths([path], [oval], { invert: true });
    expect(masked.length).toBeGreaterThan(0);

    // With resampling (diag ≈ 256, maxEdge ≈ 1.7): interior arcs have many points.
    // Without resampling (old code, isLoop guard active): sparse segments, avg ~3 pts.
    const totalPoints = masked.reduce((sum, s) => sum + s.length, 0);
    const minExpected = masked.length * 5; // average ≥5 points per segment
    expect(totalPoints).toBeGreaterThanOrEqual(minExpected);
  });

  test('regression: sparse OPEN lissajous masked by circle: no long chord artifacts', () => {
    // Open path (first ≠ last) — this case was already fixed in the first commit.
    // Verify it still works after removing the !isLoop guard.
    const path = [];
    for (let i = 0; i < 20; i++) {
      const t = (i / 20) * Math.PI * 7.5; // does not close exactly
      path.push({ x: 300 + Math.sin(3 * t) * 200, y: 250 + Math.sin(4 * t) * 160 });
    }

    const oval = makeOval(300, 250, 100, 80);

    const masked = V.Masking.applyMaskToPaths([path], [oval], { invert: true });

    // With resample (diag ≈ 256, maxEdge ≈ 1.7): no 2-pt chord segment longer than ~2 units.
    // Without resample: 2-pt chord segments spanning 30-80 units (straight-line artifacts).
    const MAX_CHORD = 5;
    const longChords = masked.filter((s) => {
      if (s.length !== 2) return false;
      const dx = s[1].x - s[0].x;
      const dy = s[1].y - s[0].y;
      return Math.sqrt(dx * dx + dy * dy) > MAX_CHORD;
    });
    expect(longChords).toHaveLength(0);
  });
});
