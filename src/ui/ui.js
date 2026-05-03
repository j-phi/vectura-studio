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
    PRESETS,
    PETALIS_PRESETS,
    TERRAIN_PRESETS,
    RINGS_PRESETS,
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

  const PETALIS_PRESET_LIBRARY = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(PETALIS_PRESETS) ? PETALIS_PRESETS : [])
    .filter((preset) => {
      const system = preset?.preset_system || 'petalisDesigner';
      return system === 'petalisDesigner';
    });
  const PETALIS_LAYER_TYPES = new Set(['petalisDesigner']);
  const isPetalisLayerType = (type) => PETALIS_LAYER_TYPES.has(type);

  const TERRAIN_PRESET_LIBRARY = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(TERRAIN_PRESETS) ? TERRAIN_PRESETS : [])
    .filter((preset) => preset?.preset_system === 'terrain');

  const RINGS_PRESET_LIBRARY = (Array.isArray(PRESETS) ? PRESETS : Array.isArray(RINGS_PRESETS) ? RINGS_PRESETS : [])
    .filter((preset) => preset?.preset_system === 'rings');

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

  const openColorPickerAnchoredTo = (colorInput, triggerEl) => {
    if (!colorInput || !triggerEl) return;
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
    let frame = null;

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
      if (frame !== null) window.cancelAnimationFrame(frame);
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

    frame = window.requestAnimationFrame(() => {
      try {
        if (typeof proxyInput.showPicker === 'function') proxyInput.showPicker();
        else proxyInput.click();
      } catch (_err) {
        proxyInput.click();
      }
      setTimeout(cleanup, 3000);
    });
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

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
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
    const { dark = getThemeToken('--color-bg', '#09090b'), light = getThemeToken('--color-accent', '#fafafa') } = options;
    const normalized = normalizeHexColor(background);
    if (!normalized) return dark;
    const r = parseInt(normalized.slice(1, 3), 16) / 255;
    const g = parseInt(normalized.slice(3, 5), 16) / 255;
    const b = parseInt(normalized.slice(5, 7), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.62 ? dark : light;
  };
  const SEEDLESS_ALGOS = new Set(['lissajous', 'harmonograph', 'expanded', 'group']);
  const usesSeed = (type) => !SEEDLESS_ALGOS.has(type);
  const mapRange = (value, inMin, inMax, outMin, outMax) => {
    if (inMax === inMin) return outMin;
    const t = (value - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const simplifyPath = GeometryUtils?.simplifyPath || ((path) => path);
  const joinNearbyPaths = OptimizationUtils?.joinNearbyPaths || ((paths) => paths);
  const createModifierState = Modifiers.createModifierState || ((type) => ({ type, enabled: true, guidesVisible: true, guidesLocked: false, mirrors: [] }));
  const createMirrorLine = Modifiers.createMirrorLine || ((index) => ({ id: `mirror-${index + 1}`, enabled: true }));
  const createRadialMirror = Modifiers.createRadialMirror || ((index) => ({ id: `mirror-${index + 1}`, enabled: true, type: 'radial', count: 6, mode: 'dihedral', centerX: 0, centerY: 0, angle: 0 }));
  const createArcMirror = Modifiers.createArcMirror || ((index) => ({ id: `mirror-${index + 1}`, enabled: true, type: 'arc', centerX: 0, centerY: 0, radius: 80, arcStart: -180, arcEnd: 180, replacedSide: 'outer' }));
  const isModifierLayer = Modifiers.isModifierLayer || (() => false);
  const getLayerSilhouette = Masking.getLayerSilhouette || (() => []);

  const segmentIntersection = (a, b, c, d) => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < 1e-9) return null;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
  };

  const segmentCircleIntersections = (a, b, center, radius) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = a.x - center.x;
    const fy = a.y - center.y;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - radius * radius;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return [];
    const sqrt = Math.sqrt(disc);
    const t1 = (-B - sqrt) / (2 * A);
    const t2 = (-B + sqrt) / (2 * A);
    return [t1, t2].filter((t) => t >= 0 && t <= 1);
  };

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

  const splitPathByShape = (path, shape) => {
    if (!Array.isArray(path) || path.length < 2) return null;
    const output = [];
    let current = [path[0]];
    let hit = false;
    const addSegment = () => {
      if (current.length > 1) output.push(current);
      current = [];
    };

    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      let ts = [];
      if (shape.mode === 'line' && shape.line) {
        const t = segmentIntersection(a, b, shape.line.a, shape.line.b);
        if (t !== null) ts.push(t);
      } else if (shape.mode === 'rect' && shape.rect) {
        const { x, y, w, h } = shape.rect;
        const r1 = { x, y };
        const r2 = { x: x + w, y };
        const r3 = { x: x + w, y: y + h };
        const r4 = { x, y: y + h };
        [segmentIntersection(a, b, r1, r2),
          segmentIntersection(a, b, r2, r3),
          segmentIntersection(a, b, r3, r4),
          segmentIntersection(a, b, r4, r1),
        ].forEach((t) => {
          if (t !== null) ts.push(t);
        });
      } else if (shape.mode === 'circle' && shape.circle) {
        ts = segmentCircleIntersections(a, b, shape.circle, shape.circle.r);
      }

      ts = ts.filter((t) => t > 1e-4 && t < 1 - 1e-4).sort((t1, t2) => t1 - t2);
      if (!ts.length) {
        if (!current.length) current.push(a);
        current.push(b);
        continue;
      }

      hit = true;
      let lastPoint = a;
      if (!current.length) current.push(lastPoint);
      ts.forEach((t) => {
        const pt = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
        current.push(pt);
        addSegment();
        current.push(pt);
        lastPoint = pt;
      });
      current.push(b);
    }

    if (current.length > 1) output.push(current);
    if (!hit) return null;
    return output;
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

  const getDisplayConfig = (def) => {
    const min = def.displayMin ?? def.min;
    const max = def.displayMax ?? def.max;
    const step = def.displayStep ?? def.step ?? 1;
    const unit = def.displayUnit ?? '';
    const precision = Number.isFinite(def.displayPrecision) ? def.displayPrecision : stepPrecision(step);
    return { min, max, step, unit, precision };
  };

  const toDisplayValue = (def, value) => {
    if (def.displayMin !== undefined || def.displayMax !== undefined) {
      const dMin = def.displayMin ?? def.min;
      const dMax = def.displayMax ?? def.max;
      return mapRange(value, def.min, def.max, dMin, dMax);
    }
    return value;
  };

  const fromDisplayValue = (def, value) => {
    if (def.displayMin !== undefined || def.displayMax !== undefined) {
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

  const WAVE_NOISE_OPTIONS = [
    { value: 'billow', label: 'Billow' },
    { value: 'cellular', label: 'Cellular' },
    { value: 'checker', label: 'Checker' },
    { value: 'crackle', label: 'Crackle' },
    { value: 'crosshatch', label: 'Crosshatch' },
    { value: 'domain', label: 'Domain Warp' },
    { value: 'dunes', label: 'Dunes' },
    { value: 'facet', label: 'Facet' },
    { value: 'fbm', label: 'Fractal' },
    { value: 'grain', label: 'Grain' },
    { value: 'image', label: 'Image' },
    { value: 'marble', label: 'Marble' },
    { value: 'moire', label: 'Moire' },
    { value: 'perlin', label: 'Perlin' },
    { value: 'polygon', label: 'Polygon' },
    { value: 'pulse', label: 'Pulse' },
    { value: 'radial', label: 'Radial' },
    { value: 'ridged', label: 'Ridged' },
    { value: 'ripple', label: 'Ripple' },
    { value: 'sawtooth', label: 'Sawtooth' },
    { value: 'simplex', label: 'Simplex' },
    { value: 'spiral', label: 'Spiral' },
    { value: 'steps', label: 'Steps' },
    { value: 'stripes', label: 'Stripes' },
    { value: 'swirl', label: 'Swirl' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'turbulence', label: 'Turbulence' },
    { value: 'value', label: 'Value' },
    { value: 'voronoi', label: 'Voronoi' },
    { value: 'warp', label: 'Warp' },
    { value: 'weave', label: 'Weave' },
    { value: 'zigzag', label: 'Zigzag' },
  ];

  const WAVE_NOISE_DESCRIPTIONS = {
    billow: 'Soft, cloud-like noise from absolute values.',
    cellular: 'Organic cell fields with crater-like edges.',
    checker: 'Alternating square grid pattern.',
    crackle: 'Cracked borders between Voronoi cells.',
    crosshatch: 'Interlaced angled line texture.',
    domain: 'Warped noise using domain distortion.',
    dunes: 'Sweeping dune bands with long gradients.',
    facet: 'Faceted plateaus with stepped transitions.',
    fbm: 'Fractal Brownian motion with layered octaves.',
    grain: 'Fine high-frequency grain texture.',
    image: 'Uses uploaded image luminance for displacement.',
    marble: 'Swirled marble streaks from sine warping.',
    moire: 'Interference waves with repeating offsets.',
    perlin: 'Classic Perlin gradient noise.',
    polygon: 'Centered polygon field with adjustable edges.',
    pulse: 'Radial pulse rings that expand outward.',
    radial: 'Circular waves emanating from the center.',
    ridged: 'Sharp ridges from inverted absolute noise.',
    ripple: 'Concentric ripple rings with falloff.',
    sawtooth: 'Ramping sawtooth bands.',
    simplex: 'Simplex gradient noise, smooth and balanced.',
    spiral: 'Spiral wave interference pattern.',
    steps: 'Quantized step bands with hard transitions.',
    stripes: 'Linear stripe bands across the canvas.',
    swirl: 'Rotational swirl pattern with curls.',
    triangle: 'Triangle wave pattern with sharp peaks.',
    turbulence: 'Layered absolute noise with bold contrast.',
    value: 'Value noise with blockier transitions.',
    voronoi: 'Voronoi cell distance field.',
    warp: 'Noise warped by itself for distortion.',
    weave: 'Woven cross pattern with alternating bands.',
    zigzag: 'Zigzag chevron waves.',
  };

  const IMAGE_NOISE_STYLE_OPTIONS = [
    { value: 'linear', label: 'Linear' },
    { value: 'curve', label: 'Curved' },
    { value: 'angled', label: 'Angled' },
    { value: 'noisy', label: 'Noisy' },
  ];

  const WAVE_PATTERN_TYPES = [
    'stripes',
    'marble',
    'checker',
    'zigzag',
    'ripple',
    'spiral',
    'crosshatch',
    'pulse',
    'swirl',
    'radial',
    'weave',
    'moire',
    'sawtooth',
    'dunes',
  ];
  const WAVE_CELL_TYPES = ['cellular', 'voronoi', 'crackle'];
  const WAVE_STEP_TYPES = ['steps', 'facet'];
  const WAVE_WARP_TYPES = ['warp', 'domain'];
  const WAVE_SEEDED_TYPES = ['steps', 'value', 'perlin', 'facet'];

  const WAVE_NOISE_BLEND_OPTIONS = [
    { value: 'add', label: 'Additive' },
    { value: 'subtract', label: 'Subtract' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'max', label: 'Max' },
    { value: 'min', label: 'Min' },
    { value: 'hatch-dark', label: 'Hatching Density (Chiaroscuro)' },
    { value: 'hatch-light', label: 'Hatching Density (Tenebrism)' },
  ];

  const IMAGE_EFFECT_OPTIONS = [
    { value: 'luma', label: 'Luma' },
    { value: 'brightness', label: 'Brightness' },
    { value: 'contrast', label: 'Contrast' },
    { value: 'gamma', label: 'Gamma' },
    { value: 'levels', label: 'Levels' },
    { value: 'invert', label: 'Invert' },
    { value: 'threshold', label: 'Threshold' },
    { value: 'posterize', label: 'Posterize' },
    { value: 'edge', label: 'Edge Detect' },
    { value: 'blur', label: 'Blur' },
    { value: 'emboss', label: 'Emboss' },
    { value: 'sharpen', label: 'Sharpen' },
    { value: 'solarize', label: 'Solarize' },
    { value: 'pixelate', label: 'Pixelate' },
    { value: 'dither', label: 'Dither' },
    { value: 'median', label: 'Median' },
    { value: 'highpass', label: 'High Pass' },
    { value: 'lowpass', label: 'Low Pass' },
    { value: 'vignette', label: 'Vignette' },
    { value: 'curve', label: 'Tone Curve' },
    { value: 'bandpass', label: 'Bandpass' },
  ];

  const IMAGE_EFFECT_DEFS = [
    {
      key: 'mode',
      label: 'Effect Mode',
      type: 'select',
      options: IMAGE_EFFECT_OPTIONS,
      infoKey: 'wavetable.imageAlgo',
    },
    {
      key: 'imageBrightness',
      label: 'Brightness',
      type: 'range',
      min: -1,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageBrightness',
      showIf: (e) => e.mode === 'brightness',
    },
    {
      key: 'imageLevelsLow',
      label: 'Levels Low',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageLevelsLow',
      showIf: (e) => e.mode === 'levels',
    },
    {
      key: 'imageLevelsHigh',
      label: 'Levels High',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageLevelsHigh',
      showIf: (e) => e.mode === 'levels',
    },
    {
      key: 'imageGamma',
      label: 'Gamma',
      type: 'range',
      min: 0.2,
      max: 3,
      step: 0.05,
      infoKey: 'wavetable.imageGamma',
      showIf: (e) => e.mode === 'gamma',
    },
    {
      key: 'imageContrast',
      label: 'Contrast',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageContrast',
      showIf: (e) => e.mode === 'contrast',
    },
    {
      key: 'imageEmbossStrength',
      label: 'Emboss Strength',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageEmbossStrength',
      showIf: (e) => e.mode === 'emboss',
    },
    {
      key: 'imageSharpenAmount',
      label: 'Sharpen Amount',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageSharpenAmount',
      showIf: (e) => e.mode === 'sharpen',
    },
    {
      key: 'imageSharpenRadius',
      label: 'Sharpen Radius',
      type: 'range',
      min: 0,
      max: 4,
      step: 1,
      infoKey: 'wavetable.imageSharpenRadius',
      showIf: (e) => e.mode === 'sharpen',
    },
    {
      key: 'imageMedianRadius',
      label: 'Median Radius',
      type: 'range',
      min: 1,
      max: 4,
      step: 1,
      infoKey: 'wavetable.imageMedianRadius',
      showIf: (e) => e.mode === 'median',
    },
    {
      key: 'imageBlurRadius',
      label: 'Blur Radius',
      type: 'range',
      min: 0,
      max: 6,
      step: 1,
      infoKey: 'wavetable.imageBlurRadius',
      showIf: (e) => e.mode === 'blur',
    },
    {
      key: 'imageBlurStrength',
      label: 'Blur Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageBlurStrength',
      showIf: (e) => e.mode === 'blur',
    },
    {
      key: 'imageSolarize',
      label: 'Solarize Threshold',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageSolarize',
      showIf: (e) => e.mode === 'solarize',
    },
    {
      key: 'imagePixelate',
      label: 'Pixelate',
      type: 'range',
      min: 2,
      max: 64,
      step: 1,
      infoKey: 'wavetable.imagePixelate',
      showIf: (e) => e.mode === 'pixelate',
    },
    {
      key: 'imageDither',
      label: 'Dither Amount',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageDither',
      showIf: (e) => e.mode === 'dither',
    },
    {
      key: 'imageThreshold',
      label: 'Threshold',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageThreshold',
      showIf: (e) => e.mode === 'threshold',
    },
    {
      key: 'imagePosterize',
      label: 'Posterize Levels',
      type: 'range',
      min: 2,
      max: 10,
      step: 1,
      infoKey: 'wavetable.imagePosterize',
      showIf: (e) => e.mode === 'posterize',
    },
    {
      key: 'imageEdgeBlur',
      label: 'Edge Blur Radius',
      type: 'range',
      min: 0,
      max: 4,
      step: 1,
      infoKey: 'wavetable.imageBlur',
      showIf: (e) => e.mode === 'edge',
    },
    {
      key: 'imageHighpassRadius',
      label: 'High Pass Radius',
      type: 'range',
      min: 0,
      max: 6,
      step: 1,
      infoKey: 'wavetable.imageHighpassRadius',
      showIf: (e) => e.mode === 'highpass',
    },
    {
      key: 'imageHighpassStrength',
      label: 'High Pass Strength',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.05,
      infoKey: 'wavetable.imageHighpassStrength',
      showIf: (e) => e.mode === 'highpass',
    },
    {
      key: 'imageLowpassRadius',
      label: 'Low Pass Radius',
      type: 'range',
      min: 0,
      max: 6,
      step: 1,
      infoKey: 'wavetable.imageLowpassRadius',
      showIf: (e) => e.mode === 'lowpass',
    },
    {
      key: 'imageLowpassStrength',
      label: 'Low Pass Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageLowpassStrength',
      showIf: (e) => e.mode === 'lowpass',
    },
    {
      key: 'imageVignetteStrength',
      label: 'Vignette Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageVignetteStrength',
      showIf: (e) => e.mode === 'vignette',
    },
    {
      key: 'imageVignetteRadius',
      label: 'Vignette Radius',
      type: 'range',
      min: 0.2,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageVignetteRadius',
      showIf: (e) => e.mode === 'vignette',
    },
    {
      key: 'imageCurveStrength',
      label: 'Curve Strength',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.imageCurveStrength',
      showIf: (e) => e.mode === 'curve',
    },
    {
      key: 'imageBandCenter',
      label: 'Band Center',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageBandCenter',
      showIf: (e) => e.mode === 'bandpass',
    },
    {
      key: 'imageBandWidth',
      label: 'Band Width',
      type: 'range',
      min: 0.05,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageBandWidth',
      showIf: (e) => e.mode === 'bandpass',
    },
  ];

  const WAVE_TILE_OPTIONS = [
    { value: 'off', label: 'Off' },
    { value: 'brick', label: 'Brick' },
    { value: 'checker', label: 'Checker' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'grid', label: 'Grid' },
    { value: 'hex', label: 'Hex' },
    { value: 'offset', label: 'Offset' },
    { value: 'radial', label: 'Radial' },
    { value: 'spiral', label: 'Spiral' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'wave', label: 'Wave' },
  ];
  const IMAGE_NOISE_DEFAULT_AMPLITUDE = 1.7;

  const WAVE_NOISE_DEFS = [
    {
      key: 'type',
      label: 'Noise Type',
      type: 'select',
      randomExclude: ['image'],
      options: WAVE_NOISE_OPTIONS,
      infoKey: 'wavetable.noiseType',
    },
    {
      key: 'noiseStyle',
      label: 'Noise Style',
      type: 'select',
      options: IMAGE_NOISE_STYLE_OPTIONS,
      infoKey: 'wavetable.imageNoiseStyle',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'imageInvertColor',
      label: 'Invert Color',
      type: 'checkbox',
      infoKey: 'wavetable.imageInvertColor',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'imageInvertOpacity',
      label: 'Invert Opacity',
      type: 'checkbox',
      infoKey: 'wavetable.imageInvertOpacity',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'blend',
      label: 'Blend Mode',
      type: 'select',
      options: WAVE_NOISE_BLEND_OPTIONS,
      infoKey: 'wavetable.noiseBlend',
    },
    {
      key: 'applyMode',
      label: 'Apply Mode',
      type: 'select',
      options: [
        { value: 'topdown', label: 'Top Down' },
        { value: 'linear', label: 'Linear' },
      ],
      infoKey: 'wavetable.noiseApplyMode',
      showIf: (n) => n.applyMode !== undefined,
    },
    { key: 'amplitude', label: 'Noise Amplitude', type: 'range', min: -100, max: 100, step: 0.1, infoKey: 'wavetable.amplitude' },
    { key: 'zoom', label: 'Noise Zoom', type: 'range', min: 0.002, max: 0.08, step: 0.001, infoKey: 'wavetable.zoom' },
    {
      key: 'imageWidth',
      label: 'Noise Width',
      type: 'range',
      min: 0.1,
      max: 4,
      step: 0.05,
      infoKey: 'wavetable.imageWidth',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'imageHeight',
      label: 'Noise Height',
      type: 'range',
      min: 0.1,
      max: 4,
      step: 0.05,
      infoKey: 'wavetable.imageHeight',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'microFreq',
      label: 'Micro Frequency',
      type: 'range',
      min: 0,
      max: 2,
      step: 0.1,
      infoKey: 'wavetable.imageMicroFreq',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'noiseThreshold',
      label: 'Noise Threshold',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.imageNoiseThreshold',
      showIf: (n) => n.type === 'image',
    },
    {
      key: 'freq',
      label: 'Frequency',
      type: 'range',
      min: 0.2,
      max: 12.0,
      step: 0.1,
      infoKey: 'wavetable.freq',
      showIf: (n) => n.type !== 'image',
    },
    {
      key: 'angle',
      label: 'Noise Angle',
      type: 'angle',
      min: 0,
      max: 360,
      step: 1,
      displayUnit: '°',
      infoKey: 'wavetable.noiseAngle',
    },
    {
      key: 'shiftX',
      label: 'Noise X-Shift',
      type: 'range',
      min: -1,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.noiseShiftX',
    },
    {
      key: 'shiftY',
      label: 'Noise Y-Shift',
      type: 'range',
      min: -1,
      max: 1,
      step: 0.01,
      infoKey: 'wavetable.noiseShiftY',
    },
    {
      key: 'tileMode',
      label: 'Tile Mode',
      type: 'select',
      options: WAVE_TILE_OPTIONS,
      infoKey: 'wavetable.noiseTileMode',
    },
    {
      key: 'tilePadding',
      label: 'Tile Padding',
      type: 'range',
      min: 0,
      max: 0.45,
      step: 0.01,
      infoKey: 'wavetable.noiseTilePadding',
      showIf: (n) => (n.tileMode || 'off') !== 'off',
    },
    {
      key: 'patternScale',
      label: 'Pattern Scale',
      type: 'range',
      min: 0.2,
      max: 6,
      step: 0.05,
      infoKey: 'wavetable.noisePatternScale',
      showIf: (n) => WAVE_PATTERN_TYPES.includes(n.type),
    },
    {
      key: 'warpStrength',
      label: 'Warp Strength',
      type: 'range',
      min: 0,
      max: 3,
      step: 0.05,
      infoKey: 'wavetable.noiseWarpStrength',
      showIf: (n) => WAVE_WARP_TYPES.includes(n.type),
    },
    {
      key: 'cellularScale',
      label: 'Cell Scale',
      type: 'range',
      min: 0.5,
      max: 6,
      step: 0.1,
      infoKey: 'wavetable.noiseCellScale',
      showIf: (n) => WAVE_CELL_TYPES.includes(n.type),
    },
    {
      key: 'cellularJitter',
      label: 'Cell Jitter',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.noiseCellJitter',
      showIf: (n) => WAVE_CELL_TYPES.includes(n.type),
    },
    {
      key: 'stepsCount',
      label: 'Step Count',
      type: 'range',
      min: 2,
      max: 16,
      step: 1,
      infoKey: 'wavetable.noiseSteps',
      showIf: (n) => WAVE_STEP_TYPES.includes(n.type),
    },
    {
      key: 'seed',
      label: 'Noise Seed',
      type: 'range',
      min: 0,
      max: 9999,
      step: 1,
      infoKey: 'wavetable.noiseSeed',
      showIf: (n) => WAVE_SEEDED_TYPES.includes(n.type),
    },
    {
      key: 'polygonRadius',
      label: 'Polygon Radius',
      type: 'range',
      min: 0.2,
      max: 4,
      step: 0.05,
      infoKey: 'wavetable.noisePolygonRadius',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonSides',
      label: 'Polygon Sides',
      type: 'range',
      min: 3,
      max: 12,
      step: 1,
      infoKey: 'wavetable.noisePolygonSides',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonRotation',
      label: 'Polygon Rotation',
      type: 'angle',
      min: 0,
      max: 360,
      step: 1,
      displayUnit: '°',
      infoKey: 'wavetable.noisePolygonRotation',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonOutline',
      label: 'Outline Width',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.noisePolygonOutline',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonEdgeRadius',
      label: 'Edge Radius',
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      infoKey: 'wavetable.noisePolygonEdge',
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonTileScale',
      label: 'Tile Scale',
      type: 'range',
      min: 0.001,
      max: 100,
      step: 0.01,
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonTileShiftX',
      label: 'Tile X-Shift',
      type: 'range',
      min: -50,
      max: 50,
      step: 0.1,
      showIf: (n) => n.type === 'polygon',
    },
    {
      key: 'polygonTileShiftY',
      label: 'Tile Y-Shift',
      type: 'range',
      min: -50,
      max: 50,
      step: 0.1,
      showIf: (n) => n.type === 'polygon',
    },
  ];

  const cloneNoiseDef = (def, overrides = {}) => ({
    ...def,
    ...overrides,
    options: overrides.options || (Array.isArray(def.options) ? def.options.map((opt) => ({ ...opt })) : def.options),
  });

  const RINGS_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.map((def) => {
      if (def.key === 'applyMode') {
        return cloneNoiseDef(def, {
          options: [
            { value: 'orbit', label: 'Orbit Field' },
            { value: 'concentric', label: 'Concentric' },
            { value: 'topdown', label: 'Top Down' },
          ],
          infoKey: 'rings.noiseProjection',
        });
      }
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          min: -80,
          max: 80,
          step: 0.5,
          infoKey: 'rings.amplitude',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.0001,
          max: 0.02,
          step: 0.0001,
          infoKey: 'rings.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'rings.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'rings.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'ringDrift',
      label: 'Ring Drift',
      type: 'range',
      min: 0,
      max: 5,
      step: 0.1,
      infoKey: 'rings.noiseLayer',
      showIf: (n) => ['orbit', 'concentric'].includes(n.applyMode || 'orbit'),
    },
    {
      key: 'ringRadius',
      label: 'Path Span',
      type: 'range',
      min: 10,
      max: 240,
      step: 1,
      infoKey: 'rings.noisePathSpan',
      showIf: (n) => (n.applyMode || 'orbit') === 'concentric',
    },
    {
      key: 'ringRadius',
      label: 'Orbit Radius',
      type: 'range',
      min: 10,
      max: 240,
      step: 1,
      infoKey: 'rings.noiseOrbitRadius',
      showIf: (n) => (n.applyMode || 'orbit') === 'orbit',
    },
  ];

  const TOPO_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'topo.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.0001,
          max: 0.02,
          step: 0.0001,
          infoKey: 'topo.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'topo.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'topo.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'topo.octaves',
      showIf: (n) => n.type === 'fbm',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'topo.lacunarity',
      showIf: (n) => n.type === 'fbm',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'topo.gain',
      showIf: (n) => n.type === 'fbm',
    },
  ];

  const FLOWFIELD_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'flowfield.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 0.2,
          step: 0.001,
          infoKey: 'flowfield.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'flowfield.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'flowfield.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'flowfield.octaves',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'flowfield.lacunarity',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'flowfield.gain',
    },
  ];

  const GRID_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'grid.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 0.2,
          step: 0.001,
          infoKey: 'grid.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'grid.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'grid.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'grid.octaves',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'grid.lacunarity',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'grid.gain',
    },
  ];

  const PHYLLA_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Field Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'phylla.fieldWeight',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 0.2,
          step: 0.001,
          infoKey: 'phylla.noiseScale',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'phylla.noiseOffsetX',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'phylla.noiseOffsetY',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'phylla.octaves',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'phylla.lacunarity',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'phylla.gain',
    },
  ];

  const PETALIS_DRIFT_NOISE_DEFS = [
    ...WAVE_NOISE_DEFS.filter((def) => def.key !== 'applyMode').map((def) => {
      if (def.key === 'amplitude') {
        return cloneNoiseDef(def, {
          label: 'Drift Weight',
          min: -2,
          max: 2,
          step: 0.05,
          infoKey: 'petalis.driftNoise',
        });
      }
      if (def.key === 'zoom') {
        return cloneNoiseDef(def, {
          label: 'Noise Scale',
          min: 0.001,
          max: 1,
          step: 0.001,
          infoKey: 'petalis.driftNoise',
        });
      }
      if (def.key === 'shiftX') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset X',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'petalis.driftNoise',
        });
      }
      if (def.key === 'shiftY') {
        return cloneNoiseDef(def, {
          label: 'Noise Offset Y',
          min: -200,
          max: 200,
          step: 1,
          infoKey: 'petalis.driftNoise',
        });
      }
      return cloneNoiseDef(def);
    }),
    {
      key: 'octaves',
      label: 'Octaves',
      type: 'range',
      min: 1,
      max: 6,
      step: 1,
      infoKey: 'petalis.driftNoise',
    },
    {
      key: 'lacunarity',
      label: 'Lacunarity',
      type: 'range',
      min: 1.2,
      max: 4.0,
      step: 0.1,
      infoKey: 'petalis.driftNoise',
    },
    {
      key: 'gain',
      label: 'Gain',
      type: 'range',
      min: 0.2,
      max: 0.9,
      step: 0.05,
      infoKey: 'petalis.driftNoise',
    },
  ];

  // Expose noise-rack-related constants to ui-noise-rack.js (single source of truth)
  window.Vectura = window.Vectura || {};
  window.Vectura._UINoiseDefs = {
    IMAGE_EFFECT_DEFS,
    WAVE_NOISE_DEFS,
    RINGS_NOISE_DEFS,
    TOPO_NOISE_DEFS,
    FLOWFIELD_NOISE_DEFS,
    GRID_NOISE_DEFS,
    PHYLLA_NOISE_DEFS,
    PETALIS_DRIFT_NOISE_DEFS,
    COMMON_CONTROLS,
  };

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

  const RINGS_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(RINGS_PRESET_LIBRARY)
      ? RINGS_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
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

  const PETALIS_MODIFIER_TYPES = [
    {
      value: 'ripple',
      label: 'Ripple',
      controls: [
        { key: 'amount', label: 'Amplitude (mm)', type: 'range', min: 0, max: 10, step: 0.1, infoKey: 'petalis.centerModRippleAmount' },
        { key: 'frequency', label: 'Frequency', type: 'range', min: 1, max: 16, step: 1, infoKey: 'petalis.centerModRippleFrequency' },
      ],
    },
    {
      value: 'twist',
      label: 'Twist',
      controls: [{ key: 'amount', label: 'Twist (deg)', type: 'range', min: -90, max: 90, step: 1, infoKey: 'petalis.centerModTwist' }],
    },
    {
      value: 'radialNoise',
      label: 'Radial Noise',
      controls: [
        { key: 'amount', label: 'Noise Amp (mm)', type: 'range', min: 0, max: 6, step: 0.1, infoKey: 'petalis.centerModNoiseAmount' },
        { key: 'seed', label: 'Noise Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'petalis.centerModNoiseSeed' },
      ],
    },
    {
      value: 'falloff',
      label: 'Density Falloff',
      controls: [{ key: 'amount', label: 'Strength', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerModFalloff' }],
    },
    {
      value: 'offset',
      label: 'Offset',
      controls: [
        { key: 'offsetX', label: 'Offset X (mm)', type: 'range', min: -40, max: 40, step: 1, infoKey: 'petalis.centerModOffsetX' },
        { key: 'offsetY', label: 'Offset Y (mm)', type: 'range', min: -40, max: 40, step: 1, infoKey: 'petalis.centerModOffsetY' },
      ],
    },
    {
      value: 'clip',
      label: 'Clip/Trim',
      controls: [{ key: 'radius', label: 'Clip Radius (mm)', type: 'range', min: 1, max: 120, step: 1, infoKey: 'petalis.centerModClip' }],
    },
    {
      value: 'circularOffset',
      label: 'Circular Offset',
      controls: [
        { key: 'amount', label: 'Offset Amount (mm)', type: 'range', min: 0, max: 12, step: 0.1, infoKey: 'petalis.centerModCircularAmount' },
        { key: 'randomness', label: 'Randomness', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerModCircularRandomness' },
        {
          key: 'direction',
          label: 'In/Out Bias',
          type: 'range',
          min: -1,
          max: 1,
          step: 0.05,
          infoKey: 'petalis.centerModCircularDirection',
        },
        { key: 'seed', label: 'Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'petalis.centerModCircularSeed' },
      ],
    },
  ];

  const createPetalisModifier = (type = 'ripple') => ({
    id: `mod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    type,
    amount: 2,
    frequency: 6,
    scale: 0.2,
    noises: [],
    offsetX: 0,
    offsetY: 0,
    radius: 12,
    randomness: 0.5,
    direction: 0,
    seed: 0,
  });

  const PETALIS_PETAL_MODIFIER_TYPES = [
    {
      value: 'ripple',
      label: 'Ripple',
      controls: [
        { key: 'amount', label: 'Amplitude (mm)', type: 'range', min: 0, max: 6, step: 0.1, infoKey: 'petalis.petalModRippleAmount' },
        { key: 'frequency', label: 'Frequency', type: 'range', min: 1, max: 16, step: 1, infoKey: 'petalis.petalModRippleFrequency' },
      ],
    },
    {
      value: 'twist',
      label: 'Twist',
      controls: [{ key: 'amount', label: 'Twist (deg)', type: 'range', min: -60, max: 60, step: 1, infoKey: 'petalis.petalModTwist' }],
    },
    {
      value: 'noise',
      label: 'Noise',
      controls: [
        { key: 'amount', label: 'Noise Amp (mm)', type: 'range', min: 0, max: 4, step: 0.1, infoKey: 'petalis.petalModNoiseAmount' },
        { key: 'seed', label: 'Noise Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'petalis.petalModNoiseSeed' },
      ],
    },
    {
      value: 'shear',
      label: 'Shear',
      controls: [{ key: 'amount', label: 'Shear Amount', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'petalis.petalModShear' }],
    },
    {
      value: 'taper',
      label: 'Taper',
      controls: [{ key: 'amount', label: 'Taper Amount', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'petalis.petalModTaper' }],
    },
    {
      value: 'offset',
      label: 'Offset',
      controls: [
        { key: 'offsetX', label: 'Offset X (mm)', type: 'range', min: -20, max: 20, step: 0.5, infoKey: 'petalis.petalModOffsetX' },
        { key: 'offsetY', label: 'Offset Y (mm)', type: 'range', min: -20, max: 20, step: 0.5, infoKey: 'petalis.petalModOffsetY' },
      ],
    },
  ];

  const createPetalModifier = (type = 'ripple') => ({
    id: `petal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    type,
    target: 'both',
    amount: 1.5,
    frequency: 8,
    scale: 0.2,
    noises: [],
    offsetX: 0,
    offsetY: 0,
    seed: 0,
  });

  const PETALIS_SHADING_TYPES = [
    { value: 'radial', label: 'Radial Hatch' },
    { value: 'parallel', label: 'Parallel Hatch' },
    { value: 'spiral', label: 'Spiral Hatch' },
    { value: 'stipple', label: 'Stipple' },
    { value: 'gradient', label: 'Gradient Lines' },
    { value: 'edge', label: 'Edge Hatch' },
    { value: 'rim', label: 'Rim Strokes' },
    { value: 'outline', label: 'Outline Emphasis' },
    { value: 'crosshatch', label: 'Crosshatch' },
    { value: 'chiaroscuro', label: 'Chiaroscuro' },
    { value: 'contour', label: 'Contour Lines' },
  ];

  const PETALIS_LINE_TYPES = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'stitch', label: 'Stitch' },
  ];

  const createPetalisShading = (type = 'radial') => ({
    id: `shade-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    type,
    target: 'both',
    widthX: 100,
    widthY: 60,
    posX: 50,
    posY: 50,
    gapX: 0,
    gapY: 0,
    gapPosX: 50,
    gapPosY: 50,
    lineType: 'solid',
    lineSpacing: 1,
    density: 1,
    jitter: 0,
    lengthJitter: 0,
    angle: 0,
  });
  const PETAL_DESIGNER_TARGET_OPTIONS = [
    { value: 'inner', label: 'Inner' },
    { value: 'outer', label: 'Outer' },
    { value: 'both', label: 'Both' },
  ];
  const PETAL_DESIGNER_PROFILE_DIRECTORY = './src/config/petal-profiles/';
  const PETAL_DESIGNER_PROFILE_IMPORT_ACCEPT = '.json,application/json';
  const PETAL_DESIGNER_PROFILE_TYPE = 'vectura-petal-profile';
  const PETAL_DESIGNER_PROFILE_VERSION = 1;
  const PETAL_DESIGNER_PROFILE_BUNDLE_KEY = 'PETAL_PROFILE_LIBRARY';
  const PETAL_DESIGNER_WIDTH_MATCH_BASELINE = 0.85;

  const PETALIS_DESIGNER_DEFAULT_INNER_COUNT = Math.round(
    clamp(ALGO_DEFAULTS?.petalisDesigner?.innerCount ?? 20, 5, 400)
  );
  const PETALIS_DESIGNER_DEFAULT_OUTER_COUNT = Math.round(
    clamp(ALGO_DEFAULTS?.petalisDesigner?.outerCount ?? 20, 5, 600)
  );
  const PETALIS_DESIGNER_DEFAULT_COUNT = Math.round(
    clamp(
      ALGO_DEFAULTS?.petalisDesigner?.count ??
        PETALIS_DESIGNER_DEFAULT_INNER_COUNT + PETALIS_DESIGNER_DEFAULT_OUTER_COUNT,
      5,
      800
    )
  );
  const PETALIS_DESIGNER_VIEW_STYLE_OPTIONS = [
    { value: 'overlay', label: 'Overlay' },
    { value: 'side-by-side', label: 'Side by Side' },
  ];
  const PETALIS_DESIGNER_RANDOMNESS_DEFS = [
    { key: 'seed', label: 'Seed', min: 0, max: 9999, step: 1, precision: 0 },
    { key: 'countJitter', label: 'Count Jitter', min: 0, max: 0.5, step: 0.01, precision: 2 },
    { key: 'sizeJitter', label: 'Size Jitter', min: 0, max: 0.5, step: 0.01, precision: 2 },
    { key: 'rotationJitter', label: 'Rotation Jitter', min: 0, max: 45, step: 1, precision: 0, unit: '°' },
    { key: 'angularDrift', label: 'Angular Drift', min: 0, max: 45, step: 1, precision: 0, unit: '°' },
    { key: 'driftStrength', label: 'Drift Strength', min: 0, max: 1, step: 0.05, precision: 2 },
    { key: 'driftNoise', label: 'Drift Noise', min: 0.05, max: 1, step: 0.05, precision: 2 },
    { key: 'radiusScale', label: 'Radius Scale', min: -1, max: 1, step: 0.05, precision: 2 },
    { key: 'radiusScaleCurve', label: 'Radius Scale Curve', min: 0.5, max: 2.5, step: 0.05, precision: 2 },
  ];

  const CONTROL_DEFS = {
    expanded: [],
    svgDistort: [
      { type: 'svgImportButton' },
      {
        id: 'showOutlines',
        label: 'Show Outlines',
        type: 'checkbox',
      },
      ...(window.Vectura.FillPanel?.buildFillControlDefs({
        fillTypeOptions: window.Vectura.FillPanel.FILL_TYPE_OPTIONS,
        typeParam: 'fillMode',
        densityParam: 'fillDensity',
        angleParam: 'fillAngle',
        amplitudeParam: 'fillAmplitude',
        paddingParam: 'fillPadding',
        dotSizeParam: 'fillDotSize',
        shiftXParam: 'fillShiftX',
        shiftYParam: 'fillShiftY',
        showIfBase: (p) => (p.importedGroups || []).some((g) => g.isClosed),
        descKeyPrefix: 'fill',
      }) || []),
      {
        id: 'autoFit',
        label: 'Auto Fit to Canvas',
        type: 'checkbox',
      },
      {
        id: 'noiseTarget',
        label: 'Apply Noise To',
        type: 'select',
        options: [
          { value: 'all', label: 'All Paths' },
          { value: 'outlines', label: 'Outlines Only' },
          { value: 'fills', label: 'Fills Only' },
        ],
        showIf: (p) => (p.noises || []).some((n) => n.enabled !== false),
      },
      { type: 'noiseList' },
    ],
    pattern: [
      {
        id: 'patternFilter',
        label: 'Filter',
        type: 'select',
        options: [
          { value: 'all', label: 'All Patterns' },
          { value: 'lines', label: 'Lines Only' },
          { value: 'fills', label: 'Patterns with Fills' }
        ],
      },
      { type: 'patternSelect' },
      { type: 'patternDesignerInline' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.1, max: 10, step: 0.1 },
      { id: 'originX', label: 'X Origin Offset', type: 'range', min: -500, max: 500, step: 1 },
      { id: 'originY', label: 'Y Origin Offset', type: 'range', min: -500, max: 500, step: 1 },
      {
        id: 'tileMethod',
        label: 'Tile Method',
        type: 'select',
        options: [
          { value: 'off', label: 'Off (single tile)' },
          { value: 'grid', label: 'Grid' },
          { value: 'brick', label: 'Brick (Offset)' },
          { value: 'hexagonal', label: 'Hexagonal' }
        ]
      },
      { id: 'tileSpacingX', label: 'Tile Spacing X', type: 'range', min: -100, max: 500, step: 1 },
      { id: 'tileSpacingY', label: 'Tile Spacing Y', type: 'range', min: -100, max: 500, step: 1 },
      { id: 'removeSeams', label: 'Remove seams at join', type: 'checkbox' },
      { id: 'curves', label: 'Curves', type: 'checkbox' },
      { id: 'tileEdgeCurves', label: 'Curves at tile edges', type: 'checkbox', showIf: (p) => !!p.curves },
      { type: 'patternSubPens' },
    ],
    flowfield: [
      {
        id: 'flowMode',
        label: 'Flow Mode',
        type: 'select',
        options: [
          { value: 'angle', label: 'Angle' },
          { value: 'curl', label: 'Curl' },
        ],
        infoKey: 'flowfield.flowMode',
      },
      { type: 'noiseList' },
      {
        id: 'density',
        label: 'Density',
        type: 'range',
        min: 200,
        max: 12000,
        step: 100,
        confirmAbove: 6000,
        confirmMessage: 'High density can be slow. Continue?',
        randomMax: 4000,
        infoKey: 'flowfield.density',
      },
      { id: 'stepLen', label: 'Step Length', type: 'range', min: 0.5, max: 30, step: 0.5, infoKey: 'flowfield.stepLen' },
      {
        id: 'maxSteps',
        label: 'Max Steps',
        type: 'range',
        min: 20,
        max: 2000,
        step: 10,
        confirmAbove: 1000,
        confirmMessage: 'Large step counts can be slow. Continue?',
        randomMax: 600,
        infoKey: 'flowfield.maxSteps',
      },
      { id: 'force', label: 'Flow Force', type: 'range', min: 0.1, max: 6.0, step: 0.1, infoKey: 'flowfield.force' },
      {
        id: 'angleOffset',
        label: 'Angle Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'flowfield.angleOffset',
      },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 3.0, step: 0.05, infoKey: 'flowfield.chaos' },
      { id: 'minSteps', label: 'Minimum Steps', type: 'range', min: 2, max: 200, step: 2, infoKey: 'flowfield.minSteps' },
      { id: 'minLength', label: 'Minimum Length', type: 'range', min: 0, max: 200, step: 2, infoKey: 'flowfield.minLength' },
    ],
    lissajous: [
      { id: 'freqX', label: 'Freq X', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqX' },
      { id: 'freqY', label: 'Freq Y', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqY' },
      { id: 'damping', label: 'Damping', type: 'range', min: 0, max: 0.01, step: 0.0001, infoKey: 'lissajous.damping' },
      { id: 'phase', label: 'Phase', type: 'range', min: 0, max: 6.28, step: 0.1, infoKey: 'lissajous.phase' },
      { id: 'resolution', label: 'Resolution', type: 'range', min: 50, max: 800, step: 10, infoKey: 'lissajous.resolution' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1.2, step: 0.05, infoKey: 'lissajous.scale' },
      { id: 'truncateStart', label: 'Truncate Start', type: 'range', min: 0, max: 100, step: 1, infoKey: 'lissajous.truncateStart' },
      { id: 'truncateEnd', label: 'Truncate End', type: 'range', min: 0, max: 100, step: 1, infoKey: 'lissajous.truncateEnd' },
      { id: 'closeLines', label: 'Close Lines', type: 'checkbox', infoKey: 'lissajous.closeLines' },
    ],
    harmonograph: [
      { type: 'section', label: 'Render' },
      {
        id: 'renderMode',
        label: 'Render Mode',
        type: 'select',
        options: [
          { value: 'line', label: 'Line' },
          { value: 'dashed', label: 'Dashed Line' },
          { value: 'points', label: 'Point Field' },
          { value: 'segments', label: 'Segments' },
        ],
        infoKey: 'harmonograph.renderMode',
      },
      { id: 'samples', label: 'Samples', type: 'range', min: 400, max: 12000, step: 100, infoKey: 'harmonograph.samples' },
      { id: 'duration', label: 'Duration (s)', type: 'range', min: 5, max: 120, step: 1, infoKey: 'harmonograph.duration' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1.5, step: 0.05, infoKey: 'harmonograph.scale' },
      {
        id: 'paperRotation',
        label: 'Paper Rotation (Hz)',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        infoKey: 'harmonograph.paperRotation',
      },
      {
        id: 'widthMultiplier',
        label: 'Line Thickness',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'harmonograph.widthMultiplier',
      },
      {
        id: 'thickeningMode',
        label: 'Thickening Mode',
        type: 'select',
        options: [
          { value: 'parallel', label: 'Parallel' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
        ],
        infoKey: 'harmonograph.thickeningMode',
      },
      {
        id: 'loopDrift',
        label: 'Anti-Loop Drift',
        type: 'range',
        min: 0,
        max: 0.08,
        step: 0.0005,
        infoKey: 'harmonograph.loopDrift',
      },
      {
        id: 'settleThreshold',
        label: 'Settle Cutoff',
        type: 'range',
        min: 0,
        max: 40,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.settleThreshold',
      },
      {
        id: 'dashLength',
        label: 'Dash Length (mm)',
        type: 'range',
        min: 0.5,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.dashLength',
        showIf: (p) => p.renderMode === 'dashed',
      },
      {
        id: 'dashGap',
        label: 'Dash Gap (mm)',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.dashGap',
        showIf: (p) => p.renderMode === 'dashed',
      },
      {
        id: 'pointStride',
        label: 'Point Stride',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
        infoKey: 'harmonograph.pointStride',
        showIf: (p) => p.renderMode === 'points',
      },
      {
        id: 'pointSize',
        label: 'Point Size (mm)',
        type: 'range',
        min: 0.1,
        max: 2,
        step: 0.1,
        infoKey: 'harmonograph.pointSize',
        showIf: (p) => p.renderMode === 'points',
      },
      {
        id: 'segmentStride',
        label: 'Segment Stride',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
        infoKey: 'harmonograph.segmentStride',
        showIf: (p) => p.renderMode === 'segments',
      },
      {
        id: 'segmentLength',
        label: 'Segment Length (mm)',
        type: 'range',
        min: 1,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.segmentLength',
        showIf: (p) => p.renderMode === 'segments',
      },
      {
        id: 'gapSize',
        label: 'Gap Size',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.gapSize',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      {
        id: 'gapOffset',
        label: 'Gap Offset',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.gapOffset',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      {
        id: 'gapRandomness',
        label: 'Spacing Randomness',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'harmonograph.gapRandomness',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      { type: 'pendulumList' },
      { type: 'harmonographPlotter' },
      { type: 'section', label: 'Pendulum Guides' },
      {
        id: 'showPendulumGuides',
        label: 'Show Guides',
        type: 'checkbox',
        infoKey: 'harmonograph.showPendulumGuides',
      },
      {
        id: 'pendulumGuideColor',
        label: 'Guide Color',
        type: 'colorModal',
        infoKey: 'harmonograph.pendulumGuideColor',
        showIf: (p) => Boolean(p.showPendulumGuides),
      },
      {
        id: 'pendulumGuideWidth',
        label: 'Guide Thickness (mm)',
        type: 'range',
        min: 0.05,
        max: 2,
        step: 0.05,
        displayUnit: 'mm',
        infoKey: 'harmonograph.pendulumGuideWidth',
        showIf: (p) => Boolean(p.showPendulumGuides),
      },
    ],
    petalis: [
      { type: 'section', label: 'Presets' },
      {
        id: 'preset',
        label: 'Preset',
        type: 'select',
        options: PETALIS_PRESET_OPTIONS,
        infoKey: 'petalis.preset',
      },
      { type: 'section', label: 'Petal Geometry' },
      {
        id: 'petalProfile',
        label: 'Petal Profile',
        type: 'select',
        options: PETAL_PROFILE_OPTIONS,
        infoKey: 'petalis.petalProfile',
      },
      { id: 'petalScale', label: 'Petal Scale (mm)', type: 'range', min: 1, max: 80, step: 1, infoKey: 'petalis.petalScale' },
      {
        id: 'petalWidthRatio',
        label: 'Width/Length Ratio',
        type: 'range',
        min: 0.01,
        max: 2,
        step: 0.01,
        infoKey: 'petalis.petalWidthRatio',
      },
      { id: 'petalLengthRatio', label: 'Length Ratio', type: 'range', min: 0.1, max: 5, step: 0.05, infoKey: 'petalis.petalLengthRatio' },
      { id: 'petalSizeRatio', label: 'Size Ratio', type: 'range', min: 0.01, max: 5, step: 0.05, infoKey: 'petalis.petalSizeRatio' },
      { id: 'leafSidePos', label: 'Side Position', type: 'range', min: 0.1, max: 0.9, step: 0.01, infoKey: 'petalis.leafSidePos' },
      { id: 'leafSideWidth', label: 'Side Width', type: 'range', min: 0.2, max: 2, step: 0.01, infoKey: 'petalis.leafSideWidth' },
      { id: 'petalSteps', label: 'Petal Resolution', type: 'range', min: 12, max: 80, step: 2, infoKey: 'petalis.petalSteps' },
      { id: 'layering', label: 'Layering', type: 'checkbox', infoKey: 'petalis.layering' },
      {
        id: 'anchorToCenter',
        label: 'Anchor to Center Ring',
        type: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'central', label: 'Central Petals Only' },
          { value: 'all', label: 'All Petals' },
        ],
        infoKey: 'petalis.anchorToCenter',
      },
      {
        id: 'anchorRadiusRatio',
        label: 'Anchor Radius Ratio',
        type: 'range',
        min: 0.2,
        max: 3,
        step: 0.05,
        showIf: (p) => p.anchorToCenter && p.anchorToCenter !== 'off',
        infoKey: 'petalis.anchorRadiusRatio',
      },
      { id: 'tipSharpness', label: 'Tip Sharpness', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.tipSharpness' },
      { id: 'tipTwist', label: 'Tip Rotate', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.tipTwist' },
      { id: 'centerCurlBoost', label: 'Center Tip Rotate Boost', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.centerCurlBoost' },
      { id: 'tipCurl', label: 'Tip Rounding', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.tipCurl' },
      { id: 'baseFlare', label: 'Base Flare', type: 'range', min: 0, max: 5, step: 0.05, infoKey: 'petalis.baseFlare' },
      { id: 'basePinch', label: 'Base Pinch', type: 'range', min: 0, max: 5, step: 0.05, infoKey: 'petalis.basePinch' },
      { id: 'edgeWaveAmp', label: 'Edge Wave Amp', type: 'range', min: 0, max: 0.6, step: 0.01, infoKey: 'petalis.edgeWaveAmp' },
      { id: 'edgeWaveFreq', label: 'Edge Wave Freq', type: 'range', min: 0, max: 14, step: 0.5, infoKey: 'petalis.edgeWaveFreq' },
      { id: 'centerWaveBoost', label: 'Center Wave Boost', type: 'range', min: 0, max: 2, step: 0.05, infoKey: 'petalis.centerWaveBoost' },
      { type: 'section', label: 'Petal Modifiers' },
      { type: 'petalModifierList', label: 'Petal Modifiers' },
      { type: 'section', label: 'Distribution & Spiral' },
      { id: 'count', label: 'Petal Count', type: 'range', min: 5, max: 800, step: 1, infoKey: 'petalis.count' },
      {
        id: 'ringMode',
        label: 'Ring Mode',
        type: 'select',
        options: [
          { value: 'single', label: 'Single' },
          { value: 'dual', label: 'Dual' },
        ],
        infoKey: 'petalis.ringMode',
      },
      {
        id: 'innerCount',
        label: 'Inner Petal Count',
        type: 'range',
        min: 5,
        max: 400,
        step: 1,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.innerCount',
      },
      {
        id: 'outerCount',
        label: 'Outer Petal Count',
        type: 'range',
        min: 5,
        max: 600,
        step: 1,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.outerCount',
      },
      {
        id: 'ringSplit',
        label: 'Ring Split',
        type: 'range',
        min: 0.15,
        max: 0.85,
        step: 0.01,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.ringSplit',
      },
      {
        id: 'innerOuterLock',
        label: 'Inner = Outer',
        type: 'checkbox',
        infoKey: 'petalis.innerOuterLock',
      },
      {
        id: 'profileTransitionPosition',
        label: 'Profile Transition Position (%)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        displayUnit: '%',
        infoKey: 'petalis.profileTransitionPosition',
      },
      {
        id: 'profileTransitionFeather',
        label: 'Profile Transition Feather (%)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        displayUnit: '%',
        infoKey: 'petalis.profileTransitionFeather',
      },
      {
        id: 'ringOffset',
        label: 'Ring Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.ringOffset',
      },
      {
        id: 'spiralMode',
        label: 'Phyllotaxis Mode',
        type: 'select',
        options: [
          { value: 'golden', label: 'Golden Angle' },
          { value: 'custom', label: 'Custom Angle' },
        ],
        infoKey: 'petalis.spiralMode',
      },
      {
        id: 'customAngle',
        label: 'Custom Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => p.spiralMode === 'custom',
        infoKey: 'petalis.customAngle',
      },
      { id: 'spiralTightness', label: 'Spiral Tightness', type: 'range', min: 0.5, max: 50, step: 0.1, infoKey: 'petalis.spiralTightness' },
      { id: 'radialGrowth', label: 'Radial Growth', type: 'range', min: 0.05, max: 20, step: 0.05, infoKey: 'petalis.radialGrowth' },
      { id: 'spiralStart', label: 'Spiral Start', type: 'range', min: 0, max: 1, step: 0.01, infoKey: 'petalis.spiralStart' },
      { id: 'spiralEnd', label: 'Spiral End', type: 'range', min: 0, max: 1, step: 0.01, infoKey: 'petalis.spiralEnd' },
      { type: 'section', label: 'Center Morphing' },
      { id: 'centerSizeMorph', label: 'Size Morph', type: 'range', min: -100, max: 100, step: 1, infoKey: 'petalis.centerSizeMorph' },
      { id: 'centerSizeCurve', label: 'Size Morph Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05, infoKey: 'petalis.centerSizeCurve' },
      { id: 'centerShapeMorph', label: 'Shape Morph', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerShapeMorph' },
      {
        id: 'centerProfile',
        label: 'Center Profile',
        type: 'select',
        options: PETAL_PROFILE_OPTIONS,
        infoKey: 'petalis.centerProfile',
      },
      { id: 'budMode', label: 'Bud Mode', type: 'checkbox', infoKey: 'petalis.budMode' },
      { id: 'budRadius', label: 'Bud Radius', type: 'range', min: 0.05, max: 2, step: 0.01, showIf: (p) => p.budMode, infoKey: 'petalis.budRadius' },
      { id: 'budTightness', label: 'Bud Tightness', type: 'range', min: 0, max: 10, step: 0.1, showIf: (p) => p.budMode, infoKey: 'petalis.budTightness' },
      { type: 'section', label: 'Central Elements' },
      {
        id: 'centerType',
        label: 'Center Type',
        type: 'select',
        options: [
          { value: 'disk', label: 'Disk' },
          { value: 'dome', label: 'Dome' },
          { value: 'starburst', label: 'Starburst' },
          { value: 'dot', label: 'Dot Field' },
          { value: 'filament', label: 'Filament Cluster' },
        ],
        infoKey: 'petalis.centerType',
      },
      { id: 'centerRadius', label: 'Center Radius (mm)', type: 'range', min: 2, max: 40, step: 1, infoKey: 'petalis.centerRadius' },
      { id: 'centerDensity', label: 'Center Density', type: 'range', min: 4, max: 120, step: 1, infoKey: 'petalis.centerDensity' },
      { id: 'centerFalloff', label: 'Center Falloff', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerFalloff' },
      { id: 'centerRing', label: 'Secondary Ring', type: 'checkbox', infoKey: 'petalis.centerRing' },
      { id: 'centerRingRadius', label: 'Ring Radius (mm)', type: 'range', min: 3, max: 60, step: 1, showIf: (p) => p.centerRing, infoKey: 'petalis.centerRingRadius' },
      { id: 'centerRingDensity', label: 'Ring Density', type: 'range', min: 6, max: 120, step: 1, showIf: (p) => p.centerRing, infoKey: 'petalis.centerRingDensity' },
      { id: 'centerConnectors', label: 'Connect to Petals', type: 'checkbox', infoKey: 'petalis.centerConnectors' },
      { id: 'connectorCount', label: 'Connector Count', type: 'range', min: 4, max: 120, step: 1, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorCount' },
      { id: 'connectorLength', label: 'Connector Length (mm)', type: 'range', min: 2, max: 40, step: 1, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorLength' },
      { id: 'connectorJitter', label: 'Connector Jitter', type: 'range', min: 0, max: 1, step: 0.05, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorJitter' },
      { type: 'modifierList', label: 'Center Modifiers' },
      { type: 'section', label: 'Randomness & Seed' },
      { id: 'countJitter', label: 'Count Jitter', type: 'range', min: 0, max: 0.5, step: 0.01, infoKey: 'petalis.countJitter' },
      { id: 'sizeJitter', label: 'Size Jitter', type: 'range', min: 0, max: 0.5, step: 0.01, infoKey: 'petalis.sizeJitter' },
      {
        id: 'rotationJitter',
        label: 'Rotation Jitter',
        type: 'angle',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'petalis.rotationJitter',
      },
      {
        id: 'angularDrift',
        label: 'Angular Drift',
        type: 'angle',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'petalis.angularDrift',
      },
      { id: 'driftStrength', label: 'Drift Strength', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.driftStrength' },
      { type: 'noiseList', source: 'petalisDrift', label: 'Drift Noise Rack' },
      { id: 'radiusScale', label: 'Radius Scale', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'petalis.radiusScale' },
      { id: 'radiusScaleCurve', label: 'Radius Scale Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05, infoKey: 'petalis.radiusScaleCurve' },
    ],
    wavetable: [
      {
        id: 'lineStructure',
        label: 'Line Structure',
        type: 'select',
        options: [
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'horizontal-vertical', label: 'Horizontal & Vertical' },
          { value: 'isometric', label: 'Isometric' },
          { value: 'lattice', label: 'Lattice' },
        ],
        infoKey: 'wavetable.lineStructure',
      },
      {
        id: 'lines',
        label: 'Lines',
        type: 'range',
        min: 5,
        max: 500,
        step: 1,
        infoKey: 'wavetable.lines',
      },
      { id: 'gap', label: 'Line Gap', type: 'range', min: 0.5, max: 3.0, step: 0.1, infoKey: 'wavetable.gap' },
      { id: 'tilt', label: 'Row Shift', type: 'range', min: -12, max: 12, step: 1, infoKey: 'wavetable.tilt' },
      {
        id: 'lineOffset',
        label: 'Line Offset Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'wavetable.lineOffset',
      },
      {
        id: 'continuity',
        label: 'Continuity',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'single', label: 'Single' },
          { value: 'double', label: 'Double' },
        ],
        infoKey: 'wavetable.continuity',
      },
      { type: 'noiseList' },
      { type: 'section', label: 'Edge Noise Dampening' },
      {
        id: 'edgeFadeMode',
        label: 'Edge Noise Dampening Mode',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'wavetable.edgeFadeMode',
      },
      {
        id: 'edgeFade',
        label: 'Edge Noise Dampening Amount',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFade',
      },
      {
        id: 'edgeFadeThreshold',
        label: 'Edge Noise Dampening Threshold',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFadeThreshold',
      },
      {
        id: 'edgeFadeFeather',
        label: 'Edge Noise Dampening Feather',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFadeFeather',
      },
      { type: 'section', label: 'Vertical Noise Dampening' },
      {
        id: 'verticalFadeMode',
        label: 'Vertical Noise Dampening Mode',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'wavetable.verticalFadeMode',
      },
      {
        id: 'verticalFade',
        label: 'Vertical Noise Dampening Amount',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFade',
      },
      {
        id: 'verticalFadeThreshold',
        label: 'Vertical Noise Dampening Threshold',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFadeThreshold',
      },
      {
        id: 'verticalFadeFeather',
        label: 'Vertical Noise Dampening Feather',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFadeFeather',
      },
      { id: 'dampenExtremes', label: 'Dampen Extremes', type: 'checkbox', infoKey: 'wavetable.dampenExtremes' },
      {
        id: 'overlapPadding',
        label: 'Overlap Padding (mm)',
        type: 'range',
        min: 0,
        max: 5,
        step: 0.1,
        infoKey: 'wavetable.overlapPadding',
      },
      { id: 'flatCaps', label: 'Flat Top/Bottom', type: 'checkbox', infoKey: 'wavetable.flatCaps' },
    ],
    rings: [
      { type: 'noiseList' },
      { type: 'section', label: 'Ring Structure' },
      { id: 'rings', label: 'Rings', type: 'range', min: 1, max: 120, step: 1, infoKey: 'rings.rings' },
      { id: 'centerDiameter', label: 'Center Diameter', type: 'range', min: 0, max: 500, step: 1, infoKey: 'rings.centerDiameter' },
      { id: 'outerDiameter', label: 'Outer Diameter', type: 'range', min: 1, max: 500, step: 1, infoKey: 'rings.outerDiameter' },
      { type: 'section', label: 'Ring Spacing' },
      { id: 'gap', label: 'Ring Gap', type: 'range', min: 0.4, max: 3.0, step: 0.1, infoKey: 'rings.gap' },
      { id: 'gapCurveStart', label: 'Inner Gap', type: 'range', min: 0.3, max: 10, step: 0.05, infoKey: 'rings.gapCurveStart' },
      { id: 'gapCurveEnd', label: 'Outer Gap', type: 'range', min: 0.3, max: 3.0, step: 0.05, infoKey: 'rings.gapCurveEnd' },
      { id: 'spacingVariance', label: 'Spacing Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.spacingVariance' },
      { type: 'section', label: 'Growth Character' },
      { id: 'offsetX', label: 'Center Offset X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'rings.offsetX' },
      { id: 'offsetY', label: 'Center Offset Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'rings.offsetY' },
      { id: 'centerDrift', label: 'Center Drift', type: 'range', min: 0, max: 5, step: 0.1, infoKey: 'rings.centerDrift' },
      { id: 'biasStrength', label: 'Bias Strength', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.biasStrength' },
      { id: 'biasAngle', label: 'Bias Direction', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°', infoKey: 'rings.biasAngle', showIf: (p) => (p.biasStrength ?? 0) > 0 },
      { type: 'collapsibleGroup', label: 'Tree Ring Parameters' },
      { type: 'section', label: 'Bark Zone' },
      { id: 'barkRings', label: 'Bark Rings', type: 'range', min: 0, max: 24, step: 1, infoKey: 'rings.barkRings' },
      { id: 'barkType', label: 'Bark Style', type: 'select', options: [
          { value: 'smooth',     label: 'Smooth' },
          { value: 'rough',      label: 'Rough' },
          { value: 'furrowed',   label: 'Furrowed' },
          { value: 'plated',     label: 'Plated' },
          { value: 'papery',     label: 'Papery' },
          { value: 'fibrous',    label: 'Fibrous' },
          { value: 'scaly',      label: 'Scaly' },
          { value: 'cracked',    label: 'Cracked' },
          { value: 'lenticular', label: 'Lenticular' },
          { value: 'woven',      label: 'Woven' },
        ], infoKey: 'rings.barkType', showIf: (p) => (p.barkRings ?? 0) > 0 },
      { id: 'barkGap', label: 'Bark Gap', type: 'range', min: 0, max: 10, step: 0.1, infoKey: 'rings.barkGap', showIf: (p) => (p.barkRings ?? 0) > 0 },
      // rough
      { id: 'barkRoughness', label: 'Roughness', type: 'range', min: 0, max: 20, step: 0.5, infoKey: 'rings.barkRoughness', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'rough' },
      { id: 'barkRoughnessConfinement', label: 'Confinement', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkRoughnessConfinement', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'rough' },
      { id: 'barkFreq', label: 'Frequency', type: 'range', min: 1, max: 20, step: 0.5, infoKey: 'rings.barkFreq', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'rough' },
      // furrowed
      { id: 'barkFurrowCount', label: 'Furrow Count', type: 'range', min: 3, max: 40, step: 1, infoKey: 'rings.barkFurrowCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'furrowed' },
      { id: 'barkFurrowDepth', label: 'Furrow Depth', type: 'range', min: 0.5, max: 15, step: 0.5, infoKey: 'rings.barkFurrowDepth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'furrowed' },
      { id: 'barkFurrowWidth', label: 'Furrow Width', type: 'range', min: 0.02, max: 0.5, step: 0.02, infoKey: 'rings.barkFurrowWidth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'furrowed' },
      // plated
      { id: 'barkPlateCount', label: 'Plate Count', type: 'range', min: 4, max: 32, step: 1, infoKey: 'rings.barkPlateCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'plated' },
      { id: 'barkPlateRelief', label: 'Plate Relief', type: 'range', min: 0.5, max: 12, step: 0.5, infoKey: 'rings.barkPlateRelief', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'plated' },
      { id: 'barkPlateVariance', label: 'Plate Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkPlateVariance', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'plated' },
      // papery
      { id: 'barkPaperStrips', label: 'Strip Count', type: 'range', min: 2, max: 20, step: 1, infoKey: 'rings.barkPaperStrips', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'papery' },
      { id: 'barkPaperPeel', label: 'Peel Lift', type: 'range', min: 0, max: 10, step: 0.5, infoKey: 'rings.barkPaperPeel', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'papery' },
      { id: 'barkPaperJitter', label: 'Strip Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkPaperJitter', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'papery' },
      // fibrous
      { id: 'barkFiberCount', label: 'Fiber Count', type: 'range', min: 6, max: 80, step: 1, infoKey: 'rings.barkFiberCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'fibrous' },
      { id: 'barkFiberAmplitude', label: 'Fiber Amplitude', type: 'range', min: 0.5, max: 10, step: 0.5, infoKey: 'rings.barkFiberAmplitude', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'fibrous' },
      { id: 'barkFiberPhaseShift', label: 'Phase Shift', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkFiberPhaseShift', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'fibrous' },
      // scaly
      { id: 'barkScaleColumns', label: 'Scale Count', type: 'range', min: 6, max: 40, step: 1, infoKey: 'rings.barkScaleColumns', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'scaly' },
      { id: 'barkScaleRelief', label: 'Scale Relief', type: 'range', min: 0.5, max: 10, step: 0.5, infoKey: 'rings.barkScaleRelief', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'scaly' },
      { id: 'barkScaleTaper', label: 'Scale Taper', type: 'range', min: 0.1, max: 1, step: 0.05, infoKey: 'rings.barkScaleTaper', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'scaly' },
      // cracked
      { id: 'barkCrackDensity', label: 'Crack Count', type: 'range', min: 2, max: 30, step: 1, infoKey: 'rings.barkCrackDensity', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'cracked' },
      { id: 'barkCrackDepth', label: 'Crack Depth', type: 'range', min: 0.5, max: 15, step: 0.5, infoKey: 'rings.barkCrackDepth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'cracked' },
      { id: 'barkCrackWidth', label: 'Crack Width', type: 'range', min: 0.01, max: 0.3, step: 0.01, infoKey: 'rings.barkCrackWidth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'cracked' },
      // lenticular
      { id: 'barkLenticleCount', label: 'Lenticle Count', type: 'range', min: 4, max: 40, step: 1, infoKey: 'rings.barkLenticleCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'lenticular' },
      { id: 'barkLenticleDepth', label: 'Lenticle Depth', type: 'range', min: 0.5, max: 10, step: 0.5, infoKey: 'rings.barkLenticleDepth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'lenticular' },
      { id: 'barkLenticleWidth', label: 'Lenticle Width', type: 'range', min: 0.02, max: 0.4, step: 0.02, infoKey: 'rings.barkLenticleWidth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'lenticular' },
      // woven
      { id: 'barkWeaveFreq', label: 'Weave Frequency', type: 'range', min: 2, max: 20, step: 0.5, infoKey: 'rings.barkWeaveFreq', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'woven' },
      { id: 'barkWeaveAmplitude', label: 'Weave Amplitude', type: 'range', min: 0.5, max: 8, step: 0.5, infoKey: 'rings.barkWeaveAmplitude', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'woven' },
      { id: 'barkWeaveAngle', label: 'Weave Angle', type: 'range', min: 0, max: 180, step: 1, infoKey: 'rings.barkWeaveAngle', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'woven' },
      { type: 'section', label: 'Thick Rings' },
      { id: 'thickRingCount', label: 'Cluster Count', type: 'range', min: 0, max: 12, step: 1, infoKey: 'rings.thickRingCount' },
      { id: 'thickRingDensity', label: 'Compression', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.thickRingDensity', showIf: (p) => (p.thickRingCount ?? 0) > 0 },
      { id: 'thickRingWidth', label: 'Cluster Width', type: 'range', min: 1, max: 12, step: 1, infoKey: 'rings.thickRingWidth', showIf: (p) => (p.thickRingCount ?? 0) > 0 },
      { id: 'thickRingSeed', label: 'Cluster Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.thickRingSeed', showIf: (p) => (p.thickRingCount ?? 0) > 0 },
      { type: 'section', label: 'Medullary Rays' },
      { id: 'rayCount', label: 'Ray Count', type: 'range', min: 0, max: 120, step: 1, infoKey: 'rings.rayCount' },
      { id: 'rayLength', label: 'Ray Length', type: 'rangeDual', minKey: 'rayMinLength', maxKey: 'rayMaxLength', min: 0.1, max: 10, step: 0.1, infoKey: 'rings.rayLength', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { id: 'rayLengthVariance', label: 'Length Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.rayLengthVariance', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { id: 'rayInnerFraction', label: 'Ray Start', type: 'range', min: 0, max: 0.7, step: 0.05, infoKey: 'rings.rayInnerFraction', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { id: 'raySeed', label: 'Ray Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.raySeed', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { type: 'section', label: 'Knots' },
      { id: 'knotCount', label: 'Knot Count', type: 'range', min: 0, max: 30, step: 1, infoKey: 'rings.knotCount' },
      { id: 'knotSeed', label: 'Knot Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.knotSeed', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotSize', label: 'Knot Ring Reach', type: 'rangeDual', minKey: 'knotMinSize', maxKey: 'knotMaxSize', min: 0.5, max: 20, step: 0.5, infoKey: 'rings.knotSize', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotSizeVariance', label: 'Knot Size Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.knotSizeVariance', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotIntensity', label: 'Knot Strength', type: 'range', min: 0, max: 2, step: 0.05, infoKey: 'rings.knotIntensity', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotStrengthVariance', label: 'Knot Strength Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.knotStrengthVariance', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotSpread', label: 'Knot Size', type: 'range', min: 5, max: 90, step: 1, infoKey: 'rings.knotSpread', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotDirection', label: 'Knot Direction', type: 'select', options: [{ value: 'outer', label: 'Outer' }, { value: 'inner', label: 'Inner' }, { value: 'both', label: 'Both' }], infoKey: 'rings.knotDirection', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { type: 'section', label: 'V-Markings' },
      { id: 'vMarkCount', label: 'V-Mark Count', type: 'range', min: 0, max: 10, step: 1, infoKey: 'rings.vMarkCount' },
      { id: 'vMarkDepth', label: 'V-Mark Depth', type: 'range', min: 0, max: 60, step: 1, infoKey: 'rings.vMarkDepth', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { id: 'vMarkSpread', label: 'V-Mark Spread', type: 'range', min: 1, max: 60, step: 1, infoKey: 'rings.vMarkSpread', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { id: 'vMarkSize', label: 'Ring Reach (%)', type: 'range', min: 0, max: 100, step: 1, infoKey: 'rings.vMarkSize', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { id: 'vMarkSeed', label: 'V-Mark Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.vMarkSeed', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { type: 'section', label: 'Radial Breaks' },
      { id: 'breakCount', label: 'Break Count', type: 'range', min: 0, max: 20, step: 1, infoKey: 'rings.breakCount' },
      { id: 'breakRadius', label: 'Break Radius (%)', type: 'rangeDual', minKey: 'breakRadiusMin', maxKey: 'breakRadiusMax', min: 0, max: 100, step: 1, infoKey: 'rings.breakRadius', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakLengthVariance', label: 'Radius Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.breakLengthVariance', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakNoiseSeed', label: 'Break Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.breakNoiseSeed', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakWidth', label: 'Break Width (°)', type: 'rangeDual', minKey: 'breakWidthMin', maxKey: 'breakWidthMax', min: 0.5, max: 30, step: 0.5, infoKey: 'rings.breakWidth', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakWidthVariance', label: 'Width Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.breakWidthVariance', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { type: 'section', label: 'Cracks' },
      { id: 'crackCount', label: 'Crack Count', type: 'range', min: 0, max: 12, step: 1, infoKey: 'rings.crackCount' },
      { id: 'crackDepth', label: 'Crack Depth', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.crackDepth', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackSpread', label: 'Crack Width (°)', type: 'range', min: 0.5, max: 20, step: 0.5, infoKey: 'rings.crackSpread', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackNoise', label: 'Crack Roughness', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.crackNoise', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackSeed', label: 'Crack Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.crackSeed', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackOutline', label: 'Crack Outline', type: 'checkbox', infoKey: 'rings.crackOutline', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { type: 'section', label: 'Scars' },
      { id: 'scarCount', label: 'Scar Count', type: 'range', min: 0, max: 6, step: 1, infoKey: 'rings.scarCount' },
      { id: 'scarDepth', label: 'Scar Depth', type: 'range', min: 0, max: 80, step: 1, infoKey: 'rings.scarDepth', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { id: 'scarWidth', label: 'Scar Width', type: 'range', min: 0.5, max: 180, step: 0.5, infoKey: 'rings.scarWidth', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { id: 'scarSize', label: 'Healing Rate', type: 'range', min: 1, max: 30, step: 1, infoKey: 'rings.scarSize', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { id: 'scarSeed', label: 'Scar Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.scarSeed', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { type: 'collapsibleGroupEnd' },
    ],
    topo: [
      { id: 'resolution', label: 'Resolution', type: 'range', min: 40, max: 240, step: 5, infoKey: 'topo.resolution' },
      { id: 'levels', label: 'Contour Levels', type: 'range', min: 4, max: 60, step: 1, infoKey: 'topo.levels' },
      { type: 'noiseList' },
      { id: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.05, infoKey: 'topo.sensitivity' },
      { id: 'thresholdOffset', label: 'Threshold Offset', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'topo.thresholdOffset' },
      {
        id: 'mappingMode',
        label: 'Mapping Mode',
        type: 'select',
        options: [
          { value: 'marching', label: 'Marching Squares' },
          { value: 'smooth', label: 'Smooth' },
          { value: 'bezier', label: 'Quadratic Bezier' },
          { value: 'gradient', label: 'Gradient Trace' },
        ],
        infoKey: 'topo.mappingMode',
      },
    ],
    rainfall: [
      { id: 'count', label: 'Drop Count', type: 'range', min: 20, max: 2000, step: 10, infoKey: 'rainfall.count' },
      { id: 'traceLength', label: 'Trace Length', type: 'range', min: 20, max: 400, step: 5, infoKey: 'rainfall.traceLength' },
      {
        id: 'lengthJitter',
        label: 'Length Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.lengthJitter',
      },
      { id: 'traceStep', label: 'Trace Step', type: 'range', min: 2, max: 20, step: 1, infoKey: 'rainfall.traceStep' },
      {
        id: 'stepJitter',
        label: 'Step Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.stepJitter',
      },
      { id: 'turbulence', label: 'Turbulence', type: 'range', min: 0, max: 1.5, step: 0.05, infoKey: 'rainfall.turbulence' },
      {
        id: 'gustStrength',
        label: 'Gust Strength',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.gustStrength',
      },
      {
        id: 'rainfallAngle',
        label: 'Rainfall Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.rainfallAngle',
      },
      {
        id: 'angleJitter',
        label: 'Angle Jitter',
        type: 'range',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'rainfall.angleJitter',
      },
      {
        id: 'windAngle',
        label: 'Wind Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.windAngle',
      },
      {
        id: 'dropRotate',
        label: 'Drop Head Rotate',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.dropRotate',
        showIf: (p) => p.dropShape !== 'none',
      },
      { id: 'windStrength', label: 'Wind Strength', type: 'range', min: 0, max: 1.5, step: 0.05, infoKey: 'rainfall.windStrength' },
      { id: 'dropSize', label: 'Droplet Size', type: 'range', min: 0, max: 12, step: 0.5, infoKey: 'rainfall.dropSize' },
      {
        id: 'dropSizeJitter',
        label: 'Drop Size Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.dropSizeJitter',
        showIf: (p) => p.dropShape !== 'none',
      },
      {
        id: 'dropShape',
        label: 'Droplet Shape',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' },
          { value: 'teardrop', label: 'Teardrop' },
        ],
        infoKey: 'rainfall.dropShape',
      },
      ...(window.Vectura.FillPanel?.buildFillControlDefs({
        fillTypeOptions: window.Vectura.FillPanel.FILL_TYPE_OPTIONS_RAINFALL,
        typeParam: 'dropFill',
        densityParam: 'fillDensity',
        angleParam: 'fillAngle',
        amplitudeParam: 'fillAmplitude',
        paddingParam: 'fillPadding',
        dotSizeParam: 'fillDotSize',
        shiftXParam: 'fillShiftX',
        shiftYParam: 'fillShiftY',
        showIfBase: (p) => p.dropShape !== 'none',
        descKeyPrefix: 'fill',
      }) || []),
      {
        id: 'widthMultiplier',
        label: 'Rain Width',
        type: 'range',
        min: 1,
        max: 4,
        step: 1,
        infoKey: 'rainfall.widthMultiplier',
      },
      {
        id: 'thickeningMode',
        label: 'Thickening Mode',
        type: 'select',
        options: [
          { value: 'parallel', label: 'Parallel' },
          { value: 'snake', label: 'Snake' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
        ],
        infoKey: 'rainfall.thickeningMode',
      },
      {
        id: 'trailBreaks',
        label: 'Trail Breaks',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'sparse', label: 'Sparse' },
          { value: 'regular', label: 'Regular' },
          { value: 'stutter', label: 'Stutter' },
          { value: 'dashes', label: 'Dashes' },
          { value: 'fade', label: 'Fade' },
          { value: 'burst', label: 'Burst' },
          { value: 'drop', label: 'Drop' },
          { value: 'drip', label: 'Drip' },
          { value: 'speckle', label: 'Speckle' },
        ],
        infoKey: 'rainfall.trailBreaks',
      },
      {
        id: 'breakRandomness',
        label: 'Break Randomness',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakRandomness',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakSpacing',
        label: 'Break Spacing',
        type: 'range',
        min: 2,
        max: 40,
        step: 1,
        infoKey: 'rainfall.breakSpacing',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakLengthJitter',
        label: 'Length Randomization',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakLengthJitter',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakWidthJitter',
        label: 'Width Randomization',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakWidthJitter',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'silhouetteId',
        label: 'Silhouette Image',
        type: 'image',
        accept: 'image/*',
        idKey: 'silhouetteId',
        nameKey: 'silhouetteName',
        infoKey: 'rainfall.silhouette',
        modalTitle: 'Select Silhouette Image',
        modalLabel: 'Silhouette Image',
        modalDescription: 'Drop a PNG/SVG with transparency; rain is generated inside opaque pixels.',
        dropLabel: 'Drop silhouette here',
      },
      {
        id: 'silhouetteWidth',
        label: 'Silhouette Width (mm)',
        type: 'range',
        min: 40,
        max: 400,
        step: 5,
        infoKey: 'rainfall.silhouetteWidth',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteHeight',
        label: 'Silhouette Height (mm)',
        type: 'range',
        min: 40,
        max: 400,
        step: 5,
        infoKey: 'rainfall.silhouetteHeight',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteTilesX',
        label: 'Tiling X',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'rainfall.silhouetteTilesX',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteTilesY',
        label: 'Tiling Y',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'rainfall.silhouetteTilesY',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteSpacing',
        label: 'Tile Spacing (mm)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'rainfall.silhouetteSpacing',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteOffsetX',
        label: 'Offset X (mm)',
        type: 'range',
        min: -200,
        max: 200,
        step: 1,
        infoKey: 'rainfall.silhouetteOffsetX',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteOffsetY',
        label: 'Offset Y (mm)',
        type: 'range',
        min: -200,
        max: 200,
        step: 1,
        infoKey: 'rainfall.silhouetteOffsetY',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteInvert',
        label: 'Invert Silhouette',
        type: 'checkbox',
        infoKey: 'rainfall.silhouetteInvert',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      { type: 'section', label: 'Noise Stack' },
      {
        id: 'noiseApply',
        label: 'Noise Target',
        type: 'select',
        options: [
          { value: 'trails', label: 'Trails' },
          { value: 'droplets', label: 'Droplets' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'rainfall.noiseApply',
      },
      { type: 'noiseList' },
    ],
    spiral: [
      { id: 'loops', label: 'Loops', type: 'range', min: 1, max: 150, step: 1, infoKey: 'spiral.loops' },
      { id: 'res', label: 'Points / Quadrant', type: 'range', min: 4, max: 120, step: 2, infoKey: 'spiral.res' },
      { id: 'startR', label: 'Inner Radius', type: 'range', min: 0, max: 60, step: 1, infoKey: 'spiral.startR' },
      { type: 'noiseList' },
      { id: 'pulseAmp', label: 'Pulse Amp', type: 'range', min: 0, max: 0.4, step: 0.01, infoKey: 'spiral.pulseAmp' },
      { id: 'pulseFreq', label: 'Pulse Freq', type: 'range', min: 0.5, max: 8, step: 0.1, infoKey: 'spiral.pulseFreq' },
      {
        id: 'angleOffset',
        label: 'Angle Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'spiral.angleOffset',
      },
      { id: 'axisSnap', label: 'Axis Snap', type: 'checkbox', infoKey: 'spiral.axisSnap' },
      { id: 'close', label: 'Close Spiral', type: 'checkbox', infoKey: 'spiral.close' },
      {
        id: 'closeFeather',
        label: 'Close Feather',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'spiral.closeFeather',
        showIf: (p) => Boolean(p.close),
      },
    ],
    grid: [
      { id: 'rows', label: 'Rows', type: 'range', min: 2, max: 60, step: 1, infoKey: 'grid.rows' },
      { id: 'cols', label: 'Cols', type: 'range', min: 2, max: 60, step: 1, infoKey: 'grid.cols' },
      { id: 'distortion', label: 'Distortion', type: 'range', min: 0, max: 40, step: 1, infoKey: 'grid.distortion' },
      { type: 'noiseList' },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 10, step: 0.1, infoKey: 'grid.chaos' },
      {
        id: 'type',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'warp', label: 'Warp' },
          { value: 'shift', label: 'Shift' },
        ],
        infoKey: 'grid.type',
      },
    ],
    phylla: [
      {
        id: 'shapeType',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'polygon', label: 'Polygon' },
        ],
        infoKey: 'phylla.shapeType',
      },
      { id: 'count', label: 'Count', type: 'range', min: 100, max: 2000, step: 50, infoKey: 'phylla.count' },
      { id: 'spacing', label: 'Spacing', type: 'range', min: 1, max: 10, step: 0.1, infoKey: 'phylla.spacing' },
      {
        id: 'angleStr',
        label: 'Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 0.01,
        displayUnit: '°',
        infoKey: 'phylla.angleStr',
      },
      { id: 'divergence', label: 'Divergence', type: 'range', min: 0.5, max: 2.5, step: 0.1, infoKey: 'phylla.divergence' },
      { id: 'noiseInf', label: 'Noise Infl.', type: 'range', min: 0, max: 20, step: 1, infoKey: 'phylla.noiseInf' },
      { type: 'noiseList' },
      { id: 'dotSize', label: 'Dot Size', type: 'range', min: 0.5, max: 3, step: 0.1, infoKey: 'phylla.dotSize' },
      {
        id: 'sides',
        label: 'Sides',
        type: 'range',
        min: 3,
        max: 100,
        step: 1,
        infoKey: 'phylla.sides',
        showIf: (params) => params.shapeType === 'polygon',
      },
      {
        id: 'sideJitter',
        label: 'Side Jitter',
        type: 'range',
        min: 0,
        max: 20,
        step: 1,
        infoKey: 'phylla.sideJitter',
        showIf: (params) => params.shapeType === 'polygon',
      },
    ],
    boids: [
      { id: 'count', label: 'Agents', type: 'range', min: 10, max: 300, step: 10, infoKey: 'boids.count' },
      { id: 'steps', label: 'Duration', type: 'range', min: 50, max: 400, step: 10, infoKey: 'boids.steps' },
      { id: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 6, step: 0.1, infoKey: 'boids.speed' },
      { id: 'sepDist', label: 'Separation', type: 'range', min: 5, max: 60, step: 1, infoKey: 'boids.sepDist' },
      { id: 'alignDist', label: 'Alignment', type: 'range', min: 5, max: 80, step: 1, infoKey: 'boids.alignDist' },
      { id: 'cohDist', label: 'Cohesion', type: 'range', min: 5, max: 80, step: 1, infoKey: 'boids.cohDist' },
      { id: 'force', label: 'Steer Force', type: 'range', min: 0.01, max: 0.3, step: 0.01, infoKey: 'boids.force' },
      { id: 'sepWeight', label: 'Separation Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.sepWeight' },
      { id: 'alignWeight', label: 'Alignment Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.alignWeight' },
      { id: 'cohWeight', label: 'Cohesion Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.cohWeight' },
      {
        id: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'birds', label: 'Birds' },
          { value: 'fish', label: 'Fish' },
        ],
        infoKey: 'boids.mode',
      },
    ],
    attractor: [
      {
        id: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'lorenz', label: 'Lorenz' },
          { value: 'aizawa', label: 'Aizawa' },
        ],
        infoKey: 'attractor.type',
      },
      { id: 'scale', label: 'Scale', type: 'range', min: 1, max: 10, step: 0.1, infoKey: 'attractor.scale' },
      { id: 'iter', label: 'Iterations', type: 'range', min: 300, max: 5000, step: 100, infoKey: 'attractor.iter' },
      { id: 'sigma', label: 'Sigma', type: 'range', min: 1, max: 30, step: 0.1, infoKey: 'attractor.sigma' },
      { id: 'rho', label: 'Rho', type: 'range', min: 5, max: 50, step: 0.1, infoKey: 'attractor.rho' },
      { id: 'beta', label: 'Beta', type: 'range', min: 0.5, max: 5, step: 0.1, infoKey: 'attractor.beta' },
      { id: 'dt', label: 'Time Step', type: 'range', min: 0.002, max: 0.03, step: 0.001, infoKey: 'attractor.dt' },
    ],
    hyphae: [
      { id: 'sources', label: 'Sources', type: 'range', min: 1, max: 10, step: 1, infoKey: 'hyphae.sources' },
      { id: 'steps', label: 'Growth Steps', type: 'range', min: 20, max: 200, step: 10, infoKey: 'hyphae.steps' },
      { id: 'branchProb', label: 'Branch Prob', type: 'range', min: 0, max: 0.2, step: 0.01, infoKey: 'hyphae.branchProb' },
      { id: 'angleVar', label: 'Wiggle', type: 'range', min: 0, max: 2.0, step: 0.1, infoKey: 'hyphae.angleVar' },
      { id: 'segLen', label: 'Segment Len', type: 'range', min: 1, max: 8, step: 0.1, infoKey: 'hyphae.segLen' },
      { id: 'maxBranches', label: 'Max Branches', type: 'range', min: 100, max: 3000, step: 50, infoKey: 'hyphae.maxBranches' },
    ],
    shapePack: [
      {
        id: 'shape',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'polygon', label: 'Polygon' },
        ],
        infoKey: 'shapePack.shape',
      },
      { id: 'count', label: 'Max Count', type: 'range', min: 20, max: 800, step: 20, infoKey: 'shapePack.count' },
      {
        id: 'radiusRange',
        label: 'Radius Range',
        type: 'rangeDual',
        min: 0.5,
        max: 200,
        step: 0.5,
        minKey: 'minR',
        maxKey: 'maxR',
        displayUnit: 'mm',
        infoKey: 'shapePack.radiusRange',
      },
      { id: 'padding', label: 'Padding', type: 'range', min: 0, max: 10, step: 0.5, infoKey: 'shapePack.padding' },
      { id: 'attempts', label: 'Attempts', type: 'range', min: 100, max: 5000, step: 100, infoKey: 'shapePack.attempts' },
      { id: 'segments', label: 'Segments', type: 'range', min: 3, max: 64, step: 1, infoKey: 'shapePack.segments' },
      { id: 'rotationStep', label: 'Rotation Step', type: 'range', min: -30, max: 30, step: 1, infoKey: 'shapePack.rotationStep' },
      {
        id: 'perspectiveType',
        label: 'Perspective',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'radial', label: 'Radial' },
        ],
        infoKey: 'shapePack.perspectiveType',
      },
      { id: 'perspective', label: 'Perspective Amt', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'shapePack.perspective' },
      { id: 'perspectiveX', label: 'Perspective X', type: 'range', min: -200, max: 200, step: 5, infoKey: 'shapePack.perspectiveX' },
      { id: 'perspectiveY', label: 'Perspective Y', type: 'range', min: -200, max: 200, step: 5, infoKey: 'shapePack.perspectiveY' },
    ],
    horizon: [
      { type: 'section', label: 'Perspective' },
      { id: 'horizonHeight', label: 'Horizon Height', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'vanishingPointX', label: 'Vanishing Point X', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Plane Density' },
      { id: 'horizontalLines', label: 'Horizontal Lines', type: 'range', min: 1, max: 120, step: 1 },
      { id: 'convergenceLines', label: 'Convergence Lines', type: 'range', min: 0, max: 120, step: 1 },
      { id: 'linkDensities', label: 'Link Densities', type: 'checkbox' },
      { type: 'section', label: 'Plane Spacing' },
      {
        id: 'horizontalSpacingMode',
        label: 'Horizontal Spacing',
        type: 'select',
        options: [
          { value: 'even', label: 'Even' },
          { value: 'perspective', label: 'Perspective' },
          { value: 'bias', label: 'Bias' },
        ],
      },
      { id: 'horizontalSpacingBias', label: 'Horizontal Bias', type: 'range', min: -100, max: 100, step: 1 },
      {
        id: 'convergenceSpacingMode',
        label: 'Convergence Spacing',
        type: 'select',
        options: [
          { value: 'even', label: 'Even' },
          { value: 'perspective', label: 'Perspective' },
          { value: 'bias', label: 'Bias' },
        ],
      },
      { id: 'convergenceSpacingBias', label: 'Convergence Bias', type: 'range', min: -100, max: 100, step: 1 },
      { id: 'fanReach', label: 'Fan Reach', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Terrain Shape' },
      { id: 'terrainDepth', label: 'Terrain Depth', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'terrainHeight', label: 'Terrain Height', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'floorHeight', label: 'Floor Height', type: 'range', min: -100, max: 100, step: 1 },
      { id: 'skylineRelief', label: 'Skyline Relief', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Center Region' },
      { id: 'centerWidth', label: 'Width', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerSoftness', label: 'Edge Softness', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerCompress', label: 'Compress at Horizon', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerDepth', label: 'Depth', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'shoulderLift', label: 'Shoulder Lift', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'ridgeSharpness', label: 'Ridge Sharpness', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerNoiseDampening', label: 'Noise Dampening', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Terrain Noise' },
      { id: 'terrainNoiseEnabled', label: 'Enable Mountain Surface', type: 'checkbox' },
      { id: 'mountainAmplitude', label: 'Mountain Amplitude', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'noiseMirror', label: 'Noise Mirror', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Additional Noises' },
      { type: 'noiseList' },
    ],
    terrain: [
      { type: 'section', label: 'Presets' },
      {
        id: 'preset',
        label: 'Style Preset',
        type: 'select',
        options: TERRAIN_PRESET_OPTIONS,
        infoKey: 'terrain.preset',
      },
      { type: 'section', label: 'Perspective' },
      {
        id: 'perspectiveMode',
        label: 'Perspective Mode',
        type: 'select',
        options: [
          { value: 'orthographic', label: 'Top-down (orthographic)' },
          { value: 'one-point', label: 'One-point' },
          { value: 'one-point-landscape', label: 'One-point with Landscape Horizon' },
          { value: 'two-point', label: 'Two-point' },
          { value: 'isometric', label: 'Isometric' },
        ],
        infoKey: 'terrain.perspectiveMode',
      },
      {
        id: 'horizonHeight',
        label: 'Horizon Height',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.horizonHeight',
        showIf: (p) => p.perspectiveMode === 'one-point' || p.perspectiveMode === 'one-point-landscape' || p.perspectiveMode === 'two-point',
      },
      {
        id: 'vanishingPointX',
        label: 'Vanishing Point X',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.vanishingPointX',
        showIf: (p) => p.perspectiveMode === 'one-point' || p.perspectiveMode === 'one-point-landscape',
      },
      {
        id: 'vpLeftX',
        label: 'Left VP X',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.vpLeftX',
        showIf: (p) => p.perspectiveMode === 'two-point',
      },
      {
        id: 'vpRightX',
        label: 'Right VP X',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.vpRightX',
        showIf: (p) => p.perspectiveMode === 'two-point',
      },
      {
        id: 'isoAngle',
        label: 'Isometric Angle',
        type: 'range',
        min: 15,
        max: 60,
        step: 1,
        displayUnit: '°',
        infoKey: 'terrain.isoAngle',
        showIf: (p) => p.perspectiveMode === 'isometric',
      },
      {
        id: 'depthCompression',
        label: 'Depth Compression',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.depthCompression',
        showIf: (p) => p.perspectiveMode !== 'orthographic',
      },
      {
        id: 'depthScale',
        label: 'Depth Scale',
        type: 'range',
        min: 1,
        max: 200,
        step: 1,
        infoKey: 'terrain.depthScale',
        showIf: (p) => p.perspectiveMode === 'orthographic',
      },
      { type: 'section', label: 'Depth & Resolution' },
      { id: 'depthSlices', label: 'Depth Slices', type: 'range', min: 10, max: 300, step: 1, infoKey: 'terrain.depthSlices' },
      { id: 'xResolution', label: 'X Resolution', type: 'range', min: 40, max: 600, step: 5, infoKey: 'terrain.xResolution' },
      { id: 'occlusion', label: 'Hidden-Line Removal', type: 'checkbox', infoKey: 'terrain.occlusion' },
      { type: 'section', label: 'Mountains' },
      { id: 'mountainAmplitude', label: 'Mountain Amplitude', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.mountainAmplitude' },
      { id: 'mountainFrequency', label: 'Mountain Frequency', type: 'range', min: 0.001, max: 0.05, step: 0.001, infoKey: 'terrain.mountainFrequency' },
      { id: 'mountainOctaves', label: 'Octaves', type: 'range', min: 1, max: 8, step: 1, infoKey: 'terrain.mountainOctaves' },
      { id: 'mountainLacunarity', label: 'Lacunarity', type: 'range', min: 1.5, max: 3.0, step: 0.05, infoKey: 'terrain.mountainLacunarity' },
      { id: 'mountainGain', label: 'Gain', type: 'range', min: 0.3, max: 0.7, step: 0.01, infoKey: 'terrain.mountainGain' },
      { id: 'peakSharpness', label: 'Peak Sharpness', type: 'range', min: 1.0, max: 4.0, step: 0.05, infoKey: 'terrain.peakSharpness' },
      { type: 'section', label: 'Valleys' },
      { id: 'valleyCount', label: 'Valley Count', type: 'range', min: 0, max: 8, step: 1, infoKey: 'terrain.valleyCount' },
      { id: 'valleyDepth', label: 'Valley Depth', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.valleyDepth', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { id: 'valleyWidth', label: 'Valley Width', type: 'range', min: 5, max: 50, step: 1, infoKey: 'terrain.valleyWidth', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { id: 'valleyShape', label: 'V → U Profile', type: 'range', min: 0, max: 1, step: 0.01, infoKey: 'terrain.valleyShape', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { id: 'valleyMeander', label: 'Valley Meander', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.valleyMeander', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { type: 'section', label: 'Rivers' },
      { id: 'riversEnabled', label: 'Enable Rivers', type: 'checkbox', infoKey: 'terrain.riversEnabled' },
      { id: 'riverCount', label: 'River Count', type: 'range', min: 1, max: 6, step: 1, infoKey: 'terrain.riverCount', showIf: (p) => p.riversEnabled === true },
      { id: 'riverWidth', label: 'River Width', type: 'range', min: 1, max: 10, step: 0.5, infoKey: 'terrain.riverWidth', showIf: (p) => p.riversEnabled === true },
      { id: 'riverDepth', label: 'River Depth', type: 'range', min: 0, max: 30, step: 1, infoKey: 'terrain.riverDepth', showIf: (p) => p.riversEnabled === true },
      { id: 'riverMeander', label: 'River Meander', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.riverMeander', showIf: (p) => p.riversEnabled === true },
      { type: 'section', label: 'Oceans' },
      { id: 'oceansEnabled', label: 'Enable Oceans', type: 'checkbox', infoKey: 'terrain.oceansEnabled' },
      { id: 'waterLevel', label: 'Water Level', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.waterLevel', showIf: (p) => p.oceansEnabled === true },
      { id: 'drawCoastline', label: 'Draw Coastline', type: 'checkbox', infoKey: 'terrain.drawCoastline', showIf: (p) => p.oceansEnabled === true },
      { type: 'section', label: 'Additional Noises' },
      { type: 'noiseList' },
    ],
  };

  const PETALIS_DESIGNER_REMOVED_CONTROL_IDS = new Set([
    'petalProfile',
    'tipSharpness',
    'tipTwist',
    'centerCurlBoost',
    'tipCurl',
    'baseFlare',
    'basePinch',
    'count',
    'ringMode',
    'innerCount',
    'outerCount',
    'ringSplit',
    'innerOuterLock',
    'profileTransitionPosition',
    'profileTransitionFeather',
    'petalLengthRatio',
    'petalSizeRatio',
    'leafSidePos',
    'leafSideWidth',
    'edgeWaveAmp',
    'edgeWaveFreq',
    'centerWaveBoost',
    'centerSizeMorph',
    'centerSizeCurve',
    'centerShapeMorph',
    'centerProfile',
    'countJitter',
    'sizeJitter',
    'rotationJitter',
    'angularDrift',
    'driftStrength',
    'driftNoise',
    'radiusScale',
    'radiusScaleCurve',
  ]);
  const PETALIS_DESIGNER_REMOVED_SECTION_LABELS = new Set([
    'Petal Modifiers',
    'Center Morphing',
    'Randomness & Seed',
  ]);
  const PETALIS_DESIGNER_REMOVED_CONTROL_TYPES = new Set(['petalModifierList']);
  const petalisDesignerControls = [
    { type: 'section', label: 'Petal Designer' },
    { type: 'petalDesignerInline' },
    ...(CONTROL_DEFS.petalis || [])
      .map((def) => (def && typeof def === 'object' ? { ...def } : def))
      .filter((def) => {
        if (!def || typeof def !== 'object') return true;
        if (def.id && PETALIS_DESIGNER_REMOVED_CONTROL_IDS.has(def.id)) return false;
        if (PETALIS_DESIGNER_REMOVED_CONTROL_TYPES.has(def.type)) return false;
        if (def.type === 'section' && PETALIS_DESIGNER_REMOVED_SECTION_LABELS.has(def.label)) return false;
        return true;
      }),
  ];
  CONTROL_DEFS.petalisDesigner = petalisDesignerControls;

  const INFO = {
    'global.algorithm': {
      title: 'Algorithm',
      description: 'Switches the generator for the active layer. Changing this resets that layer parameters to defaults.',
    },
    'global.seed': {
      title: 'Seed',
      description: 'Controls the random sequence used to generate the layer. Same seed equals the same output.',
    },
    'global.posX': {
      title: 'Pos X',
      description: 'Shifts the layer horizontally in millimeters.',
    },
    'global.posY': {
      title: 'Pos Y',
      description: 'Shifts the layer vertically in millimeters.',
    },
    'global.scaleX': {
      title: 'Scale X',
      description: 'Scales the layer horizontally around the center.',
    },
    'global.scaleY': {
      title: 'Scale Y',
      description: 'Scales the layer vertically around the center.',
    },
    'global.rotation': {
      title: 'Rotation',
      description: 'Rotates the active layer around its center in degrees.',
    },
    'global.paperSize': {
      title: 'Paper Size',
      description: 'Sets the paper dimensions used for bounds, centering, and export.',
    },
    'global.margin': {
      title: 'Margin',
      description: 'Keeps a safety border around the drawing area in millimeters.',
    },
    'global.truncate': {
      title: 'Crop Art to Margins',
      description: 'Clips strokes to stay inside the margin boundary.',
    },
    'global.cropExports': {
      title: 'Crop Exports to Margin',
      description: 'Physically clips paths at the margin boundary during SVG export (recommended for plotters).',
    },
    'global.removeHiddenGeometry': {
      title: 'Remove Hidden Geometry',
      description: 'Exports only the visible geometry by trimming masked or frame-hidden segments instead of preserving hidden source paths.',
    },
    'global.outsideOpacity': {
      title: 'Outside Opacity',
      description: 'Opacity for strokes drawn outside the margin when truncation is disabled.',
    },
    'global.marginLineVisible': {
      title: 'Margin Outline',
      description: 'Shows a non-exported margin boundary on the canvas.',
    },
    'global.marginLineWeight': {
      title: 'Margin Line Weight',
      description: 'Line weight for the on-canvas margin guide (mm).',
    },
    'global.marginLineColor': {
      title: 'Margin Line Color',
      description: 'Stroke color for the on-canvas margin guide.',
    },
    'global.marginLineDotting': {
      title: 'Margin Line Dotting',
      description: 'Dash length for the margin guide. Set to 0 for a solid line.',
    },
    'global.selectionOutline': {
      title: 'Selection Outline',
      description: 'Toggles the selection silhouette around chosen lines.',
    },
    'global.selectionOutlineColor': {
      title: 'Selection Outline Color',
      description: 'Sets the color used for the selection silhouette.',
    },
    'global.selectionOutlineWidth': {
      title: 'Selection Outline Width',
      description: 'Controls the thickness of the selection silhouette.',
    },
    'global.cookiePreferences': {
      title: 'Cookie Preferences',
      description: 'Stores UI preferences in a browser cookie so they persist between visits.',
    },
    'global.speedDown': {
      title: 'Draw Speed',
      description: 'Used for time estimation when the pen is down.',
    },
    'global.speedUp': {
      title: 'Travel Speed',
      description: 'Used for time estimation when the pen is up.',
    },
    'global.precision': {
      title: 'Export Precision',
      description: 'Decimal precision for SVG coordinates. Higher values increase file size.',
    },
    'global.stroke': {
      title: 'Default Stroke',
      description: 'Sets the base line width for all layers in millimeters.',
    },
    'global.plotterOptimize': {
      title: 'Plotter Optimization',
      description: 'Enable overlap removal and set a tolerance in millimeters for deduplicating same-pen paths.',
    },
    'mirror.type': {
      title: 'Mirror Type',
      description: 'Line: reflects across a straight axis. Radial: N-fold rotational or dihedral symmetry. Arc: inverts geometry across a circular arc (conformal reflection).',
    },
    'mirror.replacedSide': {
      title: 'Replaced Side',
      description: 'The side that gets replaced by the reflection. For Line: positive or negative relative to the axis normal. For Arc: outer (beyond radius) or inner (within radius).',
    },
    'mirror.radius': {
      title: 'Arc Radius',
      description: 'Radius of the circular mirror in canvas units. Geometry drawn inside or outside this circle is reflected through it.',
    },
    'mirror.arcStart': {
      title: 'Arc Start',
      description: 'Starting angle (degrees) of the arc guide. Together with Arc End, this defines the visible portion of the mirror circle.',
    },
    'mirror.arcEnd': {
      title: 'Arc End',
      description: 'Ending angle (degrees) of the arc guide. The arc span from Start to End marks where the reflective boundary is drawn.',
    },
    'mirror.strength': {
      title: 'Strength',
      description: 'Blends the reflected copy between its source position (0%) and the full inversion (100%). At 50% the reflection is halfway across the arc.',
    },
    'mirror.falloff': {
      title: 'Falloff',
      description: 'Fades strength toward zero at the arc endpoints, leaving the reflection fullest at the arc midpoint. Higher values create a more pronounced edge fade.',
    },
    'mirror.clipToArc': {
      title: 'Clip to Arc Span',
      description: 'When on, only geometry whose midpoint falls within the Arc Start–End angular window gets reflected. Geometry outside the window is kept but not inverted.',
    },
    'mirror.rotationOffset': {
      title: 'Rotation Offset',
      description: 'Rotates each reflected copy by this many degrees around the inversion circle center after reflecting. Creates pinwheel or spiral-bloom effects.',
    },
    'mirror.copies': {
      title: 'Copies',
      description: 'Fans out N evenly-spaced rotational copies of the reflected geometry around the full circle. Combine with inner→outer for mandala-style inversions.',
    },
    'common.smoothing': {
      title: 'Smoothing',
      description: 'Softens sharp angles by averaging each point with its neighbors. 0 keeps raw lines.',
    },
    'common.curves': {
      title: 'Curves',
      description: 'Renders smooth quadratic curves between points instead of straight segments.',
    },
    'common.simplify': {
      title: 'Simplify',
      description: 'Reduces point density while keeping the overall form. Higher values simplify more.',
    },
    'flowfield.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the scale of this Noise Rack layer inside the flow field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'flowfield.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts a flow-field noise layer on the X axis before sampling.',
    },
    'flowfield.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts a flow-field noise layer on the Y axis before sampling.',
    },
    'flowfield.flowMode': {
      title: 'Flow Mode',
      description: 'Angle mode maps the stacked Noise Rack field directly to direction. Curl mode derives flow direction from the field gradient.',
    },
    'flowfield.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined flow field.',
    },
    'flowfield.noiseType': {
      title: 'Noise Type',
      description: 'Chooses the engine used by a Noise Rack layer in the flow field.',
    },
    'flowfield.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly layer frequency increases across stacked octaves.',
    },
    'flowfield.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the layer field.',
    },
    'flowfield.density': {
      title: 'Density',
      description: 'Number of particles seeded. Higher density adds more paths.',
    },
    'flowfield.stepLen': {
      title: 'Step Length',
      description: 'Distance a particle moves per step. Larger steps create more angular paths.',
    },
    'flowfield.maxSteps': {
      title: 'Max Steps',
      description: 'Caps how long each particle travels before stopping.',
    },
    'flowfield.force': {
      title: 'Flow Force',
      description: 'Amplifies the influence of the noise field on direction.',
    },
    'flowfield.angleOffset': {
      title: 'Angle Offset',
      description: 'Rotates the entire flow field direction.',
    },
    'flowfield.chaos': {
      title: 'Chaos',
      description: 'Adds random angular jitter on top of the flow field.',
    },
    'flowfield.octaves': {
      title: 'Octaves',
      description: 'Number of octave samples inside this Noise Rack layer. More octaves add structure.',
    },
    'flowfield.minSteps': {
      title: 'Minimum Steps',
      description: 'Removes very short paths by requiring a minimum number of steps.',
    },
    'flowfield.minLength': {
      title: 'Minimum Length',
      description: 'Removes short fragments by requiring a minimum path length.',
    },
    'lissajous.freqX': {
      title: 'Freq X',
      description: 'Oscillation rate along the X axis.',
    },
    'lissajous.freqY': {
      title: 'Freq Y',
      description: 'Oscillation rate along the Y axis.',
    },
    'lissajous.damping': {
      title: 'Damping',
      description: 'How quickly the curve decays over time. Higher values shorten the trail.',
    },
    'lissajous.phase': {
      title: 'Phase',
      description: 'Shifts the X wave relative to Y, changing the knot shape.',
    },
    'lissajous.resolution': {
      title: 'Resolution',
      description: 'Number of samples along the curve. Higher values create smoother lines.',
    },
    'lissajous.scale': {
      title: 'Scale',
      description: 'Overall size of the Lissajous curve.',
    },
    'lissajous.truncateStart': {
      title: 'Truncate Start',
      description: 'Removes 0-100% of the curve length from the starting endpoint before any close-line trimming runs.',
    },
    'lissajous.truncateEnd': {
      title: 'Truncate End',
      description: 'Removes 0-100% of the curve length from the ending endpoint before any close-line trimming runs.',
    },
    'lissajous.closeLines': {
      title: 'Close Lines',
      description: 'Trims loose tail ends back to self-intersection cutpoints instead of forcing the curve to loop closed.',
    },
    'harmonograph.renderMode': {
      title: 'Render Mode',
      description: 'Choose line, dashed, point field, or segment rendering.',
    },
    'harmonograph.samples': {
      title: 'Samples',
      description: 'Number of points sampled along the curve.',
    },
    'harmonograph.duration': {
      title: 'Duration',
      description: 'Time span of the simulated pendulum motion.',
    },
    'harmonograph.scale': {
      title: 'Scale',
      description: 'Scales the overall drawing size.',
    },
    'harmonograph.paperRotation': {
      title: 'Paper Rotation',
      description: 'Rotates the drawing over time to add complexity.',
    },
    'harmonograph.dashLength': {
      title: 'Dash Length',
      description: 'Length of each dash segment.',
    },
    'harmonograph.dashGap': {
      title: 'Dash Gap',
      description: 'Gap between dash segments.',
    },
    'harmonograph.pointStride': {
      title: 'Point Stride',
      description: 'Skips points to control point field density.',
    },
    'harmonograph.pointSize': {
      title: 'Point Size',
      description: 'Radius of each point marker.',
    },
    'harmonograph.segmentStride': {
      title: 'Segment Stride',
      description: 'Spacing between short segment samples.',
    },
    'harmonograph.segmentLength': {
      title: 'Segment Length',
      description: 'Length of each short segment.',
    },
    'harmonograph.gapSize': {
      title: 'Gap Size',
      description: 'Adds extra spacing between dashes, points, or segments.',
    },
    'harmonograph.gapOffset': {
      title: 'Gap Offset',
      description: 'Shifts the spacing pattern forward along the path.',
    },
    'harmonograph.gapRandomness': {
      title: 'Spacing Randomness',
      description: 'Randomizes the spacing between elements (0 = none, 1 = maximum).',
    },
    'harmonograph.widthMultiplier': {
      title: 'Line Thickness',
      description: 'Stacks multiple parallel strokes to build thicker lines.',
    },
    'harmonograph.thickeningMode': {
      title: 'Thickening Mode',
      description: 'Controls how the thickness strokes are arranged (parallel or sinusoidal).',
    },
    'harmonograph.loopDrift': {
      title: 'Anti-Loop Drift',
      description: 'Adds a gradual frequency drift over time to break repeated loop closure.',
    },
    'harmonograph.settleThreshold': {
      title: 'Settle Cutoff',
      description: 'Stops sampling once motion stays below this amplitude near the center (0 disables).',
    },
    'harmonograph.showPendulumGuides': {
      title: 'Pendulum Guides',
      description: 'Overlays each pendulum contribution to visualize the motion in the canvas.',
    },
    'harmonograph.pendulumGuideColor': {
      title: 'Guide Color',
      description: 'Stroke color for the pendulum helper overlay.',
    },
    'harmonograph.pendulumGuideWidth': {
      title: 'Guide Thickness',
      description: 'Stroke weight for the pendulum helper overlay.',
    },
    'harmonograph.ampX': {
      title: 'Amplitude X',
      description: 'Horizontal amplitude contribution of this pendulum.',
    },
    'harmonograph.ampY': {
      title: 'Amplitude Y',
      description: 'Vertical amplitude contribution of this pendulum.',
    },
    'harmonograph.phaseX': {
      title: 'Phase X',
      description: 'Phase offset for the X oscillator.',
    },
    'harmonograph.phaseY': {
      title: 'Phase Y',
      description: 'Phase offset for the Y oscillator.',
    },
    'harmonograph.freq': {
      title: 'Frequency',
      description: 'Oscillation frequency for this pendulum.',
    },
    'harmonograph.micro': {
      title: 'Micro Tuning',
      description: 'Fine tuning offset that nudges the frequency.',
    },
    'harmonograph.damp': {
      title: 'Damping',
      description: 'Decay rate applied to this pendulum.',
    },
    'wavetable.lines': {
      title: 'Lines',
      description: 'Number of lines used by the selected wavetable line structure.',
    },
    'wavetable.lineStructure': {
      title: 'Line Structure',
      description:
        'Sets the base line layout before noise displacement: horizontal rows, vertical stacks, grid combos, isometric sets, or lattice diagonals.',
    },
    'wavetable.noiseType': {
      title: 'Noise Type',
      body: (ui) => {
        const base = ui?.getWavetableNoiseTemplates?.('wavetable')?.base || {};
        const baseParams = {
          ...(ALGO_DEFAULTS?.wavetable ? clone(ALGO_DEFAULTS.wavetable) : {}),
          lines: 40,
          gap: 1.2,
          tilt: 0,
          lineOffset: 0,
          noises: [],
        };
        const items = WAVE_NOISE_OPTIONS.map((opt) => {
          const desc = WAVE_NOISE_DESCRIPTIONS[opt.value] || '';
          const params = {
            ...baseParams,
            noises: [
              {
                ...clone(base),
                type: opt.value,
                amplitude: 6,
                zoom: 0.03,
                freq: 1,
                enabled: true,
              },
            ],
          };
          const svg = renderPreviewSvg('wavetable', params, { strokeWidth: 0.8 });
          return `
            <div class="modal-illustration">
              <div class="modal-ill-label">${opt.label}</div>
              ${desc ? `<div class="modal-ill-desc">${desc}</div>` : ''}
              ${svg}
            </div>
          `;
        }).join('');
        return `
          <p class="modal-text">
            Each noise type shapes line displacement differently. Image modes use uploaded luminance as the base signal.
          </p>
          <div class="modal-illustrations scrollable">
            ${items}
          </div>
        `;
      },
      hidePreview: true,
    },
    'wavetable.noiseBlend': {
      title: 'Blend Mode',
      description:
        'Controls how this noise layer combines with the noises above it. Hatching Density modes bias displacement based on light/dark tone to simulate shading.',
    },
    'wavetable.noiseApplyMode': {
      title: 'Apply Mode',
      description: 'Top Down samples noise in global canvas space. Linear maps noise along the spiral path.',
    },
    'wavetable.imageNoiseStyle': {
      title: 'Noise Style',
      description: 'Shapes how dark vs. light image values influence the displacement.',
    },
    'wavetable.imageNoiseThreshold': {
      title: 'Noise Threshold',
      description: 'Controls how dark a pixel must be before it contributes full noise impact.',
    },
    'wavetable.imageWidth': {
      title: 'Noise Width',
      description: 'Scales image sampling horizontally. 1 keeps native aspect; higher widens, lower narrows.',
    },
    'wavetable.imageHeight': {
      title: 'Noise Height',
      description: 'Scales image sampling vertically.',
    },
    'wavetable.imageMicroFreq': {
      title: 'Micro Frequency',
      description: 'Adds micro-scale wave modulation based on image darkness.',
    },
    'wavetable.imageInvertColor': {
      title: 'Invert Color',
      description: 'Flips the luminance values of the image before effects are applied.',
    },
    'wavetable.imageInvertOpacity': {
      title: 'Invert Opacity',
      description: 'Inverts the image alpha contribution so transparent areas become active.',
    },
    'wavetable.noiseTileMode': {
      title: 'Tile Mode',
      description: 'Repeats the noise in patterned tiles (grid, brick, hex, etc.). Off keeps a single centered field.',
    },
    'wavetable.noiseTilePadding': {
      title: 'Tile Padding',
      description: 'Adds breathing room between tiles by shrinking the active tile area.',
    },
    'wavetable.noiseImage': {
      title: 'Noise Image',
      description: 'Uses an uploaded image as the noise source. Brightness values become wave displacement.',
    },
    'wavetable.imageAlgo': {
      title: 'Image Effect Mode',
      description: 'Determines how each image effect transforms luminance before displacement.',
    },
    'wavetable.imageBrightness': {
      title: 'Image Brightness',
      description: 'Offsets the sampled luminance brighter or darker.',
    },
    'wavetable.imageLevelsLow': {
      title: 'Levels Low',
      description: 'Clips darker tones before remapping the image levels.',
    },
    'wavetable.imageLevelsHigh': {
      title: 'Levels High',
      description: 'Clips lighter tones before remapping the image levels.',
    },
    'wavetable.imageEmbossStrength': {
      title: 'Emboss Strength',
      description: 'Emphasizes directional relief like an embossed surface.',
    },
    'wavetable.imageSharpenAmount': {
      title: 'Sharpen Amount',
      description: 'Boosts local contrast to emphasize edges.',
    },
    'wavetable.imageSharpenRadius': {
      title: 'Sharpen Radius',
      description: 'Neighborhood size used for sharpening.',
    },
    'wavetable.imageMedianRadius': {
      title: 'Median Radius',
      description: 'Neighborhood size used for median filtering.',
    },
    'wavetable.imageGamma': {
      title: 'Image Gamma',
      description: 'Adjusts midtone weighting before sampling the image.',
    },
    'wavetable.imageContrast': {
      title: 'Image Contrast',
      description: 'Boosts or reduces contrast prior to sampling.',
    },
    'wavetable.imageBlurRadius': {
      title: 'Blur Radius',
      description: 'Radius for blur sampling when Blur mode is active.',
    },
    'wavetable.imageBlurStrength': {
      title: 'Blur Strength',
      description: 'Blend amount between sharp and blurred luminance.',
    },
    'wavetable.imageSolarize': {
      title: 'Solarize Threshold',
      description: 'Inverts tones above the threshold for a photographic solarize effect.',
    },
    'wavetable.imagePixelate': {
      title: 'Pixelate',
      description: 'Samples the image in larger blocks for a chunky pixel effect.',
    },
    'wavetable.imageDither': {
      title: 'Dither Amount',
      description: 'Applies a patterned threshold to create a stippled tone map.',
    },
    'wavetable.imageHighpassRadius': {
      title: 'High Pass Radius',
      description: 'Kernel size for extracting high-frequency detail.',
    },
    'wavetable.imageHighpassStrength': {
      title: 'High Pass Strength',
      description: 'Boosts edge contrast from the high-pass filter.',
    },
    'wavetable.imageLowpassRadius': {
      title: 'Low Pass Radius',
      description: 'Kernel size for smoothing the image.',
    },
    'wavetable.imageLowpassStrength': {
      title: 'Low Pass Strength',
      description: 'Blends the low-pass filter into the luminance.',
    },
    'wavetable.imageVignetteStrength': {
      title: 'Vignette Strength',
      description: 'Darkens edges to emphasize the center.',
    },
    'wavetable.imageVignetteRadius': {
      title: 'Vignette Radius',
      description: 'Controls how far the vignette reaches into the image.',
    },
    'wavetable.imageCurveStrength': {
      title: 'Tone Curve Strength',
      description: 'Applies an S-curve to emphasize midtones.',
    },
    'wavetable.imageBandCenter': {
      title: 'Band Center',
      description: 'Target luminance for the bandpass mask.',
    },
    'wavetable.imageBandWidth': {
      title: 'Band Width',
      description: 'Range of luminance values preserved by bandpass.',
    },
    'wavetable.imageThreshold': {
      title: 'Image Threshold',
      description: 'Threshold used to binarize the image before sampling.',
    },
    'wavetable.imagePosterize': {
      title: 'Posterize Levels',
      description: 'Reduces the image to a fixed number of tonal steps.',
    },
    'wavetable.imageBlur': {
      title: 'Edge Blur Radius',
      description: 'Radius used for edge detection smoothing.',
    },
    'wavetable.amplitude': {
      title: 'Noise Amplitude',
      description: 'Amount of vertical displacement added by this noise layer. Positive values lift lines upward; negative values push them downward.',
    },
    'wavetable.zoom': {
      title: 'Noise Zoom',
      description: 'Scale of this noise field along the wavetable. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'wavetable.noiseShiftX': {
      title: 'Noise X-Shift',
      description: 'Offsets the noise field horizontally. 0 keeps it centered.',
    },
    'wavetable.noiseShiftY': {
      title: 'Noise Y-Shift',
      description: 'Offsets the noise field vertically. 0 keeps it centered.',
    },
    'wavetable.noisePatternScale': {
      title: 'Pattern Scale',
      description: 'Adjusts the spacing of pattern-driven noises like stripes or moire.',
    },
    'wavetable.noiseWarpStrength': {
      title: 'Warp Strength',
      description: 'Controls how aggressively the noise field is warped.',
    },
    'wavetable.noiseCellScale': {
      title: 'Cell Scale',
      description: 'Sets the size of cells for cellular/voronoi noise types.',
    },
    'wavetable.noiseCellJitter': {
      title: 'Cell Jitter',
      description: 'Randomizes cell positions to soften or sharpen cell boundaries.',
    },
    'wavetable.noiseSteps': {
      title: 'Step Count',
      description: 'Number of discrete steps for stepped or faceted noise.',
    },
    'wavetable.noiseSeed': {
      title: 'Noise Seed',
      description: 'Offsets the noise pattern for seeded modes like Steps or Value.',
    },
    'wavetable.noisePolygonRadius': {
      title: 'Polygon Radius',
      description: 'Controls the overall size of the polygon noise shape.',
    },
    'wavetable.noisePolygonSides': {
      title: 'Polygon Sides',
      description: 'Sets the number of sides in the polygon.',
    },
    'wavetable.noisePolygonRotation': {
      title: 'Polygon Rotation',
      description: 'Rotates the polygon around its center.',
    },
    'wavetable.noisePolygonOutline': {
      title: 'Polygon Outline Width',
      description: 'Defines the outline thickness when using polygon noise.',
    },
    'wavetable.noisePolygonEdge': {
      title: 'Polygon Edge Radius',
      description: 'Softens polygon edges for a rounded profile.',
    },
    'wavetable.tilt': {
      title: 'Row Shift',
      description: 'Offsets each row horizontally to shear the stack. In Isometric mode, the full lattice shears together so the cells stay coherent.',
    },
    'wavetable.gap': {
      title: 'Line Gap',
      description: 'Spacing multiplier between rows. In Isometric mode, this sets the visible interior spacing of the cells before row shift shears the lattice.',
    },
    'wavetable.freq': {
      title: 'Frequency',
      description: 'Noise frequency along the X axis for this layer.',
    },
    'wavetable.noiseAngle': {
      title: 'Noise Angle',
      description: 'Rotates the sampled noise field itself. Use `Line Offset Angle` to set the direction the sampled noise pushes the lines.',
    },
    'wavetable.lineOffset': {
      title: 'Line Offset Angle',
      description: 'Direction for noise displacement (0° = north, 180° = south).',
    },
    'wavetable.continuity': {
      title: 'Continuity',
      description: 'Connects adjacent wavetable rows on one side (single) or both sides (double).',
    },
    'wavetable.edgeFadeMode': {
      title: 'Edge Noise Dampening Mode',
      description: 'Choose whether noise dampening affects the left, right, or both sides.',
    },
    'wavetable.edgeFade': {
      title: 'Edge Noise Dampening Amount',
      description: 'How strongly noise is dampened near the left/right edges (0-100).',
    },
    'wavetable.edgeFadeThreshold': {
      title: 'Edge Noise Dampening Threshold',
      description: 'Distance from the left/right edges where dampening applies (0-100). At 100, the full width is dampened.',
    },
    'wavetable.edgeFadeFeather': {
      title: 'Edge Noise Dampening Feather',
      description: 'Softens the dampening boundary over a 0-100 span (0 = hard edge).',
    },
    'wavetable.verticalFade': {
      title: 'Vertical Noise Dampening Amount',
      description: 'How strongly noise is dampened toward the top/bottom (0-100).',
    },
    'wavetable.verticalFadeThreshold': {
      title: 'Vertical Noise Dampening Threshold',
      description: 'Distance from the top/bottom edges where dampening applies (0-100). At 100, the full height is dampened.',
    },
    'wavetable.verticalFadeFeather': {
      title: 'Vertical Noise Dampening Feather',
      description: 'Softens the dampening boundary over a 0-100 span (0 = hard edge).',
    },
    'wavetable.verticalFadeMode': {
      title: 'Vertical Noise Dampening Mode',
      description: 'Choose whether noise dampening affects the top, bottom, or both.',
    },
    'wavetable.dampenExtremes': {
      title: 'Dampen Extremes',
      description: 'Scales back displacement near the top and bottom margins.',
    },
    'wavetable.overlapPadding': {
      title: 'Overlap Padding',
      description: 'Total vertical buffer (in mm) between adjacent rows. 0 allows overlap.',
    },
    'wavetable.flatCaps': {
      title: 'Flat Top/Bottom',
      description: 'Adds flat lines at the top and bottom of the wavetable stack.',
    },
    'rings.preset': {
      title: 'Style Preset',
      description: 'Load a tree-ring style preset. Applies all parameters at once. Switch to Custom to adjust parameters manually.',
    },
    'rings.rings': {
      title: 'Rings',
      description: 'Number of concentric rings to generate.',
    },
    'rings.centerDiameter': {
      title: 'Center Diameter',
      description: 'Inner opening diameter in canvas units (mm). Cannot exceed Outer Diameter — clamped automatically. 0 = no center hole.',
    },
    'rings.outerDiameter': {
      title: 'Outer Diameter',
      description: 'Sets the outer boundary diameter in canvas units (mm). The outermost bark ring always anchors exactly here. 0 = no rings drawn. New layers default to the canvas short-edge diameter.',
    },
    'rings.noiseProjection': {
      title: 'Noise Projection',
      body: `
        <p class="modal-text"><strong>Top Down</strong> treats the noise as one global XY plane under the full artwork, so every ring passes through the same field.</p>
        <p class="modal-text"><strong>Concentric</strong> unwraps each ring into path space, runs noise from one end of the loop to the other, then seam-corrects the result so the ring still closes cleanly.</p>
        <p class="modal-text"><strong>Orbit Field</strong> preserves the legacy ring-local sampler, orbiting noise around each ring instead of reading from a shared world field.</p>
      `,
    },
    'rings.noiseType': {
      title: 'Noise Type',
      description: 'Chooses the noise field used to perturb ring radii.',
    },
    'rings.amplitude': {
      title: 'Noise Amplitude',
      description: 'Strength of the ring displacement from the base radius.',
    },
    'rings.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the frequency of the selected Rings noise field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'rings.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts the Rings noise field on the X axis before sampling.',
    },
    'rings.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts the Rings noise field on the Y axis before sampling.',
    },
    'rings.noiseLayer': {
      title: 'Ring Drift',
      description:
        'Offsets each ring to a different slice of the current Rings sampler. In Concentric it moves stacked rings onto neighboring path bands; in Orbit Field it shifts the legacy ring-local orbit.',
    },
    'rings.noisePathSpan': {
      title: 'Path Span',
      description:
        'Controls how much path-space is traversed over one full revolution in Concentric mode. Larger values reveal more of the noise field around each ring; smaller values stretch the same field across the loop.',
    },
    'rings.noiseOrbitRadius': {
      title: 'Orbit Radius',
      description: 'Sets the radius of the orbital sampling path used by Orbit Field mode.',
    },
    'rings.gap': {
      title: 'Ring Gap',
      description: 'Base spacing multiplier between rings. Combined with the inner/outer gap curve for variable spacing.',
    },
    'rings.gapCurveStart': {
      title: 'Inner Gap',
      description: 'Gap multiplier at the innermost ring. Values above 1 make inner rings wider than the base gap, simulating fast early growth.',
    },
    'rings.gapCurveEnd': {
      title: 'Outer Gap',
      description: 'Gap multiplier at the outermost non-bark ring. Values below 1 compress outer rings, simulating slower late growth.',
    },
    'rings.spacingVariance': {
      title: 'Spacing Variance',
      description: 'Adds per-ring noise perturbation to gap width, simulating boom and stress growth years. 0 = uniform spacing.',
    },
    'rings.barkRings': {
      title: 'Bark Rings',
      description: 'Number of outermost rings treated as bark and compressed to the Bark Gap fraction. 0 disables the bark zone.',
    },
    'rings.barkGap': {
      title: 'Bark Gap',
      description: 'Absolute spacing between bark rings in canvas units (mm). Independent of wood ring count, gap, or noise — only barkGap controls bark-ring spacing.',
    },
    'rings.barkType': {
      title: 'Bark Style',
      description: 'Surface texture applied to bark rings. Smooth = plain concentric circles (default). Each style has its own parameter set that appears below the selector.',
    },
    'rings.barkRoughness': {
      title: 'Roughness',
      description: 'Amplitude of high-frequency bumps added to each bark ring. Higher values create more jagged, irregular bark edges.',
    },
    'rings.barkRoughnessConfinement': {
      title: 'Confinement',
      description: 'Scales roughness displacement relative to full amplitude. Lower values tighten the bark lines closer to their nominal radius, preventing excessive spreading between rings.',
    },
    'rings.barkFreq': {
      title: 'Frequency',
      description: 'Number of bump cycles around each bark ring. Low values produce large rolling waves; high values produce fine jagged serrations.',
    },
    'rings.barkFurrowCount': {
      title: 'Furrow Count',
      description: 'Number of radial grooves running around the bark zone. Grooves are placed at random angles and shared across all bark rings.',
    },
    'rings.barkFurrowDepth': {
      title: 'Furrow Depth',
      description: 'How deeply each groove cuts into the bark ring radius.',
    },
    'rings.barkFurrowWidth': {
      title: 'Furrow Width',
      description: 'Angular half-width of each groove as a fraction of π. Larger values make wide, shallow trenches; smaller values make narrow, knife-cut slots.',
    },
    'rings.barkPlateCount': {
      title: 'Plate Count',
      description: 'Number of bark plates around the circumference. Each plate is a raised arc segment separated from its neighbors by narrow troughs.',
    },
    'rings.barkPlateRelief': {
      title: 'Plate Relief',
      description: 'Height of each plate above the base bark radius. Higher values produce more pronounced raised plateaus.',
    },
    'rings.barkPlateVariance': {
      title: 'Plate Variance',
      description: 'Per-ring randomization of plate height and angular offset, so successive bark rings do not align perfectly.',
    },
    'rings.barkPaperStrips': {
      title: 'Strip Count',
      description: 'Number of peeling strip sections per ring. Each strip lifts away from the base radius as a smooth arc, like curling paper bark.',
    },
    'rings.barkPaperPeel': {
      title: 'Peel Lift',
      description: 'How far each strip peels outward from the base bark ring. Zero = flat; high values = pronounced curling arcs.',
    },
    'rings.barkPaperJitter': {
      title: 'Strip Jitter',
      description: 'Random angular offset applied to each strip boundary per ring, so strips on adjacent rings do not align.',
    },
    'rings.barkFiberCount': {
      title: 'Fiber Count',
      description: 'Number of longitudinal fiber strands modulating each bark ring. High counts produce a fine, closely-packed fibrous texture.',
    },
    'rings.barkFiberAmplitude': {
      title: 'Fiber Amplitude',
      description: 'Radial oscillation strength of each fiber strand. Higher values make each ring visibly corrugated.',
    },
    'rings.barkFiberPhaseShift': {
      title: 'Phase Shift',
      description: 'How much the fiber pattern rotates between successive bark rings. Values near 0.5 create a woven interlocking appearance across rings.',
    },
    'rings.barkScaleColumns': {
      title: 'Scale Count',
      description: 'Number of scales around the circumference. Each scale is a one-sided raised arc, like overlapping fish scales.',
    },
    'rings.barkScaleRelief': {
      title: 'Scale Relief',
      description: 'Height of each scale arc above the base ring radius.',
    },
    'rings.barkScaleTaper': {
      title: 'Scale Taper',
      description: 'Controls the sharpness of the scale shape. Lower values produce flatter, broader scales; higher values produce more pointed tips.',
    },
    'rings.barkCrackDensity': {
      title: 'Crack Count',
      description: 'Number of V-notch cracks cut into the bark ring circumference. Cracks appear at random angles and span all bark rings.',
    },
    'rings.barkCrackDepth': {
      title: 'Crack Depth',
      description: 'How deeply each crack cuts inward from the base bark ring radius.',
    },
    'rings.barkCrackWidth': {
      title: 'Crack Width',
      description: 'Angular half-width of each crack as a fraction of π. Narrow values produce sharp fissures; wider values produce broad valleys.',
    },
    'rings.barkLenticleCount': {
      title: 'Lenticle Count',
      description: 'Number of lens-shaped pore depressions per ring. Lenticels are evenly spaced with a small per-ring angular stagger.',
    },
    'rings.barkLenticleDepth': {
      title: 'Lenticle Depth',
      description: 'How deeply each lenticle presses inward from the ring surface.',
    },
    'rings.barkLenticleWidth': {
      title: 'Lenticle Width',
      description: 'Angular width of each lenticle opening. Smaller values produce narrow slots; larger values produce wide oval indentations.',
    },
    'rings.barkWeaveFreq': {
      title: 'Weave Frequency',
      description: 'Number of oscillation cycles projected along the weave axis. Higher values tighten the weave grid.',
    },
    'rings.barkWeaveAmplitude': {
      title: 'Weave Amplitude',
      description: 'Radial oscillation strength of each ring in the woven pattern. Alternating rings go in opposite phase, producing an interlocking herringbone.',
    },
    'rings.barkWeaveAngle': {
      title: 'Weave Angle',
      description: 'Direction of the weave axis (0–180°). Rotating this changes the orientation of the diagonal pattern.',
    },
    'rings.breakCount': {
      title: 'Break Count',
      description: 'Number of radial breaks — narrow gaps cut through all rings at random angles, like axe splits in a cross-section. 0 = no breaks.',
    },
    'rings.breakRadius': {
      title: 'Break Radius',
      description: 'Radial range (as % of total radius) within which breaks can appear. Drag the min and max handles to restrict breaks to a ring zone.',
    },
    'rings.breakLengthVariance': {
      title: 'Radius Variance',
      description: 'Randomly varies how far each break extends across the radius range. 0 = all breaks span the full range; 1 = high length variation.',
    },
    'rings.breakNoiseSeed': {
      title: 'Break Seed',
      description: 'Seed for break placement, independent of the global seed. Change this to reposition breaks without affecting rings, rays, or knots.',
    },
    'rings.breakWidth': {
      title: 'Break Width',
      description: 'Angular width of each break gap in degrees. Drag min/max handles to set the range — each break draws a random width from that range.',
    },
    'rings.breakWidthVariance': {
      title: 'Width Variance',
      description: 'Randomly varies the angular width of each break within the Break Width range. 0 = all breaks are the same width.',
    },
    'rings.centerDrift': {
      title: 'Center Drift',
      description: 'Maximum pixels of random walk applied to each successive ring center, simulating eccentric off-center growth.',
    },
    'rings.biasStrength': {
      title: 'Bias Strength',
      description: 'Elliptical deformation strength (0–1). One side of the ring grows wider, like a tree on a slope or in prevailing wind.',
    },
    'rings.biasAngle': {
      title: 'Bias Direction',
      description: 'Compass direction (degrees) of the wider side of the elliptical bias.',
    },
    'rings.rayCount': {
      title: 'Medullary Rays',
      description: 'Number of short radial grain segments scattered across the cross-section, simulating medullary ray cells visible in wood.',
    },
    'rings.rayLength': {
      title: 'Ray Length',
      description: 'Length of each medullary ray expressed in ring-gap units. 2.5 means each ray spans roughly 2.5 inter-ring spacings.',
    },
    'rings.rayInnerFraction': {
      title: 'Ray Start',
      description: 'Radial fraction (0–0.7) where rays begin. 0 starts rays at the center; 0.15 starts them 15% of the way from center to edge.',
    },
    'rings.raySeed': {
      title: 'Ray Seed',
      description: 'Seed for medullary ray placement, independent of the global seed. Changing this repositions rays without affecting rings or knots.',
    },
    'rings.rayLengthVariance': {
      title: 'Length Variance',
      description: 'Random variation in individual ray lengths (0 = uniform, 1 = high variation around the base Ray Length).',
    },
    'rings.knotCount': {
      title: 'Knot Count',
      description: 'Number of knot distortions, placed randomly by seed. Knots warp rings inward or outward where a branch once attached.',
    },
    'rings.knotSeed': {
      title: 'Knot Seed',
      description: 'Seed for knot placement, independent of the global seed. Change this to reposition knots without affecting rings, rays, or breaks.',
    },
    'rings.knotIntensity': {
      title: 'Knot Strength',
      description: 'Maximum radial warp of a knot, in multiples of the average ring gap. Higher values create more dramatic bulges.',
    },
    'rings.knotStrengthVariance': {
      title: 'Knot Strength Variance',
      description: 'Random variation in strength across individual knots (0 = all equal, 1 = high variation).',
    },
    'rings.knotDirection': {
      title: 'Knot Direction',
      description: 'Outer: rings bulge outward. Inner: rings indent inward. Both: each knot randomly picks a direction.',
    },
    'rings.knotSpread': {
      title: 'Knot Size',
      description: 'Angular width (degrees) of each knot\'s influence zone. Larger values create wider, softer distortions.',
    },
    'rings.knotSizeVariance': {
      title: 'Knot Size Variance',
      description: 'Random variation in angular size across individual knots (0 = all equal, 1 = high variation).',
    },
    'rings.knotSize': {
      title: 'Knot Ring Reach',
      description: 'How many ring-gap widths each knot\'s warp extends radially. Higher values spread the distortion across more rings.',
    },
    'rings.vMarkCount': {
      title: 'V-Mark Count',
      description: 'Number of V-marking distortions. V-marks create sharp inward chevron dips where bark inclusions compressed the growth rings.',
    },
    'rings.vMarkDepth': {
      title: 'V-Mark Depth',
      description: 'Maximum inward displacement at the tip of each V-mark, in canvas units. Higher values make the V more pronounced.',
    },
    'rings.vMarkSpread': {
      title: 'V-Mark Spread',
      description: 'Angular half-width of each V-mark in degrees. Smaller values produce a sharper, more pointed V; larger values widen it.',
    },
    'rings.vMarkSize': {
      title: 'V-Mark Ring Reach',
      description: 'Radial extent of each V-mark across ring layers. Higher values spread the V across more rings.',
    },
    'rings.vMarkSeed': {
      title: 'V-Mark Seed',
      description: 'Seed for V-mark placement, independent of the global seed. Change this to reposition V-marks without affecting other features.',
    },
    'rings.scarCount': {
      title: 'Scar Count',
      description: 'Number of healed wound scars. Scars create inward depressions that narrow and shallow toward outer rings as the tree heals over time.',
    },
    'rings.scarDepth': {
      title: 'Scar Depth',
      description: 'Maximum inward depth of the scar at the wound ring, in canvas units. Depth decreases toward outer rings as healing progresses.',
    },
    'rings.scarWidth': {
      title: 'Scar Width',
      description: 'Angular width of the scar at the wound ring, in degrees. Narrows progressively toward outer rings as the tree closes over the wound.',
    },
    'rings.scarSize': {
      title: 'Healing Rate',
      description: 'Number of rings over which the scar fully heals. Lower values produce rapid closure; higher values leave a long trailing scar.',
    },
    'rings.scarSeed': {
      title: 'Scar Seed',
      description: 'Seed for scar placement, independent of the global seed. Change this to reposition scars without affecting other features.',
    },
    'rings.thickRingCount': {
      title: 'Cluster Count',
      description: 'Number of thick-ring clusters — zones where rings grow tightly together, simulating drought or stress years visible as dense banding.',
    },
    'rings.thickRingDensity': {
      title: 'Compression',
      description: 'How tightly rings are compressed within each cluster (0 = no compression, 1 = rings nearly touching). Other rings spread to compensate.',
    },
    'rings.thickRingWidth': {
      title: 'Cluster Width',
      description: 'Number of rings on each side of the cluster center that are compressed. Higher values create wider, more gradual compression bands.',
    },
    'rings.thickRingSeed': {
      title: 'Cluster Seed',
      description: 'Seed for thick-ring cluster placement, independent of the global seed. Change this to redistribute clusters without affecting other features.',
    },
    'rings.crackCount': {
      title: 'Crack Count',
      description: 'Number of radial cracks radiating inward from the outer bark — called radial shakes or heart checks in lumber science.',
    },
    'rings.crackDepth': {
      title: 'Crack Depth',
      description: 'How far each crack penetrates inward as a fraction of the outer radius (0 = surface only, 1 = nearly to center).',
    },
    'rings.crackSpread': {
      title: 'Crack Width',
      description: 'Angular width of each crack opening at the outer edge, in degrees. The crack tapers to a point as it goes inward.',
    },
    'rings.crackNoise': {
      title: 'Crack Roughness',
      description: 'Amount of lateral wobble along each crack arm, for an organic hand-split appearance. 0 = straight geometric lines.',
    },
    'rings.crackSeed': {
      title: 'Crack Seed',
      description: 'Seed for crack placement, independent of the global seed. Change this to reposition cracks without affecting other features.',
    },
    'rings.crackOutline': {
      title: 'Crack Outline',
      description: 'When enabled, draws each crack as a single closed outline path instead of two separate arm strokes.',
    },
    'rings.offsetX': {
      title: 'Ring Offset X',
      description: 'Moves the ring stack horizontally before transforms.',
    },
    'rings.offsetY': {
      title: 'Ring Offset Y',
      description: 'Moves the ring stack vertically before transforms.',
    },
    'topo.resolution': {
      title: 'Resolution',
      description: 'Grid resolution used for sampling the scalar field.',
    },
    'topo.levels': {
      title: 'Contour Levels',
      description: 'Number of contour bands extracted from the scalar field.',
    },
    'topo.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined height field.',
    },
    'topo.noiseType': {
      title: 'Noise Type',
      description: 'Selects the base noise used to create the height field.',
    },
    'topo.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls how quickly noise values change across the field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'topo.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts the noise field sampling in X.',
    },
    'topo.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts the noise field sampling in Y.',
    },
    'topo.octaves': {
      title: 'Octaves',
      description: 'Number of noise layers blended into the height field.',
    },
    'topo.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly noise frequency increases per octave.',
    },
    'topo.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the height field.',
    },
    'topo.sensitivity': {
      title: 'Sensitivity',
      description: 'Adjusts contrast in the field before extracting contours.',
    },
    'topo.thresholdOffset': {
      title: 'Threshold Offset',
      description: 'Shifts all contour thresholds up or down.',
    },
    'topo.mappingMode': {
      title: 'Mapping Mode',
      description: 'Selects how contours are traced and smoothed.',
    },
    'rainfall.count': {
      title: 'Drop Count',
      description: 'Number of rain traces generated across the canvas.',
    },
    'rainfall.traceLength': {
      title: 'Trace Length',
      description: 'Length of each rain streak in millimeters.',
    },
    'rainfall.lengthJitter': {
      title: 'Length Jitter',
      description: 'Adds randomized variation to the streak length.',
    },
    'rainfall.traceStep': {
      title: 'Trace Step',
      description: 'Distance between points along each trace.',
    },
    'rainfall.stepJitter': {
      title: 'Step Jitter',
      description: 'Randomizes spacing between points along each trace.',
    },
    'rainfall.turbulence': {
      title: 'Turbulence',
      description: 'Adds jitter to rain direction over time.',
    },
    'rainfall.gustStrength': {
      title: 'Gust Strength',
      description: 'Adds slower, broader directional gusts to the rain.',
    },
    'rainfall.rainfallAngle': {
      title: 'Rainfall Angle',
      description: 'Sets the direction the droplet head faces (0° = north, 180° = south).',
    },
    'rainfall.angleJitter': {
      title: 'Angle Jitter',
      description: 'Random variation applied to each drop’s direction.',
    },
    'rainfall.windAngle': {
      title: 'Wind Angle',
      description: 'Direction of wind influence on the rain (0° = north, 180° = south).',
    },
    'rainfall.windStrength': {
      title: 'Wind Strength',
      description: 'Scales the wind’s influence on the rain direction.',
    },
    'rainfall.dropRotate': {
      title: 'Drop Head Rotate',
      description: 'Rotates the droplet head relative to the rain direction.',
    },
    'rainfall.dropSize': {
      title: 'Droplet Size',
      description: 'Size of the droplet marker at the end of each trace.',
    },
    'rainfall.dropSizeJitter': {
      title: 'Drop Size Jitter',
      description: 'Adds size variation to droplets for more organic rain.',
    },
    'rainfall.dropShape': {
      title: 'Droplet Shape',
      description: 'Selects the marker shape for droplets.',
    },
    'rainfall.dropFill': {
      title: 'Droplet Fill',
      description: 'Adds a fill-style texture inside droplets.',
    },
    'fill.type': {
      title: 'Fill Type',
      description: 'The pattern style used to fill enclosed shapes (hatch, wave, stipple, contour, etc.).',
    },
    'fill.density': {
      title: 'Fill Density',
      description: 'Controls how tightly fill strokes or dots are packed inside the shape.',
    },
    'fill.angle': {
      title: 'Fill Angle',
      description: 'Rotates the fill pattern. For hatch fills: rotates line direction. For spiral/radial: sets the start angle.',
    },
    'fill.amplitude': {
      title: 'Fill Amplitude',
      description: 'Wave height or zigzag height as a multiplier (1.0 = default). Only shown for wave-based fills.',
    },
    'fill.dotSize': {
      title: 'Dot Size',
      description: 'Dot radius as a multiplier (1.0 = default). Only shown for stipple and grid fills.',
    },
    'fill.padding': {
      title: 'Fill Padding (mm)',
      description: 'Insets the fill from the shape boundary by this many mm, leaving a visible margin.',
    },
    'fill.shiftX': {
      title: 'Shift X',
      description: 'Shifts the fill pattern origin horizontally, creating a phase offset.',
    },
    'fill.shiftY': {
      title: 'Shift Y',
      description: 'Shifts the fill pattern origin vertically, creating a phase offset.',
    },
    'rainfall.widthMultiplier': {
      title: 'Rain Width',
      description: 'Duplicates traces to simulate thicker rainfall.',
    },
    'rainfall.thickeningMode': {
      title: 'Thickening Mode',
      description: 'How duplicate traces are built (parallel, snake, sinusoidal).',
    },
    'rainfall.trailBreaks': {
      title: 'Trail Breaks',
      description: 'Adds controlled breaks and gaps to the rain streaks.',
    },
    'rainfall.breakRandomness': {
      title: 'Break Randomness',
      description: 'Adds randomness to break timing across all trail modes.',
    },
    'rainfall.breakSpacing': {
      title: 'Break Spacing',
      description: 'Average spacing between breaks along the trail.',
    },
    'rainfall.breakLengthJitter': {
      title: 'Length Randomization',
      description: 'Randomizes the length of each trail segment.',
    },
    'rainfall.breakWidthJitter': {
      title: 'Width Randomization',
      description: 'Randomizes the gap width between trail segments.',
    },
    'rainfall.silhouette': {
      title: 'Silhouette Image',
      description: 'Drops are generated inside the opaque area of the image.',
    },
    'rainfall.silhouetteWidth': {
      title: 'Silhouette Width',
      description: 'Width of each silhouette tile in millimeters.',
    },
    'rainfall.silhouetteHeight': {
      title: 'Silhouette Height',
      description: 'Height of each silhouette tile in millimeters.',
    },
    'rainfall.silhouetteTilesX': {
      title: 'Tiling X',
      description: 'Number of silhouette tiles across the canvas.',
    },
    'rainfall.silhouetteTilesY': {
      title: 'Tiling Y',
      description: 'Number of silhouette tiles down the canvas.',
    },
    'rainfall.silhouetteSpacing': {
      title: 'Tile Spacing',
      description: 'Spacing between silhouette tiles in millimeters.',
    },
    'rainfall.silhouetteOffsetX': {
      title: 'Offset X',
      description: 'Horizontal offset applied to the silhouette tile grid.',
    },
    'rainfall.silhouetteOffsetY': {
      title: 'Offset Y',
      description: 'Vertical offset applied to the silhouette tile grid.',
    },
    'rainfall.silhouetteInvert': {
      title: 'Invert Silhouette',
      description: 'Swaps filled and transparent regions of the silhouette.',
    },
    'rainfall.noiseApply': {
      title: 'Noise Target',
      description: 'Choose whether the noise stack affects trails, droplets, or both.',
    },
    'spiral.loops': {
      title: 'Loops',
      description: 'Number of revolutions in the spiral.',
    },
    'spiral.res': {
      title: 'Resolution',
      description: 'Points per quadrant. Higher values create smoother spirals.',
    },
    'spiral.startR': {
      title: 'Inner Radius',
      description: 'Starting radius of the spiral.',
    },
    'spiral.noiseAmp': {
      title: 'Noise Amp',
      description: 'Amount of radial jitter applied to the spiral.',
    },
    'spiral.noiseFreq': {
      title: 'Noise Freq',
      description: 'How quickly the noise changes around the spiral.',
    },
    'spiral.pulseAmp': {
      title: 'Pulse Amp',
      description: 'Adds a rhythmic bulge to the spiral radius for a breathing effect.',
    },
    'spiral.pulseFreq': {
      title: 'Pulse Freq',
      description: 'Controls how many pulses appear per revolution.',
    },
    'spiral.angleOffset': {
      title: 'Angle Offset',
      description: 'Rotates the spiral start angle in degrees.',
    },
    'spiral.axisSnap': {
      title: 'Axis Snap',
      description: 'Aligns spiral points to the X/Y axes at every quadrant.',
    },
    'spiral.close': {
      title: 'Close Spiral',
      description: 'Connects the outer end back into the spiral with a smooth closing curve.',
    },
    'spiral.closeFeather': {
      title: 'Close Feather',
      description: 'Controls how softly the closing curve arcs into the next loop.',
    },
    'grid.rows': {
      title: 'Rows',
      description: 'Number of horizontal grid lines.',
    },
    'grid.cols': {
      title: 'Cols',
      description: 'Number of vertical grid lines.',
    },
    'grid.distortion': {
      title: 'Distortion',
      description: 'Strength of the grid displacement.',
    },
    'grid.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the scale of this Noise Rack layer inside the grid field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'grid.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts a grid noise layer on the X axis before sampling.',
    },
    'grid.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts a grid noise layer on the Y axis before sampling.',
    },
    'grid.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined grid field.',
    },
    'grid.octaves': {
      title: 'Octaves',
      description: 'Number of octave samples inside this grid noise layer.',
    },
    'grid.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly frequency increases across grid-layer octaves.',
    },
    'grid.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the grid-layer field.',
    },
    'grid.chaos': {
      title: 'Chaos',
      description: 'Random jitter added after distortion.',
    },
    'grid.type': {
      title: 'Mode',
      description: 'Warp bends both axes; Shift offsets rows vertically using noise.',
    },
    'phylla.shapeType': {
      title: 'Shape',
      description: 'Switch between true circles or polygonal markers.',
    },
    'phylla.count': {
      title: 'Count',
      description: 'Number of points in the phyllotaxis spiral.',
    },
    'phylla.spacing': {
      title: 'Spacing',
      description: 'Distance between successive points.',
    },
    'phylla.angleStr': {
      title: 'Angle',
      description: 'Divergence angle in degrees; near 137.5 yields sunflower-like spacing.',
    },
    'phylla.divergence': {
      title: 'Divergence',
      description: 'Scales radial growth rate.',
    },
    'phylla.noiseInf': {
      title: 'Noise Influence',
      description: 'Adds organic wobble to point positions.',
    },
    'phylla.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the scale of this Noise Rack layer inside the phyllotaxis field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'phylla.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts a phyllotaxis noise layer on the X axis before sampling.',
    },
    'phylla.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts a phyllotaxis noise layer on the Y axis before sampling.',
    },
    'phylla.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined phyllotaxis field.',
    },
    'phylla.octaves': {
      title: 'Octaves',
      description: 'Number of octave samples inside this phyllotaxis noise layer.',
    },
    'phylla.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly frequency increases across phyllotaxis-layer octaves.',
    },
    'phylla.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the phyllotaxis-layer field.',
    },
    'phylla.dotSize': {
      title: 'Dot Size',
      description: 'Radius of each dot marker.',
    },
    'phylla.sides': {
      title: 'Sides',
      description: 'Number of sides for polygon markers.',
    },
    'phylla.sideJitter': {
      title: 'Side Jitter',
      description: 'Random variation applied to polygon side count.',
    },
    'boids.count': {
      title: 'Agents',
      description: 'Number of flocking agents.',
    },
    'boids.steps': {
      title: 'Duration',
      description: 'Number of simulation steps; controls trail length.',
    },
    'boids.speed': {
      title: 'Speed',
      description: 'Maximum speed of each agent.',
    },
    'boids.sepDist': {
      title: 'Separation',
      description: 'Radius where agents repel each other.',
    },
    'boids.alignDist': {
      title: 'Alignment',
      description: 'Radius where agents align velocities.',
    },
    'boids.cohDist': {
      title: 'Cohesion',
      description: 'Radius where agents steer toward the group center.',
    },
    'boids.force': {
      title: 'Steer Force',
      description: 'Strength of steering corrections.',
    },
    'boids.sepWeight': {
      title: 'Separation Weight',
      description: 'Balances how strongly agents avoid neighbors.',
    },
    'boids.alignWeight': {
      title: 'Alignment Weight',
      description: 'Balances how strongly agents match velocity.',
    },
    'boids.cohWeight': {
      title: 'Cohesion Weight',
      description: 'Balances how strongly agents steer toward the group center.',
    },
    'boids.mode': {
      title: 'Mode',
      description: 'Switches between bird-like flocking and fish-like schooling.',
    },
    'attractor.type': {
      title: 'Attractor Type',
      description: 'Selects the chaotic system used to generate the path.',
    },
    'attractor.scale': {
      title: 'Scale',
      description: 'Overall size of the attractor.',
    },
    'attractor.iter': {
      title: 'Iterations',
      description: 'Number of steps plotted in the attractor.',
    },
    'attractor.sigma': {
      title: 'Sigma',
      description: 'Lorenz system parameter controlling X/Y coupling.',
    },
    'attractor.rho': {
      title: 'Rho',
      description: 'Lorenz system parameter influencing chaotic spread.',
    },
    'attractor.beta': {
      title: 'Beta',
      description: 'Lorenz system parameter affecting Z damping.',
    },
    'attractor.dt': {
      title: 'Time Step',
      description: 'Integration step size; smaller values are smoother but slower.',
    },
    'hyphae.sources': {
      title: 'Sources',
      description: 'Number of starting growth points.',
    },
    'hyphae.steps': {
      title: 'Growth Steps',
      description: 'Number of growth iterations.',
    },
    'hyphae.branchProb': {
      title: 'Branch Probability',
      description: 'Chance of branching at each segment.',
    },
    'hyphae.angleVar': {
      title: 'Wiggle',
      description: 'Randomness in branch direction.',
    },
    'hyphae.segLen': {
      title: 'Segment Length',
      description: 'Length of each growth segment.',
    },
    'hyphae.maxBranches': {
      title: 'Max Branches',
      description: 'Hard cap to prevent runaway growth.',
    },
    'shapePack.shape': {
      title: 'Shape',
      description: 'Circle outputs true SVG circles; Polygon uses segments.',
    },
    'shapePack.count': {
      title: 'Max Count',
      description: 'Maximum number of shapes to place.',
    },
    'shapePack.radiusRange': {
      title: 'Radius Range',
      description: 'Minimum and maximum radius for each packed shape (in millimeters).',
    },
    'shapePack.padding': {
      title: 'Padding',
      description: 'Extra spacing between shapes.',
    },
    'shapePack.attempts': {
      title: 'Attempts',
      description: 'Placement iterations before stopping.',
    },
    'shapePack.segments': {
      title: 'Segments',
      description: 'Polygon sides (min 3). Ignored when Shape = Circle.',
    },
    'shapePack.rotationStep': {
      title: 'Rotation Step',
      description: 'Adds rotation per shape index (function-based offset).',
    },
    'shapePack.perspectiveType': {
      title: 'Perspective Type',
      description: 'Perspective warp applied to polygons (none, vertical, horizontal, radial).',
    },
    'shapePack.perspective': {
      title: 'Perspective Amount',
      description: 'Strength of the perspective warp. Negative values invert the effect.',
    },
    'shapePack.perspectiveX': {
      title: 'Perspective X',
      description: 'Horizontal offset for the perspective origin (mm).',
    },
    'shapePack.perspectiveY': {
      title: 'Perspective Y',
      description: 'Vertical offset for the perspective origin (mm).',
    },
    'petalis.preset': {
      title: 'Preset',
      description: 'Loads a curated Petalis recipe. Presets overwrite petal, distribution, center, and shading parameters.',
    },
    'petalis.petalProfile': {
      title: 'Petal Profile',
      description: 'Selects the base silhouette used to build each petal (oval, teardrop, lanceolate, etc.).',
    },
    'petalis.petalScale': {
      title: 'Petal Scale',
      description: 'Controls the overall petal size in millimeters before ring scaling or morphing is applied.',
    },
    'petalis.petalWidthRatio': {
      title: 'Width/Length Ratio',
      description: 'Sets how wide the petal is relative to its length. Lower values create thinner petals.',
    },
    'petalis.petalLengthRatio': {
      title: 'Length Ratio',
      description: 'Multiplies the petal length without changing the width ratio.',
    },
    'petalis.petalSizeRatio': {
      title: 'Size Ratio',
      description: 'Scales both width and length uniformly for the petal silhouette.',
    },
    'petalis.leafSidePos': {
      title: 'Side Position',
      description: 'Moves the widest point of the petal up or down along its length.',
    },
    'petalis.leafSideWidth': {
      title: 'Side Width',
      description: 'Scales the maximum width defined by the side control point.',
    },
    'petalis.petalSteps': {
      title: 'Petal Resolution',
      description: 'Number of points used to draw each petal. Higher values create smoother curves.',
    },
    'petalis.layering': {
      title: 'Layering',
      description: 'When enabled, inner petals visually occlude outer petals by clipping overlapping outlines.',
    },
    'petalis.anchorToCenter': {
      title: 'Anchor to Center Ring',
      description: 'Anchors petals to the central ring (central only, all petals, or off for free radial placement).',
    },
    'petalis.anchorRadiusRatio': {
      title: 'Anchor Radius Ratio',
      description: 'Scales the anchor radius used for petal attachment to the center ring.',
    },
    'petalis.tipSharpness': {
      title: 'Tip Sharpness',
      description: 'Controls how pointy the petal tip is while keeping the base rounded. At 0 the tip is fully rounded.',
    },
    'petalis.tipTwist': {
      title: 'Tip Rotate',
      description: 'Rotates the tip shape to create subtle spiraling at the petal tip.',
    },
    'petalis.centerCurlBoost': {
      title: 'Center Tip Rotate Boost',
      description: 'Boosts tip rotation for petals closer to the center to emphasize a curled core.',
    },
    'petalis.tipCurl': {
      title: 'Tip Rounding',
      description: 'Rounds the outer petal tip. 0 keeps a sharp edge, 1 approaches a semicircular tip.',
    },
    'petalis.baseFlare': {
      title: 'Base Flare',
      description: 'Flares the petal base outward, widening where it attaches to the center.',
    },
    'petalis.basePinch': {
      title: 'Base Pinch',
      description: 'Narrows the petal base for a tighter, tapered attachment.',
    },
    'petalis.edgeWaveAmp': {
      title: 'Edge Wave Amplitude',
      description: 'Adds waviness along petal edges. Higher values create deeper scallops.',
    },
    'petalis.edgeWaveFreq': {
      title: 'Edge Wave Frequency',
      description: 'Controls the number of wave cycles along each petal edge.',
    },
    'petalis.centerWaveBoost': {
      title: 'Center Wave Boost',
      description: 'Boosts edge waviness for petals nearer the center.',
    },
    'petalis.count': {
      title: 'Petal Count',
      description: 'Total number of petals when using a single ring layout.',
    },
    'petalis.ringMode': {
      title: 'Ring Mode',
      description: 'Chooses between a single ring or dual inner/outer rings.',
    },
    'petalis.innerCount': {
      title: 'Inner Petal Count',
      description: 'Number of petals in the inner ring when dual mode is enabled.',
    },
    'petalis.outerCount': {
      title: 'Outer Petal Count',
      description: 'Number of petals in the outer ring when dual mode is enabled.',
    },
    'petalis.ringSplit': {
      title: 'Ring Split',
      description: 'Controls how the radius range is divided between inner and outer rings.',
    },
    'petalis.innerOuterLock': {
      title: 'Inner = Outer',
      description: 'Locks the outer profile to mirror the inner profile while editing.',
    },
    'petalis.profileTransitionPosition': {
      title: 'Profile Transition Position',
      description: 'Sets the radial position where petals transition from inner profile to outer profile.',
    },
    'petalis.profileTransitionFeather': {
      title: 'Profile Transition Feather',
      description: 'Controls the blend width for transitioning from inner to outer profile.',
    },
    'petalis.ringOffset': {
      title: 'Ring Offset',
      description: 'Rotates the outer ring relative to the inner ring.',
    },
    'petalis.spiralMode': {
      title: 'Phyllotaxis Mode',
      description: 'Uses the golden angle or a custom angle to distribute petals radially.',
    },
    'petalis.customAngle': {
      title: 'Custom Angle',
      description: 'Custom phyllotaxis angle in degrees when Phyllotaxis Mode is set to Custom.',
    },
    'petalis.spiralTightness': {
      title: 'Spiral Tightness',
      description: 'Controls how quickly petals spiral out from the center.',
    },
    'petalis.radialGrowth': {
      title: 'Radial Growth',
      description: 'Scales the radial distance of petals from the center.',
    },
    'petalis.spiralStart': {
      title: 'Spiral Start',
      description: 'Sets where the spiral begins along the radial range (0 = center, 1 = edge).',
    },
    'petalis.spiralEnd': {
      title: 'Spiral End',
      description: 'Sets where the spiral ends along the radial range (lower values keep outer petals tighter).',
    },
    'petalis.centerSizeMorph': {
      title: 'Size Morph',
      description: 'Scales petals near the center up or down based on distance to the core.',
    },
    'petalis.centerSizeCurve': {
      title: 'Size Morph Curve',
      description: 'Controls how quickly size morphing ramps from center to outer ring.',
    },
    'petalis.centerShapeMorph': {
      title: 'Shape Morph',
      description: 'Blends between the petal profile and the center profile near the core.',
    },
    'petalis.centerProfile': {
      title: 'Center Profile',
      description: 'Profile used for petals near the center when shape morphing is active.',
    },
    'petalis.budMode': {
      title: 'Bud Mode',
      description: 'Shrinks and tightens petals near the center to create a closed bud.',
    },
    'petalis.budRadius': {
      title: 'Bud Radius',
      description: 'Controls how far from the center the bud effect spreads.',
    },
    'petalis.budTightness': {
      title: 'Bud Tightness',
      description: 'Strength of the bud squeeze; higher values pull petals tighter.',
    },
    'petalis.centerType': {
      title: 'Center Type',
      description: 'Selects the central element style (disk, dome, starburst, dot field, filament cluster).',
    },
    'petalis.centerRadius': {
      title: 'Center Radius',
      description: 'Sets the radius of the central element in millimeters.',
    },
    'petalis.centerDensity': {
      title: 'Center Density',
      description: 'Controls how many central elements are drawn (dots, rays, filaments).',
    },
    'petalis.centerFalloff': {
      title: 'Center Falloff',
      description: 'Reduces central element density toward the outer edge of the center.',
    },
    'petalis.centerRing': {
      title: 'Secondary Ring',
      description: 'Adds a ring of small dots around the center.',
    },
    'petalis.centerRingRadius': {
      title: 'Ring Radius',
      description: 'Radius of the secondary dot ring.',
    },
    'petalis.centerRingDensity': {
      title: 'Ring Density',
      description: 'Number of dots in the secondary ring.',
    },
    'petalis.centerConnectors': {
      title: 'Connect to Petals',
      description: 'Draws connector strokes between the center and nearby petals.',
    },
    'petalis.connectorCount': {
      title: 'Connector Count',
      description: 'How many connector strokes to generate.',
    },
    'petalis.connectorLength': {
      title: 'Connector Length',
      description: 'Length of each connector stroke in millimeters.',
    },
    'petalis.connectorJitter': {
      title: 'Connector Jitter',
      description: 'Random angular variance for connector placement.',
    },
    'petalis.countJitter': {
      title: 'Count Jitter',
      description: 'Randomizes petal counts per ring for more organic variability.',
    },
    'petalis.sizeJitter': {
      title: 'Size Jitter',
      description: 'Adds per-petal size variance for natural irregularity.',
    },
    'petalis.rotationJitter': {
      title: 'Rotation Jitter',
      description: 'Random rotation offset applied to each petal.',
    },
    'petalis.angularDrift': {
      title: 'Angular Drift',
      description: 'Adds a smooth angular drift across the petal sequence.',
    },
    'petalis.driftStrength': {
      title: 'Drift Strength',
      description: 'Controls how strongly drift affects petal rotation.',
    },
    'petalis.driftNoise': {
      title: 'Drift Noise',
      description: 'Controls each Noise Rack layer used to modulate Petalis angular drift.',
    },
    'petalis.radiusScale': {
      title: 'Radius Scale',
      description: 'Scales petal radius outward or inward across the ring.',
    },
    'petalis.radiusScaleCurve': {
      title: 'Radius Scale Curve',
      description: 'Controls how quickly the radius scale changes from center to edge.',
    },
    'petalis.centerModRippleAmount': {
      title: 'Center Ripple Amount',
      description: 'Amplitude of radial ripples applied to the center elements.',
    },
    'petalis.centerModType': {
      title: 'Center Modifier Type',
      description: 'Selects which modifier is applied to the center elements (ripple, twist, noise, etc.).',
    },
    'petalis.centerModRippleFrequency': {
      title: 'Center Ripple Frequency',
      description: 'Number of ripple cycles around the center.',
    },
    'petalis.centerModTwist': {
      title: 'Center Twist',
      description: 'Rotational twist applied across the center elements.',
    },
    'petalis.centerModNoiseAmount': {
      title: 'Center Noise Amount',
      description: 'Master strength applied to the center modifier Noise Rack output.',
    },
    'petalis.centerModNoiseScale': {
      title: 'Center Noise Scale',
      description: 'Legacy fallback scale for older documents. New work should use the nested Noise Rack layer scale controls.',
    },
    'petalis.centerModNoiseSeed': {
      title: 'Center Noise Seed',
      description: 'Seed used when initializing the center modifier Noise Rack.',
    },
    'petalis.centerModFalloff': {
      title: 'Center Falloff Strength',
      description: 'Compresses center elements toward the core based on radius.',
    },
    'petalis.centerModOffsetX': {
      title: 'Center Offset X',
      description: 'Offsets center elements horizontally in millimeters.',
    },
    'petalis.centerModOffsetY': {
      title: 'Center Offset Y',
      description: 'Offsets center elements vertically in millimeters.',
    },
    'petalis.centerModClip': {
      title: 'Center Clip Radius',
      description: 'Clips center elements to a maximum radius.',
    },
    'petalis.centerModCircularAmount': {
      title: 'Circular Offset Amount',
      description: 'Magnitude of circular offsets applied to ring elements.',
    },
    'petalis.centerModCircularRandomness': {
      title: 'Circular Offset Randomness',
      description: 'Controls how much random variation is applied to circular offsets.',
    },
    'petalis.centerModCircularDirection': {
      title: 'Circular Offset Bias',
      description: 'Biases the circular offset inward, outward, or both.',
    },
    'petalis.centerModCircularSeed': {
      title: 'Circular Offset Seed',
      description: 'Seed for the circular offset noise pattern.',
    },
    'petalis.petalModRippleAmount': {
      title: 'Petal Ripple Amount',
      description: 'Amplitude of ripples along the petal length.',
    },
    'petalis.petalModType': {
      title: 'Petal Modifier Type',
      description: 'Selects which modifier is applied to petals (ripple, twist, noise, shear, taper, offset).',
    },
    'petalis.petalModRippleFrequency': {
      title: 'Petal Ripple Frequency',
      description: 'Number of ripple cycles along each petal.',
    },
    'petalis.petalModTwist': {
      title: 'Petal Twist',
      description: 'Twists petals along their length for a corkscrew effect.',
    },
    'petalis.petalModNoiseAmount': {
      title: 'Petal Noise Amount',
      description: 'Master strength applied to the petal modifier Noise Rack output.',
    },
    'petalis.petalModNoiseScale': {
      title: 'Petal Noise Scale',
      description: 'Legacy fallback scale for older documents. New work should use the nested Noise Rack layer scale controls.',
    },
    'petalis.petalModNoiseSeed': {
      title: 'Petal Noise Seed',
      description: 'Seed used when initializing the petal modifier Noise Rack.',
    },
    'petalis.petalModShear': {
      title: 'Petal Shear',
      description: 'Shears petals diagonally to bias the silhouette.',
    },
    'petalis.petalModTaper': {
      title: 'Petal Taper',
      description: 'Tapers petals toward the tip or base depending on the sign.',
    },
    'petalis.petalModOffsetX': {
      title: 'Petal Offset X',
      description: 'Offsets petal geometry horizontally in millimeters.',
    },
    'petalis.petalModOffsetY': {
      title: 'Petal Offset Y',
      description: 'Offsets petal geometry vertically in millimeters.',
    },
    'petalis.shadingType': {
      title: 'Shading Type',
      description: 'Selects the shading style applied inside or along the petal.',
    },
    'petalis.shadingLineType': {
      title: 'Shading Line Type',
      description: 'Chooses solid, dashed, dotted, or stitch rendering for the shading strokes.',
    },
    'petalis.shadingLineSpacing': {
      title: 'Line Spacing',
      description: 'Distance between shading strokes in millimeters.',
    },
    'petalis.shadingDensity': {
      title: 'Line Density',
      description: 'Multiplies the number of shading strokes without changing the base spacing.',
    },
    'petalis.shadingJitter': {
      title: 'Line Jitter',
      description: 'Adds controlled randomness to the spacing of shading strokes.',
    },
    'petalis.shadingLengthJitter': {
      title: 'Length Jitter',
      description: 'Randomizes how far shading strokes extend along the petal.',
    },
    'petalis.shadingAngle': {
      title: 'Hatch Angle',
      description: 'Rotation of the shading strokes relative to the petal axis, without shifting the shading band position.',
    },
    'petalis.shadingWidthX': {
      title: 'Width X',
      description: 'Horizontal coverage of shading along the petal length (percentage).',
    },
    'petalis.shadingPosX': {
      title: 'Position X',
      description: 'Horizontal center position of the shading band (percentage).',
    },
    'petalis.shadingGapX': {
      title: 'Gap Width X',
      description: 'Horizontal gap carved out of the shading band (percentage).',
    },
    'petalis.shadingGapPosX': {
      title: 'Gap Position X',
      description: 'Horizontal location of the shading gap (percentage).',
    },
    'petalis.shadingWidthY': {
      title: 'Width Y',
      description: 'Vertical coverage of shading across the petal width (percentage).',
    },
    'petalis.shadingPosY': {
      title: 'Position Y',
      description: 'Vertical center position of the shading band (percentage).',
    },
    'petalis.shadingGapY': {
      title: 'Gap Width Y',
      description: 'Vertical gap carved out of the shading band (percentage).',
    },
    'petalis.shadingGapPosY': {
      title: 'Gap Position Y',
      description: 'Vertical location of the shading gap (percentage).',
    },
    'petalis.lightSource': {
      title: 'Set Light Source',
      description: 'Places a draggable light source marker on the canvas to preview lighting direction (in development).',
    },
    'terrain.preset': {
      title: 'Style Preset',
      description: 'Loads a curated set of terrain parameters (alpine, hills, canyon, archipelago, river delta, tundra) into all groups below. Switch back to Custom to keep your tweaks.',
    },
    'terrain.perspectiveMode': {
      title: 'Perspective Mode',
      description: 'Top-down draws scanlines without convergence. One-point projects rows toward a single vanishing point. One-point with Landscape Horizon adds an explicit horizontal line at the horizon to anchor the scene. Two-point converges to two distinct vanishing points along the horizon for an off-axis terrain look. Isometric uses parallel-oblique projection — no convergence but with a tilted depth axis.',
    },
    'terrain.horizonHeight': {
      title: 'Horizon Height',
      description: 'Vertical position of the horizon line where distant terrain converges (pinhole modes only).',
    },
    'terrain.vanishingPointX': {
      title: 'Vanishing Point X',
      description: 'Horizontal location of the single vanishing point on the horizon line.',
    },
    'terrain.vpLeftX': {
      title: 'Left Vanishing Point X',
      description: 'X position of the left-side vanishing point in two-point mode.',
    },
    'terrain.vpRightX': {
      title: 'Right Vanishing Point X',
      description: 'X position of the right-side vanishing point in two-point mode.',
    },
    'terrain.isoAngle': {
      title: 'Isometric Angle',
      description: 'Tilt of the depth axis in isometric mode (30° is the classic isometric look).',
    },
    'terrain.depthCompression': {
      title: 'Depth Compression',
      description: 'Strength of the perspective power-law that pulls distant rows toward the horizon. Higher values cluster scanlines at the back.',
    },
    'terrain.depthScale': {
      title: 'Depth Scale',
      description: 'Top-down only: spacing of scanlines down the canvas in pixel units.',
    },
    'terrain.depthSlices': {
      title: 'Depth Slices',
      description: 'Number of scanlines from horizon to viewer. More slices = denser linework but slower.',
    },
    'terrain.xResolution': {
      title: 'X Resolution',
      description: 'Sample points per scanline. Higher values pick up finer mountain detail.',
    },
    'terrain.occlusion': {
      title: 'Hidden-Line Removal',
      description: 'Clips occluded segments where closer terrain blocks the view of more distant rows. Disable for see-through wireframe.',
    },
    'terrain.mountainAmplitude': {
      title: 'Mountain Amplitude',
      description: 'Overall vertical scale of the mountain heightfield. 0 produces a flat plane.',
    },
    'terrain.mountainFrequency': {
      title: 'Mountain Frequency',
      description: 'Spatial frequency of the ridged base noise. Higher values make smaller, denser ridges.',
    },
    'terrain.mountainOctaves': {
      title: 'Mountain Octaves',
      description: 'Number of fractal noise octaves stacked. More octaves = rougher, more detailed terrain.',
    },
    'terrain.mountainLacunarity': {
      title: 'Mountain Lacunarity',
      description: 'Frequency multiplier between octaves. Standard fractal noise uses 2.0.',
    },
    'terrain.mountainGain': {
      title: 'Mountain Gain',
      description: 'Amplitude falloff per octave. Lower values produce smoother, less spiky terrain.',
    },
    'terrain.peakSharpness': {
      title: 'Peak Sharpness',
      description: 'Power applied to ridged noise to sharpen peaks. Low values give rounded hills, high values give jagged knife-edge ridges.',
    },
    'terrain.valleyCount': {
      title: 'Valley Count',
      description: 'Number of carved valleys layered onto the heightfield. 0 disables valleys.',
    },
    'terrain.valleyDepth': {
      title: 'Valley Depth',
      description: 'How deep each valley carves into the heightfield.',
    },
    'terrain.valleyWidth': {
      title: 'Valley Width',
      description: 'Cross-sectional width of each valley in pixel units.',
    },
    'terrain.valleyShape': {
      title: 'Valley Shape (V → U)',
      description: '0 = sharp V-shaped riverine valley. 1 = wide U-shaped glacial valley.',
    },
    'terrain.valleyMeander': {
      title: 'Valley Meander',
      description: 'Sinuosity of the valley axis. Higher values produce more curved, snaking valleys.',
    },
    'terrain.riversEnabled': {
      title: 'Enable Rivers',
      description: 'Traces steepest-descent flow from high points down to the canvas edge or water level. Each trace also carves into the heightfield.',
    },
    'terrain.riverCount': {
      title: 'River Count',
      description: 'Number of river traces to draw.',
    },
    'terrain.riverWidth': {
      title: 'River Width',
      description: 'Carving radius of each river in pixel units.',
    },
    'terrain.riverDepth': {
      title: 'River Depth',
      description: 'How much each river carves the underlying heightfield.',
    },
    'terrain.riverMeander': {
      title: 'River Meander',
      description: 'Side-to-side wiggle applied to the steepest-descent path.',
    },
    'terrain.oceansEnabled': {
      title: 'Enable Oceans',
      description: 'Clamps heights below the water level to a flat sea plane.',
    },
    'terrain.waterLevel': {
      title: 'Water Level',
      description: 'Sea-level height threshold. Anything below becomes flat water.',
    },
    'terrain.drawCoastline': {
      title: 'Draw Coastline',
      description: 'Renders the iso-contour where land meets water as an additional path.',
    },
  };

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
      this.openMaskLayerId = null;
      this.activeTool = SETTINGS.activeTool || 'select';
      this.scissorMode = SETTINGS.scissorMode || 'line';
      this.selectionMode = SETTINGS.selectionMode || 'rect';
      this.penMode = SETTINGS.penMode || 'draw';
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
      this.initMachineDropdown();
      this.bindGlobal();
      this.bindShortcuts();
      this.bindInfoButtons();
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
        const hadOpenMask = this.openMaskLayerId !== null;
        this.openMaskLayerId = null;
        if (this.openPaletteMenu) {
          this.openPaletteMenu.classList.add('hidden');
          this.openPaletteMenu = null;
        }
        this.setTopMenuOpen(null, false);
        if (hadOpenMask) this.renderLayers();
      });
      this.initPaneToggles();
      this.initBottomPaneToggle();
      this.initBottomPaneResizer();
      this.initPaneResizers();
      this.initToolBar();
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

    buildExportPreviewPath(ctx, path, useCurves, sharpEdges = false) {
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

    buildExportClipPolygons(ctx, polygons) {
      (polygons || []).forEach((polygon) => {
        if (!Array.isArray(polygon) || polygon.length < 3) return;
        ctx.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
        ctx.closePath();
      });
    }

    fitExportPreview() {
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

    resizeExportPreviewCanvas() {
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

    renderExportPreview() {
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

    decorateExportControlsPanel() {
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

    syncLegendSettingsControls(root) {
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

    attachExportInfoButtons(panel) {
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

    openExportModal() {
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
        legendStartColorBtn.onclick = () => openColorPickerAnchoredTo(legendStartColorInput, legendStartColorBtn);
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
        legendEndColorBtn.onclick = () => openColorPickerAnchoredTo(legendEndColorInput, legendEndColorBtn);
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

    toggleSettingsPanel(force) {
      const settingsPanel = getEl('settings-panel', { silent: true });
      if (!settingsPanel) return false;
      const nextOpen = typeof force === 'boolean' ? force : !settingsPanel.classList.contains('open');
      settingsPanel.classList.toggle('open', nextOpen);
      return true;
    }

    setTopMenuOpen(trigger = null, open = true) {
      const triggers = Array.isArray(this.topMenuTriggers) ? this.topMenuTriggers : [];
      const nextTrigger = open ? trigger : null;
      triggers.forEach((btn) => {
        const panel = btn.parentElement?.querySelector('[data-top-menu-panel]');
        const isActive = Boolean(nextTrigger) && btn === nextTrigger;
        btn.classList.toggle('open', isActive);
        btn.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        if (panel) {
          panel.classList.toggle('open', isActive);
          panel.hidden = !isActive;
        }
      });
      this.openTopMenuTrigger = nextTrigger || null;
    }

    initTopMenuBar() {
      const menubar = getEl('top-menubar');
      if (!menubar) return;
      const triggers = Array.from(menubar.querySelectorAll('[data-top-menu-trigger]'));
      if (!triggers.length) return;
      const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
      const useMacNotation = /mac|iphone|ipad|ipod/.test(platform);
      menubar.querySelectorAll('.top-menu-shortcut[data-shortcut-mac]').forEach((el) => {
        const macLabel = el.dataset.shortcutMac || '';
        const winLabel = el.dataset.shortcutWin || macLabel;
        el.textContent = useMacNotation ? macLabel : winLabel;
      });
      this.topMenuTriggers = triggers;
      const getPanel = (trigger) => trigger?.parentElement?.querySelector('[data-top-menu-panel]') || null;
      const getItems = (panel) =>
        Array.from(panel?.querySelectorAll('.top-menu-item:not([disabled])') || []);
      const focusTriggerByDelta = (current, delta) => {
        const index = triggers.indexOf(current);
        if (index < 0) return current;
        const nextIndex = (index + delta + triggers.length) % triggers.length;
        const next = triggers[nextIndex];
        next?.focus();
        return next;
      };

      triggers.forEach((trigger) => {
        const panel = getPanel(trigger);
        trigger.setAttribute('aria-expanded', 'false');
        if (panel) panel.hidden = true;
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const shouldOpen = this.openTopMenuTrigger !== trigger;
          this.setTopMenuOpen(trigger, shouldOpen);
        });
        trigger.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = focusTriggerByDelta(trigger, 1);
            if (this.openTopMenuTrigger) this.setTopMenuOpen(next, true);
            return;
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const prev = focusTriggerByDelta(trigger, -1);
            if (this.openTopMenuTrigger) this.setTopMenuOpen(prev, true);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.setTopMenuOpen(trigger, true);
            const first = getItems(panel)[0];
            if (first) first.focus();
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const shouldOpen = this.openTopMenuTrigger !== trigger;
            this.setTopMenuOpen(trigger, shouldOpen);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            this.setTopMenuOpen(null, false);
          }
        });
        if (!panel) return;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.addEventListener('keydown', (e) => {
          const items = getItems(panel);
          if (!items.length) return;
          const focused = document.activeElement;
          const idx = items.indexOf(focused);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = idx < 0 ? items[0] : items[(idx + 1) % items.length];
            next?.focus();
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = idx < 0 ? items[items.length - 1] : items[(idx - 1 + items.length) % items.length];
            prev?.focus();
            return;
          }
          if (e.key === 'Home') {
            e.preventDefault();
            items[0]?.focus();
            return;
          }
          if (e.key === 'End') {
            e.preventDefault();
            items[items.length - 1]?.focus();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            this.setTopMenuOpen(null, false);
            trigger.focus();
          }
        });
        getItems(panel).forEach((item) => {
          item.addEventListener('click', () => {
            this.setTopMenuOpen(null, false);
          });
        });
      });

      window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !this.openTopMenuTrigger) return;
        this.setTopMenuOpen(null, false);
      });
    }

    refreshThemeUi() {
      const toggle = getEl('theme-toggle', { silent: true });
      const bgColorInput = getEl('inp-bg-color', { silent: true });
      const isLight = `${SETTINGS.uiTheme || 'dark'}`.toLowerCase() === 'light';
      if (toggle) {
        toggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
        toggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
        toggle.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
        toggle.dataset.theme = isLight ? 'light' : 'dark';
      }
      if (bgColorInput) bgColorInput.value = SETTINGS.bgColor || bgColorInput.value || '#ffffff';
    }

    scrollLayerToTop(layerId) {
      const container = getEl('layer-list');
      if (!container || !layerId) return;
      const el = container.querySelector(`[data-layer-id="${layerId}"]`);
      if (!el) return;
      container.scrollTop = Math.max(0, el.offsetTop);
    }

    captureLeftPanelScrollPosition() {
      const pane = document.getElementById('left-panel-content');
      if (!pane) return () => {};
      const prevScrollTop = pane.scrollTop;
      return () => {
        window.requestAnimationFrame(() => {
          const maxScroll = Math.max(0, pane.scrollHeight - pane.clientHeight);
          pane.scrollTop = Math.min(prevScrollTop, maxScroll);
        });
      };
    }

    createModal() {
      const overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <div class="modal-title" id="modal-title"></div>
            <button class="modal-close" type="button" aria-label="Close modal">✕</button>
          </div>
          <div class="modal-body"></div>
        </div>
      `;
      document.body.appendChild(overlay);

      const card = overlay.querySelector('.modal-card');
      const closeBtn = overlay.querySelector('.modal-close');
      const titleEl = overlay.querySelector('.modal-title');
      const bodyEl = overlay.querySelector('.modal-body');

      overlay.onclick = () => this.closeModal();
      card.onclick = (e) => e.stopPropagation();
      closeBtn.onclick = () => this.closeModal();

      return { overlay, titleEl, bodyEl };
    }

    openModal({ title, body, cardClass = '', onClose = null }) {
      this._modalPrevFocus = document.activeElement || null;
      if (typeof this._modalCleanup === 'function') {
        const cleanup = this._modalCleanup;
        this._modalCleanup = null;
        cleanup();
      }
      this.modal.titleEl.textContent = title;
      this.modal.overlay.querySelector('.modal-card')?.setAttribute('class', `modal-card ${cardClass}`.trim());
      this.modal.bodyEl.innerHTML = '';
      if (typeof body === 'string') this.modal.bodyEl.innerHTML = body;
      else if (body instanceof Node) this.modal.bodyEl.appendChild(body);
      this._modalCleanup = typeof onClose === 'function' ? onClose : null;
      this.modal.overlay.classList.add('open');
      // Move focus to first focusable element in modal
      requestAnimationFrame(() => {
        const focusable = this.modal.overlay.querySelector('button, input, [tabindex="0"]');
        if (focusable) focusable.focus();
      });
    }

    openColorModal({ title, value, onApply }) {
      const safeValue = value || '#ffffff';
      const body = `
        <div class="color-modal">
          <div class="color-modal-row">
            <input type="color" class="color-modal-input" value="${safeValue}">
            <input type="text" class="color-modal-hex" value="${safeValue}" aria-label="Hex color">
          </div>
          <div class="color-modal-preview" style="background:${safeValue}"></div>
          <div class="color-modal-actions">
            <button type="button" class="color-modal-cancel">Cancel</button>
            <button type="button" class="color-modal-apply">Apply</button>
          </div>
        </div>
      `;
      this.openModal({ title, body });

      const input = this.modal.bodyEl.querySelector('.color-modal-input');
      const hexInput = this.modal.bodyEl.querySelector('.color-modal-hex');
      const preview = this.modal.bodyEl.querySelector('.color-modal-preview');
      const cancelBtn = this.modal.bodyEl.querySelector('.color-modal-cancel');
      const applyBtn = this.modal.bodyEl.querySelector('.color-modal-apply');

      const normalizeHex = (raw) => {
        if (!raw) return null;
        let next = raw.trim();
        if (!next.startsWith('#')) next = `#${next}`;
        if (/^#[0-9a-fA-F]{3}$/.test(next)) {
          next = `#${next[1]}${next[1]}${next[2]}${next[2]}${next[3]}${next[3]}`;
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(next)) return null;
        return next.toLowerCase();
      };
      const sync = (next) => {
        if (input) input.value = next;
        if (hexInput) hexInput.value = next;
        if (preview) preview.style.background = next;
      };

      if (input) {
        input.oninput = (e) => {
          const next = e.target.value;
          sync(next);
        };
      }
      if (hexInput) {
        hexInput.oninput = (e) => {
          const normalized = normalizeHex(e.target.value);
          if (normalized) sync(normalized);
        };
      }
      if (cancelBtn) {
        cancelBtn.onclick = () => this.closeModal();
      }
      if (applyBtn) {
        applyBtn.onclick = () => {
          const normalized = normalizeHex(hexInput?.value || input?.value || '');
          if (!normalized) {
            this.showValueError(hexInput?.value || '');
            return;
          }
          if (onApply) onApply(normalized);
          this.closeModal();
        };
      }
    }

    closeModal() {
      this.modal.overlay.classList.remove('open');
      this.modal.overlay.querySelector('.modal-card')?.setAttribute('class', 'modal-card');
      if (typeof this._modalCleanup === 'function') {
        const cleanup = this._modalCleanup;
        this._modalCleanup = null;
        cleanup();
      }
      if (this._modalPrevFocus && typeof this._modalPrevFocus.focus === 'function') {
        this._modalPrevFocus.focus();
        this._modalPrevFocus = null;
      }
    }

    getLeftSectionDefaults() {
      return {
        algorithm: false,
        algorithmTransform: true,
        algorithmConfiguration: false,
      };
    }

    getLeftSectionMap() {
      return {
        algorithm: getEl('left-section-algorithm'),
        algorithmConfiguration: getEl('left-section-algorithm-configuration'),
      };
    }

    setLeftSectionCollapsed(key, collapsed, options = {}) {
      const { persist = true } = options;
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
      }
      SETTINGS.uiSections[key] = Boolean(collapsed);
      const sectionMap = this.getLeftSectionMap();
      const section = sectionMap[key];
      if (!section) return;
      const body = section.querySelector('.left-panel-section-body');
      section.classList.toggle('collapsed', Boolean(collapsed));
      if (body) body.style.display = collapsed ? 'none' : '';
      const sectionHeader = section.querySelector('.left-panel-section-header');
      if (sectionHeader) sectionHeader.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (!persist) return;
      this.app.persistPreferencesDebounced?.();
    }

    initLeftPanelSections() {
      const defaults = this.getLeftSectionDefaults();
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...defaults };
      } else {
        SETTINGS.uiSections = { ...defaults, ...SETTINGS.uiSections };
      }
      const sectionMap = this.getLeftSectionMap();
      Object.entries(sectionMap).forEach(([key, section]) => {
        if (!section) return;
        const header = section.querySelector('.left-panel-section-header');
        const collapsed = SETTINGS.uiSections[key] === true;
        this.setLeftSectionCollapsed(key, collapsed, { persist: false });
        if (!header) return;
        header.onclick = () => {
          const next = !section.classList.contains('collapsed');
          this.setLeftSectionCollapsed(key, next);
        };
      });
    }

    setAlgorithmTransformCollapsed(collapsed, options = {}) {
      const { persist = true } = options;
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
      }
      SETTINGS.uiSections.algorithmTransform = Boolean(collapsed);
      const section = getEl('algorithm-transform-section');
      if (!section) return;
      const body = getEl('algorithm-transform-body') || section.querySelector('.global-section-body');
      section.classList.toggle('collapsed', Boolean(collapsed));
      if (body) body.style.display = collapsed ? 'none' : '';
      const transformHeader = getEl('algorithm-transform-header');
      if (transformHeader) transformHeader.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (!persist) return;
      this.app.persistPreferencesDebounced?.();
    }

    initAlgorithmTransformSection() {
      const section = getEl('algorithm-transform-section');
      const header = getEl('algorithm-transform-header');
      if (!section) return;
      const defaults = this.getLeftSectionDefaults();
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...defaults };
      } else {
        SETTINGS.uiSections = { ...defaults, ...SETTINGS.uiSections };
      }
      const collapsed = SETTINGS.uiSections.algorithmTransform !== false;
      this.setAlgorithmTransformCollapsed(collapsed, { persist: false });
      if (!header) return;
      header.onclick = () => {
        const next = !section.classList.contains('collapsed');
        this.setAlgorithmTransformCollapsed(next);
      };
    }

    setAboutVisible(visible, options = {}) {
      const { persist = true } = options;
      SETTINGS.aboutVisible = visible !== false;
      if (!SETTINGS.uiSections || typeof SETTINGS.uiSections !== 'object') {
        SETTINGS.uiSections = { ...this.getLeftSectionDefaults() };
      }
      SETTINGS.uiSections.algorithmAbout = SETTINGS.aboutVisible;
      const about = getEl('algo-about');
      if (about) about.style.display = SETTINGS.aboutVisible ? '' : 'none';
      if (!persist) return;
      this.app.persistPreferencesDebounced?.();
    }

    initAboutSection() {
      const closeBtn = getEl('algo-about-close');
      const remembered =
        SETTINGS.uiSections &&
        typeof SETTINGS.uiSections === 'object' &&
        Object.prototype.hasOwnProperty.call(SETTINGS.uiSections, 'algorithmAbout')
          ? SETTINGS.uiSections.algorithmAbout
          : undefined;
      if (remembered !== undefined) {
        SETTINGS.aboutVisible = remembered !== false;
      } else if (SETTINGS.aboutVisible === undefined) {
        SETTINGS.aboutVisible = true;
      }
      this.setAboutVisible(SETTINGS.aboutVisible, { persist: false });
      if (closeBtn) {
        closeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setAboutVisible(false);
        };
      }
    }

    buildHelpContent(focusShortcuts = false) {
      const shortcuts = `
        <div class="modal-section">
          <div class="modal-ill-label">Keyboard Shortcuts</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div><span class="text-vectura-accent">?</span> Open shortcuts</div>
            <div><span class="text-vectura-accent">F1</span> Help guide</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + O</span> Open Project</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + S</span> Save Project</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + P</span> Import SVG</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + E</span> Export SVG</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + K</span> Toggle Document Setup</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + 0</span> Reset View</div>
            <div><span class="text-vectura-accent">V</span> Selection tool (press again to cycle modes)</div>
            <div><span class="text-vectura-accent">A</span> Direct selection tool</div>
            <div><span class="text-vectura-accent">M</span> Rectangle tool</div>
            <div><span class="text-vectura-accent">L</span> Oval tool</div>
            <div><span class="text-vectura-accent">Y</span> Polygon tool</div>
            <div><span class="text-vectura-accent">P</span> Pen tool (press again to cycle subtools)</div>
            <div><span class="text-vectura-accent">F</span> Fill tool</div>
            <div><span class="text-vectura-accent">Shift + F</span> Erase fill tool</div>
            <div><span class="text-vectura-accent">+</span> Add anchor point tool</div>
            <div><span class="text-vectura-accent">-</span> Delete anchor point tool</div>
            <div><span class="text-vectura-accent">Shift + C</span> Anchor point tool</div>
            <div><span class="text-vectura-accent">C</span> Scissor tool (press again to cycle modes)</div>
            <div><span class="text-vectura-accent">Space</span> Hand tool (temporary)</div>
            <div><span class="text-vectura-accent">Petal Designer</span> A/P/+/-/Shift+C, Shift-constrain, Alt convert/break/remove handle, Cmd/Ctrl temporary direct</div>
            <div><span class="text-vectura-accent">Petal Designer</span> Middle-click drag pans, mouse wheel zooms both petals together when both are visible</div>
            <div><span class="text-vectura-accent">Enter</span> Commit pen path</div>
            <div><span class="text-vectura-accent">Double-click</span> Close pen path near start</div>
            <div><span class="text-vectura-accent">Backspace</span> Remove last pen point</div>
            <div><span class="text-vectura-accent">Esc</span> Cancel pen/scissor/shape drafts</div>
            <div><span class="text-vectura-accent">Shift</span> Constrain pen angle / handles, square/circle shapes, snap polygon angle, Scissor line snaps 15°</div>
            <div><span class="text-vectura-accent">Alt/Option</span> Break pen handles, draw shapes from center, or temporarily erase fills while Fill is active</div>
            <div><span class="text-vectura-accent">Arrow Up / Down</span> Change polygon side count while dragging</div>
            <div><span class="text-vectura-accent">Mask Parent Drag</span> While moving/resizing/rotating a mask parent, masked descendants ghost-preview outside the silhouette until mouse release</div>
            <div><span class="text-vectura-accent">Shape Reticle</span> Rectangle/Oval/Polygon tools use an Illustrator-style reticle cursor while active</div>
            <div><span class="text-vectura-accent">Selection Tool</span> Drag a shape corner widget to round all corners together</div>
            <div><span class="text-vectura-accent">Direct Tool</span> Drag endpoints/handles on individual line paths, or drag a shape corner widget to round one corner</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl</span> Temporary selection while using Pen</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + A</span> Select all layers (from anywhere)</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + G</span> Group selection</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + G</span> Ungroup selection</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + E</span> Expand selection into sublayers</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + D</span> Duplicate selection (Alt/Option + D fallback)</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + [</span> Move layer down</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + ]</span> Move layer up</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Shift + [ / ]</span> Send to back / front</div>
            <div><span class="text-vectura-accent">Theme Toggle</span> Use the sun/moon switch in the upper-right header to flip dark and light UI modes</div>
            <div><span class="text-vectura-accent">Delete</span> Remove selected layer(s)</div>
            <div><span class="text-vectura-accent">Arrow Keys</span> Nudge (Shift = bigger)</div>
            <div><span class="text-vectura-accent">Alt/Option + Drag</span> Duplicate layer</div>
            <div><span class="text-vectura-accent">Cmd/Ctrl + Z</span> Undo</div>
          </div>
        </div>
      `;
      const guidance = `
        <div class="modal-section">
          <div class="modal-ill-label">Getting Started</div>
          <p class="modal-text">
            Choose an algorithm, adjust its parameters, and refine with transform controls. Use layers to stack
            multiple generations, then export SVG for plotting.
          </p>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            For Wavetable image noise, set Noise Type to Image and use Select Image to load a file.
            Rainfall supports silhouette images to constrain where drops appear.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Wavetable noise stacks can be added, reordered, and blended with tile patterns and image effects.
            Image noise includes an Image Effects stack plus optional style shaping.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Wavetable Line Structure supports Horizontal, Vertical, Horizontal &amp; Vertical, Isometric, and Lattice layouts.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            In Wavetable Isometric mode, Line Gap controls the visible cell spacing and Row Shift shears the full lattice together instead of only offsetting one family.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Petalis includes an embedded panel; use its pop-out icon (⧉) to open the same panel in a floating window and pop-in (↩) to dock it back.
            It includes flower presets, radial petal controls, a PETAL VISUALIZER pane (Overlay or Side by Side), a PROFILE EDITOR for inner/outer profile import/export, an Export Pair button below both profile cards, a shading stack with in-place hatch-angle rotation, and a matching modifier stack.
            Shape comes from editable inner/outer curves, each stack item has its own Petal Shape target (Inner/Outer/Both), the inactive overlay silhouette can be clicked to switch targets, and the designer keeps symmetry per side with a collapsible Randomness &amp; Seed section at the bottom.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            PROFILE dropdown entries come from <code>src/config/petal-profiles</code> and remain available when opening <code>index.html</code> directly (no local server required).
            If you edit profile JSON files, run <code>npm run profiles:bundle</code> so the <code>library.js</code> file:// fallback stays in sync.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Left panel sections are collapsible; Transform &amp; Seed lives inside Algorithm in its own collapsible sub-panel (collapsed by default), and ABOUT visibility is remembered.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Switching algorithms restores position, scale, and rotation to the target algorithm defaults.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Harmonograph layers combine damped pendulum waves; tweak frequency, phase, and damping for intricate loops.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Toggle pendulums on/off, add new ones, and enable Pendulum Guides to visualize each contribution.
            Use Anti-Loop Drift and Settle Cutoff to curb repeated loop paths.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Harmonograph includes a Virtual Plotter panel with playback speed controls and a scrubbable playhead preview.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Post-Processing Lab holds smoothing, curves, and simplify for the active layer.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Optimization tools (linesimplify, linesort, filter, multipass) are configured from the Export SVG modal, where the preview pane shows print order and export-visible clipping before download.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            In Line Sort, <code>Nearest</code> with <code>Horizontal</code> or <code>Vertical</code> now follows a real axis sweep, so print order progresses consistently across the chosen direction instead of only using that direction to pick the first line.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Document Setup now includes a document-level Metric/Imperial switch, a Clear Saved Preferences action, and an optional blueprint-style paper-size readout outside the canvas.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            In Overlay preview, active Line Sort shows a gradient from Overlay Color to its complement (or Line Sort Secondary Color) with a legend for print order progression.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Use the File menu to Save/Open full .vectura projects, Import SVG, open Document Setup, and open the Export SVG preview modal.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Use the sun/moon toggle in the upper-right header to switch the full interface between dark and light themes; switching themes also flips the document background default and <code>Pen 1</code> between white and black.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Use the Insert menu to add a Mirror Modifier, then drag layers under it in the Layers panel so the modifier container owns and reflects that subtree.
            Drag a child back out of the modifier block to unparent it to the root.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Mirror Stack entries are full-canvas guide axes with per-axis show/hide, lock, delete, angle, and XY shift controls plus stack-level add/show-hide/lock/clear actions.
            When a modifier is selected, the main + Add button creates a normal drawable child under that modifier using the last active algorithm.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Child layers nested under a Mirror Modifier stay fully editable when selected: click the child row or its artwork to switch back to normal Algorithm controls and edit its generator, settings, or transform directly.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Closed mask parents nested under a Mirror Modifier now mirror as closed silhouettes too, so masked descendants clip against the mirrored mask union instead of only the original mask shape.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Angle controls use circular dials—drag the marker to set direction.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Double-click a value to edit it inline (Tab/Shift+Tab to hop between params; arrows nudge, Shift = 10x).
            Double-click a control to reset it to defaults.
          </div>
          <div class="text-xs text-vectura-muted leading-relaxed mt-2">
            Reset to Defaults restores full algorithm defaults, including transform values (seed, position, scale, rotation).
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Canvas</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div>Shift + Drag to pan</div>
            <div>Mouse wheel to zoom</div>
            <div>Petal Designer: middle-click drag pans and wheel zooms both visible petals equally.</div>
            <div>Touch: one-finger tool input, two-finger pan/pinch zoom.</div>
            <div>On tablets, use Shift/Alt/Meta/Pan touch modifier buttons near the toolbar.</div>
            <div>On phones, use the top File/View/Help menu bar plus pane toggles or edge tabs to open Generator/Layers, and use the floating Model toggle to expand/collapse the formula panel.</div>
            <div>Drag selection box to multi-select</div>
            <div>Drag to move selection; handles resize; top-right handle rotates (Shift snaps)</div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Layers &amp; Groups</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div>Click to select, Shift-click for ranges, Cmd/Ctrl-click to toggle.</div>
            <div>Drag the grip to reorder; groups can be collapsed with the caret.</div>
            <div>Mirror Modifiers behave like group containers: drag layers onto them to indent the children, drag them back out to unparent, and deleting the modifier preserves the children by dissolving only the wrapper.</div>
            <div>Selecting a child inside a Mirror Modifier edits that child normally; selecting the modifier row switches back to mirror controls.</div>
            <div>When a Mirror Modifier is selected, drag the guide line to move it, drag the outer rotate handles to rotate it, and click the centered triangle to flip the reflection side.</div>
            <div>Use the Mask button on a silhouette-capable parent layer to clip every indented descendant beneath it, Illustrator-style.</div>
            <div>Masking is managed from the Layers panel; enable it on the parent, then drag child layers onto that row to bring them inside the masked subtree.</div>
            <div>Mask parents inside Mirror Modifiers mirror as closed silhouettes too, so a circular mask plus its child artwork can resolve as two mirrored masked circles instead of one clipped circle and one missing copy.</div>
            <div>Mask parents can optionally hide their own artwork while still clipping descendants, which is useful for invisible circular or custom-shape masks.</div>
            <div>Rectangle, Oval, and Polygon tools create editable expanded layers that work with transforms, masking, scissor cuts, and export; fresh rectangles/polygons stay straight-edged on creation, and rotated primitive handles stay aligned to the transformed shape.</div>
            <div>Expand a layer into sublayers for line-by-line control.</div>
            <div>Selection outline visibility, color, and thickness can be adjusted in Document Setup.</div>
          </div>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Pens &amp; Export</div>
          <div class="text-xs text-vectura-muted leading-relaxed space-y-1">
            <div>Assign pens per layer or selection by dragging a pen onto layers.</div>
            <div>Double-click a pen icon to apply that pen to the selected layers instantly.</div>
            <div>Touch fallback: tap a pen icon to arm it, then tap layers/groups to apply.</div>
            <div>The Pens panel can be collapsed from its section header; use the palette dropdown to recolor pens, then add/remove/reorder pens as needed.</div>
            <div>Auto-Colorization includes None mode, one-shot Apply, and Continuous Apply Changes.</div>
            <div>If Continuous Apply Changes is off, mode/parameter/palette updates are staged until you press Apply (including repeatedly applying different modes in sequence).</div>
            <div>Plotter Optimization in the Export SVG modal removes fully overlapping paths per pen with an adjustable tolerance.</div>
            <div>Toggle Export Optimized to include optimization passes in the exported SVG.</div>
            <div>Enable Crop Exports to Margin for hard geometry clipping at the configured margin.</div>
            <div>Enable Remove Hidden Geometry to destructively trim masked or frame-hidden geometry so the SVG matches the current view exactly.</div>
            <div>SVG export preserves pen groupings for plotter workflows.</div>
          </div>
        </div>
      `;
      return focusShortcuts ? `${shortcuts}${guidance}` : `${guidance}${shortcuts}`;
    }

    openHelp(focusShortcuts = false) {
      const body = this.buildHelpContent(focusShortcuts);
      const title = focusShortcuts ? 'Keyboard Shortcuts' : 'Help Guide';
      this.openModal({ title, body });
    }

    getDefaultTransformForType(type, currentParams = {}) {
      const base = ALGO_DEFAULTS[type] || {};
      const fallbackSeed = Number.isFinite(currentParams.seed) ? currentParams.seed : 1;
      return {
        seed: Number.isFinite(base.seed) ? base.seed : fallbackSeed,
        posX: Number.isFinite(base.posX) ? base.posX : 0,
        posY: Number.isFinite(base.posY) ? base.posY : 0,
        scaleX: Number.isFinite(base.scaleX) ? base.scaleX : 1,
        scaleY: Number.isFinite(base.scaleY) ? base.scaleY : 1,
        rotation: Number.isFinite(base.rotation) ? base.rotation : 0,
      };
    }

    storeLayerParams(layer) {
      if (!layer) return;
      if (!layer.paramStates) layer.paramStates = {};
      const next = { ...layer.params };
      TRANSFORM_KEYS.forEach((key) => delete next[key]);
      layer.paramStates[layer.type] = clone(next);
    }

    restoreLayerParams(layer, nextType) {
      if (!layer) return;
      const base = ALGO_DEFAULTS[nextType] ? clone(ALGO_DEFAULTS[nextType]) : {};
      const stored = layer.paramStates?.[nextType] ? clone(layer.paramStates[nextType]) : null;
      const transform = this.getDefaultTransformForType(nextType, layer.params);
      layer.type = nextType;
      layer.params = { ...base, ...(stored || {}), ...transform };
      this.storeLayerParams(layer);
    }


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
        this.app.engine.generate(layer.id);
      }
    }

    buildMirrorModifierControls(layer, container) {
      const modifier = this.getModifierState(layer);
      if (!modifier) return;
      const mirrors = Array.isArray(modifier.mirrors) ? modifier.mirrors : [];
      const stack = document.createElement('div');
      stack.className = 'mb-4';
      const stackMultiplier = mirrors.reduce((acc, m) => {
        if (!m.enabled) return acc;
        if (m.type === 'radial') {
          const n = Math.max(2, Math.round(m.count ?? 6));
          return acc * (m.mode === 'dihedral' ? 2 * n : n);
        }
        return acc * 2;
      }, 1);
      const multiplierWarning = stackMultiplier > 16
        ? `<span class="text-[9px] border border-vectura-danger/40 text-vectura-danger px-1.5 py-0.5 ml-1">~${stackMultiplier}× paths</span>`
        : '';
      stack.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="text-[10px] uppercase tracking-widest text-vectura-muted">Mirror Stack${multiplierWarning}</div>
            <div class="text-xs text-vectura-muted mt-1">Top-to-bottom reflection axes for child layers.</div>
          </div>
          <div class="flex items-center gap-2 flex-wrap justify-end">
            <select class="mirror-add-type text-[10px] bg-vectura-bg border border-vectura-border px-1 py-1 text-vectura-muted focus:outline-none">
              <option value="line">+ Line</option>
              <option value="radial">+ Radial</option>
              <option value="arc">+ Arc</option>
            </select>
            <button type="button" class="mirror-stack-add text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">Add</button>
            <button type="button" class="mirror-stack-eye text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">${modifier.guidesVisible === false ? 'Show All' : 'Hide All'}</button>
            <button type="button" class="mirror-stack-lock text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">${modifier.guidesLocked ? 'Unlock All' : 'Lock All'}</button>
            <button type="button" class="mirror-stack-clear text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-danger/10 text-vectura-danger transition-colors" ${mirrors.length ? '' : 'disabled'}>Clear</button>
          </div>
        </div>
      `;
      const list = document.createElement('div');

      const commit = (fn) => {
        fn();
        if (this.app.pushHistory) this.app.pushHistory();
        this.refreshModifierLayer(layer);
      };

      const buildField = (label, input, infoKey = null) => {
        const wrap = document.createElement('label');
        wrap.className = 'block mb-3';
        const title = document.createElement('div');
        title.className = 'text-[10px] text-vectura-muted mb-1 flex items-center gap-1';
        title.innerHTML = `<span>${label}</span>${infoKey ? `<button type="button" class="info-btn" data-info="${infoKey}">i</button>` : ''}`;
        wrap.appendChild(title);
        wrap.appendChild(input);
        return wrap;
      };

      const bindMirrorReorderGrip = (grip, card, mirror) => {
        if (!grip) return;
        grip.onmousedown = (e) => {
          e.preventDefault();
          const dragEl = card;
          dragEl.classList.add('dragging');
          const indicator = document.createElement('div');
          indicator.className = 'noise-drop-indicator';
          list.insertBefore(indicator, dragEl.nextSibling);
          const currentOrder = mirrors.map((entry) => entry.id);
          const startIndex = currentOrder.indexOf(mirror.id);

          const onMove = (ev) => {
            const y = ev.clientY;
            const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
            let inserted = false;
            for (const item of items) {
              const rect = item.getBoundingClientRect();
              if (y < rect.top + rect.height / 2) {
                list.insertBefore(indicator, item);
                inserted = true;
                break;
              }
            }
            if (!inserted) list.appendChild(indicator);
          };

          const onUp = () => {
            dragEl.classList.remove('dragging');
            const siblings = Array.from(list.children);
            const indicatorIndex = siblings.indexOf(indicator);
            const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
            const newIndex = before.length;
            indicator.remove();
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (newIndex === startIndex) return;
            commit(() => {
              const nextOrder = currentOrder.filter((id) => id !== mirror.id);
              nextOrder.splice(newIndex, 0, mirror.id);
              const map = new Map(mirrors.map((entry) => [entry.id, entry]));
              modifier.mirrors = nextOrder.map((id) => map.get(id)).filter(Boolean);
            });
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        };
      };

      const gripMarkup = `
        <button class="noise-grip" type="button" aria-label="Reorder mirror">
          <span class="dot"></span><span class="dot"></span>
          <span class="dot"></span><span class="dot"></span>
          <span class="dot"></span><span class="dot"></span>
        </button>
      `;

      mirrors.forEach((mirror, idx) => {
        if (!mirror.id) mirror.id = `mirror-${idx + 1}`;
        if (!mirror.color) mirror.color = createMirrorLine(idx).color;
        const card = document.createElement('div');
        card.className = `noise-card${mirror.enabled === false ? ' noise-disabled' : ''}`;
        card.dataset.mirrorId = mirror.id;
        card.innerHTML = `
          <div class="noise-header">
            <div class="flex items-center gap-2">
              ${gripMarkup}
              <span class="inline-block w-3 h-3 rounded-full border border-vectura-border" style="background:${mirror.color}"></span>
              <span class="noise-title">Mirror ${String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div class="noise-actions">
              <button type="button" class="mirror-eye text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">${mirror.guideVisible === false ? 'Show' : 'Hide'}</button>
              <button type="button" class="mirror-lock text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">${mirror.locked ? 'Unlock' : 'Lock'}</button>
              <button type="button" class="noise-delete" aria-label="Delete mirror">🗑</button>
            </div>
          </div>
        `;
        const header = card.querySelector('.noise-header');
        const controls = document.createElement('div');
        controls.className = 'pendulum-controls';
        const grip = header.querySelector('.noise-grip');
        bindMirrorReorderGrip(grip, card, mirror);

        const typeSelect = document.createElement('select');
        typeSelect.className =
          'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
        typeSelect.innerHTML = `
          <option value="line">Line</option>
          <option value="radial">Radial</option>
          <option value="arc">Arc</option>
        `;
        typeSelect.value = mirror.type || 'line';
        typeSelect.onchange = (e) => commit(() => {
          mirror.type = e.target.value;
          if (mirror.type === 'radial' && mirror.count === undefined) {
            mirror.count = 6;
            mirror.mode = 'dihedral';
            mirror.centerX = 0;
            mirror.centerY = 0;
            mirror.angle = 0;
          } else if (mirror.type === 'arc' && mirror.radius === undefined) {
            mirror.centerX = 0;
            mirror.centerY = 0;
            mirror.radius = 80;
            mirror.arcStart = -180;
            mirror.arcEnd = 180;
            mirror.replacedSide = 'outer';
            mirror.strength = 100;
            mirror.falloff = 0;
          }
        });
        controls.appendChild(buildField('Type', typeSelect, 'mirror.type'));

        const inputClass = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
        const buildNumberInput = (label, key, step = '1', defaultVal = 0, infoKey = null) => {
          const input = document.createElement('input');
          input.type = 'number';
          input.step = step;
          input.value = `${mirror[key] ?? defaultVal}`;
          input.className = inputClass;
          input.onchange = (e) => commit(() => {
            const next = parseFloat(e.target.value);
            mirror[key] = Number.isFinite(next) ? next : defaultVal;
          });
          controls.appendChild(buildField(label, input, infoKey));
        };
        const buildSelectInput = (label, key, options, defaultVal, infoKey = null) => {
          const sel = document.createElement('select');
          sel.className = inputClass;
          sel.innerHTML = options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
          sel.value = mirror[key] ?? defaultVal;
          sel.onchange = (e) => commit(() => { mirror[key] = e.target.value; });
          controls.appendChild(buildField(label, sel, infoKey));
        };
        const buildCheckboxInput = (label, key, defaultVal = false, infoKey = null) => {
          const wrap = document.createElement('label');
          wrap.className = 'block mb-3 flex items-center gap-2 cursor-pointer';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !!(mirror[key] ?? defaultVal);
          cb.onchange = (e) => commit(() => { mirror[key] = e.target.checked; });
          const title = document.createElement('span');
          title.className = 'text-[10px] text-vectura-muted flex items-center gap-1';
          title.innerHTML = `<span>${label}</span>${infoKey ? `<button type="button" class="info-btn" data-info="${infoKey}">i</button>` : ''}`;
          wrap.appendChild(cb);
          wrap.appendChild(title);
          controls.appendChild(wrap);
        };

        const mirrorType = mirror.type || 'line';
        if (mirrorType === 'line') {
          buildNumberInput('Angle', 'angle', '1');
          buildNumberInput('X Shift', 'xShift', '0.1');
          buildNumberInput('Y Shift', 'yShift', '0.1');
        } else if (mirrorType === 'radial') {
          buildSelectInput('Mode', 'mode', [
            ['dihedral', 'Dihedral (kaleidoscope)'],
            ['rotation', 'Rotation only'],
            ['edge', 'Edge reflections'],
          ], 'dihedral');
          buildNumberInput('Count (N)', 'count', '1', 6);
          buildNumberInput('Center X', 'centerX', '0.1');
          buildNumberInput('Center Y', 'centerY', '0.1');
          buildNumberInput('Start Angle', 'angle', '1');
        } else if (mirrorType === 'arc') {
          buildSelectInput('Replaced Side', 'replacedSide', [
            ['outer', 'Outer → inner'],
            ['inner', 'Inner → outer'],
          ], 'outer', 'mirror.replacedSide');
          buildNumberInput('Center X', 'centerX', '0.1', 0);
          buildNumberInput('Center Y', 'centerY', '0.1', 0);
          buildNumberInput('Radius', 'radius', '1', 80, 'mirror.radius');
          buildNumberInput('Arc Start (°)', 'arcStart', '1', -180, 'mirror.arcStart');
          buildNumberInput('Arc End (°)', 'arcEnd', '1', 180, 'mirror.arcEnd');
          buildCheckboxInput('Clip to Arc Span', 'clipToArc', false, 'mirror.clipToArc');
          buildNumberInput('Strength (%)', 'strength', '1', 100, 'mirror.strength');
          buildNumberInput('Falloff (%)', 'falloff', '1', 0, 'mirror.falloff');
          buildNumberInput('Rotation Offset (°)', 'rotationOffset', '1', 0, 'mirror.rotationOffset');
          buildNumberInput('Copies', 'copies', '1', 1, 'mirror.copies');
        }

        const eyeBtn = header.querySelector('.mirror-eye');
        const lockBtn = header.querySelector('.mirror-lock');
        const deleteBtn = header.querySelector('.noise-delete');
        eyeBtn.onclick = () => commit(() => {
          mirror.guideVisible = mirror.guideVisible === false;
        });
        lockBtn.onclick = () => commit(() => {
          mirror.locked = !mirror.locked;
        });
        deleteBtn.onclick = () => commit(() => {
          modifier.mirrors = mirrors.filter((entry) => entry.id !== mirror.id);
        });

        card.appendChild(controls);
        list.appendChild(card);
      });

      if (!mirrors.length) {
        const empty = document.createElement('div');
        empty.className = 'text-xs text-vectura-muted border border-dashed border-vectura-border p-3';
        empty.textContent = 'No mirrors in this stack.';
        list.appendChild(empty);
      }

      stack.querySelector('.mirror-stack-add')?.addEventListener('click', () => {
        const typeEl = stack.querySelector('.mirror-add-type');
        const addType = typeEl ? typeEl.value : 'line';
        commit(() => {
          const idx = mirrors.length;
          const newMirror = addType === 'radial' ? createRadialMirror(idx)
            : addType === 'arc' ? createArcMirror(idx)
            : createMirrorLine(idx);
          modifier.mirrors = [...mirrors, newMirror];
        });
      });
      stack.querySelector('.mirror-stack-eye')?.addEventListener('click', () =>
        commit(() => {
          modifier.guidesVisible = modifier.guidesVisible === false;
        })
      );
      stack.querySelector('.mirror-stack-lock')?.addEventListener('click', () =>
        commit(() => {
          modifier.guidesLocked = !modifier.guidesLocked;
        })
      );
      stack.querySelector('.mirror-stack-clear')?.addEventListener('click', () =>
        commit(() => {
          modifier.mirrors = [];
        })
      );

      stack.appendChild(list);
      container.appendChild(stack);
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

    getModifierLayerChildren(layer) {
      if (!layer) return [];
      return this.app.engine.layers.filter((entry) => entry.parentId === layer.id);
    }

    refreshModifierLayer(layer, options = {}) {
      const { rebuildControls = true } = options;
      if (!layer) return;
      this.app.computeDisplayGeometry();
      this.renderLayers();
      if (rebuildControls) this.buildControls();
      this.updateFormula();
      this.app.render();
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
      this.app.engine.layers = remaining;
      this.normalizeGroupOrder();
      this.app.computeDisplayGeometry();

      if (selectAssigned) {
        const ids = moveIds.slice();
        const nextPrimary = ids.includes(primaryId) ? primaryId : ids[ids.length - 1] || parentId;
        this.app.setSelection(ids.length ? ids : [parentId], nextPrimary);
        this.app.engine.activeLayerId = nextPrimary || parentId;
      }
      if (captureHistory && this.app.pushHistory) this.app.pushHistory();

      return moveIds.map((id) => map.get(id)).filter(Boolean);
    }

    assignLayersToGroup(groupId, targetLayers, options = {}) {
      return this.assignLayersToParent(groupId, targetLayers, options);
    }

    assignLayersToRoot(targetLayers, options = {}) {
      const layers = (targetLayers || []).filter((layer) => layer);
      if (!layers.length) return [];
      const { nextEngineOrder = null, selectAssigned = false, primaryId = null, captureHistory = false } = options;
      const moveIds = layers.map((layer) => layer.id);
      const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
      moveIds.forEach((id) => {
        const layer = map.get(id);
        if (layer) layer.parentId = null;
      });
      if (Array.isArray(nextEngineOrder) && nextEngineOrder.length) {
        this.app.engine.layers = nextEngineOrder.map((id) => map.get(id)).filter(Boolean);
      }
      this.normalizeGroupOrder();
      this.app.computeDisplayGeometry();

      if (selectAssigned) {
        const ids = moveIds.slice();
        const nextPrimary = ids.includes(primaryId) ? primaryId : ids[ids.length - 1] || null;
        this.app.setSelection(ids, nextPrimary);
        this.app.engine.activeLayerId = nextPrimary;
      }
      if (captureHistory && this.app.pushHistory) this.app.pushHistory();

      return moveIds.map((id) => map.get(id)).filter(Boolean);
    }

    insertMirrorModifier() {
      const selectedLayers = this.app.getSelectedLayers().filter((layer) => layer && !layer.isGroup);
      const id = this.app.addModifierLayer('mirror');
      if (selectedLayers.length) {
        this.assignLayersToParent(id, selectedLayers);
      }
      this.app.setSelection([id], id);
      this.app.engine.activeLayerId = id;
      if (this.app.pushHistory) this.app.pushHistory();
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.app.render();
    }

    updatePrimaryPanelMode(layer) {
      const primaryTitle = getEl('left-section-primary-title', { silent: true });
      const secondaryTitle = getEl('left-section-secondary-title', { silent: true });
      const moduleLabel = getEl('primary-module-label', { silent: true });
      const transformSection = getEl('algorithm-transform-section', { silent: true });
      const modifierMode = this.isModifierLayer(layer);
      if (primaryTitle) primaryTitle.textContent = modifierMode ? 'Modifier' : 'Algorithm';
      if (secondaryTitle) secondaryTitle.textContent = modifierMode ? 'Modifier Configuration' : 'Algorithm Configuration';
      if (moduleLabel) moduleLabel.textContent = modifierMode ? 'Modifier' : 'Algorithm';
      if (transformSection) transformSection.style.display = modifierMode ? 'none' : '';
    }

    syncPrimaryModuleDropdown(layer) {
      const select = getEl('generator-module', { silent: true });
      if (!select || !layer) return;
      if (this.isModifierLayer(layer)) {
        const modifier = this.getModifierState(layer);
        const type = modifier?.type || 'mirror';
        select.innerHTML = '';
        Object.keys(MODIFIER_DEFAULTS || { mirror: { label: 'Mirror' } }).forEach((key) => {
          const def = MODIFIER_DEFAULTS[key] || {};
          const opt = document.createElement('option');
          opt.value = key;
          opt.innerText = def.label || key.charAt(0).toUpperCase() + key.slice(1);
          select.appendChild(opt);
        });
        select.value = type;
        select.disabled = false;
        select.classList.remove('opacity-60');
        return;
      }
      this.initModuleDropdown();
      this.rememberDrawableLayerType(layer);
      select.value = layer.type;
    }

    getPenById(id) {
      return (SETTINGS.pens || []).find((pen) => pen.id === id) || null;
    }

    setArmedPen(penId) {
      this.armedPenId = penId || null;
      this.refreshArmedPenUI();
    }

    clearArmedPen() {
      this.setArmedPen(null);
    }

    refreshArmedPenUI() {
      const container = getEl('pen-list');
      if (!container) return;
      container.querySelectorAll('.pen-item').forEach((item) => {
        item.classList.toggle('dragging', item.dataset.penId === this.armedPenId);
      });
    }

    applyArmedPenToLayers(targetLayers) {
      if (!this.armedPenId) return false;
      const pen = this.getPenById(this.armedPenId);
      if (!pen) return false;
      const layers = Array.isArray(targetLayers) ? targetLayers.filter(Boolean) : [];
      if (!layers.length) return false;
      if (this.app.pushHistory) this.app.pushHistory();
      layers.forEach((layer) => {
        layer.penId = pen.id;
        layer.color = pen.color;
        layer.strokeWidth = pen.width;
        if (!layer.lineCap) layer.lineCap = 'round';
      });
      this.clearArmedPen();
      this.renderLayers();
      this.app.render();
      return true;
    }

    getGroupForLayer(layer) {
      if (!layer || !layer.parentId) return null;
      const group = this.getLayerById(layer.parentId);
      return group && group.isGroup ? group : null;
    }

    isModifierType(type) {
      return Boolean(type && Object.prototype.hasOwnProperty.call(MODIFIER_DEFAULTS || {}, type));
    }

    isDrawableLayerType(type) {
      if (!type || type === 'group' || this.isModifierType(type)) return false;
      return Boolean((Algorithms && Algorithms[type]) || (ALGO_DEFAULTS && ALGO_DEFAULTS[type]));
    }

    rememberDrawableLayerType(typeOrLayer) {
      const type = typeof typeOrLayer === 'string' ? typeOrLayer : typeOrLayer?.type;
      if (!this.isDrawableLayerType(type)) return this.lastDrawableLayerType || null;
      this.lastDrawableLayerType = type;
      return type;
    }

    getPreferredNewLayerType() {
      const active = this.app.engine.getActiveLayer?.();
      if (active && !active.isGroup) {
        const activeType = this.rememberDrawableLayerType(active);
        if (activeType) return activeType;
      }
      const rememberedType = this.rememberDrawableLayerType(this.lastDrawableLayerType);
      if (rememberedType) return rememberedType;
      const moduleSelect = getEl('generator-module', { silent: true });
      if (moduleSelect && this.isDrawableLayerType(moduleSelect.value)) {
        return this.rememberDrawableLayerType(moduleSelect.value);
      }
      const fallbackLayer =
        (this.app.engine.layers || []).find((layer) => layer && !layer.isGroup && this.isDrawableLayerType(layer.type)) || null;
      return this.rememberDrawableLayerType(fallbackLayer?.type || 'wavetable') || 'wavetable';
    }

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

    groupSelection() {
      const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []).filter((id) => {
        const layer = this.getLayerById(id);
        return layer && !layer.isGroup;
      });
      if (selectedIds.length < 2) return;
      if (!Layer) return;
      const layers = this.app.engine.layers;
      const selectedSet = new Set(selectedIds);
      const selectedLayers = layers.filter((layer) => selectedSet.has(layer.id));
      const maxIndex = Math.max(...selectedLayers.map((layer) => layers.indexOf(layer)));
      SETTINGS.globalLayerCount++;
      const groupName = `Group ${String(SETTINGS.globalLayerCount).padStart(2, '0')}`;
      const groupId = Math.random().toString(36).substr(2, 9);
      const group = new Layer(groupId, 'group', groupName);
      group.isGroup = true;
      group.groupType = 'group';
      group.groupCollapsed = false;
      group.visible = false;
      const primary = selectedLayers[0];
      if (primary) {
        group.penId = primary.penId;
        group.color = primary.color;
        group.strokeWidth = primary.strokeWidth;
        group.lineCap = primary.lineCap;
      }

      const oldParents = new Set();
      selectedLayers.forEach((layer) => {
        if (layer.parentId) oldParents.add(layer.parentId);
        layer.parentId = groupId;
        if (group.penId) {
          layer.penId = group.penId;
          layer.color = group.color;
          layer.strokeWidth = group.strokeWidth;
          layer.lineCap = group.lineCap;
        }
      });

      layers.splice(maxIndex + 1, 0, group);

      oldParents.forEach((parentId) => {
        const stillHas = layers.some((layer) => layer.parentId === parentId);
        if (!stillHas) {
          const idx = layers.findIndex((layer) => layer.id === parentId);
          if (idx >= 0) layers.splice(idx, 1);
        }
      });

      this.normalizeGroupOrder();
      if (this.app.pushHistory) this.app.pushHistory();
      this.renderLayers();
      this.app.render();
    }

    ungroupSelection() {
      const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []);
      if (!selectedIds.length) return;
      const layers = this.app.engine.layers;
      const groupIds = new Set();
      selectedIds.forEach((id) => {
        const layer = this.getLayerById(id);
        if (layer?.parentId) groupIds.add(layer.parentId);
      });
      if (!groupIds.size) return;
      groupIds.forEach((groupId) => {
        layers.forEach((layer) => {
          if (layer.parentId === groupId) {
            layer.parentId = null;
          }
        });
        const idx = layers.findIndex((layer) => layer.id === groupId);
        if (idx >= 0) layers.splice(idx, 1);
      });
      if (this.app.pushHistory) this.app.pushHistory();
      this.renderLayers();
      this.app.render();
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

    refreshMaskingViews(options = {}) {
      const { preserveOpen = true } = options;
      if (!preserveOpen) this.openMaskLayerId = null;
      this.app.computeDisplayGeometry();
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.app.render();
      this.app.updateStats();
    }

    ensureLayerMaskState(layer) {
      if (!layer.mask) {
        layer.mask = {
          enabled: false,
          sourceIds: [],
          mode: 'parent',
          hideLayer: false,
          invert: false,
          materialized: false,
        };
      }
      layer.mask.sourceIds = [];
      layer.mask.mode = 'parent';
      if (layer.mask.hideLayer === undefined) layer.mask.hideLayer = false;
      layer.mask.invert = false;
      return layer.mask;
    }

    setLayerMaskEnabled(layer, enabled, options = {}) {
      if (!layer) return;
      const { captureHistory = false } = options;
      const mask = this.ensureLayerMaskState(layer);
      mask.enabled = Boolean(enabled) && Boolean(layer.maskCapabilities?.canSource);
      if (captureHistory && this.app.pushHistory) this.app.pushHistory();
      this.refreshMaskingViews();
    }

    setLayerMaskHidden(layer, hidden, options = {}) {
      if (!layer) return;
      const { captureHistory = false } = options;
      const mask = this.ensureLayerMaskState(layer);
      mask.hideLayer = Boolean(hidden);
      if (captureHistory && this.app.pushHistory) this.app.pushHistory();
      this.refreshMaskingViews();
    }

    buildMaskEditor(layer, options = {}) {
      const { compact = false } = options;
      const wrapper = document.createElement('div');
      wrapper.className = compact ? 'layer-mask-editor layer-mask-editor--compact' : 'layer-mask-editor';
      wrapper.addEventListener('click', (e) => e.stopPropagation());
      const mask = this.ensureLayerMaskState(layer);
      const descendants = this.getLayerDescendants(layer.id);
      const canMask = Boolean(layer.maskCapabilities?.canSource);
      const enableId = `layer-mask-enable-${layer.id}`;
      const hideId = `layer-mask-hide-${layer.id}`;

      const header = document.createElement('div');
      header.className = 'layer-mask-editor__header';
      header.innerHTML = `
        <div class="layer-mask-editor__header-copy">
          <span class="layer-mask-editor__title">Mask Parent</span>
          <span class="layer-mask-editor__subtitle">Mask all indented descendants to this layer's visible silhouette.</span>
        </div>
        <label class="layer-mask-editor__toggle" for="${enableId}">
          <input id="${enableId}" name="${enableId}" type="checkbox" ${mask.enabled ? 'checked' : ''} ${canMask ? '' : 'disabled'}>
          <span>Enable</span>
        </label>
      `;
      const enableInput = header.querySelector('input[type="checkbox"]');
      if (enableInput) {
        enableInput.onchange = (e) => {
          this.setLayerMaskEnabled(layer, e.target.checked, { captureHistory: true });
        };
      }
      wrapper.appendChild(header);

      const optionsRow = document.createElement('div');
      optionsRow.className = 'layer-mask-editor__list';
      optionsRow.innerHTML = `
        <label class="layer-mask-editor__toggle" for="${hideId}">
          <input id="${hideId}" name="${hideId}" type="checkbox" ${mask.hideLayer ? 'checked' : ''} ${canMask ? '' : 'disabled'}>
          <span>Hide Mask Layer</span>
        </label>
      `;
      const hideInput = optionsRow.querySelector('input[type="checkbox"]');
      if (hideInput) {
        hideInput.onchange = (e) => {
          this.setLayerMaskHidden(layer, e.target.checked, { captureHistory: true });
        };
      }
      wrapper.appendChild(optionsRow);

      const list = document.createElement('div');
      list.className = 'layer-mask-editor__list';
      const message = document.createElement('div');
      message.className = 'layer-mask-editor__empty';
      if (!canMask) {
        message.textContent = layer.maskCapabilities?.reason || 'This layer does not currently expose a usable silhouette.';
      } else if (!descendants.length) {
        message.textContent = 'Drag layers onto this row to indent them beneath the mask parent. All descendants will be clipped recursively.';
      } else if (mask.hideLayer) {
        message.textContent = `${descendants.length} descendant${descendants.length === 1 ? '' : 's'} will be clipped recursively while the mask parent artwork itself stays hidden.`;
      } else {
        message.textContent = `${descendants.length} descendant${descendants.length === 1 ? '' : 's'} will be clipped while this mask parent is enabled.`;
      }
      list.appendChild(message);
      wrapper.appendChild(list);

      return wrapper;
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

    showDuplicateNameError(name) {
      this.openModal({
        title: 'Name Unavailable',
        body: `<p class="modal-text">"${name}" is already in use. Layer names must be unique.</p>`,
      });
    }

    showValueError(value) {
      this.openModal({
        title: 'Invalid Value',
        body: `<p class="modal-text">"${value}" is outside the allowed range or format.</p>`,
      });
    }

    showInfo(key) {
      const info = INFO[key];
      if (!info) return;
      const illustration = info.hidePreview ? '' : buildPreviewPair(key, this);
      const bodyContent = info.body
        ? typeof info.body === 'function'
          ? info.body(this)
          : info.body
        : `<p class="modal-text">${info.description}</p>`;
      const body = `
        ${bodyContent}
        ${illustration}
      `;
      this.openModal({ title: info.title, body });
    }

    attachInfoButton(labelEl, key) {
      if (!labelEl || labelEl.querySelector('.info-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-btn';
      btn.dataset.info = key;
      btn.setAttribute('aria-label', `Info about ${labelEl.textContent}`);
      btn.textContent = 'i';
      labelEl.appendChild(btn);
    }

    attachStaticInfoButtons() {
      const entries = [
        { inputId: 'generator-module', infoKey: 'global.algorithm' },
        { inputId: 'inp-seed', infoKey: 'global.seed' },
        { inputId: 'inp-pos-x', infoKey: 'global.posX' },
        { inputId: 'inp-pos-y', infoKey: 'global.posY' },
        { inputId: 'inp-scale-x', infoKey: 'global.scaleX' },
        { inputId: 'inp-scale-y', infoKey: 'global.scaleY' },
        { inputId: 'inp-rotation', infoKey: 'global.rotation' },
        { inputId: 'machine-profile', infoKey: 'global.paperSize' },
        { inputId: 'set-margin', infoKey: 'global.margin' },
        { inputId: 'set-truncate', infoKey: 'global.truncate' },
        { inputId: 'set-crop-exports', infoKey: 'global.cropExports' },
        { inputId: 'set-outside-opacity', infoKey: 'global.outsideOpacity' },
        { inputId: 'set-margin-line', infoKey: 'global.marginLineVisible' },
        { inputId: 'set-margin-line-weight', infoKey: 'global.marginLineWeight' },
        { inputId: 'set-margin-line-color-pill', infoKey: 'global.marginLineColor' },
        { inputId: 'set-margin-line-dotting', infoKey: 'global.marginLineDotting' },
        { inputId: 'set-selection-outline', infoKey: 'global.selectionOutline' },
        { inputId: 'set-selection-outline-color-pill', infoKey: 'global.selectionOutlineColor' },
        { inputId: 'set-selection-outline-width', infoKey: 'global.selectionOutlineWidth' },
        { inputId: 'set-cookie-preferences', infoKey: 'global.cookiePreferences' },
        { inputId: 'set-speed-down', infoKey: 'global.speedDown' },
        { inputId: 'set-speed-up', infoKey: 'global.speedUp' },
      ];

      entries.forEach(({ inputId, infoKey }) => {
        const input = getEl(inputId);
        if (!input) return;
        const label =
          input.parentElement?.querySelector('label') ||
          input.parentElement?.parentElement?.querySelector('label') ||
          input.closest('.control-group')?.querySelector('.control-label');
        this.attachInfoButton(label, infoKey);
      });
    }

    bindInfoButtons() {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.info-btn');
        if (!btn) return;
        const key = btn.dataset.info;
        if (key === 'global.algorithm') {
          e.preventDefault();
          this.setAboutVisible(!(SETTINGS.aboutVisible !== false));
          return;
        }
        this.showInfo(key);
      });
    }

    initModuleDropdown() {
      const select = getEl('generator-module');
      if (!select) return;
      select.innerHTML = '';
      const keys = Object.keys(ALGO_DEFAULTS || {}).filter((key) => !(ALGO_DEFAULTS[key] && ALGO_DEFAULTS[key].hidden));
      keys.sort((a, b) => {
        const aLabel = ALGO_DEFAULTS[a]?.label || a;
        const bLabel = ALGO_DEFAULTS[b]?.label || b;
        return aLabel.localeCompare(bLabel);
      });
      keys.forEach((key) => {
        const def = ALGO_DEFAULTS[key];
        const opt = document.createElement('option');
        opt.value = key;
        const label = def?.label;
        opt.innerText = label || key.charAt(0).toUpperCase() + key.slice(1);
        select.appendChild(opt);
      });
    }

    initMachineDropdown() {
      const select = getEl('machine-profile');
      if (!select || !MACHINES) return;
      select.innerHTML = '';
      Object.entries(MACHINES).forEach(([key, profile]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = profile.name;
        select.appendChild(opt);
      });
      select.value = SETTINGS.paperSize && MACHINES[SETTINGS.paperSize] ? SETTINGS.paperSize : Object.keys(MACHINES)[0] || '';
    }

    getPaletteList() {
      return Array.isArray(PALETTES) ? PALETTES : window.Vectura?.PALETTES || [];
    }

    getActivePalette() {
      const palettes = this.getPaletteList();
      if (!palettes.length) return null;
      const target = palettes.find((palette) => palette.id === SETTINGS.paletteId);
      return target || palettes[0];
    }

    applyPaletteToPens(palette, options = {}) {
      if (!palette || !palette.colors || !palette.colors.length) return;
      const pens = SETTINGS.pens || [];
      const autoColorization = this.getAutoColorizationConfig();
      const applyToLayers = options.applyToLayers !== undefined ? Boolean(options.applyToLayers) : Boolean(autoColorization.enabled);
      pens.forEach((pen, index) => {
        pen.color = palette.colors[index % palette.colors.length];
      });
      if (applyToLayers) {
        this.app.engine.layers.forEach((layer) => {
          const pen = pens.find((p) => p.id === layer.penId);
          if (pen) layer.color = pen.color;
        });
        this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
      }
      if (!options.skipRender) {
        this.renderPens();
        this.renderLayers();
        this.app.render();
      }
    }

    addPen() {
      if (this.app.pushHistory) this.app.pushHistory();
      const pens = SETTINGS.pens || [];
      const palette = this.getActivePalette();
      const colors = palette?.colors || [];
      const color = colors.length ? colors[pens.length % colors.length] : getThemeToken('--color-accent', '#ffffff');
      const nextIndex = pens.length + 1;
      const pen = {
        id: `pen-${Math.random().toString(36).slice(2, 9)}`,
        name: `Pen ${nextIndex}`,
        color,
        width: SETTINGS.strokeWidth ?? 0.3,
      };
      pens.push(pen);
      this.renderPens();
      this.renderLayers();
    }

    removePen(penId) {
      const pens = SETTINGS.pens || [];
      if (pens.length <= 1) {
        this.openModal({
          title: 'Cannot Remove Pen',
          body: '<p class="modal-text">At least one pen must remain in the list.</p>',
        });
        return;
      }
      const idx = pens.findIndex((pen) => pen.id === penId);
      if (idx === -1) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const fallback = pens[idx - 1] || pens[idx + 1];
      pens.splice(idx, 1);
      this.app.engine.layers.forEach((layer) => {
        if (layer.penId === penId && fallback) {
          layer.penId = fallback.id;
          layer.color = fallback.color;
          layer.strokeWidth = fallback.width;
        }
      });
      if (this.armedPenId === penId) this.clearArmedPen();
      this.renderPens();
      this.renderLayers();
      this.app.render();
    }

    initPensSection() {
      const section = getEl('pens-global-section');
      const header = getEl('pens-section-header');
      const body = getEl('pens-section-body');
      if (!section || !header || !body) return;

      const setCollapsed = (next) => {
        SETTINGS.pensCollapsed = Boolean(next);
        section.classList.toggle('collapsed', Boolean(next));
        body.style.display = next ? 'none' : '';
        if (header) header.setAttribute('aria-expanded', next ? 'false' : 'true');
      };

      setCollapsed(SETTINGS.pensCollapsed === true);
      header.onclick = () => setCollapsed(!section.classList.contains('collapsed'));
    }

    initPaletteControls() {
      const toggle = getEl('palette-toggle');
      const menu = getEl('palette-menu');
      const options = getEl('palette-options');
      const search = getEl('palette-search');
      const addBtn = getEl('btn-add-pen');
      const palettes = this.getPaletteList();
      if (!toggle || !menu || !options || !search || !palettes.length) {
        if (addBtn) addBtn.onclick = () => this.addPen();
        return;
      }

      const setActiveLabel = () => {
        const active = this.getActivePalette();
        if (active) {
          SETTINGS.paletteId = active.id;
          toggle.textContent = active.name;
        }
      };

      const renderOptions = (filter = '') => {
        const term = filter.trim().toLowerCase();
        options.innerHTML = '';
        const list = palettes.filter((palette) => palette.name.toLowerCase().includes(term));
        list.forEach((palette) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'palette-option';
          btn.dataset.paletteId = palette.id;
          if (palette.id === SETTINGS.paletteId) btn.classList.add('active');
          btn.innerHTML = `
            <span class="palette-name">${palette.name}</span>
            <span class="palette-swatch">
              ${(palette.colors || [])
                .slice(0, 5)
                .map((color) => `<span style="background:${color}"></span>`)
                .join('')}
            </span>
          `;
          btn.onclick = (e) => {
            e.stopPropagation();
            SETTINGS.paletteId = palette.id;
            setActiveLabel();
            this.applyPaletteToPens(palette);
            menu.classList.add('hidden');
            this.openPaletteMenu = null;
          };
          options.appendChild(btn);
        });
      };

      setActiveLabel();
      renderOptions();

      toggle.onclick = (e) => {
        e.stopPropagation();
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
          if (this.openPenMenu) {
            this.openPenMenu.classList.add('hidden');
            this.openPenMenu = null;
          }
          if (this.openPaletteMenu && this.openPaletteMenu !== menu) {
            this.openPaletteMenu.classList.add('hidden');
          }
          renderOptions(search.value);
          menu.classList.remove('hidden');
          this.openPaletteMenu = menu;
          search.focus();
          search.select();
        } else {
          menu.classList.add('hidden');
          this.openPaletteMenu = null;
        }
      };

      menu.addEventListener('click', (e) => e.stopPropagation());
      search.oninput = () => renderOptions(search.value);

      if (addBtn) {
        addBtn.onclick = () => this.addPen();
      }
    }


    initSettingsValues() {
      this.refreshThemeUi();
      const documentUnits = getEl('set-document-units', { silent: true });
      const margin = getEl('set-margin');
      const speedDown = getEl('set-speed-down');
      const speedUp = getEl('set-speed-up');
      const stroke = getEl('set-stroke', { silent: true });
      const precision = getEl('set-precision', { silent: true });
      const plotterOptEnabled = getEl('set-plotter-opt-enabled', { silent: true });
      const plotterOpt = getEl('set-plotter-opt', { silent: true });
      const plotterOptValue = getEl('set-plotter-opt-value', { silent: true });
      const undoSteps = getEl('set-undo');
      const truncate = getEl('set-truncate');
      const cropExports = getEl('set-crop-exports');
      const outsideOpacity = getEl('set-outside-opacity');
      const marginLine = getEl('set-margin-line');
      const marginLineColorPill = getEl('set-margin-line-color-pill');
      const marginLineWeight = getEl('set-margin-line-weight');
      const marginLineWeightSlider = getEl('set-margin-line-weight-slider');
      const marginLineColor = getEl('set-margin-line-color');
      const marginLineDotting = getEl('set-margin-line-dotting');
      const marginLineStyleReset = getEl('set-margin-line-style-reset');
      const showGuides = getEl('set-show-guides');
      const snapGuides = getEl('set-snap-guides');
      const showDocumentDimensions = getEl('set-show-document-dimensions', { silent: true });
      const selectionOutline = getEl('set-selection-outline');
      const selectionOutlineColorPill = getEl('set-selection-outline-color-pill');
      const selectionOutlineWidthSlider = getEl('set-selection-outline-width-slider');
      const selectionOutlineWidth = getEl('set-selection-outline-width');
      const selectionOutlineStyleReset = getEl('set-selection-outline-style-reset');
      const cookiePreferences = getEl('set-cookie-preferences');
      const paperWidth = getEl('set-paper-width');
      const paperHeight = getEl('set-paper-height');
      const orientationToggle = getEl('set-orientation');
      const orientationLabel = getEl('orientation-label');
      const customFields = getEl('custom-size-fields');
      const bgColor = getEl('inp-bg-color');
      if (documentUnits) documentUnits.value = this.getDocumentUnits();
      if (speedDown) speedDown.value = SETTINGS.speedDown;
      if (speedUp) speedUp.value = SETTINGS.speedUp;
      if (stroke) stroke.value = SETTINGS.strokeWidth;
      if (precision) precision.value = SETTINGS.precision;
      const plotterOptimizeRaw = Number.isFinite(SETTINGS.plotterOptimize) ? SETTINGS.plotterOptimize : 0;
      const plotterOptimizeEnabled = plotterOptimizeRaw > 0;
      const plotterOptimizeTolerance = Math.max(0.01, Math.min(1, plotterOptimizeRaw || 0.1));
      if (plotterOptEnabled) plotterOptEnabled.checked = plotterOptimizeEnabled;
      if (plotterOpt) {
        plotterOpt.value = plotterOptimizeTolerance;
        plotterOpt.disabled = !plotterOptimizeEnabled;
      }
      if (plotterOptValue) {
        plotterOptValue.value = plotterOptimizeTolerance.toFixed(2);
        plotterOptValue.disabled = !plotterOptimizeEnabled;
      }
      if (undoSteps) undoSteps.value = SETTINGS.undoSteps;
      if (truncate) truncate.checked = SETTINGS.truncate !== false;
      if (cropExports) cropExports.checked = SETTINGS.cropExports !== false;
      if (outsideOpacity) outsideOpacity.value = SETTINGS.outsideOpacity ?? 0.5;
      if (marginLine) marginLine.checked = Boolean(SETTINGS.marginLineVisible);
      if (marginLineColorPill) {
        const color = SETTINGS.marginLineColor ?? '#52525b';
        marginLineColorPill.textContent = color.toUpperCase();
        marginLineColorPill.style.background = color;
      }
      if (marginLineColor) marginLineColor.value = SETTINGS.marginLineColor ?? '#52525b';
      if (marginLineDotting) marginLineDotting.value = SETTINGS.marginLineDotting ?? 0;
      if (marginLineStyleReset) marginLineStyleReset.disabled = false;
      if (showGuides) showGuides.checked = SETTINGS.showGuides !== false;
      if (snapGuides) snapGuides.checked = SETTINGS.snapGuides !== false;
      if (showDocumentDimensions) showDocumentDimensions.checked = SETTINGS.showDocumentDimensions === true;
      const viewGridCheckmark = getEl('view-grid-checkmark');
      if (viewGridCheckmark) viewGridCheckmark.style.visibility = SETTINGS.gridOverlay ? 'visible' : 'hidden';

      const gridOverlayMaster = getEl('set-grid-overlay-master');
      if (gridOverlayMaster) gridOverlayMaster.checked = SETTINGS.gridOverlay === true;
      const gridOpacitySlider = getEl('set-grid-opacity-slider');
      if (gridOpacitySlider) gridOpacitySlider.value = SETTINGS.gridOpacity ?? 0.2;
      const gridOpacity = getEl('set-grid-opacity');
      if (gridOpacity) gridOpacity.value = SETTINGS.gridOpacity ?? 0.2;
      const gridStyle = getEl('set-grid-style');
      if (gridStyle) gridStyle.value = SETTINGS.gridStyle ?? 'cartesian';
      const gridColor = getEl('set-grid-color');
      if (gridColor) gridColor.value = SETTINGS.gridColor ?? '#ffffff';
      const gridColorPill = getEl('set-grid-color-pill');
      if (gridColorPill) {
        const color = SETTINGS.gridColor ?? '#ffffff';
        gridColorPill.textContent = color.toUpperCase();
        gridColorPill.style.background = color;
        gridColorPill.style.color = getContrastTextColor(color);
      }
      const gridSize = getEl('set-grid-size');
      if (gridSize) gridSize.value = SETTINGS.gridSize ?? 10;
      
      if (selectionOutline) selectionOutline.checked = SETTINGS.selectionOutline !== false;
      if (selectionOutlineColorPill) {
        const color = SETTINGS.selectionOutlineColor || '#ef4444';
        selectionOutlineColorPill.textContent = color.toUpperCase();
        selectionOutlineColorPill.style.background = color;
      }
      if (selectionOutlineStyleReset) selectionOutlineStyleReset.disabled = false;
      if (cookiePreferences) cookiePreferences.checked = SETTINGS.cookiePreferencesEnabled === true;
      if (bgColor) bgColor.value = SETTINGS.bgColor;
      if (orientationToggle) orientationToggle.checked = (SETTINGS.paperOrientation || 'landscape') === 'landscape';
      if (orientationLabel) {
        orientationLabel.textContent =
          (SETTINGS.paperOrientation || 'landscape') === 'landscape' ? 'Landscape' : 'Portrait';
      }
      if (customFields) {
        customFields.classList.toggle('hidden', SETTINGS.paperSize !== 'custom');
      }
      this.refreshDocumentUnitsUi();
    }

    initPaneToggles() {
      const leftPane = getEl('left-pane');
      const rightPane = getEl('right-pane');
      const bottomPane = getEl('bottom-pane');
      const leftBtn = getEl('btn-pane-toggle-left');
      const rightBtn = getEl('btn-pane-toggle-right');
      const mobileLeftBtn = getEl('btn-mobile-pane-left');
      const mobileRightBtn = getEl('btn-mobile-pane-right');
      if (!leftPane || !rightPane || !leftBtn || !rightBtn) return;

      const isMobileViewport = () => window.innerWidth < 900;

      const isCollapsed = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed') && !pane.classList.contains('pane-force-open');
        return auto || pane.classList.contains('pane-collapsed');
      };

      const modBar = getEl('touch-modifier-bar');
      const modBarOriginParent = modBar?.parentNode || null;
      const modBarOriginNext = modBar?.nextSibling || null;
      let mobileLayoutDefaultApplied = false;

      const applyMobileBottomPaneLayout = (isMobileLayout) => {
        if (!bottomPane) return;
        if (isMobileLayout) {
          if (modBar && modBar.parentNode !== bottomPane) {
            bottomPane.insertBefore(modBar, bottomPane.firstChild);
          }
          if (modBar) modBar.classList.remove('hidden');
        } else {
          if (modBar && modBarOriginParent && modBar.parentNode !== modBarOriginParent) {
            modBarOriginParent.insertBefore(modBar, modBarOriginNext);
          }
          if (modBar && typeof this.isTouchCapable === 'function') {
            modBar.classList.toggle('hidden', !this.isTouchCapable());
          }
        }
      };

      const applyAutoCollapse = () => {
        const viewportWidth = window.innerWidth;
        const shouldAuto = viewportWidth < 640;
        const isMobileLayout = viewportWidth < 900;
        document.body.classList.toggle('auto-collapsed', shouldAuto);
        document.body.classList.toggle('mobile-layout', isMobileLayout);
        applyMobileBottomPaneLayout(isMobileLayout);
        if (bottomPane && isMobileLayout && !mobileLayoutDefaultApplied) {
          bottomPane.classList.add('bottom-pane-collapsed');
          mobileLayoutDefaultApplied = true;
        }
        if (bottomPane && !isMobileLayout) {
          bottomPane.classList.remove('bottom-pane-collapsed');
          mobileLayoutDefaultApplied = false;
        }
      };

      const togglePane = (pane) => {
        const auto = document.body.classList.contains('auto-collapsed');
        const willOpen = auto ? !pane.classList.contains('pane-force-open') : pane.classList.contains('pane-collapsed');
        if (willOpen && isMobileViewport()) {
          const sibling = pane === leftPane ? rightPane : leftPane;
          sibling.classList.remove('pane-force-open');
          sibling.classList.add('pane-collapsed');
        }
        if (auto) {
          pane.classList.remove('pane-collapsed');
          pane.classList.toggle('pane-force-open');
        } else {
          pane.classList.toggle('pane-collapsed');
        }
      };

      leftBtn.addEventListener('click', () => togglePane(leftPane));
      rightBtn.addEventListener('click', () => togglePane(rightPane));
      if (mobileLeftBtn) mobileLeftBtn.addEventListener('click', () => togglePane(leftPane));
      if (mobileRightBtn) mobileRightBtn.addEventListener('click', () => togglePane(rightPane));
      window.addEventListener('resize', applyAutoCollapse);
      applyAutoCollapse();

      this.expandPanes = () => {
        leftPane.classList.remove('pane-collapsed', 'pane-force-open');
        rightPane.classList.remove('pane-collapsed', 'pane-force-open');
        document.body.classList.remove('auto-collapsed', 'mobile-layout');
        document.documentElement.style.setProperty('--pane-left-width', '519px');
        document.documentElement.style.setProperty('--pane-right-width', '336px');
        document.documentElement.style.setProperty('--bottom-pane-height', '180px');
        if (bottomPane) bottomPane.classList.remove('bottom-pane-collapsed');
      };
    }

    initBottomPaneToggle() {
      const bottomPane = getEl('bottom-pane');
      const btn = getEl('btn-pane-toggle-bottom');
      const mobileBtn = getEl('btn-mobile-pane-bottom');
      if (!bottomPane || !btn) return;
      const toggleBottomPane = () => {
        bottomPane.classList.toggle('bottom-pane-collapsed');
      };
      btn.addEventListener('click', toggleBottomPane);
      if (mobileBtn) mobileBtn.addEventListener('click', toggleBottomPane);
    }

    initBottomPaneResizer() {
      const resizer = getEl('bottom-resizer');
      const bottomPane = getEl('bottom-pane');
      if (!resizer || !bottomPane) return;
      const minHeight = 80;
      const maxHeight = 360;

      const startDrag = (e) => {
        e.preventDefault();
        resizer.classList.add('active');
        bottomPane.classList.remove('bottom-pane-collapsed');
        const startY = e.clientY;
        const startHeight = bottomPane.getBoundingClientRect().height;

        const onMove = (ev) => {
          const dy = ev.clientY - startY;
          const next = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
          document.documentElement.style.setProperty('--bottom-pane-height', `${next}px`);
        };
        const onUp = () => {
          resizer.classList.remove('active');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };

      resizer.addEventListener('mousedown', startDrag);
    }

    initPaneResizers() {
      const leftPane = getEl('left-pane');
      const rightPane = getEl('right-pane');
      const leftResizer = getEl('left-resizer');
      const rightResizer = getEl('right-resizer');
      if (!leftPane || !rightPane || !leftResizer || !rightResizer) return;

      const minLeft = 200;
      const maxLeft = 520;
      const minRight = 200;
      const maxRight = 520;

      const startDrag = (e, side) => {
        e.preventDefault();
        const startX = e.clientX;
        const startLeft = leftPane.getBoundingClientRect().width;
        const startRight = rightPane.getBoundingClientRect().width;
        const resizer = side === 'left' ? leftResizer : rightResizer;
        resizer.classList.add('active');
        document.body.classList.remove('auto-collapsed');
        leftPane.classList.remove('pane-collapsed');
        rightPane.classList.remove('pane-collapsed');

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          if (side === 'left') {
            const next = Math.max(minLeft, Math.min(maxLeft, startLeft + dx));
            document.documentElement.style.setProperty('--pane-left-width', `${next}px`);
          } else {
            const next = Math.max(minRight, Math.min(maxRight, startRight - dx));
            document.documentElement.style.setProperty('--pane-right-width', `${next}px`);
          }
        };

        const onUp = () => {
          resizer.classList.remove('active');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };

      leftResizer.addEventListener('mousedown', (e) => startDrag(e, 'left'));
      rightResizer.addEventListener('mousedown', (e) => startDrag(e, 'right'));
    }

    updateLightSourceTool() {
      const btn = getEl('btn-light-source');
      if (!btn) return;
      const activeLayer = this.app?.engine?.getActiveLayer?.();
      const show = isPetalisLayerType(activeLayer?.type);
      btn.classList.toggle('hidden', !show);
    }

    initToolBar() {
      const toolbar = getEl('tool-bar');
      if (!toolbar) return;
      toolbar.innerHTML = this.createMainToolbarMarkup();
      const toolButtons = Array.from(toolbar.querySelectorAll('.tool-btn[data-tool]'));
      const scissorButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-scissor]'));
      const selectButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-select]'));
      const penButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-pen]'));
      const fillButtons = Array.from(toolbar.querySelectorAll('.tool-sub-btn[data-fill]'));
      const scissorButton = toolbar.querySelector('.tool-btn[data-tool="scissor"]');
      const scissorMenu = toolbar.querySelector('.tool-submenu[aria-label="Scissor subtools"]');
      const selectButton = toolbar.querySelector('.tool-btn[data-tool="select"]');
      const selectMenu = toolbar.querySelector('.tool-submenu[data-menu="select"]');
      const penButton = toolbar.querySelector('.tool-btn[data-tool="pen"]');
      const penMenu = toolbar.querySelector('.tool-submenu[data-menu="pen"]');
      const fillButton = toolbar.querySelector('.tool-btn[data-tool="fill"]');
      const fillMenu = toolbar.querySelector('.tool-submenu[aria-label="Fill subtools"]');
      const lightSourceBtn = getEl('btn-light-source');
      const selectionModes = selectButtons.map((btn) => btn.dataset.select).filter(Boolean);
      const scissorModes = scissorButtons.map((btn) => btn.dataset.scissor).filter(Boolean);
      const penModes = penButtons.map((btn) => btn.dataset.pen).filter(Boolean);

      const updateToolIcon = (tool, mode) => {
        const button = toolbar.querySelector(`.tool-btn[data-tool="${tool}"]`);
        const icon = button?.querySelector('.tool-icon');
        let sourceBtn = null;
        if (tool === 'select') {
          sourceBtn = selectButtons.find((btn) => btn.dataset.select === mode);
        } else if (tool === 'scissor') {
          sourceBtn = scissorButtons.find((btn) => btn.dataset.scissor === mode);
        } else if (tool === 'pen') {
          sourceBtn = penButtons.find((btn) => btn.dataset.pen === mode);
        }
        const sourceSvg = sourceBtn?.querySelector('svg');
        if (!icon || !sourceSvg) return;
        icon.innerHTML = sourceSvg.innerHTML;
        icon.setAttribute('viewBox', sourceSvg.getAttribute('viewBox') || '0 0 24 24');
      };

      const syncButtons = () => {
        const fillActive = this.activeTool === 'fill' || this.activeTool === 'fill-erase';
        toolButtons.forEach((btn) => {
          if (btn.dataset.tool === 'fill') {
            btn.classList.toggle('active', fillActive);
            btn.setAttribute('aria-pressed', fillActive ? 'true' : 'false');
          } else {
            btn.classList.toggle('active', btn.dataset.tool === this.activeTool);
            btn.setAttribute('aria-pressed', btn.dataset.tool === this.activeTool ? 'true' : 'false');
          }
        });
        scissorButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.scissor === this.scissorMode);
        });
        selectButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.select === this.selectionMode);
        });
        penButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.pen === this.penMode);
        });
        fillButtons.forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.fill === 'erase' && this.activeTool === 'fill-erase');
        });
      };

      this.setActiveTool = (tool, options = {}) => {
        if (!tool) return;
        const { temporary = false } = options;
        this.activeTool = tool;
        if (!temporary) {
          SETTINGS.activeTool = tool;
          this.previousTool = tool;
        }
        if (this.app.renderer?.setTool) this.app.renderer.setTool(tool);
        syncButtons();
      };

      this.setScissorMode = (mode) => {
        if (!mode) return;
        this.scissorMode = mode;
        SETTINGS.scissorMode = mode;
        if (this.app.renderer?.setScissorMode) this.app.renderer.setScissorMode(mode);
        updateToolIcon('scissor', this.scissorMode);
        syncButtons();
      };

      this.setSelectionMode = (mode) => {
        if (!mode) return;
        this.selectionMode = mode;
        SETTINGS.selectionMode = mode;
        if (this.app.renderer?.setSelectionMode) this.app.renderer.setSelectionMode(mode);
        updateToolIcon('select', this.selectionMode);
        syncButtons();
      };

      this.setPenMode = (mode) => {
        if (!mode) return;
        this.penMode = mode;
        SETTINGS.penMode = mode;
        if (this.app.renderer?.setPenMode) this.app.renderer.setPenMode(mode);
        updateToolIcon('pen', this.penMode);
        syncButtons();
      };

      const cycleMode = (current, modes) => {
        if (!modes.length) return current;
        const idx = modes.indexOf(current);
        const nextIndex = idx === -1 ? 0 : (idx + 1) % modes.length;
        return modes[nextIndex];
      };

      this.cycleToolSubmode = (tool) => {
        if (tool === 'select') {
          const next = cycleMode(this.selectionMode, selectionModes);
          this.setSelectionMode(next);
          this.setActiveTool('select');
          return;
        }
        if (tool === 'scissor') {
          const next = cycleMode(this.scissorMode, scissorModes);
          this.setScissorMode(next);
          this.setActiveTool('scissor');
          return;
        }
        if (tool === 'pen') {
          const next = cycleMode(this.penMode, penModes);
          this.setPenMode(next);
          this.setActiveTool('pen');
        }
      };

      toolButtons.forEach((btn) => {
        if (btn.dataset.tool === 'scissor') return;
        btn.onclick = () => {
          const tool = btn.dataset.tool;
          this.setActiveTool(tool);
        };
      });
      scissorButtons.forEach((btn) => {
        btn.onclick = () => {
          const mode = btn.dataset.scissor;
          this.setActiveTool('scissor');
          this.setScissorMode(mode);
        };
      });
      selectButtons.forEach((btn) => {
        btn.onclick = () => {
          const mode = btn.dataset.select;
          this.setActiveTool('select');
          this.setSelectionMode(mode);
        };
      });
      penButtons.forEach((btn) => {
        btn.onclick = () => {
          const mode = btn.dataset.pen;
          this.setActiveTool('pen');
          this.setPenMode(mode);
        };
      });

      const initSubtoolMenu = (config) => {
        const { button, menu, buttons, onActivate, onSelect } = config;
        if (!button || !menu) return;
        let holdTimer = null;
        let menuOpen = false;
        let hoverBtn = null;

        const setHover = (btn) => {
          if (hoverBtn === btn) return;
          hoverBtn = btn || null;
          buttons.forEach((sub) => sub.classList.toggle('hover', sub === hoverBtn));
        };
        const openMenu = (e) => {
          menuOpen = true;
          menu.classList.add('open');
          setHover(null);
          if (e) {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
            setHover(btn);
          }
        };
        const closeMenu = () => {
          menuOpen = false;
          menu.classList.remove('open');
          setHover(null);
        };

        button.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (holdTimer) window.clearTimeout(holdTimer);
          holdTimer = window.setTimeout(() => {
            holdTimer = null;
            openMenu(e);
          }, 280);
        });

        document.addEventListener('pointermove', (e) => {
          if (!menuOpen) return;
          const target = document.elementFromPoint(e.clientX, e.clientY);
          const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
          setHover(btn);
        });

        document.addEventListener('pointerup', (e) => {
          if (holdTimer) {
            window.clearTimeout(holdTimer);
            holdTimer = null;
            if (onActivate) onActivate();
            return;
          }
          if (!menuOpen) return;
          const target = document.elementFromPoint(e.clientX, e.clientY);
          const btn = target && target.closest ? target.closest('.tool-sub-btn') : null;
          if (btn && onSelect) onSelect(btn);
          closeMenu();
        });

        document.addEventListener('pointerdown', (e) => {
          if (!menuOpen) return;
          if (menu.contains(e.target) || button.contains(e.target)) return;
          closeMenu();
        });
      };

      initSubtoolMenu({
        button: scissorButton,
        menu: scissorMenu,
        buttons: scissorButtons,
        onActivate: () => this.setActiveTool('scissor'),
        onSelect: (btn) => {
          const mode = btn.dataset.scissor;
          this.setActiveTool('scissor');
          this.setScissorMode(mode);
        },
      });

      initSubtoolMenu({
        button: penButton,
        menu: penMenu,
        buttons: penButtons,
        onActivate: () => this.setActiveTool('pen'),
        onSelect: (btn) => {
          const mode = btn.dataset.pen;
          this.setActiveTool('pen');
          this.setPenMode(mode);
        },
      });

      initSubtoolMenu({
        button: selectButton,
        menu: selectMenu,
        buttons: selectButtons,
        onActivate: () => this.setActiveTool('select'),
        onSelect: (btn) => {
          const mode = btn.dataset.select;
          this.setActiveTool('select');
          this.setSelectionMode(mode);
        },
      });

      initSubtoolMenu({
        button: fillButton,
        menu: fillMenu,
        buttons: fillButtons,
        onActivate: () => this.setActiveTool('fill'),
        onSelect: (btn) => {
          if (btn.dataset.fill === 'erase') this.setActiveTool('fill-erase');
        },
      });

      if (lightSourceBtn) {
        lightSourceBtn.onclick = () => this.startLightSourcePlacement();
      }

      this.setActiveTool(this.activeTool);
      this.setScissorMode(this.scissorMode);
      this.setSelectionMode(this.selectionMode);
      this.setPenMode(this.penMode);
      syncButtons();

      if (this.app.renderer) {
        this.app.renderer.onPenComplete = (payload) => this.createManualLayerFromPath(payload);
        this.app.renderer.onShapeComplete = (payload) => this.createManualLayerFromPath(payload);
        this.app.renderer.onScissor = (payload) => this.applyScissor(payload);
        this.app.renderer.onDirectEditStart = () => {
          if (this.app.pushHistory) this.app.pushHistory();
        };
        this.app.renderer.onDirectEditCommit = () => {
          this.renderLayers();
          this.buildControls();
          this.updateFormula();
          this.app.render();
        };
      }
    }

    bindGlobal() {
      const addLayer = getEl('btn-add-layer');
      const insertMirrorModifier = getEl('btn-insert-mirror-modifier');
      const moduleSelect = getEl('generator-module');
      const bgColor = getEl('inp-bg-color');
      const settingsPanel = getEl('settings-panel');
      const btnSettings = getEl('btn-settings');
      const btnCloseSettings = getEl('btn-close-settings');
      const btnHelp = getEl('btn-help');
      const themeToggle = getEl('theme-toggle', { silent: true });
      const machineProfile = getEl('machine-profile');
      const setDocumentUnits = getEl('set-document-units', { silent: true });
      const setMargin = getEl('set-margin');
      const setTruncate = getEl('set-truncate');
      const setCropExports = getEl('set-crop-exports');
      const setOutsideOpacity = getEl('set-outside-opacity');
      const setMarginLine = getEl('set-margin-line');
      const setMarginLineColorPill = getEl('set-margin-line-color-pill');
      const setMarginLineWeight = getEl('set-margin-line-weight');
      const setMarginLineWeightSlider = getEl('set-margin-line-weight-slider');
      const setMarginLineColor = getEl('set-margin-line-color');
      const setMarginLineDotting = getEl('set-margin-line-dotting');
      const setMarginLineStyleReset = getEl('set-margin-line-style-reset');
      const setShowGuides = getEl('set-show-guides');
      const setSnapGuides = getEl('set-snap-guides');
      const setShowDocumentDimensions = getEl('set-show-document-dimensions', { silent: true });
      const setSelectionOutline = getEl('set-selection-outline');
      const setSelectionOutlineColorPill = getEl('set-selection-outline-color-pill');
      const setSelectionOutlineColor = getEl('set-selection-outline-color');
      const setSelectionOutlineWidthSlider = getEl('set-selection-outline-width-slider');
      const setSelectionOutlineWidth = getEl('set-selection-outline-width');
      const setSelectionOutlineStyleReset = getEl('set-selection-outline-style-reset');
      const setCookiePreferences = getEl('set-cookie-preferences');
      const btnClearPreferences = getEl('btn-clear-preferences', { silent: true });
      const setSpeedDown = getEl('set-speed-down');
      const setSpeedUp = getEl('set-speed-up');
      const setStroke = getEl('set-stroke', { silent: true });
      const setPrecision = getEl('set-precision', { silent: true });
      const setPlotterOptEnabled = getEl('set-plotter-opt-enabled', { silent: true });
      const setPlotterOpt = getEl('set-plotter-opt', { silent: true });
      const setPlotterOptValue = getEl('set-plotter-opt-value', { silent: true });
      const setUndo = getEl('set-undo');
      const setPaperWidth = getEl('set-paper-width');
      const setPaperHeight = getEl('set-paper-height');
      const setOrientation = getEl('set-orientation');
      const orientationLabel = getEl('orientation-label');
      const customFields = getEl('custom-size-fields');
      const btnSaveVectura = getEl('btn-save-vectura');
      const btnOpenVectura = getEl('btn-open-vectura');
      const btnImportSvg = getEl('btn-import-svg');
      const fileOpenVectura = getEl('file-open-vectura');
      const fileImportSvg = getEl('file-import-svg');
      const btnExport = getEl('btn-export');
      const btnResetView = getEl('btn-reset-view');
      const btnUndo = getEl('btn-undo', { silent: true });
      const btnRedo = getEl('btn-redo', { silent: true });

      if (addLayer && moduleSelect) {
        addLayer.onclick = () => {
          const activeLayer = this.app.engine.getActiveLayer?.();
          const selectedModifier = this.isModifierLayer(activeLayer) ? activeLayer : null;
          const t = selectedModifier ? this.getPreferredNewLayerType() : this.getPreferredNewLayerType();
          if (this.app.pushHistory) this.app.pushHistory();
          const id = this.app.engine.addLayer(t);
          const createdLayer = this.getLayerById(id);
          this.rememberDrawableLayerType(createdLayer || t);
          if (selectedModifier && createdLayer) {
            this.assignLayersToParent(selectedModifier.id, [createdLayer], {
              selectAssigned: true,
              primaryId: id,
            });
          } else if (this.app.renderer) {
            this.app.renderer.setSelection([id], id);
          }
          this.renderLayers();
          this.app.render();
        };
      }
      if (btnUndo) {
        btnUndo.onclick = () => { if (this.app.undo) this.app.undo(); };
      }
      if (btnRedo) {
        btnRedo.onclick = () => { if (this.app.redo) this.app.redo(); };
      }
      if (insertMirrorModifier) {
        insertMirrorModifier.onclick = () => {
          this.insertMirrorModifier();
        };
      }
      if (setCropExports) {
        setCropExports.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.cropExports = e.target.checked;
          this.app.persistPreferencesDebounced?.();
        };
      }

      if (moduleSelect) {
        moduleSelect.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
            if (this.app.pushHistory) this.app.pushHistory();
            if (this.isModifierLayer(l)) {
              const nextType = e.target.value;
              l.modifier = createModifierState(nextType, {
                mirrors: [createMirrorLine(0)],
              });
              this.buildControls();
              this.refreshModifierLayer(l, { rebuildControls: false });
              return;
            }
            this.storeLayerParams(l);
            const nextType = e.target.value;
            this.rememberDrawableLayerType(nextType);
            this.restoreLayerParams(l, nextType);
            if (l.type !== 'expanded') l.sourcePaths = null;
            if (this.app.renderer?.directSelection?.layerId === l.id) {
              this.app.renderer.clearDirectSelection();
            }
            const label = ALGO_DEFAULTS[l.type]?.label;
            const nextName = label || l.type.charAt(0).toUpperCase() + l.type.slice(1);
            l.name = this.getUniqueLayerName(nextName, l.id);
            this.buildControls();
            this.app.regen();
            this.renderLayers();
          }
        };
      }

      if (bgColor) {
        let armed = false;
        bgColor.onfocus = () => {
          if (!armed && this.app.pushHistory) this.app.pushHistory();
          armed = true;
        };
        bgColor.oninput = (e) => {
          SETTINGS.bgColor = e.target.value;
          this.app.render();
        };
        bgColor.onchange = () => {
          armed = false;
        };
      }

      if (btnSettings && settingsPanel) {
        btnSettings.onclick = () => this.toggleSettingsPanel();
      }
      if (btnCloseSettings && settingsPanel) {
        btnCloseSettings.onclick = () => this.toggleSettingsPanel(false);
      }
      if (btnHelp) {
        btnHelp.onclick = () => this.openHelp(false);
      }
      if (themeToggle) {
        this.refreshThemeUi();
        themeToggle.onclick = () => {
          this.app.toggleTheme?.();
        };
      }

      if (setDocumentUnits) {
        setDocumentUnits.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.documentUnits = normalizeDocumentUnits(e.target.value);
          this.refreshDocumentUnitsUi();
          this.buildControls();
          this.app.render();
        };
      }

      if (machineProfile) {
        machineProfile.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = e.target.value;
          SETTINGS.paperSize = next;
          if (customFields) customFields.classList.toggle('hidden', next !== 'custom');
          if (next !== 'custom' && MACHINES && MACHINES[next]) {
            SETTINGS.paperWidth = MACHINES[next].width;
            SETTINGS.paperHeight = MACHINES[next].height;
            this.refreshDocumentUnitsUi();
          }
          this.app.engine.setProfile(next);
          this.app.renderer.center();
          this.app.regen();
        };
      }
      if (setMargin) {
        setMargin.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, this.parseDocumentNumber(e.target.value, { fallbackMm: SETTINGS.margin }));
          SETTINGS.margin = Number.isFinite(next) ? next : SETTINGS.margin;
          this.refreshDocumentUnitsUi();
          this.app.regen();
        };
      }
      if (setTruncate) {
        setTruncate.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.truncate = e.target.checked;
          this.app.render();
        };
      }
      if (setOutsideOpacity) {
        setOutsideOpacity.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, Math.min(1, parseFloat(e.target.value)));
          SETTINGS.outsideOpacity = Number.isFinite(next) ? next : 0.5;
          e.target.value = SETTINGS.outsideOpacity;
          this.app.render();
        };
      }
      if (setMarginLine) {
        setMarginLine.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.marginLineVisible = e.target.checked;
          this.app.render();
        };
      }
      if (setMarginLineWeight) {
        const applyMarginLineWeight = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0.05, Math.min(2, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.marginLineWeight ?? 0.2 })));
          SETTINGS.marginLineWeight = Number.isFinite(next) ? next : 0.2;
          this.refreshDocumentUnitsUi();
          this.app.render();
        };
        setMarginLineWeight.oninput = (e) => applyMarginLineWeight(e.target.value);
        setMarginLineWeight.onchange = (e) => applyMarginLineWeight(e.target.value, { commit: true });
        if (setMarginLineWeightSlider) {
          setMarginLineWeightSlider.oninput = (e) => applyMarginLineWeight(e.target.value);
          setMarginLineWeightSlider.onchange = (e) => applyMarginLineWeight(e.target.value, { commit: true });
        }
      }
      if (setMarginLineColor && setMarginLineColorPill) {
        setMarginLineColorPill.onclick = () => openColorPickerAnchoredTo(setMarginLineColor, setMarginLineColorPill);
        setMarginLineColor.oninput = (e) => {
          const next = e.target.value || SETTINGS.marginLineColor || '#52525b';
          SETTINGS.marginLineColor = next;
          setMarginLineColorPill.textContent = next.toUpperCase();
          setMarginLineColorPill.style.background = next;
          this.app.render();
        };
        setMarginLineColor.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = e.target.value || SETTINGS.marginLineColor || '#52525b';
          SETTINGS.marginLineColor = next;
          setMarginLineColorPill.textContent = next.toUpperCase();
          setMarginLineColorPill.style.background = next;
          this.app.render();
        };
      }
      if (setMarginLineDotting) {
        setMarginLineDotting.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, parseFloat(e.target.value));
          SETTINGS.marginLineDotting = Number.isFinite(next) ? next : 0;
          e.target.value = SETTINGS.marginLineDotting;
          this.app.render();
        };
      }
      if (setMarginLineStyleReset) {
        setMarginLineStyleReset.onclick = () => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.marginLineColor = '#52525b';
          SETTINGS.marginLineWeight = 0.2;
          SETTINGS.marginLineDotting = 0;
          if (setMarginLineColor) setMarginLineColor.value = '#52525b';
          if (setMarginLineColorPill) {
            setMarginLineColorPill.textContent = '#52525B';
            setMarginLineColorPill.style.background = '#52525b';
          }
          if (setMarginLineDotting) setMarginLineDotting.value = '0';
          this.refreshDocumentUnitsUi();
          this.app.render();
        };
      }
      if (setShowGuides) {
        setShowGuides.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.showGuides = e.target.checked;
          this.app.render();
        };
      }
      if (setSnapGuides) {
        setSnapGuides.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.snapGuides = e.target.checked;
        };
      }
      if (setShowDocumentDimensions) {
        setShowDocumentDimensions.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.showDocumentDimensions = e.target.checked;
          this.app.render();
        };
      }
      const btnViewGridToggle = getEl('btn-view-grid-toggle');
      if (btnViewGridToggle) {
        btnViewGridToggle.onclick = () => {
          SETTINGS.gridOverlay = !SETTINGS.gridOverlay;
          if (this.app.pushHistory) this.app.pushHistory();
          this.initSettingsValues();
          this.app.render();
          const p = getEl('top-menubar').querySelector('[data-top-menu-panel][aria-label="View menu"]');
          if (p) p.classList.remove('open');
        };
      }

      const btnViewGridSettings = getEl('btn-view-grid-settings');
      const gridSettingsPanel = getEl('grid-settings-panel');
      const btnCloseGridSettings = getEl('btn-close-grid-settings');

      if (btnViewGridSettings && gridSettingsPanel) {
        btnViewGridSettings.onclick = () => {
          gridSettingsPanel.classList.add('open');
          const p = getEl('top-menubar').querySelector('[data-top-menu-panel][aria-label="View menu"]');
          if (p) p.classList.remove('open');
        };
      }

      if (btnCloseGridSettings && gridSettingsPanel) {
        btnCloseGridSettings.onclick = () => {
          gridSettingsPanel.classList.remove('open');
        };
      }

      const setGridOverlayMaster = getEl('set-grid-overlay-master');
      if (setGridOverlayMaster) {
        setGridOverlayMaster.onchange = (e) => {
          SETTINGS.gridOverlay = e.target.checked;
          if (this.app.pushHistory) this.app.pushHistory();
          this.initSettingsValues();
          this.app.render();
        };
      }

      const syncGridOpacity = (val, commit) => {
        if (commit && this.app.pushHistory) this.app.pushHistory();
        SETTINGS.gridOpacity = parseFloat(val);
        const gridOpacitySlider = getEl('set-grid-opacity-slider');
        const gridOpacity = getEl('set-grid-opacity');
        if (gridOpacitySlider) gridOpacitySlider.value = SETTINGS.gridOpacity;
        if (gridOpacity) gridOpacity.value = SETTINGS.gridOpacity;
        this.app.render();
      };
      const setGridOpacitySlider = getEl('set-grid-opacity-slider');
      if (setGridOpacitySlider) {
        setGridOpacitySlider.oninput = (e) => syncGridOpacity(e.target.value, false);
        setGridOpacitySlider.onchange = (e) => syncGridOpacity(e.target.value, true);
      }
      const setGridOpacity = getEl('set-grid-opacity');
      if (setGridOpacity) {
        setGridOpacity.oninput = (e) => syncGridOpacity(e.target.value, false);
        setGridOpacity.onchange = (e) => syncGridOpacity(e.target.value, true);
      }

      const setGridStyle = getEl('set-grid-style');
      if (setGridStyle) {
        setGridStyle.onchange = (e) => {
          SETTINGS.gridStyle = e.target.value;
          if (this.app.pushHistory) this.app.pushHistory();
          this.initSettingsValues();
          this.app.render();
        };
      }

      const setGridColor = getEl('set-grid-color');
      const setGridColorPill = getEl('set-grid-color-pill');
      if (setGridColor && setGridColorPill) {
        setGridColorPill.onclick = () => openColorPickerAnchoredTo(setGridColor, setGridColorPill);
        setGridColor.oninput = (e) => {
          SETTINGS.gridColor = e.target.value;
          this.initSettingsValues();
          this.app.render();
        };
        setGridColor.onchange = (e) => {
          SETTINGS.gridColor = e.target.value;
          if (this.app.pushHistory) this.app.pushHistory();
          this.initSettingsValues();
          this.app.render();
        };
      }

      const setGridSize = getEl('set-grid-size');
      if (setGridSize) {
        setGridSize.onchange = (e) => {
          SETTINGS.gridSize = Math.max(0.1, parseFloat(e.target.value) || 10);
          if (this.app.pushHistory) this.app.pushHistory();
          this.initSettingsValues();
          this.app.render();
        };
      }
      if (setSelectionOutline) {
        setSelectionOutline.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.selectionOutline = e.target.checked;
          this.app.render();
        };
      }
      if (setSelectionOutlineColorPill && setSelectionOutlineColor) {
        setSelectionOutlineColorPill.onclick = () =>
          openColorPickerAnchoredTo(setSelectionOutlineColor, setSelectionOutlineColorPill);
        setSelectionOutlineColor.oninput = (e) => {
          const nextColor = e.target.value || SETTINGS.selectionOutlineColor || '#ef4444';
          SETTINGS.selectionOutlineColor = nextColor;
          setSelectionOutlineColorPill.textContent = nextColor.toUpperCase();
          setSelectionOutlineColorPill.style.background = nextColor;
          this.app.render();
        };
        setSelectionOutlineColor.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const nextColor = e.target.value || SETTINGS.selectionOutlineColor || '#ef4444';
          SETTINGS.selectionOutlineColor = nextColor;
          setSelectionOutlineColorPill.textContent = nextColor.toUpperCase();
          setSelectionOutlineColorPill.style.background = nextColor;
          this.app.render();
        };
      }
      const applySelectionOutlineWidth = (raw, options = {}) => {
        const { commit = false } = options;
        if (commit && this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(0.1, Math.min(2, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.selectionOutlineWidth ?? 0.4 })));
        SETTINGS.selectionOutlineWidth = Number.isFinite(next) ? next : 0.4;
        this.refreshDocumentUnitsUi();
        this.app.render();
      };
      if (setSelectionOutlineWidthSlider) {
        setSelectionOutlineWidthSlider.oninput = (e) => applySelectionOutlineWidth(e.target.value);
        setSelectionOutlineWidthSlider.onchange = (e) => applySelectionOutlineWidth(e.target.value, { commit: true });
      }
      if (setSelectionOutlineWidth) {
        setSelectionOutlineWidth.oninput = (e) => applySelectionOutlineWidth(e.target.value);
        setSelectionOutlineWidth.onchange = (e) => applySelectionOutlineWidth(e.target.value, { commit: true });
      }
      if (setSelectionOutlineStyleReset) {
        setSelectionOutlineStyleReset.onclick = () => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.selectionOutlineColor = '#ef4444';
          SETTINGS.selectionOutlineWidth = 0.4;
          if (setSelectionOutlineColorPill) {
            setSelectionOutlineColorPill.textContent = '#EF4444';
            setSelectionOutlineColorPill.style.background = '#ef4444';
          }
          this.refreshDocumentUnitsUi();
          this.app.render();
        };
      }
      if (setCookiePreferences) {
        setCookiePreferences.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.cookiePreferencesEnabled = e.target.checked;
          if (!SETTINGS.cookiePreferencesEnabled) {
            this.app.clearPreferenceCookie?.();
          } else {
            this.app.persistPreferences?.({ force: true });
          }
        };
      }
      if (btnClearPreferences) {
        btnClearPreferences.onclick = () => {
          this.app.clearSavedPreferences?.();
          this.initSettingsValues();
        };
      }
      if (setSpeedDown) {
        setSpeedDown.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.speedDown = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setSpeedUp) {
        setSpeedUp.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.speedUp = parseInt(e.target.value, 10);
          this.app.updateStats();
        };
      }
      if (setStroke) {
        setStroke.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.strokeWidth = parseFloat(e.target.value);
          this.app.engine.layers.forEach((layer) => {
            layer.strokeWidth = SETTINGS.strokeWidth;
          });
          this.app.render();
        };
      }
      if (setPrecision) {
        setPrecision.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 3));
          SETTINGS.precision = next;
          e.target.value = next;
        };
      }
      if (setPaperWidth) {
        setPaperWidth.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(1, this.parseDocumentNumber(e.target.value, { fallbackMm: SETTINGS.paperWidth ?? 210 }));
          if (Number.isFinite(next)) SETTINGS.paperWidth = next;
          this.refreshDocumentUnitsUi();
          if (SETTINGS.paperSize === 'custom') {
            this.app.engine.setProfile('custom');
            this.app.renderer.center();
            this.app.regen();
          }
        };
      }
      if (setPaperHeight) {
        setPaperHeight.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(1, this.parseDocumentNumber(e.target.value, { fallbackMm: SETTINGS.paperHeight ?? 297 }));
          if (Number.isFinite(next)) SETTINGS.paperHeight = next;
          this.refreshDocumentUnitsUi();
          if (SETTINGS.paperSize === 'custom') {
            this.app.engine.setProfile('custom');
            this.app.renderer.center();
            this.app.regen();
          }
        };
      }
      if (setOrientation) {
        setOrientation.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.paperOrientation = e.target.checked ? 'landscape' : 'portrait';
          if (orientationLabel) {
            orientationLabel.textContent = e.target.checked ? 'Landscape' : 'Portrait';
          }
          const key = machineProfile?.value || SETTINGS.paperSize || 'a4';
          this.app.engine.setProfile(key);
          this.app.renderer.center();
          this.app.regen();
        };
      }
      if (setPlotterOpt) {
        const clampPlotterOptValue = (raw) => {
          const next = parseFloat(raw);
          if (!Number.isFinite(next)) return 0.1;
          return Math.max(0.01, Math.min(1, next));
        };
        const applyPlotterOptValue = (raw, options = {}) => {
          const { render = true } = options;
          const enabled = setPlotterOptEnabled ? Boolean(setPlotterOptEnabled.checked) : true;
          const next = clampPlotterOptValue(raw);
          if (setPlotterOpt) setPlotterOpt.value = `${next}`;
          if (setPlotterOptValue) setPlotterOptValue.value = next.toFixed(2);
          SETTINGS.plotterOptimize = enabled ? next : 0;
          if (render) this.app.render();
        };
        const syncPlotterOptEnabledState = (enabled) => {
          if (setPlotterOpt) setPlotterOpt.disabled = !enabled;
          if (setPlotterOptValue) setPlotterOptValue.disabled = !enabled;
        };
        if (setPlotterOptEnabled) {
          setPlotterOptEnabled.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const enabled = Boolean(e.target.checked);
            syncPlotterOptEnabledState(enabled);
            applyPlotterOptValue(setPlotterOptValue?.value || setPlotterOpt?.value || 0.1);
          };
          syncPlotterOptEnabledState(Boolean(setPlotterOptEnabled.checked));
        }
        setPlotterOpt.oninput = (e) => {
          applyPlotterOptValue(e.target.value);
        };
        setPlotterOpt.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          applyPlotterOptValue(e.target.value);
        };
        if (setPlotterOptValue) {
          setPlotterOptValue.oninput = (e) => {
            const next = clampPlotterOptValue(e.target.value);
            if (setPlotterOpt) setPlotterOpt.value = `${next}`;
            e.target.value = next.toFixed(2);
            SETTINGS.plotterOptimize = setPlotterOptEnabled?.checked === false ? 0 : next;
            this.app.render();
          };
          setPlotterOptValue.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            applyPlotterOptValue(e.target.value);
          };
        }
      }
      if (setUndo) {
        setUndo.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 20));
          SETTINGS.undoSteps = next;
          e.target.value = next;
          if (this.app.setUndoLimit) this.app.setUndoLimit(next);
        };
      }

      if (btnExport) {
        btnExport.onclick = () => this.openExportModal();
      }
      if (btnResetView) {
        btnResetView.onclick = () => {
          this.app.renderer.center();
          if (this.expandPanes) this.expandPanes();
          this.app.render();
        };
      }
      if (btnSaveVectura) {
        btnSaveVectura.onclick = () => this.saveVecturaFile();
      }
      if (btnOpenVectura && fileOpenVectura) {
        btnOpenVectura.onclick = () => fileOpenVectura.click();
        fileOpenVectura.onchange = () => {
          const file = fileOpenVectura.files?.[0];
          if (file) this.openVecturaFile(file);
          fileOpenVectura.value = '';
        };
      }
      if (btnImportSvg && fileImportSvg) {
        btnImportSvg.onclick = () => fileImportSvg.click();
        fileImportSvg.onchange = () => {
          const file = fileImportSvg.files?.[0];
          if (file) this.importSvgFile(file);
          fileImportSvg.value = '';
        };
      }

      const bindTrans = (id, key) => {
        const el = getEl(id);
        if (!el) return;
        el.onchange = (e) => {
          const l = this.app.engine.getActiveLayer();
          if (l) {
            if (this.app.pushHistory) this.app.pushHistory();
            l.params[key] = parseFloat(e.target.value);
            this.app.regen();
          }
        };
      };
      bindTrans('inp-seed', 'seed');
      bindTrans('inp-pos-x', 'posX');
      bindTrans('inp-pos-y', 'posY');
      bindTrans('inp-scale-x', 'scaleX');
      bindTrans('inp-scale-y', 'scaleY');
      bindTrans('inp-rotation', 'rotation');

      const randSeed = getEl('btn-rand-seed');
      if (randSeed) {
        randSeed.onclick = () => {
          const l = this.app.engine.getActiveLayer();
          const seedInput = getEl('inp-seed');
          if (l) {
            if (this.app.pushHistory) this.app.pushHistory();
            l.params.seed = Math.floor(Math.random() * 99999);
            if (seedInput) seedInput.value = l.params.seed;
            this.app.regen();
            this.recenterLayerIfNeeded(l);
            this.app.render();
            this.buildControls();
            this.updateFormula();
          }
        };
      }
    }

    triggerTopMenuAction(buttonId) {
      const button = getEl(buttonId);
      if (!button) return false;
      button.click();
      this.setTopMenuOpen(null, false);
      return true;
    }

    handleTopMenuShortcut(e) {
      const primary = e.metaKey || e.ctrlKey;
      const key = (e.key || '').toLowerCase();
      if (primary && !e.shiftKey && !e.altKey && key === 'z') {
        return this.triggerTopMenuAction('btn-undo');
      }
      if (primary && e.shiftKey && !e.altKey && key === 'z') {
        return this.triggerTopMenuAction('btn-redo');
      }
      if (primary && !e.shiftKey && !e.altKey && key === 'y') {
        return this.triggerTopMenuAction('btn-redo');
      }
      if (primary && !e.shiftKey && !e.altKey && key === 'o') {
        return this.triggerTopMenuAction('btn-open-vectura');
      }
      if (primary && !e.shiftKey && !e.altKey && key === 's') {
        return this.triggerTopMenuAction('btn-save-vectura');
      }
      if (primary && e.shiftKey && !e.altKey && key === 'p') {
        return this.triggerTopMenuAction('btn-import-svg');
      }
      if (primary && e.shiftKey && !e.altKey && key === 'e') {
        return this.triggerTopMenuAction('btn-export');
      }
      if (primary && !e.shiftKey && !e.altKey && key === 'k') {
        this.toggleSettingsPanel();
        this.setTopMenuOpen(null, false);
        return true;
      }
      if (primary && !e.shiftKey && !e.altKey && key === '0') {
        return this.triggerTopMenuAction('btn-reset-view');
      }
      if (!primary && !e.shiftKey && !e.altKey && e.key === 'F1') {
        this.openHelp(false);
        this.setTopMenuOpen(null, false);
        return true;
      }
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && key === 'g') {
        return this.triggerTopMenuAction('btn-view-grid-toggle');
      }
      return false;
    }

    bindShortcuts() {
      window.addEventListener('keydown', (e) => {
        const target = e.target;
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable);
        if (isInput) return;
        if (this.handleTopMenuShortcut(e)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (this.petalDesigner) {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.closePetalDesigner();
          }
          return;
        }
        if (this.inlinePetalDesigner?.focused && !e.metaKey && !e.ctrlKey) {
          return;
        }

        if (e.code === 'Space') {
          if (!this.spacePanActive) {
            e.preventDefault();
            this.spacePanActive = true;
            this.spacePanTool = this.activeTool;
            this.setActiveTool?.('hand', { temporary: true });
          }
          return;
        }

        if (e.key === 'Alt' && this.activeTool === 'fill' && !this.fillEraseModifierActive) {
          e.preventDefault();
          this.fillEraseModifierActive = true;
          this.fillEraseRestoreTool = 'fill';
          this.setActiveTool?.('fill-erase', { temporary: true });
          return;
        }

        if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
          e.preventDefault();
          this.openHelp(true);
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          e.stopPropagation();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          if (selectedLayers.length) {
            this.duplicateLayers(selectedLayers);
          } else {
            const active = this.app.engine.getActiveLayer?.();
            if (active) this.duplicateLayers([active]);
          }
          return;
        }

        if (!e.metaKey && !e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          if (selectedLayers.length) {
            this.duplicateLayers(selectedLayers);
          } else {
            const active = this.app.engine.getActiveLayer?.();
            if (active) this.duplicateLayers([active]);
          }
          return;
        }

        if (!e.metaKey && !e.ctrlKey) {
          const key = e.key.toLowerCase();
          if (key === 'v') {
            e.preventDefault();
            if (this.activeTool === 'select') {
              this.cycleToolSubmode?.('select');
            } else {
              this.setActiveTool?.('select');
            }
            return;
          }
          if (key === 'a') {
            e.preventDefault();
            this.setActiveTool?.('direct');
            return;
          }
          if (key === 'm') {
            e.preventDefault();
            this.setActiveTool?.('shape-rect');
            return;
          }
          if (key === 'l') {
            e.preventDefault();
            this.setActiveTool?.('shape-oval');
            return;
          }
          if (key === 'y') {
            e.preventDefault();
            this.setActiveTool?.('shape-polygon');
            return;
          }
          if (key === 'f') {
            e.preventDefault();
            if (e.shiftKey) this.setActiveTool?.('fill-erase');
            else this.setActiveTool?.('fill');
            return;
          }
          if (key === 'p') {
            e.preventDefault();
            if (this.activeTool === 'pen') {
              this.cycleToolSubmode?.('pen');
            } else {
              this.setActiveTool?.('pen');
            }
            return;
          }
          if (key === '+' || (key === '=' && e.shiftKey)) {
            e.preventDefault();
            this.setActiveTool?.('pen');
            this.setPenMode?.('add');
            return;
          }
          if (key === '-') {
            e.preventDefault();
            this.setActiveTool?.('pen');
            this.setPenMode?.('delete');
            return;
          }
          if (key === 'c' && e.shiftKey) {
            e.preventDefault();
            this.setActiveTool?.('pen');
            this.setPenMode?.('anchor');
            return;
          }
          if (key === 'c') {
            e.preventDefault();
            if (this.activeTool === 'scissor') {
              this.cycleToolSubmode?.('scissor');
            } else {
              this.setActiveTool?.('scissor');
            }
            return;
          }
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          const all = this.app.engine.layers.filter((layer) => !layer.isGroup).map((layer) => layer.id);
          const primary = all[all.length - 1] || null;
          if (this.app.renderer) this.app.renderer.setSelection(all, primary);
          this.app.engine.activeLayerId = primary;
          this.renderLayers();
          this.buildControls();
          this.updateFormula();
          this.app.render();
          return;
        }

        if (this.activeTool === 'pen') {
          if (this.penMode !== 'draw') {
            if (e.key === 'Escape') {
              e.preventDefault();
              this.setPenMode?.('draw');
              return;
            }
          }
          if (this.penMode === 'draw' && e.key === 'Enter') {
            e.preventDefault();
            this.app.renderer?.commitPenPath?.();
            return;
          }
          if (this.penMode === 'draw' && e.key === 'Escape') {
            e.preventDefault();
            this.app.renderer?.cancelPenPath?.();
            return;
          }
          if (this.penMode === 'draw' && e.key === 'Backspace') {
            e.preventDefault();
            this.app.renderer?.undoPenPoint?.();
            return;
          }
        }

        if (`${this.activeTool}`.startsWith('shape-')) {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.app.renderer?.cancelShapeDraft?.();
            return;
          }
          if (
            this.activeTool === 'shape-polygon' &&
            this.app.renderer?.shapeDraft &&
            (e.key === 'ArrowUp' || e.key === 'ArrowDown')
          ) {
            e.preventDefault();
            this.app.renderer.adjustShapeDraftSides?.(e.key === 'ArrowUp' ? 1 : -1);
            return;
          }
        }

        if (this.activeTool === 'scissor' && e.key === 'Escape') {
          e.preventDefault();
          this.app.renderer?.cancelScissor?.();
          return;
        }

        if (e.metaKey && e.key.toLowerCase() === 'g') {
          e.preventDefault();
          if (e.shiftKey) {
            this.ungroupSelection();
          } else {
            this.groupSelection();
          }
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          const targets = selectedLayers.filter((layer) => layer && !layer.parentId && !layer.isGroup);
          if (!targets.length) return;
          if (this.app.pushHistory) this.app.pushHistory();
          targets.forEach((layer) => this.expandLayer(layer, { skipHistory: true }));
          return;
        }

        if ((e.metaKey || e.ctrlKey) && (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}')) {
          e.preventDefault();
          const isRight = e.key === ']' || e.key === '}';
          const direction = isRight ? 'up' : 'down';
          let changed = false;
          if (e.shiftKey || e.key === '{' || e.key === '}') {
            changed = this.moveSelectedLayers(isRight ? 'top' : 'bottom');
          } else {
            changed = this.moveSelectedLayers(direction);
          }
          if (changed && this.app.pushHistory) this.app.pushHistory();
          return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.app.renderer?.lightSourceSelected) {
            e.preventDefault();
            this.app.renderer.clearLightSource?.();
            return;
          }
        }

        const selected = this.app.renderer?.getSelectedLayer?.();
        if (!selected) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (this.app.pushHistory) this.app.pushHistory();
          const ids = Array.from(this.app.renderer?.selectedLayerIds || []);
          ids.forEach((id) => this.app.engine.removeLayer(id));
          if (this.app.renderer) {
            const nextId = this.app.engine.activeLayerId;
            this.app.renderer.setSelection(nextId ? [nextId] : [], nextId);
          }
          this.renderLayers();
          this.app.render();
          return;
        }
        const step = (e.metaKey || e.ctrlKey) ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (dx || dy) {
          e.preventDefault();
          // If direct-select tool is active with a path selected, nudge anchors
          const renderer = this.app.renderer;
          if (renderer?.activeTool === 'direct' && renderer.directSelection?.anchors?.length) {
            if (this.app.pushHistory) this.app.pushHistory();
            const ds = renderer.directSelection;
            const indicesToMove = ds.selectedIndices?.size
              ? [...ds.selectedIndices]
              : ds.anchors.map((_, i) => i);
            indicesToMove.forEach(i => {
              const a = ds.anchors[i];
              if (!a) return;
              a.x += dx; a.y += dy;
              if (a.in) { a.in.x += dx; a.in.y += dy; }
              if (a.out) { a.out.x += dx; a.out.y += dy; }
            });
            renderer.applyDirectPath();
            renderer.draw();
            return;
          }
          if (this.app.pushHistory) this.app.pushHistory();
          const selectedLayers = this.app.renderer?.getSelectedLayers?.() || [];
          if (selectedLayers.length) {
            selectedLayers.forEach((layer) => {
              layer.params.posX += dx;
              layer.params.posY += dy;
              this.app.engine.generate(layer.id);
            });
            this.app.render();
            const primary = this.app.renderer?.getSelectedLayer?.();
            if (primary) {
              const posX = getEl('inp-pos-x');
              const posY = getEl('inp-pos-y');
              if (posX) posX.value = primary.params.posX;
              if (posY) posY.value = primary.params.posY;
            }
          }
        }
      });

      window.addEventListener('keyup', (e) => {
        const target = e.target;
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable);
        if (isInput) return;
        if (e.code === 'Space' && this.spacePanActive) {
          e.preventDefault();
          this.spacePanActive = false;
          const restore = this.spacePanTool || this.previousTool || 'select';
          this.setActiveTool?.(restore);
          return;
        }
        if (e.key === 'Alt' && this.fillEraseModifierActive) {
          e.preventDefault();
          this.fillEraseModifierActive = false;
          const restore = this.fillEraseRestoreTool || 'fill';
          this.fillEraseRestoreTool = null;
          if (this.activeTool === 'fill-erase') this.setActiveTool?.(restore, { temporary: true });
        }
      });
    }

    renderLayers() {
      const container = getEl('layer-list');
      if (!container) return;
      container.innerHTML = '';
      const layers = this.app.engine.layers.slice().reverse();
      const parentIds = new Set(
        layers
          .filter((layer) => this.canLayerAcceptChildren(layer) || layers.some((entry) => entry.parentId === layer.id))
          .map((layer) => layer.id)
      );
      const childrenMap = new Map();
      const selectableIds = [];
      const gripMarkup = `
        <button class="layer-grip" type="button" aria-label="Reorder layer" title="Reorder layer">
          <span class="dot"></span><span class="dot"></span>
          <span class="dot"></span><span class="dot"></span>
          <span class="dot"></span><span class="dot"></span>
        </button>
      `;

      layers.forEach((layer) => {
        if (layer.parentId && parentIds.has(layer.parentId)) {
          if (!childrenMap.has(layer.parentId)) childrenMap.set(layer.parentId, []);
          childrenMap.get(layer.parentId).push(layer);
        }
      });

      const collectDescendants = (parentId) => {
        const children = childrenMap.get(parentId) || [];
        const ids = [];
        children.forEach((child) => {
          ids.push(child.id);
          if (parentIds.has(child.id)) ids.push(...collectDescendants(child.id));
        });
        return ids;
      };

      const hasSelectedDescendant = (parentId) => {
        const children = childrenMap.get(parentId) || [];
        return children.some((child) => {
          if (this.app.renderer?.selectedLayerIds?.has(child.id)) return true;
          return parentIds.has(child.id) ? hasSelectedDescendant(child.id) : false;
        });
      };

      const bindLayerReorderGrip = (grip, dragEl, options = {}) => {
        const { ensureSelection, getSelectedIds } = options;
        if (!grip || !dragEl) return;
        grip.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (ensureSelection) ensureSelection(e);
          let selectedIds = getSelectedIds ? getSelectedIds() : Array.from(this.app.renderer?.selectedLayerIds || []);
          if (!selectedIds.length) {
            const fallbackId = dragEl.dataset.layerId;
            if (fallbackId) selectedIds = [fallbackId];
          }
          if (!selectedIds.length) return;
          dragEl.classList.add('dragging');
          const indicator = document.createElement('div');
          indicator.className = 'layer-drop-indicator';
          container.insertBefore(indicator, dragEl.nextSibling);
          const currentOrder = this.app.engine.layers.map((layer) => layer.id).reverse();
          const selectedSet = new Set(selectedIds);
          const selectedInUi = currentOrder.filter((id) => selectedSet.has(id));
          if (!selectedInUi.length) return;
          let dropGroupId = null;
          let dropTarget = null;

          const onMove = (ev) => {
            const y = ev.clientY;
            const items = Array.from(container.querySelectorAll('.layer-item')).filter((item) => item !== dragEl);
            let inserted = false;
            for (const item of items) {
              const rect = item.getBoundingClientRect();
              if (y < rect.top + rect.height / 2) {
                container.insertBefore(indicator, item);
                inserted = true;
                break;
              }
            }
            if (!inserted) container.appendChild(indicator);

            const hovered = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.layer-item');
            let nextParent = null;
            if (hovered && hovered.dataset.layerId) {
              const hoveredLayer = this.getLayerById(hovered.dataset.layerId);
              if (hoveredLayer && this.canLayerAcceptChildren(hoveredLayer) && !selectedSet.has(hoveredLayer.id)) {
                nextParent = hoveredLayer.id;
              }
            }
            if (dropTarget && dropTarget !== hovered) {
              dropTarget.classList.remove('group-drop-target');
              dropTarget = null;
            }
            if (nextParent && hovered) {
              dropGroupId = nextParent;
              dropTarget = hovered;
              dropTarget.classList.add('group-drop-target');
            } else {
              dropGroupId = null;
            }
          };

          const onUp = () => {
            dragEl.classList.remove('dragging');
            const siblings = Array.from(container.children);
            const indicatorIndex = siblings.indexOf(indicator);
            const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('layer-item'));
            const newIndex = before.length;
            indicator.remove();
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (dropTarget) {
              dropTarget.classList.remove('group-drop-target');
              dropTarget = null;
            }

            if (dropGroupId) {
              const target = this.getLayerById(dropGroupId);
              if (target && this.canLayerAcceptChildren(target)) {
                const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
                const moveIds = selectedInUi.filter((id) => {
                  if (id === dropGroupId) return false;
                  const layer = map.get(id);
                  if (!layer) return false;
                  if (layer.isGroup && this.isDescendant(dropGroupId, layer.id)) return false;
                  return true;
                });
                const moveLayers = moveIds.map((id) => map.get(id)).filter(Boolean);
                this.assignLayersToParent(dropGroupId, moveLayers, {
                  captureHistory: true,
                  selectAssigned: true,
                  primaryId: this.app.renderer?.selectedLayerId || moveIds[moveIds.length - 1] || dropGroupId,
                });
                this.renderLayers();
                this.app.render();
                return;
              }
            }

            const nextOrder = currentOrder.filter((id) => !selectedSet.has(id));
            nextOrder.splice(newIndex, 0, ...selectedInUi);
            const nextEngineOrder = nextOrder.slice().reverse();
            const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
            const prevId = nextOrder[newIndex - 1] || null;
            const nextId = nextOrder[newIndex + selectedInUi.length] || null;
            const moveToRoot = selectedInUi
              .map((id) => map.get(id))
              .filter((layer) => this.shouldLeaveParentScope(layer, prevId, nextId, selectedSet));
            if (moveToRoot.length) {
              this.assignLayersToRoot(moveToRoot, {
                captureHistory: true,
                nextEngineOrder,
                selectAssigned: true,
                primaryId: this.app.renderer?.selectedLayerId || moveToRoot[moveToRoot.length - 1]?.id || null,
              });
              this.renderLayers();
              this.app.render();
              return;
            }
            const hasOrderChanged = nextEngineOrder.some((id, index) => id !== this.app.engine.layers[index]?.id);
            if (hasOrderChanged && this.app.pushHistory) this.app.pushHistory();
            this.app.engine.layers = nextEngineOrder.map((id) => map.get(id)).filter(Boolean);
            this.normalizeGroupOrder();
            this.renderLayers();
            this.app.render();
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        };
      };

      const buildPenAssignment = (owner, getTargets) => `
        <div class="pen-assign">
          <button class="pen-pill" type="button" aria-label="Assign pen" title="Assign pen">
            <div class="pen-icon"></div>
          </button>
          <div class="pen-menu hidden"></div>
        </div>
      `;

      const wirePenAssignment = (el, owner, getTargets) => {
        const penMenu = el.querySelector('.pen-menu');
        const penPill = el.querySelector('.pen-pill');
        const penIcon = el.querySelector('.pen-icon');
        if (!penMenu || !penPill || !penIcon) return;
        const pens = SETTINGS.pens || [];
        const applyPen = (pen, options = {}) => {
          if (!pen) return;
          const { render = true, syncTargets = true } = options;
          if (syncTargets) {
            const targets = getTargets();
            targets.forEach((target) => {
              target.penId = pen.id;
              target.color = pen.color;
              target.strokeWidth = pen.width;
              target.lineCap = target.lineCap || owner.lineCap || 'round';
            });
          }
          penIcon.style.background = pen.color;
          penIcon.style.color = pen.color;
          penIcon.style.setProperty('--pen-width', pen.width);
          penIcon.title = pen.name;
          penMenu.querySelectorAll('.pen-option').forEach((opt) => {
            opt.classList.toggle('active', opt.dataset.penId === pen.id);
            opt.setAttribute('aria-pressed', opt.dataset.penId === pen.id ? 'true' : 'false');
          });
          if (render) {
            this.renderLayers();
            this.app.render();
          }
        };
        const current = pens.find((pen) => pen.id === owner.penId) || pens[0];
        if (current) applyPen(current, { render: false, syncTargets: false });
        penMenu.innerHTML = pens
          .map(
            (pen) => `
              <button type="button" class="pen-option" data-pen-id="${pen.id}" aria-pressed="${pen.id === owner.penId ? 'true' : 'false'}">
                <span class="pen-icon" style="background:${pen.color}; color:${pen.color}; --pen-width:${pen.width}"></span>
                <span class="pen-option-name">${escapeHtml(pen.name)}</span>
              </button>
            `
          )
          .join('');
        penMenu.querySelectorAll('.pen-option').forEach((opt) => {
          opt.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            applyPen(pens.find((pen) => pen.id === opt.dataset.penId));
            penMenu.classList.add('hidden');
          };
        });
        penPill.onclick = (e) => {
          e.stopPropagation();
          if (this.openPenMenu && this.openPenMenu !== penMenu) this.openPenMenu.classList.add('hidden');
          penMenu.classList.toggle('hidden');
          this.openPenMenu = penMenu.classList.contains('hidden') ? null : penMenu;
        };
        el.ondragover = (ev) => {
          const types = Array.from(ev.dataTransfer?.types || []);
          if (!types.length || types.includes('text/pen-id') || types.includes('text/plain')) {
            ev.preventDefault();
            el.classList.add('dragging');
          }
        };
        el.ondragleave = () => el.classList.remove('dragging');
        el.ondrop = (ev) => {
          ev.preventDefault();
          el.classList.remove('dragging');
          const penId = ev.dataTransfer.getData('text/pen-id') || ev.dataTransfer.getData('text/plain');
          const next = pens.find((pen) => pen.id === penId);
          if (!next) return;
          if (this.app.pushHistory) this.app.pushHistory();
          applyPen(next);
          penMenu.classList.add('hidden');
        };
      };

      const renderGroupRow = (group, depth = 0) => {
        const el = document.createElement('div');
        const isModifierContainer = this.isModifierLayer(group);
        const modifier = isModifierContainer ? this.getModifierState(group) : null;
        const typeLabel = isModifierContainer
          ? `${MODIFIER_DEFAULTS?.[modifier?.type || 'mirror']?.label || 'Mirror'} Modifier`
          : ALGO_DEFAULTS?.[group.groupType]?.label || group.groupType || 'Group';
        const isActive = group.id === this.app.engine.activeLayerId;
        const isSelected = this.app.renderer?.selectedLayerIds?.has(group.id) || hasSelectedDescendant(group.id);
        const showMask = !isModifierContainer && Boolean(group.maskCapabilities?.canSource || childrenMap.get(group.id)?.length);
        el.className =
          `layer-item layer-group flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2 ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
        if (isActive) el.setAttribute('aria-current', 'true');
        el.dataset.layerId = group.id;
        const indent = depth * 12;
        if (indent) {
          el.style.marginLeft = `${indent}px`;
          el.style.width = `calc(100% - ${indent}px)`;
        }
        const isManualGroup = group.groupType === 'group';
        el.innerHTML = `
          <div class="flex items-center gap-2 flex-1 overflow-hidden">
            ${gripMarkup}
            <button class="group-toggle" type="button" aria-label="Toggle group" title="Toggle group">${group.groupCollapsed ? '▸' : '▾'}</button>
            ${isModifierContainer ? `<input type="checkbox" ${modifier?.enabled === false ? '' : 'checked'} class="group-enabled cursor-pointer" aria-label="Toggle modifier">` : ''}
            <span class="layer-name text-sm ${isActive ? 'text-vectura-accent font-bold' : 'text-vectura-accent'} truncate">${group.name}</span>
            <input
              class="layer-name-input hidden w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none"
              type="text"
              value="${group.name}"
            />
            ${group.mask?.enabled ? `<span class="layer-mini-badge layer-mini-badge--mask">${group.mask?.hideLayer ? 'MASK HIDDEN' : 'MASK'}</span>` : ''}
            <span class="layer-badge text-[10px] text-vectura-muted uppercase tracking-widest">${typeLabel}</span>
          </div>
          <div class="flex items-center gap-1">
            ${isManualGroup ? buildPenAssignment(group, () => [group, ...this.getLayerDescendants(group.id)]) : ''}
            ${showMask ? `<button type="button" class="layer-mask-trigger ${group.mask?.enabled ? 'layer-mask-trigger--active' : ''}" aria-label="Edit mask" title="Edit mask">Mask</button>` : ''}
            <button class="text-sm text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete group" title="Delete group">✕</button>
          </div>
        `;
        const toggle = el.querySelector('.group-toggle');
        const delBtn = el.querySelector('.btn-del');
        const maskBtn = el.querySelector('.layer-mask-trigger');
        const grip = el.querySelector('.layer-grip');
        const nameEl = el.querySelector('.layer-name');
        const nameInput = el.querySelector('.layer-name-input');
        const modifierEnabled = el.querySelector('.group-enabled');
        if (toggle) {
          toggle.onclick = (e) => {
            e.stopPropagation();
            group.groupCollapsed = !group.groupCollapsed;
            this.renderLayers();
          };
        }
        const selectGroupChildren = (e, options = {}) => {
          const { skipList = false } = options;
          if (e && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
          }
          if (isModifierContainer) {
            if (this.app.renderer) this.app.renderer.setSelection([group.id], group.id);
            this.app.engine.activeLayerId = group.id;
            this.lastLayerClickId = group.id;
            if (!skipList) this.renderLayers();
            this.buildControls();
            this.updateFormula();
            this.app.render();
            return;
          }
          const ids = collectDescendants(group.id);
          ids.push(group.id);
          const primary = ids.length > 1 ? ids[ids.length - 2] : group.id;
          if (this.app.renderer) this.app.renderer.setSelection(ids, primary);
          this.app.engine.activeLayerId = primary;
          this.lastLayerClickId = primary;
          if (!skipList) this.renderLayers();
          this.buildControls();
          this.updateFormula();
          this.app.render();
        };
        el.onclick = (e) => {
          if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
          if (this.armedPenId) {
            const descendants = this.getLayerDescendants(group.id);
            if (this.applyArmedPenToLayers(descendants.length ? descendants : [group])) return;
          }
          selectGroupChildren(e);
        };
        el.onmousedown = (e) => {
          if (e.target.closest('input')) return;
          e.preventDefault();
        };
        if (modifierEnabled) {
          modifierEnabled.onchange = (e) => {
            modifier.enabled = Boolean(e.target.checked);
            if (this.app.pushHistory) this.app.pushHistory();
            this.refreshModifierLayer(group, { rebuildControls: group.id === this.app.engine.activeLayerId });
          };
        }
        if (nameEl && nameInput) {
          let nameClickTimer = null;
          nameEl.onclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = window.setTimeout(() => {
              selectGroupChildren(e);
              nameClickTimer = null;
            }, 250);
          };
          nameEl.ondblclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = null;
            nameEl.classList.add('hidden');
            nameInput.classList.remove('hidden');
            nameInput.focus();
            nameInput.select();
          };
          nameInput.onblur = () => {
            const next = nameInput.value.trim();
            if (next && next !== group.name) {
              if (this.isDuplicateLayerName(next, group.id)) {
                this.showDuplicateNameError(next);
                nameInput.focus();
                nameInput.select();
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              group.name = next;
            }
            nameInput.value = group.name;
            nameInput.classList.add('hidden');
            nameEl.classList.remove('hidden');
            this.renderLayers();
          };
          nameInput.onkeydown = (e) => {
            if (e.key === 'Enter') nameInput.blur();
            if (e.key === 'Escape') {
              nameInput.value = group.name;
              nameInput.blur();
            }
          };
        }
        bindLayerReorderGrip(grip, el, {
          ensureSelection: (e) => selectGroupChildren(e, { skipList: true }),
          getSelectedIds: () => [group.id, ...collectDescendants(group.id)],
        });
        if (isManualGroup) wirePenAssignment(el, group, () => [group, ...this.getLayerDescendants(group.id)]);
        if (maskBtn) {
          maskBtn.onclick = (e) => {
            e.stopPropagation();
            this.openMaskLayerId = this.openMaskLayerId === group.id ? null : group.id;
            this.renderLayers();
          };
        }
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            this.app.engine.removeLayer(group.id);
            if (this.app.pushHistory) this.app.pushHistory();
            if (this.app.renderer) {
              const nextId = this.app.engine.activeLayerId;
              this.app.renderer.setSelection(nextId ? [nextId] : [], nextId);
            }
            this.renderLayers();
            this.app.render();
          };
        }
        container.appendChild(el);
        selectableIds.push(group.id);
      };

      const renderLayerRow = (l, opts = {}) => {
        const isChild = Boolean(opts.isChild);
        const depth = opts.depth ?? 0;
        const isActive = l.id === this.app.engine.activeLayerId;
        const isSelected = this.app.renderer?.selectedLayerIds?.has(l.id);
        const hasChildren = Boolean((childrenMap.get(l.id) || []).length);
        const hidePen = false;
        const showExpand = !isChild && !l.isGroup;
        const maskMarkup =
          (!l.isGroup && (l.maskCapabilities?.canSource || hasChildren))
            ? `<button type="button" class="layer-mask-trigger ${l.mask?.enabled ? 'layer-mask-trigger--active' : ''}" aria-label="Edit mask" title="Edit mask">Mask</button>`
            : '';
        const expandMarkup = showExpand
          ? '<button class="text-sm text-vectura-muted hover:text-vectura-accent px-1 btn-expand" aria-label="Expand layer" title="Expand layer">⇲</button>'
          : '';
        const moveMarkup = isChild
          ? ''
          : `
            <button class="text-sm text-vectura-muted hover:text-vectura-accent px-1 btn-up" aria-label="Move layer up" title="Move layer up">▲</button>
            <button class="text-sm text-vectura-muted hover:text-vectura-accent px-1 btn-down" aria-label="Move layer down" title="Move layer down">▼</button>
          `;
        const el = document.createElement('div');
        el.className = `layer-item ${isChild ? 'layer-sub' : ''} flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2 group cursor-pointer hover:bg-vectura-border ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
        if (isActive) el.setAttribute('aria-current', 'true');
        el.dataset.layerId = l.id;
        const indent = depth * 12;
        if (indent) {
          el.style.marginLeft = `${indent}px`;
          el.style.width = `calc(100% - ${indent}px)`;
        }
        el.innerHTML = `
          <div class="flex items-center gap-2 flex-1 overflow-hidden">
            ${gripMarkup}
            <input
              type="checkbox"
              ${l.visible ? 'checked' : ''}
              class="cursor-pointer"
              aria-label="Toggle layer visibility"
              title="Toggle visibility"
            >
            <span class="layer-name text-sm truncate ${isActive ? 'text-vectura-accent font-bold' : 'text-vectura-muted'}">${escapeHtml(l.name)}</span>
            <input
              class="layer-name-input hidden w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none"
              type="text"
              value="${escapeHtml(l.name)}"
            />
            ${l.mask?.enabled ? `<span class="layer-mini-badge layer-mini-badge--mask">${l.mask?.hideLayer ? 'MASK HIDDEN' : 'MASK'}</span>` : ''}
          </div>
          <div class="flex items-center gap-1">
            ${hidePen ? '' : buildPenAssignment(l, () => (this.app.renderer?.selectedLayerIds?.has(l.id) ? this.app.renderer.getSelectedLayers() : [l]))}
            ${maskMarkup}
            ${expandMarkup}
            ${moveMarkup}
            <button class="text-sm text-vectura-muted hover:text-vectura-accent px-1 btn-dup" aria-label="Duplicate layer" title="Duplicate layer">⧉</button>
            <button class="text-sm text-vectura-muted hover:text-vectura-danger px-1 ml-1 btn-del" aria-label="Delete layer" title="Delete layer">✕</button>
          </div>
        `;
        const nameEl = el.querySelector('.layer-name');
        const nameInput = el.querySelector('.layer-name-input');
        const visibilityEl = el.querySelector('input[type=checkbox]');
        const delBtn = el.querySelector('.btn-del');
        const upBtn = el.querySelector('.btn-up');
        const downBtn = el.querySelector('.btn-down');
        const dupBtn = el.querySelector('.btn-dup');
        const expandBtn = el.querySelector('.btn-expand');
        const maskBtn = el.querySelector('.layer-mask-trigger');
        const grip = el.querySelector('.layer-grip');

        const selectLayer = (e, options = {}) => {
          const { skipList = false } = options;
          if (this.armedPenId) {
            const targets = this.app.renderer?.selectedLayerIds?.has(l.id)
              ? this.app.renderer.getSelectedLayers()
              : [l];
            if (this.applyArmedPenToLayers(targets)) return;
          }
          if (e && e.shiftKey && this.lastLayerClickId && this.layerListOrder.length) {
            const list = this.layerListOrder;
            const start = list.indexOf(this.lastLayerClickId);
            const end = list.indexOf(l.id);
            if (start !== -1 && end !== -1) {
              const from = Math.min(start, end);
              const to = Math.max(start, end);
              const rangeIds = list.slice(from, to + 1);
              if (this.app.renderer) this.app.renderer.setSelection(rangeIds, l.id);
            } else {
              this.app.renderer.selectLayer(l);
            }
          } else if (e && (e.metaKey || e.ctrlKey)) {
            this.app.renderer.selectLayer(l, { toggle: true });
          } else {
            this.app.renderer.selectLayer(l);
          }
          this.app.engine.activeLayerId = this.app.renderer.selectedLayerId || l.id;
          this.lastLayerClickId = l.id;
          if (!skipList) this.renderLayers();
          this.buildControls();
          this.updateFormula();
          this.app.render();
        };

        el.onclick = (e) => {
          if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
          selectLayer(e);
        };
        el.onmousedown = (e) => {
          if (e.target.closest('input')) return;
          e.preventDefault();
        };

        if (expandBtn) {
          expandBtn.onclick = (e) => {
            e.stopPropagation();
            this.expandLayer(l);
          };
        }

        if (nameEl && nameInput) {
          let nameClickTimer = null;
          nameEl.onclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = window.setTimeout(() => {
              selectLayer(e);
              nameClickTimer = null;
            }, 250);
          };
          nameEl.ondblclick = (e) => {
            e.stopPropagation();
            if (nameClickTimer) window.clearTimeout(nameClickTimer);
            nameClickTimer = null;
            nameEl.classList.add('hidden');
            nameInput.classList.remove('hidden');
            nameInput.focus();
            nameInput.select();
          };
          nameInput.onblur = () => {
            const next = nameInput.value.trim();
            if (next && next !== l.name) {
              if (this.isDuplicateLayerName(next, l.id)) {
                this.showDuplicateNameError(next);
                nameInput.focus();
                nameInput.select();
                return;
              }
              if (this.app.pushHistory) this.app.pushHistory();
              l.name = next;
            }
            nameInput.value = l.name;
            nameInput.classList.add('hidden');
            nameEl.classList.remove('hidden');
            this.renderLayers();
          };
          nameInput.onkeydown = (e) => {
            if (e.key === 'Enter') nameInput.blur();
            if (e.key === 'Escape') {
              nameInput.value = l.name;
              nameInput.blur();
            }
          };
        }
        if (visibilityEl) {
          visibilityEl.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            l.visible = e.target.checked;
            this.app.computeDisplayGeometry();
            this.renderLayers();
            this.buildControls();
            this.app.render();
            this.app.updateStats();
          };
        }
        if (maskBtn) {
          maskBtn.onclick = (e) => {
            e.stopPropagation();
            this.openMaskLayerId = this.openMaskLayerId === l.id ? null : l.id;
            this.renderLayers();
          };
        }
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            this.app.engine.removeLayer(l.id);
            if (this.app.pushHistory) this.app.pushHistory();
            if (this.app.renderer) {
              const nextId = this.app.engine.activeLayerId;
              this.app.renderer.setSelection(nextId ? [nextId] : [], nextId);
            }
            this.renderLayers();
            this.app.render();
          };
        }
        if (upBtn && !isChild) {
          upBtn.onclick = (e) => {
            e.stopPropagation();
            const changed = this.app.engine.moveLayer(l.id, 1);
            if (changed && this.app.pushHistory) this.app.pushHistory();
            this.renderLayers();
            this.app.render();
          };
        }
        if (downBtn && !isChild) {
          downBtn.onclick = (e) => {
            e.stopPropagation();
            const changed = this.app.engine.moveLayer(l.id, -1);
            if (changed && this.app.pushHistory) this.app.pushHistory();
            this.renderLayers();
            this.app.render();
          };
        }
        if (dupBtn) {
          dupBtn.onclick = (e) => {
            e.stopPropagation();
            this.duplicateLayers([l]);
          };
        }
        wirePenAssignment(el, l, () => (this.app.renderer?.selectedLayerIds?.has(l.id) ? this.app.renderer.getSelectedLayers() : [l]));
        if (grip) {
          bindLayerReorderGrip(grip, el, {
            ensureSelection: (e) => {
              if (!this.app.renderer?.selectedLayerIds?.has(l.id)) {
                selectLayer(e, { skipList: true });
              }
            },
          });
        }
        container.appendChild(el);
        if (this.openMaskLayerId === l.id) {
          const panelWrap = document.createElement('div');
          panelWrap.className = 'layer-mask-popover-wrap';
          if (indent) {
            panelWrap.style.marginLeft = `${indent + 8}px`;
            panelWrap.style.width = `calc(100% - ${indent + 8}px)`;
          }
          panelWrap.appendChild(this.buildMaskEditor(l, { compact: true }));
          container.appendChild(panelWrap);
        }
        selectableIds.push(l.id);
      };

      const renderTree = (layer, depth = 0) => {
        if (layer.isGroup) {
          renderGroupRow(layer, depth);
          const children = childrenMap.get(layer.id) || [];
          const showChildren = !layer.groupCollapsed;
          if (showChildren) {
            children.forEach((child) => renderTree(child, depth + 1));
          }
        } else {
          renderLayerRow(layer, { isChild: depth > 0, depth });
          const children = childrenMap.get(layer.id) || [];
          children.forEach((child) => renderTree(child, depth + 1));
        }
      };

      layers.forEach((layer) => {
        if (layer.parentId && parentIds.has(layer.parentId)) return;
        renderTree(layer, 0);
      });
      this.layerListOrder = selectableIds;
      this.updateLightSourceTool();
      if (SETTINGS.autoColorization?.enabled && !this.isApplyingAutoColorization) {
        this.applyAutoColorization({ commit: false, skipLayerRender: true });
      }
    }

    renderPens() {
      const container = getEl('pen-list');
      if (!container) return;
      container.innerHTML = '';
      const pens = SETTINGS.pens || [];

      pens.forEach((pen) => {
        const el = document.createElement('div');
        el.className = 'pen-item flex items-center justify-between bg-vectura-bg border border-vectura-border p-2 mb-2';
        el.dataset.penId = pen.id;
        el.innerHTML = `
          <div class="flex items-center gap-2 flex-1 overflow-hidden">
            <button class="pen-grip" type="button" aria-label="Reorder pen">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
            <div class="pen-icon"></div>
            <input
              class="pen-name-input w-full bg-transparent text-xs text-vectura-text focus:outline-none"
              value="${escapeHtml(pen.name)}"
            />
          </div>
          <div class="flex items-center gap-2">
            <div class="relative w-4 h-4 overflow-hidden rounded-full border border-vectura-border">
              <input type="color" class="pen-color" value="${pen.color}" aria-label="Pen color">
            </div>
            <input type="range" min="0.05" max="2" step="0.05" value="${pen.width}" class="pen-width">
            <span class="text-[10px] text-vectura-muted pen-width-value">${pen.width}</span>
            <button class="pen-remove" type="button" aria-label="Remove pen">✕</button>
          </div>
        `;
        const icon = el.querySelector('.pen-icon');
        const grip = el.querySelector('.pen-grip');
        const nameInput = el.querySelector('.pen-name-input');
        const colorInput = el.querySelector('.pen-color');
        const widthInput = el.querySelector('.pen-width');
        const widthValue = el.querySelector('.pen-width-value');
        const removeBtn = el.querySelector('.pen-remove');

        const applyIcon = () => {
          if (!icon) return;
          icon.style.background = pen.color;
          icon.style.color = pen.color;
          icon.style.setProperty('--pen-width', pen.width);
        };
        applyIcon();

        if (nameInput) {
          nameInput.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            pen.name = e.target.value.trim() || pen.name;
            this.renderLayers();
          };
        }

        if (colorInput) {
          colorInput.oninput = (e) => {
            pen.color = e.target.value;
            applyIcon();
            this.app.engine.layers.forEach((layer) => {
              if (layer.penId === pen.id) {
                layer.color = pen.color;
              }
            });
            if (SETTINGS.autoColorization?.enabled) {
              this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
            }
            this.app.render();
          };
        }

        if (widthInput && widthValue) {
          widthInput.oninput = (e) => {
            pen.width = parseFloat(e.target.value);
            widthValue.textContent = pen.width.toFixed(2);
            applyIcon();
            this.app.engine.layers.forEach((layer) => {
              if (layer.penId === pen.id) {
                layer.strokeWidth = pen.width;
              }
            });
            if (SETTINGS.autoColorization?.enabled) {
              this.applyAutoColorization({ commit: false, skipLayerRender: true, source: 'continuous' });
            }
            this.app.render();
          };
        }

        if (removeBtn) {
          removeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removePen(pen.id);
          };
        }

        if (icon) {
          icon.draggable = true;
          icon.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            e.preventDefault();
            e.stopPropagation();
            this.setArmedPen(this.armedPenId === pen.id ? null : pen.id);
          });
          icon.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targets = this.getAutoColorizationTargets('selected');
            if (!targets.length) return;
            if (this.app.pushHistory) this.app.pushHistory();
            targets.forEach((layer) => {
              layer.penId = pen.id;
              layer.color = pen.color;
              layer.strokeWidth = pen.width;
            });
            this.renderLayers();
            this.app.render();
          };
          icon.ondragstart = (e) => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/pen-id', pen.id);
            e.dataTransfer.setData('text/plain', pen.id);
          };
        }

        if (grip) {
          grip.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dragEl = el;
            dragEl.classList.add('dragging');
            const indicator = document.createElement('div');
            indicator.className = 'layer-drop-indicator';
            container.insertBefore(indicator, dragEl);
            const currentOrder = pens.map((p) => p.id);
            const startIndex = currentOrder.indexOf(pen.id);

            const onMove = (ev) => {
              const y = ev.clientY;
              const items = Array.from(container.querySelectorAll('.pen-item')).filter((item) => item !== dragEl);
              let inserted = false;
              for (const item of items) {
                const rect = item.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                  container.insertBefore(indicator, item);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) container.appendChild(indicator);
            };

            const onUp = () => {
              dragEl.classList.remove('dragging');
              const siblings = Array.from(container.children);
              const indicatorIndex = siblings.indexOf(indicator);
              const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('pen-item'));
              const newIndex = before.length;
              indicator.remove();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);

              if (newIndex !== startIndex) {
                const nextOrder = currentOrder.filter((id) => id !== pen.id);
                nextOrder.splice(newIndex, 0, pen.id);
                const map = new Map(pens.map((p) => [p.id, p]));
                SETTINGS.pens = nextOrder.map((id) => map.get(id)).filter(Boolean);
                this.renderPens();
                this.renderLayers();
              }
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        }

        container.appendChild(el);
      });

      this.refreshArmedPenUI();

      if (SETTINGS.autoColorization?.enabled) {
        this.applyAutoColorization({ commit: false });
      }
    }

    expandLayer(layer, options = {}) {
      if (!layer || layer.isGroup || layer.parentId) return;
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
        const newId = Math.random().toString(36).substr(2, 9);
        const child = new Layer(newId, 'expanded', `${baseName} - Line ${String(index + 1).padStart(pad, '0')}`);
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
            const groupId = Math.random().toString(36).substr(2, 9);
            groupNode = new Layer(groupId, 'group', entry.group);
            groupNode.isGroup = true;
            groupNode.groupType = 'group';
            groupNode.groupCollapsed = false;
            groupNode.visible = false;
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
      layer.visible = false;
      layer.paths = [];
      layer.sourcePaths = null;
      layer.paramStates = {};

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
      const primary = children[0];
      if (primary && selectChildren) {
        this.app.engine.activeLayerId = primary.id;
        if (this.app.renderer) this.app.renderer.setSelection([primary.id], primary.id);
      }
      if (!suppressRender) {
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
      }
      if (returnChildren) return children;
    }

    createManualLayerFromPath(payload) {
      const path = Array.isArray(payload) ? payload : payload?.path;
      const anchors = Array.isArray(payload?.anchors) ? payload.anchors : null;
      const closed = Boolean(payload?.closed);
      if (!Layer || !Array.isArray(path) || path.length < 2) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const engine = this.app.engine;
      SETTINGS.globalLayerCount++;
      const num = String(SETTINGS.globalLayerCount).padStart(2, '0');
      const id = Math.random().toString(36).substr(2, 9);
      const layer = new Layer(id, 'expanded', `Pen Path ${num}`);
      const active = engine.getActiveLayer ? engine.getActiveLayer() : null;
      const shapeType = payload?.shape?.type || null;
      const inheritsCurves = !shapeType;
      const shapeUsesCurves = shapeType === 'oval';
      layer.params.seed = 0;
      layer.params.posX = 0;
      layer.params.posY = 0;
      layer.params.scaleX = 1;
      layer.params.scaleY = 1;
      layer.params.rotation = 0;
      layer.params.curves = inheritsCurves ? Boolean(active?.params?.curves) : shapeUsesCurves;
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
      layer.parentId = active?.parentId ?? null;
      if (active) {
        layer.penId = active.penId;
        layer.color = active.color;
        layer.strokeWidth = active.strokeWidth;
        layer.lineCap = active.lineCap;
      }
      const cloned = path.map((pt) => ({ x: pt.x, y: pt.y }));
      if (path.meta) {
        cloned.meta = clone(path.meta);
      }
      if (anchors && anchors.length >= 2) {
        cloned.meta = {
          ...(cloned.meta || {}),
          anchors: anchors.map((anchor) => ({
            x: anchor.x,
            y: anchor.y,
            in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
            out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
          })),
          closed,
        };
      }
      if (payload?.shape?.type) {
        const shapeLabelMap = {
          rect: 'Rectangle',
          oval: 'Oval',
          polygon: 'Polygon',
        };
        const baseName = shapeLabelMap[payload.shape.type] || 'Shape';
        layer.name = this.getUniqueLayerName(`${baseName} ${num}`, id);
      }
      layer.sourcePaths = [cloned];
      const idx = engine.layers.findIndex((l) => l.id === engine.activeLayerId);
      const insertIndex = idx >= 0 ? idx + 1 : engine.layers.length;
      engine.layers.splice(insertIndex, 0, layer);
      engine.activeLayerId = id;
      engine.generate(id);
      if (this.app.renderer) this.app.renderer.setSelection([id], id);
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.app.render();
    }

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

    splitExpandedLayer(layer, segments) {
      if (!Layer || !layer || !segments || !segments.length) return [];
      const engine = this.app.engine;
      const idx = engine.layers.findIndex((l) => l.id === layer.id);
      const pad = String(segments.length).length;
      const children = segments.map((seg, i) => {
        const newId = Math.random().toString(36).substr(2, 9);
        const child = new Layer(newId, 'expanded', `${layer.name} Cut ${String(i + 1).padStart(pad, '0')}`);
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

    applyScissor(payload) {
      if (!payload) return;
      const shape = {
        mode: payload.mode,
        line: payload.line,
        rect: payload.rect,
        circle: payload.circle,
      };
      if (!shape.mode) return;
      if (this.app.pushHistory) this.app.pushHistory();

      const renderer = this.app.renderer;
      const engine = this.app.engine;
      const baseTargets = engine.layers.filter((layer) => !layer.isGroup && layer.visible);
      const targets = [];

      baseTargets.forEach((layer) => {
        if (layer.isGroup) {
          targets.push(...this.getGroupDescendants(layer.id));
          return;
        }
        if (layer.type !== 'expanded' && !layer.parentId) {
          const expanded = this.expandLayer(layer, { skipHistory: true, returnChildren: true, suppressRender: true, selectChildren: false });
          if (expanded && expanded.length) targets.push(...expanded);
          return;
        }
        targets.push(layer);
      });

      const uniqueTargets = Array.from(new Map(targets.map((layer) => [layer.id, layer])).values());
      const newSelection = [];

      uniqueTargets.forEach((layer) => {
        const src = layer.sourcePaths || layer.paths || [];
        let segments = [];
        let didSplit = false;
        src.forEach((path) => {
          const basePath = path && path.meta && path.meta.kind === 'circle' ? expandCirclePath(path.meta, 80) : path;
          const split = splitPathByShape(basePath, shape);
          if (!split || !split.length) {
            segments.push(path);
            return;
          }
          segments = segments.concat(split);
          didSplit = true;
        });
        if (!segments.length || !didSplit) return;
        if (segments.length === 1) {
          layer.sourcePaths = segments.map((seg) => seg.map((pt) => ({ x: pt.x, y: pt.y })));
          engine.generate(layer.id);
          newSelection.push(layer.id);
          return;
        }
        const children = this.splitExpandedLayer(layer, segments);
        newSelection.push(...children.map((child) => child.id));
      });

      this.normalizeGroupOrder?.();
      this.renderLayers();
      this.app.render();
      if (newSelection.length && renderer) {
        const primary = newSelection[newSelection.length - 1];
        renderer.setSelection(newSelection, primary);
        engine.activeLayerId = primary;
      }
    }

    startLightSourcePlacement() {
      if (!this.app.renderer) return;
      this.setActiveTool?.('select');
      this.app.renderer.setLightSourceMode?.(true);
    }

    openLayerSettings(layer) {
      const strokeValue = layer.strokeWidth ?? SETTINGS.strokeWidth;
      const capValue = layer.lineCap || 'round';
      const body = `
        <div class="modal-section">
          <div class="flex justify-between mb-2">
            <label class="control-label mb-0">Line Width (mm)</label>
            <span class="text-xs text-vectura-accent font-mono" id="layer-stroke-value">${strokeValue}</span>
          </div>
          <input
            type="range"
            min="0.05"
            max="2"
            step="0.05"
            value="${strokeValue}"
            class="w-full"
            id="layer-stroke-input"
          />
        </div>
        <div class="modal-section">
          <label class="control-label">Line Cap</label>
          <select
            id="layer-cap-select"
            class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent"
          >
            <option value="round" ${capValue === 'round' ? 'selected' : ''}>Round</option>
            <option value="butt" ${capValue === 'butt' ? 'selected' : ''}>Flat</option>
            <option value="square" ${capValue === 'square' ? 'selected' : ''}>Square</option>
          </select>
        </div>
      `;

      this.openModal({
        title: `${layer.name} Settings`,
        body,
      });

      const bodyEl = this.modal.bodyEl;
      const strokeInput = bodyEl.querySelector('#layer-stroke-input');
      const strokeValueEl = bodyEl.querySelector('#layer-stroke-value');
      const capSelect = bodyEl.querySelector('#layer-cap-select');

      if (strokeInput && strokeValueEl) {
        strokeInput.oninput = (e) => {
          strokeValueEl.textContent = e.target.value;
        };
        strokeInput.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          layer.strokeWidth = parseFloat(e.target.value);
          this.app.render();
        };
      }
      if (capSelect) {
        capSelect.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          layer.lineCap = e.target.value;
          this.app.render();
        };
      }
    }

    loadNoiseImageFile(
      file,
      layer,
      nameEl,
      idKey = 'noiseImageId',
      nameKey = 'noiseImageName',
      target = null,
      previewKey = ''
    ) {
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
          const id = `noise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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

    openNoiseImageModal(layer, options = {}) {
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
        fileInput.onchange = () => {
          const file = fileInput.files?.[0];
          handleFile(file);
        };
      }
    }

    computeHarmonographPlotterData(layer) {
      const params = layer?.params || {};
      const samples = Math.max(200, Math.floor(params.samples ?? 4000));
      const duration = Math.max(1, params.duration ?? 30);
      const scale = params.scale ?? 1;
      const rotSpeed = (params.paperRotation ?? 0) * Math.PI * 2;
      const loopDrift = params.loopDrift ?? 0;
      const settleThreshold = Math.max(0, params.settleThreshold ?? 0);
      const settleWindow = Math.max(1, Math.floor(params.settleWindow ?? 24));
      const pendulums = (Array.isArray(params.pendulums) ? params.pendulums : [])
        .filter((pend) => pend?.enabled !== false)
        .map((pend) => ({
          ax: pend.ampX ?? 0,
          ay: pend.ampY ?? 0,
          phaseX: ((pend.phaseX ?? 0) * Math.PI) / 180,
          phaseY: ((pend.phaseY ?? 0) * Math.PI) / 180,
          freq: pend.freq ?? 1,
          micro: pend.micro ?? 0,
          damp: Math.max(0, pend.damp ?? 0),
        }));
      if (!pendulums.length) return { path: [], durationSec: 0 };
      const dt = duration / samples;
      const path = [];
      let settleCount = 0;
      for (let i = 0; i <= samples; i += 1) {
        const t = i * dt;
        let x = 0;
        let y = 0;
        pendulums.forEach((pend) => {
          const freq = (pend.freq + pend.micro + loopDrift * t) * Math.PI * 2;
          const decay = Math.exp(-pend.damp * t);
          x += pend.ax * Math.sin(freq * t + pend.phaseX) * decay;
          y += pend.ay * Math.sin(freq * t + pend.phaseY) * decay;
        });
        x *= scale;
        y *= scale;
        if (rotSpeed) {
          const ang = rotSpeed * t;
          const rx = x * Math.cos(ang) - y * Math.sin(ang);
          const ry = x * Math.sin(ang) + y * Math.cos(ang);
          x = rx;
          y = ry;
        }
        path.push({ x, y, t });
        if (settleThreshold > 0) {
          const mag = Math.hypot(x, y);
          settleCount = mag <= settleThreshold ? settleCount + 1 : 0;
          if (settleCount >= settleWindow) break;
        }
      }

      return { path, durationSec: path[path.length - 1]?.t ?? 0 };
    }

    mountHarmonographPlotter(layer, target) {
      if (!target) return;
      const data = this.computeHarmonographPlotterData(layer);
      const speeds = [0.25, 0.5, 1, 2, 4];
      const maxPlayhead = Math.max(0, data.path.length - 1);
      const initialPlayhead = clamp(this.harmonographPlotterState?.playhead ?? 0, 0, maxPlayhead);
      const rememberedSpeed = this.harmonographPlotterState?.speed ?? 1;
      const initialSpeed = speeds.includes(rememberedSpeed) ? rememberedSpeed : 1;
      const durationSec = Math.max(0.1, data.durationSec || layer?.params?.duration || 1);
      const progressPerMs = maxPlayhead > 0 ? maxPlayhead / (durationSec * 1000) : 0;
      const wrapper = document.createElement('div');
      wrapper.className = 'harmonograph-plotter mb-4';
      wrapper.innerHTML = `
        <div class="harmonograph-plotter-head">
          <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Virtual Plotter</span>
          <button type="button" class="harmonograph-plotter-play text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">Play</button>
        </div>
        <canvas class="harmonograph-plotter-canvas" width="240" height="240"></canvas>
        <div class="harmonograph-plotter-meta text-[10px] text-vectura-muted">Scrub the playhead to preview the drawing sequence.</div>
        <div class="harmonograph-plotter-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">Playhead</label>
          <input class="harmonograph-plotter-range" type="range" min="0" max="${maxPlayhead}" step="1" value="${initialPlayhead}">
        </div>
        <div class="harmonograph-plotter-row">
          <label class="text-[10px] uppercase tracking-widest text-vectura-muted">Speed</label>
          <select class="harmonograph-plotter-speed bg-vectura-bg border border-vectura-border p-1 text-[10px] focus:outline-none focus:border-vectura-accent">
            ${speeds
              .map((speed) => `<option value="${speed}" ${speed === initialSpeed ? 'selected' : ''}>${speed}x</option>`)
              .join('')}
          </select>
        </div>
      `;
      target.appendChild(wrapper);
      const canvas = wrapper.querySelector('.harmonograph-plotter-canvas');
      const playBtn = wrapper.querySelector('.harmonograph-plotter-play');
      const range = wrapper.querySelector('.harmonograph-plotter-range');
      const speedSelect = wrapper.querySelector('.harmonograph-plotter-speed');
      if (!canvas || !range || !speedSelect || !playBtn) return;

      const state = {
        rafId: null,
        playing: false,
        playhead: clamp(parseInt(range.value, 10) || 0, 0, maxPlayhead),
        speed: initialSpeed,
        lastTs: 0,
        maxPlayhead,
        progressPerMs,
      };
      this.harmonographPlotterState = state;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getThemeToken('--plotter-bg', '#101115');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!data.path.length) return;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        data.path.forEach((pt) => {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });
        const spanX = maxX - minX;
        const spanY = maxY - minY;
        const span = Math.max(spanX, spanY, 1);
        const pad = 16;
        const scale = (Math.min(canvas.width, canvas.height) - pad * 2) / span;
        const toCanvas = (pt) => ({
          x: (pt.x - (minX + maxX) / 2) * scale + canvas.width / 2,
          y: (pt.y - (minY + maxY) / 2) * scale + canvas.height / 2,
        });

        ctx.strokeStyle = getThemeToken('--plotter-path-base', 'rgba(113,113,122,0.35)');
        ctx.lineWidth = 1;
        ctx.beginPath();
        data.path.forEach((pt, idx) => {
          const c = toCanvas(pt);
          if (idx === 0) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
        });
        ctx.stroke();

        const limit = clamp(state.playhead, 0, data.path.length - 1);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i <= limit; i += 1) {
          const c = toCanvas(data.path[i]);
          if (i === 0) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();

        const head = toCanvas(data.path[limit]);
        ctx.fillStyle = getThemeToken('--plotter-head', '#fafafa');
        ctx.beginPath();
        ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
        ctx.fill();
      };

      const tick = (ts) => {
        if (!state.playing) return;
        const last = state.lastTs || ts;
        const delta = Math.max(0, ts - last);
        state.lastTs = ts;
        const step = delta * state.progressPerMs * state.speed;
        state.playhead += step;
        if (state.playhead >= state.maxPlayhead) {
          state.playhead = state.maxPlayhead;
          state.playing = false;
          state.rafId = null;
          playBtn.textContent = 'Play';
        }
        range.value = `${Math.round(state.playhead)}`;
        draw();
        if (state.playing) state.rafId = window.requestAnimationFrame(tick);
      };

      playBtn.onclick = () => {
        if (state.maxPlayhead <= 0) return;
        if (!state.playing && state.playhead >= state.maxPlayhead) {
          state.playhead = 0;
          range.value = '0';
          draw();
        }
        state.playing = !state.playing;
        playBtn.textContent = state.playing ? 'Pause' : 'Play';
        if (state.playing) {
          state.lastTs = 0;
          state.rafId = window.requestAnimationFrame(tick);
        } else if (state.rafId) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = null;
        }
      };
      range.oninput = (e) => {
        state.playhead = clamp(parseInt(e.target.value, 10) || 0, 0, state.maxPlayhead);
        if (state.playing) state.lastTs = 0;
        draw();
      };
      speedSelect.onchange = (e) => {
        const nextSpeed = parseFloat(e.target.value);
        state.speed = Number.isFinite(nextSpeed) ? nextSpeed : 1;
        if (state.playing) state.lastTs = 0;
      };
      if (state.maxPlayhead <= 0) {
        playBtn.disabled = true;
        playBtn.classList.add('opacity-60', 'cursor-not-allowed');
        range.disabled = true;
        speedSelect.disabled = true;
      }

      draw();
    }


    buildControls() {
      const restoreLeftPanelScroll = this.captureLeftPanelScrollPosition();
      const container = getEl('dynamic-controls');
      if (!container) {
        restoreLeftPanelScroll();
        return;
      }
      if (this.harmonographPlotterState?.rafId) {
        window.cancelAnimationFrame(this.harmonographPlotterState.rafId);
      }
      this.harmonographPlotterState = null;
      this.destroyInlinePetalisDesigner();
      this.destroyInlinePatternDesigner();
      container.innerHTML = '';
      const layer = this.app.engine.getActiveLayer();
      if (!layer) {
        restoreLeftPanelScroll();
        return;
      }
      this.ensurePatternLayerSelection(layer);

      const moduleSelect = getEl('generator-module');
      const seed = getEl('inp-seed');
      const posX = getEl('inp-pos-x');
      const posY = getEl('inp-pos-y');
      const scaleX = getEl('inp-scale-x');
      const scaleY = getEl('inp-scale-y');
      const rotation = getEl('inp-rotation');
      const isGroup = Boolean(layer.isGroup);
      const isModifier = this.isModifierLayer(layer);
      const isStatic = Boolean(isGroup || isModifier);
      this.updatePrimaryPanelMode(layer);
      this.syncPrimaryModuleDropdown(layer);
      if (moduleSelect) {
        if (!isModifier) {
          Array.from(moduleSelect.options).forEach((opt) => {
            if (opt.dataset.temp === 'true') opt.remove();
          });
          const hasOption = Array.from(moduleSelect.options).some((opt) => opt.value === layer.type);
          if (!hasOption) {
            const opt = document.createElement('option');
            opt.value = layer.type;
            opt.dataset.temp = 'true';
            opt.innerText = ALGO_DEFAULTS?.[layer.type]?.label || layer.type;
            moduleSelect.appendChild(opt);
          }
          moduleSelect.value = layer.type;
          moduleSelect.disabled = isStatic;
          moduleSelect.classList.toggle('opacity-60', isStatic);
        }
      }
      if (seed) seed.value = layer.params.seed;
      if (posX) posX.value = layer.params.posX;
      if (posY) posY.value = layer.params.posY;
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;
      if (rotation) rotation.value = layer.params.rotation;
      if (!isModifier) this.toggleSeedControls(layer.type);

      const desc = getEl('algo-desc');
      if (desc) {
        desc.innerText = isModifier
          ? MODIFIER_DESCRIPTIONS?.[this.getModifierState(layer)?.type || 'mirror'] || 'No description available.'
          : DESCRIPTIONS[layer.type] || 'No description available.';
      }
      if (moduleSelect) {
        const algoLabel = moduleSelect.parentElement?.querySelector('.control-label');
        if (algoLabel && !algoLabel.querySelector('.info-btn')) {
          this.attachInfoButton(algoLabel, 'global.algorithm');
        }
      }

      const algoDefs = isModifier ? [] : this.controls[layer.type] || [];
      const commonDefs = COMMON_CONTROLS;
      const hasConditionalDefs = algoDefs.some((def) => typeof def.showIf === 'function');
      const hasNoiseConditional = WAVE_NOISE_DEFS.some((def) => typeof def.showIf === 'function');
      if (!isModifier && !algoDefs.length && !commonDefs.length) {
        restoreLeftPanelScroll();
        return;
      }

      if (isModifier) {
        this.buildMirrorModifierControls(layer, container);
        restoreLeftPanelScroll();
        return;
      }

      if (isGroup) {
        const msg = document.createElement('p');
        msg.className = 'text-xs text-vectura-muted mb-4';
        msg.textContent = 'Select a sublayer to edit its parameters.';
        container.appendChild(msg);
      } else {
        this.storeLayerParams(layer);
      }

      const resetWrap = document.createElement('div');
      resetWrap.className = 'mb-4 grid grid-cols-2 gap-2';
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className =
        'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors';
      resetBtn.textContent = 'Reset to Defaults';
      resetBtn.onclick = () => {
        if (this.app.pushHistory) this.app.pushHistory();
        const transform = this.getDefaultTransformForType(layer.type, layer.params);
        if (!layer.paramStates) layer.paramStates = {};
        delete layer.paramStates[layer.type];
        const base = ALGO_DEFAULTS[layer.type] ? clone(ALGO_DEFAULTS[layer.type]) : {};
        layer.params = { ...base, ...transform };
        this.storeLayerParams(layer);
        this.buildControls();
        this.app.regen();
        this.updateFormula();
      };
      const randomBtn = document.createElement('button');
      randomBtn.type = 'button';
      randomBtn.className =
        'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-muted transition-colors';
      randomBtn.textContent = 'Randomize Params';
      randomBtn.onclick = () => {
        const l = this.app.engine.getActiveLayer();
        if (!l) return;
        if (this.app.pushHistory) this.app.pushHistory();
        this.randomizeLayerParams(l);
        this.storeLayerParams(l);
        this.app.regen();
        this.recenterLayerIfNeeded(l);
        this.app.render();
        this.buildControls();
        this.updateFormula();
      };
      resetWrap.appendChild(resetBtn);
      resetWrap.appendChild(randomBtn);
      if (!isGroup) container.appendChild(resetWrap);

      const getDefaultValue = (def) => {
        const defaults = (ALGO_DEFAULTS && ALGO_DEFAULTS[layer.type]) || {};
        if (def.type === 'rangeDual') {
          if (
            Object.prototype.hasOwnProperty.call(defaults, def.minKey) &&
            Object.prototype.hasOwnProperty.call(defaults, def.maxKey)
          ) {
            return { min: defaults[def.minKey], max: defaults[def.maxKey] };
          }
          return null;
        }
        if (def.id && Object.prototype.hasOwnProperty.call(defaults, def.id)) {
          return defaults[def.id];
        }
        if (def.default !== undefined) return def.default;
        return null;
      };

      const valueEditorMap = new WeakMap();
      const collectValueChips = () =>
        Array.from(container.querySelectorAll('.value-chip')).filter((chip) => chip.offsetParent !== null);

      const openInlineEditor = (opts) => {
        const { def, valueEl, getValue, setValue, parseValue, formatValue } = opts;
        if (!valueEl) return;
        const { min, max, unit, step, precision } = getDisplayConfig(def);
        const parent = valueEl;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-value-input';
        const currentValue = getValue ? getValue() : 0;
        const displayValue = formatValue ? formatValue(currentValue) : formatDisplayValue(def, currentValue);
        input.value = `${displayValue}`.replace(unit, '').trim();
        const prevPosition = parent.style.position;
        const prevColor = parent.style.color;
        const prevShadow = parent.style.textShadow;
        const prevWidth = parent.style.width;
        const prevMinWidth = parent.style.minWidth;
        const prevFlex = parent.style.flex;
        if (!prevPosition || prevPosition === 'static') parent.style.position = 'relative';
        input.style.left = '0';
        input.style.top = '0';
        input.style.width = '100%';
        input.style.height = '100%';
        parent.appendChild(input);
        parent.style.color = 'transparent';
        parent.style.textShadow = 'none';
        parent.style.flex = '0 0 auto';
        input.focus();
        input.select();

        const growToFit = () => {
          input.style.width = 'auto';
          const padding = 14;
          const desired = Math.max(parent.offsetWidth, input.scrollWidth + padding);
          parent.style.minWidth = `${desired}px`;
          parent.style.width = `${desired}px`;
          input.style.width = '100%';
        };

        growToFit();

        let closed = false;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (input.parentElement) input.parentElement.removeChild(input);
          parent.style.color = prevColor;
          parent.style.textShadow = prevShadow;
          parent.style.width = prevWidth;
          parent.style.minWidth = prevMinWidth;
          parent.style.flex = prevFlex;
          if (!prevPosition || prevPosition === 'static') parent.style.position = '';
        };

        const apply = () => {
          const raw = input.value.trim().replace(unit, '');
          if (parseValue) {
            const parsed = parseValue(raw);
            if (!parsed) {
              this.showValueError(raw);
              return false;
            }
            setValue(parsed, { commit: true });
            return true;
          }
          const parsed = Number.parseFloat(raw);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
            this.showValueError(`${raw}${unit}`);
            return false;
          }
          setValue(parsed, { commit: true });
          return true;
        };

        const openNeighbor = (dir) => {
          const chips = collectValueChips();
          const idx = chips.indexOf(valueEl);
          if (idx === -1) return;
          const next = chips[idx + dir];
          if (!next) return;
          const nextOpts = valueEditorMap.get(next);
          if (!nextOpts) return;
          window.requestAnimationFrame(() => openInlineEditor({ ...nextOpts, valueEl: next }));
        };

        const nudge = (direction, multiplier = 1) => {
          const numericStep = Number.isFinite(step) && step > 0 ? step : 1;
          const delta = numericStep * multiplier * direction;
          const current = Number.parseFloat(input.value);
          if (!Number.isFinite(current)) return;
          const next = clamp(current + delta, min, max);
          const factor = Math.pow(10, precision);
          const displayValue = Math.round(next * factor) / factor;
          input.value = `${displayValue}`;
          if (parseValue) return;
          setValue(displayValue, { commit: false, live: true });
        };

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const ok = apply();
            cleanup();
            if (!ok) return;
            return;
          }
          if (e.key === 'Escape') {
            cleanup();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const ok = apply();
            cleanup();
            if (ok) openNeighbor(e.shiftKey ? -1 : 1);
            return;
          }
          if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
            e.preventDefault();
            if (parseValue) return;
            const direction = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1;
            const mult = e.shiftKey ? 10 : 1;
            nudge(direction, mult);
          }
        });
        input.addEventListener('input', () => {
          growToFit();
        });
        input.addEventListener('blur', () => {
          if (!apply()) {
            cleanup();
            return;
          }
          cleanup();
        });
      };

      const attachValueEditor = (opts) => {
        const { valueEl } = opts;
        if (!valueEl) return;
        valueEditorMap.set(valueEl, opts);
        valueEl.ondblclick = (e) => {
          e.preventDefault();
          openInlineEditor({ ...opts, valueEl });
        };
      };

      const globalSection = document.createElement('div');
      globalSection.className = 'global-section';
      globalSection.classList.toggle('collapsed', this.globalSectionCollapsed);
      const globalHeader = document.createElement('button');
      globalHeader.type = 'button';
      globalHeader.className = 'global-section-header';
      globalHeader.innerHTML = `
        <span class="global-section-title">Post-Processing Lab</span>
        <span class="global-section-toggle" aria-hidden="true"></span>
      `;
      const globalBody = document.createElement('div');
      globalBody.className = 'global-section-body';
      if (this.globalSectionCollapsed) globalBody.style.display = 'none';
      globalHeader.onclick = () => {
        this.globalSectionCollapsed = !this.globalSectionCollapsed;
        globalSection.classList.toggle('collapsed', this.globalSectionCollapsed);
        globalBody.style.display = this.globalSectionCollapsed ? 'none' : '';
      };
      globalSection.appendChild(globalHeader);
      globalSection.appendChild(globalBody);

      const inlineGroups = new Map();
      const getInlineGroup = (key) => {
        if (!inlineGroups.has(key)) {
          const row = document.createElement('div');
          row.className = 'control-inline-row';
          container.appendChild(row);
          inlineGroups.set(key, row);
        }
        return inlineGroups.get(key);
      };

      const basePendulumTemplate = {
        enabled: true,
        ampX: 100,
        ampY: 100,
        phaseX: 0,
        phaseY: 0,
        freq: 2,
        micro: 0,
        damp: 0.002,
      };
      const pendulumTemplates = ((ALGO_DEFAULTS?.harmonograph?.pendulums || []).map((pend, idx) => ({
        ...basePendulumTemplate,
        ...clone(pend),
        id: pend.id || `pend-${idx + 1}`,
        enabled: pend.enabled !== false,
      })) || []);
      const getPendulumDefault = (index, key) => {
        const template =
          pendulumTemplates[index] || pendulumTemplates[pendulumTemplates.length - 1] || basePendulumTemplate;
        return template[key] !== undefined ? template[key] : basePendulumTemplate[key];
      };
      const ensurePendulums = () => {
        let pendulums = layer.params.pendulums;
        if (!Array.isArray(pendulums) || !pendulums.length) {
          const legacy = [];
          for (let i = 1; i <= 3; i += 1) {
            const ampX = layer.params[`ampX${i}`];
            const ampY = layer.params[`ampY${i}`];
            if (ampX === undefined && ampY === undefined) continue;
            legacy.push({
              id: `pend-${i}`,
              enabled: true,
              ampX: ampX ?? basePendulumTemplate.ampX,
              ampY: ampY ?? basePendulumTemplate.ampY,
              phaseX: layer.params[`phaseX${i}`] ?? basePendulumTemplate.phaseX,
              phaseY: layer.params[`phaseY${i}`] ?? basePendulumTemplate.phaseY,
              freq: layer.params[`freq${i}`] ?? basePendulumTemplate.freq,
              micro: layer.params[`micro${i}`] ?? basePendulumTemplate.micro,
              damp: layer.params[`damp${i}`] ?? basePendulumTemplate.damp,
            });
          }
          pendulums = legacy.length ? legacy : clone(pendulumTemplates);
          layer.params.pendulums = pendulums;
        }
        pendulums = pendulums.map((pend, idx) => ({
          ...basePendulumTemplate,
          ...(pend || {}),
          id: pend?.id || `pend-${idx + 1}`,
          enabled: pend?.enabled !== false,
        }));
        layer.params.pendulums = pendulums;
        return pendulums;
      };
      const createPendulum = (index) => {
        const template =
          pendulumTemplates[index] || pendulumTemplates[pendulumTemplates.length - 1] || basePendulumTemplate;
        return {
          ...clone(template),
          id: `pend-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          enabled: true,
        };
      };
      const pendulumParamDefs = [
        { key: 'ampX', label: 'Amplitude X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampX' },
        { key: 'ampY', label: 'Amplitude Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'harmonograph.ampY' },
        {
          key: 'phaseX',
          label: 'Phase X',
          type: 'angle',
          min: 0,
          max: 360,
          step: 1,
          displayUnit: '°',
          infoKey: 'harmonograph.phaseX',
        },
        {
          key: 'phaseY',
          label: 'Phase Y',
          type: 'angle',
          min: 0,
          max: 360,
          step: 1,
          displayUnit: '°',
          infoKey: 'harmonograph.phaseY',
        },
        { key: 'freq', label: 'Frequency', type: 'range', min: 0.5, max: 8, step: 0.01, infoKey: 'harmonograph.freq' },
        { key: 'micro', label: 'Micro Tuning', type: 'range', min: -0.2, max: 0.2, step: 0.001, infoKey: 'harmonograph.micro' },
        { key: 'damp', label: 'Damping', type: 'range', min: 0, max: 0.02, step: 0.0005, infoKey: 'harmonograph.damp' },
      ];

      const maybeRebuildControls = () => {
        if (hasConditionalDefs) this.buildControls();
      };

      const maybeRebuildNoiseControls = () => {
        if (hasNoiseConditional) this.buildControls();
      };

      const renderDef = (def, targetEl) => {
        const target = targetEl || container;
        if (def.showIf && !def.showIf(layer.params)) return;
        if (def.type === 'section') {
          const section = document.createElement('div');
          section.className = 'control-section';
          section.innerHTML = `<div class="control-section-title">${def.label}</div>`;
          target.appendChild(section);
          return;
        }
        if (def.type === 'svgImportButton') {
          const wrap = document.createElement('div');
          wrap.className = 'mb-4';
          const nameEl = document.createElement('div');
          nameEl.className = 'text-[11px] text-vectura-muted mb-2';
          nameEl.textContent = layer.params.svgName
            ? `Loaded: ${layer.params.svgName}`
            : 'No SVG loaded';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors';
          btn.textContent = layer.params.svgName ? 'Replace SVG…' : 'Import SVG…';
          btn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.svg,image/svg+xml';
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const groups = this.parseSvgToLayerGroups(reader.result);
                if (!groups.length) {
                  this.openModal({ title: 'No Paths Found', body: '<p class="modal-text">The SVG contained no vector paths.</p>' });
                  return;
                }
                if (this.app.pushHistory) this.app.pushHistory();
                layer.params.importedGroups = groups.map((g) => ({
                  name: g.name,
                  paths: g.paths,
                  isClosed: g.isClosed || false,
                  originalFill: g.originalFill || null,
                }));
                layer.params.svgName = file.name;
                this.storeLayerParams(layer);
                this.app.engine.generate(layer.id);
                this.buildControls();
                this.updateFormula();
                this.app.render();
              };
              reader.readAsText(file);
            };
            input.click();
          };
          wrap.appendChild(nameEl);
          wrap.appendChild(btn);
          target.appendChild(wrap);
          return;
        }
        if (def.type === 'petalDesignerInline') {
          if (!isPetalisLayerType(layer.type)) return;
          const wrapper = document.createElement('div');
          wrapper.className = 'petal-designer-inline-wrap mb-4';
          target.appendChild(wrapper);
          this.mountInlinePetalisDesigner(layer, wrapper);
          return;
        }
        if (def.type === 'actionButton') {
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const wrapper = document.createElement('div');
          wrapper.className = 'mb-4';
          wrapper.innerHTML = `
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
            </div>
            <button type="button" class="w-full text-xs border border-vectura-border px-2 py-2 hover:bg-vectura-border text-vectura-accent transition-colors">
              ${def.buttonLabel || def.label}
            </button>
          `;
          const btn = wrapper.querySelector('button');
          if (btn) {
            btn.onclick = () => {
              if (def.action === 'setLightSource') {
                this.startLightSourcePlacement();
              } else if (typeof def.onClick === 'function') {
                def.onClick();
              }
            };
          }
          target.appendChild(wrapper);
          return;
        }
        if (def.type === 'patternSelect') {
          const wrapper = document.createElement('div');
          wrapper.className = 'mb-4';
          const registry = window.Vectura?.PatternRegistry;
          const allBundled = (window.Vectura?.BUNDLED_PATTERNS || window.Vectura?.PATTERNS || []).filter((p) => !p.custom);
          const userPatterns = registry?.getCustomPatterns?.() || [];
          const currentId = layer.params.patternId || '';
          let activeTab = userPatterns.some((p) => p.id === currentId) ? 'user' : 'default';

          const injectSvgPreview = (item, meta) => {
            if (!meta?.svg) return;
            const parser = new DOMParser();
            const doc = parser.parseFromString(meta.svg, 'image/svg+xml');
            const svg = doc.querySelector('svg');
            if (!svg) return;
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.maxHeight = '24px';
            svg.querySelectorAll('*').forEach((el) => {
              if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') el.setAttribute('stroke', 'currentColor');
              if (el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') el.setAttribute('fill', 'currentColor');
              if (el.style.stroke && el.style.stroke !== 'none') el.style.stroke = 'currentColor';
              if (el.style.fill && el.style.fill !== 'none') el.style.fill = 'currentColor';
            });
            const cont = document.createElement('div');
            cont.className = 'w-full px-2 text-vectura-text opacity-80';
            cont.appendChild(svg);
            item.insertBefore(cont, item.firstChild);
          };

          const renderPicker = () => {
            const patterns = activeTab === 'user' ? userPatterns : allBundled;
            const tabBar = `
              <div class="flex gap-0 mb-2 border-b border-vectura-border">
                <button type="button" data-ps-tab="default"
                  class="text-[10px] px-2 py-1 border-b-2 transition-colors ${activeTab === 'default' ? 'border-vectura-accent text-vectura-accent' : 'border-transparent text-vectura-muted hover:text-vectura-text'}">
                  Default
                </button>
                <button type="button" data-ps-tab="user"
                  class="text-[10px] px-2 py-1 border-b-2 transition-colors ${activeTab === 'user' ? 'border-vectura-accent text-vectura-accent' : 'border-transparent text-vectura-muted hover:text-vectura-text'}">
                  User Patterns${userPatterns.length ? ` (${userPatterns.length})` : ''}
                </button>
              </div>`;
            let gridHtml = `<div class="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 bg-vectura-bg border border-vectura-border" data-pattern-grid>`;
            if (patterns.length) {
              patterns.forEach((p) => {
                const isSel = layer.params.patternId === p.id;
                const selC = isSel ? 'border-vectura-accent bg-vectura-border opacity-100' : 'border-transparent opacity-60 hover:opacity-100';
                const dotHtml = p.custom ? `<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-400" title="Stored in browser localStorage"></span>` : '';
                gridHtml += `<div class="pattern-item relative cursor-pointer border rounded flex flex-col items-center justify-center pt-2 ${selC}" data-id="${p.id}" title="${p.name}">${dotHtml}
                  <div class="w-full text-[9px] text-center truncate px-1 pb-1 pt-1 text-vectura-muted leading-tight">${p.name}</div>
                </div>`;
              });
            } else {
              gridHtml += `<div class="col-span-4 text-[10px] text-vectura-muted py-2 text-center">No patterns yet. Use Save Pattern to add one.</div>`;
            }
            gridHtml += `</div>`;
            wrapper.innerHTML = tabBar + gridHtml;

            wrapper.querySelectorAll('[data-ps-tab]').forEach((btn) => {
              btn.addEventListener('click', () => {
                activeTab = btn.dataset.psTab;
                renderPicker();
              });
            });

            wrapper.querySelectorAll('.pattern-item[data-id]').forEach((item) => {
              const pId = item.dataset.id;
              const meta = patterns.find((x) => x.id === pId);
              injectSvgPreview(item, meta);
              item.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                layer.params.patternId = item.dataset.id;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            });
          };

          renderPicker();
          target.appendChild(wrapper);
          return;
        }
        if (def.type === 'patternDesignerInline') {
          const wrapper = document.createElement('div');
          wrapper.className = 'pattern-designer-inline-wrap mt-3';
          target.appendChild(wrapper);
          this.mountInlinePatternDesigner(layer, wrapper);
          return;
        }
        if (def.type === 'patternSubPens') {
           const patData = window.Vectura.AlgorithmRegistry?.patternGetGroups?.(layer.params.patternId);
           if (!patData || !patData.groups || patData.groups.length === 0) return;
           
           const wrapper = document.createElement('div');
           wrapper.className = 'mt-4 border-t border-vectura-border pt-4';
           const header = document.createElement('label');
           header.className = 'control-label mb-2 block';
           header.textContent = 'Element Pen Mapping';
           wrapper.appendChild(header);
           
           const pens = SETTINGS.pens || [];
           patData.groups.forEach(g => {
              const currentPenId = layer.params.penMapping?.[g.id] || 'default';
              const row = document.createElement('div');
              row.className = 'flex items-center justify-between mb-2';
              row.innerHTML = `<span class="text-[11px] text-vectura-muted">${g.label}</span>
                 <select class="w-32 bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none focus:border-vectura-accent" data-gid="${g.id}">
                    <option value="default">Layer Pen</option>
                    ${pens.map(pen => `<option value="${escapeHtml(pen.id)}" ${currentPenId === pen.id ? 'selected' : ''}>${escapeHtml(pen.name || pen.id)}</option>`).join('')}
                 </select>
              `;
              const sel = row.querySelector('select');
              sel.onchange = (e) => {
                 if (this.app.pushHistory) this.app.pushHistory();
                 if (!layer.params.penMapping) layer.params.penMapping = {};
                 layer.params.penMapping[e.target.dataset.gid] = e.target.value === 'default' ? null : e.target.value;
                 this.storeLayerParams(layer);
                 this.app.regen();
                 this.buildControls();
              };
              wrapper.appendChild(row);
           });
           
           target.appendChild(wrapper);
           return;
        }
        if (def.type === 'image') {
          const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
          const div = document.createElement('div');
          div.className = 'mb-4';
          const idKey = def.idKey || `${def.id || 'image'}Id`;
          const nameKey = def.nameKey || `${def.id || 'image'}Name`;
          const name = layer.params[nameKey] || 'No file selected';
          div.innerHTML = `
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="text-[10px] text-vectura-muted hover:text-vectura-accent file-clear">Clear</button>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="noise-image-btn text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
                Select Image
              </button>
              <span class="text-[10px] text-vectura-muted file-name truncate">${name}</span>
            </div>
          `;
          const openBtn = div.querySelector('.noise-image-btn');
          const nameEl = div.querySelector('.file-name');
          const clearBtn = div.querySelector('.file-clear');
          if (clearBtn) {
            clearBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[idKey] = '';
              layer.params[nameKey] = '';
              if (nameEl) nameEl.textContent = 'No file selected';
              this.app.regen();
              this.app.render();
              maybeRebuildControls();
            };
          }
          if (openBtn) {
            openBtn.onclick = () =>
              this.openNoiseImageModal(layer, {
                nameEl,
                accept: def.accept,
                idKey,
                nameKey,
                title: def.modalTitle,
                label: def.modalLabel,
                description: def.modalDescription,
                dropLabel: def.dropLabel,
              });
          }
          target.appendChild(div);
          return;
        }
        if (def.type === 'pendulumList') {
          const pendulums = ensurePendulums();
          const list = document.createElement('div');
          list.className = 'pendulum-list mb-4';
          const header = document.createElement('div');
          header.className = 'pendulum-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Pendulums</span>
            <button type="button" class="pendulum-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Pendulum
            </button>
          `;
          const addBtn = header.querySelector('.pendulum-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              pendulums.push(createPendulum(pendulums.length));
              layer.params.pendulums = pendulums;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const buildRangeControl = (pendulum, def, idx) => {
            const control = document.createElement('div');
            control.className = 'pendulum-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            const value = pendulum[def.key] ?? getPendulumDefault(idx, def.key);
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
            `;
            const input = control.querySelector('input');
            const valueBtn = control.querySelector('.value-chip');
            const resetValue = () => {
              const nextVal = getPendulumDefault(idx, def.key);
              if (nextVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              pendulum[def.key] = nextVal;
              if (input) input.value = toDisplayValue(def, nextVal);
              if (valueBtn) valueBtn.innerText = formatDisplayValue(def, nextVal);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            if (input && valueBtn) {
              input.disabled = !pendulum.enabled;
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                pendulum[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                pendulum[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                resetValue();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                getValue: () => pendulum[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  pendulum[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, pendulum[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const buildAngleControl = (pendulum, def, idx) => {
            const control = document.createElement('div');
            control.className = 'pendulum-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            const value = pendulum[def.key] ?? getPendulumDefault(idx, def.key);
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = clamp(toDisplayValue(def, value), min, max);
            control.innerHTML = `
              <div class="angle-label">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <div class="angle-control">
                <div class="angle-dial" style="--angle:${displayVal}deg;">
                  <div class="angle-indicator"></div>
                </div>
              </div>
            `;
            const dial = control.querySelector('.angle-dial');
            const valueBtn = control.querySelector('.value-chip');
            let lastDisplay = displayVal;
            const setAngle = (nextDisplay, commit = false) => {
              const clamped = clamp(roundToStep(nextDisplay, step), min, max);
              lastDisplay = clamped;
              if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
              if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
              if (commit) {
                if (this.app.pushHistory) this.app.pushHistory();
                pendulum[def.key] = fromDisplayValue(def, clamped);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              }
            };
            const resetAngle = () => {
              const nextVal = getPendulumDefault(idx, def.key);
              if (nextVal === undefined) return;
              setAngle(toDisplayValue(def, nextVal), true);
            };
            if (dial) {
              dial.classList.toggle('angle-disabled', !pendulum.enabled);
              dial.addEventListener('mousedown', (e) => {
                if (!pendulum.enabled) return;
                e.preventDefault();
                const updateFromEvent = (ev) => {
                  const rect = dial.getBoundingClientRect();
                  const cx = rect.left + rect.width / 2;
                  const cy = rect.top + rect.height / 2;
                  const dx = ev.clientX - cx;
                  const dy = ev.clientY - cy;
                  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
                  if (deg < 0) deg += 360;
                  setAngle(deg, false);
                };
                updateFromEvent(e);
                const move = (ev) => updateFromEvent(ev);
                const up = () => {
                  window.removeEventListener('mousemove', move);
                  setAngle(lastDisplay, true);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up, { once: true });
              });
              dial.addEventListener('dblclick', (e) => {
                e.preventDefault();
                resetAngle();
              });
            }
            if (valueBtn) {
              valueBtn.classList.toggle('opacity-60', !pendulum.enabled);
              attachValueEditor({
                def,
                valueEl: valueBtn,
                getValue: () => pendulum[def.key],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                setAngle(displayVal, commit);
              },
              });
            }
            return control;
          };

          pendulums.forEach((pendulum, idx) => {
            const card = document.createElement('div');
            card.className = `pendulum-card${pendulum.enabled ? '' : ' pendulum-disabled'}`;
            const headerRow = document.createElement('div');
            headerRow.className = 'pendulum-header';
            headerRow.innerHTML = `
              <label class="pendulum-title">Pendulum ${idx + 1}</label>
              <div class="pendulum-actions">
                <label class="pendulum-toggle">
                  <input type="checkbox" ${pendulum.enabled ? 'checked' : ''}>
                  <span>Active</span>
                </label>
                <button type="button" class="pendulum-delete" aria-label="Delete pendulum">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('input');
            const deleteBtn = headerRow.querySelector('.pendulum-delete');
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                pendulum.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (pendulums.length <= 1) {
                  this.openModal({
                    title: 'Pendulum Required',
                    body: `<p class="modal-text">Keep at least one pendulum active in the harmonograph.</p>`,
                  });
                  return;
                }
                if (this.app.pushHistory) this.app.pushHistory();
                pendulums.splice(idx, 1);
                layer.params.pendulums = pendulums;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);
            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            pendulumParamDefs.forEach((pDef) => {
              controls.appendChild(
                pDef.type === 'angle'
                  ? buildAngleControl(pendulum, pDef, idx)
                  : buildRangeControl(pendulum, pDef, idx)
              );
            });
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'harmonographPlotter') {
          if (layer.type !== 'harmonograph') return;
          this.mountHarmonographPlotter(layer, target);
          return;
        }
        if (def.type === 'modifierList') {
          if (!isPetalisLayerType(layer.type)) return;
          const modifiers = Array.isArray(layer.params.centerModifiers) ? layer.params.centerModifiers : [];
          layer.params.centerModifiers = modifiers;

          const list = document.createElement('div');
          list.className = 'noise-list mb-4';
          const header = document.createElement('div');
          header.className = 'noise-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${def.label || 'Center Modifiers'}</span>
            <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Modifier
            </button>
          `;
          const addBtn = header.querySelector('.noise-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifiers.push(createPetalisModifier('ripple'));
              layer.params.centerModifiers = modifiers;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const modifierGripMarkup = `
            <button class="noise-grip" type="button" aria-label="Reorder modifier">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
          `;

          const getModifierType = (type) =>
            PETALIS_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_MODIFIER_TYPES[0];

          const buildModifierRangeControl = (modifier, def) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const value = modifier[def.key] ?? def.min ?? 0;
            if (modifier[def.key] === undefined) modifier[def.key] = value;
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            `;
            const input = control.querySelector('input[type="range"]');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            if (input && valueBtn) {
              input.disabled = !modifier.enabled;
              valueBtn.classList.toggle('opacity-60', !modifier.enabled);
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                modifier[def.key] = def.min ?? 0;
                input.value = toDisplayValue(def, modifier[def.key]);
                valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                inputEl: valueInput,
                getValue: () => modifier[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  modifier[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const bindModifierReorderGrip = (grip, card, modifier) => {
            if (!grip) return;
            grip.onmousedown = (e) => {
              e.preventDefault();
              const dragEl = card;
              dragEl.classList.add('dragging');
              const indicator = document.createElement('div');
              indicator.className = 'noise-drop-indicator';
              list.insertBefore(indicator, dragEl.nextSibling);
              const currentOrder = modifiers.map((item) => item.id);
              const startIndex = currentOrder.indexOf(modifier.id);

              const onMove = (ev) => {
                const y = ev.clientY;
                const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
                let inserted = false;
                for (const item of items) {
                  const rect = item.getBoundingClientRect();
                  if (y < rect.top + rect.height / 2) {
                    list.insertBefore(indicator, item);
                    inserted = true;
                    break;
                  }
                }
                if (!inserted) list.appendChild(indicator);
              };

              const onUp = () => {
                dragEl.classList.remove('dragging');
                const siblings = Array.from(list.children);
                const indicatorIndex = siblings.indexOf(indicator);
                const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
                const newIndex = before.length;
                indicator.remove();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                if (newIndex !== startIndex) {
                  const nextOrder = currentOrder.filter((id) => id !== modifier.id);
                  nextOrder.splice(newIndex, 0, modifier.id);
                  const map = new Map(modifiers.map((item) => [item.id, item]));
                  layer.params.centerModifiers = nextOrder.map((id) => map.get(id)).filter(Boolean);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                }
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };
          };

          modifiers.forEach((modifier, idx) => {
            if (!modifier.id) modifier.id = `mod-${idx + 1}`;
            const card = document.createElement('div');
            card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
            card.dataset.modifierId = modifier.id;
            const headerRow = document.createElement('div');
            headerRow.className = 'noise-header';
            headerRow.innerHTML = `
              <div class="flex items-center gap-2">
                ${modifierGripMarkup}
                <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
              </div>
              <div class="noise-actions">
                <label class="noise-toggle">
                  <input type="checkbox" ${modifier.enabled ? 'checked' : ''}>
                </label>
                <button type="button" class="noise-delete" aria-label="Delete modifier">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('.noise-toggle input');
            const deleteBtn = headerRow.querySelector('.noise-delete');
            const grip = headerRow.querySelector('.noise-grip');
            bindModifierReorderGrip(grip, card, modifier);
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                modifier.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                const index = modifiers.findIndex((item) => item.id === modifier.id);
                if (index >= 0) modifiers.splice(index, 1);
                layer.params.centerModifiers = modifiers;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);

            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            const typeDef = getModifierType(modifier.type);
            const typeSelect = document.createElement('div');
            typeSelect.className = 'noise-control';
            const optionsHtml = PETALIS_MODIFIER_TYPES.map(
              (opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            const typeInfoBtn = `<button type="button" class="info-btn" data-info="petalis.centerModType">i</button>`;
            typeSelect.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">Modifier Type</label>
                  ${typeInfoBtn}
                </div>
                <span class="text-xs text-vectura-accent font-mono">${typeDef.label}</span>
              </div>
              <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
                ${optionsHtml}
              </select>
            `;
            const select = typeSelect.querySelector('select');
            const label = typeSelect.querySelector('span');
            if (select && label) {
              select.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextType = e.target.value;
                const next = { ...createPetalisModifier(nextType), id: modifier.id, enabled: modifier.enabled };
                Object.assign(modifier, next);
                label.textContent = getModifierType(nextType).label;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            controls.appendChild(typeSelect);
            typeDef.controls.forEach((cDef) => {
              controls.appendChild(buildModifierRangeControl(modifier, cDef));
            });
            if (this.isPetalisNoiseModifier(modifier)) {
              this.mountPetalisModifierNoiseRack(layer, controls, modifier, { label: 'Noise Rack' });
            }
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'petalModifierList') {
          if (!isPetalisLayerType(layer.type)) return;
          const modifiers = Array.isArray(layer.params.petalModifiers) ? layer.params.petalModifiers : [];
          layer.params.petalModifiers = modifiers;

          const list = document.createElement('div');
          list.className = 'noise-list mb-4';
          const header = document.createElement('div');
          header.className = 'noise-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${def.label || 'Petal Modifiers'}</span>
            <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Modifier
            </button>
          `;
          const addBtn = header.querySelector('.noise-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              modifiers.push(createPetalModifier('ripple'));
              layer.params.petalModifiers = modifiers;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const modifierGripMarkup = `
            <button class="noise-grip" type="button" aria-label="Reorder modifier">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
          `;

          const getModifierType = (type) =>
            PETALIS_PETAL_MODIFIER_TYPES.find((opt) => opt.value === type) || PETALIS_PETAL_MODIFIER_TYPES[0];

          const buildModifierRangeControl = (modifier, def) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const value = modifier[def.key] ?? def.min ?? 0;
            if (modifier[def.key] === undefined) modifier[def.key] = value;
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            `;
            const input = control.querySelector('input[type="range"]');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            if (input && valueBtn) {
              input.disabled = !modifier.enabled;
              valueBtn.classList.toggle('opacity-60', !modifier.enabled);
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                modifier[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                modifier[def.key] = def.min ?? 0;
                input.value = toDisplayValue(def, modifier[def.key]);
                valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                inputEl: valueInput,
                getValue: () => modifier[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  modifier[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, modifier[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const bindModifierReorderGrip = (grip, card, modifier) => {
            if (!grip) return;
            grip.onmousedown = (e) => {
              e.preventDefault();
              const dragEl = card;
              dragEl.classList.add('dragging');
              const indicator = document.createElement('div');
              indicator.className = 'noise-drop-indicator';
              list.insertBefore(indicator, dragEl.nextSibling);
              const currentOrder = modifiers.map((item) => item.id);
              const startIndex = currentOrder.indexOf(modifier.id);

              const onMove = (ev) => {
                const y = ev.clientY;
                const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
                let inserted = false;
                for (const item of items) {
                  const rect = item.getBoundingClientRect();
                  if (y < rect.top + rect.height / 2) {
                    list.insertBefore(indicator, item);
                    inserted = true;
                    break;
                  }
                }
                if (!inserted) list.appendChild(indicator);
              };

              const onUp = () => {
                dragEl.classList.remove('dragging');
                const siblings = Array.from(list.children);
                const indicatorIndex = siblings.indexOf(indicator);
                const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
                const newIndex = before.length;
                indicator.remove();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                if (newIndex !== startIndex) {
                  const nextOrder = currentOrder.filter((id) => id !== modifier.id);
                  nextOrder.splice(newIndex, 0, modifier.id);
                  const map = new Map(modifiers.map((item) => [item.id, item]));
                  layer.params.petalModifiers = nextOrder.map((id) => map.get(id)).filter(Boolean);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                }
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };
          };

          modifiers.forEach((modifier, idx) => {
            if (!modifier.id) modifier.id = `petal-${idx + 1}`;
            const card = document.createElement('div');
            card.className = `noise-card${modifier.enabled ? '' : ' noise-disabled'}`;
            card.dataset.modifierId = modifier.id;
            const headerRow = document.createElement('div');
            headerRow.className = 'noise-header';
            headerRow.innerHTML = `
              <div class="flex items-center gap-2">
                ${modifierGripMarkup}
                <span class="noise-title">Modifier ${String(idx + 1).padStart(2, '0')}</span>
              </div>
              <div class="noise-actions">
                <label class="noise-toggle">
                  <input type="checkbox" ${modifier.enabled ? 'checked' : ''}>
                </label>
                <button type="button" class="noise-delete" aria-label="Delete modifier">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('.noise-toggle input');
            const deleteBtn = headerRow.querySelector('.noise-delete');
            const grip = headerRow.querySelector('.noise-grip');
            bindModifierReorderGrip(grip, card, modifier);
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                modifier.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                const index = modifiers.findIndex((item) => item.id === modifier.id);
                if (index >= 0) modifiers.splice(index, 1);
                layer.params.petalModifiers = modifiers;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);

            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            const typeDef = getModifierType(modifier.type);
            const typeSelect = document.createElement('div');
            typeSelect.className = 'noise-control';
            const optionsHtml = PETALIS_PETAL_MODIFIER_TYPES.map(
              (opt) => `<option value="${opt.value}" ${modifier.type === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('');
            const typeInfoBtn = `<button type="button" class="info-btn" data-info="petalis.petalModType">i</button>`;
            typeSelect.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">Modifier Type</label>
                  ${typeInfoBtn}
                </div>
                <span class="text-xs text-vectura-accent font-mono">${typeDef.label}</span>
              </div>
              <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
                ${optionsHtml}
              </select>
            `;
            const select = typeSelect.querySelector('select');
            const label = typeSelect.querySelector('span');
            if (select && label) {
              select.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextType = e.target.value;
                const next = { ...createPetalModifier(nextType), id: modifier.id, enabled: modifier.enabled };
                Object.assign(modifier, next);
                label.textContent = getModifierType(nextType).label;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            controls.appendChild(typeSelect);
            typeDef.controls.forEach((cDef) => {
              controls.appendChild(buildModifierRangeControl(modifier, cDef));
            });
            if (this.isPetalisNoiseModifier(modifier)) {
              this.mountPetalisModifierNoiseRack(layer, controls, modifier, { label: 'Noise Rack' });
            }
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'shadingList') {
          if (!isPetalisLayerType(layer.type)) return;
          const shadings = Array.isArray(layer.params.shadings) ? layer.params.shadings : [];
          layer.params.shadings = shadings;

          const list = document.createElement('div');
          list.className = 'noise-list mb-4';
          const header = document.createElement('div');
          header.className = 'noise-list-header';
          header.innerHTML = `
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">${def.label || 'Shading Stack'}</span>
            <button type="button" class="noise-add text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors">
              + Add Shading
            </button>
          `;
          const addBtn = header.querySelector('.noise-add');
          if (addBtn) {
            addBtn.onclick = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              shadings.push(createPetalisShading('radial'));
              layer.params.shadings = shadings;
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
            };
          }
          list.appendChild(header);

          const shadingGripMarkup = `
            <button class="noise-grip" type="button" aria-label="Reorder shading">
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
              <span class="dot"></span><span class="dot"></span>
            </button>
          `;

          const getShadingType = (type) =>
            PETALIS_SHADING_TYPES.find((opt) => opt.value === type) || PETALIS_SHADING_TYPES[0];

          const buildShadingRangeControl = (shade, def) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const value = shade[def.key] ?? def.min ?? 0;
            if (shade[def.key] === undefined) shade[def.key] = value;
            const { min, max, step } = getDisplayConfig(def);
            const displayVal = toDisplayValue(def, value);
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                  def,
                  value
                )}</button>
              </div>
              <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            `;
            const input = control.querySelector('input[type="range"]');
            const valueBtn = control.querySelector('.value-chip');
            const valueInput = control.querySelector('.value-input');
            if (input && valueBtn) {
              input.disabled = !shade.enabled;
              valueBtn.classList.toggle('opacity-60', !shade.enabled);
              input.oninput = (e) => {
                const nextDisplay = parseFloat(e.target.value);
                valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
              };
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                const nextDisplay = parseFloat(e.target.value);
                shade[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
              attachKeyboardRangeNudge(input, (nextDisplay) => {
                shade[def.key] = fromDisplayValue(def, nextDisplay);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              input.addEventListener('dblclick', (e) => {
                e.preventDefault();
                shade[def.key] = def.min ?? 0;
                input.value = toDisplayValue(def, shade[def.key]);
                valueBtn.innerText = formatDisplayValue(def, shade[def.key]);
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              });
              attachValueEditor({
                def,
                valueEl: valueBtn,
                inputEl: valueInput,
                getValue: () => shade[def.key],
                setValue: (displayVal, opts) => {
                  const commit = opts?.commit !== false;
                  if (commit && this.app.pushHistory) this.app.pushHistory();
                  shade[def.key] = fromDisplayValue(def, displayVal);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  valueBtn.innerText = formatDisplayValue(def, shade[def.key]);
                  this.updateFormula();
                },
              });
            }
            return control;
          };

          const buildShadingSelect = (shade, def, options) => {
            const control = document.createElement('div');
            control.className = 'noise-control';
            const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
            let value = shade[def.key];
            if (value === undefined || value === null) {
              value = options[0]?.value;
              shade[def.key] = value;
            }
            const optionsHtml = options
              .map(
                (opt) => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`
              )
              .join('');
            const currentLabel = options.find((opt) => opt.value === value)?.label || value;
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <div class="flex items-center gap-2">
                  <label class="control-label mb-0">${def.label}</label>
                  ${infoBtn}
                </div>
                <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
              </div>
              <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
                ${optionsHtml}
              </select>
            `;
            const input = control.querySelector('select');
            const span = control.querySelector('span');
            if (input && span) {
              input.disabled = !shade.enabled;
              input.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                shade[def.key] = e.target.value;
                span.textContent = options.find((opt) => opt.value === shade[def.key])?.label || shade[def.key];
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              };
            }
            return control;
          };

          const bindShadingReorderGrip = (grip, card, shading) => {
            if (!grip) return;
            grip.onmousedown = (e) => {
              e.preventDefault();
              const dragEl = card;
              dragEl.classList.add('dragging');
              const indicator = document.createElement('div');
              indicator.className = 'noise-drop-indicator';
              list.insertBefore(indicator, dragEl.nextSibling);
              const currentOrder = shadings.map((item) => item.id);
              const startIndex = currentOrder.indexOf(shading.id);

              const onMove = (ev) => {
                const y = ev.clientY;
                const items = Array.from(list.querySelectorAll('.noise-card')).filter((item) => item !== dragEl);
                let inserted = false;
                for (const item of items) {
                  const rect = item.getBoundingClientRect();
                  if (y < rect.top + rect.height / 2) {
                    list.insertBefore(indicator, item);
                    inserted = true;
                    break;
                  }
                }
                if (!inserted) list.appendChild(indicator);
              };

              const onUp = () => {
                dragEl.classList.remove('dragging');
                const siblings = Array.from(list.children);
                const indicatorIndex = siblings.indexOf(indicator);
                const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('noise-card'));
                const newIndex = before.length;
                indicator.remove();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                if (newIndex !== startIndex) {
                  const nextOrder = currentOrder.filter((id) => id !== shading.id);
                  nextOrder.splice(newIndex, 0, shading.id);
                  const map = new Map(shadings.map((item) => [item.id, item]));
                  layer.params.shadings = nextOrder.map((id) => map.get(id)).filter(Boolean);
                  this.storeLayerParams(layer);
                  this.app.regen();
                  this.buildControls();
                  this.updateFormula();
                }
              };

              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            };
          };

          const shadingRangeDefs = [
            { key: 'lineSpacing', label: 'Line Spacing (mm)', type: 'range', min: 0.2, max: 8, step: 0.1, displayUnit: 'mm', infoKey: 'petalis.shadingLineSpacing' },
            { key: 'density', label: 'Line Density', type: 'range', min: 0.2, max: 3, step: 0.05, infoKey: 'petalis.shadingDensity' },
            { key: 'jitter', label: 'Line Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.shadingJitter' },
            { key: 'lengthJitter', label: 'Length Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.shadingLengthJitter' },
            { key: 'angle', label: 'Hatch Angle', type: 'range', min: -90, max: 90, step: 1, displayUnit: '°', infoKey: 'petalis.shadingAngle' },
            { key: 'widthX', label: 'Width X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingWidthX' },
            { key: 'posX', label: 'Position X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingPosX' },
            { key: 'gapX', label: 'Gap Width X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapX' },
            { key: 'gapPosX', label: 'Gap Position X (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapPosX' },
            { key: 'widthY', label: 'Width Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingWidthY' },
            { key: 'posY', label: 'Position Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingPosY' },
            { key: 'gapY', label: 'Gap Width Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapY' },
            { key: 'gapPosY', label: 'Gap Position Y (%)', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', infoKey: 'petalis.shadingGapPosY' },
          ];

          shadings.forEach((shade, idx) => {
            if (!shade.id) shade.id = `shade-${idx + 1}`;
            const card = document.createElement('div');
            card.className = `noise-card${shade.enabled ? '' : ' noise-disabled'}`;
            card.dataset.shadingId = shade.id;
            const headerRow = document.createElement('div');
            headerRow.className = 'noise-header';
            headerRow.innerHTML = `
              <div class="flex items-center gap-2">
                ${shadingGripMarkup}
                <span class="noise-title">Shading ${String(idx + 1).padStart(2, '0')}</span>
              </div>
              <div class="noise-actions">
                <label class="noise-toggle">
                  <input type="checkbox" ${shade.enabled ? 'checked' : ''}>
                </label>
                <button type="button" class="noise-delete" aria-label="Delete shading">🗑</button>
              </div>
            `;
            const toggle = headerRow.querySelector('.noise-toggle input');
            const deleteBtn = headerRow.querySelector('.noise-delete');
            const grip = headerRow.querySelector('.noise-grip');
            bindShadingReorderGrip(grip, card, shade);
            if (toggle) {
              toggle.onchange = (e) => {
                if (this.app.pushHistory) this.app.pushHistory();
                shade.enabled = Boolean(e.target.checked);
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            if (deleteBtn) {
              deleteBtn.onclick = () => {
                if (this.app.pushHistory) this.app.pushHistory();
                const index = shadings.findIndex((item) => item.id === shade.id);
                if (index >= 0) shadings.splice(index, 1);
                layer.params.shadings = shadings;
                this.storeLayerParams(layer);
                this.app.regen();
                this.buildControls();
                this.updateFormula();
              };
            }
            card.appendChild(headerRow);

            const controls = document.createElement('div');
            controls.className = 'noise-controls';
            const typeSelectDef = { key: 'type', label: 'Shading Type', infoKey: 'petalis.shadingType' };
            controls.appendChild(buildShadingSelect(shade, typeSelectDef, PETALIS_SHADING_TYPES));
            const lineTypeDef = { key: 'lineType', label: 'Line Type', infoKey: 'petalis.shadingLineType' };
            controls.appendChild(buildShadingSelect(shade, lineTypeDef, PETALIS_LINE_TYPES));
            shadingRangeDefs.forEach((cDef) => {
              controls.appendChild(buildShadingRangeControl(shade, cDef));
            });
            card.appendChild(controls);
            list.appendChild(card);
          });

          target.appendChild(list);
          return;
        }
        if (def.type === 'noiseList') {
          const noiseSource =
            def.source ||
            (layer.type === 'spiral'
              ? 'spiral'
              : layer.type === 'rings'
                ? 'rings'
                : layer.type === 'topo'
                  ? 'topo'
                  : layer.type === 'flowfield'
                    ? 'flowfield'
                    : layer.type === 'svgDistort'
                      ? 'svgDistort'
                      : layer.type === 'grid'
                        ? 'grid'
                        : layer.type === 'phylla'
                          ? 'phylla'
                          : 'wavetable');
          const noiseDefs =
            noiseSource === 'rings'
              ? RINGS_NOISE_DEFS
              : noiseSource === 'topo'
                ? TOPO_NOISE_DEFS
                : noiseSource === 'flowfield' || noiseSource === 'svgDistort'
                  ? FLOWFIELD_NOISE_DEFS
                  : noiseSource === 'grid'
                    ? GRID_NOISE_DEFS
                    : noiseSource === 'phylla'
                      ? PHYLLA_NOISE_DEFS
                      : noiseSource === 'petalisDrift'
                        ? PETALIS_DRIFT_NOISE_DEFS
                      : WAVE_NOISE_DEFS;
          const noises =
            noiseSource === 'spiral'
              ? this.ensureSpiralNoises(layer)
              : noiseSource === 'rings'
                ? this.ensureRingsNoises(layer)
                : noiseSource === 'topo'
                  ? this.ensureTopoNoises(layer)
                  : noiseSource === 'flowfield'
                    ? this.ensureFlowfieldNoises(layer)
                    : noiseSource === 'svgDistort'
                      ? this.ensureSvgDistortNoises(layer)
                      : noiseSource === 'grid'
                        ? this.ensureGridNoises(layer)
                        : noiseSource === 'phylla'
                          ? this.ensurePhyllaNoises(layer)
                          : noiseSource === 'petalisDrift'
                            ? this.ensurePetalisDriftNoises(layer)
                            : this.ensureWavetableNoises(layer);
          const assignNoiseStack = (nextNoises) => {
            if (noiseSource === 'petalisDrift') layer.params.driftNoises = nextNoises;
            else layer.params.noises = nextNoises;
          };
          const { base: noiseBase, templates: noiseTemplates } = this.getWavetableNoiseTemplates(noiseSource);
          const getNoiseDefault = (index, key) => {
            if (key === 'amplitude') {
              const current = noises[index];
              if (current?.type === 'image') return IMAGE_NOISE_DEFAULT_AMPLITUDE;
            }
            const template = noiseTemplates[index] || noiseTemplates[noiseTemplates.length - 1] || noiseBase;
            if (template && Object.prototype.hasOwnProperty.call(template, key)) return template[key];
            return noiseBase[key];
          };
          const resetNoise = (noise, index) => {
            const template = noiseTemplates[index] || noiseTemplates[noiseTemplates.length - 1] || noiseBase;
            const keepType = noise.type;
            const keepBlend = noise.blend;
            Object.keys(noiseBase).forEach((key) => {
              if (key === 'id') return;
              const nextVal = template[key] !== undefined ? template[key] : noiseBase[key];
              noise[key] = Array.isArray(nextVal) ? clone(nextVal) : nextVal;
            });
            if (keepType) noise.type = keepType;
            if (keepBlend) noise.blend = keepBlend;
            if (noise.type === 'image') {
              noise.tileMode = 'off';
              noise.tilePadding = 0;
              noise.amplitude = IMAGE_NOISE_DEFAULT_AMPLITUDE;
            } else if (!noise.tileMode) {
              noise.tileMode = noiseBase.tileMode || 'off';
            }
            if (!noise.noiseStyle) noise.noiseStyle = noiseBase.noiseStyle || 'linear';
            if (noise.noiseThreshold === undefined) noise.noiseThreshold = noiseBase.noiseThreshold ?? 0;
            if (noise.imageWidth === undefined) noise.imageWidth = noiseBase.imageWidth ?? 1;
            if (noise.imageHeight === undefined) noise.imageHeight = noiseBase.imageHeight ?? 1;
            if (noise.microFreq === undefined) noise.microFreq = noiseBase.microFreq ?? 0;
            if (noise.imageInvertColor === undefined) noise.imageInvertColor = noiseBase.imageInvertColor || false;
            if (noise.imageInvertOpacity === undefined) noise.imageInvertOpacity = noiseBase.imageInvertOpacity || false;
            if (noise.applyMode === undefined && noiseBase.applyMode) noise.applyMode = noiseBase.applyMode;
            this.normalizeImageEffects(noise, noiseBase.imageEffects?.[0]);
          };

          this._buildNoiseRack(target, {
            layer,
            noiseDefs,
            noiseBase,
            noiseTemplates,
            noises,
            assignNoiseStack,
            getNoiseDefault,
            resetNoise,
            createNoise: (idx) =>
              noiseSource === 'spiral' ? this.createSpiralNoise(idx)
              : noiseSource === 'rings' ? this.createRingsNoise(idx)
              : noiseSource === 'topo' ? this.createTopoNoise(idx)
              : noiseSource === 'flowfield' ? this.createFlowfieldNoise(idx)
              : noiseSource === 'svgDistort' ? this.createFlowfieldNoise(idx)
              : noiseSource === 'grid' ? this.createGridNoise(idx)
              : noiseSource === 'phylla' ? this.createPhyllaNoise(idx)
              : noiseSource === 'petalisDrift' ? this.createPetalisDriftNoise(idx)
              : this.createWavetableNoise(idx),
            label: def.label || 'Noise Stack',
            containerClass: 'noise-list mb-4',
            attachValueEditor,
          });
          return;
        }
        let val = layer.params[def.id];
        const div = document.createElement('div');
        div.className = 'mb-4';
        const infoBtn = def.infoKey ? `<button type="button" class="info-btn" data-info="${def.infoKey}">i</button>` : '';
        const statsText = () => {
          const stats = layer.stats || {};
          const rawLines = stats.rawLines ?? layer.paths?.length ?? 0;
          const rawPoints = stats.rawPoints ?? 0;
          const simpLines = stats.simplifiedLines ?? rawLines;
          const simpPoints = stats.simplifiedPoints ?? rawPoints;
          return `Lines ${rawLines}→${simpLines} · Points ${rawPoints}→${simpPoints}`;
        };

        if (def.id === 'simplify') {
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, val);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(def, val)}</button>
            </div>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full mb-2">
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            <div class="text-[10px] text-vectura-muted simplify-stats">${statsText()}</div>
          `;
          const input = div.querySelector('input');
          const valueBtn = div.querySelector('.value-chip');
          const valueInput = div.querySelector('.value-input');
          const statsEl = div.querySelector('.simplify-stats');
          if (input && valueBtn && valueInput && statsEl) {
            const resetToDefault = () => {
              const defaultVal = getDefaultValue(def);
              if (defaultVal === null || defaultVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = defaultVal;
              this.storeLayerParams(layer);
              input.value = toDisplayValue(def, defaultVal);
              valueBtn.innerText = formatDisplayValue(def, defaultVal);
              this.app.regen();
              statsEl.textContent = statsText();
              this.updateFormula();
            };
            input.oninput = (e) => {
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const nextDisplay = parseFloat(e.target.value);
              layer.params[def.id] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              statsEl.textContent = statsText();
              this.updateFormula();
            };
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              layer.params[def.id] = fromDisplayValue(def, nextDisplay);
              this.storeLayerParams(layer);
              this.app.regen();
              statsEl.textContent = statsText();
              this.updateFormula();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => layer.params[def.id],
              setValue: (displayVal, opts) => {
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                layer.params[def.id] = fromDisplayValue(def, displayVal);
                this.storeLayerParams(layer);
                this.app.regen();
                statsEl.textContent = statsText();
                valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                this.updateFormula();
              },
            });
          }
          target.appendChild(div);
          return;
        }

        if (def.type === 'angle') {
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = clamp(toDisplayValue(def, val), min, max);
          div.innerHTML = `
            <div class="angle-label">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(
                def,
                val
              )}</button>
            </div>
            <div class="angle-control">
              <div class="angle-dial" style="--angle:${displayVal}deg;">
                <div class="angle-indicator"></div>
              </div>
              <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
            </div>
          `;
          const dial = div.querySelector('.angle-dial');
          const valueBtn = div.querySelector('.value-chip');
          const valueInput = div.querySelector('.value-input');

          let lastDisplay = displayVal;
          const setAngle = (nextDisplay, commit = false, live = false) => {
            const clamped = clamp(roundToStep(nextDisplay, step), min, max);
            lastDisplay = clamped;
            if (dial) dial.style.setProperty('--angle', `${clamped}deg`);
            if (valueBtn) valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, clamped));
            if (commit || live) {
              if (commit && this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = fromDisplayValue(def, clamped);
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            }
          };
          const resetAngle = () => {
            const defaultVal = getDefaultValue(def);
            if (defaultVal === null || defaultVal === undefined) return;
            setAngle(toDisplayValue(def, defaultVal), true);
          };

          if (dial) {
            const updateFromEvent = (e) => {
              const rect = dial.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const dx = e.clientX - cx;
              const dy = e.clientY - cy;
              let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
              if (deg < 0) deg += 360;
              setAngle(deg, false);
            };
            dial.addEventListener('mousedown', (e) => {
              e.preventDefault();
              updateFromEvent(e);
              const move = (ev) => updateFromEvent(ev);
              const up = () => {
                window.removeEventListener('mousemove', move);
                setAngle(lastDisplay, true);
              };
              window.addEventListener('mousemove', move);
              window.addEventListener('mouseup', up, { once: true });
            });
            dial.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetAngle();
            });
          }

          attachValueEditor({
            def,
            valueEl: valueBtn,
            inputEl: valueInput,
            getValue: () => layer.params[def.id],
            setValue: (displayVal, opts) => {
              const commit = opts?.commit !== false;
              const live = Boolean(opts?.live);
              setAngle(displayVal, commit, live);
            },
          });
          const target = def.inlineGroup ? getInlineGroup(def.inlineGroup) : container;
          if (def.inlineGroup) div.classList.add('control-inline-item', 'angle-item');
          target.appendChild(div);
          return;
        }

        if (def.type === 'checkbox') {
          const checked = Boolean(val);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${checked ? 'ON' : 'OFF'}</span>
            </div>
            <input type="checkbox" ${checked ? 'checked' : ''} class="w-4 h-4">
          `;
          const input = div.querySelector('input');
          const span = div.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const next = Boolean(e.target.checked);
              span.innerText = next ? 'ON' : 'OFF';
              layer.params[def.id] = next;
              this.storeLayerParams(layer);
              if (def.id === 'curves') {
                this.app.render();
                this.updateFormula();
              } else {
                this.app.regen();
                this.updateFormula();
              }
              maybeRebuildControls();
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaultVal = getDefaultValue(def);
              if (defaultVal === null || defaultVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              const next = Boolean(defaultVal);
              input.checked = next;
              span.innerText = next ? 'ON' : 'OFF';
              layer.params[def.id] = next;
              this.storeLayerParams(layer);
              if (def.id === 'curves') {
                this.app.render();
                this.updateFormula();
              } else {
                this.app.regen();
                this.updateFormula();
              }
              maybeRebuildControls();
            });
          }
          const target = def.inlineGroup ? getInlineGroup(def.inlineGroup) : container;
          if (def.inlineGroup) div.classList.add('control-inline-item');
          target.appendChild(div);
          return;
        } else if (def.type === 'select') {
          if ((val === undefined || val === null) && def.options && def.options.length) {
            val = def.options[0].value;
            layer.params[def.id] = val;
          }
          if (def.options?.length && !def.options.some((opt) => opt.value === val)) {
            val = def.options[0].value;
            layer.params[def.id] = val;
          }
          const optionsHtml = def.options
            .map(
              (opt) =>
                `<option value="${opt.value}" ${val === opt.value ? 'selected' : ''}>${opt.label}</option>`
            )
            .join('');
          const currentLabel = def.options.find((opt) => opt.value === val)?.label || val;
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
            </div>
            <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              ${optionsHtml}
            </select>
          `;
          const input = div.querySelector('select');
          const span = div.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const next = e.target.value;
              if (isPetalisLayerType(layer.type) && def.id === 'preset' && next === 'custom') {
                layer.params.preset = 'custom';
                layer.params.shadings = [];
                layer.params.innerShading = false;
                layer.params.outerShading = false;
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              if (isPetalisLayerType(layer.type) && def.id === 'preset' && next !== 'custom') {
                const preset = (PETALIS_PRESET_LIBRARY || []).find((item) => item.id === next);
                const presetBase = 'petalisDesigner';
                const base = ALGO_DEFAULTS?.[presetBase] ? clone(ALGO_DEFAULTS[presetBase]) : {};
                const preserved = new Set([...TRANSFORM_KEYS, 'smoothing', 'simplify', 'curves']);
                const nextParams = { ...base, ...(preset?.params || {}) };
                preserved.forEach((key) => {
                  if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
                });
                nextParams.preset = next;
                layer.params = { ...layer.params, ...nextParams };
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              if (layer.type === 'terrain' && def.id === 'preset' && next === 'custom') {
                layer.params.preset = 'custom';
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              if (layer.type === 'terrain' && def.id === 'preset' && next !== 'custom') {
                const preset = (TERRAIN_PRESET_LIBRARY || []).find((item) => item.id === next);
                const base = ALGO_DEFAULTS?.terrain ? clone(ALGO_DEFAULTS.terrain) : {};
                const preserved = new Set([...TRANSFORM_KEYS, 'smoothing', 'simplify', 'curves']);
                const nextParams = { ...base, ...(preset?.params || {}) };
                preserved.forEach((key) => {
                  if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
                });
                nextParams.preset = next;
                layer.params = { ...layer.params, ...nextParams };
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              if (layer.type === 'rings' && def.id === 'preset' && next === 'custom') {
                layer.params.preset = 'custom';
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              if (layer.type === 'rings' && def.id === 'preset' && next !== 'custom') {
                const preset = (RINGS_PRESET_LIBRARY || []).find((item) => item.id === next);
                const base = ALGO_DEFAULTS?.rings ? clone(ALGO_DEFAULTS.rings) : {};
                const preserved = new Set([...TRANSFORM_KEYS, 'smoothing', 'simplify', 'curves', 'outerDiameter', 'centerDiameter']);
                const nextParams = { ...base, ...(preset?.params || {}) };
                preserved.forEach((key) => {
                  if (layer.params[key] !== undefined) nextParams[key] = layer.params[key];
                });
                nextParams.preset = next;
                layer.params = { ...layer.params, ...nextParams };
                this.storeLayerParams(layer);
                span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
                this.app.regen();
                this.buildControls();
                this.updateFormula();
                return;
              }
              layer.params[def.id] = next;
              if (layer.type === 'wavetable' && def.id === 'lineStructure' && next === 'vertical') {
                layer.params.lineOffset = 135;
              }
              this.storeLayerParams(layer);
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.updateFormula();
              maybeRebuildControls();
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaultVal = getDefaultValue(def);
              const fallback = def.options?.[0]?.value;
              const next = defaultVal !== null && defaultVal !== undefined ? defaultVal : fallback;
              if (next === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = next;
              this.storeLayerParams(layer);
              input.value = next;
              span.innerText = def.options.find((opt) => opt.value === next)?.label || next;
              this.app.regen();
              this.updateFormula();
              maybeRebuildControls();
            });
          }
        } else if (def.type === 'colorModal') {
          const colorVal = val || '#ffffff';
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="color-modal-trigger text-[10px] text-vectura-accent border border-vectura-border px-2 py-1 rounded">
                Set Color
              </button>
            </div>
            <div class="flex items-center gap-2">
              <span class="color-swatch" style="background:${colorVal}"></span>
              <span class="text-xs text-vectura-accent font-mono color-value">${colorVal}</span>
            </div>
          `;
          const btn = div.querySelector('.color-modal-trigger');
          const swatch = div.querySelector('.color-swatch');
          const valueEl = div.querySelector('.color-value');
          if (btn && swatch && valueEl) {
            btn.onclick = () => {
              this.openColorModal({
                title: def.label,
                value: layer.params[def.id] || colorVal,
                onApply: (next) => {
                  if (this.app.pushHistory) this.app.pushHistory();
                  layer.params[def.id] = next;
                  this.storeLayerParams(layer);
                  swatch.style.background = next;
                  valueEl.textContent = next;
                  this.app.regen();
                  this.updateFormula();
                },
              });
            };
          }
        } else if (def.type === 'color') {
          const colorVal = val || '#ffffff';
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <span class="text-xs text-vectura-accent font-mono">${colorVal}</span>
            </div>
            <input type="color" value="${colorVal}" class="w-full h-8 bg-transparent border border-vectura-border rounded">
          `;
          const input = div.querySelector('input');
          const span = div.querySelector('span');
          if (input && span) {
            input.oninput = (e) => {
              span.innerText = e.target.value;
            };
            input.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = e.target.value;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaultVal = getDefaultValue(def);
              if (!defaultVal) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = defaultVal;
              input.value = defaultVal;
              span.innerText = defaultVal;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
          }
        } else if (def.type === 'rangeDual') {
          const minVal = layer.params[def.minKey];
          const maxVal = layer.params[def.maxKey];
          const { min: displayMin, max: displayMax, step: displayStep } = getDisplayConfig(def);
          const displayMinVal = toDisplayValue(def, minVal);
          const displayMaxVal = toDisplayValue(def, maxVal);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(def, minVal)}-${formatDisplayValue(def, maxVal)}</button>
            </div>
            <div class="dual-range">
              <input type="range" min="${displayMin}" max="${displayMax}" step="${displayStep}" value="${displayMinVal}" data-handle="min">
              <input type="range" min="${displayMin}" max="${displayMax}" step="${displayStep}" value="${displayMaxVal}" data-handle="max">
            </div>
          `;
          const minInput = div.querySelector('input[data-handle="min"]');
          const maxInput = div.querySelector('input[data-handle="max"]');
          const valueBtn = div.querySelector('.value-chip');
          const resetToDefault = () => {
            const defaults = getDefaultValue(def);
            if (!defaults || defaults.min === undefined || defaults.max === undefined) return;
            if (this.app.pushHistory) this.app.pushHistory();
            layer.params[def.minKey] = defaults.min;
            layer.params[def.maxKey] = defaults.max;
            if (minInput) minInput.value = toDisplayValue(def, defaults.min);
            if (maxInput) maxInput.value = toDisplayValue(def, defaults.max);
            this.storeLayerParams(layer);
            this.app.regen();
            if (valueBtn) {
              valueBtn.innerText = `${formatDisplayValue(def, layer.params[def.minKey])}-${formatDisplayValue(
                def,
                layer.params[def.maxKey]
              )}`;
            }
            this.updateFormula();
          };

          const syncValues = (changed) => {
            let min = parseFloat(minInput.value);
            let max = parseFloat(maxInput.value);
            if (min > max) {
              if (changed === 'min') max = min;
              else min = max;
            }
            min = clamp(min, displayMin, displayMax);
            max = clamp(max, displayMin, displayMax);
            minInput.value = min;
            maxInput.value = max;
            layer.params[def.minKey] = fromDisplayValue(def, min);
            layer.params[def.maxKey] = fromDisplayValue(def, max);
            if (valueBtn) {
              valueBtn.innerText = `${formatDisplayValue(def, layer.params[def.minKey])}-${formatDisplayValue(
                def,
                layer.params[def.maxKey]
              )}`;
            }
            const minOnTop = min >= max - displayStep;
            minInput.style.zIndex = minOnTop ? 2 : 1;
            maxInput.style.zIndex = minOnTop ? 1 : 2;
          };

          if (minInput && maxInput) {
            syncValues();
            minInput.oninput = () => syncValues('min');
            maxInput.oninput = () => syncValues('max');
            minInput.onchange = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              syncValues('min');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            maxInput.onchange = () => {
              if (this.app.pushHistory) this.app.pushHistory();
              syncValues('max');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            };
            attachKeyboardRangeNudge(minInput, () => {
              syncValues('min');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            attachKeyboardRangeNudge(maxInput, () => {
              syncValues('max');
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
            });
            minInput.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
            maxInput.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
          }
          if (valueBtn) {
            attachValueEditor({
              def,
              valueEl: valueBtn,
              getValue: () => ({
                min: layer.params[def.minKey],
                max: layer.params[def.maxKey],
              }),
              formatValue: (current) => {
                const currMin = toDisplayValue(def, current.min);
                const currMax = toDisplayValue(def, current.max);
                return `${currMin}, ${currMax}`;
              },
              parseValue: (raw) => {
                const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
                if (parts.length !== 2) return null;
                const minValParsed = Number.parseFloat(parts[0]);
                const maxValParsed = Number.parseFloat(parts[1]);
                if (
                  !Number.isFinite(minValParsed) ||
                  !Number.isFinite(maxValParsed) ||
                  minValParsed < displayMin ||
                  maxValParsed > displayMax ||
                  minValParsed > maxValParsed
                ) {
                  return null;
                }
                return { min: minValParsed, max: maxValParsed };
              },
              setValue: (vals, opts) => {
                if (!vals) return;
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                if (minInput) minInput.value = vals.min;
                if (maxInput) maxInput.value = vals.max;
                syncValues();
                this.storeLayerParams(layer);
                this.app.regen();
                this.updateFormula();
              },
            });
          }
        } else {
          const { min, max, step } = getDisplayConfig(def);
          const displayVal = toDisplayValue(def, val);
          div.innerHTML = `
            <div class="flex justify-between mb-1">
              <div class="flex items-center gap-2">
                <label class="control-label mb-0">${def.label}</label>
                ${infoBtn}
              </div>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatDisplayValue(def, val)}</button>
            </div>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" class="w-full">
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const input = div.querySelector('input');
          const valueBtn = div.querySelector('.value-chip');
          const valueInput = div.querySelector('.value-input');
          if (input && valueBtn && valueInput) {
            const confirmHeavy = (displayVal) => {
              const nextVal = fromDisplayValue(def, displayVal);
              if (Number.isFinite(def.confirmAbove) && nextVal >= def.confirmAbove) {
                const message = def.confirmMessage || 'This value may be slow. Continue?';
                if (!window.confirm(message)) {
                  const resetVal = toDisplayValue(def, layer.params[def.id]);
                  input.value = resetVal;
                  valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                  return null;
                }
              }
              return nextVal;
            };
            const resetToDefault = () => {
              const defaultVal = getDefaultValue(def);
              if (defaultVal === null || defaultVal === undefined) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = defaultVal;
              this.storeLayerParams(layer);
              input.value = toDisplayValue(def, defaultVal);
              valueBtn.innerText = formatDisplayValue(def, defaultVal);
              this.app.regen();
              this.updateFormula();
              maybeRebuildControls();
            };
            input.oninput = (e) => {
              const nextDisplay = parseFloat(e.target.value);
              valueBtn.innerText = formatDisplayValue(def, fromDisplayValue(def, nextDisplay));
            };
            input.onchange = (e) => {
              const nextDisplay = parseFloat(e.target.value);
              const nextVal = confirmHeavy(nextDisplay);
              if (nextVal === null) return;
              if (this.app.pushHistory) this.app.pushHistory();
              layer.params[def.id] = nextVal;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
              maybeRebuildControls();
            };
            attachKeyboardRangeNudge(input, (nextDisplay) => {
              const nextVal = confirmHeavy(nextDisplay);
              if (nextVal === null) return;
              layer.params[def.id] = nextVal;
              this.storeLayerParams(layer);
              this.app.regen();
              this.updateFormula();
              maybeRebuildControls();
            });
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              resetToDefault();
            });
            attachValueEditor({
              def,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => layer.params[def.id],
              setValue: (displayVal, opts) => {
                const nextVal = confirmHeavy(displayVal);
                if (nextVal === null) return;
                const commit = opts?.commit !== false;
                if (commit && this.app.pushHistory) this.app.pushHistory();
                layer.params[def.id] = nextVal;
                this.storeLayerParams(layer);
                this.app.regen();
                valueBtn.innerText = formatDisplayValue(def, layer.params[def.id]);
                this.updateFormula();
                maybeRebuildControls();
              },
            });
          }
        }
        const inlineTarget = def.inlineGroup ? getInlineGroup(def.inlineGroup) : target;
        if (def.inlineGroup) div.classList.add('control-inline-item');
        inlineTarget.appendChild(div);
      };

      const renderOptimizationPanel = (target) => {
        if (!target) return;
        const panel = document.createElement('div');
        panel.className = 'optimization-panel';
        panel.innerHTML = '';

        const getTargets = () => {
          return this.getOptimizationTargets();
        };

        const normalizeConfig = (config) => {
          if (!config) return null;
          if (!Array.isArray(config.steps)) config.steps = [];
          const defaults = SETTINGS.optimizationDefaults || { bypassAll: false, steps: [] };
          const defaultSteps = Array.isArray(defaults.steps) ? defaults.steps : [];
          const defaultMap = new Map(defaultSteps.map((step) => [step.id, step]));
          config.steps = config.steps.map((step) => ({
            ...(defaultMap.get(step.id) || {}),
            ...step,
          }));
          defaultSteps.forEach((step) => {
            if (!config.steps.some((s) => s.id === step.id)) {
              config.steps.push(clone(step));
            }
          });
          if (config.bypassAll === undefined) config.bypassAll = defaults.bypassAll ?? false;
          return config;
        };

        const getStepDefaults = (id) => {
          const defaults = SETTINGS.optimizationDefaults || { steps: [] };
          return (defaults.steps || []).find((step) => step.id === id) || {};
        };

        const isDocumentLengthControl = (def) => def?.displayUnit === 'mm' || /\(mm\)/.test(def?.label || '');
        const getOptimizationLabel = (label = '') => label.replace(/\(mm\)/g, `(${this.getDocumentUnitLabel()})`);
        const getOptimizationDisplayConfig = (def) => {
          if (!isDocumentLengthControl(def)) return getDisplayConfig(def);
          const config = this.getDocumentLengthConfig({
            minMm: def.min,
            maxMm: def.max,
            stepMm: def.step,
            precision: def.displayPrecision,
          });
          return {
            min: config.min,
            max: config.max,
            step: config.step,
            unit: config.unitLabel,
            precision: config.precision,
          };
        };
        const toOptimizationDisplayValue = (def, value) => {
          if (isDocumentLengthControl(def)) return mmToDocumentUnits(value, this.getDocumentUnits());
          return toDisplayValue(def, value);
        };
        const fromOptimizationDisplayValue = (def, value) => {
          if (isDocumentLengthControl(def)) return documentUnitsToMm(value, this.getDocumentUnits());
          return fromDisplayValue(def, value);
        };
        const toOptimizationEditorDef = (def) => {
          if (!isDocumentLengthControl(def)) return def;
          const display = getOptimizationDisplayConfig(def);
          return {
            ...def,
            displayMin: display.min,
            displayMax: display.max,
            displayStep: display.step,
            displayUnit: display.unit,
            displayPrecision: display.precision,
          };
        };

        const targets = getTargets();
        const config = targets.length ? normalizeConfig(this.app.engine.ensureLayerOptimization(targets[0])) : null;

        const updateStats = () => {
          const scopedTargets = getTargets();
          if (!config || !scopedTargets.length) return;
          this.optimizeTargetsForCurrentScope({ includePlotterOptimize: true });
          const before = this.app.engine.computeStats(scopedTargets, { useOptimized: false, includePlotterOptimize: false });
          const after = this.app.engine.computeStats(scopedTargets, { useOptimized: true, includePlotterOptimize: true });
          const beforeEl = panel.querySelector('[data-opt-stat="before"]');
          const afterEl = panel.querySelector('[data-opt-stat="after"]');
          const formatStats = (stats) =>
            `Lines ${stats.lines || 0} • Points ${stats.points || 0} • ${stats.distance} • ${stats.time}`;
          if (beforeEl) beforeEl.textContent = formatStats(before);
          if (afterEl) afterEl.textContent = formatStats(after);
        };

        const rerenderOptimizationPreview = () => {
          const scopedTargets = getTargets();
          if (!scopedTargets.length) return;
          this.optimizeTargetsForCurrentScope({ includePlotterOptimize: true });
          this.app.render();
          updateStats();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };

        const applyOptimization = (mutator) => {
          const scopedTargets = getTargets();
          if (!scopedTargets.length) return;
          const scope = SETTINGS.optimizationScope || 'all';
          const baseConfig = normalizeConfig(this.app.engine.ensureLayerOptimization(scopedTargets[0]));
          if (mutator) mutator(baseConfig);
          if (scope !== 'active') {
            const snapshot = clone(baseConfig);
            scopedTargets.forEach((layer, idx) => {
              if (idx === 0) return;
              layer.optimization = clone(snapshot);
            });
            this.app.optimizeLayers(scopedTargets, { config: snapshot, includePlotterOptimize: true });
          } else {
            this.app.optimizeLayers(scopedTargets, { config: baseConfig, includePlotterOptimize: true });
          }
          this.app.render();
          updateStats();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };

        const buildRow = (label, controlEl) => {
          const row = document.createElement('div');
          row.className = 'optimization-row';
          const lab = document.createElement('label');
          lab.className = 'control-label mb-0';
          lab.textContent = label;
          row.appendChild(lab);
          row.appendChild(controlEl);
          return row;
        };

        const scopeSelect = document.createElement('select');
        scopeSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
        scopeSelect.innerHTML = `
          <option value="active">Active Layer</option>
          <option value="selected">Selected Layers</option>
          <option value="all">All Layers</option>
        `;
        scopeSelect.value = SETTINGS.optimizationScope || 'all';
        scopeSelect.onchange = (e) => {
          SETTINGS.optimizationScope = e.target.value;
          this.buildControls();
          this.app.render();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };
        panel.appendChild(buildRow('Scope', scopeSelect));

        if ((SETTINGS.optimizationScope || 'all') === 'selected') {
          const selectedLayers = (this.app.renderer?.getSelectedLayers?.() || []).filter((l) => l && !l.isGroup);
          const infoEl = document.createElement('div');
          infoEl.className = 'text-xs px-1 pb-1';
          if (!selectedLayers.length) {
            infoEl.classList.add('text-amber-400');
            infoEl.textContent = 'No layers selected — exporting all layers';
          } else {
            infoEl.classList.add('text-vectura-muted');
            const names = selectedLayers.map((l) => l.name || l.id);
            const shown = names.slice(0, 3).join(', ');
            const extra = names.length > 3 ? ` and ${names.length - 3} more` : '';
            infoEl.textContent = `${selectedLayers.length} selected: ${shown}${extra}`;
          }
          panel.appendChild(infoEl);
        }

        const previewSelect = document.createElement('select');
        previewSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent';
        previewSelect.innerHTML = `
          <option value="off">Off</option>
          <option value="replace">Replace</option>
          <option value="overlay">Overlay</option>
        `;
        previewSelect.value = SETTINGS.optimizationPreview || 'off';
        previewSelect.onchange = (e) => {
          SETTINGS.optimizationPreview = e.target.value;
          this.buildControls();
          this.app.render();
          if (this.exportModalState?.isOpen) this.renderExportPreview();
        };
        panel.appendChild(buildRow('Preview', previewSelect));

        const exportToggle = document.createElement('input');
        exportToggle.type = 'checkbox';
        exportToggle.checked = Boolean(SETTINGS.optimizationExport);
        exportToggle.onchange = (e) => {
          SETTINGS.optimizationExport = Boolean(e.target.checked);
          rerenderOptimizationPreview();
        };
        panel.appendChild(buildRow('Export Optimized', exportToggle));

        const bypassToggle = document.createElement('input');
        bypassToggle.type = 'checkbox';
        bypassToggle.checked = Boolean(config?.bypassAll);
        bypassToggle.onchange = (e) => {
          if (!config) return;
          const next = Boolean(e.target.checked);
          applyOptimization((cfg) => {
            cfg.bypassAll = next;
            cfg.steps = (cfg.steps || []).map((step) => ({ ...step, bypass: next }));
          });
          this.buildControls();
        };
        panel.appendChild(buildRow('Bypass All', bypassToggle));

        const getHexComplement = (hex) => {
          const raw = `${hex || ''}`.trim().replace('#', '');
          const normalized =
            raw.length === 3
              ? raw
                  .split('')
                  .map((c) => `${c}${c}`)
                  .join('')
              : raw;
          if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#c74307';
          const r = 255 - parseInt(normalized.slice(0, 2), 16);
          const g = 255 - parseInt(normalized.slice(2, 4), 16);
          const b = 255 - parseInt(normalized.slice(4, 6), 16);
          const toHex = (v) => v.toString(16).padStart(2, '0');
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        };

        const overlayStyleControls = document.createElement('div');
        overlayStyleControls.className = 'color-thickness-control';
        const overlayColorPreview = document.createElement('button');
        overlayColorPreview.type = 'button';
        overlayColorPreview.className = 'value-chip text-xs text-vectura-accent font-mono color-thickness-pill';
        overlayColorPreview.textContent = `${(SETTINGS.optimizationOverlayColor || '#38bdf8').toUpperCase()}`;
        overlayColorPreview.style.background = SETTINGS.optimizationOverlayColor || '#38bdf8';
        overlayColorPreview.style.color = getContrastTextColor(SETTINGS.optimizationOverlayColor || '#38bdf8');
        const overlayColorInput = document.createElement('input');
        overlayColorInput.type = 'color';
        overlayColorInput.value = SETTINGS.optimizationOverlayColor || '#38bdf8';
        overlayColorInput.className = 'hidden';

        const overlaySizeControls = document.createElement('div');
        overlaySizeControls.className = 'color-thickness-size';
        const overlayWidthConfig = this.getDocumentLengthConfig({ minMm: 0.05, maxMm: 1, stepMm: 0.05 });
        const overlayWidth = document.createElement('input');
        overlayWidth.type = 'range';
        overlayWidth.min = `${overlayWidthConfig.min}`;
        overlayWidth.max = `${overlayWidthConfig.max}`;
        overlayWidth.step = `${overlayWidthConfig.step}`;
        overlayWidth.value = this.formatDocumentNumber(SETTINGS.optimizationOverlayWidth ?? 0.2, { precision: overlayWidthConfig.precision });
        const overlayWidthInput = document.createElement('input');
        overlayWidthInput.type = 'number';
        overlayWidthInput.min = `${overlayWidthConfig.min}`;
        overlayWidthInput.max = `${overlayWidthConfig.max}`;
        overlayWidthInput.step = `${overlayWidthConfig.step}`;
        overlayWidthInput.value = this.formatDocumentNumber(SETTINGS.optimizationOverlayWidth ?? 0.2, { precision: overlayWidthConfig.precision });
        overlayWidthInput.className =
          'w-14 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none';
        const overlayMm = document.createElement('span');
        overlayMm.className = 'text-[10px] text-vectura-muted';
        overlayMm.textContent = overlayWidthConfig.unitLabel;
        overlaySizeControls.appendChild(overlayWidth);
        overlaySizeControls.appendChild(overlayWidthInput);
        overlaySizeControls.appendChild(overlayMm);

        const overlayResetBtn = document.createElement('button');
        overlayResetBtn.type = 'button';
        overlayResetBtn.className = 'text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted';
        overlayResetBtn.textContent = 'Reset';

        const applyOverlayStyle = (opts = {}) => {
          const { color, width, commit = false } = opts;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          if (typeof color === 'string' && color) {
            SETTINGS.optimizationOverlayColor = color;
            overlayColorPreview.textContent = color.toUpperCase();
            overlayColorPreview.style.background = color;
            overlayColorPreview.style.color = getContrastTextColor(color);
          }
          if (width !== undefined) {
            const next = Math.max(0.05, Math.min(1, this.parseDocumentNumber(width, { fallbackMm: SETTINGS.optimizationOverlayWidth ?? 0.2 })));
            SETTINGS.optimizationOverlayWidth = Number.isFinite(next) ? next : 0.2;
            const displayWidth = this.formatDocumentNumber(SETTINGS.optimizationOverlayWidth, { precision: overlayWidthConfig.precision });
            overlayWidth.value = displayWidth;
            overlayWidthInput.value = displayWidth;
          }
          rerenderOptimizationPreview();
        };

        overlayColorPreview.onclick = () => openColorPickerAnchoredTo(overlayColorInput, overlayColorPreview);
        overlayColorInput.oninput = (e) => applyOverlayStyle({ color: e.target.value });
        overlayColorInput.onchange = (e) => applyOverlayStyle({ color: e.target.value, commit: true });
        overlayWidth.oninput = (e) => applyOverlayStyle({ width: e.target.value });
        overlayWidth.onchange = (e) => applyOverlayStyle({ width: e.target.value, commit: true });
        overlayWidthInput.oninput = (e) => applyOverlayStyle({ width: e.target.value });
        overlayWidthInput.onchange = (e) => applyOverlayStyle({ width: e.target.value, commit: true });
        overlayResetBtn.onclick = () => {
          applyOverlayStyle({ color: '#38bdf8', width: 0.2, commit: true });
        };

        const overlayColorField = document.createElement('div');
        overlayColorField.className = 'style-field';
        const overlayColorLabel = document.createElement('span');
        overlayColorLabel.className = 'style-field-label';
        overlayColorLabel.textContent = 'Line Color';
        overlayColorField.appendChild(overlayColorLabel);
        overlayColorField.appendChild(overlayColorPreview);
        overlayColorField.appendChild(overlayColorInput);

        const overlayThicknessField = document.createElement('div');
        overlayThicknessField.className = 'style-field';
        const overlayThicknessLabel = document.createElement('span');
        overlayThicknessLabel.className = 'style-field-label';
        overlayThicknessLabel.textContent = 'Line Thickness';
        overlayThicknessField.appendChild(overlayThicknessLabel);
        overlayThicknessField.appendChild(overlaySizeControls);

        const overlayResetField = document.createElement('div');
        overlayResetField.className = 'style-field';
        const overlayResetLabel = document.createElement('span');
        overlayResetLabel.className = 'style-field-label';
        overlayResetLabel.textContent = 'Reset';
        overlayResetField.appendChild(overlayResetLabel);
        overlayResetField.appendChild(overlayResetBtn);

        overlayStyleControls.appendChild(overlayColorField);
        overlayStyleControls.appendChild(overlayThicknessField);
        overlayStyleControls.appendChild(overlayResetField);
        const overlayStyleRow = buildRow('Overlay Style', overlayStyleControls);
        if ((SETTINGS.optimizationPreview || 'off') !== 'overlay') overlayStyleRow.classList.add('hidden');
        panel.appendChild(overlayStyleRow);

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'opt-reset';
        resetBtn.textContent = 'Reset Optimizations';
        resetBtn.onclick = () => {
          const defaults = SETTINGS.optimizationDefaults ? clone(SETTINGS.optimizationDefaults) : { bypassAll: false, steps: [] };
          applyOptimization((cfg) => {
            cfg.bypassAll = defaults.bypassAll ?? false;
            cfg.steps = clone(defaults.steps || []);
          });
          this.buildControls();
        };
        const resetRow = document.createElement('div');
        resetRow.className = 'optimization-actions';
        resetRow.appendChild(resetBtn);
        panel.appendChild(resetRow);

        const stats = document.createElement('div');
        stats.className = 'optimization-stats';
        stats.innerHTML = `
          <div class="optimization-stat-row">
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Before</span>
            <span class="text-[10px] text-vectura-accent" data-opt-stat="before">Lines 0 • Points 0 • 0m • 0:00</span>
          </div>
          <div class="optimization-stat-row">
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">After</span>
            <span class="text-[10px] text-vectura-accent" data-opt-stat="after">Lines 0 • Points 0 • 0m • 0:00</span>
          </div>
        `;
        panel.appendChild(stats);

        if (!config) {
          target.appendChild(panel);
          return;
        }

        const list = document.createElement('div');
        list.className = 'optimization-list';

        const buildExportSettingsCard = () => {
          const card = document.createElement('div');
          card.className = 'optimization-card';
          card.innerHTML = `
            <div class="optimization-card-header">
              <div class="optimization-card-title">
                <span>Export Settings</span>
              </div>
            </div>
          `;
          const controlsWrap = document.createElement('div');
          controlsWrap.className = 'optimization-controls';

          const buildInlineControl = (label, controlMarkup) => {
            const control = document.createElement('div');
            control.className = 'optimization-control';
            control.innerHTML = `
              <div class="flex justify-between mb-1">
                <label class="control-label mb-0">${label}</label>
              </div>
              ${controlMarkup}
            `;
            return control;
          };

          const precisionInput = document.createElement('input');
          precisionInput.type = 'number';
          precisionInput.min = '0';
          precisionInput.max = '6';
          precisionInput.step = '1';
          precisionInput.value = `${Math.max(0, Math.min(6, parseInt(SETTINGS.precision, 10) || 3))}`;
          precisionInput.className =
            'w-16 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none';
          precisionInput.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const next = Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 3));
            SETTINGS.precision = next;
            e.target.value = `${next}`;
            updateStats();
            if (this.exportModalState?.isOpen) this.renderExportPreview();
          };
          const precisionControl = buildInlineControl('Precision', '');
          precisionControl.appendChild(precisionInput);
          controlsWrap.appendChild(precisionControl);

          const strokeInput = document.createElement('input');
          strokeInput.type = 'number';
          strokeInput.min = '0';
          const strokeConfig = this.getDocumentLengthConfig({ minMm: 0, stepMm: 0.1 });
          strokeInput.step = `${strokeConfig.step}`;
          strokeInput.value = this.formatDocumentNumber(SETTINGS.strokeWidth ?? 0.3, { precision: strokeConfig.precision });
          strokeInput.className =
            'w-16 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none';
          strokeInput.onchange = (e) => {
            if (this.app.pushHistory) this.app.pushHistory();
            const next = Math.max(0, this.parseDocumentNumber(e.target.value, { fallbackMm: SETTINGS.strokeWidth ?? 0.3 }));
            SETTINGS.strokeWidth = Number.isFinite(next) ? next : 0.3;
            this.app.engine.layers.forEach((layer) => {
              layer.strokeWidth = SETTINGS.strokeWidth;
            });
            e.target.value = this.formatDocumentNumber(SETTINGS.strokeWidth, { precision: strokeConfig.precision });
            this.app.render();
            updateStats();
            if (this.exportModalState?.isOpen) this.renderExportPreview();
          };
          const strokeControl = buildInlineControl(`Stroke (${strokeConfig.unitLabel})`, '');
          strokeControl.appendChild(strokeInput);
          controlsWrap.appendChild(strokeControl);

          const hiddenGeometryControl = document.createElement('div');
          hiddenGeometryControl.className = 'optimization-control';
          hiddenGeometryControl.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">Remove Hidden Geometry</label>
              <span class="text-xs text-vectura-accent font-mono">${SETTINGS.removeHiddenGeometry !== false ? 'ON' : 'OFF'}</span>
            </div>
            <input type="checkbox" class="w-4 h-4" ${SETTINGS.removeHiddenGeometry !== false ? 'checked' : ''}>
          `;
          const hiddenGeometryToggle = hiddenGeometryControl.querySelector('input');
          const hiddenGeometryState = hiddenGeometryControl.querySelector('span');
          if (hiddenGeometryToggle && hiddenGeometryState) {
            hiddenGeometryToggle.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              SETTINGS.removeHiddenGeometry = Boolean(e.target.checked);
              hiddenGeometryState.textContent = SETTINGS.removeHiddenGeometry ? 'ON' : 'OFF';
              this.app.persistPreferencesDebounced?.();
              if (this.exportModalState?.isOpen) this.renderExportPreview();
            };
          }
          controlsWrap.appendChild(hiddenGeometryControl);

          const toggleControl = document.createElement('div');
          toggleControl.className = 'optimization-control';
          toggleControl.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">Plotter Optimization</label>
              <span class="text-xs text-vectura-accent font-mono">${SETTINGS.plotterOptimize > 0 ? 'ON' : 'OFF'}</span>
            </div>
            <input type="checkbox" class="w-4 h-4">
          `;
          const plotterToggle = toggleControl.querySelector('input');
          const toggleState = toggleControl.querySelector('span');
          const toleranceControl = document.createElement('div');
          toleranceControl.className = 'optimization-control';
          const currentTolerance = Math.max(0.01, Math.min(1, SETTINGS.plotterOptimize || 0.1));
          const toleranceConfig = this.getDocumentLengthConfig({ minMm: 0.01, maxMm: 1, stepMm: 0.01 });
          const toleranceDisplay = this.formatDocumentNumber(currentTolerance, { precision: toleranceConfig.precision });
          toleranceControl.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">Optimization Tolerance (${toleranceConfig.unitLabel})</label>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${toleranceDisplay}${toleranceConfig.unitLabel}</button>
            </div>
            <input type="range" min="${toleranceConfig.min}" max="${toleranceConfig.max}" step="${toleranceConfig.step}" value="${toleranceDisplay}" class="w-full">
            <input type="number" min="${toleranceConfig.min}" max="${toleranceConfig.max}" step="${toleranceConfig.step}" value="${toleranceDisplay}" class="w-16 mt-2 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none">
          `;
          const tolRange = toleranceControl.querySelector('input[type="range"]');
          const tolNumber = toleranceControl.querySelector('input[type="number"]');
          const tolValue = toleranceControl.querySelector('.value-chip');
          const setToleranceDisabled = (disabled) => {
            if (tolRange) tolRange.disabled = disabled;
            if (tolNumber) tolNumber.disabled = disabled;
            toleranceControl.classList.toggle('is-disabled', disabled);
          };
          const clampTolerance = (raw) => {
            const next = this.parseDocumentNumber(raw, { fallbackMm: 0.1 });
            if (!Number.isFinite(next)) return 0.1;
            return Math.max(0.01, Math.min(1, next));
          };
          const applyTolerance = (raw, options = {}) => {
            const { commit = false } = options;
            if (commit && this.app.pushHistory) this.app.pushHistory();
            const next = clampTolerance(raw);
            const displayValue = this.formatDocumentNumber(next, { precision: toleranceConfig.precision });
            if (tolRange) tolRange.value = displayValue;
            if (tolNumber) tolNumber.value = displayValue;
            if (tolValue) tolValue.textContent = `${displayValue}${toleranceConfig.unitLabel}`;
            SETTINGS.plotterOptimize = plotterToggle?.checked ? next : 0;
            if (toggleState) toggleState.textContent = SETTINGS.plotterOptimize > 0 ? 'ON' : 'OFF';
            rerenderOptimizationPreview();
          };
          if (plotterToggle) {
            plotterToggle.checked = SETTINGS.plotterOptimize > 0;
            setToleranceDisabled(!plotterToggle.checked);
            plotterToggle.onchange = (e) => {
              if (this.app.pushHistory) this.app.pushHistory();
              const enabled = Boolean(e.target.checked);
              setToleranceDisabled(!enabled);
              SETTINGS.plotterOptimize = enabled ? clampTolerance(tolNumber?.value || tolRange?.value || 0.1) : 0;
              if (toggleState) toggleState.textContent = enabled ? 'ON' : 'OFF';
              rerenderOptimizationPreview();
            };
          }
          if (tolRange) {
            tolRange.oninput = (e) => applyTolerance(e.target.value);
            tolRange.onchange = (e) => applyTolerance(e.target.value, { commit: true });
          }
          if (tolNumber) {
            tolNumber.oninput = (e) => applyTolerance(e.target.value);
            tolNumber.onchange = (e) => applyTolerance(e.target.value, { commit: true });
          }
          controlsWrap.appendChild(toggleControl);
          controlsWrap.appendChild(toleranceControl);

          card.appendChild(controlsWrap);
          return card;
        };

        const formatOptValue = (def, value) => {
          const { precision, unit } = getOptimizationDisplayConfig(def);
          const factor = Math.pow(10, precision);
          const displayValue = toOptimizationDisplayValue(def, value ?? 0);
          const rounded = Math.round(displayValue * factor) / factor;
          return `${rounded}${unit}`;
        };

        const buildRangeControl = (stepConfig, def) => {
          const control = document.createElement('div');
          control.className = 'optimization-control';
          const value = stepConfig[def.key] ?? getStepDefaults(stepConfig.id)[def.key] ?? def.min ?? 0;
          if (stepConfig[def.key] === undefined) stepConfig[def.key] = value;
          const { min, max, step } = getOptimizationDisplayConfig(def);
          const displayValue = toOptimizationDisplayValue(def, value);
          const editorDef = toOptimizationEditorDef(def);
          control.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">${getOptimizationLabel(def.label)}</label>
              <button type="button" class="value-chip text-xs text-vectura-accent font-mono">${formatOptValue(
                def,
                value
              )}</button>
            </div>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${displayValue}" class="w-full">
            <input type="text" class="value-input hidden bg-vectura-bg border border-vectura-border p-1 text-xs text-right w-20">
          `;
          const input = control.querySelector('input[type="range"]');
          const valueBtn = control.querySelector('.value-chip');
          const valueInput = control.querySelector('.value-input');
          if (input && valueBtn) {
            input.oninput = (e) => {
              const next = fromOptimizationDisplayValue(def, parseFloat(e.target.value));
              valueBtn.textContent = formatOptValue(def, next);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaults = getStepDefaults(stepConfig.id);
              if (defaults[def.key] === undefined) return;
              const next = defaults[def.key];
              input.value = toOptimizationDisplayValue(def, next);
              valueBtn.textContent = formatOptValue(def, next);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            });
            attachValueEditor({
              def: editorDef,
              valueEl: valueBtn,
              inputEl: valueInput,
              getValue: () => stepConfig[def.key],
              setValue: (displayVal, opts) => {
                applyOptimization((cfg) => {
                  const step = cfg.steps.find((s) => s.id === stepConfig.id);
                  if (step) step[def.key] = fromOptimizationDisplayValue(def, displayVal);
                });
              },
            });
          }
          return control;
        };

        const buildSelectControl = (stepConfig, def) => {
          const control = document.createElement('div');
          control.className = 'optimization-control';
          let value = stepConfig[def.key];
          if ((value === undefined || value === null) && def.options?.length) {
            value = def.options[0].value;
            stepConfig[def.key] = value;
          }
          const optionsHtml = (def.options || [])
            .map((opt) => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.label}</option>`)
            .join('');
          const currentLabel = def.options.find((opt) => opt.value === value)?.label || value;
          control.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">${def.label}</label>
              <span class="text-xs text-vectura-accent font-mono">${currentLabel}</span>
            </div>
            <select class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              ${optionsHtml}
            </select>
          `;
          const input = control.querySelector('select');
          const span = control.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              const next = e.target.value;
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
              span.textContent = def.options.find((opt) => opt.value === next)?.label || next;
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaults = getStepDefaults(stepConfig.id);
              const next = defaults[def.key] ?? def.options?.[0]?.value;
              if (next === undefined) return;
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
              input.value = next;
              span.textContent = def.options.find((opt) => opt.value === next)?.label || next;
            });
          }
          return control;
        };

        const buildCheckboxControl = (stepConfig, def) => {
          const control = document.createElement('div');
          control.className = 'optimization-control';
          const checked = Boolean(stepConfig[def.key]);
          control.innerHTML = `
            <div class="flex justify-between mb-1">
              <label class="control-label mb-0">${def.label}</label>
              <span class="text-xs text-vectura-accent font-mono">${checked ? 'ON' : 'OFF'}</span>
            </div>
            <input type="checkbox" ${checked ? 'checked' : ''} class="w-4 h-4">
          `;
          const input = control.querySelector('input');
          const span = control.querySelector('span');
          if (input && span) {
            input.onchange = (e) => {
              const next = Boolean(e.target.checked);
              span.textContent = next ? 'ON' : 'OFF';
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            };
            input.addEventListener('dblclick', (e) => {
              e.preventDefault();
              const defaults = getStepDefaults(stepConfig.id);
              if (defaults[def.key] === undefined) return;
              const next = Boolean(defaults[def.key]);
              input.checked = next;
              span.textContent = next ? 'ON' : 'OFF';
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === stepConfig.id);
                if (step) step[def.key] = next;
              });
            });
          }
          return control;
        };

        const bindReorderGrip = (grip, card, stepId) => {
          if (!grip) return;
          grip.onmousedown = (e) => {
            e.preventDefault();
            const dragEl = card;
            dragEl.classList.add('dragging');
            const indicator = document.createElement('div');
            indicator.className = 'optimization-drop-indicator';
            list.insertBefore(indicator, dragEl.nextSibling);
            const currentOrder = config.steps.map((step) => step.id);
            const startIndex = currentOrder.indexOf(stepId);
            const onMove = (ev) => {
              const y = ev.clientY;
              const items = Array.from(list.querySelectorAll('.optimization-card')).filter((item) => item !== dragEl);
              let inserted = false;
              for (const item of items) {
                const rect = item.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                  list.insertBefore(indicator, item);
                  inserted = true;
                  break;
                }
              }
              if (!inserted) list.appendChild(indicator);
            };
            const onUp = () => {
              dragEl.classList.remove('dragging');
              const siblings = Array.from(list.children);
              const indicatorIndex = siblings.indexOf(indicator);
              const before = siblings.slice(0, indicatorIndex).filter((node) => node.classList.contains('optimization-card'));
              const newIndex = before.length;
              indicator.remove();
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              if (newIndex === startIndex || newIndex < 0) return;
              applyOptimization((cfg) => {
                const order = cfg.steps.map((step) => step.id).filter((id) => id !== stepId);
                const targetIndex = Math.max(0, Math.min(order.length, newIndex));
                order.splice(targetIndex, 0, stepId);
                const map = new Map(cfg.steps.map((step) => [step.id, step]));
                cfg.steps = order.map((id) => map.get(id)).filter(Boolean);
              });
              this.buildControls();
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };
        };

        list.appendChild(buildExportSettingsCard());

        OPTIMIZATION_STEPS.forEach((def) => {
          const stepConfig = config.steps.find((step) => step.id === def.id) || { id: def.id, enabled: false, bypass: false };
          if (!config.steps.find((step) => step.id === def.id)) config.steps.push(stepConfig);
          const card = document.createElement('div');
          card.className = 'optimization-card';
          card.dataset.stepId = def.id;
          const header = document.createElement('div');
          header.className = 'optimization-card-header';
          header.innerHTML = `
            <div class="optimization-card-title">
              <button class="optimization-grip" type="button" aria-label="Reorder optimization">
                <span class="dot"></span><span class="dot"></span>
                <span class="dot"></span><span class="dot"></span>
                <span class="dot"></span><span class="dot"></span>
              </button>
              <span>${def.label}</span>
            </div>
            <div class="optimization-card-actions">
              <label class="opt-toggle"><input type="checkbox" ${stepConfig.enabled ? 'checked' : ''}>Apply</label>
              <label class="opt-toggle"><input type="checkbox" ${stepConfig.bypass ? 'checked' : ''}>Bypass</label>
            </div>
          `;
          const grip = header.querySelector('.optimization-grip');
          bindReorderGrip(grip, card, def.id);
          const [applyToggle, bypassStepToggle] = header.querySelectorAll('input[type="checkbox"]');
          if (applyToggle) {
            applyToggle.onchange = (e) => {
              const next = Boolean(e.target.checked);
              if (def.id === 'linesort' && next) {
                if (this.exportModalState?.isOpen) {
                  if ((this.exportModalState.previewMode || 'off') === 'off') {
                    this.exportModalState.previewMode = 'overlay';
                    const previewSelect = this.exportModalState.root?.querySelector('#export-preview-mode');
                    if (previewSelect) previewSelect.value = 'overlay';
                  }
                  SETTINGS.optimizationPreview = this.exportModalState.previewMode;
                } else if ((SETTINGS.optimizationPreview || 'off') === 'off') {
                  SETTINGS.optimizationPreview = 'overlay';
                }
              }
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === def.id);
                if (step) step.enabled = next;
              });
              this.buildControls();
            };
          }
          if (bypassStepToggle) {
            bypassStepToggle.onchange = (e) => {
              const next = Boolean(e.target.checked);
              applyOptimization((cfg) => {
                const step = cfg.steps.find((s) => s.id === def.id);
                if (step) step.bypass = next;
                cfg.bypassAll = (cfg.steps || []).every((s) => Boolean(s.bypass));
              });
              this.buildControls();
            };
          }
          card.appendChild(header);

          const controlsWrap = document.createElement('div');
          controlsWrap.className = 'optimization-controls';
          const isDisabled = !stepConfig.enabled || config.bypassAll;
          if (isDisabled) controlsWrap.classList.add('is-disabled');
          (def.controls || []).forEach((cDef) => {
            let control = null;
            if (cDef.type === 'select') control = buildSelectControl(stepConfig, cDef);
            else if (cDef.type === 'checkbox') control = buildCheckboxControl(stepConfig, cDef);
            else control = buildRangeControl(stepConfig, cDef);
            if (control) {
              const inputs = control.querySelectorAll('input, select, button');
              inputs.forEach((input) => {
                if (input.type === 'button') return;
                input.disabled = isDisabled;
              });
              controlsWrap.appendChild(control);
            }
          });
          card.appendChild(controlsWrap);
          list.appendChild(card);
        });

        panel.appendChild(list);
        target.appendChild(panel);
        updateStats();
      };

      if (!isGroup) {
        let groupTarget = null;
        for (const def of algoDefs) {
          if (def.type === 'collapsibleGroup') {
            if (this.treeRingParamsCollapsed === undefined) this.treeRingParamsCollapsed = true;
            const collapsed = this.treeRingParamsCollapsed;
            const group = document.createElement('div');
            group.className = 'algo-param-group';
            group.classList.toggle('collapsed', collapsed);
            const header = document.createElement('button');
            header.type = 'button';
            header.className = 'algo-param-group-header';
            header.innerHTML = `<span class="algo-param-group-title">${def.label}</span><span class="algo-param-group-toggle" aria-hidden="true"></span>`;
            const body = document.createElement('div');
            body.className = 'algo-param-group-body';
            if (collapsed) body.style.display = 'none';
            header.onclick = () => {
              this.treeRingParamsCollapsed = !this.treeRingParamsCollapsed;
              group.classList.toggle('collapsed', this.treeRingParamsCollapsed);
              body.style.display = this.treeRingParamsCollapsed ? 'none' : '';
            };
            group.appendChild(header);
            group.appendChild(body);
            container.appendChild(group);
            groupTarget = body;
          } else if (def.type === 'collapsibleGroupEnd') {
            groupTarget = null;
          } else {
            renderDef(def, groupTarget);
          }
        }
      }
      if (commonDefs.length) {
        container.appendChild(globalSection);
        commonDefs.forEach((def) => renderDef(def, globalBody));
      }
      const optimizationTarget = getEl('optimization-controls');
      if (optimizationTarget && this.exportModalState?.isOpen) {
        optimizationTarget.innerHTML = '';
        renderOptimizationPanel(optimizationTarget);
      }
      restoreLeftPanelScroll();
      if (this.exportModalState?.isOpen) {
        this.decorateExportControlsPanel();
        this.renderExportPreview();
      }
    }

    updateFormula() {
      const l = this.app.engine.getActiveLayer();
      if (!l) return;
      const formula = getEl('formula-display');
      const seedDisplay = getEl('formula-seed-display');
      if (formula) {
        const fmt = (val) => {
          if (typeof val === 'number') return Number.isFinite(val) ? val.toFixed(3) : `${val}`;
          if (typeof val === 'boolean') return val ? 'true' : 'false';
          if (val === null || val === undefined) return '';
          if (Array.isArray(val)) return val.map((item) => fmt(item)).join(', ');
          if (typeof val === 'object') return JSON.stringify(val);
          return `${val}`;
        };
        const entries = [];
        Object.entries(l.params || {}).forEach(([key, val]) => {
          if (key === 'pendulums' && Array.isArray(val)) {
            val.forEach((pend, idx) => {
              if (!pend || typeof pend !== 'object') return;
              Object.entries(pend).forEach(([pKey, pVal]) => {
                if (pKey === 'id') return;
                entries.push([`P${idx + 1}.${pKey}`, fmt(pVal)]);
              });
            });
            return;
          }
          if (key === 'noises' && Array.isArray(val)) {
            val.forEach((noise, idx) => {
              if (!noise || typeof noise !== 'object') return;
              Object.entries(noise).forEach(([nKey, nVal]) => {
                if (nKey === 'id' || nKey === 'imagePreview') return;
                entries.push([`N${idx + 1}.${nKey}`, fmt(nVal)]);
              });
            });
            return;
          }
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            Object.entries(val).forEach(([subKey, subVal]) => {
              entries.push([`${key}.${subKey}`, fmt(subVal)]);
            });
            return;
          }
          entries.push([key, fmt(val)]);
        });
        const formulaText = this.app.engine.getFormula(l.id);
        const formulaLines = `${formulaText || ''}`.split('\n').filter((line) => line.trim().length);
        const formulaHtml = formulaLines
          .map((line) => `<div class="formula-line">${escapeHtml(line)}</div>`)
          .join('');
        const valuesHtml = entries.length
          ? `
            <div class="formula-values">
              <div class="formula-values-title">Values</div>
              ${entries
                .map(
                  ([key, val]) =>
                    `<div class="formula-row"><span class="formula-key">${escapeHtml(
                      key
                    )}</span><span class="formula-val">${escapeHtml(val)}</span></div>`
                )
                .join('')}
            </div>
          `
          : '';
        formula.innerHTML = `
          <div class="formula-block">
            <div class="formula-equation">${formulaHtml || '<span class="text-vectura-muted">Select a layer...</span>'}</div>
            ${valuesHtml}
          </div>
        `;
      }
      if (seedDisplay) {
        seedDisplay.style.display = usesSeed(l.type) ? '' : 'none';
        seedDisplay.innerText = `Seed: ${l.params.seed}`;
      }
    }


    // ── Pattern Designer ── (see ui-pattern-designer.js)
  }

  Object.assign(UI.prototype, window.Vectura._UITouchMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIDocumentUnitsMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIRandomizationMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIPatternDesignerMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIPetalDesignerMixin || {});
  Object.assign(UI.prototype, window.Vectura._UINoiseRackMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIFileIOMixin || {});
  Object.assign(UI.prototype, window.Vectura._UIAutoColorizeMixin || {});

  window.Vectura = window.Vectura || {};
  window.Vectura.UI = UI;
})();
