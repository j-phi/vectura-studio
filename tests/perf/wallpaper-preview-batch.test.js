/*
 * Perf: a wallpaper-preview gallery renders ~17-25 thumbnails at once. Each
 * thumbnail runs the pure wallpaper transform + fit-to-box + stroke, so a full
 * grid must stay cheap. We render a batch of 25 distinct groups (worst case:
 * cache cold) and assert the whole batch completes within a sane budget, plus a
 * warm-cache pass that must be far cheaper.
 *
 * NB: the unit harness stubs canvas getContext as a no-op, so this measures the
 * geometry/transform cost (the dominant CPU term), not real rasterization.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('WallpaperPreview batch performance', () => {
  let runtime;
  let WP;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    WP = runtime.window.Vectura.WallpaperPreview;
  });

  afterAll(() => runtime.cleanup());

  const GROUPS = [
    'p1', 'p2', 'pm', 'pg', 'cm', 'pmm', 'pmg', 'pgg', 'cmm',
    'p4', 'p4m', 'p4g', 'p3', 'p3m1', 'p31m', 'p6', 'p6m',
  ];

  // A moderately detailed source layer (~12 paths × ~40 pts) to stress the
  // clip + tile path explosion across symmetric groups.
  const buildSource = () => {
    const paths = [];
    for (let i = 0; i < 12; i++) {
      const path = [];
      for (let j = 0; j < 40; j++) {
        path.push({ x: 200 + i * 3 + Math.cos(j * 0.3) * 18, y: 200 + Math.sin(j * 0.3 + i) * 22 });
      }
      paths.push(path);
    }
    return paths;
  };

  test('renders a cold batch of 25 thumbnails within budget', () => {
    WP.clearCache();
    const source = buildSource();
    const opts = [];
    for (let i = 0; i < 25; i++) {
      opts.push({ mirror: { group: GROUPS[i % GROUPS.length], tileWidth: 50, tileHeight: 50 }, size: 96, sourcePaths: source });
    }
    const start = Date.now();
    for (const o of opts) {
      const url = WP.thumbDataURL(o);
      expect(typeof url).toBe('string');
    }
    const elapsed = Date.now() - start;
    // Generous budget for CI noise; ~25 thumbnails should be well under this.
    expect(elapsed).toBeLessThan(2000);
  });

  test('warm cache replays the batch nearly instantly', () => {
    const source = buildSource();
    const make = () => ({ mirror: { group: 'p4m', tileWidth: 50, tileHeight: 50 }, size: 96, sourcePaths: source });
    WP.clearCache();
    WP.thumbDataURL(make()); // warm
    const start = Date.now();
    for (let i = 0; i < 25; i++) WP.thumbDataURL(make());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  test('point cap keeps a pathological input bounded', () => {
    WP.clearCache();
    const huge = [];
    for (let i = 0; i < 40; i++) {
      const path = [];
      for (let j = 0; j < 4000; j++) path.push({ x: 200 + j * 0.01, y: 200 + Math.sin(j) * 30 });
      huge.push(path);
    }
    const start = Date.now();
    const url = WP.thumbDataURL({ mirror: { group: 'p6m', tileWidth: 50, tileHeight: 50 }, size: 96, sourcePaths: huge });
    const elapsed = Date.now() - start;
    expect(typeof url).toBe('string');
    expect(elapsed).toBeLessThan(2000);
  });
});
