/*
 * Compile gate for src/ui/shell/header.js (Phase 2 step 3 eighth extraction).
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

describe('header compile gate', () => {
  let dom;
  let Header;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/header.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    Header = w.Vectura.UI.Header;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Header with bind + 5 methods', () => {
    expect(Header).toBeTruthy();
    expect(typeof Header.bind).toBe('function');
    expect(typeof Header.initModuleDropdown).toBe('function');
    expect(typeof Header._buildModuleMenu).toBe('function');
    expect(typeof Header._showModuleMenu).toBe('function');
    expect(typeof Header._syncModuleDisplay).toBe('function');
    expect(typeof Header.initMachineDropdown).toBe('function');
  });

  it('initModuleDropdown throws a clear error before bind()', () => {
    expect(() => Header.initModuleDropdown.call({})).toThrow(/Header\.initModuleDropdown invoked before Header\.bind/);
  });

  it('initMachineDropdown throws a clear error before bind()', () => {
    expect(() => Header.initMachineDropdown.call({})).toThrow(/Header\.initMachineDropdown invoked before Header\.bind/);
  });

  it('after bind(deps), methods run without throwing when target elements are absent', () => {
    const doc = dom.window.document;
    const ALGO_DEFAULTS = dom.window.Vectura.ALGO_DEFAULTS || {};
    const MACHINES = dom.window.Vectura.MACHINES || {};
    const SETTINGS = dom.window.Vectura.SETTINGS || {};

    Header.bind({
      getEl: (id) => doc.getElementById(id),
      ALGO_DEFAULTS,
      MACHINES,
      SETTINGS,
    });

    const ctx = { _LVL_I: {}, _algoMenuColor: () => '' };
    expect(() => Header.initModuleDropdown.call(ctx)).not.toThrow();
    expect(() => Header.initMachineDropdown.call(ctx)).not.toThrow();
    expect(() => Header._syncModuleDisplay.call(ctx)).not.toThrow();
  });

  it('initModuleDropdown populates a select element with algorithm options', () => {
    const doc = dom.window.document;
    const select = doc.createElement('select');
    select.id = 'generator-module';
    doc.body.appendChild(select);

    const ALGO_DEFAULTS = {
      flowfield: { label: 'Flowfield' },
      boids: { label: 'Boids' },
      hidden: { label: 'Hidden', hidden: true },
    };

    Header.bind({
      getEl: (id) => doc.getElementById(id),
      ALGO_DEFAULTS,
      MACHINES: {},
      SETTINGS: {},
    });

    Header.initModuleDropdown.call({});

    // Should have 2 options (hidden is filtered)
    expect(select.options.length).toBe(2);
    // Sorted alphabetically: Boids then Flowfield
    expect(select.options[0].value).toBe('boids');
    expect(select.options[1].value).toBe('flowfield');

    doc.body.removeChild(select);
  });

  it('initMachineDropdown populates a select element with machine profiles', () => {
    const doc = dom.window.document;
    const select = doc.createElement('select');
    select.id = 'machine-profile';
    doc.body.appendChild(select);

    const MACHINES = {
      a4: { name: 'A4 Portrait' },
      letter: { name: 'US Letter' },
    };

    Header.bind({
      getEl: (id) => doc.getElementById(id),
      ALGO_DEFAULTS: {},
      MACHINES,
      SETTINGS: { paperSize: 'a4' },
    });

    Header.initMachineDropdown.call({});

    expect(select.options.length).toBe(2);
    expect(select.value).toBe('a4');

    doc.body.removeChild(select);
  });
});
