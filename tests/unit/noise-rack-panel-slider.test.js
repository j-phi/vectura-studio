/*
 * Noise-rack range controls — UI.Slider migration (2026-07-11).
 *
 * RGR: every test here FAILS against the legacy hand-rolled
 * `<input type="range" class="w-full">` + .value-chip button + hidden
 * .value-input editor (different markup, no inline-editable chip, no
 * shared-component fill/halo plumbing) and passes after the migration to
 * the shared UI.Slider component.
 *
 * Semantics pinned:
 *   - live drag repaints the chip only; the noise param is written on release
 *     (change) with exactly one pushHistory per commit — the legacy
 *     oninput/onchange split.
 *   - dblclick resets to getNoiseDefault(...) with a history push.
 *   - chip edit commits the parsed value.
 *   - disabled noises disable both the range input and the chip.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

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

describe('noise-rack range controls ride UI.Slider', () => {
  let dom, window, document, NoiseRackPanel;

  beforeEach(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/core/utils.js',
      'src/core/algorithm-utils.js',
      'src/ui/randomization-utils.js',
      'src/ui/utils.js',
      'src/ui/motion.js',
      'src/ui/components/slider.js',
      'src/ui/panels/noise-rack-panel.js',
    ]);
    window = dom.window;
    document = window.document;
    NoiseRackPanel = window.Vectura.UI.NoiseRackPanel;
    NoiseRackPanel.bind({});
  });

  afterEach(() => dom?.window?.close?.());

  const DEFAULTS = { amplitude: 5, zoom: 0.02 };

  const mkUi = () => {
    const calls = { pushHistory: 0, regen: 0, store: 0, formula: 0, build: 0 };
    const proto = {};
    NoiseRackPanel.installOn(proto);
    const ui = Object.create(proto);
    ui.app = {
      pushHistory: () => { calls.pushHistory += 1; },
      regen: () => { calls.regen += 1; },
    };
    ui.storeLayerParams = () => { calls.store += 1; };
    ui.updateFormula = () => { calls.formula += 1; };
    ui.buildControls = () => { calls.build += 1; };
    ui.openModal = () => {};
    ui._calls = calls;
    return ui;
  };

  const mount = (ui, noise) => {
    const target = document.createElement('div');
    ui._buildNoiseRack(target, {
      layer: { id: 'L1', params: {} },
      noiseDefs: [
        { key: 'amplitude', label: 'Amplitude', type: 'range', min: 0, max: 20, step: 0.5 },
        { key: 'zoom', label: 'Zoom', type: 'range', min: 0, max: 1, step: 0.01 },
      ],
      noiseBase: { ...DEFAULTS },
      noiseTemplates: [],
      noises: [noise],
      assignNoiseStack: () => {},
      getNoiseDefault: (idx, key) => DEFAULTS[key],
      resetNoise: () => {},
      createNoise: () => ({}),
      label: 'Noise Rack',
      containerClass: 'noise-list',
    });
    return target;
  };

  const mkNoise = (over = {}) => ({
    id: 'noise-1', enabled: true, type: 'simplex', amplitude: 5, zoom: 0.02, ...over,
  });

  it('renders shared slider markup — no legacy w-full range / .value-chip / .value-input', () => {
    const target = mount(mkUi(), mkNoise());
    const rangeRows = target.querySelectorAll('.noise-control .slider-row');
    expect(rangeRows.length).toBe(2);
    expect(target.querySelector('.slider-row .sld-fx-wrap > .ctrl-slider')).toBeTruthy();
    expect(target.querySelector('.slider-row .slider-val')).toBeTruthy();
    expect(target.querySelector('input.w-full')).toBeFalsy();
    expect(target.querySelector('.value-chip')).toBeFalsy();
    expect(target.querySelector('.value-input')).toBeFalsy();
  });

  it('live drag repaints the chip only; release commits with one history push', () => {
    const ui = mkUi();
    const noise = mkNoise();
    const target = mount(ui, noise);
    const input = target.querySelector('input[data-noise-key="amplitude"]');
    const chip = input.closest('.slider-row').querySelector('.slider-val');

    input.value = '10';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(chip.value).toBe('10');
    expect(noise.amplitude).toBe(5); // not written during the drag
    expect(ui._calls.pushHistory).toBe(0);

    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(noise.amplitude).toBe(10);
    expect(ui._calls.pushHistory).toBe(1);
    expect(ui._calls.regen).toBe(1);
    expect(ui._calls.store).toBe(1);
    expect(ui._calls.formula).toBe(1);
  });

  it('dblclick resets to the noise default and pushes history', () => {
    const ui = mkUi();
    const noise = mkNoise({ amplitude: 17 });
    const target = mount(ui, noise);
    const input = target.querySelector('input[data-noise-key="amplitude"]');
    expect(+input.value).toBe(17);
    input.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(noise.amplitude).toBe(5);
    expect(+input.value).toBe(5);
    expect(ui._calls.pushHistory).toBe(1);
    expect(ui._calls.regen).toBe(1);
  });

  it('editing the chip commits the parsed value', () => {
    const ui = mkUi();
    const noise = mkNoise();
    const target = mount(ui, noise);
    const input = target.querySelector('input[data-noise-key="amplitude"]');
    const chip = input.closest('.slider-row').querySelector('.slider-val');
    chip.value = '7.5';
    chip.dispatchEvent(new window.Event('blur'));
    expect(noise.amplitude).toBe(7.5);
    expect(+input.value).toBe(7.5);
    expect(ui._calls.pushHistory).toBe(1);
    expect(ui._calls.regen).toBe(1);
  });

  it('a disabled noise disables both the range input and its chip', () => {
    const target = mount(mkUi(), mkNoise({ enabled: false }));
    const input = target.querySelector('input[data-noise-key="amplitude"]');
    const chip = input.closest('.slider-row').querySelector('.slider-val');
    expect(input.disabled).toBe(true);
    expect(chip.disabled).toBe(true);
    expect(chip.classList.contains('opacity-60')).toBe(true);
  });

  it('the per-noise Randomize button matches the app-wide dice affordance (⚄ + Surprise me title)', () => {
    const target = mount(mkUi(), mkNoise());
    const rand = target.querySelector('.noise-rand');
    expect(rand).toBeTruthy();
    expect(rand.textContent).toContain('⚄');
    expect(rand.getAttribute('title')).toMatch(/^Surprise me — /);
  });
});
