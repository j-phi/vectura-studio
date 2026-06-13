/**
 * Vectura image-asset modal (Phase 3 step 4 — second modal).
 *
 * Exposes window.Vectura.UI.Modals.ImageAsset — the generic image-picker
 * modal that powers every image-typed control in Vectura. Two primary use
 * sites today (the task spec called this the "Rainfall Silhouette modal"
 * because that is its most-prominent invocation):
 *
 *   1. Rainfall silhouette (`silhouetteId` control on the rainfall algorithm
 *      panel — see src/ui/controls-registry.js:1078). User drops or browses a
 *      PNG/SVG; the rainfall renderer samples opaque pixels.
 *   2. Noise image source for the universal noise rack (`imageId` control
 *      inside each noise stack — see src/ui/ui-noise-rack.js:1720).
 *
 * Both call sites compose the same `loadNoiseImageFile` + `openNoiseImageModal`
 * primitives. The module preserves both method names for API compatibility:
 * `algo-config-panel.js` and `ui-noise-rack.js` consumers all still resolve.
 *
 * Methods exposed:
 *   - openNoiseImageModal(layer, options)
 *       Opens the centered overlay with a drop zone + file input. options:
 *       `{ nameEl, accept, idKey, nameKey, title, label, description,
 *          dropLabel }`. On file select, calls `this.loadNoiseImageFile`
 *       with the same idKey/nameKey, then closes.
 *   - loadNoiseImageFile(file, layer, nameEl, idKey, nameKey, target, previewKey)
 *       Reads the file as a data URL, decodes it into a canvas, snapshots
 *       the ImageData into `window.Vectura.NOISE_IMAGES[id]`, mutates the
 *       layer params (or `target` if provided — used by the noise rack so
 *       the per-stack noise descriptor receives the id, not the layer
 *       params), pushes history, regenerates + renders + rebuilds controls.
 *
 * The legacy UI prototype delegates both methods to this module via 1-line
 * pass-throughs. Compose pattern: this module composes `this.openModal`
 * (centered overlay) and `this.loadNoiseImageFile` for the modal lifecycle,
 * and pushes history via `this.app.pushHistory`. It does NOT compose
 * src/ui/overlays/drag-drop.js (the page-level overlay primitive) — this is
 * a per-modal mini drop zone that shares no state with the page overlay.
 *
 * DI bag: { storeLayerParams }
 *   - `storeLayerParams` is a UI.prototype method already; it's referenced
 *     here for forward-compatibility documentation but the module accesses
 *     it via `this.storeLayerParams(layer)` (no closure dep). The DI bag
 *     stays empty in practice — every dep is on `this`.
 *
 * Compile gate at tests/unit/modals/image-asset-compile.test.js.
 * Lifecycle test at tests/integration/modals/image-asset.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  const Modals = UI.Modals = UI.Modals || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(
        `ImageAsset.${name} invoked before ImageAsset.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  function loadNoiseImageFile(
    file,
    layer,
    nameEl,
    idKey = 'noiseImageId',
    nameKey = 'noiseImageName',
    target = null,
    previewKey = ''
  ) {
    requireDeps('loadNoiseImageFile');
    if (!file || !layer) return;
    const reader = new FileReader();
    reader.onload = () => {
      const preview = reader.result;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
        const id = window.Vectura.generateId();
        store[id] = { width: data.width, height: data.height, data: data.data };
        if (this.app.pushHistory) this.app.pushHistory();
        const owner = target || layer.params;
        if (!owner) return;
        owner[idKey] = id;
        owner[nameKey] = file.name;
        if (target && target.type === 'image') {
          owner.zoom = 0.02;
          owner.imageWidth = owner.imageWidth ?? 1;
          owner.imageHeight = owner.imageHeight ?? 1;
          owner.shiftX = owner.shiftX ?? 0;
          owner.shiftY = owner.shiftY ?? 0;
        }
        if (previewKey) owner[previewKey] = preview;
        if (nameEl) nameEl.textContent = file.name;
        this.storeLayerParams(layer);
        this.app.regen();
        this.app.render();
        this.buildControls();
        this.updateFormula();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function openNoiseImageModal(layer, options = {}) {
    requireDeps('openNoiseImageModal');
    const {
      nameEl,
      accept = 'image/*',
      idKey = 'noiseImageId',
      nameKey = 'noiseImageName',
      title = 'Select Noise Image',
      label = 'Noise Image',
      description = 'Drop an image here or browse to select a PNG/JPG for noise sampling.',
      dropLabel = 'Drop image here',
    } = options;
    const current = layer?.params?.[nameKey] || 'None selected';
    const body = `
      <div class="modal-section">
        <div class="modal-ill-label">${label}</div>
        <div class="modal-text text-xs text-vectura-muted mb-3">
          ${description}
        </div>
        <div id="noise-dropzone" class="noise-dropzone">${dropLabel}</div>
        <div class="flex items-center justify-between mt-3 gap-3">
          <label class="text-xs text-vectura-muted">Browse</label>
          <input id="noise-file-input" type="file" accept="${accept}" class="text-[10px] text-vectura-muted" />
        </div>
        <div class="text-[10px] text-vectura-muted mt-3">Current: ${current}</div>
      </div>
    `;
    this.openModal({ title, body });
    const bodyEl = this.modal.bodyEl;
    const dropzone = bodyEl.querySelector('#noise-dropzone');
    const fileInput = bodyEl.querySelector('#noise-file-input');
    const handleFile = (file) => {
      if (!file) return;
      this.loadNoiseImageFile(file, layer, nameEl, idKey, nameKey);
      this.closeModal();
    };
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('active');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('active');
        const file = e.dataTransfer?.files?.[0];
        handleFile(file);
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        handleFile(file);
      });
    }
  }

  Modals.ImageAsset = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - empty bag (every dep is on `this`).
     */
    bind(deps) {
      DEPS = deps || {};
    },
    openNoiseImageModal,
    loadNoiseImageFile,
    installOn(proto) {
      proto.openNoiseImageModal = function(layer, options) { return openNoiseImageModal.call(this, layer, options); };
      proto.loadNoiseImageFile = function(...args) { return loadNoiseImageFile.apply(this, args); };
    },
  };
})();
