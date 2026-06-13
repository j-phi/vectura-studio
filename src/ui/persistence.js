/**
 * Vectura persistence module (Phase 2 step 5a extraction).
 *
 * Exposes window.Vectura.UI.Persistence — cookie-backed SETTINGS.* load/save
 * helpers plus the deferred scroll-restoration helpers used when the layer
 * list re-renders.
 *
 * Methods lifted verbatim from class UI:
 *   - applyPersistedSettings       (was initSettingsValues — wires every
 *                                   set-* input to its SETTINGS.* default)
 *   - scrollLayerToTop             (scrollTop adjuster keyed off layer id)
 *   - captureLeftPanelScrollPosition (returns a restore() closure)
 *
 * The legacy UI prototype delegates to this module via 1-line pass-throughs.
 *
 * DI bag: { getEl, SETTINGS, getContrastTextColor }.
 *
 * Compile gate at tests/unit/persistence-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`Persistence.${name} invoked before Persistence.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function applyPersistedSettings() {
    const { getEl, SETTINGS, getContrastTextColor } = requireDeps('applyPersistedSettings');
    this.refreshThemeUi();
    const documentUnits = getEl('set-document-units', { silent: true });
    const margin = getEl('set-margin');
    const speedDown = getEl('set-speed-down');
    const speedUp = getEl('set-speed-up');
    const stroke = getEl('set-stroke', { silent: true });
    const precision = getEl('set-precision', { silent: true });
    const plotterOptEnabled = getEl('set-plotter-opt-enabled', { silent: true });
    const plotterOpt = getEl('set-plotter-opt', { silent: true });
    const plotterOptValue = getEl('set-plotter-opt-value', { silent: true });
    const undoSteps = getEl('set-undo');
    const truncate = getEl('set-truncate');
    const cropExports = getEl('set-crop-exports');
    const outsideOpacity = getEl('set-outside-opacity');
    const marginLine = getEl('set-margin-line');
    const marginLineColorPill = getEl('set-margin-line-color-pill');
    const marginLineWeight = getEl('set-margin-line-weight');
    const marginLineWeightSlider = getEl('set-margin-line-weight-slider');
    const marginLineColor = getEl('set-margin-line-color');
    const marginLineDotting = getEl('set-margin-line-dotting');
    const marginLineStyleReset = getEl('set-margin-line-style-reset');
    const showGuides = getEl('set-show-guides');
    const snapGuides = getEl('set-snap-guides');
    const preview3dQuality = getEl('set-preview-3d-quality', { silent: true });
    const showDocumentDimensions = getEl('set-show-document-dimensions', { silent: true });
    const selectionOutline = getEl('set-selection-outline');
    const selectionOutlineColorPill = getEl('set-selection-outline-color-pill');
    const selectionOutlineWidthSlider = getEl('set-selection-outline-width-slider');
    const selectionOutlineWidth = getEl('set-selection-outline-width');
    const selectionOutlineStyleReset = getEl('set-selection-outline-style-reset');
    const cookiePreferences = getEl('set-cookie-preferences');
    const showCrystallographicNames = getEl('set-show-crystallographic-names', { silent: true });
    const devMode = getEl('set-dev-mode', { silent: true });
    const paperWidth = getEl('set-paper-width');
    const paperHeight = getEl('set-paper-height');
    const orientationToggle = getEl('set-orientation');
    const orientationLabel = getEl('orientation-label');
    const customFields = getEl('custom-size-fields');
    const bgColor = getEl('inp-bg-color');
    if (documentUnits) documentUnits.value = this.getDocumentUnits();
    if (speedDown) speedDown.value = SETTINGS.speedDown;
    if (speedUp) speedUp.value = SETTINGS.speedUp;
    if (stroke) stroke.value = SETTINGS.strokeWidth;
    if (precision) precision.value = SETTINGS.precision;
    const plotterOptimizeRaw = Number.isFinite(SETTINGS.plotterOptimize) ? SETTINGS.plotterOptimize : 0;
    const plotterOptimizeEnabled = plotterOptimizeRaw > 0;
    const plotterOptimizeTolerance = Math.max(0.01, Math.min(1, plotterOptimizeRaw || 0.1));
    if (plotterOptEnabled) plotterOptEnabled.checked = plotterOptimizeEnabled;
    if (plotterOpt) {
      plotterOpt.value = plotterOptimizeTolerance;
      plotterOpt.disabled = !plotterOptimizeEnabled;
    }
    if (plotterOptValue) {
      plotterOptValue.value = plotterOptimizeTolerance.toFixed(2);
      plotterOptValue.disabled = !plotterOptimizeEnabled;
    }
    if (undoSteps) undoSteps.value = SETTINGS.undoSteps;
    if (truncate) truncate.checked = SETTINGS.truncate !== false;
    if (cropExports) cropExports.checked = SETTINGS.cropExports !== false;
    if (outsideOpacity) outsideOpacity.value = SETTINGS.outsideOpacity ?? 0.5;
    if (marginLine) marginLine.checked = Boolean(SETTINGS.marginLineVisible);
    if (marginLineColorPill) {
      const color = SETTINGS.marginLineColor ?? '#52525b';
      marginLineColorPill.textContent = color.toUpperCase();
      marginLineColorPill.style.background = color;
      marginLineColorPill.style.color = getContrastTextColor(color);
    }
    if (marginLineColor) marginLineColor.value = SETTINGS.marginLineColor ?? '#52525b';
    if (marginLineDotting) marginLineDotting.value = SETTINGS.marginLineDotting ?? 0;
    if (marginLineStyleReset) marginLineStyleReset.disabled = false;
    if (showGuides) showGuides.checked = SETTINGS.showGuides !== false;
    if (snapGuides) snapGuides.checked = SETTINGS.snapGuides !== false;
    if (preview3dQuality) preview3dQuality.value = SETTINGS.preview3dQuality || 'balanced';
    if (showDocumentDimensions) showDocumentDimensions.checked = SETTINGS.showDocumentDimensions === true;
    const gridType = SETTINGS.gridType || 'none';
    const showGrid = gridType !== 'none';
    const viewGridCheckmark = getEl('view-grid-checkmark');
    if (viewGridCheckmark) viewGridCheckmark.style.visibility = showGrid ? 'visible' : 'hidden';

    // Grid type seg-ctrl active state
    const gridTypeCtrl = getEl('grid-type-ctrl');
    if (gridTypeCtrl) {
      gridTypeCtrl.querySelectorAll?.('[data-grid-type]')?.forEach(btn => {
        const isActive = btn.dataset.gridType === gridType;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', String(isActive));
      });
    }

    // Section visibility
    const gridStyleSect = getEl('grid-style-sect');
    if (gridStyleSect) gridStyleSect.style.display = showGrid ? '' : 'none';
    const gridMajorSect = getEl('grid-major-sect');
    if (gridMajorSect) gridMajorSect.style.display = showGrid ? '' : 'none';
    const gridMinorSect = getEl('grid-minor-sect');
    if (gridMinorSect) gridMinorSect.style.display = gridType === 'major-minor' ? '' : 'none';
    const snapSensRow = getEl('grid-snap-sensitivity-row');
    if (snapSensRow) snapSensRow.style.display = SETTINGS.gridSnapEnabled ? '' : 'none';

    // Major grid controls
    const gridOpacitySlider = getEl('set-grid-opacity-slider');
    if (gridOpacitySlider) gridOpacitySlider.value = SETTINGS.gridOpacity ?? 0.2;
    const gridOpacity = getEl('set-grid-opacity');
    if (gridOpacity) gridOpacity.value = SETTINGS.gridOpacity ?? 0.2;
    const gridStyle = getEl('set-grid-style');
    if (gridStyle) gridStyle.value = SETTINGS.gridStyle ?? 'cartesian';
    const gridColor = getEl('set-grid-color');
    if (gridColor) gridColor.value = SETTINGS.gridColor ?? '#ffffff';
    const gridColorPill = getEl('set-grid-color-pill');
    if (gridColorPill) {
      const color = SETTINGS.gridColor ?? '#ffffff';
      gridColorPill.textContent = color.toUpperCase();
      gridColorPill.style.background = color;
      gridColorPill.style.color = getContrastTextColor(color);
    }
    const gridSizeSlider = getEl('set-grid-size-slider');
    if (gridSizeSlider) gridSizeSlider.value = SETTINGS.gridSize ?? 10;
    const gridSize = getEl('set-grid-size');
    if (gridSize) gridSize.value = SETTINGS.gridSize ?? 10;

    // Minor grid controls
    const gridMinorOpacitySlider = getEl('set-grid-minor-opacity-slider');
    if (gridMinorOpacitySlider) gridMinorOpacitySlider.value = SETTINGS.gridMinorOpacity ?? 0.08;
    const gridMinorOpacity = getEl('set-grid-minor-opacity');
    if (gridMinorOpacity) gridMinorOpacity.value = SETTINGS.gridMinorOpacity ?? 0.08;
    const gridMinorColor = getEl('set-grid-minor-color');
    if (gridMinorColor) gridMinorColor.value = SETTINGS.gridMinorColor ?? '#ffffff';
    const gridMinorColorPill = getEl('set-grid-minor-color-pill');
    if (gridMinorColorPill) {
      const color = SETTINGS.gridMinorColor ?? '#ffffff';
      gridMinorColorPill.textContent = color.toUpperCase();
      gridMinorColorPill.style.background = color;
      gridMinorColorPill.style.color = getContrastTextColor(color);
    }
    const gridMinorSizeSlider = getEl('set-grid-minor-size-slider');
    if (gridMinorSizeSlider) gridMinorSizeSlider.value = SETTINGS.gridMinorSize ?? 5;
    const gridMinorSize = getEl('set-grid-minor-size');
    if (gridMinorSize) gridMinorSize.value = SETTINGS.gridMinorSize ?? 5;

    // Snap controls
    const gridSnapEnabled = getEl('set-grid-snap-enabled');
    if (gridSnapEnabled) gridSnapEnabled.checked = SETTINGS.gridSnapEnabled === true;
    const gridSnapToggle = gridSnapEnabled?.closest('[role="switch"]');
    if (gridSnapToggle) gridSnapToggle.setAttribute('aria-checked', String(!!SETTINGS.gridSnapEnabled));
    const gridSnapSensitivity = getEl('set-grid-snap-sensitivity');
    if (gridSnapSensitivity) gridSnapSensitivity.value = SETTINGS.gridSnapSensitivity ?? 50;
    const gridSnapSensitivityVal = getEl('set-grid-snap-sensitivity-val');
    if (gridSnapSensitivityVal) gridSnapSensitivityVal.value = SETTINGS.gridSnapSensitivity ?? 50;

    if (selectionOutline) selectionOutline.checked = SETTINGS.selectionOutline !== false;
    if (selectionOutlineColorPill) {
      const color = SETTINGS.selectionOutlineColor || '#ef4444';
      selectionOutlineColorPill.textContent = color.toUpperCase();
      selectionOutlineColorPill.style.background = color;
      selectionOutlineColorPill.style.color = getContrastTextColor(color);
    }
    if (selectionOutlineStyleReset) selectionOutlineStyleReset.disabled = false;
    if (cookiePreferences) cookiePreferences.checked = SETTINGS.cookiePreferencesEnabled === true;
    if (showCrystallographicNames) showCrystallographicNames.checked = SETTINGS.showCrystallographicNames === true;
    if (devMode) devMode.checked = SETTINGS.devMode === true;
    const showTourEl = getEl('set-show-tour', { silent: true });
    if (showTourEl) showTourEl.checked = SETTINGS.showTourOnFirstLaunch === true;
    if (bgColor) bgColor.value = SETTINGS.bgColor;
    const bgColorPill = getEl('bg-color-pill', { silent: true });
    if (bgColorPill) {
      const color = SETTINGS.bgColor || '#ffffff';
      bgColorPill.textContent = color.toUpperCase();
      bgColorPill.style.background = color;
      bgColorPill.style.color = getContrastTextColor(color);
    }
    const orientationIsLandscape = (SETTINGS.paperOrientation || 'landscape') === 'landscape';
    if (orientationToggle) orientationToggle.checked = orientationIsLandscape;
    if (orientationLabel) {
      orientationLabel.textContent = orientationIsLandscape ? 'Landscape' : 'Portrait';
    }
    const orientPortraitBtn = getEl('orientation-portrait', { silent: true });
    const orientLandscapeBtn = getEl('orientation-landscape', { silent: true });
    if (orientPortraitBtn) {
      orientPortraitBtn.classList.toggle('active', !orientationIsLandscape);
      orientPortraitBtn.setAttribute('aria-checked', String(!orientationIsLandscape));
    }
    if (orientLandscapeBtn) {
      orientLandscapeBtn.classList.toggle('active', orientationIsLandscape);
      orientLandscapeBtn.setAttribute('aria-checked', String(orientationIsLandscape));
    }
    if (customFields) {
      customFields.classList.toggle('hidden', SETTINGS.paperSize !== 'custom');
    }
    this.refreshDocumentUnitsUi();
  }

  function scrollLayerToTop(layerId) {
    const { getEl } = requireDeps('scrollLayerToTop');
    const container = getEl('layer-list');
    if (!container || !layerId) return;
    const el = container.querySelector(`[data-layer-id="${layerId}"]`);
    if (!el) return;
    container.scrollTop = Math.max(0, el.offsetTop);
  }

  function captureLeftPanelScrollPosition() {
    requireDeps('captureLeftPanelScrollPosition');
    const pane = document.getElementById('left-panel-content');
    if (!pane) return () => {};
    const prevScrollTop = pane.scrollTop;
    return () => {
      window.requestAnimationFrame(() => {
        const maxScroll = Math.max(0, pane.scrollHeight - pane.clientHeight);
        pane.scrollTop = Math.min(prevScrollTop, maxScroll);
      });
    };
  }

  UI.Persistence = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl, SETTINGS, getContrastTextColor }
     */
    bind(deps) {
      DEPS = deps;
    },
    applyPersistedSettings,
    scrollLayerToTop,
    captureLeftPanelScrollPosition,
    installOn(proto) {
      // Legacy name `initSettingsValues` retained as an alias on the prototype
      // — call sites still use this.initSettingsValues().
      proto.initSettingsValues = function() { return applyPersistedSettings.call(this); };
      proto.scrollLayerToTop = function(layerId) { return scrollLayerToTop.call(this, layerId); };
      proto.captureLeftPanelScrollPosition = function() { return captureLeftPanelScrollPosition.call(this); };
    },
  };
})();
