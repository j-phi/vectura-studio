/**
 * Vectura header (Phase 2 step 3 eighth extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.Header — the algorithm/machine selector
 * dropdowns in the left-pane header: initModuleDropdown(), _buildModuleMenu(),
 * _showModuleMenu(), _syncModuleDisplay(), and initMachineDropdown().
 *
 * These populate <select> elements and manage the custom dropdown popup for
 * algorithm selection. The menubar (extracted separately in menubar.js)
 * handles the top application menu.
 *
 * DI bag: { getEl, ALGO_DEFAULTS, MACHINES, SETTINGS }.
 *
 * Compile gate at tests/unit/header-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`Header.${name} invoked before Header.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function initModuleDropdown() {
    const { getEl, ALGO_DEFAULTS } = requireDeps('initModuleDropdown');
    const select = getEl('generator-module');
    if (!select) return;
    select.innerHTML = '';
    const keys = Object.keys(ALGO_DEFAULTS || {}).filter((key) => !(ALGO_DEFAULTS[key] && ALGO_DEFAULTS[key].hidden));
    keys.sort((a, b) => {
      const aLabel = ALGO_DEFAULTS[a]?.label || a;
      const bLabel = ALGO_DEFAULTS[b]?.label || b;
      return aLabel.localeCompare(bLabel);
    });
    const items = keys.map((key) => ({
      type: key,
      label: ALGO_DEFAULTS[key]?.label || key.charAt(0).toUpperCase() + key.slice(1),
      is3d: !!ALGO_DEFAULTS[key]?.is3d,
    }));
    window.Vectura.groupAlgorithmsForMenu(items).forEach((group) => {
      if (!group.items.length) return;
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      group.items.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.type;
        opt.innerText = item.label;
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    });
  }

  function _buildModuleMenu() {
    const { getEl } = requireDeps('_buildModuleMenu');
    let menu = document.getElementById('gm-module-menu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'gm-module-menu';
    menu.className = 'gm-module-menu hidden';
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-algo-type]');
      if (!item) return;
      const select = getEl('generator-module', { silent: true });
      if (select) {
        select.value = item.dataset.algoType;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      menu.classList.add('hidden');
    });
    document.addEventListener('pointerdown', (e) => {
      const trigger = document.getElementById('generator-module-trigger');
      if (!menu.classList.contains('hidden') &&
          !menu.contains(e.target) &&
          e.target !== trigger &&
          !trigger?.contains(e.target)) {
        menu.classList.add('hidden');
      }
    }, true);
    document.body.appendChild(menu);
    return menu;
  }

  function _showModuleMenu() {
    const { getEl, ALGO_DEFAULTS } = requireDeps('_showModuleMenu');
    const select = getEl('generator-module', { silent: true });
    const trigger = document.getElementById('generator-module-trigger');
    if (!select || !trigger) return;
    const menu = this._buildModuleMenu();
    const currentValue = select.value;
    const items = Array.from(select.options).map((opt) => ({
      type: opt.value,
      label: opt.innerText,
      is3d: !!(ALGO_DEFAULTS && ALGO_DEFAULTS[opt.value]?.is3d),
    }));
    menu.innerHTML = window.Vectura.UI.utils.renderAlgoMenuHTML(items, currentValue);
    const r = trigger.getBoundingClientRect();
    menu.style.top = `${r.bottom + 2}px`;
    menu.style.left = `${r.left}px`;
    menu.style.width = `${r.width}px`;
    menu.classList.remove('hidden');
  }

  function _syncModuleDisplay() {
    const { getEl } = requireDeps('_syncModuleDisplay');
    const select = getEl('generator-module', { silent: true });
    const trigger = document.getElementById('generator-module-trigger');
    if (!select || !trigger) return;
    const currentValue = select.value;
    const currentLabel = select.options[select.selectedIndex]?.innerText ?? currentValue;
    const iconEl = document.getElementById('gm-current-icon');
    const labelEl = document.getElementById('gm-current-label');
    if (iconEl) {
      const utils = window.Vectura.UI.utils;
      iconEl.innerHTML = utils.getAlgoMenuIcon(currentValue);
      iconEl.style.color = utils.getAlgoMenuColor(currentValue);
    }
    if (labelEl) labelEl.textContent = currentLabel;
    trigger.classList.toggle('gm-trigger-disabled', !!select.disabled);
  }

  function initMachineDropdown() {
    const { getEl, MACHINES, SETTINGS } = requireDeps('initMachineDropdown');
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

  /**
   * Grouped installer for the top-menubar header chrome buttons
   * (`btn-help`, `btn-tour`, `btn-tour-welcome`, `btn-reset-view`). `this`
   * is the UI instance — handlers reach for `this.openHelp`,
   * `this.setTopMenuOpen`, `this.app`, `this.openModal`, `this.closeModal`,
   * `this.modal`, `this.renderLayers`, `this.buildControls`,
   * `this.expandPanes` via the prototype.
   */
  // TUX-001: phone menu mode. The existing menubar DOM becomes a drill-down sheet
  // opened by the hamburger button; Undo/Redo/Export mirror their menu items.
  function initPhoneMenu() {
    const doc = document;
    const burger = doc.getElementById('btn-menu-hamburger');
    const bar = doc.getElementById('top-menubar');
    if (!burger || !bar || burger._vecturaPhoneMenu) return;
    burger._vecturaPhoneMenu = true;
    const ui = this;
    const body = doc.body;
    const setOpen = (open) => {
      if (open) {
        const hdr = doc.getElementById('app-header');
        const bottom = hdr ? Math.round(hdr.getBoundingClientRect().bottom) : 0;
        bar.style.setProperty('--phone-menu-top', `${bottom}px`);
      } else {
        try { ui.setTopMenuOpen?.(null, false); } catch { /* defensive */ }
      }
      body.classList.toggle('phone-menu-open', !!open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    burger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!body.classList.contains('phone-menu-open'));
    });
    // Theme row (the header toggle is hidden in phone layout).
    const themeBtn = doc.getElementById('theme-toggle');
    if (themeBtn && !bar.querySelector('.top-menu-theme-row')) {
      const row = doc.createElement('button');
      row.type = 'button';
      row.className = 'top-menu-trigger top-menu-theme-row';
      row.textContent = 'Theme';
      row.addEventListener('click', (e) => { e.preventDefault(); themeBtn.click(); });
      bar.appendChild(row);
    }
    // Back row at the top of every sub-level.
    bar.querySelectorAll('[data-top-menu-panel]').forEach((panel) => {
      if (panel.querySelector('.top-menu-back')) return;
      const back = doc.createElement('button');
      back.type = 'button';
      back.className = 'top-menu-item top-menu-back';
      back.setAttribute('role', 'menuitem');
      back.textContent = '\u2039 Back';
      back.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.setTopMenuOpen?.(null, false);
      });
      panel.insertBefore(back, panel.firstChild);
    });
    // Choosing a command closes the whole sheet. Capture phase: menubar.js stops click
    // propagation at each panel, so a bubble listener on the bar never ran (TUX-046).
    bar.addEventListener('click', (e) => {
      const item = e.target.closest?.('.top-menu-item');
      if (item && !item.classList.contains('top-menu-back')) setOpen(false);
    }, true);
    // An outside tap only closes the sheet: it is swallowed so it never reaches the canvas
    // (a Pen tap would add an anchor). Only events tied to that gesture are swallowed: its pointerId,
    // its touch identifiers, and the single click that follows its pointerup on the same target.
    // There is no time window, so a real tap right after the closing tap (Undo, the hamburger) still fires.
    let swallowId = null;
    const swallowTouches = new Set();
    let clickTarget = null; // set at the swallowed pointerup; consumed by the one click that follows
    const stop = (e) => { e.stopImmediatePropagation(); e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
    doc.addEventListener('pointerdown', (e) => {
      clickTarget = null; // a new gesture starts: no click from the old one is coming
      if (!body.classList.contains('phone-menu-open')) return;
      if (bar.contains(e.target) || burger.contains(e.target)) return;
      setOpen(false);
      swallowId = e.pointerId;
      swallowTouches.clear();
      swallowDownTarget = e.target;
      stop(e);
    }, true);
    let swallowDownTarget = null;
    ['pointermove', 'pointerup', 'pointercancel'].forEach((type) => {
      doc.addEventListener(type, (e) => {
        if (swallowId === null || e.pointerId !== swallowId) return;
        if (type !== 'pointermove') {
          swallowId = null;
          clickTarget = type === 'pointerup' ? swallowDownTarget : null;
        }
        stop(e);
      }, true);
    });
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((type) => {
      doc.addEventListener(type, (e) => {
        const ids = Array.from(e.changedTouches || [], (t) => t.identifier);
        if (type === 'touchstart') {
          // The touchstart of the swallowed gesture follows its pointerdown at once.
          if (swallowId === null || swallowTouches.size) return;
          ids.forEach((id) => swallowTouches.add(id));
        } else if (!ids.some((id) => swallowTouches.has(id))) return;
        if (type === 'touchend' || type === 'touchcancel') ids.forEach((id) => swallowTouches.delete(id));
        stop(e);
      }, { capture: true, passive: false });
    });
    doc.addEventListener('click', (e) => {
      if (!clickTarget) return;
      const t = clickTarget;
      clickTarget = null;
      if (t.isConnected && (t.contains(e.target) || e.target.contains(t))) stop(e);
    }, { capture: true, passive: false });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && body.classList.contains('phone-menu-open') && !ui.openTopMenuTrigger) setOpen(false);
    });
    // Leaving phone layout drops the sheet state.
    new MutationObserver(() => {
      if (!body.classList.contains('phone-layout') && body.classList.contains('phone-menu-open')) setOpen(false);
    }).observe(body, { attributes: true, attributeFilter: ['class'] });
    // Direct actions run the same menu items as the menus and shortcuts.
    [['btn-header-undo', 'btn-undo'], ['btn-header-redo', 'btn-redo'], ['btn-header-export', 'btn-export']].forEach(([from, to]) => {
      const src = doc.getElementById(from);
      const target = doc.getElementById(to);
      if (!src || !target) return;
      src.addEventListener('click', (e) => {
        e.preventDefault();
        try { ui.refreshTopMenuItemStates?.(); } catch { /* defensive */ }
        if (!target.disabled) target.click();
      });
      const sync = () => {
        const off = target.hasAttribute('disabled');
        src.classList.toggle('is-disabled', off);
        src.setAttribute('aria-disabled', off ? 'true' : 'false');
      };
      sync();
      new MutationObserver(sync).observe(target, { attributes: true, attributeFilter: ['disabled'] });
    });
  }

  function bindHeaderChromeListeners() {
    const { getEl, SETTINGS } = requireDeps('bindHeaderChromeListeners');
    try { initPhoneMenu.call(this); } catch { /* defensive: never block header wiring */ }
    const btnHelp = getEl('btn-help', { silent: true });
    const btnResetView = getEl('btn-reset-view', { silent: true });
    const btnTour = getEl('btn-tour', { silent: true });
    const btnTourWelcome = getEl('btn-tour-welcome', { silent: true });

    if (btnHelp) {
      btnHelp.onclick = () => this.openHelp(false);
    }
    if (btnResetView) {
      btnResetView.onclick = () => {
        // TUX-009: expandPanes is a no-op outside the desktop layout. Fit after it, then again once
        // the layout has settled, so the fit uses the final canvas size.
        if (this.expandPanes) this.expandPanes();
        this.app.renderer.center();
        this.app.render();
        requestAnimationFrame(() => {
          this.app.renderer.center();
          this.app.render();
        });
      };
    }
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
  }

  UI.Header = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    initModuleDropdown,
    _buildModuleMenu,
    _showModuleMenu,
    _syncModuleDisplay,
    initMachineDropdown,
    bindHeaderChromeListeners,
    installOn(proto) {
      proto.initModuleDropdown = function() { return initModuleDropdown.call(this); };
      proto._buildModuleMenu = function() { return _buildModuleMenu.call(this); };
      proto._showModuleMenu = function() { return _showModuleMenu.call(this); };
      proto._syncModuleDisplay = function() { return _syncModuleDisplay.call(this); };
      proto.initMachineDropdown = function() { return initMachineDropdown.call(this); };
      proto.bindHeaderChromeListeners = function() { return bindHeaderChromeListeners.call(this); };
    },
  };
})();
