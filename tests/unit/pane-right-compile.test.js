/*
 * Compile gate for src/ui/shell/pane-right.js (Phase 2 step 3 fourth extraction).
 *
 * Mirrors pane-left-compile.test.js. Proves:
 * 1. The new file parses and loads cleanly under JSDOM.
 * 2. The expected contract surface is exposed (bind + 2 methods).
 * 3. Methods throw a clear error before bind().
 * 4. After bind(deps), methods run without throwing when target elements are absent.
 * 5. Smoke test: initRightPaneTabs wires click handlers on tab elements.
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

describe('pane-right compile gate', () => {
  let dom;
  let PaneRight;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/shell/pane-right.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    PaneRight = w.Vectura.UI.PaneRight;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.PaneRight with bind + 2 methods', () => {
    expect(PaneRight).toBeTruthy();
    expect(typeof PaneRight.bind).toBe('function');
    expect(typeof PaneRight.initRightPaneTabs).toBe('function');
    expect(typeof PaneRight.initPensSection).toBe('function');
  });

  it('initRightPaneTabs throws a clear error before bind()', () => {
    expect(() => PaneRight.initRightPaneTabs.call({})).toThrow(/PaneRight\.initRightPaneTabs invoked before PaneRight\.bind/);
  });

  it('initPensSection throws a clear error before bind()', () => {
    expect(() => PaneRight.initPensSection.call({})).toThrow(/PaneRight\.initPensSection invoked before PaneRight\.bind/);
  });

  it('after bind(deps), methods run without throwing when target elements are absent', () => {
    const doc = dom.window.document;
    PaneRight.bind({
      getEl: (id) => doc.getElementById(id),
    });
    dom.window.Vectura.SETTINGS = {};

    expect(() => PaneRight.initRightPaneTabs.call({})).not.toThrow();
    expect(() => PaneRight.initPensSection.call({})).not.toThrow();
  });

  it('initRightPaneTabs wires click handlers on tab elements and toggles panels', () => {
    const doc = dom.window.document;

    // Build a tab fixture
    const tab1 = doc.createElement('button');
    tab1.className = 'right-pane-tab active';
    tab1.dataset.tab = 'layers';
    doc.body.appendChild(tab1);

    const tab2 = doc.createElement('button');
    tab2.className = 'right-pane-tab';
    tab2.dataset.tab = 'pens';
    doc.body.appendChild(tab2);

    const panel1 = doc.createElement('div');
    panel1.id = 'right-tab-panel-layers';
    doc.body.appendChild(panel1);

    const panel2 = doc.createElement('div');
    panel2.id = 'right-tab-panel-pens';
    doc.body.appendChild(panel2);

    PaneRight.bind({
      getEl: (id) => doc.getElementById(id),
    });

    PaneRight.initRightPaneTabs.call({});

    // Initially layers is active
    expect(tab1.classList.contains('active')).toBe(true);
    expect(tab1.getAttribute('aria-selected')).toBe('true');
    expect(panel1.classList.contains('hidden')).toBe(false);
    expect(panel2.classList.contains('hidden')).toBe(true);

    // Click pens tab
    tab2.click();
    expect(tab2.classList.contains('active')).toBe(true);
    expect(tab1.classList.contains('active')).toBe(false);
    expect(panel2.classList.contains('hidden')).toBe(false);
    expect(panel1.classList.contains('hidden')).toBe(true);

    // Cleanup
    doc.body.removeChild(tab1);
    doc.body.removeChild(tab2);
    doc.body.removeChild(panel1);
    doc.body.removeChild(panel2);
  });

  it('initPensSection toggles collapsed state on header click', () => {
    const doc = dom.window.document;

    const section = doc.createElement('div');
    section.id = 'pens-global-section';
    const header = doc.createElement('div');
    header.id = 'pens-section-header';
    const body = doc.createElement('div');
    body.id = 'pens-section-body';
    doc.body.appendChild(section);
    doc.body.appendChild(header);
    doc.body.appendChild(body);

    PaneRight.bind({
      getEl: (id) => doc.getElementById(id),
    });
    dom.window.Vectura.SETTINGS = {};

    PaneRight.initPensSection.call({});

    // Initially not collapsed
    expect(section.classList.contains('collapsed')).toBe(false);
    expect(body.style.display).toBe('');

    // Click header to collapse
    header.onclick();
    expect(section.classList.contains('collapsed')).toBe(true);
    expect(body.style.display).toBe('none');

    // Click again to expand
    header.onclick();
    expect(section.classList.contains('collapsed')).toBe(false);
    expect(body.style.display).toBe('');

    // Cleanup
    doc.body.removeChild(section);
    doc.body.removeChild(header);
    doc.body.removeChild(body);
  });
});
