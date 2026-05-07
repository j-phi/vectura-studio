/*
 * Compile gate for src/ui/_ui-orchestrator.js (Phase 2 step 5c blueprint).
 *
 * The orchestrator is intentionally NOT loaded by index.html during step
 * 5; this test only confirms the blueprint parses cleanly in JSDOM,
 * registers window.Vectura.UI.Orchestrator, and refuses to construct
 * (so step 6 has a clear runtime signal that the swap-in is incomplete).
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

describe('ui-orchestrator blueprint compile gate', () => {
  let dom;
  let Orchestrator;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/ui/_ui-orchestrator.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    Orchestrator = w.Vectura.UI.Orchestrator;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.Orchestrator as a class', () => {
    expect(Orchestrator).toBeTruthy();
    expect(typeof Orchestrator).toBe('function');
  });

  it('refuses to construct with a clear "blueprint" error', () => {
    expect(() => new Orchestrator({}))
      .toThrow(/blueprint and not yet wired up/);
  });
});
