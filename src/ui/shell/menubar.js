/**
 * Vectura menubar (Phase 2 step 3 second extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.MenuBar — currently setTopMenuOpen(),
 * initTopMenuBar(), and triggerTopMenuAction(), lifted verbatim from the
 * legacy `class UI` IIFE. The legacy UI prototype keeps thin delegators that
 * `.call(this)` into this module so `this` remains the UI instance and state
 * (`this.openTopMenuTrigger`, `this.topMenuTriggers`) lives on the instance
 * exactly as it did before extraction.
 *
 * `handleTopMenuShortcut()` and `bindShortcuts()` are NOT moved here: per §2.4
 * they route to `src/ui/shortcuts.js` (Phase 2 step 5). The shortcut handler
 * also calls back into menubar via `this.triggerTopMenuAction(...)`, which now
 * resolves through the prototype delegator into this module.
 *
 * Closure-captured legacy IIFE locals (just `getEl`) are injected once via
 * MenuBar.bind(deps) from the legacy ui.js IIFE, mirroring the
 * algo-config-panel and theme-switcher patterns.
 *
 * Compile gate at tests/unit/menubar-compile.test.js mirrors
 * theme-switcher-compile — JSDOM load + contract surface + clear pre-bind
 * error + smoke test on a constructed top-menubar fixture.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`MenuBar.${name} invoked before MenuBar.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function setTopMenuOpen(trigger = null, open = true) {
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

  function initTopMenuBar() {
    const { getEl } = requireDeps('initTopMenuBar');
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

  function triggerTopMenuAction(buttonId) {
    const { getEl } = requireDeps('triggerTopMenuAction');
    const button = getEl(buttonId);
    if (!button) return false;
    button.click();
    this.setTopMenuOpen(null, false);
    return true;
  }

  UI.MenuBar = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    setTopMenuOpen,
    initTopMenuBar,
    triggerTopMenuAction,
    installOn(proto) {
      proto.setTopMenuOpen = function(trigger = null, open = true) { return setTopMenuOpen.call(this, trigger, open); };
      proto.initTopMenuBar = function() { return initTopMenuBar.call(this); };
      proto.triggerTopMenuAction = function(buttonId) { return triggerTopMenuAction.call(this, buttonId); };
    },
  };
})();
