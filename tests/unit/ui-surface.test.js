/*
 * Consolidated UI namespace surface-area smoke test.
 *
 * Replaces the retired `tests/unit/*-compile.test.js` cluster (audit item
 * Tests-Red-1, 2026-05-20). Each compile-test previously booted its own
 * JSDOM, loaded one panel module in isolation, and asserted essentially
 * three things:
 *
 *   1. `window.Vectura.UI.<PanelName>` exists.
 *   2. It exposes a `.bind` function (and usually `.installOn`).
 *   3. The named methods on the panel are functions.
 *   4. Calling a method before `bind()` throws a clear, descriptive error
 *      (`<Panel>.<method> invoked before <Panel>.bind(...)`).
 *
 * The integration-side regression — "the satellite is reachable from the
 * real UI instance after bootstrap" — is already covered end-to-end by
 * `tests/integration/ui-bootstrap-panels.test.js`, which boots the full
 * runtime via `loadVecturaRuntime({ includeUi: true, includeApp: true })`
 * and then drives `new window.Vectura.App()` through the same code path
 * the browser uses. If a panel's `bind()` is never called or its
 * `installOn()` doesn't reach the prototype, the integration test fails
 * (no layer items render, formula is empty, toggles don't fire).
 *
 * What's preserved here, beyond the integration boot:
 *
 *   - A single, exhaustive allowlist of every `window.Vectura.UI.*`
 *     namespace we expect satellites to register. Adding a new panel
 *     means appending one entry to `EXPECTED_UI_SURFACE` below — and
 *     forgetting to register it will fail this test loudly.
 *   - The "throws before bind" guard pattern. Verified by loading one
 *     representative panel module in isolation (no DI bag) and confirming
 *     the descriptive error fires. We don't repeat this 25 times — the
 *     guard is identical across all `requireDeps()` callers and the
 *     pattern itself is what regresses, not per-panel wording.
 *   - The `installOn(proto)` prototype-installer contract: any panel
 *     that exposes `installOn` must, after a call, leave at least one
 *     function attached to the prototype argument. (Catches a class of
 *     refactor mistakes where `installOn` exists but writes nothing.)
 *
 * What's NOT covered here (intentional):
 *
 *   - Method-by-method "no-op when DOM absent" probes. The full-stack
 *     integration boot exercises every active code path with a real
 *     #layer-list / #pen-list / #algo-desc / etc. — synthetic
 *     "elements are absent" probes don't add coverage on top of that.
 *   - Algorithm-specific math (e.g. computeHarmonographPlotterData with
 *     a single pendulum). Algorithm logic is the engine's contract,
 *     not the UI panel's — engine unit tests own that surface.
 *   - Per-panel byte-exact constants (counts, factory shapes). The
 *     ControlDefsData byte-contract preserved verbatim in
 *     `tests/unit/control-defs-data.test.js`. The CONTROL_DEFS showIf
 *     ReferenceError sweep preserved verbatim in
 *     `tests/unit/controls-registry.test.js`. Both files predate this
 *     consolidation and are the canonical home for those assertions.
 *
 * Bottom line: this file is the single source of truth for "every UI
 * panel we expect to bootstrap and the satellite-wiring contract for
 * each one." When you add a new panel, register it here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/*
 * Allowlist of every UI satellite we expect a fully-booted runtime to
 * publish on `window.Vectura.UI`. Two shape rules:
 *
 *   - `methods`: each name must resolve to a function on the namespace
 *     after the full bootstrap completes.
 *   - `installOn`: when true, the namespace must expose `installOn`
 *     AND a fresh call against an empty `{}` prototype must attach at
 *     least one function to it.
 *
 * When you add a new panel:
 *   1. Append a row here with the namespace key and the methods you
 *      consider load-bearing for the bootstrap.
 *   2. If your panel uses the installOn(proto) wiring pattern, set
 *      `installOn: true`.
 */
const EXPECTED_UI_SURFACE = [
  // Panels (src/ui/panels/*.js)
  { name: 'AlgoConfigPanel', methods: ['buildControls', 'bindAlgoConfigListeners', 'toggleSeedControls'], installOn: true },
  { name: 'AlgorithmPanel', methods: ['syncPrimaryModuleDropdown', 'isModifierType', 'isDrawableLayerType', 'rememberDrawableLayerType', 'getPreferredNewLayerType', 'computeHarmonographPlotterData', 'mountHarmonographPlotter', 'applyScissor', 'splitShapeLayer'], installOn: true },
  { name: 'AutoColorizePanel', methods: ['initAutoColorizationPanel', 'getAutoColorizationConfig', 'getAutoColorizationTargets', 'applyAutoColorization'], installOn: true },
  // ControlDefsData is a pure data namespace (no DI bag), so we skip bind/installOn.
  { name: 'ControlDefsData', methods: ['cloneNoiseDef', 'createPetalisModifier', 'createPetalModifier', 'createPetalisShading'], installOn: false, dataOnly: true },
  { name: 'FormulaPanel', methods: ['updateFormula'], installOn: true },
  { name: 'LayersPanel', methods: ['renderLayers', 'createManualLayerFromPath', 'bindLayerListListeners', 'recenterLayerIfNeeded', 'getLayerById', 'isModifierLayer', 'getModifierState'], installOn: true },
  { name: 'ModifiersPanel', methods: ['refreshModifierLayer', 'ensureLayerMaskState', 'setLayerMaskEnabled', 'updatePrimaryPanelMode'], installOn: true },
  { name: 'NoiseRackPanel', methods: ['createWavetableNoise'], installOn: true },
  { name: 'PensPanel', methods: ['renderPens', 'getPenById', 'applyArmedPenToLayers', 'refreshArmedPenUI', 'getPaletteList', 'getActivePalette'], installOn: true },
  { name: 'TransformPanel', methods: ['getDefaultTransformForType', 'storeLayerParams', 'restoreLayerParams'], installOn: true },

  // Shell (src/ui/shell/*.js)
  { name: 'BottomPane', methods: ['toggleSettingsPanel', 'initBottomPaneToggle'], installOn: true },
  { name: 'Header', methods: ['initModuleDropdown', 'initMachineDropdown', 'bindHeaderChromeListeners'], installOn: true },
  { name: 'MenuBar', methods: ['initTopMenuBar', 'triggerTopMenuAction', 'setTopMenuOpen'], installOn: true },
  { name: 'PaneLeft', methods: ['getLeftSectionDefaults', 'getLeftSectionMap', 'setAlgorithmTransformCollapsed', 'initAboutSection', 'initLeftPanelSections', 'setAboutVisible'], installOn: true },
  { name: 'PaneRight', methods: ['initRightPaneTabs', 'initPensSection'], installOn: true },
  { name: 'ThemeSwitcher', methods: ['refreshThemeUi', 'bindThemeToggle'], installOn: true },
  { name: 'Toolbar', methods: ['initToolBar', 'updateLightSourceTool', 'startLightSourcePlacement'], installOn: true },
  { name: 'Workspace', methods: ['initPaneToggles', 'initPaneResizers'], installOn: true },

  // Standalone UI modules
  { name: 'FileIO', methods: ['bindFileIoListeners'], installOn: true },
  { name: 'Persistence', methods: ['applyPersistedSettings', 'captureLeftPanelScrollPosition', 'scrollLayerToTop'], installOn: false },
  { name: 'Shortcuts', methods: ['bindShortcuts', 'handleTopMenuShortcut'], installOn: true },

  // Orchestrator entry (UI class itself, aliased)
  // UI === UI.Orchestrator after Meridian Unit 1.10. Asserted separately.
];

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('UI namespace surface area (replaces *-compile.test.js cluster)', () => {
  let runtime;
  let window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    window = runtime.window;
    // Bootstrap the app so every satellite's bind() + installOn() fires.
    // ui-bootstrap-panels.test.js does the same; we mirror it here so the
    // surface we assert below matches the surface a real boot produces.
    window.app = new window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  it('publishes window.Vectura.UI as the orchestrator class with Orchestrator alias', () => {
    const UI = window.Vectura.UI;
    expect(UI).toBeTruthy();
    expect(typeof UI).toBe('function');
    expect(UI.Orchestrator).toBe(UI);
    expect(typeof UI.init).toBe('function');
    expect(typeof UI.installOn).toBe('function');
    expect(typeof UI.prototype._init).toBe('function');
  });

  describe.each(EXPECTED_UI_SURFACE)('UI.$name', ({ name, methods, installOn, dataOnly }) => {
    it(`is registered on window.Vectura.UI`, () => {
      const ns = window.Vectura.UI[name];
      expect(ns, `window.Vectura.UI.${name} missing — satellite not loaded or registration regressed`).toBeTruthy();
    });

    if (!dataOnly) {
      it(`exposes a bind() function`, () => {
        expect(typeof window.Vectura.UI[name].bind).toBe('function');
      });
    }

    if (installOn) {
      it(`exposes an installOn() that attaches at least one function to the prototype`, () => {
        const ns = window.Vectura.UI[name];
        expect(typeof ns.installOn).toBe('function');
        const proto = {};
        ns.installOn(proto);
        const installed = Object.keys(proto).filter((k) => typeof proto[k] === 'function');
        expect(
          installed.length,
          `${name}.installOn(proto) attached zero functions — wiring is dead`,
        ).toBeGreaterThan(0);
      });
    }

    it.each(methods)(`.%s is a function`, (method) => {
      const ns = window.Vectura.UI[name];
      expect(
        typeof ns[method],
        `${name}.${method} is ${typeof ns[method]} — method missing from satellite surface`,
      ).toBe('function');
    });
  });

  it('reaches every panel namespace from the live app.ui instance prototype chain', () => {
    // Sanity check: a few load-bearing methods that installOn() wires onto
    // UI.prototype should be callable from app.ui. If installOn never ran
    // (e.g. a satellite's IIFE silently failed), this catches it.
    const ui = window.app.ui;
    expect(typeof ui.renderLayers).toBe('function');
    expect(typeof ui.buildControls).toBe('function');
    expect(typeof ui.updateFormula).toBe('function');
    expect(typeof ui.refreshThemeUi).toBe('function');
    expect(typeof ui.bindShortcuts).toBe('function');
    expect(typeof ui.bindFileIoListeners).toBe('function');
  });
});

describe('UI satellite throw-before-bind guard (single representative probe)', () => {
  // Loads LayersPanel in isolation — no DI bag, no app boot. Asserts the
  // requireDeps() guard produces a descriptive error rather than a silent
  // ReferenceError. Every panel that uses requireDeps() shares this guard
  // verbatim; repeating the assertion per-panel adds no coverage.
  let dom;

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
      runScripts: 'outside-only',
    });
    const ctx = dom.getInternalVMContext();
    for (const rel of ['src/config/defaults.js', 'src/ui/panels/layers-panel.js']) {
      const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      vm.runInContext(code, ctx, { filename: rel });
    }
  });

  afterAll(() => dom?.window?.close?.());

  it('LayersPanel.renderLayers throws a clear, descriptive error before bind()', () => {
    const Panel = dom.window.Vectura.UI.LayersPanel;
    expect(() => Panel.renderLayers.call({})).toThrow(
      /LayersPanel\.renderLayers invoked before LayersPanel\.bind/,
    );
  });
});
