/**
 * Application orchestrator.
 */
(() => {
  const { VectorEngine, Renderer, UI, SETTINGS, THEMES = {}, UnitUtils = {} } = window.Vectura || {};
  const clone = window.Vectura.Utils.clone;
  const PREFERENCE_COOKIE = 'vectura_prefs';
  const PREFERENCE_STORAGE_KEY = 'vectura_prefs';
  const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
  const DEFAULT_THEME = 'dark';
  const normalizeDocumentUnits = UnitUtils.normalizeDocumentUnits || ((value) => (`${value || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
  const normalizeThemeName = (theme) => {
    const key = `${theme || ''}`.trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(THEMES, key) ? key : DEFAULT_THEME;
  };
  const getThemeConfig = (theme) => THEMES[normalizeThemeName(theme)] || THEMES[DEFAULT_THEME] || null;
  // Two theme families ship: 'meridian' (Modern) and 'classic'. Each owns the same
  // three brightness slots; the family toggle in Document Setup hops between
  // counterparts at the matching slot.
  const THEME_FAMILIES = ['meridian', 'classic'];
  const BRIGHTNESS_ORDER = ['dark', 'lark', 'light'];
  const normalizeThemeFamily = (family) => {
    const key = `${family || ''}`.trim().toLowerCase();
    return THEME_FAMILIES.includes(key) ? key : 'meridian';
  };
  const getThemeFamily = (themeId) => {
    const t = THEMES[normalizeThemeName(themeId)];
    return normalizeThemeFamily(t && t.family);
  };
  const getThemeBrightness = (themeId) => {
    const id = normalizeThemeName(themeId);
    for (let i = 0; i < BRIGHTNESS_ORDER.length; i += 1) {
      const slot = BRIGHTNESS_ORDER[i];
      if (id === slot || id === `classic-${slot}`) return slot;
    }
    return BRIGHTNESS_ORDER[0];
  };
  const getThemeIdForFamilySlot = (family, slot) => {
    const fam = normalizeThemeFamily(family);
    const candidate = fam === 'classic' ? `classic-${slot}` : slot;
    return Object.prototype.hasOwnProperty.call(THEMES, candidate) ? candidate : null;
  };
  // Union of every cssVar key any theme pushes inline. Used by applyTheme to clear
  // stale inline values left by a previously-active theme: themes that set a smaller
  // alias set (e.g. dark) would otherwise inherit the prior theme's inline overrides
  // (e.g. lark's --color-control: #ffffff) since inline styles beat :root rules.
  const ALL_THEME_CSS_VAR_KEYS = (() => {
    const keys = new Set();
    Object.values(THEMES).forEach((cfg) => {
      if (cfg && cfg.cssVars && typeof cfg.cssVars === 'object') {
        Object.keys(cfg.cssVars).forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  })();

  class App {
    constructor() {
      // Suppress CSS transitions during boot so pane-width and color vars can
      // be set from cookie/manifest without triggering the .pane width animation.
      // skinManager.activate() resets this with its own timer (60–320 ms);
      // the setTimeout below is a fallback in case activate() is a no-op.
      const _root = document.documentElement;
      _root.dataset.skinSwapping = 'true';
      window.setTimeout(() => {
        if (_root.dataset.skinSwapping === 'true') delete _root.dataset.skinSwapping;
      }, 400);
      this.preferenceCookieName = PREFERENCE_COOKIE;
      this.preferencePersistTimer = null;
      this.lastPreferenceHash = '';
      // Snapshot pristine SETTINGS before applyPreferencesFromCookie mutates them,
      // so clearSavedPreferences() can restore factory defaults later.
      this.defaultSettingsSnapshot = clone(SETTINGS);
      const hadCookiePreferences = this.applyPreferencesFromCookie();
      // Cold boot (no cookie): sync pen-1 to the active theme's pen1Color so a
      // fresh load on light/lark doesn't leave pen-1 white on the white artboard.
      // Document bg is also synced so the paper color matches the theme's intent.
      const coldBootSync = !hadCookiePreferences;
      this.applyTheme(SETTINGS.uiTheme, {
        persist: false,
        syncPen1: coldBootSync,
        syncDocumentBg: coldBootSync,
        syncGridColor: coldBootSync,
        refreshUi: false,
        render: false,
      });
      this.engine = new VectorEngine();
      this.renderer = new Renderer('main-canvas', this.engine);
      this.renderer.app = this;
      this.ui = new UI(this);
      this.applyTheme(SETTINGS.uiTheme, {
        persist: false,
        syncPen1: false,
        syncDocumentBg: false,
        refreshUi: true,
        render: false,
      });
      if (this.engine.activeLayerId) {
        this.renderer.setSelection([this.engine.activeLayerId], this.engine.activeLayerId);
      } else {
        this.renderer.setSelection([], null);
      }
      this.renderer.onSelectLayer = (layer) => {
        this.engine.activeLayerId = layer ? layer.id : null;
        this.ui.renderLayers();
        this.ui.buildControls();
        this.ui.updateFormula();
      };
      this.renderer.onPatternFill = (payload) => this.ui._applyPatternFillFromCanvas(payload);
      this.renderer.onCommitTransform = () => { this.pushHistory(); this.ui.buildControls(); };
      this.renderer.onDuplicateLayer = () => this.pushHistory();
      this.renderer.onComputeDisplayGeometry = () => this.computeDisplayGeometry();
      this.renderer.isLayerLocked = (layerId) => {
        const lockedIds = this.ui.layerLockedIds;
        if (lockedIds.has(layerId)) return true;
        let l = this.engine.getLayerById?.(layerId);
        while (l?.parentId) {
          const parent = this.engine.getLayerById?.(l.parentId);
          if (lockedIds.has(l.parentId) && !parent?.mask?.enabled) return true;
          l = parent;
        }
        return false;
      };
      this.history = [];
      this.redoStack = [];
      this.maxHistory = SETTINGS.undoSteps ?? 20;
      this.isRestoring = false;
      this.pushHistory();

      this.render();
      this.persistPreferencesDebounced(0);
      // Re-render one rAF after each skin swap so canvas picks up CSS tokens
      // that weren't yet in getComputedStyle when the synchronous render ran.
      document.addEventListener('vectura:skin-change', () => {
        if (this.renderer && this.renderer.ready) this.render();
      });
      // Phase 2: a folder-backed preset store loses its permission across reloads
      // ("Reconnect Thaw"). Load the saved handle and, if it's now paused, nudge
      // the user with a one-click reconnect toast (the click is the required
      // user gesture). Fully guarded + non-blocking; a no-op without FSA.
      this._maybePromptPresetFolderReconnect();
      // Phase 3: re-pull the connected folder whenever the tab regains focus, so
      // edits made on another machine (cloud-synced folder) or directly on disk
      // appear without a manual refresh. Guarded + idempotent + non-blocking.
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') this._pullPresetFolderAndRefresh();
        });
      }
    }

    _maybePromptPresetFolderReconnect() {
      const Store = (typeof window !== 'undefined' && window.Vectura) ? window.Vectura.PresetFolderStore : null;
      if (!Store || !Store.isSupported()) return;
      Promise.resolve()
        .then(() => Store.init())
        .then(() => Store.getStatus())
        .then((status) => {
          if (!status.connected) return;
          // Already granted → pull any external changes now (launch sync).
          if (status.permission === 'granted') { this._pullPresetFolderAndRefresh(); return; }
          const Toast = window.Vectura?.UI?.overlays?.Toast;
          if (!Toast) return;
          Toast.show({
            message: `Preset folder "${status.name}" is paused — click to reconnect.`,
            variant: 'warning',
            duration: 0,
            onClick: async () => {
              const ok = await Store.reconnect();
              Toast.show({ message: ok ? 'Folder reconnected.' : 'Reconnect cancelled.', variant: ok ? 'success' : 'info' });
              if (ok) this._pullPresetFolderAndRefresh();
            },
          });
        })
        .catch(() => { /* folder store unavailable — ignore */ });
    }

    // Pull external preset-folder changes into localStorage and refresh open
    // galleries. Guarded (granted permission only), single-flight, and silent on
    // no-op; toasts only when something actually changed.
    async _pullPresetFolderAndRefresh() {
      const V = (typeof window !== 'undefined') ? window.Vectura : null;
      const Store = V && V.PresetFolderStore;
      const Sync = V && V.PresetSync;
      if (!Store || !Sync || !Store.isSupported() || !Store.hasHandle()) return;
      if (this._presetPullInFlight) return;
      this._presetPullInFlight = true;
      try {
        const status = await Store.getStatus();
        if (!status.connected || status.permission !== 'granted') return;
        const res = await Sync.pullFromFolder();
        if (res && (res.imported || res.updated)) {
          this.ui?.buildControls?.();
          const Toast = V.UI?.overlays?.Toast;
          if (Toast) {
            const bits = [];
            if (res.imported) bits.push(`imported ${res.imported}`);
            if (res.updated) bits.push(`updated ${res.updated}`);
            Toast.show({ message: `Preset folder: ${bits.join(', ')}.`, variant: 'success' });
          }
        }
      } catch (_) { /* folder unavailable / permission revoked — ignore */ }
      finally { this._presetPullInFlight = false; }
    }

    readCookie(name) {
      if (!name) return null;
      const source = typeof document !== 'undefined' ? document.cookie || '' : '';
      if (!source) return null;
      const parts = source.split(';');
      for (let i = 0; i < parts.length; i++) {
        const entry = parts[i].trim();
        if (!entry) continue;
        const eq = entry.indexOf('=');
        if (eq <= 0) continue;
        const key = entry.slice(0, eq).trim();
        if (key !== name) continue;
        return entry.slice(eq + 1);
      }
      return null;
    }

    writeCookie(name, value, maxAge = PREFERENCE_COOKIE_MAX_AGE) {
      if (typeof document === 'undefined' || !name) return;
      const safe = value == null ? '' : value;
      document.cookie = `${name}=${safe}; Max-Age=${Math.max(0, Math.floor(maxAge || 0))}; Path=/; SameSite=Lax`;
    }

    readLocalStorage(key) {
      if (typeof window === 'undefined' || !key) return null;
      try {
        return window.localStorage?.getItem(key) ?? null;
      } catch (_) {
        return null;
      }
    }

    writeLocalStorage(key, value) {
      if (typeof window === 'undefined' || !key) return;
      try {
        if (value == null) window.localStorage?.removeItem(key);
        else window.localStorage?.setItem(key, value);
      } catch (_) { /* quota or disabled */ }
    }

    clearPreferenceCookie() {
      if (this.preferencePersistTimer) {
        window.clearTimeout(this.preferencePersistTimer);
        this.preferencePersistTimer = null;
      }
      this.writeCookie(this.preferenceCookieName, '', 0);
      this.writeLocalStorage(PREFERENCE_STORAGE_KEY, null);
      this.lastPreferenceHash = '';
    }

    clearSavedPreferences() {
      // Restore every SETTINGS key to its pristine default. Mutate in place so
      // any module holding a reference to window.Vectura.SETTINGS sees the reset.
      const defaults = this.defaultSettingsSnapshot ? clone(this.defaultSettingsSnapshot) : {};
      Object.keys(SETTINGS).forEach((key) => { delete SETTINGS[key]; });
      Object.assign(SETTINGS, defaults);
      SETTINGS.cookiePreferencesEnabled = false;
      this.clearPreferenceCookie();

      // Re-apply layout-affecting settings whose UI state lives outside SETTINGS
      // (CSS vars + class toggles). Without these the panes/toolbar would keep
      // their last-modified positions even though SETTINGS now says default.
      const root = typeof document !== 'undefined' ? document.documentElement : null;
      if (root) {
        if (typeof SETTINGS.paneLeftWidth === 'number') {
          root.style.setProperty('--pane-left-width', `${SETTINGS.paneLeftWidth}px`);
        }
        if (typeof SETTINGS.paneRightWidth === 'number') {
          root.style.setProperty('--pane-right-width', `${SETTINGS.paneRightWidth}px`);
        }
        if (typeof SETTINGS.bottomPaneHeight === 'number') {
          root.style.setProperty('--bottom-pane-height', `${SETTINGS.bottomPaneHeight}px`);
        }
      }
      if (typeof document !== 'undefined') {
        this.ui?.resetPanes?.();
      }
      // Reset toolbar back to its default float position. resetToolbarPosition
      // is wired by toolbar.js when present; falls back to no-op pre-init.
      this.ui?.resetToolbarPosition?.();

      this.applyTheme(SETTINGS.uiTheme, {
        persist: false,
        syncPen1: true,
        syncDocumentBg: true,
        syncGridColor: true,
        refreshUi: true,
        render: false,
      });
      this.maxHistory = SETTINGS.undoSteps ?? 20;
      if (this.renderer) this.render();
    }

    getPreferenceSnapshot() {
      return {
        uiTheme: SETTINGS.uiTheme || DEFAULT_THEME,
        cookiePreferencesEnabled: SETTINGS.cookiePreferencesEnabled === true,
        showCrystallographicNames: SETTINGS.showCrystallographicNames === true,
        devMode: SETTINGS.devMode === true,
        margin: SETTINGS.margin,
        speedDown: SETTINGS.speedDown,
        speedUp: SETTINGS.speedUp,
        precision: SETTINGS.precision,
        strokeWidth: SETTINGS.strokeWidth,
        strokeWidthOverride: SETTINGS.strokeWidthOverride === true,
        bgColor: SETTINGS.bgColor,
        truncate: SETTINGS.truncate,
        cropExports: SETTINGS.cropExports,
        removeHiddenGeometry: SETTINGS.removeHiddenGeometry,
        outsideOpacity: SETTINGS.outsideOpacity,
        marginLineVisible: SETTINGS.marginLineVisible,
        marginLineWeight: SETTINGS.marginLineWeight,
        marginLineColor: SETTINGS.marginLineColor,
        marginLineDotting: SETTINGS.marginLineDotting,
        showGuides: SETTINGS.showGuides,
        snapGuides: SETTINGS.snapGuides,
        selectionOutline: SETTINGS.selectionOutline,
        selectionOutlineColor: SETTINGS.selectionOutlineColor,
        selectionOutlineWidth: SETTINGS.selectionOutlineWidth,
        selectionOutlineHide3d: SETTINGS.selectionOutlineHide3d !== false,
        gridType: SETTINGS.gridType,
        gridOpacity: SETTINGS.gridOpacity,
        gridStyle: SETTINGS.gridStyle,
        gridColor: SETTINGS.gridColor,
        gridSize: SETTINGS.gridSize,
        gridMinorOpacity: SETTINGS.gridMinorOpacity,
        gridMinorColor: SETTINGS.gridMinorColor,
        gridMinorSize: SETTINGS.gridMinorSize,
        gridSnapEnabled: SETTINGS.gridSnapEnabled === true,
        gridSnapSensitivity: SETTINGS.gridSnapSensitivity,
        undoSteps: SETTINGS.undoSteps,
        uiSections: SETTINGS.uiSections ? clone(SETTINGS.uiSections) : null,
        aboutVisible: SETTINGS.aboutVisible !== false,
        touchModifiers: SETTINGS.touchModifiers ? clone(SETTINGS.touchModifiers) : null,
        documentUnits: normalizeDocumentUnits(SETTINGS.documentUnits),
        paperSize: SETTINGS.paperSize,
        paperWidth: SETTINGS.paperWidth,
        paperHeight: SETTINGS.paperHeight,
        paperOrientation: SETTINGS.paperOrientation,
        showDocumentDimensions: SETTINGS.showDocumentDimensions === true,
        preview3dQuality: SETTINGS.preview3dQuality,
        optimizationScope: SETTINGS.optimizationScope,
        optimizationPreview: SETTINGS.optimizationPreview,
        optimizationExport: SETTINGS.optimizationExport,
        optimizationOverlayColor: SETTINGS.optimizationOverlayColor,
        optimizationOverlayWidth: SETTINGS.optimizationOverlayWidth,
        plotterOptimize: SETTINGS.plotterOptimize,
        paletteId: SETTINGS.paletteId,
        layerBarPaletteId: SETTINGS.layerBarPaletteId,
        autoColorization: SETTINGS.autoColorization ? clone(SETTINGS.autoColorization) : null,
        autoColorizationCollapsed: SETTINGS.autoColorizationCollapsed,
        pensCollapsed: SETTINGS.pensCollapsed,
        // activeTool intentionally NOT persisted — a page refresh should
        // always boot into the Select tool regardless of last-used tool.
        scissorMode: SETTINGS.scissorMode,
        penMode: SETTINGS.penMode,
        pens: Array.isArray(SETTINGS.pens) ? clone(SETTINGS.pens) : [],
        paneLeftWidth: SETTINGS.paneLeftWidth,
        paneRightWidth: SETTINGS.paneRightWidth,
        showTourOnFirstLaunch: SETTINGS.showTourOnFirstLaunch === true,
        tourSeen: SETTINGS.tourSeen === true,
        toolbarDock: SETTINGS.toolbarDock ?? null,
        toolbarX: SETTINGS.toolbarX ?? null,
        toolbarY: SETTINGS.toolbarY ?? null,
        toolbarLocked: SETTINGS.toolbarLocked === true,
        toolbarHorizontal: SETTINGS.toolbarHorizontal === true,
        leftPaneCollapsed: SETTINGS.leftPaneCollapsed === true,
        rightPaneCollapsed: SETTINGS.rightPaneCollapsed === true,
        bottomPaneCollapsed: SETTINGS.bottomPaneCollapsed === true,
        bottomPaneHeight: typeof SETTINGS.bottomPaneHeight === 'number' ? SETTINGS.bottomPaneHeight : null,
      };
    }

    applyPreferenceSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return;
      // Bugs-7 (audit-2026-05-20): every untrusted field is routed through
      // Vectura.Validators. Anything that fails validation falls back to the
      // existing SETTINGS value (already-validated default) and emits a
      // console.warn. The bgColor field is the load-bearing case — it flows
      // straight into inline `style.background` so a tampered cookie like
      // `red; background: url(https://attacker/x)` would otherwise CSS-inject.
      const V = (window.Vectura && window.Vectura.Validators) || null;
      const warn = (field, value) => {
        try {
          // eslint-disable-next-line no-console
          console.warn(`[App] preference ${field} rejected, falling back`, value);
        } catch (_) { /* noop */ }
      };
      // Color helper — strict hex grammar. CSS-injection vectors (`;`, `(`,
      // `url(...)`, `expression(...)`) all fail the regex and reject.
      const takeColor = (field, fallback) => {
        if (!(field in snapshot)) return fallback;
        const v = snapshot[field];
        if (V && V.isHexColor(v)) return v;
        warn(field, v);
        return fallback;
      };
      // Numeric helper — Number.isFinite + clamp. NaN / Infinity / strings
      // like 'not-a-number' all reject; numeric strings ('5') coerce.
      const takeNumber = (field, fallback, min, max, opts = {}) => {
        if (!(field in snapshot)) return fallback;
        const v = snapshot[field];
        const out = opts.integer
          ? V && V.finiteIntInRange(v, min, max)
          : V && V.finiteInRange(v, min, max);
        if (out == null) {
          warn(field, v);
          return fallback;
        }
        return out;
      };
      // Enum helper — strict allowlist. Path-traversal / unknown values reject.
      const takeEnum = (field, fallback, allowed) => {
        if (!(field in snapshot)) return fallback;
        const v = snapshot[field];
        const out = V && V.fromEnum(v, allowed);
        if (out == null) {
          warn(field, v);
          return fallback;
        }
        return out;
      };
      // Free-form identifier (paletteId, paperSize, toolbarDock, etc.).
      // Bounded length + character allowlist so a malicious cookie can't
      // smuggle script text into a `data-*` attribute or DOM string.
      const takeSafeString = (field, fallback, maxLen = 64) => {
        if (!(field in snapshot)) return fallback;
        const v = snapshot[field];
        if (v == null) return null; // explicit null preserved
        const out = V && V.safeString(v, maxLen);
        if (out == null) {
          warn(field, v);
          return fallback;
        }
        return out;
      };

      SETTINGS.uiTheme = normalizeThemeName(snapshot.uiTheme ?? SETTINGS.uiTheme);
      SETTINGS.cookiePreferencesEnabled = snapshot.cookiePreferencesEnabled === true;
      SETTINGS.showCrystallographicNames = snapshot.showCrystallographicNames === true;
      SETTINGS.devMode = snapshot.devMode === true;
      SETTINGS.margin = takeNumber('margin', SETTINGS.margin, 0, 10000);
      SETTINGS.speedDown = takeNumber('speedDown', SETTINGS.speedDown, 0, 100000);
      SETTINGS.speedUp = takeNumber('speedUp', SETTINGS.speedUp, 0, 100000);
      SETTINGS.precision = takeNumber('precision', SETTINGS.precision, 0, 12, { integer: true });
      SETTINGS.strokeWidth = takeNumber('strokeWidth', SETTINGS.strokeWidth, 0, 100);
      SETTINGS.strokeWidthOverride = snapshot.strokeWidthOverride === true;
      SETTINGS.bgColor = takeColor('bgColor', SETTINGS.bgColor);
      SETTINGS.truncate = snapshot.truncate === undefined ? SETTINGS.truncate : snapshot.truncate === true;
      SETTINGS.cropExports = snapshot.cropExports === undefined ? SETTINGS.cropExports : snapshot.cropExports === true;
      SETTINGS.removeHiddenGeometry = snapshot.removeHiddenGeometry === undefined
        ? SETTINGS.removeHiddenGeometry
        : snapshot.removeHiddenGeometry === true;
      SETTINGS.outsideOpacity = takeNumber('outsideOpacity', SETTINGS.outsideOpacity, 0, 1);
      SETTINGS.marginLineVisible = snapshot.marginLineVisible === undefined
        ? SETTINGS.marginLineVisible
        : snapshot.marginLineVisible === true;
      SETTINGS.marginLineWeight = takeNumber('marginLineWeight', SETTINGS.marginLineWeight, 0, 100);
      SETTINGS.marginLineColor = takeColor('marginLineColor', SETTINGS.marginLineColor);
      SETTINGS.marginLineDotting = takeNumber('marginLineDotting', SETTINGS.marginLineDotting, 0, 10000);
      SETTINGS.showGuides = snapshot.showGuides === undefined ? SETTINGS.showGuides : snapshot.showGuides === true;
      SETTINGS.snapGuides = snapshot.snapGuides === undefined ? SETTINGS.snapGuides : snapshot.snapGuides === true;
      SETTINGS.selectionOutline = snapshot.selectionOutline === undefined
        ? SETTINGS.selectionOutline
        : snapshot.selectionOutline === true;
      SETTINGS.selectionOutlineColor = takeColor('selectionOutlineColor', SETTINGS.selectionOutlineColor);
      SETTINGS.selectionOutlineWidth = takeNumber('selectionOutlineWidth', SETTINGS.selectionOutlineWidth, 0, 100);
      SETTINGS.selectionOutlineHide3d = snapshot.selectionOutlineHide3d === undefined
        ? SETTINGS.selectionOutlineHide3d
        : snapshot.selectionOutlineHide3d === true;
      // gridType: legacy `gridOverlay` boolean upgrade still honored.
      const GRID_TYPES = ['none', 'standard', 'graph', 'iso', 'polar', 'dots'];
      const gridFallback = snapshot.gridOverlay ? 'standard' : SETTINGS.gridType;
      SETTINGS.gridType = 'gridType' in snapshot
        ? (V && V.fromEnum(snapshot.gridType, GRID_TYPES)) || (warn('gridType', snapshot.gridType), gridFallback)
        : gridFallback;
      SETTINGS.gridOpacity = takeNumber('gridOpacity', SETTINGS.gridOpacity, 0, 1);
      SETTINGS.gridStyle = takeEnum('gridStyle', SETTINGS.gridStyle, ['cartesian', 'isometric', 'polar']);
      SETTINGS.gridColor = takeColor('gridColor', SETTINGS.gridColor);
      SETTINGS.gridSize = takeNumber('gridSize', SETTINGS.gridSize, 0.001, 100000);
      SETTINGS.gridMinorOpacity = takeNumber('gridMinorOpacity', SETTINGS.gridMinorOpacity, 0, 1);
      SETTINGS.gridMinorColor = takeColor('gridMinorColor', SETTINGS.gridMinorColor);
      SETTINGS.gridMinorSize = takeNumber('gridMinorSize', SETTINGS.gridMinorSize, 0.001, 100000);
      SETTINGS.gridSnapEnabled = snapshot.gridSnapEnabled === true;
      SETTINGS.gridSnapSensitivity = takeNumber('gridSnapSensitivity', SETTINGS.gridSnapSensitivity, 0, 10000);
      SETTINGS.undoSteps = takeNumber('undoSteps', SETTINGS.undoSteps, 1, 10000, { integer: true });
      if (snapshot.uiSections && typeof snapshot.uiSections === 'object' && !Array.isArray(snapshot.uiSections)) {
        SETTINGS.uiSections = clone(snapshot.uiSections);
      }
      if (snapshot.aboutVisible !== undefined) SETTINGS.aboutVisible = snapshot.aboutVisible !== false;
      if (snapshot.touchModifiers && typeof snapshot.touchModifiers === 'object' && !Array.isArray(snapshot.touchModifiers)) {
        SETTINGS.touchModifiers = {
          ...(SETTINGS.touchModifiers || {}),
          ...snapshot.touchModifiers,
        };
      }
      SETTINGS.documentUnits = normalizeDocumentUnits(snapshot.documentUnits ?? SETTINGS.documentUnits);
      SETTINGS.paperSize = takeSafeString('paperSize', SETTINGS.paperSize, 64);
      SETTINGS.paperWidth = takeNumber('paperWidth', SETTINGS.paperWidth, 1, 100000);
      SETTINGS.paperHeight = takeNumber('paperHeight', SETTINGS.paperHeight, 1, 100000);
      SETTINGS.paperOrientation = takeEnum('paperOrientation', SETTINGS.paperOrientation, ['portrait', 'landscape']);
      SETTINGS.showDocumentDimensions = snapshot.showDocumentDimensions === true;
      SETTINGS.preview3dQuality = takeEnum('preview3dQuality', SETTINGS.preview3dQuality, ['draft', 'balanced', 'high']);
      SETTINGS.optimizationScope = takeEnum('optimizationScope', SETTINGS.optimizationScope, ['all', 'selected', 'visible']);
      SETTINGS.optimizationPreview = takeEnum('optimizationPreview', SETTINGS.optimizationPreview, ['off', 'on', 'overlay']);
      SETTINGS.optimizationExport = snapshot.optimizationExport === undefined
        ? SETTINGS.optimizationExport
        : snapshot.optimizationExport === true;
      SETTINGS.optimizationOverlayColor = takeColor('optimizationOverlayColor', SETTINGS.optimizationOverlayColor);
      SETTINGS.optimizationOverlayWidth = takeNumber('optimizationOverlayWidth', SETTINGS.optimizationOverlayWidth, 0, 100);
      SETTINGS.plotterOptimize = takeNumber('plotterOptimize', SETTINGS.plotterOptimize, 0, 100, { integer: true });
      SETTINGS.paletteId = takeSafeString('paletteId', SETTINGS.paletteId, 64);
      SETTINGS.layerBarPaletteId = takeSafeString('layerBarPaletteId', SETTINGS.layerBarPaletteId, 64);
      if (snapshot.autoColorization && typeof snapshot.autoColorization === 'object' && !Array.isArray(snapshot.autoColorization)) {
        // Deep clone trusted as-is — schema is too freeform to enumerate here.
        // Risk surface is bounded: values are read by colorization logic that
        // numericizes them on use, never flowed into inline DOM strings.
        SETTINGS.autoColorization = clone(snapshot.autoColorization);
      }
      if (snapshot.autoColorizationCollapsed !== undefined) {
        SETTINGS.autoColorizationCollapsed = snapshot.autoColorizationCollapsed === true;
      }
      if (snapshot.pensCollapsed !== undefined) {
        SETTINGS.pensCollapsed = snapshot.pensCollapsed === true;
      }
      // activeTool intentionally NOT restored — a page refresh always boots
      // into the default Select tool regardless of what was persisted.
      SETTINGS.scissorMode = takeEnum('scissorMode', SETTINGS.scissorMode, ['line', 'shape', 'all']);
      SETTINGS.penMode = takeEnum('penMode', SETTINGS.penMode, ['draw', 'erase', 'shape']);
      if (Array.isArray(snapshot.pens) && snapshot.pens.length) {
        // Validate each pen entry: id/name capped, color must be hex, width finite.
        const cleanPens = [];
        for (let i = 0; i < snapshot.pens.length && i < 32; i++) {
          const p = snapshot.pens[i];
          if (!p || typeof p !== 'object') continue;
          const id = V && V.safeString(p.id, 64);
          const color = V && V.isHexColor(p.color) ? p.color : null;
          const width = V && V.finiteInRange(p.width, 0, 100);
          if (!id || !color || width == null) { warn('pens[' + i + ']', p); continue; }
          const name = (typeof p.name === 'string' && p.name.length <= 128) ? p.name : id;
          cleanPens.push({ id, name, color, width });
        }
        if (cleanPens.length) SETTINGS.pens = cleanPens;
      }
      const clampPane = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        return Math.max(200, Math.min(520, Math.round(n)));
      };
      const left = clampPane(snapshot.paneLeftWidth);
      const right = clampPane(snapshot.paneRightWidth);
      if (left != null) {
        SETTINGS.paneLeftWidth = left;
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--pane-left-width', `${left}px`);
        }
      } else if ('paneLeftWidth' in snapshot) {
        warn('paneLeftWidth', snapshot.paneLeftWidth);
      }
      if (right != null) {
        SETTINGS.paneRightWidth = right;
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--pane-right-width', `${right}px`);
        }
      } else if ('paneRightWidth' in snapshot) {
        warn('paneRightWidth', snapshot.paneRightWidth);
      }
      SETTINGS.showTourOnFirstLaunch = snapshot.showTourOnFirstLaunch === true;
      SETTINGS.tourSeen = snapshot.tourSeen === true;
      // toolbarDock: null is the canonical "no dock" sentinel; otherwise enum.
      if ('toolbarDock' in snapshot) {
        if (snapshot.toolbarDock == null) {
          SETTINGS.toolbarDock = null;
        } else {
          const TOOLBAR_DOCKS = ['left', 'right', 'top', 'bottom'];
          const dock = V && V.fromEnum(snapshot.toolbarDock, TOOLBAR_DOCKS);
          if (dock) SETTINGS.toolbarDock = dock;
          else { warn('toolbarDock', snapshot.toolbarDock); SETTINGS.toolbarDock = null; }
        }
      }
      // toolbarX/Y default to null (no float position recorded). Only accept
      // an actual number; missing-or-null leaves SETTINGS.toolbarX/Y at null.
      const tbx = (typeof snapshot.toolbarX === 'number')
        ? (V && V.finiteInRange(snapshot.toolbarX, -1000000, 1000000))
        : null;
      SETTINGS.toolbarX = tbx == null ? null : tbx;
      const tby = (typeof snapshot.toolbarY === 'number')
        ? (V && V.finiteInRange(snapshot.toolbarY, -1000000, 1000000))
        : null;
      SETTINGS.toolbarY = tby == null ? null : tby;
      SETTINGS.toolbarLocked = snapshot.toolbarLocked === true;
      SETTINGS.toolbarHorizontal = snapshot.toolbarHorizontal === true;
      SETTINGS.leftPaneCollapsed = snapshot.leftPaneCollapsed === true;
      SETTINGS.rightPaneCollapsed = snapshot.rightPaneCollapsed === true;
      SETTINGS.bottomPaneCollapsed = snapshot.bottomPaneCollapsed === true;
      if (typeof snapshot.bottomPaneHeight === 'number') {
        const bottomPaneHeight = V && V.finiteInRange(snapshot.bottomPaneHeight, 50, 10000);
        if (bottomPaneHeight != null) {
          SETTINGS.bottomPaneHeight = bottomPaneHeight;
          if (typeof document !== 'undefined') {
            document.documentElement.style.setProperty('--bottom-pane-height', `${bottomPaneHeight}px`);
          }
        } else {
          warn('bottomPaneHeight', snapshot.bottomPaneHeight);
        }
      }
    }

    applyPreferencesFromCookie() {
      // localStorage is primary (no Safari ITP 7-day cap, survives file:// in
      // most browsers). Cookie is back-compat fallback for older saved state.
      const lsRaw = this.readLocalStorage(PREFERENCE_STORAGE_KEY);
      const cookieRaw = this.readCookie(this.preferenceCookieName);
      const candidates = [lsRaw, cookieRaw ? decodeURIComponent(cookieRaw) : null];
      for (const raw of candidates) {
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
          this.applyPreferenceSnapshot(data);
          return true;
        } catch (_) { /* try next */ }
      }
      if (cookieRaw && !lsRaw) {
        console.warn('[Preferences] Failed to parse saved preferences');
      }
      return false;
    }

    persistPreferences(options = {}) {
      const { force = false } = options;
      const enabled = SETTINGS.cookiePreferencesEnabled === true;
      if (!enabled && !force) {
        this.clearPreferenceCookie();
        return;
      }
      const snapshot = this.getPreferenceSnapshot();
      const json = JSON.stringify({ version: 1, data: snapshot });
      if (!force && json === this.lastPreferenceHash) return;
      this.lastPreferenceHash = json;
      this.writeLocalStorage(PREFERENCE_STORAGE_KEY, json);
      this.writeCookie(this.preferenceCookieName, encodeURIComponent(json), PREFERENCE_COOKIE_MAX_AGE);
    }

    persistPreferencesDebounced(delay = 280) {
      if (this.preferencePersistTimer) {
        window.clearTimeout(this.preferencePersistTimer);
      }
      this.preferencePersistTimer = window.setTimeout(() => {
        this.preferencePersistTimer = null;
        this.persistPreferences();
      }, Math.max(0, delay));
    }

    captureState() {
      const selectedLayerIds = Array.from(this.renderer?.selectedLayerIds || []).filter(Boolean);
      return {
        engine: this.engine.exportState(),
        settings: {
          margin: SETTINGS.margin,
          speedDown: SETTINGS.speedDown,
          speedUp: SETTINGS.speedUp,
          precision: SETTINGS.precision,
          strokeWidth: SETTINGS.strokeWidth,
          strokeWidthOverride: SETTINGS.strokeWidthOverride === true,
          bgColor: SETTINGS.bgColor,
          undoSteps: SETTINGS.undoSteps,
          truncate: SETTINGS.truncate,
          cropExports: SETTINGS.cropExports,
          removeHiddenGeometry: SETTINGS.removeHiddenGeometry,
          outsideOpacity: SETTINGS.outsideOpacity,
          marginLineVisible: SETTINGS.marginLineVisible,
          marginLineWeight: SETTINGS.marginLineWeight,
          marginLineColor: SETTINGS.marginLineColor,
          marginLineDotting: SETTINGS.marginLineDotting,
          showGuides: SETTINGS.showGuides,
          snapGuides: SETTINGS.snapGuides,
          selectionOutline: SETTINGS.selectionOutline,
          selectionOutlineColor: SETTINGS.selectionOutlineColor,
          selectionOutlineWidth: SETTINGS.selectionOutlineWidth,
          selectionOutlineHide3d: SETTINGS.selectionOutlineHide3d !== false,
          gridOverlay: SETTINGS.gridOverlay,
          uiSections: SETTINGS.uiSections ? clone(SETTINGS.uiSections) : null,
          aboutVisible: SETTINGS.aboutVisible !== false,
          touchModifiers: SETTINGS.touchModifiers ? clone(SETTINGS.touchModifiers) : null,
          documentUnits: normalizeDocumentUnits(SETTINGS.documentUnits),
          paperSize: SETTINGS.paperSize,
          paperWidth: SETTINGS.paperWidth,
          paperHeight: SETTINGS.paperHeight,
          paperOrientation: SETTINGS.paperOrientation,
          showDocumentDimensions: SETTINGS.showDocumentDimensions === true,
          preview3dQuality: SETTINGS.preview3dQuality,
          optimizationScope: SETTINGS.optimizationScope,
          optimizationPreview: SETTINGS.optimizationPreview,
          optimizationExport: SETTINGS.optimizationExport,
          optimizationOverlayColor: SETTINGS.optimizationOverlayColor,
          optimizationOverlayWidth: SETTINGS.optimizationOverlayWidth,
          plotterOptimize: SETTINGS.plotterOptimize,
          paletteId: SETTINGS.paletteId,
          autoColorization: SETTINGS.autoColorization ? clone(SETTINGS.autoColorization) : null,
          autoColorizationCollapsed: SETTINGS.autoColorizationCollapsed,
          activeTool: SETTINGS.activeTool,
          scissorMode: SETTINGS.scissorMode,
          penMode: SETTINGS.penMode,
          cookiePreferencesEnabled: SETTINGS.cookiePreferencesEnabled === true,
          lightSource: SETTINGS.lightSource ? { ...SETTINGS.lightSource } : null,
          optimizationDefaults: SETTINGS.optimizationDefaults
            ? clone(SETTINGS.optimizationDefaults)
            : null,
          pens: SETTINGS.pens ? clone(SETTINGS.pens) : [],
          globalLayerCount: SETTINGS.globalLayerCount,
        },
        selectedLayerId: this.renderer.selectedLayerId,
        selectedLayerIds,
      };
    }

    applyState(state) {
      if (!state) return;
      const s = state.settings || {};
      SETTINGS.margin = s.margin ?? SETTINGS.margin;
      SETTINGS.speedDown = s.speedDown ?? SETTINGS.speedDown;
      SETTINGS.speedUp = s.speedUp ?? SETTINGS.speedUp;
      SETTINGS.precision = s.precision ?? SETTINGS.precision;
      SETTINGS.strokeWidth = s.strokeWidth ?? SETTINGS.strokeWidth;
      SETTINGS.strokeWidthOverride = s.strokeWidthOverride === true;
      SETTINGS.bgColor = s.bgColor ?? SETTINGS.bgColor;
      SETTINGS.undoSteps = s.undoSteps ?? SETTINGS.undoSteps;
      SETTINGS.truncate = s.truncate ?? SETTINGS.truncate;
      SETTINGS.cropExports = s.cropExports ?? SETTINGS.cropExports;
      SETTINGS.removeHiddenGeometry = s.removeHiddenGeometry ?? SETTINGS.removeHiddenGeometry;
      SETTINGS.outsideOpacity = s.outsideOpacity ?? SETTINGS.outsideOpacity;
      SETTINGS.marginLineVisible = s.marginLineVisible ?? SETTINGS.marginLineVisible;
      SETTINGS.marginLineWeight = s.marginLineWeight ?? SETTINGS.marginLineWeight;
      SETTINGS.marginLineColor = s.marginLineColor ?? SETTINGS.marginLineColor;
      SETTINGS.marginLineDotting = s.marginLineDotting ?? SETTINGS.marginLineDotting;
      SETTINGS.showGuides = s.showGuides ?? SETTINGS.showGuides;
      SETTINGS.snapGuides = s.snapGuides ?? SETTINGS.snapGuides;
      SETTINGS.selectionOutline = s.selectionOutline ?? SETTINGS.selectionOutline;
      SETTINGS.selectionOutlineColor = s.selectionOutlineColor ?? SETTINGS.selectionOutlineColor;
      SETTINGS.selectionOutlineWidth = s.selectionOutlineWidth ?? SETTINGS.selectionOutlineWidth;
      SETTINGS.selectionOutlineHide3d = s.selectionOutlineHide3d ?? SETTINGS.selectionOutlineHide3d;
      SETTINGS.gridOverlay = s.gridOverlay ?? SETTINGS.gridOverlay;
      if (s.uiSections && typeof s.uiSections === 'object') {
        SETTINGS.uiSections = clone(s.uiSections);
      }
      if (s.aboutVisible !== undefined) SETTINGS.aboutVisible = s.aboutVisible !== false;
      if (s.touchModifiers && typeof s.touchModifiers === 'object') {
        SETTINGS.touchModifiers = {
          ...(SETTINGS.touchModifiers || {}),
          ...s.touchModifiers,
        };
      }
      SETTINGS.documentUnits = normalizeDocumentUnits(s.documentUnits ?? SETTINGS.documentUnits);
      SETTINGS.paperSize = s.paperSize ?? SETTINGS.paperSize;
      SETTINGS.paperWidth = s.paperWidth ?? SETTINGS.paperWidth;
      SETTINGS.paperHeight = s.paperHeight ?? SETTINGS.paperHeight;
      SETTINGS.paperOrientation = s.paperOrientation ?? SETTINGS.paperOrientation;
      SETTINGS.showDocumentDimensions = s.showDocumentDimensions === true;
      SETTINGS.preview3dQuality = s.preview3dQuality ?? SETTINGS.preview3dQuality;
      SETTINGS.optimizationScope = s.optimizationScope ?? SETTINGS.optimizationScope;
      SETTINGS.optimizationPreview = s.optimizationPreview ?? SETTINGS.optimizationPreview;
      SETTINGS.optimizationExport = s.optimizationExport ?? SETTINGS.optimizationExport;
      SETTINGS.optimizationOverlayColor = s.optimizationOverlayColor ?? SETTINGS.optimizationOverlayColor;
      SETTINGS.optimizationOverlayWidth = s.optimizationOverlayWidth ?? SETTINGS.optimizationOverlayWidth;
      SETTINGS.plotterOptimize = s.plotterOptimize ?? SETTINGS.plotterOptimize;
      SETTINGS.paletteId = s.paletteId ?? SETTINGS.paletteId;
      if (s.autoColorization) SETTINGS.autoColorization = clone(s.autoColorization);
      if (s.autoColorizationCollapsed !== undefined) {
        SETTINGS.autoColorizationCollapsed = s.autoColorizationCollapsed;
      }
      SETTINGS.activeTool = s.activeTool ?? SETTINGS.activeTool;
      SETTINGS.scissorMode = s.scissorMode ?? SETTINGS.scissorMode;
      SETTINGS.penMode = s.penMode ?? SETTINGS.penMode;
      SETTINGS.cookiePreferencesEnabled = s.cookiePreferencesEnabled ?? SETTINGS.cookiePreferencesEnabled;
      SETTINGS.lightSource = s.lightSource ?? SETTINGS.lightSource;
      if (s.optimizationDefaults) {
        SETTINGS.optimizationDefaults = clone(s.optimizationDefaults);
      }
      if (Array.isArray(s.pens) && s.pens.length) {
        // SECURITY: .vectura is untrusted input. SETTINGS.pens is rendered
        // into innerHTML by several panels (layers-panel, pens-panel,
        // pattern-designer). Validate every field before persisting so a
        // hostile pen.color="\"><img onerror=...> cannot survive an import.
        const validator = window.Vectura?.PenValidate?.validatePens;
        const validated = typeof validator === 'function' ? validator(s.pens) : clone(s.pens);
        if (validated.length) {
          SETTINGS.pens = validated;
        }
      }
      SETTINGS.globalLayerCount = s.globalLayerCount ?? SETTINGS.globalLayerCount;
      if (this.engine && SETTINGS.paperSize) {
        this.engine.setProfile(SETTINGS.paperSize);
      }
      this.engine.importState(state.engine);
      const selectedIds = Array.isArray(state.selectedLayerIds)
        ? state.selectedLayerIds.filter((id) => this.engine.layers.some((layer) => layer.id === id))
        : [];
      const selectedId = (
        (state.selectedLayerId && selectedIds.includes(state.selectedLayerId) && state.selectedLayerId)
        || selectedIds[0]
        || this.engine.activeLayerId
      );
      this.renderer.setSelection(selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []), selectedId);
      this.renderer.directSelection = null;
      this.renderer.directDrag = null;
      this.renderer.directAuxSelections = [];
      this.engine.activeLayerId = selectedId;
      this.ui.initSettingsValues();
      if (this.ui.setActiveTool) this.ui.setActiveTool(SETTINGS.activeTool || 'select');
      if (this.ui.setScissorMode) this.ui.setScissorMode(SETTINGS.scissorMode || 'line');
      if (this.ui.setPenMode) this.ui.setPenMode(SETTINGS.penMode || 'draw');
      if (this.renderer && 'lightSource' in SETTINGS) {
        this.renderer.lightSource = SETTINGS.lightSource;
        this.renderer.lightSourceSelected = false;
      }
      this.applyTheme(SETTINGS.uiTheme, {
        persist: false,
        syncPen1: false,
        syncDocumentBg: false,
        refreshUi: true,
        render: false,
      });
      this.ui.renderLayers();
      this.ui.renderPens();
      this.ui.buildControls();
      this.ui.updateFormula();
      this.render();
      // Restore rasterPlane sources. Noise sources resolve synchronously inside
      // generate(); painted/imported sources decode their embedded data URL
      // asynchronously, so re-generate the affected layer once it lands.
      if (window.Vectura?.RasterPlaneSource?.rehydrateAll) {
        window.Vectura.RasterPlaneSource.rehydrateAll(this.engine, (layer) => {
          if (layer && this.engine.generate) this.engine.generate(layer.id);
          this.render();
        });
      }
      this.persistPreferencesDebounced();
    }

    applyTheme(nextTheme, options = {}) {
      const {
        persist = true,
        syncPen1 = false,
        syncDocumentBg = false,
        syncGridColor = false,
        refreshUi = true,
        render = true,
      } = options;
      const themeName = normalizeThemeName(nextTheme ?? SETTINGS.uiTheme);
      const theme = getThemeConfig(themeName);
      if (!theme) return null;
      SETTINGS.uiTheme = themeName;

      const root = document.documentElement;
      if (root) {
        root.dataset.uiSkin = themeName;
        root.style.colorScheme = theme.colorScheme || themeName;
        // Clear inline cssVars left by any previously-active theme before applying
        // this theme's set. Without this, cycling dark → lark → light → dark leaves
        // light's inline --color-control / --color-bg / etc. stuck on :root, since
        // dark only pushes a small subset and inline styles beat the :root rule.
        ALL_THEME_CSS_VAR_KEYS.forEach((key) => {
          root.style.removeProperty(key);
        });
        if (theme.cssVars && typeof theme.cssVars === 'object') {
          Object.entries(theme.cssVars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
          });
        }
      }
      // Hand off skin-specific side-effects (stylesheet swap, motion vars, swap-suppression
      // window, vectura:skin-change dispatch) to SkinManager. SkinManager is a no-op if it
      // hasn't loaded yet (e.g. very early bootstrap), in which case the data-attrs above
      // are still enough for legacy CSS to paint correctly.
      const skinManager = window.Vectura && window.Vectura.SkinManager;
      if (skinManager && typeof skinManager.activate === 'function') {
        try {
          skinManager.activate(themeName);
        } catch (err) {
          // Don't let an unknown skin id throw out of applyTheme — log and continue.
          if (typeof console !== 'undefined') console.warn('[App] SkinManager.activate failed:', err);
        }
      }

      const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
      if (colorSchemeMeta) colorSchemeMeta.setAttribute('content', theme.colorScheme || themeName);
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta && theme.metaThemeColor) themeColorMeta.setAttribute('content', theme.metaThemeColor);

      if (syncDocumentBg && theme.documentBg) {
        SETTINGS.bgColor = theme.documentBg;
      }

      if (syncGridColor) {
        if (theme.gridColor) SETTINGS.gridColor = theme.gridColor;
        if (theme.gridMinorColor) SETTINGS.gridMinorColor = theme.gridMinorColor;
      }

      if (syncPen1 && Array.isArray(SETTINGS.pens) && SETTINGS.pens.length) {
        const pen1 = SETTINGS.pens.find((pen) => pen?.id === 'pen-1') || SETTINGS.pens[0];
        if (pen1) {
          pen1.color = theme.pen1Color || pen1.color;
          if (this.engine?.layers?.length) {
            this.engine.layers.forEach((layer) => {
              if (layer.penId === pen1.id) {
                layer.color = pen1.color;
              }
            });
          }
        }
      }

      if (refreshUi && this.ui) {
        this.ui.refreshThemeUi?.();
        this.ui.renderPens?.();
        this.ui.renderLayers?.();
      }

      if (render && this.renderer) {
        this.render();
      } else if (persist) {
        this.persistPreferencesDebounced();
      }
      return theme;
    }

    toggleTheme() {
      // Cycle within the active theme family only: dark → lark → light → dark
      // (or the classic-* counterparts when the Classic family is active).
      // Family is switched by the Modern/Classic toggle in Document Setup.
      const current = normalizeThemeName(SETTINGS.uiTheme);
      const family = getThemeFamily(current);
      const slot = getThemeBrightness(current);
      const idx = BRIGHTNESS_ORDER.indexOf(slot);
      const nextSlot = BRIGHTNESS_ORDER[(idx + 1) % BRIGHTNESS_ORDER.length];
      const next = getThemeIdForFamilySlot(family, nextSlot) || current;
      return this.applyTheme(next, {
        persist: true,
        syncPen1: true,
        syncDocumentBg: true,
        syncGridColor: true,
        refreshUi: true,
        render: true,
      });
    }

    setThemeFamily(nextFamily) {
      const family = normalizeThemeFamily(nextFamily);
      const current = normalizeThemeName(SETTINGS.uiTheme);
      if (getThemeFamily(current) === family) return null;
      const slot = getThemeBrightness(current);
      const next = getThemeIdForFamilySlot(family, slot)
        || getThemeIdForFamilySlot(family, BRIGHTNESS_ORDER[0]);
      if (!next || next === current) return null;
      return this.applyTheme(next, {
        persist: true,
        syncPen1: true,
        syncDocumentBg: true,
        syncGridColor: true,
        refreshUi: true,
        render: true,
      });
    }

    getThemeFamily() {
      return getThemeFamily(SETTINGS.uiTheme);
    }

    pushHistory() {
      if (this.isRestoring) return;
      const snapshot = this.captureState();
      this.history.push(snapshot);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.redoStack = [];
    }

    undo() {
      if (this.history.length < 2) return;
      this.isRestoring = true;
      // Save the current live state so redo can restore it exactly.
      // pushHistory() uses "push-before-change", so the most recent
      // history entry IS the state to restore to — apply it, don't skip it.
      this.redoStack.push(this.captureState());
      const checkpoint = this.history.pop();
      this.applyState(checkpoint);
      this.isRestoring = false;
    }

    redo() {
      if (!this.redoStack.length) return;
      this.isRestoring = true;
      const next = this.redoStack.pop();
      // Push the current state as a checkpoint so undo can return here.
      this.history.push(this.captureState());
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.applyState(next);
      this.isRestoring = false;
    }

    setUndoLimit(next) {
      this.maxHistory = Math.max(1, next || 1);
      while (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    // Bug-12 fix (v1.1.10 audit): regen() never pushed history, which meant
    // user-initiated re-rolls that called regen() *without* first calling
    // pushHistory() left no undo point for the generation change. The vast
    // majority of callers (~114 sites in panels/modals) already push history
    // before mutating params, then call regen(); they MUST continue to work
    // with no behavior change. So the default stays `pushHistory: false` and
    // user-initiated callers explicitly opt in with `regen({ pushHistory: true })`.
    regen(options = {}) {
      const pushHistory = options && options.pushHistory === true;
      if (pushHistory) this.pushHistory();
      this.engine.generate(this.engine.activeLayerId, options);
      if (SETTINGS.autoColorization?.enabled && this.ui?.applyAutoColorization && !this.ui.isApplyingAutoColorization) {
        this.ui.applyAutoColorization({ commit: false, skipLayerRender: true, skipAppRender: true });
      }
      this.renderer?.refreshDirectSelection?.();
      this.render();
      this.ui.updateFormula();
      // Live-refresh the preset gallery so the trigger flips to "Custom" the
      // instant a param diverges from the active preset (and back when restored).
      // No-op when the active layer has no preset gallery mounted.
      this.ui?._activePresetGalleryRefresh?.();
      // Live-refresh the Raster-Plane source preview so its thumbnail tracks
      // every edit — most importantly the noise stack displacing the surface.
      // No-op unless the active layer mounted the image-source widget.
      this.ui?._activeImageSourceRefresh?.();
      // The harmonograph/pendula virtual plotter caches a STATIC figure; refresh
      // it on every regen so its ghost tracks ALL param edits (pendulum stack,
      // base params, dice, presets, Motion Rack), not just Motion Rack edits.
      // No-op when no plotter is mounted (state is nulled for non-family layers).
      this.ui?.harmonographPlotterState?.rebuild?.();
    }

    render() {
      this.renderer.draw();
      this.updateStats();
      this.persistPreferencesDebounced();
    }

    updateStats() {
      const s = this.engine.getStats();
      this.ui?.updateStats?.(s);
    }

    computeDisplayGeometry() {
      this.engine.computeAllDisplayGeometry();
    }

    addModifierLayer(type) {
      return this.engine.addModifierLayer(type);
    }

    optimizeLayers(targets, options) {
      return this.engine.optimizeLayers(targets, options);
    }

    getSelectedLayers() {
      return this.renderer?.getSelectedLayers?.() || [];
    }

    setSelection(ids, primaryId) {
      this.renderer?.setSelection(ids, primaryId);
      // Selection changes can flip the Expand Fill button's eligibility
      // (active layer with fills vs. without). Cheap to refresh.
      this.paintBucketPanel?.updateExpandButton?.();
    }

    hexToRgb(hex) {
      return this.renderer?.hexToRgb?.(hex) || { r: 56, g: 189, b: 248 };
    }

    getComplementRgb(rgb) {
      return this.renderer?.getComplementRgb?.(rgb) || { r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b };
    }

    rgbToCss(rgb, alpha = 1) {
      return this.renderer?.rgbToCss?.(rgb, alpha) || `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }
  }

  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.App = App;
})();
