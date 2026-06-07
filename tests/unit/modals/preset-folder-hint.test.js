/*
 * Unit test for the "File System Access unavailable" hint in the Preset Storage
 * section of the Document Setup panel (src/ui/modals/document-setup.js).
 *
 * Folder sync is built entirely on window.showDirectoryPicker. Three browser
 * conditions leave that API absent, each with a different fix:
 *   - file:// page  → serve over http
 *   - Brave         → enable brave://flags/#file-system-access-api + restart
 *                      (Brave ships the API but disables it by default)
 *   - other         → switch to Chrome or Edge
 *
 * The Brave branch is the regression target: before this change Brave users
 * were wrongly told to switch browsers, dead-ending a feature that's one flag
 * toggle away. presetFolderUnsupportedHint() must steer them to the flag.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadInJSDOM = () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  const code = fs.readFileSync(path.join(ROOT, 'src/ui/modals/document-setup.js'), 'utf8');
  vm.runInContext(code, context, { filename: 'src/ui/modals/document-setup.js' });
  return dom;
};

describe('presetFolderUnsupportedHint', () => {
  let dom;
  let DocumentSetup;

  beforeAll(() => {
    dom = loadInJSDOM();
    DocumentSetup = dom.window.Vectura.UI.Modals.DocumentSetup;
  });

  afterAll(() => dom?.window?.close?.());

  it('is exported as a pure function', () => {
    expect(typeof DocumentSetup.presetFolderUnsupportedHint).toBe('function');
    expect(typeof DocumentSetup.isBraveBrowser).toBe('function');
  });

  it('Brave: points at the brave://flags toggle, NOT "needs Chrome or Edge"', () => {
    const html = DocumentSetup.presetFolderUnsupportedHint({ onFile: false, isBrave: true });
    expect(html).toContain('brave://flags/#file-system-access-api');
    expect(html).toContain('restart Brave');
    // The regression: Brave users must not be told to switch browsers.
    expect(html).not.toContain('needs Chrome or Edge');
  });

  it('file:// takes precedence over Brave (API absent on file:// regardless)', () => {
    const html = DocumentSetup.presetFolderUnsupportedHint({ onFile: true, isBrave: true });
    expect(html).toContain('file://');
    expect(html).toContain('python -m http.server');
    expect(html).not.toContain('brave://flags');
  });

  it('plain unsupported browser: tells the user to use Chrome or Edge', () => {
    const html = DocumentSetup.presetFolderUnsupportedHint({ onFile: false, isBrave: false });
    expect(html).toContain('needs Chrome or Edge');
    expect(html).not.toContain('brave://flags');
  });

  it('default-arg call does not throw (defensive)', () => {
    expect(() => DocumentSetup.presetFolderUnsupportedHint()).not.toThrow();
  });

  it('isBraveBrowser detects navigator.brave presence', () => {
    // No navigator.brave in plain JSDOM → false.
    expect(DocumentSetup.isBraveBrowser()).toBe(false);
    // Simulate Brave's exposed object.
    dom.window.navigator.brave = { isBrave: () => Promise.resolve(true) };
    expect(DocumentSetup.isBraveBrowser()).toBe(true);
    delete dom.window.navigator.brave;
  });
});
