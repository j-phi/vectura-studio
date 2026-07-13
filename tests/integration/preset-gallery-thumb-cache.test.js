/*
 * Rebuilding a panel must not re-run every preset's algorithm.
 *
 * The preset gallery draws each option's thumbnail by evaluating that preset's
 * geometry (evalPaths -> Algorithms[type].generate). Nothing cached the result,
 * so EVERY buildControls() re-ran the full algorithm once per preset. For
 * Raster-Plane that is a 3D mesh + hidden-line removal + a noise raster render
 * per preset — ~1.4s a rebuild, and it dominated every full-stack test mount
 * (~85s of solid synchronous CPU in one CI test file), which starved vitest's
 * worker event loop until it blew birpc's 60s RPC timeout.
 *
 * Preset params are static and generate() is seeded from them, so the thumbnail
 * geometry is a pure function of (params, layerType) and is safe to memoize.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('preset gallery thumbnail caching', () => {
  let runtime, window, app, counts;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;

    counts = { rasterPlane: 0 };
    const algo = window.Vectura.Algorithms.rasterPlane;
    const original = algo.generate;
    algo.generate = (...args) => {
      counts.rasterPlane += 1;
      return original.apply(algo, args);
    };

    app.engine.addLayer('rasterPlane');
    app.ui.renderLayers();
  });
  afterAll(() => runtime.cleanup());

  test('a panel rebuild reuses cached preset thumbnails instead of regenerating them', () => {
    counts.rasterPlane = 0;
    app.ui.buildControls();
    const first = counts.rasterPlane;

    // The first build must actually evaluate presets (otherwise this test proves
    // nothing) — the gallery draws a thumbnail per preset.
    expect(first).toBeGreaterThan(1);

    counts.rasterPlane = 0;
    app.ui.buildControls();
    const second = counts.rasterPlane;

    // A rebuild re-renders the same preset thumbnails: they must come from cache.
    // Only the active layer's own regen may still call generate.
    expect(second).toBeLessThan(first);
    expect(second).toBeLessThanOrEqual(2);
  });

  /*
   * The cache is NOT keyed on params alone, because thumbnail geometry is not a pure
   * function of them: `text` renders built-in fallback letterforms until a Google face
   * finishes loading, and the picture algorithms render a procedural sphere until
   * `imageSrc` finishes decoding — in both cases the params (and any key derived from
   * them) are identical before and after the asset lands. Keying on params alone froze
   * those thumbnails on the fallback for the whole session. The key carries an asset
   * epoch that each async load bumps; bumping it must retire the cached thumbnails.
   */
  test('bumping the asset epoch retires cached thumbnails so they re-evaluate', () => {
    // Start from a cold cache for this epoch (an earlier test warmed the old one).
    window.Vectura.bumpAssetEpoch();
    counts.rasterPlane = 0;
    app.ui.buildControls();
    const cold = counts.rasterPlane;
    expect(cold).toBeGreaterThan(1); // a thumbnail per preset was actually evaluated

    counts.rasterPlane = 0;
    app.ui.buildControls();
    expect(counts.rasterPlane).toBeLessThanOrEqual(2); // now served from cache

    // An async asset (a web font, a decoded picture) has just landed.
    window.Vectura.bumpAssetEpoch();

    counts.rasterPlane = 0;
    app.ui.buildControls();
    // The thumbnails must be re-evaluated against the now-loaded asset, not served
    // from the entries computed while it was still missing.
    expect(counts.rasterPlane).toBe(cold);
  });

  test('a failed/empty evaluation is never cached (no permanently blank thumbnail)', () => {
    const gallerySrc = require('fs').readFileSync(
      require('path').join(__dirname, '../../src/ui/components/harmonograph-preset-gallery.js'),
      'utf8'
    );
    // evalPathsUncached returns [] when generate() throws or the registry isn't ready;
    // pinning that would leave the thumbnail blank for the rest of the session.
    expect(gallerySrc).toMatch(/if \(key !== null && paths\.length\)/);
  });
});
