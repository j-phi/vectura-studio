/*
 * Compile gate for src/ui/panels/noise-rack-panel.js (Phase 3 closure:
 * mixin dissolved into the panel module).
 *
 * After dissolution the panel:
 *   - exposes the full noise-rack method surface (~30 methods, formerly the
 *     _UINoiseRackMixin) directly on the panel namespace
 *   - exposes installOn(proto) that wires every method onto a prototype
 *   - reads ALGO_DEFAULTS / RandomizationUtils / AlgorithmUtils.clamp from
 *     window.Vectura at module init (so its compile gate must preload
 *     defaults.js + algorithm-utils.js before evaluating the panel)
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

describe('noise-rack-panel compile gate (Phase 3 dissolved)', () => {
  let dom;
  let NoiseRackPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/core/algorithm-utils.js',
      'src/ui/randomization-utils.js',
      'src/ui/panels/noise-rack-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    NoiseRackPanel = w.Vectura.UI.NoiseRackPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes NoiseRackPanel with bind + installOn + 9+ method surface', () => {
    expect(NoiseRackPanel).toBeTruthy();
    expect(typeof NoiseRackPanel.bind).toBe('function');
    expect(typeof NoiseRackPanel.installOn).toBe('function');
    expect(typeof NoiseRackPanel._buildNoiseRack).toBe('function');
    expect(typeof NoiseRackPanel.ensureWavetableNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureSpiralNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureRingsNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureTopoNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureFlowfieldNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensureGridNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensurePhyllaNoises).toBe('function');
    expect(typeof NoiseRackPanel.ensurePetalisDriftNoises).toBe('function');
    expect(typeof NoiseRackPanel.mountPetalisModifierNoiseRack).toBe('function');
    expect(typeof NoiseRackPanel.createWavetableNoise).toBe('function');
    expect(typeof NoiseRackPanel.getWavetableNoiseTemplates).toBe('function');
  });

  it('createWavetableNoise returns a noise template (this-bound to a stub UI)', () => {
    NoiseRackPanel.bind({});
    // createWavetableNoise calls this.getWavetableNoiseTemplates internally.
    // Bind this to an instance whose proto has installOn applied.
    const proto = {};
    NoiseRackPanel.installOn(proto);
    const stubUi = Object.create(proto);
    const noise = stubUi.createWavetableNoise(0);
    expect(noise).toBeTruthy();
    expect(typeof noise).toBe('object');
    expect(noise.type).toBeDefined();
  });

  it('installOn(proto) attaches all noise-rack methods to the prototype', () => {
    const proto = {};
    NoiseRackPanel.installOn(proto);
    // A representative subset:
    expect(typeof proto._buildNoiseRack).toBe('function');
    expect(typeof proto.ensureWavetableNoises).toBe('function');
    expect(typeof proto.ensureSpiralNoises).toBe('function');
    expect(typeof proto.createWavetableNoise).toBe('function');
    expect(typeof proto.mountPetalisModifierNoiseRack).toBe('function');
    expect(typeof proto.getWavetableNoiseTemplates).toBe('function');
  });

  it('prototype delegators forward `this` to the panel impl', () => {
    NoiseRackPanel.bind({});
    const proto = {};
    NoiseRackPanel.installOn(proto);
    const inst = Object.create(proto);
    const noise = inst.createWavetableNoise(0);
    expect(noise).toBeTruthy();
    expect(typeof noise).toBe('object');
  });
});
