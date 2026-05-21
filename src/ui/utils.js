/*
 * Vectura Studio — UI utilities shared across Phase 1 components.
 *
 * Public API: window.Vectura.UI.utils.{ clamp, formatNumber, tabularNum,
 *                                       cssVarPx, prefersReducedMotion,
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

  UI.utils = { clamp, formatNumber, tabularNum, cssVarPx, prefersReducedMotion, uid, on, off, escapeHtml };
})();
