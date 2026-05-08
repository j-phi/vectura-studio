/*
 * Compile gate for src/ui/modals/document-setup.js (Phase 3 step 3).
 *
 * Verifies the document-setup panel module:
 *   - registers as window.Vectura.UI.Modals.DocumentSetup
 *   - exposes bind() + mount + bindHandlers + PANEL_HTML + PANEL_ID
 *   - throws a clear error if mount/bindHandlers run before bind()
 *   - after bind(), mount() injects #settings-panel into a host element
 *   - mount() is idempotent (re-mount no-ops)
 *   - mount() yields all expected control IDs in the markup
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
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

describe('document-setup panel compile gate', () => {
  let dom;
  let DocumentSetup;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/modals/document-setup.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.Modals).toBeTruthy();
    DocumentSetup = w.Vectura.UI.Modals.DocumentSetup;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Modals.DocumentSetup with bind + mount + bindHandlers', () => {
    expect(DocumentSetup).toBeTruthy();
    expect(typeof DocumentSetup.bind).toBe('function');
    expect(typeof DocumentSetup.mount).toBe('function');
    expect(typeof DocumentSetup.bindHandlers).toBe('function');
    expect(typeof DocumentSetup.PANEL_HTML).toBe('string');
    expect(DocumentSetup.PANEL_ID).toBe('settings-panel');
  });

  it('mount throws a clear error before bind()', () => {
    const host = dom.window.document.createElement('div');
    expect(() => DocumentSetup.mount(host))
      .toThrow(/DocumentSetup\.mount invoked before DocumentSetup\.bind/);
  });

  it('bindHandlers throws a clear error before bind()', () => {
    expect(() => DocumentSetup.bindHandlers.call({}))
      .toThrow(/DocumentSetup\.bindHandlers invoked before DocumentSetup\.bind/);
  });

  it('after bind(), mount() injects the panel with all expected control IDs', () => {
    DocumentSetup.bind({ getEl: (id) => dom.window.document.getElementById(id) });
    const main = dom.window.document.querySelector('main');
    const panel = DocumentSetup.mount(main);
    expect(panel).toBeTruthy();
    expect(panel.id).toBe('settings-panel');
    // Smoke-check a representative subset of the ~30 inputs the panel owns.
    // Every preserved id must remain present so existing JS keeps wiring.
    const expectedIds = [
      'settings-panel',
      'btn-close-settings',
      'machine-profile',
      'set-document-units',
      'set-paper-width',
      'set-paper-height',
      'set-orientation',
      'set-margin',
      'set-truncate',
      'set-crop-exports',
      'set-outside-opacity',
      'set-margin-line',
      'set-margin-line-color-pill',
      'set-margin-line-color',
      'set-margin-line-weight',
      'set-margin-line-weight-slider',
      'set-margin-line-dotting',
      'set-margin-line-style-reset',
      'set-show-guides',
      'set-snap-guides',
      'set-show-document-dimensions',
      'set-cookie-preferences',
      'btn-clear-preferences',
      'set-show-tour',
      'bg-color-pill',
      'inp-bg-color',
      'set-selection-outline',
      'set-selection-outline-color-pill',
      'set-selection-outline-color',
      'set-selection-outline-width',
      'set-selection-outline-width-slider',
      'set-selection-outline-style-reset',
      'set-speed-down',
      'set-speed-up',
      'layer-bar-palette-trigger',
      'layer-bar-palette-name',
      'layer-bar-palette-preview',
      'layer-bar-palette-menu',
      'set-undo',
    ];
    for (const id of expectedIds) {
      expect(dom.window.document.getElementById(id), `missing #${id}`).toBeTruthy();
    }
  });

  it('mount() is idempotent (re-mount no-ops)', () => {
    const main = dom.window.document.querySelector('main');
    const panel1 = DocumentSetup.mount(main);
    const panel2 = DocumentSetup.mount(main);
    expect(panel1).toBe(panel2);
    expect(dom.window.document.querySelectorAll('#settings-panel').length).toBe(1);
  });

  it('PANEL_HTML preserves headline labels and units options', () => {
    expect(DocumentSetup.PANEL_HTML).toContain('DOCUMENT SETUP');
    expect(DocumentSetup.PANEL_HTML).toContain('Paper Size');
    expect(DocumentSetup.PANEL_HTML).toContain('Plotter Physics');
    expect(DocumentSetup.PANEL_HTML).toContain('Layer Bar Colors');
    expect(DocumentSetup.PANEL_HTML).toContain('<option value="metric">');
    expect(DocumentSetup.PANEL_HTML).toContain('<option value="imperial">');
  });
});
