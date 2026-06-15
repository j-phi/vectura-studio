/*
 * Preset Storage panel — renderPresetStorageUi() copy + layout contract.
 *
 * The panel must make LIVE FOLDER SYNC the headline action and demote the
 * Export/Import bundle flow to a secondary row. The fallback message must
 * distinguish *why* folder sync is unavailable:
 *   - on a file:// page (any browser) → tell the user to serve over http
 *   - on http but a non-Chromium browser → tell the user to use Chrome/Edge
 *
 * renderPresetStorageUi() is exposed on Vectura.UI.Modals.DocumentSetup and
 * the fallback path is synchronous, so we can drive it directly with a stubbed
 * PresetFolderStore and assert the rendered markup.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Boot a JSDOM at the given URL, load document-setup.js, mount the panel, and
// install a stubbed PresetFolderStore. Returns { dom, host, DocumentSetup }.
const boot = (url, storeStub) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    url,
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  const code = fs.readFileSync(path.join(ROOT, 'src/ui/modals/document-setup.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'document-setup.js' });
  const w = dom.window;
  w.Vectura.PresetFolderStore = storeStub;
  const DocumentSetup = w.Vectura.UI.Modals.DocumentSetup;
  DocumentSetup.bind({ getEl: (id) => w.document.getElementById(id) });
  DocumentSetup.mount(w.document.querySelector('main'));
  return { dom, w, DocumentSetup };
};

const renderInto = (url, storeStub) => {
  const { dom, w, DocumentSetup } = boot(url, storeStub);
  DocumentSetup.renderPresetStorageUi.call({});
  const host = w.document.getElementById('preset-storage-body');
  return { dom, host };
};

describe('Preset Storage panel — renderPresetStorageUi()', () => {
  it('on a file:// page, the fallback steers the user to serve over http (not "Chrome or Edge")', () => {
    const { dom, host } = renderInto('file:///Users/x/vectura-studio/index.html', {
      isSupported: () => false,
    });
    const folder = host.querySelector('#preset-storage-folder');
    expect(folder).toBeTruthy();
    const text = folder.textContent.toLowerCase();
    // The fix: steer to serving over http, rather than (mis)blaming the browser.
    expect(text).toContain('http');
    expect(text).toContain('localhost');
    expect(text).toContain('file://');
    dom.window.close();
  });

  it('on http with an unsupported browser, the fallback names Chrome/Edge', () => {
    const { dom, host } = renderInto('http://localhost:8000/', {
      isSupported: () => false,
    });
    const text = host.querySelector('#preset-storage-folder').textContent.toLowerCase();
    expect(text).toContain('chrome or edge');
    expect(text).not.toContain('localhost');
    dom.window.close();
  });

  it('export/import is demoted to a secondary row (still present in every context)', () => {
    const { dom, host } = renderInto('file:///x/index.html', { isSupported: () => false });
    expect(host.querySelector('.preset-storage-secondary')).toBeTruthy();
    expect(host.querySelector('#btn-preset-export')).toBeTruthy();
    expect(host.querySelector('#btn-preset-import')).toBeTruthy();
    dom.window.close();
  });

  it('when supported and disconnected, the headline action is "Sync to a folder…"', () => {
    const { dom, host } = renderInto('http://localhost:8000/', {
      isSupported: () => true,
      getStatus: () => Promise.resolve({ connected: false, name: null, permission: null }),
    });
    // getStatus resolves async; the connect button is rendered in the .then().
    return Promise.resolve().then(() => {
      const btn = host.querySelector('#btn-folder-connect');
      expect(btn).toBeTruthy();
      expect(btn.textContent).toMatch(/sync to a folder/i);
      // The headline folder section precedes the secondary export/import row.
      const folder = host.querySelector('#preset-storage-folder');
      const secondary = host.querySelector('.preset-storage-secondary');
      expect(folder.compareDocumentPosition(secondary) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
      dom.window.close();
    });
  });
});
