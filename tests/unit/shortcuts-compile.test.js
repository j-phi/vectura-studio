/*
 * Compile gate for src/ui/shortcuts.js (Phase 2 step 5b).
 *
 * Verifies the shortcuts module:
 *   - registers as window.Vectura.UI.Shortcuts
 *   - exposes bind() + bindShortcuts + handleTopMenuShortcut methods
 *   - throws a clear error if bindShortcuts is invoked before bind()
 *   - handleTopMenuShortcut returns false for unmatched events
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

describe('shortcuts compile gate', () => {
  let dom;
  let Shortcuts;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/ui/shortcuts.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    Shortcuts = w.Vectura.UI.Shortcuts;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Shortcuts with bind + 2 methods', () => {
    expect(Shortcuts).toBeTruthy();
    expect(typeof Shortcuts.bind).toBe('function');
    expect(typeof Shortcuts.bindShortcuts).toBe('function');
    expect(typeof Shortcuts.handleTopMenuShortcut).toBe('function');
  });

  it('bindShortcuts throws a clear error before bind()', () => {
    expect(() => Shortcuts.bindShortcuts.call({}))
      .toThrow(/Shortcuts\.bindShortcuts invoked before Shortcuts\.bind/);
  });

  it('handleTopMenuShortcut throws a clear error before bind()', () => {
    expect(() => Shortcuts.handleTopMenuShortcut.call({}, { key: 'a' }))
      .toThrow(/Shortcuts\.handleTopMenuShortcut invoked before Shortcuts\.bind/);
  });

  it('after bind(deps), handleTopMenuShortcut returns false for unmatched events', () => {
    Shortcuts.bind({
      getEl: () => null,
      SETTINGS: {},
      isPrimitiveShapeLayer: () => false,
    });
    const ctx = {
      triggerTopMenuAction: () => false,
      toggleSettingsPanel: () => {},
      setTopMenuOpen: () => {},
      openHelp: () => {},
    };
    // No modifier / unmatched key — must return false (not throw).
    expect(Shortcuts.handleTopMenuShortcut.call(ctx, { key: 'q', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })).toBe(false);
  });
});
