/*
 * Compile gate for src/ui/ui-file-io.js (Meridian Unit 1.9b promotion).
 *
 * Verifies:
 *   - the legacy `_UIFileIOMixin` mixin is registered (unchanged contract)
 *   - the new `window.Vectura.UI.FileIO` namespace registers bind +
 *     bindFileIoListeners + installOn (Unit 1.9b canonical install pattern)
 *   - bindFileIoListeners throws a descriptive error before bind()
 *   - after bind(), bindFileIoListeners is a no-op when the target buttons
 *     are not present in the DOM (avoiding a regression where missing
 *     elements would NPE on the legacy code path)
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

describe('ui-file-io compile gate', () => {
  let dom;
  let FileIO;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/core/utils.js',
      'src/ui/ui-file-io.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    FileIO = w.Vectura.UI.FileIO;
  });

  afterAll(() => dom?.window?.close?.());

  it('registers the legacy _UIFileIOMixin namespace (existing contract)', () => {
    expect(dom.window.Vectura._UIFileIOMixin).toBeTruthy();
    expect(typeof dom.window.Vectura._UIFileIOMixin.saveVecturaFile).toBe('function');
    expect(typeof dom.window.Vectura._UIFileIOMixin.openVecturaFile).toBe('function');
    expect(typeof dom.window.Vectura._UIFileIOMixin.importSvgFile).toBe('function');
  });

  it('exposes window.Vectura.UI.FileIO with bind + bindFileIoListeners (Unit 1.9b)', () => {
    expect(FileIO).toBeTruthy();
    expect(typeof FileIO.bind).toBe('function');
    expect(typeof FileIO.bindFileIoListeners).toBe('function');
    expect(typeof FileIO.installOn).toBe('function');
  });

  it('bindFileIoListeners throws a clear error before bind()', () => {
    expect(() => FileIO.bindFileIoListeners.call({}))
      .toThrow(/UIFileIO\.bindFileIoListeners invoked before UIFileIO\.bind/);
  });

  it('installOn registers bindFileIoListeners on the UI prototype', () => {
    const proto = {};
    FileIO.installOn(proto);
    expect(typeof proto.bindFileIoListeners).toBe('function');
  });

  it('after bind(), bindFileIoListeners is a no-op when target buttons are absent', () => {
    FileIO.bind({
      getEl: (id, opts = {}) => dom.window.document.getElementById(id),
    });
    expect(() => FileIO.bindFileIoListeners.call({})).not.toThrow();
  });

  it('after bind(), bindFileIoListeners wires button.onclick when elements are present', () => {
    const doc = dom.window.document;
    // Inject all five elements the installer looks for.
    const ids = ['btn-save-vectura', 'btn-open-vectura', 'btn-import-svg', 'file-open-vectura', 'file-import-svg'];
    ids.forEach((id) => {
      let el = doc.getElementById(id);
      if (!el) {
        el = doc.createElement(id.startsWith('file-') ? 'input' : 'button');
        if (id.startsWith('file-')) el.type = 'file';
        el.id = id;
        doc.body.appendChild(el);
      }
    });

    FileIO.bind({
      getEl: (id) => doc.getElementById(id),
    });

    const calls = [];
    const ctx = {
      saveVecturaFile() { calls.push('save'); },
      openVecturaFile(file) { calls.push(`open:${file?.name || ''}`); },
      importSvgFile(file) { calls.push(`import:${file?.name || ''}`); },
    };
    FileIO.bindFileIoListeners.call(ctx);

    doc.getElementById('btn-save-vectura').click();
    expect(calls).toContain('save');
  });
});
