/**
 * Vectura UI orchestrator (Meridian Unit 1.9c — owns the constructor body).
 *
 * After Unit 1.9c (2026-05-20) this file owns:
 *
 *   - `Orchestrator.init(app)` — the constructor body that was formerly
 *     inlined inside `_ui-legacy.js`'s `class UI { constructor() {...} }`.
 *     Initializes instance state, mounts the document-setup + grid-settings
 *     panels, runs the bindGlobal + bindShortcuts + bindInfoButtons sweep,
 *     wires the window-level drag-drop + engine-progress hooks, and runs
 *     the post-init sequence (left-panel sections, top menu bar, pane
 *     toggles, etc.). Effectively the entire pre-1.9c constructor.
 *   - `Orchestrator.installOn(proto)` — assigns `proto._init` so that
 *     `new UI(app)` (whose body is now just `this._init(app)`) lands on
 *     the init function. Mirrors the satellite-`installOn` pattern used
 *     throughout the panels.
 *   - `Orchestrator` — the alias for `window.Vectura.UI`. When loaded
 *     standalone (compile-gate JSDOM test, no legacy script loaded) the
 *     alias points at a placeholder that throws a clear "load _ui-legacy
 *     first" error on construction. When loaded in production after
 *     `_ui-legacy.js`, the alias is the class itself.
 *
 * Load-order contract
 * -------------------
 * `index.html` loads `_ui-legacy.js` BEFORE `ui.js`. Order of operations:
 *
 *   1. `_ui-legacy.js` IIFE runs:
 *        - declares `class UI` (constructor now a thin stub).
 *        - runs all satellite `bind()` + `installOn(UI.prototype)` calls.
 *        - assigns `window.Vectura.UI = UI` (with static-property forward).
 *   2. `ui.js` IIFE runs (this file):
 *        - finds `window.Vectura.UI` is a function (the legacy class).
 *        - aliases as `Orchestrator`.
 *        - assigns `Orchestrator.init` and `Orchestrator.installOn`.
 *        - calls `Orchestrator.installOn(UI.prototype)` so `_init` is
 *          available on every instance.
 *   3. `main.js` waits for the `load` event and calls `new App()`, which
 *      calls `new UI(app)`. The (now-stub) legacy constructor invokes
 *      `this._init(app)`, dispatching into `Orchestrator.init`.
 *
 * If `_ui-legacy.js` ever fails to load (or load order is reversed),
 * the compile-gate test exercises the trip-wire path: `Orchestrator` is
 * a placeholder class whose constructor throws with a descriptive error.
 *
 * Why `init` reads its deps from `window.Vectura.UI.CONTROL_DEFS` and
 * `window.Vectura.SETTINGS` directly (no DI bag)
 * ----------------------------------------------------------------------
 * Unlike satellites that receive closure-captured IIFE locals via a
 * `bind(deps)` call, the constructor body only touches:
 *   - `window.Vectura.UI.CONTROL_DEFS` (set by controls-registry.js — loaded
 *     before `_ui-legacy.js`).
 *   - `window.Vectura.SETTINGS` (set by src/config/defaults.js — loaded
 *     before everything else).
 *   - `this.*` methods that are already installed on UI.prototype by the
 *     satellites' own installOn() calls (which run inside _ui-legacy.js's
 *     IIFE before this file runs).
 * Both globals are read at call time (not at module load time) so the
 * orchestrator does not need a separate DI handshake.
 *
 * Compile gate: tests/unit/ui-orchestrator-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  /**
   * Constructor body. Invoked as `init.call(this, app)` from the
   * per-prototype `_init` method that `installOn` registers.
   *
   * Faithfully ports the legacy `class UI { constructor(app) {...} }` body
   * (Meridian pre-1.9c) including: instance-field init, document/grid
   * setup mounts, bindGlobal/bindShortcuts/bindInfoButtons, drag-drop +
   * engine-progress closures, left-panel section setup, the inline
   * popover-dismiss click listener, and the post-init render sweep.
   */
  /**
   * Meridian Unit 1.9c: the residual `bindGlobal()` body from
   * `_ui-legacy.js`'s `class UI`. After units 1.9a + 1.9b, every input
   * handler this used to inline moved out into per-satellite installers.
   * What remains is a sequence of guarded delegations: each installer is
   * called only if its corresponding satellite registered it via
   * `installOn(UI.prototype)`. The guards (typeof ... === 'function')
   * preserve compatibility with unit tests that invoke this against a
   * stub `this` (no full prototype, no DOM hooks).
   *
   * Invoked as `bindGlobalSweep.call(this)` from `init()`; no longer a
   * method on UI.prototype.
   */
  function bindGlobalSweep() {
    this.layerLockedIds  = new Set();
    this.layerSearchQ    = '';
    this.layerFilterType = 'all';
    this.layerFilterOpen = false;
    this.layerAddOpen    = false;
    this._lvlDblId       = null;
    this._lvlDblTime     = 0;
    // Phase 3 step 3 (Unit 1.9a): open/close lifecycle delegated to
    // modals/document-setup.js; both onclick handlers forward to
    // this.toggleSettingsPanel().
    if (typeof this._bindDocumentSetupHandlers === 'function') {
      this._bindDocumentSetupHandlers();
    }
    // Unit 1.9a: ~30 Document Setup input handlers (set-* inputs, paper
    // W/H, orientation, plotter physics, undo, machine-profile, etc.).
    if (typeof this.bindDocumentSetupListeners === 'function') {
      this.bindDocumentSetupListeners();
    }
    // Phase 3 step 2: grid-settings panel handlers delegated to
    // src/ui/modals/grid-settings.js.
    if (typeof this._bindGridSettingsHandlers === 'function') {
      this._bindGridSettingsHandlers();
    }
    // ── Unit 1.9b: per-satellite installers ────────────────────────
    if (typeof this.bindLayerListListeners === 'function') {
      this.bindLayerListListeners();
    }
    if (typeof this.bindBgColorListeners === 'function') {
      this.bindBgColorListeners();
    }
    if (typeof this.bindAlgoConfigListeners === 'function') {
      this.bindAlgoConfigListeners();
    }
    if (typeof this.bindThemeToggle === 'function') {
      this.bindThemeToggle();
    }
    if (typeof this.bindHeaderChromeListeners === 'function') {
      this.bindHeaderChromeListeners();
    }
    if (typeof this.bindExportButton === 'function') {
      this.bindExportButton();
    }
    if (typeof this.bindFileIoListeners === 'function') {
      this.bindFileIoListeners();
    }
  }

  function init(app) {
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const CONTROL_DEFS = (G.Vectura && G.Vectura.UI && G.Vectura.UI.CONTROL_DEFS) || {};

    this.app = app;
    this.controls = CONTROL_DEFS;
    this.modal = this.createModal();
    this._modalCleanup = null;
    this.openPenMenu = null;
    this.openPaletteMenu = null;
    this.inlinePetalDesigner = null;
    this.layerListOrder = [];
    this.lastLayerClickId = null;
    this.globalSectionCollapsed = false;
    this.armedPenId = null;
    this.activeTool = SETTINGS.activeTool || 'select';
    this.scissorMode = SETTINGS.scissorMode || 'line';
    this.penMode = SETTINGS.penMode || 'draw';
    this.shapeMode = SETTINGS.shapeMode || 'oval';
    this.spacePanActive = false;
    this.previousTool = this.activeTool;
    this.harmonographPlotterState = null;
    this.isApplyingAutoColorization = false;
    this.pendingAutoColorizationOptions = null;
    this.autoColorizationStatusEl = null;
    this.topMenuTriggers = [];
    this.openTopMenuTrigger = null;
    this.petalDesignerProfiles = [];
    this.petalDesignerProfilesLoaded = false;
    this.petalDesignerProfilesLoading = null;
    this.lastDrawableLayerType = null;
    this.exportModalState = null;

    this.initModuleDropdown();
    this.rememberDrawableLayerType(this.app.engine?.getActiveLayer?.());
    // Phase 3 step 3: mount Document Setup panel BEFORE initMachineDropdown
    // so #machine-profile (the paper-size <select>) is in the DOM when the
    // dropdown population logic runs. Markup formerly lived in
    // index.html:540-745.
    this._mountDocumentSetupPanel();
    this.initMachineDropdown();
    // Phase 3 step 2: mount Grid Settings panel into <main> before the
    // bindGlobal sweep wires the panel's controls. Markup formerly lived in
    // index.html:747-787.
    this._mountGridSettingsPanel();
    bindGlobalSweep.call(this);
    this.bindShortcuts();
    this.bindInfoButtons();
    // Phase 3 closure: activate the window-level drag-drop router.
    // Routes .vectura → openVecturaFile, .svg → importSvgFile.
    try {
      G.Vectura?.UI?.Menus?.DragDropRouter?.attach?.(this);
    } catch (_) { /* missing module is non-fatal */ }
    // Phase 4: surface indeterminate progress bar for engine.generate calls
    // that exceed ~200 ms (large algorithm regenerations).
    try {
      G.Vectura?.UI?.Menus?.EngineProgressTap?.attach?.(this);
    } catch (_) { /* missing module is non-fatal */ }
    this.initLeftPanelSections();
    this.initAboutSection();
    this.initAlgorithmTransformSection();
    this.initTouchModifierBar();
    this.initTouchMouseBridge();
    this.initTopMenuBar();
    // Popover-dismiss click handler — closes pen / palette / top-menu
    // popovers when the user clicks anywhere on the document. Kept inline
    // (rather than relocated to a satellite) because the closures it
    // references (this.openPenMenu, this.openPaletteMenu, this.setTopMenuOpen)
    // are co-located with the rest of the constructor's UI state.
    document.addEventListener('click', () => {
      if (this.openPenMenu) {
        this.openPenMenu.classList.add('hidden');
        this.openPenMenu = null;
      }
      if (this.openPaletteMenu) {
        this.openPaletteMenu.classList.add('hidden');
        this.openPaletteMenu = null;
      }
      this.setTopMenuOpen(null, false);
    });
    this.initPaneToggles();
    this.initBottomPaneToggle();
    this.initBottomPaneResizer();
    this.initPaneResizers();
    this.initToolBar();
    this.initRightPaneTabs();
    this.initPensSection();
    this.renderLayers();
    this.renderPens();
    this.initPaletteControls();
    this.initAutoColorizationPanel();
    this.buildControls();
    this.updateFormula();
    this.initSettingsValues();
    this.attachStaticInfoButtons();
  }

  // ── Orchestrator namespace ──────────────────────────────────────────
  // When loaded after `_ui-legacy.js` (production load order), Vectura.UI
  // IS the legacy class — a function. Alias it as `Orchestrator` so
  // callers preferring the explicit name reach the same constructor.
  // Then attach init/installOn (both as module-level exports and as
  // direct UI.prototype._init via installOn).
  //
  // When loaded standalone (compile-gate JSDOM test which loads ONLY this
  // file), Vectura.UI is the namespace-anchor object (no legacy class).
  // In that case Orchestrator is a placeholder constructor that throws —
  // the same trip-wire shape the step-5c blueprint had.
  let Orchestrator;
  if (typeof UI === 'function') {
    Orchestrator = UI;
  } else {
    class UIOrchestrator {
      constructor(_app) {
        throw new Error(
          'src/ui/ui.js: orchestrator entry loaded without _ui-legacy.js. ' +
          'Meridian Unit 1.9c migrated the constructor body here; the ' +
          'legacy class still hosts the runtime UI constructor. ' +
          'Ensure `<script src="./src/ui/_ui-legacy.js">` precedes ui.js in index.html.'
        );
      }
    }
    Orchestrator = UIOrchestrator;
  }

  Orchestrator.init = init;
  Orchestrator.installOn = function installOn(proto) {
    proto._init = function _init(app) { return init.call(this, app); };
  };

  // Install on the legacy UI.prototype if it exists. Idempotent — the
  // legacy class declares `constructor(app) { this._init(app); }` so the
  // delegation lands here. When loaded standalone (no legacy class),
  // Orchestrator is the placeholder and has no `.prototype` constructor
  // contract — skip the install to keep the trip-wire intact.
  if (typeof UI === 'function' && UI.prototype) {
    Orchestrator.installOn(UI.prototype);
  }

  // Expose under the explicit `.Orchestrator` name (used by the compile
  // gate and any caller that prefers the unambiguous reference).
  if (typeof UI === 'function') {
    UI.Orchestrator = Orchestrator;
  } else {
    UI.Orchestrator = Orchestrator;
  }
})();
