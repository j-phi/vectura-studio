/*
 * Compile gate for src/ui/shell/theme-switcher.js (Phase 2 step 3 first extraction).
 *
 * The legacy refreshThemeUi() body lived inside the src/ui/ui.js IIFE and
 * closure-captured the IIFE-local `getEl` helper plus the `SETTINGS` import
 * from window.Vectura. After moving the body into theme-switcher.js as
 * window.Vectura.UI.ThemeSwitcher.refreshThemeUi, the legacy ui.js IIFE passes
 * `getEl` in via ThemeSwitcher.bind(deps) during its own initialization. If
 * the wiring ever breaks — bind() not called, getEl forgotten, the new file
 * destructure drifts — refreshThemeUi() throws on the very first call with a
 * clear ReferenceError. This compile gate proves:
 *
 * 1. The new file parses (Node enforces this; we additionally load it into
 *    JSDOM to confirm browser semantics are clean).
 * 2. The expected contract surface is exposed:
 *    - window.Vectura.UI.ThemeSwitcher.bind  (function)
 *    - window.Vectura.UI.ThemeSwitcher.refreshThemeUi  (function)
 * 3. Calling refreshThemeUi before bind() yields the explicit error from
 *    requireDeps() (clear failure mode, not silent ReferenceError).
 * 4. Calling refreshThemeUi AFTER bind() with the same dep bag the legacy
 *    ui.js IIFE passes does NOT throw — even with no `#theme-toggle` /
 *    `#inp-bg-color` elements present in the JSDOM document, since the body
 *    silently skips when getEl returns null.
 *
 * Mirrors tests/unit/algo-config-panel-compile.test.js — same JSDOM harness,
 * same "clear failure mode before bind" guard pattern.
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

describe('theme-switcher compile gate', () => {
  let dom;
  let ThemeSwitcher;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/theme-switcher.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    ThemeSwitcher = w.Vectura.UI.ThemeSwitcher;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.ThemeSwitcher with bind + refreshThemeUi', () => {
    expect(ThemeSwitcher).toBeTruthy();
    expect(typeof ThemeSwitcher.bind).toBe('function');
    expect(typeof ThemeSwitcher.refreshThemeUi).toBe('function');
  });

  it('refreshThemeUi throws a clear error when bind() has not been called', () => {
    expect(() => ThemeSwitcher.refreshThemeUi.call({})).toThrow(/ThemeSwitcher\.refreshThemeUi invoked before ThemeSwitcher\.bind/);
  });

  it('after bind(deps), refreshThemeUi runs without throwing when target elements are absent', () => {
    // Inject the same dep set the legacy ui.js IIFE passes: just `getEl`.
    // With no #theme-toggle / #inp-bg-color in the JSDOM document, getEl
    // returns null for both and refreshThemeUi early-skips both branches.
    ThemeSwitcher.bind({
      getEl: (id) => dom.window.document.getElementById(id),
    });
    expect(() => ThemeSwitcher.refreshThemeUi.call({})).not.toThrow();
  });

  it('after bind(deps), refreshThemeUi writes aria-pressed/aria-label/title/dataset.activeIcon onto the toggle element', () => {
    // Provide the elements the body looks for, then assert it mutates them
    // exactly as the legacy body did. This is the smoke test that proves the
    // verbatim extraction preserves observable behavior.
    const doc = dom.window.document;
    let toggle = doc.getElementById('theme-toggle');
    if (!toggle) {
      toggle = doc.createElement('button');
      toggle.id = 'theme-toggle';
      doc.body.appendChild(toggle);
    }
    let bgInput = doc.getElementById('inp-bg-color');
    if (!bgInput) {
      bgInput = doc.createElement('input');
      bgInput.type = 'color';
      bgInput.id = 'inp-bg-color';
      doc.body.appendChild(bgInput);
    }

    // Force a known SETTINGS shape on the JSDOM Vectura namespace, then run.
    dom.window.Vectura.SETTINGS = { uiTheme: 'light', bgColor: '#abcdef' };
    ThemeSwitcher.bind({
      getEl: (id) => doc.getElementById(id),
    });
    ThemeSwitcher.refreshThemeUi.call({});

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Switch to Dark theme');
    expect(toggle.title).toBe('Switch to Dark theme');
    expect(toggle.dataset.activeIcon).toBe('light');
    expect(bgInput.value).toBe('#abcdef');
  });

  // Meridian Unit 1.9b: bindThemeToggle moved from _ui-legacy.js bindGlobal
  it('installOn registers bindThemeToggle on the UI prototype (Unit 1.9b)', () => {
    expect(typeof ThemeSwitcher.bindThemeToggle).toBe('function');
    const proto = {};
    ThemeSwitcher.installOn(proto);
    expect(typeof proto.bindThemeToggle).toBe('function');
    expect(typeof proto.refreshThemeUi).toBe('function');
  });

  it('bindThemeToggle is a no-op when #theme-toggle is absent', () => {
    // bind() was called above; rebind with getEl that always returns null.
    ThemeSwitcher.bind({ getEl: () => null });
    expect(() => ThemeSwitcher.bindThemeToggle.call({})).not.toThrow();
  });
});
