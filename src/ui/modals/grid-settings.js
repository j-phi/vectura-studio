/**
 * Vectura grid-settings panel (Phase 3 step 2 extraction).
 *
 * Exposes window.Vectura.UI.Modals.GridSettings — the slide-out side panel
 * triggered by the View > Grid Settings menu button. This is structurally a
 * modal-equivalent surface (distinct content, open/close lifecycle) even
 * though it composes a CSS-class slide-out rather than the centered overlay
 * primitive. Lives under modals/ to match the Phase 3 modal-extraction batch.
 *
 * Methods exposed:
 *   - mount(host)             - injects #grid-settings-panel into the host
 *                                element (called once before bindGlobal).
 *                                Idempotent: re-mounts no-op if already
 *                                attached. Used to lift the markup that used
 *                                to live in index.html:747-787.
 *   - bindHandlers()          - wires the View > Grid Settings open trigger,
 *                                the close (✕) button, and all grid control
 *                                inputs. Was previously inlined in
 *                                _ui-legacy.js bindGlobal() lines ~7462-7545.
 *
 * The legacy UI.prototype delegates `_mountGridSettingsPanel` and
 * `_bindGridSettingsHandlers` to this module via 1-line pass-throughs.
 *
 * DI bag: { getEl, SETTINGS, openColorPickerAnchoredTo }
 *
 * Compile gate at tests/unit/modals/grid-settings-compile.test.js.
 * Lifecycle test at tests/integration/modals/grid-settings.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  const Modals = UI.Modals = UI.Modals || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(
        `GridSettings.${name} invoked before GridSettings.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  const PANEL_ID = 'grid-settings-panel';

  const PANEL_HTML = `
    <div id="grid-settings-panel" class="settings-panel" style="z-index: 50;">
      <div class="pane-hdr">
        <span class="pane-title">Grid Settings</span>
        <button id="btn-close-grid-settings" class="settings-panel-close" type="button" aria-label="Close grid settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
      </div>
      <div class="settings-panel-body">

        <div class="sect">
          <button type="button" class="sect-hdr is-open" data-sect-toggle aria-expanded="true">
            Grid Type<span class="sect-arrow down"></span>
          </button>
          <div class="sect-body" data-sect-body>
            <div id="grid-type-ctrl" class="seg-ctrl" role="radiogroup" aria-label="Grid type">
              <button type="button" class="seg-opt active" data-grid-type="none" role="radio" aria-checked="true">No Grid</button>
              <button type="button" class="seg-opt" data-grid-type="standard" role="radio" aria-checked="false">Standard</button>
              <button type="button" class="seg-opt" data-grid-type="major-minor" role="radio" aria-checked="false">Major / Minor</button>
            </div>
          </div>
        </div>

        <div class="sect" id="grid-style-sect">
          <button type="button" class="sect-hdr is-open" data-sect-toggle aria-expanded="true">
            Style<span class="sect-arrow down"></span>
          </button>
          <div class="sect-body" data-sect-body>
            <div class="ctrl-sel-wrap">
              <select id="set-grid-style" class="ctrl-sel">
                <option value="cartesian">Cartesian</option>
                <option value="isometric">Isometric</option>
                <option value="cartesian-dot">Cartesian Dot</option>
                <option value="isometric-dot">Isometric Dot</option>
              </select>
            </div>
          </div>
        </div>

        <div class="sect" id="grid-major-sect">
          <button type="button" class="sect-hdr is-open" data-sect-toggle aria-expanded="true">
            Major Grid Lines<span class="sect-arrow down"></span>
          </button>
          <div class="sect-body" data-sect-body>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Opacity</span>
              <div class="slider-row">
                <input type="range" id="set-grid-opacity-slider" class="ctrl-slider" min="0" max="1" step="0.01" value="0.2" />
                <input type="number" id="set-grid-opacity" class="slider-val-inp" min="0" max="1" step="0.01" value="0.2" />
              </div>
            </div>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Color</span>
              <button id="set-grid-color-pill" type="button" class="value-chip color-thickness-pill">#FFFFFF</button>
              <input type="color" id="set-grid-color" class="hidden" aria-label="Grid color" />
            </div>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Size</span>
              <div class="slider-row">
                <input type="range" id="set-grid-size-slider" class="ctrl-slider" min="0.5" max="50" step="0.5" value="10" />
                <input type="number" id="set-grid-size" class="slider-val-inp" min="0.5" max="50" step="0.5" value="10" />
                <span id="set-grid-size-unit" class="ctrl-trail-hint">mm</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sect" id="grid-minor-sect">
          <button type="button" class="sect-hdr is-open" data-sect-toggle aria-expanded="true">
            Minor Grid Lines<span class="sect-arrow down"></span>
          </button>
          <div class="sect-body" data-sect-body>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Opacity</span>
              <div class="slider-row">
                <input type="range" id="set-grid-minor-opacity-slider" class="ctrl-slider" min="0" max="1" step="0.01" value="0.08" />
                <input type="number" id="set-grid-minor-opacity" class="slider-val-inp" min="0" max="1" step="0.01" value="0.08" />
              </div>
            </div>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Color</span>
              <button id="set-grid-minor-color-pill" type="button" class="value-chip color-thickness-pill">#FFFFFF</button>
              <input type="color" id="set-grid-minor-color" class="hidden" aria-label="Minor grid color" />
            </div>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Size</span>
              <div class="slider-row">
                <input type="range" id="set-grid-minor-size-slider" class="ctrl-slider" min="0.5" max="50" step="0.5" value="5" />
                <input type="number" id="set-grid-minor-size" class="slider-val-inp" min="0.5" max="50" step="0.5" value="5" />
                <span id="set-grid-minor-size-unit" class="ctrl-trail-hint">mm</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sect">
          <button type="button" class="sect-hdr is-open" data-sect-toggle aria-expanded="true">
            Snapping<span class="sect-arrow down"></span>
          </button>
          <div class="sect-body" data-sect-body>
            <div class="ctrl-row">
              <label class="ctrl-lbl" for="set-grid-snap-enabled">Snap to Grid</label>
              <label class="sw-toggle" role="switch" aria-checked="false">
                <input type="checkbox" id="set-grid-snap-enabled" />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
            </div>
            <div class="ctrl-grp" id="grid-snap-sensitivity-row">
              <span class="ctrl-sub-lbl">Snap sensitivity</span>
              <div class="slider-row">
                <input type="range" id="set-grid-snap-sensitivity" class="ctrl-slider" min="0" max="100" step="1" value="50" />
                <input type="number" id="set-grid-snap-sensitivity-val" class="slider-val-inp" min="0" max="100" step="1" value="50" />
                <span class="ctrl-trail-hint">%</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `.trim();

  /**
   * Inject the grid-settings panel markup into `host`. Idempotent — if the
   * panel is already mounted (regardless of who put it there), this is a
   * no-op. Returns the mounted panel element.
   */
  function mount(host) {
    requireDeps('mount');
    const doc = host?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const existing = doc.getElementById(PANEL_ID);
    if (existing) return existing;
    if (!host) return null;

    const tpl = doc.createElement('template');
    tpl.innerHTML = PANEL_HTML;
    const panel = tpl.content.firstElementChild;
    if (panel) host.appendChild(panel);
    return panel;
  }

  /**
   * Wire all grid-settings handlers.
   */
  function bindHandlers() {
    const { getEl, SETTINGS, openColorPickerAnchoredTo } = requireDeps('bindHandlers');

    const btnViewGridSettings = getEl('btn-view-grid-settings');
    const gridSettingsPanel = getEl('grid-settings-panel');
    const btnCloseGridSettings = getEl('btn-close-grid-settings');

    if (btnViewGridSettings && gridSettingsPanel) {
      btnViewGridSettings.onclick = () => {
        gridSettingsPanel.classList.add('open');
        const p = getEl('top-menubar').querySelector('[data-top-menu-panel][aria-label="View menu"]');
        if (p) p.classList.remove('open');
      };
    }

    if (btnCloseGridSettings && gridSettingsPanel) {
      btnCloseGridSettings.onclick = () => gridSettingsPanel.classList.remove('open');
    }

    const updateVisibility = () => {
      const type = SETTINGS.gridType || 'none';
      const showGrid = type !== 'none';

      const styleSect = getEl('grid-style-sect');
      const majorSect = getEl('grid-major-sect');
      const minorSect = getEl('grid-minor-sect');
      const snapSensRow = getEl('grid-snap-sensitivity-row');

      if (styleSect) styleSect.style.display = showGrid ? '' : 'none';
      if (majorSect) majorSect.style.display = showGrid ? '' : 'none';
      if (minorSect) minorSect.style.display = type === 'major-minor' ? '' : 'none';
      if (snapSensRow) snapSensRow.style.display = SETTINGS.gridSnapEnabled ? '' : 'none';

      const viewGridCheckmark = getEl('view-grid-checkmark');
      if (viewGridCheckmark) viewGridCheckmark.style.visibility = showGrid ? 'visible' : 'hidden';

      const gridTypeCtrl = getEl('grid-type-ctrl');
      if (gridTypeCtrl) {
        gridTypeCtrl.querySelectorAll('[data-grid-type]').forEach(btn => {
          const isActive = btn.dataset.gridType === type;
          btn.classList.toggle('active', isActive);
          btn.setAttribute('aria-checked', String(isActive));
        });
      }

      const snapInput = getEl('set-grid-snap-enabled');
      const snapToggle = snapInput?.closest('[role="switch"]');
      if (snapToggle) snapToggle.setAttribute('aria-checked', String(!!SETTINGS.gridSnapEnabled));
    };

    // Grid type buttons
    const gridTypeCtrl = getEl('grid-type-ctrl');
    if (gridTypeCtrl) {
      gridTypeCtrl.querySelectorAll('[data-grid-type]').forEach(btn => {
        btn.onclick = () => {
          SETTINGS.gridType = btn.dataset.gridType;
          if (this.app.pushHistory) this.app.pushHistory();
          this.initSettingsValues();
          this.app.render();
        };
      });
    }

    // Style
    const setGridStyle = getEl('set-grid-style');
    if (setGridStyle) {
      setGridStyle.onchange = (e) => {
        SETTINGS.gridStyle = e.target.value;
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
      };
    }

    // Major opacity
    const syncGridOpacity = (val, commit) => {
      SETTINGS.gridOpacity = parseFloat(val);
      const slider = getEl('set-grid-opacity-slider');
      const num = getEl('set-grid-opacity');
      if (slider) slider.value = SETTINGS.gridOpacity;
      if (num) num.value = SETTINGS.gridOpacity;
      if (commit && this.app.pushHistory) this.app.pushHistory();
      this.app.render();
    };
    const setGridOpacitySlider = getEl('set-grid-opacity-slider');
    if (setGridOpacitySlider) {
      setGridOpacitySlider.oninput = (e) => syncGridOpacity(e.target.value, false);
      setGridOpacitySlider.onchange = (e) => syncGridOpacity(e.target.value, true);
    }
    const setGridOpacity = getEl('set-grid-opacity');
    if (setGridOpacity) {
      setGridOpacity.oninput = (e) => syncGridOpacity(e.target.value, false);
      setGridOpacity.onchange = (e) => syncGridOpacity(e.target.value, true);
    }

    // Major color
    const setGridColor = getEl('set-grid-color');
    const setGridColorPill = getEl('set-grid-color-pill');
    if (setGridColor && setGridColorPill) {
      setGridColorPill.onclick = () => openColorPickerAnchoredTo(setGridColor, setGridColorPill, { title: 'Grid Color', uiInstance: this });
      setGridColor.oninput = (e) => {
        SETTINGS.gridColor = e.target.value;
        this.initSettingsValues();
        this.app.render();
      };
      setGridColor.onchange = (e) => {
        SETTINGS.gridColor = e.target.value;
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
      };
    }

    // Major size
    const syncGridSize = (val, commit) => {
      const parsed = this.parseDocumentNumber
        ? this.parseDocumentNumber(val, { fallbackMm: SETTINGS.gridSize ?? 10 })
        : parseFloat(val);
      SETTINGS.gridSize = Math.max(0.5, Number.isFinite(parsed) ? parsed : 10);
      if (this.refreshDocumentUnitsUi) {
        this.refreshDocumentUnitsUi();
      } else {
        const slider = getEl('set-grid-size-slider');
        const num = getEl('set-grid-size');
        if (slider) slider.value = SETTINGS.gridSize;
        if (num) num.value = SETTINGS.gridSize;
      }
      if (commit && this.app.pushHistory) this.app.pushHistory();
      this.app.render();
    };
    const setGridSizeSlider = getEl('set-grid-size-slider');
    if (setGridSizeSlider) {
      setGridSizeSlider.oninput = (e) => syncGridSize(e.target.value, false);
      setGridSizeSlider.onchange = (e) => syncGridSize(e.target.value, true);
    }
    const setGridSize = getEl('set-grid-size');
    if (setGridSize) {
      setGridSize.oninput = (e) => syncGridSize(e.target.value, false);
      setGridSize.onchange = (e) => syncGridSize(e.target.value, true);
    }

    // Minor opacity
    const syncGridMinorOpacity = (val, commit) => {
      SETTINGS.gridMinorOpacity = parseFloat(val);
      const slider = getEl('set-grid-minor-opacity-slider');
      const num = getEl('set-grid-minor-opacity');
      if (slider) slider.value = SETTINGS.gridMinorOpacity;
      if (num) num.value = SETTINGS.gridMinorOpacity;
      if (commit && this.app.pushHistory) this.app.pushHistory();
      this.app.render();
    };
    const setGridMinorOpacitySlider = getEl('set-grid-minor-opacity-slider');
    if (setGridMinorOpacitySlider) {
      setGridMinorOpacitySlider.oninput = (e) => syncGridMinorOpacity(e.target.value, false);
      setGridMinorOpacitySlider.onchange = (e) => syncGridMinorOpacity(e.target.value, true);
    }
    const setGridMinorOpacity = getEl('set-grid-minor-opacity');
    if (setGridMinorOpacity) {
      setGridMinorOpacity.oninput = (e) => syncGridMinorOpacity(e.target.value, false);
      setGridMinorOpacity.onchange = (e) => syncGridMinorOpacity(e.target.value, true);
    }

    // Minor color
    const setGridMinorColor = getEl('set-grid-minor-color');
    const setGridMinorColorPill = getEl('set-grid-minor-color-pill');
    if (setGridMinorColor && setGridMinorColorPill) {
      setGridMinorColorPill.onclick = () => openColorPickerAnchoredTo(setGridMinorColor, setGridMinorColorPill, { title: 'Minor Grid Color', uiInstance: this });
      setGridMinorColor.oninput = (e) => {
        SETTINGS.gridMinorColor = e.target.value;
        this.initSettingsValues();
        this.app.render();
      };
      setGridMinorColor.onchange = (e) => {
        SETTINGS.gridMinorColor = e.target.value;
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
      };
    }

    // Minor size
    const syncGridMinorSize = (val, commit) => {
      const parsed = this.parseDocumentNumber
        ? this.parseDocumentNumber(val, { fallbackMm: SETTINGS.gridMinorSize ?? 5 })
        : parseFloat(val);
      SETTINGS.gridMinorSize = Math.max(0.5, Number.isFinite(parsed) ? parsed : 5);
      if (this.refreshDocumentUnitsUi) {
        this.refreshDocumentUnitsUi();
      } else {
        const slider = getEl('set-grid-minor-size-slider');
        const num = getEl('set-grid-minor-size');
        if (slider) slider.value = SETTINGS.gridMinorSize;
        if (num) num.value = SETTINGS.gridMinorSize;
      }
      if (commit && this.app.pushHistory) this.app.pushHistory();
      this.app.render();
    };
    const setGridMinorSizeSlider = getEl('set-grid-minor-size-slider');
    if (setGridMinorSizeSlider) {
      setGridMinorSizeSlider.oninput = (e) => syncGridMinorSize(e.target.value, false);
      setGridMinorSizeSlider.onchange = (e) => syncGridMinorSize(e.target.value, true);
    }
    const setGridMinorSize = getEl('set-grid-minor-size');
    if (setGridMinorSize) {
      setGridMinorSize.oninput = (e) => syncGridMinorSize(e.target.value, false);
      setGridMinorSize.onchange = (e) => syncGridMinorSize(e.target.value, true);
    }

    // Snap to grid toggle
    const setGridSnapEnabled = getEl('set-grid-snap-enabled');
    if (setGridSnapEnabled) {
      setGridSnapEnabled.onchange = (e) => {
        SETTINGS.gridSnapEnabled = e.target.checked;
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
      };
    }

    // Snap sensitivity
    const syncGridSnapSensitivity = (val, commit) => {
      SETTINGS.gridSnapSensitivity = Math.max(0, Math.min(100, parseInt(val, 10) || 50));
      const slider = getEl('set-grid-snap-sensitivity');
      const num = getEl('set-grid-snap-sensitivity-val');
      if (slider) slider.value = SETTINGS.gridSnapSensitivity;
      if (num) num.value = SETTINGS.gridSnapSensitivity;
      if (commit && this.app.pushHistory) this.app.pushHistory();
      this.app.render();
    };
    const setGridSnapSensitivity = getEl('set-grid-snap-sensitivity');
    if (setGridSnapSensitivity) {
      setGridSnapSensitivity.oninput = (e) => syncGridSnapSensitivity(e.target.value, false);
      setGridSnapSensitivity.onchange = (e) => syncGridSnapSensitivity(e.target.value, true);
    }
    const setGridSnapSensitivityVal = getEl('set-grid-snap-sensitivity-val');
    if (setGridSnapSensitivityVal) {
      setGridSnapSensitivityVal.oninput = (e) => syncGridSnapSensitivity(e.target.value, false);
      setGridSnapSensitivityVal.onchange = (e) => syncGridSnapSensitivity(e.target.value, true);
    }

    updateVisibility();
  }

  Modals.GridSettings = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl, SETTINGS, openColorPickerAnchoredTo }
     */
    bind(deps) {
      DEPS = deps || {};
    },
    mount,
    bindHandlers,
    PANEL_HTML,
    PANEL_ID,
    installOn(proto) {
      proto._bindGridSettingsHandlers = function() { return bindHandlers.call(this); };
    },
  };
})();
