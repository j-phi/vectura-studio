/**
 * Canvas renderer for vector paths.
 */
(() => {
  const { SETTINGS, Modifiers = {}, Masking = {}, UnitUtils = {}, UI_CONSTANTS = {} } = window.Vectura || {};
  const isModifierLayer = Modifiers.isModifierLayer || (() => false);
  const getMirrorAxis = Modifiers.getMirrorAxis || (() => null);
  const buildAxisFromAngle = Modifiers.buildAxisFromAngle || (() => null);
  const clipInfiniteAxisToBounds = Modifiers.clipInfiniteAxisToBounds || (() => null);
  const reflectPointAcrossAxis = Modifiers.reflectPointAcrossAxis || ((pt) => pt);
  const getLayerSilhouette = Masking.getLayerSilhouette || (() => []);
  const buildLayerMaskedPaths = Masking.buildLayerMaskedPaths || ((layer) => layer?.effectivePaths || layer?.paths || []);
  const applyMaskToPaths = Masking.applyMaskToPaths || ((paths) => paths || []);
  const getMaskingAncestors = Masking.getMaskingAncestors || (() => []);
  const normalizeDocumentUnits = UnitUtils.normalizeDocumentUnits || ((value) => (`${value || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
  const formatDocumentLength = UnitUtils.formatDocumentLength || ((valueMm, units, options = {}) => {
    const resolvedUnits = normalizeDocumentUnits(units);
    const precision = Number.isFinite(options.precision) ? options.precision : (resolvedUnits === 'imperial' ? 2 : 1);
    const unit = resolvedUnits === 'imperial' ? 'in' : 'mm';
    const value = resolvedUnits === 'imperial' ? Number(valueMm || 0) / 25.4 : Number(valueMm || 0);
    let text = Number.isFinite(value) ? value.toFixed(precision) : '0';
    if (options.trimTrailingZeros && text.includes('.')) text = text.replace(/\.?0+$/, '');
    return `${text}${options.spaceBeforeUnit ? ' ' : ''}${unit}`;
  });
  const TAU = Math.PI * 2;
  const ELLIPSE_KAPPA = 0.5522847498307936;
  const {
    SHAPE_CORNER_HANDLE_MIN = 8,
    MASK_PREVIEW_ALPHA = 0.2,
    ROTATE_ARROW_OFFSET = 9,
    ROTATE_TRIANGLE_LIFT = 9,
    ROTATE_TRIANGLE_HALF_WIDTH = 12.2,
    ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH = 15.6,
    ROTATE_TRIANGLE_TIP_LENGTH = 10.8,
    ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH = 13.8,
  } = UI_CONSTANTS;
  const makeShapeReticleCursor = (color = 'white') => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">`
      + `<g fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">`
      + `<path d="M16 4.5v4M16 23.5v4M4.5 16h4M23.5 16h4"/>`
      + `</g>`
      + `<circle cx="16" cy="16" r="1.75" fill="${color}"/>`
      + `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
  };
  const { clamp } = window.Vectura.AlgorithmUtils;

  // Phase 2 step 7: theme-token cache reads --ui-* directly per the Meridian
  // skin migration plan §"Token-cache migration ordering". Legacy palette files
  // (classic-dark/light, lark) alias --ui-* → --color-*; Meridian palettes
  // alias --color-* → --ui-* (when defined). So a single read path that
  // consults --ui-* first works byte-equivalently for legacy skins AND adopts
  // the canonical Meridian tokens.
  //
  // Invalidation is wired to two mechanisms so stale values can never persist:
  //   1. Synchronous key check: getThemeToken reads data-ui-skin on every call
  //      and clears the cache when the active skin id changes. applyTheme sets
  //      data-ui-skin before calling render(), so draw() always sees fresh values.
  //   2. vectura:skin-change event (fired one rAF after SkinManager.activate):
  //      catches late-loaded stylesheet tokens that weren't yet in getComputedStyle
  //      when draw() ran synchronously.
  //
  // The tokens helper from src/ui/skin/tokens.js (`window.Vectura.UI.tokens.get`)
  // would also work but performs no caching; the renderer reads the same tokens
  // many times per frame, so we keep the per-renderer Map<name, value> cache.
  // The cache surface is mirrored on `Renderer.__tokenCache` so unit tests can
  // exercise it without instantiating a full Renderer.
  const _themeTokenCache = new Map();
  let _themeTokenCacheKey = null;
  const _UI_TOKEN_FOR_COLOR = (name) => {
    // Map a legacy --color-* name to its --ui-* canonical sibling. Returns null
    // when no analog exists (e.g., specialized renderer-only colors). Keep this
    // narrow — it must mirror the aliases set by every skin file under
    // src/ui/skin/*.css. Today only one --color-* token is consulted by the
    // renderer (`--color-accent`), but new entries belong here.
    if (name === '--color-accent') return '--ui-accent';
    return null;
  };
  const _readVar = (name) => {
    if (typeof document === 'undefined' || !document.documentElement) return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };
  const getThemeToken = (name, fallback = '') => {
    if (typeof document === 'undefined' || !document.documentElement) return fallback;
    // Synchronously invalidate when skin id changes. applyTheme sets data-ui-skin
    // before calling render(), so this always reflects the incoming theme.
    const themeKey = document.documentElement.dataset.uiSkin || document.documentElement.dataset.theme || '';
    if (themeKey !== _themeTokenCacheKey) {
      _themeTokenCache.clear();
      _themeTokenCacheKey = themeKey;
    }
    if (_themeTokenCache.has(name)) return _themeTokenCache.get(name);
    let value = '';
    const uiAlias = _UI_TOKEN_FOR_COLOR(name);
    if (uiAlias) {
      // Try canonical --ui-* first (Meridian); fall back to the original
      // --color-* (legacy skins where --ui-accent itself aliases to --color-accent).
      value = _readVar(uiAlias) || _readVar(name);
    } else {
      value = _readVar(name);
    }
    const result = value || fallback;
    _themeTokenCache.set(name, result);
    return result;
  };
  const invalidateThemeTokenCache = () => { _themeTokenCache.clear(); };
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('vectura:skin-change', invalidateThemeTokenCache);
  }
  const distance = (a, b) => Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
  const clonePoint = (pt) => ({ x: pt.x, y: pt.y });
  const cloneHandle = (pt) => (pt ? { x: pt.x, y: pt.y } : null);
  const cloneAnchor = (anchor) => ({
    x: anchor.x,
    y: anchor.y,
    in: cloneHandle(anchor.in),
    out: cloneHandle(anchor.out),
  });
  const normalizePoint = (pt) => {
    const len = Math.hypot(pt?.x ?? 0, pt?.y ?? 0);
    if (!len) return { x: 0, y: 0 };
    return { x: pt.x / len, y: pt.y / len };
  };
  const dot = (a, b) => (a?.x ?? 0) * (b?.x ?? 0) + (a?.y ?? 0) * (b?.y ?? 0);
  const polygonArea = (vertices = []) => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area * 0.5;
  };
  const buildRectangleVertices = (shape) => {
    const minX = Math.min(shape.x1, shape.x2);
    const minY = Math.min(shape.y1, shape.y2);
    const maxX = Math.max(shape.x1, shape.x2);
    const maxY = Math.max(shape.y1, shape.y2);
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  };
  const buildPolygonVertices = (shape) => {
    const sides = Math.max(3, Math.round(shape.sides ?? 6));
    const radius = Math.max(0.1, shape.radius ?? 0.1);
    const rotation = shape.rotation ?? -Math.PI / 2;
    const vertices = [];
    for (let i = 0; i < sides; i++) {
      const theta = rotation + (i / sides) * TAU;
      vertices.push({
        x: shape.cx + Math.cos(theta) * radius,
        y: shape.cy + Math.sin(theta) * radius,
      });
    }
    return vertices;
  };
  const getShapeVertices = (shape) => {
    if (!shape || typeof shape !== 'object') return [];
    if (shape.type === 'rect') return buildRectangleVertices(shape);
    if (shape.type === 'polygon') return buildPolygonVertices(shape);
    return [];
  };
  const getShapeRadii = (shape, vertexCount) => {
    if (!shape || shape.type === 'oval') return [];
    const base = Array.isArray(shape.cornerRadii) ? shape.cornerRadii.slice(0, vertexCount) : [];
    while (base.length < vertexCount) base.push(base.length ? base[base.length - 1] : 0);
    return base.map((value) => Math.max(0, Number(value) || 0));
  };
  const getCornerDescriptors = (shape) => {
    const vertices = getShapeVertices(shape);
    if (!vertices.length) return [];
    const area = polygonArea(vertices);
    const radii = getShapeRadii(shape, vertices.length);
    return vertices.map((vertex, index) => {
      const prev = vertices[(index - 1 + vertices.length) % vertices.length];
      const next = vertices[(index + 1) % vertices.length];
      const prevDir = normalizePoint({ x: prev.x - vertex.x, y: prev.y - vertex.y });
      const nextDir = normalizePoint({ x: next.x - vertex.x, y: next.y - vertex.y });
      let inward = normalizePoint({ x: prevDir.x + nextDir.x, y: prevDir.y + nextDir.y });
      if (!inward.x && !inward.y) {
        inward = normalizePoint({ x: next.y - prev.y, y: prev.x - next.x });
      }
      const centroid = vertices.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
      centroid.x /= vertices.length;
      centroid.y /= vertices.length;
      const toCenter = normalizePoint({ x: centroid.x - vertex.x, y: centroid.y - vertex.y });
      if (dot(inward, toCenter) < 0) inward = { x: -inward.x, y: -inward.y };
      if (area < 0) inward = { x: -inward.x, y: -inward.y };
      const edgeAngle = Math.acos(clamp(dot(prevDir, nextDir), -1, 1));
      const halfAngle = Math.max(1e-4, edgeAngle * 0.5);
      const sinHalf = Math.sin(halfAngle);
      const tanHalf = Math.tan(halfAngle);
      const prevLen = distance(vertex, prev);
      const nextLen = distance(vertex, next);
      const maxRadius = tanHalf > 1e-4 ? Math.min(prevLen, nextLen) * tanHalf * 0.5 : 0;
      return {
        index,
        vertex,
        inward,
        sinHalf,
        tanHalf,
        prevDir,
        nextDir,
        prevLen,
        nextLen,
        radius: Math.min(radii[index] || 0, maxRadius),
        maxRadius,
      };
    });
  };
  const buildEllipseAnchors = (shape) => {
    const rx = Math.max(0.1, Math.abs(shape.rx ?? 0));
    const ry = Math.max(0.1, Math.abs(shape.ry ?? 0));
    const cx = shape.cx ?? 0;
    const cy = shape.cy ?? 0;
    const ox = rx * ELLIPSE_KAPPA;
    const oy = ry * ELLIPSE_KAPPA;
    return [
      { x: cx, y: cy - ry, in: { x: cx - ox, y: cy - ry }, out: { x: cx + ox, y: cy - ry } },
      { x: cx + rx, y: cy, in: { x: cx + rx, y: cy - oy }, out: { x: cx + rx, y: cy + oy } },
      { x: cx, y: cy + ry, in: { x: cx + ox, y: cy + ry }, out: { x: cx - ox, y: cy + ry } },
      { x: cx - rx, y: cy, in: { x: cx - rx, y: cy + oy }, out: { x: cx - rx, y: cy - oy } },
    ];
  };
  const buildRoundedPolygonAnchors = (shape) => {
    const descriptors = getCornerDescriptors(shape);
    if (!descriptors.length) return [];
    const anchors = [];
    descriptors.forEach((descriptor) => {
      if (descriptor.radius <= 1e-4 || descriptor.tanHalf <= 1e-4) {
        anchors.push({ x: descriptor.vertex.x, y: descriptor.vertex.y, in: null, out: null });
        return;
      }
      const tangentDistance = Math.min(
        descriptor.prevLen * 0.5,
        descriptor.nextLen * 0.5,
        descriptor.radius / descriptor.tanHalf
      );
      const start = {
        x: descriptor.vertex.x + descriptor.prevDir.x * tangentDistance,
        y: descriptor.vertex.y + descriptor.prevDir.y * tangentDistance,
      };
      const end = {
        x: descriptor.vertex.x + descriptor.nextDir.x * tangentDistance,
        y: descriptor.vertex.y + descriptor.nextDir.y * tangentDistance,
      };
      const arcAngle = Math.PI - Math.max(1e-4, Math.acos(clamp(dot(descriptor.prevDir, descriptor.nextDir), -1, 1)));
      const handleLength = (4 / 3) * Math.tan(arcAngle / 4) * descriptor.radius;
      anchors.push({
        x: start.x,
        y: start.y,
        in: null,
        out: {
          x: start.x - descriptor.prevDir.x * handleLength,
          y: start.y - descriptor.prevDir.y * handleLength,
        },
      });
      anchors.push({
        x: end.x,
        y: end.y,
        in: {
          x: end.x - descriptor.nextDir.x * handleLength,
          y: end.y - descriptor.nextDir.y * handleLength,
        },
        out: null,
      });
    });
    return anchors;
  };
  const buildLineAnchors = (shape) => {
    const x1 = Number.isFinite(shape?.x1) ? shape.x1 : 0;
    const y1 = Number.isFinite(shape?.y1) ? shape.y1 : 0;
    const x2 = Number.isFinite(shape?.x2) ? shape.x2 : 0;
    const y2 = Number.isFinite(shape?.y2) ? shape.y2 : 0;
    return [
      { x: x1, y: y1, in: null, out: null },
      { x: x2, y: y2, in: null, out: null },
    ];
  };
  const isOpenShape = (shape) => shape?.type === 'line';
  const buildShapeAnchors = (shape) => {
    if (!shape || typeof shape !== 'object') return [];
    if (shape.type === 'oval') return buildEllipseAnchors(shape);
    if (shape.type === 'rect' || shape.type === 'polygon') return buildRoundedPolygonAnchors(shape);
    if (shape.type === 'line') return buildLineAnchors(shape);
    return [];
  };
  const cloneShape = (shape) => (shape ? JSON.parse(JSON.stringify(shape)) : null);
  const getShapeCornerHandlePosition = (descriptor, scale = 1) => {
    if (!descriptor) return null;
    const minDist = SHAPE_CORNER_HANDLE_MIN / Math.max(scale || 1, 0.01);
    const centerDist = descriptor.sinHalf > 1e-4 ? descriptor.radius / descriptor.sinHalf : 0;
    const dist = Math.max(minDist, centerDist);
    return {
      x: descriptor.vertex.x + descriptor.inward.x * dist,
      y: descriptor.vertex.y + descriptor.inward.y * dist,
    };
  };
  const buildBoundsFromVertices = (vertices, origin, rotation) => {
    if (!Array.isArray(vertices) || !vertices.length || !origin) return null;
    const cosR = Math.cos(rotation || 0);
    const sinR = Math.sin(rotation || 0);
    const unrotate = (pt) => {
      const dx = pt.x - origin.x;
      const dy = pt.y - origin.y;
      return {
        x: dx * cosR + dy * sinR,
        y: -dx * sinR + dy * cosR,
      };
    };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    vertices.forEach((pt) => {
      const local = unrotate(pt);
      minX = Math.min(minX, local.x);
      minY = Math.min(minY, local.y);
      maxX = Math.max(maxX, local.x);
      maxY = Math.max(maxY, local.y);
    });
    if (!Number.isFinite(minX)) return null;
    const toWorld = (local) => ({
      x: origin.x + local.x * cosR - local.y * sinR,
      y: origin.y + local.x * sinR + local.y * cosR,
    });
    const center = toWorld({ x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 });
    return {
      minX,
      minY,
      maxX,
      maxY,
      rotation: rotation || 0,
      origin,
      center,
      corners: {
        nw: toWorld({ x: minX, y: minY }),
        ne: toWorld({ x: maxX, y: minY }),
        se: toWorld({ x: maxX, y: maxY }),
        sw: toWorld({ x: minX, y: maxY }),
      },
    };
  };

  class Renderer {
    constructor(id, engine) {
      this.canvas = document.getElementById(id);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.engine = engine;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.userHasManipulated = false;
      this.isPan = false;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.dragStart = { x: 0, y: 0 };
      this.startBounds = null;
      this.tempTransform = null;
      this.rotateOrigin = null;
      this.rotateStartAngle = 0;
      this.rotateStart = 0;
      this.guides = null;
      this.selectedLayerId = null;
      this.selectedLayerIds = new Set();
      // Illustrator-style "key object" — the anchor that Align-To: Key Object
      // uses as its reference rect. Cleared whenever the layer leaves the
      // selection or selection drops below 2 layers.
      this.keyObjectId = null;
      this.isSelecting = false;
      this.selectionStart = null;
      this.selectionRect = null;
      this.selectionPath = null;
      this.lassoPath = null;
      this.isLassoSelecting = false;
      this.activeTool = SETTINGS.activeTool || 'select';
      this.paintBucketStack = null;
      this.paintBucketScopeIndex = 0;
      this.paintBucketStackKey = null;
      this.patternFillPreviewInnerPolygon = null;
      this.lastPourLoopId = null;
      // Refs to the fill records in the "active batch" — the set that panel
      // slider/variant edits retarget in place. Empty means no active batch
      // (panel mutations only update the template for the next pour).
      // Lifecycle: plain click resets to a 1-fill batch; Shift+drag accumulates
      // within one drag; CMD+click adopts an existing fill; Esc / Done /
      // tool switch commits (clears) the batch.
      this.lastPaintedFillRefs = [];
      this.scissorMode = SETTINGS.scissorMode || 'line';
      this.penMode = SETTINGS.penMode || 'draw';
      this.penPurpose = 'draw';
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.isPenCloseDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this._penLastClick = null;
      this.penSnapToOrigin = false;
      this.groupEditMode = null;
      this._selectLastClick = null;
      this.shapeDraft = null;
      this.shapeDraftSides = 6;
      this.shapeCornerDrag = null;
      this.algoDraft = null;
      this.algoDraftType = 'wavetable';
      this._lastAlgoTap = { time: 0, x: 0, y: 0 };
      this.directSelection = null;
      this.directDrag = null;
      this.penAnchorDrag = null;
      this.directAuxSelections = [];
      this.isDirectMarquee = false;
      this.directMarqueeStart = null;
      this.directMarqueeRect = null;
      this.maskPreview = null;
      this.mirrorDragState = null;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.isScissor = false;
      this.lightSource = SETTINGS.lightSource || null;
      this.lightSourceSelected = false;
      this.lightSourcePlacement = false;
      this.isLightDrag = false;
      this.lightDragOffset = { x: 0, y: 0 };
      this.modifierDrag = null;
      this.onSelectLayer = null;
      this.onPenComplete = null;
      this.onShapeComplete = null;
      this.onScissor = null;
      this.onDirectEditStart = null;
      this.onDirectEditCommit = null;
      this.onPatternFill = null;
      this.patternFillPreviewPolygon = null;
      this.isLayerLocked = null;
      this.lastM = { x: 0, y: 0 };
      this.snap = null;
      this.snapAllowed = true;
      this.activePointerId = null;
      this.touchPointers = new Map();
      this.touchGesture = null;
      this.touchHoldTimer = null;
      this.touchHoldPending = null;
      this.touchHoldStartClient = null;
      this.exportModalOpen = false;
      this.ready = Boolean(this.canvas && this.ctx);

      if (!this.ready) {
        console.warn(`[Renderer] Missing canvas or context for #${id}`);
        return;
      }

      const parent = this.canvas.parentElement;
      if (!parent) {
        console.warn('[Renderer] Canvas has no parent element.');
        this.ready = false;
        return;
      }

      new ResizeObserver(() => this.resize()).observe(parent);
      this.canvas.addEventListener('pointerenter', () => this.updateCursor());
      this.canvas.addEventListener('pointerleave', () => this._paintBucketClearHover());
      this.canvas.addEventListener('mouseleave', () => this._paintBucketClearHover());
      this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      this._boundMove = (e) => this.move(e);
      this._boundUp = (e) => this.up(e);
      if (window.PointerEvent) {
        this.canvas.addEventListener('pointerdown', (e) => this.down(e));
        window.addEventListener('pointermove', this._boundMove);
        window.addEventListener('pointerup', this._boundUp);
        window.addEventListener('pointercancel', this._boundUp);
      } else {
        this._boundMouseMove = (e) => this.move(e);
        this._boundMouseUp = (e) => this.up(e);
        this.canvas.addEventListener('mousedown', (e) => this.down(e));
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('mouseup', this._boundMouseUp);
      }

      // Track Alt/Meta key state at the document level so we can swap the
      // canvas cursor (e.g. select→copy-plus on Alt, fill→microscope on CMD)
      // even when the mouse hasn't moved.
      this._modState = { alt: false, meta: false };
      this._onModKeyChange = (e) => {
        const alt = Boolean(e.altKey);
        const meta = Boolean(e.metaKey || e.ctrlKey);
        if (alt === this._modState.alt && meta === this._modState.meta) return;
        const wasMeta = this._modState.meta;
        this._modState.alt = alt;
        this._modState.meta = meta;
        // CMD released while the panel is showing the sample-empty prompt —
        // restore the normal Paint Bucket controls.
        if (wasMeta && !meta) {
          this.app?.paintBucketPanel?.setSampleEmptyMode?.(false);
        }
        // Reset to the tool-default cursor first, then refine via hover. This
        // matters when the active branch of updateHoverCursor early-returns
        // (e.g. fill tool relies on updateCursor to set the bucket).
        this.updateCursor();
        if (this._lastPointerEvent && !this.isLayerDrag && !this.isSelecting) {
          this.updateHoverCursor(this._lastPointerEvent);
        }
      };
      this._onWindowBlur = () => {
        if (!this._modState.alt && !this._modState.meta) return;
        this._modState.alt = false;
        this._modState.meta = false;
        this.app?.paintBucketPanel?.setSampleEmptyMode?.(false);
        this.updateCursor();
      };
      document.addEventListener('keydown', this._onModKeyChange);
      document.addEventListener('keyup', this._onModKeyChange);
      window.addEventListener('blur', this._onWindowBlur);
    }

    destroy() {
      if (this._boundMove) {
        window.removeEventListener('pointermove', this._boundMove);
        window.removeEventListener('pointerup', this._boundUp);
        window.removeEventListener('pointercancel', this._boundUp);
      }
      if (this._boundMouseMove) {
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup', this._boundMouseUp);
      }
      if (this._onModKeyChange) {
        document.removeEventListener('keydown', this._onModKeyChange);
        document.removeEventListener('keyup', this._onModKeyChange);
      }
      if (this._onWindowBlur) {
        window.removeEventListener('blur', this._onWindowBlur);
      }
    }

    getOptimizationTargetIds() {
      const scope = SETTINGS.optimizationScope || 'all';
      let ids = [];
      if (scope === 'selected') {
        ids = Array.from(this.selectedLayerIds || []).filter((id) =>
          this.engine.layers.some((layer) => layer && !layer.isGroup && layer.id === id)
        );
      } else if (scope === 'active') {
        const activeId = this.engine.activeLayerId;
        if (activeId && this.engine.layers.some((layer) => layer && !layer.isGroup && layer.id === activeId)) {
          ids = [activeId];
        }
      } else {
        ids = this.engine.layers.filter((layer) => layer && !layer.isGroup).map((layer) => layer.id);
      }
      if (!ids.length) {
        const activeId = this.engine.activeLayerId;
        if (activeId && this.engine.layers.some((layer) => layer && !layer.isGroup && layer.id === activeId)) {
          ids = [activeId];
        }
      }
      return new Set(ids);
    }

    setTool(tool) {
      if (!tool) return;
      this.clearMaskPreview();
      if (tool !== 'pen') {
        this.penDraft = null;
        this.penPreview = null;
        this.isPenDragging = false;
        this.penDragAnchor = null;
        this.penDragStart = null;
        this.penPurpose = 'draw';
        this.penAnchorDrag = null;
      }
      if (!`${tool}`.startsWith('shape-')) {
        this.shapeDraft = null;
      }
      if (tool !== 'direct') {
        this.directDrag = null;
        this.directAuxSelections = [];
        this.isDirectMarquee = false;
        this.directMarqueeStart = null;
        this.directMarqueeRect = null;
      }
      if (tool !== 'scissor') {
        this.isScissor = false;
        this.scissorStart = null;
        this.scissorEnd = null;
      }
      if (tool !== 'lasso') {
        this.isLassoSelecting = false;
        this.lassoPath = null;
      }
      this.activeTool = tool;
      this.updateCursor();
      if (!['fill', 'fill-erase', 'fill-pattern', 'fill-pattern-erase'].includes(tool)) {
        this.hideFillLoupe?.();
        this.patternFillPreviewPolygon = null;
        this.patternFillPreviewInnerPolygon = null;
      }
      if (tool !== 'fill' && tool !== 'fill-erase') {
        this.paintBucketStack = null;
        this.paintBucketScopeIndex = 0;
        this.paintBucketStackKey = null;
        this.patternFillPreviewInnerPolygon = null;
        this.lastPourLoopId = null;
        // Commit any active batch when leaving the fill tool. This clears the
        // panel chip and outline overlay; the fill records themselves stay
        // on the layer.
        if (Array.isArray(this.lastPaintedFillRefs) && this.lastPaintedFillRefs.length) {
          this.commitActiveBatch();
        }
      }
      this.draw();
    }

    setPenMode(mode) {
      if (!mode) return;
      this.penMode = mode;
      SETTINGS.penMode = mode;
      this.updateCursor();
      this.draw();
    }

    setScissorMode(mode) {
      if (!mode) return;
      this.scissorMode = mode;
      this.draw();
    }

    setLightSourceMode(active) {
      this.lightSourcePlacement = Boolean(active);
      if (this.lightSourcePlacement) {
        this.lightSourceSelected = false;
        this.clearSelection();
      }
      this.draw();
    }

    setLightSource(point) {
      if (!point) return;
      this.lightSource = { x: point.x, y: point.y };
      SETTINGS.lightSource = { x: point.x, y: point.y };
      this.lightSourceSelected = true;
      this.draw();
    }

    clearLightSource() {
      this.lightSource = null;
      SETTINGS.lightSource = null;
      this.lightSourceSelected = false;
      this.lightSourcePlacement = false;
      this.draw();
    }

    hitLightSource(world) {
      if (!this.lightSource || !world) return false;
      const r = 6 / this.scale;
      const dx = world.x - this.lightSource.x;
      const dy = world.y - this.lightSource.y;
      return dx * dx + dy * dy <= r * r;
    }

    setCanvasCursor(cursor = 'crosshair', mode = '') {
      if (!this.canvas) return;
      this.canvas.style.cursor = cursor;
      const isKeyword = typeof cursor === 'string' && !cursor.includes('(');
      this.canvas.dataset.cursorMode = mode || (isKeyword ? cursor : '') || 'default';
    }

    cursorDataUrl(name, hotX = 0, hotY = 0, fallback = 'auto', ...factoryArgs) {
      const factory = window.Vectura?.Icons?.cursor?.[name];
      if (typeof factory !== 'function') return fallback;
      const svg = factory(...factoryArgs);
      const encoded = encodeURIComponent(svg)
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
      return `url("data:image/svg+xml;utf8,${encoded}") ${hotX} ${hotY}, ${fallback}`;
    }

    ensureDragTooltip() {
      if (this._dragTooltipEl) return this._dragTooltipEl;
      const el = document.createElement('div');
      el.className = 'drag-value-tooltip';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      this._dragTooltipEl = el;
      return el;
    }

    showDragTooltip(text, clientX, clientY) {
      const el = this.ensureDragTooltip();
      el.textContent = text;
      el.style.left = `${clientX + 14}px`;
      el.style.top = `${clientY - 10}px`;
      el.style.display = 'block';
    }

    hideDragTooltip() {
      if (this._dragTooltipEl) this._dragTooltipEl.style.display = 'none';
    }

    ensureFillLoupe() {
      if (this.fillLoupeEl) return this.fillLoupeEl;
      if (!this.canvas) return null;
      const root = document.createElement('div');
      root.className = 'fill-loupe';
      root.setAttribute('aria-hidden', 'true');
      const loupe = document.createElement('canvas');
      loupe.className = 'fill-loupe-magnifier';
      loupe.width = 96;
      loupe.height = 96;
      root.appendChild(loupe);
      document.body.appendChild(root);
      this.fillLoupeEl = root;
      this.fillLoupeMagEl = loupe;
      this.fillLoupeMagCtx = loupe.getContext('2d');
      return root;
    }

    hideFillLoupe() {
      if (this.fillLoupeEl) this.fillLoupeEl.style.display = 'none';
    }

    showFillLoupe(clientX, clientY) {
      const fillTools = ['fill', 'fill-erase', 'fill-pattern', 'fill-pattern-erase'];
      if (!fillTools.includes(this.activeTool)) {
        this.hideFillLoupe();
        return;
      }
      const root = this.ensureFillLoupe();
      if (!root || !this.canvas) return;
      const canvasRect = this.canvas.getBoundingClientRect();
      const inside =
        clientX >= canvasRect.left &&
        clientX <= canvasRect.right &&
        clientY >= canvasRect.top &&
        clientY <= canvasRect.bottom;
      if (!inside) {
        this.hideFillLoupe();
        return;
      }
      root.style.display = 'block';
      // position: fixed so clientX/clientY map directly — no parent-offset confusion
      root.style.left = `${clientX}px`;
      root.style.top = `${clientY}px`;

      // Render the magnifier with content sampled around the cursor.
      const ctx = this.fillLoupeMagCtx;
      const mag = this.fillLoupeMagEl;
      if (ctx && mag) {
        const ZOOM = 4;
        const mw = mag.width;
        const mh = mag.height;
        const sw = mw / ZOOM;
        const sh = mh / ZOOM;
        // canvas pixel coords under the cursor
        const cssX = clientX - canvasRect.left;
        const cssY = clientY - canvasRect.top;
        const ratioX = this.canvas.width / Math.max(1, canvasRect.width);
        const ratioY = this.canvas.height / Math.max(1, canvasRect.height);
        const srcX = cssX * ratioX - sw / 2;
        const srcY = cssY * ratioY - sh / 2;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, mw, mh);
        try {
          const src = this._loupeCleanCanvas || this.canvas;
          ctx.drawImage(src, srcX, srcY, sw, sh, 0, 0, mw, mh);
        } catch (_) {
          // Canvas not ready; ignore.
        }
        // Crosshair at the loupe center marking the fill point.
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mw / 2 - 6, mh / 2);
        ctx.lineTo(mw / 2 + 6, mh / 2);
        ctx.moveTo(mw / 2, mh / 2 - 6);
        ctx.lineTo(mw / 2, mh / 2 + 6);
        ctx.stroke();
        ctx.restore();
      }

      // Place the magnifier in the canvas quadrant with the most space.
      // Root is at the cursor (0,0 = cursor), so offsets are from that point.
      const magW = this.fillLoupeMagEl?.width || 96;
      const magH = this.fillLoupeMagEl?.height || 96;
      const GAP = 18;
      const spaceRight = canvasRect.right - clientX;
      const spaceLeft = clientX - canvasRect.left;
      const spaceBelow = canvasRect.bottom - clientY;
      const spaceAbove = clientY - canvasRect.top;
      const placeRight = spaceRight >= magW + GAP || spaceRight >= spaceLeft;
      const placeBelow = spaceBelow >= magH + GAP || spaceBelow >= spaceAbove;
      const magEl = this.fillLoupeMagEl;
      if (magEl) {
        magEl.style.left = placeRight ? `${GAP}px` : `${-magW - GAP}px`;
        magEl.style.right = '';
        magEl.style.top = placeBelow ? `${GAP}px` : `${-magH - GAP}px`;
      }
    }

    isPrimitiveShapeType(type) {
      return type === 'rect' || type === 'oval' || type === 'polygon' || type === 'line';
    }

    getSelectedPrimitiveShapeLayer() {
      const layer = this.getSelectedShapeLayer();
      if (layer?.mask?.enabled) return null;
      const shapeType = this.getShapeMetaForLayer(layer, 0)?.shape?.type;
      return this.isPrimitiveShapeType(shapeType) ? layer : null;
    }

    updateCursor() {
      if (!this.canvas) return;
      if (this._applyModifierCursorOverride()) return;
      if (this.activeTool === 'hand') {
        this.setCanvasCursor(this.isPan ? 'grabbing' : 'grab', 'hand');
        return;
      }
      if (this.activeTool === 'pen') {
        this.setCanvasCursor(this.cursorDataUrl('pen', 2, 19, 'crosshair'), 'pen');
        return;
      }
      if (`${this.activeTool}`.startsWith('shape-')) {
        this.setCanvasCursor(makeShapeReticleCursor(getThemeToken('--render-cursor-stroke', 'white')), 'shape-reticle');
        return;
      }
      if (this.activeTool === 'algo-draw') {
        this.setCanvasCursor('crosshair', 'algo-draw');
        return;
      }
      if (this.activeTool === 'scissor') {
        this.setCanvasCursor('crosshair', 'scissor');
        return;
      }
      if (this.activeTool === 'fill' || this.activeTool === 'fill-erase' ||
          this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
        this.setCanvasCursor(this.cursorDataUrl('bucket', 20, 22, 'crosshair'), 'fill');
        return;
      }
      if (this.activeTool === 'direct') {
        this.setCanvasCursor(this.cursorDataUrl('outline', 4, 4, 'auto'), 'direct');
        return;
      }
      if (this.activeTool === 'select') {
        this.setCanvasCursor(this.cursorDataUrl('filled', 4, 4, 'auto'), 'select');
        return;
      }
      this.setCanvasCursor('crosshair');
    }

    hexToRgb(hex) {
      if (typeof hex !== 'string') return { r: 56, g: 189, b: 248 };
      const raw = hex.trim().replace('#', '');
      const value =
        raw.length === 3
          ? raw
              .split('')
              .map((c) => `${c}${c}`)
              .join('')
          : raw;
      if (!/^[0-9a-fA-F]{6}$/.test(value)) return { r: 56, g: 189, b: 248 };
      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
      };
    }

    mixRgb(a, b, t) {
      const clampT = Math.max(0, Math.min(1, t));
      return {
        r: Math.round(a.r + (b.r - a.r) * clampT),
        g: Math.round(a.g + (b.g - a.g) * clampT),
        b: Math.round(a.b + (b.b - a.b) * clampT),
      };
    }

    rgbToCss(rgb, alpha = 1) {
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    getComplementRgb(rgb) {
      return {
        r: 255 - rgb.r,
        g: 255 - rgb.g,
        b: 255 - rgb.b,
      };
    }

    getLineSortStep(layer) {
      if (!layer || !layer.optimization || layer.optimization.bypassAll) return null;
      const steps = Array.isArray(layer.optimization.steps) ? layer.optimization.steps : [];
      return steps.find((step) => step && step.id === 'linesort') || null;
    }

    isLineSortApplied(layer) {
      const lineSort = this.getLineSortStep(layer);
      return Boolean(lineSort && lineSort.enabled && !lineSort.bypass);
    }

    hasLineSortOrderMetadata(path) {
      return Number.isFinite(path?.meta?.lineSortOrder);
    }

    getLineSortOverlaySecondaryColor(layers = []) {
      for (const layer of layers) {
        const step = this.getLineSortStep(layer);
        if (!step || !step.enabled || step.bypass) continue;
        if (typeof step.overlaySecondaryColor !== 'string') continue;
        const color = step.overlaySecondaryColor.trim();
        if (color) return color;
      }
      return '';
    }

    updateOptimizationOverlayLegend(show, startColor = '', endColor = '') {
      const legend = document.getElementById('optimization-overlay-legend');
      if (!legend) return;
      legend.classList.toggle('hidden', !show);
      if (!show) return;
      const gradientEl = document.getElementById('optimization-overlay-legend-gradient');
      if (gradientEl) gradientEl.style.background = `linear-gradient(90deg, ${startColor} 0%, ${endColor} 100%)`;
    }

    getModifierState(e = {}) {
      const mods = SETTINGS.touchModifiers || {};
      const isTouchPointer = e.pointerType && e.pointerType !== 'mouse';
      const touchShift = isTouchPointer && Boolean(mods.shift);
      const touchAlt = isTouchPointer && Boolean(mods.alt);
      const touchMeta = isTouchPointer && Boolean(mods.meta);
      const touchCtrl = isTouchPointer && Boolean(mods.ctrl);
      const touchPan = isTouchPointer && Boolean(mods.pan);
      return {
        shift: Boolean(e.shiftKey || touchShift),
        alt: Boolean(e.altKey || touchAlt),
        meta: Boolean(e.metaKey || e.ctrlKey || touchMeta || touchCtrl),
        ctrl: Boolean(e.ctrlKey || touchCtrl),
        pan: Boolean(touchPan),
      };
    }

    wantsPan(e, modifiers = this.getModifierState(e)) {
      return this.activeTool === 'hand' || modifiers.pan || e.button === 1;
    }

    isTouchPointer(e) {
      return e?.pointerType === 'touch';
    }

    updateTouchPointer(e) {
      if (!this.isTouchPointer(e)) return;
      this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    removeTouchPointer(e) {
      if (!this.isTouchPointer(e)) return;
      this.touchPointers.delete(e.pointerId);
    }

    canStartTouchGesture() {
      return !(
        this.isLayerDrag ||
        this.isSelecting ||
        this.isLassoSelecting ||
        this.isScissor ||
        this.shapeCornerDrag ||
        this.directDrag ||
        this.isDirectMarquee ||
        this.isPenDragging ||
        this.isLightDrag
      );
    }

    getTouchGesturePair() {
      if (this.touchPointers.size < 2) return null;
      const points = Array.from(this.touchPointers.values());
      return [points[0], points[1]];
    }

    startTouchGesture() {
      const pair = this.getTouchGesturePair();
      if (!pair) return false;
      const [a, b] = pair;
      const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const distance = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
      this.cancelActiveInteractionsForTouchGesture();
      this.touchGesture = {
        startDistance: distance,
        startScale: this.scale,
        worldCenter: {
          x: (center.x - this.offsetX) / this.scale,
          y: (center.y - this.offsetY) / this.scale,
        },
      };
      return true;
    }

    updateTouchGesture() {
      const pair = this.getTouchGesturePair();
      if (!this.touchGesture || !pair) return false;
      const [a, b] = pair;
      const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const distance = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
      const ratio = distance / Math.max(1e-6, this.touchGesture.startDistance);
      const nextScale = Math.max(0.1, Math.min(this.touchGesture.startScale * ratio, 20));
      this.scale = nextScale;
      this.offsetX = center.x - this.touchGesture.worldCenter.x * nextScale;
      this.offsetY = center.y - this.touchGesture.worldCenter.y * nextScale;
      this.draw();
      return true;
    }

    stopTouchGesture() {
      this.touchGesture = null;
      this.updateCursor();
    }

    clearTouchHold() {
      if (this.touchHoldTimer) {
        clearTimeout(this.touchHoldTimer);
        this.touchHoldTimer = null;
      }
      this.touchHoldPending = null;
      this.touchHoldStartClient = null;
    }

    cancelActiveInteractionsForTouchGesture() {
      this.clearTouchHold();
      this.isPan = false;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.tempTransform = null;
      this.snap = null;
      this.guides = null;
      this.isLightDrag = false;
      this.isPenDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.shapeCornerDrag = null;
      this.directDrag = null;
      this.isScissor = false;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.isSelecting = false;
      this.selectionRect = null;
      this.selectionStart = null;
      this.isLassoSelecting = false;
      this.lassoPath = null;
      this.isDirectMarquee = false;
      this.directMarqueeStart = null;
      this.directMarqueeRect = null;
    }

    snapPenAngle(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!dist) return { ...to };
      const step = Math.PI / 4;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
    }

    snapScissorAngle(from, to, stepDeg = 15) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!dist) return { ...to };
      const step = (stepDeg * Math.PI) / 180;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
    }

    _attachShiftDragListener() {
      this._detachShiftDragListener();
      this._shiftKeyUpHandler = (ev) => {
        if (ev.key !== 'Shift') return;
        if (!this.isLayerDrag || this.dragMode !== 'move' || !this.lastDragWorld) return;
        const dx = this.lastDragWorld.x - this.dragStart.x;
        const dy = this.lastDragWorld.y - this.dragStart.y;
        this.tempTransform = { dx, dy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
        this.draw();
      };
      document.addEventListener('keyup', this._shiftKeyUpHandler);
    }

    _detachShiftDragListener() {
      if (this._shiftKeyUpHandler) {
        document.removeEventListener('keyup', this._shiftKeyUpHandler);
        this._shiftKeyUpHandler = null;
      }
    }

    createAnchor(point) {
      return { x: point.x, y: point.y, in: null, out: null };
    }

    setAnchorHandles(anchor, target, options = {}) {
      if (!anchor || !target) return;
      const { breakHandle = false } = options;
      const vec = { x: target.x - anchor.x, y: target.y - anchor.y };
      anchor.out = { x: anchor.x + vec.x, y: anchor.y + vec.y };
      if (breakHandle) {
        anchor.in = null;
      } else {
        anchor.in = { x: anchor.x - vec.x, y: anchor.y - vec.y };
      }
    }

    cubicAt(p0, c1, c2, p1, t) {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;
      return {
        x: uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p1.x,
        y: uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p1.y,
      };
    }

    sampleCubic(p0, c1, c2, p1) {
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const handles = Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - p1.x, c2.y - p1.y);
      const rough = Math.max(dist, handles);
      const steps = Math.min(120, Math.max(8, Math.round(rough / 4)));
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        pts.push(this.cubicAt(p0, c1, c2, p1, i / steps));
      }
      return pts;
    }

    buildPenPathFromAnchors(anchors, closed = false) {
      const shared = window.Vectura?.GeometryUtils?.buildPolylineFromAnchors;
      if (shared) return shared(anchors, closed);
      if (!Array.isArray(anchors) || anchors.length < 2) return [];
      const pts = [];
      const count = anchors.length;
      const emit = (a, b) => {
        let seg;
        if (!a.out && !b.in) seg = [a, b];
        else seg = this.sampleCubic(a, a.out || a, b.in || b, b);
        if (pts.length) seg.shift();
        pts.push(...seg);
      };
      for (let i = 0; i < count - 1; i++) emit(anchors[i], anchors[i + 1]);
      if (closed && count > 2) emit(anchors[count - 1], anchors[0]);
      return pts;
    }

    handlePenDown(world, e) {
      if (!world) return;
      const modifiers = this.getModifierState(e);
      const closeTol = 12 / this.scale;

      // Manual double-click detection — pointerdown does not reliably carry e.detail > 1
      const now = performance.now();
      const prev = this._penLastClick;
      const screenX = e.clientX ?? 0;
      const screenY = e.clientY ?? 0;
      const isDoubleClick = prev &&
        (now - prev.time) < 400 &&
        Math.hypot(screenX - prev.x, screenY - prev.y) < 8;
      this._penLastClick = { time: now, x: screenX, y: screenY };

      if (!this.penDraft) {
        this.penDraft = { anchors: [this.createAnchor(this.snapPointToGrid(world))], closed: false };
        this.isPenDragging = true;
        this.penDragAnchor = 0;
        this.penDragStart = world;
        this.penPreview = null;
        this.canvas?.focus();
        this.draw();
        return;
      }

      const anchors = this.penDraft.anchors || [];
      if (!anchors.length) {
        anchors.push(this.createAnchor(world));
        this.penDraft.anchors = anchors;
        this.isPenDragging = true;
        this.penDragAnchor = anchors.length - 1;
        this.penDragStart = world;
        this.draw();
        return;
      }

      const first = anchors[0];
      const lastAnchor = anchors[anchors.length - 1];
      let next = this.snapPointToGrid({ x: world.x, y: world.y });
      if (modifiers.shift) next = this.snapPenAngle(lastAnchor, next);
      const distToStart = Math.hypot(next.x - first.x, next.y - first.y);
      const snapTol = 5 / this.scale;
      const isSnapClose = !modifiers.meta && anchors.length >= 2 &&
        Math.hypot(world.x - first.x, world.y - first.y) <= snapTol;

      if (anchors.length >= 2 && (isSnapClose || (distToStart <= closeTol && isDoubleClick))) {
        // Remove the phantom anchor added on the first click of this double-click if it
        // landed near the origin — it was not intended as a real point.
        if (isDoubleClick && anchors.length > 2) {
          const phantom = anchors[anchors.length - 1];
          if (Math.hypot(phantom.x - first.x, phantom.y - first.y) <= closeTol) {
            anchors.pop();
            this.penDraft.anchors = anchors;
          }
        }
        this.penDraft.closed = true;
        // Enter close-drag: user can drag to curve the closing segment before commit.
        this.isPenDragging = true;
        this.isPenCloseDragging = true;
        this.penDragAnchor = 0;
        this.penDragStart = { x: first.x, y: first.y };
        this.draw();
        return;
      }
      const anchor = this.createAnchor(next);
      anchors.push(anchor);
      this.penDraft.anchors = anchors;
      this.isPenDragging = true;
      this.penDragAnchor = anchors.length - 1;
      this.penDragStart = next;
      if (isDoubleClick) {
        this.commitPenPath();
        return;
      }
      this.draw();
    }

    commitPenPath() {
      const anchors = this.penDraft?.anchors || [];
      if (!this.penDraft || anchors.length < 2) {
        this.cancelPenPath();
        return;
      }
      if (this.penPurpose === 'select') {
        if (anchors.length < 3) {
          this.cancelPenPath();
          return;
        }
        const path = this.buildPenPathFromAnchors(anchors, true);
        this.selectLayersByPolygon(path);
        this.penPurpose = 'draw';
      } else {
        const path = this.buildPenPathFromAnchors(anchors, this.penDraft.closed);
        if (this.onPenComplete) {
          const anchorPayload = anchors.map((anchor) => ({
            x: anchor.x,
            y: anchor.y,
            in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
            out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
          }));
          this.onPenComplete({
            path,
            anchors: anchorPayload,
            closed: Boolean(this.penDraft.closed),
          });
        }
      }
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.isPenCloseDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this._penLastClick = null;
      this.penSnapToOrigin = false;
      this.draw();
    }

    cancelPenPath() {
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.isPenCloseDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this._penLastClick = null;
      this.penSnapToOrigin = false;
      this.penPurpose = 'draw';
      this.draw();
    }

    undoPenPoint() {
      if (!this.penDraft || !this.penDraft.anchors || !this.penDraft.anchors.length) return;
      this.penDraft.anchors.pop();
      if (!this.penDraft.anchors.length) this.penDraft = null;
      this.draw();
    }

    isShapeTool(tool = this.activeTool) {
      return tool === 'shape-rect' || tool === 'shape-oval' || tool === 'shape-polygon' || tool === 'shape-line';
    }

    getShapeKindForTool(tool = this.activeTool) {
      if (tool === 'shape-rect') return 'rect';
      if (tool === 'shape-oval') return 'oval';
      if (tool === 'shape-polygon') return 'polygon';
      if (tool === 'shape-line') return 'line';
      return null;
    }

    buildShapeFromDraft(start, end, modifiers = {}, options = {}) {
      const kind = options.kind || this.getShapeKindForTool();
      if (!start || !end || !kind) return null;
      const fromCenter = Boolean(modifiers.alt || modifiers.meta);
      const constrain = Boolean(modifiers.shift);
      if (kind === 'rect') {
        let x1 = start.x;
        let y1 = start.y;
        let x2 = end.x;
        let y2 = end.y;
        if (fromCenter) {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          x1 = start.x - dx;
          y1 = start.y - dy;
          x2 = start.x + dx;
          y2 = start.y + dy;
        }
        if (constrain) {
          const width = x2 - x1;
          const height = y2 - y1;
          const size = Math.max(Math.abs(width), Math.abs(height));
          x2 = x1 + Math.sign(width || 1) * size;
          y2 = y1 + Math.sign(height || 1) * size;
        }
        return {
          type: 'rect',
          x1,
          y1,
          x2,
          y2,
          cornerRadii: [0, 0, 0, 0],
        };
      }
      if (kind === 'oval') {
        const cx = fromCenter ? start.x : (start.x + end.x) * 0.5;
        const cy = fromCenter ? start.y : (start.y + end.y) * 0.5;
        let rx = Math.abs(fromCenter ? end.x - start.x : (end.x - start.x) * 0.5);
        let ry = Math.abs(fromCenter ? end.y - start.y : (end.y - start.y) * 0.5);
        if (constrain) {
          const radius = Math.max(rx, ry);
          rx = radius;
          ry = radius;
        }
        return { type: 'oval', cx, cy, rx, ry };
      }
      if (kind === 'polygon') {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return {
          type: 'polygon',
          cx: start.x,
          cy: start.y,
          radius: Math.max(0.1, Math.hypot(dx, dy)),
          rotation: constrain ? Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12) : Math.atan2(dy, dx),
          sides: Math.max(3, Math.round(this.shapeDraftSides || 6)),
          cornerRadii: new Array(Math.max(3, Math.round(this.shapeDraftSides || 6))).fill(0),
        };
      }
      if (kind === 'line') {
        let x2 = end.x;
        let y2 = end.y;
        if (constrain) {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const angle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const length = Math.hypot(dx, dy);
          x2 = start.x + Math.cos(snappedAngle) * length;
          y2 = start.y + Math.sin(snappedAngle) * length;
        }
        return { type: 'line', x1: start.x, y1: start.y, x2, y2 };
      }
      return null;
    }

    buildShapePath(shape) {
      const normalizedShape = cloneShape(shape);
      const anchors = buildShapeAnchors(normalizedShape);
      if (!anchors.length) return null;
      const closed = !isOpenShape(normalizedShape);
      const path = this.buildPenPathFromAnchors(anchors, closed);
      path.meta = {
        kind: 'shape',
        closed,
        anchors: anchors.map((anchor) => cloneAnchor(anchor)),
        shape: normalizedShape,
      };
      return path;
    }

    setShapePathFromMeta(meta) {
      if (!this.directSelection || !meta?.shape) return false;
      const path = this.buildShapePath(meta.shape);
      if (!path?.meta) return false;
      this.directSelection.anchors = path.meta.anchors.map((anchor) => cloneAnchor(anchor));
      this.directSelection.closed = path.meta.closed !== false;
      this.directSelection.meta = { ...this.directSelection.meta, ...path.meta };
      this.applyDirectPath();
      return true;
    }

    startShapeDraft(world, e) {
      const modifiers = this.getModifierState(e);
      const kind = this.getShapeKindForTool();
      if (!kind || !world) return false;
      this.shapeDraft = {
        kind,
        start: { x: world.x, y: world.y },
        end: { x: world.x, y: world.y },
        modifiers,
      };
      if (kind === 'polygon') this.shapeDraftSides = Math.max(3, this.shapeDraftSides || 6);
      this.draw();
      return true;
    }

    updateShapeDraft(world, e) {
      if (!this.shapeDraft || !world) return false;
      this.shapeDraft.end = { x: world.x, y: world.y };
      this.shapeDraft.modifiers = this.getModifierState(e);
      this.draw();
      return true;
    }

    adjustShapeDraftSides(delta) {
      if (!this.shapeDraft || this.shapeDraft.kind !== 'polygon') return false;
      this.shapeDraftSides = Math.max(3, Math.min(32, Math.round((this.shapeDraftSides || 6) + delta)));
      this.draw();
      return true;
    }

    getDraftShape() {
      if (!this.shapeDraft) return null;
      return this.buildShapeFromDraft(this.shapeDraft.start, this.shapeDraft.end, this.shapeDraft.modifiers, {
        kind: this.shapeDraft.kind,
      });
    }

    commitShapeDraft() {
      const shape = this.getDraftShape();
      if (!shape) {
        this.cancelShapeDraft();
        return;
      }
      const path = this.buildShapePath(shape);
      if (path && this.onShapeComplete) {
        this.onShapeComplete({
          path,
          closed: path.meta?.closed !== false,
          shape,
        });
      }
      this.shapeDraft = null;
      this.draw();
      if (this.onClearTransientModifiers) this.onClearTransientModifiers();
    }

    cancelShapeDraft() {
      this.shapeDraft = null;
      this.draw();
      if (this.onClearTransientModifiers) this.onClearTransientModifiers();
    }

    isAlgoDrawTool(tool = this.activeTool) {
      return tool === 'algo-draw';
    }

    startAlgoDraft(world) {
      this.algoDraft = { start: { x: world.x, y: world.y }, end: { x: world.x, y: world.y } };
      this.draw();
      return true;
    }

    updateAlgoDraft(world) {
      if (!this.algoDraft) return false;
      this.algoDraft.end = { x: world.x, y: world.y };
      this.draw();
      return true;
    }

    commitAlgoDraft() {
      const d = this.algoDraft;
      if (!d) return;
      const x = Math.min(d.start.x, d.end.x);
      const y = Math.min(d.start.y, d.end.y);
      const w = Math.abs(d.end.x - d.start.x);
      const h = Math.abs(d.end.y - d.start.y);
      this.algoDraft = null;
      if (this.onAlgoDrawComplete && w > 5 && h > 5) {
        this.onAlgoDrawComplete({ algoType: this.algoDraftType, rect: { x, y, w, h } });
      }
      this.draw();
    }

    cancelAlgoDraft() {
      this.algoDraft = null;
      this.draw();
    }

    canEditSourceGeometry(layer) {
      return Boolean(layer && !layer.isGroup && layer.type === 'shape');
    }

    getShapeMetaForLayer(layer, pathIndex = 0) {
      if (!layer) return null;
      const sourcePath = this.canEditSourceGeometry(layer) && Array.isArray(layer.sourcePaths)
        ? layer.sourcePaths[pathIndex]
        : null;
      if (sourcePath?.meta?.shape) return sourcePath.meta;
      const path = Array.isArray(layer.paths) ? layer.paths[pathIndex] : null;
      if (path?.meta?.shape) return path.meta;
      const displayPath = Array.isArray(layer.displayPaths) ? layer.displayPaths[pathIndex] : null;
      if (displayPath?.meta?.shape) return displayPath.meta;
      return null;
    }

    getSelectedShapeLayer() {
      const layers = this.getSelectedLayers();
      if (layers.length !== 1) return null;
      const layer = layers[0];
      return this.getShapeMetaForLayer(layer, 0)?.shape ? layer : null;
    }

    getShapeCornerHandles(layer, pathIndex = 0, temp = null) {
      const meta = this.getShapeMetaForLayer(layer, pathIndex);
      if (!meta?.shape) return [];
      const descriptors = getCornerDescriptors(meta.shape);
      return descriptors.map((descriptor) => ({
        ...descriptor,
        vertex: this.transformShapeSourcePoint(descriptor.vertex, layer, temp),
        inward: this.transformShapeDirection(descriptor, layer, temp),
        point: this.transformShapeSourcePoint(getShapeCornerHandlePosition(descriptor, this.scale), layer, temp),
      }));
    }

    hitShapeCornerHandle(world, layer, pathIndex = 0) {
      const handles = this.getShapeCornerHandles(layer, pathIndex);
      const tolSq = Math.pow(7 / this.scale, 2);
      for (let i = 0; i < handles.length; i++) {
        if (this.distanceToPointSq(world, handles[i].point) <= tolSq) return handles[i];
      }
      return null;
    }

    beginShapeCornerDrag(layer, pathIndex, corner, scope = 'all') {
      if (!layer || !corner) return false;
      const meta = this.getShapeMetaForLayer(layer, pathIndex);
      if (!meta?.shape) return false;
      this.shapeCornerDrag = {
        layerId: layer.id,
        pathIndex,
        scope,
        cornerIndex: corner.index,
        shape: cloneShape(meta.shape),
        historyPushed: false,
      };
      if (scope === 'single') {
        this.selectLayer(layer);
        this.setDirectSelection(layer, pathIndex);
      } else {
        this.selectLayer(layer);
      }
      return true;
    }

    updateShapeCornerDrag(world) {
      if (!this.shapeCornerDrag || !world) return false;
      const layer = this.engine.layers.find((entry) => entry.id === this.shapeCornerDrag.layerId);
      if (!layer) return false;
      const descriptors = getCornerDescriptors(this.shapeCornerDrag.shape);
      const descriptor = descriptors[this.shapeCornerDrag.cornerIndex];
      if (!descriptor) return false;
      const localWorld = this.inverseShapeSourcePoint(world, layer);
      const projected = Math.max(0, dot(
        { x: localWorld.x - descriptor.vertex.x, y: localWorld.y - descriptor.vertex.y },
        descriptor.inward
      ));
      const nextRadius = descriptor.sinHalf > 1e-4 ? projected * descriptor.sinHalf : 0;
      const currentRadii = getShapeRadii(this.shapeCornerDrag.shape, descriptors.length);
      if (this.shapeCornerDrag.scope === 'single') {
        currentRadii[this.shapeCornerDrag.cornerIndex] = clamp(nextRadius, 0, descriptor.maxRadius);
      } else {
        descriptors.forEach((entry, index) => {
          currentRadii[index] = clamp(nextRadius, 0, entry.maxRadius);
        });
      }
      this.shapeCornerDrag.shape.cornerRadii = currentRadii;
      if (this._dragCursorPos) {
        const _dr = clamp(nextRadius, 0, descriptor.maxRadius);
        this.showDragTooltip(`r ${_dr.toFixed(1)}`, this._dragCursorPos.x, this._dragCursorPos.y);
      }
      if (!this.shapeCornerDrag.historyPushed) {
        if (this.shapeCornerDrag.scope === 'single' && this.onDirectEditStart) this.onDirectEditStart();
        if (this.shapeCornerDrag.scope === 'all' && this.onCommitTransform) this.onCommitTransform();
        this.shapeCornerDrag.historyPushed = true;
      }
      if (this.shapeCornerDrag.scope === 'single') {
        const nextMeta = this.directSelection?.meta ? { ...this.directSelection.meta, shape: cloneShape(this.shapeCornerDrag.shape) } : null;
        if (!nextMeta) return false;
        this.setShapePathFromMeta(nextMeta);
      } else {
        const meta = this.getShapeMetaForLayer(layer, this.shapeCornerDrag.pathIndex);
        if (!meta?.shape) return false;
        meta.shape = cloneShape(this.shapeCornerDrag.shape);
        const nextPath = this.buildShapePath(meta.shape);
        const sourcePaths = this.ensureLayerSourcePaths(layer);
        sourcePaths[this.shapeCornerDrag.pathIndex] = nextPath;
        layer.sourcePaths = sourcePaths;
        this.engine.generate(layer.id);
      }
      this.draw();
      return true;
    }

    endShapeCornerDrag() {
      if (!this.shapeCornerDrag) return;
      const scope = this.shapeCornerDrag.scope;
      this.shapeCornerDrag = null;
      if (scope === 'single' && this.onDirectEditCommit) this.onDirectEditCommit();
      if (scope === 'all' && this.onDirectEditCommit) this.onDirectEditCommit();
      this.hideDragTooltip();
      this.draw();
    }

    cancelScissor() {
      if (!this.isScissor) return;
      this.isScissor = false;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.draw();
    }

    cloneAnchor(anchor) {
      if (!anchor) return null;
      return {
        x: anchor.x,
        y: anchor.y,
        in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
        out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
      };
    }

    cloneAnchors(anchors) {
      return (anchors || []).map((anchor) => this.cloneAnchor(anchor));
    }

    expandCircleMeta(meta, segments = 72) {
      if (!meta) return [];
      const cx = meta.cx ?? meta.x ?? 0;
      const cy = meta.cy ?? meta.y ?? 0;
      const rx = meta.rx ?? meta.r ?? 0;
      const ry = meta.ry ?? meta.r ?? 0;
      const rot = meta.rotation ?? 0;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const ex = Math.cos(t) * rx;
        const ey = Math.sin(t) * ry;
        pts.push({
          x: cx + ex * cosR - ey * sinR,
          y: cy + ex * sinR + ey * cosR,
        });
      }
      if (pts.length) pts.push({ ...pts[0] });
      return pts;
    }

    getLayerTransformParams(layer) {
      const profile = this.engine.currentProfile;
      const origin = {
        x: (layer?.origin?.x ?? profile.width / 2) + (layer?.params?.posX ?? 0),
        y: (layer?.origin?.y ?? profile.height / 2) + (layer?.params?.posY ?? 0),
      };
      const scaleX = layer?.params?.scaleX ?? 1;
      const scaleY = layer?.params?.scaleY ?? 1;
      const rot = ((layer?.params?.rotation ?? 0) * Math.PI) / 180;
      return { origin, scaleX, scaleY, rot, cosR: Math.cos(rot), sinR: Math.sin(rot) };
    }

    sourceToWorldPoint(layer, point) {
      if (!layer || !point) return point;
      const { origin, scaleX, scaleY, cosR, sinR } = this.getLayerTransformParams(layer);
      let x = point.x - (layer.origin?.x ?? 0);
      let y = point.y - (layer.origin?.y ?? 0);
      x *= scaleX;
      y *= scaleY;
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;
      return { x: rx + origin.x, y: ry + origin.y };
    }

    worldToSourcePoint(layer, point) {
      if (!layer || !point) return point;
      const baseOrigin = layer.origin || { x: 0, y: 0 };
      const { origin, scaleX, scaleY, cosR, sinR } = this.getLayerTransformParams(layer);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const ux = dx * cosR + dy * sinR;
      const uy = -dx * sinR + dy * cosR;
      const safeX = Math.abs(scaleX) < 1e-6 ? (Math.sign(scaleX) || 1) * 1e-6 : scaleX;
      const safeY = Math.abs(scaleY) < 1e-6 ? (Math.sign(scaleY) || 1) * 1e-6 : scaleY;
      return { x: ux / safeX + baseOrigin.x, y: uy / safeY + baseOrigin.y };
    }

    ensureLayerSourcePaths(layer) {
      if (!layer) return [];
      if (!this.canEditSourceGeometry(layer)) return Array.isArray(layer.sourcePaths) ? layer.sourcePaths : [];
      if (Array.isArray(layer.sourcePaths) && layer.sourcePaths.length) return layer.sourcePaths;
      const paths = (layer.paths || []).map((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const expanded = this.expandCircleMeta(path.meta, 72);
          const srcExpanded = expanded.map((pt) => this.worldToSourcePoint(layer, pt));
          srcExpanded.meta = { kind: 'poly', closed: true };
          return srcExpanded;
        }
        if (!Array.isArray(path)) return [];
        const src = path.map((pt) => this.worldToSourcePoint(layer, pt));
        if (path.meta) {
          const meta = { ...path.meta };
          delete meta.cx;
          delete meta.cy;
          delete meta.rx;
          delete meta.ry;
          delete meta.r;
          delete meta.rotation;
          src.meta = meta;
        }
        return src;
      });
      layer.sourcePaths = paths;
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
      return layer.sourcePaths;
    }

    getDirectSelectionLayer() {
      if (!this.directSelection) return null;
      return this.engine.layers.find((layer) => layer.id === this.directSelection.layerId) || null;
    }

    pathToAnchors(path) {
      if (!Array.isArray(path) || path.length < 2) return { anchors: [], closed: false };
      const closedByPoints = (() => {
        const first = path[0];
        const last = path[path.length - 1];
        if (!first || !last) return false;
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        return dx * dx + dy * dy < 1e-6;
      })();
      let anchors;
      let closed = closedByPoints || Boolean(path.meta?.closed);
      if (Array.isArray(path.meta?.anchors) && path.meta.anchors.length >= 2) {
        anchors = this.cloneAnchors(path.meta.anchors);
      } else {
        const points = closed && path.length > 2 ? path.slice(0, -1) : path;
        anchors = points.map((pt) => ({ x: pt.x, y: pt.y, in: null, out: null }));
      }
      if (closed && anchors.length >= 2) {
        const first = anchors[0];
        const last = anchors[anchors.length - 1];
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        if (dx * dx + dy * dy < 1e-6) anchors = anchors.slice(0, -1);
      }
      if (anchors.length < 2) closed = false;
      return { anchors, closed };
    }

    findPathHitAtPoint(world, options = {}) {
      if (!world) return null;
      const { restrictToLayerId = null } = options;
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDistSq = Infinity;
      layers.forEach((layer) => {
        if (!layer || layer.isGroup || !layer.visible) return;
        if (restrictToLayerId && layer.id !== restrictToLayerId) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(2.5 / this.scale, stroke * 2);
        const tolSq = tol * tol;
        this.getInteractionPaths(layer).forEach((path, pathIndex) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? Math.max(path.meta.rx ?? 0, path.meta.ry ?? 0);
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            const dSq = dist * dist;
            if (dSq <= tolSq && dSq < bestDistSq) {
              bestDistSq = dSq;
              best = { layer, pathIndex, path, segmentIndex: 0, point: { x: world.x, y: world.y }, distSq: dSq };
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-9) continue;
            const t = Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.y - a.y) * dy) / lenSq));
            const px = a.x + t * dx;
            const py = a.y + t * dy;
            const ox = world.x - px;
            const oy = world.y - py;
            const dSq = ox * ox + oy * oy;
            if (dSq <= tolSq && dSq < bestDistSq) {
              bestDistSq = dSq;
              best = {
                layer,
                pathIndex,
                path,
                segmentIndex: i,
                segmentT: t,
                point: { x: px, y: py },
                distSq: dSq,
              };
            }
          }
        });
      });
      return best;
    }

    setDirectSelection(layer, pathIndex) {
      if (!layer || !Number.isInteger(pathIndex)) return null;
      if (!this.canEditSourceGeometry(layer)) return null;
      const sourcePaths = this.ensureLayerSourcePaths(layer);
      const sourcePath = sourcePaths[pathIndex];
      if (!Array.isArray(sourcePath) || sourcePath.length < 2) return null;
      const parsed = this.pathToAnchors(sourcePath);
      if (!parsed.anchors.length) return null;
      this.directAuxSelections = [];
      this.directSelection = {
        layerId: layer.id,
        pathIndex,
        anchors: this.cloneAnchors(parsed.anchors),
        closed: parsed.closed,
        meta: sourcePath.meta ? { ...sourcePath.meta } : {},
        selectedIndices: new Set(),
      };
      return this.directSelection;
    }

    clearDirectSelection() {
      this.directSelection = null;
      this.directDrag = null;
      this.directAuxSelections = [];
      this.draw();
    }

    refreshDirectSelection() {
      const sel = this.directSelection;
      if (!sel) return;
      if (this.directDrag) return;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer) {
        this.directSelection = null;
        this.directAuxSelections = [];
        return;
      }
      const sourcePath = layer.sourcePaths?.[sel.pathIndex];
      if (!Array.isArray(sourcePath)) {
        this.directSelection = null;
        this.directAuxSelections = [];
        return;
      }
      const parsed = this.pathToAnchors(sourcePath);
      const next = new Set();
      for (const i of sel.selectedIndices) {
        if (i < parsed.anchors.length) next.add(i);
      }
      sel.anchors = this.cloneAnchors(parsed.anchors);
      sel.closed = parsed.closed;
      sel.selectedIndices = next;
      sel.meta = sourcePath.meta ? { ...sourcePath.meta } : {};
    }

    _applyDirectLasso(poly) {
      if (!Array.isArray(poly) || poly.length < 3) return;
      this.directSelection = null;
      this.directAuxSelections = [];
      for (const layer of this.engine.layers) {
        if (!layer || layer.isGroup || !layer.visible) continue;
        if (this.isLayerLocked?.(layer.id)) continue;
        if (!this.canEditSourceGeometry(layer)) continue;
        const sourcePaths = this.ensureLayerSourcePaths(layer);
        sourcePaths.forEach((sourcePath, pathIndex) => {
          if (!Array.isArray(sourcePath) || sourcePath.length < 2) return;
          const parsed = this.pathToAnchors(sourcePath);
          if (!parsed.anchors.length) return;
          const selectedIndices = new Set();
          parsed.anchors.forEach((anchor, i) => {
            const w = this.sourceToWorldPoint(layer, anchor);
            if (this.pointInPoly(w, poly)) selectedIndices.add(i);
          });
          if (!selectedIndices.size) return;
          const sel = {
            layerId: layer.id,
            pathIndex,
            anchors: this.cloneAnchors(parsed.anchors),
            closed: parsed.closed,
            meta: sourcePath.meta ? { ...sourcePath.meta } : {},
            selectedIndices,
          };
          if (!this.directSelection) {
            this.directSelection = sel;
          } else {
            this.directAuxSelections.push(sel);
          }
        });
      }
      if (this.directSelection) {
        const pl = this.engine.layers.find((l) => l.id === this.directSelection.layerId);
        if (pl && !this.selectedLayerIds.has(pl.id)) this.selectLayer(pl);
      }
    }

    _applyDirectMarquee(rect) {
      const minX = rect.x;
      const maxX = rect.x + rect.w;
      const minY = rect.y;
      const maxY = rect.y + rect.h;
      this.directSelection = null;
      this.directAuxSelections = [];
      for (const layer of this.engine.layers) {
        if (!layer || layer.isGroup || !layer.visible) continue;
        if (this.isLayerLocked?.(layer.id)) continue;
        if (!this.canEditSourceGeometry(layer)) continue;
        const sourcePaths = this.ensureLayerSourcePaths(layer);
        sourcePaths.forEach((sourcePath, pathIndex) => {
          if (!Array.isArray(sourcePath) || sourcePath.length < 2) return;
          const parsed = this.pathToAnchors(sourcePath);
          if (!parsed.anchors.length) return;
          const selectedIndices = new Set();
          parsed.anchors.forEach((anchor, i) => {
            const w = this.sourceToWorldPoint(layer, anchor);
            if (w.x >= minX && w.x <= maxX && w.y >= minY && w.y <= maxY) selectedIndices.add(i);
          });
          if (!selectedIndices.size) return;
          const sel = {
            layerId: layer.id,
            pathIndex,
            anchors: this.cloneAnchors(parsed.anchors),
            closed: parsed.closed,
            meta: sourcePath.meta ? { ...sourcePath.meta } : {},
            selectedIndices,
          };
          if (!this.directSelection) {
            this.directSelection = sel;
          } else {
            this.directAuxSelections.push(sel);
          }
        });
      }
      if (this.directSelection) {
        const pl = this.engine.layers.find((l) => l.id === this.directSelection.layerId);
        if (pl && !this.selectedLayerIds.has(pl.id)) this.selectLayer(pl);
      }
    }

    buildMaskPreviewState(layer) {
      if (!layer) return null;
      if (layer.mask?.enabled && this.engine?.getLayerDescendants) {
        const descendants = this.engine.getLayerDescendants(layer.id).filter((entry) => entry && !entry.isGroup);
        if (!descendants.length) return null;
        const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
        const entries = descendants
          .filter((entry) => entry.visible && !(entry.mask?.enabled && entry.mask?.hideLayer))
          .map((entry) => ({
            layerId: entry.id,
            paths: buildLayerMaskedPaths(entry, this.engine, bounds, { excludeMaskLayerId: layer.id }),
          }))
          .filter((entry) => Array.isArray(entry.paths) && entry.paths.length);
        return {
          maskLayerId: layer.id,
          descendantIds: new Set(descendants.map((entry) => entry.id)),
          entries,
        };
      }
      if (this.engine) {
        const maskingAncestors = getMaskingAncestors(layer, this.engine);
        if (maskingAncestors.length) {
          const lockedMask = this.isLayerLocked
            ? maskingAncestors.find((a) => this.isLayerLocked?.(a.id))
            : null;
          const closestMask = lockedMask || maskingAncestors[maskingAncestors.length - 1];
          const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
          const paths = buildLayerMaskedPaths(layer, this.engine, bounds, { excludeMaskLayerId: closestMask.id });
          if (!paths.length) return null;
          return {
            maskLayerId: closestMask.id,
            descendantIds: new Set([layer.id]),
            entries: [{ layerId: layer.id, paths }],
            isChildDrag: true,
          };
        }
      }
      return null;
    }

    startMaskPreview(layer) {
      this.maskPreview = this.buildMaskPreviewState(layer);
      return this.maskPreview;
    }

    startMaskPreviewForSelection(layers) {
      if (this.activeTool !== 'select' || !Array.isArray(layers) || !layers.length) {
        this.clearMaskPreview();
        return;
      }
      if (layers.length === 1) {
        this.startMaskPreview(layers[0]);
        return;
      }
      const maskRoot = layers.find((l) => l?.mask?.enabled && l?.maskCapabilities?.canSource);
      if (maskRoot) {
        this.startMaskPreview(maskRoot);
      } else {
        this.clearMaskPreview();
      }
    }

    clearMaskPreview() {
      this.maskPreview = null;
    }

    shouldSkipLayerForMaskPreview(layer) {
      return Boolean(layer && this.maskPreview?.descendantIds?.has(layer.id));
    }

    _getMirrorDragPreviewLayerIds(selectedIds) {
      if (!selectedIds?.size || !this.engine?.getAncestorModifiers) return null;
      const ids = [...selectedIds].filter((id) => {
        const layer = this.engine.layers.find((l) => l.id === id);
        return layer && this.engine.getAncestorModifiers(layer).length > 0;
      });
      return ids.length ? new Set(ids) : null;
    }

    _startMirrorDrag(layers) {
      const ids = this._getMirrorDragPreviewLayerIds(new Set(layers.map((l) => l.id)));
      if (!ids) { this.mirrorDragState = null; return; }
      const state = new Map();
      ids.forEach((id) => {
        const layer = this.engine.layers.find((l) => l.id === id);
        if (!layer) return;
        state.set(id, {
          basePaths: (layer.paths || []).map((path) => {
            if (!Array.isArray(path)) return path;
            const clone = path.map((pt) => ({ ...pt }));
            if (path.meta) clone.meta = { ...path.meta };
            return clone;
          }),
        });
      });
      this.mirrorDragState = state.size ? state : null;
    }

    getMaskPreviewLayer() {
      if (!this.maskPreview?.maskLayerId) return null;
      return this.engine?.layers?.find((layer) => layer.id === this.maskPreview.maskLayerId) || null;
    }

    getDirectSelectionWorldAnchors() {
      return this._selectionWorldAnchors(this.directSelection);
    }

    _selectionWorldAnchors(sel) {
      if (!sel?.anchors?.length) return null;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer) return null;
      const anchors = sel.anchors.map((anchor) => ({
        x: this.sourceToWorldPoint(layer, anchor).x,
        y: this.sourceToWorldPoint(layer, anchor).y,
        in: anchor.in ? this.sourceToWorldPoint(layer, anchor.in) : null,
        out: anchor.out ? this.sourceToWorldPoint(layer, anchor.out) : null,
      }));
      return { layer, anchors };
    }

    _hitControlInAnchors(world, anchors) {
      const handleTol = 5 / this.scale;
      const handleTolSq = handleTol * handleTol;
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        if (anchor.in) {
          const dx = world.x - anchor.in.x; const dy = world.y - anchor.in.y;
          if (dx * dx + dy * dy <= handleTolSq) return { type: 'in', index: i };
        }
        if (anchor.out) {
          const dx = world.x - anchor.out.x; const dy = world.y - anchor.out.y;
          if (dx * dx + dy * dy <= handleTolSq) return { type: 'out', index: i };
        }
      }
      const anchorTol = 6 / this.scale;
      const anchorTolSq = anchorTol * anchorTol;
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const dx = world.x - anchor.x; const dy = world.y - anchor.y;
        if (dx * dx + dy * dy <= anchorTolSq) return { type: 'anchor', index: i };
      }
      return null;
    }

    hitDirectControl(world) {
      const mainData = this.getDirectSelectionWorldAnchors();
      if (mainData) {
        const hit = this._hitControlInAnchors(world, mainData.anchors);
        if (hit) return { ...hit, auxIdx: -1 };
      }
      const auxSels = this.directAuxSelections || [];
      for (let ai = 0; ai < auxSels.length; ai++) {
        const data = this._selectionWorldAnchors(auxSels[ai]);
        if (data) {
          const hit = this._hitControlInAnchors(world, data.anchors);
          if (hit) return { ...hit, auxIdx: ai };
        }
      }
      return null;
    }

    _applySelectionPath(sel) {
      if (!sel) return;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer) return;
      const sourcePaths = this.ensureLayerSourcePaths(layer);
      const path = this.buildPenPathFromAnchors(sel.anchors, sel.closed);
      const meta = this.normalizeEditedPathMeta({
        ...(sel.meta || {}),
        anchors: this.cloneAnchors(sel.anchors),
        closed: Boolean(sel.closed),
      });
      path.meta = meta;
      sourcePaths[sel.pathIndex] = path;
      layer.sourcePaths = sourcePaths;
      this.engine.generate(layer.id);
      sel.meta = meta;
    }

    applyDirectPath() {
      this._applySelectionPath(this.directSelection);
    }

    normalizeEditedPathMeta(meta) {
      const next = { ...(meta || {}) };
      // A user-driven edit invalidates the pre-curve baseline snapshot; the
      // next applyShapeAnchorRebuild must re-baseline from the edited anchors,
      // otherwise the rebuild snaps geometry back to the pre-edit shape.
      delete next.originalAnchors;
      delete next.originalClosed;
      if (next.kind === 'circle') {
        next.kind = 'poly';
      } else if (!next.shape && next.kind === 'shape') {
        next.kind = 'poly';
      } else if (next.shape) {
        return next;
      }
      delete next.cx;
      delete next.cy;
      delete next.rx;
      delete next.ry;
      delete next.r;
      delete next.rotation;
      return next;
    }

    markDirectSelectionAsCustomPath() {
      if (!this.directSelection) return;
      this.directSelection.meta = this.normalizeEditedPathMeta({
        ...(this.directSelection.meta || {}),
        shape: undefined,
      });
      delete this.directSelection.meta.shape;
    }

    startDirectDrag(control, e = {}) {
      // If the control is in an aux selection, promote it to the primary
      const auxIdx = control?.auxIdx ?? -1;
      if (auxIdx >= 0) {
        const auxSels = this.directAuxSelections || [];
        if (auxSels[auxIdx]) {
          const promoted = auxSels[auxIdx];
          const newAux = [];
          if (this.directSelection) newAux.push(this.directSelection);
          for (let i = 0; i < auxSels.length; i++) {
            if (i !== auxIdx) newAux.push(auxSels[i]);
          }
          this.directSelection = promoted;
          this.directAuxSelections = newAux;
        }
      }
      if (!control || !this.directSelection) return false;
      const modifiers = this.getModifierState ? this.getModifierState(e) : { alt: e.altKey, shift: e.shiftKey };
      const sel = this.directSelection;

      if (control.type === 'anchor') {
        // Multi-select: shift+click toggles anchor in/out of selection
        if (modifiers.shift) {
          if (sel.selectedIndices.has(control.index)) sel.selectedIndices.delete(control.index);
          else sel.selectedIndices.add(control.index);
        } else if (!sel.selectedIndices.has(control.index)) {
          sel.selectedIndices = new Set([control.index]);
        }

        // Alt+drag: duplicate the anchor and drag the copy
        if (modifiers.alt) {
          const orig = sel.anchors[control.index];
          const dup = { x: orig.x, y: orig.y, in: orig.in ? { ...orig.in } : null, out: orig.out ? { ...orig.out } : null };
          const insertIdx = control.index + 1;
          sel.anchors.splice(insertIdx, 0, dup);
          sel.selectedIndices = new Set([insertIdx]);
          control = { type: 'anchor', index: insertIdx };
          if (this.onDirectEditStart) { this.onDirectEditStart(); }
        }
      }

      // Record start positions for angle-constrain and multi-move
      const anchor = sel.anchors[control.index];
      const otherStarts = control.type === 'anchor'
        ? [...sel.selectedIndices].filter(i => i !== control.index).map(i => {
            const a = sel.anchors[i];
            return a ? { index: i, x: a.x, y: a.y, inX: a.in?.x, inY: a.in?.y, outX: a.out?.x, outY: a.out?.y } : null;
          }).filter(Boolean)
        : [];

      this.directDrag = {
        type: control.type,
        index: control.index,
        moved: false,
        historyPushed: modifiers.alt, // already pushed above for alt-dup
        anchorStart: anchor ? { x: anchor.x, y: anchor.y } : null,
        otherStarts,
      };
      return true;
    }

    updateDirectDrag(world, e) {
      if (!this.directDrag || !this.directSelection) return false;
      const layer = this.getDirectSelectionLayer();
      if (!layer) return false;
      const drag = this.directDrag;
      const anchor = this.directSelection.anchors[drag.index];
      if (!anchor) return false;
      let next = this.worldToSourcePoint(layer, world);
      if (!drag.historyPushed && this.onDirectEditStart) {
        this.onDirectEditStart();
        drag.historyPushed = true;
      }
      if (drag.type !== 'corner') {
        this.markDirectSelectionAsCustomPath();
      }
      if (drag.type === 'anchor') {
        // Shift: angle-constrain movement relative to drag start (adjusted for grab offset)
        if (e?.shiftKey && drag.anchorStart) {
          const snapStart = drag.grabOffset
            ? { x: drag.anchorStart.x + drag.grabOffset.x, y: drag.anchorStart.y + drag.grabOffset.y }
            : drag.anchorStart;
          next = this.snapScissorAngle(snapStart, next, 15);
        }
        // grabOffset: when dragging a segment from its midpoint, offset next so the delta is relative
        // to the grab point rather than the anchor corner, preventing a jump on the first frame
        const effective = drag.grabOffset ? { x: next.x - drag.grabOffset.x, y: next.y - drag.grabOffset.y } : next;
        const dx = effective.x - anchor.x;
        const dy = effective.y - anchor.y;
        anchor.x = effective.x;
        anchor.y = effective.y;
        if (anchor.in) { anchor.in.x += dx; anchor.in.y += dy; }
        if (anchor.out) { anchor.out.x += dx; anchor.out.y += dy; }
        // Move all other selected anchors by the same delta
        for (const other of drag.otherStarts || []) {
          const oa = this.directSelection.anchors[other.index];
          if (!oa) continue;
          oa.x += dx; oa.y += dy;
          if (oa.in) { oa.in.x += dx; oa.in.y += dy; }
          if (oa.out) { oa.out.x += dx; oa.out.y += dy; }
        }
        // Also move all selected anchors in aux selections by the same delta
        for (const auxSel of this.directAuxSelections || []) {
          for (const ai of auxSel.selectedIndices) {
            const oa = auxSel.anchors[ai];
            if (!oa) continue;
            oa.x += dx; oa.y += dy;
            if (oa.in) { oa.in.x += dx; oa.in.y += dy; }
            if (oa.out) { oa.out.x += dx; oa.out.y += dy; }
          }
        }
      } else {
        const modifiers = this.getModifierState(e);
        if (modifiers.shift) next = this.snapPenAngle(anchor, next);
        anchor[drag.type] = { x: next.x, y: next.y };
        const mirror = drag.type === 'in' ? 'out' : 'in';
        if (!modifiers.alt && anchor[mirror] !== null) {
          const dx = anchor.x - next.x;
          const dy = anchor.y - next.y;
          anchor[mirror] = { x: anchor.x + dx, y: anchor.y + dy };
        }
        drag.lastWorld = world;
        drag.mirroring = !modifiers.alt && anchor[mirror] !== null;
      }
      drag.moved = true;
      this.applyDirectPath();
      for (const auxSel of this.directAuxSelections || []) {
        this._applySelectionPath(auxSel);
      }
      this.draw();
      return true;
    }

    endDirectDrag() {
      if (!this.directDrag) return;
      const drag = this.directDrag;
      const moved = drag.moved;
      if (moved && (drag.type === 'in' || drag.type === 'out') && drag.lastWorld && this.directSelection) {
        const layer = this.getDirectSelectionLayer();
        const anchor = this.directSelection.anchors[drag.index];
        if (layer && anchor) {
          const anchorWorld = this.sourceToWorldPoint(layer, anchor);
          const snapTol = 3 / this.scale;
          if (Math.hypot(drag.lastWorld.x - anchorWorld.x, drag.lastWorld.y - anchorWorld.y) <= snapTol) {
            if (!drag.historyPushed && this.onDirectEditStart) this.onDirectEditStart();
            if (drag.mirroring) {
              anchor.in = null;
              anchor.out = null;
            } else {
              anchor[drag.type] = null;
            }
            this.applyDirectPath();
          }
        }
      }
      this.directDrag = null;
      if (moved && this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
    }

    makeAnchorSmooth(index) {
      if (!this.directSelection?.anchors?.length) return;
      const anchors = this.directSelection.anchors;
      const count = anchors.length;
      const anchor = anchors[index];
      if (!anchor) return;
      const prev = anchors[(index - 1 + count) % count] || anchor;
      const next = anchors[(index + 1) % count] || anchor;
      const vx = next.x - prev.x;
      const vy = next.y - prev.y;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const scale = Math.max(0.8, Math.min(10, len * 0.2));
      anchor.in = { x: anchor.x - ux * scale, y: anchor.y - uy * scale };
      anchor.out = { x: anchor.x + ux * scale, y: anchor.y + uy * scale };
    }

    insertAnchorFromWorld(world, hit = null) {
      const baseHit = hit || this.findPathHitAtPoint(world, {
        restrictToLayerId: this.directSelection?.layerId || null,
      });
      if (!baseHit) return false;
      this.selectLayer(baseHit.layer);
      const selection = this.setDirectSelection(baseHit.layer, baseHit.pathIndex);
      if (!selection) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      this.markDirectSelectionAsCustomPath();
      const insertIndex = Math.max(0, Math.min(selection.anchors.length, (baseHit.segmentIndex ?? 0) + 1));
      const sourcePoint = this.worldToSourcePoint(baseHit.layer, baseHit.point || world);
      selection.anchors.splice(insertIndex, 0, {
        x: sourcePoint.x,
        y: sourcePoint.y,
        in: null,
        out: null,
      });
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    removeAnchorFromWorld(world) {
      if (!this.directSelection) {
        const hitPath = this.findPathHitAtPoint(world);
        if (!hitPath) return false;
        this.selectLayer(hitPath.layer);
        if (!this.setDirectSelection(hitPath.layer, hitPath.pathIndex)) return false;
      }
      const hit = this.hitDirectControl(world);
      if (!hit || hit.type !== 'anchor') return false;
      if (this.directSelection.anchors.length <= 2) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      this.markDirectSelectionAsCustomPath();
      this.directSelection.anchors.splice(hit.index, 1);
      if (this.directSelection.closed && this.directSelection.anchors.length < 3) {
        this.directSelection.closed = false;
      }
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    toggleAnchorFromWorld(world) {
      if (!this.directSelection) {
        const hit = this.findPathHitAtPoint(world);
        if (!hit) return false;
        this.selectLayer(hit.layer);
        if (!this.setDirectSelection(hit.layer, hit.pathIndex)) return false;
      }
      let control = this.hitDirectControl(world);
      if (!control || control.type !== 'anchor') {
        const hitPath = this.findPathHitAtPoint(world, {
          restrictToLayerId: this.directSelection?.layerId || null,
        });
        if (!hitPath || !this.directSelection?.anchors?.length) return false;
        const seg = Math.max(0, Math.min((hitPath.segmentIndex ?? 0), this.directSelection.anchors.length - 1));
        let idx = seg;
        if (Array.isArray(hitPath.path) && hitPath.path[seg + 1]) {
          const a = hitPath.path[seg];
          const b = hitPath.path[seg + 1];
          const da = Math.hypot(world.x - a.x, world.y - a.y);
          const db = Math.hypot(world.x - b.x, world.y - b.y);
          idx = db < da ? Math.min(this.directSelection.anchors.length - 1, seg + 1) : seg;
        }
        control = { type: 'anchor', index: idx };
      }
      const anchor = this.directSelection.anchors[control.index];
      if (!anchor) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      this.markDirectSelectionAsCustomPath();
      if (anchor.in || anchor.out) {
        anchor.in = null;
        anchor.out = null;
      } else {
        this.makeAnchorSmooth(control.index);
      }
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    _handlePenAnchorDown(world, e) {
      if (!this.directSelection) {
        const hit = this.findPathHitAtPoint(world);
        if (hit) {
          this.selectLayer(hit.layer);
          this.setDirectSelection(hit.layer, hit.pathIndex);
          this.draw();
        }
        return true;
      }
      const control = this.hitDirectControl(world);
      if (control) {
        if (control.type === 'in' || control.type === 'out') {
          this.startDirectDrag(control, e);
          return true;
        }
        if (control.type === 'anchor') {
          this.penAnchorDrag = { index: control.index, historyPushed: false, moved: false };
          return true;
        }
      }
      return this.toggleAnchorFromWorld(world);
    }

    resize() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const p = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = p.width * window.devicePixelRatio;
      this.canvas.height = p.height * window.devicePixelRatio;
      this.canvas.style.width = `${p.width}px`;
      this.canvas.style.height = `${p.height}px`;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      if (!this.userHasManipulated) this.center();
      this.draw();
    }

    center() {
      if (!this.ready || !this.canvas) return;
      this.userHasManipulated = false;
      const p = this.engine.currentProfile;
      const r = this.canvas.getBoundingClientRect();
      const sx = (r.width - 60) / p.width;
      const sy = (r.height - 60) / p.height;
      this.scale = Math.min(sx, sy);
      this.offsetX = (r.width - p.width * this.scale) / 2;
      this.offsetY = (r.height - p.height * this.scale) / 2;
    }

    draw() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const w = this.canvas.width / window.devicePixelRatio;
      const h = this.canvas.height / window.devicePixelRatio;
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.fillStyle = getThemeToken('--render-canvas', '#121214');
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.save();
      this.ctx.translate(this.offsetX, this.offsetY);
      this.ctx.scale(this.scale, this.scale);
      const prof = this.engine.currentProfile;
      this.ctx.fillStyle = SETTINGS.bgColor;
      this.ctx.shadowColor = getThemeToken('--render-shadow', 'rgba(0,0,0,0.5)');
      this.ctx.shadowBlur = 20;
      this.ctx.fillRect(0, 0, prof.width, prof.height);
      this.ctx.shadowBlur = 0;
      if (SETTINGS.gridType && SETTINGS.gridType !== 'none') this.drawGridOverlay(prof);
      this.ctx.strokeStyle = getThemeToken('--render-paper-outline', '#333');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.strokeRect(0, 0, prof.width, prof.height);

      this.ctx.lineJoin = 'round';

      const selectedLayer = this.getSelectedLayer();
      const selectedLayers = this.getSelectedLayers();
      const m = SETTINGS.margin;
      const innerW = prof.width - m * 2;
      const innerH = prof.height - m * 2;
      const previewMode = SETTINGS.optimizationPreview || 'off';
      const useOptimized = previewMode === 'replace';
      const showOptimizedOverlay = previewMode === 'overlay';
      const optimizationTargetIds = this.getOptimizationTargetIds();
      const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
      const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
      const dedupe = optimize > 0 ? new Map() : null;
      const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
      const pathKey = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
        }
        if (!Array.isArray(path)) return '';
        return path
          .map((pt) => `${quant(pt.x)},${quant(pt.y)}`)
          .join('|');
      };
      const drawLayers = () => {
        this.engine.layers.forEach((l) => {
          if (!l.visible) return;
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          // Children nested inside a compound (Pathfinder) group are consumed
          // by their parent's baked silhouette — don't draw them separately.
          if (this.engine.hasCompoundAncestor?.(l)) return;
          const fadeLayer = this.groupEditMode && !l.isGroup && l.id !== this.groupEditMode.activeLayerId;
          if (fadeLayer) { this.ctx.save(); this.ctx.globalAlpha = 0.2; }
          const layerPen = SETTINGS.pens?.find((p) => p.id === l.penId) || null;
          const defaultPenId = l.penId || layerPen?.id || 'default';

          let currentPenId = defaultPenId;
          let currentStrokeWidth = layerPen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
          let currentStrokeStyle = layerPen?.color || l.color;

          this.ctx.lineWidth = currentStrokeWidth;
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.beginPath();
          this.ctx.strokeStyle = currentStrokeStyle;

          const useCurves = Boolean(l.params && l.params.curves);
          const useLayerOptimized = useOptimized && optimizationTargetIds.has(l.id);
          const paths = this.engine.getRenderablePaths
            ? this.engine.getRenderablePaths(l, { useOptimized: useLayerOptimized })
            : l.paths;
          const isMirrorDrag = this.mirrorDragState?.has(l.id);
          const temp = !isMirrorDrag && this.selectedLayerIds?.has(l.id) && this.tempTransform
            ? this.tempTransform
            : null;
          (paths || []).forEach((path) => {
            const next = path && path.meta && path.meta.kind === 'circle'
              ? { meta: temp ? this.transformCircleMeta(path.meta, temp) : path.meta }
              : temp ? this.transformPath(path, temp) : path;
              
            const pathPenId = (path.meta && path.meta.penId) || defaultPenId;
            if (pathPenId !== currentPenId) {
              this.ctx.stroke();
              currentPenId = pathPenId;
              const pPen = SETTINGS.pens?.find((p) => p.id === pathPenId) || null;
              currentStrokeWidth = pPen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
              currentStrokeStyle = pPen?.color || l.color;
              this.ctx.lineWidth = currentStrokeWidth;
              this.ctx.strokeStyle = currentStrokeStyle;
              this.ctx.beginPath();
            }

            let seen = null;
            if (dedupe) {
              if (!dedupe.has(currentPenId)) dedupe.set(currentPenId, new Set());
              seen = dedupe.get(currentPenId);
            }
            if (seen) {
              const key = pathKey(next);
              if (key && seen.has(key)) return;
              if (key) seen.add(key);
            }
            this.traceLayerPath(path, l, temp, useCurves);
          });
          this.ctx.stroke();
          if (fadeLayer) { this.ctx.restore(); }
        });
      };
      const drawOptimizedOverlay = () => {
        if (!showOptimizedOverlay || this.exportModalOpen) return;
        const overlayColor = SETTINGS.optimizationOverlayColor || '#38bdf8';
        const overlayWidth = Math.max(0.05, SETTINGS.optimizationOverlayWidth ?? 0.2);
        const overlayItems = [];
        const targetLayers = [];
        this.engine.layers.forEach((l) => {
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          if (!optimizationTargetIds.has(l.id)) return;
          targetLayers.push(l);
          if (!l.visible || (l.mask?.enabled && l.mask?.hideLayer) || !l.optimizedPaths || !l.optimizedPaths.length) return;
          const useCurves = Boolean(l.params && l.params.curves);
          l.optimizedPaths.forEach((path) => overlayItems.push({ layer: l, path, useCurves }));
        });
        overlayItems.sort((a, b) => {
          const aOrder = Number.isFinite(a?.path?.meta?.lineSortOrder) ? a.path.meta.lineSortOrder : Number.MAX_SAFE_INTEGER;
          const bOrder = Number.isFinite(b?.path?.meta?.lineSortOrder) ? b.path.meta.lineSortOrder : Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
        });
        const hasLineSort = overlayItems.some((item) => this.hasLineSortOrderMetadata(item.path));
        const lineSortSecondary = this.getLineSortOverlaySecondaryColor(targetLayers);
        const shouldUseGradient = hasLineSort && overlayItems.length > 1;
        const base = this.hexToRgb(overlayColor);
        const startRgb = base;
        const endRgb = lineSortSecondary ? this.hexToRgb(lineSortSecondary) : this.getComplementRgb(base);
        if (shouldUseGradient) {
          const total = Math.max(1, overlayItems.length - 1);
          overlayItems.forEach((item, index) => {
            const l = item.layer;
            const t = index / total;
            const color = this.mixRgb(startRgb, endRgb, t);
            this.ctx.save();
            this.ctx.lineWidth = overlayWidth;
            this.ctx.lineCap = l.lineCap || 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = this.rgbToCss(color, 0.9);
            this.ctx.beginPath();
            const temp = this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.tempTransform : null;
            this.traceLayerPath(item.path, l, temp, item.useCurves);
            this.ctx.stroke();
            this.ctx.restore();
          });
          this.updateOptimizationOverlayLegend(true, this.rgbToCss(startRgb, 1), this.rgbToCss(endRgb, 1));
          return;
        }
        this.updateOptimizationOverlayLegend(false);
        this.engine.layers.forEach((l) => {
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          if (!optimizationTargetIds.has(l.id)) return;
          if (!l.visible || (l.mask?.enabled && l.mask?.hideLayer) || !l.optimizedPaths || !l.optimizedPaths.length) return;
          const useCurves = Boolean(l.params && l.params.curves);
          this.ctx.save();
          this.ctx.lineWidth = overlayWidth;
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.lineJoin = 'round';
          this.ctx.strokeStyle = overlayColor;
          this.ctx.globalAlpha = 0.8;
          this.ctx.beginPath();
          const temp = this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.tempTransform : null;
          l.optimizedPaths.forEach((path) => {
            this.traceLayerPath(path, l, temp, useCurves);
          });
          this.ctx.stroke();
          this.ctx.restore();
        });
      };
      const drawHelperOverlays = () => {
        this.engine.layers.forEach((l) => {
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          if (!l.visible || !l.params?.showPendulumGuides) return;
          const helperPaths = l.displayHelperPaths?.length ? l.displayHelperPaths : l.helperPaths;
          if (!helperPaths || !helperPaths.length) return;
          const color = l.params.pendulumGuideColor || '#f59e0b';
          const width = l.params.pendulumGuideWidth ?? 0.25;
          const useCurves = Boolean(l.params && l.params.curves);
          helperPaths.forEach((path, index) => {
            if (!Array.isArray(path) || path.length < 2) return;
            const next =
              this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            next.forEach((pt) => {
              minX = Math.min(minX, pt.x);
              minY = Math.min(minY, pt.y);
              maxX = Math.max(maxX, pt.x);
              maxY = Math.max(maxY, pt.y);
            });
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            this.ctx.save();
            this.ctx.lineWidth = width;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = color;
            this.ctx.globalAlpha = 0.65;
            this.ctx.beginPath();
            this.tracePath(next, useCurves);
            this.ctx.stroke();

            this.ctx.globalAlpha = 0.5;
            this.ctx.setLineDash([1.5, 1.5]);
            this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            this.ctx.setLineDash([]);

            this.ctx.globalAlpha = 0.35;
            this.ctx.setLineDash([2, 2]);
            this.ctx.beginPath();
            this.ctx.moveTo(minX, centerY);
            this.ctx.lineTo(maxX, centerY);
            this.ctx.moveTo(centerX, minY);
            this.ctx.lineTo(centerX, maxY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            this.ctx.globalAlpha = 0.7;
            this.ctx.fillStyle = color;
            const marker = 1.4;
            [
              [minX, centerY],
              [maxX, centerY],
              [centerX, minY],
              [centerX, maxY],
            ].forEach(([mx, my]) => {
              this.ctx.beginPath();
              this.ctx.arc(mx, my, marker, 0, Math.PI * 2);
              this.ctx.fill();
            });

            this.ctx.globalAlpha = 0.8;
            const cross = 2.5;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX - cross, centerY);
            this.ctx.lineTo(centerX + cross, centerY);
            this.ctx.moveTo(centerX, centerY - cross);
            this.ctx.lineTo(centerX, centerY + cross);
            this.ctx.stroke();

            const start = next[0];
            const nextPt = next[1] || start;
            const dirX = nextPt.x - start.x;
            const dirY = nextPt.y - start.y;
            const mag = Math.hypot(dirX, dirY) || 1;
            const ux = dirX / mag;
            const uy = dirY / mag;
            const arrowLen = 6;
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(start.x + ux * arrowLen, start.y + uy * arrowLen);
            this.ctx.stroke();

            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.9;
            this.ctx.beginPath();
            this.ctx.arc(start.x, start.y, 1.2, 0, Math.PI * 2);
            this.ctx.fill();

            const label = `P${index + 1}`;
            this.ctx.font = '3px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
            this.ctx.textBaseline = 'middle';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(label, start.x + 4, start.y - 4);

            this.ctx.restore();
          });
        });
      };
      const drawModifierGuides = () => {
        const guides = this.getMirrorGuides().filter((guide) => guide.visible);
        const underlay = getThemeToken('--render-underlay-fill', 'rgba(15, 23, 42, 0.92)');
        const dash = 2 / this.scale;

        const drawTriangle = (tri, color) => {
          this.ctx.save();
          this.ctx.fillStyle = underlay;
          this.ctx.beginPath();
          this.ctx.moveTo(tri.tipUnderlay.x, tri.tipUnderlay.y);
          this.ctx.lineTo(tri.leftUnderlay.x, tri.leftUnderlay.y);
          this.ctx.lineTo(tri.rightUnderlay.x, tri.rightUnderlay.y);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.fillStyle = color;
          this.ctx.strokeStyle = getThemeToken('--render-underlay-stroke', 'rgba(15, 23, 42, 1)');
          this.ctx.lineWidth = 0.8 / this.scale;
          this.ctx.beginPath();
          this.ctx.moveTo(tri.tip.x, tri.tip.y);
          this.ctx.lineTo(tri.left.x, tri.left.y);
          this.ctx.lineTo(tri.right.x, tri.right.y);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
          this.ctx.restore();
        };

        const drawCenterHandle = (cx, cy, color) => {
          const r = 5 / this.scale;
          this.ctx.save();
          this.ctx.fillStyle = underlay;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, r + 2 / this.scale, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.strokeStyle = color;
          this.ctx.fillStyle = color;
          this.ctx.lineWidth = 1 / this.scale;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
          this.ctx.stroke();
          const c = 2.5 / this.scale;
          this.ctx.beginPath();
          this.ctx.moveTo(cx - c, cy); this.ctx.lineTo(cx + c, cy);
          this.ctx.moveTo(cx, cy - c); this.ctx.lineTo(cx, cy + c);
          this.ctx.stroke();
          this.ctx.restore();
        };

        guides.forEach((guide) => {
          const color = guide.mirror.color || '#56b4e9';
          const alpha = guide.locked ? 0.45 : 0.8;
          this.ctx.save();
          this.ctx.globalAlpha = alpha;

          if (guide.guideType === 'radial') {
            const { center, wedgeLines, sourceWedge } = guide;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 0.45;
            this.ctx.setLineDash([dash, dash]);
            wedgeLines.forEach((ln) => {
              this.ctx.beginPath();
              this.ctx.moveTo(ln.x1, ln.y1);
              this.ctx.lineTo(ln.x2, ln.y2);
              this.ctx.stroke();
            });
            this.ctx.setLineDash([]);
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = alpha * 0.12;
            this.ctx.beginPath();
            this.ctx.moveTo(center.x, center.y);
            this.ctx.arc(center.x, center.y, sourceWedge.radius, sourceWedge.startAngle, sourceWedge.endAngle);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.globalAlpha = alpha;
            drawCenterHandle(center.x, center.y, color);
            this.ctx.restore();
            return;
          }

          if (guide.guideType === 'wallpaper') {
            const { fundamentalDomain, origin, latticeA, latticeB } = guide;
            if (fundamentalDomain && fundamentalDomain.length >= 3) {
              this.ctx.strokeStyle = color;
              this.ctx.lineWidth = 0.45;
              this.ctx.setLineDash([dash, dash]);
              this.ctx.beginPath();
              this.ctx.moveTo(fundamentalDomain[0].x, fundamentalDomain[0].y);
              for (let i = 1; i < fundamentalDomain.length; i++) {
                this.ctx.lineTo(fundamentalDomain[i].x, fundamentalDomain[i].y);
              }
              this.ctx.closePath();
              this.ctx.stroke();
              this.ctx.setLineDash([]);
              this.ctx.fillStyle = color;
              this.ctx.globalAlpha = alpha * 0.10;
              this.ctx.beginPath();
              this.ctx.moveTo(fundamentalDomain[0].x, fundamentalDomain[0].y);
              for (let i = 1; i < fundamentalDomain.length; i++) {
                this.ctx.lineTo(fundamentalDomain[i].x, fundamentalDomain[i].y);
              }
              this.ctx.closePath();
              this.ctx.fill();
              this.ctx.globalAlpha = alpha;
            }
            drawCenterHandle(origin.x, origin.y, color);
            if (latticeA && latticeB) {
              const p10 = { x: origin.x + latticeA.x, y: origin.y + latticeA.y };
              const p01 = { x: origin.x + latticeB.x, y: origin.y + latticeB.y };
              [p10, p01].forEach((pt) => {
                this.ctx.save();
                this.ctx.fillStyle = underlay;
                this.ctx.beginPath();
                this.ctx.arc(pt.x, pt.y, 4 / this.scale, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 1 / this.scale;
                this.ctx.beginPath();
                this.ctx.arc(pt.x, pt.y, 3.5 / this.scale, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
              });
            }
            this.ctx.restore();
            return;
          }

          if (guide.guideType === 'arc') {
            const { center, radius, arcStartRad, arcEndRad, flipTriangle: ft, radiusHandle } = guide;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 0.45;
            this.ctx.setLineDash([dash, dash]);
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, radius, arcStartRad, arcEndRad);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            drawTriangle(ft, color);
            drawCenterHandle(center.x, center.y, color);
            // Radius drag handle at arc start point
            this.ctx.save();
            this.ctx.fillStyle = underlay;
            this.ctx.beginPath();
            this.ctx.arc(radiusHandle.x, radiusHandle.y, 4 / this.scale, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1 / this.scale;
            this.ctx.beginPath();
            this.ctx.arc(radiusHandle.x, radiusHandle.y, 3.5 / this.scale, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
            this.ctx.restore();
            return;
          }

          // line guide (existing)
          const lineWidth = 0.45;
          this.ctx.strokeStyle = color;
          this.ctx.fillStyle = color;
          this.ctx.lineWidth = lineWidth;
          this.ctx.setLineDash([dash, dash]);
          this.ctx.beginPath();
          this.ctx.moveTo(guide.start.x, guide.start.y);
          this.ctx.lineTo(guide.end.x, guide.end.y);
          this.ctx.stroke();
          this.ctx.setLineDash([]);

          const drawRotateHandle = (center, direction = 'right') => {
            const rRadius = guide.rotateRadius;
            this.ctx.save();
            this.ctx.fillStyle = underlay;
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, rRadius + 3.3 / this.scale, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.translate(center.x, center.y);
            const sc = rRadius / 11.5;
            this.ctx.scale(direction === 'left' ? -sc : sc, sc);
            this.ctx.strokeStyle = color;
            this.ctx.fillStyle = color;
            this.ctx.lineWidth = 2.25;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 7.6, Math.PI * 1.08, Math.PI * 0.18, true);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(7.2, -7.8);
            this.ctx.lineTo(11.6, -7.2);
            this.ctx.lineTo(9.4, -3.2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 3.9, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
          };

          drawTriangle(guide.flipTriangle, color);
          drawRotateHandle(guide.rotateStart, 'left');
          drawRotateHandle(guide.rotateEnd, 'right');
          this.ctx.restore();
        });

      };
      const outlineEnabled = SETTINGS.selectionOutline !== false;
      const outlineColor = SETTINGS.selectionOutlineColor || '#ef4444';
      const drawSelectionOutline = () => {
        if (!outlineEnabled || !selectedLayers.length) return;
        selectedLayers.forEach((l) => {
          if (!l.visible || (l.mask?.enabled && l.mask?.hideLayer)) return;
          if (l.isGroup) return;
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          const pen = SETTINGS.pens?.find((p) => p.id === l.penId) || null;
          const strokeWidth = pen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
          const useCurves = Boolean(l.params && l.params.curves);
          const outlineWidth = SETTINGS.selectionOutlineWidth ?? 0.4;
          this.ctx.lineWidth = Math.max(0.1, strokeWidth + outlineWidth);
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.strokeStyle = outlineColor;
          this.ctx.beginPath();
          this.getInteractionPaths(l).forEach((path) => {
            if (path && path.meta && path.meta.kind === 'circle') {
              const meta =
                this.selectedLayerIds?.has(l.id) && this.tempTransform
                  ? this.transformCircleMeta(path.meta, this.tempTransform)
                  : path.meta;
              this.traceCircle(meta);
            } else {
              const next =
                this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
              this.tracePath(next, useCurves);
            }
          });
          this.ctx.stroke();
        });
      };

      // Render artboard-only snapshot for fill loupe (no selection handles or UI overlays).
      const fillToolActive = ['fill', 'fill-erase', 'fill-pattern', 'fill-pattern-erase'].includes(this.activeTool);
      if (fillToolActive) {
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const dpr = window.devicePixelRatio;
        if (!this._loupeCleanCanvas) {
          this._loupeCleanCanvas = document.createElement('canvas');
          this._loupeCleanCanvas.width = cw;
          this._loupeCleanCanvas.height = ch;
          this._loupeCleanCtx = this._loupeCleanCanvas.getContext('2d');
          this._loupeCleanCtx.scale(dpr, dpr);
        } else if (this._loupeCleanCanvas.width !== cw || this._loupeCleanCanvas.height !== ch) {
          this._loupeCleanCanvas.width = cw;
          this._loupeCleanCanvas.height = ch;
          this._loupeCleanCtx.scale(dpr, dpr);
        }
        const mainCtx = this.ctx;
        this.ctx = this._loupeCleanCtx;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.fillStyle = getThemeToken('--render-canvas', '#121214');
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.fillStyle = SETTINGS.bgColor;
        this.ctx.shadowColor = getThemeToken('--render-shadow', 'rgba(0,0,0,0.5)');
        this.ctx.shadowBlur = 20;
        this.ctx.fillRect(0, 0, prof.width, prof.height);
        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = getThemeToken('--render-paper-outline', '#333');
        this.ctx.lineWidth = 1 / this.scale;
        this.ctx.strokeRect(0, 0, prof.width, prof.height);
        this.ctx.lineJoin = 'round';
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawLayers();
        this.ctx.restore();
        this.ctx.restore();
        this.ctx = mainCtx;
      }

      if (SETTINGS.truncate) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawSelectionOutline();
        drawLayers();
        drawOptimizedOverlay();
        drawHelperOverlays();
        drawModifierGuides();
        this.drawMaskPreviewOverlay();
        if (this.patternFillPreviewPolygon) this.drawPatternFillPreview();
        this.drawActiveBatchOutline();
        this.ctx.restore();
      } else {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawSelectionOutline();
        drawLayers();
        drawOptimizedOverlay();
        drawHelperOverlays();
        drawModifierGuides();
        this.drawMaskPreviewOverlay();
        if (this.patternFillPreviewPolygon) this.drawPatternFillPreview();
        this.drawActiveBatchOutline();
        this.ctx.restore();

        const outsideAlpha = SETTINGS.outsideOpacity ?? 0.5;
        if (outsideAlpha > 0) {
          this.ctx.save();
          this.ctx.globalAlpha = outsideAlpha;
          this.ctx.beginPath();
          this.ctx.rect(0, 0, prof.width, prof.height);
          this.ctx.rect(m, m, innerW, innerH);
          this.ctx.clip('evenodd');
          drawLayers();
          this.ctx.restore();
        }
      }

      if (SETTINGS.marginLineVisible) {
        this.ctx.save();
        this.ctx.strokeStyle = SETTINGS.marginLineColor || '#52525b';
        this.ctx.lineWidth = SETTINGS.marginLineWeight ?? 0.2;
        const dotting = SETTINGS.marginLineDotting ?? 0;
        if (dotting > 0) this.ctx.setLineDash([dotting, dotting]);
        this.ctx.strokeRect(m, m, innerW, innerH);
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }

      if (SETTINGS.showDocumentDimensions) {
        this.drawDocumentDimensions(prof);
      }

      if (SETTINGS.showGuides && this.guides) this.drawGuides(this.guides);
      const selectionLayersForBox = this.tempTransform
        ? selectedLayers.filter((l) =>
            !l.displayMaskActive &&
            !(l.mask?.enabled && l.maskCapabilities?.canSource) &&
            !this.shouldSkipLayerForMaskPreview(l)
          )
        : selectedLayers;
      const showBoundingBox = this.activeTool !== 'pen' && this.activeTool !== 'direct';
      if (showBoundingBox && selectionLayersForBox.length) {
        let bounds;
        if (this.dragMode === 'rotate' && this.startBounds && this.tempTransform?.rotation != null) {
          bounds = this.applyRotationToBounds(this.startBounds, this.tempTransform.rotation);
        } else {
          bounds = this.getSelectionBounds(selectionLayersForBox, this.tempTransform);
        }
        const anyLocked = selectionLayersForBox.some((l) => this.isLayerLocked?.(l.id));
        const showHandles = !anyLocked;
        if (bounds) this.drawSelection(bounds, { showHandles });
      }
      // Key-object emphasis: when an Illustrator-style key object is set,
      // overlay its individual bbox with a thicker, solid stroke so the
      // anchor is visually distinguishable from sibling selection outlines.
      if (this.keyObjectId && this.selectedLayerIds.size > 1) {
        const keyLayer = this.engine.layers.find((l) => l.id === this.keyObjectId);
        if (keyLayer && keyLayer.visible !== false) {
          const keyBounds = this.getLayerBounds(keyLayer, this.tempTransform);
          if (keyBounds) this.drawKeyObjectOutline(keyBounds);
        }
      }
      if (this.selectionRect) this.drawSelectionRect(this.selectionRect);
      if (this.directMarqueeRect) this.drawSelectionRect(this.directMarqueeRect);
      if (this.algoDraft) this.drawAlgoDraftRect(this.algoDraft);
      if (this.lassoPath) this.drawSelectionPath(this.lassoPath);
      if (this.directSelection || this.directAuxSelections?.length) this.drawDirectSelection();
      if (!this.directSelection) {
        // Corner-radius handles persist across tools: drawn whenever a single shape layer is
        // selected (independent of showBoundingBox so they stay visible in pen/direct tools too).
        const shapeLayer = this.getSelectedShapeLayer();
        if (shapeLayer) this.drawShapeCornerHandles(shapeLayer, 0, 'all', this.tempTransform);
      }
      if (this.penDraft) this.drawPenPreview();
      if (this.shapeDraft) this.drawShapePreview();
      if (this.isScissor && this.scissorStart && this.scissorEnd) this.drawScissorPreview();
      if (this.lightSource) this.drawLightSource();
      this.ctx.restore();
      if (!showOptimizedOverlay || this.exportModalOpen) this.updateOptimizationOverlayLegend(false);
    }

    _drawGridLayer(w, h, spacing, style, color, opacity, lineWidth) {
      if (spacing <= 0) return;
      this.ctx.save();
      this.ctx.globalAlpha = opacity;
      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();

      if (style.includes('cartesian')) {
        if (style === 'cartesian') {
          for (let x = 0; x <= w; x += spacing) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
          }
          for (let y = 0; y <= h; y += spacing) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
          }
          this.ctx.stroke();
        } else if (style === 'cartesian-dot') {
          for (let x = 0; x <= w; x += spacing) {
            for (let y = 0; y <= h; y += spacing) {
              this.ctx.moveTo(x, y);
              this.ctx.arc(x, y, 0.35, 0, Math.PI * 2);
            }
          }
          this.ctx.fill();
        }
      } else if (style.includes('isometric')) {
        const L = spacing;
        const dx = L * Math.cos(Math.PI / 6);
        const dy = L * Math.sin(Math.PI / 6);
        if (style === 'isometric') {
          const tan30 = Math.tan(Math.PI / 6);
          for (let x = 0; x <= w; x += dx) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
          }
          const minDnY = Math.floor((-w * tan30) / L) * L;
          const maxDnY = Math.ceil(h / L) * L;
          for (let yInt = minDnY; yInt <= maxDnY; yInt += L) {
            this.ctx.moveTo(0, yInt);
            this.ctx.lineTo(w, yInt + w * tan30);
          }
          const maxUpY = Math.ceil((h + w * tan30) / L) * L;
          for (let yInt = 0; yInt <= maxUpY; yInt += L) {
            this.ctx.moveTo(0, yInt);
            this.ctx.lineTo(w, yInt - w * tan30);
          }
          this.ctx.stroke();
        } else if (style === 'isometric-dot') {
          let row = 0;
          for (let y = 0; y <= h + dy; y += dy) {
            const offsetX = (row % 2 === 1) ? dx : 0;
            for (let x = offsetX; x <= w + dx; x += dx * 2) {
              this.ctx.moveTo(x, y);
              this.ctx.arc(x, y, 0.35, 0, Math.PI * 2);
            }
            row++;
          }
          this.ctx.fill();
        }
      }
      this.ctx.restore();
    }

    drawGridOverlay(profile) {
      if (!profile) return;
      const style = SETTINGS.gridStyle || 'cartesian';
      const w = profile.width;
      const h = profile.height;
      const gridType = SETTINGS.gridType || 'none';

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, 0, w, h);
      this.ctx.clip();

      if (gridType === 'major-minor') {
        const minorSpacing = SETTINGS.gridMinorSize || 5;
        const minorOpacity = SETTINGS.gridMinorOpacity ?? 0.08;
        const minorColor = SETTINGS.gridMinorColor || '#ffffff';
        this._drawGridLayer(w, h, minorSpacing, style, minorColor, minorOpacity, 0.1);
      }

      const spacing = SETTINGS.gridSize || 10;
      const opacity = SETTINGS.gridOpacity ?? 0.2;
      const color = SETTINGS.gridColor || '#ffffff';
      this._drawGridLayer(w, h, spacing, style, color, opacity, 0.15);

      this.ctx.restore();
    }

    snapPointToGrid(pt) {
      if (!SETTINGS.gridSnapEnabled) return pt;
      const gridType = SETTINGS.gridType || 'none';
      if (gridType === 'none') return pt;
      const sensitivity = SETTINGS.gridSnapSensitivity ?? 50;
      if (sensitivity <= 0) return pt;
      const majorSpacing = SETTINGS.gridSize || 10;
      const snapRadius = (sensitivity / 100) * (majorSpacing / 2);
      const snapMajorX = Math.round(pt.x / majorSpacing) * majorSpacing;
      const snapMajorY = Math.round(pt.y / majorSpacing) * majorSpacing;
      const dxMajor = Math.abs(pt.x - snapMajorX);
      const dyMajor = Math.abs(pt.y - snapMajorY);
      if (gridType === 'major-minor') {
        const minorSpacing = SETTINGS.gridMinorSize || 5;
        const snapMinorX = Math.round(pt.x / minorSpacing) * minorSpacing;
        const snapMinorY = Math.round(pt.y / minorSpacing) * minorSpacing;
        const dxMinor = Math.abs(pt.x - snapMinorX);
        const dyMinor = Math.abs(pt.y - snapMinorY);
        if (Math.hypot(dxMinor, dyMinor) <= Math.hypot(dxMajor, dyMajor)) {
          if (dxMinor <= snapRadius && dyMinor <= snapRadius) {
            return { x: snapMinorX, y: snapMinorY };
          }
        }
      }
      if (dxMajor <= snapRadius && dyMajor <= snapRadius) {
        return { x: snapMajorX, y: snapMajorY };
      }
      return pt;
    }

    drawDocumentDimensions(profile) {
      if (!profile) return;
      const units = normalizeDocumentUnits(SETTINGS.documentUnits);
      const labelColor = getThemeToken('--render-guide-faint', 'rgba(248, 250, 252, 0.75)');
      const lineColor = getThemeToken('--render-frame-stroke', 'rgba(255,255,255,0.08)');
      const badgeFill = getThemeToken('--render-underlay-fill', 'rgba(15, 23, 42, 0.92)');
      const badgeStroke = getThemeToken('--render-underlay-stroke', 'rgba(15, 23, 42, 1)');
      const widthText = formatDocumentLength(profile.width, units, {
        precision: units === 'imperial' ? 2 : 1,
        trimTrailingZeros: true,
        spaceBeforeUnit: true,
      });
      const heightText = formatDocumentLength(profile.height, units, {
        precision: units === 'imperial' ? 2 : 1,
        trimTrailingZeros: true,
        spaceBeforeUnit: true,
      });
      const scale = Math.max(this.scale || 1, 0.01);
      const fontSize = 10 / scale;
      const offset = 16 / scale;
      const tick = 6 / scale;
      const badgePadX = 6 / scale;
      const badgePadY = 3 / scale;
      const topY = -offset;
      const leftX = -offset;
      const drawBadge = (text, x, y, rotation = 0) => {
        this.ctx.save();
        this.ctx.translate(x, y);
        if (rotation) this.ctx.rotate(rotation);
        this.ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const metrics = this.ctx.measureText(text);
        const width = metrics.width + badgePadX * 2;
        const height = fontSize + badgePadY * 2;
        this.ctx.fillStyle = badgeFill;
        this.ctx.strokeStyle = badgeStroke;
        this.ctx.lineWidth = 1 / scale;
        this.ctx.beginPath();
        this.ctx.rect(-width / 2, -height / 2, width, height);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.fillStyle = labelColor;
        this.ctx.fillText(text, 0, 0);
        this.ctx.restore();
      };

      this.ctx.save();
      this.ctx.strokeStyle = lineColor;
      this.ctx.lineWidth = 0.8 / scale;
      this.ctx.beginPath();
      this.ctx.moveTo(0, topY + tick);
      this.ctx.lineTo(0, topY);
      this.ctx.lineTo(profile.width, topY);
      this.ctx.lineTo(profile.width, topY + tick);
      this.ctx.moveTo(leftX + tick, 0);
      this.ctx.lineTo(leftX, 0);
      this.ctx.lineTo(leftX, profile.height);
      this.ctx.lineTo(leftX + tick, profile.height);
      this.ctx.stroke();

      drawBadge(widthText, profile.width / 2, topY);
      drawBadge(heightText, leftX, profile.height / 2, -Math.PI / 2);
      this.ctx.restore();
    }

    wheel(e) {
      if (!this.ready) return;
      e.preventDefault();
      // Paint bucket: wheel cycles through the ancestor stack of containing
      // closed loops without modifier keys; held modifiers still pan/zoom.
      if ((this.activeTool === 'fill' || this.activeTool === 'fill-erase') &&
          !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey &&
          Array.isArray(this.paintBucketStack) && this.paintBucketStack.length > 1) {
        const dir = e.deltaY > 0 ? -1 : 1;
        const next = Math.max(0, Math.min(this.paintBucketStack.length - 1, this.paintBucketScopeIndex + dir));
        if (next !== this.paintBucketScopeIndex) {
          this.paintBucketScopeIndex = next;
          const entry = this.paintBucketStack[next];
          this.patternFillPreviewPolygon = entry?.polygon || null;
          this.patternFillPreviewInnerPolygon = entry?.innerPolygon || null;
          if (this.app?.ui?.setPaintBucketHint && entry) {
            if (entry.isDocBounds) {
              this.app.ui.setPaintBucketHint('Scope: document bounds — click to fill background');
            } else {
              const params = this.app?.paintBucketPanel?.getFillParams?.() || {};
              const scope = params.fillScope || 'all-objects';
              const label = scope === 'single-object' ? 'Path' : 'Scope';
              const scrollHint = scope === 'single-object' ? 'scroll to change path' : 'scroll to widen';
              this.app.ui.setPaintBucketHint(`${label} ${next + 1}/${this.paintBucketStack.length - 1} · ${scrollHint}`);
            }
          }
          this.draw();
        }
        return;
      }
      if (e.shiftKey) {
        this.offsetX += e.deltaX || e.deltaY;
        this.userHasManipulated = true;
        this.draw();
        return;
      }
      if (e.metaKey) {
        this.offsetY += e.deltaY;
        this.userHasManipulated = true;
        this.draw();
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - this.offsetX) / this.scale;
      const wy = (my - this.offsetY) / this.scale;
      const zoom = e.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = Math.max(0.1, Math.min(this.scale * zoom, 1000));
      this.offsetX = mx - wx * nextScale;
      this.offsetY = my - wy * nextScale;
      this.scale = nextScale;
      this.userHasManipulated = true;
      this.draw();
    }

    down(e) {
      if (!this.ready) return;
      if (this.isTouchPointer(e)) {
        this.updateTouchPointer(e);
        if (this.touchPointers.size >= 2) {
          if (!this.touchGesture && this.canStartTouchGesture()) this.startTouchGesture();
          if (this.touchGesture) {
            if (e.cancelable) e.preventDefault();
            return;
          }
        }
      }

      if (this.touchGesture) return;
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      if (e.pointerId !== undefined) {
        this.activePointerId = e.pointerId;
        if (this.canvas.setPointerCapture) {
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch (err) {
            // Ignore pointer capture issues on unsupported combinations.
          }
        }
      }

      const modifiers = this.getModifierState(e);
      if (this.wantsPan(e, modifiers)) {
        this.isPan = true;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.setCanvasCursor('grabbing');
        if (e.cancelable) e.preventDefault();
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      if (e.button !== undefined && e.button !== 0) return;

      if (this.lightSourcePlacement) {
        this.setLightSource(world);
        this.lightSourcePlacement = false;
        return;
      }

      if (this.hitLightSource(world)) {
        this.lightSourceSelected = true;
        this.isLightDrag = true;
        this.lightDragOffset = { x: world.x - this.lightSource.x, y: world.y - this.lightSource.y };
        this.clearSelection();
        this.setCanvasCursor('grabbing');
        return;
      }

      this.lightSourceSelected = false;

      if (this.activeTool === 'select' && this.getActiveModifierLayer()) {
        const hitGuide = this.hitModifierGuide(world);
        if (hitGuide) {
          if (hitGuide.guide.locked) {
            e.preventDefault();
            return;
          }
          if (hitGuide.type === 'flip') {
            const m = hitGuide.guide.mirror;
            if (m.type === 'arc') {
              m.replacedSide = m.replacedSide === 'outer' ? 'inner' : 'outer';
            } else {
              m.replacedSide = m.replacedSide === 'negative' ? 'positive' : 'negative';
            }
            this.onComputeDisplayGeometry ? this.onComputeDisplayGeometry() : this.engine.computeAllDisplayGeometry();
            if (this.onCommitTransform) this.onCommitTransform();
            this.draw();
            e.preventDefault();
            return;
          }
          const hitMirror = hitGuide.guide.mirror;
          const hitHandleId = hitGuide.handleId;
          this.modifierDrag = {
            type: hitGuide.type,
            guide: hitGuide.guide,
            handleId: hitHandleId || null,
            startWorld: { x: world.x, y: world.y },
            startAngle: hitMirror.angle ?? 0,
            startShiftX: hitMirror.xShift ?? 0,
            startShiftY: hitMirror.yShift ?? 0,
            startCenterX: hitMirror.centerX ?? 0,
            startCenterY: hitMirror.centerY ?? 0,
            startRadius: hitMirror.radius ?? 100,
            axisPoint: hitGuide.guide.axis?.point ? { ...hitGuide.guide.axis.point } : { x: world.x, y: world.y },
            startOrigin: hitGuide.guide.origin ? { ...hitGuide.guide.origin } : null,
            startRotation: hitMirror.rotation ?? 0,
          };
          this.setCanvasCursor(
            hitGuide.type === 'rotate' ? 'grabbing' :
            (hitGuide.type === 'latticeA' || hitGuide.type === 'latticeB' || hitGuide.type === 'mirrorAxisRotate') ? 'crosshair' : 'move'
          );
          e.preventDefault();
          return;
        }
      }

      if (this.isShapeTool()) {
        this.startShapeDraft(this.snapPointToGrid(world), e);
        return;
      }

      if (this.isAlgoDrawTool()) {
        const now = performance.now();
        const dt = now - this._lastAlgoTap.time;
        const dist = Math.hypot(e.clientX - this._lastAlgoTap.x, e.clientY - this._lastAlgoTap.y);
        this._lastAlgoTap = { time: now, x: e.clientX, y: e.clientY };
        if (dt < 400 && dist < 30) {
          this._lastAlgoTap.time = 0;
          if (this.onAlgoDrawComplete) {
            this.onAlgoDrawComplete({ algoType: this.algoDraftType, rect: { x: 0, y: 0, w: 0, h: 0 } });
          }
          return;
        }
        this.startAlgoDraft(this.snapPointToGrid(world));
        return;
      }

      const penSelectOverride = this.activeTool === 'pen' && modifiers.meta;
      const allowSelection = this.activeTool !== 'pen' || penSelectOverride;

      if (this.activeTool === 'pen' && !penSelectOverride) {
        if (this.penMode === 'draw') {
          this.handlePenDown(world, e);
          return;
        }
        let handled = false;
        if (this.penMode === 'add') handled = this.insertAnchorFromWorld(world);
        if (this.penMode === 'delete') handled = this.removeAnchorFromWorld(world);
        if (this.penMode === 'anchor') handled = this._handlePenAnchorDown(world, e);
        if (!handled) {
          const hit = this.findPathHitAtPoint(world);
          if (hit) {
            if (!this.selectedLayerIds.has(hit.layer.id)) this.selectLayer(hit.layer);
            this.setDirectSelection(hit.layer, hit.pathIndex);
            this.draw();
          }
        }
        return;
      }
      if (this.activeTool === 'scissor') {
        this.isScissor = true;
        this.scissorStart = world;
        this.scissorEnd = world;
        this.draw();
        return;
      }

      if (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
        if (!this._isWorldInsidePaper(world)) {
          if (e.cancelable) e.preventDefault();
          return;
        }
        const poly = this._computeFillPreviewPolygon(world.x, world.y);
        if (poly && this.onPatternFill) {
          this.onPatternFill({ tool: this.activeTool, polygon: poly, worldX: world.x, worldY: world.y });
        }
        if (e.cancelable) e.preventDefault();
        return;
      }

      if (this.activeTool === 'fill' || this.activeTool === 'fill-erase') {
        if (!this._isWorldInsidePaper(world)) {
          if (e.cancelable) e.preventDefault();
          return;
        }
        // CMD/Ctrl+click on an existing fill adopts it as the active batch so
        // the user can tweak its params via the panel. Only meaningful in
        // pour mode; in erase mode CMD acts like a plain click.
        if (this.activeTool === 'fill' && (e.metaKey || e.ctrlKey) && !e.altKey) {
          // CMD/Ctrl is a sample gesture, not a pour. If there is no fill
          // under the cursor (empty shape or empty canvas) leave the shape
          // empty rather than falling through to a normal pour.
          this._paintBucketAdoptAtPoint(world);
          if (e.cancelable) e.preventDefault();
          return;
        }
        this._paintBucketHover(world);
        const mode = this.activeTool === 'fill-erase' ? 'erase' : 'pour';
        this._paintBucketPour(world, mode, { startBatch: true });
        if (e.cancelable) e.preventDefault();
        return;
      }

      this._pendingSingleSelect = null;
      if (allowSelection) {
        if (this.activeTool === 'direct') {
          const selectedShape = this.getSelectedShapeLayer();
          if (selectedShape) {
            const shapeCorner = this.hitShapeCornerHandle(world, selectedShape, 0);
            if (shapeCorner && this.beginShapeCornerDrag(selectedShape, 0, shapeCorner, 'single')) return;
          }
          const directControl = this.hitDirectControl(world);
          if (directControl) {
            this.startDirectDrag(directControl, e);
            return;
          }
          const hit = this.findPathHitAtPoint(world);
          if (hit) {
            if (!this.selectedLayerIds.has(hit.layer.id)) this.selectLayer(hit.layer);
            const selection = this.setDirectSelection(hit.layer, hit.pathIndex);
            if (selection && selection.anchors.length) {
              const worldAnchors = this.getDirectSelectionWorldAnchors();
              const anchorTol = 6 / this.scale;
              const anchorTolSq = anchorTol * anchorTol;
              let nearestIdx = -1;
              let nearestDistSq = Infinity;
              if (worldAnchors) {
                worldAnchors.anchors.forEach((anchor, i) => {
                  const dx = world.x - anchor.x;
                  const dy = world.y - anchor.y;
                  const dSq = dx * dx + dy * dy;
                  if (dSq < nearestDistSq) { nearestDistSq = dSq; nearestIdx = i; }
                });
              }
              if (nearestIdx >= 0 && nearestDistSq <= anchorTolSq) {
                // Near an endpoint — select just that anchor
                selection.selectedIndices = new Set([nearestIdx]);
                this.startDirectDrag({ type: 'anchor', index: nearestIdx }, e);
              } else {
                // On segment body — select both endpoints so dragging moves the whole segment
                const seg = Math.max(0, Math.min((hit.segmentIndex ?? 0), selection.anchors.length - 1));
                const nextSeg = Math.min(seg + 1, selection.anchors.length - 1);
                selection.selectedIndices = new Set(nextSeg !== seg ? [seg, nextSeg] : [seg]);
                this.startDirectDrag({ type: 'anchor', index: seg }, e);
                // Store grab offset so drag tracks from where the user clicked, not from the anchor corner
                if (this.directDrag) {
                  const dragLayer = this.getDirectSelectionLayer();
                  if (dragLayer) {
                    const grabSrc = this.worldToSourcePoint(dragLayer, world);
                    const a = selection.anchors[seg];
                    this.directDrag.grabOffset = { x: grabSrc.x - a.x, y: grabSrc.y - a.y };
                  }
                }
              }
            }
            this.draw();
            return;
          }
          // No path or anchor hit — start marquee to select anchors
          this.clearDirectSelection();
          this.isDirectMarquee = true;
          this.directMarqueeStart = world;
          this.directMarqueeRect = { x: world.x, y: world.y, w: 0, h: 0 };
          this.draw();
          return;
        }
        if (this.activeTool === 'lasso') {
          this.isLassoSelecting = true;
          this.lassoPath = [world];
          this.clearSelection();
          this.draw();
          return;
        }
        const selectedLayers = this.getSelectedLayers();
        const selectionBounds = this.getSelectionBounds(selectedLayers);
        if (this.activeTool === 'select' && selectedLayers.length === 1 && !this.isLayerLocked?.(selectedLayers[0].id)) {
          const shapeLayer = this.getSelectedShapeLayer();
          if (shapeLayer) {
            const shapeCorner = this.hitShapeCornerHandle(world, shapeLayer, 0);
            if (shapeCorner && this.beginShapeCornerDrag(shapeLayer, 0, shapeCorner, 'all')) return;
          }
        }
        if (selectionBounds && !selectedLayers.some(l => this.isLayerLocked?.(l.id))) {
          const handle = this.hitHandle(sx, sy, selectionBounds);
          if (handle) {
            this.isLayerDrag = true;
            this.snapAllowed = true;
            this.activeHandle = handle;
            this.dragStart = world;
            this.startBounds = selectionBounds;
            this.startMaskPreviewForSelection(selectedLayers);
            if (handle === 'rotate' || handle.startsWith('rotate-')) {
              this.dragMode = 'rotate';
              this.rotateOrigin = this.getBoundsCenter(selectionBounds);
              this.rotateStart = this.selectedLayerId ? this.getSelectedLayer()?.params.rotation ?? 0 : 0;
              this.rotateStartAngle = Math.atan2(world.y - this.rotateOrigin.y, world.x - this.rotateOrigin.x);
              this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: this.rotateOrigin, rotation: 0 };
              this.setCanvasCursor('grabbing');
            } else {
              this.dragMode = 'resize';
              this.setCanvasCursor(this.handleCursor(handle, selectionBounds), 'resize');
            }
            e.preventDefault();
            return;
          }
        }

        const topLayer =
          this.activeTool === 'direct' ? this.findLayerAtPointPrecise(world) : this.findLayerAtPoint(world);

        // Group-aware selection: group move and sublayer edit mode
        let _groupHandled = false;
        if (this.activeTool === 'select') {
          const now = performance.now();
          const prev = this._selectLastClick;
          const sX = e.clientX ?? 0;
          const sY = e.clientY ?? 0;
          const isDoubleClick = prev && (now - prev.time) < 400 && Math.hypot(sX - prev.x, sY - prev.y) < 8;
          this._selectLastClick = { time: now, x: sX, y: sY };

          if (this.groupEditMode) {
            const inGroup = topLayer?.parentId === this.groupEditMode.groupId;
            if (!inGroup) {
              this.exitGroupEditMode();
            } else {
              this.groupEditMode.activeLayerId = topLayer.id;
              this.setSelection([topLayer.id], topLayer.id);
              this.draw();
              _groupHandled = true;
            }
          }
          if (!_groupHandled && topLayer && !modifiers.shift && !modifiers.meta && !modifiers.ctrl) {
            const parentLayer = topLayer.parentId
              ? this.engine.layers.find(l => l.id === topLayer.parentId)
              : null;
            if (parentLayer?.isGroup && parentLayer.groupType === 'group') {
              if (isDoubleClick) {
                this.enterGroupEditMode(topLayer);
                e.preventDefault();
                return;
              }
              const siblings = this.engine.getLayerChildren(topLayer.parentId)
                .filter(l => l.visible && !this.isLayerLocked?.(l.id));
              if (siblings.length > 1) {
                this.setSelection(siblings.map(l => l.id), topLayer.id);
                _groupHandled = true;
              }
            }
          }
        }

        if (!_groupHandled) {
          if (topLayer && !this.selectedLayerIds.has(topLayer.id)) {
            const maskGroup = this._getMaskGroupLayers(topLayer);
            if (maskGroup && maskGroup.length > 1) {
              this.setSelection(maskGroup.map(l => l.id), topLayer.id);
            } else {
              this.selectLayer(topLayer);
            }
          } else if (topLayer && this.selectedLayerIds.size > 1 && !modifiers.shift && !modifiers.meta && !modifiers.ctrl) {
            this._pendingSingleSelect = topLayer;
          }
        }
        const updatedSelected = this.getSelectedLayers();
        const bounds = this.getSelectionBounds(updatedSelected);
        if (bounds && this.pointInBounds(world, bounds) && !updatedSelected.some(l => this.isLayerLocked?.(l.id))) {
          if (this.isTouchPointer(e) && !modifiers.alt) {
            // Touch: hold to lift — defer drag until finger has been held still for 350ms
            this._pendingSingleSelect = null;
            this.touchHoldStartClient = { x: e.clientX, y: e.clientY };
            this.touchHoldPending = { world, updatedSelected, bounds };
            this.touchHoldTimer = setTimeout(() => {
              this.touchHoldTimer = null;
              if (!this.touchHoldPending) return;
              const { world: w, updatedSelected: layers, bounds: b } = this.touchHoldPending;
              this.touchHoldPending = null;
              this.isLayerDrag = true;
              this.snapAllowed = true;
              this.dragMode = 'move';
              this.dragStart = w;
              this.startBounds = b;
              this.startMaskPreviewForSelection(layers);
              this._startMirrorDrag(layers);
              this.setCanvasCursor(layers.length > 1 ? 'grabbing' : 'move');
              this._attachShiftDragListener();
              if (navigator.vibrate) navigator.vibrate(30);
              this.draw();
            }, 350);
          } else {
            this.isLayerDrag = true;
            this.snapAllowed = true;
            this.dragMode = 'move';
            this.dragStart = world;
            this.startBounds = bounds;
            this.startMaskPreviewForSelection(updatedSelected);
            this._startMirrorDrag(updatedSelected);
            this.setCanvasCursor(updatedSelected.length > 1 ? 'grabbing' : 'move');
            this._attachShiftDragListener();
            if (modifiers.alt && updatedSelected.length === 1) {
              if (this.onDuplicateLayer) this.onDuplicateLayer();
              const dup = this.engine.duplicateLayer ? this.engine.duplicateLayer(updatedSelected[0].id) : null;
              if (dup) {
                this.selectLayer(dup);
                this.dragStart = world;
                this.startBounds = this.getSelectionBounds([dup]) || bounds;
              }
            }
          }
          e.preventDefault();
        } else if (topLayer) {
          // no-op
        } else {
          if (!this.findLayerAtPoint(world, true)) {
            this.clearMaskPreview();
            this.isSelecting = true;
            this.selectionStart = world;
            this.selectionRect = { x: world.x, y: world.y, w: 0, h: 0 };
            this.clearSelection();
          }
        }
      }
    }

    move(e) {
      if (!this.ready) return;
      if (this.activeTool === 'fill' || this.activeTool === 'fill-erase') {
        const rect = this.canvas.getBoundingClientRect();
        // `move` is wired to the window, so it fires even after the cursor
        // leaves the canvas. Without this guard the hover would re-find a
        // region under the off-canvas coordinate and re-paint the blue
        // preview overlay we just cleared on pointerleave.
        const inside =
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside) {
          this._paintBucketClearHover();
          return;
        }
        const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        // Once the cursor crosses out of the paper rectangle into the
        // surrounding canvas margin, drop the blue fill preview and bail
        // before any pour logic — clicks in the margin must not fill.
        if (!this._isWorldInsidePaper(world)) {
          this._paintBucketClearHover();
          return;
        }
        this._paintBucketHover(world);
        this.showFillLoupe(e.clientX, e.clientY);
        // Drag-pour: while the primary button AND Shift are held and we
        // cross into a new region's loopId, pour again. lastPourLoopId is
        // reset on up(). Shift gating keeps a plain click from accidentally
        // filling adjacent regions when the mouse jiggles before release.
        if ((e.buttons & 1) && e.shiftKey && this.paintBucketStack?.length) {
          const target = this.paintBucketStack[this.paintBucketScopeIndex];
          if (target && target.loopId !== this.lastPourLoopId) {
            const mode = this.activeTool === 'fill-erase' ? 'erase' : 'pour';
            this._paintBucketPour(world, mode, { startBatch: false });
          }
        }
        this.draw();
      } else if (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
        const rect = this.canvas.getBoundingClientRect();
        const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (!this._isWorldInsidePaper(world)) {
          this.patternFillPreviewPolygon = null;
          this.hideFillLoupe?.();
          this.draw();
          return;
        }
        this.patternFillPreviewPolygon = this._computeFillPreviewPolygon(world.x, world.y);
        this.showFillLoupe(e.clientX, e.clientY);
        this.draw();
      }
      if (this.isTouchPointer(e)) this.updateTouchPointer(e);
      if (this.touchGesture) {
        if (this.touchPointers.size >= 2) {
          this.updateTouchGesture();
          if (e.cancelable) e.preventDefault();
        }
        return;
      }
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      const modifiers = this.getModifierState(e);
      if (this.touchHoldPending && this.isTouchPointer(e)) {
        const dx = e.clientX - this.touchHoldStartClient.x;
        const dy = e.clientY - this.touchHoldStartClient.y;
        if (Math.hypot(dx, dy) > 12) {
          this.clearTouchHold();
          this.isPan = true;
          this.lastM = { x: e.clientX, y: e.clientY };
          this.setCanvasCursor('grabbing');
        } else {
          return;
        }
      }
      if (this.isPan) {
        this.offsetX += e.clientX - this.lastM.x;
        this.offsetY += e.clientY - this.lastM.y;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.userHasManipulated = true;
        this.draw();
        return;
      }

      if (this.isLightDrag && this.lightSource) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.lightSource = {
          x: world.x - this.lightDragOffset.x,
          y: world.y - this.lightDragOffset.y,
        };
        SETTINGS.lightSource = { ...this.lightSource };
        this.draw();
        return;
      }

      if (this.shapeCornerDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this._dragCursorPos = { x: e.clientX, y: e.clientY };
        this.updateShapeCornerDrag(world);
        return;
      }

      if (this.penAnchorDrag && this.activeTool === 'pen' && this.penMode === 'anchor') {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const drag = this.penAnchorDrag;
        const layer = this.getDirectSelectionLayer();
        const anchor = this.directSelection?.anchors[drag.index];
        if (layer && anchor) {
          if (!drag.historyPushed) {
            if (this.onDirectEditStart) this.onDirectEditStart();
            this.markDirectSelectionAsCustomPath();
            drag.historyPushed = true;
          }
          const modifiers = this.getModifierState(e);
          const anchorWorld = this.sourceToWorldPoint(layer, anchor);
          const distWorld = Math.hypot(world.x - anchorWorld.x, world.y - anchorWorld.y);
          const minDist = 2 / this.scale;
          if (distWorld <= minDist) {
            anchor.out = null;
            anchor.in = null;
          } else {
            let next = this.worldToSourcePoint(layer, world);
            if (modifiers.shift) next = this.snapPenAngle(anchor, next);
            anchor.out = { x: next.x, y: next.y };
            if (!modifiers.alt) {
              const dx = next.x - anchor.x;
              const dy = next.y - anchor.y;
              anchor.in = { x: anchor.x - dx, y: anchor.y - dy };
            }
          }
          drag.moved = true;
          this.applyDirectPath();
          this.draw();
        }
        return;
      }

      if (this.directDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.updateDirectDrag(world, e);
        return;
      }

      if (this.modifierDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const drag = this.modifierDrag;
        const mirror = drag.guide.mirror;
        if (drag.type === 'move') {
          const dx = world.x - drag.startWorld.x;
          const dy = world.y - drag.startWorld.y;
          if (mirror.type === 'radial' || mirror.type === 'arc' || mirror.type === 'wallpaper') {
            mirror.centerX = drag.startCenterX + dx;
            mirror.centerY = drag.startCenterY + dy;
          } else {
            mirror.xShift = drag.startShiftX + dx;
            mirror.yShift = drag.startShiftY + dy;
          }
        } else if (drag.type === 'rotate') {
          const startAngle = Math.atan2(drag.startWorld.y - drag.axisPoint.y, drag.startWorld.x - drag.axisPoint.x);
          const nextAngle = Math.atan2(world.y - drag.axisPoint.y, world.x - drag.axisPoint.x);
          let delta = ((nextAngle - startAngle) * 180) / Math.PI;
          if (modifiers.shift) delta = Math.round(delta / 15) * 15;
          mirror.angle = drag.startAngle + delta;
        } else if (drag.type === 'resize') {
          const dx = world.x - drag.startWorld.x;
          const dy = world.y - drag.startWorld.y;
          const center = drag.guide.center;
          const hdx = drag.startWorld.x - center.x;
          const hdy = drag.startWorld.y - center.y;
          const hlen = Math.hypot(hdx, hdy);
          const delta = hlen > 0 ? (dx * hdx + dy * hdy) / hlen : Math.hypot(dx, dy) * (dx >= 0 ? 1 : -1);
          mirror.radius = Math.max(1, drag.startRadius + delta);
          this.showDragTooltip(`r ${mirror.radius.toFixed(1)}`, e.clientX, e.clientY);
        } else if (drag.type === 'latticeA') {
          const origin = drag.startOrigin;
          const vec = { x: world.x - origin.x, y: world.y - origin.y };
          const len = Math.hypot(vec.x, vec.y);
          if (len > 0.5) {
            let newRot = Math.atan2(vec.y, vec.x) * 180 / Math.PI;
            if (modifiers.shift) newRot = Math.round(newRot / 15) * 15;
            mirror.tileWidth = Math.max(1, len);
            mirror.rotation = newRot;
          }
        } else if (drag.type === 'latticeB') {
          const origin = drag.startOrigin;
          const vec = { x: world.x - origin.x, y: world.y - origin.y };
          const len = Math.hypot(vec.x, vec.y);
          if (len > 0.5) {
            const absAngle = Math.atan2(vec.y, vec.x) * 180 / Math.PI;
            let newTileAngle = absAngle - mirror.rotation;
            if (modifiers.shift) newTileAngle = Math.round(newTileAngle / 15) * 15;
            mirror.tileHeight = Math.max(1, len);
            mirror.tileAngle = newTileAngle;
          }
        }
        this.onComputeDisplayGeometry ? this.onComputeDisplayGeometry() : this.engine.computeAllDisplayGeometry();
        this.draw();
        return;
      }

      if (this.isLayerDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        if (this.dragMode === 'move') {
          this.lastDragWorld = world;
          let dx = world.x - this.dragStart.x;
          let dy = world.y - this.dragStart.y;
          if (modifiers.shift && this.startBounds) {
            const oc = this.startBounds.center || this.startBounds.origin;
            const mrx = world.x - oc.x;
            const mry = world.y - oc.y;
            const step = Math.PI / 4;
            const snapped = Math.round(Math.atan2(mry, mrx) / step) * step;
            const ux = Math.cos(snapped);
            const uy = Math.sin(snapped);
            const proj = mrx * ux + mry * uy;
            dx = ux * proj;
            dy = uy * proj;
          }
          this.tempTransform = { dx, dy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
          if (this.mirrorDragState) {
            this.mirrorDragState.forEach((state, layerId) => {
              const layer = this.engine.layers.find((l) => l.id === layerId);
              if (!layer) return;
              layer.paths = state.basePaths.map((path) => {
                if (!Array.isArray(path)) return path;
                const t = path.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
                if (path.meta) {
                  t.meta = { ...path.meta };
                  if (typeof path.meta.cx === 'number') t.meta.cx = path.meta.cx + dx;
                  if (typeof path.meta.cy === 'number') t.meta.cy = path.meta.cy + dy;
                }
                return t;
              });
              if (this.engine.computeLayerEffectiveGeometry) this.engine.computeLayerEffectiveGeometry(layer.id);
              if (this.engine.computeLayerDisplayGeometry) this.engine.computeLayerDisplayGeometry(layer.id);
            });
          }
        } else if (this.dragMode === 'resize' && this.startBounds && this.activeHandle) {
          const fromCenter = modifiers.alt || modifiers.meta;
          const origin = fromCenter ? this.getBoundsCenter(this.startBounds) : this.getResizeAnchor(this.activeHandle, this.startBounds);
          const handlePoint = this.getHandlePoint(this.activeHandle, this.startBounds);
          const startVec = { x: handlePoint.x - origin.x, y: handlePoint.y - origin.y };
          const currVec = { x: world.x - origin.x, y: world.y - origin.y };
          const rot = -(this.startBounds.rotation || 0);
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const startVecLocal = { x: startVec.x * cosR - startVec.y * sinR, y: startVec.x * sinR + startVec.y * cosR };
          const currVecLocal = { x: currVec.x * cosR - currVec.y * sinR, y: currVec.x * sinR + currVec.y * cosR };
          const safeX = Math.abs(startVecLocal.x) < 0.001 ? 0.001 : startVecLocal.x;
          const safeY = Math.abs(startVecLocal.y) < 0.001 ? 0.001 : startVecLocal.y;
          let scaleX = currVecLocal.x / safeX;
          let scaleY = currVecLocal.y / safeY;
          if (modifiers.shift) {
            const uni = Math.abs(scaleX) > Math.abs(scaleY) ? scaleX : scaleY;
            scaleX = uni;
            scaleY = uni;
          }
          scaleX = Math.max(0.05, Math.min(Math.abs(scaleX), 20));
          scaleY = Math.max(0.05, Math.min(Math.abs(scaleY), 20));
          this.tempTransform = { dx: 0, dy: 0, scaleX, scaleY, origin };
          const _tw = Math.round(Math.abs((this.startBounds.maxX - this.startBounds.minX) * scaleX));
          const _th = Math.round(Math.abs((this.startBounds.maxY - this.startBounds.minY) * scaleY));
          this.showDragTooltip(`${_tw} × ${_th}`, e.clientX, e.clientY);
        } else if (this.dragMode === 'rotate' && this.rotateOrigin) {
          const angle = Math.atan2(world.y - this.rotateOrigin.y, world.x - this.rotateOrigin.x);
          let delta = ((angle - this.rotateStartAngle) * 180) / Math.PI;
          if (modifiers.shift) {
            const snap = 15;
            delta = Math.round(delta / snap) * snap;
          }
          this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: this.rotateOrigin, rotation: delta };
          this.showDragTooltip(`${Math.round(delta)}°`, e.clientX, e.clientY);
        }
        const activeLayers = this.getSelectedLayers();
        const bounds = activeLayers.length ? this.getSelectionBounds(activeLayers, this.tempTransform) : null;
        const needsGuides = SETTINGS.showGuides || SETTINGS.snapGuides;
        this.snapAllowed = !modifiers.meta;
        this.guides = needsGuides && bounds ? this.computeGuides(activeLayers, bounds) : null;
        this.snap = SETTINGS.snapGuides && bounds ? this.computeSnap(activeLayers, bounds) : null;
        this.draw();
        return;
      }

      if (this.activeTool === 'pen' && this.penDraft) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        const anchors = this.penDraft.anchors || [];
        if (this.isPenDragging && this.penDragAnchor !== null) {
          const anchor = anchors[this.penDragAnchor];
          if (anchor) {
            const target = modifiers.shift ? this.snapPenAngle(anchor, next) : next;
            const dist = Math.hypot(target.x - anchor.x, target.y - anchor.y);
            const minDist = 2 / this.scale;
            if (this.isPenCloseDragging) {
              // Only update anchor[0].in — controls the incoming curve of the closing segment.
              // Do not touch anchor[0].out (set when the path was started).
              if (dist <= minDist) {
                anchor.in = null;
              } else {
                const vec = { x: target.x - anchor.x, y: target.y - anchor.y };
                anchor.in = { x: anchor.x - vec.x, y: anchor.y - vec.y };
              }
            } else {
              if (dist <= minDist) {
                anchor.in = null;
                anchor.out = null;
              } else {
                this.setAnchorHandles(anchor, target, { breakHandle: modifiers.alt });
              }
              this.penPreview = target;
            }
          }
        } else {
          const last = anchors[anchors.length - 1];
          const snapped = this.snapPointToGrid(next);
          let preview = modifiers.shift && last ? this.snapPenAngle(last, snapped) : snapped;
          const first = anchors[0];
          const snapTol = 5 / this.scale;
          if (!modifiers.meta && anchors.length >= 2 && first &&
              Math.hypot(next.x - first.x, next.y - first.y) <= snapTol) {
            preview = { x: first.x, y: first.y };
            this.penSnapToOrigin = true;
          } else {
            this.penSnapToOrigin = false;
          }
          this.penPreview = preview;
        }
        this.draw();
        return;
      }

      if (this.isShapeTool() && this.shapeDraft) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        this.updateShapeDraft(this.snapPointToGrid(next), e);
        return;
      }

      if (this.algoDraft) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        this.updateAlgoDraft(this.snapPointToGrid(next));
        return;
      }

      if (this.activeTool === 'scissor' && this.isScissor) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        this.scissorEnd =
          this.scissorMode === 'line' && modifiers.shift && this.scissorStart
            ? this.snapScissorAngle(this.scissorStart, next, 15)
            : next;
        this.draw();
        return;
      }

      if (this.isLassoSelecting && this.lassoPath) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const last = this.lassoPath[this.lassoPath.length - 1];
        const minDist = 2 / this.scale;
        if (!last || Math.hypot(world.x - last.x, world.y - last.y) >= minDist) {
          this.lassoPath.push(world);
        }
        this.draw();
        return;
      }

      if (this.isDirectMarquee && this.directMarqueeStart) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.directMarqueeRect = {
          x: Math.min(this.directMarqueeStart.x, world.x),
          y: Math.min(this.directMarqueeStart.y, world.y),
          w: Math.abs(world.x - this.directMarqueeStart.x),
          h: Math.abs(world.y - this.directMarqueeStart.y),
        };
        this.draw();
        return;
      }

      if (this.isSelecting && this.selectionStart) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const dx = world.x - this.selectionStart.x;
        const dy = world.y - this.selectionStart.y;
        let w = Math.abs(dx);
        let h = Math.abs(dy);
        let x = Math.min(this.selectionStart.x, world.x);
        let y = Math.min(this.selectionStart.y, world.y);
        if (modifiers.meta) {
          const size = Math.max(w, h);
          w = size;
          h = size;
          x = this.selectionStart.x + (dx < 0 ? -size : 0);
          y = this.selectionStart.y + (dy < 0 ? -size : 0);
        }
        this.selectionRect = { x, y, w, h };
        this.draw();
        return;
      }

      if (!this.isTouchPointer(e)) {
        this._lastPointerEvent = e;
        this.updateHoverCursor(e);
      }
    }

    up(e = {}) {
      if (!this.ready || !this.canvas) return;
      this.lastPourLoopId = null;
      this.removeTouchPointer(e);
      const clearActivePointer = () => {
        if (e.pointerId !== undefined && this.canvas.releasePointerCapture) {
          try {
            if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
              this.canvas.releasePointerCapture(e.pointerId);
            }
          } catch (err) {
            // Ignore pointer capture release issues.
          }
        }
        this.activePointerId = null;
      };
      if (this.touchGesture) {
        if (this.touchPointers.size >= 2) {
          this.updateTouchGesture();
          return;
        }
        this.stopTouchGesture();
        if (this.touchPointers.size > 0) {
          clearActivePointer();
          return;
        }
      }
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      if (this.touchHoldPending) {
        this.clearTouchHold();
        clearActivePointer();
        this.updateCursor();
        this.draw();
        return;
      }
      if (this.isLightDrag) {
        this.isLightDrag = false;
        this.updateCursor();
      }
      if (this.isPenDragging) {
        const wasCloseDrag = this.isPenCloseDragging;
        this.isPenDragging = false;
        this.isPenCloseDragging = false;
        this.penDragAnchor = null;
        this.penDragStart = null;
        if (wasCloseDrag) {
          this.commitPenPath();
          clearActivePointer();
          return;
        }
      }
      if (this.penAnchorDrag) {
        const drag = this.penAnchorDrag;
        this.penAnchorDrag = null;
        if (drag.moved && this.onDirectEditCommit) this.onDirectEditCommit();
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.algoDraft) {
        this.commitAlgoDraft();
        clearActivePointer();
        return;
      }
      if (this.shapeDraft) {
        this.commitShapeDraft();
        clearActivePointer();
        return;
      }
      if (this.shapeCornerDrag) {
        this.endShapeCornerDrag();
        clearActivePointer();
        return;
      }
      if (this.directDrag) {
        this.endDirectDrag();
        clearActivePointer();
        return;
      }
      if (this.isScissor) {
        const start = this.scissorStart;
        const end = this.scissorEnd;
        if (start && end && this.onScissor) {
          if (this.scissorMode === 'rect') {
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const w = Math.abs(end.x - start.x);
            const h = Math.abs(end.y - start.y);
            this.onScissor({ mode: 'rect', rect: { x, y, w, h }, start, end });
          } else if (this.scissorMode === 'circle') {
            const r = Math.hypot(end.x - start.x, end.y - start.y);
            this.onScissor({ mode: 'circle', circle: { x: start.x, y: start.y, r }, start, end });
          } else {
            this.onScissor({ mode: 'line', line: { a: start, b: end }, start, end });
          }
        }
        this.isScissor = false;
        this.scissorStart = null;
        this.scissorEnd = null;
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.isLassoSelecting) {
        if (this.lassoPath && this.lassoPath.length > 2) {
          this._applyDirectLasso(this.lassoPath);
        }
        this.isLassoSelecting = false;
        this.lassoPath = null;
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.modifierDrag) {
        this.modifierDrag = null;
        this.hideDragTooltip();
        this.updateCursor();
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.isLayerDrag) {
        const selectedLayers = this.getSelectedLayers();
        if (selectedLayers.length && this.tempTransform) {
          if (this.onCommitTransform) this.onCommitTransform();
          if (this.dragMode === 'move') {
            const snapDx = this.snapAllowed && this.snap ? this.snap.dx || 0 : 0;
            const snapDy = this.snapAllowed && this.snap ? this.snap.dy || 0 : 0;
            const committedDx = this.tempTransform.dx + snapDx;
            const committedDy = this.tempTransform.dy + snapDy;
            const moveTemp = { dx: committedDx, dy: committedDy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
            selectedLayers.forEach((layer) => {
              if (layer.isGroup) return;
              layer.params.posX += committedDx;
              layer.params.posY += committedDy;
              this.transformLayerFillsByTemp(layer, moveTemp);
              this.engine.generate(layer.id);
            });
          } else if (this.dragMode === 'resize' && selectedLayers.length) {
            let scaleX = this.tempTransform.scaleX;
            let scaleY = this.tempTransform.scaleY;
            if (selectedLayers.length === 1 && this.snapAllowed && this.snap) {
              if (this.snap.scaleX) scaleX *= this.snap.scaleX;
              if (this.snap.scaleY) scaleY *= this.snap.scaleY;
            }
            const prof = this.engine.currentProfile;
            selectedLayers.forEach((activeLayer) => {
              if (activeLayer.isGroup) return;
              const originLocal = activeLayer.origin || { x: prof.width / 2, y: prof.height / 2 };
              const baseOrigin = {
                x: originLocal.x + (activeLayer.params.posX ?? 0),
                y: originLocal.y + (activeLayer.params.posY ?? 0),
              };
              const resizeOrigin = this.tempTransform.origin || baseOrigin;
              activeLayer.params.scaleX *= scaleX;
              activeLayer.params.scaleY *= scaleY;
              activeLayer.params.posX =
                (baseOrigin.x - resizeOrigin.x) * scaleX + resizeOrigin.x - originLocal.x;
              activeLayer.params.posY =
                (baseOrigin.y - resizeOrigin.y) * scaleY + resizeOrigin.y - originLocal.y;
              this.transformLayerFillsByTemp(activeLayer, { dx: 0, dy: 0, scaleX, scaleY, origin: resizeOrigin });
              this.engine.generate(activeLayer.id);
            });
          } else if (this.dragMode === 'rotate') {
            const delta = this.tempTransform.rotation ?? 0;
            const origin = this.rotateOrigin || (this.startBounds ? this.startBounds.origin : null);
            selectedLayers.forEach((layer) => {
              if (layer.isGroup) return;
              const baseOrigin = {
                x: (layer.origin?.x ?? 0) + (layer.params.posX ?? 0),
                y: (layer.origin?.y ?? 0) + (layer.params.posY ?? 0),
              };
              if (origin) {
                const rot = (delta * Math.PI) / 180;
                const cosR = Math.cos(rot);
                const sinR = Math.sin(rot);
                const dx = baseOrigin.x - origin.x;
                const dy = baseOrigin.y - origin.y;
                const rx = dx * cosR - dy * sinR;
                const ry = dx * sinR + dy * cosR;
                layer.params.posX = origin.x + rx - (layer.origin?.x ?? 0);
                layer.params.posY = origin.y + ry - (layer.origin?.y ?? 0);
              }
              layer.params.rotation = (layer.params.rotation ?? 0) + delta;
              if (origin) {
                this.transformLayerFillsByTemp(layer, { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin, rotation: delta });
              }
              this.engine.generate(layer.id);
            });
          }
          const primary = this.getSelectedLayer();
          const effectivePrimary = (primary?.isGroup)
            ? selectedLayers.find((l) => !l.isGroup) || primary
            : primary;
          if (effectivePrimary) this.updateTransformInputs(effectivePrimary);
        }
        if (!this.tempTransform && this._pendingSingleSelect) {
          const pending = this._pendingSingleSelect;
          // Illustrator semantics: when multi-selected and the user clicks
          // (without modifiers) on a layer that's already in the selection,
          // promote it to the Key Object instead of collapsing the selection.
          // Click again on the same key → unset; click on a different selected
          // layer → re-promote.
          if (this.selectedLayerIds.size > 1 && this.selectedLayerIds.has(pending.id)) {
            if (this.keyObjectId === pending.id) {
              this.clearKeyObject();
            } else {
              this.setKeyObject(pending.id);
            }
          } else {
            this.selectLayer(pending);
          }
        }
        this.clearMaskPreview();
        this.mirrorDragState = null;
        this.tempTransform = null;
        this.rotateOrigin = null;
        this.snap = null;
      }
      this._pendingSingleSelect = null;
      this.isPan = false;
      this.isLayerDrag = false;
      this._detachShiftDragListener();
      this.lastDragWorld = null;
      this.dragMode = null;
      this.activeHandle = null;
      this.hideDragTooltip();
      this.updateCursor();
      this.guides = null;
      if (this.isDirectMarquee) {
        const rect = this.directMarqueeRect;
        if (rect && (rect.w > 2 / this.scale || rect.h > 2 / this.scale)) {
          this._applyDirectMarquee(rect);
        }
        this.isDirectMarquee = false;
        this.directMarqueeStart = null;
        this.directMarqueeRect = null;
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.isSelecting) {
        const rect = this.selectionRect;
        if (rect) {
          const selected = this.engine.layers.filter((layer) => this.layerIntersectsRect(layer, rect));
          if (selected.length) {
            this.setSelection(
              selected.map((layer) => layer.id),
              selected[selected.length - 1].id
            );
          }
        }
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionRect = null;
      }
      this.draw();
      clearActivePointer();
    }

    computeGuides(activeLayers, bounds) {
      const prof = this.engine.currentProfile;
      const guides = { center: [], size: [] };
      const centerX = prof.width / 2;
      const centerY = prof.height / 2;
      const tol = 2;

      if (Math.abs(bounds.center.x - centerX) <= tol) {
        guides.center.push({ x1: centerX, y1: 0, x2: centerX, y2: prof.height });
      }
      if (Math.abs(bounds.center.y - centerY) <= tol) {
        guides.center.push({ x1: 0, y1: centerY, x2: prof.width, y2: centerY });
      }

      const targetW = bounds.maxX - bounds.minX;
      const targetH = bounds.maxY - bounds.minY;
      let widthMatch = false;
      let heightMatch = false;
      const activeIds = new Set(activeLayers.map((layer) => layer.id));
      const ancestorIds = new Set(
        activeLayers.flatMap((l) => getMaskingAncestors(l, this.engine).map((a) => a.id))
      );
      this.engine.layers.forEach((layer) => {
        if (activeIds.has(layer.id) || !layer.visible) return;
        if (ancestorIds.has(layer.id)) return;
        const otherBounds = this.getLayerBounds(layer);
        if (!otherBounds) return;
        const w = otherBounds.maxX - otherBounds.minX;
        const h = otherBounds.maxY - otherBounds.minY;
        if (Math.abs(w - targetW) <= tol) widthMatch = true;
        if (Math.abs(h - targetH) <= tol) heightMatch = true;
      });

      if (widthMatch) {
        guides.size.push({ x1: bounds.corners.nw.x, y1: bounds.corners.nw.y, x2: bounds.corners.sw.x, y2: bounds.corners.sw.y });
        guides.size.push({ x1: bounds.corners.ne.x, y1: bounds.corners.ne.y, x2: bounds.corners.se.x, y2: bounds.corners.se.y });
      }
      if (heightMatch) {
        guides.size.push({ x1: bounds.corners.nw.x, y1: bounds.corners.nw.y, x2: bounds.corners.ne.x, y2: bounds.corners.ne.y });
        guides.size.push({ x1: bounds.corners.sw.x, y1: bounds.corners.sw.y, x2: bounds.corners.se.x, y2: bounds.corners.se.y });
      }

      return guides.center.length || guides.size.length ? guides : null;
    }

    computeSnap(activeLayers, bounds) {
      const prof = this.engine.currentProfile;
      const centerX = prof.width / 2;
      const centerY = prof.height / 2;
      const tol = 2;
      const snap = { dx: 0, dy: 0, scaleX: 0, scaleY: 0 };

      if (Math.abs(bounds.center.x - centerX) <= tol) {
        snap.dx = centerX - bounds.center.x;
      }
      if (Math.abs(bounds.center.y - centerY) <= tol) {
        snap.dy = centerY - bounds.center.y;
      }

      const targetW = bounds.maxX - bounds.minX;
      const targetH = bounds.maxY - bounds.minY;
      let bestWidth = null;
      let bestHeight = null;
      let bestWDiff = Infinity;
      let bestHDiff = Infinity;
      const activeIds = new Set(activeLayers.map((layer) => layer.id));
      this.engine.layers.forEach((layer) => {
        if (activeIds.has(layer.id) || !layer.visible) return;
        const otherBounds = this.getLayerBounds(layer);
        if (!otherBounds) return;
        const w = otherBounds.maxX - otherBounds.minX;
        const h = otherBounds.maxY - otherBounds.minY;
        const wDiff = Math.abs(w - targetW);
        const hDiff = Math.abs(h - targetH);
        if (wDiff <= tol && wDiff < bestWDiff) {
          bestWDiff = wDiff;
          bestWidth = w;
        }
        if (hDiff <= tol && hDiff < bestHDiff) {
          bestHDiff = hDiff;
          bestHeight = h;
        }
      });
      if (bestWidth && targetW > 0) snap.scaleX = bestWidth / targetW;
      if (bestHeight && targetH > 0) snap.scaleY = bestHeight / targetH;

      return snap;
    }

    drawGuides(guides) {
      if (!guides) return;
      this.ctx.save();
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      guides.center.forEach((line) => {
        this.ctx.beginPath();
        this.ctx.moveTo(line.x1, line.y1);
        this.ctx.lineTo(line.x2, line.y2);
        this.ctx.stroke();
      });
      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
      guides.size.forEach((line) => {
        this.ctx.beginPath();
        this.ctx.moveTo(line.x1, line.y1);
        this.ctx.lineTo(line.x2, line.y2);
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    tracePath(path, useCurves) {
      if (!path || path.length < 2) return;
      if (!useCurves || path.length < 3) {
        this.ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
        return;
      }
      const isClosed = window.Vectura?.OptimizationUtils?.isClosedPath?.(path);
      if (isClosed) {
        // Closed loop: anchor on each edge midpoint, vertex acts as control point.
        // Without this branch the wrap-around edge is rendered as a straight line.
        const n = path.length - 1;
        const m0x = (path[0].x + path[1].x) / 2;
        const m0y = (path[0].y + path[1].y) / 2;
        this.ctx.moveTo(m0x, m0y);
        for (let i = 1; i < n; i++) {
          const midX = (path[i].x + path[i + 1].x) / 2;
          const midY = (path[i].y + path[i + 1].y) / 2;
          this.ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY);
        }
        this.ctx.quadraticCurveTo(path[0].x, path[0].y, m0x, m0y);
        return;
      }
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length - 1; i++) {
        const midX = (path[i].x + path[i + 1].x) / 2;
        const midY = (path[i].y + path[i + 1].y) / 2;
        this.ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY);
      }
      const last = path[path.length - 1];
      this.ctx.lineTo(last.x, last.y);
    }

    traceCircle(meta) {
      if (!meta) return;
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const rx = meta.rx ?? meta.r;
      const ry = meta.ry ?? meta.r;
      const rotation = meta.rotation ?? 0;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
      if (rx <= 0 || ry <= 0) return;
      this.ctx.moveTo(cx + rx, cy);
      if (Math.abs(rx - ry) < 0.001) {
        this.ctx.arc(cx, cy, rx, 0, Math.PI * 2);
        return;
      }
      this.ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    }

    getSelectedLayer() {
      return this.engine.layers.find((l) => l.id === this.selectedLayerId) || null;
    }

    getSelectedLayers() {
      return this.engine.layers.filter((l) => this.selectedLayerIds.has(l.id));
    }

    getInteractionPaths(layer) {
      return this.engine.getRenderablePaths ? this.engine.getRenderablePaths(layer, { useOptimized: false }) : layer?.paths || [];
    }

    getActiveModifierLayer() {
      const layer = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
      return isModifierLayer(layer) ? layer : null;
    }

    getMirrorGuides(layer = null) {
      const modifierLayer = layer || this.getActiveModifierLayer();
      if (!modifierLayer || !isModifierLayer(modifierLayer)) return [];
      const modifier = modifierLayer.modifier || {};
      if (modifier.enabled === false) return [];
      const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
      const profileBounds = {
        width: bounds.width,
        height: bounds.height,
      };
      const guideBounds = SETTINGS.cropExports !== false
        ? {
            x: bounds.m || 0,
            y: bounds.m || 0,
            width: bounds.dW ?? bounds.width,
            height: bounds.dH ?? bounds.height,
          }
        : profileBounds;
      return (modifier.mirrors || []).map((mirror, index) => {
        const locked = Boolean(modifier.guidesLocked || mirror.locked);
        const visible = modifier.guidesVisible !== false && mirror.guideVisible !== false;

        if (mirror.type === 'radial') {
          const count = Math.max(2, Math.round(mirror.count ?? 6));
          const mode = mirror.mode ?? 'dihedral';
          const cx = (profileBounds.width ?? 0) / 2 + (mirror.centerX ?? 0);
          const cy = (profileBounds.height ?? 0) / 2 + (mirror.centerY ?? 0);
          const baseAngleRad = ((mirror.angle ?? 0) * Math.PI) / 180;
          const fullWedgeRad = (2 * Math.PI) / count;
          const halfWedgeRad = fullWedgeRad / 2;
          const guideR = Math.min(profileBounds.width, profileBounds.height ?? profileBounds.width) * 0.55;
          const wedgeCount = mode === 'dihedral' ? count * 2 : count;
          const divAngle = (2 * Math.PI) / wedgeCount;
          const wedgeLines = [];
          for (let k = 0; k < wedgeCount; k += 1) {
            const a = baseAngleRad + k * divAngle;
            wedgeLines.push({
              x1: cx, y1: cy,
              x2: cx + Math.cos(a) * guideR,
              y2: cy + Math.sin(a) * guideR,
            });
          }
          const srcEnd = mode === 'dihedral' ? baseAngleRad + halfWedgeRad : baseAngleRad + fullWedgeRad;
          return {
            guideType: 'radial',
            layer: modifierLayer, mirror, index, visible, locked,
            center: { x: cx, y: cy },
            wedgeLines,
            sourceWedge: { startAngle: baseAngleRad, endAngle: srcEnd, radius: guideR },
          };
        }

        if (mirror.type === 'wallpaper') {
          const WallpaperGroups = window.Vectura?.WallpaperGroups;
          const groupDef = WallpaperGroups?.GROUPS?.[mirror.group || 'p4m'];
          if (!groupDef) return null;
          const W = Math.max(1, mirror.tileWidth ?? 60);
          const H = Math.max(1, mirror.tileHeight ?? 60);
          const tileAngle = mirror.tileAngle ?? 90;
          const rotDeg = mirror.rotation ?? 0;
          const cx = (profileBounds.width ?? 0) / 2 + (mirror.centerX ?? 0);
          const cy = (profileBounds.height ?? 0) / 2 + (mirror.centerY ?? 0);
          const { latticeA, latticeB, fundamentalDomain } = groupDef.getOps(W, H, tileAngle, cx, cy, rotDeg);
          return {
            guideType: 'wallpaper',
            layer: modifierLayer, mirror, index, visible, locked,
            fundamentalDomain,
            latticeA,
            latticeB,
            origin: { x: cx, y: cy },
          };
        }

        if (mirror.type === 'arc') {
          const cx = (profileBounds.width ?? 0) / 2 + (mirror.centerX ?? 0);
          const cy = (profileBounds.height ?? 0) / 2 + (mirror.centerY ?? 0);
          const R = Math.max(1, mirror.radius ?? 80);
          const startDeg = mirror.arcStart ?? -180;
          const endDeg = mirror.arcEnd ?? 180;
          const startRad = (startDeg * Math.PI) / 180;
          const endRad = (endDeg * Math.PI) / 180;
          const midRad = (startRad + endRad) / 2;
          const replacedOutside = (mirror.replacedSide ?? 'outer') === 'outer';
          const flipSign = replacedOutside ? 1 : -1;
          const arrowOffset = ROTATE_ARROW_OFFSET / this.scale;
          const triangleLift = ROTATE_TRIANGLE_LIFT / this.scale;
          const triangleHalfWidth = ROTATE_TRIANGLE_HALF_WIDTH / this.scale;
          const triangleUnderlayHalfWidth = ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH / this.scale;
          const triangleTipLength = ROTATE_TRIANGLE_TIP_LENGTH / this.scale;
          const triangleUnderlayTipLength = ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH / this.scale;
          const nRad = { x: Math.cos(midRad), y: Math.sin(midRad) };
          const tRad = { x: -Math.sin(midRad), y: Math.cos(midRad) };
          const midArc = { x: cx + nRad.x * R, y: cy + nRad.y * R };
          const triBase = {
            x: midArc.x + nRad.x * (arrowOffset + triangleLift) * flipSign,
            y: midArc.y + nRad.y * (arrowOffset + triangleLift) * flipSign,
          };
          return {
            guideType: 'arc',
            layer: modifierLayer, mirror, index, visible, locked,
            center: { x: cx, y: cy },
            radius: R,
            arcStartRad: startRad,
            arcEndRad: endRad,
            radiusHandle: { x: cx + Math.cos(startRad) * R, y: cy + Math.sin(startRad) * R },
            flipTriangle: {
              tip: { x: midArc.x + nRad.x * flipSign * (arrowOffset + triangleLift + triangleTipLength), y: midArc.y + nRad.y * flipSign * (arrowOffset + triangleLift + triangleTipLength) },
              tipUnderlay: { x: midArc.x + nRad.x * flipSign * (arrowOffset + triangleLift + triangleUnderlayTipLength), y: midArc.y + nRad.y * flipSign * (arrowOffset + triangleLift + triangleUnderlayTipLength) },
              baseCenter: triBase,
              left: { x: triBase.x - tRad.x * triangleHalfWidth, y: triBase.y - tRad.y * triangleHalfWidth },
              right: { x: triBase.x + tRad.x * triangleHalfWidth, y: triBase.y + tRad.y * triangleHalfWidth },
              leftUnderlay: { x: triBase.x - tRad.x * triangleUnderlayHalfWidth, y: triBase.y - tRad.y * triangleUnderlayHalfWidth },
              rightUnderlay: { x: triBase.x + tRad.x * triangleUnderlayHalfWidth, y: triBase.y + tRad.y * triangleUnderlayHalfWidth },
            },
          };
        }

        const axis = getMirrorAxis(mirror, profileBounds);
        const segment = axis ? clipInfiniteAxisToBounds(axis, guideBounds) : null;
        if (!axis || !segment) return null;
        const [start, end] = segment;
        const tangent = axis.tangent;
        const normal = axis.normal;
        const arrowOffset = ROTATE_ARROW_OFFSET / this.scale;
        const triangleLift = ROTATE_TRIANGLE_LIFT / this.scale;
        const replacedSign = axis.replacedSign || 1;
        const mid = {
          x: (start.x + end.x) * 0.5,
          y: (start.y + end.y) * 0.5,
        };
        const triangleBaseCenter = {
          x: mid.x + normal.x * (arrowOffset + triangleLift) * replacedSign,
          y: mid.y + normal.y * (arrowOffset + triangleLift) * replacedSign,
        };
        const triangleHalfWidth = ROTATE_TRIANGLE_HALF_WIDTH / this.scale;
        const triangleUnderlayHalfWidth = ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH / this.scale;
        const triangleTipLength = ROTATE_TRIANGLE_TIP_LENGTH / this.scale;
        const triangleUnderlayTipLength = ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH / this.scale;
        return {
          guideType: 'line',
          layer: modifierLayer,
          mirror,
          index,
          axis,
          start,
          end,
          visible,
          locked,
          rotateRadius: 13.6 / this.scale,
          rotateStart: { x: start.x, y: start.y },
          rotateEnd: { x: end.x, y: end.y },
          flipTriangle: {
            tip: {
              x: mid.x + normal.x * replacedSign * (arrowOffset + triangleLift + triangleTipLength),
              y: mid.y + normal.y * replacedSign * (arrowOffset + triangleLift + triangleTipLength),
            },
            tipUnderlay: {
              x: mid.x + normal.x * replacedSign * (arrowOffset + triangleLift + triangleUnderlayTipLength),
              y: mid.y + normal.y * replacedSign * (arrowOffset + triangleLift + triangleUnderlayTipLength),
            },
            baseCenter: triangleBaseCenter,
            left: {
              x: triangleBaseCenter.x - tangent.x * triangleHalfWidth,
              y: triangleBaseCenter.y - tangent.y * triangleHalfWidth,
            },
            right: {
              x: triangleBaseCenter.x + tangent.x * triangleHalfWidth,
              y: triangleBaseCenter.y + tangent.y * triangleHalfWidth,
            },
            leftUnderlay: {
              x: triangleBaseCenter.x - tangent.x * triangleUnderlayHalfWidth,
              y: triangleBaseCenter.y - tangent.y * triangleUnderlayHalfWidth,
            },
            rightUnderlay: {
              x: triangleBaseCenter.x + tangent.x * triangleUnderlayHalfWidth,
              y: triangleBaseCenter.y + tangent.y * triangleUnderlayHalfWidth,
            },
          },
        };
      }).filter(Boolean);
    }

    hitModifierGuide(world) {
      const guides = this.getMirrorGuides().filter((guide) => guide.visible);
      if (!guides.length) return null;
      const lineTolSq = Math.pow(6 / this.scale, 2);
      const centerTolSq = Math.pow(8 / this.scale, 2);
      for (let i = guides.length - 1; i >= 0; i -= 1) {
        const guide = guides[i];
        if (guide.guideType === 'radial') {
          if (this.distanceToPointSq(world, guide.center) <= centerTolSq) return { guide, type: 'move' };
          continue;
        }
        if (guide.guideType === 'arc') {
          if (this.distanceToPointSq(world, guide.center) <= centerTolSq) return { guide, type: 'move' };
          const rHandleTolSq = Math.pow(7 / this.scale, 2);
          if (this.distanceToPointSq(world, guide.radiusHandle) <= rHandleTolSq) return { guide, type: 'resize' };
          const flipTri = guide.flipTriangle;
          if (this.pointInTriangle(world, flipTri.tip, flipTri.left, flipTri.right)
              || this.distanceToPointSq(world, flipTri.baseCenter) <= Math.pow(12 / this.scale, 2)) {
            return { guide, type: 'flip' };
          }
          continue;
        }
        if (guide.guideType === 'wallpaper') {
          if (this.distanceToPointSq(world, guide.origin) <= centerTolSq) return { guide, type: 'move' };
          const p10 = { x: guide.origin.x + guide.latticeA.x, y: guide.origin.y + guide.latticeA.y };
          if (this.distanceToPointSq(world, p10) <= centerTolSq) return { guide, type: 'latticeA' };
          const p01 = { x: guide.origin.x + guide.latticeB.x, y: guide.origin.y + guide.latticeB.y };
          if (this.distanceToPointSq(world, p01) <= centerTolSq) return { guide, type: 'latticeB' };
          continue;
        }
        // line guide
        const rotateTolSq = Math.pow(guide.rotateRadius + 5 / this.scale, 2);
        const onStartHandle = this.distanceToPointSq(world, guide.rotateStart) <= rotateTolSq;
        const onEndHandle = this.distanceToPointSq(world, guide.rotateEnd) <= rotateTolSq;
        if (onStartHandle || onEndHandle) return { guide, type: 'rotate' };
        const flipTri = guide.flipTriangle;
        if (this.pointInTriangle(world, flipTri.tip, flipTri.left, flipTri.right)
            || this.distanceToPointSq(world, flipTri.baseCenter) <= Math.pow(12 / this.scale, 2)) {
          return { guide, type: 'flip' };
        }
        if (this.distanceToSegmentSq(world, guide.start, guide.end) <= lineTolSq) return { guide, type: 'move' };
      }
      return null;
    }

    selectLayer(layer, options = {}) {
      if (!layer) return;
      const { additive = false, toggle = false } = options;
      if (!additive && !toggle) {
        this.selectedLayerIds.clear();
      }
      if (toggle) {
        if (this.selectedLayerIds.has(layer.id)) {
          this.selectedLayerIds.delete(layer.id);
        } else {
          this.selectedLayerIds.add(layer.id);
        }
      } else {
        this.selectedLayerIds.add(layer.id);
      }
      if (this.selectedLayerIds.size === 0) {
        this.selectedLayerId = null;
        if (this.onSelectLayer) this.onSelectLayer(null);
      } else {
        this.selectedLayerId = this.selectedLayerIds.has(layer.id)
          ? layer.id
          : this.selectedLayerIds.values().next().value;
        if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer());
      }
      if (this.keyObjectId && (!this.selectedLayerIds.has(this.keyObjectId) || this.selectedLayerIds.size < 2)) {
        this.keyObjectId = null;
      }
      if (this.directSelection && this.directSelection.layerId !== this.selectedLayerId) {
        this.directSelection = null;
        this.directDrag = null;
        this.directAuxSelections = [];
      }
      this.draw();
    }

    setSelection(ids, primaryId) {
      this.selectedLayerIds = new Set(ids || []);
      if (primaryId && this.selectedLayerIds.has(primaryId)) {
        this.selectedLayerId = primaryId;
      } else {
        this.selectedLayerId = this.selectedLayerIds.values().next().value || null;
      }
      if (this.keyObjectId && (!this.selectedLayerIds.has(this.keyObjectId) || this.selectedLayerIds.size < 2)) {
        this.keyObjectId = null;
      }
      if (this.directSelection && this.directSelection.layerId !== this.selectedLayerId) {
        this.directSelection = null;
        this.directDrag = null;
        this.directAuxSelections = [];
      }
      if (this.onSelectLayer) {
        const layer = this.getSelectedLayer();
        this.onSelectLayer(layer || null);
      }
      this.draw();
    }

    setKeyObject(id) {
      if (!id || !this.selectedLayerIds.has(id)) return;
      if (this.selectedLayerIds.size < 2) return;
      this.keyObjectId = id;
      this.selectedLayerId = id;
      if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer() || null);
      this.draw();
    }

    clearKeyObject() {
      if (!this.keyObjectId) return;
      this.keyObjectId = null;
      if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer() || null);
      this.draw();
    }

    clearSelection() {
      this.selectedLayerIds.clear();
      this.selectedLayerId = null;
      this.keyObjectId = null;
      this.directSelection = null;
      this.directDrag = null;
      this.directAuxSelections = [];
      this.clearMaskPreview();
      if (this.onSelectLayer) this.onSelectLayer(null);
      this.draw();
    }

    _computeFillPreviewPolygon(worldX, worldY) {
      const layer = this.engine?.getActiveLayer?.();
      if (!layer) return null;
      const AR = window.Vectura?.AlgorithmRegistry;
      if (!AR) return null;

      if (layer.type === 'pattern') {
        const patternId = layer.params?.patternId;
        if (!patternId) return null;
        const data = AR.patternGetGroups?.(patternId);
        if (!data) return null;
        const { vbW, vbH } = data;
        const scale = layer.params?.scale ?? 1;
        const originX = layer.params?.originX ?? 0;
        const originY = layer.params?.originY ?? 0;
        const tileSpacingX = layer.params?.tileSpacingX ?? 0;
        const tileSpacingY = layer.params?.tileSpacingY ?? 0;
        const scaledW = (vbW + tileSpacingX) * scale;
        const scaledH = (vbH + tileSpacingY) * scale;
        if (scaledW <= 0 || scaledH <= 0) return null;
        const tileX = (((worldX - originX) % scaledW) + scaledW) % scaledW / scale;
        const tileY = (((worldY - originY) % scaledH) + scaledH) % scaledH / scale;
        const hit = AR.patternGetFillTargetsAtPoint?.(patternId, tileX, tileY, { cache: true });
        const target = hit?.smallest;
        if (!target) return null;
        const tilePoly = target.outer;
        if (!Array.isArray(tilePoly) || !tilePoly.length) return null;
        const tileCol = Math.floor((worldX - originX) / scaledW);
        const tileRow = Math.floor((worldY - originY) / scaledH);
        const tileOriginX = originX + tileCol * scaledW;
        const tileOriginY = originY + tileRow * scaledH;
        return tilePoly.map((pt) => ({ x: tileOriginX + pt.x * scale, y: tileOriginY + pt.y * scale }));
      }

      const paths = this.engine.getDisplayPaths?.(layer) || layer.paths || [];
      let best = null;
      let bestArea = Infinity;
      for (const path of paths) {
        if (!Array.isArray(path) || path.length < 3) continue;
        const first = path[0]; const last = path[path.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) > 0.5) continue;
        if (!AR._polyContainsPoint?.(path, worldX, worldY)) continue;
        let area = 0;
        for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
          area += (path[j].x + path[i].x) * (path[j].y - path[i].y);
        }
        area = Math.abs(area) / 2;
        if (area < bestArea) { bestArea = area; best = path; }
      }
      return best;
    }

    _isWorldInsidePaper(world) {
      const prof = this.engine?.currentProfile;
      if (!prof || !world) return false;
      const m = Math.max(0, SETTINGS.margin || 0);
      return world.x >= m && world.x <= prof.width - m && world.y >= m && world.y <= prof.height - m;
    }

    _paintBucketHover(world) {
      const PBO = window.Vectura?.PaintBucketOps;
      if (!PBO) { this.paintBucketStack = null; this.patternFillPreviewPolygon = null; return; }
      const params = this.app?.paintBucketPanel?.getFillParams?.() || {};
      const scope = params.fillScope || 'all-objects';
      const sensitivity = params.fillSensitivity ?? 5;
      const { stack } = PBO.findFillTargetStack(this.engine, world.x, world.y, { scope, sensitivity });
      if (!Array.isArray(stack) || !stack.length) {
        this.paintBucketStack = null;
        this.paintBucketStackKey = null;
        this.paintBucketScopeIndex = 0;
        this.patternFillPreviewPolygon = null;
        this.patternFillPreviewInnerPolygon = null;
        return;
      }
      const stackKey = stack.map((e) => e.loopId).join('|');
      if (stackKey !== this.paintBucketStackKey) {
        this.paintBucketStackKey = stackKey;
        this.paintBucketScopeIndex = 0;
      }
      this.paintBucketStack = stack;
      this.paintBucketScopeIndex = Math.min(this.paintBucketScopeIndex, stack.length - 1);
      const entry = stack[this.paintBucketScopeIndex];
      this.patternFillPreviewPolygon = entry?.polygon || null;
      this.patternFillPreviewInnerPolygon = entry?.innerPolygon || null;
      if (entry && this.app?.ui?.setPaintBucketHint) {
        if (entry.isDocBounds) {
          this.app.ui.setPaintBucketHint('Scope: document bounds — click to fill background');
        } else if (stack.length > 1) {
          const label = scope === 'single-object' ? 'Path' : 'Scope';
          const scrollHint = scope === 'single-object' ? 'scroll to change path' : 'scroll to widen';
          this.app.ui.setPaintBucketHint(`${label} ${this.paintBucketScopeIndex + 1}/${stack.length - 1} · ${scrollHint}`);
        } else {
          this.app.ui.setPaintBucketHint('Click to fill · Alt-click to remove · Shift+drag to pour multiple');
        }
      }
    }

    clearPaintBucketHoverState() {
      this.paintBucketStack = null;
      this.paintBucketStackKey = null;
      this.paintBucketScopeIndex = 0;
      this.patternFillPreviewPolygon = null;
      this.patternFillPreviewInnerPolygon = null;
      this.draw();
    }

    _paintBucketPour(world, mode = 'pour', opts = {}) {
      const PBO = window.Vectura?.PaintBucketOps;
      if (!PBO) return null;
      const { startBatch = false } = opts;
      const params = this.app?.paintBucketPanel?.getFillParams?.() || {};
      const result = PBO.applyFillAtPoint(this.engine, this.app, world.x, world.y, {
        scopeIndex: this.paintBucketScopeIndex,
        mode,
        fillParams: params,
      });
      if (result) {
        this.lastPourLoopId = result.loopId;
        if (mode === 'pour' && result.fillId && result.layerId) {
          if (startBatch || !Array.isArray(this.lastPaintedFillRefs)) {
            this.lastPaintedFillRefs = [];
          }
          this.lastPaintedFillRefs.push({ layerId: result.layerId, fillId: result.fillId });
          this._notifyBatchState();
        } else if (mode === 'erase' && result.fillId) {
          // Fine-grained: only drop the erased fill from the batch. If the
          // batch becomes empty, that's an implicit commit.
          if (Array.isArray(this.lastPaintedFillRefs) && this.lastPaintedFillRefs.length) {
            const before = this.lastPaintedFillRefs.length;
            this.lastPaintedFillRefs = this.lastPaintedFillRefs.filter(
              (ref) => ref.fillId !== result.fillId
            );
            if (this.lastPaintedFillRefs.length !== before) this._notifyBatchState();
          }
        }
        this.draw();
        if (this.app?.ui?.renderLayers) this.app.ui.renderLayers();
      }
      return result;
    }

    // Commit the active batch: clear retarget refs and hide the panel chip
    // and canvas outline. Fill records themselves remain on the layer.
    commitActiveBatch() {
      if (!Array.isArray(this.lastPaintedFillRefs) || !this.lastPaintedFillRefs.length) {
        return false;
      }
      this.lastPaintedFillRefs = [];
      this._notifyBatchState();
      this.draw();
      return true;
    }

    // CMD+click adoption: find the smallest fill under the cursor, commit
    // any prior batch silently, and make this fill the new 1-element batch.
    // The panel mirror loads the fill's params (suppressed retarget).
    _paintBucketAdoptAtPoint(world) {
      const PBO = window.Vectura?.PaintBucketOps;
      const panel = this.app?.paintBucketPanel;
      if (!PBO?.findFillAtPoint) {
        panel?.setNoFillMode?.();
        return false;
      }
      const hit = PBO.findFillAtPoint(this.engine, world.x, world.y);
      if (!hit?.rec || !hit.layer?.id) {
        // Nothing to sample — switch the panel to "No Fill" mode.
        // If the user was hovering over a visible region (patternFillPreviewPolygon
        // is set), pour a fillType:'none' placeholder there so that region
        // becomes the active batch target. Picking a fill type will then
        // update that record rather than retargeting any prior fill.
        // Guard with patternFillPreviewPolygon: no hover region = no pour
        // (protects against accidental doc-bounds pours on empty canvas).
        panel?.setNoFillMode?.();
        if (this.patternFillPreviewPolygon) {
          this._paintBucketPour(world, 'pour', { startBatch: true });
        } else {
          this.draw();
        }
        return false;
      }
      panel?.setSampleEmptyMode?.(false);
      // Replace any active batch with the adopted fill. This is a silent
      // commit: there is no "unsaved" work because slider edits already
      // retarget live as they happen.
      this.lastPaintedFillRefs = [{ layerId: hit.layer.id, fillId: hit.rec.id }];
      panel?.loadParamsFromFill?.(hit.rec);
      this._notifyBatchState();
      this.draw();
      return true;
    }

    _notifyBatchState() {
      const count = Array.isArray(this.lastPaintedFillRefs)
        ? this.lastPaintedFillRefs.length
        : 0;
      this.app?.paintBucketPanel?.onBatchStateChange?.({ activeCount: count });
    }

    _paintBucketClearHover() {
      if (this.activeTool !== 'fill' && this.activeTool !== 'fill-erase') return;
      // Clear hover preview + stack so the highlighted region under the
      // cursor disappears once the mouse leaves the canvas. `lastPaintedFillRefs`
      // is kept so panel edits still retarget the most recent pour(s).
      this.paintBucketStack = null;
      this.paintBucketStackKey = null;
      this.paintBucketScopeIndex = 0;
      this.patternFillPreviewPolygon = null;
      this.patternFillPreviewInnerPolygon = null;
      this.lastPourLoopId = null;
      this.hideFillLoupe?.();
      if (this.app?.ui?.setPaintBucketHint) {
        this.app.ui.setPaintBucketHint('Click to fill · Alt-click to remove · Shift+drag to pour multiple');
      }
      this.draw();
    }

    updateLastPaintedFills(fillParams) {
      if (!Array.isArray(this.lastPaintedFillRefs) || !this.lastPaintedFillRefs.length) return false;
      const engine = this.engine;
      if (!engine?.layers) return false;
      const FIELD_MAP = [
        ['fillType',       'fillMode'],
        ['density',        'fillDensity'],
        ['angle',          'fillAngle'],
        ['amplitude',      'fillAmplitude'],
        ['dotLength',      'fillDotLength'],
        ['dotRotation',    'fillDotRotation'],
        ['padding',        'fillPadding'],
        ['shiftX',         'fillShiftX'],
        ['shiftY',         'fillShiftY'],
        ['dotPattern',     'fillDotPattern'],
        ['axes',           'fillAxes'],
        ['polyTile',       'fillPolyTile'],
        ['centralDensity', 'fillRadialCentralDensity'],
        ['outerDiameter',  'fillRadialOuterDiameter'],
        ['sensitivity',    'fillSensitivity'],
        ['penId',          'penId'],
      ];
      let changed = false;
      const surviving = [];
      for (const ref of this.lastPaintedFillRefs) {
        const layer = engine.layers.find((l) => l && l.id === ref.layerId);
        if (!layer || !Array.isArray(layer.fills)) continue;
        const rec = layer.fills.find((f) => f && f.id === ref.fillId);
        if (!rec) continue;
        surviving.push(ref);
        for (const [recKey, paramKey] of FIELD_MAP) {
          const v = fillParams[paramKey];
          if (v !== undefined && rec[recKey] !== v) {
            rec[recKey] = v;
            changed = true;
          }
        }
      }
      const prevLen = this.lastPaintedFillRefs.length;
      this.lastPaintedFillRefs = surviving;
      if (changed) engine.computeAllDisplayGeometry?.();
      if (surviving.length !== prevLen) this._notifyBatchState();
      return changed;
    }

    // Stroke the region polygon of each fill in the active batch so the user
    // sees exactly which fills will be rewritten by the next panel change.
    // Drawn only while the fill tool is active and the batch is non-empty.
    drawActiveBatchOutline() {
      if (this.activeTool !== 'fill' && this.activeTool !== 'fill-erase') return;
      const refs = this.lastPaintedFillRefs;
      if (!Array.isArray(refs) || !refs.length) return;
      const layers = this.engine?.layers;
      if (!Array.isArray(layers) || !layers.length) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.lineWidth = 1.4 / this.scale;
      ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      ctx.strokeStyle = 'rgba(34,197,94,0.85)';
      for (const ref of refs) {
        const layer = layers.find((l) => l && l.id === ref.layerId);
        if (!layer || !Array.isArray(layer.fills)) continue;
        const rec = layer.fills.find((f) => f && f.id === ref.fillId);
        if (!rec?.region || rec.region.length < 3) continue;
        ctx.beginPath();
        this.tracePolygonPath(rec.region);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawPatternFillPreview() {
      const poly = this.patternFillPreviewPolygon;
      if (!Array.isArray(poly) || poly.length < 3) return;
      const innerPoly = this.patternFillPreviewInnerPolygon;
      const hasHole = Array.isArray(innerPoly) && innerPoly.length >= 3;
      const isErase = this.activeTool === 'fill-pattern-erase' || this.activeTool === 'fill-erase';
      this.ctx.save();
      this.ctx.beginPath();
      this.tracePolygonPath(poly);
      if (hasHole) this.tracePolygonPath(innerPoly);
      this.ctx.fillStyle = isErase ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)';
      // Even-odd rule makes the inner polygon a transparent hole in the fill.
      this.ctx.fill(hasHole ? 'evenodd' : 'nonzero');
      this.ctx.strokeStyle = isErase ? 'rgba(239,68,68,0.65)' : 'rgba(59,130,246,0.65)';
      this.ctx.lineWidth = 1.5 / this.scale;
      this.ctx.setLineDash([3 / this.scale, 2 / this.scale]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    }

    findLayerAtPoint(world, includeLocked = false) {
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDist = Infinity;
      layers.forEach((layer) => {
        if (!layer.visible) return;
        // Compound (Pathfinder) groups expose baked geometry — let them be hit
        // even though `isGroup` is true; other groups stay non-selectable.
        const isCompound = layer.containerRole === 'compound';
        if (!isCompound && layer.isGroup) return;
        if (layer.mask?.enabled && layer.mask?.hideLayer) return;
        // Children inside a compound are consumed by their parent; clicks on
        // the unified silhouette should select the compound, not a child.
        if (this.engine.hasCompoundAncestor?.(layer)) return;
        if (!includeLocked && this.isLayerLocked?.(layer.id)) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(5 / (this.scale || 1), stroke * 2);
        const tolSq = tol * tol;
        this.getInteractionPaths(layer).forEach((path) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? path.meta.rx ?? 0;
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            if (dist * dist <= tolSq && dist < bestDist) {
              bestDist = dist;
              best = layer;
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
            if (d <= tolSq && d < bestDist) {
              bestDist = d;
              best = layer;
              break;
            }
          }
        });
      });
      return best;
    }

    enterGroupEditMode(layer) {
      this.groupEditMode = { groupId: layer.parentId, activeLayerId: layer.id };
      this.setSelection([layer.id], layer.id);
      this.draw();
    }

    exitGroupEditMode() {
      if (!this.groupEditMode) return;
      const groupId = this.groupEditMode.groupId;
      this.groupEditMode = null;
      const siblings = this.engine.getLayerChildren(groupId) || [];
      const selectable = siblings.filter(l => l.visible && !this.isLayerLocked?.(l.id));
      if (selectable.length > 0) {
        this.setSelection(selectable.map(l => l.id), selectable[0].id);
      }
      this.draw();
    }

    _getMaskGroupLayers(layer) {
      if (!this.engine) return null;
      let maskRoot = null;
      const ancestorMasks = this.engine.getAncestorMaskLayers?.(layer);
      if (ancestorMasks && ancestorMasks.length > 0) {
        maskRoot = ancestorMasks[0];
      } else if (layer.mask?.enabled && layer.maskCapabilities?.canSource) {
        maskRoot = layer;
      }
      if (!maskRoot) return null;
      const descendants = this.engine.getLayerDescendants(maskRoot.id);
      if (!descendants || descendants.length === 0) return null;
      return [maskRoot, ...descendants].filter(l => !this.isLayerLocked?.(l.id));
    }

    distanceToSegmentSq(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) {
        const px = p.x - a.x;
        const py = p.y - a.y;
        return px * px + py * py;
      }
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      const clamped = Math.max(0, Math.min(1, t));
      const cx = a.x + clamped * dx;
      const cy = a.y + clamped * dy;
      const ox = p.x - cx;
      const oy = p.y - cy;
      return ox * ox + oy * oy;
    }

    distanceToPointSq(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    }

    pointInTriangle(p, a, b, c) {
      const area = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
      const d1 = area(p, a, b);
      const d2 = area(p, b, c);
      const d3 = area(p, c, a);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(hasNeg && hasPos);
    }

    findLayerAtPointPrecise(world) {
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDist = Infinity;
      layers.forEach((layer) => {
        if (!layer.visible) return;
        const isCompound = layer.containerRole === 'compound';
        if (!isCompound && layer.isGroup) return;
        if (layer.mask?.enabled && layer.mask?.hideLayer) return;
        if (this.engine.hasCompoundAncestor?.(layer)) return;
        if (this.isLayerLocked?.(layer.id)) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(1.5, stroke * 2);
        const tolSq = tol * tol;
        this.getInteractionPaths(layer).forEach((path) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? path.meta.rx ?? 0;
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            if (dist * dist <= tolSq && dist < bestDist) {
              bestDist = dist;
              best = layer;
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
            if (d <= tolSq && d < bestDist) {
              bestDist = d;
              best = layer;
              break;
            }
          }
        });
      });
      return best;
    }

    getSelectionBounds(layers, temp) {
      if (!layers || layers.length === 0) return null;
      if (layers.length === 1) {
        return this.getLayerBounds(layers[0], temp);
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      layers.forEach((layer) => {
        const primBounds = this.getPrimitiveShapeBounds(layer, temp);
        if (primBounds) {
          Object.values(primBounds.corners).forEach((pt) => {
            minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
          });
          return;
        }
        const basePaths = this.getInteractionPaths(layer);
        if (!Array.isArray(basePaths)) return;
        basePaths.forEach((path) => {
          if (path?.meta?.kind === 'circle') {
            const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
            const cx = meta.cx ?? meta.x;
            const cy = meta.cy ?? meta.y;
            const rx = meta.rx ?? meta.r;
            const ry = meta.ry ?? meta.r;
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
            minX = Math.min(minX, cx - rx); maxX = Math.max(maxX, cx + rx);
            minY = Math.min(minY, cy - ry); maxY = Math.max(maxY, cy + ry);
            return;
          }
          if (!Array.isArray(path)) return;
          path.forEach((pt) => {
            const next = temp ? this.transformPoint(pt, temp) : pt;
            minX = Math.min(minX, next.x); minY = Math.min(minY, next.y);
            maxX = Math.max(maxX, next.x); maxY = Math.max(maxY, next.y);
          });
        });
      });
      if (!Number.isFinite(minX)) return null;
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const localMinX = minX - center.x;
      const localMinY = minY - center.y;
      const localMaxX = maxX - center.x;
      const localMaxY = maxY - center.y;
      const toWorld = (local) => ({ x: center.x + local.x, y: center.y + local.y });
      return {
        minX: localMinX,
        minY: localMinY,
        maxX: localMaxX,
        maxY: localMaxY,
        rotation: 0,
        origin: center,
        center,
        corners: {
          nw: toWorld({ x: localMinX, y: localMinY }),
          ne: toWorld({ x: localMaxX, y: localMinY }),
          se: toWorld({ x: localMaxX, y: localMaxY }),
          sw: toWorld({ x: localMinX, y: localMaxY }),
        },
      };
    }

    applyRotationToBounds(bounds, deltaAngleDeg) {
      const deltaRad = (deltaAngleDeg * Math.PI) / 180;
      const cosD = Math.cos(deltaRad);
      const sinD = Math.sin(deltaRad);
      const ox = bounds.origin.x;
      const oy = bounds.origin.y;
      const rotPt = (pt) => {
        const dx = pt.x - ox;
        const dy = pt.y - oy;
        return { x: ox + dx * cosD - dy * sinD, y: oy + dx * sinD + dy * cosD };
      };
      const nw = rotPt(bounds.corners.nw);
      const ne = rotPt(bounds.corners.ne);
      const se = rotPt(bounds.corners.se);
      const sw = rotPt(bounds.corners.sw);
      const cx = (nw.x + ne.x + se.x + sw.x) / 4;
      const cy = (nw.y + ne.y + se.y + sw.y) / 4;
      const newRot = (bounds.rotation || 0) + deltaRad;
      const hw = Math.hypot(ne.x - nw.x, ne.y - nw.y) / 2;
      const hh = Math.hypot(sw.x - nw.x, sw.y - nw.y) / 2;
      return {
        minX: -hw, minY: -hh, maxX: hw, maxY: hh,
        rotation: newRot,
        origin: bounds.origin,
        center: { x: cx, y: cy },
        corners: { nw, ne, se, sw },
      };
    }

    screenToWorld(x, y) {
      return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
    }

    worldToScreen(x, y) {
      return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
    }

    transformPoint(pt, temp) {
      if (!temp) return pt;
      const origin = temp.origin || { x: 0, y: 0 };
      let x = (pt.x - origin.x) * temp.scaleX;
      let y = (pt.y - origin.y) * temp.scaleY;
      if (temp.rotation) {
        const rot = (temp.rotation * Math.PI) / 180;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const rx = x * cosR - y * sinR;
        const ry = x * sinR + y * cosR;
        x = rx;
        y = ry;
      }
      return { x: x + origin.x + temp.dx, y: y + origin.y + temp.dy };
    }

    transformPath(path, temp) {
      if (!path) return path;
      return path.map((pt) => this.transformPoint(pt, temp));
    }

    // Delegate to PaintBucketOps so all callers (canvas drag, arrow keys,
    // align/distribute, numeric inputs) share one transformation path.
    transformLayerFillsByTemp(layer, temp) {
      window.Vectura?.PaintBucketOps?.transformLayerFills?.(layer, temp);
    }

    transformCircleMeta(meta, temp) {
      if (!temp || !meta) return meta;
      const center = this.transformPoint({ x: meta.cx ?? meta.x, y: meta.cy ?? meta.y }, temp);
      // Prefer rx/ry (already reflect the layer's committed scale) over r (raw, unscaled)
      // so that previewing tempTransform multiplies the *current displayed* radius.
      const baseRx = Number.isFinite(meta.rx) ? meta.rx : (Number.isFinite(meta.r) ? meta.r : 0);
      const baseRy = Number.isFinite(meta.ry) ? meta.ry : (Number.isFinite(meta.r) ? meta.r : 0);
      const rx = Math.abs(baseRx * temp.scaleX);
      const ry = Math.abs(baseRy * temp.scaleY);
      const rot = ((temp.rotation ?? 0) * Math.PI) / 180;
      return { ...meta, cx: center.x, cy: center.y, rx, ry, rotation: (meta.rotation ?? 0) + rot };
    }

    getLayerBaseOrigin(layer) {
      const prof = this.engine.currentProfile;
      return {
        x: layer.origin?.x ?? prof.width / 2,
        y: layer.origin?.y ?? prof.height / 2,
      };
    }

    getLayerTransformedOrigin(layer, temp = null) {
      const baseOrigin = this.getLayerBaseOrigin(layer);
      const translated = {
        x: baseOrigin.x + (layer?.params?.posX ?? 0),
        y: baseOrigin.y + (layer?.params?.posY ?? 0),
      };
      return temp ? this.transformPoint(translated, temp) : translated;
    }

    transformShapeSourcePoint(pt, layer, temp = null) {
      if (!pt || !layer) return pt;
      const origin = this.getLayerBaseOrigin(layer);
      const scaleX = layer?.params?.scaleX ?? 1;
      const scaleY = layer?.params?.scaleY ?? 1;
      const rotation = ((layer?.params?.rotation ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      const dx = (pt.x - origin.x) * scaleX;
      const dy = (pt.y - origin.y) * scaleY;
      const world = {
        x: dx * cosR - dy * sinR + origin.x + (layer?.params?.posX ?? 0),
        y: dx * sinR + dy * cosR + origin.y + (layer?.params?.posY ?? 0),
      };
      return temp ? this.transformPoint(world, temp) : world;
    }

    inverseTransformPoint(pt, temp = null) {
      if (!temp) return pt;
      const origin = temp.origin || { x: 0, y: 0 };
      const dx = pt.x - origin.x - (temp.dx ?? 0);
      const dy = pt.y - origin.y - (temp.dy ?? 0);
      const rot = (((temp.rotation ?? 0) * Math.PI) / 180) * -1;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const rx = dx * cosR - dy * sinR;
      const ry = dx * sinR + dy * cosR;
      return {
        x: origin.x + rx / (temp.scaleX || 1),
        y: origin.y + ry / (temp.scaleY || 1),
      };
    }

    inverseShapeSourcePoint(pt, layer, temp = null) {
      if (!pt || !layer) return pt;
      const world = temp ? this.inverseTransformPoint(pt, temp) : pt;
      const origin = this.getLayerBaseOrigin(layer);
      const translated = {
        x: world.x - (layer?.params?.posX ?? 0),
        y: world.y - (layer?.params?.posY ?? 0),
      };
      const rot = (((layer?.params?.rotation ?? 0) * Math.PI) / 180) * -1;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const dx = translated.x - origin.x;
      const dy = translated.y - origin.y;
      return {
        x: origin.x + (dx * cosR - dy * sinR) / (layer?.params?.scaleX || 1),
        y: origin.y + (dx * sinR + dy * cosR) / (layer?.params?.scaleY || 1),
      };
    }

    transformShapeDirection(descriptor, layer, temp = null) {
      if (!descriptor) return { x: 0, y: 0 };
      const handlePoint = getShapeCornerHandlePosition(descriptor, this.scale);
      const vertex = this.transformShapeSourcePoint(descriptor.vertex, layer, temp);
      const point = this.transformShapeSourcePoint(handlePoint, layer, temp);
      const dx = point.x - vertex.x;
      const dy = point.y - vertex.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    }

    getTransformedShapeVertices(layer, pathIndex = 0, temp = null) {
      const meta = this.getShapeMetaForLayer(layer, pathIndex);
      if (!meta?.shape) return [];
      return getShapeVertices(meta.shape).map((vertex) => this.transformShapeSourcePoint(vertex, layer, temp));
    }

    getPrimitiveShapeBounds(layer, temp = null) {
      const meta = this.getShapeMetaForLayer(layer, 0);
      if (!meta?.shape || (meta.shape.type !== 'rect' && meta.shape.type !== 'polygon')) return null;
      const vertices = this.getTransformedShapeVertices(layer, 0, temp);
      if (!vertices.length) return null;
      const baseRotation = ((layer?.params?.rotation ?? 0) * Math.PI) / 180;
      const tempRotation = (((temp?.rotation ?? 0) * Math.PI) / 180);
      const rotation = baseRotation + tempRotation;
      const origin = this.getLayerTransformedOrigin(layer, temp);
      return buildBoundsFromVertices(vertices, origin, rotation);
    }

    traceLayerPath(path, layer, temp = null, useCurves = Boolean(layer?.params?.curves)) {
      if (path && path.meta && path.meta.kind === 'circle') {
        const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
        this.traceCircle(meta);
        return;
      }
      const next = temp ? this.transformPath(path, temp) : path;
      this.tracePath(next, useCurves);
    }

    tracePolygonPath(path, temp = null) {
      if (!Array.isArray(path) || path.length < 2) return;
      const next = temp ? this.transformPath(path, temp) : path;
      this.ctx.moveTo(next[0].x, next[0].y);
      for (let i = 1; i < next.length; i++) this.ctx.lineTo(next[i].x, next[i].y);
      this.ctx.closePath();
    }

    getMaskPreviewClipPolygons(layer = this.getMaskPreviewLayer(), temp = this.tempTransform) {
      if (!layer) return [];
      const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
      const polygons = getLayerSilhouette(layer, this.engine, bounds);
      return (polygons || [])
        .filter((polygon) => Array.isArray(polygon) && polygon.length >= 3)
        .map((polygon) => (temp ? this.transformPath(polygon, temp) : polygon));
    }

    drawMaskPreviewOverlay() {
      if (!this.maskPreview?.entries?.length || !this.tempTransform) return;
      const maskLayer = this.getMaskPreviewLayer();
      if (!maskLayer) return;
      const isChildDrag = Boolean(this.maskPreview.isChildDrag);
      // For child drag the mask is locked/fixed, so clip polygons don't move with tempTransform.
      // For the normal case the mask itself is dragging, so clip polygons transform with it.
      const clipPolygons = this.getMaskPreviewClipPolygons(maskLayer, isChildDrag ? null : this.tempTransform);
      if (!clipPolygons.length) return;

      this.maskPreview.entries.forEach((entry) => {
        const layer = this.engine.layers.find((candidate) => candidate.id === entry.layerId);
        if (!layer || !layer.visible) return;
        const pen = SETTINGS.pens?.find((candidate) => candidate.id === layer.penId) || null;
        const strokeWidth = pen?.width ?? layer.strokeWidth ?? SETTINGS.strokeWidth;
        const useCurves = Boolean(layer.params && layer.params.curves);
        const strokeStyle = pen?.color || layer.color;
        // For child drag the paths are source geometry; apply tempTransform when tracing so they
        // follow the cursor. For normal the paths are pre-computed at the destination position.
        const pathTemp = isChildDrag ? this.tempTransform : null;

        this.ctx.save();
        this.ctx.globalAlpha = MASK_PREVIEW_ALPHA;
        this.ctx.lineWidth = strokeWidth;
        this.ctx.lineCap = layer.lineCap || 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = strokeStyle;
        this.ctx.beginPath();
        (entry.paths || []).forEach((path) => this.traceLayerPath(path, layer, pathTemp, useCurves));
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.save();
        this.ctx.beginPath();
        clipPolygons.forEach((polygon) => this.tracePolygonPath(polygon));
        this.ctx.clip();
        this.ctx.globalAlpha = isChildDrag ? 0.5 : 1;
        this.ctx.lineWidth = strokeWidth;
        this.ctx.lineCap = layer.lineCap || 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = strokeStyle;
        this.ctx.beginPath();
        (entry.paths || []).forEach((path) => this.traceLayerPath(path, layer, pathTemp, useCurves));
        this.ctx.stroke();
        this.ctx.restore();
      });

      if (maskLayer.mask?.hideLayer) {
        this.ctx.save();
        this.ctx.lineWidth = 1 / this.scale;
        this.ctx.strokeStyle = getThemeToken('--render-guide-faint', 'rgba(248, 250, 252, 0.75)');
        this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
        this.ctx.beginPath();
        clipPolygons.forEach((polygon) => this.tracePolygonPath(polygon));
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }
    }

    getLayerBounds(layer, temp) {
      const primitiveBounds = this.getPrimitiveShapeBounds(layer, temp);
      if (primitiveBounds) return primitiveBounds;
      const basePaths = this.getInteractionPaths(layer);
      if (!layer || !Array.isArray(basePaths)) return null;
      const prof = this.engine.currentProfile;
      const baseOrigin = {
        x: (layer.origin?.x ?? prof.width / 2) + (layer.params.posX ?? 0),
        y: (layer.origin?.y ?? prof.height / 2) + (layer.params.posY ?? 0),
      };
      const origin = temp ? this.transformPoint(baseOrigin, temp) : baseOrigin;
      const baseRot = layer.params.rotation ?? 0;
      const tempRot = temp?.rotation ?? 0;
      const rot = ((baseRot + tempRot) * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const unrotate = (pt) => {
        const dx = pt.x - origin.x;
        const dy = pt.y - origin.y;
        return {
          x: dx * cosR + dy * sinR,
          y: -dx * sinR + dy * cosR,
        };
      };

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      const addPoint = (pt) => {
        const local = unrotate(pt);
        minX = Math.min(minX, local.x);
        minY = Math.min(minY, local.y);
        maxX = Math.max(maxX, local.x);
        maxY = Math.max(maxY, local.y);
      };

      basePaths.forEach((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
          const cx = meta.cx ?? meta.x;
          const cy = meta.cy ?? meta.y;
          const rx = meta.rx ?? meta.r;
          const ry = meta.ry ?? meta.r;
          if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
          addPoint({ x: cx - rx, y: cy });
          addPoint({ x: cx + rx, y: cy });
          addPoint({ x: cx, y: cy - ry });
          addPoint({ x: cx, y: cy + ry });
          return;
        }
        if (!Array.isArray(path)) return;
        path.forEach((pt) => {
          const next = temp ? this.transformPoint(pt, temp) : pt;
          addPoint(next);
        });
      });
      if (!Number.isFinite(minX)) return null;
      const toWorld = (local) => ({
        x: origin.x + local.x * cosR - local.y * sinR,
        y: origin.y + local.x * sinR + local.y * cosR,
      });
      const nw = toWorld({ x: minX, y: minY });
      const ne = toWorld({ x: maxX, y: minY });
      const se = toWorld({ x: maxX, y: maxY });
      const sw = toWorld({ x: minX, y: maxY });
      const centerLocal = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const center = toWorld(centerLocal);
      return {
        minX,
        minY,
        maxX,
        maxY,
        rotation: rot,
        origin,
        center,
        corners: { nw, ne, se, sw },
      };
    }

    drawKeyObjectOutline(bounds) {
      if (!bounds || !bounds.corners) return;
      const { nw, ne, se, sw } = bounds.corners;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      this.ctx.lineWidth = 2.25 / this.scale;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(nw.x, nw.y);
      this.ctx.lineTo(ne.x, ne.y);
      this.ctx.lineTo(se.x, se.y);
      this.ctx.lineTo(sw.x, sw.y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.restore();
    }

    drawSelection(bounds, options = {}) {
      const { showHandles = true } = options;
      const handleSize = 6 / this.scale;
      const { nw, ne, se, sw } = bounds.corners;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(nw.x, nw.y);
      this.ctx.lineTo(ne.x, ne.y);
      this.ctx.lineTo(se.x, se.y);
      this.ctx.lineTo(sw.x, sw.y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = getThemeToken('--render-selection-handle-fill', '#111827');
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      if (showHandles) {
        const handles = this.getHandlePoints(bounds);
        handles.forEach((pt) => {
          this.ctx.beginPath();
          this.ctx.rect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
          this.ctx.fill();
          this.ctx.stroke();
        });
      }
      this.ctx.restore();
    }

    drawSelectionRect(rect) {
      if (!rect) return;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-marquee-stroke', 'rgba(148, 163, 184, 0.7)');
      this.ctx.fillStyle = getThemeToken('--render-marquee-fill', 'rgba(148, 163, 184, 0.12)');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    drawAlgoDraftRect(draft) {
      if (!draft) return;
      const x = Math.min(draft.start.x, draft.end.x);
      const y = Math.min(draft.start.y, draft.end.y);
      const w = Math.abs(draft.end.x - draft.start.x);
      const h = Math.abs(draft.end.y - draft.start.y);
      this.ctx.save();
      const accentColor = getThemeToken('--color-accent', '#63b3ed');
      this.ctx.strokeStyle = accentColor;
      this.ctx.globalAlpha = 0.85;
      this.ctx.lineWidth = 1.5 / this.scale;
      this.ctx.setLineDash([5 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.rect(x, y, w, h);
      this.ctx.stroke();
      this.ctx.globalAlpha = 0.08;
      this.ctx.fillStyle = accentColor;
      this.ctx.fill();
      this.ctx.restore();
    }

    drawSelectionPath(path) {
      if (!Array.isArray(path) || path.length < 2) return;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-marquee-stroke', 'rgba(148, 163, 184, 0.7)');
      this.ctx.fillStyle = getThemeToken('--render-marquee-fill', 'rgba(148, 163, 184, 0.12)');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.fill();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    }

    _drawSelectionGeometry(sel, worldAnchors) {
      if (!worldAnchors || !worldAnchors.length) return;
      const path = this.buildPenPathFromAnchors(worldAnchors, Boolean(sel.closed));
      this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
      this.ctx.lineWidth = 1.1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      this.ctx.beginPath();
      if (path.length) {
        this.ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
        if (sel.closed) this.ctx.closePath();
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      const anchorR = 3.2 / this.scale;
      const handleR = 2.2 / this.scale;
      const selectedSet = sel.selectedIndices || new Set();
      worldAnchors.forEach((anchor, i) => {
        const isSelected = selectedSet.has(i);
        if (anchor.in) {
          this.ctx.strokeStyle = getThemeToken('--render-direct-handle-line', 'rgba(34, 211, 238, 0.65)');
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.in.x, anchor.in.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.fillStyle = getThemeToken('--render-direct-handle-fill', '#0f172a');
          this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
          this.ctx.arc(anchor.in.x, anchor.in.y, handleR, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
        if (anchor.out) {
          this.ctx.strokeStyle = getThemeToken('--render-direct-handle-line', 'rgba(34, 211, 238, 0.65)');
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.out.x, anchor.out.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.fillStyle = getThemeToken('--render-direct-handle-fill', '#0f172a');
          this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
          this.ctx.arc(anchor.out.x, anchor.out.y, handleR, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
        this.ctx.beginPath();
        this.ctx.fillStyle = isSelected
          ? getThemeToken('--render-direct-stroke', '#22d3ee')
          : getThemeToken('--render-direct-handle-fill', '#0f172a');
        this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
        this.ctx.arc(anchor.x, anchor.y, anchorR, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      });
    }

    drawDirectSelection() {
      this.ctx.save();
      if (this.directSelection) {
        const data = this.getDirectSelectionWorldAnchors();
        if (data) this._drawSelectionGeometry(this.directSelection, data.anchors);
      }
      for (const auxSel of this.directAuxSelections || []) {
        const data = this._selectionWorldAnchors(auxSel);
        if (data) this._drawSelectionGeometry(auxSel, data.anchors);
      }
      const layer = this.getDirectSelectionLayer();
      if (layer && this.directSelection?.meta?.shape) {
        this.drawShapeCornerHandles(layer, this.directSelection.pathIndex, 'single');
      }
      this.ctx.restore();
    }

    drawShapeCornerHandles(layer, pathIndex = 0, scope = 'all', temp = null) {
      const handles = this.getShapeCornerHandles(layer, pathIndex, temp);
      if (!handles.length) return;
      this.ctx.save();
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.strokeStyle = scope === 'all'
        ? getThemeToken('--render-selection-handle-stroke', '#f8fafc')
        : getThemeToken('--render-direct-stroke', '#22d3ee');
      this.ctx.fillStyle = getThemeToken('--render-direct-handle-fill', '#0f172a');
      const r = 3.2 / this.scale;
      handles.forEach((handle) => {
        this.ctx.beginPath();
        this.ctx.moveTo(handle.vertex.x, handle.vertex.y);
        this.ctx.lineTo(handle.point.x, handle.point.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(handle.point.x, handle.point.y, r, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    drawPenPreview() {
      const anchors = this.penDraft?.anchors || [];
      if (!anchors.length) return;
      const last = anchors[anchors.length - 1];
      const previewAnchors =
        this.penPreview && !this.isPenDragging ? anchors.concat([this.createAnchor(this.penPreview)]) : anchors.slice();
      this.ctx.save();
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      if (previewAnchors.length >= 2) {
        this.ctx.moveTo(previewAnchors[0].x, previewAnchors[0].y);
        for (let i = 1; i < previewAnchors.length; i++) {
          const a = previewAnchors[i - 1];
          const b = previewAnchors[i];
          const c1 = a.out || a;
          const c2 = b.in || b;
          this.ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
        }
        if (this.penDraft?.closed && previewAnchors.length > 2) {
          const a = previewAnchors[previewAnchors.length - 1];
          const b = previewAnchors[0];
          this.ctx.bezierCurveTo((a.out || a).x, (a.out || a).y, (b.in || b).x, (b.in || b).y, b.x, b.y);
        }
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = getThemeToken('--render-direct-handle-fill', '#0f172a');
      this.ctx.strokeStyle = '#38bdf8';
      const r = 3 / this.scale;
      anchors.forEach((anchor, idx) => {
        if (anchor.in) {
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.in.x, anchor.in.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(anchor.in.x, anchor.in.y, r * 0.75, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        if (anchor.out) {
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.out.x, anchor.out.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(anchor.out.x, anchor.out.y, r * 0.75, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        this.ctx.beginPath();
        this.ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        if (idx === 0) {
          this.ctx.beginPath();
          this.ctx.arc(anchor.x, anchor.y, r * 1.5, 0, Math.PI * 2);
          this.ctx.stroke();
          if (this.penSnapToOrigin) {
            this.ctx.beginPath();
            this.ctx.arc(anchor.x, anchor.y, r * 2.5, 0, Math.PI * 2);
            this.ctx.stroke();
          }
        }
      });
      if (last) {
        this.ctx.beginPath();
        this.ctx.arc(last.x, last.y, r * 1.2, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      if (this.penPreview) {
        this.ctx.beginPath();
        this.ctx.arc(this.penPreview.x, this.penPreview.y, r * 0.9, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    drawShapePreview() {
      const shape = this.getDraftShape();
      const path = shape ? this.buildShapePath(shape) : null;
      if (!path || path.length < 2) return;
      const closed = path.meta?.closed !== false;
      this.ctx.save();
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
      if (closed) this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    }

    drawScissorPreview() {
      if (!this.scissorStart || !this.scissorEnd) return;
      const a = this.scissorStart;
      const b = this.scissorEnd;
      this.ctx.save();
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
      if (this.scissorMode === 'rect') {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        this.ctx.strokeRect(x, y, w, h);
      } else if (this.scissorMode === 'circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        this.ctx.beginPath();
        this.ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    drawLightSource() {
      if (!this.lightSource) return;
      const r = 6 / this.scale;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.fillStyle = '#facc15';
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.arc(this.lightSource.x, this.lightSource.y, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      if (this.lightSourceSelected) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
        this.ctx.lineWidth = 1.5 / this.scale;
        this.ctx.arc(this.lightSource.x, this.lightSource.y, r * 1.8, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    getHandlePoints(bounds) {
      return [
        { key: 'nw', ...bounds.corners.nw },
        { key: 'ne', ...bounds.corners.ne },
        { key: 'se', ...bounds.corners.se },
        { key: 'sw', ...bounds.corners.sw },
      ];
    }

    getRotateHandlePoint(bounds) {
      const offset = 18 / this.scale;
      const center = bounds.center;
      const target = bounds.corners.ne;
      const vx = target.x - center.x;
      const vy = target.y - center.y;
      const len = Math.hypot(vx, vy) || 1;
      return { key: 'rotate', x: target.x + (vx / len) * offset, y: target.y + (vy / len) * offset };
    }

    getHandlePoint(handle, bounds) {
      const map = {
        nw: bounds.corners.nw,
        ne: bounds.corners.ne,
        se: bounds.corners.se,
        sw: bounds.corners.sw,
      };
      return map[handle] || bounds.corners.se;
    }

    getResizeAnchor(handle, bounds) {
      const map = {
        nw: bounds.corners.se,
        ne: bounds.corners.sw,
        se: bounds.corners.nw,
        sw: bounds.corners.ne,
      };
      return map[handle] || bounds.center;
    }

    hitHandle(sx, sy, bounds) {
      const RESIZE_R = 10;
      const ROTATE_R = 28;
      const corners = [
        { key: 'nw', ...bounds.corners.nw },
        { key: 'ne', ...bounds.corners.ne },
        { key: 'se', ...bounds.corners.se },
        { key: 'sw', ...bounds.corners.sw },
      ];
      let world = null;
      for (const c of corners) {
        const sc = this.worldToScreen(c.x, c.y);
        const dist = Math.hypot(sx - sc.x, sy - sc.y);
        if (dist <= RESIZE_R) return c.key;
        if (dist <= ROTATE_R) {
          if (!world) world = this.screenToWorld(sx, sy);
          if (!this.pointInBounds(world, bounds)) return `rotate-${c.key}`;
        }
      }
      return null;
    }

    getHandleVector(handle, bounds) {
      const center = bounds.center;
      const pt = this.getHandlePoint(handle, bounds);
      if (!pt) return { x: 1, y: 1 };
      return { x: pt.x - center.x, y: pt.y - center.y };
    }

    getBoundsCenter(bounds) {
      return bounds.center || { x: 0, y: 0 };
    }

    pointInBounds(pt, bounds) {
      const dx = pt.x - bounds.origin.x;
      const dy = pt.y - bounds.origin.y;
      const cosR = Math.cos(bounds.rotation);
      const sinR = Math.sin(bounds.rotation);
      const localX = dx * cosR + dy * sinR;
      const localY = -dx * sinR + dy * cosR;
      return localX >= bounds.minX && localX <= bounds.maxX && localY >= bounds.minY && localY <= bounds.maxY;
    }

    rectContainsPoint(rect, pt) {
      return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
    }

    segmentsIntersect(a, b, c, d) {
      const cross = (p1, p2, p3) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
      const onSegment = (p1, p2, p3) =>
        Math.min(p1.x, p2.x) <= p3.x &&
        p3.x <= Math.max(p1.x, p2.x) &&
        Math.min(p1.y, p2.y) <= p3.y &&
        p3.y <= Math.max(p1.y, p2.y);
      if (d1 === 0 && onSegment(a, b, c)) return true;
      if (d2 === 0 && onSegment(a, b, d)) return true;
      if (d3 === 0 && onSegment(c, d, a)) return true;
      if (d4 === 0 && onSegment(c, d, b)) return true;
      return false;
    }

    segmentIntersectsRect(a, b, rect) {
      if (this.rectContainsPoint(rect, a) || this.rectContainsPoint(rect, b)) return true;
      const r1 = { x: rect.x, y: rect.y };
      const r2 = { x: rect.x + rect.w, y: rect.y };
      const r3 = { x: rect.x + rect.w, y: rect.y + rect.h };
      const r4 = { x: rect.x, y: rect.y + rect.h };
      return (
        this.segmentsIntersect(a, b, r1, r2) ||
        this.segmentsIntersect(a, b, r2, r3) ||
        this.segmentsIntersect(a, b, r3, r4) ||
        this.segmentsIntersect(a, b, r4, r1)
      );
    }

    pathIntersectsRect(path, rect) {
      if (!Array.isArray(path) || path.length < 2) return false;
      for (let i = 0; i < path.length - 1; i++) {
        if (this.segmentIntersectsRect(path[i], path[i + 1], rect)) return true;
      }
      return false;
    }

    pointInPoly(point, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }

    segmentIntersectsPoly(a, b, poly) {
      if (this.pointInPoly(a, poly) || this.pointInPoly(b, poly)) return true;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        if (this.segmentsIntersect(a, b, p1, p2)) return true;
      }
      return false;
    }

    pathIntersectsPoly(path, poly) {
      if (!Array.isArray(path) || path.length < 2) return false;
      for (let i = 0; i < path.length - 1; i++) {
        if (this.segmentIntersectsPoly(path[i], path[i + 1], poly)) return true;
      }
      return false;
    }

    distancePointToSegment(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
      const proj = { x: a.x + t * dx, y: a.y + t * dy };
      return Math.hypot(p.x - proj.x, p.y - proj.y);
    }

    circleIntersectsPoly(meta, poly) {
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const r = meta.r ?? Math.max(meta.rx ?? 0, meta.ry ?? 0);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return false;
      const center = { x: cx, y: cy };
      if (this.pointInPoly(center, poly)) return true;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (this.distancePointToSegment(center, a, b) <= r) return true;
      }
      return false;
    }

    layerIntersectsPoly(layer, poly) {
      if (!layer || !layer.visible) return false;
      return this.getInteractionPaths(layer).some((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          return this.circleIntersectsPoly(path.meta, poly);
        }
        return this.pathIntersectsPoly(path, poly);
      });
    }

    _expandGroupSelection(layers) {
      if (this.groupEditMode) {
        return layers.filter((l) => l.parentId === this.groupEditMode.groupId);
      }
      const expandedIds = new Set();
      for (const layer of layers) {
        if (layer.parentId) {
          const parent = this.engine.layers.find((l) => l.id === layer.parentId);
          if (parent?.isGroup && parent.groupType === 'group') {
            const siblings = this.engine.getLayerChildren(layer.parentId)
              .filter((l) => l.visible && !this.isLayerLocked?.(l.id));
            siblings.forEach((s) => expandedIds.add(s.id));
            continue;
          }
        }
        expandedIds.add(layer.id);
      }
      return this.engine.layers.filter((l) => expandedIds.has(l.id));
    }

    selectLayersByPolygon(poly) {
      if (!poly || poly.length < 3) return;
      const selected = this.engine.layers.filter((layer) => this.layerIntersectsPoly(layer, poly));
      const toSelect = this._expandGroupSelection(selected);
      if (toSelect.length) {
        this.setSelection(
          toSelect.map((layer) => layer.id),
          toSelect[toSelect.length - 1].id
        );
      }
    }

    ellipseToPoly(rect, steps = 36) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const rx = rect.w / 2;
      const ry = rect.h / 2;
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
      }
      return pts;
    }

    circleIntersectsRect(meta, rect) {
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const r = meta.r ?? Math.max(meta.rx ?? 0, meta.ry ?? 0);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return false;
      if (this.rectContainsPoint(rect, { x: cx, y: cy })) return true;
      const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
      const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy <= r * r;
    }

    layerIntersectsRect(layer, rect) {
      if (!layer || !layer.visible) return false;
      return this.getInteractionPaths(layer).some((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          return this.circleIntersectsRect(path.meta, rect);
        }
        return this.pathIntersectsRect(path, rect);
      });
    }

    handleCursor(handle, bounds = null) {
      if (handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw') {
        const corner = bounds?.corners?.[handle];
        const center = bounds?.center;
        const fallback = (handle === 'nw' || handle === 'se') ? 'nwse-resize' : 'nesw-resize';
        if (!corner || !center) return fallback;
        const angleDeg = Math.atan2(corner.y - center.y, corner.x - center.x) * 180 / Math.PI;
        return this.cursorDataUrl('resize', 12, 12, fallback, angleDeg);
      }
      if (typeof handle === 'string' && handle.startsWith('rotate-')) {
        const cornerKey = handle.slice('rotate-'.length);
        const corner = bounds?.corners?.[cornerKey];
        const center = bounds?.center;
        let angleDeg = -90;
        if (corner && center) {
          angleDeg = Math.atan2(corner.y - center.y, corner.x - center.x) * 180 / Math.PI;
        }
        return this.cursorDataUrl('rotate', 12, 12, 'crosshair', angleDeg);
      }
      return 'default';
    }

    // Returns true and applies the cursor if a modifier-key override is active
    // (Alt over Select → copy-plus, CMD over fill → microscope). Callers should
    // bail when this returns true.
    _applyModifierCursorOverride(e = null) {
      if (!this.canvas) return false;
      // _modState is authoritative — it's always updated by keydown/keyup before
      // this runs. Falling back to e.metaKey would read a stale value from
      // _lastPointerEvent when CMD is released (that event still has metaKey:true).
      const altHeld = this._modState ? Boolean(this._modState.alt) : Boolean(e?.altKey);
      const metaHeld = this._modState ? Boolean(this._modState.meta) : Boolean(e?.metaKey || e?.ctrlKey);
      if (altHeld && this.activeTool === 'select' && !this.isLayerDrag && !this.isSelecting) {
        this.setCanvasCursor(this.cursorDataUrl('copyPlus', 4, 4, 'copy'), 'select-copy');
        return true;
      }
      if (metaHeld && this.activeTool === 'fill' && !this.isLayerDrag) {
        this.setCanvasCursor(this.cursorDataUrl('microscope', 10, 14, 'crosshair'), 'fill-pickup');
        return true;
      }
      return false;
    }

    updateHoverCursor(e) {
      if (!this.canvas) return;
      const modifiers = this.getModifierState(e);
      if (this._applyModifierCursorOverride(e)) return;
      if (this.activeTool === 'hand') {
        this.setCanvasCursor(this.isPan ? 'grabbing' : 'grab');
        return;
      }
      if (this.activeTool === 'pen' && !modifiers.meta && this.penMode === 'draw') {
        this.setCanvasCursor('crosshair');
        return;
      }
      if (`${this.activeTool}`.startsWith('shape-')) {
        this.setCanvasCursor(makeShapeReticleCursor(getThemeToken('--render-cursor-stroke', 'white')), 'shape-reticle');
        return;
      }
      if (this.activeTool === 'scissor' || this.activeTool === 'lasso') {
        this.setCanvasCursor('crosshair');
        return;
      }
      if (this.activeTool === 'fill' || this.activeTool === 'fill-erase' ||
          this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      if (this.activeTool === 'direct') {
        const selectedShape = this.getSelectedShapeLayer();
        if (selectedShape && this.hitShapeCornerHandle(world, selectedShape, 0)) {
          this.setCanvasCursor('pointer');
          return;
        }
        const control = this.hitDirectControl(world);
        if (control) {
          this.setCanvasCursor(control.type === 'anchor' ? 'move' : 'pointer');
          return;
        }
        const hit = this.findPathHitAtPoint(world);
        if (hit) {
          this.setCanvasCursor('move');
        } else {
          this.setCanvasCursor(this.cursorDataUrl('outline', 4, 4, 'auto'), 'direct');
        }
        return;
      }
      if (this.activeTool === 'pen' && this.penMode !== 'draw' && !modifiers.meta) {
        const control = this.hitDirectControl(world);
        if (control) {
          this.setCanvasCursor(this.penMode === 'delete' ? 'not-allowed' : 'pointer');
          return;
        }
        this.findPathHitAtPoint(world, {
          restrictToLayerId: this.directSelection?.layerId || null,
        });
        this.setCanvasCursor('crosshair');
        return;
      }
      if (this.hitLightSource(world)) {
        this.setCanvasCursor(this.isLightDrag ? 'grabbing' : 'move');
        return;
      }
      if (this.activeTool === 'select' && this.getActiveModifierLayer()) {
        const hitGuide = this.hitModifierGuide(world);
        if (hitGuide) {
          if (hitGuide.type === 'rotate') {
            this.setCanvasCursor('grab');
            return;
          }
          this.setCanvasCursor(
            hitGuide.guide.locked ? 'not-allowed' :
            hitGuide.type === 'flip' ? 'pointer' :
            (hitGuide.type === 'latticeA' || hitGuide.type === 'latticeB') ? 'crosshair' :
            'move'
          );
          return;
        }
      }
      const activeLayers = this.getSelectedLayers();
      if (!activeLayers.length) {
        if (this.activeTool === 'select') {
          this.setCanvasCursor(this.cursorDataUrl('filled', 4, 4, 'auto'), 'select');
        } else {
          this.setCanvasCursor('crosshair');
        }
        return;
      }
      if (this.activeTool === 'select' && activeLayers.length === 1) {
        const shapeLayer = this.getSelectedShapeLayer();
        if (shapeLayer && this.hitShapeCornerHandle(world, shapeLayer, 0)) {
          this.setCanvasCursor('pointer');
          return;
        }
      }
      const bounds = this.getSelectionBounds(activeLayers, this.tempTransform);
      if (!bounds) {
        if (this.activeTool === 'select') {
          this.setCanvasCursor(this.cursorDataUrl('filled', 4, 4, 'auto'), 'select');
        }
        return;
      }
      const handle = this.hitHandle(sx, sy, bounds);
      if (handle) {
        const mode = handle.startsWith('rotate') ? 'rotate' : 'resize';
        this.setCanvasCursor(this.handleCursor(handle, bounds), mode);
        return;
      }
      if (this.pointInBounds(world, bounds)) {
        this.setCanvasCursor(activeLayers.length > 1 ? 'grab' : 'move');
        return;
      }
      if (this.activeTool === 'select') {
        this.setCanvasCursor(this.cursorDataUrl('filled', 4, 4, 'auto'), 'select');
      } else {
        this.setCanvasCursor('crosshair');
      }
    }

    updateTransformInputs(layer) {
      const posX = document.getElementById('inp-pos-x');
      const posY = document.getElementById('inp-pos-y');
      const scaleX = document.getElementById('inp-scale-x');
      const scaleY = document.getElementById('inp-scale-y');
      const rotation = document.getElementById('inp-rotation');
      const UU = (window.Vectura && window.Vectura.UnitUtils) || {};
      const settings = (window.Vectura && window.Vectura.SETTINGS) || {};
      const units = UU.normalizeDocumentUnits ? UU.normalizeDocumentUnits(settings.documentUnits) : 'metric';
      const formatLen = (v) => {
        if (!UU.formatDocumentLength) return v;
        return UU.formatDocumentLength(v, units, { includeUnit: false, trimTrailingZeros: true });
      };
      if (posX) posX.value = formatLen(layer.params.posX);
      if (posY) posY.value = formatLen(layer.params.posY);
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;
      if (rotation) rotation.value = layer.params.rotation;
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.ShapeUtils = {
    buildRectangleVertices,
    buildPolygonVertices,
    getShapeVertices,
    getCornerDescriptors,
    buildShapeAnchors,
  };
  window.Vectura.Renderer = Renderer;
  // Test-only surface: lets unit tests poke the token cache without standing
  // up a full Renderer instance. Production code should keep calling the
  // closure-local `getThemeToken` directly.
  Renderer.__tokenCache = {
    get: getThemeToken,
    invalidate: invalidateThemeTokenCache,
  };
})();
