/*
 * Compile gate for src/ui/panels/auto-colorize-panel.js (Phase 3 closure:
 * mixin dissolved into the panel module).
 *
 * After dissolution the panel:
 *   - exposes 4 implementation methods (initAutoColorizationPanel,
 *     getAutoColorizationConfig, getAutoColorizationTargets, applyAutoColorization)
 *   - exposes installOn(proto) that wires the 4 methods onto a prototype
 *   - reads SETTINGS / clamp / getEl from its bind() DI bag (no longer
 *     captured in a satellite IIFE)
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

describe('auto-colorize-panel compile gate (Phase 3 dissolved)', () => {
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

  it('exposes 4 methods + bind + installOn', () => {
    expect(AutoColorizePanel).toBeTruthy();
    expect(typeof AutoColorizePanel.bind).toBe('function');
    expect(typeof AutoColorizePanel.installOn).toBe('function');
    expect(typeof AutoColorizePanel.initAutoColorizationPanel).toBe('function');
    expect(typeof AutoColorizePanel.getAutoColorizationConfig).toBe('function');
    expect(typeof AutoColorizePanel.getAutoColorizationTargets).toBe('function');
    expect(typeof AutoColorizePanel.applyAutoColorization).toBe('function');
  });

  it('methods throw clear error before bind() is called', () => {
    // Reset DEPS by passing falsy then null-binding via fresh module load
    // not possible without reload — instead, after first init test we
    // exercise the post-bind path. Here verify the message shape on a
    // fresh load.
    const dom2 = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/auto-colorize-panel.js',
    ]);
    const Panel2 = dom2.window.Vectura.UI.AutoColorizePanel;
    expect(() => Panel2.getAutoColorizationConfig.call({}))
      .toThrow(/AutoColorizePanel\.getAutoColorizationConfig invoked before AutoColorizePanel\.bind/);
    dom2.window.close();
  });

  it('after bind(SETTINGS, clamp, getEl), getAutoColorizationConfig returns a defaulted config', () => {
    const settings = {};
    AutoColorizePanel.bind({
      SETTINGS: settings,
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      getEl: () => null,
    });
    const config = AutoColorizePanel.getAutoColorizationConfig.call({});
    expect(config).toBeTruthy();
    expect(config.enabled).toBe(false);
    expect(config.scope).toBe('all');
    expect(config.mode).toBe('none');
    expect(config.params.penStride).toBe(1);
    expect(settings.autoColorization).toBe(config);
  });

  it('initAutoColorizationPanel returns early when DOM missing (no throw)', () => {
    AutoColorizePanel.bind({
      SETTINGS: {},
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      getEl: () => null,
    });
    expect(() => AutoColorizePanel.initAutoColorizationPanel.call({})).not.toThrow();
  });

  it('installOn(proto) attaches 4 delegating methods', () => {
    const proto = {};
    AutoColorizePanel.installOn(proto);
    expect(typeof proto.initAutoColorizationPanel).toBe('function');
    expect(typeof proto.getAutoColorizationConfig).toBe('function');
    expect(typeof proto.getAutoColorizationTargets).toBe('function');
    expect(typeof proto.applyAutoColorization).toBe('function');
  });

  it('prototype delegators forward `this` to the panel impl', () => {
    const settings = {};
    AutoColorizePanel.bind({
      SETTINGS: settings,
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      getEl: () => null,
    });
    const proto = {};
    AutoColorizePanel.installOn(proto);
    const inst = Object.create(proto);
    const config = inst.getAutoColorizationConfig();
    expect(config).toBeTruthy();
    expect(settings.autoColorization).toBe(config);
  });
});
