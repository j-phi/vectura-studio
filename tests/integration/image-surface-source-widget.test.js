const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Image Surface source widget + paint modal — UI wiring coverage.
 *
 * Canvas is a no-op stub in this runtime, so we assert DOM structure, event
 * wiring, and the layer-param mutations each affordance commits (not pixels).
 */
describe('Image Surface — source widget + paint modal', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('imageSurface');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const layer = () => app.engine.getActiveLayer();

  test('the panel mounts the source widget: preview, gallery, Import + Paint', () => {
    expect(document.querySelector('.image-source-widget')).toBeTruthy();
    expect(document.querySelector('.image-source-preview canvas')).toBeTruthy();
    expect(document.querySelector('.image-source-btn.is-import')).toBeTruthy();
    expect(document.querySelector('.image-source-btn.is-paint')).toBeTruthy();
    // Built-in tile + one tile per preloaded noise preset.
    const tiles = document.querySelectorAll('.image-source-tile');
    expect(tiles.length).toBe(1 + window.Vectura.NOISE_IMAGE_PRESETS.length);
  });

  test('clicking a noise preset commits a noise source and populates NOISE_IMAGES', () => {
    const preset = window.Vectura.NOISE_IMAGE_PRESETS[0];
    // The first non-built-in tile is the first preset.
    const tile = document.querySelectorAll('.image-source-tile')[1];
    tile.click();

    const p = layer().params;
    expect(p.imageSourceKind).toBe('noise');
    expect(p.imageName).toBe(preset.label);
    expect(p.imageNoiseDef.type).toBe(preset.noise.type);
    expect(p.imageSrc).toBe('');
    // generate() (run by regen) resolves the noise raster into NOISE_IMAGES.
    expect(p.imageId).toBeTruthy();
    expect(window.Vectura.NOISE_IMAGES[p.imageId]).toBeTruthy();
  });

  test('the Built-in tile reverts to the procedural source', () => {
    // First select a noise preset, then go back to built-in.
    document.querySelectorAll('.image-source-tile')[1].click();
    expect(layer().params.imageNoiseDef).toBeTruthy();

    document.querySelectorAll('.image-source-tile')[0].click();
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
});
