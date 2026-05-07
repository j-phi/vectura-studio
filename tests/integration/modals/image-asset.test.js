/*
 * Integration test for the image-asset modal (Phase 3 step 4 — second modal).
 *
 * Boots the full Vectura runtime, then verifies:
 *   - app.ui.openNoiseImageModal renders the rainfall-silhouette modal scaffold
 *     with the correct title/label/dropLabel from controls-registry.js
 *   - the modal title is wired to the supplied options (so per-call site
 *     wording — "Select Silhouette Image" vs "Select Noise Image" — round-
 *     trips correctly)
 *   - the file input is present, accept attribute matches the supplied option
 *   - selecting a file invokes app.ui.loadNoiseImageFile with the supplied
 *     idKey/nameKey, then closes the modal
 *   - the existing "Current: <name>" line reflects layer.params[nameKey]
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Image Asset modal (rainfall silhouette / noise image)', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function closeAnyOpenModal() {
    if (app.ui?.modal?.overlay) {
      app.ui.closeModal?.();
    }
  }

  test('openNoiseImageModal renders the rainfall-silhouette scaffold', () => {
    closeAnyOpenModal();
    const fakeLayer = { params: { silhouetteName: 'kitten.png' } };
    app.ui.openNoiseImageModal(fakeLayer, {
      accept: 'image/*',
      idKey: 'silhouetteId',
      nameKey: 'silhouetteName',
      title: 'Select Silhouette Image',
      label: 'Silhouette Image',
      description: 'Drop a PNG/SVG with transparency; rain is generated inside opaque pixels.',
      dropLabel: 'Drop silhouette here',
    });
    const card = document.querySelector('.modal-card');
    expect(card).toBeTruthy();
    expect(card.innerHTML).toContain('Select Silhouette Image');
    expect(card.innerHTML).toContain('Silhouette Image');
    expect(card.innerHTML).toContain('Drop silhouette here');
    expect(card.innerHTML).toContain('Drop a PNG/SVG');
    expect(card.innerHTML).toContain('Current: kitten.png');
    expect(card.querySelector('#noise-dropzone')).toBeTruthy();
    const input = card.querySelector('#noise-file-input');
    expect(input).toBeTruthy();
    expect(input.getAttribute('accept')).toBe('image/*');
    closeAnyOpenModal();
  });

  test('renders "Current: None selected" when layer has no current name', () => {
    closeAnyOpenModal();
    app.ui.openNoiseImageModal({ params: {} }, {
      idKey: 'noiseImageId',
      nameKey: 'noiseImageName',
      title: 'Select Noise Image',
      label: 'Noise Image',
      description: 'Drop an image here.',
      dropLabel: 'Drop image here',
    });
    const card = document.querySelector('.modal-card');
    expect(card.innerHTML).toContain('Current: None selected');
    expect(card.innerHTML).toContain('Select Noise Image');
    closeAnyOpenModal();
  });

  test('selecting a file routes to loadNoiseImageFile with idKey/nameKey, then closes', () => {
    closeAnyOpenModal();
    const seen = { args: null };
    const originalLoad = app.ui.loadNoiseImageFile.bind(app.ui);
    // Spy: capture the args, do not actually decode (FileReader/Image
    // pipeline isn't materialized in JSDOM for synthetic File-like objects).
    app.ui.loadNoiseImageFile = function spyLoad(...args) {
      seen.args = args;
    };

    const fakeLayer = { params: {} };
    app.ui.openNoiseImageModal(fakeLayer, {
      idKey: 'silhouetteId',
      nameKey: 'silhouetteName',
      title: 'X',
      label: 'X',
      description: 'X',
      dropLabel: 'X',
    });
    const overlay = app.ui.modal.overlay;
    expect(overlay.classList.contains('open')).toBe(true);

    const input = document.getElementById('noise-file-input');
    const fakeFile = { name: 'silhouette-test.png' };
    Object.defineProperty(input, 'files', { value: [fakeFile], configurable: true });
    input.onchange();

    // (file, layer, nameEl, idKey, nameKey)
    expect(seen.args).toBeTruthy();
    expect(seen.args[0]).toBe(fakeFile);
    expect(seen.args[1]).toBe(fakeLayer);
    expect(seen.args[3]).toBe('silhouetteId');
    expect(seen.args[4]).toBe('silhouetteName');
    expect(overlay.classList.contains('open')).toBe(false);

    // Restore the real loader so other tests aren't affected.
    app.ui.loadNoiseImageFile = originalLoad;
  });
});
