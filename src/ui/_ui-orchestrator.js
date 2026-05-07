/**
 * Vectura UI thin orchestrator (Phase 2 step 5c blueprint).
 *
 * STATUS: AUTHORED ALONGSIDE — NOT YET LOADED.
 *
 * This file is the target shape of `src/ui/ui.js` after Phase 2 step 6
 * finishes the index.html body rewrite + rename. It is intentionally NOT
 * referenced from index.html during step 5 to keep this sub-step
 * reversible (the legacy ui.js continues to drive the app). Step 6 will:
 *
 *   1. Move every surviving prototype method from legacy ui.js into the
 *      appropriate panels/shell/persistence/shortcuts module (or into
 *      newly minted satellite modules for anything that doesn't fit).
 *   2. Move every IIFE-local that any satellite still needs into the
 *      destination module's DI bag (or into a shared helper module).
 *   3. Rename legacy `src/ui/ui.js` → `src/ui/_ui-legacy.js`.
 *   4. Rename this file from `_ui-orchestrator.js` → `ui.js`.
 *   5. Update `index.html` to load the new `ui.js` (this file's contents)
 *      and drop `_ui-legacy.js` from the load list.
 *
 * Why a blueprint and not a working swap?
 * ----------------------------------------
 * Legacy ui.js is still ~9.4k lines because dozens of prototype methods
 * (modal management, file I/O wrappers, pen wiring, group/ungroup,
 * harmonograph plotter, layer settings modal, etc.) and many IIFE-local
 * helpers (`getAnchoredColorProxyInput`, `openColorPickerAnchoredTo`,
 * `escapeXmlAttr`, `normalizeSvgId`, `roundToStep`, `formatValue`,
 * `formatDisplayValue`, `getDisplayConfig`, `toDisplayValue`,
 * `fromDisplayValue`, `attachKeyboardRangeNudge`, `usesSeed`,
 * `IMAGE_NOISE_DEFAULT_AMPLITUDE`, all the `*_NOISE_DEFS` tables, etc.)
 * live there. Until those are migrated, the orchestrator is a forward
 * declaration only.
 *
 * Constructor wire-up that step 6 must preserve
 * ----------------------------------------------
 * The legacy constructor calls these init methods in this exact order
 * (any deviation has historically caused subtle paint/scroll bugs):
 *
 *     initModuleDropdown
 *     rememberDrawableLayerType(activeLayer)
 *     initMachineDropdown
 *     bindGlobal
 *     bindShortcuts             ← src/ui/shortcuts.js (Phase 2 step 5b)
 *     bindInfoButtons
 *     initLeftPanelSections
 *     initAboutSection
 *     initAlgorithmTransformSection
 *     initTouchModifierBar
 *     initTouchMouseBridge
 *     initTopMenuBar
 *     <document click handler that closes pen/palette menus>
 *     initPaneToggles            ← shell/workspace.js
 *     initBottomPaneToggle       ← shell/bottom-pane.js
 *     initBottomPaneResizer      ← shell/bottom-pane.js
 *     initPaneResizers           ← shell/workspace.js
 *     initToolBar                ← shell/toolbar.js
 *     initRightPaneTabs          ← shell/pane-right.js
 *     initPensSection
 *     renderLayers               ← panels/layers-panel.js
 *     renderPens                 ← panels/pens-panel.js
 *     initPaletteControls        ← panels/pens-panel.js
 *     initAutoColorizationPanel  ← panels/auto-colorize-panel.js (mixin shim)
 *     buildControls              ← panels/algo-config-panel.js
 *     updateFormula              ← panels/formula-panel.js
 *     initSettingsValues         ← persistence.js (applyPersistedSettings)
 *     attachStaticInfoButtons
 *
 * bind() block (must run before `new UI()` to inject closure-captured
 * IIFE locals into every satellite module). Current order in legacy
 * ui.js (preserve in step 6):
 *
 *     UI.AlgoConfigPanel.bind({...})        Phase 2 step 2
 *     UI.ThemeSwitcher.bind({getEl})        Phase 2 step 3
 *     UI.MenuBar.bind({getEl})              Phase 2 step 3
 *     UI.PaneLeft.bind({getEl})             Phase 2 step 3
 *     UI.PaneRight.bind({getEl})            Phase 2 step 3
 *     UI.Workspace.bind({getEl})            Phase 2 step 3
 *     UI.BottomPane.bind({getEl})           Phase 2 step 3
 *     UI.Toolbar.bind({getEl, isPetalisLayerType})         step 3
 *     UI.Header.bind({getEl, ALGO_DEFAULTS, MACHINES, SETTINGS})
 *     UI.FormulaPanel.bind({getEl, escapeHtml, usesSeed})
 *     UI.AutoColorizePanel.bind({})         step 4 (anchor; step 5+ moves DI)
 *     UI.NoiseRackPanel.bind({})            step 4 (anchor; step 5+ moves DI)
 *     UI.TransformPanel.bind({ALGO_DEFAULTS, TRANSFORM_KEYS, clone})
 *     UI.LayersPanel.bind({SETTINGS, escapeHtml})
 *     UI.PensPanel.bind({getEl, escapeHtml, SETTINGS, PALETTES, getThemeToken})
 *     UI.ModifiersPanel.bind({getEl})
 *     UI.AlgorithmPanel.bind({getEl, ALGO_DEFAULTS, MODIFIER_DEFAULTS, Algorithms})
 *     UI.Persistence.bind({getEl, SETTINGS, getContrastTextColor})  step 5a
 *     UI.Shortcuts.bind({getEl, SETTINGS, isPrimitiveShapeLayer})   step 5b
 *
 * Namespace preservation
 * ----------------------
 * Step 6 must keep the existing copy-forward shim that protects panel
 * registrations made BEFORE ui.js loads:
 *
 *     const _existingUI = window.Vectura.UI;
 *     window.Vectura.UI = UI;
 *     if (_existingUI && typeof _existingUI === 'object') {
 *       for (const _k of Object.keys(_existingUI)) {
 *         if (UI[_k] === undefined) UI[_k] = _existingUI[_k];
 *       }
 *     }
 *
 * Compile gate at tests/unit/ui-orchestrator-compile.test.js verifies the
 * blueprint parses cleanly in JSDOM and registers
 * window.Vectura.UI.Orchestrator.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  /**
   * Forward-declared thin UI class. Step 6 will populate the constructor
   * body with the bind() block + init-method dispatch (currently still in
   * legacy ui.js). For now this is a parse-only marker class so the file
   * is a valid script.
   */
  class UIOrchestrator {
    constructor(_app) {
      throw new Error(
        '_ui-orchestrator.js is a Phase 2 step 5c blueprint and not yet wired up. ' +
        'Phase 2 step 6 will swap legacy ui.js for this file.'
      );
    }
  }

  UI.Orchestrator = UIOrchestrator;
})();
