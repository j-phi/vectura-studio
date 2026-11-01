// @vitest-environment jsdom
/*
 * main.js marks the editor as covered (Vectura.bootCover) while the Start Page opens on
 * launch, so the renderer holds back its first paper-texture build. Once the page closes
 * the editor is no longer covered: bootCover must clear, or a later textured paper is
 * still held back after the page is gone (seen in the P4 live check).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MAIN = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');

const boot = (pageOpens) => {
  window.Vectura = {
    App: function App() {
      this.renderer = { ready: true };
      this.render = () => {};
      this.showStartPageOnLaunchIfWanted = () => pageOpens;
    },
    UI: {},
    SETTINGS: {},
  };
  window.eval(MAIN);
  window.dispatchEvent(new Event('load'));
};

describe('main.js boot cover', () => {
  beforeEach(() => { delete window.Vectura; delete window.app; });

  it('stays set while the launch Start Page is open', () => {
    boot(true);
    expect(window.Vectura.bootCover).toBe(true);
  });

  it('clears when the Start Page closes', () => {
    boot(true);
    window.dispatchEvent(new CustomEvent('vectura:start-page-hidden'));
    expect(window.Vectura.bootCover).toBe(false);
  });

  it('is clear at once when the page does not open', () => {
    boot(false);
    expect(window.Vectura.bootCover).toBe(false);
  });
});
