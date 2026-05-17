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
  const WALLPAPER_GROUP_IDS = window.Vectura?.WallpaperGroups?.GROUP_IDS || ['p1','p2','pm','pg','cm','pmm','pmg','pgg','cmm','p4','p4m','p4g','p3','p3m1','p31m','p6','p6m'];
  const WALLPAPER_GROUP_LABELS = window.Vectura?.WallpaperGroups?.GROUPS || {};
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

  const CONTROL_DEFS = window.Vectura?.UI?.CONTROL_DEFS;
  if (!CONTROL_DEFS) {
    console.warn('[UI] window.Vectura.UI.CONTROL_DEFS missing — load src/ui/controls-registry.js before src/ui/ui.js');
  }

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
      body: `
        <p class="modal-text">
          Mirrors copy and transform your layer's paths in real time. Choose a type that matches the kind of
          symmetry you want — you can stack multiple mirrors together for compound effects.
        </p>
        <div class="modal-section">
          <div class="modal-ill-label">Line</div>
          <p class="modal-text">
            Reflects your artwork across a straight line — like folding a piece of paper. You control the angle
            of the fold and how far the axis is shifted from center. The result is one mirrored copy alongside
            the original. Great for bilateral symmetry (left/right or top/bottom).
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Radial</div>
          <p class="modal-text">
            Spins copies of your artwork around a center point. Three modes are available:
            <br><br>
            <strong>Dihedral (kaleidoscope)</strong> — combines rotation with reflection, like a true kaleidoscope.
            N copies are arranged in a circle, alternating between original and mirrored.
            <br><br>
            <strong>Rotation only</strong> — repeats the original N times around the center with no mirroring.
            Think of a spinning pinwheel or fan blade.
            <br><br>
            <strong>Edge reflections</strong> — reflects along each slice boundary instead of the midpoint,
            producing a different symmetry feel with hard mirror edges between segments.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Arc</div>
          <p class="modal-text">
            Reflects geometry through a curved boundary — imagine looking at your art in a curved fun-house
            mirror. Points inside the circle get flipped to the outside (or vice versa), creating an inversion
            effect that stretches and compresses shapes in interesting ways. Use Strength to blend between
            the original and reflected position, and Falloff to fade the effect at the arc's edges.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Wallpaper</div>
          <p class="modal-text">
            Treats your artwork as a small tile and stamps it across the entire canvas — like bathroom
            floor tiles, gift wrap, or a repeating fabric. The <strong>Tile Width</strong> and
            <strong>Tile Height</strong> controls set the size of each repeat unit.
            <br><br>
            The difference from just tiling a copy is <em>symmetry</em>: each group specifies how
            copies are rotated, reflected, or shifted relative to one another, giving the repeat a
            distinctive visual character. There are exactly 17 mathematically distinct ways to do
            this — called wallpaper groups — ranging from a plain copy-paste grid (p1) to a full
            kaleidoscope with 6-fold rotation and 6 mirror axes (p6m).
            <br><br>
            Tap the <strong>(i)</strong> button next to the Group selector for plain-English
            descriptions of all 17 groups.
          </p>
        </div>
      `,
      hidePreview: true,
    },
    'mirror.wallpaperGroup': {
      title: 'Wallpaper Group',
      body: `
        <p class="modal-text">
          Mathematicians have proven there are exactly 17 ways to tile a flat surface with repeating symmetry.
          Each "wallpaper group" is a recipe that says which combination of moves — sliding, rotating,
          and reflecting — are used to fill the canvas. Your drawing is placed in one small tile, and the
          group determines how that tile is copied to cover the whole surface.
        </p>
        <p class="modal-text">
          The groups are organized by their grid shape: <strong>Oblique</strong> (any angle, most flexible),
          <strong>Rectangular</strong> (right-angle grid), <strong>Square</strong> (equal sides, 90° grid),
          and <strong>Hexagonal</strong> (60° grid, triangular or honeycomb base).
        </p>
        <div class="modal-section">
          <div class="modal-ill-label">Oblique grid — no mirrors, free angle</div>
          <p class="modal-text">
            <strong>p1 — Translation only.</strong> The simplest repeat: your tile is copied side-by-side and
            top-to-bottom with no flipping or turning. Like basic gift wrap or plain wallpaper. Every copy
            looks exactly the same and points the same way.
            <br><br>
            <strong>p2 — 180° Rotation.</strong> Each tile is also copied upside down. Think of a fabric
            where the motif alternates between right-side-up and flipped 180°. Still no mirrors — just
            a half-turn.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Rectangular grid — mirrors and glides</div>
          <p class="modal-text">
            <strong>pm — One mirror stripe.</strong> The tile is reflected left-right across a vertical (or
            horizontal) line, then the pair is tiled. Like a fence where every other plank is a mirror
            image. Creates clean bilateral symmetry in stripes.
            <br><br>
            <strong>pg — Glide reflection.</strong> Like pm, but the reflected copy is also shifted half
            a step before tiling. Think of alternating left and right footprints, or a brick stagger.
            There are no straight mirror lines — only the slide-then-flip combo.
            <br><br>
            <strong>cm — Diagonal mirror on a centered grid.</strong> Combines a mirror with a centered
            (offset-row) rectangular lattice. Creates patterns where diagonal stripes of mirrored pairs
            alternate across the surface.
            <br><br>
            <strong>pmm — Two perpendicular mirrors.</strong> Mirrors run both horizontally and vertically.
            Every tile is reflected in both directions, creating strong four-way symmetry. Like cross-stitch
            or classic quilt blocks — anything placed anywhere gets mirrored to all four quadrants.
            <br><br>
            <strong>pmg — One mirror plus one glide.</strong> One axis has a true mirror, the other has a
            glide reflection. More variety than pmm: some edges are reflected cleanly, others are reflected
            and shifted. Produces patterns with a lively but organized feel.
            <br><br>
            <strong>pgg — Two glide reflections.</strong> Two glide axes at right angles, but no straight
            mirrors at all. The result is an energetic, slightly pinwheel-like rectangular pattern. Commonly
            seen in woven fabric designs.
            <br><br>
            <strong>cmm — Two mirrors on a centered grid.</strong> Two perpendicular mirrors on a rhombic
            (centered) lattice. Rich rectangular symmetry — similar to pmm but the tile grid itself is
            diagonally centered, producing a different visual rhythm.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Square grid — fourfold rotation</div>
          <p class="modal-text">
            <strong>p4 — Fourfold spin only.</strong> Your tile is rotated at 0°, 90°, 180°, and 270°
            around each grid corner. Like a spinning pinwheel or propeller. No mirrors — just four
            quarter-turns. Works perfectly on a square grid.
            <br><br>
            <strong>p4m — Fourfold rotation plus all mirrors.</strong> The richest square pattern: four
            rotations and four mirror axes (both straight and diagonal). Every possible square symmetry
            is present. Think Islamic geometric tiles, bathroom floor patterns, or detailed mandalas.
            This is one of the most visually striking groups.
            <br><br>
            <strong>p4g — Fourfold rotation plus glide mirrors.</strong> Four rotations with glide
            reflections rather than straight mirrors. Similar to p4m but the mirror edges are offset,
            creating a subtly different "pinwheeling" square pattern. The tile sits at a 45° diagonal
            relative to p4m.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Hexagonal grid — threefold and sixfold rotation</div>
          <p class="modal-text">
            <strong>p3 — Threefold spin only.</strong> Three 120° rotations on a triangular grid. Your
            tile spins like a three-bladed fan or propeller. No mirrors — pure rotation. Honeycombs and
            triangular tessellations use this underlying structure.
            <br><br>
            <strong>p3m1 — Threefold rotation plus mirrors through the center.</strong> Adds three
            mirror axes that all pass through the rotation center. Creates highly symmetrical hexagonal
            patterns — think detailed snowflake-like designs or Celtic knotwork.
            <br><br>
            <strong>p31m — Threefold rotation plus mirrors through the edges.</strong> Similar to p3m1
            but the mirror axes run through tile edges instead of the rotation center. Slightly less
            symmetric feel — the mirrors don't all converge at one point, giving a different visual rhythm.
            <br><br>
            <strong>p6 — Sixfold spin only.</strong> Six copies at 60° intervals around each vertex —
            like a snowflake or a clock face. No mirrors, just pure 6-fold rotation. Creates elegant
            pinwheel hexagonal patterns.
            <br><br>
            <strong>p6m — Sixfold rotation plus all mirrors.</strong> The most symmetric group of all 17.
            Six rotations plus six mirror axes. Every possible hexagonal symmetry is present — like a
            full kaleidoscope on a hex grid. Think detailed snowflakes, stained glass rosettes, or
            intricate mandala patterns.
          </p>
        </div>
      `,
      hidePreview: true,
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

    // openColorModal is installed onto UI.prototype by ColorPicker.installOn().

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

    // pane-left methods (getLeftSectionDefaults, getLeftSectionMap,
    // setLeftSectionCollapsed, initLeftPanelSections,
    // setAlgorithmTransformCollapsed, initAlgorithmTransformSection,
    // setAboutVisible, initAboutSection) are installed onto UI.prototype
    // by PaneLeft.installOn() at IIFE bottom.

    // help-shortcuts methods (buildHelpContent, _applyHelpPlatform, openHelp)
    // are installed onto UI.prototype by HelpShortcuts.installOn().
    // _bindGridSettingsHandlers and _bindDocumentSetupHandlers are installed
    // by GridSettings.installOn() and DocumentSetup.installOn() respectively.

    // Delegated to src/ui/modals/grid-settings.js (Phase 3 step 2).
    _mountGridSettingsPanel() {
      const host = document.querySelector('main');
      return window.Vectura.UI.Modals.GridSettings.mount(host);
    }

    // Delegated to src/ui/modals/document-setup.js (Phase 3 step 3).
    _mountDocumentSetupPanel() {
      const host = document.querySelector('main');
      return window.Vectura.UI.Modals.DocumentSetup.mount(host);
    }

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
        this.app.engine.generate(layer.id);
      }
    }

    buildMirrorModifierControls(layer, container) {
      const modifier = this.getModifierState(layer);
      if (!modifier) return;
      const mirrors = Array.isArray(modifier.mirrors) ? modifier.mirrors : [];
      const stack = document.createElement('div');
      stack.id = 'mirror-stack';
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
              <option value="wallpaper">+ Wallpaper</option>
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
        if (this.app.pushHistory) this.app.pushHistory();
        fn();
        this.refreshModifierLayer(layer);
      };

      const buildField = (label, input, infoKey = null) => {
        const wrap = document.createElement('div');
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
          <option value="wallpaper">Wallpaper</option>
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
          } else if (mirror.type === 'wallpaper' && mirror.tileWidth === undefined) {
            mirror.group = 'p4m';
            mirror.tileWidth = 60;
            mirror.tileHeight = 60;
            mirror.tileAngle = 90;
            mirror.rotation = 0;
            mirror.centerX = 0;
            mirror.centerY = 0;
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
        } else if (mirrorType === 'wallpaper') {
          const groupSel = document.createElement('select');
          groupSel.className = inputClass;
          groupSel.innerHTML = WALLPAPER_GROUP_IDS.map((id) => {
            const def = WALLPAPER_GROUP_LABELS[id];
            const lbl = def ? def.label : id;
            return `<option value="${id}">${lbl}</option>`;
          }).join('');
          groupSel.value = mirror.group || 'p4m';
          groupSel.onchange = (e) => commit(() => { mirror.group = e.target.value; });
          controls.appendChild(buildField('Group', groupSel, 'mirror.wallpaperGroup'));
          buildNumberInput('Tile Width', 'tileWidth', '1', 60);
          buildNumberInput('Tile Height', 'tileHeight', '1', 60);
          buildNumberInput('Tile Angle (°)', 'tileAngle', '1', 90);
          buildNumberInput('Rotation (°)', 'rotation', '1', 0);
          buildNumberInput('Center X', 'centerX', '0.1', 0);
          buildNumberInput('Center Y', 'centerY', '0.1', 0);
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
            : addType === 'wallpaper' ? createWallpaperMirror(idx)
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

    getPenById(id) {
      return (SETTINGS.pens || []).find((pen) => pen.id === id) || null;
    }

    // pens-panel methods (setArmedPen, clearArmedPen, refreshArmedPenUI,
    // getPaletteList, getActivePalette, applyPaletteToPens, addPen, removePen,
    // initPaletteControls, renderPens) are installed onto UI.prototype by
    // PensPanel.installOn() at IIFE bottom.

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
      const addLayer = getEl('btn-add-layer');
      const insertMirrorModifier = getEl('btn-insert-mirror-modifier');
      const moduleSelect = getEl('generator-module');
      const bgColor = getEl('inp-bg-color');
      // Phase 3 step 3: settings-panel + btn-settings + btn-close-settings
      // wiring moved to modals/document-setup.js (invoked via
      // _bindDocumentSetupHandlers below). No locals needed here.
      const btnHelp = getEl('btn-help');
      const themeToggle = getEl('theme-toggle', { silent: true });
      const machineProfile = getEl('machine-profile');
      const setDocumentUnits = getEl('set-document-units', { silent: true });
      const setMargin = getEl('set-margin');
      const setMarginSlider = getEl('set-margin-slider', { silent: true });
      const setTruncate = getEl('set-truncate');
      const setCropExports = getEl('set-crop-exports');
      const setOutsideOpacity = getEl('set-outside-opacity');
      const setMarginLine = getEl('set-margin-line');
      const setMarginLineColorPill = getEl('set-margin-line-color-pill');
      const setMarginLineWeight = getEl('set-margin-line-weight');
      const setMarginLineWeightSlider = getEl('set-margin-line-weight-slider');
      const setMarginLineColor = getEl('set-margin-line-color');
      const setMarginLineDotting = getEl('set-margin-line-dotting');
      const setMarginLineDottingSlider = getEl('set-margin-line-dotting-slider', { silent: true });
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
      const btnGroupLayers = getEl('btn-group-layers');
      const btnUngroupLayers = getEl('btn-ungroup-layers');
      if (btnGroupLayers) btnGroupLayers.onclick = () => this.groupSelection();
      if (btnUngroupLayers) btnUngroupLayers.onclick = () => this.ungroupSelection();
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
            if (l.type !== 'shape') l.sourcePaths = null;
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

      const moduleTrigger = document.getElementById('generator-module-trigger');
      if (moduleTrigger) {
        moduleTrigger.addEventListener('click', () => {
          const select = getEl('generator-module', { silent: true });
          if (select?.disabled) return;
          const menu = document.getElementById('gm-module-menu');
          if (menu && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
          } else {
            this._showModuleMenu();
          }
        });
      }

      if (bgColor) {
        const bgColorPill = getEl('bg-color-pill', { silent: true });
        let armed = false;
        const updatePill = (color) => {
          if (!bgColorPill || !color) return;
          bgColorPill.textContent = color.toUpperCase();
          bgColorPill.style.background = color;
          bgColorPill.style.color = getContrastTextColor(color);
        };
        if (bgColorPill) {
          bgColorPill.onclick = () => {
            if (!armed && this.app.pushHistory) this.app.pushHistory();
            armed = true;
            openColorPickerAnchoredTo(bgColor, bgColorPill, { title: 'Background Color', uiInstance: this });
          };
        }
        bgColor.onfocus = () => {
          if (!armed && this.app.pushHistory) this.app.pushHistory();
          armed = true;
        };
        bgColor.oninput = (e) => {
          SETTINGS.bgColor = e.target.value;
          updatePill(e.target.value);
          this.app.render();
        };
        bgColor.onchange = (e) => {
          SETTINGS.bgColor = e.target.value;
          updatePill(e.target.value);
          armed = false;
          this.app.render();
        };
      }

      // Phase 3 step 3: open/close lifecycle moved to modals/document-setup.js.
      // Both onclick handlers forward to this.toggleSettingsPanel(). Guarded so
      // that bindGlobal() invoked through a stub `this` (used by some unit
      // tests) keeps working without mocking the delegator.
      if (typeof this._bindDocumentSetupHandlers === 'function') {
        this._bindDocumentSetupHandlers();
      }
      if (btnHelp) {
        btnHelp.onclick = () => this.openHelp(false);
      }
      const btnTour = getEl('btn-tour', { silent: true });
      const btnTourWelcome = getEl('btn-tour-welcome', { silent: true });
      const tourHandler = (e) => {
          e.stopPropagation();
          this.setTopMenuOpen(null, false);
          const hasContent = (this.app?.engine?.layers?.length ?? 0) > 0;
          const startTour = () => {
            SETTINGS.tourSeen = false;
            setTimeout(() => {
              window.Vectura.Tutorial?.start(() => {
                SETTINGS.tourSeen = true;
                this.app?.persistPreferences?.();
              });
            }, 0);
          };
          if (hasContent) {
            const body = '<p class="modal-text">Starting the tour will clear the current canvas. Continue?</p>'
              + '<div class="color-modal-actions" style="margin-top:16px;">'
              + '<button type="button" class="tour-cancel-btn">Cancel</button>'
              + '<button type="button" class="tour-continue-btn color-modal-apply">Continue</button>'
              + '</div>';
            this.openModal({ title: 'Clear Canvas?', body });
            this.modal.bodyEl.querySelector('.tour-cancel-btn').onclick = () => this.closeModal();
            this.modal.bodyEl.querySelector('.tour-continue-btn').onclick = () => {
              this.closeModal();
              if (this.app.pushHistory) this.app.pushHistory();
              this.app.engine.layers = [];
              this.app.engine.activeLayerId = null;
              this.app.setSelection?.([], null);
              this.renderLayers();
              this.buildControls();
              this.app.render();
              startTour();
            };
            return;
          }
          startTour();
      };
      if (btnTour) btnTour.onclick = tourHandler;
      if (btnTourWelcome) btnTourWelcome.onclick = tourHandler;
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
        const applyMargin = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.margin }));
          SETTINGS.margin = Number.isFinite(next) ? next : SETTINGS.margin;
          this.refreshDocumentUnitsUi();
          this.app.regen();
        };
        setMargin.oninput = (e) => applyMargin(e.target.value);
        setMargin.onchange = (e) => applyMargin(e.target.value, { commit: true });
        if (setMarginSlider) {
          setMarginSlider.oninput = (e) => applyMargin(e.target.value);
          setMarginSlider.onchange = (e) => applyMargin(e.target.value, { commit: true });
        }
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
        setMarginLineColorPill.onclick = () => openColorPickerAnchoredTo(setMarginLineColor, setMarginLineColorPill, { title: 'Margin Color', uiInstance: this });
        setMarginLineColor.oninput = (e) => {
          const next = e.target.value || SETTINGS.marginLineColor || '#52525b';
          SETTINGS.marginLineColor = next;
          setMarginLineColorPill.textContent = next.toUpperCase();
          setMarginLineColorPill.style.background = next;
          setMarginLineColorPill.style.color = getContrastTextColor(next);
          this.app.render();
        };
        setMarginLineColor.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const next = e.target.value || SETTINGS.marginLineColor || '#52525b';
          SETTINGS.marginLineColor = next;
          setMarginLineColorPill.textContent = next.toUpperCase();
          setMarginLineColorPill.style.background = next;
          setMarginLineColorPill.style.color = getContrastTextColor(next);
          this.app.render();
        };
      }
      if (setMarginLineDotting) {
        const applyMarginLineDotting = (raw, options = {}) => {
          const { commit = false } = options;
          if (commit && this.app.pushHistory) this.app.pushHistory();
          const next = Math.max(0, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.marginLineDotting ?? 0 }));
          SETTINGS.marginLineDotting = Number.isFinite(next) ? next : 0;
          this.refreshDocumentUnitsUi();
          this.app.render();
        };
        setMarginLineDotting.oninput = (e) => applyMarginLineDotting(e.target.value);
        setMarginLineDotting.onchange = (e) => applyMarginLineDotting(e.target.value, { commit: true });
        if (setMarginLineDottingSlider) {
          setMarginLineDottingSlider.oninput = (e) => applyMarginLineDotting(e.target.value);
          setMarginLineDottingSlider.onchange = (e) => applyMarginLineDotting(e.target.value, { commit: true });
        }
      }
      if (setMarginLineStyleReset) {
        setMarginLineStyleReset.onclick = () => {
          if (this.app.pushHistory) this.app.pushHistory();

          // Margin outline visibility
          SETTINGS.marginLineVisible = false;
          if (setMarginLine) {
            setMarginLine.checked = false;
            setMarginLine.closest('[role="switch"]')?.setAttribute('aria-checked', 'false');
          }

          // Margin outline style
          SETTINGS.marginLineColor = '#52525b';
          SETTINGS.marginLineWeight = 0.2;
          SETTINGS.marginLineDotting = 0;
          if (setMarginLineColor) setMarginLineColor.value = '#52525b';
          if (setMarginLineColorPill) {
            setMarginLineColorPill.textContent = '#52525B';
            setMarginLineColorPill.style.background = '#52525b';
            setMarginLineColorPill.style.color = getContrastTextColor('#52525b');
          }
          if (setMarginLineDotting) setMarginLineDotting.value = '0';
          if (setMarginLineDottingSlider) setMarginLineDottingSlider.value = '0';

          // Margin value
          SETTINGS.margin = 20;

          // Crop toggles
          SETTINGS.truncate = true;
          if (setTruncate) {
            setTruncate.checked = true;
            setTruncate.closest('[role="switch"]')?.setAttribute('aria-checked', 'true');
          }
          SETTINGS.cropExports = true;
          if (setCropExports) {
            setCropExports.checked = true;
            setCropExports.closest('[role="switch"]')?.setAttribute('aria-checked', 'true');
          }

          // Outside opacity
          SETTINGS.outsideOpacity = 0.5;
          if (setOutsideOpacity) setOutsideOpacity.value = '0.5';

          this.refreshDocumentUnitsUi();
          this.app.regen();
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
          SETTINGS.gridType = (SETTINGS.gridType && SETTINGS.gridType !== 'none') ? 'none' : 'standard';
          if (this.app.pushHistory) this.app.pushHistory();
          this.initSettingsValues();
          this.app.render();
          const p = getEl('top-menubar').querySelector('[data-top-menu-panel][aria-label="View menu"]');
          if (p) p.classList.remove('open');
        };
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

      if (setSelectionOutline) {
        setSelectionOutline.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          SETTINGS.selectionOutline = e.target.checked;
          this.app.render();
        };
      }
      if (setSelectionOutlineColorPill && setSelectionOutlineColor) {
        setSelectionOutlineColorPill.onclick = () =>
          openColorPickerAnchoredTo(setSelectionOutlineColor, setSelectionOutlineColorPill, { title: 'Selection Color', uiInstance: this });
        setSelectionOutlineColor.oninput = (e) => {
          const nextColor = e.target.value || SETTINGS.selectionOutlineColor || '#ef4444';
          SETTINGS.selectionOutlineColor = nextColor;
          setSelectionOutlineColorPill.textContent = nextColor.toUpperCase();
          setSelectionOutlineColorPill.style.background = nextColor;
          setSelectionOutlineColorPill.style.color = getContrastTextColor(nextColor);
          this.app.render();
        };
        setSelectionOutlineColor.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const nextColor = e.target.value || SETTINGS.selectionOutlineColor || '#ef4444';
          SETTINGS.selectionOutlineColor = nextColor;
          setSelectionOutlineColorPill.textContent = nextColor.toUpperCase();
          setSelectionOutlineColorPill.style.background = nextColor;
          setSelectionOutlineColorPill.style.color = getContrastTextColor(nextColor);
          this.app.render();
        };
      }
      const applySelectionOutlineWidth = (raw, options = {}) => {
        const { commit = false } = options;
        if (commit && this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(0.1, Math.min(2, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.selectionOutlineWidth ?? 0.15 })));
        SETTINGS.selectionOutlineWidth = Number.isFinite(next) ? next : 0.15;
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
          SETTINGS.selectionOutlineWidth = 0.15;
          if (setSelectionOutlineColorPill) {
            setSelectionOutlineColorPill.textContent = '#EF4444';
            setSelectionOutlineColorPill.style.background = '#ef4444';
            setSelectionOutlineColorPill.style.color = getContrastTextColor('#ef4444');
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
      const setShowTour = getEl('set-show-tour', { silent: true });
      if (setShowTour) {
        setShowTour.onchange = (e) => {
          SETTINGS.showTourOnFirstLaunch = e.target.checked;
          this.app?.persistPreferences?.();
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

      // ── Layer bar color palette picker ──────────────────────────────
      {
        const _updateSectBars = (p) => {
          const panel = document.getElementById('settings-panel');
          if (!panel) return;
          const preview = p?.preview || [];
          if (!preview.length) return;
          panel.querySelectorAll('[class*="sect--color-"]').forEach((sect, i) => {
            sect.style.setProperty('--sect-bar', preview[i % preview.length]);
          });
        };

        const _updateLBPTrigger = () => {
          const pid = SETTINGS.layerBarPaletteId || 'prism';
          const palettes = window.Vectura.LAYER_PALETTES || [];
          const p = palettes.find(x => x.id === pid);
          const nameEl = getEl('layer-bar-palette-name', { silent: true });
          const previewEl = getEl('layer-bar-palette-preview', { silent: true });
          if (nameEl) nameEl.textContent = p?.name || pid;
          if (previewEl) {
            previewEl.innerHTML = '';
            (p?.preview || []).forEach(hex => {
              const s = document.createElement('span');
              s.className = 'palette-swatch'; s.style.background = hex;
              previewEl.appendChild(s);
            });
          }
          _updateSectBars(p);
        };

        const _buildLBPMenu = () => {
          const menu = getEl('layer-bar-palette-menu', { silent: true });
          if (!menu) return;
          const palettes = window.Vectura.LAYER_PALETTES || [];
          const activePid = SETTINGS.layerBarPaletteId || 'prism';
          menu.innerHTML = '';
          palettes.forEach(p => {
            const row = document.createElement('div');
            row.className = 'palette-picker-row' + (p.id === activePid ? ' is-active' : '');
            const lbl = document.createElement('span');
            lbl.className = 'palette-picker-label'; lbl.textContent = p.name;
            row.appendChild(lbl);
            if (p.preview) {
              const sw = document.createElement('div'); sw.className = 'palette-picker-swatches';
              p.preview.forEach(hex => {
                const s = document.createElement('span');
                s.className = 'palette-swatch'; s.style.background = hex;
                sw.appendChild(s);
              });
              row.appendChild(sw);
            } else {
              const note = document.createElement('span');
              note.className = 'palette-picker-note'; note.textContent = 'uses pen color';
              row.appendChild(note);
            }
            row.addEventListener('click', () => {
              SETTINGS.layerBarPaletteId = p.id;
              this.app.persistPreferencesDebounced?.();
              _updateLBPTrigger();
              _buildLBPMenu();
              menu.classList.add('hidden');
              this.renderLayers?.();
              this._refreshAlgoSubmenuColors?.();
              this._refreshAlgoPickerColors?.();
              this._syncModuleDisplay?.();
            });
            menu.appendChild(row);
          });
        };

        const lbpTrigger = getEl('layer-bar-palette-trigger', { silent: true });
        if (lbpTrigger) {
          lbpTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = getEl('layer-bar-palette-menu', { silent: true });
            if (!menu) return;
            const opening = menu.classList.contains('hidden');
            menu.classList.toggle('hidden', !opening);
            if (opening) _buildLBPMenu();
          });
        }
        document.addEventListener('click', () => {
          getEl('layer-bar-palette-menu', { silent: true })?.classList.add('hidden');
        });
        _updateLBPTrigger();
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

      const TRANSLATION_KEYS = new Set(['posX', 'posY']);
      const bindTrans = (id, key) => {
        const el = getEl(id);
        if (!el) return;
        el.onchange = (e) => {
          // In multi-selection mode the transform inputs apply to every selected
          // layer; a blank value (placeholder "Multiple") means "leave unchanged".
          const selected = this.app.renderer?.getSelectedLayers?.() || [];
          const targets = selected.length > 1 ? selected : (this.app.engine.getActiveLayer() ? [this.app.engine.getActiveLayer()] : []);
          if (!targets.length) return;
          const rawValue = e.target.value;
          if (rawValue === '' || rawValue == null) return;
          if (this.app.pushHistory) this.app.pushHistory();
          if (TRANSLATION_KEYS.has(key)) {
            targets.forEach((layer) => {
              layer.params[key] = this.parseDocumentNumber(rawValue, { fallbackMm: layer.params[key] ?? 0 });
            });
          } else {
            const parsed = parseFloat(rawValue);
            if (!Number.isFinite(parsed)) return;
            targets.forEach((layer) => { layer.params[key] = parsed; });
          }
          // app.regen() only regenerates the active layer's geometry. For multi-
          // selection the other selected layers need an explicit generate() pass
          // so their baked paths pick up the new transform.
          if (targets.length > 1) {
            const activeId = this.app.engine.activeLayerId;
            targets.forEach((layer) => {
              if (layer.id !== activeId) this.app.engine.generate(layer.id);
            });
          }
          this.app.regen();
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

    // triggerTopMenuAction is installed onto UI.prototype by
    // MenuBar.installOn() at IIFE bottom.

    // shortcuts methods (handleTopMenuShortcut, bindShortcuts) are installed
    // onto UI.prototype by Shortcuts.installOn().

    _lvlGroupSel() {
      const renderer = this.app.renderer;
      const ids = [...(renderer?.selectedLayerIds || [])];
      if (ids.length < 2) return;
      const allLayers = this.app.engine.layers;
      const parents = new Set(ids.map((id) => allLayers.find((l) => l.id === id)?.parentId ?? null));
      if (parents.size > 1) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const parentId = [...parents][0];
      const minIdx = Math.min(...allLayers
        .filter((l) => (l.parentId ?? null) === parentId && ids.includes(l.id))
        .map((l) => allLayers.indexOf(l)));
      const gid = 'g' + Date.now();
      allLayers.splice(minIdx, 0, {
        id: gid, name: this.getUniqueLayerName('Group', gid), isGroup: true, groupType: null,
        visible: true, groupCollapsed: false, parentId: parentId ?? null,
      });
      ids.forEach((id) => {
        const l = allLayers.find((x) => x.id === id);
        if (l) l.parentId = gid;
      });
      renderer.setSelection([gid], gid);
      this.renderLayers();
      this.app.render();
    }

    _lvlUngroupSel() {
      this.ungroupSelection();
    }

    _lvlDelSel() {
      if (this.app.pushHistory) this.app.pushHistory();
      const ids = [...(this.app.renderer?.selectedLayerIds || [])];
      [...ids].reverse().forEach((id) => {
        this.unlockMirrorChildrenOnDelete(id);
        this.app.engine.removeLayer(id);
      });
      this.renderLayers();
      this.app.render();
    }

    _lvlDupSel() {
      if (this.app.pushHistory) this.app.pushHistory();
      [...(this.app.renderer?.selectedLayerIds || [])].forEach((id) => this.app.engine.duplicateLayer(id));
      this.renderLayers();
      this.app.render();
    }

    _lvlExpandSel() {
      let any = false;
      [...(this.app.renderer?.selectedLayerIds || [])].forEach((id) => {
        const l = this.app.engine.getLayerById?.(id);
        if (l?.isGroup && l.groupCollapsed) { l.groupCollapsed = false; any = true; }
      });
      if (any) this.renderLayers();
    }

    _lvlToggleVisibilitySel(hide) {
      const engine = this.app.engine;
      if (this.app.pushHistory) this.app.pushHistory();
      const newVis = !hide;
      [...(this.app.renderer?.selectedLayerIds || [])].forEach((id) => {
        const l = engine.getLayerById?.(id);
        if (l) l.visible = newVis;
      });
      engine.computeAllDisplayGeometry?.();
      this.app.render();
      this.renderLayers();
    }

    _lvlToggleLockSel(lock) {
      const selIds = [...(this.app.renderer?.selectedLayerIds || [])];
      selIds.forEach((id) => lock ? this.layerLockedIds.add(id) : this.layerLockedIds.delete(id));
      this.renderLayers();
    }

    _lvlMaskSelGroup() {
      const engine = this.app.engine;
      const renderer = this.app.renderer;
      const sel = [...(renderer?.selectedLayerIds || [])];
      const sorted = sel.map((id) => engine.getLayerById?.(id)).filter(Boolean)
        .sort((a, b) => engine.layers.indexOf(a) - engine.layers.indexOf(b));
      if (sorted.length < 2) return;
      const topL = sorted[0];
      if (!topL.maskCapabilities?.canSource && !topL.isGroup) return;
      if (this.app.pushHistory) this.app.pushHistory();
      // Enable mask on topL and move remaining layers to be its children
      topL.mask = topL.mask || {};
      topL.mask.enabled = true;
      sorted.slice(1).forEach((l) => { l.parentId = topL.id; });
      engine.computeAllDisplayGeometry?.();
      renderer.setSelection([topL.id], topL.id);
      this.renderLayers(); this.app.render?.();
    }

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

    createManualLayerFromPath(payload) {
      const path = Array.isArray(payload) ? payload : payload?.path;
      const anchors = Array.isArray(payload?.anchors) ? payload.anchors : null;
      const closed = Boolean(payload?.closed);
      if (!Layer || !Array.isArray(path) || path.length < 2) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const engine = this.app.engine;
      SETTINGS.globalLayerCount++;
      const id = Math.random().toString(36).slice(2, 11);
      const shapeType = payload?.shape?.type || null;
      const shapeTypeMap = { oval: 'shape', rect: 'shape', polygon: 'shape' };
      const layerType = shapeTypeMap[shapeType] || 'shape';
      const layer = new Layer(id, layerType, '');
      const active = engine.getActiveLayer ? engine.getActiveLayer() : null;
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
      const activeParent = active?.parentId ? engine.getLayerById(active.parentId) : null;
      layer.parentId = (active?.isGroup && active?.groupType === 'layer')
        ? active.id
        : (activeParent?.groupType === 'group' ? active.parentId : null);
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
      if (shapeType) {
        const shapeLabelMap = { rect: 'Rectangle', oval: 'Oval', polygon: 'Polygon' };
        layer.name = this.getUniqueLayerName(shapeLabelMap[shapeType] || 'Shape', id);
      } else {
        layer.name = this.getUniqueLayerName('Pen Path', id);
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
        if (layer.type !== 'shape' && !layer.parentId) {
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
        const children = this.splitShapeLayer(layer, segments);
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

    // image-asset methods (loadNoiseImageFile, openNoiseImageModal) are
    // installed onto UI.prototype by ImageAsset.installOn().

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

    _buildPatternFillPanel(container) {
      const isErase = this.activeTool === 'fill-pattern-erase';
      const layer = this.app.engine?.getActiveLayer?.();
      const PR = window.Vectura?.PatternRegistry;
      const patterns = PR?.getPatterns?.() || PR?.getAll?.() || [];

      const hdr = document.createElement('p');
      hdr.className = 'text-[11px] uppercase text-vectura-muted tracking-widest mb-3';
      hdr.textContent = isErase ? 'Erase Pattern Fill' : 'Pattern Fill';
      container.appendChild(hdr);

      if (patterns.length) {
        const browserHdr = document.createElement('p');
        browserHdr.className = 'text-[11px] uppercase text-vectura-muted tracking-widest mb-2';
        browserHdr.textContent = 'Pattern';
        container.appendChild(browserHdr);

        const list = document.createElement('div');
        list.className = 'flex flex-col gap-0.5 mb-4 overflow-y-auto';
        list.style.maxHeight = '10rem';
        const currentId = layer?.params?.patternId || '';
        patterns.forEach((pat) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'text-xs text-left px-2 py-1 rounded hover:bg-vectura-border transition-colors truncate';
          btn.style.color = pat.id === currentId ? 'var(--vectura-accent)' : '';
          btn.style.background = pat.id === currentId ? 'var(--vectura-border)' : '';
          btn.textContent = pat.name || pat.id;
          btn.title = pat.name || pat.id;
          btn.onclick = () => {
            if (layer) {
              layer.params = layer.params || {};
              layer.params.patternId = pat.id;
              this.storeLayerParams?.(layer);
              this.app.regen?.();
            }
            this._buildPatternFillPanel(container);
          };
          list.appendChild(btn);
        });
        container.appendChild(list);
      } else {
        // Phase 4: empty-state illustration for the pattern catalog.
        const ES = window.Vectura?.UI?.EmptyStates;
        if (ES && typeof ES.attach === 'function') {
          const wrap = document.createElement('div');
          wrap.className = 'pattern-empty-state-wrap';
          wrap.style.marginBottom = '16px';
          container.appendChild(wrap);
          ES.attach(wrap, {
            kind: 'patterns',
            title: 'No patterns yet',
            message: 'Open the Pattern Designer to create your first.',
          });
        } else {
          const msg = document.createElement('p');
          msg.className = 'text-xs text-vectura-muted mb-4';
          msg.textContent = 'No patterns registered.';
          container.appendChild(msg);
        }
      }

      if (!isErase) {
        const settingsHdr = document.createElement('p');
        settingsHdr.className = 'text-[11px] uppercase text-vectura-muted tracking-widest mb-2';
        settingsHdr.textContent = 'Fill Settings';
        container.appendChild(settingsHdr);

        this._patternFillSettings = this._patternFillSettings || { fillType: 'hatch', density: 1 };

        const fillTypes = [
          ['hatch', 'Hatch'], ['crosshatch', 'Crosshatch'], ['wavelines', 'Wavelines'],
          ['zigzag', 'Zigzag'], ['stipple', 'Stipple'], ['contour', 'Contour'],
          ['spiral', 'Spiral'], ['radial', 'Radial'],
        ];
        const typeRow = document.createElement('div');
        typeRow.className = 'mb-2';
        const typeLabel = document.createElement('label');
        typeLabel.className = 'control-label block mb-1';
        typeLabel.textContent = 'Fill Type';
        typeRow.appendChild(typeLabel);
        const typeSelect = document.createElement('select');
        typeSelect.className = 'w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none focus:border-vectura-accent';
        fillTypes.forEach(([v, label]) => {
          const o = document.createElement('option');
          o.value = v; o.textContent = label;
          typeSelect.appendChild(o);
        });
        typeSelect.value = this._patternFillSettings.fillType;
        typeSelect.onchange = () => { this._patternFillSettings.fillType = typeSelect.value; };
        typeRow.appendChild(typeSelect);
        container.appendChild(typeRow);

        const densRow = document.createElement('div');
        densRow.className = 'mb-2';
        const densLabel = document.createElement('label');
        densLabel.className = 'control-label block mb-1';
        densLabel.textContent = 'Density';
        densRow.appendChild(densLabel);
        const densInput = document.createElement('input');
        densInput.type = 'number'; densInput.step = '0.1'; densInput.min = '0.1'; densInput.max = '10';
        densInput.className = 'w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none focus:border-vectura-accent';
        densInput.value = this._patternFillSettings.density;
        densInput.oninput = () => { this._patternFillSettings.density = parseFloat(densInput.value) || 1; };
        densRow.appendChild(densInput);
        container.appendChild(densRow);
      }
    }

    _applyPatternFillFromCanvas({ tool, worldX, worldY }) {
      const layer = this.app.engine?.getActiveLayer?.();
      if (!layer || layer.type !== 'pattern') return;
      const AR = window.Vectura?.AlgorithmRegistry;
      if (!AR) return;
      const patternId = layer.params?.patternId;
      if (!patternId) return;
      const data = AR.patternGetGroups?.(patternId);
      if (!data) return;
      const scale = layer.params?.scale ?? 1;
      const originX = layer.params?.originX ?? 0;
      const originY = layer.params?.originY ?? 0;
      const tileSpacingX = layer.params?.tileSpacingX ?? 0;
      const tileSpacingY = layer.params?.tileSpacingY ?? 0;
      const { vbW, vbH } = data;
      const scaledW = (vbW + tileSpacingX) * scale;
      const scaledH = (vbH + tileSpacingY) * scale;
      if (scaledW <= 0 || scaledH <= 0) return;
      const tileX = (((worldX - originX) % scaledW) + scaledW) % scaledW / scale;
      const tileY = (((worldY - originY) % scaledH) + scaledH) % scaledH / scale;
      const hit = AR.patternGetFillTargetsAtPoint?.(patternId, tileX, tileY, { cache: true });
      const target = hit?.smallest;
      if (!target) return;

      this.app.pushHistory?.();
      if (!layer.params.patternFills) layer.params.patternFills = [];
      const isErase = tool === 'fill-pattern-erase';

      if (isErase) {
        layer.params.patternFills = layer.params.patternFills.filter(
          (f) => !this._fillMatchesTarget?.(f, target)
        );
      } else {
        const alreadyFilled = layer.params.patternFills.some(
          (f) => this._fillMatchesTarget?.(f, target)
        );
        if (!alreadyFilled) {
          const fs = this._patternFillSettings || {};
          const cloneRegion = (r) => (Array.isArray(r) ? r.map((pt) => ({ ...pt })) : []);
          const record = {
            id: `fill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            targetIds: [target.id],
            regions: (target.regions || []).map((r) => cloneRegion(r)),
            region: cloneRegion(target.outer || target.regions?.[0] || []),
            fillType: fs.fillType || 'hatch',
            density: fs.density ?? 1,
            penId: null,
            angle: 0,
            amplitude: 1.0,
            dotSize: 1.0,
            padding: 0,
            shiftX: 0,
            shiftY: 0,
          };
          layer.params.patternFills.push(record);
        }
      }

      this.storeLayerParams?.(layer);
      this.app.regen?.();
      this.app.renderer?.draw?.();
    }

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
      OPTIMIZATION_STEPS,
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
  if (window.Vectura?.UI?.LayersPanel?.bind) {
    window.Vectura.UI.LayersPanel.bind({ SETTINGS, escapeHtml, Layer });
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
  if (window.Vectura?.UI?.AlgorithmPanel?.bind) {
    window.Vectura.UI.AlgorithmPanel.bind({ getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms });
  }
  if (window.Vectura?.UI?.AlgorithmPanel?.installOn) {
    window.Vectura.UI.AlgorithmPanel.installOn(UI.prototype);
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
    window.Vectura.UI.Modals.DocumentSetup.bind({ getEl });
  }
  if (window.Vectura?.UI?.Modals?.DocumentSetup?.installOn) {
    window.Vectura.UI.Modals.DocumentSetup.installOn(UI.prototype);
  }

  // Phase 3 step 3 (second modal): register modals/info-modals.js. The
  // info-button micro-system — showInfo, showDuplicateNameError,
  // showValueError, attachInfoButton, attachStaticInfoButtons, bindInfoButtons.
  // Pulls INFO + buildPreviewPair from the IIFE-locals so the preview pipeline
  // (resolvePreviewConfig → buildVariantsFromDef → renderPreviewSvg) keeps
  // working unchanged.
  if (window.Vectura?.UI?.Modals?.InfoModals?.bind) {
    window.Vectura.UI.Modals.InfoModals.bind({
      INFO,
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
  if (window.Vectura?.UI?.Modals?.ExportSvg?.bind) {
    window.Vectura.UI.Modals.ExportSvg.bind({
      getEl,
      SETTINGS,
      clamp,
      getThemeToken,
      getContrastTextColor,
      EXPORT_INFO,
      OPTIMIZATION_STEPS,
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
