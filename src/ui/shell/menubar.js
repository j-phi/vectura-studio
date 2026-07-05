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
    if (open && trigger) {
      // Refresh per-item enabled state (e.g. export greyed when canvas empty)
      // before the panel reveals so the user sees current truth.
      try { this.refreshTopMenuItemStates?.(); } catch { /* defensive — never block menu open */ }
    }
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

  /**
   * Refresh enabled/disabled state on top-menu items whose availability
   * depends on document state. Currently gates `#btn-export` on whether the
   * canvas has anything to export (≥1 non-group layer).
   *
   * Called from setTopMenuOpen (when opening) and triggerTopMenuAction so
   * both pointer and keyboard-shortcut paths see fresh state.
   */
  function refreshTopMenuItemStates() {
    const { getEl } = requireDeps('refreshTopMenuItemStates');
    const setEnabled = (btnId, on, title) => {
      const el = getEl(btnId, { silent: true });
      if (!el) return;
      if (on) {
        el.removeAttribute('disabled');
        el.removeAttribute('aria-disabled');
        if (title) el.removeAttribute('title');
      } else {
        el.setAttribute('disabled', '');
        el.setAttribute('aria-disabled', 'true');
        if (title) el.setAttribute('title', title);
      }
    };

    const layers = this.app?.engine?.layers || [];
    const hasContent = layers.some((l) => l && !l.isGroup);
    setEnabled('btn-export', hasContent, 'Add a layer to enable export');

    // Mirror the canvas context-menu enabled states onto the Object/Edit menu
    // items so the same verbs gate identically (P3 feedback: every right-click
    // control lives in the menu system too).
    const CCM = window.Vectura && window.Vectura.UI && window.Vectura.UI.CanvasContextMenu;
    const st = (CCM && CCM.getCommandStates) ? CCM.getCommandStates() : {};
    setEnabled('btn-menu-duplicate', !!st.duplicate);
    setEnabled('btn-menu-delete', !!st.delete);
    setEnabled('btn-object-flip-h', !!st['flip-h']);
    setEnabled('btn-object-flip-v', !!st['flip-v']);
    setEnabled('btn-object-simplify', !!st.simplify);
    setEnabled('btn-object-smooth', !!st.smooth);
    setEnabled('btn-object-transform', !!st.transform);
    setEnabled('btn-object-edit-path', !!st.simplify); // pathEditable proxy

    const r = this.app?.renderer;
    const sel = (r && r.getSelectedLayers) ? (r.getSelectedLayers() || []) : [];
    // Group/Ungroup: Group when a multi selection; Ungroup when a group is
    // selected OR a group child is selected (ungroupSelection also extracts a
    // selected child from its parent — don't disable that path).
    setEnabled('btn-group-layers', !!st.group);
    setEnabled('btn-ungroup-layers', !!st.ungroup || sel.some((l) => l && l.parentId));
    // Isolate vs Exit Isolation are mutually exclusive by isolation state.
    const isolated = !!(this.app?.renderer?.groupEditMode?.groupId);
    setEnabled('btn-object-isolate', !!st.isolate && !isolated);
    setEnabled('btn-object-exit-isolation', isolated);

    setEnabled('btn-object-outline-text', sel.some((l) => l && l.type === 'text'));
    setEnabled('btn-object-lock', sel.length > 0);
    const locked = this.app?.ui?.layerLockedIds;
    setEnabled('btn-object-unlock', !!(locked && locked.size > 0));

    // Contextual Task Bar checkmark reflects the current enabled state.
    const cbCheck = getEl('view-context-bar-checkmark', { silent: true });
    if (cbCheck) {
      const CB = window.Vectura && window.Vectura.UI && window.Vectura.UI.ContextBar;
      const on = (CB && CB.isEnabled) ? CB.isEnabled() : true;
      cbCheck.style.visibility = on ? 'visible' : 'hidden';
    }
  }

  // Wire the Object/Edit/View menu commands added for P3. Each reuses an
  // existing verb: context-menu commands via CanvasContextMenu.runCommand, plus
  // a few task-bar-only verbs (edit path, lock/unlock, outline text, task-bar
  // toggle). Idempotent per element.
  function wireTopMenuCommands() {
    const { getEl } = requireDeps('wireTopMenuCommands');
    const ccm = () => (window.Vectura && window.Vectura.UI && window.Vectura.UI.CanvasContextMenu) || null;
    const run = (id) => { const m = ccm(); if (m && m.runCommand) m.runCommand(id); };
    const self = this;
    const wire = (btnId, fn) => {
      const el = getEl(btnId, { silent: true });
      if (!el || el._vecturaMenuWired) return;
      el._vecturaMenuWired = true;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        try { fn(); } finally { self.setTopMenuOpen(null, false); }
      });
    };

    wire('btn-menu-duplicate', () => run('duplicate'));
    wire('btn-menu-delete', () => run('delete'));
    wire('btn-object-flip-h', () => run('flip-h'));
    wire('btn-object-flip-v', () => run('flip-v'));
    wire('btn-object-isolate', () => run('isolate'));
    // Exit Isolation must work even with no selection (an isolated empty blend);
    // buildItems()/runCommand only expose it when something is selected, so call
    // the renderer verb directly to match the isolation-based enabled gate.
    wire('btn-object-exit-isolation', () => { self.app?.renderer?.exitGroupEditMode?.(); });
    wire('btn-object-simplify', () => run('simplify'));
    wire('btn-object-smooth', () => run('smooth'));
    wire('btn-object-transform', () => run('transform'));
    wire('btn-object-edit-path', () => {
      const a = self.app;
      if (a && a.ui && typeof a.ui.setActiveTool === 'function') a.ui.setActiveTool('direct');
      else a?.renderer?.setTool?.('direct');
    });
    wire('btn-object-lock', () => self._menuToggleLock(true));
    wire('btn-object-unlock', () => self._menuToggleLock(false));
    wire('btn-object-outline-text', () => self._menuOutlineText());
    wire('btn-view-context-bar-toggle', () => {
      const CB = window.Vectura && window.Vectura.UI && window.Vectura.UI.ContextBar;
      if (CB && CB.setEnabled && CB.isEnabled) CB.setEnabled(!CB.isEnabled());
      self.refreshTopMenuItemStates();
    });
  }

  function _menuToggleLock(lock) {
    const a = this.app;
    const ui = a && a.ui;
    const r = a && a.renderer;
    if (!ui || !ui.layerLockedIds) return;
    if (lock) {
      const ids = (r && r.selectedLayerIds) ? Array.from(r.selectedLayerIds) : [];
      ids.forEach((id) => ui.layerLockedIds.add(id));
    } else {
      ui.layerLockedIds.clear(); // "Unlock All"
    }
    ui.renderLayers?.();
    a.render?.();
  }

  function _menuOutlineText() {
    const a = this.app;
    const r = a && a.renderer;
    const ops = window.Vectura && window.Vectura.TextOutlineOps;
    if (!ops || typeof ops.outlineText !== 'function' || !r) return;
    const sel = (r.getSelectedLayers ? r.getSelectedLayers() : []) || [];
    const text = sel.find((l) => l && l.type === 'text');
    if (text) ops.outlineText(text.id, { app: a });
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

    // Wire the P3 Object/Edit/View command items (reuse context-menu verbs).
    try { this.wireTopMenuCommands(); } catch { /* defensive */ }
  }

  function triggerTopMenuAction(buttonId) {
    const { getEl } = requireDeps('triggerTopMenuAction');
    const button = getEl(buttonId);
    if (!button) return false;
    try { this.refreshTopMenuItemStates?.(); } catch { /* defensive */ }
    if (button.disabled) {
      this.setTopMenuOpen(null, false);
      return false;
    }
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
    refreshTopMenuItemStates,
    wireTopMenuCommands,
    installOn(proto) {
      proto.setTopMenuOpen = function(trigger = null, open = true) { return setTopMenuOpen.call(this, trigger, open); };
      proto.initTopMenuBar = function() { return initTopMenuBar.call(this); };
      proto.triggerTopMenuAction = function(buttonId) { return triggerTopMenuAction.call(this, buttonId); };
      proto.refreshTopMenuItemStates = function() { return refreshTopMenuItemStates.call(this); };
      proto.wireTopMenuCommands = function() { return wireTopMenuCommands.call(this); };
      proto._menuToggleLock = function(lock) { return _menuToggleLock.call(this, lock); };
      proto._menuOutlineText = function() { return _menuOutlineText.call(this); };
    },
  };
})();
