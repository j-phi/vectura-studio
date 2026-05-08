/*
 * Compile gate for src/ui/shell/workspace.js (Phase 2 step 3 fifth extraction).
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

describe('workspace compile gate', () => {
  let dom;
  let Workspace;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/workspace.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    Workspace = w.Vectura.UI.Workspace;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Workspace with bind + 2 methods', () => {
    expect(Workspace).toBeTruthy();
    expect(typeof Workspace.bind).toBe('function');
    expect(typeof Workspace.initPaneToggles).toBe('function');
    expect(typeof Workspace.initPaneResizers).toBe('function');
  });

  it('initPaneToggles throws a clear error before bind()', () => {
    expect(() => Workspace.initPaneToggles.call({})).toThrow(/Workspace\.initPaneToggles invoked before Workspace\.bind/);
  });

  it('initPaneResizers throws a clear error before bind()', () => {
    expect(() => Workspace.initPaneResizers.call({})).toThrow(/Workspace\.initPaneResizers invoked before Workspace\.bind/);
  });

  it('after bind(deps), methods run without throwing when target elements are absent', () => {
    const doc = dom.window.document;
    Workspace.bind({
      getEl: (id) => doc.getElementById(id),
    });
    dom.window.Vectura.SETTINGS = {};

    const ctx = { app: { persistPreferencesDebounced: () => {} } };
    expect(() => Workspace.initPaneToggles.call(ctx)).not.toThrow();
    expect(() => Workspace.initPaneResizers.call(ctx)).not.toThrow();
  });

  it('initPaneToggles wires pane toggle buttons and sets expandPanes on ctx', () => {
    const doc = dom.window.document;

    // Build minimal fixture
    const leftPane = doc.createElement('div');
    leftPane.id = 'left-pane';
    doc.body.appendChild(leftPane);
    const rightPane = doc.createElement('div');
    rightPane.id = 'right-pane';
    doc.body.appendChild(rightPane);
    const leftBtn = doc.createElement('button');
    leftBtn.id = 'btn-pane-toggle-left';
    doc.body.appendChild(leftBtn);
    const rightBtn = doc.createElement('button');
    rightBtn.id = 'btn-pane-toggle-right';
    doc.body.appendChild(rightBtn);

    Workspace.bind({
      getEl: (id) => doc.getElementById(id),
    });

    const ctx = { app: { persistPreferencesDebounced: () => {} } };
    Workspace.initPaneToggles.call(ctx);

    // expandPanes should be set on ctx
    expect(typeof ctx.expandPanes).toBe('function');

    // Clicking left toggle should toggle pane-collapsed
    leftBtn.click();
    expect(leftPane.classList.contains('pane-collapsed')).toBe(true);
    leftBtn.click();
    expect(leftPane.classList.contains('pane-collapsed')).toBe(false);

    // Cleanup
    doc.body.removeChild(leftPane);
    doc.body.removeChild(rightPane);
    doc.body.removeChild(leftBtn);
    doc.body.removeChild(rightBtn);
  });
});
