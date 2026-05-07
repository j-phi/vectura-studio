/*
 * Compile gate for src/ui/panels/auto-colorize-panel.js (Phase 2 step 4).
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

describe('auto-colorize-panel compile gate', () => {
  let dom;
  let AutoColorizePanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/auto-colorize-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    AutoColorizePanel = w.Vectura.UI.AutoColorizePanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.AutoColorizePanel with bind + 4 methods', () => {
    expect(AutoColorizePanel).toBeTruthy();
    expect(typeof AutoColorizePanel.bind).toBe('function');
    expect(typeof AutoColorizePanel.initAutoColorizationPanel).toBe('function');
    expect(typeof AutoColorizePanel.getAutoColorizationConfig).toBe('function');
    expect(typeof AutoColorizePanel.getAutoColorizationTargets).toBe('function');
    expect(typeof AutoColorizePanel.applyAutoColorization).toBe('function');
  });

  it('initAutoColorizationPanel throws a clear error before bind()', () => {
    expect(() => AutoColorizePanel.initAutoColorizationPanel.call({}))
      .toThrow(/AutoColorizePanel\.initAutoColorizationPanel invoked before AutoColorizePanel\.bind/);
  });

  it('after bind(deps), methods are no-ops when mixin absent', () => {
    AutoColorizePanel.bind({});
    expect(() => AutoColorizePanel.initAutoColorizationPanel.call({})).not.toThrow();
    expect(AutoColorizePanel.getAutoColorizationConfig.call({})).toBe(null);
    expect(AutoColorizePanel.getAutoColorizationTargets.call({}, 'selected')).toEqual([]);
    expect(() => AutoColorizePanel.applyAutoColorization.call({}, {})).not.toThrow();
  });

  it('after bind(deps), methods delegate to mixin when present', () => {
    const w = dom.window;
    let initCalls = 0;
    let configCalls = 0;
    let targetsArg;
    let applyArg;
    w.Vectura._UIAutoColorizeMixin = {
      initAutoColorizationPanel() { initCalls += 1; },
      getAutoColorizationConfig() { configCalls += 1; return { enabled: true }; },
      getAutoColorizationTargets(scope) { targetsArg = scope; return ['a', 'b']; },
      applyAutoColorization(opts) { applyArg = opts; },
    };

    AutoColorizePanel.bind({});
    AutoColorizePanel.initAutoColorizationPanel.call({});
    expect(initCalls).toBe(1);
    expect(AutoColorizePanel.getAutoColorizationConfig.call({})).toEqual({ enabled: true });
    expect(AutoColorizePanel.getAutoColorizationTargets.call({}, 'all')).toEqual(['a', 'b']);
    expect(targetsArg).toBe('all');
    AutoColorizePanel.applyAutoColorization.call({}, { commit: true });
    expect(applyArg).toEqual({ commit: true });

    delete w.Vectura._UIAutoColorizeMixin;
  });
});
