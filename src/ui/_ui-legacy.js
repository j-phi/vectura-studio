/**
 * UI controller for DOM wiring and controls.
 */
(() => {
  const {
    ALGO_DEFAULTS,
    SETTINGS,
    DESCRIPTIONS,
    MACHINES,
    Algorithms,
    SeededRNG,
    SimpleNoise,
    Layer,
    PALETTES,
    MODIFIER_DEFAULTS,
    MODIFIER_DESCRIPTIONS,
    Modifiers = {},
    Masking = {},
    RandomizationUtils,
    GeometryUtils,
    OptimizationUtils,
    UnitUtils = {},
    UI_CONSTANTS = {},
  } = window.Vectura || {};

  const {
    petalis: PETALIS_PRESET_LIBRARY = [],
    terrain: TERRAIN_PRESET_LIBRARY = [],
    rings: RINGS_PRESET_LIBRARY = [],
    PETALIS_LAYER_TYPES = new Set(['petalisDesigner']),
    isPetalisLayerType = (type) => PETALIS_LAYER_TYPES.has(type),
  } = (window.Vectura && window.Vectura.PresetLibraries) || {};

  const getEl = (id, options = {}) => {
    const { silent = false } = options;
    const el = document.getElementById(id);
    if (!el && !silent) console.warn(`[UI] Missing element #${id}`);
    return el;
  };

  const getAnchoredColorProxyInput = () => {
    const existing = document.getElementById('anchored-color-proxy-input');
    if (existing) return existing;
    const proxy = document.createElement('input');
    proxy.id = 'anchored-color-proxy-input';
    proxy.type = 'color';
    proxy.setAttribute('aria-hidden', 'true');
    proxy.tabIndex = -1;
    proxy.style.position = 'fixed';
    proxy.style.left = '-9999px';
    proxy.style.top = '-9999px';
    proxy.style.width = '24px';
    proxy.style.height = '24px';
    proxy.style.opacity = '0.01';
    proxy.style.pointerEvents = 'none';
    proxy.style.border = '0';
    proxy.style.padding = '0';
    proxy.style.background = 'transparent';
    proxy.style.zIndex = '2147483647';
    document.body.appendChild(proxy);
    return proxy;
  };

  const openColorPickerAnchoredTo = (colorInput, triggerEl, { title = 'Color', uiInstance = null } = {}) => {
    if (!colorInput || !triggerEl) return;

    // On touch devices, programmatic showPicker() on a hidden proxy input is unreliable
    // (iOS requires the element to be on-screen and the call inside a synchronous user
    // gesture, and older iOS has no showPicker() at all). Always show the color modal
    // instead — it provides a visible input[type=color] + hex field that works everywhere.
    const isTouchPrimary = 'ontouchstart' in window || navigator.maxTouchPoints > 1;
    if (isTouchPrimary && uiInstance) {
      uiInstance.openColorModal({
        title,
        value: colorInput.value || '#000000',
        onApply: (next) => {
          colorInput.value = next;
          colorInput.dispatchEvent(new Event('input', { bubbles: true }));
          colorInput.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
      return;
    }

    const rect = triggerEl.getBoundingClientRect();
    const proxyInput = getAnchoredColorProxyInput();
    const sourceColor = colorInput.value || '#000000';
    proxyInput.value = sourceColor;

    const desiredLeft = Math.round(rect.left + rect.width / 2);
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceAbove >= (UI_CONSTANTS.COLOR_PICKER_POPOVER_THRESHOLD_PX ?? 220) || spaceAbove >= spaceBelow;
    const top = placeAbove ? Math.round(rect.top - 2) : Math.round(rect.bottom + 2);
    const left = Math.max(12, Math.min(window.innerWidth - 12, desiredLeft));
    proxyInput.style.left = `${left}px`;
    proxyInput.style.top = `${top}px`;
    proxyInput.style.transform = `translate(-50%, ${placeAbove ? '-100%' : '0'})`;

    let done = false;

    const syncToSource = (evtName) => {
      colorInput.value = proxyInput.value;
      colorInput.dispatchEvent(new Event(evtName, { bubbles: true }));
    };

    const cleanup = () => {
      if (done) return;
      done = true;
      proxyInput.removeEventListener('input', handleInput);
      proxyInput.removeEventListener('change', handleChange);
      proxyInput.removeEventListener('blur', cleanup);
      window.removeEventListener('focus', cleanup);
      proxyInput.style.left = '-9999px';
      proxyInput.style.top = '-9999px';
      proxyInput.style.transform = 'none';
    };

    const handleInput = () => syncToSource('input');
    const handleChange = () => {
      syncToSource('change');
      cleanup();
    };

    proxyInput.addEventListener('input', handleInput);
    proxyInput.addEventListener('change', handleChange);
    proxyInput.addEventListener('blur', cleanup, { once: true });
    window.addEventListener('focus', cleanup, { once: true });

    // Call showPicker() synchronously — wrapping in rAF breaks the user-gesture
    // chain that mobile browsers require to open the native color picker.
    try {
      if (typeof proxyInput.showPicker === 'function') proxyInput.showPicker();
      else proxyInput.click();
    } catch (_err) {
      proxyInput.click();
    }
    setTimeout(cleanup, 3000);
  };

  const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const escapeXmlAttr = (value) =>
    `${value ?? ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const normalizeSvgId = (value, prefix = 'id') => {
    const fallback = `${prefix || 'id'}`;
    const base = `${value ?? ''}`.trim() || fallback;
    const sanitized = base.replace(/[^A-Za-z0-9_.-]/g, '_') || fallback;
    return /^[A-Za-z_]/.test(sanitized) ? sanitized : `${fallback}_${sanitized}`;
  };

  const { clamp, lerp } = window.Vectura.AlgorithmUtils;
  const roundToStep = (value, step) => (step ? Math.round(value / step) * step : value);
  const DISPLAY_PRECISION = 2;
  const normalizeDocumentUnits = UnitUtils.normalizeDocumentUnits || ((value) => (`${value || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
  const getDocumentUnitLabel = UnitUtils.getDocumentUnitLabel || ((units) => (normalizeDocumentUnits(units) === 'imperial' ? 'in' : 'mm'));
  const mmToDocumentUnits = UnitUtils.mmToDocumentUnits || ((value, units) => (normalizeDocumentUnits(units) === 'imperial' ? Number(value || 0) / 25.4 : Number(value || 0)));
  const documentUnitsToMm = UnitUtils.documentUnitsToMm || ((value, units) => (normalizeDocumentUnits(units) === 'imperial' ? Number(value || 0) * 25.4 : Number(value || 0)));
  const getDocumentUnitPrecision = UnitUtils.getDocumentUnitPrecision || ((units, fallback = null) => (Number.isFinite(fallback) ? fallback : (normalizeDocumentUnits(units) === 'imperial' ? 2 : 1)));
  const getDocumentUnitStep = UnitUtils.getDocumentUnitStep || ((units, fallback = null) => (Number.isFinite(fallback) ? fallback : (normalizeDocumentUnits(units) === 'imperial' ? 0.01 : 0.1)));
  const formatDocumentLength = UnitUtils.formatDocumentLength || ((valueMm, units, options = {}) => {
    const precision = getDocumentUnitPrecision(units, options.precision);
    const unit = getDocumentUnitLabel(units);
    const value = mmToDocumentUnits(valueMm, units);
    let text = Number.isFinite(value) ? value.toFixed(precision) : '0';
    if (options.trimTrailingZeros && text.includes('.')) {
      text = text.replace(/\.?0+$/, '');
    }
    if (options.includeUnit === false) return text;
    return `${text}${options.spaceBeforeUnit ? ' ' : ''}${unit}`;
  });
  const TRANSFORM_KEYS = ['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation'];
  const clone =
    typeof structuredClone === 'function' ? (obj) => structuredClone(obj) : (obj) => JSON.parse(JSON.stringify(obj));
  const getThemeToken = (name, fallback = '') => {
    if (typeof document === 'undefined' || !document.documentElement) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };
  const normalizeHexColor = (value) => {
    if (typeof value !== 'string') return null;
    let next = value.trim();
    if (!next) return null;
    if (!next.startsWith('#')) next = `#${next}`;
    if (/^#[0-9a-fA-F]{3}$/.test(next)) {
      next = `#${next[1]}${next[1]}${next[2]}${next[2]}${next[3]}${next[3]}`;
    }
    return /^#[0-9a-fA-F]{6}$/.test(next) ? next.toLowerCase() : null;
  };
  const getContrastTextColor = (background, options = {}) => {
    const { dark = '#000000', light = '#ffffff' } = options;
    const normalized = normalizeHexColor(background);
    if (!normalized) return dark;
    const r = parseInt(normalized.slice(1, 3), 16) / 255;
    const g = parseInt(normalized.slice(3, 5), 16) / 255;
    const b = parseInt(normalized.slice(5, 7), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.62 ? dark : light;
  };
  const SEEDLESS_ALGOS = new Set(['lissajous', 'harmonograph', 'shape', 'group']);
  const usesSeed = (type) => !SEEDLESS_ALGOS.has(type);
  const mapRange = (value, inMin, inMax, outMin, outMax) => {
    if (inMax === inMin) return outMin;
    const t = (value - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
  };
  const simplifyPath = GeometryUtils?.simplifyPath || ((path) => path);
  const joinNearbyPaths = OptimizationUtils?.joinNearbyPaths || ((paths) => paths);
  const createModifierState = Modifiers.createModifierState || ((type) => ({ type, enabled: true, guidesVisible: true, guidesLocked: false, mirrors: [] }));
  const createMirrorLine = Modifiers.createMirrorLine || ((index) => ({ id: `mirror-${index + 1}`, enabled: true }));
  const createRadialMirror = Modifiers.createRadialMirror || ((index) => ({ id: `mirror-${index + 1}`, enabled: true, type: 'radial', count: 6, mode: 'dihedral', centerX: 0, centerY: 0, angle: 0 }));
  const createArcMirror = Modifiers.createArcMirror || ((index) => ({ id: `mirror-${index + 1}`, enabled: true, type: 'arc', centerX: 0, centerY: 0, radius: 80, arcStart: -180, arcEnd: 180, replacedSide: 'outer' }));
  const createWallpaperMirror = Modifiers.createWallpaperMirror || ((index) => ({ id: `mirror-${index + 1}`, enabled: true, type: 'wallpaper', group: 'p4m', tileWidth: 60, tileHeight: 60, tileAngle: 90, rotation: 0, centerX: 0, centerY: 0 }));
  const isModifierLayer = Modifiers.isModifierLayer || (() => false);
  const getLayerSilhouette = Masking.getLayerSilhouette || (() => []);

  const splitPathByShape = GeometryUtils?.splitPathByShape;

  const pointsEqual = (a, b, epsilon = 1e-6) => {
    if (!a || !b) return false;
    return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
  };

  const clampPointToRect = (pt, rect) => ({
    x: clamp(pt.x, rect.x, rect.x + rect.w),
    y: clamp(pt.y, rect.y, rect.y + rect.h),
  });

  const clipSegmentToRect = (a, b, rect) => {
    const epsilon = 1e-9;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [a.x - rect.x, rect.x + rect.w - a.x, a.y - rect.y, rect.y + rect.h - a.y];

    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < epsilon) {
        if (q[i] < 0) return null;
        continue;
      }
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }

    if (t0 > t1) return null;
    const start = clampPointToRect({ x: lerp(a.x, b.x, t0), y: lerp(a.y, b.y, t0) }, rect);
    const end = clampPointToRect({ x: lerp(a.x, b.x, t1), y: lerp(a.y, b.y, t1) }, rect);
    if (pointsEqual(start, end)) return null;
    return [start, end];
  };

  const expandCirclePath = (meta, segments = 80) => {
    const cx = meta.cx ?? meta.x ?? 0;
    const cy = meta.cy ?? meta.y ?? 0;
    const rx = meta.rx ?? meta.r ?? 0;
    const ry = meta.ry ?? meta.r ?? rx;
    const rotation = meta.rotation ?? 0;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const localX = Math.cos(t) * rx;
      const localY = Math.sin(t) * ry;
      pts.push({
        x: cx + localX * cosR - localY * sinR,
        y: cy + localX * sinR + localY * cosR,
      });
    }
    return pts;
  };

  const sampleQuadratic = (p0, c, p1, segments = 10) => {
    const pts = [];
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      pts.push({
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
      });
    }
    return pts;
  };

  const resampleCurvedPath = (path) => {
    if (!Array.isArray(path) || path.length < 3) return path;
    const newPath = [path[0]];
    let current = path[0];
    for (let i = 1; i < path.length - 1; i++) {
      const ctrl = path[i];
      const next = path[i + 1];
      const end = { x: (ctrl.x + next.x) / 2, y: (ctrl.y + next.y) / 2 };
      const pts = sampleQuadratic(current, ctrl, end, 8);
      pts.forEach((p) => newPath.push(p));
      current = end;
    }
    newPath.push(path[path.length - 1]);
    if (path.meta) newPath.meta = path.meta;
    return newPath;
  };

  const clipPathToRect = (path, rect) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    if (!rect || !Number.isFinite(rect.w) || !Number.isFinite(rect.h) || rect.w <= 0 || rect.h <= 0) return [];
    const output = [];
    let current = null;
    for (let i = 0; i < path.length - 1; i++) {
      const clipped = clipSegmentToRect(path[i], path[i + 1], rect);
      if (!clipped) {
        if (current && current.length > 1) output.push(current);
        current = null;
        continue;
      }

      const [start, end] = clipped;
      if (!current || !pointsEqual(current[current.length - 1], start, 1e-4)) {
        if (current && current.length > 1) output.push(current);
        current = [start, end];
        continue;
      }
      if (!pointsEqual(current[current.length - 1], end, 1e-4)) current.push(end);
    }
    if (current && current.length > 1) output.push(current);
    return output;
  };

  const clonePathsWithMeta = (paths = []) =>
    (paths || []).map((path) => {
      if (!Array.isArray(path)) return path;
      const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
      if (path.meta) next.meta = clone(path.meta);
      return next;
    });

  const polygonToSvgPathData = (polygon, precision = 3) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return '';
    const fmt = (n) => Number(n).toFixed(precision);
    let d = `M ${fmt(polygon[0].x)} ${fmt(polygon[0].y)}`;
    for (let i = 1; i < polygon.length; i++) {
      d += ` L ${fmt(polygon[i].x)} ${fmt(polygon[i].y)}`;
    }
    if (!pointsEqual(polygon[0], polygon[polygon.length - 1], 1e-4)) d += ' Z';
    return d;
  };

  const rectToSvgPathData = (rect, precision = 3) => {
    if (!rect) return '';
    const fmt = (n) => Number(n).toFixed(precision);
    return `M ${fmt(rect.x)} ${fmt(rect.y)} H ${fmt(rect.x + rect.w)} V ${fmt(rect.y + rect.h)} H ${fmt(rect.x)} Z`;
  };

  const buildClipPathMarkup = (id, polygons, precision, options = {}) => {
    const { invert = false, profile = null } = options;
    const valid = (polygons || []).filter((polygon) => Array.isArray(polygon) && polygon.length >= 3);
    if (!valid.length) return '';
    let d = '';
    if (invert && profile) {
      d += rectToSvgPathData({ x: 0, y: 0, w: profile.width || 0, h: profile.height || 0 }, precision);
    }
    valid.forEach((polygon) => {
      d += polygonToSvgPathData(polygon, precision);
    });
    if (!d) return '';
    return `<clipPath id="${escapeXmlAttr(id)}"><path d="${d}" clip-rule="evenodd" /></clipPath>`;
  };

  const cloneExportPath = (path) => {
    if (!Array.isArray(path)) return path;
    const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
    if (path.meta) next.meta = clone(path.meta);
    return next;
  };

  const isMaskLayerGeometryHidden = (layer) => Boolean(layer?.mask?.enabled && layer?.mask?.hideLayer);

  const getRawExportPaths = (layer, options = {}) => {
    if (!layer) return [];
    if (isMaskLayerGeometryHidden(layer)) return [];
    const { useOptimized = false } = options;
    const source =
      useOptimized && Array.isArray(layer.optimizedPaths)
        ? layer.optimizedPaths
        : Array.isArray(layer.effectivePaths) && layer.effectivePaths.length
        ? layer.effectivePaths
        : layer.paths || [];
    return clonePathsWithMeta(source);
  };

  const getVisibleExportPaths = (layer, options = {}) => {
    if (!layer) return [];
    if (isMaskLayerGeometryHidden(layer)) return [];
    if (layer.displayMaskActive && Array.isArray(layer.displayPaths) && layer.displayPaths.length) return clonePathsWithMeta(layer.displayPaths);
    return getRawExportPaths(layer, options);
  };

  const hardClipExportPaths = (paths, rect, options = {}) => {
    const { useCurves = false } = options;
    if (!rect) return clonePathsWithMeta(paths);
    const clipped = [];
    (paths || []).forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const baseMeta = path.meta ? clone(path.meta) : {};
      const geometry =
        path.meta?.kind === 'circle'
          ? expandCirclePath(path.meta, UI_CONSTANTS.CIRCLE_EXPORT_STEPS ?? 72)
          : useCurves
          ? resampleCurvedPath(path)
          : cloneExportPath(path);
      const segments = clipPathToRect(geometry, rect);
      segments.forEach((segment) => {
        if (!Array.isArray(segment) || segment.length < 2) return;
        segment.meta = { ...baseMeta, exportClipped: true, closed: false };
        clipped.push(segment);
      });
    });
    return clipped;
  };

  const getMaskExportBounds = (engine, profile) => {
    if (engine?.getBounds) return engine.getBounds();
    const margin = Math.max(0, SETTINGS.margin || 0);
    return {
      width: profile.width,
      height: profile.height,
      m: margin,
      dW: Math.max(0, profile.width - margin * 2),
      dH: Math.max(0, profile.height - margin * 2),
      truncate: SETTINGS.truncate !== false,
    };
  };

  const svgAttrsToMarkup = (attrs = {}) =>
    Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== '')
      .map(([key, value]) => ` ${key}="${escapeXmlAttr(value)}"`)
      .join('');

  const stepPrecision = (step) => {
    const s = step?.toString?.() || '';
    if (!s.includes('.')) return 0;
    return s.split('.')[1].length;
  };

  // A control is a "document-length" control when its values are stored in
  // millimetres but should be displayed/edited in whatever unit the document
  // is currently configured for. Either `displayUnit: 'mm'` on the def or an
  // explicit "(mm)" suffix on the label opts in.
  const isDocumentLengthDef = (def) => def?.displayUnit === 'mm' || /\(mm\)/.test(def?.label || '');
  const currentDocumentUnits = () => normalizeDocumentUnits(SETTINGS.documentUnits);

  const getDisplayConfig = (def) => {
    const hasExplicitDisplay = def.displayMin !== undefined || def.displayMax !== undefined || def.displayStep !== undefined;
    if (!hasExplicitDisplay && isDocumentLengthDef(def)) {
      const units = currentDocumentUnits();
      const min = mmToDocumentUnits(def.min ?? 0, units);
      const max = mmToDocumentUnits(def.max ?? 0, units);
      const rawStep = def.step ?? 1;
      const convertedStep = mmToDocumentUnits(rawStep, units);
      const step = convertedStep || rawStep;
      const unit = getDocumentUnitLabel(units);
      const precisionCap = units === 'imperial' ? 4 : 3;
      const precision = Math.min(
        precisionCap,
        Math.max(
          Number.isFinite(def.displayPrecision) ? def.displayPrecision : 0,
          getDocumentUnitPrecision(units),
          Math.min(stepPrecision(step), precisionCap),
        ),
      );
      return { min, max, step, unit, precision };
    }
    const min = def.displayMin ?? def.min;
    const max = def.displayMax ?? def.max;
    const step = def.displayStep ?? def.step ?? 1;
    const unit = def.displayUnit ?? '';
    const precision = Number.isFinite(def.displayPrecision) ? def.displayPrecision : stepPrecision(step);
    return { min, max, step, unit, precision };
  };

  const toDisplayValue = (def, value) => {
    const hasExplicitDisplay = def.displayMin !== undefined || def.displayMax !== undefined;
    if (!hasExplicitDisplay && isDocumentLengthDef(def)) {
      return mmToDocumentUnits(value, currentDocumentUnits());
    }
    if (hasExplicitDisplay) {
      const dMin = def.displayMin ?? def.min;
      const dMax = def.displayMax ?? def.max;
      return mapRange(value, def.min, def.max, dMin, dMax);
    }
    return value;
  };

  const fromDisplayValue = (def, value) => {
    const hasExplicitDisplay = def.displayMin !== undefined || def.displayMax !== undefined;
    if (!hasExplicitDisplay && isDocumentLengthDef(def)) {
      return documentUnitsToMm(value, currentDocumentUnits());
    }
    if (hasExplicitDisplay) {
      const dMin = def.displayMin ?? def.min;
      const dMax = def.displayMax ?? def.max;
      return mapRange(value, dMin, dMax, def.min, def.max);
    }
    return value;
  };

  const formatDisplayValue = (def, value) => {
    const displayVal = toDisplayValue(def, value);
    const { precision, unit } = getDisplayConfig(def);
    const factor = Math.pow(10, precision);
    const rounded = Math.round(displayVal * factor) / factor;
    return `${rounded}${unit}`;
  };

  // Rewrite "(mm)" in a def's label when the document is in imperial mode so
  // every panel that interpolates `${def.label}` automatically shows "(in)".
  const getDisplayLabel = (def) => {
    if (!def?.label) return def?.label || '';
    if (!isDocumentLengthDef(def)) return def.label;
    const unit = getDocumentUnitLabel(currentDocumentUnits());
    return def.label.replace(/\(mm\)/g, `(${unit})`);
  };

  const attachKeyboardRangeNudge = (input, applyValue) => {
    if (!input || !applyValue) return;
    const isArrowKey = (key) => ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(key);
    const clearFlag = () => { delete input.dataset.keyboardAdjust; };
    input.addEventListener('keydown', (e) => { if (!isArrowKey(e.key)) return; input.dataset.keyboardAdjust = '1'; });
    input.addEventListener('keyup', (e) => { if (!isArrowKey(e.key)) return; clearFlag(); });
    input.addEventListener('blur', () => { clearFlag(); });
    input.addEventListener('input', () => {
      if (!input.dataset.keyboardAdjust) return;
      const nextDisplay = parseFloat(input.value);
      if (!Number.isFinite(nextDisplay)) return;
      applyValue(nextDisplay);
    });
  };

  const formatValue = (value) => {
    if (typeof value === 'number') {
      const rounded = Math.round(value * Math.pow(10, DISPLAY_PRECISION)) / Math.pow(10, DISPLAY_PRECISION);
      return rounded.toString();
    }
    return value;
  };

  const PREVIEW = {
    width: 160,
    height: 90,
    margin: 8,
    maxPaths: 160,
    maxPoints: 2400,
    maxPointsPerPath: 240,
  };

  const COMMON_CONTROLS = [
    {
      id: 'smoothing',
      label: 'Smoothing',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'common.smoothing',
    },
    {
      id: 'curves',
      label: 'Curves',
      type: 'checkbox',
      infoKey: 'common.curves',
    },
    {
      id: 'simplify',
      label: 'Simplify',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'common.simplify',
    },
  ];

  // Meridian Unit 1.5 (2026-05-19): wave/noise option tables, algorithm
  // NOISE_DEFS, and the Petalis registry data tables/factories moved to
  // src/ui/panels/control-defs-data.js (loaded ahead of this file via
  // index.html). The legacy identifiers are re-bound here as IIFE-locals so
  // the remaining _ui-legacy.js code paths + the AlgoConfigPanel.bind() DI
  // bag at the bottom of this file continue to work unchanged.
  const _ControlDefsData = (window.Vectura && window.Vectura.UI && window.Vectura.UI.ControlDefsData) || {};
  const {
    WAVE_NOISE_OPTIONS,
    WAVE_NOISE_DESCRIPTIONS,
    IMAGE_NOISE_STYLE_OPTIONS,
    WAVE_PATTERN_TYPES,
    WAVE_CELL_TYPES,
    WAVE_STEP_TYPES,
    WAVE_WARP_TYPES,
    WAVE_SEEDED_TYPES,
    WAVE_NOISE_BLEND_OPTIONS,
    IMAGE_EFFECT_OPTIONS,
    IMAGE_EFFECT_DEFS,
    WAVE_TILE_OPTIONS,
    IMAGE_NOISE_DEFAULT_AMPLITUDE,
    WAVE_NOISE_DEFS,
    cloneNoiseDef,
    RINGS_NOISE_DEFS,
    TOPO_NOISE_DEFS,
    FLOWFIELD_NOISE_DEFS,
    GRID_NOISE_DEFS,
    PHYLLA_NOISE_DEFS,
    PETALIS_DRIFT_NOISE_DEFS,
    PETALIS_MODIFIER_TYPES,
    PETALIS_PETAL_MODIFIER_TYPES,
    PETALIS_SHADING_TYPES,
    PETALIS_LINE_TYPES,
    createPetalisModifier,
    createPetalModifier,
    createPetalisShading,
    PETAL_DESIGNER_TARGET_OPTIONS,
    PETAL_DESIGNER_PROFILE_DIRECTORY,
    PETAL_DESIGNER_PROFILE_IMPORT_ACCEPT,
    PETAL_DESIGNER_PROFILE_TYPE,
    PETAL_DESIGNER_PROFILE_VERSION,
    PETAL_DESIGNER_PROFILE_BUNDLE_KEY,
    PETAL_DESIGNER_WIDTH_MATCH_BASELINE,
    PETALIS_DESIGNER_DEFAULT_INNER_COUNT,
    PETALIS_DESIGNER_DEFAULT_OUTER_COUNT,
    PETALIS_DESIGNER_DEFAULT_COUNT,
    PETALIS_DESIGNER_VIEW_STYLE_OPTIONS,
    PETALIS_DESIGNER_RANDOMNESS_DEFS,
  } = _ControlDefsData;
  if (!WAVE_NOISE_OPTIONS) {
    console.warn('[UI] window.Vectura.UI.ControlDefsData missing — load src/ui/panels/control-defs-data.js before src/ui/_ui-legacy.js');
  }

  // PETALIS_PRESET_OPTIONS / TERRAIN_PRESET_OPTIONS / PETAL_PROFILE_OPTIONS
  // are derived per-IIFE from the preset libraries; they live in
  // src/ui/controls-registry.js (the only consumer). Kept out of
  // ControlDefsData on purpose to avoid duplicating preset-library wiring.
  const PETALIS_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(PETALIS_PRESET_LIBRARY)
      ? PETALIS_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
      : []),
  ];

  const TERRAIN_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(TERRAIN_PRESET_LIBRARY)
      ? TERRAIN_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
      : []),
  ];

  const PETAL_PROFILE_OPTIONS = [
    { value: 'oval', label: 'Oval' },
    { value: 'teardrop', label: 'Teardrop' },
    { value: 'lanceolate', label: 'Lanceolate' },
    { value: 'heart', label: 'Heart' },
    { value: 'spoon', label: 'Spoon' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'notched', label: 'Notched' },
    { value: 'spatulate', label: 'Spatulate' },
    { value: 'marquise', label: 'Marquise' },
    { value: 'dagger', label: 'Dagger' },
  ];

  // Merge COMMON_CONTROLS into the _UINoiseDefs namespace populated by
  // src/ui/panels/control-defs-data.js. The noise-rack-panel reads
  // window.Vectura._UINoiseDefs.COMMON_CONTROLS at runtime; keeping the
  // bridge here means COMMON_CONTROLS (still legacy-local) stays a single
  // source of truth without round-tripping through ControlDefsData.
  window.Vectura = window.Vectura || {};
  window.Vectura._UINoiseDefs = Object.assign(window.Vectura._UINoiseDefs || {}, {
    COMMON_CONTROLS,
  });

  const CONTROL_DEFS = window.Vectura?.UI?.CONTROL_DEFS;
  if (!CONTROL_DEFS) {
    console.warn('[UI] window.Vectura.UI.CONTROL_DEFS missing — load src/ui/controls-registry.js before src/ui/ui.js');
  }

  const smoothPath = (path, amount) => {
    if (!amount || amount <= 0 || path.length < 3) return path;
    const smoothed = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      const avgX = (prev.x + next.x) / 2;
      const avgY = (prev.y + next.y) / 2;
      smoothed.push({
        x: curr.x * (1 - amount) + avgX * amount,
        y: curr.y * (1 - amount) + avgY * amount,
      });
    }
    smoothed.push(path[path.length - 1]);
    if (path.meta) smoothed.meta = path.meta;
    return smoothed;
  };

  const createBounds = (width, height, margin) => {
    const m = margin;
    return { width, height, m, dW: width - m * 2, dH: height - m * 2 };
  };

  const transformPoint = (pt, params, bounds) => {
    const cx = params.origin?.x ?? bounds.width / 2;
    const cy = params.origin?.y ?? bounds.height / 2;
    let x = pt.x - cx;
    let y = pt.y - cy;
    const scaleX = params.scaleX ?? 1;
    const scaleY = params.scaleY ?? 1;
    x *= scaleX;
    y *= scaleY;
    const rot = ((params.rotation ?? 0) * Math.PI) / 180;
    if (rot) {
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;
      x = rx;
      y = ry;
    }
    x += cx + (params.posX ?? 0);
    y += cy + (params.posY ?? 0);
    return { x, y };
  };

  const transformMeta = (meta, params, bounds) => {
    if (!meta || meta.kind !== 'circle') return meta;
    const center = transformPoint({ x: meta.cx, y: meta.cy }, params, bounds);
    const scaleX = params.scaleX ?? 1;
    const scaleY = params.scaleY ?? 1;
    const baseR = Number.isFinite(meta.r) ? meta.r : Math.max(meta.rx ?? 0, meta.ry ?? 0);
    const rot = ((params.rotation ?? 0) * Math.PI) / 180;
    return {
      ...meta,
      cx: center.x,
      cy: center.y,
      rx: Math.abs(baseR * scaleX),
      ry: Math.abs(baseR * scaleY),
      rotation: (meta.rotation ?? 0) + rot,
    };
  };

  const transformPath = (path, params, bounds) => {
    if (!Array.isArray(path)) return path;
    const next = path.map((pt) => transformPoint(pt, params, bounds));
    if (path.meta) next.meta = transformMeta(path.meta, params, bounds);
    return next;
  };

  const limitPaths = (paths) => {
    const limited = [];
    let total = 0;
    for (const path of paths) {
      if (limited.length >= PREVIEW.maxPaths) break;
      let next = path;
      if (next.length > PREVIEW.maxPointsPerPath) {
        const step = Math.ceil(next.length / PREVIEW.maxPointsPerPath);
        next = next.filter((_, i) => i % step === 0);
        if (path.meta) next.meta = path.meta;
      }
      total += next.length;
      if (total > PREVIEW.maxPoints) break;
      limited.push(next);
    }
    return limited;
  };

  const clonePath = (path) => {
    if (!Array.isArray(path)) return path;
    const next = path.map((pt) => ({ ...pt }));
    if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
    return next;
  };

  const clonePaths = (paths) => (paths || []).map((path) => clonePath(path));

  const pathToSvg = (path, precision, useCurves, sharpEdges = false) => {
    if (!path || path.length < 2) return '';
    const fmt = (n) => Number(n).toFixed(precision);
    if (!useCurves || path.length < 3) {
      return `M ${path.map((pt) => `${fmt(pt.x)} ${fmt(pt.y)}`).join(' L ')}`;
    }
    const isClosed = window.Vectura?.OptimizationUtils?.isClosedPath?.(path);
    if (isClosed) {
      const n = path.length - 1;
      const m0x = (path[0].x + path[1].x) / 2;
      const m0y = (path[0].y + path[1].y) / 2;
      let d = `M ${fmt(m0x)} ${fmt(m0y)}`;
      for (let i = 1; i < n; i++) {
        if (sharpEdges && path[i]._tileEdge) {
          d += ` L ${fmt(path[i].x)} ${fmt(path[i].y)}`;
        } else {
          const midX = (path[i].x + path[i + 1].x) / 2;
          const midY = (path[i].y + path[i + 1].y) / 2;
          d += ` Q ${fmt(path[i].x)} ${fmt(path[i].y)} ${fmt(midX)} ${fmt(midY)}`;
        }
      }
      if (sharpEdges && path[0]._tileEdge) {
        d += ` L ${fmt(path[0].x)} ${fmt(path[0].y)} L ${fmt(m0x)} ${fmt(m0y)}`;
      } else {
        d += ` Q ${fmt(path[0].x)} ${fmt(path[0].y)} ${fmt(m0x)} ${fmt(m0y)}`;
      }
      d += ' Z';
      return d;
    }
    let d = `M ${fmt(path[0].x)} ${fmt(path[0].y)}`;
    for (let i = 1; i < path.length - 1; i++) {
      if (sharpEdges && path[i]._tileEdge) {
        d += ` L ${fmt(path[i].x)} ${fmt(path[i].y)}`;
      } else {
        const midX = (path[i].x + path[i + 1].x) / 2;
        const midY = (path[i].y + path[i + 1].y) / 2;
        d += ` Q ${fmt(path[i].x)} ${fmt(path[i].y)} ${fmt(midX)} ${fmt(midY)}`;
      }
    }
    const last = path[path.length - 1];
    d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
    return d;
  };

  const shapeToSvg = (path, precision, useCurves, attrs = null, sharpEdges = false) => {
    const attrMarkup = svgAttrsToMarkup(attrs || {});
    if (path && path.meta && path.meta.kind === 'circle') {
      const fmt = (n) => Number(n).toFixed(precision);
      const cx = path.meta.cx;
      const cy = path.meta.cy;
      const rx = path.meta.rx ?? path.meta.r;
      const ry = path.meta.ry ?? path.meta.r;
      const rotation = path.meta.rotation ?? 0;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return '';
      if (Math.abs(rx - ry) < 0.001) {
        return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(rx)}"${attrMarkup} />`;
      }
      if (Math.abs(rotation) > 0.0001) {
        const deg = ((rotation * 180) / Math.PI).toFixed(3);
        return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${deg} ${fmt(
          cx
        )} ${fmt(cy)})"${attrMarkup} />`;
      }
      return `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(ry)}"${attrMarkup} />`;
    }
    const d = pathToSvg(path, precision, useCurves, sharpEdges);
    return d ? `<path d="${d}"${attrMarkup} />` : '';
  };

  // Expose SVG export utilities to ui-file-io.js
  window.Vectura = window.Vectura || {};
  window.Vectura._UIExportUtil = {
    escapeXmlAttr,
    shapeToSvg,
    buildClipPathMarkup,
    getLayerSilhouette,
    getMaskExportBounds,
    getRawExportPaths,
    getVisibleExportPaths,
    hardClipExportPaths,
  };

  const renderPreviewSvg = (type, params, options = {}) => {
    if (!Algorithms || !Algorithms[type] || !SeededRNG || !SimpleNoise) return '';
    const width = options.width ?? PREVIEW.width;
    const height = options.height ?? PREVIEW.height;
    const margin = options.margin ?? PREVIEW.margin;
    const bounds = createBounds(width, height, margin);
    const base = {
      ...(ALGO_DEFAULTS && ALGO_DEFAULTS[type] ? ALGO_DEFAULTS[type] : {}),
      ...params,
    };
    const seed = Number.isFinite(base.seed) ? base.seed : 1;
    base.seed = seed;
    base.posX = base.posX ?? 0;
    base.posY = base.posY ?? 0;
    base.scaleX = base.scaleX ?? 1;
    base.scaleY = base.scaleY ?? 1;
    base.rotation = base.rotation ?? 0;
    const rng = new SeededRNG(seed);
    const noise = new SimpleNoise(seed);
    const rawPaths = Algorithms[type].generate(base, rng, noise, bounds) || [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rawPaths.forEach((path) => {
      if (!Array.isArray(path)) return;
      if (path.meta && path.meta.kind === 'circle') {
        const cx = path.meta.cx ?? path.meta.x;
        const cy = path.meta.cy ?? path.meta.y;
        const rx = path.meta.rx ?? path.meta.r;
        const ry = path.meta.ry ?? path.meta.r;
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(rx) && Number.isFinite(ry)) {
          minX = Math.min(minX, cx - rx);
          maxX = Math.max(maxX, cx + rx);
          minY = Math.min(minY, cy - ry);
          maxY = Math.max(maxY, cy + ry);
        }
        return;
      }
      path.forEach((pt) => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
    });
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = width;
      maxY = height;
    }
    base.origin = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const smooth = clamp(base.smoothing ?? 0, 0, 1);
    const transformed = rawPaths.map((path) => {
      if (!Array.isArray(path)) return path;
      return smoothPath(transformPath(path, base, bounds), smooth);
    });
    const limited = limitPaths(transformed);
    const useCurves = Boolean(base.curves);
    const precision = 2;
    const strokeWidth = options.strokeWidth ?? 1.2;
    const pathsSvg = limited
      .map((path) => shapeToSvg(path, precision, useCurves))
      .filter(Boolean)
      .join('');
    const strokeColor = getThemeToken('--color-accent', '#fafafa');
    return `
      <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
        ${pathsSvg}
      </svg>
    `;
  };

  const buildRangeValue = (def, t) => {
    const min = Number(def.min);
    const max = Number(def.max);
    const val = min + (max - min) * t;
    const stepped = roundToStep(val, def.step);
    return clamp(stepped, min, max);
  };

  const buildVariantsFromDef = (def) => {
    if (!def) return null;
    if (def.type === 'checkbox') {
      return [
        { label: 'OFF', overrides: { [def.id]: false } },
        { label: 'ON', overrides: { [def.id]: true } },
      ];
    }
    if (def.type === 'select') {
      const first = def.options[0];
      const second = def.options[1] || def.options[def.options.length - 1];
      return [
        { label: first.label.toUpperCase(), overrides: { [def.id]: first.value } },
        { label: second.label.toUpperCase(), overrides: { [def.id]: second.value } },
      ];
    }
    if (def.type === 'rangeDual') {
      const min = Number(def.min);
      const max = Number(def.max);
      const lowMin = roundToStep(min + (max - min) * 0.1, def.step);
      const lowMax = roundToStep(min + (max - min) * 0.35, def.step);
      const highMin = roundToStep(min + (max - min) * 0.6, def.step);
      const highMax = roundToStep(min + (max - min) * 0.9, def.step);
      return [
        { label: 'SMALL', overrides: { [def.minKey]: lowMin, [def.maxKey]: lowMax } },
        { label: 'LARGE', overrides: { [def.minKey]: highMin, [def.maxKey]: highMax } },
      ];
    }
    if (def.type === 'range') {
      const low = buildRangeValue(def, 0.2);
      const high = buildRangeValue(def, 0.8);
      return [
        { label: 'LOW', overrides: { [def.id]: low } },
        { label: 'HIGH', overrides: { [def.id]: high } },
      ];
    }
    return null;
  };

  const resolvePreviewConfig = (key, ui) => {
    const [group, param] = key.split('.');
    const activeLayer = ui?.app?.engine?.getActiveLayer?.();
    const activeType = activeLayer?.type || 'flowfield';
    const baseParams = {
      ...(ALGO_DEFAULTS && ALGO_DEFAULTS[activeType] ? ALGO_DEFAULTS[activeType] : {}),
      seed: 1234,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
    };

    if (group === 'global') {
      if (param === 'algorithm') {
        const algoKeys = Object.keys(ALGO_DEFAULTS || {});
        const currentIndex = Math.max(0, algoKeys.indexOf(activeType));
        const altIndex = algoKeys.length > 1 ? (currentIndex + 1) % algoKeys.length : currentIndex;
        const altType = algoKeys[altIndex] || activeType;
        return {
          customVariants: [
            { label: 'CURRENT', type: activeType, params: baseParams },
            {
              label: 'ALT',
              type: altType,
              params: {
                ...(ALGO_DEFAULTS && ALGO_DEFAULTS[altType] ? ALGO_DEFAULTS[altType] : baseParams),
                seed: 1234,
                posX: 0,
                posY: 0,
                scaleX: 1,
                scaleY: 1,
              },
            },
          ],
        };
      }
      if (param === 'seed') {
        return {
          type: activeType,
          baseParams,
          variants: [
            { label: 'LOW', overrides: { seed: 1111 } },
            { label: 'HIGH', overrides: { seed: 9876 } },
          ],
        };
      }
      if (param === 'posX') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'posX', type: 'range', min: -40, max: 40, step: 1 },
        };
      }
      if (param === 'posY') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'posY', type: 'range', min: -30, max: 30, step: 1 },
        };
      }
      if (param === 'scaleX') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'scaleX', type: 'range', min: 0.6, max: 1.4, step: 0.05 },
        };
      }
      if (param === 'scaleY') {
        return {
          type: activeType,
          baseParams,
          def: { id: 'scaleY', type: 'range', min: 0.6, max: 1.4, step: 0.05 },
        };
      }
      if (param === 'margin') {
        return {
          type: activeType,
          baseParams,
          variants: [
            { label: 'TIGHT', overrides: {}, bounds: { margin: 4 } },
            { label: 'WIDE', overrides: {}, bounds: { margin: 14 } },
          ],
        };
      }
      if (param === 'stroke') {
        return {
          type: activeType,
          baseParams,
          variants: [
            { label: 'THIN', overrides: {}, strokeWidth: 0.6 },
            { label: 'THICK', overrides: {}, strokeWidth: 1.8 },
          ],
        };
      }
      return null;
    }

    if (group === 'common') {
      const def = COMMON_CONTROLS.find((item) => item.id === param);
      if (!def) return null;
      return { type: activeType, baseParams, def };
    }

    if (group === 'wavetable') {
      const waveBase = {
        ...(ALGO_DEFAULTS && ALGO_DEFAULTS.wavetable ? ALGO_DEFAULTS.wavetable : baseParams),
        seed: 1234,
        posX: 0,
        posY: 0,
        scaleX: 1,
        scaleY: 1,
      };
      const def = (CONTROL_DEFS.wavetable || []).find((item) => item.id === param);
      if (def) {
        if (param === 'edgeFade') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFadeThreshold: 50, edgeFadeMode: 'both' },
            def,
          };
        }
        if (param === 'edgeFadeThreshold') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFade: 100, edgeFadeMode: 'both' },
            def,
          };
        }
        if (param === 'edgeFadeFeather') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFade: 100, edgeFadeThreshold: 50, edgeFadeMode: 'both' },
            def,
          };
        }
        if (param === 'edgeFadeMode') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, edgeFade: 100, edgeFadeThreshold: 40 },
            def,
          };
        }
        if (param === 'verticalFade') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFadeThreshold: 50, verticalFadeMode: 'both' },
            def,
          };
        }
        if (param === 'verticalFadeThreshold') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFade: 100, verticalFadeMode: 'both' },
            def,
          };
        }
        if (param === 'verticalFadeFeather') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFade: 100, verticalFadeThreshold: 50, verticalFadeMode: 'both' },
            def,
          };
        }
        if (param === 'verticalFadeMode') {
          return {
            type: 'wavetable',
            baseParams: { ...waveBase, verticalFade: 100, verticalFadeThreshold: 40 },
            def,
          };
        }
      }
    }

    if (group === 'phylla') {
      const phyBase = {
        ...(ALGO_DEFAULTS && ALGO_DEFAULTS.phylla ? ALGO_DEFAULTS.phylla : baseParams),
        seed: 1234,
        posX: 0,
        posY: 0,
        scaleX: 1,
        scaleY: 1,
      };
      const def = (CONTROL_DEFS.phylla || []).find((item) => item.id === param);
      if (def && (param === 'sides' || param === 'sideJitter')) {
        return {
          type: 'phylla',
          baseParams: { ...phyBase, shapeType: 'polygon' },
          def,
        };
      }
    }

    if (group === 'shapePack') {
      const shapeBase = {
        ...(ALGO_DEFAULTS && ALGO_DEFAULTS.shapePack ? ALGO_DEFAULTS.shapePack : baseParams),
        seed: 1234,
        posX: 0,
        posY: 0,
        scaleX: 1,
        scaleY: 1,
      };
      const def = (CONTROL_DEFS.shapePack || []).find((item) => item.id === param);
      if (def) {
        if (param === 'segments' || param === 'rotationStep') {
          return {
            type: 'shapePack',
            baseParams: { ...shapeBase, shape: 'polygon' },
            def,
          };
        }
        if (param === 'perspectiveType') {
          return {
            type: 'shapePack',
            baseParams: { ...shapeBase, shape: 'polygon', perspective: 0.6 },
            def,
          };
        }
        if (param === 'perspective' || param === 'perspectiveX' || param === 'perspectiveY') {
          return {
            type: 'shapePack',
            baseParams: { ...shapeBase, shape: 'polygon', perspectiveType: 'radial', perspective: 0.6 },
            def,
          };
        }
      }
    }

    const defs = CONTROL_DEFS[group];
    if (!defs) return null;
    const def = defs.find((item) => item.id === param);
    if (!def) return null;
    const algoParams = {
      ...(ALGO_DEFAULTS && ALGO_DEFAULTS[group] ? ALGO_DEFAULTS[group] : baseParams),
      seed: 1234,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
    };
    return {
      type: group,
      baseParams: algoParams,
      def,
    };
  };

  const buildPreviewPair = (key, ui) => {
    const config = resolvePreviewConfig(key, ui);
    if (!config) return '';
    let variants = config.variants;
    if (!variants && config.def) variants = buildVariantsFromDef(config.def);
    if (config.customVariants) variants = config.customVariants;
    if (!variants || variants.length < 2) return '';

    const items = variants.map((variant) => {
      const type = variant.type || config.type;
      const params = variant.params || { ...config.baseParams, ...(variant.overrides || {}) };
      const svg = renderPreviewSvg(type, params, {
        margin: variant.bounds?.margin,
        strokeWidth: variant.strokeWidth,
      });
      return `
        <div class="modal-illustration">
          <div class="modal-ill-label">${variant.label}</div>
          ${svg}
        </div>
      `;
    });

    return `
      <div class="modal-illustrations">
        ${items.join('')}
      </div>
    `;
  };

  const isPrimitiveShapeLayer = (layer) => {
    if (!layer || layer.isGroup || layer.type !== 'shape') return false;
    const sources = layer.sourcePaths;
    if (!Array.isArray(sources) || sources.length !== 1) return false;
    const meta = sources[0]?.meta;
    if (!meta) return false;
    if (meta.kind === 'circle') return true;
    if (meta.kind === 'shape') {
      const t = meta.shape?.type;
      return t === 'rect' || t === 'oval' || t === 'polygon';
    }
    return false;
  };

  class UI {
    constructor(app) {
      this.app = app;
      this.controls = CONTROL_DEFS;
      this.modal = this.createModal();
      this._modalCleanup = null;
      this.openPenMenu = null;
      this.openPaletteMenu = null;
      this.inlinePetalDesigner = null;
      this.layerListOrder = [];
      this.lastLayerClickId = null;
      this.globalSectionCollapsed = false;
      this.armedPenId = null;
      this.activeTool = SETTINGS.activeTool || 'select';
      this.scissorMode = SETTINGS.scissorMode || 'line';
      this.penMode = SETTINGS.penMode || 'draw';
      this.shapeMode = SETTINGS.shapeMode || 'oval';
      this.spacePanActive = false;
      this.previousTool = this.activeTool;
      this.harmonographPlotterState = null;
      this.isApplyingAutoColorization = false;
      this.pendingAutoColorizationOptions = null;
      this.autoColorizationStatusEl = null;
      this.topMenuTriggers = [];
      this.openTopMenuTrigger = null;
      this.petalDesignerProfiles = [];
      this.petalDesignerProfilesLoaded = false;
      this.petalDesignerProfilesLoading = null;
      this.lastDrawableLayerType = null;
      this.exportModalState = null;

      this.initModuleDropdown();
      this.rememberDrawableLayerType(this.app.engine?.getActiveLayer?.());
      // Phase 3 step 3: mount Document Setup panel BEFORE initMachineDropdown
      // so #machine-profile (the paper-size <select>) is in the DOM when the
      // dropdown population logic runs. Markup formerly lived in
      // index.html:540-745.
      this._mountDocumentSetupPanel();
      this.initMachineDropdown();
      // Phase 3 step 2: mount Grid Settings panel into <main> before bindGlobal()
      // wires the panel's controls. Markup formerly lived in index.html:747-787.
      this._mountGridSettingsPanel();
      this.bindGlobal();
      this.bindShortcuts();
      this.bindInfoButtons();
      // Phase 3 closure: activate the window-level drag-drop router.
      // Routes .vectura → openVecturaFile, .svg → importSvgFile.
      try {
        window.Vectura?.UI?.Menus?.DragDropRouter?.attach?.(this);
      } catch (_) { /* missing module is non-fatal */ }
      // Phase 4: surface indeterminate progress bar for engine.generate calls
      // that exceed ~200 ms (large algorithm regenerations).
      try {
        window.Vectura?.UI?.Menus?.EngineProgressTap?.attach?.(this);
      } catch (_) { /* missing module is non-fatal */ }
      this.initLeftPanelSections();
      this.initAboutSection();
      this.initAlgorithmTransformSection();
      this.initTouchModifierBar();
      this.initTouchMouseBridge();
      this.initTopMenuBar();
      document.addEventListener('click', () => {
        if (this.openPenMenu) {
          this.openPenMenu.classList.add('hidden');
          this.openPenMenu = null;
        }
        if (this.openPaletteMenu) {
          this.openPaletteMenu.classList.add('hidden');
          this.openPaletteMenu = null;
        }
        this.setTopMenuOpen(null, false);
      });
      this.initPaneToggles();
      this.initBottomPaneToggle();
      this.initBottomPaneResizer();
      this.initPaneResizers();
      this.initToolBar();
      this.initRightPaneTabs();
      this.initPensSection();
      this.renderLayers();
      this.renderPens();
      this.initPaletteControls();
      this.initAutoColorizationPanel();
      this.buildControls();
      this.updateFormula();
      this.initSettingsValues();
      this.attachStaticInfoButtons();

    }

    getOptimizationTargets() {
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

    getOptimizationTargetIds() {
      return new Set(this.getOptimizationTargets().map((layer) => layer.id));
    }

    optimizeTargetsForCurrentScope(options = {}) {
      const targets = this.getOptimizationTargets();
      const targetIds = new Set(targets.map((layer) => layer.id));
      if (!targets.length) return { targets, targetIds, config: null, map: new Map() };
      const runOptions = { ...options };
      if (!runOptions.config && targets.length > 1) {
        runOptions.config = clone(this.app.engine.ensureLayerOptimization(targets[0]));
      }
      const map = this.app.optimizeLayers(targets, runOptions);
      return {
        targets,
        targetIds,
        config: runOptions.config || null,
        map,
      };
    }

    // export-svg methods (buildExportPreviewPath, buildExportClipPolygons,
    // fitExportPreview, resizeExportPreviewCanvas, renderExportPreview,
    // decorateExportControlsPanel, syncLegendSettingsControls,
    // attachExportInfoButtons, openExportModal) are installed onto
    // UI.prototype by Modals.ExportSvg.installOn() at IIFE bottom.

    // bottom-pane methods (toggleSettingsPanel, initBottomPaneToggle,
    // initBottomPaneResizer), menubar (setTopMenuOpen, initTopMenuBar,
    // triggerTopMenuAction), and theme-switcher (refreshThemeUi) are
    // installed onto UI.prototype by their satellites' installOn() calls
    // at IIFE bottom.

    // persistence methods (scrollLayerToTop, captureLeftPanelScrollPosition,
    // initSettingsValues→applyPersistedSettings) are installed onto
    // UI.prototype by Persistence.installOn() at IIFE bottom.

    // createModal, openModal, closeModal, _mountGridSettingsPanel,
    // _mountDocumentSetupPanel are installed onto UI.prototype by
    // UI.overlays.Modal.installOn() at IIFE bottom (Meridian Unit 1.7 —
    // promoted modal.js to the modal primitive that mounts all centered
    // modals).
    //
    // openColorModal is installed onto UI.prototype by ColorPicker.installOn().

    // pane-left methods (getLeftSectionDefaults, getLeftSectionMap,
    // setLeftSectionCollapsed, initLeftPanelSections,
    // setAlgorithmTransformCollapsed, initAlgorithmTransformSection,
    // setAboutVisible, initAboutSection) are installed onto UI.prototype
    // by PaneLeft.installOn() at IIFE bottom.

    // help-shortcuts methods (buildHelpContent, _applyHelpPlatform, openHelp)
    // are installed onto UI.prototype by HelpShortcuts.installOn().
    // _bindGridSettingsHandlers and _bindDocumentSetupHandlers are installed
    // by GridSettings.installOn() and DocumentSetup.installOn() respectively.

    // transform-panel methods (getDefaultTransformForType, storeLayerParams,
    // restoreLayerParams) are installed onto UI.prototype by
    // TransformPanel.installOn() at IIFE bottom.

    recenterLayerIfNeeded(layer) {
      if (!layer || !this.app.renderer) return;
      const bounds = this.app.renderer.getLayerBounds(layer);
      if (!bounds) return;
      const prof = this.app.engine.currentProfile;
      const inset = SETTINGS.truncate ? SETTINGS.margin : 0;
      const limitLeft = inset;
      const limitRight = prof.width - inset;
      const limitTop = inset;
      const limitBottom = prof.height - inset;
      const corners = Object.values(bounds.corners || {});
      if (!corners.length) return;
      const minX = Math.min(...corners.map((pt) => pt.x));
      const maxX = Math.max(...corners.map((pt) => pt.x));
      const minY = Math.min(...corners.map((pt) => pt.y));
      const maxY = Math.max(...corners.map((pt) => pt.y));
      const boundsW = maxX - minX;
      const boundsH = maxY - minY;
      const availableW = limitRight - limitLeft;
      const availableH = limitBottom - limitTop;
      let shiftX = 0;
      let shiftY = 0;

      if (boundsW > availableW) {
        shiftX = (limitLeft + limitRight) / 2 - (minX + maxX) / 2;
      } else {
        if (minX < limitLeft) shiftX = limitLeft - minX;
        if (maxX + shiftX > limitRight) shiftX = limitRight - maxX;
      }

      if (boundsH > availableH) {
        shiftY = (limitTop + limitBottom) / 2 - (minY + maxY) / 2;
      } else {
        if (minY < limitTop) shiftY = limitTop - minY;
        if (maxY + shiftY > limitBottom) shiftY = limitBottom - maxY;
      }

      if (Math.abs(shiftX) > 0.001 || Math.abs(shiftY) > 0.001) {
        layer.params.posX += shiftX;
        layer.params.posY += shiftY;
        window.Vectura?.PaintBucketOps?.translateLayerFills?.(layer, shiftX, shiftY);
        this.app.engine.generate(layer.id);
      }
    }


    toggleSeedControls(type) {
      const seedControls = getEl('seed-controls');
      const show = usesSeed(type);
      if (seedControls) seedControls.style.display = show ? '' : 'none';
      const label = getEl('transform-label');
      if (label) label.textContent = show ? 'Transform & Seed' : 'Transform';
    }

    isDuplicateLayerName(name, excludeId) {
      const normalized = name.trim().toLowerCase();
      return this.app.engine.layers.some(
        (layer) => layer.id !== excludeId && layer.name.trim().toLowerCase() === normalized
      );
    }

    getLayerById(id) {
      return this.app.engine.layers.find((layer) => layer.id === id) || null;
    }

    isModifierLayer(layer) {
      return isModifierLayer(layer);
    }

    getModifierState(layer) {
      if (!this.isModifierLayer(layer)) return null;
      if (!layer.modifier) {
        layer.modifier = createModifierState('mirror', {
          mirrors: [createMirrorLine(0)],
        });
      }
      if (!Array.isArray(layer.modifier.mirrors)) layer.modifier.mirrors = [];
      if (layer.modifier.guidesVisible === undefined) layer.modifier.guidesVisible = true;
      if (layer.modifier.guidesLocked === undefined) layer.modifier.guidesLocked = false;
      if (layer.modifier.enabled === undefined) layer.modifier.enabled = true;
      return layer.modifier;
    }

    assignLayersToParent(parentId, targetLayers, options = {}) {
      const layers = (targetLayers || []).filter((layer) => layer && layer.id !== parentId);
      if (!layers.length) return [];
      const { selectAssigned = false, primaryId = null, captureHistory = false } = options;
      const parent = this.getLayerById(parentId);
      if (!parent || !this.canLayerAcceptChildren(parent)) return [];
      const moveIds = layers
        .filter((layer) => !(layer.isGroup && this.isDescendant(parentId, layer.id)))
        .map((layer) => layer.id);
      if (!moveIds.length) return [];

      if (captureHistory && this.app.pushHistory) this.app.pushHistory();
      if (parent.isGroup) parent.groupCollapsed = false;
      const moveSet = new Set(moveIds);
      const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
      const remaining = this.app.engine.layers.filter((layer) => !moveSet.has(layer.id));
      moveIds.forEach((id) => {
        const layer = map.get(id);
        if (layer) layer.parentId = parentId;
      });
      const insertIndex = remaining.findIndex((layer) => layer.id === parentId);
      const engineInsert = insertIndex === -1 ? remaining.length : insertIndex;
      const moveEngineOrder = moveIds.slice().reverse().map((id) => map.get(id)).filter(Boolean);
      remaining.splice(engineInsert, 0, ...moveEngineOrder);
      this.app.engine.reorderLayers(remaining);
      this.normalizeGroupOrder();
      this.app.computeDisplayGeometry();

      if (this.isModifierLayer(parent) && parent.modifier?.type === 'mirror') {
        moveIds.forEach((id) => this.layerLockedIds.add(id));
      }

      if (selectAssigned) {
        const ids = moveIds.slice();
        const nextPrimary = ids.includes(primaryId) ? primaryId : ids[ids.length - 1] || parentId;
        this.app.setSelection(ids.length ? ids : [parentId], nextPrimary);
        this.app.engine.setActiveLayerId(nextPrimary || parentId || null);
      }

      return moveIds.map((id) => map.get(id)).filter(Boolean);
    }

    unlockMirrorChildrenOnDelete(layerId) {
      const engine = this.app?.engine;
      if (!engine || !this.layerLockedIds) return;
      const layer = engine.layers.find((l) => l.id === layerId);
      if (!layer || !this.isModifierLayer(layer) || layer.modifier?.type !== 'mirror') return;
      const cascade = (pid) => {
        engine.layers.filter((l) => l.parentId === pid).forEach((c) => {
          this.layerLockedIds.delete(c.id);
          cascade(c.id);
        });
      };
      cascade(layerId);
    }

    // Delegated to src/ui/panels/layers-panel.js (assignLayersToRoot, groupSelection, ungroupSelection).
    // modifiers-panel methods (refreshModifierLayer, insertMirrorModifier,
    // updatePrimaryPanelMode, refreshMaskingViews, ensureLayerMaskState,
    // setLayerMaskEnabled, setLayerMaskHidden) and algorithm-panel methods
    // (syncPrimaryModuleDropdown, isModifierType, isDrawableLayerType,
    // rememberDrawableLayerType, getPreferredNewLayerType) are installed onto
    // UI.prototype by their satellites' installOn() calls at IIFE bottom.

    // pens-panel methods (setArmedPen, clearArmedPen, refreshArmedPenUI,
    // getPaletteList, getActivePalette, applyPaletteToPens, addPen, removePen,
    // initPaletteControls, renderPens, getPenById, applyArmedPenToLayers) are
    // installed onto UI.prototype by PensPanel.installOn() at IIFE bottom.

    shouldLeaveParentScope(layer, prevId, nextId, selectedIds = new Set()) {
      if (!layer?.parentId || selectedIds.has(layer.parentId)) return false;
      const prevLayer = prevId ? this.getLayerById(prevId) : null;
      const nextLayer = nextId ? this.getLayerById(nextId) : null;
      const previousMatchesParent = prevId === layer.parentId || prevLayer?.parentId === layer.parentId;
      const nextMatchesParent = nextLayer?.parentId === layer.parentId;
      return !(previousMatchesParent || nextMatchesParent);
    }

    isDescendant(targetId, ancestorId) {
      let current = this.getLayerById(targetId);
      while (current && current.parentId) {
        if (current.parentId === ancestorId) return true;
        current = this.getLayerById(current.parentId);
      }
      return false;
    }

    normalizeGroupOrder() {
      const layers = this.app.engine.layers;
      const parents = layers.filter((layer) => this.canLayerAcceptChildren(layer));
      const parentIds = new Set(parents.map((parent) => parent.id));
      const childrenMap = new Map();
      layers.forEach((layer) => {
        if (layer.parentId && parentIds.has(layer.parentId)) {
          if (!childrenMap.has(layer.parentId)) childrenMap.set(layer.parentId, []);
          childrenMap.get(layer.parentId).push(layer);
        }
      });
      const getDescendants = (parentId) => {
        const children = childrenMap.get(parentId) || [];
        const ids = [];
        children.forEach((child) => {
          ids.push(child.id);
          if (parentIds.has(child.id)) ids.push(...getDescendants(child.id));
        });
        return ids;
      };
      parents.forEach((parent) => {
        const descendantIds = getDescendants(parent.id);
        if (!descendantIds.length) return;
        const childIndexes = descendantIds
          .map((id) => layers.findIndex((layer) => layer.id === id))
          .filter((idx) => idx >= 0);
        if (!childIndexes.length) return;
        const maxIndex = Math.max(...childIndexes);
        const currentIndex = layers.findIndex((layer) => layer.id === parent.id);
        if (currentIndex === -1) return;
        if (currentIndex === maxIndex + 1) return;
        const [movedParent] = layers.splice(currentIndex, 1);
        const insertIndex = Math.min(maxIndex + 1, layers.length);
        layers.splice(insertIndex, 0, movedParent || parent);
      });
    }

    moveSelectedLayers(direction) {
      const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []).filter((id) => {
        const layer = this.getLayerById(id);
        return layer && !layer.isGroup;
      });
      if (!selectedIds.length) return false;
      const order = this.app.engine.layers.map((layer) => layer.id);
      const selected = new Set(selectedIds);
      const beforeOrder = order.slice();
      if (direction === 'top' || direction === 'bottom') {
        const keep = order.filter((id) => !selected.has(id));
        const moving = order.filter((id) => selected.has(id));
        const next = direction === 'top' ? [...keep, ...moving] : [...moving, ...keep];
        const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
        this.app.engine.layers = next.map((id) => map.get(id)).filter(Boolean);
      } else if (direction === 'up') {
        for (let i = order.length - 2; i >= 0; i--) {
          if (selected.has(order[i]) && !selected.has(order[i + 1])) {
            [order[i], order[i + 1]] = [order[i + 1], order[i]];
          }
        }
        const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
        this.app.engine.layers = order.map((id) => map.get(id)).filter(Boolean);
      } else if (direction === 'down') {
        for (let i = 1; i < order.length; i++) {
          if (selected.has(order[i]) && !selected.has(order[i - 1])) {
            [order[i - 1], order[i]] = [order[i], order[i - 1]];
          }
        }
        const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
        this.app.engine.layers = order.map((id) => map.get(id)).filter(Boolean);
      }
      const changed = beforeOrder.some((id, index) => id !== this.app.engine.layers[index]?.id);
      if (!changed) return false;
      this.normalizeGroupOrder();
      this.renderLayers();
      this.app.render();
      const scrollTargetId = this.app.renderer?.selectedLayerId || selectedIds[selectedIds.length - 1] || null;
      if (scrollTargetId) {
        window.requestAnimationFrame(() => this.scrollLayerToTop(scrollTargetId));
      }
      return true;
    }

    duplicateLayers(targetLayers, options = {}) {
      const { select = true } = options;
      const targets = targetLayers || [];
      if (!targets.length) return [];
      if (this.app.pushHistory) this.app.pushHistory();
      
      const targetIds = new Set(targets.map(l => l.id));
      const filteredTargets = targets.filter((layer) => {
        let pId = layer.parentId;
        while (pId) {
          if (targetIds.has(pId)) return false;
          const pLayer = this.app.engine.layers.find(l => l.id === pId);
          pId = pLayer ? pLayer.parentId : null;
        }
        return true;
      });

      const order = this.app.engine.layers.map((layer) => layer.id);
      const sorted = filteredTargets
        .slice()
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

      const duplicates = [];
      const duplicateDescendants = [];
      sorted.forEach((layer) => {
        const dup = this.app.engine.duplicateLayer(layer.id);
        if (dup) {
          duplicates.push(dup);
          if (dup.isGroup) {
            const getDesc = (pid) => {
              const out = [];
              this.app.engine.layers.forEach(l => {
                if (l.parentId === pid) {
                  out.push(l);
                  out.push(...getDesc(l.id));
                }
              });
              return out;
            };
            duplicateDescendants.push(...getDesc(dup.id));
          }
        }
      });
      
      const allDups = [...duplicates, ...duplicateDescendants];
      if (allDups.length && select && this.app.renderer) {
        const ids = allDups.map((layer) => layer.id);
        const nonGroupIds = allDups.filter(l => !l.isGroup).map(l => l.id);
        const primary = nonGroupIds[nonGroupIds.length - 1] || ids[ids.length - 1] || null;
        this.app.renderer.setSelection(ids, primary);
      }
      this.renderLayers();
      this.buildControls();
      this.app.render();
      return duplicates;
    }

    getLayerChildren(layerId) {
      return (this.app.engine.layers || []).filter((layer) => layer?.parentId === layerId);
    }

    getLayerDescendants(layerId) {
      const out = [];
      const visit = (parentId) => {
        this.getLayerChildren(parentId).forEach((child) => {
          out.push(child);
          visit(child.id);
        });
      };
      visit(layerId);
      return out;
    }

    canLayerAcceptChildren(layer) {
      if (!layer) return false;
      if (layer.isGroup) return true;
      return Boolean(layer.maskCapabilities?.canSource);
    }

    getUniqueLayerName(base, excludeId) {
      const clean = base.trim() || 'Layer';
      if (!this.isDuplicateLayerName(clean, excludeId)) return clean;
      let count = 2;
      let next = `${clean} ${count}`;
      while (this.isDuplicateLayerName(next, excludeId)) {
        count += 1;
        next = `${clean} ${count}`;
      }
      return next;
    }

    // info-modals methods (showDuplicateNameError, showValueError, showInfo,
    // attachInfoButton, attachStaticInfoButtons, bindInfoButtons) are installed
    // onto UI.prototype by InfoModals.installOn().

    // header methods (initModuleDropdown, _buildModuleMenu, _showModuleMenu,
    // _syncModuleDisplay, initMachineDropdown), pane-right (initRightPaneTabs,
    // initPensSection), workspace (initPaneToggles, initPaneResizers),
    // bottom-pane (initBottomPaneToggle, initBottomPaneResizer), and toolbar
    // (updateLightSourceTool, initToolBar) are installed onto UI.prototype by
    // their satellites' installOn() calls at IIFE bottom.

    bindGlobal() {
      this.layerLockedIds  = new Set();
      this.layerSearchQ    = '';
      this.layerFilterType = 'all';
      this.layerFilterOpen = false;
      this.layerAddOpen    = false;
      this._lvlDblId       = null;
      this._lvlDblTime     = 0;
      // Phase 3 step 3: settings-panel + btn-settings + btn-close-settings
      // wiring moved to modals/document-setup.js (invoked via
      // _bindDocumentSetupHandlers below). No locals needed here.
      //
      // Meridian Unit 1.9a (2026-05-20): the ~30 Document Setup input
      // handlers (machine-profile, set-*, paper W/H, orientation, plotter
      // opt, undo, etc.) moved to modals/document-setup.js's
      // bindDocumentSetupListeners(). Their local lookups moved with them.
      //
      // Meridian Unit 1.9b (2026-05-20): remaining bindGlobal() handlers
      // swept into per-satellite installers. The element lookups below
      // moved with each handler:
      //   - layer-list buttons + palette picker → LayersPanel.bindLayerListListeners
      //   - inp-bg-color + bg-color-pill        → DocumentSetup.bindBgColorListeners
      //   - btn-export                          → ExportSvg.bindExportButton
      //   - btn-save / btn-open / btn-import    → UI.FileIO.bindFileIoListeners
      //   - module dropdown + transform inputs  → AlgoConfigPanel.bindAlgoConfigListeners
      //   - theme-toggle                        → ThemeSwitcher.bindThemeToggle
      //   - btn-help / btn-tour / btn-reset-view → Header.bindHeaderChromeListeners

      // Phase 3 step 3: open/close lifecycle moved to modals/document-setup.js.
      // Both onclick handlers forward to this.toggleSettingsPanel(). Guarded so
      // that bindGlobal() invoked through a stub `this` (used by some unit
      // tests) keeps working without mocking the delegator.
      if (typeof this._bindDocumentSetupHandlers === 'function') {
        this._bindDocumentSetupHandlers();
      }
      // Meridian Unit 1.9a (2026-05-20): grouped install for the ~30 Document
      // Setup input handlers (set-* inputs, paper W/H, orientation, plotter
      // physics, undo, machine-profile, etc.). Guarded for stub-`this` unit
      // tests, identical pattern as _bindDocumentSetupHandlers above.
      if (typeof this.bindDocumentSetupListeners === 'function') {
        this.bindDocumentSetupListeners();
      }

      // Phase 3 step 2: grid-settings panel handlers delegated to
      // src/ui/modals/grid-settings.js. The module owns the panel markup
      // (mounted earlier via _mountGridSettingsPanel) and wires the open
      // trigger, close button, and six grid control inputs. Guarded so
      // unit-test stubs of `this` that don't materialize the prototype
      // method (e.g. crop-exports-settings.test.js) still proceed past
      // this line — the controls those tests exercise live further below.
      if (typeof this._bindGridSettingsHandlers === 'function') {
        this._bindGridSettingsHandlers();
      }

      // ── Meridian Unit 1.9b (2026-05-20) ─────────────────────────────
      // Single-line invocations of each grouped satellite installer.
      // Each is stub-`this` guarded for the legacy unit-test entry point
      // that calls bindGlobal() against a plain object — those tests
      // exercise specific input handlers further down (currently none
      // left here), so we only invoke installers when they were attached
      // to the prototype by the satellite's own installOn().
      if (typeof this.bindLayerListListeners === 'function') {
        this.bindLayerListListeners();
      }
      if (typeof this.bindBgColorListeners === 'function') {
        this.bindBgColorListeners();
      }
      if (typeof this.bindAlgoConfigListeners === 'function') {
        this.bindAlgoConfigListeners();
      }
      if (typeof this.bindThemeToggle === 'function') {
        this.bindThemeToggle();
      }
      if (typeof this.bindHeaderChromeListeners === 'function') {
        this.bindHeaderChromeListeners();
      }
      if (typeof this.bindExportButton === 'function') {
        this.bindExportButton();
      }
      if (typeof this.bindFileIoListeners === 'function') {
        this.bindFileIoListeners();
      }
    }

    // triggerTopMenuAction is installed onto UI.prototype by
    // MenuBar.installOn() at IIFE bottom.

    // shortcuts methods (handleTopMenuShortcut, bindShortcuts) are installed
    // onto UI.prototype by Shortcuts.installOn().

    // _lvl* layer-list action methods are installed onto UI.prototype by
    // LayersPanel.installOn() (Phase 2 step 4).

    // Delegated to src/ui/panels/layers-panel.js (Phase 2 step 4).
    renderLayers() {
      const result = window.Vectura.UI.LayersPanel.renderLayers.call(this);
      // Phase 3 closure: re-attach right-click context menu handler each render.
      // Idempotent — guarded by attach()'s _attached flag.
      try {
        if (window.Vectura?.UI?.Menus?.LayerContext?.attach) {
          window.Vectura.UI.Menus.LayerContext.attach(this);
        }
      } catch (_) { /* missing menu module is non-fatal */ }
      return result;
    }

    expandLayer(layer, options = {}) {
      if (!layer || layer.isGroup) return;
      if (isPrimitiveShapeLayer(layer)) return;
      const isEffLocked = (id) => {
        if (this.layerLockedIds?.has(id)) return true;
        let l = this.app.engine.getLayerById?.(id);
        while (l?.parentId) {
          if (this.layerLockedIds?.has(l.parentId)) return true;
          l = this.app.engine.getLayerById?.(l.parentId);
        }
        return false;
      };
      if (isEffLocked(layer.id)) return;
      if (!Layer) return;
      const { skipHistory = false, returnChildren = false, suppressRender = false, selectChildren = true } = options;
      if (!skipHistory && this.app.pushHistory) this.app.pushHistory();
      if (!layer.paths || !layer.paths.length) {
        this.app.engine.generate(layer.id);
      }
      if (!layer.paths || !layer.paths.length) return;

      const groupId = layer.id;
      const baseName = layer.name;
      const pad = String(layer.paths.length).length;
      const pathMeta = layer.paths.map((path, index) => {
        let minX = Infinity;
        let minY = Infinity;
        const metaGroup = path?.meta?.group;
        const metaLabel = path?.meta?.label;
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const rx = path.meta.rx ?? path.meta.r ?? 0;
          const ry = path.meta.ry ?? path.meta.r ?? 0;
          minX = cx - rx;
          minY = cy - ry;
        } else if (Array.isArray(path)) {
          path.forEach((pt) => {
            if (!pt) return;
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
          });
        }
        if (!Number.isFinite(minX)) minX = 0;
        if (!Number.isFinite(minY)) minY = 0;
        return { path, index, minX, minY, group: metaGroup, label: metaLabel };
      });

      pathMeta.sort((a, b) => {
        if (a.minY !== b.minY) return a.minY - b.minY;
        if (a.minX !== b.minX) return a.minX - b.minX;
        return a.index - b.index;
      });

      const groupNodes = new Map();
      const children = pathMeta.map((entry, index) => {
        const newId = Math.random().toString(36).slice(2, 11);
        const child = new Layer(newId, 'shape', `${baseName} - Line ${String(index + 1).padStart(pad, '0')}`);
        child.parentId = groupId;
        child.params.seed = 0;
        child.params.posX = 0;
        child.params.posY = 0;
        child.params.scaleX = 1;
        child.params.scaleY = 1;
        child.params.rotation = 0;
        child.params.curves = Boolean(layer.params.curves);
        child.params.smoothing = 0;
        child.params.simplify = 0;
        child.sourcePaths = [clonePath(entry.path)];
        child.penId = layer.penId;
        child.color = layer.color;
        child.strokeWidth = layer.strokeWidth;
        child.lineCap = layer.lineCap;
        child.visible = layer.visible;
        if (entry.group) {
          let groupNode = groupNodes.get(entry.group);
          if (!groupNode) {
            const groupId = Math.random().toString(36).slice(2, 11);
            groupNode = new Layer(groupId, 'group', entry.group);
            groupNode.isGroup = true;
            groupNode.groupType = 'group';
            groupNode.groupCollapsed = false;
            groupNode.visible = layer.visible;
            groupNode.parentId = layer.id;
            groupNode.penId = layer.penId;
            groupNode.color = layer.color;
            groupNode.strokeWidth = layer.strokeWidth;
            groupNode.lineCap = layer.lineCap;
            groupNodes.set(entry.group, groupNode);
          }
          child.parentId = groupNode.id;
          if (entry.label) child.name = entry.label;
        } else if (entry.label) {
          child.name = entry.label;
        }
        return child;
      });

      layer.isGroup = true;
      layer.groupType = layer.type;
      layer.groupParams = clone(layer.params);
      layer.groupCollapsed = false;
      layer.type = 'group';
      layer.paths = [];
      layer.sourcePaths = null;
      layer.paramStates = {};
      // Groups are skipped by computeAllDisplayGeometry(), so cached geometry from
      // the pre-expansion type would otherwise be returned forever by getRenderablePaths().
      layer.effectivePaths = [];
      layer.displayPaths = [];
      layer.optimizedPaths = null;
      layer.effectiveStats = null;
      layer.displayStats = null;

      const idx = this.app.engine.layers.findIndex((l) => l.id === groupId);
      const orderedItems = [];
      const seenGroups = new Set();
      pathMeta.forEach((entry, idx) => {
        const child = children[idx];
        if (entry.group) {
          const groupNode = groupNodes.get(entry.group);
          if (groupNode && !seenGroups.has(groupNode.id)) {
            orderedItems.push(groupNode);
            seenGroups.add(groupNode.id);
          }
        }
        orderedItems.push(child);
      });
      const insertChildren = orderedItems.reverse();
      if (idx >= 0) {
        this.app.engine.layers.splice(idx + 1, 0, ...insertChildren);
      } else {
        this.app.engine.layers.push(...insertChildren);
      }

      children.forEach((child) => this.app.engine.generate(child.id));
      if (selectChildren) {
        this.app.engine.activeLayerId = layer.id;
        if (this.app.renderer) this.app.renderer.setSelection([layer.id], layer.id);
      }
      if (!suppressRender) {
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
      }
      if (returnChildren) return children;
    }

    // createManualLayerFromPath is installed onto UI.prototype by
    // LayersPanel.installOn() (Meridian Unit 1.8).

    getGroupDescendants(groupId) {
      const out = [];
      const walk = (id) => {
        this.app.engine.layers.forEach((layer) => {
          if (layer.parentId !== id) return;
          if (layer.isGroup) {
            walk(layer.id);
          } else {
            out.push(layer);
          }
        });
      };
      walk(groupId);
      return out;
    }

    splitShapeLayer(layer, segments) {
      if (!Layer || !layer || !segments || !segments.length) return [];
      const engine = this.app.engine;
      const idx = engine.layers.findIndex((l) => l.id === layer.id);
      const pad = String(segments.length).length;
      const children = segments.map((seg, i) => {
        const newId = Math.random().toString(36).slice(2, 11);
        const child = new Layer(newId, 'shape', `${layer.name} Cut ${String(i + 1).padStart(pad, '0')}`);
        child.parentId = layer.parentId;
        child.params.seed = 0;
        child.params.posX = 0;
        child.params.posY = 0;
        child.params.scaleX = 1;
        child.params.scaleY = 1;
        child.params.rotation = 0;
        child.params.curves = Boolean(layer.params.curves);
        child.params.smoothing = 0;
        child.params.simplify = 0;
        child.sourcePaths = [seg.map((pt) => ({ x: pt.x, y: pt.y }))];
        child.penId = layer.penId;
        child.color = layer.color;
        child.strokeWidth = layer.strokeWidth;
        child.lineCap = layer.lineCap;
        child.visible = layer.visible;
        return child;
      });
      if (idx >= 0) {
        engine.layers.splice(idx, 1, ...children);
      } else {
        engine.layers.push(...children);
      }
      children.forEach((child) => engine.generate(child.id));
      return children;
    }

    // applyScissor is installed onto UI.prototype by
    // AlgorithmPanel.installOn() (Meridian Unit 1.8).

    startLightSourcePlacement() {
      if (!this.app.renderer) return;
      this.setActiveTool?.('select');
      this.app.renderer.setLightSourceMode?.(true);
    }

    // image-asset methods (loadNoiseImageFile, openNoiseImageModal) are
    // installed onto UI.prototype by ImageAsset.installOn().

    // computeHarmonographPlotterData + mountHarmonographPlotter are
    // installed onto UI.prototype by AlgorithmPanel.installOn() (Meridian Unit 1.8).

    _showWelcomePanel(show) {
      const welcome = document.getElementById('left-welcome');
      const sections = document.querySelector('.left-panel-sections');
      if (welcome) welcome.style.display = show ? '' : 'none';
      if (sections) sections.style.display = show ? 'none' : '';
      if (show) {
        const hasLayers = (this.app.engine?.layers?.length ?? 0) > 0;
        const intro = document.getElementById('left-welcome-intro');
        const select = document.getElementById('left-welcome-select');
        if (intro) intro.style.display = hasLayers ? 'none' : '';
        if (select) select.style.display = hasLayers ? '' : 'none';
      }
    }

    // _buildPatternFillPanel + _applyPatternFillFromCanvas are installed
    // onto UI.prototype by FillPanel.installOn() (Meridian Unit 1.8).

    // buildControls (delegates to AlgoConfigPanel.buildControls) and
    // updateFormula (delegates to FormulaPanel.updateFormula) are installed
    // onto UI.prototype by AlgoConfigPanel.installOn() and
    // FormulaPanel.installOn() respectively.

    // ── Pattern Designer ── (see ui-pattern-designer.js)
  }

  Object.assign(UI.prototype, window.Vectura._UITouchMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIDocumentUnitsMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIRandomizationMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIPatternDesignerMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIPetalDesignerMixin || {});
  // Phase 3 closure: noise-rack mixin dissolved into NoiseRackPanel.
  // The panel installs all noise-rack methods on UI.prototype below
  // (after bind()), replacing the old Object.assign(UI.prototype,
  // _UINoiseRackMixin) call. The mixin file (src/ui/ui-noise-rack.js)
  // was moved into panels/noise-rack-panel.js.
  Object.assign(UI.prototype, window.Vectura._UIFileIOMixin || {});
  // Meridian Unit 1.9b: register the file-I/O button installer that
  // ui-file-io.js exposes alongside the legacy mixin. Wires save/open/import
  // buttons previously inlined in bindGlobal().
  if (window.Vectura?.UI?.FileIO?.bind) {
    window.Vectura.UI.FileIO.bind({ getEl });
  }
  if (window.Vectura?.UI?.FileIO?.installOn) {
    window.Vectura.UI.FileIO.installOn(UI.prototype);
  }
  // Phase 3 closure: auto-colorize mixin dissolved into AutoColorizePanel.
  // The panel installs its 4 methods directly on UI.prototype below (after
  // bind()), replacing the old Object.assign(UI.prototype, _UIAutoColorizeMixin)
  // call. The mixin file (src/ui/ui-auto-colorize.js) was deleted.

  // Phase 2 step 2: hand legacy IIFE-locals to algo-config-panel.js so its
  // extracted buildControls() body sees the same closure-captured constants
  // it always has. Order matters: algo-config-panel.js loads BEFORE ui.js
  // (see index.html script tags), so window.Vectura.UI.AlgoConfigPanel is
  // already in place by the time this IIFE runs.
  if (window.Vectura?.UI?.AlgoConfigPanel?.bind) {
    window.Vectura.UI.AlgoConfigPanel.bind({
      // constants & data
      COMMON_CONTROLS,
      // OPTIMIZATION_STEPS now lives in modals/export-svg.js (Meridian Unit 1.3);
      // read it back through the public satellite namespace so algo-config-panel
      // keeps its DI shape unchanged.
      OPTIMIZATION_STEPS: window.Vectura?.UI?.Modals?.ExportSvg?.OPTIMIZATION_STEPS,
      IMAGE_NOISE_DEFAULT_AMPLITUDE,
      WAVE_NOISE_DEFS,
      RINGS_NOISE_DEFS,
      TOPO_NOISE_DEFS,
      FLOWFIELD_NOISE_DEFS,
      GRID_NOISE_DEFS,
      PHYLLA_NOISE_DEFS,
      PETALIS_DRIFT_NOISE_DEFS,
      PETALIS_MODIFIER_TYPES,
      PETALIS_PETAL_MODIFIER_TYPES,
      PETALIS_SHADING_TYPES,
      PETALIS_LINE_TYPES,
      PETALIS_PRESET_LIBRARY,
      TERRAIN_PRESET_LIBRARY,
      RINGS_PRESET_LIBRARY,
      TRANSFORM_KEYS,
      // DOM / value helpers
      getEl,
      escapeHtml,
      roundToStep,
      clone,
      clamp,
      attachKeyboardRangeNudge,
      formatValue,
      formatDisplayValue,
      getDisplayConfig,
      toDisplayValue,
      fromDisplayValue,
      getDisplayLabel,
      getContrastTextColor,
      openColorPickerAnchoredTo,
      // unit helpers
      getDocumentUnitLabel,
      mmToDocumentUnits,
      documentUnitsToMm,
      // modifier / petalis factories & predicates
      isModifierLayer,
      isPetalisLayerType,
      createPetalisModifier,
      createPetalModifier,
      createPetalisShading,
    });
  }
  if (window.Vectura?.UI?.AlgoConfigPanel?.installOn) {
    window.Vectura.UI.AlgoConfigPanel.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/theme-switcher.js so its
  // extracted refreshThemeUi() body sees the same `getEl` helper it always has.
  // Same load-order constraint as AlgoConfigPanel: theme-switcher.js loads
  // BEFORE ui.js (see index.html script tags).
  if (window.Vectura?.UI?.ThemeSwitcher?.bind) {
    window.Vectura.UI.ThemeSwitcher.bind({ getEl });
  }
  if (window.Vectura?.UI?.ThemeSwitcher?.installOn) {
    window.Vectura.UI.ThemeSwitcher.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/menubar.js so its
  // extracted setTopMenuOpen/initTopMenuBar/triggerTopMenuAction bodies see the
  // same `getEl` helper. Same load-order constraint as ThemeSwitcher: menubar.js
  // loads BEFORE ui.js (see index.html script tags).
  if (window.Vectura?.UI?.MenuBar?.bind) {
    window.Vectura.UI.MenuBar.bind({ getEl });
  }
  if (window.Vectura?.UI?.MenuBar?.installOn) {
    window.Vectura.UI.MenuBar.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/pane-left.js so its
  // extracted left-panel section methods see the same `getEl` helper.
  if (window.Vectura?.UI?.PaneLeft?.bind) {
    window.Vectura.UI.PaneLeft.bind({ getEl });
  }
  if (window.Vectura?.UI?.PaneLeft?.installOn) {
    window.Vectura.UI.PaneLeft.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/pane-right.js so its
  // extracted right-pane tab/section methods see the same `getEl` helper.
  if (window.Vectura?.UI?.PaneRight?.bind) {
    window.Vectura.UI.PaneRight.bind({ getEl });
  }
  if (window.Vectura?.UI?.PaneRight?.installOn) {
    window.Vectura.UI.PaneRight.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/workspace.js.
  if (window.Vectura?.UI?.Workspace?.bind) {
    window.Vectura.UI.Workspace.bind({ getEl });
  }
  if (window.Vectura?.UI?.Workspace?.installOn) {
    window.Vectura.UI.Workspace.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/bottom-pane.js.
  if (window.Vectura?.UI?.BottomPane?.bind) {
    window.Vectura.UI.BottomPane.bind({ getEl });
  }
  if (window.Vectura?.UI?.BottomPane?.installOn) {
    window.Vectura.UI.BottomPane.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/toolbar.js.
  if (window.Vectura?.UI?.Toolbar?.bind) {
    window.Vectura.UI.Toolbar.bind({ getEl, isPetalisLayerType });
  }
  if (window.Vectura?.UI?.Toolbar?.installOn) {
    window.Vectura.UI.Toolbar.installOn(UI.prototype);
  }

  // Phase 2 step 3: hand legacy IIFE-locals to shell/header.js.
  if (window.Vectura?.UI?.Header?.bind) {
    window.Vectura.UI.Header.bind({ getEl, ALGO_DEFAULTS, MACHINES, SETTINGS });
  }
  if (window.Vectura?.UI?.Header?.installOn) {
    window.Vectura.UI.Header.installOn(UI.prototype);
  }

  // Phase 2 step 4: hand legacy IIFE-locals to panels/formula-panel.js.
  if (window.Vectura?.UI?.FormulaPanel?.bind) {
    window.Vectura.UI.FormulaPanel.bind({ getEl, escapeHtml, usesSeed });
  }
  if (window.Vectura?.UI?.FormulaPanel?.installOn) {
    window.Vectura.UI.FormulaPanel.installOn(UI.prototype);
  }

  // Phase 3 closure: AutoColorizePanel — mixin dissolved. Bind the legacy
  // IIFE locals (SETTINGS, clamp, getEl) so the panel can read them, then
  // install the 4 methods directly on UI.prototype.
  if (window.Vectura?.UI?.AutoColorizePanel?.bind) {
    window.Vectura.UI.AutoColorizePanel.bind({
      SETTINGS,
      clamp,
      getEl,
    });
    if (window.Vectura.UI.AutoColorizePanel.installOn) {
      window.Vectura.UI.AutoColorizePanel.installOn(UI.prototype);
    }
  }

  // Phase 3 closure: NoiseRackPanel — mixin dissolved into the panel itself.
  // Bind sentinel deps then install all noise-rack methods on UI.prototype.
  if (window.Vectura?.UI?.NoiseRackPanel?.bind) {
    window.Vectura.UI.NoiseRackPanel.bind({});
    if (window.Vectura.UI.NoiseRackPanel.installOn) {
      window.Vectura.UI.NoiseRackPanel.installOn(UI.prototype);
    }
  }

  // Phase 2 step 4: hand legacy IIFE-locals to panels/transform-panel.js.
  if (window.Vectura?.UI?.TransformPanel?.bind) {
    window.Vectura.UI.TransformPanel.bind({ ALGO_DEFAULTS, TRANSFORM_KEYS, clone });
  }
  if (window.Vectura?.UI?.TransformPanel?.installOn) {
    window.Vectura.UI.TransformPanel.installOn(UI.prototype);
  }

  // Phase 2 step 4: hand legacy IIFE-locals to panels/layers-panel.js.
  // Meridian Unit 1.8: added `clone` for createManualLayerFromPath.
  // Meridian Unit 1.9b: added `getEl` for bindLayerListListeners (layer-list
  // buttons + layer-bar palette picker wiring).
  if (window.Vectura?.UI?.LayersPanel?.bind) {
    window.Vectura.UI.LayersPanel.bind({ SETTINGS, escapeHtml, Layer, clone, getEl });
  }
  if (window.Vectura?.UI?.LayersPanel?.installOn) {
    window.Vectura.UI.LayersPanel.installOn(UI.prototype);
  }

  // Phase 2 step 4: hand legacy IIFE-locals to panels/pens-panel.js.
  if (window.Vectura?.UI?.PensPanel?.bind) {
    window.Vectura.UI.PensPanel.bind({ getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken });
  }
  if (window.Vectura?.UI?.PensPanel?.installOn) {
    window.Vectura.UI.PensPanel.installOn(UI.prototype);
  }

  // Phase 2 step 4: hand legacy IIFE-locals to panels/modifiers-panel.js.
  if (window.Vectura?.UI?.ModifiersPanel?.bind) {
    window.Vectura.UI.ModifiersPanel.bind({ getEl });
  }
  if (window.Vectura?.UI?.ModifiersPanel?.installOn) {
    window.Vectura.UI.ModifiersPanel.installOn(UI.prototype);
  }

  // Phase 2 step 4: hand legacy IIFE-locals to panels/algorithm-panel.js.
  // Meridian Unit 1.8: added `getThemeToken` for mountHarmonographPlotter.
  if (window.Vectura?.UI?.AlgorithmPanel?.bind) {
    window.Vectura.UI.AlgorithmPanel.bind({ getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms, getThemeToken });
  }
  if (window.Vectura?.UI?.AlgorithmPanel?.installOn) {
    window.Vectura.UI.AlgorithmPanel.installOn(UI.prototype);
  }

  // Meridian Unit 1.8: register ui-fill-panel.js's pattern-fill installer.
  // The methods only touch this.* and window.Vectura.* — empty DI bag.
  if (window.Vectura?.FillPanel?.bind) {
    window.Vectura.FillPanel.bind({});
  }
  if (window.Vectura?.FillPanel?.installOn) {
    window.Vectura.FillPanel.installOn(UI.prototype);
  }

  // Phase 2 step 5a: hand legacy IIFE-locals to persistence.js.
  if (window.Vectura?.UI?.Persistence?.bind) {
    window.Vectura.UI.Persistence.bind({ getEl, SETTINGS, getContrastTextColor });
  }
  if (window.Vectura?.UI?.Persistence?.installOn) {
    window.Vectura.UI.Persistence.installOn(UI.prototype);
  }

  // Phase 2 step 5b: hand legacy IIFE-locals to shortcuts.js.
  if (window.Vectura?.UI?.Shortcuts?.bind) {
    window.Vectura.UI.Shortcuts.bind({ getEl, SETTINGS, isPrimitiveShapeLayer });
  }
  if (window.Vectura?.UI?.Shortcuts?.installOn) {
    window.Vectura.UI.Shortcuts.installOn(UI.prototype);
  }

  // Phase 3 closure: bind layer right-click context menu (NEW surface).
  // Composes UI.overlays.Menu; no IIFE-local deps.
  if (window.Vectura?.UI?.Menus?.LayerContext?.bind) {
    window.Vectura.UI.Menus.LayerContext.bind({ getEl });
  }

  // Phase 3 closure: bind layer filter dropdown (composes UI.overlays.Menu).
  if (window.Vectura?.UI?.Menus?.LayerFilter?.bind) {
    window.Vectura.UI.Menus.LayerFilter.bind({ getEl });
  }

  // Phase 3 closure: bind window-level drag-drop router (composes
  // UI.overlays.DragDropOverlay). Activated when the UI is constructed.
  if (window.Vectura?.UI?.Menus?.DragDropRouter?.bind) {
    window.Vectura.UI.Menus.DragDropRouter.bind({});
  }

  // Phase 3: register modals/help-shortcuts.js. No IIFE-local deps; the
  // module body is fully static markup and composes the legacy this.openModal
  // primitive (which still lives on UI.prototype below).
  if (window.Vectura?.UI?.Modals?.HelpShortcuts?.bind) {
    window.Vectura.UI.Modals.HelpShortcuts.bind({});
  }
  if (window.Vectura?.UI?.Modals?.HelpShortcuts?.installOn) {
    window.Vectura.UI.Modals.HelpShortcuts.installOn(UI.prototype);
  }

  // Meridian Unit 1.7: promote src/ui/overlays/modal.js into the modal
  // primitive that owns the centered #modal-overlay scaffold. Installs
  // createModal, openModal, closeModal, _mountGridSettingsPanel, and
  // _mountDocumentSetupPanel onto UI.prototype. Bound BEFORE the UI ctor
  // runs (which calls `this.createModal()` synchronously). Only IIFE-local
  // dep is `getEl` — passed for symmetry with sibling modules even though
  // the wrappers themselves currently reach for `document.*` directly.
  if (window.Vectura?.UI?.overlays?.Modal?.bind) {
    window.Vectura.UI.overlays.Modal.bind({ getEl });
  }
  if (window.Vectura?.UI?.overlays?.Modal?.installOn) {
    window.Vectura.UI.overlays.Modal.installOn(UI.prototype);
  }

  // Phase 3 step 2: register modals/grid-settings.js. Slide-out side panel
  // (CSS class .open) — owns its own markup (mount()) and the six grid
  // control handlers previously inlined in bindGlobal().
  if (window.Vectura?.UI?.Modals?.GridSettings?.bind) {
    window.Vectura.UI.Modals.GridSettings.bind({
      getEl,
      SETTINGS,
      openColorPickerAnchoredTo,
    });
  }
  if (window.Vectura?.UI?.Modals?.GridSettings?.installOn) {
    window.Vectura.UI.Modals.GridSettings.installOn(UI.prototype);
  }

  // Phase 3 step 3: register modals/document-setup.js. Slide-out side panel
  // (CSS class .open) — owns its own markup (mount()) and the open/close
  // lifecycle. The ~30 input handlers stay in legacy bindGlobal() because
  // they're interleaved with shared selection-outline / margin-line / cookie
  // / paper handlers.
  if (window.Vectura?.UI?.Modals?.DocumentSetup?.bind) {
    window.Vectura.UI.Modals.DocumentSetup.bind({
      getEl,
      SETTINGS,
      MACHINES,
      normalizeDocumentUnits,
      getContrastTextColor,
      openColorPickerAnchoredTo,
    });
  }
  if (window.Vectura?.UI?.Modals?.DocumentSetup?.installOn) {
    window.Vectura.UI.Modals.DocumentSetup.installOn(UI.prototype);
  }

  // Phase 3 step 3 (second modal): register modals/info-modals.js. The
  // info-button micro-system — showInfo, showDuplicateNameError,
  // showValueError, attachInfoButton, attachStaticInfoButtons, bindInfoButtons.
  // INFO has been relocated INTO the satellite (Meridian Unit 1.3); only the
  // remaining IIFE-locals (buildPreviewPair, escapeHtml, getEl, SETTINGS) flow
  // through the DI bag.
  if (window.Vectura?.UI?.Modals?.InfoModals?.bind) {
    window.Vectura.UI.Modals.InfoModals.bind({
      buildPreviewPair,
      escapeHtml,
      getEl,
      SETTINGS,
    });
  }
  if (window.Vectura?.UI?.Modals?.InfoModals?.installOn) {
    window.Vectura.UI.Modals.InfoModals.installOn(UI.prototype);
  }

  // Phase 3 step 4: register modals/color-picker.js. Self-contained HSV
  // picker — no IIFE-local deps. The legacy `openColorPickerAnchoredTo`
  // (still in this file) routes to `uiInstance.openColorModal(...)` on
  // touch-primary devices, which now delegates to this module.
  if (window.Vectura?.UI?.Modals?.ColorPicker?.bind) {
    window.Vectura.UI.Modals.ColorPicker.bind({});
  }
  if (window.Vectura?.UI?.Modals?.ColorPicker?.installOn) {
    window.Vectura.UI.Modals.ColorPicker.installOn(UI.prototype);
  }

  // Phase 3 step 4 (second modal): register modals/image-asset.js. Generic
  // image-picker modal that powers the rainfall silhouette control AND the
  // noise rack image source. Both legacy methods (openNoiseImageModal,
  // loadNoiseImageFile) delegate here. Composes this.openModal /
  // this.closeModal / this.app.pushHistory — no IIFE-local deps.
  if (window.Vectura?.UI?.Modals?.ImageAsset?.bind) {
    window.Vectura.UI.Modals.ImageAsset.bind({});
  }
  if (window.Vectura?.UI?.Modals?.ImageAsset?.installOn) {
    window.Vectura.UI.Modals.ImageAsset.installOn(UI.prototype);
  }

  // Phase 3 step 5 (final modal): register modals/export-svg.js. The largest
  // single extraction — owns openExportModal + 8 supporting prototype-callable
  // methods (preview pipeline, optimization-controls decoration, legend
  // wiring, info-button attach pipeline). Composes this.openModal /
  // this.closeModal / this.app.engine / this.app.renderer; the actual
  // SVG-blob construction stays in src/ui/ui-file-io.js (`exportSVG`).
  // EXPORT_INFO + OPTIMIZATION_STEPS have been relocated INTO the export-svg
  // satellite (Meridian Unit 1.3); they no longer flow through the DI bag.
  if (window.Vectura?.UI?.Modals?.ExportSvg?.bind) {
    window.Vectura.UI.Modals.ExportSvg.bind({
      getEl,
      SETTINGS,
      clamp,
      getThemeToken,
      getContrastTextColor,
      openColorPickerAnchoredTo,
    });
  }
  if (window.Vectura?.UI?.Modals?.ExportSvg?.installOn) {
    window.Vectura.UI.Modals.ExportSvg.installOn(UI.prototype);
  }

  window.Vectura = window.Vectura || {};
  // Preserve namespace members other modules attach to window.Vectura.UI BEFORE
  // ui.js loads (controls-registry.js, panels/algo-config-panel.js, components/*,
  // overlays/*). Reassigning `window.Vectura.UI = UI` directly would clobber them
  // because UI is a class (constructor). Copying static properties forward keeps
  // window.Vectura.UI.{CONTROL_DEFS,AlgoConfigPanel,Slider,...} resolvable.
  const _existingUI = window.Vectura.UI;
  window.Vectura.UI = UI;
  if (_existingUI && typeof _existingUI === 'object') {
    for (const _k of Object.keys(_existingUI)) {
      if (UI[_k] === undefined) UI[_k] = _existingUI[_k];
    }
  }
})();
