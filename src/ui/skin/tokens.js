/*
 * Vectura Studio — skin/tokens.js
 *
 * Reads CSS custom properties off `document.documentElement`. Both UI code and the
 * canvas renderer call this whenever they need a theme/skin token (e.g.,
 * `--color-accent`, `--render-paper-outline`, `--ui-bg`).
 *
 * Phase 0 contract:
 *   - Exposes `window.Vectura.UI.tokens.get(name, fallback)` — the canonical entry.
 *   - Exposes `window.Vectura.UI.getThemeToken(name, fallback)` — back-compat alias.
 *   - Listens for `vectura:skin-change` to invalidate any internal caches (today the
 *     read is uncached so this is a no-op; the hook is in place for Phase 2 perf work).
 *
 * Reason for early extraction (per plan §2):
 *   In Phase 2 the legacy `src/ui/ui.js` stops being loaded as a single IIFE — its
 *   internal `const getThemeToken` would disappear and the renderer would break the
 *   moment the swap lands. Shipping this module in Phase 0 establishes the global
 *   contract so renderers and other modules can switch to it incrementally.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const get = (name, fallback = '') => {
    if (typeof document === 'undefined' || !document.documentElement) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };

  /**
   * Stash the active skin id on the document element. Called by SkinManager.
   * Today this just returns the result of `document.documentElement.dataset.uiSkin`,
   * but it lives here so a future cache invalidation can hook in.
   */
  const getActiveSkinId = () => {
    if (typeof document === 'undefined' || !document.documentElement) return null;
    return document.documentElement.dataset.uiSkin || null;
  };

  // No-op invalidate today; reserved for a memoized cache once renderer call counts
  // become measurable. Wired to vectura:skin-change so the contract is set.
  const invalidate = () => {};

  if (typeof document !== 'undefined') {
    document.addEventListener('vectura:skin-change', invalidate);
  }

  UI.tokens = { get, invalidate, getActiveSkinId };
  // Back-compat alias — older callers (and the closure-captured copy in ui.js) can
  // adopt this in any order without coordination.
  UI.getThemeToken = get;
})();
