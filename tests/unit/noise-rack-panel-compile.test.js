/*
 * Compile gate for src/ui/panels/noise-rack-panel.js (Phase 2 step 4).
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

describe('noise-rack-panel compile gate', () => {
  let dom;
  let NoiseRackPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/noise-rack-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    NoiseRackPanel = w.Vectura.UI.NoiseRackPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.NoiseRackPanel with bind + 9 methods', () => {
    expect(NoiseRackPanel).toBeTruthy();
    expect(typeof NoiseRackPanel.bind).toBe('function');
    expect(typeof NoiseRackPanel._buildNoiseRack).toBe('function');
    expect(typeof NoiseRackPanel.ensureWavetableNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureSpiralNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureRingsNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureTopoNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureFlowfieldNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureGridNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensurePhyllaNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensurePetalisDriftNoises).toBe('function');
  });

  it('_buildNoiseRack throws a clear error before bind()', () => {
    expect(() => NoiseRackPanel._buildNoiseRack.call({}))
      .toThrow(/NoiseRackPanel\._buildNoiseRack invoked before NoiseRackPanel\.bind/);
  });

  it('after bind(deps), methods are no-ops when mixin absent', () => {
    NoiseRackPanel.bind({});
    expect(() => NoiseRackPanel._buildNoiseRack.call({}, null, {})).not.toThrow();
    expect(() => NoiseRackPanel.ensureWavetableNoises.call({}, {})).not.toThrow();
    expect(() => NoiseRackPanel.ensureSpiralNoises.call({}, {})).not.toThrow();
    expect(() => NoiseRackPanel.ensureRingsNoises.call({}, {})).not.toThrow();
  });

  it('after bind(deps), methods delegate to mixin when present', () => {
    const w = dom.window;
    let buildCalls = 0;
    let layerArg;
    w.Vectura._UINoiseRackMixin = {
      _buildNoiseRack(target, opts) { buildCalls += 1; },
      ensureWavetableNoises(layer) { layerArg = layer; return 'wavetable-ok'; },
    };

    NoiseRackPanel.bind({});
    NoiseRackPanel._buildNoiseRack.call({}, null, {});
    expect(buildCalls).toBe(1);
    const layer = { id: 'L1' };
    expect(NoiseRackPanel.ensureWavetableNoises.call({}, layer)).toBe('wavetable-ok');
    expect(layerArg).toBe(layer);

    delete w.Vectura._UINoiseRackMixin;
  });
});
