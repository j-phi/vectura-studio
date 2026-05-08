/**
 * Application orchestrator.
 */
(() => {
  const { VectorEngine, Renderer, UI, SETTINGS, THEMES = {}, UnitUtils = {} } = window.Vectura || {};
  const clone =
    typeof structuredClone === 'function' ? (obj) => structuredClone(obj) : (obj) => JSON.parse(JSON.stringify(obj));
  const PREFERENCE_COOKIE = 'vectura_prefs';
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
      this.applyPreferencesFromCookie();
      this.applyTheme(SETTINGS.uiTheme, {
        persist: false,
        syncPen1: false,
        syncDocumentBg: false,
        refreshUi: false,
        render: false,
      });
      this.engine = new VectorEngine();
      this.renderer = new Renderer('main-canvas', this.engine);
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

    clearPreferenceCookie() {
      if (this.preferencePersistTimer) {
        window.clearTimeout(this.preferencePersistTimer);
        this.preferencePersistTimer = null;
      }
      this.writeCookie(this.preferenceCookieName, '', 0);
      this.lastPreferenceHash = '';
    }

    clearSavedPreferences() {
      SETTINGS.cookiePreferencesEnabled = false;
      this.clearPreferenceCookie();
    }

    getPreferenceSnapshot() {
      return {
        uiTheme: SETTINGS.uiTheme || DEFAULT_THEME,
        cookiePreferencesEnabled: SETTINGS.cookiePreferencesEnabled === true,
        margin: SETTINGS.margin,
        speedDown: SETTINGS.speedDown,
        speedUp: SETTINGS.speedUp,
        precision: SETTINGS.precision,
        strokeWidth: SETTINGS.strokeWidth,
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
        activeTool: SETTINGS.activeTool,
        selectionMode: SETTINGS.selectionMode,
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
      };
    }

    applyPreferenceSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return;
      SETTINGS.uiTheme = normalizeThemeName(snapshot.uiTheme ?? SETTINGS.uiTheme);
      SETTINGS.cookiePreferencesEnabled = snapshot.cookiePreferencesEnabled === true;
      SETTINGS.margin = snapshot.margin ?? SETTINGS.margin;
      SETTINGS.speedDown = snapshot.speedDown ?? SETTINGS.speedDown;
      SETTINGS.speedUp = snapshot.speedUp ?? SETTINGS.speedUp;
      SETTINGS.precision = snapshot.precision ?? SETTINGS.precision;
      SETTINGS.strokeWidth = snapshot.strokeWidth ?? SETTINGS.strokeWidth;
      SETTINGS.bgColor = snapshot.bgColor ?? SETTINGS.bgColor;
      SETTINGS.truncate = snapshot.truncate ?? SETTINGS.truncate;
      SETTINGS.cropExports = snapshot.cropExports ?? SETTINGS.cropExports;
      SETTINGS.removeHiddenGeometry = snapshot.removeHiddenGeometry ?? SETTINGS.removeHiddenGeometry;
      SETTINGS.outsideOpacity = snapshot.outsideOpacity ?? SETTINGS.outsideOpacity;
      SETTINGS.marginLineVisible = snapshot.marginLineVisible ?? SETTINGS.marginLineVisible;
      SETTINGS.marginLineWeight = snapshot.marginLineWeight ?? SETTINGS.marginLineWeight;
      SETTINGS.marginLineColor = snapshot.marginLineColor ?? SETTINGS.marginLineColor;
      SETTINGS.marginLineDotting = snapshot.marginLineDotting ?? SETTINGS.marginLineDotting;
      SETTINGS.showGuides = snapshot.showGuides ?? SETTINGS.showGuides;
      SETTINGS.snapGuides = snapshot.snapGuides ?? SETTINGS.snapGuides;
      SETTINGS.selectionOutline = snapshot.selectionOutline ?? SETTINGS.selectionOutline;
      SETTINGS.selectionOutlineColor = snapshot.selectionOutlineColor ?? SETTINGS.selectionOutlineColor;
      SETTINGS.selectionOutlineWidth = snapshot.selectionOutlineWidth ?? SETTINGS.selectionOutlineWidth;
      SETTINGS.gridOverlay = snapshot.gridOverlay ?? SETTINGS.gridOverlay;
      if (snapshot.uiSections && typeof snapshot.uiSections === 'object') {
        SETTINGS.uiSections = clone(snapshot.uiSections);
      }
      if (snapshot.aboutVisible !== undefined) SETTINGS.aboutVisible = snapshot.aboutVisible !== false;
      if (snapshot.touchModifiers && typeof snapshot.touchModifiers === 'object') {
        SETTINGS.touchModifiers = {
          ...(SETTINGS.touchModifiers || {}),
          ...snapshot.touchModifiers,
        };
      }
      SETTINGS.documentUnits = normalizeDocumentUnits(snapshot.documentUnits ?? SETTINGS.documentUnits);
      SETTINGS.paperSize = snapshot.paperSize ?? SETTINGS.paperSize;
      SETTINGS.paperWidth = snapshot.paperWidth ?? SETTINGS.paperWidth;
      SETTINGS.paperHeight = snapshot.paperHeight ?? SETTINGS.paperHeight;
      SETTINGS.paperOrientation = snapshot.paperOrientation ?? SETTINGS.paperOrientation;
      SETTINGS.showDocumentDimensions = snapshot.showDocumentDimensions === true;
      SETTINGS.optimizationScope = snapshot.optimizationScope ?? SETTINGS.optimizationScope;
      SETTINGS.optimizationPreview = snapshot.optimizationPreview ?? SETTINGS.optimizationPreview;
      SETTINGS.optimizationExport = snapshot.optimizationExport ?? SETTINGS.optimizationExport;
      SETTINGS.optimizationOverlayColor = snapshot.optimizationOverlayColor ?? SETTINGS.optimizationOverlayColor;
      SETTINGS.optimizationOverlayWidth = snapshot.optimizationOverlayWidth ?? SETTINGS.optimizationOverlayWidth;
      SETTINGS.plotterOptimize = snapshot.plotterOptimize ?? SETTINGS.plotterOptimize;
      SETTINGS.paletteId = snapshot.paletteId ?? SETTINGS.paletteId;
      SETTINGS.layerBarPaletteId = snapshot.layerBarPaletteId ?? SETTINGS.layerBarPaletteId;
      if (snapshot.autoColorization && typeof snapshot.autoColorization === 'object') {
        SETTINGS.autoColorization = clone(snapshot.autoColorization);
      }
      if (snapshot.autoColorizationCollapsed !== undefined) {
        SETTINGS.autoColorizationCollapsed = snapshot.autoColorizationCollapsed;
      }
      if (snapshot.pensCollapsed !== undefined) {
        SETTINGS.pensCollapsed = snapshot.pensCollapsed;
      }
      SETTINGS.activeTool = snapshot.activeTool ?? SETTINGS.activeTool;
      SETTINGS.selectionMode = snapshot.selectionMode ?? SETTINGS.selectionMode;
      SETTINGS.scissorMode = snapshot.scissorMode ?? SETTINGS.scissorMode;
      SETTINGS.penMode = snapshot.penMode ?? SETTINGS.penMode;
      if (Array.isArray(snapshot.pens) && snapshot.pens.length) {
        SETTINGS.pens = clone(snapshot.pens);
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
      }
      if (right != null) {
        SETTINGS.paneRightWidth = right;
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--pane-right-width', `${right}px`);
        }
      }
      SETTINGS.showTourOnFirstLaunch = snapshot.showTourOnFirstLaunch === true;
      SETTINGS.tourSeen = snapshot.tourSeen === true;
      SETTINGS.toolbarDock = snapshot.toolbarDock ?? null;
      SETTINGS.toolbarX = typeof snapshot.toolbarX === 'number' ? snapshot.toolbarX : null;
      SETTINGS.toolbarY = typeof snapshot.toolbarY === 'number' ? snapshot.toolbarY : null;
      SETTINGS.toolbarLocked = snapshot.toolbarLocked === true;
    }

    applyPreferencesFromCookie() {
      let raw = this.readCookie(this.preferenceCookieName);
      if (!raw) return;
      try {
        raw = decodeURIComponent(raw);
        const parsed = JSON.parse(raw);
        const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        this.applyPreferenceSnapshot(data);
      } catch (err) {
        console.warn('[Preferences] Failed to parse cookie preferences:', err);
      }
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
          selectionMode: SETTINGS.selectionMode,
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
      SETTINGS.selectionMode = s.selectionMode ?? SETTINGS.selectionMode;
      SETTINGS.scissorMode = s.scissorMode ?? SETTINGS.scissorMode;
      SETTINGS.penMode = s.penMode ?? SETTINGS.penMode;
      SETTINGS.cookiePreferencesEnabled = s.cookiePreferencesEnabled ?? SETTINGS.cookiePreferencesEnabled;
      SETTINGS.lightSource = s.lightSource ?? SETTINGS.lightSource;
      if (s.optimizationDefaults) {
        SETTINGS.optimizationDefaults = clone(s.optimizationDefaults);
      }
      if (Array.isArray(s.pens) && s.pens.length) {
        SETTINGS.pens = clone(s.pens);
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
      this.engine.activeLayerId = selectedId;
      this.ui.initSettingsValues();
      if (this.ui.setActiveTool) this.ui.setActiveTool(SETTINGS.activeTool || 'select');
      if (this.ui.setSelectionMode) this.ui.setSelectionMode(SETTINGS.selectionMode || 'rect');
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
      this.renderer.center();
      this.ui.renderLayers();
      this.ui.renderPens();
      this.ui.buildControls();
      this.ui.updateFormula();
      this.render();
      this.persistPreferencesDebounced();
    }

    applyTheme(nextTheme, options = {}) {
      const {
        persist = true,
        syncPen1 = false,
        syncDocumentBg = false,
        refreshUi = true,
        render = true,
      } = options;
      const themeName = normalizeThemeName(nextTheme ?? SETTINGS.uiTheme);
      const theme = getThemeConfig(themeName);
      if (!theme) return null;
      SETTINGS.uiTheme = themeName;

      const root = document.documentElement;
      if (root) {
        root.dataset.theme = themeName;
        root.dataset.uiSkin = themeName;
        root.style.colorScheme = theme.colorScheme || themeName;
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
          if (typeof console !== 'undefined') console.warn('[applyTheme] SkinManager.activate failed:', err);
        }
      }

      const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
      if (colorSchemeMeta) colorSchemeMeta.setAttribute('content', theme.colorScheme || themeName);
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta && theme.metaThemeColor) themeColorMeta.setAttribute('content', theme.metaThemeColor);

      if (syncDocumentBg && theme.documentBg) {
        SETTINGS.bgColor = theme.documentBg;
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

    regen() {
      this.engine.generate(this.engine.activeLayerId);
      if (SETTINGS.autoColorization?.enabled && this.ui?.applyAutoColorization && !this.ui.isApplyingAutoColorization) {
        this.ui.applyAutoColorization({ commit: false, skipLayerRender: true, skipAppRender: true });
      }
      this.render();
      this.ui.updateFormula();
    }

    render() {
      this.renderer.draw();
      this.updateStats();
      this.persistPreferencesDebounced();
    }

    updateStats() {
      const s = this.engine.getStats();
      const dist = document.getElementById('stat-dist');
      const time = document.getElementById('stat-time');
      const lines = document.getElementById('stat-lines');
      if (!dist || !time) return;
      dist.innerText = s.distance;
      time.innerText = s.time;
      if (lines) lines.innerText = s.lines?.toString?.() || '0';
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

  window.Vectura = window.Vectura || {};
  window.Vectura.App = App;
})();
