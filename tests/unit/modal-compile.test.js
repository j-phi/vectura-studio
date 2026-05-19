/*
 * Compile gate for src/ui/overlays/modal.js (Meridian Unit 1.7).
 *
 * Verifies the modal primitive module:
 *   - registers as window.Vectura.UI.overlays.Modal (existing Phase 1 primitive)
 *   - ALSO exposes bind() + installOn() — the Unit 1.7 promotion that lifts
 *     the legacy mount wrappers (createModal, openModal, closeModal,
 *     _mountGridSettingsPanel, _mountDocumentSetupPanel) off UI.prototype.
 *   - throws a clear error if installed wrappers run before bind()
 *   - after bind() + installOn(proto):
 *       - proto gains the 5 wrapper methods
 *       - createModal() injects the legacy overlay (#modal-overlay) into document.body
 *       - openModal({ title, body }) toggles .open and populates title/body
 *       - closeModal() removes .open and runs the cleanup callback
 *       - _mountGridSettingsPanel / _mountDocumentSetupPanel forward to their
 *         respective Modals submodules (when present)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

describe('modal overlay compile gate (Unit 1.7)', () => {
  let dom;
  let Modal;

  beforeAll(() => {
    dom = loadInJSDOM(['src/ui/overlays/modal.js']);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    expect(w.Vectura.UI.overlays).toBeTruthy();
    Modal = w.Vectura.UI.overlays.Modal;
  });

  afterAll(() => dom?.window?.close?.());

  it('preserves the Phase 1 primitive — UI.overlays.Modal is callable as a factory', () => {
    // Backwards compatibility: existing callers still get the create() factory.
    expect(typeof Modal).toBe('function');
  });

  it('exposes bind + installOn on the namespace (Unit 1.7)', () => {
    expect(typeof Modal.bind).toBe('function');
    expect(typeof Modal.installOn).toBe('function');
  });

  it('createModal throws a clear error before bind()', () => {
    // Build a fresh proto to test in isolation.
    const proto = {};
    Modal.installOn(proto);
    expect(() => proto.createModal.call({}))
      .toThrow(/Modal\.createModal invoked before Modal\.bind/);
  });

  it('after bind() + installOn(), all 5 wrappers land on the proto', () => {
    Modal.bind({ getEl: (id) => dom.window.document.getElementById(id) });
    const proto = {};
    Modal.installOn(proto);
    expect(typeof proto.createModal).toBe('function');
    expect(typeof proto.openModal).toBe('function');
    expect(typeof proto.closeModal).toBe('function');
    expect(typeof proto._mountGridSettingsPanel).toBe('function');
    expect(typeof proto._mountDocumentSetupPanel).toBe('function');
  });

  it('createModal() injects #modal-overlay into document.body with the expected scaffold', () => {
    const doc = dom.window.document;
    Modal.bind({ getEl: (id) => doc.getElementById(id) });
    const proto = {};
    Modal.installOn(proto);

    // Stash original document on the stub so the function body has access via globalThis.
    const stub = {};
    const result = proto.createModal.call(stub);
    expect(result).toBeTruthy();
    expect(result.overlay).toBeTruthy();
    expect(result.titleEl).toBeTruthy();
    expect(result.bodyEl).toBeTruthy();
    expect(result.overlay.id).toBe('modal-overlay');
    expect(result.overlay.classList.contains('modal-overlay')).toBe(true);
    const card = result.overlay.querySelector('.modal-card');
    expect(card).toBeTruthy();
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(doc.getElementById('modal-overlay')).toBe(result.overlay);
    // Clean up so subsequent tests start fresh.
    result.overlay.remove();
  });

  it('openModal({ title, body }) populates title + body and adds .open; closeModal removes it and fires cleanup', () => {
    const doc = dom.window.document;
    Modal.bind({ getEl: (id) => doc.getElementById(id) });
    const proto = {};
    Modal.installOn(proto);

    const ui = {};
    ui.modal = proto.createModal.call(ui);
    proto.openModal.call(ui, { title: 'Test Modal', body: '<p>hello</p>' });
    expect(ui.modal.titleEl.textContent).toBe('Test Modal');
    expect(ui.modal.bodyEl.innerHTML).toContain('hello');
    expect(ui.modal.overlay.classList.contains('open')).toBe(true);

    let cleanupRan = 0;
    proto.openModal.call(ui, {
      title: 'Second',
      body: doc.createElement('div'),
      onClose: () => { cleanupRan += 1; },
    });
    expect(ui.modal.titleEl.textContent).toBe('Second');

    proto.closeModal.call(ui);
    expect(ui.modal.overlay.classList.contains('open')).toBe(false);
    expect(cleanupRan).toBe(1);
    ui.modal.overlay.remove();
  });

  it('_mountGridSettingsPanel and _mountDocumentSetupPanel forward to the corresponding Modals modules', () => {
    const doc = dom.window.document;
    // Stand up stubs on the namespace.
    const w = dom.window;
    w.Vectura.UI.Modals = w.Vectura.UI.Modals || {};
    let gridHost = null;
    let docHost = null;
    w.Vectura.UI.Modals.GridSettings = {
      mount: (host) => { gridHost = host; return { id: 'grid-settings-panel' }; },
    };
    w.Vectura.UI.Modals.DocumentSetup = {
      mount: (host) => { docHost = host; return { id: 'document-setup-panel' }; },
    };

    Modal.bind({ getEl: (id) => doc.getElementById(id) });
    const proto = {};
    Modal.installOn(proto);

    const stub = {};
    const main = doc.querySelector('main');
    const gridResult = proto._mountGridSettingsPanel.call(stub);
    const docResult = proto._mountDocumentSetupPanel.call(stub);
    expect(gridHost).toBe(main);
    expect(docHost).toBe(main);
    expect(gridResult).toEqual({ id: 'grid-settings-panel' });
    expect(docResult).toEqual({ id: 'document-setup-panel' });
  });
});
