/**
 * Vectura anchored Pen Picker popover (Illustrator Tools Parity, Phase 1
 * Lane D — COL-1/COL-3/COL-4).
 *
 * Plotter-native translation of Illustrator's fill-chip color hub: Vectura
 * colors are PENS — document-level {id, name, color, width} records in
 * SETTINGS.pens — never bare hex values. Plot-order optimization groups
 * strokes by layer.penId, so every apply writes the full
 * penId/color/strokeWidth triple via the shared COL-2 helper
 * (Vectura.PensPanel.assignPenToLayers). The video's Swatches tab maps to
 * the Pens tab (the document pen list IS the recent/available-colors
 * surface); the Mixer tab maps to the New Pen tab (shared HSV+hex machinery
 * from Vectura.UI.Modals.ColorPicker.createHsvHexPicker plus width + name
 * fields).
 *
 * Public API (Phase 2's Task Bar pen chips call this):
 *   Vectura.UI.openPenPicker({ anchorEl, anchorRect, targetLayerIds,
 *                              onApply, tab, app })
 *     anchorEl        Element the popover anchors to (or anchorRect:
 *                     {left, top, width, height} in viewport coords).
 *     targetLayerIds  Array of layer ids to apply pens to. Omitted → the
 *                     current renderer selection, falling back to the active
 *                     layer.
 *     onApply(pen, layers)  Optional; called after every successful apply
 *                     (row click, Add Pen, eyedropper re-apply).
 *     tab             'pens' (default) | 'new' initial tab.
 *     app             App instance (default window.app).
 *     → returns { close, refresh, el } or null when the runtime is missing.
 *
 *   Vectura.UI.PenPicker.{ open, close, isOpen, refresh, createChip }
 *     createChip({ app, getTargetLayerIds, onApply }) → <button class="pen-chip">
 *       (COL-3) reusable chip showing the selection's current pen swatch or
 *       an explicit `?` mixed badge; clicking opens this popover anchored to
 *       the chip. Exposes .refresh() for hosts to call on selection change.
 *
 * Self-contained IIFE; tolerates late/absent dependencies (guards on
 * Vectura.PensPanel, ColorPicker.createHsvHexPicker, UnitUtils, UI_CONSTANTS)
 * and double-loading. No index.html edit in this lane — the phase integrator
 * adds the <script> tag after pens-panel.js + color-picker.js.
 *
 * Strings/thresholds live in src/config/ui-constants.js (PEN_PICKER block).
 * Skin CSS: the `COL: pen picker popover` block in src/ui/skin/components.css.
 *
 * Tests: tests/integration/pen-picker-popover.test.js,
 *        tests/integration/pen-picker-chip.test.js (COL-3),
 *        tests/integration/pen-picker-eyedropper.test.js (COL-4).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  if (UI.PenPicker) return; // double-load guard (script tag + test eval)

  const FALLBACK_LABELS = {
    TAB_PENS: 'Pens',
    TAB_NEW: 'New Pen',
    ADD_PEN: 'Add Pen',
    NAME: 'Name',
    WIDTH: 'Width',
    NAME_DEFAULT_PREFIX: 'Pen',
    MIXED_BADGE: '?',
    CHIP_TITLE: 'Pen — click to change',
    CHIP_MIXED_TITLE: 'Mixed pens — click to unify',
    EYEDROPPER_TITLE: 'Sample a pen from a canvas layer',
  };

  const cfg = () => {
    const c = (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PEN_PICKER) || {};
    return {
      LABELS: Object.assign({}, FALLBACK_LABELS, c.LABELS || {}),
      WIDTH_MIN_MM: c.WIDTH_MIN_MM ?? 0.05,
      WIDTH_MAX_MM: c.WIDTH_MAX_MM ?? 2,
      WIDTH_STEP_MM: c.WIDTH_STEP_MM ?? 0.05,
      OFFSET_PX: c.OFFSET_PX ?? 6,
      FLIP_THRESHOLD_PX: c.FLIP_THRESHOLD_PX ?? 340,
      EYEDROPPER_RGB_TOLERANCE: c.EYEDROPPER_RGB_TOLERANCE ?? 8,
      LOUPE_SIZE_PX: c.LOUPE_SIZE_PX ?? 110,
      LOUPE_ZOOM: c.LOUPE_ZOOM ?? 3,
      LOUPE_OFFSET_PX: c.LOUPE_OFFSET_PX ?? 16,
    };
  };

  const getSettings = () => Vectura.SETTINGS || {};
  const getPens = () => {
    const settings = getSettings();
    if (!Array.isArray(settings.pens)) settings.pens = [];
    return settings.pens;
  };

  const formatPenWidth = (widthMm) => {
    const format = Vectura.UnitUtils && Vectura.UnitUtils.formatDocumentLength;
    if (!format) return `${widthMm}mm`;
    return format(widthMm, getSettings().documentUnits, { trimTrailingZeros: true });
  };

  const penTooltip = (pen) =>
    `${pen.name} — ${`${pen.color || ''}`.toUpperCase()} — ${formatPenWidth(pen.width)}`;

  // Reuse of the Pens panel row swatch: same .pen-icon element contract
  // (background + currentColor + --pen-width custom property drive the CSS).
  const paintPenIcon = (icon, pen) => {
    icon.style.background = pen.color;
    icon.style.color = pen.color;
    icon.style.setProperty('--pen-width', pen.width);
  };

  // ── Popover state (single instance) ───────────────────────────────────────
  let state = null;

  const resolveApp = (opts = {}) => opts.app || G.app || null;

  const resolveTargetLayers = () => {
    if (!state) return [];
    const app = state.app;
    const layers = (app && app.engine && app.engine.layers) || [];
    if (Array.isArray(state.targetLayerIds) && state.targetLayerIds.length) {
      const wanted = new Set(state.targetLayerIds);
      return layers.filter((layer) => layer && wanted.has(layer.id));
    }
    const selection = app && app.renderer && app.renderer.selectedLayerIds;
    if (selection && selection.size) {
      return layers.filter((layer) => layer && selection.has(layer.id));
    }
    const active = app && app.engine && app.engine.getActiveLayer
      ? app.engine.getActiveLayer()
      : null;
    return active ? [active] : [];
  };

  const selectionPenState = () => {
    const PensPanel = Vectura.PensPanel;
    if (!PensPanel || !PensPanel.getSelectionPenState) {
      return { penId: null, pen: null, mixed: false };
    }
    return PensPanel.getSelectionPenState(getPens(), resolveTargetLayers());
  };

  // One undoable step per apply: push-before-change (App history convention),
  // then the shared COL-2 triple-write, then re-render.
  const applyPenId = (penId) => {
    if (!state) return null;
    const app = state.app;
    const PensPanel = Vectura.PensPanel;
    if (!app || !PensPanel || !PensPanel.assignPenToLayers) return null;
    const layers = resolveTargetLayers();
    if (!layers.length) return null;
    if (app.pushHistory) app.pushHistory();
    const pen = PensPanel.assignPenToLayers(getPens(), layers, penId);
    if (!pen) return null;
    if (app.ui && app.ui.renderLayers) app.ui.renderLayers();
    if (app.render) app.render();
    refresh();
    if (state && state.onApply) state.onApply(pen, layers);
    return pen;
  };

  // ── Rendering ──────────────────────────────────────────────────────────────
  const renderCurrentSwatch = () => {
    if (!state) return;
    const holder = state.el.querySelector('.pen-pick-current');
    if (!holder) return;
    const icon = holder.querySelector('.pen-icon');
    const badge = holder.querySelector('.pen-pick-mixed-badge');
    const sel = selectionPenState();
    if (sel.pen) {
      paintPenIcon(icon, sel.pen);
      holder.title = penTooltip(sel.pen);
    } else {
      icon.style.background = 'transparent';
      icon.style.color = 'transparent';
      icon.style.removeProperty('--pen-width');
      holder.title = sel.mixed ? cfg().LABELS.CHIP_MIXED_TITLE : '';
    }
    holder.classList.toggle('mixed', sel.mixed);
    if (badge) badge.textContent = sel.mixed ? cfg().LABELS.MIXED_BADGE : '';
  };

  const renderPenList = () => {
    if (!state) return;
    const list = state.el.querySelector('.pen-pick-list');
    if (!list) return;
    list.textContent = '';
    const doc = state.el.ownerDocument;
    const sel = selectionPenState();
    // SECURITY: pen records can originate from untrusted .vectura files —
    // build rows via DOM APIs (textContent/title/style), never innerHTML
    // interpolation (parity with layers-panel.js pen menu).
    getPens().forEach((pen) => {
      if (!pen) return;
      const row = doc.createElement('button');
      row.type = 'button';
      row.className = 'pen-pick-row';
      row.dataset.penId = pen.id;
      row.title = penTooltip(pen);
      if (!sel.mixed && sel.penId === pen.id) row.classList.add('active');
      row.setAttribute('aria-pressed', !sel.mixed && sel.penId === pen.id ? 'true' : 'false');

      const icon = doc.createElement('div');
      icon.className = 'pen-icon';
      paintPenIcon(icon, pen);
      row.appendChild(icon);

      const name = doc.createElement('span');
      name.className = 'pen-pick-row-name';
      name.textContent = pen.name;
      row.appendChild(name);

      const width = doc.createElement('span');
      width.className = 'pen-pick-row-width';
      width.textContent = formatPenWidth(pen.width);
      row.appendChild(width);

      // Video parity: click applies immediately — no OK/commit step.
      row.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyPenId(pen.id);
      });

      list.appendChild(row);
    });
  };

  const renderNewPenDefaults = () => {
    if (!state) return;
    const nameInput = state.el.querySelector('.pen-pick-name');
    if (nameInput && !state.nameTouched) {
      nameInput.value = `${cfg().LABELS.NAME_DEFAULT_PREFIX} ${getPens().length + 1}`;
    }
  };

  const refresh = () => {
    if (!state) return;
    renderPenList();
    renderCurrentSwatch();
    renderNewPenDefaults();
    if (state.chipEl && state.chipEl.refresh) state.chipEl.refresh();
  };

  const setTab = (tab) => {
    if (!state) return;
    const next = tab === 'new' ? 'new' : 'pens';
    state.el.querySelectorAll('.pen-pick-tab').forEach((btn) => {
      const active = btn.dataset.tab === next;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    state.el.querySelectorAll('.pen-pick-body').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.tab !== next);
    });
    if (next === 'new') {
      renderNewPenDefaults();
      // The mixer canvases sized 0×0 if the picker mounted while this tab
      // was display:none (popover opened on Pens) — re-measure now visible.
      if (state.picker && state.picker.layout) state.picker.layout();
    }
  };

  // ── Positioning ────────────────────────────────────────────────────────────
  const position = () => {
    if (!state) return;
    const el = state.el;
    const win = el.ownerDocument.defaultView || G;
    let rect = state.anchorRect;
    if (state.anchorEl && state.anchorEl.getBoundingClientRect) {
      rect = state.anchorEl.getBoundingClientRect();
    }
    rect = rect || { left: win.innerWidth / 2, top: win.innerHeight / 2, width: 0, height: 0 };
    const { OFFSET_PX, FLIP_THRESHOLD_PX } = cfg();
    const bottom = rect.top + (rect.height || 0);
    const spaceBelow = win.innerHeight - bottom;
    const spaceAbove = rect.top;
    const placeAbove = spaceBelow < FLIP_THRESHOLD_PX && spaceAbove > spaceBelow;
    const popW = el.offsetWidth || 264;
    const left = Math.max(8, Math.min(win.innerWidth - popW - 8, Math.round(rect.left)));
    el.style.left = `${left}px`;
    if (placeAbove) {
      el.style.top = 'auto';
      el.style.bottom = `${Math.round(win.innerHeight - rect.top + OFFSET_PX)}px`;
    } else {
      el.style.bottom = 'auto';
      el.style.top = `${Math.round(bottom + OFFSET_PX)}px`;
    }
  };

  // ── New Pen tab (Add Pen mirrors pens-panel.js addPen, then applies) ──────
  const addPenAndApply = () => {
    if (!state) return;
    const app = state.app;
    const pens = getPens();
    const nameInput = state.el.querySelector('.pen-pick-name');
    const widthInput = state.el.querySelector('.pen-pick-width');
    const color = state.picker && state.picker.getHex
      ? state.picker.getHex()
      : (state.el.querySelector('.color-modal-hex')
        ? '#' + state.el.querySelector('.color-modal-hex').value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toLowerCase()
        : '#000000');
    const { WIDTH_MIN_MM, WIDTH_MAX_MM } = cfg();
    let width = parseFloat(widthInput ? widthInput.value : NaN);
    if (!Number.isFinite(width)) width = getSettings().strokeWidth ?? 0.3;
    width = Math.max(WIDTH_MIN_MM, Math.min(WIDTH_MAX_MM, width));
    const fallbackName = `${cfg().LABELS.NAME_DEFAULT_PREFIX} ${pens.length + 1}`;
    const name = (nameInput && nameInput.value.trim()) || fallbackName;

    // ONE undo step covers create + apply.
    if (app && app.pushHistory) app.pushHistory();
    const pen = {
      id: `pen-${Math.random().toString(36).slice(2, 9)}`,
      name,
      color,
      width,
    };
    pens.push(pen);

    const PensPanel = Vectura.PensPanel;
    const layers = resolveTargetLayers();
    if (PensPanel && PensPanel.assignPenToLayers && layers.length) {
      PensPanel.assignPenToLayers(pens, layers, pen.id);
    }
    // Single source of truth: re-render the docked Pens panel + layers.
    if (app && app.ui) {
      if (app.ui.renderPens) app.ui.renderPens();
      if (app.ui.renderLayers) app.ui.renderLayers();
    }
    if (app && app.render) app.render();

    state.nameTouched = false;
    refresh();
    setTab('pens');
    if (state.onApply) state.onApply(pen, layers);
  };

  // ── COL-4 eyedropper ───────────────────────────────────────────────────────
  const hexToRgbSafe = (hex) => {
    const raw = `${hex || ''}`.replace(/[^0-9a-fA-F]/g, '');
    const six = raw.length === 3
      ? raw.split('').map((ch) => ch + ch).join('')
      : raw.slice(0, 6);
    if (six.length !== 6) return null;
    return {
      r: parseInt(six.slice(0, 2), 16),
      g: parseInt(six.slice(2, 4), 16),
      b: parseInt(six.slice(4, 6), 16),
    };
  };

  const colorsMatch = (a, b, tolerance) => {
    const ra = hexToRgbSafe(a);
    const rb = hexToRgbSafe(b);
    if (!ra || !rb) return false;
    return Math.abs(ra.r - rb.r) <= tolerance
      && Math.abs(ra.g - rb.g) <= tolerance
      && Math.abs(ra.b - rb.b) <= tolerance;
  };

  const normalizeHex = (hex) => {
    const rgb = hexToRgbSafe(hex);
    if (!rgb) return null;
    return '#' + [rgb.r, rgb.g, rgb.b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  };

  // Resolve what a sample at `world` WOULD pick, without applying anything:
  // the pen of the layer nearest the point (exact penId, then RGB-tolerance
  // color match), or the layer's novel color. Shared by the live loupe
  // preview and the click commit so the reticle always shows exactly what a
  // click grabs.
  const resolveSampleAtWorld = (world) => {
    if (!state) return null;
    const renderer = state.app && state.app.renderer;
    const layer = renderer && renderer.findLayerAtPoint
      ? renderer.findLayerAtPoint(world)
      : null;
    if (!layer) return null;
    const pens = getPens();
    let pen = layer.penId ? pens.find((p) => p && p.id === layer.penId) : null;
    if (!pen && layer.color) {
      const tolerance = cfg().EYEDROPPER_RGB_TOLERANCE;
      pen = pens.find((p) => p && colorsMatch(p.color, layer.color, tolerance)) || null;
    }
    const hex = normalizeHex(pen ? pen.color : layer.color);
    if (!hex) return null;
    return { pen, hex, layer };
  };

  // Sample the pen of the layer nearest `world` (a plotter samples pens, not
  // raster pixels). Exact/tolerant pen match → re-apply that pen (no
  // duplicate); novel color → open New Pen pre-filled so the user explicitly
  // creates a pen from it. NEVER silently writes a bare hex onto a layer.
  const sampleWorldPoint = (world) => {
    if (!state) return { outcome: 'closed' };
    const hit = resolveSampleAtWorld(world);
    if (!hit) return { outcome: 'miss' };
    if (hit.pen) {
      applyPenId(hit.pen.id);
      return { outcome: 'applied', pen: hit.pen };
    }
    setTab('new');
    if (state.picker && state.picker.setHex) state.picker.setHex(hit.hex);
    return { outcome: 'prefilled', hex: hit.hex };
  };

  // ── COL-4b Illustrator-style sampling loupe ────────────────────────────────
  // While the eyedropper is armed the canvas cursor becomes an eyedropper and
  // a magnifier circle follows the pointer: a zoomed snapshot of the canvas
  // centered on the pointer, a center reticle marking the exact sample point,
  // and a ring + label tinted with what a click would grab.
  const mountLoupe = () => {
    if (!state || state.loupe) return;
    const doc = state.el.ownerDocument;
    const loupe = doc.createElement('div');
    loupe.className = 'pen-loupe';
    loupe.innerHTML = `
      <canvas class="pen-loupe-canvas"></canvas>
      <div class="pen-loupe-reticle"></div>
      <div class="pen-loupe-label"><span class="pen-loupe-swatch"></span><span class="pen-loupe-text"></span></div>
    `;
    doc.body.appendChild(loupe);
    state.loupe = loupe;
  };

  const removeLoupe = () => {
    if (!state || !state.loupe) return;
    state.loupe.remove();
    state.loupe = null;
  };

  // Zoomed snapshot of the renderer canvas around the pointer. Backing-store
  // scale (canvas.width / CSS width) keeps the crop correct on Retina.
  const paintLoupeView = (canvas, rect, clientX, clientY) => {
    const { LOUPE_SIZE_PX, LOUPE_ZOOM } = cfg();
    const lc = state.loupe.querySelector('.pen-loupe-canvas');
    if (lc.width !== LOUPE_SIZE_PX || lc.height !== LOUPE_SIZE_PX) {
      lc.width = LOUPE_SIZE_PX;
      lc.height = LOUPE_SIZE_PX;
    }
    const ctx = lc.getContext && lc.getContext('2d');
    if (!ctx || !ctx.drawImage || !rect.width || !rect.height) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const srcW = (LOUPE_SIZE_PX / LOUPE_ZOOM) * scaleX;
    const srcH = (LOUPE_SIZE_PX / LOUPE_ZOOM) * scaleY;
    ctx.clearRect(0, 0, lc.width, lc.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      canvas,
      (clientX - rect.left) * scaleX - srcW / 2,
      (clientY - rect.top) * scaleY - srcH / 2,
      srcW, srcH,
      0, 0, lc.width, lc.height,
    );
  };

  const updateLoupe = (e) => {
    if (!state || !state.loupe) return;
    const renderer = state.app && state.app.renderer;
    const canvas = renderer && renderer.canvas;
    if (!canvas || e.target !== canvas) {
      state.loupe.classList.remove('visible');
      return;
    }
    const { LOUPE_SIZE_PX, LOUPE_OFFSET_PX } = cfg();
    const win = state.el.ownerDocument.defaultView || G;
    // Sit above-right of the pointer so the eyedropper cursor stays visible;
    // flip sides at the viewport edges.
    let left = e.clientX + LOUPE_OFFSET_PX;
    let top = e.clientY - LOUPE_OFFSET_PX - LOUPE_SIZE_PX;
    if (left + LOUPE_SIZE_PX > win.innerWidth - 8) {
      left = e.clientX - LOUPE_OFFSET_PX - LOUPE_SIZE_PX;
    }
    if (top < 8) top = e.clientY + LOUPE_OFFSET_PX;
    state.loupe.style.left = `${Math.round(left)}px`;
    state.loupe.style.top = `${Math.round(top)}px`;
    state.loupe.classList.add('visible');

    const rect = canvas.getBoundingClientRect();
    paintLoupeView(canvas, rect, e.clientX, e.clientY);

    const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = resolveSampleAtWorld(world);
    const swatch = state.loupe.querySelector('.pen-loupe-swatch');
    const text = state.loupe.querySelector('.pen-loupe-text');
    if (hit) {
      state.loupe.classList.add('hit');
      state.loupe.style.setProperty('--loupe-color', hit.hex);
      swatch.style.background = hit.hex;
      text.textContent = hit.pen ? hit.pen.name : hit.hex.toUpperCase();
    } else {
      state.loupe.classList.remove('hit');
      state.loupe.style.removeProperty('--loupe-color');
      swatch.style.background = 'transparent';
      text.textContent = '';
    }
  };

  const endSampling = () => {
    if (!state || !state.sampling) return;
    state.sampling = false;
    const doc = state.el.ownerDocument;
    if (state.samplingHandler) {
      doc.defaultView.removeEventListener('pointerdown', state.samplingHandler, true);
      state.samplingHandler = null;
    }
    if (state.loupeMoveHandler) {
      doc.defaultView.removeEventListener('pointermove', state.loupeMoveHandler, true);
      state.loupeMoveHandler = null;
    }
    removeLoupe();
    const renderer = state.app && state.app.renderer;
    if (renderer && renderer.canvas && renderer.canvas.classList) {
      renderer.canvas.classList.remove('pen-eyedropper-cursor');
    }
    state.el.classList.remove('sampling');
    const btn = state.el.querySelector('.pen-pick-eyedropper');
    if (btn) btn.classList.remove('active');
  };

  const beginSampling = () => {
    if (!state || state.sampling) return;
    const renderer = state.app && state.app.renderer;
    const canvas = renderer && renderer.canvas;
    if (!renderer || !canvas || !renderer.screenToWorld || !renderer.findLayerAtPoint) return;
    state.sampling = true;
    state.el.classList.add('sampling');
    const btn = state.el.querySelector('.pen-pick-eyedropper');
    if (btn) btn.classList.add('active');
    if (canvas.classList) canvas.classList.add('pen-eyedropper-cursor');
    mountLoupe();
    const doc = state.el.ownerDocument;
    state.loupeMoveHandler = (e) => updateLoupe(e);
    doc.defaultView.addEventListener('pointermove', state.loupeMoveHandler, true);
    // Window-capture listener: intercepts the canvas click before the
    // renderer's own pointer pipeline can turn it into a selection.
    state.samplingHandler = (e) => {
      if (!state || !state.sampling) return;
      if (state.el.contains(e.target)) return; // popover clicks pass through
      if (e.target !== canvas) { endSampling(); return; }
      e.preventDefault();
      e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      endSampling();
      sampleWorldPoint(world);
    };
    doc.defaultView.addEventListener('pointerdown', state.samplingHandler, true);
  };

  // ── Open / close ───────────────────────────────────────────────────────────
  const close = () => {
    if (!state) return;
    endSampling();
    const doc = state.el.ownerDocument;
    doc.removeEventListener('pointerdown', state.outsideHandler, true);
    doc.removeEventListener('keydown', state.keyHandler, true);
    if (state.penListObserver) state.penListObserver.disconnect();
    state.el.remove();
    state = null;
  };

  const isOpen = () => Boolean(state);

  const open = (opts = {}) => {
    const app = resolveApp(opts);
    if (!app) return null;
    if (state) close();

    const doc = (opts.anchorEl && opts.anchorEl.ownerDocument)
      || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const labels = cfg().LABELS;
    const { WIDTH_MIN_MM, WIDTH_MAX_MM, WIDTH_STEP_MM } = cfg();

    const el = doc.createElement('div');
    el.className = 'pen-pick-pop';
    el.setAttribute('role', 'dialog');
    // Static scaffold only — every pen-derived value is set via DOM APIs.
    el.innerHTML = `
      <div class="pen-pick-header">
        <div class="pen-pick-current" title=""><div class="pen-icon"></div><span class="pen-pick-mixed-badge"></span></div>
        <div class="pen-pick-tabs" role="tablist">
          <button type="button" class="pen-pick-tab" role="tab" data-tab="pens"></button>
          <button type="button" class="pen-pick-tab" role="tab" data-tab="new"></button>
        </div>
        <button type="button" class="pen-pick-eyedropper" title="">
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M20.7 3.3a2.4 2.4 0 0 0-3.4 0l-2.8 2.8-1-1-1.4 1.4 1 1L4 16.6V20h3.4l9.1-9.1 1 1 1.4-1.4-1-1 2.8-2.8a2.4 2.4 0 0 0 0-3.4zM6.6 18H6v-.6l8.5-8.5.6.6L6.6 18z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="pen-pick-body" data-tab="pens">
        <div class="pen-pick-list"></div>
      </div>
      <div class="pen-pick-body hidden" data-tab="new">
        <div class="pen-pick-mixer"></div>
        <label class="pen-pick-field">
          <span class="pen-pick-field-label"></span>
          <input type="text" class="pen-pick-name" maxlength="40" autocomplete="off" spellcheck="false">
        </label>
        <label class="pen-pick-field">
          <span class="pen-pick-field-label"></span>
          <span class="pen-pick-width-wrap">
            <input type="range" class="pen-pick-width" min="${WIDTH_MIN_MM}" max="${WIDTH_MAX_MM}" step="${WIDTH_STEP_MM}">
            <input type="number" class="pen-pick-width-value" min="${WIDTH_MIN_MM}" max="${WIDTH_MAX_MM}" step="${WIDTH_STEP_MM}"
              inputmode="decimal" aria-label="Pen stroke weight (mm)">
          </span>
        </label>
        <button type="button" class="pen-pick-add"></button>
      </div>
    `;
    doc.body.appendChild(el);

    state = {
      el,
      app,
      anchorEl: opts.anchorEl || null,
      anchorRect: opts.anchorRect || null,
      targetLayerIds: Array.isArray(opts.targetLayerIds) ? opts.targetLayerIds.slice() : null,
      onApply: typeof opts.onApply === 'function' ? opts.onApply : null,
      chipEl: opts._chipEl || null,
      picker: null,
      nameTouched: false,
      sampling: false,
      samplingHandler: null,
      loupe: null,
      loupeMoveHandler: null,
      outsideHandler: null,
      keyHandler: null,
      penListObserver: null,
    };

    // Config-driven strings.
    el.querySelector('.pen-pick-tab[data-tab="pens"]').textContent = labels.TAB_PENS;
    el.querySelector('.pen-pick-tab[data-tab="new"]').textContent = labels.TAB_NEW;
    el.querySelector('.pen-pick-add').textContent = labels.ADD_PEN;
    el.querySelector('.pen-pick-eyedropper').title = labels.EYEDROPPER_TITLE;
    const fieldLabels = el.querySelectorAll('.pen-pick-field-label');
    if (fieldLabels[0]) fieldLabels[0].textContent = labels.NAME;
    if (fieldLabels[1]) fieldLabels[1].textContent = labels.WIDTH;

    // New Pen tab: reuse the modal's HSV+hex machinery (COL-1 — never
    // rebuild it). Guarded: absent helper leaves the mixer empty but the
    // hex-less flow (width/name/Add Pen with default color) still works.
    const mixerHost = el.querySelector('.pen-pick-mixer');
    const ColorPicker = UI.Modals && UI.Modals.ColorPicker;
    if (ColorPicker && ColorPicker.createHsvHexPicker && mixerHost) {
      const sel = selectionPenState();
      state.picker = ColorPicker.createHsvHexPicker(mixerHost, {
        value: (sel.pen && sel.pen.color) || undefined,
      });
    }

    // Width slider + editable numeric textbox, kept in sync (docked Pens
    // panel parity — P3 feedback). The slider stays the value of record for
    // Add Pen; typed values clamp + normalize back into both controls.
    const widthInput = el.querySelector('.pen-pick-width');
    const widthValue = el.querySelector('.pen-pick-width-value');
    const clampWidth = (v) => Math.max(WIDTH_MIN_MM, Math.min(WIDTH_MAX_MM, v));
    const seedWidth = getSettings().strokeWidth ?? 0.3;
    widthInput.value = `${clampWidth(seedWidth)}`;
    const syncWidthValue = () => { widthValue.value = widthInput.value; };
    syncWidthValue();
    widthInput.addEventListener('input', syncWidthValue);
    widthValue.addEventListener('change', () => {
      const typed = parseFloat(widthValue.value);
      if (Number.isFinite(typed)) widthInput.value = `${clampWidth(typed)}`;
      syncWidthValue(); // snap the text to the clamped/normalized value
    });

    const nameInput = el.querySelector('.pen-pick-name');
    nameInput.addEventListener('input', () => { state.nameTouched = true; });

    el.querySelectorAll('.pen-pick-tab').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTab(btn.dataset.tab);
      });
    });
    el.querySelector('.pen-pick-add').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addPenAndApply();
    });
    el.querySelector('.pen-pick-eyedropper').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.sampling) endSampling();
      else beginSampling();
    });

    // Outside pointerdown closes (except while eyedropper-sampling — the
    // sampling handler owns canvas clicks then). Escape cancels sampling
    // first, then closes.
    state.outsideHandler = (e) => {
      if (!state || state.sampling) return;
      if (state.el.contains(e.target)) return;
      if (state.anchorEl && state.anchorEl.contains && state.anchorEl.contains(e.target)) return;
      close();
    };
    state.keyHandler = (e) => {
      if (e.key !== 'Escape' || !state) return;
      if (state.sampling) { endSampling(); return; }
      close();
    };
    doc.addEventListener('pointerdown', state.outsideHandler, true);
    doc.addEventListener('keydown', state.keyHandler, true);

    // Single source of truth with the docked Pens panel: watch #pen-list —
    // the panel re-renders it on every pen add/remove/reorder and updates
    // icons/width readouts in place on edits — and mirror into the popover.
    const penList = doc.getElementById('pen-list');
    if (penList && typeof MutationObserver !== 'undefined') {
      let scheduled = false;
      state.penListObserver = new MutationObserver(() => {
        if (scheduled || !state) return;
        scheduled = true;
        Promise.resolve().then(() => {
          scheduled = false;
          if (state) refresh();
        });
      });
      state.penListObserver.observe(penList, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }

    refresh();
    setTab(opts.tab === 'new' ? 'new' : 'pens');
    position();

    return {
      close,
      refresh,
      el,
    };
  };

  // ── COL-3: reusable pen chip (Phase 2 Task Bar mounts this) ───────────────
  const createChip = ({ app, getTargetLayerIds, onApply } = {}) => {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return null;
    const labels = cfg().LABELS;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'pen-chip';
    btn.innerHTML = '<span class="pen-chip-swatch"><span class="pen-icon"></span></span><span class="pen-chip-mixed"></span>';
    const icon = btn.querySelector('.pen-icon');
    const mixedBadge = btn.querySelector('.pen-chip-mixed');

    const chipApp = () => app || G.app || null;
    const chipTargets = () => {
      const ids = typeof getTargetLayerIds === 'function' ? getTargetLayerIds() : null;
      return Array.isArray(ids) && ids.length ? ids : null;
    };
    const chipLayers = () => {
      const a = chipApp();
      const layers = (a && a.engine && a.engine.layers) || [];
      const ids = chipTargets();
      if (ids) {
        const wanted = new Set(ids);
        return layers.filter((layer) => layer && wanted.has(layer.id));
      }
      const selection = a && a.renderer && a.renderer.selectedLayerIds;
      if (selection && selection.size) return layers.filter((layer) => layer && selection.has(layer.id));
      const active = a && a.engine && a.engine.getActiveLayer ? a.engine.getActiveLayer() : null;
      return active ? [active] : [];
    };

    btn.refresh = () => {
      const PensPanel = Vectura.PensPanel;
      const sel = PensPanel && PensPanel.getSelectionPenState
        ? PensPanel.getSelectionPenState(getPens(), chipLayers())
        : { penId: null, pen: null, mixed: false };
      btn.classList.toggle('mixed', sel.mixed);
      if (sel.pen) {
        paintPenIcon(icon, sel.pen);
        btn.title = `${labels.CHIP_TITLE} — ${penTooltip(sel.pen)}`;
      } else {
        icon.style.background = 'transparent';
        icon.style.color = 'transparent';
        icon.style.removeProperty('--pen-width');
        btn.title = sel.mixed ? labels.CHIP_MIXED_TITLE : labels.CHIP_TITLE;
      }
      mixedBadge.textContent = sel.mixed ? labels.MIXED_BADGE : '';
      return sel;
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen()) { close(); return; }
      open({
        anchorEl: btn,
        app: chipApp(),
        targetLayerIds: chipTargets(),
        _chipEl: btn,
        onApply: (pen, layers) => {
          btn.refresh();
          if (typeof onApply === 'function') onApply(pen, layers);
        },
      });
    });

    btn.refresh();
    return btn;
  };

  UI.PenPicker = {
    open,
    close,
    isOpen,
    refresh: () => refresh(),
    createChip,
    // Test/diagnostic hook for the eyedropper's world-point sampling (the
    // pointer plumbing is a thin wrapper over this).
    _sampleWorldPoint: sampleWorldPoint,
  };

  /**
   * Convenience entry point (SPEC COL-1): Phase 2 Task Bar chips call this.
   * @see UI.PenPicker.open
   */
  UI.openPenPicker = (opts) => open(opts);
})();
