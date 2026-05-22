/*
 * WallpaperPreview substrate — RGR coverage (Team Alpha, Phase 1).
 *
 * These assertions fail against the Phase 0 stub: the stub set `_isPhase0Stub`,
 * had a no-op clearCache(), no geometry-aware cacheKey, no `_internal` pure
 * helpers, and no real tiled-path computation. They pass against the real
 * render substrate. That's the red-green proof.
 *
 * The repo's unit harness loads scripts in a JSDOM where canvas getContext is a
 * NO-OP stub (no real pixels), so we exercise the PURE helpers (cacheKey,
 * fit-to-box math, motif/geometry/transform helpers) plus the public API's
 * defensiveness, rather than asserting pixel output.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('WallpaperPreview — substrate', () => {
  let runtime;
  let WP;
  let Modifiers;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    WP = runtime.window.Vectura.WallpaperPreview;
    Modifiers = runtime.window.Vectura.Modifiers;
  });

  afterAll(() => runtime.cleanup());

  beforeEach(() => WP.clearCache());

  test('exposes the unchanged public API and is no longer a Phase 0 stub', () => {
    expect(WP).toBeTruthy();
    expect(typeof WP.render).toBe('function');
    expect(typeof WP.thumbDataURL).toBe('function');
    expect(typeof WP.cacheKey).toBe('function');
    expect(typeof WP.clearCache).toBe('function');
    expect(WP._isPhase0Stub).toBeUndefined();
    expect(WP._internal).toBeTruthy();
  });

  describe('cacheKey', () => {
    test('is stable for identical opts and unique across group + size + geometry', () => {
      const a = { mirror: { group: 'p4m' }, size: 96 };
      const b = { mirror: { group: 'p4m' }, size: 96 };
      expect(WP.cacheKey(a)).toBe(WP.cacheKey(b));

      expect(WP.cacheKey({ mirror: { group: 'p3m1' }, size: 96 }))
        .not.toBe(WP.cacheKey({ mirror: { group: 'p4m' }, size: 96 }));

      expect(WP.cacheKey({ mirror: { group: 'p4m' }, size: 96 }))
        .not.toBe(WP.cacheKey({ mirror: { group: 'p4m' }, size: 64 }));
    });

    test('geometry hash differentiates different source paths but matches identical ones', () => {
      const g1 = [[{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]];
      const g1copy = [[{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]];
      const g2 = [[{ x: 0, y: 0 }, { x: 10, y: 99 }, { x: 20, y: 0 }]];

      const base = { mirror: { group: 'p4m' }, size: 96 };
      expect(WP.cacheKey({ ...base, sourcePaths: g1 }))
        .toBe(WP.cacheKey({ ...base, sourcePaths: g1copy }));
      expect(WP.cacheKey({ ...base, sourcePaths: g1 }))
        .not.toBe(WP.cacheKey({ ...base, sourcePaths: g2 }));
      // empty / missing geometry collapses to the 'motif' tag
      expect(WP.cacheKey({ ...base })).toBe(WP.cacheKey({ ...base, sourcePaths: [] }));
    });

    test('never throws on degenerate opts', () => {
      expect(() => WP.cacheKey()).not.toThrow();
      expect(() => WP.cacheKey({})).not.toThrow();
      expect(() => WP.cacheKey({ mirror: null, size: -5, sourcePaths: null })).not.toThrow();
      expect(typeof WP.cacheKey({})).toBe('string');
    });

    test('includes stroke color so a re-skin (different --mp-type-color) busts the memo', () => {
      const base = { mirror: { group: 'p4m' }, size: 96 };
      expect(WP.cacheKey({ ...base, color: '#5cd99a' }))
        .not.toBe(WP.cacheKey({ ...base, color: '#ff0000' }));
    });

    test('includes devicePixelRatio so a 1× render is not served to a 2× card', () => {
      const win = runtime.window;
      const orig = win.devicePixelRatio;
      try {
        win.devicePixelRatio = 1;
        const k1 = WP.cacheKey({ mirror: { group: 'p4m' }, size: 96 });
        win.devicePixelRatio = 2;
        const k2 = WP.cacheKey({ mirror: { group: 'p4m' }, size: 96 });
        expect(k1).not.toBe(k2);
      } finally {
        win.devicePixelRatio = orig;
      }
    });
  });

  describe('pure helpers (_internal)', () => {
    test('normSize handles number, object, and bad input', () => {
      const { normSize } = WP._internal;
      expect(normSize(120)).toEqual({ w: 120, h: 120 });
      expect(normSize({ w: 40, h: 80 })).toEqual({ w: 40, h: 80 });
      expect(normSize(0)).toEqual({ w: 96, h: 96 });
      expect(normSize(undefined)).toEqual({ w: 96, h: 96 });
      expect(normSize({ w: -2, h: 5 })).toEqual({ w: 96, h: 96 });
    });

    test('pathsBBox computes the tight box and rejects degenerate input', () => {
      const { pathsBBox } = WP._internal;
      const bbox = pathsBBox([[{ x: -5, y: 2 }, { x: 10, y: -3 }, { x: 4, y: 7 }]]);
      expect(bbox).toMatchObject({ minX: -5, minY: -3, maxX: 10, maxY: 7, width: 15, height: 10 });
      expect(pathsBBox([])).toBeNull();
      expect(pathsBBox([[{ x: 1, y: 1 }]])).toBeNull(); // single point => < 2 seen
      expect(pathsBBox([[{ x: NaN, y: 1 }, { x: 2, y: 2 }]])).toBeNull();
    });

    test('fitTransform centers and scales a bbox into the target box', () => {
      const { fitTransform } = WP._internal;
      // 100x50 bbox centered at origin, into a 96x96 box with margin 4 → avail 88.
      const bbox = { minX: -50, minY: -25, maxX: 50, maxY: 25, width: 100, height: 50 };
      const t = fitTransform(bbox, 96, 96, 4);
      expect(t.scale).toBeCloseTo(88 / 100, 5); // width-constrained
      // center of bbox (0,0) maps to canvas center (48,48)
      expect(0 * t.scale + t.tx).toBeCloseTo(48, 5);
      expect(0 * t.scale + t.ty).toBeCloseTo(48, 5);
      // a corner stays inside the box
      const px = bbox.maxX * t.scale + t.tx;
      expect(px).toBeLessThanOrEqual(96);
      expect(px).toBeGreaterThanOrEqual(0);
    });

    test('fitTransform stays finite on a zero-area bbox', () => {
      const { fitTransform } = WP._internal;
      const t = fitTransform({ minX: 5, minY: 5, maxX: 5, maxY: 5, width: 0, height: 0 }, 96, 96, 4);
      expect(Number.isFinite(t.scale)).toBe(true);
      expect(Number.isFinite(t.tx)).toBe(true);
      expect(Number.isFinite(t.ty)).toBe(true);
    });

    test('motif is asymmetric (not mirror-symmetric about its bbox center)', () => {
      const { motifPaths, pathsBBox } = WP._internal;
      const paths = motifPaths();
      const bbox = pathsBBox(paths);
      expect(bbox).toBeTruthy();
      // Reflect every point across the bbox vertical centerline; the reflected
      // point set must NOT equal the original set (otherwise the motif is
      // symmetric and hides group differences).
      const cx = (bbox.minX + bbox.maxX) / 2;
      const orig = new Set();
      paths.forEach((p) => p.forEach((pt) => orig.add(`${pt.x},${pt.y}`)));
      let allMirrored = true;
      paths.forEach((p) => p.forEach((pt) => {
        const rx = 2 * cx - pt.x;
        if (!orig.has(`${rx},${pt.y}`)) allMirrored = false;
      }));
      expect(allMirrored).toBe(false);
    });

    test('deriveBounds yields a positive square region scaled to tile size', () => {
      const { deriveBounds } = WP._internal;
      const b = deriveBounds({ tileWidth: 60, tileHeight: 60 }, 96);
      expect(b.width).toBeGreaterThan(0);
      expect(b.width).toBe(b.height);
      expect(b.x).toBe(0);
      expect(b.y).toBe(0);
    });

    test('capPoints reduces total points below the cap while keeping endpoints', () => {
      const { capPoints } = WP._internal;
      const long = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: i }));
      const out = capPoints([long, long], 200);
      const total = out.reduce((n, p) => n + p.length, 0);
      expect(total).toBeLessThanOrEqual(200 + 2); // small slack from per-path floor
      // endpoints preserved
      expect(out[0][0]).toEqual({ x: 0, y: 0 });
      expect(out[0][out[0].length - 1]).toEqual({ x: 999, y: 999 });
    });

    test('computeTiledPaths runs the keystone transform and tiles real geometry', () => {
      const { computeTiledPaths } = WP._internal;
      const source = [[{ x: 100, y: 100 }, { x: 110, y: 120 }, { x: 90, y: 130 }]];
      const res = computeTiledPaths({ mirror: { group: 'p4m' }, sourcePaths: source, size: 96 });
      expect(res.usedMotif).toBe(false);
      expect(Array.isArray(res.paths)).toBe(true);
      // A symmetric group should produce more output paths than the single input.
      expect(res.paths.length).toBeGreaterThan(1);
    });

    test('computeTiledPaths falls back to the motif when sourcePaths is empty', () => {
      const { computeTiledPaths } = WP._internal;
      const res = computeTiledPaths({ mirror: { group: 'p4m' }, sourcePaths: [], size: 96 });
      expect(res.usedMotif).toBe(true);
      expect(res.paths.length).toBeGreaterThan(0);
    });

    test('computeTiledPaths returns the fixed lattice window for consistent icon framing', () => {
      const { computeTiledPaths } = WP._internal;
      const res = computeTiledPaths({ mirror: { group: 'p4m', tileWidth: 80 }, size: 96 });
      expect(res.bounds).toBeTruthy();
      expect(res.bounds.width).toBeGreaterThan(0);
      // Window is a fixed multiple of the tile (ICON_TILE_REPEATS), so it scales
      // with the tile — this is what normalises on-screen pitch across cards.
      expect(res.bounds.width).toBeCloseTo(80 * 2.5, 5);
    });
  });

  describe('public render API defensiveness', () => {
    const make = () => runtime.document.createElement('div');

    test('render() tolerates empty / missing sourcePaths', () => {
      expect(() => WP.render(make(), { mirror: { group: 'p4m' }, size: 64 })).not.toThrow();
      expect(() => WP.render(make(), { mirror: { group: 'p4m' }, size: 64, sourcePaths: [] })).not.toThrow();
    });

    test('render() never throws on degenerate input', () => {
      expect(() => WP.render(null)).not.toThrow();
      expect(() => WP.render(make(), {})).not.toThrow();
      expect(() => WP.render(make(), { mirror: null, size: 0, sourcePaths: null })).not.toThrow();
      expect(() => WP.render(make(), {
        mirror: { group: 'nope', tileWidth: 0, tileHeight: 0 },
        sourcePaths: [[{ x: NaN, y: NaN }]],
      })).not.toThrow();
    });

    test('render() accepts a <canvas> target directly', () => {
      const cv = runtime.document.createElement('canvas');
      expect(() => WP.render(cv, { mirror: { group: 'cmm' }, size: 48 })).not.toThrow();
    });

    test('render() sizes the backing store at size × dpr (crisp on Retina) while the CSS box fills the card', () => {
      const win = runtime.window;
      const orig = win.devicePixelRatio;
      try {
        win.devicePixelRatio = 2;
        const host = runtime.document.createElement('div');
        WP.render(host, { mirror: { group: 'p4m' }, size: 72 });
        const cv = host.querySelector('canvas[data-wp-preview]');
        expect(cv).toBeTruthy();
        expect(cv.width).toBe(144);
        expect(cv.height).toBe(144);
        expect(cv.style.width).toBe('100%');
      } finally {
        win.devicePixelRatio = orig;
      }
    });

    test('thumbDataURL() returns a string and never throws', () => {
      expect(() => WP.thumbDataURL()).not.toThrow();
      expect(typeof WP.thumbDataURL({ mirror: { group: 'p6m' }, size: 96 })).toBe('string');
    });

    test('identical opts hit the memo cache (warm cache grows by one, then holds)', () => {
      const { cacheSize } = WP._internal;
      WP.clearCache();
      expect(cacheSize()).toBe(0);
      const opts = { mirror: { group: 'p4m' }, size: 96 };
      WP.thumbDataURL(opts);
      const afterFirst = cacheSize();
      expect(afterFirst).toBe(1);
      // Same key again → served from cache, no new entry.
      WP.thumbDataURL({ mirror: { group: 'p4m' }, size: 96 });
      expect(cacheSize()).toBe(afterFirst);
      // Different key → new entry.
      WP.thumbDataURL({ mirror: { group: 'p3' }, size: 96 });
      expect(cacheSize()).toBe(afterFirst + 1);
    });

    test('clearCache() empties the memo store', () => {
      WP.thumbDataURL({ mirror: { group: 'p4m' }, size: 96 });
      expect(WP._internal.cacheSize()).toBeGreaterThan(0);
      WP.clearCache();
      expect(WP._internal.cacheSize()).toBe(0);
    });
  });
});
