/**
 * Vectura document-setup panel (Phase 3 step 3 extraction).
 *
 * Exposes window.Vectura.UI.Modals.DocumentSetup — the slide-out side panel
 * triggered by File > Document Setup (#btn-settings) and dismissed via the
 * close (✕) button (#btn-close-settings). This is structurally a modal-
 * equivalent surface (open/close lifecycle on a CSS .open class) — it lives
 * under modals/ to match the Phase 3 modal-extraction batch, even though it
 * composes a CSS-class slide-out rather than the centered overlay primitive.
 *
 * Methods exposed:
 *   - mount(host)             - injects #settings-panel into the host element
 *                                (called once before bindGlobal). Idempotent.
 *                                Used to lift markup that previously lived in
 *                                index.html:540-745.
 *   - bindHandlers()          - wires the open trigger (#btn-settings) and
 *                                close button (#btn-close-settings). Both
 *                                forward to this.toggleSettingsPanel(). The
 *                                ~30 input handlers inside the panel remain
 *                                inlined in legacy bindGlobal() because they
 *                                are interleaved with shared selection-outline
 *                                / margin-line / cookie / paper / undo logic
 *                                that is invoked from elsewhere too. See the
 *                                Phase 3 step 2 Resume appendix for rationale.
 *
 * The legacy UI.prototype delegates `_mountDocumentSetupPanel` and
 * `_bindDocumentSetupHandlers` to this module via 1-line pass-throughs.
 *
 * DI bag: { getEl }
 *
 * Compile gate at tests/unit/modals/document-setup-compile.test.js.
 * Lifecycle test at tests/integration/modals/document-setup.test.js.
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
        `DocumentSetup.${name} invoked before DocumentSetup.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  const PANEL_ID = 'settings-panel';

  // Markup lifted verbatim from index.html:540-745 (Phase 3 step 3). Lives
  // here so the JS module owns its own DOM rather than relying on a static
  // markup block in index.html. Every id is preserved so existing JS
  // (bindGlobal handlers, persistence module, theme switcher, palette picker)
  // continues to wire without modification.
  const PANEL_HTML = `
    <div id="settings-panel" class="settings-panel bg-vectura-panel border-r border-vectura-border">
      <div class="p-4 border-b border-vectura-border flex justify-between items-center bg-vectura-panel">
        <span class="font-bold text-vectura-accent">DOCUMENT SETUP</span>
        <button id="btn-close-settings" class="text-vectura-muted hover:text-vectura-accent" aria-label="Close settings"
          type="button">
          ✕
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <div class="control-group">
          <label class="control-label">Theme</label>
          <div id="theme-family-toggle" class="theme-family-toggle inline-flex w-full border border-vectura-border" role="radiogroup" aria-label="Theme family">
            <button type="button" id="theme-family-modern" data-family="meridian" role="radio" aria-checked="true"
              class="theme-family-option flex-1 text-xs py-1.5 px-2 text-vectura-muted hover:text-vectura-accent">Modern</button>
            <button type="button" id="theme-family-classic" data-family="classic" role="radio" aria-checked="false"
              class="theme-family-option flex-1 text-xs py-1.5 px-2 text-vectura-muted hover:text-vectura-accent border-l border-vectura-border">Classic</button>
          </div>
        </div>
        <div class="control-group">
          <label class="control-label">Paper Size</label>
          <select id="machine-profile"
            class="w-full bg-vectura-bg border border-vectura-border p-2 text-xs focus:outline-none focus:border-vectura-accent mb-2"></select>
          <div class="mt-3">
            <div class="flex items-center justify-between">
              <label class="text-xs text-vectura-muted">Units</label>
              <select id="set-document-units"
                class="w-24 bg-vectura-bg border border-vectura-border p-1 text-xs focus:outline-none focus:border-vectura-accent">
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </div>
          </div>
          <div id="custom-size-fields" class="mt-3 hidden">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label id="set-paper-width-label" class="text-[11px] text-vectura-muted">Width (mm)</label>
                <input type="number" id="set-paper-width"
                  class="w-full bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
              </div>
              <div>
                <label id="set-paper-height-label" class="text-[11px] text-vectura-muted">Height (mm)</label>
                <input type="number" id="set-paper-height"
                  class="w-full bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
              </div>
            </div>
          </div>
          <div class="mt-3">
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-vectura-muted">Orientation</label>
              <div class="flex items-center gap-2">
                <span id="orientation-label" class="text-[11px] text-vectura-muted">Landscape</span>
                <label class="sw-toggle" role="switch" aria-checked="false">
                  <input type="checkbox" id="set-orientation" />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <div class="flex-1">
              <label id="set-margin-label" class="control-label">Margin (mm)</label>
              <input type="number" id="set-margin"
                class="w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:border-vectura-accent focus:outline-none" />
            </div>
          </div>
          <div class="mt-4">
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-vectura-muted">Crop Art to Margins</label>
              <label class="sw-toggle" role="switch" aria-checked="false">
                <input type="checkbox" id="set-truncate" />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
            </div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-vectura-muted">Crop Exports to Margin</label>
              <label class="sw-toggle" role="switch" aria-checked="false">
                <input type="checkbox" id="set-crop-exports" />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
            </div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-vectura-muted">Outside Opacity</label>
              <input type="number" id="set-outside-opacity" min="0" max="1" step="0.05"
                class="w-16 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
            </div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-vectura-muted">Margin Outline</label>
              <label class="sw-toggle" role="switch" aria-checked="false">
                <input type="checkbox" id="set-margin-line" />
                <span class="sw-track"></span>
                <span class="sw-thumb"></span>
              </label>
            </div>
            <div class="mt-2">
              <label class="text-[11px] text-vectura-muted">Margin Outline Style</label>
              <div class="line-style-control">
                <div class="style-field">
                  <span class="style-field-label">Line Color</span>
                  <button id="set-margin-line-color-pill" type="button"
                    class="value-chip text-xs text-vectura-accent font-mono color-thickness-pill">#52525B</button>
                  <input type="color" id="set-margin-line-color" class="hidden" />
                </div>
                <div class="style-field">
                  <span class="style-field-label">Line Thickness</span>
                  <div class="color-thickness-size">
                    <input type="range" id="set-margin-line-weight-slider" min="0.05" max="2" step="0.05" value="0.2"
                      class="w-full">
                    <input type="number" id="set-margin-line-weight" min="0.05" max="2" step="0.05" value="0.2"
                      class="w-14 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
                    <span id="set-margin-line-weight-unit" class="text-[11px] text-vectura-muted">mm</span>
                  </div>
                </div>
                <div class="style-field">
                  <span class="style-field-label">Separation</span>
                  <input type="number" id="set-margin-line-dotting" min="0" step="0.5"
                    class="w-14 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
                </div>
                <div class="style-field">
                  <span class="style-field-label">Reset</span>
                  <button id="set-margin-line-style-reset" type="button"
                    class="text-[11px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted">Reset</button>
                </div>
              </div>
            </div>
            <div class="mt-4">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-vectura-muted">Show Guides</label>
                <label class="sw-toggle" role="switch" aria-checked="false">
                  <input type="checkbox" id="set-show-guides" />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
              </div>
              <div class="flex items-center justify-between">
                <label class="text-xs text-vectura-muted">Snap Guides</label>
                <label class="sw-toggle" role="switch" aria-checked="false">
                  <input type="checkbox" id="set-snap-guides" />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
              </div>
              <div class="flex items-center justify-between mt-2">
                <label class="text-xs text-vectura-muted">Show Document Dimensions</label>
                <label class="sw-toggle" role="switch" aria-checked="false">
                  <input type="checkbox" id="set-show-document-dimensions" />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
              </div>
            </div>
            <div class="mt-2">
              <div class="flex items-center justify-between">
                <label class="text-xs text-vectura-muted">Save Preferences in Cookie</label>
                <label class="sw-toggle" role="switch" aria-checked="false">
                  <input type="checkbox" id="set-cookie-preferences" />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
              </div>
              <button id="btn-clear-preferences" type="button"
                class="mt-2 text-[11px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted">
                Clear Saved Preferences
              </button>
              <div class="flex items-center justify-between mt-2">
                <label class="text-xs text-vectura-muted" for="set-show-tour">Show tour on first launch</label>
                <label class="sw-toggle" role="switch" aria-checked="false">
                  <input type="checkbox" id="set-show-tour" />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
              </div>
            </div>
            <div class="mt-4">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-vectura-muted" for="bg-color-pill">Background</label>
                <button id="bg-color-pill" type="button"
                  class="value-chip text-xs text-vectura-accent font-mono color-thickness-pill">#FFFFFF</button>
                <input type="color" id="inp-bg-color" class="hidden" aria-label="Background color" />
              </div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-vectura-muted">Selection Outline</label>
                <label class="sw-toggle" role="switch" aria-checked="false">
                  <input type="checkbox" id="set-selection-outline" />
                  <span class="sw-track"></span>
                  <span class="sw-thumb"></span>
                </label>
              </div>
              <div class="mt-2">
                <label class="text-[11px] text-vectura-muted">Selection Outline Style</label>
                <div class="color-thickness-control">
                  <div class="style-field">
                    <span class="style-field-label">Line Color</span>
                    <button id="set-selection-outline-color-pill" type="button"
                      class="value-chip text-xs text-vectura-accent font-mono color-thickness-pill">#EF4444</button>
                    <input type="color" id="set-selection-outline-color" class="hidden" />
                  </div>
                  <div class="style-field">
                    <span class="style-field-label">Line Thickness</span>
                    <div class="color-thickness-size">
                      <input type="range" id="set-selection-outline-width-slider" min="0.1" max="2" step="0.05" value="0.4"
                        class="w-full">
                      <input type="number" id="set-selection-outline-width" min="0.1" max="2" step="0.05" value="0.4"
                        class="w-14 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
                      <span id="set-selection-outline-width-unit" class="text-[11px] text-vectura-muted">mm</span>
                    </div>
                  </div>
                  <div class="style-field">
                    <span class="style-field-label">Reset</span>
                    <button id="set-selection-outline-style-reset" type="button"
                      class="text-[11px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted">Reset</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="control-group">
          <label class="control-label">Plotter Physics</label>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-[11px] text-vectura-muted">Draw Speed (mm/s)</label>
              <input type="number" id="set-speed-down"
                class="w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:border-vectura-accent focus:outline-none" />
            </div>
            <div>
              <label class="text-[11px] text-vectura-muted">Travel Speed (mm/s)</label>
              <input type="number" id="set-speed-up"
                class="w-full bg-vectura-bg border border-vectura-border p-1 text-xs focus:border-vectura-accent focus:outline-none" />
            </div>
          </div>
        </div>
        <div class="control-group">
          <label class="control-label">Layer Bar Colors</label>
          <div class="palette-picker-wrap">
            <div id="layer-bar-palette-trigger" class="palette-picker-trigger" role="button" tabindex="0">
              <span id="layer-bar-palette-name">Prism</span>
              <div id="layer-bar-palette-preview" class="palette-picker-swatches"></div>
              <span class="palette-picker-arrow" aria-hidden="true"></span>
            </div>
            <div id="layer-bar-palette-menu" class="palette-picker-menu hidden"></div>
          </div>
        </div>
        <div class="control-group border-none">
          <label class="control-label">History</label>
          <div class="flex items-center justify-between">
            <label class="text-xs text-vectura-muted">Undo Steps</label>
            <input type="number" id="set-undo" min="1" max="200"
              class="w-12 bg-vectura-bg border border-vectura-border p-1 text-xs text-right focus:border-vectura-accent focus:outline-none" />
          </div>
        </div>
      </div>
    </div>
  `.trim();

  /**
   * Inject the document-setup panel markup into `host`. Idempotent — if the
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
   * Wire the open/close lifecycle for the Document Setup panel. Called from
   * inside the legacy bindGlobal() body. `this` is the legacy UI instance.
   *
   * Both onclick handlers forward to this.toggleSettingsPanel() — the
   * underlying toggle implementation already lives in
   * src/ui/shell/bottom-pane.js (Phase 2 step 3) so this module just
   * preserves the trigger wiring.
   *
   * The ~30 input handlers (paper size, margin, units, truncate, crop, undo,
   * etc.) deliberately stay in legacy bindGlobal() because they are
   * interleaved with shared selection-outline / margin-line / cookie / paper
   * handlers that are invoked from outside the Document Setup surface too.
   * Lifting them cleanly is a future refactor.
   */
  function bindHandlers() {
    const { getEl } = requireDeps('bindHandlers');

    const settingsPanel = getEl('settings-panel');
    const btnSettings = getEl('btn-settings');
    const btnCloseSettings = getEl('btn-close-settings');

    if (btnSettings && settingsPanel) {
      btnSettings.onclick = () => this.toggleSettingsPanel();
    }
    if (btnCloseSettings && settingsPanel) {
      btnCloseSettings.onclick = () => this.toggleSettingsPanel(false);
    }

    const familyModern = getEl('theme-family-modern', { silent: true });
    const familyClassic = getEl('theme-family-classic', { silent: true });
    const ui = this;
    [familyModern, familyClassic].forEach((btn) => {
      if (!btn) return;
      btn.onclick = () => {
        const next = btn.dataset.family || 'meridian';
        if (ui.app && typeof ui.app.setThemeFamily === 'function') {
          ui.app.setThemeFamily(next);
        }
      };
    });

    const settingsPanelEl = getEl('settings-panel');
    if (settingsPanelEl) {
      settingsPanelEl.querySelectorAll('.sw-toggle').forEach((toggle) => {
        const cb = toggle.querySelector('input[type="checkbox"]');
        if (!cb) return;
        const sync = () => toggle.setAttribute('aria-checked', String(cb.checked));
        sync();
        cb.addEventListener('change', sync);
      });
    }
  }

  Modals.DocumentSetup = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl }
     */
    bind(deps) {
      DEPS = deps || {};
    },
    mount,
    bindHandlers,
    PANEL_HTML,
    PANEL_ID,
    installOn(proto) {
      // Legacy alias preserved on the prototype.
      proto._bindDocumentSetupHandlers = function() { return bindHandlers.call(this); };
    },
  };
})();
