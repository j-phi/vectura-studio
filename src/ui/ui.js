/**
 * Vectura UI orchestrator (Phase 2 step 6 — runtime entry).
 *
 * This file is the script `index.html` loads as `./src/ui/ui.js`. It is
 * the thin "entry point" referenced by `App` (which destructures `UI`
 * from `window.Vectura` at script-load time and calls `new UI(this)`
 * from `App`'s constructor when the `load` event fires).
 *
 * Migration shape: option (b) — legacy satellite
 * ----------------------------------------------
 * Per `docs/design/meridian-migration-plan.md` §"Resuming Phase 2 step 6",
 * step 6 had two viable shapes:
 *
 *   (a) finish migrating the ~50 surviving prototype methods + ~30 IIFE
 *       locals out of legacy `ui.js` into satellite modules first, so
 *       the new `ui.js` is truly ~600 LOC; OR
 *   (b) carry `_ui-legacy.js` as a satellite that exposes the legacy
 *       `UI` constructor and prototype to the orchestrator while the
 *       residual extraction happens incrementally over later
 *       steps/phases.
 *
 * Step 6 chose (b). Reason: option (a) would have required moving (and
 * exposing-via-DI-bag) the modal manager, file I/O wrappers, pen
 * wiring, group/ungroup, harmonograph plotter, layer settings modal,
 * scissor / algo-draw / manual layer creation, expand/split layer, AND
 * ~30 IIFE-local helpers (`getAnchoredColorProxyInput`,
 * `openColorPickerAnchoredTo`, `escapeXmlAttr`, `normalizeSvgId`,
 * `roundToStep`, `formatValue`, `formatDisplayValue`,
 * `getDisplayConfig`, `toDisplayValue`, `fromDisplayValue`,
 * `attachKeyboardRangeNudge`, `usesSeed`,
 * `IMAGE_NOISE_DEFAULT_AMPLITUDE`, the giant `*_NOISE_DEFS` tables,
 * etc.) into a shared helper module. That extraction is a multi-step
 * effort in its own right and would have ballooned step 6 well past
 * its budget. The plan explicitly permits (b) "as a pragmatic fallback
 * if the residual extraction is bigger than budget."
 *
 * What this means concretely
 * --------------------------
 *   - `src/ui/_ui-legacy.js` is loaded by `index.html` BEFORE this
 *     file. Its IIFE declares `class UI`, attaches every prototype
 *     mixin (`_UITouchMixin`, `_UIDocumentUnitsMixin`,
 *     `_UIRandomizationMixin`, `_UIPatternDesignerMixin`,
 *     `_UIPetalDesignerMixin`, `_UINoiseRackMixin`, `_UIFileIOMixin`,
 *     `_UIAutoColorizeMixin`), runs every satellite `.bind()` call
 *     (AlgoConfigPanel, ThemeSwitcher, MenuBar, PaneLeft, PaneRight,
 *     Workspace, BottomPane, Toolbar, Header, FormulaPanel,
 *     AutoColorizePanel, NoiseRackPanel, TransformPanel, LayersPanel,
 *     PensPanel, ModifiersPanel, AlgorithmPanel, Persistence,
 *     Shortcuts), and registers `window.Vectura.UI = UI` via the
 *     namespace-preservation shim that forwards every Phase-1/2
 *     namespace member already attached (`CONTROL_DEFS`,
 *     `AlgoConfigPanel`, `Slider`, etc.) onto the class.
 *   - By the time `index.html` reaches THIS script,
 *     `window.Vectura.UI` is already the legacy `class UI` constructor
 *     with all panels + shell modules wired in.
 *   - `App` (which loads AFTER this file) does
 *     `const { UI } = window.Vectura` and `new UI(this)` — that picks
 *     up the legacy class through this entry-point file's namespace.
 *
 * Constructor wire-up — where it actually lives
 * ---------------------------------------------
 * The init-method dispatch (28 calls) and the `bind()` block (19
 * binds) documented in the step-5c blueprint JSDoc still live in
 * `_ui-legacy.js`'s IIFE. The orchestrator entry below does NOT
 * duplicate them: when `new UI(app)` is invoked from `App`, JavaScript
 * lands on the legacy `class UI` because `window.Vectura.UI` was
 * assigned to it by `_ui-legacy.js` BEFORE this file loaded. We
 * additionally expose `window.Vectura.UI.Orchestrator` so the
 * compile-gate test (and future plan steps that prefer the explicit
 * name) can reach it without poking at `Vectura.UI` directly.
 *
 * What changes for step 7 / Phase 3
 * ---------------------------------
 *   - Step 7 (renderer token cache) is independent — does not touch
 *     this file or `_ui-legacy.js`.
 *   - Phase 3 modal/overlay extraction will start dissolving the
 *     residual IIFE locals + prototype methods. Each extraction
 *     shrinks `_ui-legacy.js` and moves its corresponding `bind()`
 *     call out of legacy. When all IIFE locals are exposed via shared
 *     helpers and all prototype methods are in panels/shell modules,
 *     this file can be promoted to a true ~600-LOC orchestrator that
 *     owns the bind() block and the init dispatch directly. Until
 *     then, it is an entry marker that documents the satellite
 *     arrangement.
 *
 * Namespace preservation shim — load-bearing, lives in `_ui-legacy.js`
 * --------------------------------------------------------------------
 *   const _existingUI = window.Vectura.UI;
 *   window.Vectura.UI = UI;
 *   if (_existingUI && typeof _existingUI === 'object') {
 *     for (const _k of Object.keys(_existingUI)) {
 *       if (UI[_k] === undefined) UI[_k] = _existingUI[_k];
 *     }
 *   }
 *
 * That copy-forward MUST NOT be duplicated here. Running it again
 * would be a silent no-op AND would mask any future regression where
 * legacy fails to register the class.
 *
 * Compile gate at `tests/unit/ui-orchestrator-compile.test.js`
 * verifies this file parses cleanly in JSDOM and registers
 * `window.Vectura.UI.Orchestrator`.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  // When loaded after `_ui-legacy.js` (the production load order in
  // index.html), `Vectura.UI` IS the legacy class — a function. Expose
  // it under `.Orchestrator` so callers preferring the explicit name
  // can reach it. The runtime entry is the legacy class itself, called
  // via `new UI(app)` from App; this assignment is purely an alias.
  //
  // When loaded standalone (compile-gate JSDOM test which loads ONLY
  // this file), `Vectura.UI` is the namespace-anchor object (no legacy
  // class). In that case `Orchestrator` is a placeholder constructor
  // that throws on instantiation — the same trip-wire shape the
  // step-5c blueprint had, so the compile-gate test continues to
  // assert that constructing a stand-alone orchestrator fails clearly.
  if (typeof UI === 'function') {
    UI.Orchestrator = UI;
  } else {
    class UIOrchestrator {
      constructor(_app) {
        throw new Error(
          'src/ui/ui.js: orchestrator entry loaded without _ui-legacy.js. ' +
          'Step 6 chose option (b) — legacy carries the runtime UI class. ' +
          'Ensure `<script src="./src/ui/_ui-legacy.js">` precedes ui.js in index.html.'
        );
      }
    }
    UI.Orchestrator = UIOrchestrator;
  }
})();
