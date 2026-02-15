/**
 * Application orchestrator.
 */
(() => {
  const { VectorEngine, Renderer, UI, SETTINGS } = window.Vectura || {};
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const PREFERENCE_COOKIE = 'vectura_prefs';
  const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

  class App {
    constructor() {
      console.log('Initializing Vectura Studio...');
      this.preferenceCookieName = PREFERENCE_COOKIE;
      this.preferencePersistTimer = null;
      this.lastPreferenceHash = '';
      this.applyPreferencesFromCookie();
      this.engine = new VectorEngine();
      this.renderer = new Renderer('main-canvas', this.engine);
      this.ui = new UI(this);
      this.renderer.setSelection([this.engine.activeLayerId], this.engine.activeLayerId);
      this.renderer.onSelectLayer = (layer) => {
        if (layer) this.engine.activeLayerId = layer.id;
        this.ui.renderLayers();
        this.ui.buildControls();
        this.ui.updateFormula();
      };
      this.renderer.onCommitTransform = () => this.pushHistory();
      this.renderer.onDuplicateLayer = () => this.pushHistory();
      this.history = [];
      this.maxHistory = SETTINGS.undoSteps ?? 20;
      this.isRestoring = false;
      this.pushHistory();

      this.render();
      this.persistPreferencesDebounced(0);
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
      this.writeCookie(this.preferenceCookieName, '', 0);
      this.lastPreferenceHash = '';
    }

    getPreferenceSnapshot() {
      return {
        cookiePreferencesEnabled: SETTINGS.cookiePreferencesEnabled === true,
        margin: SETTINGS.margin,
        speedDown: SETTINGS.speedDown,
        speedUp: SETTINGS.speedUp,
        precision: SETTINGS.precision,
        strokeWidth: SETTINGS.strokeWidth,
        bgColor: SETTINGS.bgColor,
        truncate: SETTINGS.truncate,
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
        showCanvasHelp: SETTINGS.showCanvasHelp,
        gridOverlay: SETTINGS.gridOverlay,
        uiSections: SETTINGS.uiSections ? clone(SETTINGS.uiSections) : null,
        aboutVisible: SETTINGS.aboutVisible !== false,
        touchModifiers: SETTINGS.touchModifiers ? clone(SETTINGS.touchModifiers) : null,
        paperSize: SETTINGS.paperSize,
        paperWidth: SETTINGS.paperWidth,
        paperHeight: SETTINGS.paperHeight,
        paperOrientation: SETTINGS.paperOrientation,
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
        pens: Array.isArray(SETTINGS.pens) ? clone(SETTINGS.pens) : [],
      };
    }

    applyPreferenceSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return;
      SETTINGS.cookiePreferencesEnabled = snapshot.cookiePreferencesEnabled === true;
      SETTINGS.margin = snapshot.margin ?? SETTINGS.margin;
      SETTINGS.speedDown = snapshot.speedDown ?? SETTINGS.speedDown;
      SETTINGS.speedUp = snapshot.speedUp ?? SETTINGS.speedUp;
      SETTINGS.precision = snapshot.precision ?? SETTINGS.precision;
      SETTINGS.strokeWidth = snapshot.strokeWidth ?? SETTINGS.strokeWidth;
      SETTINGS.bgColor = snapshot.bgColor ?? SETTINGS.bgColor;
      SETTINGS.truncate = snapshot.truncate ?? SETTINGS.truncate;
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
      SETTINGS.showCanvasHelp = snapshot.showCanvasHelp ?? SETTINGS.showCanvasHelp;
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
      SETTINGS.paperSize = snapshot.paperSize ?? SETTINGS.paperSize;
      SETTINGS.paperWidth = snapshot.paperWidth ?? SETTINGS.paperWidth;
      SETTINGS.paperHeight = snapshot.paperHeight ?? SETTINGS.paperHeight;
      SETTINGS.paperOrientation = snapshot.paperOrientation ?? SETTINGS.paperOrientation;
      SETTINGS.optimizationScope = snapshot.optimizationScope ?? SETTINGS.optimizationScope;
      SETTINGS.optimizationPreview = snapshot.optimizationPreview ?? SETTINGS.optimizationPreview;
      SETTINGS.optimizationExport = snapshot.optimizationExport ?? SETTINGS.optimizationExport;
      SETTINGS.optimizationOverlayColor = snapshot.optimizationOverlayColor ?? SETTINGS.optimizationOverlayColor;
      SETTINGS.optimizationOverlayWidth = snapshot.optimizationOverlayWidth ?? SETTINGS.optimizationOverlayWidth;
      SETTINGS.plotterOptimize = snapshot.plotterOptimize ?? SETTINGS.plotterOptimize;
      SETTINGS.paletteId = snapshot.paletteId ?? SETTINGS.paletteId;
      if (snapshot.autoColorization && typeof snapshot.autoColorization === 'object') {
        SETTINGS.autoColorization = clone(snapshot.autoColorization);
      }
      if (snapshot.autoColorizationCollapsed !== undefined) {
        SETTINGS.autoColorizationCollapsed = snapshot.autoColorizationCollapsed;
      }
      SETTINGS.activeTool = snapshot.activeTool ?? SETTINGS.activeTool;
      SETTINGS.selectionMode = snapshot.selectionMode ?? SETTINGS.selectionMode;
      SETTINGS.scissorMode = snapshot.scissorMode ?? SETTINGS.scissorMode;
      SETTINGS.penMode = snapshot.penMode ?? SETTINGS.penMode;
      if (Array.isArray(snapshot.pens) && snapshot.pens.length) {
        SETTINGS.pens = clone(snapshot.pens);
      }
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
          showCanvasHelp: SETTINGS.showCanvasHelp,
          gridOverlay: SETTINGS.gridOverlay,
          uiSections: SETTINGS.uiSections ? clone(SETTINGS.uiSections) : null,
          aboutVisible: SETTINGS.aboutVisible !== false,
          touchModifiers: SETTINGS.touchModifiers ? clone(SETTINGS.touchModifiers) : null,
          paperSize: SETTINGS.paperSize,
          paperWidth: SETTINGS.paperWidth,
          paperHeight: SETTINGS.paperHeight,
          paperOrientation: SETTINGS.paperOrientation,
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
      SETTINGS.showCanvasHelp = s.showCanvasHelp ?? SETTINGS.showCanvasHelp;
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
      SETTINGS.paperSize = s.paperSize ?? SETTINGS.paperSize;
      SETTINGS.paperWidth = s.paperWidth ?? SETTINGS.paperWidth;
      SETTINGS.paperHeight = s.paperHeight ?? SETTINGS.paperHeight;
      SETTINGS.paperOrientation = s.paperOrientation ?? SETTINGS.paperOrientation;
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
      const selectedId = state.selectedLayerId || this.engine.activeLayerId;
      this.renderer.setSelection(selectedId ? [selectedId] : [], selectedId);
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
      this.renderer.center();
      this.ui.renderLayers();
      this.ui.renderPens();
      this.ui.buildControls();
      this.ui.updateFormula();
      this.render();
      this.persistPreferencesDebounced();
    }

    pushHistory() {
      if (this.isRestoring) return;
      const snapshot = this.captureState();
      this.history.push(snapshot);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }

    undo() {
      if (this.history.length < 2) return;
      this.isRestoring = true;
      this.history.pop();
      const previous = this.history[this.history.length - 1];
      this.applyState(previous);
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
      if (this.ui?.updateCanvasHelpPosition) this.ui.updateCanvasHelpPosition();
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
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.App = App;
})();
