/*
 * Compile gate for src/ui/panels/algo-config-panel.js (Phase 2 step 2 extraction).
 *
 * The legacy buildControls() body lived inside the src/ui/ui.js IIFE, where
 * it freely closure-captured ~20 module-level constants (getEl, COMMON_CONTROLS,
 * OPTIMIZATION_STEPS, *_NOISE_DEFS, PETALIS_*_TYPES, *_PRESET_LIBRARY,
 * TRANSFORM_KEYS, IMAGE_NOISE_DEFAULT_AMPLITUDE) plus several window.Vectura.*
 * globals (ALGO_DEFAULTS, SETTINGS, DESCRIPTIONS, MODIFIER_DESCRIPTIONS).
 *
 * After moving the body to src/ui/panels/algo-config-panel.js as
 * window.Vectura.UI.AlgoConfigPanel.buildControls, the legacy ui.js IIFE
 * passes the closure-captured constants in via AlgoConfigPanel.bind(deps)
 * during its own initialization. If the wiring ever breaks — bind() is not
 * called, a dep is forgotten, the new file's destructuring drifts from the
 * old body's reference set — buildControls() throws on the very first call
 * with a clear ReferenceError. This compile gate proves:
 *
 * 1. The new file parses (Node already enforces this; we additionally load it
 *    into JSDOM to confirm browser semantics are clean).
 * 2. The expected contract surface is exposed:
 *    - window.Vectura.UI.AlgoConfigPanel.bind  (function)
 *    - window.Vectura.UI.AlgoConfigPanel.buildControls  (function)
 * 3. Calling buildControls before bind() yields the explicit error from
 *    requireDeps() (clear failure mode, not silent ReferenceError).
 * 4. Calling buildControls AFTER bind() with the same dep bag the legacy
 *    ui.js IIFE passes does NOT throw a ReferenceError on its destructuring
 *    line — even with a minimal `this` (no DOM container present, the body
 *    early-returns at `if (!container)`).
 *
 * Mirrors tests/unit/controls-registry-compile.test.js — same JSDOM harness,
 * same "ReferenceError on missing helper" guard pattern.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('algo-config-panel compile gate', () => {
  let dom;
  let AlgoConfigPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/algo-config-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    AlgoConfigPanel = w.Vectura.UI.AlgoConfigPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.AlgoConfigPanel with bind + buildControls', () => {
    expect(AlgoConfigPanel).toBeTruthy();
    expect(typeof AlgoConfigPanel.bind).toBe('function');
    expect(typeof AlgoConfigPanel.buildControls).toBe('function');
  });

  it('buildControls throws a clear error when bind() has not been called', () => {
    // Module-level DEPS is null at load time. requireDeps() should throw a
    // descriptive Error rather than a silent ReferenceError on destructuring.
    expect(() => AlgoConfigPanel.buildControls.call({})).toThrow(/AlgoConfigPanel\.buildControls invoked before AlgoConfigPanel\.bind/);
  });

  it('after bind(deps), buildControls destructures without ReferenceError on the deps line', () => {
    // Inject the same dep set the legacy ui.js IIFE passes.
    // Values can be sentinels — the test only proves destructuring succeeds and
    // the body advances past the prelude. The body early-returns at the first
    // `if (!container)` check because document has no `#dynamic-controls`.
    const noop = () => {};
    AlgoConfigPanel.bind({
      // constants & data
      COMMON_CONTROLS: [],
      OPTIMIZATION_STEPS: [],
      IMAGE_NOISE_DEFAULT_AMPLITUDE: 1.7,
      WAVE_NOISE_DEFS: [],
      RINGS_NOISE_DEFS: [],
      TOPO_NOISE_DEFS: [],
      FLOWFIELD_NOISE_DEFS: [],
      GRID_NOISE_DEFS: [],
      PHYLLA_NOISE_DEFS: [],
      PETALIS_DRIFT_NOISE_DEFS: [],
      PETALIS_MODIFIER_TYPES: [],
      PETALIS_PETAL_MODIFIER_TYPES: [],
      PETALIS_SHADING_TYPES: [],
      PETALIS_LINE_TYPES: [],
      PETALIS_PRESET_LIBRARY: [],
      TERRAIN_PRESET_LIBRARY: [],
      RINGS_PRESET_LIBRARY: [],
      TRANSFORM_KEYS: ['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation'],
      // DOM / value helpers
      getEl: () => null,
      escapeHtml: (s) => String(s || ''),
      roundToStep: (v) => v,
      clone: (o) => o,
      clamp: (v) => v,
      attachKeyboardRangeNudge: noop,
      formatValue: (v) => `${v}`,
      formatDisplayValue: (_def, v) => `${v}`,
      getDisplayConfig: () => ({}),
      toDisplayValue: (_def, v) => v,
      fromDisplayValue: (_def, v) => v,
      getContrastTextColor: () => '#fff',
      openColorPickerAnchoredTo: noop,
      // unit helpers
      getDocumentUnitLabel: () => 'mm',
      mmToDocumentUnits: (v) => v,
      documentUnitsToMm: (v) => v,
      // modifier / petalis factories & predicates
      isModifierLayer: () => false,
      isPetalisLayerType: () => false,
      createPetalisModifier: () => ({}),
      createPetalModifier: () => ({}),
      createPetalisShading: () => ({}),
    });
    // Minimal `this` shape — the early-return path needs only
    // captureLeftPanelScrollPosition() to succeed.
    const fakeUi = {
      captureLeftPanelScrollPosition: () => () => {},
    };
    expect(() => AlgoConfigPanel.buildControls.call(fakeUi)).not.toThrow();
  });

  // Meridian Unit 1.9b: bindAlgoConfigListeners moved from _ui-legacy.js bindGlobal
  it('installOn registers bindAlgoConfigListeners on the UI prototype (Unit 1.9b)', () => {
    expect(typeof AlgoConfigPanel.bindAlgoConfigListeners).toBe('function');
    const proto = {};
    AlgoConfigPanel.installOn(proto);
    expect(typeof proto.bindAlgoConfigListeners).toBe('function');
    expect(typeof proto.buildControls).toBe('function');
  });

  it('bindAlgoConfigListeners runs without throwing when target elements are absent', () => {
    // Reuse the bound dep bag from the previous test, then verify the new
    // installer is a no-op when none of its target IDs exist in the DOM.
    expect(() => AlgoConfigPanel.bindAlgoConfigListeners.call({})).not.toThrow();
  });
});
