/*
 * RGR: Petalis visual thumbnail profile picker.
 *
 * The petalProfile control was a name-only <select> ('Teardrop', 'Marquise',
 * …) — useless for choosing a silhouette by eye — and it was stripped from the
 * petalisDesigner panel entirely, so the in-app flower had NO named-profile
 * picker at all (profiles were only reachable via presets or the randomizer).
 *
 * Now `petalProfile` is a `petalProfileGallery` control: a thumbnail strip of
 * all ~10 silhouettes, each rendered from a real single-petal generate() call,
 * mounted in BOTH the petalis panel and the designer panel. Clicking a thumb
 * applies the profile (undoable) and re-renders.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Petalis visual profile gallery', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    document = window.document;
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const galleryDef = (defs) => defs.find((d) => d && d.id === 'petalProfile');

  test('petalProfile control def is a petalProfileGallery with the full silhouette list', () => {
    const defs = window.Vectura.UI.CONTROL_DEFS.petalis;
    const def = galleryDef(defs);
    expect(def).toBeTruthy();
    expect(def.type).toBe('petalProfileGallery');
    expect(def.options.length).toBeGreaterThanOrEqual(10);
  });

  test('the designer panel includes the profile gallery (no longer stripped)', () => {
    const defs = window.Vectura.UI.CONTROL_DEFS.petalisDesigner;
    const def = galleryDef(defs);
    expect(def).toBeTruthy();
    expect(def.type).toBe('petalProfileGallery');
  });

  test('buildPetalProfileThumbPaths returns a distinct, non-degenerate outline per profile', () => {
    const def = galleryDef(window.Vectura.UI.CONTROL_DEFS.petalis);
    const signatures = new Set();
    def.options.forEach((opt) => {
      const outline = app.ui.buildPetalProfileThumbPaths(opt.value);
      expect(Array.isArray(outline)).toBe(true);
      expect(outline.length).toBeGreaterThan(8);
      // Signature: rounded width samples along the petal — distinct silhouettes
      // must not collapse into one shape (the pre-v1.1.83 bug class).
      const sig = outline
        .filter((_, i) => i % 4 === 0)
        .map((pt) => `${Math.round(pt.x * 10)},${Math.round(pt.y * 10)}`)
        .join('|');
      signatures.add(sig);
    });
    expect(signatures.size).toBe(def.options.length);
  });

  test('mount renders one thumb per profile and marks the current one active', () => {
    const layer = app.engine.addLayer
      ? app.engine.addLayer('petalisDesigner')
      : null;
    const l = app.engine.layers[app.engine.layers.length - 1];
    l.params.petalProfile = 'heart';
    const def = galleryDef(window.Vectura.UI.CONTROL_DEFS.petalis);
    const container = document.createElement('div');
    document.body.appendChild(container);
    app.ui.mountPetalProfileGallery(l, container, def);
    const thumbs = container.querySelectorAll('.petal-profile-thumb');
    expect(thumbs.length).toBe(def.options.length);
    const active = container.querySelectorAll('.petal-profile-thumb.active');
    expect(active.length).toBe(1);
    expect(active[0].dataset.profile).toBe('heart');
    // Every thumb carries a canvas preview.
    thumbs.forEach((btn) => expect(btn.querySelector('canvas')).toBeTruthy());
  });

  test('clicking a thumb applies the profile, pushes history, and moves the active state', () => {
    const l = app.engine.layers[app.engine.layers.length - 1];
    l.params.petalProfile = 'heart';
    const def = galleryDef(window.Vectura.UI.CONTROL_DEFS.petalis);
    const container = document.createElement('div');
    document.body.appendChild(container);
    app.ui.mountPetalProfileGallery(l, container, def);
    let pushes = 0;
    const origPush = app.pushHistory;
    app.pushHistory = () => { pushes += 1; };
    try {
      const target = container.querySelector('.petal-profile-thumb[data-profile="marquise"]');
      expect(target).toBeTruthy();
      target.click();
      expect(l.params.petalProfile).toBe('marquise');
      expect(pushes).toBe(1);
      const active = container.querySelectorAll('.petal-profile-thumb.active');
      expect(active.length).toBe(1);
      expect(active[0].dataset.profile).toBe('marquise');
    } finally {
      app.pushHistory = origPush;
    }
  });
});
