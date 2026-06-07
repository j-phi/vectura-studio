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

  // The Contributor / Presets section (Developer Mode) is only surfaced when the
  // app is served locally — end users on the deployed site never see it exists.
  const isDevEligible = () => {
    try {
      const loc = (typeof location !== 'undefined') ? location : null;
      if (!loc) return false;
      if (loc.protocol === 'file:') return true;
      const h = loc.hostname || '';
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '0.0.0.0';
    } catch (_) { return false; }
  };

  // Markup rebuilt against the Meridian skin component vocabulary
  // (`.sect`, `.sect-hdr`, `.sect-body`, `.ctrl-sel`, `.num-step`, `.seg-ctrl`,
  // `.sw-toggle`, `.value-chip`, `.ctrl-slider`) so the drawer paints in the
  // same visual register as every other Vectura panel. Every #id from the
  // original markup is preserved verbatim so the ~30 `set-*` handlers wired
  // by `bindHandlers()` keep matching the DOM. `bindHandlers()` adds the
  // section collapse + num-step ± wiring needed by the new primitives.
  //
  // Sections are arranged top-to-bottom in roughly descending edit-frequency
  // order. All sections default to open (`.is-open` on `.sect-hdr`) so this
  // change is a pure visual refactor — no controls move out of the user's
  // sight on first open.
  const numStep = ({ id, value, min = '', max = '', step = '', cls = '' }) => `
    <div class="num-step ${cls}" data-num-step>
      <button type="button" class="num-step-btn" data-num-step-dec aria-label="Decrement">−</button>
      <input type="number" id="${id}" class="num-step-inp" value="${value}"${min !== '' ? ` min="${min}"` : ''}${max !== '' ? ` max="${max}"` : ''}${step !== '' ? ` step="${step}"` : ''} />
      <button type="button" class="num-step-btn" data-num-step-inc aria-label="Increment">+</button>
    </div>
  `;

  const swToggle = (id, label, ariaChecked = 'false') => `
    <div class="ctrl-row">
      <label class="ctrl-lbl" for="${id}">${label}</label>
      <label class="sw-toggle" role="switch" aria-checked="${ariaChecked}">
        <input type="checkbox" id="${id}" />
        <span class="sw-track"></span>
        <span class="sw-thumb"></span>
      </label>
    </div>
  `;

  const PANEL_HTML = `
    <div id="settings-panel" class="settings-panel">
      <div class="pane-hdr">
        <span class="pane-title">Document Setup</span>
        <button id="btn-close-settings" class="settings-panel-close" type="button" aria-label="Close Document Setup">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
      </div>
      <div class="settings-panel-body">

        <div class="sect sect--color-theme">
          <button type="button" class="sect-hdr is-open" data-sect-toggle aria-expanded="true">
            Theme
            <span class="sect-arrow down"></span>
          </button>
          <div class="sect-body" data-sect-body>
            <div id="theme-family-toggle" class="seg-ctrl" role="radiogroup" aria-label="Theme family">
              <button type="button" id="theme-family-modern" class="seg-opt active" data-family="meridian" role="radio" aria-checked="true">Modern</button>
              <button type="button" id="theme-family-classic" class="seg-opt" data-family="classic" role="radio" aria-checked="false">Classic</button>
            </div>
          </div>
        </div>

        <div class="sect sect--color-paper">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            Paper
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Orientation</span>
              <div id="orientation-toggle" class="seg-ctrl" role="radiogroup" aria-label="Orientation">
                <button type="button" id="orientation-portrait" class="seg-opt" data-orientation="portrait" role="radio" aria-checked="false">Portrait</button>
                <button type="button" id="orientation-landscape" class="seg-opt active" data-orientation="landscape" role="radio" aria-checked="true">Landscape</button>
              </div>
            </div>
            <input type="checkbox" id="set-orientation" class="hidden" checked />
            <span id="orientation-label" class="hidden">Landscape</span>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Size</span>
              <div class="ctrl-sel-wrap">
                <select id="machine-profile" class="ctrl-sel"></select>
              </div>
            </div>
            <div id="custom-size-fields" class="ctrl-2col hidden">
              <div class="ctrl-grp">
                <span class="ctrl-sub-lbl" id="set-paper-width-label">Width (mm)</span>
                ${numStep({ id: 'set-paper-width', value: '' })}
              </div>
              <div class="ctrl-grp">
                <span class="ctrl-sub-lbl" id="set-paper-height-label">Height (mm)</span>
                ${numStep({ id: 'set-paper-height', value: '' })}
              </div>
            </div>
            <div class="ctrl-row">
              <label class="ctrl-lbl" for="set-document-units">Units</label>
              <div class="ctrl-sel-wrap" style="width:120px">
                <select id="set-document-units" class="ctrl-sel">
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                </select>
              </div>
            </div>
            ${swToggle('set-show-document-dimensions', 'Show document dimensions')}
          </div>
        </div>

        <div class="sect sect--color-margins">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            Margins
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            ${swToggle('set-margin-line', 'Show margin outline')}
            <div class="line-style-control">
              <div class="style-field">
                <span class="style-field-label">Line Color</span>
                <button id="set-margin-line-color-pill" type="button" class="value-chip color-thickness-pill">#52525B</button>
                <input type="color" id="set-margin-line-color" class="hidden" />
              </div>
              <div class="style-field">
                <span class="style-field-label">Line Thickness</span>
                <div class="color-thickness-size slider-row">
                  <input type="range" id="set-margin-line-weight-slider" class="ctrl-slider" min="0.05" max="2" step="0.05" value="0.2" />
                  <input type="number" id="set-margin-line-weight" class="num-step-inp slider-val-inp" min="0.05" max="2" step="0.05" value="0.2" />
                  <span id="set-margin-line-weight-unit" class="ctrl-trail-hint">mm</span>
                </div>
              </div>
              <div class="style-field">
                <span class="style-field-label">Margin Line Gap</span>
                <div class="color-thickness-size slider-row">
                  <input type="range" id="set-margin-line-dotting-slider" class="ctrl-slider" min="0" max="50" step="0.5" value="0" />
                  <input type="number" id="set-margin-line-dotting" class="num-step-inp slider-val-inp" min="0" step="0.5" value="0" />
                  <span id="set-margin-line-dotting-unit" class="ctrl-trail-hint">mm</span>
                </div>
              </div>
            </div>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl" id="set-margin-label">Margin (mm)</span>
              <div class="slider-row">
                <input type="range" id="set-margin-slider" class="ctrl-slider" min="0" max="50" step="0.5" value="10" />
                <input type="number" id="set-margin" class="slider-val-inp" min="0" step="0.01" value="10" />
                <span id="set-margin-unit" class="ctrl-trail-hint">mm</span>
              </div>
            </div>
            ${swToggle('set-truncate', 'Crop art to margins')}
            ${swToggle('set-crop-exports', 'Crop exports to margin')}
            <div class="ctrl-row">
              <label class="ctrl-lbl" for="set-outside-opacity">Outside opacity</label>
              ${numStep({ id: 'set-outside-opacity', value: '', min: '0', max: '1', step: '0.05', cls: 'num-step--narrow' })}
            </div>
            <button id="set-margin-line-style-reset" type="button" class="hdr-btn">Reset margins to defaults</button>
          </div>
        </div>

        <div class="sect sect--color-guides">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            Guides &amp; Display
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            ${swToggle('set-show-guides', 'Show guides')}
            ${swToggle('set-snap-guides', 'Snap to guides')}
          </div>
        </div>

        <div class="sect sect--color-bg">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            Background &amp; Selection
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            <div class="ctrl-row">
              <label class="ctrl-lbl" for="bg-color-pill">Background</label>
              <span class="ctrl-row-trail">
                <button id="bg-color-pill" type="button" class="value-chip">#FFFFFF</button>
                <input type="color" id="inp-bg-color" class="hidden" aria-label="Background color" />
              </span>
            </div>
            ${swToggle('set-selection-outline', 'Selection outline')}
            <div class="color-thickness-control">
              <div class="style-field">
                <span class="style-field-label">Line Color</span>
                <button id="set-selection-outline-color-pill" type="button" class="value-chip color-thickness-pill">#EF4444</button>
                <input type="color" id="set-selection-outline-color" class="hidden" />
              </div>
              <div class="style-field">
                <span class="style-field-label">Line Thickness</span>
                <div class="color-thickness-size slider-row">
                  <input type="range" id="set-selection-outline-width-slider" class="ctrl-slider" min="0.1" max="2" step="0.05" value="0.15" />
                  <input type="number" id="set-selection-outline-width" class="num-step-inp slider-val-inp" min="0.1" max="2" step="0.05" value="0.15" />
                  <span id="set-selection-outline-width-unit" class="ctrl-trail-hint">mm</span>
                </div>
              </div>
              <div class="style-field">
                <span class="style-field-label">Reset</span>
                <button id="set-selection-outline-style-reset" type="button" class="hdr-btn">Reset</button>
              </div>
            </div>
          </div>
        </div>

        <div class="sect sect--color-plotter">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            Plotter Physics
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Draw mm/s</span>
              ${numStep({ id: 'set-speed-down', value: '' })}
            </div>
            <div class="ctrl-grp">
              <span class="ctrl-sub-lbl">Travel mm/s</span>
              ${numStep({ id: 'set-speed-up', value: '' })}
            </div>
          </div>
        </div>

        <div class="sect sect--color-palette">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            UI Color Palette
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            <div class="palette-picker-wrap">
              <div id="layer-bar-palette-trigger" class="palette-picker-trigger" role="button" tabindex="0">
                <span id="layer-bar-palette-name">Prism</span>
                <div id="layer-bar-palette-preview" class="palette-picker-swatches"></div>
                <span class="palette-picker-arrow" aria-hidden="true"></span>
              </div>
              <div id="layer-bar-palette-menu" class="palette-picker-menu hidden"></div>
            </div>
          </div>
        </div>

        <div class="sect sect--color-history">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            History &amp; Preferences
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            <div class="ctrl-row">
              <label class="ctrl-lbl" for="set-undo">Undo steps</label>
              ${numStep({ id: 'set-undo', value: '', min: '1', max: '200', cls: 'num-step--narrow' })}
            </div>
            ${swToggle('set-cookie-preferences', 'Save preferences in cookie')}
            <button id="btn-clear-preferences" type="button" class="hdr-btn">Clear saved preferences</button>
            ${swToggle('set-show-tour', 'Show tour on first launch')}
            ${swToggle('set-show-crystallographic-names', 'Show crystallographic group names (p4m, p3m1…)')}
          </div>
        </div>

        <div class="sect sect--color-history">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            Preset Storage
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            <p class="ctrl-hint">Custom presets always save in this browser. Sync to a folder to keep a live copy on disk — every preset you save mirrors there automatically, across sessions. Or export a bundle to move them between machines.</p>
            <div id="preset-storage-body"><!-- rendered dynamically by renderPresetStorageUi() --></div>
          </div>
        </div>
${isDevEligible() ? `
        <div class="sect sect--color-history">
          <button type="button" class="sect-hdr" data-sect-toggle aria-expanded="false">
            Contributor / Presets
            <span class="sect-arrow"></span>
          </button>
          <div class="sect-body" data-sect-body style="max-height:0;overflow:hidden;padding-top:0;padding-bottom:0">
            ${swToggle('set-dev-mode', 'Developer mode')}
            <p class="ctrl-hint">When on, the preset Save dialog can download a bundler-ready .vectura into the project's user-presets/ workflow.</p>
          </div>
        </div>
` : ''}
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

      // Collapsible sections — clicking the header toggles `.is-open` on the
      // header (rotates the chevron) and animates the matching `.sect-body`
      // open/closed via a max-height transition.
      settingsPanelEl.querySelectorAll('[data-sect-toggle]').forEach((hdr) => {
        hdr.addEventListener('click', () => {
          const open = !hdr.classList.contains('is-open');
          hdr.classList.toggle('is-open', open);
          hdr.setAttribute('aria-expanded', String(open));
          const arrow = hdr.querySelector('.sect-arrow');
          if (arrow) arrow.classList.toggle('down', open);
          const body = hdr.nextElementSibling;
          if (body && body.matches('[data-sect-body]')) {
            if (open) {
              // Suppress the CSS transition before lifting inline zeroes so
              // that clearing paddingTop/Bottom doesn't start a 0→CSS
              // transition mid-measurement. Without this, offsetHeight captures
              // t=0 of the transition (padding still 0), undercounting by
              // padding-top + padding-bottom and causing a jump at open-end.
              body.style.transition = 'none';
              body.style.maxHeight = '';
              body.style.overflow = '';
              body.style.paddingTop = '';
              body.style.paddingBottom = '';
              void body.offsetHeight; // flush transition:none so CSS applies fully
              const naturalHeight = body.offsetHeight;
              // Snap back to the collapsed start state before any paint.
              body.style.maxHeight = '0';
              body.style.paddingTop = '0';
              body.style.paddingBottom = '0';
              body.style.overflow = 'hidden';
              // Restore CSS transition, then force reflow to anchor the
              // collapsed state as the animation origin.
              body.style.transition = '';
              void body.offsetHeight;
              // Animate to the measured natural height; restore padding simultaneously.
              body.style.maxHeight = naturalHeight + 'px';
              body.style.paddingTop = '';
              body.style.paddingBottom = '';
              // Filter on max-height specifically — padding-top and
              // padding-bottom also fire transitionend and would clear
              // maxHeight mid-flight if caught by a generic { once: true }.
              const onOpenEnd = (e) => {
                if (e.propertyName !== 'max-height') return;
                body.removeEventListener('transitionend', onOpenEnd);
                // Suppress CSS transitions before clearing maxHeight. Without
                // this, clearing from Npx → none re-triggers the transition
                // rule and causes a visible jump (the hitch). With it, the
                // property snaps instantly and the transition is restored one
                // frame later so future close/open animations still work.
                body.style.transition = 'none';
                void body.offsetHeight; // flush transition:none before the change
                body.style.maxHeight = '';
                body.style.overflow = '';
                requestAnimationFrame(() => { body.style.transition = ''; });
              };
              body.addEventListener('transitionend', onOpenEnd);
            } else {
              body.style.maxHeight = body.scrollHeight + 'px';
              body.style.overflow = 'hidden';
              requestAnimationFrame(() => requestAnimationFrame(() => {
                body.style.maxHeight = '0';
                body.style.paddingTop = '0';
                body.style.paddingBottom = '0';
              }));
            }
          }
        });
      });

      // Number-stepper ± buttons — find the sibling <input>, bump by `step`
      // (default 1), clamp to min/max, and dispatch `input` + `change` so
      // the legacy bindGlobal handlers still fire. Held key repeats fall
      // through to the native number-input arrow keys; this wiring is just
      // for the visible ± hit targets.
      settingsPanelEl.querySelectorAll('[data-num-step]').forEach((wrap) => {
        const input = wrap.querySelector('.num-step-inp');
        if (!input) return;
        const dec = wrap.querySelector('[data-num-step-dec]');
        const inc = wrap.querySelector('[data-num-step-inc]');
        const bump = (dir) => {
          const step = parseFloat(input.step) || 1;
          const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
          const max = input.max !== '' ? parseFloat(input.max) : Infinity;
          const cur = parseFloat(input.value);
          const base = Number.isFinite(cur) ? cur : 0;
          let next = base + dir * step;
          // Tame floating-point drift on small steps (0.05 etc.)
          const decimals = (String(step).split('.')[1] || '').length;
          if (decimals > 0) next = parseFloat(next.toFixed(decimals));
          if (next < min) next = min;
          if (next > max) next = max;
          input.value = String(next);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        dec?.addEventListener('click', () => bump(-1));
        inc?.addEventListener('click', () => bump(1));
      });

      // Orientation dual-toggle — clicking Portrait/Landscape updates the hidden
      // #set-orientation checkbox and fires its change event so the
      // `set-orientation` change-handler wired by `bindHandlers()` runs.
      const portraitBtn = settingsPanelEl.querySelector('#orientation-portrait');
      const landscapeBtn = settingsPanelEl.querySelector('#orientation-landscape');
      const orientationCb = getEl('set-orientation', { silent: true });
      [portraitBtn, landscapeBtn].forEach((btn) => {
        if (!btn) return;
        btn.onclick = () => {
          const isLandscape = btn.dataset.orientation === 'landscape';
          if (orientationCb) {
            orientationCb.checked = isLandscape;
            orientationCb.dispatchEvent(new Event('change', { bubbles: true }));
          }
          portraitBtn?.classList.toggle('active', !isLandscape);
          portraitBtn?.setAttribute('aria-checked', String(!isLandscape));
          landscapeBtn?.classList.toggle('active', isLandscape);
          landscapeBtn?.setAttribute('aria-checked', String(isLandscape));
        };
      });
    }
  }

  // ── Desktop modal surface (Var 02) ─────────────────────────────────
  //
  // On viewports ≥ 900 px the slide-out drawer is not the default surface;
  // a centered modal is. Both surfaces share the same form body — the
  // `.settings-panel-body` element is *moved* between the drawer and the
  // modal rather than duplicated, so the ~30 `#set-*` ids stay unique and
  // the legacy bindGlobal handlers keep firing wherever the form lives.
  // That also avoids the cross-surface state-sync problem entirely.
  //
  // The viewport threshold matches `body.mobile-layout`'s 900 px
  // application in `src/ui/shell/workspace.js` so the two layout signals
  // never disagree.
  const DESKTOP_BREAKPOINT = 900;
  const MODAL_CARD_CLASS = 'modal-card--document-setup';

  function isDesktopViewport() {
    return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT;
  }

  let modalIsOpen = false;
  let previewRefreshHandle = 0;

  function buildModalShell(formBody) {
    const doc = formBody.ownerDocument;
    const wrap = doc.createElement('div');
    wrap.className = 'document-setup-modal';
    wrap.innerHTML = `
      <div class="document-setup-preview" data-preview-pane>
        <div class="document-setup-preview-frame">
          <img class="document-setup-preview-img" alt="Document preview" />
        </div>
        <div class="document-setup-preview-meta">
          <span class="document-setup-preview-meta-label">Live preview</span>
          <span class="document-setup-preview-meta-hint" data-preview-hint>—</span>
        </div>
      </div>
      <div class="document-setup-modal-form" data-form-host></div>
    `;
    const host = wrap.querySelector('[data-form-host]');
    host.appendChild(formBody);
    return wrap;
  }

  function snapshotPreview(modalRoot) {
    const img = modalRoot.querySelector('.document-setup-preview-img');
    const hint = modalRoot.querySelector('[data-preview-hint]');
    if (!img) return;
    const app = (typeof window !== 'undefined' ? window.app : null);
    // `renderer.ready` is set in renderer.js once it has both a canvas and
    // a 2D context. jsdom (without the optional `canvas` npm package)
    // returns null from getContext('2d'), leaving ready=false — which
    // also means toDataURL would hit jsdom's "Not implemented" stub.
    // The form still works without the preview; we just leave the <img> blank.
    if (!app?.renderer?.ready) return;
    const canvas = app.renderer.canvas;
    if (!canvas || typeof canvas.toDataURL !== 'function') return;
    if (!canvas.width || !canvas.height) return;
    try {
      img.src = canvas.toDataURL('image/png');
    } catch {
      // Browsers can throw SecurityError on tainted canvases.
      img.removeAttribute('src');
    }
    if (hint) {
      const SETTINGS = (window.Vectura && window.Vectura.SETTINGS) || {};
      const w = Number.isFinite(SETTINGS.paperWidth) ? SETTINGS.paperWidth : '?';
      const h = Number.isFinite(SETTINGS.paperHeight) ? SETTINGS.paperHeight : '?';
      const m = Number.isFinite(SETTINGS.margin) ? SETTINGS.margin : '?';
      hint.textContent = `${w} × ${h} mm · ${m} mm margin`;
    }
  }

  function schedulePreviewRefresh(modalRoot) {
    // Form-change handlers in legacy bindGlobal redraw the renderer
    // synchronously, but the canvas paint lands on the next frame. Two
    // animation frames after the change event guarantees we snapshot
    // *after* that paint settles.
    if (previewRefreshHandle) cancelAnimationFrame(previewRefreshHandle);
    previewRefreshHandle = requestAnimationFrame(() => {
      previewRefreshHandle = requestAnimationFrame(() => {
        previewRefreshHandle = 0;
        snapshotPreview(modalRoot);
      });
    });
  }

  function openSetupModal(ui) {
    if (modalIsOpen) return false;
    if (!ui || typeof ui.openModal !== 'function') return false;
    const drawer = document.getElementById(PANEL_ID);
    const formBody = drawer?.querySelector('.settings-panel-body');
    if (!drawer || !formBody) return false;

    // Some user might still have the drawer mid-slide-in from a prior
    // mobile session — close it before adopting the modal surface so the
    // two surfaces never paint simultaneously.
    drawer.classList.remove('open');

    const modalRoot = buildModalShell(formBody);

    ui.openModal({
      title: 'Document Setup',
      body: modalRoot,
      cardClass: MODAL_CARD_CLASS,
      onClose: () => {
        modalIsOpen = false;
        if (previewRefreshHandle) {
          cancelAnimationFrame(previewRefreshHandle);
          previewRefreshHandle = 0;
        }
        // Move the form body back into the drawer so a subsequent
        // mobile open finds it where bindGlobal expects.
        const stillThere = modalRoot.querySelector('.settings-panel-body');
        if (stillThere && drawer && !drawer.contains(stillThere)) {
          drawer.appendChild(stillThere);
        }
      },
    });
    modalIsOpen = true;

    // Initial paint + refresh on any control change.
    snapshotPreview(modalRoot);
    modalRoot.addEventListener('change', () => schedulePreviewRefresh(modalRoot), true);
    modalRoot.addEventListener('input', () => schedulePreviewRefresh(modalRoot), true);
    return true;
  }

  function closeSetupModal(ui) {
    if (!modalIsOpen || !ui || typeof ui.closeModal !== 'function') return false;
    ui.closeModal();
    return true;
  }

  function toggleSetupModal(ui, force) {
    const want = typeof force === 'boolean' ? force : !modalIsOpen;
    if (want) return openSetupModal(ui);
    return closeSetupModal(ui);
  }

  /**
   * Wire all ~30 Document Setup input handlers.
   *
   * Grouped here so the document-setup panel owns every wire from
   * open-trigger through last input. `this` is the UI instance — handlers
   * reach for `this.app`, `this.parseDocumentNumber`,
   * `this.refreshDocumentUnitsUi`, `this.buildControls`, `this.initSettingsValues`
   * via the prototype, exactly as they did from inside bindGlobal.
   *
   * Element scope: every `#set-*` input, the `#machine-profile` dropdown,
   * the `#orientation-*` toggles, the `#bg-color-*` pair, the plotter
   * physics row, and the `#btn-view-grid-toggle` (grid on/off shortcut).
   * Non-Document-Setup wiring (layer-list buttons, file I/O, theme toggle,
   * algorithm-module dropdown, header chrome) stays in bindGlobal until
   * Units 1.9b/1.9c land.
   */
  function bindDocumentSetupListeners() {
    const {
      getEl,
      SETTINGS,
      MACHINES,
      normalizeDocumentUnits,
      getContrastTextColor,
      openColorPickerAnchoredTo,
    } = requireDeps('bindDocumentSetupListeners');

    const machineProfile = getEl('machine-profile');
    const setDocumentUnits = getEl('set-document-units', { silent: true });
    const setMargin = getEl('set-margin');
    const setMarginSlider = getEl('set-margin-slider', { silent: true });
    const setTruncate = getEl('set-truncate');
    const setCropExports = getEl('set-crop-exports');
    const setOutsideOpacity = getEl('set-outside-opacity');
    const setMarginLine = getEl('set-margin-line');
    const setMarginLineColorPill = getEl('set-margin-line-color-pill');
    const setMarginLineWeight = getEl('set-margin-line-weight');
    const setMarginLineWeightSlider = getEl('set-margin-line-weight-slider');
    const setMarginLineColor = getEl('set-margin-line-color');
    const setMarginLineDotting = getEl('set-margin-line-dotting');
    const setMarginLineDottingSlider = getEl('set-margin-line-dotting-slider', { silent: true });
    const setMarginLineStyleReset = getEl('set-margin-line-style-reset');
    const setShowGuides = getEl('set-show-guides');
    const setSnapGuides = getEl('set-snap-guides');
    const setShowDocumentDimensions = getEl('set-show-document-dimensions', { silent: true });
    const setSelectionOutline = getEl('set-selection-outline');
    const setSelectionOutlineColorPill = getEl('set-selection-outline-color-pill');
    const setSelectionOutlineColor = getEl('set-selection-outline-color');
    const setSelectionOutlineWidthSlider = getEl('set-selection-outline-width-slider');
    const setSelectionOutlineWidth = getEl('set-selection-outline-width');
    const setSelectionOutlineStyleReset = getEl('set-selection-outline-style-reset');
    const setCookiePreferences = getEl('set-cookie-preferences');
    const btnClearPreferences = getEl('btn-clear-preferences', { silent: true });
    const setSpeedDown = getEl('set-speed-down');
    const setSpeedUp = getEl('set-speed-up');
    const setStroke = getEl('set-stroke', { silent: true });
    const setPrecision = getEl('set-precision', { silent: true });
    const setPlotterOptEnabled = getEl('set-plotter-opt-enabled', { silent: true });
    const setPlotterOpt = getEl('set-plotter-opt', { silent: true });
    const setPlotterOptValue = getEl('set-plotter-opt-value', { silent: true });
    const setUndo = getEl('set-undo');
    const setPaperWidth = getEl('set-paper-width');
    const setPaperHeight = getEl('set-paper-height');
    const setOrientation = getEl('set-orientation');
    const orientationLabel = getEl('orientation-label');
    const customFields = getEl('custom-size-fields');

    if (setCropExports) {
      setCropExports.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.cropExports = e.target.checked;
        this.app.persistPreferencesDebounced?.();
      };
    }

    if (setDocumentUnits) {
      setDocumentUnits.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.documentUnits = normalizeDocumentUnits(e.target.value);
        this.refreshDocumentUnitsUi();
        this.buildControls();
        this.app.render();
      };
    }

    if (machineProfile) {
      machineProfile.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const next = e.target.value;
        SETTINGS.paperSize = next;
        if (customFields) customFields.classList.toggle('hidden', next !== 'custom');
        if (next !== 'custom' && MACHINES && MACHINES[next]) {
          SETTINGS.paperWidth = MACHINES[next].width;
          SETTINGS.paperHeight = MACHINES[next].height;
          this.refreshDocumentUnitsUi();
        }
        this.app.engine.setProfile(next);
        this.app.renderer.center();
        this.app.regen();
      };
    }
    if (setMargin) {
      const applyMargin = (raw, options = {}) => {
        const { commit = false } = options;
        if (commit && this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(0, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.margin }));
        SETTINGS.margin = Number.isFinite(next) ? next : SETTINGS.margin;
        this.refreshDocumentUnitsUi();
        this.app.regen();
      };
      setMargin.oninput = (e) => applyMargin(e.target.value);
      setMargin.onchange = (e) => applyMargin(e.target.value, { commit: true });
      if (setMarginSlider) {
        setMarginSlider.oninput = (e) => applyMargin(e.target.value);
        setMarginSlider.onchange = (e) => applyMargin(e.target.value, { commit: true });
      }
    }
    if (setTruncate) {
      setTruncate.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.truncate = e.target.checked;
        this.app.render();
      };
    }
    if (setOutsideOpacity) {
      setOutsideOpacity.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(0, Math.min(1, parseFloat(e.target.value)));
        SETTINGS.outsideOpacity = Number.isFinite(next) ? next : 0.5;
        e.target.value = SETTINGS.outsideOpacity;
        this.app.render();
      };
    }
    if (setMarginLine) {
      setMarginLine.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.marginLineVisible = e.target.checked;
        this.app.render();
      };
    }
    if (setMarginLineWeight) {
      const applyMarginLineWeight = (raw, options = {}) => {
        const { commit = false } = options;
        if (commit && this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(0.05, Math.min(2, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.marginLineWeight ?? 0.2 })));
        SETTINGS.marginLineWeight = Number.isFinite(next) ? next : 0.2;
        this.refreshDocumentUnitsUi();
        this.app.render();
      };
      setMarginLineWeight.oninput = (e) => applyMarginLineWeight(e.target.value);
      setMarginLineWeight.onchange = (e) => applyMarginLineWeight(e.target.value, { commit: true });
      if (setMarginLineWeightSlider) {
        setMarginLineWeightSlider.oninput = (e) => applyMarginLineWeight(e.target.value);
        setMarginLineWeightSlider.onchange = (e) => applyMarginLineWeight(e.target.value, { commit: true });
      }
    }
    if (setMarginLineColor && setMarginLineColorPill) {
      setMarginLineColorPill.onclick = () => openColorPickerAnchoredTo(setMarginLineColor, setMarginLineColorPill, { title: 'Margin Color', uiInstance: this });
      setMarginLineColor.oninput = (e) => {
        const next = e.target.value || SETTINGS.marginLineColor || '#52525b';
        SETTINGS.marginLineColor = next;
        setMarginLineColorPill.textContent = next.toUpperCase();
        setMarginLineColorPill.style.background = next;
        setMarginLineColorPill.style.color = getContrastTextColor(next);
        this.app.render();
      };
      setMarginLineColor.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const next = e.target.value || SETTINGS.marginLineColor || '#52525b';
        SETTINGS.marginLineColor = next;
        setMarginLineColorPill.textContent = next.toUpperCase();
        setMarginLineColorPill.style.background = next;
        setMarginLineColorPill.style.color = getContrastTextColor(next);
        this.app.render();
      };
    }
    if (setMarginLineDotting) {
      const applyMarginLineDotting = (raw, options = {}) => {
        const { commit = false } = options;
        if (commit && this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(0, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.marginLineDotting ?? 0 }));
        SETTINGS.marginLineDotting = Number.isFinite(next) ? next : 0;
        this.refreshDocumentUnitsUi();
        this.app.render();
      };
      setMarginLineDotting.oninput = (e) => applyMarginLineDotting(e.target.value);
      setMarginLineDotting.onchange = (e) => applyMarginLineDotting(e.target.value, { commit: true });
      if (setMarginLineDottingSlider) {
        setMarginLineDottingSlider.oninput = (e) => applyMarginLineDotting(e.target.value);
        setMarginLineDottingSlider.onchange = (e) => applyMarginLineDotting(e.target.value, { commit: true });
      }
    }
    if (setMarginLineStyleReset) {
      setMarginLineStyleReset.onclick = () => {
        if (this.app.pushHistory) this.app.pushHistory();

        // Margin outline visibility
        SETTINGS.marginLineVisible = false;
        if (setMarginLine) {
          setMarginLine.checked = false;
          setMarginLine.closest('[role="switch"]')?.setAttribute('aria-checked', 'false');
        }

        // Margin outline style
        SETTINGS.marginLineColor = '#52525b';
        SETTINGS.marginLineWeight = 0.2;
        SETTINGS.marginLineDotting = 0;
        if (setMarginLineColor) setMarginLineColor.value = '#52525b';
        if (setMarginLineColorPill) {
          setMarginLineColorPill.textContent = '#52525B';
          setMarginLineColorPill.style.background = '#52525b';
          setMarginLineColorPill.style.color = getContrastTextColor('#52525b');
        }
        if (setMarginLineDotting) setMarginLineDotting.value = '0';
        if (setMarginLineDottingSlider) setMarginLineDottingSlider.value = '0';

        // Margin value
        SETTINGS.margin = 20;

        // Crop toggles
        SETTINGS.truncate = true;
        if (setTruncate) {
          setTruncate.checked = true;
          setTruncate.closest('[role="switch"]')?.setAttribute('aria-checked', 'true');
        }
        SETTINGS.cropExports = true;
        if (setCropExports) {
          setCropExports.checked = true;
          setCropExports.closest('[role="switch"]')?.setAttribute('aria-checked', 'true');
        }

        // Outside opacity
        SETTINGS.outsideOpacity = 0.5;
        if (setOutsideOpacity) setOutsideOpacity.value = '0.5';

        this.refreshDocumentUnitsUi();
        this.app.regen();
      };
    }
    if (setShowGuides) {
      setShowGuides.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.showGuides = e.target.checked;
        this.app.render();
      };
    }
    if (setSnapGuides) {
      setSnapGuides.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.snapGuides = e.target.checked;
      };
    }
    if (setShowDocumentDimensions) {
      setShowDocumentDimensions.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.showDocumentDimensions = e.target.checked;
        this.app.render();
      };
    }
    const btnViewGridToggle = getEl('btn-view-grid-toggle');
    if (btnViewGridToggle) {
      btnViewGridToggle.onclick = () => {
        SETTINGS.gridType = (SETTINGS.gridType && SETTINGS.gridType !== 'none') ? 'none' : 'standard';
        if (this.app.pushHistory) this.app.pushHistory();
        this.initSettingsValues();
        this.app.render();
        const menubar = getEl('top-menubar', { silent: true });
        const p = menubar?.querySelector('[data-top-menu-panel][aria-label="View menu"]');
        if (p) p.classList.remove('open');
      };
    }

    if (setSelectionOutline) {
      setSelectionOutline.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.selectionOutline = e.target.checked;
        this.app.render();
      };
    }
    if (setSelectionOutlineColorPill && setSelectionOutlineColor) {
      setSelectionOutlineColorPill.onclick = () =>
        openColorPickerAnchoredTo(setSelectionOutlineColor, setSelectionOutlineColorPill, { title: 'Selection Color', uiInstance: this });
      setSelectionOutlineColor.oninput = (e) => {
        const nextColor = e.target.value || SETTINGS.selectionOutlineColor || '#ef4444';
        SETTINGS.selectionOutlineColor = nextColor;
        setSelectionOutlineColorPill.textContent = nextColor.toUpperCase();
        setSelectionOutlineColorPill.style.background = nextColor;
        setSelectionOutlineColorPill.style.color = getContrastTextColor(nextColor);
        this.app.render();
      };
      setSelectionOutlineColor.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const nextColor = e.target.value || SETTINGS.selectionOutlineColor || '#ef4444';
        SETTINGS.selectionOutlineColor = nextColor;
        setSelectionOutlineColorPill.textContent = nextColor.toUpperCase();
        setSelectionOutlineColorPill.style.background = nextColor;
        setSelectionOutlineColorPill.style.color = getContrastTextColor(nextColor);
        this.app.render();
      };
    }
    const applySelectionOutlineWidth = (raw, options = {}) => {
      const { commit = false } = options;
      if (commit && this.app.pushHistory) this.app.pushHistory();
      const next = Math.max(0.1, Math.min(2, this.parseDocumentNumber(raw, { fallbackMm: SETTINGS.selectionOutlineWidth ?? 0.15 })));
      SETTINGS.selectionOutlineWidth = Number.isFinite(next) ? next : 0.15;
      this.refreshDocumentUnitsUi();
      this.app.render();
    };
    if (setSelectionOutlineWidthSlider) {
      setSelectionOutlineWidthSlider.oninput = (e) => applySelectionOutlineWidth(e.target.value);
      setSelectionOutlineWidthSlider.onchange = (e) => applySelectionOutlineWidth(e.target.value, { commit: true });
    }
    if (setSelectionOutlineWidth) {
      setSelectionOutlineWidth.oninput = (e) => applySelectionOutlineWidth(e.target.value);
      setSelectionOutlineWidth.onchange = (e) => applySelectionOutlineWidth(e.target.value, { commit: true });
    }
    if (setSelectionOutlineStyleReset) {
      setSelectionOutlineStyleReset.onclick = () => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.selectionOutlineColor = '#ef4444';
        SETTINGS.selectionOutlineWidth = 0.15;
        if (setSelectionOutlineColorPill) {
          setSelectionOutlineColorPill.textContent = '#EF4444';
          setSelectionOutlineColorPill.style.background = '#ef4444';
          setSelectionOutlineColorPill.style.color = getContrastTextColor('#ef4444');
        }
        this.refreshDocumentUnitsUi();
        this.app.render();
      };
    }
    if (setCookiePreferences) {
      setCookiePreferences.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.cookiePreferencesEnabled = e.target.checked;
        if (!SETTINGS.cookiePreferencesEnabled) {
          this.app.clearPreferenceCookie?.();
        } else {
          this.app.persistPreferences?.({ force: true });
        }
      };
    }
    const setShowTour = getEl('set-show-tour', { silent: true });
    if (setShowTour) {
      setShowTour.onchange = (e) => {
        SETTINGS.showTourOnFirstLaunch = e.target.checked;
        this.app?.persistPreferences?.();
      };
    }
    const setShowCrystallographicNames = getEl('set-show-crystallographic-names', { silent: true });
    if (setShowCrystallographicNames) {
      setShowCrystallographicNames.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.showCrystallographicNames = e.target.checked;
        this.app?.persistPreferences?.();
        this.app?.render?.();
      };
    }
    const setDevMode = getEl('set-dev-mode', { silent: true });
    if (setDevMode) {
      setDevMode.onchange = (e) => {
        SETTINGS.devMode = e.target.checked;
        this.app?.persistPreferences?.();
      };
    }
    // Preset Storage section is rendered dynamically (async folder status).
    this.renderPresetStorageUi?.();
    if (btnClearPreferences) {
      btnClearPreferences.onclick = () => {
        this.app.clearSavedPreferences?.();
        this.initSettingsValues();
      };
    }
    if (setSpeedDown) {
      setSpeedDown.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.speedDown = parseInt(e.target.value, 10);
        this.app.updateStats();
      };
    }
    if (setSpeedUp) {
      setSpeedUp.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.speedUp = parseInt(e.target.value, 10);
        this.app.updateStats();
      };
    }
    if (setStroke) {
      setStroke.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.strokeWidth = parseFloat(e.target.value);
        this.app.engine.layers.forEach((layer) => {
          layer.strokeWidth = SETTINGS.strokeWidth;
        });
        this.app.render();
      };
    }
    if (setPrecision) {
      setPrecision.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 3));
        SETTINGS.precision = next;
        e.target.value = next;
      };
    }
    if (setPaperWidth) {
      setPaperWidth.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(1, this.parseDocumentNumber(e.target.value, { fallbackMm: SETTINGS.paperWidth ?? 210 }));
        if (Number.isFinite(next)) SETTINGS.paperWidth = next;
        this.refreshDocumentUnitsUi();
        if (SETTINGS.paperSize === 'custom') {
          this.app.engine.setProfile('custom');
          this.app.renderer.center();
          this.app.regen();
        }
      };
    }
    if (setPaperHeight) {
      setPaperHeight.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(1, this.parseDocumentNumber(e.target.value, { fallbackMm: SETTINGS.paperHeight ?? 297 }));
        if (Number.isFinite(next)) SETTINGS.paperHeight = next;
        this.refreshDocumentUnitsUi();
        if (SETTINGS.paperSize === 'custom') {
          this.app.engine.setProfile('custom');
          this.app.renderer.center();
          this.app.regen();
        }
      };
    }
    if (setOrientation) {
      setOrientation.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        SETTINGS.paperOrientation = e.target.checked ? 'landscape' : 'portrait';
        if (orientationLabel) {
          orientationLabel.textContent = e.target.checked ? 'Landscape' : 'Portrait';
        }
        const key = machineProfile?.value || SETTINGS.paperSize || 'a4';
        this.app.engine.setProfile(key);
        this.app.renderer.center();
        this.app.regen();
      };
    }
    if (setPlotterOpt) {
      const clampPlotterOptValue = (raw) => {
        const next = parseFloat(raw);
        if (!Number.isFinite(next)) return 0.1;
        return Math.max(0.01, Math.min(1, next));
      };
      const applyPlotterOptValue = (raw, options = {}) => {
        const { render = true } = options;
        const enabled = setPlotterOptEnabled ? Boolean(setPlotterOptEnabled.checked) : true;
        const next = clampPlotterOptValue(raw);
        if (setPlotterOpt) setPlotterOpt.value = `${next}`;
        if (setPlotterOptValue) setPlotterOptValue.value = next.toFixed(2);
        SETTINGS.plotterOptimize = enabled ? next : 0;
        if (render) this.app.render();
      };
      const syncPlotterOptEnabledState = (enabled) => {
        if (setPlotterOpt) setPlotterOpt.disabled = !enabled;
        if (setPlotterOptValue) setPlotterOptValue.disabled = !enabled;
      };
      if (setPlotterOptEnabled) {
        setPlotterOptEnabled.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          const enabled = Boolean(e.target.checked);
          syncPlotterOptEnabledState(enabled);
          applyPlotterOptValue(setPlotterOptValue?.value || setPlotterOpt?.value || 0.1);
        };
        syncPlotterOptEnabledState(Boolean(setPlotterOptEnabled.checked));
      }
      setPlotterOpt.oninput = (e) => {
        applyPlotterOptValue(e.target.value);
      };
      setPlotterOpt.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        applyPlotterOptValue(e.target.value);
      };
      if (setPlotterOptValue) {
        setPlotterOptValue.oninput = (e) => {
          const next = clampPlotterOptValue(e.target.value);
          if (setPlotterOpt) setPlotterOpt.value = `${next}`;
          e.target.value = next.toFixed(2);
          SETTINGS.plotterOptimize = setPlotterOptEnabled?.checked === false ? 0 : next;
          this.app.render();
        };
        setPlotterOptValue.onchange = (e) => {
          if (this.app.pushHistory) this.app.pushHistory();
          applyPlotterOptValue(e.target.value);
        };
      }
    }
    if (setUndo) {
      setUndo.onchange = (e) => {
        if (this.app.pushHistory) this.app.pushHistory();
        const next = Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 20));
        SETTINGS.undoSteps = next;
        e.target.value = next;
        if (this.app.setUndoLimit) this.app.setUndoLimit(next);
      };
    }
  }

  /**
   * Grouped installer for the Document Setup panel's background-color
   * picker (`inp-bg-color` + `bg-color-pill`). The elements live inside
   * this panel's markup, so the wiring belongs alongside the other
   * Document Setup listeners. `this` is the UI instance — handlers reach
   * for `this.app.pushHistory`, `this.app.render` via the prototype.
   */
  function bindBgColorListeners() {
    const {
      getEl,
      SETTINGS,
      getContrastTextColor,
      openColorPickerAnchoredTo,
    } = requireDeps('bindBgColorListeners');
    const bgColor = getEl('inp-bg-color');
    if (!bgColor) return;
    const bgColorPill = getEl('bg-color-pill', { silent: true });
    let armed = false;
    const updatePill = (color) => {
      if (!bgColorPill || !color) return;
      bgColorPill.textContent = color.toUpperCase();
      bgColorPill.style.background = color;
      bgColorPill.style.color = getContrastTextColor(color);
    };
    if (bgColorPill) {
      bgColorPill.onclick = () => {
        if (!armed && this.app.pushHistory) this.app.pushHistory();
        armed = true;
        openColorPickerAnchoredTo(bgColor, bgColorPill, { title: 'Background Color', uiInstance: this });
      };
    }
    bgColor.onfocus = () => {
      if (!armed && this.app.pushHistory) this.app.pushHistory();
      armed = true;
    };
    bgColor.oninput = (e) => {
      SETTINGS.bgColor = e.target.value;
      updatePill(e.target.value);
      this.app.render();
    };
    bgColor.onchange = (e) => {
      SETTINGS.bgColor = e.target.value;
      updatePill(e.target.value);
      armed = false;
      this.app.render();
    };
  }

  /**
   * Render the dynamic body of the "Preset Storage" section based on the live
   * File System Access folder status. Safe on every browser: when FSA is
   * unsupported the folder controls are omitted and only Export/Import remain.
   * `this` is the UI instance.
   */
  function renderPresetStorageUi() {
    const { getEl } = requireDeps('renderPresetStorageUi');
    const host = getEl('preset-storage-body', { silent: true });
    if (!host) return;
    const Store = window.Vectura && window.Vectura.PresetFolderStore;
    const Bundle = window.Vectura && window.Vectura.PresetBundle;
    const Sync = window.Vectura && window.Vectura.PresetSync;
    const supported = !!(Store && Store.isSupported());
    const ui = this;

    // Pull external folder changes into the browser, refresh open galleries, and
    // toast a summary. Shared by the Refresh button, connect, and reconnect.
    const pullAndRefresh = async (announceClean) => {
      if (!Sync || typeof Sync.pullFromFolder !== 'function') return;
      let res;
      try { res = await Sync.pullFromFolder(); } catch (_) { return; }
      if (res && (res.imported || res.updated)) {
        ui.buildControls?.();
        const bits = [];
        if (res.imported) bits.push(`imported ${res.imported}`);
        if (res.updated) bits.push(`updated ${res.updated}`);
        toast(`Preset folder: ${bits.join(', ')}.`, 'success');
      } else if (announceClean) {
        toast('Preset folder is up to date.', 'info');
      }
    };

    const toast = (msg, variant = 'success') => {
      const T = window.Vectura?.UI?.overlays?.Toast;
      if (T) T.show({ message: msg, variant });
    };

    // Build the static shell: live folder sync is the headline (#preset-storage-folder,
    // filled after the async status query); the bundle Export/Import flow is a
    // demoted secondary row for moving presets between machines.
    host.innerHTML = `
      <div id="preset-storage-folder"></div>
      <div class="preset-storage-secondary">
        <p class="ctrl-hint preset-storage-secondary-hint">Move presets between machines</p>
        <div class="preset-storage-actions">
          <button id="btn-preset-export" type="button" class="hdr-btn">Export bundle…</button>
          <button id="btn-preset-import" type="button" class="hdr-btn">Import…</button>
        </div>
      </div>
    `;

    // ── Export / Import (all browsers) ─────────────────────────────────────────
    const exportBtn = host.querySelector('#btn-preset-export');
    if (exportBtn) exportBtn.onclick = () => {
      if (!Bundle) return;
      const n = Bundle.countAll();
      if (!n) { toast('No custom presets to export yet.', 'info'); return; }
      const stamp = new Date().toISOString().slice(0, 10);
      if (Bundle.download(stamp)) toast(`Exported ${n} preset${n === 1 ? '' : 's'}.`, 'success');
    };
    const importBtn = host.querySelector('#btn-preset-import');
    if (importBtn) importBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file || !Bundle) return;
        const reader = new FileReader();
        reader.onload = () => {
          let bundle;
          try { bundle = JSON.parse(reader.result); } catch (_) { toast('Could not read bundle — invalid JSON.', 'danger'); return; }
          if (!Bundle.isValidBundle(bundle)) { toast('Not a Vectura preset bundle.', 'danger'); return; }
          const Dialog = window.Vectura?.UI?.overlays?.Dialog;
          const doImport = (mode) => {
            const res = Bundle.importBundle(bundle, mode);
            if (res) { toast(`Imported ${res.imported} preset${res.imported === 1 ? '' : 's'} across ${res.systems.length} algorithm${res.systems.length === 1 ? '' : 's'}.`, 'success'); ui.buildControls?.(); }
          };
          if (Dialog) {
            const dlg = Dialog(document.body, {
              title: 'Import presets',
              message: 'Merge these presets into your library, or replace your presets for the included algorithms?',
              confirmLabel: 'Replace', cancelLabel: 'Merge', destructive: true,
              onConfirm: () => { dlg.destroy(); doImport('replace'); },
              onCancel: () => { dlg.destroy(); doImport('merge'); },
            });
            dlg.open();
          } else { doImport('merge'); }
        };
        reader.readAsText(file);
      };
      input.click();
    };

    if (!supported) {
      const folder = host.querySelector('#preset-storage-folder');
      // The File System Access API is gated to secure contexts: it is also
      // absent on file:// pages even in Chrome/Edge. Distinguish the two causes
      // so a Chromium user opening index.html directly isn't told (wrongly) to
      // switch browsers — they just need to serve the app over http.
      const onFile = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
      if (folder) folder.innerHTML = onFile
        ? `<p class="ctrl-hint">Live folder sync is unavailable on file:// pages. Serve the app over http — run <code>python -m http.server</code> and open <code>http://localhost:8000</code> in Chrome or Edge — and a “Sync to a folder…” button appears here. Until then, use Export / Import below.</p>`
        : `<p class="ctrl-hint">Live folder sync needs Chrome or Edge. On this browser, use Export / Import below to move presets between machines.</p>`;
      return;
    }

    // ── Folder controls (Chromium) ─────────────────────────────────────────────
    const renderFolder = (status) => {
      const folder = host.querySelector('#preset-storage-folder');
      if (!folder) return;
      if (status.connected) {
        const paused = status.permission !== 'granted';
        folder.innerHTML = `
          <div class="preset-storage-folder-row">
            <span class="preset-storage-dot ${paused ? 'is-paused' : 'is-live'}"></span>
            <span class="preset-storage-folder-name">${status.name}</span>
            <span class="ctrl-hint">${paused ? 'paused — reconnect to resume syncing' : 'live — syncing to disk'}</span>
          </div>
          <div class="preset-storage-actions">
            ${paused ? '<button id="btn-folder-reconnect" type="button" class="add-btn">Reconnect</button>' : '<button id="btn-folder-refresh" type="button" class="hdr-btn">Refresh from folder</button>'}
            <button id="btn-folder-change" type="button" class="hdr-btn">Change folder…</button>
            <button id="btn-folder-disconnect" type="button" class="hdr-btn">Disconnect</button>
          </div>`;
        const rc = folder.querySelector('#btn-folder-reconnect');
        if (rc) rc.onclick = async () => { if (await Store.reconnect()) { toast('Folder reconnected — syncing resumed.', 'success'); await pullAndRefresh(false); } renderPresetStorageUi.call(ui); };
        const rf = folder.querySelector('#btn-folder-refresh');
        if (rf) rf.onclick = async () => { await pullAndRefresh(true); renderPresetStorageUi.call(ui); };
        folder.querySelector('#btn-folder-change').onclick = async () => { const r = await Store.connect(); if (r) { toast(`Syncing presets to "${r.name}".`, 'success'); await pullAndRefresh(false); } renderPresetStorageUi.call(ui); };
        folder.querySelector('#btn-folder-disconnect').onclick = async () => { await Store.disconnect(); toast('Folder disconnected — presets stay in this browser.', 'info'); renderPresetStorageUi.call(ui); };
      } else {
        folder.innerHTML = `
          <button id="btn-folder-connect" type="button" class="add-btn">Sync to a folder…</button>
          <p class="ctrl-hint">Pick a folder once — every preset you save (and each update) is written there automatically, across sessions.</p>`;
        folder.querySelector('#btn-folder-connect').onclick = async () => {
          const r = await Store.connect();
          if (!r) return;
          toast(`Syncing presets to "${r.name}".`, 'success');
          // 1) Import any presets the folder already holds (re-connect, or a
          //    cloud-synced folder shared with another machine).
          await pullAndRefresh(false);
          // 2) Seed the folder with the user's browser presets it doesn't have
          //    yet, written in the meta-tagged format (filename = slug(name)).
          //    Skip presets already on disk — rewriting them would bump the file
          //    mtime and trigger a spurious "update" on the next pull.
          const slugify = (Sync && Sync.slug) || ((s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
          let onDisk = new Set();
          try { onDisk = new Set(((await Store.readAll()) || []).map((e) => `${e.system}/${e.slug}`)); } catch (_) { /* ignore */ }
          const all = Bundle && Bundle.exportAll();
          let copied = 0;
          if (all) {
            for (const system of Object.keys(all.presets)) {
              for (const p of all.presets[system]) {
                const slug = slugify(p.name) || system;
                if (onDisk.has(`${system}/${slug}`)) continue;
                const doc = Sync && Sync.buildDoc ? Sync.buildDoc(system, p)
                  : { type: 'vectura', name: p.name, layers: [{ type: system, params: p.params || {} }] };
                if (await Store.writePreset(system, slug, doc)) copied += 1;
              }
            }
          }
          if (copied) toast(`Copied ${copied} existing preset${copied === 1 ? '' : 's'} into the folder.`, 'success');
          renderPresetStorageUi.call(ui);
        };
      }
    };

    Store.getStatus().then(renderFolder).catch(() => renderFolder({ connected: false }));
  }

  Modals.DocumentSetup = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl }
     */
    bind(deps) {
      DEPS = deps || {};
    },
    renderPresetStorageUi,
    mount,
    bindHandlers,
    PANEL_HTML,
    PANEL_ID,
    DESKTOP_BREAKPOINT,
    isDesktopViewport,
    isModalOpen() { return modalIsOpen; },
    openSetupModal,
    closeSetupModal,
    toggleSetupModal,
    bindDocumentSetupListeners,
    bindBgColorListeners,
    installOn(proto) {
      // Legacy alias preserved on the prototype.
      proto._bindDocumentSetupHandlers = function() { return bindHandlers.call(this); };
      // Meridian Unit 1.9a: grouped installer for the ~30 Document Setup
      // input handlers previously inlined in bindGlobal(). Called once from
      // the residual bindGlobal() shell.
      proto.bindDocumentSetupListeners = function() {
        return bindDocumentSetupListeners.call(this);
      };
      // Meridian Unit 1.9b: bg color picker wiring (`inp-bg-color` + `bg-color-pill`).
      proto.bindBgColorListeners = function() {
        return bindBgColorListeners.call(this);
      };
      // Phase 2: dynamic Preset Storage section (FSA folder status + export/import).
      proto.renderPresetStorageUi = function() {
        return renderPresetStorageUi.call(this);
      };
    },
  };
})();
