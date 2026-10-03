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
    try { this.initPhoneHeader(); } catch (err) { console.warn('Phone header init failed', err); }
  }


  // ─── TUX-001: phone header ───────────────────────────────────────────────────────────────
  // In phone layout (body.phone-layout, set by the layout classifier) the header shows a
  // hamburger plus five direct buttons. The six menus stay the existing [data-top-menu] nodes:
  // CSS lays the open panel out as a full-width sheet level. Nothing is cloned, so every id and
  // every listener bound by id keeps working.
  const ICONS = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    generator: '<path d="M5 4v6M5 14v6M12 4v2M12 10v10M19 4v10M19 18v2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="19" cy="16" r="2"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    export: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
  };
  const svg = (name) => `<svg class="phone-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  function initPhoneHeader() {
    const { getEl } = requireDeps('initPhoneHeader');
    const ui = this;
    const header = getEl('app-header', { silent: true });
    const main = header && header.querySelector('.header-main');
    const brand = main && main.querySelector('.header-brand-menu');
    const nav = getEl('top-menubar', { silent: true });
    if (!main || !brand || !nav || ui._phoneHeader) return;
    const triggers = Array.isArray(ui.topMenuTriggers) ? ui.topMenuTriggers : [];
    const body = document.body;
    const isPhone = () => body.classList.contains('phone-layout');

    const makeButton = (id, cls, label, icon) => {
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.className = `phone-header-btn ${cls}`;
      b.setAttribute('aria-label', label);
      b.title = label;
      b.innerHTML = svg(icon);
      return b;
    };
    const ham = makeButton('btn-menu-hamburger', 'phone-header-menu', 'Menu', 'menu');
    ham.setAttribute('aria-haspopup', 'menu');
    ham.setAttribute('aria-expanded', 'false');
    ham.setAttribute('aria-controls', 'phone-menu-sheet');
    brand.insertBefore(ham, brand.children[1] || null);

    const bGen = makeButton('btn-header-generator', 'phone-header-action', 'Generator panel', 'generator');
    const bLayers = makeButton('btn-header-layers', 'phone-header-action', 'Layers panel', 'layers');
    const bUndo = makeButton('btn-header-undo', 'phone-header-action', 'Undo', 'undo');
    const bRedo = makeButton('btn-header-redo', 'phone-header-action', 'Redo', 'redo');
    const bExport = makeButton('btn-header-export', 'phone-header-action', 'Export', 'export');
    const actions = document.createElement('div');
    actions.id = 'phone-header-actions';
    actions.className = 'phone-header-actions';
    const group = (...btns) => {
      const g = document.createElement('div');
      g.className = 'phone-header-group';
      btns.forEach((b) => g.appendChild(b));
      return g;
    };
    actions.append(group(bGen, bLayers), group(bUndo, bRedo, bExport));
    brand.after(actions);

    // Sheet: backdrop + root list. The six rows are enumerated from the DOM triggers.
    const backdrop = document.createElement('div');
    backdrop.id = 'phone-menu-backdrop';
    backdrop.className = 'phone-menu-backdrop';
    backdrop.hidden = true;
    const sheet = document.createElement('div');
    sheet.id = 'phone-menu-sheet';
    sheet.className = 'phone-menu-sheet';
    sheet.hidden = true;
    const root = document.createElement('div');
    root.id = 'phone-menu-root';
    root.className = 'phone-menu-root';
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-label', 'Main menu');
    triggers.forEach((trigger) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'phone-menu-row';
      row.setAttribute('role', 'menuitem');
      row.setAttribute('aria-haspopup', 'menu');
      row.dataset.menuTarget = trigger.id;
      const label = document.createElement('span');
      label.textContent = (trigger.textContent || '').trim();
      row.append(label);
      row.insertAdjacentHTML('beforeend', svg('chevron'));
      root.appendChild(row);
    });
    const themeRow = document.createElement('button');
    themeRow.type = 'button';
    themeRow.className = 'phone-menu-row phone-menu-theme';
    themeRow.setAttribute('role', 'menuitem');
    themeRow.dataset.phoneTheme = '';
    themeRow.innerHTML = '<span>Theme</span><span class="phone-menu-theme-value"></span>';
    root.appendChild(themeRow);
    sheet.appendChild(root);
    header.append(backdrop, sheet);

    const state = { open: false, level: null, backing: false };
    const origSetOpen = ui.setTopMenuOpen.bind(ui);
    const rows = () => Array.from(root.querySelectorAll('.phone-menu-row'));
    const panelOf = (trigger) => trigger?.parentElement?.querySelector('[data-top-menu-panel]') || null;
    const menuOf = (trigger) => trigger?.closest('[data-top-menu]') || null;

    const refreshThemeRow = () => {
      const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
      const name = `${SETTINGS.uiTheme || 'dark'}`.replace(/-/g, ' ');
      themeRow.querySelector('.phone-menu-theme-value').textContent = name.charAt(0).toUpperCase() + name.slice(1);
    };

    const placeSheet = () => {
      const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      document.documentElement.style.setProperty('--phone-sheet-top', `${bottom}px`);
    };

    const clearLevel = () => {
      menuOf(state.level)?.classList.remove('phone-active');
      state.level = null;
      body.classList.remove('phone-menu-level');
      root.hidden = false;
    };

    const closeSheet = ({ restoreFocus = false } = {}) => {
      if (!state.open) return;
      state.open = false;
      state.backing = true;
      try { origSetOpen(null, false); } finally { state.backing = false; }
      clearLevel();
      sheet.hidden = true;
      backdrop.hidden = true;
      body.classList.remove('phone-menu-open');
      ham.setAttribute('aria-expanded', 'false');
      if (restoreFocus) ham.focus();
    };

    const openLevel = (trigger, { focus = true } = {}) => {
      clearLevel();
      state.level = trigger;
      state.backing = true;
      try { origSetOpen(trigger, true); } finally { state.backing = false; }
      menuOf(trigger)?.classList.add('phone-active');
      body.classList.add('phone-menu-level');
      root.hidden = true;
      if (focus) {
        const items = Array.from(panelOf(trigger)?.querySelectorAll('.top-menu-item:not([disabled]):not(.phone-menu-back)') || []);
        (items[0] || panelOf(trigger)?.querySelector('.phone-menu-back'))?.focus();
      }
    };

    const openSheet = () => {
      if (state.open || !isPhone()) return;
      state.open = true;
      try { ui.refreshTopMenuItemStates?.(); } catch { /* defensive */ }
      refreshThemeRow();
      placeSheet();
      backdrop.hidden = false;
      sheet.hidden = false;
      root.hidden = false;
      body.classList.add('phone-menu-open');
      ham.setAttribute('aria-expanded', 'true');
      rows()[0]?.focus();
    };

    const backToRoot = () => {
      const from = state.level;
      state.backing = true;
      try { origSetOpen(null, false); } finally { state.backing = false; }
      clearLevel();
      Array.from(root.querySelectorAll('[data-menu-target]')).find((r) => r.dataset.menuTarget === from?.id)?.focus();
    };

    // Keep the one menu model honest: any code path that opens a panel (tutorial, shortcuts)
    // shows it as a sheet level; any path that closes it (item click, document click) closes the
    // sheet while a level is showing.
    ui.setTopMenuOpen = (trigger = null, open = true) => {
      const result = origSetOpen(trigger, open);
      if (state.backing || !isPhone()) return result;
      if (open && trigger) {
        if (!state.open) {
          state.open = true;
          refreshThemeRow();
          placeSheet();
          backdrop.hidden = false;
          sheet.hidden = false;
          body.classList.add('phone-menu-open');
          ham.setAttribute('aria-expanded', 'true');
        }
        clearLevel();
        state.level = trigger;
        menuOf(trigger)?.classList.add('phone-active');
        body.classList.add('phone-menu-level');
        root.hidden = true;
      } else if (state.level) {
        closeSheet();
      }
      return result;
    };

    // Back rows exist only in phone layout, so the inline dropdowns keep their original items.
    const syncPhoneMode = () => {
      const phone = isPhone();
      triggers.forEach((trigger) => {
        const panel = panelOf(trigger);
        if (!panel) return;
        const existing = panel.querySelector(':scope > .phone-menu-back');
        if (phone && !existing) {
          const back = document.createElement('button');
          back.type = 'button';
          back.className = 'top-menu-item phone-menu-back';
          back.setAttribute('role', 'menuitem');
          back.setAttribute('aria-label', `Back to main menu from ${(trigger.textContent || '').trim()}`);
          back.innerHTML = `${svg('back')}<span class="phone-menu-back-label">Back</span><span class="phone-menu-back-title"></span>`;
          back.querySelector('.phone-menu-back-title').textContent = (trigger.textContent || '').trim();
          back.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); backToRoot(); });
          panel.insertBefore(back, panel.firstChild);
        } else if (!phone && existing) {
          existing.remove();
        }
      });
      if (!phone && state.open) closeSheet();
    };

    // Row taps never reach the document click handler (ui.js closes menus on any click).
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = e.target.closest('.phone-menu-row');
      if (!row) return;
      if (row.dataset.menuTarget) {
        const trigger = triggers.find((t) => t.id === row.dataset.menuTarget);
        if (trigger) openLevel(trigger);
        return;
      }
      if (row.hasAttribute('data-phone-theme')) {
        getEl('theme-toggle', { silent: true })?.click();
        refreshThemeRow();
      }
    });
    root.addEventListener('keydown', (e) => {
      const list = rows();
      const i = list.indexOf(document.activeElement);
      const go = (n) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
      if (e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(list.length - 1);
    });
    sheet.addEventListener('click', (e) => e.stopPropagation());
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    backdrop.addEventListener('pointerdown', (e) => e.stopPropagation());
    backdrop.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    backdrop.addEventListener('mousedown', swallow);
    backdrop.addEventListener('click', (e) => { swallow(e); closeSheet(); });

    ham.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.open) closeSheet({ restoreFocus: true });
      else openSheet();
    });

    // Escape: level -> root, root -> closed with focus back on the hamburger.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !state.open) return;
      e.preventDefault();
      e.stopPropagation();
      if (state.level) backToRoot();
      else closeSheet({ restoreFocus: true });
    }, true);

    // Rotation or a width change closes the sheet (iOS also fires resize for URL bar changes).
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      if (state.open) closeSheet();
    });
    window.addEventListener('orientationchange', () => { if (state.open) closeSheet(); });
    try {
      new MutationObserver(syncPhoneMode).observe(body, { attributes: true, attributeFilter: ['class'] });
    } catch { /* no MutationObserver */ }

    // Direct actions share the command registry that shortcuts.js uses.
    const direct = (btn, fn) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      if (state.open) closeSheet();
      fn();
    });
    direct(bUndo, () => ui.triggerTopMenuAction('btn-undo'));
    direct(bRedo, () => ui.triggerTopMenuAction('btn-redo'));
    direct(bExport, () => ui.triggerTopMenuAction('btn-export'));
    direct(bGen, () => getEl('btn-mobile-pane-left', { silent: true })?.click());
    direct(bLayers, () => getEl('btn-mobile-pane-right', { silent: true })?.click());

    // Live enabled state.
    const setState = (btn, on, why) => {
      btn.disabled = !on;
      if (on) { btn.removeAttribute('aria-disabled'); btn.title = btn.getAttribute('aria-label'); }
      else { btn.setAttribute('aria-disabled', 'true'); btn.title = why; }
    };
    const refreshHeaderState = () => {
      const app = ui.app;
      if (!app) return;
      const layers = app.engine?.layers || [];
      setState(bUndo, (app.history?.length || 0) >= 2, 'Nothing to undo');
      setState(bRedo, (app.redoStack?.length || 0) > 0, 'Nothing to redo');
      setState(bExport, layers.some((l) => l && !l.isGroup), 'Add a layer to enable export');
    };
    ui.refreshPhoneHeaderState = refreshHeaderState;
    const app = ui.app;
    if (app) {
      // History moves and every render (layer add/remove always re-renders) refresh the state.
      let queued = false;
      const queueRefresh = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => { queued = false; refreshHeaderState(); });
      };
      ['pushHistory', 'undo', 'redo', 'render'].forEach((name) => {
        const orig = app[name];
        if (typeof orig !== 'function') return;
        app[name] = function wrapped(...args) {
          const out = orig.apply(this, args);
          queueRefresh();
          return out;
        };
      });
    }
    // Safety net for layer edits that never push history (project open, imports).
    ['pointerup', 'keyup', 'click'].forEach((type) => {
      document.addEventListener(type, () => setTimeout(refreshHeaderState, 0), true);
    });

    ui._phoneHeader = { state, openSheet, closeSheet, refresh: refreshHeaderState };
    syncPhoneMode();
    refreshHeaderState();
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
    initPhoneHeader,
    triggerTopMenuAction,
    refreshTopMenuItemStates,
    wireTopMenuCommands,
    installOn(proto) {
      proto.setTopMenuOpen = function(trigger = null, open = true) { return setTopMenuOpen.call(this, trigger, open); };
      proto.initTopMenuBar = function() { return initTopMenuBar.call(this); };
      proto.initPhoneHeader = function() { return initPhoneHeader.call(this); };
      proto.triggerTopMenuAction = function(buttonId) { return triggerTopMenuAction.call(this, buttonId); };
      proto.refreshTopMenuItemStates = function() { return refreshTopMenuItemStates.call(this); };
      proto.wireTopMenuCommands = function() { return wireTopMenuCommands.call(this); };
      proto._menuToggleLock = function(lock) { return _menuToggleLock.call(this, lock); };
      proto._menuOutlineText = function() { return _menuOutlineText.call(this); };
    },
  };
})();
