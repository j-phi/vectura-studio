/*
 * Vectura Studio — UI utilities shared across Phase 1 components.
 *
 * Public API: window.Vectura.UI.utils.{ clamp, formatNumber, tabularNum,
 *                                       cssVarPx, prefersReducedMotion,
 *                                       getDrawableAlgorithmOptions,
 *                                       uid, on, off }
 *
 * Each helper is a pure function (no DOM mutation outside `on`/`off`). Loaded
 * before any component file in index.html / the test loader, so all components
 * can safely reference Vectura.UI.utils.<fn>.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const clamp = (value, min, max) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  };

  /**
   * Render `value` with `decimals` precision, trimming trailing zeros so
   * "12.500" → "12.5", "12.000" → "12". Used by slider value chips.
   */
  const formatNumber = (value, decimals = 2) => {
    if (!Number.isFinite(value)) return '';
    const fixed = value.toFixed(decimals);
    if (decimals === 0) return fixed;
    return fixed.replace(/\.?0+$/, '');
  };

  /**
   * Returns a string suitable for `font-variant-numeric: tabular-nums`-styled
   * displays — pads the integer portion with figure-spaces so values align
   * vertically in tight columns. `width` is the integer-digit count to pad to.
   */
  const tabularNum = (value, width = 3) => {
    const text = String(value);
    const [intPart, frac] = text.split('.');
    const padded = intPart.padStart(width, ' '); // U+2007 figure space
    return frac == null ? padded : `${padded}.${frac}`;
  };

  /**
   * Read a CSS pixel-value variable off documentElement, returning a number.
   * `--row-height: 30px` → 30. Falls back to `fallback` when unset/non-numeric.
   */
  const cssVarPx = (name, fallback = 0) => {
    if (typeof document === 'undefined' || !document.documentElement) return fallback;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : fallback;
  };

  const prefersReducedMotion = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
      return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  };

  let uidCounter = 0;
  const uid = (prefix = 'v') => `${prefix}-${(++uidCounter).toString(36)}-${Date.now().toString(36)}`;

  /**
   * Adds `handler` to `target` for `event` and returns a function that
   * removes it. Components collect these unsubscribers and invoke them
   * in `destroy()` so listener bookkeeping is centralized.
   */
  const on = (target, event, handler, options) => {
    if (!target || typeof target.addEventListener !== 'function') return () => {};
    target.addEventListener(event, handler, options);
    return () => target.removeEventListener(event, handler, options);
  };

  // Simple alias for symmetry; rarely used directly because `on` returns the
  // unsubscribe function. Provided so consumers that hold a ref to the handler
  // can still detach it without remembering the options bag.
  const off = (target, event, handler, options) => {
    if (!target || typeof target.removeEventListener !== 'function') return;
    target.removeEventListener(event, handler, options);
  };

  const getDrawableAlgorithmOptions = () => {
    const defaults = (window.Vectura && window.Vectura.ALGO_DEFAULTS) || {};
    return Object.keys(defaults)
      .filter((type) => {
        const def = defaults[type];
        return def && typeof def === 'object' && !def.hidden;
      })
      .map((type) => ({
        type,
        label: defaults[type]?.label || type.charAt(0).toUpperCase() + type.slice(1),
        is3d: !!defaults[type]?.is3d,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  /**
   * Canonical HTML escape — the single source of truth for `escapeHtml` across
   * the codebase. Escapes the five XSS-relevant characters (& < > " '). Non-
   * string inputs are coerced via `String(value ?? '')` so callers building
   * template strings never accidentally interpolate `undefined`/`null`/an
   * object literal that bypasses escaping.
   *
   * Order matters: `&` MUST be replaced first, otherwise the `&amp;` etc.
   * produced by later steps would themselves get re-escaped.
   *
   * Per docs/audit-2026-05-20.md (Redundancy-1 PR1), duplicate copies of this
   * helper previously diverged — one variant omitted the `'` → `&#39;`
   * substitution. Do not re-introduce a local copy; depend on this export
   * instead. The unit test `tests/unit/escape-html-single-source.test.js`
   * enforces that exactly one definition exists in src/.
   */
  const escapeHtml = (value) => {
    const str = typeof value === 'string' ? value : String(value ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * Resolves the icon-color for an algorithm id from the active layer-bar
   * palette (SETTINGS.layerBarPaletteId, default 'prism'). Single source for
   * the left-pane module dropdown, the Add Layer algorithm submenu, and the
   * contextual toolbar's algorithm switcher so their row colors can't drift.
   */
  const getAlgoMenuColor = (type) => {
    const SETTINGS = (window.Vectura && window.Vectura.SETTINGS) || {};
    const palettes = (window.Vectura && window.Vectura.LAYER_PALETTES) || [];
    const pid = SETTINGS.layerBarPaletteId || 'prism';
    const pal = palettes.find((p) => p.id === pid) || palettes.find((p) => p.id === 'prism');
    const colors = pal && pal.colors;
    if (!colors) return 'currentColor';
    return colors[type] || colors._default || 'currentColor';
  };

  /** Resolves the SVG icon markup for an algorithm id, falling back to `grid`. */
  const getAlgoMenuIcon = (type) => {
    const icons = (window.Vectura && window.Vectura.Icons && window.Vectura.Icons.layer) || {};
    const fn = icons[type] || icons.grid;
    return typeof fn === 'function' ? fn() : '';
  };

  /**
   * Renders the grouped `algo-group-div` + `lvl-algo-sub-item` menu markup
   * shared by the left-pane module dropdown, the Add Layer algorithm
   * submenu, and the contextual toolbar's algorithm switcher — the one place
   * all three build their rows from, so the list, icons, and colors can
   * never diverge. `items` is `getDrawableAlgorithmOptions()`-shaped;
   * `currentType` (optional) marks the active row with `gm-item-active`.
   */
  const renderAlgoMenuHTML = (items, currentType) => {
    const groupFn = window.Vectura && window.Vectura.groupAlgorithmsForMenu;
    const groups = typeof groupFn === 'function' ? groupFn(items || []) : [{ label: '', items: items || [] }];
    const parts = [];
    groups.forEach((group, gi) => {
      if (!group.items.length) return;
      parts.push(`<div class="algo-group-div${gi ? ' algo-group-sep' : ''}">${escapeHtml(group.label)}</div>`);
      group.items.forEach((item) => {
        const active = item.type === currentType ? ' gm-item-active' : '';
        const color = getAlgoMenuColor(item.type);
        const icon = getAlgoMenuIcon(item.type);
        parts.push(
          `<div class="lvl-algo-sub-item${active}" data-algo-type="${escapeHtml(item.type)}">` +
          `<span class="lvl-algo-sub-ico" style="color:${color}">${icon}</span>${escapeHtml(item.label)}</div>`,
        );
      });
    });
    return parts.join('');
  };

  UI.utils = {
    clamp,
    formatNumber,
    tabularNum,
    cssVarPx,
    prefersReducedMotion,
    getDrawableAlgorithmOptions,
    getAlgoMenuColor,
    getAlgoMenuIcon,
    renderAlgoMenuHTML,
    uid,
    on,
    off,
    escapeHtml,
  };
})();
