/**
 * Application orchestrator.
 */
(() => {
  const { VectorEngine, Renderer, UI, SETTINGS } = window.Vectura || {};

  class App {
    constructor() {
      console.log('Initializing Vectura Studio...');
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
          activeTool: SETTINGS.activeTool,
          scissorMode: SETTINGS.scissorMode,
          lightSource: SETTINGS.lightSource ? { ...SETTINGS.lightSource } : null,
          optimizationDefaults: SETTINGS.optimizationDefaults
            ? JSON.parse(JSON.stringify(SETTINGS.optimizationDefaults))
            : null,
          pens: SETTINGS.pens ? JSON.parse(JSON.stringify(SETTINGS.pens)) : [],
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
      SETTINGS.activeTool = s.activeTool ?? SETTINGS.activeTool;
      SETTINGS.scissorMode = s.scissorMode ?? SETTINGS.scissorMode;
      SETTINGS.lightSource = s.lightSource ?? SETTINGS.lightSource;
      if (s.optimizationDefaults) {
        SETTINGS.optimizationDefaults = JSON.parse(JSON.stringify(s.optimizationDefaults));
      }
      if (Array.isArray(s.pens) && s.pens.length) {
        SETTINGS.pens = JSON.parse(JSON.stringify(s.pens));
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
      if (this.ui.setScissorMode) this.ui.setScissorMode(SETTINGS.scissorMode || 'line');
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
      this.render();
      this.ui.updateFormula();
    }

    render() {
      this.renderer.draw();
      this.updateStats();
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
