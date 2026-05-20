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
    keys.forEach((key) => {
      const def = ALGO_DEFAULTS[key];
      const opt = document.createElement('option');
      opt.value = key;
      const label = def?.label;
      opt.innerText = label || key.charAt(0).toUpperCase() + key.slice(1);
      select.appendChild(opt);
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
      const item = e.target.closest('[data-gm-value]');
      if (!item) return;
      const select = getEl('generator-module', { silent: true });
      if (select) {
        select.value = item.dataset.gmValue;
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
    const { getEl } = requireDeps('_showModuleMenu');
    const select = getEl('generator-module', { silent: true });
    const trigger = document.getElementById('generator-module-trigger');
    if (!select || !trigger) return;
    const menu = this._buildModuleMenu();
    const currentValue = select.value;
    menu.innerHTML = Array.from(select.options).map((opt) => {
      const type = opt.value;
      const ico = this._LVL_I?.[type];
      const color = this._algoMenuColor?.(type) ?? '';
      const iconHtml = ico
        ? `<span class="lvl-algo-sub-ico" style="color:${color}">${ico()}</span>`
        : '';
      const activeClass = type === currentValue ? ' gm-item-active' : '';
      return `<div class="lvl-algo-sub-item${activeClass}" data-gm-value="${type}">${iconHtml}${opt.innerText}</div>`;
    }).join('');
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
      const ico = this._LVL_I?.[currentValue];
      iconEl.innerHTML = ico ? ico() : '';
      iconEl.style.color = ico ? (this._algoMenuColor?.(currentValue) ?? '') : '';
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
   * Meridian Unit 1.9b (2026-05-20): grouped installer for the top-menubar
   * header chrome buttons (`btn-help`, `btn-tour`, `btn-tour-welcome`,
   * `btn-reset-view`). Previously these listeners lived inlined in
   * `_ui-legacy.js`'s `bindGlobal()`. `this` is the legacy UI instance —
   * handlers reach for `this.openHelp`, `this.setTopMenuOpen`, `this.app`,
   * `this.openModal`, `this.closeModal`, `this.modal`, `this.renderLayers`,
   * `this.buildControls`, `this.expandPanes` via the prototype.
   */
  function bindHeaderChromeListeners() {
    const { getEl, SETTINGS } = requireDeps('bindHeaderChromeListeners');
    const btnHelp = getEl('btn-help', { silent: true });
    const btnResetView = getEl('btn-reset-view', { silent: true });
    const btnTour = getEl('btn-tour', { silent: true });
    const btnTourWelcome = getEl('btn-tour-welcome', { silent: true });

    if (btnHelp) {
      btnHelp.onclick = () => this.openHelp(false);
    }
    if (btnResetView) {
      btnResetView.onclick = () => {
        this.app.renderer.center();
        if (this.expandPanes) this.expandPanes();
        this.app.render();
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
