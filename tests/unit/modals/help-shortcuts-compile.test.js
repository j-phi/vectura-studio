/*
 * Compile gate for src/ui/modals/help-shortcuts.js (Phase 3 — first modal).
 *
 * Verifies the help-shortcuts modal module:
 *   - registers as window.Vectura.UI.Modals.HelpShortcuts
 *   - exposes bind() + buildHelpContent + _applyHelpPlatform + openHelp
 *   - throws a clear error if any method is invoked before bind()
 *   - after bind(), buildHelpContent returns a string containing the
 *     7-tab help-wrap markup
 *   - _applyHelpPlatform mutates [data-mac] elements correctly when given
 *     a JSDOM root
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

describe('help-shortcuts modal compile gate', () => {
  let dom;
  let HelpShortcuts;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/ui/modals/help-shortcuts.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    HelpShortcuts = w.Vectura.UI.Modals.HelpShortcuts;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.HelpShortcuts with bind + 3 methods', () => {
    expect(HelpShortcuts).toBeTruthy();
    expect(typeof HelpShortcuts.bind).toBe('function');
    expect(typeof HelpShortcuts.buildHelpContent).toBe('function');
    expect(typeof HelpShortcuts._applyHelpPlatform).toBe('function');
    expect(typeof HelpShortcuts.openHelp).toBe('function');
  });

  it('buildHelpContent throws a clear error before bind()', () => {
    expect(() => HelpShortcuts.buildHelpContent.call({}))
      .toThrow(/HelpShortcuts\.buildHelpContent invoked before HelpShortcuts\.bind/);
  });

  it('_applyHelpPlatform throws a clear error before bind()', () => {
    const stubRoot = dom.window.document.createElement('div');
    expect(() => HelpShortcuts._applyHelpPlatform.call({}, stubRoot, 'mac'))
      .toThrow(/HelpShortcuts\._applyHelpPlatform invoked before HelpShortcuts\.bind/);
  });

  it('openHelp throws a clear error before bind()', () => {
    expect(() => HelpShortcuts.openHelp.call({}))
      .toThrow(/HelpShortcuts\.openHelp invoked before HelpShortcuts\.bind/);
  });

  it('after bind({}), buildHelpContent returns a string with all 7 tab buttons', () => {
    HelpShortcuts.bind({});
    const html = HelpShortcuts.buildHelpContent.call({});
    expect(typeof html).toBe('string');
    expect(html).toContain('class="help-wrap"');
    for (const tab of ['quickstart', 'algorithms', 'tools', 'canvas', 'layers', 'pen', 'fileexport']) {
      expect(html).toContain(`data-tab="${tab}"`);
      expect(html).toContain(`data-panel="${tab}"`);
    }
  });

  it('_applyHelpPlatform swaps text content of [data-mac] children', () => {
    HelpShortcuts.bind({});
    const root = dom.window.document.createElement('div');
    root.innerHTML = `
      <kbd data-mac="⌘" data-win="Ctrl">⌘</kbd>
      <button class="help-platform-btn" data-platform="mac">Mac</button>
      <button class="help-platform-btn" data-platform="win">Win</button>
    `;
    HelpShortcuts._applyHelpPlatform.call({}, root, 'win');
    expect(root.querySelector('kbd').textContent).toBe('Ctrl');
    expect(root.querySelector('[data-platform="win"]').classList.contains('active')).toBe(true);
    expect(root.querySelector('[data-platform="mac"]').classList.contains('active')).toBe(false);

    HelpShortcuts._applyHelpPlatform.call({}, root, 'mac');
    expect(root.querySelector('kbd').textContent).toBe('⌘');
    expect(root.querySelector('[data-platform="mac"]').classList.contains('active')).toBe(true);
  });
});
