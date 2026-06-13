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

  // Pop-out / dock toggle glyphs (arrows-out / arrows-in).
  const POPOUT_ICON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9 2h5v5M14 2L9 7M7 14H2V9M2 14l5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const DOCK_ICON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 3l-5 5M8 8V4M8 8h4M3 13l5-5M8 8v4M8 8H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Default top-left for the floating pane the first time it pops out — clear of
  // the left controls panel, near the top of the canvas.
  const popoutDefaultPos = () => ({
    x: Math.min(420, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260),
    y: 96,
  });

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
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (file) {
        window.Vectura.engine.updateLayerParams(layer.id, {
          imageSourceKind: 'imported'
        });
        window.Vectura.engine.updateLayerParams(layer.id, {
          imageNoiseDef: null
        });
        // previewKey 'imageSrc' embeds the data URL for project persistence.
        this.loadNoiseImageFile(file, layer, null, 'imageId', 'imageName', null, 'imageSrc');
      }
      if (input.parentNode) input.parentNode.removeChild(input);
    });
    document.body.appendChild(input);
    input.click();
  }

  function mountImageSourceWidget(layer, wrapper) {
    const render = Render();
    const p = layer.params;
    const presets = Vectura.NOISE_IMAGE_PRESETS || [];

    const root = document.createElement('div');
    root.className = 'image-source-widget mb-4';

    const popout = this._imageSourcePopout || (this._imageSourcePopout = { open: false, x: null, y: null });

    const header = document.createElement('div');
    header.className = 'image-source-header';
    header.innerHTML = `
      <label class="control-label mb-0">Image Source</label>
      <span class="image-source-name text-[10px] text-vectura-muted truncate"></span>
    `;
    const nameEl = header.querySelector('.image-source-name');
    // Pop-out / dock toggle. Flips the floating state and rebuilds, which
    // re-mounts the widget into the floating pane or back inline.
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'image-source-popout-toggle';
    toggleBtn.title = popout.open ? 'Dock image source' : 'Pop out image source';
    toggleBtn.setAttribute('aria-label', toggleBtn.title);
    toggleBtn.innerHTML = popout.open ? DOCK_ICON : POPOUT_ICON;
    toggleBtn.addEventListener("click", () => {
      popout.open = !popout.open;
      if (popout.open && (!Number.isFinite(popout.x) || !Number.isFinite(popout.y))) {
        const d = popoutDefaultPos();
        popout.x = d.x;
        popout.y = d.y;
      }
      this.buildControls();
    });
    header.appendChild(toggleBtn);
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
    actions.querySelector('.is-import').addEventListener("click", () => importImageSource.call(this, layer));
    actions.querySelector('.is-paint').addEventListener("click", () => this.openImagePaintModal(layer));
    root.appendChild(actions);

    // ── Placement: docked inline, or floating over the canvas ────────────────
    if (popout.open) {
      // Floating pane lives on <body> (a fixed overlay) so it survives the left
      // panel being cleared. Re-created fresh each rebuild (the prior one is
      // removed in buildControls' reset), positioned from the saved x/y.
      const pane = document.createElement('div');
      pane.className = 'image-source-popout';
      pane.style.left = `${Number.isFinite(popout.x) ? popout.x : popoutDefaultPos().x}px`;
      pane.style.top = `${Number.isFinite(popout.y) ? popout.y : popoutDefaultPos().y}px`;
      pane.appendChild(root);
      document.body.appendChild(pane);
      this._imageSourcePopoutEl = pane;

      // Drag by the header (ignoring the toggle button). Uses pointer capture so
      // events keep flowing to the handle even while the cursor is over the
      // canvas or other panels (which have their own pointer handlers that would
      // otherwise swallow the move) — letting the pane be placed anywhere in the
      // UI. Clamped only so it can never be dragged fully off-screen.
      header.classList.add('is-drag-handle');
      header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = pane.getBoundingClientRect();
        const baseLeft = rect.left;
        const baseTop = rect.top;
        try { header.setPointerCapture(e.pointerId); } catch (_) { /* older engines */ }
        const move = (ev) => {
          const nx = Math.max(0, Math.min(window.innerWidth - 48, baseLeft + (ev.clientX - startX)));
          const ny = Math.max(0, Math.min(window.innerHeight - 32, baseTop + (ev.clientY - startY)));
          pane.style.left = `${nx}px`;
          pane.style.top = `${ny}px`;
          popout.x = nx;
          popout.y = ny;
        };
        const up = (ev) => {
          try { header.releasePointerCapture(ev.pointerId); } catch (_) { /* no-op */ }
          header.removeEventListener('pointermove', move);
          header.removeEventListener('pointerup', up);
          header.removeEventListener('pointercancel', up);
        };
        header.addEventListener('pointermove', move);
        header.addEventListener('pointerup', up);
        header.addEventListener('pointercancel', up);
      });

      // Inline placeholder left behind in the panel, with a one-click dock.
      const placeholder = document.createElement('div');
      placeholder.className = 'image-source-docked-placeholder mb-4';
      placeholder.innerHTML = '<span class="text-[11px] text-vectura-muted">Image source is floating</span>';
      const dockBtn = document.createElement('button');
      dockBtn.type = 'button';
      dockBtn.className = 'image-source-btn is-dock';
      dockBtn.textContent = 'Dock';
      dockBtn.addEventListener("click", () => { popout.open = false; this.buildControls(); });
      placeholder.appendChild(dockBtn);
      wrapper.appendChild(placeholder);
    } else {
      if (this._imageSourcePopoutEl) {
        this._imageSourcePopoutEl.remove();
        this._imageSourcePopoutEl = null;
      }
      wrapper.appendChild(root);
    }

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
      sw.addEventListener("click", () => {
        toolbar.querySelectorAll('.ip-swatch').forEach((s) => s.classList.remove('is-active'));
        sw.classList.add('is-active');
        paintValue = Number(sw.dataset.v);
      });
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
      btn.addEventListener("click", () => {
        const op = btn.dataset.op;
        if (op === 'soften') softenCanvas();
        else if (op === 'invert') invertCanvas();
        else if (op === 'white') fillSolid(255);
        else if (op === 'black') fillSolid(0);
        else if (op === 'reset') seedFromCurrent();
      });
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
    footer.querySelector('.image-paint-cancel').addEventListener("click", () => this.closeModal());
    footer.querySelector('.image-paint-apply').addEventListener("click", () => {
      if (!ctx || typeof ctx.getImageData !== 'function') { this.closeModal(); return; }
      const data = ctx.getImageData(0, 0, RES, RES);
      const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
      const id = window.Vectura.generateId();
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
    });

    body.appendChild(toolbar);
    // Cancel / Apply sit directly above the preview canvas (not under it) so the
    // commit/dismiss actions stay reachable without scrolling past a tall image.
    body.appendChild(footer);
    body.appendChild(canvasWrap);

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
