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
 *                                the close (✕) button, and the six grid
 *                                control inputs. Was previously inlined in
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

  // Markup lifted verbatim from index.html:747-787 (Phase 3 step 2). Lives
  // here so the JS module owns its own DOM rather than relying on a static
  // markup block in index.html.
  const PANEL_HTML = `
    <div id="grid-settings-panel" class="settings-panel bg-vectura-panel border-r border-vectura-border" style="z-index: 50;">
      <div class="p-4 border-b border-vectura-border flex justify-between items-center bg-vectura-panel">
        <span class="font-bold text-vectura-accent">GRID SETTINGS</span>
        <button id="btn-close-grid-settings" class="text-vectura-muted hover:text-vectura-accent" aria-label="Close grid settings" type="button">✕</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <div class="control-group border-none">
          <div class="flex items-center justify-between mb-4">
            <label class="text-xs text-vectura-muted">Show Grid</label>
            <input type="checkbox" id="set-grid-overlay-master" class="cursor-pointer" />
          </div>
          <div class="mb-4">
            <label class="text-[11px] text-vectura-muted block mb-2">Opacity</label>
            <div class="flex items-center justify-between gap-2">
              <input type="range" id="set-grid-opacity-slider" min="0" max="1" step="0.05" class="w-full">
              <input type="number" id="set-grid-opacity" min="0" max="1" step="0.05" class="w-16 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
            </div>
          </div>
          <div class="mb-4">
            <label class="text-[11px] text-vectura-muted block mb-2">Style</label>
            <select id="set-grid-style" class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent">
              <option value="cartesian">Cartesian</option>
              <option value="isometric">Isometric</option>
              <option value="cartesian-dot">Cartesian Dot</option>
              <option value="isometric-dot">Isometric Dot</option>
            </select>
          </div>
          <div class="flex items-center justify-between mb-4">
            <label class="text-[11px] text-vectura-muted">Color</label>
            <div class="w-24">
              <button id="set-grid-color-pill" type="button" class="value-chip text-xs text-vectura-accent font-mono w-full px-2 py-1 border border-vectura-border rounded whitespace-nowrap overflow-hidden line-clamp-1">#FFFFFF</button>
              <input type="color" id="set-grid-color" class="hidden" />
            </div>
          </div>
          <div class="flex items-center justify-between mb-4">
            <label class="text-[11px] text-vectura-muted">Size (mm)</label>
            <input type="number" id="set-grid-size" min="1" step="0.5" class="w-16 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
          </div>
        </div>
      </div>
    </div>
  `.trim();

  /**
   * Inject the grid-settings panel markup into `host`. Idempotent — if the
   * panel is already mounted (regardless of who put it there), this is a
   * no-op. Returns the mounted panel element.
   *
   * Typical host: the document's `<main>` element. Mount runs at boot,
   * before bindGlobal() looks up the panel by id.
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
   * Wire all grid-settings handlers. Called from inside the legacy
   * bindGlobal() body, which keeps the call ordering identical to the
   * pre-extraction path. `this` is the legacy UI instance.
   *
   * Behavior is byte-identical to the inline handlers that lived in
   * _ui-legacy.js bindGlobal() lines ~7462-7545.
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
      btnCloseGridSettings.onclick = () => {
        gridSettingsPanel.classList.remove('open');
      };
    }

    const setGridOverlayMaster = getEl('set-grid-overlay-master');
    if (setGridOverlayMaster) {
      setGridOverlayMaster.onchange = (e) => {
        SETTINGS.gridOverlay = e.target.checked;
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
      };
    }

    const syncGridOpacity = (val, commit) => {
      if (commit && this.app.pushHistory) this.app.pushHistory();
      SETTINGS.gridOpacity = parseFloat(val);
      const gridOpacitySlider = getEl('set-grid-opacity-slider');
      const gridOpacity = getEl('set-grid-opacity');
      if (gridOpacitySlider) gridOpacitySlider.value = SETTINGS.gridOpacity;
      if (gridOpacity) gridOpacity.value = SETTINGS.gridOpacity;
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

    const setGridStyle = getEl('set-grid-style');
    if (setGridStyle) {
      setGridStyle.onchange = (e) => {
        SETTINGS.gridStyle = e.target.value;
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
      };
    }

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

    const setGridSize = getEl('set-grid-size');
    if (setGridSize) {
      setGridSize.onchange = (e) => {
        SETTINGS.gridSize = Math.max(0.1, parseFloat(e.target.value) || 10);
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
      };
    }
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
  };
})();
