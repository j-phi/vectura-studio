/*
 * Compile gate for src/ui/shell/bottom-pane.js (Phase 2 step 3 sixth extraction).
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

describe('bottom-pane compile gate', () => {
  let dom;
  let BottomPane;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/bottom-pane.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    BottomPane = w.Vectura.UI.BottomPane;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.BottomPane with bind + 3 methods', () => {
    expect(BottomPane).toBeTruthy();
    expect(typeof BottomPane.bind).toBe('function');
    expect(typeof BottomPane.toggleSettingsPanel).toBe('function');
    expect(typeof BottomPane.initBottomPaneToggle).toBe('function');
    expect(typeof BottomPane.initBottomPaneResizer).toBe('function');
  });

  it('toggleSettingsPanel throws a clear error before bind()', () => {
    expect(() => BottomPane.toggleSettingsPanel.call({})).toThrow(/BottomPane\.toggleSettingsPanel invoked before BottomPane\.bind/);
  });

  it('initBottomPaneToggle throws a clear error before bind()', () => {
    expect(() => BottomPane.initBottomPaneToggle.call({})).toThrow(/BottomPane\.initBottomPaneToggle invoked before BottomPane\.bind/);
  });

  it('after bind(deps), methods run without throwing when target elements are absent', () => {
    const doc = dom.window.document;
    BottomPane.bind({
      getEl: (id) => doc.getElementById(id),
    });

    expect(() => BottomPane.toggleSettingsPanel.call({})).not.toThrow();
    expect(() => BottomPane.initBottomPaneToggle.call({})).not.toThrow();
    expect(() => BottomPane.initBottomPaneResizer.call({})).not.toThrow();
  });

  it('toggleSettingsPanel toggles .open class on #settings-panel', () => {
    const doc = dom.window.document;
    const panel = doc.createElement('div');
    panel.id = 'settings-panel';
    doc.body.appendChild(panel);

    BottomPane.bind({
      getEl: (id) => doc.getElementById(id),
    });

    BottomPane.toggleSettingsPanel.call({});
    expect(panel.classList.contains('open')).toBe(true);

    BottomPane.toggleSettingsPanel.call({});
    expect(panel.classList.contains('open')).toBe(false);

    // Force open
    BottomPane.toggleSettingsPanel.call({}, true);
    expect(panel.classList.contains('open')).toBe(true);

    // Force closed
    BottomPane.toggleSettingsPanel.call({}, false);
    expect(panel.classList.contains('open')).toBe(false);

    doc.body.removeChild(panel);
  });

  it('initBottomPaneToggle wires collapse toggle on button click', () => {
    const doc = dom.window.document;
    const bottomPane = doc.createElement('div');
    bottomPane.id = 'bottom-pane';
    doc.body.appendChild(bottomPane);
    const btn = doc.createElement('button');
    btn.id = 'btn-pane-toggle-bottom';
    doc.body.appendChild(btn);

    BottomPane.bind({
      getEl: (id) => doc.getElementById(id),
    });

    BottomPane.initBottomPaneToggle.call({});

    btn.click();
    expect(bottomPane.classList.contains('bottom-pane-collapsed')).toBe(true);
    btn.click();
    expect(bottomPane.classList.contains('bottom-pane-collapsed')).toBe(false);

    doc.body.removeChild(bottomPane);
    doc.body.removeChild(btn);
  });
});
