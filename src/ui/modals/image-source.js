/**
 * Image Surface — source widget + paint modal.
 *
 * Installs three methods on UI.prototype:
 *   - mountImageSourceWidget(layer, wrapper)
 *       The inline panel control rendered for the imageSurface `imageSource`
 *       control: a live preview of the current height source, a gallery of
 *       preloaded noise images (rendered from the real noise pipeline via
 *       NoiseImageRender), an Import button, and a Paint button.
 *   - openImagePaintModal(layer)
 *       A full-size canvas painting modal. Seeds from the current source, lets
 *       the user brush light/dark, soften, invert, and clear, then bakes the
 *       result into a NOISE_IMAGES raster + an embedded `imageSrc` data URL.
 *   - applyImageSourceNoise / applyImageSourceBuiltin (internal helpers)
 *
 * All three persistent source kinds ('noise' | 'imported' | 'painted' |
 * 'builtin') round-trip through `Vectura.ImageSurfaceSource` so a saved project
 * reopens identically. See src/core/algorithms/image-surface.js.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  const Modals = (UI.Modals = UI.Modals || {});

  const clone = Vectura.Utils.clone;
  // Thumbnails are deterministic per preset, so render once and reuse.
  const thumbCache = Object.create(null);

  const Render = () => Vectura.NoiseImageRender;
  const Source = () => Vectura.ImageSurfaceSource;

  // Resolve the current source as an ImageData-shaped object (or null).
  const currentSourceImage = (p) => {
    const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
    const src = Source();
    if (src && typeof src.ensure === 'function') src.ensure(p);
    if (p.imageId && store[p.imageId]) return store[p.imageId];
    if ((!p.imageNoiseDef && !p.imageSrc) && src && typeof src.renderBuiltinImageData === 'function') {
      return src.renderBuiltinImageData(96);
    }
    return null;
  };

  const presetThumb = (preset) => {
    if (thumbCache[preset.id]) return thumbCache[preset.id];
    const render = Render();
    if (!render) return null;
    const img = render.renderImageData(preset.noise, 64, 64, preset.seed ?? 1);
    thumbCache[preset.id] = img;
    return img;
  };

  // Same chevron the universal preset dropdown uses, so the source picker reads
  // as a sibling of every other preset control in the app.
  const CHEVRON_SVG = `<svg class="hg-preset-chevron" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // The noise rack stack displaces the surface only when an enabled layer exists
  // and the amount is non-zero — gates the noise-aware preview render.
  const noiseActive = (p) =>
    p.noiseAmount > 0 && Array.isArray(p.noises) && p.noises.some((n) => n && n.enabled !== false);

  function applyImageSourceNoise(layer, preset) {
    if (this.app && this.app.pushHistory) this.app.pushHistory();
    const p = layer.params;
    p.imageSourceKind = 'noise';
    p.imageNoiseDef = clone(preset.noise);
    p.imageSeed = preset.seed ?? p.imageSeed ?? 1;
    p.imageName = preset.label;
    p.imageSrc = '';
    p.imageId = '';
    this.storeLayerParams(layer);
    this.app.regen();
    this.app.render();
    this.buildControls();
    if (this.updateFormula) this.updateFormula();
  }

  function applyImageSourceBuiltin(layer) {
    if (this.app && this.app.pushHistory) this.app.pushHistory();
    const p = layer.params;
    p.imageSourceKind = 'builtin';
    p.imageNoiseDef = null;
    p.imageSrc = '';
    p.imageId = '';
    p.imageName = 'Built-in Relief';
    this.storeLayerParams(layer);
    this.app.regen();
    this.app.render();
    this.buildControls();
    if (this.updateFormula) this.updateFormula();
  }

  function importImageSource(layer) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (file) {
        layer.params.imageSourceKind = 'imported';
        layer.params.imageNoiseDef = null;
        // previewKey 'imageSrc' embeds the data URL for project persistence.
        this.loadNoiseImageFile(file, layer, null, 'imageId', 'imageName', null, 'imageSrc');
      }
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  }

  function mountImageSourceWidget(layer, wrapper) {
    const render = Render();
    const p = layer.params;
    const presets = Vectura.NOISE_IMAGE_PRESETS || [];

    const root = document.createElement('div');
    root.className = 'image-source-widget mb-4';

    const header = document.createElement('div');
    header.className = 'image-source-header';
    header.innerHTML = `
      <label class="control-label mb-0">Image Source</label>
      <span class="image-source-name text-[10px] text-vectura-muted truncate"></span>
    `;
    const nameEl = header.querySelector('.image-source-name');
    root.appendChild(header);

    const drawThumbTo = (canvasEl, img) => {
      if (img && render) render.drawToCanvas(canvasEl, img, { fit: true, smooth: true });
    };

    // ── Source preset dropdown (built-in relief + noise images) ───────────────
    // Sits ABOVE the preview and reuses the universal preset gallery's skin
    // classes so it matches every other preset control in the app.
    const matchedPreset = () =>
      presets.find((preset) => p.imageNoiseDef && p.imageNoiseDef.type === preset.noise.type
        && p.imageName === preset.label) || null;
    const currentSourceLabel = () => {
      if (p.imageSrc) return p.imageName || (p.imageSourceKind === 'painted' ? 'Painted' : 'Imported');
      const m = matchedPreset();
      if (m) return m.label;
      if (p.imageNoiseDef) return p.imageName || 'Noise';
      return 'Built-in Relief';
    };

    const ddWrap = document.createElement('div');
    ddWrap.className = 'hg-preset-dropdown-wrap image-source-preset-dropdown';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'hg-preset-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const triggerThumb = document.createElement('canvas');
    triggerThumb.className = 'hg-preset-trigger-thumb';
    triggerThumb.width = 28;
    triggerThumb.height = 28;
    triggerThumb.setAttribute('aria-hidden', 'true');
    trigger.appendChild(triggerThumb);
    const triggerLabel = document.createElement('span');
    triggerLabel.className = 'hg-preset-trigger-label';
    trigger.appendChild(triggerLabel);
    trigger.insertAdjacentHTML('beforeend', CHEVRON_SVG);
    ddWrap.appendChild(trigger);

    const popover = document.createElement('div');
    popover.className = 'hg-preset-popover';
    popover.setAttribute('role', 'listbox');
    popover.hidden = true;
    ddWrap.appendChild(popover);
    root.appendChild(ddWrap);

    let outsideHandler = null;
    const closeDropdown = () => {
      popover.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (outsideHandler) {
        document.removeEventListener('pointerdown', outsideHandler, true);
        outsideHandler = null;
      }
    };
    const openDropdown = () => {
      popover.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      outsideHandler = (e) => { if (!ddWrap.contains(e.target)) closeDropdown(); };
      document.addEventListener('pointerdown', outsideHandler, true);
    };
    trigger.addEventListener('click', () => { if (popover.hidden) openDropdown(); else closeDropdown(); });

    const makeOption = (label, active, imgFactory, onClick) => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'hg-preset-option image-source-option' + (active ? ' is-active' : '');
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-selected', active ? 'true' : 'false');
      const thumb = document.createElement('canvas');
      thumb.className = 'hg-preset-option-thumb';
      thumb.width = 28;
      thumb.height = 28;
      thumb.setAttribute('aria-hidden', 'true');
      opt.appendChild(thumb);
      const lbl = document.createElement('span');
      lbl.className = 'hg-preset-option-label';
      lbl.textContent = label;
      opt.appendChild(lbl);
      drawThumbTo(thumb, imgFactory());
      opt.addEventListener('click', () => { closeDropdown(); onClick(); });
      popover.appendChild(opt);
    };

    const activePreset = matchedPreset();
    makeOption(
      'Built-in Relief',
      !p.imageNoiseDef && !p.imageSrc,
      () => (Source() && Source().renderBuiltinImageData ? Source().renderBuiltinImageData(64) : null),
      () => applyImageSourceBuiltin.call(this, layer),
    );
    presets.forEach((preset) => {
      makeOption(
        preset.label,
        activePreset === preset,
        () => presetThumb(preset),
        () => applyImageSourceNoise.call(this, layer, preset),
      );
    });

    const updateTrigger = () => {
      triggerLabel.textContent = currentSourceLabel();
      const img = currentSourceImage(p);
      if (img && render) {
        triggerThumb.style.display = '';
        drawThumbTo(triggerThumb, img);
      } else {
        triggerThumb.style.display = 'none';
      }
    };

    // Live preview of the active source.
    const previewWrap = document.createElement('div');
    previewWrap.className = 'image-source-preview';
    const preview = document.createElement('canvas');
    preview.width = 132;
    preview.height = 132;
    previewWrap.appendChild(preview);
    root.appendChild(previewWrap);

    const drawPreview = () => {
      nameEl.textContent = p.imageName || 'Built-in Relief';
      const ctx = preview.getContext && preview.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, preview.width, preview.height);
      const src = Source();
      // When the noise stack is live, render the resolved height field (base +
      // noise) so the preview matches the 3D model; otherwise show the raw
      // source raster as before.
      const img = (noiseActive(p) && src && typeof src.renderPreviewRaster === 'function')
        ? src.renderPreviewRaster(p, preview.width, preview.height)
        : currentSourceImage(p);
      if (img && render) {
        render.drawToCanvas(preview, img, { fit: true, smooth: true });
      } else if (p.imageSrc) {
        // Source still decoding (fresh reload of a painted/imported layer).
        const im = new Image();
        im.onload = () => {
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(im, 0, 0, preview.width, preview.height);
        };
        im.src = p.imageSrc;
      }
      updateTrigger();
    };

    // Action buttons.
    const actions = document.createElement('div');
    actions.className = 'image-source-actions';
    actions.innerHTML = `
      <button type="button" class="image-source-btn is-import">Import</button>
      <button type="button" class="image-source-btn is-paint">Paint</button>
    `;
    actions.querySelector('.is-import').onclick = () => importImageSource.call(this, layer);
    actions.querySelector('.is-paint').onclick = () => this.openImagePaintModal(layer);
    root.appendChild(actions);

    wrapper.appendChild(root);
    drawPreview();
    // Live-refresh the preview after every param edit (app.regen fires this
    // hook), so dragging Noise Amount or editing the stack updates the
    // thumbnail in lock-step with the model. Cleared on each buildControls.
    this._activeImageSourceRefresh = drawPreview;
  }

  // ---------------------------------------------------------------------------
  // Paint modal.
  // ---------------------------------------------------------------------------

  function openImagePaintModal(layer) {
    const render = Render();
    const src = Source();
    const p = layer.params;
    const RES = (src && src.SOURCE_RES) || 384;

    const body = document.createElement('div');
    body.className = 'image-paint-modal';

    const canvas = document.createElement('canvas');
    canvas.width = RES;
    canvas.height = RES;
    canvas.className = 'image-paint-canvas';
    const ctx = canvas.getContext('2d');

    // Seed from the current source, or white if none.
    const seedFromCurrent = () => {
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, RES, RES);
      const img = currentSourceImage(p);
      if (img && render) render.drawToCanvas(canvas, img, { fit: true, smooth: true });
    };
    seedFromCurrent();

    let brush = 36;
    let paintValue = 0; // 0 = black, 255 = white
    let painting = false;

    const toolbar = document.createElement('div');
    toolbar.className = 'image-paint-toolbar';
    toolbar.innerHTML = `
      <div class="image-paint-row">
        <span class="image-paint-cap">Paint</span>
        <button type="button" class="ip-swatch is-active" data-v="0" style="background:#000"></button>
        <button type="button" class="ip-swatch" data-v="128" style="background:#808080"></button>
        <button type="button" class="ip-swatch" data-v="255" style="background:#fff"></button>
      </div>
      <div class="image-paint-row">
        <span class="image-paint-cap">Brush</span>
        <input type="range" class="ip-brush" min="4" max="160" step="1" value="36" />
        <span class="ip-brush-val text-[10px] text-vectura-muted">36</span>
      </div>
      <div class="image-paint-row image-paint-ops">
        <button type="button" class="ip-op" data-op="soften">Soften</button>
        <button type="button" class="ip-op" data-op="invert">Invert</button>
        <button type="button" class="ip-op" data-op="white">Clear White</button>
        <button type="button" class="ip-op" data-op="black">Clear Black</button>
        <button type="button" class="ip-op" data-op="reset">From Source</button>
      </div>
    `;

    toolbar.querySelectorAll('.ip-swatch').forEach((sw) => {
      sw.onclick = () => {
        toolbar.querySelectorAll('.ip-swatch').forEach((s) => s.classList.remove('is-active'));
        sw.classList.add('is-active');
        paintValue = Number(sw.dataset.v);
      };
    });
    const brushInput = toolbar.querySelector('.ip-brush');
    const brushVal = toolbar.querySelector('.ip-brush-val');
    brushInput.oninput = () => {
      brush = Number(brushInput.value);
      brushVal.textContent = String(brush);
    };

    const softenCanvas = () => {
      if (!ctx) return;
      const tmp = document.createElement('canvas');
      tmp.width = RES;
      tmp.height = RES;
      const tctx = tmp.getContext('2d');
      if (!tctx) return;
      tctx.drawImage(canvas, 0, 0);
      if ('filter' in ctx) ctx.filter = 'blur(2px)';
      ctx.drawImage(tmp, 0, 0);
      if ('filter' in ctx) ctx.filter = 'none';
    };
    const invertCanvas = () => {
      if (!ctx || typeof ctx.getImageData !== 'function') return;
      const id = ctx.getImageData(0, 0, RES, RES);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(id, 0, 0);
    };
    const fillSolid = (v) => {
      if (!ctx) return;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, 0, RES, RES);
    };
    toolbar.querySelectorAll('.ip-op').forEach((btn) => {
      btn.onclick = () => {
        const op = btn.dataset.op;
        if (op === 'soften') softenCanvas();
        else if (op === 'invert') invertCanvas();
        else if (op === 'white') fillSolid(255);
        else if (op === 'black') fillSolid(0);
        else if (op === 'reset') seedFromCurrent();
      };
    });

    // Brush painting.
    const paintAt = (clientX, clientY) => {
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / (rect.width || 1)) * RES;
      const y = ((clientY - rect.top) / (rect.height || 1)) * RES;
      ctx.fillStyle = `rgb(${paintValue},${paintValue},${paintValue})`;
      ctx.beginPath();
      ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
      ctx.fill();
    };
    canvas.addEventListener('pointerdown', (e) => {
      painting = true;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      paintAt(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (painting) paintAt(e.clientX, e.clientY);
    });
    const endPaint = () => { painting = false; };
    canvas.addEventListener('pointerup', endPaint);
    canvas.addEventListener('pointerleave', endPaint);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'image-paint-canvas-wrap';
    canvasWrap.appendChild(canvas);

    const footer = document.createElement('div');
    footer.className = 'image-paint-footer';
    footer.innerHTML = `
      <button type="button" class="image-paint-cancel">Cancel</button>
      <button type="button" class="image-paint-apply">Apply</button>
    `;
    footer.querySelector('.image-paint-cancel').onclick = () => this.closeModal();
    footer.querySelector('.image-paint-apply').onclick = () => {
      if (!ctx || typeof ctx.getImageData !== 'function') { this.closeModal(); return; }
      const data = ctx.getImageData(0, 0, RES, RES);
      const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
      const id = `imgsrc-paint-${Date.now().toString(36)}-${Math.round(p.amplitude || 0)}`;
      store[id] = { width: data.width, height: data.height, data: data.data };
      if (this.app && this.app.pushHistory) this.app.pushHistory();
      p.imageSourceKind = 'painted';
      p.imageNoiseDef = null;
      p.imageName = 'Painted';
      p.imageId = id;
      // Embed a data URL for project persistence. Guard the encode — some
      // headless/locked-down canvas contexts throw on toDataURL; the painted
      // raster still works for this session via NOISE_IMAGES[id].
      let dataUrl = '';
      try {
        if (typeof canvas.toDataURL === 'function') dataUrl = canvas.toDataURL('image/png');
      } catch (_) { dataUrl = ''; }
      p.imageSrc = dataUrl;
      this.storeLayerParams(layer);
      this.app.regen();
      this.app.render();
      this.buildControls();
      if (this.updateFormula) this.updateFormula();
      this.closeModal();
    };

    body.appendChild(toolbar);
    body.appendChild(canvasWrap);
    body.appendChild(footer);

    this.openModal({ title: 'Paint Image Source', body, cardClass: 'modal-card--paint' });
  }

  Modals.ImageSource = {
    bind(deps) { this._deps = deps || {}; },
    mountImageSourceWidget,
    openImagePaintModal,
    installOn(proto) {
      proto.mountImageSourceWidget = function (layer, wrapper) {
        return mountImageSourceWidget.call(this, layer, wrapper);
      };
      proto.openImagePaintModal = function (layer) {
        return openImagePaintModal.call(this, layer);
      };
      proto.applyImageSourceNoise = function (layer, preset) {
        return applyImageSourceNoise.call(this, layer, preset);
      };
      proto.applyImageSourceBuiltin = function (layer) {
        return applyImageSourceBuiltin.call(this, layer);
      };
    },
  };
})();
