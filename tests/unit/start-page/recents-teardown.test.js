/*
 * A recents refresh that resolves after the page's document is gone (test teardown, a
 * closed window) must not throw. Seen in the P1 integration gate as an unhandled
 * rejection from RecentsController.renderMenu (document undefined).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { makeFakeIdb } = require('../../helpers/fake-indexeddb.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('RecentsController after teardown', () => {
  it('refresh() resolving after document is gone does not reject', async () => {
    const win = {
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
      indexedDB: makeFakeIdb(),
      navigator: { platform: 'MacIntel' },
    };
    win.window = win;
    const ctx = vm.createContext({
      window: win, navigator: win.navigator, structuredClone, JSON, Promise, Map, Set, Date, Math, Error,
      setTimeout, clearTimeout, indexedDB: win.indexedDB,
      document: { getElementById: () => null },
    });
    ['src/config/start-page.js', 'src/core/recents-store.js', 'src/ui/start-page/recents.js'].forEach((rel) => {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
    });
    const ctl = win.Vectura.UI.RecentsController.create({});
    const pending = ctl.refresh();
    vm.runInContext('document = undefined;', ctx);
    await expect(pending).resolves.toBeDefined();
  });
});
