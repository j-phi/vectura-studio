/*
 * TUX-055: failure branches of the image import path, plus the pure sizing helper.
 * jsdom never decodes images, so only the environment is stubbed (Image, canvas
 * getContext, FileReader). The size cap itself is proven in the real-engine e2e
 * spec tests/e2e/touch/image-import.spec.js, never here.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('image import failure branches (TUX-055)', () => {
  let runtime, window, document, app;
  let origImage, origGetContext, origFileReader, origToDataURL;

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

  beforeEach(() => {
    origImage = window.Image;
    origGetContext = window.HTMLCanvasElement.prototype.getContext;
    origToDataURL = window.HTMLCanvasElement.prototype.toDataURL;
    origFileReader = window.FileReader;
    document.querySelectorAll('.vectura-toast').forEach((n) => n.remove());
  });

  afterEach(() => {
    window.Image = origImage;
    window.HTMLCanvasElement.prototype.getContext = origGetContext;
    window.FileReader = origFileReader;
    window.HTMLCanvasElement.prototype.toDataURL = origToDataURL;
  });

  const stubImage = ({ fail = false } = {}) => {
    window.Image = class {
      set src(v) {
        this._src = v;
        if (!v) return;
        this.naturalWidth = 8000;
        this.naturalHeight = 6000;
        setTimeout(() => (fail ? this.onerror && this.onerror(new window.Event('error')) : this.onload && this.onload()), 0);
      }
      get src() { return this._src; }
    };
  };

  const run = async (setup) => {
    const layer = { params: { silhouetteId: 'keep-id', silhouetteName: 'keep.png', imageSrc: 'data:old' } };
    const keysBefore = Object.keys(window.Vectura.NOISE_IMAGES || {});
    let pushes = 0;
    const origPush = app.pushHistory;
    app.pushHistory = (...a) => { pushes += 1; return origPush && origPush.apply(app, a); };
    setup();
    const file = new window.File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    app.ui.loadNoiseImageFile(file, layer, null, 'silhouetteId', 'silhouetteName', null, 'imageSrc');
    const toastSel = '.vectura-toast-danger';
    for (let i = 0; i < 60 && !document.querySelector(toastSel); i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    await new Promise((r) => setTimeout(r, 30));
    app.pushHistory = origPush;
    const toast = document.querySelector(toastSel);
    expect(toast).toBeTruthy();
    expect(toast.textContent).toMatch(/image/i);
    expect(document.querySelectorAll(toastSel)).toHaveLength(1);
    expect(pushes).toBe(0);
    expect(layer.params.silhouetteId).toBe('keep-id');
    expect(layer.params.silhouetteName).toBe('keep.png');
    // A failed import must never leave the previous picture's preview paired with a new raster.
    expect(layer.params.imageSrc).toBe('data:old');
    expect(Object.keys(window.Vectura.NOISE_IMAGES || {})).toEqual(keysBefore);
  };

  test('null canvas context shows the toast and changes nothing', async () => {
    await run(() => {
      stubImage();
      window.HTMLCanvasElement.prototype.getContext = () => null;
    });
  });

  test('image decode error shows the toast and changes nothing', async () => {
    await run(() => { stubImage({ fail: true }); });
  });

  test('getImageData throwing shows the toast and changes nothing', async () => {
    await run(() => {
      stubImage();
      window.HTMLCanvasElement.prototype.getContext = () => ({
        drawImage() {},
        getImageData() { throw new Error('SecurityError'); },
      });
    });
  });

  test('preview re-encode throwing on a scaled import fails the whole import', async () => {
    await run(() => {
      stubImage();
      window.HTMLCanvasElement.prototype.getContext = () => ({
        drawImage() {},
        getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(4) }),
      });
      window.HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('toDataURL failed'); };
    });
  });

  test('FileReader error shows the toast and changes nothing', async () => {
    await run(() => {
      window.FileReader = class {
        readAsDataURL() { setTimeout(() => this.onerror && this.onerror(new window.Event('error')), 0); }
      };
    });
  });
});

describe('ImageSource.cappedSize', () => {
  let runtime;
  let IS;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    IS = runtime.window.Vectura.ImageSource;
  });
  afterAll(() => runtime?.cleanup?.());

  test('constant is 2048', () => { expect(IS.MAX_IMPORT_SIDE).toBe(2048); });
  test('8000x6000 -> 2048x1536', () => {
    expect(IS.cappedSize(8000, 6000, 2048)).toMatchObject({ w: 2048, h: 1536 });
  });
  test('6000x8000 -> 1536x2048', () => {
    expect(IS.cappedSize(6000, 8000, 2048)).toMatchObject({ w: 1536, h: 2048 });
  });
  test('1000x800 unchanged, scale 1', () => {
    expect(IS.cappedSize(1000, 800, 2048)).toEqual({ w: 1000, h: 800, scale: 1 });
  });
  test('4097x1 -> 2048x1', () => {
    expect(IS.cappedSize(4097, 1, 2048)).toMatchObject({ w: 2048, h: 1 });
  });
});
