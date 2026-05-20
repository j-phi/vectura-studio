/*
 * Compile gate for src/ui/shell/pane-left.js (Phase 2 step 3 third extraction).
 *
 * The legacy left-panel section management methods lived inside the src/ui/ui.js
 * IIFE and closure-captured the IIFE-local `getEl` helper plus the `SETTINGS`
 * import from window.Vectura. After moving the bodies into pane-left.js as
 * window.Vectura.UI.PaneLeft.*, the legacy ui.js IIFE passes `getEl` in via
 * PaneLeft.bind(deps) during its own initialization.
 *
 * This compile gate proves:
 *
 * 1. The new file parses and loads cleanly under JSDOM.
 * 2. The expected contract surface is exposed (bind + 8 methods).
 * 3. Methods that require getEl throw a clear error before bind().
 * 4. After bind(deps), methods run without throwing when target elements are
 *    absent (silent early-return).
 * 5. Smoke test: initLeftPanelSections wires onclick handlers on section headers.
 *
 * Mirrors tests/unit/theme-switcher-compile.test.js and menubar-compile.test.js.
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

describe('pane-left compile gate', () => {
  let dom;
  let PaneLeft;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/pane-left.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    PaneLeft = w.Vectura.UI.PaneLeft;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.PaneLeft with bind + 8 methods', () => {
    expect(PaneLeft).toBeTruthy();
    expect(typeof PaneLeft.bind).toBe('function');
    expect(typeof PaneLeft.getLeftSectionDefaults).toBe('function');
    expect(typeof PaneLeft.getLeftSectionMap).toBe('function');
    expect(typeof PaneLeft.setLeftSectionCollapsed).toBe('function');
    expect(typeof PaneLeft.initLeftPanelSections).toBe('function');
    expect(typeof PaneLeft.setAlgorithmTransformCollapsed).toBe('function');
    expect(typeof PaneLeft.initAlgorithmTransformSection).toBe('function');
    expect(typeof PaneLeft.setAboutVisible).toBe('function');
    expect(typeof PaneLeft.initAboutSection).toBe('function');
  });

  it('getLeftSectionDefaults returns the expected shape without bind', () => {
    const defaults = PaneLeft.getLeftSectionDefaults.call({});
    expect(defaults).toEqual({
      algorithm: false,
      algorithmTransform: true,
      algorithmConfiguration: false,
    });
  });

  it('getLeftSectionMap throws a clear error before bind()', () => {
    expect(() => PaneLeft.getLeftSectionMap.call({})).toThrow(/PaneLeft\.getLeftSectionMap invoked before PaneLeft\.bind/);
  });

  it('setAlgorithmTransformCollapsed throws a clear error before bind()', () => {
    expect(() => PaneLeft.setAlgorithmTransformCollapsed.call({}, true)).toThrow(/PaneLeft\.setAlgorithmTransformCollapsed invoked before PaneLeft\.bind/);
  });

  it('initAboutSection throws a clear error before bind()', () => {
    expect(() => PaneLeft.initAboutSection.call({}, true)).toThrow(/PaneLeft\.initAboutSection invoked before PaneLeft\.bind/);
  });

  it('after bind(deps), methods run without throwing when target elements are absent', () => {
    const doc = dom.window.document;
    PaneLeft.bind({
      getEl: (id) => doc.getElementById(id),
    });

    // ctx mimics a UI instance with `app` and delegators that round-trip
    const ctx = {
      app: { persistPreferencesDebounced: () => {} },
      getLeftSectionDefaults: function () { return PaneLeft.getLeftSectionDefaults.call(this); },
      getLeftSectionMap: function () { return PaneLeft.getLeftSectionMap.call(this); },
      setLeftSectionCollapsed: function (...args) { return PaneLeft.setLeftSectionCollapsed.call(this, ...args); },
      setAlgorithmTransformCollapsed: function (...args) { return PaneLeft.setAlgorithmTransformCollapsed.call(this, ...args); },
      setAboutVisible: function (...args) { return PaneLeft.setAboutVisible.call(this, ...args); },
    };

    // All init methods should run without throwing (elements absent → early return)
    expect(() => PaneLeft.initLeftPanelSections.call(ctx)).not.toThrow();
    expect(() => PaneLeft.initAlgorithmTransformSection.call(ctx)).not.toThrow();
    expect(() => PaneLeft.initAboutSection.call(ctx)).not.toThrow();
  });

  it('initLeftPanelSections wires onclick on section headers', () => {
    const doc = dom.window.document;

    // Build a left-section-algorithm fixture
    const section = doc.createElement('div');
    section.id = 'left-section-algorithm';
    const header = doc.createElement('div');
    header.className = 'left-panel-section-header';
    const body = doc.createElement('div');
    body.className = 'left-panel-section-body';
    section.appendChild(header);
    section.appendChild(body);
    doc.body.appendChild(section);

    PaneLeft.bind({
      getEl: (id) => doc.getElementById(id),
    });

    // Ensure SETTINGS is initialized
    dom.window.Vectura.SETTINGS = {};

    const ctx = {
      app: { persistPreferencesDebounced: () => {} },
      getLeftSectionDefaults: function () { return PaneLeft.getLeftSectionDefaults.call(this); },
      getLeftSectionMap: function () { return PaneLeft.getLeftSectionMap.call(this); },
      setLeftSectionCollapsed: function (...args) { return PaneLeft.setLeftSectionCollapsed.call(this, ...args); },
    };

    PaneLeft.initLeftPanelSections.call(ctx);

    // Header should have gotten an onclick handler
    expect(header.onclick).toBeTypeOf('function');

    // Clicking the header should toggle collapsed state
    header.onclick();
    expect(section.classList.contains('collapsed')).toBe(true);
    header.onclick();
    expect(section.classList.contains('collapsed')).toBe(false);
  });

  it('setAboutVisible toggles display on #algo-about element', () => {
    const doc = dom.window.document;

    const about = doc.createElement('div');
    about.id = 'algo-about';
    doc.body.appendChild(about);

    PaneLeft.bind({
      getEl: (id) => doc.getElementById(id),
    });

    dom.window.Vectura.SETTINGS = {};

    const ctx = {
      app: { persistPreferencesDebounced: () => {} },
      getLeftSectionDefaults: function () { return PaneLeft.getLeftSectionDefaults.call(this); },
    };

    PaneLeft.setAboutVisible.call(ctx, false);
    expect(about.style.display).toBe('none');

    PaneLeft.setAboutVisible.call(ctx, true);
    expect(about.style.display).toBe('');

    // Cleanup
    doc.body.removeChild(about);
  });

  // Meridian Unit 1.9c: _showWelcomePanel moved from _ui-legacy.js
  it('installOn registers _showWelcomePanel on the UI prototype (Unit 1.9c)', () => {
    expect(typeof PaneLeft._showWelcomePanel).toBe('function');
    const proto = {};
    PaneLeft.installOn(proto);
    expect(typeof proto._showWelcomePanel).toBe('function');
  });

  it('_showWelcomePanel runs without throwing when DOM elements are absent', () => {
    const ctx = { app: { engine: { layers: [] } } };
    expect(() => PaneLeft._showWelcomePanel.call(ctx, true)).not.toThrow();
    expect(() => PaneLeft._showWelcomePanel.call(ctx, false)).not.toThrow();
  });
});
