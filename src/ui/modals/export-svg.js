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
 * Methods exposed (each installed onto UI.prototype via `installOn`):
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
 *           openColorPickerAnchoredTo }
 *   - EXPORT_INFO + OPTIMIZATION_STEPS live as IIFE-locals in this file and
 *     are exposed on the public namespace as
 *     window.Vectura.UI.Modals.ExportSvg.{EXPORT_INFO,OPTIMIZATION_STEPS} so
 *     sibling satellites can read them.
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

  // ---------------------------------------------------------------------------
  // OPTIMIZATION_STEPS + EXPORT_INFO — export pipeline schema and tooltip copy.
  // Exposed on window.Vectura.UI.Modals.ExportSvg so sibling satellites
  // (notably algo-config-panel.js, which consumes OPTIMIZATION_STEPS) can
  // pull them back through the namespace.
  // ---------------------------------------------------------------------------
  const OPTIMIZATION_STEPS = [
    {
      id: 'linesimplify',
      label: 'Line Simplify',
      controls: [
        { key: 'tolerance', label: 'Tolerance (mm)', type: 'range', min: 0, max: 2, step: 0.05 },
        {
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: [
            { value: 'polyline', label: 'Polyline' },
            { value: 'curve', label: 'Curve' },
          ],
        },
      ],
    },
    {
      id: 'linesort',
      label: 'Line Sort',
      controls: [
        {
          key: 'method',
          label: 'Method',
          type: 'select',
          options: [
            { value: 'nearest', label: 'Nearest' },
            { value: 'greedy', label: 'Greedy' },
            { value: 'angle', label: 'Angle' },
          ],
        },
        {
          key: 'direction',
          label: 'Direction',
          type: 'select',
          options: [
            { value: 'none', label: 'None' },
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' },
            { value: 'radial', label: 'Radial' },
          ],
        },
        {
          key: 'grouping',
          label: 'Grouping',
          type: 'select',
          options: [
            { value: 'layer', label: 'Per Layer' },
            { value: 'pen', label: 'Per Pen' },
            { value: 'combined', label: 'Combined' },
          ],
        },
      ],
    },
    {
      id: 'filter',
      label: 'Filter',
      controls: [
        { key: 'minLength', label: 'Min Length (mm)', type: 'range', min: 0, max: 800, step: 0.2 },
        { key: 'maxLength', label: 'Max Length (mm)', type: 'range', min: 0, max: 800, step: 0.5 },
        { key: 'removeTiny', label: 'Remove Tiny', type: 'checkbox' },
      ],
    },
    {
      id: 'multipass',
      label: 'Multipass',
      controls: [
        { key: 'passes', label: 'Passes', type: 'range', min: 1, max: 6, step: 1 },
        { key: 'offset', label: 'Offset (mm)', type: 'range', min: 0, max: 2, step: 0.05 },
        { key: 'jitter', label: 'Jitter (mm)', type: 'range', min: 0, max: 1, step: 0.05 },
        { key: 'seed', label: 'Seed', type: 'range', min: 0, max: 9999, step: 1 },
      ],
    },
  ];

  const EXPORT_INFO = {
    precision: {
      title: 'Precision',
      description: 'Number of decimal places used for coordinates in the exported SVG. Higher values preserve fine sub-pixel detail at the cost of file size; lower values shrink the file but quantize positions. 3 (≈0.001 mm at A4) is a sensible default for plotter work.',
    },
    strokeWidthOverride: {
      title: 'Export Stroke Override',
      description: 'When OFF (default), the SVG export uses each pen\'s stroke width as configured in the Pens panel. Turn ON to surface the global Stroke slider and apply a single uniform width across the whole document, overriding the per-pen widths.',
    },
    strokeWidth: {
      title: 'Stroke (mm)',
      description: 'Global stroke width applied to the SVG export and on-canvas display when Export Stroke Override is ON. Editing this overwrites every layer\'s current stroke and overrides the per-pen widths configured in the Pens panel. Use the Pens panel for fine-grained per-layer control; use this field to apply a single uniform width across the whole document.',
    },
    removeHiddenGeometry: {
      title: 'Remove Hidden Geometry',
      description: 'Trims masked and frame-hidden segments from the exported SVG so the output matches the current view exactly. This reduces file size and eliminates invisible paths that plotters would otherwise draw.',
    },
    plotterOptimization: {
      title: 'Plotter Optimization',
      description: 'Enables path deduplication and overlap removal. When turned on, the engine merges duplicate or nearly-duplicate paths to reduce redundant pen travel and speed up plotting.',
    },
    optimizationTolerance: {
      title: 'Optimization Tolerance',
      description: 'Controls how aggressively duplicate paths are merged. A smaller tolerance requires near-exact overlap; a larger tolerance merges paths that are close but not identical. Increase for faster plotting, decrease for higher fidelity.',
    },
    linesimplify: {
      title: 'Line Simplify',
      description: 'Reduces point count on each path while preserving visual shape. Polyline mode uses the Ramer-Douglas-Peucker algorithm; Curve mode fits smooth Bézier curves to the simplified result.',
    },
    'linesimplify.tolerance': {
      title: 'Tolerance',
      description: 'Maximum allowed deviation from the original path. Higher values produce fewer points (faster plotting) but may lose fine detail.',
    },
    'linesimplify.mode': {
      title: 'Mode',
      description: 'Polyline keeps straight segments between simplified points. Curve fits smooth Bézier arcs for a more organic look and smaller SVG output.',
    },
    linesort: {
      title: 'Line Sort',
      description: 'Reorders lines to minimize pen-up travel between consecutive paths. This is the single most effective optimization for reducing total plot time on pen plotters.',
    },
    'linesort.method': {
      title: 'Method',
      description: 'Nearest: greedy nearest-neighbor from the current pen position (fast, good results). Greedy: tries both directions of each path for shorter hops. Angle: sorts by path start angle from center.',
    },
    'linesort.direction': {
      title: 'Direction',
      description: 'None: pure nearest-neighbor without bias. Horizontal/Vertical: sweeps across the chosen axis first, filling bands before moving on—ideal for plotters that move faster on one axis. Radial: sorts from center outward.',
    },
    'linesort.grouping': {
      title: 'Grouping',
      description: 'Per Layer: sorts within each layer independently. Per Pen: groups lines by pen assignment before sorting. Combined: merges all layers into one sorting pool for the shortest possible total travel.',
    },
    filter: {
      title: 'Filter',
      description: 'Removes paths that fall outside length bounds. Use this to eliminate tiny debris lines or excessively long paths that shouldn\'t be plotted.',
    },
    'filter.minLength': {
      title: 'Min Length',
      description: 'Paths shorter than this value will be removed. Useful for cleaning up tiny dots or micro-segments that produce pen marks without meaningful visual contribution.',
    },
    'filter.maxLength': {
      title: 'Max Length',
      description: 'Paths longer than this value will be removed. Set to 0 to disable the upper bound. Helpful when the design contains unwanted long construction lines.',
    },
    'filter.removeTiny': {
      title: 'Remove Tiny',
      description: 'Automatically removes single-point and very short paths (below 0.1mm) that are too small to produce visible marks. Recommended for cleaner plots.',
    },
    multipass: {
      title: 'Multipass',
      description: 'Duplicates each path multiple times with small offsets. Produces thicker, more opaque lines on pen plotters where a single pass may be too faint, or creates a hatched fill effect.',
    },
    'multipass.passes': {
      title: 'Passes',
      description: 'Number of times each path is drawn. 1 = no duplication. Each additional pass adds one offset copy of every line.',
    },
    'multipass.offset': {
      title: 'Offset',
      description: 'Distance between each duplicated pass. Larger values spread passes apart for a broader stroke; smaller values stack them for denser ink coverage.',
    },
    'multipass.jitter': {
      title: 'Jitter',
      description: 'Random variation added to each pass offset. Creates a hand-drawn, organic quality instead of perfectly parallel lines.',
    },
    'multipass.seed': {
      title: 'Seed',
      description: 'Random seed for jitter. Change this to get a different randomization pattern while keeping the same jitter amount.',
    },
  };


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
    // Native cubic preview when bezier metadata is present — mirrors
    // Renderer.tracePath and ui.pathToSvg so the export preview matches the
    // on-screen curve and the emitted SVG. `forceCurves` renders cubics even
    // when the layer's `curves` toggle is off; `straight` always wins.
    const forceCurves = path.meta?.forceCurves === true;
    const anchors = (useCurves || forceCurves) && !path.meta?.straight ? path.meta?.anchors : null;
    const hasHandles = Array.isArray(anchors) && anchors.some((a) => a && (a.in || a.out));
    if (hasHandles && anchors.length >= 2) {
      const closed = path.meta?.closed === true;
      ctx.moveTo(anchors[0].x, anchors[0].y);
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        const c1 = a.out || a;
        const c2 = b.in || b;
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      }
      if (closed) {
        const a = anchors[anchors.length - 1];
        const b = anchors[0];
        const c1 = a.out || a;
        const c2 = b.in || b;
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      }
      return;
    }
    if (!useCurves || path.meta?.straight || path.length < 3) {
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      return;
    }
    const isClosed = window.Vectura?.OptimizationUtils?.isClosedPath?.(path);
    if (isClosed) {
      const n = path.length - 1;
      const m0x = (path[0].x + path[1].x) / 2;
      const m0y = (path[0].y + path[1].y) / 2;
      ctx.moveTo(m0x, m0y);
      for (let i = 1; i < n; i++) {
        if (sharpEdges && path[i]._tileEdge) {
          ctx.lineTo(path[i].x, path[i].y);
        } else {
          const midX = (path[i].x + path[i + 1].x) / 2;
          const midY = (path[i].y + path[i + 1].y) / 2;
          ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY);
        }
      }
      if (sharpEdges && path[0]._tileEdge) {
        ctx.lineTo(path[0].x, path[0].y);
        ctx.lineTo(m0x, m0y);
      } else {
        ctx.quadraticCurveTo(path[0].x, path[0].y, m0x, m0y);
      }
      return;
    }
    ctx.moveTo(path[0].x, path[0].y);
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
    ctx.fillStyle = getThemeToken('--ui-workspace', '#121214');
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
      const dash = renderer?.getPathStrokeDash?.(item.path) || window.Vectura?.Geometry3D?.getPathStrokeDash?.(item.path);
      if (dash) ctx.setLineDash(dash);
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

  // Sidebar layout: nav-driven single-section-visible export settings.
  // Section IDs that match `data-step-id` on optimization cards (linesimplify,
  // linesort, filter, multipass) are populated automatically; `output` and
  // `stats` are synthesized from rows / actions / stats.
  const SIDEBAR_SECTIONS = [
    {
      id: 'output',
      group: 'Output',
      label: 'Output',
      title: 'Output',
      desc: 'Format, paper, stroke, hidden geometry, and overlay style.',
    },
    {
      id: 'linesimplify',
      group: 'Optimization',
      label: 'Simplify',
      title: 'Line Simplify',
      desc: 'Reduce point count while preserving visual shape.',
    },
    {
      id: 'linesort',
      group: 'Optimization',
      label: 'Sort',
      title: 'Line Sort',
      desc: 'Reorder paths to minimize plotter pen-up travel.',
    },
    {
      id: 'filter',
      group: 'Optimization',
      label: 'Filter',
      title: 'Filter',
      desc: 'Drop paths that fall outside length bounds.',
    },
    {
      id: 'multipass',
      group: 'Optimization',
      label: 'Multipass',
      title: 'Multipass',
      desc: 'Duplicate each path with offsets for thicker, denser strokes.',
    },
  ];

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
    const cardByStep = new Map();
    optimizationCards.forEach((card) => {
      const stepId = card.dataset.stepId;
      if (stepId) cardByStep.set(stepId, card);
    });
    panel.innerHTML = '';

    const makeSection = (meta, items) => {
      const sec = document.createElement('section');
      sec.className = 'export-settings-section';
      sec.dataset.sectionId = meta.id;
      const header = document.createElement('header');
      header.className = 'export-settings-section-head';
      header.innerHTML = `
        <div class="export-settings-section-head-text">
          <h3>${meta.title}</h3>
          <p>${meta.desc}</p>
        </div>
        <div class="export-settings-section-head-actions" data-actions-slot="${meta.id}"></div>
      `;
      sec.appendChild(header);
      const body = document.createElement('div');
      body.className = 'export-settings-section-body';
      items.filter(Boolean).forEach((item) => body.appendChild(item));
      sec.appendChild(body);
      return sec;
    };

    // The legacy Stats section is replaced by the Impact Preview pane below
    // the settings scroll, so its `stats` element is intentionally dropped.
    // The Reset Optimization button (`actions`) is hoisted into Output so the
    // user-facing escape hatch is preserved.
    const itemsForSection = (id) => {
      if (id === 'output') return [previewRow, overlayStyleRow, ...exportRows, exportSettingsCard, actions];
      return [cardByStep.get(id)];
    };

    const sections = [];
    SIDEBAR_SECTIONS.forEach((meta) => {
      const items = itemsForSection(meta.id).filter(Boolean);
      if (!items.length) return;
      const sec = makeSection(meta, items);
      panel.appendChild(sec);
      sections.push({ meta, el: sec });
    });

    // Build the sidebar nav inside the modal root and wire activation.
    const navRoot = document.getElementById('export-modal-nav');
    if (navRoot) {
      navRoot.innerHTML = '';
      let lastGroup = null;
      sections.forEach(({ meta }, idx) => {
        if (meta.group !== lastGroup) {
          const heading = document.createElement('div');
          heading.className = 'export-nav-group';
          heading.textContent = meta.group;
          navRoot.appendChild(heading);
          lastGroup = meta.group;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'export-nav-item';
        btn.dataset.sectionId = meta.id;
        btn.innerHTML = `<span class="export-nav-label">${meta.label}</span><span class="export-nav-dot" aria-hidden="true"></span>`;
        if (idx === 0) btn.classList.add('is-active');
        btn.addEventListener('click', () => this.setExportSection(meta.id));
        navRoot.appendChild(btn);
      });
    }

    if (sections.length) {
      const firstId = sections[0].meta.id;
      // Honor a previously-active section across rebuilds so toggling Apply
      // doesn't bounce the user back to the Output tab.
      const prevActive = this.exportModalState?.activeSection;
      const activeId = sections.find((s) => s.meta.id === prevActive)
        ? prevActive
        : firstId;
      sections.forEach(({ meta, el }) => el.classList.toggle('is-active', meta.id === activeId));
      if (navRoot) {
        navRoot.querySelectorAll('.export-nav-item').forEach((btn) => {
          btn.classList.toggle('is-active', btn.dataset.sectionId === activeId);
        });
      }
      if (this.exportModalState) this.exportModalState.activeSection = activeId;
    }

    // Per-tab simplification: each optimization step is now its own screen, so
    // drop the drag grip + per-card Bypass toggle, and lift the Apply toggle
    // up into the section header next to the title.
    sections.forEach(({ meta, el }) => {
      if (!cardByStep.has(meta.id)) return;
      const card = cardByStep.get(meta.id);
      const cardHeader = card.querySelector(':scope > .optimization-card-header');
      if (!cardHeader) return;
      const grip = cardHeader.querySelector('.optimization-grip');
      grip?.remove();
      const toggleLabels = Array.from(cardHeader.querySelectorAll('.opt-toggle'));
      const applyLabel = toggleLabels[0] || null;
      const bypassLabel = toggleLabels[1] || null;
      bypassLabel?.remove();
      const slot = el.querySelector(`.export-settings-section-head-actions[data-actions-slot="${meta.id}"]`);
      if (slot && applyLabel) {
        applyLabel.classList.add('export-section-apply');
        slot.appendChild(applyLabel);
      }
      cardHeader.remove();
    });

    // Wrap raw <input type="checkbox"> in the Output section with .sw-toggle so
    // it picks up the project's toggle styling (Meridian skins) while
    // remaining a plain checkbox on classic skins — matches the convention
    // used elsewhere in the app.
    const outputSection = sections.find((s) => s.meta.id === 'output')?.el;
    if (outputSection) {
      outputSection.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.closest('.sw-toggle')) return;
        const wrap = document.createElement('label');
        wrap.className = 'sw-toggle';
        wrap.setAttribute('role', 'switch');
        wrap.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
        cb.parentNode.insertBefore(wrap, cb);
        wrap.appendChild(cb);
        const track = document.createElement('span');
        track.className = 'sw-track';
        const thumb = document.createElement('span');
        thumb.className = 'sw-thumb';
        wrap.appendChild(track);
        wrap.appendChild(thumb);
        cb.addEventListener('change', () => wrap.setAttribute('aria-checked', cb.checked ? 'true' : 'false'));
      });
    }

    // Three-state dot computation — bypassed (grey) / applied (green) /
    // modified (orange). Computed against SETTINGS.optimizationDefaults so
    // user-edits-from-baseline are detectable across rebuilds, not just
    // since-modal-open.
    const refreshNavStates = () => this.refreshExportNavStates();
    const refreshImpact = () => this.updateExportImpactPreview();
    sections.forEach(({ el }) => {
      el.addEventListener('input', () => { refreshNavStates(); refreshImpact(); });
      el.addEventListener('change', () => { refreshNavStates(); refreshImpact(); });
    });
    this.refreshExportNavStates();
    this.updateExportImpactPreview();

    panel.dataset.exportDecorated = 'true';

    this.attachExportInfoButtons(panel);
  }

  function refreshExportNavStates() {
    const { SETTINGS } = requireDeps('refreshExportNavStates');
    const navRoot = document.getElementById('export-modal-nav');
    if (!navRoot) return;
    const targets = (typeof this.getOptimizationTargets === 'function')
      ? (this.getOptimizationTargets() || [])
      : [];
    const layerCfg = targets[0]?.optimization || null;
    const steps = (layerCfg?.steps) || [];
    const bypassAll = Boolean(layerCfg?.bypassAll);
    const defaults = SETTINGS.optimizationDefaults || { steps: [] };
    const defaultStepMap = new Map((defaults.steps || []).map((s) => [s.id, s]));

    const stateForOptimizationStep = (stepId) => {
      const step = steps.find((s) => s.id === stepId);
      if (!step) return 'bypassed';
      const isBypassed = !step.enabled || step.bypass || bypassAll;
      if (isBypassed) return 'bypassed';
      // Multipass duplicates paths, so any active configuration with passes>1
      // pushes path count / vertices / file size / plot time up. Flag it with
      // its own state so the nav dot can render orange instead of green.
      if (stepId === 'multipass' && Number(step.passes) > 1) return 'increasing';
      const def = defaultStepMap.get(stepId) || {};
      const schema = OPTIMIZATION_STEPS.find((s) => s.id === stepId);
      const keys = (schema?.controls || []).map((c) => c.key);
      const modified = keys.some((k) => step[k] !== def[k]);
      return modified ? 'modified' : 'applied';
    };

    SIDEBAR_SECTIONS.forEach((meta) => {
      const btn = navRoot.querySelector(`.export-nav-item[data-section-id="${meta.id}"]`);
      if (!btn) return;
      let state = '';
      if (meta.id === 'output' || meta.id === 'stats') {
        state = '';
      } else {
        state = stateForOptimizationStep(meta.id);
      }
      if (state) btn.dataset.dotState = state;
      else delete btn.dataset.dotState;
    });
  }

  /**
   * Refresh the Impact Preview pane (4 cells: paths / vertices / file size /
   * plot time). Computes raw before/after stats via engine.computeStats and
   * derives a heuristic file-size estimate from vertex count. Deltas are
   * rendered only when before ≠ after.
   *
   * Called on modal open and on every input/change inside any settings
   * section so the user sees impact live as they tune optimizations.
   */
  function updateExportImpactPreview() {
    const root = document.getElementById('export-impact-preview');
    if (!root) return;
    const targets = (typeof this.getOptimizationTargets === 'function')
      ? (this.getOptimizationTargets() || [])
      : (this.app?.engine?.layers || []);
    const engine = this.app?.engine;
    if (!engine || !targets.length) {
      root.querySelectorAll('[data-impact-val]').forEach((el) => { el.textContent = '—'; });
      root.querySelectorAll('[data-impact-delta]').forEach((el) => { el.textContent = ''; el.removeAttribute('data-trend'); });
      return;
    }
    const before = engine.computeStats(targets, { useOptimized: false, includePlotterOptimize: false });
    const after = engine.computeStats(targets, { useOptimized: true, includePlotterOptimize: true });

    const parseTimeSec = (t) => {
      const m = /^(\d+):(\d+)$/.exec(`${t || ''}`);
      if (!m) return 0;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const beforeTimeSec = parseTimeSec(before.time);
    const afterTimeSec = parseTimeSec(after.time);

    // Heuristic file-size estimate. Each vertex emits ~12 bytes ("L X.XX,Y.YY ")
    // in SVG path data; per-path wrapper ~80b; plus modal/header overhead.
    const estBytes = (s) => 12 * (s.points || 0) + 80 * (s.lines || 0) + 800;
    const beforeBytes = estBytes(before);
    const afterBytes = estBytes(after);

    const formatPaths = (n) => Number(n || 0).toLocaleString();
    const formatVertices = (n) => {
      const v = Number(n || 0);
      if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
      return `${v}`;
    };
    const formatBytes = (b) => {
      if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)}<small>mb</small>`;
      if (b >= 1024) return `${Math.round(b / 1024)}<small>kb</small>`;
      return `${b}<small>b</small>`;
    };
    const formatTime = (sec) => {
      if (!sec || sec < 1) return `0<small>s</small>`;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      if (!m) return `${s}<small>s</small>`;
      return `${m}m<small>${s.toString().padStart(2, '0')}s</small>`;
    };

    const setCell = (cellName, valHtml, deltaText, trend) => {
      const cell = root.querySelector(`[data-impact-cell="${cellName}"]`);
      if (!cell) return;
      const valEl = cell.querySelector('[data-impact-val]');
      const deltaEl = cell.querySelector('[data-impact-delta]');
      if (valEl) valEl.innerHTML = valHtml;
      if (deltaEl) {
        deltaEl.textContent = deltaText || '';
        if (trend) deltaEl.dataset.trend = trend;
        else deltaEl.removeAttribute('data-trend');
      }
    };

    // Main number = the *resulting* export (after optimization). Delta shows
    // savings from the un-optimized baseline so as the user tunes settings,
    // both the value and the delta animate together.
    {
      const beforeN = before.lines || 0;
      const afterN = after.lines || 0;
      const diff = beforeN - afterN;
      let delta = '';
      let trend = '';
      if (diff !== 0) {
        delta = `${diff > 0 ? '↓' : '↑'} ${formatPaths(Math.abs(diff))}`;
        trend = diff > 0 ? 'down' : 'up';
      }
      setCell('paths', formatPaths(afterN), delta, trend);
    }
    const pctDelta = (b, a) => {
      if (!b || b === a) return { text: '', trend: '' };
      const pct = Math.round(((a - b) / b) * 100);
      if (pct === 0) return { text: '', trend: '' };
      return { text: `${pct < 0 ? '↓' : '↑'} ${Math.abs(pct)}%`, trend: pct < 0 ? 'down' : 'up' };
    };
    {
      const d = pctDelta(before.points || 0, after.points || 0);
      setCell('vertices', formatVertices(after.points || 0), d.text, d.trend);
    }
    {
      const d = pctDelta(beforeBytes, afterBytes);
      setCell('size', formatBytes(afterBytes), d.text, d.trend);
    }
    {
      // Plot time uses an absolute delta in seconds since percentage of small
      // numbers reads weird ("↓ 8s" is more meaningful than "↓ 9%").
      const diffSec = beforeTimeSec - afterTimeSec;
      let delta = '';
      let trend = '';
      if (diffSec !== 0 && beforeTimeSec > 0) {
        const abs = Math.abs(diffSec);
        const m = Math.floor(abs / 60);
        const s = Math.floor(abs % 60);
        const human = m ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
        delta = `${diffSec > 0 ? '↓' : '↑'} ${human}`;
        trend = diffSec > 0 ? 'down' : 'up';
      }
      setCell('time', formatTime(afterTimeSec), delta, trend);
    }
  }

  function setExportSection(id) {
    const panel = document.getElementById('optimization-controls')?.querySelector('.optimization-panel');
    const navRoot = document.getElementById('export-modal-nav');
    if (!panel || !navRoot) return;
    panel.querySelectorAll(':scope > .export-settings-section').forEach((sec) => {
      sec.classList.toggle('is-active', sec.dataset.sectionId === id);
    });
    navRoot.querySelectorAll('.export-nav-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.sectionId === id);
    });
    if (this.exportModalState) this.exportModalState.activeSection = id;
    const scroll = document.getElementById('export-settings-scroll');
    if (scroll) scroll.scrollTop = 0;
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
    requireDeps('attachExportInfoButtons');
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
      labelEl.insertAdjacentElement('afterend', btn);

      // Floating popover lives on document.body so it can escape any
      // clipping/flex constraints in the section. It is rebuilt fresh each
      // open so position math always reflects the current button location.
      let popover = null;
      const closePopover = () => {
        if (!popover) return;
        popover.remove();
        popover = null;
        btn.textContent = 'i';
        btn.classList.remove('active');
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        window.removeEventListener('resize', closePopover);
        window.removeEventListener('scroll', closePopover, true);
      };
      const onDocPointerDown = (e) => {
        if (popover && !popover.contains(e.target) && e.target !== btn) closePopover();
      };
      const openPopover = () => {
        popover = document.createElement('div');
        popover.className = 'export-info-popover';
        popover.setAttribute('role', 'tooltip');
        const titleEl = document.createElement('div');
        titleEl.className = 'export-info-popover-title';
        titleEl.textContent = info.title || '';
        const bodyEl = document.createElement('div');
        bodyEl.className = 'export-info-popover-body';
        bodyEl.textContent = info.description;
        if (info.title) popover.appendChild(titleEl);
        popover.appendChild(bodyEl);
        document.body.appendChild(popover);

        const rect = btn.getBoundingClientRect();
        const margin = 8;
        const popRect = popover.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - popRect.width / 2;
        let top = rect.bottom + margin;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (left + popRect.width > vw - 8) left = vw - popRect.width - 8;
        if (left < 8) left = 8;
        if (top + popRect.height > vh - 8) top = rect.top - margin - popRect.height;
        popover.style.left = `${Math.round(left)}px`;
        popover.style.top = `${Math.round(top)}px`;

        btn.textContent = '×';
        btn.classList.add('active');
        // Defer the outside-click listener one tick so the click that opened
        // the popover doesn't immediately close it.
        setTimeout(() => document.addEventListener('pointerdown', onDocPointerDown, true), 0);
        window.addEventListener('resize', closePopover);
        window.addEventListener('scroll', closePopover, true);
      };

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popover) closePopover();
        else openPopover();
      });
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
          if (/^Precision$/i.test(text)) addInfoToggle(label, 'precision');
          if (/Export Stroke Override/i.test(text)) addInfoToggle(label, 'strokeWidthOverride');
          else if (/^Stroke\b/i.test(text)) addInfoToggle(label, 'strokeWidth');
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

  /**
   * Grouped installer for the `#btn-export` click handler. `this` is the
   * UI instance; the handler delegates to `this.openExportModal()` which
   * is also installed by this module.
   */
  function bindExportButton() {
    const { getEl } = requireDeps('bindExportButton');
    const btnExport = getEl('btn-export', { silent: true });
    if (btnExport) btnExport.onclick = () => this.openExportModal();
    const btnAnimated = getEl('btn-export-animated', { silent: true });
    if (btnAnimated) btnAnimated.onclick = () => this.exportAnimatedSVG();
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
      <div class="export-modal-body">
        <nav id="export-modal-nav" class="export-modal-nav" aria-label="Export settings sections"></nav>
        <div id="export-modal-settings" class="export-modal-settings">
          <div id="export-settings-scroll" class="export-settings-scroll"></div>
          <aside id="export-impact-preview" class="export-impact-preview" aria-label="Export impact preview">
            <div class="export-impact-head">
              <h4>Impact Preview</h4>
              <div class="export-impact-actions" data-impact-actions></div>
            </div>
            <div class="export-impact-grid">
              <div class="export-impact-cell" data-impact-cell="paths">
                <span class="export-impact-label">Paths</span>
                <span class="export-impact-val" data-impact-val>—</span>
                <span class="export-impact-delta" data-impact-delta></span>
              </div>
              <div class="export-impact-cell" data-impact-cell="vertices">
                <span class="export-impact-label">Vertices</span>
                <span class="export-impact-val accent" data-impact-val>—</span>
                <span class="export-impact-delta" data-impact-delta></span>
              </div>
              <div class="export-impact-cell" data-impact-cell="size">
                <span class="export-impact-label">File Size</span>
                <span class="export-impact-val" data-impact-val>—</span>
                <span class="export-impact-delta" data-impact-delta></span>
              </div>
              <div class="export-impact-cell" data-impact-cell="time">
                <span class="export-impact-label">Plot Time</span>
                <span class="export-impact-val" data-impact-val>—</span>
                <span class="export-impact-delta" data-impact-delta></span>
              </div>
            </div>
          </aside>
        </div>
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
      </div>
      <div class="export-modal-footer" id="export-modal-footer">
        <button type="button" id="export-modal-cancel">Cancel</button>
        <button type="button" id="export-modal-submit" class="export-primary">Export SVG</button>
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
    // buildControls early-returns for group/modifier active layers (mirror,
    // folder, fill-pattern tool, empty doc) before reaching the block that
    // populates this modal's optimization-controls panel. Recover by
    // temporarily promoting any non-group layer to active for one rebuild,
    // then restoring the original active and rebuilding the LEFT panel.
    if (controls && !controls.querySelector('.optimization-panel')) {
      const engine = this.app.engine;
      const originalActiveId = engine?.activeLayerId ?? null;
      const fallback = (engine?.layers || []).find((l) => l && !l.isGroup);
      if (fallback && fallback.id !== originalActiveId) {
        engine.activeLayerId = fallback.id;
        this.buildControls();
        engine.activeLayerId = originalActiveId;
        this.buildControls();
      }
    }
    this.decorateExportControlsPanel();
    this.resizeExportPreviewCanvas();
  }

  // Optimization-target methods: pure `this.*`-based — only the SETTINGS
  // read needs DI (already bound).
  function getOptimizationTargets() {
    const SETTINGS = (DEPS && DEPS.SETTINGS) || (G.Vectura && G.Vectura.SETTINGS) || {};
    const scope = SETTINGS.optimizationScope || 'all';
    let targets = [];
    if (scope === 'selected') {
      targets = this.app.getSelectedLayers();
    } else if (scope === 'all') {
      targets = this.app.engine.layers.filter((layer) => !layer.isGroup);
    } else {
      const active = this.app.engine.getActiveLayer?.();
      if (active) targets = [active];
    }
    if (!targets.length) {
      const active = this.app.engine.getActiveLayer?.();
      if (active) targets = [active];
    }
    return targets.filter((layer) => layer && !layer.isGroup);
  }

  function getOptimizationTargetIds() {
    return new Set(this.getOptimizationTargets().map((layer) => layer.id));
  }

  function optimizeTargetsForCurrentScope(options = {}) {
    const targets = this.getOptimizationTargets();
    const targetIds = new Set(targets.map((layer) => layer.id));
    if (!targets.length) return { targets, targetIds, config: null, map: new Map() };
    const runOptions = { ...options };
    if (!runOptions.config && targets.length > 1) {
      // Deep-clone via JSON round-trip — matches legacy `clone()` (which was
      // structurally `JSON.parse(JSON.stringify(x))` for plain config objects).
      runOptions.config = JSON.parse(JSON.stringify(this.app.engine.ensureLayerOptimization(targets[0])));
    }
    const map = this.app.optimizeLayers(targets, runOptions);
    return {
      targets,
      targetIds,
      config: runOptions.config || null,
      map,
    };
  }

  Modals.ExportSvg = {
    /**
     * Relocated tables (Meridian Unit 1.3). Exposed publicly so legacy /
     * sibling satellites (e.g. algo-config-panel.js, which still pulls
     * OPTIMIZATION_STEPS through its own DI bag) can read the same data.
     * Treat as read-only.
     */
    OPTIMIZATION_STEPS,
    EXPORT_INFO,
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps
     * @param {function} deps.getEl                        Module-local DOM lookup.
     * @param {object}   deps.SETTINGS                     Live settings dict.
     * @param {function} deps.clamp                        Numeric clamp helper.
     * @param {function} deps.getThemeToken                CSS var resolver.
     * @param {function} deps.getContrastTextColor         Color-contrast helper for legend pills.
     * @param {function} deps.openColorPickerAnchoredTo    Anchored color-picker opener.
     */
    bind(deps) {
      DEPS = deps || {};
    },
    bindExportButton,
    openExportModal,
    fitExportPreview,
    resizeExportPreviewCanvas,
    renderExportPreview,
    decorateExportControlsPanel,
    setExportSection,
    refreshExportNavStates,
    updateExportImpactPreview,
    syncLegendSettingsControls,
    attachExportInfoButtons,
    buildExportPreviewPath,
    buildExportClipPolygons,
    // ── Unit 1.9c: optimization-target methods ────────────────────────
    getOptimizationTargets,
    getOptimizationTargetIds,
    optimizeTargetsForCurrentScope,
    installOn(proto) {
      proto.bindExportButton = function() { return bindExportButton.call(this); };
      proto.openExportModal = function() { return openExportModal.call(this); };
      proto.fitExportPreview = function() { return fitExportPreview.call(this); };
      proto.resizeExportPreviewCanvas = function() { return resizeExportPreviewCanvas.call(this); };
      proto.renderExportPreview = function() { return renderExportPreview.call(this); };
      proto.decorateExportControlsPanel = function() { return decorateExportControlsPanel.call(this); };
      proto.setExportSection = function(id) { return setExportSection.call(this, id); };
      proto.refreshExportNavStates = function() { return refreshExportNavStates.call(this); };
      proto.updateExportImpactPreview = function() { return updateExportImpactPreview.call(this); };
      proto.syncLegendSettingsControls = function(root) { return syncLegendSettingsControls.call(this, root); };
      proto.attachExportInfoButtons = function(panel) { return attachExportInfoButtons.call(this, panel); };
      proto.buildExportPreviewPath = function(...args) { return buildExportPreviewPath.apply(this, args); };
      proto.buildExportClipPolygons = function(...args) { return buildExportClipPolygons.apply(this, args); };
      // ── Unit 1.9c installers ────────────────────────────────────────
      proto.getOptimizationTargets = function() { return getOptimizationTargets.call(this); };
      proto.getOptimizationTargetIds = function() { return getOptimizationTargetIds.call(this); };
      proto.optimizeTargetsForCurrentScope = function(options) { return optimizeTargetsForCurrentScope.call(this, options); };
    },
  };
})();
