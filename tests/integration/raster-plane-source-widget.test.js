const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Raster-Plane source widget + paint modal — UI wiring coverage.
 *
 * Canvas is a no-op stub in this runtime, so we assert DOM structure, event
 * wiring, and the layer-param mutations each affordance commits (not pixels).
 */
describe('Raster-Plane — source widget + paint modal', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('rasterPlane');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const layer = () => app.engine.getActiveLayer();

  test('the panel mounts the noise preview widget with Paint button and the noise stack has an Image Source card', () => {
    // Noise Preview section: preview canvas + Paint button (no Import button here).
    expect(document.querySelector('.image-source-widget')).toBeTruthy();
    expect(document.querySelector('.image-source-preview canvas')).toBeTruthy();
    expect(document.querySelector('.image-source-btn.is-paint')).toBeTruthy();
    // The Image Source is now a layer card in the noise stack with its own dropdown.
    expect(document.querySelector('.image-source-preset-dropdown .hg-preset-trigger')).toBeTruthy();
    // Built-in + Black + White + presets + Paint + Import options in the noise card dropdown.
    const options = document.querySelectorAll('.image-source-option');
    expect(options.length).toBe(5 + window.Vectura.NOISE_IMAGE_PRESETS.length);
  });

  test('the source dropdown is inside the noise stack card (not the preview widget)', () => {
    const previewWidget = document.querySelector('.image-source-widget');
    // The preview widget contains only the preview canvas and Paint button, no source dropdown.
    expect(previewWidget.querySelector('.image-source-preset-dropdown')).toBeFalsy();
    // The source dropdown lives in the noise stack.
    expect(document.querySelector('.noise-list .image-source-preset-dropdown')).toBeTruthy();
  });

  test('choosing a noise preset commits a noise source and populates NOISE_IMAGES', () => {
    const preset = window.Vectura.NOISE_IMAGE_PRESETS[0];
    // Options: [0]=Built-in, [1]=Black, [2]=White, [3]=first preset, ...
    const option = document.querySelectorAll('.image-source-option')[3];
    option.click();

    const p = layer().params;
    expect(p.imageSourceKind).toBe('noise');
    expect(p.imageName).toBe(preset.label);
    expect(p.imageNoiseDef.type).toBe(preset.noise.type);
    expect(p.imageSrc).toBe('');
    // generate() (run by regen) resolves the noise raster into NOISE_IMAGES.
    expect(p.imageId).toBeTruthy();
    expect(window.Vectura.NOISE_IMAGES[p.imageId]).toBeTruthy();
  });

  test('an enabled noise layer makes the preview render the noise-aware raster', () => {
    // The source-widget preview must track the 3D model: when a noise layer is
    // enabled it draws the resolved height field (renderPreviewRaster), not the
    // raw base raster. Before the fix this was gated on the removed `noiseAmount`,
    // so renderPreviewRaster was never called (preview stopped tracking the model).
    const src = window.Vectura.RasterPlaneSource;
    const orig = src.renderPreviewRaster;
    let calls = 0;
    src.renderPreviewRaster = (...args) => { calls += 1; return orig.apply(src, args); };
    try {
      // No noise → built-in base preview, renderPreviewRaster NOT used.
      layer().params.noises = [];
      app.ui.buildControls();
      expect(calls).toBe(0);

      // Add an enabled noise layer → preview switches to the noise-aware render.
      layer().params.noises = [{ enabled: true, type: 'simplex', blend: 'add', amplitude: 1, zoom: 0.02 }];
      app.ui.buildControls();
      expect(calls).toBeGreaterThan(0);
    } finally {
      src.renderPreviewRaster = orig;
    }
  });

  test('the Built-in option reverts to the procedural source', () => {
    // First select a noise preset (index 3), then go back to built-in (index 0).
    document.querySelectorAll('.image-source-option')[3].click();
    expect(layer().params.imageNoiseDef).toBeTruthy();

    document.querySelectorAll('.image-source-option')[0].click();
    const p = layer().params;
    expect(p.imageSourceKind).toBe('builtin');
    expect(p.imageNoiseDef).toBeNull();
    expect(p.imageSrc).toBe('');
  });

  test('the paint modal opens with a canvas, swatches, and Apply that bakes a painted source', () => {
    app.ui.openImagePaintModal(layer());
    expect(document.querySelector('.image-paint-canvas')).toBeTruthy();
    expect(document.querySelectorAll('.ip-swatch').length).toBe(3);
    expect(document.querySelector('.ip-brush')).toBeTruthy();
    const apply = document.querySelector('.image-paint-apply');
    expect(apply).toBeTruthy();

    apply.click();
    const p = layer().params;
    expect(p.imageSourceKind).toBe('painted');
    expect(p.imageName).toBe('Painted');
    expect(p.imageId).toBeTruthy();
    expect(window.Vectura.NOISE_IMAGES[p.imageId]).toBeTruthy();
  });

  describe('pop-out / dock', () => {
    const toggle = () => document.querySelector('.image-source-widget .image-source-popout-toggle');

    test('mounts docked inline by default (no floating pane)', () => {
      expect(toggle()).toBeTruthy();
      // Docked: the widget lives inside the left panel, not in a floating pane.
      expect(document.querySelector('.image-source-popout')).toBeFalsy();
      expect(document.querySelector('#left-section-algorithm-configuration .image-source-widget')
        || document.querySelector('.image-source-widget')).toBeTruthy();
    });

    test('the toggle pops the widget into a floating pane + leaves a Dock placeholder', () => {
      toggle().click();
      const pane = document.querySelector('.image-source-popout');
      expect(pane).toBeTruthy();
      // The actual widget moved into the floating pane (on <body>).
      expect(pane.querySelector('.image-source-widget')).toBeTruthy();
      expect(pane.parentElement).toBe(document.body);
      // An inline placeholder with a Dock button is left behind in the panel.
      expect(document.querySelector('.image-source-docked-placeholder .image-source-btn.is-dock')).toBeTruthy();
    });

    test('the Dock button re-docks the widget and removes the floating pane', () => {
      toggle().click(); // pop out
      expect(document.querySelector('.image-source-popout')).toBeTruthy();
      document.querySelector('.image-source-docked-placeholder .image-source-btn.is-dock').click();
      expect(document.querySelector('.image-source-popout')).toBeFalsy();
      expect(document.querySelector('.image-source-docked-placeholder')).toBeFalsy();
      expect(document.querySelector('.image-source-widget')).toBeTruthy();
    });

    test('selecting a different layer tears down the floating pane (no orphan)', () => {
      toggle().click(); // pop out
      expect(document.querySelector('.image-source-popout')).toBeTruthy();
      // Switch to a non-rasterPlane layer and rebuild controls.
      app.engine.addLayer('flowfield');
      app.ui.renderLayers();
      app.ui.buildControls();
      expect(document.querySelector('.image-source-popout')).toBeFalsy();
    });
  });
});
