/**
 * Vectura info-modals (Phase 3 step 3 — second modal).
 *
 * Exposes window.Vectura.UI.Modals.InfoModals — a coherent micro-system of
 * small modal helpers used throughout the UI:
 *
 *   - showInfo(key)               - opens an info modal keyed off the INFO
 *                                    dictionary, optionally rendering a
 *                                    preview-pair illustration.
 *   - showDuplicateNameError(name) - "Name Unavailable" modal for layer-rename
 *                                    collisions.
 *   - showValueError(value)       - "Invalid Value" modal for out-of-range
 *                                    numeric input.
 *   - attachInfoButton(labelEl, key) - appends an `<button class="info-btn">`
 *                                    to `labelEl` if not already present.
 *   - attachStaticInfoButtons()   - decorates ~22 known input ids with their
 *                                    info-button (called from initLeftPanelSections
 *                                    and the panel renderers).
 *   - bindInfoButtons()           - installs a single document-level click
 *                                    listener that routes `.info-btn` clicks
 *                                    into showInfo (with a special-case for
 *                                    `global.algorithm` which toggles the
 *                                    About pane via this.setAboutVisible).
 *
 * The legacy UI prototype delegates to this module via 1-line pass-throughs.
 *
 * DI bag: { INFO, buildPreviewPair, escapeHtml, getEl, SETTINGS }
 *   - INFO + buildPreviewPair are IIFE-locals in _ui-legacy.js.
 *   - showInfo passes `this` (the UI instance) into buildPreviewPair so its
 *     downstream chain (resolvePreviewConfig → buildVariantsFromDef →
 *     renderPreviewSvg, all IIFE-locals) keeps working unchanged.
 *
 * The module still composes the legacy `this.openModal` primitive (which
 * lives in _ui-legacy.js). Future Phase 3 work that promotes the modal-
 * overlay primitive at src/ui/overlays/modal.js will route those calls there.
 *
 * Compile gate at tests/unit/modals/info-modals-compile.test.js.
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
        `InfoModals.${name} invoked before InfoModals.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  function showDuplicateNameError(name) {
    const { escapeHtml } = requireDeps('showDuplicateNameError');
    this.openModal({
      title: 'Name Unavailable',
      body: `<p class="modal-text">"${escapeHtml(name)}" is already in use. Layer names must be unique.</p>`,
    });
  }

  function showValueError(value) {
    const { escapeHtml } = requireDeps('showValueError');
    this.openModal({
      title: 'Invalid Value',
      body: `<p class="modal-text">"${escapeHtml(value)}" is outside the allowed range or format.</p>`,
    });
  }

  function showInfo(key) {
    const { INFO, buildPreviewPair } = requireDeps('showInfo');
    const info = INFO[key];
    if (!info) return;
    const illustration = info.hidePreview ? '' : buildPreviewPair(key, this);
    const bodyContent = info.body
      ? typeof info.body === 'function'
        ? info.body(this)
        : info.body
      : `<p class="modal-text">${info.description}</p>`;
    const body = `
      ${bodyContent}
      ${illustration}
    `;
    this.openModal({ title: info.title, body });
  }

  function attachInfoButton(labelEl, key) {
    requireDeps('attachInfoButton');
    if (!labelEl || labelEl.querySelector('.info-btn')) return;
    const doc = labelEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'info-btn';
    btn.dataset.info = key;
    btn.setAttribute('aria-label', `Info about ${labelEl.textContent}`);
    btn.textContent = 'i';
    labelEl.appendChild(btn);
  }

  function attachStaticInfoButtons() {
    const { getEl } = requireDeps('attachStaticInfoButtons');
    const entries = [
      { inputId: 'generator-module', infoKey: 'global.algorithm' },
      { inputId: 'inp-seed', infoKey: 'global.seed' },
      { inputId: 'inp-pos-x', infoKey: 'global.posX' },
      { inputId: 'inp-pos-y', infoKey: 'global.posY' },
      { inputId: 'inp-scale-x', infoKey: 'global.scaleX' },
      { inputId: 'inp-scale-y', infoKey: 'global.scaleY' },
      { inputId: 'inp-rotation', infoKey: 'global.rotation' },
      { inputId: 'machine-profile', infoKey: 'global.paperSize' },
      { inputId: 'set-margin', infoKey: 'global.margin' },
      { inputId: 'set-truncate', infoKey: 'global.truncate' },
      { inputId: 'set-crop-exports', infoKey: 'global.cropExports' },
      { inputId: 'set-outside-opacity', infoKey: 'global.outsideOpacity' },
      { inputId: 'set-margin-line', infoKey: 'global.marginLineVisible' },
      { inputId: 'set-margin-line-weight', infoKey: 'global.marginLineWeight' },
      { inputId: 'set-margin-line-color-pill', infoKey: 'global.marginLineColor' },
      { inputId: 'set-margin-line-dotting', infoKey: 'global.marginLineDotting' },
      { inputId: 'set-selection-outline', infoKey: 'global.selectionOutline' },
      { inputId: 'set-selection-outline-color-pill', infoKey: 'global.selectionOutlineColor' },
      { inputId: 'set-selection-outline-width', infoKey: 'global.selectionOutlineWidth' },
      { inputId: 'set-cookie-preferences', infoKey: 'global.cookiePreferences' },
      { inputId: 'set-speed-down', infoKey: 'global.speedDown' },
      { inputId: 'set-speed-up', infoKey: 'global.speedUp' },
    ];

    entries.forEach(({ inputId, infoKey }) => {
      const input = getEl(inputId);
      if (!input) return;
      const label =
        input.parentElement?.querySelector('label') ||
        input.parentElement?.parentElement?.querySelector('label') ||
        input.closest('.control-group')?.querySelector('.control-label');
      attachInfoButton.call(this, label, infoKey);
    });
  }

  function bindInfoButtons() {
    const { SETTINGS, INFO } = requireDeps('bindInfoButtons');
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.info-btn');
      if (!btn) return;
      const key = btn.dataset.info;
      if (key === 'global.algorithm') {
        e.preventDefault();
        this.setAboutVisible(!(SETTINGS.aboutVisible !== false));
        return;
      }
      this.showInfo(key);
    });

    // Phase 3 closure: hover-tooltip on .info-btn elements via UI.overlays.Tooltip.
    // The click → modal behavior above is unchanged; the tooltip layer adds a
    // short teaser on hover with a "Read more" hint pointing at the modal.
    const Tooltip = window.Vectura?.UI?.overlays?.Tooltip;
    if (Tooltip) {
      let _sharedTip = null;
      const ensureTip = () => {
        if (_sharedTip) return _sharedTip;
        _sharedTip = Tooltip(document.body, { placement: 'top', maxWidth: 260 });
        return _sharedTip;
      };
      document.addEventListener('pointerenter', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('.info-btn');
        if (!btn) return;
        const key = btn.dataset.info;
        const info = INFO && INFO[key];
        if (!info) return;
        const teaser = info.description ? `${info.title}: ${info.description}` : info.title;
        const text = teaser.length > 140 ? `${teaser.slice(0, 137).trimEnd()}…  (Click for details)` : teaser;
        ensureTip().show(btn, { text });
      }, true);
      document.addEventListener('pointerleave', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('.info-btn');
        if (!btn) return;
        if (_sharedTip) _sharedTip.hide();
      }, true);
      // Also hide on click — the modal takes over.
      document.addEventListener('click', (e) => {
        if (!_sharedTip) return;
        const btn = e.target && e.target.closest && e.target.closest('.info-btn');
        if (btn) _sharedTip.hide({ delay: 0 });
      }, true);
    }
  }

  Modals.InfoModals = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { INFO, buildPreviewPair, escapeHtml, getEl, SETTINGS }
     */
    bind(deps) {
      DEPS = deps || {};
    },
    showInfo,
    showDuplicateNameError,
    showValueError,
    attachInfoButton,
    attachStaticInfoButtons,
    bindInfoButtons,
    installOn(proto) {
      proto.showInfo = function(key) { return showInfo.call(this, key); };
      proto.showDuplicateNameError = function(name) { return showDuplicateNameError.call(this, name); };
      proto.showValueError = function(value) { return showValueError.call(this, value); };
      proto.attachInfoButton = function(labelEl, key) { return attachInfoButton.call(this, labelEl, key); };
      proto.attachStaticInfoButtons = function() { return attachStaticInfoButtons.call(this); };
      proto.bindInfoButtons = function() { return bindInfoButtons.call(this); };
    },
  };
})();
