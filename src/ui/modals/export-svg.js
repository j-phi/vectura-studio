/**
 * Vectura Export SVG modal (Phase 3 step 5 — final modal extraction).
 *
 * Exposes window.Vectura.UI.Modals.ExportSvg — the largest extracted modal in
 * Phase 3. Owns `openExportModal` plus eight supporting prototype-callable
 * methods (preview pipeline, optimization-controls decoration, line-sort
 * legend wiring, info-button attach pipeline, scoped path/clip preview
 * helpers).
 *
 * The actual SVG-building / Blob-download code lives in `src/ui/ui-file-io.js`
 * (`exportSVG`) — that satellite is unchanged. This module composes
 * `this.exportSVG()` for the Submit handler and `this.app.engine` /
 * `this.app.renderer` for the canvas preview pipeline; engine/renderer logic
 * is NOT duplicated.
 *
 * Methods exposed (each delegated by a 1-line UI.prototype passthrough in
 * `_ui-legacy.js`):
 *   - openExportModal()                — opens the centered overlay modal,
 *                                        moves #optimization-controls into the
 *                                        modal's settings-scroll pane, wires
 *                                        pan/zoom/legend/preview-mode handlers,
 *                                        calls this.openModal() with the body.
 *   - fitExportPreview()               — fits canvas viewport to paper size.
 *   - resizeExportPreviewCanvas()      — handles ResizeObserver / DPR redraw.
 *   - renderExportPreview()            — draws paper + paths + line-sort
 *                                        overlay/replace/off previews.
 *   - decorateExportControlsPanel()    — restructures #optimization-controls
 *                                        into Export Settings / Optimization
 *                                        / Stats sections; runs once per open.
 *   - syncLegendSettingsControls(root) — refreshes the legend gear-pane pills
 *                                        (start color, end color, thickness).
 *   - attachExportInfoButtons(panel)   — adds the per-step / per-control
 *                                        "i" info toggles to the optimization
 *                                        controls panel.
 *   - buildExportPreviewPath(ctx, path, useCurves, sharpEdges)
 *                                       — preview-canvas analog of the SVG
 *                                        path emitter.
 *   - buildExportClipPolygons(ctx, polygons)
 *                                       — preview-canvas mask clip path
 *                                        builder.
 *
 * DI bag: { getEl, SETTINGS, clamp, getThemeToken, getContrastTextColor,
 *           EXPORT_INFO, OPTIMIZATION_STEPS, openColorPickerAnchoredTo }
 *
 * Compile gate at tests/unit/modals/export-svg-compile.test.js.
 * Lifecycle test at tests/integration/modals/export-svg.test.js.
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
        `ExportSvg.${name} invoked before ExportSvg.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  function buildExportPreviewPath(ctx, path, useCurves, sharpEdges = false) {
    requireDeps('buildExportPreviewPath');
    if (path?.meta?.kind === 'circle') {
      const meta = path.meta;
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const rx = meta.rx ?? meta.r;
      const ry = meta.ry ?? meta.r;
      const rotation = meta.rotation ?? 0;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
      ctx.moveTo(cx + rx, cy);
      if (Math.abs(rx - ry) < 0.001) ctx.arc(cx, cy, rx, 0, Math.PI * 2);
      else ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
      return;
    }
    if (!Array.isArray(path) || path.length < 2) return;
    ctx.moveTo(path[0].x, path[0].y);
    if (!useCurves || path.length < 3) {
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      return;
    }
    for (let i = 1; i < path.length - 1; i++) {
      if (sharpEdges && path[i]._tileEdge) {
        ctx.lineTo(path[i].x, path[i].y);
      } else {
        const midX = (path[i].x + path[i + 1].x) / 2;
        const midY = (path[i].y + path[i + 1].y) / 2;
        ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY);
      }
    }
    const last = path[path.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function buildExportClipPolygons(ctx, polygons) {
    requireDeps('buildExportClipPolygons');
    (polygons || []).forEach((polygon) => {
      if (!Array.isArray(polygon) || polygon.length < 3) return;
      ctx.moveTo(polygon[0].x, polygon[0].y);
      for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
      ctx.closePath();
    });
  }

  function fitExportPreview() {
    requireDeps('fitExportPreview');
    const state = this.exportModalState;
    if (!state?.canvas || !state?.wrap) return;
    const rect = state.wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const snapshot = this.getExportSnapshot();
    const padding = 36;
    const scale = Math.min(
      (rect.width - padding * 2) / Math.max(1, snapshot.prof.width),
      (rect.height - padding * 2) / Math.max(1, snapshot.prof.height)
    );
    state.view.scale = Math.max(0.1, scale);
    state.view.offsetX = (rect.width - snapshot.prof.width * state.view.scale) / 2;
    state.view.offsetY = (rect.height - snapshot.prof.height * state.view.scale) / 2;
    this.renderExportPreview();
  }

  function resizeExportPreviewCanvas() {
    requireDeps('resizeExportPreviewCanvas');
    const state = this.exportModalState;
    if (!state?.canvas || !state?.wrap) return;
    const rect = state.wrap.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;
    state.canvas.width = Math.round(width * dpr);
    state.canvas.height = Math.round(height * dpr);
    state.canvas.style.width = `${width}px`;
    state.canvas.style.height = `${height}px`;
    if (typeof state.ctx.setTransform === 'function') state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    else if (typeof state.ctx.scale === 'function') state.ctx.scale(dpr, dpr);
    if (!state.view.initialized) {
      state.view.initialized = true;
      this.fitExportPreview();
      return;
    }
    this.renderExportPreview();
  }

  function renderExportPreview() {
    const { SETTINGS, getThemeToken } = requireDeps('renderExportPreview');
    const state = this.exportModalState;
    if (!state?.ctx || !state?.canvas) return;
    const snapshot = this.getExportSnapshot();
    const ctx = state.ctx;
    const width = state.canvas.width / (window.devicePixelRatio || 1);
    const height = state.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getThemeToken('--color-workspace', '#121214');
    ctx.fillRect(0, 0, width, height);

    const { scale, offsetX, offsetY } = state.view;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.fillStyle = SETTINGS.bgColor || '#ffffff';
    ctx.shadowColor = getThemeToken('--render-shadow', 'rgba(0,0,0,0.5)');
    ctx.shadowBlur = 20 / Math.max(scale, 0.001);
    ctx.fillRect(0, 0, snapshot.prof.width, snapshot.prof.height);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = getThemeToken('--render-paper-outline', '#333333');
    ctx.lineWidth = 1 / Math.max(scale, 0.001);
    ctx.strokeRect(0, 0, snapshot.prof.width, snapshot.prof.height);

    const items = snapshot.groups.flatMap((group) => group.items.map((item) => ({ ...item, group })));
    const previewMode = state.previewMode || 'overlay';
    const renderer = this.app.renderer;
    const hasLineSort = items.some((item) => renderer?.hasLineSortOrderMetadata?.(item.path));
    const lineSortLayers = Array.from(new Set(items.map((item) => item.layer))).filter(Boolean);
    const overlayColor = state.overlayColor || SETTINGS.optimizationOverlayColor || '#38bdf8';
    const baseRgb = renderer?.hexToRgb?.(overlayColor) || { r: 56, g: 189, b: 248 };
    const secondary = state.lineSortSecondaryColor || renderer?.getLineSortOverlaySecondaryColor?.(lineSortLayers);
    const endRgb = secondary
      ? renderer?.hexToRgb?.(secondary)
      : renderer?.getComplementRgb?.(baseRgb);
    const orderedItems = items
      .filter((item) => Number.isFinite(item?.path?.meta?.lineSortOrder))
      .sort((a, b) => a.path.meta.lineSortOrder - b.path.meta.lineSortOrder);
    const colorForOrder = (index) => {
      if (!orderedItems.length || !renderer?.mixRgb || !renderer?.rgbToCss) return overlayColor;
      const total = Math.max(1, orderedItems.length - 1);
      const mixed = renderer.mixRgb(baseRgb, endRgb || baseRgb, index / total);
      return renderer.rgbToCss(mixed, 0.92);
    };

    const drawItem = (item, strokeStyle, options = {}) => {
      const alpha = options.alpha ?? 1;
      const lineWidth = options.lineWidth ?? parseFloat(item.strokeWidth || SETTINGS.strokeWidth || 0.3);
      const clipPolygons = (item.ancestorClipLayerIds || [])
        .flatMap((layerId) => snapshot.clipPolygonsByLayerId.get(layerId) || []);
      ctx.save();
      if (clipPolygons.length) {
        ctx.beginPath();
        this.buildExportClipPolygons(ctx, clipPolygons);
        ctx.clip();
      }
      ctx.beginPath();
      this.buildExportPreviewPath(ctx, item.path, item.useCurves, item.sharpEdges);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = item.lineCap || 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    };

    if (previewMode !== 'replace') {
      items.forEach((item) => drawItem(item, item.strokeColor, { alpha: previewMode === 'overlay' ? 0.9 : 1 }));
    }
    if (previewMode === 'replace') {
      if (orderedItems.length) {
        orderedItems.forEach((item, index) => drawItem(item, colorForOrder(index)));
      } else {
        items.forEach((item) => drawItem(item, item.strokeColor));
      }
    } else if (previewMode === 'overlay' && orderedItems.length) {
      const overlayWidth = Math.max(0.05, state.overlayWidth ?? SETTINGS.optimizationOverlayWidth ?? 0.2);
      orderedItems.forEach((item, index) => drawItem(item, colorForOrder(index), { lineWidth: overlayWidth, alpha: 0.92 }));
    }
    ctx.restore();

    const showLegend = Boolean(hasLineSort && orderedItems.length > 1 && previewMode !== 'off');
    if (state.legend) state.legend.classList.toggle('hidden', !showLegend);
    if (showLegend && state.legendGradient && renderer?.rgbToCss) {
      state.legendGradient.style.background = `linear-gradient(90deg, ${renderer.rgbToCss(baseRgb, 1)}, ${renderer.rgbToCss(endRgb || baseRgb, 1)})`;
    }
    if (state.status) {
      state.status.textContent = `${previewMode === 'off' ? 'Plain export preview' : `Preview: ${previewMode}`}`;
    }
  }

  function decorateExportControlsPanel() {
    const { getEl } = requireDeps('decorateExportControlsPanel');
    const panel = getEl('optimization-controls')?.querySelector('.optimization-panel');
    if (!panel || panel.dataset.exportDecorated === 'true') return;
    const rows = Array.from(panel.querySelectorAll(':scope > .optimization-row'));
    const actions = panel.querySelector(':scope > .optimization-actions');
    const stats = panel.querySelector(':scope > .optimization-stats');
    const list = panel.querySelector(':scope > .optimization-list');
    const listCards = Array.from(list?.children || []);
    const exportSettingsCard = listCards.find((card) => /Export Settings/i.test(card.textContent || '')) || null;
    const optimizationCards = listCards.filter((card) => card !== exportSettingsCard);
    const previewRow = rows.find((row) => /Preview/i.test(row.textContent || '')) || null;
    const overlayStyleRow = rows.find((row) => /Overlay Style/i.test(row.textContent || '')) || null;
    const exportRows = rows.filter((row) => row !== previewRow && row !== overlayStyleRow);
    panel.innerHTML = '';
    const makeSection = (title, items, open = true) => {
      const details = document.createElement('details');
      details.className = 'export-settings-section';
      if (open) details.open = true;
      const summary = document.createElement('summary');
      summary.className = 'export-settings-section-summary';
      summary.textContent = title;
      const body = document.createElement('div');
      body.className = 'export-settings-section-body';
      items.filter(Boolean).forEach((item) => body.appendChild(item));
      details.appendChild(summary);
      details.appendChild(body);
      return details;
    };
    panel.appendChild(makeSection('Export Settings', [...exportRows, exportSettingsCard], true));
    panel.appendChild(makeSection('Optimization', optimizationCards, true));
    panel.appendChild(makeSection('Stats', [actions, stats], false));
    panel.dataset.exportDecorated = 'true';

    this.attachExportInfoButtons(panel);
  }

  function syncLegendSettingsControls(root) {
    const { SETTINGS, getContrastTextColor } = requireDeps('syncLegendSettingsControls');
    const state = this.exportModalState;
    if (!root || !state) return;
    const startBtn = root.querySelector('#export-legend-start-color');
    const startInput = root.querySelector('#export-legend-start-color-input');
    const endBtn = root.querySelector('#export-legend-end-color');
    const endInput = root.querySelector('#export-legend-end-color-input');
    const thicknessInput = root.querySelector('#export-legend-thickness');
    const overlayColor = state.overlayColor || SETTINGS.optimizationOverlayColor || '#38bdf8';
    const renderer = this.app.renderer;
    const baseRgb = this.app.hexToRgb(overlayColor);
    const lineSortLayers = this.getOptimizationTargets();
    const secondary = state.lineSortSecondaryColor || renderer?.getLineSortOverlaySecondaryColor?.(lineSortLayers);
    const endRgb = secondary ? this.app.hexToRgb(secondary) : this.app.getComplementRgb(baseRgb);
    const endColor = secondary || (() => {
      const c = this.app.getComplementRgb(baseRgb);
      const toHex = (v) => Math.round(v).toString(16).padStart(2, '0');
      return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
    })();
    void endRgb; // matches legacy local — kept for parity even though unused below.
    const syncPill = (btn, color) => {
      if (!btn) return;
      btn.textContent = color.toUpperCase();
      btn.style.background = color;
      btn.style.color = getContrastTextColor(color);
    };
    syncPill(startBtn, overlayColor);
    if (startInput) startInput.value = overlayColor;
    syncPill(endBtn, endColor);
    if (endInput) endInput.value = endColor;
    if (thicknessInput) thicknessInput.value = `${state.overlayWidth ?? SETTINGS.optimizationOverlayWidth ?? 0.2}`;
  }

  function attachExportInfoButtons(panel) {
    const { EXPORT_INFO, OPTIMIZATION_STEPS } = requireDeps('attachExportInfoButtons');
    if (!panel) return;
    const getCardTitleLabel = (card) => {
      if (!card) return null;
      return card.querySelector('.optimization-card-title > span');
    };
    const addInfoToggle = (labelEl, infoKey) => {
      if (!labelEl || !EXPORT_INFO[infoKey]) return;
      const existingSiblingBtn =
        labelEl.nextElementSibling && labelEl.nextElementSibling.classList?.contains('export-info-btn')
          ? labelEl.nextElementSibling
          : null;
      if (labelEl.querySelector('.export-info-btn') || existingSiblingBtn) return;
      const info = EXPORT_INFO[infoKey];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'export-info-btn';
      btn.textContent = 'i';
      btn.setAttribute('aria-label', `Info about ${info.title}`);
      const infoPanel = document.createElement('div');
      infoPanel.className = 'export-info-panel hidden';
      infoPanel.textContent = info.description;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !infoPanel.classList.contains('hidden');
        infoPanel.classList.toggle('hidden', isOpen);
        btn.textContent = isOpen ? 'i' : '×';
        btn.classList.toggle('active', !isOpen);
      });
      labelEl.insertAdjacentElement('afterend', btn);
      const cardHeader = labelEl.closest('.optimization-card-header');
      const card = labelEl.closest('.optimization-card');
      const control = labelEl.closest('.optimization-control');
      if (control) {
        control.appendChild(infoPanel);
        return;
      }
      if (cardHeader && card) {
        cardHeader.insertAdjacentElement('afterend', infoPanel);
        return;
      }
      const parent = labelEl.parentElement;
      if (parent) parent.appendChild(infoPanel);
    };

    const cards = panel.querySelectorAll('.optimization-card');
    cards.forEach((card) => {
      const stepId = card.dataset.stepId;
      if (!stepId) {
        const titleEl = getCardTitleLabel(card);
        if (titleEl && /Remove Hidden Geometry/i.test(titleEl.textContent || '')) {
          const label = card.querySelector('.control-label');
          if (label) addInfoToggle(label, 'removeHiddenGeometry');
        }
        if (titleEl && /Plotter Optimization/i.test(titleEl.textContent || '')) {
          const labels = card.querySelectorAll('.control-label');
          labels.forEach((label) => {
            if (/Plotter Optimization/i.test(label.textContent || '')) addInfoToggle(label, 'plotterOptimization');
            if (/Optimization Tolerance/i.test(label.textContent || '')) addInfoToggle(label, 'optimizationTolerance');
          });
        }
        const exportControls = card.querySelectorAll('.optimization-control');
        exportControls.forEach((control) => {
          const label = control.querySelector('.control-label');
          if (!label) return;
          const text = (label.textContent || '').trim();
          if (/Remove Hidden Geometry/i.test(text)) addInfoToggle(label, 'removeHiddenGeometry');
          if (/Plotter Optimization/i.test(text)) addInfoToggle(label, 'plotterOptimization');
          if (/Optimization Tolerance/i.test(text)) addInfoToggle(label, 'optimizationTolerance');
        });
        return;
      }
      const titleSpan = getCardTitleLabel(card);
      if (titleSpan && EXPORT_INFO[stepId]) addInfoToggle(titleSpan, stepId);
      const controls = card.querySelectorAll('.optimization-control');
      controls.forEach((control) => {
        const label = control.querySelector('.control-label');
        if (!label) return;
        const text = (label.textContent || '').trim().toLowerCase();
        const stepDef = OPTIMIZATION_STEPS.find((s) => s.id === stepId);
        if (!stepDef) return;
        (stepDef.controls || []).forEach((cDef) => {
          const cleanDefLabel = (cDef.label || '').replace(/\(mm\)/g, '').trim().toLowerCase();
          if (text.includes(cleanDefLabel) || cleanDefLabel.includes(text)) {
            const key = `${stepId}.${cDef.key}`;
            addInfoToggle(label, key);
          }
        });
      });
    });
  }

  function openExportModal() {
    const { getEl, SETTINGS, clamp, getContrastTextColor, openColorPickerAnchoredTo } =
      requireDeps('openExportModal');
    const controls = getEl('optimization-controls');
    const stash = getEl('optimization-controls-stash');
    if (!controls || !stash) return;
    this.setTopMenuOpen(null, false);
    if (this.app.renderer) {
      this.app.renderer.exportModalOpen = true;
      this.app.render();
    }
    const root = document.createElement('div');
    root.id = 'export-modal-root';
    root.className = 'export-modal';
    root.innerHTML = `
      <div class="export-modal-preview">
        <div class="export-preview-toolbar">
          <div class="export-preview-toolbar-actions">
            <button type="button" id="export-preview-fit">Fit</button>
            <button type="button" id="export-preview-reset">Reset</button>
          </div>
          <div class="export-preview-toolbar-right">
            <span class="export-preview-mode-label">Preview:</span>
            <select id="export-preview-mode" class="export-preview-mode-select">
              <option value="overlay">Overlay</option>
              <option value="replace">Replace</option>
              <option value="off">Off</option>
            </select>
          </div>
        </div>
        <div class="export-preview-stage">
          <div id="export-preview-canvas-wrap" class="export-preview-canvas-wrap">
            <canvas id="export-preview-canvas" class="export-preview-canvas"></canvas>
          </div>
          <div id="export-preview-legend" class="export-preview-legend hidden" aria-hidden="true">
            <div class="export-preview-legend-row">
              <div class="export-preview-legend-title">Line Sort Print Order</div>
              <button type="button" id="export-legend-gear" class="export-legend-gear-btn" aria-label="Legend settings">⚙</button>
            </div>
            <div id="export-preview-legend-gradient" class="export-preview-legend-gradient"></div>
            <div class="export-preview-legend-labels">
              <span>Start</span>
              <span>End</span>
            </div>
            <div id="export-legend-settings" class="export-legend-settings hidden">
              <div class="export-legend-setting">
                <label class="export-legend-setting-label">Start Color</label>
                <button type="button" id="export-legend-start-color" class="value-chip text-xs font-mono color-thickness-pill"></button>
                <input type="color" id="export-legend-start-color-input" class="hidden">
              </div>
              <div class="export-legend-setting">
                <label class="export-legend-setting-label">End Color</label>
                <button type="button" id="export-legend-end-color" class="value-chip text-xs font-mono color-thickness-pill"></button>
                <input type="color" id="export-legend-end-color-input" class="hidden">
              </div>
              <div class="export-legend-setting">
                <label class="export-legend-setting-label">Line Thickness</label>
                <input type="range" id="export-legend-thickness" min="0.05" max="1" step="0.05" class="w-full">
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="export-modal-settings" class="export-modal-settings">
        <div id="export-settings-scroll" class="export-settings-scroll"></div>
        <div class="export-modal-footer" id="export-modal-footer">
          <button type="button" id="export-modal-cancel">Cancel</button>
          <button type="button" id="export-modal-submit" class="export-primary">Export SVG</button>
        </div>
      </div>
    `;
    const settingsScroll = root.querySelector('#export-settings-scroll');
    if (settingsScroll) settingsScroll.appendChild(controls);
    this.exportModalState = {
      isOpen: true,
      root,
      controls,
      stash,
      wrap: root.querySelector('#export-preview-canvas-wrap'),
      canvas: root.querySelector('#export-preview-canvas'),
      ctx: root.querySelector('#export-preview-canvas')?.getContext('2d') || null,
      legend: root.querySelector('#export-preview-legend'),
      legendGradient: root.querySelector('#export-preview-legend-gradient'),
      view: { scale: 1, offsetX: 0, offsetY: 0, initialized: false },
      drag: null,
      previewMode: SETTINGS.optimizationPreview === 'replace' ? 'replace' : 'overlay',
      overlayColor: SETTINGS.optimizationOverlayColor || '#38bdf8',
      overlayWidth: Math.max(0.05, SETTINGS.optimizationOverlayWidth ?? 0.2),
      lineSortSecondaryColor: null,
    };

    const onWheel = (e) => {
      const state = this.exportModalState;
      if (!state?.wrap) return;
      e.preventDefault();
      const rect = state.wrap.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const prevScale = state.view.scale;
      const nextScale = clamp(prevScale * (e.deltaY > 0 ? 0.92 : 1.08), 0.05, 24);
      const worldX = (mouseX - state.view.offsetX) / prevScale;
      const worldY = (mouseY - state.view.offsetY) / prevScale;
      state.view.scale = nextScale;
      state.view.offsetX = mouseX - worldX * nextScale;
      state.view.offsetY = mouseY - worldY * nextScale;
      this.renderExportPreview();
    };
    const onPointerDown = (e) => {
      const state = this.exportModalState;
      if (!state?.wrap) return;
      state.drag = { x: e.clientX, y: e.clientY };
      state.wrap.classList.add('is-dragging');
    };
    const onPointerMove = (e) => {
      const state = this.exportModalState;
      if (!state?.drag) return;
      state.view.offsetX += e.clientX - state.drag.x;
      state.view.offsetY += e.clientY - state.drag.y;
      state.drag = { x: e.clientX, y: e.clientY };
      this.renderExportPreview();
    };
    const onPointerUp = () => {
      const state = this.exportModalState;
      if (!state?.wrap) return;
      state.drag = null;
      state.wrap.classList.remove('is-dragging');
    };
    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resizeExportPreviewCanvas()) : null;
    if (resizeObserver && this.exportModalState.wrap) resizeObserver.observe(this.exportModalState.wrap);
    this.exportModalState.wrap?.addEventListener('wheel', onWheel, { passive: false });
    this.exportModalState.wrap?.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    root.querySelector('#export-preview-fit')?.addEventListener('click', () => this.fitExportPreview());
    root.querySelector('#export-preview-reset')?.addEventListener('click', () => this.fitExportPreview());
    root.querySelector('#export-modal-cancel')?.addEventListener('click', () => this.closeModal());
    root.querySelector('#export-modal-submit')?.addEventListener('click', () => {
      this.exportSVG();
      this.closeModal();
    });

    const previewModeSelect = root.querySelector('#export-preview-mode');
    if (previewModeSelect) {
      previewModeSelect.value = this.exportModalState.previewMode || 'overlay';
      previewModeSelect.onchange = (e) => {
        if (!this.exportModalState) return;
        this.exportModalState.previewMode = e.target.value;
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };
    }

    const gearBtn = root.querySelector('#export-legend-gear');
    const gearPanel = root.querySelector('#export-legend-settings');
    if (gearBtn && gearPanel) {
      gearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = gearPanel.classList.contains('hidden');
        gearPanel.classList.toggle('hidden', !isHidden);
        if (isHidden) this.syncLegendSettingsControls(root);
      });
    }
    const legendStartColorBtn = root.querySelector('#export-legend-start-color');
    const legendStartColorInput = root.querySelector('#export-legend-start-color-input');
    const legendEndColorBtn = root.querySelector('#export-legend-end-color');
    const legendEndColorInput = root.querySelector('#export-legend-end-color-input');
    const legendThicknessInput = root.querySelector('#export-legend-thickness');
    const syncLegendPill = (btn, color) => {
      if (!btn) return;
      btn.textContent = color.toUpperCase();
      btn.style.background = color;
      btn.style.color = getContrastTextColor(color);
    };
    if (legendStartColorBtn && legendStartColorInput) {
      legendStartColorBtn.onclick = () => openColorPickerAnchoredTo(legendStartColorInput, legendStartColorBtn, { title: 'Legend Start Color', uiInstance: this });
      legendStartColorInput.oninput = (e) => {
        if (!this.exportModalState) return;
        this.exportModalState.overlayColor = e.target.value;
        syncLegendPill(legendStartColorBtn, e.target.value);
        this.renderExportPreview();
      };
      legendStartColorInput.onchange = (e) => {
        if (!this.exportModalState) return;
        this.exportModalState.overlayColor = e.target.value;
        syncLegendPill(legendStartColorBtn, e.target.value);
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };
    }
    if (legendEndColorBtn && legendEndColorInput) {
      legendEndColorBtn.onclick = () => openColorPickerAnchoredTo(legendEndColorInput, legendEndColorBtn, { title: 'Legend End Color', uiInstance: this });
      legendEndColorInput.oninput = (e) => {
        if (!this.exportModalState) return;
        this.exportModalState.lineSortSecondaryColor = e.target.value;
        syncLegendPill(legendEndColorBtn, e.target.value);
        this.renderExportPreview();
      };
      legendEndColorInput.onchange = (e) => {
        if (!this.exportModalState) return;
        this.exportModalState.lineSortSecondaryColor = e.target.value;
        syncLegendPill(legendEndColorBtn, e.target.value);
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };
    }
    if (legendThicknessInput) {
      legendThicknessInput.value = `${this.exportModalState.overlayWidth ?? SETTINGS.optimizationOverlayWidth ?? 0.2}`;
      legendThicknessInput.oninput = (e) => {
        if (!this.exportModalState) return;
        this.exportModalState.overlayWidth = Math.max(0.05, Math.min(1, parseFloat(e.target.value) || 0.2));
        this.renderExportPreview();
      };
      legendThicknessInput.onchange = () => {
        if (this.exportModalState?.isOpen) this.renderExportPreview();
      };
    }

    this.openModal({
      title: 'Export SVG',
      body: root,
      cardClass: 'modal-card--export',
      onClose: () => {
        resizeObserver?.disconnect?.();
        this.exportModalState?.wrap?.removeEventListener('wheel', onWheel);
        this.exportModalState?.wrap?.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        controls.innerHTML = '';
        stash.appendChild(controls);
        this.exportModalState = null;
        if (this.app.renderer) {
          this.app.renderer.exportModalOpen = false;
          this.app.render();
        }
      },
    });

    this.buildControls();
    this.decorateExportControlsPanel();
    this.resizeExportPreviewCanvas();
  }

  Modals.ExportSvg = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps
     * @param {function} deps.getEl                        Module-local DOM lookup.
     * @param {object}   deps.SETTINGS                     Live settings dict.
     * @param {function} deps.clamp                        Numeric clamp helper.
     * @param {function} deps.getThemeToken                CSS var resolver.
     * @param {function} deps.getContrastTextColor         Color-contrast helper for legend pills.
     * @param {object}   deps.EXPORT_INFO                  Info-toggle copy lookup.
     * @param {Array}    deps.OPTIMIZATION_STEPS           Step schema for info-toggle wiring.
     * @param {function} deps.openColorPickerAnchoredTo    Anchored color-picker opener.
     */
    bind(deps) {
      DEPS = deps || {};
    },
    openExportModal,
    fitExportPreview,
    resizeExportPreviewCanvas,
    renderExportPreview,
    decorateExportControlsPanel,
    syncLegendSettingsControls,
    attachExportInfoButtons,
    buildExportPreviewPath,
    buildExportClipPolygons,
  };
})();
