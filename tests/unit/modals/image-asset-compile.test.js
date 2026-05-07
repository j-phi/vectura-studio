/*
 * Compile gate for src/ui/modals/image-asset.js (Phase 3 step 4 — second modal).
 *
 * Verifies the image-asset module:
 *   - registers as window.Vectura.UI.Modals.ImageAsset
 *   - exposes bind() + openNoiseImageModal + loadNoiseImageFile
 *   - throws a clear error if either method runs before bind()
 *   - openNoiseImageModal composes this.openModal() with the supplied
 *     title/label/description/dropLabel and the expected dropzone + file
 *     input scaffold
 *   - "Current: <name>" reads from layer.params[nameKey], falling back to
 *     "None selected"
 *   - the file input's onchange handler routes through this.loadNoiseImageFile
 *     with the supplied idKey + nameKey, then closes
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('image-asset compile gate', () => {
  let dom;
  let ImageAsset;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/modals/image-asset.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    ImageAsset = w.Vectura.UI.Modals.ImageAsset;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.ImageAsset with bind + both method exports', () => {
    expect(ImageAsset).toBeTruthy();
    expect(typeof ImageAsset.bind).toBe('function');
    expect(typeof ImageAsset.openNoiseImageModal).toBe('function');
    expect(typeof ImageAsset.loadNoiseImageFile).toBe('function');
  });

  it('openNoiseImageModal throws a clear error before bind()', () => {
    expect(() => ImageAsset.openNoiseImageModal.call({}, {}))
      .toThrow(/ImageAsset\.openNoiseImageModal invoked before ImageAsset\.bind/);
  });

  it('loadNoiseImageFile throws a clear error before bind()', () => {
    expect(() => ImageAsset.loadNoiseImageFile.call({}, null, null))
      .toThrow(/ImageAsset\.loadNoiseImageFile invoked before ImageAsset\.bind/);
  });

  it('after bind(), openNoiseImageModal composes openModal with the rainfall-silhouette wording', () => {
    ImageAsset.bind({});

    let lastCall = null;
    const stub = {
      modal: { bodyEl: dom.window.document.createElement('div') },
      openModal(opts) {
        lastCall = opts;
        this.modal.bodyEl.innerHTML = opts.body;
      },
      closeModal() {},
      loadNoiseImageFile() {},
    };

    ImageAsset.openNoiseImageModal.call(
      stub,
      { params: { silhouetteName: 'puppy.png' } },
      {
        idKey: 'silhouetteId',
        nameKey: 'silhouetteName',
        title: 'Select Silhouette Image',
        label: 'Silhouette Image',
        description: 'Drop a PNG/SVG with transparency; rain is generated inside opaque pixels.',
        dropLabel: 'Drop silhouette here',
      },
    );

    expect(lastCall).toBeTruthy();
    expect(lastCall.title).toBe('Select Silhouette Image');
    expect(lastCall.body).toContain('Silhouette Image');
    expect(lastCall.body).toContain('Drop silhouette here');
    expect(lastCall.body).toContain('Drop a PNG/SVG with transparency');
    // Current name pulled from layer.params[nameKey]
    expect(lastCall.body).toContain('Current: puppy.png');
    expect(lastCall.body).toContain('id="noise-dropzone"');
    expect(lastCall.body).toContain('id="noise-file-input"');
  });

  it('falls back to "None selected" when layer.params[nameKey] is missing', () => {
    let lastCall = null;
    const stub = {
      modal: { bodyEl: dom.window.document.createElement('div') },
      openModal(opts) { lastCall = opts; this.modal.bodyEl.innerHTML = opts.body; },
      closeModal() {},
      loadNoiseImageFile() {},
    };
    ImageAsset.openNoiseImageModal.call(stub, { params: {} }, {
      title: 'X',
      label: 'X',
      description: 'X',
      dropLabel: 'X',
    });
    expect(lastCall.body).toContain('Current: None selected');
  });

  it('file input onchange routes to this.loadNoiseImageFile with the supplied keys, then closes', () => {
    const seen = { args: null, closed: 0 };
    const stub = {
      modal: { bodyEl: dom.window.document.createElement('div') },
      openModal(opts) { this.modal.bodyEl.innerHTML = opts.body; },
      closeModal() { seen.closed += 1; },
      loadNoiseImageFile(...args) { seen.args = args; },
    };
    ImageAsset.openNoiseImageModal.call(stub, { params: {} }, {
      idKey: 'silhouetteId',
      nameKey: 'silhouetteName',
      title: 'X',
      label: 'X',
      description: 'X',
      dropLabel: 'X',
    });

    const fileInput = stub.modal.bodyEl.querySelector('#noise-file-input');
    expect(fileInput).toBeTruthy();
    // Define a fake `files` getter so the onchange can read it.
    const fakeFile = { name: 'fake.png' };
    Object.defineProperty(fileInput, 'files', { value: [fakeFile], configurable: true });
    fileInput.onchange?.();

    expect(seen.args).toBeTruthy();
    // (file, layer, nameEl, idKey, nameKey)
    expect(seen.args[0]).toBe(fakeFile);
    expect(seen.args[3]).toBe('silhouetteId');
    expect(seen.args[4]).toBe('silhouetteName');
    expect(seen.closed).toBe(1);
  });
});
