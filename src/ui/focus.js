/*
 * Vectura Studio — focus-trap + focus-ring helpers (Phase 1).
 *
 * Public API: window.Vectura.UI.focus.{ getFocusable, trap, restoreOnReturn }
 *
 * Used primarily by overlays/modal.js and overlays/menu.js. Focus rings on
 * controls are pure CSS (`:focus-visible`); this module is for the trap logic.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  // Selector roughly equivalent to WAI-ARIA "tabbable" semantics. Excludes
  // `[tabindex="-1"]` and disabled controls.
  const FOCUSABLE_SELECTOR = [
    'a[href]:not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const getFocusable = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
      // Skip elements inside [hidden] subtrees.
      if (el.hasAttribute('disabled')) return false;
      if (el.closest('[hidden]') && el.closest('[hidden]') !== el) return false;
      // JSDOM lacks layout, so we can't filter on offsetParent reliably; the
      // basic selector + disabled guard is what matters in tests.
      return true;
    });
  };

  /**
   * Install a Tab/Shift-Tab cycle inside `root`. Returns a `release()` that
   * removes the keydown listener. Caller is responsible for setting initial
   * focus — typically `root.querySelector('[autofocus]')` or the first
   * focusable element from `getFocusable()`.
   */
  const trap = (root) => {
    if (!root) return { release() {} };
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable(root);
      if (!focusable.length) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = root.ownerDocument.activeElement;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', handler);
    return {
      release() {
        root.removeEventListener('keydown', handler);
      },
    };
  };

  /**
   * Captures the currently active element so it can be restored later
   * (e.g., after a modal closes). Returns `restore()`.
   */
  const restoreOnReturn = (doc = document) => {
    const previous = doc && doc.activeElement;
    return () => {
      if (previous && typeof previous.focus === 'function' && doc.contains(previous)) {
        previous.focus();
      }
    };
  };

  UI.focus = { getFocusable, trap, restoreOnReturn, FOCUSABLE_SELECTOR };
})();
