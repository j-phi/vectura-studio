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

  // Markup rebuilt against the Meridian skin component vocabulary
  // (`.sect`, `.sect-hdr`, `.sect-body`, `.ctrl-sel`, `.num-step`, `.seg-ctrl`,
  // `.sw-toggle`, `.value-chip`, `.ctrl-slider`) so the drawer paints in the
  // same visual register as every other Vectura panel. Every #id from the
  // legacy markup is preserved verbatim so the ~30 inline `set-*` handlers
  // still living in `_ui-legacy.js`'s bindGlobal() keep wiring without
  // modification. `bindHandlers()` adds the section collapse + num-step ±
  // wiring needed by the new primitives.
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
      // #set-orientation checkbox and fires its change event so the legacy
      // bindGlobal handler in _ui-legacy.js still runs unchanged.
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
   * Wire all ~30 Document Setup input handlers (Meridian Unit 1.9a).
   *
   * Previously these listeners lived inlined in `_ui-legacy.js`'s
   * `bindGlobal()`. They are now grouped here so the document-setup panel
   * owns every wire from open-trigger through last input. `this` is the UI
   * instance — handlers reach for `this.app`, `this.parseDocumentNumber`,
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
    DESKTOP_BREAKPOINT,
    isDesktopViewport,
    isModalOpen() { return modalIsOpen; },
    openSetupModal,
    closeSetupModal,
    toggleSetupModal,
    bindDocumentSetupListeners,
    installOn(proto) {
      // Legacy alias preserved on the prototype.
      proto._bindDocumentSetupHandlers = function() { return bindHandlers.call(this); };
      // Meridian Unit 1.9a: grouped installer for the ~30 Document Setup
      // input handlers previously inlined in bindGlobal(). Called once from
      // the residual bindGlobal() shell.
      proto.bindDocumentSetupListeners = function() {
        return bindDocumentSetupListeners.call(this);
      };
    },
  };
})();
